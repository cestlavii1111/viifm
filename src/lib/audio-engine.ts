"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Single shared AudioContext for the whole experience.
 * Created lazily — call getAudioContext() from inside a user-gesture
 * handler (the "Enter" button) so browsers don't block it.
 */
let sharedCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    // "playback" tells the browser this doesn't need low input-to-output
    // latency (there's no instrument or live input to respond to here) and
    // to prioritize a larger, more stable internal buffer instead. The
    // default "interactive" hint optimizes for the opposite trade-off —
    // small buffers for responsiveness — which leaves much less headroom
    // before a busy main thread (this room renders a full shader-driven
    // tunnel plus Bloom post-processing every frame) causes an audible
    // underrun: a brief dropout the audio clock then has to "catch up"
    // from, heard as a choppy stutter or a momentary speed/pitch wobble.
    // Nothing here needs sub-20ms latency, so there's no downside to
    // asking for the steadier buffer.
    sharedCtx = new Ctx({ latencyHint: "playback" });
  }
  if (sharedCtx.state === "suspended") {
    void sharedCtx.resume();
  }
  return sharedCtx;
}

// Decoded-audio cache, keyed by resolved URL, so switching back to a track
// already played doesn't re-fetch or re-decode it. Decoding (not just
// fetching) up front is the actual point: a fully-decoded AudioBuffer
// played through an AudioBufferSourceNode loops sample-accurately, with
// none of the small re-decode gap an HTML <audio> element leaves at the
// loop point on an MP3 (its encoder/decoder frame padding means "loop"
// never quite lines back up seamlessly) — that gap is what was reading as
// an occasional choppy/clipped hiccup. It also removes the file's ongoing
// network/decode pipeline entirely from the picture once loaded, which is
// the other thing that pipeline could stutter on under load.
const bufferCache = new Map<string, Promise<AudioBuffer>>();

function loadBuffer(ctx: AudioContext, src: string): Promise<AudioBuffer> {
  const resolved = new URL(src, window.location.href).href;
  let pending = bufferCache.get(resolved);
  if (!pending) {
    pending = fetch(resolved)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data));
    bufferCache.set(resolved, pending);
    // Don't cache a failed attempt — let a later play() retry instead of
    // permanently treating one transient network blip as this track being
    // broken for the rest of the session.
    pending.catch(() => bufferCache.delete(resolved));
  }
  return pending;
}

/**
 * Call this synchronously inside the real user-gesture handler (the
 * "Enter" click) for whichever track loads first. Kicks off that track's
 * fetch + decode as early as possible so the first real play() has a head
 * start rather than starting cold — decoding a multi-megabyte MP3 can take
 * a noticeable moment, and doing that work while the visitor is still
 * looking at the landing gate is free.
 *
 * (An older version of this function primed an HTMLMediaElement's
 * autoplay gate instead — Safari silently drops a `.play()` call that
 * isn't in the same call stack as the gesture that triggered it. Now that
 * playback goes through raw AudioBufferSourceNodes there's no such gate:
 * starting a buffer source only needs the AudioContext to be running,
 * which getAudioContext() above already resumes synchronously from this
 * same click.)
 */
export function primeAudioPlayback(src: string) {
  const ctx = getAudioContext();
  void loadBuffer(ctx, src).catch(() => undefined);
}

interface SynthVoice {
  oscillators: OscillatorNode[];
  filter: BiquadFilterNode;
  pulseGain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
}

// How long the gain ramp takes when starting/stopping a track — kept in
// one place since the "pause" path below needs to wait this long before
// actually tearing down the playing source (see stopSourceAfterFade).
const TRACK_FADE_SECONDS = 0.4;

/**
 * Drives the audio graph for the currently loaded track and exposes the
 * shared AnalyserNode so visual scenes can read frequency data in their
 * render loop.
 *
 * - If a track src is given, its fully-decoded AudioBuffer is played
 *   through a fresh AudioBufferSourceNode each time (a source node can
 *   only ever be started once — see stopCurrentSource for how pause/
 *   resume and track-switching work around that). Each track plays once
 *   (no looping) and calls the optional onTrackEnd callback when it
 *   finishes naturally, so the caller can advance to the next track in the
 *   playlist instead of the same one repeating forever.
 * - If not, a generative ambient pad (a few detuned oscillators through a
 *   slow-sweeping filter, plus a soft sub pulse) fills in so the room is
 *   still audio-reactive before there's a track loaded.
 */
export function useAudioEngine(
  audioSrc: string | undefined,
  isPlaying: boolean,
  volume: number,
  onTrackEnd?: () => void
) {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  // Always call the latest onTrackEnd from inside the source's `onended`
  // handler without needing to re-run the track-switching effect (and
  // therefore re-subscribe) every time the caller passes a fresh function
  // reference.
  const onTrackEndRef = useRef(onTrackEnd);
  onTrackEndRef.current = onTrackEnd;

  const masterGainRef = useRef<GainNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const synthRef = useRef<SynthVoice | null>(null);
  const synthGainRef = useRef<GainNode | null>(null);

  // Buffer-source playback bookkeeping for the current track. An
  // AudioBufferSourceNode has no pause/resume of its own — once stopped it
  // can't be restarted — so "pausing" means stopping it while remembering
  // how far in we were (offsetRef), and "resuming" means creating a fresh
  // node and starting it at that remembered offset.
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentSrcRef = useRef<string | undefined>(undefined);
  const offsetRef = useRef(0);
  const startedAtRef = useRef(0);
  const pendingStopRef = useRef<number | undefined>(undefined);
  // AudioBufferSourceNode fires `ended` both when a track finishes playing
  // out naturally AND when we call .stop() on it ourselves (pausing,
  // switching tracks, or unmounting). Only the former should advance to
  // the next track — this flag is set right before every deliberate
  // .stop() so the handler can tell the two apart.
  const intentionalStopRef = useRef(false);

  // --- one-time graph setup -------------------------------------------------
  useEffect(() => {
    const ctx = getAudioContext();

    const masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.82;

    masterGain.connect(analyserNode);
    analyserNode.connect(ctx.destination);
    masterGainRef.current = masterGain;
    setAnalyser(analyserNode);

    const audioGain = ctx.createGain();
    audioGain.gain.value = 0;
    audioGain.connect(masterGain);
    audioGainRef.current = audioGain;

    const synthGain = ctx.createGain();
    synthGain.gain.value = 0;
    synthGainRef.current = synthGain;
    synthGain.connect(masterGain);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.6;
    filter.connect(synthGain);

    const freqs = [55, 55.5, 82.4, 110.2];
    const oscillators = freqs.map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? "sawtooth" : "sine";
      osc.frequency.value = f;
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0.18 / freqs.length;
      osc.connect(voiceGain);
      voiceGain.connect(filter);
      osc.start();
      return osc;
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 500;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 1;

    synthRef.current = { oscillators, filter, pulseGain, lfo, lfoGain };

    // slow pulse so the synth pad still has movement for visuals to grab onto
    let pulseTimer: number | undefined;
    const schedulePulse = () => {
      const now = ctx.currentTime;
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setTargetAtTime(1400, now, 0.4);
      filter.frequency.setTargetAtTime(700, now + 1.2, 0.9);
      pulseTimer = window.setTimeout(schedulePulse, 2600);
    };
    schedulePulse();

    return () => {
      if (pulseTimer) window.clearTimeout(pulseTimer);
      if (pendingStopRef.current) window.clearTimeout(pendingStopRef.current);
      oscillators.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      try {
        lfo.stop();
      } catch {
        /* already stopped */
      }
      if (sourceRef.current) {
        intentionalStopRef.current = true;
        try {
          sourceRef.current.stop();
        } catch {
          /* already stopped */
        }
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      masterGain.disconnect();
      analyserNode.disconnect();
      audioGain.disconnect();
      synthGain.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- react to volume changes ----------------------------------------------
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(
        volume,
        getAudioContext().currentTime,
        0.05
      );
    }
  }, [volume]);

  // --- react to the active track: switch between track and synth pad -------
  useEffect(() => {
    const ctx = getAudioContext();
    const audioGain = audioGainRef.current;
    const synthGain = synthGainRef.current;
    if (!audioGain || !synthGain) return;

    // Actually tears the currently-playing source down, banking how far
    // into the track it had gotten so a later resume picks up from there
    // instead of restarting at 0. Cancels any fade-out-then-stop that was
    // already pending (see the isPlaying=false branch below) so this never
    // double-stops a node that's already gone.
    const stopCurrentSource = () => {
      if (pendingStopRef.current) {
        window.clearTimeout(pendingStopRef.current);
        pendingStopRef.current = undefined;
      }
      const source = sourceRef.current;
      if (source) {
        offsetRef.current += ctx.currentTime - startedAtRef.current;
        intentionalStopRef.current = true;
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
        source.disconnect();
        sourceRef.current = null;
      }
    };

    const usingTrack = Boolean(audioSrc);
    let cancelled = false;

    if (usingTrack) {
      synthGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);

      if (currentSrcRef.current !== audioSrc) {
        // Switching tracks — whatever was playing is now the wrong file,
        // so there's nothing to preserve position for.
        stopCurrentSource();
        offsetRef.current = 0;
        currentSrcRef.current = audioSrc;
      }

      if (isPlaying) {
        // A pause-then-quick-resume before the fade-out below finished
        // tearing the node down means it's still playing — just cancel
        // that pending stop and ramp the gain back up, rather than
        // restarting the buffer from a recomputed offset for no reason.
        if (pendingStopRef.current) {
          window.clearTimeout(pendingStopRef.current);
          pendingStopRef.current = undefined;
        }
        if (!sourceRef.current) {
          void loadBuffer(ctx, audioSrc!).then((buffer) => {
            // Stale by the time it resolved — the track or play state
            // changed again while this was decoding.
            if (cancelled || currentSrcRef.current !== audioSrc || sourceRef.current) return;
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            // Play through once and advance to the next track rather than
            // looping the same one forever. `ended` also fires for our own
            // deliberate .stop() calls (pause, track switch, unmount) —
            // intentionalStopRef distinguishes those from a real, natural
            // end-of-track so only the latter calls onTrackEnd.
            source.loop = false;
            source.onended = () => {
              if (intentionalStopRef.current) {
                intentionalStopRef.current = false;
                return;
              }
              if (sourceRef.current === source) {
                sourceRef.current = null;
              }
              offsetRef.current = 0;
              onTrackEndRef.current?.();
            };
            source.connect(audioGain);
            const offset = buffer.duration > 0 ? offsetRef.current % buffer.duration : 0;
            source.start(0, offset);
            startedAtRef.current = ctx.currentTime;
            sourceRef.current = source;
          });
        }
        audioGain.gain.setTargetAtTime(1, ctx.currentTime, TRACK_FADE_SECONDS);
      } else {
        audioGain.gain.setTargetAtTime(0, ctx.currentTime, TRACK_FADE_SECONDS);
        // Wait for the fade to actually finish before stopping the node —
        // stopping it immediately would cut the tail of that fade off as
        // an audible click instead of a smooth silence.
        if (sourceRef.current && !pendingStopRef.current) {
          pendingStopRef.current = window.setTimeout(() => {
            pendingStopRef.current = undefined;
            stopCurrentSource();
          }, TRACK_FADE_SECONDS * 1000 * 3);
        }
      }
    } else {
      stopCurrentSource();
      currentSrcRef.current = undefined;
      offsetRef.current = 0;
      audioGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      synthGain.gain.setTargetAtTime(isPlaying ? 1 : 0, ctx.currentTime, 0.6);
    }

    return () => {
      cancelled = true;
    };
  }, [audioSrc, isPlaying]);

  return { analyser };
}

export interface FrequencyBands {
  bass: number;
  mid: number;
  treble: number;
  overall: number;
}

/**
 * Call once per scene and reuse the returned Uint8Array across frames to
 * avoid allocating garbage inside useFrame.
 */
export function createFrequencyBuffer(
  analyser: AnalyserNode
): Uint8Array<ArrayBuffer> {
  return new Uint8Array(analyser.frequencyBinCount);
}

/** Reads normalized (0..1) low/mid/high energy for the current frame. */
export function readFrequencyBands(
  analyser: AnalyserNode,
  buffer: Uint8Array<ArrayBuffer>
): FrequencyBands {
  analyser.getByteFrequencyData(buffer);
  const n = buffer.length;
  const bassEnd = Math.max(1, Math.floor(n * 0.15));
  const midEnd = Math.max(bassEnd + 1, Math.floor(n * 0.5));

  let bassSum = 0;
  for (let i = 0; i < bassEnd; i++) bassSum += buffer[i];
  let midSum = 0;
  for (let i = bassEnd; i < midEnd; i++) midSum += buffer[i];
  let trebleSum = 0;
  for (let i = midEnd; i < n; i++) trebleSum += buffer[i];
  let totalSum = 0;
  for (let i = 0; i < n; i++) totalSum += buffer[i];

  return {
    bass: bassSum / bassEnd / 255,
    mid: midSum / (midEnd - bassEnd) / 255,
    treble: trebleSum / (n - midEnd || 1) / 255,
    overall: totalSum / n / 255,
  };
}

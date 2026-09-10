"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "@/types/room";

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
    sharedCtx = new Ctx();
  }
  if (sharedCtx.state === "suspended") {
    void sharedCtx.resume();
  }
  return sharedCtx;
}

interface SynthVoice {
  oscillators: OscillatorNode[];
  filter: BiquadFilterNode;
  pulseGain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
}

/**
 * Drives the audio graph for the currently active room and exposes the
 * shared AnalyserNode so visual scenes can read frequency data in their
 * render loop.
 *
 * - If the room has an audioSrc, a single persistent <audio> element is
 *   routed through the analyser.
 * - If not, a generative ambient pad (a few detuned oscillators through a
 *   slow-sweeping filter, plus a soft sub pulse) fills in so every room is
 *   audio-reactive even before you have a final track.
 */
export function useAudioEngine(
  room: Room,
  isPlaying: boolean,
  volume: number
) {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const masterGainRef = useRef<GainNode | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const synthRef = useRef<SynthVoice | null>(null);
  const synthGainRef = useRef<GainNode | null>(null);
  const currentSrcRef = useRef<string | undefined>(undefined);

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

    const audioEl = new Audio();
    audioEl.loop = true;
    audioEl.crossOrigin = "anonymous";
    audioElRef.current = audioEl;
    const audioGain = ctx.createGain();
    audioGain.gain.value = 0;
    audioGainRef.current = audioGain;
    const source = ctx.createMediaElementSource(audioEl);
    audioSourceRef.current = source;
    source.connect(audioGain);
    audioGain.connect(masterGain);

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
      audioEl.pause();
      audioEl.src = "";
      masterGain.disconnect();
      analyserNode.disconnect();
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

  // --- react to the active room: switch between track and synth pad --------
  useEffect(() => {
    const ctx = getAudioContext();
    const audioEl = audioElRef.current;
    const audioGain = audioGainRef.current;
    const synthGain = synthGainRef.current;
    if (!audioEl || !audioGain || !synthGain) return;

    const usingTrack = Boolean(room.audioSrc);

    if (usingTrack && currentSrcRef.current !== room.audioSrc) {
      currentSrcRef.current = room.audioSrc;
      audioEl.src = room.audioSrc!;
    }

    const now = ctx.currentTime;
    if (usingTrack) {
      audioGain.gain.setTargetAtTime(isPlaying ? 1 : 0, now, 0.4);
      synthGain.gain.setTargetAtTime(0, now, 0.4);
      if (isPlaying) void audioEl.play().catch(() => undefined);
      else audioEl.pause();
    } else {
      audioGain.gain.setTargetAtTime(0, now, 0.4);
      synthGain.gain.setTargetAtTime(isPlaying ? 1 : 0, now, 0.6);
      audioEl.pause();
    }
  }, [room, isPlaying]);

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

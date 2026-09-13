import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "vii.fm — cinema for your ears",
  description:
    "An audio-visual digital garden: an evolving installation space of interactive rooms, each its own performance.",
  // iPhone/iPad Safari has no Fullscreen API for arbitrary page elements —
  // there's no JS call that can hide its browser chrome the way
  // requestFullscreen() does on desktop and on Android Chrome, which is
  // why the in-room fullscreen button (see use-fullscreen.ts) doesn't show
  // there. The one real chrome-less mode iOS does offer is launching from
  // an icon added to the Home Screen: appleWebApp below is what makes that
  // launch open as a true standalone, no-browser-UI window instead of a
  // normal Safari tab.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "vii.fm",
  },
};

// With no viewport meta at all (the previous state of this file), mobile
// Safari falls back to its ~980px desktop-site layout viewport and then
// zooms the whole page down to fit — which is what actually produced the
// "letterboxing": the page (and the WebGL canvas inside it) was rendering
// at the wrong logical size and being scaled, not filling the real device
// viewport. viewportFit: "cover" additionally lets the room draw underneath
// the iPhone's notch/home-indicator safe areas instead of leaving black
// bars there, and locking the scale stops an accidental pinch/double-tap
// zoom from ever reintroducing letterboxing later.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full min-h-full overflow-hidden bg-black">
        {children}
      </body>
    </html>
  );
}

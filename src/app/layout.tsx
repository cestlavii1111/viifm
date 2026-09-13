import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "vii.fm — cinema for your ears",
  description:
    "An audio-visual digital garden: an evolving installation space of interactive rooms, each its own performance.",
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

import type { Metadata, Viewport } from "next";
// A square, pixel-grid "dot matrix" display face — used for headline text
// across the whole site (not just the Listening Room), so it reads as one
// consistent brand mark wherever it shows up (see the .font-headline
// utility in globals.css, which references it by name).
//
// Self-hosted via @fontsource rather than next/font/google: next/font
// fetches the font file from Google Fonts at build time, which fails in
// network environments that block fonts.googleapis.com/fonts.gstatic.com
// (this sandbox's build proxy included) — @fontsource ships the actual
// woff2 files inside the npm package itself, so there's no such runtime
// dependency on Google's servers either at build or at request time.
import "@fontsource/dotgothic16/latin-400.css";
import "./globals.css";

// Site-wide defaults — the Listening Room overrides these with its own
// metadata (see src/app/listening-room/layout.tsx) since it wants a more
// specific title and a locked, no-zoom viewport that would be wrong for
// ordinary pages like Gallery and Contact.
export const metadata: Metadata = {
  title: "vii.fm",
  description:
    "A digital garden: an evolving installation space of interactive rooms, each its own performance.",
};

// Normal, scrollable, pinch-zoomable viewport for the general site. The
// Listening Room's own layout overrides this with a locked-scale,
// safe-area-aware viewport scoped to just that route.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen bg-black text-white">{children}</body>
    </html>
  );
}

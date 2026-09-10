import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "vii.fm — a cinema for your ears",
  description:
    "An audio-visual digital garden: an evolving installation space of interactive rooms, each its own performance.",
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

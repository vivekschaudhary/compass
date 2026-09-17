import type { Metadata } from "next";
import "./globals.css";

// The root shell. Everything the app renders is under /v2, whose own layout brings the design system.
//
// No `next/font` here. v1 loaded Inter and JetBrains Mono as CSS variables consumed by its Tailwind
// theme; v2 takes its faces from Organic's own `@import` (Figtree, Caprasimo) — see v2/layout.tsx for
// why those are vendored rather than self-hosted.

export const metadata: Metadata = {
  title: "Compass — delivery control tower",
  description: "The delivery control tower for the AI workforce.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-full" suppressHydrationWarning>{children}</body>
    </html>
  );
}

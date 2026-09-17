import type { Metadata } from "next";

// Where style lives, and the one rule: LOOK is only ever defined in a stylesheet, never at a call site.
// `organic.css` is the design system, vendored verbatim and never edited, so it can be re-exported from
// the design project and dropped back in without a merge. `compass.css` is every class we add on top,
// including each component's own layout — a job card's flex and gap are part of the card, not something
// a caller should have to remember.
//
// Page COMPOSITION is Tailwind. "These three cards sit in three columns" is not a component and
// inventing a class name for it helps nobody.
//
// THE IMPORT ORDER IS LOAD-BEARING. globals.css brings Tailwind, and with it Preflight — a CSS reset.
// It must be emitted before organic.css, or the reset lands on top of Organic and puts its element
// styles back to Tailwind's defaults; the build still compiles when that happens. These three were
// once split across a root and a nested layout, and the order held because root CSS is emitted first.
// In one layout, import order is what holds it.
import "./globals.css";
import "./organic.css";
import "./compass.css";

// Fonts come from Organic's own `@import`, not from next/font. That is deliberate: the token sheet
// names the families literally ("Caprasimo", "Figtree") and next/font generates hashed family names
// those tokens could not resolve. Vendoring verbatim is worth more here than self-hosting; if the
// external request becomes a problem, the fix is to self-host the two faces under the same family
// names rather than to edit the vendored file.

export const metadata: Metadata = {
  title: "Compass — delivery control tower",
  description: "The delivery control tower for the AI workforce.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-full" suppressHydrationWarning>
        <div className="compass">
          {/* The rail's collapsed state, applied before first paint. Read in an inline script rather
              than in an effect because an effect runs after the browser has already drawn: the rail
              would render open and snap shut on every navigation, which reads as a glitch rather
              than as a remembered preference. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `try{if(localStorage.getItem("compass-rail")==="collapsed")document.documentElement.classList.add("rail-collapsed")}catch(e){}`,
            }}
          />
          {children}
        </div>
      </body>
    </html>
  );
}

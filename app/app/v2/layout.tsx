// The v2 subtree.
//
// The app. It was built alongside v1 rather than replacing it, which is why it lives under /v2.
//
// Where style lives, and the one rule: LOOK is only ever defined in a stylesheet, never at a call
// site. `organic.css` is the design system, vendored verbatim and never edited, so it can be
// re-exported from the design project and dropped back in without a merge. `compass.css` is every
// class we add on top, including each component's own layout — a job card's flex and gap are part
// of the card, not something a caller should have to remember.
//
// Page COMPOSITION is Tailwind. "These three cards sit in three columns" is not a component and
// inventing a class name for it helps nobody.
//
// Tailwind itself is imported by the ROOT layout's globals.css, and deliberately not from here. It
// brings Preflight, a CSS reset: root CSS is emitted first, so the reset lands before Organic. Imported
// below, it would land after organic.css and reset Organic's element styles — and still compile. An
// earlier note here said the import would "move here at cutover"; it was checked at cutover and
// that would have been the bug. See the note at the top of globals.css.
//
// Fonts come from Organic's own `@import`, not from next/font. That is deliberate: the token sheet
// names the families literally ("Caprasimo", "Figtree") and next/font generates hashed family
// names those tokens could not resolve. Vendoring verbatim is worth more here than self-hosting;
// if the external request becomes a problem, the fix is to self-host the two faces under the same
// family names rather than to edit the vendored file.

import "./organic.css";
import "./compass.css";

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="v2">
      {/* The rail's collapsed state, applied before first paint. Read in an inline script rather
          than in an effect because an effect runs after the browser has already drawn: the rail
          would render open and snap shut on every navigation, which reads as a glitch rather than
          as a remembered preference. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(localStorage.getItem("compass-rail")==="collapsed")document.documentElement.classList.add("rail-collapsed")}catch(e){}`,
        }}
      />
      {children}
    </div>
  );
}

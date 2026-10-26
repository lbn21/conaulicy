import localFont from "next/font/local";

// Atkinson Hyperlegible Next, self-hosted from assets/fonts (hashed, cached
// for good). One file per weight, subset to Latin-1 + Latin Extended-A by
// scripts/subset-fonts.sh: every Polish letter in two requests (~25 KB). A
// character outside the subset falls back per glyph. No generated fallback:
// the metric-matched "Atkinson Fallback" lives in tokens.css.
//
// display "optional": a font that misses the first ~100 ms is not swapped
// in on that page view (the next one has it cached). The fallback matches
// on average, but a single line can still be a few pixels wider or narrower,
// so a breadcrumb or a heading near the edge wraps differently: a late swap
// moved /adres/<id>/smieci by 0.21 at 375px (task 141, scripts/check-fonts.mjs).

export const atkinson = localFont({
  src: [
    {
      path: "../assets/fonts/atkinson-hyperlegible-next-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../assets/fonts/atkinson-hyperlegible-next-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  display: "optional",
  adjustFontFallback: false,
  variable: "--font-atkinson",
});

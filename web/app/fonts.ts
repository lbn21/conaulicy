import localFont from "next/font/local";

// Atkinson Hyperlegible Next, self-hosted from assets/fonts (hashed, cached
// for good). One file per weight, subset to Latin-1 + Latin Extended-A by
// scripts/subset-fonts.sh: every Polish letter in two requests (~25 KB). A
// character outside the subset falls back per glyph. No generated fallback:
// the metric-matched "Atkinson Fallback" lives in tokens.css.

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
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-atkinson",
});

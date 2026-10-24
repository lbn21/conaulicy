import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/share";
import { BACKGROUND_COLOR, THEME_COLOR } from "@/lib/theme";

// Icons: the flat "ul." plate (PLATE_COLOUR) on a white tile, drawn from the
// palette by scripts/brand-assets.ts (not in git).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} – wywóz śmieci w Lubaczowie i gminie`,
    short_name: SITE_NAME,
    lang: "pl",
    start_url: "/",
    display: "standalone",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

import type { MetadataRoute } from "next";
import { LANG } from "@/lib/locale";
import { SITE_NAME } from "@/lib/share";
import { BACKGROUND_COLOR, THEME_COLOR } from "@/lib/theme";

// Icons: the tab icon's square plate with its white rim (192, 512) and a
// full-bleed plate for launchers that mask (maskable 512), drawn from the
// palette by scripts/brand-assets.ts (not in git). id and scope "/": the
// app's identity stays the same if start_url ever changes.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${SITE_NAME} – Twoja ulica w Lubaczowie i gminie`,
    short_name: SITE_NAME,
    lang: LANG,
    start_url: "/",
    scope: "/",
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

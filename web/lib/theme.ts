// Colours needed outside CSS (theme-color, the web app manifest, the PDF).
// GOV.UK's template sets theme-color to its header's colour; ours is the
// header bar's (HEADER in lib/palette.ts), which the PDF's band uses too. The
// page body is GOV.UK white.
import { GOVUK_FUNCTIONAL } from "./govuk-colours.ts";
import { HEADER } from "./palette.ts";

export const THEME_COLOR = HEADER;
export const BACKGROUND_COLOR = GOVUK_FUNCTIONAL["body-background"];

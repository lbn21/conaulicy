// GOV.UK Frontend 6.5.1's own colours, for what is drawn outside its Sass:
// the PDF, the web app manifest and the contrast check. Its brand-blue roles
// are ours instead (ROLES in lib/palette.ts). Values as govuk-colour() gives
// them; the Sass uses GOV.UK's own.
export const GOVUK_COLOUR = {
  black: "#0b0c0c",
  "black-tint-25": "#484949",
  "black-tint-80": "#cecece",
  "black-tint-95": "#f3f3f3",
  white: "#ffffff",
  red: "#ca3535",
  green: "#0f7a52",
  "green-shade-25": "#0b5c3e",
  yellow: "#ffdd00",
};

const C = GOVUK_COLOUR;

/** GOV.UK's functional colours (govuk-functional-colour()), apart from ours. */
export const GOVUK_FUNCTIONAL = {
  text: C.black,
  "secondary-text": C["black-tint-25"],
  "inverse-text": C.white,
  "link-active": C.black,
  border: C["black-tint-80"],
  "input-border": C.black,
  "body-background": C.white,
  focus: C.yellow,
  "focus-text": C.black,
  error: C.red,
  success: C.green,
  hover: C["black-tint-80"],
  "surface-text": C.black,
  button: C.green,
  "button-hover": C["green-shade-25"],
  "secondary-button": C["black-tint-95"],
};

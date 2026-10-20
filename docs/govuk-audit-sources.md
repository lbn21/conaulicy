# GOV.UK audit: sources read

Task 25, read on 2026-10-20. The scope is narrowed to foundations, forms and buttons (see the brief), so only these pages were read in full. Specs were measured from **GOV.UK Frontend v6.5.1**, the newest release more than two weeks old; 6.6.0 came out on 2026-10-15. Source links point at the `v6.5.1` tag.

## GOV.UK Design System: styles
| URL | What it's for |
|---|---|
| https://design-system.service.gov.uk/styles/ | Index of styles |
| https://design-system.service.gov.uk/styles/layout/ | Two-thirds layout, width container, main wrapper, 75 characters per line |
| https://design-system.service.gov.uk/styles/spacing/ | Responsive and static spacing scales (tablet breakpoint 640px) |
| https://design-system.service.gov.uk/styles/type-scale/ | Type scale; v6 outputs rem; large-screen sizes above 640px |
| https://design-system.service.gov.uk/styles/paragraphs/ | Body text is 19px; lead and small paragraphs |
| https://design-system.service.gov.uk/styles/headings/ | Heading sizes and captions |
| https://design-system.service.gov.uk/styles/links/ | Link states, links without a visited state, no new tabs, no external-link icon |
| https://design-system.service.gov.uk/styles/colour/ | Functional colours as roles; "Do not copy the specific hexadecimal (hex) colour values" |
| https://design-system.service.gov.uk/styles/typeface/ | GDS Transport only on service.gov.uk |
| https://design-system.service.gov.uk/styles/page-template/ | Template: skip link, header, main, footer |
| https://design-system.service.gov.uk/get-started/focus-states/ | Yellow + black focus: link style, form input style, why both colours |

## GOV.UK Design System: components and patterns in scope
| URL | What it's for |
|---|---|
| https://design-system.service.gov.uk/components/button/ | Default, secondary, warning and start buttons; disabled guidance |
| https://design-system.service.gov.uk/components/text-input/ | Labels above inputs, no placeholder, fixed and fluid widths |
| https://design-system.service.gov.uk/components/error-message/ | Hidden "Error:" prefix (translatable); same wording as the summary |
| https://design-system.service.gov.uk/components/error-summary/ | Top of page, "There is a problem", link to each field, focus on load |
| https://design-system.service.gov.uk/patterns/validation/ | "Error: " title prefix, focus the summary, server-side validation, `novalidate` |
| https://design-system.service.gov.uk/components/header/ | GOV.UK header only on gov.uk domains; Generic header otherwise |
| https://design-system.service.gov.uk/components/footer/ | Crown and Crown copyright in the GOV.UK footer (branding) |

## GOV.UK Frontend (code)
| URL | What it's for |
|---|---|
| https://frontend.design-system.service.gov.uk/using-govuk-frontend-without-govuk-branding/ | Generic header, own font stack, own brand colour, own assets |
| https://frontend.design-system.service.gov.uk/import-font-and-images-assets/ | Font and image assets (links to the no-branding guide) |
| https://www.npmjs.com/package/govuk-frontend | Package; v6.5.1 measured (compiled subset sizes in the audit) |
| https://github.com/alphagov/govuk-frontend/tree/v6.5.1/packages/govuk-frontend/src/govuk | Sass and JS sources: settings (incl. `_colours-palette--internal.scss`, `_colours-functional.scss`, `_typography-font.scss`), helpers, objects, button, input, label, hint, error-message, error-summary, generic-header |
| https://www.npmjs.com/package/accessible-autocomplete | alphagov autocomplete, v3.0.2 measured (JS/CSS gzip) for the autocomplete evaluation |

## Service Manual
| URL | What it's for |
|---|---|
| https://www.gov.uk/service-manual/design/making-your-service-look-like-govuk | "If your service is not on GOV.UK": no crown or logotype, no GDS Transport, no brand colours |

## Not read in this phase
- **Style guide A–Z** (https://www.gov.uk/guidance/style-guide/a-to-z): content, which is out of the narrowed scope. The Polish copy rules stay in `docs/brand.md`.
- **Other components and patterns:** listed on one "later" line in the audit.

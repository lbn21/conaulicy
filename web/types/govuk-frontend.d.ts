// govuk-frontend ships no TypeScript types; only what lib/govuk-frontend.ts uses.
type GovukComponent = new ($root: Element, config?: object) => unknown;

declare module "govuk-frontend/dist/govuk/components/button/button.mjs" {
  export const Button: GovukComponent;
}

declare module "govuk-frontend/dist/govuk/components/skip-link/skip-link.mjs" {
  export const SkipLink: GovukComponent;
}

declare module "govuk-frontend/dist/govuk/components/error-summary/error-summary.mjs" {
  export const ErrorSummary: GovukComponent;
}

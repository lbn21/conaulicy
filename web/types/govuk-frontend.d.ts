// govuk-frontend ships no TypeScript types; only what lib/govuk-frontend.ts
// and components/skip-link.tsx use.
type GovukComponent = new ($root: Element, config?: object) => unknown;

declare module "govuk-frontend/dist/govuk/components/button/button.mjs" {
  export const Button: GovukComponent;
}

declare module "govuk-frontend/dist/govuk/common/index.mjs" {
  export function setFocus(
    $element: HTMLElement,
    options?: { onBeforeFocus?: () => void; onBlur?: () => void },
  ): void;
}

declare module "govuk-frontend/dist/govuk/components/error-summary/error-summary.mjs" {
  export const ErrorSummary: GovukComponent;
}

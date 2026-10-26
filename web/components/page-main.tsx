import type { ReactNode } from "react";

/**
 * GOV.UK's <main>, the skip link's target (app/layout.tsx). Every page
 * renders its own, so the address pages can place their breadcrumbs before
 * it, as GOV.UK documents: the skip link then skips them too
 * (docs/layout.md).
 */
export function PageMain({ children }: { children: ReactNode }) {
  return (
    <main className="govuk-main-wrapper" id="main-content">
      {children}
    </main>
  );
}

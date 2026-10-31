// GOV.UK Frontend's JavaScript, unchanged: only the components the site uses,
// each instantiated on its data-module elements as GOV.UK's docs show
// ("Import JavaScript", frontend.design-system.service.gov.uk). Imported from
// each component's own module: init.mjs (createAll) pulls in every component,
// which the bundler cannot drop. Components check for the
// govuk-frontend-supported class that the layout's snippet sets; errors are
// logged, as createAll would.
import { Button } from "govuk-frontend/dist/govuk/components/button/button.mjs";
import { ErrorSummary } from "govuk-frontend/dist/govuk/components/error-summary/error-summary.mjs";
import { SkipLink } from "govuk-frontend/dist/govuk/components/skip-link/skip-link.mjs";

const COMPONENTS = [
  ["govuk-button", Button],
  ["govuk-error-summary", ErrorSummary],
  ["govuk-skip-link", SkipLink],
] as const;

/**
 * Starts every component in `$scope` (the page, or a part drawn later),
 * skipping one already started (GOV.UK marks it data-<module>-init).
 */
export function initGovukFrontend($scope: ParentNode = document) {
  for (const [name, Component] of COMPONENTS) {
    for (const $root of $scope.querySelectorAll(
      `[data-module="${name}"]:not([data-${name}-init])`,
    )) {
      try {
        new Component($root);
      } catch (error) {
        console.log(error);
      }
    }
  }
}

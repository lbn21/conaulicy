/**
 * GOV.UK's error summary, focused on load by its JS (lib/govuk-frontend):
 * one error, linked to its field (`href`, e.g. "#nr").
 */
export function ErrorSummary({ error, href }: { error: string; href: string }) {
  return (
    <div className="govuk-error-summary" data-module="govuk-error-summary">
      <div role="alert">
        <h2 className="govuk-error-summary__title">Jest problem</h2>
        <div className="govuk-error-summary__body">
          <ul className="govuk-list govuk-error-summary__list">
            <li>
              <a href={href}>{error}</a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Our own footer: GOV.UK classes and layout, not the GOV.UK footer component,
// which only services on GOV.UK may use.
export function SiteFooter() {
  return (
    <footer className="govuk-template__footer">
      <div className="govuk-width-container">
        <hr className="govuk-section-break govuk-section-break--visible govuk-!-margin-bottom-6" />
        <p className="govuk-body">
          Nie jesteśmy urzędem – obowiązuje harmonogram gminy
        </p>
        <ul className="govuk-list govuk-!-margin-bottom-8">
          <li>
            <a className="govuk-link" href="/prywatnosc">
              Prywatność
            </a>
          </li>
          <li>
            <a className="govuk-link" href="/dostepnosc">
              Dostępność
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}

// Our own footer, modelled on the GOV.UK footer's structure (meta links, then
// a content line) with GOV.UK layout, typography and link classes. Not the
// GOV.UK footer component, which only services on GOV.UK may use: no crown,
// no Open Government Licence, no Crown copyright line. Its background and top
// bar are in site.scss (.app-footer). The licences are credited on /dostepnosc.
export function SiteFooter() {
  return (
    <footer className="govuk-template__footer app-footer govuk-!-padding-top-7 govuk-!-padding-bottom-5">
      <div className="govuk-width-container">
        <h2 className="govuk-visually-hidden">Linki pomocnicze</h2>
        <ul className="govuk-list">
          <li>
            <a
              className="govuk-link govuk-link--text-colour"
              href="/dostepnosc"
            >
              Dostępność
            </a>
          </li>
          <li>
            <a
              className="govuk-link govuk-link--text-colour"
              href="/prywatnosc"
            >
              Prywatność
            </a>
          </li>
        </ul>
        <p className="govuk-body govuk-!-margin-bottom-0">
          Nie jesteśmy urzędem – obowiązuje harmonogram gminy
        </p>
      </div>
    </footer>
  );
}

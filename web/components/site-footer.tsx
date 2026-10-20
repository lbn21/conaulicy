import { PLATE, PLATE_WIDTH, RIM, RIM_WIDTH, UL } from "@/lib/logo";

// Our own footer markup with GOV.UK's footer classes, laid out as the GOV.UK
// footer: logo, navigation and section break (once there is enough to
// navigate), meta links and text, licence, and the copyright on the right. Never GOV.UK's crown, crest, Open Government
// Licence or Crown copyright: our plate takes the crown's place (with the
// crown's 25 px margin as a GOV.UK override class, not the crown class), and
// the copyright is plain text (govuk-footer__copyright-logo is the crest).
// The same on every page. The code licences are credited on /dostepnosc.

/**
 * Footer navigation: live features only; a new feature adds a link here. It
 * appears (with its section break) once it has two or more links, or when
 * SHOW_NAVIGATION is set; one link alone would only repeat the home page.
 * Sections without links never render.
 */
const NAVIGATION: Array<{
  title: string;
  items: Array<{ href: string; text: string }>;
}> = [
  {
    title: "Sprawdź przy swojej ulicy",
    items: [{ href: "/", text: "Wywóz śmieci" }],
  },
];

const SHOW_NAVIGATION = false;
const SECTIONS = NAVIGATION.filter((section) => section.items.length > 0);
const NAVIGATION_SHOWN =
  SECTIONS.length > 0 &&
  (SHOW_NAVIGATION ||
    SECTIONS.reduce((links, section) => links + section.items.length, 0) >= 2);

const META = [
  { href: "/dostepnosc", text: "Dostępność" },
  { href: "/prywatnosc", text: "Prywatność" },
  { href: "/o-projekcie", text: "O projekcie" },
];

/** The "ul." plate in one colour (the text colour), where GOV.UK has its crown. */
function FooterPlate() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="govuk-!-margin-bottom-5"
      width="37"
      height="30"
      viewBox={`0 0 ${PLATE_WIDTH} 34`}
    >
      <mask
        id="footer-plate"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width={PLATE_WIDTH}
        height="34"
      >
        <path fill="#fff" d={PLATE} />
        <path fill="none" stroke="#000" strokeWidth={RIM_WIDTH} d={RIM} />
        <path d={UL} />
      </mask>
      <path fill="currentColor" mask="url(#footer-plate)" d={PLATE} />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="govuk-template__footer">
      <div className="govuk-footer">
        <div className="govuk-width-container">
          <FooterPlate />
          {NAVIGATION_SHOWN && (
            <>
              <div className="govuk-footer__navigation">
                {SECTIONS.map((section) => (
                  <div
                    key={section.title}
                    className="govuk-footer__section govuk-grid-column-full"
                  >
                    <h2 className="govuk-footer__heading govuk-heading-m">
                      {section.title}
                    </h2>
                    <ul className="govuk-footer__list">
                      {section.items.map((item) => (
                        <li key={item.href} className="govuk-footer__list-item">
                          <a className="govuk-footer__link" href={item.href}>
                            {item.text}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <hr className="govuk-footer__section-break" />
            </>
          )}
          <div className="govuk-footer__meta">
            <div className="govuk-footer__meta-item govuk-footer__meta-item--grow">
              <h2 className="govuk-visually-hidden">Linki pomocnicze</h2>
              <ul className="govuk-footer__inline-list">
                {META.map((item) => (
                  <li
                    key={item.href}
                    className="govuk-footer__inline-list-item"
                  >
                    <a className="govuk-footer__link" href={item.href}>
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="govuk-footer__meta-custom">
                Zrobił Jakub Marciniszyn dla mieszkańców Lubaczowa.
                <br />
                Nie jesteśmy urzędem – obowiązuje harmonogram gminy.
              </div>
              <span className="govuk-footer__licence-description">
                Teksty na tej stronie są dostępne na licencji{" "}
                <a
                  className="govuk-footer__link"
                  href="https://creativecommons.org/licenses/by/4.0/deed.pl"
                  rel="license"
                >
                  CC BY 4.0
                </a>
                . Terminy wywozu pochodzą z harmonogramów miasta Lubaczów i
                gminy Lubaczów.
              </span>
            </div>
            <div className="govuk-footer__meta-item">© 2026 conaulicy.pl</div>
          </div>
        </div>
      </div>
    </footer>
  );
}

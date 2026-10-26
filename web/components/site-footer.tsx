import { CONTACT_HREF } from "@/components/contact-link";
import { PlateMask } from "@/components/plate-mask";
import { FEATURES } from "@/lib/config.generated";
import { LOGO_HEIGHT, PLATE, PLATE_COLOUR, PLATE_WIDTH } from "@/lib/logo";
import { DISCLAIMER } from "@/lib/schedule-notes";
import { SITE_NAME } from "@/lib/share";
import { STATIC_PAGES } from "@/lib/static-pages";

// Our own footer markup with GOV.UK's footer classes, laid out as the GOV.UK
// footer: logo, navigation and section break (once there is enough to
// navigate), meta links and text, licence, and the copyright on the right. Never GOV.UK's crown, crest, Open Government
// Licence or Crown copyright: our plate takes the crown's place (with the
// crown's 25 px margin as a GOV.UK override class, not the crown class), and
// the copyright is plain text (govuk-footer__copyright-logo is the crest).
// The same on every page. The code licences are credited on /dostepnosc.

/**
 * Footer navigation: live features only, from etl/sources.yaml (site.features)
 * via the generated config. It appears (with its section break) once it has
 * two or more links, or when SHOW_NAVIGATION is set; one link alone would
 * only repeat the home page. Sections without links never render.
 */
const NAVIGATION = FEATURES.map(({ section, links }) => ({
  title: section,
  items: links,
}));

const SHOW_NAVIGATION = false;

// The year the site and its texts were first published.
const COPYRIGHT_YEAR = 2026;
const SECTIONS = NAVIGATION.filter((section) => section.items.length > 0);
const NAVIGATION_SHOWN =
  SECTIONS.length > 0 &&
  (SHOW_NAVIGATION ||
    SECTIONS.reduce((links, section) => links + section.items.length, 0) >= 2);

/** The "ul." plate in one colour (PLATE_COLOUR), where GOV.UK has its crown. */
function FooterPlate() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="govuk-!-margin-bottom-5"
      width="37"
      height="30"
      viewBox={`0 0 ${PLATE_WIDTH} ${LOGO_HEIGHT}`}
    >
      <PlateMask id="footer-plate" />
      <path fill={PLATE_COLOUR} mask="url(#footer-plate)" d={PLATE} />
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
                {STATIC_PAGES.map((item) => (
                  <li
                    key={item.path}
                    className="govuk-footer__inline-list-item"
                  >
                    <a className="govuk-footer__link" href={item.path}>
                      {item.text}
                    </a>
                  </li>
                ))}
                <li className="govuk-footer__inline-list-item">
                  <a className="govuk-footer__link" href={CONTACT_HREF}>
                    Kontakt
                  </a>
                </li>
              </ul>
              <div className="govuk-footer__meta-custom">
                Zrobił Jakub Marciniszyn dla mieszkańców Lubaczowa i gminy.
                <br />
                {DISCLAIMER}
              </div>
              <span className="govuk-footer__licence-description">
                Nasze teksty są na licencji{" "}
                <a
                  className="govuk-footer__link"
                  href="https://creativecommons.org/licenses/by/4.0/deed.pl"
                  rel="license"
                >
                  CC BY 4.0
                </a>
                . Terminy wywozu pochodzą z harmonogramów miasta Lubaczów i
                gminy Lubaczów, przerwy w dostawie wody z komunikatów gminy
                Lubaczów i MZGKiM w Lubaczowie, a ostrzeżenia pogodowe z
                IMGW-PIB.
              </span>
            </div>
            <div className="govuk-footer__meta-item">{`© ${COPYRIGHT_YEAR} ${SITE_NAME}`}</div>
          </div>
        </div>
      </div>
    </footer>
  );
}

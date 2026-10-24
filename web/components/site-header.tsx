import { PlateMask } from "@/components/plate-mask";
import { LOGO_HEIGHT, LOGO_WIDTH, PLATE, WORDMARK } from "@/lib/logo";

// GOV.UK header's logotype height (components/header/_mixin.scss); the width
// keeps the logo's aspect ratio: 177, a whole px (make_logo_a.py).
const HEIGHT = 30;
const WIDTH = Math.round((HEIGHT * LOGO_WIDTH) / LOGO_HEIGHT);

// The GOV.UK Generic header (never the GOV.UK header or crown) with our
// "ul." plate. On its brown bar (app/site.scss) the plate is white, as GOV.UK's
// white crown, with the "ul." and rim cut out to the brown, and a white
// wordmark. On focus, a black plate with the "ul." in focus yellow (app/site.scss). Markup as the
// component's own template: only the logo goes in the homepage link. Sized as
// the GOV.UK header's logo and centred in the bar (app/site.scss), so the
// hover underline clears the "y" by 6px as on GOV.UK.
export function SiteHeader() {
  return (
    <header className="govuk-template__header">
      <div className="govuk-generic-header">
        <div className="govuk-generic-header__container govuk-width-container">
          <div className="govuk-generic-header__logo">
            <a href="/" className="govuk-generic-header__homepage-link">
              <svg
                aria-hidden="true"
                width={WIDTH}
                height={HEIGHT}
                viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`}
                className="app-logo"
              >
                <PlateMask id="logo-plate" />
                <path
                  className="app-logo__plate"
                  mask="url(#logo-plate)"
                  d={PLATE}
                />
                <path fill="currentColor" d={WORDMARK} />
              </svg>
              <span className="govuk-visually-hidden">
                conaulicy.pl – strona główna
              </span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

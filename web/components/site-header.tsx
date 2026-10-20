import {
  LOGO_HEIGHT,
  LOGO_WIDTH,
  PLATE,
  PLATE_WIDTH,
  RIM,
  RIM_WIDTH,
  UL,
  WORDMARK,
} from "@/lib/logo";

// The GOV.UK Generic header (never the GOV.UK header or crown) with our
// "ul." plate. On its black bar the plate is the logo's dark-background
// lockup: amber plate, light wordmark (docs/brand.md).
export function SiteHeader() {
  return (
    <header className="govuk-template__header">
      <div className="govuk-generic-header">
        <div className="govuk-generic-header__container govuk-width-container">
          <div className="govuk-generic-header__logo">
            <a href="/" className="govuk-generic-header__homepage-link">
              <svg
                aria-hidden="true"
                width="180"
                height="32"
                viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`}
                className="app-logo"
              >
                <mask
                  id="logo-plate"
                  maskUnits="userSpaceOnUse"
                  x="0"
                  y="0"
                  width={PLATE_WIDTH}
                  height={LOGO_HEIGHT}
                >
                  <path fill="#fff" d={PLATE} />
                  <path
                    fill="none"
                    stroke="#000"
                    strokeWidth={RIM_WIDTH}
                    d={RIM}
                  />
                  <path d={UL} />
                </mask>
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
            <span className="app-logo__place">Lubaczów</span>
          </div>
        </div>
      </div>
    </header>
  );
}

import type { Metadata, Viewport } from "next";
import { GovukFrontend } from "@/components/govuk-frontend";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WebAnalytics } from "@/components/web-analytics";
import { SITE_URL } from "@/lib/config.generated";
import { indexable } from "@/lib/indexing";
import { HOME_TITLE, SHARE, SITE_NAME } from "@/lib/share";
import { THEME_COLOR } from "@/lib/theme";
import { atkinson } from "./fonts";
import "./tokens.css";
import "./govuk.scss";
import "./site.scss";

export const metadata: Metadata = {
  // Share images and canonical links always point at the permanent address.
  metadataBase: new URL(SITE_URL),
  title: {
    default: HOME_TITLE,
    template: `%s – ${SITE_NAME}`,
  },
  description:
    "Kiedy przyjeżdża śmieciarka na Twoją ulicę w Lubaczowie albo do Twojej wsi w gminie.",
  ...SHARE,
  robots: indexable()
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: THEME_COLOR,
  // As GOV.UK's page template.
  viewportFit: "cover",
};

// GOV.UK's snippet, exactly as in its page template: marks browsers that run
// GOV.UK Frontend's JS (it only initialises with govuk-frontend-supported).
const supportScript = `document.body.className += ' js-enabled' + ('noModule' in HTMLScriptElement.prototype ? ' govuk-frontend-supported' : '');`;

// The GOV.UK page template (design-system.service.gov.uk/styles/page-template).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={`govuk-template ${atkinson.variable}`}>
      {/* The snippet adds classes to <body> before React hydrates. */}
      <body className="govuk-template__body" suppressHydrationWarning>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: GOV.UK's support snippet must run before the page renders
          dangerouslySetInnerHTML={{ __html: supportScript }}
        />
        <a
          href="#main-content"
          className="govuk-skip-link"
          data-module="govuk-skip-link"
        >
          Przejdź do treści
        </a>
        <SiteHeader />
        <div className="govuk-width-container">
          <main className="govuk-main-wrapper" id="main-content">
            {children}
          </main>
        </div>
        <SiteFooter />
        <GovukFrontend />
        {/* Production deployments only, never previews or local builds. */}
        <WebAnalytics enabled={process.env.VERCEL_ENV === "production"} />
      </body>
    </html>
  );
}

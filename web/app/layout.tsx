import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WebAnalytics } from "@/components/web-analytics";
import { THEME_COLOR } from "@/lib/theme";
import { atkinson } from "./fonts";
import "./globals.css";
import "./govuk.scss";
import "./site.scss";

// Built by docs/logo/source/ship_a.mjs. A static file, not opengraph-image.png:
// the file convention splits a shared client chunk (+0.3 KB first-load JS).
const SHARE_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "conaulicy.pl: wywozy śmieci przy Twojej ulicy. Lubaczów i gmina.",
};

export const metadata: Metadata = {
  // Share images and canonical links always point at the permanent address.
  metadataBase: new URL("https://conaulicy.pl"),
  title: {
    default: "conaulicy – wywóz śmieci w Lubaczowie i gminie",
    template: "%s – conaulicy",
  },
  description:
    "Kiedy przyjeżdża śmieciarka na Twoją ulicę w Lubaczowie albo do Twojej wsi w gminie.",
  openGraph: {
    type: "website",
    siteName: "conaulicy.pl",
    locale: "pl_PL",
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: THEME_COLOR,
};

// The GOV.UK page template (design-system.service.gov.uk/styles/page-template),
// without its JS: <main> takes focus from the skip link through tabindex.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={`govuk-template ${atkinson.variable}`}>
      <body className="govuk-template__body">
        <a href="#main-content" className="govuk-skip-link">
          Przejdź do treści
        </a>
        <SiteHeader />
        <div className="govuk-width-container">
          <main className="govuk-main-wrapper" id="main-content" tabIndex={-1}>
            {children}
          </main>
        </div>
        <SiteFooter />
        {/* Production deployments only, never previews or local builds. */}
        <WebAnalytics enabled={process.env.VERCEL_ENV === "production"} />
      </body>
    </html>
  );
}

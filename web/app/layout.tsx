import type { Metadata, Viewport } from "next";
import { GovukFrontend } from "@/components/govuk-frontend";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";
import { WebAnalytics } from "@/components/web-analytics";
import { SITE_URL } from "@/lib/config.generated";
import { indexable } from "@/lib/indexing";
import { LANG } from "@/lib/locale";
import { SHARE, SITE_NAME } from "@/lib/share";
import { THEME_COLOR } from "@/lib/theme";
import { atkinson } from "./fonts";
import "./tokens.css";
import "./waste-colours.css";
import "./govuk.scss";
import "./site.scss";

export const metadata: Metadata = {
  // Share images and canonical links always point at the permanent address.
  metadataBase: new URL(SITE_URL),
  title: {
    // A neutral fallback: a page without its own title never shows the
    // home page's H1. Every route sets its own today.
    default: SITE_NAME,
    template: `%s – ${SITE_NAME}`,
  },
  description:
    "Wywóz śmieci, zapowiedziane przerwy w dostawie wody i prądu oraz ostrzeżenia IMGW dla Lubaczowa i wsi w gminie Lubaczów.",
  ...SHARE,
  // "default" on purpose; black-translucent is deprecated by Apple (WebKit
  // bug 317153), never restore it. The bar takes the page's colour: see
  // the standalone rule in app/site.scss.
  appleWebApp: { title: SITE_NAME, statusBarStyle: "default" },
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

// Every page is prerendered whole at build: the build fails on anything
// that would read a request (cookies, headers, searchParams), here and in
// every page below (nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/dynamic).
export const dynamic = "error";

// GOV.UK's snippet, exactly as in its page template: marks browsers that run
// GOV.UK Frontend's JS (it only initialises with govuk-frontend-supported).
const supportScript = `document.body.className += ' js-enabled' + ('noModule' in HTMLScriptElement.prototype ? ' govuk-frontend-supported' : '');`;

// The GOV.UK page template (design-system.service.gov.uk/styles/page-template).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={LANG} className={`govuk-template ${atkinson.variable}`}>
      {/* The snippet adds classes to <body> before React hydrates. */}
      <head>
        {/* The Apple icon at the root, with no query, where iOS also looks
            for it unlinked (scripts/brand-assets.ts). Not metadata.icons:
            Next then drops app/icon.svg's link. */}
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon.png"
          sizes="180x180"
          type="image/png"
        />
      </head>
      <body className="govuk-template__body" suppressHydrationWarning>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: GOV.UK's support snippet must run before the page renders
          dangerouslySetInnerHTML={{ __html: supportScript }}
        />
        <SkipLink />
        <SiteHeader />
        {/* GOV.UK's <main>, the landmark, one for the whole site:
            a layout is never duplicated, while Next.js keeps a page left by
            a client-side navigation in the document, hidden (Activity), so
            a <main> per page would repeat it. The skip link's target is
            the page's heading block, after its breadcrumbs (SkipTarget,
            components/skip-target.tsx). Straight under the
            header: every page starts with its head's band (an address
            page's breadcrumbs inside it, t400; docs/layout.md). Each page
            holds its own width container (the home page's hero is the
            window's full width): a page may never reach out to change the
            layout's, since a page left hidden is still in the document
            (t398). */}
        <main className="govuk-main-wrapper govuk-!-padding-top-0">
          {children}
        </main>
        <SiteFooter />
        <GovukFrontend />
        {/* Production deployments only, never previews or local builds. */}
        <WebAnalytics enabled={process.env.VERCEL_ENV === "production"} />
      </body>
    </html>
  );
}

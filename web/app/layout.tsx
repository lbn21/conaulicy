import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WebAnalytics } from "@/components/web-analytics";
import { atkinson } from "./fonts";
import "./globals.css";

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
  colorScheme: "dark light",
};

const themeScript = `(function(){var t="dark";try{var s=localStorage.getItem("theme");if(s==="dark"||s==="light"||s==="system")t=s}catch(e){}document.documentElement.setAttribute("data-theme",t)})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pl"
      data-theme="dark"
      className={atkinson.variable}
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static theme script must run before first paint
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        {/* Production deployments only, never previews or local builds. */}
        <WebAnalytics enabled={process.env.VERCEL_ENV === "production"} />
      </body>
    </html>
  );
}

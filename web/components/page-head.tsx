import type { ReactNode } from "react";
import { type IconName, Tile } from "@/components/icon";
import { SkipTarget } from "@/components/skip-target";

// Every page's head, one frame for the site (docs/layout.md, Page
// head): a band in the brand's surface tint, the full width of the window,
// straight under the header, holding what comes before the content: an
// address page's breadcrumbs (t400), the caption, the h1 (on a
// module's page with the module's icon on its tile), a lead paragraph and
// the page's first action („Zmień adres”, the search). Then the content on
// white, then the footer's band. site.scss .app-band.

/** GOV.UK's caption and heading classes, by size. */
const CLASSES = {
  l: ["govuk-caption-l", "govuk-heading-l"],
  xl: ["govuk-caption-xl", "govuk-heading-xl"],
} as const;

export function PageHead({
  title,
  caption,
  icon,
  lead,
  size = "l",
  crumbs,
  children,
}: {
  title: ReactNode;
  caption?: ReactNode;
  /** A module's icon beside the h1 (components/icon.tsx). */
  icon?: IconName;
  lead?: ReactNode;
  /** GOV.UK's heading size: xl on the home page only. */
  size?: "l" | "xl";
  /** The band's first line: an address page's breadcrumbs. */
  crumbs?: ReactNode;
  /** After the lead: the page's first action. */
  children?: ReactNode;
}) {
  const heading = (
    <>
      {icon && <Tile name={icon} />}
      {title}
    </>
  );
  return (
    <div className="app-band">
      {crumbs}
      {/* The skip link's target: the heading block's start, the street
        line, else the h1 (components/skip-target.tsx). */}
      {caption && (
        <SkipTarget as="span" className={CLASSES[size][0]}>
          {caption}
        </SkipTarget>
      )}
      {caption ? (
        <h1 className={CLASSES[size][1]}>{heading}</h1>
      ) : (
        <SkipTarget as="h1" className={CLASSES[size][1]}>
          {heading}
        </SkipTarget>
      )}
      {lead && <p className="govuk-body-l">{lead}</p>}
      {children}
    </div>
  );
}

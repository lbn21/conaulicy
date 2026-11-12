import type { ReactNode } from "react";
import { type IconName, Tile } from "@/components/icon";

// Every page's head, one skeleton for the site (docs/layout.md, Page
// head): a band in the brand's surface tint, the full width of the window,
// straight under the header (or the breadcrumbs), holding what comes
// before the content: an error summary, the caption, the h1 (on a
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
  tag: Heading = "h1",
  before,
  children,
}: {
  title: ReactNode;
  caption?: ReactNode;
  /** A module's icon beside the h1 (components/icon.tsx). */
  icon?: IconName;
  lead?: ReactNode;
  /** GOV.UK's heading size: xl on the home page only. */
  size?: "l" | "xl";
  /** "p" in a skeleton (components/place-suspense.tsx): the page's own
   * h1 comes with the page. */
  tag?: "h1" | "p";
  /** Above the caption: an error summary. */
  before?: ReactNode;
  /** After the lead: the page's first action. */
  children?: ReactNode;
}) {
  return (
    <div className="app-band">
      {before}
      {caption && <span className={CLASSES[size][0]}>{caption}</span>}
      <Heading className={CLASSES[size][1]}>
        {icon && <Tile name={icon} />}
        {title}
      </Heading>
      {lead && <p className="govuk-body-l">{lead}</p>}
      {children}
    </div>
  );
}

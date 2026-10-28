import { Fragment } from "react";
import { DayLead } from "@/components/upcoming";
import { Bins } from "@/components/waste-bins";
import type { Part } from "@/lib/hub";

// A module's lines (lib/hub.ts Part): text, links, bins, IMGW's tags and a
// section's day lead (the island, components/upcoming.tsx), for the address
// page's sections and the module subpages.

/** Parts as plain text, for a key in a list. */
export const textOf = (parts: Part[]) =>
  parts
    .map((part) =>
      typeof part === "string"
        ? part
        : "bins" in part
          ? part.bins.map((bin) => bin.label).join(", ")
          : part.text,
    )
    .join("");

/**
 * A line's parts as text, links, bins (a row of small ones), tags and day
 * leads; `renderedAt`, the server's render time, for a day lead.
 */
export function Parts({
  parts,
  renderedAt = 0,
}: {
  parts: Part[];
  renderedAt?: number;
}) {
  return parts.map((part, i) => {
    // A fixed sequence, never reordered; its texts may repeat (" ").
    const key = `${i}`;
    if (typeof part === "string") return <Fragment key={key}>{part}</Fragment>;
    if ("bins" in part) {
      return <Bins key={key} pickups={part.bins} size="small" />;
    }
    if ("tag" in part)
      return (
        <strong key={key} className={part.tag}>
          {part.text}
        </strong>
      );
    if ("day" in part)
      return (
        <DayLead
          key={key}
          day={part.day}
          text={part.text}
          renderedAt={renderedAt}
        />
      );
    return (
      <a key={key} href={part.href} className="govuk-link">
        {part.text}
        {part.hidden && (
          <span className="govuk-visually-hidden"> {part.hidden}</span>
        )}
      </a>
    );
  });
}

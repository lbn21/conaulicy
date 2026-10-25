import { Fragment } from "react";
import { Bins } from "@/components/waste-bins";
import type { Part } from "@/lib/hub";

// A module's rows and lines (lib/hub.ts Part): text, links and bins, for
// the address page's cards and the module subpages.

/** Parts as plain text: a row's key in the list. */
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

/** A row's or a line's parts as text, links and bins. */
export function Parts({ parts }: { parts: Part[] }) {
  return parts.map((part, i) => {
    // A fixed sequence, never reordered; its texts may repeat (" ").
    const key = `${i}`;
    if (typeof part === "string") return <Fragment key={key}>{part}</Fragment>;
    if ("bins" in part) {
      return <Bins key={key} pickups={part.bins} large={false} />;
    }
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

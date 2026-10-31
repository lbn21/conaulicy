import { Fragment } from "react";
import { DayWord } from "@/components/day-word";
import { Bins } from "@/components/waste-bins";
import type { Group, Part } from "@/lib/hub";
import { capitalised } from "@/lib/upcoming";

// A module's lines (lib/hub.ts Part): text, links, bins, IMGW's tags and a
// section's day lead („Dziś: ”, the device's, components/day-word.tsx), for
// the address page's sections and the module subpages.

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
 * leads. `lead`: a day lead gets the device's „Dziś: ” (DayWord); false
 * where none should (then a day lead is its date alone).
 */
export function Parts({ parts, lead }: { parts: Part[]; lead: boolean }) {
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
      return lead ? (
        <DayWord key={key} day={part.day} form="lead" text={part.text} />
      ) : (
        <Fragment key={key}>{capitalised(part.text)}</Fragment>
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

// Lines of a group close under each other (GOV.UK's spacing 2); a group's
// last keeps the paragraph's gap (spacing 4, as govuk-body).
const CLOSE = "govuk-!-margin-bottom-2";

/** A module's status: its groups of lines, a paragraph each, bins a row. */
export function Status({ groups }: { groups: Group[] }) {
  return groups.flatMap((lines, g) =>
    lines.map((line, i) => {
      const last = i === lines.length - 1;
      // A fixed sequence, never reordered; its texts may repeat.
      const key = `${g}-${i}`;
      if (line.length === 1 && typeof line[0] !== "string" && "bins" in line[0])
        return (
          <div key={key} className={last ? "govuk-!-margin-bottom-4" : CLOSE}>
            <Parts parts={line} lead />
          </div>
        );
      return (
        <p key={key} className={last ? "govuk-body" : `govuk-body ${CLOSE}`}>
          <Parts parts={line} lead />
        </p>
      );
    }),
  );
}

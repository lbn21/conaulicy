import { Fragment } from "react";
import { Parts } from "@/components/parts";
import {
  AddressPage,
  numberError,
  PlaceNotFound,
  StreetPage,
} from "@/components/place-page";
import { Upcoming } from "@/components/upcoming";
import { MODULE_IDS } from "@/lib/address-routes";
import { type Group, metaLine } from "@/lib/hub";
import { IMGW_ATTRIBUTION } from "@/lib/imgw-warnings";
import { MODULES, type Module } from "@/lib/modules";
import { placePath } from "@/lib/places";
import type { PlaceView } from "@/lib/schedule";
import { ordered } from "@/lib/upcoming";

// The address page, /adres/[id] (and /nr/…): the hub of modules
// (lib/modules.ts, docs/tasks T102), under breadcrumbs. Under „Zmień
// adres”, „Najbliższe dni” (components/upcoming.tsx), every module's items
// in one order, only while one is shown; then a section per module, always,
// in registry order (Śmieci, Woda, Pogoda; task 207), each its module's id
// as its anchor (#woda): its h2, its status lines (what is next, or that
// nothing is), a link saying where its subpage goes („Wszystkie odbiory
// śmieci”), then its meta line, small: „Źródło: …”, and when we checked.
// No summary lists or cards (GOV.UK keeps cards for lists of the same type
// of thing, task 131). A visible section break between sections. Dates in
// the HTML are absolute; the relative words („Dziś”, „Teraz”) are the
// island's, so a cached copy is never wrong. No calendar or PDF here: they
// are on the waste subpage. A split street's number errors keep the street
// page (StreetPage), GOV.UK's validation pattern.

type Loaded = { module: Module<unknown>; data: unknown };

/** A module's subpage, with the number as given (its breadcrumb back here). */
const subpageHref = (module: Module<unknown>, place: PlaceView) =>
  `${placePath(place.id)}/${module.id}${place.givenNr ? `?nr=${place.givenNr}` : ""}`;

// Lines of a group close under each other (GOV.UK's spacing 2); a group's
// last keeps the paragraph's gap (spacing 4, as govuk-body).
const CLOSE = "govuk-!-margin-bottom-2";

/** A module's status: its groups of lines, a paragraph each, bins a row. */
function Status({
  groups,
  renderedAt,
}: {
  groups: Group[];
  renderedAt: number;
}) {
  return groups.flatMap((lines, g) =>
    lines.map((line, i) => {
      const last = i === lines.length - 1;
      // A fixed sequence, never reordered; its texts may repeat.
      const key = `${g}-${i}`;
      if (line.length === 1 && typeof line[0] !== "string" && "bins" in line[0])
        return (
          <div key={key} className={last ? "govuk-!-margin-bottom-4" : CLOSE}>
            <Parts parts={line} />
          </div>
        );
      return (
        <p key={key} className={last ? "govuk-body" : `govuk-body ${CLOSE}`}>
          <Parts parts={line} renderedAt={renderedAt} />
        </p>
      );
    }),
  );
}

/**
 * A module's section: its h2, its status, the link to its subpage (if it
 * has one), then its meta line, last.
 */
function ModuleSection({
  loaded: { module, data },
  place,
  renderedAt,
}: {
  loaded: Loaded;
  place: PlaceView;
  renderedAt: number;
}) {
  const heading = `${module.id}-heading`;
  return (
    <section id={module.id} aria-labelledby={heading}>
      <h2 id={heading} className="govuk-heading-l">
        {module.title}
      </h2>
      <Status groups={module.status(data)} renderedAt={renderedAt} />
      {module.Details && (
        <p className="govuk-body">
          <a className="govuk-link" href={subpageHref(module, place)}>
            {module.more}
          </a>
        </p>
      )}
      <p className="govuk-body-s">
        <Parts
          parts={metaLine(
            module.sources(data),
            module.note?.(data) ?? null,
            module.checkedAt?.(data) ?? null,
          )}
        />
      </p>
    </section>
  );
}

// GOV.UK's visible section break, between the hub's sections.
const BREAK = (
  <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
);

export async function HubMain({
  id,
  nr,
  missing = false,
}: {
  id: string;
  nr: string | null;
  /** ?nr= was sent without a usable number (/adres/[id]/numer). */
  missing?: boolean;
}) {
  const modules = MODULE_IDS.map((slug): Module<unknown> => MODULES[slug]);
  const [place, ...rest] = (await Promise.all(
    modules.map((module) => module.load(id, nr)),
  )) as [PlaceView | null, ...unknown[]];
  if (!place) return <PlaceNotFound />;
  if (numberError(place, missing)) {
    return <StreetPage place={place} missing={missing} />;
  }

  const loaded: Loaded[] = modules
    .map((module, i) => ({ module, data: i === 0 ? place : rest[i - 1] }))
    .filter(({ data }) => data !== null);
  // The render's time: the island's words until the device's clock runs.
  const renderedAt = Date.now();
  // Only what is not over: the rest would never be shown.
  const items = ordered(
    loaded.flatMap(({ module, data }) => module.upcoming(data)),
  ).filter((item) => renderedAt < Date.parse(item.span.end));
  const imgw = loaded.some(({ module }) => module.id === "pogoda");

  return (
    <AddressPage place={place}>
      <Upcoming items={items} renderedAt={renderedAt} />
      {loaded.map((entry, i) => (
        <Fragment key={entry.module.id}>
          {i > 0 && BREAK}
          <ModuleSection loaded={entry} place={place} renderedAt={renderedAt} />
        </Fragment>
      ))}
      {/* IMGW's required wording, as secondary text (task 205). */}
      {imgw && (
        <p className="govuk-hint govuk-!-font-size-16">
          {IMGW_ATTRIBUTION.join(" ")}
        </p>
      )}
    </AddressPage>
  );
}

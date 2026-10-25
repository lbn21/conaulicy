import { Fragment } from "react";
import { CheckedLine } from "@/components/checked-line";
import { Parts, textOf } from "@/components/parts";
import {
  AddressPage,
  numberError,
  PlaceNotFound,
  StreetPage,
} from "@/components/place-page";
import { MODULE_IDS } from "@/lib/address-routes";
import {
  type Alert,
  alertSlot,
  checkedLine,
  type Part,
  warningCount,
} from "@/lib/hub";
import { IMGW_ATTRIBUTION } from "@/lib/imgw-warnings";
import { MODULES, type Module } from "@/lib/modules";
import { placePath } from "@/lib/places";
import type { PlaceView } from "@/lib/schedule";

// The address page, /adres/[id] (and /nr/…): the hub of modules
// (lib/modules.ts, docs/tasks T102), under breadcrumbs. Under the h1, one GOV.UK warning text
// for every module's alerts; then a section per module with something to
// show, waste always first: its h2, a summary list and a „Szczegóły” link
// (no summary cards: GOV.UK keeps them for lists of the same type of thing,
// task 131); then „Bez zapowiedzi”, a line for each module with nothing. A
// visible section break between sections. Dates are absolute only, so a
// cached copy stays true without client JS. No calendar or PDF here: they
// are on the waste subpage. A split street's number errors keep the street
// page (StreetPage), GOV.UK's validation pattern.

type Loaded = { module: Module<unknown>; data: unknown };

const checkedAt = ({ module, data }: Loaded) =>
  module.checkedAt?.(data) ?? null;

/** What „Bez zapowiedzi” says for a module. */
const noneText = ({ module, data }: Loaded) =>
  typeof module.none === "function" ? module.none(data) : module.none;

/** The module's line after its list or „Bez zapowiedzi” line, if any. */
export function Trace({ module, data }: Loaded) {
  const text = module.trace?.(data) ?? null;
  return text && <p className="govuk-body">{text}</p>;
}

/** Where a module's „Szczegóły” go: its subpage, or the source's page. */
function detailsHref({ module }: Loaded, place: PlaceView): string {
  if ("href" in module) return module.href;
  // The number as given, as the subpage's breadcrumb back here.
  return `${placePath(place.id)}/${module.id}${place.givenNr ? `?nr=${place.givenNr}` : ""}`;
}

// An alert slot's line; those after the first keep a gap (GOV.UK's
// spacing scale), so two warnings read as two.
const LINE = "govuk-!-display-block";
const NEXT_LINE = `${LINE} govuk-!-margin-top-2`;

/**
 * GOV.UK's warning text, once for all modules: a line each, inside its one
 * <strong> (a list cannot go there), the count for screen readers first.
 */

function AlertSlot({
  alerts,
}: {
  alerts: Array<{ order: number; alert: Alert; title: string }>;
}) {
  const { shown, more } = alertSlot(alerts);
  if (shown.length === 0) return null;
  return (
    <div className="govuk-warning-text">
      <span className="govuk-warning-text__icon" aria-hidden="true">
        !
      </span>
      <strong className="govuk-warning-text__text">
        <span className="govuk-visually-hidden">
          {alerts.length > 1
            ? `Uwaga, ${warningCount(alerts.length)}.`
            : "Uwaga."}
        </span>
        {shown.map(({ alert, title }, i) => (
          <span
            key={`${title} ${alert.from} ${alert.text}`}
            className={i > 0 ? NEXT_LINE : LINE}
          >
            {`${title}: ${alert.text} `}
            <a href={alert.href} className="govuk-link">
              Szczegóły
              <span className="govuk-visually-hidden">
                {` – ${title.toLowerCase()}`}
              </span>
            </a>{" "}
            <span className="govuk-!-font-weight-regular">{`(${alert.short})`}</span>
          </span>
        ))}
        {more > 0 && (
          <span className={NEXT_LINE}>
            <a href="#co-cie-czeka" className="govuk-link">
              {`I jeszcze ${warningCount(more)}`}
            </a>
          </span>
        )}
      </strong>
    </div>
  );
}

/** A module's section: its h2, GOV.UK's summary list, „Szczegóły”. */
function ModuleSection({
  loaded,
  rows,
  place,
}: {
  loaded: Loaded;
  rows: Array<[string, Part[]]>;
  place: PlaceView;
}) {
  const { module, data } = loaded;
  const heading = `${module.id}-heading`;
  const all: Array<[string, Part[]]> = [
    ...rows,
    ...module.sources(data).map((parts): [string, Part[]] => ["Źródło", parts]),
  ];
  return (
    <section aria-labelledby={heading}>
      <h2 id={heading} className="govuk-heading-l">
        {module.title}
      </h2>
      <dl className="govuk-summary-list">
        {all.map(([key, value], i) => (
          <div
            key={`${key}: ${textOf(value)}`}
            // The last row has no border: the section break follows.
            className={`govuk-summary-list__row${i === all.length - 1 ? " govuk-summary-list__row--no-border" : ""}`}
          >
            <dt className="govuk-summary-list__key">{key}</dt>
            <dd className="govuk-summary-list__value">
              <Parts parts={value} />
              {/* Under the last source, so the row keeps GOV.UK's spacing. */}
              {i === all.length - 1 && (
                <CheckedLine
                  at={checkedAt(loaded)}
                  as="span"
                  className="govuk-!-display-block govuk-!-margin-top-1 govuk-!-margin-bottom-0"
                />
              )}
            </dd>
          </div>
        ))}
      </dl>
      <Trace {...loaded} />
      <p className="govuk-body">
        <a className="govuk-link" href={detailsHref(loaded, place)}>
          Szczegóły
          <span className="govuk-visually-hidden">
            {` – ${module.title.toLowerCase()}`}
          </span>
        </a>
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
  const alerts = loaded.flatMap(({ module, data }) =>
    module.alerts(data).map((alert) => ({
      order: module.order,
      alert,
      title: module.title,
    })),
  );
  const cards = loaded.flatMap((entry) => {
    const rows = entry.module.summary(entry.data);
    return rows ? [{ entry, rows }] : [];
  });
  const quiet = loaded.filter(
    ({ module, data }) => module.summary(data) === null,
  );
  const imgw = loaded.some(({ module }) => module.id === "pogoda");

  return (
    <AddressPage place={place}>
      <AlertSlot alerts={alerts} />
      <div id="co-cie-czeka">
        {cards.map(({ entry, rows }, i) => (
          <Fragment key={entry.module.id}>
            {i > 0 && BREAK}
            <ModuleSection loaded={entry} rows={rows} place={place} />
          </Fragment>
        ))}
      </div>
      {quiet.length > 0 && (
        <>
          {cards.length > 0 && BREAK}
          <section aria-labelledby="bez-zapowiedzi-heading">
            <h2 id="bez-zapowiedzi-heading" className="govuk-heading-l">
              Bez zapowiedzi
            </h2>
            {quiet.map((entry) => {
              const { module, data } = entry;
              const checked = checkedLine(checkedAt(entry));
              return (
                <Fragment key={module.id}>
                  <p className="govuk-body">
                    {`${module.title}: ${noneText(entry)}. Źródło: `}
                    <Parts
                      parts={module
                        .sources(data)
                        .flatMap((parts, i) =>
                          i > 0 ? ["; ", ...parts] : parts,
                        )}
                    />
                    .{checked && ` ${checked}.`}
                  </p>
                  <Trace {...entry} />
                </Fragment>
              );
            })}
          </section>
        </>
      )}
      {imgw && <p className="govuk-body-s">{IMGW_ATTRIBUTION.join(" ")}</p>}
    </AddressPage>
  );
}

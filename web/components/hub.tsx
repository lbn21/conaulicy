import { Fragment } from "react";
import {
  AddressPage,
  numberError,
  PlaceNotFound,
  StreetPage,
} from "@/components/place-page";
import { Bins } from "@/components/waste-bins";
import { MODULE_IDS } from "@/lib/address-routes";
import { type Alert, alertSlot, type Part, warningCount } from "@/lib/hub";
import { IMGW_ATTRIBUTION } from "@/lib/imgw-warnings";
import { MODULES, type Module } from "@/lib/modules";
import { placePath } from "@/lib/places";
import type { PlaceView } from "@/lib/schedule";

// The address page, /adres/[id] (and /nr/…): the hub of modules
// (lib/modules.ts, docs/tasks T102), under breadcrumbs. Under the h1, one GOV.UK warning text
// for every module's alerts; then „Co Cię czeka”, one summary card per module
// with something to show, waste always first; then „Bez zapowiedzi”, a line
// for each module with nothing. Dates are absolute only, so a cached copy
// stays true without client JS. No calendar or PDF here: they are on the
// waste subpage. A split street's number errors keep the street page
// (StreetPage), GOV.UK's validation pattern.

/** Parts as plain text: a row's key in the list. */
const textOf = (parts: Part[]) =>
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
function Parts({ parts }: { parts: Part[] }) {
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

type Loaded = { module: Module<unknown>; data: unknown };

/** Where a module's „Szczegóły” go: its subpage, or the source's page. */
function detailsHref({ module }: Loaded, place: PlaceView): string {
  if ("href" in module) return module.href;
  return `${placePath(place.id)}/${module.id}${place.nr ? `?nr=${place.nr}` : ""}`;
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

/** A module's card: GOV.UK's summary card, one action. */
function Card({
  loaded,
  rows,
  place,
}: {
  loaded: Loaded;
  rows: Array<[string, Part[]]>;
  place: PlaceView;
}) {
  const { module, data } = loaded;
  return (
    <div className="govuk-summary-card">
      <div className="govuk-summary-card__title-wrapper">
        <h3 className="govuk-summary-card__title">{module.title}</h3>
        <div className="govuk-summary-card__actions">
          <a className="govuk-link" href={detailsHref(loaded, place)}>
            Szczegóły
            <span className="govuk-visually-hidden">
              {` – ${module.title.toLowerCase()}`}
            </span>
          </a>
        </div>
      </div>
      <div className="govuk-summary-card__content">
        <dl className="govuk-summary-list">
          {[
            ...rows,
            ...module
              .sources(data)
              .map((parts): [string, Part[]] => ["Źródło", parts]),
          ].map(([key, value]) => (
            <div
              key={`${key}: ${textOf(value)}`}
              className="govuk-summary-list__row"
            >
              <dt className="govuk-summary-list__key">{key}</dt>
              <dd className="govuk-summary-list__value">
                <Parts parts={value} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

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
      <section aria-labelledby="co-cie-czeka-heading" id="co-cie-czeka">
        <h2 id="co-cie-czeka-heading" className="govuk-heading-m">
          Co Cię czeka
        </h2>
        {cards.map(({ entry, rows }) => (
          <Card
            key={entry.module.id}
            loaded={entry}
            rows={rows}
            place={place}
          />
        ))}
      </section>
      {quiet.length > 0 && (
        <section
          aria-labelledby="bez-zapowiedzi-heading"
          className="govuk-!-margin-top-6"
        >
          <h2 id="bez-zapowiedzi-heading" className="govuk-heading-s">
            Bez zapowiedzi
          </h2>
          {quiet.map(({ module, data }) => (
            <p key={module.id} className="govuk-body">
              {`${module.title}: ${module.none}. Źródło: `}
              <Parts
                parts={module
                  .sources(data)
                  .flatMap((parts, i) => (i > 0 ? ["; ", ...parts] : parts))}
              />
              .
            </p>
          ))}
        </section>
      )}
      {imgw && <p className="govuk-body-s">{IMGW_ATTRIBUTION.join(" ")}</p>}
    </AddressPage>
  );
}

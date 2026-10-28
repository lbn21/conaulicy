import { Fragment } from "react";
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
  type Group,
  metaLine,
  warningCount,
} from "@/lib/hub";
import { IMGW_ATTRIBUTION } from "@/lib/imgw-warnings";
import { MODULES, type Module } from "@/lib/modules";
import { placePath } from "@/lib/places";
import type { PlaceView } from "@/lib/schedule";

// The address page, /adres/[id] (and /nr/…): the hub of modules
// (lib/modules.ts, docs/tasks T102), under breadcrumbs. Under the h1, one GOV.UK warning text
// for every module's alerts; then a section per module, always, in registry
// order (Śmieci, Woda, Pogoda; task 207): its h2, its status lines (what is
// next, or that nothing is), a link saying where its subpage goes
// („Wszystkie odbiory śmieci”), then its meta line, small: „Źródło: …”, and
// when we checked. No summary lists or cards (GOV.UK keeps cards for lists
// of the same type of thing, task 131). A visible section break between
// sections. Dates are absolute only, so a cached copy stays true without
// client JS. No calendar or PDF here: they are on the waste subpage. A
// split street's number errors keep the street page (StreetPage), GOV.UK's
// validation pattern.

type Loaded = { module: Module<unknown>; data: unknown };

/** A module's subpage, with the number as given (its breadcrumb back here). */
const subpageHref = (module: Module<unknown>, place: PlaceView) =>
  `${placePath(place.id)}/${module.id}${place.givenNr ? `?nr=${place.givenNr}` : ""}`;

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
            {alert.sourceHref ? (
              <>
                {"Źródło: "}
                <a href={alert.sourceHref} className="govuk-link">
                  {`komunikat ${alert.short}`}
                </a>
                {". "}
                <a href={alert.href} className="govuk-link">
                  {alert.link}
                </a>
              </>
            ) : (
              <>
                <a href={alert.href} className="govuk-link">
                  {alert.link}
                </a>{" "}
                <span className="govuk-!-font-weight-regular">{`(${alert.short})`}</span>
              </>
            )}
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

// Lines of a group close under each other (GOV.UK's spacing 2); a group's
// last keeps the paragraph's gap (spacing 4, as govuk-body).
const CLOSE = "govuk-!-margin-bottom-2";

/** A module's status: its groups of lines, a paragraph each, bins a row. */
function Status({ groups }: { groups: Group[] }) {
  return groups.flatMap((lines) =>
    lines.map((line, i) => {
      const last = i === lines.length - 1;
      const key = textOf(line);
      if (line.length === 1 && typeof line[0] !== "string" && "bins" in line[0])
        return (
          <div key={key} className={last ? "govuk-!-margin-bottom-4" : CLOSE}>
            <Parts parts={line} />
          </div>
        );
      return (
        <p key={key} className={last ? "govuk-body" : `govuk-body ${CLOSE}`}>
          <Parts parts={line} />
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
}: {
  loaded: Loaded;
  place: PlaceView;
}) {
  const heading = `${module.id}-heading`;
  return (
    <section aria-labelledby={heading}>
      <h2 id={heading} className="govuk-heading-l">
        {module.title}
      </h2>
      <Status groups={module.status(data)} />
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
  const alerts = loaded.flatMap(({ module, data }) =>
    module.alerts(data).map((alert) => ({
      order: module.order,
      alert,
      title: module.title,
    })),
  );
  const imgw = loaded.some(({ module }) => module.id === "pogoda");

  return (
    <AddressPage place={place}>
      <AlertSlot alerts={alerts} />
      <div id="co-cie-czeka">
        {loaded.map((entry, i) => (
          <Fragment key={entry.module.id}>
            {i > 0 && BREAK}
            <ModuleSection loaded={entry} place={place} />
          </Fragment>
        ))}
      </div>
      {/* IMGW's required wording, as secondary text (task 205). */}
      {imgw && (
        <p className="govuk-hint govuk-!-font-size-16">
          {IMGW_ATTRIBUTION.join(" ")}
        </p>
      )}
    </AddressPage>
  );
}

import { FieldLink } from "@/components/field-link";
import { Tile } from "@/components/icon";
import { NOW_TILES, type NowTileDef } from "@/components/now-tiles";
import { SourceNote } from "@/components/subpage-parts";
import { dayRange, todayInWarsaw } from "@/lib/dates";
import type { LiveReads } from "@/lib/live-reads";
import { LIST } from "@/lib/locale";
import { type NowTileData, type Week, weekOf } from "@/lib/now-panel";

// „Teraz w gminie” on the home page's hero (docs/layout.md): a tile per
// entry of NOW_TILES (components/now-tiles.ts), gmina-wide, for the
// current week, prerendered with the page (app/page.tsx), re-rendered
// when what it shows changes (lib/page-refresh.ts). Every tile is one NowTile: the module's icon on its
// tile and its label, an optional level tag, the value, the window it
// counts and an optional action on the page; no link off the site (the
// sources are linked in the note under the tiles; t398). The tiles wrap in
// one row by their content (site.scss .app-now__tiles: flex-wrap, a
// minimum width from GOV.UK's spacing, the last row's tiles share it);
// only a tile with an active alert (featured) takes a whole row.

const HEADING = "Teraz w gminie";

/** One tile, from its definition and its read (null: not read now). */
export function NowTile({
  def,
  data,
}: {
  def: Pick<NowTileDef, "icon" | "label" | "action">;
  data: NowTileData | null;
}) {
  const value = data?.value ?? "Nie udało się sprawdzić";
  const muted = !data || data.empty;
  return (
    <li
      className={[
        "app-now__tile app-mod",
        `app-mod--${def.icon}`,
        data?.featured && "app-now__tile--wide",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="govuk-body-s app-now__label">
        <Tile name={def.icon} />
        {def.label}
      </p>
      {data?.tag && (
        <p
          className={`govuk-body-s app-now__tag app-warning--${data.tag.level}`}
        >
          {data.tag.text}
        </p>
      )}
      <p
        className={
          muted ? "govuk-heading-m app-now__value--empty" : "govuk-heading-m"
        }
      >
        {value}
      </p>
      {data && <p className="govuk-body-s">{data.note}</p>}
      {def.action && (
        <p className="govuk-body-s">
          <FieldLink
            className="govuk-link govuk-link--inverse"
            href={def.action.href}
          >
            {def.action.text}
          </FieldLink>
        </p>
      )}
    </li>
  );
}

/** The panel's head: its heading and the week it counts. */
function Head({ week }: { week: string }) {
  return (
    <div className="app-now__head">
      <h2 id="teraz" className="govuk-heading-m app-now__title">
        {HEADING}
      </h2>
      <p className="govuk-body-s">{`Lubaczów i gmina, ${week}`}</p>
    </div>
  );
}

/** The tiles as given, in one wrapping row; for the panel and its tests. */
function NowTiles({
  tiles,
}: {
  tiles: Array<{ def: NowTileDef; data: NowTileData | null }>;
}) {
  return (
    <ul className="app-now__tiles">
      {tiles.map(({ def, data }) => (
        <NowTile key={def.id} def={def} data={data} />
      ))}
    </ul>
  );
}

/** What the panel shows: the week and every tile's read (nowData). */
export type NowData = { week: Week; reads: Array<NowTileData | null> };

/**
 * Every tile's read at once, at the reads' clock (a read that fails:
 * null, its tile says so), plain JSON: the home page caches it with itself.
 */
export async function nowData(live: LiveReads): Promise<NowData> {
  const week = weekOf(todayInWarsaw(new Date(live.now)));
  const reads = await Promise.all(
    NOW_TILES.map((def) =>
      def.read(week, live).catch((error: Error) => {
        console.error(`now panel, ${def.id}: ${error.message}`);
        return null;
      }),
    ),
  );
  return { week, reads };
}

/**
 * The panel, prerendered with the home page: its head, the tiles, the
 * sources and, for the live ones, when their data last changed.
 */
export function NowPanel({ data: { week, reads } }: { data: NowData }) {
  const tiles = NOW_TILES.map((def, i) => ({ def, data: reads[i] }));
  const read = tiles.filter((t) => t.data !== null);
  const sources = read.flatMap(({ def }) => (def.source ? [def.source] : []));
  return (
    <section aria-labelledby="teraz" className="app-now">
      <Head week={`tydzień ${dayRange(week.from, week.to)}`} />
      <NowTiles tiles={tiles} />
      <SourceNote
        source={
          sources.length > 0 && (
            <>
              {"Źródła: "}
              {LIST.formatToParts(sources.map((s) => s.text)).map((part) => {
                const source = sources.find((s) => s.text === part.value);
                return source ? (
                  <a
                    key={source.href}
                    className="govuk-link govuk-link--inverse"
                    href={source.href}
                  >
                    {part.value}
                  </a>
                ) : (
                  part.value
                );
              })}
              .
            </>
          )
        }
        fresh={read.flatMap(({ def, data }) =>
          def.cadence === null
            ? []
            : [
                {
                  name: def.label.toLowerCase(),
                  changedAt: data?.changedAt ?? null,
                  cadence: def.cadence,
                },
              ],
        )}
      />
    </section>
  );
}

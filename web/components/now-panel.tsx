import { io } from "next/cache";
import Link from "next/link";
import { FragmentLink } from "@/components/fragment-link";
import { Tile } from "@/components/icon";
import { BlockSkeleton, LiveBlock } from "@/components/live-block";
import {
  NOW_TILES,
  type NowSource,
  type NowTileDef,
} from "@/components/now-tiles";
import { Skeleton } from "@/components/skeleton";
import { SourceNote } from "@/components/subpage-parts";
import { dayRange, todayInWarsaw } from "@/lib/dates";
import { freshnessLine } from "@/lib/hub";
import { LIST } from "@/lib/locale";
import { type NowTileData, weekOf } from "@/lib/now-panel";

// „Teraz w gminie” on the home page's hero (docs/layout.md): a tile per
// entry of NOW_TILES (components/now-tiles.ts), gmina-wide, for the
// current week, read per request behind its skeleton (LiveBlock), the rest
// of the page static. Every tile is one NowTile: the module's icon on its
// tile and its label, an optional level tag, the value, the window it
// counts, an optional action and its source's link („Na stronie IMGW”,
// marked as another site). The tiles wrap in
// one row by their content (site.scss .app-now__tiles: flex-wrap, a
// minimum width from GOV.UK's spacing, the last row's tiles share it);
// only a tile with an active alert (featured) takes a whole row.

const HEADING = "Teraz w gminie";

/** One tile, from its definition and its read (null: not read now). */
export function NowTile({
  def,
  data,
}: {
  def: Pick<NowTileDef, "icon" | "label" | "source">;
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
      {data?.action && (
        <p className="govuk-body-s">
          <FragmentLink
            className="govuk-link govuk-link--inverse"
            href={data.action.href}
          >
            {data.action.text}
          </FragmentLink>
        </p>
      )}
      {def.source && (
        <p className="govuk-body-s">
          <SourceLink source={def.source} />
        </p>
      )}
    </li>
  );
}

/** What a screen reader hears after a link to another site. */
export const EXTERNAL = " (strona zewnętrzna)";

/**
 * A tile's foot link to its source, „Na stronie IMGW”: another site
 * (NowSource.external) a plain <a>, its name with EXTERNAL hidden on
 * screen, the words on screen already naming whose page it is.
 */
function SourceLink({ source }: { source: NowSource }) {
  const text = `Na stronie ${source.site}`;
  const className = "govuk-link govuk-link--inverse";
  if (!source.external)
    return (
      <Link className={className} href={source.href}>
        {text}
      </Link>
    );
  return (
    <a className={className} href={source.href}>
      {text}
      <span className="govuk-visually-hidden">{EXTERNAL}</span>
    </a>
  );
}

/**
 * The panel's head: its heading and the week it counts. The skeleton's
 * (week null) has no id: both are in the streamed HTML at once.
 */
function Head({ week }: { week: string | null }) {
  return (
    <div className="app-now__head">
      <h2
        id={week ? "teraz" : undefined}
        className="govuk-heading-m app-now__title"
      >
        {HEADING}
      </h2>
      <p className="govuk-body-s">
        {week ? (
          `Lubaczów i gmina, ${week}`
        ) : (
          <Skeleton>Lubaczów i gmina, w tym tygodniu</Skeleton>
        )}
      </p>
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

/** Every tile's read at once, after io(): never prerendered. */
async function NowPanelBody() {
  await io();
  const now = Date.now();
  const week = weekOf(todayInWarsaw(new Date(now)));
  const reads = await Promise.all(
    NOW_TILES.map((def) =>
      def.read(week, now).catch((error: Error) => {
        console.error(`now panel, ${def.id}: ${error.message}`);
        return null;
      }),
    ),
  );
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
        checked={freshnessLine(
          read.map(({ def, data }) => ({
            name: def.label.toLowerCase(),
            at: data?.checkedAt ?? null,
          })),
        )}
      />
    </section>
  );
}

/** The panel's skeleton: its head and a tile per entry, each value a bar. */
function NowPanelSkeleton() {
  return (
    <BlockSkeleton>
      <section className="app-now">
        <Head week={null} />
        <ul className="app-now__tiles">
          {NOW_TILES.map((def) => (
            <li
              key={def.id}
              className={`app-now__tile app-mod app-mod--${def.icon}`}
            >
              <p className="govuk-body-s app-now__label">
                <Tile name={def.icon} />
                {def.label}
              </p>
              <p className="govuk-heading-m">
                <Skeleton>Brak przerw</Skeleton>
              </p>
              <p className="govuk-body-s">
                <Skeleton>w tym tygodniu, 9–15 listopada</Skeleton>
              </p>
              {/* Every read tile ends in one link: its source's, or
                  „Sprawdź swój termin” (smieci's action). */}
              <p className="govuk-body-s">
                <Skeleton>Na stronie IMGW</Skeleton>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </BlockSkeleton>
  );
}

/** The panel, live: its skeleton in the static shell, its tiles per request. */
export function NowPanel() {
  return (
    <LiveBlock skeleton={<NowPanelSkeleton />}>
      <NowPanelBody />
    </LiveBlock>
  );
}

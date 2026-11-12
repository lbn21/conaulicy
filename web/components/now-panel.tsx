import { io } from "next/cache";
import { FragmentLink } from "@/components/fragment-link";
import { Tile } from "@/components/icon";
import { BlockSkeleton, LiveBlock } from "@/components/live-block";
import { NOW_TILES, type NowTileDef } from "@/components/now-tiles";
import { Skeleton } from "@/components/skeleton";
import { SourceNote } from "@/components/subpage-parts";
import { dayRange, todayInWarsaw } from "@/lib/dates";
import { freshnessLine } from "@/lib/hub";
import { IMGW_PAGE } from "@/lib/imgw-shown";
import { IMGW_ATTRIBUTION, IMGW_NAME } from "@/lib/imgw-warnings";
import { LIST } from "@/lib/locale";
import { type NowTileData, weekOf } from "@/lib/now-panel";

// „Teraz w gminie” on the home page's hero (docs/layout.md): a tile per
// entry of NOW_TILES (components/now-tiles.ts), gmina-wide, for the
// current week, read per request behind its skeleton (LiveBlock), the rest
// of the page static. Every tile is one NowTile: the module's icon on its
// tile and its label (a link to its source), an optional level tag, the
// value, the window it counts and an optional action. The tiles wrap in
// one row by their content (site.scss .app-now__tiles: flex-wrap, a
// minimum width from GOV.UK's spacing, the last row's tiles share it);
// only a tile with an active alert (featured) takes a whole row.

const HEADING = "Teraz w gminie";

/** One tile, from its definition and its read (null: not read now). */
function NowTile({
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
        {def.source ? (
          <a className="govuk-link govuk-link--inverse" href={def.source.href}>
            {def.label}
          </a>
        ) : (
          def.label
        )}
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
    </li>
  );
}

/** The panel's head: its heading and the week it counts. */
function Head({ week }: { week: string | null }) {
  return (
    <div className="app-now__head">
      <h2 id="teraz" className="govuk-heading-m app-now__title">
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
  const imgw = read.some((t) => t.def.id === "pogoda");
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
              {LIST.formatToParts(sources.map((s) => s.text)).map((part, i) => {
                const source = sources.find((s) => s.text === part.value);
                return source ? (
                  // A fixed list, never reordered.
                  // biome-ignore lint/suspicious/noArrayIndexKey: as above
                  <a
                    key={i}
                    className="govuk-link govuk-link--inverse"
                    href={source.href}
                  >
                    {part.value}
                  </a>
                ) : (
                  part.value
                );
              })}
              {". "}
              {imgw && (
                <>
                  {IMGW_ATTRIBUTION.source[0]}
                  <a
                    className="govuk-link govuk-link--inverse"
                    href={IMGW_PAGE}
                  >
                    {IMGW_NAME}
                  </a>
                  {`${IMGW_ATTRIBUTION.source[1]} ${IMGW_ATTRIBUTION.processed}`}
                </>
              )}
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

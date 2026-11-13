// The address page's timeline (components/timeline.tsx, components/day.tsx),
// on every place of the CI fixture (t373, t384): a card only for a day with
// something, today's dot alone filled.
//   - in each page's HTML: exactly one row marked today
//     (app-timeline__today), the first; no empty row (app-timeline__empty)
//     has a badge; today's row, empty, says today's word (Intl's,
//     lib/dates.ts relativeDay) to screen readers only, after its date, and
//     no other row does; today's card has its strong badge; a day's h3
//     shows its date alone, no weekday (t385), its weekday a line under it
//     (aria-hidden) and in the h3 for screen readers only; a run of days
//     (app-timeline__range) no weekday line;
//   - rendered, at 390 px, on one place of each kind of today the fixture
//     gives (something today; an empty today alone before a day with
//     something; an empty run from today before one; all 7 days empty):
//     today's dot filled in the text colour and no other; an empty row has
//     no frame (its card's border transparent, no shadow); every card with
//     something the same frame, today's and tomorrow's too (t385: border
//     width, colour and shadow, the caret's border).
// Which kinds the fixture gives depends on the date, so the check names
// those it saw; the four at a fixed date are components/hub.test.ts's.
// Places from the search index, never named here.
import { dayFace, relativeDay } from "../../lib/dates.ts";
import { searchIndexOf } from "../lib/server.mjs";

const ITEM = /<li(?: class="([^"]*)")?><span class="app-timeline__dot"/g;
const ROW = /<li(?: class="[^"]*")?><span class="app-timeline__dot".*?<\/li>/gs;
/** What an empty row holding today says to screen readers only. */
const HIDDEN_TODAY = `<span class="govuk-visually-hidden">, ${relativeDay("2026-01-01", "2026-01-01")}</span>`;

/** Intl's weekdays, Monday to Sunday (2026-11-02 a Monday). */
const WEEKDAYS = [2, 3, 4, 5, 6, 7, 8].map(
  (d) => dayFace(`2026-11-${String(d).padStart(2, "0")}`).weekday,
);
const WEEKDAY_LINE =
  /<\/h3><p class="govuk-body-s[^"]*" aria-hidden="true">([^<]*)<\/p>/;

/** Today's kind, from the rows' classes (the later card's left out). */
function kindOf(classes) {
  const days = classes.filter((c) => !c.includes("app-timeline__later"));
  const first = days[0] ?? "";
  if (!first.includes("app-timeline__empty")) return "something today";
  if (days.length === 1) return "all 7 days empty";
  return first.includes("app-timeline__range")
    ? "an empty run from today, then a day with something"
    : "an empty today alone, then a day with something";
}

/** Computed: each row's dot filled or not, and an empty row's frame. */
const rendered = (page) =>
  page.$$eval(".app-timeline > li", (items) => {
    // GOV.UK's text colour, as the h1 has it (the body's is not).
    const text = getComputedStyle(document.querySelector("main h1")).color;
    return items.map((li) => {
      const dot = getComputedStyle(li.querySelector(".app-timeline__dot"));
      const card = getComputedStyle(li.querySelector(".app-timeline__card"));
      return {
        today: li.classList.contains("app-timeline__today"),
        empty: li.classList.contains("app-timeline__empty"),
        filled: dot.backgroundColor === text,
        frame: `${card.borderTopWidth} ${card.borderTopColor} ${card.boxShadow} ${getComputedStyle(li, "::after").borderLeftWidth}`,
        framed:
          card.borderTopColor !== "rgba(0, 0, 0, 0)" ||
          card.boxShadow !== "none",
      };
    });
  });

export async function check({ origin }, failures) {
  const home = await (await fetch(`${origin}/`)).text();
  const { places } = await searchIndexOf(origin, home);
  const sample = new Map();
  let pages = 0;
  for (const [id] of places) {
    const html = await (await fetch(`${origin}/adres/${id}`)).text();
    const list = /<ol class="app-timeline[^"]*">.*?<\/ol>/s.exec(html)?.[0];
    if (!list) continue;
    pages++;
    const classes = [...list.matchAll(ITEM)].map(([, c = ""]) => c);
    const today = classes.flatMap((c, i) =>
      c.includes("app-timeline__today") ? [i] : [],
    );
    if (today.length !== 1 || today[0] !== 0)
      failures.push(
        `/adres/${id}: today's row ${today.length === 1 ? `is row ${today[0] + 1}` : `marked ${today.length} times`}, not once on the first`,
      );
    (list.match(ROW) ?? []).forEach((row, i) => {
      const at = `/adres/${id} row ${i + 1}`;
      const empty = row.includes("app-timeline__empty");
      const isToday = row.includes("app-timeline__today");
      if (empty && row.includes("app-badge"))
        failures.push(`${at}: an empty row has a badge`);
      if (row.includes(HIDDEN_TODAY) !== (empty && isToday))
        failures.push(
          `${at}: ${empty && isToday ? "empty today, no hidden word for today" : "a hidden word for today, not an empty today"}`,
        );
      if (isToday && !empty && !row.includes("app-badge--strong"))
        failures.push(`${at}: today's card has no strong badge`);
      if (row.includes("app-timeline__later")) return;
      const range = row.includes("app-timeline__range");
      const heading = /<h3[^>]*>(.*?)<\/h3>/s.exec(row)?.[1] ?? "";
      const visible = heading
        .replace(
          /<span class="govuk-visually-hidden">.*?<\/span>|<span class="app-badge.*?<\/span>|<[^>]+>/g,
          "",
        )
        .toLowerCase();
      if (WEEKDAYS.some((w) => visible.includes(w)))
        failures.push(`${at}: a weekday in its heading`);
      const line = WEEKDAY_LINE.exec(row)?.[1];
      if (range && line !== undefined)
        failures.push(`${at}: a run of days with a weekday line`);
      if (!range && !WEEKDAYS.includes(line))
        failures.push(`${at}: a single day without its weekday line`);
      if (
        !range &&
        line &&
        !heading.includes(
          `<span class="govuk-visually-hidden">, ${line}</span>`,
        )
      )
        failures.push(
          `${at}: its weekday not in its heading for screen readers`,
        );
    });
    const kind = kindOf(classes);
    if (!sample.has(kind)) sample.set(kind, id);
  }
  if (pages === 0) failures.push("no address page has a timeline");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const [kind, id] of sample) {
      const page = await (
        await browser.newContext({
          viewport: { width: 390, height: 900 },
          reducedMotion: "reduce",
        })
      ).newPage();
      await page.goto(`${origin}/adres/${id}`, { waitUntil: "networkidle" });
      const list = await rendered(page);
      const frames = new Set(
        list.filter((row) => !row.empty).map((row) => row.frame),
      );
      if (frames.size > 1)
        failures.push(
          `/adres/${id} (${kind}): cards framed ${frames.size} ways: ${[...frames].join(" | ")}`,
        );
      list.forEach((row, i) => {
        const at = `/adres/${id} (${kind}) row ${i + 1}`;
        if (row.filled !== row.today)
          failures.push(
            `${at}: its dot ${row.filled ? "filled" : "not filled"}, ${row.today ? "" : "not "}today`,
          );
        if (row.empty && row.framed) failures.push(`${at}: empty, framed`);
      });
    }
  } finally {
    await browser.close();
  }
  return `Timeline: ${pages} pages, today once on the first row, its dot alone filled, no badge on an empty row, today's hidden word on an empty today, the weekday under a day's date (none on a run), every card one frame; seen today: ${[...sample.keys()].join("; ")}.`;
}

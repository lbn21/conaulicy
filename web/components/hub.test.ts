import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dayFace, relativeDay } from "../lib/dates.ts";
import { unchecked } from "../lib/hub.ts";
import { copyCheckedAt } from "../lib/imgw-fixture.ts";
import { IMGW_PAGE } from "../lib/imgw-shown.ts";
import { IMGW_ATTRIBUTION, IMGW_NAME } from "../lib/imgw-warnings.ts";
import { MODULES } from "../lib/modules.ts";
import type { PgeOutage } from "../lib/pge-feed.ts";
import { type Power, power } from "../lib/power-module.ts";
import type { PlaceView } from "../lib/schedule.ts";
import {
  CHECKED,
  NOW,
  POST_39885,
  storedPost,
  testPlace,
  zukFile,
} from "../lib/water-fixture.ts";
import { type Water, water } from "../lib/water-module.ts";
import { type Weather, weather } from "../lib/weather-module.ts";
import { zukView } from "../lib/zuk-data.ts";
import { Hub } from "./hub.tsx";
import { WarsawToday } from "./warsaw-today.tsx";

// The address page (components/hub.tsx Hub) as HubMain renders it, for the
// server's Warsaw day, at the water fixture's NOW (Sunday 25 Oct 2026, 13:30
// in Warsaw): the notices, a card per IMGW warning, the
// timeline („Najbliższe 7 dni”, then „Później”), „Wszystko o Twoim
// adresie” and the small print at the end. Structure and data only: the
// page's own words are never pinned here; where a test needs them, it reads
// them from their source (MODULES, unchecked, IMGW_ATTRIBUTION).

/** PGE checked at NOW, nothing at the place: no row, no line of its own. */
const noOutages = (place: PlaceView) =>
  power(
    {
      feed: { fetchedAt: NOW.toISOString(), items: [] },
      checkedAt: NOW.getTime(),
    },
    place,
    NOW.getTime(),
  );

const page = (
  place: PlaceView,
  cuts: Water | null = null,
  warnings: Weather | null = null,
  outages: Power | null = noOutages(place),
) => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  try {
    // Icons (components/icon.tsx) as <svg/>: their shapes are Lucide's.
    return unicons(
      renderToStaticMarkup(
        createElement(
          WarsawToday,
          { day: place.today },
          createElement(Hub, {
            data: [place, cuts, outages, warnings],
            place,
            now: NOW.getTime(),
          }),
        ),
      ),
    );
  } finally {
    mock.timers.reset();
  }
};

/** The icons drawn as <svg/>, every one aria-hidden. */
function unicons(html: string) {
  for (const [svg] of html.matchAll(/<svg\b[^>]*>/g))
    assert.match(svg, /aria-hidden="true"/);
  return html.replace(/<svg\b.*?<\/svg>/g, "<svg/>");
}
/** „, dzisiaj”: an empty row holding today, after its date (Intl's word). */
const TODAY_WORD = `, ${relativeDay("2026-10-25", "2026-10-25")}`;
const count = (html: string, text: string) => html.split(text).length - 1;
/**
 * A single day's h3 as its text reads (t385): the date alone on screen,
 * its weekday (Intl's, lib/dates.ts dayFace) for screen readers only.
 */
const dayHeading = (iso: string) => {
  const { day, month, weekday } = dayFace(iso);
  return `${day} ${month}, ${weekday}`;
};
/** The text of each `<tag>` in the html, tags stripped. */
const texts = (html: string, tag: string) =>
  [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>(.*?)</${tag}>`, "g"))].map(
    (m) => m[1].replace(/<[^>]+>/g, ""),
  );
/** The section labelled by `id`. */
/** The source note, the page's last block (SourceNote's inset), as html. */
const smallPrintHtml = (html: string) =>
  /<div class="govuk-inset-text">((?:<p class="govuk-body-s app-quiet[^"]*">(?:(?!<\/p>).)*<\/p>)+)<\/div><\/div><\/div>$/.exec(
    html,
  )?.[1] ?? "";
/** The small print's text, tags stripped. */
const smallPrint = (html: string) =>
  smallPrintHtml(html)
    .replace(/<\/p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("\u00a0", " ")
    .trim();
/**
 * The check times in the source note (lib/hub.ts freshnessLine, each day
 * once): each module's title and when ("25 października 13:30", or the day
 * alone). Its words are LIST's and the line's, read by their shape only.
 */
const checkTimes = (html: string) =>
  new Map(
    // Its own line, the note's last.
    (/^\S+ (.*)\.$/.exec(smallPrint(html).split("\n").at(-1) ?? "")?.[1] ?? "")
      .split("; ")
      .flatMap((group) => {
        const [day, list] = group.split(": ");
        return list.split(/, | i /).map((entry) => {
          const time = / (\d{1,2}:\d{2})$/.exec(entry)?.[1];
          const name = time ? entry.slice(0, -time.length - 1) : entry;
          return [name, time ? `${day} ${time}` : day] as const;
        });
      }),
  );
const section = (html: string, id: string) =>
  new RegExp(`<section aria-labelledby="${id}">.*?</section>`).exec(
    html,
  )?.[0] ?? "";

// A village with two cuts (39885: Lisie Jamy, 26 and 29 Oct) and the
// derived IMGW warning in force (25 Oct 13:00-19:00), no waste schedule.
const VILLAGE = testPlace({
  id: "0606257",
  kind: "wies",
  name: "Smolińce",
  label: "Smolińce",
  group: "0606257",
  gmina: "Lubaczów (gmina)",
  localityId: "0606257",
  streetId: null,
});
const CUTS = water(
  {
    "gmina-lubaczow": zukView(
      zukFile([storedPost(POST_39885, CHECKED)], CHECKED),
      NOW,
    ),
  },
  VILLAGE,
);
const WARNINGS = weather(
  copyCheckedAt("2026-10-25T13:20:00+01:00"),
  NOW.getTime(),
);

// A street with a waste schedule and its source.
const SOURCE = {
  url: "https://example.org/harmonogram.pdf",
  label: "sektor 1",
  checkedAt: "2026-10-20",
  seenAt: null,
};
const pickup = (label: string, putOutBy: string | null = null) => ({
  id: label.toLowerCase(),
  subtype: label.toLowerCase(),
  label,
  putOutBy,
  shiftedFrom: null,
});
const STREET = testPlace({
  id: "0000001-00001",
  name: "ul. Próbna",
  label: "ul. Próbna, Wzorowo",
  area: "Wzorowo",
  group: "0000001",
  gmina: "Wzorowo",
  localityId: "0000001",
  streetId: "0000001-00001",
  zoneId: "waste:sektor-1",
  schedulePage: "https://example.org/harmonogram",
  sources: [SOURCE],
  fractions: ["papier", "szkło", "bio"],
  days: [
    { date: "2026-10-27", pickups: [pickup("Papier", "06:00")] },
    { date: "2026-11-03", pickups: [pickup("Szkło")] },
    { date: "2026-11-10", pickups: [pickup("Bio")] },
  ],
});

test("timeline: a card per day from today, 2+ empty days as one, Intl's titles", () => {
  assert.ok(WARNINGS);
  const html = page(VILLAGE, CUTS, WARNINGS);
  const timeline = section(html, "najblizsze-dni");
  assert.match(
    timeline,
    /^<section aria-labelledby="najblizsze-dni"><h2 id="najblizsze-dni" class="govuk-heading-m">[^<]+<\/h2><ol class="app-timeline govuk-!-font-size-19">/,
  );
  // 25-31 Oct: today, the cut on 26, 27-28 empty, the cut on 29, 30-31
  // empty; nothing after the window, so no „Później”.
  assert.deepEqual(texts(timeline, "h3"), [
    // Today empty (its warning is a card above): a plain row, no badge,
    // today's word for screen readers only (Intl's, TODAY_WORD).
    `${dayHeading("2026-10-25")}${TODAY_WORD}`,
    `${dayHeading("2026-10-26")},  Jutro`,
    "27–28 października",
    `${dayHeading("2026-10-29")},  Za 4 dni`,
    "30–31 października",
  ]);
  // The days' li (the chips are li too, of their own lists).
  assert.equal(
    timeline.match(/<li(?: class="app-timeline__[^"]*")?>/g)?.length,
    5,
  );
  // Today's row, and only it, marked: its dot filled (site.scss).
  assert.equal(count(timeline, "app-timeline__today"), 1);
  assert.equal(
    count(timeline, '<li class="app-timeline__empty app-timeline__range">'),
    2,
  );
  // No waste schedule here, and an empty day still says just that (a line
  // of its own); today has only the warning, which is a card, not a row.
  assert.equal(count(timeline, "app-timeline__card--empty"), 3);
  assert.doesNotMatch(timeline, /app-timeline__later/);
});

test("timeline: each cut once, its row, „Szczegóły” to its subpage; no warning", () => {
  const html = page(VILLAGE, CUTS, WARNINGS);
  const timeline = section(html, "najblizsze-dni");
  assert.equal(
    count(timeline, "govuk-summary-list__row app-mod app-mod--woda"),
    2,
  );
  // Its tile and label, a badge, what is cut, its hours as a chip, where;
  // the action to its subpage with a hidden suffix naming its day.
  assert.match(
    html,
    /<div class="govuk-summary-list__row app-mod app-mod--woda[^"]*"><dt class="govuk-summary-list__key"><span class="app-tile app-mod app-mod--woda"><svg\/><\/span>[^<]+<\/dt><dd class="govuk-summary-list__value"><p class="govuk-body-s govuk-!-margin-bottom-0"><strong class="app-badge app-badge--mod">[^<]+<\/strong>[^<]+<\/p><ul class="app-chips"><li class="app-chip"><svg\/>[^<]*8:00[^<]*16:00[^<]*<\/li><\/ul><p class="govuk-body-s govuk-!-margin-top-2 govuk-!-margin-bottom-0 app-quiet">[^<]*Lisie Jamy[^<]*<\/p><\/dd><dd class="govuk-summary-list__actions"><a class="govuk-link" href="\/adres\/0606257\/woda">[^<]+<span class="govuk-visually-hidden">[^<]*26 października<\/span><\/a><\/dd>/,
  );
  // Warnings are cards above the timeline, never in it, and no tag at all.
  assert.doesNotMatch(timeline, /app-warning/);
  assert.doesNotMatch(html, /govuk-tag|\/pogoda/);
  // Every card's last row has no border under it.
  assert.equal(
    count(html, "govuk-summary-list__row--no-border"),
    count(html, '<dl class="govuk-summary-list'),
  );
});

test("a warning: its card above the timeline, the meter, when, IMGW's words", () => {
  const html = page(VILLAGE, CUTS, WARNINGS);
  const card =
    /<section class="app-warning[^"]*"[^>]*>.*?<\/section>/.exec(html)?.[0] ??
    "";
  assert.equal(count(html, 'class="app-warning '), 1);
  assert.ok(html.indexOf(card) < html.indexOf("najblizsze-dni"));
  assert.match(
    card,
    /^<section class="app-warning app-warning--1" aria-labelledby="ostrzezenie-Sk20261024094213061"><p class="app-warning__level govuk-body-s govuk-!-font-weight-bold"><span class="app-warning__meter" aria-hidden="true"><span class="app-warning__on"><\/span><span><\/span><span><\/span><\/span><svg\/>[^<]*1[^<]*<\/p><div class="app-warning__body app-mod app-mod--pogoda"><h2 id="ostrzezenie-Sk20261024094213061" class="govuk-heading-m govuk-!-margin-bottom-2"><span class="app-tile app-mod app-mod--pogoda"><svg\/><\/span>Silny wiatr<\/h2><p class="govuk-body">[^<]*25 października 19:00[^<]*<\/p><details class="govuk-details govuk-!-margin-bottom-0"><summary class="govuk-details__summary"><span class="govuk-details__summary-text">[^<]+<\/span><\/summary><div class="govuk-details__text">Prognozuje się wystąpienie /,
  );
  // No source link in the card: the small print has IMGW's.
  assert.doesNotMatch(card, /<a /);
});

test("several warnings: highest level first, then the earliest; each its meter and when", () => {
  const [ours] = copyCheckedAt("2026-10-25T13:20:00+01:00").feed.items.filter(
    (item) => item.teryt.includes("1809"),
  );
  const later = "2026-10-25T16:00:00+01:00";
  const items = [
    { ...ours, id: "a", level: 1 as const },
    { ...ours, id: "b", level: 3 as const, validFrom: later },
    { ...ours, id: "c", level: 3 as const },
    { ...ours, id: "d", level: 2 as const },
  ];
  const html = page(
    VILLAGE,
    CUTS,
    weather(copyCheckedAt("2026-10-25T13:20:00+01:00", items), NOW.getTime()),
  );
  const cards = [
    ...html.matchAll(
      /<section class="app-warning app-warning--(\d)" aria-labelledby="ostrzezenie-(\w)">(.*?)<\/section>/g,
    ),
  ];
  assert.deepEqual(
    cards.map(([, level, id]) => `${id}${level}`),
    ["c3", "b3", "d2", "a1"],
  );
  for (const [, level, , card] of cards) {
    assert.equal(count(card, "app-warning__on"), Number(level));
    // The level in words too, never colour alone: its digit in the band.
    assert.match(
      card,
      new RegExp(`<p class="app-warning__level[^>]*>(?:(?!</p>).)*${level}`),
    );
  }
  // Begun: only its end; to come: its start too (Intl's range).
  const when = cards.map(([, , , card]) =>
    /<p class="govuk-body">([^<]*)<\/p>/.exec(card)?.[1].replace(/\s/g, " "),
  );
  assert.deepEqual(
    when.map((text) => text?.match(/\d{1,2}:\d{2}/g)),
    [["19:00"], ["16:00", "19:00"], ["19:00"], ["19:00"]],
  );
  assert.ok(when.every((text) => text?.includes("25 października")));
});

test("no warning: no card and nothing in its place", () => {
  const none = weather(
    copyCheckedAt("2026-10-25T13:20:00+01:00", []),
    NOW.getTime(),
  );
  const html = page(VILLAGE, CUTS, none);
  assert.doesNotMatch(html, /app-warning/);
  assert.match(html, /<\/div><section aria-labelledby="najblizsze-dni">/);
});

test("„Wszystko o Twoim adresie” and the small print: a link per module with a source, then the checks and IMGW's words", () => {
  const html = page(VILLAGE, CUTS, WARNINGS);
  // The weather has no subpage: no link for it.
  // A card per module: one link, in a plain h3 (its name the title), and
  // how many in the window: a badge when there are some, else plain grey
  // text, never a pill.
  const links = section(html, "wszystko");
  assert.deepEqual(texts(links, "a"), [MODULES.woda.more, MODULES.prad.more]);
  assert.deepEqual(texts(links, "h3"), [MODULES.woda.more, MODULES.prad.more]);
  for (const card of links.split("<li ").slice(1))
    assert.equal(count(card, "<a "), 1);
  const badges = [
    ...links.matchAll(/<strong class="(app-badge[^"]*)">([^<]*)</g),
  ];
  assert.deepEqual(
    badges.map(([, tone]) => tone),
    ["app-badge app-badge--mod"],
  );
  assert.match(badges[0][2], /^2\D/);
  assert.equal(count(links, 'app-quiet">'), 2);
  // A card with nothing in the window is muted: its title regular, its
  // tile grey (no module colour); one with something keeps both.
  const [full, empty] = links.split("<li ").slice(1);
  assert.match(full, /app-tile app-mod app-mod--woda/);
  assert.doesNotMatch(full, /font-weight-regular|app-tile[^"]*app-quiet/);
  assert.match(empty, /<span class="app-tile app-mod app-quiet">/);
  assert.match(empty, /<h3 class="[^"]*govuk-!-font-weight-regular"/);
  assert.doesNotMatch(empty, /app-tile[^"]*app-mod--/);
  // The same card otherwise: one link, the chevron.
  assert.equal(count(empty, "<a "), 1);
  assert.equal(count(empty, "<svg/>"), count(full, "<svg/>"));
  // The checks, with their times; no waste check here, so waste is left
  // out; then IMGW's required wording, as given (IMGW_ATTRIBUTION).
  const small = smallPrint(html);
  const times = checkTimes(html);
  assert.ok(times.has(MODULES.woda.title));
  assert.equal(times.get(MODULES.prad.title), "25 października 13:30");
  assert.equal(times.get(MODULES.pogoda.title), "25 października 13:20");
  assert.ok(!times.has(MODULES.smieci.title));
  // IMGW's wording, then the checks on their own line (t373).
  assert.ok(small.split("\n")[0].endsWith(IMGW_ATTRIBUTION.processed));
  // The weather has no subpage: its source link is IMGW's name here.
  assert.ok(
    smallPrintHtml(html).includes(
      `<a class="govuk-link" href="${IMGW_PAGE}">${IMGW_NAME}</a>`,
    ),
  );
  // The other sources are on the subpages: no source block on the hub.
  assert.doesNotMatch(
    html,
    /<div class="govuk-inset-text"><p class="govuk-hint/,
  );
  // IMGW's required wording, once.
  assert.equal(count(html, IMGW_NAME), 1);
});

test("no waste source: why, in the notices; no waste link, meta line or row", () => {
  const html = page(VILLAGE, CUTS, WARNINGS);
  assert.match(
    html,
    /<div class="govuk-inset-text"><p class="govuk-body">[^<]+<\/p><\/div><section class="app-warning /,
  );
  assert.doesNotMatch(html, /app-mod--smieci|\/smieci/);
});

test("a live module not checked says so; nothing is claimed for it", () => {
  const html = page(VILLAGE, null, null, null);
  assert.match(
    html,
    new RegExp(
      `<div class="govuk-inset-text">.*${[
        MODULES.woda,
        MODULES.prad,
        MODULES.pogoda,
      ]
        .map(
          (module) =>
            `<p class="govuk-body">${unchecked(module).replace(/\./g, "\\.")}</p>`,
        )
        .join("")}</div>`,
    ),
  );
  assert.doesNotMatch(html, /\/woda"|\/prad"|\/pogoda"/);
});

test("nothing in the window and nothing later: one line, no cards; the links and small print stay", () => {
  // A street with its waste source but no dates left; water and weather
  // not checked (their notices say so).
  const html = page(testPlace({ ...STREET, days: [] }));
  assert.match(
    section(html, "najblizsze-dni"),
    /^<section aria-labelledby="najblizsze-dni"><h2 id="najblizsze-dni" class="govuk-heading-m">[^<]+<\/h2><p class="app-empty govuk-body">[^<]+<\/p><\/section>$/,
  );
  assert.doesNotMatch(html, /app-timeline/);
  assert.ok(section(html, "wszystko").includes(`>${MODULES.smieci.more}</a>`));
  assert.equal(checkTimes(html).get(MODULES.smieci.title), "20 października");
  // IMGW not read: none of its wording.
  assert.equal(count(html, IMGW_NAME), 0);
  // Not checked is never „nothing”: the notice says so, above the line.
  assert.ok(
    html.indexOf(unchecked(MODULES.woda)) < html.indexOf('class="app-empty'),
  );
});

test("a split street without a number: „Podaj numer domu” above the timeline", () => {
  const html = page(
    testPlace({ ...STREET, askNumber: true, zoneId: null, sources: [] }),
  );
  assert.match(html, />Podaj numer domu<\/a>/);
  assert.ok(html.indexOf("Podaj numer domu") < html.indexOf("najblizsze-dni"));
});

test("waste: its pickups by day; in the window, so no „Później” for it", () => {
  const html = page(STREET);
  const timeline = section(html, "najblizsze-dni");
  assert.deepEqual(texts(timeline, "h3"), [
    // An empty today and tomorrow: one run.
    `25–26 października${TODAY_WORD}`,
    `${dayHeading("2026-10-27")},  Pojutrze`,
    "28–31 października",
  ]);
  assert.doesNotMatch(html, /app-timeline__later/);
  assert.match(
    timeline,
    /<dt class="govuk-summary-list__key"><span class="app-tile app-mod app-mod--smieci"><svg\/><\/span>[^<]+<\/dt><dd class="govuk-summary-list__value">.*?Papier.*?<p class="govuk-body-s govuk-!-margin-top-2 govuk-!-margin-bottom-0 app-quiet">[^<]*6:00[^<]*<\/p><\/dd><dd class="govuk-summary-list__actions"><a class="govuk-link" href="\/adres\/0000001-00001\/smieci">[^<]+<span class="govuk-visually-hidden">[^<]*27 października<\/span>/,
  );
});

/**
 * The timeline's day rows, in order: their classes, their date's words on
 * screen (no badge, nothing visually hidden), their badge's class, or
 * null, and the weekday line under the h3 (aria-hidden), or null.
 */
const rows = (html: string) =>
  [
    ...section(html, "najblizsze-dni").matchAll(
      /<li(?: class="([^"]*)")?><span class="app-timeline__dot"[^>]*><\/span>.*?<h3[^>]*>(.*?)<\/h3>(?:<p class="govuk-body-s[^"]*" aria-hidden="true">([^<]*)<\/p>)?/g,
    ),
  ].map(([, classes = "", title, weekday = null]) => ({
    classes: classes.split(" ").filter(Boolean),
    date: title
      .replace(
        /<span class="govuk-visually-hidden">.*?<\/span>|<span class="app-badge.*?<\/span>|<[^>]+>/g,
        "",
      )
      .trim(),
    badge: /<span class="(app-badge[^"]*)"/.exec(title)?.[1] ?? null,
    weekday,
    hiddenWeekday:
      /<span class="govuk-visually-hidden">, ([^<]*)<\/span>/.exec(
        title,
      )?.[1] ?? null,
  }));

/** The street with waste on `dates` only (STREET's pickup). */
const wasteOn = (...dates: string[]) =>
  page({
    ...STREET,
    days: dates.map((date) => ({ date, pickups: [pickup("Papier")] })),
  });

const TODAY = "app-timeline__today";
/** What an empty row holding today says to screen readers only. */
const HIDDEN_TODAY = `<span class="govuk-visually-hidden">${TODAY_WORD}</span>`;
const EMPTY = "app-timeline__empty";
const STRONG = "app-badge app-badge--strong";

// t373: a card only for a day with something; an empty day or run, today
// and tomorrow included, a plain row without a badge; today's row marked in
// the markup (its dot filled, site.scss), and no other, whatever its badge.
test("timeline: an empty today alone is a plain row, marked today; tomorrow's card is not", () => {
  const html = wasteOn("2026-10-26");
  const [today, tomorrow, ...rest] = rows(html);
  assert.deepEqual(today.classes, [TODAY, EMPTY]);
  assert.equal(count(html, HIDDEN_TODAY), 1);
  assert.equal(today.badge, null);
  assert.match(today.date, /25/);
  assert.deepEqual(tomorrow.classes, []);
  assert.equal(tomorrow.badge, STRONG);
  assert.ok(rest.every((row) => !row.classes.includes(TODAY)));
});

test("timeline: an empty today and tomorrow before a day with something: one run, marked today", () => {
  const html = wasteOn("2026-10-27");
  const [run, day] = rows(html);
  assert.deepEqual(run.classes, [TODAY, EMPTY, "app-timeline__range"]);
  // The range keeps its date on screen, „dzisiaj” for screen readers only,
  // once: the later empty run (28–31) says nothing of today.
  assert.equal(count(html, HIDDEN_TODAY), 1);
  assert.equal(run.badge, null);
  assert.deepEqual(day.classes, []);
  assert.notEqual(day.badge, null);
});

test("timeline: all 7 days empty: one run from today, then „Później”", () => {
  const html = wasteOn("2026-11-10");
  const list = rows(html);
  assert.equal(count(html, HIDDEN_TODAY), 1);
  assert.deepEqual(
    list.map((row) => row.classes),
    [[TODAY, EMPTY, "app-timeline__range"], ["app-timeline__later"]],
  );
  assert.equal(list[0].badge, null);
});

test("timeline: something today: today's card, its strong badge, marked today", () => {
  const html = wasteOn("2026-10-25", "2026-10-26");
  const [today, ...rest] = rows(html);
  assert.deepEqual(today.classes, [TODAY]);
  // A card's badge says it: no hidden word.
  assert.equal(count(html, HIDDEN_TODAY), 0);
  assert.equal(today.badge, STRONG);
  // Tomorrow keeps its strong badge, not today's mark.
  assert.deepEqual(rest[0].classes, []);
  assert.equal(rest[0].badge, STRONG);
  assert.equal(count(section(html, "najblizsze-dni"), TODAY), 1);
});

// t385: a day's h3 shows its date alone (and its badge), its weekday a
// line under it, aria-hidden, and in the h3 for screen readers only; a run
// of empty days its range, no weekday anywhere.
test("timeline: a day's weekday under its date, not in it; none on a run", () => {
  // 25 empty, 26 a pickup, 27–28 empty, 29 a pickup, 30–31 empty.
  const list = rows(wasteOn("2026-10-26", "2026-10-29"));
  assert.deepEqual(
    list.map((row) => row.classes.includes("app-timeline__range")),
    [false, false, true, false, true],
  );
  for (const row of list) {
    const range = row.classes.includes("app-timeline__range");
    const weekdays = [
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ].map((d) => dayFace(d).weekday);
    // The heading's visible words: no weekday, its first letter a digit.
    assert.ok(weekdays.every((w) => !row.date.toLowerCase().includes(w)));
    assert.match(row.date, /^\d/);
    if (range) {
      assert.equal(row.weekday, null);
      assert.equal(row.hiddenWeekday, null);
    } else {
      assert.ok(row.weekday && weekdays.includes(row.weekday));
      // Read once, in the heading, as on screen.
      assert.equal(row.hiddenWeekday, row.weekday);
    }
  }
  // An empty single day too (25), and today's hidden word still one string.
  assert.equal(list[0].weekday, dayFace("2026-10-25").weekday);
  assert.equal(count(wasteOn("2026-10-26", "2026-10-29"), HIDDEN_TODAY), 1);
});

test("waste only after the window: „Później”, its next pickup with its year", () => {
  const html = page(testPlace({ ...STREET, days: STREET.days.slice(1) }));
  const timeline = section(html, "najblizsze-dni");
  assert.deepEqual(texts(timeline, "h3")[0], `25–31 października${TODAY_WORD}`);
  assert.equal(count(timeline, "<h3 "), 2);
  // „Później”: only the next pickup after the window, its date the value.
  const later = /<li class="app-timeline__later">.*?<\/li>/.exec(timeline)?.[0];
  assert.ok(later);
  assert.match(
    later,
    /<dt class="govuk-summary-list__key"><span class="app-tile app-mod app-mod--smieci"><svg\/><\/span>[^<]+<\/dt><dd class="govuk-summary-list__value">Wtorek, 3 listopada 2026<\/dd>/,
  );
  assert.doesNotMatch(later, /10 listopada/);
  // The waste subpage's link and its check in the small print.
  assert.ok(
    section(html, "wszystko").includes(
      `<a class="govuk-link govuk-link--text-colour govuk-link--no-underline app-item__link" href="/adres/0000001-00001/smieci">${MODULES.smieci.more}</a>`,
    ),
  );
  const checks = smallPrint(html);
  const times = checkTimes(html);
  assert.equal(times.get(MODULES.smieci.title), "20 października");
  assert.equal(times.get(MODULES.prad.title), "25 października 13:30");
  // Dates not checked yet: the small print stays the same (the caveat is
  // on the waste subpage).
  assert.equal(
    smallPrint(page(testPlace({ ...STREET, verified: false }))),
    checks,
  );
});

test("a house number given: every subpage link keeps it", () => {
  const html = page(testPlace({ ...STREET, givenNr: "12a" }));
  // The row's action and the module's card, both with the number.
  assert.equal(count(html, 'href="/adres/0000001-00001/smieci?nr=12a"'), 2);
  assert.doesNotMatch(html, /href="\/adres\/0000001-00001\/smieci"/);
});

test("power: its row as the water's, a range each, after the water; its notice with PGE's page", () => {
  const outage = (over: Partial<PgeOutage>): PgeOutage => ({
    uuid: "p1",
    kind: "planned",
    revoked: false,
    revokedNote: null,
    ranges: [
      { start: "2026-10-26T08:00:00+01:00", end: "2026-10-26T09:00:00+01:00" },
      { start: "2026-10-26T19:00:00+01:00", end: "2026-10-26T20:00:00+01:00" },
    ],
    addresses: [{ simc: VILLAGE.localityId, ulic: null, numbers: "1, 3/1" }],
    updatedAt: null,
    ...over,
  });
  const copy = (checkedAt: number, items: PgeOutage[]) => ({
    feed: { fetchedAt: new Date(checkedAt).toISOString(), items },
    checkedAt,
  });
  const items = [outage({}), outage({ uuid: "p2", revoked: true })];
  const html = page(
    VILLAGE,
    CUTS,
    WARNINGS,
    power(copy(NOW.getTime(), items), VILLAGE, NOW.getTime()),
  );
  // Two ranges, one row with a chip each; the revoked one in none.
  const rows = [
    ...html.matchAll(
      /<div class="govuk-summary-list__row app-mod app-mod--prad[^"]*">(.*?)<\/div>/g,
    ),
  ].map(([, row]) => row);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    [...rows[0].matchAll(/<li class="app-chip"><svg\/>([^<]*)<\/li>/g)].map(
      ([, window]) => window.match(/\d{1,2}:\d{2}/g),
    ),
    [
      ["8:00", "9:00"],
      ["19:00", "20:00"],
    ],
  );
  // After the water's rows, on the same day.
  assert.ok(html.indexOf("app-mod--woda") < html.indexOf("app-mod--prad"));
  // Over an hour old: the notice in the inset, PGE's page linked.
  const stale = page(
    VILLAGE,
    CUTS,
    WARNINGS,
    power(copy(NOW.getTime() - 70 * 60_000, items), VILLAGE, NOW.getTime()),
  );
  assert.match(
    stale,
    /<div class="govuk-inset-text">(?:(?!<\/div>).)*12:20(?:(?!<\/div>).)*<a href="https:\/\/pgedystrybucja\.pl\/wylaczenia\/aktualne-przerwy-w-dostawie-energii" class="govuk-link">/,
  );
});

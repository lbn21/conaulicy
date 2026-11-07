import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { todayInWarsaw, warsawToIso } from "../lib/dates.ts";
import { span } from "../lib/hub.ts";
import type { Item } from "../lib/upcoming.ts";
import { Upcoming } from "./upcoming.tsx";
import { WarsawToday } from "./warsaw-today.tsx";

// „Najbliższe dni” (components/upcoming.tsx, task 261) as the server
// renders it per request: the week's timeline at `now`, every date absolute,
// „Dziś” and „Jutro” for the server's Warsaw day, in the HTML
// (components/timeline-day.tsx).
// At 23:58 on Wednesday 28 Oct, and at 00:05.
const wall = (w: string) => warsawToIso(w) as string;
const NOW = Date.parse("2026-10-28T23:58:00+01:00");
const LATER = Date.parse("2026-10-29T00:05:00+01:00");

const ITEMS: Item[] = [
  {
    module: "woda",
    span: span(
      "2026-10-28",
      wall("2026-10-28 22:00:00"),
      wall("2026-10-29 00:00:00"),
    ),
    shownFrom: null,
    emergency: false,
    second: "Cała wieś Wzorowo.",
    secondUntil: null,
  },
  {
    module: "smieci",
    span: span("2026-10-29", null, null),
    shownFrom: wall("2026-10-28 00:00:00"),
    bins: "papier, szkło",
    second: "Wystaw je do 6:00 rano.",
    secondUntil: wall("2026-10-29 06:00:00"),
  },
];

const list = (now: number) =>
  renderToStaticMarkup(
    createElement(
      WarsawToday,
      { day: todayInWarsaw(new Date(now)) },
      createElement(Upcoming, { items: ITEMS, now }),
    ),
  );

const days = (html: string) =>
  [...html.matchAll(/<li class="app-timeline__day([^"]*)">/g)].map(
    ([, modifier]) => modifier.trim(),
  );

test("server render: one ordered list of days, the date first, no links", () => {
  const html = list(NOW);
  assert.match(
    html,
    /^<section aria-labelledby="najblizsze-dni"><h2 id="najblizsze-dni" class="govuk-heading-m">Najbliższe dni<\/h2><ol class="app-timeline">/,
  );
  // Today, tomorrow, then the run of empty days to Tuesday 3 Nov, one line.
  assert.deepEqual(days(html), [
    "app-timeline__day--today",
    "",
    "app-timeline__day--empty",
  ]);
  // The day's heading before its cards: „Dziś”, then the date.
  assert.ok(
    html.includes(
      '<li class="app-timeline__day app-timeline__day--today"><h3 class="govuk-heading-s govuk-!-margin-bottom-2"><time dateTime="2026-10-28">Dziś<span class="govuk-visually-hidden">,</span> <span class="govuk-hint">środa, 28 października</span></time></h3><ul class="govuk-list app-timeline__cards"><li class="app-timeline__card govuk-!-padding-3">',
    ),
    html,
  );
  // A card: its icon (decorative) and tag, its hours, what, where.
  assert.ok(
    html.includes(
      '<strong class="govuk-tag govuk-tag--turquoise">Woda</strong></p><p class="govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-1">Od 22:00 do czwartku 29 października, 0:00</p><p class="govuk-body govuk-!-margin-bottom-0">Nie będzie wody.</p><p class="govuk-body govuk-!-margin-top-1 govuk-!-margin-bottom-0">Cała wieś Wzorowo.</p></li>',
    ),
    html,
  );
  assert.match(
    html,
    /<svg aria-hidden="true" focusable="false" class="app-timeline__icon"/,
  );
  assert.ok(html.includes(">Jutro<"), html);
  assert.ok(
    html.includes(
      '<strong class="govuk-tag govuk-tag--green">Śmieci</strong></p><p class="govuk-body govuk-!-margin-bottom-0">Odbiorą: papier, szkło.</p><p class="govuk-body govuk-!-margin-top-1 govuk-!-margin-bottom-0">Wystaw je do 6:00 rano.</p>',
    ),
    html,
  );
  assert.ok(
    html.includes(
      '<p class="govuk-hint govuk-!-margin-top-0 govuk-!-margin-bottom-0"><time dateTime="2026-10-30">Piątek 30 października</time> – <time dateTime="2026-11-03">wtorek 3 listopada</time><span aria-hidden="true"> · </span><span class="govuk-visually-hidden">: </span>nic zaplanowanego</p>',
    ),
    html,
  );
  // Every tag has its colour modifier; no plain blue one.
  assert.doesNotMatch(html, /class="govuk-tag"/);
  assert.doesNotMatch(html, /app-skeleton|Teraz|Później/);
  // No links in the list (task 260): each source is in its section.
  assert.doesNotMatch(html, /<a\s|Szczegóły i źródło/);
  assert.match(html, /<hr class="govuk-section-break[^"]*"\/>$/);
});

test("00:05: the cut over is gone, the pickup is today's", () => {
  const html = list(LATER);
  assert.doesNotMatch(html, /wody/);
  assert.deepEqual(days(html), [
    "app-timeline__day--today",
    "app-timeline__day--empty",
  ]);
  assert.match(html, /<time dateTime="2026-10-29">Dziś</);
  assert.equal((html.match(/class="app-timeline__card /g) ?? []).length, 1);
  // The empty run from tomorrow: „Jutro” as its first day.
  assert.match(
    html,
    /<time dateTime="2026-10-30">Jutro<\/time> – <time dateTime="2026-11-04">środa 4 listopada<\/time>/,
  );
});

test("nothing shown: the heading, one line for the week, the break", () => {
  const html = list(Date.parse("2026-10-30T00:00:00+01:00"));
  assert.deepEqual(days(html), [
    "app-timeline__day--empty app-timeline__day--today",
  ]);
  assert.ok(
    html.includes(
      '<time dateTime="2026-10-30">Dziś</time> – <time dateTime="2026-11-05">czwartek 5 listopada</time>',
    ),
    html,
  );
  // Outside WarsawToday (no server day): the dates alone.
  const bare = renderToStaticMarkup(
    createElement(Upcoming, { items: [], now: NOW }),
  );
  assert.match(
    bare,
    /<time dateTime="2026-10-28">Środa 28 października<\/time> – <time dateTime="2026-11-03">wtorek 3 listopada<\/time>/,
  );
});

test("a cut past the week: „Później”, its own list, its day's date", () => {
  const far: Item = {
    ...ITEMS[0],
    span: span(
      "2026-11-09",
      wall("2026-11-09 08:00:00"),
      wall("2026-11-09 12:00:00"),
    ),
  };
  const html = list(NOW);
  assert.doesNotMatch(html, /Później/);
  const later = renderToStaticMarkup(
    createElement(
      WarsawToday,
      { day: todayInWarsaw(new Date(NOW)) },
      createElement(Upcoming, { items: [far], now: NOW }),
    ),
  );
  assert.match(
    later,
    /<\/ol><h3 class="govuk-heading-s">Później<\/h3><ol class="app-timeline"><li class="app-timeline__day"><h3 class="govuk-heading-s govuk-!-margin-bottom-2"><time dateTime="2026-11-09">Poniedziałek<span class="govuk-visually-hidden">,<\/span> <span class="govuk-hint">9 listopada<\/span><\/time><\/h3>/,
  );
  assert.ok(later.includes(">Od 8:00 do 12:00<"), later);
});

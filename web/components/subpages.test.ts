import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { todayInWarsaw } from "../lib/dates.ts";
import { unchecked } from "../lib/hub.ts";
import { findSubpage, MODULES } from "../lib/modules.ts";
import { CUT_100 } from "../lib/mzgkim-fixture.ts";
import { numberWarning } from "../lib/prg.ts";
import type { PlaceView } from "../lib/schedule.ts";
import { laterNote } from "../lib/schedule-notes.ts";
import { wasteCalendarRefresh, wasteSchedule } from "../lib/waste-module.ts";
import {
  bothViews,
  CHECKED,
  mzgkimPost,
  NOW,
  POST_39885,
  SOBIESKIEGO_RANGE,
  sobieskiego,
  storedPost,
  testPlace,
  zukFile,
} from "../lib/water-fixture.ts";
import {
  water,
  waterCalendarRefresh,
  waterNone,
  waterSources,
  waterStatus,
  waterTrace,
  waterUpcoming,
} from "../lib/water-module.ts";
import { STALE_MS, type StoredPost, zukView } from "../lib/zuk-data.ts";
import { Subpage } from "./module-page.tsx";
import { AddressPage, numberError } from "./place-page.tsx";
import {
  ACTIONS_HEADING,
  CALENDAR_CHECK,
  CALENDAR_STEPS,
} from "./subpage-parts.tsx";
import { WarsawToday } from "./warsaw-today.tsx";
import { WaterDetails } from "./water-page.tsx";
import { eventProperties } from "./web-analytics.tsx";

// The address subpages' one layout (docs/layout.md), by structure and data,
// never their words (a test that needs them reads them from their source),
// rendered as the pages render them (the tsx loader, npm test): /woda and /smieci in the same order,
// with the same calendar block, at the water fixture's CHECKED and NOW.
const ZUKI = testPlace();

/** Icons (components/icon.tsx) as <svg/>, each aria-hidden: their shapes are Lucide's. */
function unicons(html: string) {
  for (const [svg] of html.matchAll(/<svg\b[^>]*>/g))
    assert.match(svg, /aria-hidden="true"/);
  return html.replace(/<svg\b.*?<\/svg>/g, "<svg/>");
}

// The /woda page as it reaches the browser, read per request
// (components/module-page.tsx Subpage): the frame, then the body, for the
// server's Warsaw day (WarsawToday).
const waterPage = (
  posts = [storedPost(POST_39885, CHECKED)],
  place = ZUKI,
  // MZGKiM's posts, and the read's times and Warsaw day, where not these.
  { town = [] as StoredPost[], checked = CHECKED, now = NOW, day = "" } = {},
) => {
  const data = water(bothViews(posts, checked, now, town), place);
  return unicons(
    renderToStaticMarkup(
      createElement(
        WarsawToday,
        { day: day || todayInWarsaw() },
        createElement(Subpage, {
          module: MODULES.woda,
          place: data.place,
          data,
        }),
      ),
    ),
  );
};

const wastePage = (place: Partial<PlaceView> = {}, missing = false) => {
  const data = testPlace({
    zoneId: "waste:miasto-s2",
    verified: false,
    days: [
      {
        date: "2026-10-27",
        pickups: [
          {
            id: "p1",
            subtype: "zmieszane",
            label: "Zmieszane",
            putOutBy: null,
            shiftedFrom: null,
          },
        ],
      },
    ],
    sources: [
      {
        label: "stan na 1 października",
        url: null,
        checkedAt: null,
        seenAt: CHECKED,
      },
    ],
    ...place,
  });
  return unicons(
    renderToStaticMarkup(
      createElement(Subpage, {
        module: MODULES.smieci,
        place: data,
        data,
        missing,
      }),
    ),
  );
};

/** Where each marker first appears; -1 if it does not. */
const order = (html: string, markers: string[]) =>
  markers.map((marker) => html.indexOf(marker));

/** The actions: their h2, the button group, the details under it. */
const calendarBlock = (html: string) =>
  /<section aria-labelledby="zapisz">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";

/** The actions' start, for the order checks. */
const ACTIONS = '<section aria-labelledby="zapisz">';

/** The subpages' skeleton (docs/layout.md), in order. */
const SKELETON = [
  '<span class="govuk-caption-l">',
  '<h1 class="govuk-heading-l">',
  // „Zmień adres”, GOV.UK's Change link.
  'govuk-link--no-visited-state" href="/"',
];
/** The source block with the check, the page's last. */
const SOURCE = [
  'class="govuk-inset-text"',
  '<p class="govuk-body-s app-quiet">',
];
/** After the content: the AI-read note, the actions, then the source. */
const AFTER = ['class="govuk-warning-text"', ACTIONS, ...SOURCE];
/** The same without a calendar file: no actions. */
const AFTER_NO_ACTIONS = ['class="govuk-warning-text"', ...SOURCE];

const ascending = (positions: number[]) =>
  positions.every((at, i) => at >= 0 && (i === 0 || at > positions[i - 1]));

test("/woda: the actions after the cuts and the AI note, a secondary button, no hint", () => {
  const html = waterPage();
  const block = calendarBlock(html);
  assert.ok(
    block.startsWith(
      `<section aria-labelledby="zapisz"><h2 id="zapisz" class="govuk-heading-m">${ACTIONS_HEADING}</h2><div class="govuk-button-group"><a `,
    ),
    block,
  );
  assert.match(block, /class="govuk-button govuk-button--secondary"/);
  assert.doesNotMatch(block, /class="govuk-button"/);
  assert.match(block, /href="\/adres\/0972447-26555\/woda\.ics"/);
  // Its icon, then its words; the group, then the details: no hint.
  assert.match(
    block,
    /<svg\/>[^<]+<\/a><\/div><details class="govuk-details">/,
  );
  // No hint by the buttons; the help's one paragraph is its first line.
  assert.doesNotMatch(block, /harmonogram\.pdf|<\/a><p /);
  assert.equal(block.match(/<p /g)?.length, 1);
  assert.ok(
    ascending(order(html, [...SKELETON, "<h2", 'class="app-card"', ...AFTER])),
    html,
  );
});

test("/woda: the AI note in a warning text, the source in an inset", () => {
  const html = waterPage();
  assert.match(
    html,
    /<div class="govuk-warning-text">[\s\S]*<strong class="govuk-warning-text__text"><span class="govuk-visually-hidden">[^<]+<\/span>[^<]+<\/strong>/,
  );
  // The source: the cut's post, linked, then when we checked.
  assert.match(
    html,
    /<div class="govuk-inset-text"><p class="govuk-body-s app-quiet govuk-!-margin-bottom-2">[^<]*<a href="https:\/\/www\.gminalubaczow\.pl\/[^"]+" class="govuk-link">[^<]*23 października 2026<\/a>[^<]+<\/p><p class="govuk-body-s app-quiet">Sprawdziliśmy [^<]+<\/p><\/div>/,
  );
  // A town street: the cut's own post is its only source, never MZGKiM's.
  assert.doesNotMatch(html, /mzgkim\.lubaczow\.pl/);
  // The source is no row of the cut.
  assert.doesNotMatch(html, /govuk-summary-list__value"><a /);
});

test("/woda without a dated cut: no button, the rest in the same order", () => {
  const emergency = storedPost(POST_39885, CHECKED);
  emergency.items = emergency.items.map((cut) => ({ ...cut, end: null }));
  for (const html of [waterPage([emergency]), waterPage([])]) {
    assert.doesNotMatch(
      html,
      /role="button"|woda\.ics|aria-labelledby="zapisz"/,
    );
    assert.ok(ascending(order(html, SKELETON)), html);
  }
  const html = waterPage([emergency]);
  assert.ok(ascending(order(html, ["<h2", ...AFTER_NO_ACTIONS])), html);
});

test("/smieci and /woda: the same skeleton and actions", () => {
  const waste = wastePage();
  assert.ok(
    ascending(order(waste, [...SKELETON, 'id="pickups-heading"', ...AFTER])),
    waste,
  );
  // The same block once /smieci's PDF, its first button, is left out.
  const shape = (html: string) =>
    calendarBlock(html)
      .replace(/<a [^>]*data-event="pdf_open"[^>]*>[\s\S]*?<\/a>/, "")
      .replace(/ (href|data-(?!module)[a-z]+)="[^"]*"/g, "")
      .replace(/>[^<]*</g, "><");
  assert.equal(shape(waste), shape(waterPage()));
});

test("the calendar's help is CalendarBlock's: the same words on both pages", () => {
  const waste = calendarBlock(wastePage());
  const cuts = calendarBlock(waterPage());
  // No hint on either: the buttons and the details say it.
  assert.doesNotMatch(waste + cuts, /<\/a><p /);
  // The help's first line: when to fetch the file again, from the page's
  // source (t370); the rest is CalendarBlock's: the same summary and
  // bullets, in order.
  const first = (block: string) =>
    /<div class="govuk-details__text"><p class="govuk-body">([^<]+)<\/p><ul /.exec(
      block,
    )?.[1];
  assert.equal(first(waste), wasteCalendarRefresh(ZUKI));
  assert.equal(
    first(cuts),
    waterCalendarRefresh(
      water(
        bothViews([storedPost(POST_39885, CHECKED)], CHECKED, NOW, []),
        ZUKI,
      ),
    ),
  );
  const help = (block: string) =>
    block
      .slice(block.indexOf("<details"))
      .replace(/<p class="govuk-body">[^<]+<\/p>/, "");
  const bullets = CALENDAR_STEPS.map((step) => `<li>${step}</li>`).join("");
  assert.equal(CALENDAR_STEPS.length, 5);
  for (const block of [waste, cuts]) {
    assert.ok(block.includes(`>${CALENDAR_CHECK}<`), block);
    assert.ok(
      block.includes(
        `<ul class="govuk-list govuk-list--bullet">${bullets}</ul>`,
      ),
      block,
    );
  }
  assert.equal(help(waste), help(cuts));
  // /smieci's PDF: the group's first button, a plain link to the file,
  // before the calendar's; /woda has none.
  assert.match(
    waste,
    /<div class="govuk-button-group"><a href="[^"]*\/harmonogram\.pdf" role="button" draggable="false" class="govuk-button govuk-button--secondary" data-module="govuk-button" data-event="pdf_open" data-zone="[^"]+"><svg\/>[^<]+<\/a><a href="\/ics\//,
  );
  assert.doesNotMatch(cuts, /harmonogram\.pdf/);
  // The details are closed until opened.
  assert.doesNotMatch(waste + cuts, /<details[^>]* open/);
});

test("/smieci: the dates a heading and a list each, /woda keeps GOV.UK's rows", () => {
  const pickup = (date: string) => ({
    date,
    pickups: [
      {
        id: date,
        subtype: "zmieszane",
        label: "Zmieszane",
        putOutBy: null,
        shiftedFrom: null,
      },
    ],
  });
  // Five days: the next pickup, two in the card, two under „Pokaż więcej”.
  const days = [
    "2026-10-27",
    "2026-11-10",
    "2026-11-24",
    "2026-12-08",
    "2026-12-22",
  ].map(pickup);
  const waste = wastePage({ days });
  // No summary list (a key column too narrow for a Polish date): per date
  // an h3 with its time, then its bins, GOV.UK's section break between.
  assert.doesNotMatch(waste, /govuk-summary-list/);
  const date =
    '<h3 class="govuk-heading-s govuk-!-margin-bottom-2"><time dateTime="[^"]+">[^<]*(?:<[^>]*>[^<]*)*?</time></h3><ul class="govuk-list govuk-!-margin-bottom-0 app-bins">';
  const rule =
    '<hr class="govuk-section-break govuk-section-break--m govuk-section-break--visible"/>';
  assert.match(
    waste,
    new RegExp(`<div class="app-card">${date}.*?${rule}${date}`),
  );
  // „Pokaż więcej”: the dates bare in the details, no card inside it.
  const more =
    // The details right after the dates' card (the calendar's follows a <p>).
    /<\/div><details class="govuk-details">.*?<div class="govuk-details__text">(.*?)<\/div><\/details>/.exec(
      waste,
    )?.[1] ?? "";
  assert.match(more, new RegExp(`^${date}.*?${rule}${date}`));
  assert.doesNotMatch(more, /app-card/);
  // /woda: in a card (site.scss .app-card), whose last row drops its
  // border by CSS; the markup never drops one.
  const water = waterPage();
  assert.match(water, /<dl class="govuk-summary-list[^"]*">/);
  assert.doesNotMatch(water, /no-border/);
});

/** The calendar button's opening tag. */
const buttonTag = (html: string) =>
  /<a [^>]*role="button"[^>]*data-event="(?:water_)?calendar_add"[^>]*>/.exec(
    html,
  )?.[0] ?? "";

test("the calendar buttons' analytics: water by place, waste by zone", () => {
  assert.equal(
    buttonTag(waterPage()),
    '<a href="/adres/0972447-26555/woda.ics" role="button" draggable="false" class="govuk-button govuk-button--secondary" data-module="govuk-button" data-event="water_calendar_add" data-place="0972447-26555">',
  );
  // /smieci's calendar block, byte for byte.
  assert.equal(
    buttonTag(wastePage()),
    '<a href="/ics/waste%3Amiasto-s2" role="button" draggable="false" class="govuk-button govuk-button--secondary" data-module="govuk-button" data-event="calendar_add" data-zone="waste:miasto-s2" data-source="street">',
  );
});

test("a click sends whichever of zone, source and place the link has", () => {
  assert.deepEqual(eventProperties({ event: "x", place: "0972447-26555" }), {
    place: "0972447-26555",
  });
  assert.deepEqual(
    eventProperties({ event: "x", zone: "waste:miasto-s2", source: "street" }),
    { zone: "waste:miasto-s2", source: "street" },
  );
  assert.deepEqual(eventProperties({ event: "x", zone: "waste:miasto-s2" }), {
    zone: "waste:miasto-s2",
  });
});

// The house number against the address register (lib/prg.ts):
// one it lacks is set aside (lib/schedule.ts getPlace), the view is the
// whole place's, and one warning says so.
const ASNYKA = { id: "0972447-00470", name: "ul. Adama Asnyka" };
const WARNING = numberWarning(testPlace({ ...ASNYKA, invalidNr: "9999" }));
/** The h1, then „Zmień adres” straight after it: no note between. */
const NO_NOTE =
  /<\/h1><p class="govuk-body"><a class="govuk-link govuk-link--no-visited-state"/;

test("a number the register lacks: the one warning, the whole street", () => {
  assert.ok(WARNING);
  // A number the register has: no warning (another note may follow).
  const known = { ...ASNYKA, givenNr: "5", knownNr: true };
  assert.equal(numberWarning(testPlace(known)), null);
  assert.ok(!wastePage(known).includes(WARNING));
  const html = wastePage({ ...ASNYKA, invalidNr: "9999" });
  // The one note, right under the h1, then „Zmień adres”.
  assert.ok(
    html.includes(
      `</h1><p class="govuk-body">${WARNING}</p><p class="govuk-body"><a class="govuk-link govuk-link--no-visited-state"`,
    ),
    html,
  );
  assert.ok(
    ascending(order(html, [...SKELETON, 'id="pickups-heading"', ...AFTER])),
    html,
  );
  // /woda: the same warning, the cuts as ever.
  const water = waterPage(
    undefined,
    testPlace({ ...ASNYKA, invalidNr: "9999" }),
  );
  assert.ok(water.includes(WARNING), water);
  assert.ok(
    ascending(order(water, [...SKELETON, "<h2", 'class="app-card"', ACTIONS])),
    water,
  );
});

test("a split street: only the schedule's own error, never both", () => {
  const split = {
    ...ASNYKA,
    zoneId: null,
    askNumber: true,
    unknownNr: "9999",
    givenNr: "9999",
  };
  const html = wastePage(split);
  const error = numberError(testPlace(split), false);
  assert.ok(error && html.includes(error));
  assert.match(html, NO_NOTE);
  // A number the register lacks there: the question's own error.
  const lackedPlace = {
    ...ASNYKA,
    zoneId: null,
    askNumber: true,
    invalidNr: "abc",
  };
  const lacked = wastePage(lackedPlace);
  const lackedError = numberError(testPlace(lackedPlace), false);
  assert.ok(lackedError && lacked.includes(lackedError));
  assert.match(lacked, NO_NOTE);
});

test("the h1 shows a number only when the register has it (item 6)", () => {
  const h1 = (place: Partial<PlaceView>) => {
    const props: Parameters<typeof AddressPage>[0] = {
      place: testPlace({
        id: "0606464",
        kind: "wies",
        name: "Załuże",
        ...place,
      }),
      children: null,
    };
    return /<h1 class="govuk-heading-l">([^<]*)<\/h1>/.exec(
      renderToStaticMarkup(createElement(AddressPage, props)),
    )?.[1];
  };
  assert.equal(h1({ givenNr: "44", knownNr: true }), "Załuże 44");
  assert.equal(h1({ givenNr: "44", knownNr: false }), "Załuże");
  assert.equal(h1({ invalidNr: "50a" }), "Załuże");
});

// Real post 39872's cut, ul. Jana III Sobieskiego „od nr 23 do nr 47”.

test("a number outside a cut's range: one trace line, hub and /woda", () => {
  const [first] = storedPost(POST_39885, CHECKED).items;
  const posts = [
    storedPost(POST_39885, CHECKED, {
      items: [{ ...first, ...SOBIESKIEGO_RANGE }],
    }),
  ];
  const data = (nr: string | null) =>
    water(bothViews(posts, CHECKED, NOW), sobieskiego(nr));
  // The hub's water lines, as text.
  const hub = (nr: string | null) =>
    MODULES.woda
      .notices(data(nr))
      .flat()
      .map((line) => line.join(""));
  // With no cut shown, the hub's section says it, with the cut's day and
  // hours and the number, so no trace line after it.
  const lines = hub("5");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /\b5\b/);
  for (const part of ["26 października", "8:00", "16:00", " 5"])
    assert.ok(lines[1].includes(part), part);
  // /woda: one trace line right after the empty text, before the AI note
  // and source.
  const trace = waterTrace(data("5"));
  assert.ok(trace);
  const five = waterPage(posts, sobieskiego("5"));
  assert.ok(five.includes(`</a>.</p><p class="govuk-body">${trace}</p>`), five);
  assert.equal(five.split(trace).length, 2);
  for (const nr of ["30", null]) {
    assert.equal(hub(nr).length, 0);
    assert.equal(waterTrace(data(nr)), null);
    assert.match(waterPage(posts, sobieskiego(nr)), /23[^<]*47/);
  }
});

// Smolińce, a part of Lisie Jamy: outside MZGKiM's area, so its pages are
// unchanged, byte for byte (digests of the HTML).
const SMOLINCE = testPlace({
  id: "0606257",
  kind: "wies",
  name: "Smolińce",
  label: "Smolińce",
  group: "0606257",
  gmina: "Lubaczów (gmina)",
  localityId: "0606257",
  streetId: null,
});
const GMINA = [
  {
    href: "https://www.gminalubaczow.pl/aktualnosci/",
    text: "aktualności gminy Lubaczów",
  },
];

test("village: the hub's water in every state, /woda never MZGKiM", () => {
  const late = new Date(Date.parse(CHECKED) + STALE_MS + 1);
  const states = {
    cut: zukView(zukFile([storedPost(POST_39885, CHECKED)], CHECKED), NOW),
    none: zukView(zukFile([], CHECKED), NOW),
    stale: zukView(zukFile([], CHECKED), late),
    unavailable: zukView(null, NOW),
  };
  const hub = {
    cut: [
      ["Cała wieś Lisie Jamy.", "Cała wieś Lisie Jamy."],
      // The cuts are the timeline's alone: nothing more to say.
      [],
      "brak zapowiedzianych przerw",
      [
        [
          {
            href: "https://www.gminalubaczow.pl/2026/10/23/przerwy-w-dostawie-wody-26-29-10-2026/",
            text: "komunikat gminy z 23 października 2026",
          },
        ],
      ],
      null,
    ],
    none: [
      [],
      [[["Brak zapowiedzianych przerw."]]],
      "brak zapowiedzianych przerw",
      [GMINA],
      null,
    ],
    stale: [
      [],
      [
        [
          [
            "Brak zapowiedzianych przerw przy ostatnim sprawdzeniu, ale od ponad godziny nie udało się nam sprawdzić nowych.",
          ],
        ],
      ],
      "brak zapowiedzianych przerw przy ostatnim sprawdzeniu, ale od ponad godziny nie udało się nam sprawdzić nowych",
      [GMINA],
      null,
    ],
    unavailable: [
      [],
      [[["Nie udało się nam sprawdzić komunikatów."]]],
      "nie udało się nam sprawdzić komunikatów",
      [GMINA],
      null,
    ],
  };
  for (const [state, view] of Object.entries(states) as Array<
    [keyof typeof states, (typeof states)[keyof typeof states]]
  >) {
    const data = water({ "gmina-lubaczow": view }, SMOLINCE);
    assert.deepEqual(
      [
        waterUpcoming(data).map((item) => item.second),
        waterStatus(data),
        waterNone(data),
        waterSources(data),
        waterTrace(data),
      ],
      hub[state],
      state,
    );
    const html = renderToStaticMarkup(createElement(WaterDetails, { data }));
    assert.doesNotMatch(html, /MZGKiM/, state);
  }
});

test("town /woda, an MZGKiM cut: the same page, its post the source", () => {
  // 5237's cut (6 Oct 2026) at ul. Niemirowska, seen on 3 Oct.
  const checked = "2026-10-03T09:50:00.000Z";
  const now = new Date("2026-10-03T10:00:00Z");
  const niemirowska = testPlace({
    id: "0972447-14183",
    streetId: "0972447-14183",
  });
  const page = (town: StoredPost[], place = niemirowska) =>
    waterPage([], place, { town, checked, now, day: todayInWarsaw(now) });
  const html = page([mzgkimPost(CUT_100, checked)]);
  assert.ok(ascending(order(html, [...SKELETON, ...AFTER])));
  assert.match(
    html,
    /<h2 id="dzien-2026-10-06" class="govuk-heading-m">[^<]*6 października<\/h2><div class="app-card"><dl class="govuk-summary-list govuk-!-margin-bottom-0"><div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">[^<]+<\/dt><dd class="govuk-summary-list__value"><ul class="app-chips"><li class="app-chip"><svg\/>[^<]*8:30[^<]*15:00[^<]*<\/li><\/ul><\/dd><\/div><div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">[^<]+<\/dt><dd class="govuk-summary-list__value">[^<]*Niemirowska<\/dd>/,
  );
  // The AI note names MZGKiM, whose post it is.
  assert.match(
    html,
    /<strong class="govuk-warning-text__text">(?:(?!<\/strong>).)*MZGKiM/,
  );
  assert.match(
    html,
    /<div class="govuk-inset-text"><p class="govuk-body-s app-quiet govuk-!-margin-bottom-2">[^<]*<a href="https:\/\/mzgkim\.lubaczow\.pl\/przerwa-w-dostawie-wody-100\/" class="govuk-link">[^<]*2 października 2026<\/a>[^<]+<\/p><p class="govuk-body-s app-quiet">Sprawdziliśmy [^<]+<\/p><\/div>/,
  );
  // Its cut shown here: its area off our list is not linked again.
  assert.doesNotMatch(html, /id="inne-komunikaty"/);
  // Another town street: no cut, and nothing under „Inne komunikaty”
  // (the estate is its 9 streets now, every area of the post matched).
  const asnyka = page(
    [mzgkimPost(CUT_100, checked)],
    testPlace({ id: "0972447-00470", streetId: "0972447-00470" }),
  );
  assert.doesNotMatch(asnyka, /id="inne-komunikaty"/);
  // Fresh, no cut: one sentence, both sources' posts, no MZGKiM caveat.
  const quiet = page([]);
  assert.match(
    quiet,
    /<p class="app-empty govuk-body">[^<]*<a href="https:\/\/www\.gminalubaczow\.pl\/aktualnosci\/" class="govuk-link">[^<]+<\/a>[^<]*<a href="https:\/\/mzgkim\.lubaczow\.pl\/category\/komunikaty\/" class="govuk-link">[^<]+<\/a>[^<]*<\/p>/,
  );
  assert.doesNotMatch(quiet, /govuk-warning-text/);
});

test("/smieci: after the last date, the next year's line", () => {
  const later = laterNote([{ date: "2026-10-27" }]);
  assert.ok(later);
  assert.ok(
    wastePage().includes(`<p class="govuk-body">${later}</p></section>`),
  );
});

test("/woda day headings: the date, absolute, its „Dziś: ” the server's day's, in the HTML", () => {
  // No skeleton: the word comes with the page, for the read's Warsaw day
  // (components/day-word.tsx; the words themselves: lib/upcoming.test.ts
  // dayLead).
  const heading = (at: string) => {
    mock.timers.enable({ apis: ["Date"], now: new Date(at) });
    try {
      return waterPage().match(
        /<h2 id="dzien-2026-10-27" class="govuk-heading-m">(.*?)<\/h2>/,
      )?.[1];
    } finally {
      mock.timers.reset();
    }
  };
  assert.equal(
    heading("2026-10-27T05:00:00Z"),
    "Dziś: wtorek, 27 października",
  );
  assert.equal(
    heading("2026-10-26T22:59:00Z"),
    "Jutro: wtorek, 27 października",
  );
  assert.equal(heading("2026-10-19T12:00:00Z"), "Wtorek, 27 października");
  // No cut: no day heading, the page as before.
  mock.timers.enable({ apis: ["Date"], now: NOW });
  try {
    assert.doesNotMatch(waterPage([]), /id="dzien-/);
  } finally {
    mock.timers.reset();
  }
});

test("/smieci: an event without its source is not on the page", () => {
  const row = (id: string, start: string, sourceUrl: string) => ({
    id,
    start,
    subtype: "zmieszane",
    label: `Zmieszane ${id}`,
    shiftedFrom: null,
    verified: false,
    payload: null,
    sourceDoc: "doc",
    sourceRef: "Harmonogram testowy",
    sourceUrl,
    checkedAt: "2026-10-20",
    seenAt: null,
  });
  const html = wastePage(
    wasteSchedule([
      row("shown", "2026-10-27", "https://example.org/harmonogram.pdf"),
      row("nourl", "2026-10-28", ""),
      {
        ...row("nocheck", "2026-10-29", "https://example.org/b.pdf"),
        checkedAt: "",
      },
    ]),
  );
  assert.ok(html.includes("Zmieszane shown"));
  assert.ok(!html.includes("Zmieszane nourl"));
  assert.ok(!html.includes("Zmieszane nocheck"));
  assert.ok(!html.includes("https://example.org/b.pdf"));
});

// The weather has no subpage: its warnings are cards on the
// address page (components/hub.test.ts), so /pogoda is a 404.
test("/pogoda: no subpage, like any unknown slug", () => {
  assert.equal(findSubpage("pogoda"), null);
  assert.equal(findSubpage("gaz"), null);
  assert.equal(findSubpage("woda"), MODULES.woda);
  assert.equal(findSubpage("prad"), MODULES.prad);
});

test("every subpage with no data now: its frame, then the hub's one line, nothing else", () => {
  for (const [module, line] of [
    [MODULES.woda, unchecked(MODULES.woda)],
    [MODULES.prad, unchecked(MODULES.prad)],
  ] as const) {
    const html = unicons(
      renderToStaticMarkup(
        createElement(Subpage, { module, place: ZUKI, data: null }),
      ),
    );
    assert.match(
      html,
      new RegExp(
        `<h1 class="govuk-heading-l"><span class="app-tile app-mod app-mod--${module.id}"><svg/></span>${module.pageTitle}</h1><p class="govuk-body"><a [^>]*>Zmień adres.*?</a></p></div><div class="app-mod app-mod--${module.id}"><p class="app-empty govuk-body">${line.replace(/\./g, "\\.")}</p></div></div></div>$`,
      ),
      module.id,
    );
    assert.doesNotMatch(html, /govuk-inset-text|role="button"/);
  }
});

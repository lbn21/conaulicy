import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MODULES } from "../lib/modules.ts";
import { CUT_100 } from "../lib/mzgkim-fixture.ts";
import type { PlaceView } from "../lib/schedule.ts";
import {
  bothViews,
  mzgkimPost,
  POST_39885,
  SOBIESKIEGO_RANGE,
  sobieskiego,
  storedPost,
  testPlace,
  zukFile,
} from "../lib/water-fixture.ts";
import {
  water,
  waterNone,
  waterSources,
  waterStatus,
  waterTrace,
  waterUpcoming,
} from "../lib/water-module.ts";
import { STALE_MS, zukView } from "../lib/zuk-data.ts";
import { AddressPage, SubpageHeading, WasteDetails } from "./place-page.tsx";
import { blank } from "./skeleton.tsx";
import { CALENDAR_CHECK, CALENDAR_STEPS } from "./subpage-parts.tsx";
import { WaterDetails } from "./water-page.tsx";
import { eventProperties } from "./web-analytics.tsx";

// The address subpages' one layout (docs/layout.md), rendered as the pages
// render them (scripts/lib/tsx.mjs): /woda and /smieci in the same order,
// with the same calendar block. Sunday 25 Oct 2026; 39885 cuts ul. Żuki on
// Tuesday 27 Oct, 8:00-16:00.
const CHECKED = "2026-10-25T12:20:00.000Z";
const NOW = new Date("2026-10-25T12:30:00Z");
const ZUKI = testPlace();

// The /woda page as it reaches the browser: the heading from the cached
// shell (components/module-page.tsx), then the body read per request.
const waterPage = (posts = [storedPost(POST_39885, CHECKED)], place = ZUKI) => {
  const data = water(bothViews(posts, CHECKED, NOW), place);
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      createElement(SubpageHeading, {
        place: data.place,
        heading: "Przerwy w dostawie wody",
      }),
      createElement(WaterDetails, { data, checkedAt: new Date(CHECKED) }),
    ),
  );
};

const wastePage = (place: Partial<PlaceView> = {}, missing = false) =>
  renderToStaticMarkup(
    createElement(WasteDetails, {
      missing,
      data: testPlace({
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
            seenAt: null,
          },
        ],
        ...place,
      }),
      checkedAt: new Date(CHECKED),
    }),
  );

/** Where each marker first appears; -1 if it does not. */
const order = (html: string, markers: string[]) =>
  markers.map((marker) => html.indexOf(marker));

/** The button, the hint and the details under it, as one string. */
const calendarBlock = (html: string) =>
  /<a [^>]*role="button"[^>]*>[^<]*<\/a><p class="govuk-body">[^<]*<\/p><details class="govuk-details">[\s\S]*?<\/details>/.exec(
    html,
  )?.[0] ?? "";

/** The subpages' skeleton (docs/layout.md), in order. */
const SKELETON = [
  '<span class="govuk-caption-l">',
  '<h1 class="govuk-heading-l">',
  "Zmień adres",
  " sprawdziliśmy: ",
  'role="button"',
];
const AFTER = ['class="govuk-warning-text"', 'class="govuk-inset-text"'];

const ascending = (positions: number[]) =>
  positions.every((at, i) => at >= 0 && (i === 0 || at > positions[i - 1]));

test("/woda: a primary button and its hint before the cuts", () => {
  const html = waterPage();
  const block = calendarBlock(html);
  assert.match(block, /class="govuk-button"/);
  assert.doesNotMatch(block, /govuk-button--/);
  assert.match(block, /href="\/adres\/0972447-26555\/woda\.ics"/);
  assert.match(block, />Dodaj przerwy do kalendarza</);
  assert.match(
    block,
    /<p class="govuk-body">Plik z przerwami\. Jeśli gmina zmieni godziny, pobierz go jeszcze raz\.<\/p>/,
  );
  assert.doesNotMatch(block, /poprawi wpis|PDF/);
  assert.ok(
    ascending(order(html, [...SKELETON, "<h2", "Godziny", ...AFTER])),
    html,
  );
});

test("/woda: the AI note in a warning text, the source in an inset", () => {
  const html = waterPage();
  assert.match(
    html,
    /<div class="govuk-warning-text">[\s\S]*przepisał automatycznie program/,
  );
  assert.match(
    html,
    /<div class="govuk-inset-text"><p class="govuk-body">Źródło: <a href="https:\/\/www\.gminalubaczow\.pl\/[^"]+" class="govuk-link">komunikat gminy z 23 października 2026<\/a><\/p><\/div>/,
  );
  // A town street: the cut's own post is its only source, never MZGKiM's.
  assert.doesNotMatch(html, /MZGKiM/);
  // The source is no longer a row of the cut.
  assert.doesNotMatch(html, /summary-list__key">Źródło/);
});

test("/woda without a dated cut: no button, the rest in the same order", () => {
  const emergency = storedPost(POST_39885, CHECKED);
  emergency.items = emergency.items.map((cut) => ({ ...cut, end: null }));
  for (const html of [waterPage([emergency]), waterPage([])]) {
    assert.doesNotMatch(html, /role="button"|woda\.ics|do kalendarza/);
    assert.ok(ascending(order(html, SKELETON.slice(0, -1))), html);
  }
  const html = waterPage([emergency]);
  assert.ok(
    ascending(
      order(html, ["Komunikaty o wodzie sprawdziliśmy", "<h2", ...AFTER]),
    ),
    html,
  );
});

test("/smieci and /woda: the same skeleton and calendar block", () => {
  const waste = wastePage();
  assert.ok(
    ascending(order(waste, [...SKELETON, "Najbliższe odbiory", ...AFTER])),
    waste,
  );
  const shape = (html: string) =>
    calendarBlock(html)
      .replace(/ (href|data-(?!module)[a-z]+)="[^"]*"/g, "")
      .replace(/>[^<]*</g, "><");
  assert.equal(shape(waste), shape(waterPage()));
});

test("the calendar's help is CalendarBlock's: the same words on both pages", () => {
  const waste = calendarBlock(wastePage());
  const water = calendarBlock(waterPage());
  // Each page's own: the paragraph, its hint only.
  assert.ok(waste.includes('<p class="govuk-body">Plik z datami wywozu.</p>'));
  assert.ok(
    water.includes(
      '<p class="govuk-body">Plik z przerwami. Jeśli gmina zmieni godziny, pobierz go jeszcze raz.</p>',
    ),
  );
  // The rest is CalendarBlock's: the same summary and bullets, in order.
  const help = (block: string) => block.slice(block.indexOf("<details"));
  const bullets = CALENDAR_STEPS.map((step) => `<li>${step}</li>`).join("");
  assert.equal(CALENDAR_STEPS.length, 5);
  for (const block of [waste, water]) {
    assert.ok(block.includes(`>${CALENDAR_CHECK}<`), block);
    assert.ok(
      block.includes(
        `<ul class="govuk-list govuk-list--bullet">${bullets}</ul>`,
      ),
      block,
    );
  }
  assert.equal(help(waste), help(water));
  // The PDF stays the page's own link, under the block.
  assert.doesNotMatch(waste, /PDF/);
  // The details are closed until opened.
  assert.doesNotMatch(waste + water, /<details[^>]* open/);
  // A browser never knows whether the file was added.
  for (const html of [wastePage(), waterPage()])
    assert.doesNotMatch(html, /Dodano|dodano/);
});

test("/smieci and /woda keep GOV.UK's row borders (only the hub drops them)", () => {
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
  // Two days: the list starts with the second.
  const days = [pickup("2026-10-27"), pickup("2026-11-10")];
  for (const html of [wastePage({ days }), waterPage()]) {
    assert.match(html, /<dl class="govuk-summary-list">/);
    assert.doesNotMatch(html, /no-border/);
  }
});

/** The button's opening tag. */
const buttonTag = (html: string) =>
  /<a [^>]*role="button"[^>]*>/.exec(html)?.[0] ?? "";

test("the calendar buttons' analytics: water by place, waste by zone", () => {
  assert.equal(
    buttonTag(waterPage()),
    '<a href="/adres/0972447-26555/woda.ics" role="button" draggable="false" class="govuk-button" data-module="govuk-button" data-event="water_calendar_add" data-place="0972447-26555">',
  );
  // /smieci's as before task 125, byte for byte.
  assert.equal(
    buttonTag(wastePage()),
    '<a href="/ics/waste%3Amiasto-s2" role="button" draggable="false" class="govuk-button" data-module="govuk-button" data-event="calendar_add" data-zone="waste:miasto-s2" data-source="street">',
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

// The house number against the address register (lib/prg.ts, task 205):
// one it lacks is set aside (lib/schedule.ts getPlace), the view is the
// whole place's, and one warning says so.
const ASNYKA = { id: "0972447-00470", name: "ul. Adama Asnyka" };
const WARNING =
  "Nie znaleźliśmy nr „9999” pod tym adresem – pokazujemy całą ulicę.";

test("a number the register lacks: the one warning, the whole street", () => {
  assert.doesNotMatch(
    wastePage({ ...ASNYKA, givenNr: "5", knownNr: true }),
    /Nie znaleźliśmy/,
  );
  const html = wastePage({ ...ASNYKA, invalidNr: "9999" });
  assert.match(
    html,
    new RegExp(
      `<h1 class="govuk-heading-l">Odbiór śmieci</h1><p class="govuk-body">${WARNING}</p>`,
    ),
  );
  assert.doesNotMatch(html, /rejestrze adresów|wspólny dla całej ulicy/);
  assert.ok(
    ascending(order(html, [...SKELETON, "Najbliższe odbiory", ...AFTER])),
    html,
  );
  // /woda: the same warning, the cuts as ever.
  const water = waterPage(
    undefined,
    testPlace({ ...ASNYKA, invalidNr: "9999" }),
  );
  assert.ok(water.includes(WARNING), water);
  assert.ok(ascending(order(water, [...SKELETON, "<h2", "Godziny"])), water);
});

test("a split street: only the schedule's own error, never both", () => {
  const html = wastePage({
    ...ASNYKA,
    zoneId: null,
    askNumber: true,
    unknownNr: "9999",
    givenNr: "9999",
  });
  assert.match(html, /Numeru 9999 nie ma w harmonogramie tej ulicy/);
  assert.doesNotMatch(html, /Nie znaleźliśmy/);
  // A number the register lacks there: the question's own error.
  const lacked = wastePage({
    ...ASNYKA,
    zoneId: null,
    askNumber: true,
    invalidNr: "abc",
  });
  assert.match(lacked, /Wpisz numer domu, na przykład 12, 12a albo 7\/22/);
  assert.doesNotMatch(lacked, /Nie znaleźliśmy/);
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
const SOB_TRACE =
  '<p class="govuk-body">Gmina zapowiedziała też przerwę na tej ulicy, ale według komunikatu nie obejmuje nr 5.</p>';

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
      .status(data(nr))
      .flat()
      .map((line) => line.join(""));
  // task 188: with no cut shown, the hub's section says it, with the cut's
  // day, so no trace line after it.
  assert.deepEqual(hub("5"), [
    "Pod nr 5: brak zapowiedzianych przerw.",
    "Gmina zapowiedziała przerwę na tej ulicy – poniedziałek, 26 października, 8:00–16:00 – ale według komunikatu nie obejmuje nr 5.",
  ]);
  // /woda: right after the empty text, before the AI note and source.
  const five = waterPage(posts, sobieskiego("5"));
  assert.match(
    five,
    new RegExp(
      `Gmina ogłasza je w <a [^>]*>aktualności gminy Lubaczów</a>\\.</p>${SOB_TRACE}`,
    ),
  );
  assert.equal(five.split("Gmina zapowiedziała też").length, 2);
  for (const nr of ["30", null]) {
    assert.ok(!hub(nr).some((line) => line.includes("Gmina zapowiedziała")));
    const html = waterPage(posts, sobieskiego(nr));
    assert.doesNotMatch(html, /Gmina zapowiedziała też/);
    assert.match(html, /od nr 23 do nr 47/);
  }
});

// Smolińce, a part of Lisie Jamy: outside MZGKiM's area, so its pages are
// as before task 148, byte for byte (digests of the HTML before it).
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
      [
        [
          [
            {
              day: "2026-10-26",
              text: "poniedziałek, 26 października, 8:00–16:00",
            },
          ],
          ["Gdzie: cała wieś Lisie Jamy"],
        ],
        [["Kolejne dni: czwartek, 29 października"]],
      ],
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
    const html = renderToStaticMarkup(
      createElement(WaterDetails, {
        data,
        checkedAt: view.checkedAt ? new Date(view.checkedAt) : null,
      }),
    );
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
  const page = (town: ReturnType<typeof mzgkimPost>[], place = niemirowska) => {
    const data = water(bothViews([], checked, now, town), place);
    return renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(SubpageHeading, {
          place: data.place,
          heading: "Przerwy w dostawie wody",
        }),
        createElement(WaterDetails, { data, checkedAt: new Date(checked) }),
      ),
    );
  };
  const html = page([mzgkimPost(CUT_100, checked)]);
  assert.ok(ascending(order(html, [...SKELETON, ...AFTER])));
  assert.match(
    html,
    /<p class="govuk-body">Plik z przerwami\. Jeśli MZGKiM zmieni godziny, pobierz go jeszcze raz\.<\/p>/,
  );
  assert.match(
    html,
    /<h2 id="dzien-2026-10-06" class="govuk-heading-m"><span class="app-skeleton" aria-hidden="true">\u2002{6}<\/span> wtorek, 6 października<\/h2><dl class="govuk-summary-list"><div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Godziny<\/dt><dd class="govuk-summary-list__value">8:30–15:00<\/dd><\/div><div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">Gdzie<\/dt><dd class="govuk-summary-list__value">cała ulica Niemirowska<\/dd>/,
  );
  assert.match(
    html,
    /Te daty przepisał automatycznie program\. Jeśli coś się nie zgadza, ważniejszy jest komunikat MZGKiM\./,
  );
  assert.match(
    html,
    /<div class="govuk-inset-text"><p class="govuk-body">Źródło: <a href="https:\/\/mzgkim\.lubaczow\.pl\/przerwa-w-dostawie-wody-100\/" class="govuk-link">komunikat MZGKiM z 2 października 2026<\/a><\/p><\/div>/,
  );
  // Its cut shown here: its area off our list is not linked again.
  assert.doesNotMatch(html, /Inne komunikaty/);
  // Another town street: no cut, and nothing under „Inne komunikaty”
  // (the estate is its 9 streets now, every area of the post matched).
  const asnyka = page(
    [mzgkimPost(CUT_100, checked)],
    testPlace({ id: "0972447-00470", streetId: "0972447-00470" }),
  );
  assert.doesNotMatch(asnyka, /Inne komunikaty/);
  // Fresh, no cut: one sentence, both sources' posts, no MZGKiM caveat.
  const quiet = page([]);
  assert.match(
    quiet,
    /<p class="govuk-body">Brak zapowiedzianych przerw\. Gmina ogłasza je w <a href="https:\/\/www\.gminalubaczow\.pl\/aktualnosci\/" class="govuk-link">aktualności gminy Lubaczów<\/a>, a MZGKiM – w <a href="https:\/\/mzgkim\.lubaczow\.pl\/category\/komunikaty\/" class="govuk-link">komunikatach MZGKiM<\/a>\.<\/p>/,
  );
  assert.doesNotMatch(quiet, /jeszcze tu nie pokazujemy|nie sprawdzamy/);
});

test("/smieci: after the last date, the next year's line (task 205)", () => {
  assert.match(
    wastePage(),
    /<p class="govuk-body">Terminy na kolejny rok dodamy, gdy je ogłoszą\.<\/p><\/section>/,
  );
});

test("/woda day headings: the date, absolute, its „Dziś: ” the device's (a skeleton in the HTML)", () => {
  // The server's clock never changes them (components/day-word.tsx; the
  // words themselves: lib/upcoming.test.ts dayLead).
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
  for (const at of ["2026-10-27T05:00:00Z", "2026-10-19T12:00:00Z"])
    assert.equal(
      heading(at),
      `<span class="app-skeleton" aria-hidden="true">${blank("Jutro:")}</span> wtorek, 27 października`,
      at,
    );
  // No cut: no day heading, the page as before.
  mock.timers.enable({ apis: ["Date"], now: NOW });
  try {
    assert.doesNotMatch(waterPage([]), /id="dzien-/);
  } finally {
    mock.timers.reset();
  }
});

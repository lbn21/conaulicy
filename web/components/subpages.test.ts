import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlaceView } from "../lib/schedule.ts";
import {
  POST_39885,
  storedPost,
  testPlace,
  zukFile,
} from "../lib/water-fixture.ts";
import { water } from "../lib/water-module.ts";
import { zukView } from "../lib/zuk-data.ts";
import { WasteDetails } from "./place-page.tsx";
import { WaterDetails } from "./water-page.tsx";
import { eventProperties } from "./web-analytics.tsx";

// The address subpages' one layout (docs/layout.md), rendered as the pages
// render them (scripts/lib/tsx.mjs): /woda and /smieci in the same order,
// with the same calendar block. Sunday 25 Oct 2026; 39885 cuts ul. Żuki on
// Tuesday 27 Oct, 8:00-16:00.
const CHECKED = "2026-10-25T12:20:00.000Z";
const NOW = new Date("2026-10-25T12:30:00Z");
const ZUKI = testPlace();

const waterPage = (posts = [storedPost(POST_39885, CHECKED)], place = ZUKI) =>
  renderToStaticMarkup(
    createElement(WaterDetails, {
      data: water(zukView(zukFile(posts, CHECKED), NOW), place),
      checkedAt: new Date(CHECKED),
    }),
  );

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

/** The button and the hint under it, as one string. */
const calendarBlock = (html: string) =>
  /<a [^>]*role="button"[^>]*>[^<]*<\/a><p class="govuk-body">[^<]*<\/p>/.exec(
    html,
  )?.[0] ?? "";

/** The subpages' skeleton (docs/layout.md), in order. */
const SKELETON = [
  '<span class="govuk-caption-l">',
  '<h1 class="govuk-heading-l">',
  "Zmień adres",
  "Ostatnio sprawdziliśmy",
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
  assert.match(block, /pobierz plik jeszcze raz – kalendarz poprawi wpis\./);
  assert.ok(
    ascending(order(html, [...SKELETON, "<h2", "Godziny", ...AFTER])),
    html,
  );
});

test("/woda: the AI note in a warning text, the source in an inset", () => {
  const html = waterPage();
  assert.match(
    html,
    /<div class="govuk-warning-text">[\s\S]*odczytaliśmy automatycznie z komunikatu gminy/,
  );
  assert.match(
    html,
    /<div class="govuk-inset-text"><p class="govuk-body">Źródło: <a href="https:\/\/www\.gminalubaczow\.pl\/[^"]+" class="govuk-link">Komunikat gminy z 23 października 2026<\/a><\/p><\/div>/,
  );
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
  assert.ok(ascending(order(html, ["Ostatnio", "<h2", ...AFTER])), html);
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
  assert.equal(
    shape(waste),
    '<a role="button" draggable="false" class="govuk-button" data-module="govuk-button"></a><p class="govuk-body"></p>',
  );
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

// The house number against the address register (lib/prg.ts): PRG has 1-7
// at ul. Adama Asnyka, nothing at os. Unii Lubelskiej.
const ASNYKA = { id: "0972447-00470", name: "ul. Adama Asnyka" };
const PRG_NOTE =
  "Nie znaleźliśmy nr 9999 przy tej ulicy w rejestrze adresów. Sprawdź, czy numer jest dobry.";

test("a number PRG has: no note; one it lacks: the note, the schedule as ever", () => {
  assert.doesNotMatch(
    wastePage({ ...ASNYKA, givenNr: "5" }),
    /rejestrze adresów/,
  );
  const html = wastePage({ ...ASNYKA, givenNr: "9999" });
  assert.match(
    html,
    new RegExp(
      `<h1 class="govuk-heading-l">Odbiór śmieci</h1><p class="govuk-body">${PRG_NOTE.replace(".", "\\.")} Harmonogram jest wspólny dla całej ulicy\\.</p>`,
    ),
  );
  assert.ok(
    ascending(order(html, [...SKELETON, "Najbliższe odbiory", ...AFTER])),
    html,
  );
  // /woda: the same note, the cuts as ever.
  const water = waterPage(undefined, testPlace({ ...ASNYKA, givenNr: "9999" }));
  assert.ok(water.includes(PRG_NOTE), water);
  assert.ok(ascending(order(water, [...SKELETON, "<h2", "Godziny"])), water);
});

test("a place PRG has no points for: no note", () => {
  const html = wastePage({
    id: "0972447-48373",
    name: "os. Osiedle Unii Lubelskiej",
    givenNr: "9999",
  });
  assert.doesNotMatch(html, /rejestrze adresów/);
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
  assert.doesNotMatch(html, /rejestrze adresów/);
});

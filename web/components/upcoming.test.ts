import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { warsawToIso } from "../lib/dates.ts";
import { span } from "../lib/hub.ts";
import { type Item, trusted } from "../lib/upcoming.ts";
import { DayLead, Upcoming, UpcomingList } from "./upcoming.tsx";

// The island (components/upcoming.tsx) as the page renders it: the server's
// words from the render time, then the device's clock. Rendered at 23:58
// on Wednesday 28 Oct; the device reads 00:05 on Thursday.
const wall = (w: string) => warsawToIso(w) as string;
const RENDERED = Date.parse("2026-10-28T23:58:00+01:00");
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
  renderToStaticMarkup(createElement(UpcomingList, { items: ITEMS, now }));

test("server render: the render time's words, GOV.UK's list, section links", () => {
  const html = renderToStaticMarkup(
    createElement(Upcoming, { items: ITEMS, renderedAt: RENDERED }),
  );
  assert.equal(html, list(RENDERED));
  assert.match(
    html,
    /^<section aria-labelledby="najblizsze-dni"><h2 id="najblizsze-dni" class="govuk-heading-m">Najbliższe dni<\/h2><ul class="govuk-list govuk-list--spaced">/,
  );
  assert.match(html, /<strong>Teraz<\/strong> nie ma wody – do jutra, 0:00\./);
  assert.match(html, /<strong>Jutro<\/strong> odbiór śmieci: papier, szkło\./);
  assert.match(
    html,
    /<a class="govuk-link" href="#woda">Szczegóły i źródło<span class="govuk-visually-hidden">: woda<\/span><\/a>/,
  );
  assert.match(
    html,
    /href="#smieci">Szczegóły i źródło<span class="govuk-visually-hidden">: odbiór śmieci<\/span>/,
  );
  assert.match(html, /<hr class="govuk-section-break[^"]*"\/>$/);
});

test("23:58 → 00:05: „Jutro” becomes „Dziś”, the cut over is gone", () => {
  const html = list(LATER);
  assert.doesNotMatch(html, /wody/);
  assert.match(html, /<strong>Dziś<\/strong> odbiór śmieci: papier, szkło\./);
  assert.equal((html.match(/<li>/g) ?? []).length, 1);
});

test("a device clock earlier than the render keeps the server's words", () => {
  const early = Date.parse("2026-10-27T09:00:00+01:00");
  assert.equal(list(trusted(early, RENDERED)), list(RENDERED));
  // Within 5 minutes: the device's own.
  assert.equal(trusted(RENDERED - 60_000, RENDERED), RENDERED - 60_000);
});

test("nothing shown: no block, no heading, no break", () => {
  assert.equal(list(Date.parse("2026-10-30T00:00:00+01:00")), "");
  assert.equal(
    renderToStaticMarkup(
      createElement(Upcoming, { items: [], renderedAt: RENDERED }),
    ),
    "",
  );
});

test("a section's day lead, from the render time", () => {
  const lead = (day: string) =>
    renderToStaticMarkup(
      createElement(DayLead, {
        day,
        text: "piątek, 30 października",
        renderedAt: RENDERED,
      }),
    );
  assert.equal(lead("2026-10-29"), "Jutro: piątek, 30 października");
  assert.equal(lead("2026-11-20"), "Piątek, 30 października");
});

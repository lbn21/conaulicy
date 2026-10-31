import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { warsawToIso } from "../lib/dates.ts";
import { span } from "../lib/hub.ts";
import type { Item } from "../lib/upcoming.ts";
import { blank } from "./skeleton.tsx";
import { Upcoming } from "./upcoming.tsx";

// „Najbliższe dni” (components/upcoming.tsx) as the server renders it per
// request: what is not over at `now`, every date absolute, and in place of
// „Dziś” or „Jutro” a word-wide skeleton (the device's, after hydration:
// components/day-word.tsx). At 23:58 on Wednesday 28 Oct, and at 00:05.
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
  renderToStaticMarkup(createElement(Upcoming, { items: ITEMS, now }));

// The skeleton the server leaves for the device's word.
const WORD = `<span class="app-skeleton" aria-hidden="true">${blank("Jutro")}</span>`;

test("server render: absolute words, the word a skeleton, GOV.UK's list, section links", () => {
  const html = list(NOW);
  assert.match(
    html,
    /^<section aria-labelledby="najblizsze-dni"><h2 id="najblizsze-dni" class="govuk-heading-m">Najbliższe dni<\/h2><ul class="govuk-list govuk-list--spaced">/,
  );
  assert.ok(
    html.includes(
      `<strong>${WORD}</strong> od 22:00 do czwartku 29 października, 0:00 nie będzie wody.`,
    ),
    html,
  );
  assert.ok(
    html.includes(`<strong>${WORD}</strong> odbiór śmieci: papier, szkło.`),
    html,
  );
  assert.doesNotMatch(html, /Dziś|Teraz|jutra/);
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

test("00:05: the cut over is gone, the pickup stays", () => {
  const html = list(LATER);
  assert.doesNotMatch(html, /wody/);
  assert.match(html, /odbiór śmieci: papier, szkło\./);
  assert.equal((html.match(/<li>/g) ?? []).length, 1);
});

test("nothing shown: no block, no heading, no break", () => {
  assert.equal(list(Date.parse("2026-10-30T00:00:00+01:00")), "");
  assert.equal(
    renderToStaticMarkup(createElement(Upcoming, { items: [], now: NOW })),
    "",
  );
});

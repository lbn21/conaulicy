import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { todayInWarsaw } from "../lib/dates.ts";
import { DayWord } from "./day-word.tsx";
import { WarsawToday } from "./warsaw-today.tsx";

// The day word as the server renders it (components/day-word.tsx): for the
// Warsaw day of the request's instant, so in the HTML, never a skeleton.
// Around Warsaw midnight, on an ordinary night and on both DST nights.
const word = (
  at: string,
  day: string,
  form: "lead" | "word" | "label" | "title",
) =>
  renderToStaticMarkup(
    createElement(
      WarsawToday,
      { day: todayInWarsaw(new Date(at)) },
      createElement(DayWord, { day, form, text: "niedziela, 25 października" }),
    ),
  );

test("Warsaw midnight, DST ending (25 Oct 2026, CEST to CET)", () => {
  // 23:59 CEST on Saturday, then 0:00 on Sunday.
  assert.equal(word("2026-10-24T21:59:00Z", "2026-10-25", "label"), "Jutro");
  assert.equal(word("2026-10-24T22:00:00Z", "2026-10-25", "label"), "Dziś");
  // 23:59 CET on Sunday, the 25-hour day over: Monday is „jutro”.
  assert.equal(word("2026-10-25T22:59:00Z", "2026-10-26", "word"), "jutro, ");
  assert.equal(word("2026-10-25T23:00:00Z", "2026-10-26", "word"), "dziś, ");
});

test("Warsaw midnight, DST starting (28 Mar 2027, CET to CEST)", () => {
  assert.equal(word("2027-03-27T22:59:00Z", "2027-03-28", "label"), "Jutro");
  assert.equal(word("2027-03-27T23:00:00Z", "2027-03-28", "label"), "Dziś");
  // The 23-hour day: 23:59 CEST on Sunday, then Monday.
  assert.equal(word("2027-03-28T21:59:00Z", "2027-03-29", "label"), "Jutro");
  assert.equal(word("2027-03-28T22:00:00Z", "2027-03-29", "label"), "Dziś");
});

test("lead: dayLead's words (lib/timeline.test.ts) for the server's day", () => {
  assert.equal(
    word("2026-10-20T12:00:00Z", "2026-10-25", "lead"),
    "Za 5 dni: niedziela, 25 października",
  );
});

test("title: Intl's relative day as a badge after a card's date, strong for today and tomorrow", () => {
  const title = (day: string) =>
    word("2026-11-10T12:00:00Z", day, "title").replace(/<[^>]+>/g, "");
  assert.deepEqual(
    ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-14"].map(title),
    // The comma and its space for screen readers, then the badge's space.
    [",  Dzisiaj", ",  Jutro", ",  Pojutrze", ",  Za 4 dni"],
  );
  const badge = (day: string) =>
    word("2026-11-10T12:00:00Z", day, "title").match(
      /class="(app-badge[^"]*)"/,
    )?.[1];
  assert.equal(badge("2026-11-10"), "app-badge app-badge--strong");
  assert.equal(badge("2026-11-11"), "app-badge app-badge--strong");
  assert.equal(badge("2026-11-12"), "app-badge");
  // Across the DST change, by Warsaw days.
  assert.equal(
    word("2026-10-24T22:30:00Z", "2026-10-26", "title").replace(/<[^>]+>/g, ""),
    ",  Jutro",
  );
});

test("no server day (outside WarsawToday): the date alone, no word", () => {
  const html = (form: "lead" | "word" | "label" | "title") =>
    renderToStaticMarkup(
      createElement(DayWord, { day: "2026-10-25", form, text: "x" }),
    );
  assert.equal(html("word"), "");
  assert.equal(html("label"), "x");
  assert.equal(html("lead"), "X");
  assert.equal(html("title"), "");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MODULES } from "../lib/modules.ts";
import { testPlace } from "../lib/water-fixture.ts";
import { ModuleBody, ModuleSection } from "./hub.tsx";

// A hub section (components/hub.tsx) as the address page renders it, for a
// made-up place: with no source, no subpage link and no meta line.
const PLACE = {
  id: "0000001-00001",
  name: "ul. Próbna",
  label: "ul. Próbna, Wzorowo",
  area: "Wzorowo",
  group: "0000001",
  gmina: "Wzorowo",
  localityId: "0000001",
  streetId: "0000001-00001",
};
const SCHEDULE = "https://example.org/harmonogram";
const SOURCE = {
  url: "https://example.org/harmonogram.pdf",
  label: "sektor 1",
  checkedAt: "2026-10-20",
  seenAt: null,
};

const section = (place: Parameters<typeof testPlace>[0]) => {
  const data = testPlace({ ...PLACE, schedulePage: SCHEDULE, ...place });
  return renderToStaticMarkup(
    createElement(
      ModuleSection,
      { module: MODULES.smieci },
      createElement(ModuleBody, {
        loaded: { module: MODULES.smieci, data },
        place: data,
      }),
    ),
  );
};

test("hub section: no source, no „Źródło: .”, no subpage link, no empty line", () => {
  const html = section({ zoneId: null, sources: [] });
  assert.doesNotMatch(html, /Źródło/);
  assert.doesNotMatch(html, /Wszystkie odbiory śmieci/);
  assert.doesNotMatch(html, /<p class="govuk-body-s">/);
  // The status and the link to the schedule stay.
  assert.match(html, new RegExp(`href="${SCHEDULE}"`));
  assert.match(html, /<\/h2><p class="govuk-body">[^<]+ /);
});

test("hub section: a split street without a number keeps „Podaj numer domu”", () => {
  const html = section({ askNumber: true, zoneId: null, sources: [] });
  assert.match(html, />Podaj numer domu<\/a>/);
});

test("hub section: with a source, its subpage link, then the meta line", () => {
  const html = section({ zoneId: "waste:sektor-1", sources: [SOURCE] });
  assert.match(
    html,
    /<p class="govuk-body"><a class="govuk-link" href="\/adres\/[^"]+\/smieci">Wszystkie odbiory śmieci<\/a><\/p><p class="govuk-body-s">Źródło: <a [^>]*href="https:\/\/example\.org\/harmonogram\.pdf"[^>]*>[^<]+<\/a>, sektor 1\. Sprawdziliśmy 20 października\.<\/p><\/section>$/,
  );
});

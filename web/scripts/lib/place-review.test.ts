import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyBlockers,
  hasPlaceChanges,
  type PlaceRow,
  placeReviewYaml,
  planPlaces,
  readPlaceReview,
} from "./place-review.ts";

const TOWN = "0972447";
const town: PlaceRow = {
  id: TOWN,
  name: "Lubaczów",
  kind: "miasto",
  gminaId: "g",
};
const village: PlaceRow = {
  id: "0606010",
  name: "Dąbrowa",
  kind: "wies",
  gminaId: "g2",
};
const street = (
  sym: string,
  name: string,
  extra: Partial<PlaceRow> = {},
): PlaceRow => ({
  id: `${TOWN}-${sym}`,
  localityId: TOWN,
  prefix: "ul.",
  name,
  ...extra,
});
// Twenty streets, each in the town's sector, and the village's own.
const STREETS = Array.from({ length: 20 }, (_, i) =>
  street(String(10000 + i), `Testowa ${i + 1}`),
);
const members = (list: PlaceRow[]) => [
  ...list.map((s) => ({
    zoneId: "waste:miasto-s1",
    localityId: TOWN,
    streetId: s.id,
  })),
  { zoneId: "waste:gmina-s1", localityId: village.id, streetId: null },
];
const places = (streets: PlaceRow[]) => ({
  streets,
  localities: [town, village],
});

test("unchanged places: no plan, nothing to review", () => {
  const plan = planPlaces(places(STREETS), places(STREETS), members(STREETS));
  assert.equal(hasPlaceChanges(plan), false);
  assert.deepEqual(applyBlockers(plan), []);
  assert.equal(plan.current, 21);
});

test("a rename: the gone street retired, replaced by the one new street of its name", () => {
  const renamed = street("19999", "Testowa 3");
  const next = [...STREETS.filter((s) => s.id !== STREETS[2].id), renamed];
  const plan = planPlaces(places(STREETS), places(next), members(next));
  assert.deepEqual(plan.retired, [
    {
      id: STREETS[2].id,
      name: "ul. Testowa 3 (Lubaczów)",
      replacedBy: renamed.id,
      candidates: [renamed.id],
    },
  ]);
  assert.deepEqual(plan.added, [
    {
      id: renamed.id,
      name: "ul. Testowa 3 (Lubaczów)",
      zone: "waste:miasto-s1",
    },
  ]);
  assert.deepEqual(applyBlockers(plan), []);
});

test("a removal: retired, nothing replaces it, never deleted", () => {
  const next = STREETS.slice(1);
  const plan = planPlaces(places(STREETS), places(next), members(next));
  assert.deepEqual(
    plan.retired.map(({ id, replacedBy }) => ({ id, replacedBy })),
    [{ id: STREETS[0].id, replacedBy: null }],
  );
  assert.deepEqual(plan.added, []);
  assert.deepEqual(applyBlockers(plan), []);
});

test("a like name or two candidates: left to the review, never guessed", () => {
  const like = street("19998", "Adama Testowa 4");
  const twins = [street("19996", "Testowa 5"), street("19997", "Testowa 5")];
  const next = [
    ...STREETS.filter((s) => s.id !== STREETS[3].id && s.id !== STREETS[4].id),
    like,
    ...twins,
  ];
  const plan = planPlaces(places(STREETS), places(next), members(next));
  const byId = new Map(plan.retired.map((r) => [r.id, r]));
  assert.deepEqual(byId.get(STREETS[3].id), {
    id: STREETS[3].id,
    name: "ul. Testowa 4 (Lubaczów)",
    replacedBy: null,
    candidates: [like.id],
  });
  assert.equal(byId.get(STREETS[4].id)?.replacedBy, null);
  assert.deepEqual(
    byId.get(STREETS[4].id)?.candidates,
    twins.map((t) => t.id),
  );
});

test("a new street without a zone blocks --apply", () => {
  const lost = street("19995", "Nowa");
  const plan = planPlaces(
    places(STREETS),
    places([...STREETS, lost]),
    members(STREETS),
  );
  assert.deepEqual(plan.added, [
    { id: lost.id, name: "ul. Nowa (Lubaczów)", zone: null },
  ]);
  assert.match(applyBlockers(plan).join("\n"), /19995.*no waste zone/);
});

test("a new village part takes its village's zone; a new village without one blocks", () => {
  const part: PlaceRow = {
    id: "0606027",
    name: "Holiki",
    kind: "czesc_wsi",
    gminaId: "g2",
    parentId: village.id,
  };
  const lone: PlaceRow = {
    id: "0606999",
    name: "Nowa Wieś",
    kind: "wies",
    gminaId: "g2",
  };
  const plan = planPlaces(
    places(STREETS),
    { streets: STREETS, localities: [town, village, part, lone] },
    members(STREETS),
  );
  assert.deepEqual(
    plan.added.map(({ id, zone }) => ({ id, zone })),
    [
      { id: part.id, zone: "waste:gmina-s1" },
      { id: lone.id, zone: null },
    ],
  );
  assert.equal(applyBlockers(plan).length, 1);
});

test("over 10% retired at once blocks --apply, unless allowed", () => {
  const next = STREETS.slice(3);
  const plan = planPlaces(places(STREETS), places(next), members(next));
  assert.equal(plan.retired.length, 3);
  assert.match(
    applyBlockers(plan).join("\n"),
    /3 of 21 places.*--allow-mass-retire/,
  );
  assert.deepEqual(applyBlockers(plan, { allowMassRetire: true }), []);
});

test("a retired place listed again is restored; one retired stays out of the plan", () => {
  const before = STREETS.map((s, i) =>
    i < 2 ? { ...s, retiredAt: "2026-11-01 00:00:00+00" } : s,
  );
  const next = [STREETS[0], ...STREETS.slice(2)];
  const plan = planPlaces(places(before), places(next), members(next));
  assert.deepEqual(
    plan.restored.map((p) => p.id),
    [STREETS[0].id],
  );
  assert.deepEqual(plan.retired, []);
  assert.equal(plan.current, 19);
});

test("the review: only the merged file of this exact plan, its replacements current places", () => {
  const renamed = street("19999", "Testowa 3");
  const next = [...STREETS.filter((s) => s.id !== STREETS[2].id), renamed];
  const plan = planPlaces(places(STREETS), places(next), members(next));
  const yaml = placeReviewYaml(plan, "2026-11-13");

  const ok = readPlaceReview(yaml, plan, places(next));
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(
    [...(ok.review?.replacedBy ?? [])],
    [[STREETS[2].id, renamed.id]],
  );

  // The reviewer says it is gone, not renamed.
  const goneYaml = yaml.replace(
    `replaced_by: ${renamed.id}`,
    "replaced_by: null",
  );
  assert.deepEqual(
    [
      ...(readPlaceReview(goneYaml, plan, places(next)).review?.replacedBy ??
        []),
    ],
    [[STREETS[2].id, null]],
  );

  assert.match(
    readPlaceReview(null, plan, places(next)).errors[0],
    /No merged/,
  );
  const other = planPlaces(
    places(STREETS),
    places(STREETS.slice(1)),
    members(STREETS),
  );
  assert.match(
    readPlaceReview(yaml, other, places(STREETS)).errors[0],
    /another plan/,
  );
  const bad = yaml.replace(
    `replaced_by: ${renamed.id}`,
    `replaced_by: ${STREETS[2].id}`,
  );
  assert.match(
    readPlaceReview(bad, plan, places(next)).errors[0],
    /no current place/,
  );
});

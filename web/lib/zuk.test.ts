import assert from "node:assert/strict";
import { test } from "node:test";
import type { Disruption } from "./disruptions.ts";
import { DISTRICTS } from "./districts-seed.ts";
import { MZGKIM } from "./water-sources.ts";
import { plainText, readPost, type ZukPost } from "./zuk.ts";
import type { AiItem, AiResult } from "./zuk-ai.ts";
import {
  AI_ITEM,
  PLACES,
  POST_39885_EDITED,
  READINGS,
  reading,
  reading39885Edited,
  realPosts,
} from "./zuk-fixture.ts";
import { TRUTH } from "./zuk-fixture-b.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";

const CHECKED = "2026-10-25T07:00:00Z";
const posts = realPosts();
const post = (id: number) => {
  const found = posts.find((p) => p.id === id);
  assert.ok(found, `no post ${id}`);
  return found;
};

function cuts(p: ZukPost, ai = reading(p.id)): Disruption[] {
  const read = readPost(p, ai, PLACES, CHECKED);
  assert.equal(read.status, "parsed", JSON.stringify(read));
  return read.status === "parsed" ? read.items : [];
}

const at = (items: Disruption[], date: string) =>
  items
    .filter((d) => d.date === date)
    .map((d) => d.place.streetId ?? d.place.localityId);

test("real: every post the model read, checked and resolved", () => {
  const notices: Record<number, string> = {};
  for (const p of posts) {
    const read = readPost(p, reading(p.id), PLACES, CHECKED);
    if (read.status === "notice") notices[p.id] = read.reason;
  }
  assert.deepEqual(notices, {
    // The fox vaccination post: not a water cut.
    39868: "not an outage notice",
  });
  assert.equal(Object.keys(READINGS).length, posts.length);
});

// What the truth has that the readings cannot give: left out, never wrong.
const LOST_POSTS: Record<number, string> = {
  39868: "not a water cut",
};

test("real items: all 24 posts, every place-day right, none wrong", () => {
  const ids = posts.map((p) => p.id);
  const hhmm = (wall: string | null) => wall?.slice(11, 16) ?? null;
  const got = new Set<string>();
  for (const id of ids) {
    const read = readPost(post(id), reading(id), PLACES, CHECKED);
    if (id in LOST_POSTS) {
      assert.equal(read.status, "notice");
      continue;
    }
    assert.equal(read.status, "parsed", `${id}: ${JSON.stringify(read)}`);
    if (read.status !== "parsed") continue;
    assert.deepEqual(read.rejected, [], String(id));
    for (const d of read.items)
      got.add(
        [
          id,
          d.date,
          hhmm(d.start),
          hhmm(d.end),
          d.place.streetId ?? d.place.localityId,
          d.scope.type,
        ].join(" "),
      );
  }
  const want = new Set<string>();
  for (const [id, date, start, end, localityId, streetId, houses] of TRUTH) {
    if (id in LOST_POSTS) continue;
    // A whole village is the village and each of its streets.
    const places = streetId
      ? [streetId]
      : [
          localityId,
          ...PLACES.streets
            .filter((s) => s.localityId === localityId)
            .map((s) => s.id),
        ];
    // The note names the part ("Podłęże od numeru 44 do numeru 92"), so
    // the houses are not read: part of Załuże, never wider.
    const read = id === 39885 && localityId === "0606464" ? "unknown" : houses;
    for (const place of places)
      want.add([id, date, start, end, place, read].join(" "));
  }
  assert.deepEqual([...got].sort(), [...want].sort());
  assert.equal(TRUTH.length, 117);
});

test("real 39885 as edited (14:41): Lisie Jamy whole on 26 and 29.10, four streets on 27.10", () => {
  const read = readPost(
    POST_39885_EDITED,
    reading39885Edited(),
    ZUK_PLACES,
    CHECKED,
  );
  assert.equal(read.status, "parsed", JSON.stringify(read));
  if (read.status !== "parsed") return;
  assert.deepEqual(read.rejected, []);
  const lisie = [
    "0606234",
    ...ZUK_PLACES.streets
      .filter((s) => s.localityId === "0606234")
      .map((s) => s.id),
  ];
  const ofLisie = (date: string) =>
    at(read.items, date).filter((id) => id.startsWith("0606234"));
  // 26.10: the whole village, every street of it.
  assert.deepEqual(ofLisie("2026-10-26"), lisie);
  // 27.10: only its four streets, 8:00-12:00, never the village.
  assert.deepEqual(ofLisie("2026-10-27"), [
    "0606234-03839",
    "0606234-23795",
    "0606234-10898",
    "0606234-26081",
  ]);
  for (const d of read.items.filter(
    (d) => d.date === "2026-10-27" && d.place.localityId === "0606234",
  )) {
    assert.deepEqual(d.scope, { type: "whole" });
    assert.equal(d.end, "2026-10-27 12:00:00");
  }
  // 29.10: the whole village again, and Wólka Krowicka.
  assert.deepEqual(ofLisie("2026-10-29"), lisie);
  assert.ok(at(read.items, "2026-10-29").includes("0606441"));
  // "Lubaczów ul. Żuki": the town's street, never Dąbków's or Opaka's part.
  assert.ok(at(read.items, "2026-10-27").includes("0972447-26555"));
  // Dąbków's own ul. Żuki only as the whole village Dąbków.
  const dabkow = read.items.find(
    (d) => d.uid === "zuk-39885-2026-10-27-0606004-26555",
  );
  assert.equal(dabkow?.where, "Dąbków");
  assert.ok(at(read.items, "2026-10-28").includes("0972447-17742"));
});

test("the gazetteer changes no gmina post: every real one reads the same with it", () => {
  const withDistricts = { ...PLACES, districts: DISTRICTS };
  for (const p of posts)
    assert.deepEqual(
      readPost(p, reading(p.id), withDistricts, CHECKED),
      readPost(p, reading(p.id), PLACES, CHECKED),
      String(p.id),
    );
  // Nor 39885 as edited, on the full snapshot ("Lubaczów ul. Żuki").
  assert.deepEqual(
    readPost(
      POST_39885_EDITED,
      reading39885Edited(),
      { ...ZUK_PLACES, districts: DISTRICTS },
      CHECKED,
    ),
    readPost(POST_39885_EDITED, reading39885Edited(), ZUK_PLACES, CHECKED),
  );
});

test("real 34394: bare Dąbrowa is the village, Krowica Lasowa kept", () => {
  const items = cuts(post(34394));
  assert.deepEqual(
    items.map((d) => d.place.localityId),
    ["0606010", "0606168"],
  );
  assert.deepEqual(items[0].label, {
    locality: "Dąbrowa",
    parent: null,
    street: null,
  });
});

test("real 39885: Załuże–Podłęże is part of Załuże, the part in the note, no alias", () => {
  const zaluze = cuts(post(39885)).find(
    (d) => d.uid === "zuk-39885-2026-10-28-0606464",
  );
  assert.deepEqual(zaluze?.scope, { type: "unknown" });
  assert.equal(zaluze?.note, "Podłęże od numeru 44 do numeru 92");
  assert.equal(zaluze?.where, "Załuże");
});

test("real 39885: four days, villages expanded, a street of the town", () => {
  const items = cuts(post(39885));
  const lisie = PLACES.streets.filter((s) => s.localityId === "0606234");
  assert.deepEqual(at(items, "2026-10-26"), [
    "0606234",
    ...lisie.map((s) => s.id),
  ]);
  const dabkow = PLACES.streets.filter((s) => s.localityId === "0606004");
  assert.deepEqual(at(items, "2026-10-27"), [
    "0606004",
    ...dabkow.map((s) => s.id),
    "0972447-26555",
    "0606317",
  ]);
  const opaka = items.find((d) => d.uid === "zuk-39885-2026-10-27-0606317");
  assert.deepEqual(opaka?.scope, {
    type: "ranges",
    ranges: [{ from: "104", to: "110" }],
  });
  assert.equal(opaka?.where, "Opaka");
  assert.equal(opaka?.note, "od numeru 104 do 110");
  const day28 = at(items, "2026-10-28");
  // Lubaczów's Przemysłowa, Młodów's Pilipy, Bałaje.
  for (const id of ["0972447-17742", "0606286-39507", "0605878"])
    assert.ok(day28.includes(id), id);
  // Załuże, its part Podłęże in the note.
  assert.ok(day28.includes("0606464"));
  // Pilipy is a street: Młodów itself is not cut.
  assert.ok(!day28.includes("0606286"));
  const first = items[0];
  assert.equal(first.start, "2026-10-26 08:00:00");
  assert.equal(first.end, "2026-10-26 16:00:00");
  assert.equal(first.cause, "planned");
  assert.equal(first.publishedAt, "2026-10-23 18:59:43");
  assert.deepEqual(first.source, {
    name: "Zakład Usług Komunalnych w Mokrzycy",
    url: "https://www.gminalubaczow.pl/2026/10/23/przerwy-w-dostawie-wody-26-29-10-2026/",
    checkedAt: CHECKED,
  });
});

test("a post with no place left is a Notice, its items rejected", () => {
  const ai = reading(39863);
  ai.items = ai.items.map((i) => ({ ...i, locality: "Podłęże" }));
  const read = readPost(post(39863), ai, PLACES, CHECKED);
  assert.equal(read.status, "notice");
  assert.equal(
    read.status === "notice" ? read.reason : "",
    "no place: locality not listed",
  );
  assert.deepEqual(
    read.rejected.map((r) => [r.reason, r.localityId, r.words]),
    [["locality not listed", null, "Wólka Krowicka"]],
  );
});

test("rejected: the reason, the locality if listed, the words if in the post", () => {
  const ai = reading(39885);
  const zuki = ai.items.findIndex((i) => i.street === "Żuki");
  ai.items[zuki] = { ...ai.items[zuki], street: "Żukowska" };
  ai.items.push({
    ...ai.items[0],
    locality: null,
    locality_verbatim: "Nowe Sioło",
    suggested_places: ["Opaka"],
  });
  const read = readPost(post(39885), ai, PLACES, CHECKED);
  assert.equal(read.status, "parsed");
  assert.deepEqual(
    read.rejected.map((r) => [r.reason, r.localityId, r.words]),
    [
      ["street not listed", "0972447", "ul. Żuki"],
      ["locality not listed", null, null],
    ],
  );
  assert.equal(read.rejected[1].item.suggested_places[0], "Opaka");
});

test("a district: its streets, each its stretch; the note limits them all", () => {
  const text =
    "W dniu 2.09.2026r. (środa) od 8:00 do 16:00 brak wody: osiedle Mazury.";
  const ai: AiResult = {
    post_type: "water_outage",
    quality_status: null,
    is_past: false,
    changes_earlier_dates: false,
    items: [
      {
        date: "2026-09-02",
        start: "08:00",
        end: "16:00",
        kind: "planned",
        locality: "Lubaczów",
        locality_verbatim: null,
        street: "Osiedle Mazury",
        street_verbatim: "osiedle Mazury",
        note: null,
        ...AI_ITEM,
      },
    ],
  };
  const places = { ...ZUK_PLACES, districts: DISTRICTS };
  const mzgkim = { source: MZGKIM };
  const whole = readPost(inline("Przerwa", text), ai, places, CHECKED, mzgkim);
  assert.equal(whole.status, "parsed");
  if (whole.status !== "parsed") return;
  assert.equal(whole.items.length, 22);
  assert.ok(whole.items.every((d) => d.where === "osiedle Mazury"));
  ai.items[0].note = "osiedle";
  const part = readPost(inline("Przerwa", text), ai, places, CHECKED, mzgkim);
  assert.ok(
    part.status === "parsed" &&
      part.items.every(
        (d) => d.scope.type === "unknown" && d.note === "osiedle",
      ),
  );
  // A district with no street: rejected, linked on the town's pages.
  ai.items[0] = {
    ...ai.items[0],
    street: "Osiedle za Koleją",
    street_verbatim: "osiedle",
    note: null,
  };
  const none = readPost(inline("Przerwa", text), ai, places, CHECKED, mzgkim);
  assert.deepEqual(
    none.rejected.map((r) => [r.reason, r.localityId]),
    [["district has no streets", "0972447"]],
  );
});

test("real 23860: days inside 'od 06.11.2023 do 10.11.2023' pass", () => {
  const days = new Set(cuts(post(23860)).map((d) => d.date));
  assert.deepEqual(
    [...days],
    ["02", "03", "06", "07", "08", "09", "10"].map((d) => `2023-11-${d}`),
  );
});

test("real 35661: an emergency, its end an estimate", () => {
  const [first] = cuts(post(35661));
  assert.equal(first.cause, "emergency");
  assert.equal(first.start, null);
  assert.equal(first.end, "2025-12-16 19:00:00");
  assert.equal(first.endEstimated, true);
});

test("real 26028: 'w części' and the SUW note are only part of the place", () => {
  const items = cuts(post(26028));
  const balaje = items.find((d) => d.uid === "zuk-26028-2024-04-09-0605878");
  assert.deepEqual(balaje?.scope, { type: "unknown" });
  assert.equal(balaje?.note, "w części miejscowości");
  // The bracket after ul. Przemysłowa is its note: the town's street in
  // part, never Mokrzyca.
  const suw = items.find((d) => d.uid === "zuk-26028-2024-04-09-0972447-17742");
  assert.deepEqual(suw?.scope, { type: "unknown" });
  assert.equal(suw?.note, "gospodarstwa zasilane z SUW Mokrzyca");
  assert.ok(!items.some((d) => d.place.localityId === "0605884"));
  const zaluze = items.find((d) => d.uid === "zuk-26028-2024-04-10-0606464");
  assert.deepEqual(zaluze?.scope, { type: "unknown" });
  // Bałaje on 10 Apr is named on its own: all of it.
  const later = items.find((d) => d.uid === "zuk-26028-2024-04-10-0605878");
  assert.deepEqual(later?.scope, { type: "whole" });
});

test("real 39699: the hamlet in its bracket is its own listed part", () => {
  const [only, ...rest] = cuts(post(39699));
  assert.equal(rest.length, 0);
  assert.deepEqual(only.place, { localityId: "0605967", streetId: null });
});

test("a date or time the text does not have makes a Notice", () => {
  const ai = reading(39863);
  ai.items[0] = { ...ai.items[0], date: "2026-10-21" };
  assert.deepEqual(readPost(post(39863), ai, PLACES, CHECKED), {
    status: "notice",
    reason: "item 1: date",
    rejected: [
      {
        item: ai.items[0],
        reason: "date",
        localityId: "0606441",
        words: "Wólka Krowicka",
      },
    ],
    localityIds: ["0606441"],
  });
  const late = reading(39863);
  late.items[0] = { ...late.items[0], end: "17:00" };
  const read = readPost(post(39863), late, PLACES, CHECKED);
  assert.equal(read.status === "notice" && read.reason, "item 1: time");
  assert.deepEqual(read.rejected[0].localityId, "0606441");
});

test("one place and day twice in a post makes a Notice", () => {
  const ai = reading(39863);
  ai.items.push(ai.items[0]);
  const read = readPost(post(39863), ai, PLACES, CHECKED);
  assert.equal(read.status, "notice");
});

test("no items, or not an outage notice", () => {
  assert.deepEqual(
    readPost(
      post(39863),
      {
        post_type: "water_outage",
        quality_status: null,
        is_past: false,
        changes_earlier_dates: false,
        items: [],
      },
      PLACES,
      CHECKED,
    ),
    { status: "notice", reason: "no items", rejected: [], localityIds: [] },
  );
});

test("uid: the same across re-reads", () => {
  const a = cuts(post(39872)).map((d) => d.uid);
  const b = cuts(post(39872)).map((d) => d.uid);
  assert.deepEqual(a, b);
  assert.ok(a.includes("zuk-39872-2026-10-22-0606116-20431"));
});

const inline = (title: string, text: string): ZukPost => ({
  id: 1,
  date: "2026-08-28T10:00:00",
  modified: "2026-08-28T10:00:00",
  link: "https://www.gminalubaczow.pl/",
  title: { rendered: title },
  content: { rendered: `<p>${text}</p>` },
});

test("a post's localities: its items', passed or rejected, and listed suggestions", () => {
  const read = readPost(post(34394), reading(34394), PLACES, CHECKED);
  assert.deepEqual(read.localityIds, ["0606010", "0606168"]);
  // Only rejected items: their listed localities and suggestions, no
  // name looked for in the text.
  const ai = reading(39863);
  ai.items = [
    {
      ...ai.items[0],
      locality: null,
      locality_verbatim: "Nowe Sioło",
      suggested_places: ["Opaka", "Jana III Sobieskiego", "Nie Ma"],
    },
    { ...ai.items[0], street: "Nie Ma", street_verbatim: "Wólka Krowicka" },
  ];
  const notice = readPost(post(39863), ai, PLACES, CHECKED);
  assert.equal(notice.status, "notice");
  // A street name listed in three villages: all three.
  assert.deepEqual(notice.localityIds, [
    "0605890",
    "0606116",
    "0606234",
    "0606317",
    "0606441",
  ]);
  assert.deepEqual(
    readPost(post(39863), { ...ai, items: [] }, PLACES, CHECKED).localityIds,
    [],
  );
});

test("plain text: a line per paragraph and list item, entities decoded", () => {
  assert.equal(
    plainText(
      "<p>Przerwa &#8211; <strong>22.10.2026r.</strong>&nbsp;(czwartek)</p>\n<ul><li>Lisie Jamy</li><li>Opaka<br />nr 5</li></ul>",
    ),
    "Przerwa – 22.10.2026r. (czwartek)\nLisie Jamy\nOpaka\nnr 5",
  );
});

const RANGE_TEXT =
  "Zakład Usług Komunalnych Sp. z o. o. w Mokrzycy informuje, że w dniu 2.09.2026r. (środa) w godz. od 8:00 do godz. 16:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości";

/** One item a hand-written model reading gives for `where`, on 2 Sep. */
function readOne(
  where: string,
  item: Pick<
    AiItem,
    "locality" | "locality_verbatim" | "street" | "street_verbatim" | "note"
  >,
) {
  const ai: AiResult = {
    post_type: "water_outage",
    quality_status: null,
    is_past: false,
    changes_earlier_dates: false,
    items: [
      {
        date: "2026-09-02",
        start: "08:00",
        end: "16:00",
        kind: "planned",
        ...AI_ITEM,
        ...item,
      },
    ],
  };
  return readPost(
    inline(
      `Przerwa w dostawie wody – ${where} (2.09.2026)`,
      `${RANGE_TEXT} ${where}.`,
    ),
    ai,
    ZUK_PLACES,
    CHECKED,
  );
}

const parsed = (read: ReturnType<typeof readPost>) => {
  assert.equal(read.status, "parsed", JSON.stringify(read));
  return read.status === "parsed" ? read : { items: [], rejected: [] };
};

test("house numbers in a village with streets: the village only, never its streets", () => {
  const krowica = parsed(
    readOne("Krowica Sama od nr 10 do nr 50", {
      locality: "Krowica Sama",
      locality_verbatim: "Krowica Sama",
      street: null,
      street_verbatim: null,
      note: "od nr 10 do nr 50",
    }),
  );
  assert.deepEqual(krowica.rejected, []);
  assert.equal(krowica.items.length, 1);
  const [cut] = krowica.items;
  assert.deepEqual(cut.place, { localityId: "0606180", streetId: null });
  assert.deepEqual(cut.scope, {
    type: "ranges",
    ranges: [{ from: "10", to: "50" }],
  });
  assert.equal(cut.label?.street, null);
  assert.ok(
    !krowica.items.some((d) => d.place.streetId?.startsWith("0606180-")),
  );

  const mlodow = parsed(
    readOne("Młodów nr 12", {
      locality: "Młodów",
      locality_verbatim: "Młodów",
      street: null,
      street_verbatim: null,
      note: "nr 12",
    }),
  );
  assert.deepEqual(mlodow.rejected, []);
  assert.equal(mlodow.items.length, 1);
  assert.deepEqual(mlodow.items[0].place, {
    localityId: "0606286",
    streetId: null,
  });
  assert.deepEqual(mlodow.items[0].scope, { type: "numbers", numbers: ["12"] });
  assert.ok(
    !mlodow.items.some((d) => d.place.streetId?.startsWith("0606286-")),
  );
});

test("a whole village with streets: the village and each street, as before", () => {
  const read = parsed(
    readOne("Krowica Sama", {
      locality: "Krowica Sama",
      locality_verbatim: "Krowica Sama",
      street: null,
      street_verbatim: null,
      note: null,
    }),
  );
  assert.deepEqual(
    read.items.map((d) => [d.place.streetId ?? d.place.localityId, d.scope]),
    [
      ["0606180", { type: "whole" }],
      ["0606180-51473", { type: "whole" }],
    ],
  );
});

test("house numbers on a village's street: that street only, as before", () => {
  const read = parsed(
    readOne("Lisie Jamy ul. Długa od nr 40 do nr 145", {
      locality: "Lisie Jamy",
      locality_verbatim: "Lisie Jamy",
      street: "Długa",
      street_verbatim: "ul. Długa",
      note: "od nr 40 do nr 145",
    }),
  );
  assert.deepEqual(
    read.items.map((d) => [d.place.streetId, d.scope]),
    [
      [
        "0606234-03839",
        { type: "ranges", ranges: [{ from: "40", to: "145" }] },
      ],
    ],
  );
});

test("the town without a street or whole_town: rejected, never the town", () => {
  const read = readOne("Lubaczów od nr 1 do nr 20", {
    locality: "Lubaczów",
    locality_verbatim: "Lubaczów",
    street: null,
    street_verbatim: null,
    note: "od nr 1 do nr 20",
  });
  assert.equal(read.status, "notice");
  assert.deepEqual(
    read.rejected.map((r) => r.reason),
    ["street not listed"],
  );
});

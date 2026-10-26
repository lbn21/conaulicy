import assert from "node:assert/strict";
import { test } from "node:test";
import type { Disruption } from "./disruptions.ts";
import { DISTRICTS } from "./districts-seed.ts";
import { matchesOutageKeywords } from "./sources/gmina-lubaczow/index.ts";
import {
  isChangePost,
  isPastPost,
  mentionedLocalities,
  plainText,
  readPost,
  titleDays,
  type ZukPost,
} from "./zuk.ts";
import type { AiItem, AiResult } from "./zuk-ai.ts";
import {
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

// What the gate (gate-spec v3.1) drops of the truth, by its own rules:
// left out, never wrong.
const LOST_POSTS: Record<number, string> = {
  39868: "not a water cut",
};
const LOST_ITEMS: Record<number, string[]> = {
  // "ul. Przemysłowa (gospodarstwa zasilane z SUW Mokrzyca)": the bracket
  // after the street names Mokrzyca, so Mokrzyca decides, not Lubaczów.
  26028: ["item 2: proximity: deciding mention Mokrzyca (bracket)"],
};

test("real, v3.1 items: all 24 posts, every place-day right, none wrong", () => {
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
    assert.deepEqual(read.dropped, LOST_ITEMS[id] ?? [], String(id));
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
    if (id === 26028 && streetId === "0972447-17742") continue;
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

test("real 39885 as edited (14:41): each dated line its own, Lisie Jamy whole on 26 and 29.10", () => {
  const read = readPost(
    POST_39885_EDITED,
    reading39885Edited(),
    ZUK_PLACES,
    CHECKED,
  );
  assert.equal(read.status, "parsed", JSON.stringify(read));
  if (read.status !== "parsed") return;
  assert.deepEqual(read.dropped, []);
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
  // The 27.10 line still guards its own day: the whole village read for
  // it is dropped, its streets left out.
  const widened = reading39885Edited();
  widened.items.splice(1, 4, {
    ...widened.items[1],
    street: null,
    street_verbatim: null,
  });
  const wide = readPost(POST_39885_EDITED, widened, ZUK_PLACES, CHECKED);
  assert.equal(wide.status, "parsed");
  if (wide.status !== "parsed") return;
  assert.deepEqual(wide.dropped, [
    'item 2: "Lisie Jamy" leaves out what the text adds to it',
  ]);
  assert.deepEqual(
    at(wide.items, "2026-10-27").filter((id) => id.startsWith("0606234")),
    [],
  );
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

test("real 39865: the reading that dropped ul. Pilipy loses only that place", () => {
  // grok-4.7, the first prompt (before the place rule): all of Młodów.
  const ai = reading(39865);
  const pilipy = ai.items.findIndex((i) => i.street === "Pilipy");
  ai.items[pilipy] = {
    ...ai.items[pilipy],
    street: null,
    street_verbatim: null,
  };
  const read = readPost(post(39865), ai, PLACES, CHECKED);
  assert.equal(read.status, "parsed");
  if (read.status !== "parsed") return;
  assert.equal(read.dropped.length, 1);
  assert.match(read.dropped[0], /^item 8: "Młodów" leaves out/);
  // Neither Młodów nor any of its streets: never widened.
  assert.ok(read.items.every((d) => d.place.localityId !== "0606286"));
  assert.ok(read.items.some((d) => d.place.localityId === "0605890"));
});

test("a post with no place left is a Notice", () => {
  const ai = reading(39863);
  ai.items = ai.items.map((i) => ({ ...i, locality: "Podłęże" }));
  const read = readPost(post(39863), ai, PLACES, CHECKED);
  assert.equal(read.status, "notice");
  assert.match(
    read.status === "notice" ? read.reason : "",
    /^no place: item 1:/,
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
  // The bracket after ul. Przemysłowa names Mokrzyca: dropped (the gate's
  // bracket rule), never Mokrzyca's.
  assert.ok(
    !items.some((d) => d.uid.startsWith("zuk-26028-2024-04-09-0972447")),
  );
  assert.ok(!items.some((d) => d.place.localityId === "0605884"));
  const zaluze = items.find((d) => d.uid === "zuk-26028-2024-04-10-0606464");
  assert.deepEqual(zaluze?.scope, { type: "unknown" });
  // Bałaje on 10 Apr is named on its own: all of it.
  const later = items.find((d) => d.uid === "zuk-26028-2024-04-10-0605878");
  assert.deepEqual(later?.scope, { type: "whole" });
});

test("real 39699: '(przysiółek Dąbrowa)' is Basznia Górna's Dąbrowa", () => {
  const [only, ...rest] = cuts(post(39699));
  assert.equal(rest.length, 0);
  assert.deepEqual(only.place, { localityId: "0605967", streetId: null });
});

test("a date or time the text does not have makes a Notice", () => {
  const ai = reading(39863);
  ai.items[0] = { ...ai.items[0], date: "2026-10-21" };
  assert.deepEqual(readPost(post(39863), ai, PLACES, CHECKED), {
    status: "notice",
    reason: "item 1: 21.10 not in text",
  });
  const late = reading(39863);
  late.items[0] = { ...late.items[0], end: "17:00" };
  assert.deepEqual(readPost(post(39863), late, PLACES, CHECKED), {
    status: "notice",
    reason: "item 1: 17:00 not in the text",
  });
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
        items: [],
      },
      PLACES,
      CHECKED,
    ),
    { status: "notice", reason: "no items" },
  );
});

test("uid: the same across re-reads", () => {
  const a = cuts(post(39872)).map((d) => d.uid);
  const b = cuts(post(39872)).map((d) => d.uid);
  assert.deepEqual(a, b);
  assert.ok(a.includes("zuk-39872-2026-10-22-0606116-20431"));
});

test("keyword cross-check: water cut notices only", () => {
  const zuk = posts.filter(matchesOutageKeywords).map((p) => p.id);
  assert.equal(zuk.length, posts.length - 1);
  assert.ok(!zuk.includes(39868));
});

const inline = (title: string, text: string): ZukPost => ({
  id: 1,
  date: "2026-08-28T10:00:00",
  modified: "2026-08-28T10:00:00",
  link: "https://www.gminalubaczow.pl/",
  title: { rendered: title },
  content: { rendered: `<p>${text}</p>` },
});

test("keyword cross-check: an outage phrase and its source, in any case ending", () => {
  // Post 38847: "Zakładu" was missed by a match on "Zakład Usług".
  assert.ok(
    matchesOutageKeywords(
      inline(
        "Przerwa w dostawie wody - Młodów i Karolówka (31.08 i 1.09.2026)",
        "Prezes Zakładu Usług Komunalnych Sp. z o.o. w Mokrzycy informuje, że nastąpi przerwa w dostawie wody.",
      ),
    ),
  );
  assert.ok(
    matchesOutageKeywords(
      inline(
        "Awaria sieci wodociągowej – Basznia Dolna",
        "Zakład Usług Komunalnych informuje o awarii. Awaria sieci wodociągowej usuwana jest na bieżąco.",
      ),
    ),
  );
  for (const [title, text] of [
    [
      "Upały – apel o oszczędzanie wody",
      "Wójt Gminy Lubaczów apeluje o rozsądne korzystanie z wody w czasie upałów.",
    ],
    [
      "Zawody wędkarskie",
      "Koło wędkarskie zaprasza nad wodę w Mokrzycy na zawody.",
    ],
    [
      "Wymiana wodomierzy",
      "Zakład Usług Komunalnych informuje, że prowadzi wymianę wodomierzy.",
    ],
  ]) {
    assert.ok(!matchesOutageKeywords(inline(title, text)), title);
  }
});

test("date-change posts", () => {
  const change = posts
    .filter((p) => matchesOutageKeywords(p) && isChangePost(p))
    .map((p) => p.id);
  assert.deepEqual(change.sort(), [23860, 24161, 26028]);
});

test("a Notice's localities: every namesake, not a name inside a longer one", () => {
  assert.deepEqual(mentionedLocalities(post(34394), PLACES), [
    "0605967",
    "0606010",
    "0606168",
  ]);
  const balaje = mentionedLocalities(post(39766), PLACES);
  assert.ok(balaje.includes("0605890"));
  // "Basznia" (a part of Basznia Dolna) is inside "Basznia Dolna".
  assert.ok(!balaje.includes("0605909"));
});

test("title days: in full, a range, none without a year", () => {
  assert.deepEqual(titleDays("Przerwy w dostawie wody: 26-29.10.2026"), [
    "2026-10-26",
    "2026-10-29",
  ]);
  assert.deepEqual(
    titleDays("Przerwa w dostawie wody – Młodów, ul. Floriana (7-8.09.2026)"),
    ["2026-09-07", "2026-09-08"],
  );
  assert.deepEqual(titleDays("(awaria 16.12.2025)"), ["2025-12-16"]);
  assert.deepEqual(titleDays("Budomierz (noc 21/22 grudnia)"), []);
  assert.deepEqual(titleDays("Przerwa w dostawie wody – aktualizacja dat"), []);
});

test("past post: every title day before today, and only then", () => {
  assert.equal(isPastPost(post(39885), "2026-10-29"), false);
  assert.equal(isPastPost(post(39885), "2026-10-30"), true);
  assert.equal(isPastPost(post(39872), "2026-10-22"), false);
  assert.equal(isPastPost(post(39872), "2026-10-23"), true);
  // No day in the title: read it.
  assert.equal(isPastPost(post(26028), "2026-10-25"), false);
  assert.equal(isPastPost(post(35690), "2026-10-25"), false);
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
    items: [
      {
        date: "2026-09-02",
        start: "08:00",
        end: "16:00",
        kind: "planned",
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
  return read.status === "parsed" ? read : { items: [], dropped: [] };
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
  assert.deepEqual(krowica.dropped, []);
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
  assert.deepEqual(mlodow.dropped, []);
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

test("house numbers in the town without a street: dropped", () => {
  const read = readOne("Lubaczów od nr 1 do nr 20", {
    locality: "Lubaczów",
    locality_verbatim: "Lubaczów",
    street: null,
    street_verbatim: null,
    note: "od nr 1 do nr 20",
  });
  const items = read.status === "parsed" ? read.items : [];
  if (read.status === "parsed") assert.equal(read.dropped.length, 1);
  assert.ok(!items.some((d) => d.place.localityId === "0972447"));
});

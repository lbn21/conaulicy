import assert from "node:assert/strict";
import { test } from "node:test";
import { warsawToIso } from "./dates.ts";
import type { Disruption } from "./disruptions.ts";
import { classifyPost, type Doubt, parseZuk, type ZukPost } from "./zuk.ts";
import {
  list,
  PLACES,
  REAL_2026_10_25,
  REAL_CHECKED_AT,
  sentence,
  zukPost,
} from "./zuk-fixture.ts";

const CHECKED = "2026-10-26T15:00:00Z";
// Our ids: SIMC and SIMC-SYM_UL (lib/zuk-fixture.ts PLACES, from TERYT).
const LISIE_JAMY = "0606234";
const POLNA = "0606234-17011";
const OPAKA = "0606317";
const DABKOW = "0606004";
const BALAJE = "0605878";
const WOLKA = "0606441";
const SOBIESKIEGO = "0606116-20431";

const read = (post: ZukPost) => classifyPost(post, PLACES, CHECKED);

function cuts(post: ZukPost): Disruption[] {
  const result = read(post);
  assert.ok("disruptions" in result, `doubted: ${JSON.stringify(result)}`);
  return result.disruptions;
}

function doubt(post: ZukPost): Doubt {
  const result = read(post);
  assert.ok("doubt" in result, "read as a Disruption");
  return result.doubt;
}

/** A plain one-day post for Tuesday 27 Oct 2026, posted the day before. */
const polna = (
  when = "27.10.2026r. (wtorek)",
  title = "27.10.2026",
  hours?: string,
) =>
  zukPost(
    900,
    "2026-10-26T14:00:00",
    `Przerwa w dostawie wody &#8211; ${title}: Lisie Jamy ul. Polna`,
    sentence(when, "Lisie Jamy &#8211; ul. Polna", hours),
  );

// Real posts (25 Oct 2026).

test("real: every ZUK post is read or doubted, other posts skipped", () => {
  const { disruptions, notices } = parseZuk(
    REAL_2026_10_25,
    PLACES,
    REAL_CHECKED_AT,
  );
  assert.deepEqual(notices.map((n) => n.uid).sort(), [
    "zuk-35661",
    "zuk-35690",
    "zuk-38890",
    "zuk-38969",
    "zuk-39865",
    "zuk-39885",
  ]);
  assert.deepEqual(
    [...new Set(disruptions.map((d) => d.uid.split("-")[1]))].sort(),
    ["39863", "39872"],
  );
});

test("real: 22.10 single sentence, streets of two villages, a range", () => {
  const posts = JSON.parse(REAL_2026_10_25) as ZukPost[];
  const post = posts.find((p) => p.id === 39872) as ZukPost;
  const found = classifyPost(post, PLACES, REAL_CHECKED_AT);
  assert.ok("disruptions" in found);
  assert.deepEqual(
    found.disruptions.map((d) => [
      d.place.streetId ?? d.place.localityId,
      d.scope.type,
    ]),
    [
      [WOLKA, "whole"],
      [SOBIESKIEGO, "range"],
      ["0606286-23682", "whole"],
      ["0606286-19326", "whole"],
      ["0606286-10009", "whole"],
      ["0606286-24550", "whole"],
    ],
  );
  const [first, sobieskiego] = found.disruptions;
  assert.deepEqual(first, {
    uid: `zuk-39872-2026-10-22-${WOLKA}`,
    kind: "water",
    start: "2026-10-22 08:00:00",
    end: "2026-10-22 16:00:00",
    place: { localityId: WOLKA, streetId: null },
    where:
      "Wólka Krowicka, Karolówka – ul. Sobieskiego od nr 23 do nr 47, Młodów – ul. Warszawska, Rzeczna, Krótka, Wodna",
    scope: { type: "whole" },
    status: "planned",
    revokedNote: null,
    publishedAt: "2026-10-21 13:54:49",
    updatedAt: "2026-10-22 22:03:20",
    version: Date.parse("2026-10-22T20:03:20Z") / 1000,
    source: {
      name: "Zakład Usług Komunalnych w Mokrzycy",
      url: "https://www.gminalubaczow.pl/2026/10/21/przerwa-w-dostawie-wody-22-10-2026-wolka-krowicka-karolowka-ul-sobieskiego-od-nr-23-do-nr-47-mlodow-ul-warszawska-rzeczna-krotka-wodna/",
      checkedAt: REAL_CHECKED_AT,
    },
  });
  // "ul. Sobieskiego" is TERYT's "Jana III Sobieskiego".
  assert.deepEqual(sobieskiego.scope, {
    type: "range",
    from: "23",
    to: "47",
    parity: null,
  });
});

test("real: why each doubted post is a Notice", () => {
  const posts = JSON.parse(REAL_2026_10_25) as ZukPost[];
  const reason = (id: number) => {
    const r = classifyPost(
      posts.find((p) => p.id === id) as ZukPost,
      PLACES,
      REAL_CHECKED_AT,
    );
    return "doubt" in r ? r.doubt : "read";
  };
  // 26-29.10: "ul. Przemysłowa (Lubaczów)", "Załuże–Podłęże".
  assert.equal(reason(39885), "place");
  // "Młodów, ul. Pilipy", "Młodów, ul. Floriana": the village, or its street?
  assert.equal(reason(39865), "place");
  assert.equal(reason(38969), "place");
  // "ul. Sobieskiego numery: od 1 do 15 i od 16 do 54".
  assert.equal(reason(38890), "place");
  // "(noc 21/22 grudnia)": no date in the title.
  assert.equal(reason(35690), "title-date");
  // A failure report: "nastąpiła".
  assert.equal(reason(35661), "tense");
});

test("real: a Notice links the post, names every place it may concern, no date", () => {
  const { notices } = parseZuk(REAL_2026_10_25, PLACES, REAL_CHECKED_AT);
  const notice = notices.find((n) => n.uid === "zuk-39885");
  assert.deepEqual(notice, {
    uid: "zuk-39885",
    kind: "water",
    title: "Przerwy w dostawie wody: 26-29.10.2026",
    localityIds: [
      "0605878", // Bałaje
      "0605890", // Basznia Dolna
      "0605950", // Basznia Górna
      "0606004", // Dąbków
      "0606234", // Lisie Jamy
      "0606286", // Młodów
      "0606292", // Antoniki
      "0606300", // Pilipy (part of Młodów): a candidate
      "0606317", // Opaka
      "0606346", // Żuki (part of Opaka): a candidate
      "0606352", // Piastowo
      "0606369", // Podlesie
      "0606441", // Wólka Krowicka
      "0606464", // Załuże
      "0972447", // Lubaczów
    ],
    publishedAt: "2026-10-23 18:59:43",
    updatedAt: "2026-10-23 18:59:43",
    source: {
      name: "Zakład Usług Komunalnych w Mokrzycy",
      url: "https://www.gminalubaczow.pl/2026/10/23/przerwy-w-dostawie-wody-26-29-10-2026/",
      checkedAt: REAL_CHECKED_AT,
    },
  });
});

// Formats that pass every guard.

test("format: one sentence, a street of a village", () => {
  const [cut] = cuts(polna());
  assert.equal(cut.uid, `zuk-900-2026-10-27-${POLNA}`);
  assert.deepEqual(cut.place, { localityId: LISIE_JAMY, streetId: POLNA });
  assert.equal(cut.start, "2026-10-27 08:00:00");
  assert.equal(cut.end, "2026-10-27 16:00:00");
  assert.equal(cut.where, "Lisie Jamy – ul. Polna");
});

test("format: other ways ZUK joins a village and its street", () => {
  for (const where of [
    "Lisie Jamy ul. Polna",
    "Lisie Jamy: ul. Polna",
    "Lisie Jamy ulica Polna",
    "Lisie Jamy ulice: Polna",
  ]) {
    const post = zukPost(
      901,
      "2026-10-26T14:00:00",
      "Przerwa w dostawie wody &#8211; 27.10.2026",
      sentence("27.10.2026r. (wtorek)", where),
    );
    assert.deepEqual(
      cuts(post).map((c) => c.place.streetId),
      [POLNA],
      where,
    );
  }
});

test("format: multi-date, two days in one sentence", () => {
  const post = zukPost(
    902,
    "2026-10-23T14:00:00",
    "Przerwa w dostawie wody &#8211; Lisie Jamy (26-27.10.2026)",
    sentence(
      "26.10.2026r.(poniedziałek)</strong> <strong>i 27.10.2026r.(wtorek)",
      "Lisie Jamy",
    ),
  );
  assert.deepEqual(
    cuts(post).map((c) => [c.uid, c.start, c.end]),
    [
      [
        `zuk-902-2026-10-26-${LISIE_JAMY}`,
        "2026-10-26 08:00:00",
        "2026-10-26 16:00:00",
      ],
      [
        `zuk-902-2026-10-27-${LISIE_JAMY}`,
        "2026-10-27 08:00:00",
        "2026-10-27 16:00:00",
      ],
    ],
  );
});

test("format: multi-date, a range with one list item per day", () => {
  const post = zukPost(
    903,
    "2026-10-23T18:59:43",
    "Przerwy w dostawie wody: 26-27.10.2026",
    list(
      "w dniach <strong>od 26.10.2026r. (poniedziałek) do 27.10.2026r. (wtorek) </strong>",
      [
        "<u>-26.10.2026 (poniedziałek): </u>Lisie Jamy w godz. od 8:00 do 16:00",
        "<u>-27.10.2026 (wtorek): </u>Dąbków, Opaka od numeru 104 do 110 &#8211; w godz. od 9:00 do 15:00",
      ],
    ),
  );
  assert.deepEqual(
    cuts(post).map((c) => [c.place.localityId, c.start, c.end, c.scope]),
    [
      [
        LISIE_JAMY,
        "2026-10-26 08:00:00",
        "2026-10-26 16:00:00",
        { type: "whole" },
      ],
      [DABKOW, "2026-10-27 09:00:00", "2026-10-27 15:00:00", { type: "whole" }],
      [
        OPAKA,
        "2026-10-27 09:00:00",
        "2026-10-27 15:00:00",
        { type: "range", from: "104", to: "110", parity: null },
      ],
    ],
  );
});

test("format: one day, a list with a window per item", () => {
  const post = zukPost(
    904,
    "2026-10-26T11:40:25",
    "Przerwa w dostawie wody &#8211; 27.10.2026: Dąbków, Lisie Jamy",
    list("w dniu: <strong> 27.10.2026r. (wtorek) </strong>", [
      " Dąbków, Lubaczów ul. Żuki w godz. &#8211; od 8:00 do 12:00 ",
      "Lisie Jamy &#8211; od 8:00 do 16:00 ",
    ]),
  );
  assert.deepEqual(
    cuts(post).map((c) => [
      c.place.streetId ?? c.place.localityId,
      c.end,
      c.where,
    ]),
    [
      [DABKOW, "2026-10-27 12:00:00", "Dąbków, Lubaczów ul. Żuki"],
      // ul. Żuki of the town, not Dąbków's ul. Żuki nor the village part Żuki.
      ["0972447-26555", "2026-10-27 12:00:00", "Dąbków, Lubaczów ul. Żuki"],
      [LISIE_JAMY, "2026-10-27 16:00:00", "Lisie Jamy"],
    ],
  );
});

test("format: older wording, 'w godzinach 9.00 – 15.00'", () => {
  const [cut] = cuts(
    polna(undefined, undefined, "w godzinach 9.00 &#8211; 15.00"),
  );
  assert.equal(cut.start, "2026-10-27 09:00:00");
  assert.equal(cut.end, "2026-10-27 15:00:00");
});

test("scope: unknown when ZUK names only part of a village", () => {
  const post = zukPost(
    905,
    "2026-10-26T14:00:00",
    "Przerwa w dostawie wody &#8211; 27.10.2026",
    sentence("27.10.2026r. (wtorek)", "część miejscowości Bałaje"),
  );
  assert.deepEqual(
    cuts(post).map((c) => [c.place.localityId, c.scope]),
    [[BALAJE, { type: "unknown" }]],
  );
});

test("scope: one house number", () => {
  const post = zukPost(
    906,
    "2026-10-26T14:00:00",
    "Przerwa w dostawie wody &#8211; 27.10.2026",
    sentence("27.10.2026r. (wtorek)", "Opaka nr 12a"),
  );
  assert.deepEqual(cuts(post)[0].scope, { type: "numbers", numbers: ["12a"] });
});

// Revoked notices.

test("revoked: an edited post saying the cut is called off", () => {
  const post = zukPost(
    907,
    "2026-10-26T14:00:00",
    "Przerwa w dostawie wody &#8211; 27.10.2026: Lisie Jamy ul. Polna",
    `<p><strong>Przerwa w dostawie wody w dniu 27.10.2026r. (wtorek) została odwołana.</strong></p>${sentence("27.10.2026r. (wtorek)", "Lisie Jamy &#8211; ul. Polna")}`,
    "2026-10-26T19:00:00",
  );
  const [cut] = cuts(post);
  assert.equal(cut.status, "revoked");
  assert.equal(
    cut.revokedNote,
    "Przerwa w dostawie wody w dniu 27.10.2026r. (wtorek) została odwołana.",
  );
  assert.equal(cut.uid, cuts(polna())[0].uid.replace("900", "907"));
  assert.equal(cut.start, "2026-10-27 08:00:00");
});

test("revoked: a short call-off without the hours is a Notice", () => {
  const post = zukPost(
    908,
    "2026-10-26T19:00:00",
    "Odwołana przerwa w dostawie wody &#8211; 27.10.2026",
    "<p>Zakład Usług Komunalnych Sp. z o. o. w Mokrzycy informuje, że zapowiedziana na 27.10.2026r. (wtorek) przerwa w dostawie wody w miejscowości Lisie Jamy została odwołana.</p>",
  );
  assert.equal(doubt(post), "tense");
});

// Guards: each failure makes a Notice.

test("guard title-date: the title's date differs from the body's", () => {
  assert.equal(doubt(polna(undefined, "28.10.2026")), "title-date");
});

test("guard title-date: no date in the title", () => {
  const post = zukPost(
    909,
    "2026-10-26T14:00:00",
    "Przerwa w dostawie wody dla mieszkańców miejscowości Lisie Jamy",
    sentence("27.10.2026r. (wtorek)", "Lisie Jamy"),
  );
  assert.equal(doubt(post), "title-date");
});

test("guard title-date: a title range wider than the body's days", () => {
  assert.equal(doubt(polna(undefined, "27-28.10.2026")), "title-date");
});

test("guard weekday: the weekday does not match the date", () => {
  assert.equal(doubt(polna("27.10.2026r. (środa)")), "weekday");
});

test("guard weekday: the weekday is missing", () => {
  assert.equal(doubt(polna("27.10.2026r.")), "weekday");
});

test("guard window: the date is more than 14 days after the post", () => {
  const post = { ...polna(), date: "2026-10-12T14:00:00" };
  assert.equal(doubt(post), "window");
});

test("guard window: the date is before the post", () => {
  const post = { ...polna(), date: "2026-10-28T09:00:00" };
  assert.equal(doubt(post), "window");
});

test("guard time: the end before the start", () => {
  assert.equal(
    doubt(polna(undefined, undefined, "w godz. od 16:00 do godz. 8:00")),
    "time",
  );
});

test("guard time: outside 05:00-22:00", () => {
  assert.equal(
    doubt(polna(undefined, undefined, "w godz. od 4:00 do godz. 8:00")),
    "time",
  );
});

test("guard time: two windows in one sentence", () => {
  assert.equal(
    doubt(
      polna(
        undefined,
        undefined,
        "w godz. od 8:00 do 10:00 oraz od 12:00 do 16:00",
      ),
    ),
    "time",
  );
});

test("guard time: no window", () => {
  assert.equal(doubt(polna(undefined, undefined, "")), "time");
});

test("guard place: a name TERYT does not have", () => {
  const post = zukPost(
    910,
    "2026-10-26T14:00:00",
    "Przerwa w dostawie wody &#8211; 27.10.2026",
    sentence(
      "27.10.2026r. (wtorek)",
      "Załuże&#8211;Podłęże od numeru 44 do numeru 92",
    ),
  );
  assert.equal(doubt(post), "place");
});

for (const [name, where] of [
  ["two localities named Dąbrowa", "Dąbrowa"],
  ["a bare village, then a street: 'Młodów, ul. Pilipy'", "Młodów, ul. Pilipy"],
  [
    "a street that is also a village part: Smolińce",
    "Lisie Jamy ul. Lwowska, Smolińce",
  ],
  [
    "a note in brackets",
    "Basznia Górna od numeru 121 do numeru 144 (przysiółek Dąbrowa)",
  ],
  ["a reversed range", "Opaka od nr 110 do nr 104"],
  [
    "numbers we cannot read",
    "Karolówka ul. Sobieskiego numery: od 1 do 15 i od 16 do 54",
  ],
  ["a street with no village before it", "ul. Polna"],
  ["the same place twice in a day", "Lisie Jamy, Lisie Jamy"],
  ["a street of another village", "Dąbków ul. Polna"],
]) {
  test(`guard place: ${name}`, () => {
    const post = zukPost(
      911,
      "2026-10-26T14:00:00",
      "Przerwa w dostawie wody &#8211; 27.10.2026",
      sentence("27.10.2026r. (wtorek)", where),
    );
    assert.equal(doubt(post), "place");
  });
}

test("guard structure: a date that does not exist", () => {
  const post = zukPost(
    912,
    "2026-09-28T14:00:00",
    "Przerwa w dostawie wody &#8211; 31.09.2026",
    sentence("31.09.2026r. (czwartek)", "Lisie Jamy"),
  );
  assert.equal(doubt(post), "structure");
});

test("guard structure: a night cut across two days", () => {
  const post = zukPost(
    913,
    "2026-10-23T14:00:00",
    "Przerwa w dostawie wody &#8211; Lisie Jamy (26-27.10.2026)",
    "<p>Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje, że w nocy z 26.10.2026r.(poniedziałek) na 27.10.2026r.(wtorek) w godz. od 22:00 do godz. 5:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości Lisie Jamy.</p>",
  );
  assert.equal(doubt(post), "structure");
});

test("guard structure: a day range with no list", () => {
  const post = zukPost(
    914,
    "2026-10-23T14:00:00",
    "Przerwa w dostawie wody &#8211; 26-27.10.2026",
    sentence(
      "</strong>dniach <strong>od 26.10.2026r. (poniedziałek) do 27.10.2026r. (wtorek)",
      "Lisie Jamy",
    ).replace("w dniu", "w"),
  );
  assert.equal(doubt(post), "structure");
});

test("guard tense: a failure report ('nastąpiła')", () => {
  const post = zukPost(
    915,
    "2026-10-27T16:00:00",
    "Przerwa w dostawie wody: Lisie Jamy (awaria 27.10.2026)",
    "<p>Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje, że w związku z awarią sieci wodociągowej w dniu 27.10.2026 (wtorek) w miejscowości Lisie Jamy nastąpiła czasowa przerwa w dostawie wody. Przewidywane wznowienie dostawy do godz. 19.00.</p>",
  );
  assert.equal(doubt(post), "tense");
});

test("guard change: a date update", () => {
  const post = zukPost(
    916,
    "2026-10-26T09:00:00",
    "Przerwa w dostawie wody &#8211; ze zmianą terminu",
    sentence("28.10.2026r. (środa)", "Lisie Jamy &#8211; ul. Polna"),
  );
  assert.equal(doubt(post), "change");
});

// Across posts.

test("across posts: a change notice turns that day's cuts into Notices", () => {
  const change = zukPost(
    917,
    "2026-10-26T18:00:00",
    "Przerwa w dostawie wody &#8211; aktualizacja dat",
    "<p>Zakład Usług Komunalnych Sp. z o.o. w Mokrzycy informuje, że przerwa w dostawie wody zapowiedziana na 27.10.2026r. zostaje przesunięta na 29.10.2026r.</p>",
  );
  const result = parseZuk(JSON.stringify([polna(), change]), PLACES, CHECKED);
  assert.deepEqual(result.disruptions, []);
  assert.deepEqual(
    result.notices.map((n) => n.uid),
    ["zuk-900", "zuk-917"],
  );
});

test("across posts: two posts give one place and day different hours", () => {
  const other = {
    ...polna(undefined, undefined, "w godz. od 9:00 do godz. 13:00"),
    id: 918,
  };
  const result = parseZuk(JSON.stringify([polna(), other]), PLACES, CHECKED);
  assert.deepEqual(result.disruptions, []);
  assert.deepEqual(
    result.notices.map((n) => n.uid),
    ["zuk-900", "zuk-918"],
  );
});

test("across posts: other posts are skipped, not doubted", () => {
  const other = zukPost(
    919,
    "2026-10-26T09:00:00",
    "Fast fashion, a środowisko",
    "<p>Moda.</p>",
  );
  const result = parseZuk(JSON.stringify([other, polna()]), PLACES, CHECKED);
  assert.equal(result.notices.length, 0);
  assert.equal(result.disruptions.length, 1);
});

test("a body that is not a list of posts throws", () => {
  assert.throws(() => parseZuk('{"code":"rest_no_route"}', PLACES, CHECKED));
});

// Warsaw time and the DST end (25 Oct 2026, 03:00 CEST → 02:00 CET).

test("Warsaw time: a cut on the DST end day keeps ZUK's wall clock", () => {
  const post = zukPost(
    920,
    "2026-10-24T14:00:00",
    "Przerwa w dostawie wody &#8211; 25.10.2026: Lisie Jamy",
    sentence("25.10.2026r. (niedziela)", "Lisie Jamy"),
  );
  const [cut] = cuts(post);
  assert.equal(cut.start, "2026-10-25 08:00:00");
  assert.equal(cut.end, "2026-10-25 16:00:00");
  // The wall clock is CET that day, the post's CEST: 8 hours apart, as written.
  assert.equal(warsawToIso(cut.start), "2026-10-25T08:00:00+01:00");
  assert.equal(warsawToIso(cut.publishedAt), "2026-10-24T14:00:00+02:00");
  assert.equal(
    Date.parse(warsawToIso(cut.end) ?? "") -
      Date.parse(warsawToIso(cut.start) ?? ""),
    8 * 3_600_000,
  );
});

test("Warsaw time: a cut the day after DST ends, posted before it", () => {
  const [cut] = cuts(
    zukPost(
      921,
      "2026-10-24T23:30:00",
      "Przerwa w dostawie wody &#8211; 26.10.2026: Lisie Jamy",
      sentence("26.10.2026r. (poniedziałek)", "Lisie Jamy"),
    ),
  );
  assert.equal(warsawToIso(cut.start), "2026-10-26T08:00:00+01:00");
  assert.equal(cut.version, Date.parse("2026-10-24T21:30:00Z") / 1000);
});

// Stable uid.

test("uid: the same across re-reads, and after ZUK edits the post", () => {
  const first = parseZuk(REAL_2026_10_25, PLACES, REAL_CHECKED_AT).disruptions;
  const again = parseZuk(
    REAL_2026_10_25,
    PLACES,
    "2026-10-25T07:03:00Z",
  ).disruptions;
  assert.deepEqual(
    again.map((d) => d.uid),
    first.map((d) => d.uid),
  );
  assert.ok(new Set(first.map((d) => d.uid)).size === first.length);

  // An edit (new hours, a later "modified") keeps the uid, raises the version.
  const before = cuts(polna())[0];
  const edited = cuts({
    ...polna(undefined, undefined, "w godz. od 9:00 do godz. 14:00"),
    modified: "2026-10-26T20:00:00",
  })[0];
  assert.equal(edited.uid, before.uid);
  assert.equal(edited.start, "2026-10-27 09:00:00");
  assert.ok(edited.version > before.version);
});

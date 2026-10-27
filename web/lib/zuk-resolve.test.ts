// The place gate: one test per check it keeps (the day, a listed name, the
// post's own words, the town whole only in its words), and the snapshot
// it reads.

import assert from "node:assert/strict";
import { test } from "node:test";
import { DISTRICTS } from "./districts-seed.ts";
import { PLACES } from "./zuk-fixture.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";
import {
  dayCheck,
  type GateItem,
  gateItem,
  gateText,
  Listed,
} from "./zuk-resolve.ts";

const ALL = new Listed({ ...ZUK_PLACES, districts: DISTRICTS });
const TOWN = "0972447";

/** One item through the gate on a post of `text`. */
function gate(
  text: string,
  over: Partial<GateItem>,
  {
    listed = ALL,
    implied = null as string | null,
    published = "2026-10-11",
  } = {},
) {
  return gateItem(
    listed,
    gateText("Przerwa w dostawie wody", text),
    {
      date: "2026-10-12",
      date_verbatim: "12.10.2026",
      locality: null,
      locality_verbatim: null,
      street: null,
      street_verbatim: null,
      note: null,
      whole_town: false,
      whole_town_verbatim: null,
      ...over,
    },
    implied,
    published,
  );
}

const reason = (r: ReturnType<typeof gate>) => (r.kept ? null : r.reason);

test("day: date_verbatim, the post's words for it, in the post", () => {
  const day = (date: string, words: string | null, text: string) =>
    dayCheck(
      date,
      words,
      gateText("Przerwa w dostawie wody", text),
      "2026-10-11",
    );
  assert.equal(day("2026-10-12", "12.10", "W dniu 12.10 brak wody."), null);
  assert.equal(
    day("2026-06-08", "8 czerwca", "W dniu 8 czerwca brak wody."),
    null,
  );
  assert.equal(
    day("2026-10-12", "12.10.2026r.", "W dniu 12.10.2026r. brak wody."),
    null,
  );
  assert.equal(
    day("2026-06-08", "8  CZERWCA 2026", "w dniu 8 czerwca 2026 r."),
    null,
    "case and spaces aside",
  );
  // A day inside a written range: the range's words.
  assert.equal(
    day("2026-10-27", "26-29.10.2026", "W dniach 26–29.10.2026 brak wody."),
    null,
  );
  assert.equal(
    day("2026-10-12", "13.10.2026", "W dniu 12.10.2026 brak wody."),
    "date_verbatim not in post",
  );
  assert.equal(
    day("2026-10-12", "", "W dniu 12.10 brak wody."),
    "date_verbatim not in post",
  );
  // Which day the words mean is the model's: no day-number check.
  assert.equal(day("2026-10-13", "12.10", "W dniu 12.10 brak wody."), null);
});

test("day: none written only on the publish day; a real date", () => {
  const text = gateText("Awaria", "Awaria sieci, brak wody: Opaka.");
  assert.equal(dayCheck("2026-10-12", null, text, "2026-10-12"), null);
  assert.equal(
    dayCheck("2026-10-13", null, text, "2026-10-12"),
    "no day written, not the publish day",
  );
  assert.equal(
    dayCheck("2026-02-30", "30.02", "30.02", "2026-02-28"),
    "bad date",
  );
  assert.equal(dayCheck("30.10.2026", null, text, "30.10.2026"), "bad date");
});

test("locality: a listed name, exactly; a part as 'Name (Village)'", () => {
  const text = "W dniu 12.10.2026 brak wody: Opaka, Dąbrowa.";
  const ok = gate(text, { locality: "Opaka", locality_verbatim: "Opaka" });
  assert.equal(ok.kept && ok.locality.id, "0606317");
  for (const locality of ["opaka", "Opaką", "Opaka ", "Nowe Sioło", null])
    assert.equal(
      reason(gate(text, { locality, locality_verbatim: "Opaka" })),
      "locality not listed",
      String(locality),
    );
  const part = gate(text, {
    locality: "Dąbrowa (Basznia Górna)",
    locality_verbatim: "Dąbrowa",
  });
  assert.equal(part.kept && part.locality.id, "0605967");
  // A bare name is the village of that name, never a part.
  const village = gate(text, {
    locality: "Dąbrowa",
    locality_verbatim: "Dąbrowa",
  });
  assert.equal(village.kept && village.locality.id, "0606010");
});

test("locality: only the source's area is listed", () => {
  const town = new Listed(ZUK_PLACES, new Set([TOWN, "0972453"]));
  const text = "W dniu 12.10.2026 brak wody: Opaka, Mazury.";
  assert.equal(
    reason(
      gate(
        text,
        { locality: "Opaka", locality_verbatim: "Opaka" },
        {
          listed: town,
        },
      ),
    ),
    "locality not listed",
  );
  const part = gate(
    text,
    { locality: "Mazury (Lubaczów)", locality_verbatim: "Mazury" },
    { listed: town },
  );
  assert.equal(part.kept && part.locality.id, "0972453");
});

test("locality_verbatim: in the post; none only for the implied locality", () => {
  const text = "W dniu 12.10.2026 brak wody w Opace, ul. Polna.";
  const opaka = { locality: "Opaka", street: null };
  assert.equal(
    reason(gate(text, { ...opaka, locality_verbatim: "Opace" })),
    null,
  );
  assert.equal(
    reason(gate(text, { ...opaka, locality_verbatim: "Opaka" })),
    "not in post",
  );
  assert.equal(
    reason(gate(text, { ...opaka, locality_verbatim: null })),
    "not in post",
  );
  const street = {
    locality: "Lubaczów",
    locality_verbatim: null,
    street: "Polna",
    street_verbatim: "ul. Polna",
  };
  assert.equal(reason(gate(text, street)), "not in post");
  assert.equal(reason(gate(text, street, { implied: TOWN })), null);
});

test("street: a listed street of that locality, exactly, in the post's words", () => {
  const text = "W dniu 12.10.2026 brak wody: Lubaczów ul. Żuki, Dąbków.";
  const town = { locality: "Lubaczów", locality_verbatim: "Lubaczów" };
  const zuki = gate(text, {
    ...town,
    street: "Żuki",
    street_verbatim: "ul. Żuki",
  });
  assert.equal(zuki.kept && zuki.street?.id, "0972447-26555");
  const dabkow = gate(text, {
    locality: "Dąbków",
    locality_verbatim: "Dąbków",
    street: "Żuki",
    street_verbatim: "ul. Żuki",
  });
  assert.equal(dabkow.kept && dabkow.street?.id, "0606004-26555");
  // No end of a longer name, no other spelling, no other locality's.
  for (const street of ["Sobieskiego", "żuki", "Floriana"])
    assert.equal(
      reason(gate(text, { ...town, street, street_verbatim: "ul. Żuki" })),
      "street not listed",
      street,
    );
  assert.equal(
    reason(
      gate(text, { ...town, street: "Żuki", street_verbatim: "ul. Polna" }),
    ),
    "not in post",
  );
  assert.equal(
    reason(gate(text, { ...town, street: "Żuki", street_verbatim: null })),
    "not in post",
  );
  // Words of a street not on the list: rejected, its locality known.
  const unlisted = gate(text, { ...town, street_verbatim: "ul. Żuki" });
  assert.equal(reason(unlisted), "street not listed");
  assert.equal(!unlisted.kept && unlisted.locality?.id, TOWN);
});

test("district: listed by its name for its town", () => {
  const text = "W dniu 12.10.2026 brak wody na osiedlu Mazury.";
  const item = {
    locality: "Lubaczów",
    locality_verbatim: null,
    street_verbatim: "osiedlu Mazury",
  };
  const ok = gate(
    text,
    { ...item, street: "Osiedle Mazury" },
    { implied: TOWN },
  );
  assert.equal(ok.kept && ok.district?.id, "mazury");
  assert.equal(ok.kept && ok.street, null);
  for (const street of ["os. Mazury", "Mazury VI"])
    assert.equal(
      reason(gate(text, { ...item, street }, { implied: TOWN })),
      "street not listed",
      street,
    );
});

test("the town whole: only with whole_town, its words in the post", () => {
  const text = "W dniu 12.10.2026 brak wody na terenie całego miasta.";
  const town = { locality: "Lubaczów", locality_verbatim: null };
  assert.equal(
    reason(gate(text, town, { implied: TOWN })),
    "street not listed",
  );
  const whole = {
    ...town,
    whole_town: true,
    whole_town_verbatim: "na terenie całego miasta",
  };
  assert.equal(reason(gate(text, whole, { implied: TOWN })), null);
  assert.equal(
    reason(
      gate(
        text,
        { ...whole, whole_town_verbatim: "w całym mieście" },
        { implied: TOWN },
      ),
    ),
    "not in post",
  );
  assert.equal(
    reason(
      gate(text, { ...whole, whole_town_verbatim: null }, { implied: TOWN }),
    ),
    "not in post",
  );
});

test("note: one literal piece of the post", () => {
  const text =
    "W dniu 12.10.2026 brak wody: Opaka od numeru 5 do numeru 9, 12.";
  const opaka = { locality: "Opaka", locality_verbatim: "Opaka" };
  assert.equal(
    reason(gate(text, { ...opaka, note: "od  numeru 5 do NUMERU 9" })),
    null,
  );
  assert.equal(
    reason(gate(text, { ...opaka, note: "od numeru 5 do numeru 12" })),
    "not in post",
  );
});

test("day: words not in post are 'date', first", () => {
  const opaka = { locality: "Nowe Sioło", locality_verbatim: "Opaka" };
  const text = "W dniu 12.10.2026 brak wody: Opaka.";
  assert.equal(
    reason(gate(text, { ...opaka, date_verbatim: "13.10.2026" })),
    "date",
  );
  assert.equal(reason(gate(text, opaka)), "locality not listed");
  // No words: kept only on the publish day.
  const ok = { locality: "Opaka", locality_verbatim: "Opaka" };
  const none = { ...ok, date_verbatim: null };
  assert.equal(reason(gate(text, none, { published: "2026-10-12" })), null);
  assert.equal(reason(gate(text, none)), "date");
});

test("listed names: every locality, street and district of the list", () => {
  assert.ok(ALL.has("Dąbrowa (Basznia Górna)"));
  assert.ok(ALL.has("Jana III Sobieskiego"));
  assert.ok(ALL.has("Osiedle Mazury"));
  assert.ok(!ALL.has("Dąbrowa (Lubaczów)"));
  assert.ok(!ALL.has("Sobieskiego"));
  const town = new Listed(ZUK_PLACES, new Set([TOWN]));
  assert.ok(!town.has("Opaka"));
  assert.ok(!town.has("Pilipy"), "a village's street");
});

test("all our places: the full TERYT list, consistent, the fixture inside it", () => {
  assert.equal(ZUK_PLACES.localities.length, 69);
  assert.equal(ZUK_PLACES.streets.length, 276);
  const ids = new Set(ZUK_PLACES.localities.map((l) => l.id));
  assert.equal(ids.size, 69);
  assert.equal(new Set(ZUK_PLACES.streets.map((s) => s.id)).size, 276);
  for (const l of ZUK_PLACES.localities)
    if (l.parentId) assert.ok(ids.has(l.parentId), l.id);
  for (const s of ZUK_PLACES.streets) assert.ok(ids.has(s.localityId), s.id);
  const key = (x: object) => JSON.stringify(x);
  const all = new Set(
    [...ZUK_PLACES.localities, ...ZUK_PLACES.streets].map(key),
  );
  for (const x of [...PLACES.localities, ...PLACES.streets])
    assert.ok(all.has(key(x)), key(x));
});

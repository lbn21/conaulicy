// The place gate: one test per check it keeps (the day, a listed name, the
// post's own words, the town whole only in its words), and the snapshot
// it reads.

import assert from "node:assert/strict";
import { test } from "node:test";
import { DISTRICTS } from "./districts-seed.ts";
import { PLACES } from "./zuk-fixture.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";
import {
  type GateItem,
  gateItem,
  gateText,
  guardDate,
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
    published = null as string | null,
  } = {},
) {
  return gateItem(
    listed,
    gateText("Przerwa w dostawie wody", text),
    {
      date: "2026-10-12",
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

test("day: D.M, D <month>, inside a-b.M, a do b.M, a.M - b.M", () => {
  const t = (s: string) => s.toLowerCase();
  assert.equal(guardDate("2026-10-12", t("w dniu 12.10.2026r.")), null);
  assert.equal(guardDate("2026-10-02", t("w dniu 02.10")), null);
  assert.equal(guardDate("2026-06-08", t("w dniu 8 czerwca 2026 r.")), null);
  assert.equal(guardDate("2026-10-27", t("w dniach 26-29.10.2026")), null);
  assert.equal(guardDate("2026-10-27", t("od 26 do 29.10.2026")), null);
  assert.equal(guardDate("2026-10-27", t("od 26.10 - 29.10.2026")), null);
  assert.equal(
    guardDate("2026-10-13", t("w dniu 12.10.2026")),
    "13.10 not in text",
  );
  // Both ends full dates (post 23860): accepted since task 114b.
  assert.equal(guardDate("2023-11-07", t("od 06.11.2023 do 10.11.2023")), null);
});

test("day: a range of two full dates, 'do' or a dash, optional 'od'", () => {
  for (const text of [
    "od 06.11.2023 do 10.11.2023",
    "06.11.2023 do 10.11.2023",
    "6.11.2023-10.11.2023",
    "od 6.11.2023 - 10.11.2023r.",
    "od 28.10.2023 do 10.11.2023",
  ])
    assert.equal(guardDate("2023-11-07", text), null, text);
  // Both ends are in the range.
  assert.equal(guardDate("2023-11-06", "od 06.11.2023 do 10.11.2023"), null);
  assert.equal(guardDate("2023-11-10", "od 06.11.2023 do 10.11.2023"), null);
  // A day outside it, a reversed range, another year.
  assert.equal(
    guardDate("2023-11-11", "od 06.11.2023 do 10.11.2023"),
    "11.11 not in text",
  );
  assert.equal(
    guardDate("2023-11-07", "od 10.11.2023 do 06.11.2023"),
    "7.11 not in text",
  );
  assert.equal(
    guardDate("2024-11-07", "od 06.11.2023 do 10.11.2023"),
    "7.11 not in text",
  );
  // An en dash with spaces, through the gate (the post's dashes become "-").
  const r = gate("Brak wody od 06.11.2023 – 10.11.2023 w miejscowości Opaka.", {
    date: "2023-11-07",
    locality: "Opaka",
    locality_verbatim: "Opaka",
  });
  assert.equal(r.kept, true, JSON.stringify(r));
});

test("day: a year written with the day must be the item's", () => {
  assert.equal(
    guardDate("2026-10-12", "w dniu 12.10.2025r."),
    "12.10 not in text",
  );
  assert.equal(guardDate("2026-10-12", "w dniu 12.10.2026r."), null);
  // No year written: as before.
  assert.equal(guardDate("2026-10-12", "w dniu 12.10"), null);
  assert.equal(
    guardDate("2026-06-08", "w dniu 8 czerwca 2025 r."),
    "8.6 not in text",
  );
  assert.equal(guardDate("2026-06-08", "w dniu 8 czerwca"), null);
  assert.equal(
    guardDate("2026-10-27", "w dniach 26-29.10.2025"),
    "27.10 not in text",
  );
  assert.equal(
    guardDate("2026-10-27", "od 26.10 - 29.10.2025"),
    "27.10 not in text",
  );
  // The right year elsewhere still counts.
  assert.equal(guardDate("2026-10-12", "12.10.2025 i 12.10.2026"), null);
});

test("day: a weekday in brackets must agree; no such day", () => {
  assert.equal(
    guardDate("2026-10-12", "w dniu 12.10.2026 (wtorek)"),
    "weekday mismatch 2026-10-12",
  );
  assert.equal(
    guardDate("2026-10-12", "w dniu 12.10.2026r. (poniedziałek)"),
    null,
  );
  assert.equal(guardDate("2026-10-12", "12.10.2026r.(poniedziałek)"), null);
  assert.equal(guardDate("2026-02-30", "30.02.2026"), "bad date");
  assert.equal(guardDate("30.10.2026", "30.10.2026"), "bad date");
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

test("day: not written, or a weekday that disagrees, is 'date' first", () => {
  const opaka = { locality: "Nowe Sioło", locality_verbatim: "Opaka" };
  assert.equal(
    reason(gate("W dniu 13.10.2026 brak wody: Opaka.", opaka)),
    "date",
  );
  assert.equal(
    reason(gate("W dniu 12.10.2026 (wtorek) brak wody: Opaka.", opaka)),
    "date",
  );
});

test("day: a post that writes no day speaks of its publish day", () => {
  const opaka = { locality: "Opaka", locality_verbatim: "Opaka" };
  const text = "Awaria sieci, brak wody: Opaka.";
  assert.equal(reason(gate(text, opaka, { published: "2026-10-12" })), null);
  // Any other unwritten day is still dropped.
  assert.equal(reason(gate(text, opaka, { published: "2026-10-11" })), "date");
  assert.equal(
    reason(
      gate(text, { ...opaka, date: "2026-10-13" }, { published: "2026-10-12" }),
    ),
    "date",
  );
  // A day written with a weekday that disagrees is still dropped.
  assert.equal(
    reason(
      gate("W dniu 12.10.2026 (wtorek) brak wody: Opaka.", opaka, {
        published: "2026-10-12",
      }),
    ),
    "date",
  );
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

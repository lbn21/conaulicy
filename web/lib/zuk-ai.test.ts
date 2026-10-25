import assert from "node:assert/strict";
import { test } from "node:test";
import {
  costUsd,
  parseAiResult,
  readWithAi,
  systemPrompt,
  ZUK_MODEL,
} from "./zuk-ai.ts";
import { PLACES, reading } from "./zuk-fixture.ts";

const SYSTEM = systemPrompt(PLACES);

const INPUT = {
  published: "2026-10-20T11:40:25",
  title: "Przerwa w dostawie wody – 21.10.2026",
  text: "w dniu: 21.10.2026r. (środa) nastąpi przerwa",
};
// xAI's usage for post 39865 (feasibility run, 25 Oct 2026).
const USAGE = {
  prompt_tokens: 2158,
  completion_tokens: 400,
  total_tokens: 3374,
  completion_tokens_details: { reasoning_tokens: 816 },
};

function xai(status: number, content: string) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Response.json(
      {
        model: ZUK_MODEL,
        usage: USAGE,
        choices: [{ message: { content } }],
      },
      { status },
    );
  }) as typeof fetch;
  return { calls, fetcher };
}

test("request: grok-4.7, reasoning low, temperature 0, strict schema", async () => {
  const { calls, fetcher } = xai(200, JSON.stringify(reading(39865)));
  await readWithAi(INPUT, SYSTEM, "test-key", fetcher);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.x.ai/v1/chat/completions");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer test-key");
  const body = JSON.parse(calls[0].init.body as string);
  assert.equal(body.model, "grok-4.7");
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.temperature, 0);
  assert.equal(body.response_format.json_schema.strict, true);
  const item = body.response_format.json_schema.schema.properties.items.items;
  assert.ok(item.required.includes("place_verbatim"));
  assert.ok(item.required.includes("note"));
  assert.ok(!("houses" in item.properties));
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[0].content, SYSTEM);
  assert.match(
    body.messages[1].content,
    /^Publish date: 2026-10-20T11:40:25\nTitle: Przerwa/,
  );
  assert.ok(calls[0].init.signal, "a timeout");
});

test("reply: the reading, tokens and cost (reasoning billed as output)", async () => {
  const { fetcher } = xai(200, JSON.stringify(reading(39865)));
  const read = await readWithAi(INPUT, SYSTEM, "test-key", fetcher);
  assert.deepEqual(read.result, reading(39865));
  assert.deepEqual(read.usage, {
    promptTokens: 2158,
    completionTokens: 400,
    reasoningTokens: 816,
  });
  // 2158 × $2/1M + (400 + 816) × $6/1M.
  assert.equal(read.costUsd.toFixed(6), "0.011612");
  assert.equal(read.model, "grok-4.7");
  assert.ok(read.latencyMs >= 0);
});

test("reply: an HTTP error or a reply off the schema throws", async () => {
  await assert.rejects(
    readWithAi(INPUT, SYSTEM, "k", xai(503, "{}").fetcher),
    /xAI: HTTP 503/,
  );
  await assert.rejects(
    readWithAi(INPUT, SYSTEM, "k", xai(200, "not json").fetcher),
    /not the schema/,
  );
});

test("schema check: every field, with its type", () => {
  const good = reading(39885);
  assert.deepEqual(parseAiResult(JSON.stringify(good)), good);
  const drop = (key: string) => {
    const item: Record<string, unknown> = { ...good.items[0] };
    delete item[key];
    return JSON.stringify({ ...good, items: [item] });
  };
  for (const key of ["date", "place_verbatim", "note", "kind", "locality"])
    assert.equal(parseAiResult(drop(key)), null, key);
  const bad = (over: object) =>
    JSON.stringify({ ...good, items: [{ ...good.items[0], ...over }] });
  assert.equal(parseAiResult(bad({ start: "8:00" })), null);
  assert.equal(parseAiResult(bad({ date: "26.10.2026" })), null);
  assert.equal(parseAiResult(bad({ kind: "revoked" })), null);
  assert.equal(parseAiResult(bad({ place_verbatim: " " })), null);
  assert.equal(parseAiResult('{"items": []}'), null);
});

test("cost: list price", () => {
  assert.equal(
    costUsd({
      promptTokens: 1_000_000,
      completionTokens: 0,
      reasoningTokens: 0,
    }),
    2,
  );
  assert.equal(
    costUsd({
      promptTokens: 0,
      completionTokens: 500_000,
      reasoningTokens: 500_000,
    }),
    6,
  );
});

// The prompt of the A/B test's design B, as sent (25 Oct 2026): 330/330
// place-days on the 24 hand-checked posts, 0 wrong.
const DESIGN_B = `You extract water supply interruptions from Polish notices by ZUK Mokrzyca (gmina Lubaczów).
Rules:
- One item per (day, locality, street). If a locality lists several streets, emit one item per street, repeating the locality.
- A multi-day notice gets one item per day per place. A night span (e.g. 'w nocy z 21.12 na 22.12, 22:00-5:00') is ONE item dated on the first day, start 22:00, end 05:00.
- 'ul.'/'ulica' after a comma belongs to the locality before it: 'Młodów, ul. Pilipy' = locality Młodów, street Pilipy. Never drop a street, house range or 'w części' qualifier.
- place_verbatim is copied exactly from the text, the shortest phrase that contains the locality and this item's street, plus its house numbers, '(przysiółek …)' or other bracket if any: 'Młodów – ul. Warszawska, Rzeczna' for the street Rzeczna, 'ul. Przemysłowa (Lubaczów)', 'w części miejscowości Bałaje'.
- note: a qualifier that narrows the place ('w części miejscowości', 'gospodarstwa zasilane z SUW Mokrzyca'), copied exactly; otherwise null.
- Copy locality and street verbatim from the text (keep Polish diacritics). Never add places, dates or times that are not in the text. If something is unclear, leave it out.
- kind is 'emergency' for a failure (awaria), else 'planned'. For an estimated restore ('przewidywane wznowienie do godz. 19.00') use that time as end.
- Use the publish date only to resolve a year if missing. Do not guess.
- Posts that are not about water interruptions: is_outage_notice=false, items=[].

Context: the places in our database. ZUK Mokrzyca supplies water to the villages of gmina Lubaczów and to some streets of the town Lubaczów.
Town (miasto): Lubaczów
Villages (wieś): Antoniki, Basznia Dolna, Basznia Górna, Bałaje, Borowa Góra, Budomierz, Dąbków, Dąbrowa, Hurcze, Huta Kryształowa, Karolówka, Krowica Hołodowska, Krowica Lasowa, Krowica Sama, Lisie Jamy, Mokrzyca, Młodów, Opaka, Piastowo, Podlesie, Szczutków, Tymce, Wólka Krowicka, Załuże
Village parts (część wsi, przysiółek), each with its village: Basznia (Basznia Dolna), Blusy (Krowica Sama), Boble (Krowica Lasowa), Brzozie (Wólka Krowicka), Cetynia (Krowica Sama), Cetynia Hołodowska (Krowica Hołodowska), Czarne (Załuże), Dąbrowa (Basznia Górna), Flisy (Lisie Jamy), Głodówka (Krowica Hołodowska), Holiki (Dąbrowa), Kamienna (Opaka), Kornagi (Dąbrowa), Krause (Dąbrowa), Lubasy (Basznia Dolna), Malce (Basznia Górna), Michalce (Dąbrowa), Mielniki (Krowica Hołodowska), Mielniki (Szczutków), Misztale (Lisie Jamy), Moczar Duży (Załuże), Moczar Mały (Załuże), Mądre (Dąbrowa), Obrawczyzna (Krowica Sama), Onyszczaki (Szczutków), Piaski (Basznia Dolna), Pilipy (Młodów), Prewendy (Szczutków), Ruda (Basznia Dolna), Ruda Szczutkowska (Szczutków), Smolińce (Lisie Jamy), Szutki (Dąbrowa), Szymeczki (Basznia Dolna), Szyszaki (Szczutków), Tuczarnia (Opaka), Wasie (Dąbrowa), Wychylówka (Krowica Sama), Wygnańce (Lisie Jamy), Żuki (Opaka)
Names used more than once: Dąbrowa, Mielniki.
Place-name rules (they override 'copy locality verbatim' only for the locality field):
- locality is the town or village the text names, written exactly as in the list above. Change only case, spacing, dashes or a missing diacritic; never pick a different place.
- A name not on the list that is attached to a listed village ('Załuże–Podłęże', 'Załuże (Podłęże)'): locality = that village ('Załuże'), note = the unlisted name exactly as written ('Podłęże'). Never invent where an unlisted name lies.
- 'X (przysiółek Y)' or 'X ... (przysiółek Y)': locality = the village X; keep the bracket in place_verbatim. Example: 'Basznia Górna od nr 121 do nr 144 (przysiółek Dąbrowa)' -> locality 'Basznia Górna'.
- A bare name that is both a village and a village part (e.g. 'Dąbrowa') is the village.
- A village part named on its own, without its village: locality = the part's name.
- 'Młodów, ul. Pilipy' / 'Młodów ul. Pilipy' is the street Pilipy in Młodów: locality 'Młodów', street 'Pilipy'.
- street, place_verbatim and note are always copied exactly from the text, never normalized. Never output ids or places not in the text.
`;

test("prompt: design B, its place list built from our places", () => {
  assert.equal(SYSTEM, DESIGN_B);
});

test("prompt: the same for the same places in any order, no streets, no ids", () => {
  const shuffled = {
    localities: [...PLACES.localities].reverse(),
    streets: [...PLACES.streets].reverse(),
  };
  assert.equal(systemPrompt(shuffled), SYSTEM);
  assert.ok(!SYSTEM.includes("Sobieskiego"));
  assert.ok(!/\d{7}/.test(SYSTEM));
});

test("prompt: follows the data", () => {
  const more = {
    ...PLACES,
    localities: [
      ...PLACES.localities,
      {
        id: "9999999",
        name: "Nowa Wieś",
        kind: "wies" as const,
        parentId: null,
      },
      {
        id: "9999998",
        name: "Opaka",
        kind: "czesc_wsi" as const,
        parentId: "9999999",
      },
    ],
  };
  const prompt = systemPrompt(more);
  assert.match(
    prompt,
    /Villages \(wieś\): .*Mokrzyca, Młodów, Nowa Wieś, Opaka,/,
  );
  assert.match(prompt, /, Opaka \(Nowa Wieś\),/);
  assert.match(prompt, /Names used more than once: Dąbrowa, Mielniki, Opaka\./);
});

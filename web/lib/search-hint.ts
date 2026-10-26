// The search field's hint (components/address-search.tsx). Its examples are
// real addresses: each leads straight to one place, and a house number is
// one the address register has (search-hint.test.ts). No "use client" and
// no CSS, so the tests can import it.

export type HintExample = { text: string; id: string; nr: string | null };

export const HINT_EXAMPLES: HintExample[] = [
  // ul. Adama Asnyka, the only Asnyka in both gminy; PRG has nr 1–7.
  { text: "Asnyka 5", id: "0972447-00470", nr: "5" },
  // The village.
  { text: "Lisie Jamy", id: "0606234", nr: null },
];

export const HINT = `Na przykład ${HINT_EXAMPLES.map((example) => example.text).join(" albo ")} – polskie znaki nie są potrzebne`;

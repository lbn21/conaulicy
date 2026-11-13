// The search field's label and hint (components/address-search.tsx). The
// hint's examples are real addresses: each leads straight to one place
// (search-hint.test.ts); a house number is left out. No
// "use client" and no CSS, so the tests and server components can import it.

export const LABEL = "Ulica albo wieś";

export type HintExample = { text: string; id: string };

export const HINT_EXAMPLES: HintExample[] = [
  // ul. Adama Asnyka, the only Asnyka in both gminy.
  { text: "Asnyka 5", id: "0972447-00470" },
  // The village.
  { text: "Lisie Jamy", id: "0606234" },
];

export const HINT = `Na przykład ${HINT_EXAMPLES.map((example) => example.text).join(" albo ")} – polskie znaki nie są potrzebne`;

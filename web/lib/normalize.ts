// Search text: lower case, no Polish diacritics, words split on anything else.
// The search matcher (lib/search.ts) normalizes labels and queries with it,
// on the device over the cached index and on the server for /api/search.
// The importer and the CI fixture store normalize(label) per place
// (lib/schedule.ts orders its place queries by it); fileSlug turns it into
// the PDF's and both calendars' file names.

const DIACRITICS: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => DIACRITICS[ch])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A file name's words: "wywoz-smieci-gmina-lubaczow-sektor-1", ≤ 80 chars. */
export function fileSlug(text: string): string {
  return normalize(text).replaceAll(" ", "-").slice(0, 80).replace(/-+$/, "");
}

// Search text: lower case, no Polish diacritics, words split on anything else.
// The search matcher (lib/search.ts) normalizes labels and queries with it,
// on the device over the cached index.
// The importer and the CI fixture store normalize(label) per place
// (the dataset snapshot lists places in its order, scripts/lib/dataset.ts); fileSlug turns it into
// the PDF's and both calendars' file names.

export function normalize(text: string): string {
  return (
    text
      .toLowerCase()
      // Unicode gives ł no decomposition (NFD leaves it whole), unlike
      // ą ć ę ń ó ś ź ż, so it alone is mapped by hand.
      .replaceAll("ł", "l")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

/** A file name's words: "odbior-smieci-gmina-lubaczow-sektor-1", ≤ 80 chars. */
export function fileSlug(text: string): string {
  return normalize(text).replaceAll(" ", "-").slice(0, 80).replace(/-+$/, "");
}

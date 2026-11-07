// No source, no display (CLAUDE.md): an event is shown, put in a calendar or
// imported only with a link to its original (an http(s) URL) and the day it
// was last checked. One rule for the page, the PDF, the ICS and the import.

/** What the rule reads of an event (an events row, or one being built). */
export type Sourced = {
  sourceUrl?: string | null;
  checkedAt?: string | null;
};

const isHttpUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
};

/** Why the event may not be shown, in the import's words; null when it may. */
export function missingSource(event: Sourced): string | null {
  const url = event.sourceUrl?.trim();
  if (!url) return "has no source url";
  if (!isHttpUrl(url))
    return `source url ${JSON.stringify(event.sourceUrl)} is not http(s)`;
  if (!event.checkedAt?.trim()) return "has no checkedAt";
  return null;
}

export function hasSource(event: Sourced): boolean {
  return missingSource(event) === null;
}

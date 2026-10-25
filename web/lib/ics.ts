// The one iCalendar (RFC 5545) writer: the waste calendar (app/ics/[zoneId])
// and the water cuts (app/adres/[id]/woda.ics) share its escaping, line
// folding and response. Pure, so the unit tests read the files it writes.

const encoder = new TextEncoder();

export function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545: lines longer than 75 octets are folded with CRLF + space.
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (size + bytes > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** "2026-10-27" as "20261027". */
export function icsDate(iso: string): string {
  return iso.replaceAll("-", "");
}

/** An instant in UTC: "20261025T123000Z". */
export function icsUtc(at: Date): string {
  return `${at.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/** The calendar's opening lines, its name escaped. */
export function calendarHead(product: string, name: string): string[] {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//conaulicy//${product}//PL`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
  ];
}

/** The file: `lines` folded, CRLF after each, END:VCALENDAR added. */
export function calendarBody(lines: string[]): string {
  return `${[...lines, "END:VCALENDAR"].map(fold).join("\r\n")}\r\n`;
}

/** The response: inline, as `filename`, with the route's own headers. */
export function calendarResponse(
  body: string,
  filename: string,
  headers: Record<string, string>,
): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      ...headers,
    },
  });
}

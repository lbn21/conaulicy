import { longDate } from "@/lib/date-labels";
import { addDays, WARSAW } from "@/lib/dates";
import { datasetHeaders } from "@/lib/gate";
import { TEXT_PLAIN } from "@/lib/headers";
import { NOINDEX } from "@/lib/indexing";
import { getZone } from "@/lib/schedule";
import { DISCLAIMER, putOutNote } from "@/lib/schedule-notes";

const encoder = new TextEncoder();

function escapeText(text: string): string {
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

function icsDate(iso: string): string {
  return iso.replaceAll("-", "");
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/ics/[zoneId]">,
) {
  const { zoneId } = await ctx.params;
  const zone = await getZone(decodeURIComponent(zoneId));
  if (!zone) {
    return new Response("Nie znamy takiego harmonogramu.", {
      status: 404,
      headers: { ...TEXT_PLAIN, ...NOINDEX },
    });
  }

  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//conaulicy//Wywoz smieci//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`Wywóz śmieci – ${zone.name}`)}`,
    `X-WR-TIMEZONE:${WARSAW}`,
  ];

  for (const event of zone.events) {
    const putOutBy = event.payload?.putOutBy;
    const description = [
      typeof putOutBy === "string" ? putOutNote(putOutBy) : null,
      `Źródło: ${event.sourceUrl} (stan na ${longDate(event.checkedAt)})`,
      DISCLAIMER,
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@conaulicy`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(event.start)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(event.start, 1))}`,
      `SUMMARY:${escapeText(`Odbiór: ${event.label}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  const filename = `wywoz-${zone.id.replace(/[^a-z0-9-]+/gi, "-")}.ics`;
  return new Response(`${lines.map(fold).join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      ...datasetHeaders(),
      ...NOINDEX,
    },
  });
}

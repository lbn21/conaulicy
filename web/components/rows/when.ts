// The rows' times (components/rows/*): „od 8:00 do ok. 16:00”, the end's
// day named when it is not the start's; continued (started on an earlier
// day), the start's day named too: „od poniedziałku 9 listopada, 20:00”.
import { dayGenitive } from "@/lib/date-labels";
import type { Span } from "@/lib/upcoming";

export function fromTo(span: Span, continued: boolean): string {
  const start = continued
    ? `od ${dayGenitive(Date.parse(span.start))}${span.from ? `, ${span.from}` : ""}`
    : span.from
      ? `od ${span.from}`
      : "";
  const endDay = span.endDay === span.day ? "" : `${span.until}, `;
  const end = span.to
    ? `do ${endDay}${span.about ? "ok. " : ""}${span.to}`
    : "";
  return [start, end].filter(Boolean).join(" ");
}

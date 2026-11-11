import { outageDetails } from "@/components/outage-page";
import { fromTo } from "@/components/rows/when";
import { hoursRow, type OutagePage } from "@/lib/outage-view";
import { waterCalendarHref } from "@/lib/water-ics";
import {
  cutSpan,
  cutWhere,
  NO_HOURS,
  noticeLink,
  staleNote,
  type Water,
  waterAiNote,
  waterCalendarHint,
  waterChecked,
  waterEmpty,
  waterSources,
  waterTrace,
} from "@/lib/water-module";

// The water module's subpage, /adres/<id>/woda (lib/modules.ts), drawn by
// the outages' one body (components/outage-page.tsx): „Dodaj przerwy do
// kalendarza” when any cut can go in a calendar (lib/water-ics.ts), then
// every planned cut still to come at this address, a day each, with its
// hours and what is cut, then posts we could not match to addresses, as
// links only, then the AI-read note, and the posts (or, with none, the
// news pages) as the source with the check time. Read per request with the
// whole page, so the cuts are those not over now, from the cron's last
// file.

/** The water's subpage as the outages' one shape (lib/outage-view.ts). */
function waterPage(data: Water): OutagePage {
  const empty = waterEmpty(data);
  const calendar = waterCalendarHref(data);
  const dates = [...new Set(data.outages.map((cut) => cut.date))];
  return {
    note: staleNote(data),
    calendar:
      calendar === null
        ? null
        : {
            href: calendar,
            label: "Dodaj przerwy do kalendarza",
            hint: waterCalendarHint(data),
            event: "water_calendar_add",
            place: data.place.id,
          },
    empty,
    days: dates.map((date) => ({
      date,
      blocks: data.outages
        .filter((cut) => cut.date === date)
        .map((cut) => ({
          key: cut.uid,
          rows: [
            hoursRow([fromTo(cutSpan(cut), false)], NO_HOURS),
            { key: "Gdzie", value: [cutWhere(cut, data.place)] },
          ],
        })),
    })),
    trace: waterTrace(data),
    others: data.notices.map((notice) => ({
      key: notice.uid,
      parts: [noticeLink(notice)],
    })),
    aiNote: empty ? null : waterAiNote(data),
    sources: waterSources(data),
    checkedAt: waterChecked(data),
  };
}

/** The subpage's body, under its heading (components/module-page.tsx Subpage). */
export const WaterDetails = outageDetails(waterPage);

// MZGKiM's komunikaty: the town's water cuts among its other posts (the
// PSZOK, opening hours, deratyzacja). The header says how the source
// writes (the style analysis of task 182), never what to do: that is the
// shared rules'.

import { waterPrompt } from "../../water-prompt.ts";
import { MZGKIM } from "../../water-sources.ts";
import type { PostSource } from "../source.ts";
import { fetchPosts, fullPost } from "./fetch.ts";

const HEADER = `This source is ${MZGKIM.short}, the water utility of the town listed below. Every place in its posts is in that town, which the posts never name (locality_verbatim null for it). Most posts are not about water.
Outage posts always have the title "Przerwa w dostawie wody", with no date or place.
The body is one sentence, "Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w dniu 6 października (WTOREK) w godzinach 08.30 – 15.00 nastąpi przerwa w dostawie wody przy ulicach:", then the list, then one line with the reason.
A date is a day and a month name with no year ("w dniu 08 lipca"), and the post comes out a day or two before. The weekday in brackets is optional and may be upper case. Times look like "08.30 – 15.00", and night work like "w nocy z 14 na 15 listopada (z piątku na sobotę) w godzinach: 23.00 – 03.00".
The list has one entry per line, sometimes several on a line separated by commas. Streets stand alone, usually without "ul.", mostly in the form that follows "przy ulicach" ("Próbnej", "Testowej") and sometimes in the nominative ("Wzorcowa").
A part of a street follows its name: "Próbna od nr 1 do 9", "Próbna – od numeru 229 (nieparzyste) oraz numeru 168 (parzyste) w stronę Przykładowa", "Próbna (od siedziby straży w kierunku Wzorowa)". Place names inside such a direction are landmarks, not affected places.
Estates and neighbourhoods are the town's districts listed below, written "Osiedle Przykładowe", "na Przykładowem" or "Próbna wraz z osiedlem" (the whole street plus the estate beside it).
A description of a group of houses can be split over two lines ("Osiedle domów jednorodzinnych na zapleczu" / "ul. Próbnej"), and the same street may appear twice.
A street may be followed by a neighbouring village name in brackets, "ul. Wzorowska (Wzorowo)"; it is still the town street of that name (the bracket names where the road leads, not a limit). The whole town is written "na terenie całego miasta".
Other posts cover PSZOK closures, deratization, office hours, greetings, tenders (even about water analysis) and routine water-quality information, often only a list of PDF files or an empty body.`;

export const mzgkim: PostSource = {
  id: "mzgkim",
  water: MZGKIM,
  fetchPosts,
  systemPrompt: (places) => waterPrompt(HEADER, places, MZGKIM),
  fullPost,
};

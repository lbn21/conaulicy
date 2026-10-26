// The gmina's site: ZUK's and the wójt's water notices among the
// gmina's other posts. The header says how the source writes (the style
// analysis of task 182), never what to do: that is the shared rules'.

import { waterPrompt } from "../../water-prompt.ts";
import { GMINA } from "../../water-sources.ts";
import type { PostSource } from "../source.ts";
import { fetchPosts } from "./fetch.ts";

const HEADER = `This source is the gmina's website. Its water notices come from ${GMINA.name} (ZUK) and cover the gmina's villages, and only rarely a street of the town. Most posts on the site are not about water.
Titles usually read "Przerwa w dostawie wody – 7.10.2026: Przykładów, Wzorowo od nr 5 do nr 40". The title is a shortened summary; the body is the full notice.
The body is one fixed sentence, "… informuje, że w dniu 7.10.2026r. (środa) w godz. od 8:00 do godz. 16:00 nastąpi przerwa w dostawie wody dla mieszkańców miejscowości: …", followed by fixed lines about the reason, possible water discolouring, an apology and the signature. Dates always carry the year and a weekday.
Places are a comma list of villages. A village written alone is the whole village. A part of a village follows its name: a house range ("od nr 52 do nr 98", "numery nieparzyste od 3 do 21"), a hamlet in brackets or after a dash ("(przysiółek Zmyślonka)", "Wzorowo–Zmyślonka od numeru 44"), an estate ("os. Próbne"), or its streets.
Streets follow their village after a space, comma, colon or dash, or in brackets: "Przykładów ul. Próbna", "Przykładów, ul. Próbna, Testowa", "Przykładów: ul. Próbna", "Przykładów – ul. Próbna", "Przykładów (Próbna, Testowa)". The names after it are that village's streets until another village's name comes, with no marker in between, so only the place list shows where the streets end. A street can also carry its locality in brackets after it: "ul. Próbna (Przykładów)".
Notices covering several days or groups put each on its own line with its own hours: "-27.10.2026 (wtorek): Przykładów, Wzorowo – w godz. od 8:00 do 12:00". Night work reads "w nocy z 21.12.2025r. (niedziela) na 22.12.2025r. (poniedziałek) w godz. od 22:00 do godz. 5:00".
Failures are reported in the past tense, with only an expected restore time: "nastąpiła czasowa przerwa … Przewidywane wznowienie dostawy do godz. 19.00".
A correction is made by editing the same post: the whole text is republished with lines added or changed, and the title may gain "(uwaga aktualizacja)", with nothing marking what changed. Long works are also announced as separate daily posts that may repeat the same village.
Water-related posts that are not interruptions are common: water unfit to drink and its lifting, meter replacement by village, fee schedules, investments and appeals to save water.
Small slips are usual: "w dniach:" for a single day, missing or doubled spaces, stray commas, and a title that punctuates the list differently from the body.`;

export const gminaLubaczow: PostSource = {
  id: "gmina-lubaczow",
  water: GMINA,
  fetchPosts,
  systemPrompt: (places) => waterPrompt(HEADER, places, GMINA),
};

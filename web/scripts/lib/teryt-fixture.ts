// Small TERYT files as eTERYT serves them (BOM, semicolons, CRLF): real rows
// of 2026-10-16 for our two gminy, and one of another gmina that the check
// must ignore. A fixture, so code (scripts/check-tracked-data.mjs).

const csv = (lines: string[]) => `﻿${lines.join("\r\n")}\r\n`;

export const ULIC = csv([
  "WOJ;POW;GMI;RODZ_GMI;SYM;SYM_UL;CECHA;NAZWA_1;NAZWA_2;STAN_NA",
  "18;09;01;1;0972447;00470;ul.;Asnyka;Adama;2026-10-16",
  "18;09;01;1;0972447;12740;ul.;Mickiewicza;Adama;2026-10-16",
  "18;09;01;1;0972447;12741;os.;Osiedle Mickiewicza;;2026-10-16",
  "18;09;01;1;0972447;19253;ul.;Rynek;;2026-10-16",
  "18;09;04;2;0605890;08828;ul.;Kolejowa;;2026-10-16",
  "04;01;05;2;0858160;14834;ul.;Ogrodowa;;2026-10-22",
]);

export const SIMC = csv([
  "WOJ;POW;GMI;RODZ_GMI;RM;MZ;NAZWA;SYM;SYMPOD;STAN_NA",
  "18;09;01;1;96;1;Lubaczów;0972447;0972447;2026-01-01",
  "18;09;04;2;01;1;Basznia Dolna;0605890;0605890;2026-01-01",
  "18;09;04;2;00;1;Lubasy;0605921;0605890;2026-01-01",
  "02;24;04;2;01;1;Jemna;0855434;0855434;2026-01-01",
]);

export const TERCS = ["1809011", "1809042"];

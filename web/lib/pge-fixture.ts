// PGE PowerOutage API fixtures for the unit tests and the dev mock
// (lib/pge-mock.ts). A fixture, so code (scripts/check-tracked-data.mjs);
// the raw responses are not in git. Format: docs/data/pge.md.

/**
 * Real: GET /api/power-outage?regionIdentifier=49 on 11 Nov 2026 about
 * 16:45 UK time, trimmed: 6 of its 27 items (the 5 in gmina Lubaczów and
 * Jędrzejówka, gmina Oleszyce), and the one item of
 * ?regionIdentifier=49&streetSym=03375 (a street in Cieszanów), each
 * verbatim but without `coordinates`. Its times are past after 20 Nov 2026.
 */
export const REAL_2026_11_11 =
  '[{"description":"Basznia Górna","id":629321,"uuid":"6fbd5cfd-a093-400a-a2b0-925b5322ab8c","type":2,"regionIdentifier":"49","regionName":"Tomaszów-Lubelski","startAt":"2026-11-20 09:00:00","stopAt":"2026-11-20 20:00:00","dateRanges":[{"startAt":"2026-11-20 09:00:00","stopAt":"2026-11-20 20:00:00"}],"revoked":false,"revokedDescription":null,"addresses":[{"numbers":null,"teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"lubaczowski","countyCode":"1809","communeName":"Lubaczów","communeCode":"180904","cityName":"Basznia Górna","citySym":"0605950","streetName":null,"streetSymUl":null}}],"updatedAt":null,"createdAt":"2026-11-09 13:17:37"},{"description":"Basznia Górna; Podlesie; Malce; Huta Kryształowa","id":629315,"uuid":"4497d8b9-e68b-46fb-b41e-1036659c41bb","type":2,"regionIdentifier":"49","regionName":"Tomaszów-Lubelski","startAt":"2026-11-20 08:00:00","stopAt":"2026-11-20 20:00:00","dateRanges":[{"startAt":"2026-11-20 08:00:00","stopAt":"2026-11-20 09:00:00"},{"startAt":"2026-11-20 19:00:00","stopAt":"2026-11-20 20:00:00"}],"revoked":false,"revokedDescription":null,"addresses":[{"numbers":"100, 100119, 102, 105, 106, 110, 111, 113, 114, 115, 116, 118, 119, 120, 29, 42, 51A, 52, 67, 72, 72a, 73, 74, 77, 79, 80, 80A, 81, 82, 84, 88, 90, 92, 92a, 93, 94, 97, 98, 99, 99A, DZ713/2, SKLEP","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"lubaczowski","countyCode":"1809","communeName":"Lubaczów","communeCode":"180904","cityName":"Basznia Górna","citySym":"0605950","streetName":null,"streetSymUl":null}},{"numbers":"1, 10, 12, 14, 16, 18, 2, 24, 28, 3, 30, 32, 33, 34, 35, 37, 40, 41, 42, 5, 7, 91, DZ80/2","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"lubaczowski","countyCode":"1809","communeName":"Lubaczów","communeCode":"180904","cityName":"Podlesie","citySym":"0606369","streetName":null,"streetSymUl":null}},{"numbers":"1","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"lubaczowski","countyCode":"1809","communeName":"Lubaczów","communeCode":"180904","cityName":"Malce","citySym":"0605973","streetName":null,"streetSymUl":null}},{"numbers":"., 0, 1, 2, 3, 3/1, 4, 4/1, 5, 6, DZ 17/18, DZ 17/20","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"lubaczowski","countyCode":"1809","communeName":"Lubaczów","communeCode":"180904","cityName":"Huta Kryształowa","citySym":"0606100","streetName":null,"streetSymUl":null}}],"updatedAt":null,"createdAt":"2026-11-09 13:15:04"},{"description":"Krowica Lasowa","id":630542,"uuid":"bbc4d11d-f632-444f-a48e-4897c6be29f8","type":2,"regionIdentifier":"49","regionName":"Tomaszów-Lubelski","startAt":"2026-11-19 08:00:00","stopAt":"2026-11-19 14:00:00","dateRanges":[{"startAt":"2026-11-19 08:00:00","stopAt":"2026-11-19 14:00:00"}],"revoked":false,"revokedDescription":null,"addresses":[{"numbers":"1, 100, 13, 17, 25, 25A, 27, 28, 29, 31, 33, 34, 35, 36, 37, 38, 40, 41, 44, 46, 46i 48, 48, 49, 50, 52, 54, 55, 58, 59, 61, 67, 68, 70, 72, 76, 78, 80, 82 A, 84, 86, 9E, 9J, DZ 241/5, dz 337, dz 38, DZ 60/20, dz. 826/1, DZ.263, DZ.60/13, KAPLICA","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"lubaczowski","countyCode":"1809","communeName":"Lubaczów","communeCode":"180904","cityName":"Krowica Lasowa","citySym":"0606168","streetName":null,"streetSymUl":null}}],"updatedAt":null,"createdAt":"2026-11-10 14:06:38"},{"description":"Huta Kryształowa","id":626615,"uuid":"77d6b8f2-99b5-4cf7-9586-52495b13f928","type":2,"regionIdentifier":"49","regionName":"Tomaszów-Lubelski","startAt":"2026-11-18 09:00:00","stopAt":"2026-11-18 14:00:00","dateRanges":[{"startAt":"2026-11-18 09:00:00","stopAt":"2026-11-18 14:00:00"}],"revoked":false,"revokedDescription":null,"addresses":[{"numbers":"., 1, 2, 3/1, 4/1, 5, DZ 17/18, DZ 17/20","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"lubaczowski","countyCode":"1809","communeName":"Lubaczów","communeCode":"180904","cityName":"Huta Kryształowa","citySym":"0606100","streetName":null,"streetSymUl":null}}],"updatedAt":null,"createdAt":"2026-11-04 09:25:32"},{"description":"Jędrzejówka","id":628316,"uuid":"a11e1eea-8ebd-4304-bbcc-939c4beb0f5c","type":2,"regionIdentifier":"49","regionName":"Tomaszów-Lubelski","startAt":"2026-11-12 08:00:00","stopAt":"2026-11-12 14:00:00","dateRanges":[{"startAt":"2026-11-12 08:00:00","stopAt":"2026-11-12 14:00:00"}],"revoked":false,"revokedDescription":null,"addresses":[{"numbers":"1, 10, 11, 119A, 12, 13, 14, 14 A, 15, 16, 17, 18, 19A, 2, 20, 21, 22, 23, 24, 28, 29, 30, 31, 32, 33, 34, 35, 37, 4, 5, 53, 6, 7, 7A, 8, 9, 9a, dz. 311/6","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"lubaczowski","countyCode":"1809","communeName":"Narol","communeCode":"180905","cityName":"Jędrzejówka","citySym":"0606837","streetName":null,"streetSymUl":null}}],"updatedAt":"2026-11-06 12:07:51","createdAt":"2026-11-06 12:07:09"},{"description":"Huta Kryształowa","id":626606,"uuid":"f76971d9-0c42-4f9a-876e-535620a1df45","type":2,"regionIdentifier":"49","regionName":"Tomaszów-Lubelski","startAt":"2026-11-17 08:30:00","stopAt":"2026-11-17 15:30:00","dateRanges":[{"startAt":"2026-11-17 08:30:00","stopAt":"2026-11-17 09:30:00"},{"startAt":"2026-11-17 14:30:00","stopAt":"2026-11-17 15:30:00"}],"revoked":false,"revokedDescription":null,"addresses":[{"numbers":"., 0, 1, 2, 3, 3/1, 4, 4/1, 5, 6, DZ 17/18, DZ 17/20","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"lubaczowski","countyCode":"1809","communeName":"Lubaczów","communeCode":"180904","cityName":"Huta Kryształowa","citySym":"0606100","streetName":null,"streetSymUl":null}}],"updatedAt":null,"createdAt":"2026-11-04 09:23:12"},{"description":"Cieszanów: ul. Czereśnie","id":630545,"uuid":"d0ddddcf-821a-41fa-aa26-e12fcf55793b","type":2,"regionIdentifier":"49","regionName":"Tomaszów-Lubelski","startAt":"2026-11-20 08:00:00","stopAt":"2026-11-20 14:00:00","dateRanges":[{"startAt":"2026-11-20 08:00:00","stopAt":"2026-11-20 14:00:00"}],"revoked":false,"revokedDescription":null,"addresses":[{"numbers":"12, 13, 20, 22, 27, 28, 31, 35, 36, 39, 41, 42, 43, 4465, 45, 49, 53, 57, DZ.4468, dz4484","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"lubaczowski","countyCode":"1809","communeName":"Cieszanów","communeCode":"180902","cityName":"Cieszanów","citySym":"0972051","streetName":"ul. Czereśnie","streetSymUl":"03375"}}],"updatedAt":null,"createdAt":"2026-11-10 14:07:22"}]';

/**
 * Real: GET /api/power-outage/62641795-f36b-468c-b3e4-6f0d9f957391 on 11
 * Nov 2026: a failure (type 1) in Rzeszów and Tyczyn, verbatim but without
 * `coordinates`.
 */
export const FAILURE_2026_11_11 =
  '{"description":"Rzeszów: ul. Widnokręgowa, ul. Pienińska, ul. Rodzinna, ul. Białogórska; Tyczyn: ul. Mokra Strona, ul. Łany","id":631082,"uuid":"62641795-f36b-468c-b3e4-6f0d9f957391","type":1,"regionIdentifier":"28","regionName":"Rzeszów","startAt":"2026-11-11 16:03:06","stopAt":"2026-11-11 18:15:00","dateRanges":[{"startAt":"2026-11-11 16:03:06","stopAt":"2026-11-11 18:15:00"}],"revoked":false,"revokedDescription":null,"addresses":[{"numbers":"23, 52, 58A","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"Rzeszów","countyCode":"1863","communeName":"Rzeszów","communeCode":"186301","cityName":"Rzeszów","citySym":"0974133","streetName":"ul. Widnokręgowa","streetSymUl":"40989"}},{"numbers":"120","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"Rzeszów","countyCode":"1863","communeName":"Rzeszów","communeCode":"186301","cityName":"Rzeszów","citySym":"0974133","streetName":"ul. Pienińska","streetSymUl":"16132"}},{"numbers":"17","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"rzeszowski","countyCode":"1816","communeName":"Tyczyn","communeCode":"181614","cityName":"Tyczyn","citySym":"0975078","streetName":"ul. Mokra Strona","streetSymUl":"13212"}},{"numbers":"54, 61, 67, 71, 75, 78, 81, 82, 83A, 84, 90, 99","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"Rzeszów","countyCode":"1863","communeName":"Rzeszów","communeCode":"186301","cityName":"Rzeszów","citySym":"0974133","streetName":"ul. Rodzinna","streetSymUl":"18725"}},{"numbers":"39, 47, 49","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"Rzeszów","countyCode":"1863","communeName":"Rzeszów","communeCode":"186301","cityName":"Rzeszów","citySym":"0974133","streetName":"ul. Białogórska","streetSymUl":"01178"}},{"numbers":"15, 17, 29, 32, 32E, 33, 33 B, 35b, 39, 39a, 41, 42, dz 101/1","teryt":{"voivodeshipName":"PODKARPACKIE","voivodeshipCode":"18","countyName":"rzeszowski","countyCode":"1816","communeName":"Tyczyn","communeCode":"181614","cityName":"Tyczyn","citySym":"0975078","streetName":"ul. Łany","streetSymUl":"11513"}}],"updatedAt":null,"createdAt":"2026-11-11 16:03:15"}';

type Raw = Record<string, unknown>;

/** The Huta Kryształowa item derivedOurs() marks revoked. */
export const REVOKED_ID = "77d6b8f2-99b5-4cf7-9586-52495b13f928";
/** The Basznia Górna item derivedOurs() gives no dateRanges. */
export const NO_RANGES_ID = "6fbd5cfd-a093-400a-a2b0-925b5322ab8c";
/** FAILURE_2026_11_11's uuid: derivedOurs() moves it to Lubaczów. */
export const FAILURE_ID = "62641795-f36b-468c-b3e4-6f0d9f957391";

const teryt = (citySym: string, streetSymUl: string | null) => ({
  citySym,
  streetSymUl,
});

/**
 * DERIVED, NOT REAL: REAL_2026_11_11 with three changes PGE never
 * published, for the states the real day lacked: REVOKED_ID revoked (its
 * note made up), NO_RANGES_ID without `dateRanges`, and FAILURE_2026_11_11
 * moved to two Lubaczów streets (Adama Asnyka 23, 52, 58A; Jasna, no
 * numbers): Asnyka is the CI fixture's town street (scripts/ci-fixture.ts).
 */
export function derivedOurs(): Raw[] {
  const items: Raw[] = JSON.parse(REAL_2026_11_11);
  const failure: Raw = JSON.parse(FAILURE_2026_11_11);
  return [
    ...items.map((item) => {
      if (item.uuid === REVOKED_ID)
        return {
          ...item,
          revoked: true,
          revokedDescription: "Prace zostały przełożone.",
        };
      if (item.uuid === NO_RANGES_ID) {
        const { dateRanges: _, ...rest } = item;
        return rest;
      }
      return item;
    }),
    {
      ...failure,
      regionIdentifier: "49",
      addresses: [
        { numbers: "23, 52, 58A", teryt: teryt("0972447", "00470") },
        { numbers: null, teryt: teryt("0972447", "07335") },
      ],
    },
  ];
}

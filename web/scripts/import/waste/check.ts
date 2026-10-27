// The waste domain's checks of one extracted schedule (docs/import.md,
// "Validate" and "Review pull requests"). Every new schedule goes to a
// person: a file whose sha256 has no merged review gets one blocking review
// PR (../core/review.ts) with Grok's reading against the database, the
// literal checks' findings, the places against the zone's members (by id;
// membership comes only from the database) and the date rules
// (domains.waste.validate, approvals.yaml); nothing from it applies until
// the PR is merged. A merged review's dates apply after the date rules.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Queryable } from "../core/db.ts";
import type { Domain } from "../core/domain.ts";
import { ROOT } from "../core/paths.ts";
import type { Extracted, Found, WasteSource } from "./adapters.ts";
import {
  databaseRows,
  LAYOUT_ROWS,
  memberLists,
  readingTable,
  reviewedYaml,
  type ValidationRules,
  validateSchedule,
} from "./lib.ts";
import { TOWN_SIMC } from "./prompts.ts";

/** domains.waste in etl/sources.yaml. */
type WasteSettings = {
  coverageMinDays: number;
  validate: ValidationRules & { counts: { minMonths: number } };
};

const approvalsFile = path.join(ROOT, "etl/review/approvals.yaml");
const anomalies = new Set(
  (
    ((existsSync(approvalsFile) &&
      parseYaml(readFileSync(approvalsFile, "utf8"))) ||
      {}) as {
      anomalies?: Array<{ zone_id: string; date: string }>;
    }
  ).anomalies?.map((a) => `${a.zone_id}|${a.date}`) ?? [],
);

/** The zone's listed members by the ids the prompt lists (SIMC, or SYM_UL). */
const MEMBERS = {
  gmina:
    "select l.id, l.name from zone_members m join localities l on l.id = m.locality_id where m.zone_id = $1 and m.street_id is null and l.kind = 'wies' order by l.name",
  miasto:
    "select distinct s.teryt as id, s.name from zone_members m join streets s on s.id = m.street_id where m.zone_id = $1 and s.locality_id = $2 order by s.name",
};

/** Events per subtype last year, when it has enough months to compare. */
async function lastYear(
  db: Queryable,
  out: Extracted,
  minMonths: number,
): Promise<Map<string, number> | null> {
  const last = await db.query(
    "select subtype, count(*)::int as n, count(distinct substr(start, 1, 7))::int as months from events where zone_id = $1 and start like $2 group by subtype",
    [out.zoneId, `${out.year - 1}-%`],
  );
  return Math.max(0, ...last.rows.map((r) => r.months)) >= minMonths
    ? new Map(last.rows.map((r) => [r.subtype as string, r.n as number]))
    : null;
}

const list = (items: string[], none: string) =>
  items.length ? items.map((i) => `- ${i}`) : [`- ${none}`];

export const check: Domain["check"] = async ({
  db,
  config,
  source: anySource,
  file: anyFile,
  digest,
  out: extracted,
  zoneName,
  reviews,
  runUrl,
}) => {
  const source = anySource as WasteSource;
  const file = anyFile as Found;
  const out = extracted as Extracted;
  const rules = (config.domains.waste as WasteSettings).validate;
  const checks = new Set(source.waste.validate);
  const validate = (previous: Map<string, number> | null) =>
    validateSchedule({
      zoneId: out.zoneId,
      year: out.year,
      events: out.events,
      checks,
      rules,
      previous,
      anomalies,
    });
  // --extract-only: no database and no review PR; findings are problems.
  if (!db) return [...(out.read?.findings ?? []), ...validate(null)];
  const previous = await lastYear(db, out, rules.counts.minMonths);

  // A merged review: a person approved these dates; the date rules apply.
  if (out.reviewed || !out.read) {
    reviews.supersede(
      source.id,
      file.name,
      digest,
      `Superseded: ${file.name} (sha256 ${digest}) has a merged review.${runUrl ? ` ${runUrl}` : ""}`,
    );
    return validate(previous);
  }

  // A fresh reading: nothing applies until a person merges its review PR.
  const { rejected, merged } = reviews.status(source.id, file.name, digest);
  if (rejected) {
    reviews.hold(
      digest,
      `its review was rejected (${rejected.url}); the database keeps its dates`,
      false,
    );
    return [];
  }
  if (merged) {
    reviews.hold(
      digest,
      `its review is merged (${merged.url}) but not in this checkout yet`,
      true,
    );
    return [];
  }
  const { layout } = source.extract;
  const { reading, findings, content, model, usage, costUsd, latencyMs } =
    out.read;
  const current = databaseRows(
    (
      await db.query(
        "select subtype, start from events where zone_id = $1 and start like $2",
        [out.zoneId, `${out.year}-%`],
      )
    ).rows,
    LAYOUT_ROWS[layout],
  );
  const members = checks.has("members")
    ? memberLists(
        reading?.places ?? [],
        (
          await db.query(
            MEMBERS[layout],
            layout === "gmina" ? [out.zoneId] : [out.zoneId, TOWN_SIMC],
          )
        ).rows.map((r) => ({ id: r.id as string, name: r.name as string })),
      )
    : null;
  const place = (p: { as_written: string; id: string | null }) =>
    `„${p.as_written}” (id ${p.id ?? "null"})`;
  const shown = 20_000;
  const url = await reviews.open({
    source,
    file,
    digest,
    title: `${zoneName}: nowy harmonogram do sprawdzenia (${file.name})`,
    blocking: true,
    markdown: [
      "### Odczyt",
      "",
      `Jeden odczyt: **${model}** (xAI, reasoning medium): tokeny ${usage.promptTokens} wejścia, ${usage.completionTokens} wyjścia, ${usage.reasoningTokens} rozumowania; $${costUsd.toFixed(4)}; ${Math.round(latencyMs / 1000)} s. Każdy nowy harmonogram sprawdza człowiek, także gdy wszystkie kontrole przeszły i odczyt zgadza się z bazą: porównaj daty z obrazem.`,
      "",
      `- Sektor: odczyt ${reading ? JSON.stringify(reading.sector) : "?"}, z nazwy pliku ${file.sector}${layout === "gmina" ? " (PDF gminy nie drukuje sektora: odczyt ma być null)" : ""}`,
      `- Rok: odczyt ${reading ? JSON.stringify(reading.year) : "?"}, z nazwy pliku ${file.year}`,
      "",
      "### Kontrole odczytu (dosłowne)",
      "",
      ...list(findings, "wszystkie przeszły"),
      "",
      "### Daty: odczyt i baza",
      "",
      readingTable(reading, current),
      "",
      "### Daty bez miesiąca (unplaced)",
      "",
      ...list(
        (reading?.unplaced ?? []).map(
          (u) => `${JSON.stringify(u.row)}, dzień ${u.day}`,
        ),
        "brak",
      ),
      ...(members
        ? [
            "",
            "### Miejsca (tylko z bazy)",
            "",
            "Przynależność do stref bierze się wyłącznie z bazy; import jej nie zmienia, a id bez pewności zostaje null. Jeśli ulica lub wieś naprawdę zmieniła strefę, popraw bazę.",
            "",
            "**Na pliku, nie w tej strefie w bazie:**",
            "",
            ...list(members.notInZone.map(place), "brak"),
            "",
            "**W tej strefie w bazie, nie na pliku:**",
            "",
            ...list(
              members.notOnFile.map((m) => `${m.name} (id ${m.id})`),
              "brak",
            ),
            "",
            "**Bez id (null):**",
            "",
            ...list(members.noId.map(place), "brak"),
          ]
        : []),
      "",
      "### Reguły dat",
      "",
      ...list(validate(previous), "bez uwag"),
      "",
      "<details><summary>Odpowiedź modelu, jak ją zwrócił</summary>",
      "",
      "~~~~~~",
      // Display only: a very long reply is cut here, never in what is checked.
      content.length > shown
        ? `${content.slice(0, shown)}\n… (${content.length - shown} more characters)`
        : content,
      "~~~~~~",
      "",
      "</details>",
    ].join("\n"),
    pageLabel: "Strona harmonogramu",
    reviewed: reviewedYaml(reading, layout, file, model, digest),
    runUrl,
  });
  reviews.hold(digest, `a new schedule; its review PR: ${url}`, true);
  return [];
};

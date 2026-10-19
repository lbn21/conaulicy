# conaulicy.pl: real-data import plan (for a coding agent)

Written 2026-10-19. Inputs: `main` at the search-overlay merge (schema identical to `eb5fed5`: `web/lib/db/schema.ts`, `web/scripts/seed.ts`, `web/lib/schedule.ts`, `web/app/api/revalidate/route.ts`). ETL: draft PR #2 `feat/etl` @ `c156836` (`etl/review/ANOMALIES.md`, `etl/review/approvals.yaml`, `docs/data-model.md`). Output copy: `/workspace/conaulicy/data/`.
Hard rule (CLAUDE.md): every item shown has a source link and a last-checked date. No source, no display. Never invent dates, shifts or sectors.

## 0. Facts checked today
- ETL output: 1012 events (all `type=waste`, `allDay`, `verified=false`, 2026-01-02 … 2026-12-31), 276 streets (206 city), 64 localities (1 miasto, 24 wies, 39 czesc_wsi), 10 zones, 2 gminy. All `id = sha256(zoneId|subtype|start)` (checked 1012/1012).
- Upcoming (≥ 2026-10-19): 184 events. Nothing after 2026-12-31 exists yet.
- All 10 schedule `source.url`s returned HTTP 200 and the **same sha256** as `meta.json` (checked 2026-10-19 ~13:15 BST from the box).
- Both `gminy.scheduleUrl` pages used in seed.ts return HTTP 200.

## 1. Neon: split preview and production (FREE plan)
> **Abandoned 2026-10-19.** All environments share Neon `main`; see `docs/database.md`. Also, `vercel env run` in Vercel CLI 64.5 is unsafe (it re-parses the command as a Vercel command), so the commands below that use it are replaced by `web/.env.local` plus `--yes-production`.

Free-plan limits ([Neon plans](https://neon.com/docs/introduction/plans)): **10 branches/project, no extra branches on Free** ("Branch creation fails once you reach 10"), 100 CU-h/project/month (all computes in the project count), 1 GB storage/project, scale-to-zero after 5 min (cannot be disabled), 6 h restore history, 1 manual snapshot.

**Do NOT enable Vercel "Preview Branching"** ([Vercel-managed integration](https://neon.com/docs/guides/vercel-managed-integration)): it creates one `preview/<git-branch>` Neon branch per preview deployment and deletes it only when the deployment is removed (Vercel keeps previews 6 months by default). On Free we would hit 10 branches quickly; with "Resource must be active before deployment" on, previews then fail. It also needs migrate+seed in every build.

**Simplest path (one fixed preview branch):**
1. Neon Console (Storage → Open in Neon) → create child branch `preview` from `main` ([branches](https://neon.com/docs/manage/branches)). It starts with today's seed data; that is what preview should show. Refresh later with [Reset from parent](https://neon.com/docs/guides/reset-from-parent) if needed. Uses 2 of 10 branches.
2. Vercel → Storage → the Neon DB → Projects: scope the project connection to **Production + Development only** (integration vars follow the connection's environments: [Vercel env vars, "Integration environment variables"](https://vercel.com/docs/environment-variables)). If the UI cannot edit the scope: "Remove Project Connection" and "Connect Project" again with Production only. The live deployment keeps its env (changes apply only to new deployments), but redeploy production right after and check it.
3. Add manual **Preview** env vars `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) = connection strings of the `preview` branch (`vercel env add DATABASE_URL preview`, [manage across environments](https://vercel.com/docs/environment-variables/manage-across-environments)). Mark them sensitive.
4. Run `npm run db:migrate` on each branch when the schema changes (preview first). CI stays on its own throwaway Postgres + seed (`.github/workflows/ci.yml`), no secrets.
5. Verify: a preview deployment reads seed streets (e.g. 9xxxx SYM_UL), production reads real ones after the import.

**Money flags:** none for the path above. These would cost money: upgrading the Neon plan (Launch: $0.106/CU-h, $0.35/GB-month, extra branches $1.50/branch-month, billed via Vercel), and snapshot storage ($0.09/GB-month is listed; Free-plan billing for it is unclear, so don't rely on snapshots). Backup before the import = `pg_dump` to a local file (free) + the 6 h restore window. Watch CU-h: two branches share 100 CU-h/month. When they run out, compute is suspended until the next month (the site goes down; it does not bill).

## 2. ETL output → DB schema mapping
IDs: the ETL uses prefixed ids (`simc-…`, `ulic-…`); the DB/URLs use bare ones (`/adres/0972447-00470` = Asnyka; printed QR codes must stay valid). **The importer strips prefixes.** `ulic-0972447-00470` exists in real data (miasto-s1), so the Asnyka URL survives. The seed's made-up `…-9xxxx` URLs disappear (fine: password-gated, test only).

| DB table.column | ETL source | Note |
|---|---|---|
| gminy.id / teryt / name | gminy.json id / teryt / name | keep ETL ids `lubaczow-miasto`, `lubaczow-gmina` (not in URLs) |
| gminy.scheduleUrl | **gap**: not in ETL | use the 2 URLs from seed.ts (both 200 today); better: add to `etl/sources.yaml` |
| localities.id / teryt | `simc-XXXXXXX` → `XXXXXXX` / teryt | |
| localities.gminaId / name / kind | same | kind ∈ miasto/wies/czesc_wsi (matches CHECK) |
| localities.parentId | parentId (39 czesc_wsi) → strip prefix | |
| localities.search | **computed**: `normalize(label)` like seed.ts | label must disambiguate, see gap G2 |
| streets.id | `ulic-SSSSSSS-UUUUU` → `SSSSSSS-UUUUU` | |
| streets.localityId / teryt / prefix / name | same (prefix ∈ ul./os./al./rondo/skwer) | houseFrom/To/parity: not in ETL → null |
| streets.search | **computed** `normalize("{prefix} {name}, {locality}")` | |
| zones.id / type / name | same | names "Miasto Lubaczów, sektor 1" etc. |
| zone_members | zones[].members (localityId, streetId?) → strip prefixes | house ranges null; identity id, replace per zone |
| events.id / type / subtype / zoneId / start / allDay / label | same | subtypes all in SUBTYPE_ORDER/waste-bin TOKEN (incl. opony, tekstylia, tworzywa_metale) |
| events.end | none → null | |
| events.sourceDoc / sourceUrl / sourceSha256 | source.doc / url / sha256 | |
| events.sourceRef | source.ref (`month=1;row=zmieszane+bio;cell=19`) | **gap G3**, see below |
| events.checkedAt (NOT NULL) | **gap**: not in ETL | set by the importer's source check (§3) |
| events.verified / reviewedBy / reviewedAt | from approvals.yaml per zone (all null today → false) | |
| events.shiftedFrom | none → null | do **not** derive from weekday anomalies |
| events.payload.putOutBy | **gap**: not in ETL | all 5 gmina PDFs say "…WYSTAWIĆ PRZED POSESJĘ W DNIU WYWOZU DO GODZ. 6:00" → `"06:00"` for `waste:gmina-*` only; nothing like that found on the city JPG (S1 checked). Prefer emitting it from the ETL with a source ref |
| meta | meta.json | delete `testData`; write `dataset` = {year, provisional, flags, sources[sha256,url], importedAt, etlCommit} |

Gaps (no migration needed for any of them):
- **G1 czesc_wsi have no zone.** Members list only the 24 parent villages. `docs/data-model.md`: "czesc_wsi … take the parent settlement's zone". `wasteZoneFor()` only matches `place.localityId`, so the 39 village parts would show "Tej wsi jeszcze nie mamy". Fix in `lib/schedule.ts`: match `localityId IN (id, parentId)` and prefer the own entry. (Don't expand members in the importer: keep data as published.)
- **G2 duplicate labels.** "Dąbrowa" = village (gmina-s1) and part of Basznia Górna (gmina-s4); "Mielniki" = part of Krowica Hołodowska and part of Szczutków. Today both would be "Dąbrowa (gm. Lubaczów)". For czesc_wsi use the label `"{name} ({parent}, gm. Lubaczów)"` in `villagePlace()` and in `localities.search`.
- **G3 source label.** `sourcesOf()` prints `sourceRef` as the visible label, so the page would show `month=1;row=…`. Minimal: the importer writes a human `sourceRef` = `"Harmonogram 2026, {zone.name}"` and keeps the cell ref in `payload.sourceCell` (audit). Update the schema comment. (Alternative: one nullable `source_label` column. Only if the agent prefers a migration.)
- **G4** `popiol` sits on every city `zmieszane` date all year (131 = 131). It matches the image (one shared grey cell for ZMIESZANE and POPIÓŁ). Not a bug; no change.
- **G5** The "unverified" note on the place page (`!place.verified`) shows while approvals are null. That is the intended launch state.

## 3. Import mechanism
Script `web/scripts/import.ts`, `npm run db:import -- --from <dir> [--apply] [--approvals ../etl/review/approvals.yaml]`. Default is a dry run. Uses node-postgres on `DATABASE_URL_UNPOOLED` (like seed.ts; neon-http has no interactive transactions). New devDependency: `yaml`.

Steps:
1. **Load and validate** the 6 JSON files: ids unique, FK closure (every member/street/event points at a known row), `start` matches the events CHECK, `id == sha256(zoneId|subtype|start)`, the `meta.flags` list is printed.
2. **Source check (sets checkedAt):** for each schedule source in `meta.sources` (kind miasto/gmina), GET `url` and compare sha256. Match → `checkedAt = todayInWarsaw()` for all events of that doc. Mismatch or HTTP error → **abort** ("source changed, re-run ETL"). `--offline` is not allowed with `--apply`. The rule: a date is "Stan na" only the day we actually compared.
3. **Transform** (§2): strip prefixes, compute `search`, labels, payload, sourceRef.
4. **Approvals:** for each sector with `reviewed_by` set → its events get `verified=true, reviewedBy, reviewedAt`. Add `events_sha256` (sha256 of the zone's sorted event ids) to each sector in approvals.yaml. Apply the approval only if it matches; otherwise warn and leave `verified=false` (stale approval). Approvals live in the yaml, not the DB, so re-imports keep them.
5. **Diff** vs DB per table: insert / update (changed columns) / delete counts plus the first N examples, for example `events: +1012 −~600 (seed) ~0`. Exit 0 in dry run.
6. **Apply** (`--apply`), one transaction: if `meta.testData = true` → delete all rows (seed replacement, same order as seed.ts). Else upsert by PK (`ON CONFLICT DO UPDATE`), replace `zone_members` per zone, delete rows missing from the input. Guard: if deletes exceed 10% of a table on a non-test dataset, require `--allow-deletes`. Write `meta.dataset`.
7. **Revalidate:** `POST {SITE_URL}/api/revalidate` with `Authorization: Bearer $REVALIDATE_SECRET`. Print the result. Note: the CDN keeps copies up to `s-maxage=3600`, so search can be ≤1 h stale. Skip this for preview (Deployment Protection) or use the preview URL plus a bypass token.
8. Smoke check: fetch `/adres/0972447-00470` (Basic Auth) and assert the next date matches the DB.

Where it runs: **locally by the operator** (Grok on the box, or the Mac repo). Reason: `etl/out/` is gitignored and the dataset must never be in git, so a GitHub Action would need the dataset and the prod DB URL as GitHub secrets. That is more exposure for no benefit at ~1 import/year. Use Vercel's env without writing secrets to disk:
```sh
cd web
vercel env run -e preview    -- npm run db:migrate
vercel env run -e preview    -- npm run db:import -- --from ../etl/out            # dry run
vercel env run -e preview    -- npm run db:import -- --from ../etl/out --apply
# check the preview deployment, then the same three commands with -e production
pg_dump "$DATABASE_URL_UNPOOLED" > backup-YYYYMMDD.sql   # before the production --apply
```
(`vercel env run`: [manage across environments](https://vercel.com/docs/environment-variables/manage-across-environments). Keep `REVALIDATE_SECRET` in the Production env.) The importer must print the target host and branch, and require `--yes-production` when the host is the main branch.

Order: (a) Neon split §1 → (b) G1–G3 code + import script on a PR, CI on seed → (c) import on preview → (d) Jakub decides on the anomalies (separate PL note) → (e) production import + revalidate.

Out of scope: 2027 data, cron for source-change detection (storage-options.md §B), water/power.

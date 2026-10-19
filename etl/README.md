# ETL (provisional)

Extracts the 2026 Lubaczów waste schedules into JSON under `etl/out/`. The shape and the storage are provisional. Jakub will choose a Vercel store (Blob, Edge Config, or Marketplace Postgres or Redis). Nothing is written to `web/`, and there is no database, calendar file, search index, or schedule fetch.

`etl/out/` is gitignored. That includes Pass A (the vision reading of the city JPGs), the sector/event JSON, and `etl/out/golden/`. Commit code, `schema/`, this README, and `etl/review/ANOMALIES.md` only.

## Run

Requires `pdftotext` (Poppler) and `uv`. Python is pinned in `.python-version` (3.15.0). Tesseract is not used.

```sh
make etl    # write etl/out/
make check  # schema, anomaly report, ruff, biome
make test   # pytest
```

`make etl` fails with a clear error if `etl/out/miasto/miasto-s{1..5}-2026.pass-a.json` is missing. Those files are a local cell-by-cell reading of the JPGs. Pass B is `docs/data/sample/schedule-2026.sample.json` (a different transcription). A cell where they differ is listed in `etl/review/ANOMALIES.md` and does not become an event.

The gmina PDFs are parsed with `pdftotext -layout`. `-` is no date. `2,20` is two dates. S3 includes Młodów.

`etl/review/approvals.yaml` leaves every sector unreviewed. Events are `verified: false`.

## Not in this PR

ICS files, `search-index.json`, a second vision/OCR engine, and any cron. The anomaly report is `etl/review/ANOMALIES.md`.

Sources are the public files already in `docs/data/` (URLs and sha256 in `sources.yaml`). Hashes are checked against `docs/data/SHA256SUMS.txt`. Nothing is downloaded.

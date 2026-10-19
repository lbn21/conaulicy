"""Build the provisional location/event JSON under etl/out/."""

from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

from common import (
    GMINA_ROWS,
    LABELS,
    MIASTO_ROWS,
    YEAR,
    dump_json,
    event_id,
    load_yaml,
    out_dir,
    repo_root,
    sha256_file,
    zone_id,
)
from extract_gmina import GminaTable, parse_pdf
from extract_miasto import compare, load_pass_a, pass_b_from_sample
from register import Register, build_register


def load_sources(root: Path | None = None) -> list[dict[str, str]]:
    base = root or repo_root()
    payload = load_yaml(base / "etl" / "sources.yaml")
    return list(payload["sources"])


def verify_hashes(root: Path, sources: list[dict[str, str]]) -> None:
    by_rel: dict[str, str] = {}
    for source in sources:
        path = root / source["path"]
        digest = sha256_file(path)
        if digest != source["sha256"]:
            raise SystemExit(f"sha256 mismatch for {source['path']}")
        by_rel[str(Path(source["path"]).relative_to("docs/data"))] = digest
    sums = (root / "docs" / "data" / "SHA256SUMS.txt").read_text(encoding="utf-8")
    for line in sums.splitlines():
        if not line.strip():
            continue
        digest, relative = line.split(None, 1)
        relative = relative.strip()
        if by_rel.get(relative) != digest:
            raise SystemExit(f"SHA256SUMS mismatch for {relative}")


def _source_for(sources: list[dict[str, str]], sector: str) -> dict[str, str]:
    for source in sources:
        if source.get("sector") == sector:
            return source
    raise KeyError(sector)


def _events_for(
    sector: str,
    rows: dict[str, tuple[tuple[int, ...], ...]],
    fractions: dict[str, tuple[str, ...]],
    source: dict[str, str],
    invalid: list[dict[str, str]],
    duplicates: list[str],
) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    seen: set[tuple[str, str, str]] = set()
    zid = zone_id(sector)
    for row, months in rows.items():
        for month, days in enumerate(months, start=1):
            seen_days: set[int] = set()
            for day in days:
                if day in seen_days:
                    duplicates.append(f"{sector} {row} month={month} cell={day}")
                    continue
                seen_days.add(day)
                try:
                    start = dt.date(YEAR, month, day).isoformat()
                except ValueError:
                    invalid.append(
                        {
                            "day": str(day),
                            "month": str(month),
                            "row": row,
                            "sector": sector,
                        }
                    )
                    continue
                if not start.startswith(str(YEAR)):
                    invalid.append(
                        {
                            "day": str(day),
                            "month": str(month),
                            "row": row,
                            "sector": sector,
                        }
                    )
                    continue
                for subtype in fractions[row]:
                    key = (zid, subtype, start)
                    if key in seen:
                        duplicates.append(f"{zid}|{subtype}|{start}")
                        continue
                    seen.add(key)
                    events.append(
                        {
                            "allDay": True,
                            "id": event_id(zid, subtype, start),
                            "label": LABELS[subtype],
                            "reviewedAt": None,
                            "reviewedBy": None,
                            "source": {
                                "doc": source["path"],
                                "ref": f"month={month};row={row};cell={day}",
                                "sha256": source["sha256"],
                                "url": source["url"],
                            },
                            "start": start,
                            "subtype": subtype,
                            "type": "waste",
                            "verified": False,
                            "zoneId": zid,
                        }
                    )
    return events


def build(root: Path | None = None) -> dict[str, object]:
    base = root or repo_root()
    sources = load_sources(base)
    verify_hashes(base, sources)
    tables: list[GminaTable] = []
    for source in sources:
        if source["kind"] != "gmina":
            continue
        tables.append(parse_pdf(base / source["path"], source["sector"], source["path"]))
    tables.sort(key=lambda table: table.sector)

    pass_a = load_pass_a(base / "etl" / "out" / "miasto")
    pass_b = pass_b_from_sample(
        base / "docs" / "data" / "sample" / "schedule-2026.sample.json",
        base / "docs" / "data" / "sample" / "address-register.sample.json",
    )
    agreed, cell_mismatches, street_mismatches = compare(pass_a, pass_b)
    schedule = {sector: item.streets for sector, item in agreed.items()}
    alias_payload = load_yaml(base / "etl" / "aliases.yaml")
    aliases = {item["schedule"]: item["teryt"] for item in alias_payload["aliases"]}
    data = base / "docs" / "data" / "teryt"
    register = build_register(
        city_csv=data / "ULIC_1809011_miasto_lubaczow.csv",
        gmina_csv=data / "ULIC_1809042_gmina_lubaczow.csv",
        simc_csv=data / "SIMC_1809011_1809042.csv",
        aliases=aliases,
        gmina_tables=tables,
        schedule_streets=schedule,
    )

    invalid: list[dict[str, str]] = []
    duplicates: list[str] = []
    events: list[dict[str, object]] = []
    for sector, item in sorted(agreed.items()):
        events.extend(
            _events_for(
                sector, item.rows, MIASTO_ROWS, _source_for(sources, sector), invalid, duplicates
            )
        )
    for table in tables:
        events.extend(
            _events_for(
                table.sector,
                table.rows,
                GMINA_ROWS,
                _source_for(sources, table.sector),
                invalid,
                duplicates,
            )
        )
    events.sort(key=lambda item: (str(item["zoneId"]), str(item["start"]), str(item["subtype"])))

    s2 = pass_a["miasto-s2"].rows
    s3 = pass_a["miasto-s3"].rows
    flags = []
    if s2 == s3:
        flags.append("S2_S3_identical_in_source")
    meta = {
        "flags": flags,
        "provisional": True,
        "sources": [
            {
                "doc": source["path"],
                "kind": source["kind"],
                "published_at": source["published_at"],
                "sha256": source["sha256"],
                "url": source["url"],
            }
            for source in sources
        ],
        "storage": (
            "undecided; Jakub will choose Vercel Blob, Edge Config, "
            "or Marketplace Postgres or Redis"
        ),
        "year": YEAR,
    }
    return {
        "cell_mismatches": cell_mismatches,
        "duplicates": duplicates,
        "events": events,
        "gminy": register.gminy,
        "invalid_dates": invalid,
        "localities": register.localities,
        "meta": meta,
        "register": register,
        "street_mismatches": street_mismatches,
        "streets": register.streets,
        "tables": tables,
        "zones": register.zones,
    }


def write_out(dataset: dict[str, object], directory: Path | None = None) -> None:
    target = directory or out_dir()
    target.mkdir(parents=True, exist_ok=True)
    dump_json(target / "gminy.json", dataset["gminy"])
    dump_json(target / "localities.json", dataset["localities"])
    dump_json(target / "streets.json", dataset["streets"])
    dump_json(target / "zones.json", dataset["zones"])
    dump_json(target / "events.json", dataset["events"])
    dump_json(target / "meta.json", dataset["meta"])


def main() -> None:
    try:
        dataset = build()
    except FileNotFoundError as exc:
        raise SystemExit(str(exc)) from exc
    write_out(dataset)
    register = dataset["register"]
    assert isinstance(register, Register)
    print(f"events {len(dataset['events'])}")
    print(f"city mapped {len(register.city_mapped)}")
    print(f"city unassigned {len(register.city_unassigned)}")
    print(f"schedule unmatched {len(register.schedule_unmatched)}")
    print(f"wrote {out_dir()}")


if __name__ == "__main__":
    sys.exit(main())

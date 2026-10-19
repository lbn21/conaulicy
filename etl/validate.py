"""Schema-check etl/out and write etl/review/ANOMALIES.md. Does not guess fixes."""

from __future__ import annotations

import datetime as dt
import sys
from collections import Counter
from pathlib import Path

import jsonschema

from common import (
    GMINA_ROWS,
    HOLIDAYS,
    MIASTO_ROWS,
    ROW_SLASH,
    WEEKDAYS,
    load_json,
    out_dir,
    repo_root,
    schema_path,
    zone_id,
)
from extract_gmina import GminaTable
from extract_miasto import CellMismatch, StreetMismatch
from pipeline import build, write_out
from register import Register


def _validator(definition: str) -> jsonschema.Draft202012Validator:
    schema = load_json(schema_path())
    if not isinstance(schema, dict):
        raise TypeError("schema is not an object")
    spec = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$defs": schema["$defs"],
        "$ref": f"#/$defs/{definition}",
    }
    return jsonschema.Draft202012Validator(spec)


def validate_dataset(directory: Path) -> list[str]:
    errors: list[str] = []
    files = {
        "gminy.json": "Gmina",
        "localities.json": "Locality",
        "streets.json": "Street",
        "zones.json": "Zone",
        "events.json": "Event",
        "meta.json": "Meta",
    }
    for name, definition in files.items():
        payload = load_json(directory / name)
        validator = _validator(definition)
        items = payload if isinstance(payload, list) else [payload]
        if name != "meta.json" and not isinstance(payload, list):
            errors.append(f"{name} is not an array")
            continue
        for index, item in enumerate(items):
            for error in validator.iter_errors(item):
                errors.append(f"{name}[{index}]: {error.message}")
    return errors


def _cell_dates(
    sector: str, rows: dict[str, tuple[tuple[int, ...], ...]]
) -> list[tuple[str, str, str]]:
    found = []
    for row, months in rows.items():
        for month, days in enumerate(months, start=1):
            for day in days:
                start = dt.date(2026, month, day).isoformat()
                found.append((sector, start, ROW_SLASH[row]))
    return found


def _weekday_lines(cells: list[tuple[str, str, str]]) -> list[str]:
    grouped: dict[str, list[tuple[str, str]]] = {}
    for sector, start, row in cells:
        grouped.setdefault(sector, []).append((start, row))
    lines = []
    for sector, items in sorted(grouped.items()):
        counts = Counter(WEEKDAYS[dt.date.fromisoformat(start).weekday()] for start, _ in items)
        usual = counts.most_common(1)[0][0]
        for start, row in items:
            weekday = WEEKDAYS[dt.date.fromisoformat(start).weekday()]
            if weekday != usual:
                lines.append(f"{sector} {start} ({weekday}, usual {usual}) {row}")
    return lines


def _cite(doc: str, digest: str, ref: str) -> str:
    return f"`{doc}` sha256 `{digest}` {ref}"


def render(dataset: dict[str, object]) -> str:
    root = repo_root()
    register = dataset["register"]
    assert isinstance(register, Register)
    meta = dataset["meta"]
    assert isinstance(meta, dict)
    tables = dataset["tables"]
    assert isinstance(tables, list)
    mismatches = dataset["cell_mismatches"]
    assert isinstance(mismatches, list)
    street_mismatches = dataset["street_mismatches"]
    assert isinstance(street_mismatches, list)

    def file_source(filename: str) -> dict[str, str]:
        return next(entry for entry in meta["sources"] if Path(entry["doc"]).name == filename)

    lines = [
        "# Anomalies to confirm",
        "",
        "Provisional extract. Nothing here is approved (`reviewedBy` is null).",
        "Each item cites the source file and sha256. No fix is suggested.",
        "",
        "## Coverage",
        "",
    ]
    events = dataset["events"]
    assert isinstance(events, list)
    by_zone_row: Counter[tuple[str, str]] = Counter()
    for event in events:
        ref = event["source"]["ref"]
        row = ref.split("row=")[1].split(";")[0]
        by_zone_row[(event["zoneId"], row)] += 1
    # Count dates, not exploded fractions: divide by the fraction count of the row.
    fraction_count = {
        **{row: len(parts) for row, parts in MIASTO_ROWS.items()},
        **{row: len(parts) for row, parts in GMINA_ROWS.items()},
    }
    lines.append(f"- Events (one per fraction per date): {len(events)}")
    lines.append(f"- City streets in a zone: {len(register.city_mapped)}")
    lines.append(f"- City TERYT objects in no zone: {len(register.city_unassigned)}")
    parent_villages = sum(len(names) for names in register.villages.values())
    parts = sum(1 for item in register.localities if item.get("kind") == "czesc_wsi")
    wies = sum(1 for item in register.localities if item.get("kind") == "wies")
    lines.append(
        f"- Parent settlements in a zone: {parent_villages} (localities kind wies: {wies})"
    )
    lines.append(f"- Village parts in the locality list: {parts}")
    lines.append("- Zones: 10")
    lines.append("")
    lines.append("Pickup dates (cells, before splitting fractions):")
    lines.append("")
    for sector in [f"miasto-s{n}" for n in range(1, 6)] + [f"gmina-s{n}" for n in range(1, 6)]:
        bits = []
        total = 0
        rows = MIASTO_ROWS if sector.startswith("miasto-") else GMINA_ROWS
        for row in rows:
            count = by_zone_row[(zone_id(sector), row)] // fraction_count[row]
            bits.append(f"{row} {count}")
            total += count
        lines.append(f"- `{sector}`: {total} ({', '.join(bits)})")
    lines.append("")

    lines += ["## S2 and S3 date tables", ""]
    identical = "S2_S3_identical_in_source" in meta["flags"]
    s2 = next(item for item in meta["sources"] if item["doc"].endswith("harmonogram-2026-s2.jpg"))
    s3 = next(item for item in meta["sources"] if item["doc"].endswith("harmonogram-2026-s3.jpg"))
    if identical:
        lines.append(
            "- The Pass A date tables for miasto S2 and S3 are identical, and "
            "`S2_S3_identical_in_source` is set. Street lists differ. "
            f"{_cite(s2['doc'], s2['sha256'], 'date table')} and "
            f"{_cite(s3['doc'], s3['sha256'], 'date table')}."
        )
        lines.append("- Needs Jakub's confirmation. This extract does not change either table.")
    else:
        lines.append("- Pass A date tables for S2 and S3 differ. The flag is not set.")
    lines.append("")

    lines += ["## Pass A vs Pass B", ""]
    if not mismatches and not street_mismatches:
        lines.append("- No date-cell or street-list mismatches.")
    for item in mismatches:
        assert isinstance(item, CellMismatch)
        src = file_source(f"harmonogram-2026-{item.sector.split('-')[1]}.jpg")
        lines.append(
            f"- `{item.sector}` row `{item.row}` month {item.month}: "
            f"Pass A {list(item.pass_a)} / Pass B {list(item.pass_b)}. "
            f"{_cite(src['doc'], src['sha256'], f'month={item.month};row={item.row}')}. "
            "No event was emitted for this cell."
        )
    for item in street_mismatches:
        assert isinstance(item, StreetMismatch)
        lines.append(
            f"- `{item.sector}` street list: only Pass A {list(item.only_a)}; "
            f"only Pass B {list(item.only_b)}. Disputed names were not assigned."
        )
    lines.append("")

    real = [item for item in register.city_unassigned if item["cecha"] not in {"rondo", "skwer"}]
    irrelevant = [item for item in register.city_unassigned if item["cecha"] in {"rondo", "skwer"}]
    city_doc = next(
        item for item in meta["sources"] if item["doc"].endswith("ULIC_1809011_miasto_lubaczow.csv")
    )
    lines += ["## City streets in no sector", ""]
    lines.append(
        "TERYT city objects that are not members of any waste zone. "
        "No sector was guessed. Schedule spellings with no TERYT hit are listed "
        "below and are not linked to these rows."
    )
    lines.append("")
    for item in real:
        lines.append(
            f"- {item['prefix']} {item['name']} (SYM_UL {item['sym_ul']}). "
            f"{_cite(city_doc['doc'], city_doc['sha256'], 'ULIC row')}."
        )
    lines += ["", "## Roundabouts and the square", ""]
    lines.append("Listed separately. They are not missing residential streets.")
    lines.append("")
    for item in irrelevant:
        lines.append(
            f"- {item['prefix']} {item['name']} (SYM_UL {item['sym_ul']}). "
            f"{_cite(city_doc['doc'], city_doc['sha256'], 'ULIC row')}."
        )
    lines.append("")

    lines += ["## Schedule names with no single TERYT match", ""]
    if not register.schedule_unmatched:
        lines.append("- Every agreed schedule street name matched one TERYT row.")
    for item in register.schedule_unmatched:
        src_name = f"harmonogram-2026-{item['sector'].split('-')[1]}.jpg"
        src = next(entry for entry in meta["sources"] if Path(entry["doc"]).name == src_name)
        lines.append(
            f"- `{item['source_name']}` in `{item['sector']}` matched {item['hits']} TERYT rows "
            "after normalisation and aliases. Not assigned. "
            f"{_cite(src['doc'], src['sha256'], 'street list')}."
        )
    lines.append("")

    lines += ["## TERYT streets in two sectors", ""]
    if not register.streets_in_two_sectors:
        lines.append("- None. No TERYT street was left in two zones.")
    for item in register.streets_in_two_sectors:
        lines.append(
            f"- SYM_UL {item['sym_ul']} ({item['source_name']}) appears in {item['sectors']}. "
            "Not assigned to either zone."
        )
    lines.append("")

    cells: list[tuple[str, str, str]] = []
    for table in tables:
        assert isinstance(table, GminaTable)
        cells.extend(_cell_dates(table.sector, table.rows))
    # Weekday check uses Pass A tables (the image reading), including cells that
    # disagreed with Pass B. Those cells are already listed above and have no event.
    from extract_miasto import load_pass_a

    for sector, item in sorted(load_pass_a(root / "etl" / "out" / "miasto").items()):
        cells.extend(_cell_dates(sector, item.rows))
    produced = _weekday_lines(cells)
    sample_path = root / "docs" / "data" / "sample" / "weekday-anomalies.txt"
    sample = [line for line in sample_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    lines += ["## Weekday anomalies", ""]
    lines.append(
        "A date whose weekday is not the sector's modal weekday. "
        "Holidays checked: 01.01, 06.01, 06.04, 01.05, 04.06, 15.08, 01.11, 11.11, 24–26.12.2026."
    )
    lines.append("")
    for line in produced:
        date = line.split()[1]
        mark = (
            "coincides with a listed 2026 holiday" if date in HOLIDAYS else "not a listed holiday"
        )
        sector = line.split()[0]
        src = next(
            entry
            for entry in meta["sources"]
            if (
                sector.startswith("miasto")
                and Path(entry["doc"]).name == f"harmonogram-2026-{sector.split('-')[1]}.jpg"
            )
            or (sector.startswith("gmina") and Path(entry["doc"]).name.startswith(f"{sector[-1]}_"))
        )
        lines.append(f"- {line}. {mark}. {_cite(src['doc'], src['sha256'], 'date cell')}.")
    extra = sorted(set(produced) - set(sample))
    missing = sorted(set(sample) - set(produced))
    lines.append("")
    if not extra and not missing:
        lines.append(
            f"- The list matches `{sample_path.relative_to(root)}` ({len(produced)} lines)."
        )
    else:
        lines.append(f"- Difference from `{sample_path.relative_to(root)}`:")
        for line in extra:
            lines.append(f"  - only in this extract: {line}")
        for line in missing:
            lines.append(f"  - only in the seed file: {line}")
    lines.append("")

    lines += ["## Duplicate dates and dates outside 2026", ""]
    duplicates = dataset["duplicates"]
    invalid = dataset["invalid_dates"]
    assert isinstance(duplicates, list) and isinstance(invalid, list)
    if not duplicates:
        lines.append(
            "- No duplicate date inside a cell, and no duplicate zone/fraction/date event."
        )
    for item in duplicates:
        lines.append(f"- Duplicate: {item}.")
    if not invalid:
        lines.append("- No date outside 2026 and no impossible calendar day.")
    for item in invalid:
        lines.append(f"- Invalid date: {item}. Not emitted.")
    lines.append("")

    lines += ["## Gmina column 1", ""]
    g1 = next(
        item
        for item in meta["sources"]
        if item["doc"].endswith("1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf")
    )
    lines.append(
        "- The PDF header is `ODPADY KOMUNALNE ZMIESZANE I BIO` with one day list. "
        "This extract emits both `zmieszane` and `bio` on every date in that column, "
        "which is what the header says, and it is not confirmed. "
        f"{_cite(g1['doc'], g1['sha256'], 'column 1 header')}."
    )
    lines.append("")
    lines += ["## Villages read from the PDFs", ""]
    for table in tables:
        assert isinstance(table, GminaTable)
        src = file_source(Path(table.doc).name)
        names = ", ".join(register.villages[table.sector])
        lines.append(
            f"- `{table.sector}`: {names}. {_cite(src['doc'], src['sha256'], 'left column')}."
        )
    lines.append("")
    lines.append("Młodów is in the S3 PDF. It is not in the S3 file name.")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    root = repo_root()
    dataset = build(root)
    directory = out_dir()
    write_out(dataset, directory)
    errors = validate_dataset(directory)
    report = render(dataset)
    path = root / "etl" / "review" / "ANOMALIES.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(report, encoding="utf-8")
    print(f"wrote {path}")
    if errors:
        print("\n".join(errors[:30]))
        raise SystemExit(1)


if __name__ == "__main__":
    sys.exit(main())

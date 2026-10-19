"""Compare the vision pass (Pass A) with the seed transcription (Pass B).

Pass A is a local file under etl/out/miasto/. It is extracted data, so it is not
in git. Pass B is docs/data/sample/schedule-2026.sample.json. A cell that
differs is reported and is not turned into an event.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from common import MIASTO_ROWS, load_json

PASS_A_ROWS = tuple(MIASTO_ROWS)
FRACTION_TO_ROW = {frozenset(fractions): row for row, fractions in MIASTO_ROWS.items()}


@dataclass(frozen=True)
class CellMismatch:
    sector: str
    row: str
    month: int
    pass_a: tuple[int, ...]
    pass_b: tuple[int, ...]


@dataclass(frozen=True)
class StreetMismatch:
    sector: str
    only_a: tuple[str, ...]
    only_b: tuple[str, ...]


@dataclass(frozen=True)
class MiastoPass:
    sector: str
    streets: tuple[str, ...]
    rows: dict[str, tuple[tuple[int, ...], ...]]


def load_pass_a(directory: Path) -> dict[str, MiastoPass]:
    found: dict[str, MiastoPass] = {}
    paths = sorted(directory.glob("miasto-s*-2026.pass-a.json"))
    if len(paths) != 5:
        raise FileNotFoundError(
            f"Expected 5 Pass A files in {directory} "
            "(local vision transcription, not stored in git)"
        )
    for path in paths:
        payload = load_json(path)
        if not isinstance(payload, dict):
            raise TypeError(f"{path} is not an object")
        sector = str(payload["sector"])
        rows = {
            row: tuple(tuple(int(day) for day in days) for days in payload["rows"][row])
            for row in PASS_A_ROWS
        }
        for row, months in rows.items():
            if len(months) != 12:
                raise ValueError(f"{path} row {row} does not have 12 months")
        streets = tuple(str(name).strip() for name in payload["streets"] if str(name).strip())
        found[sector] = MiastoPass(sector=sector, streets=streets, rows=rows)
    return found


def pass_b_from_sample(sample_path: Path, register_path: Path) -> dict[str, MiastoPass]:
    sample = load_json(sample_path)
    register = load_json(register_path)
    if not isinstance(sample, dict) or not isinstance(register, dict):
        raise TypeError("sample JSON is not an object")
    buckets: dict[str, dict[str, list[list[int]]]] = {}
    for event in sample["events"]:
        sector = event["sector"]
        if not str(sector).startswith("miasto-"):
            continue
        row = FRACTION_TO_ROW[frozenset(event["fractions"])]
        month = int(event["date"][5:7])
        day = int(event["date"][8:10])
        sector_rows = buckets.setdefault(
            sector, {name: [[] for _ in range(12)] for name in PASS_A_ROWS}
        )
        sector_rows[row][month - 1].append(day)
    streets: dict[str, list[str]] = {}
    for street in register["streets"]:
        if str(street["sector"]).startswith("miasto-"):
            streets.setdefault(street["sector"], []).append(street["source_name"])
    parsed: dict[str, MiastoPass] = {}
    for sector, rows in buckets.items():
        frozen = {
            row: tuple(tuple(sorted(set(days))) for days in months) for row, months in rows.items()
        }
        parsed[sector] = MiastoPass(
            sector=sector,
            streets=tuple(streets.get(sector, ())),
            rows=frozen,
        )
    return parsed


def compare(
    pass_a: dict[str, MiastoPass], pass_b: dict[str, MiastoPass]
) -> tuple[dict[str, MiastoPass], list[CellMismatch], list[StreetMismatch]]:
    agreed: dict[str, MiastoPass] = {}
    cells: list[CellMismatch] = []
    streets: list[StreetMismatch] = []
    for sector in sorted(set(pass_a) | set(pass_b)):
        left = pass_a[sector]
        right = pass_b[sector]
        rows: dict[str, tuple[tuple[int, ...], ...]] = {}
        for row in PASS_A_ROWS:
            months = []
            for month in range(1, 13):
                days_a = tuple(sorted(left.rows[row][month - 1]))
                days_b = tuple(sorted(right.rows[row][month - 1]))
                if days_a == days_b:
                    months.append(days_a)
                else:
                    cells.append(CellMismatch(sector, row, month, days_a, days_b))
                    months.append(())
            rows[row] = tuple(months)
        only_a = tuple(sorted(set(left.streets) - set(right.streets)))
        only_b = tuple(sorted(set(right.streets) - set(left.streets)))
        if only_a or only_b:
            streets.append(StreetMismatch(sector, only_a, only_b))
        agreed_streets = tuple(name for name in left.streets if name in set(right.streets))
        agreed[sector] = MiastoPass(sector=sector, streets=agreed_streets, rows=rows)
    return agreed, cells, streets

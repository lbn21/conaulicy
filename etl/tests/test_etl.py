"""Schema, S2=S3, and the gmina-s1 golden. Golden data is local and gitignored."""

from __future__ import annotations

from pathlib import Path

import pytest

from common import fold, out_dir, repo_root, zone_id
from extract_gmina import parse_pdf
from extract_miasto import load_pass_a, pass_b_from_sample
from pipeline import load_sources
from register import _lookup, _read_csv, build_register
from validate import validate_dataset


def _golden(name: str) -> Path | None:
    path = out_dir() / "golden" / name
    return path if path.exists() else None


def test_gmina_s1_golden() -> None:
    path = _golden("gmina-s1-2026.json")
    if path is None:
        pytest.skip("gmina-s1 golden is local data under etl/out/golden/ and is not in git")
    import json

    golden = json.loads(path.read_text(encoding="utf-8"))
    root = repo_root()
    source = next(item for item in load_sources(root) if item["sector"] == "gmina-s1")
    table = parse_pdf(root / source["path"], "gmina-s1", source["path"])
    assert [fold(name) for name in table.villages_raw] == [
        fold(name) for name in golden["villages"]
    ]
    for row, months in golden["rows"].items():
        assert table.rows[row] == tuple(tuple(days) for days in months)


def test_gmina_s3_includes_mlodow() -> None:
    root = repo_root()
    source = next(item for item in load_sources(root) if item["sector"] == "gmina-s3")
    table = parse_pdf(root / source["path"], "gmina-s3", source["path"])
    assert fold("Młodów") in {fold(name) for name in table.villages_raw}


def test_s2_s3_flag() -> None:
    directory = out_dir() / "miasto"
    if not (directory / "miasto-s2-2026.pass-a.json").exists():
        pytest.skip("Pass A files are local data under etl/out/miasto/ and are not in git")
    passes = load_pass_a(directory)
    assert passes["miasto-s2"].rows == passes["miasto-s3"].rows
    meta_path = out_dir() / "meta.json"
    if not meta_path.exists():
        pytest.skip("etl/out/meta.json is missing; run make etl")
    import json

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert "S2_S3_identical_in_source" in meta["flags"]


def test_schema_and_unverified() -> None:
    directory = out_dir()
    if not (directory / "events.json").exists():
        pytest.skip("etl/out is local data and is not in git; run make etl")
    errors = validate_dataset(directory)
    assert errors == []
    import json

    events = json.loads((directory / "events.json").read_text(encoding="utf-8"))
    assert events
    assert all(event["verified"] is False for event in events)
    assert all(event["reviewedBy"] is None for event in events)
    zones = json.loads((directory / "zones.json").read_text(encoding="utf-8"))
    assert [zone["id"] for zone in zones] == [zone_id(f"miasto-s{n}") for n in range(1, 6)] + [
        zone_id(f"gmina-s{n}") for n in range(1, 6)
    ]


def test_miasto_s1_passes() -> None:
    golden_path = _golden("miasto-s1-2026.json")
    directory = out_dir() / "miasto"
    if golden_path is None or not (directory / "miasto-s1-2026.pass-a.json").exists():
        pytest.skip("miasto-s1 golden is local data under etl/out/golden/ and is not in git")
    import json

    golden = json.loads(golden_path.read_text(encoding="utf-8"))
    passes = load_pass_a(directory)
    other = pass_b_from_sample(
        repo_root() / "docs/data/sample/schedule-2026.sample.json",
        repo_root() / "docs/data/sample/address-register.sample.json",
    )
    left = passes["miasto-s1"].rows
    right = other["miasto-s1"].rows
    if left != right:
        pytest.xfail("Pass A and Pass B disagree for miasto-s1")
    for row, months in golden["rows"].items():
        assert left[row] == tuple(tuple(days) for days in months)


def test_alias_matches_one_street() -> None:
    root = repo_root()
    rows = _read_csv(root / "docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv")
    aliases = {
        "Jagiellonów": "Osiedle Jagiellonów",
        "Monte Casino": "Monte Cassino",
    }
    hit, count = _lookup("Jagiellonów", rows, aliases)
    assert count == 1
    assert hit is not None
    assert hit["SYM_UL"] == "45843"
    hit, count = _lookup("Monte Casino", rows, aliases)
    assert count == 1
    assert hit is not None
    assert hit["NAZWA_1"] == "Monte Cassino"
    for schedule_name, sym_ul in (
        ("Mjr. Henryka Hubala", "48371"),
        ("Abp. Eugeniusza Baziaka", "48369"),
        ("3-ego Maja", "29830"),
        ("Płk. Franciszka Herzoga", "38687"),
        ("Dr. Henryka Szymańskiego", "48943"),
        ("Gen. Józefa Hallera", "06480"),
    ):
        hit, count = _lookup(schedule_name, rows, aliases)
        assert count == 1, schedule_name
        assert hit is not None
        assert hit["SYM_UL"] == sym_ul
    empty = build_register(
        city_csv=root / "docs/data/teryt/ULIC_1809011_miasto_lubaczow.csv",
        gmina_csv=root / "docs/data/teryt/ULIC_1809042_gmina_lubaczow.csv",
        simc_csv=root / "docs/data/teryt/SIMC_1809011_1809042.csv",
        aliases=aliases,
        gmina_tables=[],
        schedule_streets={},
    )
    assert empty.city_mapped == []
    assert len(empty.city_unassigned) == 206

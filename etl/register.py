"""Map TERYT ULIC and SIMC rows onto waste zones. Never guess a sector."""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path

from common import fold, normalise_name, zone_id
from extract_gmina import GminaTable


@dataclass
class Register:
    gminy: list[dict[str, str]]
    localities: list[dict[str, object]]
    streets: list[dict[str, object]]
    zones: list[dict[str, object]]
    city_mapped: list[dict[str, str]]
    city_unassigned: list[dict[str, str]]
    schedule_unmatched: list[dict[str, str]]
    streets_in_two_sectors: list[dict[str, str]]
    villages: dict[str, list[str]] = field(default_factory=dict)


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter=";"))


def _street_name(row: dict[str, str]) -> str:
    return " ".join(part.strip() for part in (row["NAZWA_2"], row["NAZWA_1"]) if part.strip())


def _locality_id(sym: str) -> str:
    return f"simc-{sym}"


def _street_id(sym: str, sym_ul: str) -> str:
    return f"ulic-{sym}-{sym_ul}"


def _row_keys(row: dict[str, str]) -> tuple[str, str]:
    full = normalise_name(f"{row['NAZWA_2']} {row['NAZWA_1']}")
    nazwa_1 = normalise_name(row["NAZWA_1"])
    return full, nazwa_1


def _lookup(
    name: str, rows: list[dict[str, str]], aliases: dict[str, str]
) -> tuple[dict[str, str] | None, int]:
    key = normalise_name(aliases.get(name, name))
    exact: dict[str, dict[str, str]] = {}
    suffix: dict[str, dict[str, str]] = {}
    for row in rows:
        full, nazwa_1 = _row_keys(row)
        if key and (key == full or key == nazwa_1):
            exact[row["SYM_UL"]] = row
        elif nazwa_1 and key.endswith(" " + nazwa_1):
            suffix[row["SYM_UL"]] = row
    chosen = exact if exact else suffix
    if len(chosen) == 1:
        return next(iter(chosen.values())), 1
    return None, len(chosen)


def _match_village(raw: str, simc: list[dict[str, str]]) -> dict[str, str]:
    key = fold(raw)
    hits = [row for row in simc if row["GMI"] == "04" and fold(row["NAZWA"]) == key]
    parents = [row for row in hits if row["SYM"] == row["SYMPOD"]]
    pool = parents or hits
    if len(pool) != 1:
        raise ValueError(f"PDF place {raw!r} matched {len(pool)} SIMC rows")
    return pool[0]


def _kind(row: dict[str, str]) -> str | None:
    if row["RM"] == "99":
        return None
    if row["RM"] == "96":
        return "miasto"
    if row["SYM"] == row["SYMPOD"]:
        return "wies"
    if row["RM"] in {"00", "03"}:
        return "czesc_wsi"
    return None


def build_register(
    *,
    city_csv: Path,
    gmina_csv: Path,
    simc_csv: Path,
    aliases: dict[str, str],
    gmina_tables: list[GminaTable],
    schedule_streets: dict[str, tuple[str, ...]],
) -> Register:
    city_rows = _read_csv(city_csv)
    gmina_rows = _read_csv(gmina_csv)
    simc = _read_csv(simc_csv)
    gminy = [
        {"id": "lubaczow-miasto", "name": "Lubaczów (miasto)", "teryt": "1809011"},
        {"id": "lubaczow-gmina", "name": "Lubaczów (gmina)", "teryt": "1809042"},
    ]
    localities: list[dict[str, object]] = []
    for row in simc:
        kind = _kind(row)
        if kind is None:
            continue
        gmina_id = "lubaczow-miasto" if row["GMI"] == "01" else "lubaczow-gmina"
        item: dict[str, object] = {
            "gminaId": gmina_id,
            "id": _locality_id(row["SYM"]),
            "kind": kind,
            "name": row["NAZWA"],
            "teryt": row["SYM"],
        }
        if row["SYM"] != row["SYMPOD"]:
            item["parentId"] = _locality_id(row["SYMPOD"])
        localities.append(item)

    village_sector: dict[str, str] = {}
    villages: dict[str, list[str]] = {}
    for table in gmina_tables:
        names: list[str] = []
        for raw in table.villages_raw:
            matched = _match_village(raw, simc)
            village_sector[matched["SYM"]] = table.sector
            names.append(matched["NAZWA"])
        villages[table.sector] = names

    part_sector: dict[str, str] = {}
    for row in simc:
        if row["GMI"] != "04" or row["SYM"] == row["SYMPOD"]:
            continue
        parent = village_sector.get(row["SYMPOD"])
        if parent:
            part_sector[row["SYM"]] = parent

    members: dict[str, list[dict[str, str]]] = {}
    for sym, sector in village_sector.items():
        members.setdefault(zone_id(sector), []).append({"localityId": _locality_id(sym)})
    for sym, sector in part_sector.items():
        members.setdefault(zone_id(sector), []).append({"localityId": _locality_id(sym)})

    schedule_unmatched: list[dict[str, str]] = []
    assigned: dict[str, tuple[str, str, dict[str, str]]] = {}
    streets_in_two_sectors: list[dict[str, str]] = []
    for sector, names in sorted(schedule_streets.items()):
        for name in names:
            hit, count = _lookup(name, city_rows, aliases)
            if hit is None:
                schedule_unmatched.append(
                    {"hits": str(count), "sector": sector, "source_name": name}
                )
                continue
            previous = assigned.get(hit["SYM_UL"])
            if previous and previous[0] != sector:
                streets_in_two_sectors.append(
                    {
                        "sectors": f"{previous[0]},{sector}",
                        "source_name": name,
                        "sym_ul": hit["SYM_UL"],
                    }
                )
                assigned.pop(hit["SYM_UL"], None)
                continue
            assigned[hit["SYM_UL"]] = (sector, name, hit)

    city_mapped: list[dict[str, str]] = []
    for sym_ul, (sector, name, hit) in sorted(assigned.items()):
        city_mapped.append({"sector": sector, "source_name": name, "sym_ul": sym_ul})
        members.setdefault(zone_id(sector), []).append(
            {
                "localityId": _locality_id(hit["SYM"]),
                "streetId": _street_id(hit["SYM"], hit["SYM_UL"]),
            }
        )

    blocked = {item["sym_ul"] for item in streets_in_two_sectors}
    city_unassigned = []
    street_records: list[dict[str, object]] = []
    for row in city_rows:
        record: dict[str, object] = {
            "id": _street_id(row["SYM"], row["SYM_UL"]),
            "localityId": _locality_id(row["SYM"]),
            "name": _street_name(row),
            "prefix": row["CECHA"],
            "teryt": row["SYM_UL"],
        }
        street_records.append(record)
        if row["SYM_UL"] in assigned and row["SYM_UL"] not in blocked:
            continue
        city_unassigned.append(
            {
                "cecha": row["CECHA"],
                "name": _street_name(row),
                "prefix": row["CECHA"],
                "sym_ul": row["SYM_UL"],
            }
        )

    for row in gmina_rows:
        street_records.append(
            {
                "id": _street_id(row["SYM"], row["SYM_UL"]),
                "localityId": _locality_id(row["SYM"]),
                "name": _street_name(row),
                "prefix": row["CECHA"],
                "teryt": row["SYM_UL"],
            }
        )
        sector = village_sector.get(row["SYM"]) or part_sector.get(row["SYM"])
        if sector:
            members.setdefault(zone_id(sector), []).append(
                {
                    "localityId": _locality_id(row["SYM"]),
                    "streetId": _street_id(row["SYM"], row["SYM_UL"]),
                }
            )

    zones = []
    titles = [f"miasto-s{n}" for n in range(1, 6)] + [f"gmina-s{n}" for n in range(1, 6)]
    for sector in titles:
        place = "Miasto Lubaczów" if sector.startswith("miasto-") else "Gmina Lubaczów"
        number = sector[-1]
        key = zone_id(sector)
        zone_members = sorted(
            members.get(key, []),
            key=lambda item: (item["localityId"], item.get("streetId", "")),
        )
        zones.append(
            {
                "id": key,
                "members": zone_members,
                "name": f"{place}, sektor {number}",
                "type": "waste",
            }
        )

    localities.sort(key=lambda item: str(item["id"]))
    street_records.sort(key=lambda item: str(item["id"]))
    return Register(
        gminy=gminy,
        localities=localities,
        streets=street_records,
        zones=zones,
        city_mapped=city_mapped,
        city_unassigned=city_unassigned,
        schedule_unmatched=schedule_unmatched,
        streets_in_two_sectors=streets_in_two_sectors,
        villages=villages,
    )

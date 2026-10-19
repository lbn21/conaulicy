"""Shared paths, hashing, and the waste-row vocabulary."""

from __future__ import annotations

import hashlib
import json
import unicodedata
from pathlib import Path

import yaml

YEAR = 2026
PREFIXES = (
    "gen",
    "ks",
    "mjr",
    "rtm",
    "plk",
    "kard",
    "abp",
    "prof",
    "dr",
    "het",
    "sw",
    "ksiecia",
    "wojewody",
)
HOLIDAYS = {
    "2026-01-01",
    "2026-01-06",
    "2026-04-06",
    "2026-05-01",
    "2026-06-04",
    "2026-08-15",
    "2026-11-01",
    "2026-11-11",
    "2026-12-24",
    "2026-12-25",
    "2026-12-26",
}
WEEKDAYS = ("pon", "wt", "śr", "czw", "pt", "sob", "ndz")
LABELS = {
    "zmieszane": "Zmieszane",
    "popiol": "Popiół",
    "bio": "Bio",
    "papier": "Papier",
    "tworzywa_metale": "Tworzywa sztuczne i metale",
    "szklo": "Szkło",
    "wielkogabarytowe": "Wielkogabarytowe",
    "elektro": "Elektryczne i elektroniczne",
    "opony": "Zużyte opony",
    "tekstylia": "Odzież i tekstylia",
}
MIASTO_ROWS = {
    "zmieszane+popiol": ("zmieszane", "popiol"),
    "papier+tworzywa_metale+szklo": ("papier", "tworzywa_metale", "szklo"),
    "bio": ("bio",),
    "wielkogabarytowe+elektro+opony+tekstylia": (
        "wielkogabarytowe",
        "elektro",
        "opony",
        "tekstylia",
    ),
}
GMINA_ROWS = {
    "zmieszane+bio": ("zmieszane", "bio"),
    "selektywne": ("tworzywa_metale", "papier", "szklo"),
    "wielkogabarytowe": ("wielkogabarytowe",),
}
ROW_SLASH = {
    "zmieszane+popiol": "zmieszane/popiol",
    "papier+tworzywa_metale+szklo": "papier/tworzywa_metale/szklo",
    "bio": "bio",
    "wielkogabarytowe+elektro+opony+tekstylia": "wielkogabarytowe/elektro/opony/tekstylia",
    "zmieszane+bio": "zmieszane/bio",
    "selektywne": "tworzywa_metale/papier/szklo",
    "wielkogabarytowe": "wielkogabarytowe",
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def etl_dir() -> Path:
    return repo_root() / "etl"


def out_dir() -> Path:
    return etl_dir() / "out"


def schema_path() -> Path:
    return repo_root() / "schema" / "dataset.schema.json"


def dump_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    path.write_text(text, encoding="utf-8")


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def load_yaml(path: Path) -> object:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 16), b""):
            digest.update(chunk)
    return digest.hexdigest()


def event_id(zone_id: str, subtype: str, start: str) -> str:
    raw = f"{zone_id}|{subtype}|{start}".encode()
    return hashlib.sha256(raw).hexdigest()


def fold(value: str) -> str:
    text = value.replace("ł", "l").replace("Ł", "L")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    cleaned = []
    for char in text.lower():
        cleaned.append(char if char.isalnum() else " ")
    return " ".join("".join(cleaned).split())


def strip_prefixes(value: str) -> str:
    parts = fold(value).split()
    while parts and parts[0] in PREFIXES:
        parts = parts[1:]
    return " ".join(parts)


def zone_id(sector: str) -> str:
    return f"waste:{sector}"

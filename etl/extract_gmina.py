"""Deterministic pdftotext -layout parser for the five Gmina Lubaczów PDFs."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

MONTHS = (
    "STYCZEŃ",
    "LUTY",
    "MARZEC",
    "KWIECIEŃ",
    "MAJ",
    "CZERWIEC",
    "LIPIEC",
    "SIERPIEŃ",
    "WRZESIEŃ",
    "PAŹDZIERNIK",
    "LISTOPAD",
    "GRUDZIEŃ",
)
MONTH_RE = re.compile(r"\b(?:" + "|".join(MONTHS) + r")\b")
DATE_RE = re.compile(r"(?<![\d,])(?:\d{1,2}(?:,\d{1,2})*|-)(?![\d,])")
ROW_NAMES = ("zmieszane+bio", "selektywne", "wielkogabarytowe")


@dataclass(frozen=True)
class GminaTable:
    sector: str
    doc: str
    villages_raw: tuple[str, ...]
    rows: dict[str, tuple[tuple[int, ...], ...]]


def pdftotext(path: Path) -> str:
    return subprocess.check_output(["pdftotext", "-layout", str(path), "-"], text=True)


def _days(token: str) -> tuple[int, ...]:
    if token == "-":
        return ()
    return tuple(int(part) for part in token.split(","))


def parse_layout(text: str, sector: str, doc: str) -> GminaTable:
    lines = text.splitlines()
    start = next(
        index for index, line in enumerate(lines) if "MIEJSCOWOŚCI" in line and "MIESIĄC" in line
    )
    fragments: list[str] = []
    found: dict[str, list[str]] = {}
    for line in lines[start + 1 :]:
        if "WSZYSTKIE" in line:
            break
        match = MONTH_RE.search(line)
        if match is None:
            if line.strip():
                fragments.append(line.strip())
            continue
        left = line[: match.start()].strip()
        if left:
            fragments.append(left)
        tokens = DATE_RE.findall(line[match.end() :])
        if len(tokens) != 3:
            raise ValueError(f"{doc}: {match.group()} has {len(tokens)} date columns, expected 3")
        found[match.group()] = tokens
    missing = [name for name in MONTHS if name not in found]
    if missing:
        raise ValueError(f"{doc}: missing months {missing}")
    villages = tuple(part.strip() for part in " ".join(fragments).split(",") if part.strip())
    rows = {
        ROW_NAMES[column]: tuple(_days(found[month][column]) for month in MONTHS)
        for column in range(3)
    }
    return GminaTable(sector=sector, doc=doc, villages_raw=villages, rows=rows)


def parse_pdf(path: Path, sector: str, doc: str | None = None) -> GminaTable:
    return parse_layout(pdftotext(path), sector, doc or path.name)

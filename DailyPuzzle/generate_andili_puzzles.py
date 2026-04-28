#!/usr/bin/env python3
"""
Erzeugt andili-puzzles.json für Schachandili Training V8 aus der offiziellen
Lichess Puzzle Database.

Datenquelle: https://database.lichess.org/lichess_db_puzzle.csv.zst
Ausgabeformat: passend zu Schachandili-Training_v8.html
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import heapq
import io
import json
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Dict, Iterable, List, Tuple

try:
    import zstandard as zstd
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Das Python-Paket 'zstandard' fehlt. Installiere es mit: python -m pip install zstandard"
    ) from exc

LICHESS_PUZZLE_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"

LEVELS = {
    "easy": {
        "label": "Leicht",
        "rating_min": 800,
        "rating_max": 1199,
    },
    "medium": {
        "label": "Mittel",
        "rating_min": 1200,
        "rating_max": 1599,
    },
    "hard": {
        "label": "Schwer",
        "rating_min": 1600,
        "rating_max": 2099,
    },
}

EXCLUDED_THEMES = {
    # Die V8 akzeptiert aktuell exakt einen Lösungszug. Bei mateIn1 kann es laut
    # Lichess mehrere korrekte Mattzüge geben; daher vermeiden wir diese Aufgaben.
    "mateIn1",
    # Zu lange Aufgaben sind auf kleinen Mobilbildschirmen unkomfortabel.
    "veryLong",
}


@dataclass(frozen=True)
class Candidate:
    puzzle_id: str
    fen: str
    pre_move: str
    solution: Tuple[str, ...]
    rating: int
    rating_deviation: int
    popularity: int
    nb_plays: int
    themes: Tuple[str, ...]
    game_url: str
    opening_tags: Tuple[str, ...]


def stable_int(text: str) -> int:
    """Deterministische 64-Bit-Zahl aus Text."""
    digest = hashlib.blake2b(text.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big", signed=False)


def parse_int(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def open_zst_text(source: str) -> io.TextIOWrapper:
    """Öffnet eine lokale oder entfernte .zst-Datei als Textstream."""
    if source.startswith("http://") or source.startswith("https://"):
        request = urllib.request.Request(
            source,
            headers={
                "User-Agent": "Andili-Schachtraining-Puzzle-Generator/1.0 (+https://www.andili.de/)"
            },
        )
        raw: BinaryIO = urllib.request.urlopen(request, timeout=120)  # noqa: S310 - bewusstes Download-Ziel
    else:
        raw = Path(source).open("rb")

    dctx = zstd.ZstdDecompressor()
    reader = dctx.stream_reader(raw)
    return io.TextIOWrapper(reader, encoding="utf-8", newline="")


def candidate_from_row(row: Dict[str, str], max_solution_moves: int) -> Candidate | None:
    puzzle_id = row.get("PuzzleId", "").strip()
    fen = row.get("FEN", "").strip()
    moves = row.get("Moves", "").split()
    if not puzzle_id or not fen or len(moves) < 2:
        return None

    solution = tuple(moves[1:])
    if len(solution) < 1 or len(solution) > max_solution_moves:
        return None

    rating = parse_int(row.get("Rating", ""))
    rating_deviation = parse_int(row.get("RatingDeviation", ""), default=9999)
    popularity = parse_int(row.get("Popularity", ""), default=-100)
    nb_plays = parse_int(row.get("NbPlays", ""), default=0)
    themes = tuple(t for t in row.get("Themes", "").split() if t)

    if EXCLUDED_THEMES.intersection(themes):
        return None

    return Candidate(
        puzzle_id=puzzle_id,
        fen=fen,
        pre_move=moves[0],
        solution=solution,
        rating=rating,
        rating_deviation=rating_deviation,
        popularity=popularity,
        nb_plays=nb_plays,
        themes=themes,
        game_url=row.get("GameUrl", "").strip(),
        opening_tags=tuple(t for t in row.get("OpeningTags", "").split() if t),
    )


def level_for_rating(rating: int) -> str | None:
    for level, cfg in LEVELS.items():
        if cfg["rating_min"] <= rating <= cfg["rating_max"]:
            return level
    return None


def add_to_pool(
    pools: Dict[str, List[Tuple[int, int, Candidate]]],
    level: str,
    candidate: Candidate,
    max_pool_size: int,
    sequence: int,
    pool_seed: str,
) -> None:
    # Wir behalten deterministisch die Kandidaten mit den kleinsten Hashwerten.
    # Im Heap speichern wir negative Werte, damit heapq effektiv als Max-Heap dient.
    score = stable_int(f"{pool_seed}|pool|{level}|{candidate.puzzle_id}")
    heap = pools[level]
    item = (-score, sequence, candidate)
    if len(heap) < max_pool_size:
        heapq.heappush(heap, item)
    elif item > heap[0]:
        heapq.heapreplace(heap, item)


def collect_candidates(
    source: str,
    needed_per_level: int,
    pool_multiplier: int,
    min_popularity: int,
    max_rating_deviation: int,
    min_plays: int,
    max_solution_moves: int,
    pool_seed: str,
) -> Dict[str, List[Candidate]]:
    max_pool_size = max(needed_per_level * pool_multiplier, needed_per_level + 50)
    pools: Dict[str, List[Tuple[int, int, Candidate]]] = {level: [] for level in LEVELS}
    counts_seen = {level: 0 for level in LEVELS}
    counts_kept = {level: 0 for level in LEVELS}
    sequence = 0

    print(f"Lade und filtere Lichess-Puzzles aus: {source}", file=sys.stderr)
    with open_zst_text(source) as text_stream:
        reader = csv.DictReader(text_stream)
        required = {
            "PuzzleId",
            "FEN",
            "Moves",
            "Rating",
            "RatingDeviation",
            "Popularity",
            "NbPlays",
            "Themes",
            "GameUrl",
            "OpeningTags",
        }
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"CSV-Spalten fehlen: {', '.join(sorted(missing))}")

        for row in reader:
            candidate = candidate_from_row(row, max_solution_moves=max_solution_moves)
            if candidate is None:
                continue

            level = level_for_rating(candidate.rating)
            if level is None:
                continue
            counts_seen[level] += 1

            if candidate.popularity < min_popularity:
                continue
            if candidate.rating_deviation > max_rating_deviation:
                continue
            if candidate.nb_plays < min_plays:
                continue

            add_to_pool(pools, level, candidate, max_pool_size, sequence, pool_seed)
            counts_kept[level] += 1
            sequence += 1

    result: Dict[str, List[Candidate]] = {}
    for level, heap in pools.items():
        candidates = [item[2] for item in heap]
        if len(candidates) < needed_per_level:
            raise SystemExit(
                f"Zu wenige Kandidaten für {level}: {len(candidates)} vorhanden, "
                f"{needed_per_level} benötigt. Filter lockern. Gesehen: {counts_seen[level]}, "
                f"nach Qualitätsfiltern: {counts_kept[level]}"
            )
        result[level] = candidates
        print(
            f"{level}: {len(candidates)} Kandidaten im Pool "
            f"(gesehen {counts_seen[level]}, Qualitätsfilter {counts_kept[level]})",
            file=sys.stderr,
        )
    return result


def make_dates(today: dt.date, days_back: int, days_ahead: int) -> List[dt.date]:
    start = today - dt.timedelta(days=days_back)
    total = days_back + days_ahead + 1
    return [start + dt.timedelta(days=i) for i in range(total)]


def choose_for_date(
    candidates: List[Candidate],
    used_ids: set[str],
    date_iso: str,
    level: str,
    assignment_seed: str,
) -> Candidate:
    best: Tuple[int, Candidate] | None = None
    for cand in candidates:
        if cand.puzzle_id in used_ids:
            continue
        score = stable_int(f"{assignment_seed}|assign|{date_iso}|{level}|{cand.puzzle_id}")
        if best is None or score < best[0]:
            best = (score, cand)
    if best is None:
        raise SystemExit(f"Keine freien Kandidaten mehr für {date_iso} / {level}")
    used_ids.add(best[1].puzzle_id)
    return best[1]


def puzzle_json(candidate: Candidate, level: str, date_iso: str) -> Dict[str, object]:
    label = LEVELS[level]["label"]
    return {
        "id": candidate.puzzle_id,
        "title": f"{label} – {date_iso}",
        "fen": candidate.fen,
        "preMove": candidate.pre_move,
        "solution": list(candidate.solution),
        "rating": candidate.rating,
        "ratingDeviation": candidate.rating_deviation,
        "popularity": candidate.popularity,
        "plays": candidate.nb_plays,
        "themes": list(candidate.themes),
        "sourceUrl": f"https://lichess.org/training/{candidate.puzzle_id}",
        "gameUrl": candidate.game_url,
        "openingTags": list(candidate.opening_tags),
    }


def build_json(
    dates: List[dt.date],
    candidates_by_level: Dict[str, List[Candidate]],
    assignment_seed: str,
) -> Dict[str, object]:
    used_ids: set[str] = set()
    days = []

    for date_obj in dates:
        date_iso = date_obj.isoformat()
        puzzles = {}
        for level in ("easy", "medium", "hard"):
            cand = choose_for_date(candidates_by_level[level], used_ids, date_iso, level, assignment_seed)
            puzzles[level] = puzzle_json(cand, level, date_iso)
        days.append({"date": date_iso, "puzzles": puzzles})

    return {
        "version": 2,
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "timezone": "Europe/Berlin",
        "source": {
            "name": "Lichess Puzzle Database",
            "url": "https://database.lichess.org/#puzzles",
            "download": LICHESS_PUZZLE_URL,
            "license": "CC0",
        },
        "generator": {
            "name": "Andili Schachtraining Puzzle Generator",
            "rules": {
                "levels": {
                    level: [cfg["rating_min"], cfg["rating_max"]] for level, cfg in LEVELS.items()
                },
                "excludedThemes": sorted(EXCLUDED_THEMES),
                "note": "Lichess CSV: FEN ist vor dem ersten Zug. preMove ist der erste UCI-Zug; solution beginnt danach mit dem Nutzerzug.",
            },
        },
        "levels": {
            level: [cfg["rating_min"], cfg["rating_max"]] for level, cfg in LEVELS.items()
        },
        "days": days,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Erzeuge andili-puzzles.json aus der Lichess Puzzle Database.")
    parser.add_argument("--source", default=LICHESS_PUZZLE_URL, help="URL oder lokaler Pfad zu lichess_db_puzzle.csv.zst")
    parser.add_argument("--output", default="andili-puzzles.json", help="Ausgabedatei")
    parser.add_argument("--days-back", type=int, default=6, help="Wie viele Tage vor heute enthalten sein sollen")
    parser.add_argument("--days-ahead", type=int, default=365, help="Wie viele Tage ab morgen/vorwärts enthalten sein sollen")
    parser.add_argument("--today", default="", help="Optionales heutiges Datum YYYY-MM-DD für reproduzierbare Builds")
    parser.add_argument("--pool-multiplier", type=int, default=24, help="Poolgröße je Stufe = benötigte Tage × Multiplikator")
    parser.add_argument("--min-popularity", type=int, default=70, help="Mindest-Popularität laut Lichess")
    parser.add_argument("--max-rating-deviation", type=int, default=95, help="Maximale Rating-Deviation")
    parser.add_argument("--min-plays", type=int, default=80, help="Mindestanzahl gespielter Versuche")
    parser.add_argument("--max-solution-moves", type=int, default=6, help="Maximale Anzahl UCI-Züge in solution nach preMove")
    parser.add_argument("--seed", default="andili.de-schachtraining-v8", help="Stabiler Seed für Auswahl und Zuordnung")
    args = parser.parse_args()

    if args.today:
        today = dt.date.fromisoformat(args.today)
    else:
        today = dt.datetime.now(dt.ZoneInfo("Europe/Berlin") if hasattr(dt, "ZoneInfo") else dt.timezone.utc).date()
        # Fallback: ZoneInfo liegt eigentlich im Modul zoneinfo. Für das konkrete Datum reicht UTC meistens;
        # unten korrigieren wir sauber, falls zoneinfo verfügbar ist.
        try:
            from zoneinfo import ZoneInfo

            today = dt.datetime.now(ZoneInfo("Europe/Berlin")).date()
        except Exception:
            today = dt.datetime.utcnow().date()

    dates = make_dates(today, days_back=args.days_back, days_ahead=args.days_ahead)
    needed_per_level = len(dates)

    candidates_by_level = collect_candidates(
        source=args.source,
        needed_per_level=needed_per_level,
        pool_multiplier=args.pool_multiplier,
        min_popularity=args.min_popularity,
        max_rating_deviation=args.max_rating_deviation,
        min_plays=args.min_plays,
        max_solution_moves=args.max_solution_moves,
        pool_seed=args.seed,
    )

    data = build_json(dates, candidates_by_level, assignment_seed=args.seed)
    output = Path(args.output)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Geschrieben: {output} ({len(dates)} Tage, {len(dates) * 3} Aufgaben)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

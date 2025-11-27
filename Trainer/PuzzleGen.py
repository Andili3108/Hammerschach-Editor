
import csv
import json
import random

# === FILTER-EINSTELLUNGEN ===
RATING_MIN = 800
RATING_MAX = 2400
MAX_MOVES = 8
POPULARITY_MIN = -20
LIMIT = 20000
SHUFFLE = True

INPUT_CSV = "lichess_db_puzzle.csv"
OUTPUT_JSON = "puzzles.json"

def parse_moves(moves_str):
    return moves_str.strip().split()

out = []
with open(INPUT_CSV, newline='', encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        rating = int(row["Rating"])
        if rating < RATING_MIN or rating > RATING_MAX:
            continue
        pops = int(row["Popularity"])
        if pops < POPULARITY_MIN:
            continue

        moves = parse_moves(row["Moves"])
        if len(moves) > MAX_MOVES:
            continue

        out.append({
            "id": row["PuzzleId"],
            "fen": row["FEN"],
            "moves": moves,
            "rating": rating,
            "themes": row["Themes"].split(),
        })

if SHUFFLE:
    random.shuffle(out)

out = out[:LIMIT]

with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f"FERTIG! {len(out)} Aufgaben gespeichert in {OUTPUT_JSON}")

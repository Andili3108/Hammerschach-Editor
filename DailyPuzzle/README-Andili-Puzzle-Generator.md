# Andili Puzzle Generator für `andili-puzzles.json`

Dieses Paket erzeugt die produktive `andili-puzzles.json` für `Schachandili-Training_v8.html` aus der offiziellen Lichess Puzzle Database.

## Was erzeugt wird

- 7-Tage-Auswahl im Frontend: heute plus die vorherigen 6 Tage
- pro Datum 3 Aufgaben: `easy`, `medium`, `hard`
- zusätzlich ein Jahr Vorrat: standardmäßig heute - 6 bis heute + 365
- `preMove` entspricht dem ersten UCI-Zug aus der Lichess-CSV
- `solution` enthält die anschließenden UCI-Züge, beginnend mit dem Nutzerzug

## Dateien im GitHub-Repository

Lege diese Dateien in dasselbe Repository wie deine HTML-Datei:

```text
Schachandili-Training_v8.html
andili-puzzles.json              # wird automatisch erzeugt
 generate_andili_puzzles.py       # aus diesem Paket
.github/workflows/update-andili-puzzles.yml
```

Die HTML und `andili-puzzles.json` müssen später im gleichen Ordner liegen, weil die HTML `andili-puzzles.json` relativ lädt.

## GitHub Actions aktivieren

1. `generate_andili_puzzles.py` in die oberste Ebene deines Repositories legen.
2. `.github/workflows/update-andili-puzzles.yml` in genau diesen Pfad legen.
3. In GitHub unter **Actions** den Workflow **Update Andili puzzles** manuell starten.
4. Danach liegt `andili-puzzles.json` automatisch im Repository.
5. Der Workflow läuft zusätzlich monatlich und schreibt die Datei neu.

## Qualitätsfilter im Generator

Standardmäßig nutzt der Generator:

- `easy`: Rating 800–1199
- `medium`: Rating 1200–1599
- `hard`: Rating 1600–2099
- Mindest-Popularität: 70
- maximale Rating-Deviation: 95
- mindestens 80 Versuche
- keine `mateIn1`-Aufgaben, weil die aktuelle HTML exakt einen Lösungszug prüft
- keine `veryLong`-Aufgaben
- maximal 6 UCI-Züge in `solution`

## Manuelle lokale Nutzung, optional

Nur falls du irgendwann lokal testen willst:

```bash
python -m pip install zstandard
python generate_andili_puzzles.py --output andili-puzzles.json
```

Für deine Website-Besucher ist nichts Lokales nötig. Sie laden nur HTML und JSON aus GitHub beziehungsweise über dein iframe.

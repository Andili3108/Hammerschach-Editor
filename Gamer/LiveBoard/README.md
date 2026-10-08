# Live-Board: Engine, Partiedaten und PGN

Stand: 8. Oktober 2026. Grundlage ist das vom Nutzer bereitgestellte
Desktop-Paket Hammerschach-Gamer.zip. Dieses Änderungs-Paket enthält nur
neue und geänderte Dateien, kein vollständiges Gamerpaket.

## Einspielen

1. Die Dateien unter `Hammerschach-Gamer/` mit derselben Ordnerstruktur
   in das vorhandene Projekt übernehmen und die Gamer-Website veröffentlichen.
2. Die beiden zusammengehörigen Dateien aus `Gamer-Engines-17.1.zip`,
   beispielsweise aus dessen `Hammerschach-Gamer/Gamer/Reader/`, ablegen unter:

   ```text
   Gamer/LiveBoard/stockfish.js
   Gamer/LiveBoard/stockfish.wasm
   ```

   Groß-/Kleinschreibung beachten. Beide Dateien gehören auf dieselbe
   veröffentlichte Website wie der Gamer. Die Engine-Dateien sind im kleinen
   Änderungs-ZIP bewusst nicht erneut enthalten. Für die Tests wurden genau
   diese Reader-Engine-Dateien aus dem bereitgestellten Engine-ZIP verwendet.
3. Auch den vorhandenen Cloudflare-Lobby-Worker mit den Änderungen in
   `src/live-board-sources.js` und `src/live-board.js` erneut veröffentlichen.
   Erst dann werden zusätzliche PGN-Kopfdaten bis zum Browser weitergegeben.
   Bestehende Worker-Konfiguration und Datenbank bleiben erhalten;
   es ist keine Datenbankmigration erforderlich.

Es wurde nichts auf GitHub oder Cloudflare veröffentlicht.

## Verhalten

- Vereinsschach und Turnierschach nutzen dieselbe Einzelansicht mit den
  Karteien Zugliste, Engine und Partie.
- Das Aktualisierungsintervall steht oben in Engine. Die bisherigen
  Intervalle und die Speicherung pro Mitglied bleiben bestehen.
- Stockfish startet auf Wunsch über Analysieren oder Auto-Analyse.
  Suchmodus Tiefe/Zeit und 1–4 Varianten stehen zur Verfügung.
- Analysiert wird die sichtbare Stellung, einschließlich historischer
  Stellungen beim Zurückblättern. Neue Live-Züge ändern die Analyse erst,
  wenn sich auch die sichtbare Stellung ändert. » führt zum aktuellen Stand.
- Die Bewertung gilt wie im Reader für die am Zug befindliche Seite;
  WDL bedeutet Gewinn/Remis/Verlust aus dieser Sicht, in Tausendsteln.
  Angezeigt werden auch Suchtiefe, NPS, Bestzug und Fortsetzungen.
- Stop beendet den Worker und schaltet Auto-Analyse aus. Ein verborgenes
  Browserfenster pausiert die Analyse; bei Rückkehr läuft Auto-Analyse weiter.
  Beim Verlassen/Wechseln des Bretts wird die Engine beendet.
- Es gibt keine eigenen Züge auf dem Live-Brett. Die bestehenden Spielräume,
  Analyzer-, Reader- und Schachlabor-Engines werden nicht verändert.
- Partie zeigt übermittelte Namen, Veranstaltung, Runde, Brett und Ergebnis.
  PGN/Lichess-Zusatzdaten wie Elo, Datum, Ort, ECO, Eröffnung, Titel, Team und
  Bedenkzeit werden angezeigt, soweit die Quelle sie liefert.
  Die DGT-Anbindung liefert weiterhin die bisher bestätigten Felder;
  zusätzliche DGT-Metadaten wurden nicht spekulativ zugeordnet.
- PGN erscheint rechts unter dem Brett nur bei bestätigtem 1-0, 0-1 oder
  1/2-1/2. Ein Verbindungsabbruch oder eine abgelaufene Uhr reicht nicht aus.
  Exportiert wird die komplette empfangene Hauptvariante, unabhängig vom
  betrachteten Halbzug, mit Ergebnis und verfügbaren Kopfdaten.
  Besondere Startstellungen bekommen SetUp/FEN und passende Zugnummern.
  Fehlende PGN-Pflichtangaben erhalten die üblichen unbekannten Werte.

## Prüfung und Grenzen

44 automatisierte Tests zu Live-Board, Quellen, Cache, Uhr, Stellungsdaten und
PGN bestanden. Der vorhandene Browser-Regressionstest und der neue Engine-Test
liefen mit Desktop 1440×1000, iPad 820×1180 und iPhone 390×844 in Chromium.
Die tatsächliche Stockfish-17.1-JavaScript-/WASM-Engine aus dem Nutzer-ZIP wurde
im Browser geladen und berechnete Stellungen. Geprüft wurden unter anderem
schnelle Zugwechsel, Live-Updates während historischer Ansicht, Ausblenden,
Brettwechsel, fehlende Engine-Dateien und Wiederanlauf sowie PGN-Download.

Dies sind lokale Browserprüfungen mit kontrollierten Übertragungsdaten,
keine Tests auf echten iOS-Geräten und keine Prüfung der veröffentlichten
GitHub-/Cloudflare-Installation. Ein kurzer Test dort nach dem Einspielen
bleibt sinnvoll. Verfügbarkeit und Vollständigkeit fremder Partiedaten hängen
von der jeweiligen Quelle ab. Die bisherige Beschränkung des Live-Viewers
auf Standardschach bleibt bestehen.

Tests: `node --test tests/live-board*.test.mjs` im Lobby-Worker-Verzeichnis.
Die Browserprüfungen `tests/live-board-browser.mjs` und
`tests/live-board-engine-browser.mjs` benötigen Playwright und einen Browser;
optional sind PLAYWRIGHT_MODULE, CHROMIUM_EXECUTABLE und LIVE_BOARD_SCREENSHOTS.
Die neue Engine-Browserprüfung benötigt zusätzlich die oben genannten Dateien.

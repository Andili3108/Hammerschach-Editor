# LIVE-BOARD – Phase 1 / Testpaket

Stand: 5. Oktober 2026. Grundlage ist ausschließlich der in diesem Chat hochgeladene `Hammerschach-Gamer.zip`, SHA-256 `df8797513879dd7b364abafa097eb7cbd417371a8bdc7d21267dba31632a4164`.

## Einspielen und erster Test

1. Die Dateien dieses Änderungs-ZIPs über die gleichnamigen Dateien des aktuellen Projekts legen. Die oberste Ebene ist einmal `Hammerschach-Gamer/`. Es ist kein vollständiges Gamer-Paket.
2. Den Lobby-Worker einschließlich **beider neuer Dateien in `src/`** wie bisher bereitstellen. Danach die geänderten/neuen Dateien unter `Gamer/` mit dem bestehenden Verfahren veröffentlichen. Eine reine HTML-Aktualisierung reicht nicht.
3. Für einen reproduzierbaren Test im Lobby-Worker die Textvariablen `LIVE_BOARD_DEMO` auf `1` und `LIVE_BOARD_EVENTS` auf den vollständigen JSON-Inhalt von `live-board.events.example.json` setzen. Die JSON-Datei wird nicht automatisch gelesen. Die Variablen können über die bestehenden Cloudflare-Worker-Einstellungen gepflegt werden. `wrangler.toml` wurde bewusst nicht überschrieben; vorhandene Bindings, Secrets und Cronjobs bleiben erhalten.
4. Als Mitglied: **Schachwelt → LIVE-BOARD → Vereinsschach / Turnierschach**. Jeweils die Demo-Veranstaltung öffnen. Sie enthält zehn statische Beispielpartien: acht laufende/wartende Bretter und zwei abgeschlossene Bretter auf Seite 2. Die Demo ist deutlich gekennzeichnet und simuliert keine echte Übertragung.
5. Vor Live-Betrieb die Demo-Einträge durch eigene Quellen ersetzen und `LIVE_BOARD_DEMO` entfernen bzw. auf `0` setzen. Ohne Katalog ist die Veranstaltungsübersicht bewusst leer. Demo-Einträge bei deaktiviertem Demomodus sind eine ungültige Konfiguration; daher gleichzeitig entfernen.

Es wurden keine Cloudflare-Einstellungen geändert und nichts produktiv ausgerollt.

## Vorhandene Architektur und Eingriffe

- Das vorhandene Schachwelt-Dropdown und sein mobiles Gegenstück erhalten eine Rubrik und zwei Schaltflächen. Gamer-TV und die Hauptnavigation bleiben bestehen.
- `auth-account.js` aktualisiert die Sichtbarkeit und beendet den Betrachter bei Logout/Identitätswechsel. `index.html` lädt die neuen Module sowie die aktualisierte Auth-Datei mit neuer Versionskennung.
- Die neue Ansicht ist ein eigener modaler, passiver Betrachter. Sie nutzt den bestehenden `Game`-Regelkern, die ausgewählten Figuren und Brettfarben, aber eigene Partieinstanzen. Sie sendet keine Züge und verändert weder `masterHistory` noch Spielräume, eigene Uhren oder Partieaufbau.
- Der bestehende Worker-Router reicht nur `/api/live-board/...` an das neue Modul weiter. Die vorhandene D1-Sitzungsprüfung `lookupAuthSession` prüft jede Anfrage vor Katalog-, Cache- oder Quellenzugriff. Fehlendes/ungültiges/abgelaufenes Token: HTTP 401. Deaktivierte/gelöschte Konten werden durch die vorhandene Sitzungsprüfung ausgeschlossen.
- Alle neuen Datenantworten sind `private, no-store`; interne Cache-Einträge sind über keinen neuen öffentlichen API-Endpunkt abrufbar. Es werden keine Gamer-Tokens, Cookies oder Namen an Quellen weitergereicht. Nur der Server ruft Quellen ab.
- Keine neuen Tabellen, Bindings, Bibliotheken zur Laufzeit, Cronjobs, WebSockets, USB-, Bluetooth- oder Browser-Hardwareanbindung.

Im gelieferten Ausgangsstand sind nicht alle zuvor besprochenen Traffic-Optimierungen enthalten: beispielsweise Presence 60 Sekunden, Tagesstatistik 5 Minuten. Bestehende Abfragen wurden für diese Erweiterung nicht umgestellt; daraus folgt keine Aussage über den aktuell produktiv laufenden Worker.

## Bedienung und Datenmodell

Beide Kategorien verwenden dieselben Endpunkte und denselben Betrachter. Eine Veranstaltung entspricht in Phase 1 einer fest konfigurierten Runde/PGN-Quelle. Rundenwechsel werden im Katalog gepflegt; eine automatische Rundenwahl ist noch nicht enthalten.

- Acht Bretter pro Seite, Vor/Zurück. Desktop vier, Tablet zwei und schmales Smartphone eine Spalte; die Seite lässt sich vertikal scrollen.
- Namen suchen oder mit einer Zahl genau nach einer Brettnummer filtern. „Alle Bretter“ hebt die Suche auf.
- Klick auf das Diagramm oder „Brett öffnen“ zeigt genau eine Partie groß.
- Vorige/nächste Stellung, Startstellung, aktueller Stand und Brett drehen. Nachspielen bleibt bei seiner gewählten Stellung, während neue Quelldaten eintreffen; „Aktueller Stand“ folgt wieder dem letzten Zug.
- Quellenuhren werden als empfangener Uhrenstand angezeigt, nicht künstlich heruntergezählt.
- Standard-Schach einschließlich Rochade, en passant, Unterverwandlung und gültiger Standard-FEN-Startstellungen. Chess960 und andere Varianten werden in Phase 1 mit einem Hinweis statt einer möglicherweise falschen Stellung dargestellt.
- Ungültige Zugfolgen erscheinen als Fehlerhinweis. Es wird keine vermeintlich aktuelle, nur teilweise nachgespielte Stellung angezeigt.

API, jeweils mit dem vorhandenen Bearer-Token:

```text
GET /api/live-board/events
GET /api/live-board/events/ID/boards?page=1
GET /api/live-board/events/ID/boards?q=Spielername
GET /api/live-board/events/ID/boards?q=12
GET /api/live-board/events/ID/boards?board=12
```

Pro Antwort maximal acht vollständige Partien oder genau eine Einzelpartie. Suche erfolgt serverseitig im Paarungskatalog; es wird kein vollständiger Turnierdatensatz an den Browser gesendet. Änderungen per POST/DELETE usw. sind nicht erlaubt.

## Echte Quellen konfigurieren

`LIVE_BOARD_EVENTS` ist ein JSON-Array mit maximal 40 Einträgen. Je Eintrag: eindeutige `id` (Kleinbuchstaben, Zahlen, `_`, `-`), `title`, `category` (`club` oder `tournament`), optional `round`, `enabled` (Standard true), `finished` (Standard false) und `source`. `finished:true` beendet automatisches Polling für diese Veranstaltung. `enabled:false` blendet sie aus und verhindert ihren Abruf.

**DGT LiveChessCloud**:

```json
{"id":"verein-runde-1","title":"Vereinsabend","category":"club","round":"1","source":{"type":"dgt","tournamentId":"HIER-DIE-ECHTE-UUID-EINTRAGEN","round":1}}
```

UUID aus dem offiziellen Viewer-Link übernehmen, Runde ist einsbasiert. Der Adapter fragt den offiziellen Lookup-Dienst ab, akzeptiert ausschließlich Datenhosts unter `livechesscloud.com`, liest den Paarungsindex und nur die ausgewählten `game-N.json`-Dateien. ESAN-Züge, Spielernamen, Ergebnis und vorhandene Uhren werden normalisiert. Das Format wurde am offiziellen DGT-Viewer-Code geprüft; eine konkrete echte Veranstaltung wurde nicht übergeben und somit nicht Ende-zu-Ende getestet. Anbieteränderungen oder andere DGT-Formate können Anpassungen erfordern.

**Lichess-Broadcast-Runde**:

```json
{"id":"open-runde-1","title":"Open – Runde 1","category":"tournament","source":{"type":"lichess","roundId":"Ab12Cd34"}}
```

Die achtstellige ID muss die echte **Runden-ID**, nicht die Turnier-ID sein. `Ab12Cd34` ist nur ein Platzhalter. Verwendet wird der offizielle PGN-Rundenexport `https://lichess.org/api/broadcast/round/ID.pgn`. Keine Lichess-Anmeldung erforderlich.

**Öffentliche Live-PGN**:

```json
{"id":"verein-pgn","title":"Vereinsrunde","category":"club","source":{"type":"pgn","url":"https://live.example.org/runde-1.pgn"}}
```

Zusätzlich `LIVE_BOARD_PGN_HOSTS` als kommaseparierte Liste vertrauenswürdiger, öffentlicher Hosts konfigurieren, hier `live.example.org`. Keine Wildcards, keine internen Hosts. Nur HTTPS ohne URL-Zugangsdaten und mit Standardport. Weiterleitungen werden abgelehnt; die endgültige PGN-Adresse eintragen. URLs können nicht über Zuschauerparameter übergeben werden.

PGN-Anforderungen: White-/Black-Kopfzeilen, vollständige Hauptvariante mit Ergebnismarker (`*` bei laufender Partie), optional FEN, Board, Round, Variant und Result. Kommentare, verschachtelte Varianten, NAGs und `[%clk ...]` werden berücksichtigt. Dateien sollten atomar ersetzt werden. Unvollständige/ungültige Dateien ersetzen keinen guten Cache-Stand. Maximal 2 MiB pro Quelldatei, 1.000 Partien und 1.600 Halbzüge pro Partie. PGN-Reihenfolge muss innerhalb einer Runde stabil bleiben; neue Runde als neue Veranstaltung/Quellenadresse anlegen.

Die Quellenverwaltung erfolgt in Phase 1 über Worker-Variablen. Eine Verwaltungsoberfläche, Internet-Turniersuche und automatische Quellensuche sind nicht Teil dieses Testpakets.

## Traffic und Fehlerverhalten

- Geschlossen/ausgeloggt: keine Live-Abfragen. Katalog nur beim Öffnen oder bewussten Aktualisieren.
- Sichtbare Brettseite/Einzelansicht: eine API-Abfrage alle 30 Sekunden, jeweils erst nach Abschluss der vorherigen Abfrage. Keine zusätzlichen acht Browser-Abfragen pro Übersichtsseite.
- Hintergrundtab/offline: Timer stoppen, laufender Browserabruf wird abgebrochen. Rückkehr stößt höchstens einen fälligen Abruf an. Fokusereignisse erzeugen keine parallelen Abrufe.
- Seitenwechsel/Schließen/Logout: Abbruch und Generationsprüfung verhindern, dass verspätete Antworten eine neue Ansicht überschreiben.
- Sichtbare Auswahl vollständig beendet: automatisches Polling stoppt. Eine leere, noch nicht gestartete DGT-Runde wird alle 60 Sekunden geprüft; erfolglose Suchergebnisse pollen nicht weiter.
- Quellenfehler: gemeinsamer Wiederholabstand mindestens 60 Sekunden. Browserfehler steigern ihren Abstand bis auf vier Minuten. Verfügbare ältere Daten bleiben mit Verzögerungshinweis sichtbar; ohne ältere Daten erscheint eine Fehlermeldung.
- Servercache: 30 Sekunden für PGN/DGT-Partien, 60 Sekunden für DGT-Paarungen, fünf Minuten für DGT-Hostauflösung. Erfolgreich beendete Einzelpartien bzw. vollständig beendete PGN-Dateien werden bis zu 24 Stunden wiederverwendet. Ergebnisberichtigungen können dadurch verspätet erscheinen; für eine sofortige Korrektur eine versionierte Quellenadresse/neue Runde verwenden oder den Cache leeren.
- Cache API teilt Quelldaten innerhalb eines Cloudflare-Rechenzentrums; gleichzeitige Abrufe werden zusätzlich innerhalb derselben Worker-Instanz zusammengeführt. Das ist **keine weltweit zentrale Einmal-Abfrage**: kalte/andere Instanzen und Standorte können parallel abrufen. Ohne verfügbaren Edge-Cache bleibt nur der begrenzte Instanzcache. Cache-Eviction ist möglich.
- Bei gebündelten PGNs lässt sich der Ursprungsabruf technisch nicht auf acht Partien begrenzen. Die Datei wird serverseitig geteilt/gecacht; Zuschauer erhalten nur ihre Auswahl. DGT kann einzelne Brettdateien abrufen. Beendete DGT-Partien werden aus dem Cache bedient; fertige Partien in einer noch laufenden Gesamt-PGN bleiben Teil des unvermeidbaren Gesamtquellenabrufs.
- Jeder Mitgliederabruf benötigt weiterhin einen Worker-Aufruf und die bestehende Sitzungsprüfung. Es wurde kein globaler Abrufkoordinator hinzugefügt. Free-Tier-Kosten/CPU und reale Cache-Hitrate müssen nach einem Testdeployment anhand der tatsächlichen Datenmengen kontrolliert werden; es gibt keine Tarifgarantie.

## Durchgeführte Prüfung

- **12 neue Node-Tests bestanden.** Geprüft: Zugriffsschutz, schreibgeschützte API, Katalog, Kategorien, 8er-Seiten, Namen/Nummern, Einzelansicht, fertige Partien, PGN-Parser/Kommentare/Varianten/Uhren, unvollständige Daten, Host-/Redirect-Grenzen, DGT-Normalisierung und selektive Abfragen, gemeinsamer Cache/TTL/Fehlerpause/Edge-Cache sowie Wiederverwendung des Gamer-Regelkerns.
- Browserintegration mit dem tatsächlichen Gamer-HTML, lokalen Testdaten und dem neuen API-Handler: Desktop 1440 × 1000, iPad-Größe 820 × 1180 und iPhone-Größe 390 × 844. Desktop- und Mobilmenüs, Seitenwechsel, Suche, Einzelbrett, Zugnavigation, Brett drehen, unveränderter eigener Partiezustand, Polling-Stopp bei Partieende, Hintergrundpause/Wiederaufnahme, Sitzungsablauf und Logout geprüft. Keine JavaScript-Seitenfehler in diesen Läufen; kein horizontaler Überlauf im Dialog. Screenshots visuell geprüft.
- Dies sind Chromium-Geräteemulationen, keine physischen Apple-Geräte/Safari. Dort bleibt ein Praxistest sinnvoll.
- Gesamte Node-Testreihe: **216 von 219 bestanden**; unveränderter Upload: **204 von 207 bestanden**. Vergleich: drei identische vorhandene Fehlschläge in `account-deletion-tournaments.test.mjs` (`deleteProgress is not defined` im Testkontext). Keine zusätzlichen Fehler durch LIVE-BOARD. Diese fremden Tests wurden nicht umgebaut.
- Nicht geprüft: echtes Cloudflare-Deployment mit D1-Anmeldung und verteilter Cache API, echte DGT-/Lichess-/PGN-Veranstaltung mit neuen Live-Zügen, Anbieterlimits, Belastungstest mit großen Turnieren. Die Demo prüft Oberfläche und Zugriffspfade; sie ersetzt diese Tests nicht.

Tests wiederholen, im Worker-Ordner mit Node 22 oder neuer:

```sh
node --test tests/live-board.test.mjs
node --test tests/*.test.mjs
```

Optionaler Browserlauf mit lokal installiertem Playwright und Chromium:

```sh
node tests/live-board-browser.mjs
```

Alternativ `PLAYWRIGHT_MODULE` auf dessen `index.mjs` setzen. `LIVE_BOARD_SCREENSHOTS` benennt optional ein Ausgabeordner für Prüfbilder. Der Browserlauf verwendet nur Testanmeldung und abgefangene Quellen; er ruft keine produktiven API-Daten ab.

## Fachliche Referenzen

- DGT: offizieller [LiveChessCloud-Viewer](https://view.livechesscloud.com/), dessen aktuell geladener Viewer-Code für Lookup, Pairings, ESAN und Clock-Struktur geprüft wurde.
- Lichess: [Broadcast-Hilfe](https://lichess.org/broadcast/help?lang=en) und [API](https://lichess.org/api#tag/Broadcasts/operation/broadcastRoundPgn), Endpunkt zusätzlich mit der offiziellen API-Spezifikation abgeglichen.
- Cloudflare: [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/), insbesondere Standortbindung und Unterschiede zur normalen HTTP-Auslieferung.

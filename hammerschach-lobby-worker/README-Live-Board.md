# LIVE-BOARD: Lichess, DGT und regionale Auswahl

Stand: 7. Oktober 2026. Dieses Änderungs-Paket setzt direkt auf dem zuletzt beim Nutzer funktionierenden Stand mit Veranstaltungssuche, Cloudflare-Korrektur und Gamer-Einzelansicht auf. Das verworfene Paket „Vereine-Turniere-Testpaket“ muss NICHT vorher installiert werden. Nur Dateien aus diesem ZIP in gleicher Ordnerstruktur ersetzen/ergänzen; anschließend den Worker wie gewohnt bereitstellen und den Gamer neu laden. Es wurde nichts produktiv bereitgestellt.

## Quellen und automatische Suche

- **Lichess:** offizieller öffentlicher Katalog `/api/broadcast/top`, danach Rundenliste und PGN der gewählten Runde. Keine vollständige Suche durch sämtliche historischen Lichess-Übertragungen.
- **DGT LiveChess Cloud:** neue Suche nach veröffentlichten DGT-Links auf festgelegten Vereins-/Verbandsseiten. Erkannte Veranstaltungen erscheinen im Katalog; beim Öffnen lädt der Worker die Runden und Bretter direkt aus der DGT-Cloud. Lichess ist dafür nicht erforderlich.
- **Öffentliche Live-PGN:** weiterhin über manuell oder in der Worker-Konfiguration hinterlegte Links. Der Anbieter muss in `LIVE_BOARD_PGN_HOSTS` freigegeben sein.

Ein öffentlich dokumentiertes Gesamtverzeichnis sämtlicher DGT-Veranstaltungen liegt nicht vor. Deshalb durchsucht der Gamer Veröffentlichungsseiten, nicht alle möglichen Cloud-IDs. Der Parser erkennt direkte HTML-Links und eingebettete/lazy geladene iframes. Er führt keine fremden Skripte aus, verfolgt keine Weiterleitungen und durchsucht keine PDFs, sozialen Netzwerke oder geschützten Bereiche. Ein Link mit passendem Veranstaltungsnamen bzw. eindeutiger Zuordnung ist nötig. Unklare Einträge auf gemischten Verbandsseiten werden ausgelassen; die manuelle Eingabe bleibt dafür verfügbar.

Die voreingestellten Veröffentlichungsseiten stehen in `src/live-board-discovery-pages.js`:

| Seite | Bereich |
| --- | --- |
| https://www.schachbundesliga.de/ | Bundesliga |
| https://schach-nrw.de/ | SBNRW |
| https://svr-schach.de/ | SVRuhrgebiet |
| https://bezirk.sbhamm.de/ | SBHamm |
| https://svunna.de/ | SV Unna |
| https://www.caissahamm.de/ | Caissa Hamm |
| https://www.sv49.de/ | SV Bönen |
| https://www.skwerne.de/ | SK Werne |

Eine gelistete Website bedeutet nicht, dass der Verein DGT-Bretter besitzt oder gerade überträgt. Im realen Prüflauf waren alle acht Hauptseiten erreichbar, aber kein passend zuordenbarer DGT-Link wurde gefunden. Das ist kein Nachweis, dass es auf anderen Unterseiten oder an anderen Spieltagen keine Übertragungen gibt.

## Vereins- und Turnierschach

Vereinsschach wird in dieser Reihenfolge gruppiert und ist nach Ebene filterbar: **Bundesliga → SBNRW → SVRuhrgebiet → SBHamm**. Deutsche Bundesliga-Übertragungen erscheinen ausschließlich im Vereinsschach. Ausländische Ligen und unklare Mannschaftsveranstaltungen werden nicht aus dem Lichess-Katalog übernommen. Namensregeln stehen zentral in `src/live-board-classification.js`; ein Mannschaftsmerkmal allein genügt nicht mehr.

Turnierschach umfasst eigenständige Turniere jeder Größe: Weltklasse, Opens, Einzelmeisterschaften und lokale Veranstaltungen wie Unna Open oder Quick-Round-Robin. Der Standort NRW/Hamm allein macht ein Einzelturnier nicht zu Vereinsschach. Bereits gespeicherte eigene Vereinseinträge ohne erkennbare Ebene bleiben unter „Eigene Vereinsübertragungen“ erhalten. Dort können auch manuelle Mannschaftskämpfe außerhalb der zunächst vorgesehenen Hierarchie eingeordnet werden.

DGT-Veröffentlichungslinks haben im Katalog zunächst den neutralen Status „Übertragung“. Ohne Prüfung der Partien werden sie nicht als „Laufend“ oder „Geplant“ ausgegeben. Deshalb erscheinen solche Einträge zunächst unter „Alle Veranstaltungen“. Bei der Auswahl wird die im Link angegebene Runde verwendet; ohne Rundennummer die erste als live gemeldete, sonst die letzte Runde mit Brettern. Eine angebotene spätere Runde kann noch leer sein. Die Runde bleibt beim weiteren Zuschauen fest und ist über die Rundenauswahl wechselbar.

## Manuelle Links

Unter **Eigene Übertragung hinzufügen** Name und direkten Link eingeben. Im Vereinsschach zusätzlich Ebene oder „Eigene Vereinsübertragungen“ wählen.

- DGT: `https://view.livechesscloud.com/#UUID`, optional `/RUNDENNUMMER`; die Runde ist auch als Zahl einstellbar.
- Lichess: Link einer konkreten Runde `https://lichess.org/broadcast/TURNIER/RUNDE/ACHTSTELLIGE-ID` oder deren offizieller PGN-Export. Eine Turnierübersichtsseite ohne Runde reicht hier nicht aus.
- Live-PGN: direkte HTTPS-Datei; der Host muss vorab in `LIVE_BOARD_PGN_HOSTS` eingetragen werden.

Eine normale Vereins-/Turnierhomepage oder eine Ergebnistabelle ist kein direkt eintragbarer Partielink. Ganze Websites für die automatische Suche werden ausschließlich in der Worker-Konfiguration hinterlegt.

Speicherung erfolgt weiterhin in der vorhandenen D1-Tabelle `live_board_sources`, maximal 40 eigene Einträge. Erneutes Hinzufügen derselben Quelle aktualisiert Name/Zuordnung und behält die gespeicherte ID. Keine Tabellenmigration nötig. Identische Quellenadressen werden im Katalog zusammengeführt; unterschiedliche Anbieter/Runden können eigenständige Einträge bleiben. Entfernen ist wie bisher mit zweitem Klick bestätigt. Die serverseitige Freigabe bleibt ausschließlich für das angemeldete Konto **Andili** bestehen, auch für Schreibzugriffe.

## Umfang, Cache und Erweiterung

- Maximal acht Veröffentlichungsseiten, je Hauptseite und höchstens eine direkt verlinkte weitere Seite derselben HTTPS-Adresse mit Live-/Übertragungshinweis. Maximal zwölf DGT-Veranstaltungen pro Suchseite.
- Gemeinsamer Cache pro Suchseite: 30 Minuten, Lichess-Katalog: fünf Minuten. „Aktualisieren“ umgeht diese Limits nicht. Simultane Anfragen werden innerhalb einer Worker-Instanz zusammengeführt; Cloudflare Cache API teilt Daten innerhalb des Standorts, nicht garantiert weltweit.
- Keine neue Dauerabfrage und kein Cronjob. Im Hintergrund pausiert die Brettabfrage. Nur vier sichtbare Bretter bzw. ein Einzelbrett werden geladen. Erfolgreich geladene beendete Partien stoppen die laufende Abfrage; vorübergehend fehlende Daten werden langsamer erneut versucht.
- Fehler einer Suchseite blockieren keine anderen Anbieter. Alte Cache-Ergebnisse können bis zu 24 Stunden als verzögert erhalten bleiben. Ein kurzzeitiger Ausfall und ein Katalog ohne Treffer werden unterschieden.
- HTML-Abrufe: höchstens vier Sekunden je Seite, maximal 2 MiB wie die vorhandenen Quellenabrufe. Keine Anmeldedaten gehen an externe Anbieter. Private API-Antworten bleiben ungecacht.

Optional ersetzt `LIVE_BOARD_DISCOVERY_PAGES` die acht Vorgaben vollständig durch ein JSON-Array (maximal acht Objekte). Felder: `id` (1–16 Kleinbuchstaben/Ziffern, eindeutig), `name`, `url` (öffentliche HTTPS-Seite), `category` (`club`, `tournament` oder `mixed`), für Vereins-/gemischte Seiten `clubScope` (`bundesliga`, `nrw`, `ruhrgebiet`, `hamm` oder `own`). `mixed` benötigt eine erkennbare Team-/Einzelturnierbezeichnung im Linkumfeld. Für eine reine Übertragungsseite eines Mannschaftswettbewerbs ist `club` passend. Immer die endgültige URL ohne Weiterleitung verwenden.

`LIVE_BOARD_PAGE_DISCOVERY=0` schaltet nur die neue Seitensuche ab. `LIVE_BOARD_DISCOVERY=0` schaltet beide automatischen Suchen ab. Bestehende eigene/configurierte Quellen bleiben nutzbar. `LIVE_BOARD_EVENTS`, D1-Bindings, Secrets und `wrangler.toml` bleiben bestehen. Die neuen Ebenen lassen sich später gezielt ergänzen; weitere Webseiten erfordern keine Änderungen am Brettmodul.

## Prüfung

- 30 gezielte automatisierte LIVE-BOARD-Tests: Klassifikation, Reihenfolge, Bundesliga-Trennung, Parser, Abrufgrenzen, Quelle/Host-Prüfung, unbekannte IDs, Zugriffsschutz, manuelle DGT-Speicherung, D1-Umordnung, Cache, Spieler-/Brettsuche und Polling.
- Browser: Desktop (1440 px), iPad (820 px), iPhone (390 px). Hierarchie, Suchfilter, vier Bretter, Einzelansicht mit Gamer-Zugliste, manuelle DGT-Linkeingabe und Löschen, Rückkehr zur Lobby, Fußzeile, abgelaufene Anmeldung, Hintergrundpause und unveränderte eigene Partie geprüft. Echte aufgezeichnete DGT-Daten werden dabei ohne wiederholte externe Abfragen abgespielt.
- Cloudflare `workerd`: Lichess und DGT einschließlich Suchseite, vier Bretter, geteilter Cache, Besucher-Sperre und abgelehnte Weiterleitungen mit kontrollierten Gegenstellen geprüft.
- Öffentlicher DGT-End-to-End-Test: automatische Linkerkennung auf der Veröffentlichungsseite von Chess Castle, neun verfügbare Bretter, vier geladen und vollständig mit dem Gamer nachgespielt; Einzelbrett ohne erneuten Quellenabruf. Diese US-Testseite wird nicht zu den regionalen Vorgaben hinzugefügt.
- Zusätzlicher realer deutscher Ligatest: [SV Mattnetz Berlin, Landesliga-Spieltag 5](https://www.sv-mattnetz-berlin.de/landesliga-5-spieltag/), veröffentlichter [DGT-Link](https://view.livechesscloud.com/#2be70a50-3bae-4f0e-a13a-add636d9cda0). Acht Bretter vorhanden, vier geladen und vollständig nachgespielt; beendete Runde ohne weiteres Polling. Diese ältere Übertragung dient nur zum Test, Berlin ist nicht Teil der automatischen regionalen Vorgaben.
- Die regionalen Ebenen NRW/Ruhrgebiet/Hamm wurden mangels echter gefundener Übertragung mit kontrollierten Daten geprüft. Es wird keine vollständige Erfassung aller Vereinsseiten behauptet. Keine Produktivbereitstellung und kein Test mit echten Gamer-Zugangsdaten.

Testbefehle im Worker-Verzeichnis:

```sh
node --test tests/live-board*.test.mjs
node tests/live-board-browser.mjs
node tests/live-board-worker-runtime.mjs
LIVE_BOARD_DGT_RECORD=/tmp/live-board-dgt.json node tests/live-board-dgt-external.mjs
LIVE_BOARD_RECORD=/tmp/live-board-dgt.json node tests/live-board-discovery-browser.mjs
```

Browserläufe benötigen Playwright/Chromium, der Worker-Lauf Miniflare; diese optionalen Testwerkzeuge werden nicht mitgeliefert. Bestehende Umgebungsvariablen `PLAYWRIGHT_MODULE`, `CHROMIUM_EXECUTABLE`, `MINIFLARE_MODULE` können deren Pfade setzen. Die externen Tests rufen öffentliche Dienste tatsächlich auf, die übrigen Tests verwenden lokale Testdaten.

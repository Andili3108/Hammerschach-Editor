# LIVE-BOARD – Mitglieder, Spielersuche und Aktualisierung

Stand: 7. Oktober 2026, Korrektur von Uhrenanzeige, Seitenbewegung und Intervallwechsel. Dieses Korrektur-ZIP setzt auf dem zuletzt gelieferten **Hammerschach-Gamer-LIVE-BOARD-Mitglieder-Suche-Aktualisierung-Testpaket-2026-10-07.zip** auf. Die enthaltenen Gamer-Dateien in derselben Ordnerstruktur ersetzen/ergänzen und den Gamer neu laden. Die neue Datei `Gamer/js/live-board-clock.js` muss mit hochgeladen werden; `index.html` lädt sie vor dem Live-Board-Modul. Der Worker-Code bleibt unverändert und muss für diese Korrektur nicht erneut bereitgestellt werden. Keine Datenbankmigration oder neuen Secrets. Es wurde nichts produktiv bereitgestellt.

## Korrektur der Einzelansicht

- **Uhr:** Bisher wurden ausschließlich gelieferte Uhrenstände angezeigt. Der PGN-Adapter liest `%clk`-Kommentare nach Zügen; diese sind keine kontinuierlich laufende Uhr. Jetzt läuft die Uhr der am Zug befindlichen Seite lokal sekündlich weiter. Wiederholte identische Daten setzen sie nicht zurück. Ein neuer Zug oder korrigierter Quellenwert gleicht die Anzeige wieder ab. Neue Uhrenwerte ohne Zug werden direkt in die vorhandene Ansicht übernommen.
- **Genauigkeit:** `≈` und ein Tooltip kennzeichnen die lokale Schätzung. Die aktuelle Quelle liefert keine durchgehend zuverlässigen Zeitstempel des Zugbeginns; deshalb beginnt die Schätzung beim empfangenen Stand. Zeit vor dem Öffnen, Quellenverzögerung und Pausen lassen sich damit nicht rekonstruieren. Die Anzeige ist nicht die verbindliche Uhr des Turniers. Aus geschätzten null Sekunden wird niemals ein Partieergebnis abgeleitet. Fehlende Uhren werden nicht erfunden. Vor dem ersten Zug und nach Partieende läuft nichts herunter. Bei Fehler, Offline-Zustand oder verborgenem Tab pausiert die Schätzung.
- **Seitenbewegung:** Automatische Updates blenden nicht mehr wiederholt einen Ladetext ein/aus. Die Beschriftung von „Aktualisieren“ bleibt gleich breit. Bei unveränderter Stellung und reinen Uhrenänderungen bleibt das Brett im Dokument erhalten. Bei einem neuen Zug werden die neuen Elemente vor dem Austausch aufgebaut; Scrollposition und Notationsposition werden übernommen.
- **Intervallwechsel:** Bricht keine laufende Anfrage mehr ab. Die gültige Antwort wird übernommen, danach gilt die zuletzt gewählte Pause. Es bleibt bei höchstens einer laufenden Ansichtsabfrage. Eine Auswahl von fünf Sekunden bedeutet nicht, dass eine langsamere Quelle nach fünf Sekunden abgebrochen wird.
- **Zeitüberschreitung:** Das Zeitlimit für die gesamte Ansichtsabfrage beträgt 45 statt 25 Sekunden. Ein kalter DGT-Abruf kann mehrere nacheinander geladene Metadaten-/Partiedateien benötigen, deren bisherige Einzelgrenzen zusammen über 25 Sekunden liegen. Das Limit bleibt begrenzt. Ein echter Timeout pausiert die Schätzung, erhält die letzte Stellung und führt nach der bestehenden Fehlerpause zu einem automatischen neuen Versuch. Ein Intervallwechsel umgeht diese Pause nicht.

Die zuvor gemeldete Ursache einer konkreten langsamen externen Quelle ist ohne deren Veranstaltungslink nicht abschließend belegt. Nachgewiesen und korrigiert sind die beschriebenen Abläufe im Gamer; Tests simulieren langsame Antworten und vollständige Ausfälle ausdrücklich.


## Bedienung und Zugriffsrechte

Beide Schachwelt-Einträge **Vereinsschach** und **Turnierschach** sind jetzt für alle angemeldeten Mitglieder zugänglich. Besucher und ungültige/abgelaufene Sitzungen bleiben serverseitig vor jedem Katalog-, Cache- oder Quellenzugriff ausgeschlossen. Das gilt auch für die neue Spielersuche.

Die gemeinsam gespeicherten Übertragungslinks verwaltet weiterhin Andili: hinzufügen, umbenennen/neu zuordnen und entfernen. Andere Mitglieder sehen diese Veranstaltungen und deren Bretter, jedoch keine Verwaltungsaktionen. Schreibzugriffe sind zusätzlich serverseitig gesperrt. Die allgemeine Mitgliederfreigabe hebt keine anderen Administrationsrechte des Gamers auf.

## Einzelbrett

Die rechte Spalte nutzt die vorhandene Gamer-Kartei mit **Zugliste** und **Aktualisierung**. Auf dem iPhone steht sie wie bisher unter dem Brett. Die Reiter können auch mit den Pfeiltasten sowie Pos1/Ende gewechselt werden.

Unter Aktualisierung stehen **5, 10, 15 und 30 Sekunden** zur Wahl, Standard **10 Sekunden**. Die Auswahl wird pro Mitglied in diesem Browser gespeichert; bei gesperrtem Browserspeicher funktioniert die aktuelle Auswahl trotzdem. Reiterwechsel verändert weder Stellung noch Aktualisierung. Die Ansicht bleibt rein passiv und verwendet ihre eigene Replay-Instanz.

- Vier-Bretter-Übersicht weiterhin 30 Sekunden.
- Intervall bezeichnet die Pause zwischen abgeschlossenen Abrufen; Netzlaufzeit kommt hinzu.
- Hintergrundtabs, Offline-Zustand, Verlassen des Bereichs und Abmeldung brechen laufende Ansichtsabrufe ab.
- Erfolgreich geladene beendete Partien werden nicht weiter automatisch abgefragt, auch nicht nach einem Intervallwechsel.
- Veraltete/fehlende Daten führen weiterhin zu langsamerem Wiederholen; die schnelle Auswahl umgeht keine Fehlerpause.
- Kürzere Intervalle prüfen auch die tatsächliche Cache-Frische. Ein vorheriger 30-Sekunden-Abruf blockiert somit keinen späteren 5-Sekunden-Abonnenten. Quellen werden zwischen Zuschauern geteilt, nicht separat pro Benutzer abgefragt.
- Bei DGT werden nur die sichtbaren vier bzw. das einzelne Brett geladen. PGN-Anbieter liefern weiterhin die gesamte Runde, die gemeinsam zwischengespeichert wird.

Quellenverzögerungen und vom Veranstalter eingestellte Verzögerungen bleiben bestehen. Es gibt keine garantierte Zeit vom Zug am physischen Brett bis zur Gamer-Anzeige.

## Veranstaltung und Spieler suchen

Veranstaltungsname, Status, Verband und Spielername einstellen, anschließend **Suchen** drücken. Eingabe und Filterwechsel allein senden keine Anfragen. Ohne Spielername wird der bereits vorhandene Veranstaltungskatalog lokal gefiltert. **Zurücksetzen** stellt die ungefilterte Liste her.

Mit Spielername durchsucht der Gamer die Paarungen der gefilterten, verfügbaren Veranstaltungen – in Vereins- und Turnierschach. Vor-/Nachname dürfen vertauscht sein; Großschreibung und Akzente sind unerheblich. Beispielsweise findet „Magnus Carlsen“ auch „Carlsen, Magnus“. Alle Suchwörter müssen zum selben Spieler gehören. Ein Treffer öffnet unmittelbar das betreffende Einzelbrett. Über Brettübersicht → Veranstaltungen geht es zurück zu den Suchergebnissen.

Eine Aktion prüft höchstens zwölf Veranstaltungen in Blöcken von maximal drei pro API-Anfrage. **Weitere Veranstaltungen durchsuchen** setzt danach fort. Fortschritt und nicht erreichbare Quellen werden angezeigt. Unterbrochene Suchen können ausdrücklich fortgesetzt werden; sie laufen nicht automatisch im Hintergrund weiter. Pro Veranstaltung werden höchstens 100 Treffer ausgegeben; bei mehr Treffern führt eine Schaltfläche zur gefilterten Brettübersicht.

Paarungen werden unabhängig vom gesuchten Namen 60 Sekunden gemeinsam gecacht. DGT-Suchen laden nur die Paarungsliste, keine einzelnen Brettdateien. Bei PGN wird die Rundenquelle verwendet. Suche und Brettdarstellung nutzen dieselbe bestehende Quellenvalidierung. Externe Fehler behalten die bisherigen Rückfall-/Wartezeiten.

**Suchgrenze:** Es werden die im Katalog aufgeführten Runden bekannter, automatisch gefundener oder manuell ergänzter Veranstaltungen durchsucht. Keine weltweite Suche durch unbekannte DGT-IDs, sämtliche historischen Runden oder das gesamte Lichess-Archiv. Noch nicht veröffentlichte Spielernamen können nicht gefunden werden. Bei partiellen Ausfällen ist „keine Treffer“ kein vollständiges Suchergebnis.

## Vereinsschach und Landesverbände

Die Reihenfolge beginnt weiterhin **Bundesliga → NRW → Ruhrgebiet → Hamm**. NRW umfasst beim Filtern auch Ruhrgebiet/Hamm, Ruhrgebiet auch Hamm. Hinzu kommen Baden, Bayern, Berlin, Brandenburg, Bremen, Hamburg, Hessen, Mecklenburg-Vorpommern, Niedersachsen, Rheinland-Pfalz, Saarland, Sachsen, Sachsen-Anhalt, Schleswig-Holstein, Thüringen und Württemberg – zunächst ohne weitere Untergliederung.

Baden und Württemberg sind getrennte Auswahlpunkte entsprechend den [Mitgliedsverbänden des Deutschen Schachbundes](https://www.schachbund.de/index.php/adressen_mitgliedsverbaende.html). Die vollständigen technischen Werte stehen in `CLUB_SCOPES` in `src/live-board-classification.js`; sie gelten für Oberfläche, eigene Quellen und konfigurierbare Veröffentlichungsseiten.

Eindeutig benannte deutsche Ligen werden aus dem Lichess-Katalog zugeordnet. Unklare bzw. verbandsübergreifende Ligabezeichnungen werden nicht willkürlich einem Landesverband zugeteilt; manuelle Zuordnung bleibt möglich. Bundesliga gehört ausschließlich zum Vereinsschach. Opens, Einzelturniere und eigenständige Einladungsturniere jeder Größe bleiben im Turnierschach. Nicht zugeordnete bestehende Vereinsquellen bleiben unter **Weitere Vereinsübertragungen**.

Die Erweiterung fügt nicht automatisch neue DGT-Veröffentlichungsseiten hinzu. Die bisherigen acht Seiten bleiben erhalten: Schachbundesliga, SBNRW, SVRuhrgebiet, SBHamm, SV Unna, Caissa Hamm, SV Bönen und SK Werne. Landesverbandsfilter schaffen keine Quellen, wenn dort aktuell keine passende Übertragung gefunden oder hinterlegt ist.

## Quellen und Konfiguration

- **Lichess:** öffentlicher `/api/broadcast/top`-Katalog mit höchstens 120 geprüften Einträgen, danach Rundenliste und PGN der gewählten Runde. Katalogcache fünf Minuten.
- **DGT LiveChess Cloud:** veröffentlichte Links auf festgelegten Vereins-/Verbandsseiten, anschließend direkte Cloud-Abfrage. Kein öffentlich dokumentiertes Gesamtverzeichnis aller Cloud-Veranstaltungen vorausgesetzt.
- **Öffentliche Live-PGN:** manuell oder per Konfiguration; der Host muss in `LIVE_BOARD_PGN_HOSTS` freigegeben sein.

Manuelle Quellen: DGT-Viewer-Link mit UUID und optionaler Runde, konkrete Lichess-Runde oder direkte freigegebene HTTPS-PGN. Normale Homepages/Ergebnistabellen sind keine Partielinks. Maximal 40 gemeinsame eigene Quellen in der vorhandenen D1-Tabelle; erneutes Hinzufügen derselben Quelle aktualisiert den bestehenden Eintrag. Entfernen benötigt wie bisher den zweiten Klick.

`LIVE_BOARD_DISCOVERY_PAGES` ersetzt die voreingestellten Seiten durch maximal acht Objekte: `id` (1–16 Kleinbuchstaben/Ziffern, eindeutig), `name`, öffentliche endgültige HTTPS-`url`, `category` (`club`, `tournament`, `mixed`) und bei Vereins-/gemischten Seiten `clubScope`. Jede Seite lädt höchstens eine passende Unterseite desselben Hosts nach, höchstens zwölf DGT-Veranstaltungen werden übernommen. Cache 30 Minuten. Keine fremden Skripte, Weiterleitungen, PDFs oder privaten Bereiche werden ausgewertet.

`LIVE_BOARD_PAGE_DISCOVERY=0` deaktiviert die DGT-Veröffentlichungsseitensuche; `LIVE_BOARD_DISCOVERY=0` beide automatischen Suchen. Konfigurierte/gespeicherte Quellen bleiben nutzbar. `LIVE_BOARD_EVENTS`, `LIVE_BOARD_PGN_HOSTS` und vorhandene Bindings bleiben kompatibel.

DGT-Einträge ohne geprüften Status erscheinen neutral unter „Alle Veranstaltungen“. Ohne explizite Runde verwendet die automatische Entdeckung die erste als live gemeldete, sonst die letzte belegte Runde. Beim Zuschauen bleibt die gewählte Runde fest.

Keine neuen Cronjobs. Cache API teilt Daten innerhalb eines Cloudflare-Standorts, nicht garantiert weltweit; innerhalb einer Worker-Instanz werden gleichzeitige Abrufe zusammengeführt. Private API-Antworten erhalten `no-store`; Anmeldedaten werden nicht an Quellen weitergegeben. Redirects bleiben gesperrt.

## Prüfung dieses Pakets

- **39 gezielte Tests bestanden:** Mitglieds-/Besucherzugriff, administrative Schreibrechte, Klassifikation, alle Landesverbände, Quellenparser, D1, Suchblöcke, Namenssuche, DGT-Suche ohne Brettabrufe, Cache-Frische bei Intervallwechsel, Fehlerpausen und beendete Partien.
- **Browser auf Desktop 1440×1000, iPad 820×1180 und iPhone 390×844:** gefilterte Suche erst bei Klick, Suchblöcke und Fortsetzung, Treffer öffnen, Reiter und alle vier Intervalle, Hintergrundpause, Lobby, Fußzeile, Zugnavigation, keine Veränderung der eigenen Partie, keine JavaScript-Fehler. Sichtprüfung der Reiterdarstellung durchgeführt.
- **Cloudflare workerd mit kontrollierten Gegenstellen (Mitgliederpaket, Worker hier unverändert):** gewöhnliches Mitglied, Besucher-Sperre, administrative Schreibsperre, Lichess/DGT, neue Spielersuche, 5-Sekunden-Antwort, gemeinsamer Cache und Redirect-Sperre bestanden.
- **Gesamtsuite:** 243 von 246 Tests bestanden. Drei Fehler in `account-deletion-tournaments.test.mjs` wegen `deleteProgress is not defined` treten identisch im unveränderten Ausgangspaket auf. Kontolöschung und deren Tests wurden nicht verändert. Daher keine Behauptung einer vollständig grünen Gesamtsuite.
- **Neue Fehlerfall-Browserprüfung:** Desktop/iPad/iPhone sowie nachgebildete HTTPS-Einbettung auf Desktop/iPhone. Seitenhöhe und Scrollposition vor, während und nach verzögerten Abfragen gleich; laufende Uhren ohne Reset, Uhrenkorrektur ohne Brett-Neuaufbau, neue Züge, Intervallwechsel während einer länger als 25 Sekunden dauernden Antwort, echter 45-Sekunden-Timeout, Wiederaufnahme und Partieende geprüft. Die bestehenden Browserprüfungen für Suche, Lobby, eigene Partie und Mitgliederzugriff bestehen ebenfalls.
- Neue Funktionen wurden mit kontrollierten Quellen geprüft. Kein neuer Live-End-to-End-Nachweis mit aktuell laufender externer Veranstaltung und echten Gamer-Zugangsdaten; keine Produktivbereitstellung. Frühere externe DGT-Tests des Ausgangspakets ersetzen diesen Nachweis nicht.

Im Worker-Verzeichnis:

```sh
node --test tests/live-board*.test.mjs
node tests/live-board-browser.mjs
node tests/live-board-stability-browser.mjs
node tests/live-board-worker-runtime.mjs
node --test tests/*.test.mjs
```

Browsertests benötigen Playwright/Chromium, Laufzeittests Miniflare. Optional `PLAYWRIGHT_MODULE`, `CHROMIUM_EXECUTABLE`, `MINIFLARE_MODULE` auf vorhandene Installationen setzen. Testwerkzeuge, lokale Bildschirmbilder und temporäre Arbeitsdateien werden nicht mitgeliefert.

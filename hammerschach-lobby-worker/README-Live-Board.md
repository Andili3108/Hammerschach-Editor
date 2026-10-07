# LIVE-BOARD – Mitglieder, Spielersuche und Aktualisierung

Stand: 7. Oktober 2026. Dieses Änderungs-ZIP ergänzt das gesicherte **Hammerschach-Gamer-LIVE-BOARD-Lichess-DGT-Komplettpaket-2026-10-07.zip**. Enthaltene Dateien in derselben Ordnerstruktur ersetzen/ergänzen, den Worker wie gewohnt bereitstellen und den Gamer neu laden. Frontend und Worker gehören zusammen. Keine Datenbankmigration, neuen Secrets oder Änderungen an `wrangler.toml` erforderlich. Es wurde nichts produktiv bereitgestellt.

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

- **35 gezielte Tests bestanden:** Mitglieds-/Besucherzugriff, administrative Schreibrechte, Klassifikation, alle Landesverbände, Quellenparser, D1, Suchblöcke, Namenssuche, DGT-Suche ohne Brettabrufe, Cache-Frische bei Intervallwechsel, Fehlerpausen und beendete Partien.
- **Browser auf Desktop 1440×1000, iPad 820×1180 und iPhone 390×844:** gefilterte Suche erst bei Klick, Suchblöcke und Fortsetzung, Treffer öffnen, Reiter und alle vier Intervalle, Hintergrundpause, Lobby, Fußzeile, Zugnavigation, keine Veränderung der eigenen Partie, keine JavaScript-Fehler. Sichtprüfung der Reiterdarstellung durchgeführt.
- **Cloudflare workerd mit kontrollierten Gegenstellen:** gewöhnliches Mitglied, Besucher-Sperre, administrative Schreibsperre, Lichess/DGT, neue Spielersuche, 5-Sekunden-Antwort, gemeinsamer Cache und Redirect-Sperre bestanden.
- **Gesamtsuite:** 239 von 242 Tests bestanden. Drei Fehler in `account-deletion-tournaments.test.mjs` wegen `deleteProgress is not defined` treten identisch im unveränderten Ausgangspaket auf. Kontolöschung und deren Tests wurden nicht verändert. Daher keine Behauptung einer vollständig grünen Gesamtsuite.
- Neue Funktionen wurden mit kontrollierten Quellen geprüft. Kein neuer Live-End-to-End-Nachweis mit aktuell laufender externer Veranstaltung und echten Gamer-Zugangsdaten; keine Produktivbereitstellung. Frühere externe DGT-Tests des Ausgangspakets ersetzen diesen Nachweis nicht.

Im Worker-Verzeichnis:

```sh
node --test tests/live-board*.test.mjs
node tests/live-board-browser.mjs
node tests/live-board-worker-runtime.mjs
node --test tests/*.test.mjs
```

Browsertests benötigen Playwright/Chromium, Laufzeittests Miniflare. Optional `PLAYWRIGHT_MODULE`, `CHROMIUM_EXECUTABLE`, `MINIFLARE_MODULE` auf vorhandene Installationen setzen. Testwerkzeuge, lokale Bildschirmbilder und temporäre Arbeitsdateien werden nicht mitgeliefert.

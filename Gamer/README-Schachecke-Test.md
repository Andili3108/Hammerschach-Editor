# Schachecke – Testpaket vom 11.10.2026

Dieses ZIP enthält ausschließlich neue und geänderte Dateien. Grundlage ist der im vorherigen Arbeitsschritt bereits verwendete Stand **Hammerschach-Gamer(2).zip** mit den Live-Board-Erweiterungen vom 8. Oktober. Das parallel angehängte `Hammerschach-Gamer.zip` ist ein abweichender älterer Stand. Dieses Testpaket ist daher für den genannten neueren Projektstand bestimmt.

## Einspielen

1. Die enthaltenen Dateien in die gleichnamigen bestehenden GitHub-Ordner übernehmen. **Ordner zusammenführen, nicht die vollständigen Ordner ersetzen.** Es sind keine neuen Projektordner nötig.
2. Das Frontend wie bisher über GitHub/Cloudflare veröffentlichen.
3. Auch den **Lobby-Worker** einschließlich `src/schachecke.js`, der geänderten `src/index.js` und `wrangler.toml` neu bereitstellen. Falls du ihn über Wrangler veröffentlichst: im Ordner `hammerschach-lobby-worker` den vorhandenen Befehl `npm run deploy` verwenden.
4. Den Gamer neu laden und als **Andili** anmelden. In der Lobby „Schachecke“ öffnen.

Die vorhandene Datei **Gamer/Trainer/puzzles.json** bleibt an ihrem Platz und unverändert. Sie ist im Testpaket nicht nochmals enthalten. Es wird kein zweiter Aufgabenbestand benötigt.

Der Ticker verwendet die bestehende D1-Datenbank. Seine zusätzliche Tabelle `gamer_news_cache` wird automatisch angelegt; neue Bindings, Secrets oder ein manueller SQL-Import sind nicht erforderlich. Bestehende Cron-Einträge bleiben erhalten, hinzu kommt `0 */6 * * *` für den Ticker (00/06/12/18 Uhr UTC). Beim ersten Öffnen kann der erste Nachrichtenabruf einige Sekunden dauern. Eine zentrale Sperre verhindert parallele Quellabfragen.

## Enthaltene Funktionen

- Lobby-Reiter **Chat** und **Schachecke**. Alle Mitglieder sehen beide Reiter; ausschließlich der angemeldete Administrator **Andili** kann die Schachecke öffnen. Bei anderen Mitgliedern bleibt der Chat sichtbar. Die zuletzt gewählte Ansicht wird pro Konto und Browser gespeichert.
- Links **Aufgaben der Woche**, rechts **Gamer-Ticker**, mit zurückhaltend unterschiedlichen Hintergrundfarben. Auf schmalen Ansichten stehen die Bereiche untereinander. Der Ticker scrollt innerhalb seiner Karte.
- Pro Woche 24 reproduzierbar ausgewählte Aufgaben: Montag bis Samstag je Leicht (800–1000), Mittel (1001–1500), Schwer (1501–2000) und Experte (2001–2400). Alle Aufgaben sind sofort wählbar; Sonntag bleibt die laufende Woche verfügbar. Wechsel am Montag nach Europe/Berlin, einschließlich Sommer-/Winterzeit. Identischer Datenbestand ergibt auf allen Geräten dieselbe Auswahl. Keine Punkte, Häkchen, Ranglisten oder Erfolgsstatistiken.
- Kompaktes Brett mit den globalen Brettfarben, Figuren, Brettanzeigen, Tönen und der gerätespezifischen Zugmethode. Antippen, Mausziehen und Touchziehen verwenden die bestehenden Eingabehelfer. Richtige/falsche Züge, Tipp, vollständiges Vorspielen der Lösung und Wiederholen. Bei Bauernumwandlung bleibt die Figur auswählbar, auch wenn für Live-Partien automatische Damenumwandlung aktiv ist.
- Maximal zehn deutschsprachige Nachrichten, neueste zuerst, mit Titel, Quelle und Veröffentlichungsdatum/-zeit. Originalartikel öffnen in einem neuen Tab. Bei Quellen ohne Uhrzeit wird ausschließlich das Datum angezeigt. Links und gleiche Überschriften werden entdoppelt; die Auswahl bevorzugt eine Quellenmischung.
- Zentrale Aktualisierung alle sechs Stunden; bei Ausfall einer Quelle bleiben deren zuletzt gespeicherte Meldungen erhalten. Der Browser fragt den Ticker nur beim Öffnen bzw. nach Ablauf des Intervalls erneut ab. Der lokale Minutentakt prüft lediglich, ob Wochen- oder Nachrichtenwechsel fällig sind.
- Der Mitglieder-Chat bleibt verbunden und empfängt Nachrichten, während die Schachecke sichtbar ist. Trainer und „Schach aktuell“ wurden nicht geändert.

## Nachrichtenquellen

Beim direkten Abruf am 11.10.2026 lieferten alle fünf eingebauten Quellen verwertbare Meldungen:

| Quelle | Abruf |
| --- | --- |
| ChessBase | https://de.chessbase.com/feed |
| Deutscher Schachbund | https://www.schachbund.de/share/dsb-feed.xml |
| Perlen vom Bodensee | https://perlenvombodensee.de/feed/ |
| Österreichischer Schachbund | https://www.chess.at/ – Übersicht und Veröffentlichungsdaten der Artikel |
| Schweizerischer Schachbund | https://swisschess.ch/de/verband/medien/news – Nachrichtenübersicht |

Es werden Titel, Veröffentlichungsdaten und Originalverweise übernommen, keine KI-Zusammenfassungen oder Bilder. Änderungen der externen Seitenstruktur können künftig eine Anpassung der jeweiligen Auswertung nötig machen.

## Geprüft

36 automatische Prüfungen erfolgreich: Wochenwechsel einschließlich Sommer-/Winterzeit und Jahreswechsel, eindeutige Auswahl und vollständige legale Zugfolgen mehrerer Wochen, Ratingbereiche, RSS-/Atom-Auswertung, Österreich-/Schweiz-Auswertung, ungültige Links/Datumswerte, Entdoppelung, Cache und parallele Aktualisierungen, Quellenausfall, serverseitige Zugriffssperre sowie betroffene Live-Board- und Abfragebudget-Funktionen.

Browserprüfung mit Chromium in Desktop- (1440 × 1000), iPad- (820 × 1180) und iPhone-Ansicht (390 × 844): Aufgabe lösen, falschen Zug ablehnen, Tag und Schwierigkeit wechseln, Tipp, Lösung und Wiederholen; Maus-/Touchziehen; globale Figuren/Farben und Hell-/Dunkeldarstellung; Umwandlungsauswahl; Chatnachricht bei ausgeblendetem Chat; gespeicherte Ansicht nach Neuladen; Kontowechsel zu einem gesperrten Mitglied. Keine JavaScript-Laufzeitfehler in diesen Tests. Layout-Screenshots wurden geprüft; die Testmeldungen werden ausschließlich im Browsertest erzeugt.

Die mobilen Ansichten wurden **emuliert**, nicht auf echten Apple-Geräten geprüft. Der tatsächliche Cloudflare-Deploy und die dortige zeitgesteuerte Ausführung sind erst nach dem Einspielen überprüfbar.

Tests bei Bedarf aus `hammerschach-lobby-worker`:

```sh
node --test tests/schachecke.test.mjs tests/live-board-analysis.test.mjs tests/live-board.test.mjs tests/request-budget.test.mjs
node tests/schachecke-browser.mjs
```

Der zweite Befehl benötigt Playwright und Chromium; optional können `PLAYWRIGHT_MODULE` und `CHROMIUM_EXECUTABLE` auf vorhandene Installationen zeigen.

## Dein kurzer Praxistest

1. Als Andili zwischen Chat und Schachecke wechseln; neue Chatnachricht kontrollieren.
2. Einige Aufgaben verschiedener Tage/Stufen lösen, Tipp/Lösung/Wiederholen ausprobieren.
3. Eigene Brettfarbe, Figurensatz und Zugmethode auf Mac, iPad und iPhone ausprobieren.
4. Einen Tickerartikel öffnen; Quelle und neues Browser-Tab kontrollieren.
5. Mit einem gewöhnlichen Mitgliedskonto prüfen: Reiter sichtbar, Schachecke öffnet sich nicht.

## Spätere Freigabe

Erst nach Andilis Freigabe in `hammerschach-lobby-worker/wrangler.toml` **SCHACHECKE_MEMBERS_ENABLED = "1"** setzen und den Lobby-Worker erneut deployen. Bis dahin bleibt der Wert **"0"**. Ein weiterer Frontend-Umbau ist dafür nicht nötig. Nach erfolgreichem Praxistest kann das vollständige Gesamtpaket erstellt werden.

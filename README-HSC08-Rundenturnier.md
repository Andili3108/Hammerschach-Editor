# HSC08 – Rundenturnier-Teststand vom 1. November 2026

## Einspielen

Die Dateien des jeweiligen Änderungs-ZIPs mit gleicher Ordnerstruktur übernehmen. Für die Sicherungsfunktion sowohl die enthaltenen Frontend-Dateien einspielen als auch den aktualisierten Worker veröffentlichen. Der lokale Projektordner enthält die Änderungen bereits.

## Testablauf für Andili

1. Rundenturnier mit mindestens zwei Teilnehmern konfigurieren. Titel, Turnierbeginn, letzter Spieltermin und Bedenkzeit ergänzen. Einfach-/Doppelrunde und Punktewertung wählen.
2. Entwurf speichern und in die Turnieransicht übernehmen.
3. Im Bereich Runden und Paarungen den Paarungsplan vorbereiten. Der Plan verwendet die Teilnehmerreihenfolge für die Startnummern; es findet keine zufällige Auslosung statt. Alle Begegnungen, Farben und gegebenenfalls spielfreien Teilnehmer prüfen. Noch keine Ergebnisse möglich.
4. Bei Änderungsbedarf den Paarungsentwurf verwerfen. Nach der Freigabe kann der Plan nicht mehr verworfen werden.
5. Paarungsplan freigeben. Die separate Teilnehmerliste verschwindet. Teilnehmerzugang, Modus, Punktewertung, Durchgänge, Rundenzahl und Bedenkzeit sind gesperrt. Namenskorrekturen, Beschreibung und Termine bleiben über die Konfiguration möglich.
6. Ergebnisse direkt an den Paarungen auswählen. Die Reihenfolge ist frei. Gespielte und kampflose Ergebnisse sind getrennt. Spielfrei bringt keine Punkte.
7. Nach dem ersten Ergebnis erscheint die Rangliste mit Platz, Name, Gespielt, Punkten und Sonneborn-Berger. Bei Gleichheit folgt der direkte Vergleich; unvollständige direkte Vergleiche werden im Zwischenstand nicht zur Auflösung herangezogen. Vollständige Gleichstände teilen einen Platz.
8. Zur Ergebniskorrektur einen anderen Wert wählen und begründen. Auch Offen ist möglich. Änderungen werden mit Person und Zeitpunkt protokolliert.
9. Nach Klärung aller Partien Turnier abschließen. Die Rangliste zeigt den Endstand und den/die Vereinsmeister. Für Korrekturen ausdrücklich wieder öffnen.

## Schutz und noch ausstehende Funktionen

- Nur Andili hat Zugriff; keine öffentliche Freigabe oder Spielleiterdelegation hinzugefügt.
- Sobald jemals ein Ergebnis erfasst wurde, ist vollständiges Löschen gesperrt – auch nach Entfernen des Ergebnisses, Abschluss, Wiederöffnung oder Speichern einer Konfiguration. Die Sperre wird serverseitig durchgesetzt.
- Im Menü „Sichern / Wiederherstellen“ steht jetzt eine Sicherungs-ZIP bereit: `HSC08-Sicherung.json` enthält den gespeicherten Entwurf, den übernommenen Ansichtsstand, Teilnehmer, Ergebnisse und Protokoll. `HSC08-Turnier.html` ist eine eigenständige, statische Seite im Gamer-Stil mit eingebettetem Logo, ausschließlich mit dem übernommenen Ansichtsstand. Sie kann im Browser geöffnet oder auf anderen Seiten verwendet werden. Noch ungespeicherte Formulareingaben sind in keiner der Dateien enthalten.
- Zum Zurücksetzen zuerst die ZIP herunterladen und sicher aufbewahren. Danach das Speichern bestätigen, den aktuellen Turniernamen und das Gamer-Passwort eingeben und die zusätzliche Rückfrage bestätigen. Hat sich seit der Sicherung etwas geändert, wird das Zurücksetzen abgewiesen. Nur die Turnierdaten werden entfernt; Seite und Navigation bleiben.
- Wiederherstellen: ZIP entpacken, auf einer leeren Turnierseite die JSON-Datei auswählen, Gamer-Passwort sowie WIEDERHERSTELLEN eingeben und bestätigen. Vorhandene Turniere werden nicht überschrieben. Die HTML-Datei ist nicht für einen Import bestimmt. Der Zugriff bleibt ausschließlich für Andili freigeschaltet.
- Zum Testen: Rundenturnier sichern, geschützt zurücksetzen, JSON wiederherstellen und Ergebnisse prüfen. Danach bei Bedarf erneut sichern und zurücksetzen, um einen Schweizer Entwurf anzulegen. Dies ist keine Archivfunktion.
- Rundenturnier-Rückzüge einschließlich 50-Prozent-Regel und manuelle Änderungen einzelner Paarungen nach Planerstellung stehen noch aus. Nicht durch Löschen eines Teilnehmers umgehen.
- Schweizer Testbetrieb: Unter „Runden und Paarungen“ Beginn und letzten Spieltermin eintragen, bei gleich bewerteten Spielern die Startnummern vergeben und „Runde 1 vorbereiten“ wählen. Für Teilnehmer ohne DWZ und Schätzung legt der Spielleiter die Einordnung fest. Ein Entwurf lässt sich verwerfen oder freigeben. Erst die Freigabe macht die Paarungen in der Leseansicht sichtbar. Erst nach Entscheidung aller Partien lässt sich die folgende Runde vorbereiten. Die Rangliste zeigt Punkte, Buchholz und Buchholz Cut 1. Details stehen im nachfolgenden Abschnitt zur Schweizer Feinwertung.
- Noch nicht übernommene Konfigurationsentwürfe müssen vor einer Turnieraktion übernommen werden. Ergebnisse werden nicht in einen abweichenden Konfigurationsentwurf hineingemischt.

## Schweizer Feinwertung und Verwaltung – 9. November 2026

- Reihenfolge: Turnierpunkte → Buchholz → Buchholz Cut 1 → geteilter Platz. Beide Wertungen 1–½–0 und 3–1–0 verwenden ihre jeweiligen Punkte auch für die Feinwertung.
- Nach jedem gespeicherten Ergebnis werden alle Beiträge neu berechnet. Bestehende Schweizer Spielstände erhalten diese Berechnung bereits beim Laden. Offene Partien haben noch keinen Buchholz-Beitrag. Paarungsentwürfe zählen nicht. Deshalb verändern sich Zwischenstände mit weiteren Ergebnissen.
- FIDE C.07 (1. März 2026), Art. 16.3–16.5: Gespielte Partien tragen die angepassten Gegnerpunkte bei. Für ungespielte Runden gilt die eigene Punktzahl, gedeckelt bei kampflosen Ergebnissen durch die angepassten Gegnerpunkte, sonst durch geplante Rundenzahl × Remiswert. Bei sechs Runden ist diese Grenze 3 beziehungsweise 6.
- Für die Feinwertung bisheriger Gegner werden ausgesetzte Runden, auf die nur weitere freiwillig ungespielte Runden folgen, als Remis gerechnet. Die echten Turnierpunkte bleiben unverändert. Im laufenden Zwischenstand werden nur freigegebene Runden betrachtet. Eine spätere Rückkehr kann die Anpassung wieder ändern.
- Cut 1 streicht den niedrigsten Beitrag aus freiwillig ungespielten Runden (Aussetzen oder kampfloser Verlust), wenn solche Runden vorhanden sind. Sonst entfällt der insgesamt niedrigste Beitrag. Die ausklappbare Berechnung zeigt Art, Gegner, Grenzen, Beitrag und Streichung je Runde.
- Vor der Auslosung unter „Teilnahme an dieser Runde“ das Aussetzen markieren. Die Markierung gilt nur für diese Runde. „Teilnehmer zurückziehen …“ mit Bestätigung schließt den Teilnehmer von künftigen Paarungen aus. Bereits freigegebene Partien bleiben bestehen und müssen entschieden werden. Die Rangliste kennzeichnet Zurückgezogene. Der Rückzug ist über die Oberfläche derzeit nicht rücknehmbar.
- Aussetzen und Rückzug werden mit gespeichert; Rückzüge erscheinen im internen Protokoll. Aussetzen steht im gespeicherten Paarungsplan. Sicherung und Wiederherstellung erhalten diese Angaben einschließlich abgeschlossener Schweizer Turniere. Die Schweizer Rangliste und ihre Erklärungen werden aus den gesicherten Ergebnissen neu berechnet, um doppelte Daten zu vermeiden.
- Nach allen geplanten, freigegebenen und entschiedenen Runden kann Andili das Turnier abschließen. Die Tabelle heißt dann Endstand und zeigt alle gleichplatzierten Sieger. Für spätere Korrekturen „Für Korrektur öffnen“ wählen. Ein Abschluss sperrt Ergebnisänderungen serverseitig.
- Konfiguration und Turnierseite teilen Gamer-Felder und abgerundete Bereiche. Paarungen stehen als Brett / Weiß / Ergebnis / Schwarz zusammen. Die neueste Runde ist geöffnet, ältere Runden sind einklappbar. Auf kleinen Bildschirmen steht das Ergebnis unter den Gegnern. Die Rangliste lässt sich bei Platzmangel seitlich lesen.
- Erste Schritte und Bedienhilfe befinden sich direkt in der Konfiguration unter „ⓘ Erste Schritte und Hilfe zur Turnierverwaltung“. Die allgemeinen Gamer-Hilfen im Header wurden auf Bezug zur Änderung geprüft; sie beschreiben weiterhin die allgemeinen Gamer-Funktionen.
- Weiter offen sind insbesondere manuelle Paarungseingriffe, nachträgliche Rundenterminänderungen, Spielleiterdelegation und öffentliche Freigabe. Die verwendete Dutch-Bibliothek und die 3–1–0-Anpassung sind keine FIDE-Zertifizierung.

Regelquelle: https://handbook.fide.com/chapter/TieBreakRegulations032026

## Einspielen und Prüfung

Den Inhalt des aktuellen Änderungs-ZIPs mit derselben Ordnerstruktur übernehmen und den Lobby-Worker neu veröffentlichen. Der lokale entpackte Projektordner ist bereits aktualisiert. Bestehende HSC08-Daten werden weiterverwendet.

`node --test tests/hsc08*.test.mjs` prüft Zugriffsschutz, Speicherung, Wertung, Sicherung und Lebenszyklus. `tests/hsc08-tiebreak-browser.mjs` prüft den gebündelten Worker mit lokalen Testdaten, drei Bildschirmgrößen, Erscheinungsbildern, Konfiguration und Leseansicht. Dafür Playwright bereitstellen und bei Bedarf PLAYWRIGHT_MODULE, HSC08_WORKER_MODULE, CHROMIUM_EXECUTABLE und HSC_SCREENSHOT_DIR setzen. Die Browserprüfung simuliert Größen in Chromium; reale iOS-Geräte und Safari sind nicht damit getestet.

Prüfergebnis dieses Änderungsstands: 29 automatisierte Tests bestanden. Der gesamte Worker wurde erfolgreich gebündelt. Der Browserablauf für Desktop, iPad- und iPhone-Größen einschließlich drei Erscheinungsbildern, Konfiguration, Zwischenstand, Leseansicht, Abschluss und Wiederöffnung ist bestanden. Bestehende Ergebnisse müssen für die neue Feinwertung nicht gelöscht werden.

## Header vom 9. November 2026

Die aktive Vereinsmeisterschaft ist als bordeauxrote Schaltfläche „Meisterschaft“ direkt sichtbar. Vereinspokal und Blitzrunden sind sichtbar, jedoch als noch nicht verfügbar deaktiviert. „Zur Lobby“ führt zurück. „Verwaltung“ bündelt Konfiguration, Leseansicht und Sicherung. „Turnier vollständig löschen“ steht als farblich abgesetzter letzter Menüpunkt hinter einer Trennlinie. Die bestehenden Passwort- und Bestätigungsschritte gelten weiterhin. In der Leseansicht führt „Zur Verwaltung“ zurück. Auf kleinen Bildschirmen und im mobilen Menü wird dieselbe Auswahl angeboten.

Für diese Headeränderung die beiden Frontend-Dateien Gamer/index.html und Gamer/js/hsc08.js gemeinsam bereitstellen. Die Bedienwege in der privaten Konfiguration gelten ab „Verwaltung“.

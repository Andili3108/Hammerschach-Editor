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
- Rückzüge einschließlich 50-Prozent-Regel und manuelle Änderungen einzelner Paarungen nach Planerstellung stehen noch aus. Nicht durch Löschen eines Teilnehmers umgehen.
- Schweizer Testbetrieb: Unter „Runden und Paarungen“ Beginn und letzten Spieltermin eintragen, bei gleich bewerteten Spielern die Startnummern vergeben und „Runde 1 vorbereiten“ wählen. Für Teilnehmer ohne DWZ und Schätzung legt der Spielleiter die Einordnung fest. Ein Entwurf lässt sich verwerfen oder freigeben. Erst die Freigabe macht die Paarungen in der Leseansicht sichtbar. Erst nach Entscheidung aller Partien lässt sich die folgende Runde vorbereiten. Die Rangliste zeigt vorläufige Turnierpunkte. Buchholz, Cut 1 und der endgültige Schweizer Turnierabschluss stehen noch aus.
- Noch nicht übernommene Konfigurationsentwürfe müssen vor einer Turnieraktion übernommen werden. Ergebnisse werden nicht in einen abweichenden Konfigurationsentwurf hineingemischt.

## Prüfung

22 automatisierte Tests für API, Speicherung, Zugriff, Konkurrenz, Migration, Paarungen, Farbanzahl, Punkte/Feinwertung und Lebenszyklus bestanden. Zusätzlich wurde die Syntax des eingebetteten Browserskripts geprüft. Browserprüfungen wurden für den neuen Ablauf erweitert, konnten diesmal aber nicht ausgeführt werden: Die automatische Freigabeprüfung für die Installation der Testwerkzeuge scheiterte am gemeldeten Nutzungslimit. Es wird keine erfolgreiche Desktop-/iPad-/iPhone-Browserprüfung für diesen Stand behauptet.

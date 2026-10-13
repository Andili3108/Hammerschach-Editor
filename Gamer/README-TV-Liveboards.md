# Liveboards im Gamer-TV

## Einbau

Das Änderungs-ZIP enthält ausschließlich neue und geänderte Dateien mit der bisherigen Ordnerstruktur. Diese Dateien in das vorhandene Projekt übernehmen; die übrigen Projektdateien werden weiterhin benötigt.

1. Den Worker aus `hammerschach-lobby-worker` mit der geänderten `src/index.js` wie bisher veröffentlichen. Die neuen Felder werden zusammen mit den vorhandenen TV-Einstellungen gespeichert; keine Datenbankmigration notwendig.
2. Die enthaltenen Dateien aus `Gamer` auf die Website übernehmen, einschließlich der neuen `js/tv-liveboards.js`. Die Versionsangaben in `index.html` aktualisieren die betroffenen Browserdateien.
3. Gamer neu laden. In der TV-Regie den gewünschten Sender auswählen und „Liveboards öffnen“ anzeigen aktivieren. Anschließend den bisherigen Speichern-Button verwenden.

Die Schaltfläche ist bei bestehenden Konfigurationen zunächst ausgeschaltet. Worker und Website müssen beide aktualisiert werden, damit sich die neuen Einstellungen speichern lassen. Es wurde nichts auf der laufenden Website veröffentlicht.

## TV-Regie

Jeder Sender TV 1, TV 2 und TV 3 besitzt eigene Einstellungen:

- **„Liveboards öffnen“ anzeigen:** blendet die Schaltfläche ein oder vollständig aus. Die Turnierzuordnungen bleiben beim Ausschalten gespeichert.
- **Bevorzugte Turniere auswählen:** das vorhandene Angebot laden, nach einem Namen suchen und die gewünschten Veranstaltungen ankreuzen. Bis zu zwölf Zuordnungen sind möglich; Vereinsschach steht ebenfalls zur Auswahl. „Entfernen“ löst nur die Senderzuordnung und löscht keine Übertragung.
- **Beim Öffnen anzeigen:** entweder die Turnierauswahl mit bevorzugten Turnieren im Auswahlfeld oder unmittelbar das erste zugeordnete Turnier. Ohne Zuordnung erscheint immer die allgemeine Turnierauswahl.

Speichern übernimmt die Einstellungen für alle Mitglieder. Bei einem anderen Programm kann die Schaltfläche durch Entfernen des Häkchens wieder ausgeschaltet werden. Bei mehrtägigen Veranstaltungen die Runde prüfen: manche Quellen verwenden eigene Übertragungskennungen pro Runde. Es gibt keine automatische Zuordnung zur gerade kommentierten Partie.

## Bedienung

„♟ Liveboards öffnen“ öffnet ein frei verschiebbares Fenster innerhalb von Gamer-TV. Die vorhandene Liveboard-Ansicht wird weiterverwendet: Brettübersicht, Einzelbrett, Zugliste, Rundenwahl und bisherige Funktionen bleiben verfügbar. Der Videoplayer wird dabei weder neu geladen noch gestoppt; sein bisheriger Tonzustand bleibt erhalten.

- Das Fenster an der Titelleiste mit Maus oder Finger verschieben. Mit fokussiertem Fenstertitel geht es auch über die Pfeiltasten.
- **−** minimiert das Fenster; **□** stellt es mit der bisherigen Partie wieder her. Liveboard-Abfragen und Engine werden während der Minimierung pausiert.
- **✕** oder **Escape** im Fenster schließen es. Der Stream bleibt bestehen.
- Bevorzugte Turniere lassen sich im Auswahlfeld öffnen; **Alle Turniere** und **Vereinsschach** führen unabhängig von der Sendung in die übrige Auswahl.
- Beim Senderwechsel, beim Verlassen von Gamer-TV oder beim Abschalten der Funktion für den betrachteten Sender wird das Fenster geschlossen.

Die Einzelbrettansicht hat am großen Bildschirm die bisherige Breite. Auf schmaleren Bildschirmen passt sie sich an den verfügbaren Platz an. Überlange Inhalte werden innerhalb des Fensters gescrollt; die Titelleiste mit den Fensterknöpfen bleibt erreichbar. Es wird kein zusätzlicher Browser-Tab geöffnet.

## Prüfung

- 24 automatisierte Prüfungen für TV-Konfiguration, Liveboard-Zugriff, Brettdaten, Uhren und Partieanalyse.
- Neuer Browsertest `hammerschach-lobby-worker/tests/tv-liveboards-browser.mjs`: Desktop (1440 × 1000), Tablet (820 × 1180) und Smartphone (390 × 844); Schalter, Zuordnung, Speichern, Einzelbrettgröße, Verschieben, Minimieren/Wiederherstellen, Schließen, Senderwechsel sowie Rückkehr in die normale Liveboard-Ansicht.
- Der Browsertest prüft, dass das Videoelement und seine Quelle bei der Fensterbedienung unverändert bleiben. Er verwendet lokale Testpartien und abgefangene Netzwerkantworten; eine reale YouTube-Wiedergabe einschließlich hörbaren Tons wurde damit nicht getestet.

Die Browsertests verwenden Playwright; bei Bedarf die vorhandenen Umgebungsvariablen `PLAYWRIGHT_MODULE` und `CHROMIUM_EXECUTABLE` auf die lokale Installation setzen.

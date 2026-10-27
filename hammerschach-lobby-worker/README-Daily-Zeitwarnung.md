# Daily-Zeitwarnung – Stand 27.10.2026

Bei höchstens acht Stunden verbleibender eigener Zugzeit erinnert der Gamer per E-Mail. Das gilt für Daily Classic und Daily Freestyle, einschließlich Daily-Turnierpartien. Die Nachricht enthält Gegner, Fristende in Berliner Zeit und einen Link zur Partie. Die Prüfung läuft über den vorhandenen Minuten-Cron des Workers und benötigt keinen geöffneten Browser.

## Einspielen

Die Dateien aus dem Änderungs-ZIP unter Beibehaltung der Ordnerstruktur in das vorhandene Projekt übernehmen. Sowohl die geänderten Gamer-Dateien veröffentlichen als auch den Lobby-Worker mit dem neuen Modul `src/daily-low-time.js` bereitstellen. Nur die HTML-Dateien hochzuladen reicht nicht aus. Die vorhandene Cron-Konfiguration in `wrangler.toml` bleibt gültig; vorhandene Mail-Zugangsdaten werden weiterverwendet.

Beim ersten Zugriff auf die Mail-Einstellungen beziehungsweise beim nächsten Minutenlauf ergänzt der Worker automatisch die Datenbankspalte `daily_low_time_enabled` mit Vorgabe `1`. Dadurch ist das neue Häkchen auch für vorhandene Mitglieder gesetzt. Accounts ohne bisherige Einstellungszeile verwenden ebenfalls die aktivierte Vorgabe. Vorhandene Einstellungen der anderen Mail-Arten bleiben bestehen. Eine anschließende Abwahl wird gespeichert und bei späteren Starts nicht überschrieben. Auch ältere Browserstände, die das neue Feld noch nicht übermitteln, setzen eine gespeicherte Abwahl nicht zurück.

Bereits laufende Daily-Partien innerhalb des Acht-Stunden-Fensters werden nach Bereitstellung beim nächsten Prüflauf berücksichtigt. Bereits abgelaufene Fristen lösen keine Zeitwarnung aus.

## Bedienung und Vorgaben

Unter „Mein Profil“ → „E-Mail-Benachrichtigungen“ lässt sich die Zeitwarnung separat ein- oder ausschalten. Anschließend „Einstellungen speichern“ wählen.

Bei Neuanmeldungen sind eingeschaltet:

- Mail bei eigener Daily-Zugpflicht
- Acht-Stunden-Erinnerung
- Mail zum Ende einer Daily-Partie
- Information zu neu veröffentlichten Turnieren

Gamer-Neuigkeiten und Funktionsupdates sind standardmäßig ausgeschaltet. Versand erfolgt an die bestätigte Account-Mailadresse; bestehende Accounts aus der Zeit vor Einführung der Verifizierung werden weiterhin nach der vorhandenen Accountregel behandelt.

## Verarbeitung und Prüfung

Die Auswahl fälliger Partien nutzt den vorhandenen Daily-Index. Vor dem Versand werden laufende Partie, eigener Zug, Zugnummer und tatsächliches Fristende im Spielraum nochmals geprüft. Die Reservierung im Mailprotokoll erfolgt atomar pro Raum, Zugnummer und Empfänger. Erfolgreich verarbeitete Warnungen werden nicht erneut versendet; gemeldete Versandfehler können nach fünf Minuten erneut versucht werden, solange die Zugfrist noch läuft. Die Admin-Systemübersicht zeigt diese Nachrichten als „Daily: 8-Stunden-Erinnerung“.

Pro Minutenlauf werden bis zu 50 fällige Partien verarbeitet. Weitere folgen in den nächsten Läufen. Die Zustellung hängt zusätzlich vom vorhandenen Maildienst ab. Nach einem unklaren Versandabbruch zwischen Mailannahme und Protokollspeicherung ist wie bei anderen externen Maildiensten keine absolute Einmalzustellung garantierbar.

Die automatisierten Prüfungen verwenden echtes SQLite für Migration, Auswahl und Versandreservierung sowie simulierten Mailversand. Sie decken Classic/Freestyle, beide Farben, die Acht-Stunden-Grenze, erledigte und abgelaufene Partien, Abwahl, Verifizierung, parallele Auslösung, neue Zugfristen, Wiederholung nach Fehlern, Pakete über 50 Partien sowie Laden und Speichern der Oberfläche ab.

Aus dem Worker-Ordner mit Node.js 24 ausführen:

```sh
node --test tests/daily-low-time.test.mjs
```

Es wurden keine Testmails an Mitglieder versendet und keine Änderungen am laufenden Server vorgenommen. Das integrierte Handbuch und beide Datenschutzanzeigen sind aktualisiert; im Handbuch ist außerdem die Reader-Sortierung dokumentiert.

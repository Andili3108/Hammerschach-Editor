# Automatischer Nachtmodus · 21.10.2026

Unter Einstellungen → Darstellung → Oberfläche lässt sich „Nachtmodus automatisch“ einschalten. Die Funktion folgt der vom Gerät gemeldeten Hell-/Dunkel-Einstellung, ohne eigene Uhrzeiten.

- Bei dunkler Geräteeinstellung erscheint die bisherige dunkle Darstellung.
- Bei heller Geräteeinstellung kehrt die gewählte Tagesansicht „Hell“ oder „Sanft“ zurück.
- Die Tagesansicht bleibt bei Gerätewechseln unverändert gespeichert. Sie kann auch während des Nachtmodus geändert werden.
- Ohne Automatik bleiben alle drei bisherigen Farbschemata manuell wählbar.
- Ist beim Einschalten bereits „Dunkel“ gewählt, wird „Sanft“ als Tagesansicht eingestellt. Bei aktiver Automatik ist die manuelle Option „Dunkel“ gesperrt; „Hell“ und „Sanft“ bleiben wählbar.
- Die Automatik ist zunächst ausgeschaltet. Sie wird wie das Farbschema lokal und bei Anmeldung im Mitgliedskonto gespeichert. Jedes Gerät folgt seiner eigenen Systemeinstellung.
- Änderungen der Geräteeinstellung werden im geöffneten Gamer übernommen. Bei Rückkehr aus dem Hintergrund wird die Einstellung erneut ausgewertet.
- Eingebundene Bereiche erhalten das tatsächlich aktive Farbschema. Die Brettfarben bleiben unabhängig davon.

## Übernahme

Die Dateien des Änderungs-ZIPs über die bestehenden Dateien legen und dabei die Ordnerstruktur beibehalten. Das ZIP enthält ausschließlich geänderte Projektdateien und diese Anleitung.

Für die Kontosynchronisierung zuerst den aktualisierten Lobby-Worker bereitstellen, danach die Gamer-Dateien. Der Worker muss das neue Feld `autoNight` akzeptieren; eine Datenbankmigration ist nicht erforderlich. Die HTML-Dateien haben ausschließlich aktualisierte Script-Versionsangaben, damit Browser die geänderten Skripte neu laden.

Es wurde nichts veröffentlicht. Die vorhandene Gesamt-ZIP wurde nicht verändert und kein vollständiges Gamerpaket erstellt.

## Prüfung

66 automatisierte Prüfungen erfolgreich: Gerätewechsel aus Hell/Sanft, Rückkehr, Start im Dunkelmodus, Neuladen, deaktivierte Automatik, Änderung der Tagesansicht im Nachtmodus, Speicherung, Wechsel der Einstellungen, Rückkehr aus dem Hintergrund, ältere MediaQuery-Listener, fehlende MediaQuery-Unterstützung, gesperrter Browserspeicher, berechtigte/unberechtigte Elternnachrichten, Weitergabe des Nachtmodus an die eingebundenen Bereiche, tatsächlicher Einstellungs-Schalter und Zulässigkeit des neuen Feldes im Worker. Syntaxprüfung aller geänderten JavaScript-Dateien bestanden.

Die Prüfungen simulieren Browser- und Geräteereignisse. Ein visueller Test auf einem echten iPad und ein Test gegen den laufenden Kontoserver stehen noch aus.

Zum Gerätetest: „Hell“ wählen und Automatik einschalten; in den iPad-Einstellungen zwischen Hell und Dunkel wechseln. Anschließend mit „Sanft“ wiederholen, den Gamer einmal im Dunkelmodus neu laden und den Wechsel auch in einem eingebundenen Bereich prüfen.

Technische Grundlage: [MDN: matchMedia](https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia).

## Enthaltene Dateien

```text
Hammerschach-Gamer/Gamer/Analyzer/index.html
Hammerschach-Gamer/Gamer/Fairplay/index.html
Hammerschach-Gamer/Gamer/Mattbilder/index.html
Hammerschach-Gamer/Gamer/Mediathek/index.html
Hammerschach-Gamer/Gamer/Openings/index.html
Hammerschach-Gamer/Gamer/Player/index.html
Hammerschach-Gamer/Gamer/Reader/index.html
Hammerschach-Gamer/Gamer/SchachNews/blitz-finals-2027.html
Hammerschach-Gamer/Gamer/SchachNews/freestyle-neu-denken.html
Hammerschach-Gamer/Gamer/SchachNews/online-fide-wertung.html
Hammerschach-Gamer/Gamer/SchachNews/schacholympiade-2026.html
Hammerschach-Gamer/Gamer/SchachNews/schulbrett-weltspitze.html
Hammerschach-Gamer/Gamer/SchachNews/stroebeck-gemeinschaft.html
Hammerschach-Gamer/Gamer/SchachNews/vertrauen-online-schach.html
Hammerschach-Gamer/Gamer/Schachlernen/index.html
Hammerschach-Gamer/Gamer/Trainer/index.html
Hammerschach-Gamer/Gamer/Trainingsimpulse/index.html
Hammerschach-Gamer/Gamer/Turnierberichte/quick-round-robin-2026/index.html
Hammerschach-Gamer/Gamer/Turnierberichte/unna-open-2025/index.html
Hammerschach-Gamer/Gamer/datenschutz.html
Hammerschach-Gamer/Gamer/impressum.html
Hammerschach-Gamer/Gamer/index.html
Hammerschach-Gamer/Gamer/js/embedded-tools.js
Hammerschach-Gamer/Gamer/js/gamer-appearance.js
Hammerschach-Gamer/Gamer/js/gamer-preferences.js
Hammerschach-Gamer/Gamer/js/gamer-settings.js
Hammerschach-Gamer/Gamer/js/header-ui.js
Hammerschach-Gamer/Gamer/js/mediathek.js
Hammerschach-Gamer/Gamer/js/training-impulses.js
Hammerschach-Gamer/Gamer/schachlabor/index.html
Hammerschach-Gamer/README-Auto-Nachtmodus.md
Hammerschach-Gamer/hammerschach-lobby-worker/src/gamer-preferences.js
```

# HSC08 – erster geschützter Teststand

Basis: die vom Nutzer am 30.10.2026 zur Bearbeitung bestätigten Projektdateien. Vor der Bearbeitung wurden diese mit der vorhandenen vollständigen `Hammerschach-Gamer.zip` abgeglichen. Der zuvor genannte datierte ZIP-Name ist lokal nicht vorhanden.

## Enthalten

- Andili erhält unter Schachwelt die Rubrik Vereine / HSC08, auch im mobilen Menü. Die gemeinsame Navigation wird auf Besucher-Startansicht und Mitglieder-Lobby verwendet; ohne bestätigte Admin-Anmeldung bleibt die Rubrik verborgen.
- Geschützte Seitenansicht mit Original-HSC08-Logo, Titel, Ausschreibung und freier Teilnehmerliste.
- Separate Konfigurationsansicht für Titel, Modus (Rundenturnier/Schweizer System), Beschreibung und Namen. Noch keine Spielleiterdelegation.
- Vorhandener Gamer-Header bleibt bestehen. Ergänzte Turnierauswahl mit deaktivierten Einträgen für Vereinspokal und Blitzrunden; Rückkehr, Konfiguration und Löschung im Header.
- Serverseitige Session-, Admin- und Andili-Prüfung für jeden neuen Seiten-/Datenzugriff. Die vollständige neue Seite inklusive Logo wird nur authentifiziert ausgeliefert. Keine öffentlich abrufbare HSC08-HTML-Datei.
- Löschung verlangt aktuelles Admin-Passwort, serverseitige Begrenzung von Passwortversuchen und ausgeschriebene Bestätigung. Alle derzeit gespeicherten Turnierinhalte werden entfernt. Die feste Seite bleibt leer erreichbar.
- Eigenständige Tabelle `hsc08_championship`; keine Änderung bestehender Online-Turniertabellen. Revisionsprüfung verhindert Überschreiben aus veralteten Tabs. Nach Löschung bleiben nur die leere technische Zeile, Revisionsnummer und Änderungszeit zurück.

## Bewusst noch ausstehend

Der Nutzer hat für beide Modi zuerst konkrete Regelvorschläge angefordert. Siehe `HSC08-REGELVORSCHLAG.md`. Daher enthält dieser erste Teststand **keine Auslosung, Paarungsverwaltung, Ergebniseingabe, Ranglistenberechnung oder Rundenfreigabe**. Die Konfiguration ist ein Entwurf; Regeln können auch über direkte API-Aufrufe nicht aktiviert werden. Keine Pokal-, Blitz- oder Archivfunktion.

## Einspielen

Dies ist ausschließlich ein Änderungsstand. Ordnerstruktur beibehalten, nicht den ganzen Projektordner ersetzen.

1. Im vorhandenen Lobby-Worker das aktualisierte `src/index.js` und alle drei neuen `src/hsc08*.js`-Module zusammen bereitstellen. Der bisherige Worker-Einstieg und alle anderen Module bleiben erhalten. Die neue Tabelle wird erst beim berechtigten Datenzugriff angelegt.
2. Danach `Gamer/index.html`, `Gamer/js/auth-account.js` und `Gamer/js/hsc08.js` bereitstellen.
3. Als Andili anmelden und unter Schachwelt → Vereine → HSC08 öffnen.
4. Titel, Modus, Ausschreibung und Namen konfigurieren, speichern, Seite schließen/erneut öffnen.
5. Falsches Passwort beim Löschen muss scheitern. Richtiges Passwort plus Bestätigung muss den Inhalt entfernen; Seite/Navigation bleiben bestehen.
6. Als anderes Mitglied und abgemeldet: kein Menüeintrag. Direkte GET/POST/DELETE-Zugriffe auf `/api/hsc08/championship` und GET auf `/api/hsc08/page` müssen ohne Andili-Berechtigung 404 liefern.
7. Hilfe, Zahnrad, Rückkehr zur Lobby sowie bestehende Online-Turniere nach Einspielen kurz prüfen.

Noch nicht produktiv bereitgestellt. Keine echten Konten oder Turniere wurden verändert.

## Automatisierte Prüfung

- `node --test tests/hsc08.test.mjs`: Zugriffsschutz, getrennte Speicherung, konkurrierende Änderungen, Löschbestätigung/Passwort-Verweigerung, leere Seite nach Löschung, Eingabeprüfung.
- `tests/hsc08-browser.mjs`: Browserprüfung mit lokalem SQLite und simulierten Gamer-Sitzungen. Benötigt Playwright; optional `PLAYWRIGHT_MODULE` und `CHROMIUM_EXECUTABLE` setzen.
- Passwörter im Browsertest werden simuliert. Die produktive Route verwendet die vorhandene PBKDF2-Prüfung und bestehende Login-Ratenbegrenzung; ein Live-Test mit Andilis echtem Passwort wurde nicht ausgeführt.
- Bestehende Tests `password-reset.test.mjs` und `tournament-series.test.mjs` scheitern teilweise an der fehlenden Test-Hilfsfunktion `handleSchacheckeApi`. Derselbe Fehler wurde in einer separaten unveränderten Kopie aus der Basis-ZIP reproduziert. Diese Testprobleme wurden nicht durch Änderungen an fremden Modulen verdeckt.

Ergebnis der lokalen Prüfung: 5 neue Servertests bestanden; Desktop (1440 × 1000), iPad-Größe (820 × 1180) und iPhone-Größe (390 × 844) in Chromium geprüft. Speichern, falsches/richtiges Löschpasswort, Rückkehr, Abmelden und fehlender horizontaler Überlauf bestanden; Besucher und normales Mitglied sehen keinen Einstieg. Das sind simulierte Bildschirmgrößen, keine Prüfung auf physischen iOS-Geräten oder in Safari. Der vollständige Worker ließ sich erfolgreich bündeln.


## Layoutkorrektur vom 31.10.2026

Dieser Nachtrag setzt den ersten HSC08-Teststand voraus. Das neue Änderungs-ZIP enthält nur die seitdem angepassten Dateien.

- Der HSC08-Header ersetzt die normale Lobby-Navigation durch eine Rückkehr-Schaltfläche, das Gamer-Menü „Vereinsturniere“, Konfiguration und Löschung. Keine zusätzliche Desktop-Navigationszeile. Hilfe und Einstellungen bleiben vorhanden.
- Aktuell nur „Zur Lobby“ für Andili. Die alternative Beschriftung „Zur Startseite“ ist für eine spätere Besucherfreigabe vorbereitet; Besucher erhalten weiterhin keinen Zugriff.
- Das geschützte HSC-Logo ersetzt das Gamer-Logo im Header. Beim Schließen werden Logo und Status wiederhergestellt.
- Der Status zeigt „HSC08 · Vereinsmeisterschaft“ beziehungsweise den gespeicherten Turniertitel; beim Konfigurieren „HSC08 · Turnier konfigurieren“. Keine wiederholte Seitenüberschrift und kein zweites sichtbares Logo im Inhalt.
- Seitenhöhe wird aus dem tatsächlichen Inhalt ermittelt; kein inneres Scrollfenster. Die originalen Fußnoten einschließlich ihrer bestehenden Funktionen und Statistikzeile werden unter den Inhalt verschoben und beim Schließen an ihren ursprünglichen Platz zurückgesetzt.
- Zum Einspielen: `Gamer/index.html`, `Gamer/js/hsc08.js`, `Gamer/js/mobile-navigation.js` und Worker-Modul `src/hsc08-page.js` aktualisieren; den Worker danach neu bereitstellen. Alle übrigen Dateien aus dem ersten HSC08-Teststand bleiben erforderlich.
- Erneut geprüft: Desktop, iPad- und iPhone-Größen in Chromium; Menüeinträge, Logo, Statuswechsel, Fußnotenposition, fehlender innerer Scrollbereich und Rückkehr. Keine Prüfung auf echten iOS-Geräten.

Auch das aufgeklappte mobile Menü enthält ausschließlich HSC08-Navigation sowie die vorhandenen Hilfe-/Einstellungseinträge. Titel und Logo wechseln mit; beim Schließen werden die normale Navigation und die Scrollfreigabe wiederhergestellt. Die Browserprüfung deckt das Öffnen des Untermenüs, deaktivierten Pokal/Blitz, Auswahl der Vereinsmeisterschaft und das Schließen des Menüs ab.

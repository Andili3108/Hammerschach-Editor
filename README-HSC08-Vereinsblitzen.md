# Vereinsblitzen – Stand 10. November 2026

## Bedienung / Erste Schritte
Unter Schachwelt → Vereine → HSC08 → Blitzrunden öffnen. Im Turniermenü führt „Turnier konfigurieren“ zur Saisonkonfiguration. Die Meisterschaft bleibt ein eigener Bereich, Vereinspokal ist noch nicht verfügbar.

1. Saison benennen, bis zu zehn Termine eintragen, Punktestaffel und Streichergebnisse wählen. 0 bedeutet: alle Ergebnisse zählen. Standardstaffel Platz 1–10: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1. Nach dem ersten Start sind Staffel und Streichzahl gesperrt. Leere Termine bleiben ungenutzt; geplante Termine sind bis zum Start änderbar.
2. Gemeinsame Saison-Namensliste ergänzen. Gleiche Namen dürfen unterschiedliche Personen bezeichnen; intern sind sie getrennt. Namenskorrekturen erfolgen über den Stift und behalten die Zuordnung der Ergebnisse. Es sind keine Gamer-Spielerkonten nötig.
3. Abend aufklappen, tatsächlich Anwesende anhaken. Durchgänge 1 oder 2 wählen; Bedenkzeit vorbelegt mit 3 Minuten + 2 Sekunden/Zug, vor Freigabe frei änderbar. „Paarungsplan freigeben“ nach Bestätigung erzeugt den vollständigen Rotationsplan. Danach keine Nachmeldungen für diesen Abend. Neue Personen können an späteren Abenden teilnehmen.
4. Ergebnisse während des Abends direkt bei der Partie anklicken: 1–0, ½–½, 0–1; unter „Weitere“ kampflose Ergebnisse oder Offen. Jede Eingabe wird sofort serverseitig gespeichert und die Abendrangliste aktualisiert. Die Spielreihenfolge ist frei, keine Freigabe jeder einzelnen Runde erforderlich. Tischzuordnungen folgen dem Rotationsplan, bei Doppelrunde mit vertauschten Farben. Spielfrei ergibt keine Partie und keine Punkte. Es gibt keinen Papier-/Excel-Zwischenschritt.
5. Abend ausdrücklich abschließen. Erst abgeschlossene Abende gehen in die Saisonwertung ein. Punkte → direkter Vergleich der punktgleichen Gruppe (nur wenn deren Begegnungen entschieden sind) → Sonneborn-Berger → gemeinsamer Platz. Vollständig gleiche Plätze teilen den Durchschnitt der Saisonpunkte der belegten Plätze, einschließlich 0 ab Platz 11. Teilwerte werden intern ungerundet berechnet, Anzeige bis vier Nachkommastellen.
6. Saisonübersicht zeigt jeden abgeschlossenen Abend, ungekürzte Summe und gewertete Summe. Nichtteilnahme ergibt 0; die niedrigsten Ergebnisse werden laufend gestrichen und durchgestrichen dargestellt. Solange noch nicht mehr Abende als Streichungen abgeschlossen sind, sind alle bisherigen Ergebnisse gestrichen. Gleiche gewertete Summe bedeutet gleicher Rang, auch Platz 1.
7. Nach der gewünschten Anzahl Abende die Saison abschließen, z. B. nach sieben von neun geplanten Terminen. Mindestens ein abgeschlossener Abend ist erforderlich. Gestartete Abende müssen vorher abgeschlossen sein. Übrige Termine werden als nicht ausgetragen markiert und zählen nicht als Streichresultate. Für spätere Änderungen erst Saison wieder öffnen.

## Korrekturen und Rückzüge
Ergebniskorrekturen benötigen eine Begründung. Abgeschlossene Abende erst wieder öffnen; bei abgeschlossener Saison zuerst auch die Saison öffnen. Ein wieder geöffneter Abend entfällt vorübergehend aus der Saisonwertung und wird beim erneuten Abschluss neu eingerechnet.

Rückzug: unter 50 % tatsächlich gespielter Partien alle Begegnungen ohne Wertung und keine Saisonpunkte; ab 50 % bleiben Ergebnisse erhalten, offene Partien werden kampflos verloren. Originalumfang einschließlich Hin-/Rückspielen ist Bezugsgröße; kampflose Partien zählen nicht zur Schwelle. Rückkehr mit Begründung entfernt automatische Rückzugsfolgen, erhält echte Ergebnisse und berücksichtigt andere Rückzüge weiter. Korrekturen und Rückzüge werden im Abendprotokoll gespeichert. Automatische Ergebnisse sind markiert, nicht gewertete Partien ebenso.

## Zugriff, Speicherung und Grenzen
Andili verwaltet. Bob, Thomas1961 und Fabili haben Lesezugriff ohne Eingaben; ihre Leseansicht prüft alle 15 Sekunden auf neue Daten. Besucher und andere Mitglieder bleiben ausgesperrt. Auch direkte Schreibaufrufe werden serverseitig abgewiesen. In der Verwaltung ist jeweils der geladene Stand maßgeblich; parallele Änderungen werden über Versionsprüfung abgefangen, dann neu laden.

Separate Datenbanktabelle `hsc08_blitz`, keine Änderung der Meisterschaftsdaten oder Online-Turniere. Keine lokale Browserablage als Datenquelle. Saisonkonfiguration wird unmittelbar übernommen; kein separater Veröffentlichungsentwurf. Die bestehende Meisterschaftssicherung enthält die Blitzsaison nicht. Ein eigener Saisonexport/-import, ein geschützter Saisonwechsel, freie manuelle Paarungsänderungen und eine zusätzliche Kreuztabellenansicht sind in diesem Stand nicht enthalten. Es gibt keine Löschfunktion für die Blitzsaison. Spielleiterdelegation bleibt zurückgestellt.

## Installation und Prüfung
Frontend `Gamer/index.html` und `Gamer/js/hsc08.js` aktualisieren sowie den Lobby-Worker neu veröffentlichen. Die separate Tabelle wird beim ersten berechtigten Zugriff angelegt. Kein Übertragen der alten Xobor-Ergebnisse und kein Zurücksetzen bestehender Turniere.

Funktionstests: `node --test tests/hsc08*.test.mjs`. Browser: `tests/hsc08-blitz-browser.mjs` mit denselben Playwright-/Worker-Umgebungsvariablen wie die vorhandenen HSC08-Browsertests. Testablauf: Saison, Teilnehmer, Freigabe, Live-Ergebnisse, Abschluss, Korrektur, Saisonabschluss und Leseansicht auf Desktop, iPad- und iPhone-Größen. Mobile Prüfung in Chromium, nicht auf echten iOS-Geräten. Die Hilfe im Bereich enthält die wichtigsten Schritte und Wertungsregeln.

Abschlussprüfung: 60 Funktionstests bestanden; vollständiger Worker erfolgreich gebündelt. Browserabläufe des Vereinsblitzens, der Meisterschaft und der Lesefreigabe auf Desktop sowie simulierten iPad-/iPhone-Größen bestanden.

# HSC08 – Beschlossene Umsetzungsvorgaben

Stand: 31. Oktober 2026. Diese Datei ersetzt den bisherigen unbestätigten Regelvorschlag vom 30. Oktober. Grundlage sind die Einzelentscheidungen von Andili im anschließenden Regelgespräch. **Beschlossen bedeutet noch nicht implementiert.**

## 1. Projektstand und Abgrenzung

- Maßgeblich ist der bestätigte lokale Arbeitsstand in Hammerschach-Gamer, einschließlich der zuletzt gelieferten Änderungen. Am 31. Oktober wurden die vier Dateien aus HSC08-Gamer-Felddesign-20261031.zip bytegleich mit den lokalen Dateien geprüft. Keine ältere vollständige ZIP als Ersatz verwenden.
- Vor Änderungen betroffene aktuelle Dateien erneut prüfen. Bestehende Online-Turniere und Gamer-Konten nicht beeinträchtigen. HSC08-Daten und Funktionen modular getrennt halten.
- Reale Vereinsmeisterschaften, Teilnehmer ohne Gamer-Konto. Keine Pokal- oder Blitzimplementierung, keine Archivfunktion.
- Bestehendes Gamer-Design verbindlich: originale gemeinsame Feld- und Schaltflächenstile, abgerundete Eingabe- und Ausgabefelder, Icons, Hell/Sanft/Dunkel sowie mobile Menüs.
- Header mit HSC08-Logo, Statusfeld, Hilfe, Zahnrad und kontextabhängig Zur Lobby/Zur Startseite. Kein zusätzliches Logo oder doppelte Titelüberschrift im Inhalt. Bestehende Fußzeilen und Seitenfläche erhalten.
- Teilnehmerfelder und Ausgabe in drei Spalten am Desktop, bei weniger Platz zwei beziehungsweise eine Spalte.
- Lieferung zunächst nur unmittelbar geänderte/neue Projektdateien mit ursprünglicher Ordnerstruktur, bevorzugt Änderungs-ZIP. Vollpaket nur nach ausdrücklicher Anforderung.

## 2. Turniermodus und Punkte

- Pro Turnier wählbar: Rundenturnier oder Schweizer System.
- Rundenturnier: Einfachrunde oder Doppelrunde mit vertauschten Farben. Auswahl vor Planerstellung.
- Schweizer System: Rundenzahl durch Spielleiter konfigurierbar, auf Durchführbarkeit prüfen; vor Beginn festlegen. Keine ungefragte automatische Rundenzahl.
- Standardwertung 1–½–0; alternativ 3–1–0. Vor Beginn festlegen, öffentlich anzeigen.
- Die gewählte Wertung bestimmt auch die Schweizer Punktgruppen.
- Partieanzeige unabhängig von der Punktewertung: 1–0, ½–½, 0–1; +/−, −/+ und −/− gesondert für kampflose Ergebnisse.
- Offene Partien ausdrücklich offen; niemals automatisch als Niederlage oder 0–0 behandeln.
- Gespielt, kampflos, Auslosungsfreilos und freiwillig ausgesetzt getrennt speichern. Ein Freilos ist keine tatsächlich gespielte Partie.

## 3. Teilnehmer und Startreihenfolge

- Freie Namen mit stabilen internen Kennungen, freiwillige echte DWZ.
- Ohne DWZ darf der Spielleiter eine geschätzte Spielstärke zur Einordnung hinterlegen. Diese klar als Schätzung kennzeichnen, niemals als echte DWZ ausgeben.
- Gleichnamige Personen getrennt behandeln. Umbenennen verändert keine Identität oder Ergebnisse.
- Neue Teilnehmer nur bis zur ersten Paarungsfreigabe. Danach keine Neueinstiege.
- Namen bleiben korrigierbar. Nach Beginn Teilnehmer zurückziehen statt löschen.
- Vollständige Details der Schweizer Startreihenfolge, insbesondere Gleichstände und Teilnehmer ohne DWZ und ohne Schätzung, siehe offene Punkte.

## 4. Rundenturnier

- Gesamter Paarungsplan zu Beginn vorbereitbar. Gegner vereinbaren ihre Termine selbst. Rundennummern gliedern den Plan, erzwingen aber keine Spielreihenfolge.
- Offene Partien blockieren andere Partien nicht. Tabelle nach jedem Ergebnis aktualisieren; Anzahl gespielter Partien anzeigen.
- Turnierbeginn und spätester Spieltermin durch Spielleiter festlegen; an Saison und Ferien anpassen und bei Bedarf verlängern. Keine automatisch vergebenen Niederlagen beim Fristablauf.
- Bei ungerader Teilnehmerzahl: spielfrei ohne Punkte, ohne fiktive Partie.
- Rückzug vor vollständiger Erledigung: weniger als 50 % der vorgesehenen Partien abgeschlossen → Ergebnisse dokumentiert erhalten, aber aus Turnierwertung und Feinwertung herausnehmen. Ab mindestens 50 % → Ergebnisse erhalten, verbleibende Gegner bekommen kampflose Siege.
- Schwelle nach Anzahl Partien, nicht nach Kalender oder Rundennummer. Beispiel 12 Teilnehmer: Einfachrunde 11 Partien, Grenze 6; Doppelrunde 22 Partien, Grenze 11.
- Rangfolge: Turnierpunkte → Sonneborn-Berger → direkter Vergleich → geteilter Platz. Auch gemeinsamer erster Platz, kein ungefragter Stichkampf oder Losentscheid.
- Sonneborn-Berger: je Begegnung Endpunktzahl des Gegners × gegen ihn erzielte Punkte; Beiträge summieren. Bei 3–1–0 Faktoren 3/1/0; keine versteckte Umrechnung auf klassische Punkte.

## 5. Schweizer System

- FIDE-Dutch-System als Paarungsgrundlage; keine vereinfachte Nachbarpaarung als Dutch ausgeben.
- Gamer berechnet Paarungen einschließlich Farben. Spielleiter startet die Berechnung ausdrücklich, prüft Entwurf und gibt die Runde frei.
- Nächste Runde erst nach vollständiger Entscheidung aller Partien der vorherigen Runde. Nachholpartien blockieren die nächste Auslosung.
- Manuelle Paarungsänderungen möglich, mit Regelprüfung und Protokollierung. Umgang mit bewusst regelwidrigen Eingriffen vor Umsetzung klären; nie unbemerkt als regelkonformes Dutch deklarieren.
- Jede Runde hat Rundenbeginn und spätesten Spieltermin. Vier Vereinsabende als Orientierung, keine automatisch erzwungene Frist.
- Beispiel: Spielabende 05./12./19./26. November; nächste Runde am 03. Dezember. Zwischen letzter Spielmöglichkeit und nächstem Vereinsabend Zeit für Ergebnisse, Auslosung und Freigabe.
- Frist durch Spielleiter verlängerbar, kein automatischer Rundenstart und keine automatische Verlustwertung.
- Auslosungsfreilos gibt Siegpunkte (1 oder 3), ausdrücklich als Freilos, keine Farbe und keine gespielte Partie. Vergabe/Ausschlüsse nach Paarungsregelwerk.
- Rechtzeitige Abmeldung vor Auslosung: für diese Runde nicht paaren, 0 Punkte, Anzeige Ausgesetzt. Rückkehr in späteren Runden möglich.
- Absage nach Veröffentlichung: Paarung bleibt. Austragung innerhalb der laufenden Runde möglich. Andernfalls Spielleiterentscheidung: ein Nichtantretender → kampfloser Verlust; beide Nichtantretende → beide 0 Punkte. Keine automatische Eintragung.
- Rückzug: bisherige Ergebnisse erhalten; künftig nicht paaren, keine weiteren Punkte; bereits veröffentlichte Begegnung ausdrücklich abschließen. Teilnehmer mit Hinweis Zurückgezogen sichtbar lassen.
- Rangfolge: Turnierpunkte → Buchholz → Buchholz Cut 1 → geteilter Platz. Diese Reihenfolge ist bestätigt und ersetzt die abweichende frühere Empfehlung!
- Gegnerpunkte ebenfalls nach gewählter 1–½–0- oder 3–1–0-Wertung. Ungespielte Runden benötigen besondere Feinwertungsbehandlung, siehe offene Punkte.

## 6. Ergebniskorrekturen und Abschluss

- Spielleiter darf Ergebnisse korrigieren. Alter/neuer Wert und Zeitpunkt protokollieren, handelnde Person zuordnen. Punkte und Feinwertungen neu berechnen.
- Bereits veröffentlichte Schweizer Paarungen bleiben bei Ergebniskorrekturen unverändert. Keine stille Neuauslosung.
- Turnier ausdrücklich abschließen, erst wenn alle für die Wertung notwendigen Partien geklärt sind. Status Abgeschlossen und endgültige Rangliste anzeigen.
- Spielleiter darf für Korrekturen ausdrücklich wieder öffnen; Vorgang protokollieren.
- Abschluss und Wiederöffnung umgehen keine Löschsperre. Seite bleibt vorhanden, keine Archivierung.

## 7. Konfiguration und Veröffentlichung

- Konfiguration jederzeit als Entwurf zwischenspeicherbar, auch unvollständig.
- Speichern und Veröffentlichen sind getrennte Aktionen. Öffentlichkeit sieht zuletzt veröffentlichten Konfigurationsstand.
- Private Änderungen als unveröffentlicht kennzeichnen. Erst Änderungen veröffentlichen übernimmt sie in die öffentliche Fassung.
- Bereits vor Saisonbeginn Ausschreibung und Teilnehmerliste veröffentlichbar, auch ohne Paarungen.
- Ergebnisse nach Speicherung unmittelbar in veröffentlichter Tabelle berücksichtigen; Paarungen erst nach Rundenfreigabe. Private Turniere bleiben insgesamt privat.
- Diese Veröffentlichungstrennung hebt Sperren für Turnierregeln und Teilnehmerzugang nach Beginn nicht auf.
- Bedenkzeit als frei formulierbares Konfigurationsfeld, vor Turnierbeginn festlegen. Eigenes Gamer-Ausgabefeld bei Turnierinformationen, nicht nur Beschreibungstext. Keine Gamer-Spieluhr für reale Partien.
- Layout (aktualisiert nach Layoutbesprechung am 31.10.): Turnierinformationen, Rangliste ab erstem Ergebnis, Runden/Paarungen neueste zuerst, Teilnehmer, Ausschreibung am Ende. Turnierinformationen kompakt in drei Spalten, bei kleinerer Breite zwei/eine.
- Ab Turnierstart die separate Teilnehmerliste auf der Turnierseite ausblenden. Teilnehmerdaten bleiben in Verwaltung, Paarungen und Rangliste erhalten; keine Löschung. Mit der künftigen Startfunktion verbinden, nicht anhand eines Kalenderdatums ausblenden.

## 8. Berechtigungen und Schutz

- Andili darf alles, was der Spielleiter darf, plus exklusive Verwaltungsaktionen.
- Delegation an bestehendes Gamer-Konto; Teilnehmer brauchen weiterhin keines.
- Spielleiter: Vorbereitung, Konfiguration, Teilnehmerverwaltung innerhalb der Sperren, Paarungen/Prüfung/Freigabe, Ergebnisse/Korrekturen, Termine, Rückzüge, Abschluss/Wiederöffnung.
- Nur Andili: Spielleiter ernennen/abberufen, Turnier veröffentlichen und Konfigurationsänderungen veröffentlichen, vollständiges Löschen/Zurücksetzen, Sicherungen wiederherstellen.
- Private Daten, Seiten, Paarungsentwürfe und interne Protokolle serverseitig schützen, auch bei Direktzugriff. Öffentliche Antwort darf keine versteckten privaten Daten enthalten.
- Öffentliche Ansicht erst nach ausdrücklicher Veröffentlichung durch Andili. Danach Lesen ohne Konto möglich. Bis dahin keine Besucher-Navigation zum privaten HSC08-Bereich.

## 9. Löschen, Sicherung und Wiederherstellung

- Ohne Ergebnisse: gewöhnliche Löschung nur Andili, mit sicherer Passwort-Reauthentifizierung und ausdrücklicher Bestätigung.
- Sobald Ergebnisse vorhanden sind: gewöhnliche vollständige Löschung sperren. Auch Abschluss oder Wiederöffnung heben die Sperre nicht auf.
- Gesondertes Zurücksetzen ausschließlich Andili: zuerst vollständige Turnierdatensicherung zum Herunterladen, danach Passwort-Reauthentifizierung und Eingabe des Turniernamens zur Bestätigung.
- Wiederherstellung dieser Sicherung für Andili vorsehen, damit die Sicherung praktisch nutzbar ist.
- Ausschließlich HSC08-Turnierdaten betroffen; feste Seite, Navigation, Gamer-Benutzer und Online-Turniermodule bleiben erhalten.
- Sicherungsdatei ist keine Archivfunktion. Konkrete Sicherungsstruktur und Validierung sind technische Umsetzung, keine Freigabe für automatische Veröffentlichung oder Rechteausweitung durch Import.

## 10. Noch nicht abschließend entschiedene Detailfälle

Diese Punkte nicht stillschweigend als beschlossen ausgeben. Bei Bedarf gezielt und einzeln mit Andili klären; unabhängige Implementierung kann weiterlaufen.

1. Schweizer Startreihenfolge bei gleicher DWZ/Schätzung, bei fehlender Schätzung und eventuellen Titelkriterien. Vereinsregel und formale FIDE-Regelkonformität auseinanderhalten.
2. Genaue Feinwertungsbehandlung ungespielter Schweizer Runden nach FIDE Artikel 16 (Regelstand März 2026), insbesondere Kombination mit 3–1–0. Grundsatz gesonderter Behandlung ist bestätigt, die konkreten Sonderfallformeln noch nicht besprochen.
3. Rundenturnier-Rückzug: Zählung früherer kampfloser Ergebnisse für die 50-%-Schwelle, mehrere Rückzüge und Doppelrunden-Sonderfälle präzisieren. Allgemeine 50-%-Regel ist beschlossen.
4. Umgang mit Schweizer Paarungsentwürfen nach zwischenzeitlicher Ergebniskorrektur; veröffentlichte Paarungen bleiben verbindlich unverändert.
5. Grenzen manueller Eingriffe in Dutch-Auslosungen: harte Unmöglichkeit (z.B. Spieler doppelt) ablehnen; bewusste Paarungsregel-Ausnahme nicht ohne Entscheidung einführen.
6. Änderungen der Schweizer Rundenzahl nach Turnierbeginn waren nur als mögliche Sonderentscheidung vorgeschlagen, nicht abschließend freigegeben. Keine beiläufige Änderung anbieten.
7. Ob und wie eine Veröffentlichung zurückgenommen werden darf, wurde noch nicht beschlossen.

## 11. Technische Prüfung vor Freigabe

- Ernsthafte Dutch-Auslosung benötigt geeignete, lizenzkompatible Umsetzung und unabhängige Referenzfälle, einschließlich Farbhistorie, Floatern, Freilosen, Rückzügen und 3–1–0. Keine Eigenvereinfachung mit FIDE-Etikett.
- Migration bestehender Testkonfiguration ohne Datenverlust. Parallelzugriffe mit Versionsprüfung; veraltete Seiten dürfen gelöschte/zurückgesetzte Daten nicht wiederherstellen.
- Getrennte veröffentlichte Konfiguration und Entwurf, stabile Teilnehmerkennungen, atomare Änderungen. Schutz serverseitig prüfen.
- Passwortprüfung und Rate Limits aus bestehender Anmeldung weiterverwenden; Passwörter und Sitzungstoken niemals in Sicherungen aufnehmen.
- Wiederherstellung mit Größen-/Schema-/Inhaltsprüfung und bestätigtem Ziel; keine fremden Konten oder Berechtigungen blind aus Datei übernehmen.
- Aktuelles Frontend und gebauten Worker testen. Bestehendes Inline-Clientproblem beachten: kein function.toString(), das beim Bundeln __name-Helfer in Browsercode einschleust.
- Desktop, iPad- und iPhone-Größen, alle drei Erscheinungsbilder, mobile Menüs, Fußzeilen und keine inneren iframe-Scrollbalken prüfen. Simulation nicht als Test auf echten Geräten ausgeben.
- Zugriffsrechte, veröffentlichte/private Antworten, Eingabevalidierung, Wertungen, Korrekturen, Rückzüge, Löschschutz, Sicherung und Wiederherstellung gezielt testen.

## Regelquellen für die technische Prüfung

- FIDE Dutch ab Februar 2026: https://handbook.fide.com/chapter/C0403202602
- FIDE Feinwertungen ab März 2026: https://handbook.fide.com/chapter/TieBreakRegulations032026
- FIDE Wettbewerbsregeln, insbesondere Rückzug im Rundenturnier Abschnitt 6.6: https://handbook.fide.com/files/handbook/Competition_Rules.pdf

Die gewählten Feinwertungsreihenfolgen und Bedienabläufe sind HSC08-Entscheidungen. Diese Datei behauptet keine FIDE-Zertifizierung der Anwendung und keine bereits erfolgte Umsetzung.

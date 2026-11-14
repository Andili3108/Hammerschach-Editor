# HSC08 – Beschlossene Umsetzungsvorgaben

Stand: 31. Oktober 2026. Diese Datei ersetzt den bisherigen unbestätigten Regelvorschlag vom 30. Oktober. Grundlage sind die Einzelentscheidungen von Andili im anschließenden Regelgespräch. **Beschlossen bedeutet noch nicht implementiert.**

## 1. Projektstand und Abgrenzung

- Maßgeblich ist der bestätigte lokale Arbeitsstand in Hammerschach-Gamer, einschließlich der zuletzt gelieferten Änderungen. Am 31. Oktober wurden die vier Dateien aus HSC08-Gamer-Felddesign-20261031.zip bytegleich mit den lokalen Dateien geprüft. Keine ältere vollständige ZIP als Ersatz verwenden.
- Vor Änderungen betroffene aktuelle Dateien erneut prüfen. Bestehende Online-Turniere und Gamer-Konten nicht beeinträchtigen. HSC08-Daten und Funktionen modular getrennt halten.
- Reale Vereinsmeisterschaften, Teilnehmer ohne Gamer-Konto. Vereinspokal und Archivfunktion bleiben zurückgestellt. Vereinsblitzen ist inzwischen als eigener Bereich umgesetzt; siehe README-HSC08-Vereinsblitzen.md.
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
- Spielleiterdelegation ist bis ganz ans Ende nach Blitzrunden und Vereinspokal zurückgestellt (9. November 2026). Die nachfolgenden Spielleiterrechte sind Zukunftsplanung. Teilnehmer brauchen weiterhin kein Gamer-Konto.
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

## Ergänzende Beschlüsse vom 9. November 2026

- Schweizer Startnummern bei gleicher DWZ/Schätzung werden durch den Spielleiter zugeordnet. Bei fehlender Wertungszahl legt er die Einordnung fest.
- Feinwertung nach FIDE C.07 vom 1. März 2026, Artikel 16.3 bis 16.5, mit dem gewählten Punktesystem 1–½–0 oder 3–1–0. Zugewiesenes Freilos: eigener Punktestand, maximal Rundenzahl × Remiswert. Kampfloser Sieg/Verlust: eigener Punktestand, maximal angepasster Gegnerpunktestand.
- Angepasste Gegnerpunkte berücksichtigen nach Artikel 16.3 die abschließenden ausgesetzten Runden rechnerisch als Remis. Keine Änderung der echten Turnierpunkte.
- Buchholz Cut 1 streicht vorrangig den niedrigsten Beitrag einer freiwillig ungespielten Runde (Aussetzen / kampfloser Verlust). Ohne solche Runden gilt der insgesamt niedrigste Beitrag.
- Zwischenstände aktualisieren sich nach jeder Ergebnisspeicherung, mit einsehbarer Berechnung einschließlich Streichresultat. Offene Partien bleiben offen. Ein ausdrücklicher Abschluss erzeugt den Endstand; Korrekturen erfordern Wiederöffnung.
- Konfigurationsseite und Turnieransicht erhalten gleichermaßen das Gamer-Design. Rückzüge und einzelne Abwesenheiten werden ausdrücklich erfasst.
- Ergebniskorrekturen bei offenem Schweizer Paarungsentwurf erfordern vorheriges Verwerfen oder Freigeben. Bereits freigegebene Paarungen bleiben bestehen, außer bei ausdrücklich bestätigter Rücknahme der jüngsten noch nie mit einem Partieergebnis versehenen Runde.

## 10. Noch nicht abschließend entschiedene Detailfälle

Diese Punkte nicht stillschweigend als beschlossen ausgeben. Bei Bedarf gezielt und einzeln mit Andili klären; unabhängige Implementierung kann weiterlaufen.

1. Eventuelle Titelkriterien bei der Startreihenfolge bleiben offen. Gleichstände und fehlende Wertungszahlen siehe Beschlüsse vom 9. November.
2. Die Feinwertungsbehandlung ist inzwischen beschlossen; siehe Ergänzung vom 9. November.
3. Rundenturnier-Rückzüge sind konkret beschlossen und umgesetzt; siehe Ergänzung Saisonbetrieb vom 10. November 2026.
4. Aktueller Schutz für Paarungsentwürfe siehe Ergänzung vom 9. November.
5. Manuelle Dutch-Abweichungen sind inzwischen für Andili mit ausdrücklicher Bestätigung und Begründung beschlossen (siehe Umsetzung Paarungsänderungen). Strukturell unmögliche Paarungen, unzulässige Wiederholungen/Freilose und manuelle Überschreitungen der normalen Farbgrenzen bleiben gesperrt.
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


## Umsetzung Paarungsänderungen (9. November 2026)

Begründete Bearbeitung im Entwurf und bestätigte Rücknahme vor dem ersten Partieergebnis sind umgesetzt. Rundenturniere prüfen den vollständigen Plan einschließlich Rückspielfarben. Andili darf Schweizer Abweichungen von der Dutch-Auslosung ausdrücklich bestätigen und begründen. Die Runde trägt dann „Manuell geändert“; sie wird nicht als Dutch-konforme Auslosung ausgegeben. Strukturelle Fehler, Wiederholungen gespielter Begegnungen, unzulässige Freilose und manuelle Überschreitungen der normalen Farbgrenzen werden abgelehnt. Sonderfälle der Schlussrunde bei der Farbvergabe bleiben der Automatik vorbehalten. Die Brettreihenfolge ist ebenfalls änderbar. Wiederholte Veröffentlichung erfolgt ausdrücklich. Eine zurückgenommene Runde lässt sich nicht verwerfen. Gespeicherte Partieergebnisse sperren die Paarungen dauerhaft, auch nach Ergebnislöschung. Automatische Freilose allein gelten hierfür nicht als manuell erfasste Partieergebnisse. Details, Bedienung und Installation: README-HSC08-Rundenturnier.md.


## Ergänzung Saisonbetrieb vom 10. November 2026

Bestätigt: Für die 50-%-Schwelle zählen nur tatsächlich gespielte Partien. Hin- und Rückspiele zählen gemeinsam. Der ursprünglich geplante Umfang bleibt bei mehreren Rückzügen die Bezugsgröße. Unter 50 % sind sämtliche Begegnungen aus der Wertung zu nehmen, aber zu dokumentieren; ab 50 % bleiben Ergebnisse gewertet und offene Partien werden kampflos verloren. Bei beiderseitigem Rückzug wird eine bisher offene Begegnung für beide mit 0 behandelt. Die Umsetzung berechnet automatische Ergebnisse getrennt von den gespeicherten Originalergebnissen; Ergebniskorrekturen aktualisieren auch die Schwelle.

Schweizer Termine können mit Begründung innerhalb der Saison ohne Überschneidung geändert werden. Ein Schweizer Rückzug ist ohne offenen Paarungsentwurf für zukünftige Runden aufhebbar. Bereits freigegebene Paarungen und vergangene Aussetzrunden bleiben unverändert. Bedienung, Speicherung und Grenzen stehen im Abschnitt Saisonbetrieb der README-HSC08-Rundenturnier.md.

## Ergänzung Rückkehr im Rundenturnier (10. November 2026)

Unter Runden und Paarungen „Rückzug rückgängig machen …“ wählen. Die Abfrage erläutert die Auswirkungen; eine Begründung bestätigt und speichert die Rückkehr. Nur im laufenden Turnier möglich, abgeschlossene Turniere zuerst für Korrekturen öffnen. Gespeicherte Ergebnisse einschließlich späterer Korrekturen bleiben unverändert. Automatische Rückzugswertungen entfallen für diesen Teilnehmer; vorher offene Partien werden wieder offen, sofern kein anderer Rückzug ihre Behandlung bestimmt. Andere Rückzüge bleiben erhalten. Rangliste und Feinwertung werden neu berechnet. Der Vorgang wird protokolliert und bleibt in JSON-Sicherungen erhalten. Keine Aufhebung bestehender Lösch- oder Ergebnissperren. Beide Punktewertungen und Einfach-/Doppelrunde werden unterstützt.

Installation: die geänderten Worker-Dateien übernehmen und Lobby-Worker neu veröffentlichen. Keine Frontendänderung notwendig. Erste Schritte/Hilfe in der Konfiguration wurden entsprechend ergänzt.

## Vereinsblitzen (10. November 2026)

Eigenständige Saisonserie mit maximal zehn Terminen, Teilnehmerauswahl je Abend, Einfach-/Doppelrunde und klassischer Partiepunktwertung. Die im anschließenden Gespräch beschlossenen Saisonpunkte, Gleichstände, Streichungen, Korrekturen, Rückzüge und vorzeitiger Saisonabschluss sind in README-HSC08-Vereinsblitzen.md dokumentiert. Die Meisterschaftsregeln werden dadurch nicht geändert.

## Klarstellung Vereinsblitzen – 11. November 2026
Streichungen beziehen sich auf die schlechtesten Partieergebnisse jedes Spielers innerhalb eines Blitzabends, nicht auf Saisonrunden. Sie reduzieren nur seine eigene Punktesumme. Gegnerergebnisse bleiben unverändert; direkter Vergleich und Sonneborn-Berger werden aus den vollständigen Ergebnissen vor Streichungen berechnet. Alle aus den Abendplatzierungen entstandenen Saisonpunkte zählen zur Gesamtsumme. Diese Klarstellung ersetzt die frühere Saison-Streichwertung. Bedienung und Umgang mit bestehenden Daten: README-HSC08-Vereinsblitzen.md.

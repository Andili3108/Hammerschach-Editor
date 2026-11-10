# HSC08 – Rundenturnier-Teststand vom 1. November 2026

## Einspielen

Die Dateien des jeweiligen Änderungs-ZIPs mit gleicher Ordnerstruktur übernehmen. Für die Sicherungsfunktion sowohl die enthaltenen Frontend-Dateien einspielen als auch den aktualisierten Worker veröffentlichen. Der lokale Projektordner enthält die Änderungen bereits.

## Testablauf für Andili

1. Rundenturnier mit mindestens zwei Teilnehmern konfigurieren. Titel, Turnierbeginn, letzter Spieltermin und Bedenkzeit ergänzen. Einfach-/Doppelrunde und Punktewertung wählen.
2. Entwurf speichern und in die Turnieransicht übernehmen.
3. Im Bereich Runden und Paarungen den Paarungsplan vorbereiten. Der Plan verwendet die Teilnehmerreihenfolge für die Startnummern; es findet keine zufällige Auslosung statt. Alle Begegnungen, Farben und gegebenenfalls spielfreien Teilnehmer prüfen. Noch keine Ergebnisse möglich.
4. Bei Änderungsbedarf „✏️ Paarungen bearbeiten“ in der Aktionszeile wählen, Änderungen begründen und den gesamten Plan prüfen und speichern. Ein noch nie veröffentlichter Entwurf kann weiterhin verworfen werden. Ein freigegebener Plan ohne jemals eingetragenes Partieergebnis kann zur Bearbeitung zurückgenommen werden; anschließend erneut freigeben.
5. Paarungsplan freigeben. Die separate Teilnehmerliste verschwindet. Teilnehmerzugang, Modus, Punktewertung, Durchgänge, Rundenzahl und Bedenkzeit sind gesperrt. Namenskorrekturen, Beschreibung und Termine bleiben über die Konfiguration möglich.
6. Ergebnisse direkt an den Paarungen auswählen. Die Reihenfolge ist frei. Gespielte und kampflose Ergebnisse sind getrennt. Spielfrei bringt keine Punkte.
7. Nach dem ersten Ergebnis erscheint die Rangliste mit Platz, Name, Gespielt, Punkten und Sonneborn-Berger. Bei Gleichheit folgt der direkte Vergleich; unvollständige direkte Vergleiche werden im Zwischenstand nicht zur Auflösung herangezogen. Vollständige Gleichstände teilen einen Platz.
8. Zur Ergebniskorrektur einen anderen Wert wählen und begründen. Auch Offen ist möglich. Änderungen werden mit Person und Zeitpunkt protokolliert.
9. Nach Klärung aller Partien Turnier abschließen. Die Rangliste zeigt den Endstand und den/die Vereinsmeister. Für Korrekturen ausdrücklich wieder öffnen.

## Schutz und noch ausstehende Funktionen

- Andili verwaltet; Bob, Thomas1961 und Fabili haben angemeldeten Lesezugriff. Keine öffentliche Freigabe oder Spielleiterdelegation.
- Sobald jemals ein Ergebnis erfasst wurde, ist vollständiges Löschen gesperrt – auch nach Entfernen des Ergebnisses, Abschluss, Wiederöffnung oder Speichern einer Konfiguration. Die Sperre wird serverseitig durchgesetzt.
- Im Menü „Sichern / Wiederherstellen“ steht jetzt eine Sicherungs-ZIP bereit: `HSC08-Sicherung.json` enthält den gespeicherten Entwurf, den übernommenen Ansichtsstand, Teilnehmer, Ergebnisse und Protokoll. `HSC08-Turnier.html` ist eine eigenständige, statische Seite im Gamer-Stil mit eingebettetem Logo, ausschließlich mit dem übernommenen Ansichtsstand. Sie kann im Browser geöffnet oder auf anderen Seiten verwendet werden. Noch ungespeicherte Formulareingaben sind in keiner der Dateien enthalten.
- Zum Zurücksetzen zuerst die ZIP herunterladen und sicher aufbewahren. Danach das Speichern bestätigen, den aktuellen Turniernamen und das Gamer-Passwort eingeben und die zusätzliche Rückfrage bestätigen. Hat sich seit der Sicherung etwas geändert, wird das Zurücksetzen abgewiesen. Nur die Turnierdaten werden entfernt; Seite und Navigation bleiben.
- Wiederherstellen: ZIP entpacken, auf einer leeren Turnierseite die JSON-Datei auswählen, Gamer-Passwort sowie WIEDERHERSTELLEN eingeben und bestätigen. Vorhandene Turniere werden nicht überschrieben. Die HTML-Datei ist nicht für einen Import bestimmt. Sichern und Wiederherstellen bleiben ausschließlich für Andili freigeschaltet.
- Zum Testen: Rundenturnier sichern, geschützt zurücksetzen, JSON wiederherstellen und Ergebnisse prüfen. Danach bei Bedarf erneut sichern und zurücksetzen, um einen Schweizer Entwurf anzulegen. Dies ist keine Archivfunktion.
- Rundenturnier-Rückzüge einschließlich 50-Prozent-Regel sind umgesetzt; siehe „Saisonbetrieb“. Paarungen sind im Entwurf bearbeitbar; siehe Abschnitt Paarungsänderungen. Nicht durch Löschen eines Teilnehmers umgehen.
- Schweizer Testbetrieb: Unter „Runden und Paarungen“ Beginn und letzten Spieltermin eintragen, bei gleich bewerteten Spielern die Startnummern vergeben und „Runde 1 vorbereiten“ wählen. Für Teilnehmer ohne DWZ und Schätzung legt der Spielleiter die Einordnung fest. Ein Entwurf lässt sich verwerfen oder freigeben. Erst die Freigabe macht die Paarungen in der Leseansicht sichtbar. Erst nach Entscheidung aller Partien lässt sich die folgende Runde vorbereiten. Die Rangliste zeigt Punkte, Buchholz und Buchholz Cut 1. Details stehen im nachfolgenden Abschnitt zur Schweizer Feinwertung.
- Noch nicht übernommene Konfigurationsentwürfe müssen vor einer Turnieraktion übernommen werden. Ergebnisse werden nicht in einen abweichenden Konfigurationsentwurf hineingemischt.

## Schweizer Feinwertung und Verwaltung – 9. November 2026

- Reihenfolge: Turnierpunkte → Buchholz → Buchholz Cut 1 → geteilter Platz. Beide Wertungen 1–½–0 und 3–1–0 verwenden ihre jeweiligen Punkte auch für die Feinwertung.
- Nach jedem gespeicherten Ergebnis werden alle Beiträge neu berechnet. Bestehende Schweizer Spielstände erhalten diese Berechnung bereits beim Laden. Offene Partien haben noch keinen Buchholz-Beitrag. Paarungsentwürfe zählen nicht. Deshalb verändern sich Zwischenstände mit weiteren Ergebnissen.
- FIDE C.07 (1. März 2026), Art. 16.3–16.5: Gespielte Partien tragen die angepassten Gegnerpunkte bei. Für ungespielte Runden gilt die eigene Punktzahl, gedeckelt bei kampflosen Ergebnissen durch die angepassten Gegnerpunkte, sonst durch geplante Rundenzahl × Remiswert. Bei sechs Runden ist diese Grenze 3 beziehungsweise 6.
- Für die Feinwertung bisheriger Gegner werden ausgesetzte Runden, auf die nur weitere freiwillig ungespielte Runden folgen, als Remis gerechnet. Die echten Turnierpunkte bleiben unverändert. Im laufenden Zwischenstand werden nur freigegebene Runden betrachtet. Eine spätere Rückkehr kann die Anpassung wieder ändern.
- Cut 1 streicht den niedrigsten Beitrag aus freiwillig ungespielten Runden (Aussetzen oder kampfloser Verlust), wenn solche Runden vorhanden sind. Sonst entfällt der insgesamt niedrigste Beitrag. Die ausklappbare Berechnung zeigt Art, Gegner, Grenzen, Beitrag und Streichung je Runde.
- Vor der Auslosung unter „Teilnahme an dieser Runde“ das Aussetzen markieren. Die Markierung gilt nur für diese Runde. „Teilnehmer zurückziehen …“ mit Bestätigung schließt den Teilnehmer von künftigen Paarungen aus. Bereits freigegebene Partien bleiben bestehen und müssen entschieden werden. Die Rangliste kennzeichnet Zurückgezogene. Ein Schweizer Rückzug kann ohne offenen Paarungsentwurf über „Rückzug rückgängig machen …“ aufgehoben werden.
- Aussetzen und Rückzug werden mit gespeichert; Rückzüge erscheinen im internen Protokoll. Aussetzen steht im gespeicherten Paarungsplan. Sicherung und Wiederherstellung erhalten diese Angaben einschließlich abgeschlossener Schweizer Turniere. Die Schweizer Rangliste und ihre Erklärungen werden aus den gesicherten Ergebnissen neu berechnet, um doppelte Daten zu vermeiden.
- Nach allen geplanten, freigegebenen und entschiedenen Runden kann Andili das Turnier abschließen. Die Tabelle heißt dann Endstand und zeigt alle gleichplatzierten Sieger. Für spätere Korrekturen „Für Korrektur öffnen“ wählen. Ein Abschluss sperrt Ergebnisänderungen serverseitig.
- Konfiguration und Turnierseite teilen Gamer-Felder und abgerundete Bereiche. Paarungen stehen als Brett / Weiß / Ergebnis / Schwarz zusammen. Die neueste Runde ist geöffnet, ältere Runden sind einklappbar. Auf kleinen Bildschirmen steht das Ergebnis unter den Gegnern. Die Rangliste lässt sich bei Platzmangel seitlich lesen.
- Erste Schritte und Bedienhilfe befinden sich direkt in der Konfiguration unter „ⓘ Erste Schritte und Hilfe zur Turnierverwaltung“. Die allgemeinen Gamer-Hilfen im Header wurden auf Bezug zur Änderung geprüft; sie beschreiben weiterhin die allgemeinen Gamer-Funktionen.
- Die öffentliche Freigabe bleibt zurückgestellt. Nachträgliche Schweizer Rundenterminänderungen sind umgesetzt. Spielleiterdelegation ist ausdrücklich bis ganz ans Ende, nach Blitzrunden und Vereinspokal, zurückgestellt. Die verwendete Dutch-Bibliothek und die 3–1–0-Anpassung sind keine FIDE-Zertifizierung.

Regelquelle: https://handbook.fide.com/chapter/TieBreakRegulations032026

## Einspielen und Prüfung

Den Inhalt des aktuellen Änderungs-ZIPs mit derselben Ordnerstruktur übernehmen und den Lobby-Worker neu veröffentlichen. Der lokale entpackte Projektordner ist bereits aktualisiert. Bestehende HSC08-Daten werden weiterverwendet.

`node --test tests/hsc08*.test.mjs` prüft Zugriffsschutz, Speicherung, Wertung, Sicherung und Lebenszyklus. `tests/hsc08-tiebreak-browser.mjs` prüft den gebündelten Worker mit lokalen Testdaten, drei Bildschirmgrößen, Erscheinungsbildern, Konfiguration und Leseansicht. Dafür Playwright bereitstellen und bei Bedarf PLAYWRIGHT_MODULE, HSC08_WORKER_MODULE, CHROMIUM_EXECUTABLE und HSC_SCREENSHOT_DIR setzen. Die Browserprüfung simuliert Größen in Chromium; reale iOS-Geräte und Safari sind nicht damit getestet.

Prüfergebnis des Feinwertungsstands vor den Paarungsänderungen: 29 automatisierte Tests bestanden. Der gesamte Worker wurde erfolgreich gebündelt. Der Browserablauf für Desktop, iPad- und iPhone-Größen einschließlich drei Erscheinungsbildern, Konfiguration, Zwischenstand, Leseansicht, Abschluss und Wiederöffnung ist bestanden. Bestehende Ergebnisse müssen für die neue Feinwertung nicht gelöscht werden.

## Header vom 9. November 2026

Die aktive Vereinsmeisterschaft ist als bordeauxrote Schaltfläche „Meisterschaft“ direkt sichtbar. Vereinspokal und Blitzrunden sind sichtbar, jedoch als noch nicht verfügbar deaktiviert. „Zur Lobby“ führt zurück. „Turniermenü ▾“ bündelt Konfiguration, Leseansicht und Sicherung. „Turnier vollständig löschen“ steht als farblich abgesetzter letzter Menüpunkt hinter einer Trennlinie. Die bestehenden Passwort- und Bestätigungsschritte gelten weiterhin. In der Leseansicht führt „Bearbeitungsansicht“ zurück. Auf kleinen Bildschirmen und im mobilen Menü wird dieselbe Auswahl angeboten.

Für diese Headeränderung die beiden Frontend-Dateien Gamer/index.html und Gamer/js/hsc08.js gemeinsam bereitstellen. Die Bedienwege in der privaten Konfiguration gelten ab „Turniermenü ▾“.


## Paarungsänderungen und Rücknahme (9. November 2026)

- Auf der Turnierseite im Paarungsentwurf „✏️ Paarungen bearbeiten“ in der Aktionszeile wählen. Die Oberfläche nutzt Gamer-Felder und -Schaltflächen; auf kleinen Bildschirmen stehen die Felder untereinander. Beim Rundenturnier zunächst „Runde bearbeiten“ wählen. Eine Spielerauswahl tauscht die Plätze zweier Teilnehmer innerhalb derselben Runde. Änderungen bleiben beim Rundenwechsel im Formular erhalten. „Farben tauschen“ vertauscht Weiß und Schwarz. Ein geändertes Freilos beziehungsweise Spielfrei wird ebenso geprüft.
- Erst „Änderungen prüfen und speichern“ speichert den vollständigen bearbeiteten Plan atomar. Eine Begründung ist Pflicht. Fehler lassen die bisher gespeicherten Paarungen unverändert und die Eingaben zum Korrigieren stehen. „Abbrechen“ verwirft nur die ungespeicherten Eingaben. Zum Veröffentlichen anschließend ausdrücklich freigeben.
- Rundenturnier: Bearbeitung des gesamten Plans. Jeder Teilnehmer muss pro Runde genau einmal zugeordnet sein; jede Begegnung muss pro Durchgang genau einmal vorkommen. In der Doppelrunde müssen Hin- und Rückspiel entgegengesetzte Farben haben. Deshalb kann ein Gegnertausch weitere Änderungen in anderen Runden erfordern. Spielfreie Teilnehmer erhalten weiterhin keine Punkte.
- Schweizer System: Nur der jüngste offene Entwurf ist bearbeitbar. Der Server vergleicht die Änderungen mit der erneut berechneten Dutch-Auslosung. Abweichende Gegner, Farben oder Freilose erfordern zusätzlich das ausdrückliche Ankreuzen „Abweichung von der Dutch-Auslosung ausdrücklich bestätigen“. Ohne Bestätigung wird nichts gespeichert. Die Brettreihenfolge lässt sich auch über Pfeilschaltflächen ändern. Eine manuelle Abweichung wird als „Manuell geändert“ an der Runde angezeigt, auch in Leseansicht und HTML-Sicherung. Sie ist keine Bestätigung einer Dutch-konformen Auslosung.
- Unabhängig von Andilis Bestätigung bleiben Doppelbelegungen, fehlende Teilnehmer, wiederholte tatsächlich gespielte Begegnungen und unzulässige Freilose gesperrt. Wer schon ein zugeteiltes Freilos oder einen kampflosen Sieg erhalten hat, kann kein weiteres zugeteiltes Freilos erhalten. Aussetzende Spieler können im Editor nicht hineingetauscht werden. Eine die normalen Farbgrenzen verletzende manuelle Änderung (dritte gleiche Farbe in Folge oder Differenz größer als zwei) wird abgelehnt. Dabei zählen nur tatsächlich gespielte Partien zur Farbhistorie. Besondere Farb-Ausnahmen der Schlussrunde bleiben der automatischen Dutch-Auslosung vorbehalten. Punktewertung 1–½–0 und 3–1–0 bleiben erhalten.
- Regelgrundlage für diese Schutzprüfungen: https://handbook.fide.com/chapter/C0403202602 (FIDE Dutch ab 1. Februar 2026). Die manuelle Abweichung ist eine bewusst bestätigte Verwaltungsentscheidung; der Gamer behauptet dafür weder vollständige Dutch-Konformität noch eine FIDE-Zertifizierung.
- „Runde zur Bearbeitung zurücknehmen“ betrifft nur die jüngste freigegebene Schweizer Runde; „Spielplan zur Bearbeitung zurücknehmen“ den ganzen Rundenturnierplan. Begründung und Bestätigung sind erforderlich. Betroffene Spieler müssen über geänderte Paarungen informiert werden; der Gamer versendet keine Benachrichtigungen.
- Rücknahme ist nur möglich, wenn im betroffenen Umfang noch nie ein Partieergebnis gespeichert wurde. Auch kampflose Ergebnisse sperren; späteres Leeren hebt die Sperre nicht auf. Ein automatisch vergebenes Schweizer Freilos allein verhindert die Rücknahme nicht. Frühere Schweizer Runden bleiben unverändert sichtbar. Zurückgenommene Paarungen verschwinden aus Leseansicht und HTML-Export bis zur erneuten Freigabe. Sie dürfen nicht als neuer Entwurf verworfen werden.
- Protokoll: Zeitpunkt, handelnde Person, betroffene Partie, alte/neue Spieler mit Farben, Begründung und die ausdrückliche Bestätigung einer Dutch-Abweichung. Das interne Protokoll erscheint nur in der Verwaltung und in der JSON-Sicherung, nicht in der Leseansicht. Ergebniskorrekturen bleiben ein eigener Vorgang.
- JSON-Sicherung und Wiederherstellung erhalten geänderte Spielpläne, Rücknahmestatus und Ergebnissperren. Alte Sicherungen ohne neue Sperrkennzeichen werden anhand der vorhandenen Ergebnisse und Protokolle ergänzt. Es erfolgt keine Änderung an Online-Turnieren oder Gamer-Konten.
- Installation: Alle Dateien aus dem Änderungs-ZIP an ihren relativen Pfaden übernehmen und den Lobby-Worker neu veröffentlichen. Dieses Paket verändert keine Gamer-Frontend-Dateien; die neue Oberfläche wird durch den Worker geliefert. Der entpackte lokale Projektordner enthält den Stand bereits.
- Tests: `node --test tests/hsc08*.test.mjs`; zusätzlich `tests/hsc08-pairings-browser.mjs` mit denselben Browser-Umgebungsvariablen wie der Feinwertungs-Browsertest. Browserprüfungen verwenden eine lokale, leere Testdatenbank und ändern keine echten Turniere.

Abschlussprüfung am 10. November 2026: 41 automatisierte Tests bestanden. Der vollständige Lobby-Worker lässt sich bündeln. Die Browserprüfung der Paarungsbearbeitung für Rundenturnier und Schweizer System besteht in Desktop-, iPad- und iPhone-Größe einschließlich Speicherung, Abbrechen, Fehlerprüfung, ausdrücklicher Dutch-Abweichung, Rücknahme, erneuter Freigabe und Ergebnissperre. Nach Speicherung beziehungsweise Rücknahme wird die Freigabeschaltfläche sichtbar positioniert und erhält den Tastaturfokus. Besucher und gewöhnliche Mitglieder bleiben ausgeschlossen. Die Prüfungen simulieren die Bildschirmgrößen in Chromium; ein Test auf echten iOS-Geräten/Safari ist damit nicht ersetzt.

## Bedienungslogik der Schaltflächen (10. November 2026)

„Turniermenü ▾“ öffnet ausschließlich das Auswahlmenü. Erst „Turnier konfigurieren“ öffnet die Konfiguration. „Bearbeitungsansicht“ führt aus der Leseansicht unmittelbar zurück. Diese Bezeichnungen gelten auch mobil.

Die Rundenaktionen stehen in der Reihenfolge „✏️ Paarungen bearbeiten“, „✓ Runde freigeben“ (beim Rundenturnier „✓ Paarungsplan freigeben“) und „Entwurf verwerfen“. Freigabe ist bordeauxrot hervorgehoben; Verwerfen zurückhaltend. Der Bearbeitungsbereich erscheint erst beim Klick auf die kompakte Bearbeitungsschaltfläche. Ein erneuter Klick klappt ihn zu, ohne die ungespeicherten Eingaben zu verlieren; „Abbrechen“ verwirft sie.

Für diese Änderung Gamer/index.html und Gamer/js/hsc08.js gemeinsam hochladen sowie den Lobby-Worker neu veröffentlichen. Spielregeln, Sperren und Berechtigungen bleiben unverändert.

Prüfung der Schaltflächenänderung: 41 automatisierte Tests bestanden; Paarungs- und Turnierabläufe einschließlich Menü, Konfiguration und Leseansicht in Desktop-, iPad- und iPhone-Größen erfolgreich geprüft (Chromium-Simulation).

## Sichtbare Texte (10. November 2026)

Turnierseite, Konfiguration, Hilfe, Dialoge und Statusmeldungen enthalten keine Hinweise mehr auf einen privaten Testbereich oder die persönliche Andili-Freigabe. Berechtigungsbezogene Meldungen und die Bestätigung manueller Paarungen sind neutral formuliert. Verwaltungsrechte bleiben serverseitig auf Andili beschränkt; sämtliche Schutzprüfungen gelten weiterhin. Tatsächliche Bearbeiternamen im Änderungsprotokoll bleiben erhalten. Zum Einspielen die beiden Gamer-Dateien gemeinsam aktualisieren und den Lobby-Worker neu veröffentlichen.

## Saisonbetrieb: Termine und Rückzüge (10. November 2026)

- Schweizer Rundentermine: Die betreffende Runde aufklappen, „📅 Rundentermine ändern“ wählen, Beginn, letzten Spieltermin und Begründung eingeben, „Termine speichern“. Dies gilt für vorbereitete und freigegebene Runden. Keine Überschneidung mit Nachbarrunden und keine Termine außerhalb des Turnierzeitraums; gegebenenfalls zunächst die Saison in der Konfiguration erweitern und übernehmen. Die Saison darf bestehende Runden nicht ausschließen. Paarungen und Ergebnisse bleiben erhalten. Abgeschlossene Turniere müssen vor Änderungen wieder geöffnet werden. Termine werden sofort übernommen und mit vorherigem/neuem Zeitraum protokolliert. Im Rundenturnier bleibt die freie Vereinbarung der Spieltermine bestehen; dort werden keine künstlichen Rundenfristen eingeführt.
- Schweizer Rückkehr: Unter Runden und Paarungen „Rückzug rückgängig machen …“ wählen und begründen. Nur im laufenden Turnier ohne offenen Paarungsentwurf möglich. Der Spieler steht bei der nächsten Vorbereitung wieder zur Verfügung. Frühere Aussetzrunden, Freilose und bereits freigegebene Paarungen werden nicht geändert. Die Rückkehr wird protokolliert.
- Rundenturnier-Rückzug: „Teilnehmer zurückziehen …“ wählen. Vor dem Speichern zeigt die Abfrage die Zahl tatsächlich gespielter Partien, den ursprünglichen Gesamtumfang und die Auswirkung auf die Wertung. Begründung und Bestätigung erforderlich.
- Vereinbarte 50-%-Regel: Nur 1–0, 0–1 und Remis zählen als tatsächlich gespielt; kampflose Ergebnisse und spielfreie Runden zählen nicht zur Schwelle. Bezugsgröße bleibt (ursprüngliche Teilnehmerzahl − 1) × Durchgänge. Bei Doppelrunden werden beide Durchgänge gemeinsam betrachtet. Unter 50 % werden sämtliche Begegnungen dieses Teilnehmers aus Punkten, Sonneborn-Berger und direktem Vergleich entfernt. Der Teilnehmer bleibt mit „ohne Wertung“ ohne Rangnummer sichtbar. Ab genau 50 % bleiben Ergebnisse gewertet; offene Partien werden als kampflose Verluste behandelt. Beide Punktewertungen werden berücksichtigt.
- Mehrere Rückzüge: Die ursprüngliche Bezugsgröße bleibt gleich. Sind beide Teilnehmer einer bisher offenen Begegnung zurückgezogen, erhalten beide 0 Punkte. Begegnungen mit einem unterhalb der Schwelle ausgeschiedenen Teilnehmer zählen weiterhin für keinen der Beteiligten zur Rangliste. Die Reihenfolge der Rückzüge verändert die Wertung nicht.
- Ursprüngliche Ergebnisse werden nicht gelöscht oder durch automatische Rückzugsergebnisse überschrieben. Automatische Ergebnisse sind mit „Rückzug“, nicht gewertete Begegnungen mit „ohne Wertung“ gekennzeichnet, auch in Leseansicht/HTML-Export. Bestehende Ergebnisse können begründet korrigiert werden; dadurch wird die 50-%-Schwelle erneut berechnet. Bei zurückgezogenen Teilnehmern kann ein Ergebnis nicht auf „Offen“ gesetzt werden, und automatisch behandelte offene Partien sind nicht manuell editierbar. Rücknahme eines Rundenturnier-Rückzugs ist inzwischen umgesetzt; siehe Ergänzung Rückkehr.
- Der Abschluss berücksichtigt automatisch behandelte und nicht gewertete Partien. JSON-Sicherung und Wiederherstellung erhalten Rückzüge, ursprüngliche Ergebnisse, Rundentermine und Protokolle; die Rangliste wird daraus neu berechnet. Ein Rückzug hebt keine bestehende Ergebnissperre auf; beim Rundenturnier ist nach einem Rückzug auch keine Planrücknahme möglich.
- Installation: Dateien in ihrer Ordnerstruktur übernehmen und den Lobby-Worker neu veröffentlichen. Keine Gamer-Frontend-Dateien erforderlich. Der lokale Projektordner ist bereits aktualisiert.

Prüfung Saisonbetrieb: 48 automatisierte Tests bestanden, vollständiger Worker erfolgreich gebündelt. Browserabläufe für Terminänderung, Schweizer Rückkehr und Rundenturnier-Rückzug in Desktop-, iPad- und iPhone-Größe bestanden. Dies sind Chromium-Simulationen, keine Tests auf echten iOS-Geräten.

## Lesefreigabe vom 10. November 2026

Bob, Thomas1961 und Fabili sehen nach Anmeldung unter Schachwelt die Rubrik Vereine mit HSC08. Sie gelangen ausschließlich in die Leseansicht des übernommenen Turnierstands. Kein Turniermenü, keine Bearbeitungsansicht, keine Ergebnisfelder, keine Entwürfe, Protokolle oder Sicherungen. Direkte Verwaltungsaufrufe und Schreibzugriffe sind serverseitig gesperrt. Andili behält die Verwaltung. Andere Konten und Besucher bleiben ausgeschlossen.

Installation: Gamer/index.html und Gamer/js/hsc08.js aktualisieren und Lobby-Worker neu veröffentlichen.

Prüfung Lesefreigabe: 49 Funktionstests bestanden. Separater Browsertest `hammerschach-lobby-worker/tests/hsc08-access-browser.mjs`: Bob auf Desktop, Thomas1961 in iPad-Größe, Fabili in iPhone-Größe; Navigation und reine Leseansicht geprüft. Besucher und anderes Mitglied bleiben ausgeschlossen. Mobile Prüfungen sind Chromium-Simulationen. Handbuch-/Erste-Schritte-/Hilfetexte mitgeprüft; keine zusätzliche sichtbare Freigabemeldung erforderlich.

## Ergänzung Rückkehr im Rundenturnier (10. November 2026)

Unter Runden und Paarungen „Rückzug rückgängig machen …“ wählen. Die Abfrage erläutert die Auswirkungen; eine Begründung bestätigt und speichert die Rückkehr. Nur im laufenden Turnier möglich, abgeschlossene Turniere zuerst für Korrekturen öffnen. Gespeicherte Ergebnisse einschließlich späterer Korrekturen bleiben unverändert. Automatische Rückzugswertungen entfallen für diesen Teilnehmer; vorher offene Partien werden wieder offen, sofern kein anderer Rückzug ihre Behandlung bestimmt. Andere Rückzüge bleiben erhalten. Rangliste und Feinwertung werden neu berechnet. Der Vorgang wird protokolliert und bleibt in JSON-Sicherungen erhalten. Keine Aufhebung bestehender Lösch- oder Ergebnissperren. Beide Punktewertungen und Einfach-/Doppelrunde werden unterstützt.

Installation: die geänderten Worker-Dateien übernehmen und Lobby-Worker neu veröffentlichen. Keine Frontendänderung notwendig. Erste Schritte/Hilfe in der Konfiguration wurden entsprechend ergänzt.

Prüfung Rückkehr: 54 Funktionstests bestanden, vollständiger Worker erfolgreich gebündelt. `tests/hsc08-return-browser.mjs` prüft Rücknahme, Abbrechen und Leseansicht auf Desktop sowie simulierten iPad-/iPhone-Größen in Chromium. Kein Test auf echten iOS-Geräten.

# HSC08-Berichte – 15. November 2026

## Öffnen und Lesen
Im HSC08-Header steht „📰 Berichte“ unmittelbar rechts neben „Zur Lobby“ und vor den Wettbewerben. Im mobilen Menü gilt dieselbe Reihenfolge; der mobile Kurzheader hebt wie bei den Wettbewerben den aktiven Bereich hervor. Die Übersicht zeigt neueste Berichtsdatum zuerst, Überschrift und Kurztext. Ohne Foto erscheint das HSC08-Logo als Vorschaubild. „Weiterlesen“ öffnet den vollständigen Text, Fotos, Anhänge und Autor/Quelle. Im Artikel wird kein zusätzliches Ersatzlogo wiederholt.

## Verwalten
„Berichtsmenü → Berichte verwalten“ öffnet die Übersicht mit „Neuer Bericht“ und „Bearbeiten“. Berichtsdatum, Überschrift (160 Zeichen), Kurztext (400), Autor/Quelle (200), Berichtstext (30.000) und optionaler Ergebnisdienst werden separat eingegeben. Die Werkzeugleiste bietet Fett, Kursiv, Überschrift und Absatz. Eingefügter Text wird ohne fremde HTML-Formatierung übernommen, anschließend kann er formatiert werden. Die Vorschau unterhalb des Formulars verändert keine gespeicherten Daten.

„Entwurf speichern“ speichert privat. Bei bereits veröffentlichten Berichten bleibt die bisherige öffentliche Fassung einschließlich Fotos und Anhängen erhalten. Erst „Veröffentlichen“ ersetzt sie durch den aktuellen Entwurf. „Leseansicht prüfen“ im Header zeigt diese veröffentlichte Fassung; „Bearbeitungsansicht“ führt zurück. Entwurfsstatus erscheint nur in der Verwaltung. Bei gleichzeitig geänderten Daten wird ein veralteter Speicherversuch zurückgewiesen, statt fremde Änderungen zu überschreiben. Vor dem Verlassen ungespeicherter Änderungen innerhalb der HSC-Navigation erfolgt eine Rückfrage; vor Browser-Neuladen grundsätzlich speichern.

„Bericht löschen“ entfernt nach Bestätigung Entwurf und Veröffentlichung. Die interne Kennung bleibt als Löschvermerk erhalten; der mitgelieferte erste Bericht wird nach Löschen nicht erneut angelegt. Es gibt derzeit keine Wiederherstellungsfunktion für gelöschte Berichte.

## Fotos und Anhänge
Bis zu vier Dateien, zusammen höchstens 500 KB nach Bildverkleinerung. JPG, PNG und WebP werden im Browser auf maximal 1000 Pixel Kantenlänge verkleinert und als JPEG gespeichert. Eine ausgewählte Einzeldatei darf vor Verkleinerung höchstens 5 MB groß sein. PDF und PGN sind als Anhänge möglich. Die erste Bilddatei ist das Vorschaubild. Dateien lassen sich vor dem Speichern entfernen. Foto- und Dateiinhalte werden zusammen mit dem Entwurf bzw. der Veröffentlichung geschützt gespeichert; kein öffentlicher Dateiordner. Anhänge werden als Download angeboten. Fremde HTML-/SVG-Dateien und falsche Dateisignaturen werden abgewiesen.

## Ergebnisdienst
Das Auswahlfeld enthält die vorhandenen aktivierten Ligatabellen des Gamer-Ergebnisdienstes. Gespeichert wird deren interne Kennung, keine frei eingegebene Adresse. „📊 Zu den Ergebnissen“ öffnet den bestehenden Ergebnisdienst innerhalb des Gamers und wählt die betreffende Liga aus. Wird ein Ziel deaktiviert oder entfernt, ist es nicht mehr auswählbar; ein bestehender Bericht zeigt einen Verfügbarkeitshinweis. Es wird keine andere Liga stillschweigend als Ersatz gewählt. Normale Ergebnis-/Rundenlinks des Ergebnisdienstes behalten ihr bestehendes Verhalten.

## Erster Bericht und Rechte
Thomas Flügels Bericht „Überraschungssieg gegen Werne 1“ vom 08.11.2026 wird beim ersten berechtigten Aufruf einmalig in neutraler Fassung als veröffentlichter Bericht angelegt. Er nennt Thomas als Quelle und verwendet mangels Foto das HSC08-Logo. Die Ergebnisdienst-Verknüpfung bleibt zunächst leer; die passende Liga ist in der Verwaltung auszuwählen. Bestehende Anpassungen werden beim Laden nicht durch den mitgelieferten Text überschrieben.

Andili verwaltet; Bob, Thomas1961 und Fabili lesen veröffentlichte Berichte. Besucher und andere Konten bleiben ausgeschlossen. Entwürfe und deren Dateien sind auch bei direkter Anfrage gesperrt. Rechte werden serverseitig geprüft. Die Berichte erhalten eine eigene Tabelle `hsc08_reports`; Meisterschaft, Blitzsaison, Info-Center und Online-Turniere werden nicht verändert. Die bestehenden Turniersicherungen enthalten keine Berichte. Keine E-Mail-Benachrichtigung oder Spielleiterdelegation hinzugefügt.

## Installation und Prüfungen
Gamer/index.html und Gamer/js/hsc08.js gemeinsam aktualisieren; die neuen Worker-Module mit übernehmen und den Lobby-Worker neu veröffentlichen. Tabelle und erster Bericht werden automatisch angelegt. Es ist keine separate Datenmigration nötig.

`node --test tests/hsc08*.test.mjs` prüft unter anderem Zugriffsschutz, Entwurfsisolation, Veröffentlichung, veraltete Speicherversuche, Löschvermerk, Format- und Dateiprüfung. `tests/hsc08-reports-browser.mjs` verwendet wie die vorhandenen Tests PLAYWRIGHT_MODULE, HSC08_WORKER_MODULE und CHROMIUM_EXECUTABLE; optional HSC_SCREENSHOT_DIR. Es prüft Übersicht, Logoersatz, Formatierung, Foto-/PGN-Upload, Vorschau, Entwurf, Veröffentlichung, Lesemodus, Rückkehr zur Verwaltung und internen Ergebnislink. Mobile Größen werden in Chromium simuliert, nicht auf echten iOS-Geräten getestet.

Prüfergebnis: 65 Funktionstests bestanden; vollständiger Worker erfolgreich gebündelt. Berichtsabläufe einschließlich Foto, Anhang, Formatierung, Veröffentlichung, Lesemodus und Ergebnislink auf Desktop, iPad- und iPhone-Größen bestanden. Bestehende Meisterschafts- und Blitzabläufe ebenfalls auf allen drei Größen erfolgreich geprüft.

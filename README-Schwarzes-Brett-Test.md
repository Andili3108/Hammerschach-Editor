# Schwarzes Brett – Änderungsstand vom 25. November 2026

## Grundlage und Auslieferung

Verwendet wurde der lokale freigegebene Ordner `Hammerschach-Gamer/`.
Die Ausgangsdatei `Gamer/index.html` stimmt bytegenau mit der letzten
Änderungs-ZIP `Hammerschach-Gamer-Verein-oeffentlicher-Lesezugriff.zip` überein;
auch deren übrige zehn Projektdateien stimmen mit dem lokalen Stand überein.
Die ältere vollständige ZIP vom 23. November wurde nicht als Basis verwendet.

Dieses Paket enthält ausschließlich neue/geänderte Dateien, relativ zum
Projektstamm. Kein Gesamtpaket, keine Beispiel-Einladung, keine privaten Daten.
Es wurde nichts öffentlich hochgeladen oder bereitgestellt.

## Übernehmen und testen

1. ZIP entpacken und die enthaltenen Dateien unter Beibehaltung der Ordnerstruktur
   in das GitHub-Projekt übernehmen. Keine vorhandenen Projektordner komplett löschen.
2. Sowohl die Gamer-Dateien als auch den bestehenden Lobby-Worker aktualisieren.
   `hammerschach-lobby-worker/src/index.js` importiert das neue `notice-board.js`.
   Ein alleiniger Upload der Gamer-Dateien genügt nicht: Der neue API-Endpunkt muss
   mit dem Lobby-Worker bereitgestellt werden. Bestehende Bindings und Secrets bleiben erhalten.
3. Die Tabelle `notice_board` wird im bestehenden D1 beim ersten Aufruf automatisch
   angelegt. Keine zusätzliche Datenbank, kein zusätzlicher Dienst und kein Zeitplan erforderlich.
4. Gamer neu laden. Zwischen oberer Übersicht und Aufgaben/Ticker erscheint die schmale
   Schaltfläche „📌 Schwarzes Brett“ für Besucher und Mitglieder.
5. Als Andili öffnen → „Meldungen verwalten“ → „＋ Neue Meldung“.
   Titel und Beschreibung ausfüllen, optional Kategorie, Anzeigen-bis, Anhänge und Links.
6. Zuerst als Entwurf speichern und die öffentliche Ansicht prüfen. Erst nach Bestätigung
   der öffentlichen Freigabe „Veröffentlichen“ wählen.
7. Mit einem privaten Browserfenster/ohne Anmeldung und einem normalen Mitgliedskonto
   Lesbarkeit und fehlende Verwaltungsaktionen prüfen. Anschließend Ausblenden und Löschen testen.

## Anhänge

Manueller Upload in **`Gamer/SchwarzesBrett/anhaenge/`** im bestehenden Repository
`Andili3108/Hammerschach-Editor`, Branch `main` (Repository aus der vorhandenen
Worker-Konfiguration übernommen).

Im Admin-Dialog je Zeile nur den Dateinamen eintragen, z. B. `ausschreibung.pdf`.
Bis zu zehn Anhänge: PDF, PNG, JPG/JPEG, WebP, PGN und TXT. Keine Unterordnerpfade.
Bis zu zehn externe HTTPS-Links, ebenfalls einer pro Zeile.

Der Server prüft beim Veröffentlichen jeden Anhang durch Abruf der ersten fünf Bytes aus dem öffentlichen GitHub-Ordner. Bei einer PDF prüft er zusätzlich die PDF-Kennung. Ein fehlender Anhang verhindert die gesamte Veröffentlichung;
eine bereits veröffentlichte Fassung bleibt unverändert. Öffentliche Anhänge werden
über `/api/notice-board/files/DATEINAME` an die öffentliche Gamer-Adresse weitergeleitet und
per Klick in einem separaten Tab geöffnet. Der Dialog bleibt dabei offen.

Dateien sind schon nach dem GitHub-Upload öffentlich erreichbar, unabhängig vom
Entwurfsstatus der Meldung. Nur ausdrücklich freigegebene Dateien hochladen.
Keine privaten E-Mail-Kopfzeilen oder Empfängerdaten übernehmen. Ausblenden und
Löschen einer Meldung löschen keine GitHub-Dateien.

## Verhalten

- Öffentlich sehen Besucher und Mitglieder dieselben veröffentlichten Meldungen.
- Neueste Erstveröffentlichung oben; „NEU“ und Zähler für exakt sieben Tage.
  Bearbeiten oder erneutes Einblenden startet diese Frist nicht erneut.
- „Anzeigen bis“ gilt einschließlich des gewählten Tages in Europe/Berlin.
  Abgelaufene Meldungen bleiben verwaltbar, werden öffentlich jedoch herausgefiltert.
- Geöffnete öffentliche Ansichten aktualisieren sich minütlich, die Schaltfläche
  lädt neue Meldungen alle fünf Minuten und beim Zurückkehren zum Browser nach.
  Unveränderte Inhalte und die Leseposition bleiben bei Hintergrundaktualisierungen erhalten.
- Entwurf speichern verändert eine bestehende öffentliche Fassung nicht.
- Ausblenden nimmt die Meldung aus der Öffentlichkeit; erneutes Veröffentlichen ist möglich.
- Löschen entfernt beide Textfassungen. Technische Versionskennungen bleiben erhalten,
  damit ein veralteter Editor keine gelöschte Meldung versehentlich wiederherstellen kann.
- Nur eine gültige Sitzung mit serverseitigem Administratorrecht UND Benutzername
  Andili darf Entwürfe lesen oder Änderungen vornehmen. Die Schaltfläche allein
  ist nicht die Rechteprüfung.
- Gleichzeitige Bearbeitung wird über eine Versionsprüfung gegen Überschreiben geschützt.
- Öffnen ausschließlich durch Klick. Schließen über Kreuz, Schließen, Escape oder
  Klick außerhalb; bei ungespeicherten Eingaben Rückfrage. Tastaturfokus bleibt im Dialog
  und kehrt beim Schließen zur Schaltfläche zurück.

## Wiederverwendung und Umfang

Das Vereins-Berichtsmodul wurde geprüft. Sein Muster aus getrennten Entwurfs-/
Veröffentlichungsfassungen und optimistischer Versionsprüfung ist übernommen.
Vereinsberichte selbst bleiben unverändert: Ihr Dateispeicher mit eingebetteten
Dateidaten passt nicht zum gewünschten manuellen GitHub-Upload. Deshalb nutzt das
Schwarze Brett ein eigenes kleines Modul mit der vorhandenen Sitzung, Adminprüfung,
D1-Datenbank und den Gamer-Designvariablen.

Info-Center, Gamer-Ticker, Spiellogik und Vereinsverwaltung wurden nicht verändert.
Keine Kommentare, kein Kalender, keine zusätzlichen Benachrichtigungs-E-Mails.

## Prüfungen

Automatisierte Serverprüfungen mit echter lokaler SQLite-Datenbank:
- Besucher, Mitglieder, nur namensgleicher Nutzer, fremder Administrator und gesperrter
  Administrator: Verwaltungszugriff abgewiesen; Andili zugelassen.
- Entwurf, Veröffentlichung, Freigabebestätigung, fehlende Anhänge, Bearbeitung ohne
  sofortige Veröffentlichung, Versionskonflikt, Ausblenden, Wiederveröffentlichen,
  Löschen und veraltete Lösch-/Speicherversuche.
- Siebentagegrenze, Berliner Tagesende, Sortierung, abgelaufene Veröffentlichungen.
- Unsichere Links, Pfade, ausführbare Dateiformate und ungültige Eingaben abgewiesen.
- Öffentliche Dateiroute und Einbindung im tatsächlichen Worker-Einstieg geprüft.

Browserprüfungen mit lokal ausgeliefertem Gamer und isolierter Testdatenbank:
- Desktop 1440×1000, iPad 820×1180, iPhone 390×844 und kleines iPhone 320×568.
- Admin-Verwaltungsablauf, Vorschau, Freigabe, Fehler bei fehlendem Anhang,
  separate Anhangöffnung, Entwurfsisolation, Ausblenden und Löschen.
- Besucher- und Mitglieder-Leseansicht, Leerzustand, keine automatische Öffnung,
  Position und Breite der Schaltfläche, keine horizontale Überbreite, Scrollbarkeit,
  Fokusführung, Escape, Schließknopf und Farbschemata.
- Prüfinhalte werden als Text ausgegeben, nicht als ausführbares HTML.

Die sechs neuen Servertests sowie vier bestehende Tests zu Besucherzugriff und
Vereinsberichten bestehen. Die sechs Browser-Szenarien bestehen.
Ein zusätzlich ausgeführter vorhandener Begrüßungs-/Registrierungstest scheitert
an `handleSchacheckeApi is not defined` in seiner Testumgebung. Dieser identische
Fehler wurde mit dem unveränderten Ausgangsstand reproduziert; elf andere Tests
in dieser Datei bestehen. Dieser fremde Test wurde nicht verändert.

Die Mobilprüfungen simulieren Gerätegrößen im Testbrowser; sie ersetzen keinen
abschließenden Test auf echtem iOS/Safari. Die tatsächliche öffentliche Bereitstellung
und GitHub-Dateiverfügbarkeit müssen nach deinem Upload geprüft werden. Es wurden
keine realen Anhänge hochgeladen; die lokalen Verfügbarkeitstests verwenden Testantworten.

Tests (Node mit node:sqlite; Browserprüfung benötigt Playwright und Chromium):

    node --test tests/notice-board.test.mjs
    node tests/notice-board-browser.mjs

Optional können PLAYWRIGHT_MODULE und CHROMIUM_EXECUTABLE auf vorhandene lokale
Installationen zeigen. Tests aus dem Ordner `hammerschach-lobby-worker/` ausführen.

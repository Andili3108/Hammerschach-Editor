# Live-Board: hängende Veranstaltungssuche

Korrektur vom 8. Oktober 2026, aufbauend auf dem Gesamtpaket
Hammerschach-Gamer-Live-Board-Engine-PGN-Gesamtpaket-2026-10-08.zip.

## Einspielen

Die Dateien mit ihrer bestehenden Ordnerstruktur übernehmen.
Die Gamer-Website UND den Lobby-Worker erneut veröffentlichen.
Anschließend die Gamer-Seite vollständig neu laden. Die index.html trägt eine
neue Versionskennung für live-board.js, damit der Browser die Korrektur lädt.
Engine-Dateien müssen nicht erneut kopiert werden. Keine Datenbankmigration.

## Bestätigte Beobachtungen

- Die öffentlich ausgelieferten Dateien live-board.js und online-session.js
  entsprachen beim Abruf dem zuvor gelieferten Stand.
- Im geöffneten Firefox wurde die Veranstaltungssuche beobachtet: Die
  Vorab-Anfrage (OPTIONS) war erfolgreich; die eigentliche GET-Anfrage
  blieb offen und wurde vom Browser nach Ablauf der 45-Sekunden-Grenze
  abgebrochen. Danach startete der Code automatisch weitere Versuche.
- Die öffentlichen Veranstaltungsquellen antworteten beim unabhängigen
  lokalen Kontrollabruf. Die konkrete interne Ursache im veröffentlichten
  Cloudflare-Worker ist ohne dessen Laufzeitprotokolle nicht bestätigt.
- Der Statusfilter „Laufend“ filtert die vorhandene Liste lokal. Der Wechsel
  darauf, ein Filterwechsel während einer hängenden Aktualisierung und der
  anschließende Wechsel zwischen beiden Kategorien wurden gezielt geprüft.
  Ein eigenständiger Fehler dieses Filters ließ sich dabei nicht reproduzieren.

## Korrektur

- Eigene Zeitgrenzen für Authentifizierung, gespeicherte Veranstaltungen,
  Suchzweige, Cache-Lesen/-Schreiben, Quellenabruf und Antworttext.
  Auch ein nicht auf AbortSignal reagierender Vorgang blockiert die
  jeweilige wartende Auswertung damit nicht unbegrenzt.
- Gespeicherte Veranstaltungen, Lichess-Suche und Verbandssuche werden
  unabhängig ausgewertet. Ausfälle eines Suchzweigs verhindern nicht die
  Anzeige erfolgreicher anderer Zweige. Fehlende Teilquellen werden benannt.
- Antwortströme werden auch bei Ablehnung, Weiterleitung oder Timeout
  freigegeben. Der vorhandene Schutz vor fremden Weiterleitungen bleibt.
- Die Kataloganfrage im Browser endet spätestens nach 25 Sekunden Wartezeit.
  Nach Fehlschlag gibt es eine Meldung und einen bedienbaren Aktualisieren-
  Knopf. Keine automatische Wiederholungsschleife für den Katalog.
- Bereits geladene Listen und Filter bleiben nach einem Abruffehler nutzbar.
  Die Aktualisierung laufender Bretter behält ihre bisherige Wiederholung.

## Prüfung

51 automatisierte Live-Board-Tests bestanden, davon sieben neue Tests für
hängende Cache-/Quellenvorgänge, Antwortströme, Datenbankzugriff und Anmeldung.
Die sieben neuen Fehlerszenarien scheitern im bisherigen Code und bestehen
mit der Korrektur. Verkürzte Testzeitgrenzen simulieren hängende Vorgänge.

Der neue Katalog-Browsertest prüft „Laufend“, Abbrechen durch Filterwechsel,
Kategorie-Wechsel, Timeout, fehlende automatische Wiederholung, manuellen
Wiederanlauf, Teilantworten und Erhalt der letzten Liste bei Fehlern.
Der bestehende Live-Board-Browsertest prüft außerdem weiterhin die normale
Navigation, Aktualisierung und Zugansicht. Browsergrößen: Desktop, iPad,
iPhone; Chromium-Simulation, keine echten iOS-Geräte.

Es wurde nichts auf GitHub oder Cloudflare veröffentlicht. Ob diese
Absicherung auch die konkrete Blockade der veröffentlichten Installation
vollständig beseitigt, muss nach dem Einspielen dort geprüft werden.

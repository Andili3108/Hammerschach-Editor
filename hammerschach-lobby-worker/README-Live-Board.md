# LIVE-BOARD – Veranstaltungssuche und echter Quellentest

Stand: 6. Oktober 2026. Dieses Änderungs-ZIP setzt auf dem zuletzt gelieferten `Hammerschach-Gamer-LIVE-BOARD-Komplettpaket-2026-10-06.zip` auf. Es enthält ausschließlich bearbeitete/neue Dateien in der bisherigen Ordnerstruktur.

## Einspielen

1. Die enthaltenen Dateien über die gleichnamigen Dateien des letzten Komplettpakets legen; neue Dateien ergänzen. Die oberste Ebene ist einmal `Hammerschach-Gamer/`.
2. **Lobby-Worker und Gamer-Frontend beide neu bereitstellen.** Das neue Worker-Modul `src/live-board-catalog.js` muss dabei mitkommen. Ein Austausch nur der HTML-Datei genügt nicht.
3. Als **Andili** unter **Schachwelt → LIVE-BOARD → Turnierschach** öffnen. Die öffentliche Veranstaltungsliste wird automatisch geladen. Dafür sind kein Lichess-Konto, Token und keine manuell hinterlegte Veranstaltung nötig.
4. Veranstaltung auswählen, Runde wählen, vier Bretter ansehen; mit Vor/Zurück blättern oder einen Spieler/eine Brettnummer suchen. Ein Brett öffnet die große passive Einzelansicht.
5. Zur Lobby führt weiterhin ausschließlich die vorhandene Schaltfläche im Header bzw. Mobilmenü. Die originale Fußzeile bleibt Bestandteil des Gamers.

Es wurde nichts produktiv ausgerollt und keine Cloudflare-Einstellung verändert. Vorhandene Bindings, Secrets, Cronjobs und `wrangler.toml` bleiben bestehen. Falls ausdrücklich `LIVE_BOARD_DISCOVERY=0` gesetzt wurde, diese Abschaltung für die automatische Suche entfernen. Bestehende korrekt konfigurierte Demo-/Quelleneinträge bleiben zusätzlich verfügbar; Demos sind weiter als DEMO markiert.

## Was der Gamer selbst findet

- Der Worker verwendet den offiziellen öffentlichen Lichess-Katalog `/api/broadcast/top`: aktive, angekündigte und die erste Seite zuletzt beendeter Übertragungen. Kein Scraping und keine Vollsuche durch das gesamte Internet.
- **Turnierschach:** öffentliche Veranstaltungen aus diesem Katalog.
- **Vereinsschach:** zusätzlich die von Lichess ausdrücklich als Mannschaftsveranstaltungen markierten Einträge (`teamTable`), ergänzt um eigene Vereinsübertragungen. Das umfasst auch Mannschaftsturniere und ist kein vollständiges Verzeichnis deutscher Vereinsligen.
- Suche nach Veranstaltungsnamen und Filter für laufend/geplant/beendet arbeiten lokal in der bereits geladenen Liste. Acht Veranstaltungen pro Katalogseite; vier Bretter pro Brettseite.
- Beim Öffnen wird die offizielle Rundenliste geladen. Die ausgewählte Runde bleibt fest, bis eine andere gewählt wird. Ein Rundenwechsel setzt Brettsuche und Einzelansicht zurück. Noch nicht veröffentlichte Bretter angekündigter Runden erscheinen als leerer Wartestand.
- Der Katalog deckt nur bei Lichess gelistete Übertragungen ab. Nicht gelistete Vereinsveranstaltungen werden nicht erfunden. Für diese gibt es die Link-Eingabe.
- „Aktualisieren“ fragt den Gamer-Worker erneut ab; der gemeinsame Quellen-Cache wird dabei bewusst nicht umgangen. Bei einem Katalogausfall bleiben eigene Quellen nutzbar und eine kurze Fehlermeldung erscheint. Ein vorhandener älterer Katalog wird als verzögert gekennzeichnet.

## Eigene Übertragungen direkt im Gamer

In der Veranstaltungsübersicht **Eigene Übertragung hinzufügen** öffnen, Name und öffentlichen Link eingeben und **Hinzufügen** drücken. Der aktuell geöffnete Bereich bestimmt Vereinsschach/Turnierschach.

Unterstützte Links:

- **Lichess:** Link einer konkreten Broadcast-Runde, beispielsweise `https://lichess.org/broadcast/TURNIER/RUNDE/ACHTSTELLIGE-ID`, oder deren offizieller PGN-Export. Ein Turnierübersichtslink ohne konkrete Runde reicht in diesem Eingabefeld nicht.
- **DGT LiveChessCloud:** offizieller Viewer-Link `https://view.livechesscloud.com/#UUID`, optional mit `/RUNDENNUMMER`. Das Feld **DGT-Runde** erscheint bei einem DGT-Link; eine enthaltene Rundennummer wird übernommen und kann angepasst werden.
- **Öffentliche PGN:** vollständige direkte HTTPS-Adresse. Aus Sicherheitsgründen muss deren Host weiterhin einmal in der vorhandenen Worker-Variable `LIVE_BOARD_PGN_HOSTS` freigegeben werden, etwa `live.verein.de,live.turnier.de`. Der Gamer nennt einen noch nicht freigegebenen Host als Fehlermeldung. Lichess und DGT benötigen diese zusätzliche Freigabe nicht. Weiterleitungen, URL-Zugangsdaten, interne/IP-Hosts und abweichende Ports werden abgelehnt.

Die Quelle wird vor dem Speichern tatsächlich abgerufen und ihr Datenformat geprüft. Eigene Einträge werden dauerhaft in der vorhandenen D1-Datenbank gespeichert. Das Modul legt bei Bedarf ausschließlich die Tabelle `live_board_sources` an (`id`, `event_json`, `created_at`); keine bestehenden Tabellen werden geändert. Maximal 40 eigene Quellen. Derselbe Link im selben Bereich wird nicht doppelt angelegt. Einträge aus dieser Eingabe können in ihrer Brettansicht über **Übertragung entfernen** und den zweiten Klick **Wirklich entfernen?** gelöscht werden. Eine entfernte Quelle kann erneut hinzugefügt werden.

Die vorhandene optionale Variable `LIVE_BOARD_EVENTS` funktioniert weiter (maximal 40 konfigurierte Einträge). Diese Einträge können nicht über die neue Oberfläche gelöscht werden. Das Format dokumentiert `live-board.events.example.json`. Demo-Einträge benötigen weiterhin `LIVE_BOARD_DEMO=1`; bei Abschalten des Demomodus auch die Demo-Einträge entfernen. Eigene gespeicherte Quellen sind feste Runden, während automatisch gefundene Veranstaltungen eine Rundenauswahl haben.

## Design, Zugriff und Architektur

- Eingebauter Bereich unter dem vorhandenen Header, kein Popup. Originale Gamer-Schaltflächen, Figuren und Brettfarben. Keine zusätzlichen Hauptmenüpunkte, doppelten Lobby-Schaltflächen oder Hinweise wie „Nur zuschauen“.
- Vorläufig ausschließlich für **Andili**: Menüfreigabe und API prüfen diesen Benutzernamen ohne Beachtung der Groß-/Kleinschreibung. Die API verwendet dafür die vorhandene serverseitige Sitzungsprüfung. Andere Mitglieder erhalten 403, Besucher/ungültige Sitzungen 401 – auch für Katalog, Runden, direkte Brettadressen, Hinzufügen und Entfernen.
- Die Andili-Prüfung erfolgt vor Datenbank-, Quellen- oder Cachezugriff. Quellen erhalten keine Gamer-Tokens, Cookies oder Benutzernamen. API-Antworten sind `private, no-store` und nach Authorization getrennt.
- Vorhandener Worker-Router, Login und Navigation bleiben bestehen. Keine zusätzliche Laufzeitbibliothek, Hardware-/Bluetooth-/USB-Logik oder Cron-Abfrage.
- Passive Bretter verwenden eigene Instanzen des vorhandenen Gamer-Regelkerns. Eigene Partie, Zugliste, Spielräume und Uhren werden nicht verändert. Standard-Schach, Standard-FEN, Rochade, en passant und Verwandlung werden unterstützt; andere Varianten wie Chess960 werden mit einem Fehlerhinweis statt einer falschen Stellung dargestellt.
- Desktop vier Bretter nebeneinander, iPad/iPhone 2×2; Suchbereich dort zunächst eingeklappt. Bei 1440×1000, 820×1180 und 390×844 passen vier echte Bretter einschließlich Seitensteuerung ins Fenster. Die normale Fußzeile folgt darunter. Kleinere Fenster, Zoom und besonders lange Titel können Scrollen erfordern.

## Abfragen und Grenzen

- Geschlossen, ausgeloggt, im Hintergrund oder offline: keine laufenden Browser-Live-Abfragen. Sichtbare Auswahl: eine Anfrage etwa alle 30 Sekunden, keine vier separaten Browserabrufe. Seitenwechsel/Logout brechen alte Abrufe ab; verspätete Antworten überschreiben keine andere Ansicht.
- Beendete sichtbare Auswahl bzw. beendete Runde: kein automatisches Polling. Leere angekündigte Runde: langsamer Wiederholabstand von 60 Sekunden. Erfolgloses Brett-Suchergebnis pollt nicht weiter.
- Katalog und Rundenlisten: fünf Minuten gemeinsamer Cache. PGN und DGT-Brettdaten: 30 Sekunden. DGT-Paarungen: 60 Sekunden; DGT-Hostauflösung: fünf Minuten. Vollständig abgeschlossene Daten: bis zu 24 Stunden. Ergebnisberichtigungen können deshalb verzögert eintreffen.
- Gleichzeitige identische Abrufe werden innerhalb einer Worker-Instanz zusammengeführt. Lichess-Anfragen verschiedener Endpunkte werden innerhalb dieser Instanz nacheinander ausgeführt; nach HTTP 429 gilt dort mindestens eine Minute Pause.
- Cloudflare Cache API ist pro Rechenzentrum geteilt, **kein weltweit zentraler Einmal-Abruf**. Andere Instanzen/Standorte können parallel auf Quellen zugreifen. Die Abrufpause ist ebenfalls kein globaler Koordinator. Realen Verbrauch und Cache-Hitrate nach Testdeployment kontrollieren.
- Bei einer Sammel-PGN muss der Worker die ganze Runde abrufen; der Browser erhält nur seine vier bzw. eine Partie. DGT erlaubt selektive Brettdateien. Fertige Bretter in einer weiterhin laufenden Sammel-PGN bleiben Teil des Gesamtquellenabrufs.
- Maximal 2 MiB je Quelldatei, 1.000 Partien, 1.600 Halbzüge pro Partie. PGN-Reihenfolge innerhalb einer Runde muss stabil bleiben. Ungültige/unvollständige Aktualisierungen ersetzen keinen guten Cache-Stand; eine leere PGN wird nur bei angekündigten automatischen Runden als Wartestand akzeptiert. Bei Quellenfehlern mindestens 60 Sekunden Abstand, Browserfehler bis zu vier Minuten.
- Die bereits vorhandenen sonstigen Gamer-Pollingmechanismen wurden nicht umgestellt.

## Nachweis der Tests

**Echte externe Quelle, 6. Oktober 2026 um 10:28 Uhr MESZ:** [Romanian Team Chess Championships 2026 | Division A, Round 2](https://lichess.org/broadcast/romanian-team-chess-championships-2026-division-a/round-2/9NxAdvEC).

- Öffentlicher Katalog → Veranstaltungsmetadaten/Runden → PGN → neues Worker-Modul → vorhandene Gamer-Brettlogik erfolgreich getestet. Alle **48 Partien** vollständig nachgespielt.
- Zwischen zwei echten Abrufen wuchs Brett 1 von 34 auf 37 Halbzüge; es wurden reale neue Züge empfangen. Das war kein künstlicher Demo-Zugwechsel.
- Vierer-Seite, zweite Seite, Einzelbrett und Namenssuche teilten einen PGN-Ursprungsabruf. Abgeschlossene Runde 1 zusätzlich abgerufen und Polling-Stopp geprüft.
- Browserprüfung mit den aufgezeichneten echten Anbieterantworten und dem tatsächlichen Worker-Handler auf Desktop-, iPad- und iPhone-Größe: Anzeige, Suche, Rundenwechsel, Seitenwechsel, Nachspielen, eigene Quelle hinzufügen/speichern/entfernen, normale Fußzeile und Lobby-Rückkehr bestanden; keine JavaScript-Seitenfehler und kein horizontaler Überlauf. Die drei Browserläufe wiederholen die Anbieterantworten lokal und erzeugen keine zusätzlichen externen Lasttests.
- Bestehender separater Browserlauf mit Demo-Testdaten weiterhin bestanden: Hintergrundpause/Wiederaufnahme, beendete Bretter, Sitzungsablauf, Logout, fremde Mitglieder, verspätete Antworten und unveränderte eigene Partie.
- **19 LIVE-BOARD-Tests bestanden.** Einschließlich SQL-Speicherung/Löschung/Duplikaten/40er-Grenze, Schreibschutz für Fremde, URL-Grenzen, Katalog/Runden, Cache, Lichess-Serialisierung und 429-Pause. SQL-Tests verwenden echtes lokales SQLite mit einer kleinen D1-Schnittstellenanpassung.
- Gesamte vorhandene Node-Testreihe: **223 von 226 bestanden**. Die drei Fehler sind die bereits vorhandenen `deleteProgress is not defined`-Fehler in `account-deletion-tournaments.test.mjs`. Vor diesem Update: 217 von 220 bestanden; keine zusätzlichen Fehlschläge.

**Nicht bestätigt:** produktives Cloudflare-Deployment mit echter D1-Sitzung/verteilter Cache API, DGT-Ende-zu-Ende mit einer realen Veranstaltung und physische Apple-Geräte/Safari. DGT bleibt durch Format-/Abrufsimulation getestet. Die Bildschirmgrößen wurden mit Chromium emuliert. PGN-Fremdhosts wurden mit kontrollierten Testdaten geprüft; der echte Quellentest nutzte Lichess.

## Tests wiederholen

Im Worker-Ordner, Node 22.13 oder neuer (SQLite erforderlich):

```sh
node --test tests/live-board*.test.mjs
node --test tests/*.test.mjs
```

Mit installiertem Playwright/Chromium:

```sh
node tests/live-board-browser.mjs
```

Optionaler echter externer Test (greift ausdrücklich auf öffentliche Lichess-Daten zu):

```sh
LIVE_BOARD_RECORD=/tmp/live-board-record.json node tests/live-board-external.mjs
LIVE_BOARD_RECORD=/tmp/live-board-record.json node tests/live-board-discovery-browser.mjs
```

`LIVE_BOARD_TOUR` kann eine konkrete achtstellige Turnier-ID auswählen, solange sie noch im öffentlichen Katalog steht. Ohne Vorgabe wird eine laufende bzw. verfügbare Übertragung gewählt. Der reale Browserlauf setzt eine Veranstaltung mit mindestens vier Brettern voraus. `PLAYWRIGHT_MODULE` kann auf die installierte `index.mjs` zeigen, `CHROMIUM_EXECUTABLE` auf eine vorhandene Chromium-Datei und `LIVE_BOARD_SCREENSHOTS` auf einen Screenshot-Ausgabeordner. Alle Tests verwenden lokale Testidentitäten; keine produktiven Gamer-Zugangsdaten.

## Quellen

- [Offizielle Lichess-API](https://lichess.org/api), insbesondere `broadcast/top`, `/api/broadcast/{id}` und PGN-Rundenexport.
- [Offizielle Broadcast-Hilfe](https://lichess.org/broadcast/help): gelistete gegenüber nicht gelisteten Übertragungen, Turniere und Runden.
- [Lichess API-Tipps](https://lichess.org/page/api-tips): serielle Aufrufe und Pause nach 429.
- [DGT LiveChessCloud-Viewer](https://view.livechesscloud.com/) und vorhandener Quellenadapter.
- [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/): Standortbindung des Caches.

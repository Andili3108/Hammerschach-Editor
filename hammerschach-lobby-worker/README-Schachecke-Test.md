# Lobby: Chat-Schalter und Freigabe – Update vom 11.10.2026

Dieses kleine Änderungs-ZIP baut auf dem bereits eingespielten Testpaket `Hammerschach-Gamer_Schachecke_Test.zip` auf. Nur die in diesem Schritt geänderten und neuen Dateien sind enthalten.

## Einspielen

1. Die Dateien in die gleichnamigen bestehenden GitHub-Ordner übernehmen; Ordner zusammenführen, nicht komplett ersetzen.
2. Das Frontend wie bisher bereitstellen und anschließend den Gamer neu laden.
3. Den Lobby-Worker mit der enthaltenen `hammerschach-lobby-worker/wrangler.toml` erneut bereitstellen. Dort steht jetzt `SCHACHECKE_MEMBERS_ENABLED = "1"`. Diese Freigabe wird erst durch das Worker-Deployment wirksam. Bei deinem vorhandenen Wrangler-Verfahren: `npm run deploy` im Worker-Ordner.

Es sind keine neuen Projektordner, Puzzle-Kopien oder Datenbankarbeiten nötig. Der Worker-Code aus dem vorherigen Testpaket bleibt unverändert.

## Neue Bedienung

- Der Reiter und die sichtbare Bezeichnung „Schachecke“ entfallen vollständig. Vorhandene interne Modul- und Dateinamen bleiben bestehen, damit keine unnötigen Umbenennungen nötig sind.
- Aufgabenbrett und Gamer-Ticker werden beim Start und bei der Rückkehr zur Lobby standardmäßig angezeigt. Die vorherige Speicherung der gewählten Ansicht wird nicht mehr verwendet.
- Ein einzelner rastender **Chat**-Schalter zeigt beim ersten Klick den Chat anstelle von Brett und Ticker; ein weiterer Klick führt wieder zurück. Der gedrückte Zustand wird optisch und über `aria-pressed` angezeigt.
- **Alle angemeldeten Mitglieder** erhalten Zugang zu Aufgaben und Ticker. Besucher bleiben ausgeschlossen.
- Neue fremde Chatnachrichten erhöhen den kleinen Zähler, während der Chat ausgeblendet ist. Beim Öffnen des sichtbaren Chats wird er zurückgesetzt. Bei null ist kein Zähler zu sehen; ab 100 steht dort „99+“, die genaue Zahl im Hinweistext.
- Eigene und stummgeschaltete Nachrichten zählen nicht mit. Doppelte Nachrichten erhöhen den Zähler nicht erneut; gelöschte Nachrichten werden aus ihm entfernt.
- Der Lesestand bleibt getrennt je Konto in diesem Browser gespeichert. Beim allerersten Laden zählt die vorhandene Historie nicht pauschal als neu. Danach werden neue Nachrichten seit dem gespeicherten Stand berücksichtigt, soweit sie in der vom Server gelieferten Chat-Historie vorhanden sind. Es gibt keine zusätzlichen Serverabfragen und keine geräteübergreifende Synchronisierung des Lesestands.
- Der Chat bleibt bei sichtbarem Brett/Ticker verbunden. Die Aufgaben- und Tickerfunktionen bleiben erhalten.

## Prüfung

Automatische Prüfung der Wochenaufgaben, Nachrichtenaufbereitung, Zwischenspeicherung und serverseitigen Mitgliederfreigabe; zusätzliche Prüfung des Zählers mit Historie, Duplikaten, eigenen/stummgeschalteten Nachrichten, Sichtbarkeit, Löschung, Neuladen und Kontowechsel.

Browserprüfung in Chromium für Desktop (1440 × 1000), iPad (820 × 1180) und iPhone (390 × 844): Standardansicht, Umschalten, Zähler und Zurücksetzen, Neuladen, Zugang eines gewöhnlichen Mitglieds sowie Aufgabenbedienung, Maus-/Touchziehen und Hell-/Dunkelmodus. Mobile Geräte werden dabei emuliert; der Praxistest auf deinen Apple-Geräten folgt nach dem Einspielen.

Für einen kurzen eigenen Test: als gewöhnliches Mitglied anmelden, Chat öffnen/schließen und bei geschlossenem Chat eine Nachricht eines zweiten Mitglieds empfangen. Zähler kontrollieren, Chat öffnen und anschließend die Lobby neu laden: Brett und Ticker sollen wieder die Startansicht sein.

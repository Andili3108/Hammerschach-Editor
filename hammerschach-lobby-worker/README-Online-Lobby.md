# Hammerschach-Gamer Online-Lobby

Diese Stufe ergänzt nur die Online-Lobby:

- Raum erstellen
- Einladungslink kopieren
- per `?room=` beitreten
- Rollen Weiß/Schwarz/Zuschauer anzeigen

Die Zugsynchronisierung ist absichtlich noch nicht enthalten.

## Dateien

- `Hammerschach-Gamer-Online-Lobby.html` in den bestehenden `Gamer`-Ordner legen.
- Den Inhalt aus `hammerschach-lobby-worker/` als Cloudflare Worker deployen.

## Wichtig bei getrennter Domain

Wenn die HTML-Datei nicht direkt über denselben Worker ausgeliefert wird, öffne die HTML und trage oben im Online-Lobby-Abschnitt die Worker-URL ein:

```js
const ONLINE_WORKER_URL = 'https://hammerschach-gamer-lobby.DEIN-ACCOUNT.workers.dev';
```

Wenn HTML und Worker dieselbe Domain verwenden, kann der Wert leer bleiben.

## Worker lokal testen

```bash
cd hammerschach-lobby-worker
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

Danach `/health` im Browser testen.

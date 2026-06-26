function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      ...(init.headers || {})
    }
  });
}

function cleanRoomId(value) {
  const room = String(value || '').trim();
  return /^[A-Za-z0-9_-]{3,64}$/.test(room) ? room : '';
}

function cleanPlayerId(value) {
  const player = String(value || '').trim();
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(player) ? player : crypto.randomUUID();
}

function safeSend(ws, payload) {
  try {
    ws.send(JSON.stringify(payload));
  } catch (_) {}
}

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const room = cleanRoomId(url.searchParams.get('room'));
    const playerId = cleanPlayerId(url.searchParams.get('player'));
    if (!room) return new Response('Missing or invalid room', { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const role = await this.assignRole(playerId);

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ playerId, role, room, joinedAt: Date.now() });

    safeSend(server, { type: 'hello', room, playerId, role });
    await this.broadcastLobby(room);

    return new Response(null, { status: 101, webSocket: client });
  }

  async assignRole(playerId) {
    const players = (await this.state.storage.get('players')) || { white: null, black: null };

    if (players.white === playerId) return 'w';
    if (players.black === playerId) return 'b';

    if (!players.white) {
      players.white = playerId;
      await this.state.storage.put('players', players);
      return 'w';
    }

    if (!players.black) {
      players.black = playerId;
      await this.state.storage.put('players', players);
      return 'b';
    }

    return 'spectator';
  }

  getActivePlayers() {
    const active = {
      white: { connected: false },
      black: { connected: false },
      spectators: 0
    };

    for (const ws of this.state.getWebSockets()) {
      const info = ws.deserializeAttachment() || {};
      if (info.role === 'w') active.white.connected = true;
      else if (info.role === 'b') active.black.connected = true;
      else active.spectators += 1;
    }

    return active;
  }

  async broadcastLobby(roomOverride) {
    const players = await this.state.storage.get('players');
    const active = this.getActivePlayers();

    for (const ws of this.state.getWebSockets()) {
      const info = ws.deserializeAttachment() || {};
      const room = roomOverride || info.room || 'unknown';
      safeSend(ws, {
        type: 'lobby',
        room,
        role: info.role || 'spectator',
        playerId: info.playerId || null,
        assigned: {
          white: !!(players && players.white),
          black: !!(players && players.black)
        },
        players: active
      });
    }
  }

  async webSocketMessage(ws, message) {
    let data = null;
    try {
      data = JSON.parse(message);
    } catch (_) {
      return;
    }

    if (data.type === 'ping') {
      safeSend(ws, { type: 'pong', ts: Date.now() });
      return;
    }

    // Zugsynchronisierung wird absichtlich erst in der nächsten Stufe ergänzt.
    if (data.type === 'move') {
      safeSend(ws, { type: 'error', code: 'MOVE_SYNC_NOT_ENABLED' });
    }
  }

  async webSocketClose() {
    await this.broadcastLobby();
  }

  async webSocketError() {
    await this.broadcastLobby();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'content-type'
        }
      });
    }

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'hammerschach-gamer-lobby' });
    }

    if (url.pathname === '/ws') {
      const room = cleanRoomId(url.searchParams.get('room'));
      if (!room) return new Response('Missing or invalid room', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const id = env.GAME_ROOM.idFromName(room);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    return json({
      ok: true,
      service: 'hammerschach-gamer-lobby',
      endpoints: ['/health', '/ws?room=ROOM_ID&player=PLAYER_ID'],
      note: 'Diese Stufe verwaltet nur Lobby und Rollen. Zugsynchronisierung folgt später.'
    });
  }
};

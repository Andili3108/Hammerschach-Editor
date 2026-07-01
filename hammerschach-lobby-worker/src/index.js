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

function opposite(role) {
  return role === 'w' ? 'b' : 'w';
}

function cleanTimeControl(value) {
  if (!value || typeof value !== 'object') return null;

  const key = String(value.key || '').trim();
  if (!/^\d+\+\d+$/.test(key)) return null;

  const [baseFromKey, incFromKey] = key.split('+').map(v => parseInt(v, 10));
  const baseSeconds = Number.isFinite(Number(value.baseSeconds))
    ? Math.max(0, Math.floor(Number(value.baseSeconds)))
    : baseFromKey;
  const incrementSeconds = Number.isFinite(Number(value.incrementSeconds))
    ? Math.max(0, Math.floor(Number(value.incrementSeconds)))
    : incFromKey;

  if (!baseSeconds) return null;

  return {
    key,
    category: String(value.category || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24),
    label: String(value.label || key).slice(0, 120),
    baseSeconds,
    incrementSeconds,
    updatedAt: Date.now()
  };
}

function cleanSquare(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Math.floor(Number(value[0]));
  const y = Math.floor(Number(value[1]));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  return [x, y];
}

function cleanMove(value) {
  if (!value || typeof value !== 'object') return null;
  const from = cleanSquare(value.from);
  const to = cleanSquare(value.to);
  if (!from || !to) return null;

  const promotionRaw = value.promotion ? String(value.promotion).toUpperCase() : '';
  const promotion = ['Q', 'R', 'B', 'N'].includes(promotionRaw) ? promotionRaw : null;

  return {
    from,
    to,
    promotion,
    san: String(value.san || '').slice(0, 40),
    clientPly: Number.isFinite(Number(value.ply)) ? Math.max(1, Math.floor(Number(value.ply))) : null,
    clientMessageId: String(value.messageId || value.message_id || '').slice(0, 96)
  };
}

function makeInitialClock(timeControl, now = Date.now()) {
  const baseMs = Math.max(0, Math.floor(Number(timeControl.baseSeconds || 0) * 1000));
  return {
    wMs: baseMs,
    bMs: baseMs,
    turn: 'w',
    running: true,
    lastTs: now,
    timeLost: false,
    loser: null,
    winner: null,
    updatedAt: now
  };
}

function advanceClock(clock, now = Date.now()) {
  if (!clock || typeof clock !== 'object') return null;
  const out = {
    wMs: Math.max(0, Math.floor(Number(clock.wMs || 0))),
    bMs: Math.max(0, Math.floor(Number(clock.bMs || 0))),
    turn: clock.turn === 'b' ? 'b' : 'w',
    running: !!clock.running,
    lastTs: Number.isFinite(Number(clock.lastTs)) ? Math.floor(Number(clock.lastTs)) : now,
    timeLost: !!clock.timeLost,
    loser: clock.loser || null,
    winner: clock.winner || null,
    updatedAt: Number.isFinite(Number(clock.updatedAt)) ? Math.floor(Number(clock.updatedAt)) : now
  };

  if (out.running && !out.timeLost) {
    const elapsed = Math.max(0, now - out.lastTs);
    out[out.turn + 'Ms'] = Math.max(0, out[out.turn + 'Ms'] - elapsed);
    out.lastTs = now;
    out.updatedAt = now;
    if (out[out.turn + 'Ms'] <= 0) {
      out[out.turn + 'Ms'] = 0;
      out.running = false;
      out.timeLost = true;
      out.loser = out.turn;
      out.winner = opposite(out.turn);
    }
  }
  return out;
}

function clockPayload(clock, now = Date.now()) {
  const current = advanceClock(clock, now);
  if (!current) return null;
  return {
    wMs: current.wMs,
    bMs: current.bMs,
    active: current.turn,
    turn: current.turn,
    running: current.running,
    timeLost: current.timeLost,
    loser: current.loser,
    winner: current.winner,
    serverNow: now,
    lastTs: current.lastTs
  };
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
    await this.sendRoomState(server, 'hello_state');
    await this.broadcastRoomState('lobby');

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

  async getClockForState(now = Date.now()) {
    let clock = (await this.state.storage.get('clock')) || null;
    if (!clock) return null;
    const advanced = advanceClock(clock, now);
    if (advanced && JSON.stringify(advanced) !== JSON.stringify(clock)) {
      await this.state.storage.put('clock', advanced);
    }
    return advanced;
  }

  async buildStateFor(ws) {
    const info = ws.deserializeAttachment() || {};
    const players = (await this.state.storage.get('players')) || { white: null, black: null };
    const timeControl = (await this.state.storage.get('timeControl')) || null;
    const game = (await this.state.storage.get('game')) || { started: false, startedAt: null };
    const moves = (await this.state.storage.get('moves')) || [];
    const now = Date.now();
    const clock = await this.getClockForState(now);

    return {
      type: 'room_state',
      room: info.room || 'unknown',
      role: info.role || 'spectator',
      playerId: info.playerId || null,
      assigned: {
        white: !!players.white,
        black: !!players.black
      },
      players: this.getActivePlayers(),
      timeControl,
      game,
      moves,
      clock: clockPayload(clock, now),
      serverNow: now
    };
  }

  async sendRoomState(ws, type = 'room_state') {
    const payload = await this.buildStateFor(ws);
    payload.type = type;
    safeSend(ws, payload);
  }

  async broadcastRoomState(type = 'room_state') {
    for (const ws of this.state.getWebSockets()) {
      await this.sendRoomState(ws, type);
    }
  }

  async broadcastMove(move, messageId = null, clock = null) {
    const now = Date.now();
    for (const ws of this.state.getWebSockets()) {
      const info = ws.deserializeAttachment() || {};
      safeSend(ws, {
        type: 'move',
        ok: true,
        messageId,
        room: info.room || 'unknown',
        role: info.role || 'spectator',
        move,
        clock: clockPayload(clock, now),
        serverNow: now
      });
    }
  }

  async webSocketMessage(ws, message) {
    let data = null;
    try {
      data = JSON.parse(message);
    } catch (_) {
      safeSend(ws, { type: 'error', code: 'BAD_JSON', message: 'Nachricht konnte nicht gelesen werden.' });
      return;
    }

    const info = ws.deserializeAttachment() || {};
    const role = info.role || 'spectator';

    if (data.type === 'ping') {
      safeSend(ws, { type: 'pong', ts: Date.now(), serverNow: Date.now() });
      return;
    }

    if (data.type === 'request_state') {
      await this.sendRoomState(ws, 'room_state');
      return;
    }

    if (data.type === 'set_time_control') {
      const game = (await this.state.storage.get('game')) || { started: false };
      if (game.started) {
        safeSend(ws, { type: 'error', code: 'GAME_ALREADY_STARTED', message: 'Bedenkzeit ist nach Partiestart gesperrt.' });
        return;
      }

      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type: 'error', code: 'NOT_A_PLAYER', message: 'Nur Spieler können die Bedenkzeit ändern.' });
        return;
      }

      const timeControl = cleanTimeControl(data.timeControl || data.time_control);
      if (!timeControl) {
        safeSend(ws, { type: 'error', code: 'INVALID_TIME_CONTROL', message: 'Ungültige Bedenkzeit.' });
        return;
      }

      timeControl.updatedByRole = role;
      timeControl.updatedByPlayer = info.playerId || null;
      await this.state.storage.put('timeControl', timeControl);
      await this.state.storage.delete('clock');

      safeSend(ws, {
        type: 'time_control_ack',
        ok: true,
        messageId: data.messageId || null,
        timeControl,
        serverNow: Date.now()
      });
      await this.broadcastRoomState('room_state');
      return;
    }

    if (data.type === 'start_game') {
      if (role !== 'w') {
        safeSend(ws, { type: 'error', code: 'ONLY_WHITE_CAN_START', message: 'Nur Weiß kann die Partie starten.' });
        return;
      }

      const active = this.getActivePlayers();
      if (!active.black.connected) {
        safeSend(ws, { type: 'error', code: 'BLACK_NOT_CONNECTED', message: 'Schwarz ist noch nicht verbunden.' });
        return;
      }

      let timeControl = (await this.state.storage.get('timeControl')) || null;
      const submittedTimeControl = cleanTimeControl(data.timeControl || data.time_control);
      if (submittedTimeControl) {
        submittedTimeControl.updatedByRole = role;
        submittedTimeControl.updatedByPlayer = info.playerId || null;
        await this.state.storage.put('timeControl', submittedTimeControl);
        timeControl = submittedTimeControl;
      }

      if (!timeControl) {
        safeSend(ws, { type: 'error', code: 'TIME_CONTROL_REQUIRED', message: 'Vor dem Start muss eine Bedenkzeit gewählt werden.' });
        return;
      }

      const existingGame = (await this.state.storage.get('game')) || { started: false };
      if (existingGame.started) {
        await this.broadcastRoomState('room_state');
        return;
      }

      const now = Date.now();
      const game = {
        started: true,
        startedAt: new Date(now).toISOString(),
        startedByRole: role,
        startedByPlayer: info.playerId || null
      };
      const clock = makeInitialClock(timeControl, now);
      await this.state.storage.put('game', game);
      await this.state.storage.put('moves', []);
      await this.state.storage.put('clock', clock);

      safeSend(ws, {
        type: 'start_game_ack',
        ok: true,
        game,
        timeControl,
        moves: [],
        clock: clockPayload(clock, now),
        serverNow: now
      });
      await this.broadcastRoomState('room_state');
      return;
    }

    if (data.type === 'move') {
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type: 'error', code: 'NOT_A_PLAYER', message: 'Nur Spieler können Züge senden.' });
        return;
      }

      const game = (await this.state.storage.get('game')) || { started: false };
      if (!game.started) {
        safeSend(ws, { type: 'error', code: 'GAME_NOT_STARTED', message: 'Die Partie wurde noch nicht gestartet.' });
        return;
      }

      const timeControl = (await this.state.storage.get('timeControl')) || null;
      if (!timeControl) {
        safeSend(ws, { type: 'error', code: 'TIME_CONTROL_REQUIRED', message: 'Keine Bedenkzeit im Raum gespeichert.' });
        return;
      }

      const moves = (await this.state.storage.get('moves')) || [];
      const expectedRole = moves.length % 2 === 0 ? 'w' : 'b';
      if (role !== expectedRole) {
        safeSend(ws, {
          type: 'error',
          code: 'NOT_YOUR_TURN',
          message: expectedRole === 'w' ? 'Weiß ist am Zug.' : 'Schwarz ist am Zug.'
        });
        return;
      }

      let clock = (await this.state.storage.get('clock')) || makeInitialClock(timeControl, Date.parse(game.startedAt) || Date.now());
      const now = Date.now();
      clock = advanceClock(clock, now);
      if (!clock || clock.timeLost) {
        await this.state.storage.put('clock', clock);
        safeSend(ws, {
          type: 'error',
          code: 'TIME_LOST',
          message: 'Die Bedenkzeit ist abgelaufen.',
          clock: clockPayload(clock, now),
          serverNow: now
        });
        await this.broadcastRoomState('room_state');
        return;
      }

      if (clock.turn !== role) {
        await this.state.storage.put('clock', clock);
        safeSend(ws, {
          type: 'error',
          code: 'CLOCK_NOT_YOUR_TURN',
          message: clock.turn === 'w' ? 'Laut Serveruhr ist Weiß am Zug.' : 'Laut Serveruhr ist Schwarz am Zug.',
          clock: clockPayload(clock, now),
          serverNow: now
        });
        return;
      }

      const incoming = cleanMove(data.move || data);
      if (!incoming) {
        safeSend(ws, { type: 'error', code: 'INVALID_MOVE', message: 'Ungültiges Zugformat.' });
        return;
      }

      const ply = moves.length + 1;
      if (incoming.clientPly && incoming.clientPly !== ply) {
        safeSend(ws, {
          type: 'error',
          code: 'MOVE_OUT_OF_SYNC',
          message: 'Zugnummer passt nicht zum Raumzustand. Bitte neu verbinden.'
        });
        await this.sendRoomState(ws, 'room_state');
        return;
      }

      const move = {
        ply,
        side: role,
        from: incoming.from,
        to: incoming.to,
        promotion: incoming.promotion,
        san: incoming.san,
        messageId: data.messageId || incoming.clientMessageId || null,
        receivedAt: new Date(now).toISOString(),
        serverNow: now,
        byPlayer: info.playerId || null
      };

      clock[role + 'Ms'] = Math.max(0, clock[role + 'Ms'] + Math.max(0, Number(timeControl.incrementSeconds || 0) * 1000));
      clock.turn = opposite(role);
      clock.running = true;
      clock.lastTs = now;
      clock.updatedAt = now;
      clock.timeLost = false;
      clock.loser = null;
      clock.winner = null;

      moves.push(move);
      await this.state.storage.put('moves', moves);
      await this.state.storage.put('clock', clock);

      safeSend(ws, {
        type: 'move_ack',
        ok: true,
        messageId: data.messageId || incoming.clientMessageId || null,
        move,
        movesCount: moves.length,
        clock: clockPayload(clock, now),
        serverNow: now
      });
      await this.broadcastMove(move, data.messageId || incoming.clientMessageId || null, clock);
      return;
    }

    safeSend(ws, { type: 'error', code: 'UNKNOWN_MESSAGE_TYPE', message: 'Unbekannter Nachrichtentyp: ' + String(data.type || '') });
  }

  async webSocketClose() {
    await this.broadcastRoomState('lobby');
  }

  async webSocketError() {
    await this.broadcastRoomState('lobby');
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
      features: ['lobby', 'roles', 'time_control', 'game_start', 'move_sync', 'server_clock'],
      note: 'Diese Stufe synchronisiert Lobby, Rollen, Bedenkzeit, Partiestart, Züge und eine servergeführte Uhr. Die endgültige serverseitige Legalitätsprüfung folgt später.'
    });
  }
};

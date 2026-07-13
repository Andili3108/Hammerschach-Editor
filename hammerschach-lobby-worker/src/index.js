function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
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

function cleanDisplayName(value) {
  const name = String(value || '')
    .replace(/[<>\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return name;
}

function cleanPreferredRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'w' || role === 'white') return 'w';
  if (role === 'b' || role === 'black') return 'b';
  return '';
}

function guestNameFromPlayerId(playerId) {
  const compact = String(playerId || '').replace(/[^A-Za-z0-9]/g, '');
  const suffix = (compact.slice(-4) || crypto.randomUUID().replace(/[^A-Za-z0-9]/g, '').slice(0, 4)).toUpperCase();
  return 'Gast-' + suffix;
}

const CHAT_MESSAGE_MAX_LENGTH = 300;
const CHAT_HISTORY_MAX = 80;
const CHAT_SEND_COOLDOWN_MS = 1000;

function cleanChatText(value) {
  return String(value || '')
    .replace(/[<>\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MESSAGE_MAX_LENGTH);
}

function fallbackChatName(role, playerId) {
  if (role === 'w') return 'Weiß';
  if (role === 'b') return 'Schwarz';
  if (role === 'spectator') return 'Zuschauer';
  return guestNameFromPlayerId(playerId || '');
}

function normalizeStoredChatMessage(value) {
  if (!value || typeof value !== 'object') return null;
  const text = cleanChatText(value.text || value.message);
  if (!text) return null;
  const id = String(value.id || value.messageId || '').trim().slice(0, 80);
  if (!id) return null;
  const role = value.role === 'w' || value.role === 'b' || value.role === 'spectator' ? value.role : 'spectator';
  const senderName = cleanDisplayName(value.senderName || value.name || value.displayName || '') || fallbackChatName(role, value.senderPlayerId || '');
  const parsedTime = new Date(value.sentAt || value.time || Date.now());
  const sentAt = Number.isNaN(parsedTime.getTime()) ? new Date().toISOString() : parsedTime.toISOString();
  return {
    id,
    messageId: id,
    role,
    senderName,
    name: senderName,
    text,
    sentAt,
    senderConnectionId: String(value.senderConnectionId || '').slice(0, 80),
    senderPlayerId: String(value.senderPlayerId || value.playerId || '').slice(0, 128),
    senderUserId: String(value.senderUserId || value.userId || '').slice(0, 128)
  };
}

function safeChatForClient(value, viewerInfo = {}) {
  const chat = normalizeStoredChatMessage(value);
  if (!chat) return null;
  const sameUser = !!(chat.senderUserId && viewerInfo.userId && chat.senderUserId === String(viewerInfo.userId));
  const samePlayer = !!(chat.senderPlayerId && viewerInfo.playerId && chat.senderPlayerId === String(viewerInfo.playerId));
  const sameConnection = !!(chat.senderConnectionId && viewerInfo.connectionId && chat.senderConnectionId === String(viewerInfo.connectionId));
  return {
    id: chat.id,
    messageId: chat.messageId,
    role: chat.role,
    senderName: chat.senderName,
    name: chat.name,
    text: chat.text,
    sentAt: chat.sentAt,
    mine: sameUser || samePlayer || sameConnection
  };
}


const AUTH_SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 100000;

function cleanUsername(value) {
  const username = String(value || '')
    .replace(/[<>\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 24);
  return /^[A-Za-z0-9_-]{3,24}$/.test(username) ? username : '';
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function isAdminUser(row, env = null) {
  if (!row) return false;
  const configuredAdminId = String((env && env.ADMIN_USER_ID) || '').trim();
  return !!(
    row.is_admin === 1 || row.is_admin === true || String(row.is_admin || '') === '1' ||
    (configuredAdminId && String(row.id || '') === configuredAdminId)
  );
}

function publicUser(row, env = null) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    createdAt: row.created_at || row.createdAt || null,
    isAdmin: isAdminUser(row, env)
  };
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeStringEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  let diff = left.length ^ right.length;
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64UrlToBytes(salt), iterations },
    keyMaterial,
    256
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

async function verifyPassword(password, user) {
  if (!user || user.password_alg !== 'pbkdf2-sha256') return false;
  const iterations = Math.max(1, Math.floor(Number(user.password_iterations || PASSWORD_ITERATIONS)));
  const candidate = await hashPassword(password, user.password_salt, iterations);
  return timingSafeStringEqual(candidate, user.password_hash);
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (_) {
    return null;
  }
}

function bearerTokenFromRequest(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function dbMissingResponse() {
  return json({
    ok: false,
    code: 'DB_NOT_CONFIGURED',
    message: 'Account-Datenbank ist noch nicht konfiguriert. Bitte D1-Binding DB im Worker einrichten.'
  }, { status: 503 });
}

function cleanMemberSearchQuery(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, '')
    .slice(0, 48);
}

function escapeSqlLike(value) {
  return String(value || '').replace(/[\\%_]/g, match => '\\' + match);
}


const USER_PRESENCE_ONLINE_WINDOW_MS = 150000;
let userPresenceTableReady = false;

async function ensureUserPresenceTable(env) {
  if (!env || !env.DB) return false;
  if (userPresenceTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS user_presence (
       user_id TEXT PRIMARY KEY,
       last_seen_at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence (last_seen_at)`).run();
  userPresenceTableReady = true;
  return true;
}

function presenceOnlineSinceIso() {
  return new Date(Date.now() - USER_PRESENCE_ONLINE_WINDOW_MS).toISOString();
}

async function setUserPresence(env, userId, online) {
  if (!(await ensureUserPresenceTable(env)) || !userId) return false;
  if (!online) {
    await env.DB.prepare(`DELETE FROM user_presence WHERE user_id = ?`).bind(String(userId)).run();
    return true;
  }
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_presence (user_id, last_seen_at)
     VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
  ).bind(String(userId), nowIso).run();
  return true;
}

async function searchMembers(env, sessionUser, query) {
  const cleaned = cleanMemberSearchQuery(query);
  if (!env || !env.DB || !sessionUser || cleaned.length < 2) return [];
  await ensureUserPresenceTable(env);

  const escaped = escapeSqlLike(cleaned);
  const contains = '%' + escaped + '%';
  const prefix = escaped + '%';
  const onlineSince = presenceOnlineSinceIso();
  const result = await env.DB.prepare(
    `SELECT users.id, users.username, users.email, users.created_at,
            CASE WHEN presence.last_seen_at >= ? THEN 1 ELSE 0 END AS is_online
       FROM users
       LEFT JOIN user_presence presence ON presence.user_id = users.id
      WHERE users.id <> ?
        AND (users.username_lc LIKE ? ESCAPE '\\' OR users.email_lc LIKE ? ESCAPE '\\')
      ORDER BY
        is_online DESC,
        CASE
          WHEN users.username_lc = ? THEN 0
          WHEN users.username_lc LIKE ? ESCAPE '\\' THEN 1
          ELSE 2
        END,
        users.username_lc ASC
      LIMIT 8`
  ).bind(onlineSince, sessionUser.id, contains, contains, cleaned, prefix).all();

  return (result && result.results ? result.results : []).map(row => ({
    id: row.id,
    username: row.username,
    email: row.email || '',
    createdAt: row.created_at || null,
    isOnline: Number(row.is_online || 0) === 1
  }));
}



async function listMembers(env, sessionUser, limit = 50) {
  if (!env || !env.DB || !sessionUser) return [];
  await ensureUserPresenceTable(env);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit || 50))));
  const onlineSince = presenceOnlineSinceIso();
  const result = await env.DB.prepare(
    `SELECT users.id, users.username, users.email, users.created_at,
            CASE WHEN presence.last_seen_at >= ? THEN 1 ELSE 0 END AS is_online
       FROM users
       LEFT JOIN user_presence presence ON presence.user_id = users.id
      WHERE users.id <> ?
      ORDER BY is_online DESC, users.username_lc ASC
      LIMIT ?`
  ).bind(onlineSince, sessionUser.id, safeLimit).all();

  return (result && result.results ? result.results : []).map(row => ({
    id: row.id,
    username: row.username,
    email: row.email || '',
    createdAt: row.created_at || null,
    isOnline: Number(row.is_online || 0) === 1
  }));
}

let dailyGamesTableReady = false;
async function ensureDailyGamesTable(env) {
  if (!env || !env.DB) return false;
  if (dailyGamesTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS daily_games (
       room_id TEXT PRIMARY KEY,
       white_user_id TEXT,
       black_user_id TEXT,
       white_name TEXT,
       black_name TEXT,
       time_label TEXT,
       days_per_move INTEGER,
       variant TEXT,
       started INTEGER NOT NULL DEFAULT 0,
       started_at TEXT,
       updated_at TEXT,
       turn TEXT,
       deadline_at TEXT,
       ended INTEGER NOT NULL DEFAULT 0,
       ended_at TEXT,
       result TEXT,
       end_reason TEXT
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_games_white ON daily_games (white_user_id, ended, updated_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_games_black ON daily_games (black_user_id, ended, updated_at)`).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS daily_game_archives (
       room_id TEXT NOT NULL,
       user_id TEXT NOT NULL,
       archived_at TEXT NOT NULL,
       PRIMARY KEY (room_id, user_id)
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_daily_game_archives_user ON daily_game_archives (user_id, archived_at)`).run();
  dailyGamesTableReady = true;
  return true;
}

async function listDailyGames(env, sessionUser) {
  if (!(await ensureDailyGamesTable(env)) || !sessionUser) return [];
  await ensureUserPresenceTable(env);
  const onlineSince = presenceOnlineSinceIso();
  const result = await env.DB.prepare(
    `SELECT daily_games.room_id, daily_games.white_user_id, daily_games.black_user_id,
            daily_games.white_name, daily_games.black_name, daily_games.time_label,
            daily_games.days_per_move, daily_games.variant, daily_games.started,
            daily_games.started_at, daily_games.updated_at, daily_games.turn,
            daily_games.deadline_at, daily_games.ended, daily_games.ended_at,
            daily_games.result, daily_games.end_reason,
            CASE WHEN opponent_presence.last_seen_at >= ? THEN 1 ELSE 0 END AS opponent_online
       FROM daily_games
       LEFT JOIN user_presence opponent_presence
         ON opponent_presence.user_id = CASE
              WHEN daily_games.white_user_id = ? THEN daily_games.black_user_id
              ELSE daily_games.white_user_id
            END
      WHERE (daily_games.white_user_id = ? OR daily_games.black_user_id = ?)
        AND NOT EXISTS (
          SELECT 1
            FROM daily_game_archives archived
           WHERE archived.room_id = daily_games.room_id
             AND archived.user_id = ?
        )
      ORDER BY
        daily_games.ended ASC,
        CASE
          WHEN daily_games.ended = 0 AND daily_games.turn = CASE WHEN daily_games.white_user_id = ? THEN 'w' ELSE 'b' END THEN 0
          ELSE 1
        END ASC,
        CASE WHEN daily_games.ended = 0 THEN COALESCE(daily_games.deadline_at, daily_games.updated_at) END ASC,
        CASE WHEN daily_games.ended = 1 THEN COALESCE(daily_games.ended_at, daily_games.updated_at) END DESC
      LIMIT 200`
  ).bind(onlineSince, sessionUser.id, sessionUser.id, sessionUser.id, sessionUser.id, sessionUser.id).all();

  return (result && result.results ? result.results : []).map(row => {
    const role = String(row.white_user_id || '') === String(sessionUser.id) ? 'w' : 'b';
    const turn = row.turn === 'b' ? 'b' : row.turn === 'w' ? 'w' : '';
    const opponentJoined = role === 'w' ? !!row.black_user_id : !!row.white_user_id;
    return {
      roomId: row.room_id,
      role,
      opponentName: role === 'w' ? (row.black_name || 'noch offen') : (row.white_name || 'noch offen'),
      opponentJoined,
      opponentOnline: opponentJoined && !row.ended && Number(row.opponent_online || 0) === 1,
      pendingInvitation: !row.started && !row.ended && !opponentJoined,
      canDeleteInvitation: !row.started && !row.ended && !opponentJoined,
      timeLabel: row.time_label || ((row.days_per_move || 1) + ' Tag(e) pro Zug'),
      daysPerMove: Math.max(1, Number(row.days_per_move || 1)),
      variant: row.variant || 'standard',
      started: !!row.started,
      startedAt: row.started_at || null,
      updatedAt: row.updated_at || null,
      turn,
      isMyTurn: !row.ended && !!row.started && turn === role,
      deadlineAt: row.ended ? null : (row.deadline_at || null),
      ended: !!row.ended,
      endedAt: row.ended_at || null,
      result: row.result || '*',
      endReason: row.end_reason || null
    };
  });
}

async function loadPrivateUser(env, userId) {
  if (!env || !env.DB || !userId) return null;
  return env.DB.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).bind(String(userId)).first();
}

async function pendingAndActiveDailyGamesForUser(env, userId) {
  if (!(await ensureDailyGamesTable(env)) || !userId) return { openInvitations: [], activeGames: [] };
  const result = await env.DB.prepare(
    `SELECT room_id, white_user_id, black_user_id, started, ended
       FROM daily_games
      WHERE ended = 0
        AND (white_user_id = ? OR black_user_id = ?)
      ORDER BY updated_at ASC`
  ).bind(String(userId), String(userId)).all();
  const rows = result && result.results ? result.results : [];
  const openInvitations = [];
  const activeGames = [];
  for (const row of rows) {
    const isWhite = String(row.white_user_id || '') === String(userId);
    const opponentJoined = isWhite ? !!row.black_user_id : !!row.white_user_id;
    if (!row.started && !opponentJoined) openInvitations.push(row);
    else activeGames.push(row);
  }
  return { openInvitations, activeGames };
}

async function cancelOpenDailyInvitationsForUser(env, userId, invitations) {
  const rows = Array.isArray(invitations) ? invitations : [];
  if (rows.length === 0) return { ok: true, cancelled: 0 };
  if (!env || !env.GAME_ROOM) {
    return { ok: false, status: 503, code: 'ROOM_SERVICE_UNAVAILABLE', message: 'Offene Daily-Einladungen konnten nicht sicher zurückgezogen werden.' };
  }

  let cancelled = 0;
  for (const invitation of rows) {
    const roomId = cleanRoomId(invitation && invitation.room_id);
    if (!roomId) continue;
    try {
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);
      const response = await stub.fetch(new Request('https://game-room.internal/cancel-invitation?room=' + encodeURIComponent(roomId), {
        method: 'DELETE',
        headers: { 'x-hammerschach-user-id': String(userId) }
      }));
      let result = null;
      try { result = await response.json(); } catch (_) { result = null; }
      if (!response.ok || !result || !result.ok) {
        return {
          ok: false,
          status: response.status || 409,
          code: result && result.code ? result.code : 'INVITATION_DELETE_FAILED',
          message: result && result.message ? result.message : 'Eine offene Daily-Einladung konnte nicht zurückgezogen werden.'
        };
      }
      try { await env.DB.prepare(`DELETE FROM daily_games WHERE room_id = ?`).bind(roomId).run(); } catch (_) {}
      cancelled += 1;
    } catch (_) {
      return { ok: false, status: 500, code: 'INVITATION_DELETE_FAILED', message: 'Eine offene Daily-Einladung konnte nicht zurückgezogen werden.' };
    }
  }
  return { ok: true, cancelled };
}

async function deleteUserAccount(env, target, options = {}) {
  if (!env || !env.DB || !target) {
    return { ok: false, status: 503, code: 'DB_NOT_CONFIGURED', message: 'Account-Datenbank ist nicht verfügbar.' };
  }
  if (isAdminUser(target, env)) {
    return { ok: false, status: 400, code: 'CANNOT_DELETE_ADMIN', message: 'Der Administrator-Account kann nicht gelöscht werden.' };
  }

  const daily = await pendingAndActiveDailyGamesForUser(env, target.id);
  if (daily.activeGames.length > 0) {
    return {
      ok: false,
      status: 409,
      code: 'ACTIVE_DAILY_GAMES',
      activeDailyGames: daily.activeGames.length,
      message: 'Der Account kann erst gelöscht werden, wenn alle laufenden Daily-Partien beendet sind.'
    };
  }

  const cancellation = await cancelOpenDailyInvitationsForUser(env, target.id, daily.openInvitations);
  if (!cancellation.ok) return cancellation;

  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(target.id).run();
  try { await env.DB.prepare(`DELETE FROM user_presence WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM daily_game_archives WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(target.id).run();
  return { ok: true, deletedUser: publicUser(target, env), cancelledInvitations: cancellation.cancelled || 0 };
}

async function deleteUserAsAdmin(env, adminUser, targetId) {
  if (!env || !env.DB || !adminUser) {
    return { ok: false, status: 503, code: 'DB_NOT_CONFIGURED', message: 'Account-Datenbank ist nicht verfügbar.' };
  }
  if (!isAdminUser(adminUser, env)) {
    return { ok: false, status: 403, code: 'NOT_ADMIN', message: 'Nur Andili kann User löschen.' };
  }
  const id = String(targetId || '').trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id) && !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, status: 400, code: 'INVALID_USER_ID', message: 'Ungültige User-ID.' };
  }
  if (id === adminUser.id) {
    return { ok: false, status: 400, code: 'CANNOT_DELETE_SELF', message: 'Der eigene Admin-Account kann nicht gelöscht werden.' };
  }

  const target = await loadPrivateUser(env, id);
  if (!target) {
    return { ok: false, status: 404, code: 'USER_NOT_FOUND', message: 'User wurde nicht gefunden.' };
  }
  return deleteUserAccount(env, target, { deletedByAdmin: true });
}


async function ensureStatsTable(env) {
  if (!env || !env.DB) return false;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS gamer_stats (
       name TEXT PRIMARY KEY,
       value INTEGER NOT NULL DEFAULT 0,
       updated_at TEXT
     )`
  ).run();
  return true;
}

async function ensureStatRows(env) {
  if (!(await ensureStatsTable(env))) return false;
  const nowIso = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO gamer_stats (name, value, updated_at) VALUES ('page_views', 0, ?)`).bind(nowIso).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO gamer_stats (name, value, updated_at) VALUES ('games_played', 0, ?)`).bind(nowIso).run();
  return true;
}

async function readGamerStats(env) {
  if (!(await ensureStatRows(env))) {
    return { visits: 0, gamesPlayed: 0 };
  }
  const result = await env.DB.prepare(`SELECT name, value FROM gamer_stats WHERE name IN ('page_views', 'games_played')`).all();
  const rows = result && result.results ? result.results : [];
  const values = { page_views: 0, games_played: 0 };
  for (const row of rows) {
    if (row && (row.name === 'page_views' || row.name === 'games_played')) values[row.name] = Math.max(0, Number(row.value || 0));
  }
  return { visits: values.page_views, pageViews: values.page_views, gamesPlayed: values.games_played };
}

async function incrementGamerStat(env, name) {
  const key = name === 'games_played' ? 'games_played' : name === 'page_views' ? 'page_views' : '';
  if (!key || !(await ensureStatRows(env))) return false;
  const nowIso = new Date().toISOString();
  await env.DB.prepare(`UPDATE gamer_stats SET value = value + 1, updated_at = ? WHERE name = ?`).bind(nowIso, key).run();
  return true;
}

async function createSession(env, userId) {
  const token = randomBase64Url(32);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000);
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), userId, tokenHash, now.toISOString(), expires.toISOString()).run();
  return token;
}

async function lookupAuthSession(env, token) {
  if (!env || !env.DB || !token) return null;
  const tokenHash = await sha256Hex(token);
  const nowIso = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
      LIMIT 1`
  ).bind(tokenHash, nowIso).first();
  if (!row) return null;
  if (row.disabled === 1 || row.disabled === true || row.deleted_at) return null;
  return { sessionId: row.session_id, user: publicUser(row, env) };
}

async function handleAuthApi(request, env, url) {
  if (!env || !env.DB) return dbMissingResponse();

  if (url.pathname === '/api/stats' && request.method === 'GET') {
    const stats = await readGamerStats(env);
    return json({ ok: true, stats });
  }

  if (url.pathname === '/api/stats/visit' && request.method === 'POST') {
    await incrementGamerStat(env, 'page_views');
    const stats = await readGamerStats(env);
    return json({ ok: true, stats });
  }

  if (url.pathname === '/api/me' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Nicht angemeldet.' }, { status: 401 });
    return json({ ok: true, user: session.user });
  }

  if (url.pathname === '/api/account/username' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Bitte zuerst einloggen.' }, { status: 401 });
    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, code: 'BAD_JSON', message: 'Die Änderungen konnten nicht gelesen werden.' }, { status: 400 });
    const user = await loadPrivateUser(env, session.user.id);
    if (!user) return json({ ok: false, code: 'USER_NOT_FOUND', message: 'Account wurde nicht gefunden.' }, { status: 404 });
    if (isAdminUser(user, env)) return json({ ok: false, code: 'ADMIN_USERNAME_LOCKED', message: 'Der Benutzername des Administrator-Accounts kann nicht geändert werden.' }, { status: 403 });
    if (!(await verifyPassword(String(body.currentPassword || ''), user))) {
      return json({ ok: false, code: 'INVALID_PASSWORD', message: 'Das aktuelle Kennwort ist nicht korrekt.' }, { status: 401 });
    }
    const username = cleanUsername(body.username);
    if (!username) return json({ ok: false, code: 'INVALID_USERNAME', message: 'Benutzername: 3 bis 24 Zeichen, erlaubt sind Buchstaben, Zahlen, _ und -.' }, { status: 400 });
    const usernameLc = username.toLowerCase();
    const existing = await env.DB.prepare(`SELECT id FROM users WHERE username_lc = ? AND id <> ? LIMIT 1`).bind(usernameLc, user.id).first();
    if (existing) return json({ ok: false, code: 'USERNAME_TAKEN', message: 'Dieser Benutzername ist bereits vergeben.' }, { status: 409 });
    await env.DB.prepare(`UPDATE users SET username = ?, username_lc = ? WHERE id = ?`).bind(username, usernameLc, user.id).run();
    user.username = username;
    user.username_lc = usernameLc;
    return json({ ok: true, user: publicUser(user, env), message: 'Benutzername wurde geändert.' });
  }

  if (url.pathname === '/api/account/email' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Bitte zuerst einloggen.' }, { status: 401 });
    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, code: 'BAD_JSON', message: 'Die Änderungen konnten nicht gelesen werden.' }, { status: 400 });
    const user = await loadPrivateUser(env, session.user.id);
    if (!user) return json({ ok: false, code: 'USER_NOT_FOUND', message: 'Account wurde nicht gefunden.' }, { status: 404 });
    if (!(await verifyPassword(String(body.currentPassword || ''), user))) {
      return json({ ok: false, code: 'INVALID_PASSWORD', message: 'Das aktuelle Kennwort ist nicht korrekt.' }, { status: 401 });
    }
    const email = normalizeEmail(body.email);
    if (!email) return json({ ok: false, code: 'INVALID_EMAIL', message: 'Bitte eine gültige Mailadresse eingeben.' }, { status: 400 });
    const existing = await env.DB.prepare(`SELECT id FROM users WHERE email_lc = ? AND id <> ? LIMIT 1`).bind(email, user.id).first();
    if (existing) return json({ ok: false, code: 'EMAIL_TAKEN', message: 'Diese Mailadresse ist bereits registriert.' }, { status: 409 });
    await env.DB.prepare(`UPDATE users SET email = ?, email_lc = ? WHERE id = ?`).bind(email, email, user.id).run();
    user.email = email;
    user.email_lc = email;
    return json({ ok: true, user: publicUser(user, env), message: 'Mailadresse wurde geändert.' });
  }

  if (url.pathname === '/api/account/password' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Bitte zuerst einloggen.' }, { status: 401 });
    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, code: 'BAD_JSON', message: 'Die Änderungen konnten nicht gelesen werden.' }, { status: 400 });
    const user = await loadPrivateUser(env, session.user.id);
    if (!user) return json({ ok: false, code: 'USER_NOT_FOUND', message: 'Account wurde nicht gefunden.' }, { status: 404 });
    if (!(await verifyPassword(String(body.currentPassword || ''), user))) {
      return json({ ok: false, code: 'INVALID_PASSWORD', message: 'Das aktuelle Kennwort ist nicht korrekt.' }, { status: 401 });
    }
    const newPassword = String(body.newPassword || '');
    if (newPassword.length < 8) return json({ ok: false, code: 'WEAK_PASSWORD', message: 'Das neue Kennwort muss mindestens 8 Zeichen haben.' }, { status: 400 });
    const salt = randomBase64Url(16);
    const passwordHash = await hashPassword(newPassword, salt, PASSWORD_ITERATIONS);
    await env.DB.prepare(
      `UPDATE users
          SET password_alg = ?, password_hash = ?, password_salt = ?, password_iterations = ?
        WHERE id = ?`
    ).bind('pbkdf2-sha256', passwordHash, salt, PASSWORD_ITERATIONS, user.id).run();
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND id <> ?`).bind(user.id, session.sessionId).run();
    return json({ ok: true, user: publicUser(user, env), message: 'Kennwort wurde geändert. Andere Anmeldungen wurden beendet.' });
  }

  if (url.pathname === '/api/account' && request.method === 'DELETE') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Bitte zuerst einloggen.' }, { status: 401 });
    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, code: 'BAD_JSON', message: 'Die Löschbestätigung konnte nicht gelesen werden.' }, { status: 400 });
    const user = await loadPrivateUser(env, session.user.id);
    if (!user) return json({ ok: false, code: 'USER_NOT_FOUND', message: 'Account wurde nicht gefunden.' }, { status: 404 });
    if (isAdminUser(user, env)) return json({ ok: false, code: 'CANNOT_DELETE_ADMIN', message: 'Der Administrator-Account kann nicht selbst gelöscht werden.' }, { status: 403 });
    if (!(await verifyPassword(String(body.currentPassword || ''), user))) {
      return json({ ok: false, code: 'INVALID_PASSWORD', message: 'Das aktuelle Kennwort ist nicht korrekt.' }, { status: 401 });
    }
    if (String(body.confirmation || '').trim().toUpperCase() !== 'LÖSCHEN') {
      return json({ ok: false, code: 'DELETE_CONFIRMATION_REQUIRED', message: 'Bitte zur Bestätigung LÖSCHEN eingeben.' }, { status: 400 });
    }
    const result = await deleteUserAccount(env, user);
    if (!result.ok) return json({ ok: false, code: result.code, message: result.message, activeDailyGames: result.activeDailyGames || 0 }, { status: result.status || 400 });
    return json({ ok: true, deletedUser: result.deletedUser, cancelledInvitations: result.cancelledInvitations || 0 });
  }


  if (url.pathname === '/api/presence' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Nicht angemeldet.' }, { status: 401 });
    const body = await readJsonBody(request);
    const online = !(body && body.online === false);
    try {
      await setUserPresence(env, session.user.id, online);
      return json({ ok: true, online, onlineWindowSeconds: Math.floor(USER_PRESENCE_ONLINE_WINDOW_MS / 1000) });
    } catch (_) {
      return json({ ok: false, code: 'PRESENCE_UNAVAILABLE', message: 'Online-Status konnte nicht aktualisiert werden.' }, { status: 500 });
    }
  }

  if (url.pathname === '/api/daily-games' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Daily-Partien sind nur nach Login verfügbar.' }, { status: 401 });
    try {
      const games = await listDailyGames(env, session.user);
      return json({ ok: true, games, serverNow: Date.now() });
    } catch (_) {
      return json({ ok: false, code: 'DAILY_GAMES_UNAVAILABLE', message: 'Daily-Partien konnten nicht aus der Datenbank geladen werden.' }, { status: 500 });
    }
  }

  const dailyHistoryDeleteMatch = url.pathname.match(/^\/api\/daily-games\/([^/]+)\/history$/);
  if (dailyHistoryDeleteMatch && request.method === 'DELETE') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Bitte zuerst einloggen.' }, { status: 401 });
    const roomId = cleanRoomId(decodeURIComponent(dailyHistoryDeleteMatch[1]));
    if (!roomId) return json({ ok: false, code: 'INVALID_ROOM', message: 'Ungültiger Spielraum.' }, { status: 400 });
    try {
      if (!(await ensureDailyGamesTable(env))) throw new Error('D1 unavailable');
      const indexedGame = await env.DB.prepare(
        `SELECT room_id, ended
           FROM daily_games
          WHERE room_id = ?
            AND (white_user_id = ? OR black_user_id = ?)
          LIMIT 1`
      ).bind(roomId, session.user.id, session.user.id).first();
      if (!indexedGame) return json({ ok: false, code: 'GAME_NOT_FOUND', message: 'Diese Daily-Partie gehört nicht zu deinem Account.' }, { status: 404 });
      if (!indexedGame.ended) return json({ ok: false, code: 'GAME_NOT_ENDED', message: 'Nur beendete Partien können aus dem Verlauf entfernt werden.' }, { status: 409 });
      const archivedAt = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO daily_game_archives (room_id, user_id, archived_at)
         VALUES (?, ?, ?)
         ON CONFLICT(room_id, user_id) DO UPDATE SET archived_at = excluded.archived_at`
      ).bind(roomId, session.user.id, archivedAt).run();
      return json({ ok:true, roomId, archivedAt });
    } catch (_) {
      return json({ ok:false, code:'HISTORY_REMOVE_FAILED', message:'Die Partie konnte nicht aus deinem Verlauf entfernt werden.' }, { status:500 });
    }
  }

  const dailyPgnMatch = url.pathname.match(/^\/api\/daily-games\/([^/]+)\/pgn$/);
  if (dailyPgnMatch && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Bitte zuerst einloggen.' }, { status: 401 });
    const roomId = cleanRoomId(decodeURIComponent(dailyPgnMatch[1]));
    if (!roomId) return json({ ok: false, code: 'INVALID_ROOM', message: 'Ungültiger Spielraum.' }, { status: 400 });
    if (!env.GAME_ROOM) return json({ ok: false, code: 'ROOM_SERVICE_UNAVAILABLE', message: 'Der Spielraum-Dienst ist nicht verfügbar.' }, { status: 503 });

    try {
      if (!(await ensureDailyGamesTable(env))) throw new Error('D1 unavailable');
      const indexedGame = await env.DB.prepare(
        `SELECT room_id, white_user_id, black_user_id, ended
           FROM daily_games
          WHERE room_id = ?
            AND (white_user_id = ? OR black_user_id = ?)
          LIMIT 1`
      ).bind(roomId, session.user.id, session.user.id).first();
      if (!indexedGame) return json({ ok: false, code: 'GAME_NOT_FOUND', message: 'Diese Daily-Partie gehört nicht zu deinem Account.' }, { status: 404 });
      if (!indexedGame.ended) return json({ ok: false, code: 'GAME_NOT_ENDED', message: 'Die PGN-Datei steht nach Partieende bereit.' }, { status: 409 });

      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);
      const response = await stub.fetch(new Request('https://game-room.internal/daily-pgn?room=' + encodeURIComponent(roomId), {
        method: 'GET',
        headers: { 'x-hammerschach-user-id': String(session.user.id || '') }
      }));
      if (!response.ok) {
        let message = 'PGN-Datei konnte nicht erstellt werden.';
        try {
          const detail = await response.json();
          if (detail && detail.message) message = detail.message;
        } catch (_) {}
        return json({ ok: false, code: 'PGN_UNAVAILABLE', message }, { status: response.status || 500 });
      }
      const pgn = await response.text();
      const filename = response.headers.get('content-disposition') || ('attachment; filename="Hammerschach-' + safePgnFilePart(roomId) + '.pgn"');
      return new Response(pgn, {
        status: 200,
        headers: {
          'content-type': 'application/x-chess-pgn; charset=utf-8',
          'content-disposition': filename,
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-disposition'
        }
      });
    } catch (_) {
      return json({ ok: false, code: 'PGN_UNAVAILABLE', message: 'PGN-Datei konnte nicht erstellt werden.' }, { status: 500 });
    }
  }

  const dailyDeleteMatch = url.pathname.match(/^\/api\/daily-games\/([^/]+)$/);
  if (dailyDeleteMatch && request.method === 'DELETE') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Bitte zuerst einloggen.' }, { status: 401 });
    const roomId = cleanRoomId(decodeURIComponent(dailyDeleteMatch[1]));
    if (!roomId) return json({ ok: false, code: 'INVALID_ROOM', message: 'Ungültiger Spielraum.' }, { status: 400 });
    if (!env.GAME_ROOM) return json({ ok: false, code: 'ROOM_SERVICE_UNAVAILABLE', message: 'Der Spielraum-Dienst ist nicht verfügbar.' }, { status: 503 });

    try {
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);
      const response = await stub.fetch(new Request('https://game-room.internal/cancel-invitation?room=' + encodeURIComponent(roomId), {
        method: 'DELETE',
        headers: { 'x-hammerschach-user-id': String(session.user.id || '') }
      }));
      let result = null;
      try { result = await response.json(); } catch (_) { result = null; }
      if (!response.ok || !result || !result.ok) {
        return json({
          ok: false,
          code: result && result.code ? result.code : 'INVITATION_DELETE_FAILED',
          message: result && result.message ? result.message : 'Die Einladung konnte nicht gelöscht werden.'
        }, { status: response.status || 400 });
      }
      try { await env.DB.prepare(`DELETE FROM daily_games WHERE room_id = ?`).bind(roomId).run(); } catch (_) {}
      return json({ ok: true, roomId, cancelledAt: result.cancelledAt || new Date().toISOString() });
    } catch (_) {
      return json({ ok: false, code: 'INVITATION_DELETE_FAILED', message: 'Die Einladung konnte nicht gelöscht werden.' }, { status: 500 });
    }
  }

  if (url.pathname === '/api/register' && request.method === 'POST') {
    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, code: 'BAD_JSON', message: 'Registrierungsdaten konnten nicht gelesen werden.' }, { status: 400 });

    const username = cleanUsername(body.username);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    if (!username) return json({ ok: false, code: 'INVALID_USERNAME', message: 'Benutzername: 3 bis 24 Zeichen, erlaubt sind Buchstaben, Zahlen, _ und -.' }, { status: 400 });
    if (!email) return json({ ok: false, code: 'INVALID_EMAIL', message: 'Bitte eine gültige Mailadresse eingeben.' }, { status: 400 });
    if (password.length < 8) return json({ ok: false, code: 'WEAK_PASSWORD', message: 'Das Kennwort muss mindestens 8 Zeichen haben.' }, { status: 400 });

    const usernameLc = username.toLowerCase();
    const existing = await env.DB.prepare(
      `SELECT id, username_lc, email_lc FROM users WHERE username_lc = ? OR email_lc = ? LIMIT 1`
    ).bind(usernameLc, email).first();
    if (existing && existing.username_lc === usernameLc) return json({ ok: false, code: 'USERNAME_TAKEN', message: 'Dieser Benutzername ist bereits vergeben.' }, { status: 409 });
    if (existing && existing.email_lc === email) return json({ ok: false, code: 'EMAIL_TAKEN', message: 'Diese Mailadresse ist bereits registriert.' }, { status: 409 });

    const id = crypto.randomUUID();
    const salt = randomBase64Url(16);
    const passwordHash = await hashPassword(password, salt, PASSWORD_ITERATIONS);
    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO users (id, username, username_lc, email, email_lc, password_alg, password_hash, password_salt, password_iterations, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, username, usernameLc, email, email, 'pbkdf2-sha256', passwordHash, salt, PASSWORD_ITERATIONS, nowIso).run();

    const token = await createSession(env, id);
    return json({ ok: true, sessionToken: token, user: publicUser({ id, username, email, created_at: nowIso }, env) });
  }

  if (url.pathname === '/api/login' && request.method === 'POST') {
    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, code: 'BAD_JSON', message: 'Login-Daten konnten nicht gelesen werden.' }, { status: 400 });

    const identifier = String(body.identifier || '').trim();
    const password = String(body.password || '');
    const email = normalizeEmail(identifier);
    const usernameLc = identifier.toLowerCase();
    if (!identifier || !password) return json({ ok: false, code: 'MISSING_LOGIN', message: 'Bitte Benutzername/Mailadresse und Kennwort eingeben.' }, { status: 400 });

    const user = await env.DB.prepare(
      email
        ? `SELECT * FROM users WHERE email_lc = ? LIMIT 1`
        : `SELECT * FROM users WHERE username_lc = ? LIMIT 1`
    ).bind(email || usernameLc).first();

    const valid = await verifyPassword(password, user);
    if (!valid) return json({ ok: false, code: 'INVALID_LOGIN', message: 'Login fehlgeschlagen. Bitte Daten prüfen.' }, { status: 401 });
    if (user && (user.disabled === 1 || user.disabled === true || user.deleted_at)) {
      return json({ ok: false, code: 'ACCOUNT_DISABLED', message: 'Dieser Account ist deaktiviert.' }, { status: 403 });
    }

    const token = await createSession(env, user.id);
    return json({ ok: true, sessionToken: token, user: publicUser(user, env) });
  }

  if (url.pathname === '/api/members/search' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Mitgliedersuche ist nur nach Login verfügbar.' }, { status: 401 });

    const query = cleanMemberSearchQuery(url.searchParams.get('q') || url.searchParams.get('query') || '');
    const users = await searchMembers(env, session.user, query);
    return json({ ok: true, query, users, isAdmin: isAdminUser(session.user, env) });
  }

  if (url.pathname === '/api/members/list' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Mitgliederliste ist nur nach Login verfügbar.' }, { status: 401 });

    const limit = url.searchParams.get('limit') || 50;
    const users = await listMembers(env, session.user, limit);
    return json({ ok: true, users, isAdmin: isAdminUser(session.user, env) });
  }

  const adminDeleteMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (adminDeleteMatch && request.method === 'DELETE') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Bitte als Andili einloggen.' }, { status: 401 });
    const result = await deleteUserAsAdmin(env, session.user, decodeURIComponent(adminDeleteMatch[1]));
    if (!result.ok) return json({ ok: false, code: result.code, message: result.message }, { status: result.status || 400 });
    return json({ ok: true, deletedUser: result.deletedUser });
  }

  if (url.pathname === '/api/logout' && request.method === 'POST') {
    const token = bearerTokenFromRequest(request);
    if (token) {
      const tokenHash = await sha256Hex(token);
      await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
    }
    return json({ ok: true });
  }

  return json({ ok: false, code: 'NOT_FOUND', message: 'Account-Endpunkt nicht gefunden.' }, { status: 404 });
}

function playerIdFromSlot(slot) {
  if (!slot) return null;
  if (typeof slot === 'string') return slot;
  if (typeof slot === 'object') return slot.playerId || slot.id || null;
  return null;
}

function normalizeSeatSlot(slot) {
  if (!slot || typeof slot !== 'object') return null;
  const playerId = String(slot.playerId || slot.id || '').trim();
  const seatTokenHash = String(slot.seatTokenHash || slot.seat_token_hash || '').trim();
  if (!playerId || !seatTokenHash) return null;
  return {
    playerId,
    seatTokenHash,
    userId: slot.userId || slot.user_id || null,
    assignedAt: Number(slot.assignedAt || slot.assigned_at || Date.now()),
    updatedAt: Number(slot.updatedAt || slot.updated_at || Date.now())
  };
}

function safeSetupForClient(value) {
  const setup = cleanGameSetup(value || null);
  if (value && (value.updatedByRole === 'w' || value.updatedByRole === 'b')) setup.updatedByRole = value.updatedByRole;
  return setup;
}

function safeTimeControlForClient(value) {
  const control = cleanTimeControl(value || null);
  if (!control) return null;
  if (value && (value.updatedByRole === 'w' || value.updatedByRole === 'b')) control.updatedByRole = value.updatedByRole;
  return control;
}

function safeGameForClient(value) {
  if (!value || typeof value !== 'object') return value || null;
  const out = Object.assign({}, value);
  delete out.startedByPlayer;
  delete out.updatedByPlayer;
  if (out.gameSetup) out.gameSetup = safeSetupForClient(out.gameSetup);
  return out;
}

function safeMoveForClient(value) {
  if (!value || typeof value !== 'object') return value || null;
  const out = Object.assign({}, value);
  delete out.byPlayer;
  delete out.playerId;
  delete out.userId;
  return out;
}

function safeDrawOfferForClient(value) {
  if (!value || typeof value !== 'object' || !value.byRole) return null;
  return {
    offered: value.offered !== false,
    byRole: value.byRole,
    offeredAt: value.offeredAt || null,
    serverNow: value.serverNow || null
  };
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

  const category = String(value.category || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  const requestedMode = String(value.mode || value.clockMode || value.clock_mode || '').trim().toLowerCase();
  const mode = requestedMode === 'daily' || category === 'daily' ? 'daily' : 'live';
  if (mode === 'daily' && ![86400, 259200, 604800].includes(baseSeconds)) return null;

  return {
    key,
    category,
    label: String(value.label || key).slice(0, 120),
    mode,
    daysPerMove: mode === 'daily' ? Math.max(1, Math.round(baseSeconds / 86400)) : 0,
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
    deadlineAt: current.running && !current.timeLost ? now + Math.max(0, current[current.turn + 'Ms']) : null,
    serverNow: now,
    lastTs: current.lastTs
  };
}


const files = ['a','b','c','d','e','f','g','h'];

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function coordToAlg(x, y) {
  return files[x] + (8 - y);
}

function pieceColor(ch) {
  if (!ch || ch === '.') return null;
  return ch === ch.toUpperCase() ? 'w' : 'b';
}

const GAME_VARIANT_STANDARD = 'standard';
const GAME_VARIANT_FREESTYLE = 'freestyle960';
const STANDARD_BACK_RANK = 'RNBQKBNR';
let chess960BackRankCache = null;
let chess960BackRankIdCache = null;

function isValidChess960BackRank(rank) {
  rank = String(rank || '').toUpperCase();
  if (!/^[RNBQKBNR]{8}$/.test(rank)) return false;
  const counts = { R:0, N:0, B:0, Q:0, K:0 };
  for (const ch of rank) counts[ch] = (counts[ch] || 0) + 1;
  if (counts.R !== 2 || counts.N !== 2 || counts.B !== 2 || counts.Q !== 1 || counts.K !== 1) return false;
  const kingFile = rank.indexOf('K');
  const rookFiles = [];
  const bishopFiles = [];
  for (let i = 0; i < 8; i++) {
    if (rank[i] === 'R') rookFiles.push(i);
    if (rank[i] === 'B') bishopFiles.push(i);
  }
  return rookFiles[0] < kingFile && kingFile < rookFiles[1] && bishopFiles.length === 2 && (bishopFiles[0] % 2) !== (bishopFiles[1] % 2);
}

function buildChess960BackRankFromScharnaglId(positionId) {
  let n = Math.max(0, Math.min(959, Math.floor(Number(positionId || 0))));
  const lightBishopIndex = n % 4;
  n = Math.floor(n / 4);
  const darkBishopIndex = n % 4;
  n = Math.floor(n / 4);
  const queenIndex = n % 6;
  n = Math.floor(n / 6);

  const knightPairs = [[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]];
  const knightPair = knightPairs[n] || knightPairs[0];
  const rank = Array(8).fill('');

  rank[lightBishopIndex * 2 + 1] = 'B';
  rank[darkBishopIndex * 2] = 'B';

  let freeFiles = rank.map((piece, file) => piece ? -1 : file).filter(file => file >= 0);
  rank[freeFiles[queenIndex]] = 'Q';

  freeFiles = rank.map((piece, file) => piece ? -1 : file).filter(file => file >= 0);
  rank[freeFiles[knightPair[0]]] = 'N';
  rank[freeFiles[knightPair[1]]] = 'N';

  freeFiles = rank.map((piece, file) => piece ? -1 : file).filter(file => file >= 0);
  rank[freeFiles[0]] = 'R';
  rank[freeFiles[1]] = 'K';
  rank[freeFiles[2]] = 'R';
  return rank.join('');
}

function generateChess960BackRanks() {
  if (chess960BackRankCache) return chess960BackRankCache;
  chess960BackRankCache = Array.from({ length:960 }, (_, positionId) => buildChess960BackRankFromScharnaglId(positionId));
  chess960BackRankIdCache = new Map(chess960BackRankCache.map((rank, positionId) => [rank, positionId]));
  return chess960BackRankCache;
}

function chess960BackRankById(positionId) {
  const list = generateChess960BackRanks();
  const id = Math.max(0, Math.min(959, Math.floor(Number(positionId || 0))));
  return list[id] || STANDARD_BACK_RANK;
}

function chess960IdByBackRank(backRank) {
  const rank = String(backRank || '').toUpperCase();
  if (!isValidChess960BackRank(rank)) return null;
  generateChess960BackRanks();
  return chess960BackRankIdCache.has(rank) ? chess960BackRankIdCache.get(rank) : null;
}

function cleanGameSetup(setup) {
  setup = setup || {};
  const variant = String(setup.variant || setup.mode || '').toLowerCase() === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD;
  if (variant !== GAME_VARIANT_FREESTYLE) return { variant: GAME_VARIANT_STANDARD, positionId: null, backRank: STANDARD_BACK_RANK };
  let positionId = Number.isFinite(Number(setup.positionId ?? setup.position_id)) ? Math.floor(Number(setup.positionId ?? setup.position_id)) : null;
  if (positionId !== null) positionId = Math.max(0, Math.min(959, positionId));
  let backRank = String(setup.backRank || setup.back_rank || '').toUpperCase();

  // Eine gültige Grundreihe ist maßgeblich und wird nach Scharnagl 0–959 nummeriert.
  // Dadurch werden auch ältere Räume mit der früheren alphabetischen Nummerierung migriert.
  if (isValidChess960BackRank(backRank)) {
    positionId = chess960IdByBackRank(backRank);
  } else {
    positionId = positionId !== null ? positionId : 0;
    backRank = chess960BackRankById(positionId);
  }
  return { variant: GAME_VARIANT_FREESTYLE, positionId, backRank };
}

function blackBackRankFromWhite(backRank) {
  return String(backRank || STANDARD_BACK_RANK).toLowerCase();
}

function castlingInfoFromBackRank(backRank) {
  backRank = isValidChess960BackRank(backRank) ? backRank : STANDARD_BACK_RANK;
  const kingFile = backRank.indexOf('K');
  const rooks = [];
  for (let i = 0; i < 8; i++) if (backRank[i] === 'R') rooks.push(i);
  const qRook = rooks.filter(x => x < kingFile).pop();
  const kRook = rooks.find(x => x > kingFile);
  return {
    w:{ kingFile, rank:7, kingside:{ key:'K', rookFile:kRook, kingTo:6, rookTo:5 }, queenside:{ key:'Q', rookFile:qRook, kingTo:2, rookTo:3 } },
    b:{ kingFile, rank:0, kingside:{ key:'k', rookFile:kRook, kingTo:6, rookTo:5 }, queenside:{ key:'q', rookFile:qRook, kingTo:2, rookTo:3 } }
  };
}

function rangeBetweenInclusive(a, b) {
  const out = [];
  const step = a <= b ? 1 : -1;
  for (let x = a;; x += step) {
    out.push(x);
    if (x === b) break;
  }
  return out;
}

function rangeBetweenExclusive(a, b) {
  if (a === b) return [];
  const out = [];
  const step = a < b ? 1 : -1;
  for (let x = a + step; x !== b; x += step) out.push(x);
  return out;
}

function ChessGame(setup) {
  this.reset(setup);
}

ChessGame.prototype.reset = function(setup) {
  this.setup = cleanGameSetup(setup);
  const backRank = this.setup.backRank || STANDARD_BACK_RANK;
  this.variant = this.setup.variant;
  this.startBackRank = backRank;
  this.castleInfo = castlingInfoFromBackRank(backRank);
  this.board = [
    blackBackRankFromWhite(backRank).split(''),
    ['p','p','p','p','p','p','p','p'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['P','P','P','P','P','P','P','P'],
    backRank.split('')
  ];
  this.turn = 'w';
  this.ep = null;
  this.castling = { K:true, Q:true, k:true, q:true };
  this.halfmove = 0;
  this.fullmove = 1;
};

ChessGame.prototype.clone = function() {
  const g = new ChessGame(this.setup);
  g.setup = cleanGameSetup(this.setup);
  g.variant = this.variant;
  g.startBackRank = this.startBackRank;
  g.castleInfo = clone(this.castleInfo);
  g.board = clone(this.board);
  g.turn = this.turn;
  g.ep = this.ep ? [this.ep[0], this.ep[1]] : null;
  g.castling = Object.assign({}, this.castling);
  g.halfmove = this.halfmove;
  g.fullmove = this.fullmove;
  return g;
};

ChessGame.prototype.inBounds = function(x, y) { return x >= 0 && x < 8 && y >= 0 && y < 8; };
ChessGame.prototype.at = function(x, y) { return this.board[y][x]; };
ChessGame.prototype.set = function(x, y, v) { this.board[y][x] = v; };
ChessGame.prototype.findKing = function(color) {
  const king = color === 'w' ? 'K' : 'k';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (this.board[y][x] === king) return [x, y];
    }
  }
  return null;
};

ChessGame.prototype.isAttacked = function(tx, ty, byColor) {
  const dir = byColor === 'w' ? -1 : 1;
  const pawn = byColor === 'w' ? 'P' : 'p';
  for (const dx of [-1, 1]) {
    const x = tx + dx;
    const y = ty - dir;
    if (this.inBounds(x, y) && this.at(x, y) === pawn) return true;
  }

  const knight = byColor === 'w' ? 'N' : 'n';
  for (const [dx, dy] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) {
    const x = tx + dx;
    const y = ty + dy;
    if (this.inBounds(x, y) && this.at(x, y) === knight) return true;
  }

  const bishop = byColor === 'w' ? 'B' : 'b';
  const rook = byColor === 'w' ? 'R' : 'r';
  const queen = byColor === 'w' ? 'Q' : 'q';
  const king = byColor === 'w' ? 'K' : 'k';

  for (const [dx, dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    let x = tx + dx;
    let y = ty + dy;
    while (this.inBounds(x, y)) {
      const p = this.at(x, y);
      if (p !== '.') {
        if (p === bishop || p === queen) return true;
        break;
      }
      x += dx;
      y += dy;
    }
  }

  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    let x = tx + dx;
    let y = ty + dy;
    while (this.inBounds(x, y)) {
      const p = this.at(x, y);
      if (p !== '.') {
        if (p === rook || p === queen) return true;
        break;
      }
      x += dx;
      y += dy;
    }
  }

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = tx + dx;
      const y = ty + dy;
      if (this.inBounds(x, y) && this.at(x, y) === king) return true;
    }
  }

  return false;
};

ChessGame.prototype.inCheck = function(color) {
  const kp = this.findKing(color);
  return !!(kp && this.isAttacked(kp[0], kp[1], opposite(color)));
};

ChessGame.prototype.castleMove = function(color, side) {
  const colorInfo = this.castleInfo && this.castleInfo[color];
  if (!colorInfo) return null;
  const info = colorInfo[side];
  if (!info) return null;
  const key = info.key;
  const rank = color === 'w' ? 7 : 0;
  const king = color === 'w' ? 'K' : 'k';
  const rook = color === 'w' ? 'R' : 'r';
  const kingFrom = colorInfo.kingFile;
  const rookFrom = info.rookFile;
  const kingTo = info.kingTo;
  const rookTo = info.rookTo;
  if (!this.castling[key]) return null;
  if (!Number.isInteger(kingFrom) || !Number.isInteger(rookFrom)) return null;
  if (this.at(kingFrom, rank) !== king || this.at(rookFrom, rank) !== rook) return null;

  for (const xx of rangeBetweenExclusive(kingFrom, rookFrom)) {
    if (this.at(xx, rank) !== '.') return null;
  }
  const mayOccupy = xx => xx === kingFrom || xx === rookFrom || this.at(xx, rank) === '.';
  for (const xx of rangeBetweenInclusive(kingFrom, kingTo)) {
    if (!mayOccupy(xx)) return null;
  }
  for (const xx of rangeBetweenInclusive(rookFrom, rookTo)) {
    if (!mayOccupy(xx)) return null;
  }

  const displayTo = kingTo === kingFrom ? rookFrom : kingTo;
  return { from:[kingFrom,rank], to:[displayTo,rank], meta:{ castle:key, kingFrom, kingTo, rookFrom, rookTo } };
};

ChessGame.prototype.pseudoLegalMovesFrom = function(x, y) {
  const moves = [];
  const p = this.at(x, y);
  if (!p || p === '.') return moves;
  const color = pieceColor(p);
  const piece = p.toLowerCase();
  const dir = color === 'w' ? -1 : 1;

  if (piece === 'p') {
    const ny = y + dir;
    if (this.inBounds(x, ny) && this.at(x, ny) === '.') {
      moves.push({ from:[x,y], to:[x,ny], meta:{} });
      const start = color === 'w' ? 6 : 1;
      const ny2 = y + 2 * dir;
      if (y === start && this.inBounds(x, ny2) && this.at(x, ny2) === '.') {
        moves.push({ from:[x,y], to:[x,ny2], meta:{ ep:[x,ny] } });
      }
    }
    for (const dx of [-1, 1]) {
      const nx = x + dx;
      const nyc = y + dir;
      if (this.inBounds(nx, nyc)) {
        const t = this.at(nx, nyc);
        if (t !== '.' && pieceColor(t) !== color) moves.push({ from:[x,y], to:[nx,nyc], meta:{} });
      }
      if (this.ep && this.ep[0] === x + dx && this.ep[1] === y + dir) {
        moves.push({ from:[x,y], to:[x+dx,y+dir], meta:{ enpassant:true } });
      }
    }
  } else if (piece === 'n') {
    for (const [dx, dy] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const t = this.at(nx, ny);
      if (t === '.' || pieceColor(t) !== color) moves.push({ from:[x,y], to:[nx,ny], meta:{} });
    }
  } else if (['b','r','q'].includes(piece)) {
    const dirs = piece === 'b'
      ? [[1,1],[1,-1],[-1,1],[-1,-1]]
      : piece === 'r'
        ? [[1,0],[-1,0],[0,1],[0,-1]]
        : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx, dy] of dirs) {
      let nx = x + dx;
      let ny = y + dy;
      while (this.inBounds(nx, ny)) {
        const t = this.at(nx, ny);
        if (t === '.') moves.push({ from:[x,y], to:[nx,ny], meta:{} });
        else {
          if (pieceColor(t) !== color) moves.push({ from:[x,y], to:[nx,ny], meta:{} });
          break;
        }
        nx += dx;
        ny += dy;
      }
    }
  } else if (piece === 'k') {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const t = this.at(nx, ny);
        if (t === '.' || pieceColor(t) !== color) moves.push({ from:[x,y], to:[nx,ny], meta:{} });
      }
    }
    const colorInfo = this.castleInfo && this.castleInfo[color];
    if (colorInfo && x === colorInfo.kingFile && y === colorInfo.rank) {
      const kingSideCastle = this.castleMove(color, 'kingside');
      const queenSideCastle = this.castleMove(color, 'queenside');
      if (kingSideCastle) moves.push(kingSideCastle);
      if (queenSideCastle) moves.push(queenSideCastle);
    }
  }

  return moves;
};

ChessGame.prototype.castlePathIsSafe = function(mv) {
  if (!mv.meta || !mv.meta.castle) return true;
  const color = this.turn;
  const enemy = opposite(color);
  if (this.inCheck(color)) return false;
  const meta = mv.meta;
  const rank = color === 'w' ? 7 : 0;
  const kingFrom = Number.isInteger(meta.kingFrom) ? meta.kingFrom : (this.castleInfo && this.castleInfo[color] ? this.castleInfo[color].kingFile : 4);
  const kingTo = Number.isInteger(meta.kingTo) ? meta.kingTo : ((meta.castle === 'K' || meta.castle === 'k') ? 6 : 2);
  for (const xx of rangeBetweenInclusive(kingFrom, kingTo)) {
    if (this.isAttacked(xx, rank, enemy)) return false;
  }
  return true;
};

ChessGame.prototype.legalMoves = function() {
  const moves = [];
  const side = this.turn;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = this.at(x, y);
      if (p === '.' || pieceColor(p) !== side) continue;
      for (const pm of this.pseudoLegalMovesFrom(x, y)) {
        if (pm.meta && pm.meta.castle && !this.castlePathIsSafe(pm)) continue;
        const sim = this.clone();
        sim.makeMove(pm, true);
        const kp = sim.findKing(side);
        if (kp && !sim.isAttacked(kp[0], kp[1], opposite(side))) moves.push(pm);
      }
    }
  }
  return moves;
};

ChessGame.prototype.makeMove = function(mv, silent) {
  const fx = mv.from[0];
  const fy = mv.from[1];
  const tx = mv.to[0];
  const ty = mv.to[1];
  const piece = this.at(fx, fy);
  const meta = mv.meta || {};
  let taken = '.';

  if (meta.enpassant) {
    taken = this.at(tx, fy);
    this.set(tx, fy, '.');
    this.set(tx, ty, piece);
    this.set(fx, fy, '.');
  } else if (meta.castle) {
    const color = pieceColor(piece);
    const rank = color === 'w' ? 7 : 0;
    const rook = color === 'w' ? 'R' : 'r';
    const kingFrom = Number.isInteger(meta.kingFrom) ? meta.kingFrom : fx;
    const kingTo = Number.isInteger(meta.kingTo) ? meta.kingTo : tx;
    const rookFrom = Number.isInteger(meta.rookFrom) ? meta.rookFrom : ((meta.castle === 'K' || meta.castle === 'k') ? 7 : 0);
    const rookTo = Number.isInteger(meta.rookTo) ? meta.rookTo : ((meta.castle === 'K' || meta.castle === 'k') ? 5 : 3);
    this.set(kingFrom, rank, '.');
    this.set(rookFrom, rank, '.');
    this.set(kingTo, rank, piece);
    this.set(rookTo, rank, rook);
  } else {
    taken = this.at(tx, ty);
    this.set(tx, ty, piece);
    this.set(fx, fy, '.');
    if ((piece === 'P' && ty === 0) || (piece === 'p' && ty === 7)) {
      const prom = (mv.promotion || 'Q').toUpperCase();
      this.set(tx, ty, pieceColor(piece) === 'w' ? prom : prom.toLowerCase());
    }
  }

  this.ep = null;
  if ((piece === 'P' || piece === 'p') && Math.abs(ty - fy) === 2) this.ep = [fx, (fy + ty) / 2];

  if (piece === 'K') { this.castling.K = false; this.castling.Q = false; }
  if (piece === 'k') { this.castling.k = false; this.castling.q = false; }
  const wInfo = this.castleInfo && this.castleInfo.w;
  const bInfo = this.castleInfo && this.castleInfo.b;
  if (piece === 'R' && fy === 7 && wInfo) {
    if (fx === wInfo.queenside.rookFile) this.castling.Q = false;
    if (fx === wInfo.kingside.rookFile) this.castling.K = false;
  }
  if (piece === 'r' && fy === 0 && bInfo) {
    if (fx === bInfo.queenside.rookFile) this.castling.q = false;
    if (fx === bInfo.kingside.rookFile) this.castling.k = false;
  }
  if (taken === 'R' && ty === 7 && wInfo) {
    if (tx === wInfo.queenside.rookFile) this.castling.Q = false;
    if (tx === wInfo.kingside.rookFile) this.castling.K = false;
  }
  if (taken === 'r' && ty === 0 && bInfo) {
    if (tx === bInfo.queenside.rookFile) this.castling.q = false;
    if (tx === bInfo.kingside.rookFile) this.castling.k = false;
  }

  this.halfmove = (piece.toLowerCase() === 'p' || taken !== '.') ? 0 : this.halfmove + 1;
  if (this.turn === 'b') this.fullmove++;
  this.turn = opposite(this.turn);
  if (!silent) { mv.piece = piece; mv.taken = taken; }
  return { piece, taken };
};

ChessGame.prototype.gameOver = function() {
  const legal = this.legalMoves();
  if (legal.length === 0) {
    if (this.inCheck(this.turn)) return { type:'checkmate', winner: opposite(this.turn) };
    return { type:'stalemate' };
  }
  return false;
};

function serverMoveToSan(before, mv, after) {
  if (mv.meta && mv.meta.castle) {
    let san = (mv.meta.castle === 'K' || mv.meta.castle === 'k') ? 'O-O' : 'O-O-O';
    const go = after.gameOver();
    if (go && go.type === 'checkmate') san += '#';
    else if (after.inCheck(after.turn)) san += '+';
    return san;
  }

  const piece = before.at(mv.from[0], mv.from[1]);
  const isPawn = piece.toLowerCase() === 'p';
  const isCapture = mv.taken && mv.taken !== '.';
  const dest = coordToAlg(mv.to[0], mv.to[1]);
  let san = '';

  if (isPawn) {
    if (isCapture) san += files[mv.from[0]] + 'x';
    san += dest;
  } else {
    san += piece.toUpperCase();
    const candidates = before.legalMoves().filter(lm => {
      const p = before.at(lm.from[0], lm.from[1]);
      return p === piece && lm.to[0] === mv.to[0] && lm.to[1] === mv.to[1];
    });
    if (candidates.length > 1) {
      const others = candidates.filter(c => c.from[0] !== mv.from[0] || c.from[1] !== mv.from[1]);
      const sameFile = others.some(c => c.from[0] === mv.from[0]);
      const sameRank = others.some(c => c.from[1] === mv.from[1]);
      if (sameFile && sameRank) san += files[mv.from[0]] + (8 - mv.from[1]);
      else if (sameFile) san += (8 - mv.from[1]);
      else san += files[mv.from[0]];
    }
    if (isCapture) san += 'x';
    san += dest;
  }

  if (mv.promotion) san += '=' + mv.promotion.toUpperCase();
  const go = after.gameOver();
  if (go && go.type === 'checkmate') san += '#';
  else if (after.inCheck(after.turn)) san += '+';
  return san;
}

function buildGameFromStoredMoves(moves, gameSetup = null) {
  const g = new ChessGame(cleanGameSetup(gameSetup));
  for (const stored of moves || []) {
    const legal = g.legalMoves();
    const found = legal.find(lm => lm.from[0] === stored.from[0] && lm.from[1] === stored.from[1] && lm.to[0] === stored.to[0] && lm.to[1] === stored.to[1]);
    if (!found) throw new Error('Gespeicherte Zugliste enthält einen illegalen Zug.');
    const mv = { from: found.from, to: found.to, meta: found.meta || {}, promotion: stored.promotion || null };
    g.makeMove(mv, true);
  }
  return g;
}

function validateMoveOnServer(storedMoves, incoming, gameSetup = null) {
  const before = buildGameFromStoredMoves(storedMoves || [], gameSetup);
  const legal = before.legalMoves();
  const found = legal.find(lm => lm.from[0] === incoming.from[0] && lm.from[1] === incoming.from[1] && lm.to[0] === incoming.to[0] && lm.to[1] === incoming.to[1]);
  if (!found) {
    return { ok:false, code:'ILLEGAL_CHESS_MOVE', message:'Der Server hat den Zug als illegal abgelehnt.' };
  }

  const movingPiece = before.at(found.from[0], found.from[1]);
  const needsPromotion = movingPiece.toLowerCase() === 'p' && (found.to[1] === 0 || found.to[1] === 7);
  if (needsPromotion && !incoming.promotion) {
    return { ok:false, code:'PROMOTION_REQUIRED', message:'Bauernumwandlung fehlt.' };
  }
  if (!needsPromotion && incoming.promotion) {
    return { ok:false, code:'PROMOTION_NOT_ALLOWED', message:'Bauernumwandlung ist bei diesem Zug nicht erlaubt.' };
  }

  const mv = { from: found.from, to: found.to, meta: found.meta || {}, promotion: needsPromotion ? incoming.promotion : null };
  const after = before.clone();
  const applied = after.makeMove(mv, false);
  mv.piece = applied.piece;
  mv.taken = applied.taken;
  mv.san = serverMoveToSan(before, mv, after);

  return { ok:true, before, after, move: mv, gameOver: after.gameOver() };
}

function resultFromGameOver(gameOver) {
  if (!gameOver) return '*';
  if (gameOver.type === 'checkmate') return gameOver.winner === 'w' ? '1-0' : '0-1';
  if (gameOver.type === 'stalemate') return '1/2-1/2';
  return '*';
}

function finishGameState(game, reason, winner, now = Date.now()) {
  const finished = Object.assign({}, game || { started:true });
  finished.started = true;
  finished.ended = true;
  finished.endedAt = new Date(now).toISOString();
  finished.endReason = reason || 'unknown';
  finished.winner = winner || null;
  finished.result = winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2';
  return finished;
}

function pgnEscapeTagValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, ' ')
    .trim();
}

function pgnDateFromIso(value) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return [
    String(safeDate.getUTCFullYear()).padStart(4, '0'),
    String(safeDate.getUTCMonth() + 1).padStart(2, '0'),
    String(safeDate.getUTCDate()).padStart(2, '0')
  ].join('.');
}

function fenBoardPartFromServerBoard(board) {
  return board.map(row => {
    let out = '';
    let empty = 0;
    for (const piece of row) {
      if (!piece || piece === '.') {
        empty += 1;
        continue;
      }
      if (empty) {
        out += String(empty);
        empty = 0;
      }
      out += piece;
    }
    if (empty) out += String(empty);
    return out;
  }).join('/');
}

function initialFenForServerSetup(setup) {
  const game = new ChessGame(setup);
  return fenBoardPartFromServerBoard(game.board) + ' w KQkq - 0 1';
}

function pgnMoveTextFromStoredMoves(moves, result) {
  const parts = [];
  const safeMoves = Array.isArray(moves) ? moves : [];
  for (let i = 0; i < safeMoves.length; i += 2) {
    parts.push((Math.floor(i / 2) + 1) + '.');
    if (safeMoves[i] && safeMoves[i].san) parts.push(String(safeMoves[i].san));
    if (safeMoves[i + 1] && safeMoves[i + 1].san) parts.push(String(safeMoves[i + 1].san));
  }
  parts.push(result || '*');
  return parts.join(' ');
}

function buildDailyPgnDocument({ game, timeControl, setup, moves, whiteName, blackName }) {
  const normalizedSetup = cleanGameSetup(setup || (game && game.gameSetup) || null);
  const result = game && game.result ? String(game.result) : '*';
  const tags = [
    ['Event', 'Hammerschach-Gamer'],
    ['Site', 'Andili.de'],
    ['Date', pgnDateFromIso((game && (game.endedAt || game.startedAt)) || null)],
    ['Round', '-'],
    ['White', cleanDisplayName(whiteName) || 'Weiß'],
    ['Black', cleanDisplayName(blackName) || 'Schwarz'],
    ['Result', result],
    ['TimeControl', '-'],
    ['HammerschachMode', 'Daily'],
    ['HammerschachDaysPerMove', String(Math.max(1, Number(timeControl && timeControl.daysPerMove || 1)))]
  ];
  if (normalizedSetup.variant === GAME_VARIANT_FREESTYLE) {
    tags.push(['Variant', 'Chess960']);
    tags.push(['SetUp', '1']);
    tags.push(['FEN', initialFenForServerSetup(normalizedSetup)]);
    tags.push(['HammerschachPosition', String(normalizedSetup.positionId)]);
    tags.push(['HammerschachBackRank', normalizedSetup.backRank]);
  }
  const header = tags.map(([key, value]) => '[' + key + ' "' + pgnEscapeTagValue(value) + '"]').join('\n');
  return header + '\n\n' + pgnMoveTextFromStoredMoves(moves, result) + '\n';
}

function safePgnFilePart(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36) || 'Partie';
}

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.userPresenceCache = { key:'', expiresAt:0, values:{} };
  }

  async cancelDailyInvitation(requestingUserId) {
    const userId = String(requestingUserId || '').trim();
    if (!userId) return { ok:false, status:401, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' };

    const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
    let indexedGame = null;
    try {
      if (roomId && await ensureDailyGamesTable(this.env)) {
        indexedGame = await this.env.DB.prepare(
          `SELECT room_id, white_user_id, black_user_id, started, ended
             FROM daily_games
            WHERE room_id = ?
            LIMIT 1`
        ).bind(roomId).first();
      }
    } catch (_) {}

    const existingCancellation = await this.state.storage.get('cancelled');
    if (existingCancellation && existingCancellation.cancelled) {
      try {
        if (roomId && await ensureDailyGamesTable(this.env)) {
          await this.env.DB.prepare(`DELETE FROM daily_games WHERE room_id = ?`).bind(roomId).run();
        }
      } catch (_) {}
      return { ok:true, status:200, roomId, cancelledAt:existingCancellation.cancelledAt || null, alreadyCancelled:true };
    }

    const indexedCreatorRole = indexedGame && !indexedGame.started && !indexedGame.ended
      ? (String(indexedGame.white_user_id || '') === userId && !indexedGame.black_user_id
          ? 'w'
          : (String(indexedGame.black_user_id || '') === userId && !indexedGame.white_user_id ? 'b' : ''))
      : '';

    const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
    if (timeControl && timeControl.mode !== 'daily') {
      return { ok:false, status:400, code:'NOT_DAILY_INVITATION', message:'Dieser Raum ist keine offene Daily-Einladung.' };
    }
    if (!timeControl && !indexedCreatorRole) {
      return { ok:false, status:400, code:'NOT_DAILY_INVITATION', message:'Dieser Raum ist keine offene Daily-Einladung.' };
    }

    const game = (await this.state.storage.get('game')) || { started:false, ended:false, result:'*' };
    if (game.started || game.ended || (indexedGame && (indexedGame.started || indexedGame.ended))) {
      return { ok:false, status:409, code:'INVITATION_ALREADY_ACCEPTED', message:'Die Einladung kann nicht mehr gelöscht werden, weil die Partie bereits angenommen oder gestartet wurde.' };
    }

    const players = await this.getSecurePlayers();
    let creatorRole = (await this.state.storage.get('createdByRole')) || '';
    if (creatorRole !== 'w' && creatorRole !== 'b') {
      if (players.white && !players.black) creatorRole = 'w';
      else if (players.black && !players.white) creatorRole = 'b';
      else creatorRole = indexedCreatorRole;
    }
    const creatorSlot = creatorRole === 'b' ? players.black : creatorRole === 'w' ? players.white : null;
    const opponentSlot = creatorRole === 'b' ? players.white : creatorRole === 'w' ? players.black : null;
    const creatorMatchesRoom = !!(creatorSlot && creatorSlot.userId && String(creatorSlot.userId) === userId);

    if ((creatorSlot && !creatorMatchesRoom) || (!creatorSlot && creatorRole !== indexedCreatorRole)) {
      return { ok:false, status:403, code:'NOT_INVITATION_CREATOR', message:'Nur der Ersteller kann diese Einladung löschen.' };
    }
    if (opponentSlot || (indexedGame && (creatorRole === 'w' ? indexedGame.black_user_id : indexedGame.white_user_id))) {
      return { ok:false, status:409, code:'OPPONENT_ALREADY_JOINED', message:'Die Einladung kann nicht mehr gelöscht werden, weil der Gegner den Spielerplatz bereits angenommen hat.' };
    }

    const cancelledAt = new Date().toISOString();
    const cancellation = {
      cancelled:true,
      cancelledAt,
      cancelledByUserId:userId,
      creatorRole,
      roomId
    };
    await this.state.storage.put('cancelled', cancellation);
    await this.state.storage.delete('chatMessages');
    try { await this.state.storage.deleteAlarm(); } catch (_) {}
    try {
      if (roomId && await ensureDailyGamesTable(this.env)) {
        await this.env.DB.prepare(`DELETE FROM daily_games WHERE room_id = ?`).bind(roomId).run();
      }
    } catch (_) {}

    for (const socket of this.state.getWebSockets()) {
      const socketInfo = socket.deserializeAttachment() || {};
      socket.serializeAttachment(Object.assign({}, socketInfo, { role:'revoked', seatClaimed:false, cancelledAt }));
      safeSend(socket, {
        type:'room_cancelled',
        room:roomId || socketInfo.room || 'unknown',
        code:'INVITATION_CANCELLED',
        message:'Diese Einladung wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.',
        cancelledAt,
        serverNow:Date.now()
      });
      try { socket.close(4004, 'Einladung zurückgezogen'); } catch (_) {}
    }

    return { ok:true, status:200, roomId, cancelledAt };
  }

  async buildDailyPgnForUser(requestingUserId) {
    const userId = String(requestingUserId || '').trim();
    if (!userId) return { ok:false, status:401, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' };

    const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
    if (!timeControl || timeControl.mode !== 'daily') {
      return { ok:false, status:400, code:'NOT_DAILY_GAME', message:'Dieser Raum ist keine Daily-Partie.' };
    }

    const players = await this.getSecurePlayers();
    const whiteUserId = players.white && players.white.userId ? String(players.white.userId) : '';
    const blackUserId = players.black && players.black.userId ? String(players.black.userId) : '';
    if (userId !== whiteUserId && userId !== blackUserId) {
      return { ok:false, status:403, code:'NOT_A_PLAYER', message:'Diese Daily-Partie gehört nicht zu deinem Account.' };
    }

    const timed = await this.refreshTimedGameState(Date.now());
    const game = timed.game || { started:false, ended:false, result:'*' };
    if (!game.ended) {
      return { ok:false, status:409, code:'GAME_NOT_ENDED', message:'Die PGN-Datei steht nach Partieende bereit.' };
    }

    const profiles = (await this.state.storage.get('playerProfiles')) || {};
    const whitePlayerId = playerIdFromSlot(players.white);
    const blackPlayerId = playerIdFromSlot(players.black);
    const whiteName = cleanDisplayName(whitePlayerId && profiles[whitePlayerId] && (profiles[whitePlayerId].displayName || profiles[whitePlayerId].name)) || 'Weiß';
    const blackName = cleanDisplayName(blackPlayerId && profiles[blackPlayerId] && (profiles[blackPlayerId].displayName || profiles[blackPlayerId].name)) || 'Schwarz';
    const setup = cleanGameSetup((await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null);
    const moves = (await this.state.storage.get('moves')) || [];
    const pgn = buildDailyPgnDocument({ game, timeControl, setup, moves, whiteName, blackName });
    const datePart = pgnDateFromIso(game.endedAt || game.startedAt || null).replace(/\./g, '-');
    const variantPart = setup.variant === GAME_VARIANT_FREESTYLE ? ('Freestyle-' + setup.positionId) : 'Klassisch';
    const filename = safePgnFilePart('Hammerschach-' + datePart + '-' + variantPart + '-' + whiteName + '-vs-' + blackName) + '.pgn';
    return { ok:true, status:200, pgn, filename };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const room = cleanRoomId(url.searchParams.get('room'));
    if (!room) return new Response('Missing or invalid room', { status: 400 });

    await this.state.storage.put('roomId', room);

    if (request.method === 'GET' && url.pathname === '/daily-pgn') {
      const result = await this.buildDailyPgnForUser(request.headers.get('x-hammerschach-user-id') || '');
      if (!result.ok) return json({ ok:false, code:result.code || 'PGN_UNAVAILABLE', message:result.message || 'PGN-Datei konnte nicht erstellt werden.' }, { status:result.status || 400 });
      return new Response(result.pgn, {
        status:200,
        headers:{
          'content-type':'application/x-chess-pgn; charset=utf-8',
          'content-disposition':'attachment; filename="' + result.filename + '"'
        }
      });
    }

    if (request.method === 'DELETE' && url.pathname === '/cancel-invitation') {
      const result = await this.cancelDailyInvitation(request.headers.get('x-hammerschach-user-id') || '');
      return json({ ok:result.ok, code:result.code || '', message:result.message || '', roomId:result.roomId || room, cancelledAt:result.cancelledAt || null }, { status:result.status || (result.ok ? 200 : 400) });
    }

    const cancellation = await this.state.storage.get('cancelled');
    if (cancellation && cancellation.cancelled) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return json({ ok:false, code:'INVITATION_CANCELLED', message:'Diese Einladung wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.', cancelledAt:cancellation.cancelledAt || null }, { status:410 });
      }
      const cancelledPair = new WebSocketPair();
      const [cancelledClient, cancelledServer] = Object.values(cancelledPair);
      cancelledServer.accept();
      safeSend(cancelledServer, {
        type:'room_cancelled',
        room,
        code:'INVITATION_CANCELLED',
        message:'Diese Einladung wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.',
        cancelledAt:cancellation.cancelledAt || null,
        serverNow:Date.now()
      });
      try { cancelledServer.close(4004, 'Einladung zurückgezogen'); } catch (_) {}
      return new Response(null, { status:101, webSocket:cancelledClient });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({
      connectionId: crypto.randomUUID(),
      playerId: null,
      role: 'pending',
      room,
      displayName: '',
      guest: true,
      userId: null,
      username: '',
      seatClaimed: false,
      joinedAt: Date.now()
    });

    safeSend(server, { type: 'seat_challenge', room, serverNow: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async getSecurePlayers() {
    const raw = (await this.state.storage.get('players')) || { white: null, black: null };
    const players = {
      white: normalizeSeatSlot(raw.white),
      black: normalizeSeatSlot(raw.black)
    };

    // Alte, nur aus einer offen sichtbaren playerId bestehende Plätze werden bewusst
    // nicht übernommen. Damit bleiben Räume aus der unsicheren Vorversion nicht angreifbar.
    const requiresMigration = [raw.white, raw.black].some(slot =>
      !!slot && (typeof slot !== 'object' || !String(slot.seatTokenHash || slot.seat_token_hash || '').trim())
    );
    if (requiresMigration) await this.state.storage.put('players', players);
    return players;
  }

  async seatTokenMatches(slot, rawToken) {
    if (!slot || !slot.seatTokenHash || !rawToken) return false;
    const candidateHash = await sha256Hex(String(rawToken));
    return timingSafeStringEqual(candidateHash, slot.seatTokenHash);
  }

  seatIdentityMatches(slot, playerId, authUser) {
    if (!slot) return false;
    if (slot.userId) return !!(authUser && String(authUser.id) === String(slot.userId));
    return !authUser && String(slot.playerId || '') === String(playerId || '');
  }

  async assignRole(playerId, preferredRole = '', seatToken = '', authUser = null) {
    const players = await this.getSecurePlayers();
    const roles = preferredRole === 'b' ? ['b', 'w'] : preferredRole === 'w' ? ['w', 'b'] : ['w', 'b'];
    const slotForRole = role => role === 'b' ? players.black : players.white;

    // Gäste benötigen weiterhin das geheime Sitzplatz-Token. Ein an einen
    // registrierten Account gebundener Platz kann zusätzlich über eine gültige
    // Login-Sitzung desselben Accounts zurückgewonnen werden.
    for (const role of roles) {
      const slot = slotForRole(role);
      if (!this.seatIdentityMatches(slot, playerId, authUser)) continue;
      const reclaimedByAccount = !!(slot.userId && authUser && String(slot.userId) === String(authUser.id));
      if (!reclaimedByAccount && !(await this.seatTokenMatches(slot, seatToken))) {
        return { role: 'spectator', seatToken: '', denied: true, code: 'SEAT_TOKEN_REQUIRED' };
      }

      const rotatedToken = randomBase64Url(32);
      const renewed = Object.assign({}, slot, {
        playerId,
        userId: authUser ? authUser.id : null,
        seatTokenHash: await sha256Hex(rotatedToken),
        updatedAt: Date.now()
      });
      if (role === 'b') players.black = renewed;
      else players.white = renewed;
      await this.state.storage.put('players', players);
      return { role, seatToken: rotatedToken, denied: false, reclaimed: true };
    }

    const assign = async role => {
      const token = randomBase64Url(32);
      const slot = {
        playerId,
        userId: authUser ? authUser.id : null,
        seatTokenHash: await sha256Hex(token),
        assignedAt: Date.now(),
        updatedAt: Date.now()
      };
      if (role === 'b') players.black = slot;
      else players.white = slot;
      await this.state.storage.put('players', players);
      const creatorRole = (await this.state.storage.get('createdByRole')) || '';
      if (!creatorRole) await this.state.storage.put('createdByRole', role);
      return { role, seatToken: token, denied: false, reclaimed: false };
    };

    if (!players.white && !players.black) return assign(preferredRole === 'b' ? 'b' : 'w');
    if (preferredRole === 'w' && !players.white) return assign('w');
    if (preferredRole === 'b' && !players.black) return assign('b');
    if (!players.white) return assign('w');
    if (!players.black) return assign('b');
    return { role: 'spectator', seatToken: '', denied: false, reclaimed: false };
  }

  replaceExistingSeatConnection(role, currentWs) {
    if (role !== 'w' && role !== 'b') return;
    for (const other of this.state.getWebSockets()) {
      if (other === currentWs) continue;
      const otherInfo = other.deserializeAttachment() || {};
      if (otherInfo.role !== role) continue;
      other.serializeAttachment(Object.assign({}, otherInfo, { role: 'revoked', seatClaimed: false, revokedAt: Date.now() }));
      safeSend(other, {
        type: 'seat_replaced',
        message: 'Dieser Spielerplatz wurde in einer neuen Verbindung übernommen.',
        serverNow: Date.now()
      });
      try { other.close(4001, 'Spielerplatz in neuer Verbindung geöffnet'); } catch (_) {}
    }
  }

  async bindCurrentSeatToUser(role, playerId, authUser) {
    if (!authUser || !authUser.id || (role !== 'w' && role !== 'b')) return true;
    const players = await this.getSecurePlayers();
    const slot = role === 'b' ? players.black : players.white;
    if (!slot || String(slot.playerId || '') !== String(playerId || '')) return false;
    if (slot.userId && String(slot.userId) !== String(authUser.id)) return false;
    const bound = Object.assign({}, slot, { userId: authUser.id, updatedAt: Date.now() });
    if (role === 'b') players.black = bound;
    else players.white = bound;
    await this.state.storage.put('players', players);
    return true;
  }

  async savePlayerProfile(playerId, requestedDisplayName, role = '', accountUser = null) {
    const profiles = (await this.state.storage.get('playerProfiles')) || {};
    const previous = profiles[playerId] || {};
    const accountName = accountUser ? cleanDisplayName(accountUser.username) : '';
    const displayName = accountName || cleanDisplayName(requestedDisplayName) || cleanDisplayName(previous.displayName) || guestNameFromPlayerId(playerId);
    const profile = {
      playerId,
      displayName,
      name: displayName,
      guest: accountUser ? false : true,
      userId: accountUser ? accountUser.id : null,
      username: accountUser ? accountUser.username : '',
      role: role || previous.role || '',
      updatedAt: Date.now()
    };
    profiles[playerId] = profile;
    await this.state.storage.put('playerProfiles', profiles);
    return profile;
  }

  async getGamerPresenceByUserIds(userIds) {
    const ids = Array.from(new Set((userIds || []).map(value => String(value || '').trim()).filter(Boolean))).sort();
    if(ids.length === 0 || !this.env || !this.env.DB) return {};

    const now = Date.now();
    const cacheKey = ids.join('|');
    if(this.userPresenceCache && this.userPresenceCache.key === cacheKey && this.userPresenceCache.expiresAt > now){
      return this.userPresenceCache.values || {};
    }

    const values = Object.fromEntries(ids.map(id => [id, false]));
    try {
      await ensureUserPresenceTable(this.env);
      const placeholders = ids.map(() => '?').join(',');
      const result = await this.env.DB.prepare(
        `SELECT user_id, last_seen_at FROM user_presence WHERE user_id IN (${placeholders})`
      ).bind(...ids).all();
      const onlineSince = Date.now() - USER_PRESENCE_ONLINE_WINDOW_MS;
      for(const row of (result && result.results ? result.results : [])){
        const userId = String(row.user_id || '');
        const lastSeen = Date.parse(row.last_seen_at || '');
        if(userId && Number.isFinite(lastSeen)) values[userId] = lastSeen >= onlineSince;
      }
    } catch (_) {
      // Der allgemeine Anwesenheitsstatus darf die Partie niemals beeinträchtigen.
    }

    this.userPresenceCache = { key:cacheKey, expiresAt:now + 30000, values };
    return values;
  }

  async getActivePlayers(players = null, options = {}) {
    const assigned = players || (await this.state.storage.get('players')) || { white: null, black: null };
    const profiles = (await this.state.storage.get('playerProfiles')) || {};
    const whiteId = playerIdFromSlot(assigned.white);
    const blackId = playerIdFromSlot(assigned.black);
    const whiteUserId = assigned.white && assigned.white.userId ? String(assigned.white.userId) : '';
    const blackUserId = assigned.black && assigned.black.userId ? String(assigned.black.userId) : '';
    const presence = options.includePresence
      ? await this.getGamerPresenceByUserIds([whiteUserId, blackUserId])
      : {};
    const makeSlot = (playerId, userId) => {
      const profile = playerId ? (profiles[playerId] || {}) : {};
      const displayName = cleanDisplayName(profile.displayName || profile.name) || (playerId ? guestNameFromPlayerId(playerId) : '');
      return {
        connected: false,
        gamerOnline: !!(userId && presence[userId]),
        name: displayName,
        displayName,
        guest: profile.guest !== false
      };
    };

    const active = {
      white: makeSlot(whiteId, whiteUserId),
      black: makeSlot(blackId, blackUserId),
      spectators: 0
    };

    for (const ws of this.state.getWebSockets()) {
      const info = ws.deserializeAttachment() || {};
      const name = cleanDisplayName(info.displayName) || (info.playerId ? guestNameFromPlayerId(info.playerId) : '');
      if (info.role === 'w') {
        active.white.connected = true;
        if (name) { active.white.name = name; active.white.displayName = name; }
        active.white.guest = info.guest !== false;
      } else if (info.role === 'b') {
        active.black.connected = true;
        if (name) { active.black.name = name; active.black.displayName = name; }
        active.black.guest = info.guest !== false;
      } else {
        active.spectators += 1;
      }
    }

    return active;
  }

  async syncDailyGameIndex() {
    try {
      if (!(await ensureDailyGamesTable(this.env))) return;
      const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
      if (!roomId) return;

      const cancellation = await this.state.storage.get('cancelled');
      if (cancellation && cancellation.cancelled) {
        await this.env.DB.prepare(`DELETE FROM daily_games WHERE room_id = ?`).bind(roomId).run();
        return;
      }

      const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
      if (!timeControl || timeControl.mode !== 'daily') {
        await this.env.DB.prepare(`DELETE FROM daily_games WHERE room_id = ?`).bind(roomId).run();
        return;
      }

      const players = await this.getSecurePlayers();
      const whiteUserId = players.white && players.white.userId ? String(players.white.userId) : '';
      const blackUserId = players.black && players.black.userId ? String(players.black.userId) : '';

      // Offene Daily-Einladungen bleiben für den Ersteller unter „Meine Partien“
      // sichtbar, damit er sie löschen kann. Ein Raum ohne registrierten Ersteller
      // wird dagegen nicht in die persönliche Übersicht aufgenommen.
      if (!whiteUserId && !blackUserId) {
        await this.env.DB.prepare(`DELETE FROM daily_games WHERE room_id = ?`).bind(roomId).run();
        return;
      }

      const profiles = (await this.state.storage.get('playerProfiles')) || {};
      const whitePlayerId = playerIdFromSlot(players.white);
      const blackPlayerId = playerIdFromSlot(players.black);
      const whiteName = cleanDisplayName(whitePlayerId && profiles[whitePlayerId] && (profiles[whitePlayerId].displayName || profiles[whitePlayerId].name)) || (whiteUserId ? 'Weiß' : 'noch offen');
      const blackName = cleanDisplayName(blackPlayerId && profiles[blackPlayerId] && (profiles[blackPlayerId].displayName || profiles[blackPlayerId].name)) || (blackUserId ? 'Schwarz' : 'noch offen');
      const game = (await this.state.storage.get('game')) || { started:false, ended:false, result:'*' };
      const clock = advanceClock((await this.state.storage.get('clock')) || null, Date.now());
      const setup = cleanGameSetup((await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null);
      const now = Date.now();
      const deadlineAt = clock && clock.running && !clock.timeLost
        ? new Date(now + Math.max(0, Number(clock[clock.turn + 'Ms'] || 0))).toISOString()
        : null;

      await this.env.DB.prepare(
        `INSERT INTO daily_games (
           room_id, white_user_id, black_user_id, white_name, black_name,
           time_label, days_per_move, variant, started, started_at, updated_at,
           turn, deadline_at, ended, ended_at, result, end_reason
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(room_id) DO UPDATE SET
           white_user_id = excluded.white_user_id,
           black_user_id = excluded.black_user_id,
           white_name = excluded.white_name,
           black_name = excluded.black_name,
           time_label = excluded.time_label,
           days_per_move = excluded.days_per_move,
           variant = excluded.variant,
           started = excluded.started,
           started_at = excluded.started_at,
           updated_at = excluded.updated_at,
           turn = excluded.turn,
           deadline_at = excluded.deadline_at,
           ended = excluded.ended,
           ended_at = excluded.ended_at,
           result = excluded.result,
           end_reason = excluded.end_reason`
      ).bind(
        roomId, whiteUserId || null, blackUserId || null, whiteName, blackName,
        timeControl.label, timeControl.daysPerMove, setup.variant,
        game.started ? 1 : 0, game.startedAt || null, new Date(now).toISOString(),
        clock && (clock.turn === 'w' || clock.turn === 'b') ? clock.turn : null, deadlineAt,
        game.ended ? 1 : 0, game.endedAt || null, game.result || '*', game.endReason || null
      ).run();
    } catch (_) {
      // Ein D1-Fehler darf die eigentliche Partie nicht unterbrechen.
    }
  }

  async scheduleClockAlarm(clock, now = Date.now()) {
    try {
      if (!clock || !clock.running || clock.timeLost) {
        await this.state.storage.deleteAlarm();
        return;
      }
      const remaining = Math.max(0, Number(clock[clock.turn + 'Ms'] || 0));
      await this.state.storage.setAlarm(now + remaining + 25);
    } catch (_) {
      // Zustandsabfragen und Aktionen finalisieren die Uhr zusätzlich.
    }
  }

  async refreshTimedGameState(now = Date.now()) {
    let game = (await this.state.storage.get('game')) || { started: false, ended: false, result: '*' };
    let clock = (await this.state.storage.get('clock')) || null;
    if (!clock) return { game, clock: null, justEnded: false };

    const advanced = advanceClock(clock, now);
    if (advanced && JSON.stringify(advanced) !== JSON.stringify(clock)) {
      clock = advanced;
      await this.state.storage.put('clock', clock);
    } else {
      clock = advanced || clock;
    }

    let justEnded = false;
    if (game.started && !game.ended && clock && clock.timeLost) {
      game = finishGameState(game, 'time', clock.winner, now);
      await this.state.storage.put('game', game);
      await this.state.storage.delete('drawOffer');
      justEnded = true;
      await this.syncDailyGameIndex();
    }

    if (game.ended || !clock.running || clock.timeLost) {
      try { await this.state.storage.deleteAlarm(); } catch (_) {}
    } else {
      await this.scheduleClockAlarm(clock, now);
    }
    return { game, clock, justEnded };
  }

  async autoStartDailyGameIfReady(startedByRole = 'automatic') {
    const cancellation = await this.state.storage.get('cancelled');
    if (cancellation && cancellation.cancelled) return { started:false, reason:'cancelled' };
    const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
    if (!timeControl || timeControl.mode !== 'daily') return { started:false, reason:'not_daily' };

    const existingGame = (await this.state.storage.get('game')) || { started:false, ended:false, result:'*' };
    if (existingGame.started || existingGame.ended) {
      return {
        started:false,
        reason: existingGame.started ? 'already_started' : 'already_ended',
        game: existingGame,
        clock: (await this.state.storage.get('clock')) || null,
        timeControl,
        gameSetup: cleanGameSetup((await this.state.storage.get('gameSetup')) || (existingGame && existingGame.gameSetup) || null)
      };
    }

    // Die vorbereitete Stellung muss bereits im Raum gespeichert sein. So kann eine
    // Freestyle-Auswahl nicht durch einen zu frühen automatischen Start verloren gehen.
    const storedGameSetup = await this.state.storage.get('gameSetup');
    if (!storedGameSetup) return { started:false, reason:'setup_missing' };

    const players = await this.getSecurePlayers();
    const whiteRegistered = !!(players.white && players.white.userId);
    const blackRegistered = !!(players.black && players.black.userId);
    if (!whiteRegistered || !blackRegistered) return { started:false, reason:'accounts_missing' };

    const now = Date.now();
    const gameSetup = cleanGameSetup(storedGameSetup);
    const game = {
      started: true,
      startedAt: new Date(now).toISOString(),
      startedByRole: startedByRole || 'automatic',
      autoStarted: true,
      ended: false,
      endedAt: null,
      endReason: null,
      winner: null,
      result: '*',
      gameSetup,
      playStatsCounted: false,
      playStatsCountedAt: null
    };
    const clock = makeInitialClock(timeControl, now);

    await this.state.storage.put('gameSetup', gameSetup);
    await this.state.storage.put('game', game);
    await this.state.storage.put('moves', []);
    await this.state.storage.put('clock', clock);
    await this.state.storage.delete('drawOffer');
    await this.scheduleClockAlarm(clock, now);
    await this.syncDailyGameIndex();

    return { started:true, reason:'auto_started', game, clock, timeControl, gameSetup };
  }

  async alarm() {
    const current = await this.refreshTimedGameState(Date.now());
    if (current.justEnded) await this.broadcastRoomState('game_finished');
  }

  async buildStateFor(ws) {
    const info = ws.deserializeAttachment() || {};
    const players = await this.getSecurePlayers();
    const storedTimeControl = (await this.state.storage.get('timeControl')) || null;
    const storedGameSetup = (await this.state.storage.get('gameSetup')) || null;
    const gameSetup = safeSetupForClient(storedGameSetup);
    const now = Date.now();
    const timed = await this.refreshTimedGameState(now);
    const game = safeGameForClient(Object.assign({}, timed.game || { started: false, ended: false, result: '*' }, { gameSetup }));
    const createdByRole = (await this.state.storage.get('createdByRole')) || '';
    const moves = ((await this.state.storage.get('moves')) || []).map(safeMoveForClient);
    const drawOffer = safeDrawOfferForClient((await this.state.storage.get('drawOffer')) || null);
    const storedChatValue = await this.state.storage.get('chatMessages');
    const storedChatMessages = Array.isArray(storedChatValue) ? storedChatValue : [];
    const chatMessages = storedChatMessages
      .map(chat => safeChatForClient(chat, info))
      .filter(Boolean)
      .slice(-CHAT_HISTORY_MAX);

    return {
      type: 'room_state',
      room: info.room || 'unknown',
      role: info.role || 'spectator',
      assigned: {
        white: !!players.white,
        black: !!players.black
      },
      players: await this.getActivePlayers(players, { includePresence: !!(storedTimeControl && storedTimeControl.mode === 'daily') }),
      canSetTimeControl: !!(!game.started && !game.ended && (info.role === 'w' || (createdByRole && info.role === createdByRole))),
      createdByMe: !!(createdByRole && info.role === createdByRole),
      timeControl: safeTimeControlForClient(storedTimeControl),
      gameSetup,
      game,
      moves,
      drawOffer,
      chatMessages,
      clock: clockPayload(timed.clock, now),
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

  async broadcastMove(move, messageId = null, clock = null, game = null) {
    const now = Date.now();
    const drawOffer = (await this.state.storage.get('drawOffer')) || null;
    for (const ws of this.state.getWebSockets()) {
      const info = ws.deserializeAttachment() || {};
      safeSend(ws, {
        type: 'move',
        ok: true,
        messageId,
        room: info.room || 'unknown',
        role: info.role || 'spectator',
        move: safeMoveForClient(move),
        game: safeGameForClient(game),
        drawOffer: safeDrawOfferForClient(drawOffer),
        clock: clockPayload(clock, now),
        serverNow: now
      });
    }
  }

  async appendChatToHistory(chat) {
    const normalized = normalizeStoredChatMessage(chat);
    if (!normalized) return { chat:null, added:false };

    const stored = await this.state.storage.get('chatMessages');
    let history = Array.isArray(stored)
      ? stored.map(normalizeStoredChatMessage).filter(Boolean).slice(-CHAT_HISTORY_MAX)
      : [];
    const existing = history.find(item => item.id === normalized.id);
    if (existing) return { chat:existing, added:false };

    history.push(normalized);
    history = history.slice(-CHAT_HISTORY_MAX);
    await this.state.storage.put('chatMessages', history);
    return { chat:normalized, added:true };
  }

  async broadcastChatMessage(chat, messageId = null) {
    const now = Date.now();
    for (const ws of this.state.getWebSockets()) {
      const info = ws.deserializeAttachment() || {};
      const publicChat = safeChatForClient(chat, info);
      if (!publicChat) continue;
      safeSend(ws, {
        type: 'chat_message',
        ok: true,
        messageId: messageId || chat.messageId || chat.id || null,
        room: info.room || 'unknown',
        role: info.role || 'spectator',
        chat: publicChat,
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

    let info = ws.deserializeAttachment() || {};

    const cancellation = await this.state.storage.get('cancelled');
    if (cancellation && cancellation.cancelled) {
      safeSend(ws, {
        type:'room_cancelled',
        room:info.room || 'unknown',
        code:'INVITATION_CANCELLED',
        message:'Diese Einladung wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.',
        cancelledAt:cancellation.cancelledAt || null,
        serverNow:Date.now()
      });
      try { ws.close(4004, 'Einladung zurückgezogen'); } catch (_) {}
      return;
    }

    if (data.type === 'claim_seat') {
      if (info.seatClaimed) {
        safeSend(ws, { type: 'error', code: 'SEAT_ALREADY_CLAIMED', message: 'Der Spielerplatz wurde bereits zugeordnet.' });
        return;
      }

      const authSession = await lookupAuthSession(this.env, data.authToken || data.auth || data.token || '');
      const authUser = authSession ? authSession.user : null;
      let playerId = cleanPlayerId(data.player || data.playerId || data.player_id);
      let displayName = cleanDisplayName(data.displayName || data.name);
      if (authUser && authUser.id) {
        playerId = cleanPlayerId('u_' + authUser.id);
        displayName = cleanDisplayName(authUser.username);
      }
      const preferredRole = cleanPreferredRole(data.preferredRole || data.preferred_role || data.seatRole || data.seat_role);
      const roomTimeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
      if (roomTimeControl && roomTimeControl.mode === 'daily' && !authUser) {
        info = Object.assign({}, info, {
          playerId,
          role: 'spectator',
          displayName: displayName || guestNameFromPlayerId(playerId),
          guest: true,
          userId: null,
          username: '',
          seatClaimed: true,
          claimedAt: Date.now()
        });
        ws.serializeAttachment(info);
        safeSend(ws, {
          type: 'hello',
          room: info.room || 'unknown',
          role: 'spectator',
          displayName: info.displayName,
          guest: true,
          username: '',
          seatToken: '',
          seatDenied: true,
          seatCode: 'DAILY_ACCOUNT_REQUIRED',
          message: 'Daily Chess ist nur für registrierte und eingeloggte Mitglieder verfügbar.',
          serverNow: Date.now()
        });
        await this.sendRoomState(ws, 'hello_state');
        return;
      }
      const claimed = await this.assignRole(playerId, preferredRole, String(data.seatToken || data.seat_token || ''), authUser);
      const profile = await this.savePlayerProfile(playerId, displayName, claimed.role, authUser);

      info = Object.assign({}, info, {
        playerId,
        role: claimed.role,
        displayName: profile.displayName,
        guest: profile.guest,
        userId: profile.userId || null,
        username: profile.username || '',
        seatClaimed: true,
        claimedAt: Date.now()
      });
      ws.serializeAttachment(info);
      this.replaceExistingSeatConnection(claimed.role, ws);

      const dailyAutoStart = await this.autoStartDailyGameIfReady(claimed.role);

      safeSend(ws, {
        type: 'hello',
        room: info.room || 'unknown',
        role: claimed.role,
        displayName: profile.displayName,
        guest: profile.guest,
        username: profile.username || '',
        seatToken: claimed.seatToken || '',
        seatDenied: !!claimed.denied,
        seatCode: claimed.code || '',
        message: claimed.denied ? 'Der bisherige Spielerplatz konnte ohne gültiges Sitzplatz-Token nicht übernommen werden.' : '',
        serverNow: Date.now()
      });
      await this.sendRoomState(ws, 'hello_state');
      if (!dailyAutoStart.started) await this.syncDailyGameIndex();
      await this.broadcastRoomState(dailyAutoStart.started ? 'game_started' : 'lobby');
      return;
    }

    if (!info.seatClaimed) {
      safeSend(ws, { type: 'error', code: 'SEAT_CLAIM_REQUIRED', message: 'Bitte zuerst den Spielerplatz sicher bestätigen.' });
      return;
    }

    const role = info.role || 'spectator';

    if (data.type === 'ping') {
      safeSend(ws, { type: 'pong', ts: Date.now(), serverNow: Date.now() });
      return;
    }

    if (data.type === 'request_state') {
      await this.sendRoomState(ws, 'room_state');
      return;
    }

    if (data.type === 'chat_message') {
      const text = cleanChatText(data.text || data.message || (data.chat && data.chat.text));
      if (!text) {
        safeSend(ws, { type: 'error', code: 'EMPTY_CHAT_MESSAGE', message: 'Chatnachricht ist leer.' });
        return;
      }

      const now = Date.now();
      const lastChatAt = Number(info.lastChatAt || 0);
      if (lastChatAt && now - lastChatAt < CHAT_SEND_COOLDOWN_MS) {
        safeSend(ws, { type: 'error', code: 'CHAT_TOO_FAST', message: 'Bitte kurz warten, bevor du die nächste Chatnachricht sendest.' });
        return;
      }

      const updatedInfo = Object.assign({}, info, { lastChatAt: now });
      ws.serializeAttachment(updatedInfo);

      const messageId = String(data.messageId || data.message_id || (data.chat && (data.chat.messageId || data.chat.id)) || ('chat_' + now + '_' + crypto.randomUUID().slice(0, 8))).slice(0, 80);
      const senderName = cleanDisplayName(info.displayName || info.username || '') || fallbackChatName(role, info.playerId);
      const chat = {
        id: messageId,
        messageId,
        role,
        senderConnectionId: info.connectionId || '',
        senderPlayerId: info.playerId || '',
        senderUserId: info.userId || '',
        senderName,
        name: senderName,
        text,
        sentAt: new Date(now).toISOString()
      };

      const persisted = await this.appendChatToHistory(chat);
      if (!persisted.chat) {
        safeSend(ws, { type: 'error', code: 'CHAT_SAVE_FAILED', message: 'Chatnachricht konnte nicht gespeichert werden.' });
        return;
      }
      if (persisted.added) await this.broadcastChatMessage(persisted.chat, messageId);
      else {
        const publicChat = safeChatForClient(persisted.chat, info);
        safeSend(ws, { type:'chat_ack', ok:true, messageId, room:info.room || 'unknown', role, chat:publicChat, serverNow:Date.now() });
      }
      return;
    }

    if (data.type === 'set_player_name') {
      const authSession = await lookupAuthSession(this.env, data.authToken || data.token || '');
      const authUser = authSession ? authSession.user : null;
      const displayName = authUser ? cleanDisplayName(authUser.username) : cleanDisplayName(data.displayName || data.name);
      if (displayName.length < 2) {
        safeSend(ws, { type: 'error', code: 'INVALID_PLAYER_NAME', message: 'Spielername muss mindestens 2 Zeichen haben.' });
        return;
      }
      if (authUser && !(await this.bindCurrentSeatToUser(role, info.playerId, authUser))) {
        safeSend(ws, { type: 'error', code: 'SEAT_ACCOUNT_MISMATCH', message: 'Dieser Spielerplatz ist bereits an einen anderen Account gebunden.' });
        return;
      }
      const profile = await this.savePlayerProfile(info.playerId, displayName, role, authUser);
      ws.serializeAttachment(Object.assign({}, info, { displayName: profile.displayName, guest: profile.guest, userId: profile.userId || info.userId || null, username: profile.username || '' }));
      const dailyAutoStart = await this.autoStartDailyGameIfReady(role);
      if (!dailyAutoStart.started) await this.syncDailyGameIndex();
      safeSend(ws, { type: 'player_name', ok: true, role, displayName: profile.displayName, name: profile.displayName, guest: profile.guest, username: profile.username || '', serverNow: Date.now() });
      await this.broadcastRoomState(dailyAutoStart.started ? 'game_started' : 'room_state');
      return;
    }

    if (data.type === 'set_game_setup') {
      const game = (await this.state.storage.get('game')) || { started: false };
      if (game.started) {
        safeSend(ws, { type: 'error', code: 'GAME_ALREADY_STARTED', message: 'Spielmodus ist nach Partiestart gesperrt.' });
        return;
      }

      const createdByRole = (await this.state.storage.get('createdByRole')) || '';
      const canSetGameSetup = role === 'w' || (createdByRole && role === createdByRole);
      if (!canSetGameSetup) {
        safeSend(ws, { type: 'error', code: 'ONLY_WHITE_OR_CREATOR_CAN_SET_SETUP', message: 'Nur Weiß oder der Einladende kann den Spielmodus ändern.' });
        return;
      }

      const gameSetup = cleanGameSetup(data.gameSetup || data.game_setup || data.startPosition || data.start_position || data);
      gameSetup.updatedByRole = role;
      await this.state.storage.put('gameSetup', gameSetup);
      await this.state.storage.put('moves', []);
      await this.state.storage.delete('clock');
      const dailyAutoStart = await this.autoStartDailyGameIfReady(role);
      if (!dailyAutoStart.started) await this.syncDailyGameIndex();

      safeSend(ws, {
        type: 'game_setup_ack',
        ok: true,
        messageId: data.messageId || null,
        gameSetup: safeSetupForClient(gameSetup),
        serverNow: Date.now()
      });
      await this.broadcastRoomState(dailyAutoStart.started ? 'game_started' : 'room_state');
      return;
    }

    if (data.type === 'set_time_control') {
      const game = (await this.state.storage.get('game')) || { started: false };
      if (game.started) {
        safeSend(ws, { type: 'error', code: 'GAME_ALREADY_STARTED', message: 'Bedenkzeit ist nach Partiestart gesperrt.' });
        return;
      }

      const createdByRole = (await this.state.storage.get('createdByRole')) || '';
      const canSetTimeControl = role === 'w' || (createdByRole && role === createdByRole);
      if (!canSetTimeControl) {
        safeSend(ws, { type: 'error', code: 'ONLY_WHITE_OR_CREATOR_CAN_SET_TIME', message: 'Nur Weiß oder der Einladende kann die Bedenkzeit ändern.' });
        return;
      }

      const timeControl = cleanTimeControl(data.timeControl || data.time_control);
      if (!timeControl) {
        safeSend(ws, { type: 'error', code: 'INVALID_TIME_CONTROL', message: 'Ungültige Bedenkzeit.' });
        return;
      }

      if (timeControl.mode === 'daily' && !info.userId) {
        safeSend(ws, {
          type: 'error',
          code: 'DAILY_ACCOUNT_REQUIRED',
          message: 'Daily Chess ist nur für registrierte und eingeloggte Mitglieder verfügbar.'
        });
        return;
      }

      timeControl.updatedByRole = role;
      await this.state.storage.put('timeControl', timeControl);
      await this.state.storage.delete('clock');
      const dailyAutoStart = await this.autoStartDailyGameIfReady(role);
      if (!dailyAutoStart.started) await this.syncDailyGameIndex();

      safeSend(ws, {
        type: 'time_control_ack',
        ok: true,
        messageId: data.messageId || null,
        timeControl: safeTimeControlForClient(timeControl),
        serverNow: Date.now()
      });
      await this.broadcastRoomState(dailyAutoStart.started ? 'game_started' : 'room_state');
      return;
    }

    if (data.type === 'start_game') {
      if (role !== 'w') {
        safeSend(ws, { type: 'error', code: 'ONLY_WHITE_CAN_START', message: 'Nur Weiß kann die Partie starten.' });
        return;
      }

      let gameSetup = cleanGameSetup((await this.state.storage.get('gameSetup')) || null);
      const submittedGameSetupRaw = data.gameSetup || data.game_setup || data.startPosition || data.start_position || null;
      if (submittedGameSetupRaw) {
        const submittedGameSetup = cleanGameSetup(submittedGameSetupRaw);
        submittedGameSetup.updatedByRole = role;
        await this.state.storage.put('gameSetup', submittedGameSetup);
        gameSetup = submittedGameSetup;
      }

      let timeControl = (await this.state.storage.get('timeControl')) || null;
      const submittedTimeControl = cleanTimeControl(data.timeControl || data.time_control);
      if (submittedTimeControl) {
        submittedTimeControl.updatedByRole = role;
        await this.state.storage.put('timeControl', submittedTimeControl);
        timeControl = submittedTimeControl;
      }

      if (!timeControl) {
        safeSend(ws, { type: 'error', code: 'TIME_CONTROL_REQUIRED', message: 'Vor dem Start muss eine Bedenkzeit gewählt werden.' });
        return;
      }

      if (timeControl.mode !== 'daily') {
        const active = await this.getActivePlayers();
        if (!active.black.connected) {
          safeSend(ws, { type: 'error', code: 'BLACK_NOT_CONNECTED', message: 'Schwarz ist noch nicht verbunden.' });
          return;
        }
      }

      if (timeControl.mode === 'daily') {
        const securePlayers = await this.getSecurePlayers();
        const whiteRegistered = !!(securePlayers.white && securePlayers.white.userId);
        const blackRegistered = !!(securePlayers.black && securePlayers.black.userId);
        if (!whiteRegistered || !blackRegistered) {
          safeSend(ws, {
            type: 'error',
            code: 'DAILY_BOTH_ACCOUNTS_REQUIRED',
            message: 'Daily Chess startet automatisch, sobald beide Spielerplätze mit registrierten Accounts angenommen wurden.'
          });
          return;
        }
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
        ended: false,
        endedAt: null,
        endReason: null,
        winner: null,
        result: '*',
        gameSetup,
        playStatsCounted: false,
        playStatsCountedAt: null
      };
      const clock = makeInitialClock(timeControl, now);
      await this.state.storage.put('gameSetup', gameSetup);
      await this.state.storage.put('game', game);
      await this.state.storage.put('moves', []);
      await this.state.storage.put('clock', clock);
      await this.state.storage.delete('drawOffer');
      await this.scheduleClockAlarm(clock, now);
      await this.syncDailyGameIndex();

      safeSend(ws, {
        type: 'start_game_ack',
        ok: true,
        game: safeGameForClient(game),
        gameSetup: safeSetupForClient(gameSetup),
        timeControl: safeTimeControlForClient(timeControl),
        moves: [],
        clock: clockPayload(clock, now),
        serverNow: now
      });
      await this.broadcastRoomState('room_state');
      return;
    }

    if (data.type === 'offer_draw') {
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type: 'error', code: 'NOT_A_PLAYER', message: 'Nur Spieler können Remis anbieten.' });
        return;
      }

      const timedState = await this.refreshTimedGameState(Date.now());
      const game = timedState.game || { started: false, ended: false };
      if (!game.started) {
        safeSend(ws, { type: 'error', code: 'GAME_NOT_STARTED', message: 'Die Partie wurde noch nicht gestartet.' });
        return;
      }
      if (game.ended) {
        safeSend(ws, { type: 'error', code: 'GAME_ALREADY_ENDED', message: 'Die Partie ist bereits beendet.' });
        await this.sendRoomState(ws, 'room_state');
        return;
      }

      const existingOffer = (await this.state.storage.get('drawOffer')) || null;
      if (existingOffer && existingOffer.byRole === role) {
        safeSend(ws, { type: 'draw_offer', ok: true, drawOffer: safeDrawOfferForClient(existingOffer), message: 'Remisangebot ist bereits offen.', serverNow: Date.now() });
        await this.broadcastRoomState('draw_offer');
        return;
      }
      if (existingOffer && existingOffer.byRole && existingOffer.byRole !== role) {
        safeSend(ws, { type: 'error', code: 'DRAW_OFFER_PENDING', message: 'Es liegt bereits ein Remisangebot des Gegners vor.' });
        await this.sendRoomState(ws, 'room_state');
        return;
      }

      const now = Date.now();
      const drawOffer = {
        offered: true,
        byRole: role,
        offeredAt: new Date(now).toISOString(),
        serverNow: now
      };
      await this.state.storage.put('drawOffer', drawOffer);
      safeSend(ws, { type: 'draw_offer', ok: true, drawOffer: safeDrawOfferForClient(drawOffer), serverNow: now });
      await this.broadcastRoomState('draw_offer');
      return;
    }

    if (data.type === 'respond_draw') {
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type: 'error', code: 'NOT_A_PLAYER', message: 'Nur Spieler können auf ein Remisangebot antworten.' });
        return;
      }

      const timedState = await this.refreshTimedGameState(Date.now());
      let game = timedState.game || { started: false, ended: false };
      if (!game.started) {
        safeSend(ws, { type: 'error', code: 'GAME_NOT_STARTED', message: 'Die Partie wurde noch nicht gestartet.' });
        return;
      }
      if (game.ended) {
        safeSend(ws, { type: 'error', code: 'GAME_ALREADY_ENDED', message: 'Die Partie ist bereits beendet.' });
        await this.sendRoomState(ws, 'room_state');
        return;
      }

      const drawOffer = (await this.state.storage.get('drawOffer')) || null;
      if (!drawOffer || !drawOffer.byRole) {
        safeSend(ws, { type: 'error', code: 'NO_DRAW_OFFER', message: 'Es liegt kein Remisangebot vor.' });
        await this.sendRoomState(ws, 'room_state');
        return;
      }
      if (drawOffer.byRole === role) {
        safeSend(ws, { type: 'error', code: 'CANNOT_ACCEPT_OWN_DRAW_OFFER', message: 'Das eigene Remisangebot kann nicht selbst angenommen werden.' });
        await this.sendRoomState(ws, 'room_state');
        return;
      }

      const action = String(data.action || data.response || '').toLowerCase();
      const now = Date.now();
      if (action === 'accept' || action === 'accepted') {
        let clock = (await this.state.storage.get('clock')) || null;
        if (clock) {
          clock = advanceClock(clock, now);
          if (clock.timeLost) {
            await this.refreshTimedGameState(now);
            safeSend(ws, { type: 'error', code: 'TIME_LOST', message: 'Die Bedenkzeit ist bereits abgelaufen.' });
            await this.broadcastRoomState('game_finished');
            return;
          }
          clock.running = false;
          clock.loser = null;
          clock.winner = null;
          clock.lastTs = now;
          clock.updatedAt = now;
          await this.state.storage.put('clock', clock);
        }
        game = finishGameState(game, 'draw_agreed', null, now);
        game.result = '1/2-1/2';
        await this.state.storage.put('game', game);
        await this.state.storage.delete('drawOffer');
        try { await this.state.storage.deleteAlarm(); } catch (_) {}
        await this.syncDailyGameIndex();
        safeSend(ws, { type: 'draw_response', ok: true, action: 'accept', game: safeGameForClient(game), drawOffer: null, clock: clockPayload(clock, now), serverNow: now });
        await this.broadcastRoomState('game_finished');
        return;
      }

      if (action === 'reject' || action === 'decline' || action === 'rejected' || action === 'declined') {
        await this.state.storage.delete('drawOffer');
        const clock = timedState.clock || (await this.state.storage.get('clock')) || null;
        if (clock && clock.running && !clock.timeLost) await this.scheduleClockAlarm(clock, now);
        safeSend(ws, { type: 'draw_response', ok: true, action: 'reject', drawOffer: null, serverNow: now });
        await this.broadcastRoomState('draw_response');
        return;
      }

      safeSend(ws, { type: 'error', code: 'INVALID_DRAW_RESPONSE', message: 'Ungültige Antwort auf das Remisangebot.' });
      return;
    }

    if (data.type === 'resign') {
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type: 'error', code: 'NOT_A_PLAYER', message: 'Nur Spieler können aufgeben.' });
        return;
      }

      const timedState = await this.refreshTimedGameState(Date.now());
      let game = timedState.game || { started: false, ended: false };
      if (!game.started) {
        safeSend(ws, { type: 'error', code: 'GAME_NOT_STARTED', message: 'Die Partie wurde noch nicht gestartet.' });
        return;
      }
      if (game.ended) {
        safeSend(ws, { type: 'error', code: 'GAME_ALREADY_ENDED', message: 'Die Partie ist bereits beendet.' });
        await this.sendRoomState(ws, 'room_state');
        return;
      }

      const now = Date.now();
      const winner = opposite(role);
      let clock = (await this.state.storage.get('clock')) || null;
      if (clock) {
        clock = advanceClock(clock, now);
        if (clock.timeLost) {
          await this.refreshTimedGameState(now);
          safeSend(ws, { type: 'error', code: 'TIME_LOST', message: 'Die Bedenkzeit ist bereits abgelaufen.' });
          await this.broadcastRoomState('game_finished');
          return;
        }
        clock.running = false;
        clock.loser = role;
        clock.winner = winner;
        clock.lastTs = now;
        clock.updatedAt = now;
        await this.state.storage.put('clock', clock);
      }
      game = finishGameState(game, 'resignation', winner, now);
      await this.state.storage.put('game', game);
      await this.state.storage.delete('drawOffer');
      try { await this.state.storage.deleteAlarm(); } catch (_) {}
      await this.syncDailyGameIndex();
      safeSend(ws, { type: 'resignation', ok: true, byRole: role, winner, game: safeGameForClient(game), drawOffer: null, clock: clockPayload(clock, now), serverNow: now });
      await this.broadcastRoomState('game_finished');
      return;
    }

    if (data.type === 'move') {
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type: 'error', code: 'NOT_A_PLAYER', message: 'Nur Spieler können Züge senden.' });
        return;
      }

      const timedState = await this.refreshTimedGameState(Date.now());
      let game = timedState.game || { started: false, ended: false };
      if (!game.started) {
        safeSend(ws, { type: 'error', code: 'GAME_NOT_STARTED', message: 'Die Partie wurde noch nicht gestartet.' });
        return;
      }
      if (game.ended) {
        safeSend(ws, { type: 'error', code: 'GAME_ALREADY_ENDED', message: 'Die Partie ist bereits beendet.' });
        await this.sendRoomState(ws, 'room_state');
        return;
      }

      const timeControl = (await this.state.storage.get('timeControl')) || null;
      if (!timeControl) {
        safeSend(ws, { type: 'error', code: 'TIME_CONTROL_REQUIRED', message: 'Keine Bedenkzeit im Raum gespeichert.' });
        return;
      }

      const moves = (await this.state.storage.get('moves')) || [];
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

      const gameSetup = cleanGameSetup((await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null);
      let validation;
      try {
        validation = validateMoveOnServer(moves, incoming, gameSetup);
      } catch (err) {
        safeSend(ws, {
          type: 'error',
          code: 'SERVER_MOVE_HISTORY_INVALID',
          message: err && err.message ? err.message : 'Server-Zugliste konnte nicht geprüft werden.'
        });
        await this.sendRoomState(ws, 'room_state');
        return;
      }

      if (!validation.ok) {
        safeSend(ws, { type: 'error', code: validation.code, message: validation.message });
        await this.sendRoomState(ws, 'room_state');
        return;
      }

      if (role !== validation.before.turn) {
        safeSend(ws, {
          type: 'error',
          code: 'NOT_YOUR_TURN',
          message: validation.before.turn === 'w' ? 'Weiß ist am Zug.' : 'Schwarz ist am Zug.'
        });
        return;
      }

      let clock = timedState.clock || (await this.state.storage.get('clock')) || makeInitialClock(timeControl, Date.parse(game.startedAt) || Date.now());
      const now = Date.now();
      clock = advanceClock(clock, now);
      if (!clock || clock.timeLost || game.ended) {
        await this.refreshTimedGameState(now);
        safeSend(ws, {
          type: 'error',
          code: 'TIME_LOST',
          message: 'Die Bedenkzeit ist abgelaufen.',
          game: safeGameForClient(game),
          clock: clockPayload(clock, now),
          serverNow: now
        });
        await this.broadcastRoomState('game_finished');
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

      const move = {
        ply,
        side: role,
        from: validation.move.from,
        to: validation.move.to,
        promotion: validation.move.promotion || null,
        san: validation.move.san,
        piece: validation.move.piece,
        taken: validation.move.taken,
        messageId: data.messageId || incoming.clientMessageId || null,
        receivedAt: new Date(now).toISOString(),
        serverNow: now
      };

      if (validation.gameOver) {
        clock.running = false;
        clock.timeLost = false;
        clock.loser = null;
        clock.winner = validation.gameOver.winner || null;
        game = finishGameState(game, validation.gameOver.type, validation.gameOver.winner || null, now);
        game.result = resultFromGameOver(validation.gameOver);
      } else {
        const nextRole = opposite(role);
        if (timeControl.mode === 'daily') {
          clock[nextRole + 'Ms'] = Math.max(0, Math.floor(Number(timeControl.baseSeconds || 0) * 1000));
        } else {
          clock[role + 'Ms'] = Math.max(0, clock[role + 'Ms'] + Math.max(0, Number(timeControl.incrementSeconds || 0) * 1000));
        }
        clock.turn = nextRole;
        clock.running = true;
        clock.timeLost = false;
        clock.loser = null;
        clock.winner = null;
      }
      clock.lastTs = now;
      clock.updatedAt = now;

      if (!game.playStatsCounted) {
        try {
          const counted = await incrementGamerStat(this.env, 'games_played');
          if (counted) {
            game.playStatsCounted = true;
            game.playStatsCountedAt = new Date(now).toISOString();
          }
        } catch (_) {
          /* Die Partie darf nicht scheitern, nur weil der Statistikzähler nicht verfügbar ist. */
        }
      }

      const openDrawOffer = (await this.state.storage.get('drawOffer')) || null;
      let outgoingDrawOffer = openDrawOffer;
      if (validation.gameOver || (openDrawOffer && openDrawOffer.byRole && openDrawOffer.byRole !== role)) {
        await this.state.storage.delete('drawOffer');
        outgoingDrawOffer = null;
      }

      moves.push(move);
      await this.state.storage.put('moves', moves);
      await this.state.storage.put('clock', clock);
      await this.state.storage.put('game', game);
      if (game.ended) {
        try { await this.state.storage.deleteAlarm(); } catch (_) {}
      } else {
        await this.scheduleClockAlarm(clock, now);
      }
      await this.syncDailyGameIndex();

      safeSend(ws, {
        type: 'move_ack',
        ok: true,
        messageId: data.messageId || incoming.clientMessageId || null,
        move: safeMoveForClient(move),
        game: safeGameForClient(game),
        drawOffer: safeDrawOfferForClient(outgoingDrawOffer),
        movesCount: moves.length,
        clock: clockPayload(clock, now),
        serverNow: now
      });
      await this.broadcastMove(move, data.messageId || incoming.clientMessageId || null, clock, game);
      return;
    }

    safeSend(ws, { type: 'error', code: 'UNKNOWN_MESSAGE_TYPE', message: 'Unbekannter Nachrichtentyp: ' + String(data.type || '') });
  }

  async webSocketClose() {
    const cancellation = await this.state.storage.get('cancelled');
    if (!cancellation || !cancellation.cancelled) await this.broadcastRoomState('lobby');
  }

  async webSocketError() {
    const cancellation = await this.state.storage.get('cancelled');
    if (!cancellation || !cancellation.cancelled) await this.broadcastRoomState('lobby');
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
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization'
        }
      });
    }

    if (url.pathname.startsWith('/api/')) {
      return handleAuthApi(request, env, url);
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
      endpoints: ['/health', '/api/register', '/api/login', '/api/logout', '/api/me', 'POST /api/account/username', 'POST /api/account/email', 'POST /api/account/password', 'DELETE /api/account', '/api/presence', '/api/daily-games', '/api/daily-games/ROOM_ID/pgn', 'DELETE /api/daily-games/ROOM_ID/history', 'DELETE /api/daily-games/ROOM_ID', '/api/members/search?q=NAME', '/api/members/list', '/api/stats', '/api/stats/visit', 'DELETE /api/admin/users/USER_ID', '/ws?room=ROOM_ID'],
      features: ['lobby', 'roles', 'invite_color_choice', 'guest_display_names', 'accounts_d1', 'account_self_service', 'member_search', 'member_list', 'member_presence', 'daily_opponent_presence', 'in_game_presence', 'admin_user_delete', 'mailto_invitations', 'time_control', 'game_start', 'move_sync', 'server_clock', 'server_move_validation', 'draw_offer', 'resignation', 'secure_seat_tokens', 'server_time_finalization', 'durable_object_clock_alarm', 'daily_chess', 'daily_game_list', 'daily_game_history', 'daily_history_archive', 'daily_pgn_download', 'daily_invitation_cancel', 'cancelled_room_tombstone', 'registered_account_seat_reclaim', 'persistent_room_chat', 'freestyle960'],
      note: 'Diese Stufe synchronisiert Lobby, Rollen, Gast-/Account-Anzeigenamen, Mitgliedersuche, Mitgliederliste mit Online-Status, Daily-Partienübersicht, persönliche Accountverwaltung, Admin-Userlöschung, vorbereitete Mailprogramm-Einladungen, Bedenkzeit, Partiestart, Züge, eine servergeführte Uhr, einen dauerhaft gespeicherten Raum-Chat und prüft Züge serverseitig auf Legalität.'
    });
  }
};

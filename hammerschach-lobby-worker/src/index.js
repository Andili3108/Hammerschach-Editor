import { connect } from 'cloudflare:sockets';

const DEFAULT_GAMER_PUBLIC_URL = 'https://www.andili.de/page-hammerschach-gamer.html';

function configuredGamerPublicUrl(env) {
  return String((env && env.GAMER_PUBLIC_URL) || DEFAULT_GAMER_PUBLIC_URL).trim();
}

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

function privateJson(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      ...(init.headers || {})
    }
  });
}

function cleanRoomId(value) {
  const room = String(value || '').trim();
  return /^[A-Za-z0-9_-]{3,64}$/.test(room) ? room : '';
}

function cleanPublicWatchId(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{20,96}$/.test(token) ? token : '';
}

function cleanPlayerId(value) {
  const player = String(value || '').trim();
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(player) ? player : crypto.randomUUID();
}

function cleanGuestPlayerId(value) {
  const playerId = cleanPlayerId(value);
  // IDs mit "u_" sind ausschließlich für serverseitig bestätigte Accounts reserviert.
  // Ein Gast darf dadurch niemals das Profil eines registrierten Mitglieds überschreiben.
  if (/^u_/i.test(playerId)) return cleanPlayerId('g_' + playerId);
  return playerId;
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


const GLOBAL_CHAT_HISTORY_MAX = 200;
const GLOBAL_CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const GLOBAL_CHAT_SEND_COOLDOWN_MS = 3000;

function cleanGlobalChatMessageId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_.:-]{8,100}$/.test(id) ? id : '';
}

async function globalChatSenderKey(userId) {
  const hash = await sha256Hex('hammerschach-global-chat:' + String(userId || ''));
  return hash.slice(0, 24);
}

function normalizeStoredGlobalChatMessage(value) {
  if (!value || typeof value !== 'object') return null;
  const text = cleanChatText(value.text || value.message);
  const id = cleanGlobalChatMessageId(value.id || value.messageId);
  const senderUserId = String(value.senderUserId || '').trim().slice(0, 128);
  const senderName = cleanDisplayName(value.senderName || value.name || value.username || '');
  if (!text || !id || !senderUserId || !senderName) return null;
  const parsedTime = new Date(value.sentAt || value.time || Date.now());
  const sentAt = Number.isNaN(parsedTime.getTime()) ? new Date().toISOString() : parsedTime.toISOString();
  return {
    id,
    messageId:id,
    senderUserId,
    senderName,
    senderKey:String(value.senderKey || '').slice(0, 40),
    text,
    sentAt
  };
}

function safeGlobalChatMessageForClient(value, viewerUserId = '') {
  const message = normalizeStoredGlobalChatMessage(value);
  if (!message) return null;
  return {
    id:message.id,
    messageId:message.id,
    senderName:message.senderName,
    senderKey:message.senderKey,
    text:message.text,
    sentAt:message.sentAt,
    mine:!!(viewerUserId && String(viewerUserId) === message.senderUserId)
  };
}

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
    row.is_admin === 1 || row.is_admin === true || String(row.is_admin || '') === '1' || row.isAdmin === true ||
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


const DURABLE_BACKUP_FORMAT = 'hammerschach-durable-object-backup';
const DURABLE_BACKUP_FORMAT_VERSION = 1;
const DURABLE_BACKUP_INTERNAL_PATH = '/__backup/export';

function backupRequestIsAuthorized(request, env) {
  const configured = String((env && env.DO_BACKUP_TOKEN) || '').trim();
  const provided = bearerTokenFromRequest(request);
  return configured.length >= 32 && provided.length >= 32 && timingSafeStringEqual(provided, configured);
}

function privateBackupNotFound() {
  return new Response(null, {
    status:404,
    headers:{
      'cache-control':'no-store, max-age=0',
      'x-content-type-options':'nosniff'
    }
  });
}

function encodeDurableBackupValue(value, ancestors = new WeakSet()) {
  if (value === null) return null;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') {
    if (Number.isFinite(value) && !Object.is(value, -0)) return value;
    return {
      __hammerschachType:'number',
      value:Number.isNaN(value) ? 'NaN' : (value === Infinity ? 'Infinity' : (value === -Infinity ? '-Infinity' : '-0'))
    };
  }
  if (type === 'undefined') return {__hammerschachType:'undefined'};
  if (type === 'bigint') return {__hammerschachType:'bigint', value:value.toString()};
  if (type !== 'object') throw new TypeError('Nicht unterstützter Durable-Object-Wert: ' + type);
  if (ancestors.has(value)) throw new TypeError('Zyklische Durable-Object-Werte können nicht exportiert werden.');
  ancestors.add(value);
  try {
    if (value instanceof Date) {
      return {__hammerschachType:'date', value:value.toISOString()};
    }
    if (value instanceof RegExp) {
      return {__hammerschachType:'regexp', source:value.source, flags:value.flags};
    }
    if (value instanceof ArrayBuffer) {
      return {__hammerschachType:'array-buffer', encoding:'base64url', value:bytesToBase64Url(new Uint8Array(value))};
    }
    if (ArrayBuffer.isView(value)) {
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return {
        __hammerschachType:'typed-array',
        constructor:value.constructor && value.constructor.name ? value.constructor.name : 'Uint8Array',
        encoding:'base64url',
        value:bytesToBase64Url(bytes)
      };
    }
    if (Array.isArray(value)) {
      return {__hammerschachType:'array', value:value.map(item => encodeDurableBackupValue(item, ancestors))};
    }
    if (value instanceof Map) {
      return {
        __hammerschachType:'map',
        value:Array.from(value.entries(), ([key, item]) => [
          encodeDurableBackupValue(key, ancestors),
          encodeDurableBackupValue(item, ancestors)
        ])
      };
    }
    if (value instanceof Set) {
      return {__hammerschachType:'set', value:Array.from(value.values(), item => encodeDurableBackupValue(item, ancestors))};
    }
    return {
      __hammerschachType:'object',
      value:Object.entries(value).map(([key, item]) => [key, encodeDurableBackupValue(item, ancestors)])
    };
  } finally {
    ancestors.delete(value);
  }
}

function collectVerifiedRoomNameCandidates(value, candidates, seen, budget) {
  if (!budget || budget.remaining <= 0) return;
  budget.remaining -= 1;

  if (typeof value === 'string') {
    const candidate = cleanRoomId(value);
    if (candidate) candidates.add(candidate);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) collectVerifiedRoomNameCandidates(item, candidates, seen, budget);
      return;
    }
    if (value instanceof Map) {
      for (const [key, item] of value.entries()) {
        collectVerifiedRoomNameCandidates(key, candidates, seen, budget);
        collectVerifiedRoomNameCandidates(item, candidates, seen, budget);
      }
      return;
    }
    if (value instanceof Set) {
      for (const item of value.values()) collectVerifiedRoomNameCandidates(item, candidates, seen, budget);
      return;
    }
    if (value instanceof Date || value instanceof RegExp || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return;
    for (const [key, item] of Object.entries(value)) {
      collectVerifiedRoomNameCandidates(key, candidates, seen, budget);
      collectVerifiedRoomNameCandidates(item, candidates, seen, budget);
    }
  } finally {
    seen.delete(value);
  }
}

function verifiedGameRoomNameFromStoredValues(stored, env, state) {
  if (!stored || !env || !env.GAME_ROOM || !state || !state.id) return '';
  const expectedId = String(state.id);
  const candidates = new Set();
  const seen = new WeakSet();
  const budget = {remaining:20000};

  for (const [key, value] of stored.entries()) {
    collectVerifiedRoomNameCandidates(key, candidates, seen, budget);
    collectVerifiedRoomNameCandidates(value, candidates, seen, budget);
    if (budget.remaining <= 0) break;
  }

  const verified = [];
  for (const candidate of candidates) {
    try {
      if (String(env.GAME_ROOM.idFromName(candidate)) === expectedId) verified.push(candidate);
    } catch (_) {}
  }
  const unique = Array.from(new Set(verified));
  if (unique.length > 1) throw new Error('Mehrere verifizierte logische Namen wurden in einem GAME_ROOM gefunden.');
  return unique[0] || '';
}

async function durableObjectBackupDocument(state, env, className, logicalName = '') {
  if (state.storage && typeof state.storage.sync === 'function') await state.storage.sync();
  const stored = await state.storage.list();
  const entries = Array.from(stored.entries(), ([key, value]) => ({
    key:String(key),
    value:encodeDurableBackupValue(value)
  }));

  let alarmScheduledAt = null;
  try {
    const alarm = await state.storage.getAlarm();
    if (alarm !== null && alarm !== undefined && Number.isFinite(Number(alarm))) alarmScheduledAt = Number(alarm);
  } catch (_) {}

  let pitrBookmark = null;
  try {
    if (typeof state.storage.getCurrentBookmark === 'function') pitrBookmark = await state.storage.getCurrentBookmark();
  } catch (_) {}

  let databaseSizeBytes = null;
  try {
    const size = state.storage.sql && state.storage.sql.databaseSize;
    if (Number.isFinite(Number(size))) databaseSizeBytes = Number(size);
  } catch (_) {}

  const storedRoomId = stored.has('roomId') ? cleanRoomId(stored.get('roomId')) : '';
  const requestedLogicalName = className === 'GameRoom' ? cleanRoomId(logicalName) : String(logicalName || '').trim();
  const derivedLogicalName = className === 'GameRoom' && !storedRoomId && !requestedLogicalName
    ? verifiedGameRoomNameFromStoredValues(stored, env, state)
    : '';
  const resolvedLogicalName = className === 'GameRoom'
    ? (storedRoomId || requestedLogicalName || derivedLogicalName)
    : requestedLogicalName;
  const logicalNameSource = className === 'GameRoom'
    ? (storedRoomId
        ? 'storage'
        : (requestedLogicalName
            ? 'verified-name-map'
            : (derivedLogicalName ? 'verified-stored-value' : 'unresolved')))
    : (resolvedLogicalName ? 'fixed-name' : 'unresolved');
  return {
    format:DURABLE_BACKUP_FORMAT,
    formatVersion:DURABLE_BACKUP_FORMAT_VERSION,
    exportedAt:new Date().toISOString(),
    object:{
      className,
      durableObjectId:state.id ? String(state.id) : '',
      logicalName:resolvedLogicalName,
      logicalNameSource,
      jurisdiction:state.id && state.id.jurisdiction ? String(state.id.jurisdiction) : null
    },
    storage:{
      encoding:'hammerschach-structured-clone-json-v1',
      keyCount:entries.length,
      entries
    },
    alarm:{scheduledAt:alarmScheduledAt},
    pitr:{bookmark:pitrBookmark},
    database:{sizeBytes:databaseSizeBytes}
  };
}

async function durableObjectBackupResponse(state, env, request, className, logicalName = '') {
  if (request.method !== 'POST' || !backupRequestIsAuthorized(request, env)) return privateBackupNotFound();
  try {
    const document = await durableObjectBackupDocument(state, env, className, logicalName);
    return privateJson(document, {
      status:200,
      headers:{
        'content-disposition':'attachment; filename="' + (className === 'GameRoom' ? ('game-room-' + (document.object.logicalName || document.object.durableObjectId || 'unknown')) : 'global-chat-members') + '.json"'
      }
    });
  } catch (error) {
    console.error('Durable-Object-Backup fehlgeschlagen', className, error && error.message ? error.message : String(error || 'unknown'));
    return privateJson({ok:false, code:'DURABLE_BACKUP_FAILED', message:'Das Durable Object konnte nicht vollständig exportiert werden.'}, {status:500});
  }
}

function cleanDurableObjectIdForBackup(value) {
  const id = String(value || '').trim();
  return id && id.length <= 256 && /^[A-Za-z0-9_-]+$/.test(id) ? id : '';
}

function forwardedBackupRequest(request, logicalName = '') {
  const headers = new Headers();
  headers.set('authorization', request.headers.get('authorization') || '');
  headers.set('x-hammerschach-internal-backup', '1');
  const cleanLogicalName = cleanRoomId(logicalName);
  if (cleanLogicalName) headers.set('x-hammerschach-backup-logical-name', cleanLogicalName);
  return new Request('https://durable-object.internal' + DURABLE_BACKUP_INTERNAL_PATH, {
    method:'POST',
    headers
  });
}

async function durableObjectBackupRoomNameMap(env) {
  if (!env || !env.DB || !env.GAME_ROOM) {
    throw new Error('D1 oder GAME_ROOM ist für die Namenszuordnung nicht konfiguriert.');
  }
  const roomTables = [
    'daily_games',
    'daily_game_archives',
    'public_games',
    'open_game_offers',
    'rated_games',
    'account_game_rooms',
    'invitation_email_log',
    'email_notification_log',
    'moderation_reports'
  ];
  const mapped = new Map();
  for (const table of roomTables) {
    try {
      const result = await env.DB.prepare(
        `SELECT DISTINCT room_id FROM ${table} WHERE room_id IS NOT NULL AND TRIM(room_id) <> ''`
      ).all();
      for (const row of (result && Array.isArray(result.results) ? result.results : [])) {
        const roomId = cleanRoomId(row && row.room_id);
        if (!roomId) continue;
        const durableObjectId = String(env.GAME_ROOM.idFromName(roomId));
        const existing = mapped.get(durableObjectId) || {durableObjectId, logicalName:roomId, sources:[]};
        if (existing.logicalName !== roomId) throw new Error('Widersprüchliche Raumzuordnung für Durable-Object-ID ' + durableObjectId + '.');
        if (!existing.sources.includes(table)) existing.sources.push(table);
        mapped.set(durableObjectId, existing);
      }
    } catch (_) {
      // Tabellen aus älteren Installationsständen dürfen fehlen.
    }
  }
  // Der Rating-Dienst verwendet absichtlich dieselbe Durable-Object-Klasse wie
  // normale Spielräume, besitzt aber keinen gespeicherten roomId-Schlüssel und
  // taucht deshalb nicht in den D1-Raumtabellen auf. Der feste Objektname wird
  // nur dann in die portable Namenszuordnung aufgenommen, wenn seine ID direkt
  // aus genau diesem Namen berechnet wurde.
  const ratingServiceLogicalName = cleanRoomId(RATING_SERVICE_ROOM);
  if (!ratingServiceLogicalName) {
    throw new Error('Der feste Objektname des Rating-Dienstes ist ungültig.');
  }
  const ratingServiceDurableObjectId = String(env.GAME_ROOM.idFromName(ratingServiceLogicalName));
  const ratingExisting = mapped.get(ratingServiceDurableObjectId);
  if (ratingExisting && ratingExisting.logicalName !== ratingServiceLogicalName) {
    throw new Error('Widersprüchliche Namenszuordnung für den Rating-Dienst.');
  }
  const ratingMapping = ratingExisting || {
    durableObjectId:ratingServiceDurableObjectId,
    logicalName:ratingServiceLogicalName,
    sources:[]
  };
  if (!ratingMapping.sources.includes('internal-rating-service')) {
    ratingMapping.sources.push('internal-rating-service');
  }
  mapped.set(ratingServiceDurableObjectId, ratingMapping);

  const objects = Array.from(mapped.values()).sort((a,b) => a.durableObjectId.localeCompare(b.durableObjectId));
  return {
    format:'hammerschach-game-room-name-map',
    formatVersion:1,
    generatedAt:new Date().toISOString(),
    roomCount:objects.length,
    objects
  };
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
  await ensureUserPublicProfilesTable(env);

  const escaped = escapeSqlLike(cleaned);
  const contains = '%' + escaped + '%';
  const prefix = escaped + '%';
  const onlineSince = presenceOnlineSinceIso();
  const result = await env.DB.prepare(
    `SELECT users.id, users.username, users.created_at,
            CASE WHEN presence.last_seen_at >= ? THEN 1 ELSE 0 END AS is_online,
            CASE WHEN COALESCE(public_profile.avatar_key, '') <> '' THEN 1 ELSE 0 END AS has_avatar,
            public_profile.avatar_updated_at
       FROM users
       LEFT JOIN user_presence presence ON presence.user_id = users.id
       LEFT JOIN user_public_profiles public_profile ON public_profile.user_id = users.id
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
    createdAt: row.created_at || null,
    isOnline: Number(row.is_online || 0) === 1,
    hasAvatar: Number(row.has_avatar || 0) === 1,
    avatarUpdatedAt: row.avatar_updated_at || null
  }));
}



async function listMembers(env, sessionUser, limit = 50) {
  if (!env || !env.DB || !sessionUser) return [];
  await ensureUserPresenceTable(env);
  await ensureUserPublicProfilesTable(env);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit || 50))));
  const onlineSince = presenceOnlineSinceIso();
  const result = await env.DB.prepare(
    `SELECT users.id, users.username, users.created_at,
            CASE WHEN presence.last_seen_at >= ? THEN 1 ELSE 0 END AS is_online,
            CASE WHEN COALESCE(public_profile.avatar_key, '') <> '' THEN 1 ELSE 0 END AS has_avatar,
            public_profile.avatar_updated_at
       FROM users
       LEFT JOIN user_presence presence ON presence.user_id = users.id
       LEFT JOIN user_public_profiles public_profile ON public_profile.user_id = users.id
      WHERE users.id <> ?
      ORDER BY is_online DESC, users.username_lc ASC
      LIMIT ?`
  ).bind(onlineSince, sessionUser.id, safeLimit).all();

  return (result && result.results ? result.results : []).map(row => ({
    id: row.id,
    username: row.username,
    createdAt: row.created_at || null,
    isOnline: Number(row.is_online || 0) === 1,
    hasAvatar: Number(row.has_avatar || 0) === 1,
    avatarUpdatedAt: row.avatar_updated_at || null
  }));
}


const PUBLIC_PROFILE_REAL_NAME_MAX = 60;
const PUBLIC_PROFILE_CLUB_MAX = 80;
const PUBLIC_PROFILE_ABOUT_MAX = 400;
const PUBLIC_PROFILE_DWZ_MIN = 100;
const PUBLIC_PROFILE_DWZ_MAX = 3500;
const AVATAR_TARGET_SIZE = 256;
const AVATAR_MAX_BYTES = 512 * 1024;
const AVATAR_UPLOAD_MAX_CONTENT_LENGTH = 700 * 1024;
const AVATAR_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
let userPublicProfilesTableReady = false;

async function ensureUserPublicProfilesTable(env) {
  if (!env || !env.DB) return false;
  if (userPublicProfilesTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS user_public_profiles (
       user_id TEXT PRIMARY KEY,
       real_name TEXT NOT NULL DEFAULT '',
       club_name TEXT NOT NULL DEFAULT '',
       dwz INTEGER,
       about TEXT NOT NULL DEFAULT '',
       avatar_key TEXT NOT NULL DEFAULT '',
       avatar_mime TEXT NOT NULL DEFAULT '',
       avatar_updated_at TEXT,
       updated_at TEXT NOT NULL
     )`
  ).run();
  const columnsResult = await env.DB.prepare(`PRAGMA table_info(user_public_profiles)`).all();
  const columns = columnsResult && Array.isArray(columnsResult.results) ? columnsResult.results : [];
  const columnNames = new Set(columns.map(column => String(column && column.name || '').toLowerCase()));
  const additions = [
    ['club_name', `ALTER TABLE user_public_profiles ADD COLUMN club_name TEXT NOT NULL DEFAULT ''`],
    ['avatar_key', `ALTER TABLE user_public_profiles ADD COLUMN avatar_key TEXT NOT NULL DEFAULT ''`],
    ['avatar_mime', `ALTER TABLE user_public_profiles ADD COLUMN avatar_mime TEXT NOT NULL DEFAULT ''`],
    ['avatar_updated_at', `ALTER TABLE user_public_profiles ADD COLUMN avatar_updated_at TEXT`]
  ];
  for (const [columnName, sql] of additions) {
    if (columnNames.has(columnName)) continue;
    try {
      await env.DB.prepare(sql).run();
    } catch (err) {
      const message = String(err && err.message || err || '').toLowerCase();
      if (!message.includes('duplicate column')) throw err;
    }
  }
  userPublicProfilesTableReady = true;
  return true;
}

function cleanPublicProfileUserId(value) {
  const id = String(value || '').trim();
  return (/^[A-Za-z0-9_-]{8,128}$/.test(id) || /^[0-9a-f-]{36}$/i.test(id)) ? id : '';
}

function cleanPublicProfileRealName(value) {
  return String(value || '')
    .replace(/[<>\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPublicProfileClub(value) {
  return String(value || '')
    .replace(/[<>\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPublicProfileAbout(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizePublicProfileInput(body) {
  const rawRealName = String(body && body.realName || '');
  const rawClubName = String(body && body.clubName || '');
  const rawAbout = String(body && body.about || '');
  const realName = cleanPublicProfileRealName(rawRealName);
  const clubName = cleanPublicProfileClub(rawClubName);
  const about = cleanPublicProfileAbout(rawAbout);
  if (realName.length > PUBLIC_PROFILE_REAL_NAME_MAX) {
    return { ok:false, code:'PROFILE_REAL_NAME_TOO_LONG', message:`Der echte Name darf höchstens ${PUBLIC_PROFILE_REAL_NAME_MAX} Zeichen enthalten.` };
  }
  if (clubName.length > PUBLIC_PROFILE_CLUB_MAX) {
    return { ok:false, code:'PROFILE_CLUB_TOO_LONG', message:`Der Vereinsname darf höchstens ${PUBLIC_PROFILE_CLUB_MAX} Zeichen enthalten.` };
  }
  if (about.length > PUBLIC_PROFILE_ABOUT_MAX) {
    return { ok:false, code:'PROFILE_ABOUT_TOO_LONG', message:`Der Text „Über mich“ darf höchstens ${PUBLIC_PROFILE_ABOUT_MAX} Zeichen enthalten.` };
  }
  const rawDwz = body && body.dwz;
  let dwz = null;
  if (!(rawDwz === null || rawDwz === undefined || String(rawDwz).trim() === '')) {
    const parsed = Number(rawDwz);
    if (!Number.isInteger(parsed) || parsed < PUBLIC_PROFILE_DWZ_MIN || parsed > PUBLIC_PROFILE_DWZ_MAX) {
      return { ok:false, code:'PROFILE_DWZ_INVALID', message:`Die DWZ muss eine ganze Zahl zwischen ${PUBLIC_PROFILE_DWZ_MIN} und ${PUBLIC_PROFILE_DWZ_MAX} sein.` };
    }
    dwz = parsed;
  }
  return { ok:true, profile:{ realName, clubName, dwz, about } };
}

function publicAvatarFields(row) {
  const avatarKey = String(row && row.avatar_key || '').trim();
  return {
    hasAvatar:!!avatarKey,
    avatarUpdatedAt:avatarKey && row && row.avatar_updated_at ? row.avatar_updated_at : null
  };
}

async function getUserPublicProfile(env, userId) {
  const id = cleanPublicProfileUserId(userId);
  if (!id || !(await ensureUserPublicProfilesTable(env))) {
    return { realName:'', clubName:'', dwz:null, about:'', hasAvatar:false, avatarUpdatedAt:null, updatedAt:null };
  }
  const row = await env.DB.prepare(
    `SELECT real_name, club_name, dwz, about, avatar_key, avatar_updated_at, updated_at
       FROM user_public_profiles
      WHERE user_id = ?
      LIMIT 1`
  ).bind(id).first();
  const storedDwz = row && row.dwz !== null && row.dwz !== undefined && String(row.dwz).trim() !== '' ? Number(row.dwz) : null;
  return {
    realName:cleanPublicProfileRealName(row && row.real_name),
    clubName:cleanPublicProfileClub(row && row.club_name),
    dwz:Number.isInteger(storedDwz) ? storedDwz : null,
    about:cleanPublicProfileAbout(row && row.about),
    ...publicAvatarFields(row),
    updatedAt:row && row.updated_at ? row.updated_at : null
  };
}

async function getUserAvatarRecord(env, userId) {
  const id = cleanPublicProfileUserId(userId);
  if (!id || !(await ensureUserPublicProfilesTable(env))) return { key:'', mime:'', updatedAt:null };
  const row = await env.DB.prepare(
    `SELECT avatar_key, avatar_mime, avatar_updated_at
       FROM user_public_profiles
      WHERE user_id = ?
      LIMIT 1`
  ).bind(id).first();
  return {
    key:String(row && row.avatar_key || '').trim(),
    mime:String(row && row.avatar_mime || '').trim().toLowerCase(),
    updatedAt:row && row.avatar_updated_at ? row.avatar_updated_at : null
  };
}

async function saveUserPublicProfile(env, userId, input) {
  const id = cleanPublicProfileUserId(userId);
  if (!id || !(await ensureUserPublicProfilesTable(env))) throw new Error('Profil-Datenbank ist momentan nicht verfügbar.');
  const normalized = normalizePublicProfileInput(input);
  if (!normalized.ok) return normalized;
  const profile = normalized.profile;
  const avatar = await getUserAvatarRecord(env, id);
  if (!profile.realName && !profile.clubName && profile.dwz === null && !profile.about && !avatar.key) {
    await env.DB.prepare(`DELETE FROM user_public_profiles WHERE user_id = ?`).bind(id).run();
    return { ok:true, profile:{ realName:'', clubName:'', dwz:null, about:'', hasAvatar:false, avatarUpdatedAt:null, updatedAt:null } };
  }
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_public_profiles (user_id, real_name, club_name, dwz, about, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       real_name = excluded.real_name,
       club_name = excluded.club_name,
       dwz = excluded.dwz,
       about = excluded.about,
       updated_at = excluded.updated_at`
  ).bind(id, profile.realName, profile.clubName, profile.dwz, profile.about, updatedAt).run();
  return { ok:true, profile:{ ...profile, hasAvatar:!!avatar.key, avatarUpdatedAt:avatar.updatedAt, updatedAt } };
}

function readUint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BE(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function bytesContainAscii(bytes, text) {
  const target = Array.from(String(text || '')).map(char => char.charCodeAt(0));
  if (!target.length || bytes.length < target.length) return false;
  outer: for (let i = 0; i <= bytes.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) if (bytes[i + j] !== target[j]) continue outer;
    return true;
  }
  return false;
}

function avatarImageInfo(arrayBuffer, declaredMime) {
  const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
  const declared = String(declaredMime || '').trim().toLowerCase();
  if (bytes.length < 24 || !AVATAR_ALLOWED_MIME.has(declared)) return null;

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { mime:'image/png', ext:'png', width:readUint32BE(bytes, 16), height:readUint32BE(bytes, 20), animated:bytesContainAscii(bytes, 'acTL') };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0x01) continue;
      if (marker === 0xd9 || marker === 0xda || offset + 1 >= bytes.length) break;
      const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
      const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
                    (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (isSof && segmentLength >= 7) {
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        return { mime:'image/jpeg', ext:'jpg', width, height };
      }
      offset += segmentLength;
    }
    return null;
  }

  const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      return { mime:'image/webp', ext:'webp', width:readUint24LE(bytes, 24) + 1, height:readUint24LE(bytes, 27) + 1, animated:!!(bytes[20] & 0x02) || bytesContainAscii(bytes, 'ANIM') || bytesContainAscii(bytes, 'ANMF') };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const b1 = bytes[21], b2 = bytes[22], b3 = bytes[23], b4 = bytes[24];
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      return { mime:'image/webp', ext:'webp', width, height, animated:false };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      const width = ((bytes[27] << 8) | bytes[26]) & 0x3fff;
      const height = ((bytes[29] << 8) | bytes[28]) & 0x3fff;
      return { mime:'image/webp', ext:'webp', width, height, animated:false };
    }
  }
  return null;
}

async function storeUserAvatar(env, userId, file) {
  const id = cleanPublicProfileUserId(userId);
  if (!id) return { ok:false, status:400, code:'INVALID_USER_ID', message:'Der Account konnte nicht zugeordnet werden.' };
  if (!env || !env.AVATARS || typeof env.AVATARS.put !== 'function') {
    return { ok:false, status:503, code:'AVATAR_STORAGE_NOT_CONFIGURED', message:'Der Avatar-Speicher ist noch nicht mit dem Worker verbunden.' };
  }
  if (!file || typeof file.arrayBuffer !== 'function') {
    return { ok:false, status:400, code:'AVATAR_FILE_MISSING', message:'Bitte ein Profilbild auswählen.' };
  }
  const declaredMime = String(file.type || '').trim().toLowerCase();
  if (!AVATAR_ALLOWED_MIME.has(declaredMime)) {
    return { ok:false, status:415, code:'AVATAR_TYPE_INVALID', message:'Erlaubt sind JPG-, PNG- und WebP-Bilder.' };
  }
  const size = Number(file.size || 0);
  if (!Number.isFinite(size) || size < 32 || size > AVATAR_MAX_BYTES) {
    return { ok:false, status:413, code:'AVATAR_TOO_LARGE', message:'Das fertig verarbeitete Profilbild darf höchstens 512 KB groß sein.' };
  }
  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > AVATAR_MAX_BYTES) {
    return { ok:false, status:413, code:'AVATAR_TOO_LARGE', message:'Das fertig verarbeitete Profilbild darf höchstens 512 KB groß sein.' };
  }
  const info = avatarImageInfo(arrayBuffer, declaredMime);
  if (!info || info.mime !== declaredMime) {
    return { ok:false, status:415, code:'AVATAR_CONTENT_INVALID', message:'Die Bilddatei ist beschädigt oder ihr Dateityp stimmt nicht.' };
  }
  if (info.animated) {
    return { ok:false, status:415, code:'AVATAR_ANIMATION_NOT_ALLOWED', message:'Animierte Profilbilder sind nicht erlaubt.' };
  }
  if (info.width !== AVATAR_TARGET_SIZE || info.height !== AVATAR_TARGET_SIZE) {
    return { ok:false, status:400, code:'AVATAR_DIMENSIONS_INVALID', message:`Das Profilbild muss auf ${AVATAR_TARGET_SIZE} × ${AVATAR_TARGET_SIZE} Pixel verarbeitet sein.` };
  }

  await ensureUserPublicProfilesTable(env);
  const previous = await getUserAvatarRecord(env, id);
  const updatedAt = new Date().toISOString();
  const key = `avatars/${id}/avatar-${crypto.randomUUID()}.${info.ext}`;
  try {
    await env.AVATARS.put(key, arrayBuffer, {
      httpMetadata:{ contentType:info.mime, cacheControl:'private, max-age=3600' },
      customMetadata:{ userId:id, purpose:'profile-avatar' }
    });
    await env.DB.prepare(
      `INSERT INTO user_public_profiles (user_id, avatar_key, avatar_mime, avatar_updated_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         avatar_key = excluded.avatar_key,
         avatar_mime = excluded.avatar_mime,
         avatar_updated_at = excluded.avatar_updated_at,
         updated_at = excluded.updated_at`
    ).bind(id, key, info.mime, updatedAt, updatedAt).run();
  } catch (error) {
    try { await env.AVATARS.delete(key); } catch (_) {}
    throw error;
  }
  if (previous.key && previous.key !== key) {
    try { await env.AVATARS.delete(previous.key); } catch (_) {}
  }
  return { ok:true, hasAvatar:true, avatarUpdatedAt:updatedAt };
}

async function deleteUserAvatar(env, userId, options = {}) {
  const id = cleanPublicProfileUserId(userId);
  if (!id) return { ok:false, status:400, code:'INVALID_USER_ID', message:'Der Account konnte nicht zugeordnet werden.' };
  await ensureUserPublicProfilesTable(env);
  const profileRow = await env.DB.prepare(
    `SELECT real_name, club_name, dwz, about, avatar_key
       FROM user_public_profiles
      WHERE user_id = ?
      LIMIT 1`
  ).bind(id).first();
  const key = String(profileRow && profileRow.avatar_key || '').trim();
  if (key && env && env.AVATARS && typeof env.AVATARS.delete === 'function') {
    try { await env.AVATARS.delete(key); } catch (error) {
      if (!options.bestEffort) throw error;
    }
  } else if (key && !options.bestEffort) {
    return { ok:false, status:503, code:'AVATAR_STORAGE_NOT_CONFIGURED', message:'Der Avatar-Speicher ist noch nicht mit dem Worker verbunden.' };
  }
  if (!profileRow) return { ok:true, hasAvatar:false, avatarUpdatedAt:null };
  const hasTextProfile = !!(
    cleanPublicProfileRealName(profileRow.real_name) ||
    cleanPublicProfileClub(profileRow.club_name) ||
    (profileRow.dwz !== null && profileRow.dwz !== undefined && String(profileRow.dwz).trim() !== '') ||
    cleanPublicProfileAbout(profileRow.about)
  );
  if (hasTextProfile) {
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE user_public_profiles
          SET avatar_key = '', avatar_mime = '', avatar_updated_at = NULL, updated_at = ?
        WHERE user_id = ?`
    ).bind(updatedAt, id).run();
  } else {
    await env.DB.prepare(`DELETE FROM user_public_profiles WHERE user_id = ?`).bind(id).run();
  }
  return { ok:true, hasAvatar:false, avatarUpdatedAt:null };
}

async function avatarResponseForMember(request, env, userId) {
  if (!env || !env.AVATARS || typeof env.AVATARS.get !== 'function') {
    return json({ ok:false, code:'AVATAR_STORAGE_NOT_CONFIGURED', message:'Der Avatar-Speicher ist noch nicht mit dem Worker verbunden.' }, { status:503 });
  }
  const avatar = await getUserAvatarRecord(env, userId);
  if (!avatar.key) return new Response(null, { status:404, headers:{'cache-control':'no-store'} });
  const object = await env.AVATARS.get(avatar.key);
  if (!object) return new Response(null, { status:404, headers:{'cache-control':'no-store'} });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', avatar.mime || headers.get('content-type') || 'application/octet-stream');
  headers.set('cache-control', 'private, max-age=3600');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-disposition', 'inline');
  headers.set('access-control-allow-origin', '*');
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  return new Response(object.body, { status:200, headers });
}

function publicMemberRatingsPayload(ratings) {
  const source = ratings && typeof ratings === 'object' ? ratings : {};
  const out = {};
  for (const item of RATING_TYPES) {
    const rating = source[item.key] || normalizeRatingRow(null, item.key);
    out[item.key] = {
      key:item.key,
      label:item.label,
      rating:Math.round(Number(rating && rating.rating || RATING_START)),
      games:Math.max(0, Math.floor(Number(rating && rating.games || 0))),
      wins:Math.max(0, Math.floor(Number(rating && rating.wins || 0))),
      draws:Math.max(0, Math.floor(Number(rating && rating.draws || 0))),
      losses:Math.max(0, Math.floor(Number(rating && rating.losses || 0))),
      provisional:!!(rating && rating.provisional),
      display:String(rating && rating.display || ratingDisplayValue(RATING_START, RATING_START_DEVIATION))
    };
  }
  return out;
}

async function loadMemberPublicProfile(env, targetUserId) {
  const id = cleanPublicProfileUserId(targetUserId);
  if (!id) return null;
  await ensureUserPresenceTable(env);
  const onlineSince = presenceOnlineSinceIso();
  const row = await env.DB.prepare(
    `SELECT users.id, users.username, users.created_at,
            CASE WHEN presence.last_seen_at >= ? THEN 1 ELSE 0 END AS is_online
       FROM users
       LEFT JOIN user_presence presence ON presence.user_id = users.id
      WHERE users.id = ?
      LIMIT 1`
  ).bind(onlineSince, id).first();
  if (!row) return null;
  return {
    id:row.id,
    username:row.username,
    createdAt:row.created_at || null,
    isOnline:Number(row.is_online || 0) === 1,
    profile:await getUserPublicProfile(env, row.id),
    ratings:publicMemberRatingsPayload(await getUserRatings(env, row.id))
  };
}



const INVITATION_EMAIL_MIN_INTERVAL_MS = 20 * 1000;
const INVITATION_EMAIL_DUPLICATE_WINDOW_MS = 5 * 60 * 1000;
const INVITATION_EMAIL_SENDER_HOURLY_LIMIT = 20;
const INVITATION_EMAIL_RECIPIENT_HOURLY_LIMIT = 12;
let invitationEmailLogTableReady = false;

async function ensureInvitationEmailLogTable(env) {
  if (!env || !env.DB) return false;
  if (invitationEmailLogTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS invitation_email_log (
       id TEXT PRIMARY KEY,
       sender_user_id TEXT NOT NULL,
       recipient_user_id TEXT NOT NULL,
       room_id TEXT NOT NULL,
       sent_at TEXT NOT NULL,
       mailjet_message_id TEXT
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_invitation_email_sender_time ON invitation_email_log (sender_user_id, sent_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_invitation_email_recipient_time ON invitation_email_log (recipient_user_id, sent_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_invitation_email_room_recipient ON invitation_email_log (room_id, recipient_user_id, sent_at)`).run();
  invitationEmailLogTableReady = true;
  return true;
}

function cleanInvitationRecipientUserId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(id) ? id : '';
}

function escapeEmailHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function configuredMailLogoUrl(env) {
  const explicit = String((env && env.MAIL_LOGO_URL) || '').trim();
  const candidates = [explicit];
  try {
    const publicUrl = configuredGamerPublicUrl(env);
    if (publicUrl) candidates.push(new URL('Gamer-Logo.png', publicUrl).toString());
  } catch (_) {}
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:') return url.toString();
    } catch (_) {}
  }
  return '';
}

function mailBrandHeaderHtml(env) {
  const logoUrl = configuredMailLogoUrl(env);
  if (!logoUrl) return '';
  const publicUrl = configuredGamerPublicUrl(env);
  const image = `<img src="${escapeEmailHtml(logoUrl)}" width="190" alt="Hammerschach-Gamer" style="display:block;width:190px;max-width:72%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;">`;
  const linked = publicUrl
    ? `<a href="${escapeEmailHtml(publicUrl)}" style="display:inline-block;text-decoration:none;border:0;">${image}</a>`
    : image;
  return `<div data-hammerschach-mail-logo="1" style="text-align:center;margin:0 0 22px;padding:2px 0 18px;border-bottom:1px solid #eee;">${linked}</div>`;
}

function applyMailBranding(env, mail) {
  if (!mail || !mail.ok || !mail.htmlPart) return mail;
  if (String(mail.htmlPart).includes('data-hammerschach-mail-logo=')) return mail;
  const header = mailBrandHeaderHtml(env);
  if (!header) return mail;
  let htmlPart = String(mail.htmlPart);
  const cardStart = htmlPart.indexOf('<div style="max-width:620px;');
  if (cardStart >= 0) {
    const cardOpenEnd = htmlPart.indexOf('>', cardStart);
    if (cardOpenEnd >= 0) htmlPart = htmlPart.slice(0, cardOpenEnd + 1) + header + htmlPart.slice(cardOpenEnd + 1);
  } else {
    htmlPart = htmlPart.replace(/<body\b[^>]*>/i, match => match + header);
  }
  return { ...mail, htmlPart };
}

function gamerInvitationUrl(env, roomId) {
  const configured = configuredGamerPublicUrl(env);
  if (!configured) return '';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    url.hash = '';
    url.search = '';
    url.searchParams.set('room', roomId);
    return url.toString();
  } catch (_) {
    return '';
  }
}

function invitationVariantLabel(setup) {
  if (!setup || typeof setup !== 'object') return '';
  const normalized = cleanGameSetup(setup);
  return normalized.variant === GAME_VARIANT_FREESTYLE
    ? `Freestyle · Stellung #${normalized.positionId}`
    : 'Klassisch';
}

function invitationTimeLabel(timeControl) {
  const normalized = cleanTimeControl(timeControl || null);
  return normalized && normalized.label ? normalized.label : '';
}

async function checkInvitationEmailRateLimit(env, senderUserId, recipientUserId, roomId) {
  if (!(await ensureInvitationEmailLogTable(env))) {
    return { ok:false, status:503, code:'INVITATION_LOG_UNAVAILABLE', message:'Der Einladungsversand ist momentan nicht verfügbar.' };
  }
  const now = Date.now();
  const minIntervalIso = new Date(now - INVITATION_EMAIL_MIN_INTERVAL_MS).toISOString();
  const duplicateIso = new Date(now - INVITATION_EMAIL_DUPLICATE_WINDOW_MS).toISOString();
  const hourIso = new Date(now - 60 * 60 * 1000).toISOString();

  const lastSender = await env.DB.prepare(
    `SELECT sent_at FROM invitation_email_log WHERE sender_user_id = ? AND sent_at >= ? ORDER BY sent_at DESC LIMIT 1`
  ).bind(senderUserId, minIntervalIso).first();
  if (lastSender) {
    return { ok:false, status:429, code:'INVITATION_TOO_FAST', message:'Bitte warte kurz, bevor du eine weitere Einladung sendest.' };
  }

  const duplicate = await env.DB.prepare(
    `SELECT id FROM invitation_email_log WHERE sender_user_id = ? AND recipient_user_id = ? AND room_id = ? AND sent_at >= ? LIMIT 1`
  ).bind(senderUserId, recipientUserId, roomId, duplicateIso).first();
  if (duplicate) {
    return { ok:false, status:429, code:'INVITATION_RECENTLY_SENT', message:'An dieses Mitglied wurde für diese Partie bereits vor Kurzem eine Einladung gesendet.' };
  }

  const senderCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM invitation_email_log WHERE sender_user_id = ? AND sent_at >= ?`
  ).bind(senderUserId, hourIso).first();
  if (Number(senderCountRow && senderCountRow.count || 0) >= INVITATION_EMAIL_SENDER_HOURLY_LIMIT) {
    return { ok:false, status:429, code:'INVITATION_SENDER_LIMIT', message:'Das stündliche Versandlimit wurde erreicht. Bitte versuche es später erneut.' };
  }

  const recipientCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM invitation_email_log WHERE recipient_user_id = ? AND sent_at >= ?`
  ).bind(recipientUserId, hourIso).first();
  if (Number(recipientCountRow && recipientCountRow.count || 0) >= INVITATION_EMAIL_RECIPIENT_HOURLY_LIMIT) {
    return { ok:false, status:429, code:'INVITATION_RECIPIENT_LIMIT', message:'Dieses Mitglied hat zuletzt bereits mehrere Einladungen erhalten. Bitte versuche es später erneut.' };
  }

  return { ok:true };
}

async function recordInvitationEmail(env, senderUserId, recipientUserId, roomId, mailjetMessageId) {
  if (!(await ensureInvitationEmailLogTable(env))) return false;
  const sentAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO invitation_email_log (id, sender_user_id, recipient_user_id, room_id, sent_at, mailjet_message_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), senderUserId, recipientUserId, roomId, sentAt, String(mailjetMessageId || '').slice(0, 120)).run();
  try {
    const pruneBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(`DELETE FROM invitation_email_log WHERE sent_at < ?`).bind(pruneBefore).run();
  } catch (_) {}
  return true;
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function wrapBase64(value, lineLength = 76) {
  const encoded = utf8ToBase64(value);
  const lines = [];
  for (let i = 0; i < encoded.length; i += lineLength) lines.push(encoded.slice(i, i + lineLength));
  return lines.join('\r\n');
}

function wrapExistingBase64(value, lineLength = 76) {
  const encoded = String(value || '').replace(/\s+/g, '');
  const lines = [];
  for (let i = 0; i < encoded.length; i += lineLength) lines.push(encoded.slice(i, i + lineLength));
  return lines.join('\r\n');
}

const MAIL_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;
const MAIL_ATTACHMENT_MAX_BASE64_LENGTH = Math.ceil(MAIL_ATTACHMENT_MAX_BYTES / 3) * 4 + 8;
const MAIL_ATTACHMENT_ALLOWED_TYPES = {
  'application/pdf':['pdf'],
  'image/jpeg':['jpg', 'jpeg'],
  'image/png':['png'],
  'image/webp':['webp']
};

function cleanMailAttachmentFilename(value) {
  const basename = String(value || '').split(/[\/\\]/).pop() || '';
  return basename
    .replace(/[\r\n\u0000-\u001F\u007F<>":|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function mailAttachmentExtension(filename) {
  const match = String(filename || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : '';
}

function normalizedBase64Content(value) {
  const raw = String(value || '');
  if (!raw || raw.length > MAIL_ATTACHMENT_MAX_BASE64_LENGTH + 256) return '';
  const compact = raw.replace(/\s+/g, '');
  if (!compact || compact.length > MAIL_ATTACHMENT_MAX_BASE64_LENGTH || compact.length % 4 === 1) return '';
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return '';
  return compact;
}

function decodedBase64ByteLength(base64) {
  const compact = String(base64 || '');
  if (!compact) return 0;
  let padding = 0;
  if (compact.endsWith('==')) padding = 2;
  else if (compact.endsWith('=')) padding = 1;
  return Math.floor(compact.length * 3 / 4) - padding;
}

function attachmentSignatureMatches(type, base64) {
  try {
    const prefix = atob(String(base64 || '').slice(0, 40));
    const bytes = Array.from(prefix, ch => ch.charCodeAt(0));
    if (type === 'application/pdf') return prefix.startsWith('%PDF-');
    if (type === 'image/jpeg') return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
    if (type === 'image/png') return bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
    if (type === 'image/webp') return prefix.slice(0, 4) === 'RIFF' && prefix.slice(8, 12) === 'WEBP';
  } catch (_) {}
  return false;
}

function normalizeMailAttachment(value) {
  if (!value) return { ok:true, attachment:null };
  const name = cleanMailAttachmentFilename(value.name || value.filename);
  const type = String(value.type || value.contentType || '').toLowerCase().trim();
  const extension = mailAttachmentExtension(name);
  const allowedExtensions = MAIL_ATTACHMENT_ALLOWED_TYPES[type];
  const base64 = normalizedBase64Content(value.base64 || value.base64Content || value.content);
  if (!name || !allowedExtensions || !allowedExtensions.includes(extension) || !base64) {
    return { ok:false, status:400, code:'INVALID_MAIL_ATTACHMENT', message:'Der Anhang ist ungültig. Erlaubt sind PDF, JPG, PNG und WebP.' };
  }
  const size = decodedBase64ByteLength(base64);
  if (!size || size > MAIL_ATTACHMENT_MAX_BYTES) {
    return { ok:false, status:400, code:'MAIL_ATTACHMENT_TOO_LARGE', message:'Der Anhang darf höchstens 3 MB groß sein.' };
  }
  if (!attachmentSignatureMatches(type, base64)) {
    return { ok:false, status:400, code:'MAIL_ATTACHMENT_TYPE_MISMATCH', message:'Dateityp und Dateiinhalt des Anhangs stimmen nicht überein.' };
  }
  const inline = value.inline === true && type.startsWith('image/');
  const contentId = inline
    ? String(value.contentId || 'hammerschach-member-image').replace(/[^A-Za-z0-9_.@-]/g, '').slice(0, 80) || 'hammerschach-member-image'
    : '';
  return { ok:true, attachment:{ name, type, size, base64, inline, contentId } };
}

function normalizeMailAttachments(value) {
  if (!value) return { ok:true, attachments:[] };
  const source = Array.isArray(value) ? value : [value];
  if (source.length > 1) {
    return { ok:false, status:400, code:'TOO_MANY_MAIL_ATTACHMENTS', message:'Pro Nachricht ist derzeit höchstens ein Anhang möglich.' };
  }
  const normalized = normalizeMailAttachment(source[0]);
  if (!normalized.ok) return normalized;
  return { ok:true, attachments:normalized.attachment ? [normalized.attachment] : [] };
}

function formatMailAttachmentSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} Byte`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / (1024 * 102.4)) / 10} MB`;
}

function encodeEmailHeader(value) {
  const cleaned = String(value || '').replace(/[\r\n]+/g, ' ').trim();
  if (!cleaned) return '';
  return `=?UTF-8?B?${utf8ToBase64(cleaned)}?=`;
}

function emailAddressHeader(name, email) {
  const safeEmail = normalizeEmail(email);
  const safeName = cleanDisplayName(name);
  return safeName ? `${encodeEmailHeader(safeName)} <${safeEmail}>` : `<${safeEmail}>`;
}

function prepareInvitationEmail(payload) {
  const recipientEmail = normalizeEmail(payload && payload.recipientEmail);
  const recipientName = cleanDisplayName(payload && payload.recipientName) || 'Schachfreund';
  const senderName = cleanDisplayName(payload && payload.senderName) || 'Ein Mitglied';
  const inviteUrl = String(payload && payload.inviteUrl || '').trim();
  const variantLabel = String(payload && payload.variantLabel || '').slice(0, 120);
  const timeLabel = String(payload && payload.timeLabel || '').slice(0, 120);
  const daily = !!(payload && payload.daily);
  const rated = !(payload && payload.rated === false);
  if (!recipientEmail || !inviteUrl) {
    return { ok:false, status:400, code:'INVALID_INVITATION_MAIL', message:'Die Einladungsmail konnte nicht vorbereitet werden.' };
  }

  const subject = `${senderName} lädt dich zu einer Schachpartie ein`;
  const detailLines = [];
  if (variantLabel) detailLines.push(`Spielmodus: ${variantLabel}`);
  if (timeLabel) detailLines.push(`Bedenkzeit: ${timeLabel}`);
  detailLines.push(`Wertung: ${rated ? 'Gewertet' : 'Ungewertet'}`);
  if (daily) detailLines.push('Hinweis: Daily Chess erfordert auf beiden Seiten einen registrierten und eingeloggten Account.');
  const detailText = detailLines.length ? `\n\n${detailLines.join('\n')}` : '';
  const textPart = `Hallo ${recipientName},\n\n${senderName} lädt dich zu einer Schachpartie auf Hammerschach ein.${detailText}\n\nPartie öffnen:\n${inviteUrl}\n\nDiese Nachricht wurde automatisch vom Hammerschach-Gamer versendet.\n\nViele Grüße\nHammerschach-Gamer`;

  const detailHtml = detailLines.length
    ? `<div style="margin:18px 0;padding:12px 14px;background:#f6f1f2;border:1px solid #e5d3d6;border-radius:10px;line-height:1.55;">${detailLines.map(line => escapeEmailHtml(line)).join('<br>')}</div>`
    : '';
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><h2 style="margin:0 0 18px;color:#843f46;">Einladung zu einer Schachpartie</h2><p>Hallo ${escapeEmailHtml(recipientName)},</p><p><strong>${escapeEmailHtml(senderName)}</strong> lädt dich zu einer Schachpartie auf Hammerschach ein.</p>${detailHtml}<p style="margin:22px 0;"><a href="${escapeEmailHtml(inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">Partie öffnen</a></p><p style="font-size:13px;color:#666;word-break:break-all;">Falls die Schaltfläche nicht funktioniert:<br>${escapeEmailHtml(inviteUrl)}</p><hr style="border:0;border-top:1px solid #eee;margin:22px 0;"><p style="font-size:12px;color:#777;">Diese Nachricht wurde automatisch vom Hammerschach-Gamer versendet.</p><p style="margin-bottom:0;">Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;

  return { ok:true, mailType:'invitation', recipientEmail, recipientName, senderName, subject, textPart, htmlPart };
}


function preparedMailFromPayload(payload, env) {
  const supplied = payload && payload.preparedMail;
  if (!supplied) return applyMailBranding(env, prepareInvitationEmail(payload));
  const recipientEmail = normalizeEmail(supplied.recipientEmail);
  const recipientName = cleanDisplayName(supplied.recipientName) || 'Schachfreund';
  const subject = String(supplied.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 180);
  const textPart = String(supplied.textPart || '').trim();
  const htmlPart = String(supplied.htmlPart || '').trim();
  const mailType = cleanMailLogType(supplied.mailType || payload && payload.mailType || 'transactional');
  const attachmentResult = normalizeMailAttachments(supplied.attachments || supplied.attachment || null);
  if (!attachmentResult.ok) return attachmentResult;
  if (!recipientEmail || !subject || !textPart || !htmlPart) {
    return { ok:false, status:400, code:'INVALID_PREPARED_MAIL', message:'Die automatische Nachricht konnte nicht vorbereitet werden.' };
  }
  return applyMailBranding(env, { ok:true, mailType, recipientEmail, recipientName, subject, textPart, htmlPart, attachments:attachmentResult.attachments });
}

async function sendMailjetInvitation(env, payload) {
  const apiKey = String((env && env.MAILJET_API_KEY) || '').trim();
  const secretKey = String((env && env.MAILJET_SECRET_KEY) || '').trim();
  const fromEmail = normalizeEmail((env && env.MAILJET_FROM_EMAIL) || '');
  const fromName = cleanDisplayName((env && env.MAILJET_FROM_NAME) || '') || 'Hammerschach-Gamer';
  if (!apiKey || !secretKey || !fromEmail) {
    return { ok:false, status:503, code:'MAIL_NOT_CONFIGURED', message:'Der automatische Mailversand ist noch nicht vollständig konfiguriert.' };
  }

  const mail = preparedMailFromPayload(payload, env);
  if (!mail.ok) return mail;

  const mailjetMessage = {
    From:{ Email:fromEmail, Name:fromName },
    To:[{ Email:mail.recipientEmail, Name:mail.recipientName }],
    Subject:mail.subject,
    TextPart:mail.textPart,
    HTMLPart:mail.htmlPart,
    TrackOpens:'disabled',
    TrackClicks:'disabled'
  };
  const normalAttachments = (mail.attachments || []).filter(item => !item.inline).map(item => ({
    ContentType:item.type,
    Filename:item.name,
    Base64Content:item.base64
  }));
  const inlineAttachments = (mail.attachments || []).filter(item => item.inline).map(item => ({
    ContentType:item.type,
    Filename:item.name,
    Base64Content:item.base64,
    ContentID:item.contentId
  }));
  if (normalAttachments.length) mailjetMessage.Attachments = normalAttachments;
  if (inlineAttachments.length) mailjetMessage.InlinedAttachments = inlineAttachments;

  let response;
  let result = null;
  try {
    response = await fetch('https://api.mailjet.com/v3.1/send', {
      method:'POST',
      headers:{
        'authorization':'Basic ' + btoa(apiKey + ':' + secretKey),
        'content-type':'application/json'
      },
      body:JSON.stringify({ Messages:[mailjetMessage] })
    });
    try { result = await response.json(); } catch (_) { result = null; }
  } catch (error) {
    console.error('Mailjet request failed', error && error.message ? error.message : String(error || 'unknown'));
    return { ok:false, status:502, code:'MAILJET_UNREACHABLE', message:'Mailjet ist momentan nicht erreichbar. Die E-Mail konnte nicht versendet werden.' };
  }

  const firstMessage = result && Array.isArray(result.Messages) ? result.Messages[0] : null;
  const success = !!(response && response.ok && firstMessage && String(firstMessage.Status || '').toLowerCase() === 'success');
  if (!success) {
    let safeDetail = '';
    try {
      const firstError = firstMessage && Array.isArray(firstMessage.Errors) ? firstMessage.Errors[0] : null;
      safeDetail = String(firstError && (firstError.ErrorMessage || firstError.ErrorCode) || '').slice(0, 240);
    } catch (_) {}
    console.error('Mailjet send rejected', response ? response.status : 0, safeDetail);
    return { ok:false, status:502, code:'MAILJET_SEND_FAILED', message:'Die E-Mail konnte nicht versendet werden.' };
  }

  const recipientResult = firstMessage && Array.isArray(firstMessage.To) ? firstMessage.To[0] : null;
  return {
    ok:true,
    status:200,
    provider:'mailjet',
    messageId:recipientResult && (recipientResult.MessageID || recipientResult.MessageUUID) ? String(recipientResult.MessageID || recipientResult.MessageUUID) : ''
  };
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label || 'Zeitüberschreitung')), timeoutMs);
    })
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

async function readSmtpResponse(reader, state, timeoutMs = 12000) {
  const lines = [];
  let responseCode = '';
  while (true) {
    let newlineIndex = state.buffer.indexOf('\n');
    while (newlineIndex < 0) {
      const chunk = await withTimeout(reader.read(), timeoutMs, 'SMTP-Antwort dauerte zu lange.');
      if (!chunk || chunk.done) throw new Error('SMTP-Verbindung wurde unerwartet geschlossen.');
      state.buffer += state.decoder.decode(chunk.value, { stream:true });
      newlineIndex = state.buffer.indexOf('\n');
    }

    const rawLine = state.buffer.slice(0, newlineIndex);
    state.buffer = state.buffer.slice(newlineIndex + 1);
    const line = rawLine.replace(/\r$/, '');
    lines.push(line);
    const match = line.match(/^(\d{3})([ -])/);
    if (!match) continue;
    if (!responseCode) responseCode = match[1];
    if (match[1] === responseCode && match[2] === ' ') {
      return { code:Number(responseCode), lines, text:lines.join('\n') };
    }
  }
}

async function writeSmtpLine(writer, value) {
  await writer.write(new TextEncoder().encode(String(value || '') + '\r\n'));
}

async function smtpCommand(writer, reader, state, command, expectedCodes, options = {}) {
  if (command !== null && command !== undefined) await writeSmtpLine(writer, command);
  const response = await readSmtpResponse(reader, state, options.timeoutMs || 12000);
  const expected = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];
  if (!expected.includes(response.code)) {
    const safeCommand = options.sensitive ? '[vertraulicher SMTP-Befehl]' : String(command || '[Serverantwort]').slice(0, 80);
    const error = new Error(`SMTP ${response.code} nach ${safeCommand}`);
    error.smtpCode = response.code;
    error.smtpResponse = response.text.slice(0, 400);
    throw error;
  }
  return response;
}

function smtpAttachmentAsciiFilename(value) {
  const cleaned = cleanMailAttachmentFilename(value);
  return cleaned.replace(/[^A-Za-z0-9._-]/g, '_') || 'Anhang';
}

function smtpAlternativeBody(boundary, mail) {
  return [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(mail.textPart),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(mail.htmlPart),
    `--${boundary}--`,
    ''
  ];
}

function smtpAttachmentBodyLines(boundary, attachment) {
  const asciiName = smtpAttachmentAsciiFilename(attachment.name);
  const encodedName = encodeURIComponent(attachment.name).replace(/'/g, '%27');
  const disposition = attachment.inline ? 'inline' : 'attachment';
  const lines = [
    `--${boundary}`,
    `Content-Type: ${attachment.type}; name="${asciiName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: ${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`
  ];
  if (attachment.inline && attachment.contentId) lines.push(`Content-ID: <${attachment.contentId}>`);
  lines.push('', wrapExistingBase64(attachment.base64));
  return lines;
}

function buildSmtpMimeMessage(mail, fromEmail, fromName) {
  const token = crypto.randomUUID().replace(/-/g, '');
  const alternativeBoundary = 'hammerschach_alt_' + token;
  const attachment = mail.attachments && mail.attachments.length ? mail.attachments[0] : null;
  const outerBoundary = attachment ? ('hammerschach_' + (attachment.inline ? 'related_' : 'mixed_') + token) : alternativeBoundary;
  const messageIdDomain = String(fromEmail.split('@')[1] || 'online.de').replace(/[^A-Za-z0-9.-]/g, '') || 'online.de';
  const messageId = `${Date.now()}.${token}@${messageIdDomain}`;
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
    `From: ${emailAddressHeader(fromName, fromEmail)}`,
    `To: ${emailAddressHeader(mail.recipientName, mail.recipientEmail)}`,
    `Reply-To: ${emailAddressHeader(fromName, fromEmail)}`,
    `Subject: ${encodeEmailHeader(mail.subject)}`,
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated',
    'X-Auto-Response-Suppress: All',
    `Content-Type: multipart/${attachment ? (attachment.inline ? 'related' : 'mixed') : 'alternative'}; boundary="${outerBoundary}"`
  ];

  let body;
  if (!attachment) {
    body = smtpAlternativeBody(alternativeBoundary, mail);
  } else {
    body = [
      `--${outerBoundary}`,
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      '',
      ...smtpAlternativeBody(alternativeBoundary, mail),
      ...smtpAttachmentBodyLines(outerBoundary, attachment),
      `--${outerBoundary}--`,
      ''
    ];
  }
  return { messageId, raw:headers.concat([''], body).join('\r\n') };
}

function dotStuffSmtpData(value) {
  return String(value || '').replace(/(^|\r\n)\./g, '$1..');
}

async function sendSmtpInvitation(env, payload) {
  const host = String((env && env.SMTP_HOST) || '').trim();
  const port = Number((env && env.SMTP_PORT) || 465);
  const username = String((env && env.SMTP_USERNAME) || '').trim();
  const password = String((env && env.SMTP_PASSWORD) || '');
  const fromEmail = normalizeEmail((env && env.SMTP_FROM_EMAIL) || username);
  const fromName = cleanDisplayName((env && env.SMTP_FROM_NAME) || '') || 'Hammerschach-Gamer';
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !username || !password || !fromEmail) {
    return { ok:false, status:503, code:'SMTP_NOT_CONFIGURED', message:'Der SMTP-Mailversand ist noch nicht vollständig konfiguriert.' };
  }
  if (port !== 465) {
    return { ok:false, status:503, code:'SMTP_PORT_UNSUPPORTED', message:'Für den aktuellen SMTP-Versand muss Port 465 mit SSL/TLS verwendet werden.' };
  }

  const mail = preparedMailFromPayload(payload, env);
  if (!mail.ok) return mail;

  let socket = null;
  let reader = null;
  let writer = null;
  try {
    socket = connect({ hostname:host, port }, { secureTransport:'on', allowHalfOpen:false });
    await withTimeout(socket.opened, 12000, 'SMTP-Verbindung konnte nicht rechtzeitig aufgebaut werden.');
    reader = socket.readable.getReader();
    writer = socket.writable.getWriter();
    const state = { buffer:'', decoder:new TextDecoder() };

    await smtpCommand(writer, reader, state, null, 220);
    let heloName = 'hammerschach-gamer';
    try {
      const publicUrl = configuredGamerPublicUrl(env);
      if (publicUrl) heloName = new URL(publicUrl).hostname.replace(/[^A-Za-z0-9.-]/g, '') || heloName;
    } catch (_) {}
    await smtpCommand(writer, reader, state, `EHLO ${heloName}`, 250);
    await smtpCommand(writer, reader, state, 'AUTH LOGIN', 334);
    await smtpCommand(writer, reader, state, utf8ToBase64(username), 334, { sensitive:true });
    await smtpCommand(writer, reader, state, utf8ToBase64(password), 235, { sensitive:true });
    await smtpCommand(writer, reader, state, `MAIL FROM:<${fromEmail}>`, 250);
    await smtpCommand(writer, reader, state, `RCPT TO:<${mail.recipientEmail}>`, [250, 251]);
    await smtpCommand(writer, reader, state, 'DATA', 354);

    const mime = buildSmtpMimeMessage(mail, fromEmail, fromName);
    const smtpData = dotStuffSmtpData(mime.raw) + '\r\n.';
    await smtpCommand(writer, reader, state, smtpData, 250, { sensitive:true, timeoutMs:mail.attachments && mail.attachments.length ? 60000 : 20000 });
    try { await smtpCommand(writer, reader, state, 'QUIT', 221, { timeoutMs:5000 }); } catch (_) {}

    return { ok:true, status:200, provider:'smtp', messageId:mime.messageId };
  } catch (error) {
    console.error('SMTP invitation failed', error && error.message ? error.message : String(error || 'unknown'), error && error.smtpResponse ? error.smtpResponse : '');
    const code = error && error.smtpCode;
    if (code === 535 || code === 534) {
      return { ok:false, status:502, code:'SMTP_AUTH_FAILED', message:'Die Anmeldung am 1&1-Postfach ist fehlgeschlagen. Bitte Benutzername und Postfachkennwort prüfen.' };
    }
    if (code === 550 || code === 551 || code === 553) {
      return { ok:false, status:502, code:'SMTP_RECIPIENT_REJECTED', message:'Der 1&1-Mailserver hat die Empfängeradresse abgelehnt.' };
    }
    return { ok:false, status:502, code:'SMTP_SEND_FAILED', message:'Die E-Mail konnte über das 1&1-Postfach nicht versendet werden.' };
  } finally {
    try { if (writer) writer.releaseLock(); } catch (_) {}
    try { if (reader) reader.releaseLock(); } catch (_) {}
    try { if (socket) await socket.close(); } catch (_) {}
  }
}

let mailDeliveryLogTableReady = false;
let mailDeliveryLastPruneAt = 0;
const MAIL_DELIVERY_LOG_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

function cleanMailLogType(value) {
  const cleaned = String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
  return cleaned || 'transactional';
}

async function ensureMailDeliveryLogTable(env) {
  if (!env || !env.DB) return false;
  if (mailDeliveryLogTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS mail_delivery_log (
       id TEXT PRIMARY KEY,
       mail_type TEXT NOT NULL,
       provider TEXT NOT NULL,
       status TEXT NOT NULL,
       error_code TEXT,
       error_message TEXT,
       created_at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_delivery_status_time ON mail_delivery_log (status, created_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_delivery_type_time ON mail_delivery_log (mail_type, created_at)`).run();
  mailDeliveryLogTableReady = true;
  return true;
}

function mailTypeFromPayload(payload) {
  if (payload && payload.mailType) return cleanMailLogType(payload.mailType);
  if (payload && payload.preparedMail && payload.preparedMail.mailType) return cleanMailLogType(payload.preparedMail.mailType);
  return payload && payload.preparedMail ? 'transactional' : 'invitation';
}

async function recordMailDeliveryEvent(env, mailType, provider, result) {
  if (!(await ensureMailDeliveryLogTable(env))) return false;
  const ok = !!(result && result.ok);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO mail_delivery_log (id, mail_type, provider, status, error_code, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    cleanMailLogType(mailType),
    cleanMailLogType(provider || result && result.provider || 'unknown'),
    ok ? 'sent' : 'failed',
    ok ? null : cleanAuthLogPart(result && result.code || 'MAIL_FAILED', 64),
    ok ? null : String(result && result.message || 'Versand fehlgeschlagen').replace(/[\r\n]+/g, ' ').slice(0, 240),
    new Date(now).toISOString()
  ).run();
  if (now - mailDeliveryLastPruneAt > 24 * 60 * 60 * 1000) {
    mailDeliveryLastPruneAt = now;
    try {
      await env.DB.prepare(`DELETE FROM mail_delivery_log WHERE created_at < ?`)
        .bind(new Date(now - MAIL_DELIVERY_LOG_RETENTION_MS).toISOString()).run();
    } catch (_) {}
  }
  return true;
}

async function sendInvitationEmail(env, payload) {
  const configured = String((env && env.MAIL_PROVIDER) || '').trim().toLowerCase();
  const provider = configured || ((env && env.SMTP_HOST && env.SMTP_USERNAME && env.SMTP_PASSWORD) ? 'smtp' : 'mailjet');
  let result;
  if (provider === 'smtp') result = await sendSmtpInvitation(env, payload);
  else if (provider === 'mailjet') result = await sendMailjetInvitation(env, payload);
  else result = { ok:false, status:503, code:'UNKNOWN_MAIL_PROVIDER', message:'Der konfigurierte Mailanbieter ist unbekannt.' };
  try { await recordMailDeliveryEvent(env, mailTypeFromPayload(payload), provider, result); } catch (_) {}
  return result;
}


const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const AUTH_MAIL_RATE_WINDOW_MS = 60 * 60 * 1000;
const AUTH_MAIL_RATE_ACCOUNT_LIMIT = 3;
const AUTH_MAIL_RATE_IP_LIMIT = 8;
const AUTH_RATE_LOG_RETENTION_MS = 48 * 60 * 60 * 1000;
const AUTH_SECURITY_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const AUTH_LOGIN_MIN_RESPONSE_MS = 550;
const DUMMY_PASSWORD_SALT = 'AAAAAAAAAAAAAAAAAAAAAA';
const DUMMY_PASSWORD_HASH = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const LOGIN_RATE_POLICY = Object.freeze({
  outcomes:['failure'],
  subjectRules:[
    { count:5, windowMs:15 * 60 * 1000, cooldownMs:60 * 1000 },
    { count:8, windowMs:30 * 60 * 1000, cooldownMs:5 * 60 * 1000 },
    { count:12, windowMs:60 * 60 * 1000, cooldownMs:15 * 60 * 1000 }
  ],
  ipRules:[
    { count:20, windowMs:15 * 60 * 1000, cooldownMs:5 * 60 * 1000 },
    { count:40, windowMs:60 * 60 * 1000, cooldownMs:15 * 60 * 1000 }
  ]
});
const REGISTRATION_RATE_POLICY = Object.freeze({
  outcomes:['attempt'],
  subjectRules:[
    { count:4, windowMs:60 * 60 * 1000, cooldownMs:30 * 60 * 1000 }
  ],
  ipRules:[
    { count:8, windowMs:15 * 60 * 1000, cooldownMs:10 * 60 * 1000 },
    { count:20, windowMs:24 * 60 * 60 * 1000, cooldownMs:60 * 60 * 1000 }
  ]
});
const RECOVERY_REQUEST_RATE_POLICY = Object.freeze({
  outcomes:['attempt'],
  subjectRules:[
    { count:5, windowMs:60 * 60 * 1000, cooldownMs:15 * 60 * 1000 }
  ],
  ipRules:[
    { count:12, windowMs:15 * 60 * 1000, cooldownMs:15 * 60 * 1000 },
    { count:30, windowMs:60 * 60 * 1000, cooldownMs:30 * 60 * 1000 }
  ]
});
const TOKEN_CONFIRM_RATE_POLICY = Object.freeze({
  outcomes:['failure'],
  subjectRules:[],
  ipRules:[
    { count:12, windowMs:15 * 60 * 1000, cooldownMs:10 * 60 * 1000 },
    { count:30, windowMs:60 * 60 * 1000, cooldownMs:30 * 60 * 1000 }
  ]
});
let accountSecurityTablesReady = false;
let authSecurityLastPruneAt = 0;

async function ensureAccountSecurityTables(env) {
  if (!env || !env.DB) return false;
  if (accountSecurityTablesReady) return true;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS user_email_status (
         user_id TEXT PRIMARY KEY,
         email TEXT NOT NULL,
         verified INTEGER NOT NULL DEFAULT 0,
         verified_at TEXT,
         updated_at TEXT NOT NULL
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS account_action_tokens (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL,
         purpose TEXT NOT NULL,
         token_hash TEXT NOT NULL UNIQUE,
         email TEXT NOT NULL,
         created_at TEXT NOT NULL,
         expires_at TEXT NOT NULL,
         used_at TEXT
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS auth_mail_request_log (
         id TEXT PRIMARY KEY,
         request_type TEXT NOT NULL,
         subject_hash TEXT NOT NULL,
         ip_hash TEXT NOT NULL,
         created_at TEXT NOT NULL
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS auth_rate_limit_log (
         id TEXT PRIMARY KEY,
         action TEXT NOT NULL,
         subject_hash TEXT,
         ip_hash TEXT NOT NULL,
         outcome TEXT NOT NULL,
         created_at TEXT NOT NULL
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS auth_security_events (
         id TEXT PRIMARY KEY,
         event_type TEXT NOT NULL,
         outcome TEXT NOT NULL,
         user_id TEXT,
         subject_hash TEXT,
         ip_hash TEXT NOT NULL,
         detail_code TEXT,
         created_at TEXT NOT NULL
       )`
    )
  ]);
  await env.DB.batch([
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_action_tokens_user_purpose ON account_action_tokens (user_id, purpose, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_action_tokens_expiry ON account_action_tokens (expires_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_mail_subject_time ON auth_mail_request_log (subject_hash, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_mail_ip_time ON auth_mail_request_log (ip_hash, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_rate_action_subject_time ON auth_rate_limit_log (action, subject_hash, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_rate_action_ip_time ON auth_rate_limit_log (action, ip_hash, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_rate_time ON auth_rate_limit_log (created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_security_event_time ON auth_security_events (event_type, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_security_user_time ON auth_security_events (user_id, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_security_ip_time ON auth_security_events (ip_hash, created_at)`)
  ]);
  accountSecurityTablesReady = true;
  return true;
}

function publicActionUrl(env, parameterName, token) {
  const configured = configuredGamerPublicUrl(env);
  if (!configured || !token) return '';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    url.hash = '';
    url.search = '';
    url.searchParams.set(parameterName, token);
    return url.toString();
  } catch (_) {
    return '';
  }
}

async function getUserEmailSecurityState(env, rowOrUserId) {
  const userId = String(rowOrUserId && typeof rowOrUserId === 'object' ? rowOrUserId.id : rowOrUserId || '').trim();
  if (!userId || !(await ensureAccountSecurityTables(env))) {
    return { emailVerified:true, verifiedAt:null, pendingEmail:'' };
  }
  const user = rowOrUserId && typeof rowOrUserId === 'object' && rowOrUserId.email
    ? rowOrUserId
    : await env.DB.prepare(`SELECT id, email FROM users WHERE id = ? LIMIT 1`).bind(userId).first();
  if (!user) return { emailVerified:false, verifiedAt:null, pendingEmail:'' };
  const currentEmail = normalizeEmail(user.email);
  const row = await env.DB.prepare(
    `SELECT email, verified, verified_at FROM user_email_status WHERE user_id = ? LIMIT 1`
  ).bind(userId).first();
  // Bestehende Accounts vor Einführung der Verifizierung gelten als bestätigt.
  const emailVerified = !row || (normalizeEmail(row.email) === currentEmail && Number(row.verified) === 1);
  const nowIso = new Date().toISOString();
  const pending = await env.DB.prepare(
    `SELECT email FROM account_action_tokens
      WHERE user_id = ? AND purpose = 'email_change' AND used_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1`
  ).bind(userId, nowIso).first();
  return {
    emailVerified,
    verifiedAt:row && row.verified_at ? row.verified_at : null,
    pendingEmail:normalizeEmail(pending && pending.email) || ''
  };
}

async function setCurrentEmailVerified(env, userId, email, verified) {
  if (!(await ensureAccountSecurityTables(env))) return false;
  const normalized = normalizeEmail(email);
  if (!userId || !normalized) return false;
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_email_status (user_id, email, verified, verified_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email,
       verified = excluded.verified,
       verified_at = excluded.verified_at,
       updated_at = excluded.updated_at`
  ).bind(String(userId), normalized, verified ? 1 : 0, verified ? nowIso : null, nowIso).run();
  return true;
}

async function createAccountActionToken(env, userId, purpose, email, ttlMs) {
  if (!(await ensureAccountSecurityTables(env))) throw new Error('Account-Sicherheit ist momentan nicht verfügbar.');
  const uid = String(userId || '').trim();
  const action = String(purpose || '').trim().slice(0, 40);
  const normalizedEmail = normalizeEmail(email);
  if (!uid || !action || !normalizedEmail) throw new Error('Token-Daten sind unvollständig.');
  const rawToken = randomBase64Url(32);
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const expires = new Date(now.getTime() + Math.max(5 * 60 * 1000, Number(ttlMs || 0)));
  const nowIso = now.toISOString();
  await env.DB.prepare(
    `UPDATE account_action_tokens SET used_at = ?
      WHERE user_id = ? AND purpose = ? AND used_at IS NULL`
  ).bind(nowIso, uid, action).run();
  await env.DB.prepare(
    `INSERT INTO account_action_tokens (id, user_id, purpose, token_hash, email, created_at, expires_at, used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
  ).bind(crypto.randomUUID(), uid, action, tokenHash, normalizedEmail, nowIso, expires.toISOString()).run();
  try {
    const pruneBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(`DELETE FROM account_action_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)`).bind(nowIso, pruneBefore).run();
  } catch (_) {}
  return { token:rawToken, expiresAt:expires.toISOString(), email:normalizedEmail, purpose:action };
}

async function loadValidAccountActionToken(env, token, allowedPurposes) {
  if (!(await ensureAccountSecurityTables(env))) return null;
  const raw = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(raw)) return null;
  const tokenHash = await sha256Hex(raw);
  const nowIso = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT *
       FROM account_action_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
      LIMIT 1`
  ).bind(tokenHash, nowIso).first();
  if (!row) return null;
  const user = await env.DB.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).bind(row.user_id).first();
  if (!user || user.disabled === 1 || user.disabled === true || user.deleted_at) return null;
  const allowed = Array.isArray(allowedPurposes) ? allowedPurposes : [allowedPurposes];
  if (!allowed.includes(String(row.purpose || ''))) return null;
  return {
    ...row,
    username:user.username || '',
    current_email:user.email || '',
    disabled:user.disabled,
    deleted_at:user.deleted_at
  };
}

async function markAccountActionTokenUsed(env, tokenRow) {
  if (!tokenRow || !tokenRow.id) return false;
  const nowIso = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE account_action_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL`
  ).bind(nowIso, tokenRow.id).run();
  return Number(result && result.meta && result.meta.changes || 0) > 0;
}

function requestClientIp(request) {
  return String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0, 80);
}

function cleanAuthLogPart(value, maxLength = 80) {
  return String(value || '')
    .replace(/[^A-Za-z0-9_.:@|+-]/g, '')
    .slice(0, maxLength);
}

function normalizeAuthSubject(value) {
  return String(value || '').trim().toLowerCase().slice(0, 320);
}

async function buildAuthSecurityContext(request, action, subjectValue = '') {
  const safeAction = cleanAuthLogPart(action, 48) || 'auth';
  const subject = normalizeAuthSubject(subjectValue);
  const ip = requestClientIp(request);
  return {
    action:safeAction,
    subjectHash:subject ? await sha256Hex(`hammerschach-auth-v1|subject|${safeAction}|${subject}`) : '',
    ipHash:await sha256Hex(`hammerschach-auth-v1|ip|${safeAction}|${ip}`)
  };
}

async function pruneAuthDefenseLogs(env) {
  const now = Date.now();
  if (now - authSecurityLastPruneAt < 6 * 60 * 60 * 1000) return;
  authSecurityLastPruneAt = now;
  try {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM auth_rate_limit_log WHERE created_at < ?`).bind(new Date(now - AUTH_RATE_LOG_RETENTION_MS).toISOString()),
      env.DB.prepare(`DELETE FROM auth_security_events WHERE created_at < ?`).bind(new Date(now - AUTH_SECURITY_EVENT_RETENTION_MS).toISOString())
    ]);
  } catch (_) {}
}

async function recordAuthRateLimitEvent(env, context, outcome) {
  if (!(await ensureAccountSecurityTables(env))) return false;
  const safeOutcome = cleanAuthLogPart(outcome, 24) || 'attempt';
  await env.DB.prepare(
    `INSERT INTO auth_rate_limit_log (id, action, subject_hash, ip_hash, outcome, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    context.action,
    context.subjectHash || null,
    context.ipHash,
    safeOutcome,
    new Date().toISOString()
  ).run();
  await pruneAuthDefenseLogs(env);
  return true;
}

async function recordAuthSecurityEvent(env, request, eventType, outcome, options = {}) {
  if (!(await ensureAccountSecurityTables(env))) return false;
  const context = options.context || await buildAuthSecurityContext(request, eventType, options.subjectValue || '');
  const detailCode = cleanAuthLogPart(options.detailCode, 64) || null;
  const userId = options.userId ? String(options.userId).slice(0, 128) : null;
  await env.DB.prepare(
    `INSERT INTO auth_security_events (id, event_type, outcome, user_id, subject_hash, ip_hash, detail_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    cleanAuthLogPart(eventType, 48) || 'auth',
    cleanAuthLogPart(outcome, 24) || 'unknown',
    userId,
    context.subjectHash || null,
    context.ipHash,
    detailCode,
    new Date().toISOString()
  ).run();
  await pruneAuthDefenseLogs(env);
  return true;
}

function maximumPolicyWindow(rules) {
  return Math.max(0, ...(Array.isArray(rules) ? rules : []).map(rule => Number(rule.windowMs || 0)));
}

async function loadAuthRateTimes(env, action, column, hash, outcomes, sinceIso) {
  if (!hash || !Array.isArray(outcomes) || outcomes.length === 0) return [];
  const safeColumn = column === 'subject_hash' ? 'subject_hash' : 'ip_hash';
  const placeholders = outcomes.map(() => '?').join(', ');
  const statement = env.DB.prepare(
    `SELECT created_at
       FROM auth_rate_limit_log
      WHERE action = ? AND ${safeColumn} = ?
        AND outcome IN (${placeholders})
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 250`
  );
  const result = await statement.bind(action, hash, ...outcomes, sinceIso).all();
  return (result && Array.isArray(result.results) ? result.results : [])
    .map(row => Date.parse(row && row.created_at || ''))
    .filter(Number.isFinite);
}

function evaluateAuthRateRules(times, rules, now) {
  let retryAfterMs = 0;
  for (const rule of Array.isArray(rules) ? rules : []) {
    const windowMs = Math.max(1000, Number(rule.windowMs || 0));
    const threshold = Math.max(1, Math.floor(Number(rule.count || 1)));
    const cooldownMs = Math.max(1000, Number(rule.cooldownMs || 0));
    const recent = times.filter(time => now - time <= windowMs);
    if (recent.length < threshold || recent.length === 0) continue;
    const elapsedSinceLatest = Math.max(0, now - recent[0]);
    if (elapsedSinceLatest < cooldownMs) retryAfterMs = Math.max(retryAfterMs, cooldownMs - elapsedSinceLatest);
  }
  return retryAfterMs;
}

async function checkAuthRateLimit(env, request, action, subjectValue, policy) {
  if (!(await ensureAccountSecurityTables(env))) return { allowed:true, context:await buildAuthSecurityContext(request, action, subjectValue), retryAfterSeconds:0 };
  const context = await buildAuthSecurityContext(request, action, subjectValue);
  const outcomes = Array.isArray(policy && policy.outcomes) && policy.outcomes.length ? policy.outcomes : ['failure'];
  const subjectRules = Array.isArray(policy && policy.subjectRules) ? policy.subjectRules : [];
  const ipRules = Array.isArray(policy && policy.ipRules) ? policy.ipRules : [];
  const now = Date.now();
  const maxWindow = Math.max(maximumPolicyWindow(subjectRules), maximumPolicyWindow(ipRules), 60 * 1000);
  const sinceIso = new Date(now - maxWindow).toISOString();
  const [subjectTimes, ipTimes] = await Promise.all([
    subjectRules.length && context.subjectHash
      ? loadAuthRateTimes(env, context.action, 'subject_hash', context.subjectHash, outcomes, sinceIso)
      : Promise.resolve([]),
    ipRules.length
      ? loadAuthRateTimes(env, context.action, 'ip_hash', context.ipHash, outcomes, sinceIso)
      : Promise.resolve([])
  ]);
  const retryAfterMs = Math.max(
    evaluateAuthRateRules(subjectTimes, subjectRules, now),
    evaluateAuthRateRules(ipTimes, ipRules, now)
  );
  return {
    allowed:retryAfterMs <= 0,
    context,
    retryAfterSeconds:retryAfterMs > 0 ? Math.max(1, Math.ceil(retryAfterMs / 1000)) : 0
  };
}

async function clearAuthSubjectFailures(env, action, subjectHash) {
  if (!subjectHash || !(await ensureAccountSecurityTables(env))) return;
  try {
    await env.DB.prepare(
      `DELETE FROM auth_rate_limit_log WHERE action = ? AND subject_hash = ? AND outcome = 'failure'`
    ).bind(cleanAuthLogPart(action, 48), subjectHash).run();
  } catch (_) {}
}

function authRateLimitResponse(message, retryAfterSeconds) {
  const retry = Math.max(1, Math.floor(Number(retryAfterSeconds || 60)));
  return json({
    ok:false,
    code:'TOO_MANY_ATTEMPTS',
    message:message || 'Zu viele Versuche. Bitte warte kurz und versuche es später erneut.',
    retryAfterSeconds:retry
  }, { status:429, headers:{ 'retry-after':String(retry) } });
}

async function verifyPasswordConstantTime(password, user) {
  const candidateUser = user && user.password_alg === 'pbkdf2-sha256'
    ? user
    : {
        password_alg:'pbkdf2-sha256',
        password_salt:DUMMY_PASSWORD_SALT,
        password_iterations:PASSWORD_ITERATIONS,
        password_hash:DUMMY_PASSWORD_HASH
      };
  return verifyPassword(password, candidateUser);
}

async function claimAuthMailRequest(env, request, requestType, subjectKey) {
  if (!(await ensureAccountSecurityTables(env))) return false;
  const now = Date.now();
  const fromIso = new Date(now - AUTH_MAIL_RATE_WINDOW_MS).toISOString();
  const subjectHash = await sha256Hex(`subject:${requestType}:${String(subjectKey || '').toLowerCase()}`);
  const ipHash = await sha256Hex(`ip:${requestType}:${requestClientIp(request)}`);
  const [subjectCount, ipCount] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM auth_mail_request_log WHERE subject_hash = ? AND created_at >= ?`).bind(subjectHash, fromIso).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM auth_mail_request_log WHERE ip_hash = ? AND created_at >= ?`).bind(ipHash, fromIso).first()
  ]);
  if (Number(subjectCount && subjectCount.count || 0) >= AUTH_MAIL_RATE_ACCOUNT_LIMIT) return false;
  if (Number(ipCount && ipCount.count || 0) >= AUTH_MAIL_RATE_IP_LIMIT) return false;
  await env.DB.prepare(
    `INSERT INTO auth_mail_request_log (id, request_type, subject_hash, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), String(requestType || '').slice(0, 40), subjectHash, ipHash, new Date(now).toISOString()).run();
  try {
    const pruneBefore = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(`DELETE FROM auth_mail_request_log WHERE created_at < ?`).bind(pruneBefore).run();
  } catch (_) {}
  return true;
}

async function findUserByIdentifier(env, identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  const email = normalizeEmail(raw);
  return env.DB.prepare(
    email ? `SELECT * FROM users WHERE email_lc = ? LIMIT 1` : `SELECT * FROM users WHERE username_lc = ? LIMIT 1`
  ).bind(email || raw.toLowerCase()).first();
}

function prepareSecurityActionEmail(payload) {
  const recipientEmail = normalizeEmail(payload && payload.recipientEmail);
  const recipientName = cleanDisplayName(payload && payload.recipientName) || 'Schachfreund';
  const title = String(payload && payload.title || '').replace(/[\r\n<>]/g, '').trim().slice(0, 120);
  const intro = String(payload && payload.intro || '').trim().slice(0, 1200);
  const actionUrl = String(payload && payload.actionUrl || '').trim();
  const actionLabel = String(payload && payload.actionLabel || 'Öffnen').replace(/[\r\n<>]/g, '').trim().slice(0, 80);
  const expiryText = String(payload && payload.expiryText || '').trim().slice(0, 180);
  if (!recipientEmail || !title || !intro || !actionUrl) {
    return { ok:false, status:400, code:'INVALID_SECURITY_MAIL', message:'Die Sicherheitsmail konnte nicht vorbereitet werden.' };
  }
  const textPart = `Hallo ${recipientName},\n\n${intro}\n\n${actionLabel}:\n${actionUrl}${expiryText ? `\n\n${expiryText}` : ''}\n\nFalls du diese Aktion nicht angefordert hast, kannst du diese Nachricht ignorieren.\n\nViele Grüße\nHammerschach-Gamer`;
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><h2 style="margin:0 0 18px;color:#843f46;">${escapeEmailHtml(title)}</h2><p>Hallo ${escapeEmailHtml(recipientName)},</p><p style="line-height:1.55;">${escapeEmailHtml(intro)}</p><p style="margin:22px 0;"><a href="${escapeEmailHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">${escapeEmailHtml(actionLabel)}</a></p><p style="font-size:13px;color:#666;word-break:break-all;">Falls die Schaltfläche nicht funktioniert:<br>${escapeEmailHtml(actionUrl)}</p>${expiryText ? `<p style="font-size:13px;color:#666;">${escapeEmailHtml(expiryText)}</p>` : ''}<hr style="border:0;border-top:1px solid #eee;margin:22px 0;"><p style="font-size:12px;color:#777;">Falls du diese Aktion nicht angefordert hast, kannst du diese Nachricht ignorieren.</p><p style="margin-bottom:0;">Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return { ok:true, mailType:cleanMailLogType(payload && payload.mailType || 'security_action'), recipientEmail, recipientName, subject:title, textPart, htmlPart };
}

function prepareEmailChangeNoticeEmail(payload) {
  const recipientEmail = normalizeEmail(payload && payload.recipientEmail);
  const recipientName = cleanDisplayName(payload && payload.recipientName) || 'Schachfreund';
  const pendingEmail = normalizeEmail(payload && payload.pendingEmail);
  if (!recipientEmail || !pendingEmail) return { ok:false, status:400, code:'INVALID_EMAIL_CHANGE_NOTICE', message:'Die Hinweis-Mail konnte nicht vorbereitet werden.' };
  const subject = 'Änderung deiner Hammerschach-Mailadresse angefordert';
  const textPart = `Hallo ${recipientName},\n\nfür deinen Hammerschach-Account wurde die Änderung der Mailadresse auf ${pendingEmail} angefordert. Die bisherige Adresse bleibt aktiv, bis die neue Adresse über den Bestätigungslink bestätigt wurde.\n\nFalls du diese Änderung nicht veranlasst hast, ändere bitte dein Kennwort.\n\nViele Grüße\nHammerschach-Gamer`;
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><h2 style="margin:0 0 18px;color:#843f46;">Mailadressänderung angefordert</h2><p>Hallo ${escapeEmailHtml(recipientName)},</p><p>für deinen Hammerschach-Account wurde die Änderung der Mailadresse auf <strong>${escapeEmailHtml(pendingEmail)}</strong> angefordert.</p><p>Die bisherige Adresse bleibt aktiv, bis die neue Adresse über den Bestätigungslink bestätigt wurde.</p><p style="font-size:13px;color:#843f46;font-weight:bold;">Falls du diese Änderung nicht veranlasst hast, ändere bitte dein Kennwort.</p><p style="margin-bottom:0;">Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return { ok:true, mailType:'email_change_notice', recipientEmail, recipientName, subject, textPart, htmlPart };
}

async function sendRegistrationVerificationEmail(env, user, request = null) {
  const email = normalizeEmail(user && user.email);
  if (!user || !email) return { ok:false, code:'INVALID_USER_EMAIL' };
  if (request && !(await claimAuthMailRequest(env, request, 'verify_email', user.id))) return { ok:true, skipped:true, reason:'rate_limited' };
  const action = await createAccountActionToken(env, user.id, 'verify_registration', email, EMAIL_VERIFICATION_TTL_MS);
  const actionUrl = publicActionUrl(env, 'verifyEmail', action.token);
  const mail = prepareSecurityActionEmail({
    recipientEmail:email,
    recipientName:user.username,
    mailType:'email_verification',
    title:'Mailadresse für Hammerschach bestätigen',
    intro:'Bitte bestätige deine Mailadresse. Erst danach kannst du dich mit dem neu angelegten Account einloggen.',
    actionUrl,
    actionLabel:'Mailadresse bestätigen',
    expiryText:'Der Bestätigungslink ist 24 Stunden gültig und kann nur einmal verwendet werden.'
  });
  return sendInvitationEmail(env, { preparedMail:mail, mailType:'email_verification' });
}

async function sendPasswordResetEmail(env, user, request) {
  const emailState = await getUserEmailSecurityState(env, user);
  if (!emailState.emailVerified) return { ok:true, skipped:true, reason:'email_not_verified' };
  if (!(await claimAuthMailRequest(env, request, 'password_reset', user.id))) return { ok:true, skipped:true, reason:'rate_limited' };
  const action = await createAccountActionToken(env, user.id, 'password_reset', user.email, PASSWORD_RESET_TTL_MS);
  const actionUrl = publicActionUrl(env, 'resetPassword', action.token);
  const mail = prepareSecurityActionEmail({
    recipientEmail:user.email,
    recipientName:user.username,
    mailType:'password_reset',
    title:'Hammerschach-Kennwort zurücksetzen',
    intro:'Über den folgenden Link kannst du ein neues Kennwort für deinen Hammerschach-Account festlegen.',
    actionUrl,
    actionLabel:'Neues Kennwort festlegen',
    expiryText:'Der Link ist 30 Minuten gültig und kann nur einmal verwendet werden.'
  });
  return sendInvitationEmail(env, { preparedMail:mail, mailType:'password_reset' });
}

async function waitForMinimumResponseTime(startedAt, minimumMs = 450) {
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
}


const DEFAULT_EMAIL_NOTIFICATIONS = Object.freeze({
  dailyTurnEnabled:true,
  dailyResultEnabled:true,
  memberNewsEnabled:false,
  tournamentEnabled:true
});
let userEmailPreferencesTableReady = false;
let emailNotificationLogTableReady = false;
const EMAIL_NOTIFICATION_PENDING_STALE_MS = 5 * 60 * 1000;

async function ensureUserEmailPreferencesTable(env) {
  if (!env || !env.DB) return false;
  if (userEmailPreferencesTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS user_email_preferences (
       user_id TEXT PRIMARY KEY,
       daily_turn_enabled INTEGER NOT NULL DEFAULT 1,
       daily_result_enabled INTEGER NOT NULL DEFAULT 1,
       member_news_enabled INTEGER NOT NULL DEFAULT 0,
       tournament_enabled INTEGER NOT NULL DEFAULT 1,
       updated_at TEXT NOT NULL
     )`
  ).run();
  try {
    await env.DB.prepare(`ALTER TABLE user_email_preferences ADD COLUMN member_news_enabled INTEGER NOT NULL DEFAULT 0`).run();
  } catch (_) {
    /* Spalte existiert bereits. */
  }
  try {
    await env.DB.prepare(`ALTER TABLE user_email_preferences ADD COLUMN tournament_enabled INTEGER NOT NULL DEFAULT 1`).run();
  } catch (_) {
    /* Spalte existiert bereits. */
  }
  userEmailPreferencesTableReady = true;
  return true;
}

function normalizeEmailNotificationPreferences(value) {
  const source = value && typeof value === 'object' ? value : {};
  const boolValue = (camel, snake, fallback) => {
    const raw = source[camel] !== undefined ? source[camel] : source[snake];
    if (raw === undefined || raw === null) return fallback;
    return !(raw === false || raw === 0 || raw === '0' || String(raw).toLowerCase() === 'false');
  };
  return {
    dailyTurnEnabled:boolValue('dailyTurnEnabled', 'daily_turn_enabled', DEFAULT_EMAIL_NOTIFICATIONS.dailyTurnEnabled),
    dailyResultEnabled:boolValue('dailyResultEnabled', 'daily_result_enabled', DEFAULT_EMAIL_NOTIFICATIONS.dailyResultEnabled),
    memberNewsEnabled:boolValue('memberNewsEnabled', 'member_news_enabled', DEFAULT_EMAIL_NOTIFICATIONS.memberNewsEnabled),
    tournamentEnabled:boolValue('tournamentEnabled', 'tournament_enabled', DEFAULT_EMAIL_NOTIFICATIONS.tournamentEnabled)
  };
}

async function getUserEmailPreferences(env, userId) {
  const id = String(userId || '').trim();
  if (!id || !(await ensureUserEmailPreferencesTable(env))) return { ...DEFAULT_EMAIL_NOTIFICATIONS };
  const row = await env.DB.prepare(
    `SELECT daily_turn_enabled, daily_result_enabled, member_news_enabled, tournament_enabled
       FROM user_email_preferences
      WHERE user_id = ?
      LIMIT 1`
  ).bind(id).first();
  return normalizeEmailNotificationPreferences(row || DEFAULT_EMAIL_NOTIFICATIONS);
}

async function setUserEmailPreferences(env, userId, preferences) {
  const id = String(userId || '').trim();
  if (!id || !(await ensureUserEmailPreferencesTable(env))) throw new Error('E-Mail-Einstellungen sind momentan nicht verfügbar.');
  const normalized = normalizeEmailNotificationPreferences(preferences);
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_email_preferences (user_id, daily_turn_enabled, daily_result_enabled, member_news_enabled, tournament_enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       daily_turn_enabled = excluded.daily_turn_enabled,
       daily_result_enabled = excluded.daily_result_enabled,
       member_news_enabled = excluded.member_news_enabled,
       tournament_enabled = excluded.tournament_enabled,
       updated_at = excluded.updated_at`
  ).bind(
    id,
    normalized.dailyTurnEnabled ? 1 : 0,
    normalized.dailyResultEnabled ? 1 : 0,
    normalized.memberNewsEnabled ? 1 : 0,
    normalized.tournamentEnabled ? 1 : 0,
    updatedAt
  ).run();
  return normalized;
}

let userOnboardingTableReady = false;

async function ensureUserOnboardingTable(env) {
  if (!env || !env.DB) return false;
  if (userOnboardingTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS user_onboarding (
       user_id TEXT PRIMARY KEY,
       leitbild_acknowledged_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  ).run();
  userOnboardingTableReady = true;
  return true;
}

async function getUserOnboardingState(env, userId) {
  const id = String(userId || '').trim();
  if (!id || !(await ensureUserOnboardingTable(env))) {
    return { leitbildAcknowledged:false, leitbildAcknowledgedAt:null };
  }
  const row = await env.DB.prepare(
    `SELECT leitbild_acknowledged_at
       FROM user_onboarding
      WHERE user_id = ?
      LIMIT 1`
  ).bind(id).first();
  const acknowledgedAt = row && row.leitbild_acknowledged_at ? String(row.leitbild_acknowledged_at) : null;
  return {
    leitbildAcknowledged:!!acknowledgedAt,
    leitbildAcknowledgedAt:acknowledgedAt
  };
}

async function acknowledgeUserLeitbild(env, userId) {
  const id = String(userId || '').trim();
  if (!id || !(await ensureUserOnboardingTable(env))) throw new Error('Die Leitbild-Bestätigung ist momentan nicht verfügbar.');
  const acknowledgedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_onboarding (user_id, leitbild_acknowledged_at, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       leitbild_acknowledged_at = COALESCE(user_onboarding.leitbild_acknowledged_at, excluded.leitbild_acknowledged_at),
       updated_at = excluded.updated_at`
  ).bind(id, acknowledgedAt, acknowledgedAt).run();
  return getUserOnboardingState(env, id);
}

async function ensureEmailNotificationLogTable(env) {
  if (!env || !env.DB) return false;
  if (emailNotificationLogTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS email_notification_log (
       notification_key TEXT PRIMARY KEY,
       notification_type TEXT NOT NULL,
       user_id TEXT NOT NULL,
       room_id TEXT NOT NULL,
       status TEXT NOT NULL,
       attempts INTEGER NOT NULL DEFAULT 1,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       sent_at TEXT,
       message_id TEXT,
       last_error TEXT
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_email_notification_user_time ON email_notification_log (user_id, updated_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_email_notification_room_type ON email_notification_log (room_id, notification_type)`).run();
  emailNotificationLogTableReady = true;
  return true;
}

async function claimEmailNotification(env, notificationKey, notificationType, userId, roomId) {
  if (!(await ensureEmailNotificationLogTable(env))) return { claimed:false, reason:'log_unavailable' };
  const key = String(notificationKey || '').slice(0, 220);
  const type = String(notificationType || '').slice(0, 50);
  const uid = String(userId || '').slice(0, 128);
  const room = cleanRoomId(roomId);
  if (!key || !type || !uid || !room) return { claimed:false, reason:'invalid_key' };
  const nowIso = new Date().toISOString();
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO email_notification_log
       (notification_key, notification_type, user_id, room_id, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 1, ?, ?)`
  ).bind(key, type, uid, room, nowIso, nowIso).run();
  if (Number(inserted && inserted.meta && inserted.meta.changes || 0) > 0) return { claimed:true, key };

  const existing = await env.DB.prepare(
    `SELECT status, created_at, updated_at FROM email_notification_log WHERE notification_key = ? LIMIT 1`
  ).bind(key).first();
  if (!existing || existing.status === 'sent') return { claimed:false, reason:existing ? 'already_sent' : 'not_found' };
  if (existing.status === 'pending' && existing.created_at === nowIso && existing.updated_at === nowIso) return { claimed:true, key };
  const updatedMs = Date.parse(existing.updated_at || '');
  if (existing.status === 'pending' && Number.isFinite(updatedMs) && Date.now() - updatedMs < EMAIL_NOTIFICATION_PENDING_STALE_MS) {
    return { claimed:false, reason:'already_pending' };
  }
  const retried = await env.DB.prepare(
    `UPDATE email_notification_log
        SET status = 'pending', attempts = attempts + 1, updated_at = ?, last_error = NULL
      WHERE notification_key = ? AND status <> 'sent'`
  ).bind(nowIso, key).run();
  return { claimed:Number(retried && retried.meta && retried.meta.changes || 0) > 0, key, reason:'retry' };
}

async function completeEmailNotification(env, notificationKey, result) {
  if (!env || !env.DB || !notificationKey) return;
  const ok = !!(result && result.ok);
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE email_notification_log
        SET status = ?, updated_at = ?, sent_at = ?, message_id = ?, last_error = ?
      WHERE notification_key = ?`
  ).bind(
    ok ? 'sent' : 'failed',
    nowIso,
    ok ? nowIso : null,
    ok ? String(result.messageId || '').slice(0, 180) : null,
    ok ? null : String(result && (result.message || result.code) || 'Versand fehlgeschlagen').slice(0, 300),
    String(notificationKey)
  ).run();
  try {
    const pruneBefore = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(`DELETE FROM email_notification_log WHERE updated_at < ?`).bind(pruneBefore).run();
  } catch (_) {}
}

function formatNotificationDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone:'Europe/Berlin', weekday:'long', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    }).format(date) + ' Uhr';
  } catch (_) {
    return date.toISOString();
  }
}

function dailyNotificationVariantLabel(setup) {
  const normalized = cleanGameSetup(setup || null);
  return normalized.variant === GAME_VARIANT_FREESTYLE
    ? `Daily Freestyle · Stellung #${normalized.positionId}`
    : 'Daily Classic';
}

function dailyNotificationResultLabel(result) {
  if (result === '1-0') return '1–0';
  if (result === '0-1') return '0–1';
  if (result === '1/2-1/2') return '½–½';
  return String(result || '—');
}

function dailyNotificationEndReasonLabel(reason) {
  const labels = {
    time:'Zeitüberschreitung', resignation:'Aufgabe', draw_agreed:'Remis vereinbart', checkmate:'Schachmatt',
    stalemate:'Patt', insufficient_material:'Unzureichendes Mattmaterial', fifty_move_rule:'50-Züge-Regel',
    threefold_repetition:'Dreifache Stellungswiederholung'
  };
  return labels[String(reason || '')] || 'Partie beendet';
}

function prepareDailyTurnEmail(payload) {
  const recipientEmail = normalizeEmail(payload && payload.recipientEmail);
  const recipientName = cleanDisplayName(payload && payload.recipientName) || 'Schachfreund';
  const opponentName = cleanDisplayName(payload && payload.opponentName) || 'dein Gegner';
  const inviteUrl = String(payload && payload.inviteUrl || '').trim();
  const timeLabel = String(payload && payload.timeLabel || 'Daily Chess').slice(0, 120);
  const variantLabel = String(payload && payload.variantLabel || 'Daily Chess').slice(0, 120);
  const deadlineLabel = formatNotificationDateTime(payload && payload.deadlineAt);
  const lastMoveSan = String(payload && payload.lastMoveSan || '').replace(/[\r\n<>]/g, '').trim().slice(0, 24);
  if (!recipientEmail || !inviteUrl) return { ok:false, status:400, code:'INVALID_DAILY_TURN_MAIL', message:'Die Zugbenachrichtigung konnte nicht vorbereitet werden.' };
  const subject = `Du bist am Zug – Daily-Partie gegen ${opponentName}`;
  const moveSentence = lastMoveSan ? `${opponentName} hat ${lastMoveSan} gezogen. ` : '';
  const textDetails = [`Spielmodus: ${variantLabel}`, `Zugfrist: ${timeLabel}`];
  if (deadlineLabel) textDetails.push(`Fristende: ${deadlineLabel}`);
  const textPart = `Hallo ${recipientName},\n\n${moveSentence}Du bist jetzt in deiner Daily-Partie gegen ${opponentName} am Zug.\n\n${textDetails.join('\n')}\n\nPartie öffnen:\n${inviteUrl}\n\nDiese Benachrichtigung kannst du in deiner Accountverwaltung abschalten.\n\nViele Grüße\nHammerschach-Gamer`;
  const detailHtml = textDetails.map(line => escapeEmailHtml(line)).join('<br>');
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><h2 style="margin:0 0 18px;color:#843f46;">Du bist am Zug</h2><p>Hallo ${escapeEmailHtml(recipientName)},</p><p>${lastMoveSan ? `<strong>${escapeEmailHtml(opponentName)}</strong> hat <strong>${escapeEmailHtml(lastMoveSan)}</strong> gezogen. ` : ''}Du bist jetzt in deiner Daily-Partie gegen <strong>${escapeEmailHtml(opponentName)}</strong> am Zug.</p><div style="margin:18px 0;padding:12px 14px;background:#f6f1f2;border:1px solid #e5d3d6;border-radius:10px;line-height:1.55;">${detailHtml}</div><p style="margin:22px 0;"><a href="${escapeEmailHtml(inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">Partie öffnen</a></p><p style="font-size:13px;color:#666;word-break:break-all;">Falls die Schaltfläche nicht funktioniert:<br>${escapeEmailHtml(inviteUrl)}</p><hr style="border:0;border-top:1px solid #eee;margin:22px 0;"><p style="font-size:12px;color:#777;">Diese Benachrichtigung kannst du in deiner Accountverwaltung abschalten.</p><p style="margin-bottom:0;">Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return { ok:true, mailType:'daily_turn', recipientEmail, recipientName, subject, textPart, htmlPart };
}

function prepareDailyOpenOfferAcceptedEmail(payload) {
  const recipientEmail = normalizeEmail(payload && payload.recipientEmail);
  const recipientName = cleanDisplayName(payload && payload.recipientName) || 'Schachfreund';
  const opponentName = cleanDisplayName(payload && payload.opponentName) || 'dein Gegner';
  const inviteUrl = String(payload && payload.inviteUrl || '').trim();
  const timeLabel = String(payload && payload.timeLabel || 'Daily Chess').slice(0, 120);
  const variantLabel = String(payload && payload.variantLabel || 'Daily Chess').slice(0, 120);
  const creatorRole = payload && payload.creatorRole === 'b' ? 'b' : 'w';
  const creatorColorLabel = creatorRole === 'w' ? 'Weiß' : 'Schwarz';
  const opponentColorLabel = creatorRole === 'w' ? 'Schwarz' : 'Weiß';
  const includesTurn = payload && payload.includesTurn === true;
  const deadlineLabel = includesTurn ? formatNotificationDateTime(payload && payload.deadlineAt) : '';
  if (!recipientEmail || !inviteUrl) return { ok:false, status:400, code:'INVALID_DAILY_OFFER_ACCEPTED_MAIL', message:'Die Annahmebestätigung konnte nicht vorbereitet werden.' };

  const subject = includesTurn
    ? `Dein Partieangebot wurde angenommen – du bist am Zug`
    : `Dein Partieangebot wurde angenommen`;
  const details = [
    `Gegner: ${opponentName}`,
    `Spielmodus: ${variantLabel}`,
    `Zugfrist: ${timeLabel}`,
    `Deine Farbe: ${creatorColorLabel}`,
    `Farbe des Gegners: ${opponentColorLabel}`
  ];
  if (deadlineLabel) details.push(`Fristende: ${deadlineLabel}`);
  const turnText = includesTurn
    ? ` Die Partie wurde automatisch gestartet und du bist mit Weiß am Zug.`
    : ` Die Partie wurde automatisch gestartet; zunächst ist ${opponentName} mit Weiß am Zug.`;
  const textPart = `Hallo ${recipientName},\n\n${opponentName} hat dein offenes Daily-Partieangebot angenommen.${turnText}\n\n${details.join('\n')}\n\nPartie öffnen:\n${inviteUrl}\n\nDiese Nachricht ist eine notwendige Information zu deinem angenommenen Partieangebot.\n\nViele Grüße\nHammerschach-Gamer`;
  const detailHtml = details.map(line => escapeEmailHtml(line)).join('<br>');
  const heading = includesTurn ? 'Angebot angenommen – du bist am Zug' : 'Dein Partieangebot wurde angenommen';
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><h2 style="margin:0 0 18px;color:#843f46;">${escapeEmailHtml(heading)}</h2><p>Hallo ${escapeEmailHtml(recipientName)},</p><p><strong>${escapeEmailHtml(opponentName)}</strong> hat dein offenes Daily-Partieangebot angenommen.${includesTurn ? ' Die Partie wurde automatisch gestartet und <strong>du bist mit Weiß am Zug</strong>.' : ` Die Partie wurde automatisch gestartet; zunächst ist <strong>${escapeEmailHtml(opponentName)} mit Weiß am Zug</strong>.`}</p><div style="margin:18px 0;padding:12px 14px;background:#f6f1f2;border:1px solid #e5d3d6;border-radius:10px;line-height:1.55;">${detailHtml}</div><p style="margin:22px 0;"><a href="${escapeEmailHtml(inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">Partie öffnen</a></p><p style="font-size:13px;color:#666;word-break:break-all;">Falls die Schaltfläche nicht funktioniert:<br>${escapeEmailHtml(inviteUrl)}</p><hr style="border:0;border-top:1px solid #eee;margin:22px 0;"><p style="font-size:12px;color:#777;">Diese Nachricht ist eine notwendige Information zu deinem angenommenen Partieangebot.</p><p style="margin-bottom:0;">Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return { ok:true, mailType:'daily_offer_accepted', recipientEmail, recipientName, subject, textPart, htmlPart };
}

function prepareDailyResultEmail(payload) {
  const recipientEmail = normalizeEmail(payload && payload.recipientEmail);
  const recipientName = cleanDisplayName(payload && payload.recipientName) || 'Schachfreund';
  const opponentName = cleanDisplayName(payload && payload.opponentName) || 'dein Gegner';
  const inviteUrl = String(payload && payload.inviteUrl || '').trim();
  const role = payload && payload.role === 'b' ? 'b' : 'w';
  const result = String(payload && payload.result || '*');
  const endReason = dailyNotificationEndReasonLabel(payload && payload.endReason);
  const endedAt = formatNotificationDateTime(payload && payload.endedAt);
  const variantLabel = String(payload && payload.variantLabel || 'Daily Chess').slice(0, 120);
  const outcome = result === '1/2-1/2' ? 'Remis' : result === '1-0' ? (role === 'w' ? 'Gewonnen' : 'Verloren') : result === '0-1' ? (role === 'b' ? 'Gewonnen' : 'Verloren') : 'Beendet';
  if (!recipientEmail || !inviteUrl) return { ok:false, status:400, code:'INVALID_DAILY_RESULT_MAIL', message:'Die Ergebnisbenachrichtigung konnte nicht vorbereitet werden.' };
  const subject = `Daily-Partie beendet – ${outcome} gegen ${opponentName}`;
  const details = [`Ergebnis: ${dailyNotificationResultLabel(result)}`, `Ausgang für dich: ${outcome}`, `Beendigungsgrund: ${endReason}`, `Spielmodus: ${variantLabel}`];
  if (endedAt) details.push(`Beendet: ${endedAt}`);
  const textPart = `Hallo ${recipientName},\n\ndeine Daily-Partie gegen ${opponentName} ist beendet.\n\n${details.join('\n')}\n\nPartie ansehen:\n${inviteUrl}\n\nDiese Benachrichtigung kannst du in deiner Accountverwaltung abschalten.\n\nViele Grüße\nHammerschach-Gamer`;
  const detailHtml = details.map(line => escapeEmailHtml(line)).join('<br>');
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><h2 style="margin:0 0 18px;color:#843f46;">Daily-Partie beendet</h2><p>Hallo ${escapeEmailHtml(recipientName)},</p><p>deine Daily-Partie gegen <strong>${escapeEmailHtml(opponentName)}</strong> ist beendet.</p><div style="margin:18px 0;padding:12px 14px;background:#f6f1f2;border:1px solid #e5d3d6;border-radius:10px;line-height:1.55;">${detailHtml}</div><p style="margin:22px 0;"><a href="${escapeEmailHtml(inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">Partie ansehen</a></p><p style="font-size:13px;color:#666;word-break:break-all;">Falls die Schaltfläche nicht funktioniert:<br>${escapeEmailHtml(inviteUrl)}</p><hr style="border:0;border-top:1px solid #eee;margin:22px 0;"><p style="font-size:12px;color:#777;">Diese Benachrichtigung kannst du in deiner Accountverwaltung abschalten.</p><p style="margin-bottom:0;">Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return { ok:true, mailType:'daily_result', recipientEmail, recipientName, subject, textPart, htmlPart };
}

async function loadEmailNotificationRecipient(env, userId, preferenceName) {
  const id = String(userId || '').trim();
  if (!id || !env || !env.DB) return { ok:false, reason:'invalid_user' };
  const user = await env.DB.prepare(`SELECT id, username, email FROM users WHERE id = ? LIMIT 1`).bind(id).first();
  const email = normalizeEmail(user && user.email);
  if (!user || !email) return { ok:false, reason:'user_or_email_missing' };
  const emailSecurity = await getUserEmailSecurityState(env, user);
  if (!emailSecurity.emailVerified) return { ok:false, reason:'email_not_verified' };
  const preferences = await getUserEmailPreferences(env, id);
  if (preferenceName && preferences[preferenceName] === false) return { ok:false, reason:'disabled' };
  return { ok:true, user, email, preferences };
}

async function sendPreparedTransactionalEmail(env, mail) {
  if (!mail || !mail.ok) return mail || { ok:false, status:400, code:'MAIL_NOT_PREPARED', message:'Die Nachricht konnte nicht vorbereitet werden.' };
  return sendInvitationEmail(env, { preparedMail:mail, mailType:mail.mailType || 'transactional' });
}

async function sendDailyTurnEmailNotification(env, payload) {
  const recipient = await loadEmailNotificationRecipient(env, payload && payload.recipientUserId, 'dailyTurnEnabled');
  if (!recipient.ok) return { ok:true, skipped:true, reason:recipient.reason };
  const claim = await claimEmailNotification(env, payload.notificationKey, 'daily_turn', recipient.user.id, payload.roomId);
  if (!claim.claimed) return { ok:true, skipped:true, reason:claim.reason };
  let result;
  try {
    const mail = prepareDailyTurnEmail({ ...payload, recipientEmail:recipient.email, recipientName:recipient.user.username });
    result = await sendPreparedTransactionalEmail(env, mail);
  } catch (error) {
    result = { ok:false, code:'DAILY_TURN_MAIL_FAILED', message:error && error.message ? error.message : 'Zugbenachrichtigung fehlgeschlagen.' };
  }
  try { await completeEmailNotification(env, claim.key, result); } catch (_) {}
  return result;
}

async function sendDailyOpenOfferAcceptedEmailNotification(env, payload) {
  // Die Annahme eines eigenen offenen Daily-Angebots ist eine notwendige
  // Partieinformation und deshalb nicht von den optionalen Zugmails abhängig.
  const recipient = await loadEmailNotificationRecipient(env, payload && payload.recipientUserId, null);
  if (!recipient.ok) return { ok:true, skipped:true, reason:recipient.reason };
  const claim = await claimEmailNotification(env, payload.notificationKey, 'daily_offer_accepted', recipient.user.id, payload.roomId);
  if (!claim.claimed) return { ok:true, skipped:true, reason:claim.reason };
  let result;
  try {
    const mail = prepareDailyOpenOfferAcceptedEmail({ ...payload, recipientEmail:recipient.email, recipientName:recipient.user.username });
    result = await sendPreparedTransactionalEmail(env, mail);
  } catch (error) {
    result = { ok:false, code:'DAILY_OFFER_ACCEPTED_MAIL_FAILED', message:error && error.message ? error.message : 'Annahmebestätigung fehlgeschlagen.' };
  }
  try { await completeEmailNotification(env, claim.key, result); } catch (_) {}
  return result;
}

async function sendDailyResultEmailNotification(env, payload) {
  const recipient = await loadEmailNotificationRecipient(env, payload && payload.recipientUserId, 'dailyResultEnabled');
  if (!recipient.ok) return { ok:true, skipped:true, reason:recipient.reason };
  const claim = await claimEmailNotification(env, payload.notificationKey, 'daily_result', recipient.user.id, payload.roomId);
  if (!claim.claimed) return { ok:true, skipped:true, reason:claim.reason };
  let result;
  try {
    const mail = prepareDailyResultEmail({ ...payload, recipientEmail:recipient.email, recipientName:recipient.user.username });
    result = await sendPreparedTransactionalEmail(env, mail);
  } catch (error) {
    result = { ok:false, code:'DAILY_RESULT_MAIL_FAILED', message:error && error.message ? error.message : 'Ergebnisbenachrichtigung fehlgeschlagen.' };
  }
  try { await completeEmailNotification(env, claim.key, result); } catch (_) {}
  return result;
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
       invited_user_id TEXT,
       invited_name TEXT,
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
       end_reason TEXT,
       rated INTEGER NOT NULL DEFAULT 1
     )`
  ).run();
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN invited_user_id TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN invited_name TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN rated INTEGER NOT NULL DEFAULT 1`).run(); } catch (_) {}
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
  await ensureTournamentTables(env);
  await ensureInvitationEmailLogTable(env);
  await ensureUserPresenceTable(env);
  const onlineSince = presenceOnlineSinceIso();
  const result = await env.DB.prepare(
    `SELECT daily_games.room_id, daily_games.white_user_id, daily_games.black_user_id,
            COALESCE(white_account.username, daily_games.white_name) AS white_name,
            COALESCE(black_account.username, daily_games.black_name) AS black_name,
            COALESCE(
              invited_account.username,
              daily_games.invited_name,
              (
                SELECT logged_recipient.username
                  FROM invitation_email_log invitation_log
                  JOIN users logged_recipient ON logged_recipient.id = invitation_log.recipient_user_id
                 WHERE invitation_log.room_id = daily_games.room_id
                   AND invitation_log.sender_user_id = ?
                 ORDER BY invitation_log.sent_at DESC
                 LIMIT 1
              )
            ) AS invited_name,
            daily_games.time_label, daily_games.days_per_move, daily_games.variant, daily_games.started,
            daily_games.started_at, daily_games.updated_at, daily_games.turn,
            daily_games.deadline_at, daily_games.ended, daily_games.ended_at,
            daily_games.result, daily_games.end_reason, daily_games.rated,
            tournament_game.tournament_id, tournament_game.round_number, tournament_game.pairing_number, tournament_game.game_number,
            tournament.name AS tournament_name, tournament_round.position_id AS tournament_position_id,
            CASE WHEN opponent_presence.last_seen_at >= ? THEN 1 ELSE 0 END AS opponent_online
       FROM daily_games
       LEFT JOIN users white_account ON white_account.id = daily_games.white_user_id
       LEFT JOIN users black_account ON black_account.id = daily_games.black_user_id
       LEFT JOIN users invited_account ON invited_account.id = daily_games.invited_user_id
       LEFT JOIN tournament_games tournament_game ON tournament_game.room_id = daily_games.room_id
       LEFT JOIN tournaments tournament ON tournament.id = tournament_game.tournament_id
       LEFT JOIN tournament_rounds tournament_round
         ON tournament_round.tournament_id = tournament_game.tournament_id
        AND tournament_round.round_number = tournament_game.round_number
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
  ).bind(sessionUser.id, onlineSince, sessionUser.id, sessionUser.id, sessionUser.id, sessionUser.id, sessionUser.id).all();

  return (result && result.results ? result.results : []).map(row => {
    const role = String(row.white_user_id || '') === String(sessionUser.id) ? 'w' : 'b';
    const turn = row.turn === 'b' ? 'b' : row.turn === 'w' ? 'w' : '';
    const opponentJoined = role === 'w' ? !!row.black_user_id : !!row.white_user_id;
    const joinedOpponentName = role === 'w' ? row.black_name : row.white_name;
    const invitedOpponentName = cleanDisplayName(row.invited_name || '');
    return {
      roomId: row.room_id,
      role,
      opponentName: joinedOpponentName || invitedOpponentName || 'noch offen',
      invitedOpponentName,
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
      endReason: row.end_reason || null,
      rated: Number(row.rated || 0) === 1,
      tournamentId:row.tournament_id || '',
      tournamentName:cleanTournamentName(row.tournament_name || ''),
      tournamentRound:row.tournament_id ? Number(row.round_number || 0) : null,
      tournamentPairing:row.tournament_id ? Number(row.pairing_number || 0) : null,
      tournamentGameNumber:row.tournament_id ? Number(row.game_number || 0) : null,
      tournamentPositionId:row.tournament_position_id === null || row.tournament_position_id === undefined ? null : Number(row.tournament_position_id),
      isTournamentGame:!!row.tournament_id
    };
  });
}


const TOURNAMENT_ALLOWED_PLAYERS = Object.freeze([4, 6, 8]);
const TOURNAMENT_ALLOWED_HOURS = Object.freeze([24, 48, 72]);
let tournamentTablesReady = false;

async function ensureTournamentTables(env) {
  if (!env || !env.DB) return false;
  if (tournamentTablesReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tournaments (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       description TEXT NOT NULL DEFAULT '',
       max_players INTEGER NOT NULL,
       hours_per_move INTEGER NOT NULL,
       rated INTEGER NOT NULL DEFAULT 1,
       variant TEXT NOT NULL DEFAULT 'standard',
       status TEXT NOT NULL DEFAULT 'draft',
       created_by_user_id TEXT NOT NULL,
       current_round INTEGER NOT NULL DEFAULT 0,
       total_rounds INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       published_at TEXT,
       started_at TEXT,
       ended_at TEXT,
       publication_mail_sent_at TEXT
     )`
  ).run();
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN publication_mail_sent_at TEXT`).run(); } catch (_) {}
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tournament_participants (
       tournament_id TEXT NOT NULL,
       user_id TEXT NOT NULL,
       status TEXT NOT NULL,
       joined_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (tournament_id, user_id)
     )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tournament_rounds (
       tournament_id TEXT NOT NULL,
       round_number INTEGER NOT NULL,
       position_id INTEGER,
       back_rank TEXT,
       status TEXT NOT NULL,
       started_at TEXT,
       ended_at TEXT,
       PRIMARY KEY (tournament_id, round_number)
     )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tournament_games (
       id TEXT PRIMARY KEY,
       tournament_id TEXT NOT NULL,
       round_number INTEGER NOT NULL,
       pairing_number INTEGER NOT NULL,
       game_number INTEGER NOT NULL,
       room_id TEXT NOT NULL UNIQUE,
       white_user_id TEXT NOT NULL,
       black_user_id TEXT NOT NULL,
       status TEXT NOT NULL,
       result TEXT NOT NULL DEFAULT '*',
       end_reason TEXT,
       created_at TEXT NOT NULL,
       ended_at TEXT
     )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tournament_views (
       tournament_id TEXT NOT NULL,
       user_id TEXT NOT NULL,
       viewed_at TEXT NOT NULL,
       PRIMARY KEY (tournament_id, user_id)
     )`
  ).run();
  await env.DB.batch([
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments (status, updated_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tournament_participants_status ON tournament_participants (tournament_id, status, joined_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tournament_games_round ON tournament_games (tournament_id, round_number, status)`),
    env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_games_slot ON tournament_games (tournament_id, round_number, pairing_number, game_number)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tournament_games_white ON tournament_games (white_user_id, status)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tournament_games_black ON tournament_games (black_user_id, status)`)
  ]);
  tournamentTablesReady = true;
  return true;
}

function cleanTournamentName(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function cleanTournamentDescription(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, 1200);
}

function normalizeTournamentVariant(value) {
  return String(value || '').toLowerCase() === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD;
}

function normalizeTournamentStatus(value) {
  const status = String(value || '').toLowerCase();
  return ['draft', 'open', 'full', 'running', 'ended', 'cancelled'].includes(status) ? status : 'draft';
}

function d1Changes(result) {
  return Math.max(0, Number(result && result.meta && result.meta.changes || result && result.changes || 0));
}

function tournamentStandings(participants, games) {
  const rows = new Map();
  for (const participant of participants || []) {
    if (!participant || participant.status !== 'confirmed') continue;
    rows.set(String(participant.userId), {
      userId:String(participant.userId),
      username:cleanDisplayName(participant.username) || 'Mitglied',
      played:0, wins:0, draws:0, losses:0, points:0
    });
  }
  for (const game of games || []) {
    if (!game || game.status !== 'ended') continue;
    const white = rows.get(String(game.whiteUserId));
    const black = rows.get(String(game.blackUserId));
    if (!white || !black) continue;
    white.played += 1;
    black.played += 1;
    if (game.result === '1-0') {
      white.wins += 1; white.points += 1; black.losses += 1;
    } else if (game.result === '0-1') {
      black.wins += 1; black.points += 1; white.losses += 1;
    } else if (game.result === '1/2-1/2') {
      white.draws += 1; black.draws += 1; white.points += 0.5; black.points += 0.5;
    }
  }
  return Array.from(rows.values()).sort((a, b) => b.points - a.points || b.wins - a.wins || a.username.localeCompare(b.username, 'de-DE', {sensitivity:'base'})).map((row, index) => Object.assign({rank:index + 1}, row));
}

async function tournamentParticipantsFor(env, tournamentId) {
  const result = await env.DB.prepare(
    `SELECT participant.user_id, participant.status, participant.joined_at, participant.updated_at,
            COALESCE(account.username, 'Gelöschter Benutzer') AS username
       FROM tournament_participants participant
       LEFT JOIN users account ON account.id = participant.user_id
      WHERE participant.tournament_id = ?
      ORDER BY CASE participant.status WHEN 'confirmed' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END,
               participant.joined_at ASC`
  ).bind(tournamentId).all();
  let waitingPosition = 0;
  return (result && result.results ? result.results : []).map(row => {
    if (row.status === 'waiting') waitingPosition += 1;
    return {
      userId:String(row.user_id || ''),
      username:cleanDisplayName(row.username) || 'Mitglied',
      status:String(row.status || ''),
      joinedAt:row.joined_at || null,
      updatedAt:row.updated_at || null,
      waitlistPosition:row.status === 'waiting' ? waitingPosition : null
    };
  });
}

async function rebalanceTournamentParticipants(env, tournamentId, maxPlayers) {
  const result = await env.DB.prepare(
    `SELECT user_id, status FROM tournament_participants
      WHERE tournament_id = ? AND status IN ('confirmed','waiting')
      ORDER BY joined_at ASC, user_id ASC`
  ).bind(tournamentId).all();
  const rows = result && result.results ? result.results : [];
  const now = new Date().toISOString();
  for (let index = 0; index < rows.length; index += 1) {
    const desired = index < Number(maxPlayers || 0) ? 'confirmed' : 'waiting';
    if (rows[index].status === desired) continue;
    await env.DB.prepare(
      `UPDATE tournament_participants SET status = ?, updated_at = ? WHERE tournament_id = ? AND user_id = ?`
    ).bind(desired, now, tournamentId, rows[index].user_id).run();
  }
  return {confirmed:Math.min(rows.length, Number(maxPlayers || 0)), waiting:Math.max(0, rows.length - Number(maxPlayers || 0))};
}

async function tournamentRoundsFor(env, tournamentId) {
  const result = await env.DB.prepare(
    `SELECT round_number, position_id, back_rank, status, started_at, ended_at
       FROM tournament_rounds WHERE tournament_id = ? ORDER BY round_number ASC`
  ).bind(tournamentId).all();
  return (result && result.results ? result.results : []).map(row => ({
    roundNumber:Number(row.round_number || 0),
    positionId:row.position_id === null || row.position_id === undefined ? null : Number(row.position_id),
    backRank:row.back_rank || '',
    status:String(row.status || ''),
    startedAt:row.started_at || null,
    endedAt:row.ended_at || null
  }));
}

async function tournamentGamesFor(env, tournamentId) {
  const result = await env.DB.prepare(
    `SELECT game.id, game.round_number, game.pairing_number, game.game_number, game.room_id,
            game.white_user_id, game.black_user_id, game.status, game.result, game.end_reason,
            game.created_at, game.ended_at,
            COALESCE(white_account.username, 'Gelöschter Benutzer') AS white_name,
            COALESCE(black_account.username, 'Gelöschter Benutzer') AS black_name
       FROM tournament_games game
       LEFT JOIN users white_account ON white_account.id = game.white_user_id
       LEFT JOIN users black_account ON black_account.id = game.black_user_id
      WHERE game.tournament_id = ?
      ORDER BY game.round_number ASC, game.pairing_number ASC, game.game_number ASC`
  ).bind(tournamentId).all();
  return (result && result.results ? result.results : []).map(row => ({
    id:String(row.id || ''),
    roundNumber:Number(row.round_number || 0),
    pairingNumber:Number(row.pairing_number || 0),
    gameNumber:Number(row.game_number || 0),
    roomId:String(row.room_id || ''),
    whiteUserId:String(row.white_user_id || ''),
    blackUserId:String(row.black_user_id || ''),
    whiteName:cleanDisplayName(row.white_name) || 'Weiß',
    blackName:cleanDisplayName(row.black_name) || 'Schwarz',
    status:String(row.status || ''),
    result:String(row.result || '*'),
    endReason:row.end_reason || null,
    createdAt:row.created_at || null,
    endedAt:row.ended_at || null
  }));
}

async function tournamentDto(env, row, sessionUser) {
  const id = String(row.id || '');
  const participants = await tournamentParticipantsFor(env, id);
  const rounds = await tournamentRoundsFor(env, id);
  const games = await tournamentGamesFor(env, id);
  const own = participants.find(item => String(item.userId) === String(sessionUser && sessionUser.id || ''));
  const confirmedCount = participants.filter(item => item.status === 'confirmed').length;
  const waitingCount = participants.filter(item => item.status === 'waiting').length;
  const status = normalizeTournamentStatus(row.status);
  const userState = own ? (status === 'running' ? 'playing' : status === 'ended' ? 'finished' : own.status) : '';
  return {
    id,
    name:cleanTournamentName(row.name),
    description:cleanTournamentDescription(row.description),
    players:Number(row.max_players || 0),
    hours:Number(row.hours_per_move || 24),
    rated:Number(row.rated || 0) === 1,
    variant:normalizeTournamentVariant(row.variant),
    status,
    currentRound:Number(row.current_round || 0),
    totalRounds:Number(row.total_rounds || 0),
    createdAt:row.created_at || null,
    updatedAt:row.updated_at || null,
    publishedAt:row.published_at || null,
    startedAt:row.started_at || null,
    endedAt:row.ended_at || null,
    createdByUserId:String(row.created_by_user_id || ''),
    confirmedCount,
    waitingCount,
    participants,
    rounds,
    games,
    standings:tournamentStandings(participants, games),
    userState,
    waitlistPosition:own && own.status === 'waiting' ? own.waitlistPosition : null,
    unread:!!(row.published_at && (!row.viewed_at || Date.parse(row.viewed_at) < Date.parse(row.published_at)))
  };
}

async function listTournaments(env, sessionUser) {
  if (!(await ensureTournamentTables(env)) || !sessionUser) return [];
  const admin = isAdminUser(sessionUser, env);
  const result = await env.DB.prepare(
    `SELECT tournament.*, view.viewed_at
       FROM tournaments tournament
       LEFT JOIN tournament_views view ON view.tournament_id = tournament.id AND view.user_id = ?
      WHERE tournament.status <> 'draft' OR ? = 1
      ORDER BY CASE tournament.status WHEN 'open' THEN 0 WHEN 'full' THEN 1 WHEN 'running' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END,
               COALESCE(tournament.published_at, tournament.updated_at) DESC`
  ).bind(sessionUser.id, admin ? 1 : 0).all();
  const rows = result && result.results ? result.results : [];
  const tournaments = [];
  for (const row of rows) tournaments.push(await tournamentDto(env, row, sessionUser));
  return tournaments;
}

async function loadTournamentRow(env, tournamentId) {
  if (!(await ensureTournamentTables(env))) return null;
  return env.DB.prepare(`SELECT * FROM tournaments WHERE id = ? LIMIT 1`).bind(String(tournamentId || '')).first();
}

function tournamentRoundArrangement(participants, roundNumber) {
  const players = (participants || []).slice();
  for (let round = 1; round < roundNumber; round += 1) {
    players.splice(1, 0, players.pop());
  }
  const pairs = [];
  for (let index = 0; index < players.length / 2; index += 1) pairs.push([players[index], players[players.length - 1 - index]]);
  return pairs;
}

function randomTournamentPositionId(usedIds) {
  const used = new Set((usedIds || []).map(Number));
  const possible = [];
  for (let id = 0; id < 960; id += 1) {
    if (used.has(id) || chess960BackRankById(id) === STANDARD_BACK_RANK) continue;
    possible.push(id);
  }
  if (!possible.length) throw new Error('Keine freie Freestyle-Stellung verfügbar.');
  const data = new Uint32Array(1);
  crypto.getRandomValues(data);
  return possible[data[0] % possible.length];
}

function tournamentRoomId(tournamentId, roundNumber, pairingNumber, gameNumber) {
  const compact = String(tournamentId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return cleanRoomId(`T${compact}R${roundNumber}P${pairingNumber}G${gameNumber}${random}`);
}

async function initializeTournamentGameRoom(env, payload) {
  if (!env || !env.GAME_ROOM) throw new Error('Der Spielraum-Dienst ist nicht verfügbar.');
  const roomId = cleanRoomId(payload && payload.roomId);
  const id = env.GAME_ROOM.idFromName(roomId);
  const stub = env.GAME_ROOM.get(id);
  const response = await stub.fetch(new Request('https://game-room.internal/tournament-init?room=' + encodeURIComponent(roomId), {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(payload)
  }));
  let result = null;
  try { result = await response.json(); } catch (_) {}
  if (!response.ok || !result || !result.ok) throw new Error(result && result.message ? result.message : 'Turnierpartie konnte nicht vorbereitet werden.');
  return result;
}

async function startTournamentRound(env, tournamentRow, roundNumber) {
  const tournamentId = String(tournamentRow && tournamentRow.id || '');
  const participants = (await tournamentParticipantsFor(env, tournamentId)).filter(item => item.status === 'confirmed');
  if (!TOURNAMENT_ALLOWED_PLAYERS.includes(participants.length)) throw new Error('Die Teilnehmerzahl ist für den Turnierstart nicht vollständig.');
  const variant = normalizeTournamentVariant(tournamentRow.variant);
  let positionId = null;
  let backRank = '';
  const existingRound = await env.DB.prepare(
    `SELECT position_id, back_rank FROM tournament_rounds WHERE tournament_id = ? AND round_number = ? LIMIT 1`
  ).bind(tournamentId, roundNumber).first();
  if (variant === GAME_VARIANT_FREESTYLE && existingRound) {
    positionId = Number(existingRound.position_id);
    backRank = String(existingRound.back_rank || chess960BackRankById(positionId));
  } else if (variant === GAME_VARIANT_FREESTYLE) {
    const used = await tournamentRoundsFor(env, tournamentId);
    positionId = randomTournamentPositionId(used.map(item => item.positionId).filter(value => value !== null));
    backRank = chess960BackRankById(positionId);
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO tournament_rounds (tournament_id, round_number, position_id, back_rank, status, started_at, ended_at)
     VALUES (?, ?, ?, ?, 'running', ?, NULL)
     ON CONFLICT(tournament_id, round_number) DO NOTHING`
  ).bind(tournamentId, roundNumber, positionId, backRank || null, now).run();

  const setup = cleanGameSetup(variant === GAME_VARIANT_FREESTYLE ? {variant, positionId, backRank} : {variant:GAME_VARIANT_STANDARD});
  const pairs = tournamentRoundArrangement(participants, roundNumber);
  for (let pairingIndex = 0; pairingIndex < pairs.length; pairingIndex += 1) {
    const pair = pairs[pairingIndex];
    for (let gameIndex = 0; gameIndex < 2; gameIndex += 1) {
      const white = gameIndex === 0 ? pair[0] : pair[1];
      const black = gameIndex === 0 ? pair[1] : pair[0];
      const existingGame = await env.DB.prepare(
        `SELECT id, room_id, status FROM tournament_games
          WHERE tournament_id = ? AND round_number = ? AND pairing_number = ? AND game_number = ? LIMIT 1`
      ).bind(tournamentId, roundNumber, pairingIndex + 1, gameIndex + 1).first();
      if (existingGame && ['running', 'ended'].includes(String(existingGame.status || ''))) continue;
      const gameId = existingGame ? String(existingGame.id) : crypto.randomUUID();
      const roomId = existingGame ? String(existingGame.room_id) : tournamentRoomId(tournamentId, roundNumber, pairingIndex + 1, gameIndex + 1);
      if (!existingGame) {
        await env.DB.prepare(
          `INSERT INTO tournament_games
             (id, tournament_id, round_number, pairing_number, game_number, room_id, white_user_id, black_user_id, status, result, end_reason, created_at, ended_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'creating', '*', NULL, ?, NULL)`
        ).bind(gameId, tournamentId, roundNumber, pairingIndex + 1, gameIndex + 1, roomId, white.userId, black.userId, now).run();
      }
      await initializeTournamentGameRoom(env, {
        roomId,
        tournamentGameId:gameId,
        tournamentId,
        tournamentName:cleanTournamentName(tournamentRow.name),
        roundNumber,
        totalRounds:Number(tournamentRow.total_rounds || participants.length - 1),
        pairingNumber:pairingIndex + 1,
        gameNumber:gameIndex + 1,
        white:{userId:white.userId, username:white.username},
        black:{userId:black.userId, username:black.username},
        hoursPerMove:Number(tournamentRow.hours_per_move || 24),
        rated:Number(tournamentRow.rated || 0) === 1,
        gameSetup:setup,
        createdByUserId:String(tournamentRow.created_by_user_id || '')
      });
      await env.DB.prepare(`UPDATE tournament_games SET status = 'running' WHERE id = ?`).bind(gameId).run();
    }
  }
  return {roundNumber, positionId, backRank};
}

async function advanceTournamentRoundIfReady(env, tournamentId, roundNumber) {
  if (!(await ensureTournamentTables(env))) return;
  const remaining = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM tournament_games
      WHERE tournament_id = ? AND round_number = ? AND status <> 'ended'`
  ).bind(tournamentId, roundNumber).first();
  if (Number(remaining && remaining.count || 0) > 0) return;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE tournament_rounds SET status = 'ended', ended_at = COALESCE(ended_at, ?)
      WHERE tournament_id = ? AND round_number = ?`
  ).bind(now, tournamentId, roundNumber).run();
  const tournament = await loadTournamentRow(env, tournamentId);
  if (!tournament || tournament.status !== 'running' || Number(tournament.current_round || 0) !== Number(roundNumber)) return;
  if (Number(roundNumber) >= Number(tournament.total_rounds || 0)) {
    await env.DB.prepare(
      `UPDATE tournaments SET status = 'ended', ended_at = ?, updated_at = ?
        WHERE id = ? AND status = 'running' AND current_round = ?`
    ).bind(now, now, tournamentId, roundNumber).run();
    return;
  }
  const nextRound = Number(roundNumber) + 1;
  const changed = await env.DB.prepare(
    `UPDATE tournaments SET current_round = ?, updated_at = ?
      WHERE id = ? AND status = 'running' AND current_round = ?`
  ).bind(nextRound, now, tournamentId, roundNumber).run();
  if (d1Changes(changed) > 0) {
    const updated = await loadTournamentRow(env, tournamentId);
    try {
      await startTournamentRound(env, updated, nextRound);
    } catch (error) {
      await env.DB.prepare(
        `UPDATE tournaments SET current_round = ?, updated_at = ?
          WHERE id = ? AND status = 'running' AND current_round = ?`
      ).bind(roundNumber, new Date().toISOString(), tournamentId, nextRound).run();
      throw error;
    }
  }
}

async function syncTournamentGameResult(env, tournamentMeta, game) {
  if (!tournamentMeta || !tournamentMeta.tournamentId || !tournamentMeta.tournamentGameId || !(await ensureTournamentTables(env))) return;
  const ended = !!(game && game.ended);
  await env.DB.prepare(
    `UPDATE tournament_games
        SET status = ?, result = ?, end_reason = ?, ended_at = ?
      WHERE id = ? AND tournament_id = ?`
  ).bind(
    ended ? 'ended' : 'running',
    String(game && game.result || '*'),
    game && game.endReason ? String(game.endReason) : null,
    ended ? (game.endedAt || new Date().toISOString()) : null,
    String(tournamentMeta.tournamentGameId),
    String(tournamentMeta.tournamentId)
  ).run();
  if (ended) await advanceTournamentRoundIfReady(env, String(tournamentMeta.tournamentId), Number(tournamentMeta.roundNumber || 0));
}

function tournamentPublicUrl(env, tournamentId) {
  const base = configuredGamerPublicUrl(env);
  if (!base) return '';
  try {
    const url = new URL(base);
    url.searchParams.set('tournament', String(tournamentId || ''));
    return url.toString();
  } catch (_) { return base; }
}

function prepareTournamentPublishedEmail(env, tournament, recipient) {
  const link = tournamentPublicUrl(env, tournament.id);
  const name = cleanDisplayName(recipient.username) || 'Schachfreund';
  const title = cleanTournamentName(tournament.name);
  const variant = normalizeTournamentVariant(tournament.variant) === GAME_VARIANT_FREESTYLE ? 'Freestyle (Chess960)' : 'Klassisch';
  const subject = `Neues Hammerschach-Turnier: ${title}`;
  const textPart = `Hallo ${name},\n\nfür das Turnier „${title}“ ist die Anmeldung geöffnet.\n\n${tournament.max_players} Teilnehmer · ${tournament.hours_per_move} Stunden pro Zug · ${variant} · ${Number(tournament.rated || 0) === 1 ? 'gewertet' : 'ohne Rating'}\n\n${link ? `Turnier ansehen und Teilnahme bestätigen:\n${link}\n\n` : ''}Die Teilnahme wird erst nach deiner ausdrücklichen Bestätigung im Turnierbereich eingetragen.\n\nDu kannst Turniermails jederzeit in deiner Accountverwaltung ausschalten.\n\nViele Grüße\nHammerschach-Gamer`;
  const button = link ? `<p style="margin:22px 0;"><a href="${escapeEmailHtml(link)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">Turnier ansehen</a></p>` : '';
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><div style="font-size:12px;font-weight:bold;text-transform:uppercase;color:#777;">Hammerschach-Turniere</div><h2 style="color:#843f46;">${escapeEmailHtml(title)}</h2><p>Hallo ${escapeEmailHtml(name)},</p><p>für dieses Daily-Doppelrundenturnier ist die Anmeldung geöffnet.</p><p><strong>${Number(tournament.max_players)} Teilnehmer · ${Number(tournament.hours_per_move)} Stunden pro Zug · ${escapeEmailHtml(variant)} · ${Number(tournament.rated || 0) === 1 ? 'gewertet' : 'ohne Rating'}</strong></p>${button}<p>Die Teilnahme wird erst nach deiner ausdrücklichen Bestätigung im Turnierbereich eingetragen.</p><hr style="border:0;border-top:1px solid #eee;margin:22px 0;"><p style="font-size:12px;color:#777;">Turniermails kannst du jederzeit in deiner Accountverwaltung ausschalten.</p><p>Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return {ok:true, mailType:'tournament_published', recipientEmail:recipient.email, recipientName:name, subject, textPart, htmlPart, attachments:[]};
}

async function sendTournamentPublishedEmails(env, tournament) {
  await ensureUserEmailPreferencesTable(env);
  const usersResult = await env.DB.prepare(`SELECT id, username, email FROM users WHERE disabled = 0 OR disabled IS NULL ORDER BY id`).all();
  const users = usersResult && usersResult.results ? usersResult.results : [];
  let sent = 0;
  let failed = 0;
  for (const user of users) {
    const email = normalizeEmail(user && user.email);
    if (!email) continue;
    const preferences = await getUserEmailPreferences(env, user.id);
    if (!preferences.tournamentEnabled) continue;
    const security = await getUserEmailSecurityState(env, user);
    if (!security.emailVerified) continue;
    try {
      const result = await sendInvitationEmail(env, {preparedMail:prepareTournamentPublishedEmail(env, tournament, {username:user.username, email}), mailType:'tournament_published'});
      if (result && result.ok) sent += 1;
      else failed += 1;
    } catch (_) { failed += 1; }
  }
  return {sent, failed};
}


let completedGamesTableReady = false;
async function ensureCompletedGamesTable(env) {
  if (!env || !env.DB) return false;
  if (completedGamesTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS completed_games (
       room_id TEXT PRIMARY KEY,
       white_user_id TEXT,
       black_user_id TEXT,
       white_name TEXT NOT NULL,
       black_name TEXT NOT NULL,
       mode TEXT NOT NULL,
       time_label TEXT,
       days_per_move INTEGER,
       variant TEXT NOT NULL,
       position_id INTEGER,
       back_rank TEXT,
       started_at TEXT,
       ended_at TEXT NOT NULL,
       result TEXT NOT NULL,
       end_reason TEXT,
       rated INTEGER NOT NULL DEFAULT 0,
       pgn TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_completed_games_white ON completed_games (white_user_id, ended_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_completed_games_black ON completed_games (black_user_id, ended_at)`).run();
  completedGamesTableReady = true;
  return true;
}

function analyzerGameForUser(row, sessionUser, source = 'archive') {
  const role = String(row.white_user_id || '') === String(sessionUser.id) ? 'w' : 'b';
  return {
    roomId: row.room_id,
    role,
    whiteName: row.white_name || 'Weiß',
    blackName: row.black_name || 'Schwarz',
    opponentName: role === 'w' ? (row.black_name || 'Schwarz') : (row.white_name || 'Weiß'),
    mode: row.mode === 'daily' ? 'daily' : 'live',
    timeLabel: row.time_label || (row.mode === 'daily' ? 'Daily Chess' : 'Live'),
    daysPerMove: row.days_per_move ? Math.max(1, Number(row.days_per_move)) : null,
    variant: row.variant || GAME_VARIANT_STANDARD,
    positionId: Number.isFinite(Number(row.position_id)) ? Number(row.position_id) : null,
    startedAt: row.started_at || null,
    endedAt: row.ended_at || null,
    result: row.result || '*',
    endReason: row.end_reason || null,
    rated: Number(row.rated || 0) === 1,
    ended: true,
    source
  };
}

async function listAnalyzerGames(env, sessionUser) {
  if (!sessionUser) return [];
  await ensureDailyGamesTable(env);
  const byRoom = new Map();
  if (await ensureCompletedGamesTable(env)) {
    const result = await env.DB.prepare(
      `SELECT completed_games.*
         FROM completed_games
        WHERE (completed_games.white_user_id = ? OR completed_games.black_user_id = ?)
          AND NOT EXISTS (
            SELECT 1
              FROM daily_game_archives archived
             WHERE archived.room_id = completed_games.room_id
               AND archived.user_id = ?
          )
        ORDER BY completed_games.ended_at DESC
        LIMIT 200`
    ).bind(sessionUser.id, sessionUser.id, sessionUser.id).all();
    for (const row of (result && result.results ? result.results : [])) {
      byRoom.set(String(row.room_id), analyzerGameForUser(row, sessionUser, 'archive'));
    }
  }

  // Bereits vor dieser Erweiterung beendete Daily-Partien bleiben verfügbar.
  const dailyGames = await listDailyGames(env, sessionUser);
  for (const game of dailyGames) {
    if (!game || !game.ended || byRoom.has(String(game.roomId))) continue;
    byRoom.set(String(game.roomId), {
      roomId:game.roomId,
      role:game.role,
      whiteName:game.role === 'w' ? (sessionUser.username || 'Weiß') : (game.opponentName || 'Weiß'),
      blackName:game.role === 'b' ? (sessionUser.username || 'Schwarz') : (game.opponentName || 'Schwarz'),
      opponentName:game.opponentName || 'Gegner',
      mode:'daily',
      timeLabel:game.timeLabel || 'Daily Chess',
      daysPerMove:game.daysPerMove || null,
      variant:game.variant || GAME_VARIANT_STANDARD,
      positionId:null,
      startedAt:game.startedAt || null,
      endedAt:game.endedAt || null,
      result:game.result || '*',
      endReason:game.endReason || null,
      rated:game.rated !== false,
      ended:true,
      source:'daily'
    });
  }
  return Array.from(byRoom.values())
    .sort((a, b) => String(b.endedAt || '').localeCompare(String(a.endedAt || '')))
    .slice(0, 200);
}


const TRAINER_RATING_START = 1500;
const TRAINER_RATING_K = 24;
let trainerProgressTablesReady = false;

function cleanTrainerAttemptId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,100}$/.test(id) ? id : '';
}

function cleanTrainerPuzzleId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : '';
}

function trainerProgressPayload(row) {
  return {
    rating:Math.round(Number(row && row.rating || TRAINER_RATING_START)),
    attempts:Math.max(0, Math.floor(Number(row && row.attempts || 0))),
    solved:Math.max(0, Math.floor(Number(row && row.solved || 0))),
    failed:Math.max(0, Math.floor(Number(row && row.failed || 0))),
    updatedAt:row && row.updated_at ? row.updated_at : null
  };
}

async function ensureTrainerProgressTables(env) {
  if (!env || !env.DB) return false;
  if (trainerProgressTablesReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS trainer_progress (
       user_id TEXT PRIMARY KEY,
       rating INTEGER NOT NULL DEFAULT 1500,
       attempts INTEGER NOT NULL DEFAULT 0,
       solved INTEGER NOT NULL DEFAULT 0,
       failed INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS trainer_attempts (
       attempt_id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       puzzle_id TEXT NOT NULL,
       puzzle_rating INTEGER NOT NULL,
       result TEXT NOT NULL,
       rating_before INTEGER NOT NULL,
       rating_after INTEGER NOT NULL,
       rating_change INTEGER NOT NULL,
       created_at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_trainer_attempts_user_time ON trainer_attempts (user_id, created_at)`).run();
  trainerProgressTablesReady = true;
  return true;
}

async function getTrainerProgress(env, userId) {
  if (!userId || !(await ensureTrainerProgressTables(env))) return trainerProgressPayload(null);
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO trainer_progress
       (user_id, rating, attempts, solved, failed, created_at, updated_at)
     VALUES (?, ?, 0, 0, 0, ?, ?)`
  ).bind(String(userId), TRAINER_RATING_START, nowIso, nowIso).run();
  const row = await env.DB.prepare(`SELECT * FROM trainer_progress WHERE user_id = ? LIMIT 1`).bind(String(userId)).first();
  return trainerProgressPayload(row);
}

function calculateTrainerRatingChange(playerRating, puzzleRating, result) {
  const current = Math.max(100, Math.min(4000, Math.round(Number(playerRating || TRAINER_RATING_START))));
  const puzzle = Math.max(800, Math.min(2400, Math.round(Number(puzzleRating || 1200))));
  const expected = 1 / (1 + Math.pow(10, (puzzle - current) / 400));
  const actual = result === 'success' ? 1 : 0;
  let change = Math.round(TRAINER_RATING_K * (actual - expected));
  if (change === 0) change = actual ? 1 : -1;
  const next = Math.max(100, Math.min(4000, current + change));
  return { current, next, change:next - current, puzzle };
}

async function saveTrainerAttempt(env, userId, input) {
  if (!userId || !(await ensureTrainerProgressTables(env))) {
    return {ok:false, status:503, code:'TRAINER_DB_UNAVAILABLE', message:'Das Taktik-Rating ist momentan nicht verfügbar.'};
  }
  const attemptId = cleanTrainerAttemptId(input && input.attemptId);
  const puzzleId = cleanTrainerPuzzleId(input && input.puzzleId);
  const result = input && input.result === 'success' ? 'success' : (input && input.result === 'fail' ? 'fail' : '');
  const puzzleRating = Math.max(800, Math.min(2400, Math.round(Number(input && input.puzzleRating || 1200))));
  if (!attemptId || !puzzleId || !result) {
    return {ok:false, status:400, code:'INVALID_TRAINER_ATTEMPT', message:'Das Taktik-Ergebnis ist unvollständig.'};
  }

  const existing = await env.DB.prepare(`SELECT * FROM trainer_attempts WHERE attempt_id = ? LIMIT 1`).bind(attemptId).first();
  if (existing) {
    if (String(existing.user_id || '') !== String(userId)) {
      return {ok:false, status:409, code:'TRAINER_ATTEMPT_CONFLICT', message:'Dieser Trainingsversuch gehört zu einem anderen Account.'};
    }
    return {
      ok:true,
      alreadySaved:true,
      ratingChange:Number(existing.rating_change || 0),
      progress:await getTrainerProgress(env, userId)
    };
  }

  const progress = await getTrainerProgress(env, userId);
  const rating = calculateTrainerRatingChange(progress.rating, puzzleRating, result);
  const nowIso = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO trainer_attempts
           (attempt_id, user_id, puzzle_id, puzzle_rating, result,
            rating_before, rating_after, rating_change, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(attemptId, String(userId), puzzleId, rating.puzzle, result, rating.current, rating.next, rating.change, nowIso),
      env.DB.prepare(
        `UPDATE trainer_progress
            SET rating = ?, attempts = attempts + 1,
                solved = solved + ?, failed = failed + ?, updated_at = ?
          WHERE user_id = ?`
      ).bind(rating.next, result === 'success' ? 1 : 0, result === 'fail' ? 1 : 0, nowIso, String(userId))
    ]);
  } catch (error) {
    const duplicate = await env.DB.prepare(`SELECT * FROM trainer_attempts WHERE attempt_id = ? AND user_id = ? LIMIT 1`).bind(attemptId, String(userId)).first();
    if (!duplicate) throw error;
    return {
      ok:true,
      alreadySaved:true,
      ratingChange:Number(duplicate.rating_change || 0),
      progress:await getTrainerProgress(env, userId)
    };
  }
  return {ok:true, ratingChange:rating.change, progress:await getTrainerProgress(env, userId)};
}


let publicGamesTableReady = false;
async function ensurePublicGamesTable(env) {
  if (!env || !env.DB) return false;
  if (publicGamesTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS public_games (
       room_id TEXT PRIMARY KEY,
       spectator_id TEXT NOT NULL UNIQUE,
       white_user_id TEXT,
       black_user_id TEXT,
       white_name TEXT NOT NULL,
       black_name TEXT NOT NULL,
       mode TEXT NOT NULL,
       time_label TEXT,
       days_per_move INTEGER,
       variant TEXT,
       position_id INTEGER,
       started_at TEXT,
       updated_at TEXT NOT NULL,
       turn TEXT,
       moves_count INTEGER NOT NULL DEFAULT 0,
       last_move_san TEXT,
       public_game INTEGER NOT NULL DEFAULT 1,
       ended INTEGER NOT NULL DEFAULT 0
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_public_games_running ON public_games (public_game, ended, updated_at)`).run();
  publicGamesTableReady = true;
  return true;
}

async function listPublicGames(env, sessionUser = null) {
  if (!(await ensurePublicGamesTable(env))) return [];
  const result = await env.DB.prepare(
    `SELECT public_games.room_id,
            public_games.spectator_id,
            public_games.white_user_id,
            public_games.black_user_id,
            COALESCE(white_account.username, public_games.white_name) AS white_name,
            COALESCE(black_account.username, public_games.black_name) AS black_name,
            public_games.mode, public_games.time_label, public_games.days_per_move,
            public_games.variant, public_games.position_id, public_games.started_at,
            public_games.updated_at, public_games.turn, public_games.moves_count,
            public_games.last_move_san
       FROM public_games
       LEFT JOIN users white_account ON white_account.id = public_games.white_user_id
       LEFT JOIN users black_account ON black_account.id = public_games.black_user_id
      WHERE public_games.public_game = 1
        AND public_games.ended = 0
      ORDER BY public_games.updated_at DESC
      LIMIT 100`
  ).all();
  const currentUserId = sessionUser && sessionUser.id ? String(sessionUser.id) : '';
  return (result && result.results ? result.results : []).map(row => {
    const whiteUserId = String(row.white_user_id || '');
    const blackUserId = String(row.black_user_id || '');
    const participantRole = currentUserId && currentUserId === whiteUserId
      ? 'w'
      : currentUserId && currentUserId === blackUserId
        ? 'b'
        : '';
    const isParticipant = !!participantRole;
    return {
      watchId: cleanPublicWatchId(row.spectator_id),
      roomId: isParticipant ? cleanRoomId(row.room_id) : '',
      isParticipant,
      participantRole,
      whiteName: cleanDisplayName(row.white_name) || 'Weiß',
      blackName: cleanDisplayName(row.black_name) || 'Schwarz',
      mode: row.mode === 'daily' ? 'daily' : 'live',
      timeLabel: row.time_label || '',
      daysPerMove: Math.max(0, Number(row.days_per_move || 0)),
      variant: row.variant === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD,
      positionId: row.position_id === null || row.position_id === undefined ? null : Number(row.position_id),
      startedAt: row.started_at || null,
      updatedAt: row.updated_at || null,
      turn: row.turn === 'b' ? 'b' : 'w',
      movesCount: Math.max(0, Number(row.moves_count || 0)),
      lastMoveSan: String(row.last_move_san || '').slice(0, 24)
    };
  }).filter(game => !!game.watchId);
}


let openGameOffersTableReady = false;
async function ensureOpenGameOffersTable(env) {
  if (!env || !env.DB) return false;
  if (openGameOffersTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS open_game_offers (
       room_id TEXT PRIMARY KEY,
       creator_user_id TEXT NOT NULL,
       creator_name TEXT NOT NULL,
       creator_role TEXT NOT NULL,
       opponent_role TEXT NOT NULL,
       mode TEXT NOT NULL,
       time_label TEXT,
       days_per_move INTEGER,
       variant TEXT,
       position_id INTEGER,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       offer_status TEXT NOT NULL DEFAULT 'open',
       rated_requested INTEGER NOT NULL DEFAULT 1
     )`
  ).run();
  try { await env.DB.prepare(`ALTER TABLE open_game_offers ADD COLUMN rated_requested INTEGER NOT NULL DEFAULT 1`).run(); } catch (_) {}
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_open_game_offers_status ON open_game_offers (offer_status, updated_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_open_game_offers_creator ON open_game_offers (creator_user_id, offer_status)`).run();
  openGameOffersTableReady = true;
  return true;
}

async function listOpenGameOffers(env, sessionUser = null) {
  if (!(await ensureOpenGameOffersTable(env))) return [];
  const currentUserId = sessionUser && sessionUser.id ? String(sessionUser.id) : '';
  const result = await env.DB.prepare(
    `SELECT open_game_offers.room_id,
            open_game_offers.creator_user_id,
            COALESCE(users.username, open_game_offers.creator_name) AS creator_name,
            open_game_offers.creator_role,
            open_game_offers.opponent_role,
            open_game_offers.mode,
            open_game_offers.time_label,
            open_game_offers.days_per_move,
            open_game_offers.variant,
            open_game_offers.position_id,
            open_game_offers.rated_requested,
            open_game_offers.created_at,
            open_game_offers.updated_at
       FROM open_game_offers
       LEFT JOIN users ON users.id = open_game_offers.creator_user_id
      WHERE open_game_offers.offer_status = 'open'
      ORDER BY open_game_offers.updated_at DESC
      LIMIT 100`
  ).all();
  return (result && result.results ? result.results : []).map(row => ({
    roomId: cleanRoomId(row.room_id),
    creatorName: cleanDisplayName(row.creator_name) || 'Mitglied',
    creatorRole: row.creator_role === 'b' ? 'b' : 'w',
    opponentRole: row.opponent_role === 'w' ? 'w' : 'b',
    mode: row.mode === 'daily' ? 'daily' : 'live',
    timeLabel: String(row.time_label || ''),
    daysPerMove: Math.max(0, Number(row.days_per_move || 0)),
    variant: row.variant === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD,
    positionId: row.position_id === null || row.position_id === undefined ? null : Number(row.position_id),
    rated: Number(row.rated_requested || 0) === 1,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    mine: !!(currentUserId && String(row.creator_user_id || '') === currentUserId)
  })).filter(offer => !!offer.roomId);
}


const RATING_START = 1500;
const RATING_START_DEVIATION = 350;
const RATING_START_VOLATILITY = 0.06;
const RATING_PROVISIONAL_DEVIATION = 110;
const RATING_GLICKO2_TAU = 0.75;
const RATING_GLICKO2_SCALE = 173.7178;
const RATING_PERIOD_MS = 24 * 60 * 60 * 1000;
const RATING_SYSTEM_VERSION = 1;
const RATING_SERVICE_ROOM = '__hammerschach_rating_service_v1__';
const RATING_TYPES = Object.freeze([
  { key:'daily_classic', label:'Daily Classic' },
  { key:'daily_freestyle', label:'Daily Freestyle' },
  { key:'live_classic', label:'Live Classic' },
  { key:'live_rapid', label:'Live Rapid' },
  { key:'live_blitz', label:'Live Blitz' },
  { key:'live_freestyle', label:'Live Freestyle' }
]);
const RATING_TYPE_KEYS = new Set(RATING_TYPES.map(item => item.key));
let ratingTablesReady = false;

function ratingTypeInfo(key) {
  return RATING_TYPES.find(item => item.key === String(key || '')) || null;
}

function ratingTypeFromGame(timeControl, setup) {
  const control = cleanTimeControl(timeControl || null);
  if (!control) return null;
  const variant = setup && String(setup.variant || '').toLowerCase() === 'freestyle960' ? 'freestyle960' : 'standard';
  if (control.mode === 'daily') return variant === 'freestyle960' ? 'daily_freestyle' : 'daily_classic';
  if (variant === 'freestyle960') return 'live_freestyle';
  const category = String(control.category || '').toLowerCase();
  if (category === 'classic') return 'live_classic';
  if (category === 'rapid') return 'live_rapid';
  if (category === 'blitz') return 'live_blitz';
  return null;
}

function ratingDisplayValue(rating, deviation) {
  const rounded = Math.round(Number.isFinite(Number(rating)) ? Number(rating) : RATING_START);
  return String(rounded) + (Number(deviation || RATING_START_DEVIATION) > RATING_PROVISIONAL_DEVIATION ? '?' : '');
}

async function ensureRatingTables(env) {
  if (!env || !env.DB) return false;
  if (ratingTablesReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS user_ratings (
       user_id TEXT NOT NULL,
       rating_type TEXT NOT NULL,
       rating REAL NOT NULL DEFAULT 1500,
       deviation REAL NOT NULL DEFAULT 350,
       volatility REAL NOT NULL DEFAULT 0.06,
       games INTEGER NOT NULL DEFAULT 0,
       wins INTEGER NOT NULL DEFAULT 0,
       draws INTEGER NOT NULL DEFAULT 0,
       losses INTEGER NOT NULL DEFAULT 0,
       last_played_at TEXT,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (user_id, rating_type)
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_user_ratings_user ON user_ratings (user_id, rating_type)`).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS rated_games (
       room_id TEXT PRIMARY KEY,
       rating_type TEXT NOT NULL,
       white_user_id TEXT NOT NULL,
       black_user_id TEXT NOT NULL,
       result TEXT NOT NULL,
       white_rating_before REAL NOT NULL,
       white_deviation_before REAL NOT NULL,
       white_rating_after REAL NOT NULL,
       white_deviation_after REAL NOT NULL,
       black_rating_before REAL NOT NULL,
       black_deviation_before REAL NOT NULL,
       black_rating_after REAL NOT NULL,
       black_deviation_after REAL NOT NULL,
       rated_at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_rated_games_white ON rated_games (white_user_id, rated_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_rated_games_black ON rated_games (black_user_id, rated_at)`).run();
  ratingTablesReady = true;
  return true;
}

async function ensureRatingRowsForUser(env, userId) {
  if (!(await ensureRatingTables(env)) || !userId) return false;
  const nowIso = new Date().toISOString();
  const statements = RATING_TYPES.map(item => env.DB.prepare(
    `INSERT OR IGNORE INTO user_ratings (
       user_id, rating_type, rating, deviation, volatility,
       games, wins, draws, losses, last_played_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, NULL, ?)`
  ).bind(String(userId), item.key, RATING_START, RATING_START_DEVIATION, RATING_START_VOLATILITY, nowIso));
  await env.DB.batch(statements);
  return true;
}

function normalizeRatingRow(row, typeKey = '') {
  const info = ratingTypeInfo(typeKey || (row && row.rating_type));
  if (!info) return null;
  const rating = Number.isFinite(Number(row && row.rating)) ? Number(row.rating) : RATING_START;
  const deviation = Number.isFinite(Number(row && row.deviation)) ? Number(row.deviation) : RATING_START_DEVIATION;
  const volatility = Number.isFinite(Number(row && row.volatility)) ? Number(row.volatility) : RATING_START_VOLATILITY;
  const games = Math.max(0, Math.floor(Number(row && row.games || 0)));
  return {
    key: info.key,
    label: info.label,
    rating: Math.round(rating),
    ratingExact: rating,
    deviation: Math.round(deviation * 100) / 100,
    volatility,
    games,
    wins: Math.max(0, Math.floor(Number(row && row.wins || 0))),
    draws: Math.max(0, Math.floor(Number(row && row.draws || 0))),
    losses: Math.max(0, Math.floor(Number(row && row.losses || 0))),
    provisional: deviation > RATING_PROVISIONAL_DEVIATION,
    display: ratingDisplayValue(rating, deviation),
    lastPlayedAt: row && row.last_played_at ? row.last_played_at : null,
    updatedAt: row && row.updated_at ? row.updated_at : null
  };
}

async function getUserRatings(env, userId) {
  if (!userId || !(await ensureRatingRowsForUser(env, userId))) return {};
  const result = await env.DB.prepare(
    `SELECT user_id, rating_type, rating, deviation, volatility,
            games, wins, draws, losses, last_played_at, updated_at
       FROM user_ratings
      WHERE user_id = ?`
  ).bind(String(userId)).all();
  const byKey = {};
  for (const row of (result && result.results ? result.results : [])) {
    const normalized = normalizeRatingRow(row);
    if (normalized) byKey[normalized.key] = normalized;
  }
  for (const item of RATING_TYPES) {
    if (!byKey[item.key]) byKey[item.key] = normalizeRatingRow(null, item.key);
  }
  return byKey;
}


async function getRatingTypeForUsers(env, userIds, ratingType) {
  const info = ratingTypeInfo(ratingType);
  const ids = Array.from(new Set((userIds || []).map(value => String(value || '').trim()).filter(Boolean)));
  if (!info || ids.length === 0 || !(await ensureRatingTables(env))) return {};
  const nowIso = new Date().toISOString();
  await env.DB.batch(ids.map(userId => env.DB.prepare(
    `INSERT OR IGNORE INTO user_ratings (
       user_id, rating_type, rating, deviation, volatility,
       games, wins, draws, losses, last_played_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, NULL, ?)`
  ).bind(userId, info.key, RATING_START, RATING_START_DEVIATION, RATING_START_VOLATILITY, nowIso)));
  const placeholders = ids.map(() => '?').join(',');
  const result = await env.DB.prepare(
    `SELECT user_id, rating_type, rating, deviation, volatility,
            games, wins, draws, losses, last_played_at, updated_at
       FROM user_ratings
      WHERE rating_type = ? AND user_id IN (${placeholders})`
  ).bind(info.key, ...ids).all();
  const out = {};
  for (const row of (result && result.results ? result.results : [])) {
    const userId = String(row.user_id || '');
    const normalized = normalizeRatingRow(row, info.key);
    if (userId && normalized) out[userId] = normalized;
  }
  return out;
}

async function publicUserWithRatings(env, row) {
  const user = publicUser(row, env);
  if (!user) return null;
  user.ratings = await getUserRatings(env, user.id);
  user.profile = await getUserPublicProfile(env, user.id);
  user.emailNotifications = await getUserEmailPreferences(env, user.id);
  const emailSecurity = await getUserEmailSecurityState(env, row || user);
  user.emailVerified = emailSecurity.emailVerified;
  user.emailVerifiedAt = emailSecurity.verifiedAt;
  user.pendingEmail = emailSecurity.pendingEmail;
  const onboarding = await getUserOnboardingState(env, user.id);
  user.leitbildAcknowledged = onboarding.leitbildAcknowledged;
  user.leitbildAcknowledgedAt = onboarding.leitbildAcknowledgedAt;
  return user;
}

function inflateRatingDeviationForInactivity(row, nowMs) {
  const rating = Number.isFinite(Number(row.rating)) ? Number(row.rating) : RATING_START;
  const deviation = Number.isFinite(Number(row.deviation)) ? Number(row.deviation) : RATING_START_DEVIATION;
  const volatility = Number.isFinite(Number(row.volatility)) ? Number(row.volatility) : RATING_START_VOLATILITY;
  const lastPlayedMs = Date.parse(row.last_played_at || '');
  const periods = Number.isFinite(lastPlayedMs) ? Math.max(0, Math.floor((nowMs - lastPlayedMs) / RATING_PERIOD_MS)) : 0;
  if (!periods) return { rating, deviation, volatility };
  const phi = deviation / RATING_GLICKO2_SCALE;
  const inflatedPhi = Math.min(RATING_START_DEVIATION / RATING_GLICKO2_SCALE, Math.sqrt(phi * phi + volatility * volatility * periods));
  return { rating, deviation: inflatedPhi * RATING_GLICKO2_SCALE, volatility };
}

function glicko2G(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function glicko2E(mu, opponentMu, opponentPhi) {
  return 1 / (1 + Math.exp(-glicko2G(opponentPhi) * (mu - opponentMu)));
}

function glicko2Update(player, opponent, score) {
  const mu = (player.rating - RATING_START) / RATING_GLICKO2_SCALE;
  const phi = Math.max(0.000001, player.deviation / RATING_GLICKO2_SCALE);
  const sigma = Math.max(0.000001, player.volatility);
  const opponentMu = (opponent.rating - RATING_START) / RATING_GLICKO2_SCALE;
  const opponentPhi = Math.max(0.000001, opponent.deviation / RATING_GLICKO2_SCALE);
  const g = glicko2G(opponentPhi);
  const expected = glicko2E(mu, opponentMu, opponentPhi);
  const variance = 1 / Math.max(0.000000000001, g * g * expected * (1 - expected));
  const delta = variance * g * (score - expected);
  const a = Math.log(sigma * sigma);

  const f = x => {
    const ex = Math.exp(x);
    const numerator = ex * (delta * delta - phi * phi - variance - ex);
    const denominator = 2 * Math.pow(phi * phi + variance + ex, 2);
    return numerator / denominator - (x - a) / (RATING_GLICKO2_TAU * RATING_GLICKO2_TAU);
  };

  let A = a;
  let B;
  if (delta * delta > phi * phi + variance) {
    B = Math.log(delta * delta - phi * phi - variance);
  } else {
    let k = 1;
    B = a - k * RATING_GLICKO2_TAU;
    while (f(B) >= 0 && k < 100) {
      k += 1;
      B = a - k * RATING_GLICKO2_TAU;
    }
  }

  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > 0.000001 && guard < 100) {
    const C = A + (A - B) * fA / (fB - fA || 0.000000000001);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
    guard += 1;
  }

  const newVolatility = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newVolatility * newVolatility);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / variance);
  const newMu = mu + newPhi * newPhi * g * (score - expected);
  return {
    rating: Math.max(100, Math.min(4000, RATING_START + RATING_GLICKO2_SCALE * newMu)),
    deviation: Math.max(30, Math.min(RATING_START_DEVIATION, RATING_GLICKO2_SCALE * newPhi)),
    volatility: Math.max(0.000001, Math.min(1, newVolatility))
  };
}

function ratedGamePayload(row) {
  if (!row) return null;
  const info = ratingTypeInfo(row.rating_type);
  if (!info) return null;
  const whiteBefore = Number(row.white_rating_before);
  const whiteAfter = Number(row.white_rating_after);
  const blackBefore = Number(row.black_rating_before);
  const blackAfter = Number(row.black_rating_after);
  const whiteDeviationAfter = Number(row.white_deviation_after);
  const blackDeviationAfter = Number(row.black_deviation_after);
  return {
    rated: true,
    system: 'glicko2',
    systemVersion: RATING_SYSTEM_VERSION,
    type: info.key,
    label: info.label,
    result: row.result,
    ratedAt: row.rated_at || null,
    players: {
      white: {
        before: Math.round(whiteBefore),
        after: Math.round(whiteAfter),
        delta: Math.round(whiteAfter) - Math.round(whiteBefore),
        deviation: Math.round(whiteDeviationAfter * 100) / 100,
        provisional: whiteDeviationAfter > RATING_PROVISIONAL_DEVIATION,
        display: ratingDisplayValue(whiteAfter, whiteDeviationAfter)
      },
      black: {
        before: Math.round(blackBefore),
        after: Math.round(blackAfter),
        delta: Math.round(blackAfter) - Math.round(blackBefore),
        deviation: Math.round(blackDeviationAfter * 100) / 100,
        provisional: blackDeviationAfter > RATING_PROVISIONAL_DEVIATION,
        display: ratingDisplayValue(blackAfter, blackDeviationAfter)
      }
    }
  };
}

async function rateCompletedGame(env, payload) {
  if (!(await ensureRatingTables(env))) return { ok:false, code:'DB_NOT_CONFIGURED', message:'Rating-Datenbank ist nicht verfügbar.' };
  const roomId = cleanRoomId(payload && payload.roomId);
  const ratingType = String(payload && payload.ratingType || '');
  const whiteUserId = String(payload && payload.whiteUserId || '').trim();
  const blackUserId = String(payload && payload.blackUserId || '').trim();
  const result = String(payload && payload.result || '');
  if (!roomId || !RATING_TYPE_KEYS.has(ratingType) || !whiteUserId || !blackUserId || !['1-0','0-1','1/2-1/2'].includes(result)) {
    return { ok:false, code:'INVALID_RATING_GAME', message:'Die Ratingdaten der Partie sind unvollständig.' };
  }
  if (whiteUserId === blackUserId) return { ok:true, rating:{ rated:false, type:ratingType, label:ratingTypeInfo(ratingType).label, reason:'same_account' } };

  const existing = await env.DB.prepare(`SELECT * FROM rated_games WHERE room_id = ? LIMIT 1`).bind(roomId).first();
  if (existing) return { ok:true, rating:ratedGamePayload(existing), alreadyRated:true };

  const users = await env.DB.prepare(`SELECT id FROM users WHERE id IN (?, ?)`).bind(whiteUserId, blackUserId).all();
  const userIds = new Set((users && users.results ? users.results : []).map(row => String(row.id || '')));
  if (!userIds.has(whiteUserId) || !userIds.has(blackUserId)) {
    return { ok:true, rating:{ rated:false, type:ratingType, label:ratingTypeInfo(ratingType).label, reason:'members_required' } };
  }

  await ensureRatingRowsForUser(env, whiteUserId);
  await ensureRatingRowsForUser(env, blackUserId);
  const rows = await env.DB.prepare(
    `SELECT * FROM user_ratings
      WHERE rating_type = ? AND user_id IN (?, ?)`
  ).bind(ratingType, whiteUserId, blackUserId).all();
  const byUser = Object.fromEntries((rows && rows.results ? rows.results : []).map(row => [String(row.user_id), row]));
  const whiteRow = byUser[whiteUserId];
  const blackRow = byUser[blackUserId];
  if (!whiteRow || !blackRow) return { ok:false, code:'RATING_ROW_MISSING', message:'Ratingkonto konnte nicht geladen werden.' };

  const now = Date.now();
  const ratedAt = new Date(now).toISOString();
  const whiteBefore = inflateRatingDeviationForInactivity(whiteRow, now);
  const blackBefore = inflateRatingDeviationForInactivity(blackRow, now);
  const whiteScore = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5;
  const blackScore = 1 - whiteScore;
  const whiteAfter = glicko2Update(whiteBefore, blackBefore, whiteScore);
  const blackAfter = glicko2Update(blackBefore, whiteBefore, blackScore);
  const whiteWin = whiteScore === 1 ? 1 : 0;
  const whiteDraw = whiteScore === 0.5 ? 1 : 0;
  const whiteLoss = whiteScore === 0 ? 1 : 0;
  const blackWin = blackScore === 1 ? 1 : 0;
  const blackDraw = blackScore === 0.5 ? 1 : 0;
  const blackLoss = blackScore === 0 ? 1 : 0;

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO rated_games (
           room_id, rating_type, white_user_id, black_user_id, result,
           white_rating_before, white_deviation_before, white_rating_after, white_deviation_after,
           black_rating_before, black_deviation_before, black_rating_after, black_deviation_after,
           rated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        roomId, ratingType, whiteUserId, blackUserId, result,
        whiteBefore.rating, whiteBefore.deviation, whiteAfter.rating, whiteAfter.deviation,
        blackBefore.rating, blackBefore.deviation, blackAfter.rating, blackAfter.deviation,
        ratedAt
      ),
      env.DB.prepare(
        `UPDATE user_ratings
            SET rating = ?, deviation = ?, volatility = ?,
                games = games + 1, wins = wins + ?, draws = draws + ?, losses = losses + ?,
                last_played_at = ?, updated_at = ?
          WHERE user_id = ? AND rating_type = ?`
      ).bind(whiteAfter.rating, whiteAfter.deviation, whiteAfter.volatility, whiteWin, whiteDraw, whiteLoss, ratedAt, ratedAt, whiteUserId, ratingType),
      env.DB.prepare(
        `UPDATE user_ratings
            SET rating = ?, deviation = ?, volatility = ?,
                games = games + 1, wins = wins + ?, draws = draws + ?, losses = losses + ?,
                last_played_at = ?, updated_at = ?
          WHERE user_id = ? AND rating_type = ?`
      ).bind(blackAfter.rating, blackAfter.deviation, blackAfter.volatility, blackWin, blackDraw, blackLoss, ratedAt, ratedAt, blackUserId, ratingType)
    ]);
  } catch (err) {
    const duplicate = await env.DB.prepare(`SELECT * FROM rated_games WHERE room_id = ? LIMIT 1`).bind(roomId).first();
    if (duplicate) return { ok:true, rating:ratedGamePayload(duplicate), alreadyRated:true };
    throw err;
  }

  const stored = await env.DB.prepare(`SELECT * FROM rated_games WHERE room_id = ? LIMIT 1`).bind(roomId).first();
  return { ok:true, rating:ratedGamePayload(stored) };
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


let accountGameRoomIndexReady = false;
async function ensureAccountGameRoomIndex(env) {
  if (!env || !env.DB) return false;
  if (accountGameRoomIndexReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS account_game_rooms (
       user_id TEXT NOT NULL,
       room_id TEXT NOT NULL,
       role TEXT,
       first_seen_at TEXT NOT NULL,
       last_seen_at TEXT NOT NULL,
       PRIMARY KEY (user_id, room_id)
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_account_game_rooms_user ON account_game_rooms (user_id, last_seen_at)`).run();
  accountGameRoomIndexReady = true;
  return true;
}

async function indexAccountGameRoom(env, userId, roomId, role = '') {
  const uid = String(userId || '').trim();
  const rid = cleanRoomId(roomId);
  if (!uid || !rid || !(await ensureAccountGameRoomIndex(env))) return false;
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO account_game_rooms (user_id, room_id, role, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, room_id) DO UPDATE SET
       role = excluded.role,
       last_seen_at = excluded.last_seen_at`
  ).bind(uid, rid, role === 'b' ? 'b' : role === 'w' ? 'w' : '', nowIso, nowIso).run();
  return true;
}

async function collectAccountRoomIds(env, userId) {
  const uid = String(userId || '').trim();
  const ids = new Set();
  if (!env || !env.DB || !uid) return [];
  try {
    if (await ensureAccountGameRoomIndex(env)) {
      const result = await env.DB.prepare(`SELECT room_id FROM account_game_rooms WHERE user_id = ?`).bind(uid).all();
      for (const row of (result && result.results) || []) {
        const roomId = cleanRoomId(row.room_id);
        if (roomId) ids.add(roomId);
      }
    }
  } catch (_) {}
  try {
    if (await ensureOpenGameOffersTable(env)) {
      const result = await env.DB.prepare(`SELECT room_id FROM open_game_offers WHERE creator_user_id = ?`).bind(uid).all();
      for (const row of (result && result.results) || []) {
        const roomId = cleanRoomId(row.room_id);
        if (roomId) ids.add(roomId);
      }
    }
  } catch (_) {}
  for (const query of [
    `SELECT room_id FROM daily_games WHERE white_user_id = ? OR black_user_id = ?`,
    `SELECT room_id FROM public_games WHERE white_user_id = ? OR black_user_id = ?`,
    `SELECT room_id FROM rated_games WHERE white_user_id = ? OR black_user_id = ?`
  ]) {
    try {
      const result = await env.DB.prepare(query).bind(uid, uid).all();
      for (const row of (result && result.results) || []) {
        const roomId = cleanRoomId(row.room_id);
        if (roomId) ids.add(roomId);
      }
    } catch (_) {}
  }
  return Array.from(ids);
}

async function callAccountRoomAction(env, roomId, action, userId, anonymizedId = '') {
  if (!env || !env.GAME_ROOM) return { ok:false, status:503, code:'ROOM_SERVICE_UNAVAILABLE', message:'Spielräume konnten nicht geprüft werden.' };
  try {
    const id = env.GAME_ROOM.idFromName(roomId);
    const stub = env.GAME_ROOM.get(id);
    const response = await stub.fetch(new Request(`https://game-room.internal/${action}?room=${encodeURIComponent(roomId)}`, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ userId:String(userId || ''), anonymizedId:String(anonymizedId || '') })
    }));
    let data = null;
    try { data = await response.json(); } catch (_) { data = null; }
    return Object.assign({ ok:response.ok, status:response.status }, data || {});
  } catch (_) {
    return { ok:false, status:500, code:'ROOM_ACTION_FAILED', message:'Ein Spielraum konnte nicht verarbeitet werden.' };
  }
}

async function prepareRoomsForAccountDeletion(env, userId, roomIds) {
  const activeRooms = [];
  for (const roomId of roomIds) {
    const result = await callAccountRoomAction(env, roomId, 'prepare-account-deletion', userId);
    if (result && result.active) activeRooms.push(roomId);
    else if (!result.ok && result.status !== 404) {
      return { ok:false, status:result.status || 500, code:result.code || 'ROOM_CHECK_FAILED', message:result.message || 'Ein Spielraum konnte nicht sicher geprüft werden.' };
    }
  }
  if (activeRooms.length) {
    return { ok:false, status:409, code:'ACTIVE_GAME_ROOMS', activeGameRooms:activeRooms.length, message:'Der Account kann erst gelöscht werden, wenn alle laufenden Live- und Daily-Partien beendet sind.' };
  }
  return { ok:true, activeRooms:0 };
}

async function anonymizeRoomsForDeletedAccount(env, userId, anonymizedId, roomIds) {
  let anonymized = 0;
  for (const roomId of roomIds) {
    const result = await callAccountRoomAction(env, roomId, 'anonymize-account', userId, anonymizedId);
    if (!result.ok && result.status !== 404) {
      return { ok:false, status:result.status || 500, code:result.code || 'ROOM_ANONYMIZE_FAILED', message:result.message || 'Ein Spielraum konnte nicht anonymisiert werden.' };
    }
    if (result.anonymized) anonymized += 1;
  }
  return { ok:true, anonymized };
}

async function removeGlobalChatDataForDeletedAccount(env, userId) {
  if (!env || !env.GLOBAL_CHAT || !userId) return {ok:true,removedMessages:0};
  try {
    const id = env.GLOBAL_CHAT.idFromName('members');
    const stub = env.GLOBAL_CHAT.get(id);
    const response = await stub.fetch(new Request('https://global-chat.internal/delete-account-data', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({userId:String(userId)})
    }));
    let data = null;
    try { data = await response.json(); } catch (_) { data = null; }
    if (!response.ok || !data || !data.ok) return {ok:false,status:response.status || 500,code:'GLOBAL_CHAT_DELETE_FAILED',message:'Die Global-Chat-Daten konnten nicht sicher entfernt werden.'};
    return data;
  } catch (_) {
    return {ok:false,status:503,code:'GLOBAL_CHAT_DELETE_FAILED',message:'Die Global-Chat-Daten konnten nicht sicher entfernt werden.'};
  }
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

  const roomIds = await collectAccountRoomIds(env, target.id);
  const roomCheck = await prepareRoomsForAccountDeletion(env, target.id, roomIds);
  if (!roomCheck.ok) return roomCheck;

  const cancellation = await cancelOpenDailyInvitationsForUser(env, target.id, daily.openInvitations);
  if (!cancellation.ok) return cancellation;

  const anonymizedId = 'deleted_' + crypto.randomUUID();
  const roomAnonymization = await anonymizeRoomsForDeletedAccount(env, target.id, anonymizedId, roomIds);
  if (!roomAnonymization.ok) return roomAnonymization;
  const globalChatCleanup = await removeGlobalChatDataForDeletedAccount(env, target.id);
  if (!globalChatCleanup.ok) return globalChatCleanup;

  const deletedLabel = 'Gelöschter Benutzer';
  try {
    await env.DB.prepare(
      `UPDATE daily_games
          SET white_user_id = CASE WHEN white_user_id = ? THEN NULL ELSE white_user_id END,
              black_user_id = CASE WHEN black_user_id = ? THEN NULL ELSE black_user_id END,
              white_name = CASE WHEN white_user_id = ? THEN ? ELSE white_name END,
              black_name = CASE WHEN black_user_id = ? THEN ? ELSE black_name END,
              invited_user_id = CASE WHEN invited_user_id = ? THEN NULL ELSE invited_user_id END,
              invited_name = CASE WHEN invited_user_id = ? THEN ? ELSE invited_name END
        WHERE white_user_id = ? OR black_user_id = ? OR invited_user_id = ?`
    ).bind(
      target.id, target.id,
      target.id, deletedLabel,
      target.id, deletedLabel,
      target.id,
      target.id, deletedLabel,
      target.id, target.id, target.id
    ).run();
  } catch (_) {}
  try {
    await env.DB.prepare(
      `UPDATE public_games
          SET white_user_id = CASE WHEN white_user_id = ? THEN NULL ELSE white_user_id END,
              black_user_id = CASE WHEN black_user_id = ? THEN NULL ELSE black_user_id END,
              white_name = CASE WHEN white_user_id = ? THEN ? ELSE white_name END,
              black_name = CASE WHEN black_user_id = ? THEN ? ELSE black_name END,
              public_game = 0
        WHERE white_user_id = ? OR black_user_id = ?`
    ).bind(target.id, target.id, target.id, deletedLabel, target.id, deletedLabel, target.id, target.id).run();
  } catch (_) {}
  try {
    await env.DB.prepare(
      `UPDATE rated_games
          SET white_user_id = CASE WHEN white_user_id = ? THEN ? ELSE white_user_id END,
              black_user_id = CASE WHEN black_user_id = ? THEN ? ELSE black_user_id END
        WHERE white_user_id = ? OR black_user_id = ?`
    ).bind(target.id, anonymizedId, target.id, anonymizedId, target.id, target.id).run();
  } catch (_) {}
  try { await env.DB.prepare(`UPDATE auth_security_events SET user_id = NULL WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM admin_member_message_recipients WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try {
    if (await ensureTournamentTables(env)) {
      const activeResult = await env.DB.prepare(
        `SELECT tournament.id, tournament.max_players
           FROM tournaments tournament
           JOIN tournament_participants participant ON participant.tournament_id = tournament.id
          WHERE participant.user_id = ? AND participant.status IN ('confirmed','waiting')
            AND tournament.status IN ('open','full')`
      ).bind(target.id).all();
      const activeTournaments = activeResult && activeResult.results ? activeResult.results : [];
      await env.DB.prepare(
        `UPDATE tournament_participants SET status = 'withdrawn', updated_at = ?
          WHERE user_id = ? AND tournament_id IN (SELECT id FROM tournaments WHERE status IN ('open','full'))`
      ).bind(new Date().toISOString(), target.id).run();
      for (const tournament of activeTournaments) {
        const balanced = await rebalanceTournamentParticipants(env, tournament.id, tournament.max_players);
        await env.DB.prepare(`UPDATE tournaments SET status = ?, updated_at = ? WHERE id = ? AND status IN ('open','full')`).bind(
          balanced.confirmed >= Number(tournament.max_players || 0) ? 'full' : 'open',
          new Date().toISOString(),
          tournament.id
        ).run();
      }
      await env.DB.prepare(`DELETE FROM tournament_views WHERE user_id = ?`).bind(target.id).run();
    }
  } catch (_) {}

  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(target.id).run();
  try { await env.DB.prepare(`DELETE FROM user_presence WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM daily_game_archives WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM user_ratings WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM trainer_attempts WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM trainer_progress WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await deleteUserAvatar(env, target.id, {bestEffort:true}); } catch (_) {}
  try { if (await ensureUserPublicProfilesTable(env)) await env.DB.prepare(`DELETE FROM user_public_profiles WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM user_email_preferences WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM user_onboarding WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM email_notification_log WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM invitation_email_log WHERE sender_user_id = ? OR recipient_user_id = ?`).bind(target.id, target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM account_action_tokens WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM user_email_status WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM account_game_rooms WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM open_game_offers WHERE creator_user_id = ?`).bind(target.id).run(); } catch (_) {}
  await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(target.id).run();
  return {
    ok: true,
    deletedUser: publicUser(target, env),
    cancelledInvitations: cancellation.cancelled || 0,
    anonymizedRooms: roomAnonymization.anonymized || 0,
    removedGlobalChatMessages: Number(globalChatCleanup.removedMessages || 0)
  };
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


const ADMIN_MEMBER_MESSAGE_MAX_RECIPIENTS = 250;
const ADMIN_MEMBER_MESSAGE_MAX_LENGTH = 5000;
const ADMIN_MEMBER_MESSAGE_DUPLICATE_WINDOW_MS = 15 * 60 * 1000;
let adminMemberMessageTablesReady = false;

function normalizeAdminMemberMessageKind(value) {
  const kind = String(value || '').toLowerCase();
  return kind === 'system' ? 'system' : kind === 'personal' ? 'personal' : 'news';
}

function cleanAdminMemberMessageSubject(value) {
  return String(value || '').replace(/[\r\n<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function cleanAdminMemberMessageText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, ADMIN_MEMBER_MESSAGE_MAX_LENGTH);
}

function adminMemberMessageHtmlParagraphs(value) {
  const text = cleanAdminMemberMessageText(value);
  return text.split(/\n{2,}/).map(block => {
    const body = escapeEmailHtml(block).replace(/\n/g, '<br>');
    return `<p style="margin:0 0 14px;line-height:1.6;">${body}</p>`;
  }).join('');
}

async function ensureAdminMemberMessageTables(env) {
  if (!env || !env.DB) return false;
  if (adminMemberMessageTablesReady) return true;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS admin_member_messages (
         id TEXT PRIMARY KEY,
         message_kind TEXT NOT NULL,
         subject TEXT NOT NULL,
         content_hash TEXT NOT NULL,
         audience_count INTEGER NOT NULL DEFAULT 0,
         sent_count INTEGER NOT NULL DEFAULT 0,
         failed_count INTEGER NOT NULL DEFAULT 0,
         status TEXT NOT NULL,
         created_by TEXT NOT NULL,
         created_at TEXT NOT NULL,
         completed_at TEXT
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS admin_member_message_recipients (
         message_id TEXT NOT NULL,
         user_id TEXT NOT NULL,
         status TEXT NOT NULL,
         error_code TEXT,
         updated_at TEXT NOT NULL,
         PRIMARY KEY (message_id, user_id)
       )`
    )
  ]);
  await env.DB.batch([
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_member_messages_hash_time ON admin_member_messages (content_hash, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_member_message_recipients_status ON admin_member_message_recipients (message_id, status)`)
  ]);
  adminMemberMessageTablesReady = true;
  return true;
}

async function loadAdminMemberMessageRecipients(env, kind, targetUserId = '') {
  const messageKind = normalizeAdminMemberMessageKind(kind);
  const personalTargetId = messageKind === 'personal' ? cleanPublicProfileUserId(targetUserId) : '';
  if (!env || !env.DB) throw new Error('Account-Datenbank ist nicht verfügbar.');
  if (messageKind === 'personal' && !personalTargetId) return [];

  /* D1-Schemaänderungen bewusst nacheinander ausführen. Zwei parallele
     CREATE-/ALTER-Vorgänge können bei älteren Datenbankständen kollidieren und
     würden dann die Empfängerzählung vollständig abbrechen. */
  await ensureUserEmailPreferencesTable(env);
  await ensureAccountSecurityTables(env);

  const usersResult = await env.DB.prepare(
    `SELECT id, username, email
       FROM users
      ORDER BY LOWER(username)`
  ).all();
  const users = usersResult && Array.isArray(usersResult.results) ? usersResult.results : [];

  /* Bestätigungsstatus und freiwillige Neuigkeiten-Einwilligung getrennt laden.
     Dadurch bleibt die Abfrage auch mit bereits vorhandenen älteren D1-Tabellen
     kompatibel und hängt nicht von einer komplexen JOIN-Abfrage ab. */
  const emailStatusByUser = new Map();
  try {
    const statusResult = await env.DB.prepare(
      `SELECT user_id, email, verified FROM user_email_status`
    ).all();
    for (const row of statusResult && Array.isArray(statusResult.results) ? statusResult.results : []) {
      if (row && row.user_id) emailStatusByUser.set(String(row.user_id), row);
    }
  } catch (_) {
    /* Bestehende Accounts vor Einführung der Verifizierung gelten weiterhin
       als bestätigt; die Einzelprüfung beim Versand bleibt zusätzlich aktiv. */
  }

  const newsPreferenceByUser = new Map();
  if (messageKind === 'news') {
    try {
      const preferenceResult = await env.DB.prepare(
        `SELECT user_id, member_news_enabled FROM user_email_preferences`
      ).all();
      for (const row of preferenceResult && Array.isArray(preferenceResult.results) ? preferenceResult.results : []) {
        if (row && row.user_id) newsPreferenceByUser.set(String(row.user_id), Number(row.member_news_enabled || 0) === 1);
      }
    } catch (_) {
      /* Bei einem unerwartet alten Tabellenstand werden vorsichtshalber keine
         normalen Neuigkeiten-Empfänger freigegeben. Andili bleibt als
         Kontrollkopie enthalten. */
    }
  }

  const recipients = [];
  for (const row of users) {
    if (!row) continue;
    const userId = String(row.id || '');
    const email = normalizeEmail(row.email);
    if (!userId || !email) continue;
    if (messageKind === 'personal' && userId !== personalTargetId) continue;

    const status = emailStatusByUser.get(userId);
    const statusEmail = normalizeEmail(status && status.email);
    const verified = !status || (statusEmail === email && Number(status.verified) === 1);
    if (!verified) continue;

    const adminCopy = messageKind !== 'personal' && isAdminUser(row, env);
    /* Andili erhält jede tatsächlich versendete Mitglieder-Information als
       Kontrollkopie. Bei Neuigkeiten gilt für alle anderen Mitglieder weiterhin
       ausschließlich die freiwillige Einwilligung aus der Accountverwaltung. */
    if (messageKind === 'news' && !adminCopy && newsPreferenceByUser.get(userId) !== true) continue;

    recipients.push({
      id:userId,
      username:cleanDisplayName(row.username) || 'Schachfreund',
      email,
      adminCopy
    });
  }
  return recipients;
}

async function listAdminMemberMessageTargets(env) {
  const recipients = await loadAdminMemberMessageRecipients(env, 'system');
  return recipients
    .filter(recipient => recipient && recipient.id && !recipient.adminCopy)
    .map(recipient => ({ id:recipient.id, username:recipient.username }))
    .sort((a, b) => String(a.username || '').localeCompare(String(b.username || ''), 'de-DE', {sensitivity:'base'}));
}

function prepareAdminMemberMessageEmail(env, payload) {
  const recipientEmail = normalizeEmail(payload && payload.recipientEmail);
  const recipientName = cleanDisplayName(payload && payload.recipientName) || 'Schachfreund';
  const kind = normalizeAdminMemberMessageKind(payload && payload.kind);
  const adminCopy = payload && payload.adminCopy === true;
  const subject = cleanAdminMemberMessageSubject(payload && payload.subject);
  const messageText = cleanAdminMemberMessageText(payload && payload.message);
  const attachmentResult = normalizeMailAttachment(payload && payload.attachment);
  if (!attachmentResult.ok) return attachmentResult;
  const attachment = attachmentResult.attachment;
  const publicUrl = configuredGamerPublicUrl(env);
  if (!recipientEmail || subject.length < 3 || messageText.length < 3) {
    return { ok:false, status:400, code:'INVALID_MEMBER_MESSAGE', message:'Betreff und Nachricht sind nicht vollständig.' };
  }
  const typeLabel = kind === 'personal' ? 'Persönliche Admin-Nachricht' : kind === 'system' ? 'Wichtige Systeminformation' : 'Hammerschach-Neuigkeiten';
  const preferenceText = kind === 'personal'
    ? 'Diese persönliche administrative Nachricht wurde ausschließlich an deinen Hammerschach-Account gesendet. Deine Einstellung für Neuigkeiten hat darauf keinen Einfluss.'
    : kind === 'news'
    ? (adminCopy
      ? 'Du erhältst diese Nachricht als Administrator-Kontrollkopie des versendeten Mitgliedertextes.'
      : 'Du erhältst diese Nachricht, weil du Hammerschach-Neuigkeiten in deiner Accountverwaltung aktiviert hast. Dort kannst du diese Einstellung jederzeit wieder abschalten.')
    : (adminCopy
      ? 'Du erhältst diese wichtige Systeminformation zugleich als Administrator-Kontrollkopie.'
      : 'Diese wichtige Systeminformation betrifft die Nutzung deines Hammerschach-Accounts.');
  const attachmentText = attachment
    ? `

Anhang: ${attachment.name} (${formatMailAttachmentSize(attachment.size)})${attachment.inline ? ' – das Bild ist zusätzlich im HTML-Mailinhalt eingebunden.' : ''}`
    : '';
  const textPart = `Hallo ${recipientName},

${messageText}${attachmentText}

${preferenceText}${publicUrl ? `

Hammerschach-Gamer öffnen:
${publicUrl}` : ''}

Viele Grüße
Hammerschach-Gamer`;
  const buttonHtml = publicUrl
    ? `<p style="margin:22px 0;"><a href="${escapeEmailHtml(publicUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">Hammerschach-Gamer öffnen</a></p>`
    : '';
  const attachmentHtml = !attachment
    ? ''
    : attachment.inline
      ? `<div style="margin:20px 0;text-align:center;"><img src="cid:${escapeEmailHtml(attachment.contentId)}" alt="${escapeEmailHtml(attachment.name)}" style="display:block;max-width:100%;max-height:460px;width:auto;height:auto;margin:0 auto;border:0;border-radius:10px;"><div style="margin-top:7px;font-size:12px;color:#777;">${escapeEmailHtml(attachment.name)} · ${escapeEmailHtml(formatMailAttachmentSize(attachment.size))}</div></div>`
      : `<div style="margin:18px 0;padding:11px 13px;background:#f6f1f2;border:1px solid #e5d3d6;border-radius:10px;font-size:13px;line-height:1.45;"><strong>Anhang:</strong> ${escapeEmailHtml(attachment.name)} · ${escapeEmailHtml(formatMailAttachmentSize(attachment.size))}</div>`;
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><div style="font-size:12px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;color:#777;margin-bottom:7px;">${escapeEmailHtml(typeLabel)}</div><h2 style="margin:0 0 18px;color:#843f46;">${escapeEmailHtml(subject)}</h2><p>Hallo ${escapeEmailHtml(recipientName)},</p>${adminMemberMessageHtmlParagraphs(messageText)}${attachmentHtml}${buttonHtml}<hr style="border:0;border-top:1px solid #eee;margin:22px 0;"><p style="font-size:12px;color:#777;line-height:1.45;">${escapeEmailHtml(preferenceText)}</p><p style="margin-bottom:0;">Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return {
    ok:true,
    mailType:kind === 'personal' ? 'member_personal' : kind === 'system' ? 'member_system' : 'member_news',
    recipientEmail,
    recipientName,
    subject,
    textPart,
    htmlPart,
    attachments:attachment ? [attachment] : []
  };
}

async function adminMemberMessageAudience(env, kind, targetUserId = '') {
  const messageKind = normalizeAdminMemberMessageKind(kind);
  const recipients = await loadAdminMemberMessageRecipients(env, messageKind, targetUserId);
  return {
    kind:messageKind,
    count:recipients.length,
    description:messageKind === 'personal'
      ? (recipients.length ? `Persönliche Nachricht ausschließlich an „${recipients[0].username}“` : 'Bitte ein Mitglied mit bestätigter Mailadresse auswählen')
      : messageKind === 'system'
      ? 'Bestätigte Mailadressen aller aktiven Mitglieder – einschließlich Andili'
      : 'Mitglieder mit bestätigter Mailadresse und Einwilligung – Andili erhält zusätzlich eine Kontrollkopie'
  };
}

async function sendAdminMemberMessage(env, adminUser, payload) {
  const kind = normalizeAdminMemberMessageKind(payload && payload.kind);
  const targetUserId = kind === 'personal' ? cleanPublicProfileUserId(payload && payload.targetUserId) : '';
  const subject = cleanAdminMemberMessageSubject(payload && payload.subject);
  const message = cleanAdminMemberMessageText(payload && payload.message);
  const attachmentResult = normalizeMailAttachment(payload && payload.attachment);
  if (!attachmentResult.ok) return attachmentResult;
  const attachment = attachmentResult.attachment;
  if (subject.length < 3 || message.length < 3) {
    return { ok:false, status:400, code:'INVALID_MEMBER_MESSAGE', message:'Bitte Betreff und Nachricht vollständig eingeben.' };
  }
  if (kind === 'personal' && !targetUserId) {
    return { ok:false, status:400, code:'PERSONAL_RECIPIENT_REQUIRED', message:'Bitte ein einzelnes Mitglied auswählen.' };
  }
  const recipients = await loadAdminMemberMessageRecipients(env, kind, targetUserId);
  if (!recipients.length) {
    return { ok:false, status:400, code:'NO_RECIPIENTS', message:kind === 'personal' ? 'Das ausgewählte Mitglied besitzt keine erreichbare bestätigte Mailadresse.' : 'Für diese Nachrichtenart gibt es derzeit keine berechtigten Empfänger.' };
  }
  if (recipients.length > ADMIN_MEMBER_MESSAGE_MAX_RECIPIENTS) {
    return { ok:false, status:400, code:'TOO_MANY_RECIPIENTS', message:`Der Direktversand ist auf ${ADMIN_MEMBER_MESSAGE_MAX_RECIPIENTS} Empfänger begrenzt. Für größere Verteiler muss eine Queue eingerichtet werden.` };
  }
  await ensureAdminMemberMessageTables(env);
  const attachmentDigest = attachment ? await sha256Hex(attachment.base64) : '';
  const contentHash = await sha256Hex(`${kind}\n${targetUserId}\n${subject}\n${message}\n${attachment ? attachment.name : ''}\n${attachment ? attachment.type : ''}\n${attachment && attachment.inline ? 'inline' : 'attachment'}\n${attachmentDigest}`);
  const duplicateSince = new Date(Date.now() - ADMIN_MEMBER_MESSAGE_DUPLICATE_WINDOW_MS).toISOString();
  const duplicate = await env.DB.prepare(
    `SELECT id, status FROM admin_member_messages WHERE content_hash = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1`
  ).bind(contentHash, duplicateSince).first();
  if (duplicate) {
    return { ok:false, status:409, code:'DUPLICATE_MEMBER_MESSAGE', message:'Eine inhaltlich identische Mitglieder-Nachricht wurde innerhalb der letzten 15 Minuten bereits gestartet.' };
  }

  const messageId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO admin_member_messages
       (id, message_kind, subject, content_hash, audience_count, sent_count, failed_count, status, created_by, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, 'sending', ?, ?, NULL)`
  ).bind(messageId, kind, subject, contentHash, recipients.length, String(adminUser.id || ''), createdAt).run();

  let sent = 0;
  let failed = 0;
  const failures = [];
  const chunkSize = attachment ? 1 : 3;
  for (let index = 0; index < recipients.length; index += chunkSize) {
    const chunk = recipients.slice(index, index + chunkSize);
    const results = await Promise.all(chunk.map(async recipient => {
      let result;
      try {
        const mail = prepareAdminMemberMessageEmail(env, {
          recipientEmail:recipient.email,
          recipientName:recipient.username,
          kind,
          subject,
          message,
          attachment,
          adminCopy:recipient.adminCopy === true
        });
        result = await sendInvitationEmail(env, { preparedMail:mail, mailType:mail.mailType });
      } catch (error) {
        result = { ok:false, code:'MEMBER_MESSAGE_SEND_FAILED', message:error && error.message ? error.message : 'Versand fehlgeschlagen.' };
      }
      const status = result && result.ok ? 'sent' : 'failed';
      await env.DB.prepare(
        `INSERT INTO admin_member_message_recipients (message_id, user_id, status, error_code, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(message_id, user_id) DO UPDATE SET status = excluded.status, error_code = excluded.error_code, updated_at = excluded.updated_at`
      ).bind(messageId, recipient.id, status, status === 'failed' ? String(result && result.code || 'MAIL_FAILED').slice(0, 64) : null, new Date().toISOString()).run();
      return { recipient, result };
    }));
    for (const item of results) {
      if (item.result && item.result.ok) sent += 1;
      else {
        failed += 1;
        if (failures.length < 10) failures.push({ username:item.recipient.username, code:String(item.result && item.result.code || 'MAIL_FAILED') });
      }
    }
  }
  const completedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE admin_member_messages SET sent_count = ?, failed_count = ?, status = ?, completed_at = ? WHERE id = ?`
  ).bind(sent, failed, failed ? (sent ? 'partial' : 'failed') : 'completed', completedAt, messageId).run();
  return {
    ok:true,
    messageId,
    kind,
    audienceCount:recipients.length,
    sentCount:sent,
    failedCount:failed,
    attachmentName:attachment ? attachment.name : '',
    failures,
    message:failed
      ? `${sent} Nachricht${sent === 1 ? '' : 'en'} versendet, ${failed} fehlgeschlagen.`
      : kind === 'personal'
        ? `Persönliche Admin-Nachricht an „${recipients[0].username}“ erfolgreich versendet.`
        : `${sent} Mitglieder-Nachricht${sent === 1 ? '' : 'en'} erfolgreich versendet.`
  };
}

let adminSettingsTableReady = false;
async function ensureAdminSettingsTable(env) {
  if (!env || !env.DB) return false;
  if (adminSettingsTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS admin_settings (
       setting_key TEXT PRIMARY KEY,
       setting_value TEXT,
       updated_at TEXT NOT NULL,
       updated_by TEXT
     )`
  ).run();
  adminSettingsTableReady = true;
  return true;
}

async function requireAdminSession(request, env) {
  const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
  if (!session) return { ok:false, response:json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte als Andili einloggen.' }, { status:401 }) };
  if (!isAdminUser(session.user, env)) return { ok:false, response:json({ ok:false, code:'NOT_ADMIN', message:'Diese Systemübersicht ist ausschließlich für Andili verfügbar.' }, { status:403 }) };
  return { ok:true, session };
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

async function countActiveLoginBlocks(env) {
  if (!(await ensureAccountSecurityTables(env))) return { subjects:0, ips:0 };
  const now = Date.now();
  const sinceIso = new Date(now - Math.max(maximumPolicyWindow(LOGIN_RATE_POLICY.subjectRules), maximumPolicyWindow(LOGIN_RATE_POLICY.ipRules))).toISOString();
  const result = await env.DB.prepare(
    `SELECT subject_hash, ip_hash, created_at
       FROM auth_rate_limit_log
      WHERE action = 'login' AND outcome = 'failure' AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 5000`
  ).bind(sinceIso).all();
  const subjectTimes = new Map();
  const ipTimes = new Map();
  for (const row of result && result.results ? result.results : []) {
    const time = Date.parse(row && row.created_at || '');
    if (!Number.isFinite(time)) continue;
    if (row.subject_hash) {
      const key = String(row.subject_hash);
      if (!subjectTimes.has(key)) subjectTimes.set(key, []);
      subjectTimes.get(key).push(time);
    }
    if (row.ip_hash) {
      const key = String(row.ip_hash);
      if (!ipTimes.has(key)) ipTimes.set(key, []);
      ipTimes.get(key).push(time);
    }
  }
  let subjects = 0;
  let ips = 0;
  for (const times of subjectTimes.values()) if (evaluateAuthRateRules(times, LOGIN_RATE_POLICY.subjectRules, now) > 0) subjects += 1;
  for (const times of ipTimes.values()) if (evaluateAuthRateRules(times, LOGIN_RATE_POLICY.ipRules, now) > 0) ips += 1;
  return { subjects, ips };
}

async function buildAdminOverview(env) {
  await Promise.all([
    ensureAccountSecurityTables(env),
    ensureDailyGamesTable(env),
    ensurePublicGamesTable(env),
    ensureUserOnboardingTable(env),
    ensureEmailNotificationLogTable(env),
    ensureMailDeliveryLogTable(env),
    ensureAdminSettingsTable(env),
    ensureAdminMemberMessageTables(env),
    ensureStatsTable(env)
  ]);

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [accountsRow, sessionsRow, gamesRow, publicRow, securityRow, mailRow, backupRow, activeBlocks, stats] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status.user_id IS NULL OR (LOWER(status.email) = LOWER(users.email) AND status.verified = 1) THEN 1 ELSE 0 END) AS verified,
              SUM(CASE WHEN status.user_id IS NOT NULL AND NOT (LOWER(status.email) = LOWER(users.email) AND status.verified = 1) THEN 1 ELSE 0 END) AS unverified,
              SUM(CASE WHEN users.created_at >= ? THEN 1 ELSE 0 END) AS new_7d
         FROM users
         LEFT JOIN user_email_status status ON status.user_id = users.id`
    ).bind(since7d).first(),
    env.DB.prepare(`SELECT COUNT(*) AS active FROM sessions WHERE expires_at > ?`).bind(nowIso).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN ended = 0 AND started = 0 THEN 1 ELSE 0 END) AS invitations,
              SUM(CASE WHEN ended = 0 AND started = 1 THEN 1 ELSE 0 END) AS running,
              SUM(CASE WHEN ended = 1 THEN 1 ELSE 0 END) AS ended
         FROM daily_games`
    ).first(),
    env.DB.prepare(`SELECT COUNT(*) AS running FROM public_games WHERE public_game = 1 AND ended = 0`).first(),
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN event_type = 'login' AND outcome = 'failure' AND created_at >= ? THEN 1 ELSE 0 END) AS failed_login_24h,
         SUM(CASE WHEN event_type = 'login' AND outcome = 'failure' AND created_at >= ? THEN 1 ELSE 0 END) AS failed_login_7d,
         SUM(CASE WHEN outcome = 'throttled' AND created_at >= ? THEN 1 ELSE 0 END) AS throttled_24h,
         SUM(CASE WHEN event_type = 'password_reset_request' AND created_at >= ? THEN 1 ELSE 0 END) AS reset_requests_24h,
         SUM(CASE WHEN event_type = 'email_verification_request' AND created_at >= ? THEN 1 ELSE 0 END) AS verification_requests_24h,
         SUM(CASE WHEN event_type = 'register' AND outcome = 'success' AND created_at >= ? THEN 1 ELSE 0 END) AS registrations_7d
       FROM auth_security_events`
    ).bind(since24h, since7d, since24h, since24h, since24h, since7d).first(),
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'sent' AND created_at >= ? THEN 1 ELSE 0 END) AS sent_7d,
         SUM(CASE WHEN status = 'failed' AND created_at >= ? THEN 1 ELSE 0 END) AS failed_7d,
         SUM(CASE WHEN status = 'failed' AND created_at >= ? THEN 1 ELSE 0 END) AS failed_24h
       FROM mail_delivery_log`
    ).bind(since7d, since7d, since24h).first(),
    env.DB.prepare(`SELECT setting_value, updated_at, updated_by FROM admin_settings WHERE setting_key = 'last_manual_backup' LIMIT 1`).first(),
    countActiveLoginBlocks(env),
    readGamerStats(env)
  ]);

  const [recentSecurityResult, recentMailFailuresResult, notificationRow, tablesResult] = await Promise.all([
    env.DB.prepare(
      `SELECT events.event_type, events.outcome, events.detail_code, events.created_at,
              CASE WHEN events.user_id IS NOT NULL THEN COALESCE(users.username, 'gelöschter Account') ELSE '' END AS username
         FROM auth_security_events events
         LEFT JOIN users ON users.id = events.user_id
        ORDER BY events.created_at DESC
        LIMIT 35`
    ).all(),
    env.DB.prepare(
      `SELECT mail_type, provider, error_code, error_message, created_at
         FROM mail_delivery_log
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT 15`
    ).all(),
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'sent' AND updated_at >= ? THEN 1 ELSE 0 END) AS daily_sent_7d,
         SUM(CASE WHEN status = 'failed' AND updated_at >= ? THEN 1 ELSE 0 END) AS daily_failed_7d,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS daily_pending
       FROM email_notification_log`
    ).bind(since7d, since7d).first(),
    env.DB.prepare(`SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`).all()
  ]);

  const tableNames = (tablesResult && tablesResult.results ? tablesResult.results : []).map(row => String(row.name || '')).filter(Boolean);
  const importantTableNames = [
    'users','sessions','daily_games','public_games','rated_games','user_ratings','trainer_progress','trainer_attempts','user_public_profiles',
    'user_onboarding',
    'auth_security_events','auth_rate_limit_log','account_action_tokens','mail_delivery_log','email_notification_log',
    'admin_member_messages','admin_member_message_recipients'
  ];
  const rowCounts = {};
  for (const tableName of importantTableNames) {
    if (!tableNames.includes(tableName)) continue;
    try {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).first();
      rowCounts[tableName] = numberValue(row && row.count);
    } catch (_) {}
  }

  return {
    generatedAt:nowIso,
    accounts:{
      total:numberValue(accountsRow && accountsRow.total),
      verified:numberValue(accountsRow && accountsRow.verified),
      unverified:numberValue(accountsRow && accountsRow.unverified),
      new7d:numberValue(accountsRow && accountsRow.new_7d),
      activeSessions:numberValue(sessionsRow && sessionsRow.active)
    },
    games:{
      dailyTotal:numberValue(gamesRow && gamesRow.total),
      dailyInvitations:numberValue(gamesRow && gamesRow.invitations),
      dailyRunning:numberValue(gamesRow && gamesRow.running),
      dailyEnded:numberValue(gamesRow && gamesRow.ended),
      publicRunning:numberValue(publicRow && publicRow.running),
      gamesPlayed:numberValue(stats && stats.gamesPlayed),
      pageViews:numberValue(stats && stats.visits)
    },
    security:{
      failedLogins24h:numberValue(securityRow && securityRow.failed_login_24h),
      failedLogins7d:numberValue(securityRow && securityRow.failed_login_7d),
      throttled24h:numberValue(securityRow && securityRow.throttled_24h),
      resetRequests24h:numberValue(securityRow && securityRow.reset_requests_24h),
      verificationRequests24h:numberValue(securityRow && securityRow.verification_requests_24h),
      registrations7d:numberValue(securityRow && securityRow.registrations_7d),
      activeSubjectBlocks:numberValue(activeBlocks && activeBlocks.subjects),
      activeIpBlocks:numberValue(activeBlocks && activeBlocks.ips),
      recentEvents:(recentSecurityResult && recentSecurityResult.results ? recentSecurityResult.results : []).map(row => ({
        eventType:String(row.event_type || '').slice(0, 48),
        outcome:String(row.outcome || '').slice(0, 24),
        detailCode:String(row.detail_code || '').slice(0, 64),
        username:cleanDisplayName(row.username || ''),
        createdAt:row.created_at || null
      }))
    },
    mail:{
      sent7d:numberValue(mailRow && mailRow.sent_7d),
      failed7d:numberValue(mailRow && mailRow.failed_7d),
      failed24h:numberValue(mailRow && mailRow.failed_24h),
      dailySent7d:numberValue(notificationRow && notificationRow.daily_sent_7d),
      dailyFailed7d:numberValue(notificationRow && notificationRow.daily_failed_7d),
      dailyPending:numberValue(notificationRow && notificationRow.daily_pending),
      recentFailures:(recentMailFailuresResult && recentMailFailuresResult.results ? recentMailFailuresResult.results : []).map(row => ({
        mailType:cleanMailLogType(row.mail_type),
        provider:cleanMailLogType(row.provider),
        errorCode:String(row.error_code || '').slice(0, 64),
        errorMessage:String(row.error_message || '').replace(/[\r\n]+/g, ' ').slice(0, 240),
        createdAt:row.created_at || null
      }))
    },
    database:{
      tableCount:tableNames.length,
      importantRows:rowCounts,
      importantRowsTotal:Object.values(rowCounts).reduce((sum, value) => sum + numberValue(value), 0)
    },
    backup:{
      lastManualAt:backupRow && backupRow.setting_value || null,
      markedAt:backupRow && backupRow.updated_at || null,
      markedBy:backupRow && backupRow.updated_by || ''
    }
  };
}

async function markManualBackup(env, adminUser) {
  if (!(await ensureAdminSettingsTable(env))) throw new Error('Admin-Einstellungen sind momentan nicht verfügbar.');
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO admin_settings (setting_key, setting_value, updated_at, updated_by)
     VALUES ('last_manual_backup', ?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET
       setting_value = excluded.setting_value,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`
  ).bind(nowIso, nowIso, String(adminUser && adminUser.id || '').slice(0, 128)).run();
  return nowIso;
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



const MODERATION_STATUS_ACTIVE = 'active';
let moderationTablesReady = false;
async function ensureModerationTables(env){
  if(!env || !env.DB) return false;
  if(moderationTablesReady) return true;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS moderation_reports (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL, reporter_user_id TEXT NOT NULL,
      reported_user_id TEXT, reported_role TEXT NOT NULL, reported_name TEXT,
      reason TEXT NOT NULL, comment TEXT, chat_snapshot TEXT, game_snapshot TEXT,
      status TEXT NOT NULL DEFAULT 'open', admin_note TEXT, resolution TEXT,
      created_at TEXT NOT NULL, resolved_at TEXT, resolved_by_user_id TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS moderation_account_status (
      user_id TEXT PRIMARY KEY, account_status TEXT NOT NULL DEFAULT 'active',
      chat_blocked INTEGER NOT NULL DEFAULT 0, reason TEXT, admin_note TEXT,
      suspended_until TEXT, updated_at TEXT NOT NULL, updated_by_user_id TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS moderation_actions (
      id TEXT PRIMARY KEY, target_user_id TEXT NOT NULL, admin_user_id TEXT NOT NULL,
      action_type TEXT NOT NULL, reason TEXT, note TEXT, expires_at TEXT, created_at TEXT NOT NULL
    )`)
  ]);
  await env.DB.batch([
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_moderation_reports_status_time ON moderation_reports(status, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_moderation_reports_target_time ON moderation_reports(reported_user_id, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_moderation_actions_target_time ON moderation_actions(target_user_id, created_at)`)
  ]);
  moderationTablesReady = true; return true;
}
function cleanModerationReason(value){
  const allowed=['insult','threat','discrimination','spam','username','stalling','cheating','other'];
  const v=String(value||'').trim().toLowerCase(); return allowed.includes(v)?v:'other';
}
function cleanModerationComment(value){ return String(value||'').replace(/[<>\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,600); }
async function moderationStateForUser(env,userId){
  if(!userId || !(await ensureModerationTables(env))) return {accountStatus:'active',chatBlocked:false,suspendedUntil:null,reason:''};
  const row=await env.DB.prepare(`SELECT account_status, chat_blocked, reason, suspended_until FROM moderation_account_status WHERE user_id=? LIMIT 1`).bind(String(userId)).first();
  if(!row) return {accountStatus:'active',chatBlocked:false,suspendedUntil:null,reason:''};
  let status=String(row.account_status||'active');
  const until=row.suspended_until?new Date(row.suspended_until):null;
  if(status==='suspended' && until && !Number.isNaN(until.getTime()) && until.getTime()<=Date.now()){
    status='active';
    await env.DB.prepare(`UPDATE moderation_account_status SET account_status='active', suspended_until=NULL, updated_at=? WHERE user_id=?`).bind(new Date().toISOString(),String(userId)).run();
  }
  return {accountStatus:status,chatBlocked:Number(row.chat_blocked||0)===1,suspendedUntil:row.suspended_until||null,reason:row.reason||''};
}
async function requireUsableAccount(env,user){
  const state=await moderationStateForUser(env,user&&user.id);
  if(state.accountStatus==='banned') return {ok:false,state,code:'ACCOUNT_BANNED',message:'Dieser Account wurde dauerhaft gesperrt.'};
  if(state.accountStatus==='suspended') return {ok:false,state,code:'ACCOUNT_SUSPENDED',message:'Dieser Account ist vorübergehend gesperrt'+(state.suspendedUntil?' bis '+new Date(state.suspendedUntil).toLocaleString('de-DE'):'')+'.'};
  return {ok:true,state};
}
async function createModerationReport(env,sessionUser,body){
  await ensureModerationTables(env);
  const roomId=cleanRoomId(body&&body.roomId); const role=body&&body.reportedRole==='w'?'w':body&&body.reportedRole==='b'?'b':'';
  if(!roomId||!role) return {ok:false,status:400,code:'INVALID_REPORT',message:'Partie oder gemeldeter Spieler fehlt.'};
  const id=env.GAME_ROOM.idFromName(roomId), stub=env.GAME_ROOM.get(id);
  const response=await stub.fetch(new Request('https://game-room.internal/moderation-context?room='+encodeURIComponent(roomId),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reporterUserId:sessionUser.id,reportedRole:role})}));
  const ctx=await response.json();
  if(!response.ok||!ctx.ok) return {ok:false,status:response.status||403,code:ctx.code||'REPORT_NOT_ALLOWED',message:ctx.message||'Die Meldung ist für diese Partie nicht möglich.'};
  if(ctx.reportedUserId && String(ctx.reportedUserId)===String(sessionUser.id)) return {ok:false,status:400,code:'CANNOT_REPORT_SELF',message:'Du kannst dich nicht selbst melden.'};
  const recent=await env.DB.prepare(`SELECT id FROM moderation_reports WHERE reporter_user_id=? AND room_id=? AND reported_role=? AND created_at>? LIMIT 1`).bind(sessionUser.id,roomId,role,new Date(Date.now()-10*60*1000).toISOString()).first();
  if(recent) return {ok:false,status:429,code:'REPORT_DUPLICATE',message:'Für diesen Spieler wurde vor Kurzem bereits eine Meldung aus dieser Partie gesendet.'};
  const reportId=crypto.randomUUID(), now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO moderation_reports (id,room_id,reporter_user_id,reported_user_id,reported_role,reported_name,reason,comment,chat_snapshot,game_snapshot,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?, 'open',?)`).bind(reportId,roomId,sessionUser.id,ctx.reportedUserId||null,role,ctx.reportedName||'',cleanModerationReason(body.reason),cleanModerationComment(body.comment),JSON.stringify(ctx.chatSnapshot||[]),JSON.stringify(ctx.gameSnapshot||{}),now).run();
  return {ok:true,reportId,message:'Die Meldung wurde vertraulich an den Administrator übermittelt.'};
}

async function createGlobalChatModerationReport(env, sessionUser, body) {
  await ensureModerationTables(env);
  const messageId = cleanGlobalChatMessageId(body && body.messageId);
  if (!messageId || !env || !env.GLOBAL_CHAT) {
    return {ok:false,status:400,code:'INVALID_GLOBAL_CHAT_REPORT',message:'Die Chatnachricht konnte nicht eindeutig zugeordnet werden.'};
  }
  const id = env.GLOBAL_CHAT.idFromName('members');
  const stub = env.GLOBAL_CHAT.get(id);
  const response = await stub.fetch(new Request('https://global-chat.internal/moderation-context', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({messageId, reporterUserId:String(sessionUser.id || '')})
  }));
  let context = null;
  try { context = await response.json(); } catch (_) { context = null; }
  if (!response.ok || !context || !context.ok) {
    return {ok:false,status:response.status || 404,code:(context && context.code) || 'GLOBAL_CHAT_MESSAGE_NOT_FOUND',message:(context && context.message) || 'Die gemeldete Nachricht wurde nicht gefunden.'};
  }
  if (String(context.reportedUserId || '') === String(sessionUser.id || '')) {
    return {ok:false,status:400,code:'CANNOT_REPORT_SELF',message:'Du kannst deine eigene Nachricht nicht melden.'};
  }
  const recent = await env.DB.prepare(
    `SELECT id FROM moderation_reports
      WHERE reporter_user_id = ? AND room_id = 'global-chat' AND reported_user_id = ? AND created_at > ?
      LIMIT 1`
  ).bind(String(sessionUser.id), String(context.reportedUserId || ''), new Date(Date.now() - 10 * 60 * 1000).toISOString()).first();
  if (recent) {
    return {ok:false,status:429,code:'REPORT_DUPLICATE',message:'Für dieses Mitglied wurde vor Kurzem bereits eine Global-Chat-Meldung gesendet.'};
  }
  const reportId = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO moderation_reports
      (id,room_id,reporter_user_id,reported_user_id,reported_role,reported_name,reason,comment,chat_snapshot,game_snapshot,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'open',?)`
  ).bind(
    reportId,
    'global-chat',
    String(sessionUser.id),
    context.reportedUserId || null,
    'member',
    context.reportedName || '',
    cleanModerationReason(body && body.reason),
    cleanModerationComment(body && body.comment),
    JSON.stringify(context.chatSnapshot || []),
    JSON.stringify({kind:'global_chat', messageId}),
    now
  ).run();
  return {ok:true,reportId,message:'Die Global-Chat-Nachricht wurde vertraulich an den Administrator gemeldet.'};
}

async function listModerationReports(env){
  await ensureModerationTables(env);
  const rows=await env.DB.prepare(`SELECT r.*, reporter.username AS reporter_username, target.username AS target_username FROM moderation_reports r LEFT JOIN users reporter ON reporter.id=r.reporter_user_id LEFT JOIN users target ON target.id=r.reported_user_id ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 100`).all();
  return (rows.results||[]).map(r=>({id:r.id,roomId:r.room_id,reporterName:r.reporter_username||'Gelöschter Benutzer',reportedUserId:r.reported_user_id||'',reportedName:r.target_username||r.reported_name||'Gast',reportedRole:r.reported_role,reason:r.reason,comment:r.comment||'',chatSnapshot:JSON.parse(r.chat_snapshot||'[]'),gameSnapshot:JSON.parse(r.game_snapshot||'{}'),status:r.status,adminNote:r.admin_note||'',resolution:r.resolution||'',createdAt:r.created_at,resolvedAt:r.resolved_at||null}));
}
async function applyModerationAction(env,adminUser,body){
  await ensureModerationTables(env);
  const userId=String(body&&body.userId||'').trim(), action=String(body&&body.action||'').trim();
  if(!userId) return {ok:false,status:400,message:'Benutzer fehlt.'};
  const target=await env.DB.prepare(`SELECT * FROM users WHERE id=? LIMIT 1`).bind(userId).first();
  if(!target) return {ok:false,status:404,message:'Der Benutzer wurde nicht gefunden.'};
  if(isAdminUser(target,env)) return {ok:false,status:403,message:'Der Administrator-Account kann nicht gesperrt werden.'};
  const now=new Date().toISOString(), reason=cleanModerationComment(body.reason), note=cleanModerationComment(body.note); let status='active', chat=0, until=null;
  if(action==='warn'){ status=(await moderationStateForUser(env,userId)).accountStatus; chat=(await moderationStateForUser(env,userId)).chatBlocked?1:0; }
  else if(action==='chat_block'){ const old=await moderationStateForUser(env,userId); status=old.accountStatus; chat=1; }
  else if(action==='chat_unblock'){ const old=await moderationStateForUser(env,userId); status=old.accountStatus; chat=0; }
  else if(action==='suspend'){ status='suspended'; chat=1; const hours=Math.max(1,Math.min(24*365,Number(body.hours||24))); until=new Date(Date.now()+hours*3600000).toISOString(); }
  else if(action==='ban'){ status='banned'; chat=1; }
  else if(action==='activate'){ status='active'; chat=0; }
  else return {ok:false,status:400,message:'Unbekannte Moderationsmaßnahme.'};
  await env.DB.prepare(`INSERT INTO moderation_account_status(user_id,account_status,chat_blocked,reason,admin_note,suspended_until,updated_at,updated_by_user_id) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET account_status=excluded.account_status,chat_blocked=excluded.chat_blocked,reason=excluded.reason,admin_note=excluded.admin_note,suspended_until=excluded.suspended_until,updated_at=excluded.updated_at,updated_by_user_id=excluded.updated_by_user_id`).bind(userId,status,chat,reason,note,until,now,adminUser.id).run();
  await env.DB.prepare(`INSERT INTO moderation_actions(id,target_user_id,admin_user_id,action_type,reason,note,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),userId,adminUser.id,action,reason,note,until,now).run();
  if(status==='banned'||status==='suspended') await env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(userId).run();
  try {
    if (env.GLOBAL_CHAT) {
      const chatId = env.GLOBAL_CHAT.idFromName('members');
      const chatStub = env.GLOBAL_CHAT.get(chatId);
      await chatStub.fetch(new Request('https://global-chat.internal/moderation-refresh', {
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({userId,status,chatBlocked:!!chat,suspendedUntil:until})
      }));
    }
  } catch (_) {}
  return {ok:true,message:'Moderationsmaßnahme wurde gespeichert.',state:{accountStatus:status,chatBlocked:!!chat,suspendedUntil:until}};
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
    const me = await publicUserWithRatings(env, session.user); me.moderation = await moderationStateForUser(env, session.user.id); return json({ ok: true, user: me });
  }

  if (url.pathname === '/api/account/leitbild' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' }, { status:401 });
    try {
      await acknowledgeUserLeitbild(env, session.user.id);
      const me = await publicUserWithRatings(env, session.user);
      me.moderation = await moderationStateForUser(env, session.user.id);
      return json({ ok:true, user:me, message:'Danke. Das Leitbild wurde für deinen Account bestätigt.' });
    } catch (_) {
      return json({ ok:false, code:'LEITBILD_SAVE_FAILED', message:'Die Leitbild-Bestätigung konnte nicht gespeichert werden.' }, { status:500 });
    }
  }

  if (url.pathname === '/api/trainer/progress' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst im Gamer einloggen.'}, {status:401});
    try {
      return json({ok:true, progress:await getTrainerProgress(env, session.user.id)});
    } catch (_) {
      return json({ok:false, code:'TRAINER_PROGRESS_UNAVAILABLE', message:'Das Taktik-Rating konnte nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/trainer/progress' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst im Gamer einloggen.'}, {status:401});
    const body = await readJsonBody(request);
    if (!body) return json({ok:false, code:'BAD_JSON', message:'Das Taktik-Ergebnis konnte nicht gelesen werden.'}, {status:400});
    try {
      const saved = await saveTrainerAttempt(env, session.user.id, body);
      if (!saved.ok) return json(saved, {status:saved.status || 400});
      return json(saved);
    } catch (_) {
      return json({ok:false, code:'TRAINER_SAVE_FAILED', message:'Das Taktik-Ergebnis konnte nicht gespeichert werden.'}, {status:500});
    }
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
    return json({ ok: true, user: await publicUserWithRatings(env, user), message: 'Benutzername wurde geändert.' });
  }

  if (url.pathname === '/api/account/avatar' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' }, { status:401 });
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > AVATAR_UPLOAD_MAX_CONTENT_LENGTH) {
      return json({ ok:false, code:'AVATAR_UPLOAD_TOO_LARGE', message:'Das Profilbild ist für den Upload zu groß.' }, { status:413 });
    }
    let form = null;
    try { form = await request.formData(); } catch (_) {
      return json({ ok:false, code:'AVATAR_FORM_INVALID', message:'Das Profilbild konnte nicht gelesen werden.' }, { status:400 });
    }
    const stored = await storeUserAvatar(env, session.user.id, form && form.get('avatar'));
    if (!stored.ok) return json(stored, { status:stored.status || 400 });
    const user = await loadPrivateUser(env, session.user.id);
    return json({ ok:true, user:await publicUserWithRatings(env, user || session.user), message:'Dein Profilbild wurde gespeichert.' });
  }

  if (url.pathname === '/api/account/avatar' && request.method === 'DELETE') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' }, { status:401 });
    const removed = await deleteUserAvatar(env, session.user.id);
    if (!removed.ok) return json(removed, { status:removed.status || 400 });
    const user = await loadPrivateUser(env, session.user.id);
    return json({ ok:true, user:await publicUserWithRatings(env, user || session.user), message:'Dein Profilbild wurde entfernt.' });
  }

  if (url.pathname === '/api/account/profile' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' }, { status:401 });
    const body = await readJsonBody(request);
    if (!body) return json({ ok:false, code:'BAD_JSON', message:'Die Profilangaben konnten nicht gelesen werden.' }, { status:400 });
    const user = await loadPrivateUser(env, session.user.id);
    if (!user) return json({ ok:false, code:'USER_NOT_FOUND', message:'Account wurde nicht gefunden.' }, { status:404 });
    const saved = await saveUserPublicProfile(env, user.id, body);
    if (!saved.ok) return json(saved, { status:400 });
    return json({ ok:true, user:await publicUserWithRatings(env, user), message:'Dein freiwilliges Mitgliederprofil wurde gespeichert.' });
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
    if (email === normalizeEmail(user.email)) return json({ ok:false, code:'EMAIL_UNCHANGED', message:'Diese Mailadresse ist bereits deinem Account zugeordnet.' }, { status:400 });
    const existing = await env.DB.prepare(`SELECT id FROM users WHERE email_lc = ? AND id <> ? LIMIT 1`).bind(email, user.id).first();
    if (existing) return json({ ok: false, code: 'EMAIL_TAKEN', message: 'Diese Mailadresse ist bereits registriert.' }, { status: 409 });

    const action = await createAccountActionToken(env, user.id, 'email_change', email, EMAIL_VERIFICATION_TTL_MS);
    const actionUrl = publicActionUrl(env, 'verifyEmail', action.token);
    const verificationMail = prepareSecurityActionEmail({
      recipientEmail:email,
      recipientName:user.username,
      mailType:'email_change_verification',
      title:'Neue Hammerschach-Mailadresse bestätigen',
      intro:`Bitte bestätige, dass ${email} künftig als Mailadresse für deinen Hammerschach-Account verwendet werden soll.`,
      actionUrl,
      actionLabel:'Neue Mailadresse bestätigen',
      expiryText:'Der Bestätigungslink ist 24 Stunden gültig und kann nur einmal verwendet werden.'
    });
    const result = await sendInvitationEmail(env, { preparedMail:verificationMail, mailType:'email_change_verification' });
    if (!result.ok) {
      return json({ ok:false, code:result.code || 'EMAIL_SEND_FAILED', message:'Die Bestätigungsmail konnte nicht versendet werden. Deine bisherige Mailadresse bleibt unverändert.' }, { status:result.status || 502 });
    }
    try {
      const noticeMail = prepareEmailChangeNoticeEmail({ recipientEmail:user.email, recipientName:user.username, pendingEmail:email });
      await sendInvitationEmail(env, { preparedMail:noticeMail, mailType:'email_change_notice' });
    } catch (_) {}
    return json({
      ok:true,
      user:await publicUserWithRatings(env, user),
      pendingEmail:email,
      message:'Bestätigungsmail wurde an die neue Adresse versendet. Bis zur Bestätigung bleibt die bisherige Adresse aktiv.'
    });
  }

  if (url.pathname === '/api/account/email/resend' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' }, { status:401 });
    const user = await loadPrivateUser(env, session.user.id);
    if (!user) return json({ ok:false, code:'USER_NOT_FOUND', message:'Account wurde nicht gefunden.' }, { status:404 });
    const state = await getUserEmailSecurityState(env, user);
    if (!state.pendingEmail) return json({ ok:false, code:'NO_PENDING_EMAIL', message:'Es gibt keine noch ausstehende Mailadressänderung.' }, { status:400 });
    if (!(await claimAuthMailRequest(env, request, 'email_change_resend', user.id))) {
      return json({ ok:true, message:'Falls ein Versand möglich ist, wurde eine neue Bestätigungsmail vorbereitet.' });
    }
    const action = await createAccountActionToken(env, user.id, 'email_change', state.pendingEmail, EMAIL_VERIFICATION_TTL_MS);
    const actionUrl = publicActionUrl(env, 'verifyEmail', action.token);
    const mail = prepareSecurityActionEmail({
      recipientEmail:state.pendingEmail,
      recipientName:user.username,
      mailType:'email_change_verification',
      title:'Neue Hammerschach-Mailadresse bestätigen',
      intro:`Bitte bestätige, dass ${state.pendingEmail} künftig als Mailadresse für deinen Hammerschach-Account verwendet werden soll.`,
      actionUrl,
      actionLabel:'Neue Mailadresse bestätigen',
      expiryText:'Der Bestätigungslink ist 24 Stunden gültig und kann nur einmal verwendet werden.'
    });
    const result = await sendInvitationEmail(env, { preparedMail:mail, mailType:'email_change_verification' });
    if (!result.ok) return json({ ok:false, code:result.code || 'EMAIL_SEND_FAILED', message:'Die Bestätigungsmail konnte nicht versendet werden.' }, { status:result.status || 502 });
    return json({ ok:true, message:'Eine neue Bestätigungsmail wurde versendet.' });
  }

  if (url.pathname === '/api/account/notifications' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' }, { status:401 });
    const body = await readJsonBody(request);
    if (!body) return json({ ok:false, code:'BAD_JSON', message:'Die E-Mail-Einstellungen konnten nicht gelesen werden.' }, { status:400 });
    try {
      const preferences = await setUserEmailPreferences(env, session.user.id, {
        dailyTurnEnabled:body.dailyTurnEnabled,
        dailyResultEnabled:body.dailyResultEnabled,
        memberNewsEnabled:body.memberNewsEnabled,
        tournamentEnabled:body.tournamentEnabled
      });
      const user = await loadPrivateUser(env, session.user.id) || session.user;
      return json({
        ok:true,
        preferences,
        user:await publicUserWithRatings(env, user),
        message:'E-Mail-Benachrichtigungen wurden gespeichert.'
      });
    } catch (_) {
      return json({ ok:false, code:'NOTIFICATION_SETTINGS_FAILED', message:'Die E-Mail-Einstellungen konnten nicht gespeichert werden.' }, { status:500 });
    }
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
    if (newPassword.length < 8 || newPassword.length > 128) return json({ ok: false, code: 'WEAK_PASSWORD', message: 'Das neue Kennwort muss 8 bis 128 Zeichen haben.' }, { status: 400 });
    const salt = randomBase64Url(16);
    const passwordHash = await hashPassword(newPassword, salt, PASSWORD_ITERATIONS);
    await env.DB.prepare(
      `UPDATE users
          SET password_alg = ?, password_hash = ?, password_salt = ?, password_iterations = ?
        WHERE id = ?`
    ).bind('pbkdf2-sha256', passwordHash, salt, PASSWORD_ITERATIONS, user.id).run();
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND id <> ?`).bind(user.id, session.sessionId).run();
    return json({ ok: true, user: await publicUserWithRatings(env, user), message: 'Kennwort wurde geändert. Andere Anmeldungen wurden beendet.' });
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
    return json({ ok: true, deletedUser: result.deletedUser, cancelledInvitations: result.cancelledInvitations || 0, anonymizedRooms: result.anonymizedRooms || 0, removedGlobalChatMessages: result.removedGlobalChatMessages || 0 });
  }

  if (url.pathname === '/api/tournaments' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Turniere sind nur nach Login verfügbar.'}, {status:401});
    try {
      const tournaments = await listTournaments(env, session.user);
      return json({ok:true, tournaments, unreadCount:tournaments.filter(item => item.unread && item.status !== 'draft').length, serverNow:Date.now()});
    } catch (error) {
      console.error('Tournament list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'TOURNAMENTS_UNAVAILABLE', message:'Die Turniere konnten nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/tournaments' && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const body = await readJsonBody(request);
    if (!body) return json({ok:false, code:'BAD_JSON', message:'Der Turnierentwurf konnte nicht gelesen werden.'}, {status:400});
    const name = cleanTournamentName(body.name);
    const description = cleanTournamentDescription(body.description);
    const players = TOURNAMENT_ALLOWED_PLAYERS.includes(Number(body.players)) ? Number(body.players) : 6;
    const hours = TOURNAMENT_ALLOWED_HOURS.includes(Number(body.hours)) ? Number(body.hours) : 24;
    const variant = normalizeTournamentVariant(body.variant);
    if (name.length < 3) return json({ok:false, code:'INVALID_TOURNAMENT_NAME', message:'Bitte einen Turniernamen mit mindestens drei Zeichen eingeben.'}, {status:400});
    try {
      await ensureTournamentTables(env);
      const requestedId = String(body.id || '').trim();
      const existing = requestedId ? await loadTournamentRow(env, requestedId) : null;
      if (requestedId && (!existing || existing.status !== 'draft')) {
        return json({ok:false, code:'TOURNAMENT_NOT_EDITABLE', message:'Nur ein vorhandener Entwurf kann bearbeitet werden.'}, {status:409});
      }
      const id = existing ? String(existing.id) : crypto.randomUUID();
      const now = new Date().toISOString();
      if (existing) {
        await env.DB.prepare(
          `UPDATE tournaments
              SET name = ?, description = ?, max_players = ?, hours_per_move = ?, rated = ?, variant = ?, updated_at = ?
            WHERE id = ? AND status = 'draft'`
        ).bind(name, description, players, hours, body.rated === false ? 0 : 1, variant, now, id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO tournaments
             (id, name, description, max_players, hours_per_move, rated, variant, status, created_by_user_id,
              current_round, total_rounds, created_at, updated_at, published_at, started_at, ended_at, publication_mail_sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, 0, 0, ?, ?, NULL, NULL, NULL, NULL)`
        ).bind(id, name, description, players, hours, body.rated === false ? 0 : 1, variant, admin.session.user.id, now, now).run();
      }
      const row = await loadTournamentRow(env, id);
      return json({ok:true, tournament:await tournamentDto(env, row, admin.session.user), message:existing ? 'Turnierentwurf wurde aktualisiert.' : 'Turnierentwurf wurde gespeichert.'});
    } catch (error) {
      console.error('Tournament draft save failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'TOURNAMENT_SAVE_FAILED', message:'Der Turnierentwurf konnte nicht gespeichert werden.'}, {status:500});
    }
  }

  const tournamentPublishMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/publish$/);
  if (tournamentPublishMatch && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const body = await readJsonBody(request);
    if (!body || body.confirmed !== true) return json({ok:false, code:'CONFIRMATION_REQUIRED', message:'Bitte die Veröffentlichung ausdrücklich bestätigen.'}, {status:400});
    const tournamentId = String(decodeURIComponent(tournamentPublishMatch[1]) || '').trim();
    try {
      const tournament = await loadTournamentRow(env, tournamentId);
      if (!tournament) return json({ok:false, code:'TOURNAMENT_NOT_FOUND', message:'Das Turnier wurde nicht gefunden.'}, {status:404});
      if (tournament.status !== 'draft') return json({ok:false, code:'TOURNAMENT_ALREADY_PUBLISHED', message:'Dieses Turnier wurde bereits veröffentlicht.'}, {status:409});
      const now = new Date().toISOString();
      const changed = await env.DB.prepare(
        `UPDATE tournaments SET status = 'open', published_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'`
      ).bind(now, now, tournamentId).run();
      if (d1Changes(changed) < 1) return json({ok:false, code:'TOURNAMENT_PUBLISH_CONFLICT', message:'Der Turnierstatus hat sich bereits geändert.'}, {status:409});
      const published = await loadTournamentRow(env, tournamentId);
      const mail = await sendTournamentPublishedEmails(env, published);
      await env.DB.prepare(`UPDATE tournaments SET publication_mail_sent_at = ? WHERE id = ?`).bind(new Date().toISOString(), tournamentId).run();
      return json({ok:true, tournament:await tournamentDto(env, published, admin.session.user), mail, message:`Turnier wurde veröffentlicht. ${mail.sent} Turniermail${mail.sent === 1 ? '' : 's'} versendet${mail.failed ? `, ${mail.failed} fehlgeschlagen` : ''}.`});
    } catch (error) {
      console.error('Tournament publish failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'TOURNAMENT_PUBLISH_FAILED', message:'Das Turnier wurde veröffentlicht, aber die Verarbeitung konnte nicht vollständig abgeschlossen werden.'}, {status:500});
    }
  }

  const tournamentViewedMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/viewed$/);
  if (tournamentViewedMatch && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    const tournamentId = String(decodeURIComponent(tournamentViewedMatch[1]) || '').trim();
    try {
      const tournament = await loadTournamentRow(env, tournamentId);
      if (!tournament || (tournament.status === 'draft' && !isAdminUser(session.user, env))) return json({ok:false, code:'TOURNAMENT_NOT_FOUND', message:'Das Turnier wurde nicht gefunden.'}, {status:404});
      const viewedAt = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO tournament_views (tournament_id, user_id, viewed_at) VALUES (?, ?, ?)
         ON CONFLICT(tournament_id, user_id) DO UPDATE SET viewed_at = excluded.viewed_at`
      ).bind(tournamentId, session.user.id, viewedAt).run();
      return json({ok:true, viewedAt});
    } catch (_) {
      return json({ok:false, code:'TOURNAMENT_VIEW_FAILED', message:'Der Lesestatus konnte nicht gespeichert werden.'}, {status:500});
    }
  }

  const tournamentJoinMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/join$/);
  if (tournamentJoinMatch && (request.method === 'POST' || request.method === 'DELETE')) {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    const tournamentId = String(decodeURIComponent(tournamentJoinMatch[1]) || '').trim();
    try {
      const tournament = await loadTournamentRow(env, tournamentId);
      if (!tournament) return json({ok:false, code:'TOURNAMENT_NOT_FOUND', message:'Das Turnier wurde nicht gefunden.'}, {status:404});
      if (!['open', 'full'].includes(tournament.status)) return json({ok:false, code:'REGISTRATION_CLOSED', message:'Die Anmeldung für dieses Turnier ist geschlossen.'}, {status:409});
      const now = new Date().toISOString();
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (!body || body.confirmed !== true) return json({ok:false, code:'CONFIRMATION_REQUIRED', message:'Bitte deine Teilnahme ausdrücklich bestätigen.'}, {status:400});
        const existing = await env.DB.prepare(`SELECT status FROM tournament_participants WHERE tournament_id = ? AND user_id = ? LIMIT 1`).bind(tournamentId, session.user.id).first();
        if (existing && ['confirmed', 'waiting'].includes(existing.status)) {
          const row = await loadTournamentRow(env, tournamentId);
          return json({ok:true, tournament:await tournamentDto(env, row, session.user), message:existing.status === 'waiting' ? 'Du stehst bereits auf der Warteliste.' : 'Deine Teilnahme ist bereits bestätigt.'});
        }
        await env.DB.prepare(
          `INSERT INTO tournament_participants (tournament_id, user_id, status, joined_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(tournament_id, user_id) DO UPDATE SET status = excluded.status, joined_at = excluded.joined_at, updated_at = excluded.updated_at`
        ).bind(tournamentId, session.user.id, 'waiting', now, now).run();
        const balanced = await rebalanceTournamentParticipants(env, tournamentId, tournament.max_players);
        const nextStatus = balanced.confirmed >= Number(tournament.max_players || 0) ? 'full' : 'open';
        await env.DB.prepare(`UPDATE tournaments SET status = ?, updated_at = ? WHERE id = ? AND status IN ('open','full')`).bind(nextStatus, now, tournamentId).run();
        const row = await loadTournamentRow(env, tournamentId);
        const dto = await tournamentDto(env, row, session.user);
        return json({ok:true, tournament:dto, message:dto.userState === 'waiting' ? `Das Turnier ist voll. Du stehst auf Wartelistenplatz ${dto.waitlistPosition || 1}.` : 'Deine Teilnahme wurde bestätigt.'});
      }

      const existing = await env.DB.prepare(`SELECT status FROM tournament_participants WHERE tournament_id = ? AND user_id = ? LIMIT 1`).bind(tournamentId, session.user.id).first();
      if (!existing || !['confirmed', 'waiting'].includes(existing.status)) return json({ok:false, code:'NOT_REGISTERED', message:'Du bist für dieses Turnier nicht angemeldet.'}, {status:409});
      await env.DB.prepare(`UPDATE tournament_participants SET status = 'withdrawn', updated_at = ? WHERE tournament_id = ? AND user_id = ?`).bind(now, tournamentId, session.user.id).run();
      const balanced = await rebalanceTournamentParticipants(env, tournamentId, tournament.max_players);
      const nextStatus = balanced.confirmed >= Number(tournament.max_players || 0) ? 'full' : 'open';
      await env.DB.prepare(`UPDATE tournaments SET status = ?, updated_at = ? WHERE id = ? AND status IN ('open','full')`).bind(nextStatus, now, tournamentId).run();
      const row = await loadTournamentRow(env, tournamentId);
      return json({ok:true, tournament:await tournamentDto(env, row, session.user), message:'Deine Turnierteilnahme wurde zurückgezogen.'});
    } catch (error) {
      console.error('Tournament registration failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'TOURNAMENT_REGISTRATION_FAILED', message:'Die Turnieranmeldung konnte nicht verarbeitet werden.'}, {status:500});
    }
  }

  const tournamentStartMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/start$/);
  if (tournamentStartMatch && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const body = await readJsonBody(request);
    if (!body || body.confirmed !== true) return json({ok:false, code:'CONFIRMATION_REQUIRED', message:'Bitte den manuellen Turnierstart ausdrücklich bestätigen.'}, {status:400});
    const tournamentId = String(decodeURIComponent(tournamentStartMatch[1]) || '').trim();
    try {
      const tournament = await loadTournamentRow(env, tournamentId);
      if (!tournament) return json({ok:false, code:'TOURNAMENT_NOT_FOUND', message:'Das Turnier wurde nicht gefunden.'}, {status:404});
      if (tournament.status === 'running') {
        const pending = await env.DB.prepare(
          `SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id = ? AND round_number = ? AND status = 'creating'`
        ).bind(tournamentId, Number(tournament.current_round || 1)).first();
        if (Number(pending && pending.count || 0) < 1) return json({ok:false, code:'TOURNAMENT_ALREADY_RUNNING', message:'Das Turnier läuft bereits vollständig.'}, {status:409});
        await startTournamentRound(env, tournament, Number(tournament.current_round || 1));
        const recovered = await loadTournamentRow(env, tournamentId);
        return json({ok:true, tournament:await tournamentDto(env, recovered, admin.session.user), message:'Die noch fehlenden Partien der laufenden Doppelrunde wurden vorbereitet.'});
      }
      if (!['open', 'full'].includes(tournament.status)) return json({ok:false, code:'TOURNAMENT_NOT_STARTABLE', message:'Dieses Turnier kann in seinem aktuellen Status nicht gestartet werden.'}, {status:409});
      const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ? AND status = 'confirmed'`).bind(tournamentId).first();
      if (Number(count && count.count || 0) !== Number(tournament.max_players || 0)) return json({ok:false, code:'TOURNAMENT_NOT_FULL', message:`Für den Start werden genau ${Number(tournament.max_players || 0)} bestätigte Teilnehmer benötigt.`}, {status:409});
      const now = new Date().toISOString();
      const changed = await env.DB.prepare(
        `UPDATE tournaments SET status = 'running', current_round = 1, total_rounds = ?, started_at = ?, updated_at = ?
          WHERE id = ? AND status IN ('open','full')`
      ).bind(Number(tournament.max_players || 0) - 1, now, now, tournamentId).run();
      if (d1Changes(changed) < 1) return json({ok:false, code:'TOURNAMENT_START_CONFLICT', message:'Das Turnier wurde bereits anderweitig gestartet.'}, {status:409});
      const running = await loadTournamentRow(env, tournamentId);
      await startTournamentRound(env, running, 1);
      const finalRow = await loadTournamentRow(env, tournamentId);
      return json({ok:true, tournament:await tournamentDto(env, finalRow, admin.session.user), message:'Das Turnier wurde gestartet. Die Partien der ersten Doppelrunde sind eröffnet.'});
    } catch (error) {
      console.error('Tournament start failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'TOURNAMENT_START_FAILED', message:error && error.message ? error.message : 'Das Turnier konnte nicht gestartet werden.'}, {status:500});
    }
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

  if (url.pathname === '/api/public-games' && request.method === 'GET') {
    try {
      const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
      const games = await listPublicGames(env, session ? session.user : null);
      return json({ ok: true, games, serverNow: Date.now() });
    } catch (_) {
      return json({ ok: false, code: 'PUBLIC_GAMES_UNAVAILABLE', message: 'Öffentliche Partien konnten nicht geladen werden.' }, { status: 500 });
    }
  }

  if (url.pathname === '/api/open-offers' && request.method === 'GET') {
    try {
      const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
      const offers = await listOpenGameOffers(env, session ? session.user : null);
      return json({ ok:true, offers, serverNow:Date.now() });
    } catch (_) {
      return json({ ok:false, code:'OPEN_OFFERS_UNAVAILABLE', message:'Offene Partien konnten nicht geladen werden.' }, { status:500 });
    }
  }

  const openOfferActionMatch = url.pathname.match(/^\/api\/open-offers\/([^/]+)$/);
  if (openOfferActionMatch && (request.method === 'POST' || request.method === 'DELETE')) {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' }, { status:401 });
    const roomId = cleanRoomId(decodeURIComponent(openOfferActionMatch[1]));
    if (!roomId) return json({ ok:false, code:'INVALID_ROOM', message:'Ungültiger Spielraum.' }, { status:400 });
    if (!env.GAME_ROOM) return json({ ok:false, code:'ROOM_SERVICE_UNAVAILABLE', message:'Der Spielraum-Dienst ist nicht verfügbar.' }, { status:503 });
    try {
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);
      const internalPath = request.method === 'POST' ? '/accept-open-offer' : '/withdraw-open-offer';
      const response = await stub.fetch(new Request('https://game-room.internal' + internalPath + '?room=' + encodeURIComponent(roomId), {
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-hammerschach-user-id':String(session.user.id || ''),
          'x-hammerschach-username':String(session.user.username || '')
        },
        body:JSON.stringify({ userId:String(session.user.id || ''), username:String(session.user.username || '') })
      }));
      let result = null;
      try { result = await response.json(); } catch (_) { result = null; }
      if (!response.ok || !result || !result.ok) {
        return json({
          ok:false,
          code:result && result.code ? result.code : (request.method === 'POST' ? 'OPEN_OFFER_ACCEPT_FAILED' : 'OPEN_OFFER_WITHDRAW_FAILED'),
          message:result && result.message ? result.message : (request.method === 'POST' ? 'Das Partieangebot konnte nicht angenommen werden.' : 'Das Partieangebot konnte nicht zurückgezogen werden.')
        }, { status:response.status || 400 });
      }
      try {
        if (await ensureOpenGameOffersTable(env)) await env.DB.prepare(`DELETE FROM open_game_offers WHERE room_id = ?`).bind(roomId).run();
      } catch (_) {}
      return json(Object.assign({ ok:true, roomId }, result));
    } catch (_) {
      return json({ ok:false, code:request.method === 'POST' ? 'OPEN_OFFER_ACCEPT_FAILED' : 'OPEN_OFFER_WITHDRAW_FAILED', message:request.method === 'POST' ? 'Das Partieangebot konnte nicht angenommen werden.' : 'Das Partieangebot konnte nicht zurückgezogen werden.' }, { status:500 });
    }
  }

  if (url.pathname === '/api/analyzer/games' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Beendete Gamer-Partien sind nur nach Login verfügbar.'}, {status:401});
    try {
      const games = await listAnalyzerGames(env, session.user);
      return json({ok:true, games, serverNow:Date.now()});
    } catch (_) {
      return json({ok:false, code:'ANALYZER_GAMES_UNAVAILABLE', message:'Beendete Partien konnten nicht geladen werden.'}, {status:500});
    }
  }

  const analyzerPgnMatch = url.pathname.match(/^\/api\/analyzer\/games\/([^/]+)\/pgn$/);
  if (analyzerPgnMatch && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    const roomId = cleanRoomId(decodeURIComponent(analyzerPgnMatch[1]));
    if (!roomId) return json({ok:false, code:'INVALID_ROOM', message:'Ungültiger Spielraum.'}, {status:400});
    try {
      if (!(await ensureCompletedGamesTable(env))) throw new Error('D1 unavailable');
      const game = await env.DB.prepare(
        `SELECT room_id, white_name, black_name, ended_at, pgn
           FROM completed_games
          WHERE room_id = ?
            AND (white_user_id = ? OR black_user_id = ?)
          LIMIT 1`
      ).bind(roomId, session.user.id, session.user.id).first();
      if (!game || !game.pgn) return json({ok:false, code:'GAME_NOT_FOUND', message:'Diese beendete Partie ist nicht im Analyse-Archiv vorhanden.'}, {status:404});
      const datePart = pgnDateFromIso(game.ended_at || null).replace(/\./g, '-');
      const filename = safePgnFilePart('Hammerschach-' + datePart + '-' + (game.white_name || 'Weiss') + '-vs-' + (game.black_name || 'Schwarz')) + '.pgn';
      return new Response(String(game.pgn), {
        status:200,
        headers:{
          'content-type':'application/x-chess-pgn; charset=utf-8',
          'content-disposition':'attachment; filename="' + filename + '"',
          'cache-control':'private, no-store',
          'access-control-allow-origin':'*',
          'access-control-expose-headers':'content-disposition'
        }
      });
    } catch (_) {
      return json({ok:false, code:'PGN_UNAVAILABLE', message:'Die beendete Partie konnte nicht für den Analyzer geladen werden.'}, {status:500});
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

  if (url.pathname === '/api/auth/password-reset/request' && request.method === 'POST') {
    const startedAt = Date.now();
    const body = await readJsonBody(request);
    const identifier = body ? String(body.identifier || '').trim() : '';
    const rate = await checkAuthRateLimit(env, request, 'password_reset_request', identifier, RECOVERY_REQUEST_RATE_POLICY);
    if (!rate.allowed) {
      try { await recordAuthSecurityEvent(env, request, 'password_reset_request', 'throttled', { context:rate.context, detailCode:'RATE_LIMITED' }); } catch (_) {}
      await waitForMinimumResponseTime(startedAt);
      return json({ ok:true, message:'Falls ein passender bestätigter Account existiert, wurde eine Mail zum Zurücksetzen des Kennworts versendet.' });
    }
    try { await recordAuthRateLimitEvent(env, rate.context, 'attempt'); } catch (_) {}
    try {
      const user = await findUserByIdentifier(env, identifier);
      if (user && !(user.disabled === 1 || user.disabled === true || user.deleted_at)) {
        const result = await sendPasswordResetEmail(env, user, request);
        const outcome = result && result.ok && !result.skipped ? 'accepted' : result && result.skipped ? 'skipped' : 'error';
        try { await recordAuthSecurityEvent(env, request, 'password_reset_request', outcome, { context:rate.context, userId:user.id, detailCode:result && (result.reason || result.code) }); } catch (_) {}
        if (!result.ok) console.error('Password reset mail failed', result.code || '', result.message || '');
      } else {
        try { await recordAuthSecurityEvent(env, request, 'password_reset_request', 'not_found', { context:rate.context, detailCode:'GENERIC_RESPONSE' }); } catch (_) {}
      }
    } catch (error) {
      try { await recordAuthSecurityEvent(env, request, 'password_reset_request', 'error', { context:rate.context, detailCode:'INTERNAL_ERROR' }); } catch (_) {}
      console.error('Password reset request failed', error && error.message ? error.message : String(error || 'unknown'));
    }
    await waitForMinimumResponseTime(startedAt);
    return json({ ok:true, message:'Falls ein passender bestätigter Account existiert, wurde eine Mail zum Zurücksetzen des Kennworts versendet.' });
  }

  if (url.pathname === '/api/auth/password-reset/confirm' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const tokenValue = body ? String(body.token || '').trim() : '';
    const rate = await checkAuthRateLimit(env, request, 'password_reset_confirm', tokenValue, TOKEN_CONFIRM_RATE_POLICY);
    if (!rate.allowed) {
      try { await recordAuthSecurityEvent(env, request, 'password_reset_confirm', 'throttled', { context:rate.context, detailCode:'RATE_LIMITED' }); } catch (_) {}
      return authRateLimitResponse('Zu viele ungültige Bestätigungsversuche. Bitte warte kurz und öffne den Link später erneut.', rate.retryAfterSeconds);
    }
    if (!body) {
      try {
        await recordAuthRateLimitEvent(env, rate.context, 'failure');
        await recordAuthSecurityEvent(env, request, 'password_reset_confirm', 'failure', { context:rate.context, detailCode:'BAD_JSON' });
      } catch (_) {}
      return json({ ok:false, code:'BAD_JSON', message:'Die Angaben konnten nicht gelesen werden.' }, { status:400 });
    }
    const tokenRow = await loadValidAccountActionToken(env, body.token, 'password_reset');
    if (!tokenRow) {
      try {
        await recordAuthRateLimitEvent(env, rate.context, 'failure');
        await recordAuthSecurityEvent(env, request, 'password_reset_confirm', 'failure', { context:rate.context, detailCode:'INVALID_OR_EXPIRED_TOKEN' });
      } catch (_) {}
      return json({ ok:false, code:'INVALID_OR_EXPIRED_TOKEN', message:'Der Link ist ungültig, abgelaufen oder wurde bereits verwendet.' }, { status:400 });
    }
    const newPassword = String(body.newPassword || '');
    if (newPassword.length < 8 || newPassword.length > 128) {
      try { await recordAuthSecurityEvent(env, request, 'password_reset_confirm', 'rejected', { context:rate.context, userId:tokenRow.user_id, detailCode:'WEAK_PASSWORD' }); } catch (_) {}
      return json({ ok:false, code:'WEAK_PASSWORD', message:'Das neue Kennwort muss 8 bis 128 Zeichen haben.' }, { status:400 });
    }
    const salt = randomBase64Url(16);
    const passwordHash = await hashPassword(newPassword, salt, PASSWORD_ITERATIONS);
    const used = await markAccountActionTokenUsed(env, tokenRow);
    if (!used) {
      try {
        await recordAuthRateLimitEvent(env, rate.context, 'failure');
        await recordAuthSecurityEvent(env, request, 'password_reset_confirm', 'failure', { context:rate.context, userId:tokenRow.user_id, detailCode:'TOKEN_ALREADY_USED' });
      } catch (_) {}
      return json({ ok:false, code:'TOKEN_ALREADY_USED', message:'Der Link wurde bereits verwendet.' }, { status:409 });
    }
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE users SET password_alg = ?, password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?`
      ).bind('pbkdf2-sha256', passwordHash, salt, PASSWORD_ITERATIONS, tokenRow.user_id),
      env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(tokenRow.user_id),
      env.DB.prepare(`UPDATE account_action_tokens SET used_at = ? WHERE user_id = ? AND purpose = 'password_reset' AND used_at IS NULL`).bind(new Date().toISOString(), tokenRow.user_id)
    ]);
    try {
      await clearAuthSubjectFailures(env, 'password_reset_confirm', rate.context.subjectHash);
      await recordAuthSecurityEvent(env, request, 'password_reset_confirm', 'success', { context:rate.context, userId:tokenRow.user_id, detailCode:'PASSWORD_CHANGED' });
    } catch (_) {}
    return json({ ok:true, message:'Das Kennwort wurde geändert. Bitte melde dich neu an.' });
  }

  if (url.pathname === '/api/auth/email-verification/request' && request.method === 'POST') {
    const startedAt = Date.now();
    const body = await readJsonBody(request);
    const identifier = body ? String(body.identifier || '').trim() : '';
    const rate = await checkAuthRateLimit(env, request, 'email_verification_request', identifier, RECOVERY_REQUEST_RATE_POLICY);
    if (!rate.allowed) {
      try { await recordAuthSecurityEvent(env, request, 'email_verification_request', 'throttled', { context:rate.context, detailCode:'RATE_LIMITED' }); } catch (_) {}
      await waitForMinimumResponseTime(startedAt);
      return json({ ok:true, message:'Falls der Account noch nicht bestätigt ist, wurde eine neue Bestätigungsmail versendet.' });
    }
    try { await recordAuthRateLimitEvent(env, rate.context, 'attempt'); } catch (_) {}
    try {
      const user = await findUserByIdentifier(env, identifier);
      if (user && !(user.disabled === 1 || user.disabled === true || user.deleted_at)) {
        const state = await getUserEmailSecurityState(env, user);
        if (!state.emailVerified) {
          const result = await sendRegistrationVerificationEmail(env, user, request);
          const outcome = result && result.ok && !result.skipped ? 'accepted' : result && result.skipped ? 'skipped' : 'error';
          try { await recordAuthSecurityEvent(env, request, 'email_verification_request', outcome, { context:rate.context, userId:user.id, detailCode:result && (result.reason || result.code) }); } catch (_) {}
          if (!result.ok) console.error('Verification resend failed', result.code || '', result.message || '');
        } else {
          try { await recordAuthSecurityEvent(env, request, 'email_verification_request', 'skipped', { context:rate.context, userId:user.id, detailCode:'ALREADY_VERIFIED' }); } catch (_) {}
        }
      } else {
        try { await recordAuthSecurityEvent(env, request, 'email_verification_request', 'not_found', { context:rate.context, detailCode:'GENERIC_RESPONSE' }); } catch (_) {}
      }
    } catch (error) {
      try { await recordAuthSecurityEvent(env, request, 'email_verification_request', 'error', { context:rate.context, detailCode:'INTERNAL_ERROR' }); } catch (_) {}
      console.error('Verification request failed', error && error.message ? error.message : String(error || 'unknown'));
    }
    await waitForMinimumResponseTime(startedAt);
    return json({ ok:true, message:'Falls der Account noch nicht bestätigt ist, wurde eine neue Bestätigungsmail versendet.' });
  }

  if (url.pathname === '/api/auth/email-verification/confirm' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const tokenValue = body ? String(body.token || '').trim() : '';
    const rate = await checkAuthRateLimit(env, request, 'email_verification_confirm', tokenValue, TOKEN_CONFIRM_RATE_POLICY);
    if (!rate.allowed) {
      try { await recordAuthSecurityEvent(env, request, 'email_verification_confirm', 'throttled', { context:rate.context, detailCode:'RATE_LIMITED' }); } catch (_) {}
      return authRateLimitResponse('Zu viele ungültige Bestätigungsversuche. Bitte warte kurz und öffne den Link später erneut.', rate.retryAfterSeconds);
    }
    if (!body) {
      try {
        await recordAuthRateLimitEvent(env, rate.context, 'failure');
        await recordAuthSecurityEvent(env, request, 'email_verification_confirm', 'failure', { context:rate.context, detailCode:'BAD_JSON' });
      } catch (_) {}
      return json({ ok:false, code:'BAD_JSON', message:'Der Bestätigungslink konnte nicht gelesen werden.' }, { status:400 });
    }
    const tokenRow = await loadValidAccountActionToken(env, body.token, ['verify_registration', 'email_change']);
    if (!tokenRow) {
      try {
        await recordAuthRateLimitEvent(env, rate.context, 'failure');
        await recordAuthSecurityEvent(env, request, 'email_verification_confirm', 'failure', { context:rate.context, detailCode:'INVALID_OR_EXPIRED_TOKEN' });
      } catch (_) {}
      return json({ ok:false, code:'INVALID_OR_EXPIRED_TOKEN', message:'Der Bestätigungslink ist ungültig, abgelaufen oder wurde bereits verwendet.' }, { status:400 });
    }
    const targetEmail = normalizeEmail(tokenRow.email);
    if (!targetEmail) {
      try { await recordAuthSecurityEvent(env, request, 'email_verification_confirm', 'rejected', { context:rate.context, userId:tokenRow.user_id, detailCode:'INVALID_EMAIL' }); } catch (_) {}
      return json({ ok:false, code:'INVALID_EMAIL', message:'Die Mailadresse im Bestätigungslink ist ungültig.' }, { status:400 });
    }

    if (tokenRow.purpose === 'email_change') {
      const existing = await env.DB.prepare(`SELECT id FROM users WHERE email_lc = ? AND id <> ? LIMIT 1`).bind(targetEmail, tokenRow.user_id).first();
      if (existing) {
        try { await recordAuthSecurityEvent(env, request, 'email_verification_confirm', 'rejected', { context:rate.context, userId:tokenRow.user_id, detailCode:'EMAIL_TAKEN' }); } catch (_) {}
        return json({ ok:false, code:'EMAIL_TAKEN', message:'Diese Mailadresse wurde inzwischen einem anderen Account zugeordnet.' }, { status:409 });
      }
      const used = await markAccountActionTokenUsed(env, tokenRow);
      if (!used) {
        try {
          await recordAuthRateLimitEvent(env, rate.context, 'failure');
          await recordAuthSecurityEvent(env, request, 'email_verification_confirm', 'failure', { context:rate.context, userId:tokenRow.user_id, detailCode:'TOKEN_ALREADY_USED' });
        } catch (_) {}
        return json({ ok:false, code:'TOKEN_ALREADY_USED', message:'Der Bestätigungslink wurde bereits verwendet.' }, { status:409 });
      }
      await env.DB.batch([
        env.DB.prepare(`UPDATE users SET email = ?, email_lc = ? WHERE id = ?`).bind(targetEmail, targetEmail, tokenRow.user_id),
        env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(tokenRow.user_id),
        env.DB.prepare(`UPDATE account_action_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL`).bind(new Date().toISOString(), tokenRow.user_id)
      ]);
      await setCurrentEmailVerified(env, tokenRow.user_id, targetEmail, true);
      try {
        await clearAuthSubjectFailures(env, 'email_verification_confirm', rate.context.subjectHash);
        await recordAuthSecurityEvent(env, request, 'email_verification_confirm', 'success', { context:rate.context, userId:tokenRow.user_id, detailCode:'EMAIL_CHANGED' });
      } catch (_) {}
      return json({ ok:true, emailChanged:true, message:'Die neue Mailadresse wurde bestätigt. Bitte melde dich erneut an.' });
    }

    const used = await markAccountActionTokenUsed(env, tokenRow);
    if (!used) {
      try {
        await recordAuthRateLimitEvent(env, rate.context, 'failure');
        await recordAuthSecurityEvent(env, request, 'email_verification_confirm', 'failure', { context:rate.context, userId:tokenRow.user_id, detailCode:'TOKEN_ALREADY_USED' });
      } catch (_) {}
      return json({ ok:false, code:'TOKEN_ALREADY_USED', message:'Der Bestätigungslink wurde bereits verwendet.' }, { status:409 });
    }
    await setCurrentEmailVerified(env, tokenRow.user_id, targetEmail, true);
    await env.DB.prepare(`UPDATE account_action_tokens SET used_at = ? WHERE user_id = ? AND purpose = 'verify_registration' AND used_at IS NULL`).bind(new Date().toISOString(), tokenRow.user_id).run();
    try {
      await clearAuthSubjectFailures(env, 'email_verification_confirm', rate.context.subjectHash);
      await recordAuthSecurityEvent(env, request, 'email_verification_confirm', 'success', { context:rate.context, userId:tokenRow.user_id, detailCode:'REGISTRATION_VERIFIED' });
    } catch (_) {}
    return json({ ok:true, message:'Deine Mailadresse ist bestätigt. Du kannst dich jetzt einloggen.' });
  }

  if (url.pathname === '/api/register' && request.method === 'POST') {
    const startedAt = Date.now();
    const body = await readJsonBody(request);
    const rawUsername = body ? String(body.username || '').trim() : '';
    const rawEmail = body ? String(body.email || '').trim() : '';
    const registrationSubject = `${rawUsername.toLowerCase()}|${rawEmail.toLowerCase()}`;
    const rate = await checkAuthRateLimit(env, request, 'register', registrationSubject, REGISTRATION_RATE_POLICY);
    if (!rate.allowed) {
      try { await recordAuthSecurityEvent(env, request, 'register', 'throttled', { context:rate.context, detailCode:'RATE_LIMITED' }); } catch (_) {}
      return authRateLimitResponse('Zu viele Registrierungsversuche. Bitte warte und versuche es später erneut.', rate.retryAfterSeconds);
    }
    try { await recordAuthRateLimitEvent(env, rate.context, 'attempt'); } catch (_) {}
    if (!body) {
      try { await recordAuthSecurityEvent(env, request, 'register', 'rejected', { context:rate.context, detailCode:'BAD_JSON' }); } catch (_) {}
      return json({ ok: false, code: 'BAD_JSON', message: 'Registrierungsdaten konnten nicht gelesen werden.' }, { status: 400 });
    }

    const username = cleanUsername(body.username);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    if (!username) {
      try { await recordAuthSecurityEvent(env, request, 'register', 'rejected', { context:rate.context, detailCode:'INVALID_USERNAME' }); } catch (_) {}
      return json({ ok: false, code: 'INVALID_USERNAME', message: 'Benutzername: 3 bis 24 Zeichen, erlaubt sind Buchstaben, Zahlen, _ und -.' }, { status: 400 });
    }
    if (!email) {
      try { await recordAuthSecurityEvent(env, request, 'register', 'rejected', { context:rate.context, detailCode:'INVALID_EMAIL' }); } catch (_) {}
      return json({ ok: false, code: 'INVALID_EMAIL', message: 'Bitte eine gültige Mailadresse eingeben.' }, { status: 400 });
    }
    if (password.length < 8 || password.length > 128) {
      try { await recordAuthSecurityEvent(env, request, 'register', 'rejected', { context:rate.context, detailCode:'WEAK_PASSWORD' }); } catch (_) {}
      return json({ ok: false, code: 'WEAK_PASSWORD', message: 'Das Kennwort muss 8 bis 128 Zeichen haben.' }, { status: 400 });
    }

    const usernameLc = username.toLowerCase();
    const existing = await env.DB.prepare(
      `SELECT id, username_lc, email_lc FROM users WHERE username_lc = ? OR email_lc = ? LIMIT 1`
    ).bind(usernameLc, email).first();
    if (existing) {
      try { await recordAuthSecurityEvent(env, request, 'register', 'rejected', { context:rate.context, userId:existing.id, detailCode:'DUPLICATE_ACCOUNT_DATA' }); } catch (_) {}
      await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
      return json({
        ok:false,
        code:'REGISTRATION_NOT_AVAILABLE',
        message:'Die Registrierung konnte mit diesen Angaben nicht abgeschlossen werden. Bitte Benutzername und Mailadresse prüfen oder im Login die Bestätigungsmail erneut anfordern.'
      }, { status:409 });
    }

    const id = crypto.randomUUID();
    const salt = randomBase64Url(16);
    const passwordHash = await hashPassword(password, salt, PASSWORD_ITERATIONS);
    const nowIso = new Date().toISOString();
    try {
      await env.DB.prepare(
        `INSERT INTO users (id, username, username_lc, email, email_lc, password_alg, password_hash, password_salt, password_iterations, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, username, usernameLc, email, email, 'pbkdf2-sha256', passwordHash, salt, PASSWORD_ITERATIONS, nowIso).run();
    } catch (error) {
      const message = String(error && error.message || '');
      if (/unique|constraint/i.test(message)) {
        try { await recordAuthSecurityEvent(env, request, 'register', 'rejected', { context:rate.context, detailCode:'DUPLICATE_ACCOUNT_DATA' }); } catch (_) {}
        await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
        return json({
          ok:false,
          code:'REGISTRATION_NOT_AVAILABLE',
          message:'Die Registrierung konnte mit diesen Angaben nicht abgeschlossen werden. Bitte Benutzername und Mailadresse prüfen oder im Login die Bestätigungsmail erneut anfordern.'
        }, { status:409 });
      }
      throw error;
    }

    await ensureRatingRowsForUser(env, id);
    await setCurrentEmailVerified(env, id, email, false);
    const createdUser = { id, username, email, created_at: nowIso };
    const mailResult = await sendRegistrationVerificationEmail(env, createdUser, request);
    try {
      await recordAuthSecurityEvent(env, request, 'register', 'success', {
        context:rate.context,
        userId:id,
        detailCode:mailResult && mailResult.ok && !mailResult.skipped ? 'VERIFICATION_SENT' : mailResult && mailResult.skipped ? 'VERIFICATION_THROTTLED' : 'VERIFICATION_SEND_FAILED'
      });
    } catch (_) {}
    await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
    return json({
      ok:true,
      verificationRequired:true,
      mailSent:!!(mailResult && mailResult.ok && !mailResult.skipped),
      message:mailResult && mailResult.ok
        ? 'Account wurde angelegt. Bitte bestätige jetzt deine Mailadresse über den zugesandten Link.'
        : 'Account wurde angelegt. Die Bestätigungsmail konnte nicht versendet werden; nutze im Login „Bestätigungsmail erneut senden“.'
    });
  }

  if (url.pathname === '/api/login' && request.method === 'POST') {
    const startedAt = Date.now();
    const body = await readJsonBody(request);
    const identifier = body ? String(body.identifier || '').trim() : '';
    const password = body ? String(body.password || '') : '';
    const rate = await checkAuthRateLimit(env, request, 'login', identifier, LOGIN_RATE_POLICY);
    if (!rate.allowed) {
      try { await recordAuthSecurityEvent(env, request, 'login', 'throttled', { context:rate.context, detailCode:'RATE_LIMITED' }); } catch (_) {}
      await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
      return authRateLimitResponse('Zu viele fehlgeschlagene Login-Versuche. Bitte warte kurz und versuche es erneut.', rate.retryAfterSeconds);
    }
    if (!body) {
      try {
        await recordAuthRateLimitEvent(env, rate.context, 'failure');
        await recordAuthSecurityEvent(env, request, 'login', 'failure', { context:rate.context, detailCode:'BAD_JSON' });
      } catch (_) {}
      await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
      return json({ ok: false, code: 'BAD_JSON', message: 'Login-Daten konnten nicht gelesen werden.' }, { status: 400 });
    }

    const email = normalizeEmail(identifier);
    const usernameLc = identifier.toLowerCase();
    if (!identifier || !password) {
      try {
        await recordAuthRateLimitEvent(env, rate.context, 'failure');
        await recordAuthSecurityEvent(env, request, 'login', 'failure', { context:rate.context, detailCode:'MISSING_LOGIN' });
      } catch (_) {}
      await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
      return json({ ok: false, code: 'MISSING_LOGIN', message: 'Bitte Benutzername/Mailadresse und Kennwort eingeben.' }, { status: 400 });
    }
    if (password.length > 128) {
      try {
        await recordAuthRateLimitEvent(env, rate.context, 'failure');
        await recordAuthSecurityEvent(env, request, 'login', 'failure', { context:rate.context, detailCode:'INVALID_LOGIN' });
      } catch (_) {}
      await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
      return json({ ok:false, code:'INVALID_LOGIN', message:'Login fehlgeschlagen. Bitte Daten prüfen.' }, { status:401 });
    }

    const user = await env.DB.prepare(
      email
        ? `SELECT * FROM users WHERE email_lc = ? LIMIT 1`
        : `SELECT * FROM users WHERE username_lc = ? LIMIT 1`
    ).bind(email || usernameLc).first();

    const valid = await verifyPasswordConstantTime(password, user);
    if (!valid || !user) {
      try {
        await recordAuthRateLimitEvent(env, rate.context, 'failure');
        await recordAuthSecurityEvent(env, request, 'login', 'failure', { context:rate.context, detailCode:'INVALID_CREDENTIALS' });
      } catch (_) {}
      await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
      return json({ ok: false, code: 'INVALID_LOGIN', message: 'Login fehlgeschlagen. Bitte Daten prüfen.' }, { status: 401 });
    }

    try { await clearAuthSubjectFailures(env, 'login', rate.context.subjectHash); } catch (_) {}
    if (user.disabled === 1 || user.disabled === true || user.deleted_at) {
      try { await recordAuthSecurityEvent(env, request, 'login', 'blocked', { context:rate.context, userId:user.id, detailCode:'ACCOUNT_DISABLED' }); } catch (_) {}
      await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
      return json({ ok: false, code: 'ACCOUNT_DISABLED', message: 'Dieser Account ist deaktiviert.' }, { status: 403 });
    }
    const emailSecurity = await getUserEmailSecurityState(env, user);
    if (!emailSecurity.emailVerified) {
      try { await recordAuthSecurityEvent(env, request, 'login', 'blocked', { context:rate.context, userId:user.id, detailCode:'EMAIL_NOT_VERIFIED' }); } catch (_) {}
      await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
      return json({ ok:false, code:'EMAIL_NOT_VERIFIED', message:'Bitte bestätige zuerst deine Mailadresse. Im Login kannst du die Bestätigungsmail erneut anfordern.' }, { status:403 });
    }

    await ensureRatingRowsForUser(env, user.id);
    const usable = await requireUsableAccount(env, user);
    if(!usable.ok){
      try { await recordAuthSecurityEvent(env, request, 'login', 'blocked', { context:rate.context, userId:user.id, detailCode:usable.code }); } catch (_) {}
      await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
      return json({ok:false,code:usable.code,message:usable.message},{status:403});
    }
    const token = await createSession(env, user.id);
    try { await recordAuthSecurityEvent(env, request, 'login', 'success', { context:rate.context, userId:user.id, detailCode:'SESSION_CREATED' }); } catch (_) {}
    await waitForMinimumResponseTime(startedAt, AUTH_LOGIN_MIN_RESPONSE_MS);
    const publicAccount = await publicUserWithRatings(env, user);
    publicAccount.moderation = usable.state;
    return json({ ok: true, sessionToken: token, user: publicAccount });
  }

  if (url.pathname === '/api/invitations/email' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' }, { status:401 });
    const body = await readJsonBody(request);
    if (!body) return json({ ok:false, code:'BAD_JSON', message:'Die Einladung konnte nicht gelesen werden.' }, { status:400 });

    const roomId = cleanRoomId(body.roomId || body.room);
    const recipientUserId = cleanInvitationRecipientUserId(body.recipientUserId || body.memberId || body.userId);
    if (!roomId) return json({ ok:false, code:'INVALID_ROOM', message:'Der Spielraum ist ungültig.' }, { status:400 });
    if (!recipientUserId) return json({ ok:false, code:'INVALID_RECIPIENT', message:'Bitte ein gültiges Mitglied auswählen.' }, { status:400 });
    if (String(recipientUserId) === String(session.user.id)) {
      return json({ ok:false, code:'CANNOT_INVITE_SELF', message:'Du kannst deinen eigenen Account nicht einladen.' }, { status:400 });
    }
    if (!env.GAME_ROOM) return json({ ok:false, code:'ROOM_SERVICE_UNAVAILABLE', message:'Der Spielraum-Dienst ist momentan nicht verfügbar.' }, { status:503 });

    let access = null;
    try {
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);
      const accessResponse = await stub.fetch(new Request('https://game-room.internal/invitation-email-context?room=' + encodeURIComponent(roomId), {
        method:'POST',
        headers:{ 'x-hammerschach-user-id':String(session.user.id || '') }
      }));
      try { access = await accessResponse.json(); } catch (_) { access = null; }
      if (!accessResponse.ok || !access || !access.ok) {
        return json({
          ok:false,
          code:access && access.code ? access.code : 'INVITATION_NOT_ALLOWED',
          message:access && access.message ? access.message : 'Für diesen Spielraum darf keine Einladung versendet werden.'
        }, { status:accessResponse.status || 403 });
      }
    } catch (_) {
      return json({ ok:false, code:'ROOM_ACCESS_FAILED', message:'Der Spielraum konnte nicht geprüft werden.' }, { status:503 });
    }

    const recipient = await env.DB.prepare(
      `SELECT id, username, email FROM users WHERE id = ? LIMIT 1`
    ).bind(recipientUserId).first();
    const recipientEmail = normalizeEmail(recipient && recipient.email);
    if (!recipient || !recipientEmail) {
      return json({ ok:false, code:'RECIPIENT_NOT_FOUND', message:'Das ausgewählte Mitglied oder seine Mailadresse wurde nicht gefunden.' }, { status:404 });
    }
    const recipientEmailSecurity = await getUserEmailSecurityState(env, recipient);
    if (!recipientEmailSecurity.emailVerified) {
      return json({ ok:false, code:'RECIPIENT_EMAIL_NOT_VERIFIED', message:'Dieses Mitglied hat seine Mailadresse noch nicht bestätigt.' }, { status:409 });
    }

    const rate = await checkInvitationEmailRateLimit(env, String(session.user.id), recipientUserId, roomId);
    if (!rate.ok) return json({ ok:false, code:rate.code, message:rate.message }, { status:rate.status || 429 });

    const inviteUrl = gamerInvitationUrl(env, roomId);
    if (!inviteUrl) {
      return json({ ok:false, code:'PUBLIC_URL_NOT_CONFIGURED', message:'Die öffentliche Gamer-Adresse ist im Worker nicht korrekt hinterlegt.' }, { status:503 });
    }

    const mail = await sendInvitationEmail(env, {
      roomId,
      recipientEmail,
      recipientName:recipient.username,
      senderName:session.user.username,
      inviteUrl,
      variantLabel:invitationVariantLabel(access.gameSetup),
      timeLabel:invitationTimeLabel(access.timeControl),
      rated:access.ratedRequested !== false,
      daily:access.timeControl && access.timeControl.mode === 'daily'
    });
    if (!mail.ok) return json({ ok:false, code:mail.code, message:mail.message }, { status:mail.status || 502 });

    try { await recordInvitationEmail(env, String(session.user.id), recipientUserId, roomId, mail.messageId); } catch (_) {}
    if (access.timeControl && access.timeControl.mode === 'daily') {
      try {
        if (await ensureDailyGamesTable(env)) {
          await env.DB.prepare(
            `UPDATE daily_games
                SET invited_user_id = ?, invited_name = ?
              WHERE room_id = ?
                AND started = 0
                AND ended = 0
                AND (
                  (white_user_id = ? AND black_user_id IS NULL)
                  OR
                  (black_user_id = ? AND white_user_id IS NULL)
                )`
          ).bind(
            recipientUserId,
            cleanDisplayName(recipient.username) || 'Mitglied',
            roomId,
            String(session.user.id),
            String(session.user.id)
          ).run();
        }
      } catch (_) {
        // Der erfolgreiche Mailversand darf durch einen reinen Anzeigefehler nicht widerrufen werden.
      }
    }
    return json({
      ok:true,
      recipient:{ id:recipient.id, username:recipient.username },
      message:'Einladung an ' + (cleanDisplayName(recipient.username) || 'das Mitglied') + ' wurde versendet.'
    });
  }

  const memberAvatarMatch = url.pathname.match(/^\/api\/members\/([^/]+)\/avatar$/);
  if (memberAvatarMatch && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Profilbilder sind nur nach Login verfügbar.' }, { status:401 });
    const targetId = cleanPublicProfileUserId(decodeURIComponent(memberAvatarMatch[1]));
    if (!targetId) return new Response(null, { status:400, headers:{'cache-control':'no-store'} });
    return await avatarResponseForMember(request, env, targetId);
  }

  const memberProfileMatch = url.pathname.match(/^\/api\/members\/([^/]+)\/profile$/);
  if (memberProfileMatch && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Mitgliederprofile sind nur nach Login verfügbar.' }, { status:401 });
    const targetId = cleanPublicProfileUserId(decodeURIComponent(memberProfileMatch[1]));
    if (!targetId) return json({ ok:false, code:'INVALID_USER_ID', message:'Ungültiges Mitgliederprofil.' }, { status:400 });
    const member = await loadMemberPublicProfile(env, targetId);
    if (!member) return json({ ok:false, code:'USER_NOT_FOUND', message:'Das Mitglied wurde nicht gefunden.' }, { status:404 });
    return json({ ok:true, member });
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

  if (url.pathname === '/api/admin/users' && request.method === 'GET') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const users = await listMembers(env, admin.session.user, 100);
    return json({ ok:true, users });
  }

  if (url.pathname === '/api/admin/member-message/audience' && request.method === 'GET') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    try {
      return json({ ok:true, audience:await adminMemberMessageAudience(env, url.searchParams.get('kind'), url.searchParams.get('targetUserId')) });
    } catch (error) {
      console.error('Admin member-message audience failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ ok:false, code:'MEMBER_MESSAGE_AUDIENCE_FAILED', message:'Die Empfängerzahl konnte nicht ermittelt werden.' }, { status:500 });
    }
  }

  if (url.pathname === '/api/admin/member-message/recipients' && request.method === 'GET') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    try {
      return json({ ok:true, users:await listAdminMemberMessageTargets(env) });
    } catch (error) {
      console.error('Admin personal-message recipient list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ ok:false, code:'PERSONAL_RECIPIENTS_FAILED', message:'Die auswählbaren Mitglieder konnten nicht geladen werden.' }, { status:500 });
    }
  }

  if (url.pathname === '/api/admin/member-message/test' && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const body = await readJsonBody(request);
    if (!body) return json({ ok:false, code:'BAD_JSON', message:'Die Nachricht konnte nicht gelesen werden.' }, { status:400 });
    const privateAdmin = await loadPrivateUser(env, admin.session.user.id);
    const adminEmail = normalizeEmail(privateAdmin && privateAdmin.email);
    if (!privateAdmin || !adminEmail) return json({ ok:false, code:'ADMIN_EMAIL_MISSING', message:'Beim Admin-Account ist keine gültige Mailadresse hinterlegt.' }, { status:400 });
    const emailState = await getUserEmailSecurityState(env, privateAdmin);
    if (!emailState.emailVerified) return json({ ok:false, code:'ADMIN_EMAIL_NOT_VERIFIED', message:'Die Admin-Mailadresse muss vor dem Testversand bestätigt sein.' }, { status:400 });
    const mail = prepareAdminMemberMessageEmail(env, {
      recipientEmail:adminEmail,
      recipientName:privateAdmin.username,
      kind:body.kind,
      subject:`TEST: ${cleanAdminMemberMessageSubject(body.subject)}`,
      message:body.message,
      attachment:body.attachment
    });
    if (!mail.ok) return json({ ok:false, code:mail.code, message:mail.message }, { status:mail.status || 400 });
    const result = await sendInvitationEmail(env, { preparedMail:mail, mailType:mail.mailType + '_test' });
    if (!result.ok) return json({ ok:false, code:result.code || 'TEST_MAIL_FAILED', message:result.message || 'Die Testmail konnte nicht versendet werden.' }, { status:result.status || 502 });
    return json({ ok:true, message:'Testmail wurde an deine bestätigte Admin-Mailadresse versendet' + (mail.attachments && mail.attachments.length ? ' – einschließlich Anhang.' : '.') });
  }

  if (url.pathname === '/api/admin/member-message/send' && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const body = await readJsonBody(request);
    if (!body) return json({ ok:false, code:'BAD_JSON', message:'Die Nachricht konnte nicht gelesen werden.' }, { status:400 });
    if (body.confirmed !== true) return json({ ok:false, code:'CONFIRMATION_REQUIRED', message:'Bitte den geprüften Versand ausdrücklich bestätigen.' }, { status:400 });
    try {
      const result = await sendAdminMemberMessage(env, admin.session.user, body);
      if (!result.ok) return json({ ok:false, code:result.code, message:result.message }, { status:result.status || 400 });
      return json(result);
    } catch (error) {
      console.error('Admin member-message send failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ ok:false, code:'MEMBER_MESSAGE_SEND_FAILED', message:'Die Mitglieder-Nachricht konnte nicht vollständig verarbeitet werden.' }, { status:500 });
    }
  }

  if (url.pathname === '/api/moderation/report' && request.method === 'POST') {
    const session=await lookupAuthSession(env,bearerTokenFromRequest(request));
    if(!session) return json({ok:false,code:'NOT_AUTHENTICATED',message:'Meldungen sind nur nach Login möglich.'},{status:401});
    const body=await readJsonBody(request); const result=await createModerationReport(env,session.user,body||{});
    return json(result,{status:result.status||(result.ok?200:400)});
  }

  if (url.pathname === '/api/moderation/global-chat-report' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false,code:'NOT_AUTHENTICATED',message:'Global-Chat-Meldungen sind nur nach Login möglich.'},{status:401});
    const usable = await requireUsableAccount(env, session.user);
    if (!usable.ok) return json({ok:false,code:usable.code,message:usable.message},{status:403});
    const body = await readJsonBody(request);
    const result = await createGlobalChatModerationReport(env, session.user, body || {});
    return json(result,{status:result.status || (result.ok ? 200 : 400)});
  }

  if (url.pathname === '/api/admin/moderation/reports' && request.method === 'GET') {
    const admin=await requireAdminSession(request,env); if(!admin.ok) return admin.response;
    return json({ok:true,reports:await listModerationReports(env)});
  }

  if (url.pathname === '/api/admin/moderation/action' && request.method === 'POST') {
    const admin=await requireAdminSession(request,env); if(!admin.ok) return admin.response;
    const body=await readJsonBody(request); const result=await applyModerationAction(env,admin.session.user,body||{});
    return json(result,{status:result.status||(result.ok?200:400)});
  }

  if (url.pathname === '/api/admin/moderation/resolve' && request.method === 'POST') {
    const admin=await requireAdminSession(request,env); if(!admin.ok) return admin.response;
    await ensureModerationTables(env); const body=await readJsonBody(request); const id=String(body&&body.reportId||'').trim();
    if(!id) return json({ok:false,message:'Meldung fehlt.'},{status:400});
    const status=body&&body.status==='dismissed'?'dismissed':'resolved';
    await env.DB.prepare(`UPDATE moderation_reports SET status=?, resolution=?, admin_note=?, resolved_at=?, resolved_by_user_id=? WHERE id=?`).bind(status,cleanModerationComment(body&&body.resolution),cleanModerationComment(body&&body.note),new Date().toISOString(),admin.session.user.id,id).run();
    return json({ok:true,message:'Meldung wurde abgeschlossen.'});
  }

  if (url.pathname === '/api/admin/overview' && request.method === 'GET') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    try {
      return json({ ok:true, overview:await buildAdminOverview(env) });
    } catch (error) {
      console.error('Admin overview failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ ok:false, code:'ADMIN_OVERVIEW_FAILED', message:'Die Systemübersicht konnte nicht geladen werden.' }, { status:500 });
    }
  }

  if (url.pathname === '/api/admin/backup-mark' && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    try {
      const lastManualAt = await markManualBackup(env, admin.session.user);
      return json({ ok:true, lastManualAt, message:'Das manuelle Datenbank-Backup wurde mit dem aktuellen Zeitpunkt vermerkt.' });
    } catch (error) {
      console.error('Admin backup mark failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ ok:false, code:'BACKUP_MARK_FAILED', message:'Der Backup-Zeitpunkt konnte nicht gespeichert werden.' }, { status:500 });
    }
  }

  const adminDeleteMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (adminDeleteMatch && request.method === 'DELETE') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const body = await readJsonBody(request);
    if (!body) return json({ ok:false, code:'BAD_JSON', message:'Die Kennwortbestätigung konnte nicht gelesen werden.' }, { status:400 });
    const currentPassword = String(body.currentPassword || '');
    if (currentPassword.length < 8 || currentPassword.length > 128) {
      return json({ ok:false, code:'INVALID_PASSWORD', message:'Bitte gib dein vollständiges aktuelles Admin-Kennwort ein.' }, { status:400 });
    }
    const privateAdmin = await loadPrivateUser(env, admin.session.user.id);
    if (!privateAdmin || !isAdminUser(privateAdmin, env)) {
      return json({ ok:false, code:'NOT_ADMIN', message:'Der Admin-Account konnte nicht sicher bestätigt werden.' }, { status:403 });
    }
    if (!(await verifyPassword(currentPassword, privateAdmin))) {
      return json({ ok:false, code:'INVALID_PASSWORD', message:'Das eingegebene Admin-Kennwort ist nicht korrekt.' }, { status:401 });
    }
    const result = await deleteUserAsAdmin(env, privateAdmin, decodeURIComponent(adminDeleteMatch[1]));
    if (!result.ok) return json({ ok: false, code: result.code, message: result.message }, { status: result.status || 400 });
    return json({ ok: true, deletedUser: result.deletedUser, message:'Mitglied „' + (result.deletedUser && result.deletedUser.username || 'Unbekannt') + '“ wurde endgültig gelöscht.' });
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
  const castleRaw = String(value.castle || value.castling || '').trim().toUpperCase();
  const castle = castleRaw === 'K' || castleRaw === 'Q' ? castleRaw : null;

  return {
    from,
    to,
    promotion,
    castle,
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

  // Chess960-UIs kodieren die Rochade eindeutig als König-auf-Turm-Zug.
  // Dadurch kann ein normaler Königszug zum späteren Zielfeld nicht mit
  // der Rochade verwechselt werden.
  const displayTo = this.variant === GAME_VARIANT_FREESTYLE
    ? rookFrom
    : (kingTo === kingFrom ? rookFrom : kingTo);
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

function castleSideCode(value) {
  if (!value) return '';
  const metaCastle = value.meta && value.meta.castle ? String(value.meta.castle) : '';
  const explicitCastle = value.castle || value.castling || metaCastle;
  const raw = String(explicitCastle || '').trim().toUpperCase();
  if (raw === 'K' || raw === 'Q') return raw;
  const san = String(value.san || '').trim().toUpperCase().replace(/0/g, 'O');
  if (/^O-O-O(?:[+#])?$/.test(san)) return 'Q';
  if (/^O-O(?:[+#])?$/.test(san)) return 'K';
  return '';
}

function findMatchingLegalMove(legalMoves, moveLike) {
  if (!Array.isArray(legalMoves) || !moveLike || !moveLike.from || !moveLike.to) return null;
  const from = moveLike.from;
  const to = moveLike.to;
  const sameFrom = move => move.from[0] === from[0] && move.from[1] === from[1];
  const sameTo = move => move.to[0] === to[0] && move.to[1] === to[1];
  const castleHint = castleSideCode(moveLike);

  if (castleHint) {
    const hintedCastle = legalMoves.find(move => {
      if (!sameFrom(move) || castleSideCode(move) !== castleHint) return false;
      if (sameTo(move)) return true;
      const meta = move.meta || {};
      // Rückwärtskompatibilität: ältere Räume speicherten bei Chess960
      // teilweise das spätere Königszielfeld statt des beteiligten Turmfelds.
      return Number.isInteger(meta.kingTo) && meta.kingTo === to[0] && move.to[1] === to[1];
    });
    if (hintedCastle) return hintedCastle;
    return null;
  }

  const exact = legalMoves.filter(move => sameFrom(move) && sameTo(move));
  if (exact.length <= 1) return exact[0] || null;
  return exact.find(move => !castleSideCode(move)) || exact[0];
}

function buildGameFromStoredMoves(moves, gameSetup = null) {
  const g = new ChessGame(cleanGameSetup(gameSetup));
  for (const stored of moves || []) {
    const legal = g.legalMoves();
    const found = findMatchingLegalMove(legal, stored);
    if (!found) throw new Error('Gespeicherte Zugliste enthält einen illegalen Zug.');
    const mv = { from: found.from, to: found.to, meta: found.meta || {}, promotion: stored.promotion || null };
    g.makeMove(mv, true);
  }
  return g;
}

function validateMoveOnServer(storedMoves, incoming, gameSetup = null) {
  const before = buildGameFromStoredMoves(storedMoves || [], gameSetup);
  const legal = before.legalMoves();
  const found = findMatchingLegalMove(legal, incoming);
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
  if (['stalemate', 'insufficient_material', 'fifty_move_rule', 'threefold_repetition'].includes(gameOver.type)) return '1/2-1/2';
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

function buildDailyPgnDocument({ game, timeControl, setup, moves, whiteName, blackName, tournamentMeta = null }) {
  const normalizedSetup = cleanGameSetup(setup || (game && game.gameSetup) || null);
  const result = game && game.result ? String(game.result) : '*';
  const tags = [
    ['Event', tournamentMeta && tournamentMeta.tournamentName ? tournamentMeta.tournamentName : 'Hammerschach-Gamer'],
    ['Site', 'Andili.de'],
    ['Date', pgnDateFromIso((game && (game.endedAt || game.startedAt)) || null)],
    ['Round', tournamentMeta && tournamentMeta.roundNumber ? String(tournamentMeta.roundNumber) : '-'],
    ['White', cleanDisplayName(whiteName) || 'Weiß'],
    ['Black', cleanDisplayName(blackName) || 'Schwarz'],
    ['Result', result],
    ['TimeControl', '-'],
    ['HammerschachMode', 'Daily'],
    ['HammerschachDaysPerMove', String(Math.max(1, Number(timeControl && timeControl.daysPerMove || 1)))]
  ];
  if (tournamentMeta && tournamentMeta.tournamentId) {
    tags.push(['HammerschachTournamentId', String(tournamentMeta.tournamentId)]);
    tags.push(['HammerschachDoubleRound', String(tournamentMeta.roundNumber || '')]);
    tags.push(['HammerschachPairing', String(tournamentMeta.pairingNumber || '')]);
    tags.push(['HammerschachPairingGame', String(tournamentMeta.gameNumber || '')]);
  }
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

function pgnTimeControlFromServerTimeControl(timeControl) {
  const normalized = cleanTimeControl(timeControl || null);
  if (!normalized || normalized.mode === 'daily') return '-';
  return Math.max(0, Math.floor(Number(normalized.baseSeconds || 0))) + '+' + Math.max(0, Math.floor(Number(normalized.incrementSeconds || 0)));
}

function buildCompletedPgnDocument({ game, timeControl, setup, moves, whiteName, blackName, tournamentMeta = null }) {
  const normalizedTime = cleanTimeControl(timeControl || null);
  const normalizedSetup = cleanGameSetup(setup || (game && game.gameSetup) || null);
  const result = game && game.result ? String(game.result) : '*';
  const tags = [
    ['Event', tournamentMeta && tournamentMeta.tournamentName ? tournamentMeta.tournamentName : 'Hammerschach-Gamer'],
    ['Site', 'Andili.de'],
    ['Date', pgnDateFromIso((game && (game.endedAt || game.startedAt)) || null)],
    ['Round', tournamentMeta && tournamentMeta.roundNumber ? String(tournamentMeta.roundNumber) : '-'],
    ['White', cleanDisplayName(whiteName) || 'Weiß'],
    ['Black', cleanDisplayName(blackName) || 'Schwarz'],
    ['Result', result],
    ['TimeControl', pgnTimeControlFromServerTimeControl(normalizedTime)]
  ];
  if (tournamentMeta && tournamentMeta.tournamentId) {
    tags.push(['HammerschachTournamentId', String(tournamentMeta.tournamentId)]);
    tags.push(['HammerschachDoubleRound', String(tournamentMeta.roundNumber || '')]);
    tags.push(['HammerschachPairing', String(tournamentMeta.pairingNumber || '')]);
    tags.push(['HammerschachPairingGame', String(tournamentMeta.gameNumber || '')]);
  }
  if (normalizedTime && normalizedTime.mode === 'daily') {
    tags.push(['HammerschachMode', 'Daily']);
    tags.push(['HammerschachDaysPerMove', String(Math.max(1, Number(normalizedTime.daysPerMove || 1)))]);
  }
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


export class GlobalChat {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  attachment(ws) {
    try { return ws.deserializeAttachment() || {}; } catch (_) { return {}; }
  }

  async storedMessages() {
    const raw = (await this.state.storage.get('messages')) || [];
    const cutoff = Date.now() - GLOBAL_CHAT_RETENTION_MS;
    const normalized = Array.isArray(raw)
      ? raw.map(normalizeStoredGlobalChatMessage).filter(Boolean).filter(message => (Date.parse(message.sentAt) || 0) >= cutoff).slice(-GLOBAL_CHAT_HISTORY_MAX)
      : [];
    if (!Array.isArray(raw) || normalized.length !== raw.length) await this.state.storage.put('messages', normalized);
    return normalized;
  }

  authenticatedSockets() {
    return this.state.getWebSockets().filter(ws => {
      const info = this.attachment(ws);
      return !!(info.authenticated && info.userId);
    });
  }

  presencePayload() {
    const members = new Map();
    for (const ws of this.authenticatedSockets()) {
      const info = this.attachment(ws);
      const userId = String(info.userId || '');
      if (!userId || members.has(userId)) continue;
      members.set(userId, {
        name:cleanDisplayName(info.username) || 'Mitglied',
        senderKey:String(info.senderKey || ''),
        isAdmin:info.isAdmin === true
      });
    }
    const onlineMembers = Array.from(members.values()).sort((a,b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      return a.name.localeCompare(b.name, 'de');
    });
    return {type:'global_chat_presence', onlineCount:onlineMembers.length, onlineMembers, serverNow:Date.now()};
  }

  broadcastPresence() {
    const payload = this.presencePayload();
    for (const ws of this.authenticatedSockets()) safeSend(ws, payload);
  }

  broadcastMessage(message) {
    for (const ws of this.authenticatedSockets()) {
      const info = this.attachment(ws);
      const safe = safeGlobalChatMessageForClient(message, info.userId);
      if (safe) safeSend(ws, {type:'global_chat_message', message:safe, serverNow:Date.now()});
    }
  }

  async authenticate(ws, token) {
    const session = await lookupAuthSession(this.env, String(token || ''));
    if (!session) {
      safeSend(ws, {type:'global_chat_error',code:'NOT_AUTHENTICATED',message:'Die Anmeldung für den Mitglieder-Chat ist abgelaufen.'});
      try { ws.close(4001, 'Anmeldung erforderlich'); } catch (_) {}
      return;
    }
    const usable = await requireUsableAccount(this.env, session.user);
    if (!usable.ok) {
      safeSend(ws, {type:'global_chat_error',code:usable.code,message:usable.message});
      try { ws.close(4003, 'Account gesperrt'); } catch (_) {}
      return;
    }
    const senderKey = await globalChatSenderKey(session.user.id);
    const info = this.attachment(ws);
    ws.serializeAttachment(Object.assign({}, info, {
      authenticated:true,
      userId:String(session.user.id),
      username:cleanDisplayName(session.user.username) || 'Mitglied',
      senderKey,
      isAdmin:isAdminUser(session.user, this.env),
      chatBlocked:usable.state.chatBlocked === true,
      authenticatedAt:Date.now(),
      lastMessageAt:0
    }));
    const history = await this.storedMessages();
    safeSend(ws, {
      type:'global_chat_ready',
      messages:history.map(message => safeGlobalChatMessageForClient(message, session.user.id)).filter(Boolean),
      chatBlocked:usable.state.chatBlocked === true,
      isAdmin:isAdminUser(session.user, this.env),
      serverNow:Date.now()
    });
    this.broadcastPresence();
  }

  async sendMessage(ws, data) {
    let info = this.attachment(ws);
    if (!info.authenticated || !info.userId) return safeSend(ws, {type:'global_chat_error',code:'NOT_AUTHENTICATED',message:'Bitte zuerst einloggen.'});
    const moderation = await moderationStateForUser(this.env, info.userId);
    if (moderation.accountStatus === 'banned' || moderation.accountStatus === 'suspended') {
      safeSend(ws, {type:'global_chat_error',code:'ACCOUNT_BLOCKED',message:'Dieser Account kann den Mitglieder-Chat derzeit nicht verwenden.'});
      try { ws.close(4003, 'Account gesperrt'); } catch (_) {}
      return;
    }
    if (moderation.chatBlocked) {
      info = Object.assign({}, info, {chatBlocked:true});
      ws.serializeAttachment(info);
      return safeSend(ws, {type:'global_chat_error',code:'CHAT_BLOCKED',message:'Deine Chatfunktion ist derzeit gesperrt.'});
    }
    const now = Date.now();
    const rateKey = 'message-rate:' + String(info.senderKey || info.userId);
    const storedLastMessageAt = Number((await this.state.storage.get(rateKey)) || 0);
    const lastMessageAt = Math.max(Number(info.lastMessageAt || 0), storedLastMessageAt);
    if (now - lastMessageAt < GLOBAL_CHAT_SEND_COOLDOWN_MS) {
      return safeSend(ws, {type:'global_chat_error',code:'CHAT_RATE_LIMIT',message:'Bitte warte kurz, bevor du die nächste Nachricht sendest.'});
    }
    const text = cleanChatText(data && (data.text || data.message));
    if (!text) return safeSend(ws, {type:'global_chat_error',code:'EMPTY_MESSAGE',message:'Bitte eine Nachricht eingeben.'});
    const message = {
      id:'gc_' + crypto.randomUUID(),
      messageId:'gc_' + crypto.randomUUID(),
      senderUserId:String(info.userId),
      senderName:cleanDisplayName(info.username) || 'Mitglied',
      senderKey:String(info.senderKey || ''),
      text,
      sentAt:new Date(now).toISOString()
    };
    message.messageId = message.id;
    const messages = await this.storedMessages();
    messages.push(message);
    await this.state.storage.put({messages:messages.slice(-GLOBAL_CHAT_HISTORY_MAX), [rateKey]:now});
    ws.serializeAttachment(Object.assign({}, info, {lastMessageAt:now}));
    this.broadcastMessage(message);
  }

  async deleteMessage(ws, data) {
    const info = this.attachment(ws);
    if (!info.authenticated || info.isAdmin !== true) {
      return safeSend(ws, {type:'global_chat_error',code:'NOT_ADMIN',message:'Nur Andili kann Global-Chat-Nachrichten löschen.'});
    }
    const messageId = cleanGlobalChatMessageId(data && data.messageId);
    if (!messageId) return;
    const messages = await this.storedMessages();
    const filtered = messages.filter(message => message.id !== messageId);
    if (filtered.length === messages.length) return;
    await this.state.storage.put('messages', filtered);
    for (const socket of this.authenticatedSockets()) safeSend(socket, {type:'global_chat_message_deleted',messageId,serverNow:Date.now()});
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === DURABLE_BACKUP_INTERNAL_PATH) {
      return durableObjectBackupResponse(this.state, this.env, request, 'GlobalChat', 'members');
    }
    if (request.method === 'POST' && url.pathname === '/moderation-context') {
      const body = await readJsonBody(request);
      const messageId = cleanGlobalChatMessageId(body && body.messageId);
      const reporterUserId = String(body && body.reporterUserId || '');
      const messages = await this.storedMessages();
      const message = messages.find(item => item.id === messageId);
      if (!message) return json({ok:false,code:'MESSAGE_NOT_FOUND',message:'Die Nachricht ist nicht mehr vorhanden.'},{status:404});
      if (message.senderUserId === reporterUserId) return json({ok:false,code:'CANNOT_REPORT_SELF',message:'Eigene Nachrichten können nicht gemeldet werden.'},{status:400});
      return json({
        ok:true,
        reportedUserId:message.senderUserId,
        reportedName:message.senderName,
        chatSnapshot:[{senderName:message.senderName,role:'member',text:message.text,sentAt:message.sentAt}]
      });
    }
    if (request.method === 'POST' && url.pathname === '/delete-account-data') {
      const body = await readJsonBody(request);
      const userId = String(body && body.userId || '').trim();
      if (!userId) return json({ok:false,message:'Benutzer fehlt.'},{status:400});
      const messages = await this.storedMessages();
      const filtered = messages.filter(message => message.senderUserId !== userId);
      await this.state.storage.put('messages', filtered);
      try { await this.state.storage.delete('message-rate:' + await globalChatSenderKey(userId)); } catch (_) {}
      for (const ws of this.state.getWebSockets()) {
        const info = this.attachment(ws);
        if (String(info.userId || '') !== userId) continue;
        safeSend(ws, {type:'global_chat_error',code:'ACCOUNT_DELETED',message:'Der Account wurde gelöscht.'});
        try { ws.close(4003, 'Account gelöscht'); } catch (_) {}
      }
      this.broadcastPresence();
      return json({ok:true,removedMessages:messages.length-filtered.length});
    }

    if (request.method === 'POST' && url.pathname === '/moderation-refresh') {
      const body = await readJsonBody(request);
      const userId = String(body && body.userId || '');
      for (const ws of this.state.getWebSockets()) {
        const info = this.attachment(ws);
        if (String(info.userId || '') !== userId) continue;
        const status = String(body && body.status || 'active');
        if (status === 'banned' || status === 'suspended') {
          safeSend(ws, {type:'global_chat_error',code:'ACCOUNT_BLOCKED',message:'Dein Account wurde für den Chat gesperrt.'});
          try { ws.close(4003, 'Account gesperrt'); } catch (_) {}
        } else {
          ws.serializeAttachment(Object.assign({}, info, {chatBlocked:body && body.chatBlocked === true}));
          safeSend(ws, {type:'global_chat_moderation',chatBlocked:body && body.chatBlocked === true,serverNow:Date.now()});
        }
      }
      this.broadcastPresence();
      return json({ok:true});
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket upgrade', {status:426});
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({connectionId:crypto.randomUUID(),authenticated:false,joinedAt:Date.now()});
    safeSend(server, {type:'global_chat_challenge',serverNow:Date.now()});
    return new Response(null, {status:101, webSocket:client});
  }

  async webSocketMessage(ws, rawMessage) {
    let data = null;
    try {
      const text = typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage);
      data = JSON.parse(text);
    } catch (_) {
      return safeSend(ws, {type:'global_chat_error',code:'BAD_MESSAGE',message:'Die Chatnachricht konnte nicht gelesen werden.'});
    }
    if (data.type === 'authenticate') return this.authenticate(ws, data.authToken);
    if (data.type === 'send_message') return this.sendMessage(ws, data);
    if (data.type === 'delete_message') return this.deleteMessage(ws, data);
    if (data.type === 'ping') return safeSend(ws, {type:'pong',serverNow:Date.now()});
    safeSend(ws, {type:'global_chat_error',code:'UNKNOWN_MESSAGE_TYPE',message:'Unbekannte Global-Chat-Anfrage.'});
  }

  async webSocketClose() {
    this.broadcastPresence();
  }

  async webSocketError() {
    this.broadcastPresence();
  }
}

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.userPresenceCache = { key:'', expiresAt:0, values:{} };
    this.accountNameCache = { key:'', expiresAt:0, values:{} };
    this.ratingStateCache = { key:'', expiresAt:0, value:null };
  }


  runBackgroundTask(task, label = 'Hintergrundaufgabe') {
    const guarded = Promise.resolve(task).catch(error => {
      console.error(label, error && error.message ? error.message : String(error || 'unknown'));
    });
    if (this.state && typeof this.state.waitUntil === 'function') this.state.waitUntil(guarded);
    return guarded;
  }

  async dailyEmailRoomContext() {
    const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
    const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
    if (!roomId || !timeControl || timeControl.mode !== 'daily') return null;
    const game = (await this.state.storage.get('game')) || { started:false, ended:false, result:'*' };
    const setup = cleanGameSetup((await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null);
    const players = await this.getSecurePlayers();
    const profiles = (await this.state.storage.get('playerProfiles')) || {};
    const whitePlayerId = playerIdFromSlot(players.white);
    const blackPlayerId = playerIdFromSlot(players.black);
    const whiteUserId = players.white && players.white.userId ? String(players.white.userId) : '';
    const blackUserId = players.black && players.black.userId ? String(players.black.userId) : '';
    const accountNames = await this.getAccountNamesByUserIds([whiteUserId, blackUserId]);
    const whiteName = cleanDisplayName(accountNames[whiteUserId] || '') || cleanDisplayName(whitePlayerId && profiles[whitePlayerId] && (profiles[whitePlayerId].displayName || profiles[whitePlayerId].name)) || 'Weiß';
    const blackName = cleanDisplayName(accountNames[blackUserId] || '') || cleanDisplayName(blackPlayerId && profiles[blackPlayerId] && (profiles[blackPlayerId].displayName || profiles[blackPlayerId].name)) || 'Schwarz';
    return { roomId, timeControl, game, setup, players, whiteUserId, blackUserId, whiteName, blackName };
  }

  async sendDailyTurnNotification(role, move = null, clock = null) {
    const context = await this.dailyEmailRoomContext();
    if (!context || !context.game.started || context.game.ended || (role !== 'w' && role !== 'b')) return { ok:true, skipped:true, reason:'not_applicable' };
    const recipientUserId = role === 'w' ? context.whiteUserId : context.blackUserId;
    const opponentName = role === 'w' ? context.blackName : context.whiteName;
    if (!recipientUserId) return { ok:true, skipped:true, reason:'recipient_missing' };
    const activeClock = clock || (await this.state.storage.get('clock')) || null;
    const now = Date.now();
    const clockBaseTs = activeClock && Number.isFinite(Number(activeClock.lastTs)) ? Number(activeClock.lastTs) : now;
    const deadlineAt = activeClock && activeClock.running && !activeClock.timeLost && activeClock.turn === role
      ? new Date(clockBaseTs + Math.max(0, Number(activeClock[role + 'Ms'] || 0))).toISOString()
      : null;
    const ply = move && Number.isFinite(Number(move.ply)) ? Math.max(0, Math.floor(Number(move.ply))) : 0;
    const inviteUrl = gamerInvitationUrl(this.env, context.roomId);
    if (!inviteUrl) return { ok:true, skipped:true, reason:'public_url_missing' };
    return sendDailyTurnEmailNotification(this.env, {
      notificationKey:`daily_turn:${context.roomId}:${ply}:${recipientUserId}`,
      roomId:context.roomId,
      recipientUserId,
      opponentName,
      inviteUrl,
      timeLabel:context.timeControl.label || `${context.timeControl.daysPerMove || 1} Tag(e) pro Zug`,
      variantLabel:dailyNotificationVariantLabel(context.setup),
      deadlineAt,
      lastMoveSan:move && move.san ? String(move.san) : ''
    });
  }

  queueDailyTurnNotification(role, move = null, clock = null) {
    this.runBackgroundTask(this.sendDailyTurnNotification(role, move, clock), 'Daily-Zugbenachrichtigung fehlgeschlagen');
  }

  async sendDailyOpenOfferAcceptedNotification(clockOverride = null) {
    const [openOffer, offerStatusRaw, creatorUserIdRaw, acceptedUserIdRaw] = await Promise.all([
      this.state.storage.get('openOffer'),
      this.state.storage.get('openOfferStatus'),
      this.state.storage.get('createdByUserId'),
      this.state.storage.get('openOfferAcceptedByUserId')
    ]);
    const offerStatus = String(offerStatusRaw || (openOffer === true ? 'open' : ''));
    const creatorUserId = String(creatorUserIdRaw || '');
    const acceptedUserId = String(acceptedUserIdRaw || '');
    if (openOffer !== true || offerStatus !== 'accepted' || !creatorUserId || !acceptedUserId) {
      return { ok:true, skipped:true, reason:'not_an_accepted_open_offer' };
    }

    const context = await this.dailyEmailRoomContext();
    if (!context || !context.game.started || context.game.ended) return { ok:true, skipped:true, reason:'not_applicable' };
    const creatorRole = context.whiteUserId === creatorUserId ? 'w' : context.blackUserId === creatorUserId ? 'b' : '';
    if (!creatorRole) return { ok:true, skipped:true, reason:'creator_role_missing' };
    const opponentName = creatorRole === 'w' ? context.blackName : context.whiteName;
    const includesTurn = creatorRole === 'w';
    const activeClock = clockOverride || (await this.state.storage.get('clock')) || null;
    const now = Date.now();
    const clockBaseTs = activeClock && Number.isFinite(Number(activeClock.lastTs)) ? Number(activeClock.lastTs) : now;
    const deadlineAt = includesTurn && activeClock && activeClock.running && !activeClock.timeLost && activeClock.turn === 'w'
      ? new Date(clockBaseTs + Math.max(0, Number(activeClock.wMs || 0))).toISOString()
      : null;
    const inviteUrl = gamerInvitationUrl(this.env, context.roomId);
    if (!inviteUrl) return { ok:true, skipped:true, reason:'public_url_missing' };

    return sendDailyOpenOfferAcceptedEmailNotification(this.env, {
      notificationKey:`daily_offer_accepted:${context.roomId}:${creatorUserId}`,
      roomId:context.roomId,
      recipientUserId:creatorUserId,
      opponentName,
      inviteUrl,
      timeLabel:context.timeControl.label || `${context.timeControl.daysPerMove || 1} Tag(e) pro Zug`,
      variantLabel:dailyNotificationVariantLabel(context.setup),
      creatorRole,
      includesTurn,
      deadlineAt
    });
  }

  queueDailyOpenOfferAcceptedNotification(clock = null) {
    this.runBackgroundTask(this.sendDailyOpenOfferAcceptedNotification(clock), 'Daily-Annahmebestätigung fehlgeschlagen');
  }

  async sendDailyResultNotifications(gameOverride = null) {
    const context = await this.dailyEmailRoomContext();
    const game = gameOverride || (context && context.game) || null;
    if (!context || !game || !game.ended) return { ok:true, skipped:true, reason:'not_applicable' };
    const inviteUrl = gamerInvitationUrl(this.env, context.roomId);
    if (!inviteUrl) return { ok:true, skipped:true, reason:'public_url_missing' };
    const payloads = [];
    if (context.whiteUserId) payloads.push({ role:'w', recipientUserId:context.whiteUserId, opponentName:context.blackName });
    if (context.blackUserId) payloads.push({ role:'b', recipientUserId:context.blackUserId, opponentName:context.whiteName });
    const results = await Promise.all(payloads.map(item => sendDailyResultEmailNotification(this.env, {
      notificationKey:`daily_result:${context.roomId}:${item.recipientUserId}`,
      roomId:context.roomId,
      recipientUserId:item.recipientUserId,
      opponentName:item.opponentName,
      role:item.role,
      result:game.result || '*',
      endReason:game.endReason || '',
      endedAt:game.endedAt || null,
      variantLabel:dailyNotificationVariantLabel(context.setup),
      inviteUrl
    })));
    return { ok:true, results };
  }

  queueDailyResultNotifications(game = null) {
    this.runBackgroundTask(this.sendDailyResultNotifications(game), 'Daily-Ergebnisbenachrichtigung fehlgeschlagen');
  }

  async ratingMetaForStart(timeControl, gameSetup) {
    const ratedRequested = (await this.state.storage.get('ratedRequested')) !== false;
    const ratingType = ratingTypeFromGame(timeControl, gameSetup);
    const typeInfo = ratingTypeInfo(ratingType);
    const players = await this.getSecurePlayers();
    const whiteUserId = players.white && players.white.userId ? String(players.white.userId) : '';
    const blackUserId = players.black && players.black.userId ? String(players.black.userId) : '';
    let ratingRated = !!(ratedRequested && typeInfo && whiteUserId && blackUserId && whiteUserId !== blackUserId);
    let ratingReason = '';
    if (!ratedRequested) ratingReason = 'creator_unrated';
    else if (!typeInfo) ratingReason = 'unsupported_time_control';
    else if (!whiteUserId || !blackUserId) ratingReason = 'members_required';
    else if (whiteUserId === blackUserId) ratingReason = 'same_account';
    return {
      ratingSystemVersion: RATING_SYSTEM_VERSION,
      ratingType: typeInfo ? typeInfo.key : null,
      ratingLabel: typeInfo ? typeInfo.label : 'Ungewertet',
      ratingRated,
      ratingReason: ratingRated ? '' : ratingReason,
      ratedRequested
    };
  }

  async finalizeRatingIfNeeded(game) {
    if (!game || !game.ended || Number(game.ratingSystemVersion || 0) !== RATING_SYSTEM_VERSION) return null;
    const stored = await this.state.storage.get('ratingResult');
    if (stored) return stored;

    const typeInfo = ratingTypeInfo(game.ratingType);
    if (!game.ratingRated || !typeInfo) {
      const unrated = {
        rated:false,
        system:'glicko2',
        systemVersion:RATING_SYSTEM_VERSION,
        type:typeInfo ? typeInfo.key : null,
        label:typeInfo ? typeInfo.label : 'Ungewertet',
        reason:game.ratingReason || 'not_rated'
      };
      await this.state.storage.put('ratingResult', unrated);
      return unrated;
    }

    const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
    const players = await this.getSecurePlayers();
    const whiteUserId = players.white && players.white.userId ? String(players.white.userId) : '';
    const blackUserId = players.black && players.black.userId ? String(players.black.userId) : '';
    if (!roomId || !whiteUserId || !blackUserId || whiteUserId === blackUserId) return null;
    if (!this.env || !this.env.GAME_ROOM) return null;

    try {
      const id = this.env.GAME_ROOM.idFromName(RATING_SERVICE_ROOM);
      const stub = this.env.GAME_ROOM.get(id);
      const response = await stub.fetch(new Request('https://rating-service.internal/rate-game', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          roomId,
          ratingType:typeInfo.key,
          whiteUserId,
          blackUserId,
          result:game.result || '*'
        })
      }));
      const data = await response.json();
      if (!response.ok || !data || !data.ok || !data.rating) return null;
      await this.state.storage.put('ratingResult', data.rating);
      this.ratingStateCache = { key:'', expiresAt:0, value:null };
      return data.rating;
    } catch (_) {
      // Bei einem vorübergehenden D1-Fehler wird die Wertung beim nächsten Zustandsabruf erneut versucht.
      return null;
    }
  }

  async buildRatingState(game, timeControl, gameSetup) {
    const ratedRequested = game && game.started && typeof game.ratedRequested === 'boolean'
      ? game.ratedRequested
      : (await this.state.storage.get('ratedRequested')) !== false;
    const storedResult = await this.state.storage.get('ratingResult');
    if (game && game.ended && storedResult) return storedResult;

    const fixedType = game && game.started && game.ratingType ? game.ratingType : ratingTypeFromGame(timeControl, gameSetup);
    const typeInfo = ratingTypeInfo(fixedType);
    if (!typeInfo) {
      return {
        rated:false,
        system:'glicko2',
        systemVersion:RATING_SYSTEM_VERSION,
        type:null,
        label:'Ungewertet',
        reason:game && game.started ? (game.ratingReason || 'unsupported_time_control') : 'time_control_required',
        requested:ratedRequested,
        players:{white:{member:false}, black:{member:false}}
      };
    }

    const players = await this.getSecurePlayers();
    const whiteUserId = players.white && players.white.userId ? String(players.white.userId) : '';
    const blackUserId = players.black && players.black.userId ? String(players.black.userId) : '';
    const legacyStartedGame = !!(game && game.started && Number(game.ratingSystemVersion || 0) !== RATING_SYSTEM_VERSION);
    const fixedRated = legacyStartedGame
      ? false
      : (game && game.started && Number(game.ratingSystemVersion || 0) === RATING_SYSTEM_VERSION
          ? !!game.ratingRated
          : !!(ratedRequested && whiteUserId && blackUserId && whiteUserId !== blackUserId));
    const reason = fixedRated ? '' : (legacyStartedGame
      ? 'rating_not_enabled_for_game'
      : (!ratedRequested
          ? 'creator_unrated'
          : (game && game.started && game.ratingReason
              ? game.ratingReason
              : (!whiteUserId || !blackUserId ? 'members_required' : whiteUserId === blackUserId ? 'same_account' : 'not_rated'))));
    const cacheKey = [typeInfo.key, whiteUserId, blackUserId, fixedRated ? '1' : '0', game && game.ended ? 'ended' : 'open'].join('|');
    const now = Date.now();
    if (this.ratingStateCache && this.ratingStateCache.key === cacheKey && this.ratingStateCache.expiresAt > now) {
      return this.ratingStateCache.value;
    }

    let ratings = {};
    try { ratings = await getRatingTypeForUsers(this.env, [whiteUserId, blackUserId], typeInfo.key); } catch (_) {}
    const state = {
      rated:fixedRated,
      system:'glicko2',
      systemVersion:RATING_SYSTEM_VERSION,
      type:typeInfo.key,
      label:typeInfo.label,
      reason,
      requested:ratedRequested,
      provisionalDeviation:RATING_PROVISIONAL_DEVIATION,
      players:{
        white:whiteUserId && ratings[whiteUserId] ? Object.assign({member:true}, ratings[whiteUserId]) : {member:!!whiteUserId},
        black:blackUserId && ratings[blackUserId] ? Object.assign({member:true}, ratings[blackUserId]) : {member:!!blackUserId}
      }
    };
    this.ratingStateCache = { key:cacheKey, expiresAt:now + 10000, value:state };
    return state;
  }

  async invitationEmailContext(requestingUserId) {
    const userId = String(requestingUserId || '').trim();
    if (!userId) return { ok:false, status:401, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' };

    const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
    if (!roomId) return { ok:false, status:404, code:'ROOM_NOT_FOUND', message:'Der Spielraum wurde nicht gefunden.' };
    const cancellation = await this.state.storage.get('cancelled');
    if (cancellation && cancellation.cancelled) {
      return { ok:false, status:410, code:'INVITATION_CANCELLED', message:'Diese Einladung wurde bereits zurückgezogen.' };
    }

    const players = await this.getSecurePlayers();
    let creatorRole = (await this.state.storage.get('createdByRole')) || '';
    const storedCreatorUserId = String((await this.state.storage.get('createdByUserId')) || '').trim();
    if (creatorRole !== 'w' && creatorRole !== 'b') {
      if (players.white && !players.black) creatorRole = 'w';
      else if (players.black && !players.white) creatorRole = 'b';
    }
    const creatorSlot = creatorRole === 'b' ? players.black : creatorRole === 'w' ? players.white : null;
    const creatorUserId = storedCreatorUserId || String(creatorSlot && creatorSlot.userId || '').trim();
    if (!creatorUserId || creatorUserId !== userId) {
      return { ok:false, status:403, code:'NOT_INVITATION_CREATOR', message:'Nur der Ersteller dieses Spielraums kann Einladungen versenden.' };
    }

    const game = (await this.state.storage.get('game')) || { started:false, ended:false, result:'*' };
    if (game.ended) return { ok:false, status:409, code:'GAME_ENDED', message:'Diese Partie ist bereits beendet.' };
    const opponentSlot = creatorRole === 'b' ? players.white : players.black;
    if (opponentSlot) {
      return { ok:false, status:409, code:'OPPONENT_ALREADY_JOINED', message:'Der gegnerische Spielerplatz ist bereits belegt.' };
    }

    const rawTimeControl = (await this.state.storage.get('timeControl')) || null;
    const rawGameSetup = (await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null;
    const timeControl = cleanTimeControl(rawTimeControl);
    const gameSetup = rawGameSetup ? cleanGameSetup(rawGameSetup) : null;
    const ratedRequested = (await this.state.storage.get('ratedRequested')) !== false;
    return {
      ok:true,
      status:200,
      roomId,
      creatorRole,
      timeControl,
      gameSetup,
      ratedRequested,
      gameStarted:!!game.started
    };
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
          if (await ensurePublicGamesTable(this.env)) await this.env.DB.prepare(`DELETE FROM public_games WHERE room_id = ?`).bind(roomId).run();
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
      if (roomId && await ensurePublicGamesTable(this.env)) {
        await this.env.DB.prepare(`DELETE FROM public_games WHERE room_id = ?`).bind(roomId).run();
      }
      if (roomId && await ensureOpenGameOffersTable(this.env)) {
        await this.env.DB.prepare(`DELETE FROM open_game_offers WHERE room_id = ?`).bind(roomId).run();
      }
    } catch (_) {}

    for (const socket of this.state.getWebSockets()) {
      const socketInfo = socket.deserializeAttachment() || {};
      socket.serializeAttachment(Object.assign({}, socketInfo, { role:'revoked', seatClaimed:false, cancelledAt }));
      safeSend(socket, {
        type:'room_cancelled',
        room:roomId || socketInfo.room || 'unknown',
        code:cancellationCode,
        message:cancellationMessage,
        cancelledAt,
        serverNow:Date.now()
      });
      try { socket.close(4004, 'Einladung zurückgezogen'); } catch (_) {}
    }

    return { ok:true, status:200, roomId, cancelledAt };
  }

  async acceptOpenOffer(requestingUserId) {
    const userId = String(requestingUserId || '').trim();
    if (!userId) return { ok:false, status:401, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' };
    const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
    if (!roomId) return { ok:false, status:404, code:'ROOM_NOT_FOUND', message:'Das Partieangebot wurde nicht gefunden.' };

    const reservation = await this.state.storage.transaction(async transaction => {
      const cancellation = await transaction.get('cancelled');
      if (cancellation && cancellation.cancelled) {
        return { ok:false, status:410, code:cancellation.code || 'OPEN_OFFER_WITHDRAWN', message:cancellation.message || 'Dieses Partieangebot wurde zurückgezogen.' };
      }

      const values = await transaction.get([
        'openOffer', 'openOfferStatus', 'openOfferAcceptedByUserId', 'createdByUserId',
        'game', 'players', 'timeControl', 'gameSetup'
      ]);
      const openOffer = values.get('openOffer') === true;
      const offerStatus = String(values.get('openOfferStatus') || (openOffer ? 'open' : ''));
      const acceptedBy = String(values.get('openOfferAcceptedByUserId') || '');
      if (!openOffer || (offerStatus !== 'open' && !(offerStatus === 'accepted' && acceptedBy === userId))) {
        return { ok:false, status:409, code:'OPEN_OFFER_NOT_AVAILABLE', message:'Dieses Partieangebot ist nicht mehr verfügbar.' };
      }

      const creatorUserId = String(values.get('createdByUserId') || '');
      if (!creatorUserId) return { ok:false, status:409, code:'OPEN_OFFER_CREATOR_MISSING', message:'Der Ersteller des Partieangebots konnte nicht ermittelt werden.' };
      if (creatorUserId === userId) return { ok:false, status:409, code:'CANNOT_ACCEPT_OWN_OFFER', message:'Dein eigenes Partieangebot kannst du nicht annehmen.' };
      if (acceptedBy && acceptedBy !== userId) return { ok:false, status:409, code:'OPEN_OFFER_ALREADY_ACCEPTED', message:'Ein anderes Mitglied hat dieses Partieangebot bereits angenommen.' };

      const game = values.get('game') || { started:false, ended:false };
      if (game.started || game.ended) return { ok:false, status:409, code:'OPEN_OFFER_ALREADY_STARTED', message:'Diese Partie wurde bereits angenommen oder gestartet.' };
      const rawPlayers = values.get('players') || { white:null, black:null };
      const players = { white:normalizeSeatSlot(rawPlayers.white), black:normalizeSeatSlot(rawPlayers.black) };
      const occupied = Number(!!players.white) + Number(!!players.black);
      if (occupied !== 1) return { ok:false, status:409, code:'OPEN_OFFER_NOT_AVAILABLE', message:'Dieses Partieangebot ist nicht mehr verfügbar.' };
      const creatorRole = players.white ? 'w' : 'b';
      const creatorSlot = creatorRole === 'w' ? players.white : players.black;
      if (!creatorSlot || String(creatorSlot.userId || '') !== creatorUserId) return { ok:false, status:409, code:'OPEN_OFFER_CREATOR_MISMATCH', message:'Das Partieangebot ist nicht mehr gültig.' };
      const timeControl = cleanTimeControl(values.get('timeControl') || null);
      const gameSetupRaw = values.get('gameSetup') || null;
      if (!timeControl || !gameSetupRaw) return { ok:false, status:409, code:'OPEN_OFFER_NOT_READY', message:'Das Partieangebot wird noch vorbereitet. Bitte die Liste kurz aktualisieren.' };

      const opponentRole = creatorRole === 'w' ? 'b' : 'w';
      if (!acceptedBy) {
        await transaction.put({
          openOfferAcceptedByUserId:userId,
          openOfferAcceptedAt:new Date().toISOString(),
          openOfferStatus:'accepted'
        });
      }
      return { ok:true, status:200, roomId, preferredRole:opponentRole, newlyAccepted:!acceptedBy, message:'Partieangebot wurde angenommen. Der Spielraum wird geöffnet.' };
    });

    if (reservation.ok && reservation.newlyAccepted) {
      await this.syncOpenOfferIndex();
      await this.broadcastRoomState('room_state');
    }
    return reservation;
  }

  async withdrawOpenOffer(requestingUserId) {
    const userId = String(requestingUserId || '').trim();
    if (!userId) return { ok:false, status:401, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' };
    const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
    if (!roomId) return { ok:false, status:404, code:'ROOM_NOT_FOUND', message:'Das Partieangebot wurde nicht gefunden.' };
    const cancelledAt = new Date().toISOString();
    const cancellationMessage = 'Dieses Partieangebot wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.';

    const withdrawal = await this.state.storage.transaction(async transaction => {
      const values = await transaction.get(['cancelled', 'createdByUserId', 'openOffer', 'openOfferStatus', 'game', 'players']);
      const existingCancellation = values.get('cancelled');
      if (existingCancellation && existingCancellation.cancelled) {
        if (existingCancellation.kind === 'open_offer' && String(existingCancellation.cancelledByUserId || '') === userId) {
          return { ok:true, status:200, roomId, cancelledAt:existingCancellation.cancelledAt || cancelledAt, alreadyWithdrawn:true, message:'Partieangebot wurde bereits zurückgezogen.' };
        }
        return { ok:false, status:410, code:existingCancellation.code || 'ROOM_CANCELLED', message:existingCancellation.message || 'Dieser Spielraum ist nicht mehr verfügbar.' };
      }
      const creatorUserId = String(values.get('createdByUserId') || '');
      if (!creatorUserId || creatorUserId !== userId) return { ok:false, status:403, code:'NOT_OPEN_OFFER_CREATOR', message:'Nur der Ersteller kann dieses Partieangebot zurückziehen.' };
      const openOffer = values.get('openOffer') === true;
      const offerStatus = String(values.get('openOfferStatus') || (openOffer ? 'open' : ''));
      if (!openOffer || offerStatus !== 'open') return { ok:false, status:409, code:'OPEN_OFFER_ALREADY_ACCEPTED', message:'Das Partieangebot kann nicht mehr zurückgezogen werden, weil es bereits angenommen wurde.' };
      const game = values.get('game') || { started:false, ended:false };
      const rawPlayers = values.get('players') || { white:null, black:null };
      const players = { white:normalizeSeatSlot(rawPlayers.white), black:normalizeSeatSlot(rawPlayers.black) };
      const occupied = Number(!!players.white) + Number(!!players.black);
      if (game.started || game.ended || occupied !== 1) return { ok:false, status:409, code:'OPEN_OFFER_ALREADY_ACCEPTED', message:'Das Partieangebot kann nicht mehr zurückgezogen werden, weil es bereits angenommen wurde.' };

      const cancellation = { cancelled:true, cancelledAt, cancelledByUserId:userId, roomId, kind:'open_offer', code:'OPEN_OFFER_WITHDRAWN', message:cancellationMessage };
      await transaction.put({ cancelled:cancellation, openOfferStatus:'withdrawn' });
      await transaction.delete('chatMessages');
      return { ok:true, status:200, roomId, cancelledAt, message:'Partieangebot wurde zurückgezogen.' };
    });

    if (!withdrawal.ok || withdrawal.alreadyWithdrawn) return withdrawal;
    try { await this.state.storage.deleteAlarm(); } catch (_) {}
    try {
      if (roomId && await ensureOpenGameOffersTable(this.env)) await this.env.DB.prepare(`DELETE FROM open_game_offers WHERE room_id = ?`).bind(roomId).run();
      if (roomId && await ensureDailyGamesTable(this.env)) await this.env.DB.prepare(`DELETE FROM daily_games WHERE room_id = ?`).bind(roomId).run();
      if (roomId && await ensurePublicGamesTable(this.env)) await this.env.DB.prepare(`DELETE FROM public_games WHERE room_id = ?`).bind(roomId).run();
    } catch (_) {}
    for (const socket of this.state.getWebSockets()) {
      const socketInfo = socket.deserializeAttachment() || {};
      socket.serializeAttachment(Object.assign({}, socketInfo, { role:'revoked', seatClaimed:false, cancelledAt }));
      safeSend(socket, { type:'room_cancelled', room:roomId || socketInfo.room || 'unknown', code:'OPEN_OFFER_WITHDRAWN', message:cancellationMessage, cancelledAt, serverNow:Date.now() });
      try { socket.close(4004, 'Partieangebot zurückgezogen'); } catch (_) {}
    }
    return withdrawal;
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
    const tournamentMeta = (await this.state.storage.get('tournamentMeta')) || null;
    const pgn = buildDailyPgnDocument({ game, timeControl, setup, moves, whiteName, blackName, tournamentMeta });
    const datePart = pgnDateFromIso(game.endedAt || game.startedAt || null).replace(/\./g, '-');
    const variantPart = setup.variant === GAME_VARIANT_FREESTYLE ? ('Freestyle-' + setup.positionId) : 'Klassisch';
    const filename = safePgnFilePart('Hammerschach-' + datePart + '-' + variantPart + '-' + whiteName + '-vs-' + blackName) + '.pgn';
    return { ok:true, status:200, pgn, filename };
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === DURABLE_BACKUP_INTERNAL_PATH) {
      const logicalName = cleanRoomId(request.headers.get('x-hammerschach-backup-logical-name') || '');
      return durableObjectBackupResponse(this.state, this.env, request, 'GameRoom', logicalName);
    }

    if (request.method === 'POST' && url.pathname === '/rate-game') {
      const body = await readJsonBody(request);
      if (!body) return json({ok:false, code:'BAD_JSON', message:'Ratingdaten konnten nicht gelesen werden.'}, {status:400});
      try {
        const result = await rateCompletedGame(this.env, body);
        return json(result, {status:result.ok ? 200 : 400});
      } catch (_) {
        return json({ok:false, code:'RATING_UPDATE_FAILED', message:'Die Ratingwertung konnte nicht gespeichert werden.'}, {status:500});
      }
    }

    const room = cleanRoomId(url.searchParams.get('room'));
    if (!room) return new Response('Missing or invalid room', { status: 400 });

    await this.state.storage.put('roomId', room);

    if (request.method === 'POST' && url.pathname === '/tournament-init') {
      const body = await readJsonBody(request);
      const whiteUserId = String(body && body.white && body.white.userId || '').trim();
      const blackUserId = String(body && body.black && body.black.userId || '').trim();
      const tournamentId = String(body && body.tournamentId || '').trim();
      const tournamentGameId = String(body && body.tournamentGameId || '').trim();
      if (!body || !whiteUserId || !blackUserId || whiteUserId === blackUserId || !tournamentId || !tournamentGameId) {
        return json({ok:false, code:'INVALID_TOURNAMENT_GAME', message:'Die Turnierpartie ist unvollständig.'}, {status:400});
      }
      const existingMeta = await this.state.storage.get('tournamentMeta');
      if (existingMeta && String(existingMeta.tournamentGameId || '') === tournamentGameId) {
        return json({ok:true, roomId:room, alreadyInitialized:true});
      }
      if (existingMeta) return json({ok:false, code:'ROOM_ALREADY_ASSIGNED', message:'Dieser Spielraum gehört bereits zu einer anderen Turnierpartie.'}, {status:409});

      const whitePlayerId = 'tournament_' + whiteUserId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) + '_w';
      const blackPlayerId = 'tournament_' + blackUserId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) + '_b';
      const now = Date.now();
      const players = {
        white:{playerId:whitePlayerId, userId:whiteUserId, seatTokenHash:await sha256Hex(randomBase64Url(32)), assignedAt:now, updatedAt:now},
        black:{playerId:blackPlayerId, userId:blackUserId, seatTokenHash:await sha256Hex(randomBase64Url(32)), assignedAt:now, updatedAt:now}
      };
      const whiteName = cleanDisplayName(body.white.username) || 'Weiß';
      const blackName = cleanDisplayName(body.black.username) || 'Schwarz';
      const profiles = {
        [whitePlayerId]:{playerId:whitePlayerId, displayName:whiteName, name:whiteName, guest:false, userId:whiteUserId, username:whiteName, role:'w', updatedAt:now},
        [blackPlayerId]:{playerId:blackPlayerId, displayName:blackName, name:blackName, guest:false, userId:blackUserId, username:blackName, role:'b', updatedAt:now}
      };
      const hours = TOURNAMENT_ALLOWED_HOURS.includes(Number(body.hoursPerMove)) ? Number(body.hoursPerMove) : 24;
      const gameSetup = cleanGameSetup(body.gameSetup || null);
      const tournamentMeta = {
        tournamentId,
        tournamentGameId,
        tournamentName:cleanTournamentName(body.tournamentName),
        roundNumber:Math.max(1, Number(body.roundNumber || 1)),
        totalRounds:Math.max(1, Number(body.totalRounds || 1)),
        pairingNumber:Math.max(1, Number(body.pairingNumber || 1)),
        gameNumber:Number(body.gameNumber) === 2 ? 2 : 1
      };
      await this.state.storage.put({
        roomId:room,
        players,
        playerProfiles:profiles,
        timeControl:{mode:'daily', daysPerMove:hours / 24, label:hours + ' Stunden pro Zug'},
        gameSetup,
        ratedRequested:body.rated !== false,
        publicGame:true,
        openOffer:false,
        openOfferStatus:'none',
        createdByRole:'w',
        createdByUserId:String(body.createdByUserId || whiteUserId),
        tournamentMeta
      });
      await this.syncAccountRoomIndex(players);
      const started = await this.autoStartDailyGameIfReady('tournament');
      if (!started.started && started.reason !== 'already_started') {
        return json({ok:false, code:'TOURNAMENT_GAME_START_FAILED', message:'Die Turnierpartie konnte nicht gestartet werden.'}, {status:500});
      }
      return json({ok:true, roomId:room, started:true, tournamentMeta});
    }

    if (request.method === 'POST' && url.pathname === '/invitation-email-context') {
      const result = await this.invitationEmailContext(request.headers.get('x-hammerschach-user-id') || '');
      return json({
        ok:result.ok,
        code:result.code || '',
        message:result.message || '',
        roomId:result.roomId || room,
        creatorRole:result.creatorRole || '',
        timeControl:result.timeControl || null,
        gameSetup:result.gameSetup || null,
        gameStarted:!!result.gameStarted
      }, { status:result.status || (result.ok ? 200 : 400) });
    }

    if (request.method === 'POST' && url.pathname === '/moderation-context') {
      const body=await readJsonBody(request); const reporterUserId=String(body&&body.reporterUserId||''); const reportedRole=body&&body.reportedRole==='b'?'b':'w';
      const players=await this.getSecurePlayers(); const reporterIsPlayer=[players.white,players.black].some(slot=>slot&&slot.userId&&String(slot.userId)===reporterUserId);
      if(!reporterIsPlayer) return json({ok:false,code:'NOT_ROOM_PLAYER',message:'Nur ein beteiligter Spieler kann aus dieser Partie melden.'},{status:403});
      const target=reportedRole==='w'?players.white:players.black; if(!target) return json({ok:false,code:'PLAYER_NOT_FOUND',message:'Der gemeldete Spielerplatz ist nicht belegt.'},{status:404});
      const profiles=(await this.state.storage.get('playerProfiles'))||{}; const profile=profiles[target.playerId]||{}; const chats=(await this.state.storage.get('chatMessages'))||[]; const game=(await this.state.storage.get('game'))||{}; const timeControl=(await this.state.storage.get('timeControl'))||null; const gameSetup=(await this.state.storage.get('gameSetup'))||null;
      return json({ok:true,reportedUserId:target.userId||'',reportedName:profile.displayName||profile.name||(reportedRole==='w'?'Weiß':'Schwarz'),chatSnapshot:(Array.isArray(chats)?chats.slice(-30):[]).map(c=>({senderName:c.senderName||c.name||'',role:c.role||'',text:c.text||'',sentAt:c.sentAt||''})),gameSnapshot:{started:!!game.started,ended:!!game.ended,result:game.result||'*',timeControl,gameSetup}});
    }

    if (request.method === 'POST' && url.pathname === '/prepare-account-deletion') {
      const body = await readJsonBody(request);
      const result = await this.prepareAccountDeletion(body && body.userId);
      return json(result, { status:result.status || (result.ok ? 200 : 400) });
    }

    if (request.method === 'POST' && url.pathname === '/anonymize-account') {
      const body = await readJsonBody(request);
      const result = await this.anonymizeDeletedAccount(body && body.userId, body && body.anonymizedId);
      return json(result, { status:result.status || (result.ok ? 200 : 400) });
    }

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

    if (request.method === 'POST' && url.pathname === '/accept-open-offer') {
      const result = await this.acceptOpenOffer(request.headers.get('x-hammerschach-user-id') || '');
      return json(result, { status:result.status || (result.ok ? 200 : 400) });
    }

    if (request.method === 'POST' && url.pathname === '/withdraw-open-offer') {
      const result = await this.withdrawOpenOffer(request.headers.get('x-hammerschach-user-id') || '');
      return json(result, { status:result.status || (result.ok ? 200 : 400) });
    }

    const cancellation = await this.state.storage.get('cancelled');
    if (cancellation && cancellation.cancelled) {
      const cancellationMessage = cancellation.message || 'Diese Einladung wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.';
      const cancellationCode = cancellation.code || 'INVITATION_CANCELLED';
      if (request.headers.get('Upgrade') !== 'websocket') {
        return json({ ok:false, code:cancellationCode, message:cancellationMessage, cancelledAt:cancellation.cancelledAt || null }, { status:410 });
      }
      const cancelledPair = new WebSocketPair();
      const [cancelledClient, cancelledServer] = Object.values(cancelledPair);
      cancelledServer.accept();
      safeSend(cancelledServer, {
        type:'room_cancelled',
        room,
        code:cancellationCode,
        message:cancellationMessage,
        cancelledAt:cancellation.cancelledAt || null,
        serverNow:Date.now()
      });
      try { cancelledServer.close(4004, cancellation.kind === 'open_offer' ? 'Partieangebot zurückgezogen' : 'Einladung zurückgezogen'); } catch (_) {}
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
      viewerMode: '',
      publicWatchId: cleanPublicWatchId(url.searchParams.get('publicWatchId') || ''),
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

  async syncAccountRoomIndex(playersOverride = null) {
    try {
      const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
      if (!roomId || !this.env || !this.env.DB) return false;
      const players = playersOverride || await this.getSecurePlayers();
      const tasks = [];
      if (players.white && players.white.userId) tasks.push(indexAccountGameRoom(this.env, players.white.userId, roomId, 'w'));
      if (players.black && players.black.userId) tasks.push(indexAccountGameRoom(this.env, players.black.userId, roomId, 'b'));
      if (tasks.length) await Promise.all(tasks);
      return true;
    } catch (_) {
      // Der Raumindex unterstützt die spätere Account-Anonymisierung, darf aber niemals den Spielbeitritt blockieren.
      return false;
    }
  }

  async prepareAccountDeletion(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return { ok:false, status:400, code:'USER_ID_REQUIRED', message:'Benutzer-ID fehlt.' };
    const players = await this.getSecurePlayers();
    const belongs = [players.white, players.black].some(slot => slot && slot.userId && String(slot.userId) === uid);
    if (!belongs) return { ok:true, status:200, active:false, belongs:false };
    const game = (await this.state.storage.get('game')) || { started:false, ended:false };
    return { ok:true, status:200, active:!!(game.started && !game.ended), belongs:true };
  }

  async anonymizeDeletedAccount(userId, anonymizedId) {
    const uid = String(userId || '').trim();
    if (!uid) return { ok:false, status:400, code:'USER_ID_REQUIRED', message:'Benutzer-ID fehlt.' };
    const creatorUserId = String((await this.state.storage.get('createdByUserId')) || '');
    const openOffer = (await this.state.storage.get('openOffer')) === true;
    const openOfferStatus = String((await this.state.storage.get('openOfferStatus')) || (openOffer ? 'open' : ''));
    if (creatorUserId === uid && openOffer && openOfferStatus === 'open') {
      const withdrawal = await this.withdrawOpenOffer(uid);
      if (!withdrawal.ok) return withdrawal;
      return { ok:true, status:200, anonymized:true, openOfferWithdrawn:true };
    }
    const game = (await this.state.storage.get('game')) || { started:false, ended:false };
    if (game.started && !game.ended) {
      return { ok:false, status:409, code:'ACTIVE_GAME', active:true, message:'Eine laufende Partie kann nicht während der Accountlöschung anonymisiert werden.' };
    }
    const deletedLabel = 'Gelöschter Benutzer';
    const players = await this.getSecurePlayers();
    const profiles = (await this.state.storage.get('playerProfiles')) || {};
    const affectedPlayerIds = new Set();
    let changed = false;
    for (const role of ['white','black']) {
      const slot = players[role];
      if (!slot || !slot.userId || String(slot.userId) !== uid) continue;
      const oldPlayerId = String(slot.playerId || '');
      if (oldPlayerId) affectedPlayerIds.add(oldPlayerId);
      const anonymousPlayerId = `${String(anonymizedId || 'deleted').slice(0,60)}_${role}`;
      players[role] = Object.assign({}, slot, {
        playerId:anonymousPlayerId,
        userId:null,
        seatTokenHash:await sha256Hex(randomBase64Url(32)),
        deletedAccount:true,
        updatedAt:Date.now()
      });
      if (oldPlayerId && profiles[oldPlayerId]) delete profiles[oldPlayerId];
      profiles[anonymousPlayerId] = {
        playerId:anonymousPlayerId,
        displayName:deletedLabel,
        name:deletedLabel,
        guest:true,
        userId:null,
        username:'',
        role:role === 'white' ? 'w' : 'b',
        deletedAccount:true,
        updatedAt:Date.now()
      };
      changed = true;
    }
    for (const [playerId, profile] of Object.entries(profiles)) {
      if (profile && profile.userId && String(profile.userId) === uid) {
        affectedPlayerIds.add(String(playerId));
        profiles[playerId] = Object.assign({}, profile, { displayName:deletedLabel, name:deletedLabel, guest:true, userId:null, username:'', deletedAccount:true, updatedAt:Date.now() });
        changed = true;
      }
    }
    const chats = (await this.state.storage.get('chatMessages')) || [];
    let chatChanged = false;
    const anonymizedChats = Array.isArray(chats) ? chats.map(chat => {
      if (!chat) return chat;
      const userMatches = (chat.senderUserId && String(chat.senderUserId) === uid) || (chat.userId && String(chat.userId) === uid);
      const playerMatches = affectedPlayerIds.has(String(chat.senderPlayerId || chat.playerId || ''));
      if (!userMatches && !playerMatches) return chat;
      chatChanged = true;
      return Object.assign({}, chat, { senderUserId:'', userId:null, senderPlayerId:'', playerId:'', senderName:deletedLabel, name:deletedLabel, displayName:deletedLabel, deletedAccount:true });
    }) : [];
    if (changed) {
      await this.state.storage.put('players', players);
      await this.state.storage.put('playerProfiles', profiles);
      const createdByUserId = String((await this.state.storage.get('createdByUserId')) || '');
      if (createdByUserId === uid) await this.state.storage.delete('createdByUserId');
      this.accountNameCache = { key:'', expiresAt:0, values:{} };
      this.ratingStateCache = { key:'', expiresAt:0, value:null };
    }
    if (chatChanged) await this.state.storage.put('chatMessages', anonymizedChats);
    for (const socket of this.state.getWebSockets()) {
      const info = socket.deserializeAttachment() || {};
      if (!info.userId || String(info.userId) !== uid) continue;
      socket.serializeAttachment(Object.assign({}, info, { userId:null, username:'', role:'revoked', seatClaimed:false, deletedAccount:true }));
      safeSend(socket, { type:'account_deleted', message:'Der zugehörige Account wurde gelöscht.', serverNow:Date.now() });
      try { socket.close(4003, 'Account gelöscht'); } catch (_) {}
    }
    return { ok:true, status:200, anonymized:changed || chatChanged };
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
      await this.syncAccountRoomIndex(players);
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
      await this.syncAccountRoomIndex(players);
      const creatorRole = (await this.state.storage.get('createdByRole')) || '';
      if (!creatorRole) {
        await this.state.storage.put('createdByRole', role);
        if (authUser && authUser.id) await this.state.storage.put('createdByUserId', String(authUser.id));
      }
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
    await this.syncAccountRoomIndex(players);
    return true;
  }

  async savePlayerProfile(playerId, requestedDisplayName, role = '', accountUser = null) {
    const profiles = (await this.state.storage.get('playerProfiles')) || {};
    const previous = profiles[playerId] || {};
    const previousUserId = String(previous.userId || '').trim();
    const currentUserId = accountUser && accountUser.id ? String(accountUser.id) : '';

    // Ein einmal accountgebundenes Profil darf weder durch einen Gast noch durch
    // einen anderen Account umbenannt oder in ein Gastprofil zurückverwandelt werden.
    if (previousUserId && previousUserId !== currentUserId) return previous;

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
    if (accountUser) this.accountNameCache = { key:'', expiresAt:0, values:{} };
    return profile;
  }

  async getAccountNamesByUserIds(userIds) {
    const ids = Array.from(new Set((userIds || []).map(value => String(value || '').trim()).filter(Boolean))).sort();
    if (ids.length === 0 || !this.env || !this.env.DB) return {};

    const now = Date.now();
    const cacheKey = ids.join('|');
    if (this.accountNameCache && this.accountNameCache.key === cacheKey && this.accountNameCache.expiresAt > now) {
      return this.accountNameCache.values || {};
    }

    const values = Object.fromEntries(ids.map(id => [id, '']));
    try {
      const placeholders = ids.map(() => '?').join(',');
      const result = await this.env.DB.prepare(
        `SELECT id, username FROM users WHERE id IN (${placeholders})`
      ).bind(...ids).all();
      for (const row of (result && result.results ? result.results : [])) {
        const userId = String(row.id || '');
        const username = cleanDisplayName(row.username || '');
        if (userId && username) values[userId] = username;
      }
    } catch (_) {}

    this.accountNameCache = { key:cacheKey, expiresAt:now + 30000, values };
    return values;
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
    const accountNames = await this.getAccountNamesByUserIds([whiteUserId, blackUserId]);
    const makeSlot = (playerId, userId) => {
      const profile = playerId ? (profiles[playerId] || {}) : {};
      const accountName = userId ? cleanDisplayName(accountNames[userId] || '') : '';
      const displayName = accountName || cleanDisplayName(profile.displayName || profile.name) || (playerId ? guestNameFromPlayerId(playerId) : '');
      return {
        connected: false,
        gamerOnline: !!(userId && presence[userId]),
        name: displayName,
        displayName,
        guest: userId ? false : profile.guest !== false
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
        if (!whiteUserId && name) { active.white.name = name; active.white.displayName = name; }
        active.white.guest = whiteUserId ? false : info.guest !== false;
      } else if (info.role === 'b') {
        active.black.connected = true;
        if (!blackUserId && name) { active.black.name = name; active.black.displayName = name; }
        active.black.guest = blackUserId ? false : info.guest !== false;
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
      const accountNames = await this.getAccountNamesByUserIds([whiteUserId, blackUserId]);
      const whiteName = cleanDisplayName(accountNames[whiteUserId] || '') || cleanDisplayName(whitePlayerId && profiles[whitePlayerId] && (profiles[whitePlayerId].displayName || profiles[whitePlayerId].name)) || (whiteUserId ? 'Weiß' : 'noch offen');
      const blackName = cleanDisplayName(accountNames[blackUserId] || '') || cleanDisplayName(blackPlayerId && profiles[blackPlayerId] && (profiles[blackPlayerId].displayName || profiles[blackPlayerId].name)) || (blackUserId ? 'Schwarz' : 'noch offen');
      const game = (await this.state.storage.get('game')) || { started:false, ended:false, result:'*' };
      const clock = advanceClock((await this.state.storage.get('clock')) || null, Date.now());
      const setup = cleanGameSetup((await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null);
      const ratedRequested = (await this.state.storage.get('ratedRequested')) !== false;
      const ratedForIndex = game.started && Number(game.ratingSystemVersion || 0) === RATING_SYSTEM_VERSION
        ? !!game.ratingRated
        : ratedRequested;
      const now = Date.now();
      const deadlineAt = clock && clock.running && !clock.timeLost
        ? new Date(now + Math.max(0, Number(clock[clock.turn + 'Ms'] || 0))).toISOString()
        : null;

      await this.env.DB.prepare(
        `INSERT INTO daily_games (
           room_id, white_user_id, black_user_id, white_name, black_name,
           time_label, days_per_move, variant, started, started_at, updated_at,
           turn, deadline_at, ended, ended_at, result, end_reason, rated
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
           end_reason = excluded.end_reason,
           rated = excluded.rated`
      ).bind(
        roomId, whiteUserId || null, blackUserId || null, whiteName, blackName,
        timeControl.label, timeControl.daysPerMove, setup.variant,
        game.started ? 1 : 0, game.startedAt || null, new Date(now).toISOString(),
        clock && (clock.turn === 'w' || clock.turn === 'b') ? clock.turn : null, deadlineAt,
        game.ended ? 1 : 0, game.endedAt || null, game.result || '*', game.endReason || null, ratedForIndex ? 1 : 0
      ).run();
    } catch (_) {
      // Ein D1-Fehler darf die eigentliche Partie nicht unterbrechen.
    }
  }

  async syncPublicGameIndex() {
    try {
      if (!(await ensurePublicGamesTable(this.env))) return;
      const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
      if (!roomId) return;

      const removeFromIndex = async () => {
        await this.env.DB.prepare(`DELETE FROM public_games WHERE room_id = ?`).bind(roomId).run();
      };
      const cancellation = await this.state.storage.get('cancelled');
      const isPublic = (await this.state.storage.get('publicGame')) === true;
      const game = (await this.state.storage.get('game')) || { started:false, ended:false, result:'*' };
      if ((cancellation && cancellation.cancelled) || !isPublic || !game.started || game.ended) {
        await removeFromIndex();
        return;
      }

      const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
      if (!timeControl) {
        await removeFromIndex();
        return;
      }
      const players = await this.getSecurePlayers();
      if (!players.white || !players.black) {
        await removeFromIndex();
        return;
      }
      const profiles = (await this.state.storage.get('playerProfiles')) || {};
      const whitePlayerId = playerIdFromSlot(players.white);
      const blackPlayerId = playerIdFromSlot(players.black);
      const whiteUserId = players.white && players.white.userId ? String(players.white.userId) : '';
      const blackUserId = players.black && players.black.userId ? String(players.black.userId) : '';
      const accountNames = await this.getAccountNamesByUserIds([whiteUserId, blackUserId]);
      const whiteName = cleanDisplayName(accountNames[whiteUserId] || '') || cleanDisplayName(whitePlayerId && profiles[whitePlayerId] && (profiles[whitePlayerId].displayName || profiles[whitePlayerId].name)) || 'Weiß';
      const blackName = cleanDisplayName(accountNames[blackUserId] || '') || cleanDisplayName(blackPlayerId && profiles[blackPlayerId] && (profiles[blackPlayerId].displayName || profiles[blackPlayerId].name)) || 'Schwarz';
      const setup = cleanGameSetup((await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null);
      let spectatorId = cleanPublicWatchId((await this.state.storage.get('publicWatchId')) || '');
      if (!spectatorId) {
        spectatorId = randomBase64Url(24);
        await this.state.storage.put('publicWatchId', spectatorId);
      }
      const moves = (await this.state.storage.get('moves')) || [];
      const clock = advanceClock((await this.state.storage.get('clock')) || null, Date.now());
      const turn = clock && (clock.turn === 'w' || clock.turn === 'b') ? clock.turn : (moves.length % 2 ? 'b' : 'w');
      const lastMove = moves.length ? moves[moves.length - 1] : null;
      const updatedAt = new Date().toISOString();

      await this.env.DB.prepare(
        `INSERT INTO public_games (
           room_id, spectator_id, white_user_id, black_user_id, white_name, black_name,
           mode, time_label, days_per_move, variant, position_id,
           started_at, updated_at, turn, moves_count, last_move_san,
           public_game, ended
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
         ON CONFLICT(room_id) DO UPDATE SET
           spectator_id = excluded.spectator_id,
           white_user_id = excluded.white_user_id,
           black_user_id = excluded.black_user_id,
           white_name = excluded.white_name,
           black_name = excluded.black_name,
           mode = excluded.mode,
           time_label = excluded.time_label,
           days_per_move = excluded.days_per_move,
           variant = excluded.variant,
           position_id = excluded.position_id,
           started_at = excluded.started_at,
           updated_at = excluded.updated_at,
           turn = excluded.turn,
           moves_count = excluded.moves_count,
           last_move_san = excluded.last_move_san,
           public_game = 1,
           ended = 0`
      ).bind(
        roomId, spectatorId, whiteUserId || null, blackUserId || null, whiteName, blackName,
        timeControl.mode === 'daily' ? 'daily' : 'live', timeControl.label || '',
        timeControl.mode === 'daily' ? Math.max(1, Number(timeControl.daysPerMove || 1)) : null,
        setup.variant, setup.variant === GAME_VARIANT_FREESTYLE ? setup.positionId : null,
        game.startedAt || updatedAt, updatedAt, turn, moves.length,
        lastMove && lastMove.san ? String(lastMove.san).slice(0, 24) : null
      ).run();
    } catch (_) {
      // Die öffentliche Übersicht darf die Partie niemals unterbrechen.
    }
  }

  async syncOpenOfferIndex() {
    try {
      if (!(await ensureOpenGameOffersTable(this.env))) return;
      const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
      if (!roomId) return;
      const removeFromIndex = async () => {
        await this.env.DB.prepare(`DELETE FROM open_game_offers WHERE room_id = ?`).bind(roomId).run();
      };
      const cancellation = await this.state.storage.get('cancelled');
      const openOffer = (await this.state.storage.get('openOffer')) === true;
      const offerStatus = String((await this.state.storage.get('openOfferStatus')) || (openOffer ? 'open' : 'none'));
      const acceptedBy = String((await this.state.storage.get('openOfferAcceptedByUserId')) || '');
      const game = (await this.state.storage.get('game')) || { started:false, ended:false };
      if ((cancellation && cancellation.cancelled) || !openOffer || offerStatus !== 'open' || acceptedBy || game.started || game.ended) {
        await removeFromIndex();
        return;
      }
      const players = await this.getSecurePlayers();
      const occupied = Number(!!players.white) + Number(!!players.black);
      if (occupied !== 1) {
        await removeFromIndex();
        return;
      }
      const creatorRole = players.white ? 'w' : 'b';
      const creatorSlot = creatorRole === 'w' ? players.white : players.black;
      const creatorUserId = String((await this.state.storage.get('createdByUserId')) || (creatorSlot && creatorSlot.userId) || '');
      if (!creatorUserId || !creatorSlot || String(creatorSlot.userId || '') !== creatorUserId) {
        await removeFromIndex();
        return;
      }
      const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
      const setup = cleanGameSetup((await this.state.storage.get('gameSetup')) || null);
      if (!timeControl || !setup) {
        await removeFromIndex();
        return;
      }
      const accountNames = await this.getAccountNamesByUserIds([creatorUserId]);
      const profiles = (await this.state.storage.get('playerProfiles')) || {};
      const creatorPlayerId = playerIdFromSlot(creatorSlot);
      const creatorName = cleanDisplayName(accountNames[creatorUserId] || '') || cleanDisplayName(creatorPlayerId && profiles[creatorPlayerId] && (profiles[creatorPlayerId].displayName || profiles[creatorPlayerId].name)) || 'Mitglied';
      const nowIso = new Date().toISOString();
      const createdAt = String((await this.state.storage.get('openOfferCreatedAt')) || nowIso);
      const ratedRequested = (await this.state.storage.get('ratedRequested')) !== false;
      if (!(await this.state.storage.get('openOfferCreatedAt'))) await this.state.storage.put('openOfferCreatedAt', createdAt);
      await this.env.DB.prepare(
        `INSERT INTO open_game_offers (
           room_id, creator_user_id, creator_name, creator_role, opponent_role,
           mode, time_label, days_per_move, variant, position_id,
           created_at, updated_at, offer_status, rated_requested
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
         ON CONFLICT(room_id) DO UPDATE SET
           creator_user_id = excluded.creator_user_id,
           creator_name = excluded.creator_name,
           creator_role = excluded.creator_role,
           opponent_role = excluded.opponent_role,
           mode = excluded.mode,
           time_label = excluded.time_label,
           days_per_move = excluded.days_per_move,
           variant = excluded.variant,
           position_id = excluded.position_id,
           updated_at = excluded.updated_at,
           offer_status = 'open',
           rated_requested = excluded.rated_requested`
      ).bind(
        roomId, creatorUserId, creatorName, creatorRole, creatorRole === 'w' ? 'b' : 'w',
        timeControl.mode === 'daily' ? 'daily' : 'live', timeControl.label || '',
        timeControl.mode === 'daily' ? Math.max(1, Number(timeControl.daysPerMove || 1)) : null,
        setup.variant, setup.variant === GAME_VARIANT_FREESTYLE ? setup.positionId : null,
        createdAt, nowIso, ratedRequested ? 1 : 0
      ).run();
    } catch (_) {
      // Die Vermittlung offener Partien darf den Spielraum nicht unterbrechen.
    }
  }

  async syncCompletedGameIndex() {
    try {
      if (!(await ensureCompletedGamesTable(this.env))) return;
      const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
      if (!roomId) return;
      const game = (await this.state.storage.get('game')) || {started:false, ended:false, result:'*'};
      if (!game.started || !game.ended) return;

      const players = await this.getSecurePlayers();
      const whiteUserId = players.white && players.white.userId ? String(players.white.userId) : '';
      const blackUserId = players.black && players.black.userId ? String(players.black.userId) : '';
      if (!whiteUserId && !blackUserId) return;

      const profiles = (await this.state.storage.get('playerProfiles')) || {};
      const whitePlayerId = playerIdFromSlot(players.white);
      const blackPlayerId = playerIdFromSlot(players.black);
      const accountNames = await this.getAccountNamesByUserIds([whiteUserId, blackUserId]);
      const whiteName = cleanDisplayName(accountNames[whiteUserId] || '') || cleanDisplayName(whitePlayerId && profiles[whitePlayerId] && (profiles[whitePlayerId].displayName || profiles[whitePlayerId].name)) || 'Weiß';
      const blackName = cleanDisplayName(accountNames[blackUserId] || '') || cleanDisplayName(blackPlayerId && profiles[blackPlayerId] && (profiles[blackPlayerId].displayName || profiles[blackPlayerId].name)) || 'Schwarz';
      const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
      const setup = cleanGameSetup((await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null);
      const moves = (await this.state.storage.get('moves')) || [];
      const tournamentMeta = (await this.state.storage.get('tournamentMeta')) || null;
      const pgn = buildCompletedPgnDocument({game, timeControl, setup, moves, whiteName, blackName, tournamentMeta});
      const mode = timeControl && timeControl.mode === 'daily' ? 'daily' : 'live';
      const rated = Number(game.ratingSystemVersion || 0) === RATING_SYSTEM_VERSION ? !!game.ratingRated : (await this.state.storage.get('ratedRequested')) !== false;
      const updatedAt = new Date().toISOString();

      await this.env.DB.prepare(
        `INSERT INTO completed_games (
           room_id, white_user_id, black_user_id, white_name, black_name,
           mode, time_label, days_per_move, variant, position_id, back_rank,
           started_at, ended_at, result, end_reason, rated, pgn, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(room_id) DO UPDATE SET
           white_user_id = excluded.white_user_id,
           black_user_id = excluded.black_user_id,
           white_name = excluded.white_name,
           black_name = excluded.black_name,
           mode = excluded.mode,
           time_label = excluded.time_label,
           days_per_move = excluded.days_per_move,
           variant = excluded.variant,
           position_id = excluded.position_id,
           back_rank = excluded.back_rank,
           started_at = excluded.started_at,
           ended_at = excluded.ended_at,
           result = excluded.result,
           end_reason = excluded.end_reason,
           rated = excluded.rated,
           pgn = excluded.pgn,
           updated_at = excluded.updated_at`
      ).bind(
        roomId, whiteUserId || null, blackUserId || null, whiteName, blackName,
        mode, timeControl && timeControl.label ? timeControl.label : (mode === 'daily' ? 'Daily Chess' : 'Live'),
        mode === 'daily' ? Math.max(1, Number(timeControl && timeControl.daysPerMove || 1)) : null,
        setup.variant, setup.variant === GAME_VARIANT_FREESTYLE ? setup.positionId : null,
        setup.variant === GAME_VARIANT_FREESTYLE ? setup.backRank : null,
        game.startedAt || null, game.endedAt || updatedAt, game.result || '*', game.endReason || null,
        rated ? 1 : 0, pgn, updatedAt
      ).run();
    } catch (_) {
      // Das Analyse-Archiv darf den laufenden Spielraum niemals beeinträchtigen.
    }
  }

  async syncTournamentGameIndex() {
    try {
      const tournamentMeta = await this.state.storage.get('tournamentMeta');
      if (!tournamentMeta || !tournamentMeta.tournamentId || !tournamentMeta.tournamentGameId) return;
      const game = (await this.state.storage.get('game')) || {started:false, ended:false, result:'*'};
      await syncTournamentGameResult(this.env, tournamentMeta, game);
    } catch (_) {
      // Die Turnierübersicht darf eine laufende Partie niemals unterbrechen.
    }
  }

  async syncGameIndexes() {
    await this.syncDailyGameIndex();
    await this.syncPublicGameIndex();
    await this.syncOpenOfferIndex();
    await this.syncCompletedGameIndex();
    await this.syncTournamentGameIndex();
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
      await this.finalizeRatingIfNeeded(game);
      await this.syncGameIndexes();
      this.queueDailyResultNotifications(game);
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
    const ratingMeta = await this.ratingMetaForStart(timeControl, gameSetup);
    const game = {
      ...ratingMeta,
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
    await this.state.storage.delete('ratingResult');
    this.ratingStateCache = { key:'', expiresAt:0, value:null };
    await this.state.storage.put('moves', []);
    await this.state.storage.put('clock', clock);
    await this.state.storage.delete('drawOffer');
    await this.scheduleClockAlarm(clock, now);
    await this.syncGameIndexes();

    const openOffer = (await this.state.storage.get('openOffer')) === true;
    const openOfferStatus = String((await this.state.storage.get('openOfferStatus')) || (openOffer ? 'open' : ''));
    const openOfferAcceptedByUserId = String((await this.state.storage.get('openOfferAcceptedByUserId')) || '');
    const creatorUserId = String((await this.state.storage.get('createdByUserId')) || '');
    const creatorRole = players.white && String(players.white.userId || '') === creatorUserId
      ? 'w'
      : players.black && String(players.black.userId || '') === creatorUserId
        ? 'b'
        : '';
    const acceptedOpenOffer = !!(openOffer && openOfferStatus === 'accepted' && openOfferAcceptedByUserId && creatorRole);

    if (acceptedOpenOffer) {
      // Der Anbieter erhält genau eine Annahmebestätigung. Spielt er Weiß,
      // enthält dieselbe Mail zugleich den Hinweis „Du bist am Zug“, damit
      // nicht unmittelbar zwei Nachrichten für denselben Partiestart eintreffen.
      this.queueDailyOpenOfferAcceptedNotification(clock);
      if (creatorRole !== 'w') this.queueDailyTurnNotification('w', null, clock);
    } else {
      this.queueDailyTurnNotification('w', null, clock);
    }

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
    const createdByUserId = String((await this.state.storage.get('createdByUserId')) || '');
    const createdByMe = createdByUserId
      ? !!(info.userId && String(info.userId) === createdByUserId)
      : !!(createdByRole && info.role === createdByRole);
    const moves = ((await this.state.storage.get('moves')) || []).map(safeMoveForClient);
    const drawOffer = safeDrawOfferForClient((await this.state.storage.get('drawOffer')) || null);
    const storedChatValue = await this.state.storage.get('chatMessages');
    const storedChatMessages = Array.isArray(storedChatValue) ? storedChatValue : [];
    const isSpectator = info.role === 'spectator';
    const chatMessages = isSpectator ? [] : storedChatMessages
      .map(chat => safeChatForClient(chat, info))
      .filter(Boolean)
      .slice(-CHAT_HISTORY_MAX);
    const publicGame = (await this.state.storage.get('publicGame')) === true;
    const openOffer = (await this.state.storage.get('openOffer')) === true;
    const openOfferStatus = String((await this.state.storage.get('openOfferStatus')) || (openOffer ? 'open' : 'none'));
    const ratedRequested = (await this.state.storage.get('ratedRequested')) !== false;
    if (timed.game && timed.game.ended) await this.finalizeRatingIfNeeded(timed.game);
    const rating = await this.buildRatingState(timed.game || null, storedTimeControl, storedGameSetup);

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
      createdByMe,
      publicGame,
      openOffer,
      openOfferStatus,
      ratedRequested,
      spectatorMode: info.viewerMode === 'public',
      timeControl: safeTimeControlForClient(storedTimeControl),
      gameSetup,
      game,
      rating,
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

  disconnectPublicSpectators(message = 'Die Zuschauerfreigabe wurde vom Ersteller aufgehoben.') {
    for (const ws of this.state.getWebSockets()) {
      const info = ws.deserializeAttachment() || {};
      if (info.viewerMode !== 'public') continue;
      safeSend(ws, {
        type:'error',
        code:'PUBLIC_GAME_VISIBILITY_REVOKED',
        message,
        serverNow:Date.now()
      });
      try { ws.close(4003, 'Zuschauerfreigabe aufgehoben'); } catch (_) {}
    }
  }

  async broadcastRoomState(type = 'room_state') {
    for (const ws of this.state.getWebSockets()) {
      await this.sendRoomState(ws, type);
    }
  }

  async broadcastMove(move, messageId = null, clock = null, game = null) {
    const now = Date.now();
    const drawOffer = (await this.state.storage.get('drawOffer')) || null;
    const timeControl = (await this.state.storage.get('timeControl')) || null;
    const gameSetup = (await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null;
    const rating = await this.buildRatingState(game || null, timeControl, gameSetup);
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
        rating,
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
      if (info.role === 'spectator') continue;
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
        code:cancellation.code || 'INVITATION_CANCELLED',
        message:cancellation.message || 'Diese Einladung wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.',
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
      let playerId = authUser && authUser.id
        ? cleanPlayerId('u_' + authUser.id)
        : cleanGuestPlayerId(data.player || data.playerId || data.player_id);
      let displayName = cleanDisplayName(data.displayName || data.name);
      if (authUser && authUser.id) displayName = cleanDisplayName(authUser.username);
      const preferredRole = cleanPreferredRole(data.preferredRole || data.preferred_role || data.seatRole || data.seat_role);
      const securePlayersBeforeClaim = await this.getSecurePlayers();
      const roomAlreadyCreatedByMember = !!(securePlayersBeforeClaim.white || securePlayersBeforeClaim.black);
      const spectatorOnly = data.spectatorOnly === true || data.spectator_only === true || data.watchOnly === true || data.watch_only === true;

      if (spectatorOnly) {
        const publicGame = (await this.state.storage.get('publicGame')) === true;
        const publicGameState = (await this.state.storage.get('game')) || { started:false, ended:false };
        const storedWatchId = cleanPublicWatchId((await this.state.storage.get('publicWatchId')) || '');
        const routedWatchId = cleanPublicWatchId(info.publicWatchId || '');
        const submittedWatchId = cleanPublicWatchId(data.publicWatchId || data.public_watch_id || data.watchId || '');
        const watchAuthorized = !!(storedWatchId && routedWatchId === storedWatchId && submittedWatchId === storedWatchId);
        if (!publicGame || !publicGameState.started || publicGameState.ended || !watchAuthorized) {
          safeSend(ws, {
            type:'error',
            code:'PUBLIC_SPECTATOR_ACCESS_UNAVAILABLE',
            message:'Diese Partie ist nicht mehr öffentlich verfügbar.'
          });
          try { ws.close(4003, 'Öffentliche Zuschauerfreigabe nicht verfügbar'); } catch (_) {}
          return;
        }
        info = Object.assign({}, info, {
          playerId,
          role:'spectator',
          displayName:'Zuschauer',
          guest:true,
          userId:null,
          username:'',
          seatClaimed:true,
          viewerMode:'public',
          claimedAt:Date.now()
        });
        ws.serializeAttachment(info);
        safeSend(ws, {
          type:'hello',
          room:info.room || 'unknown',
          role:'spectator',
          displayName:'Zuschauer',
          guest:true,
          username:'',
          seatToken:'',
          spectatorMode:true,
          message:'Zuschauerzugang verbunden.',
          serverNow:Date.now()
        });
        await this.sendRoomState(ws, 'hello_state');
        await this.broadcastRoomState('lobby');
        return;
      }

      if (!roomAlreadyCreatedByMember && authUser) {
        const publicGame = data.publicGame === true || data.public_game === true;
        const openOffer = data.openOffer === true || data.open_offer === true;
        const ratedRequested = !(data.ratedRequested === false || data.rated_requested === false || data.rated === false || data.rated === 0 || data.rated === '0');
        await this.state.storage.put('publicGame', publicGame);
        await this.state.storage.put('openOffer', openOffer);
        await this.state.storage.put('openOfferStatus', openOffer ? 'open' : 'none');
        await this.state.storage.put('ratedRequested', ratedRequested);
        if (!openOffer) {
          await this.state.storage.delete('openOfferAcceptedByUserId');
          await this.state.storage.delete('openOfferAcceptedAt');
        }
        if (publicGame) {
          let publicWatchId = cleanPublicWatchId((await this.state.storage.get('publicWatchId')) || '');
          if (!publicWatchId) {
            publicWatchId = randomBase64Url(24);
            await this.state.storage.put('publicWatchId', publicWatchId);
          }
        } else {
          await this.state.storage.delete('publicWatchId');
        }
      }

      // Ein neuer Raum darf ausschließlich durch ein registriertes Mitglied eröffnet
      // werden. Sobald dieser erste accountgebundene Platz existiert, darf der zweite
      // Spieler einer Live-Partie weiterhin als Gast über den Einladungslink beitreten.
      if (!roomAlreadyCreatedByMember && !authUser) {
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
          seatCode: 'ROOM_CREATOR_ACCOUNT_REQUIRED',
          message: 'Zum Erstellen einer Partie ist ein registrierter und eingeloggter Mitglieder-Account erforderlich. Eingeladene Gäste dürfen Live-Partien weiterhin per Link beitreten.',
          serverNow: Date.now()
        });
        await this.sendRoomState(ws, 'hello_state');
        return;
      }

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
      const openOffer = (await this.state.storage.get('openOffer')) === true;
      const offerStatus = String((await this.state.storage.get('openOfferStatus')) || (openOffer ? 'open' : ''));
      const offerAcceptedByUserId = String((await this.state.storage.get('openOfferAcceptedByUserId')) || '');
      const creatorUserId = String((await this.state.storage.get('createdByUserId')) || '');
      const creatorReclaim = !!(authUser && creatorUserId && String(authUser.id) === creatorUserId);
      if (roomAlreadyCreatedByMember && openOffer && !creatorReclaim) {
        if (!authUser) {
          safeSend(ws, { type:'error', code:'OPEN_OFFER_ACCOUNT_REQUIRED', message:'Offene Partien können nur von eingeloggten Mitgliedern angenommen werden.' });
          try { ws.close(4003, 'Login erforderlich'); } catch (_) {}
          return;
        }
        if (offerStatus === 'open' || !offerAcceptedByUserId) {
          safeSend(ws, { type:'error', code:'OPEN_OFFER_ACCEPT_REQUIRED', message:'Bitte nimm dieses Partieangebot zuerst über „Offene Partien“ an.' });
          try { ws.close(4003, 'Annahme erforderlich'); } catch (_) {}
          return;
        }
        if (offerAcceptedByUserId !== String(authUser.id)) {
          safeSend(ws, { type:'error', code:'OPEN_OFFER_RESERVED', message:'Dieses Partieangebot wurde bereits von einem anderen Mitglied angenommen.' });
          try { ws.close(4003, 'Partieangebot reserviert'); } catch (_) {}
          return;
        }
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
      if (!dailyAutoStart.started) await this.syncGameIndexes();
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

    if (data.type === 'set_public_game') {
      const game = (await this.state.storage.get('game')) || { started:false, ended:false };
      if (game.ended) {
        safeSend(ws, { type:'error', code:'GAME_ALREADY_ENDED', message:'Nach Partieende kann die Zuschauerfreigabe nicht mehr geändert werden.' });
        return;
      }
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type:'error', code:'PUBLIC_GAME_PLAYERS_ONLY', message:'Zuschauer können die Zuschauerfreigabe nicht ändern.' });
        return;
      }
      const createdByRole = (await this.state.storage.get('createdByRole')) || '';
      const createdByUserId = String((await this.state.storage.get('createdByUserId')) || '');
      const isCreator = createdByUserId
        ? !!(info.userId && String(info.userId) === createdByUserId)
        : !!(createdByRole && role === createdByRole);
      if (!isCreator) {
        safeSend(ws, { type:'error', code:'ONLY_CREATOR_CAN_SET_PUBLIC_GAME', message:'Nur der Ersteller der Partie kann die Zuschauerfreigabe ändern.' });
        return;
      }

      const publicGame = data.publicGame === true || data.public_game === true;
      await this.state.storage.put('publicGame', publicGame);
      if (publicGame) {
        let publicWatchId = cleanPublicWatchId((await this.state.storage.get('publicWatchId')) || '');
        if (!publicWatchId) {
          publicWatchId = randomBase64Url(24);
          await this.state.storage.put('publicWatchId', publicWatchId);
        }
      } else {
        await this.state.storage.delete('publicWatchId');
      }

      await this.syncPublicGameIndex();
      safeSend(ws, {
        type:'public_game_ack',
        ok:true,
        messageId:data.messageId || null,
        publicGame,
        message:publicGame
          ? (game.started ? 'Die laufende Partie wurde öffentlich freigegeben.' : 'Die Partie wird nach dem Start öffentlich angezeigt.')
          : 'Die Zuschauerfreigabe wurde aufgehoben.',
        serverNow:Date.now()
      });
      await this.broadcastRoomState('room_state');
      if (!publicGame) this.disconnectPublicSpectators('Der Ersteller hat die Zuschauerfreigabe aufgehoben. Dieser Zuschauerzugang ist nicht mehr gültig.');
      return;
    }

    if (data.type === 'chat_message') {
      if(info.userId){ const moderation=await moderationStateForUser(this.env,info.userId); if(moderation.chatBlocked){ safeSend(ws,{type:'error',code:'CHAT_BLOCKED',message:'Deine Chatfunktion wurde administrativ gesperrt.'}); return; } }
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type:'error', code:'CHAT_PLAYERS_ONLY', message:'Der Partie-Chat ist ausschließlich für Weiß und Schwarz verfügbar.' });
        return;
      }
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
      const securePlayers = await this.getSecurePlayers();
      const currentSeat = role === 'w' ? securePlayers.white : role === 'b' ? securePlayers.black : null;
      const seatUserId = currentSeat && currentSeat.userId ? String(currentSeat.userId) : '';
      if (seatUserId && (!authUser || String(authUser.id) !== seatUserId)) {
        safeSend(ws, { type: 'error', code: 'ACCOUNT_NAME_PROTECTED', message: 'Der Name dieses Spielerplatzes ist an den registrierten Account gebunden.' });
        return;
      }
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
      if (!dailyAutoStart.started) await this.syncGameIndexes();
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
      if (!dailyAutoStart.started) await this.syncGameIndexes();

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
      if (!dailyAutoStart.started) await this.syncGameIndexes();

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
      const ratingMeta = await this.ratingMetaForStart(timeControl, gameSetup);
      const game = {
        ...ratingMeta,
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
      await this.state.storage.delete('ratingResult');
      this.ratingStateCache = { key:'', expiresAt:0, value:null };
      await this.state.storage.put('moves', []);
      await this.state.storage.put('clock', clock);
      await this.state.storage.delete('drawOffer');
      await this.scheduleClockAlarm(clock, now);
      await this.syncGameIndexes();

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
        await this.finalizeRatingIfNeeded(game);
        await this.syncGameIndexes();
        this.queueDailyResultNotifications(game);
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
      await this.finalizeRatingIfNeeded(game);
      await this.syncGameIndexes();
      this.queueDailyResultNotifications(game);
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
        castle: castleSideCode(validation.move) || null,
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
        await this.finalizeRatingIfNeeded(game);
      } else {
        await this.scheduleClockAlarm(clock, now);
      }
      await this.syncGameIndexes();
      if (game.ended) this.queueDailyResultNotifications(game);
      else if (timeControl.mode === 'daily') this.queueDailyTurnNotification(clock.turn, move, clock);

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

    if (url.pathname === '/internal/backup/global-chat' || url.pathname === '/internal/backup/game-room' || url.pathname === '/internal/backup/game-room-name-map') {
      if (request.method !== 'POST' || !backupRequestIsAuthorized(request, env)) return privateBackupNotFound();
      try {
        if (url.pathname === '/internal/backup/game-room-name-map') {
          const document = await durableObjectBackupRoomNameMap(env);
          return privateJson(document, {status:200});
        }
        if (url.pathname === '/internal/backup/global-chat') {
          if (!env.GLOBAL_CHAT) return privateJson({ok:false, code:'GLOBAL_CHAT_NOT_CONFIGURED', message:'Das Global-Chat-Durable-Object ist nicht konfiguriert.'}, {status:503});
          const stub = env.GLOBAL_CHAT.get(env.GLOBAL_CHAT.idFromName('members'));
          return await stub.fetch(forwardedBackupRequest(request));
        }
        if (!env.GAME_ROOM) return privateJson({ok:false, code:'GAME_ROOM_NOT_CONFIGURED', message:'Das GameRoom-Durable-Object ist nicht konfiguriert.'}, {status:503});
        const objectId = cleanDurableObjectIdForBackup(url.searchParams.get('id'));
        if (!objectId) return privateJson({ok:false, code:'INVALID_DURABLE_OBJECT_ID', message:'Die Durable-Object-ID fehlt oder ist ungültig.'}, {status:400});
        const logicalName = cleanRoomId(url.searchParams.get('room'));
        if (logicalName && String(env.GAME_ROOM.idFromName(logicalName)) !== objectId) {
          return privateJson({ok:false, code:'ROOM_ID_MISMATCH', message:'Raumkennung und Durable-Object-ID passen nicht zusammen.'}, {status:400});
        }
        const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromString(objectId));
        return await stub.fetch(forwardedBackupRequest(request, logicalName));
      } catch (error) {
        console.error('Interner Durable-Object-Export fehlgeschlagen', error && error.message ? error.message : String(error || 'unknown'));
        return privateJson({ok:false, code:'DURABLE_BACKUP_ROUTE_FAILED', message:'Der interne Durable-Object-Export konnte nicht ausgeführt werden.'}, {status:500});
      }
    }

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
      try {
        return await handleAuthApi(request, env, url);
      } catch (error) {
        console.error('API request failed', url.pathname, error && error.message ? error.message : String(error || 'unknown'));
        return json({
          ok:false,
          code:'INTERNAL_ERROR',
          message:'Die Anfrage konnte wegen eines Serverfehlers nicht abgeschlossen werden.'
        }, { status:500 });
      }
    }

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'hammerschach-gamer-lobby' });
    }

    if (url.pathname === '/watch') {
      const watchId = cleanPublicWatchId(url.searchParams.get('game'));
      if (!watchId) return new Response('Missing or invalid public game', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      try {
        if (!(await ensurePublicGamesTable(env))) throw new Error('Public game index unavailable');
        const indexed = await env.DB.prepare(
          `SELECT room_id FROM public_games
            WHERE spectator_id = ? AND public_game = 1 AND ended = 0
            LIMIT 1`
        ).bind(watchId).first();
        const room = cleanRoomId(indexed && indexed.room_id);
        if (!room) return new Response('Public game not found', { status: 404 });
        const id = env.GAME_ROOM.idFromName(room);
        const stub = env.GAME_ROOM.get(id);
        const forwardedUrl = new URL(request.url);
        forwardedUrl.pathname = '/ws';
        forwardedUrl.search = '';
        forwardedUrl.searchParams.set('room', room);
        forwardedUrl.searchParams.set('publicWatchId', watchId);
        return stub.fetch(new Request(forwardedUrl.toString(), request));
      } catch (_) {
        return new Response('Public game unavailable', { status: 503 });
      }
    }

    if (url.pathname === '/global-chat') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      if (!env.GLOBAL_CHAT) return new Response('Global chat unavailable', {status:503});
      const id = env.GLOBAL_CHAT.idFromName('members');
      const stub = env.GLOBAL_CHAT.get(id);
      return stub.fetch(request);
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
      endpoints: ['/health', '/api/register', '/api/login', 'POST /api/auth/password-reset/request', 'POST /api/auth/password-reset/confirm', 'POST /api/auth/email-verification/request', 'POST /api/auth/email-verification/confirm', '/api/logout', '/api/me', 'POST /api/account/leitbild', 'POST /api/account/username', 'POST /api/account/profile', 'POST /api/account/email', 'POST /api/account/email/resend', 'POST /api/account/notifications', 'POST /api/account/password', 'DELETE /api/account', '/api/presence', 'GET /api/tournaments', 'POST /api/tournaments', 'POST /api/tournaments/ID/publish', 'POST /api/tournaments/ID/join', 'DELETE /api/tournaments/ID/join', 'POST /api/tournaments/ID/start', '/api/public-games', '/api/open-offers', 'POST /api/open-offers/ROOM_ID', 'DELETE /api/open-offers/ROOM_ID', '/api/daily-games', '/api/daily-games/ROOM_ID/pgn', 'DELETE /api/daily-games/ROOM_ID/history', 'DELETE /api/daily-games/ROOM_ID', '/api/members/search?q=NAME', '/api/members/list', 'GET /api/members/USER_ID/profile', 'POST /api/invitations/email', '/api/stats', '/api/stats/visit', 'POST /api/moderation/report', 'POST /api/moderation/global-chat-report', 'GET /api/admin/moderation/reports', 'POST /api/admin/moderation/action', 'POST /api/admin/moderation/resolve', 'GET /api/admin/overview', 'GET /api/admin/member-message/audience', 'GET /api/admin/member-message/recipients', 'POST /api/admin/member-message/test', 'POST /api/admin/member-message/send', 'POST /api/admin/backup-mark', 'GET /api/admin/users', 'DELETE /api/admin/users/USER_ID', '/global-chat', '/ws?room=ROOM_ID', '/watch?game=PUBLIC_WATCH_ID'],
      features: ['lobby', 'roles', 'invite_color_choice', 'guest_display_names', 'accounts_d1', 'account_self_service', 'account_leitbild_onboarding', 'member_search', 'member_list', 'member_public_profiles', 'member_presence', 'daily_opponent_presence', 'in_game_presence', 'admin_user_delete', 'admin_user_delete_reauthentication', 'smtp_email_invitations', 'mailjet_email_fallback', 'time_control', 'game_start', 'move_sync', 'server_clock', 'server_move_validation', 'draw_offer', 'resignation', 'secure_seat_tokens', 'server_time_finalization', 'durable_object_clock_alarm', 'daily_chess', 'daily_game_list', 'daily_game_history', 'daily_history_archive', 'daily_pgn_download', 'daily_invitation_cancel', 'daily_open_offer_acceptance_email', 'cancelled_room_tombstone', 'registered_account_seat_reclaim', 'member_only_room_creation', 'guest_live_invite_join', 'public_running_games', 'open_game_offers', 'atomic_open_offer_acceptance', 'open_offer_withdrawal', 'runtime_public_visibility_toggle', 'spectator_only_links', 'private_player_chat', 'persistent_room_chat', 'member_global_chat', 'global_chat_presence', 'global_chat_reporting', 'global_chat_admin_delete', 'freestyle960', 'glicko2_ratings', 'six_separate_rating_pools', 'creator_rating_choice', 'provisional_rating_marker', 'verified_email_accounts', 'password_reset_by_email', 'verified_email_change', 'auth_rate_limiting', 'constant_time_login', 'auth_security_event_log', 'admin_system_overview', 'mail_delivery_log', 'admin_member_messages', 'admin_personal_member_messages', 'member_news_opt_in', 'branded_html_mail', 'admin_mail_attachments', 'manual_backup_marker', 'player_reporting', 'local_chat_mute', 'admin_moderation', 'chat_blocking', 'temporary_account_suspension', 'permanent_account_ban'],
      note: 'Diese Stufe erlaubt neue Spielräume nur für eingeloggte Mitglieder, lässt eingeladene Gäste bei Live-Partien weiterhin zu, bietet eine öffentliche Liste freigegebener Live- und Daily-Partien mit abgesichertem Zuschauerzugang und synchronisiert Lobby, Rollen, Gast-/Account-Anzeigenamen, Mitgliedersuche, Mitgliederliste mit freiwilligen Mitgliederprofilen und Online-Status, Daily-Partienübersicht, persönliche Accountverwaltung, sechs getrennte Glicko-2-Ratings, kennwortbestätigte Admin-Userlöschung, automatisch versendete SMTP-Einladungen über das Gamer-Postfach, bestätigte Mailadressen, sichere Kennwort-Wiederherstellung, gestuftes Rate-Limiting und protokollierte Sicherheitsereignisse, Bedenkzeit, Partiestart, Züge, eine servergeführte Uhr, einen dauerhaft gespeicherten Raum-Chat, einen moderierten Mitglieder-Global-Chat und prüft Züge serverseitig auf Legalität.'
    });
  }
};

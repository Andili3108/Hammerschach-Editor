// BUILD: GAMER-SCHACHLABOR-20260823-4
import { connect } from 'cloudflare:sockets';
import { handleLeagueStandingsApi } from './league-standings.js';
import { handleReaderArchivesApi } from './reader-archives.js';

const DEFAULT_GAMER_PUBLIC_URL = 'https://hammerschach-gamer.webmaster-5bb.workers.dev/';
const FAIRPLAY_RAW_DATA_VERSION = 1;
const SCHACHLABOR_FAIRPLAY_BUILD = '20260823-4';

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

const DURABLE_OBJECT_LOCATION_HINTS = new Set(['wnam','enam','weur','eeur','apac','apac-ne','apac-se','oc','afr','me','sam']);
function gameRoomStub(env, id) {
  const configuredHint = String((env && env.GAME_ROOM_LOCATION_HINT) || 'weur').trim().toLowerCase();
  const options = DURABLE_OBJECT_LOCATION_HINTS.has(configuredHint) ? { locationHint:configuredHint } : undefined;
  return options ? env.GAME_ROOM.get(id, options) : env.GAME_ROOM.get(id);
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
    'completed_games',
    'chess_chronicle_games',
    'game_reactions',
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
       last_seen_at TEXT NOT NULL,
       is_online INTEGER NOT NULL DEFAULT 1
     )`
  ).run();
  try { await env.DB.prepare(`ALTER TABLE user_presence ADD COLUMN is_online INTEGER NOT NULL DEFAULT 1`).run(); } catch (err) {
    const message = String(err && err.message || err || '').toLowerCase();
    if (!message.includes('duplicate column')) throw err;
  }
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence (last_seen_at)`).run();
  userPresenceTableReady = true;
  return true;
}

function presenceOnlineSinceIso() {
  return new Date(Date.now() - USER_PRESENCE_ONLINE_WINDOW_MS).toISOString();
}

async function setUserPresence(env, userId, online) {
  if (!(await ensureUserPresenceTable(env)) || !userId) return false;
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_presence (user_id, last_seen_at, is_online)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       is_online = excluded.is_online`
  ).bind(String(userId), nowIso, online ? 1 : 0).run();
  return true;
}

async function listOnlinePresenceMembers(env) {
  if (!(await ensureUserPresenceTable(env)) || !env || !env.DB) return [];
  const result = await env.DB.prepare(
    `SELECT users.id, users.username
      FROM user_presence presence
       JOIN users ON users.id = presence.user_id
      WHERE COALESCE(presence.is_online, 1) = 1
        AND presence.last_seen_at >= ?
      ORDER BY users.username_lc ASC`
  ).bind(presenceOnlineSinceIso()).all();
  return (result && result.results ? result.results : []).map(row => ({
    userId:String(row.id || ''),
    name:cleanDisplayName(row.username) || 'Mitglied',
    isAdmin:isAdminUser(row, env)
  })).filter(member => !!member.userId);
}

function normalizeMemberActivityFilter(value) {
  const filter = String(value || '').trim().toLowerCase();
  return ['online', '24h', '7d'].includes(filter) ? filter : 'all';
}

function normalizeMemberSort(value) {
  return String(value || '').trim().toLowerCase() === 'name' ? 'name' : 'activity';
}

let memberFavoritesTableReady = false;

async function ensureMemberFavoritesTable(env) {
  if (!env || !env.DB) return false;
  if (memberFavoritesTableReady) return true;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS member_favorites (
         owner_user_id TEXT NOT NULL,
         favorite_user_id TEXT NOT NULL,
         created_at TEXT NOT NULL,
         PRIMARY KEY (owner_user_id, favorite_user_id)
       )`
    ),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_member_favorites_target ON member_favorites (favorite_user_id)`)
  ]);
  memberFavoritesTableReady = true;
  return true;
}

function normalizeMemberFavoritesOnly(value) {
  return value === true || ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase());
}

const PRIVATE_MESSAGE_MAX_LENGTH = 1500;
const PRIVATE_MESSAGE_MAX_RECIPIENTS = 25;
let privateMessagesTablesReady = false;

async function ensurePrivateMessagesTables(env) {
  if (!env || !env.DB) return false;
  if (privateMessagesTablesReady) return true;
  // D1: Zuerst die Tabellen anlegen und erst danach die Indizes.
  // So kann die erstmalige Initialisierung nicht daran scheitern, dass ein
  // Index-Statement vorbereitet wird, bevor seine Tabelle verfügbar ist.
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS private_messages (
         id TEXT PRIMARY KEY,
         sender_user_id TEXT NOT NULL,
         text TEXT NOT NULL,
         created_at TEXT NOT NULL
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS private_message_recipients (
         message_id TEXT NOT NULL,
         recipient_user_id TEXT NOT NULL,
         read_at TEXT,
         created_at TEXT NOT NULL,
         PRIMARY KEY (message_id, recipient_user_id)
       )`
    )
  ]);
  await env.DB.batch([
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_private_messages_sender_created ON private_messages (sender_user_id, created_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_private_message_recipients_user_created ON private_message_recipients (recipient_user_id, created_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_private_message_recipients_unread ON private_message_recipients (recipient_user_id, read_at, created_at DESC)`)
  ]);
  privateMessagesTablesReady = true;
  return true;
}

function cleanPrivateMessageText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, PRIVATE_MESSAGE_MAX_LENGTH);
}

function cleanPrivateMessageRecipientIds(value, senderUserId) {
  const source = Array.isArray(value) ? value : (value ? [value] : []);
  const senderId = String(senderUserId || '').trim();
  const seen = new Set();
  const result = [];
  for (const item of source) {
    const id = cleanPublicProfileUserId(item);
    if (!id || id === senderId || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= PRIVATE_MESSAGE_MAX_RECIPIENTS) break;
  }
  return result;
}

async function privateMessageUnreadCount(env, userId) {
  if (!(await ensurePrivateMessagesTables(env))) return 0;
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM private_message_recipients WHERE recipient_user_id = ? AND read_at IS NULL`
  ).bind(String(userId)).first();
  return Math.max(0, Number(row && row.count || 0));
}

async function listPrivateMessages(env, userId, limit = 100) {
  if (!(await ensurePrivateMessagesTables(env))) return {messages:[], unreadCount:0};
  const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limit || 100))));
  const me = String(userId || '');
  const result = await env.DB.prepare(
    `WITH conversation_messages AS (
       SELECT message.id,
              message.text,
              message.created_at,
              message.sender_user_id,
              message.sender_user_id AS other_user_id,
              sender.username AS other_username,
              'incoming' AS direction,
              CASE WHEN recipient.read_at IS NULL THEN 1 ELSE 0 END AS unread
         FROM private_message_recipients recipient
         JOIN private_messages message ON message.id = recipient.message_id
         LEFT JOIN users sender ON sender.id = message.sender_user_id
        WHERE recipient.recipient_user_id = ?
       UNION ALL
       SELECT message.id,
              message.text,
              message.created_at,
              message.sender_user_id,
              recipient.recipient_user_id AS other_user_id,
              other.username AS other_username,
              'outgoing' AS direction,
              0 AS unread
         FROM private_messages message
         JOIN private_message_recipients recipient ON recipient.message_id = message.id
         LEFT JOIN users other ON other.id = recipient.recipient_user_id
        WHERE message.sender_user_id = ?
     ), ranked AS (
       SELECT *,
              ROW_NUMBER() OVER (PARTITION BY other_user_id ORDER BY created_at DESC, id DESC) AS row_num,
              MAX(unread) OVER (PARTITION BY other_user_id) AS has_unread
         FROM conversation_messages
     )
     SELECT id, text, created_at, other_user_id, other_username, direction, has_unread
       FROM ranked
      WHERE row_num = 1
      ORDER BY created_at DESC, id DESC
      LIMIT ?`
  ).bind(me, me, safeLimit).all();
  const messages = (result && Array.isArray(result.results) ? result.results : []).map(row => {
    const otherUser = {
      id:String(row.other_user_id || ''),
      username:cleanDisplayName(row.other_username) || 'Gelöschter Benutzer'
    };
    const unread = Number(row.has_unread || 0) > 0;
    return {
      id:otherUser.id,
      otherUser,
      sender:otherUser,
      direction:String(row.direction || '') === 'outgoing' ? 'outgoing' : 'incoming',
      text:String(row.text || ''),
      createdAt:row.created_at || null,
      unread,
      readAt:unread ? null : (row.created_at || null)
    };
  });
  return {messages, unreadCount:await privateMessageUnreadCount(env, userId)};
}

async function sendPrivateMessage(env, senderUser, recipientIds, text) {
  if (!(await ensurePrivateMessagesTables(env))) {
    return {ok:false, status:503, code:'PRIVATE_MESSAGES_UNAVAILABLE', message:'Persönliche Nachrichten sind momentan nicht verfügbar.'};
  }
  await ensureAccountSecurityTables(env);
  const messageText = cleanPrivateMessageText(text);
  if (!messageText) return {ok:false, status:400, code:'EMPTY_PRIVATE_MESSAGE', message:'Bitte eine Nachricht eingeben.'};
  const requestedIds = cleanPrivateMessageRecipientIds(recipientIds, senderUser && senderUser.id);
  if (!requestedIds.length) return {ok:false, status:400, code:'PRIVATE_MESSAGE_RECIPIENT_REQUIRED', message:'Bitte mindestens ein Mitglied auswählen.'};
  const senderId = String(senderUser && senderUser.id || '');
  const minuteSince = new Date(Date.now() - 60 * 1000).toISOString();
  const daySince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [minuteRow, dayRow] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM private_messages WHERE sender_user_id = ? AND created_at >= ?`).bind(senderId, minuteSince).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM private_messages WHERE sender_user_id = ? AND created_at >= ?`).bind(senderId, daySince).first()
  ]);
  if (Number(minuteRow && minuteRow.count || 0) >= 12) return {ok:false, status:429, code:'PRIVATE_MESSAGE_RATE_LIMIT', message:'Bitte warte kurz, bevor du weitere Nachrichten sendest.'};
  if (Number(dayRow && dayRow.count || 0) >= 200) return {ok:false, status:429, code:'PRIVATE_MESSAGE_DAILY_LIMIT', message:'Das Nachrichtenlimit für heute ist erreicht.'};
  const placeholders = requestedIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(
    `SELECT users.id, users.username
       FROM users
       LEFT JOIN user_email_status email_status ON email_status.user_id = users.id
      WHERE users.id IN (${placeholders})
        AND (
          email_status.user_id IS NULL
          OR (LOWER(COALESCE(email_status.email, '')) = users.email_lc AND email_status.verified = 1)
        )`
  ).bind(...requestedIds).all();
  const recipients = (rows && Array.isArray(rows.results) ? rows.results : []).map(row => ({id:String(row.id || ''), username:cleanDisplayName(row.username) || 'Mitglied'}));
  const found = new Set(recipients.map(item => item.id));
  const missingCount = requestedIds.filter(id => !found.has(id)).length;
  if (!recipients.length) return {ok:false, status:409, code:'PRIVATE_MESSAGE_RECIPIENTS_UNAVAILABLE', message:'Die Anmeldung der ausgewählten Person ist noch nicht abgeschlossen.'};
  const messageId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const statements = [
    env.DB.prepare(`INSERT INTO private_messages (id, sender_user_id, text, created_at) VALUES (?, ?, ?, ?)`)
      .bind(messageId, String(senderUser.id), messageText, nowIso)
  ];
  for (const recipient of recipients) {
    statements.push(
      env.DB.prepare(`INSERT INTO private_message_recipients (message_id, recipient_user_id, read_at, created_at) VALUES (?, ?, NULL, ?)`)
        .bind(messageId, recipient.id, nowIso)
    );
  }
  await env.DB.batch(statements);
  return {
    ok:true,
    messageId,
    recipients,
    sentCount:recipients.length,
    skippedCount:missingCount,
    createdAt:nowIso,
    message:recipients.length === 1
      ? `Nachricht an ${recipients[0].username} wurde gesendet.`
      : `Nachricht wurde an ${recipients.length} Mitglieder gesendet.`
  };
}

async function privateMessageConversation(env, userId, otherUserId, limit = 200) {
  if (!(await ensurePrivateMessagesTables(env))) return {messages:[]};
  const me = cleanPublicProfileUserId(userId);
  const other = cleanPublicProfileUserId(otherUserId);
  if (!me || !other || me === other) return {messages:[]};
  const safeLimit = Math.max(1, Math.min(300, Math.floor(Number(limit || 200))));
  const result = await env.DB.prepare(
    `SELECT message.id, message.text, message.created_at, message.sender_user_id,
            recipient.recipient_user_id, recipient.read_at,
            sender.username AS sender_username
       FROM private_messages message
       JOIN private_message_recipients recipient ON recipient.message_id = message.id
       LEFT JOIN users sender ON sender.id = message.sender_user_id
      WHERE (message.sender_user_id = ? AND recipient.recipient_user_id = ?)
         OR (message.sender_user_id = ? AND recipient.recipient_user_id = ?)
      ORDER BY message.created_at ASC
      LIMIT ?`
  ).bind(me, other, other, me, safeLimit).all();
  const messages = (result && Array.isArray(result.results) ? result.results : []).map(row => ({
    id:String(row.id || ''),
    direction:String(row.sender_user_id || '') === me ? 'outgoing' : 'incoming',
    sender:{id:String(row.sender_user_id || ''), username:cleanDisplayName(row.sender_username) || (String(row.sender_user_id || '') === me ? 'Du' : 'Gelöschter Benutzer')},
    text:String(row.text || ''),
    createdAt:row.created_at || null,
    readAt:row.read_at || null
  }));
  return {messages};
}

async function markPrivateConversationRead(env, userId, otherUserId) {
  if (!(await ensurePrivateMessagesTables(env))) return {ok:false, status:503, code:'PRIVATE_MESSAGES_UNAVAILABLE', message:'Persönliche Nachrichten sind momentan nicht verfügbar.'};
  const me = cleanPublicProfileUserId(userId);
  const other = cleanPublicProfileUserId(otherUserId);
  if (!me || !other || me === other) return {ok:false, status:400, code:'INVALID_PRIVATE_CONVERSATION', message:'Der Nachrichtenverlauf konnte nicht zugeordnet werden.'};
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE private_message_recipients
        SET read_at = COALESCE(read_at, ?)
      WHERE recipient_user_id = ?
        AND message_id IN (SELECT id FROM private_messages WHERE sender_user_id = ?)`
  ).bind(nowIso, me, other).run();
  return {ok:true, readAt:nowIso, unreadCount:await privateMessageUnreadCount(env, me)};
}

async function markPrivateMessageRead(env, userId, messageId) {
  if (!(await ensurePrivateMessagesTables(env))) return {ok:false, status:503, code:'PRIVATE_MESSAGES_UNAVAILABLE', message:'Persönliche Nachrichten sind momentan nicht verfügbar.'};
  const cleanId = String(messageId || '').trim();
  if (!cleanId) return {ok:false, status:400, code:'INVALID_PRIVATE_MESSAGE', message:'Die Nachricht konnte nicht zugeordnet werden.'};
  const nowIso = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE private_message_recipients SET read_at = COALESCE(read_at, ?) WHERE message_id = ? AND recipient_user_id = ?`
  ).bind(nowIso, cleanId, String(userId)).run();
  const changes = Number(result && result.meta && result.meta.changes || 0);
  if (!changes) return {ok:false, status:404, code:'PRIVATE_MESSAGE_NOT_FOUND', message:'Die Nachricht wurde nicht gefunden.'};
  return {ok:true, readAt:nowIso, unreadCount:await privateMessageUnreadCount(env, userId)};
}

async function setMemberFavorite(env, ownerUserId, targetUserId, favorite) {
  const ownerId = cleanPublicProfileUserId(ownerUserId);
  const targetId = cleanPublicProfileUserId(targetUserId);
  if (!ownerId || !targetId) {
    return {ok:false, status:400, code:'INVALID_USER_ID', message:'Das Lieblingsmitglied konnte nicht eindeutig zugeordnet werden.'};
  }
  if (ownerId === targetId) {
    return {ok:false, status:400, code:'CANNOT_FAVORITE_SELF', message:'Das eigene Profil muss nicht als Lieblingsmitglied markiert werden.'};
  }
  if (!(await ensureMemberFavoritesTable(env))) {
    return {ok:false, status:503, code:'DB_NOT_CONFIGURED', message:'Die Lieblingsmitglieder sind momentan nicht verfügbar.'};
  }
  const target = await env.DB.prepare(`SELECT id, username, email FROM users WHERE id = ? LIMIT 1`).bind(targetId).first();
  if (!target) return {ok:false, status:404, code:'USER_NOT_FOUND', message:'Das Mitglied wurde nicht gefunden.'};
  const targetEmailSecurity = await getUserEmailSecurityState(env, target);
  if (!targetEmailSecurity.emailVerified) {
    return {ok:false, status:409, code:'MEMBER_REGISTRATION_PENDING', message:'Die Anmeldung dieses Mitglieds ist noch nicht abgeschlossen.'};
  }
  if (favorite) {
    await env.DB.prepare(
      `INSERT INTO member_favorites (owner_user_id, favorite_user_id, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(owner_user_id, favorite_user_id) DO UPDATE SET created_at = excluded.created_at`
    ).bind(ownerId, targetId, new Date().toISOString()).run();
  } else {
    await env.DB.prepare(
      `DELETE FROM member_favorites WHERE owner_user_id = ? AND favorite_user_id = ?`
    ).bind(ownerId, targetId).run();
  }
  return {ok:true, member:{id:String(target.id || targetId), username:target.username || ''}, favorite:!!favorite};
}

function memberActivityFilterSql(filter, publicProfileAlias = 'public_profile', presenceAlias = 'presence') {
  const visible = `COALESCE(${publicProfileAlias}.show_activity_status, 1) = 1`;
  const online = `COALESCE(${presenceAlias}.is_online, 1) = 1`;
  if (filter === 'online') return { sql:`AND ${visible} AND ${online} AND ${presenceAlias}.last_seen_at >= ?`, since:presenceOnlineSinceIso() };
  if (filter === '24h') return { sql:`AND ${visible} AND ${presenceAlias}.last_seen_at >= ?`, since:new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() };
  if (filter === '7d') return { sql:`AND ${visible} AND ${presenceAlias}.last_seen_at >= ?`, since:new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() };
  return { sql:'', since:null };
}

function publicMemberActivityFields(row) {
  const activityVisible = !row || row.activity_visible === undefined || Number(row.activity_visible) === 1;
  return {
    isOnline:activityVisible && Number(row && row.is_online || 0) === 1,
    activityVisible,
    lastActiveAt:activityVisible && row && row.last_active_at ? row.last_active_at : null
  };
}

function publicMemberRegistrationFields(row) {
  const registrationComplete = Number(row && row.registration_complete || 0) === 1;
  return {
    registrationComplete,
    interactionAllowed:registrationComplete,
    registrationStatus:registrationComplete ? 'active' : 'pending_confirmation'
  };
}

async function searchMembers(env, sessionUser, query, options = {}) {
  const cleaned = cleanMemberSearchQuery(query);
  if (!env || !env.DB || !sessionUser || cleaned.length < 2) return [];
  await ensureUserPresenceTable(env);
  await ensureUserPublicProfilesTable(env);
  await ensureMemberFavoritesTable(env);
  await ensureAccountSecurityTables(env);

  const escaped = escapeSqlLike(cleaned);
  const contains = '%' + escaped + '%';
  const prefix = escaped + '%';
  const onlineSince = presenceOnlineSinceIso();
  const activityFilter = normalizeMemberActivityFilter(options.activity);
  const memberSort = normalizeMemberSort(options.sort);
  const favoritesOnly = normalizeMemberFavoritesOnly(options.favoritesOnly);
  const activityWhere = memberActivityFilterSql(activityFilter);
  const orderSql = memberSort === 'name'
    ? `registration_complete DESC, is_favorite DESC, CASE WHEN users.username_lc = ? THEN 0 WHEN users.username_lc LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, users.username_lc ASC`
    : `registration_complete DESC, is_favorite DESC, is_online DESC, CASE WHEN last_active_at IS NULL THEN 1 ELSE 0 END, last_active_at DESC, CASE WHEN users.username_lc = ? THEN 0 WHEN users.username_lc LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, users.username_lc ASC`;
  const result = await env.DB.prepare(
    `SELECT users.id, users.username, users.created_at,
            CASE WHEN COALESCE(public_profile.show_activity_status, 1) = 1
                       AND COALESCE(presence.is_online, 1) = 1
                       AND presence.last_seen_at >= ? THEN 1 ELSE 0 END AS is_online,
            COALESCE(public_profile.show_activity_status, 1) AS activity_visible,
            CASE WHEN COALESCE(public_profile.show_activity_status, 1) = 1 THEN presence.last_seen_at ELSE NULL END AS last_active_at,
            CASE WHEN COALESCE(public_profile.avatar_key, '') <> '' THEN 1 ELSE 0 END AS has_avatar,
            public_profile.avatar_updated_at,
            CASE WHEN member_favorite.favorite_user_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite,
            CASE
              WHEN email_status.user_id IS NULL THEN 1
              WHEN LOWER(COALESCE(email_status.email, '')) = users.email_lc AND email_status.verified = 1 THEN 1
              ELSE 0
            END AS registration_complete
       FROM users
       LEFT JOIN user_presence presence ON presence.user_id = users.id
       LEFT JOIN user_public_profiles public_profile ON public_profile.user_id = users.id
       LEFT JOIN user_email_status email_status ON email_status.user_id = users.id
       LEFT JOIN member_favorites member_favorite
         ON member_favorite.owner_user_id = ? AND member_favorite.favorite_user_id = users.id
      WHERE users.id <> ?
        AND (users.username_lc LIKE ? ESCAPE '\\' OR users.email_lc LIKE ? ESCAPE '\\')
        ${favoritesOnly ? 'AND member_favorite.favorite_user_id IS NOT NULL' : ''}
        ${activityWhere.sql}
      ORDER BY ${orderSql}
      LIMIT 8`
  ).bind(onlineSince, sessionUser.id, sessionUser.id, contains, contains, ...(activityWhere.since ? [activityWhere.since] : []), cleaned, prefix).all();

  return (result && result.results ? result.results : []).map(row => ({
    id: row.id,
    username: row.username,
    createdAt: row.created_at || null,
    ...publicMemberActivityFields(row),
    ...publicMemberRegistrationFields(row),
    hasAvatar: Number(row.has_avatar || 0) === 1,
    avatarUpdatedAt: row.avatar_updated_at || null,
    favorite:Number(row.is_favorite || 0) === 1
  }));
}



async function listMembers(env, sessionUser, limit = 50, options = {}) {
  if (!env || !env.DB || !sessionUser) return [];
  await ensureUserPresenceTable(env);
  await ensureUserPublicProfilesTable(env);
  await ensureMemberFavoritesTable(env);
  await ensureAccountSecurityTables(env);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit || 50))));
  const onlineSince = presenceOnlineSinceIso();
  const activityFilter = normalizeMemberActivityFilter(options.activity);
  const memberSort = normalizeMemberSort(options.sort);
  const favoritesOnly = normalizeMemberFavoritesOnly(options.favoritesOnly);
  const activityWhere = memberActivityFilterSql(activityFilter);
  const orderSql = memberSort === 'name'
    ? 'registration_complete DESC, is_favorite DESC, users.username_lc ASC'
    : 'registration_complete DESC, is_favorite DESC, is_online DESC, CASE WHEN last_active_at IS NULL THEN 1 ELSE 0 END, last_active_at DESC, users.username_lc ASC';
  const result = await env.DB.prepare(
    `SELECT users.id, users.username, users.created_at,
            CASE WHEN COALESCE(public_profile.show_activity_status, 1) = 1
                       AND COALESCE(presence.is_online, 1) = 1
                       AND presence.last_seen_at >= ? THEN 1 ELSE 0 END AS is_online,
            COALESCE(public_profile.show_activity_status, 1) AS activity_visible,
            CASE WHEN COALESCE(public_profile.show_activity_status, 1) = 1 THEN presence.last_seen_at ELSE NULL END AS last_active_at,
            CASE WHEN COALESCE(public_profile.avatar_key, '') <> '' THEN 1 ELSE 0 END AS has_avatar,
            public_profile.avatar_updated_at,
            CASE WHEN member_favorite.favorite_user_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite,
            CASE
              WHEN email_status.user_id IS NULL THEN 1
              WHEN LOWER(COALESCE(email_status.email, '')) = users.email_lc AND email_status.verified = 1 THEN 1
              ELSE 0
            END AS registration_complete
       FROM users
       LEFT JOIN user_presence presence ON presence.user_id = users.id
       LEFT JOIN user_public_profiles public_profile ON public_profile.user_id = users.id
       LEFT JOIN user_email_status email_status ON email_status.user_id = users.id
       LEFT JOIN member_favorites member_favorite
         ON member_favorite.owner_user_id = ? AND member_favorite.favorite_user_id = users.id
      WHERE users.id <> ?
        ${favoritesOnly ? 'AND member_favorite.favorite_user_id IS NOT NULL' : ''}
        ${activityWhere.sql}
      ORDER BY ${orderSql}
      LIMIT ?`
  ).bind(onlineSince, sessionUser.id, sessionUser.id, ...(activityWhere.since ? [activityWhere.since] : []), safeLimit).all();

  return (result && result.results ? result.results : []).map(row => ({
    id: row.id,
    username: row.username,
    createdAt: row.created_at || null,
    ...publicMemberActivityFields(row),
    ...publicMemberRegistrationFields(row),
    hasAvatar: Number(row.has_avatar || 0) === 1,
    avatarUpdatedAt: row.avatar_updated_at || null,
    favorite:Number(row.is_favorite || 0) === 1
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
       show_activity_status INTEGER NOT NULL DEFAULT 1,
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
    ['avatar_updated_at', `ALTER TABLE user_public_profiles ADD COLUMN avatar_updated_at TEXT`],
    ['show_activity_status', `ALTER TABLE user_public_profiles ADD COLUMN show_activity_status INTEGER NOT NULL DEFAULT 1`]
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
  const showActivityStatus = !(body && body.showActivityStatus === false);
  return { ok:true, profile:{ realName, clubName, dwz, about, showActivityStatus } };
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
    return { realName:'', clubName:'', dwz:null, about:'', showActivityStatus:true, hasAvatar:false, avatarUpdatedAt:null, updatedAt:null };
  }
  const row = await env.DB.prepare(
    `SELECT real_name, club_name, dwz, about, avatar_key, avatar_updated_at, show_activity_status, updated_at
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
    showActivityStatus:!row || Number(row.show_activity_status) !== 0,
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
  if (!input || typeof input.showActivityStatus !== 'boolean') {
    const currentProfile = await getUserPublicProfile(env, id);
    profile.showActivityStatus = currentProfile.showActivityStatus !== false;
  }
  const avatar = await getUserAvatarRecord(env, id);
  if (!profile.realName && !profile.clubName && profile.dwz === null && !profile.about && !avatar.key && profile.showActivityStatus) {
    await env.DB.prepare(`DELETE FROM user_public_profiles WHERE user_id = ?`).bind(id).run();
    return { ok:true, profile:{ realName:'', clubName:'', dwz:null, about:'', showActivityStatus:true, hasAvatar:false, avatarUpdatedAt:null, updatedAt:null } };
  }
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_public_profiles (user_id, real_name, club_name, dwz, about, show_activity_status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       real_name = excluded.real_name,
       club_name = excluded.club_name,
       dwz = excluded.dwz,
       about = excluded.about,
       show_activity_status = excluded.show_activity_status,
       updated_at = excluded.updated_at`
  ).bind(id, profile.realName, profile.clubName, profile.dwz, profile.about, profile.showActivityStatus ? 1 : 0, updatedAt).run();
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
    `SELECT real_name, club_name, dwz, about, avatar_key, show_activity_status
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
  const hasProfileData = !!(
    cleanPublicProfileRealName(profileRow.real_name) ||
    cleanPublicProfileClub(profileRow.club_name) ||
    (profileRow.dwz !== null && profileRow.dwz !== undefined && String(profileRow.dwz).trim() !== '') ||
    cleanPublicProfileAbout(profileRow.about) ||
    Number(profileRow.show_activity_status) === 0
  );
  if (hasProfileData) {
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
  await ensureUserPublicProfilesTable(env);
  await ensureAccountSecurityTables(env);
  const onlineSince = presenceOnlineSinceIso();
  const row = await env.DB.prepare(
    `SELECT users.id, users.username, users.created_at,
            CASE WHEN COALESCE(public_profile.show_activity_status, 1) = 1
                       AND COALESCE(presence.is_online, 1) = 1
                       AND presence.last_seen_at >= ? THEN 1 ELSE 0 END AS is_online,
            COALESCE(public_profile.show_activity_status, 1) AS activity_visible,
            CASE WHEN COALESCE(public_profile.show_activity_status, 1) = 1 THEN presence.last_seen_at ELSE NULL END AS last_active_at,
            CASE
              WHEN email_status.user_id IS NULL THEN 1
              WHEN LOWER(COALESCE(email_status.email, '')) = users.email_lc AND email_status.verified = 1 THEN 1
              ELSE 0
            END AS registration_complete
       FROM users
       LEFT JOIN user_presence presence ON presence.user_id = users.id
       LEFT JOIN user_public_profiles public_profile ON public_profile.user_id = users.id
       LEFT JOIN user_email_status email_status ON email_status.user_id = users.id
      WHERE users.id = ?
      LIMIT 1`
  ).bind(onlineSince, id).first();
  if (!row) return null;
  return {
    id:row.id,
    username:row.username,
    createdAt:row.created_at || null,
    ...publicMemberActivityFields(row),
    ...publicMemberRegistrationFields(row),
    profile:await getUserPublicProfile(env, row.id),
    ratings:publicMemberRatingsPayload(await getUserRatings(env, row.id))
  };
}



const INVITATION_EMAIL_MIN_INTERVAL_MS = 20 * 1000;
const INVITATION_EMAIL_DUPLICATE_WINDOW_MS = 5 * 60 * 1000;
const INVITATION_EMAIL_SENDER_HOURLY_LIMIT = 20;
const INVITATION_EMAIL_RECIPIENT_HOURLY_LIMIT = 12;
const INVITATION_PERSONAL_MESSAGE_MAX_LENGTH = 300;
let invitationEmailLogTableReady = false;

function normalizeInvitationPersonalMessage(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function validateInvitationPersonalMessage(value, label = 'Die persönliche Nachricht') {
  const message = normalizeInvitationPersonalMessage(value);
  if (message.length > INVITATION_PERSONAL_MESSAGE_MAX_LENGTH) {
    return {
      ok:false,
      status:400,
      code:'INVITATION_MESSAGE_TOO_LONG',
      message:`${label} darf höchstens ${INVITATION_PERSONAL_MESSAGE_MAX_LENGTH} Zeichen lang sein.`
    };
  }
  return { ok:true, message };
}

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

function gamerDailyInvitationUrl(env, roomId) {
  const configured = configuredGamerPublicUrl(env);
  if (!configured) return '';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    url.hash = '';
    url.search = '';
    url.searchParams.set('dailyInvite', roomId);
    return url.toString();
  } catch (_) {
    return '';
  }
}

function gamerRematchInvitationUrl(env, offerId) {
  const configured = configuredGamerPublicUrl(env);
  const cleanOfferId = cleanRematchOfferId(offerId);
  if (!configured || !cleanOfferId) return '';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    url.hash = '';
    url.search = '';
    url.searchParams.set('rematch', cleanOfferId);
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
  const personalMessageResult = validateInvitationPersonalMessage(payload && payload.personalMessage, 'Die persönliche Nachricht');
  if (!personalMessageResult.ok) return personalMessageResult;
  const personalMessage = personalMessageResult.message;
  if (!recipientEmail || !inviteUrl) {
    return { ok:false, status:400, code:'INVALID_INVITATION_MAIL', message:'Die Einladungsmail konnte nicht vorbereitet werden.' };
  }

  const subject = daily
    ? `${senderName} lädt dich zu einer Daily-Partie ein`
    : `${senderName} lädt dich zu einer Schachpartie ein`;
  const detailLines = [];
  if (variantLabel) detailLines.push(`Spielmodus: ${variantLabel}`);
  if (timeLabel) detailLines.push(`Bedenkzeit: ${timeLabel}`);
  detailLines.push(`Wertung: ${rated ? 'Gewertet' : 'Ungewertet'}`);
  const detailText = detailLines.length ? `\n\n${detailLines.join('\n')}` : '';
  const personalText = personalMessage ? `\n\nPersönliche Nachricht von ${senderName}:\n${personalMessage}` : '';
  const decisionText = daily
    ? '\n\nDie Partie wurde noch nicht gestartet. Öffne die Einladung, um sie im Hammerschach-Gamer anzunehmen oder abzulehnen. Erst nach deiner Annahme wird die Daily-Partie automatisch gestartet.'
    : '';
  const textPart = `Hallo ${recipientName},\n\n${senderName} lädt dich zu einer ${daily ? 'Daily-Partie' : 'Schachpartie'} auf Hammerschach ein.${personalText}${detailText}${decisionText}\n\n${daily ? 'Einladung ansehen' : 'Partie öffnen'}:\n${inviteUrl}\n\nDiese Nachricht wurde automatisch vom Hammerschach-Gamer versendet.\n\nViele Grüße\nHammerschach-Gamer`;

  const detailHtml = detailLines.length
    ? `<div style="margin:18px 0;padding:12px 14px;background:#f6f1f2;border:1px solid #e5d3d6;border-radius:10px;line-height:1.55;">${detailLines.map(line => escapeEmailHtml(line)).join('<br>')}</div>`
    : '';
  const personalHtml = personalMessage
    ? `<div style="margin:18px 0;padding:14px 16px;background:#fff9e9;border:1px solid #e8cf96;border-radius:12px;line-height:1.55;"><div style="font-size:12px;font-weight:bold;color:#843f46;margin-bottom:5px;">Persönliche Nachricht von ${escapeEmailHtml(senderName)}</div><div style="white-space:pre-wrap;word-break:break-word;">${escapeEmailHtml(personalMessage)}</div></div>`
    : '';
  const decisionHtml = daily
    ? '<p><strong>Die Partie wurde noch nicht gestartet.</strong> Öffne die Einladung, um sie im Hammerschach-Gamer anzunehmen oder abzulehnen. Erst nach deiner Annahme wird die Daily-Partie automatisch gestartet.</p>'
    : '';
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><h2 style="margin:0 0 18px;color:#843f46;">Einladung zu einer ${daily ? 'Daily-Partie' : 'Schachpartie'}</h2><p>Hallo ${escapeEmailHtml(recipientName)},</p><p><strong>${escapeEmailHtml(senderName)}</strong> lädt dich zu einer ${daily ? 'Daily-Partie' : 'Schachpartie'} auf Hammerschach ein.</p>${personalHtml}${detailHtml}${decisionHtml}<p style="margin:22px 0;"><a href="${escapeEmailHtml(inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">${daily ? 'Einladung ansehen' : 'Partie öffnen'}</a></p><p style="font-size:13px;color:#666;word-break:break-all;">Falls die Schaltfläche nicht funktioniert:<br>${escapeEmailHtml(inviteUrl)}</p><hr style="border:0;border-top:1px solid #eee;margin:22px 0;"><p style="font-size:12px;color:#777;">Diese Nachricht wurde automatisch vom Hammerschach-Gamer versendet.</p><p style="margin-bottom:0;">Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;

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

function smtpHeloName(env) {
  let heloName = 'hammerschach-gamer';
  try {
    const publicUrl = configuredGamerPublicUrl(env);
    if (publicUrl) heloName = new URL(publicUrl).hostname.replace(/[^A-Za-z0-9.-]/g, '') || heloName;
  } catch (_) {}
  return heloName;
}

async function deliverSmtpMail(env, mail, settings, port) {
  let socket = null;
  let reader = null;
  let writer = null;
  let stage = 'connect';
  try {
    const usesStartTls = port === 587;
    socket = connect(
      { hostname:settings.host, port },
      { secureTransport:usesStartTls ? 'starttls' : 'on', allowHalfOpen:false }
    );
    await withTimeout(socket.opened, 12000, 'SMTP-Verbindung konnte nicht rechtzeitig aufgebaut werden.');
    reader = socket.readable.getReader();
    writer = socket.writable.getWriter();
    let state = { buffer:'', decoder:new TextDecoder() };

    stage = 'greeting';
    await smtpCommand(writer, reader, state, null, 220);
    stage = 'ehlo';
    await smtpCommand(writer, reader, state, `EHLO ${smtpHeloName(env)}`, 250);

    if (usesStartTls) {
      stage = 'starttls';
      await smtpCommand(writer, reader, state, 'STARTTLS', 220);
      try { writer.releaseLock(); } catch (_) {}
      try { reader.releaseLock(); } catch (_) {}
      writer = null;
      reader = null;
      socket = socket.startTls();
      stage = 'tls-upgrade';
      await withTimeout(socket.opened, 12000, 'Die sichere SMTP-Verbindung konnte nicht aufgebaut werden.');
      reader = socket.readable.getReader();
      writer = socket.writable.getWriter();
      state = { buffer:'', decoder:new TextDecoder() };
      stage = 'ehlo-secure';
      await smtpCommand(writer, reader, state, `EHLO ${smtpHeloName(env)}`, 250);
    }

    stage = 'auth-start';
    await smtpCommand(writer, reader, state, 'AUTH LOGIN', 334);
    stage = 'auth-username';
    await smtpCommand(writer, reader, state, utf8ToBase64(settings.username), 334, { sensitive:true });
    stage = 'auth-password';
    await smtpCommand(writer, reader, state, utf8ToBase64(settings.password), 235, { sensitive:true });
    stage = 'envelope-from';
    await smtpCommand(writer, reader, state, `MAIL FROM:<${settings.fromEmail}>`, 250);
    stage = 'recipient';
    await smtpCommand(writer, reader, state, `RCPT TO:<${mail.recipientEmail}>`, [250, 251]);
    stage = 'data-command';
    await smtpCommand(writer, reader, state, 'DATA', 354);

    const mime = buildSmtpMimeMessage(mail, settings.fromEmail, settings.fromName);
    const smtpData = dotStuffSmtpData(mime.raw) + '\r\n.';
    stage = 'data-body';
    await smtpCommand(writer, reader, state, smtpData, 250, { sensitive:true, timeoutMs:mail.attachments && mail.attachments.length ? 60000 : 20000 });
    stage = 'quit';
    try { await smtpCommand(writer, reader, state, 'QUIT', 221, { timeoutMs:5000 }); } catch (_) {}

    return { ok:true, status:200, provider:'smtp', messageId:mime.messageId, transportPort:port };
  } catch (error) {
    try { error.smtpStage = stage; } catch (_) {}
    throw error;
  } finally {
    try { if (writer) writer.releaseLock(); } catch (_) {}
    try { if (reader) reader.releaseLock(); } catch (_) {}
    try { if (socket) await socket.close(); } catch (_) {}
  }
}

function shouldTrySmtpStartTlsFallback(error, port) {
  if (port !== 465 || error && error.smtpCode) return false;
  return ['connect', 'greeting', 'ehlo'].includes(String(error && error.smtpStage || ''));
}

function smtpFailureResult(error) {
  const code = String(error && error.smtpCode || '');
  const stage = String(error && error.smtpStage || '');
  const detail = String(error && error.message || '');
  if (code === '535' || code === '534' || stage.startsWith('auth-')) {
    return { ok:false, status:502, code:'SMTP_AUTH_FAILED', message:'Die Anmeldung am IONOS-Postfach ist fehlgeschlagen. Bitte Benutzername und Postfachkennwort prüfen.' };
  }
  if (['550', '551', '553'].includes(code) && stage === 'recipient') {
    return { ok:false, status:502, code:'SMTP_RECIPIENT_REJECTED', message:'Der IONOS-Mailserver hat die Empfängeradresse abgelehnt.' };
  }
  if (['550', '551', '553'].includes(code) && stage === 'envelope-from') {
    return { ok:false, status:502, code:'SMTP_SENDER_REJECTED', message:'Der IONOS-Mailserver hat die konfigurierte Absenderadresse abgelehnt.' };
  }
  if (code === '552') {
    return { ok:false, status:502, code:'SMTP_MESSAGE_TOO_LARGE', message:'Der IONOS-Mailserver hat die E-Mail wegen ihrer Größe abgelehnt.' };
  }
  if (stage === 'data-body' && code) {
    return { ok:false, status:502, code:'SMTP_MESSAGE_REJECTED', message:'Der IONOS-Mailserver hat den Inhalt der E-Mail abgelehnt.' };
  }
  if (code.startsWith('4')) {
    return { ok:false, status:502, code:'SMTP_TEMPORARY_FAILURE', message:'Der IONOS-Mailserver ist vorübergehend nicht verfügbar. Die E-Mail kann später erneut versucht werden.' };
  }
  if (/Zeitüberschreitung|zu lange|nicht rechtzeitig/i.test(detail)) {
    return { ok:false, status:502, code:'SMTP_TIMEOUT', message:'Der IONOS-Mailserver hat nicht rechtzeitig geantwortet.' };
  }
  if (['connect', 'greeting', 'ehlo', 'starttls', 'tls-upgrade', 'ehlo-secure'].includes(stage)) {
    return { ok:false, status:502, code:'SMTP_CONNECTION_FAILED', message:'Die sichere Verbindung zum IONOS-Mailserver konnte nicht aufgebaut werden.' };
  }
  return { ok:false, status:502, code:'SMTP_SEND_FAILED', message:'Die E-Mail konnte über das IONOS-Postfach nicht versendet werden.' };
}

async function sendSmtpInvitation(env, payload) {
  const settings = {
    host:String((env && env.SMTP_HOST) || '').trim(),
    port:Number((env && env.SMTP_PORT) || 465),
    username:String((env && env.SMTP_USERNAME) || '').trim(),
    password:String((env && env.SMTP_PASSWORD) || ''),
    fromEmail:'',
    fromName:cleanDisplayName((env && env.SMTP_FROM_NAME) || '') || 'Hammerschach-Gamer'
  };
  settings.fromEmail = normalizeEmail((env && env.SMTP_FROM_EMAIL) || settings.username);
  if (!settings.host || !Number.isInteger(settings.port) || !settings.username || !settings.password || !settings.fromEmail) {
    return { ok:false, status:503, code:'SMTP_NOT_CONFIGURED', message:'Der SMTP-Mailversand ist noch nicht vollständig konfiguriert.' };
  }
  if (![465, 587].includes(settings.port)) {
    return { ok:false, status:503, code:'SMTP_PORT_UNSUPPORTED', message:'Der SMTP-Versand unterstützt Port 465 mit SSL/TLS und Port 587 mit STARTTLS.' };
  }

  const mail = preparedMailFromPayload(payload, env);
  if (!mail.ok) return mail;

  const ports = settings.port === 465 ? [465, 587] : [587];
  let lastError = null;
  for (const attemptPort of ports) {
    try {
      return await deliverSmtpMail(env, mail, settings, attemptPort);
    } catch (error) {
      lastError = error;
      console.error(
        'SMTP invitation failed',
        `port=${attemptPort}`,
        `stage=${String(error && error.smtpStage || 'unknown')}`,
        error && error.message ? error.message : String(error || 'unknown'),
        error && error.smtpResponse ? error.smtpResponse : ''
      );
      if (!shouldTrySmtpStartTlsFallback(error, attemptPort)) break;
    }
  }
  return smtpFailureResult(lastError);
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

function prepareDailyInvitationResponseEmail(payload) {
  const recipientEmail = normalizeEmail(payload && payload.recipientEmail);
  const recipientName = cleanDisplayName(payload && payload.recipientName) || 'Schachfreund';
  const responderName = cleanDisplayName(payload && payload.responderName) || 'Das eingeladene Mitglied';
  const accepted = payload && payload.action === 'accept';
  const responseMessageResult = validateInvitationPersonalMessage(payload && payload.responseMessage, 'Die persönliche Antwort');
  if (!responseMessageResult.ok) return responseMessageResult;
  const responseMessage = responseMessageResult.message;
  const inviteUrl = String(payload && payload.inviteUrl || '').trim();
  if (!recipientEmail || !inviteUrl) {
    return { ok:false, status:400, code:'INVALID_DAILY_INVITATION_RESPONSE_MAIL', message:'Die Antwortbenachrichtigung konnte nicht vorbereitet werden.' };
  }
  const actionLabel = accepted ? 'angenommen' : 'abgelehnt';
  const subject = `${responderName} hat deine Daily-Einladung ${actionLabel}`;
  const responseText = responseMessage ? `\n\nPersönliche Antwort von ${responderName}:\n${responseMessage}` : '';
  const nextText = accepted
    ? '\n\nDie Partie wird vorbereitet und kann anschließend über „Meine Partien“ geöffnet werden.'
    : '\n\nDie Einladung ist damit beendet. Die persönliche Antwort bleibt für dich unter „Meine Partien“ sichtbar.';
  const textPart = `Hallo ${recipientName},\n\n${responderName} hat deine Daily-Einladung ${actionLabel}.${responseText}${nextText}\n\nHammerschach-Gamer öffnen:\n${inviteUrl}\n\nViele Grüße\nHammerschach-Gamer`;
  const responseHtml = responseMessage
    ? `<div style="margin:18px 0;padding:14px 16px;background:#fff9e9;border:1px solid #e8cf96;border-radius:12px;line-height:1.55;"><div style="font-size:12px;font-weight:bold;color:#843f46;margin-bottom:5px;">Persönliche Antwort von ${escapeEmailHtml(responderName)}</div><div style="white-space:pre-wrap;word-break:break-word;">${escapeEmailHtml(responseMessage)}</div></div>`
    : '';
  const nextHtml = accepted
    ? '<p>Die Partie wird vorbereitet und kann anschließend über <strong>„Meine Partien“</strong> geöffnet werden.</p>'
    : '<p>Die Einladung ist damit beendet. Die persönliche Antwort bleibt für dich unter <strong>„Meine Partien“</strong> sichtbar.</p>';
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><h2 style="margin:0 0 18px;color:#843f46;">Daily-Einladung ${accepted ? 'angenommen' : 'abgelehnt'}</h2><p>Hallo ${escapeEmailHtml(recipientName)},</p><p><strong>${escapeEmailHtml(responderName)}</strong> hat deine Daily-Einladung ${actionLabel}.</p>${responseHtml}${nextHtml}<p style="margin:22px 0;"><a href="${escapeEmailHtml(inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">Hammerschach-Gamer öffnen</a></p><p style="font-size:13px;color:#666;word-break:break-all;">Falls die Schaltfläche nicht funktioniert:<br>${escapeEmailHtml(inviteUrl)}</p><p style="margin-bottom:0;">Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return { ok:true, mailType:'daily_invitation_response', recipientEmail, recipientName, subject, textPart, htmlPart };
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

function prepareRematchRequestEmail(payload) {
  const recipientEmail = normalizeEmail(payload && payload.recipientEmail);
  const recipientName = cleanDisplayName(payload && payload.recipientName) || 'Schachfreund';
  const opponentName = cleanDisplayName(payload && payload.opponentName) || 'dein Gegner';
  const inviteUrl = String(payload && payload.inviteUrl || '').trim();
  const timeLabel = String(payload && payload.timeLabel || '').slice(0, 120);
  const variantLabel = String(payload && payload.variantLabel || '').slice(0, 120);
  if (!recipientEmail || !inviteUrl) {
    return { ok:false, status:400, code:'INVALID_REMATCH_MAIL', message:'Die Revanche-Mail konnte nicht vorbereitet werden.' };
  }
  const details = [];
  if (variantLabel) details.push(`Spielmodus: ${variantLabel}`);
  if (timeLabel) details.push(`Bedenkzeit: ${timeLabel}`);
  const detailText = details.length ? `\n\n${details.join('\n')}` : '';
  const subject = `${opponentName} bietet dir eine Revanche an`;
  const textPart = `Hallo ${recipientName},\n\n${opponentName} möchte nach eurer gerade beendeten Partie eine Revanche spielen.${detailText}\n\nRevanche ansehen und beantworten:\n${inviteUrl}\n\nDie neue Partie wird erst erstellt, wenn du die Revanche im Hammerschach-Gamer annimmst.\n\nViele Grüße\nHammerschach-Gamer`;
  const detailHtml = details.length
    ? `<div style="margin:18px 0;padding:12px 14px;background:#f6f1f2;border:1px solid #e5d3d6;border-radius:10px;line-height:1.55;">${details.map(line => escapeEmailHtml(line)).join('<br>')}</div>`
    : '';
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><h2 style="margin:0 0 18px;color:#843f46;">Revanche angeboten</h2><p>Hallo ${escapeEmailHtml(recipientName)},</p><p><strong>${escapeEmailHtml(opponentName)}</strong> möchte nach eurer gerade beendeten Partie eine Revanche spielen.</p>${detailHtml}<p style="margin:22px 0;"><a href="${escapeEmailHtml(inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">Revanche beantworten</a></p><p style="font-size:13px;color:#666;word-break:break-all;">Falls die Schaltfläche nicht funktioniert:<br>${escapeEmailHtml(inviteUrl)}</p><hr style="border:0;border-top:1px solid #eee;margin:22px 0;"><p style="font-size:12px;color:#777;">Die neue Partie wird erst nach deiner Annahme erstellt.</p><p style="margin-bottom:0;">Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return { ok:true, mailType:'rematch_request', recipientEmail, recipientName, subject, textPart, htmlPart };
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

async function sendDailyInvitationResponseEmailNotification(env, payload) {
  const recipient = await loadEmailNotificationRecipient(env, payload && payload.recipientUserId, null);
  if (!recipient.ok) return { ok:true, skipped:true, reason:recipient.reason };
  const claim = await claimEmailNotification(env, payload.notificationKey, 'daily_invitation_response', recipient.user.id, payload.roomId);
  if (!claim.claimed) return { ok:true, skipped:true, reason:claim.reason };
  let result;
  try {
    const mail = prepareDailyInvitationResponseEmail({ ...payload, recipientEmail:recipient.email, recipientName:recipient.user.username });
    result = await sendPreparedTransactionalEmail(env, mail);
  } catch (error) {
    result = { ok:false, code:'DAILY_INVITATION_RESPONSE_MAIL_FAILED', message:error && error.message ? error.message : 'Antwortbenachrichtigung fehlgeschlagen.' };
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

async function sendRematchRequestEmailNotification(env, payload) {
  const recipient = await loadEmailNotificationRecipient(env, payload && payload.recipientUserId, null);
  if (!recipient.ok) return { ok:true, skipped:true, reason:recipient.reason };
  const claim = await claimEmailNotification(env, payload.notificationKey, 'rematch_request', recipient.user.id, payload.roomId);
  if (!claim.claimed) return { ok:true, skipped:true, reason:claim.reason };
  let result;
  try {
    const mail = prepareRematchRequestEmail({
      ...payload,
      recipientEmail:recipient.email,
      recipientName:recipient.user.username
    });
    result = await sendPreparedTransactionalEmail(env, mail);
  } catch (error) {
    result = { ok:false, code:'REMATCH_MAIL_FAILED', message:error && error.message ? error.message : 'Revanche-Mail fehlgeschlagen.' };
  }
  try { await completeEmailNotification(env, claim.key, result); } catch (_) {}
  return result;
}

let rematchOffersTableReady = false;
function cleanRematchOfferId(value) {
  const id = String(value || '').trim();
  return /^rm_[A-Za-z0-9_-]{8,80}$/.test(id) ? id : '';
}
async function ensureRematchOffersTable(env) {
  if (!env || !env.DB) return false;
  if (rematchOffersTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS rematch_offers (
       offer_id TEXT PRIMARY KEY,
       source_room_id TEXT NOT NULL UNIQUE,
       requester_user_id TEXT NOT NULL,
       requester_name TEXT NOT NULL,
       target_user_id TEXT NOT NULL,
       target_name TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'pending',
       mode TEXT NOT NULL DEFAULT 'live',
       time_label TEXT,
       variant TEXT NOT NULL DEFAULT 'standard',
       position_id INTEGER,
       rated INTEGER NOT NULL DEFAULT 1,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       responded_at TEXT,
       new_room_id TEXT
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_rematch_offers_requester ON rematch_offers (requester_user_id, status, updated_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_rematch_offers_target ON rematch_offers (target_user_id, status, updated_at)`).run();
  rematchOffersTableReady = true;
  return true;
}
async function saveRematchOfferIndex(env, sourceRoomId, offer, timeControl, gameSetup, ratedRequested) {
  const offerId = cleanRematchOfferId(offer && offer.id);
  const roomId = cleanRoomId(sourceRoomId);
  if (!offerId || !roomId || !(await ensureRematchOffersTable(env))) return false;
  const setup = cleanGameSetup(gameSetup || null);
  const control = cleanTimeControl(timeControl || null);
  const createdAt = offer.createdAt || new Date().toISOString();
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO rematch_offers
       (offer_id, source_room_id, requester_user_id, requester_name, target_user_id, target_name,
        status, mode, time_label, variant, position_id, rated, created_at, updated_at, responded_at, new_room_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_room_id) DO UPDATE SET
       offer_id = excluded.offer_id,
       requester_user_id = excluded.requester_user_id,
       requester_name = excluded.requester_name,
       target_user_id = excluded.target_user_id,
       target_name = excluded.target_name,
       status = excluded.status,
       mode = excluded.mode,
       time_label = excluded.time_label,
       variant = excluded.variant,
       position_id = excluded.position_id,
       rated = excluded.rated,
       updated_at = excluded.updated_at,
       responded_at = excluded.responded_at,
       new_room_id = excluded.new_room_id`
  ).bind(
    offerId, roomId,
    String(offer.requestedByUserId || ''), cleanDisplayName(offer.requestedByName || '') || 'Mitglied',
    String(offer.targetUserId || ''), cleanDisplayName(offer.targetName || '') || 'Mitglied',
    String(offer.status || 'pending'), control && control.mode === 'daily' ? 'daily' : 'live',
    invitationTimeLabel(control), setup.variant, setup.variant === GAME_VARIANT_FREESTYLE ? Number(setup.positionId) : null,
    ratedRequested === false ? 0 : 1, createdAt, updatedAt,
    offer.respondedAt || null, cleanRoomId(offer.roomId) || null
  ).run();
  return true;
}
function rematchOfferDto(row, userId) {
  const incoming = String(row && row.target_user_id || '') === String(userId || '');
  return {
    offerId:cleanRematchOfferId(row && row.offer_id),
    sourceRoomId:cleanRoomId(row && row.source_room_id),
    direction:incoming ? 'incoming' : 'outgoing',
    opponentName:cleanDisplayName(incoming ? row && row.requester_name : row && row.target_name) || 'Gegner',
    requestedByName:cleanDisplayName(row && row.requester_name) || 'Mitglied',
    status:String(row && row.status || 'pending'),
    mode:row && row.mode === 'daily' ? 'daily' : 'live',
    timeLabel:String(row && row.time_label || '').slice(0, 120),
    variant:row && row.variant === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD,
    positionId:row && row.position_id != null ? Number(row.position_id) : null,
    rated:Number(row && row.rated || 0) === 1,
    createdAt:row && row.created_at || null
  };
}
async function listOpenRematchOffers(env, sessionUser) {
  if (!(await ensureRematchOffersTable(env))) return [];
  const userId = String(sessionUser && sessionUser.id || '');
  const result = await env.DB.prepare(
    `SELECT * FROM rematch_offers
      WHERE status IN ('pending', 'creating')
        AND (requester_user_id = ? OR target_user_id = ?)
      ORDER BY created_at DESC
      LIMIT 100`
  ).bind(userId, userId).all();
  return (result && Array.isArray(result.results) ? result.results : []).map(row => rematchOfferDto(row, userId));
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
       invitation_status TEXT,
       invitation_responded_at TEXT,
       invitation_message TEXT,
       invitation_response_message TEXT,
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
       draw_offer_by_role TEXT,
       draw_offer_at TEXT,
       draw_claim_by_role TEXT,
       draw_claim_threefold INTEGER NOT NULL DEFAULT 0,
       draw_claim_fifty_move INTEGER NOT NULL DEFAULT 0,
       rated INTEGER NOT NULL DEFAULT 1
     )`
  ).run();
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN invited_user_id TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN invited_name TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN invitation_status TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN invitation_responded_at TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN invitation_message TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN invitation_response_message TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN draw_offer_by_role TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN draw_offer_at TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN draw_claim_by_role TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN draw_claim_threefold INTEGER NOT NULL DEFAULT 0`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE daily_games ADD COLUMN draw_claim_fifty_move INTEGER NOT NULL DEFAULT 0`).run(); } catch (_) {}
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
  await ensureCompletedGamesTable(env);
  await ensureTournamentTables(env);
  await ensureInvitationEmailLogTable(env);
  await ensureUserPresenceTable(env);
  await ensureGameReactionsTable(env);
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
            daily_games.invited_user_id, daily_games.invitation_status, daily_games.invitation_responded_at,
            daily_games.invitation_message, daily_games.invitation_response_message,
            daily_games.time_label, daily_games.days_per_move, daily_games.variant, daily_games.started,
            daily_games.started_at, daily_games.updated_at, daily_games.turn,
            daily_games.deadline_at, daily_games.ended, daily_games.ended_at,
            daily_games.result, daily_games.end_reason, daily_games.draw_offer_by_role, daily_games.draw_offer_at, daily_games.draw_claim_by_role, daily_games.draw_claim_threefold, daily_games.draw_claim_fifty_move, daily_games.rated,
            completed_game.pgn AS completed_pgn,
            CASE WHEN my_moment.room_id IS NULL THEN 0 ELSE 1 END AS favorite,
            my_moment.note AS moment_note,
            my_moment.created_at AS moment_created_at,
            my_reaction.reaction AS my_reaction,
            opponent_reaction.reaction AS opponent_reaction,
            tournament_game.tournament_id, tournament_game.round_number, tournament_game.pairing_number, tournament_game.game_number,
            tournament_game.group_name AS tournament_group_name, tournament_game.pairing_label AS tournament_pairing_label,
            tournament.name AS tournament_name, tournament.mode AS tournament_mode,
            tournament_round.position_id AS tournament_position_id, tournament_round.stage AS tournament_round_stage,
            tournament_round.label AS tournament_round_label,
            CASE WHEN COALESCE(opponent_presence.is_online, 1) = 1 AND opponent_presence.last_seen_at >= ? THEN 1 ELSE 0 END AS opponent_online
       FROM daily_games
       LEFT JOIN users white_account ON white_account.id = daily_games.white_user_id
       LEFT JOIN users black_account ON black_account.id = daily_games.black_user_id
       LEFT JOIN users invited_account ON invited_account.id = daily_games.invited_user_id
       LEFT JOIN completed_games completed_game ON completed_game.room_id = daily_games.room_id
       LEFT JOIN game_archive_favorites my_moment
         ON my_moment.room_id = daily_games.room_id
        AND my_moment.user_id = ?
       LEFT JOIN tournament_games tournament_game ON tournament_game.room_id = daily_games.room_id
       LEFT JOIN tournaments tournament ON tournament.id = tournament_game.tournament_id
       LEFT JOIN tournament_rounds tournament_round
         ON tournament_round.tournament_id = tournament_game.tournament_id
        AND tournament_round.round_number = tournament_game.round_number
       LEFT JOIN game_reactions my_reaction
         ON my_reaction.room_id = daily_games.room_id
        AND my_reaction.sender_user_id = ?
       LEFT JOIN game_reactions opponent_reaction
         ON opponent_reaction.room_id = daily_games.room_id
        AND opponent_reaction.sender_user_id = CASE
              WHEN daily_games.white_user_id = ? THEN daily_games.black_user_id
              WHEN daily_games.black_user_id = ? THEN daily_games.white_user_id
              ELSE ''
            END
       LEFT JOIN user_presence opponent_presence
         ON opponent_presence.user_id = CASE
              WHEN daily_games.white_user_id = ? THEN daily_games.black_user_id
              ELSE daily_games.white_user_id
            END
      WHERE (
        daily_games.white_user_id = ?
        OR daily_games.black_user_id = ?
        OR (
          daily_games.invited_user_id = ?
          AND COALESCE(daily_games.invitation_status, 'pending') = 'pending'
        )
      )
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
  ).bind(
    sessionUser.id, onlineSince,
    sessionUser.id,
    sessionUser.id, sessionUser.id, sessionUser.id,
    sessionUser.id,
    sessionUser.id, sessionUser.id, sessionUser.id, sessionUser.id, sessionUser.id
  ).all();

  return (result && result.results ? result.results : []).map(row => {
    const sessionUserId = String(sessionUser.id || '');
    const role = String(row.white_user_id || '') === sessionUserId
      ? 'w'
      : String(row.black_user_id || '') === sessionUserId ? 'b' : '';
    const incomingInvitation = !role
      && String(row.invited_user_id || '') === sessionUserId
      && String(row.invitation_status || 'pending') === 'pending';
    const turn = row.turn === 'b' ? 'b' : row.turn === 'w' ? 'w' : '';
    const opponentJoined = role === 'w' ? !!row.black_user_id : role === 'b' ? !!row.white_user_id : false;
    const joinedOpponentName = role === 'w'
      ? row.black_name
      : role === 'b' ? row.white_name : (row.white_user_id ? row.white_name : row.black_name);
    const invitedOpponentName = cleanDisplayName(row.invited_name || '');
    const invitationStatus = String(row.invitation_status || (row.invited_user_id ? 'pending' : ''));
    const isInvitationRecipient = !!row.invited_user_id && String(row.invited_user_id || '') === sessionUserId;
    return {
      roomId: row.room_id,
      role,
      opponentName: joinedOpponentName || invitedOpponentName || 'noch offen',
      invitedOpponentName,
      incomingInvitation,
      invitationStatus,
      invitationDeclined: !!role && invitationStatus === 'declined',
      invitationRespondedAt:row.invitation_responded_at || null,
      invitationMessage:normalizeInvitationPersonalMessage(row.invitation_message || ''),
      invitationResponseMessage:normalizeInvitationPersonalMessage(row.invitation_response_message || ''),
      isInvitationRecipient,
      isInvitationCreator:!!role && !!row.invited_user_id && !isInvitationRecipient,
      opponentJoined,
      opponentOnline: opponentJoined && !row.ended && Number(row.opponent_online || 0) === 1,
      pendingInvitation: !incomingInvitation && !row.started && !row.ended && !opponentJoined,
      canDeleteInvitation: !!role && !row.started && !row.ended && !opponentJoined && invitationStatus !== 'accepted',
      canRespondInvitation:incomingInvitation,
      timeLabel: row.time_label || ((row.days_per_move || 1) + ' Tag(e) pro Zug'),
      daysPerMove: Math.max(1, Number(row.days_per_move || 1)),
      variant: row.variant || 'standard',
      started: !!row.started,
      startedAt: row.started_at || null,
      updatedAt: row.updated_at || null,
      turn,
      isMyTurn: !!role && !row.ended && !!row.started && turn === role,
      deadlineAt: row.ended ? null : (row.deadline_at || null),
      ended: !!row.ended,
      endedAt: row.ended_at || null,
      result: row.result || '*',
      endReason: row.end_reason || null,
      drawOfferByRole:row.draw_offer_by_role === 'w' || row.draw_offer_by_role === 'b' ? row.draw_offer_by_role : '',
      drawOfferAt:row.draw_offer_at || null,
      incomingDrawOffer:!!role && !row.ended && (row.draw_offer_by_role === 'w' || row.draw_offer_by_role === 'b') && row.draw_offer_by_role !== role,
      outgoingDrawOffer:!!role && !row.ended && row.draw_offer_by_role === role,
      drawClaimByRole:row.draw_claim_by_role === 'w' || row.draw_claim_by_role === 'b' ? row.draw_claim_by_role : '',
      drawClaimThreefold:Number(row.draw_claim_threefold || 0) === 1,
      drawClaimFiftyMove:Number(row.draw_claim_fifty_move || 0) === 1,
      drawClaimAvailable:!!role && !row.ended && row.draw_claim_by_role === role && (Number(row.draw_claim_threefold || 0) === 1 || Number(row.draw_claim_fifty_move || 0) === 1),
      favorite:Number(row.favorite || 0) === 1,
      momentNote:cleanGameMomentNote(row.moment_note),
      momentAt:row.moment_created_at || null,
      reactionAvailable:!!role && !!row.ended && !!row.white_user_id && !!row.black_user_id && String(row.white_user_id) !== String(row.black_user_id),
      myReaction:cleanGameReaction(row.my_reaction),
      opponentReaction:cleanGameReaction(row.opponent_reaction),
      startSummary:gameStartSummaryFromPgn(row.completed_pgn, row.variant),
      rated: Number(row.rated || 0) === 1,
      tournamentId:row.tournament_id || '',
      tournamentName:cleanTournamentName(row.tournament_name || ''),
      tournamentMode:row.tournament_id ? normalizeTournamentMode(row.tournament_mode) : '',
      tournamentModeLabel:row.tournament_id ? tournamentModeLabel(row.tournament_mode) : '',
      tournamentRound:row.tournament_id ? Number(row.round_number || 0) : null,
      tournamentRoundStage:row.tournament_id ? String(row.tournament_round_stage || '') : '',
      tournamentRoundLabel:row.tournament_id ? String(row.tournament_round_label || '') : '',
      tournamentPairing:row.tournament_id ? Number(row.pairing_number || 0) : null,
      tournamentPairingLabel:row.tournament_id ? String(row.tournament_pairing_label || '') : '',
      tournamentGroupName:row.tournament_id ? String(row.tournament_group_name || '') : '',
      tournamentGameNumber:row.tournament_id ? Number(row.game_number || 0) : null,
      tournamentPositionId:row.tournament_position_id === null || row.tournament_position_id === undefined ? null : Number(row.tournament_position_id),
      isTournamentGame:!!row.tournament_id
    };
  });
}


const TOURNAMENT_PLAYERS_BY_MODE = Object.freeze({
  single_round_robin:Object.freeze([4, 6, 8]),
  double_round_robin:Object.freeze([4, 6, 8]),
  swiss:Object.freeze([8, 12, 16, 24, 32]),
  groups_knockout:Object.freeze([8, 16, 32]),
  knockout:Object.freeze([4, 8, 16, 32])
});
const TOURNAMENT_MODE_ARENA = 'arena';
const TOURNAMENT_TYPE_DAILY = 'daily';
const TOURNAMENT_TYPE_RAPID = 'rapid';
const TOURNAMENT_TYPE_BLITZ = 'blitz';
const TOURNAMENT_LIVE_MAX_PLAYERS = Object.freeze([8, 12, 16, 24, 32]);
const TOURNAMENT_ARENA_DURATIONS = Object.freeze([60, 90, 120, 180, 240, 1440]);
const TOURNAMENT_LIVE_TIME_CONTROLS = Object.freeze({
  rapid:Object.freeze({
    '600+5':'Rapid · 10 Min + 5 Sek/Zug',
    '900+10':'Rapid · 15 Min + 10 Sek/Zug',
    '1500+10':'Rapid · 25 Min + 10 Sek/Zug',
    '1800+0':'Rapid · 30 Min ohne Inkrement'
  }),
  blitz:Object.freeze({
    '180+2':'Blitz · 3 Min + 2 Sek/Zug',
    '300+0':'Blitz · 5 Min ohne Inkrement',
    '300+3':'Blitz · 5 Min + 3 Sek/Zug',
    '600+0':'Blitz · 10 Min ohne Inkrement'
  })
});
const TOURNAMENT_ALLOWED_HOURS = Object.freeze([24, 48, 72]);
const ARENA_REPAIR_DELAY_MS = 10000;
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
       theme_json TEXT,
       tournament_type TEXT NOT NULL DEFAULT 'daily',
       time_key TEXT,
       time_label TEXT,
       scheduled_start_at TEXT,
       arena_duration_minutes INTEGER,
       arena_ends_at TEXT,
       arena_closed_at TEXT,
       scheduler_room_id TEXT,
       round_pause_seconds INTEGER NOT NULL DEFAULT 60,
       next_round_at TEXT,
       mode TEXT NOT NULL DEFAULT 'double_round_robin',
       status TEXT NOT NULL DEFAULT 'draft',
       created_by_user_id TEXT NOT NULL,
       current_round INTEGER NOT NULL DEFAULT 0,
       total_rounds INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       published_at TEXT,
       started_at TEXT,
       ended_at TEXT,
       publication_mail_sent_at TEXT,
       full_notification_sent_at TEXT
     )`
  ).run();
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN publication_mail_sent_at TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN full_notification_sent_at TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN mode TEXT NOT NULL DEFAULT 'double_round_robin'`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN tournament_type TEXT NOT NULL DEFAULT 'daily'`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN time_key TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN time_label TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN scheduled_start_at TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN arena_duration_minutes INTEGER`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN arena_ends_at TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN arena_closed_at TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN scheduler_room_id TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN round_pause_seconds INTEGER NOT NULL DEFAULT 60`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN next_round_at TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournaments ADD COLUMN theme_json TEXT`).run(); } catch (_) {}
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tournament_participants (
       tournament_id TEXT NOT NULL,
       user_id TEXT NOT NULL,
       status TEXT NOT NULL,
       group_name TEXT,
       checked_in_at TEXT,
       arena_active INTEGER NOT NULL DEFAULT 0,
       arena_joined_at TEXT,
       arena_waiting_since TEXT,
       arena_pairing_not_before TEXT,
       joined_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (tournament_id, user_id)
     )`
  ).run();
  try { await env.DB.prepare(`ALTER TABLE tournament_participants ADD COLUMN group_name TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournament_participants ADD COLUMN checked_in_at TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournament_participants ADD COLUMN arena_active INTEGER NOT NULL DEFAULT 0`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournament_participants ADD COLUMN arena_joined_at TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournament_participants ADD COLUMN arena_waiting_since TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournament_participants ADD COLUMN arena_pairing_not_before TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournament_participants ADD COLUMN knockout_seed INTEGER`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournament_participants ADD COLUMN start_rating INTEGER`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournament_participants ADD COLUMN start_rating_type TEXT`).run(); } catch (_) {}
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tournament_rounds (
       tournament_id TEXT NOT NULL,
       round_number INTEGER NOT NULL,
       position_id INTEGER,
       back_rank TEXT,
       status TEXT NOT NULL,
       stage TEXT NOT NULL DEFAULT 'round',
       label TEXT,
       started_at TEXT,
       ended_at TEXT,
       PRIMARY KEY (tournament_id, round_number)
     )`
  ).run();
  try { await env.DB.prepare(`ALTER TABLE tournament_rounds ADD COLUMN stage TEXT NOT NULL DEFAULT 'round'`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournament_rounds ADD COLUMN label TEXT`).run(); } catch (_) {}
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
       group_name TEXT,
       pairing_label TEXT,
       result TEXT NOT NULL DEFAULT '*',
       end_reason TEXT,
       created_at TEXT NOT NULL,
       ended_at TEXT
     )`
  ).run();
  try { await env.DB.prepare(`ALTER TABLE tournament_games ADD COLUMN group_name TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE tournament_games ADD COLUMN pairing_label TEXT`).run(); } catch (_) {}
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tournament_knockout_results (
       tournament_id TEXT NOT NULL,
       round_number INTEGER NOT NULL,
       pairing_number INTEGER NOT NULL,
       first_user_id TEXT NOT NULL,
       second_user_id TEXT NOT NULL,
       first_score REAL NOT NULL,
       second_score REAL NOT NULL,
       first_rating INTEGER NOT NULL,
       second_rating INTEGER NOT NULL,
       winner_user_id TEXT NOT NULL,
       loser_user_id TEXT NOT NULL,
       resolution TEXT NOT NULL,
       resolved_at TEXT NOT NULL,
       PRIMARY KEY (tournament_id, round_number, pairing_number)
     )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tournament_byes (
       tournament_id TEXT NOT NULL,
       round_number INTEGER NOT NULL,
       user_id TEXT NOT NULL,
       points REAL NOT NULL DEFAULT 1,
       created_at TEXT NOT NULL,
       PRIMARY KEY (tournament_id, round_number),
       UNIQUE (tournament_id, round_number, user_id)
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
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tournament_participants_arena ON tournament_participants (tournament_id, arena_active, arena_waiting_since)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tournament_participants_arena_ready ON tournament_participants (tournament_id, arena_active, arena_pairing_not_before, arena_waiting_since)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tournament_games_round ON tournament_games (tournament_id, round_number, status)`),
    env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_games_slot ON tournament_games (tournament_id, round_number, pairing_number, game_number)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tournament_games_white ON tournament_games (white_user_id, status)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tournament_games_black ON tournament_games (black_user_id, status)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tournament_knockout_results_round ON tournament_knockout_results (tournament_id, round_number, pairing_number)`)
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

function tournamentThemeFromRow(row) {
  if (!row || !row.theme_json) return null;
  try { return cleanThemeDefinition(JSON.parse(String(row.theme_json))); } catch (_) { return null; }
}

const TOURNAMENT_MODE_SINGLE = 'single_round_robin';
const TOURNAMENT_MODE_DOUBLE = 'double_round_robin';
const TOURNAMENT_MODE_SWISS = 'swiss';
const TOURNAMENT_MODE_GROUPS = 'groups_knockout';
const TOURNAMENT_MODE_KNOCKOUT = 'knockout';

function normalizeTournamentMode(value) {
  const mode = String(value || '').toLowerCase();
  return [TOURNAMENT_MODE_SINGLE, TOURNAMENT_MODE_DOUBLE, TOURNAMENT_MODE_SWISS, TOURNAMENT_MODE_GROUPS, TOURNAMENT_MODE_KNOCKOUT, TOURNAMENT_MODE_ARENA].includes(mode)
    ? mode
    : TOURNAMENT_MODE_DOUBLE;
}

function tournamentModeLabel(value) {
  const mode = normalizeTournamentMode(value);
  if (mode === TOURNAMENT_MODE_SINGLE) return 'Einfaches Rundenturnier';
  if (mode === TOURNAMENT_MODE_SWISS) return 'Schweizer System';
  if (mode === TOURNAMENT_MODE_GROUPS) return 'Gruppenphase + K.-o.';
  if (mode === TOURNAMENT_MODE_KNOCKOUT) return 'K.-o.-Turnier';
  if (mode === TOURNAMENT_MODE_ARENA) return 'Arena';
  return 'Doppelrundenturnier';
}

function normalizeTournamentType(value) {
  const type = String(value || '').trim().toLowerCase();
  return [TOURNAMENT_TYPE_DAILY, TOURNAMENT_TYPE_RAPID, TOURNAMENT_TYPE_BLITZ].includes(type) ? type : TOURNAMENT_TYPE_DAILY;
}

function tournamentTypeLabel(value) {
  const type = normalizeTournamentType(value);
  if (type === TOURNAMENT_TYPE_RAPID) return 'Rapid';
  if (type === TOURNAMENT_TYPE_BLITZ) return 'Blitz';
  return 'Daily';
}

function tournamentIsLive(value) {
  return normalizeTournamentType(value && typeof value === 'object' ? value.tournament_type : value) !== TOURNAMENT_TYPE_DAILY;
}

function normalizeTournamentTimeKey(typeValue, keyValue) {
  const type = normalizeTournamentType(typeValue);
  if (type === TOURNAMENT_TYPE_DAILY) return '';
  const controls = TOURNAMENT_LIVE_TIME_CONTROLS[type] || {};
  const key = String(keyValue || '');
  return Object.prototype.hasOwnProperty.call(controls, key) ? key : Object.keys(controls)[0];
}

function tournamentTimeLabel(typeValue, keyValue, hoursValue) {
  const type = normalizeTournamentType(typeValue);
  if (type === TOURNAMENT_TYPE_DAILY) return Number(hoursValue || 24) + ' Stunden pro Zug';
  const key = normalizeTournamentTimeKey(type, keyValue);
  return String((TOURNAMENT_LIVE_TIME_CONTROLS[type] || {})[key] || key);
}

function tournamentTimeControl(tournamentRow) {
  const type = normalizeTournamentType(tournamentRow && tournamentRow.tournament_type);
  if (type === TOURNAMENT_TYPE_DAILY) {
    const hours = TOURNAMENT_ALLOWED_HOURS.includes(Number(tournamentRow && tournamentRow.hours_per_move)) ? Number(tournamentRow.hours_per_move) : 24;
    return {key:String(hours * 3600) + '+0', category:'daily', mode:'daily', label:hours + ' Stunden pro Zug', baseSeconds:hours * 3600, incrementSeconds:0};
  }
  const key = normalizeTournamentTimeKey(type, tournamentRow && tournamentRow.time_key);
  const parts = key.split('+').map(value => Math.max(0, Number(value || 0)));
  return {key, category:type, mode:'live', label:tournamentTimeLabel(type, key, 0), baseSeconds:parts[0], incrementSeconds:parts[1] || 0};
}

function tournamentAllowedPlayers(value) {
  if (normalizeTournamentMode(value) === TOURNAMENT_MODE_ARENA) return [];
  return TOURNAMENT_PLAYERS_BY_MODE[normalizeTournamentMode(value)] || TOURNAMENT_PLAYERS_BY_MODE.double_round_robin;
}

function normalizeTournamentPlayers(modeValue, playerValue) {
  const allowed = tournamentAllowedPlayers(modeValue);
  const players = Number(playerValue);
  return allowed.includes(players) ? players : allowed[0];
}

function normalizeTournamentCapacity(typeValue, modeValue, playerValue) {
  const type = normalizeTournamentType(typeValue);
  if (type !== TOURNAMENT_TYPE_DAILY && normalizeTournamentMode(modeValue) === TOURNAMENT_MODE_ARENA) return 0;
  if (type !== TOURNAMENT_TYPE_DAILY) {
    const players = Number(playerValue);
    return TOURNAMENT_LIVE_MAX_PLAYERS.includes(players) ? players : TOURNAMENT_LIVE_MAX_PLAYERS[0];
  }
  return normalizeTournamentPlayers(modeValue, playerValue);
}

function normalizeTournamentArenaDuration(value) {
  const duration = Number(value);
  return TOURNAMENT_ARENA_DURATIONS.includes(duration) ? duration : 90;
}

function tournamentStartCapacity(tournamentRow, startingPlayers) {
  const mode = normalizeTournamentMode(tournamentRow && tournamentRow.mode);
  const live = tournamentIsLive(tournamentRow);
  const players = Math.max(0, Number(startingPlayers || 0));
  const maxPlayers = Math.max(0, Number(tournamentRow && tournamentRow.max_players || 0));
  if (live && mode === TOURNAMENT_MODE_ARENA) {
    return {ok:true, flexible:true, minPlayers:0, maxPlayers:0};
  }
  if (mode === TOURNAMENT_MODE_SWISS) {
    const upper = maxPlayers > 0 ? Math.min(32, maxPlayers) : 32;
    return {ok:players >= 4 && players <= upper, flexible:true, minPlayers:4, maxPlayers:upper};
  }
  return {ok:maxPlayers > 0 && players === maxPlayers, flexible:false, minPlayers:maxPlayers, maxPlayers};
}

function normalizeTournamentStatus(value) {
  const status = String(value || '').toLowerCase();
  return ['draft', 'open', 'full', 'running', 'ended', 'cancelled'].includes(status) ? status : 'draft';
}

function d1Changes(result) {
  return Math.max(0, Number(result && result.meta && result.meta.changes || result && result.changes || 0));
}

function tournamentStandings(participants, games, byes = []) {
  const rows = new Map();
  for (const participant of participants || []) {
    if (!participant || participant.status !== 'confirmed') continue;
    rows.set(String(participant.userId), {
      userId:String(participant.userId),
      username:cleanDisplayName(participant.username) || 'Mitglied',
      groupName:String(participant.groupName || ''),
      played:0, wins:0, draws:0, losses:0, points:0, buchholz:0,
      opponentIds:[]
    });
  }
  for (const game of games || []) {
    if (!game || game.status !== 'ended') continue;
    const white = rows.get(String(game.whiteUserId));
    const black = rows.get(String(game.blackUserId));
    if (!white || !black) continue;
    white.played += 1;
    black.played += 1;
    white.opponentIds.push(black.userId);
    black.opponentIds.push(white.userId);
    if (game.result === '1-0') {
      white.wins += 1; white.points += 1; black.losses += 1;
    } else if (game.result === '0-1') {
      black.wins += 1; black.points += 1; white.losses += 1;
    } else if (game.result === '1/2-1/2') {
      white.draws += 1; black.draws += 1; white.points += 0.5; black.points += 0.5;
    }
  }
  for (const bye of byes || []) {
    const row = rows.get(String(bye && bye.userId || ''));
    if (!row) continue;
    row.played += 1;
    row.wins += 1;
    row.points += Number(bye.points == null ? 1 : bye.points);
  }
  for (const row of rows.values()) {
    row.buchholz = row.opponentIds.reduce((sum, opponentId) => sum + Number(rows.get(opponentId) && rows.get(opponentId).points || 0), 0);
    delete row.opponentIds;
  }
  const directScore = (userId, opponentId) => (games || []).reduce((score, game) => {
    if (!game || game.status !== 'ended') return score;
    const whiteId = String(game.whiteUserId);
    const blackId = String(game.blackUserId);
    if (![whiteId, blackId].includes(String(userId)) || ![whiteId, blackId].includes(String(opponentId))) return score;
    if (game.result === '1/2-1/2') return score + 0.5;
    if ((game.result === '1-0' && whiteId === String(userId)) || (game.result === '0-1' && blackId === String(userId))) return score + 1;
    return score;
  }, 0);
  return Array.from(rows.values()).sort((a, b) => b.points - a.points
    || b.buchholz - a.buchholz
    || directScore(b.userId, a.userId) - directScore(a.userId, b.userId)
    || b.wins - a.wins
    || a.username.localeCompare(b.username, 'de-DE', {sensitivity:'base'})).map((row, index) => Object.assign({rank:index + 1}, row));
}

function tournamentArenaStandings(participants, games) {
  const rows = new Map();
  for (const participant of participants || []) {
    if (!participant || participant.status !== 'confirmed') continue;
    rows.set(String(participant.userId), {
      userId:String(participant.userId),
      username:cleanDisplayName(participant.username) || 'Mitglied',
      groupName:'',
      played:0, wins:0, draws:0, losses:0, points:0, buchholz:0
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
      white.wins += 1; white.points += 2; black.losses += 1;
    } else if (game.result === '0-1') {
      black.wins += 1; black.points += 2; white.losses += 1;
    } else if (game.result === '1/2-1/2') {
      white.draws += 1; black.draws += 1; white.points += 1; black.points += 1;
    }
  }
  return Array.from(rows.values()).sort((a, b) => b.points - a.points
    || b.wins - a.wins
    || a.played - b.played
    || a.username.localeCompare(b.username, 'de-DE', {sensitivity:'base'}))
    .map((row, index) => Object.assign({rank:index + 1}, row));
}

async function tournamentParticipantsFor(env, tournamentId) {
  const result = await env.DB.prepare(
    `SELECT participant.user_id, participant.status, participant.group_name, participant.checked_in_at,
            participant.arena_active, participant.arena_joined_at, participant.arena_waiting_since,
            participant.arena_pairing_not_before, participant.knockout_seed,
            participant.start_rating, participant.start_rating_type,
            participant.joined_at, participant.updated_at,
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
      groupName:String(row.group_name || ''),
      checkedInAt:row.checked_in_at || null,
      checkedIn:!!row.checked_in_at,
      arenaActive:Number(row.arena_active || 0),
      arenaJoinedAt:row.arena_joined_at || null,
      arenaWaitingSince:row.arena_waiting_since || null,
      arenaPairingNotBefore:row.arena_pairing_not_before || null,
      knockoutSeed:row.knockout_seed === null || row.knockout_seed === undefined ? null : Number(row.knockout_seed),
      startRating:row.start_rating === null || row.start_rating === undefined ? null : Number(row.start_rating),
      startRatingType:String(row.start_rating_type || ''),
      joinedAt:row.joined_at || null,
      updatedAt:row.updated_at || null,
      waitlistPosition:row.status === 'waiting' ? waitingPosition : null
    };
  });
}

async function tournamentByesFor(env, tournamentId) {
  const result = await env.DB.prepare(
    `SELECT bye.round_number, bye.user_id, bye.points, bye.created_at,
            COALESCE(account.username, 'Gelöschter Benutzer') AS username
       FROM tournament_byes bye
       LEFT JOIN users account ON account.id = bye.user_id
      WHERE bye.tournament_id = ?
      ORDER BY bye.round_number ASC`
  ).bind(tournamentId).all();
  return (result && result.results ? result.results : []).map(row => ({
    roundNumber:Number(row.round_number || 0),
    userId:String(row.user_id || ''),
    username:cleanDisplayName(row.username) || 'Mitglied',
    points:Number(row.points == null ? 1 : row.points),
    createdAt:row.created_at || null
  }));
}

async function tournamentKnockoutResultsFor(env, tournamentId) {
  const result = await env.DB.prepare(
    `SELECT tournament_id, round_number, pairing_number, first_user_id, second_user_id,
            first_score, second_score, first_rating, second_rating, winner_user_id, loser_user_id,
            resolution, resolved_at
       FROM tournament_knockout_results
      WHERE tournament_id = ?
      ORDER BY round_number ASC, pairing_number ASC`
  ).bind(tournamentId).all();
  return (result && result.results ? result.results : []).map(row => ({
    tournamentId:String(row.tournament_id || ''),
    roundNumber:Number(row.round_number || 0),
    pairingNumber:Number(row.pairing_number || 0),
    firstUserId:String(row.first_user_id || ''),
    secondUserId:String(row.second_user_id || ''),
    firstScore:Number(row.first_score || 0),
    secondScore:Number(row.second_score || 0),
    firstRating:Number(row.first_rating || RATING_START),
    secondRating:Number(row.second_rating || RATING_START),
    winnerUserId:String(row.winner_user_id || ''),
    loserUserId:String(row.loser_user_id || ''),
    resolution:String(row.resolution || ''),
    resolvedAt:row.resolved_at || null
  }));
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
    `SELECT round_number, position_id, back_rank, status, stage, label, started_at, ended_at
       FROM tournament_rounds WHERE tournament_id = ? ORDER BY round_number ASC`
  ).bind(tournamentId).all();
  return (result && result.results ? result.results : []).map(row => ({
    roundNumber:Number(row.round_number || 0),
    positionId:row.position_id === null || row.position_id === undefined ? null : Number(row.position_id),
    backRank:row.back_rank || '',
    status:String(row.status || ''),
    stage:String(row.stage || 'round'),
    label:String(row.label || ''),
    startedAt:row.started_at || null,
    endedAt:row.ended_at || null
  }));
}

async function tournamentGamesFor(env, tournamentId) {
  const result = await env.DB.prepare(
    `SELECT game.id, game.round_number, game.pairing_number, game.game_number, game.room_id,
            game.white_user_id, game.black_user_id, game.status, game.group_name, game.pairing_label, game.result, game.end_reason,
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
    groupName:String(row.group_name || ''),
    pairingLabel:String(row.pairing_label || ''),
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
  const byes = await tournamentByesFor(env, id);
  const knockoutResults = await tournamentKnockoutResultsFor(env, id);
  const own = participants.find(item => String(item.userId) === String(sessionUser && sessionUser.id || ''));
  const confirmedCount = participants.filter(item => item.status === 'confirmed').length;
  const waitingCount = participants.filter(item => item.status === 'waiting').length;
  const checkedInCount = participants.filter(item => item.status === 'confirmed' && item.checkedIn).length;
  const status = normalizeTournamentStatus(row.status);
  const mode = normalizeTournamentMode(row.mode);
  const arena = mode === TOURNAMENT_MODE_ARENA;
  const tournamentType = normalizeTournamentType(row.tournament_type);
  const standings = arena ? tournamentArenaStandings(participants, games) : tournamentStandings(participants, games, byes);
  const live = tournamentType !== TOURNAMENT_TYPE_DAILY;
  const scheduledStartAt = row.scheduled_start_at || null;
  const scheduledStartMs = scheduledStartAt ? Date.parse(scheduledStartAt) : NaN;
  const checkInOpensAt = live && Number.isFinite(scheduledStartMs) ? new Date(scheduledStartMs - 60 * 60 * 1000).toISOString() : null;
  const checkInOpen = !!(live && ['open', 'full'].includes(status) && checkInOpensAt && Date.now() >= Date.parse(checkInOpensAt));
  const userState = own
    ? (status === 'running' && own.status === 'confirmed' ? 'playing' : status === 'ended' && own.status === 'confirmed' ? 'finished' : own.status)
    : '';
  return {
    id,
    name:cleanTournamentName(row.name),
    description:cleanTournamentDescription(row.description),
    players:Number(row.max_players || 0),
    hours:Number(row.hours_per_move || 24),
    rated:Number(row.rated || 0) === 1,
    variant:normalizeTournamentVariant(row.variant),
    theme:tournamentThemeFromRow(row),
    tournamentType,
    tournamentTypeLabel:tournamentTypeLabel(tournamentType),
    live,
    timeKey:live ? normalizeTournamentTimeKey(tournamentType, row.time_key) : '',
    timeLabel:tournamentTimeLabel(tournamentType, row.time_key, row.hours_per_move),
    scheduledStartAt,
    arena,
    arenaDurationMinutes:arena ? normalizeTournamentArenaDuration(row.arena_duration_minutes) : null,
    arenaEndsAt:arena ? (row.arena_ends_at || null) : null,
    arenaClosedAt:arena ? (row.arena_closed_at || null) : null,
    arenaActive:own ? Number(own.arenaActive || 0) : 0,
    arenaPairingNotBefore:arena && own ? (own.arenaPairingNotBefore || null) : null,
    arenaRunningGames:arena ? games.filter(game => ['creating', 'running'].includes(game.status)).length : 0,
    checkInOpensAt,
    checkInOpen,
    nextRoundAt:row.next_round_at || null,
    roundPauseSeconds:Math.max(10, Number(row.round_pause_seconds || 60)),
    mode,
    modeLabel:tournamentModeLabel(mode),
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
    checkedInCount,
    participants,
    rounds,
    games,
    byes,
    knockoutResults,
    standings,
    groupStandings:mode === TOURNAMENT_MODE_GROUPS ? tournamentGroupStandings(participants, games) : [],
    winners:arena ? (status === 'ended' ? standings.slice(0, 3) : []) : tournamentWinners(row, participants, games, byes, knockoutResults),
    canCheckIn:!!(checkInOpen && own && own.status === 'confirmed' && !own.checkedIn),
    checkedIn:!!(own && own.checkedIn),
    canArenaJoin:!!(arena && status === 'running' && !row.arena_closed_at && (!own || Number(own.arenaActive || 0) === 0)),
    userState,
    waitlistPosition:own && own.status === 'waiting' ? own.waitlistPosition : null,
    unread:!!(row.published_at && (!row.viewed_at || Date.parse(row.viewed_at) < Date.parse(row.published_at)))
  };
}

async function listTournaments(env, sessionUser) {
  if (!(await ensureTournamentTables(env)) || !sessionUser) return [];
  await autoStartDueTournaments(env);
  await repairRunningKnockoutTournaments(env);
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

async function liveTournamentStatusForUser(env, sessionUser) {
  if (!(await ensureTournamentTables(env)) || !sessionUser) return null;
  await setUserPresence(env, sessionUser.id, true);
  await autoStartDueTournaments(env);
  let tournament = await env.DB.prepare(
    `SELECT tournament.*
       FROM tournaments tournament
       JOIN tournament_participants participant ON participant.tournament_id = tournament.id
      WHERE participant.user_id = ?
        AND participant.status = 'confirmed'
        AND tournament.status = 'running'
        AND tournament.tournament_type IN ('rapid','blitz')
      ORDER BY tournament.started_at DESC
      LIMIT 1`
  ).bind(sessionUser.id).first();
  if (!tournament) return null;
  const arena = normalizeTournamentMode(tournament.mode) === TOURNAMENT_MODE_ARENA;
  if (arena) {
    await closeArenaTournamentIfDue(env, tournament.id);
    tournament = await loadTournamentRow(env, tournament.id);
    if (!tournament || !['running', 'ended'].includes(tournament.status)) return null;
    if (tournament.status === 'running' && !tournament.arena_closed_at) await pairArenaPlayers(env, tournament.id);
    const participant = await env.DB.prepare(
      `SELECT arena_active, arena_pairing_not_before FROM tournament_participants WHERE tournament_id = ? AND user_id = ? AND status = 'confirmed' LIMIT 1`
    ).bind(tournament.id, sessionUser.id).first();
    const game = await env.DB.prepare(
      `SELECT game.room_id, game.status, game.result, game.white_user_id, game.black_user_id,
              game.pairing_label, white_account.username AS white_name, black_account.username AS black_name
         FROM tournament_games game
         LEFT JOIN users white_account ON white_account.id = game.white_user_id
         LEFT JOIN users black_account ON black_account.id = game.black_user_id
        WHERE game.tournament_id = ? AND (game.white_user_id = ? OR game.black_user_id = ?)
        ORDER BY CASE game.status WHEN 'running' THEN 0 WHEN 'creating' THEN 1 ELSE 2 END, game.created_at DESC
        LIMIT 1`
    ).bind(tournament.id, sessionUser.id, sessionUser.id).first();
    const isWhite = !!(game && String(game.white_user_id) === String(sessionUser.id));
    const gameStatus = String(game && game.status || '');
    return {
      tournamentId:String(tournament.id), tournamentName:cleanTournamentName(tournament.name),
      tournamentType:normalizeTournamentType(tournament.tournament_type), tournamentTypeLabel:tournamentTypeLabel(tournament.tournament_type),
      timeLabel:tournamentTimeLabel(tournament.tournament_type, tournament.time_key, tournament.hours_per_move),
      status:String(tournament.status), arena:true, arenaActive:Number(participant && participant.arena_active || 0),
      pairingNotBefore:participant && participant.arena_pairing_not_before || null,
      arenaDurationMinutes:normalizeTournamentArenaDuration(tournament.arena_duration_minutes),
      arenaEndsAt:tournament.arena_ends_at || null, arenaClosed:!!tournament.arena_closed_at || tournament.status === 'ended',
      currentRound:0, totalRounds:0, roundLabel:'Arena', roundStartedAt:tournament.started_at || null, nextRoundAt:null, bye:false,
      game:game ? {roomId:String(game.room_id || ''), status:gameStatus, result:String(game.result || '*'), role:isWhite ? 'w' : 'b',
        opponentName:cleanDisplayName(isWhite ? game.black_name : game.white_name) || 'Gegner', pairingLabel:String(game.pairing_label || '')} : null,
      waiting:!!(tournament.status === 'running' && Number(participant && participant.arena_active || 0) === 1 && (!game || gameStatus === 'ended')),
      paused:Number(participant && participant.arena_active || 0) === 0,
      serverNow:Date.now()
    };
  }
  try { await startLiveTournamentRoundIfDue(env, tournament.id); } catch (error) {
    console.error('Live tournament round start failed', error && error.message ? error.message : String(error || 'unknown'));
  }
  tournament = await loadTournamentRow(env, tournament.id);
  if (!tournament || tournament.status !== 'running') return null;
  const roundNumber = Math.max(1, Number(tournament.current_round || 1));
  const game = await env.DB.prepare(
    `SELECT game.room_id, game.status, game.result, game.white_user_id, game.black_user_id,
            game.pairing_label, white_account.username AS white_name, black_account.username AS black_name
       FROM tournament_games game
       LEFT JOIN users white_account ON white_account.id = game.white_user_id
       LEFT JOIN users black_account ON black_account.id = game.black_user_id
      WHERE game.tournament_id = ? AND game.round_number = ?
        AND (game.white_user_id = ? OR game.black_user_id = ?)
      ORDER BY game.game_number ASC
      LIMIT 1`
  ).bind(tournament.id, roundNumber, sessionUser.id, sessionUser.id).first();
  const bye = await env.DB.prepare(
    `SELECT user_id FROM tournament_byes WHERE tournament_id = ? AND round_number = ? AND user_id = ? LIMIT 1`
  ).bind(tournament.id, roundNumber, sessionUser.id).first();
  const round = await env.DB.prepare(
    `SELECT label, status, started_at, ended_at FROM tournament_rounds WHERE tournament_id = ? AND round_number = ? LIMIT 1`
  ).bind(tournament.id, roundNumber).first();
  const isWhite = !!(game && String(game.white_user_id) === String(sessionUser.id));
  const gameStatus = String(game && game.status || '');
  return {
    tournamentId:String(tournament.id),
    tournamentName:cleanTournamentName(tournament.name),
    tournamentType:normalizeTournamentType(tournament.tournament_type),
    tournamentTypeLabel:tournamentTypeLabel(tournament.tournament_type),
    timeLabel:tournamentTimeLabel(tournament.tournament_type, tournament.time_key, tournament.hours_per_move),
    status:String(tournament.status),
    currentRound:roundNumber,
    totalRounds:Number(tournament.total_rounds || 0),
    roundLabel:String(round && round.label || ('Schweizer Runde ' + roundNumber)),
    roundStartedAt:round && round.started_at || null,
    nextRoundAt:tournament.next_round_at || null,
    bye:!!bye,
    game:game ? {
      roomId:String(game.room_id || ''),
      status:gameStatus,
      result:String(game.result || '*'),
      role:isWhite ? 'w' : 'b',
      opponentName:cleanDisplayName(isWhite ? game.black_name : game.white_name) || 'Gegner',
      pairingLabel:String(game.pairing_label || '')
    } : null,
    waiting:!!(!game || gameStatus === 'ended'),
    serverNow:Date.now()
  };
}

function tournamentRoundArrangement(participants, roundNumber) {
  const players = (participants || []).slice();
  if (players.length % 2 === 1) players.push(null);
  for (let round = 1; round < roundNumber; round += 1) {
    players.splice(1, 0, players.pop());
  }
  const pairs = [];
  for (let index = 0; index < players.length / 2; index += 1) {
    const first = players[index];
    const second = players[players.length - 1 - index];
    if (first && second) pairs.push([first, second]);
  }
  return pairs;
}

function tournamentTotalRounds(modeValue, playerCount) {
  const mode = normalizeTournamentMode(modeValue);
  const players = Number(playerCount || 0);
  if (mode === TOURNAMENT_MODE_ARENA) return 0;
  if (mode === TOURNAMENT_MODE_SWISS) return players <= 8 ? 3 : players <= 16 ? 4 : 5;
  if (mode === TOURNAMENT_MODE_GROUPS) return 3 + Math.max(1, Math.round(Math.log2(Math.max(2, players / 2))));
  if (mode === TOURNAMENT_MODE_KNOCKOUT) return Math.max(1, Math.round(Math.log2(Math.max(2, players))));
  return Math.max(1, players - 1);
}

function tournamentCryptoIndex(maxExclusive) {
  const max = Math.max(1, Math.floor(Number(maxExclusive || 1)));
  if (max === 1) return 0;
  const data = new Uint32Array(1);
  const range = 0x100000000;
  const limit = range - (range % max);
  do { crypto.getRandomValues(data); } while (data[0] >= limit);
  return data[0] % max;
}

function shuffledTournamentParticipants(participants) {
  const shuffled = (participants || []).slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = tournamentCryptoIndex(index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

async function initializeTournamentKnockoutParticipants(env, tournamentRow, participants) {
  if (normalizeTournamentMode(tournamentRow && tournamentRow.mode) !== TOURNAMENT_MODE_KNOCKOUT) return participants || [];
  if (tournamentIsLive(tournamentRow)) throw new Error('K.-o.-Turniere sind ausschließlich als Daily-Turniere vorgesehen.');
  const players = (participants || []).filter(item => item && item.status === 'confirmed');
  const maximum = Number(tournamentRow && tournamentRow.max_players || 0);
  if (!maximum || players.length !== maximum || ![4, 8, 16, 32].includes(players.length)) {
    throw new Error('Das K.-o.-Turnier kann nur mit vollständig belegtem 4er-, 8er-, 16er- oder 32er-Feld gestartet werden.');
  }
  const ratingType = normalizeTournamentVariant(tournamentRow.variant) === GAME_VARIANT_FREESTYLE ? 'daily_freestyle' : 'daily_classic';
  const ratings = await getRatingTypeForUsers(env, players.map(item => item.userId), ratingType);
  const seeds = players.map(item => Number(item.knockoutSeed || 0));
  const validExistingSeeds = seeds.every(seed => seed >= 1 && seed <= players.length) && new Set(seeds).size === players.length;
  const seededPlayers = validExistingSeeds
    ? players.slice().sort((a, b) => Number(a.knockoutSeed) - Number(b.knockoutSeed))
    : shuffledTournamentParticipants(players);
  const now = new Date().toISOString();
  const statements = seededPlayers.map((participant, index) => {
    const rating = ratings[String(participant.userId)] || normalizeRatingRow(null, ratingType);
    return env.DB.prepare(
      `UPDATE tournament_participants
          SET knockout_seed = ?,
              start_rating = COALESCE(start_rating, ?),
              start_rating_type = COALESCE(NULLIF(start_rating_type, ''), ?),
              updated_at = ?
        WHERE tournament_id = ? AND user_id = ? AND status = 'confirmed'`
    ).bind(index + 1, Math.round(Number(rating && rating.rating || RATING_START)), ratingType, now, tournamentRow.id, participant.userId);
  });
  if (statements.length) await env.DB.batch(statements);
  return (await tournamentParticipantsFor(env, tournamentRow.id)).filter(item => item.status === 'confirmed');
}

function tournamentMatchScores(matchGames, firstId, secondId) {
  const scores = new Map([[String(firstId), 0], [String(secondId), 0]]);
  for (const game of matchGames || []) {
    if (!game || game.status !== 'ended') continue;
    const whiteId = String(game.whiteUserId || '');
    const blackId = String(game.blackUserId || '');
    if (game.result === '1-0') scores.set(whiteId, Number(scores.get(whiteId) || 0) + 1);
    else if (game.result === '0-1') scores.set(blackId, Number(scores.get(blackId) || 0) + 1);
    else if (game.result === '1/2-1/2') {
      scores.set(whiteId, Number(scores.get(whiteId) || 0) + 0.5);
      scores.set(blackId, Number(scores.get(blackId) || 0) + 0.5);
    }
  }
  return {first:Number(scores.get(String(firstId)) || 0), second:Number(scores.get(String(secondId)) || 0)};
}

function tournamentKnockoutDecision(firstId, secondId, score, firstRating, secondRating) {
  const firstScore = Number(score && score.first || 0);
  const secondScore = Number(score && score.second || 0);
  if (firstScore > secondScore) return {winnerId:String(firstId), loserId:String(secondId), resolution:'score'};
  if (secondScore > firstScore) return {winnerId:String(secondId), loserId:String(firstId), resolution:'score'};
  if (Math.abs(Number(firstRating) - Number(secondRating)) <= 25) {
    const winnerId = tournamentCryptoIndex(2) === 0 ? String(firstId) : String(secondId);
    return {winnerId, loserId:winnerId === String(firstId) ? String(secondId) : String(firstId), resolution:'lot'};
  }
  const winnerId = Number(firstRating) < Number(secondRating) ? String(firstId) : String(secondId);
  return {winnerId, loserId:winnerId === String(firstId) ? String(secondId) : String(firstId), resolution:'lower_rating'};
}

async function ensureKnockoutRoundResults(env, tournamentRow, roundNumber, options = {}) {
  if (!tournamentRow || normalizeTournamentMode(tournamentRow.mode) !== TOURNAMENT_MODE_KNOCKOUT) return [];
  const tournamentId = String(tournamentRow.id || '');
  const participants = (await tournamentParticipantsFor(env, tournamentId)).filter(item => item.status === 'confirmed');
  const participantById = new Map(participants.map(item => [String(item.userId), item]));
  const games = (await tournamentGamesFor(env, tournamentId)).filter(game => Number(game.roundNumber) === Number(roundNumber));
  const existing = await tournamentKnockoutResultsFor(env, tournamentId);
  const pairingNumbers = Array.from(new Set(games.map(game => Number(game.pairingNumber)))).sort((a, b) => a - b);
  if (!pairingNumbers.length) {
    if (options.requireAll) throw new Error('Die K.-o.-Runde enthält keine Paarungen.');
    return existing.filter(item => Number(item.roundNumber) === Number(roundNumber));
  }
  const existingKeys = new Set(existing.filter(item => Number(item.roundNumber) === Number(roundNumber)).map(item => Number(item.pairingNumber)));
  const now = new Date().toISOString();
  for (const pairingNumber of pairingNumbers) {
    if (existingKeys.has(pairingNumber)) continue;
    const matchGames = games.filter(game => Number(game.pairingNumber) === pairingNumber).sort((a, b) => Number(a.gameNumber) - Number(b.gameNumber));
    if (matchGames.length !== 2 || matchGames.some(game => game.status !== 'ended' || !['1-0', '0-1', '1/2-1/2'].includes(game.result))) {
      if (options.requireAll) throw new Error('Eine K.-o.-Begegnung ist noch nicht mit zwei gültigen Ergebnissen abgeschlossen.');
      continue;
    }
    const firstGame = matchGames[0];
    const firstId = String(firstGame.whiteUserId || '');
    const secondId = String(firstGame.blackUserId || '');
    const firstParticipant = participantById.get(firstId) || {};
    const secondParticipant = participantById.get(secondId) || {};
    const firstRating = Math.round(Number(firstParticipant.startRating == null ? RATING_START : firstParticipant.startRating));
    const secondRating = Math.round(Number(secondParticipant.startRating == null ? RATING_START : secondParticipant.startRating));
    const score = tournamentMatchScores(matchGames, firstId, secondId);
    const decision = tournamentKnockoutDecision(firstId, secondId, score, firstRating, secondRating);
    const winnerId = decision.winnerId;
    const loserId = decision.loserId;
    const resolution = decision.resolution;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tournament_knockout_results
         (tournament_id, round_number, pairing_number, first_user_id, second_user_id,
          first_score, second_score, first_rating, second_rating, winner_user_id, loser_user_id,
          resolution, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(tournamentId, Number(roundNumber), pairingNumber, firstId, secondId, score.first, score.second,
      firstRating, secondRating, winnerId, loserId, resolution, now).run();
  }
  return (await tournamentKnockoutResultsFor(env, tournamentId)).filter(item => Number(item.roundNumber) === Number(roundNumber));
}

function tournamentColorBalance(userId, games) {
  let balance = 0;
  for (const game of games || []) {
    if (String(game.whiteUserId) === String(userId)) balance += 1;
    if (String(game.blackUserId) === String(userId)) balance -= 1;
  }
  return balance;
}

function orientTournamentPair(first, second, games, roundNumber, pairingNumber) {
  const firstBalance = tournamentColorBalance(first.userId, games);
  const secondBalance = tournamentColorBalance(second.userId, games);
  const firstWhiteCost = Math.abs(firstBalance + 1) + Math.abs(secondBalance - 1);
  const secondWhiteCost = Math.abs(firstBalance - 1) + Math.abs(secondBalance + 1);
  if (firstWhiteCost < secondWhiteCost) return [first, second];
  if (secondWhiteCost < firstWhiteCost) return [second, first];
  return (Number(roundNumber || 0) + Number(pairingNumber || 0)) % 2 === 0 ? [first, second] : [second, first];
}

function swissPairingPlan(participants, games, byes = []) {
  const standings = tournamentStandings(participants, games, byes);
  const standingsById = new Map(standings.map(row => [String(row.userId), row]));
  const joinedOrder = new Map((participants || []).map((item, index) => [String(item.userId), index]));
  const ranked = (participants || []).slice().sort((a, b) => {
    const left = standingsById.get(String(a.userId)) || {};
    const right = standingsById.get(String(b.userId)) || {};
    return Number(right.points || 0) - Number(left.points || 0)
      || Number(right.buchholz || 0) - Number(left.buchholz || 0)
      || Number(right.wins || 0) - Number(left.wins || 0)
      || Number(joinedOrder.get(String(a.userId)) || 0) - Number(joinedOrder.get(String(b.userId)) || 0);
  });
  const played = new Set((games || []).map(game => [String(game.whiteUserId), String(game.blackUserId)].sort().join('|')));
  const score = user => Number(standingsById.get(String(user.userId)) && standingsById.get(String(user.userId)).points || 0);
  let visited = 0;
  const search = (remaining, allowRepeat) => {
    if (!remaining.length) return [];
    visited += 1;
    if (visited > 75000) return null;
    const first = remaining[0];
    const candidates = remaining.slice(1).map((opponent, offset) => {
      const repeat = played.has([String(first.userId), String(opponent.userId)].sort().join('|'));
      const colorPenalty = Math.abs(tournamentColorBalance(first.userId, games) + tournamentColorBalance(opponent.userId, games));
      return {opponent, index:offset + 1, repeat, penalty:(repeat ? 1000000 : 0) + Math.abs(score(first) - score(opponent)) * 1000 + colorPenalty * 10 + offset};
    }).filter(item => allowRepeat || !item.repeat).sort((a, b) => a.penalty - b.penalty || Number(a.repeat) - Number(b.repeat));
    for (const candidate of candidates) {
      const index = candidate.index;
      const rest = remaining.slice(1, index).concat(remaining.slice(index + 1));
      const tail = search(rest, allowRepeat);
      if (tail) return [[first, candidate.opponent], ...tail];
    }
    return null;
  };
  let result = search(ranked, false);
  if (!result) {
    visited = 0;
    result = search(ranked, true);
  }
  return result || [];
}

function tournamentSwissBye(participants, games, byes = []) {
  if ((participants || []).length % 2 === 0) return null;
  const standings = tournamentStandings(participants, games, byes);
  const byesByUser = new Map();
  for (const bye of byes || []) byesByUser.set(String(bye.userId), Number(byesByUser.get(String(bye.userId)) || 0) + 1);
  const standingsById = new Map(standings.map(row => [String(row.userId), row]));
  const candidates = (participants || []).slice().sort((a, b) => {
    const leftByes = Number(byesByUser.get(String(a.userId)) || 0);
    const rightByes = Number(byesByUser.get(String(b.userId)) || 0);
    const left = standingsById.get(String(a.userId)) || {};
    const right = standingsById.get(String(b.userId)) || {};
    return leftByes - rightByes
      || Number(left.points || 0) - Number(right.points || 0)
      || Number(left.buchholz || 0) - Number(right.buchholz || 0)
      || String(right.username || '').localeCompare(String(left.username || ''), 'de-DE', {sensitivity:'base'});
  });
  return candidates[0] || null;
}

function tournamentGroupStandings(participants, games) {
  const groups = Array.from(new Set((participants || []).map(item => String(item.groupName || '')).filter(Boolean))).sort();
  return groups.map(groupName => ({
    groupName,
    standings:tournamentStandings(
      (participants || []).filter(item => item.groupName === groupName),
      (games || []).filter(game => game.groupName === groupName)
    )
  }));
}

function tournamentQualifierSeedOrder(participants, games) {
  const groups = tournamentGroupStandings(participants, games);
  if (groups.length <= 1) return groups.length ? groups[0].standings : [];
  return groups.flatMap(group => group.standings.slice(0, 2)).sort((a, b) => a.rank - b.rank || b.points - a.points || b.buchholz - a.buchholz || b.wins - a.wins || a.username.localeCompare(b.username, 'de-DE'));
}

function tournamentKnockoutLabel(pairCount) {
  if (pairCount >= 16) return 'Runde der 32';
  if (pairCount >= 8) return 'Achtelfinale';
  if (pairCount >= 4) return 'Viertelfinale';
  if (pairCount >= 2) return 'Halbfinale';
  return 'Finale';
}

function tournamentKnockoutStage(pairCount) {
  if (pairCount >= 16) return 'round_of_32';
  if (pairCount >= 8) return 'round_of_16';
  if (pairCount >= 4) return 'quarterfinal';
  if (pairCount >= 2) return 'semifinal';
  return 'final';
}

function tournamentWinners(tournamentRow, participants, games, byes = [], knockoutResults = []) {
  if (normalizeTournamentStatus(tournamentRow && tournamentRow.status) !== 'ended') return [];
  const mode = normalizeTournamentMode(tournamentRow && tournamentRow.mode);
  if (mode === TOURNAMENT_MODE_KNOCKOUT) {
    const confirmedPlayers = (participants || []).filter(item => item && item.status === 'confirmed').length;
    const finalRound = Number(tournamentRow && tournamentRow.total_rounds || 0) || tournamentTotalRounds(mode, confirmedPlayers);
    const finalResult = (knockoutResults || []).find(item => Number(item.roundNumber) === finalRound && Number(item.pairingNumber) === 1);
    const thirdPlaceResult = (knockoutResults || []).find(item => Number(item.roundNumber) === finalRound && Number(item.pairingNumber) === 2);
    if (!finalResult) return [];
    const participantById = new Map((participants || []).map(item => [String(item.userId), item]));
    return [finalResult.winnerUserId, finalResult.loserUserId, thirdPlaceResult && thirdPlaceResult.winnerUserId].filter(Boolean).map((userId, index) => {
      const participant = participantById.get(String(userId)) || {};
      return {rank:index + 1, userId:String(userId), username:cleanDisplayName(participant.username) || 'Mitglied'};
    });
  }
  if (mode !== TOURNAMENT_MODE_GROUPS) {
    return tournamentStandings(participants, games, byes).slice(0, 3);
  }
  const finalRound = tournamentTotalRounds(TOURNAMENT_MODE_GROUPS, participants.length);
  const finalGames = (games || []).filter(game => Number(game.roundNumber) === finalRound);
  const seedOrder = tournamentQualifierSeedOrder(participants, games);
  const finalOutcome = tournamentMatchOutcome(finalGames.filter(game => Number(game.pairingNumber) === 1), seedOrder);
  const thirdOutcome = tournamentMatchOutcome(finalGames.filter(game => Number(game.pairingNumber) === 2), seedOrder);
  const participantById = new Map((participants || []).map(item => [String(item.userId), item]));
  const ids = finalOutcome ? [finalOutcome.winnerId, finalOutcome.loserId, thirdOutcome && thirdOutcome.winnerId] : [];
  return ids.filter(Boolean).map((userId, index) => {
    const participant = participantById.get(String(userId)) || {};
    return {rank:index + 1, userId:String(userId), username:cleanDisplayName(participant.username) || 'Mitglied'};
  });
}

function tournamentMatchOutcome(matchGames, seedOrder) {
  const games = (matchGames || []).filter(game => game && game.status === 'ended');
  if (!games.length) return null;
  const firstId = String(games[0].whiteUserId);
  const secondId = String(games[0].blackUserId);
  const scores = new Map([[firstId, 0], [secondId, 0]]);
  for (const game of games) {
    if (game.result === '1-0') scores.set(String(game.whiteUserId), Number(scores.get(String(game.whiteUserId)) || 0) + 1);
    else if (game.result === '0-1') scores.set(String(game.blackUserId), Number(scores.get(String(game.blackUserId)) || 0) + 1);
    else if (game.result === '1/2-1/2') {
      scores.set(String(game.whiteUserId), Number(scores.get(String(game.whiteUserId)) || 0) + 0.5);
      scores.set(String(game.blackUserId), Number(scores.get(String(game.blackUserId)) || 0) + 0.5);
    }
  }
  let winnerId = Number(scores.get(firstId)) > Number(scores.get(secondId)) ? firstId : Number(scores.get(secondId)) > Number(scores.get(firstId)) ? secondId : '';
  if (!winnerId) {
    const seedIndex = new Map((seedOrder || []).map((item, index) => [String(item.userId), index]));
    winnerId = Number(seedIndex.get(firstId) ?? 999) <= Number(seedIndex.get(secondId) ?? 999) ? firstId : secondId;
  }
  return {winnerId, loserId:winnerId === firstId ? secondId : firstId};
}

function tournamentRoundPlan(tournamentRow, roundNumber, participants, games, byes = [], knockoutResults = []) {
  const mode = normalizeTournamentMode(tournamentRow && tournamentRow.mode);
  const makePair = (pair, index, extra = {}) => ({first:pair[0], second:pair[1], pairingLabel:extra.pairingLabel || ('Paarung ' + (index + 1)), groupName:extra.groupName || ''});
  if (mode === TOURNAMENT_MODE_KNOCKOUT) {
    const ordered = (participants || []).slice().sort((a, b) => Number(a.knockoutSeed || 9999) - Number(b.knockoutSeed || 9999));
    const participantById = new Map(ordered.map(item => [String(item.userId), item]));
    let pairs = [];
    if (Number(roundNumber) === 1) {
      const seeds = ordered.map(item => Number(item.knockoutSeed || 0));
      if (ordered.length < 4 || seeds.some(seed => seed < 1) || new Set(seeds).size !== ordered.length) {
        throw new Error('Die K.-o.-Auslosung ist noch nicht vollständig vorbereitet.');
      }
      for (let index = 0; index < ordered.length; index += 2) pairs.push([ordered[index], ordered[index + 1]]);
    } else {
      const previousRound = Number(roundNumber) - 1;
      const previous = (knockoutResults || []).filter(item => Number(item.roundNumber) === previousRound).sort((a, b) => Number(a.pairingNumber) - Number(b.pairingNumber));
      const expected = Math.max(1, ordered.length / Math.pow(2, previousRound));
      if (previous.length !== expected || previous.some(item => !item.winnerUserId || !item.loserUserId)) {
        throw new Error('Die Ergebnisse der vorherigen K.-o.-Runde sind noch nicht vollständig.');
      }
      const finalRound = tournamentTotalRounds(TOURNAMENT_MODE_KNOCKOUT, ordered.length);
      if (Number(roundNumber) === finalRound && previous.length === 2) {
        const firstFinalist = participantById.get(String(previous[0].winnerUserId));
        const secondFinalist = participantById.get(String(previous[1].winnerUserId));
        const firstThirdPlacePlayer = participantById.get(String(previous[0].loserUserId));
        const secondThirdPlacePlayer = participantById.get(String(previous[1].loserUserId));
        if (firstFinalist && secondFinalist) pairs.push([firstFinalist, secondFinalist]);
        if (firstThirdPlacePlayer && secondThirdPlacePlayer) pairs.push([firstThirdPlacePlayer, secondThirdPlacePlayer]);
      } else {
        for (let index = 0; index < previous.length; index += 2) {
          const first = previous[index] && participantById.get(String(previous[index].winnerUserId));
          const second = previous[index + 1] && participantById.get(String(previous[index + 1].winnerUserId));
          if (first && second) pairs.push([first, second]);
        }
      }
    }
    if (!pairs.length || pairs.some(pair => !pair[0] || !pair[1])) throw new Error('Für die K.-o.-Runde konnten keine vollständigen Paarungen gebildet werden.');
    const finalRound = tournamentTotalRounds(TOURNAMENT_MODE_KNOCKOUT, ordered.length);
    if (Number(roundNumber) === finalRound && pairs.length === 2) {
      return {
        stage:'final',
        label:'Finale und Spiel um Platz 3',
        gamesPerPair:2,
        pairs:[
          makePair(pairs[0], 0, {pairingLabel:'Finale'}),
          makePair(pairs[1], 1, {pairingLabel:'Spiel um Platz 3'})
        ]
      };
    }
    const label = tournamentKnockoutLabel(pairs.length);
    return {
      stage:tournamentKnockoutStage(pairs.length),
      label,
      gamesPerPair:2,
      pairs:pairs.map((pair, index) => makePair(pair, index, {pairingLabel:label === 'Finale' ? 'Finale' : (label + ' ' + (index + 1))}))
    };
  }
  if (mode === TOURNAMENT_MODE_SINGLE || mode === TOURNAMENT_MODE_DOUBLE) {
    return {
      stage:'round',
      label:(mode === TOURNAMENT_MODE_DOUBLE ? 'Doppelrunde ' : 'Runde ') + roundNumber,
      gamesPerPair:mode === TOURNAMENT_MODE_DOUBLE ? 2 : 1,
      pairs:tournamentRoundArrangement(participants, roundNumber).map((pair, index) => makePair(pair, index))
    };
  }
  if (mode === TOURNAMENT_MODE_SWISS) {
    const bye = tournamentSwissBye(participants, games, byes);
    const pairedParticipants = bye ? participants.filter(item => String(item.userId) !== String(bye.userId)) : participants;
    return {
      stage:'swiss',
      label:'Schweizer Runde ' + roundNumber,
      gamesPerPair:1,
      bye,
      pairs:swissPairingPlan(pairedParticipants, games, byes).map((pair, index) => makePair(pair, index))
    };
  }

  if (roundNumber <= 3) {
    const groupNames = Array.from(new Set(participants.map(item => item.groupName).filter(Boolean))).sort();
    const pairs = [];
    for (const groupName of groupNames) {
      const groupParticipants = participants.filter(item => item.groupName === groupName);
      tournamentRoundArrangement(groupParticipants, roundNumber).forEach(pair => pairs.push(makePair(pair, pairs.length, {groupName, pairingLabel:'Gruppe ' + groupName})));
    }
    return {stage:'group', label:'Gruppenrunde ' + roundNumber, gamesPerPair:1, pairs};
  }

  const participantById = new Map(participants.map(item => [String(item.userId), item]));
  const groupStandings = tournamentGroupStandings(participants, games);
  const seedOrder = tournamentQualifierSeedOrder(participants, games);
  const totalRounds = tournamentTotalRounds(mode, participants.length);
  if (roundNumber === 4) {
    const knockoutPairs = groupStandings.map((group, index) => {
      const nextGroup = groupStandings[(index + 1) % groupStandings.length];
      return [group.standings[0], nextGroup && nextGroup.standings[1]];
    });
    const label = tournamentKnockoutLabel(knockoutPairs.length);
    return {
      stage:label === 'Halbfinale' ? 'semifinal' : label === 'Viertelfinale' ? 'quarterfinal' : 'round_of_16', label, gamesPerPair:2,
      pairs:knockoutPairs.filter(pair => pair[0] && pair[1]).map((pair, index) => makePair([participantById.get(String(pair[0].userId)), participantById.get(String(pair[1].userId))], index, {pairingLabel:label + ' ' + (index + 1)}))
    };
  }

  const previousGames = games.filter(game => Number(game.roundNumber) === roundNumber - 1);
  const pairingNumbers = Array.from(new Set(previousGames.map(game => Number(game.pairingNumber)))).sort((a, b) => a - b);
  const outcomes = pairingNumbers.map(pairingNumber => tournamentMatchOutcome(previousGames.filter(game => Number(game.pairingNumber) === pairingNumber), seedOrder));
  if (!outcomes.length || outcomes.some(outcome => !outcome)) throw new Error('Die Ergebnisse der vorherigen K.-o.-Runde sind noch nicht vollständig.');
  if (roundNumber < totalRounds) {
    const nextPairs = [];
    for (let index = 0; index < outcomes.length; index += 2) {
      if (outcomes[index] && outcomes[index + 1]) nextPairs.push([participantById.get(outcomes[index].winnerId), participantById.get(outcomes[index + 1].winnerId)]);
    }
    const label = tournamentKnockoutLabel(nextPairs.length);
    return {
      stage:label === 'semifinal' || label === 'Halbfinale' ? 'semifinal' : 'quarterfinal', label, gamesPerPair:2,
      pairs:nextPairs.map((pair, index) => makePair(pair, index, {pairingLabel:label + ' ' + (index + 1)}))
    };
  }
  if (outcomes.length !== 2) throw new Error('Die Halbfinalergebnisse sind für die Finalrunde noch nicht vollständig.');
  return {
    stage:'final', label:'Finale und Spiel um Platz 3', gamesPerPair:2,
    pairs:[
      makePair([participantById.get(outcomes[0].winnerId), participantById.get(outcomes[1].winnerId)], 0, {pairingLabel:'Finale'}),
      makePair([participantById.get(outcomes[0].loserId), participantById.get(outcomes[1].loserId)], 1, {pairingLabel:'Spiel um Platz 3'})
    ]
  };
}

async function assignTournamentGroups(env, tournamentId, participants) {
  const shuffled = (participants || []).slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const data = new Uint32Array(1);
    crypto.getRandomValues(data);
    const other = data[0] % (index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  for (let index = 0; index < shuffled.length; index += 1) {
    const groupName = String.fromCharCode(65 + Math.floor(index / 4));
    await env.DB.prepare(`UPDATE tournament_participants SET group_name = ?, updated_at = ? WHERE tournament_id = ? AND user_id = ?`).bind(groupName, new Date().toISOString(), tournamentId, shuffled[index].userId).run();
  }
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
  const stub = gameRoomStub(env, id);
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

function tournamentSchedulerRoomId(tournamentId) {
  const compact = String(tournamentId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  return cleanRoomId('TournamentScheduler' + compact);
}

async function scheduleTournamentAlarm(env, tournamentRow, scheduledAt, action = 'start') {
  if (!env || !env.GAME_ROOM || !tournamentRow || !tournamentRow.id || !scheduledAt) return false;
  const alarmAt = Date.parse(scheduledAt);
  if (!Number.isFinite(alarmAt)) return false;
  const roomId = tournamentSchedulerRoomId(tournamentRow.id);
  const id = env.GAME_ROOM.idFromName(roomId);
  const response = await gameRoomStub(env, id).fetch(new Request('https://game-room.internal/tournament-schedule?room=' + encodeURIComponent(roomId), {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({tournamentId:String(tournamentRow.id), scheduledAt:new Date(alarmAt).toISOString(), action:String(action || 'start')})
  }));
  if (!response.ok) return false;
  await env.DB.prepare(`UPDATE tournaments SET scheduler_room_id = ? WHERE id = ?`).bind(roomId, tournamentRow.id).run();
  return true;
}

async function closeArenaTournamentIfDue(env, tournamentId) {
  const tournament = await loadTournamentRow(env, tournamentId);
  if (!tournament || tournament.status !== 'running' || normalizeTournamentMode(tournament.mode) !== TOURNAMENT_MODE_ARENA) return {closed:false};
  const endsAt = Date.parse(tournament.arena_ends_at || '');
  if (!Number.isFinite(endsAt) || endsAt > Date.now()) return {closed:false, arenaEndsAt:tournament.arena_ends_at || null};
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE tournaments SET arena_closed_at = COALESCE(arena_closed_at, ?), updated_at = ? WHERE id = ? AND status = 'running'`
  ).bind(now, now, tournament.id).run();
  await env.DB.prepare(
    `UPDATE tournament_participants SET arena_active = 0, arena_waiting_since = NULL, arena_pairing_not_before = NULL, updated_at = ?
      WHERE tournament_id = ? AND arena_active = 1`
  ).bind(now, tournament.id).run();
  const active = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id = ? AND status IN ('creating','running')`
  ).bind(tournament.id).first();
  if (Number(active && active.count || 0) < 1) {
    await env.DB.prepare(
      `UPDATE tournaments SET status = 'ended', ended_at = COALESCE(ended_at, ?), updated_at = ? WHERE id = ? AND status = 'running'`
    ).bind(now, now, tournament.id).run();
    return {closed:true, ended:true, arenaEndsAt:tournament.arena_ends_at || null};
  }
  return {closed:true, ended:false, arenaEndsAt:tournament.arena_ends_at || null};
}

function arenaPairingPlan(eligibleParticipants, standings, games) {
  const scoreById = new Map((standings || []).map(row => [String(row.userId), Number(row.points || 0)]));
  const repeatCounts = new Map();
  const latestOpponent = new Map();
  const orderedGames = (games || []).filter(game => game && game.status === 'ended').slice().sort((a, b) => Date.parse(a.endedAt || a.createdAt || '') - Date.parse(b.endedAt || b.createdAt || ''));
  for (const game of orderedGames) {
    const white = String(game.whiteUserId || '');
    const black = String(game.blackUserId || '');
    const key = [white, black].sort().join('|');
    repeatCounts.set(key, Number(repeatCounts.get(key) || 0) + 1);
    latestOpponent.set(white, black);
    latestOpponent.set(black, white);
  }
  const pool = (eligibleParticipants || []).slice().sort((a, b) => {
    const aw = Date.parse(a.arenaWaitingSince || a.arenaJoinedAt || a.joinedAt || '') || 0;
    const bw = Date.parse(b.arenaWaitingSince || b.arenaJoinedAt || b.joinedAt || '') || 0;
    return aw - bw || Number(scoreById.get(String(b.userId)) || 0) - Number(scoreById.get(String(a.userId)) || 0);
  });
  const pairs = [];
  while (pool.length > 1) {
    const first = pool.shift();
    let bestIndex = 0;
    let bestCost = Infinity;
    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const key = [String(first.userId), String(candidate.userId)].sort().join('|');
      const immediate = latestOpponent.get(String(first.userId)) === String(candidate.userId) ? 1 : 0;
      const repeats = Number(repeatCounts.get(key) || 0);
      const scoreGap = Math.abs(Number(scoreById.get(String(first.userId)) || 0) - Number(scoreById.get(String(candidate.userId)) || 0));
      const cost = immediate * 100000 + repeats * 10000 + scoreGap * 100 + index;
      if (cost < bestCost) { bestCost = cost; bestIndex = index; }
    }
    pairs.push([first, pool.splice(bestIndex, 1)[0]]);
  }
  return pairs;
}

async function pairArenaPlayers(env, tournamentId) {
  await ensureUserPresenceTable(env);
  const tournament = await loadTournamentRow(env, tournamentId);
  if (!tournament || tournament.status !== 'running' || normalizeTournamentMode(tournament.mode) !== TOURNAMENT_MODE_ARENA) return {paired:0};
  const closed = await closeArenaTournamentIfDue(env, tournament.id);
  if (closed.closed) return {paired:0, closed:true};
  const onlineSince = presenceOnlineSinceIso();
  const pairingNow = new Date().toISOString();
  const result = await env.DB.prepare(
    `SELECT participant.user_id, participant.status, participant.checked_in_at, participant.arena_active,
            participant.arena_joined_at, participant.arena_waiting_since, participant.arena_pairing_not_before, participant.joined_at,
            COALESCE(account.username, 'Mitglied') AS username
       FROM tournament_participants participant
       JOIN users account ON account.id = participant.user_id
       JOIN user_presence presence ON presence.user_id = participant.user_id
        AND COALESCE(presence.is_online, 1) = 1
        AND presence.last_seen_at >= ?
      WHERE participant.tournament_id = ? AND participant.status = 'confirmed' AND participant.arena_active = 1
        AND (participant.arena_pairing_not_before IS NULL OR participant.arena_pairing_not_before <= ?)
        AND NOT EXISTS (
          SELECT 1 FROM tournament_games game
           WHERE game.tournament_id = participant.tournament_id
             AND game.status IN ('creating','running')
             AND (game.white_user_id = participant.user_id OR game.black_user_id = participant.user_id)
        )
      ORDER BY COALESCE(participant.arena_waiting_since, participant.arena_joined_at, participant.joined_at) ASC`
  ).bind(onlineSince, tournament.id, pairingNow).all();
  const eligible = (result && result.results ? result.results : []).map(row => ({
    userId:String(row.user_id), username:cleanDisplayName(row.username) || 'Mitglied', status:'confirmed',
    checkedIn:!!row.checked_in_at, arenaActive:Number(row.arena_active || 0),
    arenaJoinedAt:row.arena_joined_at || null, arenaWaitingSince:row.arena_waiting_since || null,
    arenaPairingNotBefore:row.arena_pairing_not_before || null, joinedAt:row.joined_at || null
  }));
  if (eligible.length < 2) return {paired:0};
  const participants = await tournamentParticipantsFor(env, tournament.id);
  const games = await tournamentGamesFor(env, tournament.id);
  const standings = tournamentArenaStandings(participants, games);
  const pairs = arenaPairingPlan(eligible, standings, games);
  let paired = 0;
  for (const pair of pairs) {
    const firstClaim = await env.DB.prepare(
      `UPDATE tournament_participants SET arena_active = 2, arena_waiting_since = NULL, arena_pairing_not_before = NULL, updated_at = ?
        WHERE tournament_id = ? AND user_id = ? AND arena_active = 1`
    ).bind(new Date().toISOString(), tournament.id, pair[0].userId).run();
    if (d1Changes(firstClaim) < 1) continue;
    const secondClaim = await env.DB.prepare(
      `UPDATE tournament_participants SET arena_active = 2, arena_waiting_since = NULL, arena_pairing_not_before = NULL, updated_at = ?
        WHERE tournament_id = ? AND user_id = ? AND arena_active = 1`
    ).bind(new Date().toISOString(), tournament.id, pair[1].userId).run();
    if (d1Changes(secondClaim) < 1) {
      await env.DB.prepare(`UPDATE tournament_participants SET arena_active = 1, arena_waiting_since = ?, arena_pairing_not_before = NULL WHERE tournament_id = ? AND user_id = ? AND arena_active = 2`)
        .bind(new Date().toISOString(), tournament.id, pair[0].userId).run();
      continue;
    }
    const sequenceRow = await env.DB.prepare(`SELECT COALESCE(MAX(pairing_number), 0) + 1 AS next_number FROM tournament_games WHERE tournament_id = ?`).bind(tournament.id).first();
    const pairingNumber = Math.max(1, Number(sequenceRow && sequenceRow.next_number || 1));
    const oriented = orientTournamentPair(pair[0], pair[1], games, pairingNumber, pairingNumber);
    const gameId = crypto.randomUUID();
    const roomId = tournamentRoomId(tournament.id, 0, pairingNumber, 1);
    const now = new Date().toISOString();
    try {
      await env.DB.prepare(
        `INSERT INTO tournament_games
           (id, tournament_id, round_number, pairing_number, game_number, room_id, white_user_id, black_user_id, status, group_name, pairing_label, result, end_reason, created_at, ended_at)
         VALUES (?, ?, 0, ?, 1, ?, ?, ?, 'creating', NULL, ?, '*', NULL, ?, NULL)`
      ).bind(gameId, tournament.id, pairingNumber, roomId, oriented[0].userId, oriented[1].userId, 'Arena-Partie ' + pairingNumber, now).run();
      const variant = normalizeTournamentVariant(tournament.variant);
      const positionId = variant === GAME_VARIANT_FREESTYLE ? randomTournamentPositionId([]) : null;
      const theme = variant === GAME_VARIANT_STANDARD ? tournamentThemeFromRow(tournament) : null;
      const setup = variant === GAME_VARIANT_FREESTYLE
        ? cleanGameSetup({variant, positionId, backRank:chess960BackRankById(positionId)})
        : cleanGameSetup({variant:GAME_VARIANT_STANDARD, theme});
      await initializeTournamentGameRoom(env, {
        roomId, tournamentGameId:gameId, tournamentId:String(tournament.id), tournamentName:cleanTournamentName(tournament.name),
        tournamentType:normalizeTournamentType(tournament.tournament_type), tournamentMode:TOURNAMENT_MODE_ARENA,
        tournamentModeLabel:tournamentModeLabel(TOURNAMENT_MODE_ARENA), roundNumber:1, roundLabel:'Arena', stage:'arena',
        pairingLabel:'Arena-Partie ' + pairingNumber, totalRounds:1, pairingNumber, gameNumber:1,
        white:{userId:oriented[0].userId, username:oriented[0].username}, black:{userId:oriented[1].userId, username:oriented[1].username},
        hoursPerMove:Number(tournament.hours_per_move || 24), timeControl:tournamentTimeControl(tournament),
        rated:Number(tournament.rated || 0) === 1, gameSetup:setup, createdByUserId:String(tournament.created_by_user_id || '')
      });
      await env.DB.prepare(`UPDATE tournament_games SET status = 'running' WHERE id = ?`).bind(gameId).run();
      const arenaTimeControl = tournamentTimeControl(tournament);
      const initialTurn = gameTurnForSetup(setup);
      const gameUrl = gamerInvitationUrl(env, roomId);
      try {
        await Promise.all([
          sendTournamentGameStartedEmailNotification(env, {
            tournamentGameId:gameId, roomId, tournamentName:cleanTournamentName(tournament.name),
            roundLabel:'Arena', pairingLabel:'Arena-Partie ' + pairingNumber, timeLabel:arenaTimeControl.label || '',
            variantLabel:tournamentGameVariantLabel(setup), gameUrl,
            recipientUserId:oriented[0].userId, opponentName:oriented[1].username, role:'w', isTurn:initialTurn === 'w'
          }),
          sendTournamentGameStartedEmailNotification(env, {
            tournamentGameId:gameId, roomId, tournamentName:cleanTournamentName(tournament.name),
            roundLabel:'Arena', pairingLabel:'Arena-Partie ' + pairingNumber, timeLabel:arenaTimeControl.label || '',
            variantLabel:tournamentGameVariantLabel(setup), gameUrl,
            recipientUserId:oriented[1].userId, opponentName:oriented[0].username, role:'b', isTurn:initialTurn === 'b'
          })
        ]);
      } catch (error) {
        console.error('Arena game start notification failed', error && error.message ? error.message : String(error || 'unknown'));
      }
      games.push({id:gameId, roundNumber:0, pairingNumber, gameNumber:1, roomId, whiteUserId:oriented[0].userId, blackUserId:oriented[1].userId, status:'running', createdAt:now});
      paired += 1;
    } catch (error) {
      await env.DB.prepare(`DELETE FROM tournament_games WHERE id = ? AND status = 'creating'`).bind(gameId).run();
      await env.DB.prepare(`UPDATE tournament_participants SET arena_active = 1, arena_waiting_since = ?, arena_pairing_not_before = NULL, updated_at = ? WHERE tournament_id = ? AND user_id IN (?, ?) AND arena_active = 2`)
        .bind(now, now, tournament.id, pair[0].userId, pair[1].userId).run();
      console.error('Arena pairing failed', error && error.message ? error.message : String(error || 'unknown'));
    }
  }
  return {paired};
}

async function autoStartScheduledTournament(env, tournamentId, options = {}) {
  const tournament = await loadTournamentRow(env, tournamentId);
  if (!tournament) return {started:false, reason:'not_found'};
  if (tournament.status === 'running') return {started:false, reason:'already_running', arenaEndsAt:tournament.arena_ends_at || null};
  if (!['open', 'full'].includes(tournament.status)) return {started:false, reason:'not_startable'};
  const scheduledMs = Date.parse(tournament.scheduled_start_at || '');
  if (!options.force && (!Number.isFinite(scheduledMs) || scheduledMs > Date.now())) return {started:false, reason:'not_due'};

  const live = tournamentIsLive(tournament);
  const mode = normalizeTournamentMode(tournament.mode);
  const arena = live && mode === TOURNAMENT_MODE_ARENA;

  const count = await env.DB.prepare(
    live
      ? `SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ? AND status = 'confirmed' AND checked_in_at IS NOT NULL`
      : `SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ? AND status = 'confirmed'`
  ).bind(tournament.id).first();
  const startingPlayers = Number(count && count.count || 0);
  const capacity = tournamentStartCapacity(tournament, startingPlayers);
  if (!capacity.ok) {
    const waiting = startingPlayers < Number(capacity.minPlayers || 0) || (!capacity.flexible && startingPlayers !== Number(capacity.maxPlayers || 0));
    return {started:false, reason:waiting ? 'waiting_for_players' : 'invalid_player_count', retry:false, startingPlayers, minPlayers:capacity.minPlayers, maxPlayers:capacity.maxPlayers};
  }

  const now = new Date().toISOString();
  if (arena) {
    const duration = normalizeTournamentArenaDuration(tournament.arena_duration_minutes);
    const baseMs = options.force || !Number.isFinite(scheduledMs) ? Date.now() : scheduledMs;
    const arenaEndsAt = new Date(baseMs + duration * 60 * 1000).toISOString();
    const changed = await env.DB.prepare(
      `UPDATE tournaments SET status = 'running', current_round = 0, total_rounds = 0, started_at = ?, arena_ends_at = ?, arena_closed_at = NULL, updated_at = ?, next_round_at = NULL
        WHERE id = ? AND status IN ('open','full')`
    ).bind(now, arenaEndsAt, now, tournament.id).run();
    if (d1Changes(changed) < 1) return {started:false, reason:'start_conflict'};
    await env.DB.prepare(
      `UPDATE tournament_participants SET arena_active = CASE WHEN checked_in_at IS NULL THEN 0 ELSE 1 END,
              arena_joined_at = CASE WHEN checked_in_at IS NULL THEN arena_joined_at ELSE COALESCE(arena_joined_at, ?) END,
              arena_waiting_since = CASE WHEN checked_in_at IS NULL THEN NULL ELSE ? END,
              arena_pairing_not_before = NULL, updated_at = ?
        WHERE tournament_id = ? AND status = 'confirmed'`
    ).bind(now, now, now, tournament.id).run();
    return {started:true, arena:true, startingPlayers, arenaEndsAt};
  }

  if (live) {
    if (mode !== TOURNAMENT_MODE_SWISS || startingPlayers > 32) return {started:false, reason:'invalid_live_mode'};
    await env.DB.prepare(
      `UPDATE tournament_participants SET status = 'absent', updated_at = ?
        WHERE tournament_id = ? AND status = 'confirmed' AND checked_in_at IS NULL`
    ).bind(now, tournament.id).run();
  }

  if (!live && mode === TOURNAMENT_MODE_KNOCKOUT) {
    const participants = (await tournamentParticipantsFor(env, tournament.id)).filter(item => item.status === 'confirmed');
    await initializeTournamentKnockoutParticipants(env, tournament, participants);
  }
  if (!live && mode === TOURNAMENT_MODE_GROUPS) {
    const participants = (await tournamentParticipantsFor(env, tournament.id)).filter(item => item.status === 'confirmed');
    await assignTournamentGroups(env, tournament.id, participants);
  }

  const totalRounds = tournamentTotalRounds(mode, startingPlayers);
  const changed = await env.DB.prepare(
    `UPDATE tournaments SET status = 'running', current_round = 1, total_rounds = ?, started_at = ?, updated_at = ?, next_round_at = NULL
      WHERE id = ? AND status IN ('open','full')`
  ).bind(totalRounds, now, now, tournament.id).run();
  if (d1Changes(changed) < 1) return {started:false, reason:'start_conflict'};
  const running = await loadTournamentRow(env, tournament.id);
  await startTournamentRound(env, running, 1);
  return {started:true, arena:false, startingPlayers};
}

async function autoStartDueTournaments(env) {
  if (!(await ensureTournamentTables(env))) return [];
  const due = await env.DB.prepare(
    `SELECT * FROM tournaments WHERE status IN ('open','full')
      AND scheduled_start_at IS NOT NULL AND scheduled_start_at <= ? ORDER BY scheduled_start_at ASC LIMIT 24`
  ).bind(new Date().toISOString()).all();
  const outcomes = [];
  for (const tournament of (due && due.results ? due.results : [])) {
    try {
      const outcome = await autoStartScheduledTournament(env, tournament.id);
      outcomes.push({tournamentId:tournament.id, ...outcome});
      if (outcome.started && outcome.arena && outcome.arenaEndsAt) {
        const row = await loadTournamentRow(env, tournament.id);
        await scheduleTournamentAlarm(env, row, outcome.arenaEndsAt, 'end');
      }
    } catch (error) {
      console.error('Automatic tournament start failed', error && error.message ? error.message : String(error || 'unknown'));
    }
  }
  return outcomes;
}

async function startTournamentRound(env, tournamentRow, roundNumber) {
  const tournamentId = String(tournamentRow && tournamentRow.id || '');
  const participants = (await tournamentParticipantsFor(env, tournamentId)).filter(item => item.status === 'confirmed');
  const capacity = tournamentStartCapacity(tournamentRow, participants.length);
  if (!capacity.ok) {
    throw new Error('Die Teilnehmerzahl ist für diese Turnierform nicht zulässig.');
  }
  const allGames = await tournamentGamesFor(env, tournamentId);
  const allByes = await tournamentByesFor(env, tournamentId);
  const allKnockoutResults = await tournamentKnockoutResultsFor(env, tournamentId);
  const historicalGames = allGames.filter(game => Number(game.roundNumber) < Number(roundNumber));
  const historicalByes = allByes.filter(bye => Number(bye.roundNumber) < Number(roundNumber));
  const historicalKnockoutResults = allKnockoutResults.filter(item => Number(item.roundNumber) < Number(roundNumber));
  const plan = tournamentRoundPlan(tournamentRow, roundNumber, participants, historicalGames, historicalByes, historicalKnockoutResults);
  if (!plan || !Array.isArray(plan.pairs) || !plan.pairs.length) throw new Error('Für diese Runde konnten keine gültigen Paarungen erzeugt werden.');
  const variant = normalizeTournamentVariant(tournamentRow.variant);
  let positionId = null;
  let backRank = '';
  const existingRound = await env.DB.prepare(
    `SELECT position_id, back_rank, stage, label FROM tournament_rounds WHERE tournament_id = ? AND round_number = ? LIMIT 1`
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
    `INSERT INTO tournament_rounds (tournament_id, round_number, position_id, back_rank, status, stage, label, started_at, ended_at)
     VALUES (?, ?, ?, ?, 'running', ?, ?, ?, NULL)
     ON CONFLICT(tournament_id, round_number) DO NOTHING`
  ).bind(tournamentId, roundNumber, positionId, backRank || null, plan.stage, plan.label, now).run();
  if (plan.bye && plan.bye.userId) {
    await env.DB.prepare(
      `INSERT INTO tournament_byes (tournament_id, round_number, user_id, points, created_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(tournament_id, round_number) DO NOTHING`
    ).bind(tournamentId, roundNumber, plan.bye.userId, now).run();
  }

  const theme = variant === GAME_VARIANT_STANDARD ? tournamentThemeFromRow(tournamentRow) : null;
  const setup = cleanGameSetup(variant === GAME_VARIANT_FREESTYLE ? {variant, positionId, backRank} : {variant:GAME_VARIANT_STANDARD, theme});
  const timeControl = tournamentTimeControl(tournamentRow);
  for (let pairingIndex = 0; pairingIndex < plan.pairs.length; pairingIndex += 1) {
    const pair = plan.pairs[pairingIndex];
    if (!pair || !pair.first || !pair.second) throw new Error('Eine Turnierpaarung ist unvollständig.');
    const oriented = plan.gamesPerPair === 1
      ? orientTournamentPair(pair.first, pair.second, historicalGames, roundNumber, pairingIndex + 1)
      : [pair.first, pair.second];
    for (let gameIndex = 0; gameIndex < Number(plan.gamesPerPair || 1); gameIndex += 1) {
      const white = gameIndex === 0 ? oriented[0] : oriented[1];
      const black = gameIndex === 0 ? oriented[1] : oriented[0];
      const existingGame = await env.DB.prepare(
        `SELECT id, room_id, status FROM tournament_games
          WHERE tournament_id = ? AND round_number = ? AND pairing_number = ? AND game_number = ? LIMIT 1`
      ).bind(tournamentId, roundNumber, pairingIndex + 1, gameIndex + 1).first();
      if (existingGame && String(existingGame.status || '') === 'ended') continue;
      const gameId = existingGame ? String(existingGame.id) : crypto.randomUUID();
      const roomId = existingGame ? String(existingGame.room_id) : tournamentRoomId(tournamentId, roundNumber, pairingIndex + 1, gameIndex + 1);
      if (!existingGame) {
        await env.DB.prepare(
          `INSERT INTO tournament_games
             (id, tournament_id, round_number, pairing_number, game_number, room_id, white_user_id, black_user_id, status, group_name, pairing_label, result, end_reason, created_at, ended_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?, '*', NULL, ?, NULL)`
        ).bind(gameId, tournamentId, roundNumber, pairingIndex + 1, gameIndex + 1, roomId, white.userId, black.userId, pair.groupName || null, pair.pairingLabel || null, now).run();
      }
      if (!existingGame || String(existingGame.status || '') !== 'running') {
        await initializeTournamentGameRoom(env, {
          roomId,
          tournamentGameId:gameId,
          tournamentId,
          tournamentName:cleanTournamentName(tournamentRow.name),
          tournamentType:normalizeTournamentType(tournamentRow.tournament_type),
          tournamentMode:normalizeTournamentMode(tournamentRow.mode),
          tournamentModeLabel:tournamentModeLabel(tournamentRow.mode),
          roundNumber,
          roundLabel:plan.label,
          stage:plan.stage,
          groupName:pair.groupName || '',
          pairingLabel:pair.pairingLabel || '',
          totalRounds:Number(tournamentRow.total_rounds || tournamentTotalRounds(tournamentRow.mode, participants.length)),
          pairingNumber:pairingIndex + 1,
          gameNumber:gameIndex + 1,
          white:{userId:white.userId, username:white.username},
          black:{userId:black.userId, username:black.username},
          hoursPerMove:Number(tournamentRow.hours_per_move || 24),
          timeControl,
          rated:Number(tournamentRow.rated || 0) === 1,
          gameSetup:setup,
          createdByUserId:String(tournamentRow.created_by_user_id || '')
        });
        await env.DB.prepare(`UPDATE tournament_games SET status = 'running' WHERE id = ?`).bind(gameId).run();
      }
      if (!existingGame || String(existingGame.status || '') !== 'running') {
        const initialTurn = gameTurnForSetup(setup);
        const gameUrl = gamerInvitationUrl(env, roomId);
        try {
          await Promise.all([
            sendTournamentGameStartedEmailNotification(env, {
              tournamentGameId:gameId, roomId, tournamentName:cleanTournamentName(tournamentRow.name),
              roundLabel:plan.label, pairingLabel:pair.pairingLabel || '', timeLabel:timeControl.label || '',
              variantLabel:tournamentGameVariantLabel(setup), gameUrl,
              recipientUserId:white.userId, opponentName:black.username, role:'w', isTurn:initialTurn === 'w'
            }),
            sendTournamentGameStartedEmailNotification(env, {
              tournamentGameId:gameId, roomId, tournamentName:cleanTournamentName(tournamentRow.name),
              roundLabel:plan.label, pairingLabel:pair.pairingLabel || '', timeLabel:timeControl.label || '',
              variantLabel:tournamentGameVariantLabel(setup), gameUrl,
              recipientUserId:black.userId, opponentName:white.username, role:'b', isTurn:initialTurn === 'b'
            })
          ]);
        } catch (error) {
          console.error('Tournament game start notification failed', error && error.message ? error.message : String(error || 'unknown'));
        }
      }
    }
  }
  return {roundNumber, positionId, backRank, stage:plan.stage, label:plan.label, bye:plan.bye || null};
}

async function advanceTournamentRoundIfReady(env, tournamentId, roundNumber) {
  if (!(await ensureTournamentTables(env))) return;
  const remaining = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM tournament_games
      WHERE tournament_id = ? AND round_number = ? AND status <> 'ended'`
  ).bind(tournamentId, roundNumber).first();
  if (Number(remaining && remaining.count || 0) > 0) return;
  const readyTournament = await loadTournamentRow(env, tournamentId);
  if (readyTournament && normalizeTournamentMode(readyTournament.mode) === TOURNAMENT_MODE_KNOCKOUT) {
    await ensureKnockoutRoundResults(env, readyTournament, roundNumber, {requireAll:true});
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE tournament_rounds SET status = 'ended', ended_at = COALESCE(ended_at, ?)
      WHERE tournament_id = ? AND round_number = ?`
  ).bind(now, tournamentId, roundNumber).run();
  const tournament = await loadTournamentRow(env, tournamentId);
  if (!tournament || tournament.status !== 'running' || Number(tournament.current_round || 0) !== Number(roundNumber)) return;
  if (Number(roundNumber) >= Number(tournament.total_rounds || 0)) {
    await env.DB.prepare(
      `UPDATE tournaments SET status = 'ended', ended_at = ?, updated_at = ?, next_round_at = NULL
        WHERE id = ? AND status = 'running' AND current_round = ?`
    ).bind(now, now, tournamentId, roundNumber).run();
    return;
  }
  const nextRound = Number(roundNumber) + 1;
  if (tournamentIsLive(tournament)) {
    const pauseSeconds = Math.max(10, Math.min(300, Number(tournament.round_pause_seconds || 60)));
    const nextRoundAt = new Date(Date.now() + pauseSeconds * 1000).toISOString();
    await env.DB.prepare(
      `UPDATE tournaments SET current_round = ?, next_round_at = ?, updated_at = ?
        WHERE id = ? AND status = 'running' AND current_round = ?`
    ).bind(nextRound, nextRoundAt, now, tournamentId, roundNumber).run();
    return;
  }
  const changed = await env.DB.prepare(
    `UPDATE tournaments SET current_round = ?, updated_at = ?
      WHERE id = ? AND status = 'running' AND current_round = ?`
  ).bind(nextRound, now, tournamentId, roundNumber).run();
  if (d1Changes(changed) > 0) {
    const updated = await loadTournamentRow(env, tournamentId);
    try {
      await startTournamentRound(env, updated, nextRound);
    } catch (error) {
      console.error('Tournament round preparation interrupted', error && error.message ? error.message : String(error || 'unknown'));
      throw error;
    }
  }
}

async function repairRunningKnockoutTournaments(env) {
  if (!(await ensureTournamentTables(env))) return;
  const result = await env.DB.prepare(
    `SELECT * FROM tournaments
      WHERE status = 'running' AND mode = ?
      ORDER BY updated_at ASC LIMIT 24`
  ).bind(TOURNAMENT_MODE_KNOCKOUT).all();
  for (const row of (result && result.results ? result.results : [])) {
    const roundNumber = Number(row.current_round || 0);
    if (roundNumber < 1) continue;
    try {
      const participants = (await tournamentParticipantsFor(env, String(row.id))).filter(item => item.status === 'confirmed');
      const finalRound = tournamentTotalRounds(TOURNAMENT_MODE_KNOCKOUT, participants.length);
      const expectedGames = Number(roundNumber) === finalRound
        ? 4
        : Math.max(2, Math.floor(participants.length / Math.pow(2, roundNumber - 1)));
      const gameCountRow = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id = ? AND round_number = ?`
      ).bind(String(row.id), roundNumber).first();
      if (Number(gameCountRow && gameCountRow.count || 0) < expectedGames) {
        await startTournamentRound(env, row, roundNumber);
      }
      await advanceTournamentRoundIfReady(env, String(row.id), roundNumber);
    } catch (error) {
      console.error('K.-o.-Turnierfortschritt konnte nicht repariert werden', error && error.message ? error.message : String(error || 'unknown'));
    }
  }
}

async function startLiveTournamentRoundIfDue(env, tournamentId) {
  const tournament = await loadTournamentRow(env, tournamentId);
  if (!tournament || tournament.status !== 'running' || !tournamentIsLive(tournament) || !tournament.next_round_at) return false;
  const dueAt = Date.parse(tournament.next_round_at);
  if (!Number.isFinite(dueAt) || dueAt > Date.now()) return false;
  const claimed = await env.DB.prepare(
    `UPDATE tournaments SET next_round_at = NULL, updated_at = ?
      WHERE id = ? AND status = 'running' AND next_round_at = ?`
  ).bind(new Date().toISOString(), tournament.id, tournament.next_round_at).run();
  if (d1Changes(claimed) < 1) return false;
  const claimedRow = await loadTournamentRow(env, tournament.id);
  try {
    await startTournamentRound(env, claimedRow, Number(claimedRow.current_round || 1));
    return true;
  } catch (error) {
    await env.DB.prepare(`UPDATE tournaments SET next_round_at = ?, updated_at = ? WHERE id = ? AND status = 'running' AND next_round_at IS NULL`)
      .bind(new Date(Date.now() + 5000).toISOString(), new Date().toISOString(), tournament.id).run();
    throw error;
  }
}

async function syncTournamentGameResult(env, tournamentMeta, game) {
  if (!tournamentMeta || !tournamentMeta.tournamentId || !tournamentMeta.tournamentGameId || !(await ensureTournamentTables(env))) return;
  const ended = !!(game && game.ended);
  const tournamentId = String(tournamentMeta.tournamentId);
  const indexedGame = ended ? await env.DB.prepare(
    `SELECT white_user_id, black_user_id FROM tournament_games WHERE id = ? AND tournament_id = ? LIMIT 1`
  ).bind(String(tournamentMeta.tournamentGameId), tournamentId).first() : null;
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
    tournamentId
  ).run();
  if (!ended) return;
  const tournament = await loadTournamentRow(env, tournamentId);
  if (tournament && normalizeTournamentMode(tournament.mode) === TOURNAMENT_MODE_ARENA) {
    const deadlinePassed = !!tournament.arena_closed_at || (Number.isFinite(Date.parse(tournament.arena_ends_at || '')) && Date.parse(tournament.arena_ends_at) <= Date.now());
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const pairingNotBefore = deadlinePassed ? null : new Date(nowMs + ARENA_REPAIR_DELAY_MS).toISOString();
    if (indexedGame) {
      await env.DB.prepare(
        `UPDATE tournament_participants SET arena_active = ?, arena_waiting_since = ?, arena_pairing_not_before = ?, updated_at = ?
          WHERE tournament_id = ? AND user_id IN (?, ?) AND status = 'confirmed'`
      ).bind(deadlinePassed ? 0 : 1, deadlinePassed ? null : now, pairingNotBefore, now, tournamentId, indexedGame.white_user_id, indexedGame.black_user_id).run();
    }
    if (deadlinePassed) await closeArenaTournamentIfDue(env, tournamentId);
    else await pairArenaPlayers(env, tournamentId);
    return;
  }
  if (tournament && normalizeTournamentMode(tournament.mode) === TOURNAMENT_MODE_KNOCKOUT) {
    await ensureKnockoutRoundResults(env, tournament, Number(tournamentMeta.roundNumber || 0));
  }
  await advanceTournamentRoundIfReady(env, tournamentId, Number(tournamentMeta.roundNumber || 0));
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
  const theme = tournamentThemeFromRow(tournament);
  const variant = theme ? `Thementurnier: ${theme.name} (${theme.moveText})` : (normalizeTournamentVariant(tournament.variant) === GAME_VARIANT_FREESTYLE ? 'Freestyle (Chess960)' : 'Klassisch');
  const mode = tournamentModeLabel(tournament.mode);
  const type = tournamentTypeLabel(tournament.tournament_type);
  const time = tournamentTimeLabel(tournament.tournament_type, tournament.time_key, tournament.hours_per_move);
  const scheduled = tournament.scheduled_start_at
    ? new Date(tournament.scheduled_start_at).toLocaleString('de-DE', {timeZone:'Europe/Berlin', dateStyle:'medium', timeStyle:'short'}) + ' Uhr'
    : '';
  const normalizedMode = normalizeTournamentMode(tournament.mode);
  const arena = normalizedMode === TOURNAMENT_MODE_ARENA;
  const swiss = normalizedMode === TOURNAMENT_MODE_SWISS;
  const participation = arena
    ? `offene Teilnehmerzahl · ${normalizeTournamentArenaDuration(tournament.arena_duration_minutes)} Minuten Arena`
    : swiss
      ? `maximal ${Number(tournament.max_players)} Teilnehmer · Start ab 4`
      : `${Number(tournament.max_players)} Teilnehmer`;
  const details = `${type} · ${mode} · ${participation} · ${time} · ${variant} · ${Number(tournament.rated || 0) === 1 ? 'gewertet' : 'ohne Rating'}${scheduled ? ` · Start: ${scheduled}` : ''}`;
  const subject = `Neues Hammerschach-Turnier: ${title}`;
  const startHint = tournamentIsLive(tournament)
    ? '\n\nDer Check-in öffnet eine Stunde vor dem Turnierstart. Das Turnier startet automatisch, sobald die Startvoraussetzungen erfüllt sind.'
    : swiss
      ? '\n\nDas Turnier startet zum geplanten Termin automatisch, sobald mindestens 4 Teilnehmer bestätigt sind.'
      : '\n\nDas Turnier startet zum geplanten Termin automatisch, sobald alle Startplätze belegt sind.';
  const textPart = `Hallo ${name},\n\nfür das Turnier „${title}“ ist die Anmeldung geöffnet.\n\n${details}\n\n${link ? `Turnier ansehen und Teilnahme bestätigen:\n${link}\n\n` : ''}Die Teilnahme wird erst nach deiner ausdrücklichen Bestätigung im Turnierbereich eingetragen.${startHint}${arena ? '\nIn die laufende Arena kannst du auch später jederzeit einsteigen.' : ''}\n\nDu kannst Turniermails jederzeit in deiner Accountverwaltung ausschalten.\n\nViele Grüße\nHammerschach-Gamer`;
  const button = link ? `<p style="margin:22px 0;"><a href="${escapeEmailHtml(link)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">Turnier ansehen</a></p>` : '';
  const startHintHtml = tournamentIsLive(tournament)
    ? '<p>Der Check-in öffnet eine Stunde vor dem Turnierstart. Das Turnier startet automatisch, sobald die Startvoraussetzungen erfüllt sind.</p>'
    : swiss
      ? '<p>Das Turnier startet zum geplanten Termin automatisch, sobald mindestens 4 Teilnehmer bestätigt sind.</p>'
      : '<p>Das Turnier startet zum geplanten Termin automatisch, sobald alle Startplätze belegt sind.</p>';
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><div style="font-size:12px;font-weight:bold;text-transform:uppercase;color:#777;">Hammerschach-Turniere</div><h2 style="color:#843f46;">${escapeEmailHtml(title)}</h2><p>Hallo ${escapeEmailHtml(name)},</p><p>für dieses ${escapeEmailHtml(type)}-Turnier ist die Anmeldung geöffnet.</p><p><strong>${escapeEmailHtml(details)}</strong></p>${button}<p>Die Teilnahme wird erst nach deiner ausdrücklichen Bestätigung im Turnierbereich eingetragen.</p>${startHintHtml}${arena ? '<p>Ein späterer Einstieg in die laufende Arena ist jederzeit möglich.</p>' : ''}<hr style="border:0;border-top:1px solid #eee;margin:22px 0;"><p style="font-size:12px;color:#777;">Turniermails kannst du jederzeit in deiner Accountverwaltung ausschalten.</p><p>Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return {ok:true, mailType:'tournament_published', recipientEmail:recipient.email, recipientName:name, subject, textPart, htmlPart, attachments:[]};
}

function tournamentGameVariantLabel(setup) {
  const normalized = cleanGameSetup(setup || null);
  if (normalized.variant === GAME_VARIANT_FREESTYLE) return `Freestyle · Stellung #${normalized.positionId}`;
  if (normalized.theme && normalized.theme.name) return `Thementurnier · ${cleanTournamentName(normalized.theme.name)}`;
  return 'Klassisch';
}

function prepareTournamentGameStartedEmail(payload) {
  const recipientEmail = normalizeEmail(payload && payload.recipientEmail);
  const recipientName = cleanDisplayName(payload && payload.recipientName) || 'Schachfreund';
  const opponentName = cleanDisplayName(payload && payload.opponentName) || 'dein Gegner';
  const tournamentName = cleanTournamentName(payload && payload.tournamentName) || 'Hammerschach-Turnier';
  const roundLabel = String(payload && payload.roundLabel || 'Turnierrunde').replace(/[\r\n<>]/g, '').trim().slice(0, 80);
  const pairingLabel = String(payload && payload.pairingLabel || '').replace(/[\r\n<>]/g, '').trim().slice(0, 80);
  const color = payload && payload.role === 'b' ? 'Schwarz' : 'Weiß';
  const timeLabel = String(payload && payload.timeLabel || '').replace(/[\r\n<>]/g, '').trim().slice(0, 120);
  const variantLabel = String(payload && payload.variantLabel || 'Klassisch').replace(/[\r\n<>]/g, '').trim().slice(0, 140);
  const gameUrl = String(payload && payload.gameUrl || '').trim();
  const isTurn = payload && payload.isTurn === true;
  if (!recipientEmail || !gameUrl) return {ok:false, status:400, code:'INVALID_TOURNAMENT_START_MAIL', message:'Die Turnierstart-Mail konnte nicht vorbereitet werden.'};
  const subject = isTurn
    ? `Turnierpartie gestartet – du bist am Zug gegen ${opponentName}`
    : `Turnierpartie gestartet – gegen ${opponentName}`;
  const details = [
    `Turnier: ${tournamentName}`,
    `Runde: ${roundLabel}`,
    `Gegner: ${opponentName}`,
    `Deine Farbe: ${color}`,
    `Variante: ${variantLabel}`
  ];
  if (pairingLabel) details.push(`Paarung: ${pairingLabel}`);
  if (timeLabel) details.push(`Bedenkzeit: ${timeLabel}`);
  if (isTurn) details.push('Du bist am Zug.');
  const turnText = isTurn
    ? ' Die Partie ist eröffnet und du bist am Zug.'
    : ` Die Partie ist eröffnet; zunächst ist ${opponentName} am Zug.`;
  const textPart = `Hallo ${recipientName},\n\ndeine Partie im Turnier „${tournamentName}“ wurde gestartet.${turnText}\n\n${details.join('\n')}\n\nPartie öffnen:\n${gameUrl}\n\nDiese Nachricht ist eine notwendige Information zu deiner bestätigten Turnierteilnahme.\n\nViele Grüße\nHammerschach-Gamer`;
  const detailHtml = details.map(line => escapeEmailHtml(line)).join('<br>');
  const heading = isTurn ? 'Turnierpartie gestartet – du bist am Zug' : 'Deine Turnierpartie wurde gestartet';
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><div style="font-size:12px;font-weight:bold;text-transform:uppercase;color:#777;">Hammerschach-Turniere</div><h2 style="margin:8px 0 18px;color:#843f46;">${escapeEmailHtml(heading)}</h2><p>Hallo ${escapeEmailHtml(recipientName)},</p><p>Deine Partie im Turnier <strong>„${escapeEmailHtml(tournamentName)}“</strong> wurde gestartet.${isTurn ? ' <strong>Du bist am Zug.</strong>' : ` Zunächst ist <strong>${escapeEmailHtml(opponentName)}</strong> am Zug.`}</p><div style="margin:18px 0;padding:12px 14px;background:#f6f1f2;border:1px solid #e5d3d6;border-radius:10px;line-height:1.55;">${detailHtml}</div><p style="margin:22px 0;"><a href="${escapeEmailHtml(gameUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">Partie öffnen</a></p><p style="font-size:13px;color:#666;word-break:break-all;">Falls die Schaltfläche nicht funktioniert:<br>${escapeEmailHtml(gameUrl)}</p><hr style="border:0;border-top:1px solid #eee;margin:22px 0;"><p style="font-size:12px;color:#777;">Diese Nachricht ist eine notwendige Information zu deiner bestätigten Turnierteilnahme.</p><p style="margin-bottom:0;">Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return {ok:true, mailType:'tournament_game_started', recipientEmail, recipientName, subject, textPart, htmlPart, attachments:[]};
}

async function sendTournamentGameStartedEmailNotification(env, payload) {
  const recipient = await loadEmailNotificationRecipient(env, payload && payload.recipientUserId, null);
  if (!recipient.ok) return {ok:true, skipped:true, reason:recipient.reason};
  const notificationKey = `tournament_game_started:${String(payload && payload.tournamentGameId || '')}:${String(recipient.user.id || '')}`;
  const claim = await claimEmailNotification(env, notificationKey, 'tournament_game_started', recipient.user.id, payload.roomId);
  if (!claim.claimed) return {ok:true, skipped:true, reason:claim.reason};
  let result;
  try {
    result = await sendPreparedTransactionalEmail(env, prepareTournamentGameStartedEmail({
      ...payload,
      recipientEmail:recipient.email,
      recipientName:recipient.user.username
    }));
  } catch (error) {
    result = {ok:false, code:'TOURNAMENT_START_MAIL_FAILED', message:error && error.message ? error.message : 'Turnierstart-Mail fehlgeschlagen.'};
  }
  try { await completeEmailNotification(env, claim.key, result); } catch (_) {}
  return result;
}

function prepareTournamentFullAdminEmail(env, tournament, admin) {
  const link = tournamentPublicUrl(env, tournament.id);
  const adminName = cleanDisplayName(admin.username) || 'Andili';
  const title = cleanTournamentName(tournament.name);
  const playerCount = Number(tournament.max_players || 0);
  const live = tournamentIsLive(tournament);
  const scheduled = tournament.scheduled_start_at
    ? new Date(tournament.scheduled_start_at).toLocaleString('de-DE', {timeZone:'Europe/Berlin', dateStyle:'medium', timeStyle:'short'}) + ' Uhr'
    : '';
  const nextStepText = live
    ? `Der Check-in öffnet eine Stunde vor dem geplanten Start${scheduled ? ` am ${scheduled}` : ''}. Das Turnier startet automatisch, sobald die Startvoraussetzungen erfüllt sind.`
    : scheduled
      ? `Das vollständig belegte Daily-Turnier startet automatisch zum geplanten Termin am ${scheduled}. Du musst es nicht manuell starten.`
      : 'Dieses ältere Daily-Turnier besitzt noch keinen geplanten Start und kann wie bisher manuell gestartet werden.';
  const subject = `Turnier vollständig belegt: ${title}`;
  const textPart = `Hallo ${adminName},\n\ndas Turnier „${title}“ ist mit ${playerCount} von ${playerCount} bestätigten Teilnehmern vollständig belegt.\n\n${nextStepText}\n\n${link ? `Turnier öffnen:\n${link}\n\n` : ''}Du musst zum Startzeitpunkt nicht online sein.\n\nViele Grüße\nHammerschach-Gamer`;
  const button = link ? `<p style="margin:22px 0;"><a href="${escapeEmailHtml(link)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#843f46;color:#fff;text-decoration:none;font-weight:bold;">Turnier öffnen</a></p>` : '';
  const htmlPart = `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px;box-sizing:border-box;"><div style="font-size:12px;font-weight:bold;text-transform:uppercase;color:#777;">Hammerschach-Turniere · Admin-Hinweis</div><h2 style="color:#843f46;">${escapeEmailHtml(title)} ist vollständig belegt</h2><p>Hallo ${escapeEmailHtml(adminName)},</p><p>das Turnier ist mit <strong>${playerCount} von ${playerCount} bestätigten Teilnehmern</strong> vollständig belegt.</p><p>${escapeEmailHtml(nextStepText)}</p>${button}<p>Du musst zum Startzeitpunkt nicht online sein.</p><p>Viele Grüße<br><strong>Hammerschach-Gamer</strong></p></div></body></html>`;
  return {ok:true, mailType:'tournament_full_admin', recipientEmail:admin.email, recipientName:adminName, subject, textPart, htmlPart, attachments:[]};
}

async function notifyAdminTournamentFull(env, tournamentId) {
  let claimedAt = '';
  try {
    const tournament = await loadTournamentRow(env, tournamentId);
    if (!tournament || tournament.status !== 'full') return {sent:false, reason:'not_full'};
    claimedAt = new Date().toISOString();
    const claimed = await env.DB.prepare(
      `UPDATE tournaments SET full_notification_sent_at = ?
        WHERE id = ? AND status = 'full' AND full_notification_sent_at IS NULL`
    ).bind(claimedAt, tournamentId).run();
    if (d1Changes(claimed) < 1) return {sent:false, reason:'already_notified'};

    const result = await env.DB.prepare(`SELECT id, username, email FROM users ORDER BY id`).all();
    const admin = (result && result.results ? result.results : []).find(user => isAdminUser(user, env));
    const email = normalizeEmail(admin && admin.email);
    if (!admin || !email) {
      await env.DB.prepare(`UPDATE tournaments SET full_notification_sent_at = NULL WHERE id = ? AND full_notification_sent_at = ?`).bind(tournamentId, claimedAt).run();
      return {sent:false, reason:'admin_email_missing'};
    }
    const security = await getUserEmailSecurityState(env, admin);
    if (!security.emailVerified) {
      await env.DB.prepare(`UPDATE tournaments SET full_notification_sent_at = NULL WHERE id = ? AND full_notification_sent_at = ?`).bind(tournamentId, claimedAt).run();
      return {sent:false, reason:'admin_email_unverified'};
    }
    const mail = await sendInvitationEmail(env, {
      preparedMail:prepareTournamentFullAdminEmail(env, tournament, {username:admin.username, email}),
      mailType:'tournament_full_admin'
    });
    if (!mail || !mail.ok) {
      await env.DB.prepare(`UPDATE tournaments SET full_notification_sent_at = NULL WHERE id = ? AND full_notification_sent_at = ?`).bind(tournamentId, claimedAt).run();
      return {sent:false, reason:'send_failed'};
    }
    return {sent:true};
  } catch (error) {
    console.error('Tournament full admin notification failed', error && error.message ? error.message : String(error || 'unknown'));
    if (claimedAt) {
      try { await env.DB.prepare(`UPDATE tournaments SET full_notification_sent_at = NULL WHERE id = ? AND full_notification_sent_at = ?`).bind(tournamentId, claimedAt).run(); } catch (_) {}
    }
    return {sent:false, reason:'notification_failed'};
  }
}

async function sendTournamentPublishedEmails(env, tournament) {
  await ensureUserEmailPreferencesTable(env);
  const usersResult = await env.DB.prepare(`SELECT id, username, email FROM users ORDER BY id`).all();
  const users = usersResult && usersResult.results ? usersResult.results : [];
  let sent = 0;
  let failed = 0;
  for (const user of users) {
    const usable = await requireUsableAccount(env, user);
    if (!usable.ok) continue;
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
       rating_type TEXT,
       public_game INTEGER NOT NULL DEFAULT 0,
       spectator_id TEXT,
       tournament_id TEXT,
       tournament_name TEXT,
       tournament_round_label TEXT,
       protected INTEGER NOT NULL DEFAULT 0,
       archive_visible INTEGER NOT NULL DEFAULT 1,
       pgn TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  ).run();
  try { await env.DB.prepare(`ALTER TABLE completed_games ADD COLUMN rating_type TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE completed_games ADD COLUMN public_game INTEGER NOT NULL DEFAULT 0`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE completed_games ADD COLUMN spectator_id TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE completed_games ADD COLUMN tournament_id TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE completed_games ADD COLUMN tournament_name TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE completed_games ADD COLUMN tournament_round_label TEXT`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE completed_games ADD COLUMN protected INTEGER NOT NULL DEFAULT 0`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE completed_games ADD COLUMN archive_visible INTEGER NOT NULL DEFAULT 1`).run(); } catch (_) {}
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_completed_games_white ON completed_games (white_user_id, ended_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_completed_games_black ON completed_games (black_user_id, ended_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_completed_games_public_archive ON completed_games (public_game, archive_visible, ended_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_completed_games_tournament ON completed_games (tournament_id, ended_at)`).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS game_archive_favorites (
       room_id TEXT NOT NULL,
       user_id TEXT NOT NULL,
       created_at TEXT NOT NULL,
       note TEXT NOT NULL DEFAULT '',
       updated_at TEXT,
       PRIMARY KEY (room_id, user_id)
     )`
  ).run();
  try { await env.DB.prepare(`ALTER TABLE game_archive_favorites ADD COLUMN note TEXT NOT NULL DEFAULT ''`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE game_archive_favorites ADD COLUMN updated_at TEXT`).run(); } catch (_) {}
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_game_archive_favorites_user ON game_archive_favorites (user_id, created_at)`).run();
  completedGamesTableReady = true;
  return true;
}

let chessChronicleTableReady = false;
let chessChronicleMetadataBackfillDone = false;
async function ensureChessChronicleTable(env) {
  if (!env || !env.DB) return false;
  if (chessChronicleTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS chess_chronicle_games (
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
       started_at TEXT,
       ended_at TEXT NOT NULL,
       result TEXT NOT NULL,
       end_reason TEXT,
       rated INTEGER NOT NULL DEFAULT 0,
       rating_type TEXT,
       tournament_id TEXT,
       tournament_name TEXT,
       tournament_round_label TEXT,
       opening_name TEXT NOT NULL DEFAULT '',
       opening_moves TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_chess_chronicle_white ON chess_chronicle_games (white_user_id, ended_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_chess_chronicle_black ON chess_chronicle_games (black_user_id, ended_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_chess_chronicle_tournament ON chess_chronicle_games (tournament_id, ended_at)`).run();
  chessChronicleTableReady = true;
  return true;
}

async function backfillChessChronicleMetadata(env) {
  if (chessChronicleMetadataBackfillDone) return true;
  if (!(await ensureChessChronicleTable(env))) return false;
  await ensureCompletedGamesTable(env);
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO chess_chronicle_games (
       room_id, white_user_id, black_user_id, white_name, black_name,
       mode, time_label, days_per_move, variant, position_id,
       started_at, ended_at, result, end_reason, rated, rating_type,
       tournament_id, tournament_name, tournament_round_label,
       opening_name, opening_moves, created_at, updated_at
     )
     SELECT room_id, white_user_id, black_user_id, white_name, black_name,
            mode, time_label, days_per_move, variant, position_id,
            started_at, ended_at, result, end_reason, rated, rating_type,
            tournament_id, tournament_name, tournament_round_label,
            '', '', COALESCE(ended_at, updated_at, ?), COALESCE(updated_at, ended_at, ?)
       FROM completed_games`
  ).bind(nowIso, nowIso).run();
  chessChronicleMetadataBackfillDone = true;
  return true;
}

async function backfillChessChronicleOpenings(env, limit = 400) {
  if (!(await ensureChessChronicleTable(env))) return 0;
  await ensureCompletedGamesTable(env);
  const maximum = Math.max(1, Math.min(1000, Number(limit || 400)));
  const result = await env.DB.prepare(
    `SELECT chronicle.room_id, completed.pgn, chronicle.variant
       FROM chess_chronicle_games chronicle
       JOIN completed_games completed ON completed.room_id = chronicle.room_id
      WHERE chronicle.opening_name = '' AND chronicle.opening_moves = ''
      ORDER BY chronicle.ended_at ASC
      LIMIT ?`
  ).bind(maximum).all();
  const rows = result && Array.isArray(result.results) ? result.results : [];
  const updatedAt = new Date().toISOString();
  const statements = [];
  for (const row of rows) {
    const summary = gameStartSummaryFromPgn(row.pgn, row.variant);
    if (!summary) continue;
    statements.push(env.DB.prepare(
      `UPDATE chess_chronicle_games
          SET opening_name = ?, opening_moves = ?, updated_at = ?
        WHERE room_id = ?`
    ).bind(String(summary.name || '').slice(0, 120), String(summary.moveText || '').slice(0, 320), updatedAt, row.room_id));
  }
  if (statements.length) await env.DB.batch(statements);
  return statements.length;
}

async function upsertChessChronicleGame(env, game) {
  if (!(await ensureChessChronicleTable(env)) || !game) return false;
  const roomId = cleanRoomId(game.roomId || game.room_id);
  if (!roomId) return false;
  const summary = gameStartSummaryFromPgn(game.pgn, game.variant) || {name:'', moveText:''};
  const nowIso = new Date().toISOString();
  const endedAt = game.endedAt || game.ended_at || nowIso;
  await env.DB.prepare(
    `INSERT INTO chess_chronicle_games (
       room_id, white_user_id, black_user_id, white_name, black_name,
       mode, time_label, days_per_move, variant, position_id,
       started_at, ended_at, result, end_reason, rated, rating_type,
       tournament_id, tournament_name, tournament_round_label,
       opening_name, opening_moves, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       started_at = excluded.started_at,
       ended_at = excluded.ended_at,
       result = excluded.result,
       end_reason = excluded.end_reason,
       rated = excluded.rated,
       rating_type = excluded.rating_type,
       tournament_id = excluded.tournament_id,
       tournament_name = excluded.tournament_name,
       tournament_round_label = excluded.tournament_round_label,
       opening_name = excluded.opening_name,
       opening_moves = excluded.opening_moves,
       updated_at = excluded.updated_at`
  ).bind(
    roomId,
    game.whiteUserId || game.white_user_id || null,
    game.blackUserId || game.black_user_id || null,
    cleanDisplayName(game.whiteName || game.white_name) || 'Weiß',
    cleanDisplayName(game.blackName || game.black_name) || 'Schwarz',
    game.mode === 'daily' ? 'daily' : 'live',
    String(game.timeLabel || game.time_label || '').slice(0, 80),
    game.daysPerMove != null ? Math.max(1, Number(game.daysPerMove || game.days_per_move || 1)) : null,
    game.variant === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD,
    game.positionId != null ? Number(game.positionId) : (game.position_id != null ? Number(game.position_id) : null),
    game.startedAt || game.started_at || null,
    endedAt,
    String(game.result || '*').slice(0, 16),
    String(game.endReason || game.end_reason || '').slice(0, 80) || null,
    game.rated ? 1 : 0,
    String(game.ratingType || game.rating_type || '').slice(0, 40) || null,
    String(game.tournamentId || game.tournament_id || '').slice(0, 128) || null,
    String(game.tournamentName || game.tournament_name || '').slice(0, 160) || null,
    String(game.tournamentRoundLabel || game.tournament_round_label || '').slice(0, 80) || null,
    String(summary.name || '').slice(0, 120),
    String(summary.moveText || '').slice(0, 320),
    endedAt,
    nowIso
  ).run();
  return true;
}

function chessChronicleOutcome(row, userId) {
  const role = String(row && row.white_user_id || '') === String(userId || '') ? 'w' : 'b';
  const result = String(row && row.result || '*');
  if (result === '1/2-1/2') return {code:'draw', label:'Remis'};
  const won = (role === 'w' && result === '1-0') || (role === 'b' && result === '0-1');
  if (result === '1-0' || result === '0-1') return won ? {code:'win', label:'Sieg'} : {code:'loss', label:'Niederlage'};
  return {code:'ended', label:'Beendet'};
}

function chessChronicleGameDto(row, userId, milestoneMap) {
  const role = String(row.white_user_id || '') === String(userId || '') ? 'w' : 'b';
  const opponentName = role === 'w' ? row.black_name : row.white_name;
  const ratingBefore = role === 'w' ? Number(row.white_rating_before) : Number(row.black_rating_before);
  const ratingAfter = role === 'w' ? Number(row.white_rating_after) : Number(row.black_rating_after);
  const hasRating = Number.isFinite(ratingBefore) && Number.isFinite(ratingAfter);
  const fallbackOpening = (!row.opening_name && !row.opening_moves && row.completed_pgn)
    ? gameStartSummaryFromPgn(row.completed_pgn, row.variant)
    : null;
  const openingName = String(row.opening_name || (fallbackOpening && fallbackOpening.name) || '').slice(0, 120);
  const openingMoves = String(row.opening_moves || (fallbackOpening && fallbackOpening.moveText) || '').slice(0, 320);
  const info = ratingTypeInfo(row.rating_type);
  return {
    roomId:cleanRoomId(row.room_id),
    role,
    opponentName:cleanDisplayName(opponentName) || 'Gegner',
    whiteName:cleanDisplayName(row.white_name) || 'Weiß',
    blackName:cleanDisplayName(row.black_name) || 'Schwarz',
    mode:row.mode === 'daily' ? 'daily' : 'live',
    timeLabel:String(row.time_label || '').slice(0, 80),
    daysPerMove:row.days_per_move != null ? Number(row.days_per_move) : null,
    variant:row.variant === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD,
    positionId:row.position_id != null ? Number(row.position_id) : null,
    startedAt:row.started_at || null,
    endedAt:row.ended_at || null,
    result:String(row.result || '*').slice(0, 16),
    endReason:String(row.end_reason || '').slice(0, 80),
    outcome:chessChronicleOutcome(row, userId),
    rated:Number(row.rated || 0) === 1,
    ratingType:String(row.rating_type || '').slice(0, 40),
    ratingLabel:info ? info.label : '',
    ratingBefore:hasRating ? Math.round(ratingBefore) : null,
    ratingAfter:hasRating ? Math.round(ratingAfter) : null,
    ratingDelta:hasRating ? Math.round(ratingAfter) - Math.round(ratingBefore) : null,
    tournamentId:String(row.tournament_id || '').slice(0, 128),
    tournamentName:String(row.tournament_name || '').slice(0, 160),
    tournamentRoundLabel:String(row.tournament_round_label || '').slice(0, 80),
    favorite:Number(row.favorite || 0) === 1,
    momentNote:cleanGameMomentNote(row.moment_note),
    momentAt:row.moment_created_at || null,
    opening:{name:openingName, moveText:openingMoves},
    archiveAvailable:Number(row.archive_available || 0) === 1,
    milestones:(milestoneMap && milestoneMap.get(String(row.room_id || ''))) || []
  };
}

async function chessChronicleMilestones(env, userId) {
  const uid = String(userId || '');
  const milestones = [];
  const specs = [
    {
      code:'first_game', label:'Deine erste Partie im Gamer',
      sql:`SELECT room_id, ended_at FROM chess_chronicle_games WHERE white_user_id = ? OR black_user_id = ? ORDER BY ended_at ASC LIMIT 1`,
      values:[uid, uid]
    },
    {
      code:'first_win', label:'Dein erster Sieg',
      sql:`SELECT room_id, ended_at FROM chess_chronicle_games
            WHERE (white_user_id = ? OR black_user_id = ?)
              AND ((white_user_id = ? AND result = '1-0') OR (black_user_id = ? AND result = '0-1'))
            ORDER BY ended_at ASC LIMIT 1`,
      values:[uid, uid, uid, uid]
    },
    {
      code:'first_moment', label:'Dein erster Gamer-Moment',
      sql:`SELECT chronicle.room_id, chronicle.ended_at
             FROM chess_chronicle_games chronicle
             JOIN game_archive_favorites moment ON moment.room_id = chronicle.room_id AND moment.user_id = ?
            WHERE chronicle.white_user_id = ? OR chronicle.black_user_id = ?
            ORDER BY COALESCE(moment.created_at, chronicle.ended_at) ASC LIMIT 1`,
      values:[uid, uid, uid]
    },
    {
      code:'first_tournament', label:'Deine erste Turnierpartie',
      sql:`SELECT room_id, ended_at FROM chess_chronicle_games
            WHERE (white_user_id = ? OR black_user_id = ?)
              AND tournament_id IS NOT NULL AND tournament_id <> ''
            ORDER BY ended_at ASC LIMIT 1`,
      values:[uid, uid]
    }
  ];
  for (const spec of specs) {
    const row = await env.DB.prepare(spec.sql).bind(...spec.values).first();
    if (row && row.room_id) milestones.push({code:spec.code, label:spec.label, roomId:String(row.room_id), endedAt:row.ended_at || null});
  }
  return milestones;
}

async function listChessChronicle(env, sessionUser, url) {
  const userId = String(sessionUser && sessionUser.id || '');
  if (!userId) return {items:[], total:0, page:1, pages:1, summary:null, milestones:[]};
  await ensureCompletedGamesTable(env);
  await ensureRatingTables(env);
  await backfillChessChronicleMetadata(env);
  await backfillChessChronicleOpenings(env, 120);

  const page = archivePositiveInteger(url.searchParams.get('page'), 1, 100000);
  const limit = archivePositiveInteger(url.searchParams.get('limit'), 60, 120);
  const offset = (page - 1) * limit;
  const summaryRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN (chronicle.white_user_id = ? AND chronicle.result = '1-0') OR (chronicle.black_user_id = ? AND chronicle.result = '0-1') THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN chronicle.result = '1/2-1/2' THEN 1 ELSE 0 END) AS draws,
            SUM(CASE WHEN (chronicle.white_user_id = ? AND chronicle.result = '0-1') OR (chronicle.black_user_id = ? AND chronicle.result = '1-0') THEN 1 ELSE 0 END) AS losses,
            SUM(CASE WHEN moment.room_id IS NOT NULL THEN 1 ELSE 0 END) AS moments,
            MIN(chronicle.ended_at) AS first_ended_at,
            MAX(chronicle.ended_at) AS last_ended_at
       FROM chess_chronicle_games chronicle
       LEFT JOIN game_archive_favorites moment ON moment.room_id = chronicle.room_id AND moment.user_id = ?
      WHERE chronicle.white_user_id = ? OR chronicle.black_user_id = ?`
  ).bind(userId, userId, userId, userId, userId, userId, userId).first();
  const total = Number(summaryRow && summaryRow.total || 0);
  const pages = Math.max(1, Math.ceil(total / limit));
  const milestones = await chessChronicleMilestones(env, userId);
  const milestoneMap = new Map();
  for (const milestone of milestones) {
    const list = milestoneMap.get(milestone.roomId) || [];
    list.push({code:milestone.code, label:milestone.label});
    milestoneMap.set(milestone.roomId, list);
  }

  const result = await env.DB.prepare(
    `SELECT chronicle.*,
            CASE WHEN moment.room_id IS NULL THEN 0 ELSE 1 END AS favorite,
            moment.note AS moment_note,
            moment.created_at AS moment_created_at,
            CASE WHEN completed.room_id IS NULL THEN 0 ELSE 1 END AS archive_available,
            completed.pgn AS completed_pgn,
            rated.white_rating_before, rated.white_rating_after,
            rated.black_rating_before, rated.black_rating_after
       FROM chess_chronicle_games chronicle
       LEFT JOIN game_archive_favorites moment ON moment.room_id = chronicle.room_id AND moment.user_id = ?
       LEFT JOIN completed_games completed ON completed.room_id = chronicle.room_id
       LEFT JOIN rated_games rated ON rated.room_id = chronicle.room_id
      WHERE chronicle.white_user_id = ? OR chronicle.black_user_id = ?
      ORDER BY chronicle.ended_at DESC
      LIMIT ? OFFSET ?`
  ).bind(userId, userId, userId, limit, offset).all();
  const items = (result && Array.isArray(result.results) ? result.results : []).map(row => chessChronicleGameDto(row, userId, milestoneMap));
  return {
    items,
    total,
    page,
    pages,
    summary:{
      username:cleanDisplayName(sessionUser && sessionUser.username) || 'Mitglied',
      total,
      wins:Number(summaryRow && summaryRow.wins || 0),
      draws:Number(summaryRow && summaryRow.draws || 0),
      losses:Number(summaryRow && summaryRow.losses || 0),
      moments:Number(summaryRow && summaryRow.moments || 0),
      firstEndedAt:summaryRow && summaryRow.first_ended_at || null,
      lastEndedAt:summaryRow && summaryRow.last_ended_at || null
    },
    milestones
  };
}

const GAME_REACTION_CODES = Object.freeze(['thanks', 'well_played', 'exciting']);
const GAME_MOMENT_NOTE_MAX_LENGTH = 240;
let gameReactionsTableReady = false;

function cleanGameMomentNote(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, GAME_MOMENT_NOTE_MAX_LENGTH);
}

function gameMomentStateDto(row) {
  const marked = !!row;
  return {
    available:true,
    marked,
    note:marked ? cleanGameMomentNote(row.note) : '',
    markedAt:marked ? (row.created_at || null) : null,
    updatedAt:marked ? (row.updated_at || row.created_at || null) : null
  };
}

async function loadGameMomentState(env, roomId, currentUserId, whiteUserId, blackUserId) {
  const userId = String(currentUserId || '');
  const participant = !!userId && (userId === String(whiteUserId || '') || userId === String(blackUserId || ''));
  if (!participant || !(await ensureCompletedGamesTable(env))) return null;
  const row = await env.DB.prepare(
    `SELECT created_at, note, updated_at
       FROM game_archive_favorites
      WHERE room_id = ? AND user_id = ?
      LIMIT 1`
  ).bind(roomId, userId).first();
  return gameMomentStateDto(row);
}

async function ownedEndedGameForMoment(env, roomId, userId) {
  const archivedGame = await env.DB.prepare(
    `SELECT room_id, white_user_id, black_user_id
       FROM completed_games
      WHERE room_id = ? AND (white_user_id = ? OR black_user_id = ?)
      LIMIT 1`
  ).bind(roomId, userId, userId).first();
  if (archivedGame) return archivedGame;

  await ensureDailyGamesTable(env);
  const dailyGame = await env.DB.prepare(
    `SELECT room_id, white_user_id, black_user_id
       FROM daily_games
      WHERE room_id = ? AND ended = 1
        AND (white_user_id = ? OR black_user_id = ?)
      LIMIT 1`
  ).bind(roomId, userId, userId).first();
  if (dailyGame) return dailyGame;

  if (!env.GAME_ROOM) return null;
  try {
    const id = env.GAME_ROOM.idFromName(roomId);
    const stub = gameRoomStub(env, id);
    const response = await stub.fetch(new Request('https://game-room.internal/game-moment-eligibility?room=' + encodeURIComponent(roomId), {
      method:'POST',
      headers:{'x-hammerschach-user-id':userId}
    }));
    if (!response.ok) return null;
    const result = await response.json();
    if (!result || !result.ok || result.ended !== true) return null;
    return {
      room_id:roomId,
      white_user_id:String(result.whiteUserId || '') || null,
      black_user_id:String(result.blackUserId || '') || null
    };
  } catch (_) {
    return null;
  }
}

async function saveGameMoment(env, roomId, sessionUser, input) {
  await ensureCompletedGamesTable(env);
  const userId = String(sessionUser && sessionUser.id || '');
  const ownGame = await ownedEndedGameForMoment(env, roomId, userId);
  if (!ownGame) return {ok:false, status:404, code:'GAME_NOT_FOUND', message:'Nur eigene beendete Partien können als Gamer-Moment gespeichert werden.'};

  const marked = input && input.marked === true;
  const note = marked ? cleanGameMomentNote(input && input.note) : '';
  if (marked) {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO game_archive_favorites (room_id, user_id, created_at, note, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(room_id, user_id) DO UPDATE SET
         note = excluded.note,
         updated_at = excluded.updated_at`
    ).bind(roomId, userId, now, note, now).run();
  } else {
    await env.DB.prepare(`DELETE FROM game_archive_favorites WHERE room_id = ? AND user_id = ?`).bind(roomId, userId).run();
  }
  const moment = await loadGameMomentState(env, roomId, userId, ownGame.white_user_id, ownGame.black_user_id);
  return {ok:true, roomId, moment};
}

function cleanGameReaction(value) {
  const code = String(value || '').trim().toLowerCase();
  return GAME_REACTION_CODES.includes(code) ? code : '';
}

async function ensureGameReactionsTable(env) {
  if (!env || !env.DB) return false;
  if (gameReactionsTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS game_reactions (
       room_id TEXT NOT NULL,
       sender_user_id TEXT NOT NULL,
       reaction TEXT NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (room_id, sender_user_id)
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_game_reactions_sender ON game_reactions (sender_user_id, updated_at)`).run();
  gameReactionsTableReady = true;
  return true;
}

function gameReactionStateDto(currentUserId, whiteUserId, blackUserId, myReaction, opponentReaction) {
  const userId = String(currentUserId || '');
  const whiteId = String(whiteUserId || '');
  const blackId = String(blackUserId || '');
  const participant = !!userId && (userId === whiteId || userId === blackId);
  const available = !!(participant && whiteId && blackId && whiteId !== blackId);
  return available ? {
    available:true,
    myReaction:cleanGameReaction(myReaction),
    opponentReaction:cleanGameReaction(opponentReaction)
  } : null;
}

async function loadGameReactionState(env, roomId, currentUserId, whiteUserId, blackUserId) {
  const base = gameReactionStateDto(currentUserId, whiteUserId, blackUserId, '', '');
  if (!base || !(await ensureGameReactionsTable(env))) return null;
  const userId = String(currentUserId || '');
  const opponentUserId = userId === String(whiteUserId || '') ? String(blackUserId || '') : String(whiteUserId || '');
  const result = await env.DB.prepare(
    `SELECT sender_user_id, reaction
       FROM game_reactions
      WHERE room_id = ? AND sender_user_id IN (?, ?)`
  ).bind(roomId, userId, opponentUserId).all();
  let myReaction = '';
  let opponentReaction = '';
  for (const row of result && result.results ? result.results : []) {
    if (String(row.sender_user_id || '') === userId) myReaction = row.reaction;
    else if (String(row.sender_user_id || '') === opponentUserId) opponentReaction = row.reaction;
  }
  return gameReactionStateDto(userId, whiteUserId, blackUserId, myReaction, opponentReaction);
}

const ARCHIVE_PAGE_LIMIT_MAX = 50;
const ARCHIVE_PUBLIC_RETENTION_DAYS = 1095;
const ARCHIVE_PUBLIC_VISIBLE_LIMIT = 20000;
const ARCHIVE_CORE_UNPROTECTED_LIMIT = 30000;
const ARCHIVE_FAIRPLAY_RETENTION_DAYS = 365;

function archivePositiveInteger(value, fallback, maximum) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(maximum, number);
}

function archiveGameDto(row, currentUserId) {
  const userId = String(currentUserId || '');
  const whiteUserId = String(row && row.white_user_id || '');
  const blackUserId = String(row && row.black_user_id || '');
  const participantRole = userId && userId === whiteUserId ? 'w' : userId && userId === blackUserId ? 'b' : '';
  return {
    roomId:cleanRoomId(row && row.room_id),
    watchId:cleanPublicWatchId(row && row.spectator_id),
    whiteName:cleanDisplayName(row && row.white_name) || 'Weiß',
    blackName:cleanDisplayName(row && row.black_name) || 'Schwarz',
    mode:row && row.mode === 'daily' ? 'daily' : 'live',
    timeLabel:String(row && row.time_label || '').slice(0, 80),
    daysPerMove:row && row.days_per_move != null ? Number(row.days_per_move) : null,
    variant:row && row.variant === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD,
    positionId:row && row.position_id != null ? Number(row.position_id) : null,
    startedAt:row && row.started_at || null,
    endedAt:row && row.ended_at || null,
    result:String(row && row.result || '*').slice(0, 16),
    endReason:String(row && row.end_reason || '').slice(0, 80),
    rated:Number(row && row.rated || 0) === 1,
    ratingType:String(row && row.rating_type || '').slice(0, 40),
    publicGame:Number(row && row.public_game || 0) === 1,
    tournamentId:String(row && row.tournament_id || '').slice(0, 128),
    tournamentName:String(row && row.tournament_name || '').slice(0, 160),
    tournamentRoundLabel:String(row && row.tournament_round_label || '').slice(0, 80),
    protected:Number(row && row.protected || 0) === 1,
    favorite:Number(row && row.favorite || 0) === 1,
    momentNote:cleanGameMomentNote(row && row.moment_note),
    momentAt:row && row.moment_created_at || null,
    isParticipant:!!participantRole,
    participantRole,
    reactionAvailable:!!participantRole && !!whiteUserId && !!blackUserId && whiteUserId !== blackUserId,
    myReaction:participantRole ? cleanGameReaction(row && row.my_reaction) : '',
    opponentReaction:participantRole ? cleanGameReaction(row && row.opponent_reaction) : '',
    startSummary:gameStartSummaryFromPgn(row && row.pgn, row && row.variant)
  };
}

async function listGameArchive(env, sessionUser, url) {
  await ensureCompletedGamesTable(env);
  await ensureGameReactionsTable(env);
  const scope = url.searchParams.get('scope') === 'public' ? 'public' : 'mine';
  const page = archivePositiveInteger(url.searchParams.get('page'), 1, 100000);
  const limit = archivePositiveInteger(url.searchParams.get('limit'), 24, ARCHIVE_PAGE_LIMIT_MAX);
  const offset = (page - 1) * limit;
  const userId = String(sessionUser && sessionUser.id || '');
  const clauses = [];
  const values = [];
  if (scope === 'public') {
    clauses.push('games.public_game = 1', 'games.archive_visible = 1');
  } else {
    clauses.push('(games.white_user_id = ? OR games.black_user_id = ?)');
    values.push(userId, userId);
  }
  const member = String(url.searchParams.get('member') || '').trim().toLowerCase().slice(0, 80);
  if (member) {
    clauses.push('(LOWER(games.white_name) LIKE ? OR LOWER(games.black_name) LIKE ?)');
    values.push('%' + member + '%', '%' + member + '%');
  }
  const mode = url.searchParams.get('mode');
  if (mode === 'live' || mode === 'daily') { clauses.push('games.mode = ?'); values.push(mode); }
  const variant = url.searchParams.get('variant');
  if (variant === GAME_VARIANT_STANDARD || variant === GAME_VARIANT_FREESTYLE) { clauses.push('games.variant = ?'); values.push(variant); }
  const speed = url.searchParams.get('speed');
  if (speed === 'classic' || speed === 'rapid' || speed === 'blitz') { clauses.push('games.rating_type = ?'); values.push('live_' + speed); }
  const result = url.searchParams.get('result');
  if (['1-0','0-1','1/2-1/2'].includes(result)) { clauses.push('games.result = ?'); values.push(result); }
  const tournament = url.searchParams.get('tournament');
  if (tournament === '1') clauses.push("COALESCE(games.tournament_id, '') <> ''");
  if (tournament === '0') clauses.push("COALESCE(games.tournament_id, '') = ''");
  if (url.searchParams.get('moments') === '1') clauses.push('favorites.room_id IS NOT NULL');
  const from = String(url.searchParams.get('from') || '');
  const to = String(url.searchParams.get('to') || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { clauses.push('games.ended_at >= ?'); values.push(from + 'T00:00:00.000Z'); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { clauses.push('games.ended_at < ?'); values.push(new Date(Date.parse(to + 'T00:00:00.000Z') + 86400000).toISOString()); }
  const where = clauses.join(' AND ');
  const selectSql = `SELECT games.*,
      CASE WHEN favorites.room_id IS NULL THEN 0 ELSE 1 END AS favorite,
      favorites.note AS moment_note,
      favorites.created_at AS moment_created_at,
      my_reaction.reaction AS my_reaction,
      opponent_reaction.reaction AS opponent_reaction
    FROM completed_games games
    LEFT JOIN game_archive_favorites favorites ON favorites.room_id = games.room_id AND favorites.user_id = ?
    LEFT JOIN game_reactions my_reaction
      ON my_reaction.room_id = games.room_id AND my_reaction.sender_user_id = ?
    LEFT JOIN game_reactions opponent_reaction
      ON opponent_reaction.room_id = games.room_id
     AND opponent_reaction.sender_user_id = CASE
           WHEN games.white_user_id = ? THEN games.black_user_id
           WHEN games.black_user_id = ? THEN games.white_user_id
           ELSE ''
         END
    WHERE ${where}
    ORDER BY games.ended_at DESC
    LIMIT ? OFFSET ?`;
  const countSql = `SELECT COUNT(*) AS total
    FROM completed_games games
    LEFT JOIN game_archive_favorites favorites ON favorites.room_id = games.room_id AND favorites.user_id = ?
    WHERE ${where}`;
  const [rowsResult, countRow] = await Promise.all([
    env.DB.prepare(selectSql).bind(userId, userId, userId, userId, ...values, limit, offset).all(),
    env.DB.prepare(countSql).bind(userId, ...values).first()
  ]);
  const games = (rowsResult && rowsResult.results ? rowsResult.results : []).map(row => archiveGameDto(row, userId));
  return {scope, page, limit, total:numberValue(countRow && countRow.total), games};
}

async function archiveGameForViewer(env, roomId, sessionUser) {
  await ensureCompletedGamesTable(env);
  const userId = String(sessionUser && sessionUser.id || '');
  return env.DB.prepare(
    `SELECT * FROM completed_games
      WHERE room_id = ?
        AND (white_user_id = ? OR black_user_id = ? OR (public_game = 1 AND archive_visible = 1))
      LIMIT 1`
  ).bind(roomId, userId, userId).first();
}

async function runGameArchiveMaintenance(env) {
  if (!env || !env.DB) return {ok:false};
  await ensureCompletedGamesTable(env);
  await ensureGameReactionsTable(env);
  await ensureFairplayGameDataTable(env);
  await env.DB.prepare(
    `UPDATE completed_games SET protected = 1
      WHERE protected = 0 AND pgn LIKE '%[HammerschachTournamentId "%'`
  ).run();
  const now = Date.now();
  const publicCutoff = new Date(now - ARCHIVE_PUBLIC_RETENTION_DAYS * 86400000).toISOString();
  const fairplayCutoff = new Date(now - ARCHIVE_FAIRPLAY_RETENTION_DAYS * 86400000).toISOString();
  const expired = await env.DB.prepare(
    `UPDATE completed_games SET archive_visible = 0
      WHERE public_game = 1 AND archive_visible = 1 AND protected = 0 AND ended_at < ?
        AND NOT EXISTS (SELECT 1 FROM game_archive_favorites favorites WHERE favorites.room_id = completed_games.room_id)`
  ).bind(publicCutoff).run();
  const overflowPublic = await env.DB.prepare(
    `UPDATE completed_games SET archive_visible = 0 WHERE room_id IN (
       SELECT games.room_id FROM completed_games games
        WHERE games.public_game = 1 AND games.archive_visible = 1 AND games.protected = 0
          AND NOT EXISTS (SELECT 1 FROM game_archive_favorites favorites WHERE favorites.room_id = games.room_id)
        ORDER BY games.ended_at DESC LIMIT -1 OFFSET ?
     )`
  ).bind(ARCHIVE_PUBLIC_VISIBLE_LIMIT).run();
  await env.DB.prepare(
    `DELETE FROM public_games WHERE room_id IN (
       SELECT room_id FROM completed_games WHERE public_game = 1 AND archive_visible = 0
     )`
  ).run();
  const fairplay = await env.DB.prepare(
    `DELETE FROM fairplay_game_data WHERE room_id IN (
       SELECT data.room_id FROM fairplay_game_data data
       LEFT JOIN completed_games games ON games.room_id = data.room_id
       WHERE COALESCE(games.protected, 0) = 0 AND COALESCE(data.ended_at, data.updated_at) < ?
         AND NOT EXISTS (SELECT 1 FROM game_archive_favorites favorites WHERE favorites.room_id = data.room_id)
     )`
  ).bind(fairplayCutoff).run();
  const overflowRows = await env.DB.prepare(
    `SELECT games.room_id FROM completed_games games
      WHERE games.protected = 0
        AND NOT EXISTS (SELECT 1 FROM game_archive_favorites favorites WHERE favorites.room_id = games.room_id)
      ORDER BY games.ended_at DESC LIMIT -1 OFFSET ?`
  ).bind(ARCHIVE_CORE_UNPROTECTED_LIMIT).all();
  const overflowIds = (overflowRows && overflowRows.results ? overflowRows.results : []).map(row => cleanRoomId(row.room_id)).filter(Boolean);
  let removedCore = 0;
  for (let index = 0; index < overflowIds.length; index += 80) {
    const batch = overflowIds.slice(index, index + 80);
    const marks = batch.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM fairplay_game_data WHERE room_id IN (${marks})`).bind(...batch).run();
    await env.DB.prepare(`DELETE FROM public_games WHERE room_id IN (${marks})`).bind(...batch).run();
    await env.DB.prepare(`DELETE FROM game_reactions WHERE room_id IN (${marks})`).bind(...batch).run();
    const result = await env.DB.prepare(`DELETE FROM completed_games WHERE room_id IN (${marks})`).bind(...batch).run();
    removedCore += d1Changes(result);
  }
  return {ok:true, hiddenByAge:d1Changes(expired), hiddenByLimit:d1Changes(overflowPublic), fairplayRemoved:d1Changes(fairplay), coreRemoved:removedCore};
}

let fairplayGameDataTableReady = false;
async function ensureFairplayGameDataTable(env) {
  if (!env || !env.DB) return false;
  if (fairplayGameDataTableReady) return true;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS fairplay_game_data (
       room_id TEXT PRIMARY KEY,
       data_version INTEGER NOT NULL,
       move_count INTEGER NOT NULL DEFAULT 0,
       moves_json TEXT NOT NULL,
       started_at TEXT,
       ended_at TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_fairplay_game_data_ended ON fairplay_game_data (ended_at)`).run();
  fairplayGameDataTableReady = true;
  return true;
}

function fairplayFiniteMilliseconds(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function fairplayMoveAcceptedAtMs(move) {
  const serverNow = fairplayFiniteMilliseconds(move && move.serverNow);
  if (serverNow !== null && serverNow > 0) return serverNow;
  const parsed = Date.parse(String(move && move.receivedAt || ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildFairplayMoveArchive(moves, game) {
  const safeMoves = Array.isArray(moves) ? moves : [];
  const gameStartedAtMs = Date.parse(String(game && game.startedAt || ''));
  let previousAcceptedAtMs = Number.isFinite(gameStartedAtMs) && gameStartedAtMs > 0 ? gameStartedAtMs : null;

  return safeMoves.map((move, index) => {
    const privateAudit = move && move._fairplay && typeof move._fairplay === 'object' ? move._fairplay : {};
    const acceptedAtMs = fairplayMoveAcceptedAtMs(move);
    const derivedThinkTimeMs = acceptedAtMs !== null && previousAcceptedAtMs !== null
      ? Math.max(0, acceptedAtMs - previousAcceptedAtMs)
      : null;
    const recordedThinkTimeMs = fairplayFiniteMilliseconds(privateAudit.thinkTimeMs);
    const thinkTimeMs = recordedThinkTimeMs !== null ? recordedThinkTimeMs : derivedThinkTimeMs;
    if (acceptedAtMs !== null) previousAcceptedAtMs = acceptedAtMs;

    return {
      ply:Number.isFinite(Number(move && move.ply)) ? Math.max(1, Math.floor(Number(move.ply))) : index + 1,
      side:move && move.side === 'b' ? 'b' : 'w',
      from:cleanSquare(move && move.from),
      to:cleanSquare(move && move.to),
      promotion:['Q', 'R', 'B', 'N'].includes(String(move && move.promotion || '').toUpperCase())
        ? String(move.promotion).toUpperCase()
        : null,
      castle:String(move && move.castle || '') === 'K' || String(move && move.castle || '') === 'Q'
        ? String(move.castle)
        : null,
      san:String(move && move.san || '').slice(0, 40),
      acceptedAt:acceptedAtMs !== null ? new Date(acceptedAtMs).toISOString() : null,
      thinkTimeMs,
      moverClockBeforeMs:fairplayFiniteMilliseconds(privateAudit.moverClockBeforeMs),
      moverClockAfterMs:fairplayFiniteMilliseconds(privateAudit.moverClockAfterMs),
      whiteClockBeforeMs:fairplayFiniteMilliseconds(privateAudit.whiteClockBeforeMs),
      blackClockBeforeMs:fairplayFiniteMilliseconds(privateAudit.blackClockBeforeMs),
      whiteClockAfterMs:fairplayFiniteMilliseconds(privateAudit.whiteClockAfterMs),
      blackClockAfterMs:fairplayFiniteMilliseconds(privateAudit.blackClockAfterMs)
    };
  });
}

function fairplayIsoTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : null;
}

function fairplayArchivedMoveForAdmin(move, index) {
  const side = move && move.side === 'b' ? 'b' : 'w';
  const promotion = String(move && move.promotion || '').toUpperCase();
  const castle = String(move && move.castle || '');
  return {
    ply:Number.isFinite(Number(move && move.ply)) ? Math.max(1, Math.floor(Number(move.ply))) : index + 1,
    side,
    from:cleanSquare(move && move.from),
    to:cleanSquare(move && move.to),
    promotion:['Q', 'R', 'B', 'N'].includes(promotion) ? promotion : null,
    castle:castle === 'K' || castle === 'Q' ? castle : null,
    san:String(move && move.san || '').slice(0, 40),
    acceptedAt:fairplayIsoTimestamp(move && move.acceptedAt),
    thinkTimeMs:fairplayFiniteMilliseconds(move && move.thinkTimeMs),
    moverClockBeforeMs:fairplayFiniteMilliseconds(move && move.moverClockBeforeMs),
    moverClockAfterMs:fairplayFiniteMilliseconds(move && move.moverClockAfterMs),
    whiteClockBeforeMs:fairplayFiniteMilliseconds(move && move.whiteClockBeforeMs),
    blackClockBeforeMs:fairplayFiniteMilliseconds(move && move.blackClockBeforeMs),
    whiteClockAfterMs:fairplayFiniteMilliseconds(move && move.whiteClockAfterMs),
    blackClockAfterMs:fairplayFiniteMilliseconds(move && move.blackClockAfterMs)
  };
}

function fairplayAdminGameSummary(row) {
  return {
    roomId:cleanRoomId(row && row.room_id),
    whiteName:cleanDisplayName(row && row.white_name) || 'Weiß',
    blackName:cleanDisplayName(row && row.black_name) || 'Schwarz',
    mode:row && row.mode === 'daily' ? 'daily' : 'live',
    timeLabel:String(row && row.time_label || '').slice(0, 80),
    daysPerMove:Number.isFinite(Number(row && row.days_per_move)) && Number(row.days_per_move) > 0
      ? Math.floor(Number(row.days_per_move))
      : null,
    variant:String(row && row.variant || GAME_VARIANT_STANDARD) === GAME_VARIANT_FREESTYLE
      ? GAME_VARIANT_FREESTYLE
      : GAME_VARIANT_STANDARD,
    positionId:Number.isFinite(Number(row && row.position_id)) ? Number(row.position_id) : null,
    startedAt:fairplayIsoTimestamp(row && row.started_at),
    endedAt:fairplayIsoTimestamp(row && row.ended_at),
    result:['1-0', '0-1', '1/2-1/2', '*'].includes(String(row && row.result || ''))
      ? String(row.result)
      : '*',
    endReason:String(row && row.end_reason || '').slice(0, 80) || null,
    rated:Number(row && row.rated || 0) === 1,
    ratingType:RATING_TYPE_KEYS.has(String(row && row.rating_type || '')) ? String(row.rating_type) : '',
    dataVersion:Math.max(1, Math.floor(Number(row && row.data_version || FAIRPLAY_RAW_DATA_VERSION))),
    moveCount:Math.max(0, Math.floor(Number(row && row.move_count || 0))),
    archivedAt:fairplayIsoTimestamp(row && (row.fairplay_updated_at || row.updated_at))
  };
}

async function listAdminFairplayGames(env) {
  if (!(await ensureCompletedGamesTable(env)) || !(await ensureFairplayGameDataTable(env))) return [];
  const result = await env.DB.prepare(
    `SELECT completed.room_id,
            completed.white_name,
            completed.black_name,
            completed.mode,
            completed.time_label,
            completed.days_per_move,
            completed.variant,
            completed.position_id,
            completed.started_at,
            completed.ended_at,
            completed.result,
            completed.end_reason,
            completed.rated,
            completed.rating_type,
            fairplay.data_version,
            fairplay.move_count,
            fairplay.updated_at AS fairplay_updated_at
       FROM fairplay_game_data fairplay
       JOIN completed_games completed ON completed.room_id = fairplay.room_id
      ORDER BY completed.ended_at DESC
      LIMIT 250`
  ).all();
  return (result && Array.isArray(result.results) ? result.results : [])
    .map(fairplayAdminGameSummary)
    .filter(game => !!game.roomId);
}

async function getAdminFairplayGame(env, roomId) {
  const cleanId = cleanRoomId(roomId);
  if (!cleanId || !(await ensureCompletedGamesTable(env)) || !(await ensureFairplayGameDataTable(env))) return null;
  const row = await env.DB.prepare(
    `SELECT completed.room_id,
            completed.white_name,
            completed.black_name,
            completed.mode,
            completed.time_label,
            completed.days_per_move,
            completed.variant,
            completed.position_id,
            completed.back_rank,
            completed.started_at,
            completed.ended_at,
            completed.result,
            completed.end_reason,
            completed.rated,
            completed.rating_type,
            completed.pgn,
            fairplay.data_version,
            fairplay.move_count,
            fairplay.moves_json,
            fairplay.updated_at AS fairplay_updated_at
       FROM fairplay_game_data fairplay
       JOIN completed_games completed ON completed.room_id = fairplay.room_id
      WHERE fairplay.room_id = ?
      LIMIT 1`
  ).bind(cleanId).first();
  if (!row) return null;

  let parsedMoves = [];
  try {
    const parsed = JSON.parse(String(row.moves_json || '[]'));
    if (Array.isArray(parsed)) parsedMoves = parsed.slice(0, 2000);
  } catch (_) {}
  const moves = parsedMoves.map(fairplayArchivedMoveForAdmin);
  const timedMoveCount = moves.reduce((count, move) => count + (move.thinkTimeMs !== null ? 1 : 0), 0);
  const clockSnapshotCount = moves.reduce(
    (count, move) => count + (move.moverClockBeforeMs !== null && move.moverClockAfterMs !== null ? 1 : 0),
    0
  );
  return {
    ...fairplayAdminGameSummary(row),
    backRank:/^[RNBQK]{8}$/.test(String(row.back_rank || '')) ? String(row.back_rank) : null,
    pgn:String(row.pgn || '').slice(0, 100000),
    moves,
    timingCoverage:{
      totalMoves:moves.length,
      thinkTimeMoves:timedMoveCount,
      clockSnapshotMoves:clockSnapshotCount
    }
  };
}

function ratingTypeFromCompletedGameRow(row) {
  const explicit = String(row && row.rating_type || '');
  if (RATING_TYPE_KEYS.has(explicit)) return explicit;
  const mode = String(row && row.mode || '').toLowerCase();
  const variant = String(row && row.variant || '').toLowerCase();
  if (mode === 'daily') return variant === GAME_VARIANT_FREESTYLE ? 'daily_freestyle' : 'daily_classic';
  if (variant === GAME_VARIANT_FREESTYLE) return 'live_freestyle';
  const label = String(row && row.time_label || '').toLowerCase();
  if (label.includes('classic')) return 'live_classic';
  if (label.includes('rapid')) return 'live_rapid';
  if (label.includes('blitz')) return 'live_blitz';
  return '';
}

async function headToHeadForUsers(env, viewerUserId, opponentUserId, ratingType) {
  const viewerId = String(viewerUserId || '').trim();
  const opponentId = String(opponentUserId || '').trim();
  const type = RATING_TYPE_KEYS.has(String(ratingType || '')) ? String(ratingType) : '';
  const info = ratingTypeInfo(type);
  const empty = {
    available:false,
    ratingType:type,
    label:info ? info.label : '',
    wins:0,
    draws:0,
    losses:0,
    total:0
  };
  if (!env || !env.DB || !viewerId || !opponentId || viewerId === opponentId || !type) return empty;
  if (!(await ensureCompletedGamesTable(env))) return empty;

  const result = await env.DB.prepare(
    `SELECT white_user_id, black_user_id, result, mode, time_label, variant, rating_type
       FROM completed_games
      WHERE (white_user_id = ? AND black_user_id = ?)
         OR (white_user_id = ? AND black_user_id = ?)`
  ).bind(viewerId, opponentId, opponentId, viewerId).all();

  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const row of (result && Array.isArray(result.results) ? result.results : [])) {
    if (ratingTypeFromCompletedGameRow(row) !== type) continue;
    const gameResult = String(row.result || '');
    if (gameResult === '1/2-1/2') {
      draws += 1;
      continue;
    }
    if (gameResult !== '1-0' && gameResult !== '0-1') continue;
    const viewerWasWhite = String(row.white_user_id || '') === viewerId;
    const viewerWon = (gameResult === '1-0' && viewerWasWhite) || (gameResult === '0-1' && !viewerWasWhite);
    if (viewerWon) wins += 1;
    else losses += 1;
  }
  return {
    available:true,
    ratingType:type,
    label:info ? info.label : type,
    wins,
    draws,
    losses,
    total:wins + draws + losses
  };
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
  if (!(await ensureDailyGamesTable(env)) || !userId) {
    return { openInvitations: [], incomingInvitations: [], activeGames: [] };
  }
  const result = await env.DB.prepare(
    `SELECT room_id, white_user_id, black_user_id, invited_user_id, invitation_status, started, ended
       FROM daily_games
      WHERE ended = 0
        AND (
          white_user_id = ?
          OR black_user_id = ?
          OR (invited_user_id = ? AND invitation_status = 'pending')
        )
      ORDER BY updated_at ASC`
  ).bind(String(userId), String(userId), String(userId)).all();
  const rows = result && result.results ? result.results : [];
  const openInvitations = [];
  const incomingInvitations = [];
  const activeGames = [];
  for (const row of rows) {
    const isWhite = String(row.white_user_id || '') === String(userId);
    const isBlack = String(row.black_user_id || '') === String(userId);
    const isIncomingInvitation = !isWhite && !isBlack
      && String(row.invited_user_id || '') === String(userId)
      && String(row.invitation_status || '') === 'pending';
    if (isIncomingInvitation) {
      incomingInvitations.push(row);
      continue;
    }
    const opponentJoined = isWhite ? !!row.black_user_id : !!row.white_user_id;
    if (!row.started && !opponentJoined) openInvitations.push(row);
    else activeGames.push(row);
  }
  return { openInvitations, incomingInvitations, activeGames };
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
      const stub = gameRoomStub(env, id);
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

async function declineIncomingDailyInvitationsForUser(env, userId, invitations) {
  const rows = Array.isArray(invitations) ? invitations : [];
  if (rows.length === 0) return { ok:true, declined:0 };
  if (!env || !env.GAME_ROOM) {
    return { ok:false, status:503, code:'ROOM_SERVICE_UNAVAILABLE', message:'Offene Daily-Einladungen konnten nicht sicher abgelehnt werden.' };
  }

  let declined = 0;
  for (const invitation of rows) {
    const roomId = cleanRoomId(invitation && invitation.room_id);
    if (!roomId) continue;
    try {
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = gameRoomStub(env, id);
      const response = await stub.fetch(new Request('https://game-room.internal/respond-daily-invitation?room=' + encodeURIComponent(roomId), {
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-hammerschach-user-id':String(userId)
        },
        body:JSON.stringify({action:'decline'})
      }));
      let result = null;
      try { result = await response.json(); } catch (_) { result = null; }
      if (!response.ok || !result || !result.ok) {
        return {
          ok:false,
          status:response.status || 409,
          code:result && result.code ? result.code : 'INVITATION_DECLINE_FAILED',
          message:result && result.message ? result.message : 'Eine offene Daily-Einladung konnte nicht abgelehnt werden.'
        };
      }
      declined += 1;
    } catch (_) {
      return { ok:false, status:500, code:'INVITATION_DECLINE_FAILED', message:'Eine offene Daily-Einladung konnte nicht abgelehnt werden.' };
    }
  }
  return { ok:true, declined };
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
    `SELECT room_id FROM rated_games WHERE white_user_id = ? OR black_user_id = ?`,
    `SELECT room_id FROM chess_chronicle_games WHERE white_user_id = ? OR black_user_id = ?`
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

async function listMyRunningLiveGames(env, sessionUser) {
  const userId = String(sessionUser && sessionUser.id || '').trim();
  if (!env || !env.DB || !env.GAME_ROOM || !userId) return [];
  await ensureAccountGameRoomIndex(env);
  await ensureCompletedGamesTable(env);
  await ensureDailyGamesTable(env);
  const recentCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const result = await env.DB.prepare(
    `SELECT rooms.room_id, rooms.role, rooms.last_seen_at
       FROM account_game_rooms rooms
      WHERE rooms.user_id = ?
        AND rooms.last_seen_at >= ?
        AND NOT EXISTS (SELECT 1 FROM completed_games completed WHERE completed.room_id = rooms.room_id)
        AND NOT EXISTS (SELECT 1 FROM daily_games daily WHERE daily.room_id = rooms.room_id)
      ORDER BY rooms.last_seen_at DESC
      LIMIT 40`
  ).bind(userId, recentCutoff).all();
  const candidates = (result && result.results ? result.results : [])
    .map(row => cleanRoomId(row.room_id))
    .filter(Boolean);
  if (!candidates.length) return [];

  const summaries = await Promise.all(candidates.map(async roomId => {
    try {
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = gameRoomStub(env, id);
      const response = await stub.fetch(new Request('https://game-room.internal/account-game-summary?room=' + encodeURIComponent(roomId), {
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-hammerschach-user-id':userId
        },
        body:JSON.stringify({userId})
      }));
      if (!response.ok) return null;
      const summary = await response.json();
      if (!summary || !summary.ok || !summary.started || summary.ended || summary.mode !== 'live') return null;
      return summary;
    } catch (_) {
      return null;
    }
  }));
  return summaries.filter(Boolean).sort((a, b) => {
    if (!!a.isMyTurn !== !!b.isMyTurn) return a.isMyTurn ? -1 : 1;
    return Date.parse(b.updatedAt || b.startedAt || 0) - Date.parse(a.updatedAt || a.startedAt || 0);
  });
}

async function collectSchachlaborActiveRoomIds(env, userId) {
  const uid = String(userId || '').trim();
  if (!env || !env.DB || !uid) throw new Error('Die laufenden Partien konnten nicht sicher ermittelt werden.');
  const ids = new Set();
  await ensureDailyGamesTable(env);
  const daily = await env.DB.prepare(
    `SELECT room_id
       FROM daily_games
      WHERE started = 1
        AND ended = 0
        AND (white_user_id = ? OR black_user_id = ?)
      ORDER BY updated_at DESC`
  ).bind(uid, uid).all();
  for (const row of (daily && daily.results) || []) {
    const roomId = cleanRoomId(row.room_id);
    if (roomId) ids.add(roomId);
  }
  await ensureAccountGameRoomIndex(env);
  await ensureCompletedGamesTable(env);
  const live = await env.DB.prepare(
    `SELECT account_rooms.room_id
      FROM account_game_rooms account_rooms
      WHERE account_rooms.user_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM completed_games completed
           WHERE completed.room_id = account_rooms.room_id
        )
      ORDER BY account_rooms.last_seen_at DESC`
  ).bind(uid).all();
  for (const row of (live && live.results) || []) {
    const roomId = cleanRoomId(row.room_id);
    if (roomId) ids.add(roomId);
  }
  return Array.from(ids);
}

function schachlaborCheckError(code, message) {
  const error = new Error(message);
  error.schachlaborCode = String(code || 'FP-INTERN');
  return error;
}

async function schachlaborPositionAllowed(env, sessionUser, fen) {
  const userId = String(sessionUser && sessionUser.id || '').trim();
  const candidateFen = String(fen || '').trim();
  if (!env || !env.GAME_ROOM || !userId) throw schachlaborCheckError('FP-KONFIG', 'Schachlabor-Fairplay-Prüfung ist nicht verfügbar.');
  if (!candidateFen || candidateFen.length > 200) throw schachlaborCheckError('FP-FEN', 'Die zu prüfende Stellung ist ungültig.');
  let roomIds;
  try {
    roomIds = await collectSchachlaborActiveRoomIds(env, userId);
  } catch (error) {
    if (error && error.schachlaborCode) throw error;
    throw schachlaborCheckError('FP-INDEX', 'Die laufenden Partien konnten nicht sicher ermittelt werden.');
  }
  if (!roomIds.length) return true;
  /* Eine kleine Batchgröße schützt Worker und Durable Objects auch bei einem
     testbedingt großen Raumindex. Es werden trotzdem alle Kandidaten geprüft;
     ein Fehler bleibt fail-closed und eine Übereinstimmung beendet die Prüfung
     sofort mit einer Sperre. */
  for (let offset = 0; offset < roomIds.length; offset += 20) {
    const checks = await Promise.all(roomIds.slice(offset, offset + 20).map(async roomId => {
      try {
        const id = env.GAME_ROOM.idFromName(roomId);
        const response = await gameRoomStub(env, id).fetch(new Request('https://game-room.internal/schachlabor-position-check?room=' + encodeURIComponent(roomId), {
          method:'POST',
          headers:{'content-type':'application/json','x-hammerschach-user-id':userId},
          body:JSON.stringify({fen:candidateFen})
        }));
        if (!response.ok) return null;
        const data = await response.json();
        return data && data.ok === true ? data.match === true : null;
      } catch (_) {
        return null;
      }
    }));
    if (checks.some(result => result === null)) throw schachlaborCheckError('FP-RAUM', 'Mindestens ein laufender Spielraum konnte nicht sicher geprüft werden.');
    if (checks.some(Boolean)) return false;
  }
  return true;
}

async function callAccountRoomAction(env, roomId, action, userId, anonymizedId = '') {
  if (!env || !env.GAME_ROOM) return { ok:false, status:503, code:'ROOM_SERVICE_UNAVAILABLE', message:'Spielräume konnten nicht geprüft werden.' };
  try {
    const id = env.GAME_ROOM.idFromName(roomId);
    const stub = gameRoomStub(env, id);
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
  const declinedInvitations = await declineIncomingDailyInvitationsForUser(env, target.id, daily.incomingInvitations);
  if (!declinedInvitations.ok) return declinedInvitations;

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
    if (await ensureChessChronicleTable(env)) {
      await env.DB.prepare(
        `UPDATE chess_chronicle_games
            SET white_user_id = CASE WHEN white_user_id = ? THEN ? ELSE white_user_id END,
                black_user_id = CASE WHEN black_user_id = ? THEN ? ELSE black_user_id END,
                white_name = CASE WHEN white_user_id = ? THEN ? ELSE white_name END,
                black_name = CASE WHEN black_user_id = ? THEN ? ELSE black_name END,
                updated_at = ?
          WHERE white_user_id = ? OR black_user_id = ?`
      ).bind(
        target.id, anonymizedId,
        target.id, anonymizedId,
        target.id, deletedLabel,
        target.id, deletedLabel,
        new Date().toISOString(),
        target.id, target.id
      ).run();
    }
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
        const nextStatus = balanced.confirmed >= Number(tournament.max_players || 0) ? 'full' : 'open';
        await env.DB.prepare(
          `UPDATE tournaments
              SET status = ?, updated_at = ?,
                  full_notification_sent_at = CASE WHEN ? = 'open' THEN NULL ELSE full_notification_sent_at END
            WHERE id = ? AND status IN ('open','full')`
        ).bind(nextStatus, new Date().toISOString(), nextStatus, tournament.id).run();
      }
      await env.DB.prepare(`DELETE FROM tournament_views WHERE user_id = ?`).bind(target.id).run();
    }
  } catch (_) {}

  try {
    if (await ensurePrivateMessagesTables(env)) {
      await env.DB.prepare(`DELETE FROM private_message_recipients WHERE recipient_user_id = ?`).bind(target.id).run();
      const sentRows = await env.DB.prepare(`SELECT id FROM private_messages WHERE sender_user_id = ?`).bind(target.id).all();
      const sentIds = sentRows && Array.isArray(sentRows.results) ? sentRows.results.map(row => String(row.id || '')).filter(Boolean) : [];
      for (const messageId of sentIds) await env.DB.prepare(`DELETE FROM private_message_recipients WHERE message_id = ?`).bind(messageId).run();
      await env.DB.prepare(`DELETE FROM private_messages WHERE sender_user_id = ?`).bind(target.id).run();
      await env.DB.prepare(`DELETE FROM private_messages WHERE id NOT IN (SELECT DISTINCT message_id FROM private_message_recipients)`).run();
    }
  } catch (_) {}
  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(target.id).run();
  try { await env.DB.prepare(`DELETE FROM user_presence WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
  try {
    if (await ensureMemberFavoritesTable(env)) {
      await env.DB.prepare(`DELETE FROM member_favorites WHERE owner_user_id = ? OR favorite_user_id = ?`).bind(target.id, target.id).run();
    }
  } catch (_) {}
  try {
    if (await ensureGameReactionsTable(env)) {
      await env.DB.prepare(`DELETE FROM game_reactions WHERE sender_user_id = ?`).bind(target.id).run();
    }
  } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM rematch_offers WHERE requester_user_id = ? OR target_user_id = ?`).bind(target.id, target.id).run(); } catch (_) {}
  try { await env.DB.prepare(`DELETE FROM game_archive_favorites WHERE user_id = ?`).bind(target.id).run(); } catch (_) {}
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
    ensureCompletedGamesTable(env),
    ensureFairplayGameDataTable(env),
    ensureUserOnboardingTable(env),
    ensureEmailNotificationLogTable(env),
    ensureMailDeliveryLogTable(env),
    ensureAdminSettingsTable(env),
    ensureAdminMemberMessageTables(env),
    ensureLobbyTickerTables(env),
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
    'users','sessions','daily_games','public_games','completed_games','game_archive_favorites','game_reactions','rematch_offers','fairplay_game_data','rated_games','user_ratings','trainer_progress','trainer_attempts','user_public_profiles','member_favorites',
    'user_onboarding',
    'auth_security_events','auth_rate_limit_log','account_action_tokens','mail_delivery_log','email_notification_log',
    'admin_member_messages','admin_member_message_recipients','lobby_ticker_items',
    'info_center_items','info_center_attachments','info_center_reads'
  ];
  const rowCounts = {};
  for (const tableName of importantTableNames) {
    if (!tableNames.includes(tableName)) continue;
    try {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).first();
      rowCounts[tableName] = numberValue(row && row.count);
    } catch (_) {}
  }
  let archiveStorage = {games:0, publicVisible:0, protectedGames:0, favoriteGames:0, pgnBytes:0, fairplayBytes:0};
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS games,
              SUM(CASE WHEN public_game = 1 AND archive_visible = 1 THEN 1 ELSE 0 END) AS public_visible,
              SUM(CASE WHEN protected = 1 THEN 1 ELSE 0 END) AS protected_games,
              SUM(LENGTH(pgn)) AS pgn_bytes,
              (SELECT COUNT(DISTINCT room_id) FROM game_archive_favorites) AS favorite_games,
              (SELECT SUM(LENGTH(moves_json)) FROM fairplay_game_data) AS fairplay_bytes
         FROM completed_games`
    ).first();
    archiveStorage = {
      games:numberValue(row && row.games),
      publicVisible:numberValue(row && row.public_visible),
      protectedGames:numberValue(row && row.protected_games),
      favoriteGames:numberValue(row && row.favorite_games),
      pgnBytes:numberValue(row && row.pgn_bytes),
      fairplayBytes:numberValue(row && row.fairplay_bytes)
    };
  } catch (_) {}
  const archiveBytes = archiveStorage.pgnBytes + archiveStorage.fairplayBytes;
  const archiveReferenceBytes = 500 * 1024 * 1024;
  const archivePercent = Math.min(100, Math.round(archiveBytes / archiveReferenceBytes * 1000) / 10);
  archiveStorage.bytes = archiveBytes;
  archiveStorage.referenceBytes = archiveReferenceBytes;
  archiveStorage.percent = archivePercent;
  archiveStorage.status = archivePercent >= 90 ? 'red' : archivePercent >= 75 ? 'orange' : archivePercent >= 60 ? 'yellow' : 'green';

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
      importantRowsTotal:Object.values(rowCounts).reduce((sum, value) => sum + numberValue(value), 0),
      archive:archiveStorage
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

const HAMMERSCHACH_TV_CONFIG_KEY = 'hammerschach_tv_config';
const HAMMERSCHACH_TV_CACHE_KEY = 'hammerschach_tv_stream_cache';
const HAMMERSCHACH_TV_REFRESH_MS = 60 * 60 * 1000;
const HAMMERSCHACH_TV_SLOT_COUNT = 3;

function cleanTvText(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, maxLength);
}

function cleanYoutubeVideoId(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (/^(?:www\.)?youtu\.be$/i.test(url.hostname)) {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
    }
    if (/(?:^|\.)youtube(?:-nocookie)?\.com$/i.test(url.hostname)) {
      const segments = url.pathname.split('/').filter(Boolean);
      const id = url.searchParams.get('v') || (['embed', 'live', 'shorts'].includes(segments[0]) ? segments[1] : '');
      return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : '';
    }
  } catch (_) {}
  return '';
}

function cleanYoutubePlaylistId(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{10,80}$/.test(raw)) return raw;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const id = url.searchParams.get('list') || '';
    return /^[A-Za-z0-9_-]{10,80}$/.test(id) ? id : '';
  } catch (_) {
    return '';
  }
}

function cleanYoutubeChannelId(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  const direct = raw.match(/(?:^|\/)(UC[A-Za-z0-9_-]{22})(?:$|[/?#])/);
  if (direct) return direct[1];
  return /^UC[A-Za-z0-9_-]{22}$/.test(raw) ? raw : '';
}

function cleanYoutubeChannelHandle(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  let candidate = raw;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (/(?:^|\.)youtube\.com$/i.test(url.hostname)) {
      const segment = url.pathname.split('/').filter(Boolean).find(part => part.startsWith('@')) || '';
      candidate = segment ? decodeURIComponent(segment) : '';
    }
  } catch (_) {}
  return /^@[^\s\/?#]{3,100}$/u.test(candidate) ? candidate : '';
}

function cleanYoutubeChannelReference(value) {
  return cleanYoutubeChannelId(value) || cleanYoutubeChannelHandle(value);
}

function normalizeTvMode(value) {
  return value === 'manual' ? 'manual' : value === 'playlist' ? 'playlist' : 'channel';
}

function tvSlotId(slotNumber) {
  const number = Math.min(HAMMERSCHACH_TV_SLOT_COUNT, Math.max(1, Number(slotNumber) || 1));
  return `tv${number}`;
}

function tvSlotNumber(value, fallback = 1) {
  const match = String(value == null ? '' : value).trim().toLowerCase().match(/^tv([1-3])$/);
  return match ? Number(match[1]) : Math.min(HAMMERSCHACH_TV_SLOT_COUNT, Math.max(1, Number(fallback) || 1));
}

function defaultTvConfig(slotNumber = 1) {
  const number = tvSlotNumber('', slotNumber);
  return {
    slotId:tvSlotId(number),
    slotNumber:number,
    enabled:number === 1,
    mode:'channel',
    title:'Gamer-TV',
    eventName:'',
    description:'Schach-Livestreams direkt im Hammerschach-Gamer.',
    channelName:'',
    channelId:'',
    manualVideoId:'',
    playlistId:'',
    updatedAt:null
  };
}

function normalizeTvConfig(value, slotNumber = 1) {
  const source = value && typeof value === 'object' ? value : {};
  const number = tvSlotNumber(source.slotId, slotNumber);
  const cleanedTitle = cleanTvText(source.title || 'Gamer-TV', 90) || 'Gamer-TV';
  return {
    slotId:tvSlotId(number),
    slotNumber:number,
    enabled:source.enabled == null ? number === 1 : source.enabled === true,
    mode:normalizeTvMode(source.mode),
    title:cleanedTitle === 'Hammerschach TV' || cleanedTitle === 'Gamer TV' ? 'Gamer-TV' : cleanedTitle,
    eventName:cleanTvText(source.eventName, 120),
    description:cleanTvText(source.description || 'Schach-Livestreams direkt im Hammerschach-Gamer.', 600),
    channelName:cleanTvText(source.channelName, 90),
    /* channelId bleibt aus Kompatibilitätsgründen der Feldname, enthält aber
       wahlweise die UC-ID oder den öffentlich sichtbaren @Handle. */
    channelId:cleanYoutubeChannelReference(source.channelId) || cleanYoutubeChannelReference(source.channelHandle),
    manualVideoId:cleanYoutubeVideoId(source.manualVideoId || source.videoUrl),
    playlistId:cleanYoutubePlaylistId(source.playlistId || source.playlistUrl),
    updatedAt:source.updatedAt || null
  };
}

function normalizeTvConfigSet(value, updatedAt = null) {
  const source = value && typeof value === 'object' ? value : {};
  const incomingSlots = Array.isArray(source.slots) ? source.slots : null;
  const slots = [];
  for (let number = 1; number <= HAMMERSCHACH_TV_SLOT_COUNT; number += 1) {
    let raw = null;
    if (incomingSlots) {
      raw = incomingSlots.find(item => tvSlotNumber(item && item.slotId, 0) === number) || incomingSlots[number - 1] || null;
    } else if (number === 1) {
      /* Bestehende Einzelkonfiguration verlustfrei als TV 1 übernehmen. */
      raw = source;
    }
    slots.push(normalizeTvConfig({...defaultTvConfig(number), ...(raw || {}), updatedAt:(raw && raw.updatedAt) || updatedAt || null}, number));
  }
  return {version:2, slots};
}

function tvStoredConfig(configSet) {
  return {
    version:2,
    slots:(configSet && Array.isArray(configSet.slots) ? configSet.slots : []).map((slot, index) => {
      const normalized = normalizeTvConfig(slot, index + 1);
      return {...normalized, updatedAt:undefined};
    })
  };
}

async function readAdminSetting(env, key) {
  if (!(await ensureAdminSettingsTable(env))) return null;
  const row = await env.DB.prepare(
    `SELECT setting_value, updated_at FROM admin_settings WHERE setting_key = ? LIMIT 1`
  ).bind(String(key)).first();
  if (!row) return null;
  return {value:String(row.setting_value == null ? '' : row.setting_value), updatedAt:row.updated_at || null};
}

async function writeAdminSetting(env, key, value, updatedBy) {
  if (!(await ensureAdminSettingsTable(env))) throw new Error('Admin-Einstellungen sind momentan nicht verfügbar.');
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO admin_settings (setting_key, setting_value, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET
       setting_value = excluded.setting_value,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`
  ).bind(String(key), String(value), nowIso, String(updatedBy || '').slice(0, 128)).run();
  return nowIso;
}

async function loadTvConfig(env) {
  const stored = await readAdminSetting(env, HAMMERSCHACH_TV_CONFIG_KEY);
  if (!stored || !stored.value) return normalizeTvConfigSet(null);
  try {
    return normalizeTvConfigSet(JSON.parse(stored.value), stored.updatedAt);
  } catch (_) {
    return normalizeTvConfigSet(null);
  }
}

function validateTvConfigInput(rawInput, config) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  if (config.mode === 'channel' && (input.channelId || input.channelHandle) && !config.channelId) {
    return {ok:false, status:400, code:'INVALID_YOUTUBE_CHANNEL', message:`${config.slotId.toUpperCase()}: Der YouTube-Kanal ist ungültig. Trage den @Kanalnamen, die mit „UC“ beginnende Kanal-ID oder eine passende Kanaladresse ein.`};
  }
  if (config.mode === 'manual' && (input.manualVideoId || input.videoUrl) && !config.manualVideoId) {
    return {ok:false, status:400, code:'INVALID_YOUTUBE_VIDEO', message:`${config.slotId.toUpperCase()}: Die YouTube-Video-ID beziehungsweise Video-Adresse ist ungültig.`};
  }
  if (config.mode === 'playlist' && (input.playlistId || input.playlistUrl) && !config.playlistId) {
    return {ok:false, status:400, code:'INVALID_YOUTUBE_PLAYLIST', message:`${config.slotId.toUpperCase()}: Die YouTube-Playlist-ID beziehungsweise Playlist-Adresse ist ungültig.`};
  }
  return {ok:true};
}

async function saveTvConfig(env, input, adminUser) {
  const current = await loadTvConfig(env);
  const hasSlotSet = !!(input && Array.isArray(input.slots));
  let rawSlots;
  if (hasSlotSet) {
    rawSlots = input.slots;
  } else {
    /*
     * Übergangsfall: Eine ältere HTML sendet weiterhin nur TV 1. TV 2 und
     * TV 3 bleiben dabei unangetastet.
     */
    rawSlots = current.slots.map(slot => ({...slot}));
    rawSlots[0] = {...rawSlots[0], ...(input && typeof input === 'object' ? input : {}), slotId:'tv1', slotNumber:1};
  }
  const config = normalizeTvConfigSet({version:2, slots:rawSlots});
  for (let index = 0; index < config.slots.length; index += 1) {
    const raw = hasSlotSet
      ? (rawSlots.find(item => tvSlotNumber(item && item.slotId, 0) === index + 1) || rawSlots[index] || {})
      : (index === 0 ? input : rawSlots[index]);
    const validation = validateTvConfigInput(raw, config.slots[index]);
    if (!validation.ok) return validation;
  }
  const nowIso = await writeAdminSetting(
    env,
    HAMMERSCHACH_TV_CONFIG_KEY,
    JSON.stringify(tvStoredConfig(config)),
    adminUser && adminUser.id
  );
  config.slots = config.slots.map(slot => ({...slot, updatedAt:nowIso}));
  return {ok:true, config};
}

function tvStreamFromVideoResource(video, fallbackStatus) {
  const id = cleanYoutubeVideoId(video && video.id);
  if (!id) return null;
  const details = video.liveStreamingDetails || {};
  const actualStartAt = details.actualStartTime || null;
  const actualEndAt = details.actualEndTime || null;
  const scheduledStartAt = details.scheduledStartTime || null;
  const status = actualEndAt ? 'replay' : actualStartAt ? 'live' : (fallbackStatus === 'live' ? 'live' : 'upcoming');
  return {
    kind:'video',
    videoId:id,
    title:cleanTvText(video.snippet && video.snippet.title, 160),
    channelTitle:cleanTvText(video.snippet && video.snippet.channelTitle, 100),
    status,
    scheduledStartAt,
    actualStartAt,
    actualEndAt,
    thumbnailUrl:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    youtubeUrl:`https://www.youtube.com/watch?v=${id}`
  };
}

function tvPlaylistStream(config) {
  if (!config.playlistId) return null;
  return {
    kind:'playlist',
    playlistId:config.playlistId,
    title:config.eventName || config.title,
    channelTitle:config.channelName,
    status:'playlist',
    playlistItems:[],
    playlistItemCount:0,
    playlistItemsMessage:'Die Videoliste wird direkt aus dem YouTube-Player geladen.',
    youtubeUrl:`https://www.youtube.com/playlist?list=${config.playlistId}`
  };
}

async function youtubeBroadcastCandidates(apiKey, channelId) {
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('channelId', channelId);
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('videoEmbeddable', 'true');
  /* Eine gemeinsame Suche reicht für live, angekündigt und Replay. Das spart
     gegenüber getrennten eventType-Abfragen YouTube-Kontingent. */
  searchUrl.searchParams.set('maxResults', '50');
  searchUrl.searchParams.set('order', 'date');
  searchUrl.searchParams.set('key', apiKey);
  const searchResponse = await fetch(searchUrl.toString(), {headers:{accept:'application/json'}});
  if (!searchResponse.ok) throw new Error(`YouTube-Suche fehlgeschlagen (${searchResponse.status}).`);
  const searchData = await searchResponse.json();
  const ids = (searchData.items || []).map(item => cleanYoutubeVideoId(item && item.id && item.id.videoId)).filter(Boolean);
  if (!ids.length) return [];

  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  videosUrl.searchParams.set('part', 'snippet,liveStreamingDetails,status');
  videosUrl.searchParams.set('id', ids.join(','));
  videosUrl.searchParams.set('key', apiKey);
  const videosResponse = await fetch(videosUrl.toString(), {headers:{accept:'application/json'}});
  if (!videosResponse.ok) throw new Error(`YouTube-Videodaten fehlgeschlagen (${videosResponse.status}).`);
  const videosData = await videosResponse.json();
  return (videosData.items || [])
    .filter(video => !video.status || video.status.embeddable !== false)
    .filter(video => {
      const details = video && video.liveStreamingDetails;
      return !!(details && (
        details.scheduledStartTime ||
        details.actualStartTime ||
        details.actualEndTime
      ));
    })
    .map(video => tvStreamFromVideoResource(video, ''))
    .filter(Boolean);
}

async function youtubeChannelIdFromReference(apiKey, channelReference) {
  const directId = cleanYoutubeChannelId(channelReference);
  if (directId) return directId;
  const handle = cleanYoutubeChannelHandle(channelReference);
  if (!handle) throw new Error('Der YouTube-Kanalname ist ungültig.');

  const channelsUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
  channelsUrl.searchParams.set('part', 'id');
  channelsUrl.searchParams.set('forHandle', handle);
  channelsUrl.searchParams.set('key', apiKey);
  const channelsResponse = await fetch(channelsUrl.toString(), {headers:{accept:'application/json'}});
  if (!channelsResponse.ok) throw new Error(`YouTube-Kanalsuche fehlgeschlagen (${channelsResponse.status}).`);
  const channelsData = await channelsResponse.json();
  const channelId = cleanYoutubeChannelId(channelsData && channelsData.items && channelsData.items[0] && channelsData.items[0].id);
  if (!channelId) throw new Error(`Der YouTube-Kanal ${handle} wurde nicht gefunden.`);
  return channelId;
}

function chooseTvStream(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const live = candidates.find(item => item.status === 'live');
  if (live) return live;

  /* Ein verzögerter Start bleibt bis zu sechs Stunden als angekündigt
     sichtbar. Deutlich ältere, nie gestartete Ankündigungen werden ignoriert. */
  const upcomingThreshold = Date.now() - 6 * 60 * 60 * 1000;
  const upcoming = candidates.filter(item => (
    item.status === 'upcoming' &&
    (Date.parse(item.scheduledStartAt || '') || 0) >= upcomingThreshold
  )).sort((a, b) => {
    const aTime = Date.parse(a.scheduledStartAt || '') || Number.MAX_SAFE_INTEGER;
    const bTime = Date.parse(b.scheduledStartAt || '') || Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  })[0];
  if (upcoming) return upcoming;

  return candidates.filter(item => item.status === 'replay').sort((a, b) => {
    const aTime = Date.parse(a.actualEndAt || a.actualStartAt || a.scheduledStartAt || '') || 0;
    const bTime = Date.parse(b.actualEndAt || b.actualStartAt || b.scheduledStartAt || '') || 0;
    return bTime - aTime;
  })[0] || null;
}

function tvCacheKey(slotId) {
  const normalized = tvSlotId(tvSlotNumber(slotId, 1));
  return normalized === 'tv1' ? HAMMERSCHACH_TV_CACHE_KEY : `${HAMMERSCHACH_TV_CACHE_KEY}_${normalized}`;
}

async function loadTvStreamCache(env, slotId) {
  const stored = await readAdminSetting(env, tvCacheKey(slotId));
  if (!stored || !stored.value) return null;
  try {
    const parsed = JSON.parse(stored.value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

async function resolveTvStream(env, config, options = {}) {
  const mode = normalizeTvMode(config && config.mode);
  if (mode === 'manual') {
    return {
      stream:config.manualVideoId ? {
        kind:'video',
        videoId:config.manualVideoId,
        title:config.eventName || config.title,
        channelTitle:config.channelName,
        status:'manual',
        scheduledStartAt:null,
        actualStartAt:null,
        actualEndAt:null,
        thumbnailUrl:`https://i.ytimg.com/vi/${config.manualVideoId}/hqdefault.jpg`,
        youtubeUrl:`https://www.youtube.com/watch?v=${config.manualVideoId}`
      } : null,
      checkedAt:config.updatedAt,
      automationAvailable:!!env.YOUTUBE_API_KEY,
      message:config.manualVideoId ? 'Das festgelegte YouTube-Video ist aktiv.' : 'Noch kein YouTube-Video festgelegt.'
    };
  }
  if (mode === 'playlist') {
    if (!config.playlistId) {
      return {
        stream:null,
        checkedAt:null,
        automationAvailable:true,
        message:'Noch keine YouTube-Playlist festgelegt.'
      };
    }
    return {
      stream:tvPlaylistStream(config),
      checkedAt:config.updatedAt || null,
      automationAvailable:true,
      message:'Die festgelegte YouTube-Playlist ist aktiv.'
    };
  }

  const cache = await loadTvStreamCache(env, config.slotId);
  const cacheMatches = !!(cache && (
    cache.channelReference === config.channelId ||
    (!cache.channelReference && cache.channelId === config.channelId)
  ));
  const checkedAtMs = cacheMatches ? Date.parse(cache.checkedAt || '') : 0;
  const cacheFresh = checkedAtMs && Date.now() - checkedAtMs < HAMMERSCHACH_TV_REFRESH_MS;
  if (!config.channelId) {
    return {stream:null, checkedAt:null, automationAvailable:!!env.YOUTUBE_API_KEY, message:'Noch kein YouTube-Kanal festgelegt.'};
  }
  if (cacheMatches && cacheFresh && options.force !== true) {
    return {stream:cache.stream || null, checkedAt:cache.checkedAt || null, automationAvailable:!!env.YOUTUBE_API_KEY, message:cache.message || ''};
  }
  if (!env.YOUTUBE_API_KEY) {
    return {
      stream:cacheMatches ? cache.stream || null : null,
      checkedAt:cacheMatches ? cache.checkedAt || null : null,
      automationAvailable:false,
      message:'Die automatische YouTube-Suche benötigt noch den Worker-Schlüssel YOUTUBE_API_KEY.'
    };
  }

  const checkedAt = new Date().toISOString();
  try {
    const resolvedChannelId = await youtubeChannelIdFromReference(env.YOUTUBE_API_KEY, config.channelId);
    const stream = chooseTvStream(await youtubeBroadcastCandidates(env.YOUTUBE_API_KEY, resolvedChannelId));
    const message = !stream
      ? 'Der Kanal hat momentan keinen Livestream und keine abrufbare letzte Übertragung.'
      : stream.status === 'live'
        ? 'Der laufende Stream wurde automatisch gefunden.'
        : stream.status === 'upcoming'
          ? 'Der nächste angekündigte Stream wurde automatisch gefunden.'
          : 'Die zuletzt beendete Übertragung wurde automatisch gefunden.';
    const nextCache = {
      slotId:config.slotId,
      channelReference:config.channelId,
      channelId:resolvedChannelId,
      checkedAt,
      stream,
      message
    };
    await writeAdminSetting(env, tvCacheKey(config.slotId), JSON.stringify(nextCache), 'youtube-auto');
    return {stream, checkedAt, automationAvailable:true, message};
  } catch (error) {
    const lookupErrorMessage = error && error.message ? error.message : String(error || 'unknown');
    console.error('Hammerschach TV YouTube lookup failed', lookupErrorMessage);
    const channelNotFoundMessage = /^Der YouTube-Kanal\s+@.+\s+wurde nicht gefunden\.$/u.test(lookupErrorMessage)
      ? lookupErrorMessage
      : '';
    return {
      stream:cacheMatches ? cache.stream || null : null,
      checkedAt:cacheMatches ? cache.checkedAt || null : checkedAt,
      automationAvailable:true,
      message:channelNotFoundMessage || (cacheMatches && cache.stream
        ? 'Die YouTube-Abfrage war vorübergehend nicht erreichbar. Der zuletzt gefundene Stream bleibt sichtbar.'
        : 'Die YouTube-Abfrage war vorübergehend nicht erreichbar.')
    };
  }
}

function tvDto(config, resolved) {
  return {
    slotId:config.slotId,
    slotNumber:config.slotNumber,
    enabled:config.enabled === true,
    mode:normalizeTvMode(config.mode),
    title:config.title,
    eventName:config.eventName,
    description:config.description,
    channelName:config.channelName,
    channelId:config.channelId,
    manualVideoId:config.manualVideoId,
    playlistId:config.playlistId,
    updatedAt:config.updatedAt,
    stream:resolved && resolved.stream || null,
    checkedAt:resolved && resolved.checkedAt || null,
    automationAvailable:resolved && resolved.automationAvailable === true,
    message:cleanTvText(resolved && resolved.message, 240)
  };
}

async function resolveTvConfigSet(env, configSet, options = {}) {
  const slots = configSet && Array.isArray(configSet.slots) ? configSet.slots : normalizeTvConfigSet(null).slots;
  const resolved = [];
  const forceSlotId = /^tv[1-3]$/.test(String(options.forceSlotId || '').toLowerCase())
    ? String(options.forceSlotId).toLowerCase()
    : '';
  for (const config of slots) {
    if (config.enabled !== true) {
      resolved.push({
        stream:null,
        checkedAt:null,
        automationAvailable:!!env.YOUTUBE_API_KEY,
        message:'Dieser Senderplatz ist momentan ausgeschaltet.'
      });
      continue;
    }
    resolved.push(await resolveTvStream(env, config, {
      force:options.forceAll === true || (!!forceSlotId && config.slotId === forceSlotId)
    }));
  }
  return resolved;
}

function tvSetDto(configSet, resolvedSlots) {
  const configs = configSet && Array.isArray(configSet.slots) ? configSet.slots : normalizeTvConfigSet(null).slots;
  const slots = configs.map((config, index) => tvDto(config, resolvedSlots && resolvedSlots[index] || null));
  const preferred = slots.find(slot => slot.enabled && slot.stream && slot.stream.status === 'live')
    || slots.find(slot => slot.enabled && slot.stream)
    || slots.find(slot => slot.enabled)
    || slots[0];
  /*
   * Die Felder von TV 1 bleiben zusätzlich auf oberster Ebene erhalten,
   * damit eine während des Deployments noch geladene Einzel-TV-HTML weiter
   * funktioniert.
   */
  return {
    ...(slots[0] || {}),
    version:2,
    slots,
    defaultSlotId:preferred && preferred.slotId || 'tv1'
  };
}

let lobbyTickerTablesReady = false;
async function ensureLobbyTickerTables(env) {
  if (!env || !env.DB) return false;
  if (lobbyTickerTablesReady) return true;
  await ensureAdminSettingsTable(env);
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS lobby_ticker_items (
       id TEXT PRIMARY KEY,
       source_key TEXT UNIQUE,
       category TEXT NOT NULL,
       title TEXT NOT NULL,
       message TEXT NOT NULL,
       action_kind TEXT NOT NULL DEFAULT 'none',
       action_value TEXT,
       action_label TEXT,
       priority INTEGER NOT NULL DEFAULT 50,
       starts_at TEXT NOT NULL,
       ends_at TEXT NOT NULL,
       active INTEGER NOT NULL DEFAULT 1,
       subject_user_id TEXT,
       created_by_user_id TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  ).run();
  await env.DB.batch([
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_lobby_ticker_active ON lobby_ticker_items (active, starts_at, ends_at, priority)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_lobby_ticker_subject ON lobby_ticker_items (subject_user_id, category)`)
  ]);
  lobbyTickerTablesReady = true;
  return true;
}

function cleanLobbyTickerTitle(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function cleanLobbyTickerMessage(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
}

function cleanLobbyTickerCategory(value) {
  const category = String(value || '').toLowerCase();
  return ['event', 'news', 'welcome'].includes(category) ? category : 'news';
}

function cleanLobbyTickerLink(value) {
  const link = String(value || '').trim().slice(0, 500);
  if (!link) return '';
  if (link.startsWith('/') && !link.startsWith('//')) return link;
  try {
    const url = new URL(link);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch (_) { return ''; }
}

function lobbyTickerIcon(category) {
  if (category === 'event') return '📅';
  if (category === 'welcome') return '👋';
  return '📢';
}

function lobbyTickerItemDto(row, automatic = false) {
  const category = cleanLobbyTickerCategory(row && row.category);
  return {
    id:String(row && row.id || ''),
    automatic:!!automatic,
    category,
    icon:String(row && row.icon || lobbyTickerIcon(category)).slice(0, 8),
    title:cleanLobbyTickerTitle(row && row.title),
    message:cleanLobbyTickerMessage(row && row.message),
    actionKind:['tournament', 'profile', 'link', 'info'].includes(String(row && row.action_kind || '')) ? String(row.action_kind) : 'none',
    actionValue:String(row && row.action_value || '').slice(0, 500),
    actionLabel:cleanLobbyTickerTitle(row && row.action_label) || '',
    priority:Math.max(0, Math.min(100, Number(row && row.priority || 0))),
    startsAt:row && row.starts_at || null,
    endsAt:row && row.ends_at || null,
    active:Number(row && row.active == null ? 1 : row.active) === 1,
    subjectUserId:String(row && row.subject_user_id || ''),
    createdAt:row && row.created_at || null,
    updatedAt:row && row.updated_at || null
  };
}

async function lobbyWelcomeSettings(env) {
  await ensureLobbyTickerTables(env);
  const result = await env.DB.prepare(
    `SELECT setting_key, setting_value FROM admin_settings
      WHERE setting_key IN ('ticker_welcome_enabled','ticker_welcome_duration_hours','ticker_welcome_template')`
  ).all();
  const values = new Map((result && result.results ? result.results : []).map(row => [String(row.setting_key), String(row.setting_value == null ? '' : row.setting_value)]));
  const duration = Number(values.get('ticker_welcome_duration_hours') || 72);
  return {
    welcomeEnabled:values.get('ticker_welcome_enabled') !== '0',
    welcomeDurationHours:[24, 48, 72, 120, 168].includes(duration) ? duration : 72,
    welcomeTemplate:cleanLobbyTickerMessage(values.get('ticker_welcome_template') || 'Herzlich willkommen bei Hammerschach, {username}! Schön, dass du dabei bist.')
  };
}

async function saveLobbyWelcomeSettings(env, adminUser, body) {
  await ensureLobbyTickerTables(env);
  const enabled = body && body.welcomeEnabled === false ? '0' : '1';
  const duration = [24, 48, 72, 120, 168].includes(Number(body && body.welcomeDurationHours)) ? Number(body.welcomeDurationHours) : 72;
  const template = cleanLobbyTickerMessage(body && body.welcomeTemplate);
  if (template.length < 8 || !template.includes('{username}')) {
    return {ok:false, status:400, code:'INVALID_WELCOME_TEMPLATE', message:'Der Begrüßungstext muss {username} enthalten.'};
  }
  const now = new Date().toISOString();
  for (const [key, value] of [
    ['ticker_welcome_enabled', enabled],
    ['ticker_welcome_duration_hours', String(duration)],
    ['ticker_welcome_template', template]
  ]) {
    await env.DB.prepare(
      `INSERT INTO admin_settings (setting_key, setting_value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(key, value, now, String(adminUser && adminUser.id || '')).run();
  }
  return {ok:true, settings:{welcomeEnabled:enabled === '1', welcomeDurationHours:duration, welcomeTemplate:template}};
}

async function createWelcomeTickerItem(env, userId) {
  await ensureLobbyTickerTables(env);
  const settings = await lobbyWelcomeSettings(env);
  if (!settings.welcomeEnabled) return {created:false, reason:'disabled'};
  const user = await env.DB.prepare(`SELECT id, username FROM users WHERE id = ? LIMIT 1`).bind(String(userId || '')).first();
  if (!user) return {created:false, reason:'user_missing'};
  const username = cleanDisplayName(user.username) || 'neues Mitglied';
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const endsAt = new Date(nowMs + settings.welcomeDurationHours * 60 * 60 * 1000).toISOString();
  const id = 'welcome_' + String(user.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const message = cleanLobbyTickerMessage(settings.welcomeTemplate.replace(/\{username\}/g, username));
  const inserted = await env.DB.prepare(
    `INSERT INTO lobby_ticker_items
       (id, source_key, category, title, message, action_kind, action_value, action_label, priority,
        starts_at, ends_at, active, subject_user_id, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, 'welcome', 'Neues Mitglied', ?, 'profile', ?, 'Profil ansehen', 30, ?, ?, 1, ?, NULL, ?, ?)
     ON CONFLICT(source_key) DO NOTHING`
  ).bind(id, 'welcome:' + String(user.id), message, String(user.id), now, endsAt, String(user.id), now, now).run();
  return {created:d1Changes(inserted) > 0, id};
}

function tickerTournamentMessage(row) {
  const status = normalizeTournamentStatus(row && row.status);
  const type = tournamentTypeLabel(row && row.tournament_type);
  const mode = tournamentModeLabel(row && row.mode);
  const theme = tournamentThemeFromRow(row);
  const scheduled = row && row.scheduled_start_at
    ? new Date(row.scheduled_start_at).toLocaleString('de-DE', {timeZone:'Europe/Berlin', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) + ' Uhr'
    : '';
  const thematic = theme ? ` · Thementurnier: ${theme.name}` : '';
  if (status === 'running') return `${type} · ${mode}${thematic} läuft – jetzt ansehen${normalizeTournamentMode(row.mode) === TOURNAMENT_MODE_ARENA ? ' oder noch einsteigen' : ''}.`;
  return `${type} · ${mode}${thematic} · Anmeldung geöffnet${scheduled ? ` · Start ${scheduled}` : ''}.`;
}

async function listLobbyTickerItems(env) {
  await ensureLobbyTickerTables(env);
  await ensureTournamentTables(env);
  const now = new Date().toISOString();
  const [storedResult, tournamentResult] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM lobby_ticker_items
        WHERE active = 1 AND starts_at <= ? AND ends_at > ?
        ORDER BY priority DESC, starts_at DESC LIMIT 30`
    ).bind(now, now).all(),
    env.DB.prepare(
      `SELECT id, name, tournament_type, mode, status, scheduled_start_at, published_at, started_at, updated_at
         FROM tournaments WHERE status IN ('open','full','running') AND published_at IS NOT NULL
        ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, COALESCE(scheduled_start_at, published_at) ASC LIMIT 8`
    ).all()
  ]);
  const stored = (storedResult && storedResult.results ? storedResult.results : []).map(row => lobbyTickerItemDto(row, false));
  const tournaments = (tournamentResult && tournamentResult.results ? tournamentResult.results : []).map(row => {
    const running = String(row.status) === 'running';
    const scheduledMs = Date.parse(row.scheduled_start_at || '');
    const soon = Number.isFinite(scheduledMs) && scheduledMs > Date.now() && scheduledMs - Date.now() <= 24 * 60 * 60 * 1000;
    return lobbyTickerItemDto({
      id:'tournament_' + String(row.id), category:'event', icon:running ? '⚔️' : '🏆',
      title:cleanTournamentName(row.name), message:tickerTournamentMessage(row), action_kind:'tournament', action_value:String(row.id),
      action_label:running ? 'Turnier öffnen' : 'Turnier ansehen', priority:soon ? 100 : running ? 90 : 70,
      starts_at:row.published_at || row.updated_at, ends_at:'9999-12-31T23:59:59.999Z', active:1,
      created_at:row.published_at || row.updated_at, updated_at:row.updated_at
    }, true);
  });
  return stored.concat(tournaments).sort((a, b) => b.priority - a.priority
    || Date.parse(b.startsAt || '') - Date.parse(a.startsAt || '')
    || a.title.localeCompare(b.title, 'de-DE', {sensitivity:'base'})).slice(0, 30);
}

async function listAdminLobbyTicker(env) {
  await ensureLobbyTickerTables(env);
  const result = await env.DB.prepare(
    `SELECT * FROM lobby_ticker_items
      WHERE source_key IS NULL OR source_key NOT LIKE 'info:%'
      ORDER BY active DESC, starts_at DESC, created_at DESC LIMIT 150`
  ).all();
  return {
    items:(result && result.results ? result.results : []).map(row => lobbyTickerItemDto(row, false)),
    settings:await lobbyWelcomeSettings(env)
  };
}

async function saveAdminLobbyTickerItem(env, adminUser, body) {
  await ensureLobbyTickerTables(env);
  const id = String(body && body.id || '').trim();
  const existing = id ? await env.DB.prepare(`SELECT * FROM lobby_ticker_items WHERE id = ? LIMIT 1`).bind(id).first() : null;
  if (id && (!existing || existing.category === 'welcome')) return {ok:false, status:409, code:'TICKER_NOT_EDITABLE', message:'Diese automatische Meldung kann nicht als manueller Hinweis bearbeitet werden.'};
  const category = cleanLobbyTickerCategory(body && body.category) === 'welcome' ? 'news' : cleanLobbyTickerCategory(body && body.category);
  const title = cleanLobbyTickerTitle(body && body.title);
  const message = cleanLobbyTickerMessage(body && body.message);
  if (title.length < 3 || message.length < 3) return {ok:false, status:400, code:'INVALID_TICKER_TEXT', message:'Bitte Überschrift und Meldung vollständig eingeben.'};
  const startsMs = Date.parse(String(body && body.startsAt || ''));
  const endsMs = Date.parse(String(body && body.endsAt || ''));
  const effectiveStarts = Number.isFinite(startsMs) ? startsMs : Date.now();
  const effectiveEnds = Number.isFinite(endsMs) ? endsMs : effectiveStarts + 7 * 24 * 60 * 60 * 1000;
  if (effectiveEnds <= effectiveStarts) return {ok:false, status:400, code:'INVALID_TICKER_PERIOD', message:'Das Ende muss nach dem Beginn liegen.'};
  const link = cleanLobbyTickerLink(body && body.linkUrl);
  if (String(body && body.linkUrl || '').trim() && !link) return {ok:false, status:400, code:'INVALID_TICKER_LINK', message:'Der Link muss mit https:// oder / beginnen.'};
  const actionLabel = cleanLobbyTickerTitle(body && body.actionLabel) || (link ? 'Mehr erfahren' : '');
  const requestedPriority = Number(body && body.priority == null ? 50 : body.priority);
  const priority = Number.isFinite(requestedPriority) ? Math.max(0, Math.min(100, Math.round(requestedPriority))) : 50;
  const active = body && body.active === false ? 0 : 1;
  const now = new Date().toISOString();
  const itemId = existing ? String(existing.id) : crypto.randomUUID();
  if (existing) {
    await env.DB.prepare(
      `UPDATE lobby_ticker_items SET category = ?, title = ?, message = ?, action_kind = ?, action_value = ?, action_label = ?,
              priority = ?, starts_at = ?, ends_at = ?, active = ?, updated_at = ? WHERE id = ?`
    ).bind(category, title, message, link ? 'link' : 'none', link || null, actionLabel || null, priority,
      new Date(effectiveStarts).toISOString(), new Date(effectiveEnds).toISOString(), active, now, itemId).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO lobby_ticker_items
         (id, source_key, category, title, message, action_kind, action_value, action_label, priority,
          starts_at, ends_at, active, subject_user_id, created_by_user_id, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
    ).bind(itemId, category, title, message, link ? 'link' : 'none', link || null, actionLabel || null, priority,
      new Date(effectiveStarts).toISOString(), new Date(effectiveEnds).toISOString(), active,
      String(adminUser && adminUser.id || ''), now, now).run();
  }
  const row = await env.DB.prepare(`SELECT * FROM lobby_ticker_items WHERE id = ? LIMIT 1`).bind(itemId).first();
  return {ok:true, item:lobbyTickerItemDto(row, false)};
}


const INFO_CENTER_MAX_ITEMS = 100;
const INFO_CENTER_MAX_ATTACHMENTS = 4;
const INFO_CENTER_MAX_FILE_BYTES = 3 * 1024 * 1024;
const INFO_CENTER_MAX_PGN_BYTES = 2 * 1024 * 1024;
const INFO_CENTER_MAX_TOTAL_FILE_BYTES = 8 * 1024 * 1024;
let infoCenterTablesReady = false;

async function ensureInfoCenterTables(env) {
  if (!env || !env.DB) return false;
  if (infoCenterTablesReady) return true;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS info_center_items (
         id TEXT PRIMARY KEY,
         category TEXT NOT NULL DEFAULT 'news',
         title TEXT NOT NULL,
         summary TEXT NOT NULL,
         body TEXT NOT NULL,
         link_url TEXT,
         action_label TEXT,
         status TEXT NOT NULL DEFAULT 'draft',
         published_at TEXT,
         starts_at TEXT NOT NULL,
         ends_at TEXT,
         show_in_ticker INTEGER NOT NULL DEFAULT 0,
         email_sent_at TEXT,
         created_by_user_id TEXT NOT NULL,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS info_center_attachments (
         id TEXT PRIMARY KEY,
         item_id TEXT NOT NULL,
         file_name TEXT NOT NULL,
         mime_type TEXT NOT NULL,
         size_bytes INTEGER NOT NULL,
         object_key TEXT NOT NULL UNIQUE,
         file_kind TEXT NOT NULL,
         caption TEXT NOT NULL DEFAULT '',
         alt_text TEXT NOT NULL DEFAULT '',
         sort_order INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS info_center_reads (
         item_id TEXT NOT NULL,
         user_id TEXT NOT NULL,
         read_at TEXT NOT NULL,
         PRIMARY KEY (item_id, user_id)
       )`
    )
  ]);
  try { await env.DB.prepare(`ALTER TABLE info_center_attachments ADD COLUMN caption TEXT NOT NULL DEFAULT ''`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE info_center_attachments ADD COLUMN alt_text TEXT NOT NULL DEFAULT ''`).run(); } catch (_) {}
  await env.DB.batch([
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_info_center_visibility ON info_center_items (status, starts_at, ends_at, published_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_info_center_attachments_item ON info_center_attachments (item_id, sort_order)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_info_center_reads_user ON info_center_reads (user_id, read_at)`)
  ]);
  infoCenterTablesReady = true;
  return true;
}

function cleanInfoCenterCategory(value) {
  const category = String(value || '').toLowerCase();
  return ['news', 'update', 'event', 'service'].includes(category) ? category : 'news';
}

function infoCenterCategoryLabel(category) {
  if (category === 'update') return 'Gamer-Update';
  if (category === 'event') return 'Veranstaltung';
  if (category === 'service') return 'Servicehinweis';
  return 'Neuigkeit';
}

function infoCenterCategoryIcon(category) {
  if (category === 'update') return '🛠️';
  if (category === 'event') return '📅';
  if (category === 'service') return '⚙️';
  return 'ℹ️';
}

function cleanInfoCenterTitle(value) {
  return String(value || '').replace(/[\r\n\t<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function cleanInfoCenterSummary(value) {
  return String(value || '').replace(/[\r\n\t<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
}

function cleanInfoCenterBody(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 12000);
}

function cleanInfoCenterStatus(value) {
  const status = String(value || '').toLowerCase();
  return ['draft', 'published', 'archived'].includes(status) ? status : 'draft';
}

function infoCenterAttachmentDto(row) {
  return {
    id:String(row && row.id || ''),
    name:cleanMailAttachmentFilename(row && row.file_name),
    type:String(row && row.mime_type || '').toLowerCase(),
    size:Math.max(0, Number(row && row.size_bytes || 0)),
    kind:String(row && row.file_kind || 'document'),
    caption:cleanInfoCenterFileDescription(row && row.caption),
    altText:cleanInfoCenterFileDescription(row && row.alt_text),
    url:'/api/info-center/attachments/' + encodeURIComponent(String(row && row.id || ''))
  };
}

function cleanInfoCenterFileDescription(value) {
  return String(value || '').replace(/[\r\n\t<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function infoCenterItemDto(row, attachments = [], options = {}) {
  const category = cleanInfoCenterCategory(row && row.category);
  return {
    id:String(row && row.id || ''),
    category,
    categoryLabel:infoCenterCategoryLabel(category),
    icon:infoCenterCategoryIcon(category),
    title:cleanInfoCenterTitle(row && row.title),
    summary:cleanInfoCenterSummary(row && row.summary),
    body:options.includeBody ? cleanInfoCenterBody(row && row.body) : undefined,
    linkUrl:cleanLobbyTickerLink(row && row.link_url),
    actionLabel:cleanInfoCenterTitle(row && row.action_label),
    status:cleanInfoCenterStatus(row && row.status),
    publishedAt:row && row.published_at || null,
    startsAt:row && row.starts_at || null,
    endsAt:row && row.ends_at || null,
    showInTicker:Number(row && row.show_in_ticker || 0) === 1,
    emailSentAt:row && row.email_sent_at || null,
    createdAt:row && row.created_at || null,
    updatedAt:row && row.updated_at || null,
    unread:Number(row && row.is_read || 0) !== 1,
    attachmentCount:Math.max(0, Number(row && row.attachment_count || attachments.length || 0)),
    attachments:Array.isArray(attachments) ? attachments.map(infoCenterAttachmentDto) : []
  };
}

async function infoCenterAttachmentsForItem(env, itemId) {
  const result = await env.DB.prepare(
    `SELECT * FROM info_center_attachments WHERE item_id = ? ORDER BY sort_order, created_at`
  ).bind(String(itemId || '')).all();
  return result && Array.isArray(result.results) ? result.results : [];
}

async function listInfoCenterItems(env, userId) {
  await ensureInfoCenterTables(env);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `SELECT i.*,
            CASE WHEN r.item_id IS NULL THEN 0 ELSE 1 END AS is_read,
            (SELECT COUNT(*) FROM info_center_attachments a WHERE a.item_id = i.id) AS attachment_count
       FROM info_center_items i
       LEFT JOIN info_center_reads r ON r.item_id = i.id AND r.user_id = ?
      WHERE i.status = 'published' AND i.starts_at <= ? AND (i.ends_at IS NULL OR i.ends_at > ?)
      ORDER BY i.published_at DESC, i.created_at DESC
      LIMIT ?`
  ).bind(String(userId || ''), now, now, INFO_CENTER_MAX_ITEMS).all();
  const items = (result && Array.isArray(result.results) ? result.results : []).map(row => infoCenterItemDto(row));
  return {items, unreadCount:items.filter(item => item.unread).length};
}

async function loadInfoCenterItem(env, user, itemId, options = {}) {
  await ensureInfoCenterTables(env);
  const id = String(itemId || '').trim();
  if (!id) return null;
  const admin = isAdminUser(user, env);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT i.*,
            CASE WHEN r.item_id IS NULL THEN 0 ELSE 1 END AS is_read,
            (SELECT COUNT(*) FROM info_center_attachments a WHERE a.item_id = i.id) AS attachment_count
       FROM info_center_items i
       LEFT JOIN info_center_reads r ON r.item_id = i.id AND r.user_id = ?
      WHERE i.id = ? LIMIT 1`
  ).bind(String(user && user.id || ''), id).first();
  if (!row) return null;
  const visible = row.status === 'published' && String(row.starts_at || '') <= now && (!row.ends_at || String(row.ends_at) > now);
  if (!admin && !visible) return null;
  if (options.markRead !== false) {
    await env.DB.prepare(
      `INSERT INTO info_center_reads (item_id, user_id, read_at) VALUES (?, ?, ?)
       ON CONFLICT(item_id, user_id) DO UPDATE SET read_at = excluded.read_at`
    ).bind(id, String(user.id || ''), now).run();
    row.is_read = 1;
  }
  const attachments = await infoCenterAttachmentsForItem(env, id);
  return infoCenterItemDto(row, attachments, {includeBody:true});
}

async function listAdminInfoCenterItems(env) {
  await ensureInfoCenterTables(env);
  const result = await env.DB.prepare(
    `SELECT i.*, 1 AS is_read,
            (SELECT COUNT(*) FROM info_center_attachments a WHERE a.item_id = i.id) AS attachment_count
       FROM info_center_items i
      ORDER BY COALESCE(i.published_at, i.created_at) DESC, i.created_at DESC
      LIMIT 200`
  ).all();
  const rows = result && Array.isArray(result.results) ? result.results : [];
  const items = [];
  for (const row of rows) {
    const attachments = await infoCenterAttachmentsForItem(env, row.id);
    items.push(infoCenterItemDto(row, attachments, {includeBody:true}));
  }
  return items;
}

function infoCenterBase64ToBytes(base64) {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let offset = 0; offset < binary.length; offset += 65536) {
    const end = Math.min(binary.length, offset + 65536);
    for (let index = offset; index < end; index++) bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeInfoCenterUpload(value) {
  if (!value) return {ok:false, status:400, code:'INVALID_INFO_FILE', message:'Die Datei ist unvollständig.'};
  const name = cleanMailAttachmentFilename(value.name || value.filename);
  const extension = mailAttachmentExtension(name);
  let type = String(value.type || value.contentType || '').toLowerCase().trim();
  const base64 = normalizedBase64Content(value.base64 || value.content);
  const allowedByType = {
    'application/pdf':['pdf'],
    'image/jpeg':['jpg', 'jpeg'],
    'image/png':['png'],
    'image/webp':['webp']
  };
  const pgnMime = ['application/x-chess-pgn', 'application/vnd.chess-pgn', 'text/plain', 'application/octet-stream', ''].includes(type);
  if (extension === 'pgn' && pgnMime) type = 'application/x-chess-pgn';
  const allowedExtensions = allowedByType[type] || (type === 'application/x-chess-pgn' ? ['pgn'] : null);
  if (!name || !allowedExtensions || !allowedExtensions.includes(extension) || !base64) {
    return {ok:false, status:400, code:'INVALID_INFO_FILE', message:'Erlaubt sind JPG-, PNG-, WebP-, PDF- und PGN-Dateien.'};
  }
  const size = decodedBase64ByteLength(base64);
  const maxBytes = type === 'application/x-chess-pgn' ? INFO_CENTER_MAX_PGN_BYTES : INFO_CENTER_MAX_FILE_BYTES;
  if (!size || size > maxBytes) {
    return {ok:false, status:400, code:'INFO_FILE_TOO_LARGE', message:type === 'application/x-chess-pgn' ? 'Eine PGN-Datei darf höchstens 2 MB groß sein.' : 'Eine Datei darf höchstens 3 MB groß sein.'};
  }
  let bytes;
  try { bytes = infoCenterBase64ToBytes(base64); }
  catch (_) { return {ok:false, status:400, code:'INVALID_INFO_FILE_DATA', message:'Die Datei konnte nicht gelesen werden.'}; }
  if (type === 'application/x-chess-pgn') {
    let text = '';
    try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
    catch (_) { return {ok:false, status:400, code:'INVALID_PGN_ENCODING', message:'Die PGN-Datei muss als UTF-8-Text gespeichert sein.'}; }
    if (text.includes('\u0000') || (!/^\s*\[[A-Za-z0-9_]+\s+"/m.test(text) && !/(^|\s)\d+\.(?:\.\.)?\s*\S+/.test(text))) {
      return {ok:false, status:400, code:'INVALID_PGN_CONTENT', message:'Der Inhalt wurde nicht als gültige PGN-Partiedatei erkannt.'};
    }
  } else if (!attachmentSignatureMatches(type, base64)) {
    return {ok:false, status:400, code:'INFO_FILE_TYPE_MISMATCH', message:'Dateityp und Dateiinhalt stimmen nicht überein.'};
  }
  return {
    ok:true,
    file:{
      name, extension, type, size, bytes,
      kind:type.startsWith('image/') ? 'image' : type === 'application/x-chess-pgn' ? 'pgn' : 'document',
      caption:cleanInfoCenterFileDescription(value.caption),
      altText:type.startsWith('image/') ? cleanInfoCenterFileDescription(value.altText) : ''
    }
  };
}

async function syncInfoCenterTickerItem(env, row) {
  await ensureLobbyTickerTables(env);
  const id = String(row && row.id || '');
  if (!id) return;
  await env.DB.prepare(`DELETE FROM lobby_ticker_items WHERE source_key = ?`).bind('info:' + id).run();
}

async function saveAdminInfoCenterItem(env, adminUser, body) {
  await ensureInfoCenterTables(env);
  const requestedId = String(body && body.id || '').trim();
  const existing = requestedId ? await env.DB.prepare(`SELECT * FROM info_center_items WHERE id = ? LIMIT 1`).bind(requestedId).first() : null;
  if (requestedId && !existing) return {ok:false, status:404, code:'INFO_ITEM_NOT_FOUND', message:'Die Mitteilung wurde nicht gefunden.'};
  const category = cleanInfoCenterCategory(body && body.category);
  const title = cleanInfoCenterTitle(body && body.title);
  const content = cleanInfoCenterBody(body && body.body);
  const summary = cleanInfoCenterSummary(body && body.summary) || cleanInfoCenterSummary(content);
  const status = cleanInfoCenterStatus(body && body.status);
  if (title.length < 3 || summary.length < 3 || content.length < 3) {
    return {ok:false, status:400, code:'INVALID_INFO_TEXT', message:'Bitte Überschrift, Kurztext und Nachricht vollständig eingeben.'};
  }
  if (body && body.sendEmail === true && status !== 'published') {
    return {ok:false, status:400, code:'INFO_EMAIL_REQUIRES_PUBLISH', message:'Eine zusätzliche E-Mail kann nur beim Veröffentlichen versendet werden.'};
  }
  const startsMs = Date.parse(String(body && body.startsAt || ''));
  const startsAt = new Date(Number.isFinite(startsMs) ? startsMs : Date.now()).toISOString();
  const rawEnds = String(body && body.endsAt || '').trim();
  const endsMs = rawEnds ? Date.parse(rawEnds) : NaN;
  const endsAt = Number.isFinite(endsMs) ? new Date(endsMs).toISOString() : null;
  if (rawEnds && !endsAt) return {ok:false, status:400, code:'INVALID_INFO_END', message:'Das optionale Enddatum ist ungültig.'};
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return {ok:false, status:400, code:'INVALID_INFO_PERIOD', message:'Das Enddatum muss nach dem Start liegen.'};
  const linkUrl = cleanLobbyTickerLink(body && body.linkUrl);
  if (String(body && body.linkUrl || '').trim() && !linkUrl) return {ok:false, status:400, code:'INVALID_INFO_LINK', message:'Der Link muss mit https:// oder / beginnen.'};
  const actionLabel = cleanInfoCenterTitle(body && body.actionLabel) || (linkUrl ? 'Mehr erfahren' : '');
  const itemId = existing ? String(existing.id) : crypto.randomUUID();
  const currentAttachments = existing ? await infoCenterAttachmentsForItem(env, itemId) : [];
  const keepIds = new Set((Array.isArray(body && body.keepAttachmentIds) ? body.keepAttachmentIds : []).map(String));
  const kept = currentAttachments.filter(item => keepIds.has(String(item.id)));
  const attachmentMeta = new Map((Array.isArray(body && body.attachmentMeta) ? body.attachmentMeta : []).map(item => [String(item && item.id || ''), item || {}]));
  const rawUploads = Array.isArray(body && body.attachments) ? body.attachments : [];
  if (kept.length + rawUploads.length > INFO_CENTER_MAX_ATTACHMENTS) {
    return {ok:false, status:400, code:'TOO_MANY_INFO_FILES', message:'Pro Mitteilung sind höchstens vier Dateien möglich.'};
  }
  const uploads = [];
  let totalBytes = kept.reduce((sum, item) => sum + Math.max(0, Number(item.size_bytes || 0)), 0);
  for (const raw of rawUploads) {
    const normalized = normalizeInfoCenterUpload(raw);
    if (!normalized.ok) return normalized;
    totalBytes += normalized.file.size;
    uploads.push(normalized.file);
  }
  if (totalBytes > INFO_CENTER_MAX_TOTAL_FILE_BYTES) {
    return {ok:false, status:400, code:'INFO_FILES_TOTAL_TOO_LARGE', message:'Alle Dateien zusammen dürfen höchstens 8 MB groß sein.'};
  }
  if (uploads.length && (!env.AVATARS || typeof env.AVATARS.put !== 'function')) {
    return {ok:false, status:503, code:'INFO_FILE_STORAGE_UNAVAILABLE', message:'Der Dateispeicher ist derzeit nicht verfügbar.'};
  }

  const now = new Date().toISOString();
  const publishedAt = status === 'published'
    ? (existing && existing.status === 'published' && existing.published_at ? existing.published_at : now)
    : null;
  const newObjects = [];
  try {
    for (let index = 0; index < uploads.length; index++) {
      const file = uploads[index];
      const attachmentId = crypto.randomUUID();
      const objectKey = `info-center/${itemId}/${attachmentId}.${file.extension}`;
      await env.AVATARS.put(objectKey, file.bytes, {
        httpMetadata:{contentType:file.type},
        customMetadata:{itemId, purpose:'info-center', originalName:file.name}
      });
      newObjects.push({...file, id:attachmentId, objectKey, sortOrder:kept.length + index});
    }

    if (existing) {
      await env.DB.prepare(
        `UPDATE info_center_items SET category = ?, title = ?, summary = ?, body = ?, link_url = ?, action_label = ?,
                status = ?, published_at = ?, starts_at = ?, ends_at = ?, show_in_ticker = ?, updated_at = ? WHERE id = ?`
      ).bind(category, title, summary, content, linkUrl || null, actionLabel || null, status, publishedAt,
        startsAt, endsAt, 0, now, itemId).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO info_center_items
           (id, category, title, summary, body, link_url, action_label, status, published_at, starts_at, ends_at,
            show_in_ticker, email_sent_at, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
      ).bind(itemId, category, title, summary, content, linkUrl || null, actionLabel || null, status, publishedAt,
        startsAt, endsAt, 0, String(adminUser && adminUser.id || ''), now, now).run();
    }

    for (const file of newObjects) {
      await env.DB.prepare(
        `INSERT INTO info_center_attachments
           (id, item_id, file_name, mime_type, size_bytes, object_key, file_kind, caption, alt_text, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(file.id, itemId, file.name, file.type, file.size, file.objectKey, file.kind, file.caption, file.altText, file.sortOrder, now).run();
    }
    for (const file of kept) {
      const meta = attachmentMeta.get(String(file.id)) || {};
      await env.DB.prepare(`UPDATE info_center_attachments SET caption = ?, alt_text = ? WHERE id = ? AND item_id = ?`)
        .bind(cleanInfoCenterFileDescription(meta.caption), String(file.file_kind || '') === 'image' ? cleanInfoCenterFileDescription(meta.altText) : '', String(file.id), itemId).run();
    }
    const removed = currentAttachments.filter(item => !keepIds.has(String(item.id)));
    for (const item of removed) {
      await env.DB.prepare(`DELETE FROM info_center_attachments WHERE id = ? AND item_id = ?`).bind(String(item.id), itemId).run();
      if (env.AVATARS && item.object_key) {
        try { await env.AVATARS.delete(String(item.object_key)); } catch (_) {}
      }
    }
  } catch (error) {
    for (const file of newObjects) {
      try { await env.AVATARS.delete(file.objectKey); } catch (_) {}
    }
    throw error;
  }

  let row = await env.DB.prepare(`SELECT * FROM info_center_items WHERE id = ? LIMIT 1`).bind(itemId).first();
  await syncInfoCenterTickerItem(env, row);
  let mailResult = null;
  if (body && body.sendEmail === true && row.status === 'published') {
    const emailText = [row.summary, '', cleanInfoCenterBody(row.body), '', 'Die vollständige Mitteilung findest du im Info-Center des Hammerschach-Gamers.'].join('\n').slice(0, ADMIN_MEMBER_MESSAGE_MAX_LENGTH);
    try { mailResult = await sendAdminMemberMessage(env, adminUser, {kind:'news', subject:row.title, message:emailText, confirmed:true}); }
    catch (error) { mailResult = {ok:false, code:'INFO_EMAIL_FAILED', message:error && error.message ? error.message : 'Der optionale Mailversand ist fehlgeschlagen.'}; }
    const mailComplete = !!(mailResult && mailResult.ok && Number(mailResult.sentCount || 0) > 0 && Number(mailResult.failedCount || 0) === 0);
    if (mailComplete) {
      const sentAt = new Date().toISOString();
      await env.DB.prepare(`UPDATE info_center_items SET email_sent_at = ?, updated_at = ? WHERE id = ?`).bind(sentAt, sentAt, itemId).run();
      row = await env.DB.prepare(`SELECT * FROM info_center_items WHERE id = ? LIMIT 1`).bind(itemId).first();
    } else if (mailResult && mailResult.ok) {
      mailResult = {...mailResult, ok:false, message:mailResult.message || 'Der optionale Mailversand wurde nicht vollständig abgeschlossen.'};
    }
  }
  const attachments = await infoCenterAttachmentsForItem(env, itemId);
  return {ok:true, item:infoCenterItemDto({...row, is_read:1}, attachments, {includeBody:true}), mailResult};
}

async function deleteAdminInfoCenterItem(env, itemId) {
  await ensureInfoCenterTables(env);
  await ensureLobbyTickerTables(env);
  const id = String(itemId || '').trim();
  const row = await env.DB.prepare(`SELECT * FROM info_center_items WHERE id = ? LIMIT 1`).bind(id).first();
  if (!row) return {ok:false, status:404, code:'INFO_ITEM_NOT_FOUND', message:'Die Mitteilung wurde nicht gefunden.'};
  const attachments = await infoCenterAttachmentsForItem(env, id);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM info_center_reads WHERE item_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM info_center_attachments WHERE item_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM info_center_items WHERE id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM lobby_ticker_items WHERE source_key = ?`).bind('info:' + id)
  ]);
  if (env.AVATARS) {
    for (const attachment of attachments) {
      try { await env.AVATARS.delete(String(attachment.object_key || '')); } catch (_) {}
    }
  }
  return {ok:true, message:'Die Info-Center-Mitteilung wurde gelöscht.'};
}

async function infoCenterAttachmentResponse(request, env, user, attachmentId) {
  await ensureInfoCenterTables(env);
  const id = String(attachmentId || '').trim();
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT a.*, i.status, i.starts_at, i.ends_at
       FROM info_center_attachments a
       JOIN info_center_items i ON i.id = a.item_id
      WHERE a.id = ? LIMIT 1`
  ).bind(id).first();
  if (!row) return new Response(null, {status:404, headers:{'cache-control':'no-store'}});
  const visible = row.status === 'published' && String(row.starts_at || '') <= now && (!row.ends_at || String(row.ends_at) > now);
  if (!isAdminUser(user, env) && !visible) return new Response(null, {status:404, headers:{'cache-control':'no-store'}});
  if (!env.AVATARS) return new Response(null, {status:503, headers:{'cache-control':'no-store'}});
  const object = await env.AVATARS.get(String(row.object_key || ''));
  if (!object) return new Response(null, {status:404, headers:{'cache-control':'no-store'}});
  const headers = new Headers();
  if (object.writeHttpMetadata) object.writeHttpMetadata(headers);
  headers.set('content-type', String(row.mime_type || headers.get('content-type') || 'application/octet-stream'));
  headers.set('content-length', String(row.size_bytes || object.size || ''));
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cache-control', 'private, max-age=300');
  const disposition = String(row.file_kind || '') === 'pgn' ? 'attachment' : 'inline';
  const asciiName = cleanMailAttachmentFilename(row.file_name).replace(/[^A-Za-z0-9._-]/g, '_') || 'Datei';
  const encodedName = encodeURIComponent(cleanMailAttachmentFilename(row.file_name) || 'Datei').replace(/'/g, '%27');
  headers.set('content-disposition', `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
  return new Response(object.body, {status:200, headers});
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
  const id=env.GAME_ROOM.idFromName(roomId), stub=gameRoomStub(env,id);
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

  const readerArchivesResponse = await handleReaderArchivesApi(request, env, url, {
    json,
    lookupAuthSession,
    bearerTokenFromRequest,
    requireAdminSession,
    readJsonBody
  });
  if (readerArchivesResponse) return readerArchivesResponse;

  const leagueStandingsResponse = await handleLeagueStandingsApi(request, env, url, {
    json,
    lookupAuthSession,
    bearerTokenFromRequest,
    requireAdminSession,
    readJsonBody
  });
  if (leagueStandingsResponse) return leagueStandingsResponse;

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

  if (url.pathname === '/api/tv' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Gamer-TV ist nur für eingeloggte Mitglieder verfügbar.'}, {status:401});
    try {
      const config = await loadTvConfig(env);
      const resolved = await resolveTvConfigSet(env, config);
      return json({ok:true, tv:tvSetDto(config, resolved)});
    } catch (error) {
      console.error('Hammerschach TV load failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'HAMMERSCHACH_TV_UNAVAILABLE', message:'Gamer-TV konnte momentan nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/admin/tv' && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const body = await readJsonBody(request);
    if (!body) return json({ok:false, code:'BAD_JSON', message:'Die TV-Einstellungen konnten nicht gelesen werden.'}, {status:400});
    try {
      const saved = await saveTvConfig(env, body, admin.session.user);
      if (!saved.ok) return json({ok:false, code:saved.code, message:saved.message}, {status:saved.status || 400});
      const resolved = await resolveTvConfigSet(env, saved.config, {forceAll:true});
      return json({ok:true, tv:tvSetDto(saved.config, resolved), message:'Die drei Senderplätze von Gamer-TV wurden gespeichert.'});
    } catch (error) {
      console.error('Hammerschach TV save failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'HAMMERSCHACH_TV_SAVE_FAILED', message:'Die TV-Einstellungen konnten nicht gespeichert werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/admin/tv/refresh' && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    try {
      const body = await readJsonBody(request);
      const requestedSlotId = body && /^tv[1-3]$/.test(String(body.slotId || '').toLowerCase())
        ? String(body.slotId).toLowerCase()
        : 'tv1';
      const config = await loadTvConfig(env);
      const resolved = await resolveTvConfigSet(env, config, {forceSlotId:requestedSlotId});
      const dto = tvSetDto(config, resolved);
      const refreshed = dto.slots.find(slot => slot.slotId === requestedSlotId) || dto.slots[0];
      const refreshedMessage = refreshed && refreshed.stream && refreshed.stream.kind === 'playlist'
        ? refreshed.stream.playlistItemsMessage
        : refreshed && refreshed.message;
      return json({ok:true, tv:dto, message:refreshedMessage || `${requestedSlotId.toUpperCase()} wurde aktualisiert.`});
    } catch (error) {
      console.error('Hammerschach TV refresh failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'HAMMERSCHACH_TV_REFRESH_FAILED', message:'Die YouTube-Suche konnte nicht aktualisiert werden.'}, {status:500});
    }
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

  if (url.pathname === '/api/tournaments/live-status' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    try {
      return json({ok:true, liveTournament:await liveTournamentStatusForUser(env, session.user), serverNow:Date.now()});
    } catch (error) {
      console.error('Live tournament status failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'LIVE_TOURNAMENT_STATUS_FAILED', message:'Der Live-Turnierstatus konnte nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/tournaments' && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const body = await readJsonBody(request);
    if (!body) return json({ok:false, code:'BAD_JSON', message:'Der Turnierentwurf konnte nicht gelesen werden.'}, {status:400});
    const name = cleanTournamentName(body.name);
    const description = cleanTournamentDescription(body.description);
    const tournamentType = normalizeTournamentType(body.tournamentType);
    const live = tournamentType !== TOURNAMENT_TYPE_DAILY;
    const requestedMode = normalizeTournamentMode(body.mode);
    const mode = live ? (requestedMode === TOURNAMENT_MODE_ARENA ? TOURNAMENT_MODE_ARENA : TOURNAMENT_MODE_SWISS) : requestedMode;
    const players = normalizeTournamentCapacity(tournamentType, mode, body.players);
    const arenaDuration = mode === TOURNAMENT_MODE_ARENA ? normalizeTournamentArenaDuration(body.arenaDurationMinutes) : null;
    const hours = TOURNAMENT_ALLOWED_HOURS.includes(Number(body.hours)) ? Number(body.hours) : 24;
    const timeKey = live ? normalizeTournamentTimeKey(tournamentType, body.timeKey) : '';
    const timeLabel = tournamentTimeLabel(tournamentType, timeKey, hours);
    const scheduledStartMs = Date.parse(String(body.scheduledStartAt || ''));
    const scheduledStartAt = Number.isFinite(scheduledStartMs) ? new Date(scheduledStartMs).toISOString() : null;
    const variant = normalizeTournamentVariant(body.variant);
    const themeRequested = body.theme !== null && body.theme !== undefined;
    const theme = themeRequested ? cleanThemeDefinition(body.theme) : null;
    const themeJson = theme ? JSON.stringify(theme) : null;
    if (name.length < 3) return json({ok:false, code:'INVALID_TOURNAMENT_NAME', message:'Bitte einen Turniernamen mit mindestens drei Zeichen eingeben.'}, {status:400});
    if (themeRequested && !theme) return json({ok:false, code:'INVALID_TOURNAMENT_THEME', message:'Die gewählte Eröffnung ist ungültig oder enthält keine vollständig legale Zugfolge.'}, {status:400});
    if (theme && variant === GAME_VARIANT_FREESTYLE) return json({ok:false, code:'THEME_FREESTYLE_CONFLICT', message:'Thementurniere verwenden klassische Eröffnungen und können nicht mit Freestyle kombiniert werden.'}, {status:400});
    if (!scheduledStartAt) return json({ok:false, code:'INVALID_TOURNAMENT_START', message:'Bitte einen gültigen geplanten Start für das Turnier wählen.'}, {status:400});
    if (Date.parse(scheduledStartAt) <= Date.now()) return json({ok:false, code:'TOURNAMENT_START_IN_PAST', message:'Der geplante Turnierstart muss in der Zukunft liegen.'}, {status:400});
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
              SET name = ?, description = ?, max_players = ?, hours_per_move = ?, rated = ?, variant = ?, theme_json = ?, tournament_type = ?,
                  time_key = ?, time_label = ?, scheduled_start_at = ?, arena_duration_minutes = ?, arena_ends_at = NULL,
                  arena_closed_at = NULL, round_pause_seconds = 60, mode = ?, updated_at = ?
            WHERE id = ? AND status = 'draft'`
        ).bind(name, description, players, hours, body.rated === false ? 0 : 1, variant, themeJson, tournamentType, timeKey || null, timeLabel, scheduledStartAt, arenaDuration, mode, now, id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO tournaments
             (id, name, description, max_players, hours_per_move, rated, variant, theme_json, tournament_type, time_key, time_label,
              scheduled_start_at, arena_duration_minutes, round_pause_seconds, mode, status, created_by_user_id,
              current_round, total_rounds, created_at, updated_at, published_at, started_at, ended_at, publication_mail_sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 60, ?, 'draft', ?, 0, 0, ?, ?, NULL, NULL, NULL, NULL)`
        ).bind(id, name, description, players, hours, body.rated === false ? 0 : 1, variant, themeJson, tournamentType, timeKey || null, timeLabel, scheduledStartAt, arenaDuration, mode, admin.session.user.id, now, now).run();
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
      let automaticStartScheduled = false;
      if (published.scheduled_start_at) {
        try { automaticStartScheduled = await scheduleTournamentAlarm(env, published, published.scheduled_start_at, 'start'); }
        catch (error) { console.error('Tournament start scheduling failed', error && error.message ? error.message : String(error || 'unknown')); }
      }
      const mail = await sendTournamentPublishedEmails(env, published);
      await env.DB.prepare(`UPDATE tournaments SET publication_mail_sent_at = ? WHERE id = ?`).bind(new Date().toISOString(), tournamentId).run();
      return json({ok:true, tournament:await tournamentDto(env, published, admin.session.user), mail, automaticStartScheduled, message:`Turnier wurde veröffentlicht. ${mail.sent} Turniermail${mail.sent === 1 ? '' : 's'} versendet${mail.failed ? `, ${mail.failed} fehlgeschlagen` : ''}.${published.scheduled_start_at ? ' Der geplante automatische Start ist eingeplant.' : ''}`});
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

  const tournamentCheckInMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/check-in$/);
  if (tournamentCheckInMatch && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    const body = await readJsonBody(request);
    if (!body || body.confirmed !== true) return json({ok:false, code:'CONFIRMATION_REQUIRED', message:'Bitte deine Anwesenheit ausdrücklich bestätigen.'}, {status:400});
    const tournamentId = String(decodeURIComponent(tournamentCheckInMatch[1]) || '').trim();
    try {
      const tournament = await loadTournamentRow(env, tournamentId);
      if (!tournament || !tournamentIsLive(tournament)) return json({ok:false, code:'LIVE_TOURNAMENT_NOT_FOUND', message:'Das Live-Turnier wurde nicht gefunden.'}, {status:404});
      if (!['open', 'full'].includes(tournament.status)) return json({ok:false, code:'CHECK_IN_CLOSED', message:'Der Check-in ist nicht geöffnet.'}, {status:409});
      const scheduled = Date.parse(tournament.scheduled_start_at || '');
      const opensAt = scheduled - 60 * 60 * 1000;
      if (!Number.isFinite(scheduled) || Date.now() < opensAt) {
        return json({ok:false, code:'CHECK_IN_NOT_OPEN', message:'Der Check-in öffnet eine Stunde vor dem Turnierstart.'}, {status:409});
      }
      const participant = await env.DB.prepare(`SELECT status, checked_in_at FROM tournament_participants WHERE tournament_id = ? AND user_id = ? LIMIT 1`).bind(tournamentId, session.user.id).first();
      if (!participant || participant.status !== 'confirmed') return json({ok:false, code:'NOT_CONFIRMED', message:'Du besitzt keinen bestätigten Startplatz für dieses Turnier.'}, {status:409});
      if (participant.checked_in_at) return json({ok:true, tournament:await tournamentDto(env, tournament, session.user), message:'Deine Anwesenheit ist bereits bestätigt.'});
      const now = new Date().toISOString();
      const arena = normalizeTournamentMode(tournament.mode) === TOURNAMENT_MODE_ARENA;
      await env.DB.prepare(
        `UPDATE tournament_participants SET checked_in_at = ?, arena_active = CASE WHEN ? = 1 THEN 1 ELSE arena_active END,
                arena_joined_at = CASE WHEN ? = 1 THEN COALESCE(arena_joined_at, ?) ELSE arena_joined_at END,
                arena_waiting_since = CASE WHEN ? = 1 THEN ? ELSE arena_waiting_since END,
                arena_pairing_not_before = CASE WHEN ? = 1 THEN NULL ELSE arena_pairing_not_before END, updated_at = ?
          WHERE tournament_id = ? AND user_id = ? AND status = 'confirmed'`
      ).bind(now, arena ? 1 : 0, arena ? 1 : 0, now, arena ? 1 : 0, now, arena ? 1 : 0, now, tournamentId, session.user.id).run();
      if (Number.isFinite(scheduled) && Date.now() >= scheduled) {
        const outcome = await autoStartScheduledTournament(env, tournamentId);
        if (outcome.started && outcome.arena && outcome.arenaEndsAt) {
          const running = await loadTournamentRow(env, tournamentId);
          await scheduleTournamentAlarm(env, running, outcome.arenaEndsAt, 'end');
        }
      }
      const updated = await loadTournamentRow(env, tournamentId);
      return json({ok:true, tournament:await tournamentDto(env, updated, session.user), message:'Anwesenheit bestätigt – du bist startbereit.'});
    } catch (error) {
      console.error('Tournament check-in failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'TOURNAMENT_CHECK_IN_FAILED', message:'Der Check-in konnte nicht gespeichert werden.'}, {status:500});
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
      const arena = tournamentIsLive(tournament) && normalizeTournamentMode(tournament.mode) === TOURNAMENT_MODE_ARENA;
      const now = new Date().toISOString();
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (!body || body.confirmed !== true) return json({ok:false, code:'CONFIRMATION_REQUIRED', message:'Bitte deine Teilnahme ausdrücklich bestätigen.'}, {status:400});
        const existing = await env.DB.prepare(`SELECT status FROM tournament_participants WHERE tournament_id = ? AND user_id = ? LIMIT 1`).bind(tournamentId, session.user.id).first();
        if (existing && ['confirmed', 'waiting'].includes(existing.status)) {
          const row = await loadTournamentRow(env, tournamentId);
          return json({ok:true, tournament:await tournamentDto(env, row, session.user), message:existing.status === 'waiting' ? 'Du stehst bereits auf der Warteliste.' : 'Deine Teilnahme ist bereits bestätigt.'});
        }
        if (arena) {
          await env.DB.prepare(
            `INSERT INTO tournament_participants
               (tournament_id, user_id, status, checked_in_at, arena_active, arena_joined_at, arena_waiting_since, arena_pairing_not_before, joined_at, updated_at)
             VALUES (?, ?, 'confirmed', NULL, 0, NULL, NULL, NULL, ?, ?)
             ON CONFLICT(tournament_id, user_id) DO UPDATE SET status = 'confirmed', checked_in_at = NULL, arena_active = 0,
               arena_joined_at = NULL, arena_waiting_since = NULL, arena_pairing_not_before = NULL,
               joined_at = excluded.joined_at, updated_at = excluded.updated_at`
          ).bind(tournamentId, session.user.id, now, now).run();
          await env.DB.prepare(`UPDATE tournaments SET status = 'open', updated_at = ? WHERE id = ? AND status IN ('open','full')`).bind(now, tournamentId).run();
          const row = await loadTournamentRow(env, tournamentId);
          return json({ok:true, tournament:await tournamentDto(env, row, session.user), message:'Deine Arena-Teilnahme wurde bestätigt. Eine Stunde vor dem Start kannst du einchecken.'});
        }
        await env.DB.prepare(
          `INSERT INTO tournament_participants (tournament_id, user_id, status, checked_in_at, joined_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, ?)
           ON CONFLICT(tournament_id, user_id) DO UPDATE SET status = excluded.status, checked_in_at = NULL, joined_at = excluded.joined_at, updated_at = excluded.updated_at`
        ).bind(tournamentId, session.user.id, 'waiting', now, now).run();
        const balanced = await rebalanceTournamentParticipants(env, tournamentId, tournament.max_players);
        const nextStatus = balanced.confirmed >= Number(tournament.max_players || 0) ? 'full' : 'open';
        await env.DB.prepare(`UPDATE tournaments SET status = ?, updated_at = ? WHERE id = ? AND status IN ('open','full')`).bind(nextStatus, now, tournamentId).run();
        let autoStartOutcome = null;
        const scheduledMs = Date.parse(tournament.scheduled_start_at || '');
        if (Number.isFinite(scheduledMs) && Date.now() >= scheduledMs) {
          autoStartOutcome = await autoStartScheduledTournament(env, tournamentId);
          if (autoStartOutcome.started && autoStartOutcome.arena && autoStartOutcome.arenaEndsAt) {
            const running = await loadTournamentRow(env, tournamentId);
            await scheduleTournamentAlarm(env, running, autoStartOutcome.arenaEndsAt, 'end');
          }
        }
        if (nextStatus === 'full' && !(autoStartOutcome && autoStartOutcome.started)) await notifyAdminTournamentFull(env, tournamentId);
        const row = await loadTournamentRow(env, tournamentId);
        const dto = await tournamentDto(env, row, session.user);
        const joinedMessage = dto.userState === 'waiting'
          ? `Das Turnier ist voll. Du stehst auf Wartelistenplatz ${dto.waitlistPosition || 1}.`
          : (autoStartOutcome && autoStartOutcome.started
            ? `Deine Teilnahme wurde bestätigt. Das Turnier startet jetzt mit ${autoStartOutcome.startingPlayers} Teilnehmern.`
            : 'Deine Teilnahme wurde bestätigt.');
        return json({ok:true, tournament:dto, message:joinedMessage});
      }

      const existing = await env.DB.prepare(`SELECT status FROM tournament_participants WHERE tournament_id = ? AND user_id = ? LIMIT 1`).bind(tournamentId, session.user.id).first();
      if (!existing || !['confirmed', 'waiting'].includes(existing.status)) return json({ok:false, code:'NOT_REGISTERED', message:'Du bist für dieses Turnier nicht angemeldet.'}, {status:409});
      await env.DB.prepare(`UPDATE tournament_participants SET status = 'withdrawn', checked_in_at = NULL, updated_at = ? WHERE tournament_id = ? AND user_id = ?`).bind(now, tournamentId, session.user.id).run();
      if (arena) {
        await env.DB.prepare(`UPDATE tournament_participants SET arena_active = 0, arena_waiting_since = NULL, arena_pairing_not_before = NULL WHERE tournament_id = ? AND user_id = ?`).bind(tournamentId, session.user.id).run();
        await env.DB.prepare(`UPDATE tournaments SET status = 'open', updated_at = ? WHERE id = ? AND status IN ('open','full')`).bind(now, tournamentId).run();
        const row = await loadTournamentRow(env, tournamentId);
        return json({ok:true, tournament:await tournamentDto(env, row, session.user), message:'Deine Arena-Anmeldung wurde zurückgezogen.'});
      }
      const balanced = await rebalanceTournamentParticipants(env, tournamentId, tournament.max_players);
      const nextStatus = balanced.confirmed >= Number(tournament.max_players || 0) ? 'full' : 'open';
      await env.DB.prepare(
        `UPDATE tournaments
            SET status = ?, updated_at = ?,
                full_notification_sent_at = CASE WHEN ? = 'open' THEN NULL ELSE full_notification_sent_at END
          WHERE id = ? AND status IN ('open','full')`
      ).bind(nextStatus, now, nextStatus, tournamentId).run();
      const scheduledMs = Date.parse(tournament.scheduled_start_at || '');
      if (Number.isFinite(scheduledMs) && Date.now() >= scheduledMs) {
        await autoStartScheduledTournament(env, tournamentId);
      }
      const row = await loadTournamentRow(env, tournamentId);
      return json({ok:true, tournament:await tournamentDto(env, row, session.user), message:'Deine Turnierteilnahme wurde zurückgezogen.'});
    } catch (error) {
      console.error('Tournament registration failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'TOURNAMENT_REGISTRATION_FAILED', message:'Die Turnieranmeldung konnte nicht verarbeitet werden.'}, {status:500});
    }
  }

  const tournamentArenaActionMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/arena\/(join|pause|resume)$/);
  if (tournamentArenaActionMatch && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    const tournamentId = String(decodeURIComponent(tournamentArenaActionMatch[1]) || '').trim();
    const action = String(tournamentArenaActionMatch[2] || '');
    try {
      let tournament = await loadTournamentRow(env, tournamentId);
      if (!tournament || !tournamentIsLive(tournament) || normalizeTournamentMode(tournament.mode) !== TOURNAMENT_MODE_ARENA) {
        return json({ok:false, code:'ARENA_NOT_FOUND', message:'Diese Arena wurde nicht gefunden.'}, {status:404});
      }
      await closeArenaTournamentIfDue(env, tournamentId);
      tournament = await loadTournamentRow(env, tournamentId);
      if (!tournament || tournament.status !== 'running' || tournament.arena_closed_at) {
        return json({ok:false, code:'ARENA_CLOSED', message:'Diese Arena nimmt keine neuen Partien mehr auf.'}, {status:409});
      }
      const now = new Date().toISOString();
      await setUserPresence(env, session.user.id, true);
      if (action === 'join') {
        await env.DB.prepare(
          `INSERT INTO tournament_participants
             (tournament_id, user_id, status, checked_in_at, arena_active, arena_joined_at, arena_waiting_since, arena_pairing_not_before, joined_at, updated_at)
           VALUES (?, ?, 'confirmed', ?, 1, ?, ?, NULL, ?, ?)
           ON CONFLICT(tournament_id, user_id) DO UPDATE SET status = 'confirmed', checked_in_at = COALESCE(tournament_participants.checked_in_at, excluded.checked_in_at),
             arena_active = 1, arena_joined_at = COALESCE(tournament_participants.arena_joined_at, excluded.arena_joined_at),
             arena_waiting_since = excluded.arena_waiting_since, arena_pairing_not_before = NULL, updated_at = excluded.updated_at`
        ).bind(tournamentId, session.user.id, now, now, now, now, now).run();
        await pairArenaPlayers(env, tournamentId);
        const row = await loadTournamentRow(env, tournamentId);
        return json({ok:true, tournament:await tournamentDto(env, row, session.user), message:'Du bist in der Arena. Sobald ein passender Gegner frei ist, öffnet sich dein Brett automatisch.'});
      }
      const participant = await env.DB.prepare(
        `SELECT status, arena_active FROM tournament_participants WHERE tournament_id = ? AND user_id = ? LIMIT 1`
      ).bind(tournamentId, session.user.id).first();
      if (!participant || participant.status !== 'confirmed') return json({ok:false, code:'NOT_IN_ARENA', message:'Du bist dieser Arena noch nicht beigetreten.'}, {status:409});
      if (action === 'pause') {
        if (Number(participant.arena_active || 0) === 2) return json({ok:false, code:'ARENA_GAME_RUNNING', message:'Während einer laufenden Arena-Partie kannst du nicht pausieren.'}, {status:409});
        await env.DB.prepare(`UPDATE tournament_participants SET arena_active = 0, arena_waiting_since = NULL, arena_pairing_not_before = NULL, updated_at = ? WHERE tournament_id = ? AND user_id = ?`)
          .bind(now, tournamentId, session.user.id).run();
        const row = await loadTournamentRow(env, tournamentId);
        return json({ok:true, tournament:await tournamentDto(env, row, session.user), message:'Arena pausiert. Du erhältst bis zum Fortsetzen keine neue Paarung.'});
      }
      await env.DB.prepare(`UPDATE tournament_participants SET arena_active = 1, arena_waiting_since = ?, arena_pairing_not_before = NULL, updated_at = ? WHERE tournament_id = ? AND user_id = ?`)
        .bind(now, now, tournamentId, session.user.id).run();
      await pairArenaPlayers(env, tournamentId);
      const row = await loadTournamentRow(env, tournamentId);
      return json({ok:true, tournament:await tournamentDto(env, row, session.user), message:'Arena fortgesetzt. Dein nächstes Brett wird automatisch geöffnet.'});
    } catch (error) {
      console.error('Arena action failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'ARENA_ACTION_FAILED', message:'Die Arena-Aktion konnte nicht ausgeführt werden.'}, {status:500});
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
        return json({ok:true, tournament:await tournamentDto(env, recovered, admin.session.user), message:'Die noch fehlenden Partien der laufenden Turnierrunde wurden vorbereitet.'});
      }
      if (!['open', 'full'].includes(tournament.status)) return json({ok:false, code:'TOURNAMENT_NOT_STARTABLE', message:'Dieses Turnier kann in seinem aktuellen Status nicht gestartet werden.'}, {status:409});
      const live = tournamentIsLive(tournament);
      const mode = normalizeTournamentMode(tournament.mode);
      const scheduledMs = Date.parse(tournament.scheduled_start_at || '');
      if (Number.isFinite(scheduledMs)) {
        const manualEarlyStart = scheduledMs > Date.now();
        const outcome = await autoStartScheduledTournament(env, tournamentId, manualEarlyStart ? {force:true} : {});
        if (!outcome.started) {
          let message = 'Das Turnier konnte noch nicht gestartet werden.';
          if (outcome.reason === 'waiting_for_players') {
            if (mode === TOURNAMENT_MODE_SWISS) {
              message = live
                ? 'Für den Start des Schweizer Systems werden mindestens vier eingecheckte Teilnehmer benötigt.'
                : 'Für den Start des Schweizer Systems werden mindestens vier bestätigte Teilnehmer benötigt.';
            } else {
              message = `Für den Start werden genau ${Number(tournament.max_players || 0)} bestätigte Teilnehmer benötigt.`;
            }
          }
          return json({ok:false, code:'TOURNAMENT_START_REQUIREMENTS', message}, {status:409});
        }
        if (outcome.arena) {
          const running = await loadTournamentRow(env, tournamentId);
          if (outcome.arenaEndsAt) await scheduleTournamentAlarm(env, running, outcome.arenaEndsAt, 'end');
          await pairArenaPlayers(env, tournamentId);
        }
        const finalRow = await loadTournamentRow(env, tournamentId);
        return json({ok:true, tournament:await tournamentDto(env, finalRow, admin.session.user), message:outcome.arena
          ? (manualEarlyStart ? 'Die Arena wurde vom Turnier-Admin vorzeitig gestartet. Mitglieder können während der gesamten Laufzeit einsteigen.' : 'Die Arena wurde gestartet. Mitglieder können während der gesamten Laufzeit einsteigen.')
          : `${live ? 'Das Live-Turnier' : 'Das Turnier'} wurde${manualEarlyStart ? ' vom Turnier-Admin vorzeitig' : ''} mit ${outcome.startingPlayers} Teilnehmern gestartet. Die Bretter der ersten Runde werden automatisch geöffnet.`});
      }

      if (live) {
        const outcome = await autoStartScheduledTournament(env, tournamentId, {force:true});
        if (!outcome.started) {
          const message = outcome.reason === 'waiting_for_players'
            ? 'Für den Start des Schweizer Systems werden mindestens vier eingecheckte Teilnehmer benötigt.'
            : 'Das Live-Turnier konnte nicht gestartet werden.';
          return json({ok:false, code:'TOURNAMENT_START_REQUIREMENTS', message}, {status:409});
        }
        if (outcome.arena) {
          const running = await loadTournamentRow(env, tournamentId);
          if (outcome.arenaEndsAt) await scheduleTournamentAlarm(env, running, outcome.arenaEndsAt, 'end');
          await pairArenaPlayers(env, tournamentId);
        }
        const finalRow = await loadTournamentRow(env, tournamentId);
        return json({ok:true, tournament:await tournamentDto(env, finalRow, admin.session.user), message:outcome.arena
          ? 'Die Arena wurde gestartet. Mitglieder können während der gesamten Laufzeit einsteigen.'
          : `Das Live-Turnier wurde mit ${outcome.startingPlayers} Teilnehmern gestartet. Die Bretter der ersten Runde werden automatisch geöffnet.`});
      }

      // Rückwärtskompatibilität: ältere veröffentlichte Daily-Turniere besitzen noch keinen geplanten Start.
      const count = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM tournament_participants WHERE tournament_id = ? AND status = 'confirmed'`
      ).bind(tournamentId).first();
      const startingPlayers = Number(count && count.count || 0);
      const capacity = tournamentStartCapacity(tournament, startingPlayers);
      if (!capacity.ok) {
        const message = mode === TOURNAMENT_MODE_SWISS
          ? (live ? 'Für den Start werden mindestens vier eingecheckte Teilnehmer benötigt.' : 'Für den Start werden mindestens vier bestätigte Teilnehmer benötigt.')
          : `Für den Start werden genau ${Number(tournament.max_players || 0)} bestätigte Teilnehmer benötigt.`;
        return json({ok:false, code:'TOURNAMENT_START_REQUIREMENTS', message}, {status:409});
      }
      if (mode === TOURNAMENT_MODE_KNOCKOUT) {
        const participants = (await tournamentParticipantsFor(env, tournamentId)).filter(item => item.status === 'confirmed');
        await initializeTournamentKnockoutParticipants(env, tournament, participants);
      }
      if (mode === TOURNAMENT_MODE_GROUPS) {
        const participants = (await tournamentParticipantsFor(env, tournamentId)).filter(item => item.status === 'confirmed');
        await assignTournamentGroups(env, tournamentId, participants);
      }
      const totalRounds = tournamentTotalRounds(mode, startingPlayers);
      const now = new Date().toISOString();
      const changed = await env.DB.prepare(
        `UPDATE tournaments SET status = 'running', current_round = 1, total_rounds = ?, started_at = ?, updated_at = ?, next_round_at = NULL
          WHERE id = ? AND status IN ('open','full')`
      ).bind(totalRounds, now, now, tournamentId).run();
      if (d1Changes(changed) < 1) return json({ok:false, code:'TOURNAMENT_START_CONFLICT', message:'Das Turnier wurde bereits anderweitig gestartet.'}, {status:409});
      const running = await loadTournamentRow(env, tournamentId);
      await startTournamentRound(env, running, 1);
      const finalRow = await loadTournamentRow(env, tournamentId);
      return json({ok:true, tournament:await tournamentDto(env, finalRow, admin.session.user), message:`Das Turnier wurde mit ${startingPlayers} Teilnehmern gestartet. Die Partien der ersten Turnierrunde sind eröffnet.`});
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

  if (url.pathname === '/api/my-live-games' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    try {
      const games = await listMyRunningLiveGames(env, session.user);
      return json({ok:true, games, serverNow:Date.now()});
    } catch (error) {
      console.error('My live games list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'MY_LIVE_GAMES_UNAVAILABLE', message:'Deine laufenden Live-Partien konnten nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/schachlabor/fairplay-check' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({
      ok:false,
      allowed:false,
      fairplayBuild:SCHACHLABOR_FAIRPLAY_BUILD,
      code:'NOT_AUTHENTICATED',
      message:'Bitte zuerst einloggen.'
    }, {status:401});
    const body = await readJsonBody(request);
    const fen = String(body && body.fen || '').trim();
    if (!fen || fen.length > 200) return json({
      ok:false,
      allowed:false,
      fairplayBuild:SCHACHLABOR_FAIRPLAY_BUILD,
      code:'INVALID_POSITION',
      message:'Die zu prüfende Stellung ist ungültig.'
    }, {status:400});
    try {
      const allowed = await schachlaborPositionAllowed(env, session.user, fen);
      return json({ok:true, allowed:allowed === true, fairplayBuild:SCHACHLABOR_FAIRPLAY_BUILD});
    } catch (error) {
      console.error('Schachlabor fairplay check failed', error && error.message ? error.message : String(error || 'unknown'));
      const failureCode = error && error.schachlaborCode ? String(error.schachlaborCode) : 'FP-INTERN';
      return json({
        ok:false,
        allowed:false,
        fairplayBuild:SCHACHLABOR_FAIRPLAY_BUILD,
        code:'FAIRPLAY_CHECK_UNAVAILABLE',
        reason:failureCode,
        message:`Die Fairplay-Prüfung ist momentan nicht verfügbar (${failureCode}, Build ${SCHACHLABOR_FAIRPLAY_BUILD}).`
      }, {status:503});
    }
  }

  if (url.pathname === '/api/rematches' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    try {
      return json({ok:true, offers:await listOpenRematchOffers(env, session.user), serverNow:Date.now()});
    } catch (error) {
      console.error('Rematch list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'REMATCH_LIST_UNAVAILABLE', message:'Offene Revanchen konnten momentan nicht geladen werden.'}, {status:500});
    }
  }

  const rematchActionMatch = url.pathname.match(/^\/api\/rematches\/([^/]+)$/);
  if (rematchActionMatch && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    const offerId = cleanRematchOfferId(decodeURIComponent(rematchActionMatch[1]));
    const body = await readJsonBody(request);
    const action = String(body && body.action || '').toLowerCase();
    if (!offerId || !['accept','decline','withdraw'].includes(action)) {
      return json({ok:false, code:'REMATCH_ACTION_INVALID', message:'Die Revanche-Antwort konnte nicht gelesen werden.'}, {status:400});
    }
    try {
      await ensureRematchOffersTable(env);
      const offer = await env.DB.prepare(`SELECT * FROM rematch_offers WHERE offer_id = ? LIMIT 1`).bind(offerId).first();
      const userId = String(session.user.id || '');
      if (!offer || String(offer.status || '') !== 'pending') {
        return json({ok:false, code:'REMATCH_NOT_PENDING', message:'Diese Revanche-Anfrage ist nicht mehr offen.'}, {status:409});
      }
      const allowed = action === 'withdraw'
        ? String(offer.requester_user_id || '') === userId
        : String(offer.target_user_id || '') === userId;
      if (!allowed) return json({ok:false, code:'REMATCH_ACTION_NOT_ALLOWED', message:'Diese Revanche-Aktion ist für deinen Account nicht verfügbar.'}, {status:403});
      const roomId = cleanRoomId(offer.source_room_id);
      if (!roomId || !env.GAME_ROOM) return json({ok:false, code:'REMATCH_ROOM_UNAVAILABLE', message:'Der Ausgangsraum dieser Revanche ist nicht erreichbar.'}, {status:503});
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = gameRoomStub(env, id);
      const response = await stub.fetch(new Request('https://game-room.internal/rematch-response?room=' + encodeURIComponent(roomId), {
        method:'POST',
        headers:{'content-type':'application/json', 'x-hammerschach-user-id':userId},
        body:JSON.stringify({offerId, action, userId})
      }));
      let result = null;
      try { result = await response.json(); } catch (_) { result = null; }
      if (!response.ok || !result || !result.ok) {
        return json(result || {ok:false, code:'REMATCH_ACTION_FAILED', message:'Die Revanche konnte nicht verarbeitet werden.'}, {status:response.status || 500});
      }
      return json(result);
    } catch (error) {
      console.error('Rematch action failed', offerId, error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'REMATCH_ACTION_FAILED', message:'Die Revanche konnte momentan nicht verarbeitet werden.'}, {status:500});
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

  if (url.pathname === '/api/chess-chronicle' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Die Schachchronik ist nur nach Login verfügbar.'}, {status:401});
    try {
      const chronicle = await listChessChronicle(env, session.user, url);
      return json({ok:true, ...chronicle, serverNow:Date.now()});
    } catch (error) {
      console.error('Chess chronicle list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'CHESS_CHRONICLE_UNAVAILABLE', message:'Deine Schachchronik konnte nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/game-archive' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Das Partienarchiv ist nur nach Login verfügbar.'}, {status:401});
    try {
      const archive = await listGameArchive(env, session.user, url);
      return json({ok:true, ...archive, serverNow:Date.now()});
    } catch (error) {
      console.error('Game archive list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'GAME_ARCHIVE_UNAVAILABLE', message:'Das Partienarchiv konnte nicht geladen werden.'}, {status:500});
    }
  }

  const archivePgnMatch = url.pathname.match(/^\/api\/game-archive\/([^/]+)\/pgn$/);
  if (archivePgnMatch && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    const roomId = cleanRoomId(decodeURIComponent(archivePgnMatch[1]));
    if (!roomId) return json({ok:false, code:'INVALID_ROOM', message:'Ungültiger Spielraum.'}, {status:400});
    try {
      const game = await archiveGameForViewer(env, roomId, session.user);
      if (!game || !game.pgn) return json({ok:false, code:'GAME_NOT_FOUND', message:'Diese Partie ist nicht für dich im Archiv verfügbar.'}, {status:404});
      const datePart = pgnDateFromIso(game.ended_at || null).replace(/\./g, '-');
      const filename = safePgnFilePart('Hammerschach-' + datePart + '-' + (game.white_name || 'Weiss') + '-vs-' + (game.black_name || 'Schwarz')) + '.pgn';
      return new Response(String(game.pgn), {status:200, headers:{
        'content-type':'application/x-chess-pgn; charset=utf-8',
        'content-disposition':'attachment; filename="' + filename + '"',
        'cache-control':'private, no-store',
        'access-control-allow-origin':'*',
        'access-control-expose-headers':'content-disposition'
      }});
    } catch (_) {
      return json({ok:false, code:'PGN_UNAVAILABLE', message:'Die PGN-Datei konnte nicht geladen werden.'}, {status:500});
    }
  }

  const gameMomentMatch = url.pathname.match(/^\/api\/game-moments\/([^/]+)$/);
  if (gameMomentMatch && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Gamer-Momente sind nur nach Login verfügbar.'}, {status:401});
    const roomId = cleanRoomId(decodeURIComponent(gameMomentMatch[1]));
    const body = await readJsonBody(request);
    if (!roomId || !body || typeof body.marked !== 'boolean') {
      return json({ok:false, code:'GAME_MOMENT_BAD_REQUEST', message:'Der Gamer-Moment konnte nicht gelesen werden.'}, {status:400});
    }
    if (String(body.note || '').length > GAME_MOMENT_NOTE_MAX_LENGTH) {
      return json({ok:false, code:'GAME_MOMENT_NOTE_TOO_LONG', message:'Die persönliche Erinnerung darf höchstens 240 Zeichen lang sein.'}, {status:400});
    }
    try {
      const result = await saveGameMoment(env, roomId, session.user, body);
      if (!result.ok) return json(result, {status:result.status || 400});
      if (env.GAME_ROOM) {
        const id = env.GAME_ROOM.idFromName(roomId);
        const stub = env.GAME_ROOM.get(id);
        try {
          await stub.fetch(new Request('https://game-room.internal/moment-updated?room=' + encodeURIComponent(roomId), {method:'POST'}));
        } catch (error) {
          console.error('Game moment room broadcast deferred', roomId, error && error.message ? error.message : String(error || 'unknown'));
        }
      }
      return json(result);
    } catch (error) {
      console.error('Game moment update failed', roomId, error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'GAME_MOMENT_SAVE_FAILED', message:'Der Gamer-Moment konnte momentan nicht gespeichert werden.'}, {status:500});
    }
  }

  const archiveFavoriteMatch = url.pathname.match(/^\/api\/game-archive\/([^/]+)\/favorite$/);
  if (archiveFavoriteMatch && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    const roomId = cleanRoomId(decodeURIComponent(archiveFavoriteMatch[1]));
    const body = await readJsonBody(request);
    if (!roomId || !body) return json({ok:false, code:'BAD_REQUEST', message:'Die Archivmarkierung konnte nicht gelesen werden.'}, {status:400});
    const favorite = body.favorite === true;
    await ensureCompletedGamesTable(env);
    const existing = favorite ? await env.DB.prepare(
      `SELECT note FROM game_archive_favorites WHERE room_id = ? AND user_id = ? LIMIT 1`
    ).bind(roomId, session.user.id).first() : null;
    const result = await saveGameMoment(env, roomId, session.user, {marked:favorite, note:existing && existing.note || ''});
    if (!result.ok) return json(result, {status:result.status || 400});
    return json({ok:true, roomId, favorite:!!(result.moment && result.moment.marked), moment:result.moment});
  }

  const gameReactionMatch = url.pathname.match(/^\/api\/game-reactions\/([^/]+)$/);
  if (gameReactionMatch && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.'}, {status:401});
    const roomId = cleanRoomId(decodeURIComponent(gameReactionMatch[1]));
    const body = await readJsonBody(request);
    if (!roomId || !body || !Object.prototype.hasOwnProperty.call(body, 'reaction')) {
      return json({ok:false, code:'GAME_REACTION_BAD_REQUEST', message:'Die Reaktion konnte nicht gelesen werden.'}, {status:400});
    }
    const reactionInput = String(body.reaction || '').trim().toLowerCase();
    const reaction = cleanGameReaction(reactionInput);
    if (reactionInput && !reaction) {
      return json({ok:false, code:'GAME_REACTION_INVALID', message:'Bitte wähle eine der angebotenen Reaktionen.'}, {status:400});
    }
    try {
      await ensureCompletedGamesTable(env);
      await ensureGameReactionsTable(env);
      const game = await env.DB.prepare(
        `SELECT room_id, white_user_id, black_user_id
           FROM completed_games
          WHERE room_id = ?
          LIMIT 1`
      ).bind(roomId).first();
      const userId = String(session.user.id || '');
      const whiteUserId = String(game && game.white_user_id || '');
      const blackUserId = String(game && game.black_user_id || '');
      if (!game || (userId !== whiteUserId && userId !== blackUserId)) {
        return json({ok:false, code:'GAME_REACTION_GAME_NOT_FOUND', message:'Diese beendete Partie ist für deinen Account nicht verfügbar.'}, {status:404});
      }
      if (!whiteUserId || !blackUserId || whiteUserId === blackUserId) {
        return json({ok:false, code:'GAME_REACTION_MEMBERS_REQUIRED', message:'Reaktionen sind nur nach Partien zwischen zwei registrierten Mitgliedern verfügbar.'}, {status:409});
      }
      if (reaction) {
        const now = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO game_reactions (room_id, sender_user_id, reaction, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(room_id, sender_user_id) DO UPDATE SET
             reaction = excluded.reaction,
             updated_at = excluded.updated_at`
        ).bind(roomId, userId, reaction, now, now).run();
      } else {
        await env.DB.prepare(`DELETE FROM game_reactions WHERE room_id = ? AND sender_user_id = ?`).bind(roomId, userId).run();
      }
      const reactions = await loadGameReactionState(env, roomId, userId, whiteUserId, blackUserId);
      if (env.GAME_ROOM) {
        try {
          const id = env.GAME_ROOM.idFromName(roomId);
          const stub = gameRoomStub(env, id);
          await stub.fetch(new Request('https://game-room.internal/reaction-updated?room=' + encodeURIComponent(roomId), {method:'POST'}));
        } catch (error) {
          console.error('Game reaction room broadcast deferred', roomId, error && error.message ? error.message : String(error || 'unknown'));
        }
      }
      return json({ok:true, roomId, reaction, reactions});
    } catch (error) {
      console.error('Game reaction update failed', roomId, error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'GAME_REACTION_SAVE_FAILED', message:'Die Reaktion konnte momentan nicht gespeichert werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/admin/game-archive/maintenance' && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    try { return json({ok:true, maintenance:await runGameArchiveMaintenance(env)}); }
    catch (_) { return json({ok:false, code:'ARCHIVE_MAINTENANCE_FAILED', message:'Die Archivwartung konnte nicht ausgeführt werden.'}, {status:500}); }
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
      const stub = gameRoomStub(env, id);
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

  const dailyInvitationResponseMatch = url.pathname.match(/^\/api\/daily-games\/([^/]+)\/invitation$/);
  if (dailyInvitationResponseMatch && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' }, { status:401 });
    const roomId = cleanRoomId(decodeURIComponent(dailyInvitationResponseMatch[1]));
    if (!roomId) return json({ ok:false, code:'INVALID_ROOM', message:'Ungültiger Spielraum.' }, { status:400 });
    const body = await readJsonBody(request);
    const action = String(body && body.action || '').toLowerCase();
    if (action !== 'accept' && action !== 'decline') {
      return json({ ok:false, code:'INVALID_INVITATION_RESPONSE', message:'Bitte wähle Annehmen oder Ablehnen.' }, { status:400 });
    }
    const responseMessageResult = validateInvitationPersonalMessage(body && body.responseMessage, 'Die persönliche Antwort');
    if (!responseMessageResult.ok) {
      return json({ ok:false, code:responseMessageResult.code, message:responseMessageResult.message }, { status:responseMessageResult.status });
    }
    if (!env.GAME_ROOM) return json({ ok:false, code:'ROOM_SERVICE_UNAVAILABLE', message:'Der Spielraum-Dienst ist momentan nicht verfügbar.' }, { status:503 });
    try {
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = gameRoomStub(env, id);
      const response = await stub.fetch(new Request('https://game-room.internal/respond-daily-invitation?room=' + encodeURIComponent(roomId), {
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-hammerschach-user-id':String(session.user.id || '')
        },
        body:JSON.stringify({action, responseMessage:responseMessageResult.message})
      }));
      let result = null;
      try { result = await response.json(); } catch (_) { result = null; }
      if (!response.ok || !result || !result.ok) {
        return json({
          ok:false,
          code:result && result.code ? result.code : 'INVITATION_RESPONSE_FAILED',
          message:result && result.message ? result.message : 'Die Einladung konnte nicht beantwortet werden.'
        }, { status:response.status || 400 });
      }
      return json(result);
    } catch (error) {
      console.error(
        'Daily invitation API failed',
        roomId,
        action,
        error && error.stack ? error.stack : (error && error.message ? error.message : String(error || 'unknown'))
      );
      return json({ ok:false, code:'INVITATION_RESPONSE_FAILED', message:'Die Einladung konnte momentan nicht beantwortet werden.' }, { status:500 });
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
      const stub = gameRoomStub(env, id);
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
      const stub = gameRoomStub(env, id);
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
    try { await createWelcomeTickerItem(env, tokenRow.user_id); }
    catch (error) { console.error('Automatic welcome ticker failed', error && error.message ? error.message : String(error || 'unknown')); }
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

  const preparedInvitationCancelMatch = url.pathname.match(/^\/api\/invitations\/([^/]+)\/prepared$/);
  if (preparedInvitationCancelMatch && request.method === 'DELETE') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' }, { status:401 });
    const roomId = cleanRoomId(decodeURIComponent(preparedInvitationCancelMatch[1]));
    if (!roomId) return json({ ok:false, code:'INVALID_ROOM', message:'Der Spielraum ist ungültig.' }, { status:400 });
    if (!env.GAME_ROOM) return json({ ok:false, code:'ROOM_SERVICE_UNAVAILABLE', message:'Der Spielraum-Dienst ist momentan nicht verfügbar.' }, { status:503 });
    try {
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = gameRoomStub(env, id);
      const response = await stub.fetch(new Request('https://game-room.internal/cancel-prepared-invitation?room=' + encodeURIComponent(roomId), {
        method:'DELETE',
        headers:{'x-hammerschach-user-id':String(session.user.id || '')}
      }));
      let result = null;
      try { result = await response.json(); } catch (_) { result = null; }
      if (!response.ok || !result || !result.ok) {
        return json({
          ok:false,
          code:result && result.code ? result.code : 'INVITATION_CANCEL_FAILED',
          message:result && result.message ? result.message : 'Der vorbereitete Spielraum konnte nicht entfernt werden.'
        }, { status:response.status || 400 });
      }
      try { await env.DB.prepare(`DELETE FROM daily_games WHERE room_id = ?`).bind(roomId).run(); } catch (_) {}
      return json({ok:true, roomId, cancelledAt:result.cancelledAt || new Date().toISOString(), message:'Der vorbereitete Spielraum wurde entfernt.'});
    } catch (_) {
      return json({ok:false, code:'INVITATION_CANCEL_FAILED', message:'Der vorbereitete Spielraum konnte nicht entfernt werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/invitations/email' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok:false, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' }, { status:401 });
    const body = await readJsonBody(request);
    if (!body) return json({ ok:false, code:'BAD_JSON', message:'Die Einladung konnte nicht gelesen werden.' }, { status:400 });

    const personalMessageResult = validateInvitationPersonalMessage(body.personalMessage, 'Die persönliche Nachricht');
    if (!personalMessageResult.ok) {
      return json({ ok:false, code:personalMessageResult.code, message:personalMessageResult.message }, { status:personalMessageResult.status });
    }

    const roomId = cleanRoomId(body.roomId || body.room);
    const recipientUserId = cleanInvitationRecipientUserId(body.recipientUserId || body.memberId || body.userId);
    const expectedMode = body.expectedMode === 'daily' ? 'daily' : body.expectedMode === 'live' ? 'live' : '';
    if (!roomId) return json({ ok:false, code:'INVALID_ROOM', message:'Der Spielraum ist ungültig.' }, { status:400 });
    if (!recipientUserId) return json({ ok:false, code:'INVALID_RECIPIENT', message:'Bitte ein gültiges Mitglied auswählen.' }, { status:400 });
    if (String(recipientUserId) === String(session.user.id)) {
      return json({ ok:false, code:'CANNOT_INVITE_SELF', message:'Du kannst deinen eigenen Account nicht einladen.' }, { status:400 });
    }
    if (!env.GAME_ROOM) return json({ ok:false, code:'ROOM_SERVICE_UNAVAILABLE', message:'Der Spielraum-Dienst ist momentan nicht verfügbar.' }, { status:503 });

    let access = null;
    let roomStub = null;
    try {
      const id = env.GAME_ROOM.idFromName(roomId);
      roomStub = gameRoomStub(env, id);
      const accessResponse = await roomStub.fetch(new Request('https://game-room.internal/invitation-email-context?room=' + encodeURIComponent(roomId), {
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

    if (expectedMode && (!access.timeControl || access.timeControl.mode !== expectedMode)) {
      return json({
        ok:false,
        code:'INVITATION_ROOM_MODE_MISMATCH',
        message:'Die gewählte Bedenkzeit wurde im Spielraum noch nicht vollständig bestätigt. Bitte die Einladung erneut senden.'
      }, { status:409 });
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
      return json({ ok:false, code:'RECIPIENT_EMAIL_NOT_VERIFIED', message:'Die Anmeldung dieses Mitglieds ist noch nicht abgeschlossen.' }, { status:409 });
    }

    const rate = await checkInvitationEmailRateLimit(env, String(session.user.id), recipientUserId, roomId);
    if (!rate.ok) return json({ ok:false, code:rate.code, message:rate.message }, { status:rate.status || 429 });

    const isDailyInvitation = !!(access.timeControl && access.timeControl.mode === 'daily');
    let dailyRegistration = null;
    if (isDailyInvitation) {
      try {
        const registrationResponse = await roomStub.fetch(new Request('https://game-room.internal/register-daily-invitation?room=' + encodeURIComponent(roomId), {
          method:'POST',
          headers:{
            'content-type':'application/json',
            'x-hammerschach-user-id':String(session.user.id || '')
          },
          body:JSON.stringify({ recipientUserId, recipientName:recipient.username, personalMessage:personalMessageResult.message })
        }));
        try { dailyRegistration = await registrationResponse.json(); } catch (_) { dailyRegistration = null; }
        if (!registrationResponse.ok || !dailyRegistration || !dailyRegistration.ok) {
          return json({
            ok:false,
            code:dailyRegistration && dailyRegistration.code ? dailyRegistration.code : 'INVITATION_REGISTER_FAILED',
            message:dailyRegistration && dailyRegistration.message ? dailyRegistration.message : 'Die Daily-Einladung konnte nicht vorbereitet werden.'
          }, { status:registrationResponse.status || 400 });
        }
      } catch (_) {
        return json({ ok:false, code:'INVITATION_REGISTER_FAILED', message:'Die Daily-Einladung konnte nicht vorbereitet werden.' }, { status:503 });
      }
    }

    const inviteUrl = isDailyInvitation ? gamerDailyInvitationUrl(env, roomId) : gamerInvitationUrl(env, roomId);
    if (!inviteUrl) {
      if (dailyRegistration && (dailyRegistration.newlyRegistered || dailyRegistration.messageUpdated) && dailyRegistration.invitationId) {
        try {
          await roomStub.fetch(new Request('https://game-room.internal/rollback-daily-invitation?room=' + encodeURIComponent(roomId), {
            method:'POST',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({
              invitationId:dailyRegistration.invitationId,
              restoreMessage:!!dailyRegistration.messageUpdated,
              previousInvitationMessage:dailyRegistration.previousInvitationMessage || ''
            })
          }));
        } catch (_) {}
      }
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
      daily:isDailyInvitation,
      personalMessage:personalMessageResult.message
    });
    if (!mail.ok) {
      if (isDailyInvitation && dailyRegistration && dailyRegistration.invitationId) {
        return json({
          ok:true,
          emailSent:false,
          invitationStored:true,
          recipient:{ id:recipient.id, username:recipient.username },
          message:'Einladung an ' + (cleanDisplayName(recipient.username) || 'das Mitglied') + ' wurde in „Meine Partien“ zugestellt. Die zusätzliche E-Mail konnte nicht versendet werden.',
          mailWarning:mail.message || 'Die zusätzliche E-Mail konnte nicht versendet werden.'
        });
      }
      return json({ ok:false, code:mail.code, message:mail.message }, { status:mail.status || 502 });
    }

    try { await recordInvitationEmail(env, String(session.user.id), recipientUserId, roomId, mail.messageId); } catch (_) {}
    return json({
      ok:true,
      emailSent:true,
      invitationStored:isDailyInvitation,
      recipient:{ id:recipient.id, username:recipient.username },
      message:'Einladung an ' + (cleanDisplayName(recipient.username) || 'das Mitglied') + ' wurde versendet.'
    });
  }

  if (url.pathname === '/api/private-messages' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Persönliche Nachrichten sind nur nach Login verfügbar.'}, {status:401});
    try {
      const summaryOnly = ['1','true','yes'].includes(String(url.searchParams.get('summary') || '').toLowerCase());
      if (summaryOnly) return json({ok:true, unreadCount:await privateMessageUnreadCount(env, session.user.id), serverNow:Date.now()});
      const inbox = await listPrivateMessages(env, session.user.id, url.searchParams.get('limit') || 100);
      return json({ok:true, ...inbox, serverNow:Date.now()});
    } catch (error) {
      console.error('Private messages list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'PRIVATE_MESSAGES_UNAVAILABLE', message:'Persönliche Nachrichten konnten nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/private-messages' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Persönliche Nachrichten sind nur nach Login verfügbar.'}, {status:401});
    const moderation = await moderationStateForUser(env, session.user.id);
    if (moderation.chatBlocked) return json({ok:false, code:'MESSAGING_BLOCKED', message:'Deine Nachrichtenfunktion ist derzeit gesperrt.'}, {status:403});
    const body = await readJsonBody(request);
    if (!body) return json({ok:false, code:'BAD_JSON', message:'Die Nachricht konnte nicht gelesen werden.'}, {status:400});
    try {
      const sent = await sendPrivateMessage(env, session.user, body.recipientUserIds || body.recipientUserId, body.text);
      return json(sent, {status:sent.status || 200});
    } catch (error) {
      console.error('Private message send failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'PRIVATE_MESSAGE_SEND_FAILED', message:'Die Nachricht konnte nicht gesendet werden.'}, {status:500});
    }
  }

  const privateConversationMatch = url.pathname.match(/^\/api\/private-messages\/conversation\/([^/]+)$/);
  if (privateConversationMatch && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Persönliche Nachrichten sind nur nach Login verfügbar.'}, {status:401});
    const otherUserId = cleanPublicProfileUserId(decodeURIComponent(privateConversationMatch[1]));
    if (!otherUserId || otherUserId === String(session.user.id)) return json({ok:false, code:'INVALID_PRIVATE_CONVERSATION', message:'Der Nachrichtenverlauf konnte nicht zugeordnet werden.'}, {status:400});
    try {
      const conversation = await privateMessageConversation(env, session.user.id, otherUserId, url.searchParams.get('limit') || 200);
      return json({ok:true, ...conversation, otherUserId, serverNow:Date.now()});
    } catch (error) {
      console.error('Private conversation load failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'PRIVATE_CONVERSATION_UNAVAILABLE', message:'Der Nachrichtenverlauf konnte nicht geladen werden.'}, {status:500});
    }
  }

  const privateConversationReadMatch = url.pathname.match(/^\/api\/private-messages\/conversation\/([^/]+)\/read$/);
  if (privateConversationReadMatch && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Persönliche Nachrichten sind nur nach Login verfügbar.'}, {status:401});
    try {
      const result = await markPrivateConversationRead(env, session.user.id, decodeURIComponent(privateConversationReadMatch[1]));
      return json(result, {status:result.status || 200});
    } catch (error) {
      console.error('Private conversation mark read failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'PRIVATE_CONVERSATION_READ_FAILED', message:'Der Nachrichtenverlauf konnte nicht als gelesen markiert werden.'}, {status:500});
    }
  }

  const privateMessageReadMatch = url.pathname.match(/^\/api\/private-messages\/([^/]+)\/read$/);
  if (privateMessageReadMatch && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Persönliche Nachrichten sind nur nach Login verfügbar.'}, {status:401});
    try {
      const result = await markPrivateMessageRead(env, session.user.id, decodeURIComponent(privateMessageReadMatch[1]));
      return json(result, {status:result.status || 200});
    } catch (error) {
      console.error('Private message mark read failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'PRIVATE_MESSAGE_READ_FAILED', message:'Die Nachricht konnte nicht als gelesen markiert werden.'}, {status:500});
    }
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

  const memberFavoriteMatch = url.pathname.match(/^\/api\/members\/([^/]+)\/favorite$/);
  if (memberFavoriteMatch && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Lieblingsmitglieder sind nur nach Login verfügbar.'}, {status:401});
    const targetId = cleanPublicProfileUserId(decodeURIComponent(memberFavoriteMatch[1]));
    const body = await readJsonBody(request);
    if (!targetId || !body || typeof body.favorite !== 'boolean') {
      return json({ok:false, code:'BAD_REQUEST', message:'Die Favoritenmarkierung konnte nicht gelesen werden.'}, {status:400});
    }
    try {
      const result = await setMemberFavorite(env, session.user.id, targetId, body.favorite);
      if (!result.ok) return json(result, {status:result.status || 400});
      return json(result);
    } catch (error) {
      console.error('Member favorite update failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'MEMBER_FAVORITE_FAILED', message:'Das Lieblingsmitglied konnte nicht gespeichert werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/members/search' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Mitgliedersuche ist nur nach Login verfügbar.' }, { status: 401 });

    const query = cleanMemberSearchQuery(url.searchParams.get('q') || url.searchParams.get('query') || '');
    const activity = normalizeMemberActivityFilter(url.searchParams.get('activity'));
    const sort = normalizeMemberSort(url.searchParams.get('sort'));
    const favoritesOnly = normalizeMemberFavoritesOnly(url.searchParams.get('favorites'));
    const users = await searchMembers(env, session.user, query, {activity, sort, favoritesOnly});
    return json({ ok:true, query, users, activity, sort, favoritesOnly, serverNow:Date.now(), isAdmin:isAdminUser(session.user, env) });
  }

  if (url.pathname === '/api/members/list' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Mitgliederliste ist nur nach Login verfügbar.' }, { status: 401 });

    const limit = url.searchParams.get('limit') || 50;
    const activity = normalizeMemberActivityFilter(url.searchParams.get('activity'));
    const sort = normalizeMemberSort(url.searchParams.get('sort'));
    const favoritesOnly = normalizeMemberFavoritesOnly(url.searchParams.get('favorites'));
    const users = await listMembers(env, session.user, limit, {activity, sort, favoritesOnly});
    return json({ ok:true, users, activity, sort, favoritesOnly, serverNow:Date.now(), isAdmin:isAdminUser(session.user, env) });
  }

  if (url.pathname === '/api/lobby-ticker' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Der Lobby-Ticker ist nur für Mitglieder sichtbar.'}, {status:401});
    try {
      return json({ok:true, items:await listLobbyTickerItems(env), serverNow:Date.now()});
    } catch (error) {
      console.error('Lobby ticker list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'LOBBY_TICKER_UNAVAILABLE', message:'Der Veranstaltungsticker konnte nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/info-center' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Das Info-Center ist nur für Mitglieder sichtbar.'}, {status:401});
    try {
      return json({ok:true, ...(await listInfoCenterItems(env, session.user.id)), serverNow:Date.now()});
    } catch (error) {
      console.error('Info center list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'INFO_CENTER_UNAVAILABLE', message:'Das Info-Center konnte nicht geladen werden.'}, {status:500});
    }
  }

  const infoCenterAttachmentMatch = url.pathname.match(/^\/api\/info-center\/attachments\/([^/]+)$/);
  if (infoCenterAttachmentMatch && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Dateien aus dem Info-Center sind nur nach Login verfügbar.'}, {status:401});
    return await infoCenterAttachmentResponse(request, env, session.user, decodeURIComponent(infoCenterAttachmentMatch[1]));
  }

  const infoCenterItemMatch = url.pathname.match(/^\/api\/info-center\/([^/]+)$/);
  if (infoCenterItemMatch && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Das Info-Center ist nur für Mitglieder sichtbar.'}, {status:401});
    try {
      const item = await loadInfoCenterItem(env, session.user, decodeURIComponent(infoCenterItemMatch[1]), {markRead:true});
      if (!item) return json({ok:false, code:'INFO_ITEM_NOT_FOUND', message:'Die Mitteilung wurde nicht gefunden.'}, {status:404});
      return json({ok:true, item});
    } catch (error) {
      console.error('Info center item failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'INFO_ITEM_UNAVAILABLE', message:'Die Mitteilung konnte nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/admin/users' && request.method === 'GET') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const users = await listMembers(env, admin.session.user, 100);
    return json({ ok:true, users });
  }

  if (url.pathname === '/api/admin/fairplay/games' && request.method === 'GET') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    try {
      const games = await listAdminFairplayGames(env);
      return json(
        {ok:true, games, archivedCount:games.length},
        {headers:{'cache-control':'no-store, max-age=0', 'x-content-type-options':'nosniff'}}
      );
    } catch (error) {
      console.error('Admin fairplay game list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json(
        {ok:false, code:'FAIRPLAY_LIST_FAILED', message:'Die Fairplay-Partien konnten nicht geladen werden.'},
        {status:500, headers:{'cache-control':'no-store, max-age=0'}}
      );
    }
  }

  const adminFairplayGameMatch = url.pathname.match(/^\/api\/admin\/fairplay\/games\/([^/]+)$/);
  if (adminFairplayGameMatch && request.method === 'GET') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const roomId = cleanRoomId(decodeURIComponent(adminFairplayGameMatch[1]));
    if (!roomId) {
      return json(
        {ok:false, code:'INVALID_ROOM', message:'Die Partiekennung ist ungültig.'},
        {status:400, headers:{'cache-control':'no-store, max-age=0'}}
      );
    }
    try {
      const game = await getAdminFairplayGame(env, roomId);
      if (!game) {
        return json(
          {ok:false, code:'FAIRPLAY_GAME_NOT_FOUND', message:'Für diese Partie sind keine Fairplay-Rohdaten archiviert.'},
          {status:404, headers:{'cache-control':'no-store, max-age=0'}}
        );
      }
      return json(
        {ok:true, game},
        {headers:{'cache-control':'no-store, max-age=0', 'x-content-type-options':'nosniff'}}
      );
    } catch (error) {
      console.error('Admin fairplay game detail failed', error && error.message ? error.message : String(error || 'unknown'));
      return json(
        {ok:false, code:'FAIRPLAY_GAME_FAILED', message:'Die Fairplay-Rohdaten konnten nicht geladen werden.'},
        {status:500, headers:{'cache-control':'no-store, max-age=0'}}
      );
    }
  }

  if (url.pathname === '/api/admin/lobby-ticker' && request.method === 'GET') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    try { return json({ok:true, ...(await listAdminLobbyTicker(env))}); }
    catch (error) {
      console.error('Admin lobby ticker list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'ADMIN_TICKER_UNAVAILABLE', message:'Die Ticker-Verwaltung konnte nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/admin/info-center' && request.method === 'GET') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    try { return json({ok:true, items:await listAdminInfoCenterItems(env)}); }
    catch (error) {
      console.error('Admin info center list failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'ADMIN_INFO_CENTER_UNAVAILABLE', message:'Die Info-Center-Verwaltung konnte nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/admin/info-center' && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const body = await readJsonBody(request);
    if (!body) return json({ok:false, code:'BAD_JSON', message:'Die Info-Center-Daten konnten nicht gelesen werden.'}, {status:400});
    try {
      const result = await saveAdminInfoCenterItem(env, admin.session.user, body);
      if (!result.ok) return json(result, {status:result.status || 400});
      const mailWarning = result.mailResult && !result.mailResult.ok ? result.mailResult.message : '';
      return json({...result, message:mailWarning ? 'Die Mitteilung wurde gespeichert. Der optionale Mailversand ist fehlgeschlagen: ' + mailWarning : 'Die Info-Center-Mitteilung wurde gespeichert.'});
    } catch (error) {
      console.error('Admin info center save failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'ADMIN_INFO_CENTER_SAVE_FAILED', message:'Die Info-Center-Mitteilung konnte nicht gespeichert werden.'}, {status:500});
    }
  }

  const adminInfoCenterDeleteMatch = url.pathname.match(/^\/api\/admin\/info-center\/([^/]+)$/);
  if (adminInfoCenterDeleteMatch && request.method === 'DELETE') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    try {
      const result = await deleteAdminInfoCenterItem(env, decodeURIComponent(adminInfoCenterDeleteMatch[1]));
      return json(result, {status:result.status || (result.ok ? 200 : 400)});
    } catch (error) {
      console.error('Admin info center delete failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'ADMIN_INFO_CENTER_DELETE_FAILED', message:'Die Mitteilung konnte nicht gelöscht werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/admin/lobby-ticker' && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const body = await readJsonBody(request);
    if (!body) return json({ok:false, code:'BAD_JSON', message:'Die Ticker-Daten konnten nicht gelesen werden.'}, {status:400});
    try {
      const result = body.action === 'save_settings'
        ? await saveLobbyWelcomeSettings(env, admin.session.user, body)
        : await saveAdminLobbyTickerItem(env, admin.session.user, body);
      if (!result.ok) return json(result, {status:result.status || 400});
      return json({...result, message:body.action === 'save_settings' ? 'Die automatische Mitgliederbegrüßung wurde gespeichert.' : 'Die Ticker-Meldung wurde gespeichert.'});
    } catch (error) {
      console.error('Admin lobby ticker save failed', error && error.message ? error.message : String(error || 'unknown'));
      return json({ok:false, code:'ADMIN_TICKER_SAVE_FAILED', message:'Die Ticker-Einstellungen konnten nicht gespeichert werden.'}, {status:500});
    }
  }

  const adminTickerStatusMatch = url.pathname.match(/^\/api\/admin\/lobby-ticker\/([^/]+)\/status$/);
  if (adminTickerStatusMatch && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    await ensureLobbyTickerTables(env);
    const body = await readJsonBody(request);
    const id = String(decodeURIComponent(adminTickerStatusMatch[1]) || '').trim();
    const changed = await env.DB.prepare(`UPDATE lobby_ticker_items SET active = ?, updated_at = ? WHERE id = ?`)
      .bind(body && body.active === false ? 0 : 1, new Date().toISOString(), id).run();
    if (d1Changes(changed) < 1) return json({ok:false, code:'TICKER_NOT_FOUND', message:'Die Ticker-Meldung wurde nicht gefunden.'}, {status:404});
    return json({ok:true, message:body && body.active === false ? 'Ticker-Meldung wurde ausgeblendet.' : 'Ticker-Meldung wurde wieder aktiviert.'});
  }

  const adminTickerDeleteMatch = url.pathname.match(/^\/api\/admin\/lobby-ticker\/([^/]+)$/);
  if (adminTickerDeleteMatch && request.method === 'DELETE') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    await ensureLobbyTickerTables(env);
    const id = String(decodeURIComponent(adminTickerDeleteMatch[1]) || '').trim();
    const changed = await env.DB.prepare(`DELETE FROM lobby_ticker_items WHERE id = ?`).bind(id).run();
    if (d1Changes(changed) < 1) return json({ok:false, code:'TICKER_NOT_FOUND', message:'Die Ticker-Meldung wurde nicht gefunden.'}, {status:404});
    return json({ok:true, message:'Ticker-Meldung wurde gelöscht.'});
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
  delete out._fairplay;
  return out;
}

function conditionalStoredMove(value) {
  if (!value || typeof value !== 'object' || !value.from || !value.to) return null;
  return {
    from:[Number(value.from[0]), Number(value.from[1])],
    to:[Number(value.to[0]), Number(value.to[1])],
    promotion:value.promotion || null,
    castle:castleSideCode(value) || null,
    san:String(value.san || '').slice(0, 40)
  };
}

const CONDITIONAL_MOVE_MAX_PLIES = 10;

function conditionalStoredLine(value) {
  if (!value || typeof value !== 'object') return null;
  const rawLine = Array.isArray(value.line || value.moves || value.sequence)
    ? (value.line || value.moves || value.sequence)
    : [value.expectedMove || value.expected_move || value.expected, value.replyMove || value.reply_move || value.reply];
  if (rawLine.length < 2 || rawLine.length > CONDITIONAL_MOVE_MAX_PLIES || rawLine.length % 2 !== 0) return null;
  const line = rawLine.map(conditionalStoredMove);
  return line.some(move => !move) ? null : line;
}

function safeConditionalMoveForClient(value) {
  if (!value || typeof value !== 'object') return null;
  const line = conditionalStoredLine(value);
  const basePly = Math.max(0, Math.floor(Number(value.basePly ?? value.base_ply ?? 0) || 0));
  if (!line) return null;
  return {
    basePly,
    line,
    expectedMove:line[0],
    replyMove:line[1],
    updatedAt:value.updatedAt || value.updated_at || null
  };
}

function sameConditionalMove(left, right) {
  const a = conditionalStoredMove(left);
  const b = conditionalStoredMove(right);
  if (!a || !b) return false;
  return a.from[0] === b.from[0] && a.from[1] === b.from[1] &&
    a.to[0] === b.to[0] && a.to[1] === b.to[1] &&
    String(a.promotion || '') === String(b.promotion || '') &&
    String(a.castle || '') === String(b.castle || '');
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

function safeDrawClaimsForClient(value) {
  const claims = value && typeof value === 'object' ? value : {};
  const claimantRole = claims.claimantRole === 'w' || claims.claimantRole === 'b' ? claims.claimantRole : '';
  return {
    threefold:!!claims.threefold,
    fiftyMove:!!claims.fiftyMove,
    claimantRole,
    repetitionCount:Math.max(0, Math.floor(Number(claims.repetitionCount || 0))),
    halfmove:Math.max(0, Math.floor(Number(claims.halfmove || 0)))
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
  if (mode === 'daily' && ![86400, 172800, 259200, 604800].includes(baseSeconds)) return null;

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

function makeInitialClock(timeControl, now = Date.now(), startingTurn = 'w') {
  const baseMs = Math.max(0, Math.floor(Number(timeControl.baseSeconds || 0) * 1000));
  return {
    wMs: baseMs,
    bMs: baseMs,
    turn: startingTurn === 'b' ? 'b' : 'w',
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
const themeValidationCache = new Map();
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

function cleanThemeDefinition(value) {
  if (!value || typeof value !== 'object') return null;
  let cacheKey = '';
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 20000) cacheKey = serialized;
  } catch (_) {}
  if (cacheKey && themeValidationCache.has(cacheKey)) {
    return JSON.parse(JSON.stringify(themeValidationCache.get(cacheKey)));
  }
  const name = String(value.name || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  const sourceMoves = Array.isArray(value.moves) ? value.moves.slice(0, 40) : [];
  if (!name || !sourceMoves.length) return null;

  const game = new ChessGame({variant:GAME_VARIANT_STANDARD});
  const moves = [];
  for (const source of sourceMoves) {
    const cleaned = cleanMove(source);
    if (!cleaned) return null;
    const found = findMatchingLegalMove(game.legalMoves(), cleaned);
    if (!found) return null;
    const before = game.clone();
    const mv = {from:found.from, to:found.to, meta:found.meta || {}, promotion:cleaned.promotion || null};
    const movingPiece = before.at(found.from[0], found.from[1]);
    const needsPromotion = movingPiece && movingPiece.toLowerCase() === 'p' && (found.to[1] === 0 || found.to[1] === 7);
    if (needsPromotion !== !!cleaned.promotion) return null;
    game.makeMove(mv, false);
    moves.push({
      from:mv.from.slice(),
      to:mv.to.slice(),
      promotion:mv.promotion || null,
      castle:castleSideCode(mv) || null,
      san:serverMoveToSan(before, mv, game)
    });
  }
  if (game.gameOver()) return null;

  let moveText = String(value.moveText || value.move_text || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!moveText) {
    const parts = [];
    for (let index = 0; index < moves.length; index += 2) {
      parts.push(String(Math.floor(index / 2) + 1) + '.');
      if (moves[index]) parts.push(moves[index].san);
      if (moves[index + 1]) parts.push(moves[index + 1].san);
    }
    moveText = parts.join(' ');
  }
  const cleanedTheme = {
    id:String(value.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48),
    name,
    eco:String(value.eco || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 12),
    moveText,
    idea:String(value.idea || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
    startPly:moves.length,
    sideToMove:game.turn,
    moves
  };
  if (cacheKey) {
    if (themeValidationCache.size >= 256) themeValidationCache.delete(themeValidationCache.keys().next().value);
    themeValidationCache.set(cacheKey, cleanedTheme);
    const normalizedKey = JSON.stringify(cleanedTheme);
    if (normalizedKey.length <= 20000) themeValidationCache.set(normalizedKey, cleanedTheme);
  }
  return JSON.parse(JSON.stringify(cleanedTheme));
}

function cleanGameSetup(setup) {
  setup = setup || {};
  const variant = String(setup.variant || setup.mode || '').toLowerCase() === GAME_VARIANT_FREESTYLE ? GAME_VARIANT_FREESTYLE : GAME_VARIANT_STANDARD;
  if (variant !== GAME_VARIANT_FREESTYLE) {
    return {
      variant: GAME_VARIANT_STANDARD,
      positionId: null,
      backRank: STANDARD_BACK_RANK,
      theme:cleanThemeDefinition(setup.theme || setup.openingTheme || setup.opening_theme)
    };
  }
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
  return { variant: GAME_VARIANT_FREESTYLE, positionId, backRank, theme:null };
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
  const normalizedSetup = cleanGameSetup(setup);
  // Die Eröffnungszugfolge gehört zum Raum-Setup, nicht in jede interne
  // Brettkopie. Sonst würde die Serverprüfung sie bei jedem legalen Zug erneut
  // validieren.
  this.setup = {
    variant:normalizedSetup.variant,
    positionId:normalizedSetup.positionId,
    backRank:normalizedSetup.backRank,
    theme:null
  };
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

ChessGame.prototype.repetitionEpKey = function() {
  if (!this.ep) return '-';
  const x = this.ep[0];
  const y = this.ep[1];
  const side = this.turn;
  const pawnY = side === 'w' ? y + 1 : y - 1;
  const pawn = side === 'w' ? 'P' : 'p';
  const capturedPawn = side === 'w' ? 'p' : 'P';
  if (!this.inBounds(x, pawnY) || this.at(x, pawnY) !== capturedPawn) return '-';
  for (const dx of [-1, 1]) {
    const px = x + dx;
    if (!this.inBounds(px, pawnY) || this.at(px, pawnY) !== pawn) continue;
    const sim = this.clone();
    sim.makeMove({from:[px,pawnY], to:[x,y], meta:{enpassant:true}}, true);
    const kp = sim.findKing(side);
    if (kp && !sim.isAttacked(kp[0], kp[1], opposite(side))) return coordToAlg(x, y);
  }
  return '-';
};

ChessGame.prototype.repetitionKey = function() {
  const boardPart = this.board.map(row => row.join('')).join('/');
  const castlingPart = ['K','Q','k','q'].filter(key => this.castling[key]).join('') || '-';
  return [boardPart, this.turn, castlingPart, this.repetitionEpKey()].join(' ');
};

ChessGame.prototype.hasInsufficientMaterial = function() {
  const pieces = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = this.at(x, y);
      if (!p || p === '.') continue;
      const kind = p.toLowerCase();
      if (kind === 'p' || kind === 'r' || kind === 'q') return false;
      if (kind !== 'k') pieces.push({kind, squareColor:(x + y) % 2});
    }
  }
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && (pieces[0].kind === 'b' || pieces[0].kind === 'n')) return true;
  if (pieces.every(piece => piece.kind === 'b')) {
    const firstColor = pieces[0].squareColor;
    if (pieces.every(piece => piece.squareColor === firstColor)) return true;
  }
  return false;
};

ChessGame.prototype.canSidePossiblyMate = function(color) {
  const own = [];
  let opponentHasNonKingPiece = false;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = this.at(x, y);
      if (!p || p === '.') continue;
      const pieceSide = pieceColor(p);
      const kind = p.toLowerCase();
      if (kind === 'k') continue;
      if (pieceSide === color) own.push({kind, squareColor:(x + y) % 2});
      else opponentHasNonKingPiece = true;
    }
  }
  if (own.some(piece => piece.kind === 'p' || piece.kind === 'r' || piece.kind === 'q')) return true;
  if (!own.length) return false;
  if (opponentHasNonKingPiece) return true;
  const knights = own.filter(piece => piece.kind === 'n').length;
  const bishops = own.filter(piece => piece.kind === 'b');
  if (knights >= 2) return true;
  if (knights >= 1 && bishops.length >= 1) return true;
  if (new Set(bishops.map(piece => piece.squareColor)).size >= 2) return true;
  return false;
};

ChessGame.prototype.gameOver = function(repetitionCount, options = {}) {
  const legal = this.legalMoves();
  if (legal.length === 0) {
    if (this.inCheck(this.turn)) return { type:'checkmate', winner: opposite(this.turn) };
    return { type:'stalemate' };
  }
  if (this.hasInsufficientMaterial()) return { type:'insufficient_material' };
  const repetitions = Math.max(0, Number(repetitionCount) || 0);
  if (repetitions >= 5) return { type:'fivefold_repetition' };
  if (this.halfmove >= 150) return { type:'seventy_five_move_rule' };
  if (options.autoClaimable === true && this.halfmove >= 100) return { type:'fifty_move_rule' };
  if (options.autoClaimable === true && repetitions >= 3) return { type:'threefold_repetition' };
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
  if (exact.length) {
    return exact.find(move => !castleSideCode(move)) || exact[0];
  }

  // Chess960-Komforteingabe: Ist das spätere Königsfeld kein legaler
  // normaler Zug, darf es ebenfalls eindeutig die Rochade auswählen.
  const castleByKingTarget = legalMoves.filter(move => {
    if (!sameFrom(move) || !castleSideCode(move)) return false;
    const meta = move.meta || {};
    return Number.isInteger(meta.kingTo) && meta.kingTo === to[0] && move.to[1] === to[1];
  });
  return castleByKingTarget.length === 1 ? castleByKingTarget[0] : null;
}

function buildServerHistoryState(moves, gameSetup = null) {
  const setup = cleanGameSetup(gameSetup);
  const g = new ChessGame(setup);
  const positionCounts = new Map();
  const addPosition = () => {
    const key = g.repetitionKey();
    positionCounts.set(key, (positionCounts.get(key) || 0) + 1);
  };
  const themeMoves = setup.theme && Array.isArray(setup.theme.moves) ? setup.theme.moves : [];
  if (themeMoves.length) {
    for (const stored of themeMoves) {
      const legal = g.legalMoves();
      const found = findMatchingLegalMove(legal, stored);
      if (!found) throw new Error('Gespeicherte Themenzugfolge enthält einen illegalen Zug.');
      const mv = { from:found.from, to:found.to, meta:found.meta || {}, promotion:stored.promotion || null };
      g.makeMove(mv, true);
    }
    addPosition();
  } else {
    addPosition();
  }
  for (const stored of (moves || [])) {
    const legal = g.legalMoves();
    const found = findMatchingLegalMove(legal, stored);
    if (!found) throw new Error('Gespeicherte Zugliste enthält einen illegalen Zug.');
    const mv = { from:found.from, to:found.to, meta:found.meta || {}, promotion:stored.promotion || null };
    g.makeMove(mv, true);
    addPosition();
  }
  return {
    game:g,
    positionCounts,
    repetitionCount:positionCounts.get(g.repetitionKey()) || 1
  };
}

function buildGameFromStoredMoves(moves, gameSetup = null) {
  return buildServerHistoryState(moves, gameSetup).game;
}

function drawClaimsFromHistoryState(historyState, timeControl = null, game = null) {
  const control = cleanTimeControl(timeControl || null);
  const currentGame = historyState && historyState.game;
  if (!currentGame || !control || control.mode !== 'daily' || (game && game.ended)) {
    return safeDrawClaimsForClient(null);
  }
  return safeDrawClaimsForClient({
    threefold:Math.max(0, Number(historyState.repetitionCount) || 0) >= 3,
    fiftyMove:Math.max(0, Number(currentGame.halfmove) || 0) >= 100,
    claimantRole:currentGame.turn,
    repetitionCount:historyState.repetitionCount,
    halfmove:currentGame.halfmove
  });
}

function drawClaimsForStoredPosition(moves, gameSetup, timeControl, game = null) {
  try {
    return drawClaimsFromHistoryState(buildServerHistoryState(moves || [], gameSetup), timeControl, game);
  } catch (_) {
    return safeDrawClaimsForClient(null);
  }
}

function gameTurnForSetup(gameSetup) {
  return buildGameFromStoredMoves([], gameSetup).turn;
}

function validateMoveOnServer(storedMoves, incoming, gameSetup = null, preparedBefore = null, preparedPositionCounts = null, options = {}) {
  let before;
  let positionCounts;
  if (preparedBefore && preparedPositionCounts instanceof Map) {
    before = preparedBefore.clone();
    positionCounts = new Map(preparedPositionCounts);
  } else {
    const historyState = buildServerHistoryState(storedMoves || [], gameSetup);
    before = preparedBefore ? preparedBefore.clone() : historyState.game;
    positionCounts = new Map(historyState.positionCounts);
  }
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

  const mv = { from:found.from, to:found.to, meta:found.meta || {}, promotion:needsPromotion ? incoming.promotion : null };
  const after = before.clone();
  const applied = after.makeMove(mv, false);
  mv.piece = applied.piece;
  mv.taken = applied.taken;
  mv.san = serverMoveToSan(before, mv, after);
  const afterKey = after.repetitionKey();
  positionCounts.set(afterKey, (positionCounts.get(afterKey) || 0) + 1);
  const repetitionCount = positionCounts.get(afterKey) || 1;

  return {
    ok:true,
    before,
    after,
    move:mv,
    positionCounts,
    repetitionCount,
    gameOver:after.gameOver(repetitionCount, {autoClaimable:options.autoClaimable === true})
  };
}

function resultFromGameOver(gameOver) {
  if (!gameOver) return '*';
  if (gameOver.type === 'checkmate') return gameOver.winner === 'w' ? '1-0' : '0-1';
  if (['stalemate', 'insufficient_material', 'fifty_move_rule', 'threefold_repetition', 'fivefold_repetition', 'seventy_five_move_rule'].includes(gameOver.type)) return '1/2-1/2';
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

function parseSchachlaborFenForSetup(value, setup) {
  const parts = String(value || '').trim().split(/\s+/);
  if (parts.length < 4) return null;
  const ranks = String(parts[0] || '').split('/');
  if (ranks.length !== 8 || (parts[1] !== 'w' && parts[1] !== 'b')) return null;
  const board = [];
  for (const rank of ranks) {
    const row = [];
    for (const token of rank) {
      if (/^[1-8]$/.test(token)) row.push(...Array(Number(token)).fill('.'));
      else if (/^[prnbqkPRNBQK]$/.test(token)) row.push(token);
      else return null;
    }
    if (row.length !== 8) return null;
    board.push(row);
  }
  const game = new ChessGame(setup);
  game.board = board;
  game.turn = parts[1];
  game.castling = {K:false,Q:false,k:false,q:false};
  const rights = parts[2] === '-' ? '' : String(parts[2] || '');
  for (const token of rights) {
    if ('KQkq'.includes(token)) {
      game.castling[token] = true;
      continue;
    }
    const lower = token.toLowerCase();
    if (!/^[a-h]$/.test(lower)) return null;
    const file = files.indexOf(lower);
    if (token === token.toUpperCase()) {
      if (file === game.castleInfo.w.kingside.rookFile) game.castling.K = true;
      else if (file === game.castleInfo.w.queenside.rookFile) game.castling.Q = true;
      else return null;
    } else {
      if (file === game.castleInfo.b.kingside.rookFile) game.castling.k = true;
      else if (file === game.castleInfo.b.queenside.rookFile) game.castling.q = true;
      else return null;
    }
  }
  if (parts[3] === '-') game.ep = null;
  else {
    const match = /^([a-h])([36])$/.exec(String(parts[3] || ''));
    if (!match) return null;
    game.ep = [files.indexOf(match[1]), 8 - Number(match[2])];
  }
  game.halfmove = Math.max(0, Number(parts[4] || 0) || 0);
  game.fullmove = Math.max(1, Number(parts[5] || 1) || 1);
  return game;
}

function normalizedSchachlaborCastling(game) {
  const result = [];
  const info = game && game.castleInfo;
  if (!game || !info) return '-';
  const possible = (key, color, side) => {
    if (!game.castling || !game.castling[key]) return false;
    const rank = color === 'w' ? 7 : 0;
    const king = color === 'w' ? 'K' : 'k';
    const rook = color === 'w' ? 'R' : 'r';
    return game.at(info[color].kingFile, rank) === king && game.at(info[color][side].rookFile, rank) === rook;
  };
  if (possible('K','w','kingside')) result.push('K');
  if (possible('Q','w','queenside')) result.push('Q');
  if (possible('k','b','kingside')) result.push('k');
  if (possible('q','b','queenside')) result.push('q');
  return result.join('') || '-';
}

function schachlaborPositionKey(game) {
  if (!game) return '';
  return [
    game.board.map(row => row.join('')).join('/'),
    game.turn,
    normalizedSchachlaborCastling(game),
    game.repetitionEpKey()
  ].join(' ');
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

function pgnMovesIncludingTheme(setup, moves) {
  const normalized = cleanGameSetup(setup);
  const themeMoves = normalized.theme && Array.isArray(normalized.theme.moves) ? normalized.theme.moves : [];
  return themeMoves.concat(Array.isArray(moves) ? moves : []);
}

const GAME_START_FAMILIES = Object.freeze([
  Object.freeze({moves:['e4','e5','Nf3','Nc6','Bb5'],name:'Spanische Partie'}),
  Object.freeze({moves:['e4','e5','Nf3','Nc6','Bc4'],name:'Italienische Partie'}),
  Object.freeze({moves:['e4','e5','Nf3','Nc6','d4'],name:'Schottische Partie'}),
  Object.freeze({moves:['d4','Nf6','c4','g6','Nc3','Bg7','e4','d6'],name:'Königsindische Verteidigung'}),
  Object.freeze({moves:['d4','Nf6','c4','g6','Nc3','d5'],name:'Grünfeld-Verteidigung'}),
  Object.freeze({moves:['d4','Nf6','c4','e6','Nc3','Bb4'],name:'Nimzo-Indische Verteidigung'}),
  Object.freeze({moves:['d4','Nf6','c4','e6','Nf3','b6'],name:'Damenindische Verteidigung'}),
  Object.freeze({moves:['d4','Nf6','c4','e6','g3'],name:'Katalanische Eröffnung'}),
  Object.freeze({moves:['e4','e5','Nf3','Nf6'],name:'Russische Verteidigung'}),
  Object.freeze({moves:['e4','e5','Nf3','d6'],name:'Philidor-Verteidigung'}),
  Object.freeze({moves:['e4','e5','Nc3'],name:'Wiener Partie'}),
  Object.freeze({moves:['e4','e5','f4'],name:'Königsgambit'}),
  Object.freeze({moves:['d4','d5','c4','c6'],name:'Slawische Verteidigung'}),
  Object.freeze({moves:['d4','d5','c4'],name:'Damengambit'}),
  Object.freeze({moves:['Nf3','d5','c4'],name:'Réti-Eröffnung'}),
  Object.freeze({moves:['e4','c5'],name:'Sizilianische Verteidigung'}),
  Object.freeze({moves:['e4','e6'],name:'Französische Verteidigung'}),
  Object.freeze({moves:['e4','c6'],name:'Caro-Kann-Verteidigung'}),
  Object.freeze({moves:['e4','d5'],name:'Skandinavische Verteidigung'}),
  Object.freeze({moves:['e4','Nf6'],name:'Aljechin-Verteidigung'}),
  Object.freeze({moves:['d4','f5'],name:'Holländische Verteidigung'}),
  Object.freeze({moves:['d4','Nf6','c4'],name:'Indische Verteidigung'}),
  Object.freeze({moves:['e4','e5'],name:'Königsbauernspiel'}),
  Object.freeze({moves:['d4','d5'],name:'Damenbauernspiel'}),
  Object.freeze({moves:['c4'],name:'Englische Eröffnung'}),
  Object.freeze({moves:['Nf3'],name:'Zukertort-Eröffnung'}),
  Object.freeze({moves:['f4'],name:'Bird-Eröffnung'}),
  Object.freeze({moves:['b3'],name:'Larsen-Eröffnung'}),
  Object.freeze({moves:['b4'],name:'Sokolski-Eröffnung'}),
  Object.freeze({moves:['e4'],name:'Königsbauernspiel'}),
  Object.freeze({moves:['d4'],name:'Damenbauernspiel'})
]);

function gameStartSanTokensFromPgn(value) {
  const pgn = String(value || '');
  if (!pgn.trim()) return [];
  return pgn
    .replace(/^\s*\[[^\n]*\]\s*$/gm, ' ')
    .replace(/\{[^}]*\}/gs, ' ')
    .replace(/\([^)]*\)/gs, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(?:\.\.)?/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token && !['*','1-0','0-1','1/2-1/2'].includes(token));
}

function normalizedGameStartSan(value) {
  return String(value || '').replace(/0/g, 'O').replace(/e\.p\.?$/i, '').replace(/[+#?!]+$/g, '');
}

function gameStartFamilyName(tokens, variant) {
  if (variant === GAME_VARIANT_FREESTYLE) return '';
  const normalized = tokens.map(normalizedGameStartSan);
  const family = GAME_START_FAMILIES.find(item => item.moves.every((move, index) => normalized[index] === move));
  return family ? family.name : '';
}

function gameStartSummaryFromPgn(value, variant) {
  const tokens = gameStartSanTokensFromPgn(value);
  if (!tokens.length) return null;
  const excerpt = tokens.slice(0, 12);
  const parts = [];
  for (let index = 0; index < excerpt.length; index += 2) {
    let item = (Math.floor(index / 2) + 1) + '. ' + excerpt[index];
    if (excerpt[index + 1]) item += ' ' + excerpt[index + 1];
    parts.push(item);
  }
  return {name:gameStartFamilyName(tokens, variant), moveText:parts.join(' ')};
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
    tags.push(['HammerschachTournamentMode', String(tournamentMeta.tournamentMode || '')]);
    tags.push(['HammerschachTournamentRound', String(tournamentMeta.roundNumber || '')]);
    tags.push(['HammerschachRoundLabel', String(tournamentMeta.roundLabel || '')]);
    tags.push(['HammerschachTournamentStage', String(tournamentMeta.stage || '')]);
    if (tournamentMeta.groupName) tags.push(['HammerschachGroup', String(tournamentMeta.groupName)]);
    tags.push(['HammerschachPairing', String(tournamentMeta.pairingNumber || '')]);
    if (tournamentMeta.pairingLabel) tags.push(['HammerschachPairingLabel', String(tournamentMeta.pairingLabel)]);
    tags.push(['HammerschachPairingGame', String(tournamentMeta.gameNumber || '')]);
  }
  if (normalizedSetup.variant === GAME_VARIANT_FREESTYLE) {
    tags.push(['Variant', 'Chess960']);
    tags.push(['SetUp', '1']);
    tags.push(['FEN', initialFenForServerSetup(normalizedSetup)]);
    tags.push(['HammerschachPosition', String(normalizedSetup.positionId)]);
    tags.push(['HammerschachBackRank', normalizedSetup.backRank]);
  }
  if (normalizedSetup.theme) {
    tags.push(['HammerschachTournamentTheme', '1']);
    tags.push(['Opening', normalizedSetup.theme.name]);
    tags.push(['ThemeStartPly', String(normalizedSetup.theme.startPly)]);
    if (normalizedSetup.theme.moveText) tags.push(['HammerschachThemeMoves', normalizedSetup.theme.moveText]);
  }
  const header = tags.map(([key, value]) => '[' + key + ' "' + pgnEscapeTagValue(value) + '"]').join('\n');
  return header + '\n\n' + pgnMoveTextFromStoredMoves(pgnMovesIncludingTheme(normalizedSetup, moves), result) + '\n';
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
    tags.push(['HammerschachTournamentMode', String(tournamentMeta.tournamentMode || '')]);
    tags.push(['HammerschachTournamentRound', String(tournamentMeta.roundNumber || '')]);
    tags.push(['HammerschachRoundLabel', String(tournamentMeta.roundLabel || '')]);
    tags.push(['HammerschachTournamentStage', String(tournamentMeta.stage || '')]);
    if (tournamentMeta.groupName) tags.push(['HammerschachGroup', String(tournamentMeta.groupName)]);
    tags.push(['HammerschachPairing', String(tournamentMeta.pairingNumber || '')]);
    if (tournamentMeta.pairingLabel) tags.push(['HammerschachPairingLabel', String(tournamentMeta.pairingLabel)]);
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
  if (normalizedSetup.theme) {
    tags.push(['HammerschachTournamentTheme', '1']);
    tags.push(['Opening', normalizedSetup.theme.name]);
    tags.push(['ThemeStartPly', String(normalizedSetup.theme.startPly)]);
    if (normalizedSetup.theme.moveText) tags.push(['HammerschachThemeMoves', normalizedSetup.theme.moveText]);
  }
  const header = tags.map(([key, value]) => '[' + key + ' "' + pgnEscapeTagValue(value) + '"]').join('\n');
  return header + '\n\n' + pgnMoveTextFromStoredMoves(pgnMovesIncludingTheme(normalizedSetup, moves), result) + '\n';
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
    this.lastPresenceBroadcastAt = 0;
    this.presenceBroadcastPromise = null;
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

  async presencePayload() {
    const members = new Map();
    try {
      const gamerMembers = await listOnlinePresenceMembers(this.env);
      for (const member of gamerMembers) {
        if (!member.userId) continue;
        members.set(member.userId, {
          id:String(member.userId || ''),
          name:member.name,
          senderKey:'',
          isAdmin:member.isAdmin === true
        });
      }
    } catch (_) {
      /* Bei einem vorübergehenden D1-Fehler bleibt mindestens die aktuell
         verbundene Lobby-Chat-Gemeinschaft sichtbar. */
    }
    for (const ws of this.authenticatedSockets()) {
      const info = this.attachment(ws);
      const userId = String(info.userId || '');
      if (!userId) continue;
      members.set(userId, {
        id:userId,
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

  async broadcastPresence(force = false) {
    const now = Date.now();
    if (!force && now - this.lastPresenceBroadcastAt < 20000) return;
    if (this.presenceBroadcastPromise) return this.presenceBroadcastPromise;
    this.lastPresenceBroadcastAt = now;
    this.presenceBroadcastPromise = (async () => {
      const payload = await this.presencePayload();
      for (const ws of this.authenticatedSockets()) safeSend(ws, payload);
    })();
    try { await this.presenceBroadcastPromise; }
    finally { this.presenceBroadcastPromise = null; }
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
    try { await setUserPresence(this.env, session.user.id, true); } catch (_) {}
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
    await this.broadcastPresence(true);
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
      await this.broadcastPresence(true);
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
      await this.broadcastPresence(true);
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
    if (data.type === 'ping') {
      safeSend(ws, {type:'pong',serverNow:Date.now()});
      await this.broadcastPresence(false);
      return;
    }
    safeSend(ws, {type:'global_chat_error',code:'UNKNOWN_MESSAGE_TYPE',message:'Unbekannte Global-Chat-Anfrage.'});
  }

  async webSocketClose() {
    await this.broadcastPresence(true);
  }

  async webSocketError() {
    await this.broadcastPresence(true);
  }
}

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.userPresenceCache = { key:'', expiresAt:0, values:{} };
    this.accountNameCache = { key:'', expiresAt:0, values:{} };
    this.ratingStateCache = { key:'', expiresAt:0, value:null };
    this.headToHeadCache = new Map();
    this.validationGameCache = { key:'', game:null };
    this.rematchIndexCache = { offerId:'', status:'' };
  }

  validationGameKey(moves, gameSetup) {
    const list = Array.isArray(moves) ? moves : [];
    const tail = list.length ? list[list.length - 1] : null;
    const tailKey = tail
      ? [tail.ply || list.length, tail.side || '', (tail.from || []).join(','), (tail.to || []).join(','), tail.promotion || '', tail.castle || '', tail.messageId || ''].join(':')
      : 'start';
    return JSON.stringify(cleanGameSetup(gameSetup || null)) + '|' + list.length + '|' + tailKey;
  }

  validationGameFor(moves, gameSetup) {
    const key = this.validationGameKey(moves, gameSetup);
    if (this.validationGameCache.key === key && this.validationGameCache.game) {
      /*
        validateMoveOnServer arbeitet auf einer eigenen Kopie. Hier reicht daher
        die unveränderte Cache-Instanz und eine zweite Klonierung entfällt.
      */
      return this.validationGameCache.game;
    }
    const game = buildGameFromStoredMoves(moves || [], gameSetup);
    this.validationGameCache = { key, game:game.clone() };
    return game;
  }

  rememberValidationGame(moves, gameSetup, game) {
    if (!game) {
      this.validationGameCache = { key:'', game:null };
      return;
    }
    this.validationGameCache = {
      key:this.validationGameKey(moves, gameSetup),
      game:game.clone()
    };
  }


  runBackgroundTask(task, label = 'Hintergrundaufgabe') {
    const guarded = Promise.resolve(task).catch(error => {
      console.error(label, error && error.message ? error.message : String(error || 'unknown'));
    });
    if (this.state && typeof this.state.waitUntil === 'function') this.state.waitUntil(guarded);
    return guarded;
  }

  playerRoleForUser(players, userId) {
    const uid = String(userId || '');
    if (!uid) return '';
    if (players && players.white && String(players.white.userId || '') === uid) return 'w';
    if (players && players.black && String(players.black.userId || '') === uid) return 'b';
    return '';
  }

  async headToHeadStateFor(info, players, timeControl, gameSetup) {
    const viewerUserId = String(info && info.userId || '');
    const viewerRole = this.playerRoleForUser(players, viewerUserId);
    if (!viewerUserId || !viewerRole) return null;
    const opponentSlot = viewerRole === 'w' ? players.black : players.white;
    const opponentUserId = String(opponentSlot && opponentSlot.userId || '');
    const ratingType = ratingTypeFromGame(timeControl, gameSetup);
    if (!opponentUserId || !ratingType) return null;

    const cacheKey = [viewerUserId, opponentUserId, ratingType].join('|');
    const cached = this.headToHeadCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    try {
      const value = await headToHeadForUsers(this.env, viewerUserId, opponentUserId, ratingType);
      this.headToHeadCache.set(cacheKey, { expiresAt:Date.now() + 30000, value });
      return value;
    } catch (_) {
      return null;
    }
  }

  async rematchStateFor(info, players, game, tournamentMeta) {
    const userId = String(info && info.userId || '');
    const role = this.playerRoleForUser(players, userId);
    const opponentSlot = role === 'w' ? players.black : role === 'b' ? players.white : null;
    const opponentUserId = String(opponentSlot && opponentSlot.userId || '');
    if (!userId || !role || !opponentUserId || !game || !game.ended || (tournamentMeta && tournamentMeta.tournamentId)) return null;

    let offer = (await this.state.storage.get('rematchOffer')) || null;
    if (!offer) {
      return { available:true, status:'available', opponentName:'' };
    }
    try { await this.syncRematchOfferIndex(offer); } catch (_) {}
    const requestedByUserId = String(offer.requestedByUserId || '');
    const targetUserId = String(offer.targetUserId || '');
    if (userId !== requestedByUserId && userId !== targetUserId) return null;

    const common = {
      available:true,
      offerId:String(offer.id || ''),
      requestedByName:cleanDisplayName(offer.requestedByName || ''),
      opponentName:cleanDisplayName(userId === requestedByUserId ? offer.targetName : offer.requestedByName),
      createdAt:offer.createdAt || null
    };
    if (offer.status === 'pending') {
      return Object.assign(common, { status:userId === requestedByUserId ? 'requested' : 'incoming' });
    }
    if (offer.status === 'creating') {
      return Object.assign(common, { status:'creating' });
    }
    if (offer.status === 'ready' && cleanRoomId(offer.roomId)) {
      return Object.assign(common, { status:'ready', roomId:cleanRoomId(offer.roomId) });
    }
    if (offer.status === 'declined') {
      return Object.assign(common, { status:'declined' });
    }
    if (offer.status === 'withdrawn') {
      return Object.assign(common, { status:'withdrawn' });
    }
    return { available:true, status:'available', opponentName:common.opponentName };
  }

  async syncRematchOfferIndex(offer) {
    const offerId = cleanRematchOfferId(offer && offer.id);
    const status = String(offer && offer.status || 'pending');
    if (!offerId || (this.rematchIndexCache.offerId === offerId && this.rematchIndexCache.status === status)) return false;
    const sourceRoomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
    const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
    const game = (await this.state.storage.get('game')) || null;
    const gameSetup = cleanGameSetup((await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null);
    const ratedRequested = (await this.state.storage.get('ratedRequested')) !== false;
    await saveRematchOfferIndex(this.env, sourceRoomId, offer, timeControl, gameSetup, ratedRequested);
    this.rematchIndexCache = {offerId, status};
    return true;
  }

  async sendRematchRequestNotification(offer, timeControl, gameSetup) {
    const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
    const inviteUrl = gamerRematchInvitationUrl(this.env, offer && offer.id);
    if (!offer || !roomId || !inviteUrl) return { ok:true, skipped:true, reason:'context_missing' };
    return sendRematchRequestEmailNotification(this.env, {
      notificationKey:`rematch_request:${roomId}:${String(offer.id || '')}:${String(offer.targetUserId || '')}`,
      roomId,
      recipientUserId:String(offer.targetUserId || ''),
      opponentName:cleanDisplayName(offer.requestedByName || ''),
      inviteUrl,
      timeLabel:invitationTimeLabel(timeControl),
      variantLabel:invitationVariantLabel(gameSetup)
    });
  }

  async requestRematch(info) {
    const game = (await this.state.storage.get('game')) || null;
    const tournamentMeta = (await this.state.storage.get('tournamentMeta')) || null;
    if (!game || !game.ended) return { ok:false, code:'REMATCH_GAME_RUNNING', message:'Eine Revanche kann erst nach Partieende angeboten werden.' };
    if (tournamentMeta && tournamentMeta.tournamentId) return { ok:false, code:'REMATCH_TOURNAMENT_BLOCKED', message:'Bei Turnierpartien ist keine direkte Revanche vorgesehen.' };

    const players = await this.getSecurePlayers();
    const requesterUserId = String(info && info.userId || '');
    const requesterRole = this.playerRoleForUser(players, requesterUserId);
    const targetSlot = requesterRole === 'w' ? players.black : requesterRole === 'b' ? players.white : null;
    const targetUserId = String(targetSlot && targetSlot.userId || '');
    if (!requesterUserId || !requesterRole) return { ok:false, code:'REMATCH_PLAYER_REQUIRED', message:'Nur ein angemeldeter Spieler dieser Partie kann eine Revanche anbieten.' };
    if (!targetUserId) return { ok:false, code:'REMATCH_MEMBER_REQUIRED', message:'Eine direkte Revanche ist nur zwischen zwei registrierten Mitgliedern möglich.' };

    const existing = (await this.state.storage.get('rematchOffer')) || null;
    if (existing) {
      if (String(existing.requestedByUserId || '') === requesterUserId || String(existing.targetUserId || '') === requesterUserId) {
        return { ok:true, alreadyExists:true };
      }
      return { ok:false, code:'REMATCH_ALREADY_EXISTS', message:'Für diese Partie besteht bereits eine Revanche-Anfrage.' };
    }

    const names = await this.getAccountNamesByUserIds([requesterUserId, targetUserId]);
    const offer = {
      id:'rm_' + randomBase64Url(12),
      status:'pending',
      requestedByUserId:requesterUserId,
      requestedByRole:requesterRole,
      requestedByName:cleanDisplayName(names[requesterUserId] || '') || (requesterRole === 'w' ? 'Weiß' : 'Schwarz'),
      targetUserId,
      targetRole:opposite(requesterRole),
      targetName:cleanDisplayName(names[targetUserId] || '') || (requesterRole === 'w' ? 'Schwarz' : 'Weiß'),
      createdAt:new Date().toISOString()
    };
    await this.state.storage.put('rematchOffer', offer);
    const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
    const gameSetup = cleanGameSetup((await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null);
    try {
      await this.syncRematchOfferIndex(offer);
    } catch (error) {
      await this.state.storage.delete('rematchOffer');
      this.rematchIndexCache = {offerId:'', status:''};
      throw error;
    }
    this.runBackgroundTask(
      this.sendRematchRequestNotification(offer, timeControl, gameSetup),
      'Revanche-Benachrichtigung fehlgeschlagen'
    );
    return { ok:true };
  }

  async respondToRematch(info, accepted) {
    const offer = (await this.state.storage.get('rematchOffer')) || null;
    const userId = String(info && info.userId || '');
    if (!offer || offer.status !== 'pending') return { ok:false, code:'REMATCH_NOT_PENDING', message:'Es liegt keine offene Revanche-Anfrage vor.' };
    if (!userId || String(offer.targetUserId || '') !== userId) return { ok:false, code:'REMATCH_TARGET_REQUIRED', message:'Nur der eingeladene Gegner kann diese Revanche beantworten.' };
    if (!accepted) {
      const declinedOffer = Object.assign({}, offer, {
        status:'declined',
        respondedAt:new Date().toISOString()
      });
      await this.state.storage.put('rematchOffer', declinedOffer);
      this.rematchIndexCache = {offerId:'', status:''};
      try {
        await this.syncRematchOfferIndex(declinedOffer);
      } catch (error) {
        await this.state.storage.put('rematchOffer', offer);
        this.rematchIndexCache = {offerId:'', status:''};
        throw error;
      }
      return { ok:true, accepted:false };
    }

    const tournamentMeta = (await this.state.storage.get('tournamentMeta')) || null;
    if (tournamentMeta && tournamentMeta.tournamentId) return { ok:false, code:'REMATCH_TOURNAMENT_BLOCKED', message:'Bei Turnierpartien ist keine direkte Revanche vorgesehen.' };
    const players = await this.getSecurePlayers();
    const oldWhiteUserId = String(players.white && players.white.userId || '');
    const oldBlackUserId = String(players.black && players.black.userId || '');
    if (!oldWhiteUserId || !oldBlackUserId || oldWhiteUserId === oldBlackUserId) {
      return { ok:false, code:'REMATCH_MEMBERS_MISSING', message:'Die beiden Mitglieder konnten nicht mehr eindeutig zugeordnet werden.' };
    }
    const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
    const game = (await this.state.storage.get('game')) || null;
    const gameSetup = cleanGameSetup((await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null);
    if (!timeControl) return { ok:false, code:'REMATCH_TIME_MISSING', message:'Die ursprüngliche Bedenkzeit konnte nicht übernommen werden.' };

    const names = await this.getAccountNamesByUserIds([oldWhiteUserId, oldBlackUserId]);
    const deterministicRoomId = 'rematch_' + String(offer.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
    const roomId = cleanRoomId(deterministicRoomId) || cleanRoomId(randomBase64Url(12));
    const sourceRoomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
    const creatingOffer = Object.assign({}, offer, {
      status:'creating',
      respondedAt:new Date().toISOString(),
      roomId
    });
    await this.state.storage.put('rematchOffer', creatingOffer);
    this.rematchIndexCache = {offerId:'', status:''};

    try {
      await this.syncRematchOfferIndex(creatingOffer);
      const id = this.env.GAME_ROOM.idFromName(roomId);
      const stub = gameRoomStub(this.env, id);
      const response = await stub.fetch(new Request('https://game-room.internal/rematch-init?room=' + encodeURIComponent(roomId), {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          sourceRoomId,
          offerId:String(offer.id || ''),
          white:{ userId:oldBlackUserId, username:cleanDisplayName(names[oldBlackUserId] || '') || 'Weiß' },
          black:{ userId:oldWhiteUserId, username:cleanDisplayName(names[oldWhiteUserId] || '') || 'Schwarz' },
          timeControl,
          gameSetup,
          ratedRequested:(await this.state.storage.get('ratedRequested')) !== false,
          publicGame:(await this.state.storage.get('publicGame')) === true,
          createdByUserId:String(offer.requestedByUserId || '')
        })
      }));
      let initialized = null;
      try { initialized = await response.json(); } catch (_) { initialized = null; }
      if (!response.ok || !initialized || !initialized.ok) {
        throw new Error(initialized && initialized.message ? initialized.message : 'Der neue Revanche-Raum konnte nicht vorbereitet werden.');
      }
    } catch (error) {
      await this.state.storage.put('rematchOffer', Object.assign({}, offer, {
        status:'pending',
        lastError:error && error.message ? String(error.message).slice(0, 200) : 'Revanche konnte nicht vorbereitet werden.'
      }));
      this.rematchIndexCache = {offerId:'', status:''};
      try { await this.syncRematchOfferIndex(offer); } catch (_) {}
      return { ok:false, code:'REMATCH_CREATE_FAILED', message:error && error.message ? error.message : 'Die Revanche konnte nicht vorbereitet werden.' };
    }

    const readyOffer = Object.assign({}, creatingOffer, {
      status:'ready',
      readyAt:new Date().toISOString()
    });
    await this.state.storage.put('rematchOffer', readyOffer);
    this.rematchIndexCache = {offerId:'', status:''};
    try {
      await this.syncRematchOfferIndex(readyOffer);
    } catch (error) {
      console.error('Rematch index finalization deferred', error && error.message ? error.message : String(error || 'unknown'));
      this.rematchIndexCache = {offerId:'', status:''};
      this.runBackgroundTask(this.syncRematchOfferIndex(readyOffer), 'Revanche-Übersicht konnte nicht abschließend aktualisiert werden');
    }
    return { ok:true, accepted:true, roomId };
  }

  async withdrawRematch(info) {
    const offer = (await this.state.storage.get('rematchOffer')) || null;
    const userId = String(info && info.userId || '');
    if (!offer || offer.status !== 'pending') return {ok:false, code:'REMATCH_NOT_PENDING', message:'Es liegt keine offene Revanche-Anfrage vor.'};
    if (!userId || String(offer.requestedByUserId || '') !== userId) return {ok:false, code:'REMATCH_REQUESTER_REQUIRED', message:'Nur der Absender kann diese Revanche-Anfrage zurückziehen.'};
    const withdrawnOffer = Object.assign({}, offer, {status:'withdrawn', respondedAt:new Date().toISOString()});
    await this.state.storage.put('rematchOffer', withdrawnOffer);
    this.rematchIndexCache = {offerId:'', status:''};
    try {
      await this.syncRematchOfferIndex(withdrawnOffer);
    } catch (error) {
      await this.state.storage.put('rematchOffer', offer);
      this.rematchIndexCache = {offerId:'', status:''};
      throw error;
    }
    return {ok:true, withdrawn:true};
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
      const stub = gameRoomStub(this.env, id);
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
    if (game.started) return { ok:false, status:409, code:'GAME_ALREADY_STARTED', message:'Diese Partie wurde bereits gestartet.' };
    const opponentSlot = creatorRole === 'b' ? players.white : players.black;
    if (opponentSlot) {
      return { ok:false, status:409, code:'OPPONENT_ALREADY_JOINED', message:'Der gegnerische Spielerplatz ist bereits belegt.' };
    }

    const rawTimeControl = (await this.state.storage.get('timeControl')) || null;
    const rawGameSetup = (await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null;
    const timeControl = cleanTimeControl(rawTimeControl);
    const gameSetup = rawGameSetup ? cleanGameSetup(rawGameSetup) : null;
    if (!timeControl || !gameSetup) {
      return {
        ok:false,
        status:409,
        code:'INVITATION_ROOM_NOT_READY',
        message:'Bedenkzeit und Spielmodus wurden im Spielraum noch nicht vollständig bestätigt. Bitte die Einladung erneut senden.'
      };
    }
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

  async registerDailyInvitationRecipient(requestingUserId, recipientUserId, recipientName, personalMessage = '') {
    const context = await this.invitationEmailContext(requestingUserId);
    if (!context.ok) return context;
    if (!context.timeControl || context.timeControl.mode !== 'daily') {
      return { ok:false, status:400, code:'NOT_DAILY_INVITATION', message:'Nur Daily-Einladungen benötigen eine ausdrückliche Annahme.' };
    }
    const targetUserId = String(recipientUserId || '').trim();
    if (!targetUserId || targetUserId === String(requestingUserId || '')) {
      return { ok:false, status:400, code:'INVALID_INVITATION_RECIPIENT', message:'Das eingeladene Mitglied ist ungültig.' };
    }
    const personalMessageResult = validateInvitationPersonalMessage(personalMessage, 'Die persönliche Nachricht');
    if (!personalMessageResult.ok) return personalMessageResult;

    const existingUserId = String((await this.state.storage.get('invitedUserId')) || '');
    const existingStatus = String((await this.state.storage.get('invitationStatus')) || '');
    const existingId = String((await this.state.storage.get('invitationId')) || '');
    if (existingUserId && existingStatus === 'pending' && existingUserId !== targetUserId) {
      return { ok:false, status:409, code:'INVITATION_ALREADY_TARGETED', message:'Für diesen Spielraum besteht bereits eine offene Einladung an ein anderes Mitglied.' };
    }
    if (existingUserId === targetUserId && existingStatus === 'pending' && existingId) {
      const previousInvitationMessage = normalizeInvitationPersonalMessage((await this.state.storage.get('invitationMessage')) || '');
      const messageUpdated = previousInvitationMessage !== personalMessageResult.message;
      if (messageUpdated) {
        await this.state.storage.put({ invitationMessage:personalMessageResult.message, invitationResponseMessage:'' });
        await this.syncDailyGameIndex();
      }
      return { ok:true, status:200, invitationId:existingId, newlyRegistered:false, messageUpdated, previousInvitationMessage };
    }

    const invitationId = 'di_' + randomBase64Url(14);
    await this.state.storage.put({
      invitationId,
      invitedUserId:targetUserId,
      invitedName:cleanDisplayName(recipientName) || 'Mitglied',
      invitationStatus:'pending',
      invitationSentAt:new Date().toISOString(),
      invitationRespondedAt:null,
      invitationMessage:personalMessageResult.message,
      invitationResponseMessage:''
    });
    await this.syncDailyGameIndex();
    return { ok:true, status:200, invitationId, newlyRegistered:true };
  }

  async rollbackDailyInvitationRecipient(invitationId, options = {}) {
    const currentId = String((await this.state.storage.get('invitationId')) || '');
    const currentStatus = String((await this.state.storage.get('invitationStatus')) || '');
    if (!currentId || currentId !== String(invitationId || '') || currentStatus !== 'pending') {
      return { ok:true, status:200, rolledBack:false };
    }
    if (options && options.restoreMessage === true) {
      const previousResult = validateInvitationPersonalMessage(options.previousInvitationMessage, 'Die vorherige persönliche Nachricht');
      if (!previousResult.ok) return previousResult;
      await this.state.storage.put('invitationMessage', previousResult.message);
      await this.syncDailyGameIndex();
      return { ok:true, status:200, rolledBack:false, messageRestored:true };
    }
    await this.state.storage.delete([
      'invitationId', 'invitedUserId', 'invitedName', 'invitationStatus',
      'invitationSentAt', 'invitationRespondedAt', 'invitationMessage', 'invitationResponseMessage'
    ]);
    await this.syncDailyGameIndex();
    return { ok:true, status:200, rolledBack:true };
  }

  async recoverIndexedDailyInvitation(requestingUserId, roomHint = '') {
    const userId = String(requestingUserId || '').trim();
    const roomId = cleanRoomId((await this.state.storage.get('roomId')) || roomHint);
    if (!userId || !roomId || !this.env || !this.env.DB || !(await ensureDailyGamesTable(this.env))) return false;
    try {
      const indexed = await this.env.DB.prepare(
        `SELECT invited_user_id, invited_name, invitation_status, invitation_message, invitation_response_message, updated_at
           FROM daily_games
          WHERE room_id = ?
          LIMIT 1`
      ).bind(roomId).first();
      const indexedUserId = String(indexed && indexed.invited_user_id || '');
      const indexedStatus = String(indexed && indexed.invitation_status || 'pending');
      const storedUserId = String((await this.state.storage.get('invitedUserId')) || '');
      if (!indexed || indexedUserId !== userId || indexedStatus !== 'pending') return false;
      if (storedUserId && storedUserId !== indexedUserId) return false;
      await this.state.storage.put({
        invitedUserId:indexedUserId,
        invitedName:cleanDisplayName(indexed.invited_name) || 'Mitglied',
        invitationStatus:'pending',
        invitationId:String((await this.state.storage.get('invitationId')) || ('legacy_' + roomId)).slice(0, 120),
        invitationSentAt:(await this.state.storage.get('invitationSentAt')) || indexed.updated_at || new Date().toISOString(),
        invitationRespondedAt:null,
        invitationMessage:normalizeInvitationPersonalMessage(indexed.invitation_message || ''),
        invitationResponseMessage:normalizeInvitationPersonalMessage(indexed.invitation_response_message || '')
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  async respondToDailyInvitation(requestingUserId, action, roomHint = '', responseMessageValue = '') {
    const userId = String(requestingUserId || '').trim();
    const responseAction = String(action || '').toLowerCase();
    if (!userId) return { ok:false, status:401, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' };
    if (responseAction !== 'accept' && responseAction !== 'decline') {
      return { ok:false, status:400, code:'INVALID_INVITATION_RESPONSE', message:'Bitte wähle Annehmen oder Ablehnen.' };
    }
    const responseMessageResult = validateInvitationPersonalMessage(responseMessageValue, 'Die persönliche Antwort');
    if (!responseMessageResult.ok) return responseMessageResult;
    const responseMessage = responseMessageResult.message;

    let invitedUserId = String((await this.state.storage.get('invitedUserId')) || '');
    let invitationStatus = String((await this.state.storage.get('invitationStatus')) || '');
    if (!invitationStatus) {
      const recovered = await this.recoverIndexedDailyInvitation(userId, roomHint);
      if (recovered) {
        invitedUserId = String((await this.state.storage.get('invitedUserId')) || '');
        invitationStatus = String((await this.state.storage.get('invitationStatus')) || '');
      }
    }
    if (!invitedUserId || invitedUserId !== userId) {
      return { ok:false, status:403, code:'INVITATION_RECIPIENT_REQUIRED', message:'Nur das eingeladene Mitglied kann diese Einladung beantworten.' };
    }
    if (invitationStatus === 'accepted') {
      const acceptedGame = (await this.state.storage.get('game')) || {started:false, ended:false, result:'*'};
      return {
        ok:true,
        status:200,
        accepted:true,
        alreadyAccepted:true,
        roomId:cleanRoomId((await this.state.storage.get('roomId')) || roomHint),
        started:!!acceptedGame.started,
        startPending:!acceptedGame.started,
        message:'Einladung angenommen. Der Spielraum wird geöffnet.'
      };
    }
    if (invitationStatus !== 'pending') {
      return { ok:false, status:409, code:'INVITATION_NOT_PENDING', message:'Diese Einladung wurde bereits beantwortet oder ist nicht mehr offen.' };
    }

    const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
    if (!timeControl || timeControl.mode !== 'daily') {
      return { ok:false, status:400, code:'NOT_DAILY_INVITATION', message:'Diese Einladung gehört nicht zu einer Daily-Partie.' };
    }
    const game = (await this.state.storage.get('game')) || { started:false, ended:false, result:'*' };
    if (game.started || game.ended) {
      return { ok:false, status:409, code:'INVITATION_ALREADY_STARTED', message:'Diese Partie wurde bereits gestartet oder beendet.' };
    }

    const respondedAt = new Date().toISOString();
    const responseRoomId = cleanRoomId((await this.state.storage.get('roomId')) || roomHint);
    const creatorUserId = String((await this.state.storage.get('createdByUserId')) || '').trim();
    const responderName = cleanDisplayName((await this.state.storage.get('invitedName')) || '') || 'Das eingeladene Mitglied';
    const notifyCreator = () => {
      if (!creatorUserId || creatorUserId === userId || !responseRoomId) return;
      const inviteUrl = responseAction === 'accept'
        ? gamerInvitationUrl(this.env, responseRoomId)
        : configuredGamerPublicUrl(this.env);
      if (!inviteUrl) return;
      this.runBackgroundTask(sendDailyInvitationResponseEmailNotification(this.env, {
        recipientUserId:creatorUserId,
        roomId:responseRoomId,
        responderName,
        action:responseAction,
        responseMessage,
        inviteUrl,
        notificationKey:`daily-invitation-response:${responseRoomId}:${responseAction}:${respondedAt}`
      }), 'Daily-Einladungsantwort konnte nicht per Mail versendet werden');
    };
    if (responseAction === 'decline') {
      await this.state.storage.put({ invitationStatus:'declined', invitationRespondedAt:respondedAt, invitationResponseMessage:responseMessage });
      await this.syncDailyGameIndex();
      notifyCreator();
      return { ok:true, status:200, accepted:false, declined:true, message:'Die Einladung wurde abgelehnt.' };
    }

    await this.state.storage.put({
      invitationStatus:'accepted',
      invitationRespondedAt:respondedAt,
      invitationResponseMessage:responseMessage
    });
    await this.syncDailyGameIndex();
    notifyCreator();
    return {
      ok:true,
      status:200,
      accepted:true,
      roomId:cleanRoomId((await this.state.storage.get('roomId')) || ''),
      started:false,
      startPending:true,
      message:'Einladung angenommen. Der Spielraum wird geöffnet.'
    };
  }

  async cancelDailyInvitation(requestingUserId, options = {}) {
    const userId = String(requestingUserId || '').trim();
    if (!userId) return { ok:false, status:401, code:'NOT_AUTHENTICATED', message:'Bitte zuerst einloggen.' };
    const allowLiveInvitation = options && options.allowLiveInvitation === true;

    const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
    let indexedGame = null;
    try {
      if (roomId && await ensureDailyGamesTable(this.env)) {
        indexedGame = await this.env.DB.prepare(
          `SELECT room_id, white_user_id, black_user_id, invitation_status, started, ended
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
    if (timeControl && timeControl.mode !== 'daily' && !allowLiveInvitation) {
      return { ok:false, status:400, code:'NOT_DAILY_INVITATION', message:'Dieser Raum ist keine offene Daily-Einladung.' };
    }
    if (!timeControl && !indexedCreatorRole && !allowLiveInvitation) {
      return { ok:false, status:400, code:'NOT_DAILY_INVITATION', message:'Dieser Raum ist keine offene Daily-Einladung.' };
    }

    const game = (await this.state.storage.get('game')) || { started:false, ended:false, result:'*' };
    if (game.started || game.ended || (indexedGame && (indexedGame.started || indexedGame.ended))) {
      return { ok:false, status:409, code:'INVITATION_ALREADY_ACCEPTED', message:'Die Einladung kann nicht mehr gelöscht werden, weil die Partie bereits angenommen oder gestartet wurde.' };
    }
    const invitationStatus = String((await this.state.storage.get('invitationStatus')) || (indexedGame && indexedGame.invitation_status) || '');
    if (invitationStatus === 'accepted') {
      return { ok:false, status:409, code:'INVITATION_ALREADY_ACCEPTED', message:'Die Einladung kann nicht mehr gelöscht werden, weil sie bereits angenommen wurde.' };
    }

    const players = await this.getSecurePlayers();
    const openOffer = (await this.state.storage.get('openOffer')) === true;
    if (openOffer) {
      return { ok:false, status:409, code:'OPEN_OFFER_REQUIRES_WITHDRAWAL', message:'Ein öffentliches Partieangebot muss über „Angebot zurückziehen“ beendet werden.' };
    }
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
    const cancellationCode = 'INVITATION_CANCELLED';
    const cancellationMessage = 'Diese Einladung wurde vom Ersteller zurückgezogen. Der Spielraum ist nicht mehr verfügbar.';
    const cancellation = {
      cancelled:true,
      cancelledAt,
      cancelledByUserId:userId,
      creatorRole,
      roomId,
      kind:'invitation',
      code:cancellationCode,
      message:cancellationMessage
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
    const variantPart = setup.theme ? ('Thementurnier-' + setup.theme.name) : (setup.variant === GAME_VARIANT_FREESTYLE ? ('Freestyle-' + setup.positionId) : 'Klassisch');
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

    if (request.method === 'POST' && (url.pathname === '/reaction-updated' || url.pathname === '/moment-updated')) {
      try {
        await this.broadcastRoomState(url.pathname === '/moment-updated' ? 'game_moment_state' : 'game_reaction_state');
        return json({ok:true, roomId:room});
      } catch (error) {
        return json({ok:false, code:'GAME_ROOM_BROADCAST_FAILED', message:'Der Spielraum konnte nicht aktualisiert werden.'}, {status:500});
      }
    }

    if (request.method === 'POST' && url.pathname === '/rematch-response') {
      const body = await readJsonBody(request);
      const userId = String(request.headers.get('x-hammerschach-user-id') || body && body.userId || '').trim();
      const offerId = cleanRematchOfferId(body && body.offerId);
      const action = String(body && body.action || '').toLowerCase();
      const storedOffer = (await this.state.storage.get('rematchOffer')) || null;
      if (!userId || !offerId || !storedOffer || cleanRematchOfferId(storedOffer.id) !== offerId) {
        return json({ok:false, code:'REMATCH_NOT_FOUND', message:'Diese Revanche-Anfrage ist nicht mehr verfügbar.'}, {status:404});
      }
      let result;
      if (action === 'withdraw') result = await this.withdrawRematch({userId});
      else if (action === 'accept' || action === 'decline') result = await this.respondToRematch({userId}, action === 'accept');
      else return json({ok:false, code:'REMATCH_ACTION_INVALID', message:'Bitte wähle Annehmen, Ablehnen oder Zurückziehen.'}, {status:400});
      if (!result.ok) return json(result, {status:result.code === 'REMATCH_NOT_PENDING' ? 409 : 403});
      await this.broadcastRoomState('rematch_state');
      return json(result);
    }

    if (request.method === 'POST' && url.pathname === '/tournament-schedule') {
      const body = await readJsonBody(request);
      const tournamentId = String(body && body.tournamentId || '').trim();
      const scheduledAt = String(body && body.scheduledAt || '').trim();
      const action = String(body && body.action || 'start') === 'end' ? 'end' : 'start';
      const alarmAt = Date.parse(scheduledAt);
      if (!tournamentId || !Number.isFinite(alarmAt)) return json({ok:false, code:'INVALID_TOURNAMENT_SCHEDULE', message:'Der Turnierzeitplan ist unvollständig.'}, {status:400});
      await this.state.storage.put('tournamentScheduleMeta', {tournamentId, scheduledAt:new Date(alarmAt).toISOString(), action});
      await this.state.storage.setAlarm(Math.max(Date.now() + 25, alarmAt));
      return json({ok:true, tournamentId, scheduledAt:new Date(alarmAt).toISOString(), action});
    }

    if (request.method === 'POST' && url.pathname === '/rematch-init') {
      const body = await readJsonBody(request);
      const sourceRoomId = cleanRoomId(body && body.sourceRoomId);
      const offerId = String(body && body.offerId || '').trim().slice(0, 100);
      const whiteUserId = String(body && body.white && body.white.userId || '').trim();
      const blackUserId = String(body && body.black && body.black.userId || '').trim();
      if (!body || !sourceRoomId || !offerId || !whiteUserId || !blackUserId || whiteUserId === blackUserId) {
        return json({ok:false, code:'INVALID_REMATCH_GAME', message:'Die Revanche-Daten sind unvollständig.'}, {status:400});
      }
      const existingMeta = await this.state.storage.get('rematchMeta');
      if (existingMeta && String(existingMeta.offerId || '') === offerId && String(existingMeta.sourceRoomId || '') === sourceRoomId) {
        return json({ok:true, roomId:room, alreadyInitialized:true});
      }
      if (existingMeta || (await this.state.storage.get('tournamentMeta')) || (await this.state.storage.get('players'))) {
        return json({ok:false, code:'ROOM_ALREADY_ASSIGNED', message:'Dieser Spielraum ist bereits vergeben.'}, {status:409});
      }

      const accounts = await this.env.DB.prepare(
        `SELECT id, username FROM users WHERE id IN (?, ?)`
      ).bind(whiteUserId, blackUserId).all();
      const accountRows = accounts && Array.isArray(accounts.results) ? accounts.results : [];
      const accountMap = new Map(accountRows.map(row => [String(row.id || ''), row]));
      const whiteAccount = accountMap.get(whiteUserId);
      const blackAccount = accountMap.get(blackUserId);
      if (!whiteAccount || !blackAccount) {
        return json({ok:false, code:'REMATCH_ACCOUNT_UNAVAILABLE', message:'Mindestens ein Spieleraccount ist nicht mehr verfügbar.'}, {status:409});
      }
      const [whiteAccess, blackAccess] = await Promise.all([
        requireUsableAccount(this.env, whiteAccount),
        requireUsableAccount(this.env, blackAccount)
      ]);
      if (!whiteAccess.ok || !blackAccess.ok) {
        return json({ok:false, code:'REMATCH_ACCOUNT_UNAVAILABLE', message:'Mindestens ein Spieleraccount ist nicht mehr verfügbar.'}, {status:409});
      }

      const timeControl = cleanTimeControl(body.timeControl || null);
      if (!timeControl) return json({ok:false, code:'INVALID_REMATCH_TIME_CONTROL', message:'Die ursprüngliche Bedenkzeit ist ungültig.'}, {status:400});
      const gameSetup = cleanGameSetup(body.gameSetup || null);
      const whiteName = cleanDisplayName(whiteAccount.username || body.white.username) || 'Weiß';
      const blackName = cleanDisplayName(blackAccount.username || body.black.username) || 'Schwarz';
      const whitePlayerId = 'rematch_' + whiteUserId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) + '_w';
      const blackPlayerId = 'rematch_' + blackUserId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) + '_b';
      const now = Date.now();
      const players = {
        white:{playerId:whitePlayerId, userId:whiteUserId, seatTokenHash:await sha256Hex(randomBase64Url(32)), assignedAt:now, updatedAt:now},
        black:{playerId:blackPlayerId, userId:blackUserId, seatTokenHash:await sha256Hex(randomBase64Url(32)), assignedAt:now, updatedAt:now}
      };
      const profiles = {
        [whitePlayerId]:{playerId:whitePlayerId, displayName:whiteName, name:whiteName, guest:false, userId:whiteUserId, username:whiteName, role:'w', updatedAt:now},
        [blackPlayerId]:{playerId:blackPlayerId, displayName:blackName, name:blackName, guest:false, userId:blackUserId, username:blackName, role:'b', updatedAt:now}
      };
      const publicGame = body.publicGame === true;
      const createdByUserId = String(body.createdByUserId || '');
      const createdByRole = createdByUserId === blackUserId ? 'b' : 'w';
      const values = {
        roomId:room,
        players,
        playerProfiles:profiles,
        timeControl,
        gameSetup,
        ratedRequested:body.ratedRequested !== false,
        publicGame,
        openOffer:false,
        openOfferStatus:'none',
        createdByRole,
        createdByUserId:createdByUserId || whiteUserId,
        rematchMeta:{ sourceRoomId, offerId, createdAt:new Date().toISOString() }
      };
      if (publicGame) values.publicWatchId = randomBase64Url(24);
      await this.state.storage.put(values);
      await this.syncAccountRoomIndex(players);

      let started = false;
      if (timeControl.mode === 'daily') {
        try {
          const startResult = await this.autoStartDailyGameIfReady('rematch');
          started = !!(startResult && (startResult.started || startResult.reason === 'already_started'));
          if (!started) await this.syncGameIndexes();
        } catch (error) {
          console.error('Daily rematch auto-start deferred', error && error.message ? error.message : String(error || 'unknown'));
          await this.syncGameIndexes();
        }
      } else {
        await this.syncGameIndexes();
      }
      return json({ok:true, roomId:room, started, startPending:timeControl.mode === 'daily' && !started});
    }

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
      const timeControl = cleanTimeControl(body.timeControl || {
        key:String(hours * 3600) + '+0',
        category:'daily',
        mode:'daily',
        label:hours + ' Stunden pro Zug',
        baseSeconds:hours * 3600,
        incrementSeconds:0
      });
      if (!timeControl) return json({ok:false, code:'INVALID_TOURNAMENT_TIME_CONTROL', message:'Die Turnierbedenkzeit ist ungültig.'}, {status:400});
      const gameSetup = cleanGameSetup(body.gameSetup || null);
      const tournamentMeta = {
        tournamentId,
        tournamentGameId,
        tournamentName:cleanTournamentName(body.tournamentName),
        tournamentType:normalizeTournamentType(body.tournamentType),
        tournamentTypeLabel:tournamentTypeLabel(body.tournamentType),
        tournamentMode:normalizeTournamentMode(body.tournamentMode),
        tournamentModeLabel:tournamentModeLabel(body.tournamentMode),
        roundNumber:Math.max(1, Number(body.roundNumber || 1)),
        roundLabel:String(body.roundLabel || '').slice(0, 80),
        stage:String(body.stage || '').slice(0, 40),
        groupName:String(body.groupName || '').slice(0, 8),
        pairingLabel:String(body.pairingLabel || '').slice(0, 80),
        totalRounds:Math.max(1, Number(body.totalRounds || 1)),
        pairingNumber:Math.max(1, Number(body.pairingNumber || 1)),
        gameNumber:Number(body.gameNumber) === 2 ? 2 : 1
      };
      await this.state.storage.put({
        roomId:room,
        players,
        playerProfiles:profiles,
        timeControl,
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
      const started = await this.autoStartDailyGameIfReady('tournament', true);
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
        ratedRequested:result.ratedRequested !== false,
        gameStarted:!!result.gameStarted
      }, { status:result.status || (result.ok ? 200 : 400) });
    }

    if (request.method === 'POST' && url.pathname === '/register-daily-invitation') {
      const body = await readJsonBody(request);
      const result = await this.registerDailyInvitationRecipient(
        request.headers.get('x-hammerschach-user-id') || '',
        body && body.recipientUserId,
        body && body.recipientName,
        body && body.personalMessage
      );
      return json(result, { status:result.status || (result.ok ? 200 : 400) });
    }

    if (request.method === 'POST' && url.pathname === '/rollback-daily-invitation') {
      const body = await readJsonBody(request);
      const result = await this.rollbackDailyInvitationRecipient(body && body.invitationId, {
        restoreMessage:body && body.restoreMessage === true,
        previousInvitationMessage:body && body.previousInvitationMessage
      });
      return json(result, { status:result.status || (result.ok ? 200 : 400) });
    }

    if (request.method === 'POST' && url.pathname === '/respond-daily-invitation') {
      const body = await readJsonBody(request);
      const roomId = cleanRoomId(url.searchParams.get('room') || '');
      const action = String(body && body.action || '').toLowerCase();
      try {
        const result = await this.respondToDailyInvitation(
          request.headers.get('x-hammerschach-user-id') || '',
          action,
          roomId,
          body && body.responseMessage
        );
        if (result.ok) {
          try { await this.broadcastRoomState('invitation_state'); }
          catch (error) { console.error('Daily invitation broadcast deferred', roomId, error && error.message ? error.message : String(error || 'unknown')); }
        }
        return json(result, { status:result.status || (result.ok ? 200 : 400) });
      } catch (error) {
        console.error(
          'Daily invitation response failed',
          roomId,
          action,
          error && error.stack ? error.stack : (error && error.message ? error.message : String(error || 'unknown'))
        );
        return json({
          ok:false,
          code:'INVITATION_RESPONSE_INTERNAL',
          message:'Die Einladung konnte im Spielraum nicht verarbeitet werden. Der technische Fehler wurde protokolliert.'
        }, {status:500});
      }
    }

    if (request.method === 'POST' && url.pathname === '/moderation-context') {
      const body=await readJsonBody(request); const reporterUserId=String(body&&body.reporterUserId||''); const reportedRole=body&&body.reportedRole==='b'?'b':'w';
      const players=await this.getSecurePlayers(); const reporterIsPlayer=[players.white,players.black].some(slot=>slot&&slot.userId&&String(slot.userId)===reporterUserId);
      if(!reporterIsPlayer) return json({ok:false,code:'NOT_ROOM_PLAYER',message:'Nur ein beteiligter Spieler kann aus dieser Partie melden.'},{status:403});
      const target=reportedRole==='w'?players.white:players.black; if(!target) return json({ok:false,code:'PLAYER_NOT_FOUND',message:'Der gemeldete Spielerplatz ist nicht belegt.'},{status:404});
      const profiles=(await this.state.storage.get('playerProfiles'))||{}; const profile=profiles[target.playerId]||{}; const chats=(await this.state.storage.get('chatMessages'))||[]; const game=(await this.state.storage.get('game'))||{}; const timeControl=(await this.state.storage.get('timeControl'))||null; const gameSetup=(await this.state.storage.get('gameSetup'))||null;
      return json({ok:true,reportedUserId:target.userId||'',reportedName:profile.displayName||profile.name||(reportedRole==='w'?'Weiß':'Schwarz'),chatSnapshot:(Array.isArray(chats)?chats.slice(-30):[]).map(c=>({senderName:c.senderName||c.name||'',role:c.role||'',text:c.text||'',sentAt:c.sentAt||''})),gameSnapshot:{started:!!game.started,ended:!!game.ended,result:game.result||'*',timeControl,gameSetup}});
    }

    if (request.method === 'POST' && url.pathname === '/account-game-summary') {
      const result = await this.accountGameSummary(request.headers.get('x-hammerschach-user-id') || '');
      return json(result, {status:result.status || (result.ok ? 200 : 400)});
    }

    if (request.method === 'POST' && url.pathname === '/schachlabor-position-check') {
      const body = await readJsonBody(request);
      const result = await this.schachlaborPositionCheck(
        request.headers.get('x-hammerschach-user-id') || '',
        body && body.fen
      );
      return json(result, {status:result.status || (result.ok ? 200 : 400)});
    }

    if (request.method === 'POST' && url.pathname === '/game-moment-eligibility') {
      const result = await this.gameMomentEligibility(request.headers.get('x-hammerschach-user-id') || '');
      return json(result, {status:result.status || (result.ok ? 200 : 400)});
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

    if (request.method === 'DELETE' && url.pathname === '/cancel-prepared-invitation') {
      const result = await this.cancelDailyInvitation(request.headers.get('x-hammerschach-user-id') || '', {allowLiveInvitation:true});
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

  async accountGameSummary(requestingUserId) {
    const userId = String(requestingUserId || '').trim();
    if (!userId) return {ok:false, status:400, code:'USER_ID_REQUIRED', message:'Benutzer-ID fehlt.'};
    const cancellation = await this.state.storage.get('cancelled');
    if (cancellation && cancellation.cancelled) return {ok:true, status:200, started:false, ended:true, cancelled:true};
    const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
    if (!timeControl || timeControl.mode !== 'live') return {ok:true, status:200, started:false, ended:false, mode:timeControl && timeControl.mode || ''};
    const players = await this.getSecurePlayers();
    const whiteUserId = players.white && players.white.userId ? String(players.white.userId) : '';
    const blackUserId = players.black && players.black.userId ? String(players.black.userId) : '';
    const role = userId === whiteUserId ? 'w' : userId === blackUserId ? 'b' : '';
    if (!role) return {ok:false, status:403, code:'NOT_A_PLAYER', message:'Diese Partie gehört nicht zu deinem Account.'};

    const timed = await this.refreshTimedGameState(Date.now());
    const game = timed.game || {started:false, ended:false, result:'*'};
    const clock = timed.clock || (await this.state.storage.get('clock')) || null;
    if (!game.started || game.ended) {
      return {ok:true, status:200, roomId:cleanRoomId((await this.state.storage.get('roomId')) || ''), mode:'live', started:!!game.started, ended:!!game.ended};
    }

    const profiles = (await this.state.storage.get('playerProfiles')) || {};
    const whitePlayerId = playerIdFromSlot(players.white);
    const blackPlayerId = playerIdFromSlot(players.black);
    const accountNames = await this.getAccountNamesByUserIds([whiteUserId, blackUserId]);
    const whiteName = cleanDisplayName(accountNames[whiteUserId] || '') || cleanDisplayName(whitePlayerId && profiles[whitePlayerId] && (profiles[whitePlayerId].displayName || profiles[whitePlayerId].name)) || 'Weiß';
    const blackName = cleanDisplayName(accountNames[blackUserId] || '') || cleanDisplayName(blackPlayerId && profiles[blackPlayerId] && (profiles[blackPlayerId].displayName || profiles[blackPlayerId].name)) || 'Schwarz';
    const setup = cleanGameSetup((await this.state.storage.get('gameSetup')) || (game && game.gameSetup) || null);
    const moves = (await this.state.storage.get('moves')) || [];
    const lastMove = moves.length ? moves[moves.length - 1] : null;
    const turn = clock && (clock.turn === 'w' || clock.turn === 'b') ? clock.turn : (moves.length % 2 ? 'b' : 'w');
    const tournamentMeta = (await this.state.storage.get('tournamentMeta')) || null;
    const publicGame = (await this.state.storage.get('publicGame')) === true;
    const rated = Number(game.ratingSystemVersion || 0) === RATING_SYSTEM_VERSION ? !!game.ratingRated : (await this.state.storage.get('ratedRequested')) !== false;
    const roomId = cleanRoomId((await this.state.storage.get('roomId')) || '');
    return {
      ok:true,
      status:200,
      roomId,
      mode:'live',
      role,
      whiteName,
      blackName,
      opponentName:role === 'w' ? blackName : whiteName,
      timeLabel:timeControl.label || 'Live',
      variant:setup.variant,
      positionId:setup.variant === GAME_VARIANT_FREESTYLE ? setup.positionId : null,
      started:true,
      startedAt:game.startedAt || null,
      updatedAt:new Date().toISOString(),
      ended:false,
      turn,
      isMyTurn:turn === role,
      movesCount:moves.length,
      lastMoveSan:lastMove && lastMove.san ? String(lastMove.san).slice(0,24) : '',
      rated,
      publicGame,
      tournamentId:tournamentMeta && tournamentMeta.tournamentId ? String(tournamentMeta.tournamentId).slice(0,128) : '',
      tournamentName:tournamentMeta && tournamentMeta.tournamentName ? cleanTournamentName(tournamentMeta.tournamentName) : '',
      tournamentRoundLabel:tournamentMeta && tournamentMeta.roundLabel ? String(tournamentMeta.roundLabel).slice(0,80) : '',
      isTournamentGame:!!(tournamentMeta && tournamentMeta.tournamentId)
    };
  }

  async schachlaborPositionCheck(requestingUserId, candidateFen) {
    const userId = String(requestingUserId || '').trim();
    if (!userId) return {ok:false, status:400};
    const players = await this.getSecurePlayers();
    const belongs = [players.white, players.black].some(slot => slot && slot.userId && String(slot.userId) === userId);
    /* account_game_rooms ist ein Suchindex und kann nach alten, abgebrochenen
       oder inzwischen neu belegten Räumen noch einen veralteten Verweis
       enthalten. Die geschützte Raumbelegung ist hier die maßgebliche Quelle:
       Gehört der angemeldete Benutzer nicht zum Raum, ist dieser Raum keine
       laufende Partie dieses Benutzers und darf die gesamte Prüfung nicht als
       technischer Fehler blockieren. Alle echten Lese-/Rekonstruktionsfehler
       bleiben dagegen weiterhin fail-closed. */
    if (!belongs) return {ok:true, status:200, active:false, match:false, belongs:false};
    const timed = await this.refreshTimedGameState(Date.now());
    const storedGame = timed.game || (await this.state.storage.get('game')) || {started:false,ended:false};
    if (!storedGame.started || storedGame.ended) return {ok:true, status:200, active:false, match:false};
    const setup = cleanGameSetup((await this.state.storage.get('gameSetup')) || storedGame.gameSetup || null);
    const moves = (await this.state.storage.get('moves')) || [];
    let current;
    try {
      current = buildServerHistoryState(moves, setup).game;
    } catch (_) {
      return {ok:false, status:500};
    }
    const candidate = parseSchachlaborFenForSetup(candidateFen, setup);
    if (!candidate) return {ok:false, status:400};
    const candidateKey = schachlaborPositionKey(candidate);
    if (candidateKey === schachlaborPositionKey(current)) {
      return {ok:true, status:200, active:true, match:true};
    }
    /* Eine direkt aus der laufenden Stellung entstehende legale Folgestellung
       wird ebenfalls blockiert. Das verhindert die triviale Umgehung, vor der
       Analyse einfach einen plausiblen Halbzug auf dem Laborbrett auszuführen. */
    for (const legalMove of current.legalMoves()) {
      const after = current.clone();
      after.makeMove(legalMove, true);
      if (candidateKey === schachlaborPositionKey(after)) {
        return {ok:true, status:200, active:true, match:true};
      }
    }
    return {ok:true, status:200, active:true, match:false};
  }

  async gameMomentEligibility(requestingUserId) {
    const userId = String(requestingUserId || '').trim();
    if (!userId) return {ok:false, status:400, code:'USER_ID_REQUIRED', message:'Benutzer-ID fehlt.'};
    const players = await this.getSecurePlayers();
    const whiteUserId = String(players.white && players.white.userId || '');
    const blackUserId = String(players.black && players.black.userId || '');
    if (userId !== whiteUserId && userId !== blackUserId) {
      return {ok:false, status:403, code:'NOT_A_PLAYER', message:'Diese Partie gehört nicht zu deinem Account.'};
    }
    const game = (await this.state.storage.get('game')) || {started:false, ended:false};
    if (!game.ended) {
      return {ok:false, status:409, code:'GAME_NOT_ENDED', message:'Nur beendete Partien können als Gamer-Moment gespeichert werden.'};
    }
    return {ok:true, status:200, ended:true, whiteUserId, blackUserId};
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
    const rematchOffer = (await this.state.storage.get('rematchOffer')) || null;
    const rematchRemoved = !!(rematchOffer && (
      String(rematchOffer.requestedByUserId || '') === uid || String(rematchOffer.targetUserId || '') === uid
    ));
    if (rematchRemoved) {
      await this.state.storage.delete('rematchOffer');
      this.rematchIndexCache = {offerId:'', status:''};
    }
    for (const socket of this.state.getWebSockets()) {
      const info = socket.deserializeAttachment() || {};
      if (!info.userId || String(info.userId) !== uid) continue;
      socket.serializeAttachment(Object.assign({}, info, { userId:null, username:'', role:'revoked', seatClaimed:false, deletedAccount:true }));
      safeSend(socket, { type:'account_deleted', message:'Der zugehörige Account wurde gelöscht.', serverNow:Date.now() });
      try { socket.close(4003, 'Account gelöscht'); } catch (_) {}
    }
    return { ok:true, status:200, anonymized:changed || chatChanged || rematchRemoved };
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

    const invitedUserId = String((await this.state.storage.get('invitedUserId')) || '');
    const invitationStatus = String((await this.state.storage.get('invitationStatus')) || '');
    if (invitedUserId && invitationStatus === 'pending') {
      const authenticatedUserId = String(authUser && authUser.id || '');
      if (authenticatedUserId === invitedUserId) {
        return {
          role:'spectator',
          seatToken:'',
          denied:true,
          code:'INVITATION_ACCEPTANCE_REQUIRED',
          message:'Bitte nimm die Daily-Einladung zuerst unter „Meine Partien“ an.'
        };
      }
      return {
        role:'spectator',
        seatToken:'',
        denied:true,
        code:'INVITATION_TARGETED',
        message:'Dieser Spielerplatz ist für ein eingeladenes Mitglied reserviert.'
      };
    }
    if (invitedUserId && invitationStatus === 'declined') {
      return {
        role:'spectator',
        seatToken:'',
        denied:true,
        code:'INVITATION_DECLINED',
        message:'Diese Daily-Einladung wurde abgelehnt. Der Einladende kann eine neue Einladung versenden.'
      };
    }
    if (invitedUserId && invitationStatus === 'accepted') {
      const authenticatedUserId = String(authUser && authUser.id || '');
      if (authenticatedUserId !== invitedUserId) {
        return {
          role:'spectator',
          seatToken:'',
          denied:true,
          code:'INVITATION_TARGETED',
          message:'Dieser Spielerplatz ist für das eingeladene Mitglied reserviert.'
        };
      }
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
        `SELECT user_id, last_seen_at, is_online FROM user_presence WHERE user_id IN (${placeholders})`
      ).bind(...ids).all();
      const onlineSince = Date.now() - USER_PRESENCE_ONLINE_WINDOW_MS;
      for(const row of (result && result.results ? result.results : [])){
        const userId = String(row.user_id || '');
        const lastSeen = Date.parse(row.last_seen_at || '');
        if(userId && Number.isFinite(lastSeen)) values[userId] = Number(row.is_online === undefined ? 1 : row.is_online) === 1 && lastSeen >= onlineSince;
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
      const invitedUserId = String((await this.state.storage.get('invitedUserId')) || '');
      const invitedName = cleanDisplayName((await this.state.storage.get('invitedName')) || '');
      const invitationStatus = String((await this.state.storage.get('invitationStatus')) || (invitedUserId ? 'pending' : ''));
      const invitationRespondedAt = (await this.state.storage.get('invitationRespondedAt')) || null;
      const invitationMessage = normalizeInvitationPersonalMessage((await this.state.storage.get('invitationMessage')) || '');
      const invitationResponseMessage = normalizeInvitationPersonalMessage((await this.state.storage.get('invitationResponseMessage')) || '');
      const drawOffer = safeDrawOfferForClient((await this.state.storage.get('drawOffer')) || null);
      const drawOfferByRole = drawOffer && (drawOffer.byRole === 'w' || drawOffer.byRole === 'b') ? drawOffer.byRole : null;
      const drawOfferAt = drawOfferByRole ? (drawOffer.offeredAt || null) : null;

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
      const storedMoves = (await this.state.storage.get('moves')) || [];
      const drawClaims = game && game.started && !game.ended
        ? drawClaimsForStoredPosition(storedMoves, setup, timeControl, game)
        : safeDrawClaimsForClient(null);
      const drawClaimByRole = drawClaims && (drawClaims.threefold || drawClaims.fiftyMove) && (drawClaims.claimantRole === 'w' || drawClaims.claimantRole === 'b')
        ? drawClaims.claimantRole
        : null;
      const drawClaimThreefold = drawClaimByRole && drawClaims.threefold ? 1 : 0;
      const drawClaimFiftyMove = drawClaimByRole && drawClaims.fiftyMove ? 1 : 0;
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
           invited_user_id, invited_name, invitation_status, invitation_responded_at,
           invitation_message, invitation_response_message,
           time_label, days_per_move, variant, started, started_at, updated_at,
           turn, deadline_at, ended, ended_at, result, end_reason, draw_offer_by_role, draw_offer_at,
           draw_claim_by_role, draw_claim_threefold, draw_claim_fifty_move, rated
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(room_id) DO UPDATE SET
           white_user_id = excluded.white_user_id,
           black_user_id = excluded.black_user_id,
           white_name = excluded.white_name,
           black_name = excluded.black_name,
           invited_user_id = excluded.invited_user_id,
           invited_name = excluded.invited_name,
           invitation_status = excluded.invitation_status,
           invitation_responded_at = excluded.invitation_responded_at,
           invitation_message = excluded.invitation_message,
           invitation_response_message = excluded.invitation_response_message,
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
           draw_offer_by_role = excluded.draw_offer_by_role,
           draw_offer_at = excluded.draw_offer_at,
           draw_claim_by_role = excluded.draw_claim_by_role,
           draw_claim_threefold = excluded.draw_claim_threefold,
           draw_claim_fifty_move = excluded.draw_claim_fifty_move,
           rated = excluded.rated`
      ).bind(
        roomId, whiteUserId || null, blackUserId || null, whiteName, blackName,
        invitedUserId || null, invitedName || null, invitationStatus || null, invitationRespondedAt,
        invitationMessage || null, invitationResponseMessage || null,
        timeControl.label, timeControl.daysPerMove, setup.variant,
        game.started ? 1 : 0, game.startedAt || null, new Date(now).toISOString(),
        clock && (clock.turn === 'w' || clock.turn === 'b') ? clock.turn : null, deadlineAt,
        game.ended ? 1 : 0, game.endedAt || null, game.result || '*', game.endReason || null, drawOfferByRole, drawOfferAt,
        drawClaimByRole, drawClaimThreefold, drawClaimFiftyMove, ratedForIndex ? 1 : 0
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
      if ((cancellation && cancellation.cancelled) || !isPublic || !game.started) {
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
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
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
           ended = excluded.ended`
      ).bind(
        roomId, spectatorId, whiteUserId || null, blackUserId || null, whiteName, blackName,
        timeControl.mode === 'daily' ? 'daily' : 'live', timeControl.label || '',
        timeControl.mode === 'daily' ? Math.max(1, Number(timeControl.daysPerMove || 1)) : null,
        setup.variant, setup.variant === GAME_VARIANT_FREESTYLE ? setup.positionId : null,
        game.startedAt || updatedAt, updatedAt, turn, moves.length,
        lastMove && lastMove.san ? String(lastMove.san).slice(0, 24) : null,
        game.ended ? 1 : 0
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
      const ratingType = ratingTypeFromGame(timeControl, setup);
      const isPublic = (await this.state.storage.get('publicGame')) === true;
      const spectatorId = isPublic ? cleanPublicWatchId((await this.state.storage.get('publicWatchId')) || '') : '';
      const tournamentId = tournamentMeta && tournamentMeta.tournamentId ? String(tournamentMeta.tournamentId).slice(0, 128) : '';
      const tournamentName = tournamentMeta && tournamentMeta.tournamentName ? cleanTournamentName(tournamentMeta.tournamentName) : '';
      const tournamentRoundLabel = tournamentMeta && tournamentMeta.roundLabel ? String(tournamentMeta.roundLabel).slice(0, 80) : '';
      const updatedAt = new Date().toISOString();

      await this.env.DB.prepare(
        `INSERT INTO completed_games (
           room_id, white_user_id, black_user_id, white_name, black_name,
           mode, time_label, days_per_move, variant, position_id, back_rank,
           started_at, ended_at, result, end_reason, rated, rating_type,
           public_game, spectator_id, tournament_id, tournament_name, tournament_round_label,
           protected, archive_visible, pgn, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
           rating_type = excluded.rating_type,
           public_game = excluded.public_game,
           spectator_id = excluded.spectator_id,
           tournament_id = excluded.tournament_id,
           tournament_name = excluded.tournament_name,
           tournament_round_label = excluded.tournament_round_label,
           protected = excluded.protected,
           archive_visible = excluded.archive_visible,
           pgn = excluded.pgn,
           updated_at = excluded.updated_at`
      ).bind(
        roomId, whiteUserId || null, blackUserId || null, whiteName, blackName,
        mode, timeControl && timeControl.label ? timeControl.label : (mode === 'daily' ? 'Daily Chess' : 'Live'),
        mode === 'daily' ? Math.max(1, Number(timeControl && timeControl.daysPerMove || 1)) : null,
        setup.variant, setup.variant === GAME_VARIANT_FREESTYLE ? setup.positionId : null,
        setup.variant === GAME_VARIANT_FREESTYLE ? setup.backRank : null,
        game.startedAt || null, game.endedAt || updatedAt, game.result || '*', game.endReason || null,
        rated ? 1 : 0, ratingType || null,
        isPublic ? 1 : 0, spectatorId || null, tournamentId || null, tournamentName || null, tournamentRoundLabel || null,
        tournamentId ? 1 : 0, 1, pgn, updatedAt
      ).run();

      try {
        await upsertChessChronicleGame(this.env, {
          roomId,
          whiteUserId:whiteUserId || null,
          blackUserId:blackUserId || null,
          whiteName,
          blackName,
          mode,
          timeLabel:timeControl && timeControl.label ? timeControl.label : (mode === 'daily' ? 'Daily Chess' : 'Live'),
          daysPerMove:mode === 'daily' ? Math.max(1, Number(timeControl && timeControl.daysPerMove || 1)) : null,
          variant:setup.variant,
          positionId:setup.variant === GAME_VARIANT_FREESTYLE ? setup.positionId : null,
          startedAt:game.startedAt || null,
          endedAt:game.endedAt || updatedAt,
          result:game.result || '*',
          endReason:game.endReason || null,
          rated,
          ratingType:ratingType || null,
          tournamentId:tournamentId || null,
          tournamentName:tournamentName || null,
          tournamentRoundLabel:tournamentRoundLabel || null,
          pgn
        });
      } catch (_) {
        // Die Chronik ist bewusst eine Zusatzschicht und darf den Partieabschluss nie blockieren.
      }

      if (await ensureFairplayGameDataTable(this.env)) {
        const fairplayMoves = buildFairplayMoveArchive(moves, game);
        const fairplayCreatedAt = game.endedAt || updatedAt;
        await this.env.DB.prepare(
          `INSERT INTO fairplay_game_data (
             room_id, data_version, move_count, moves_json,
             started_at, ended_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(room_id) DO UPDATE SET
             data_version = excluded.data_version,
             move_count = excluded.move_count,
             moves_json = excluded.moves_json,
             started_at = excluded.started_at,
             ended_at = excluded.ended_at,
             updated_at = excluded.updated_at`
        ).bind(
          roomId,
          FAIRPLAY_RAW_DATA_VERSION,
          fairplayMoves.length,
          JSON.stringify(fairplayMoves),
          game.startedAt || null,
          game.endedAt || updatedAt,
          fairplayCreatedAt,
          updatedAt
        ).run();
      }
      this.headToHeadCache.clear();
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

  async refreshTimedGameState(now = Date.now(), options = {}) {
    const stored = options.stored && typeof options.stored.get === 'function'
      ? options.stored
      : await this.state.storage.get(['game','clock','moves','gameSetup','timeControl']);
    let game = stored.get('game') || { started: false, ended: false, result: '*' };
    let clock = stored.get('clock') || null;
    if (!clock) return { game, clock: null, justEnded: false };

    const advanced = advanceClock(clock, now);
    const clockChanged = !!(advanced && JSON.stringify(advanced) !== JSON.stringify(clock));
    if (clockChanged) {
      clock = advanced;
      const willFinalizeByTime = !!(game.started && !game.ended && clock.timeLost);
      if (options.persistClock !== false && !willFinalizeByTime) await this.state.storage.put('clock', clock);
    } else {
      clock = advanced || clock;
    }

    let justEnded = false;
    if (game.started && !game.ended && clock && clock.timeLost) {
      let winner = clock.winner === 'w' || clock.winner === 'b' ? clock.winner : null;
      let endReason = 'time';
      if (winner) {
        try {
          const moves = stored.has('moves') ? (stored.get('moves') || []) : ((await this.state.storage.get('moves')) || []);
          const setup = stored.has('gameSetup') ? stored.get('gameSetup') : await this.state.storage.get('gameSetup');
          const position = buildServerHistoryState(moves, setup).game;
          if (!position.canSidePossiblyMate(winner)) {
            winner = null;
            endReason = 'time_insufficient_material';
            clock.winner = null;
          }
        } catch (_) {
          // Bei beschädigter Historie wird die bereits festgestellte Zeitüberschreitung nicht verschluckt.
        }
      }
      game = finishGameState(game, endReason, winner, now);
      game.result = winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2';
      await this.state.storage.put({game,clock});
      await this.state.storage.delete('drawOffer');
      await this.state.storage.delete('conditionalMoves');
      justEnded = true;
      await this.finalizeRatingIfNeeded(game);
      await this.syncGameIndexes();
      this.queueDailyResultNotifications(game);
    }

    if (game.ended || !clock.running || clock.timeLost) {
      try { await this.state.storage.deleteAlarm(); } catch (_) {}
    } else if (options.rescheduleAlarm !== false) {
      await this.scheduleClockAlarm(clock, now);
    }
    return { game, clock, justEnded };
  }

  async autoStartDailyGameIfReady(startedByRole = 'automatic', allowTournamentLive = false) {
    const cancellation = await this.state.storage.get('cancelled');
    if (cancellation && cancellation.cancelled) return { started:false, reason:'cancelled' };
    const timeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
    const tournamentMeta = (await this.state.storage.get('tournamentMeta')) || null;
    const tournamentLive = !!(allowTournamentLive && tournamentMeta && tournamentMeta.tournamentId && timeControl && timeControl.mode === 'live');
    if (!timeControl || (timeControl.mode !== 'daily' && !tournamentLive)) return { started:false, reason:'not_automatic' };

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

    // Eine gezielte Daily-Einladung darf nie allein durch das Öffnen eines
    // Raumlinks starten. Erst die ausdrückliche Annahme unter „Meine Partien“
    // gibt den automatischen Partiestart frei.
    if (timeControl.mode === 'daily') {
      const invitedUserId = String((await this.state.storage.get('invitedUserId')) || '');
      const invitationStatus = String((await this.state.storage.get('invitationStatus')) || '');
      if (invitedUserId && invitationStatus !== 'accepted') {
        return { started:false, reason:'invitation_not_accepted' };
      }
      if (invitedUserId) {
        const seatedUserIds = [players.white && players.white.userId, players.black && players.black.userId].map(value => String(value || ''));
        if (!seatedUserIds.includes(invitedUserId)) return { started:false, reason:'invited_account_missing' };
      }
    }

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
    const initialTurn = gameTurnForSetup(gameSetup);
    const clock = makeInitialClock(timeControl, now, initialTurn);

    await this.state.storage.put('gameSetup', gameSetup);
    await this.state.storage.put('game', game);
    await this.state.storage.delete('ratingResult');
    this.ratingStateCache = { key:'', expiresAt:0, value:null };
    await this.state.storage.put('moves', []);
    await this.state.storage.put('clock', clock);
    await this.state.storage.delete('drawOffer');
    await this.state.storage.delete('conditionalMoves');
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

    if (tournamentMeta && tournamentMeta.tournamentId) {
      // Beide Spieler erhalten außerhalb des Spielraums genau eine gemeinsame
      // Turnierstart-Mail. Dadurch bekommt der Anziehende nicht zusätzlich
      // sofort noch eine zweite „Du bist am Zug“-Nachricht.
    } else if (timeControl.mode !== 'daily') {
      // Live-Turnierpartien werden zeitgleich serverseitig eröffnet. Die Spieler
      // übernehmen ihren bereits accountgebundenen Platz beim automatischen Laden.
    } else if (acceptedOpenOffer) {
      // Der Anbieter erhält genau eine Annahmebestätigung. Ist er zugleich am Zug,
      // enthält dieselbe Mail zugleich den Hinweis „Du bist am Zug“, damit
      // nicht unmittelbar zwei Nachrichten für denselben Partiestart eintreffen.
      this.queueDailyOpenOfferAcceptedNotification(clock);
      if (creatorRole !== initialTurn) this.queueDailyTurnNotification(initialTurn, null, clock);
    } else {
      this.queueDailyTurnNotification(initialTurn, null, clock);
    }

    return { started:true, reason:'auto_started', game, clock, timeControl, gameSetup };
  }

  async alarm() {
    const schedule = await this.state.storage.get('tournamentScheduleMeta');
    if (schedule && schedule.tournamentId) {
      try {
        if (schedule.action === 'end') {
          await closeArenaTournamentIfDue(this.env, String(schedule.tournamentId));
          await this.state.storage.delete('tournamentScheduleMeta');
          return;
        }
        const outcome = await autoStartScheduledTournament(this.env, String(schedule.tournamentId));
        if (outcome.retry) {
          await this.state.storage.setAlarm(Date.now() + 60000);
          return;
        }
        if ((outcome.started || outcome.reason === 'already_running') && outcome.arenaEndsAt) {
          const endAt = Date.parse(outcome.arenaEndsAt);
          await this.state.storage.put('tournamentScheduleMeta', {tournamentId:String(schedule.tournamentId), scheduledAt:outcome.arenaEndsAt, action:'end'});
          await this.state.storage.setAlarm(Math.max(Date.now() + 25, endAt));
          if (outcome.started) await pairArenaPlayers(this.env, String(schedule.tournamentId));
          return;
        }
        await this.state.storage.delete('tournamentScheduleMeta');
        return;
      } catch (error) {
        console.error('Tournament scheduler alarm failed', error && error.message ? error.message : String(error || 'unknown'));
        await this.state.storage.setAlarm(Date.now() + 60000);
        return;
      }
    }
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
    const storedMoves = (await this.state.storage.get('moves')) || [];
    const moves = storedMoves.map(safeMoveForClient);
    const storedConditionalMoves = (await this.state.storage.get('conditionalMoves')) || {};
    const conditionalMove = info.role === 'w' || info.role === 'b'
      ? safeConditionalMoveForClient(storedConditionalMoves[info.role])
      : null;
    const drawOffer = safeDrawOfferForClient((await this.state.storage.get('drawOffer')) || null);
    const drawClaims = timed.game && timed.game.started && !timed.game.ended
      ? drawClaimsForStoredPosition(storedMoves, storedGameSetup, storedTimeControl, timed.game)
      : safeDrawClaimsForClient(null);
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
    const tournamentMeta = (await this.state.storage.get('tournamentMeta')) || null;
    if (timed.game && timed.game.ended) await this.finalizeRatingIfNeeded(timed.game);
    const rating = await this.buildRatingState(timed.game || null, storedTimeControl, storedGameSetup);
    const headToHead = await this.headToHeadStateFor(info, players, storedTimeControl, storedGameSetup);
    const rematch = await this.rematchStateFor(info, players, timed.game || null, tournamentMeta);
    const roomId = cleanRoomId(info.room || (await this.state.storage.get('roomId')) || '');
    let gameReactions = null;
    let gameMoment = null;
    if (timed.game && timed.game.ended) {
      try {
        gameReactions = await loadGameReactionState(
          this.env,
          roomId,
          info.userId || '',
          players.white && players.white.userId,
          players.black && players.black.userId
        );
      } catch (_) {
        // Eine vorübergehend nicht erreichbare Reaktionstabelle darf den beendeten Spielraum nicht blockieren.
        gameReactions = null;
      }
      try {
        gameMoment = await loadGameMomentState(
          this.env,
          roomId,
          info.userId || '',
          players.white && players.white.userId,
          players.black && players.black.userId
        );
      } catch (_) {
        // Ein persönlicher Moment darf den beendeten Spielraum niemals blockieren.
        gameMoment = null;
      }
    }

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
      headToHead,
      rematch,
      gameReactions,
      gameMoment,
      moves,
      conditionalMove,
      drawOffer,
      drawClaims,
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

  async broadcastRoomState(type = 'room_state', excludeWs = null) {
    for (const ws of this.state.getWebSockets()) {
      if (excludeWs && ws === excludeWs) continue;
      await this.sendRoomState(ws, type);
    }
  }

  broadcastMove(move, messageId = null, clock = null, game = null, drawOffer = null, drawClaims = null, excludeWs = null, serverProcessingMs = null) {
    const now = Date.now();
    const publicMove = safeMoveForClient(move);
    const publicGame = safeGameForClient(game);
    const publicDrawOffer = safeDrawOfferForClient(drawOffer);
    const publicDrawClaims = safeDrawClaimsForClient(drawClaims);
    const publicClock = clockPayload(clock, now);
    for (const ws of this.state.getWebSockets()) {
      if (excludeWs && ws === excludeWs) continue;
      const info = ws.deserializeAttachment() || {};
      safeSend(ws, {
        type: 'move',
        ok: true,
        messageId,
        room: info.room || 'unknown',
        role: info.role || 'spectator',
        move: publicMove,
        game: publicGame,
        drawOffer: publicDrawOffer,
        drawClaims: publicDrawClaims,
        clock: publicClock,
        serverProcessingMs,
        serverNow: now
      });
    }
  }

  sendConditionalMoveState(role, conditionalMove = null, extra = {}, excludeWs = null) {
    if (role !== 'w' && role !== 'b') return;
    for (const ws of this.state.getWebSockets()) {
      if (excludeWs && ws === excludeWs) continue;
      const info = ws.deserializeAttachment() || {};
      if (info.role !== role) continue;
      safeSend(ws, Object.assign({
        type:'conditional_move_state',
        ok:true,
        conditionalMove:safeConditionalMoveForClient(conditionalMove),
        serverNow:Date.now()
      }, extra || {}));
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

    if (data.type === 'ping' && info.seatClaimed) {
      safeSend(ws, {
        type:'pong',
        clientTs:Number.isFinite(Number(data.clientTs)) ? Number(data.clientTs) : null,
        serverNow:Date.now()
      });
      return;
    }

    /*
      Ein aktiver Spielerzug kann nicht mehr zu einer offenen Einladung gehören:
      Beim Zurückziehen werden alle Attachments auf "revoked" gesetzt und die
      Sockets geschlossen. Dadurch entfällt im Zug-Hotpath ein weiterer Read.
    */
    const activePlayerMove = data.type === 'move'
      && info.seatClaimed
      && (info.role === 'w' || info.role === 'b');
    const cancellation = activePlayerMove
      ? null
      : await this.state.storage.get('cancelled');
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
        if (!publicGame || !publicGameState.started || !watchAuthorized) {
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
        await this.broadcastRoomState('lobby', ws);
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
        message: claimed.denied ? (claimed.message || 'Der bisherige Spielerplatz konnte ohne gültiges Sitzplatz-Token nicht übernommen werden.') : '',
        serverNow: Date.now()
      });
      await this.sendRoomState(ws, 'hello_state');
      if (!dailyAutoStart.started) await this.syncGameIndexes();
      await this.broadcastRoomState(dailyAutoStart.started ? 'game_started' : 'lobby', ws);
      return;
    }

    if (!info.seatClaimed) {
      safeSend(ws, { type: 'error', code: 'SEAT_CLAIM_REQUIRED', message: 'Bitte zuerst den Spielerplatz sicher bestätigen.' });
      return;
    }

    const role = info.role || 'spectator';

    if (data.type === 'request_state') {
      await this.sendRoomState(ws, 'room_state');
      return;
    }

    if (data.type === 'request_rematch') {
      let result;
      try { result = await this.requestRematch(info); }
      catch (_) { result = {ok:false, code:'REMATCH_REQUEST_FAILED', message:'Die Revanche konnte momentan nicht angefragt werden.'}; }
      if (!result.ok) {
        safeSend(ws, {type:'error', code:result.code || 'REMATCH_REQUEST_FAILED', message:result.message || 'Die Revanche konnte nicht angefragt werden.'});
        return;
      }
      await this.broadcastRoomState('rematch_state');
      return;
    }

    if (data.type === 'respond_rematch') {
      const accepted = data.accepted === true || data.accept === true || data.response === 'accept';
      let result;
      try { result = await this.respondToRematch(info, accepted); }
      catch (_) { result = {ok:false, code:'REMATCH_RESPONSE_FAILED', message:'Die Revanche konnte momentan nicht beantwortet werden.'}; }
      if (!result.ok) {
        safeSend(ws, {type:'error', code:result.code || 'REMATCH_RESPONSE_FAILED', message:result.message || 'Die Revanche konnte nicht beantwortet werden.'});
        return;
      }
      await this.broadcastRoomState('rematch_state');
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
      await this.state.storage.delete('conditionalMoves');
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
      await this.state.storage.delete('conditionalMoves');
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
      const clock = makeInitialClock(timeControl, now, gameTurnForSetup(gameSetup));
      await this.state.storage.put('gameSetup', gameSetup);
      await this.state.storage.put('game', game);
      await this.state.storage.delete('ratingResult');
      this.ratingStateCache = { key:'', expiresAt:0, value:null };
      await this.state.storage.put('moves', []);
      await this.state.storage.put('clock', clock);
      await this.state.storage.delete('drawOffer');
      await this.state.storage.delete('conditionalMoves');
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

      const drawTimeControl = cleanTimeControl((await this.state.storage.get('timeControl')) || null);
      const drawMoves = (await this.state.storage.get('moves')) || [];
      if (drawTimeControl && drawTimeControl.mode === 'daily') {
        safeSend(ws, {
          type: 'error',
          code: 'DAILY_DRAW_OFFER_WITH_MOVE_REQUIRED',
          message: 'Bei Daily Chess wird ein Remisangebot zusammen mit dem eigenen Zug gesendet.'
        });
        await this.sendRoomState(ws, 'room_state');
        return;
      }
      if (drawMoves.length < 2) {
        safeSend(ws, {
          type:'error',
          code:'DRAW_AGREEMENT_TOO_EARLY',
          message:'Ein Remis durch Vereinbarung ist erst möglich, nachdem beide Spieler mindestens einen Zug gemacht haben.'
        });
        return;
      }
      const drawClock = timedState.clock || (await this.state.storage.get('clock')) || null;
      if (!drawClock || drawClock.turn === role) {
        safeSend(ws, {
          type:'error',
          code:'LIVE_DRAW_OFFER_AFTER_MOVE_ONLY',
          message:'Bei Live-Partien kannst du Remis direkt nach deinem Zug anbieten, solange der Gegner am Zug ist.'
        });
        await this.sendRoomState(ws, 'room_state');
        return;
      }

      const existingOffer = (await this.state.storage.get('drawOffer')) || null;
      if (existingOffer && existingOffer.byRole === role) {
        await this.syncDailyGameIndex();
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
      await this.syncDailyGameIndex();
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
        await this.state.storage.delete('conditionalMoves');
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
        await this.syncDailyGameIndex();
        const clock = timedState.clock || (await this.state.storage.get('clock')) || null;
        if (clock && clock.running && !clock.timeLost) await this.scheduleClockAlarm(clock, now);
        safeSend(ws, { type: 'draw_response', ok: true, action: 'reject', drawOffer: null, serverNow: now });
        await this.broadcastRoomState('draw_response');
        return;
      }

      safeSend(ws, { type: 'error', code: 'INVALID_DRAW_RESPONSE', message: 'Ungültige Antwort auf das Remisangebot.' });
      return;
    }

    if (data.type === 'claim_draw') {
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, {type:'error', code:'NOT_A_PLAYER', message:'Nur Spieler können Remis reklamieren.'});
        return;
      }
      const state = await this.state.storage.get(['game','clock','timeControl','moves','gameSetup']);
      const timed = await this.refreshTimedGameState(Date.now(), {stored:state});
      let game = timed.game || {started:false,ended:false};
      if (!game.started) {
        safeSend(ws, {type:'error', code:'GAME_NOT_STARTED', message:'Die Partie wurde noch nicht gestartet.'});
        return;
      }
      if (game.ended) {
        safeSend(ws, {type:'error', code:'GAME_ALREADY_ENDED', message:'Die Partie ist bereits beendet.'});
        await this.sendRoomState(ws, 'room_state');
        return;
      }
      const timeControl = cleanTimeControl(state.get('timeControl') || null);
      if (!timeControl || timeControl.mode !== 'daily') {
        safeSend(ws, {type:'error', code:'DRAW_CLAIM_DAILY_ONLY', message:'Eine Remisreklamation ist hier nicht nötig; Live-Partien werten Wiederholung und 50-Züge-Regel automatisch aus.'});
        return;
      }
      const moves = state.get('moves') || [];
      const gameSetup = cleanGameSetup(state.get('gameSetup') || (game && game.gameSetup) || null);
      let historyState;
      try {
        historyState = buildServerHistoryState(moves, gameSetup);
      } catch (error) {
        safeSend(ws, {type:'error', code:'SERVER_MOVE_HISTORY_INVALID', message:error && error.message ? error.message : 'Server-Zugliste konnte nicht geprüft werden.'});
        return;
      }
      if (historyState.game.turn !== role || !timed.clock || timed.clock.turn !== role) {
        safeSend(ws, {type:'error', code:'DRAW_CLAIM_NOT_YOUR_TURN', message:'Remis kann nur der Spieler reklamieren, der am Zug ist.'});
        await this.sendRoomState(ws, 'room_state');
        return;
      }
      const claims = drawClaimsFromHistoryState(historyState, timeControl, game);
      const requested = String(data.reason || '').trim().toLowerCase();
      let endReason = '';
      if ((requested === 'threefold_repetition' || !requested) && claims.threefold) endReason = 'threefold_repetition';
      else if ((requested === 'fifty_move_rule' || !requested) && claims.fiftyMove) endReason = 'fifty_move_rule';
      else if (claims.threefold) endReason = 'threefold_repetition';
      else if (claims.fiftyMove) endReason = 'fifty_move_rule';
      if (!endReason) {
        safeSend(ws, {
          type:'error',
          code:'DRAW_CLAIM_NOT_AVAILABLE',
          message:'Die Stellung erfüllt aktuell weder die dreifache Stellungswiederholung noch die 50-Züge-Regel.',
          drawClaims:safeDrawClaimsForClient(claims),
          serverNow:Date.now()
        });
        return;
      }
      const now = Date.now();
      let clock = timed.clock;
      clock.running = false;
      clock.timeLost = false;
      clock.loser = null;
      clock.winner = null;
      clock.lastTs = now;
      clock.updatedAt = now;
      game = finishGameState(game, endReason, null, now);
      game.result = '1/2-1/2';
      await this.state.storage.put({game,clock});
      await this.state.storage.delete('drawOffer');
      await this.state.storage.delete('conditionalMoves');
      try { await this.state.storage.deleteAlarm(); } catch (_) {}
      await this.finalizeRatingIfNeeded(game);
      await this.syncGameIndexes();
      this.queueDailyResultNotifications(game);
      safeSend(ws, {
        type:'draw_claim',
        ok:true,
        reason:endReason,
        game:safeGameForClient(game),
        drawOffer:null,
        drawClaims:safeDrawClaimsForClient(null),
        clock:clockPayload(clock, now),
        serverNow:now
      });
      await this.broadcastRoomState('game_finished');
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
      const nominalWinner = opposite(role);
      let winner = nominalWinner;
      let endReason = 'resignation';
      try {
        const state = await this.state.storage.get(['moves','gameSetup']);
        const position = buildServerHistoryState(state.get('moves') || [], state.get('gameSetup') || (game && game.gameSetup) || null).game;
        if (!position.canSidePossiblyMate(nominalWinner)) {
          winner = null;
          endReason = 'resignation_insufficient_material';
        }
      } catch (_) {
        // Die Aufgabe bleibt gültig; nur die Sonderprüfung auf unmögliches Matt entfällt bei beschädigter Historie.
      }
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
      game = finishGameState(game, endReason, winner, now);
      game.result = winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2';
      await this.state.storage.put('game', game);
      await this.state.storage.delete('drawOffer');
      await this.state.storage.delete('conditionalMoves');
      try { await this.state.storage.deleteAlarm(); } catch (_) {}
      await this.finalizeRatingIfNeeded(game);
      await this.syncGameIndexes();
      this.queueDailyResultNotifications(game);
      safeSend(ws, { type: 'resignation', ok: true, byRole: role, winner, game: safeGameForClient(game), drawOffer: null, drawClaims:safeDrawClaimsForClient(null), clock: clockPayload(clock, now), serverNow: now });
      await this.broadcastRoomState('game_finished');
      return;
    }

    if (data.type === 'set_conditional_move') {
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, {type:'error', code:'CONDITIONAL_PLAYERS_ONLY', message:'Nur die beiden Spieler können bedingte Züge vorbereiten.'});
        return;
      }
      const state = await this.state.storage.get(['game','clock','timeControl','moves','gameSetup','conditionalMoves']);
      const timed = await this.refreshTimedGameState(Date.now(), {stored:state});
      const game = timed.game || {started:false,ended:false};
      const timeControl = cleanTimeControl(state.get('timeControl') || null);
      const moves = state.get('moves') || [];
      if (!game.started || game.ended) {
        safeSend(ws, {type:'error', code:'CONDITIONAL_GAME_UNAVAILABLE', message:'Bedingte Züge sind nur während einer laufenden Partie möglich.'});
        return;
      }
      if (!timeControl || timeControl.mode !== 'daily') {
        safeSend(ws, {type:'error', code:'CONDITIONAL_DAILY_ONLY', message:'Bedingte Züge stehen ausschließlich in Daily-Partien zur Verfügung.'});
        return;
      }
      if (!timed.clock || timed.clock.timeLost || timed.clock.turn === role) {
        safeSend(ws, {type:'error', code:'CONDITIONAL_OPPONENT_TURN_REQUIRED', message:'Eine Bedingung kann nur vorbereitet werden, während der Gegner am Zug ist.'});
        return;
      }
      const requestedBasePlyRaw = Number(data.basePly ?? data.base_ply);
      const requestedBasePly = Number.isFinite(requestedBasePlyRaw) && requestedBasePlyRaw >= 0
        ? Math.floor(requestedBasePlyRaw)
        : -1;
      if (requestedBasePly !== moves.length) {
        safeSend(ws, {type:'error', code:'CONDITIONAL_POSITION_CHANGED', message:'Die Partie hat sich inzwischen verändert. Bitte die Bedingung neu vorbereiten.'});
        await this.sendRoomState(ws,'room_state');
        return;
      }
      const requestedLineRaw = Array.isArray(data.line || data.moves || data.sequence)
        ? (data.line || data.moves || data.sequence)
        : [data.expectedMove || data.expected_move || data.expected, data.replyMove || data.reply_move || data.reply];
      if (requestedLineRaw.length < 2 || requestedLineRaw.length > CONDITIONAL_MOVE_MAX_PLIES || requestedLineRaw.length % 2 !== 0) {
        safeSend(ws, {type:'error', code:'CONDITIONAL_INVALID_LINE', message:'Die Zugfolge muss aus 1 bis 5 Gegnerzügen mit jeweils deiner Antwort bestehen.'});
        return;
      }
      const requestedLine = requestedLineRaw.map(cleanMove);
      if (requestedLine.some(move => !move)) {
        safeSend(ws, {type:'error', code:'CONDITIONAL_INVALID_LINE', message:'Die vorbereitete Zugfolge enthält einen ungültigen Zug.'});
        return;
      }
      const gameSetup = cleanGameSetup(state.get('gameSetup') || (game && game.gameSetup) || null);
      const validatedLine = [];
      let preparedGame = this.validationGameFor(moves,gameSetup);
      let preparedPositionCounts = null;
      try {
        for (let index = 0; index < requestedLine.length; index += 1) {
          const expectedSide = index % 2 === 0 ? opposite(role) : role;
          const validation = validateMoveOnServer(
            index === 0 ? moves : [],
            requestedLine[index],
            gameSetup,
            preparedGame,
            preparedPositionCounts,
            {autoClaimable:false}
          );
          if (!validation.ok || validation.before.turn !== expectedSide) {
            safeSend(ws, {
              type:'error',
              code:index % 2 === 0 ? 'CONDITIONAL_EXPECTED_ILLEGAL' : 'CONDITIONAL_REPLY_ILLEGAL',
              message:index % 2 === 0
                ? 'Ein vorbereiteter Gegnerzug ist in der Zugfolge nicht legal.'
                : 'Eine vorbereitete eigene Antwort ist in der Zugfolge nicht legal.'
            });
            return;
          }
          if (index % 2 === 0 && validation.gameOver) {
            safeSend(ws, {type:'error', code:'CONDITIONAL_EXPECTED_ENDS_GAME', message:'Nach einem vorbereiteten Gegnerzug wäre die Partie bereits beendet; eine Antwort ist dann nicht möglich.'});
            return;
          }
          if (index < requestedLine.length - 1 && validation.gameOver) {
            safeSend(ws, {type:'error', code:'CONDITIONAL_LINE_AFTER_GAME_END', message:'Die Zugfolge kann nach einem Partieende nicht fortgesetzt werden.'});
            return;
          }
          validatedLine.push(conditionalStoredMove(validation.move));
          preparedGame = validation.after;
          preparedPositionCounts = validation.positionCounts;
        }
      } catch (error) {
        safeSend(ws, {type:'error', code:'CONDITIONAL_VALIDATION_FAILED', message:error && error.message ? error.message : 'Die vorbereitete Zugfolge konnte nicht geprüft werden.'});
        return;
      }
      const conditionalMove = {
        basePly:moves.length,
        line:validatedLine,
        expectedMove:validatedLine[0],
        replyMove:validatedLine[1],
        updatedAt:new Date().toISOString()
      };
      const conditionalMoves = state.get('conditionalMoves') && typeof state.get('conditionalMoves') === 'object'
        ? Object.assign({},state.get('conditionalMoves'))
        : {};
      conditionalMoves[role] = conditionalMove;
      await this.state.storage.put('conditionalMoves',conditionalMoves);
      safeSend(ws, {
        type:'conditional_move_ack',
        ok:true,
        messageId:data.messageId || null,
        conditionalMove:safeConditionalMoveForClient(conditionalMove),
        serverNow:Date.now()
      });
      this.sendConditionalMoveState(role, conditionalMove, {saved:true}, ws);
      return;
    }

    if (data.type === 'clear_conditional_move') {
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, {type:'error', code:'CONDITIONAL_PLAYERS_ONLY', message:'Nur die beiden Spieler können bedingte Züge löschen.'});
        return;
      }
      const stored = (await this.state.storage.get('conditionalMoves')) || {};
      const conditionalMoves = stored && typeof stored === 'object' ? Object.assign({},stored) : {};
      delete conditionalMoves[role];
      await this.state.storage.put('conditionalMoves',conditionalMoves);
      safeSend(ws, {
        type:'conditional_move_ack',
        ok:true,
        cleared:true,
        messageId:data.messageId || null,
        conditionalMove:null,
        serverNow:Date.now()
      });
      this.sendConditionalMoveState(role, null, {cleared:true}, ws);
      return;
    }

    if (data.type === 'move') {
      const moveHandlerStartedAt = Date.now();
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type: 'error', code: 'NOT_A_PLAYER', message: 'Nur Spieler können Züge senden.' });
        return;
      }

      const moveState = await this.state.storage.get(['game','clock','timeControl','moves','gameSetup','drawOffer','conditionalMoves']);
      const timedState = await this.refreshTimedGameState(Date.now(), {
        rescheduleAlarm:false,
        persistClock:false,
        stored:moveState
      });
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

      const timeControl = moveState.get('timeControl') || null;
      if (!timeControl) {
        safeSend(ws, { type: 'error', code: 'TIME_CONTROL_REQUIRED', message: 'Keine Bedenkzeit im Raum gespeichert.' });
        return;
      }
      const claimDrawWithMove = timeControl.mode === 'daily' && data.claimDraw === true;

      const moves = moveState.get('moves') || [];
      const offerDrawWithMove = timeControl.mode === 'daily' && data.offerDraw === true && !claimDrawWithMove && moves.length + 1 >= 2;
      if (timeControl.mode === 'daily' && data.offerDraw === true && !claimDrawWithMove && moves.length + 1 < 2) {
        safeSend(ws, {
          type:'error',
          code:'DRAW_AGREEMENT_TOO_EARLY',
          message:'Ein Remisangebot ist erst möglich, nachdem beide Spieler mindestens einen Zug gemacht haben.'
        });
        await this.sendRoomState(ws, 'room_state');
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

      const gameSetup = cleanGameSetup(moveState.get('gameSetup') || (game && game.gameSetup) || null);
      let validation;
      try {
        validation = validateMoveOnServer(moves, incoming, gameSetup, this.validationGameFor(moves, gameSetup), null, {autoClaimable:timeControl.mode !== 'daily'});
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

      if (claimDrawWithMove && !validation.gameOver) {
        const requestedClaim = String(data.claimDrawReason || data.claim_draw_reason || '').trim().toLowerCase();
        const canClaimThreefold = Math.max(0, Number(validation.repetitionCount) || 0) >= 3;
        const canClaimFifty = Math.max(0, Number(validation.after && validation.after.halfmove) || 0) >= 100;
        let claimReason = '';
        if (requestedClaim === 'threefold_repetition' && canClaimThreefold) claimReason = 'threefold_repetition';
        else if (requestedClaim === 'fifty_move_rule' && canClaimFifty) claimReason = 'fifty_move_rule';
        else if (canClaimThreefold) claimReason = 'threefold_repetition';
        else if (canClaimFifty) claimReason = 'fifty_move_rule';
        if (!claimReason) {
          safeSend(ws, {
            type:'error',
            code:'DRAW_CLAIM_MOVE_NOT_AVAILABLE',
            message:'Der angekündigte Zug erzeugt keinen gültigen Anspruch aus dreifacher Stellungswiederholung oder 50-Züge-Regel.'
          });
          await this.sendRoomState(ws, 'room_state');
          return;
        }
        validation.gameOver = {type:claimReason, winner:null, claimedByRole:role, intendedMove:true};
      }

      let clock = timedState.clock || (await this.state.storage.get('clock')) || makeInitialClock(timeControl, Date.parse(game.startedAt) || Date.now(), gameTurnForSetup(gameSetup));
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

      const previousAcceptedAtMs = moves.length
        ? fairplayMoveAcceptedAtMs(moves[moves.length - 1])
        : (() => {
            const parsed = Date.parse(String(game.startedAt || ''));
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
          })();
      const thinkTimeMs = previousAcceptedAtMs !== null ? Math.max(0, now - previousAcceptedAtMs) : null;
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
        serverNow: now,
        _fairplay:{
          version:FAIRPLAY_RAW_DATA_VERSION,
          thinkTimeMs,
          moverClockBeforeMs:Math.max(0, Math.floor(Number(clock[role + 'Ms'] || 0))),
          whiteClockBeforeMs:Math.max(0, Math.floor(Number(clock.wMs || 0))),
          blackClockBeforeMs:Math.max(0, Math.floor(Number(clock.bMs || 0))),
          moverClockAfterMs:null,
          whiteClockAfterMs:null,
          blackClockAfterMs:null
        }
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
      move._fairplay.moverClockAfterMs = Math.max(0, Math.floor(Number(clock[role + 'Ms'] || 0)));
      move._fairplay.whiteClockAfterMs = Math.max(0, Math.floor(Number(clock.wMs || 0)));
      move._fairplay.blackClockAfterMs = Math.max(0, Math.floor(Number(clock.bMs || 0)));

      const shouldIncrementGamesPlayedStat = !game.playStatsCounted;
      if (shouldIncrementGamesPlayedStat) {
        /*
          Die Spielstatistik ist für den Live-Zug nicht kritisch. Wir markieren
          sie zusammen mit dem Zug und aktualisieren D1 erst nach der Verteilung.
        */
        game.playStatsCounted = true;
        game.playStatsCountedAt = new Date(now).toISOString();
      }

      const openDrawOffer = moveState.get('drawOffer') || null;
      let outgoingDrawOffer = openDrawOffer;
      if (validation.gameOver || (openDrawOffer && openDrawOffer.byRole && openDrawOffer.byRole !== role)) {
        outgoingDrawOffer = null;
      }
      if (!validation.gameOver && offerDrawWithMove) {
        outgoingDrawOffer = {
          offered:true,
          byRole:role,
          offeredAt:new Date(now).toISOString(),
          serverNow:now
        };
      }

      moves.push(move);
      const humanClock = Object.assign({},clock);
      const humanGame = Object.assign({},game);
      const humanDrawOffer = outgoingDrawOffer;
      const humanDrawClaims = validation.gameOver
        ? safeDrawClaimsForClient(null)
        : drawClaimsFromHistoryState({game:validation.after, repetitionCount:validation.repetitionCount}, timeControl, humanGame);
      let outgoingDrawClaims = humanDrawClaims;
      const conditionalMoves = moveState.get('conditionalMoves') && typeof moveState.get('conditionalMoves') === 'object'
        ? Object.assign({},moveState.get('conditionalMoves'))
        : {};
      const conditionalOwner = opposite(role);
      const storedConditionalMove = conditionalMoves[conditionalOwner] || null;
      let automaticMove = null;
      let conditionalMoveConsumed = false;
      let remainingConditionalMove = null;
      let finalValidationGame = validation.after;

      /*
        Eine Bedingung gehört immer dem Spieler, der nach dem gerade
        eingegangenen Zug am Zug wäre. Passt der erwartete Gegnerzug, wird
        die eigene Antwort automatisch ausgeführt. Bei längeren Zugfolgen
        bleibt anschließend das nächste Paar aktiv; bei Abweichung verfällt
        nur der noch offene Rest.
      */
      if (storedConditionalMove && timeControl.mode === 'daily') {
        conditionalMoveConsumed = true;
        delete conditionalMoves[conditionalOwner];
        const normalizedConditionalMove = safeConditionalMoveForClient(storedConditionalMove);
        const basePly = normalizedConditionalMove ? normalizedConditionalMove.basePly : -1;
        const expectedMove = normalizedConditionalMove && normalizedConditionalMove.line[0];
        const replyMove = normalizedConditionalMove && normalizedConditionalMove.line[1];
        const exactExpectedMove = basePly === ply - 1 && sameConditionalMove(expectedMove, move);
        if (exactExpectedMove && replyMove && !game.ended && clock.turn === conditionalOwner) {
          let automaticValidation = null;
          try {
            automaticValidation = validateMoveOnServer([], replyMove, gameSetup, validation.after, validation.positionCounts, {autoClaimable:false});
          } catch (_) {
            automaticValidation = null;
          }
          if (automaticValidation && automaticValidation.ok && automaticValidation.before.turn === conditionalOwner) {
            const automaticNow = Date.now();
            clock = advanceClock(clock, automaticNow);
            if (clock && !clock.timeLost && clock.turn === conditionalOwner) {
              automaticMove = {
                ply:ply + 1,
                side:conditionalOwner,
                from:automaticValidation.move.from,
                to:automaticValidation.move.to,
                promotion:automaticValidation.move.promotion || null,
                castle:castleSideCode(automaticValidation.move) || null,
                san:automaticValidation.move.san,
                piece:automaticValidation.move.piece,
                taken:automaticValidation.move.taken,
                messageId:'conditional_' + String(ply + 1) + '_' + String(automaticNow),
                receivedAt:new Date(automaticNow).toISOString(),
                serverNow:automaticNow,
                automatic:true,
                conditional:true,
                _fairplay:{
                  version:FAIRPLAY_RAW_DATA_VERSION,
                  thinkTimeMs:0,
                  conditionalMove:true,
                  moverClockBeforeMs:Math.max(0, Math.floor(Number(clock[conditionalOwner + 'Ms'] || 0))),
                  whiteClockBeforeMs:Math.max(0, Math.floor(Number(clock.wMs || 0))),
                  blackClockBeforeMs:Math.max(0, Math.floor(Number(clock.bMs || 0))),
                  moverClockAfterMs:null,
                  whiteClockAfterMs:null,
                  blackClockAfterMs:null
                }
              };

              if (automaticValidation.gameOver) {
                clock.running = false;
                clock.timeLost = false;
                clock.loser = null;
                clock.winner = automaticValidation.gameOver.winner || null;
                game = finishGameState(game, automaticValidation.gameOver.type, automaticValidation.gameOver.winner || null, automaticNow);
                game.result = resultFromGameOver(automaticValidation.gameOver);
              } else {
                clock[role + 'Ms'] = Math.max(0, Math.floor(Number(timeControl.baseSeconds || 0) * 1000));
                clock.turn = role;
                clock.running = true;
                clock.timeLost = false;
                clock.loser = null;
                clock.winner = null;
              }
              clock.lastTs = automaticNow;
              clock.updatedAt = automaticNow;
              automaticMove._fairplay.moverClockAfterMs = Math.max(0, Math.floor(Number(clock[conditionalOwner + 'Ms'] || 0)));
              automaticMove._fairplay.whiteClockAfterMs = Math.max(0, Math.floor(Number(clock.wMs || 0)));
              automaticMove._fairplay.blackClockAfterMs = Math.max(0, Math.floor(Number(clock.bMs || 0)));
              if (automaticValidation.gameOver || (outgoingDrawOffer && outgoingDrawOffer.byRole && outgoingDrawOffer.byRole !== conditionalOwner)) {
                outgoingDrawOffer = null;
              }
              moves.push(automaticMove);
              finalValidationGame = automaticValidation.after;
              outgoingDrawClaims = automaticValidation.gameOver
                ? safeDrawClaimsForClient(null)
                : drawClaimsFromHistoryState({game:automaticValidation.after, repetitionCount:automaticValidation.repetitionCount}, timeControl, game);

              const remainingLine = normalizedConditionalMove.line.slice(2);
              if (!automaticValidation.gameOver && remainingLine.length >= 2) {
                remainingConditionalMove = {
                  basePly:moves.length,
                  line:remainingLine,
                  expectedMove:remainingLine[0],
                  replyMove:remainingLine[1],
                  updatedAt:new Date(automaticNow).toISOString()
                };
                conditionalMoves[conditionalOwner] = remainingConditionalMove;
              }
            }
          }
        }
      }

      if (game.ended) {
        for (const owner of Object.keys(conditionalMoves)) delete conditionalMoves[owner];
      }
      await this.state.storage.put({
        moves,
        clock,
        game,
        drawOffer:outgoingDrawOffer,
        conditionalMoves
      });
      this.rememberValidationGame(moves, gameSetup, finalValidationGame);

      const updateClockAlarm = async () => {
        if (game.ended) {
          try { await this.state.storage.deleteAlarm(); } catch (_) {}
        } else {
          await this.scheduleClockAlarm(clock, now);
        }
      };
      if (timeControl.mode === 'daily') await updateClockAlarm();

      const serverProcessingMs = Math.max(0, Date.now() - moveHandlerStartedAt);
      safeSend(ws, {
        type: 'move_ack',
        ok: true,
        messageId: data.messageId || incoming.clientMessageId || null,
        move: safeMoveForClient(move),
        game: safeGameForClient(humanGame),
        drawOffer: safeDrawOfferForClient(humanDrawOffer),
        drawClaims: safeDrawClaimsForClient(humanDrawClaims),
        movesCount: ply,
        clock: clockPayload(humanClock, now),
        serverProcessingMs,
        serverNow: now
      });
      this.broadcastMove(move, data.messageId || incoming.clientMessageId || null, humanClock, humanGame, humanDrawOffer, humanDrawClaims, ws, serverProcessingMs);
      if (automaticMove) {
        this.broadcastMove(automaticMove, automaticMove.messageId, clock, game, outgoingDrawOffer, outgoingDrawClaims, null, 0);
      }
      if (conditionalMoveConsumed) {
        this.sendConditionalMoveState(conditionalOwner, remainingConditionalMove, automaticMove
          ? {
              triggered:true,
              message:remainingConditionalMove
                ? 'Dein bedingter Zug wurde automatisch ausgeführt. Die vorbereitete Zugfolge bleibt aktiv.'
                : 'Dein bedingter Zug wurde automatisch ausgeführt.'
            }
          : {expired:true, message:'Der Gegner hat anders gezogen; der noch offene Rest der Bedingung ist verfallen.'});
      }
      if (timeControl.mode !== 'daily') {
        this.runBackgroundTask(updateClockAlarm(), 'Uhrenalarm nach Live-Zug fehlgeschlagen');
      }

      /*
        Erst jetzt folgen Rating, Listen/Turnier-Indizes und Statistik.
        Diese Aufgaben dürfen die Brettfreigabe des Gegners nicht verzögern.
      */
      this.runBackgroundTask((async () => {
        if (game.ended) {
          await this.finalizeRatingIfNeeded(game);
          await this.syncGameIndexes();
          await this.broadcastRoomState('game_finished');
        } else {
          await this.syncGameIndexes();
        }
        if (shouldIncrementGamesPlayedStat) {
          try { await incrementGamerStat(this.env, 'games_played'); } catch (_) {}
        }
      })(), 'Nacharbeiten nach Live-Zug fehlgeschlagen');

      if (game.ended) this.queueDailyResultNotifications(game);
      else if (timeControl.mode === 'daily') this.queueDailyTurnNotification(clock.turn, automaticMove || move, clock);
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
        const stub = gameRoomStub(env, env.GAME_ROOM.idFromString(objectId));
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
            WHERE spectator_id = ? AND public_game = 1
            LIMIT 1`
        ).bind(watchId).first();
        const room = cleanRoomId(indexed && indexed.room_id);
        if (!room) return new Response('Public game not found', { status: 404 });
        const id = env.GAME_ROOM.idFromName(room);
        const stub = gameRoomStub(env, id);
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
      const stub = gameRoomStub(env, id);
      return stub.fetch(request);
    }

    return json({
      ok: true,
      service: 'hammerschach-gamer-lobby',
      endpoints: ['/health', '/api/register', '/api/login', 'POST /api/auth/password-reset/request', 'POST /api/auth/password-reset/confirm', 'POST /api/auth/email-verification/request', 'POST /api/auth/email-verification/confirm', '/api/logout', '/api/me', 'POST /api/account/leitbild', 'POST /api/account/username', 'POST /api/account/profile', 'POST /api/account/email', 'POST /api/account/email/resend', 'POST /api/account/notifications', 'POST /api/account/password', 'DELETE /api/account', '/api/presence', 'GET /api/lobby-ticker', 'GET /api/info-center', 'GET /api/info-center/ID', 'GET /api/info-center/attachments/ID', 'GET /api/tournaments', 'POST /api/tournaments', 'POST /api/tournaments/ID/publish', 'POST /api/tournaments/ID/join', 'DELETE /api/tournaments/ID/join', 'POST /api/tournaments/ID/start', '/api/public-games', 'GET /api/chess-chronicle', '/api/my-live-games', 'POST /api/schachlabor/fairplay-check', '/api/open-offers', 'POST /api/open-offers/ROOM_ID', 'DELETE /api/open-offers/ROOM_ID', '/api/daily-games', 'POST /api/daily-games/ROOM_ID/invitation', '/api/daily-games/ROOM_ID/pgn', 'DELETE /api/daily-games/ROOM_ID/history', 'DELETE /api/daily-games/ROOM_ID', 'POST /api/game-moments/ROOM_ID', 'POST /api/game-reactions/ROOM_ID', '/api/members/search?q=NAME', '/api/members/list', 'GET /api/private-messages', 'POST /api/private-messages', 'POST /api/private-messages/MESSAGE_ID/read', 'GET /api/private-messages/conversation/USER_ID', 'POST /api/private-messages/conversation/USER_ID/read', 'GET /api/members/USER_ID/profile', 'POST /api/members/USER_ID/favorite', 'POST /api/invitations/email', '/api/stats', '/api/stats/visit', 'POST /api/moderation/report', 'POST /api/moderation/global-chat-report', 'GET /api/admin/moderation/reports', 'POST /api/admin/moderation/action', 'POST /api/admin/moderation/resolve', 'GET /api/admin/overview', 'GET /api/admin/fairplay/games', 'GET /api/admin/fairplay/games/ROOM_ID', 'GET /api/admin/lobby-ticker', 'POST /api/admin/lobby-ticker', 'POST /api/admin/lobby-ticker/ID/status', 'DELETE /api/admin/lobby-ticker/ID', 'GET /api/admin/info-center', 'POST /api/admin/info-center', 'DELETE /api/admin/info-center/ID', 'GET /api/admin/member-message/audience', 'GET /api/admin/member-message/recipients', 'POST /api/admin/member-message/test', 'POST /api/admin/member-message/send', 'POST /api/admin/backup-mark', 'GET /api/admin/users', 'DELETE /api/admin/users/USER_ID', '/global-chat', '/ws?room=ROOM_ID', '/watch?game=PUBLIC_WATCH_ID'],
      features: ['lobby', 'lobby_event_ticker', 'automatic_tournament_ticker', 'thematic_tournaments', 'automatic_verified_member_welcome', 'admin_ticker_scheduling', 'lobby_info_center', 'info_center_read_state', 'info_center_r2_attachments', 'info_center_optional_email', 'roles', 'invite_color_choice', 'guest_display_names', 'accounts_d1', 'account_self_service', 'account_leitbild_onboarding', 'member_search', 'member_list', 'member_public_profiles', 'member_presence', 'member_last_activity', 'member_activity_filters', 'member_activity_privacy', 'private_member_favorites', 'daily_opponent_presence', 'in_game_presence', 'admin_user_delete', 'admin_user_delete_reauthentication', 'smtp_email_invitations', 'mailjet_email_fallback', 'personal_invitation_messages', 'daily_invitation_response_messages', 'time_control', 'game_start', 'move_sync', 'server_clock', 'server_move_validation', 'draw_offer', 'resignation', 'direct_rematch', 'private_game_moments', 'private_game_moment_notes', 'personal_chess_chronicle', 'private_post_game_reactions', 'daily_game_start_summary', 'head_to_head_by_rating_pool', 'secure_seat_tokens', 'server_time_finalization', 'durable_object_clock_alarm', 'daily_chess', 'daily_game_list', 'daily_game_history', 'daily_history_archive', 'daily_pgn_download', 'daily_invitation_accept_decline', 'daily_invitation_cancel', 'daily_open_offer_acceptance_email', 'cancelled_room_tombstone', 'registered_account_seat_reclaim', 'member_only_room_creation', 'guest_live_invite_join', 'public_running_games', 'completed_game_archive', 'public_game_archive', 'archive_favorites', 'archive_retention_cron', 'open_game_offers', 'atomic_open_offer_acceptance', 'open_offer_withdrawal', 'runtime_public_visibility_toggle', 'spectator_only_links', 'private_player_chat', 'persistent_room_chat', 'member_global_chat', 'global_chat_presence', 'global_chat_reporting', 'global_chat_admin_delete', 'freestyle960', 'glicko2_ratings', 'six_separate_rating_pools', 'creator_rating_choice', 'provisional_rating_marker', 'verified_email_accounts', 'password_reset_by_email', 'verified_email_change', 'auth_rate_limiting', 'constant_time_login', 'auth_security_event_log', 'admin_system_overview', 'mail_delivery_log', 'admin_member_messages', 'admin_personal_member_messages', 'member_news_opt_in', 'branded_html_mail', 'admin_mail_attachments', 'manual_backup_marker', 'player_reporting', 'local_chat_mute', 'admin_moderation', 'chat_blocking', 'temporary_account_suspension', 'permanent_account_ban', 'fairplay_timing_archive', 'fairplay_admin_read'],
      note: 'Diese Stufe erlaubt neue Spielräume nur für eingeloggte Mitglieder, lässt eingeladene Gäste bei Live-Partien weiterhin zu, bietet eine öffentliche Liste freigegebener Live- und Daily-Partien mit abgesichertem Zuschauerzugang und synchronisiert Lobby, Rollen, Gast-/Account-Anzeigenamen, Mitgliedersuche, Mitgliederliste mit freiwilligen Mitgliederprofilen und Online-Status, Daily-Partienübersicht, persönliche Accountverwaltung, sechs getrennte Glicko-2-Ratings, kennwortbestätigte Admin-Userlöschung, automatisch versendete SMTP-Einladungen über das Gamer-Postfach, bestätigte Mailadressen, sichere Kennwort-Wiederherstellung, gestuftes Rate-Limiting und protokollierte Sicherheitsereignisse, Bedenkzeit, Partiestart, Züge, eine servergeführte Uhr, einen dauerhaft gespeicherten Raum-Chat, einen moderierten Mitglieder-Global-Chat und prüft Züge serverseitig auf Legalität.'
    });
  },

  async scheduled(_event, env, ctx) {
    const maintenance = (async () => {
      try {
        await backfillChessChronicleMetadata(env);
        await backfillChessChronicleOpenings(env, 500);
      } catch (error) {
        console.error('Scheduled chess chronicle sync failed', error && error.message ? error.message : String(error || 'unknown'));
      }
      await runGameArchiveMaintenance(env);
    })().catch(error => {
      console.error('Scheduled game archive maintenance failed', error && error.message ? error.message : String(error || 'unknown'));
    });
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(maintenance);
    else await maintenance;
  }
};

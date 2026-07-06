function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
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

function guestNameFromPlayerId(playerId) {
  const compact = String(playerId || '').replace(/[^A-Za-z0-9]/g, '');
  const suffix = (compact.slice(-4) || crypto.randomUUID().replace(/[^A-Za-z0-9]/g, '').slice(0, 4)).toUpperCase();
  return 'Gast-' + suffix;
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

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    createdAt: row.created_at || row.createdAt || null
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

async function searchMembers(env, sessionUser, query) {
  const cleaned = cleanMemberSearchQuery(query);
  if (!env || !env.DB || !sessionUser || cleaned.length < 2) return [];

  const escaped = escapeSqlLike(cleaned);
  const contains = '%' + escaped + '%';
  const prefix = escaped + '%';
  const result = await env.DB.prepare(
    `SELECT id, username, created_at
       FROM users
      WHERE id <> ?
        AND (username_lc LIKE ? ESCAPE '\\' OR email_lc LIKE ? ESCAPE '\\')
      ORDER BY
        CASE
          WHEN username_lc = ? THEN 0
          WHEN username_lc LIKE ? ESCAPE '\\' THEN 1
          ELSE 2
        END,
        username_lc ASC
      LIMIT 8`
  ).bind(sessionUser.id, contains, contains, cleaned, prefix).all();

  return (result && result.results ? result.results : []).map(row => ({
    id: row.id,
    username: row.username,
    createdAt: row.created_at || null
  }));
}


function cleanUserId(value) {
  const id = String(value || '').trim().slice(0, 80);
  return /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanInviteUrl(value, expectedRoom) {
  const raw = String(value || '').trim().slice(0, 2000);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    const room = cleanRoomId(parsed.searchParams.get('room'));
    if (!room) return '';
    if (expectedRoom && room !== expectedRoom) return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function invitationFromAddress(env) {
  return String(
    (env && (env.INVITE_FROM_EMAIL || env.RESEND_FROM_EMAIL)) ||
    'Hammerschach <einladung@mail.andili.de>'
  ).trim();
}

function buildInvitationSubject() {
  return 'Einladung zu einer Partie auf Hammerschach';
}

function buildInvitationText(senderName, recipientName, inviteUrl) {
  return 'Hallo ' + recipientName + ',\n\n' +
    'du wurdest von ' + senderName + ' zu einer Schachpartie auf Hammerschach eingeladen.\n\n' +
    'Klicke einfach auf folgenden Link:\n\n' +
    inviteUrl + '\n\n' +
    'Viele Grüße\n' +
    senderName;
}

function buildInvitationHtml(senderName, recipientName, inviteUrl) {
  const sender = escapeHtml(senderName);
  const recipient = escapeHtml(recipientName);
  const link = escapeHtml(inviteUrl);
  return '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111">' +
    '<p>Hallo ' + recipient + ',</p>' +
    '<p>du wurdest von ' + sender + ' zu einer Schachpartie auf Hammerschach eingeladen.</p>' +
    '<p>Klicke einfach auf folgenden Link:</p>' +
    '<p><a href="' + link + '">' + link + '</a></p>' +
    '<p>Viele Grüße<br>' + sender + '</p>' +
    '</div>';
}

async function sendViaResend(env, payload, idempotencyKey) {
  const apiKey = String((env && env.RESEND_API_KEY) || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      code: 'RESEND_NOT_CONFIGURED',
      message: 'Mailversand ist noch nicht konfiguriert. Bitte RESEND_API_KEY als Worker-Secret hinterlegen.'
    };
  }

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer ' + apiKey,
        'content-type': 'application/json; charset=utf-8',
        'idempotency-key': idempotencyKey || crypto.randomUUID()
      },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    return {
      ok: false,
      status: 502,
      code: 'RESEND_UNREACHABLE',
      message: 'Resend konnte vom Worker aus nicht erreicht werden.'
    };
  }

  let data = null;
  try { data = await response.json(); } catch (_) { data = null; }

  if (!response.ok) {
    const providerMessage = data && (data.message || (data.error && data.error.message) || data.name) ? String(data.message || (data.error && data.error.message) || data.name) : '';
    return {
      ok: false,
      status: 502,
      providerStatus: response.status,
      code: 'RESEND_SEND_FAILED',
      message: providerMessage ? ('Einladung konnte nicht verschickt werden: ' + providerMessage) : 'Einladung konnte nicht verschickt werden.'
    };
  }

  return { ok: true, data };
}

async function sendInvitationEmail(env, senderUser, recipientUser, inviteUrl, room) {
  const senderName = cleanDisplayName(senderUser && senderUser.username) || 'Hammerschach-Spieler';
  const recipientName = cleanDisplayName(recipientUser && recipientUser.username) || 'Mitglied';
  const recipientEmail = normalizeEmail(recipientUser && recipientUser.email);
  if (!recipientEmail) {
    return { ok: false, status: 400, code: 'RECIPIENT_EMAIL_INVALID', message: 'Für dieses Mitglied ist keine gültige Mailadresse gespeichert.' };
  }

  const subject = buildInvitationSubject();
  const text = buildInvitationText(senderName, recipientName, inviteUrl);
  const html = buildInvitationHtml(senderName, recipientName, inviteUrl);
  const idempotencyKey = 'invite-' + String(senderUser.id || '').slice(0, 24) + '-' + String(recipientUser.id || '').slice(0, 24) + '-' + String(room || '').slice(0, 32);

  const result = await sendViaResend(env, {
    from: invitationFromAddress(env),
    to: [recipientEmail],
    subject,
    text,
    html,
    tags: [
      { name: 'app', value: 'hammerschach' },
      { name: 'type', value: 'game_invite' }
    ]
  }, idempotencyKey);

  if (!result.ok) return result;
  return {
    ok: true,
    message: 'Einladung an ' + recipientName + ' wurde verschickt.',
    providerId: result.data && result.data.id ? result.data.id : null
  };
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
    `SELECT s.id AS session_id, s.expires_at, u.id, u.username, u.username_lc, u.email, u.email_lc, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
      LIMIT 1`
  ).bind(tokenHash, nowIso).first();
  return row ? { sessionId: row.session_id, user: publicUser(row) } : null;
}

async function handleAuthApi(request, env, url) {
  if (!env || !env.DB) return dbMissingResponse();

  if (url.pathname === '/api/me' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Nicht angemeldet.' }, { status: 401 });
    return json({ ok: true, user: session.user });
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
    return json({ ok: true, sessionToken: token, user: { id, username, email, createdAt: nowIso } });
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

    const token = await createSession(env, user.id);
    return json({ ok: true, sessionToken: token, user: publicUser(user) });
  }

  if (url.pathname === '/api/members/search' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Mitgliedersuche ist nur nach Login verfügbar.' }, { status: 401 });

    const query = cleanMemberSearchQuery(url.searchParams.get('q') || url.searchParams.get('query') || '');
    const users = await searchMembers(env, session.user, query);
    return json({ ok: true, query, users });
  }

  if (url.pathname === '/api/invitations/send' && request.method === 'POST') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ ok: false, code: 'NOT_AUTHENTICATED', message: 'Einladungen können nur von eingeloggten Mitgliedern verschickt werden.' }, { status: 401 });

    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, code: 'BAD_JSON', message: 'Einladungsdaten konnten nicht gelesen werden.' }, { status: 400 });

    const recipientUserId = cleanUserId(body.recipientUserId || body.userId || body.recipientId);
    const room = cleanRoomId(body.room || body.roomId);
    const inviteUrl = cleanInviteUrl(body.inviteUrl || body.url || body.link, room);

    if (!recipientUserId) return json({ ok: false, code: 'RECIPIENT_REQUIRED', message: 'Bitte ein Mitglied auswählen.' }, { status: 400 });
    if (!room || !inviteUrl) return json({ ok: false, code: 'INVITE_LINK_INVALID', message: 'Der Einladungslink ist ungültig oder enthält keinen gültigen Raum.' }, { status: 400 });
    if (recipientUserId === session.user.id) return json({ ok: false, code: 'SELF_INVITE', message: 'Du kannst keine Einladung an deinen eigenen Account senden.' }, { status: 400 });

    const recipient = await env.DB.prepare(
      `SELECT id, username, email, email_lc, created_at FROM users WHERE id = ? LIMIT 1`
    ).bind(recipientUserId).first();
    if (!recipient) return json({ ok: false, code: 'RECIPIENT_NOT_FOUND', message: 'Dieses Mitglied wurde nicht gefunden.' }, { status: 404 });

    const result = await sendInvitationEmail(env, session.user, recipient, inviteUrl, room);
    if (!result.ok) return json({ ok: false, code: result.code || 'INVITATION_SEND_FAILED', message: result.message || 'Einladung konnte nicht verschickt werden.', providerStatus: result.providerStatus || undefined }, { status: result.status || 502 });

    return json({
      ok: true,
      message: result.message,
      recipient: { id: recipient.id, username: recipient.username },
      providerId: result.providerId || null
    });
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

function ChessGame() {
  this.reset();
}

ChessGame.prototype.reset = function() {
  this.board = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
  ];
  this.turn = 'w';
  this.ep = null;
  this.castling = { K:true, Q:true, k:true, q:true };
  this.halfmove = 0;
  this.fullmove = 1;
};

ChessGame.prototype.clone = function() {
  const g = new ChessGame();
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
    if (color === 'w' && x === 4 && y === 7) {
      if (this.castling.K && this.at(7,7) === 'R' && this.at(5,7) === '.' && this.at(6,7) === '.') moves.push({ from:[x,y], to:[6,7], meta:{ castle:'K' } });
      if (this.castling.Q && this.at(0,7) === 'R' && this.at(1,7) === '.' && this.at(2,7) === '.' && this.at(3,7) === '.') moves.push({ from:[x,y], to:[2,7], meta:{ castle:'Q' } });
    }
    if (color === 'b' && x === 4 && y === 0) {
      if (this.castling.k && this.at(7,0) === 'r' && this.at(5,0) === '.' && this.at(6,0) === '.') moves.push({ from:[x,y], to:[6,0], meta:{ castle:'k' } });
      if (this.castling.q && this.at(0,0) === 'r' && this.at(1,0) === '.' && this.at(2,0) === '.' && this.at(3,0) === '.') moves.push({ from:[x,y], to:[2,0], meta:{ castle:'q' } });
    }
  }

  return moves;
};

ChessGame.prototype.castlePathIsSafe = function(mv) {
  if (!mv.meta || !mv.meta.castle) return true;
  const color = this.turn;
  const enemy = opposite(color);
  if (this.inCheck(color)) return false;
  const c = mv.meta.castle;
  const path = c === 'K' ? [[5,7],[6,7]] : c === 'Q' ? [[3,7],[2,7]] : c === 'k' ? [[5,0],[6,0]] : [[3,0],[2,0]];
  return path.every(([x, y]) => !this.isAttacked(x, y, enemy));
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
    if (meta.castle === 'K') { this.set(4,7,'.'); this.set(6,7,'K'); this.set(7,7,'.'); this.set(5,7,'R'); }
    else if (meta.castle === 'Q') { this.set(4,7,'.'); this.set(2,7,'K'); this.set(0,7,'.'); this.set(3,7,'R'); }
    else if (meta.castle === 'k') { this.set(4,0,'.'); this.set(6,0,'k'); this.set(7,0,'.'); this.set(5,0,'r'); }
    else if (meta.castle === 'q') { this.set(4,0,'.'); this.set(2,0,'k'); this.set(0,0,'.'); this.set(3,0,'r'); }
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
  if (piece === 'R' && fx === 0 && fy === 7) this.castling.Q = false;
  if (piece === 'R' && fx === 7 && fy === 7) this.castling.K = false;
  if (piece === 'r' && fx === 0 && fy === 0) this.castling.q = false;
  if (piece === 'r' && fx === 7 && fy === 0) this.castling.k = false;
  if (taken === 'R' && tx === 0 && ty === 7) this.castling.Q = false;
  if (taken === 'R' && tx === 7 && ty === 7) this.castling.K = false;
  if (taken === 'r' && tx === 0 && ty === 0) this.castling.q = false;
  if (taken === 'r' && tx === 7 && ty === 0) this.castling.k = false;

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

function buildGameFromStoredMoves(moves) {
  const g = new ChessGame();
  for (const stored of moves || []) {
    const legal = g.legalMoves();
    const found = legal.find(lm => lm.from[0] === stored.from[0] && lm.from[1] === stored.from[1] && lm.to[0] === stored.to[0] && lm.to[1] === stored.to[1]);
    if (!found) throw new Error('Gespeicherte Zugliste enthält einen illegalen Zug.');
    const mv = { from: found.from, to: found.to, meta: found.meta || {}, promotion: stored.promotion || null };
    g.makeMove(mv, true);
  }
  return g;
}

function validateMoveOnServer(storedMoves, incoming) {
  const before = buildGameFromStoredMoves(storedMoves || []);
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
    let playerId = cleanPlayerId(url.searchParams.get('player'));
    let requestedDisplayName = cleanDisplayName(url.searchParams.get('name') || url.searchParams.get('displayName'));
    const authToken = url.searchParams.get('auth') || url.searchParams.get('token') || '';
    const authSession = await lookupAuthSession(this.env, authToken);
    const authUser = authSession ? authSession.user : null;
    if (authUser && authUser.id) {
      playerId = cleanPlayerId('u_' + authUser.id);
      requestedDisplayName = cleanDisplayName(authUser.username);
    }
    if (!room) return new Response('Missing or invalid room', { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const role = await this.assignRole(playerId);
    const profile = await this.savePlayerProfile(playerId, requestedDisplayName, role, authUser);

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ playerId, role, room, displayName: profile.displayName, guest: profile.guest, userId: profile.userId || null, username: profile.username || '', joinedAt: Date.now() });

    safeSend(server, { type: 'hello', room, playerId, role, displayName: profile.displayName, guest: profile.guest, userId: profile.userId || null, username: profile.username || '' });
    await this.sendRoomState(server, 'hello_state');
    await this.broadcastRoomState('lobby');

    return new Response(null, { status: 101, webSocket: client });
  }

  async assignRole(playerId) {
    const players = (await this.state.storage.get('players')) || { white: null, black: null };

    if (playerIdFromSlot(players.white) === playerId) return 'w';
    if (playerIdFromSlot(players.black) === playerId) return 'b';

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

  async getActivePlayers(players = null) {
    const assigned = players || (await this.state.storage.get('players')) || { white: null, black: null };
    const profiles = (await this.state.storage.get('playerProfiles')) || {};
    const whiteId = playerIdFromSlot(assigned.white);
    const blackId = playerIdFromSlot(assigned.black);
    const makeSlot = (playerId) => {
      const profile = playerId ? (profiles[playerId] || {}) : {};
      const displayName = cleanDisplayName(profile.displayName || profile.name) || (playerId ? guestNameFromPlayerId(playerId) : '');
      return {
        connected: false,
        playerId: playerId || null,
        name: displayName,
        displayName,
        guest: profile.guest !== false,
        userId: profile.userId || null,
        username: profile.username || ''
      };
    };

    const active = {
      white: makeSlot(whiteId),
      black: makeSlot(blackId),
      spectators: 0
    };

    for (const ws of this.state.getWebSockets()) {
      const info = ws.deserializeAttachment() || {};
      const name = cleanDisplayName(info.displayName) || (info.playerId ? guestNameFromPlayerId(info.playerId) : '');
      if (info.role === 'w') {
        active.white.connected = true;
        if (name) { active.white.name = name; active.white.displayName = name; }
        active.white.guest = info.guest !== false;
        active.white.userId = info.userId || active.white.userId || null;
        active.white.username = info.username || active.white.username || '';
      } else if (info.role === 'b') {
        active.black.connected = true;
        if (name) { active.black.name = name; active.black.displayName = name; }
        active.black.guest = info.guest !== false;
        active.black.userId = info.userId || active.black.userId || null;
        active.black.username = info.username || active.black.username || '';
      } else {
        active.spectators += 1;
      }
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
    const game = (await this.state.storage.get('game')) || { started: false, startedAt: null, ended: false, result: '*' };
    const moves = (await this.state.storage.get('moves')) || [];
    const drawOffer = (await this.state.storage.get('drawOffer')) || null;
    const now = Date.now();
    const clock = await this.getClockForState(now);

    return {
      type: 'room_state',
      room: info.room || 'unknown',
      role: info.role || 'spectator',
      playerId: info.playerId || null,
      assigned: {
        white: !!playerIdFromSlot(players.white),
        black: !!playerIdFromSlot(players.black)
      },
      players: await this.getActivePlayers(players),
      timeControl,
      game,
      moves,
      drawOffer,
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
        move,
        game,
        drawOffer,
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

    if (data.type === 'set_player_name') {
      const authSession = await lookupAuthSession(this.env, data.authToken || data.token || '');
      const authUser = authSession ? authSession.user : null;
      const displayName = authUser ? cleanDisplayName(authUser.username) : cleanDisplayName(data.displayName || data.name);
      if (displayName.length < 2) {
        safeSend(ws, { type: 'error', code: 'INVALID_PLAYER_NAME', message: 'Spielername muss mindestens 2 Zeichen haben.' });
        return;
      }
      const profile = await this.savePlayerProfile(info.playerId, displayName, role, authUser);
      ws.serializeAttachment(Object.assign({}, info, { displayName: profile.displayName, guest: profile.guest, userId: profile.userId || null, username: profile.username || '' }));
      safeSend(ws, { type: 'player_name', ok: true, role, displayName: profile.displayName, name: profile.displayName, guest: profile.guest, userId: profile.userId || null, username: profile.username || '', serverNow: Date.now() });
      await this.broadcastRoomState('room_state');
      return;
    }

    if (data.type === 'set_time_control') {
      const game = (await this.state.storage.get('game')) || { started: false };
      if (game.started) {
        safeSend(ws, { type: 'error', code: 'GAME_ALREADY_STARTED', message: 'Bedenkzeit ist nach Partiestart gesperrt.' });
        return;
      }

      if (role !== 'w') {
        safeSend(ws, { type: 'error', code: 'ONLY_WHITE_CAN_SET_TIME', message: 'Nur Weiß kann die Bedenkzeit ändern.' });
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

      const active = await this.getActivePlayers();
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
        startedByPlayer: info.playerId || null,
        ended: false,
        endedAt: null,
        endReason: null,
        winner: null,
        result: '*'
      };
      const clock = makeInitialClock(timeControl, now);
      await this.state.storage.put('game', game);
      await this.state.storage.put('moves', []);
      await this.state.storage.put('clock', clock);
      await this.state.storage.delete('drawOffer');

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

    if (data.type === 'offer_draw') {
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type: 'error', code: 'NOT_A_PLAYER', message: 'Nur Spieler können Remis anbieten.' });
        return;
      }

      const game = (await this.state.storage.get('game')) || { started: false, ended: false };
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
        safeSend(ws, { type: 'draw_offer', ok: true, drawOffer: existingOffer, message: 'Remisangebot ist bereits offen.', serverNow: Date.now() });
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
        byPlayer: info.playerId || null,
        offeredAt: new Date(now).toISOString(),
        serverNow: now
      };
      await this.state.storage.put('drawOffer', drawOffer);
      safeSend(ws, { type: 'draw_offer', ok: true, drawOffer, serverNow: now });
      await this.broadcastRoomState('draw_offer');
      return;
    }

    if (data.type === 'respond_draw') {
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type: 'error', code: 'NOT_A_PLAYER', message: 'Nur Spieler können auf ein Remisangebot antworten.' });
        return;
      }

      let game = (await this.state.storage.get('game')) || { started: false, ended: false };
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
          clock.running = false;
          clock.timeLost = false;
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
        safeSend(ws, { type: 'draw_response', ok: true, action: 'accept', game, drawOffer: null, clock: clockPayload(clock, now), serverNow: now });
        await this.broadcastRoomState('game_finished');
        return;
      }

      if (action === 'reject' || action === 'decline' || action === 'rejected' || action === 'declined') {
        await this.state.storage.delete('drawOffer');
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

      let game = (await this.state.storage.get('game')) || { started: false, ended: false };
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
        clock.running = false;
        clock.timeLost = false;
        clock.loser = role;
        clock.winner = winner;
        clock.lastTs = now;
        clock.updatedAt = now;
        await this.state.storage.put('clock', clock);
      }
      game = finishGameState(game, 'resignation', winner, now);
      await this.state.storage.put('game', game);
      await this.state.storage.delete('drawOffer');
      safeSend(ws, { type: 'resignation', ok: true, byRole: role, winner, game, drawOffer: null, clock: clockPayload(clock, now), serverNow: now });
      await this.broadcastRoomState('game_finished');
      return;
    }

    if (data.type === 'move') {
      if (role !== 'w' && role !== 'b') {
        safeSend(ws, { type: 'error', code: 'NOT_A_PLAYER', message: 'Nur Spieler können Züge senden.' });
        return;
      }

      let game = (await this.state.storage.get('game')) || { started: false, ended: false };
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

      let validation;
      try {
        validation = validateMoveOnServer(moves, incoming);
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

      let clock = (await this.state.storage.get('clock')) || makeInitialClock(timeControl, Date.parse(game.startedAt) || Date.now());
      const now = Date.now();
      clock = advanceClock(clock, now);
      if (!clock || clock.timeLost) {
        if (clock) {
          game = finishGameState(game, 'time', clock.winner, now);
          await this.state.storage.put('game', game);
          await this.state.storage.put('clock', clock);
        }
        safeSend(ws, {
          type: 'error',
          code: 'TIME_LOST',
          message: 'Die Bedenkzeit ist abgelaufen.',
          game,
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
        serverNow: now,
        byPlayer: info.playerId || null
      };

      if (validation.gameOver) {
        clock.running = false;
        clock.timeLost = false;
        clock.loser = null;
        clock.winner = validation.gameOver.winner || null;
        game = finishGameState(game, validation.gameOver.type, validation.gameOver.winner || null, now);
        game.result = resultFromGameOver(validation.gameOver);
      } else {
        clock[role + 'Ms'] = Math.max(0, clock[role + 'Ms'] + Math.max(0, Number(timeControl.incrementSeconds || 0) * 1000));
        clock.turn = opposite(role);
        clock.running = true;
        clock.timeLost = false;
        clock.loser = null;
        clock.winner = null;
      }
      clock.lastTs = now;
      clock.updatedAt = now;

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

      safeSend(ws, {
        type: 'move_ack',
        ok: true,
        messageId: data.messageId || incoming.clientMessageId || null,
        move,
        game,
        drawOffer: outgoingDrawOffer,
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
          'access-control-allow-methods': 'GET, POST, OPTIONS',
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
      endpoints: ['/health', '/api/register', '/api/login', '/api/logout', '/api/me', '/api/members/search?q=NAME', '/api/invitations/send', '/ws?room=ROOM_ID&player=PLAYER_ID'],
      features: ['lobby', 'roles', 'guest_display_names', 'accounts_d1', 'member_search', 'server_email_invitations_resend', 'time_control', 'game_start', 'move_sync', 'server_clock', 'server_move_validation', 'draw_offer', 'resignation'],
      note: 'Diese Stufe synchronisiert Lobby, Rollen, Gast-/Account-Anzeigenamen, Mitgliedersuche, Server-Mail-Einladungen über Resend, Bedenkzeit, Partiestart, Züge, eine servergeführte Uhr und prüft Züge serverseitig auf Legalität.'
    });
  }
};

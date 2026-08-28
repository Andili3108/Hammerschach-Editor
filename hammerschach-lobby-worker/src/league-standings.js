const LEAGUE_STANDINGS_MAX = 15;
const LEAGUE_STANDINGS_REFRESH_MS = 5 * 60 * 1000;
const LEAGUE_STANDINGS_MAX_HTML_BYTES = 1_500_000;
const LEAGUE_STANDINGS_ALLOWED_HOSTS = new Set([
  'ergebnisdienst.svr-schach.de',
  'ergebnisdienst.schachbund.de'
]);
const LEAGUE_STANDINGS_ALLOWED_HOST_HINT = Array.from(LEAGUE_STANDINGS_ALLOWED_HOSTS).join(' oder ');
const LEAGUE_STANDINGS_DEFAULT_PAGE_TITLE = 'Ligasaison 2026/27';

let leagueStandingsTablesReady = false;

function cleanText(value, maxLength = 160) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function decodeHtmlEntities(value) {
  const named = {
    amp:'&', apos:"'", gt:'>', lt:'<', nbsp:' ', quot:'"',
    auml:'ä', Auml:'Ä', ouml:'ö', Ouml:'Ö', uuml:'ü', Uuml:'Ü', szlig:'ß'
  };
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1] && entity[1].toLowerCase() === 'x';
      const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        try { return String.fromCodePoint(codePoint); } catch (_) { return ''; }
      }
      return '';
    }
    return Object.prototype.hasOwnProperty.call(named, entity) ? named[entity] : match;
  });
}

function htmlToText(value) {
  return cleanText(decodeHtmlEntities(String(value || '')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<(?:script|style)\b[^>]*>[^]*?<\/(?:script|style)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:div|p|span|a)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')), 180);
}

function attributeValue(attributes, name) {
  const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(attributes || '').match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeHtmlEntities(match ? (match[1] ?? match[2] ?? match[3] ?? '') : '');
}

function normalizeSourceUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || !LEAGUE_STANDINGS_ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) return '';
    if (url.port && url.port !== '443') return '';
    url.hash = '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

function safeSourceLink(value, sourceUrl) {
  try {
    const link = new URL(decodeHtmlEntities(value), sourceUrl);
    const source = new URL(sourceUrl);
    const sourceHost = source.hostname.toLowerCase();
    if (link.protocol !== 'https:' || link.hostname.toLowerCase() !== sourceHost || !LEAGUE_STANDINGS_ALLOWED_HOSTS.has(sourceHost)) return '';
    if (link.username || link.password) return '';
    if (link.port && link.port !== '443') return '';
    link.username = '';
    link.password = '';
    link.hash = '';
    return link.toString();
  } catch (_) {
    return '';
  }
}

function leagueId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{8,64}$/.test(id) ? id : '';
}

function newLeagueId() {
  return `liga_${crypto.randomUUID().replace(/-/g, '')}`;
}

function cellKind(className, headerText) {
  const classes = String(className || '').toLowerCase().split(/\s+/);
  const header = cleanText(headerText, 40).toLowerCase();
  if (classes.includes('team') || header === 'mannschaft') return 'team';
  if (classes.some(name => name === 'rang' || name.startsWith('rang_')) || header === 'rg') return 'rank';
  if (classes.includes('rnd') || /^\d+$/.test(header)) return 'round';
  if (classes.includes('mp') || header === 'mp') return 'match-points';
  if (classes.includes('bp') || header === 'bp' || header === 'divgl') return 'board-points';
  return 'value';
}

export function parseLeagueStandingsHtml(html, sourceUrl) {
  const source = normalizeSourceUrl(sourceUrl);
  if (!source) throw new Error('Die Ergebnisdienst-Adresse ist ungültig.');
  const documentText = String(html || '');
  const tableMatch = documentText.match(/<table\b([^>]*\bclass\s*=\s*(?:"[^"]*\b(?:rangliste|kreuztab)\b[^"]*"|'[^']*\b(?:rangliste|kreuztab)\b[^']*'|[^\s>]*\b(?:rangliste|kreuztab)\b[^\s>]*))[^>]*>([^]*?)<\/table>/i);
  if (!tableMatch) throw new Error('Auf der Seite wurde keine Ranglistentabelle gefunden.');

  const rawRows = [];
  const rowPattern = /<tr\b([^>]*)>([^]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(tableMatch[2])) && rawRows.length < 101) {
    const cells = [];
    const cellPattern = /<(th|td)\b([^>]*)>([^]*?)<\/\1>/gi;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowMatch[2])) && cells.length < 40) {
      const attributes = cellMatch[2] || '';
      const body = cellMatch[3] || '';
      const linkMatch = body.match(/<a\b([^>]*)>/i);
      const href = linkMatch ? safeSourceLink(attributeValue(linkMatch[1], 'href'), source) : '';
      cells.push({
        header:cellMatch[1].toLowerCase() === 'th',
        className:cleanText(attributeValue(attributes, 'class'), 80),
        text:htmlToText(body),
        href
      });
    }
    if (cells.length) rawRows.push(cells);
  }

  const headerIndex = rawRows.findIndex(row => row.some(cell => cell.header));
  if (headerIndex < 0) throw new Error('Die Ranglistentabelle enthält keine lesbare Kopfzeile.');
  const headers = rawRows[headerIndex].map(cell => cleanText(cell.text, 40));
  if (headers.length < 3) throw new Error('Die Ranglistentabelle enthält zu wenige Spalten.');
  const rows = rawRows.slice(headerIndex + 1)
    .filter(row => row.some(cell => cell.text))
    .map(row => {
      const cells = headers.map((header, index) => {
        const cell = row[index] || {text:'', href:'', className:''};
        const classes = String(cell.className || '').toLowerCase().split(/\s+/);
        return {
          text:cleanText(cell.text, 180),
          href:cell.href || '',
          kind:cellKind(cell.className, header),
          movement:classes.includes('rang_auf') ? 'up' : (classes.includes('rang_ab') ? 'down' : '')
        };
      });
      return {cells};
    });
  if (!rows.length) throw new Error('Die Ranglistentabelle enthält noch keine Mannschaften.');

  return {
    headers,
    rows,
    columnCount:headers.length,
    teamCount:rows.length
  };
}

async function ensureLeagueStandingsTables(env) {
  if (!env || !env.DB) return false;
  if (leagueStandingsTablesReady) return true;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS league_standings_sources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS league_standings_cache (
      league_id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      payload_json TEXT,
      checked_at TEXT,
      fetched_at TEXT,
      last_error TEXT,
      FOREIGN KEY (league_id) REFERENCES league_standings_sources(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS league_standings_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_league_standings_order ON league_standings_sources (enabled, sort_order, title)`)
  ]);
  leagueStandingsTablesReady = true;
  return true;
}

async function loadLeaguePageTitle(env) {
  await ensureLeagueStandingsTables(env);
  const row = await env.DB.prepare(`SELECT setting_value FROM league_standings_settings WHERE setting_key = 'page_title' LIMIT 1`).first();
  return cleanText(row && row.setting_value, 80) || LEAGUE_STANDINGS_DEFAULT_PAGE_TITLE;
}

async function saveLeaguePageTitle(env, value, adminUser) {
  await ensureLeagueStandingsTables(env);
  const pageTitle = cleanText(value, 80);
  if (!pageTitle) return {ok:false, message:'Bitte eine Überschrift für die Ligasaison eintragen.'};
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO league_standings_settings (setting_key, setting_value, updated_at, updated_by)
    VALUES ('page_title', ?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(pageTitle, now, adminUser && adminUser.id || null).run();
  return {ok:true, pageTitle};
}

function sourceRowDto(row) {
  return {
    id:leagueId(row && row.id),
    title:cleanText(row && row.title, 120),
    sourceUrl:normalizeSourceUrl(row && row.source_url),
    enabled:Number(row && row.enabled) === 1,
    order:Math.max(0, Math.floor(Number(row && row.sort_order) || 0)),
    createdAt:row && row.created_at || null,
    updatedAt:row && row.updated_at || null
  };
}

async function listLeagueSources(env, includeDisabled) {
  await ensureLeagueStandingsTables(env);
  const where = includeDisabled ? '' : 'WHERE enabled = 1';
  const result = await env.DB.prepare(`SELECT * FROM league_standings_sources ${where} ORDER BY sort_order ASC, title COLLATE NOCASE ASC`).all();
  return (result && result.results ? result.results : []).map(sourceRowDto).filter(source => source.id && source.sourceUrl);
}

async function leagueCache(env, source) {
  const row = await env.DB.prepare(`SELECT * FROM league_standings_cache WHERE league_id = ? LIMIT 1`).bind(source.id).first();
  if (!row || normalizeSourceUrl(row.source_url) !== source.sourceUrl) return null;
  let table = null;
  try {
    const parsed = JSON.parse(String(row.payload_json || 'null'));
    if (parsed && Array.isArray(parsed.headers) && Array.isArray(parsed.rows)) table = parsed;
  } catch (_) {}
  return {
    table,
    checkedAt:row.checked_at || null,
    fetchedAt:row.fetched_at || null,
    lastError:cleanText(row.last_error, 300)
  };
}

async function fetchSourceHtml(sourceUrl) {
  let current = normalizeSourceUrl(sourceUrl);
  if (!current) throw new Error('Die Ergebnisdienst-Adresse ist ungültig.');
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetch(current, {
      method:'GET',
      redirect:'manual',
      headers:{
        accept:'text/html,application/xhtml+xml',
        'accept-language':'de-DE,de;q=0.9',
        'user-agent':'Hammerschach-Gamer-Ergebnisdienst/1.0'
      }
    });
    if ([301,302,303,307,308].includes(response.status)) {
      const redirected = normalizeSourceUrl(new URL(response.headers.get('location') || '', current).toString());
      if (!redirected) throw new Error('Die Ergebnisdienst-Seite leitet auf eine nicht erlaubte Adresse weiter.');
      current = redirected;
      continue;
    }
    if (!response.ok) throw new Error(`Der Ergebnisdienst antwortet momentan nicht (${response.status}).`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('Die eingetragene Adresse liefert keine Internetseite.');
    }
    const announcedLength = Number(response.headers.get('content-length') || 0);
    if (announcedLength > LEAGUE_STANDINGS_MAX_HTML_BYTES) throw new Error('Die Ergebnisdienst-Seite ist ungewöhnlich groß.');
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > LEAGUE_STANDINGS_MAX_HTML_BYTES) throw new Error('Die Ergebnisdienst-Seite ist ungewöhnlich groß.');
    return new TextDecoder('utf-8').decode(buffer);
  }
  throw new Error('Die Ergebnisdienst-Seite leitet zu häufig weiter.');
}

async function refreshLeague(env, source, force) {
  const cached = await leagueCache(env, source);
  const checkedAtMs = Date.parse(cached && cached.checkedAt || '') || 0;
  if (!force && cached && checkedAtMs && Date.now() - checkedAtMs < LEAGUE_STANDINGS_REFRESH_MS) {
    return {...cached, stale:!!(cached.table && cached.lastError)};
  }

  const checkedAt = new Date().toISOString();
  try {
    const table = parseLeagueStandingsHtml(await fetchSourceHtml(source.sourceUrl), source.sourceUrl);
    await env.DB.prepare(`INSERT INTO league_standings_cache
      (league_id, source_url, payload_json, checked_at, fetched_at, last_error)
      VALUES (?, ?, ?, ?, ?, NULL)
      ON CONFLICT(league_id) DO UPDATE SET source_url = excluded.source_url, payload_json = excluded.payload_json,
        checked_at = excluded.checked_at, fetched_at = excluded.fetched_at, last_error = NULL`)
      .bind(source.id, source.sourceUrl, JSON.stringify(table), checkedAt, checkedAt).run();
    return {table, checkedAt, fetchedAt:checkedAt, lastError:'', stale:false};
  } catch (error) {
    const message = cleanText(error && error.message ? error.message : 'Die Tabelle konnte nicht aktualisiert werden.', 300);
    await env.DB.prepare(`INSERT INTO league_standings_cache
      (league_id, source_url, payload_json, checked_at, fetched_at, last_error)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(league_id) DO UPDATE SET source_url = excluded.source_url,
        checked_at = excluded.checked_at, last_error = excluded.last_error`)
      .bind(source.id, source.sourceUrl, cached && cached.table ? JSON.stringify(cached.table) : null, checkedAt, cached && cached.fetchedAt || null, message).run();
    return {table:cached && cached.table || null, checkedAt, fetchedAt:cached && cached.fetchedAt || null, lastError:message, stale:!!(cached && cached.table)};
  }
}

function publicLeagueDto(source, state, adminView) {
  const dto = {
    id:source.id,
    title:source.title,
    sourceUrl:source.sourceUrl,
    enabled:source.enabled,
    order:source.order,
    updatedAt:source.updatedAt,
    checkedAt:state && state.checkedAt || null,
    fetchedAt:state && state.fetchedAt || null,
    stale:state && state.stale === true,
    table:state && state.table || null,
    message:state && state.table
      ? (state.stale ? 'Der Ergebnisdienst war kurzzeitig nicht erreichbar. Die zuletzt geladene Tabelle bleibt sichtbar.' : '')
      : 'Diese Ligatabelle ist momentan nicht verfügbar.'
  };
  if (adminView) dto.lastError = cleanText(state && state.lastError, 300);
  return dto;
}

async function loadLeagueStandings(env, includeDisabled, forceLeagueId) {
  const sources = await listLeagueSources(env, includeDisabled);
  const states = await Promise.all(sources.map(source => {
    if (!source.enabled && source.id !== forceLeagueId) return leagueCache(env, source).then(cache => ({...(cache || {}), stale:false}));
    return refreshLeague(env, source, source.id === forceLeagueId);
  }));
  return sources.map((source, index) => publicLeagueDto(source, states[index], includeDisabled));
}

function normalizeIncomingLeagues(value) {
  if (!Array.isArray(value)) return {ok:false, message:'Die Ligakonfiguration fehlt.'};
  if (value.length > LEAGUE_STANDINGS_MAX) return {ok:false, message:`Es können höchstens ${LEAGUE_STANDINGS_MAX} Ligatabellen angelegt werden.`};
  const leagues = [];
  const ids = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index] && typeof value[index] === 'object' ? value[index] : {};
    const title = cleanText(item.title, 120);
    const sourceUrl = normalizeSourceUrl(item.sourceUrl || item.url);
    let id = leagueId(item.id) || newLeagueId();
    while (ids.has(id)) id = newLeagueId();
    if (!title) return {ok:false, message:`Liga ${index + 1}: Bitte eine Überschrift eintragen.`};
    if (!sourceUrl) return {ok:false, message:`${title}: Bitte eine gültige HTTPS-Adresse von ${LEAGUE_STANDINGS_ALLOWED_HOST_HINT} eintragen.`};
    ids.add(id);
    leagues.push({id, title, sourceUrl, enabled:item.enabled !== false, order:index});
  }
  return {ok:true, leagues};
}

async function saveLeagueSources(env, incoming, adminUser) {
  await ensureLeagueStandingsTables(env);
  const normalized = normalizeIncomingLeagues(incoming);
  if (!normalized.ok) return normalized;
  const existing = await listLeagueSources(env, true);
  const existingMap = new Map(existing.map(source => [source.id, source]));
  const keepIds = new Set(normalized.leagues.map(source => source.id));
  const now = new Date().toISOString();
  const statements = [];
  normalized.leagues.forEach(source => {
    const previous = existingMap.get(source.id);
    statements.push(env.DB.prepare(`INSERT INTO league_standings_sources
      (id, title, source_url, enabled, sort_order, created_at, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, source_url = excluded.source_url,
        enabled = excluded.enabled, sort_order = excluded.sort_order, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(source.id, source.title, source.sourceUrl, source.enabled ? 1 : 0, source.order, previous && previous.createdAt || now, now, adminUser && adminUser.id || null));
    if (previous && previous.sourceUrl !== source.sourceUrl) {
      statements.push(env.DB.prepare(`DELETE FROM league_standings_cache WHERE league_id = ?`).bind(source.id));
    }
  });
  existing.filter(source => !keepIds.has(source.id)).forEach(source => {
    statements.push(env.DB.prepare(`DELETE FROM league_standings_cache WHERE league_id = ?`).bind(source.id));
    statements.push(env.DB.prepare(`DELETE FROM league_standings_sources WHERE id = ?`).bind(source.id));
  });
  if (statements.length) await env.DB.batch(statements);
  return {ok:true, leagues:normalized.leagues};
}

export async function handleLeagueStandingsApi(request, env, url, dependencies) {
  const respondJson = dependencies && dependencies.json;
  const lookupSession = dependencies && dependencies.lookupAuthSession;
  const bearerToken = dependencies && dependencies.bearerTokenFromRequest;
  const requireAdmin = dependencies && dependencies.requireAdminSession;
  const readBody = dependencies && dependencies.readJsonBody;
  if (typeof respondJson !== 'function') return null;

  if (url.pathname === '/api/league-standings' && request.method === 'GET') {
    const session = await lookupSession(env, bearerToken(request));
    if (!session) return respondJson({ok:false, code:'NOT_AUTHENTICATED', message:'Die Ligatabellen sind nur für eingeloggte Mitglieder verfügbar.'}, {status:401});
    try {
      const [pageTitle, leagues] = await Promise.all([
        loadLeaguePageTitle(env),
        loadLeagueStandings(env, false, '')
      ]);
      return respondJson({ok:true, pageTitle, maxLeagues:LEAGUE_STANDINGS_MAX, leagues});
    } catch (error) {
      console.error('League standings load failed', error && error.message ? error.message : String(error || 'unknown'));
      return respondJson({ok:false, code:'LEAGUE_STANDINGS_UNAVAILABLE', message:'Die Ligatabellen konnten momentan nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/admin/league-standings' && request.method === 'GET') {
    const admin = await requireAdmin(request, env);
    if (!admin.ok) return admin.response;
    try {
      const [pageTitle, leagues] = await Promise.all([
        loadLeaguePageTitle(env),
        loadLeagueStandings(env, true, '')
      ]);
      return respondJson({ok:true, pageTitle, maxLeagues:LEAGUE_STANDINGS_MAX, leagues});
    } catch (error) {
      console.error('Admin league standings load failed', error && error.message ? error.message : String(error || 'unknown'));
      return respondJson({ok:false, code:'LEAGUE_STANDINGS_ADMIN_UNAVAILABLE', message:'Die Ligakonfiguration konnte momentan nicht geladen werden.'}, {status:500});
    }
  }

  if (url.pathname === '/api/admin/league-standings' && request.method === 'POST') {
    const admin = await requireAdmin(request, env);
    if (!admin.ok) return admin.response;
    const body = await readBody(request);
    if (!body) return respondJson({ok:false, code:'BAD_JSON', message:'Die Ligakonfiguration konnte nicht gelesen werden.'}, {status:400});
    try {
      const currentPageTitle = await loadLeaguePageTitle(env);
      const requestedPageTitle = cleanText(body.pageTitle === undefined ? currentPageTitle : body.pageTitle, 80);
      if (!requestedPageTitle) return respondJson({ok:false, code:'INVALID_LEAGUE_PAGE_TITLE', message:'Bitte eine Überschrift für die Ligasaison eintragen.'}, {status:400});
      const saved = await saveLeagueSources(env, body.leagues, admin.session.user);
      if (!saved.ok) return respondJson({ok:false, code:'INVALID_LEAGUE_CONFIG', message:saved.message}, {status:400});
      const titleSaved = await saveLeaguePageTitle(env, requestedPageTitle, admin.session.user);
      if (!titleSaved.ok) return respondJson({ok:false, code:'INVALID_LEAGUE_PAGE_TITLE', message:titleSaved.message}, {status:400});
      return respondJson({
        ok:true,
        pageTitle:titleSaved.pageTitle,
        maxLeagues:LEAGUE_STANDINGS_MAX,
        leagues:await loadLeagueStandings(env, true, ''),
        message:`Die Ligakonfiguration wurde gespeichert (${saved.leagues.length} von ${LEAGUE_STANDINGS_MAX} Plätzen belegt).`
      });
    } catch (error) {
      console.error('League standings save failed', error && error.message ? error.message : String(error || 'unknown'));
      return respondJson({ok:false, code:'LEAGUE_STANDINGS_SAVE_FAILED', message:'Die Ligakonfiguration konnte nicht gespeichert werden.'}, {status:500});
    }
  }

  const refreshMatch = url.pathname.match(/^\/api\/admin\/league-standings\/([a-z0-9_-]{8,64})\/refresh$/i);
  if (refreshMatch && request.method === 'POST') {
    const admin = await requireAdmin(request, env);
    if (!admin.ok) return admin.response;
    try {
      const id = leagueId(refreshMatch[1]);
      const sources = await listLeagueSources(env, true);
      const source = sources.find(item => item.id === id);
      if (!source) return respondJson({ok:false, code:'LEAGUE_NOT_FOUND', message:'Diese Ligakonfiguration wurde nicht gefunden.'}, {status:404});
      const state = await refreshLeague(env, source, true);
      return respondJson({
        ok:true,
        league:publicLeagueDto(source, state, true),
        message:state.table && !state.lastError ? 'Die Ligatabelle wurde erfolgreich aktualisiert.' : (state.lastError || 'Die Ligatabelle konnte nicht aktualisiert werden.')
      });
    } catch (error) {
      console.error('League standings refresh failed', error && error.message ? error.message : String(error || 'unknown'));
      return respondJson({ok:false, code:'LEAGUE_STANDINGS_REFRESH_FAILED', message:'Die Ligatabelle konnte nicht aktualisiert werden.'}, {status:500});
    }
  }

  return null;
}

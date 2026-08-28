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
    amp:'&', apos:"'", gt:'>', lt:'<', nbsp:' ', quot:'"', minus:'−', ndash:'–', mdash:'—',
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
  if (classes.includes('team') || header === 'mannschaft' || header === 'heim' || header === 'gast') return 'team';
  if (classes.some(name => name === 'rang' || name.startsWith('rang_')) || header === 'rg') return 'rank';
  if (classes.includes('rnd') || /^\d+$/.test(header)) return 'round';
  if (classes.includes('mp') || header === 'mp') return 'match-points';
  if (classes.includes('bp') || header === 'bp' || header === 'divgl') return 'board-points';
  if (header === 'ergebnis' || header === '−' || header === '-') return 'result';
  if (header === 'paar') return 'pairing';
  if (header === 'tln') return 'participant';
  if (header === 'dwz') return 'rating';
  if (header === 'spieltermin' || header === 'termin') return 'date';
  return 'value';
}

function parseHtmlTableRows(tableBody, source, maxRows = 200) {
  const rawRows = [];
  const rowPattern = /<tr\b([^>]*)>([^]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(String(tableBody || ''))) && rawRows.length < maxRows) {
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
  return rawRows;
}

function germanRoundDateIso(value) {
  const months = {
    januar:1, februar:2, maerz:3, märz:3, april:4, mai:5, juni:6,
    juli:7, august:8, september:9, oktober:10, november:11, dezember:12
  };
  const normalized = cleanText(value, 80).toLowerCase();
  const numeric = normalized.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const shortYear = Number(numeric[3]);
    const year = numeric[3].length === 2 ? 2000 + shortYear : shortYear;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2200) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const match = normalized.match(/\b(\d{1,2})\.\s*([a-zäöü]+)\s+(\d{4})\b/i);
  if (!match) return '';
  const month = months[match[2]];
  const day = Number(match[1]);
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31 || year < 2000 || year > 2200) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function leagueRoundsSourceUrl(sourceUrl) {
  const source = normalizeSourceUrl(sourceUrl);
  if (!source) return '';
  const url = new URL(source);
  if (url.hostname.toLowerCase() === 'ergebnisdienst.schachbund.de' && /\/bedh\.php$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/bedh\.php$/i, 'bedt.php');
    ['view', 'layout', 'format', 'runde', 'dg', 'tlnr', 'nummer'].forEach(name => url.searchParams.delete(name));
    return normalizeSourceUrl(url.toString());
  }
  url.searchParams.set('view', 'paarungsliste');
  ['layout', 'format', 'runde', 'dg', 'tlnr'].forEach(name => url.searchParams.delete(name));
  return normalizeSourceUrl(url.toString());
}

function leagueRoundDetailUrl(roundsSourceUrl, number) {
  const source = normalizeSourceUrl(roundsSourceUrl);
  if (!source || !Number.isInteger(number) || number < 1) return '';
  const url = new URL(source);
  if (url.hostname.toLowerCase() === 'ergebnisdienst.schachbund.de' && /\/bedt\.php$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/bedt\.php$/i, 'bede.php');
    url.searchParams.set('runde', String(number));
    return normalizeSourceUrl(url.toString());
  }
  return '';
}

export function parseLeagueStandingsHtml(html, sourceUrl) {
  const source = normalizeSourceUrl(sourceUrl);
  if (!source) throw new Error('Die Ergebnisdienst-Adresse ist ungültig.');
  const documentText = String(html || '');
  const tableMatch = documentText.match(/<table\b([^>]*\bclass\s*=\s*(?:"[^"]*\b(?:rangliste|kreuztab)\b[^"]*"|'[^']*\b(?:rangliste|kreuztab)\b[^']*'|[^\s>]*\b(?:rangliste|kreuztab)\b[^\s>]*))[^>]*>([^]*?)<\/table>/i);
  if (!tableMatch) throw new Error('Auf der Seite wurde keine Ranglistentabelle gefunden.');

  const rawRows = parseHtmlTableRows(tableMatch[2], source, 101);

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

export function parseLeagueRoundsHtml(html, sourceUrl) {
  const source = normalizeSourceUrl(sourceUrl);
  if (!source) throw new Error('Die Ergebnisdienst-Adresse der Rundenübersicht ist ungültig.');
  const documentText = String(html || '');
  const tables = [];
  const tablePattern = /<table\b([^>]*)>([^]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tablePattern.exec(documentText)) && tables.length < 80) {
    const rawRows = parseHtmlTableRows(tableMatch[2], source);
    const scheduleHeaderIndex = rawRows.findIndex(row => {
      const headers = row.filter(cell => cell.header).map(cell => cleanText(cell.text, 40).toLowerCase());
      return headers.includes('tag') && headers.includes('datum') && headers.includes('uhrzeit') && headers.includes('heim') && headers.includes('gast');
    });
    if (scheduleHeaderIndex >= 0) {
      const headers = rawRows[scheduleHeaderIndex].map(cell => cleanText(cell.text, 40));
      const dateColumn = headers.findIndex(header => header.toLowerCase() === 'datum');
      let currentRound = null;
      const finishRound = () => {
        if (!currentRound || !currentRound.rows.length) return;
        currentRound.date = dateColumn >= 0 ? cleanText(currentRound.rows[0].cells[dateColumn].text, 80) : '';
        currentRound.dateIso = germanRoundDateIso(currentRound.date);
        currentRound.matchCount = currentRound.rows.length;
        tables.push(currentRound);
      };
      rawRows.slice(scheduleHeaderIndex + 1).forEach(row => {
        const separator = row.length === 1 ? cleanText(row[0].text, 80).match(/^(\d+)\.\s*Runde$/i) : null;
        if (separator) {
          finishRound();
          const number = Number(separator[1]);
          currentRound = {
            number,
            label:`Runde ${number}`,
            date:'',
            dateIso:'',
            href:leagueRoundDetailUrl(source, number),
            headers,
            rows:[],
            matchCount:0
          };
          return;
        }
        if (!currentRound || row.length < 2 || !row.some(cell => cell.text)) return;
        currentRound.rows.push({
          cells:headers.map((header, index) => {
            const cell = row[index] || {text:'', href:'', className:''};
            return {
              text:cleanText(cell.text, 180),
              href:cell.href || '',
              kind:cellKind(cell.className, header)
            };
          })
        });
      });
      finishRound();
      if (tables.length) continue;
    }
    const headerIndex = rawRows.findIndex(row => {
      const headers = row.filter(cell => cell.header).map(cell => cleanText(cell.text, 40).toLowerCase());
      return headers.includes('paar') && headers.includes('heim') && headers.includes('gast') && headers.includes('ergebnis');
    });
    if (headerIndex < 0) continue;
    const titleRow = rawRows.slice(0, headerIndex).find(row => row.some(cell => /\brunde\s+\d+\b/i.test(cell.text))) || [];
    const titleCell = titleRow.find(cell => /\brunde\s+\d+\b/i.test(cell.text)) || {};
    const titleText = cleanText(titleCell.text, 120);
    const roundMatch = titleText.match(/\brunde\s+(\d+)\b/i);
    const number = roundMatch ? Number(roundMatch[1]) : tables.length + 1;
    const label = roundMatch ? `Runde ${number}` : `Spieltag ${tables.length + 1}`;
    const date = cleanText(titleText.replace(/\brunde\s+\d+\b/i, ''), 80);
    const headers = rawRows[headerIndex].map(cell => cleanText(cell.text, 40));
    const rows = rawRows.slice(headerIndex + 1)
      .filter(row => row.some(cell => cell.text))
      .map(row => ({
        cells:headers.map((header, index) => {
          const cell = row[index] || {text:'', href:'', className:''};
          return {
            text:cleanText(cell.text, 180),
            href:cell.href || '',
            kind:cellKind(cell.className, header)
          };
        })
      }));
    if (!headers.length || !rows.length) continue;
    tables.push({
      number,
      label,
      date,
      dateIso:germanRoundDateIso(date),
      href:titleCell.href || '',
      headers,
      rows,
      matchCount:rows.length
    });
  }
  if (!tables.length) throw new Error('Auf der Seite wurde keine lesbare Rundenübersicht gefunden.');
  return tables;
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
  let rounds = [];
  let version = 0;
  try {
    const parsed = JSON.parse(String(row.payload_json || 'null'));
    if (parsed && Array.isArray(parsed.headers) && Array.isArray(parsed.rows)) {
      table = parsed;
      version = 1;
    } else if (parsed && typeof parsed === 'object') {
      version = Math.max(0, Math.floor(Number(parsed.version) || 0));
      if (parsed.table && Array.isArray(parsed.table.headers) && Array.isArray(parsed.table.rows)) table = parsed.table;
      if (Array.isArray(parsed.rounds)) rounds = parsed.rounds;
    }
  } catch (_) {}
  return {
    table,
    rounds,
    version,
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
  if (!force && cached && cached.version >= 2 && checkedAtMs && Date.now() - checkedAtMs < LEAGUE_STANDINGS_REFRESH_MS) {
    return {...cached, stale:!!(cached.table && cached.lastError)};
  }

  const checkedAt = new Date().toISOString();
  const roundsUrl = leagueRoundsSourceUrl(source.sourceUrl);
  const [tableResult, roundsResult] = await Promise.allSettled([
    fetchSourceHtml(source.sourceUrl).then(html => parseLeagueStandingsHtml(html, source.sourceUrl)),
    fetchSourceHtml(roundsUrl).then(html => parseLeagueRoundsHtml(html, roundsUrl))
  ]);
  const table = tableResult.status === 'fulfilled' ? tableResult.value : (cached && cached.table || null);
  const rounds = roundsResult.status === 'fulfilled' ? roundsResult.value : (cached && cached.rounds || []);
  const errors = [];
  if (tableResult.status === 'rejected') {
    errors.push(cleanText(tableResult.reason && tableResult.reason.message ? tableResult.reason.message : 'Die Ligatabelle konnte nicht aktualisiert werden.', 180));
  }
  if (roundsResult.status === 'rejected') {
    errors.push(cleanText(roundsResult.reason && roundsResult.reason.message ? roundsResult.reason.message : 'Die Rundenübersicht konnte nicht aktualisiert werden.', 180));
  }
  const lastError = cleanText(errors.join(' '), 300);
  const anyFresh = tableResult.status === 'fulfilled' || roundsResult.status === 'fulfilled';
  const fetchedAt = anyFresh ? checkedAt : (cached && cached.fetchedAt || null);
  const payload = table || rounds.length ? JSON.stringify({version:2, table, rounds}) : null;
  await env.DB.prepare(`INSERT INTO league_standings_cache
    (league_id, source_url, payload_json, checked_at, fetched_at, last_error)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(league_id) DO UPDATE SET source_url = excluded.source_url, payload_json = excluded.payload_json,
      checked_at = excluded.checked_at, fetched_at = excluded.fetched_at, last_error = excluded.last_error`)
    .bind(source.id, source.sourceUrl, payload, checkedAt, fetchedAt, lastError || null).run();
  return {table, rounds, checkedAt, fetchedAt, lastError, stale:!!lastError && (!!table || rounds.length > 0)};
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
    rounds:state && Array.isArray(state.rounds) ? state.rounds : [],
    roundsMessage:state && state.lastError && (!state.rounds || !state.rounds.length)
      ? 'Die Rundenübersicht konnte momentan nicht geladen werden.'
      : '',
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
        message:state.table && state.rounds && state.rounds.length && !state.lastError
          ? 'Die Ligatabelle und ihre Rundenübersicht wurden erfolgreich aktualisiert.'
          : (state.lastError || 'Die Ligadaten konnten nicht vollständig aktualisiert werden.')
      });
    } catch (error) {
      console.error('League standings refresh failed', error && error.message ? error.message : String(error || 'unknown'));
      return respondJson({ok:false, code:'LEAGUE_STANDINGS_REFRESH_FAILED', message:'Die Ligadaten konnten nicht aktualisiert werden.'}, {status:500});
    }
  }

  return null;
}

const READER_ARCHIVES_MAX = 15;
const READER_ARCHIVES_CONFIG_KEY = 'reader_archives_config_v1';

const DEFAULT_READER_ARCHIVES = [
  {id:'archive_1', name:'SV Ruhrgebiet', file:'SVRuhrgebiet.txt', enabled:true},
  {id:'archive_2', name:'Unna Open', file:'UnnaOpen.txt', enabled:true},
  {id:'archive_3', name:'NRW-Klasse 1', file:'NRWKlasse1.txt', enabled:true},
  {id:'archive_4', name:'Verbandsbezirksliga 1', file:'Verbandsbezirksliga1.txt', enabled:true},
  {id:'archive_5', name:'NRW-Liga 1', file:'NRWLiga1.txt', enabled:true}
];

function cleanArchiveText(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/[<>\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanArchiveFile(value) {
  const file = String(value == null ? '' : value).trim();
  return /^[A-Za-z0-9ÄÖÜäöüß._-]{1,120}\.txt$/i.test(file) ? file : '';
}

function archiveSlotId(value, index) {
  const id = String(value || '').trim().toLowerCase();
  return /^archive_(?:[1-9]|1[0-5])$/.test(id) ? id : `archive_${index + 1}`;
}

function normalizeArchiveConfig(value) {
  const source = value && Array.isArray(value.archives) ? value.archives : [];
  const archives = [];
  for (let index = 0; index < READER_ARCHIVES_MAX; index += 1) {
    const item = source[index] && typeof source[index] === 'object' ? source[index] : {};
    const name = cleanArchiveText(item.name, 100);
    const file = cleanArchiveFile(item.file);
    archives.push({
      id:archiveSlotId(item.id, index),
      name,
      file,
      enabled:item.enabled !== false && !!name && !!file
    });
  }
  return {version:1, archives};
}

function defaultArchiveConfig() {
  return normalizeArchiveConfig({archives:DEFAULT_READER_ARCHIVES});
}

async function ensureReaderArchiveSettings(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  )`).run();
}

async function loadReaderArchiveConfig(env) {
  await ensureReaderArchiveSettings(env);
  const row = await env.DB.prepare(
    `SELECT setting_value FROM admin_settings WHERE setting_key = ? LIMIT 1`
  ).bind(READER_ARCHIVES_CONFIG_KEY).first();
  if (!row || !row.setting_value) return defaultArchiveConfig();
  try {
    return normalizeArchiveConfig(JSON.parse(row.setting_value));
  } catch (_) {
    return defaultArchiveConfig();
  }
}

async function saveReaderArchiveConfig(env, body, adminUser) {
  const config = normalizeArchiveConfig(body);
  const submitted = body && Array.isArray(body.archives) ? body.archives.slice(0, READER_ARCHIVES_MAX) : [];
  for (let index = 0; index < submitted.length; index += 1) {
    const item = submitted[index] || {};
    const hasName = !!cleanArchiveText(item.name, 100);
    const hasFileInput = !!String(item.file || '').trim();
    const hasFile = !!cleanArchiveFile(item.file);
    if (hasFileInput && !hasFile) {
      return {ok:false, status:400, code:'INVALID_ARCHIVE_FILE', message:`Archivplatz ${index + 1}: Bitte nur den Namen einer .txt-Datei ohne Ordnerpfad eintragen.`};
    }
    if ((hasName || hasFileInput) && !(hasName && hasFile)) {
      return {ok:false, status:400, code:'INCOMPLETE_ARCHIVE', message:`Archivplatz ${index + 1}: Archivname und .txt-Datei müssen gemeinsam eingetragen werden.`};
    }
  }
  const now = new Date().toISOString();
  await ensureReaderArchiveSettings(env);
  await env.DB.prepare(
    `INSERT INTO admin_settings (setting_key, setting_value, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET
       setting_value=excluded.setting_value,
       updated_at=excluded.updated_at,
       updated_by=excluded.updated_by`
  ).bind(READER_ARCHIVES_CONFIG_KEY, JSON.stringify(config), now, String(adminUser && adminUser.id || '')).run();
  return {ok:true, config};
}

function memberArchiveDto(config) {
  return (config.archives || [])
    .filter(item => item.enabled && item.name && item.file)
    .map(item => ({id:item.id, name:item.name, file:item.file}));
}

export async function handleReaderArchivesApi(request, env, url, helpers) {
  const {json, lookupAuthSession, bearerTokenFromRequest, requireAdminSession, readJsonBody} = helpers;

  if (url.pathname === '/api/reader/archives' && request.method === 'GET') {
    const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
    if (!session) return json({ok:false, code:'NOT_AUTHENTICATED', message:'Das Partienarchiv ist nur für eingeloggte Mitglieder verfügbar.'}, {status:401});
    const config = await loadReaderArchiveConfig(env);
    return json({ok:true, max:READER_ARCHIVES_MAX, archives:memberArchiveDto(config)});
  }

  if (url.pathname === '/api/admin/reader-archives' && request.method === 'GET') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const config = await loadReaderArchiveConfig(env);
    return json({ok:true, max:READER_ARCHIVES_MAX, archives:config.archives});
  }

  if (url.pathname === '/api/admin/reader-archives' && request.method === 'POST') {
    const admin = await requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
    const body = await readJsonBody(request);
    if (!body) return json({ok:false, code:'BAD_JSON', message:'Die Archivkonfiguration konnte nicht gelesen werden.'}, {status:400});
    const saved = await saveReaderArchiveConfig(env, body, admin.session.user);
    if (!saved.ok) return json(saved, {status:saved.status || 400});
    return json({ok:true, max:READER_ARCHIVES_MAX, archives:saved.config.archives, message:'Die Konfiguration der Partienarchive wurde gespeichert.'});
  }

  return null;
}

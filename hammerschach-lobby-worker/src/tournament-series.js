// Wiederkehrende Termine bleiben eigenständige Turniere. Keine Teilnehmer/Ergebnisse kopieren.
const HOUR = 3600000;
export function seriesConfig(value) {
  if (!value || value.enabled === false) return null;
  const intervalWeeks = Number(value.intervalWeeks || 1);
  const visibilityHours = Number(value.visibilityHours ?? 72);
  const registrationHours = Number(value.registrationHours ?? 24);
  const timeZone = String(value.timeZone || 'Europe/Berlin');
  if (![1,2,3,4].includes(intervalWeeks) || !Number.isInteger(visibilityHours) || visibilityHours < 0 || visibilityHours >= intervalWeeks * 168 || !Number.isInteger(registrationHours) || registrationHours < 0 || registrationHours > visibilityHours) throw new Error('Sichtbarkeit muss vor dem nächsten Serientermin liegen; die Anmeldung darf nicht vor der Sichtbarkeit öffnen.');
  try { new Intl.DateTimeFormat('de-DE', {timeZone}).format(); } catch (_) { throw new Error('Ungültige Zeitzone.'); }
  return {enabled:true, intervalWeeks, visibilityHours, registrationHours, timeZone};
}
function localParts(date, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}
function wallTime(p) { return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second); }
export function nextSeriesStart(previous, config) {
  const p=localParts(previous,config.timeZone);
  const wall=wallTime(p)+config.intervalWeeks*7*24*HOUR;
  // Reale UTC-Kandidaten beider Offsets prüfen. Bei doppelter Stunde gilt der frühere;
  // eine im Frühjahr fehlende Uhrzeit wird um die Zeitumstellung nach hinten geschoben.
  const offsets=new Set([-36,0,36].map(h=>{const ms=wall+h*HOUR;return wallTime(localParts(ms,config.timeZone))-ms;}));
  const candidates=[...offsets].map(offset=>wall-offset).sort((a,b)=>a-b);
  const exact=candidates.find(ms=>wallTime(localParts(ms,config.timeZone))===wall);
  const chosen=exact ?? candidates.filter(ms=>wallTime(localParts(ms,config.timeZone))>wall).sort((a,b)=>wallTime(localParts(a,config.timeZone))-wallTime(localParts(b,config.timeZone)))[0];
  if (!Number.isFinite(chosen)) throw new Error('Serientermin konnte nicht berechnet werden.');
  return new Date(chosen).toISOString();
}
export function tournamentTiming(body, scheduledStartAt, arena) {
  const recurrence=seriesConfig(body.recurrence);
  if (recurrence && !scheduledStartAt) throw new Error('Eine Turnierserie benötigt einen Starttermin.');
  const parse=(v)=>{if(!v)return null;const ms=Date.parse(v);if(!Number.isFinite(ms))throw new Error('Ungültiger Freigabezeitpunkt.');return new Date(ms).toISOString();};
  const visibleAt=recurrence ? new Date(Date.parse(scheduledStartAt)-recurrence.visibilityHours*HOUR).toISOString() : parse(body.visibleAt);
  const registrationOpensAt=arena ? null : recurrence ? new Date(Date.parse(scheduledStartAt)-recurrence.registrationHours*HOUR).toISOString() : parse(body.registrationOpensAt);
  if (scheduledStartAt && ((visibleAt && visibleAt>scheduledStartAt) || (registrationOpensAt && registrationOpensAt>scheduledStartAt))) throw new Error('Anzeige und Anmeldung dürfen nicht nach dem Start liegen.');
  if (visibleAt && registrationOpensAt && registrationOpensAt<visibleAt) throw new Error('Die Anmeldung darf nicht vor der Sichtbarkeit öffnen.');
  return {recurrence,visibleAt,registrationOpensAt};
}
export function tournamentVisible(row, now=Date.now()) { return row.status!=='draft' && (!row.visible_at || Date.parse(row.visible_at)<=now); }
export function tournamentRegistrationOpen(row, now=Date.now()) { return tournamentVisible(row,now) && ['open','full'].includes(row.status) && (!row.registration_opens_at || Date.parse(row.registration_opens_at)<=now); }
export async function ensureSeriesSchema(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS tournament_series (id TEXT PRIMARY KEY, template_json TEXT NOT NULL, config_json TEXT NOT NULL, next_start_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`).run();
  for (const column of ['series_id TEXT','series_occurrence_at TEXT','recurrence_json TEXT','visible_at TEXT','registration_opens_at TEXT']) {
    try { await env.DB.prepare('ALTER TABLE tournaments ADD COLUMN '+column).run(); } catch(error) { if(!String(error.message).includes('duplicate column')) throw error; }
  }
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_series_occurrence ON tournaments(series_id, series_occurrence_at)').run();
}
const templateFields=['name','description','max_players','hours_per_move','rated','variant','theme_json','tournament_type','time_key','time_label','arena_duration_minutes','round_pause_seconds','mode','created_by_user_id'];
export async function activateTournamentSeries(env,row) {
  if (!row.recurrence_json || row.series_id) return;
  const config=seriesConfig(JSON.parse(row.recurrence_json));
  if(!config)return;
  const id='series_'+row.id;
  const template=Object.fromEntries(templateFields.map(key=>[key,row[key] ?? null]));
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO tournament_series (id,template_json,config_json,next_start_at,paused,updated_at) VALUES (?,?,?,?,0,?)`).bind(id,JSON.stringify(template),JSON.stringify(config),nextSeriesStart(row.scheduled_start_at,config),now),
    env.DB.prepare('UPDATE tournaments SET series_id = ?, series_occurrence_at = ? WHERE id = ? AND series_id IS NULL').bind(id,row.scheduled_start_at,row.id)
  ]);
}
export async function materializeTournamentSeries(env, now=Date.now()) {
  const rows=(await env.DB.prepare("SELECT * FROM tournament_series WHERE paused = 0 AND EXISTS (SELECT 1 FROM tournaments WHERE tournaments.series_id = tournament_series.id AND tournaments.status <> 'draft')").all()).results || [];
  for(const series of rows) {
    const config=seriesConfig(JSON.parse(series.config_json));
    let start=series.next_start_at;
    const template=JSON.parse(series.template_json);
    const grace=(template.mode==='arena'?Number(template.arena_duration_minutes || 90)/60:24)*HOUR;
    // Nach längerer Auszeit keine veralteten Turniere nacherzeugen.
    for(let n=0;Date.parse(start)+grace<=now && n<10000;n++) start=nextSeriesStart(start,config);
    if(Date.parse(start)-config.visibilityHours*HOUR>now)continue;
    const visibleAt=new Date(Date.parse(start)-config.visibilityHours*HOUR).toISOString();
    const registrationAt=template.mode==='arena'?null:new Date(Date.parse(start)-config.registrationHours*HOUR).toISOString();
    // Auch der vorhandene Scheduler kürzt IDs: Die Unterscheidung muss am Anfang stehen.
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(series.id+'|'+start));
    const id='series_'+Array.from(new Uint8Array(digest)).slice(0,16).map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const timestamp=new Date(now).toISOString();
    const columns=['id',...templateFields,'status','scheduled_start_at','visible_at','registration_opens_at','series_id','series_occurrence_at','created_at','updated_at','published_at'];
    const values=[id,...templateFields.map(k=>template[k]),'open',start,visibleAt,registrationAt,series.id,start,timestamp,timestamp,visibleAt];
    // D1 batch ist atomar; Revision und Eindeutigkeit schützen parallele Cron-/Listenaufrufe.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO tournaments (${columns.join(',')}) SELECT ${columns.map(()=>'?').join(',')} WHERE EXISTS (SELECT 1 FROM tournament_series WHERE id = ? AND paused = 0 AND next_start_at = ? AND updated_at = ?) ON CONFLICT(series_id,series_occurrence_at) DO NOTHING`).bind(...values,series.id,series.next_start_at,series.updated_at),
      env.DB.prepare('UPDATE tournament_series SET next_start_at = ?, updated_at = ? WHERE id = ? AND paused = 0 AND next_start_at = ? AND updated_at = ?').bind(nextSeriesStart(start,config),timestamp,series.id,series.next_start_at,series.updated_at)
    ]);
  }
}
export async function tournamentSeriesDto(env,id) {
  if(!id)return null;
  const row=await env.DB.prepare('SELECT * FROM tournament_series WHERE id = ?').bind(id).first();
  return row?{id:row.id,config:JSON.parse(row.config_json),template:JSON.parse(row.template_json),nextStartAt:row.next_start_at,paused:!!row.paused,updatedAt:row.updated_at}:null;
}

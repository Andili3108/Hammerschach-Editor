import { hsc08Page } from './hsc08-page.js';

// Separate from online tournaments: one private championship draft, no user/player links.
export function isHsc08Admin(user, isAdmin) {
  return !!user && isAdmin(user) && String(user.username || '').toLowerCase() === 'andili';
}
export function validateHsc08Draft(input) {
  if (!input || typeof input !== 'object') throw new Error('Konfiguration fehlt.');
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  if (title.length > 160) throw new Error('Bitte einen Titel mit höchstens 160 Zeichen eingeben.');
  if (description.length > 20000) throw new Error('Die Ausschreibung ist zu lang (maximal 20.000 Zeichen).');
  if (input.mode && !['round-robin', 'swiss'].includes(input.mode)) throw new Error('Bitte einen Turniermodus wählen.');
  if (!Array.isArray(input.participants) || input.participants.length > 200) throw new Error('Maximal 200 Teilnehmer sind möglich.');
  const ids = new Set();
  const participants = input.participants.map(p => {
    const name = String(p.name || '').trim();
    const id = String(p.id || '');
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(id) || ids.has(id)) throw new Error('Ungültige Teilnehmerkennung.');
    if (!name || name.length > 100 || /[\u0000-\u001f]/.test(name)) throw new Error('Teilnehmernamen müssen 1–100 Zeichen lang sein.');
    ids.add(id);
    const participant = {id, name};
    for (const key of ['dwz', 'estimatedRating']) {
      const value = p[key];
      if (value !== undefined && value !== null && value !== '') {
        if (!Number.isSafeInteger(value) || value < 1 || value > 9999) throw new Error('Spielstärke muss eine ganze Zahl zwischen 1 und 9999 sein.');
        participant[key] = value;
      }
    }
    return participant;
  });
  const scoring = input.scoring ?? 'classic';
  if (!['classic', 'three-point'].includes(scoring)) throw new Error('Ungültige Punktewertung.');
  const cycles = input.cycles ?? 1;
  if (![1, 2].includes(cycles)) throw new Error('Bitte Einfach- oder Doppelrunde wählen.');
  const rounds = input.rounds === '' || input.rounds == null ? null : input.rounds;
  if (rounds !== null && (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 199)) throw new Error('Die Rundenzahl muss zwischen 1 und 199 liegen.');
  function date(key) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value))) throw new Error('Bitte ein gültiges Datum eingeben.');
    return value;
  }
  const startsOn = date('startsOn'), endsOn = date('endsOn');
  if (startsOn && endsOn && startsOn > endsOn) throw new Error('Der letzte Spieltermin darf nicht vor dem Beginn liegen.');
  const timeControl = String(input.timeControl ?? '').trim();
  if (timeControl.length > 300) throw new Error('Die Bedenkzeit darf höchstens 300 Zeichen enthalten.');
  // Incomplete preparation can be saved; starting/releasing requires separate validation.
  // Lifecycle and game data are never accepted through this configuration endpoint.
  return {title, description, mode:input.mode || '', participants, scoring, cycles, rounds,
    startsOn, endsOn, timeControl, phase:'draft', rulesStatus:'pending'};
}
export async function handleHsc08(request, env, deps) {
  const path = new URL(request.url).pathname;
  const respond = (body, status = 200) => deps.json(body, {status, headers:{'cache-control':'no-store, max-age=0', 'x-content-type-options':'nosniff'}});
  if (request.method === 'OPTIONS') return respond({ok:true});
  const session = await deps.session(request);
  if (!isHsc08Admin(session?.user, deps.isAdmin)) return respond({ok:false, message:'Nicht verfügbar.'}, 404);
  if (path === '/api/hsc08/access' && request.method === 'GET') return respond({ok:true});
  if (path === '/api/hsc08/page' && request.method === 'GET') return respond({ok:true, html:hsc08Page()});
  if (path !== '/api/hsc08/championship') return respond({ok:false, message:'Nicht verfügbar.'}, 404);
  if (!['GET','POST','DELETE'].includes(request.method)) return respond({ok:false, message:'Methode nicht erlaubt.'}, 405);
  // Keep the row after clearing so revision numbers never reset (stale tabs cannot restore deleted data).
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS hsc08_championship (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0, document TEXT, updated_at TEXT)`).run();
  await env.DB.prepare('INSERT OR IGNORE INTO hsc08_championship (id, revision) VALUES (1, 0)').run();
  const snapshot = async () => {
    const row = await env.DB.prepare('SELECT revision, document FROM hsc08_championship WHERE id=1').first();
    return {revision:row.revision, tournament:row.document ? JSON.parse(row.document) : null};
  };
  if (request.method === 'GET') return respond({ok:true, ...await snapshot()});
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 100000) return respond({ok:false, message:'Die Eingabe ist zu groß.'}, 413);
    body = JSON.parse(raw);
  } catch { return respond({ok:false, message:'Ungültige Eingabe.'}, 400); }
  if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0) return respond({ok:false, message:'Bitte die Seite neu laden.'}, 400);
  let document = null;
  if (request.method === 'DELETE') {
    if (body.confirmation !== 'TURNIER LÖSCHEN') return respond({ok:false, message:'Die Löschbestätigung fehlt.'}, 400);
    const checked = await deps.reauthenticate(request, session.user, body.password);
    if (!checked.ok) return respond({ok:false, message:checked.message}, checked.status);
  } else {
    try { document = JSON.stringify(validateHsc08Draft(body.tournament)); }
    catch (error) { return respond({ok:false, message:error.message}, 400); }
  }
  const changed = await env.DB.prepare('UPDATE hsc08_championship SET document=?, revision=revision+1, updated_at=? WHERE id=1 AND revision=?')
    .bind(document, new Date().toISOString(), body.revision).run();
  if (Number(changed.meta?.changes) !== 1) return respond({ok:false, message:'Inzwischen wurde der Stand geändert. Bitte neu laden; deine Eingaben wurden nicht überschrieben.'}, 409);
  return respond({ok:true, ...await snapshot()});
}

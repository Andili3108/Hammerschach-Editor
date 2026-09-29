// Negative Ergebnisse nur für die automatische Live-Partiensuche merken.
// Raumzugriff, Archiv, Einladungen und Account-Raumindex bleiben unverändert.
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ready = new WeakMap();

async function ensureTable(db) {
  if (!ready.has(db)) {
    const promise = db.prepare(`CREATE TABLE IF NOT EXISTS live_room_probe_cache (
      user_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      reference_at TEXT NOT NULL,
      recheck_after INTEGER NOT NULL,
      PRIMARY KEY (user_id, room_id)
    )`).run().catch(error => { ready.delete(db); throw error; });
    ready.set(db, promise);
  }
  await ready.get(db);
}

export async function readLiveRoomProbeCache(env, userId) {
  try {
    await ensureTable(env.DB);
    const result = await env.DB.prepare(
      'SELECT room_id, reference_at, recheck_after FROM live_room_probe_cache WHERE user_id = ?'
    ).bind(userId).all();
    return new Map((result.results || []).map(row => [row.room_id, row]));
  } catch (_) {
    // Ein Cache-Fehler darf keine Partie unsichtbar machen: normal weiterprüfen.
    return null;
  }
}

export function maySkipLiveRoomProbe(cache, candidate, now) {
  const previous = cache && cache.get(candidate.room_id);
  // Ein neuer Beitritt oder eine Einladung aktualisiert den bestehenden Index
  // bzw. das E-Mail-Protokoll. Auch ein später beendeter alter Scan kann diesen
  // neueren Verweis nicht unterdrücken, weil seine Referenz nicht mehr passt.
  return !!previous && previous.reference_at === candidate.last_seen_at
    && Number(previous.recheck_after) > now;
}

export function inactiveLiveRoomRecheckAt(status, summary, referenceAt, now) {
  if (!summary || typeof summary !== 'object') return 0;
  if (status === 200 && summary.ok === true &&
      (summary.ended === true || summary.cancelled === true)) return now + DAY;

  // Veränderliche Zustände nur bei alten Verweisen merken. Frisch angelegte
  // Räume können noch auf ihre Initialisierung oder Platzbelegung warten.
  const referenceTime = Date.parse(referenceAt);
  if (!Number.isFinite(referenceTime) || now - referenceTime < DAY) return 0;
  if (status === 403 && summary.ok === false && summary.code === 'NOT_A_PLAYER') return now + HOUR;
  if (status === 200 && summary.ok === true && summary.started === false &&
      summary.ended === false && (summary.mode === '' || summary.mode === 'daily')) return now + HOUR;
  // Laufende Live-Partien, offene Live-Einladungen, technische Fehler und
  // unklare Antworten werden niemals als negatives Ergebnis gespeichert.
  return 0;
}

export async function saveLiveRoomProbeCache(env, userId, entries) {
  if (!entries.length) return;
  try {
    await ensureTable(env.DB);
    await env.DB.batch(entries.map(entry => env.DB.prepare(
      `INSERT INTO live_room_probe_cache (user_id, room_id, reference_at, recheck_after)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, room_id) DO UPDATE SET
         reference_at = excluded.reference_at, recheck_after = excluded.recheck_after`
    ).bind(userId, entry.room_id, entry.last_seen_at, entry.recheck_after)));
  } catch (_) {
    // Nur eine Optimierung; fehlgeschlagene Speicherung ändert keine Spielliste.
  }
}

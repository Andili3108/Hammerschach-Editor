export const DAILY_LOW_TIME_MS = 8 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

// Ausschließlich den maßgeblichen Raumzustand verwenden, keine Browseruhr.
// Classic und Freestyle verwenden dieselbe Daily-Uhr.
export function dailyLowTimeSnapshot(stored, now = Date.now()) {
  const game = stored.get('game');
  const clock = stored.get('clock');
  const control = stored.get('timeControl');
  if (stored.get('cancelled')?.cancelled || control?.mode !== 'daily' ||
      !game?.started || game.ended || !clock?.running || clock.timeLost ||
      !['w', 'b'].includes(clock.turn)) return null;
  const deadline = Number(clock.lastTs) + Number(clock[clock.turn + 'Ms']);
  const remaining = deadline - now;
  if (!Number.isFinite(deadline) || remaining <= 0 || remaining > DAILY_LOW_TIME_MS) return null;
  return {turn:clock.turn, ply:(stored.get('moves') || []).length, deadlineAt:new Date(deadline).toISOString()};
}

export async function processDailyLowTimeReminders(env, roomStub, now = Date.now()) {
  // Bereits versendete Warnungen aus demselben Acht-Stunden-Fenster auslassen.
  // Die endgültige Duplikatsperre verwendet im Raum die Zugnummer.
  // Kleine Pakete begrenzen die Arbeit pro Minutenlauf; versendete Einträge
  // fallen beim nächsten Lauf heraus. Fehler erhalten fünf Minuten Abstand.
  const result = await env.DB.prepare(`
    SELECT d.room_id
      FROM daily_games d
      JOIN users u ON u.id = CASE d.turn WHEN 'w' THEN d.white_user_id ELSE d.black_user_id END
      LEFT JOIN user_email_preferences p ON p.user_id = u.id
      LEFT JOIN user_email_status s ON s.user_id = u.id
     WHERE d.started = 1 AND d.ended = 0 AND d.turn IN ('w', 'b')
       AND d.deadline_at > ? AND d.deadline_at <= ?
       AND COALESCE(p.daily_low_time_enabled, 1) = 1
       AND TRIM(COALESCE(u.email, '')) <> ''
       AND (s.user_id IS NULL OR (s.verified = 1 AND LOWER(TRIM(s.email)) = LOWER(TRIM(u.email))))
       AND NOT EXISTS (
         SELECT 1 FROM email_notification_log n
          WHERE n.room_id = d.room_id AND n.user_id = u.id AND n.notification_type = 'daily_low_time'
            AND julianday(n.created_at) >= julianday(d.deadline_at) - 8.0 / 24
            AND (n.status = 'sent' OR n.updated_at > ?)
       )
     ORDER BY d.deadline_at, d.room_id LIMIT 50
  `).bind(new Date(now).toISOString(), new Date(now + DAILY_LOW_TIME_MS).toISOString(),
    new Date(now - RETRY_MS).toISOString()).all();
  for (const row of result.results || []) {
    try {
      const response = await roomStub(row.room_id).fetch(new Request(
        'https://game-room.internal/daily-low-time-reminder?room=' + encodeURIComponent(row.room_id),
        {method:'POST'}
      ));
      if (!response.ok) console.error('Daily-Zeitwarnung konnte nicht versendet werden', row.room_id);
      await response.text();
    } catch (_) { console.error('Daily-Zeitwarnung: Spielraum nicht erreichbar', row.room_id); }
  }
}

export function prepareDailyLowTimeEmail(payload, {escape, formatDate}) {
  const recipientName = String(payload.recipientName || 'Schachfreund');
  const opponentName = String(payload.opponentName || 'dein Gegner');
  const deadline = formatDate(payload.deadlineAt);
  const sentence = `In deiner Daily-Partie gegen ${opponentName} bist du am Zug. Dir bleiben höchstens acht Stunden für deinen nächsten Zug.`;
  const note = 'Diese Erinnerung kannst du in deiner Accountverwaltung unter E-Mail-Benachrichtigungen abschalten.';
  return {
    ok:true, mailType:'daily_low_time', recipientEmail:payload.recipientEmail, recipientName,
    subject:`Deine Zugzeit läuft ab – Daily-Partie gegen ${opponentName}`,
    textPart:`Hallo ${recipientName},\n\n${sentence}\n\nFristende: ${deadline} (Europe/Berlin)\n\nPartie öffnen:\n${payload.inviteUrl}\n\n${note}\n\nViele Grüße\nGamer`,
    htmlPart:`<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,sans-serif;color:#222"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #eadde0;border-radius:16px;padding:24px"><h2 style="color:#843f46">Deine Daily-Zugzeit läuft ab</h2><p>Hallo ${escape(recipientName)},</p><p>${escape(sentence)}</p><p><strong>Fristende: ${escape(deadline)} (Europe/Berlin)</strong></p><p style="margin:24px 0"><a href="${escape(payload.inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:24px;background:#843f46;color:white;text-decoration:none;font-weight:bold">Partie öffnen</a></p><p style="word-break:break-all">${escape(payload.inviteUrl)}</p><p style="font-size:12px;color:#666">${escape(note)}</p><p>Viele Grüße<br><strong>Gamer</strong></p></div></body></html>`
  };
}

export async function sendDailyLowTimeReminder(env, payload, deps) {
  const recipient = await deps.loadRecipient(env, payload.recipientUserId, 'dailyLowTimeEnabled');
  if (!recipient.ok) return {ok:true, skipped:true, reason:recipient.reason};
  if (!(await deps.ensureLog(env))) return {ok:false, code:'LOG_UNAVAILABLE'};
  if (!(await deps.isCurrent())) return {ok:true, skipped:true, reason:'turn_changed'};
  const key = `daily_low_time:${payload.roomId}:${payload.ply}:${payload.recipientUserId}`;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  // Atomare Reservierung verhindert parallelen Versand durch mehrere Cron-Läufe.
  const claim = await env.DB.prepare(`
    INSERT INTO email_notification_log
      (notification_key, notification_type, user_id, room_id, status, attempts, created_at, updated_at)
    VALUES (?, 'daily_low_time', ?, ?, 'pending', 1, ?, ?)
    ON CONFLICT(notification_key) DO UPDATE SET
      status = 'pending', attempts = email_notification_log.attempts + 1,
      updated_at = excluded.updated_at, last_error = NULL
    WHERE email_notification_log.status <> 'sent' AND email_notification_log.updated_at <= ?
  `).bind(key, payload.recipientUserId, payload.roomId, nowIso, nowIso, new Date(now - RETRY_MS).toISOString()).run();
  if (!Number(claim?.meta?.changes)) return {ok:true, skipped:true, reason:'already_claimed'};
  if (!(await deps.isCurrent())) {
    await deps.complete(env, key, {ok:false, code:'TURN_CHANGED'});
    return {ok:true, skipped:true, reason:'turn_changed'};
  }
  let result;
  try {
    result = await deps.send(env, prepareDailyLowTimeEmail({
      ...payload, recipientEmail:recipient.email, recipientName:recipient.user.username
    }, deps));
  } catch (_) { result = {ok:false, code:'DAILY_LOW_TIME_MAIL_FAILED', message:'Zeitwarnung konnte nicht versendet werden.'}; }
  await deps.complete(env, key, result);
  return result;
}

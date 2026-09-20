// Read the existing rating ledger. No duplicate history or diagram storage.
export async function handleRatingHistoryApi(request, env, url, deps) {
  const match = url.pathname.match(/^\/api\/members\/([A-Za-z0-9_-]{8,128})\/rating-history$/);
  if (!match || request.method !== 'GET') return null;
  const {json, lookupAuthSession, bearerTokenFromRequest, ensureRatingTables, ratingTypeInfo} = deps;
  const reply = (data, status = 200) => json(data, {status, headers:{'Cache-Control':'private, no-store'}});
  const session = await lookupAuthSession(env, bearerTokenFromRequest(request));
  if (!session) return reply({ok:false, message:'Ratingverläufe sind nur nach Login verfügbar.'}, 401);
  const type = url.searchParams.get('type');
  const range = url.searchParams.get('range') || 'all';
  const info = ratingTypeInfo(type);
  const offset = Number(url.searchParams.get('offset') || 0);
  const suppliedSnapshot = url.searchParams.get('snapshot');
  if (!info || !['3m','1y','3y','all'].includes(range) || !Number.isSafeInteger(offset) || offset < 0 ||
      (suppliedSnapshot !== null && (!/^\d+$/.test(suppliedSnapshot) || !Number.isSafeInteger(Number(suppliedSnapshot)))) || (offset && suppliedSnapshot === null)) {
    return reply({ok:false, message:'Ungültige Auswahl für den Ratingverlauf.'}, 400);
  }
  try {
    const member = await env.DB.prepare('SELECT id, username FROM users WHERE id = ? LIMIT 1').bind(match[1]).first();
    if (!member) return reply({ok:false, message:'Das Mitglied wurde nicht gefunden.'}, 404);
    await ensureRatingTables(env);
    const snapshot = suppliedSnapshot === null
      ? Number((await env.DB.prepare('SELECT MAX(rowid) AS snapshot FROM rated_games').first())?.snapshot || 0)
      : Number(suppliedSnapshot);
    // Use the newest included ledger entry as the stable upper bound for pagination,
    // while date ranges are measured from today, including inactive players.
    const since = new Date();
    if (range === '3m') since.setUTCMonth(since.getUTCMonth() - 3);
    if (range === '1y') since.setUTCFullYear(since.getUTCFullYear() - 1);
    if (range === '3y') since.setUTCFullYear(since.getUTCFullYear() - 3);
    const from = range === 'all' ? '' : since.toISOString();
    const where = 'rating_type = ? AND (white_user_id = ? OR black_user_id = ?) AND rated_at >= ? AND rowid <= ?';
    const args = [type, member.id, member.id, from, snapshot];
    const total = Number((await env.DB.prepare('SELECT COUNT(*) AS total FROM rated_games WHERE ' + where).bind(...args).first())?.total || 0);
    const result = await env.DB.prepare(`SELECT rated_at,
      CASE WHEN white_user_id = ? THEN white_rating_before ELSE black_rating_before END AS before_rating,
      CASE WHEN white_user_id = ? THEN white_rating_after ELSE black_rating_after END AS after_rating,
      CASE WHEN white_user_id = ? THEN white_deviation_after ELSE black_deviation_after END AS deviation
      FROM rated_games WHERE ${where} ORDER BY rated_at DESC, rowid DESC LIMIT 500 OFFSET ?`
    ).bind(member.id, member.id, member.id, ...args, offset).all();
    const rows = result.results || [];
    const points = rows.map(row => ({at:row.rated_at, before:Math.round(row.before_rating), rating:Math.round(row.after_rating), deviation:Number(row.deviation)})).reverse();
    return reply({ok:true, member:{id:member.id, username:member.username}, type, label:info.label, range, total, snapshot,
      nextOffset:offset + rows.length < total ? offset + rows.length : null, points});
  } catch (error) {
    console.error('Rating history failed', error?.message || 'unknown');
    return reply({ok:false, message:'Der Ratingverlauf konnte nicht geladen werden. Bitte versuche es erneut.'}, 500);
  }
}

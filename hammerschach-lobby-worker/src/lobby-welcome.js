// Only new registrations get a pending welcome. Existing accounts remain returning members.
export async function ensureLobbyWelcome(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS lobby_welcome (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_visit_id TEXT
  )`).run();
}
export function newLobbyWelcomeStatement(env, userId) {
  return env.DB.prepare('INSERT INTO lobby_welcome (user_id) VALUES (?)').bind(userId);
}
export async function handleLobbyWelcomeApi(request, env, url, deps) {
  if (url.pathname !== '/api/account/lobby-welcome') return null;
  const reply = (data, status=200) => deps.json(data, {status, headers:{'cache-control':'no-store'}});
  const session = await deps.lookupAuthSession(env, deps.bearerTokenFromRequest(request));
  if (!session) return reply({ok:false, message:'Bitte zuerst anmelden.'}, 401);
  if (request.method !== 'POST') return reply({ok:false, message:'Methode nicht erlaubt.'}, 405);
  const body = await deps.readJsonBody(request);
  if (!body || typeof body.visitId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.visitId))
    return reply({ok:false, message:'Ungültiger Lobbybesuch.'}, 400);
  try {
    await ensureLobbyWelcome(env);
    // Atomic claim; a retry of this page visit returns the same greeting.
    const row = await env.DB.prepare(`UPDATE lobby_welcome
      SET first_visit_id = COALESCE(first_visit_id, ?)
      WHERE user_id = ? RETURNING first_visit_id`
    ).bind(body.visitId, String(session.user.id)).first();
    return reply({ok:true, firstVisit:!!row && row.first_visit_id === body.visitId});
  } catch (_) {
    return reply({ok:false, message:'Begrüßung ist vorübergehend nicht verfügbar.'}, 503);
  }
}

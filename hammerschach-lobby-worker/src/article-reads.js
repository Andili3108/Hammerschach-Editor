// Ausschließlich Lesemarkierungen, keine Lesezeiten oder Nutzungsprofile.
export const validArticleKey = key => typeof key === 'string' && /^(news|report):[a-z0-9][a-z0-9-]{0,79}$/.test(key);
export async function ensureArticleReads(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS article_reads (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    article_key TEXT NOT NULL, PRIMARY KEY(user_id, article_key)
  )`).run();
}
export async function deleteArticleReads(env, userId) {
  await ensureArticleReads(env);
  await env.DB.prepare('DELETE FROM article_reads WHERE user_id = ?').bind(userId).run();
}
export async function handleArticleReadsApi(request, env, url, deps) {
  if (url.pathname !== '/api/account/article-reads') return null;
  const reply = (data, status=200) => deps.json(data,{status,headers:{'cache-control':'no-store'}});
  const session = await deps.lookupAuthSession(env,deps.bearerTokenFromRequest(request));
  if (!session) return reply({ok:false,code:'NOT_AUTHENTICATED',message:'Bitte zuerst anmelden.'},401);
  if (!['GET','POST'].includes(request.method)) return reply({ok:false,message:'Methode nicht erlaubt.'},405);
  let keys = [];
  if (request.method === 'POST') {
    const body = await deps.readJsonBody(request);
    if (!body || !Array.isArray(body.read) || body.read.length>50 || !body.read.every(validArticleKey))
      return reply({ok:false,message:'Ungültige Lesemarkierungen.'},400);
    keys = [...new Set(body.read)];
  }
  try {
    await ensureArticleReads(env);
    const userId = String(session.user.id);
    if (keys.length) await env.DB.batch(keys.map(key=>env.DB.prepare(
      `INSERT OR IGNORE INTO article_reads (user_id, article_key)
       SELECT ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
       AND (SELECT COUNT(*) FROM article_reads WHERE user_id = ?) < 1000`
    ).bind(userId,key,userId,userId)));
    const rows = await env.DB.prepare('SELECT article_key FROM article_reads WHERE user_id = ? ORDER BY article_key').bind(userId).all();
    const read = rows.results.map(row=>row.article_key);
    if (keys.some(key=>!read.includes(key))) return reply({ok:false,message:'Lesestand konnte nicht vollständig gespeichert werden.'},409);
    return reply({ok:true,read});
  } catch (_) {
    return reply({ok:false,message:'Lesestand ist vorübergehend nicht erreichbar.'},503);
  }
}

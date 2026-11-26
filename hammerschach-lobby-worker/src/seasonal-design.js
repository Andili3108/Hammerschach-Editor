// One durable setting, shared by anonymous visitors and members. No date rules.
const KEY = 'christmas_mode';
export async function handleSeasonalApi(request, env, url, deps) {
  const adminRoute = url.pathname === '/api/admin/seasonal-design';
  if (!adminRoute && url.pathname !== '/api/seasonal-design') return null;
  const reply = (data, status = 200) => deps.json(data, {status, headers:{'cache-control':'no-store'}});
  let admin;
  if (adminRoute) {
    admin = await deps.requireAdminSession(request, env);
    if (!admin.ok) return admin.response;
  }
  if (request.method !== 'GET' && !(adminRoute && request.method === 'POST'))
    return reply({ok:false, message:'Methode nicht erlaubt.'}, 405);
  try {
    if (request.method === 'POST') {
      const body = await deps.readJsonBody(request);
      if (!body || typeof body.christmasEnabled !== 'boolean')
        return reply({ok:false, message:'Bitte Weihnachtsmodus ein- oder ausschalten.'}, 400);
      await deps.writeAdminSetting(env, KEY, String(body.christmasEnabled), admin.session.user.id);
      return reply({ok:true, christmasEnabled:body.christmasEnabled});
    }
    let saved = await deps.readAdminSetting(env, KEY);
    if (!saved) {
      if (!await deps.ensureAdminSettingsTable(env)) throw new Error('Database unavailable');
      // Never overwrite a concurrently saved admin choice, including false.
      await env.DB.prepare(`INSERT INTO admin_settings (setting_key, setting_value, updated_at, updated_by)
        VALUES (?, 'true', ?, '') ON CONFLICT(setting_key) DO NOTHING`).bind(KEY, new Date().toISOString()).run();
      saved = await deps.readAdminSetting(env, KEY);
      if (!saved) throw new Error('Setting unavailable');
    }
    return reply({ok:true, christmasEnabled:saved.value === 'true'});
  } catch (_) {
    return reply({ok:false, message:'Die saisonale Gestaltung konnte nicht geladen oder gespeichert werden. Bitte erneut versuchen.'}, 503);
  }
}

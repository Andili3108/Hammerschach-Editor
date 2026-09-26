const KEY = 'training_impulses_v1';
const MAX = 20;
const SEED = [
  ['vyfMVzeKEEc','Ich erkläre dir jede Schachstrategie von A bis Z!',true],
  ['KEYj2MH2XG4','Sizilianische Eröffnung für Spieler unter 2000 Elo: Jede Variante meistern ohne Theorie-Marathon'],
  ['9CfAhy--SVc','Das 18-Minuten-Eröffnungsrepertoire für Schachanfänger!',true],
  ['Ga9XsodkbVQ','Angriff oder Material: Was ist wichtiger?'],
  ['cRY1Un1LhUs','Das ist der häufigste Eröffnungsfehler im Schach!'],
  ['eetOmsq2qW0','Findest du den Angriff auf den König'],
  ['WLIKBzhlX9w','Wie gewinnt Weiß?'],
  ['y_R1yGSYd50','Schachtraining! Züge raten mit TBG!'],
  ['sKI7vh2f-7I','Trainingspläne für Schachspieler.',true],
  ['t-OkCa94RDQ','Top 5 Tipps – Effektives Schachtraining | Josis Schachschule',true],
  ['uyrLxRVYClc','Magnus Carlsen Teaches How to Win with the London System!'],
  ['FXb7L7b1Q5U','5 fatale Fehler, die dich unter 1500 Elo gefangen halten!'],
  ['2ISA98YtPJk','Die große Lüge im Schachtraining – Du brauchst kein Geld, um richtig stark zu werden!'],
  ['xNBZJjslJkk','Schachkalkulation für Anfänger: Gewinnen Sie schneller, ohne Züge zu übersehen']
];

export function youtubeId(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return '';
    const host = url.hostname.toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else id = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})\/?$/)?.[1] || '';
    }
    return /^[\w-]{11}$/.test(id) ? id : '';
  } catch (_) { return ''; }
}

export function validateVideos(videos) {
  if (!Array.isArray(videos) || videos.length > MAX) throw new Error('Bitte höchstens 20 Videoplätze übermitteln.');
  return Array.from({length:MAX}, (_, i) => {
    const item = videos[i] || {};
    const title = String(item.title || '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
    const url = String(item.url || '').trim();
    if (title.length > 160) throw new Error(`Platz ${i+1}: Die Überschrift darf höchstens 160 Zeichen haben.`);
    const id = youtubeId(url);
    if ((title || url) && (!title || !id)) throw new Error(`Platz ${i+1}: Bitte eine Überschrift und einen gültigen YouTube-Videolink eintragen oder beide Felder leeren.`);
    return {id:`impulse_${i+1}`, title, url:id ? `https://www.youtube.com/watch?v=${id}` : '', public:!!title && item.public === true};
  });
}

async function load(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_settings (
    setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
  )`).run();
  const row = await env.DB.prepare('SELECT setting_value FROM admin_settings WHERE setting_key = ? LIMIT 1').bind(KEY).first();
  // Only a missing configuration uses the seed; an intentionally empty list stays empty.
  return row ? validateVideos(JSON.parse(row.setting_value).videos) : validateVideos(SEED.map(([id,title,isPublic]) => ({title,url:`https://www.youtube.com/watch?v=${id}`,public:!!isPublic})));
}

export async function handleTrainingImpulsesApi(request, env, url, helpers) {
  const adminRoute = url.pathname === '/api/admin/training-impulses';
  if (!adminRoute && url.pathname !== '/api/training-impulses') return null;
  const {json,lookupAuthSession,bearerTokenFromRequest,requireAdminSession,readJsonBody} = helpers;
  const reply = (data,status=200) => json(data,{status,headers:{'cache-control':'no-store'}});
  if (!['GET', ...(adminRoute ? ['POST'] : [])].includes(request.method)) return reply({ok:false,message:'Methode nicht erlaubt.'},405);
  let admin;
  if (adminRoute) {
    admin = await requireAdminSession(request,env);
    if (!admin.ok) return admin.response;
  }
  if (request.method === 'POST') {
    const body = await readJsonBody(request);
    let videos;
    try { videos = validateVideos(body?.videos); }
    catch (error) { return reply({ok:false,message:error.message},400); }
    await load(env);
    await env.DB.prepare(`INSERT INTO admin_settings (setting_key,setting_value,updated_at,updated_by) VALUES (?,?,?,?)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
      .bind(KEY,JSON.stringify({videos}),new Date().toISOString(),String(admin.session.user.id)).run();
    return reply({ok:true,max:MAX,videos,message:'Die Trainingsimpulse wurden gespeichert.'});
  }
  const videos = await load(env);
  if (adminRoute) return reply({ok:true,max:MAX,videos});
  const session = await lookupAuthSession(env,bearerTokenFromRequest(request));
  return reply({ok:true,max:MAX,videos:videos.filter(item=>item.title && item.url).map(item=>{
    const locked = !item.public && !session;
    return {id:item.id,title:item.title,public:item.public,locked,...(!locked ? {videoId:youtubeId(item.url)} : {})};
  })});
}

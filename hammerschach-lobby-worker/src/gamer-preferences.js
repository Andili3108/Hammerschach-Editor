// Account preferences: allowlisted fields, partial atomic updates, no device dimensions.
const defaults={scheme:'soft',board:'basis',pieces:'cburnett',coordinates:true,lastMove:true,legalMoves:true,reducedMotion:false,moveMethod:'both',confirmDaily:true,confirmLive:false,dailyNext:'manual',dailyOrder:'deadline',premoves:true,autoQueen:false,sound:true,moveSound:true,resultSound:true,chatSound:true,lowTimeSound:true,volume:80,hideChat:false,focus:false,invitations:'everyone'};
const enums={scheme:['light','soft','dark'],board:['basis','braun','grau','gruen','royal-walnut','onyx-elegance'],pieces:['cburnett','merida','chessnut','fantasy','merida-silversteel','merida-royalwood'],moveMethod:['both','click','drag'],dailyNext:['manual','auto'],dailyOrder:['deadline','oldest'],invitations:['everyone','favorites','nobody']};
export function validPreferencePatch(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const out={};
 for(const [key,n] of Object.entries(value)){
  if(!Object.hasOwn(defaults,key))return null;
  if(enums[key] ? !enums[key].includes(n) : typeof defaults[key]==='boolean' ? typeof n!=='boolean' : !Number.isFinite(n)||n<0||n>100)return null;
  out[key]=n;
 }
 return out;
}
async function ensure(env){if(!env.DB)throw new Error('DB unavailable');await env.DB.prepare(`CREATE TABLE IF NOT EXISTS gamer_preferences (user_id TEXT PRIMARY KEY, preferences TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)`).run();}
export async function getGamerPreferences(env,id){await ensure(env);const row=await env.DB.prepare('SELECT preferences FROM gamer_preferences WHERE user_id = ?').bind(String(id)).first();try{return JSON.parse(row?.preferences||'{}');}catch(_){return {};}}
export async function saveGamerPreferences(env,id,patch){await ensure(env);await env.DB.prepare(`INSERT INTO gamer_preferences(user_id,preferences,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET preferences=json_patch(gamer_preferences.preferences,excluded.preferences), updated_at=excluded.updated_at`).bind(String(id),JSON.stringify(patch),new Date().toISOString()).run();return getGamerPreferences(env,id);}

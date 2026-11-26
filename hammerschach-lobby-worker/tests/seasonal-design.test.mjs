import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleSeasonalApi} from '../src/seasonal-design.js';
function setup(t) {
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec('CREATE TABLE admin_settings(setting_key TEXT PRIMARY KEY,setting_value TEXT,updated_at TEXT,updated_by TEXT)');
 const env={DB:{prepare(q){let args=[];return{bind(...a){args=a;return this},async run(){return sql.prepare(q).run(...args)}}}}};
 const deps={json:(d,i)=>new Response(JSON.stringify(d),i),ensureAdminSettingsTable:async()=>true,
 readAdminSetting:async()=>{const row=sql.prepare('SELECT setting_value AS value FROM admin_settings WHERE setting_key=?').get('christmas_mode');return row||null},
 writeAdminSetting:async(e,k,v,u)=>sql.prepare('INSERT INTO admin_settings VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by').run(k,v,'now',u),
 readJsonBody:async r=>{try{return await r.json()}catch{return null}},
 requireAdminSession:async r=>r.headers.get('authorization')==='admin'?{ok:true,session:{user:{id:'admin'}}}:{ok:false,response:new Response('{}',{status:r.headers.has('authorization')?403:401})}};
 const call=(path='/api/seasonal-design',method='GET',body,token)=>{const url=new URL(path,'https://test.invalid');return handleSeasonalApi(new Request(url,{method,headers:token?{authorization:token}:{},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env,url,deps)};
 return{call,sql,deps};
}
test('Initial AN wird dauerhaft gespeichert; AUS bleibt über wiederholte Abrufe erhalten',async t=>{
 const {call,sql}=setup(t);assert.equal((await(await call()).json()).christmasEnabled,true);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM admin_settings').get().n,1);
 assert.equal((await call('/api/admin/seasonal-design','POST',{christmasEnabled:false},'admin')).status,200);
 for(let i=0;i<3;i++){const r=await call();assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).christmasEnabled,false)}
 assert.equal(sql.prepare('SELECT updated_by FROM admin_settings').get().updated_by,'admin');
});
test('Nur Admins dürfen schreiben; ungültige Werte verändern den Zustand nicht',async t=>{
 const {call}=setup(t);await call();
 for(const [token,status] of [[undefined,401],['member',403]])assert.equal((await call('/api/admin/seasonal-design','POST',{christmasEnabled:false},token)).status,status);
 assert.equal((await call('/api/seasonal-design','POST',{christmasEnabled:false},'admin')).status,405);
 assert.equal((await call('/api/admin/seasonal-design','POST',{christmasEnabled:'false'},'admin')).status,400);
 assert.equal((await(await call()).json()).christmasEnabled,true);
});
test('Parallele Initialisierung überschreibt gespeichertes AUS nicht; Datenbankausfall liefert Fehler',async t=>{
 const {call,deps}=setup(t);const read=deps.readAdminSetting;let first=true;
 deps.readAdminSetting=async()=>{if(first){first=false;await deps.writeAdminSetting(null,'christmas_mode','false','admin');return null}return read()};
 assert.equal((await(await call()).json()).christmasEnabled,false);
 deps.readAdminSetting=async()=>{throw Error('offline')};assert.equal((await call()).status,503);
});

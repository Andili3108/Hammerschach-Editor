import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {ensureLobbyWelcome,newLobbyWelcomeStatement,handleLobbyWelcomeApi} from '../src/lobby-welcome.js';

async function server(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('new'),('old'),('other');");
  const env={DB:{prepare(query){let values=[];return {bind(...v){values=v;return this;},async run(){return sql.prepare(query).run(...values);},async first(){return sql.prepare(query).get(...values)||null;}};}}};
  await ensureLobbyWelcome(env);await newLobbyWelcomeStatement(env,'new').run();await newLobbyWelcomeStatement(env,'other').run();
  const deps={json:(data,init)=>new Response(JSON.stringify(data),init),lookupAuthSession:async(e,token)=>['new','old','other'].includes(token)?{user:{id:token}}:null,bearerTokenFromRequest:r=>r.headers.get('authorization'),readJsonBody:r=>r.json()};
  async function call(user,visitId='aaaaaaaaaaaaaaaa',method='POST'){
    const url=new URL('https://example.test/api/account/lobby-welcome');
    return handleLobbyWelcomeApi(new Request(url,{method,headers:{authorization:user},...(method==='POST'?{body:JSON.stringify({visitId})}:{})}),env,url,deps);
  }
  return {sql,call};
}
test('Erstbesuch, Wiederholung derselben Anfrage und späterer Besuch auf anderem Gerät',async t=>{
  const {call}=await server(t);
  for(const [visitId,firstVisit] of [['aaaaaaaaaaaaaaaa',true],['aaaaaaaaaaaaaaaa',true],['bbbbbbbbbbbbbbbb',false],['aaaaaaaaaaaaaaaa',true]]){
    const response=await call('new',visitId);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).firstVisit,firstVisit);
  }
});
test('Bestandsmitglieder bleiben wiederkehrend; Konten sind getrennt',async t=>{
  const {call}=await server(t);
  assert.equal((await (await call('old')).json()).firstVisit,false);
  await call('new');assert.equal((await (await call('other')).json()).firstVisit,true);
});
test('Parallel eintreffende neue Besuche erhalten nur einmal die Erstbegrüßung',async t=>{
  const {call}=await server(t);
  const replies=await Promise.all([call('new','aaaaaaaaaaaaaaaa'),call('new','bbbbbbbbbbbbbbbb')]);
  const results=await Promise.all(replies.map(r=>r.json()));assert.equal(results.filter(r=>r.firstVisit).length,1);
});
test('Anonyme, ungültige und lesende Anfragen verbrauchen keinen Erstbesuch',async t=>{
  const {call}=await server(t);
  assert.equal((await call('guest')).status,401);assert.equal((await call('new','bad')).status,400);assert.equal((await call('new',null,'GET')).status,405);
  assert.equal((await (await call('new')).json()).firstVisit,true);
});
test('Kontolöschung entfernt auch den Begrüßungszustand',async t=>{
  const {sql}=await server(t);sql.exec("DELETE FROM users WHERE id='new'");assert.equal(sql.prepare("SELECT * FROM lobby_welcome WHERE user_id='new'").get(),undefined);
});

const source=readFileSync(new URL('../../Gamer/js/lobby-welcome.js',import.meta.url),'utf8');
function client(){
  const requests=[];
  const c=vm.createContext({crypto:webcrypto,onlineAuthToken:'',onlineAuthUser:null,document:{hidden:false},statusEl:{textContent:''},inLobby:true,inTool:false,cleanDisplayName:s=>String(s||'').trim(),Date});
  c.isMemberLobbyView=()=>c.inLobby;c.embeddedToolActive=()=>c.inTool;
  c.authApi=(url,options)=>new Promise((resolve,reject)=>requests.push({url,body:JSON.parse(options.body),resolve,reject}));
  vm.runInContext(source,c);
  return {c,requests,show(){c.statusEl.textContent=c.lobbyWelcomeText();return c.statusEl.textContent;},login(id='new',username='Andili'){c.onlineAuthToken='token-'+id;c.onlineAuthUser={id,username};}};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('Besucher und Erstbesucher erhalten die vereinbarten Texte; Aktualisieren bleibt stabil',async()=>{
  const f=client();assert.equal(f.show(),'Willkommen im Hammerschach-Gamer!');assert.equal(f.requests.length,0);
  f.login();assert.equal(f.show(),'Willkommen im Hammerschach-Gamer, Andili!');f.show();assert.equal(f.requests.length,1);
  f.requests[0].resolve({firstVisit:true});await flush();assert.equal(f.show(),'Willkommen im Hammerschach-Gamer, Andili!');assert.equal(f.requests.length,1);
});
test('Wiederkehrende Mitglieder werden persönlich begrüßt; Namensänderung wird übernommen',async()=>{
  const f=client();f.login();f.show();f.requests[0].resolve({firstVisit:false});await flush();assert.equal(f.c.statusEl.textContent,'Willkommen zurück, Andili!');
  f.c.onlineAuthUser.username='NeuerName';assert.equal(f.show(),'Willkommen zurück, NeuerName!');
});
test('Verspätete Antwort überschreibt weder Aktionen noch den Status eines anderen Kontos',async()=>{
  const f=client();f.login();f.show();f.c.statusEl.textContent='Einladungslink wurde kopiert.';f.requests[0].resolve({firstVisit:false});await flush();assert.equal(f.c.statusEl.textContent,'Einladungslink wurde kopiert.');
  const g=client();g.login();g.show();g.login('other','Fahili');g.show();g.requests[0].resolve({firstVisit:false});await flush();assert.equal(g.show(),'Willkommen im Hammerschach-Gamer, Fahili!');
});
test('Spielräume, Werkzeuge und unsichtbare Seiten verbrauchen keinen Erstbesuch',()=>{
  for(const flag of ['room','tool','hidden']){
    const f=client();f.login();if(flag==='room')f.c.inLobby=false;if(flag==='tool')f.c.inTool=true;if(flag==='hidden')f.c.document.hidden=true;
    f.show();assert.equal(f.requests.length,0);
  }
});
test('Fehler lassen eine neutrale Begrüßung stehen; Retry nutzt dieselbe Besuchskennung',async()=>{
  const f=client();f.login();f.show();f.requests[0].reject(new Error('offline'));await flush();assert.equal(f.show(),'Willkommen im Hammerschach-Gamer, Andili!');assert.equal(f.requests.length,1);
  vm.runInContext('lobbyWelcomeState.retryAt=0',f.c);f.show();assert.equal(f.requests[0].body.visitId,f.requests[1].body.visitId);
});
test('Logout zeigt Besuchertext und verwirft verspätete Antworten',async()=>{
  const f=client();f.login();f.show();f.c.onlineAuthToken='';f.c.onlineAuthUser=null;f.show();f.requests[0].resolve({firstVisit:false});await flush();assert.equal(f.c.statusEl.textContent,'Willkommen im Hammerschach-Gamer!');
});

test('Registrierung legt Konto und Erstbegrüßung gemeinsam an; Fehler rollt beides zurück',async t=>{
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(`PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT,username_lc TEXT UNIQUE,email TEXT,email_lc TEXT UNIQUE,password_alg TEXT,password_hash TEXT,password_salt TEXT,password_iterations INTEGER,created_at TEXT);`);
  let failWelcome=false;
  const env={DB:{prepare(query){let values=[];return {bind(...v){values=v;return this;},async first(){return sql.prepare(query).get(...values)||null;},async run(){if(failWelcome && query.startsWith('INSERT INTO lobby_welcome'))throw new Error('simulated write failure');return sql.prepare(query).run(...values);}};},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}}};
  const workerSource=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export class /gm,'class ').replace(/^export default /m,'const worker = ');
  const c=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,URL,Request,Response,Headers,btoa,atob,console,setTimeout,clearTimeout,ensureLobbyWelcome,newLobbyWelcomeStatement,handleLobbyWelcomeApi,handleReaderArchivesApi:async()=>null,handleLeagueStandingsApi:async()=>null});
  vm.runInContext(workerSource,c);
  vm.runInContext(`
    checkAuthRateLimit = async () => ({allowed:true,context:{}});
    recordAuthRateLimitEvent = async () => {};
    recordAuthSecurityEvent = async () => {};
    hashPassword = async () => 'test-hash';
    waitForMinimumResponseTime = async () => {};
    ensureRatingRowsForUser = async () => {};
    setCurrentEmailVerified = async () => {};
    sendRegistrationVerificationEmail = async () => ({ok:true});
  `,c);
  const register=async username=>{
    const url=new URL('https://example.test/api/register');
    return c.handleAuthApi(new Request(url,{method:'POST',body:JSON.stringify({username,email:username.toLowerCase()+'@example.com',password:'Test-password-123'})}),env,url);
  };
  const response=await register('NewMember');assert.equal(response.status,200);
  const user=sql.prepare("SELECT id FROM users WHERE username='NewMember'").get();assert(user);
  assert.equal(sql.prepare('SELECT first_visit_id FROM lobby_welcome WHERE user_id=?').get(user.id).first_visit_id,null);
  failWelcome=true;await assert.rejects(register('FailedMember'),/simulated write failure/);
  assert.equal(sql.prepare("SELECT id FROM users WHERE username='FailedMember'").get(),undefined);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM lobby_welcome').get().n,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash, randomBytes, webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const worker=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const statsSource=worker.slice(worker.indexOf('function gamerStatsDays('),worker.indexOf('async function createSession('));
const browser=readFileSync(new URL('../../Gamer/js/online-session.js',import.meta.url),'utf8');
const clientSource=browser.slice(browser.indexOf('function formatStatsNumber('),browser.indexOf('// Auch eine über Mitternacht geöffnete Seite'));
const A='a'.repeat(32),B='b'.repeat(32),C='c'.repeat(32);

function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('u1'),('u2');");
  const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this;},execute(){return db.prepare(sql).run(...args);},async run(){return this.execute();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};},async batch(statements){
    db.exec('BEGIN');try{const result=statements.map(s=>s.execute());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
  }};
  const ctx=vm.createContext({Intl,Date,Response,randomBase64Url:n=>randomBytes(n).toString('base64url'),sha256Hex:async s=>createHash('sha256').update(s).digest('hex'),json:(data,init)=>new Response(JSON.stringify(data),init),readJsonBody:r=>r.json(),bearerTokenFromRequest:r=>(r.headers.get('authorization')||'').replace(/^Bearer /,''),lookupAuthSession:async(_,token)=>['u1','u2','admin'].includes(token)?{user:{id:token}}:null});
  vm.runInContext(statsSource,ctx);
  const env={DB},day=ctx.gamerStatsDays().today;
  const request=(member,visitorToken,customDay=day)=>new Request('https://example.invalid/api/stats/daily',{method:'POST',headers:{'content-type':'application/json',...(member?{authorization:'Bearer '+member}:{})},body:JSON.stringify({day:customDay,visitorToken})});
  const call=(member,token,customDay)=>ctx.handleDailyGamerStats(request(member,token,customDay),env);
  const counts=async()=>{const r=await ctx.readDailyGamerStats(env);return [r.today.members,r.today.visitors];};
  return {db,ctx,env,day,call,counts};
}
test('Gast wird beim Login umgebucht, Wiederholungen und Logout bleiben eindeutig',async t=>{
  const f=fixture(t);await f.call('',A);await f.call('',A);assert.deepEqual(await f.counts(),[0,1]);
  await f.call('u1',A);assert.deepEqual(await f.counts(),[1,0]);
  await f.call('u1',A);await f.call('',A);await f.call('u1',A);assert.deepEqual(await f.counts(),[1,0]);
});
test('Andere Besucher bleiben erhalten und mehrere Browser desselben Mitglieds werden bereinigt',async t=>{
  const f=fixture(t);for(const token of [A,B,C])await f.call('',token);
  await f.call('u1',A);assert.deepEqual(await f.counts(),[1,2]);
  await f.call('u1',B);assert.deepEqual(await f.counts(),[1,1]);
});
test('Direkt angemeldeter Start verhindert spätere Gastzählung im selben Browser',async t=>{
  const f=fixture(t);await f.call('u1',A);await f.call('',A);assert.deepEqual(await f.counts(),[1,0]);
});
test('Zwei Mitgliedskonten im selben Browser zählen als zwei Mitglieder',async t=>{
  const f=fixture(t);await f.call('',A);await f.call('u1',A);await f.call('u2',A);await f.call('',A);assert.deepEqual(await f.counts(),[2,0]);
});
test('Parallele Gast- und Login-Anfragen erzeugen keinen verbleibenden Gast',async t=>{
  const f=fixture(t);await f.ctx.ensureDailyStatsTables(f.env);
  for(let i=0;i<12;i++)await Promise.all([f.call('',A),f.call('u1',A),f.call('',A),f.call('u1',A)]);
  assert.deepEqual(await f.counts(),[1,0]);
});
test('Abgelaufene Sitzung, ungültige Gastkennung und falscher Tag verändern nichts',async t=>{
  const f=fixture(t);await f.call('',A);
  assert.equal((await f.call('expired',A)).status,401);
  assert.equal((await f.call('','bad')).status,400);
  assert.equal((await f.call('u1',A,'2000-01-01')).status,409);
  assert.deepEqual(await f.counts(),[0,1]);
});
test('Alte Clients und gesperrter Browserspeicher erlauben weiterhin die Mitgliedszählung',async t=>{
  const f=fixture(t);await f.call('',A);assert.equal((await f.call('u1','')).status,200);
  assert.deepEqual(await f.counts(),[1,1]);
  await f.call('u1',A);assert.deepEqual(await f.counts(),[1,0]);
});
test('Markierung, Gastentfernung und Mitgliedseintrag werden gemeinsam zurückgerollt',async t=>{
  const f=fixture(t);await f.call('',A);
  f.db.exec("CREATE TRIGGER fail_member BEFORE INSERT ON gamer_daily_stats_visitors WHEN NEW.kind='member' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  await assert.rejects(f.call('u1',A),/test failure/);
  assert.deepEqual(await f.counts(),[0,1]);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM gamer_daily_stats_member_browsers').get().n,0);
});
test('Markierungen gelten nur am jeweiligen Tag; gestern bleibt erhalten, ältere Daten verschwinden',async t=>{
  const f=fixture(t),d1={today:'2026-10-12',yesterday:'2026-10-11'},d2={today:'2026-10-13',yesterday:'2026-10-12'},d3={today:'2026-10-14',yesterday:'2026-10-13'};
  await f.ctx.recordDailyGamerVisit(f.env,d1,'member','u1',A);
  await f.ctx.recordDailyGamerVisit(f.env,d2,'visitor',A);
  let stats=await f.ctx.readDailyGamerStats(f.env,d2);assert.equal(stats.today.visitors,1);assert.equal(stats.yesterday.members,1);
  await f.ctx.pruneDailyGamerStats(f.env,d3);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM gamer_daily_stats_member_browsers').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM gamer_daily_stats_days WHERE day=?').get(d1.today).n,0);
});
test('Bestehende Tageswerte bleiben bei automatischer Tabellenergänzung erhalten',async t=>{
  const f=fixture(t);f.db.exec("CREATE TABLE gamer_daily_stats_days(day TEXT PRIMARY KEY,salt TEXT NOT NULL); CREATE TABLE gamer_daily_stats_visitors(day TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('member','visitor')),identity_hash TEXT NOT NULL,PRIMARY KEY(day,kind,identity_hash));");
  f.db.prepare('INSERT INTO gamer_daily_stats_days VALUES(?,?)').run(f.day,'existing-salt');
  f.db.prepare('INSERT INTO gamer_daily_stats_visitors VALUES(?,?,?)').run(f.day,'visitor',createHash('sha256').update('existing-salt:'+f.day+':visitor:'+A).digest('hex'));
  await f.call('u1',A);assert.deepEqual(await f.counts(),[1,0]);
});
test('Browser sendet beim Login dieselbe Tageskennung und zeigt die bereinigten Werte',async t=>{
  const f=fixture(t),storage=new Map(),posts=[];
  const ctx=vm.createContext({crypto:webcrypto,navigator:{},document:{getElementById:()=>null},siteStatsEl:{},onlineAuthToken:'',onlineAuthUser:null,onlineApiBaseUrl:()=> 'https://example.invalid',localStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,options={})=>{
    if(options.method==='POST'){posts.push(JSON.parse(options.body));return f.ctx.handleDailyGamerStats(new Request(url,options),f.env);}
    return f.ctx.handleDailyGamerStats(new Request(url,options),f.env);
  }});
  vm.runInContext(clientSource,ctx);
  await ctx.refreshSiteStats(true);ctx.onlineAuthToken='u1';ctx.onlineAuthUser={id:'u1'};await ctx.refreshSiteStats(true);
  assert.equal(posts.length,2);assert.match(posts[0].visitorToken,/^[a-f0-9]{32}$/);assert.equal(posts[0].visitorToken,posts[1].visitorToken);
  assert.deepEqual(await f.counts(),[1,0]);assert.match(ctx.siteStatsEl.textContent,/Heute: 1 Mitglieder · 0 Besucher/);
  ctx.onlineAuthToken='';ctx.onlineAuthUser=null;await ctx.refreshSiteStats(true);assert.deepEqual(await f.counts(),[1,0]);
});

test('Öffentlich nur Zähltag, Mitglieder inklusive Admin erhalten dynamische Zahlen; ungültige Sitzung abgewiesen',async t=>{
  const f=fixture(t);
  const get=token=>f.ctx.handleDailyGamerStats(new Request('https://example.invalid/api/stats/daily',{headers:token?{authorization:'Bearer '+token}:{}}),f.env);
  const guest=await get('');assert.equal(guest.headers.get('cache-control'),'no-store, max-age=0');
  assert.deepEqual(await guest.json(),{ok:true,day:f.day});
  assert.deepEqual(await (await f.call('',A)).json(),{ok:true,day:f.day});
  const member=await (await get('u1')).json();assert.equal(member.stats.totalMembers,2);assert.equal(member.stats.today.visitors,1);
  f.db.exec("INSERT INTO users VALUES ('admin')");
  assert.equal((await (await get('admin')).json()).stats.totalMembers,3);
  assert.equal((await get('expired')).status,401);
});
test('Logout und verspätete Antworten geben keine Mitgliedszahlen frei',async()=>{
  const community={},ctx=vm.createContext({document:{getElementById:()=>community},siteStatsEl:{},onlineAuthToken:'u1',onlineAuthUser:{id:'u1'}});
  vm.runInContext(clientSource,ctx);
  const stats={totalMembers:42,today:{members:3,visitors:5},yesterday:{members:2,visitors:4}};
  ctx.renderSiteStats(stats);assert.equal(community.textContent,'Unsere Gemeinschaft: 42 Mitglieder');
  ctx.onlineAuthToken='';ctx.onlineAuthUser=null;ctx.renderSiteStats(stats);
  assert.equal(community.hidden,true);assert.equal(community.textContent,'');assert.equal(ctx.siteStatsEl.hidden,true);assert.equal(ctx.siteStatsEl.textContent,'');
});

test('Echte Sitzungsprüfung schützt Zahlen für Mitglied/Admin und verweigert abgelaufene, gesperrte oder gelöschte Konten',async t=>{
  const f=fixture(t);
  f.db.exec("ALTER TABLE users ADD COLUMN disabled INTEGER DEFAULT 0; ALTER TABLE users ADD COLUMN deleted_at TEXT; CREATE TABLE sessions(id TEXT,user_id TEXT,token_hash TEXT,expires_at TEXT)");
  f.ctx.publicUser=row=>({id:row.id});
  vm.runInContext(worker.slice(worker.indexOf('async function lookupAuthSession('),worker.indexOf('const MODERATION_STATUS_ACTIVE')),f.ctx);
  const hash=token=>createHash('sha256').update(token).digest('hex');
  f.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('s1','u1',hash('member'),'2099-01-01');
  f.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('s2','u2',hash('admin'),'2099-01-01');
  f.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('s3','u1',hash('expired'),'2000-01-01');
  const get=token=>f.ctx.handleDailyGamerStats(new Request('https://example.invalid/api/stats/daily',{headers:{authorization:'Bearer '+token}}),f.env);
  for(const token of ['member','admin'])assert.equal((await (await get(token)).json()).stats.totalMembers,2);
  for(const token of ['expired','unknown'])assert.equal((await get(token)).status,401);
  f.db.exec("UPDATE users SET disabled=1 WHERE id='u1'");assert.equal((await get('member')).status,401);
  f.db.exec("UPDATE users SET deleted_at='2026-11-26' WHERE id='u2'");assert.equal((await get('admin')).status,401);
});

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
  const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this;},execute(){return db.prepare(sql).run(...args);},async run(){return this.execute();},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};},async batch(statements){
    db.exec('BEGIN');try{const result=statements.map(s=>s.execute());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
  }};
  const ctx=vm.createContext({Intl,Date,Response,randomBase64Url:n=>randomBytes(n).toString('base64url'),sha256Hex:async s=>createHash('sha256').update(s).digest('hex'),json:(data,init)=>new Response(JSON.stringify(data),init),readJsonBody:r=>r.json(),bearerTokenFromRequest:r=>(r.headers.get('authorization')||'').replace(/^Bearer /,''),lookupAuthSession:async(_,token)=>['u1','u2'].includes(token)?{user:{id:token}}:null});
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
  const ctx=vm.createContext({crypto:webcrypto,navigator:{},siteStatsEl:{},onlineAuthToken:'',onlineAuthUser:null,onlineApiBaseUrl:()=> 'https://example.invalid',localStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,options={})=>{
    if(options.method==='POST'){posts.push(JSON.parse(options.body));return f.ctx.handleDailyGamerStats(new Request(url,options),f.env);}
    return f.ctx.handleDailyGamerStats(new Request(url),f.env);
  }});
  vm.runInContext(clientSource,ctx);
  await ctx.refreshSiteStats(true);ctx.onlineAuthToken='u1';ctx.onlineAuthUser={id:'u1'};await ctx.refreshSiteStats(true);
  assert.equal(posts.length,2);assert.match(posts[0].visitorToken,/^[a-f0-9]{32}$/);assert.equal(posts[0].visitorToken,posts[1].visitorToken);
  assert.deepEqual(await f.counts(),[1,0]);assert.match(ctx.siteStatsEl.textContent,/Heute: 1 Mitglieder · 0 Besucher/);
  ctx.onlineAuthToken='';ctx.onlineAuthUser=null;await ctx.refreshSiteStats(true);assert.deepEqual(await f.counts(),[1,0]);
});

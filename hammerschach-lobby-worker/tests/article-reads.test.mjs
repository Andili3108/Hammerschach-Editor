import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {handleArticleReadsApi,deleteArticleReads,ensureArticleReads} from '../src/article-reads.js';
const stateSource=readFileSync(new URL('../../Gamer/js/article-read-state.js',import.meta.url),'utf8');
const context=vm.createContext({});vm.runInContext(stateSource,context);
const create=context.HammerschachArticleReadStore.create;
const A='news:stroebeck-gemeinschaft',B='news:vertrauen-online-schach',C='news:online-fide-wertung';
const plain=x=>JSON.parse(JSON.stringify(x));
function disk(){const m=new Map();let writes=0;return {getItem:k=>m.get(k)||null,setItem:(k,v)=>{writes++;m.set(k,v);},m,get writes(){return writes;}};}
function client({storage=disk(),who={},request=async()=>({read:[]})}={}){
 let identity=who;const store=create({storage,identity:()=>identity,request});return {store,storage,setIdentity:v=>{identity=v;store.refreshIdentity();}};
}
test('Besucher beginnen leer; Lesen bleibt nach Neuladen erhalten',()=>{
 const x=client();assert.deepEqual(plain(x.store.read()),[]);x.store.mark(A);x.store.mark(A);
 assert.deepEqual(plain(client({storage:x.storage}).store.read()),[A]);
});
test('Besucher und zwei Konten haben getrennte Lesestände',()=>{
 const x=client();x.store.mark(A);x.setIdentity({id:'a',token:'ta'});assert.equal(x.store.read().length,0);
 x.store.mark(B);x.setIdentity({id:'b',token:'tb'});assert.equal(x.store.read().length,0);
 x.setIdentity({});assert.deepEqual(plain(x.store.read()),[A]);
});
test('Zwei Geräte führen ihre Lesestände auf dem Server zusammen',async()=>{
 const server=new Set();const request=async(method,read)=>{if(method==='POST')read.forEach(k=>server.add(k));return {read:[...server]};};
 const x=client({who:{id:'a',token:'ta'},request}),y=client({who:{id:'a',token:'ta'},request});
 x.store.mark(A);y.store.mark(B);await Promise.all([x.store.sync(),y.store.sync()]);await x.store.sync();await y.store.sync();
 assert.deepEqual(new Set(x.store.read()),new Set([A,B]));assert.deepEqual(new Set(y.store.read()),new Set([A,B]));
});
test('Offline-Lesen wird später nachgetragen',async()=>{
 let online=false;const server=new Set();const x=client({who:{id:'a',token:'ta'},request:async(method,keys)=>{if(!online)throw Error();if(method==='POST')keys.forEach(k=>server.add(k));return {read:[...server]};}});
 x.store.mark(A);await x.store.sync();assert(x.store.read().includes(A));online=true;await x.store.sync();assert(server.has(A));
});
test('Verspätete Antworten ändern nach Accountwechsel nicht den neuen Lesestand',async()=>{
 let done;const x=client({who:{id:'a',token:'ta'},request:()=>new Promise(r=>done=r)});
 const old=x.store.sync();x.setIdentity({id:'b',token:'tb'});done({read:[A]});await old;assert.equal(x.store.read().length,0);
});
test('Neue Reads während eines POST bleiben erhalten',async()=>{
 const server=new Set();let release,entered;const started=new Promise(r=>entered=r);let first=true;
 const x=client({who:{id:'a',token:'ta'},request:async(method,keys)=>{
  if(method==='POST'){if(first){first=false;await new Promise(r=>{release=r;entered();});}keys.forEach(k=>server.add(k));}return {read:[...server]};
 }});
 x.store.mark(A);await started;x.store.mark(B);release();await x.store.sync();assert.deepEqual(server,new Set([A,B]));
});
test('Unveränderte Synchronisation schreibt nicht endlos zwischen Tabs',async()=>{
 const storage=disk();const x=client({storage,who:{id:'a',token:'ta'}});await x.store.sync();const count=storage.writes;
 await x.store.sync();x.store.storageChanged('hammerschachArticleReadsV1:user:a');await x.store.sync();assert.equal(storage.writes,count);
});
test('Defekter oder gesperrter Browserspeicher blockiert Lesen nicht',()=>{
 for(const storage of [{getItem:()=> 'null',setItem:()=>{}},{getItem:()=>{throw Error();},setItem:()=>{throw Error();}}]){
  const x=client({storage});x.store.mark(A);assert(x.store.read().includes(A));
 }
});
test('Fremde storage-Events verändern den Lesestand nicht',()=>{
 const x=client();x.store.mark(A);x.store.storageChanged('irrelevant');assert.deepEqual(plain(x.store.read()),[A]);
});
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('a'),('b');");
 const DB={prepare(query){let args=[];return {bind(...v){args=v;return this;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};},async all(){return {results:sql.prepare(query).all(...args)};},query,get args(){return args;}};},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const deps={json:(data,init)=>new Response(JSON.stringify(data),init),lookupAuthSession:async(env,token)=>['a','b'].includes(token)?{user:{id:token}}:null,bearerTokenFromRequest:r=>r.headers.get('authorization'),readJsonBody:async r=>{try{return await r.json();}catch(_){return null;}}};
 const call=(method,token,body,path='/api/account/article-reads')=>handleArticleReadsApi(new Request('https://example.invalid'+path,{method,headers:{authorization:token||''},...(body!==undefined?{body:JSON.stringify(body)}:{})}),{DB},new URL('https://example.invalid'+path),deps);
 return {sql,env:{DB},call};
}
test('API benötigt Sitzung und liefert keine fremden Daten',async t=>{
 const x=fixture(t);assert.equal((await x.call('GET','')).status,401);assert.equal((await x.call('POST','bad',{read:[A]})).status,401);
 await x.call('POST','a',{read:[A],userId:'b'});assert.deepEqual((await (await x.call('GET','b')).json()).read,[]);
 const response=await x.call('GET','a');assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual((await response.json()).read,[A]);
});
test('API ist additiv und idempotent',async t=>{
 const x=fixture(t);await x.call('POST','a',{read:[A,A]});await x.call('POST','a',{read:[B]});await x.call('POST','a',{read:[]});
 assert.deepEqual(new Set((await (await x.call('GET','a')).json()).read),new Set([A,B]));
});
test('API weist ungültige IDs und zu große Batches zurück',async t=>{
 const x=fixture(t);for(const read of [[null],['../../x'],['news:UPPER'],Array(51).fill(A),'oops'])assert.equal((await x.call('POST','a',{read})).status,400);
 assert.equal((await x.call('DELETE','a')).status,405);assert.equal(await x.call('GET','a',undefined,'/different'),null);
});
test('Server-Lesestand wird mit dem Account entfernt',async t=>{
 const x=fixture(t);await x.call('POST','a',{read:[A]});await x.call('POST','b',{read:[B]});await deleteArticleReads(x.env,'a');
 assert.deepEqual((await (await x.call('GET','a')).json()).read,[]);x.sql.exec("DELETE FROM users WHERE id='b'");assert.equal(x.sql.prepare('SELECT COUNT(*) n FROM article_reads').get().n,0);
});
test('Speicherlimit schützt den Server; vorhandene Reads bleiben abrufbar',async t=>{
 const x=fixture(t);await ensureArticleReads(x.env);const stmt=x.sql.prepare('INSERT INTO article_reads VALUES(?,?)');for(let i=0;i<1000;i++)stmt.run('a','news:test-'+i);
 assert.equal((await x.call('POST','a',{read:[A]})).status,409);assert.equal((await (await x.call('GET','a')).json()).read.length,1000);
});
test('Startbestand markiert genau die drei neuen News',()=>{
 const source=readFileSync(new URL('../../Gamer/js/embedded-tools.js',import.meta.url),'utf8');
 const registries=source.slice(source.indexOf('const TOURNAMENT_REPORTS ='),source.indexOf('const SCHACH_CURRENT_STORAGE_KEY'));
 const c=vm.createContext({});vm.runInContext(registries+';globalThis.reports=TOURNAMENT_REPORTS;globalThis.news=SCHACH_NEWS;',c);
 assert.deepEqual(Object.entries(c.news).filter(([,a])=>a.notify!==false).map(([id])=>'news:'+id),[A,B,C]);
 assert.equal(Object.values(c.reports).filter(a=>a.notify!==false).length,0);
});

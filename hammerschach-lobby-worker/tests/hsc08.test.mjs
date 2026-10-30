import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleHsc08,validateHsc08Draft} from '../src/hsc08.js';
const draft={title:'Vereinsmeisterschaft',description:'Ausschreibung',mode:'swiss',participants:[{id:'player-0001',name:'Ohne Gamer-Konto'}]};
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE tournaments (id TEXT PRIMARY KEY); INSERT INTO tournaments VALUES (\'online-unberuehrt\')');
 const env={DB:{prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args);},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};}}};
 let user={id:'admin',username:'Andili',isAdmin:true};let reauth=0;
 const deps={json:(body,init)=>new Response(JSON.stringify(body),{...init,headers:{'content-type':'application/json',...init.headers}}),session:async()=>user?{user}:null,isAdmin:u=>u.isAdmin,reauthenticate:async(req,u,p)=>{reauth++;return p==='correct'?{ok:true}:{ok:false,status:403,message:'Kennwort falsch'};}};
 return {db,setUser:u=>user=u,reauth:()=>reauth,async request(method='GET',body,path='/championship'){const r=await handleHsc08(new Request('https://test.invalid/api/hsc08'+path,{method,...(body?{body:JSON.stringify(body)}:{})}),env,deps);return {status:r.status,headers:r.headers,body:await r.json()};}};
}
test('all page/data routes reject visitors, ordinary members and other admins',async t=>{
 const f=fixture(t);for(const user of [null,{username:'Andili',isAdmin:false},{username:'Andere',isAdmin:true}]){f.setUser(user);for(const path of ['/access','/page','/championship']){const r=await f.request('GET',null,path);assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store, max-age=0');assert.ok(!JSON.stringify(r.body).includes('Ausschreibung'));}}
 assert.equal(f.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='hsc08_championship'").get().n,0);
});
test('authorized page contains logo but no tournament user input',async t=>{const f=fixture(t);const r=await f.request('GET',null,'/page');assert.equal(r.status,200);assert.match(r.body.html,/data:image\/jpeg;base64/);assert.match(r.body.html,/Turnier konfigurieren/);});
test('draft roundtrip, concurrent update conflict and online isolation',async t=>{
 const f=fixture(t);assert.equal((await f.request()).body.tournament,null);
 let r=await f.request('POST',{revision:0,tournament:draft});assert.equal(r.status,200);assert.equal(r.body.revision,1);assert.deepEqual(r.body.tournament.participants,draft.participants);
 r=await f.request('POST',{revision:0,tournament:{...draft,title:'Stale'}});assert.equal(r.status,409);assert.equal((await f.request()).body.tournament.title,draft.title);
 assert.equal(f.db.prepare('SELECT id FROM tournaments').get().id,'online-unberuehrt');
});
test('delete requires password and confirmation, clears only HSC08 and prevents resurrection',async t=>{
 const f=fixture(t);await f.request('POST',{revision:0,tournament:draft});
 assert.equal((await f.request('DELETE',{revision:1,password:'correct'})).status,400);assert.equal(f.reauth(),0);
 assert.equal((await f.request('DELETE',{revision:1,password:'wrong',confirmation:'TURNIER LÖSCHEN'})).status,403);
 assert.ok((await f.request()).body.tournament);
 const r=await f.request('DELETE',{revision:1,password:'correct',confirmation:'TURNIER LÖSCHEN'});assert.equal(r.status,200);assert.equal(r.body.tournament,null);assert.equal(r.body.revision,2);
 assert.equal((await f.request('POST',{revision:1,tournament:draft})).status,409);
 assert.equal((await f.request('GET',null,'/page')).status,200);
 assert.equal(f.db.prepare('SELECT count(*) n FROM tournaments').get().n,1);
});
test('validation does not enable unapproved rules or store injected results',()=>{
 const r=validateHsc08Draft({...draft,phase:'running',results:[1],rulesStatus:'approved'});assert.equal(r.phase,'draft');assert.equal(r.rulesStatus,'pending');assert.ok(!('results' in r));
 for(const bad of [{...draft,mode:'knockout'},{...draft,title:''},{...draft,participants:[draft.participants[0],draft.participants[0]]}])assert.throws(()=>validateHsc08Draft(bad));
});

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
 const f=fixture(t);for(const user of [null,{username:'Andili',isAdmin:false},{username:'Andere',isAdmin:true}]){f.setUser(user);for(const path of ['/access','/page','/championship','/championship/view','/page?view=reader','/championship/backup']){const r=await f.request('GET',null,path);assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store, max-age=0');assert.ok(!JSON.stringify(r.body).includes('Ausschreibung'));}}
 assert.equal(f.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='hsc08_championship'").get().n,0);
});
test('authorized page contains logo but no tournament user input',async t=>{const f=fixture(t);const r=await f.request('GET',null,'/page');assert.equal(r.status,200);assert.match(r.body.html,/data:image\/jpeg;base64/);assert.ok(r.body.html.includes('<form id="config" hidden>'));assert.ok(!r.body.html.includes('<h1'));});
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
 for(const bad of [{...draft,mode:'knockout'},{...draft,title:'x'.repeat(161)},{...draft,participants:[draft.participants[0],draft.participants[0]]}])assert.throws(()=>validateHsc08Draft(bad));
});

test('configuration roundtrip retains ratings and all approved preparation settings',async t=>{
 const f=fixture(t);
 const input={...draft,scoring:'three-point',cycles:2,rounds:7,startsOn:'2026-11-05',endsOn:'2027-06-30',timeControl:'90 Minuten + 30 Sekunden pro Zug',participants:[{id:'player-0001',name:'Anna',dwz:1789},{id:'player-0002',name:'Bert',estimatedRating:1500}]};
 const saved=await f.request('POST',{revision:0,tournament:input});assert.equal(saved.status,200);
 const loaded=(await f.request()).body.tournament;
 for(const key of Object.keys(input))assert.deepEqual(loaded[key],input[key]);
});
test('incomplete drafts are saved, invalid dates, ratings and enums are rejected',async t=>{
 const f=fixture(t);
 const r=await f.request('POST',{revision:0,tournament:{title:'',mode:'',participants:[]}});
 assert.equal(r.status,200);assert.equal(r.body.tournament.scoring,'classic');assert.equal(r.body.tournament.cycles,1);assert.equal(r.body.tournament.rounds,null);
 for(const patch of [{scoring:'invalid'},{cycles:3},{rounds:1.5},{rounds:0},{rounds:200},{startsOn:'2026-02-30'},{startsOn:'2026-12-01',endsOn:'2026-11-01'},{timeControl:'x'.repeat(301)},{participants:[{...draft.participants[0],dwz:-1}]},{participants:[{...draft.participants[0],estimatedRating:1500.5}]}]){
  assert.equal((await f.request('POST',{revision:1,tournament:{...draft,...patch}})).status,400);
 }
 assert.equal((await f.request()).body.revision,1,'rejected inputs leave saved state unchanged');
});

test('rich description is canonical safe data, survives storage and rejects malformed input',async t=>{
 const f=fixture(t);const runs=[{text:'Titel\n',size:30,bold:true,italic:false},{text:'<img src=x onerror=alert(1)>',size:18,bold:false,italic:true}];
 const r=await f.request('POST',{revision:0,tournament:{...draft,description:'conflicting',descriptionRich:runs}});
 assert.equal(r.status,200);assert.deepEqual(r.body.tournament.descriptionRich,runs);assert.equal(r.body.tournament.description,runs.map(r=>r.text).join(''));
 assert.deepEqual((await f.request()).body.tournament.descriptionRich,runs);
 for(const rich of [null,[{...runs[0],size:900}],[{...runs[0],bold:'true'}],[{...runs[0],text:'a'.repeat(20001)}]])assert.throws(()=>validateHsc08Draft({...draft,descriptionRich:rich}));
 const safe=validateHsc08Draft({...draft,descriptionRich:[{...runs[0],html:'<script>alert(1)</script>',onclick:'alert(1)'}]});assert.deepEqual(safe.descriptionRich,[runs[0]]);
});

test('tables survive storage as text cells and invalid shapes are rejected',async t=>{
 const f=fixture(t);const rich=[{table:[['Runde','Termin'],['1','<script>alert(1)</script>']]}];
 const r=await f.request('POST',{revision:0,tournament:{...draft,descriptionRich:rich}});assert.equal(r.status,200);assert.deepEqual((await f.request()).body.tournament.descriptionRich,rich);
 for(const table of [[['a'],['b','c']],[],[Array(13).fill('a')],[[42]]])assert.throws(()=>validateHsc08Draft({...draft,descriptionRich:[{table}]}));
});

test('draft and visible snapshot remain independent across saves, apply and conflicts',async t=>{
 const f=fixture(t);
 assert.equal((await f.request('POST',{revision:0,action:'apply'})).status,400);
 let r=await f.request('POST',{revision:0,tournament:draft});assert.equal(r.body.publishedTournament,null);
 r=await f.request('POST',{revision:1,action:'apply'});assert.equal(r.body.publishedTournament.title,draft.title);
 r=await f.request('POST',{revision:2,tournament:{...draft,title:'Neuer Entwurf',viewSnapshot:{title:'injected'}}});assert.equal(r.body.tournament.title,'Neuer Entwurf');assert.equal(r.body.publishedTournament.title,draft.title);
 r=await f.request();assert.equal(r.body.tournament.title,'Neuer Entwurf');assert.equal(r.body.publishedTournament.title,draft.title);
 assert.equal((await f.request('POST',{revision:2,action:'apply'})).status,409);
 r=await f.request('POST',{revision:3,action:'apply'});assert.equal(r.body.publishedTournament.title,'Neuer Entwurf');
 r=await f.request('DELETE',{revision:4,password:'correct',confirmation:'TURNIER LÖSCHEN'});assert.equal(r.body.tournament,null);assert.equal(r.body.publishedTournament,null);
 assert.equal((await f.request('POST',{revision:4,action:'apply'})).status,409);
});
test('legacy saved tournament remains visible when its draft is edited',async t=>{
 const f=fixture(t);await f.request();f.db.prepare('UPDATE hsc08_championship SET document=? WHERE id=1').run(JSON.stringify(draft));
 let r=await f.request();assert.deepEqual(r.body.tournament,draft);assert.deepEqual(r.body.publishedTournament,draft);
 r=await f.request('POST',{revision:0,tournament:{...draft,title:'Neue Fassung'}});assert.equal(r.body.publishedTournament.title,draft.title);assert.equal(r.body.tournament.title,'Neue Fassung');
});

test('round-robin API locks rules and preserves permanent delete protection through configuration',async t=>{
 const f=fixture(t);let rev=0;
 const send=async body=>{const r=await f.request('POST',{revision:rev,...body});if(r.status===200)rev=r.body.revision;return r;};
 let r=await send({tournament:{...draft,mode:'round-robin',startsOn:'2026-11-01',endsOn:'2027-05-31',timeControl:'90 min',participants:[...draft.participants,{id:'player-0002',name:'B'}]}});await send({action:'apply'});await send({action:'prepare'});
 r=await send({action:'release'});const gameId=r.body.tournament.schedule[0].games[0].id;
 assert.equal((await send({tournament:{...r.body.tournament,scoring:'three-point'}})).status,400);
 r=await send({action:'result',gameId,result:'1-0'});assert.equal(r.status,200);
 assert.equal((await f.request('DELETE',{revision:rev,password:'correct',confirmation:'TURNIER LÖSCHEN'})).status,403);
 r=await send({action:'result',gameId,result:null,reason:'Fehler'});assert.ok(r.body.tournament.hasEverResults);
 r=await send({tournament:{...r.body.tournament,title:'Korrigiert',hasEverResults:false}});await send({action:'apply'});
 assert.equal((await f.request('DELETE',{revision:rev,password:'correct',confirmation:'TURNIER LÖSCHEN'})).status,403);
 assert.equal((await send({action:'complete'})).status,400);
 assert.equal(f.db.prepare('SELECT id FROM tournaments').get().id,'online-unberuehrt');
});

test('reader route contains only adopted data and rejects writes',async t=>{
 const f=fixture(t);
 let r=await f.request('GET',null,'/page?view=reader');assert.equal(r.status,200);assert.equal(r.body.canManage,false);assert.ok(!r.body.html.includes('<form'));assert.ok(!r.body.html.includes('<select'));assert.ok(!r.body.html.includes('id="applyDraft"'));
 await f.request('POST',{revision:0,tournament:draft});r=await f.request('GET',null,'/championship/view');assert.equal(r.body.tournament,null);
 await f.request('POST',{revision:1,action:'apply'});await f.request('POST',{revision:2,tournament:{...draft,title:'Geheimer Entwurf'}});
 r=await f.request('GET',null,'/championship/view');assert.equal(r.body.tournament.title,draft.title);assert.ok(!JSON.stringify(r.body).includes('Geheimer Entwurf'));assert.ok(!('publishedTournament' in r.body));
 for(const method of ['POST','DELETE'])assert.equal((await f.request(method,{revision:3},'/championship/view')).status,405);
});

test('backup reset restore retains game state, enforces reauth and rejects stale backup',async t=>{
 const f=fixture(t);let rev=0;const send=async body=>{const r=await f.request('POST',{revision:rev,...body});if(r.status===200)rev=r.body.revision;return r;};
 await send({tournament:{...draft,mode:'round-robin',startsOn:'2026-11-01',endsOn:'2027-05-31',timeControl:'90 min',participants:[...draft.participants,{id:'player-0002',name:'B'}]}});await send({action:'apply'});await send({action:'prepare'});let r=await send({action:'release'});const gameId=r.body.tournament.schedule[0].games[0].id;
 await send({action:'result',gameId,result:'1-0'});let exported=(await f.request('GET',null,'/championship/backup')).body;
 assert.equal(exported.backup.version,1);assert.ok(exported.html.includes('1–0'));assert.ok(!exported.html.includes('<script'));assert.ok(!exported.html.includes('Änderungsprotokoll'));
 assert.equal((await send({action:'reset',password:'wrong',confirmation:draft.title,backupDigest:exported.digest})).status,403);
 assert.equal((await send({action:'reset',password:'correct',confirmation:'wrong',backupDigest:exported.digest})).status,400);
 await send({action:'result',gameId,result:'0-1',reason:'Korrektur'});
 assert.equal((await send({action:'reset',password:'correct',confirmation:draft.title,backupDigest:exported.digest})).status,400);
 exported=(await f.request('GET',null,'/championship/backup')).body;
 r=await send({action:'reset',password:'correct',confirmation:draft.title,backupDigest:exported.digest});assert.equal(r.body.tournament,null);
 assert.equal((await send({action:'restore',password:'wrong',confirmation:'WIEDERHERSTELLEN',backup:exported.backup})).status,403);
 r=await send({action:'restore',password:'correct',confirmation:'WIEDERHERSTELLEN',backup:exported.backup});assert.equal(r.status,200);assert.equal(r.body.tournament.schedule[0].games[0].result,'0-1');assert.ok(r.body.tournament.hasEverResults);assert.equal(r.body.tournament.audit.at(-1).action,'restore');
 assert.equal((await send({action:'restore',password:'correct',confirmation:'WIEDERHERSTELLEN',backup:exported.backup})).status,400);
 assert.equal((await f.request('DELETE',{revision:rev,password:'correct',confirmation:'TURNIER LÖSCHEN'})).status,403);
 assert.equal(f.db.prepare('SELECT id FROM tournaments').get().id,'online-unberuehrt');
});
test('Swiss API persists absence, recalculates legacy rankings, protects completion and isolates readers',async t=>{
 const f=fixture(t);
 const participants=Array.from({length:4},(_,i)=>({id:'swiss-id-'+i,name:'Spieler '+i,dwz:2000-i*100}));
 let state=(await f.request()).body;
 async function post(body){const r=await f.request('POST',{revision:state.revision,...body});assert.equal(r.status,200,r.body.message);state=r.body;}
 await post({tournament:{title:'VM',mode:'swiss',rounds:1,scoring:'three-point',participants,startsOn:'2026-11-01',endsOn:'2026-11-30',timeControl:'90+30'}});
 await post({action:'apply'});
 await post({action:'prepare',seeds:participants.map(p=>p.id),start:'2026-11-01',end:'2026-11-30',absent:[participants[3].id]});
 assert.equal((await f.request('GET',null,'/championship/view')).body.tournament.schedule,undefined);
 await post({action:'release'});
 assert.equal((await f.request('POST',{revision:state.revision,action:'complete'})).status,400);
 await post({action:'result',gameId:state.tournament.schedule[0].games[0].id,result:'1-0'});
 await post({action:'complete'});
 const persisted=JSON.parse(f.db.prepare('SELECT document FROM hsc08_championship').get().document);
 assert.equal(persisted.ranking,undefined);
 assert.ok(state.tournament.ranking.every(row=>Number.isFinite(row.bh)));
 const reader=(await f.request('GET',null,'/championship/view')).body.tournament;
 assert.equal(reader.phase,'completed');assert.equal(reader.audit,undefined);
 assert.equal(reader.schedule[0].absent[0],participants[3].id);
 assert.equal((await f.request('POST',{revision:state.revision,action:'prepare'})).status,400);
 const before=state.revision;
 await post({action:'reopen'});
 assert.equal((await f.request('POST',{revision:before,action:'complete'})).status,409);
});

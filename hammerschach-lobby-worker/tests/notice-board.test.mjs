import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleNoticeBoard,validateNotice,attachmentName,ATTACHMENT_ROOT} from '../src/notice-board.js';
const sample={title:'Testmeldung',description:'Öffentlicher Text',category:'Turniereinladung',expires:'',files:[],links:[]};
function fixture(){
 const db=new DatabaseSync(':memory:');let now=Date.parse('2026-11-25T12:00:00Z'),available=true;const fetched=[];
 const env={DB:{prepare(sql){
   let args=[];
   return {
     bind(...values){args=values;return this;},
     async first(){return db.prepare(sql).get(...args);},
     async all(){return {results:db.prepare(sql).all(...args)};},
     async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}
   };
 }}};
 const users={admin:{id:'1',username:'Andili',isAdmin:true},member:{id:'2',username:'Mitglied'},fake:{id:'3',username:'Andili'},other:{id:'4',username:'Admin2',isAdmin:true},disabled:{id:'1',username:'Andili',isAdmin:true,disabled:true}};
 const deps={json:(data,init)=>Response.json(data,init),session:async r=>users[r.headers.get('authorization')]?{user:users[r.headers.get('authorization')]}:null,isAdmin:u=>u.isAdmin,now:()=>now,fetch:async(url,options)=>{fetched.push({url,options});return new Response(options.method==='HEAD'?null:'%PDF-test',{status:available?200:404});}};
 async function call(role='',body,query=''){const request=new Request('https://test/api/notice-board'+query,{method:body?'POST':'GET',headers:{authorization:role},...(body?{body:JSON.stringify(body)}:{})});const response=await handleNoticeBoard(request,env,deps);return {status:response.status,data:await response.json(),headers:response.headers};}
 return {db,env,deps,call,fetched,setNow:v=>now=Date.parse(v),setAvailable:v=>available=v};
}
test('validation rejects script URLs, credentials, path traversal, invalid dates and excessive files',()=>{
 for(const name of ['../private.pdf','a/b.pdf','a\\b.pdf','%2e%2e.pdf','x.html','x.svg','x.pdf?x','x..pdf'])assert.throws(()=>attachmentName(name));
 assert.equal(attachmentName('Einladung 2027 (öffentlich).PDF'),'Einladung 2027 (öffentlich).PDF');
 for(const links of [['javascript:alert(1)'],['data:text/html,x'],['https://user:secret@example.com']])assert.throws(()=>validateNotice({...sample,links}));
 for(const expires of ['2027-02-29','2026-13-01','x'])assert.throws(()=>validateNotice({...sample,expires}));
 assert.throws(()=>validateNotice({...sample,files:Array(11).fill('a.pdf')}));
 assert.equal(validateNotice({...sample,title:'<img onerror=alert(1)>',extra:'ignored'}).extra,undefined);
});
test('public reads are anonymous; all management actions enforce Andili plus server admin identity',async()=>{
 const f=fixture();assert.equal((await f.call()).status,200);
 for(const role of ['', 'member','fake','other','disabled']){
  assert.equal((await f.call(role,undefined,'?manage=1')).status,role?403:401);
  for(const action of ['draft','publish','hide','delete'])assert.equal((await f.call(role,{action,revision:0,notice:sample,approved:true})).status,role?403:401);
 }
 assert.deepEqual((await f.call()).data.items,[]);f.db.close();
});
test('draft snapshots, attachment checks, conflict protection, hide, republish and delete',async()=>{
 const f=fixture();const save=await f.call('admin',{action:'draft',revision:0,notice:{...sample,files:['cup.pdf']}});assert.equal(save.status,200);const id=save.data.id;
 assert.equal((await f.call()).data.items.length,0);
 f.setAvailable(false);assert.equal((await f.call('admin',{action:'publish',id,revision:1,notice:{...sample,files:['cup.pdf']},approved:true})).status,400);
 assert.equal((await f.call()).data.items.length,0);f.setAvailable(true);
 assert.equal((await f.call('admin',{action:'publish',id,revision:1,notice:{...sample,files:['cup.pdf']}})).status,400);
 assert.equal((await f.call('admin',{action:'publish',id,revision:1,notice:{...sample,files:['cup.pdf']},approved:true})).status,200);
 assert.equal(f.fetched.at(-1).url,ATTACHMENT_ROOT+'cup.pdf');assert.equal(f.fetched.at(-1).options.redirect,'manual');
 let publicItem=(await f.call()).data.items[0];assert.equal(publicItem.revision,undefined);assert.equal(publicItem.isNew,true);const stamp=publicItem.publishedAt;
 await f.call('admin',{action:'draft',id,revision:2,notice:{...sample,title:'Geheimer Entwurf'}});
 assert.equal((await f.call()).data.items[0].title,sample.title);
 assert.equal((await f.call('admin',{action:'hide',id,revision:2})).status,409);
 assert.equal((await f.call('admin',undefined,'?manage=1')).data.items[0].status,'Unveröffentlichte Änderungen');
 await f.call('admin',{action:'hide',id,revision:3});assert.equal((await f.call()).data.items.length,0);
 await f.call('admin',{action:'publish',id,revision:4,notice:sample,approved:true});assert.equal((await f.call()).data.items[0].publishedAt,stamp);
 assert.equal((await f.call('admin',{action:'delete',id,revision:5})).status,400);
 await f.call('admin',{action:'delete',id,revision:5,confirmation:'MELDUNG LÖSCHEN'});
 assert.equal((await f.call()).data.items.length,0);assert.equal((await f.call('admin',undefined,'?manage=1')).data.items.length,0);
 assert.equal((await f.call('admin',{action:'draft',id,revision:5,notice:sample})).status,409);
 assert.ok(f.fetched.every(r=>r.options.method==='HEAD'));f.db.close();
});
test('seven-day badge, Berlin end-of-day expiry, newest first, no expired publication',async()=>{
 const f=fixture();await f.call('admin',{action:'publish',revision:0,notice:sample,approved:true});
 f.setNow('2026-12-02T11:59:59Z');assert.equal((await f.call()).data.items[0].isNew,true);
 f.setNow('2026-12-02T12:00:00Z');assert.equal((await f.call()).data.items[0].isNew,false);
 await f.call('admin',{action:'publish',revision:0,notice:{...sample,title:'Neu',expires:'2026-12-02'},approved:true});assert.equal((await f.call()).data.items[0].title,'Neu');
 f.setNow('2026-12-02T22:59:59Z');assert.equal((await f.call()).data.items.length,2);
 f.setNow('2026-12-02T23:00:00Z');assert.equal((await f.call()).data.items.length,1);
 assert.equal((await f.call('admin',undefined,'?manage=1')).data.items[0].status,'Abgelaufen');
 assert.equal((await f.call('admin',{action:'publish',revision:0,notice:{...sample,expires:'2026-12-02'},approved:true})).status,400);f.db.close();
});
test('public attachment route redirects to the public Gamer file on a fixed origin; preflight works',async()=>{
 const f=fixture();const r=await handleNoticeBoard(new Request('https://test/api/notice-board/files/cup.pdf'),f.env,f.deps);
 assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://hammerschach-gamer.webmaster-5bb.workers.dev/SchwarzesBrett/anhaenge/cup.pdf');assert.equal(f.fetched.length,0);
 for(const name of ['x.html','a%2Fb.pdf'])assert.equal((await handleNoticeBoard(new Request('https://test/api/notice-board/files/'+name),f.env,f.deps)).status,400);
 const preflight=await handleNoticeBoard(new Request('https://test/api/notice-board',{method:'OPTIONS'}),f.env,f.deps);assert.equal(preflight.status,204);f.db.close();
});

test('actual Worker entry routes preflight, public reads and admin identity correctly',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');const f=fixture();
 const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export class /gm,'class ').replace(/^export default /m,'const worker = ');
 const context=vm.createContext({URL,Request,Response,Headers,TextEncoder,TextDecoder,console,setTimeout,clearTimeout,handleNoticeBoard});
 vm.runInContext(source,context);vm.runInContext("lookupAuthSession=async(env,token)=>token==='admin'?{user:{id:'one',username:'Andili',is_admin:1}}:token==='fake'?{user:{id:'two',username:'Andili'}}:null;globalThis.entry=worker",context);
 const request=(method,auth,body)=>context.entry.fetch(new Request('https://test/api/notice-board',{method,headers:{authorization:'Bearer '+auth},...(body?{body:JSON.stringify(body)}:{})}),f.env);
 assert.equal((await request('OPTIONS','')).status,204);assert.equal((await request('GET','')).status,200);
 for(const auth of ['', 'fake'])assert.equal((await request('POST',auth,{action:'draft',revision:0,notice:sample})).status,auth?403:401);
 assert.equal((await request('POST','admin',{action:'draft',revision:0,notice:sample})).status,200);
 assert.equal((await (await request('GET','')).json()).items.length,0);f.db.close();
});

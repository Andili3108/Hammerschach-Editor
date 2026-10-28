import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export class /gm,'class ').replace(/^export default /m,'const worker = ');
function fixture(){
 const db=new DatabaseSync(':memory:');
 const DB={prepare(sql){let values=[];return {bind(...v){values=v;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},async run(){return db.prepare(sql).run(...values)}}},async batch(statements){return Promise.all(statements.map(s=>s.run()))}};
 const c=vm.createContext({URL,Request,Response,Headers,TextEncoder,TextDecoder,console,setTimeout,clearTimeout,handleSchacheckeApi:async()=>null,handleReaderArchivesApi:async()=>null,handleLeagueStandingsApi:async()=>null});
 vm.runInContext(source,c);
 vm.runInContext(`lookupAuthSession=async()=>null;loadTvConfig=async()=>({slots:[]});resolveTvConfigSet=async()=>({});tvSetDto=()=>({slots:[]});listOpenGameOffers=async()=>[{roomId:'Test1234'}];`,c);
 const env={DB,AVATARS:{async get(){return {size:5,body:'hello'}}}};
 const call=(path,method='GET')=>{const u=new URL('https://test'+path);return c.handleAuthApi(new Request(u,{method}),env,u)};
 return {db,c,env,call};
}
test('public TV and offer reads; online acceptance and administration stay protected',async()=>{
 const f=fixture();try{
  for(const p of ['/api/tv','/api/open-offers'])assert.equal((await f.call(p)).status,200);
  for(const [p,m] of [['/api/open-offers/Test1234','POST'],['/api/open-offers/Test1234','DELETE'],['/api/admin/tv','POST'],['/api/admin/info-center','GET'],['/api/admin/info-center','POST']])assert.equal((await f.call(p,m)).status,401,p);
 }finally{f.db.close()}
});
test('visitors read published messages and attachments, never drafts, scheduled or expired items; no anonymous read rows',async()=>{
 const f=fixture();try{
  await f.c.ensureInfoCenterTables(f.env);
  const insert=f.db.prepare(`INSERT INTO info_center_items(id,title,summary,body,status,starts_at,ends_at,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`);
  for(const [id,status,start,end] of [['public','published','2020-01-01',null],['draft','draft','2020-01-01',null],['future','published','2099-01-01',null],['expired','published','2020-01-01','2020-02-01']])insert.run(id,id,'Summary','Full message',status,start,end,'admin','2020-01-01','2020-01-01');
  const list=await(await f.call('/api/info-center')).json();assert.deepEqual(list.items.map(i=>i.id),['public']);assert.equal(list.unreadCount,0);
  const item=await(await f.call('/api/info-center/public')).json();assert.equal(item.item.body,'Full message');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM info_center_reads').get().n,0);
  for(const id of ['draft','future','expired','missing'])assert.equal((await f.call('/api/info-center/'+id)).status,404,id);
  // Actual attachment access uses the same publication window as the detail route.
  const columns=f.db.prepare('PRAGMA table_info(info_center_attachments)').all();
  const values={id:'file',item_id:'public',file_kind:'document',file_name:'test.txt',mime_type:'text/plain',size_bytes:5,object_key:'file',created_at:'2020-01-01',sort_order:0};
  const names=columns.filter(col=>Object.hasOwn(values,col.name)).map(col=>col.name);
  f.db.prepare(`INSERT INTO info_center_attachments (${names.join(',')}) VALUES (${names.map(()=>'?')})`).run(...names.map(n=>values[n]));
  assert.equal((await f.call('/api/info-center/attachments/file')).status,200);
  f.db.prepare("UPDATE info_center_items SET status='draft' WHERE id='public'").run();assert.equal((await f.call('/api/info-center/attachments/file')).status,404);
 }finally{f.db.close()}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {handleRatingHistoryApi} from '../src/rating-history.js';

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export class /gm, 'class ').replace(/^export default /m, 'const worker = ');
async function fixture(t){
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT); INSERT INTO users VALUES ('member001','Andili'),('member002','Gegner');");
  const env = {DB:{prepare(sql){
    let args=[];
    return {bind(...values){args=values; return this;},async first(){return db.prepare(sql).get(...args);},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};
  }}};
  const context=vm.createContext({console,Response,Request,URL,Headers,TextEncoder,TextDecoder,setTimeout,clearTimeout,handleRatingHistoryApi});
  vm.runInContext(source,context);
  context.lookupAuthSession=async(_,token)=>token==='test'?{user:{id:'member002'}}:null;
  await context.ensureRatingTables(env);
  const add=(id,type,at,before,after,white='member001',black='member002')=>db.prepare(`INSERT INTO rated_games VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,type,white,black,'1-0',before,100,after,90,before+100,100,after-20,90,at);
  const api=async(query='',token='test',target='member001')=>{
    const url=new URL('https://example.invalid/api/members/'+target+'/rating-history?'+query);
    if(!url.searchParams.has('type')) url.searchParams.set('type','daily_classic');
    const res=await context.handleAuthApi(new Request(url,{headers:token?{authorization:'Bearer '+token}:{}}),env,url);
    return {status:res.status,cache:res.headers.get('cache-control'),body:await res.json()};
  };
  return {db,add,api};
}
test('Authentifizierung, Validierung, unbekanntes Mitglied und leere Historie',async t=>{
  const {api}=await fixture(t);
  assert.equal((await api('','')).status,401);
  for(const query of ['&range=invalid','&offset=-1','&offset=3','&snapshot=NaN','&type=unknown']){
    assert.equal((await api(query)).status,400,query);
  }
  assert.equal((await api('','test','missing001')).status,404);
  const result=await api();
  assert.equal(result.status,200); assert.match(result.cache,/no-store/);
  assert.deepEqual(result.body.points,[]); assert.equal(result.body.nextOffset,null);
});
test('Verlauf trennt Ratingarten und Teilnehmer; Schwarz erhält die richtigen Werte',async t=>{
  const {add,api}=await fixture(t);
  add('private-room-secret','daily_classic','2026-09-01T12:00:00.000Z',1500,1530);
  add('second','daily_classic','2026-09-02T12:00:00.000Z',1530,1540,'member002','member001');
  add('blitz','live_blitz','2026-09-03T12:00:00.000Z',1500,1600);
  add('unrelated','daily_classic','2026-09-04T12:00:00.000Z',1500,1700,'elsewhere1','elsewhere2');
  const {body}=await api();
  assert.equal(body.total,2);
  assert.deepEqual(body.points.map(p=>[p.before,p.rating]),[[1500,1530],[1630,1520]]);
  assert.doesNotMatch(JSON.stringify(body),/private-room-secret|room_id|white_user_id|black_user_id/);
});
test('Zeitraum filtert alte Wertungen, Gesamt enthält sie',async t=>{
  const {add,api}=await fixture(t);
  add('old','daily_classic','2020-01-01T00:00:00.000Z',1500,1520);
  add('new','daily_classic',new Date().toISOString(),1520,1550);
  assert.equal((await api('&range=3m')).body.total,1);
  assert.equal((await api('&range=1y')).body.total,1);
  assert.equal((await api('&range=3y')).body.total,1);
  assert.equal((await api('&range=all')).body.total,2);
});
test('Ältere Seiten bleiben bei neuen Wertungen stabil und verlieren keine Zeitgleichheiten',async t=>{
  const {add,api}=await fixture(t);
  for(let i=0;i<503;i++) add('game'+i,'daily_classic','2026-09-01T00:00:00.000Z',1500+i,1501+i);
  const first=(await api()).body;
  assert.equal(first.points.length,500); assert.equal(first.nextOffset,500);
  add('later','daily_classic','2026-09-02T00:00:00.000Z',2200,2220);
  const second=(await api('&offset=500&snapshot='+first.snapshot)).body;
  assert.equal(second.points.length,3); assert.equal(second.nextOffset,null); assert.equal(second.total,503);
  assert.deepEqual([...second.points,...first.points].map(p=>p.rating),Array.from({length:503},(_,i)=>1501+i));
});

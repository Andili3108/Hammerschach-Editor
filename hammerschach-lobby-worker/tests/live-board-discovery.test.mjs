import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleLiveBoardApi,fetchSource} from '../src/live-board.js';
import {sourceFromLink,savedEvents,saveEvent} from '../src/live-board-catalog.js';

const tour={id:'Test2026',name:'Mannschaftsmeisterschaft',teamTable:true};
const rounds=[{id:'Round001',name:'Runde 1',finished:true},{id:'Round002',name:'Runde 2',ongoing:true},{id:'Round003',name:'Runde 3'}];
const pgn='[White "Anna"]\n[Black "Berta"]\n1. e4 e5 *\n';
const helpers={json:(d,o)=>new Response(JSON.stringify(d),o),bearerTokenFromRequest:r=>r.headers.get('authorization'),lookupAuthSession:async(e,t)=>t==='Bearer test'?{user:{username:'Andili'}}:t==='Bearer other'?{user:{username:'Other'}}:null};
const call=(path,env,deps,method='GET',body,token='test')=>{
  const url=new URL('https://test/api/live-board/'+path);
  return handleLiveBoardApi(new Request(url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env,url,helpers,deps);
};
function database(){
  const sql=new DatabaseSync(':memory:');
  return {prepare(text){let args=[];return {bind(...values){args=values;return this;},async run(){const r=sql.prepare(text).run(...args);return {meta:{changes:r.changes}};},async first(){return sql.prepare(text).get(...args)||null;},async all(){return {results:sql.prepare(text).all(...args)};}};}};
}
let calls=[];
const deps={cache:null,fetcher:async url=>{
  calls.push(url);
  if(url.endsWith('/top'))return Response.json({active:[{tour,round:rounds[1]}],upcoming:[],past:{currentPageResults:[]}});
  if(url.endsWith('/Test2026'))return Response.json({tour,rounds});
  if(url.endsWith('Round003.pgn'))return new Response('');
  if(url.includes('.pgn'))return new Response(url.includes('Round001')?pgn.replace('*','1-0'):pgn);
  throw Error('Unexpected URL '+url);
}};

test('automatic catalog, explicit team category, round selection and cache reuse',async()=>{
  const env={};const catalog=await(await call('events?category=tournament',env,deps)).json();
  assert.equal(catalog.events.length,1);assert.equal(catalog.events[0].title,tour.name);assert.equal(catalog.events[0].source,undefined);
  const club=await(await call('events?category=club',env,deps)).json();assert.equal(club.events.length,1);
  const event=catalog.events[0];const board=await(await call('events/'+event.id+'/boards',env,deps)).json();
  assert.equal(board.games[0].white,'Anna');assert.equal(board.event.rounds.length,3);
  assert.equal(board.pollAfterMs,30000);
  await call('events/'+event.id+'/boards?board=1',env,deps);
  assert.equal(calls.filter(u=>u.endsWith('/top')).length,1);assert.equal(calls.filter(u=>u.endsWith('Round002.pgn')).length,1);
  const ended=await(await call('events/'+board.event.rounds[0].id+'/boards',env,deps)).json();assert.equal(ended.pollAfterMs,0);
  const future=await(await call('events/'+board.event.rounds[2].id+'/boards',env,deps)).json();assert.equal(future.games.length,0);assert.equal(future.pollAfterMs,60000);
  assert.equal((await call('events/lc-tournament-Test2026-Unknown1/boards',env,deps)).status,404);
});
test('saved source persists in D1, duplicate deduplication and removal',async()=>{
  const env={DB:database(),LIVE_BOARD_DISCOVERY:'0'};
  const body={category:'club',title:'Vereinsabend',url:'https://lichess.org/broadcast/test/round-2/Save0001'};
  const response=await call('sources',env,deps,'POST',body);assert.equal(response.status,201);
  const {event}=await response.json();assert.equal(event.saved,true);assert.equal(event.source,undefined);
  assert.equal((await(await call('sources',env,deps,'POST',body)).json()).event.id,event.id);
  assert.equal((await savedEvents(env)).length,1);
  assert.equal((await(await call('events/'+event.id+'/boards',env,deps)).json()).games.length,1);
  assert.equal((await call('sources/'+event.id,env,deps,'DELETE')).status,200);
  assert.equal((await savedEvents(env)).length,0);
  assert.equal((await call('events/'+event.id+'/boards',env,deps)).status,404);
});
test('source management validates HTTPS links, round ids, PGN allowlist and body size',async()=>{
  const dgt=sourceFromLink({category:'club',title:'DGT',url:'https://view.livechesscloud.com/#12345678-1234-1234-1234-123456789abc/3'},{});
  assert.equal(dgt.source.round,3);
  const valid={category:'club',title:'PGN',url:'https://pgn.example/live.pgn'};
  assert.throws(()=>sourceFromLink(valid,{}));assert.equal(sourceFromLink(valid,{LIVE_BOARD_PGN_HOSTS:'pgn.example'}).source.type,'pgn');
  for(const url of ['https://localhost/a','https://127.0.0.1/a','https://lichess.org/broadcast/tour/abcdefgh','http://view.livechesscloud.com/#12345678-1234-1234-1234-123456789abc','https://user:pass@lichess.org/api/broadcast/round/Abcd1234.pgn'])assert.throws(()=>sourceFromLink({...valid,url},{}));
  assert.equal((await call('sources',{},deps,'POST',{...valid,title:'x'.repeat(5000)})).status,400);
});
test('all discovery, saved sources and writes deny guests and other members before work',async()=>{
  for(const token of ['','other'])for(const [route,method] of [['events','GET'],['events/lc-tournament-Test2026-Round002/boards','GET'],['sources','POST'],['sources/saved-'+'a'.repeat(32),'DELETE']]){
    const response=await call(route,{DB:{prepare(){assert.fail('must not access DB');}}},{fetcher(){assert.fail('must not fetch');}},method,method==='POST'?{}:undefined,token);
    assert.equal(response.status,token?403:401);
  }
});
test('saved source cap is enforced in SQL without changing existing entries',async()=>{
  const env={DB:database()};
  for(let i=0;i<40;i++)await saveEvent(env,{title:'T'+i,category:'club',source:{type:'pgn',url:'https://pgn.example/'+i}});
  await assert.rejects(saveEvent(env,{title:'Overflow',category:'club',source:{type:'pgn',url:'https://pgn.example/overflow'}}));
  assert.equal((await savedEvents(env)).length,40);
});
test('Lichess requests serialize and HTTP 429 pauses every endpoint for a minute',async()=>{
  let active=0,max=0;
  const fetcher=async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return new Response('ok');};
  await Promise.all([fetchSource('https://lichess.org/a',fetcher),fetchSource('https://lichess.org/b',fetcher)]);assert.equal(max,1);
  let n=0;const limited=async()=>{n++;return new Response('',{status:429});};
  await assert.rejects(fetchSource('https://lichess.org/a',limited));await assert.rejects(fetchSource('https://lichess.org/b',limited));assert.equal(n,1);
});

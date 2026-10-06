import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {parseLivePgn,sourceEvents,safeSourceUrl,dgtGame,dgtPairings,demoGames} from '../src/live-board-sources.js';
import {handleLiveBoardApi,sharedLiveCache,fetchSource} from '../src/live-board.js';
const pgn=(moves='1. e4 e5 *',extra='')=>`[Event "Test"]\n[White "A <script>"]\n[Black "B"]\n${extra}\n${moves}\n`;
const env={LIVE_BOARD_DISCOVERY:'0',LIVE_BOARD_DEMO:'1',LIVE_BOARD_EVENTS:JSON.stringify([{id:'club',category:'club',title:'Test',source:{type:'demo'}},{id:'turnier',category:'tournament',title:'Turnier',source:{type:'demo'}}])};
const helpers={json:(d,init)=>new Response(JSON.stringify(d),init),bearerTokenFromRequest:r=>r.headers.get('authorization'),lookupAuthSession:async(e,t)=>t==='Bearer valid'?{user:{id:'member',username:'Andili'}}:null};
const call=(path,token='valid',config=env,deps={})=>{const url=new URL('https://gamer.test/api/live-board/'+path);const request=new Request(url,{headers:token?{authorization:'Bearer '+token}:{}});return handleLiveBoardApi(request,config,url,helpers,deps);};

test('guest/invalid/expired session blocked before catalog or external work',async()=>{
  for(const token of ['', 'invalid','expired']){
    const r=await call('events',token,{LIVE_BOARD_EVENTS:'broken'});assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/);
    const boards=await call('events/club/boards',token,env,{fetcher:()=>assert.fail('must not fetch')});assert.equal(boards.status,401);
  }
});
test('catalog strips URLs and supports both categories',async()=>{const r=await call('events');const d=await r.json();assert.equal(d.events.length,2);assert.equal(d.events[0].source,undefined);assert.equal(r.headers.get('vary'),'Authorization');});
test('4 boards, pagination, search, single board, finished polling stop',async()=>{
  const first=await (await call('events/club/boards')).json();assert.equal(first.games.length,4);assert.equal(first.pages,3);assert.equal(first.pollAfterMs,30000);
  const second=await (await call('events/club/boards?page=3')).json();assert.equal(second.games.length,2);assert.equal(second.pollAfterMs,0);
  const single=await (await call('events/club/boards?board=3')).json();assert.equal(single.games.length,1);assert.equal(single.games[0].board,3);
  const search=await (await call('events/club/boards?q=Schwarz%205')).json();assert.equal(search.games.length,1);assert.equal(search.games[0].board,5);
  const numeric=await (await call('events/club/boards?q=9')).json();assert.equal(numeric.games[0].board,9);
  assert.equal((await call('events/club/boards?page=-1')).status,400);assert.equal((await call('events/club/boards?board=999')).status,404);
});
test('PGN mainline, variations, NAGs, comments, clocks and multiple games',()=>{
  const parsed=parseLivePgn(pgn('1.e4 {[%clk 1:30:00]} e5 (1... c5 (2. Nf3)) 2.Nf3 $1 Nc6 {[%clk 1:29:00]} *')+'\n'+pgn('1. d4 d5 1/2-1/2'));
  assert.deepEqual(parsed[0].moves,['e4','e5','Nf3','Nc6']);assert.deepEqual(parsed[0].clocks,{white:'1:30:00',black:'1:29:00'});assert.equal(parsed[1].finished,true);
  assert.throws(()=>parseLivePgn(pgn('1. e4 {broken')));assert.throws(()=>parseLivePgn(pgn('1. e4')));assert.throws(()=>parseLivePgn('<html>Not PGN</html>'));
  assert.throws(()=>parseLivePgn(pgn('1. e4 1-0','[Result "*"]')));
});
test('source allowlist rejects local hosts, insecure URLs, credentials and redirects',async()=>{
  for(const url of ['http://example.com/a','https://127.0.0.1/a','https://user:secret@example.com/a','https://example.com:444/a','https://example.com/a#fragment'])assert.throws(()=>safeSourceUrl(url,['example.com','127.0.0.1']));
  assert.equal(safeSourceUrl('https://example.com/live.pgn',['example.com']),'https://example.com/live.pgn');
  await fetchSource('https://example.com',async(url,init)=>{assert.equal(init.redirect,'manual');assert.equal(init.headers.authorization,undefined);return new Response('ok');});
  await assert.rejects(fetchSource('https://example.com',async()=>new Response('x',{headers:{'content-length':'9999999'}})));
  for(const code of [301,302,303,307,308])await assert.rejects(fetchSource('https://example.com/live.pgn',async()=>new Response('',{status:code,headers:{location:'https://127.0.0.1/private'}})),/Weiterleitungen/);
  assert.throws(()=>sourceEvents({LIVE_BOARD_EVENTS:JSON.stringify([{id:'bad',title:'Bad',category:'club',source:{type:'pgn',url:'https://unknown.com/a'}}])}));
});
test('shared concurrent fetch, TTL, stale fallback, error backoff and finished cache',async()=>{
  let time=100000,fetches=0;const key='test-'+crypto.randomUUID();let fail=false;
  const read=async()=>{fetches++;if(fail)throw Error('offline');return {games:[1]};};const options={now:()=>time,cache:null};
  const [a,b]=await Promise.all([sharedLiveCache(key,30000,read,options),sharedLiveCache(key,30000,read,options)]);assert.equal(fetches,1);assert.deepEqual(a,b);
  time+=20000;await sharedLiveCache(key,30000,read,options);assert.equal(fetches,1);
  time+=20000;fail=true;const stale=await sharedLiveCache(key,30000,read,options);assert.equal(stale.stale,true);assert.equal(stale.updatedAt,100000);
  await sharedLiveCache(key,30000,read,options);assert.equal(fetches,2);
  time+=60001;fail=false;assert.equal((await sharedLiveCache(key,30000,read,options)).stale,false);assert.equal(fetches,3);
  const done='done-'+key;await sharedLiveCache(done,30000,async()=>({finished:true}),options);time+=60000;await sharedLiveCache(done,30000,()=>assert.fail('finished fetch'),options);
});
test('DGT adapter maps ESAN/result/clock and fetches only requested games',async()=>{
  const pair=dgtPairings({pairings:[{white:{fname:'Ada',lname:'Test'},black:'Bob',index:0,result:'DRAW'}]})[0];assert.equal(pair.white,'Ada Test');
  const game=dgtGame({moves:['e4 300','e5 299+1'],result:'DRAW',clock:{white:300,black:299}},pair);assert.deepEqual(game.moves,['e4','e5']);assert.equal(game.clocks.white,'0:05:00');assert.equal(game.finished,true);
  const urls=[];const id=crypto.randomUUID();const config={LIVE_BOARD_EVENTS:JSON.stringify([{id:'dgt',title:'DGT',category:'club',source:{type:'dgt',tournamentId:id,round:1}}])};
  const fetcher=async url=>{urls.push(url);return new Response(JSON.stringify(url.includes('/meta/')?{host:'1.livechesscloud.com'}:url.endsWith('index.json')?{pairings:Array.from({length:20},(_,i)=>({white:'W',black:'B',index:i}))}:{moves:['e4'],result:'*'}));};
  const d=await(await call('events/dgt/boards?board=12','valid',config,{fetcher,cache:null})).json();assert.equal(d.games.length,1);assert.equal(urls.filter(u=>u.includes('/game-')).length,1);assert.ok(urls.some(u=>u.endsWith('game-12.json')));
  await call('events/dgt/boards?board=12','valid',config,{fetcher,cache:null});assert.equal(urls.length,3);
});
test('PGN fetch shared across viewers and pages; partial update retains old data',async()=>{
  const url='https://pgn.example/'+crypto.randomUUID()+'.pgn';let requests=0,time=10000,broken=false;
  const config={LIVE_BOARD_PGN_HOSTS:'pgn.example',LIVE_BOARD_EVENTS:JSON.stringify([{id:'pgn',title:'PGN',category:'tournament',source:{type:'pgn',url}}])};
  const deps={now:()=>time,cache:null,fetcher:async()=>{requests++;return new Response(broken?pgn('1. e4 {'):Array.from({length:10},()=>pgn()).join('\n'));}};
  await call('events/pgn/boards','valid',config,deps);await call('events/pgn/boards?page=2','valid',config,deps);assert.equal(requests,1);
  time+=31000;broken=true;const d=await(await call('events/pgn/boards','valid',config,deps)).json();assert.equal(d.games.length,4);assert.equal(d.stale,true);assert.equal(d.pollAfterMs,60000);
});

const ctx=vm.createContext({console,localStorage:{getItem:()=>null}});
for(const file of ['chess-utils.js','chess960-core.js','game-setup.js','board-setup-utils.js','chess-engine.js','live-board-position.js'])vm.runInContext(fs.readFileSync(new URL('../../Gamer/js/'+file,import.meta.url),'utf8'),ctx);
const replay=data=>{ctx.input=data;return vm.runInContext('LiveBoardPosition.replay(input)',ctx);};
test('isolated Gamer engine replays castling, en passant, promotion and black-to-move FEN',()=>{
  const g={variant:'Standard',fen:'',moves:['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O']};let r=replay(g);assert.equal(r.positions.at(-1).board[7][6],'K');assert.equal(r.positions.at(-1).board[7][5],'R');
  r=replay({...g,moves:['e4','a6','e5','d5','exd6']});assert.equal(r.positions.at(-1).board[2][3],'P');assert.equal(r.positions.at(-1).board[3][3],'.');
  r=replay({...g,fen:'7k/P7/8/8/8/8/8/7K w - - 0 1',moves:['a8=N']});assert.equal(r.positions.at(-1).board[0][0],'N');
  r=replay({...g,fen:'7k/8/8/8/8/8/8/7K b - - 0 20',moves:['Kg8']});assert.equal(r.firstTurn,'b');assert.equal(r.firstNumber,20);
  assert.throws(()=>replay({...g,moves:['e5']}));assert.throws(()=>replay({...g,variant:'Chess960'}));
  for(const game of demoGames())replay(game);
});

test('empty rounds retry slowly; numeric jump selects exact board; event reads reject writes',async()=>{
  const numeric=await(await call('events/club/boards?q=1')).json();assert.equal(numeric.games.length,1);assert.equal(numeric.games[0].board,1);
  const url=new URL('https://test/api/live-board/events');const req=new Request(url,{method:'POST',headers:{authorization:'Bearer valid'}});assert.equal((await handleLiveBoardApi(req,env,url,helpers)).status,405);
  const id=crypto.randomUUID();const config={LIVE_BOARD_EVENTS:JSON.stringify([{id:'empty',title:'Startet bald',category:'club',source:{type:'dgt',tournamentId:id,round:1}}])};
  const fetcher=async u=>new Response(JSON.stringify(u.includes('/meta/')?{host:'1.livechesscloud.com'}:{pairings:[]}));
  const empty=await(await call('events/empty/boards','valid',config,{fetcher,cache:null})).json();assert.equal(empty.total,0);assert.equal(empty.pollAfterMs,60000);
});
test('cache persists normalized data in shared edge cache, including negative-cache backoff',async()=>{
  const store=new Map();let writes=0;const cache={match:async r=>store.get(r.url)?.clone(),put:async(r,v)=>{writes++;store.set(r.url,v.clone());}};
  const key=crypto.randomUUID();let time=10000;
  await sharedLiveCache(key,30000,async()=>({games:[1]}),{cache,now:()=>time});assert.equal(writes,1);
  for(let i=0;i<25;i++)await sharedLiveCache('evict-'+key+i,1000,async()=>({}),{cache:null,now:()=>time});
  const hit=await sharedLiveCache(key,30000,()=>assert.fail('edge hit must not fetch'),{cache,now:()=>time});assert.deepEqual(hit.value,{games:[1]});
  const bad='bad-'+key;let calls=0;const read=async()=>{calls++;throw Error('offline');};
  await assert.rejects(sharedLiveCache(bad,30000,read,{cache,now:()=>time}));await assert.rejects(sharedLiveCache(bad,30000,read,{cache,now:()=>time}));assert.equal(calls,1);
});
test('DGT rejects an untrusted lookup host and duplicate board IDs',async()=>{
  assert.throws(()=>dgtPairings({pairings:[{index:0},{index:0}]}));
  const config={LIVE_BOARD_EVENTS:JSON.stringify([{id:'badhost',title:'Bad',category:'club',source:{type:'dgt',tournamentId:crypto.randomUUID(),round:1}}])};
  let requests=0;const fetcher=async()=>{requests++;return new Response(JSON.stringify({host:'127.0.0.1'}));};
  assert.equal((await call('events/badhost/boards','valid',config,{fetcher,cache:null})).status,503);assert.equal(requests,1);
});

test('other authenticated members cannot read catalog or boards during Andili preview',async()=>{
  const h={...helpers,lookupAuthSession:async()=>({user:{id:'other',username:'Other',isAdmin:true}})};
  for(const route of ['events','events/club/boards']){
    const u=new URL('https://test/api/live-board/'+route);
    const response=await handleLiveBoardApi(new Request(u),{LIVE_BOARD_EVENTS:'invalid'},u,h,{fetcher:()=>assert.fail('must not fetch')});
    assert.equal(response.status,403);assert.equal((await response.json()).code,'LIVE_BOARD_RESTRICTED');
  }
});

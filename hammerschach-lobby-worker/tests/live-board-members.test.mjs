import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLiveBoardApi,matchesPlayer,sharedLiveCache} from '../src/live-board.js';
import {CLUB_SCOPES,classifyBroadcast} from '../src/live-board-classification.js';
import {sourceFromLink} from '../src/live-board-catalog.js';
const helpers={json:(d,i)=>Response.json(d,i),bearerTokenFromRequest:r=>r.headers.get('authorization'),lookupAuthSession:async(e,t)=>t==='member'?{user:{username:'Member'}}:null};
async function call(path,env,deps={},token='member'){
 const url=new URL('https://test/api/live-board/'+path);
 return handleLiveBoardApi(new Request(url,{headers:{authorization:token}}),env,url,helpers,deps);
}
const pgn='[White "Carlsen, Magnus"]\n[Black "Keymer, Vincent"]\n1. e4 e5 *\n';
test('player tokens match one player, tolerate accents and name order',()=>{
 const game={white:'Lipske, Andreas',black:'Müller, Jörg'};
 for(const q of ['Andreas Lipske','Lipske Andreas','Jorg Muller','Müller'])assert.equal(matchesPlayer(game,q),true,q);
 for(const q of ['Andreas Müller','???','Carlsen'])assert.equal(matchesPlayer(game,q),false,q);
});
test('all regional associations are accepted, Opens remain tournaments',()=>{
 const examples={'baden':'Oberliga Baden','bayern':'Bayerische Landesliga','berlin':'Berliner Landesliga','brandenburg':'Brandenburg Landesliga','bremen':'Bremer Mannschaftsmeisterschaft','hamburg':'Hamburger Liga','hessen':'Hessische Liga','mecklenburg-vorpommern':'Mecklenburg-Vorpommern Landesliga','niedersachsen':'Niedersachsen Landesliga','rheinland-pfalz':'Rheinland-Pfalz Liga','saarland':'Saarländische Liga','sachsen':'Sächsische Liga','sachsen-anhalt':'Sachsen-Anhalt Landesliga','schleswig-holstein':'Schleswig-Holstein Landesliga','thueringen':'Thüringer Landesliga','wuerttemberg':'Württemberg Liga'};
 for(const [scope,name] of Object.entries(examples)){
  assert.ok(CLUB_SCOPES.includes(scope));assert.equal(classifyBroadcast({name})?.clubScope,scope,name);
  assert.equal(sourceFromLink({category:'club',clubScope:scope,title:'Vereinsabend',url:'https://lichess.org/api/broadcast/round/Test0001.pgn'},{}).clubScope,scope);
 }
 assert.equal(classifyBroadcast({name:'Berlin Open'}).category,'tournament');
 assert.equal(classifyBroadcast({name:'German Bundesliga'}).category,'club');
});
test('single interval changes really refresh shared PGN; overview remains 30 seconds',async()=>{
 let time=100000,calls=0,broken=false;
 const address='https://pgn.example/'+crypto.randomUUID();
 const env={LIVE_BOARD_DISCOVERY:'0',LIVE_BOARD_PGN_HOSTS:'pgn.example',LIVE_BOARD_EVENTS:JSON.stringify([{id:'pgn',title:'Open',category:'tournament',source:{type:'pgn',url:address}}])};
 const deps={cache:null,now:()=>time,fetcher:async()=>{calls++;return new Response(broken?'invalid':pgn);}};
 let d=await(await call('events/pgn/boards',env,deps)).json();assert.equal(d.pollAfterMs,30000);
 time+=6000;
 d=await(await call('events/pgn/boards?board=1&interval=5000',env,deps)).json();assert.equal(d.pollAfterMs,5000);assert.equal(calls,2,'30-second cache must not block faster request');
 await call('events/pgn/boards?board=1&interval=5000',env,deps);assert.equal(calls,2,'other viewers share fetch');
 for(const interval of [10000,15000,30000]){d=await(await call('events/pgn/boards?board=1&interval='+interval,env,deps)).json();assert.equal(d.pollAfterMs,interval);}
 assert.equal((await(await call('events/pgn/boards?board=1&interval=1',env,deps)).json()).pollAfterMs,10000);
 assert.equal((await(await call('events/pgn/boards?interval=5000',env,deps)).json()).pollAfterMs,30000);
 time+=31000;broken=true;
 d=await(await call('events/pgn/boards?board=1&interval=5000',env,deps)).json();assert.equal(d.stale,true);assert.equal(d.pollAfterMs,60000);
 const failed=calls;time+=10000;await call('events/pgn/boards?board=1&interval=5000',env,deps);assert.equal(calls,failed,'fast request cannot bypass error backoff');
});
test('fast subscribers respect finished caches after memory eviction',async()=>{
 let time=10000;const store=new Map(),key=crypto.randomUUID();
 const cache={match:async r=>store.get(r.url)?.clone(),put:async(r,v)=>store.set(r.url,v.clone())};
 await sharedLiveCache(key,30000,async()=>({finished:true}),{cache,now:()=>time});
 for(let i=0;i<25;i++)await sharedLiveCache(key+i,100,async()=>({}),{cache:null,now:()=>time});
 time+=100000;assert.equal((await sharedLiveCache(key,5000,()=>assert.fail('finished fetch'),{cache,now:()=>time})).value.finished,true);
});
test('cross-event search reads DGT pairings only, shares cache across names and reports partial failure',async()=>{
 const id=crypto.randomUUID();let time=100000;const requests=[];
 const env={LIVE_BOARD_DISCOVERY:'0',LIVE_BOARD_PGN_HOSTS:'pgn.example',LIVE_BOARD_EVENTS:JSON.stringify([
  {id:'dgt-'+id,title:'Vereinsabend',category:'club',clubScope:'hamm',source:{type:'dgt',tournamentId:id,round:1}},
  {id:'open-'+id,title:'Open',category:'tournament',source:{type:'pgn',url:'https://pgn.example/'+id}},
  {id:'bad-'+id,title:'Ausfall',category:'club',source:{type:'pgn',url:'https://pgn.example/bad-'+id}}
 ])};
 const deps={cache:null,now:()=>time,fetcher:async u=>{requests.push(u);if(u.includes('/meta/'))return Response.json({host:'1.livechesscloud.com'});if(u.endsWith('index.json'))return Response.json({pairings:[{white:'Lipske, Andreas',black:'Test, Anna'}]});if(u.includes('/bad-'))throw Error('offline');if(u.startsWith('https://pgn.example/'))return new Response(pgn);assert.fail('must not load a DGT board: '+u);}};
 const path='players?events=dgt-'+id+',open-'+id+',bad-'+id+'&q=';
 let d=await(await call(path+'Andreas%20Lipske',env,deps)).json();assert.equal(d.results[0].matches[0].white,'Lipske, Andreas');assert.equal(d.results[1].matches.length,0);assert.equal(d.results[2].unavailable,true);assert.equal(d.results[0].matches[0].moves,undefined);
 const count=requests.length;d=await(await call(path+'Magnus%20Carlsen',env,deps)).json();assert.equal(d.results[1].matches.length,1);assert.equal(requests.length,count,'different query reuses shared pairings');
 assert.equal((await call(path+'a',env,deps)).status,400);
 assert.equal((await call('players?events=a,b,c,d&q=Test',env,deps)).status,400);
 assert.equal((await call('players?events='+id+'&q=Test',env,deps,'guest')).status,401);
 assert.equal(requests.length,count);
 time+=61000;await call(path+'Andreas',env,deps);assert.ok(requests.length>count,'pairings refresh on next explicit search');
});

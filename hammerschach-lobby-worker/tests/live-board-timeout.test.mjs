import test from 'node:test';
import assert from 'node:assert/strict';
const {sharedLiveCache,fetchSource,handleLiveBoardApi}=await import(process.env.LIVE_BOARD_MODULE||'../src/live-board.js');
const never=()=>new Promise(()=>{});
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Unbounded wait')),250);})]);}finally{clearTimeout(timer);}}
const helpers={json:(d,i)=>Response.json(d,i),lookupAuthSession:async()=>({user:{username:'Member'}}),bearerTokenFromRequest:()=>null};
const request=()=>new Request('https://test/api/live-board/events?category=tournament');
const config={LIVE_BOARD_DISCOVERY:'0',LIVE_BOARD_EVENTS:JSON.stringify([{id:'open',title:'Open',category:'tournament',source:{type:'pgn',url:'https://pgn.example/a'}}]),LIVE_BOARD_PGN_HOSTS:'pgn.example'};
test('hung edge cache reads and writes cannot block a valid source',async()=>{
 const cache={match:never,put:never};
 const data=await bounded(sharedLiveCache('hang-edge-'+crypto.randomUUID(),1000,async()=>({games:[1]}),{cache,cacheTimeoutMs:10}));
 assert.deepEqual(data.value.games,[1]);
});
test('hung source loader settles and releases the shared pending slot',async()=>{
 let now=0;const options={cache:null,loadTimeoutMs:10,now:()=>now};const key='hang-source-'+crypto.randomUUID();
 await assert.rejects(bounded(sharedLiveCache(key,1000,never,options)),/Quelle vorübergehend/);
 now=61000;const data=await bounded(sharedLiveCache(key,1000,async()=>({games:[2]}),options));assert.deepEqual(data.value.games,[2]);
});
test('fetch deadline works even when upstream ignores AbortSignal',async()=>{
 let signal;await assert.rejects(bounded(fetchSource('https://source.example/hang',async(u,o)=>{signal=o.signal;return never();},{timeoutMs:10})),/Zeitlimit/);assert.equal(signal.aborted,true);
});
test('stalled response bodies and rejected response bodies are cancelled',async()=>{
 let cancelled=false;const response=()=>new Response(new ReadableStream({pull:never,cancel(){cancelled=true;}}));
 await assert.rejects(bounded(fetchSource('https://source.example/body',async()=>response(),{timeoutMs:10})),/Zeitlimit/);assert.equal(cancelled,true);
 cancelled=false;await assert.rejects(fetchSource('https://source.example/redirect',async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:302})),/Weiterleitungen/);assert.equal(cancelled,true);
});
test('unavailable saved events cannot hide configured events',async()=>{
 const env={...config,DB:{prepare:()=>({run:never})}};
 const response=await bounded(handleLiveBoardApi(request(),env,new URL(request().url),helpers,{cache:null,savedTimeoutMs:10}));
 const data=await response.json();assert.equal(response.status,200);assert.equal(data.savedUnavailable,true);assert.equal(data.events[0].title,'Open');
});
test('authentication timeout returns an error without running any source',async()=>{
 const response=await bounded(handleLiveBoardApi(request(),config,new URL(request().url),{...helpers,lookupAuthSession:never},{authTimeoutMs:10,fetcher:()=>assert.fail('no upstream before authentication')}));
 assert.equal(response.status,503);assert.equal((await response.json()).code,'LIVE_AUTH_UNAVAILABLE');
});
test('slow Lichess search cannot hold up the catalog and successful saved/configured sources',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 try{
  const response=await bounded(handleLiveBoardApi(request(),{...config,LIVE_BOARD_DISCOVERY:'1',LIVE_BOARD_PAGE_DISCOVERY:'0'},new URL(request().url),helpers,{cache:null,discoveryTimeoutMs:10,fetcher:async()=>{await gate;return Response.json({active:[],past:{currentPageResults:[]}});}}));
  const data=await response.json();assert.equal(data.discoveryUnavailable,true);assert.equal(data.events[0].title,'Open');
 }finally{release();}
});

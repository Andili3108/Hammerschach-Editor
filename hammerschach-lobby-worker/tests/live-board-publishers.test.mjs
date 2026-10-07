import test from 'node:test';
import assert from 'node:assert/strict';
import {pageLinks,dgtLink,discoveryPages,discoverPage,discoverPageEvents,resolvePageEvent} from '../src/live-board-discovery-pages.js';
import {handleLiveBoardApi} from '../src/live-board.js';
const uuid='12345678-1234-1234-1234-123456789abc';
const url='https://view.livechesscloud.com/#'+uuid;
const seed={id:'test',name:'SB Hamm',url:'https://publisher.example/',category:'mixed',clubScope:'hamm'};
const fresh=async(key,ttl,load)=>({value:await load(),stale:false,updatedAt:0});

test('extracts actual DGT anchors and iframe, decodes attributes, ignores scripts and spoof hosts',()=>{
  const links=pageLinks(`<script><a href="${url}">Fake</a></script><h2>Unna Open</h2><iframe data-src="${url}/2"></iframe><a href="${url.replace('#','&#35;')}">Hamm &amp; Kamen</a>` ,seed.url);
  assert.equal(links.length,2);assert.equal(links[0].title,'Unna Open');assert.equal(links[1].title,'Hamm & Kamen');
  assert.deepEqual(dgtLink(links[0].url),{tournamentId:uuid,round:2});
  for(const address of [url.replace('.com','.com.evil.example'),url.replace('https:','javascript:'),url.replace('view.','user:pass@view.'),url+'/0',url+'/101'])assert.equal(dgtLink(address),null);
});
test('bounded crawl follows one same-origin publication link, only accepted broadcasts become events',async()=>{
  const seen=[];
  const result=await discoverPage(seed,fresh,async address=>{
    seen.push(address);
    if(address===seed.url)return `<a href="/live">Liveübertragung</a><a href="https://outside.example/live">Live</a><a href="/live-two">Live</a>`;
    assert.equal(address,seed.url+'live');
    return `<h2>Hamm Mannschaftskampf</h2><iframe src="${url}"></iframe><a href="${url}/2">Doppelt</a>`;
  });
  assert.equal(seen.length,2);assert.equal(result.value.events.length,1);
  const e=result.value.events[0];assert.equal(e.category,'club');assert.equal(e.clubScope,'hamm');assert.equal(e.source.round,0);assert.equal(e.status,'unknown');
  const open=await discoverPage(seed,fresh,async()=>`<h2>Unna Open</h2><iframe src="${url}"></iframe>`);
  assert.equal(open.value.events[0].category,'tournament');
  const ambiguous=await discoverPage(seed,fresh,async()=>`<a href="${url}">Live</a>`);assert.equal(ambiguous.value.events.length,0);
});
test('page failures are partial, invalid deployment entries rejected, ids only resolve published links',async()=>{
  const env={LIVE_BOARD_DISCOVERY_PAGES:JSON.stringify([seed,{...seed,id:'other',url:'https://down.example/'}])};
  const read=async address=>{if(address.includes('down'))throw Error('offline');return `<a href="${url}">Quick-Round-Robin</a>`;};
  const r=await discoverPageEvents(env,fresh,read);assert.equal(r.unavailable,1);assert.equal(r.events.length,1);
  assert.equal((await resolvePageEvent(r.events[0].id.replace(/-0$/,'-2'),env,fresh,read)).source.round,2);
  assert.equal(await resolvePageEvent('dg-test-00000000-0000-0000-0000-000000000000-1',env,fresh,read),null);
  assert.throws(()=>discoveryPages({LIVE_BOARD_DISCOVERY_PAGES:JSON.stringify([{...seed,url:'https://127.0.0.1/live'}])}));
  assert.throws(()=>discoveryPages({LIVE_BOARD_DISCOVERY_PAGES:JSON.stringify(Array.from({length:9},(_,i)=>({...seed,id:'p'+i})))}));
});

test('combined API: direct DGT discovery, latest populated round, four visible games, search, cache and auth',async()=>{
  const env={LIVE_BOARD_DISCOVERY_PAGES:JSON.stringify([seed])};const calls=[];
  const helpers={json:(data,init)=>Response.json(data,init),bearerTokenFromRequest:r=>r.headers.get('authorization'),lookupAuthSession:async(e,t)=>t==='Andili'?{user:{username:'Andili'}}:t==='other'?{user:{username:'Other'}}:null};
  const deps={cache:null,fetcher:async(address,options)=>{
    calls.push(address);assert.equal(options.redirect,'manual');assert.equal(options.headers.authorization,undefined);
    if(address===seed.url)return new Response(`<a href="${url}">Hamm Mannschaftskampf</a>`);
    if(address.endsWith('/api/broadcast/top'))return Response.json({active:[{tour:{id:'TourTest',name:'Unna Open'},round:{id:'Round001',name:'Runde 1'}}],past:{currentPageResults:[]}});
    if(address.includes('/meta/'))return Response.json({host:'1.pool.livechesscloud.com'});
    if(address.endsWith('tournament.json'))return Response.json({rounds:[{count:2,live:0},{count:6,live:2},{count:0,live:0}]});
    if(address.endsWith('index.json'))return Response.json({pairings:Array.from({length:6},(_,i)=>({white:'White '+(i+1),black:'Black '+(i+1),result:address.includes('round-1')?'1-0':'*'}))});
    if(address.includes('/game-'))return Response.json({moves:['e4 90','e5 89'],result:address.includes('round-1')?'WHITEWIN':null});
    throw Error('Unexpected '+address);
  }};
  async function call(path,token='Andili'){const u=new URL('https://local/api/live-board/'+path);return handleLiveBoardApi(new Request(u,{headers:{authorization:token}}),env,u,helpers,deps);}
  for(const [token,status] of [['',401],['other',403]])assert.equal((await call('events',token)).status,status);
  assert.equal(calls.length,0);
  const catalog=await(await call('events')).json();assert.equal(catalog.events.length,2);assert.equal(catalog.publisherUnavailable,false);
  await call('events?category=club');assert.equal(calls.filter(u=>u===seed.url).length,1);
  const e=catalog.events.find(e=>e.sourceType==='dgt');assert.equal(e.source,undefined);
  const boards=await(await call('events/'+e.id+'/boards')).json();
  assert.equal(boards.games.length,4);assert.equal(boards.event.round,'2');assert.equal(boards.event.rounds.length,3);assert.equal(boards.pollAfterMs,30000);
  assert.equal(calls.filter(u=>u.includes('/game-')).length,4);
  const single=await(await call('events/'+boards.event.id+'/boards?board=1')).json();assert.equal(single.games.length,1);assert.equal(calls.filter(u=>u.includes('/game-')).length,4);
  const search=await(await call('events/'+boards.event.id+'/boards?q=White%206')).json();assert.equal(search.games[0].board,6);assert.equal(calls.filter(u=>u.includes('/game-')).length,5);
  const finished=await(await call('events/'+boards.event.rounds[0].id+'/boards')).json();assert.equal(finished.pollAfterMs,0);
  assert.equal(calls.filter(u=>u===seed.url).length,1,'board requests use cached discovery');
  assert.equal((await call('events/'+e.id.replace(/-0$/,'-4')+'/boards')).status,503);
});

test('finished pairing with failed game data retries instead of stopping permanently',async()=>{
  const id='33333333-3333-3333-3333-333333333333';
  const env={LIVE_BOARD_DISCOVERY:'0',LIVE_BOARD_EVENTS:JSON.stringify([{id:'ended',title:'Ended',category:'tournament',finished:true,source:{type:'dgt',tournamentId:id,round:1}}])};
  const u=new URL('https://test/api/live-board/events/ended/boards');
  const r=await handleLiveBoardApi(new Request(u),env,u,{json:(d,i)=>Response.json(d,i),bearerTokenFromRequest:()=>null,lookupAuthSession:async()=>({user:{username:'Andili'}})},{cache:null,fetcher:async url=>{
    if(url.includes('/meta/'))return Response.json({host:'1.pool.livechesscloud.com'});
    if(url.endsWith('index.json'))return Response.json({pairings:[{white:'A',black:'B',result:'1-0'}]});
    throw Error('Game temporarily unavailable');
  }});
  const data=await r.json();assert.equal(data.stale,true);assert.equal(data.pollAfterMs,60000);
});

// Optional integration test using the actual workerd fetch implementation.
// Requires Miniflare; default uses controlled upstream responses, no network.
// Set LIVE_BOARD_NETWORK_TEST=1 to test the public Lichess catalog and four boards.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const runtime=await import(process.env.MINIFLARE_MODULE||'miniflare');
const root=fileURLToPath(new URL('../src/',import.meta.url));
const network=process.env.LIVE_BOARD_NETWORK_TEST==='1';
const seen=[];
const uuid='12345678-1234-1234-1234-abcdefabcdef';
const publisher={id:'runtime',url:'https://publisher.example/',name:'Hamm',category:'mixed',clubScope:'hamm'};
const fixture=async request=>{
  seen.push(request.url);
  if(request.url===publisher.url)return new Response('<a href="https://view.livechesscloud.com/#'+uuid+'">Hamm Mannschaftskampf</a>');
  if(request.url==='https://lookup.livechesscloud.com/meta/'+uuid)return Response.json({host:'1.pool.livechesscloud.com'});
  if(request.url.endsWith('/'+uuid+'/tournament.json'))return Response.json({rounds:[{count:4,live:4}]});
  if(request.url.endsWith('/'+uuid+'/round-1/index.json'))return Response.json({pairings:Array.from({length:4},(_,i)=>({white:'White '+i,black:'Black '+i}))});
  if(request.url.includes('/'+uuid+'/round-1/game-'))return Response.json({moves:['e4 60','e5 60']});
  if(request.url==='https://source.example/redirect')return new Response('',{status:302,headers:{location:'https://destination.example/blocked'}});
  if(request.url.endsWith('/api/broadcast/top'))return Response.json({active:[{tour:{id:'Tour0001',name:'Runtime test'},round:{id:'Round001',name:'Round 1',ongoing:true}}],upcoming:[],past:{currentPageResults:[]}});
  if(request.url.endsWith('/api/broadcast/Tour0001'))return Response.json({tour:{id:'Tour0001',name:'Runtime test'},rounds:[{id:'Round001',name:'Round 1',ongoing:true}]});
  if(request.url.endsWith('/api/broadcast/round/Round001.pgn'))return new Response(Array.from({length:5},(_,i)=>`[White "White ${i}"]\n[Black "Black ${i}"]\n1. e4 e5 *\n`).join('\n'));
  assert.fail('Unexpected outgoing fetch: '+request.url);
};
const worker={name:'live-board-runtime-test',compatibilityDate:'2026-06-26',bindings:{LIVE_BOARD_PAGE_DISCOVERY:network?'0':'1',LIVE_BOARD_DISCOVERY_PAGES:JSON.stringify([publisher])},d1Databases:['DB'],modules:[{
  type:'ESModule',path:root+'__runtime_test.js',contents:`
    import {handleLiveBoardApi,fetchSource} from './live-board.js';
    export default {async fetch(request,env){
      if(new URL(request.url).pathname==='/redirect-test'){
        try{await fetchSource('https://source.example/redirect');return new Response('Unexpected success');}
        catch(error){return Response.json({message:error.message},{status:502});}
      }
      return handleLiveBoardApi(request,env,new URL(request.url),{
        json:(data,init)=>Response.json(data,init),
        bearerTokenFromRequest:r=>r.headers.get('authorization'),
        lookupAuthSession:async(e,token)=>token==='Bearer test'?{user:{username:'Andili'}}:null
      });
    }};`
},...['live-board.js','live-board-catalog.js','live-board-sources.js','live-board-classification.js','live-board-discovery-pages.js'].map(name=>({type:'ESModule',path:root+name,contents:fs.readFileSync(root+name,'utf8')}))]};
if(!network)worker.outboundService=fixture;
const options={workers:[worker]};
const mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(options):options);
try{
  const call=async path=>{const response=await mf.dispatchFetch('http://localhost/api/live-board/'+path,{headers:{authorization:'Bearer test'}});assert.equal(response.status,200);return response.json();};
  const denied=await mf.dispatchFetch('http://localhost/api/live-board/events');assert.equal(denied.status,401);assert.equal(seen.length,0);
  const catalog=await call('events?category=tournament');assert.equal(catalog.discoveryUnavailable,false);assert.ok(catalog.events.length);
  const event=catalog.events.find(e=>e.ongoing)||catalog.events[0];
  const boards=await call('events/'+event.id+'/boards');assert.equal(boards.games.length,4);assert.ok(boards.games.every(g=>Array.isArray(g.moves)));
  await call('events/'+event.id+'/boards?board='+boards.games[0].id);
  if(!network){
    const club=await call('events?category=club');assert.equal(club.events.length,1);
    const dgt=await call('events/'+club.events[0].id+'/boards');assert.equal(dgt.games.length,4);assert.ok(dgt.games.every(g=>Array.isArray(g.moves)));
    await call('events/'+dgt.event.id+'/boards?board=1');
    assert.equal(seen.filter(url=>url===publisher.url).length,1,'publisher cache reused by workerd');
    assert.equal(seen.filter(url=>url.includes('/game-')).length,4,'only visible DGT games fetched once');
    assert.equal(seen.filter(url=>url.endsWith('.pgn')).length,1,'real Cache API shares the round');
    const redirect=await mf.dispatchFetch('http://localhost/redirect-test');assert.equal(redirect.status,502);assert.match((await redirect.json()).message,/Weiterleitungen/);
    assert.equal(seen.filter(url=>url.includes('destination.example')).length,0,'redirect destination was never requested');
  }
  console.log(JSON.stringify({runtime:'workerd',network,event:event.title,events:catalog.events.length,boards:boards.games.length,total:boards.total,redirects:network?'covered by offline run':'rejected without following'},null,2));
}finally{await mf.dispose();}

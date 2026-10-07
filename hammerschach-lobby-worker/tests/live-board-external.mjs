// Explicit live integration test; no production Gamer API or member credentials.
// LIVE_BOARD_RECORD=/tmp/live-board-record.json node tests/live-board-external.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {handleLiveBoardApi} from '../src/live-board.js';
import {parseLivePgn} from '../src/live-board-sources.js';
const records={},requests=[];
const deps={cache:null,fetcher:async(url,options)=>{
  requests.push(url);const response=await fetch(url,options);
  const body=await response.text();records[url]={status:response.status,body};
  return new Response(body,{status:response.status,headers:response.headers});
}};
const helpers={json:(data,init)=>new Response(JSON.stringify(data),init),lookupAuthSession:async()=>({user:{username:'Andili'}}),bearerTokenFromRequest:()=>null};
async function call(path){const url=new URL('https://local.test/api/live-board/'+path);const response=await handleLiveBoardApi(new Request(url),{LIVE_BOARD_PAGE_DISCOVERY:'0'},url,helpers,deps);assert.equal(response.status,200);return response.json();}
const catalog=await call('events?category=tournament');assert.equal(catalog.discoveryUnavailable,false);assert.ok(catalog.events.length);
const requestedTour=process.env.LIVE_BOARD_TOUR;
const selected=(requestedTour?catalog.events.find(e=>e.id.includes('-'+requestedTour+'-')):catalog.events.find(e=>e.ongoing))||catalog.events.find(e=>e.finished)||catalog.events[0];assert.ok(selected);
const first=await call('events/'+selected.id+'/boards');assert.ok(first.games.length);
if(first.pages>1){const page=await call('events/'+selected.id+'/boards?page=2');assert.notEqual(page.games[0].id,first.games[0].id);}
const single=await call('events/'+selected.id+'/boards?board='+first.games[0].id);assert.equal(single.games.length,1);
const search=await call('events/'+selected.id+'/boards?q='+encodeURIComponent(first.games[0].white));assert.ok(search.games.some(g=>g.white===first.games[0].white));
assert.equal(requests.filter(u=>u.endsWith('.pgn')).length,1,'pages and viewers share one upstream PGN');
const pgnUrl=requests.find(u=>u.endsWith('.pgn'));
const games=parseLivePgn(records[pgnUrl].body);
const ctx=vm.createContext({console,localStorage:{getItem:()=>null}});
for(const file of ['chess-utils.js','chess960-core.js','game-setup.js','board-setup-utils.js','chess-engine.js','live-board-position.js'])vm.runInContext(fs.readFileSync(new URL('../../Gamer/js/'+file,import.meta.url),'utf8'),ctx);
for(const game of games){ctx.input=game;vm.runInContext('LiveBoardPosition.replay(input)',ctx);}
const past=first.event.rounds.find(r=>r.finished&&r.id!==selected.id);
if(past){const result=await call('events/'+past.id+'/boards');assert.equal(result.pollAfterMs,0);}
const report={testedAt:new Date().toISOString(),event:first.event,total:games.length,replayed:games.length,finished:games.filter(g=>g.finished).length,requests,firstMoves:games[0].moves,previousRound:past||null};
if(process.env.LIVE_BOARD_RECORD)fs.writeFileSync(process.env.LIVE_BOARD_RECORD,JSON.stringify({report,records}));
console.log(JSON.stringify(report,null,2));

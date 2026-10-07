// Explicit public-source check. Uses a real publisher solely as a test source;
// the foreign club is not added to the Gamer's regional production discovery.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {handleLiveBoardApi} from '../src/live-board.js';
const publisher=process.env.LIVE_BOARD_DGT_PUBLISHER?JSON.parse(process.env.LIVE_BOARD_DGT_PUBLISHER):{id:'realtest',name:'Chess Castle',url:'https://www.chesscastle.com/games_public',category:'tournament'};
const env={LIVE_BOARD_DISCOVERY_PAGES:JSON.stringify([publisher])};
const calls=[],records={};
const deps={cache:null,fetcher:async(url,options)=>{calls.push(url);const r=await fetch(url,options);const body=await r.text();records[url]={status:r.status,body};return new Response(body,{status:r.status,headers:r.headers});}};
const helpers={json:(d,i)=>Response.json(d,i),bearerTokenFromRequest:()=>null,lookupAuthSession:async()=>({user:{username:'Andili'}})};
const call=async path=>{const u=new URL('https://test/api/live-board/'+path);const r=await handleLiveBoardApi(new Request(u),env,u,helpers,deps);assert.equal(r.status,200);return r.json();};
const catalog=await call('events');assert.equal(catalog.publisherUnavailable,false);assert.equal(catalog.discoveryUnavailable,false);
const event=catalog.events.find(e=>e.sourceType==='dgt');assert.ok(event);
const boards=await call('events/'+event.id+'/boards');assert.equal(boards.games.length,4);assert.ok(boards.event.rounds.length);
const ctx=vm.createContext({console,localStorage:{getItem:()=>null}});
for(const file of ['chess-utils.js','chess960-core.js','game-setup.js','board-setup-utils.js','chess-engine.js','live-board-position.js'])vm.runInContext(fs.readFileSync(new URL('../../Gamer/js/'+file,import.meta.url),'utf8'),ctx);
for(const g of boards.games){assert.equal(g.error,undefined);ctx.input=g;vm.runInContext('LiveBoardPosition.replay(input)',ctx);}
const single=await call('events/'+boards.event.id+'/boards?board=1');assert.equal(single.games.length,1);
assert.equal(calls.filter(u=>u===publisher.url).length,1);
assert.equal(calls.filter(u=>u.includes('/game-')).length,4);
const report={testedAt:new Date().toISOString(),publisher:publisher.url,event:boards.event,boards:boards.games.length,total:boards.total,replayed:boards.games.length,pollAfterMs:boards.pollAfterMs,requests:calls};
if(process.env.LIVE_BOARD_DGT_RECORD)fs.writeFileSync(process.env.LIVE_BOARD_DGT_RECORD,JSON.stringify({report,records}));
console.log(JSON.stringify(report,null,2));

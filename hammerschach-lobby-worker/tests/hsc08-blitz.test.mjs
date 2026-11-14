import test from 'node:test';import assert from 'node:assert/strict';
import {blitzTransition as move,seasonRanking,eveningRanking,blitzView,defaultScale} from '../src/hsc08-blitz.js';
const act=(s,b)=>move(s,b,'Andili');
function setup(drops=0){let s=act(null,{action:'config',title:'Blitzsaison',scale:defaultScale,drops,dates:Array.from({length:10},(_,i)=>i<9?'2026-11-'+String(i+1).padStart(2,'0'):'')});for(const name of ['A','B','C'])s=act(s,{action:'player',name});return s;}
function start(s,i=0,cycles=1){return act(s,{action:'start',eveningId:s.evenings[i].id,ids:s.players.map(p=>p.id),cycles,timeControl:'3+2'});}
function finish(s,i=0){const e=s.evenings[i];for(const g of e.tournament.schedule.flatMap(r=>r.games).filter(g=>!(e.tournament.withdrawn||[]).some(id=>id===g.white||id===g.black)))s=act(s,{action:'result',eveningId:e.id,gameId:g.id,result:'1/2-1/2'});return act(s,{action:'complete',eveningId:e.id});}
test('Blitz seven of nine evenings, shared awards, per-game drops and season reopen',()=>{let s=setup(3);for(let i=0;i<7;i++)s=finish(start(s,i),i);const rank=seasonRanking(s);assert.equal(rank[0].values.length,7);assert.equal(rank[0].values.filter(v=>v.dropped).length,0);assert.ok(Math.abs(rank[0].counted-7*(58/3))<1e-9);assert.equal(rank[2].rank,1);s=act(s,{action:'complete-season'});assert.equal(s.evenings.filter(e=>e.cancelled).length,3);assert.throws(()=>act(s,{action:'player',name:'D'}));s=act(s,{action:'reopen-season'});s=act(s,{action:'reopen',eveningId:'abend-1'});assert.equal(seasonRanking(s)[0].values.length,6);assert.throws(()=>act(s,{action:'complete-season'}));});
test('Blitz preserves names and results, guards rules, handles absence and withdrawal',()=>{let s=start(setup());const first=s.players[0].id;s=act(s,{action:'withdraw',eveningId:'abend-1',participantId:first,reason:'Krank'});s=finish(s);assert.equal(seasonRanking(s).find(p=>p.id===first).counted,0);s=act(s,{action:'player',id:first,name:'A korrigiert'});assert.equal(s.evenings[0].tournament.participants[0].name,'A korrigiert');assert.throws(()=>act(s,{action:'config',title:s.title,drops:1,scale:s.scale,dates:s.evenings.map(e=>e.date)}));assert.throws(()=>start(s));s=act(s,{action:'player',name:'Spontan'});assert.equal(seasonRanking(s).find(p=>p.name==='Spontan').counted,0);assert.equal(blitzView(s,false).audit,undefined);assert.equal(blitzView(s,false).evenings[0].tournament.audit,undefined);});
test('Blitz double rounds and direct comparison before SB',()=>{let s=start(setup(),0,2);let t=s.evenings[0].tournament;assert.equal(t.schedule.flatMap(r=>r.games).length,6);s=finish(s);assert.ok(eveningRanking(s.evenings[0].tournament).every(r=>r.rank===1));});
test('Two joint winners split 25 and 18; season points are never dropped',()=>{
 let s=setup(1);s=act(s,{action:'start',eveningId:'abend-1',ids:s.players.slice(0,2).map(p=>p.id),cycles:1,timeControl:'3+2'});s=finish(s);assert.equal(seasonRanking(s)[0].total,21.5);assert.equal(seasonRanking(s)[0].counted,21.5);
 s=start(s,1);s=finish(s,1);const third=seasonRanking(s).find(r=>r.id===s.players[2].id);assert.equal(third.values[0].dropped,false);assert.equal(third.values[1].dropped,false);
});
test('Direct comparison precedes SB in a three-player tied group',async()=>{
 const {pairRoundRobin}=await import('../src/hsc08-round-robin.js');const ids=['a','b','c','d','e'];const t={participants:ids.map(id=>({id,name:id})),scoring:'classic',cycles:1,schedule:pairRoundRobin(ids)};
 t.schedule.flatMap(r=>r.games).forEach((g,i)=>g.result=i===1?'1-0':'0-1');
 const rows=eveningRanking(t);assert.deepEqual(rows.map(r=>r.id),['c','b','a','e','d']);assert.equal(rows[2].points,rows[3].points);assert.ok(rows[2].sb<rows[3].sb);assert.ok(rows[2].dv>rows[3].dv);
});
test('Per-player game drops preserve original results, opponents and complete SB',()=>{
 let s=finish(start(setup(1),0,2));const t=s.evenings[0].tournament,original=structuredClone(t.schedule),full=eveningRanking(t),reduced=eveningRanking(t,1);
 for(const r of reduced){const before=full.find(x=>x.id===r.id);assert.equal(r.rawPoints,2);assert.equal(r.points,1.5);assert.equal(r.deducted,.5);assert.equal(r.droppedGames.length,1);assert.equal(r.sb,before.sb);assert.equal(r.dv,before.dv);}
 assert.deepEqual(t.schedule,original);assert.ok(Math.abs(seasonRanking(s)[0].counted-58/3)<1e-9);
 const reader=blitzView(s,false);assert.equal(reader.evenings[0].tournament.ranking[0].points,1.5);assert.equal(reader.ranking[0].values[0].dropped,false);
});
test('Losses are removed first, open games never count, corrections recompute drops',()=>{
 let s=start(setup(1),0,2),e=s.evenings[0],id=s.players[0].id,games=e.tournament.schedule.flatMap(r=>r.games).filter(g=>g.white===id||g.black===id);
 const play=(g,points,reason='')=>{s=act(s,{action:'result',eveningId:e.id,gameId:g.id,result:points===.5?'1/2-1/2':(g.white===id)===(points===1)?'1-0':'0-1',reason});};
 play(games[0],1);play(games[1],0);play(games[2],.5);
 let r=eveningRanking(s.evenings[0].tournament,1).find(r=>r.id===id);assert.equal(r.points,1.5);assert.equal(r.droppedGames[0].id,games[1].id);assert.equal(r.deducted,0);
 play(games[1],1,'Ergebnis berichtigt');r=eveningRanking(s.evenings[0].tournament,1).find(r=>r.id===id);assert.equal(r.rawPoints,2.5);assert.equal(r.points,2);assert.equal(r.droppedGames[0].id,games[2].id);
 assert.equal(eveningRanking(s.evenings[0].tournament,9).find(r=>r.id===id).droppedGames.length,3);
});

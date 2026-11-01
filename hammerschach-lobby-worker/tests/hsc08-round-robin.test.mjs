import test from 'node:test';import assert from 'node:assert/strict';import {pairRoundRobin,standings,transition} from '../src/hsc08-round-robin.js';
test('complete pair coverage, no duplicate per round, balanced colors, reverse return games',()=>{
 for(let n=2;n<=32;n++)for(const cycles of [1,2]){
 const ids=Array.from({length:n},(_,i)=>'player-'+i);const rounds=pairRoundRobin(ids,cycles);const pairs=new Map(),colors=new Map(ids.map(id=>[id,0]));
 assert.equal(rounds.length,(n%2?n:n-1)*cycles);
 for(const r of rounds){const seen=new Set();for(const g of r.games){assert.notEqual(g.white,g.black);for(const id of [g.white,g.black]){assert.ok(!seen.has(id));seen.add(id);}colors.set(g.white,colors.get(g.white)+1);colors.set(g.black,colors.get(g.black)-1);const key=[g.white,g.black].sort().join(':');pairs.set(key,(pairs.get(key)||0)+1);}assert.equal(seen.size,n-n%2);if(r.bye)assert.ok(!seen.has(r.bye));}
 assert.equal(pairs.size,n*(n-1)/2);assert.ok([...pairs.values()].every(v=>v===cycles));assert.ok([...colors.values()].every(v=>Math.abs(v)<=(cycles===2?0:1)));
 }
});
const participants=['A','B','C'].map(id=>({id,name:id}));
test('known scores and SB use chosen point system; unplayed games excluded',()=>{
 const schedule=[{games:[{white:'A',black:'B',result:'1-0'},{white:'A',black:'C',result:'1/2-1/2'},{white:'B',black:'C',result:'0-1'}]}];
 for(const scoring of ['classic','three-point']){const r=standings({participants,schedule,scoring});assert.equal(r[0].rank,1);assert.equal(r[1].rank,1);assert.equal(r[2].points,0);assert.equal(r[0].points,scoring==='classic'?1.5:4);assert.equal(r[0].sb,scoring==='classic'?.75:4);assert.equal(r[0].played,2);}
});
test('all equal results share rank and forfeit is not counted as played',()=>{
 let t={participants,scoring:'classic',schedule:[{games:[{white:'A',black:'B',result:'1/2-1/2'},{white:'A',black:'C',result:'1/2-1/2'},{white:'B',black:'C',result:'1/2-1/2'}]}]};assert.deepEqual(standings(t).map(r=>r.rank),[1,1,1]);t.schedule[0].games[0].result='+/-';assert.equal(standings(t).find(r=>r.id==='A').played,1);
});
test('lifecycle requires review, corrections reason, all games for completion and reopen',()=>{
 let t={participants,mode:'round-robin',cycles:1,scoring:'classic',title:'Test',startsOn:'2026-11-01',endsOn:'2027-05-31',timeControl:'90 min',phase:'draft'};
 assert.throws(()=>transition(t,{action:'release'},'Andili'));t=transition(t,{action:'prepare'},'Andili');assert.throws(()=>transition(t,{action:'result'},'Andili'));t=transition(t,{action:'release'},'Andili');assert.throws(()=>transition(t,{action:'complete'},'Andili'));
 for(const g of t.schedule.flatMap(r=>r.games))t=transition(t,{action:'result',gameId:g.id,result:'1-0'},'Andili');
 assert.ok(t.hasEverResults);t=transition(t,{action:'complete'},'Andili');assert.throws(()=>transition(t,{action:'result'},'Andili'));t=transition(t,{action:'reopen'},'Andili');const g=t.schedule[0].games[0];assert.throws(()=>transition(t,{action:'result',gameId:g.id,result:null},'Andili'));t=transition(t,{action:'result',gameId:g.id,result:null,reason:'Fehleintrag'},'Andili');assert.ok(t.hasEverResults);assert.equal(t.audit.at(-1).old,'1-0');
});

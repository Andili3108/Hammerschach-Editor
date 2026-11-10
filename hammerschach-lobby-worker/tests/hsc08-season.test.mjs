import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHsc08Draft} from '../src/hsc08.js';
import {swissTransition} from '../src/hsc08-swiss.js';
import {transition,effectiveRoundRobinGames,roundRobinWithdrawals} from '../src/hsc08-round-robin.js';
import {makeBackup,restoreBackup,exportHtml} from '../src/hsc08-backup.js';
import {readerTournament} from '../src/hsc08-reader.js';
const base=(mode='swiss',n=5,cycles=1,scoring='classic')=>validateHsc08Draft({title:'Saison',mode,cycles,scoring,rounds:3,startsOn:'2026-11-01',endsOn:'2027-05-31',timeControl:'90+30',participants:Array.from({length:n},(_,i)=>({id:'player-'+i,name:'Spieler '+i,dwz:2000-i*100}))});
const act=(t,body)=>(t.mode==='swiss'?swissTransition:transition)(t,body,'Andili');
function start(t){t=act(t,{action:'prepare',start:'2026-11-01',end:'2026-11-30',seeds:t.participants.map(p=>p.id)});return act(t,{action:'release'});}
const restore=t=>restoreBackup(makeBackup({revision:3,tournament:t,publishedTournament:t}),validateHsc08Draft).draft;
test('Round dates: validation, audit, results unchanged and backup',()=>{
 let t=start(base()),games=structuredClone(t.schedule[0].games);
 const action={action:'round-dates',roundNumber:1,start:'2026-11-02',end:'2026-12-05',reason:'Vereinsabend ausgefallen'};
 assert.throws(()=>act(t,{...action,reason:''}));assert.throws(()=>act(t,{...action,end:'2027-06-01'}));assert.throws(()=>act(t,{...action,start:'2026-02-30'}));
 t=act(t,action);assert.deepEqual(t.schedule[0].games,games);assert.equal(t.audit.at(-1).action,'round-dates');assert.deepEqual(restore(t).schedule,t.schedule);
 for(const g of games)t=act(t,{action:'result',gameId:g.id,result:'1-0'});
 t=act(t,{action:'prepare',start:'2026-12-06',end:'2026-12-31'});
 assert.throws(()=>act(t,{...action,end:'2026-12-06'}),/Überschneidung/);
 assert.throws(()=>act({...t,phase:'completed'},action));
});
test('Swiss return is future-only, audited, guarded and survives backup',()=>{
 let t=start(base());t=act(t,{action:'withdraw',participantId:'player-0'});
 for(const g of t.schedule[0].games)t=act(t,{action:'result',gameId:g.id,result:'1-0'});
 t=act(t,{action:'prepare',start:'2026-12-01',end:'2026-12-31'});
 const rejoin={action:'rejoin',participantId:'player-0',reason:'Rückkehr nach Krankheit'};
 assert.throws(()=>act(t,rejoin),/Paarungsentwurf/);t=act(t,{action:'release'});
 const schedule=structuredClone(t.schedule);assert.throws(()=>act(t,{...rejoin,reason:''}));t=act(t,rejoin);
 assert.deepEqual(t.schedule,schedule);assert.ok(t.schedule[1].absent.includes('player-0'));assert.deepEqual(t.withdrawn,[]);assert.deepEqual(restore(t).schedule,t.schedule);
 for(const g of t.schedule[1].games)t=act(t,{action:'result',gameId:g.id,result:'1-0'});
 t=act(t,{action:'prepare',start:'2027-01-01',end:'2027-01-31'});assert.ok(!t.schedule[2].absent.includes('player-0'));
});
for(const scoring of ['classic','three-point'])for(const cycles of [1,2])test('RR withdrawal threshold and saved history '+scoring+' cycles '+cycles,()=>{
 let t=start(base('round-robin',cycles===1?5:3,cycles,scoring));const games=t.schedule.flatMap(r=>r.games).filter(g=>g.white==='player-0'||g.black==='player-0');
 t=act(t,{action:'result',gameId:games[0].id,result:'1-0'});
 let below=act(t,{action:'withdraw',participantId:'player-0',reason:'Krankheit'});assert.ok(roundRobinWithdrawals(below).get('player-0').excluded);assert.equal(below.ranking.find(r=>r.id==='player-0').rank,null);
 assert.equal(below.schedule.flatMap(r=>r.games).find(g=>g.id===games[0].id).result,'1-0');assert.match(exportHtml(below),/ohne Wertung/);assert.deepEqual(restore(below).ranking,below.ranking);
 t=act(t,{action:'result',gameId:games[1].id,result:'1/2-1/2'});t=act(t,{action:'withdraw',participantId:'player-0',reason:'Krankheit'});
 assert.equal(roundRobinWithdrawals(t).get('player-0').excluded,false);assert.equal(effectiveRoundRobinGames(t).filter(g=>g.withdrawalResult).length,2);
 assert.equal(readerTournament(t).withdrawn[0],'player-0');assert.deepEqual(restore(t).ranking,t.ranking);
 assert.throws(()=>act(t,{action:'result',gameId:games[2].id,result:'1-0'}));assert.throws(()=>act(t,{action:'recall-pairings',reason:'Versuch'}));
 // A correction from a played to a forfeit result recalculates the threshold.
 t=act(t,{action:'result',gameId:games[1].id,result:'+/-',reason:'War kampflos'});assert.ok(roundRobinWithdrawals(t).get('player-0').excluded);
});
test('RR multiple withdrawals are independent of order; both-open is zero; completion restores',()=>{
 const original=start(base('round-robin',3));let a=original,b=original;
 for(const id of ['player-0','player-1'])a=act(a,{action:'withdraw',participantId:id,reason:'Rückzug'});
 for(const id of ['player-1','player-0'])b=act(b,{action:'withdraw',participantId:id,reason:'Rückzug'});
 assert.deepEqual(effectiveRoundRobinGames(a),effectiveRoundRobinGames(b));assert.deepEqual(a.ranking,b.ranking);
 const mutual=effectiveRoundRobinGames(a).find(g=>[g.white,g.black].every(id=>id==='player-0'||id==='player-1'));assert.equal(mutual.result,'-/-');
 a=act(a,{action:'complete'});assert.equal(restore(a).phase,'completed');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {transition} from '../src/hsc08-round-robin.js';
import {swissTransition,validateManualColours} from '../src/hsc08-swiss.js';
import {validateHsc08Draft} from '../src/hsc08.js';
import {restoreBackup,makeBackup,exportHtml} from '../src/hsc08-backup.js';
import {readerTournament} from '../src/hsc08-reader.js';
const reason='Korrektur vor der Freigabe';
const draft=(mode='round-robin',cycles=1,n=6)=>validateHsc08Draft({title:'Paarungstest',mode,cycles,rounds:3,scoring:'classic',startsOn:'2026-11-01',endsOn:'2027-05-31',timeControl:'90+30',participants:Array.from({length:n},(_,i)=>({id:'spieler-'+i,name:'Spieler '+i,dwz:2000-i*50}))});
const restore=t=>restoreBackup(makeBackup({revision:2,tournament:t,publishedTournament:t}),validateHsc08Draft).draft;
const rr=(t,b)=>transition(t,b,'Andili'),sw=(t,b)=>swissTransition(t,b,'Andili');
function preparedSwiss(n=6){let t=draft('swiss',1,n);return sw(t,{action:'prepare',seeds:t.participants.map(p=>p.id),start:'2026-11-01',end:'2026-11-30'});}
test('RR complete-plan edits are atomic, require reason and survive backup',()=>{
 let t=rr(draft(),{action:'prepare'}),before=structuredClone(t);
 const rounds=structuredClone(t.schedule),a=t.participants[0].id,b=t.participants[1].id,swap=id=>id===a?b:id===b?a:id;
 for(const r of rounds){r.bye=swap(r.bye);for(const g of r.games){g.white=swap(g.white);g.black=swap(g.black);g.result='1-0';}}
 assert.throws(()=>rr(t,{action:'pairings',rounds}),/begründen/);
 const original=t;t=rr(t,{action:'pairings',rounds,reason});assert.deepEqual(original,before);
 assert.ok(t.audit.some(e=>e.action==='pairings'&&e.reason===reason));assert.ok(t.schedule.every(r=>r.games.every(g=>g.result===null)));
 assert.deepEqual(restore(t).schedule,t.schedule);
 const invalid=structuredClone(t.schedule);invalid[0].games[0].white=invalid[0].games[0].black;
 const copy=structuredClone(t);assert.throws(()=>rr(t,{action:'pairings',rounds:invalid,reason}));assert.deepEqual(t,copy);
});
test('RR duplicate meetings and inconsistent return colours are rejected',()=>{
 let t=rr(draft('round-robin',2),{action:'prepare'}),rounds=structuredClone(t.schedule);
 const g=rounds[0].games[0];[g.white,g.black]=[g.black,g.white];assert.throws(()=>rr(t,{action:'pairings',rounds,reason}),/Rückspiel/);
 const back=rounds.flatMap(r=>r.games).find(x=>x.id!==g.id&&new Set([x.white,x.black,g.white,g.black]).size===2);[back.white,back.black]=[back.black,back.white];
 t=rr(t,{action:'pairings',rounds,reason});assert.deepEqual(restore(t).schedule,t.schedule);
 const bad=structuredClone(t.schedule);bad[1].games=bad[0].games.map((x,i)=>({...x,id:bad[1].games[i].id}));
 assert.throws(()=>rr(t,{action:'pairings',rounds:bad,reason}),/doppelt/);
});
for(const mode of ['round-robin','swiss'])test(mode+': recall hides pairings, requires re-release, and a cleared result cannot unlock',()=>{
 const act=mode==='swiss'?sw:rr;
 let t=mode==='swiss'?preparedSwiss(7):rr(draft(mode,1,7),{action:'prepare'});
 t=act(t,{action:'release'});assert.ok(readerTournament(t).schedule.length);
 assert.throws(()=>act(t,{action:'recall-pairings'}),/begründen/);
 t=act(t,{action:'recall-pairings',reason});assert.equal(readerTournament(t).schedule,undefined);
 assert.throws(()=>act(t,{action:'discard-plan'}));assert.deepEqual(restore(t).schedule,t.schedule);
 t=act(t,{action:'release'});const id=t.schedule[0].games[0].id;
 t=act(t,{action:'result',gameId:id,result:'1-0'});t=act(t,{action:'result',gameId:id,result:null,reason});
 assert.throws(()=>act(t,{action:'recall-pairings',reason}));assert.throws(()=>act(restore(t),{action:'recall-pairings',reason}));
});
test('Swiss deviations need explicit Andili approval; board order alone needs no override',()=>{
 let t=preparedSwiss(),round=structuredClone(t.schedule[0]);
 [round.games[0].white,round.games[0].black]=[round.games[0].black,round.games[0].white];
 assert.throws(()=>sw(t,{action:'pairings',rounds:[round],reason}),/Dutch/);
 round=structuredClone(t.schedule[0]);const a={...round.games[0]},b={...round.games[1]};
 Object.assign(round.games[0],{white:b.white,black:b.black});Object.assign(round.games[1],{white:a.white,black:a.black});
 t=sw(t,{action:'pairings',rounds:[round],reason});assert.deepEqual(restore(t).schedule,t.schedule);
 assert.equal(t.audit.filter(e=>e.action==='pairings').length,2);
});
test('Swiss only latest pending round editable; older rounds and absent players protected',()=>{
 let t=preparedSwiss();t=sw(t,{action:'release'});for(const g of t.schedule[0].games)t=sw(t,{action:'result',gameId:g.id,result:'1/2-1/2'});
 t=sw(t,{action:'prepare',start:'2026-12-01',end:'2026-12-31',absent:['spieler-5']});
 assert.throws(()=>sw(t,{action:'pairings',rounds:[t.schedule[0]],reason}));
 const round=structuredClone(t.schedule[1]);round.games[0].white='spieler-5';assert.throws(()=>sw(t,{action:'pairings',rounds:[round],reason}),/doppelt/);
 t=sw(t,{action:'release'});t=sw(t,{action:'recall-pairings',reason});assert.equal(readerTournament(t).schedule.length,1);
 assert.deepEqual(restore(t).schedule,t.schedule);
});

for(const scoring of ['classic','three-point'])test('Swiss manual changes, audit, reader and backup '+scoring,()=>{
 let t=preparedSwiss(7);t.scoring=scoring;
 const round=structuredClone(t.schedule[0]),g=round.games[0];[g.white,g.black]=[g.black,g.white];
 assert.throws(()=>swissTransition(t,{action:'pairings',rounds:[round],reason,acceptDeviation:true},'Spielleiter'),/Andili/);
 t=sw(t,{action:'pairings',rounds:[round],reason,acceptDeviation:true});assert.equal(t.schedule[0].manualPairings,true);
 assert.ok(t.audit.some(e=>e.action==='pairing-approval'&&e.value==='manual'&&e.actor==='Andili'));
 assert.equal(readerTournament(t).schedule,undefined);t=sw(t,{action:'release'});
 assert.equal(readerTournament(t).schedule[0].manualPairings,true);assert.match(exportHtml(t),/Manuell geändert/);assert.equal(readerTournament(t).audit,undefined);
 assert.deepEqual(restore(t).schedule,t.schedule);
 for(const g of t.schedule[0].games)t=sw(t,{action:'result',gameId:g.id,result:'1/2-1/2'});
 t=sw(t,{action:'prepare',start:'2026-12-01',end:'2026-12-31'});
 const played=new Set(t.schedule[0].games.map(g=>JSON.stringify([g.white,g.black].sort())));
 assert.ok(t.schedule[1].games.every(g=>!played.has(JSON.stringify([g.white,g.black].sort()))));
});
test('Manual colours ignore forfeits, but reject a third consecutive colour and excess colour difference',()=>{
 const t=draft('swiss'),round={number:3,games:[{white:'spieler-0',black:'spieler-1'}]};
 t.schedule=[{games:[{white:'spieler-0',black:'spieler-2',result:'1-0'}]},{games:[{white:'spieler-0',black:'spieler-3',result:'1/2-1/2'}]}];
 assert.throws(()=>validateManualColours(t,round),/Farbvergabe/);
 t.schedule[1].games[0].result='+/-';assert.doesNotThrow(()=>validateManualColours(t,round));
 t.schedule=[1,1,-1,1].map((colour,i)=>({games:[{white:colour===1?'spieler-0':'spieler-2',black:colour===1?'spieler-2':'spieler-0',result:'1-0'}]}));
 assert.throws(()=>validateManualColours(t,{...round,number:5}),/Farbdifferenz/);
});
test('Even approved Swiss changes cannot duplicate players or repeat a played encounter',()=>{
 let t=preparedSwiss();t=sw(t,{action:'release'});for(const g of t.schedule[0].games)t=sw(t,{action:'result',gameId:g.id,result:'1/2-1/2'});
 t=sw(t,{action:'prepare',start:'2026-12-01',end:'2026-12-31'});
 const round=structuredClone(t.schedule[1]);round.games=t.schedule[0].games.map((g,i)=>({...g,id:round.games[i].id,result:null}));
 assert.throws(()=>sw(t,{action:'pairings',rounds:[round],reason,acceptDeviation:true}),/Wiederholte/);
 round.games[0].white=round.games[0].black;assert.throws(()=>sw(t,{action:'pairings',rounds:[round],reason,acceptDeviation:true}));
});

test('Andili approval cannot assign a second bye or a bye after a forfeit win',()=>{
 let t=preparedSwiss(7);t=sw(t,{action:'release'});const oldBye=t.schedule[0].bye,forfeitWinner=t.schedule[0].games[0].white;
 for(const [i,g] of t.schedule[0].games.entries())t=sw(t,{action:'result',gameId:g.id,result:i===0?'+/-':'1/2-1/2'});
 t=sw(t,{action:'prepare',start:'2026-12-01',end:'2026-12-31'});
 for(const forbidden of [oldBye,forfeitWinner]){
   const r=structuredClone(t.schedule[1]),replacement=r.bye;r.bye=forbidden;
   for(const g of r.games)for(const side of ['white','black'])if(g[side]===forbidden)g[side]=replacement;
   assert.throws(()=>sw(t,{action:'pairings',rounds:[r],reason,acceptDeviation:true}),/Freilos/);
 }
});

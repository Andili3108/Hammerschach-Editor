import test from 'node:test';
import assert from 'node:assert/strict';
import {swissStandings} from '../src/hsc08-tiebreak.js';
import {swissTransition} from '../src/hsc08-swiss.js';
import {validateHsc08Draft} from '../src/hsc08.js';
import {makeBackup,restoreBackup,exportHtml} from '../src/hsc08-backup.js';
import {readerTournament} from '../src/hsc08-reader.js';
const participants='abcdef'.split('').map(id=>({id:'player-'+id,name:id}));
const game=(white,black,result)=>({white:'player-'+white,black:'player-'+black,result});
const fixture=scoring=>({participants,scoring,rounds:3,mode:'swiss',phase:'running',hasEverResults:true,schedule:[
 {number:1,bye:'player-e',absent:['player-f'],games:[game('a','b','1-0'),game('c','d','1/2-1/2')]},
 {number:2,bye:null,absent:[],games:[game('a','c','+/-'),game('b','d','-/-'),game('e','f','0-1')]},
 {number:3,bye:'player-f',absent:['player-e'],games:[game('a','d',null),game('b','c','0-1')]}
]});
for(const [scoring,expected] of [
 ['classic',{a:[2,1.5,1.5],b:[0,3.5,3.5],c:[1.5,2,.5],d:[.5,1.5,1.5],e:[1,4,3],f:[2,4.5,3]}],
 ['three-point',{a:[6,4,4],b:[0,10,10],c:[4,5,1],d:[1,4,4],e:[3,12,9],f:[6,10,7]}]
])test('FIDE 16: open games, dummy caps, trailing absence, VUR Cut 1 '+scoring,()=>{
 const t=fixture(scoring),rows=swissStandings(t);
 for(const r of rows)assert.deepEqual([r.points,r.bh,r.bhCut1],expected[r.name]);
 assert.equal(rows.find(r=>r.name==='a').contributions.at(-1).value,null);
 assert.equal(rows.find(r=>r.name==='c').contributions.find(c=>c.cut).kind,'forfeit-loss');
 const pending={...t.schedule[2],number:4,pending:true};
 assert.deepEqual(swissStandings({...t,schedule:[...t.schedule,pending]}),rows);
 assert.deepEqual(readerTournament(t).ranking,rows);
 assert.match(exportHtml(t),/Buchholz/);
});
test('withdrawal, temporary absence, backup, completion and reopening preserve Swiss state',()=>{
 let t=validateHsc08Draft({title:'Saison',mode:'swiss',participants,scoring:'classic',rounds:3,startsOn:'2026-11-01',endsOn:'2027-06-01',timeControl:'90+30'});
 const act=body=>{t=swissTransition(t,body,'Andili');};
 for(let n=1;n<=3;n++){
  act({action:'prepare',seeds:participants.map(p=>p.id),start:'2027-0'+n+'-01',end:'2027-0'+n+'-20',absent:n===2?['player-e']:[]});
  if(n===2)assert.deepEqual(new Set(t.schedule.at(-1).absent),new Set(['player-e','player-f']));
  act({action:'release'});
  for(const g of t.schedule.at(-1).games)act({action:'result',gameId:g.id,result:'1/2-1/2'});
  if(n===1)act({action:'withdraw',participantId:'player-f'});
  if(n<3)assert.throws(()=>act({action:'complete'}));
 }
 assert.ok(!t.schedule[2].absent.includes('player-e'));
 assert.ok(t.schedule[2].absent.includes('player-f'));
 act({action:'complete'});
 assert.throws(()=>act({action:'result',gameId:t.schedule[0].games[0].id,result:'1-0',reason:'Korrektur'}));
 const restored=restoreBackup(makeBackup({revision:1,tournament:t,publishedTournament:t}),validateHsc08Draft);
 assert.deepEqual(restored.draft.withdrawn,t.withdrawn);
 assert.deepEqual(restored.draft.ranking,t.ranking);
 const plan=JSON.stringify(t.schedule.map(r=>r.games.map(g=>[g.id,g.white,g.black])));
 act({action:'reopen'});act({action:'result',gameId:t.schedule[0].games[0].id,result:'1-0',reason:'Korrektur'});
 assert.equal(JSON.stringify(t.schedule.map(r=>r.games.map(g=>[g.id,g.white,g.black]))),plan);
 assert.equal(t.hasEverResults,true);
});

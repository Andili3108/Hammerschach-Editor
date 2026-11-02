import test from 'node:test';
import assert from 'node:assert/strict';
import {swissTransition} from '../src/hsc08-swiss.js';
import {validateHsc08Draft} from '../src/hsc08.js';
import {exportHtml,restoreBackup,makeBackup} from '../src/hsc08-backup.js';
import {readerTournament} from '../src/hsc08-reader.js';
for(const scoring of ['classic','three-point'])test('13 Spieler, sechs Schweizer Runden, '+scoring,()=>{
 const participants=Array.from({length:13},(_,i)=>({id:'spieler-'+i,name:'Spieler '+i,dwz:2200-i*25}));
 participants[6].dwz=participants[5].dwz;
 const seeds=participants.map(p=>p.id);
 [seeds[5],seeds[6]]=[seeds[6],seeds[5]];
 let t=validateHsc08Draft({title:'Test',mode:'swiss',participants,scoring,rounds:6,startsOn:'2026-11-01',endsOn:'2027-05-31',timeControl:'90+30'});
 const act=body=>{t=swissTransition(t,body,'Andili');};
 for(let n=1;n<=6;n++){
  const start='2027-0'+Math.ceil(n/2)+(n%2?'-01':'-15');
  act({action:'prepare',seeds,start,end:start});
  const r=t.schedule.at(-1);
  assert.equal(readerTournament(t).schedule?.length||0,n-1);
  if(n===1){assert.equal(r.bye,seeds[12]);for(const [i,g] of r.games.entries())assert.deepEqual(new Set([g.white,g.black]),new Set([seeds[i],seeds[i+6]]));}
  assert.equal(r.games.length,6);assert.ok(!exportHtml(t).includes(' · Entwurf'));
  act({action:'release'});
  assert.throws(()=>act({action:'prepare',start,end:start}));
  for(const [i,g] of r.games.entries())act({action:'result',gameId:g.id,result:['1-0','0-1','1/2-1/2'][i%3]});
  assert.equal(t.ranking.reduce((sum,row)=>sum+row.points,0),n*(scoring==='classic'?7:19));
  const restored=restoreBackup(makeBackup({revision:8,tournament:t,publishedTournament:t}),validateHsc08Draft);
  assert.deepEqual(restored.draft.schedule,t.schedule);assert.deepEqual(restored.draft.ranking,t.ranking);
 }
 assert.equal(new Set(t.schedule.map(r=>r.bye)).size,6);
});

// Published BBP Pairings 6.0.0 reference case dutch_2025_C9.
test('Dutch reference C9: prior absence, bye and colours',async()=>{
 const {t:pair}=await import('../src/vendor/hsc08-dutch/dutch-gyo2itP7.js');
 const players=['1','2','3','4','5'].map(id=>({id}));
 const previous=[{games:[{white:'1',black:'3',result:'white'},{white:'4',black:'2',result:'black'}],byes:[{player:'5',kind:'zero'}]}];
 const next=pair(players,previous,{expectedRounds:3});
 assert.deepEqual(next.games,[{white:'2',black:'1'},{white:'3',black:'5'}]);
 assert.deepEqual(next.byes,[{player:'4',kind:'pairing'}]);
});

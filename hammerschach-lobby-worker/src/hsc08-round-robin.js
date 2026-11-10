import {pairingReason,hasRecordedResults,replacePairings,pairingEvents,validateRoundRobinPlan} from './hsc08-pairings.js';
// Real club games only; no dependency on Gamer online-tournament tables.
export const RESULTS = {'1-0':[1,0],'0-1':[0,1],'1/2-1/2':[.5,.5],'+/-':[1,0],'-/+':[0,1],'-/-':[0,0]};
export function pairRoundRobin(ids, cycles=1) {
  if(ids.length<2 || ids.length>200 || new Set(ids).size!==ids.length || ![1,2].includes(cycles))throw Error('Ungültiges Teilnehmerfeld.');
  const ring=[...ids];if(ring.length%2)ring.push(null);
  const rounds=[];
  for(let r=0;r<ring.length-1;r++){
    const games=[];let bye=null;
    for(let i=0;i<ring.length/2;i++){
      let w=ring[i],b=ring[ring.length-1-i];
      if(!w||!b){bye=w||b;continue;}
      const wi=ids.indexOf(w),bi=ids.indexOf(b);
      if(ids.length%2){if((bi-wi+ids.length)%ids.length>(ids.length-1)/2)[w,b]=[b,w];}
      else if(wi===0 || bi===0){if((wi===0)!==(r%2===0))[w,b]=[b,w];}
      else if((bi-wi+ids.length-1)%(ids.length-1)>(ids.length-2)/2)[w,b]=[b,w];
      games.push({id:`r${r+1}g${i+1}`,white:w,black:b,result:null});
    }
    rounds.push({number:r+1,games,bye});ring.splice(1,0,ring.pop());
  }
  if(cycles===2){const n=rounds.length;rounds.push(...rounds.slice().map(r=>({number:r.number+n,bye:r.bye,games:r.games.map((g,i)=>({id:`r${r.number+n}g${i+1}`,white:g.black,black:g.white,result:null}))})));}
  return rounds;
}
export function score(result,scoring){const raw=RESULTS[result];if(!raw)return null;return raw.map(v=>scoring==='three-point'?(v===1?3:v===.5?1:0):v);}
export function roundRobinWithdrawals(t){
  const games=(t.schedule||[]).flatMap(r=>r.games),total=(t.participants.length-1)*t.cycles;
  return new Map((t.withdrawn||[]).map(id=>{const played=games.filter(g=>(g.white===id||g.black===id)&&['1-0','0-1','1/2-1/2'].includes(g.result)).length;return [id,{played,total,excluded:played*2<total}];}));
}
export function effectiveRoundRobinGames(t){
  const withdrawals=roundRobinWithdrawals(t);
  return (t.schedule||[]).flatMap(r=>r.games).map(g=>{
    const white=withdrawals.get(g.white),black=withdrawals.get(g.black);
    return {...g,excluded:!!(white?.excluded||black?.excluded),withdrawalResult:g.result===null&&!!(white||black),result:g.result??(white&&black?'-/-':white?'-/+':black?'+/-':null)};
  });
}
export function standings(t){
  const rows=t.participants.map(p=>({id:p.id,name:p.name,points:0,sb:0,played:0}));const byId=new Map(rows.map(r=>[r.id,r]));
  const withdrawals=roundRobinWithdrawals(t);
  const games=effectiveRoundRobinGames(t).filter(g=>!g.excluded);
  for(const g of games){const s=score(g.result,t.scoring);if(!s)continue;[g.white,g.black].forEach((id,i)=>{byId.get(id).points+=s[i];if(['1-0','0-1','1/2-1/2'].includes(g.result))byId.get(id).played++;});}
  for(const g of games){const s=score(g.result,t.scoring);if(s){byId.get(g.white).sb+=byId.get(g.black).points*s[0];byId.get(g.black).sb+=byId.get(g.white).points*s[1];}}
  function direct(group){
    if(group.length<2)return [group];const ids=new Set(group.map(p=>p.id)),meetings=games.filter(g=>ids.has(g.white)&&ids.has(g.black));
    // Provisional tables never use an incomplete direct encounter to split ties.
    if(meetings.some(g=>!g.result))return [group];
    const pts=new Map(group.map(p=>[p.id,0]));for(const g of meetings){const s=score(g.result,t.scoring);pts.set(g.white,pts.get(g.white)+s[0]);pts.set(g.black,pts.get(g.black)+s[1]);}
    const buckets=new Map();for(const p of group){const key=pts.get(p.id);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);}
    if(buckets.size===1)return [group];return [...buckets.keys()].sort((a,b)=>b-a).flatMap(k=>direct(buckets.get(k)));
  }
  const excluded=rows.filter(r=>withdrawals.get(r.id)?.excluded);
  for(const row of excluded)rows.splice(rows.indexOf(row),1);
  rows.sort((a,b)=>b.points-a.points||b.sb-a.sb);const groups=[];
  for(const row of rows){const last=groups.at(-1);if(last && last[0].points===row.points && last[0].sb===row.sb)last.push(row);else groups.push([row]);}
  let rank=1;return groups.flatMap(direct).flatMap(group=>{const placed=group.map(row=>({...row,rank}));rank+=group.length;return placed;}).concat(excluded.map(row=>({...row,rank:null,excluded:true})));
}
export function transition(t,body,actor){
  if(!t || t.mode!=='round-robin')throw Error('Dieser Ablauf ist für Rundenturniere vorgesehen.');
  t=structuredClone(t);const before=t.phase;
  if(body.action==='prepare'){
    if(t.phase!=='draft')throw Error('Der Plan wurde bereits erstellt.');
    if(!t.title || !t.startsOn || !t.endsOn || !t.timeControl)throw Error('Bitte Titel, Zeitraum und Bedenkzeit ergänzen.');
    t.schedule=pairRoundRobin(t.participants.map(p=>p.id),t.cycles);t.phase='prepared';
  }else if(body.action==='discard-plan'){
    if(t.phase!=='prepared'||t.schedule.some(r=>r.wasReleased))throw Error('Ein bereits veröffentlichter Plan darf nicht verworfen werden.');delete t.schedule;delete t.ranking;t.phase='draft';
  }else if(body.action==='recall-pairings'){
    if(t.phase!=='running'||t.withdrawn?.length||t.schedule.some(r=>hasRecordedResults(t,r)))throw Error('Rücknahme nur möglich, solange noch kein Partieergebnis eingetragen wurde.');
    const reason=pairingReason(body);t.schedule.forEach(r=>r.wasReleased=true);t.phase='prepared';
    (t.audit||=[]).push({at:new Date().toISOString(),actor,action:body.action,reason});
  }else if(body.action==='pairings'){
    if(t.phase!=='prepared'||t.schedule.some(r=>hasRecordedResults(t,r)))throw Error('Paarungen sind nur im ergebnislosen Entwurf bearbeitbar.');
    const reason=pairingReason(body);
    if(!Array.isArray(body.rounds)||body.rounds.length!==t.schedule.length)throw Error('Bitte den vollständigen Spielplan übermitteln.');
    const next=t.schedule.map((r,i)=>replacePairings(r,body.rounds[i]));validateRoundRobinPlan(t,next);
    (t.audit||=[]).push(...pairingEvents(t.schedule,next,actor,reason));t.schedule=next;
  }else if(body.action==='release'){
    if(t.phase!=='prepared')throw Error('Bitte zuerst den Paarungsplan vorbereiten.');validateRoundRobinPlan(t,t.schedule);t.schedule.forEach(r=>r.wasReleased=true);t.phase='running';
  }else if(body.action==='withdraw'){
    if(t.phase!=='running'||!t.participants.some(p=>p.id===body.participantId)||(t.withdrawn||[]).includes(body.participantId))throw Error('Rückzug nur für einen aktiven Teilnehmer im laufenden Turnier möglich.');
    const reason=String(body.reason||'').trim();if(!reason||reason.length>500)throw Error('Bitte den Rückzug kurz begründen.');
    (t.withdrawn||=[]).push(body.participantId);t.hasEverResults=true;
    (t.audit||=[]).push({at:new Date().toISOString(),actor,action:'withdraw',participantId:body.participantId,reason});
  }else if(body.action==='result'){
    if(t.phase!=='running')throw Error('Ergebnisse sind nur im laufenden Turnier bearbeitbar.');
    if(body.result!==null && !Object.hasOwn(RESULTS,body.result))throw Error('Ungültiges Ergebnis.');
    const game=t.schedule.flatMap(r=>r.games).find(g=>g.id===body.gameId);if(!game)throw Error('Partie nicht gefunden.');
    if((game.result===null||body.result===null)&&(t.withdrawn||[]).some(id=>id===game.white||id===game.black))throw Error('Offene Partien zurückgezogener Teilnehmer werden automatisch behandelt. Vorhandene Ergebnisse können korrigiert, aber nicht auf Offen gesetzt werden.');
    const reason=String(body.reason||'').trim();if(game.result!==null && !reason)throw Error('Bitte die Korrektur kurz begründen.');if(reason.length>500)throw Error('Die Begründung ist zu lang.');
    if(game.result===body.result)return t;
    (t.audit||=[]).push({at:new Date().toISOString(),actor,action:'result',gameId:game.id,old:game.result,value:body.result,reason});game.result=body.result;
    if(body.result!==null){t.hasEverResults=true;t.schedule.find(r=>r.games.some(g=>g.id===game.id)).hasRecordedResults=true;}
  }else if(body.action==='complete'){
    if(t.phase!=='running'||effectiveRoundRobinGames(t).some(g=>!g.excluded&&!g.result))throw Error('Zuerst alle Partien abschließen.');t.phase='completed';
  }else if(body.action==='reopen'){
    if(t.phase!=='completed')throw Error('Das Turnier ist nicht abgeschlossen.');t.phase='running';
  }else throw Error('Unbekannte Turnieraktion.');
  if(t.phase!==before && body.action!=='recall-pairings')(t.audit||=[]).push({at:new Date().toISOString(),actor,action:body.action,old:before,value:t.phase});
  t.ranking=standings(t);return t;
}

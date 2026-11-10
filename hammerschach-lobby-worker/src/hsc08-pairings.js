// Shared integrity checks. Administrative changes never accept results or metadata from the client.
export function pairingReason(body) {
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(!reason || reason.length>500)throw Error('Bitte die Paarungsänderung kurz begründen (höchstens 500 Zeichen).');
  return reason;
}
export function hasRecordedResults(t,round) {
  return round.hasRecordedResults===true || round.games.some(g=>g.result!==null) ||
    (t.audit||[]).some(e=>e.action==='result' && round.games.some(g=>g.id===e.gameId) && (e.old!=null||e.value!=null));
}
export function replacePairings(round,proposal) {
  if(!proposal || proposal.number!==round.number || !Array.isArray(proposal.games) || proposal.games.length!==round.games.length)
    throw Error('Bitte den vollständigen Paarungsentwurf dieser Runde übermitteln.');
  return {...round,bye:proposal.bye,games:round.games.map((g,i)=>{
    const p=proposal.games[i];
    if(!p || p.id!==g.id || typeof p.white!=='string'||typeof p.black!=='string')throw Error('Ungültige Paarung.');
    return {...g,white:p.white,black:p.black};
  })};
}
export function pairingEvents(before,after,actor,reason) {
  const events=[],at=new Date().toISOString();
  for(let i=0;i<before.length;i++){
    const old=before[i],next=after[i];
    if(old.bye!==next.bye)events.push({at,actor,action:'pairings',gameId:'r'+old.number+'bye',old:old.bye,value:next.bye,reason});
    old.games.forEach((g,j)=>{const n=next.games[j];if(g.white!==n.white||g.black!==n.black)events.push({at,actor,action:'pairings',gameId:g.id,old:JSON.stringify([g.white,g.black]),value:JSON.stringify([n.white,n.black]),reason});});
  }
  if(!events.length)throw Error('Die Paarungen wurden nicht verändert.');
  return events;
}
export function validateRoundRobinPlan(t,rounds) {
  const ids=new Set(t.participants.map(p=>p.id)),n=ids.size,perCycle=n%2?n:n-1;
  if(!Array.isArray(rounds)||rounds.length!==perCycle*t.cycles)throw Error('Unvollständiger Rundenturnierplan.');
  const meetings=new Map(),firstColours=new Map(),gameIds=new Set();
  rounds.forEach((r,ri)=>{
    if(r.number!==ri+1 || !Array.isArray(r.games)||r.games.length!==Math.floor(n/2))throw Error('Ungültige Runde.');
    const used=new Set(),cycle=Math.floor(ri/perCycle);
    const take=id=>{if(!ids.has(id)||used.has(id))throw Error('Ein Teilnehmer fehlt oder ist in einer Runde doppelt eingeteilt.');used.add(id);};
    if(n%2)take(r.bye);else if(r.bye!==null)throw Error('Bei gerader Teilnehmerzahl ist kein spielfreier Teilnehmer vorgesehen.');
    r.games.forEach((g,gi)=>{
      take(g.white);take(g.black);
      if(typeof g.id!=='string'||!new RegExp('^r'+r.number+'g[1-9][0-9]*$').test(g.id)||Number(g.id.split('g')[1])>Math.ceil(n/2)||gameIds.has(g.id))throw Error('Ungültige Partiekennung.');gameIds.add(g.id);
      const pair=JSON.stringify([g.white,g.black].sort()),key=cycle+pair;
      if(meetings.has(key))throw Error('Diese Begegnung kommt innerhalb eines Durchgangs doppelt vor. Bitte den gesamten Plan korrigieren.');
      meetings.set(key,true);
      if(!cycle)firstColours.set(pair,g.white);
      else if(firstColours.get(pair)===g.white)throw Error('Im Rückspiel müssen Weiß und Schwarz gegenüber dem Hinspiel getauscht sein.');
    });
    if(used.size!==n)throw Error('Die Runde ist nicht vollständig.');
  });
  if(meetings.size!==n*(n-1)/2*t.cycles)throw Error('Im Spielplan fehlen Begegnungen.');
}

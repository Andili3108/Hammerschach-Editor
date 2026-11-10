import {pairingReason,hasRecordedResults,replacePairings,pairingEvents} from './hsc08-pairings.js';
import {swissStandings} from './hsc08-tiebreak.js';
export {swissStandings} from './hsc08-tiebreak.js';
import {t as dutch} from './vendor/hsc08-dutch/dutch-gyo2itP7.js';
import {score, RESULTS} from './hsc08-round-robin.js';

export function checkSeeds(t, seeds) {
  const strength = new Map(t.participants.map(p => [p.id, p.dwz ?? p.estimatedRating ?? 0]));
  if (!Array.isArray(seeds) || seeds.length !== strength.size || new Set(seeds).size !== seeds.length ||
      seeds.some(id => !strength.has(id)) || seeds.map(id=>strength.get(id)).filter(Boolean).some((rating,i,ratings)=>i>0 && ratings[i-1]<rating))
    throw Error('Startnummern müssen eindeutig und nach Spielstärke geordnet sein.');
}

function checkDates(start, end) {
  for (const date of [start,end]) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0,10) !== date) throw Error('Bitte beide gültigen Rundentermine angeben.');
  }
  if (end < start) throw Error('Der letzte Spieltermin liegt vor dem Rundenbeginn.');
}


function prepare(t, body, initialFlip) {
  if (!['draft','running'].includes(t.phase)) throw Error('Bitte das Turnier zuerst für die Bearbeitung öffnen.');
  const previous = t.schedule || [];
  const number = previous.length+1;
  if (!t.title || !t.startsOn || !t.endsOn || !t.timeControl || t.participants.length < 2 ||
      !t.rounds || t.rounds > t.participants.length - (t.participants.length%2===0 ? 1 : 0))
    throw Error('Bitte Titel, Zeitraum, Bedenkzeit, Teilnehmer und eine durchführbare Rundenzahl prüfen.');
  if (number > t.rounds || previous.some(r => r.pending || r.games.some(g => !g.result)))
    throw Error('Die vorige Runde muss freigegeben und vollständig entschieden sein.');
  checkDates(body.start,body.end);
  if (body.start < t.startsOn || body.end > t.endsOn || (previous.length && body.start <= previous.at(-1).end))
    throw Error('Rundenzeitraum außerhalb der Saison oder Überschneidung mit der Vorrunde.');
  const seeds = previous[0]?.seeds ?? body.seeds;
  if (!previous.length) checkSeeds(t,seeds);
  const flip = previous[0]?.flip ?? initialFlip ?? Boolean(crypto.getRandomValues(new Uint8Array(1))[0] % 2);
  const requested = body.absent ?? [];
  if (!Array.isArray(requested) || new Set(requested).size !== requested.length || requested.some(id => !seeds.includes(id)))
    throw Error('Ungültige Abwesenheitsliste.');
  const absent = [...new Set([...requested, ...(t.withdrawn || [])])];
  const players = seeds.map((id,index) => ({id,tpn:index+1,normalizedScore:0,floatHistory:[]}));
  const byId = new Map(players.map(p => [p.id,p]));
  const totals = new Map(seeds.map(id => [id,0]));
  const win = score('1-0',t.scoring)[0];
  const history = previous.map(round => {
    const games = round.games.map(g => {
      const [a,b] = score(g.result,t.scoring);
      const forfeited = ['+/-','-/+','-/-'].includes(g.result);
      const diff = totals.get(g.white)-totals.get(g.black);
      for (const [id,pts,delta] of [[g.white,a,diff],[g.black,b,-diff]]) {
        byId.get(id).floatHistory.push(forfeited ? (pts ? 'down' : undefined) : delta>0?'down':delta<0?'up':undefined);
        totals.set(id,totals.get(id)+pts);
      }
      const [white,black,w,bp] = flip ? [g.black,g.white,b,a] : [g.white,g.black,a,b];
      return {white,black,result:w>bp?'white':bp>w?'black':w?'draw':'none',
        ...(forfeited?{forfeit:w>bp?'black':bp>w?'white':'both'}:{})};
    });
    if(round.bye){totals.set(round.bye,totals.get(round.bye)+win);byId.get(round.bye).floatHistory.push('down');}
    for (const id of round.absent || []) byId.get(id).floatHistory.push(undefined);
    return {games,byes:[...(round.bye?[{kind:'pairing',player:round.bye}]:[]), ...(round.absent || []).map(player=>({kind:'zero',player}))]};
  });
  for (const p of players) p.normalizedScore=totals.get(p.id)/win;
  const active = players.filter(player => !absent.includes(player.id));
  const paired = active.length > 1 ? dutch(active,history,{expectedRounds:t.rounds}) :
    {games:[],byes:active.length?[{player:active[0].id,kind:'pairing'}]:[]};
  const bye=paired.byes[0]?.player ?? null;
  const games=paired.games.map((g,i)=>({id:'r'+number+'g'+(i+1),white:flip?g.black:g.white,black:flip?g.white:g.black,result:null}));
  const round={number,start:body.start,end:body.end,pending:true,bye,games,absent,...(!previous.length?{seeds,flip}:{})};
  validateSwissRound(t,round,previous);
  (t.schedule ||= []).push(round);
  if(number===1)t.phase='prepared';
}

export function validateSwissRound(t,r,previous,restoring=false) {
  checkDates(r.start,r.end);
  const ids=new Set(t.participants.map(p=>p.id));
  if(r.number!==previous.length+1 || r.number>t.rounds || typeof r.pending!=='boolean' || !Array.isArray(r.games) ||
      previous.at(-1)?.pending || (previous.length && r.start<=previous.at(-1).end))throw Error('Ungültige Schweizer Runde.');
  const used=new Set();
  function take(id){if(!ids.has(id)||used.has(id))throw Error('Teilnehmer fehlt oder ist doppelt gepaart.');used.add(id);}
  if (!Array.isArray(r.absent ?? [])) throw Error('Ungültige Abwesenheiten.');
  for (const id of r.absent || []) take(id);
  if(r.bye!==null){
    take(r.bye);
    if(!restoring && previous.some(p=>p.bye===r.bye || p.games.some(g=>g.white===r.bye&&g.result==='+/-'||g.black===r.bye&&g.result==='-/+')))throw Error('Kein zulässiges Freilos.');
  }
  for(const [i,g] of r.games.entries()){
    take(g.white);take(g.black);
    if(g.id!=='r'+r.number+'g'+(i+1)|| (g.result!==null && (r.pending||!Object.hasOwn(RESULTS,g.result))))throw Error('Ungültige Schweizer Partie.');
    if(!restoring && previous.some(p=>p.games.some(old=>['1-0','0-1','1/2-1/2'].includes(old.result)&&[old.white,old.black].includes(g.white)&&[old.white,old.black].includes(g.black))))throw Error('Wiederholte Begegnung.');
  }
  if(used.size!==ids.size)throw Error('Kein vollständiger zulässiger Paarungsvorschlag.');
}


// Replay the same deterministic Dutch input, including the original random initial colour.
export function dutchReference(t,round) {
  const previous=t.schedule.slice(0,round.number-1);
  const copy={...t,withdrawn:[],phase:previous.length?'running':'draft',schedule:structuredClone(previous)};
  prepare(copy,{start:round.start,end:round.end,seeds:round.seeds,absent:round.absent},t.schedule[0].flip);
  return copy.schedule.at(-1);
}
export function matchesDutchPairings(t,round) {
  const reference=dutchReference(t,round);
  const signature=r=>JSON.stringify({bye:r.bye,games:r.games.map(g=>[g.white,g.black]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))});
  return signature(reference)===signature(round);
}

// Manual edits do not override the ordinary colour limits. Final-round exceptions
// remain available only through the automatic Dutch pairing, not this override.
export function validateManualColours(t,round) {
  const colours=new Map(t.participants.map(p=>[p.id,[]]));
  for(const r of t.schedule.slice(0,round.number-1))for(const g of r.games){
    if(['1-0','0-1','1/2-1/2'].includes(g.result)){colours.get(g.white).push(1);colours.get(g.black).push(-1);}
  }
  const names=new Map(t.participants.map(p=>[p.id,p.name]));
  for(const g of round.games)for(const [id,colour] of [[g.white,1],[g.black,-1]]){
    const past=colours.get(id),difference=past.reduce((sum,c)=>sum+c,0)+colour;
    if(Math.abs(difference)>2||past.length>=2&&past.at(-1)===colour&&past.at(-2)===colour)
      throw Error('Unzulässige manuelle Farbvergabe für '+names.get(id)+': dritte gleiche Farbe in Folge oder Farbdifferenz größer als zwei. Sonderfälle der Schlussrunde bleiben der Dutch-Automatik vorbehalten.');
  }
}
export function swissTransition(original,body,actor){
  const t=structuredClone(original);
  const last=t.schedule?.at(-1);
  const event={actor,at:new Date().toISOString(),action:body.action};
  if (t.phase === 'completed' && body.action !== 'reopen') throw Error('Bitte das Turnier für Korrekturen öffnen.');
  switch(body.action){
    case 'complete':
      if (t.phase !== 'running' || t.schedule.length !== t.rounds || t.schedule.some(r=>r.pending || r.games.some(g=>!g.result)))
        throw Error('Zum Abschluss müssen alle geplanten Runden freigegeben und alle Partien entschieden sein.');
      t.phase='completed'; break;
    case 'reopen':
      if (t.phase !== 'completed') throw Error('Das Turnier ist nicht abgeschlossen.');
      t.phase='running'; break;
    case 'withdraw':
      if (t.phase !== 'running' || last?.pending || !t.participants.some(p=>p.id===body.participantId))
        throw Error('Rückzug nur im laufenden Turnier ohne offenen Paarungsentwurf möglich.');
      if ((t.withdrawn || []).includes(body.participantId)) throw Error('Dieser Teilnehmer ist bereits zurückgezogen.');
      (t.withdrawn ||= []).push(body.participantId);
      event.participantId=body.participantId;
      break;
    case 'prepare': prepare(t,body);break;
    case 'discard-plan':
      if(last?.wasReleased)throw Error('Eine zurückgenommene Runde muss erneut freigegeben werden und darf nicht verworfen werden.');
      if(!last?.pending)throw Error('Kein offener Paarungsentwurf.');
      t.schedule.pop();
      if(!t.schedule.length){delete t.schedule;t.phase='draft';}
      break;
    case 'recall-pairings': {
      if(t.phase!=='running'||!last||last.pending||hasRecordedResults(t,last))throw Error('Nur die jüngste freigegebene Runde ohne jemals eingetragenes Partieergebnis kann zurückgenommen werden.');
      event.reason=pairingReason(body);event.gameId='r'+last.number;
      last.wasReleased=true;last.pending=true;if(last.number===1)t.phase='prepared';break;
    }
    case 'pairings': {
      if(!last?.pending||hasRecordedResults(t,last))throw Error('Nur der ergebnislose Paarungsentwurf ist bearbeitbar.');
      const reason=pairingReason(body);
      if(!Array.isArray(body.rounds)||body.rounds.length!==1)throw Error('Nur die aktuelle Schweizer Runde darf geändert werden.');
      const next=replacePairings(last,body.rounds[0]);
      validateSwissRound(t,next,t.schedule.slice(0,-1));
      const deviation=!matchesDutchPairings(t,next);
      if(deviation){
        validateManualColours(t,next);
        if(String(actor).toLowerCase()!=='andili'||body.acceptDeviation!==true)throw Error('Abweichung von der Dutch-Auslosung: Zum Speichern sind die entsprechende Berechtigung, eine ausdrückliche Bestätigung und eine Begründung erforderlich.');
      }
      next.manualPairings=deviation;
      (t.audit ||= []).push(...pairingEvents([last],[next],actor,reason));
      t.audit.push({actor,at:event.at,action:'pairing-approval',gameId:'r'+last.number,old:last.manualPairings?'manual':'dutch',value:deviation?'manual':'dutch',reason});t.schedule[t.schedule.length-1]=next;
      t.ranking=swissStandings(t);return t;
    }
    case 'release':
      if(!last?.pending)throw Error('Kein offener Paarungsentwurf.');
      validateSwissRound(t,last,t.schedule.slice(0,-1));
      if(last.manualPairings)validateManualColours(t,last);
      last.pending=false;last.wasReleased=true;t.phase='running';event.gameId='r'+last.number;if(last.bye)t.hasEverResults=true;break;
    case 'result': {
      if(t.phase!=='running'||last?.pending)throw Error('Bitte zuerst den Paarungsentwurf verwerfen oder freigeben.');
      const g=t.schedule.flatMap(r=>r.games).find(g=>g.id===body.gameId);
      if(!g || (body.result!==null && !Object.hasOwn(RESULTS,body.result)))throw Error('Ungültiges Ergebnis.');
      if(g.result===body.result)return t;
      const reason=String(body.reason||'').trim();
      if((g.result!==null&&!reason)||reason.length>500)throw Error('Bitte die Korrektur kurz begründen.');
      Object.assign(event,{gameId:g.id,old:g.result,value:body.result,reason});
      g.result=body.result;if(g.result){t.hasEverResults=true;t.schedule.find(r=>r.games.some(x=>x.id===g.id)).hasRecordedResults=true;}break;
    }
    default:throw Error('Diese Turnieraktion steht im Schweizer System noch nicht zur Verfügung.');
  }
  (t.audit ||= []).push(event);
  if(t.schedule)t.ranking=swissStandings(t);else delete t.ranking;
  return t;
}

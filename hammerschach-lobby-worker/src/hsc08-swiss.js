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

export function swissStandings(t) {
  const rows = new Map(t.participants.map(p => [p.id,{id:p.id,name:p.name,points:0,played:0}]));
  for (const round of t.schedule || []) {
    if (round.pending) continue;
    if (round.bye) rows.get(round.bye).points += score('1-0',t.scoring)[0];
    for (const game of round.games) {
      if (!game.result) continue;
      const points = score(game.result,t.scoring);
      [game.white,game.black].forEach((id,i) => {
        rows.get(id).points += points[i];
        if (!game.result.includes('+') && game.result !== '-/-') rows.get(id).played++;
      });
    }
  }
  const sorted = [...rows.values()].sort((a,b) => b.points-a.points);
  sorted.forEach((r,i) => { r.rank = i && sorted[i-1].points === r.points ? sorted[i-1].rank : i+1; });
  return sorted;
}

function prepare(t, body) {
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
  const flip = previous[0]?.flip ?? Boolean(crypto.getRandomValues(new Uint8Array(1))[0] % 2);
  const players = seeds.map(id => ({id,normalizedScore:0,floatHistory:[]}));
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
    return {games,byes:round.bye?[{kind:'pairing',player:round.bye}]:[]};
  });
  for (const p of players) p.normalizedScore=totals.get(p.id)/win;
  const paired=dutch(players,history,{expectedRounds:t.rounds});
  const bye=paired.byes[0]?.player ?? null;
  const games=paired.games.map((g,i)=>({id:'r'+number+'g'+(i+1),white:flip?g.black:g.white,black:flip?g.white:g.black,result:null}));
  const round={number,start:body.start,end:body.end,pending:true,bye,games,...(!previous.length?{seeds,flip}:{})};
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

export function swissTransition(original,body,actor){
  const t=structuredClone(original);
  const last=t.schedule?.at(-1);
  const event={actor,at:new Date().toISOString(),action:body.action};
  switch(body.action){
    case 'prepare': prepare(t,body);break;
    case 'discard-plan':
      if(!last?.pending)throw Error('Kein offener Paarungsentwurf.');
      t.schedule.pop();
      if(!t.schedule.length){delete t.schedule;t.phase='draft';}
      break;
    case 'release':
      if(!last?.pending)throw Error('Kein offener Paarungsentwurf.');
      last.pending=false;t.phase='running';if(last.bye)t.hasEverResults=true;break;
    case 'result': {
      if(t.phase!=='running'||last?.pending)throw Error('Bitte zuerst den Paarungsentwurf verwerfen oder freigeben.');
      const g=t.schedule.flatMap(r=>r.games).find(g=>g.id===body.gameId);
      if(!g || (body.result!==null && !Object.hasOwn(RESULTS,body.result)))throw Error('Ungültiges Ergebnis.');
      if(g.result===body.result)return t;
      const reason=String(body.reason||'').trim();
      if((g.result!==null&&!reason)||reason.length>500)throw Error('Bitte die Korrektur kurz begründen.');
      Object.assign(event,{gameId:g.id,old:g.result,value:body.result,reason});
      g.result=body.result;if(g.result)t.hasEverResults=true;break;
    }
    default:throw Error('Diese Turnieraktion steht im Schweizer System noch nicht zur Verfügung.');
  }
  (t.audit ||= []).push(event);
  if(t.schedule)t.ranking=swissStandings(t);else delete t.ranking;
  return t;
}

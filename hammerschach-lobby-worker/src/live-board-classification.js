// Ordered, deliberately limited discovery scope. Extend here when another
// association is supported; geography alone never turns an Open into club chess.
export const CLUB_SCOPES = ['bundesliga','nrw','ruhrgebiet','hamm','baden','bayern','berlin','brandenburg','bremen','hamburg','hessen','mecklenburg-vorpommern','niedersachsen','rheinland-pfalz','saarland','sachsen','sachsen-anhalt','schleswig-holstein','thueringen','wuerttemberg'];
const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const individual = /\b(open|individual|einzel\w*|quick[ -]?round[ -]?robin|masters\s+(?:vs\.?|versus)\s+challengers)\b/;
const league = /\b(?:\w*liga|\w*league|\w*klasse|mannschaft\w*|team\s+championships?)\b/;

export function clubScope(title) {
  const name=normalized(title);
  // A league may have an "Open" division, so check Bundesliga before Open.
  if (/\b(?:schach|frauen)?bundesliga\b/.test(name) && !/\b(austri\w*|osterreich\w*|swiss|schweiz\w*)\b/.test(name)) return 'bundesliga';
  if(individual.test(name)||!league.test(name))return null;
  if(/\b(hamm|sbhamm)\b/.test(name))return 'hamm';
  if(/\b(ruhrgebiet|svruhrgebiet|svr)\b/.test(name))return 'ruhrgebiet';
  if(/\b(nrw|sbnrw|nordrhein[ -]westfalen|north[ -]rhine[ -]westphalia)\b/.test(name))return 'nrw';
  const regions=[
    ['sachsen-anhalt',/\b(sachsen[ -]anhalt|saxony[ -]anhalt)\b/],
    ['baden',/\b(baden|badisch\w*)\b/],['bayern',/\b(bayern|bayerisch\w*|bavaria\w*)\b/],
    ['berlin',/\bberlin\w*\b/],['brandenburg',/\bbrandenburg\w*\b/],['bremen',/\b(bremen|bremer)\b/],
    ['hamburg',/\bhamburg\w*\b/],['hessen',/\b(hessen|hessisch\w*|hesse)\b/],
    ['mecklenburg-vorpommern',/\b(mecklenburg(?:[ -]vorpommern)?|mv)\b/],
    ['niedersachsen',/\b(niedersachsen|niedersachsisch\w*|lower saxony)\b/],
    ['rheinland-pfalz',/\b(rheinland[ -]pfalz|rhineland[ -]palatinate)\b/],
    ['saarland',/\b(saarland|saarlandisch\w*)\b/],['sachsen',/\b(sachsen|sachsisch\w*|saxony)\b/],
    ['schleswig-holstein',/\bschleswig[ -]holstein\b/],['thueringen',/\b(thuring\w*|thuering\w*)\b/],
    ['wuerttemberg',/\b(wurttemberg|wuerttemberg)\w*\b/]
  ];
  // Cross-association leagues need explicit assignment; never guess one half.
  if(/\bbaden[ -](?:wurttemberg|wuerttemberg)\b/.test(name))return null;
  return regions.find(([,pattern])=>pattern.test(name))?.[0]||null;
}

export function classifyBroadcast(tour) {
  const name=normalized(tour?.name),scope=clubScope(name);
  if(scope)return {category:'club',clubScope:scope};
  // Team tables also occur in independent invitationals (Masters vs Challengers).
  if(/\bmasters\s+(?:vs\.?|versus)\s+challengers\b/.test(name))return {category:'tournament'};
  // Foreign leagues/club championships are outside the initial regional scope.
  if(league.test(name)||tour?.teamTable===true)return null;
  return {category:'tournament'};
}

export function normalizeEvent(event) {
  const inferred=clubScope(event.title);
  if(inferred)return {...event,category:'club',clubScope:inferred};
  const {clubScope:scope,...rest}=event;
  return rest.category==='club'?{...rest,clubScope:CLUB_SCOPES.includes(scope)?scope:'own'}:rest;
}
export function sourceIdentity(event) {
  const s=event.source;
  return s.type==='demo'?'demo:'+event.id:s.url||JSON.stringify([s.type,s.tournamentId,s.round]);
}
export function orderedEvents(events) {
  const seen=new Set();
  return events.map(normalizeEvent).filter(e=>{const key=sourceIdentity(e);if(seen.has(key))return false;seen.add(key);return true;})
    .sort((a,b)=>{
      const rank=e=>e.category==='club'?(CLUB_SCOPES.indexOf(e.clubScope)+1||CLUB_SCOPES.length+1):CLUB_SCOPES.length+2;
      return rank(a)-rank(b);
    });
}

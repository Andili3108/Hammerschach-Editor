import {classifyBroadcast,normalizeEvent,sourceIdentity,CLUB_SCOPES} from './live-board-classification.js';
import {safeSourceUrl} from './live-board-sources.js';

const validId = value => typeof value === 'string' && /^[A-Za-z0-9]{8}$/.test(value);
const clean = value => String(value || '').slice(0,160);
const schemas = new WeakMap();

export function broadcastEvent(tour, round) {
  const classification=classifyBroadcast(tour);
  if(!classification)return null;
  const {category}=classification;
  if (!validId(tour?.id) || !validId(round?.id)) throw Error('Ungültige Übertragung.');
  return {id:`lc-${category}-${tour.id}-${round.id}`,title:clean(tour.name),...classification,
    round:clean(round.name),finished:round.finished===true,ongoing:round.ongoing===true,
    startsAt:Number(round.startsAt)||null,automatic:true,
    source:{type:'lichess',url:`https://lichess.org/api/broadcast/round/${round.id}.pgn`}};
}

export async function discoverBroadcasts(cached, read) {
  return cached('lichess-discovery-regional-v3',300000,async()=>{
    const data=JSON.parse(await read('https://lichess.org/api/broadcast/top'));
    if(!Array.isArray(data.active)||(data.upcoming!==undefined&&!Array.isArray(data.upcoming))||!Array.isArray(data.past?.currentPageResults))throw Error('Veranstaltungsliste nicht verfügbar.');
    const events=[],seen=new Set();
    for(const item of [...data.active,...(data.upcoming||[]),...data.past.currentPageResults].slice(0,120)){
      if(!validId(item.tour?.id)||!validId(item.round?.id)||seen.has(item.tour.id))continue;
      seen.add(item.tour.id);
      const event=broadcastEvent(item.tour,item.round);
      if(event)events.push(event);
    }
    return {events};
  });
}

export async function resolveBroadcast(id,cached,read){
  const m=id.match(/^lc-(club|tournament)-([A-Za-z0-9]{8})-([A-Za-z0-9]{8})$/);
  if(!m)return null;
  const result=await cached('lichess-tour:'+m[2],300000,async()=>{
    const data=JSON.parse(await read(`https://lichess.org/api/broadcast/${m[2]}`));
    if(data.tour?.id!==m[2]||!Array.isArray(data.rounds)||data.rounds.length>200)throw Error('Ungültige Rundenliste.');
    return {tour:data.tour,rounds:data.rounds};
  });
  const round=result.value.rounds.find(r=>r.id===m[3]);
  if(!round)return null;
  const event=broadcastEvent(result.value.tour,round);
  if(!event||event.category!==m[1])return null;
  event.rounds=result.value.rounds.filter(r=>validId(r.id)).map(r=>({id:`lc-${m[1]}-${m[2]}-${r.id}`,name:clean(r.name),finished:r.finished===true}));
  event.catalogStale=result.stale;
  return event;
}

async function ensureTable(db){
  if(!schemas.has(db)){
    const promise=db.prepare('CREATE TABLE IF NOT EXISTS live_board_sources (id TEXT PRIMARY KEY, event_json TEXT NOT NULL, created_at INTEGER NOT NULL)').run().catch(error=>{schemas.delete(db);throw error;});
    schemas.set(db,promise);
  }
  await schemas.get(db);
}
export async function savedEvents(env){
  if(!env.DB)return [];
  await ensureTable(env.DB);
  const {results}=await env.DB.prepare('SELECT event_json FROM live_board_sources ORDER BY created_at DESC LIMIT 40').all();
  return results.map(row=>normalizeEvent({...JSON.parse(row.event_json),saved:true}));
}

// Source management is guarded by the existing authenticated Andili check.
// PGN hosts retain the deployment allowlist; a pasted URL cannot widen it.
export function sourceFromLink(body,env){
  if(!['club','tournament'].includes(body.category))throw Error('Bitte einen Bereich auswählen.');
  const raw=String(body.url||'').trim();
  if(raw.length>2048)throw Error('Der Link ist zu lang.');
  const u=new URL(raw);
  if(u.username||u.password||u.port||u.protocol!=='https:')throw Error('Bitte einen öffentlichen HTTPS-Link ohne Zugangsdaten verwenden.');
  let source,round='';
  if(u.hostname==='lichess.org'){
    const direct=u.pathname.match(/^\/api\/broadcast\/round\/([A-Za-z0-9]{8})\.pgn$/);
    const viewer=u.pathname.match(/^\/broadcast\/[^/]+\/[^/]+\/([A-Za-z0-9]{8})\/?$/);
    const id=direct?.[1]||viewer?.[1];
    if(!id)throw Error('Bitte den Link einer Lichess-Runde einfügen.');
    source={type:'lichess',url:`https://lichess.org/api/broadcast/round/${id}.pgn`};
  }else if(['view.livechesscloud.com','www.livechesscloud.com','livechesscloud.com'].includes(u.hostname)){
    const match=(u.hash||u.pathname).match(/^[/#]*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/(\d{1,3}))?\/?$/i);
    const n=Number(body.round||match?.[2]||1);
    if(!match||!Number.isInteger(n)||n<1||n>100)throw Error('DGT-Link oder Rundennummer ungültig.');
    source={type:'dgt',tournamentId:match[1].toLowerCase(),round:n};round=String(n);
  }else{
    const hosts=String(env.LIVE_BOARD_PGN_HOSTS||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean);
    if(!hosts.includes(u.hostname))throw Error('Diesen PGN-Host zuerst in LIVE_BOARD_PGN_HOSTS freigeben: '+u.hostname);
    source={type:'pgn',url:safeSourceUrl(raw,hosts)};
  }
  const title=String(body.title||'').trim();
  if(!title||title.length>160)throw Error('Bitte einen Veranstaltungsnamen eingeben (maximal 160 Zeichen).');
  if(body.clubScope!==undefined&&!CLUB_SCOPES.includes(body.clubScope)&&body.clubScope!=='own')throw Error('Bitte eine gültige Verbandsebene auswählen.');
  return normalizeEvent({title,category:body.category,clubScope:body.clubScope,round,finished:false,source});
}
export async function saveEvent(env,event){
  if(!env.DB)throw Error('Veranstaltungsspeicher nicht verfügbar.');
  await ensureTable(env.DB);
  event=normalizeEvent(event);
  // Reusing a round cannot create a second entry in another category. Existing
  // records keep their ids, so old links and deletion continue to work.
  const prior=(await savedEvents(env)).find(e=>sourceIdentity(e)===sourceIdentity(event));
  if(prior){
    const value={...event,id:prior.id};
    await env.DB.prepare('UPDATE live_board_sources SET event_json = ? WHERE id = ?').bind(JSON.stringify(value),prior.id).run();
    return {...value,saved:true};
  }
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(sourceIdentity(event))));
  const id='saved-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
  const existing=await env.DB.prepare('SELECT event_json FROM live_board_sources WHERE id = ?').bind(id).first();
  if(existing)return {...JSON.parse(existing.event_json),saved:true};
  const value={...event,id};
  const result=await env.DB.prepare('INSERT OR IGNORE INTO live_board_sources (id,event_json,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM live_board_sources) < 40').bind(id,JSON.stringify(value),Date.now()).run();
  if(!result.meta?.changes){
    const concurrent=await env.DB.prepare('SELECT event_json FROM live_board_sources WHERE id = ?').bind(id).first();
    if(concurrent)return {...JSON.parse(concurrent.event_json),saved:true};
    const error=Error('Maximal 40 eigene Übertragungen. Bitte zuerst einen Eintrag entfernen.');error.status=409;throw error;
  }
  return {...value,saved:true};
}
export async function removeEvent(env,id){
  if(!env.DB)return;
  await ensureTable(env.DB);
  await env.DB.prepare('DELETE FROM live_board_sources WHERE id = ?').bind(id).run();
}

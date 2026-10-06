import { sourceEvents, safeSourceUrl, parseLivePgn, demoGames, dgtPairings, dgtGame } from './live-board-sources.js';

const pending = new Map();
const memory = new Map();
const POLL_MS = 30000;
const MAX_BYTES = 2 * 1024 * 1024;
const RETAIN_MS = 86400000;

async function cacheKey(key) {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
  return new Request('https://live-board-cache.invalid/v1/'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''));
}
function remember(key, entry){
  memory.delete(key);memory.set(key,entry);
  while(memory.size>24)memory.delete(memory.keys().next().value);
}
// Cloudflare Cache API is shared within a location. Coalesce simultaneous misses
// in this isolate, too. No scheduled polling and no D1 writes per live update.
export async function sharedLiveCache(key, ttl, load, options={}) {
  const now=options.now || Date.now;
  const edge=options.cache===undefined?globalThis.caches?.default:options.cache;
  const namespaced='live-board-v1:'+key;
  if(pending.has(namespaced))return pending.get(namespaced);
  const task=(async()=>{
    const req=await cacheKey(namespaced);
    let old=memory.get(namespaced);
    if(!old&&edge){try{const hit=await edge.match(req);if(hit)old=await hit.json();}catch(_){}}
    if(old&&old.retryAt>now()){
      if(old.value==null)throw new Error('Quelle vorübergehend nicht erreichbar.');
      return {value:old.value,updatedAt:old.updatedAt,stale:!!old.failed};
    }
    let entry;
    try{
      const value=await load();
      const lifetime=(value.finished===true)?RETAIN_MS:ttl;
      entry={value,updatedAt:now(),retryAt:now()+lifetime,failed:false};
    }catch(error){
      entry={value:old&&now()-old.updatedAt<RETAIN_MS?old.value:null,updatedAt:old?.updatedAt||0,retryAt:now()+60000,failed:true};
    }
    remember(namespaced,entry);
    if(edge){try{await edge.put(req,new Response(JSON.stringify(entry),{headers:{'content-type':'application/json','cache-control':'public, max-age=86400'}}));}catch(_){}}
    if(entry.value==null)throw new Error('Quelle vorübergehend nicht erreichbar oder unvollständig.');
    return {value:entry.value,updatedAt:entry.updatedAt,stale:entry.failed};
  })();
  pending.set(namespaced,task);
  try{return await task;}finally{pending.delete(namespaced);}
}

export async function fetchSource(url, fetcher=fetch) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),9000);
  try{
    // Redirects are deliberately rejected so configured hosts cannot redirect
    // the worker to an internal address. No incoming headers are forwarded.
    const response=await fetcher(url,{redirect:'error',signal:controller.signal,headers:{accept:'application/x-chess-pgn, application/json, text/plain'}});
    if(!response.ok)throw new Error('Quelle nicht erreichbar.');
    if(Number(response.headers.get('content-length'))>MAX_BYTES)throw new Error('Quelle zu groß.');
    const reader=response.body.getReader();let bytes=0;const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw new Error('Quelle zu groß.');}chunks.push(value);}
    const merged=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length;}
    return new TextDecoder().decode(merged);
  }finally{clearTimeout(timer);}
}

async function eventSource(event, deps) {
  const source=event.source;
  const cached=(key,ttl,load)=>sharedLiveCache(key,ttl,load,deps);
  const read=url=>fetchSource(url,deps.fetcher);
  if(source.type==='demo')return {catalog:demoGames(),updatedAt:Date.now(),stale:false,board:async p=>({value:p,updatedAt:Date.now(),stale:false})};
  if(source.type==='pgn'||source.type==='lichess'){
    const round=await cached('pgn:'+source.url,POLL_MS,async()=>{
      const games=parseLivePgn(await read(source.url));
      return {games,finished:games.every(g=>g.finished)};
    });
    return {catalog:round.value.games,updatedAt:round.updatedAt,stale:round.stale,board:async p=>({value:p,updatedAt:round.updatedAt,stale:round.stale})};
  }
  const id=source.tournamentId;
  const meta=await cached('dgt-host:'+id,300000,async()=>{
    const info=JSON.parse(await read(`https://lookup.livechesscloud.com/meta/${id}`));
    if(typeof info.host!=='string'||!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.livechesscloud\.com$/i.test(info.host))throw new Error('Unbekannter DGT-Datenhost.');
    return {base:safeSourceUrl(`https://${info.host}/get/${id}/`,[info.host.toLowerCase()])};
  });
  const base=meta.value.base+`round-${source.round}/`;
  const index=await cached('dgt-index:'+base,60000,async()=>({games:dgtPairings(JSON.parse(await read(base+'index.json'))),finished:false}));
  return {catalog:index.value.games,updatedAt:index.updatedAt,stale:meta.stale||index.stale,board:p=>cached('dgt-game:'+base+p.id,POLL_MS,async()=>dgtGame(JSON.parse(await read(base+`game-${p.id}.json`)),p))};
}
const publicEvent=({source,...e})=>({...e,sourceType:source.type,demo:source.type==='demo'});

export async function handleLiveBoardApi(request,env,url,helpers,deps={}) {
  if(!/^\/api\/live-board(?:\/|$)/.test(url.pathname))return null;
  const reply=(data,status=200)=>helpers.json(data,{status,headers:{'cache-control':'private, no-store, max-age=0','vary':'Authorization','x-content-type-options':'nosniff'}});
  // Authenticate before consulting either the catalog or any source/cache.
  const session=await helpers.lookupAuthSession(env,helpers.bearerTokenFromRequest(request));
  if(!session?.user)return reply({ok:false,code:'NOT_AUTHENTICATED',message:'LIVE-BOARD ist nur für angemeldete Mitglieder verfügbar.'},401);
  if(request.method!=='GET')return reply({ok:false,message:'Nur lesender Zugriff erlaubt.'},405);
  try{
    const events=sourceEvents(env);
    if(url.pathname==='/api/live-board/events')return reply({ok:true,events:events.map(publicEvent)});
    const match=url.pathname.match(/^\/api\/live-board\/events\/([a-z0-9_-]+)\/boards$/);
    if(!match)return reply({ok:false,message:'Endpunkt nicht gefunden.'},404);
    const event=events.find(e=>e.id===match[1]);
    if(!event)return reply({ok:false,message:'Veranstaltung nicht gefunden.'},404);
    const board=url.searchParams.get('board');
    const page=Number(url.searchParams.get('page')||1);
    const q=(url.searchParams.get('q')||'').trim().slice(0,80).toLocaleLowerCase('de');
    if(!Number.isInteger(page)||page<1||page>125||(board&&!/^\d{1,4}$/.test(board)))return reply({ok:false,message:'Ungültige Brettauswahl.'},400);
    const source=await eventSource(event,deps);
    const matches=source.catalog.filter(p=>!q||(/^\d+$/.test(q) ? String(p.board)===q||p.label===q : `${p.white} ${p.black}`.toLocaleLowerCase('de').includes(q)));
    const pages=Math.max(1,Math.ceil(matches.length/8));
    const selectedPage=Math.min(page,pages);
    const selected=board?source.catalog.filter(p=>p.id===board):matches.slice((selectedPage-1)*8,selectedPage*8);
    if(board&&!selected.length)return reply({ok:false,message:'Brett nicht gefunden.'},404);
    // Partial DGT failures do not discard seven healthy boards.
    const results=await Promise.all(selected.map(async p=>{
      try{return await source.board(p);}catch(_){return {value:{...p,error:'Brettdaten derzeit nicht verfügbar.',moves:null},stale:true,updatedAt:0};}
    }));
    const stale=source.stale||results.some(r=>r.stale);
    const games=results.map(r=>({...r.value,updatedAt:r.updatedAt,stale:r.stale}));
    const finished=event.finished||(!stale&&games.length>0&&games.every(g=>g.finished));
    return reply({ok:true,event:publicEvent(event),games,page:selectedPage,pages,total:matches.length,updatedAt:Math.min(source.updatedAt,...results.map(r=>r.updatedAt||source.updatedAt)),stale,pollAfterMs:finished||(!stale&&!selected.length&&q)?0:stale||!selected.length?60000:POLL_MS});
  }catch(_){return reply({ok:false,code:'LIVE_SOURCE_UNAVAILABLE',message:'Live-Quelle nicht verfügbar. Bitte später erneut versuchen; die Quellenkonfiguration kann der Administrator prüfen.'},503);}
}

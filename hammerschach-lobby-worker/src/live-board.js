import {discoverPageEvents,resolvePageEvent} from './live-board-discovery-pages.js';
import {orderedEvents} from './live-board-classification.js';
import {discoverBroadcasts,resolveBroadcast,savedEvents,sourceFromLink,saveEvent,removeEvent} from './live-board-catalog.js';
import { sourceEvents, safeSourceUrl, parseLivePgn, demoGames, dgtPairings, dgtGame } from './live-board-sources.js';

const pending = new Map();
const memory = new Map();
const POLL_MS = 30000;
const SINGLE_INTERVALS = [5000,10000,15000,30000];
export function matchesPlayer(game,query){
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const words=normalize(query).split(/\s+/).filter(Boolean);
  return words.length>0&&[game.white,game.black].some(name=>words.every(word=>normalize(name).includes(word)));
}
const MAX_BYTES = 2 * 1024 * 1024;
const RETAIN_MS = 86400000;
// Bound the promise itself: abort alone does not settle a stalled cache/body read.
function deadline(promise,ms,onTimeout){
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
    reject(new Error('Zeitlimit der Live-Quelle überschritten.'));
    try{onTimeout?.();}catch(_){}
  },ms);});
  return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}

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
    if(!old&&edge){try{old=await deadline((async()=>{const hit=await edge.match(req);return hit?await hit.json():null;})(),options.cacheTimeoutMs||1500);}catch(_){}}
    if(old&&old.retryAt>now()&&(old.failed||old.value?.finished===true||now()-old.updatedAt<ttl)){
      if(old.value==null)throw new Error('Quelle vorübergehend nicht erreichbar.');
      return {value:old.value,updatedAt:old.updatedAt,stale:!!old.failed};
    }
    let entry;
    try{
      const value=await deadline(Promise.resolve().then(load),options.loadTimeoutMs||12000);
      const lifetime=(value.finished===true)?RETAIN_MS:ttl;
      entry={value,updatedAt:now(),retryAt:now()+lifetime,failed:false};
    }catch(error){
      entry={value:old&&now()-old.updatedAt<RETAIN_MS?old.value:null,updatedAt:old?.updatedAt||0,retryAt:now()+60000,failed:true};
    }
    remember(namespaced,entry);
    if(edge){try{await deadline(edge.put(req,new Response(JSON.stringify(entry),{headers:{'content-type':'application/json','cache-control':'public, max-age=86400'}})),options.cacheTimeoutMs||1500);}catch(_){}}
    if(entry.value==null)throw new Error('Quelle vorübergehend nicht erreichbar oder unvollständig.');
    return {value:entry.value,updatedAt:entry.updatedAt,stale:entry.failed};
  })();
  pending.set(namespaced,task);
  try{return await task;}finally{pending.delete(namespaced);}
}

const upstreamQueues=new WeakMap();
export async function fetchSource(url,fetcher=fetch,options={}){
  if(new URL(url).hostname!=='lichess.org')return readSource(url,fetcher,options);
  let queue=upstreamQueues.get(fetcher);
  if(!queue){queue={tail:Promise.resolve(),blockedUntil:0};upstreamQueues.set(fetcher,queue);}
  const task=deadline(queue.tail,options.queueTimeoutMs||9000).then(async()=>{
    if(Date.now()<queue.blockedUntil)throw Error('Lichess-Pause nach Abruflimit.');
    try{return await readSource(url,fetcher,options);}catch(error){if(error.rateLimited)queue.blockedUntil=Date.now()+60000;throw error;}
  });
  queue.tail=task.catch(()=>{});
  return task;
}
async function readSource(url, fetcher, options={}) {
  const controller=new AbortController();let reader=null,response=null;
  const cancel=()=>{controller.abort();try{const cancelled=reader?reader.cancel():response?.body?.cancel();cancelled?.catch(()=>{});}catch(_){}};
  return deadline((async()=>{
    try{
      // No incoming credentials and no cross-host redirect following.
      response=await fetcher(url,{redirect:'manual',signal:controller.signal,headers:{accept:options.accept||'application/x-chess-pgn, application/json, text/plain'}});
      if(controller.signal.aborted){cancel();throw Error('Abruf abgebrochen.');}
      if(response.status>=300&&response.status<400)throw new Error('Weiterleitungen der Live-Quelle sind nicht erlaubt.');
      if(!response.ok){const error=new Error('Quelle nicht erreichbar (HTTP '+response.status+').');error.rateLimited=response.status===429;throw error;}
      if(Number(response.headers.get('content-length'))>MAX_BYTES)throw new Error('Quelle zu groß.');
      reader=response.body.getReader();let bytes=0;const chunks=[];
      while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES)throw new Error('Quelle zu groß.');chunks.push(value);}
      const merged=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length;}
      return new TextDecoder().decode(merged);
    }finally{cancel();}
  })(),options.timeoutMs||9000,cancel);
}

async function eventSource(event, deps, interval=POLL_MS) {
  const source=event.source;
  const cached=(key,ttl,load)=>sharedLiveCache(key,ttl,load,deps);
  const read=url=>fetchSource(url,deps.fetcher);
  if(source.type==='demo')return {catalog:demoGames(),updatedAt:Date.now(),stale:false,board:async p=>({value:p,updatedAt:Date.now(),stale:false})};
  if(source.type==='pgn'||source.type==='lichess'){
    const round=await cached('pgn-headers-v2:'+source.url,interval,async()=>{
      const raw=await read(source.url);
      if(!raw.trim()&&(!event.automatic||event.ongoing||event.finished))throw Error('Unvollständige PGN-Quelle.');
      const games=raw.trim()?parseLivePgn(raw):[];
      return {games,finished:games.length>0&&games.every(g=>g.finished)};
    });
    return {catalog:round.value.games,updatedAt:round.updatedAt,stale:round.stale,board:async p=>({value:p,updatedAt:round.updatedAt,stale:round.stale})};
  }
  const id=source.tournamentId;
  const meta=await cached('dgt-host:'+id,300000,async()=>{
    const info=JSON.parse(await read(`https://lookup.livechesscloud.com/meta/${id}`));
    if(typeof info.host!=='string'||!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.livechesscloud\.com$/i.test(info.host))throw new Error('Unbekannter DGT-Datenhost.');
    return {base:safeSourceUrl(`https://${info.host}/get/${id}/`,[info.host.toLowerCase()])};
  });
  if(event.id?.startsWith('dg-')){
    const details=await cached('dgt-tournament:'+id,60000,async()=>{
      const data=JSON.parse(await read(meta.value.base+'tournament.json'));
      if(!Array.isArray(data.rounds)||!data.rounds.length||data.rounds.length>100)throw Error('Ungültige DGT-Rundenliste.');
      return {rounds:data.rounds.map(r=>({count:Number(r.count)||0,live:Number(r.live)||0}))};
    });
    let n=source.round;
    if(!n){const live=details.value.rounds.findIndex(r=>r.live>0);n=live>=0?live+1:Math.max(1,details.value.rounds.findLastIndex(r=>r.count>0)+1);}
    if(n>details.value.rounds.length)throw Error('DGT-Runde nicht gefunden.');
    const prefix=event.id.replace(/-\d+$/,'-');
    event.id=prefix+n;event.round=String(n);source.round=n;
    event.rounds=details.value.rounds.map((r,i)=>({id:prefix+(i+1),name:'Runde '+(i+1)}));
    event.catalogStale ||= details.stale;
  }
  const base=meta.value.base+`round-${source.round}/`;
  const index=await cached('dgt-index:'+base,60000,async()=>({games:dgtPairings(JSON.parse(await read(base+'index.json'))),finished:false}));
  if(event.id?.startsWith('dg-')){event.finished=!index.stale&&index.value.games.length>0&&index.value.games.every(g=>g.finished);event.status=event.finished?'finished':'unknown';}
  return {catalog:index.value.games,updatedAt:index.updatedAt,stale:meta.stale||index.stale,board:p=>cached('dgt-game:'+base+p.id,interval,async()=>dgtGame(JSON.parse(await read(base+`game-${p.id}.json`)),p))};
}
const publicEvent=({source,...e})=>({...e,sourceType:source.type,demo:source.type==='demo'});

export async function handleLiveBoardApi(request,env,url,helpers,deps={}) {
  if(!/^\/api\/live-board(?:\/|$)/.test(url.pathname))return null;
  const reply=(data,status=200)=>helpers.json(data,{status,headers:{'cache-control':'private, no-store, max-age=0','vary':'Authorization','x-content-type-options':'nosniff'}});
  // Authenticate before consulting either the catalog or any source/cache.
  let session;
  try{session=await deadline(helpers.lookupAuthSession(env,helpers.bearerTokenFromRequest(request)),deps.authTimeoutMs||8000);}
  catch(_){return reply({ok:false,code:'LIVE_AUTH_UNAVAILABLE',message:'Anmeldung derzeit nicht prüfbar. Bitte erneut aktualisieren.'},503);} 
  if(!session?.user)return reply({ok:false,code:'NOT_AUTHENTICATED',message:'LIVE-BOARD ist nur für angemeldete Mitglieder verfügbar.'},401);
  const canManage=String(session.user.username||'').trim().toLowerCase()==='andili';
  const method=request.method;
  if(!['GET','POST','DELETE'].includes(method))return reply({ok:false,message:'Methode nicht erlaubt.'},405);
  if(method!=='GET'&&url.pathname.startsWith('/api/live-board/sources')&&!canManage)return reply({ok:false,code:'LIVE_SOURCE_ADMIN_ONLY',message:'Nur der Administrator kann gemeinsame Übertragungen verwalten.'},403);
  try{
    const cached=(key,ttl,load)=>sharedLiveCache(key,ttl,load,deps);
    const read=address=>fetchSource(address,deps.fetcher);
    const readPage=address=>fetchSource(address,deps.fetcher,{timeoutMs:4000,accept:'text/html, application/xhtml+xml'});
    if(url.pathname==='/api/live-board/sources'&&method==='POST'){
      let event;
      try{
        if(!request.headers.get('content-type')?.includes('application/json'))throw Error('JSON-Daten erforderlich.');
        const reader=request.body?.getReader();if(!reader)throw Error('Quellenangaben fehlen.');
        let raw='',size=0;const decoder=new TextDecoder();
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096)throw Error('Quellenangaben zu lang.');raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}finally{await reader.cancel();}
        event=sourceFromLink(JSON.parse(raw),env);
      }catch(error){return reply({ok:false,message:error.message},400);}
      // Validate the actual public source before adding it to the shared catalog.
      await eventSource(event,deps);
      return reply({ok:true,event:publicEvent(await saveEvent(env,event))},201);
    }
    const removal=url.pathname.match(/^\/api\/live-board\/sources\/(saved-[a-f0-9]{32})$/);
    if(removal&&method==='DELETE'){await removeEvent(env,removal[1]);return reply({ok:true});}
    if(method!=='GET')return reply({ok:false,message:'Methode nicht erlaubt.'},405);
    const events=sourceEvents(env);
    const resolveEvent=async id=>events.find(e=>e.id===id)||(id.startsWith('saved-')?(await savedEvents(env)).find(e=>e.id===id):null)||(id.startsWith('dg-')?await resolvePageEvent(id,env,cached,readPage):null)||(env.LIVE_BOARD_DISCOVERY!=='0'?await resolveBroadcast(id,cached,read):null);
    if(url.pathname==='/api/live-board/players'){
      const ids=(url.searchParams.get('events')||'').split(',');
      const q=(url.searchParams.get('q')||'').trim();
      if(q.length<2||q.length>80||ids.length>3||!ids.length||ids.some(id=>!/^[-A-Za-z0-9_]{1,100}$/.test(id))||new Set(ids).size!==ids.length)return reply({ok:false,message:'Spielername (2–80 Zeichen) und höchstens drei Veranstaltungen erforderlich.'},400);
      const results=[];
      // Bounded sequential batches; pairing cache is shared across all names
      // and members. DGT search reads the index only, never individual games.
      for(const id of ids){
        try{
          const event=await resolveEvent(id);
          if(!event){results.push({id,unavailable:true});continue;}
          const pairings=await cached('player-pairings:'+id,60000,async()=>{
            const source=await eventSource(event,deps,60000);
            if(source.stale||event.catalogStale)throw Error('Veraltete Paarungen.');
            return {event:publicEvent(event),games:source.catalog.map(({id,board,label,white,black,result})=>({id,board,label,white,black,result}))};
          });
          const matches=pairings.value.games.filter(g=>matchesPlayer(g,q));
          results.push({id,event:pairings.value.event,matches:matches.slice(0,100),truncated:matches.length>100,stale:pairings.stale,updatedAt:pairings.updatedAt});
        }catch(_){results.push({id,unavailable:true});}
      }
      return reply({ok:true,results});
    }
    if(url.pathname==='/api/live-board/events'){
      let discoveryUnavailable=false,stale=false;
      // All three sources settle independently; a stalled provider must not
      // hide successful Lichess, publisher or saved-event results.
      const budget=deps.discoveryTimeoutMs||12000;
      const [saved,lichess,publishers]=await Promise.allSettled([
        deadline(savedEvents(env),deps.savedTimeoutMs||4000),
        deadline(env.LIVE_BOARD_DISCOVERY==='0'?Promise.resolve(null):discoverBroadcasts(cached,read),budget),
        deadline(discoverPageEvents(env,cached,readPage),budget)
      ]);
      const savedUnavailable=saved.status==='rejected';
      if(!savedUnavailable)events.push(...saved.value);
      if(lichess.status==='fulfilled'&&lichess.value){events.push(...lichess.value.value.events);stale ||= lichess.value.stale;}
      else if(lichess.status==='rejected')discoveryUnavailable=true;
      let publisherUnavailable=false;
      if(publishers.status==='fulfilled'){events.push(...publishers.value.events);stale ||= publishers.value.stale;publisherUnavailable=publishers.value.unavailable>0;}
      else publisherUnavailable=true;
      const category=url.searchParams.get('category');
      return reply({ok:true,events:orderedEvents(events).filter(e=>!category||e.category===category).map(publicEvent),stale,discoveryUnavailable,publisherUnavailable,savedUnavailable});
    }
    const match=url.pathname.match(/^\/api\/live-board\/events\/([A-Za-z0-9_-]+)\/boards$/);
    if(!match)return reply({ok:false,message:'Endpunkt nicht gefunden.'},404);
    const event=await resolveEvent(match[1]);
    if(!event)return reply({ok:false,message:'Veranstaltung nicht gefunden.'},404);
    const board=url.searchParams.get('board');
    const page=Number(url.searchParams.get('page')||1);
    const q=(url.searchParams.get('q')||'').trim().slice(0,80).toLocaleLowerCase('de');
    if(!Number.isInteger(page)||page<1||page>250||(board&&!/^\d{1,4}$/.test(board)))return reply({ok:false,message:'Ungültige Brettauswahl.'},400);
    const interval=board?(SINGLE_INTERVALS.includes(Number(url.searchParams.get('interval')))?Number(url.searchParams.get('interval')):10000):POLL_MS;
    const source=await eventSource(event,deps,interval);
    const matches=source.catalog.filter(p=>!q||(/^\d+$/.test(q) ? String(p.board)===q||p.label===q : matchesPlayer(p,q)));
    const pages=Math.max(1,Math.ceil(matches.length/4));
    const selectedPage=Math.min(page,pages);
    const selected=board?source.catalog.filter(p=>p.id===board):matches.slice((selectedPage-1)*4,selectedPage*4);
    if(board&&!selected.length)return reply({ok:false,message:'Brett nicht gefunden.'},404);
    // Partial DGT failures do not discard the other visible boards.
    const results=await Promise.all(selected.map(async p=>{
      try{return await source.board(p);}catch(_){return {value:{...p,error:'Brettdaten derzeit nicht verfügbar.',moves:null},stale:true,updatedAt:0};}
    }));
    const stale=!!event.catalogStale||source.stale||results.some(r=>r.stale);
    const games=results.map(r=>({...r.value,updatedAt:r.updatedAt,stale:r.stale}));
    const finished=!stale&&(event.finished||(games.length>0&&games.every(g=>g.finished)));
    return reply({ok:true,event:publicEvent(event),games,page:selectedPage,pages,total:matches.length,updatedAt:Math.min(source.updatedAt,...results.map(r=>r.updatedAt||source.updatedAt)),stale,pollAfterMs:finished||(!stale&&!selected.length&&q)?0:stale||!selected.length?60000:interval});
  }catch(error){return error.status===409?reply({ok:false,message:error.message},409):reply({ok:false,code:'LIVE_SOURCE_UNAVAILABLE',message:'Übertragung derzeit nicht erreichbar. Bitte später erneut versuchen.'},503);}
}

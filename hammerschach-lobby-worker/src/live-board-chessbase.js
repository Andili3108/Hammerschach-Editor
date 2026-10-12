import {classifyBroadcast} from './live-board-classification.js';
import {pageLinks} from './live-board-discovery-pages.js';

// Public HTML catalog and the PGN URL explicitly embedded in its Watch page.
// No guessed feed paths, credentials, arbitrary hosts or redirects.
const HOME='https://live.chessbase.com/en/';
const validSlug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,119}$/i.test(s);
export const chessbaseEnabled=env=>env.LIVE_BOARD_DISCOVERY!=='0'&&env.LIVE_BOARD_CHESSBASE_DISCOVERY!=='0';
export function chessbaseEvents(html){
  const events=[],seen=new Set();
  for(const heading of String(html).matchAll(/<h2\b[^>]*>([^]*?)<\/h2\s*>/gi)){
    for(const link of pageLinks(heading[1],HOME)){
      const u=new URL(link.url),slug=u.searchParams.get('id');
      if(u.origin!=='https://live.chessbase.com'||u.pathname.toLowerCase()!=='/en/watch'||!validSlug(slug)||!link.title)continue;
      const key=slug.toLowerCase();if(seen.has(key))continue;seen.add(key);
      // ChessBase abbreviates the German Bundesliga as BL in its catalog.
      if(/^(?:4NCL\b|Swiss-chT\b)/i.test(link.title))continue;
      const classification=/^BL\s+\d{4}[^,]*,\s*Germany$/i.test(link.title)?{category:'club',clubScope:'bundesliga'}:classifyBroadcast({name:link.title});if(!classification)continue;
      events.push({id:'cb-'+key,title:link.title,searchTitle:link.title.replace(/\bch\b/gi,'Championship'),...classification,automatic:true,status:'unknown',round:'',finished:false,
        publisher:'ChessBase',source:{type:'chessbase',slug:key}});
      if(events.length===40)return events;
    }
  }
  if(!events.length)throw Error('ChessBase-Veranstaltungsliste nicht lesbar.');
  return events;
}
export function discoverChessbase(cached,read){
  return cached('chessbase-catalog-v1',300000,async()=>({events:chessbaseEvents(await read(HOME))}));
}
export async function resolveChessbase(id,env,cached,read){
  if(!chessbaseEnabled(env)||!id.startsWith('cb-'))return null;
  const match=id.match(/^cb-(.+?)(?:_r(\d{1,3}))?$/);
  if(!match||!validSlug(match[1])||match[2]&&Number(match[2])<1)return null;
  const catalog=await discoverChessbase(cached,read);
  const found=catalog.value.events.find(e=>e.source.slug===match[1]);
  if(!found)return null;
  return {...found,id,source:{...found.source,round:match[2]?Number(match[2]):null},catalogStale:catalog.stale};
}
export function chessbasePage(html,slug){
  if(!validSlug(slug))throw Error('Ungültige ChessBase-Veranstaltung.');
  const clean=String(html).replace(/<!--[^]*?-->|<script\b[^]*?<\/script\s*>/gi,'');
  const raw=clean.match(/\bdata-url\s*=\s*["']([^"']+)["']/i)?.[1];
  if(!raw)throw Error('ChessBase-PGN-Link fehlt.');
  const u=new URL(raw);
  const path=u.pathname.match(/^\/pgn\/([a-z0-9-]+)\/(\d{1,3})\/0\/\.pgn$/i);
  if(u.protocol!=='https:'||u.hostname!=='liveserver.chessbase.com'||u.port!=='6009'||u.username||u.password||u.search||u.hash||!path||path[1].toLowerCase()!==slug.toLowerCase())throw Error('Unbekannter ChessBase-PGN-Link.');
  const rounds=new Set();
  for(const link of pageLinks(clean,HOME)){
    const r=new URL(link.url),n=Number(r.searchParams.get('rnd'));
    if(r.origin==='https://live.chessbase.com'&&/^\/(en|de)\/Replay$/i.test(r.pathname)&&r.searchParams.get('id')?.toLowerCase()===slug.toLowerCase()&&Number.isInteger(n)&&n>0&&n<=100)rounds.add(n);
  }
  const round=Number(path[2]);if(round>0&&round<=100)rounds.add(round);
  return {url:u.href,round,rounds:[...rounds].sort((a,b)=>a-b)};
}
export async function chessbaseFeed(source,cached,read){
  const round=source.round;
  const suffix=round?'Replay?id='+encodeURIComponent(source.slug)+'&rnd='+round+'&anno=False':'Watch?id='+encodeURIComponent(source.slug);
  const page=await cached('chessbase-page-v1:'+source.slug+':'+(round||'latest'),60000,async()=>chessbasePage(await read(HOME+suffix),source.slug));
  if(round&&page.value.round!==round)throw Error('ChessBase-Runde stimmt nicht überein.');
  return page;
}

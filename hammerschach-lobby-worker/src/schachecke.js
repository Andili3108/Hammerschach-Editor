// Small central news cache. No per-member upstream requests, no new binding.
export const CORNER_CRON = '0 */6 * * *';
const PERIOD=6*60*60*1000;
export const NEWS_SOURCES=[
  {id:'chessbase',name:'ChessBase',url:'https://de.chessbase.com/feed',type:'rss',host:'de.chessbase.com'},
  {id:'dsb',name:'Deutscher Schachbund',url:'https://www.schachbund.de/share/dsb-feed.xml',type:'rss',host:'schachbund.de'},
  {id:'perlen',name:'Perlen vom Bodensee',url:'https://perlenvombodensee.de/feed/',type:'rss',host:'perlenvombodensee.de'},
  {id:'oeschach',name:'Österreichischer Schachbund',url:'https://www.chess.at/',type:'austria',host:'chess.at'},
  {id:'swiss',name:'Schweizerischer Schachbund',url:'https://swisschess.ch/de/verband/medien/news',type:'swiss',host:'swisschess.ch'}
];
export function plain(value){
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',auml:'ä',ouml:'ö',uuml:'ü',Auml:'Ä',Ouml:'Ö',Uuml:'Ü',szlig:'ß',ndash:'–',mdash:'—',hellip:'…',laquo:'«',raquo:'»'};
  return String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]+|#\d+|\w+);/gi,(whole,key)=>{if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return entities[key]??whole;}).replace(/\s+/g,' ').trim();
}
function tag(block,name){return block.match(new RegExp('<'+name+'\\b[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'';}
function safeUrl(raw,source){try{if(!plain(raw))return null;const url=new URL(plain(raw),source.url);if(url.protocol!=='https:'||url.username||url.password||!(url.hostname===source.host||url.hostname==='www.'+source.host))return null;url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);return url.href;}catch(_){return null;}}
function item(source,title,url,date,now,dateOnly=false){
  const cleanTitle=plain(title),link=safeUrl(url,source),time=Date.parse(date);
  // Do not manufacture dates from fetch time or silently accept future articles.
  if(!cleanTitle||cleanTitle.length>500||!link||!Number.isFinite(time)||time>now+5*60000)return null;
  return {title:cleanTitle,url:link,source:source.name,sourceId:source.id,publishedAt:new Date(time).toISOString(),dateOnly};
}
export function parseFeed(xml,source,now=Date.now()){
  const entries=String(xml).match(/<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)>/gi)||[];
  return entries.slice(0,80).map(block=>{
    const link=tag(block,'link')||block.match(/<link\b(?=[^>]*(?:rel=["']alternate["']|href=))[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1];
    return item(source,tag(block,'title'),link,plain(tag(block,'pubDate')||tag(block,'published')||tag(block,'dc:date')||tag(block,'updated')),now);
  }).filter(Boolean);
}
export function parseSwiss(html,source,now=Date.now()){
  const result=[];
  for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*<article\b[^>]*>([\s\S]*?)<\/article>\s*<\/a>/gi)){
    const date=match[2].match(/>(\d{2})\.(\d{2})\.(\d{4})<\/span>/),title=match[2].match(/<span\b[^>]*class=["'][^"']*font-semibold[^"']*["'][^>]*>([\s\S]*?)<\/span>/)?.[1];
    if(!date)continue;const entry=item(source,title,match[1],`${date[3]}-${date[2]}-${date[1]}T00:00:00Z`,now,true);if(entry)result.push(entry);
  }
  return result;
}
export function austriaLinks(html,source){
  const links=[];
  for(const match of html.matchAll(/<h3\b[^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h3>/gi)){
    const url=safeUrl(match[1],source);if(url&&new URL(url).pathname.startsWith('/archiv-service/blog/')&&!links.some(l=>l.url===url))links.push({url,title:plain(match[2])});
  }
  return links.slice(0,6);
}
export function parseAustriaArticle(html,link,source,now=Date.now()){
  const time=html.match(/<time\b(?=[^>]*itemprop=["']datePublished["'])[^>]*datetime=["']([^"']+)["']/i)?.[1];
  return item(source,link.title,link.url,time,now);
}
async function fetchText(url,fetcher){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{
    const response=await fetcher(url,{signal:controller.signal,headers:{accept:'application/rss+xml, application/atom+xml, application/xml, text/html;q=0.8'}});
    if(!response.ok)throw Error('HTTP '+response.status);
    const reader=response.body.getReader();const chunks=[];let bytes=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1500000){await reader.cancel();throw Error('Quelle zu groß');}chunks.push(value);}}finally{reader.releaseLock();}
    const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(all);
  }finally{clearTimeout(timer);}
}
export async function collectNews(now=Date.now(),fetcher=fetch){
  const results=await Promise.allSettled(NEWS_SOURCES.map(async source=>{
    const body=await fetchText(source.url,fetcher);let entries;
    if(source.type==='rss')entries=parseFeed(body,source,now);
    else if(source.type==='swiss')entries=parseSwiss(body,source,now);
    else{
      const articles=await Promise.allSettled(austriaLinks(body,source).map(async link=>parseAustriaArticle(await fetchText(link.url,fetcher),link,source,now)));
      entries=articles.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
    }
    if(!entries.length)throw Error('Keine verwendbaren Meldungen');return entries.slice(0,30);
  }));
  const sources={},failed=[];results.forEach((r,i)=>{if(r.status==='fulfilled')sources[NEWS_SOURCES[i].id]=r.value;else failed.push(NEWS_SOURCES[i].id);});return {sources,failed};
}
export function selectNews(sources){
  const sorted=Object.values(sources).flat().sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.url.localeCompare(b.url));
  const urls=new Set(),titles=new Set(),unique=[];
  for(const entry of sorted){const title=entry.title.toLocaleLowerCase('de').replace(/[^\p{L}\p{N}]/gu,'');if(urls.has(entry.url)||titles.has(title))continue;urls.add(entry.url);titles.add(title);unique.push(entry);}
  // Allow a mix without quotas by country; fill remaining slots if few sources publish.
  const counts={},chosen=[],overflow=[];
  for(const entry of unique){if((counts[entry.sourceId]||0)>=3)overflow.push(entry);else{chosen.push(entry);counts[entry.sourceId]=(counts[entry.sourceId]||0)+1;}}
  return chosen.concat(overflow).slice(0,10).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.url.localeCompare(b.url));
}
async function ensure(env){
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS gamer_news_cache (id INTEGER PRIMARY KEY, payload TEXT, next_attempt INTEGER NOT NULL DEFAULT 0, lease TEXT)').run();
  await env.DB.prepare('INSERT OR IGNORE INTO gamer_news_cache (id) VALUES (1)').run();
}
function decode(row){try{return JSON.parse(row?.payload||'null');}catch(_){return null;}}
export async function refreshGamerNews(env,now=Date.now(),fetcher=fetch){
  await ensure(env);
  const row=await env.DB.prepare('SELECT payload, next_attempt FROM gamer_news_cache WHERE id = 1').first();
  const previous=decode(row);
  if(Number(row?.next_attempt)>now)return {...(previous||{}),nextCheckAt:row.next_attempt};
  const lease=crypto.randomUUID();
  const claimed=await env.DB.prepare('UPDATE gamer_news_cache SET next_attempt = ?, lease = ? WHERE id = 1 AND next_attempt <= ? RETURNING id').bind(now+120000,lease,now).first();
  if(!claimed)return {...(previous||{}),nextCheckAt:now+60000};
  const nextCheckAt=(Math.floor(now/PERIOD)+1)*PERIOD;
  try{
    const collected=await collectNews(now,fetcher);
    const sources={...(previous?.sources||{}),...collected.sources};
    const payload={sources,items:selectNews(sources),updatedAt:Object.keys(collected.sources).length?new Date(now).toISOString():previous?.updatedAt||null,failed:collected.failed,stale:collected.failed.length>0,nextCheckAt};
    await env.DB.prepare('UPDATE gamer_news_cache SET payload = ?, next_attempt = ?, lease = NULL WHERE id = 1 AND lease = ?').bind(JSON.stringify(payload),nextCheckAt,lease).run();return payload;
  }catch(error){await env.DB.prepare('UPDATE gamer_news_cache SET next_attempt = ?, lease = NULL WHERE id = 1 AND lease = ?').bind(nextCheckAt,lease).run();if(previous)return {...previous,stale:true,nextCheckAt};throw error;}
}
export async function handleSchacheckeApi(request,env,url,deps){
  if(!url.pathname.startsWith('/api/schachecke/'))return null;
  const reply=(data,status=200)=>deps.json(data,{status,headers:{'cache-control':'no-store'}});
  const session=await deps.lookupAuthSession(env,deps.bearerTokenFromRequest(request));
  if(!session)return reply({ok:false,message:'Bitte zuerst anmelden.'},401);
  const allowed=env.SCHACHECKE_MEMBERS_ENABLED==='1'||(deps.isAdminUser(session.user,env)&&String(session.user.username).toLowerCase()==='andili');
  if(request.method!=='GET')return reply({ok:false,message:'Methode nicht erlaubt.'},405);
  if(url.pathname==='/api/schachecke/access')return reply({ok:true,allowed});
  if(!allowed)return reply({ok:false,message:'Die Schachecke ist noch im Testbetrieb.'},403);
  if(url.pathname!=='/api/schachecke/ticker')return reply({ok:false,message:'Nicht gefunden.'},404);
  try{const data=await refreshGamerNews(env);return reply({ok:true,items:data.items||[],updatedAt:data.updatedAt||null,stale:!!data.stale,nextCheckAt:data.nextCheckAt});}
  catch(_){return reply({ok:false,message:'Der Gamer-Ticker ist vorübergehend nicht erreichbar.'},503);}
}

import {safeSourceUrl} from './live-board-sources.js';
import {clubScope,CLUB_SCOPES} from './live-board-classification.js';

// Editorially selected publication pages, not a claim that each currently
// broadcasts. No internet-wide crawl, cron, arbitrary user URL or JS execution.
export const DEFAULT_DISCOVERY_PAGES = [
  {id:'bundesliga',url:'https://www.schachbundesliga.de/',name:'Schachbundesliga',category:'club',clubScope:'bundesliga'},
  {id:'nrw',url:'https://schach-nrw.de/',name:'SBNRW',category:'mixed',clubScope:'nrw'},
  {id:'ruhr',url:'https://svr-schach.de/',name:'SVRuhrgebiet',category:'mixed',clubScope:'ruhrgebiet'},
  {id:'hamm',url:'https://bezirk.sbhamm.de/',name:'SBHamm',category:'mixed',clubScope:'hamm'},
  {id:'unna',url:'https://svunna.de/',name:'SV Unna',category:'mixed',clubScope:'hamm'},
  {id:'caissa',url:'https://www.caissahamm.de/',name:'Caissa Hamm',category:'mixed',clubScope:'hamm'},
  {id:'boenen',url:'https://www.sv49.de/',name:'SV Bönen',category:'mixed',clubScope:'hamm'},
  {id:'werne',url:'https://www.skwerne.de/',name:'SK Werne',category:'mixed',clubScope:'hamm'}
];
const UUID='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const dgtPattern=new RegExp('^[/#]*('+UUID+')(?:/(\\d{1,3}))?/?$','i');
export function discoveryPages(env) {
  if(env.LIVE_BOARD_PAGE_DISCOVERY==='0'||env.LIVE_BOARD_DISCOVERY==='0')return [];
  const pages=env.LIVE_BOARD_DISCOVERY_PAGES?JSON.parse(env.LIVE_BOARD_DISCOVERY_PAGES):DEFAULT_DISCOVERY_PAGES;
  if(!Array.isArray(pages)||pages.length>8)throw Error('Maximal acht Suchseiten.');
  const seen=new Set();
  return pages.map(p=>{
    if(!/^[a-z0-9]{1,16}$/.test(p.id)||seen.has(p.id)||!['club','tournament','mixed'].includes(p.category)||!p.name||p.category!=='tournament'&&![...CLUB_SCOPES,'own'].includes(p.clubScope))throw Error('Ungültige Suchseite.');
    seen.add(p.id);
    const url=safeSourceUrl(p.url,[new URL(p.url).hostname]);
    return {id:p.id,url,name:String(p.name).slice(0,100),category:p.category,clubScope:p.clubScope};
  });
}
function decode(value) {
  return String(value).replace(/&(?:amp|quot|apos|lt|gt|nbsp|#\d{1,7}|#x[0-9a-f]{1,6});/gi,s=>{
    const n=s.slice(1,-1).toLowerCase(),named={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
    if(named[n])return named[n];const cp=n[1]==='x'?parseInt(n.slice(2),16):Number(n.slice(1));return cp>0&&cp<=0x10ffff?String.fromCodePoint(cp):'';
  });
}
const plain=s=>decode(String(s).replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,160);
const attr=(tag,key)=>{const m=tag.match(new RegExp('(?:^|\\s)'+key+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'));return m?decode(m[1]??m[2]??m[3]):'';};
export function dgtLink(value,base) {
  try{
    const u=new URL(value,base);
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!['view.livechesscloud.com','www.livechesscloud.com','livechesscloud.com'].includes(u.hostname))return null;
    const m=(u.hash||u.pathname).match(dgtPattern);if(!m||m[2]&&(Number(m[2])<1||Number(m[2])>100))return null;
    return {tournamentId:m[1].toLowerCase(),round:Number(m[2]||0)};
  }catch(_){return null;}
}
export function pageLinks(html,pageUrl) {
  // Bounded publisher HTML only. Anchors and embeds, including lazy iframes.
  const clean=String(html).replace(/<!--[^]*?-->|<script\b[^]*?<\/script\s*>|<style\b[^]*?<\/style\s*>/gi,'');
  const links=[],headings=[];
  for(const m of clean.matchAll(/<h[1-4]\b[^>]*>([^]*?)<\/h[1-4]\s*>/gi))headings.push({at:m.index,title:plain(m[1])});
  for(const m of clean.matchAll(/<a\b[^>]*>[^]*?<\/a\s*>|<iframe\b[^>]*>/gi)){
    if(links.length>=600)break;
    const tag=m[0].slice(0,m[0].indexOf('>')+1),raw=attr(tag,'href')||attr(tag,'src')||attr(tag,'data-src');
    if(!raw)continue;
    try{
      const u=new URL(raw,pageUrl);const label=plain(m[0]),heading=headings.filter(h=>h.at<m.index).at(-1)?.title||'';
      // Generic labels use the nearest heading, never the whole page's text.
      const title=label&&!/^(hier|live|live-?partien|live-?ubertragung|live-?übertragung|übertragung|bretter|dgt|ansehen|link|weiter|click here|view games|live boards|live chess)$/i.test(label)?label:heading||label;
      links.push({url:u.href,title:plain(attr(tag,'title'))||title});
    }catch(_){}
  }
  return links;
}
function classifyLink(title,page) {
  const scope=clubScope(title);
  if(scope)return {category:'club',clubScope:scope};
  if(/\b(open|einzel\w*|individual|quick[ -]?round[ -]?robin|masters|invitational)\b/i.test(title))return {category:'tournament'};
  if(page.category==='tournament')return {category:'tournament'};
  // A mixed association homepage does not make every linked event team chess.
  if(page.category==='club'||/\b(\w*liga|\w*klasse|mannschaft\w*|team\w*|gegen|vs\.?)\b/i.test(title))return {category:'club',clubScope:page.clubScope};
  return null;
}
export async function discoverPage(page,cached,read) {
  return cached('publisher-dgt-v1:'+JSON.stringify(page),1800000,async()=>{
    const html=await read(page.url),links=pageLinks(html,page.url);
    const origin=new URL(page.url).origin;
    const more=[...new Set(links.filter(l=>{
      const u=new URL(l.url);
      if(u.username||u.password||u.port||u.protocol!=='https:')return false;
      return u.origin===origin&&u.href!==page.url&&!u.hash&&!/\.(pdf|jpg|png|zip)$/i.test(u.pathname)&&/live|[uü]bertragung|broadcast|dgt/i.test(l.title+' '+u.pathname);
    }).map(l=>l.url))].slice(0,1);
    let partial=false;
    for(const url of more){try{links.push(...pageLinks(await read(url),url));}catch(_){partial=true;}}
    const events=[],seen=new Set();
    for(const link of links){
      const dgt=dgtLink(link.url,page.url);if(!dgt||seen.has(dgt.tournamentId))continue;
      const classification=classifyLink(link.title,page);if(!classification)continue;
      seen.add(dgt.tournamentId);
      events.push({id:`dg-${page.id}-${dgt.tournamentId}-${dgt.round}`,title:link.title||page.name,...classification,
        round:dgt.round?String(dgt.round):'',automatic:true,status:'unknown',finished:false,
        publisher:page.name,source:{type:'dgt',...dgt}});
      if(events.length>=12)break;
    }
    return {events,partial};
  });
}
export async function discoverPageEvents(env,cached,read) {
  const pages=discoveryPages(env);
  const results=await Promise.allSettled(pages.map(page=>discoverPage(page,cached,read)));
  const events=[];let unavailable=0,stale=false;
  for(const r of results){if(r.status==='rejected'){unavailable++;continue;}events.push(...r.value.value.events);stale||=r.value.stale;unavailable+=r.value.value.partial?1:0;}
  return {events,unavailable,stale,checked:pages.length};
}
export async function resolvePageEvent(id,env,cached,read) {
  const match=id.match(new RegExp('^dg-([a-z0-9]{1,16})-('+UUID+')-(\\d{1,3})$'));
  if(!match||Number(match[3])>100)return null;
  const page=discoveryPages(env).find(p=>p.id===match[1]);if(!page)return null;
  const result=await discoverPage(page,cached,read);
  const found=result.value.events.find(e=>e.source.tournamentId===match[2]);
  return found?{...found,id,source:{...found.source,round:Number(match[3])},catalogStale:result.stale}:null;
}

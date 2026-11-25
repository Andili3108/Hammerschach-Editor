// Independent editorial board. Draft/published snapshots and optimistic revisions
// follow the club report pattern; attachments remain manually managed on GitHub.
export const ATTACHMENT_ROOT = 'https://hammerschach-gamer.webmaster-5bb.workers.dev/SchwarzesBrett/anhaenge/';
const GITHUB_ATTACHMENTS = 'https://raw.githubusercontent.com/Andili3108/Hammerschach-Editor/main/Gamer/SchwarzesBrett/anhaenge/';

async function verifyAttachment(name, fetchFile) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetchFile(GITHUB_ATTACHMENTS + encodeURIComponent(name), {
      method: 'GET', headers: {Range: 'bytes=0-4'}, redirect: 'manual', signal: controller.signal
    });
    if (![200, 206].includes(response.status)) {
      throw Error('Anhang nicht erreichbar: ' + name + ' (HTTP ' + response.status + ')');
    }
    if (!response.body || /text\/html/i.test(response.headers.get('content-type') || '')) {
      throw Error('GitHub liefert keine Anhangdatei: ' + name);
    }
    const reader = response.body.getReader();
    const prefix = new Uint8Array(5);
    let length = 0;
    try {
      while (length < prefix.length) {
        const {done, value} = await reader.read();
        if (done) break;
        const bytes = value.subarray(0, prefix.length - length);
        prefix.set(bytes, length);
        length += bytes.length;
      }
    } finally {
      reader.releaseLock();
    }
    if (!length || (/\.pdf$/i.test(name) && new TextDecoder().decode(prefix) !== '%PDF-')) {
      throw Error('Datei leer oder ungültiger PDF-Anfang: ' + name);
    }
  } finally {
    clearTimeout(timer);
    if (response?.body) await response.body.cancel().catch(() => {});
  }
}

const TYPES = {pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pgn:'application/x-chess-pgn',txt:'text/plain; charset=utf-8'};
const CATEGORIES = ['', 'Turniereinladung', 'Veranstaltung', 'Regionale Nachricht', 'Sonstiges'];
export function attachmentName(name) {
  if (typeof name !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} _().-]{0,149}$/u.test(name) || name.includes('..') || !TYPES[name.split('.').pop().toLowerCase()]) throw Error('Anhang: nur Dateinamen (PDF, PNG, JPG, WebP, PGN oder TXT), keine Pfade.');
  return name;
}
export function validateNotice(input) {
  const text = (value, max, required=false) => {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error('Bitte Titel, Beschreibung und Feldlängen prüfen.');
    return value.trim();
  };
  if (!input || !Array.isArray(input.files) || input.files.length > 10 || !Array.isArray(input.links) || input.links.length > 10) throw Error('Höchstens zehn Anhänge und zehn Links möglich.');
  const title=text(input.title,160,true), description=text(input.description,12000,true), category=text(input.category||'',40), expires=text(input.expires||'',10);
  if (!CATEGORIES.includes(category)) throw Error('Ungültige Kategorie.');
  if (expires && (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || !Number.isFinite(Date.parse(expires)) || new Date(expires).toISOString().slice(0,10)!==expires)) throw Error('Ungültiges Ablaufdatum.');
  const files=[...new Set(input.files.map(attachmentName))];
  const links=input.links.map(value => {
    const raw=text(value,2000,true); let url;
    try { url=new URL(raw); } catch { throw Error('Bitte vollständige HTTPS-Links eingeben.'); }
    if (url.protocol!=='https:' || url.username || url.password) throw Error('Nur HTTPS-Links ohne Zugangsdaten sind erlaubt.');
    return url.href;
  });
  const images = {};
  for (const [name, width] of Object.entries(input.images || {})) {
    if (!files.includes(name) || !/\.(png|jpe?g|webp)$/i.test(name) || ![25,50,75,100].includes(width)) {
      throw Error('Bitte Bildanhang und Bildbreite prüfen.');
    }
    images[name] = width;
  }
  function target(value, allowPdf) {
    if (!value) return '';
    if (allowPdf && files.includes(value) && /\.pdf$/i.test(value)) return value;
    const index = input.links.indexOf(value);
    if (index < 0) throw Error('Das Schaltflächenziel fehlt in den Anhängen oder Links.');
    return links[index];
  }
  const invitation = target(input.invitation, true);
  const tournament = target(input.tournament, false);
  if (invitation && invitation === tournament) throw Error('Bitte für die beiden Schaltflächen unterschiedliche Ziele wählen.');
  const organizer = text(input.organizer ?? '',160);
  const fontSize=value=>{
    const size=value??'standard';
    if(!['small','standard','large','xl'].includes(size))throw Error('Ungültige Schriftgröße.');
    return size;
  };
  const titleSize=fontSize(input.titleSize), bodySize=fontSize(input.bodySize);
  const headerImage=input.headerImage??'', headerWidth=input.headerWidth??25;
  if(headerImage && (!files.includes(headerImage) || !/\.(png|jpe?g|webp)$/i.test(headerImage)))throw Error('Bitte ein Bild aus den Anhängen auswählen.');
  if(![25,50,75,100].includes(headerWidth))throw Error('Ungültige Breite für das Bild über dem Titel.');
  const trimOffset=input.description.length-input.description.trimStart().length;
  const ranges=input.boldRanges??[],boldRanges=[];
  if(!Array.isArray(ranges))throw Error('Ungültige Textformatierung.');
  let previousEnd=0;
  for(const pair of ranges){
    if(!Array.isArray(pair)||pair.length!==2)throw Error('Ungültige Textmarkierung.');
    const [start,end]=pair;
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<previousEnd||end<=start||end>input.description.length)throw Error('Ungültiger Textbereich.');
    const a=Math.max(0,start-trimOffset),b=Math.min(description.length,end-trimOffset);
    if(a<b)boldRanges.push([a,b]);
    previousEnd=end;
  }
  return {titleSize,bodySize,headerImage,headerWidth,boldRanges,title,description,organizer,category,expires,files,links,images,invitation,tournament};
}
export const berlinDate = now => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export const isCurrent = (notice,now) => !notice.expires || notice.expires >= berlinDate(now);
export async function handleNoticeBoard(request, env, deps) {
  const url=new URL(request.url), base='/api/notice-board';
  const reply=(body,status=200)=>deps.json(body,{status,headers:{'cache-control':'no-store'}});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'authorization, content-type'}});
  if(url.pathname.startsWith(base+'/files/')) {
    if(request.method!=='GET')return reply({ok:false},405);
    let name;try{name=attachmentName(decodeURIComponent(url.pathname.slice((base+'/files/').length)));}catch{return reply({ok:false},400);}
    return Response.redirect(ATTACHMENT_ROOT + encodeURIComponent(name), 302);
  }
  if(url.pathname!==base)return reply({ok:false},404);
  if(!['GET','POST'].includes(request.method))return reply({ok:false},405);
  const adminView=url.searchParams.get('manage')==='1' || request.method==='POST';
  let manager=false;
  if(adminView){
    const session=await deps.session(request),user=session?.user;
    manager=!!user && deps.isAdmin(user) && String(user.username||'').toLowerCase()==='andili' && !user.disabled && !user.deleted_at;
    if(!manager)return reply({ok:false,message:'Nur Andili darf das Schwarze Brett verwalten.'},user?403:401);
  }
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS notice_board (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, draft TEXT, published TEXT, published_at TEXT)').run();
  const now=deps.now?.() ?? Date.now();
  if(request.method==='POST') {
    try {
      const raw=await request.text();if(raw.length>50000)throw Error('Meldung zu groß.');
      const body=JSON.parse(raw);
      if(!['draft','publish','hide','delete'].includes(body.action) || !Number.isSafeInteger(body.revision) || body.revision<0)throw Error('Ungültige Aktion.');
      const id=body.id||crypto.randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw Error('Ungültige Kennung.');
      const row=await env.DB.prepare('SELECT * FROM notice_board WHERE id=?').bind(id).first();
      if((row?.revision||0)!==body.revision)return reply({ok:false,message:'Die Meldung wurde inzwischen geändert. Bitte Übersicht neu laden; deine Eingaben wurden nicht überschrieben.'},409);
      let draft=row?.draft||null,published=row?.published||null,publishedAt=row?.published_at||null;
      if(body.action==='delete') {if(!row?.draft || body.confirmation!=='MELDUNG LÖSCHEN')throw Error('Löschbestätigung fehlt.');draft=null;published=null;}
      else if(body.action==='hide') {if(!row?.draft)throw Error('Meldung nicht gefunden.');published=null;}
      else {
        const notice=validateNotice(body.notice);draft=JSON.stringify(notice);
        if(body.action==='publish') {
          if(body.approved!==true)throw Error('Bitte die Freigabe der Texte und Anhänge bestätigen.');
          if(!isCurrent(notice,now))throw Error('Das Ablaufdatum liegt in der Vergangenheit.');
          for(const name of notice.files) {
            await verifyAttachment(name, deps.fetch || fetch);
          }
          published=draft;publishedAt=publishedAt||new Date(now).toISOString();
        }
      }
      // Tombstones preserve revisions so a stale editor cannot resurrect a deleted item.
      const result=row
        ? await env.DB.prepare('UPDATE notice_board SET draft=?,published=?,published_at=?,revision=revision+1 WHERE id=? AND revision=?').bind(draft,published,publishedAt,id,body.revision).run()
        : await env.DB.prepare('INSERT OR IGNORE INTO notice_board (id,revision,draft,published,published_at) VALUES (?,1,?,?,?)').bind(id,draft,published,publishedAt).run();
      if(result.meta?.changes!==1)return reply({ok:false,message:'Die Meldung wurde inzwischen geändert. Bitte neu laden.'},409);
      return reply({ok:true,id});
    } catch(error) {return reply({ok:false,message:error.message},400);}
  }
  const rows=await env.DB.prepare('SELECT * FROM notice_board').all();
  const items=(rows.results||[]).flatMap(row=>{
    const doc=manager?row.draft:row.published;if(!doc)return [];
    const notice=JSON.parse(doc);if(!manager&&!isCurrent(notice,now))return [];
    const published=row.published?JSON.parse(row.published):null;
    return [{id:row.id,...notice,publishedAt:row.published_at,isNew:!!row.published_at&&now-Date.parse(row.published_at)>=0&&now-Date.parse(row.published_at)<7*86400000,
      ...(manager?{revision:row.revision,status:!published?(row.published_at?'Ausgeblendet':'Entwurf'):!isCurrent(published,now)?'Abgelaufen':row.draft!==row.published?'Unveröffentlichte Änderungen':'Veröffentlicht'}:{})}];
  }).sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||'')||a.id.localeCompare(b.id));
  return reply({ok:true,items,canManage:manager,serverNow:now});
}

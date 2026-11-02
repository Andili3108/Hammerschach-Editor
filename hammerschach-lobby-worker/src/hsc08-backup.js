import {swissStandings,validateSwissRound} from './hsc08-swiss.js';
import {pairRoundRobin,RESULTS,standings} from './hsc08-round-robin.js';
import {readerTournament} from './hsc08-reader.js';
import {hsc08Logo} from './hsc08-logo.js';
export const makeBackup=state=>({format:'HSC08-Turniersicherung',version:1,sourceRevision:state.revision,draft:state.tournament,view:state.publishedTournament});
export async function backupDigest(backup){const bytes=new TextEncoder().encode(JSON.stringify(backup));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function restoreBackup(input,validate){
 if(!input || input.format!=='HSC08-Turniersicherung'||input.version!==1)throw Error('Keine unterstützte HSC08-Sicherung.');
 function tournament(raw){
  if(raw===null)return null;
  const t=validate(raw);
  if(!['draft','prepared','running','completed'].includes(raw.phase))throw Error('Ungültiger Turnierstatus.');
  if(raw.phase!=='draft'){
   if(t.mode==='swiss'){
    if(!Array.isArray(raw.schedule)||!raw.schedule.length||!['prepared','running'].includes(raw.phase))throw Error('Ungültiger Schweizer Spielstand.');
    const first=raw.schedule[0],ids=t.participants.map(p=>p.id);
    if(!Array.isArray(first.seeds)||first.seeds.length!==ids.length||new Set(first.seeds).size!==ids.length||!ids.every(id=>first.seeds.includes(id))||typeof first.flip!=='boolean')throw Error('Ungültige Startliste.');
    t.schedule=[];
    for(const r of raw.schedule){
      const clean={number:r.number,start:r.start,end:r.end,pending:r.pending,bye:r.bye,games:r.games.map(({id,white,black,result})=>({id,white,black,result})),...(r.number===1?{seeds:first.seeds,flip:first.flip}:{})};
      validateSwissRound(t,clean,t.schedule,true);t.schedule.push(clean);
    }
    if((raw.phase==='prepared')!==first.pending)throw Error('Ungültige Freigabe.');
    t.phase=raw.phase;t.hasEverResults=raw.hasEverResults===true||t.schedule.some(r=>!r.pending&&(r.bye||r.games.some(g=>g.result)));
   }else{
   if(t.mode!=='round-robin')throw Error('Diese Turnierart kann noch nicht wiederhergestellt werden.');
   const expected=pairRoundRobin(t.participants.map(p=>p.id),t.cycles);
   if(!Array.isArray(raw.schedule)||raw.schedule.length!==expected.length)throw Error('Unvollständiger Paarungsplan.');
   let hasResults=false;
   for(let i=0;i<expected.length;i++){
    const r=raw.schedule[i],e=expected[i];if(r.number!==e.number||r.bye!==e.bye||!Array.isArray(r.games)||r.games.length!==e.games.length)throw Error('Ungültiger Paarungsplan.');
    for(let j=0;j<e.games.length;j++){const g=r.games[j],x=e.games[j];if(g.id!==x.id||g.white!==x.white||g.black!==x.black||!(g.result===null||Object.hasOwn(RESULTS,g.result)))throw Error('Ungültige Partie.');x.result=g.result;hasResults ||=g.result!==null;}
   }
   if(raw.phase==='prepared'&&hasResults)throw Error('Ein Paarungsentwurf darf keine Ergebnisse enthalten.');
   if(raw.phase==='completed'&&expected.some(r=>r.games.some(g=>!g.result)))throw Error('Abgeschlossenes Turnier enthält offene Partien.');
   t.schedule=expected;t.phase=raw.phase;t.hasEverResults=raw.hasEverResults===true||hasResults;
   }
  }else if(raw.schedule || raw.hasEverResults)throw Error('Widersprüchliche Turnierdaten.');
  if(raw.audit!==undefined){if(!Array.isArray(raw.audit)||raw.audit.length>50000)throw Error('Ungültiges Protokoll.');t.audit=raw.audit.map(e=>{
   if(!e || typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))||typeof e.actor!=='string'||e.actor.length>100||!['prepare','discard-plan','release','result','complete','reopen','restore'].includes(e.action))throw Error('Ungültiger Protokolleintrag.');
   const out={at:e.at,actor:e.actor,action:e.action};for(const k of ['gameId','old','value','reason'])if(e[k]!==undefined){if(e[k]!==null&&(typeof e[k]!=='string'||e[k].length>500))throw Error('Ungültiger Protokollwert.');out[k]=e[k];}return out;
  });}
  if(t.schedule){if(t.audit?.some(e=>e.action==='result'&&(e.old!==null||e.value!==null)))t.hasEverResults=true;t.ranking=t.mode==='swiss'?swissStandings(t):standings(t);}return t;
 }
 const draft=tournament(input.draft),view=tournament(input.view);
 if(!draft && !view)throw Error('Die Sicherung enthält kein Turnier.');
 if(!draft)throw Error('Der gespeicherte Entwurf fehlt.');
 if(draft.schedule || view?.schedule){
  if(JSON.stringify(draft.schedule)!==JSON.stringify(view?.schedule)||draft.phase!==view?.phase||draft.scoring!==view?.scoring)throw Error('Entwurf und Ansicht enthalten unterschiedliche Spielstände.');
  const locked=draft.hasEverResults||view.hasEverResults;draft.hasEverResults=locked;view.hasEverResults=locked;
 }
 return {draft,view};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
export function exportHtml(raw){
 const t=readerTournament(raw);const title=t?.title||'Vereinsmeisterschaft';const names=new Map((t?.participants||[]).map(p=>[p.id,p.name]));
 const section=(title,body,color)=>'<section style="background:'+color+'"><h2>'+title+'</h2>'+body+'</section>';
 const rich=(t?.descriptionRich||[{text:t?.description||''}]).map(r=>r.table?table(r.table[0],r.table.slice(1)):'<span style="font-size:'+([14,18,24,30].includes(r.size)?r.size:18)+'px;font-weight:'+(r.bold?'bold':'normal')+';font-style:'+(r.italic?'italic':'normal')+'">'+esc(r.text)+'</span>').join('');
 let content='';
 if(t){content+=section('Turnierinformationen',table(['Angabe','Wert'],[['Modus',t.mode==='swiss'?'Schweizer System':'Rundenturnier'],['Punktewertung',t.scoring==='three-point'?'3–1–0':'1–½–0'],[t.mode==='swiss'?'Runden':'Durchgänge',t.mode==='swiss'?t.rounds:t.cycles],['Beginn',t.startsOn],['Spätester Spieltermin',t.endsOn],['Bedenkzeit',t.timeControl]]),'#fff1c2');}
 if(t?.ranking)content+=section('Rangliste',table(['Platz','Name','Gespielt','Punkte',...(t.mode==='swiss'?[]:['SB'])],t.ranking.map(r=>[r.rank,names.get(r.id),r.played,r.points,...(t.mode==='swiss'?[]:[r.sb])])),'#fff1c2');
 const labels={'1-0':'1–0','0-1':'0–1','1/2-1/2':'½–½','+/-':'+ / − (kampflos)','-/+':'− / + (kampflos)','-/-':'− / −'};
 content+=section('Runden und Paarungen',(t?.schedule||[]).slice().reverse().map(r=>'<h3>Runde '+r.number+(r.start?' · '+esc(r.start)+' – '+esc(r.end):'')+'</h3>'+table(['Weiß','Schwarz','Ergebnis'],r.games.map(g=>[names.get(g.white),names.get(g.black),labels[g.result]||'Offen']))+(r.bye?'<p>'+esc(names.get(r.bye))+(t.mode==='swiss'?' · Freilos · '+(t.scoring==='three-point'?'3 Punkte':'1 Punkt'):' · spielfrei')+'</p>':'')).join('')||'<p>Noch keine Runden freigegeben.</p>','#e5edf4');
 if(!t?.schedule)content+=section('Teilnehmer',table(['Name','Spielstärke'],(t?.participants||[]).map(p=>[p.name,p.dwz?'DWZ '+p.dwz:p.estimatedRating?'Schätzung '+p.estimatedRating:''])),'#e5eee2');
 content+=section('Ausschreibung','<div class="description">'+rich+'</div>','#f2e5e3');
 return '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HSC08 · '+esc(title)+'</title><style>body{margin:0;background:#e8e4dc;color:#292929;font-family:Georgia,serif;line-height:1.5}main{max-width:1100px;margin:auto;padding:20px}header,section{padding:20px;border-radius:16px;margin-bottom:20px;border:1px solid #c8c1b5}header{display:flex;gap:20px;align-items:center;background:#f2eee6}header img{width:100px}h1{font-size:clamp(22px,4vw,32px)}table{width:100%;border-collapse:collapse}th,td{border:1px solid #b8b1a5;padding:8px;text-align:left;overflow-wrap:anywhere}th{background:#ffffff88}.table-wrap{overflow-x:auto}.description{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:560px){main{padding:10px}section,header{padding:12px}header img{width:64px}}@media print{body{background:white}section{break-inside:avoid}}</style><main><header><img alt="HSC08" src="'+hsc08Logo+'"><h1>'+esc(title)+'</h1></header><p>Gespeicherter Stand vom '+esc(new Date().toLocaleString('de-DE',{timeZone:'Europe/Berlin'}))+'. Diese Datei aktualisiert sich nicht automatisch.</p>'+content+'<footer>HSC08 · Turnierexport</footer></main></html>';
}

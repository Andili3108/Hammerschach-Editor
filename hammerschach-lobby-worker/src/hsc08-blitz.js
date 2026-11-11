import {transition,standings,effectiveRoundRobinGames,score} from './hsc08-round-robin.js';
export const defaultScale=[25,18,15,12,10,8,6,4,2,1];
export function eveningRanking(t){
 const rows=standings(t),games=effectiveRoundRobinGames(t).filter(g=>!g.excluded),groups=[];
 for(const row of rows.filter(r=>!r.excluded).sort((a,b)=>b.points-a.points)){let group=groups.at(-1);if(!group||group[0].points!==row.points)groups.push(group=[]);group.push(row);}
 let rank=1;return groups.flatMap(group=>{
  const ids=new Set(group.map(r=>r.id)),meet=games.filter(g=>ids.has(g.white)&&ids.has(g.black)),complete=meet.every(g=>g.result);
  for(const row of group)row.dv=complete?meet.reduce((sum,g)=>sum+(g.white===row.id?(score(g.result,'classic')?.[0]||0):g.black===row.id?(score(g.result,'classic')?.[1]||0):0),0):0;
  group.sort((a,b)=>b.dv-a.dv||b.sb-a.sb);let previous=null,position=rank;
  for(const row of group){if(!previous||row.dv!==previous.dv||row.sb!==previous.sb)position=rank;row.rank=position;rank++;previous=row;}return group;
 }).concat(rows.filter(r=>r.excluded));
}
export function seasonRanking(s){
 const evenings=s.evenings.filter(e=>e.tournament?.phase==='completed');
 const rows=s.players.map(p=>{
  const values=evenings.map(e=>{const rows=eveningRanking(e.tournament),row=rows.find(r=>r.id===p.id);let value=0;if(row&&!row.excluded){const count=rows.filter(r=>r.rank===row.rank).length;for(let i=0;i<count;i++)value+=(s.scale[row.rank-1+i]||0)/count;}return {eveningId:e.id,value,dropped:false};});
  [...values].sort((a,b)=>a.value-b.value).slice(0,Math.min(s.drops,values.length)).forEach(v=>v.dropped=true);
  return {...p,values,total:values.reduce((n,v)=>n+v.value,0),counted:values.reduce((n,v)=>n+(v.dropped?0:v.value),0)};
 }).sort((a,b)=>b.counted-a.counted);
 let previous=null;rows.forEach((r,i)=>{r.rank=previous&&Math.abs(r.counted-previous.counted)<1e-9?previous.rank:i+1;previous=r;});return rows;
}
const text=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw Error('Bitte die Angaben vollständig ausfüllen.');return v.trim();};
function date(v){if(v===''||v==null)return '';if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error('Ungültiges Datum.');return v;}
export function blitzTransition(old,b,actor){
 let s=structuredClone(old||{title:'Vereinsblitzen',phase:'running',drops:0,scale:defaultScale,players:[],evenings:Array.from({length:10},(_,i)=>({id:'abend-'+(i+1),date:'',cancelled:false})),audit:[],locked:false});
 if(b.action==='reopen-season'){if(s.phase!=='completed')throw Error('Die Saison ist nicht abgeschlossen.');s.phase='running';}
 else {
 if(s.phase==='completed')throw Error('Bitte die Saison zuerst für Korrekturen öffnen.');
 if(b.action==='config'){
  const title=text(b.title,160),drops=b.drops,scale=b.scale;
  if(!Number.isInteger(drops)||drops<0||drops>9||!Array.isArray(scale)||scale.length!==10||scale.some((v,i)=>!Number.isFinite(v)||v<0||v>1000||(i&&v>scale[i-1])))throw Error('Bitte 0–9 Streichungen und eine absteigende Punktestaffel angeben.');
  if(s.locked&&(drops!==s.drops||JSON.stringify(scale)!==JSON.stringify(s.scale)))throw Error('Die Saisonwertung ist seit dem ersten Start gesperrt.');
  if(!Array.isArray(b.dates)||b.dates.length!==10)throw Error('Zehn Terminfelder erforderlich.');
  s.title=title;s.drops=drops;s.scale=scale;s.evenings.forEach((e,i)=>{const d=date(b.dates[i]);if(e.tournament&&d!==e.date)throw Error('Gestartete Abende behalten ihr Datum.');e.date=d;});
 }else if(b.action==='player'){
  const name=text(b.name,100);if(b.id){const p=s.players.find(p=>p.id===b.id);if(!p)throw Error('Teilnehmer fehlt.');p.name=name;for(const e of s.evenings){const q=e.tournament?.participants.find(q=>q.id===b.id);if(q)q.name=name;}}
  else {if(s.players.length>=200)throw Error('Maximal 200 Teilnehmer.');s.players.push({id:crypto.randomUUID(),name});}
 }else if(b.action==='complete-season'){
  if(!s.evenings.some(e=>e.tournament?.phase==='completed')||s.evenings.some(e=>e.tournament&&e.tournament.phase!=='completed'))throw Error('Bitte alle gestarteten Abende abschließen.');
  s.phase='completed';s.evenings.filter(e=>!e.tournament).forEach(e=>e.cancelled=true);
 }else{
  const e=s.evenings.find(e=>e.id===b.eveningId);if(!e)throw Error('Blitzabend fehlt.');
  if(b.action==='start'){
   if(e.tournament||!e.date||![1,2].includes(b.cycles)||!Array.isArray(b.ids)||b.ids.length<2||new Set(b.ids).size!==b.ids.length||b.ids.some(id=>!s.players.some(p=>p.id===id)))throw Error('Datum, Teilnehmer und Durchgänge prüfen.');
   const t={title:s.title,mode:'round-robin',phase:'draft',participants:b.ids.map(id=>({...s.players.find(p=>p.id===id)})),cycles:b.cycles,scoring:'classic',startsOn:e.date,endsOn:e.date,timeControl:text(b.timeControl,300)};
   e.tournament=transition(transition(t,{action:'prepare'},actor),{action:'release'},actor);e.cancelled=false;s.locked=true;
  }else if(['result','withdraw','rejoin','complete','reopen'].includes(b.action)){
   e.tournament=transition(e.tournament,b,actor);
  }else throw Error('Unbekannte Aktion.');
 }
 }
 s.audit.push({at:new Date().toISOString(),actor,action:b.action,eveningId:b.eveningId||null});return s;
}
export function blitzView(s,manager){if(!s)return null;const v=structuredClone(s);v.ranking=seasonRanking(s);for(const e of v.evenings)if(e.tournament){e.tournament.ranking=eveningRanking(e.tournament);if(!manager){delete e.tournament.audit;delete e.tournament.hasEverResults;}}if(!manager)delete v.audit;return v;}
export async function handleBlitz(request,env,respond,manager,actor){
 if(!['GET','POST'].includes(request.method)||(!manager&&request.method!=='GET'))return respond({ok:false,message:'Nicht verfügbar.'},404);
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS hsc08_blitz (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, document TEXT)').run();
 await env.DB.prepare('INSERT OR IGNORE INTO hsc08_blitz (id,revision) VALUES (1,0)').run();
 const row=await env.DB.prepare('SELECT revision,document FROM hsc08_blitz WHERE id=1').first();let s=row.document?JSON.parse(row.document):null;
 if(request.method==='POST')try{
  const raw=await request.text();if(raw.length>200000)throw Error('Eingabe zu groß.');const b=JSON.parse(raw);
  if(b.revision!==row.revision)return respond({ok:false,message:'Stand inzwischen geändert. Bitte neu laden.'},409);
  s=blitzTransition(s,b,actor);
  const changed=await env.DB.prepare('UPDATE hsc08_blitz SET document=?,revision=revision+1 WHERE id=1 AND revision=?').bind(JSON.stringify(s),row.revision).run();
  if(changed.meta?.changes!==1)return respond({ok:false,message:'Stand inzwischen geändert. Bitte neu laden.'},409);row.revision++;
 }catch(e){return respond({ok:false,message:e.message},400);}
 return respond({ok:true,revision:row.revision,season:blitzView(s,manager),canManage:manager});
}

const paragraph=text=>({kind:'p',runs:[{text,bold:false,italic:false}]});
export const firstReport={title:'Überraschungssieg gegen Werne 1',date:'2026-11-08',summary:'Trotz personeller Engpässe und eines unbesetzten Brettes gelang dem „Verein“ ein überraschender Mannschaftssieg gegen Werne 1.',author:'Nach einem Bericht von Thomas Flügel.',leagueId:'',files:[],blocks:[
'Trotz personeller Engpässe und eines unbesetzten Brettes gelang dem „Verein“ ein überraschender Mannschaftssieg gegen Werne 1.',
'Jochen sorgte für einen schnellen Erfolg: Bereits nach etwa 20 Minuten gewann er eine Figur und entschied wenig später auch die Partie für sich. Thomas Flügels Begegnung endete nach zahlreichen Figurenabtauschen remis. Ruben überzeugte als Ersatzspieler am achten Brett mit einem Sieg. David erreichte nach Schwierigkeiten in der Eröffnung ebenfalls ein Remis.',
'Am zweiten Brett setzte Joe seinen Gegner mit Fesselungen und Figurenopfern unter Druck und steuerte einen weiteren Sieg bei. Tim musste sich am Spitzenbrett nach langem Widerstand geschlagen geben. Konstantins Erfolg sicherte schließlich den Mannschaftssieg.',
'Das siebte Brett blieb unbesetzt, weil Joachim nicht rechtzeitig von seiner Reise zurückkehren konnte.',
'Damit gelang dem „Verein“ trotz der schwierigen Ausgangslage ein bemerkenswerter Mannschaftserfolg.'
].map(paragraph)};
function text(v,max,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error('Bitte Textfelder und Zeichenlängen prüfen.');return v.trim();}
export function validateReport(x){
 if(!x||!Array.isArray(x.blocks)||x.blocks.length>200||!Array.isArray(x.files)||x.files.length>4)throw Error('Ungültiger Bericht.');
 const date=text(x.date,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Bitte ein gültiges Berichtsdatum eingeben.');
 let length=0;const blocks=x.blocks.map(b=>{if(!['p','h3'].includes(b.kind)||!Array.isArray(b.runs)||b.runs.length>500)throw Error('Ungültige Formatierung.');return {kind:b.kind,runs:b.runs.map(r=>{if(typeof r.text!=='string'||typeof r.bold!=='boolean'||typeof r.italic!=='boolean')throw Error('Ungültiger Text.');length+=r.text.length;return {text:r.text,bold:r.bold,italic:r.italic};})};});
 if(!length||length>30000)throw Error('Berichtstext: 1 bis 30.000 Zeichen.');
 let bytes=0;const files=x.files.map(f=>{const name=text(f.name,120,true),mime=f.mime,data=f.data;if(!['image/jpeg','image/png','image/webp','application/pdf','application/x-chess-pgn'].includes(mime)||typeof data!=='string'||data.length>700000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('Erlaubt sind JPG, PNG, WebP, PDF und PGN.');let raw;try{raw=atob(data);}catch{throw Error('Datei ist beschädigt.');}bytes+=raw.length;
 const valid=mime==='image/jpeg'?raw.startsWith('\xff\xd8\xff'):mime==='image/png'?raw.startsWith('\x89PNG\r\n\x1a\n'):mime==='image/webp'?raw.startsWith('RIFF')&&raw.slice(8,12)==='WEBP':mime==='application/pdf'?raw.startsWith('%PDF-'):!raw.includes('\0')&&raw.trimStart().startsWith('[');
 if(!valid)throw Error('Dateiformat stimmt nicht mit dem Inhalt überein.');return {name,mime,data};});if(bytes>500000)throw Error('Dateien zusammen höchstens 500 KB. Fotos werden beim Einfügen verkleinert.');
 return {title:text(x.title,160,true),summary:text(x.summary,400,true),author:text(x.author,200),date,leagueId:text(x.leagueId||'',100),blocks,files};
}
// Ältere Berichte können die frühere Bezeichnung in ihren Textfeldern enthalten.
function readReport(document) {
  const report = JSON.parse(document);
  const rename = value => value.replace(/(?:„HSC08“|"HSC08"|\bHSC08\b)/g, '„Verein“');
  for (const field of ['title', 'summary', 'author']) report[field] = rename(report[field]);
  for (const block of report.blocks) {
    for (const run of block.runs) run.text = rename(run.text);
  }
  return report;
}
async function targets(env){const exists=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='league_standings_sources'").first();if(!exists)return [];const result=await env.DB.prepare('SELECT id,title FROM league_standings_sources WHERE enabled=1 ORDER BY sort_order').all();return result.results||[];}
export async function handleReports(request,env,respond,manager){
 if(!['GET','POST'].includes(request.method)||(!manager&&request.method!=='GET'))return respond({ok:false,message:'Nicht verfügbar.'},404);
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS hsc08_reports (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, draft TEXT, published TEXT)').run();
 const initial=JSON.stringify(firstReport);await env.DB.prepare('INSERT OR IGNORE INTO hsc08_reports (id,revision,draft,published) VALUES (?,1,?,?)').bind('thomas-20261108',initial,initial).run();
 const choices=await targets(env),id=new URL(request.url).searchParams.get('id');
 if(request.method==='POST')try{
  const raw=await request.text();if(raw.length>1500000)throw Error('Bericht zu groß.');const b=JSON.parse(raw);if(!['save','delete'].includes(b.action)||!['draft','published'].includes(b.status||'draft')||!Number.isSafeInteger(b.revision))throw Error('Ungültige Aktion.');
  const key=b.id||crypto.randomUUID();if(typeof key!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(key))throw Error('Ungültige Kennung.');
  const row=await env.DB.prepare('SELECT * FROM hsc08_reports WHERE id=?').bind(key).first();if((row?.revision||0)!==b.revision)return respond({ok:false,message:'Bericht inzwischen geändert. Bitte neu laden; Eingaben wurden nicht überschrieben.'},409);
  let draft=null,published=null;
  if(b.action==='delete'){if(!row||b.confirmation!=='BERICHT LÖSCHEN')throw Error('Löschbestätigung fehlt.');}
  else{const clean=validateReport(b.report);if(clean.leagueId&&!choices.some(c=>c.id===clean.leagueId))throw Error('Dieser Ergebnisdienst ist nicht mehr verfügbar. Bitte neu auswählen.');draft=JSON.stringify(clean);published=b.status==='published'?draft:row?.published||null;}
  let result;if(row)result=await env.DB.prepare('UPDATE hsc08_reports SET draft=?,published=?,revision=revision+1 WHERE id=? AND revision=?').bind(draft,published,key,b.revision).run();else result=await env.DB.prepare('INSERT OR IGNORE INTO hsc08_reports (id,revision,draft,published) VALUES (?,1,?,?)').bind(key,draft,published).run();
  if(result.meta?.changes!==1)return respond({ok:false,message:'Bericht inzwischen geändert. Bitte neu laden.'},409);return respond({ok:true,id:key});
 }catch(e){return respond({ok:false,message:e.message},400);}
 if(id){const row=await env.DB.prepare('SELECT * FROM hsc08_reports WHERE id=?').bind(id).first(),doc=manager?row?.draft:row?.published;if(!doc)return respond({ok:false,message:'Nicht verfügbar.'},404);return respond({ok:true,id,revision:manager?row.revision:undefined,report:readReport(doc),targets:choices,canManage:manager});}
 const rows=await env.DB.prepare('SELECT * FROM hsc08_reports').all();const items=(rows.results||[]).flatMap(row=>{const doc=manager?row.draft:row.published;if(!doc)return [];const r=readReport(doc);return [{id:row.id,title:r.title,date:r.date,summary:r.summary,photo:r.files.find(f=>f.mime.startsWith('image/'))||null,...(manager?{status:row.published===row.draft?'Veröffentlicht':row.published?'Unveröffentlichte Änderungen':'Entwurf'}:{})}];}).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));return respond({ok:true,items,targets:choices,canManage:manager});
}

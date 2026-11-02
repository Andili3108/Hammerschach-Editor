import { hsc08Logo } from './hsc08-logo.js';
export function hsc08Page() {
  return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="css/gamer.css"><link rel="stylesheet" href="css/gamer-appearance.css"><style>
html,body{margin:0;padding:0;display:block;min-height:0;background:transparent;color:inherit}*{box-sizing:border-box}main{width:100%;margin:0;padding:0;display:flow-root}h1{font-size:clamp(22px,4vw,32px)}.intro{display:flex;gap:20px;align-items:center}.intro img{width:110px;border-radius:16px}section{margin:18px 0;padding:18px;border:1px solid #a9884b66;border-radius:14px;background:var(--ui-surface)}label{display:block;margin:14px 0 6px}input,textarea,select{width:100%;min-height:44px}textarea{min-height:140px;resize:vertical}button{min-height:44px;cursor:pointer;margin:4px 4px 4px 0}button:disabled{cursor:not-allowed;opacity:.6}.actions{display:flex;flex-wrap:wrap;gap:8px}.notice{border-left:4px solid #b8860b;padding:12px;line-height:1.5}.description{white-space:pre-wrap;overflow-wrap:anywhere}li{overflow-wrap:anywhere;margin:8px 0}#message{padding:10px;white-space:pre-wrap}dialog{position:fixed;top:10px;bottom:auto;margin:0 auto;max-height:calc(100vh - 20px);overflow:auto;max-width:min(94vw,520px);border-radius:14px;padding:24px}dialog::backdrop{background:#0009}[hidden]{display:none!important}@media(max-width:480px){main{padding:0}section{padding:12px}.intro img{width:78px}}
fieldset.participant-fields{border:0;padding:0;margin:20px 0 0;min-width:0}fieldset.participant-fields legend{font-weight:bold}.participant-grid,#participants{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 24px}.participant-field{min-width:0}.participant-entry{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:6px;align-items:center}.participant-entry button{margin:0;padding:0;min-height:44px}.participant-field label{margin:8px 0 6px}#participants{padding:0;list-style:none}#participants li{margin:0;min-width:0}#participants .participant-output.tournament-input{display:flex;align-items:center;gap:10px;min-height:44px;height:100%;background:var(--ui-field);border-color:var(--ui-line);color:var(--ui-text)}.participant-number{color:var(--ui-muted);flex:none}.participant-name{min-width:0;overflow-wrap:anywhere}.config-grid,.rating-grid,#tournamentFacts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.config-grid,#tournamentFacts{grid-template-columns:repeat(3,minmax(0,1fr))}.config-grid>div,.rating-grid>div,#tournamentFacts>div{min-width:0}.rating-grid label{font-size:14px}.participant-rating{display:block;font-size:13px;color:var(--ui-muted);font-weight:normal}.fact-label{display:block;font-size:14px;margin-bottom:6px}#tournamentFacts .tournament-input{height:auto;min-height:0;padding:6px 10px;line-height:1.3;overflow-wrap:anywhere}@media(max-width:900px){.config-grid,#tournamentFacts{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.config-grid,#tournamentFacts{grid-template-columns:minmax(0,1fr)}}.participant-hint{font-size:14px;line-height:1.4}@media(max-width:900px){.participant-grid,#participants{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.participant-grid,#participants{grid-template-columns:minmax(0,1fr)}}
.editor-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}.editor-toolbar button{margin:0;min-width:44px}.editor-toolbar label{margin:0}.editor-toolbar select{width:auto;max-width:100%}#descriptionInput{min-height:220px;height:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:18px;font-weight:normal;line-height:1.5;padding:14px}#descriptionInput:focus{outline:2px solid var(--ui-text);outline-offset:2px}.description{line-height:1.5}
#config input,#config select{min-height:34px;padding:6px 10px;line-height:1.3}#config .participant-entry button{min-height:34px}.editor-table{border-collapse:collapse;width:100%;table-layout:fixed;margin:12px 0}.editor-table th,.editor-table td{border:1px solid var(--ui-line);padding:7px;height:34px;text-align:left;overflow-wrap:anywhere;font-size:16px;font-weight:normal}.editor-table th{font-weight:bold;background:var(--ui-field)}
/* HSC08 view only: existing lobby gold, chat blue/green and Gamer red accents. */
#view>section{padding:18px;border-radius:14px}
#roundsSection{background:linear-gradient(rgba(59,110,167,.08),rgba(59,110,167,.08)),var(--ui-surface);border-color:rgba(59,110,167,.28)}
#participantsSection{background:linear-gradient(rgba(34,107,54,.09),rgba(34,107,54,.09)),var(--ui-surface);border-color:rgba(34,107,54,.20)}
#descriptionSection{background:linear-gradient(rgba(154,45,51,.06),rgba(154,45,51,.06)),var(--ui-surface);border-color:rgba(154,45,51,.22)}
html.dark-mode #roundsSection{background:linear-gradient(rgba(107,160,211,.12),rgba(107,160,211,.12)),var(--ui-surface);border-color:rgba(107,160,211,.24)}
html.dark-mode #participantsSection{background:linear-gradient(rgba(62,154,88,.14),rgba(62,154,88,.14)),var(--ui-surface);border-color:rgba(75,190,107,.25)}
html.dark-mode #descriptionSection{background:linear-gradient(rgba(159,77,86,.18),rgba(159,77,86,.18)),var(--ui-surface);border-color:rgba(226,151,160,.24)}
.config-grid{margin-top:14px;align-items:start}.config-grid label{font-size:14px;font-weight:bold;margin:0 0 6px}
@media(max-width:480px){#view>section{padding:12px}}
/* Separate the three configuration areas without changing their field layout. */
#config .participant-fields{margin-top:48px}
#config label[for="descriptionInput"]{margin-top:48px}
@media(max-width:560px){#config .participant-fields{margin-top:32px}#config label[for="descriptionInput"]{margin-top:32px}}
.rr-game{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(130px,.7fr);gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--ui-line)}.rr-game span{overflow-wrap:anywhere}.rr-game select{min-width:0}.rr-round{margin-top:24px}.ranking-wrap{overflow-x:auto}.rr-ranking{width:100%;border-collapse:collapse}.rr-ranking th,.rr-ranking td{padding:8px;text-align:left;border-bottom:1px solid var(--ui-line)}@media(max-width:560px){.rr-game{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.rr-game select{grid-column:1 / -1}}
</style><body><main>
<template id="hsc08Brand"><img src="${hsc08Logo}" alt="HSC08 – Schachabteilung"></template>
<div id="message" role="status" aria-live="polite"></div>
<div id="draftNotice" class="notice" hidden><p>Ein gespeicherter Entwurf wurde noch nicht in die Turnieransicht übernommen.</p><button type="button" id="applyDraft">In Turnieransicht übernehmen</button></div><div id="view"><section id="factsSection" class="lobby-tournaments" hidden><h2>Turnierinformationen</h2><div id="tournamentFacts"></div></section><section id="rankingSection" class="lobby-tournaments" hidden><h2>Rangliste</h2><div id="ranking"></div></section><section id="roundsSection"><h2>Runden und Paarungen</h2><div id="roundActions" class="actions"></div><div id="roundContent"></div></section><section id="participantsSection"><h2>Teilnehmer</h2><ol id="participants" role="list"></ol><p id="emptyParticipants">Noch keine Teilnehmer.</p></section><section id="descriptionSection"><h2>Ausschreibung</h2><div id="description" class="description"></div></section></div>
<form id="config" hidden><section><label for="title">Titel</label><input class="tournament-input" id="title" maxlength="160"><div class="config-grid"><div><label for="mode">Modus</label><select class="tournament-select" id="mode"><option value="">Bitte wählen</option><option value="round-robin">Rundenturnier</option><option value="swiss">Schweizer System</option></select></div>
<div><label for="scoring">Punktewertung</label><select id="scoring" class="tournament-select"><option value="classic">Klassisch · 1 / ½ / 0</option><option value="three-point">Dreipunktewertung · 3 / 1 / 0</option></select></div>
<div id="cyclesField"><label for="cycles">Durchgänge</label><select id="cycles" class="tournament-select"><option value="1">Einfachrunde · jeder gegen jeden</option><option value="2">Doppelrunde · Hin- und Rückspiel</option></select></div>
<div id="roundsField" hidden><label for="rounds">Anzahl der Runden</label><input id="rounds" class="tournament-input" type="number" min="1" max="199" step="1"></div>
<div><label for="startsOn">Turnierbeginn</label><input id="startsOn" class="tournament-input" type="date"></div>
<div><label for="endsOn">Spätester Spieltermin</label><input id="endsOn" class="tournament-input" type="date"></div>
<div><label for="timeControl">Bedenkzeit</label><input id="timeControl" class="tournament-input" maxlength="300" placeholder="Bedenkzeit eurer Vereinsmeisterschaft"></div></div><p id="roundsHint" class="participant-hint" hidden>Die Rundenzahl vor Turnierbeginn festlegen. Sie darf im Entwurf noch offen bleiben.</p><fieldset class="participant-fields"><legend>Teilnehmer · ohne Gamer-Konto</legend><p id="namesHint" class="participant-hint">Ein Name pro Feld. Leere Felder werden nicht gespeichert. Bis zu 200 Teilnehmer.</p><div id="names" class="participant-grid"></div><button id="addNames" class="button-flat" type="button">＋ 3 weitere Namensfelder</button></fieldset><label for="descriptionInput">Ausschreibung / Beschreibung</label><div class="editor-toolbar" role="group" aria-label="Textformatierung"><button class="button-flat" type="button" id="textBold" aria-label="Fett" title="Fett (Strg/Befehl+B)"><b>F</b></button><button class="button-flat" type="button" id="textItalic" aria-label="Kursiv" title="Kursiv (Strg/Befehl+I)"><i>K</i></button><label for="textSize">Schriftgröße</label><select id="textSize" class="tournament-select"><option value="2">Klein · 14</option><option value="4" selected>Normal · 18</option><option value="5">Groß · 24</option><option value="6">Überschrift · 30</option></select><label for="tablePreset">Tabelle</label><select id="tablePreset" class="tournament-select"><option value="">Vorlage wählen</option><option value="2">2 Spalten</option><option value="3">3 Spalten</option><option value="4">4 Spalten</option><option value="schedule">Rundentermine</option></select><button class="button-flat" type="button" id="tableRow">Zeile hinzufügen</button><button class="button-flat" type="button" id="tableDelete">Tabelle entfernen</button><button class="button-flat" type="button" id="textClear">Formatierung entfernen</button></div><div class="tournament-textarea" id="descriptionInput" contenteditable="true" role="textbox" aria-label="Ausschreibung / Beschreibung" aria-multiline="true" aria-describedby="editorHint"></div><small id="editorHint">Text markieren und formatieren. Eingefügte Texte übernehmen die Gamer-Schrift; maximal 20.000 Zeichen.</small><p class="notice">Entwurf speichern sichert deine Bearbeitung. Die Turnieransicht ändert sich erst mit „In Turnieransicht übernehmen“. Der Bereich bleibt privat.</p><div class="actions"><button type="submit">Entwurf speichern</button><button id="cancel" type="button">Zur Turnierseite</button></div></section></form>
<dialog id="deleteDialog"><form id="deleteForm"><h2>Turnier vollständig löschen</h2><p>Die gespeicherte Konfiguration, Ausschreibung und Teilnehmer werden unwiderruflich gelöscht. Die feste HSC08-Seite und ihre Navigation bleiben erhalten.</p><label for="password">Aktuelles Gamer-Passwort von Andili</label><input class="tournament-input" id="password" type="password" autocomplete="current-password" required maxlength="1024"><label for="confirmation">Zur Bestätigung TURNIER LÖSCHEN eingeben</label><input class="tournament-input" id="confirmation" required autocomplete="off"><p id="deleteError" role="alert"></p><button type="submit">Endgültig löschen</button><button id="deleteCancel" type="button">Abbrechen</button></form></dialog>
<dialog id="backupDialog"><h2>Sichern / Wiederherstellen</h2><p>Die ZIP enthält eine JSON-Sicherung mit Entwurf und Turnieransicht sowie eine HTML-Datei des übernommenen Ansichtsstands.</p><button id="downloadBackup" type="button">Sicherungs-ZIP herunterladen</button><p id="backupStatus" role="status"></p><label for="backupPassword">Aktuelles Gamer-Passwort</label><input id="backupPassword" type="password" autocomplete="current-password" class="tournament-input"><label for="resetTitle">Zum Zurücksetzen den aktuellen Turniernamen eingeben</label><input id="resetTitle" class="tournament-input" autocomplete="off"><label><input id="backupConfirmed" type="checkbox" style="width:auto;min-height:0"> Ich habe die Sicherungs-ZIP gespeichert.</label><button id="resetTournament" type="button" disabled>Gesichert zurücksetzen</button><hr><label for="restoreFile">JSON-Datei aus einer entpackten Sicherungs-ZIP</label><input id="restoreFile" class="tournament-input" type="file" accept=".json,application/json"><label for="restoreConfirmation">Zur Bestätigung WIEDERHERSTELLEN eingeben</label><input id="restoreConfirmation" class="tournament-input" autocomplete="off"><button id="restoreTournament" type="button">Sicherung wiederherstellen</button><button id="backupClose" type="button">Schließen</button></dialog></main><script>(${HSC08_CLIENT})();</script></body></html>`;
}
// Keep browser code literal: Worker bundlers may inject helpers into real functions.
const HSC08_CLIENT = String.raw`function client() {
  const $ = id => document.getElementById(id);
  let state = {revision:0,tournament:null}, busy = false;
  const api = (method, body) => parent.HammerschachHsc08.api('/championship', method, body);
  const message = text => { $('message').textContent = text; };
  function paintText(target,runs){
    target.replaceChildren();
    for(const run of runs){if(run.table){target.append(makeTable(run.table));continue;}const span=document.createElement('span');span.textContent=run.text;span.style.fontSize=run.size+'px';span.style.fontWeight=run.bold?'bold':'normal';span.style.fontStyle=run.italic?'italic':'normal';target.append(span);}
  }
  function readText(){
    const runs=[];
    const emit=(text,style)=>{if(!text)return;const last=runs.at(-1);if(last && !last.table && last.size===style.size && last.bold===style.bold && last.italic===style.italic)last.text+=text;else runs.push({text,...style});};
    function walk(node,style){
      if(node.nodeType===3){emit(node.textContent,style);return;}
      if(node.nodeType!==1)return;
      if(['SCRIPT','STYLE','IFRAME','OBJECT'].includes(node.tagName))return;
      if(node.tagName==='TABLE'){runs.push({table:[...node.rows].map(row=>[...row.cells].map(cell=>cell.innerText))});return;}
      if(node.tagName==='BR'){emit('\n',style);return;}
      const block=['DIV','P','LI','H1','H2','H3'].includes(node.tagName);
      if(block && runs.length && !(runs.at(-1).text||'').endsWith('\n'))emit('\n',style);
      const next={...style};
      if(['B','STRONG'].includes(node.tagName))next.bold=true;
      if(['I','EM'].includes(node.tagName))next.italic=true;
      if(node.style.fontWeight)next.bold=node.style.fontWeight==='bold'||Number(node.style.fontWeight)>=600;
      if(node.style.fontStyle)next.italic=node.style.fontStyle==='italic';
      const sizes={1:14,2:14,3:18,4:18,5:24,6:30,7:30};
      if(node.tagName==='FONT' && sizes[node.getAttribute('size')])next.size=sizes[node.getAttribute('size')];
      const px=parseInt(node.style.fontSize);if([14,18,24,30].includes(px))next.size=px;
      for(const child of node.childNodes)walk(child,next);
      if(block && node.nextSibling && runs.length && !(runs.at(-1).text||'').endsWith('\n'))emit('\n',next);
    }
    for(const node of $('descriptionInput').childNodes)walk(node,{size:18,bold:false,italic:false});
    return runs;
  }
  let savedSelection=null;
  document.addEventListener('selectionchange',()=>{
    const selection=getSelection();if(selection.rangeCount && $('descriptionInput').contains(selection.anchorNode) && $('descriptionInput').contains(selection.focusNode))savedSelection=selection.getRangeAt(0).cloneRange();
  });
  function format(command,value){
    if(busy)return;
    $('descriptionInput').focus();
    if(savedSelection && $('descriptionInput').contains(savedSelection.commonAncestorContainer)){const selection=getSelection();selection.removeAllRanges();selection.addRange(savedSelection);}
    document.execCommand(command,false,value);
    const selection=getSelection();if(selection.rangeCount)savedSelection=selection.getRangeAt(0).cloneRange();
  }
  for(const [id,command] of [['textBold','bold'],['textItalic','italic'],['textClear','removeFormat']]){
    $(id).onmousedown=e=>e.preventDefault();$(id).onclick=()=>format(command);
  }
  $('textSize').onchange=()=>format('fontSize',$('textSize').value);
  function makeTable(rows){const table=document.createElement('table');table.className='editor-table';const body=document.createElement('tbody');rows.forEach((cells,index)=>{const row=document.createElement('tr');cells.forEach(text=>{const cell=document.createElement(index===0?'th':'td');cell.textContent=text;row.append(cell);});body.append(row);});table.append(body);return table;}
  function insertTable(rows){if(rows.length>100 || rows.some(r=>r.length>12)){message('Maximal 100 Zeilen und 12 Spalten pro Tabelle.');return;}format('insertHTML',makeTable(rows).outerHTML+'<div><br></div>');}
  $('tablePreset').onchange=()=>{const value=$('tablePreset').value;if(!value)return;const count=value==='schedule'?3:Number(value);const rows=[value==='schedule'?['Runde','Rundenbeginn','Spätester Spieltermin']:Array.from({length:count},(_,i)=>'Spalte '+(i+1)),...Array.from({length:3},()=>Array(count).fill(''))];insertTable(rows);$('tablePreset').value='';};
  function selectedTable(){const node=savedSelection?.startContainer;const table=(node?.nodeType===1?node:node?.parentElement)?.closest('table');return table && $('descriptionInput').contains(table)?table:null;}
  $('tableRow').onmousedown=e=>e.preventDefault();$('tableDelete').onmousedown=e=>e.preventDefault();
  $('tableRow').onclick=()=>{if(busy)return;const table=selectedTable();if(!table){message('Bitte zuerst in eine Tabellenzelle klicken.');return;}if(table.rows.length>=100)return;const row=table.insertRow();for(let i=0;i<table.rows[0].cells.length;i++)row.insertCell().textContent='';};
  $('tableDelete').onclick=()=>{if(busy)return;const table=selectedTable();if(table && confirm('Diese Tabelle aus der Ausschreibung entfernen?')){table.remove();savedSelection=null;}};
  $('descriptionInput').addEventListener('paste',e=>{
    e.preventDefault();if(busy)return;
    const html=e.clipboardData.getData('text/html');
    if(html){const doc=new DOMParser().parseFromString(html,'text/html');const table=doc.querySelector('table');if(table){insertTable([...table.rows].map(row=>[...row.cells].map(cell=>cell.textContent)));return;}}
    const text=e.clipboardData.getData('text/plain');
    const lines=text.trim().split(/\r?\n/);
    if(lines.length>1 && lines.every(line=>line.includes('|'))){const rows=lines.map(line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim())).filter(row=>!row.every(cell=>/^:?-{3,}:?$/.test(cell)));if(rows.length && rows.every(row=>row.length===rows[0].length)){insertTable(rows);return;}}
    if(lines.length>1 && lines.every(line=>line.includes('\t'))){insertTable(lines.map(line=>line.split('\t')));return;}
    format('insertText',text);
  });
  $('descriptionInput').addEventListener('drop',e=>e.preventDefault());
  function render() {
    const t = state.publishedTournament;
    $('draftNotice').hidden=!$('config').hidden || JSON.stringify(state.tournament)===JSON.stringify(t); 
    parent.HammerschachHsc08.setTitle(t?.title || 'Vereinsmeisterschaft',!$('config').hidden);
    paintText($('description'),t?.descriptionRich || [{text:t?.description || 'Diese Turnierseite ist noch leer.',size:18,bold:false,italic:false}]);
    $('tournamentFacts').replaceChildren();
    const facts = [];
    if(t?.mode)facts.push(['Modus',t.mode==='swiss'?'Schweizer System':'Rundenturnier']);
    if(t)facts.push(['Punktewertung',t.scoring==='three-point'?'Sieg 3 · Remis 1 · Niederlage 0':'Sieg 1 · Remis ½ · Niederlage 0']);
    if(t?.mode==='round-robin')facts.push(['Durchgänge',t.cycles===2?'Doppelrunde · Hin- und Rückspiel':'Einfachrunde · jeder gegen jeden']);
    if(t?.mode==='swiss' && t.rounds)facts.push(['Runden',String(t.rounds)]);
    const displayDate=value=>value.split('-').reverse().join('.');
    if(t?.startsOn)facts.push(['Turnierbeginn',displayDate(t.startsOn)]);
    if(t?.endsOn)facts.push(['Spätester Spieltermin',displayDate(t.endsOn)]);
    if(t?.timeControl)facts.push(['Bedenkzeit',t.timeControl]);
    for(const [label,value] of facts){const item=document.createElement('div');const heading=document.createElement('strong');heading.className='fact-label';heading.textContent=label;const output=document.createElement('div');output.className='tournament-input';output.textContent=value;item.append(heading,output);$('tournamentFacts').append(item);}
    $('factsSection').hidden=!facts.length;
    $('participants').replaceChildren();
    for (const [index,p] of (t?.participants || []).entries()) {
      const li=document.createElement('li');const field=document.createElement('div');field.className='tournament-input participant-output';
      const number=document.createElement('span');number.className='participant-number';number.textContent=(index+1)+'.';
      const name=document.createElement('span');name.className='participant-name';name.textContent=p.name;
      if(p.dwz || p.estimatedRating){const rating=document.createElement('span');rating.className='participant-rating';rating.textContent=p.dwz?'DWZ '+p.dwz:'Geschätzte Spielstärke '+p.estimatedRating;name.append(rating);}
      field.append(number,name);li.append(field);$('participants').append(li);
    }
    $('emptyParticipants').hidden = !!t?.participants.length;
    renderRounds(t);
  }
  function renderRounds(t){
    const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
    $('roundActions').replaceChildren();$('roundContent').replaceChildren();$('ranking').replaceChildren();
    $('rankingSection').hidden=!t?.hasEverResults;
    $('participantsSection').hidden=['running','completed'].includes(t?.phase);
    function action(text,kind,confirmation){const button=node('button',text,'button-flat');button.type='button';button.onclick=async()=>{if(busy || (confirmation&&!confirm(confirmation)))return;await save('POST',{action:kind});};$('roundActions').append(button);}
    if(!t?.schedule){$('roundContent').append(node('p',t?.mode==='swiss'?'Die Schweizer Auslosung steht noch nicht zur Verfügung.':'Noch keine Runden freigegeben.'));if(t?.mode==='round-robin')action('♟ Paarungsplan vorbereiten','prepare');return;}
    if(t.phase==='prepared'){
      $('roundContent').append(node('p','Paarungsentwurf · Startnummern nach Teilnehmerreihenfolge. Bitte Farben und Begegnungen prüfen.'));
      action('Paarungsentwurf verwerfen','discard-plan','Paarungsentwurf verwerfen und Einstellungen wieder öffnen?');
      action('✓ Paarungsplan freigeben','release','Den gesamten Paarungsplan freigeben und das Turnier starten?');
    }
    if(t.phase==='running')action('🏁 Turnier abschließen','complete','Turnier abschließen? Alle Partien müssen entschieden sein.');
    if(t.phase==='completed'){ $('roundContent').append(node('p','Abgeschlossen'));action('✎ Für Korrektur öffnen','reopen'); }
    const names=new Map(t.participants.map(p=>[p.id,p.name]));
    const labels={'':'Offen','1-0':'1–0','1/2-1/2':'½–½','0-1':'0–1','+/-':'+ / − (kampflos)','-/+':'− / + (kampflos)','-/-':'− / − (beide nicht angetreten)'};
    for(const round of [...t.schedule].reverse()){
      const box=node('div',undefined,'rr-round');box.append(node('h3','Runde '+round.number));
      if(round.bye)box.append(node('p',names.get(round.bye)+' · spielfrei (0 Punkte)'));
      for(const game of round.games){
        const row=node('div',undefined,'rr-game');row.append(node('span','Weiß: '+names.get(game.white)),node('span','Schwarz: '+names.get(game.black)));
        const select=node('select',undefined,'tournament-select');select.setAttribute('aria-label','Ergebnis '+names.get(game.white)+' gegen '+names.get(game.black));
        for(const [value,label] of Object.entries(labels)){const option=node('option',label);option.value=value;select.append(option);}select.value=game.result||'';select.disabled=t.phase!=='running';
        select.onchange=async()=>{if(busy){select.value=game.result||'';return;}let reason='';if(game.result!==null){reason=prompt('Begründung der Ergebniskorrektur:');if(!reason?.trim()){select.value=game.result||'';return;}}const success=await save('POST',{action:'result',gameId:game.id,result:select.value||null,reason});if(!success)select.value=game.result||'';};row.append(select);box.append(row);
      }$('roundContent').append(box);
    }
    if(t.hasEverResults){
      const table=node('table',undefined,'rr-ranking');const head=node('tr');for(const title of ['Platz','Name','Gespielt','Punkte','SB'])head.append(node('th',title));table.append(head);
      for(const r of t.ranking||[]){const row=node('tr');for(const value of [r.rank,names.get(r.id),r.played,r.points,r.sb])row.append(node('td',String(value)));table.append(row);}
      const wrap=node('div',undefined,'ranking-wrap');wrap.append(table);$('ranking').append(node('p',t.phase==='completed'?'Endstand · Punkte → Sonneborn-Berger → direkter Vergleich':'Zwischenstand · Unterschiedlich viele gespielte Partien möglich.'),wrap);
      if(t.phase==='completed'){const winners=(t.ranking||[]).filter(r=>r.rank===1).map(r=>names.get(r.id));$('ranking').append(node('p',(winners.length===1?'Vereinsmeister: ':'Gemeinsame Vereinsmeister: ')+winners.join(', ')));}
    }
    if(t.audit?.length){const details=node('details');details.append(node('summary','Änderungsprotokoll'));for(const entry of [...t.audit].reverse())details.append(node('p',new Date(entry.at).toLocaleString('de-DE')+' · '+entry.actor+' · '+(entry.action==='result'?'Ergebnis '+entry.gameId+': '+(labels[entry.old||'']||entry.old)+' → '+(labels[entry.value||'']||entry.value)+(entry.reason?' · '+entry.reason:''):({prepare:'Paarungsplan vorbereitet','discard-plan':'Paarungsentwurf verworfen',release:'Turnier gestartet',complete:'Turnier abgeschlossen',reopen:'Für Korrekturen geöffnet'}[entry.action]||entry.action))));$('roundContent').append(details);}
  }
  function numberFields() {
    const fields=[...$('names').children];
    fields.forEach((field,index)=>{
      field.querySelector('label').textContent='Teilnehmer '+(index+1);
      field.querySelector('button').setAttribute('aria-label','Teilnehmer '+(index+1)+' entfernen');
    });
    $('addNames').disabled=busy || !!state.tournament?.schedule || fields.length>=200;
  }
  function addNameField(participant={}) {
    const field=document.createElement('div');field.className='participant-field';
    const input=document.createElement('input');input.className='tournament-input';input.type='text';input.maxLength=100;
    input.dataset.participantId=participant.id||crypto.randomUUID();input.id='participant-'+input.dataset.participantId;
    input.value=participant.name||'';input.placeholder='Vorname Nachname';input.autocomplete='off';input.setAttribute('aria-describedby','namesHint');
    const label=document.createElement('label');label.htmlFor=input.id;
    const entry=document.createElement('div');entry.className='participant-entry';
    const remove=document.createElement('button');remove.type='button';remove.className='button-flat';remove.textContent='×';
    remove.onclick=()=>{if(busy)return;const next=field.nextElementSibling||field.previousElementSibling;field.remove();numberFields();(next?.querySelector('input')||$('addNames')).focus();};
    entry.append(input,remove);field.append(label,entry);
    const ratings=document.createElement('div');ratings.className='rating-grid';
    for(const [key,text] of [['dwz','DWZ (optional)'],['estimatedRating','Schätzung ohne DWZ']]){
      const wrap=document.createElement('div'),ratingLabel=document.createElement('label'),rating=document.createElement('input');
      rating.type='number';rating.min='1';rating.max='9999';rating.step='1';rating.className='tournament-input';rating.dataset.rating=key;rating.id=input.id+'-'+key;rating.value=participant[key]??'';
      ratingLabel.htmlFor=rating.id;ratingLabel.textContent=text;wrap.append(ratingLabel,rating);ratings.append(wrap);
    }
    const dwz=ratings.querySelector('[data-rating="dwz"]'),estimate=ratings.querySelector('[data-rating="estimatedRating"]');
    dwz.oninput=()=>{estimate.disabled=!!dwz.value;};dwz.oninput();
    field.append(ratings);$('names').append(field);
  }
  function loadNames(participants) {
    $('names').replaceChildren();participants.forEach(addNameField);
    const count=Math.min(200,Math.max(3,Math.ceil(participants.length/3)*3));
    while($('names').children.length<count)addNameField();numberFields();
  }
  $('addNames').onclick=()=>{
    if(busy)return;
    const start=$('names').children.length;
    for(let n=0;n<3 && $('names').children.length<200;n++)addNameField();
    numberFields();$('names').children[start]?.querySelector('input').focus();
  };
  function modeFields(){ $('cyclesField').hidden=$('mode').value!=='round-robin';$('roundsField').hidden=$('mode').value!=='swiss';$('roundsHint').hidden=$('mode').value!=='swiss'; }
  $('mode').onchange=modeFields;
  window.hscMode = mode => {
    if (busy) return;
    const config = mode === 'config';
    if(config && !$('config').hidden)return;
    if (!$('config').hidden && !config && !confirm('Konfiguration verlassen? Nicht gespeicherte Eingaben gehen verloren.')) return;
    $('view').hidden=config;$('config').hidden=!config;render();
    if (config) {const t=state.tournament;$('title').value=t?.title||'';$('mode').value=t?.mode||'';paintText($('descriptionInput'),t?.descriptionRich || [{text:t?.description||'',size:18,bold:false,italic:false}]);savedSelection=null;loadNames(t?.participants||[]);
      for(const [key,fallback] of [['scoring','classic'],['cycles',1],['rounds',''],['startsOn',''],['endsOn',''],['timeControl','']])$(key).value=t?.[key]??fallback;
      modeFields();
      const locked=!!t?.schedule;
      for(const id of ['mode','scoring','cycles','rounds','timeControl','addNames'])$(id).disabled=locked;
      $('names').querySelectorAll('button').forEach(button=>button.disabled=locked);
    }
    parent.HammerschachHsc08.setTitle(null,config);
  };
  window.hscDelete = () => {if(busy)return;if(state.tournament?.hasEverResults){message('Löschen gesperrt: Bitte Sichern / Wiederherstellen zum geschützten Zurücksetzen verwenden.');return;}$('deleteError').textContent='';$('deleteForm').reset();$('deleteDialog').showModal();};
  $('cancel').onclick=()=>window.hscMode('view');
  $('deleteCancel').onclick=()=>{$('deleteForm').reset();$('deleteDialog').close();};
  $('deleteDialog').addEventListener('close',()=>$('deleteForm').reset());
  async function save(method,body) {
    busy=true;$('descriptionInput').contentEditable='false';const controls=[...document.querySelectorAll('button,input,textarea,select')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);
    try {state=await api(method,{revision:state.revision,...body});render();return true;}
    catch(e){message(e.message);$('deleteError').textContent=e.message;return false;}
    finally{busy=false;$('descriptionInput').contentEditable='true';controls.forEach(([el,disabled])=>el.disabled=disabled);numberFields();}
  }
  $('config').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const participants=[...$('names').children].map(field=>{
      const input=field.querySelector('[data-participant-id]');const p={id:input.dataset.participantId,name:input.value.trim()};
      for(const key of ['dwz','estimatedRating']){const value=field.querySelector('[data-rating="'+key+'"]').value;if(value)p[key]=Number(value);}
      return p;
    }).filter(p=>p.name);
    if(await save('POST',{tournament:{title:$('title').value,mode:$('mode').value,descriptionRich:readText(),scoring:$('scoring').value,cycles:Number($('cycles').value),rounds:$('rounds').value?Number($('rounds').value):null,startsOn:$('startsOn').value,endsOn:$('endsOn').value,timeControl:$('timeControl').value,participants}})){
      $('config').hidden=true;$('view').hidden=false;render();message('Entwurf gespeichert. Die Turnieransicht ist unverändert.');
    }
  };
  let downloadedBackup=null;
  const backupStatus=text=>$('backupStatus').textContent=text;
  window.hscBackup=()=>{if(busy)return;downloadedBackup=null;$('backupPassword').value='';$('resetTitle').value='';$('restoreConfirmation').value='';$('restoreFile').value='';$('backupConfirmed').checked=false;$('resetTournament').disabled=true;backupStatus('');$('backupDialog').showModal();};
  $('backupClose').onclick=()=>$('backupDialog').close();
  $('backupDialog').addEventListener('close',()=>{$('backupPassword').value='';downloadedBackup=null;});
  // Standards-based ZIP with stored (uncompressed) UTF-8 entries; no external library.
  function zipFiles(files){
    const encoder=new TextEncoder(),parts=[],directory=[];let offset=0;
    const header=size=>{const data=new Uint8Array(size);return [data,new DataView(data.buffer)];};
    for(const [name,text] of files){const bytes=encoder.encode(text),filename=encoder.encode(name);let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
      const [h,v]=header(30);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,filename.length,true);parts.push(h,filename,bytes);
      const [c,w]=header(46);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,crc,true);w.setUint32(20,bytes.length,true);w.setUint32(24,bytes.length,true);w.setUint16(28,filename.length,true);w.setUint32(42,offset,true);directory.push(c,filename);offset+=30+filename.length+bytes.length;
    }
    const size=directory.reduce((n,b)=>n+b.length,0);const [end,v]=header(22);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);return new Blob([...parts,...directory,end],{type:'application/zip'});
  }
  $('downloadBackup').onclick=async()=>{if(busy)return;busy=true;try{const data=await parent.HammerschachHsc08.api('/championship/backup');const blob=zipFiles([['HSC08-Sicherung.json',JSON.stringify(data.backup,null,2)],['HSC08-Turnier.html',data.html]]);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='HSC08-Sicherung-'+new Date().toISOString().replace(/[:.]/g,'-')+'.zip';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);downloadedBackup=data;$('backupConfirmed').checked=false;$('resetTournament').disabled=true;backupStatus('Download gestartet. Bitte die gespeicherte ZIP prüfen und das Speichern bestätigen.');}catch(e){backupStatus(e.message);}finally{busy=false;}};
  $('backupConfirmed').onchange=()=>{$('resetTournament').disabled=!downloadedBackup||!$('backupConfirmed').checked;};
  async function protectedAction(body){if(busy)return;busy=true;try{state=await api('POST',{revision:downloadedBackup&&body.action==='reset'?downloadedBackup.backup.sourceRevision:state.revision,...body,password:$('backupPassword').value});$('backupDialog').close();$('config').hidden=true;$('view').hidden=false;render();message(body.action==='reset'?'Turnier zurückgesetzt. Die Seite ist leer.':'Sicherung wiederhergestellt. Der Bereich bleibt privat.');}catch(e){backupStatus(e.message);}finally{busy=false;$('backupPassword').value='';}}
  $('resetTournament').onclick=()=>{if(!downloadedBackup||!$('backupConfirmed').checked)return;if(confirm('Turnierdaten vollständig zurücksetzen? Die Sicherungsdatei wird für eine Wiederherstellung benötigt.'))protectedAction({action:'reset',backupDigest:downloadedBackup.digest,confirmation:$('resetTitle').value});};
  $('restoreTournament').onclick=async()=>{if(busy)return;const file=$('restoreFile').files[0];if(!file){backupStatus('Bitte eine JSON-Sicherung auswählen.');return;}if(file.size>4000000){backupStatus('Die Sicherungsdatei ist zu groß.');return;}try{const backup=JSON.parse(await file.text());if(confirm('Diese Sicherung auf der leeren Turnierseite wiederherstellen?'))await protectedAction({action:'restore',backup,confirmation:$('restoreConfirmation').value});}catch(e){backupStatus('Die Datei konnte nicht gelesen werden: '+e.message);}};
  $('applyDraft').onclick=async()=>{if(busy)return;if(await save('POST',{action:'apply'}))message('Gespeicherter Entwurf in die Turnieransicht übernommen. Weiterhin nur für Andili sichtbar.');};
  $('deleteForm').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const password=$('password').value;$('password').value='';
    if(await save('DELETE',{password,confirmation:$('confirmation').value})){$('deleteDialog').close();$('config').hidden=true;$('view').hidden=false;parent.HammerschachHsc08.setTitle(state.tournament?.title || 'Vereinsmeisterschaft');message('Turnier gelöscht. Die Seite ist wieder leer.');}
  };
  api('GET').then(data=>{state=data;render();}).catch(e=>message(e.message));
  new ResizeObserver(()=>parent.HammerschachHsc08.resize(document.querySelector('main').getBoundingClientRect().height + 24)).observe(document.querySelector('main'));
}`;

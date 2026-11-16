// Shared championship and blitz editor; literal browser code for Worker bundling.
export const DESCRIPTION_EDITOR_HTML = "<label for=\"descriptionInput\">Ausschreibung / Beschreibung</label><div class=\"editor-toolbar\" role=\"group\" aria-label=\"Textformatierung\"><button class=\"button-flat\" type=\"button\" id=\"textBold\" aria-label=\"Fett\" title=\"Fett (Strg/Befehl+B)\"><b>F</b></button><button class=\"button-flat\" type=\"button\" id=\"textItalic\" aria-label=\"Kursiv\" title=\"Kursiv (Strg/Befehl+I)\"><i>K</i></button><label for=\"textSize\">Schriftgr\u00f6\u00dfe</label><select id=\"textSize\" class=\"tournament-select\"><option value=\"2\">Klein \u00b7 14</option><option value=\"4\" selected>Normal \u00b7 18</option><option value=\"5\">Gro\u00df \u00b7 24</option><option value=\"6\">\u00dcberschrift \u00b7 30</option></select><label for=\"tablePreset\">Tabelle</label><select id=\"tablePreset\" class=\"tournament-select\"><option value=\"\">Vorlage w\u00e4hlen</option><option value=\"2\">2 Spalten</option><option value=\"3\">3 Spalten</option><option value=\"4\">4 Spalten</option><option value=\"schedule\">Rundentermine</option></select><button class=\"button-flat\" type=\"button\" id=\"tableRow\">Zeile hinzuf\u00fcgen</button><button class=\"button-flat\" type=\"button\" id=\"tableDelete\">Tabelle entfernen</button><button class=\"button-flat\" type=\"button\" id=\"textClear\">Formatierung entfernen</button></div><div class=\"tournament-textarea\" id=\"descriptionInput\" contenteditable=\"true\" role=\"textbox\" aria-label=\"Ausschreibung / Beschreibung\" aria-multiline=\"true\" aria-describedby=\"editorHint\"></div><small id=\"editorHint\">Text markieren und formatieren. Eingef\u00fcgte Texte \u00fcbernehmen die Gamer-Schrift; maximal 20.000 Zeichen.</small>";
export const DESCRIPTION_EDITOR_CLIENT = String.raw`  function paintText(target,runs){
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
  const trackDescriptionSelection=()=>{
    const selection=getSelection();if(selection.rangeCount && $('descriptionInput').contains(selection.anchorNode) && $('descriptionInput').contains(selection.focusNode))savedSelection=selection.getRangeAt(0).cloneRange();
  };
  document.addEventListener('selectionchange',trackDescriptionSelection);
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
`;

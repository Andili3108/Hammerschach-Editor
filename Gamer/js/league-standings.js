'use strict';

const LEAGUE_STANDINGS_SELECTED_KEY = 'hammerschachLeagueStandingsSelectedV1';
const LEAGUE_STANDINGS_DEFAULT_PAGE_TITLE = 'Ligasaison 2026/27';
const LEAGUE_STANDINGS_ALLOWED_HOSTS = new Set([
  'ergebnisdienst.svr-schach.de',
  'ergebnisdienst.schachbund.de'
]);
let leagueStandingsData = [];
let leagueStandingsSelectedId = '';
let leagueStandingsMax = 15;
let leagueStandingsLoading = false;
let leagueStandingsAdminDrafts = [];
let leagueStandingsAdminDirty = false;
let leagueStandingsPageTitleDraft = LEAGUE_STANDINGS_DEFAULT_PAGE_TITLE;
let leagueStandingsPollTimer = null;
const leagueStandingsRounds = document.getElementById('leagueStandingsRounds');
const leagueStandingsRoundsCount = document.getElementById('leagueStandingsRoundsCount');
const leagueStandingsRoundsNotice = document.getElementById('leagueStandingsRoundsNotice');
const leagueStandingsRoundsList = document.getElementById('leagueStandingsRoundsList');

function leagueStandingsDate(value){
  const timestamp = Date.parse(String(value || ''));
  if(!timestamp) return '';
  try{
    return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(timestamp));
  }catch(_){
    return new Date(timestamp).toLocaleString('de-DE');
  }
}

function leagueStandingsSafeLink(value){
  try{
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && LEAGUE_STANDINGS_ALLOWED_HOSTS.has(url.hostname.toLowerCase()) ? url.toString() : '';
  }catch(_){
    return '';
  }
}

function leagueStandingsActiveLeagues(){
  return leagueStandingsData.filter(item=>item && item.enabled === true);
}

function leagueStandingsSelected(){
  const active = leagueStandingsActiveLeagues();
  return active.find(item=>item.id===leagueStandingsSelectedId) || active[0] || null;
}

function selectLeagueStandings(id, options){
  const active = leagueStandingsActiveLeagues();
  const selected = active.find(item=>item.id===String(id || '')) || active[0] || null;
  leagueStandingsSelectedId = selected ? selected.id : '';
  if(selected && (!options || options.persist !== false)){
    try{localStorage.setItem(LEAGUE_STANDINGS_SELECTED_KEY,selected.id);}catch(_){ }
  }
  renderLeagueStandingsTabs();
  renderLeagueStandingsTable();
}

function renderLeagueStandingsTabs(){
  if(!leagueStandingsTabs) return;
  leagueStandingsTabs.replaceChildren();
  const active = leagueStandingsActiveLeagues();
  leagueStandingsTabs.hidden = active.length < 2;
  active.forEach(item=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='league-standings-tab';
    button.dataset.leagueId=item.id;
    button.textContent=item.title;
    const selected=item.id===leagueStandingsSelectedId;
    button.classList.toggle('active',selected);
    button.setAttribute('role','tab');
    button.setAttribute('aria-selected',selected?'true':'false');
    button.addEventListener('click',()=>selectLeagueStandings(item.id));
    leagueStandingsTabs.appendChild(button);
  });
}

function leagueStandingsCellContent(cell){
  const text=String(cell && cell.text || '');
  const href=leagueStandingsSafeLink(cell && cell.href);
  if(href && text){
    const link=document.createElement('a');
    link.href=href;
    link.target='_blank';
    link.rel='noopener noreferrer';
    link.textContent=text;
    link.title='Beim Ergebnisdienst öffnen';
    return link;
  }
  return document.createTextNode(text || '–');
}

function leagueStandingsRoundHeaderKind(header){
  const normalized=String(header || '').trim().toLowerCase();
  if(normalized==='heim'||normalized==='gast'||normalized==='mannschaft')return 'team';
  if(normalized==='ergebnis')return 'result';
  if(normalized==='paar')return 'pairing';
  if(normalized==='tln')return 'participant';
  if(normalized==='dwz')return 'rating';
  if(normalized==='spieltermin'||normalized==='termin')return 'date';
  return 'value';
}

function leagueStandingsDefaultRoundIndex(rounds){
  const today=new Date();
  const todayIso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const next=rounds.findIndex(round=>/^\d{4}-\d{2}-\d{2}$/.test(String(round&&round.dateIso || ''))&&round.dateIso>=todayIso);
  return next>=0?next:Math.max(0,rounds.length-1);
}

function renderLeagueStandingsRounds(league){
  if(!leagueStandingsRounds||!leagueStandingsRoundsList)return;
  const rounds=Array.isArray(league&&league.rounds)?league.rounds:[];
  const message=String(league&&league.roundsMessage || '');
  const sameLeague=leagueStandingsRounds.dataset.leagueId===String(league&&league.id || '');
  const openKeys=new Set(sameLeague?Array.from(leagueStandingsRoundsList.querySelectorAll('details[open]')).map(item=>String(item.dataset.roundKey || '')):[]);
  leagueStandingsRoundsList.replaceChildren();
  leagueStandingsRounds.dataset.leagueId=String(league&&league.id || '');
  leagueStandingsRounds.hidden=!rounds.length&&!message;
  if(leagueStandingsRoundsCount){
    leagueStandingsRoundsCount.textContent=rounds.length===1?'1 Spieltag':`${rounds.length} Spieltage`;
    leagueStandingsRoundsCount.hidden=!rounds.length;
  }
  if(leagueStandingsRoundsNotice){
    leagueStandingsRoundsNotice.textContent=message;
    leagueStandingsRoundsNotice.hidden=!message;
    leagueStandingsRoundsNotice.classList.toggle('warning',!!message);
  }
  if(!rounds.length)return;

  const defaultOpenIndex=leagueStandingsDefaultRoundIndex(rounds);
  rounds.forEach((round,index)=>{
    const headers=Array.isArray(round&&round.headers)?round.headers:[];
    const rows=Array.isArray(round&&round.rows)?round.rows:[];
    const label=String(round&&round.label || `Runde ${index+1}`);
    const roundKey=String(round&&round.number || round&&round.dateIso || index+1);
    const details=document.createElement('details');
    details.className='league-standings-round';
    details.dataset.roundKey=roundKey;
    details.open=sameLeague?openKeys.has(roundKey):index===defaultOpenIndex;

    const summary=document.createElement('summary');
    summary.className='league-standings-round-summary';
    const title=document.createElement('span');
    title.className='league-standings-round-title';
    const strong=document.createElement('strong');
    strong.textContent=label;
    const date=document.createElement('span');
    date.className='league-standings-round-date';
    date.textContent=String(round&&round.date || '');
    title.append(strong,date);
    const count=document.createElement('span');
    count.className='league-standings-round-match-count';
    count.textContent=rows.length===1?'1 Paarung':`${rows.length} Paarungen`;
    summary.append(title,count);

    const body=document.createElement('div');
    body.className='league-standings-round-body';
    const roundHref=leagueStandingsSafeLink(round&&round.href);
    if(roundHref){
      const linkRow=document.createElement('div');
      linkRow.className='league-standings-round-link-row';
      const link=document.createElement('a');
      link.className='league-standings-round-link';
      link.href=roundHref;
      link.target='_blank';
      link.rel='noopener noreferrer';
      link.textContent='Einzelergebnisse dieser Runde öffnen ↗';
      linkRow.appendChild(link);
      body.appendChild(linkRow);
    }

    const scroll=document.createElement('div');
    scroll.className='league-standings-round-table-scroll';
    scroll.tabIndex=0;
    scroll.setAttribute('aria-label',`${label} horizontal verschiebbar`);
    const table=document.createElement('table');
    table.className='league-standings-round-table';
    const thead=document.createElement('thead');
    const headerRow=document.createElement('tr');
    headers.forEach((header,columnIndex)=>{
      const th=document.createElement('th');
      th.scope='col';
      th.textContent=String(header || '');
      th.dataset.kind=leagueStandingsRoundHeaderKind(header);
      th.dataset.column=String(columnIndex);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    const tbody=document.createElement('tbody');
    rows.forEach(row=>{
      const tr=document.createElement('tr');
      const cells=Array.isArray(row&&row.cells)?row.cells:[];
      headers.forEach((header,columnIndex)=>{
        const cell=cells[columnIndex] || {};
        const td=document.createElement('td');
        td.dataset.kind=String(cell.kind || leagueStandingsRoundHeaderKind(header));
        td.dataset.column=String(columnIndex);
        td.appendChild(leagueStandingsCellContent(cell));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.append(thead,tbody);
    scroll.appendChild(table);
    body.appendChild(scroll);
    details.append(summary,body);
    leagueStandingsRoundsList.appendChild(details);
  });
}

function renderLeagueStandingsTable(){
  if(!leagueStandingsCard || !leagueStandingsTable) return;
  const league=leagueStandingsSelected();
  if(!league){
    leagueStandingsCard.hidden=true;
    renderLeagueStandingsRounds(null);
    if(leagueStandingsStatus){
      const isAdmin=!!(onlineAuthUser && onlineAuthUser.isAdmin===true);
      leagueStandingsStatus.hidden=false;
      leagueStandingsStatus.textContent=isAdmin
        ? 'Noch keine aktive Ligatabelle eingerichtet. Unten kannst du die erste Tabelle hinzufügen.'
        : 'Momentan ist keine Ligatabelle freigeschaltet.';
    }
    return;
  }

  leagueStandingsTitle.textContent=league.title || 'Ligatabelle';
  const sourceUrl=leagueStandingsSafeLink(league.sourceUrl);
  if(leagueStandingsSourceLink){
    leagueStandingsSourceLink.hidden=!sourceUrl;
    leagueStandingsSourceLink.href=sourceUrl || '#';
  }
  if(leagueStandingsNotice){
    leagueStandingsNotice.hidden=!league.message;
    leagueStandingsNotice.textContent=league.message || '';
    leagueStandingsNotice.classList.toggle('warning',league.stale===true);
  }
  renderLeagueStandingsRounds(league);

  leagueStandingsTable.replaceChildren();
  const table=league.table && typeof league.table==='object' ? league.table : null;
  const headers=table && Array.isArray(table.headers) ? table.headers : [];
  const rows=table && Array.isArray(table.rows) ? table.rows : [];
  if(!headers.length || !rows.length){
    leagueStandingsCard.hidden=false;
    if(leagueStandingsStatus){
      leagueStandingsStatus.hidden=false;
      leagueStandingsStatus.textContent=league.message || 'Diese Ligatabelle ist momentan nicht verfügbar.';
    }
    if(leagueStandingsMeta) leagueStandingsMeta.textContent='';
    return;
  }

  const thead=document.createElement('thead');
  const headRow=document.createElement('tr');
  headers.forEach((header,index)=>{
    const th=document.createElement('th');
    th.scope='col';
    th.textContent=String(header || '');
    const normalized=String(header || '').trim().toLowerCase();
    const kind=normalized==='mannschaft'?'team':(normalized==='rg'?'rank':(/^\d+$/.test(normalized)?'round':'value'));
    th.dataset.kind=kind;
    th.dataset.column=String(index);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody=document.createElement('tbody');
  rows.forEach((row,rowIndex)=>{
    const tr=document.createElement('tr');
    const cells=Array.isArray(row && row.cells)?row.cells:[];
    headers.forEach((_,columnIndex)=>{
      const cell=cells[columnIndex] || {};
      const td=document.createElement('td');
      td.dataset.kind=String(cell.kind || 'value');
      td.dataset.column=String(columnIndex);
      if(cell.movement) td.dataset.movement=String(cell.movement);
      td.appendChild(leagueStandingsCellContent(cell));
      if(rowIndex % 2) td.classList.add('alternate');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  leagueStandingsTable.append(thead,tbody);
  leagueStandingsCard.hidden=false;
  if(leagueStandingsStatus) leagueStandingsStatus.hidden=true;
  if(leagueStandingsMeta){
    const count=Number(table.teamCount || rows.length) || rows.length;
    const updated=leagueStandingsDate(league.fetchedAt || league.checkedAt);
    leagueStandingsMeta.textContent=`${count} Mannschaft${count===1?'':'en'} · ${headers.length} Spalten${updated?` · Stand: ${updated}`:''}`;
  }
}

function leagueStandingsAdminMessage(message,kind){
  if(!leagueStandingsAdminStatus)return;
  leagueStandingsAdminStatus.textContent=message || '';
  leagueStandingsAdminStatus.className='league-standings-admin-status'+(kind?` ${kind}`:'');
}

function leagueStandingsAdminDraft(item,index){
  const source=item && typeof item==='object'?item:{};
  return {
    id:String(source.id || `draft_${Date.now()}_${index}`),
    title:String(source.title || ''),
    sourceUrl:String(source.sourceUrl || ''),
    enabled:source.enabled !== false,
    checkedAt:source.checkedAt || null,
    fetchedAt:source.fetchedAt || null,
    lastError:String(source.lastError || ''),
    persisted:!!source.id && !String(source.id).startsWith('draft_')
  };
}

function updateLeagueStandingsAdminCount(){
  if(leagueStandingsAdminCount) leagueStandingsAdminCount.textContent=`${leagueStandingsAdminDrafts.length} von ${leagueStandingsMax} Plätzen belegt`;
  if(leagueStandingsAddBtn) leagueStandingsAddBtn.disabled=leagueStandingsAdminDrafts.length>=leagueStandingsMax;
}

function renderLeagueStandingsAdmin(){
  if(!leagueStandingsAdminList)return;
  leagueStandingsAdminList.replaceChildren();
  if(!leagueStandingsAdminDrafts.length){
    const empty=document.createElement('div');
    empty.className='league-standings-admin-empty';
    empty.textContent='Noch keine Ligatabelle eingerichtet. Mit „Tabelle hinzufügen“ legst du den ersten Eintrag an.';
    leagueStandingsAdminList.appendChild(empty);
  }
  leagueStandingsAdminDrafts.forEach((draft,index)=>{
    const card=document.createElement('article');
    card.className='league-standings-admin-item';
    card.dataset.leagueAdminId=draft.id;

    const head=document.createElement('div');
    head.className='league-standings-admin-item-head';
    const number=document.createElement('strong');
    number.textContent=`Platz ${index+1}`;
    const controls=document.createElement('div');
    controls.className='league-standings-admin-item-controls';
    const up=document.createElement('button');
    up.type='button';up.className='button-flat';up.textContent='↑';up.title='Nach oben';up.disabled=index===0;
    const down=document.createElement('button');
    down.type='button';down.className='button-flat';down.textContent='↓';down.title='Nach unten';down.disabled=index===leagueStandingsAdminDrafts.length-1;
    const remove=document.createElement('button');
    remove.type='button';remove.className='button-flat league-standings-admin-remove';remove.textContent='Entfernen';
    controls.append(up,down,remove);
    head.append(number,controls);

    const fields=document.createElement('div');
    fields.className='league-standings-admin-fields';
    const titleField=document.createElement('label');
    titleField.className='league-standings-field';
    titleField.appendChild(Object.assign(document.createElement('span'),{textContent:'Liganame'}));
    const titleInput=document.createElement('input');
    titleInput.type='text';titleInput.maxLength=120;titleInput.value=draft.title;
    titleInput.placeholder='z. B. Verbandsbezirksliga 1';
    titleField.appendChild(titleInput);

    const urlField=document.createElement('label');
    urlField.className='league-standings-field league-standings-field-wide';
    urlField.appendChild(Object.assign(document.createElement('span'),{textContent:'Adresse der Ranglistentabelle'}));
    const urlInput=document.createElement('input');
    urlInput.type='url';urlInput.maxLength=500;urlInput.value=draft.sourceUrl;
    urlInput.placeholder='https://ergebnisdienst.…/Adresse-der-Ligatabelle';
    urlInput.spellcheck=false;
    urlField.appendChild(urlInput);

    const enabledLabel=document.createElement('label');
    enabledLabel.className='league-standings-enabled';
    const enabledInput=document.createElement('input');
    enabledInput.type='checkbox';enabledInput.checked=draft.enabled;
    enabledLabel.append(enabledInput,document.createTextNode(' Diese Tabelle für Mitglieder anzeigen'));
    fields.append(titleField,urlField,enabledLabel);

    const foot=document.createElement('div');
    foot.className='league-standings-admin-item-foot';
    const state=document.createElement('span');
    const date=leagueStandingsDate(draft.fetchedAt || draft.checkedAt);
    state.textContent=draft.lastError ? `Letzter Hinweis: ${draft.lastError}` : (date?`Zuletzt erfolgreich geladen: ${date}`:'Noch nicht geladen');
    state.classList.toggle('error',!!draft.lastError);
    const refresh=document.createElement('button');
    refresh.type='button';refresh.className='button-flat';refresh.textContent='Jetzt prüfen / aktualisieren';
    refresh.disabled=!draft.persisted;
    refresh.title=draft.persisted?'Diese gespeicherte Adresse sofort neu abrufen.':'Bitte den neuen Eintrag zuerst speichern.';
    foot.append(state,refresh);
    card.append(head,fields,foot);
    leagueStandingsAdminList.appendChild(card);

    const markDirty=()=>{leagueStandingsAdminDirty=true;leagueStandingsAdminMessage('Änderungen noch nicht gespeichert.','');};
    titleInput.addEventListener('input',()=>{draft.title=titleInput.value;markDirty();});
    urlInput.addEventListener('input',()=>{draft.sourceUrl=urlInput.value;markDirty();});
    enabledInput.addEventListener('change',()=>{draft.enabled=enabledInput.checked;markDirty();});
    up.addEventListener('click',()=>moveLeagueStandingsAdmin(index,-1));
    down.addEventListener('click',()=>moveLeagueStandingsAdmin(index,1));
    remove.addEventListener('click',()=>removeLeagueStandingsAdmin(index));
    refresh.addEventListener('click',()=>refreshLeagueStandingsAdmin(draft.id,refresh));
  });
  updateLeagueStandingsAdminCount();
}

function moveLeagueStandingsAdmin(index,direction){
  const target=index+direction;
  if(index<0||target<0||index>=leagueStandingsAdminDrafts.length||target>=leagueStandingsAdminDrafts.length)return;
  const moved=leagueStandingsAdminDrafts.splice(index,1)[0];
  leagueStandingsAdminDrafts.splice(target,0,moved);
  leagueStandingsAdminDirty=true;
  leagueStandingsAdminMessage('Reihenfolge geändert – noch nicht gespeichert.','');
  renderLeagueStandingsAdmin();
}

function removeLeagueStandingsAdmin(index){
  if(index<0||index>=leagueStandingsAdminDrafts.length)return;
  leagueStandingsAdminDrafts.splice(index,1);
  leagueStandingsAdminDirty=true;
  leagueStandingsAdminMessage('Eintrag entfernt – endgültig wird dies erst beim Speichern.','');
  renderLeagueStandingsAdmin();
}

function addLeagueStandingsAdmin(){
  if(leagueStandingsAdminDrafts.length>=leagueStandingsMax)return;
  leagueStandingsAdminDrafts.push(leagueStandingsAdminDraft(null,leagueStandingsAdminDrafts.length));
  leagueStandingsAdminDirty=true;
  renderLeagueStandingsAdmin();
  const last=leagueStandingsAdminList && leagueStandingsAdminList.lastElementChild;
  if(last){
    const input=last.querySelector('input');
    if(input)input.focus();
    last.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
}

async function saveLeagueStandingsAdmin(){
  if(!onlineAuthUser||onlineAuthUser.isAdmin!==true||!leagueStandingsSaveBtn)return;
  leagueStandingsSaveBtn.disabled=true;
  if(leagueStandingsAddBtn)leagueStandingsAddBtn.disabled=true;
  leagueStandingsAdminMessage('Ligakonfiguration wird gespeichert …','');
  try{
    const payload={pageTitle:String(leagueStandingsPageTitleDraft || '').trim(),leagues:leagueStandingsAdminDrafts.map(draft=>({
      id:draft.persisted?draft.id:'',
      title:String(draft.title || '').trim(),
      sourceUrl:String(draft.sourceUrl || '').trim(),
      enabled:draft.enabled===true
    }))};
    const data=await authApi('/api/admin/league-standings',{method:'POST',body:JSON.stringify(payload)});
    leagueStandingsAdminDirty=false;
    applyLeagueStandingsData(data,true);
    leagueStandingsAdminMessage(data.message || 'Die Ligakonfiguration wurde gespeichert.','success');
  }catch(error){
    leagueStandingsAdminMessage(error&&error.message?error.message:'Die Ligakonfiguration konnte nicht gespeichert werden.','error');
  }finally{
    if(leagueStandingsSaveBtn)leagueStandingsSaveBtn.disabled=false;
    updateLeagueStandingsAdminCount();
  }
}

async function refreshLeagueStandingsAdmin(id,button){
  if(!onlineAuthUser||onlineAuthUser.isAdmin!==true||!id||String(id).startsWith('draft_'))return;
  if(button)button.disabled=true;
  leagueStandingsAdminMessage('Die ausgewählte Tabelle und ihre Runden werden beim Ergebnisdienst geprüft …','');
  try{
    const data=await authApi(`/api/admin/league-standings/${encodeURIComponent(id)}/refresh`,{method:'POST',body:'{}'});
    const league=data.league;
    const index=leagueStandingsData.findIndex(item=>item.id===id);
    if(index>=0)leagueStandingsData[index]=league;
    const draft=leagueStandingsAdminDrafts.find(item=>item.id===id);
    if(draft&&league){draft.checkedAt=league.checkedAt;draft.fetchedAt=league.fetchedAt;draft.lastError=league.lastError || '';}
    renderLeagueStandingsAdmin();
    selectLeagueStandings(leagueStandingsSelectedId,{persist:false});
    leagueStandingsAdminMessage(data.message || 'Die Ligadaten wurden geprüft.',league&&league.lastError?'error':'success');
  }catch(error){
    leagueStandingsAdminMessage(error&&error.message?error.message:'Die Ligadaten konnten nicht aktualisiert werden.','error');
  }finally{
    if(button&&button.isConnected)button.disabled=false;
  }
}

function applyLeagueStandingsData(data,adminResponse){
  leagueStandingsMax=Math.max(1,Number(data&&data.maxLeagues)||15);
  const incomingPageTitle=String(data&&data.pageTitle || LEAGUE_STANDINGS_DEFAULT_PAGE_TITLE).trim() || LEAGUE_STANDINGS_DEFAULT_PAGE_TITLE;
  if(leagueStandingsPageTitle)leagueStandingsPageTitle.textContent=incomingPageTitle;
  leagueStandingsData=Array.isArray(data&&data.leagues)?data.leagues:[];
  const active=leagueStandingsActiveLeagues();
  let stored='';
  try{stored=String(localStorage.getItem(LEAGUE_STANDINGS_SELECTED_KEY)||'');}catch(_){ }
  if(!active.some(item=>item.id===leagueStandingsSelectedId)){
    leagueStandingsSelectedId=(active.find(item=>item.id===stored)||active[0]||{}).id || '';
  }
  renderLeagueStandingsTabs();
  renderLeagueStandingsTable();
  const isAdmin=!!(onlineAuthUser&&onlineAuthUser.isAdmin===true);
  if(leagueStandingsAdminCard)leagueStandingsAdminCard.hidden=!isAdmin;
  if(isAdmin&&adminResponse&&!leagueStandingsAdminDirty){
    leagueStandingsPageTitleDraft=incomingPageTitle;
    if(leagueStandingsPageTitleInput)leagueStandingsPageTitleInput.value=incomingPageTitle;
    leagueStandingsAdminDrafts=leagueStandingsData.map(leagueStandingsAdminDraft);
    renderLeagueStandingsAdmin();
  }
}

async function loadLeagueStandings(options){
  if(leagueStandingsLoading||!onlineAuthToken||!onlineAuthUser)return;
  leagueStandingsLoading=true;
  if(leagueStandingsReloadBtn)leagueStandingsReloadBtn.disabled=true;
  if(leagueStandingsStatus&&!leagueStandingsData.length){leagueStandingsStatus.hidden=false;leagueStandingsStatus.textContent='Ligatabellen werden geladen …';}
  try{
    const isAdmin=onlineAuthUser.isAdmin===true;
    const data=await authApi(isAdmin?'/api/admin/league-standings':'/api/league-standings');
    applyLeagueStandingsData(data,isAdmin);
    if(isAdmin&&!leagueStandingsAdminDirty&&leagueStandingsAdminStatus&&!options?.silent)leagueStandingsAdminMessage('','');
  }catch(error){
    if(leagueStandingsStatus){leagueStandingsStatus.hidden=false;leagueStandingsStatus.textContent=error&&error.message?error.message:'Die Ligatabellen konnten nicht geladen werden.';}
  }finally{
    leagueStandingsLoading=false;
    if(leagueStandingsReloadBtn)leagueStandingsReloadBtn.disabled=false;
  }
}

function startLeagueStandingsPolling(){
  stopLeagueStandingsPolling();
  leagueStandingsPollTimer=setInterval(()=>{
    if(leagueStandingsToolActive&&document.visibilityState!=='hidden')loadLeagueStandings({silent:true});
  },5*60*1000);
}

function stopLeagueStandingsPolling(){
  if(leagueStandingsPollTimer){clearInterval(leagueStandingsPollTimer);leagueStandingsPollTimer=null;}
}

if(leagueStandingsReloadBtn)leagueStandingsReloadBtn.addEventListener('click',()=>loadLeagueStandings());
if(leagueStandingsPageTitleInput)leagueStandingsPageTitleInput.addEventListener('input',()=>{
  leagueStandingsPageTitleDraft=leagueStandingsPageTitleInput.value;
  leagueStandingsAdminDirty=true;
  leagueStandingsAdminMessage('Änderungen noch nicht gespeichert.','');
});
if(leagueStandingsAddBtn)leagueStandingsAddBtn.addEventListener('click',addLeagueStandingsAdmin);
if(leagueStandingsSaveBtn)leagueStandingsSaveBtn.addEventListener('click',saveLeagueStandingsAdmin);

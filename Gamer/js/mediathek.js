'use strict';

let mediathekToolActive = false;
let mediathekToolFrameStarted = false;
let mediathekToolFrameReady = false;
let mediathekToolLastOpenAt = 0;
const mediathekToolBtn = document.getElementById('mediathekToolBtn');
const mediathekToolView = document.getElementById('mediathekToolView');
const mediathekToolFrame = document.getElementById('mediathekToolFrame');
const MEDIATHEK_SELECTION_KEY = 'hammerschachMediathekSelectionV1';
let mediathekSelection = 'uebersicht';
function validMediathekSelection(value){
  return value==='uebersicht' || HAMMERSCHACH_MEDIATHEK.categories.some(item=>item.id===value) || HAMMERSCHACH_MEDIATHEK.entries.some(item=>item.id===value);
}
try{
  const saved=localStorage.getItem(MEDIATHEK_SELECTION_KEY);
  if(validMediathekSelection(saved))mediathekSelection=saved;
}catch(_){}
function mediathekToolAvailable(){return !onlineRoomId && !hasOnlineTargetInAddress();}
function mediathekToolNavigable(){return !onlineSpectatorOnly || !(onlineAuthToken && onlineAuthUser);}
function mediathekSelectionTitle(){
  return HAMMERSCHACH_MEDIATHEK.entries.find(item=>item.id===mediathekSelection)?.title || HAMMERSCHACH_MEDIATHEK.categories.find(item=>item.id===mediathekSelection)?.title || 'Übersicht';
}
function postMediathekToolMessage(message){
  if(!mediathekToolFrameStarted || !mediathekToolFrame?.contentWindow)return;
  mediathekToolFrame.contentWindow.postMessage(message,embeddedToolTargetOrigin());
}
function postMediathekToolContext(){
  postMediathekToolMessage({type:'hammerschach-mediathek-context',darkMode:!!darkModeEnabled,visible:mediathekToolActive});
}
function updateMediathekSelection(){
  document.querySelectorAll('[data-mediathek-id]').forEach(button=>{
    if(button.dataset.mediathekId===mediathekSelection)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  if(mediathekToolFrame){
    mediathekToolFrame.title='Mediathek · '+mediathekSelectionTitle();
    mediathekToolFrame.dataset.src='./Mediathek/?v=20260907-1#'+mediathekSelection;
  }
  if(mediathekToolView)mediathekToolView.setAttribute('aria-label','Mediathek – '+mediathekSelectionTitle());
}
function selectMediathek(selection,fromFrame=false){
  if(!validMediathekSelection(selection))return;
  const changed=mediathekSelection!==selection;
  mediathekSelection=selection;
  try{localStorage.setItem(MEDIATHEK_SELECTION_KEY,selection);}catch(_){}
  updateMediathekSelection();
  if(!fromFrame && changed){
    if(mediathekToolActive && mediathekToolFrameStarted){
      if(mediathekToolFrameReady)postMediathekToolMessage({type:'hammerschach-mediathek-select',selection});
    }else mediathekToolFrameStarted=false;
  }
  if(mediathekToolActive && statusEl)statusEl.textContent=embeddedToolStatusText();
}
function openMediathekToolDebounced(){
  const now=Date.now();
  if(now-mediathekToolLastOpenAt<EMBEDDED_TOOL_OPEN_DEBOUNCE_MS)return;
  mediathekToolLastOpenAt=now;
  openEmbeddedToolFromCurrentContext('mediathek');
}
const mediathekMenus=document.getElementById('mediathekMenus');
if(mediathekMenus){
  HAMMERSCHACH_MEDIATHEK.categories.forEach(category=>{
    const menu=document.createElement('div');
    // Exakt dieselben Menüklassen und derselbe Controller wie bei Schach aktuell.
    menu.className='header-menu schach-news-menu mediathek-category-menu';
    const button=document.createElement('button');
    button.className='button-flat name-action-btn header-menu-button';
    button.type='button';
    button.setAttribute('aria-haspopup','menu');
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls','mediathekMenu-'+category.id);
    const label=document.createElement('span');
    label.textContent=category.icon+' '+category.title;
    const chevron=document.createElement('span');
    chevron.className='header-menu-chevron';
    chevron.textContent='▾';
    chevron.setAttribute('aria-hidden','true');
    button.append(label,chevron);
    const popup=document.createElement('div');
    popup.id='mediathekMenu-'+category.id;
    popup.className='header-menu-popup';
    popup.setAttribute('role','menu');
    popup.setAttribute('aria-label',category.title+' auswählen');
    popup.hidden=true;
    const items=[{id:category.id,title:category.title+' – Übersicht'},...HAMMERSCHACH_MEDIATHEK.entries.filter(item=>item.category===category.id)];
    items.forEach(item=>{
      const choice=document.createElement('button');
      choice.className='header-menu-item';
      choice.type='button';
      choice.setAttribute('role','menuitem');
      choice.dataset.mediathekId=item.id;
      choice.textContent=item.menuTitle || item.title;
      choice.addEventListener('click',()=>selectMediathek(item.id));
      popup.appendChild(choice);
    });
    menu.append(button,popup);
    mediathekMenus.appendChild(menu);
    registerHeaderMenu(menu,button,popup,category.title);
    popup.addEventListener('click',event=>{
      if(event.target.closest('[role="menuitem"]'))button.focus();
    });
  });
}
document.getElementById('mediathekOverviewBtn')?.addEventListener('click',()=>selectMediathek('uebersicht'));
mediathekToolBtn?.addEventListener('click',openMediathekToolDebounced);
mediathekToolFrame?.addEventListener('load',postMediathekToolContext);
window.addEventListener('message',event=>{
  if(!mediathekToolFrame || event.source!==mediathekToolFrame.contentWindow)return;
  if(embeddedToolTargetOrigin()!=='*' && event.origin!==embeddedToolTargetOrigin())return;
  const message=event.data;
  if(!message || typeof message!=='object')return;
  if(!mediathekToolActive)return;
  if(message.type==='hammerschach-mediathek-ready'){
    mediathekToolFrameReady=true;
    postMediathekToolContext();
    postMediathekToolMessage({type:'hammerschach-mediathek-select',selection:mediathekSelection});
  }
  if(message.type==='hammerschach-mediathek-selection' && mediathekToolFrameReady)selectMediathek(message.selection,true);
});
updateMediathekSelection();

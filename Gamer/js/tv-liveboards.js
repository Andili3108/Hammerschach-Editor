'use strict';
// The existing Liveboard view is moved, never cloned. TV navigation/player stay intact.
const TvLiveBoards = (() => {
  const byId=id=>document.getElementById(id);
  const enabled=byId('tvLiveBoardsEnabled'),start=byId('tvLiveBoardsStart'),opener=byId('tvLiveBoardsOpen');
  const view=byId('liveBoardView'),home=document.createComment('Liveboard home');
  view.before(home);
  let catalog=[],catalogLoaded=false,loading=false,request=null,requestToken='',windowSlot='',favorites=[],drag=null;
  const shell=document.createElement('section');
  shell.id='tvLiveBoardWindow';shell.hidden=true;shell.setAttribute('role','dialog');shell.setAttribute('aria-modal','false');shell.setAttribute('aria-labelledby','tvLiveBoardWindowTitle');
  shell.innerHTML=`<header class="tv-lb-titlebar"><strong id="tvLiveBoardWindowTitle" tabindex="0" title="Zum Verschieben ziehen oder Pfeiltasten verwenden">♟ Liveboards</strong><button type="button" class="button-flat" data-tv-lb="minimize" aria-label="Liveboards minimieren">−</button><button type="button" class="button-flat" data-tv-lb="close" aria-label="Liveboards schließen">✕</button></header><div class="tv-lb-body"><nav class="tv-lb-navigation" aria-label="Liveboard-Auswahl"><select aria-label="Bevorzugtes Turnier" data-tv-lb="favorites"></select><button type="button" class="button-flat" data-tv-lb="tournament">Alle Turniere</button><button type="button" class="button-flat" data-tv-lb="club">Vereinsschach</button></nav><div class="tv-lb-content"></div></div>`;
  document.body.append(shell);
  const control=name=>shell.querySelector(`[data-tv-lb="${name}"]`);
  const favoriteSelect=control('favorites'),titlebar=shell.querySelector('.tv-lb-titlebar');
  function events(slot){return Array.isArray(slot?.liveBoardEvents)?slot.liveBoardEvents:[];}
  function selected(){return events(tvAdminDraft(hammerschachTvAdminSlotId));}
  function dirty(){hammerschachTvAdminDirty=true;captureTvAdminForm();}
  function populate(slot){
    enabled.checked=slot.liveBoardsEnabled===true;start.value=slot.liveBoardStart==='first'?'first':'selection';renderPicker();
  }
  function renderPicker(){
    const chosen=selected(),list=byId('tvLiveBoardsSelected');list.replaceChildren();
    for(const event of chosen){
      const row=document.createElement('div');row.className='tv-lb-selected';
      const label=document.createElement('span');label.textContent=event.title;
      const remove=document.createElement('button');remove.type='button';remove.className='button-flat';remove.textContent='Entfernen';remove.setAttribute('aria-label',event.title+' entfernen');
      remove.addEventListener('click',()=>updateSelection(chosen.filter(e=>e.id!==event.id)));row.append(label,remove);list.append(row);
    }
    const container=byId('tvLiveBoardsChoices');container.replaceChildren();
    const query=byId('tvLiveBoardsSearch').value.trim().toLocaleLowerCase('de');
    const matches=catalog.filter(e=>(e.title+' '+(e.country||'')+' '+(e.location||'')).toLocaleLowerCase('de').includes(query));
    for(const event of matches){
      const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=chosen.some(e=>e.id===event.id);checkbox.disabled=!checkbox.checked&&chosen.length>=12;
      checkbox.addEventListener('change',()=>updateSelection(checkbox.checked?[...selected(),{id:event.id,title:event.title,category:event.category}]:selected().filter(e=>e.id!==event.id)));
      label.append(checkbox,document.createTextNode(event.title+(event.round?' · '+event.round:'')+' · '+(event.category==='club'?'Vereinsschach':'Turnierschach')));container.append(label);
    }
    if(catalogLoaded&&!matches.length)container.textContent='Keine passenden Turniere im geladenen Angebot.';
  }
  function updateSelection(next){dirty();hammerschachTvAdminDrafts[hammerschachTvAdminSlotId].liveBoardEvents=next.slice(0,12);renderPicker();}
  async function loadCatalog(){
    if(loading||!onlineAuthUser?.isAdmin)return;
    loading=true;requestToken=onlineAuthToken;const token=requestToken;
    const controller=new AbortController();request=controller;
    const timeout=setTimeout(()=>controller.abort(),30000);
    byId('tvLiveBoardsReload').disabled=true;byId('tvLiveBoardsStatus').textContent='Turniere werden geladen …';
    try{
      const results=await Promise.allSettled(['tournament','club'].map(category=>authApi('/api/live-board/events?category='+category,{signal:controller.signal,cache:'no-store'})));
      if(token!==onlineAuthToken)return;
      const loaded=results.flatMap(r=>r.status==='fulfilled'?r.value.events||[]:[]);
      if(results.every(r=>r.status==='rejected'))throw Error('Das Turnierangebot konnte nicht geladen werden. Bitte erneut versuchen.');
      catalog=[...new Map(loaded.map(e=>[e.id,e])).values()];catalogLoaded=true;renderPicker();
      const partial=results.some(r=>r.status==='rejected'||r.value.stale||r.value.discoveryUnavailable||r.value.publisherUnavailable||r.value.savedUnavailable||r.value.chessbaseUnavailable);
      byId('tvLiveBoardsStatus').textContent=`${catalog.length} Veranstaltungen geladen.`+(partial?' Einige Quellen sind derzeit nicht verfügbar.':'')+' Bis zu zwölf Zuordnungen möglich.';
    }catch(error){if(token===onlineAuthToken)byId('tvLiveBoardsStatus').textContent=error.message;}
    finally{clearTimeout(timeout);loading=false;request=null;byId('tvLiveBoardsReload').disabled=false;}
  }
  function sync(slot){
    const available=slot.enabled===true&&slot.liveBoardsEnabled===true&&!!onlineAuthUser;
    opener.hidden=!available;
    if(!shell.hidden&&(!available||windowSlot!==slot.slotId))close(false);
    if(requestToken&&requestToken!==onlineAuthToken){request?.abort();catalog=[];catalogLoaded=false;requestToken='';}
  }
  function clampPosition(left,top){
    const rect=shell.getBoundingClientRect();
    shell.style.left=Math.round(Math.max(0,Math.min(left,window.innerWidth-rect.width)))+'px';
    const y=Math.round(Math.max(0,Math.min(top,window.innerHeight-Math.min(rect.height,80))));
    shell.style.top=y+'px';shell.style.maxHeight=Math.max(60,window.innerHeight-y-8)+'px';
  }
  function minimized(value){
    if(value){HammerschachLiveBoard.pauseTv();shell.classList.add('is-minimized');}
    else{shell.classList.remove('is-minimized');HammerschachLiveBoard.resumeTv();}
    control('minimize').textContent=value?'□':'−';control('minimize').setAttribute('aria-label',value?'Liveboards wiederherstellen':'Liveboards minimieren');
    const rect=shell.getBoundingClientRect();clampPosition(rect.left,rect.top);
  }
  function close(focus=true){
    if(shell.hidden)return;
    shell.hidden=true;windowSlot='';drag=null;shell.classList.remove('is-dragging');
    HammerschachLiveBoard.pauseTv();home.after(view);
    // setView also calls close; hiding the shell first makes that call a no-op.
    HammerschachLiveBoard.setView('');
    if(focus&&!opener.hidden)opener.focus({preventScroll:true});
  }
  function chooseCategory(category){
    HammerschachLiveBoard.pauseTv();HammerschachLiveBoard.setView(category,{floating:true});favoriteSelect.value='';
  }
  function open(){
    const slot=tvSlotById(hammerschachTvSelectedSlotId);
    if(!tvToolActive||!onlineAuthToken||!slot?.enabled||!slot.liveBoardsEnabled)return;
    if(!shell.hidden){minimized(false);control('minimize').focus();return;}
    // Match the full-page Liveboard width, including its notation column.
    const width=home.parentElement.getBoundingClientRect().width;
    shell.style.width=Math.min((width||1100)+2,window.innerWidth-16)+'px';
    shell.classList.remove('is-minimized');control('minimize').textContent='−';control('minimize').setAttribute('aria-label','Liveboards minimieren');
    shell.hidden=false;windowSlot=slot.slotId;favorites=events(slot);
    shell.querySelector('.tv-lb-content').append(view);
    byId('tvLiveBoardWindowTitle').textContent='♟ Liveboards · '+slot.slotId.toUpperCase();
    favoriteSelect.replaceChildren(new Option('Bevorzugtes Turnier auswählen',''));
    for(const event of favorites)favoriteSelect.add(new Option(event.title,event.id));
    favoriteSelect.hidden=!favorites.length;
    chooseCategory('tournament');
    if(slot.liveBoardStart==='first'&&favorites.length){favoriteSelect.value=favorites[0].id;HammerschachLiveBoard.openTvEvent(favorites[0]);}
    clampPosition(24,Math.min(100,window.innerHeight/8));
    control('minimize').focus({preventScroll:true});
  }
  favoriteSelect.addEventListener('change',()=>{const event=favorites.find(e=>e.id===favoriteSelect.value);if(event)HammerschachLiveBoard.openTvEvent(event);});
  control('tournament').addEventListener('click',()=>chooseCategory('tournament'));
  control('club').addEventListener('click',()=>chooseCategory('club'));
  control('close').addEventListener('click',()=>close());
  control('minimize').addEventListener('click',()=>minimized(!shell.classList.contains('is-minimized')));
  opener.addEventListener('click',open);
  enabled.addEventListener('change',dirty);start.addEventListener('change',dirty);
  byId('tvLiveBoardsSearch').addEventListener('input',renderPicker);
  byId('tvLiveBoardsReload').addEventListener('click',loadCatalog);
  byId('tvLiveBoardsPicker').addEventListener('toggle',()=>{if(byId('tvLiveBoardsPicker').open&&!catalogLoaded)loadCatalog();});
  shell.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
  titlebar.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('button'))return;
    const rect=shell.getBoundingClientRect();drag={x:event.clientX-rect.left,y:event.clientY-rect.top};
    titlebar.setPointerCapture(event.pointerId);shell.classList.add('is-dragging');event.preventDefault();
  });
  titlebar.addEventListener('pointermove',event=>{if(drag)clampPosition(event.clientX-drag.x,event.clientY-drag.y);});
  const endDrag=()=>{drag=null;shell.classList.remove('is-dragging');};
  titlebar.addEventListener('pointerup',endDrag);titlebar.addEventListener('pointercancel',endDrag);titlebar.addEventListener('lostpointercapture',endDrag);
  byId('tvLiveBoardWindowTitle').addEventListener('keydown',event=>{
    const offset={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];
    if(offset){event.preventDefault();const rect=shell.getBoundingClientRect();clampPosition(rect.left+offset[0],rect.top+offset[1]);}
  });
  window.addEventListener('resize',()=>{if(!shell.hidden){const rect=shell.getBoundingClientRect();clampPosition(rect.left,rect.top);}});
  return {populate,sync,close};
})();

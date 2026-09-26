'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const embedded=window.parent!==window;
  const origin=location.origin==='null'?'*':location.origin;
  const pending=new Map();
  let epoch=null,requestNumber=0,isAdmin=false,videos=[],dirty=false,editing=false;
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function post(message){if(embedded)window.parent.postMessage(message,origin);}
  function request(action,extra={}){
    return new Promise((resolve,reject)=>{
      const requestId=++requestNumber;
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Die Verbindung antwortet nicht. Bitte erneut versuchen.'));},15000);
      pending.set(requestId,{resolve,reject,timer});
      post({type:'impulses-request',requestId,epoch,action,...extra});
    });
  }
  function closeViewer(){const wasOpen=!$('viewer').hidden;$('viewer').hidden=true;$('viewerBody').replaceChildren();$('grid').hidden=false;$('hero').hidden=false;if(wasOpen){$('grid').querySelector('button')?.focus({preventScroll:true});post({type:'impulses-scroll-top'});}}
  function render(){
    $('grid').innerHTML=videos.map((video,i)=>`<article class="impulse-card"><div class="impulse-art" aria-hidden="true"><span class="symbol">${video.locked?'♜':'▶'}</span><span class="number">${String(i+1).padStart(2,'0')}</span></div><div class="impulse-copy"><span class="badge">${video.public?'Frei zugänglich':'Für Gamer-Mitglieder'}</span><h2>${escape(video.title)}</h2><button class="${video.locked?'quiet-button':'beginner-training-button'}" type="button" data-video="${i}" aria-label="${escape(video.title)} öffnen">${video.locked?'Kostenlos freischalten':'Video öffnen →'}</button></div></article>`).join('');
    if(!videos.length)$('status').textContent='Neue Trainingsimpulse folgen bald.';
  }
  async function loadCatalog(){
    const current=epoch;
    $('retry').hidden=true;
    $('status').textContent='Trainingsimpulse werden geladen …';
    try{
      const data=await request('catalog');
      if(current!==epoch)return;
      videos=data.videos;
      $('status').textContent='';render();
    }catch(error){if(current===epoch){$('status').textContent=error.message;$('retry').hidden=false;}}
  }
  function openVideo(index){
    const video=videos[index];
    if(!video)return;
    $('viewerTitle').textContent=video.title;
    if(video.locked){
      $('viewerBody').innerHTML='<div class="impulse-gate"><div class="eyebrow">Für Gamer-Mitglieder</div><h3>Dein nächster Impuls wartet.</h3><p>Kostenlos anmelden und alle Trainingsimpulse ansehen.</p><div class="editor-actions"><button type="button" class="beginner-training-button" data-auth="login">Anmelden</button><button type="button" class="quiet-button" data-auth="register">Kostenlos registrieren</button></div></div>';
    }else{
      $('viewerBody').innerHTML='<div class="impulse-player"><div class="video-consent"><span class="symbol" aria-hidden="true">▶</span><button id="loadVideo" class="beginner-training-button" type="button">Video laden</button><p>Erst mit deinem Klick wird eine Verbindung zu YouTube hergestellt.</p></div></div><p class="viewer-caption">YouTube · Falls die Wiedergabe hier nicht möglich ist: <a target="_blank" rel="noopener noreferrer">Auf YouTube öffnen ↗</a></p>';
      const id=video.videoId;
      if(!/^[\w-]{11}$/.test(id || ''))return;
      $('viewerBody').querySelector('a').href='https://www.youtube.com/watch?v='+id;
      $('loadVideo').addEventListener('click',()=>{
        const frame=document.createElement('iframe');
        frame.title=video.title;frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
        frame.referrerPolicy='strict-origin-when-cross-origin';
        frame.src='https://www.youtube-nocookie.com/embed/'+id+'?rel=0&playsinline=1';
        $('viewerBody').querySelector('.impulse-player').replaceChildren(frame);
      },{once:true});
    }
    $('viewer').hidden=false;$('grid').hidden=true;$('hero').hidden=true;
    $('viewerTitle').focus({preventScroll:true});post({type:'impulses-scroll-top'});
  }
  function hideEditor(){editing=false;dirty=false;$('editor').hidden=true;$('configure').disabled=false;}
  async function openEditor(){
    if(!isAdmin || editing)return;
    closeViewer();
    const current=epoch;
    $('configure').disabled=true;
    $('status').textContent='Konfiguration wird geladen …';
    try{
      const data=await request('config');
      if(current!==epoch || !isAdmin)return;
      $('slots').innerHTML=data.videos.map((video,i)=>`<div class="config-slot"><span class="slot-number">${i+1}</span><label for="title-${i}">Überschrift<input id="title-${i}" name="title-${i}" type="text" maxlength="160" value="${escape(video.title)}"></label><label for="url-${i}">YouTube-Link<input id="url-${i}" name="url-${i}" type="url" placeholder="https://www.youtube.com/watch?v=…" value="${escape(video.url)}"></label><label class="public-label" for="public-${i}"><input id="public-${i}" name="public-${i}" type="checkbox"${video.public?' checked':''}>Für Besucher freigeben</label></div>`).join('');
      editing=true;dirty=false;$('editor').hidden=false;$('editorStatus').textContent='';$('status').textContent='';$('editorTitle').focus();
    }catch(error){if(current===epoch){$('status').textContent=error.message;$('configure').disabled=false;}}
  }
  $('configForm').addEventListener('input',()=>{dirty=true;$('editorStatus').textContent='Noch nicht gespeichert.';});
  $('configForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!isAdmin || !editing)return;
    const current=epoch;
    const entries=Array.from({length:20},(_,i)=>({title:$('title-'+i).value.trim(),url:$('url-'+i).value.trim(),public:$('public-'+i).checked}));
    $('configFields').disabled=true;$('save').disabled=true;$('cancel').disabled=true;
    $('editorStatus').textContent='Wird gespeichert …';
    try{
      const data=await request('save',{videos:entries});
      if(current!==epoch)return;
      dirty=false;$('editorStatus').textContent=data.message;
      await loadCatalog();
    }catch(error){if(current===epoch)$('editorStatus').textContent=error.message;}
    finally{if(current===epoch){$('configFields').disabled=false;$('save').disabled=false;$('cancel').disabled=false;}}
  });
  $('cancel').addEventListener('click',()=>{hideEditor();$('configure').focus();});
  $('configure').addEventListener('click',openEditor);
  $('retry').addEventListener('click',loadCatalog);
  $('grid').addEventListener('click',event=>{const button=event.target.closest('[data-video]');if(button)openVideo(Number(button.dataset.video));});
  $('viewerBody').addEventListener('click',event=>{const button=event.target.closest('[data-auth]');if(button){closeViewer();post({type:'impulses-auth',mode:button.dataset.auth});}});
  $('closeViewer').addEventListener('click',closeViewer);
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && !$('viewer').hidden)closeViewer();});
  // Escape also removes the player, so no audio continues after the dialog closes.
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  window.addEventListener('message',event=>{
    if(event.source!==window.parent || (origin!=='*' && event.origin!==origin))return;
    const message=event.data;
    if(!message || typeof message!=='object')return;
    if(message.type==='impulses-context'){
      HammerschachAppearance.apply(message.colorScheme);
      if(message.epoch===epoch)return;
      epoch=message.epoch;isAdmin=message.isAdmin===true;
      pending.forEach(item=>{clearTimeout(item.timer);item.reject(new Error('Die Anmeldung hat sich geändert.'));});pending.clear();
      closeViewer();hideEditor();videos=[];$('grid').replaceChildren();$('slots').replaceChildren();
      $('configFields').disabled=false;$('save').disabled=false;$('cancel').disabled=false;
      $('configure').hidden=!isAdmin;loadCatalog().then(()=>{if(message.epoch===epoch)post({type:'impulses-scroll-top'});});
    }
    if(message.type==='impulses-result' && message.epoch===epoch){
      const item=pending.get(message.requestId);if(!item)return;
      clearTimeout(item.timer);pending.delete(message.requestId);
      if(message.ok)item.resolve(message.data);else item.reject(new Error(message.message || 'Anfrage fehlgeschlagen.'));
    }
  });
  let lastHeight=0;
  new ResizeObserver(()=>{
    const height=Math.ceil(document.querySelector('main').getBoundingClientRect().height);
    if(height!==lastHeight){lastHeight=height;post({type:'impulses-height',height});}
  }).observe(document.querySelector('main'));
  if(embedded)post({type:'impulses-ready'});
  else{$('status').textContent='Öffne die Trainingsimpulse im Gamer, damit deine Zugriffsrechte berücksichtigt werden.';$('standalone').hidden=false;}
})();

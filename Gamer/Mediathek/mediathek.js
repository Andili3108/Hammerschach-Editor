'use strict';
(() => {
  const catalog=window.HAMMERSCHACH_MEDIATHEK;
  const root=document.documentElement;
  const content=document.getElementById('mediathekContent');
  const embedded=window.parent!==window;
  const targetOrigin=window.location.origin==='null'?'*':window.location.origin;
  const toggle=document.getElementById('themeToggle');
  let players=[];
  let youtubeApiPromise=null;
  let renderVersion=0;
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const external=(label,url)=>`<a class="back-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
  function post(message){if(embedded)window.parent.postMessage(message,targetOrigin);}
  function syncTheme(){
    const dark=root.classList.contains('dark-mode');
    if(toggle){toggle.textContent=dark?'☀️':'🌙';toggle.setAttribute('aria-pressed',String(dark));toggle.setAttribute('aria-label',dark?'Helle Darstellung aktivieren':'Dunkle Darstellung aktivieren');}
    document.getElementById('themeColorMeta')?.setAttribute('content',dark?'#15171a':'#843f46');
  }
  toggle?.addEventListener('click',()=>{
    root.classList.toggle('dark-mode');
    try{localStorage.setItem('hammerschachGamerColorScheme',root.classList.contains('dark-mode')?'dark':'light');}catch(_){}
    syncTheme();
  });
  function destroyPlayers(){
    players.forEach(player=>{try{player.destroy();}catch(_){}});
    players=[];
  }
  function getYouTubeApi(){
    if(window.YT?.Player)return Promise.resolve(window.YT);
    if(youtubeApiPromise)return youtubeApiPromise;
    youtubeApiPromise=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('YouTube antwortet nicht')),15000);
      window.onYouTubeIframeAPIReady=()=>{clearTimeout(timer);resolve(window.YT);};
      const script=document.createElement('script');
      script.src='https://www.youtube.com/iframe_api';
      script.onerror=()=>{clearTimeout(timer);reject(new Error('YouTube nicht erreichbar'));};
      document.head.appendChild(script);
    });
    return youtubeApiPromise;
  }
  function showVideoFallback(box,id){
    box.innerHTML=`<div class="media-fallback"><p>Dieses Video kann hier nicht abgespielt werden.</p><a href="https://www.youtube.com/watch?v=${escape(id)}" target="_blank" rel="noopener noreferrer">Auf YouTube öffnen ↗</a></div>`;
  }
  async function startVideo(button){
    const box=button.closest('.media-player');
    const id=box.dataset.videoId;
    const version=renderVersion;
    button.disabled=true;
    button.querySelector('[data-play-label]').textContent='Video wird geladen …';
    try{
      const YT=await getYouTubeApi();
      if(!box.isConnected || version!==renderVersion)return;
      const target=document.createElement('div');
      box.replaceChildren(target);
      const vars={playsinline:1,rel:0};
      if(window.location.origin!=='null')vars.origin=window.location.origin;
      const player=new YT.Player(target,{
        host:'https://www.youtube-nocookie.com',videoId:id,playerVars:vars,
        events:{
          onReady:event=>{
            if(!box.isConnected || version!==renderVersion){event.target.destroy();return;}
            const frame=event.target.getIframe();
            frame.title=box.dataset.videoTitle;
            frame.setAttribute('allowfullscreen','');
            frame.focus();
            event.target.playVideo();
          },
          onStateChange:event=>{
            if(event.data===YT.PlayerState.PLAYING)players.forEach(other=>{if(other!==event.target){try{other.pauseVideo();}catch(_){}}});
          },
          onError:event=>{
            try{event.target.destroy();}catch(_){}
            if(box.isConnected && version===renderVersion)showVideoFallback(box,id);
          }
        }
      });
      players.push(player);
    }catch(_){if(box.isConnected && version===renderVersion)showVideoFallback(box,id);}
  }
  function videoMarkup(video){
    const [id,title]=video;
    const meta=catalog.videoMetadata?.[id];
    const preview=meta?`<img class="media-video-preview" src="${escape(meta.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'';
    return `<section class="media-video"><h3>${escape(title)}</h3><div class="media-player" data-video-id="${escape(id)}" data-video-title="${escape(title)}"><button class="media-video-start" type="button" aria-label="${escape(title)} starten">${preview}<span class="media-video-label"><span class="media-play-symbol" aria-hidden="true">▶</span><span data-play-label>Video laden</span><small>Der YouTube-Player wird erst nach deinem Klick geladen.</small></span></button></div>${meta?`<p class="media-video-credit">YouTube · ${escape(meta.author)}</p>`:''}</section>`;
  }
  function cardMarkup(item){
    const preview=item.image?.url || catalog.videoMetadata?.[item.videos[0][0]]?.thumbnail;
    const image=preview?`<img class="media-card-image" src="${escape(preview)}" alt="${escape(item.image?.alt || '')}" loading="lazy" referrerpolicy="no-referrer">`:'';
    return `<article class="media-card">${image}<div class="media-card-copy"><span class="media-format">${escape(item.format)}</span><h3>${escape(item.title)}</h3><p>${escape(item.lead)}</p><a class="back-link" href="#${escape(item.id)}" aria-label="${escape(item.title)} öffnen">Beitrag öffnen</a></div></article>`;
  }
  function categoryMarkup(category){
    return `<section class="media-category" aria-labelledby="category-${escape(category.id)}"><h2 id="category-${escape(category.id)}">${escape(category.icon)} ${escape(category.title)}</h2><div class="media-grid">${catalog.entries.filter(item=>item.category===category.id).map(cardMarkup).join('')}</div></section>`;
  }
  function imageCredit(image){
    return `Foto: ${escape(image.author)} · <a href="${escape(image.source)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> · <a href="${escape(image.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escape(image.license)}</a>`;
  }
  function articleMarkup(item){
    const category=catalog.categories.find(c=>c.id===item.category);
    const image=item.image;
    const portrait=image?`<figure class="media-portrait"><img src="${escape(image.url)}" alt="${escape(image.alt)}" referrerpolicy="no-referrer"><figcaption class="media-credit">${imageCredit(image)}</figcaption></figure>`:'';
    const providers=item.providers?.length?`<div class="media-providers">${item.providers.map(p=>external(...p)).join('')}</div><p class="media-provider-note">Das Angebot beim Anbieter kann ein Abo, eine Leihe oder einen Kauf erfordern.</p>`:'';
    const channel=item.channel?`<div class="media-providers">${external(...item.channel)}</div>`:'';
    const first=item.videos.slice(0,3).map(videoMarkup).join('');
    const more=item.videos.length>3?`<details class="media-more"><summary>Weitere ${item.videos.length-3} Videos</summary>${item.videos.slice(3).map(videoMarkup).join('')}</details>`:'';
    return `<article class="media-detail"><nav class="media-breadcrumb" aria-label="Beitragspfad"><a href="#uebersicht">Mediathek</a><span aria-hidden="true">›</span><a href="#${escape(category.id)}">${escape(category.title)}</a></nav><header class="media-detail-header${image?' has-portrait':''}"><div><span class="media-format">${escape(item.format)}</span><h1>${escape(item.title)}</h1><p class="media-lead">${escape(item.lead)}</p></div>${portrait}</header><div class="media-story">${item.paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}</div>${providers}${channel}<h2>${item.videos.length===1?'Video':'Videos'}</h2>${first}${more}<footer class="media-sources">${(item.references||[]).map(([label,url])=>`<p><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a></p>`).join('')}<p>Redaktionell überarbeitet und Videoverweise geprüft am 7. September 2026.</p></footer></article>`;
  }
  function render(moveFocus=false){
    renderVersion++;
    destroyPlayers();
    let selection=window.location.hash.slice(1)||'uebersicht';
    const entry=catalog.entries.find(item=>item.id===selection);
    const category=catalog.categories.find(item=>item.id===selection);
    if(!entry && !category && selection!=='uebersicht'){
      selection='uebersicht';history.replaceState(null,'','#uebersicht');
    }
    if(entry){
      content.innerHTML=articleMarkup(entry);
    }else{
      const title=category?category.title:'Mediathek';
      const intro=category?'':`<p>Filme, Serien, Dokumentationen und Streamer rund um Schach.</p>`;
      const back=category?'<nav class="media-breadcrumb" aria-label="Beitragspfad"><a href="#uebersicht">Mediathek</a></nav>':'';
      const credits=catalog.entries.filter(item=>item.image && (!category||item.category===category.id));
      content.innerHTML=`${back}<header class="media-intro"><h1>${escape(title)}</h1>${intro}</header>${(category?[category]:catalog.categories).map(categoryMarkup).join('')}<footer class="media-sources">${credits.map(item=>`<p>${escape(item.title)} – ${imageCredit(item.image)}</p>`).join('')}</footer>`;
    }
    document.title=(entry?.title||category?.title||'Mediathek')+' · Hammerschach-Gamer';
    content.querySelectorAll('.media-video-start').forEach(button=>button.addEventListener('click',()=>startVideo(button)));
    content.querySelectorAll('.media-more').forEach(details=>details.addEventListener('toggle',()=>{
      if(!details.open)players.forEach(player=>{try{if(details.contains(player.getIframe()))player.pauseVideo();}catch(_){}});
    }));
    window.scrollTo(0,0);
    if(moveFocus)content.focus({preventScroll:true});
    post({type:'hammerschach-mediathek-selection',selection});
  }
  window.addEventListener('hashchange',()=>render(true));
  window.addEventListener('pagehide',destroyPlayers);
  window.addEventListener('message',event=>{
    if(!embedded || event.source!==window.parent || event.origin!==window.location.origin)return;
    const message=event.data;
    if(message?.type==='hammerschach-mediathek-context'){
      root.classList.toggle('dark-mode',message.darkMode===true);syncTheme();
      if(message.visible===false)players.forEach(player=>{try{player.pauseVideo();}catch(_){}});
    }
    if(message?.type==='hammerschach-mediathek-select' && typeof message.selection==='string'){
      if(message.selection==='uebersicht' || catalog.categories.some(item=>item.id===message.selection) || catalog.entries.some(item=>item.id===message.selection)){
        if(window.location.hash!=='#'+message.selection)window.location.hash=message.selection;
      }
    }
  });
  syncTheme();render();post({type:'hammerschach-mediathek-ready'});
})();

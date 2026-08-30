'use strict';

let hammerschachTvData = null;
let hammerschachTvLoading = false;
let hammerschachTvAdminDirty = false;
let hammerschachTvPollTimer = null;
let hammerschachTvSelectedSlotId = '';
let hammerschachTvAdminSlotId = 'tv1';
let hammerschachTvAdminDrafts = {};
let hammerschachTvSupportsSlots = false;
let hammerschachTvPlaylistSelections = {};
let hammerschachTvPlaylistReturnFocus = null;
let hammerschachTvPlayerPlaylistItems = {};
let hammerschachTvYoutubeApiPromise = null;
let hammerschachTvYoutubePlayer = null;
let hammerschachTvYoutubePlayerReady = false;
let hammerschachTvYoutubeApiError = false;
let hammerschachTvYoutubePlayerGeneration = 0;
const HAMMERSCHACH_TV_SLOT_IDS = ['tv1','tv2','tv3'];
const HAMMERSCHACH_TV_SELECTED_SLOT_KEY = 'hammerschachTvSelectedSlot';

function gamerTvVisibleTitle(value){
  const title = String(value || '').trim();
  return !title || title === 'Hammerschach TV' || title === 'Gamer TV' ? 'Gamer-TV' : title;
}

function tvSlotNumber(slotId){
  const match = String(slotId || '').toLowerCase().match(/^tv([1-3])$/);
  return match ? Number(match[1]) : 1;
}

function normalizeTvSlots(tv){
  const data = tv && typeof tv === 'object' ? tv : {};
  const incoming = Array.isArray(data.slots) ? data.slots : [data];
  return HAMMERSCHACH_TV_SLOT_IDS.map((slotId,index)=>{
    const found = incoming.find(slot=>String(slot && slot.slotId || '').toLowerCase()===slotId) || incoming[index] || {};
    return {
      ...found,
      slotId,
      slotNumber:index+1,
      enabled:found.enabled == null ? index===0 : found.enabled === true,
      mode:found.mode || 'channel',
      title:gamerTvVisibleTitle(found.title),
      eventName:found.eventName || '',
      description:found.description || '',
      channelName:found.channelName || '',
      channelId:found.channelId || '',
      manualVideoId:found.manualVideoId || '',
      playlistId:found.playlistId || '',
      stream:found.stream || null,
      message:found.message || ''
    };
  });
}

function tvSlotById(slotId){
  const slots = hammerschachTvData && Array.isArray(hammerschachTvData.slots) ? hammerschachTvData.slots : [];
  return slots.find(slot=>slot.slotId===slotId) || null;
}

function tvSlotDisplayName(slot){
  if(!slot) return '';
  return String(slot.eventName || (slot.stream && slot.stream.title) || slot.channelName || `Sender ${slot.slotNumber || tvSlotNumber(slot.slotId)}`).trim();
}

function tvStoredSelectedSlot(){
  try{
    const value = String(localStorage.getItem(HAMMERSCHACH_TV_SELECTED_SLOT_KEY) || '').toLowerCase();
    return HAMMERSCHACH_TV_SLOT_IDS.includes(value) ? value : '';
  }catch(_){
    return '';
  }
}

function renderTvChannelSwitcher(){
  const slots = hammerschachTvData && Array.isArray(hammerschachTvData.slots) ? hammerschachTvData.slots : [];
  const enabledSlots = slots.filter(slot=>slot.enabled === true);
  if(tvChannelSwitcher) tvChannelSwitcher.hidden = enabledSlots.length <= 1;
  tvChannelButtons.forEach(button=>{
    const slotId = String(button.dataset.tvSlot || '').toLowerCase();
    const slot = slots.find(item=>item.slotId===slotId);
    const visible = !!(slot && slot.enabled === true);
    button.hidden = !visible;
    const active = visible && slotId === hammerschachTvSelectedSlotId;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
    const eventEl = button.querySelector('.tv-channel-event');
    if(eventEl) eventEl.textContent = slot ? tvSlotDisplayName(slot) : '';
    const badge = button.querySelector('.tv-channel-badge');
    if(badge){
      const status = String(slot && slot.stream && slot.stream.status || '').toLowerCase();
      const showLive = status === 'live';
      const showUpcoming = status === 'upcoming';
      const showReplay = status === 'replay';
      badge.hidden = !(showLive || showUpcoming || showReplay);
      badge.textContent = showLive ? 'LIVE' : showUpcoming ? 'BALD' : 'REPLAY';
      badge.classList.toggle('upcoming',showUpcoming);
      badge.classList.toggle('replay',showReplay);
    }
    button.title = slot ? `${slotId.toUpperCase()}: ${tvSlotDisplayName(slot)}` : '';
  });
}

function tvModeFields(){
  const mode = tvModeSelect ? tvModeSelect.value : 'channel';
  if(tvChannelIdField) tvChannelIdField.hidden = mode !== 'channel';
  if(tvVideoField) tvVideoField.hidden = mode !== 'manual';
  if(tvPlaylistField) tvPlaylistField.hidden = mode !== 'playlist';
  if(tvForceRefreshBtn){
    tvForceRefreshBtn.hidden = mode !== 'channel';
    tvForceRefreshBtn.textContent = 'YouTube jetzt prüfen';
    tvForceRefreshBtn.disabled = mode !== 'channel' || !String(tvChannelIdInput && tvChannelIdInput.value || '').trim();
  }
}

function tvAdminDraft(slotId){
  return hammerschachTvAdminDrafts[slotId] || tvSlotById(slotId) || {
    slotId,
    slotNumber:tvSlotNumber(slotId),
    enabled:false,
    mode:'channel',
    title:'Gamer-TV',
    eventName:'',
    description:'',
    channelName:'',
    channelId:'',
    manualVideoId:'',
    playlistId:''
  };
}

function captureTvAdminForm(){
  const slotId = hammerschachTvAdminSlotId;
  if(!HAMMERSCHACH_TV_SLOT_IDS.includes(slotId)) return;
  const base = tvAdminDraft(slotId);
  hammerschachTvAdminDrafts[slotId] = {
    ...base,
    slotId,
    slotNumber:tvSlotNumber(slotId),
    enabled:!!(tvEnabledInput && tvEnabledInput.checked),
    mode:tvModeSelect ? tvModeSelect.value : 'channel',
    title:tvTitleInput ? tvTitleInput.value : '',
    eventName:tvEventInput ? tvEventInput.value : '',
    description:tvDescriptionInput ? tvDescriptionInput.value : '',
    channelName:tvChannelNameInput ? tvChannelNameInput.value : '',
    channelId:tvChannelIdInput ? tvChannelIdInput.value : '',
    manualVideoId:tvVideoInput ? tvVideoInput.value : '',
    playlistId:tvPlaylistInput ? tvPlaylistInput.value : ''
  };
}

function populateTvAdminForm(tv){
  const slot = tv || tvAdminDraft(hammerschachTvAdminSlotId);
  if(!slot) return;
  if(tvModeSelect) tvModeSelect.value = slot.mode || 'channel';
  if(tvEnabledInput) tvEnabledInput.checked = slot.enabled === true;
  if(tvTitleInput) tvTitleInput.value = gamerTvVisibleTitle(slot.title);
  if(tvEventInput) tvEventInput.value = slot.eventName || '';
  if(tvChannelNameInput) tvChannelNameInput.value = slot.channelName || '';
  if(tvChannelIdInput) tvChannelIdInput.value = slot.channelId || '';
  if(tvVideoInput) tvVideoInput.value = slot.manualVideoId || '';
  if(tvPlaylistInput) tvPlaylistInput.value = slot.playlistId || '';
  if(tvDescriptionInput) tvDescriptionInput.value = slot.description || '';
  tvModeFields();
}

function renderTvAdminSlotTabs(){
  tvAdminSlotButtons.forEach(button=>{
    const slotId = String(button.dataset.tvAdminSlot || '').toLowerCase();
    const draft = tvAdminDraft(slotId);
    const active = slotId === hammerschachTvAdminSlotId;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
    button.disabled = !hammerschachTvSupportsSlots && slotId !== 'tv1';
    button.title = button.disabled
      ? 'TV 2 und TV 3 stehen nach der Aktualisierung des Workers zur Verfügung.'
      : `${slotId.toUpperCase()} bearbeiten`;
    const state = button.querySelector('.tv-admin-slot-state');
    if(state) state.textContent = draft.enabled === true ? 'AN' : 'AUS';
  });
}

function selectTvAdminSlot(slotId){
  const normalized = String(slotId || '').toLowerCase();
  if(!HAMMERSCHACH_TV_SLOT_IDS.includes(normalized)) return;
  if(!hammerschachTvSupportsSlots && normalized !== 'tv1') return;
  captureTvAdminForm();
  hammerschachTvAdminSlotId = normalized;
  populateTvAdminForm(tvAdminDraft(normalized));
  renderTvAdminSlotTabs();
  if(tvAdminStatus){
    tvAdminStatus.textContent = `${normalized.toUpperCase()} wird bearbeitet.`;
    tvAdminStatus.className = 'tv-admin-status';
  }
}

function tvPlaylistItems(stream){
  const playlistId = String(stream && stream.playlistId || '');
  const playerItems = playlistId && Array.isArray(hammerschachTvPlayerPlaylistItems[playlistId])
    ? hammerschachTvPlayerPlaylistItems[playlistId]
    : [];
  const workerItems = stream && Array.isArray(stream.playlistItems) ? stream.playlistItems : [];
  const knownById = new Map(workerItems.map(item=>[String(item && item.videoId || ''),item]));
  const sourceItems = playerItems.length ? playerItems : workerItems;
  const seen = new Set();
  return sourceItems
    .map((item,index)=>{
      const videoId = String(item && item.videoId || '').trim();
      if(!/^[A-Za-z0-9_-]{11}$/.test(videoId) || seen.has(videoId)) return null;
      seen.add(videoId);
      const known = knownById.get(videoId) || {};
      const position = Number.isFinite(Number(item && item.position)) ? Math.max(0,Number(item.position)) : index;
      const liveStatus = ['live','upcoming'].includes(String(known.liveStatus || item && item.liveStatus || '').toLowerCase())
        ? String(known.liveStatus || item.liveStatus).toLowerCase()
        : '';
      return {
        videoId,
        position,
        title:String(known.title || item && item.title || `Video ${index+1}`).trim() || `Video ${index+1}`,
        channelTitle:String(known.channelTitle || item && item.channelTitle || '').trim(),
        liveStatus,
        thumbnailUrl:`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      };
    })
    .filter(Boolean)
    .sort((a,b)=>a.position-b.position)
    .slice(0,50);
}

function tvPlaylistSelectionForStream(slotId,stream){
  const selected = hammerschachTvPlaylistSelections[slotId];
  if(!selected) return null;
  if(selected.playlistId !== String(stream && stream.playlistId || '')){
    delete hammerschachTvPlaylistSelections[slotId];
    return null;
  }
  const item = tvPlaylistItems(stream).find(candidate=>candidate.videoId===selected.videoId);
  if(item) return item;
  delete hammerschachTvPlaylistSelections[slotId];
  return null;
}

function ensureHammerschachYoutubePlayerApi(){
  if(window.YT && typeof window.YT.Player === 'function') return Promise.resolve(window.YT);
  if(hammerschachTvYoutubeApiPromise) return hammerschachTvYoutubeApiPromise;
  hammerschachTvYoutubeApiPromise = new Promise((resolve,reject)=>{
    let settled = false;
    const previousReady = window.onYouTubeIframeAPIReady;
    const finish = ()=>{
      if(settled) return;
      if(window.YT && typeof window.YT.Player === 'function'){
        settled = true;
        hammerschachTvYoutubeApiError = false;
        resolve(window.YT);
      }
    };
    window.onYouTubeIframeAPIReady = ()=>{
      if(typeof previousReady === 'function'){
        try{previousReady();}catch(_){}
      }
      finish();
    };
    let script = document.querySelector('script[data-hammerschach-youtube-api]');
    if(!script){
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.hammerschachYoutubeApi = '1';
      document.head.appendChild(script);
    }
    script.addEventListener('error',()=>{
      if(settled) return;
      settled = true;
      hammerschachTvYoutubeApiError = true;
      hammerschachTvYoutubeApiPromise = null;
      reject(new Error('Die YouTube-Playersteuerung konnte nicht geladen werden.'));
    },{once:true});
    setTimeout(()=>{
      if(settled) return;
      if(window.YT && typeof window.YT.Player === 'function'){
        finish();
        return;
      }
      settled = true;
      hammerschachTvYoutubeApiError = true;
      hammerschachTvYoutubeApiPromise = null;
      reject(new Error('Die YouTube-Playersteuerung hat nicht rechtzeitig geantwortet.'));
    },12000);
  });
  return hammerschachTvYoutubeApiPromise;
}

function tvStreamPlayerKey(stream){
  if(stream && stream.kind === 'playlist' && stream.playlistId) return `playlist:${stream.playlistId}`;
  if(stream && stream.kind === 'video' && stream.videoId) return `video:${stream.videoId}`;
  return '';
}

function syncTvPlaylistFromYoutubePlayer(){
  if(!hammerschachTvYoutubePlayerReady || !hammerschachTvYoutubePlayer) return;
  const data = tvSlotById(hammerschachTvSelectedSlotId) || tvSlotById('tv1');
  const stream = data && data.enabled === true ? data.stream : null;
  if(!data || !stream || stream.kind !== 'playlist' || !stream.playlistId) return;
  if(tvPlayerFrame && tvPlayerFrame.dataset.streamKey !== tvStreamPlayerKey(stream)) return;
  let ids = [];
  let currentIndex = -1;
  try{
    if(typeof hammerschachTvYoutubePlayer.getPlaylistId === 'function'){
      const loadedPlaylistId = String(hammerschachTvYoutubePlayer.getPlaylistId() || '');
      if(loadedPlaylistId !== String(stream.playlistId)) return;
    }
    ids = hammerschachTvYoutubePlayer.getPlaylist();
    currentIndex = Number(hammerschachTvYoutubePlayer.getPlaylistIndex());
  }catch(_){
    return;
  }
  const seen = new Set();
  const items = (Array.isArray(ids) ? ids : [])
    .map((videoId,index)=>({
      videoId:String(videoId || '').trim(),
      position:index,
      title:`Video ${index+1}`,
      channelTitle:'',
      liveStatus:''
    }))
    .filter(item=>{
      if(!/^[A-Za-z0-9_-]{11}$/.test(item.videoId) || seen.has(item.videoId)) return false;
      seen.add(item.videoId);
      return true;
    })
    .slice(0,50);
  if(!items.length) return;
  hammerschachTvPlayerPlaylistItems[stream.playlistId] = items;
  const current = items.find(item=>item.position===currentIndex);
  if(current){
    hammerschachTvPlaylistSelections[data.slotId] = {
      playlistId:String(stream.playlistId),
      videoId:current.videoId,
      position:current.position
    };
  }
  renderTvPlaylistToolbar(stream);
  if(tvPlaylistBackdrop && !tvPlaylistBackdrop.hidden) renderTvPlaylistVideoList(data,stream);
}

function resetHammerschachTvPlayer(){
  if(!tvPlayerFrame) return;
  const previousFrame = tvPlayerFrame;
  const parent = previousFrame.parentNode;
  if(!parent) return;
  const nextSibling = previousFrame.nextSibling;
  const replacement = previousFrame.cloneNode(false);
  replacement.hidden = true;
  replacement.removeAttribute('src');
  delete replacement.dataset.streamSrc;
  delete replacement.dataset.streamKey;
  delete replacement.dataset.pendingStreamKey;

  const previousPlayer = hammerschachTvYoutubePlayer;
  hammerschachTvYoutubePlayer = null;
  hammerschachTvYoutubePlayerReady = false;
  hammerschachTvYoutubePlayerGeneration += 1;
  if(previousPlayer && typeof previousPlayer.destroy === 'function'){
    try{previousPlayer.destroy();}catch(_){}
  }

  if(previousFrame.parentNode === parent){
    parent.replaceChild(replacement,previousFrame);
  }else{
    parent.insertBefore(replacement,nextSibling && nextSibling.parentNode === parent ? nextSibling : parent.firstChild);
  }
  tvPlayerFrame = replacement;
}

function attachHammerschachYoutubePlayer(){
  if(!tvPlayerFrame || hammerschachTvYoutubePlayer) return;
  const playerFrame = tvPlayerFrame;
  const playerGeneration = hammerschachTvYoutubePlayerGeneration;
  ensureHammerschachYoutubePlayerApi().then(YT=>{
    if(playerGeneration !== hammerschachTvYoutubePlayerGeneration || playerFrame !== tvPlayerFrame) return;
    if(!tvPlayerFrame || hammerschachTvYoutubePlayer || !tvToolActive || !tvPlayerFrame.dataset.streamKey) return;
    hammerschachTvYoutubePlayer = new YT.Player(playerFrame,{
      events:{
        onReady:event=>{
          if(playerGeneration !== hammerschachTvYoutubePlayerGeneration || playerFrame !== tvPlayerFrame){
            try{event.target.destroy();}catch(_){}
            return;
          }
          hammerschachTvYoutubePlayer = event.target;
          hammerschachTvYoutubePlayerReady = true;
          renderSelectedTvSlot();
          if(!tvToolActive || !tvPlayerFrame.dataset.streamKey){
            try{hammerschachTvYoutubePlayer.stopVideo();}catch(_){}
          }
          syncTvPlaylistFromYoutubePlayer();
          setTimeout(syncTvPlaylistFromYoutubePlayer,300);
          setTimeout(syncTvPlaylistFromYoutubePlayer,1000);
        },
        onStateChange:()=>{
          if(playerGeneration === hammerschachTvYoutubePlayerGeneration && playerFrame === tvPlayerFrame) syncTvPlaylistFromYoutubePlayer();
        },
        onError:()=>{
          if(playerGeneration === hammerschachTvYoutubePlayerGeneration && playerFrame === tvPlayerFrame) syncTvPlaylistFromYoutubePlayer();
        }
      }
    });
  }).catch(()=>{
    if(playerGeneration !== hammerschachTvYoutubePlayerGeneration || playerFrame !== tvPlayerFrame) return;
    const data = tvSlotById(hammerschachTvSelectedSlotId) || tvSlotById('tv1');
    renderTvPlaylistToolbar(data && data.stream);
  });
}

function cueHammerschachTvStream(stream){
  if(!hammerschachTvYoutubePlayerReady || !hammerschachTvYoutubePlayer || !stream) return false;
  try{
    if(stream.kind === 'playlist' && stream.playlistId){
      hammerschachTvYoutubePlayer.cuePlaylist({
        listType:'playlist',
        list:stream.playlistId,
        index:0,
        startSeconds:0
      });
      setTimeout(syncTvPlaylistFromYoutubePlayer,300);
      setTimeout(syncTvPlaylistFromYoutubePlayer,1000);
      return true;
    }
    if(stream.kind === 'video' && stream.videoId){
      hammerschachTvYoutubePlayer.cueVideoById({videoId:stream.videoId,startSeconds:0});
      return true;
    }
  }catch(_){}
  return false;
}

function renderTvPlaylistToolbar(stream){
  const playlistMode = !!(stream && stream.kind === 'playlist' && stream.playlistId);
  const items = playlistMode ? tvPlaylistItems(stream) : [];
  if(tvPlaylistToolbar) tvPlaylistToolbar.hidden = !playlistMode;
  if(tvPlaylistCount) tvPlaylistCount.textContent = String(items.length);
  if(tvPlaylistOpenLabel) tvPlaylistOpenLabel.textContent = items.length
    ? 'Videos dieser Playlist'
    : (hammerschachTvYoutubeApiError ? 'Videoliste nicht erreichbar' : 'Videoliste wird geladen …');
  if(tvPlaylistOpenBtn){
    tvPlaylistOpenBtn.disabled = !items.length;
    tvPlaylistOpenBtn.title = items.length
      ? `${items.length} Videos dieser Playlist anzeigen`
      : (hammerschachTvYoutubeApiError
          ? 'Die YouTube-Playersteuerung konnte momentan nicht geladen werden.'
          : 'Die Videoliste wird direkt aus dem YouTube-Player geladen.');
  }
  if(!playlistMode && tvPlaylistBackdrop && !tvPlaylistBackdrop.hidden) closeTvPlaylistPopup(false);
}

function closeTvPlaylistPopup(restoreFocus = true){
  if(!tvPlaylistBackdrop || tvPlaylistBackdrop.hidden) return;
  tvPlaylistBackdrop.hidden = true;
  if(restoreFocus){
    const target = hammerschachTvPlaylistReturnFocus && hammerschachTvPlaylistReturnFocus.isConnected
      ? hammerschachTvPlaylistReturnFocus
      : tvPlaylistOpenBtn;
    if(target && typeof target.focus === 'function') target.focus();
  }
  hammerschachTvPlaylistReturnFocus = null;
}

function renderTvPlaylistVideoList(data,stream){
  if(!tvPlaylistVideoList) return;
  tvPlaylistVideoList.replaceChildren();
  const items = tvPlaylistItems(stream);
  const selected = tvPlaylistSelectionForStream(data && data.slotId || '',stream);
  if(tvPlaylistModalTitle){
    const eventName = tvSlotDisplayName(data);
    tvPlaylistModalTitle.textContent = eventName ? `Videos: ${eventName}` : 'Videos dieser Playlist';
  }
  if(tvPlaylistModalSubtitle){
    tvPlaylistModalSubtitle.textContent = items.length
      ? `${items.length} Videos stehen zur Auswahl. Vorschaubild anklicken und direkt in Gamer-TV ansehen.`
      : String(stream && stream.playlistItemsMessage || 'Für diese Playlist ist momentan keine Videoliste verfügbar.');
  }
  if(!items.length){
    const empty = document.createElement('div');
    empty.className = 'tv-playlist-empty';
    empty.textContent = String(stream && stream.playlistItemsMessage || 'Für diese Playlist ist momentan keine Videoliste verfügbar.');
    tvPlaylistVideoList.appendChild(empty);
    return;
  }
  items.forEach((item,index)=>{
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tv-playlist-video-card';
    const active = !!(selected && selected.videoId === item.videoId);
    button.classList.toggle('active',active);
    button.setAttribute('aria-label',`${item.title} in Gamer-TV ansehen`);
    if(active) button.setAttribute('aria-current','true');

    const image = document.createElement('img');
    image.className = 'tv-playlist-video-thumb';
    image.src = item.thumbnailUrl;
    image.alt = '';
    image.loading = 'lazy';

    const copy = document.createElement('div');
    copy.className = 'tv-playlist-video-copy';
    const order = document.createElement('div');
    order.className = 'tv-playlist-video-order';
    order.textContent = 'Playlist';
    if(item.liveStatus){
      const live = document.createElement('span');
      live.className = `tv-playlist-live-badge${item.liveStatus==='upcoming'?' upcoming':''}`;
      live.textContent = item.liveStatus === 'live' ? 'LIVE' : 'GEPLANT';
      order.appendChild(live);
    }
    const title = document.createElement('div');
    title.className = 'tv-playlist-video-title';
    title.textContent = item.title;
    copy.append(order,title);
    if(item.channelTitle){
      const channel = document.createElement('div');
      channel.className = 'tv-playlist-video-channel';
      channel.textContent = item.channelTitle;
      copy.appendChild(channel);
    }

    const state = document.createElement('div');
    state.className = 'tv-playlist-video-state';
    const choose = document.createElement('span');
    choose.className = 'tv-playlist-video-choose';
    choose.textContent = active ? 'Aktuelles Video' : 'Ansehen';
    state.appendChild(choose);

    button.append(image,copy,state);
    button.addEventListener('click',()=>selectTvPlaylistVideo(data,stream,item));
    tvPlaylistVideoList.appendChild(button);
  });
}

function openTvPlaylistPopup(){
  const data = tvSlotById(hammerschachTvSelectedSlotId) || tvSlotById('tv1');
  const stream = data && data.enabled === true ? data.stream : null;
  if(!tvPlaylistBackdrop || !stream || stream.kind !== 'playlist' || !tvPlaylistItems(stream).length) return;
  hammerschachTvPlaylistReturnFocus = document.activeElement;
  renderTvPlaylistVideoList(data,stream);
  tvPlaylistBackdrop.hidden = false;
  if(tvPlaylistTopCloseBtn) tvPlaylistTopCloseBtn.focus();
}

function selectTvPlaylistVideo(data,stream,item){
  if(!data || !stream || !item) return;
  hammerschachTvPlaylistSelections[data.slotId] = {
    playlistId:String(stream.playlistId || ''),
    videoId:item.videoId,
    position:item.position
  };
  closeTvPlaylistPopup(false);
  if(hammerschachTvYoutubePlayerReady && hammerschachTvYoutubePlayer){
    try{hammerschachTvYoutubePlayer.playVideoAt(item.position);}catch(_){}
  }
  if(tvPlayerFrame) tvPlayerFrame.title = `${data.slotId ? data.slotId.toUpperCase() : 'Gamer-TV'} – ${item.title}`;
  renderTvPlaylistToolbar(stream);
  if(tvPlaylistOpenBtn) tvPlaylistOpenBtn.focus();
}

function tvPlayerSource(stream){
  if(!stream) return '';
  const origin = window.location.origin && window.location.origin !== 'null' ? `&origin=${encodeURIComponent(window.location.origin)}` : '';
  if(stream.kind === 'playlist' && stream.playlistId){
    return `https://www.youtube-nocookie.com/embed?listType=playlist&list=${encodeURIComponent(stream.playlistId)}&rel=0&playsinline=1&enablejsapi=1${origin}`;
  }
  if(stream.kind === 'video' && stream.videoId){
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(stream.videoId)}?rel=0&playsinline=1&enablejsapi=1${origin}`;
  }
  return '';
}

function renderSelectedTvSlot(){
  const data = tvSlotById(hammerschachTvSelectedSlotId) || tvSlotById('tv1') || {};
  const stream = data.enabled === true ? data.stream : null;
  const selectedPlaylistItem = tvPlaylistSelectionForStream(data.slotId,stream);
  const playerSource = tvPlayerSource(stream);
  const playerKey = tvStreamPlayerKey(stream);
  if(playerSource && tvPlayerFrame && tvToolActive){
    if(tvPlayerFrame.dataset.streamKey !== playerKey){
      tvPlayerFrame.dataset.streamSrc = playerSource;
      if(hammerschachTvYoutubePlayerReady && hammerschachTvYoutubePlayer){
        if(cueHammerschachTvStream(stream)){
          tvPlayerFrame.dataset.streamKey = playerKey;
          delete tvPlayerFrame.dataset.pendingStreamKey;
        }
      }else if(!hammerschachTvYoutubePlayer){
        tvPlayerFrame.dataset.streamKey = playerKey;
        tvPlayerFrame.src = playerSource;
        attachHammerschachYoutubePlayer();
      }else{
        /*
         * Der YouTube-Player wird gerade initialisiert. Seine iframe-Quelle
         * darf in diesem Zustand nicht ausgetauscht werden, weil Player und
         * sichtbarer Kanal sonst auseinanderlaufen. onReady übernimmt danach
         * den zuletzt ausgewählten Sender.
         */
        tvPlayerFrame.dataset.pendingStreamKey = playerKey;
      }
    }else{
      delete tvPlayerFrame.dataset.pendingStreamKey;
    }
    tvPlayerFrame.title = selectedPlaylistItem
      ? `${data.slotId ? data.slotId.toUpperCase() : 'Gamer-TV'} – ${selectedPlaylistItem.title}`
      : `${data.slotId ? data.slotId.toUpperCase() : 'Gamer-TV'}${tvSlotDisplayName(data) ? ` – ${tvSlotDisplayName(data)}` : ''}`;
    tvPlayerFrame.hidden = false;
    if(tvPlayerPlaceholder) tvPlayerPlaceholder.hidden = true;
  }else{
    if(tvPlayerFrame){
      tvPlayerFrame.hidden = true;
      if(tvPlayerFrame.dataset.streamKey){
        if(hammerschachTvYoutubePlayerReady && hammerschachTvYoutubePlayer){
          try{hammerschachTvYoutubePlayer.stopVideo();}catch(_){}
        }else if(!hammerschachTvYoutubePlayer){
          tvPlayerFrame.src = 'about:blank';
        }
        delete tvPlayerFrame.dataset.streamSrc;
        delete tvPlayerFrame.dataset.streamKey;
        delete tvPlayerFrame.dataset.pendingStreamKey;
      }
    }
    if(tvPlayerPlaceholder) tvPlayerPlaceholder.hidden = false;
  }
  if(tvPlaceholderTitle) tvPlaceholderTitle.textContent = !data.enabled
    ? `${data.slotId ? data.slotId.toUpperCase() : 'Gamer-TV'} ist ausgeschaltet`
    : 'Noch keine Übertragung';
  if(tvPlaceholderText) tvPlaceholderText.textContent = !data.enabled
    ? 'Die TV-Regie hat diesen Senderplatz momentan ausgeschaltet.'
    : (data.message || 'Sobald ein Livestream bereitsteht, erscheint er automatisch an dieser Stelle.');
  renderTvPlaylistToolbar(stream);
  if(tvPlaylistBackdrop && !tvPlaylistBackdrop.hidden && stream && stream.kind === 'playlist'){
    renderTvPlaylistVideoList(data,stream);
  }
  renderTvChannelSwitcher();
  hammerschachScheduleHeightReport(true);
}

function selectHammerschachTvSlot(slotId, options){
  const normalized = String(slotId || '').toLowerCase();
  const slot = tvSlotById(normalized);
  if(!slot || slot.enabled !== true) return;
  const channelChanged = !!hammerschachTvSelectedSlotId && normalized !== hammerschachTvSelectedSlotId;
  if(channelChanged) resetHammerschachTvPlayer();
  hammerschachTvSelectedSlotId = normalized;
  if(!options || options.persist !== false){
    try{localStorage.setItem(HAMMERSCHACH_TV_SELECTED_SLOT_KEY,normalized);}catch(_){}
  }
  renderSelectedTvSlot();
}

function renderHammerschachTv(tv, options){
  const raw = tv && typeof tv === 'object' ? tv : {};
  hammerschachTvSupportsSlots = raw.version === 2 || Array.isArray(raw.slots);
  const slots = normalizeTvSlots(raw);
  hammerschachTvData = {...raw,slots};
  const enabledSlots = slots.filter(slot=>slot.enabled === true);
  const previousSelectedSlotId = hammerschachTvSelectedSlotId;
  const currentStillAvailable = enabledSlots.some(slot=>slot.slotId===hammerschachTvSelectedSlotId);
  if(!currentStillAvailable){
    const stored = tvStoredSelectedSlot();
    const preferred = enabledSlots.find(slot=>slot.slotId===stored)
      || enabledSlots.find(slot=>slot.slotId===raw.defaultSlotId)
      || enabledSlots.find(slot=>String(slot.stream && slot.stream.status || '').toLowerCase()==='live')
      || enabledSlots[0]
      || slots[0];
    hammerschachTvSelectedSlotId = preferred ? preferred.slotId : 'tv1';
  }
  if(previousSelectedSlotId && hammerschachTvSelectedSlotId !== previousSelectedSlotId) resetHammerschachTvPlayer();
  renderSelectedTvSlot();

  const isAdmin = !!(onlineAuthUser && onlineAuthUser.isAdmin === true);
  if(tvAdminCard) tvAdminCard.hidden = !isAdmin;
  if(isAdmin && (!options || options.populateAdmin !== false)){
    if(!hammerschachTvAdminDirty){
      hammerschachTvAdminDrafts = {};
      slots.forEach(slot=>{hammerschachTvAdminDrafts[slot.slotId]={...slot};});
      if(!HAMMERSCHACH_TV_SLOT_IDS.includes(hammerschachTvAdminSlotId)) hammerschachTvAdminSlotId = 'tv1';
      populateTvAdminForm(tvAdminDraft(hammerschachTvAdminSlotId));
    }
    renderTvAdminSlotTabs();
  }
  if(tvForceRefreshBtn){
    const selectedAdminSlot = tvAdminDraft(hammerschachTvAdminSlotId);
    const autoReady = selectedAdminSlot.automationAvailable === true;
    tvForceRefreshBtn.title = autoReady
      ? 'YouTube sofort erneut nach Live- und geplanten Streams durchsuchen.'
      : 'Für die YouTube-Abfrage muss YOUTUBE_API_KEY als Worker-Secret hinterlegt sein.';
  }
  hammerschachScheduleHeightReport(true);
}

async function loadHammerschachTv(options){
  if(hammerschachTvLoading || !onlineAuthToken || !onlineAuthUser) return;
  hammerschachTvLoading = true;
  try{
    const data = await authApi('/api/tv');
    renderHammerschachTv(data.tv, {populateAdmin:!(options && options.keepAdminValues)});
  }catch(error){
    if(tvPlaceholderText) tvPlaceholderText.textContent = error && error.message ? error.message : 'Gamer-TV konnte nicht geladen werden.';
    if(tvAdminStatus && onlineAuthUser && onlineAuthUser.isAdmin === true){
      tvAdminStatus.textContent = error && error.message ? error.message : 'TV-Daten konnten nicht geladen werden.';
      tvAdminStatus.className = 'tv-admin-status error';
    }
  }finally{
    hammerschachTvLoading = false;
  }
}

function startHammerschachTvPolling(){
  stopHammerschachTvPolling();
  hammerschachTvPollTimer = setInterval(()=>{
    if(tvToolActive && document.visibilityState !== 'hidden') loadHammerschachTv({keepAdminValues:true});
  },5 * 60 * 1000);
}

function stopHammerschachTvPolling(){
  if(hammerschachTvPollTimer){
    clearInterval(hammerschachTvPollTimer);
    hammerschachTvPollTimer = null;
  }
}

function stopHammerschachTvPlayback(){
  stopHammerschachTvPolling();
  closeTvPlaylistPopup(false);
  renderTvPlaylistToolbar(null);
  if(tvPlayerFrame){
    if(hammerschachTvYoutubePlayerReady && hammerschachTvYoutubePlayer){
      try{hammerschachTvYoutubePlayer.stopVideo();}catch(_){}
    }else if(!hammerschachTvYoutubePlayer){
      tvPlayerFrame.src = 'about:blank';
    }
    tvPlayerFrame.hidden = true;
    delete tvPlayerFrame.dataset.streamSrc;
    delete tvPlayerFrame.dataset.streamKey;
    delete tvPlayerFrame.dataset.pendingStreamKey;
  }
}

function tvAdminPayloadSlot(slotId){
  const draft = tvAdminDraft(slotId);
  return {
    slotId,
    enabled:draft.enabled === true,
    mode:draft.mode || 'channel',
    title:gamerTvVisibleTitle(draft.title),
    eventName:draft.eventName || '',
    description:draft.description || '',
    channelName:draft.channelName || '',
    channelId:draft.channelId || '',
    videoUrl:draft.manualVideoId || draft.videoUrl || '',
    playlistUrl:draft.playlistId || draft.playlistUrl || ''
  };
}

async function saveHammerschachTv(){
  if(!onlineAuthUser || onlineAuthUser.isAdmin !== true || !tvSaveBtn) return;
  captureTvAdminForm();
  tvSaveBtn.disabled = true;
  if(tvForceRefreshBtn) tvForceRefreshBtn.disabled = true;
  if(tvAdminStatus){
    tvAdminStatus.textContent = 'TV-Einstellungen werden gespeichert …';
    tvAdminStatus.className = 'tv-admin-status';
  }
  const payload = hammerschachTvSupportsSlots
    ? {version:2,slots:HAMMERSCHACH_TV_SLOT_IDS.map(tvAdminPayloadSlot)}
    : tvAdminPayloadSlot('tv1');
  try{
    const data = await authApi('/api/admin/tv',{method:'POST',body:JSON.stringify(payload)});
    hammerschachTvAdminDirty = false;
    renderHammerschachTv(data.tv);
    if(tvAdminStatus){
      tvAdminStatus.textContent = data.message || 'Gamer-TV wurde gespeichert.';
      tvAdminStatus.className = 'tv-admin-status success';
    }
  }catch(error){
    if(tvAdminStatus){
      tvAdminStatus.textContent = error && error.message ? error.message : 'Die TV-Einstellungen konnten nicht gespeichert werden.';
      tvAdminStatus.className = 'tv-admin-status error';
    }
  }finally{
    tvSaveBtn.disabled = false;
    tvModeFields();
  }
}

async function forceHammerschachTvRefresh(){
  if(!onlineAuthUser || onlineAuthUser.isAdmin !== true || !tvForceRefreshBtn) return;
  captureTvAdminForm();
  tvForceRefreshBtn.disabled = true;
  if(tvAdminStatus){
    tvAdminStatus.textContent = 'YouTube wird nach dem aktuellen Stream durchsucht …';
    tvAdminStatus.className = 'tv-admin-status';
  }
  try{
    const data = await authApi('/api/admin/tv/refresh',{method:'POST',body:JSON.stringify({slotId:hammerschachTvAdminSlotId})});
    renderHammerschachTv(data.tv,{populateAdmin:false});
    if(tvAdminStatus){
      tvAdminStatus.textContent = data.message || 'Die YouTube-Suche wurde aktualisiert.';
      tvAdminStatus.className = 'tv-admin-status success';
    }
  }catch(error){
    if(tvAdminStatus){
      tvAdminStatus.textContent = error && error.message
        ? error.message
        : 'Die YouTube-Suche konnte nicht aktualisiert werden.';
      tvAdminStatus.className = 'tv-admin-status error';
    }
  }finally{
    tvModeFields();
  }
}

tvChannelButtons.forEach(button=>button.addEventListener('click',()=>selectHammerschachTvSlot(button.dataset.tvSlot)));
tvAdminSlotButtons.forEach(button=>button.addEventListener('click',()=>selectTvAdminSlot(button.dataset.tvAdminSlot)));
if(tvPlaylistOpenBtn) tvPlaylistOpenBtn.addEventListener('click',openTvPlaylistPopup);
if(tvPlaylistTopCloseBtn) tvPlaylistTopCloseBtn.addEventListener('click',()=>closeTvPlaylistPopup());
if(tvPlaylistCloseBtn) tvPlaylistCloseBtn.addEventListener('click',()=>closeTvPlaylistPopup());
if(tvPlaylistBackdrop) tvPlaylistBackdrop.addEventListener('click',event=>{if(event.target===tvPlaylistBackdrop) closeTvPlaylistPopup();});
document.addEventListener('keydown',event=>{
  if(event.key === 'Escape' && tvPlaylistBackdrop && !tvPlaylistBackdrop.hidden) closeTvPlaylistPopup();
});
if(tvModeSelect) tvModeSelect.addEventListener('change',()=>{hammerschachTvAdminDirty=true;captureTvAdminForm();tvModeFields();renderTvAdminSlotTabs();});
[tvEnabledInput,tvTitleInput,tvEventInput,tvChannelNameInput,tvChannelIdInput,tvVideoInput,tvPlaylistInput,tvDescriptionInput].forEach(input=>{
  if(input) input.addEventListener('input',()=>{hammerschachTvAdminDirty=true;captureTvAdminForm();tvModeFields();renderTvAdminSlotTabs();});
});
if(tvSaveBtn) tvSaveBtn.addEventListener('click',saveHammerschachTv);
if(tvForceRefreshBtn) tvForceRefreshBtn.addEventListener('click',forceHammerschachTvRefresh);

'use strict';

(() => {
  const backdrop = document.getElementById('publicGamesBackdrop');
  const list = document.getElementById('publicGamesList');
  const title = document.getElementById('publicGamesTitle');
  const status = document.getElementById('publicGamesStatus');
  const refresh = document.getElementById('publicGamesRefreshBtn');
  const close = document.getElementById('publicGamesCloseBtn');
  const returnButton = document.getElementById('memberGamesReturnBtn');
  const allButton = document.getElementById('memberGamesAllBtn');
  const hint = document.getElementById('memberGamesHint');
  let member = null, opener = null, timer = null, requestId = 0, controller = null;
  let observer = null, queue = [], generation = 0, active = 0;
  const previewControllers = new Set();
  let savedScroll = 0;

  function memberFromAddress(){
    const url = new URL(location.href);
    const id = url.searchParams.get('memberGames') || '';
    if(id === 'all') return {id:'all', username:''};
    if(!/^[A-Za-z0-9_-]{8,128}$/.test(id)) return null;
    return {id, username:cleanDisplayName(url.searchParams.get('memberName')) || 'Mitglied'};
  }
  function rememberAddress(showList){
    const url = new URL(location.href);
    if(member){
      url.searchParams.set('memberGames', member.id);
      if(member.id === 'all') url.searchParams.delete('memberName');
      else url.searchParams.set('memberName', member.username || 'Mitglied');
    }
    if(showList) url.searchParams.set('memberList', '1');
    else {
      url.searchParams.delete('memberList');
      if(!url.searchParams.has('watch') && !url.searchParams.has('room')){
        url.searchParams.delete('memberGames');
        url.searchParams.delete('memberName');
      }
    }
    history.replaceState(history.state, '', url);
    syncReturnButton();
  }
  function syncReturnButton(){
    const context = memberFromAddress();
    const url = new URL(location.href);
    returnButton.hidden = !context || !(url.searchParams.has('watch') || url.searchParams.has('room'));
    returnButton.textContent = context ? (context.id === 'all' ? '← Laufende öffentliche Partien' : '← Partien von ' + context.username) : '';
  }
  function scrollKey(){ return 'hammerschach-member-games-scroll:' + (member ? member.id : ''); }
  function saveScroll(){
    if(!member) return;
    savedScroll = list.scrollTop;
    try { sessionStorage.setItem(scrollKey(), String(savedScroll)); } catch(_) {}
  }
  function resetPreviews(){
    generation++;
    if(observer) observer.disconnect();
    observer = null;
    queue = [];
    previewControllers.forEach(item => item.abort());
  }
  function pumpPreviews(){
    while(active < 4 && queue.length){
      const job = queue.shift();
      if(job.generation !== generation || backdrop.hidden || !job.card.isConnected) continue;
      active++;
      const abort = new AbortController();
      previewControllers.add(abort);
      const timeout = setTimeout(() => abort.abort(), 12000);
      authApi('/api/public-game-preview?watch=' + encodeURIComponent(job.game.watchId), {signal:abort.signal})
        .then(data => {
          if(job.generation !== generation || backdrop.hidden) return;
          job.board.classList.remove('preview-unavailable');
          renderRunningGameBoard(job.board, Object.assign({}, data, {role:job.game.memberRole || job.game.participantRole || 'w'}));
          job.turn.textContent = data.turn === 'b' ? 'Schwarz ist am Zug' : 'Weiß ist am Zug';
        })
        .catch(error => {
          if(job.generation !== generation || backdrop.hidden) return;
          // Remove a stale board too, including when permission was revoked.
          job.board.replaceChildren();
          job.board.classList.remove('preview-ready');
          job.board.removeAttribute('role');
          job.board.removeAttribute('aria-label');
          job.board.classList.add('preview-unavailable');
          job.board.textContent = error && error.message || 'Vorschau momentan nicht verfügbar';
        })
        .finally(() => {
          clearTimeout(timeout);
          previewControllers.delete(abort);
          active--;
          pumpPreviews();
        });
    }
  }
  function observePreview(job){
    job.generation = generation;
    if(!('IntersectionObserver' in window)){
      queue.push(job);
      pumpPreviews();
      return;
    }
    if(!observer){
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if(!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          queue.push(entry.target.memberPreviewJob);
        });
        pumpPreviews();
      }, {root:list, rootMargin:'100px'});
    }
    job.board.memberPreviewJob = job;
    observer.observe(job.board);
  }
  function watchUrl(game){
    // Stay on this installation, including when it is hosted in a subdirectory.
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    const own = game.isParticipant && cleanRoomId(game.roomId);
    url.searchParams.set(own ? 'room' : 'watch', own || game.watchId);
    url.searchParams.set('memberGames', member.id);
    if(member.id !== 'all') url.searchParams.set('memberName', member.username || 'Mitglied');
    return url.toString();
  }
  function createCard(game){
    const card = document.createElement('a');
    card.className = 'member-game-card';
    card.dataset.watchId = game.watchId;
    const board = document.createElement('div');
    board.className = 'running-game-board';
    board.textContent = 'Stellung wird geladen…';
    const names = document.createElement('strong');
    names.className = 'member-game-names';
    const turn = document.createElement('div');
    turn.className = 'running-game-turn';
    const meta = document.createElement('div');
    meta.className = 'member-game-meta';
    const caption = document.createElement('span');
    caption.className = 'running-game-open';
    card.append(board, names, turn, meta, caption);
    card.memberElements = {board, names, turn, meta, caption};
    card.addEventListener('click', () => {
      saveScroll();
      rememberAddress(true);
    });
    return card;
  }
  function renderGames(games){
    resetPreviews();
    const existing = new Map(Array.from(list.children).map(card => [card.dataset.watchId, card]));
    const fragment = document.createDocumentFragment();
    const focused = document.activeElement;
    games.forEach(game => {
      if(!cleanPublicWatchId(game.watchId)) return;
      const card = existing.get(game.watchId) || createCard(game);
      const {board, names, turn, meta, caption} = card.memberElements;
      card.href = watchUrl(game);
      names.textContent = (game.whiteName || 'Weiß') + ' – ' + (game.blackName || 'Schwarz');
      turn.textContent = game.turn === 'b' ? 'Schwarz ist am Zug' : 'Weiß ist am Zug';
      meta.textContent = [publicGameModeLabel(game), game.timeLabel, publicGameVariantLabel(game),
        game.lastMoveSan ? 'Letzter Zug: ' + game.lastMoveSan : '',
        member.id === 'all' ? '' : game.memberRole === 'b' ? 'Mitglied spielt Schwarz' : 'Mitglied spielt Weiß'].filter(Boolean).join(' · ');
      const own = !!(game.isParticipant && cleanRoomId(game.roomId));
      card.classList.toggle('mine', own);
      card.setAttribute('aria-label', names.textContent + ' · ' + (own ? 'Deine Partie öffnen' : 'Zuschauen'));
      const address = new URL(location.href);
      const current = own ? address.searchParams.get('room') === game.roomId : address.searchParams.get('watch') === game.watchId;
      card.classList.toggle('current-game', current);
      if(current) card.setAttribute('aria-current', 'page');
      else card.removeAttribute('aria-current');
      caption.textContent = (current ? 'Hier geöffnet · ' : '') + (own ? 'Deine Partie öffnen →' : 'Zuschauen →');
      fragment.appendChild(card);
      // Observe after insertion so the fallback also sees connected elements.
      card.memberPreview = {board, card, turn, game};
    });
    list.replaceChildren(fragment);
    if(!list.children.length){
      const empty = document.createElement('div');
      empty.className = 'public-games-empty';
      empty.textContent = member.id === 'all' ? 'Derzeit läuft keine öffentlich freigegebene Partie.' : 'Für dieses Mitglied laufen derzeit keine öffentlich freigegebenen Partien.';
      list.appendChild(empty);
    }
    if(focused && focused.isConnected && list.contains(focused)) focused.focus({preventScroll:true});
    list.scrollTop = savedScroll;
    Array.from(list.children).forEach(card => { if(card.memberPreview) observePreview(card.memberPreview); });
  }
  async function loadGames(silent){
    if(!member || backdrop.hidden) return;
    const id = ++requestId;
    if(controller) controller.abort();
    controller = new AbortController();
    const localController = controller;
    const timeout = setTimeout(() => localController.abort(), 15000);
    refresh.disabled = true;
    if(!silent) status.textContent = 'Partien werden geladen…';
    if(list.querySelector('.member-game-card')) saveScroll();
    try {
      const data = await authApi('/api/public-games' + (member.id === 'all' ? '' : '?member=' + encodeURIComponent(member.id)), {signal:localController.signal});
      if(id !== requestId || backdrop.hidden) return;
      if(member.id !== 'all' && data.member) member.username = cleanDisplayName(data.member.username) || member.username;
      updateHeading();
      rememberAddress(true);
      const games = Array.isArray(data.games) ? data.games : [];
      renderGames(games);
      status.textContent = games.length + (games.length === 1 ? ' öffentliche Partie' : ' öffentliche Partien') + ' · Aktualisierung alle 30 Sekunden';
    } catch(error){
      if(id !== requestId || backdrop.hidden) return;
      status.textContent = (error && error.message || 'Partien konnten nicht geladen werden.') + ' Bitte erneut aktualisieren.';
    } finally {
      clearTimeout(timeout);
      if(id === requestId) refresh.disabled = false;
    }
  }
  function updateHeading(){
    const all = member.id === 'all';
    title.textContent = all ? 'Laufende öffentliche Partien' : 'Partien von ' + member.username;
    allButton.hidden = all;
    hint.textContent = all
      ? 'Öffentlich freigegebene Partien mit aktueller Brettvorschau. Eigene Partien öffnest du mit deinem Spielerplatz.'
      : 'Laufende öffentlich freigegebene Partien. Das ausgewählte Mitglied spielt auf den Vorschaubrettern von unten.';
  }
  function openDialog(user){
    if(user && user.id !== 'all' && !/^[A-Za-z0-9_-]{8,128}$/.test(String(user.id || ''))) return;
    if(!backdrop.hidden) saveScroll();
    else opener = document.activeElement;
    resetPreviews();
    member = user ? {id:String(user.id), username:cleanDisplayName(user.username) || 'Mitglied'} : {id:'all', username:''};
    savedScroll = 0;
    try { savedScroll = Math.max(0, Number(sessionStorage.getItem(scrollKey())) || 0); } catch(_) {}
    closeMembersDialog();
    closeMemberProfileDialog();
    list.replaceChildren();
    updateHeading();
    backdrop.hidden = false;
    rememberAddress(true);
    loadGames(false);
    if(timer) clearInterval(timer);
    timer = setInterval(() => { if(!document.hidden) loadGames(true); }, 30000);
    close.focus({preventScroll:true});
  }
  function closeDialog(preserveAddress){
    if(backdrop.hidden) return;
    saveScroll();
    backdrop.hidden = true;
    requestId++;
    if(controller) controller.abort();
    resetPreviews();
    if(timer) clearInterval(timer);
    timer = null;
    if(!preserveAddress) rememberAddress(false);
    // Reopen the original members dialog without resetting its search or scroll.
    if(opener && opener.isConnected && opener.closest('#membersBackdrop')) membersBackdrop.hidden = false;
    if(opener && opener.isConnected) opener.focus({preventScroll:true});
  }
  function restoreFromAddress(){
    syncReturnButton();
    const context = memberFromAddress();
    if(context && new URL(location.href).searchParams.get('memberList') === '1'){
      if(backdrop.hidden || !member || member.id !== context.id) openDialog(context);
      else loadGames(true);
    } else if(!backdrop.hidden) closeDialog(true);
  }
  window.openMemberGamesDialog = openDialog;
  window.closeMemberGamesDialog = () => closeDialog(false);
  allButton.addEventListener('click', () => openDialog(null));
  close.addEventListener('click', () => closeDialog(false));
  document.getElementById('memberGamesCloseIcon').addEventListener('click', () => closeDialog(false));
  refresh.addEventListener('click', () => loadGames(false));
  returnButton.addEventListener('click', () => openDialog(memberFromAddress()));
  backdrop.addEventListener('click', event => { if(event.target === backdrop) closeDialog(false); });
  document.addEventListener('keydown', event => {
    if(backdrop.hidden) return;
    if(event.key === 'Escape'){
      event.preventDefault();
      event.stopImmediatePropagation();
      closeDialog(false);
    } else if(event.key === 'Tab'){
      const controls = Array.from(backdrop.querySelectorAll('button:not(:disabled), a[href]'));
      const first = controls[0], last = controls[controls.length - 1];
      if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
      else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
    }
  }, true);
  window.addEventListener('pagehide', () => {
    if(!backdrop.hidden) saveScroll();
    resetPreviews();
    if(timer) clearInterval(timer);
    timer = null;
  });
  window.addEventListener('pageshow', event => {
    if(event.persisted){
      restoreFromAddress();
      if(!backdrop.hidden && !timer) timer = setInterval(() => { if(!document.hidden) loadGames(true); }, 30000);
    }
  });
  window.addEventListener('popstate', restoreFromAddress);
  document.addEventListener('DOMContentLoaded', () => {
    initialAuthRefreshPromise.finally(restoreFromAddress);
  });
})();

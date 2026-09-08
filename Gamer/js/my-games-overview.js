'use strict';

// Only visible previews are requested, with at most four room reads at once.
let runningPreviewGeneration = 0;
let runningPreviewObserver = null;
let runningPreviewQueue = [];
let runningPreviewActive = 0;
function resetRunningGamePreviews(){
  runningPreviewGeneration++;
  if(runningPreviewObserver) runningPreviewObserver.disconnect();
  runningPreviewObserver = null;
  runningPreviewQueue = [];
}
function pumpRunningGamePreviews(){
  while(runningPreviewActive < 4 && runningPreviewQueue.length){
    const job = runningPreviewQueue.shift();
    if(job.generation !== runningPreviewGeneration || !job.board.isConnected || dailyGamesBackdrop.hidden) continue;
    runningPreviewActive++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    authApi('/api/my-game-preview?room=' + encodeURIComponent(job.game.roomId), {signal:controller.signal})
      .then(data => {
        if(job.generation !== runningPreviewGeneration || !job.board.isConnected) return;
        renderRunningGameBoard(job.board, data);
        // The room snapshot may already be newer than the list response.
        job.card.classList.toggle('my-turn', !data.ended && data.turn === data.role);
        job.turn.textContent = data.ended ? 'Partie inzwischen beendet' : data.turn === data.role ? 'Du bist am Zug' : 'Gegner ist am Zug';
      })
      .catch(() => {
        if(job.generation !== runningPreviewGeneration || !job.board.isConnected) return;
        job.board.classList.add('preview-unavailable');
        job.board.textContent = 'Vorschau momentan nicht verfügbar';
      })
      .finally(() => { clearTimeout(timeout); runningPreviewActive--; pumpRunningGamePreviews(); });
  }
}
function observeRunningGamePreview(job){
  if(!('IntersectionObserver' in window)){
    runningPreviewQueue.push(job);
    requestAnimationFrame(pumpRunningGamePreviews);
    return;
  }
  if(!runningPreviewObserver){
    runningPreviewObserver = new IntersectionObserver(entries => {
      for(const entry of entries){
        if(!entry.isIntersecting) continue;
        runningPreviewObserver.unobserve(entry.target);
        const pending = entry.target.previewJob;
        delete entry.target.previewJob;
        if(pending) runningPreviewQueue.push(pending);
      }
      pumpRunningGamePreviews();
    }, {root:dailyGamesBackdrop, rootMargin:'100px'});
  }
  job.board.previewJob = job;
  runningPreviewObserver.observe(job.board);
}
function renderRunningGameBoard(element, data){
  if(!data || !data.ok || !Array.isArray(data.board) || data.board.length !== 8 ||
    !data.board.every(row => Array.isArray(row) && row.length === 8 && row.every(piece => /^[prnbqkPRNBQK.]$/.test(piece)))){
    throw new Error('Keine gültige Vorschau');
  }
  const fragment = document.createDocumentFragment();
  const black = data.role === 'b';
  const names = {p:'Bauer',r:'Turm',n:'Springer',b:'Läufer',q:'Dame',k:'König'};
  const position = [];
  for(let rank=0;rank<8;rank++) for(let file=0;file<8;file++){
    const x = black ? 7-file : file, y = black ? 7-rank : rank;
    const cell = document.createElement('span');
    cell.className = 'game-preview-square ' + ((x+y)%2 ? 'dark' : 'light');
    cell.dataset.square = coordToAlg(x,y);
    const last = data.lastMove;
    if(last && [last.from,last.to].some(point => Array.isArray(point) && point[0] === x && point[1] === y)) cell.classList.add('last-move');
    const piece = data.board[y][x];
    if(piece !== '.'){
      const img = document.createElement('img');
      img.src = pieceImg[piece];
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      cell.appendChild(img);
      position.push((piece === piece.toUpperCase() ? 'Weiß ' : 'Schwarz ') + names[piece.toLowerCase()] + ' ' + coordToAlg(x,y));
    }
    if(file === 0){
      const coordinate = document.createElement('small');
      coordinate.className = 'preview-rank';
      coordinate.textContent = String(8-y);
      cell.appendChild(coordinate);
    }
    if(rank === 7){
      const coordinate = document.createElement('small');
      coordinate.className = 'preview-file';
      coordinate.textContent = 'abcdefgh'[x];
      cell.appendChild(coordinate);
    }
    fragment.appendChild(cell);
  }
  element.replaceChildren(fragment);
  element.classList.add('preview-ready');
  element.setAttribute('role','img');
  element.setAttribute('aria-label','Aktuelle Stellung, ' + (black ? 'Schwarz' : 'Weiß') + ' unten. ' + position.join(', '));
}
function createRunningGamePreviewCard(game, kind){
  const original = kind === 'live-running' ? createMyLiveRunningCard(game) : createDailyGameCard(game);
  const card = document.createElement('a');
  card.className = original.className + ' running-game-preview-card';
  card.href = dailyGameRoomUrl(game) || '#';
  card.dataset.roomId = cleanRoomId(game.roomId);
  const isCurrent = !!onlineRoomId && cleanRoomId(game.roomId) === cleanRoomId(onlineRoomId);
  if(isCurrent){
    card.classList.add('current-game');
    card.setAttribute('aria-current','page');
  }
  card.addEventListener('click', event => {
    if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if(isCurrent){ event.preventDefault(); closeDailyGamesDialog(); }
    else if(card.getAttribute('href') === '#'){ event.preventDefault(); }
    else closeDailyGamesDialog();
  });
  const board = document.createElement('div');
  board.className = 'running-game-board';
  board.textContent = 'Stellung wird geladen…';
  const content = original.firstElementChild;
  content.classList.add('running-game-details');
  const status = content.querySelector('.daily-game-status');
  const turn = document.createElement('div');
  turn.className = 'running-game-turn';
  turn.textContent = game.isMyTurn ? 'Du bist am Zug' : 'Gegner ist am Zug';
  content.insertBefore(turn,status);
  // Keep draw offers and claims visible alongside the unambiguous turn label.
  if(status && !(game.incomingDrawOffer || game.outgoingDrawOffer || game.drawClaimAvailable)) status.remove();
  if(game.deadlineAt){
    const deadline = document.createElement('div');
    deadline.className = 'running-game-deadline';
    deadline.textContent = 'Zugfrist: noch ' + formatDailyListRemaining(game.deadlineAt);
    deadline.title = formatDailyGameDeadline(game.deadlineAt);
    content.insertBefore(deadline,content.querySelector('.daily-game-meta'));
  }
  const caption = document.createElement('span');
  caption.className = 'running-game-open';
  caption.textContent = isCurrent ? 'Hier geöffnet · Zurück zum Brett' : 'Partie öffnen →';
  card.append(board, content, caption);
  observeRunningGamePreview({board,card,turn,game,generation:runningPreviewGeneration});
  return card;
}

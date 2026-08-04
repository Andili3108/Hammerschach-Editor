'use strict';

function publicGameModeLabel(game){
  return game && game.mode === 'daily' ? 'Daily Chess' : 'Live-Partie';
}
function publicGameVariantLabel(game){
  if(game && game.variant === GAME_VARIANT_FREESTYLE){
    return Number.isFinite(Number(game.positionId)) ? ('Freestyle #' + Number(game.positionId)) : 'Freestyle';
  }
  return 'Klassisch';
}
function openPublicGameRoom(game){
  const ownRoomId = game && game.isParticipant ? cleanRoomId(game.roomId) : '';
  if(ownRoomId){
    const roomUrl = dailyGameRoomUrl({roomId:ownRoomId});
    if(!roomUrl) return;
    closePublicGamesDialog();
    window.location.href = roomUrl;
    return;
  }
  const watchId = cleanPublicWatchId(game && game.watchId);
  if(!watchId) return;
  const url = getSpectatorUrl(watchId);
  window.open(url, '_blank', 'noopener,noreferrer');
}
function createPublicGameCard(game){
  const ownGame = !!(game && game.isParticipant && cleanRoomId(game.roomId));
  const card = document.createElement('div');
  card.className = 'public-game-card' + (ownGame ? ' mine' : '');
  const content = document.createElement('div');
  if(ownGame){
    const kicker = document.createElement('div');
    kicker.className = 'public-game-kicker';
    kicker.textContent = 'Deine Partie';
    content.appendChild(kicker);
  }
  const title = document.createElement('div');
  title.className = 'public-game-title';
  title.textContent = (cleanDisplayName(game.whiteName) || 'Weiß') + ' – ' + (cleanDisplayName(game.blackName) || 'Schwarz');
  const status = document.createElement('div');
  status.className = 'public-game-status';
  const turnLabel = game.turn === 'b' ? 'Schwarz ist am Zug' : 'Weiß ist am Zug';
  const movesCount = Math.max(0, Number(game.movesCount || 0));
  status.textContent = turnLabel + ' · ' + movesCount + ' Halbzug' + (movesCount === 1 ? '' : 'e');
  const meta = document.createElement('div');
  meta.className = 'public-game-meta';
  const parts = [publicGameModeLabel(game), game.timeLabel || '', publicGameVariantLabel(game)];
  if(game.lastMoveSan) parts.push('letzter Zug: ' + game.lastMoveSan);
  if(game.startedAt) parts.push('gestartet: ' + formatPublicGameTime(game.startedAt));
  meta.textContent = parts.filter(Boolean).join(' · ');
  content.appendChild(title);
  content.appendChild(status);
  content.appendChild(meta);
  const watchBtn = document.createElement('button');
  watchBtn.type = 'button';
  watchBtn.className = 'public-game-watch-btn';
  watchBtn.textContent = ownGame ? 'Partie öffnen' : 'Zuschauen';
  watchBtn.title = ownGame
    ? 'Eigene Partie im aktuellen Tab öffnen'
    : 'Partie in einem neuen Tab als Zuschauer öffnen';
  watchBtn.addEventListener('click', () => openPublicGameRoom(game));
  card.appendChild(content);
  card.appendChild(watchBtn);
  return card;
}
function renderPublicGames(games){
  if(!publicGamesListEl) return;
  publicGamesListEl.innerHTML = '';
  const list = Array.isArray(games) ? games : [];
  if(!list.length){
    const empty = document.createElement('div');
    empty.className = 'public-games-empty';
    empty.textContent = 'Derzeit läuft keine öffentlich freigegebene Partie.';
    publicGamesListEl.appendChild(empty);
    return;
  }
  list.forEach(game => publicGamesListEl.appendChild(createPublicGameCard(game)));
}
async function loadPublicGames(options){
  options = options || {};
  const silent = !!options.silent;
  if(!silent && publicGamesStatusEl) publicGamesStatusEl.textContent = 'Laufende Partien werden geladen…';
  if(!silent && publicGamesRefreshBtn) publicGamesRefreshBtn.disabled = true;
  try{
    const data = await authApi('/api/public-games');
    const games = data.games || [];
    renderPublicGames(games);
    if(!silent && publicGamesStatusEl) publicGamesStatusEl.textContent = games.length === 1 ? '1 öffentliche Partie läuft.' : games.length + ' öffentliche Partien laufen.';
  } catch(err){
    if(!silent) renderPublicGames([]);
    if(publicGamesStatusEl) publicGamesStatusEl.textContent = err && err.message ? err.message : 'Öffentliche Partien konnten nicht geladen werden.';
  } finally {
    if(!silent && publicGamesRefreshBtn) publicGamesRefreshBtn.disabled = false;
  }
}
function startPublicGamesRefresh(){
  if(publicGamesRefreshTimer) clearInterval(publicGamesRefreshTimer);
  publicGamesRefreshTimer = setInterval(() => {
    if(publicGamesBackdrop && !publicGamesBackdrop.hidden) loadPublicGames({silent:true});
  }, 30000);
}
function stopPublicGamesRefresh(){
  if(publicGamesRefreshTimer){ clearInterval(publicGamesRefreshTimer); publicGamesRefreshTimer = null; }
}
function openPublicGamesDialog(){
  if(publicGamesBackdrop) publicGamesBackdrop.hidden = false;
  loadPublicGames();
  startPublicGamesRefresh();
}
function closePublicGamesDialog(){
  if(publicGamesBackdrop) publicGamesBackdrop.hidden = true;
  stopPublicGamesRefresh();
}
if(publicGamesOpenBtn) publicGamesOpenBtn.addEventListener('click', openPublicGamesDialog);
if(publicGamesRefreshBtn) publicGamesRefreshBtn.addEventListener('click', () => loadPublicGames());
if(publicGamesCloseBtn) publicGamesCloseBtn.addEventListener('click', closePublicGamesDialog);
if(publicGamesBackdrop) publicGamesBackdrop.addEventListener('click', ev => { if(ev.target === publicGamesBackdrop) closePublicGamesDialog(); });
document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && publicGamesBackdrop && !publicGamesBackdrop.hidden) closePublicGamesDialog(); });


'use strict';

function newGame(){
  stopClock();
  setRightPanelMode('moves');
  onlineClockSync = null;
  masterHistory = buildThemeHistory(currentGameSetup);
  invalidateHistoryStateCache();
  viewIndex = masterHistory.length;
  pendingDailyMove = null;
  queuedPremove = null;
  selected = null;
  lastMove = masterHistory.length ? {from:masterHistory[masterHistory.length-1].from,to:masterHistory[masterHistory.length-1].to,meta:masterHistory[masterHistory.length-1].meta || {}} : null;
  gameEnded = false;
  resetClockForNewGame();
  renderBoard();
}
function openNewGameView(){
  let targetUrl = '';
  try{
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.delete('role');
    url.searchParams.delete('player');
    url.searchParams.delete('watch');
    url.searchParams.set('fresh', '1');
    targetUrl = url.toString();
  } catch(_){
    targetUrl = (window.location.pathname || '/') + '?fresh=1';
  }

  /*
   * Einen Spielraum immer im aktuellen Browser-Tab verlassen. Das gilt
   * sowohl für den direkt geöffneten Gamer als auch für die Einbettung auf
   * Andili; dadurch entstehen beim Wechsel zur Lobby keine zusätzlichen Tabs.
   */
  window.location.assign(targetUrl);
}
if(newGameBtn) newGameBtn.addEventListener('click', event => {
  if(onlineRoomId) openNewGameView();
  else offerPreparedGame(event);
});
if(roomLobbyBtn) roomLobbyBtn.addEventListener('click', event => {
  if(embeddedToolActive()){
    event.preventDefault();
    closeEmbeddedTools();
    return;
  }
  openNewGameView();
});
if(flipBoardBtn) flipBoardBtn.addEventListener('click', () => {
  if(variationModeActive){
    variationOrientationWhite = !variationOrientationWhite;
    variationSelected = null;
    renderVariationBoard();
    return;
  }
  if(queuedPremove) cancelQueuedPremove({silent:true,render:false});
  orientationWhite = !orientationWhite;
  selected = null;
  renderBoard();
});

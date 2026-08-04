'use strict';

function formatLiveTournamentCountdown(targetValue){
  const target = targetValue ? Date.parse(targetValue) : NaN;
  if(!Number.isFinite(target)) return '';
  const remaining = Math.max(0, target - (Date.now() + liveTournamentClockOffsetMs));
  if(remaining <= 0) return 'Bretter werden jetzt aufgebaut …';
  const totalSeconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return 'Noch ' + (hours > 0 ? (String(hours).padStart(2,'0') + ':') : '') + String(minutes).padStart(2,'0') + ':' + String(seconds).padStart(2,'0');
}
function updateLiveTournamentCountdown(){
  const selected = tournamentSelectedId ? selectedTournament() : null;
  if(selected && selected.live && ['open','full'].includes(selected.status) && selected.userState === 'confirmed' && !selected.checkedIn && !selected.canCheckIn){
    const opensAt = Date.parse(selected.checkInOpensAt || '');
    if(Number.isFinite(opensAt) && Date.now() + liveTournamentClockOffsetMs >= opensAt){
      selected.canCheckIn = true;
      renderTournamentDetail(selected);
      return;
    }
  }
  if(!tournamentLiveWaiting || tournamentLiveWaiting.hidden || !tournamentLiveWaitingCountdown) return;
  const target = tournamentLiveWaiting.dataset.countdownTarget || '';
  tournamentLiveWaitingCountdown.textContent = formatLiveTournamentCountdown(target);
}
function renderLiveTournamentWaiting(tournament){
  if(!tournamentLiveWaiting) return;
  const liveStatus = activeLiveTournamentStatus && String(activeLiveTournamentStatus.tournamentId) === String(tournament.id)
    ? activeLiveTournamentStatus
    : null;
  const beforeStart = !!(tournament.live && ['open','full'].includes(tournament.status) && tournament.checkedIn);
  const running = !!(tournament.live && tournament.status === 'running' && tournament.userState === 'playing');
  tournamentLiveWaiting.hidden = !(beforeStart || running);
  tournamentLiveWaiting.dataset.countdownTarget = '';
  if(!(beforeStart || running)) return;

  let title = beforeStart ? '✅ Eingecheckt – startbereit' : '♟️ Live-Turnier-Warteraum';
  let text = beforeStart
    ? 'Bleib zum Turnierstart im Hammerschach-Gamer. Das Turnier startet automatisch und dein Brett mit Gegner erscheint von selbst.'
    : 'Bleib hier im Gamer. Dein nächstes Brett wird automatisch geöffnet.';
  let target = beforeStart ? tournament.scheduledStartAt : (tournament.arena ? tournament.arenaEndsAt : tournament.nextRoundAt);
  if(liveStatus){
    if(liveStatus.arena){
      target = liveStatus.arenaEndsAt || target;
      if(liveStatus.arenaClosed){
        title = '🏁 Arena-Zeit beendet';
        text = liveStatus.game && liveStatus.game.status === 'running' ? 'Deine laufende Partie wird noch vollständig gewertet.' : 'Es werden keine neuen Paarungen mehr erzeugt.';
      } else if(liveStatus.paused){
        title = '⏸️ Arena pausiert';
        text = 'Du erhältst momentan keine neue Paarung. Mit „Arena fortsetzen“ steigst du wieder in die Warteschlange ein.';
      } else if(Number.isFinite(Date.parse(liveStatus.pairingNotBefore || '')) && Date.parse(liveStatus.pairingNotBefore) > Date.now() + liveTournamentClockOffsetMs){
        target = liveStatus.pairingNotBefore;
        title = '⏱️ Kurzes Pausenfenster';
        text = 'Die nächste Paarung startet in wenigen Sekunden. Mit „Arena pausieren“ kannst du die Neuverpaarung jetzt stoppen.';
      } else if(liveStatus.game && liveStatus.game.status === 'creating'){
        title = '🛠️ Dein Arena-Brett wird aufgebaut';
        text = 'Gleich geht es gegen ' + (liveStatus.game.opponentName || 'deinen Gegner') + '. Du wirst automatisch ans Brett gesetzt.';
      } else {
        title = '⚔️ Arena-Warteraum';
        text = 'Du bist aktiv. Sobald ein passender Gegner frei ist, öffnet sich dein Brett automatisch.';
      }
    } else {
    target = liveStatus.nextRoundAt || target;
    if(liveStatus.bye){
      title = '🎟️ Freilos in ' + (liveStatus.roundLabel || ('Runde ' + liveStatus.currentRound));
      text = 'Du erhältst 1 Punkt. Sobald die übrigen Partien beendet sind, wird dein Brett für die nächste Runde automatisch geöffnet.';
    } else if(liveStatus.game && liveStatus.game.status === 'creating'){
      title = '🛠️ Dein Brett wird aufgebaut';
      text = 'Gleich geht es gegen ' + (liveStatus.game.opponentName || 'deinen Gegner') + '. Du wirst automatisch ans Brett gesetzt.';
    } else if(liveStatus.game && liveStatus.game.status === 'ended'){
      title = '✅ Partie beendet';
      text = 'Warte hier, bis alle Partien dieser Runde beendet sind. Danach beginnt die 60-Sekunden-Pause und dein nächstes Brett öffnet sich automatisch.';
    } else if(!liveStatus.game){
      title = liveStatus.nextRoundAt ? '⏳ Nächste Runde wird vorbereitet' : '♟️ Live-Turnier-Warteraum';
      text = liveStatus.nextRoundAt
        ? 'Nach der kurzen Rundenpause wird dein nächstes Brett automatisch geöffnet.'
        : 'Die Paarungen werden vorbereitet. Bleib im Gamer – dein Brett erscheint automatisch.';
    }
    }
  }
  if(tournamentLiveWaitingTitle) tournamentLiveWaitingTitle.textContent = title;
  if(tournamentLiveWaitingText) tournamentLiveWaitingText.textContent = text;
  tournamentLiveWaiting.dataset.countdownTarget = target || '';
  updateLiveTournamentCountdown();
}
function tournamentWaitingAddress(tournamentId){
  try{
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.delete('watch');
    url.searchParams.delete('fresh');
    url.searchParams.set('tournament', String(tournamentId || ''));
    return url;
  } catch(_){ return null; }
}
function liveTournamentWaitingStateKey(status){
  if(!status || !status.tournamentId) return '';
  const game = status.game || {};
  return [
    String(status.tournamentId),
    status.arena ? 'arena' : 'swiss',
    String(status.status || ''),
    status.arena ? String(Number(status.arenaActive || 0)) : String(Number(status.currentRound || 0)),
    String(game.roomId || ''),
    String(game.status || ''),
    status.bye ? 'bye' : '',
    String(status.pairingNotBefore || ''),
    String(status.nextRoundAt || ''),
    status.arenaClosed ? 'closed' : ''
  ].join('|');
}
function showLiveTournamentWaitingRoom(status){
  if(!status || !status.tournamentId) return;
  const endedRoomId = status.game && status.game.roomId ? cleanRoomId(status.game.roomId) : '';
  const leaveFinishedBoard = !!(onlineRoomId && (onlineGameEnded || gameEnded || timeLost) && (!endedRoomId || status.game.status !== 'running' || onlineRoomId === endedRoomId));
  if(leaveFinishedBoard || (endedRoomId && onlineRoomId === endedRoomId && status.game.status === 'ended')){
    closeOnlineSocket();
    onlineRoomId = '';
    onlineConnected = false;
    onlineConnectionState = 'closed';
    onlineRoleCode = 'local';
    try{ sessionStorage.removeItem(ONLINE_LAST_ROOM_STORAGE_KEY); } catch(_){ }
    const url = tournamentWaitingAddress(status.tournamentId);
    if(url) history.replaceState(null, '', url.toString());
    updateOnlineUi();
  }
  const alreadyOpen = !!(tournamentBackdrop && !tournamentBackdrop.hidden && tournamentSelectedId === String(status.tournamentId));
  if(alreadyOpen){
    const tournament = selectedTournament();
    if(tournament) renderLiveTournamentWaiting(tournament);
    return;
  }
  if(status.arena && status.paused) return;
  const waitingStateKey = liveTournamentWaitingStateKey(status);
  if(!waitingStateKey || liveTournamentWaitingDismissedKey === waitingStateKey || liveTournamentWaitingTournamentId === waitingStateKey) return;
  liveTournamentWaitingTournamentId = waitingStateKey;
  openTournamentDialog(String(status.tournamentId)).finally(() => { liveTournamentWaitingTournamentId = ''; });
}
function openLiveTournamentBoard(status){
  const game = status && status.game;
  const roomId = cleanRoomId(game && game.roomId);
  if(!roomId || game.status !== 'running' || onlineRoomId === roomId || liveTournamentNavigatingRoomId === roomId) return;
  liveTournamentNavigatingRoomId = roomId;
  closeTournamentDialog();
  closeEmbeddedTools();
  closePlayerMenu();
  if(statusEl) statusEl.textContent = (status.roundLabel || ('Runde ' + status.currentRound)) + ': Dein Brett gegen ' + (game.opponentName || 'deinen Gegner') + ' wird geöffnet.';
  connectOnlineRoom(roomId, {reconnect:true, spectatorOnly:false, preferredRole:game.role || ''});
  setTimeout(() => { if(liveTournamentNavigatingRoomId === roomId) liveTournamentNavigatingRoomId = ''; }, 5000);
}
function handleLiveTournamentStatus(status){
  activeLiveTournamentStatus = status || null;
  if(!status){
    liveTournamentNavigatingRoomId = '';
    liveTournamentWaitingDismissedKey = '';
    return;
  }
  const liveItem = tournamentItems.find(item => item && String(item.id) === String(status.tournamentId));
  if(liveItem && status.arena){
    liveItem.arenaActive = Number(status.arenaActive || 0);
    liveItem.arenaEndsAt = status.arenaEndsAt || liveItem.arenaEndsAt;
    liveItem.arenaClosedAt = status.arenaClosed ? (liveItem.arenaClosedAt || new Date().toISOString()) : null;
    liveItem.arenaPairingNotBefore = status.pairingNotBefore || null;
  }
  if(status.game && status.game.status === 'running'){
    openLiveTournamentBoard(status);
  } else if(status.bye || !status.game || status.game.status === 'creating' || status.game.status === 'ended'){
    showLiveTournamentWaitingRoom(status);
  }
  if(tournamentSelectedId === String(status.tournamentId)){
    const tournament = selectedTournament();
    if(tournament) renderLiveTournamentWaiting(tournament);
  }
}
async function pollLiveTournamentStatus(){
  if(liveTournamentPollBusy || !onlineAuthToken || !onlineAuthUser) return;
  liveTournamentPollBusy = true;
  try{
    const data = await authApi('/api/tournaments/live-status');
    const serverNow = Number(data && data.serverNow || data && data.liveTournament && data.liveTournament.serverNow || 0);
    if(Number.isFinite(serverNow) && serverNow > 0) liveTournamentClockOffsetMs = serverNow - Date.now();
    handleLiveTournamentStatus(data ? data.liveTournament : null);
  } catch(_){
    /* Ein kurzer Verbindungsfehler darf die laufende Partie nicht unterbrechen. */
  } finally {
    liveTournamentPollBusy = false;
  }
}
function startLiveTournamentPolling(){
  if(liveTournamentPollTimer) clearTimeout(liveTournamentPollTimer);
  if(!onlineAuthToken || !onlineAuthUser) return;
  const generation = ++liveTournamentPollGeneration;
  const run = async () => {
    if(generation !== liveTournamentPollGeneration || !onlineAuthToken || !onlineAuthUser) return;
    await pollLiveTournamentStatus();
    if(generation !== liveTournamentPollGeneration || !onlineAuthToken || !onlineAuthUser) return;
    const active = !!activeLiveTournamentStatus;
    const delay = document.visibilityState !== 'visible'
      ? 60000
      : (active ? 2500 : (onlineRoomId && onlineGameStarted ? 30000 : 15000));
    liveTournamentPollTimer = setTimeout(run,delay);
  };
  run();
}
function stopLiveTournamentPolling(){
  liveTournamentPollGeneration++;
  if(liveTournamentPollTimer){ clearTimeout(liveTournamentPollTimer); liveTournamentPollTimer = null; }
  liveTournamentPollBusy = false;
  activeLiveTournamentStatus = null;
  liveTournamentNavigatingRoomId = '';
  liveTournamentWaitingTournamentId = '';
  liveTournamentWaitingDismissedKey = '';
}
window.setInterval(updateLiveTournamentCountdown, 1000);


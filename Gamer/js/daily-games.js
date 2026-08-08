'use strict';

function formatDailyGameDeadline(value){
  if(!value) return '';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  try{
    return date.toLocaleString('de-DE', {weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
  } catch(_){ return ''; }
}
function formatDailyListRemaining(value){
  if(!value) return '';
  const deadline = new Date(value).getTime();
  if(!Number.isFinite(deadline)) return '';
  return formatDailyRemaining(Math.max(0, deadline - Date.now()));
}
function dailyResultLabel(result){
  if(result === '1-0') return '1–0';
  if(result === '0-1') return '0–1';
  if(result === '1/2-1/2') return '½–½';
  return result && result !== '*' ? String(result) : '—';
}
function dailyEndReasonLabel(reason){
  const labels = {
    time:'Zeitüberschreitung',
    resignation:'Aufgabe',
    draw_agreed:'Remis vereinbart',
    checkmate:'Schachmatt',
    stalemate:'Patt',
    insufficient_material:'Unzureichendes Mattmaterial',
    fifty_move_rule:'50-Züge-Regel',
    threefold_repetition:'Dreifache Stellungswiederholung'
  };
  return labels[String(reason || '')] || 'Partie beendet';
}
function dailyOutcomeForUser(game){
  const result = String(game && game.result || '*');
  const role = game && game.role === 'b' ? 'b' : 'w';
  if(result === '1/2-1/2') return {label:'Remis', className:'result-draw'};
  if(result === '1-0') return role === 'w' ? {label:'Gewonnen', className:'result-win'} : {label:'Verloren', className:'result-loss'};
  if(result === '0-1') return role === 'b' ? {label:'Gewonnen', className:'result-win'} : {label:'Verloren', className:'result-loss'};
  return {label:'Beendet', className:''};
}
function dailyGameRoomUrl(game){
  try{
    const roomId = cleanRoomId(game && game.roomId);
    if(!roomId) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    url.searchParams.delete('watch');
    url.searchParams.delete('fresh');
    url.searchParams.delete('role');
    url.searchParams.delete('player');
    url.searchParams.delete('tournament');
    return url.toString();
  } catch(_){
    return '';
  }
}
function dailyPgnFilenameFromDisposition(value, game){
  const match = String(value || '').match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  if(match && match[1]){
    try{ return decodeURIComponent(match[1].trim().replace(/^\"|\"$/g, '')); } catch(_){ return match[1].trim(); }
  }
  const date = game && game.endedAt ? new Date(game.endedAt) : new Date();
  const datePart = Number.isNaN(date.getTime()) ? 'Partie' : date.toISOString().slice(0,10);
  return 'Hammerschach-' + datePart + '-' + cleanRoomId(game && game.roomId || 'Daily') + '.pgn';
}
async function downloadDailyGamePgn(game, button){
  const roomId = cleanRoomId(game && game.roomId);
  if(!roomId){ if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Ungültiger Spielraum.'; return; }
  const oldText = button ? button.textContent : '';
  if(button){ button.disabled = true; button.textContent = 'Lade…'; }
  if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'PGN-Datei wird erstellt…';
  try{
    const response = await fetch(onlineApiBaseUrl() + '/api/daily-games/' + encodeURIComponent(roomId) + '/pgn', {
      method:'GET',
      headers:{authorization:'Bearer ' + onlineAuthToken}
    });
    if(!response.ok){
      let message = 'PGN-Datei konnte nicht geladen werden.';
      try{ const data = await response.json(); if(data && data.message) message = data.message; } catch(_){}
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = dailyPgnFilenameFromDisposition(response.headers.get('content-disposition'), game);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try{ URL.revokeObjectURL(url); } catch(_){}
      try{ link.remove(); } catch(_){}
    }, 1000);
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'PGN-Datei wurde heruntergeladen.';
  } catch(err){
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = err && err.message ? err.message : 'PGN-Datei konnte nicht geladen werden.';
  } finally {
    if(button){ button.disabled = false; button.textContent = oldText || 'PGN'; }
  }
}
async function removeDailyGameFromHistory(game, button){
  const roomId = cleanRoomId(game && game.roomId);
  if(!roomId){ if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Ungültiger Spielraum.'; return; }
  if(!window.confirm('Diese beendete Partie aus deinem Verlauf entfernen?\n\nDie Partie wird nur aus deiner eigenen Übersicht ausgeblendet. Beim Gegner und im Spielraum bleibt sie erhalten.')) return;
  const oldText = button ? button.textContent : '';
  if(button){ button.disabled = true; button.textContent = 'Entferne…'; }
  if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Partie wird aus deinem Verlauf entfernt…';
  try{
    await authApi('/api/daily-games/' + encodeURIComponent(roomId) + '/history', {method:'DELETE'});
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Partie wurde aus deinem persönlichen Verlauf entfernt.';
    await loadDailyGames();
  } catch(err){
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = err && err.message ? err.message : 'Die Partie konnte nicht aus deinem Verlauf entfernt werden.';
    if(button){ button.disabled = false; button.textContent = oldText || 'Aus Verlauf entfernen'; }
  }
}
function createDailyGameCard(game){
  const card = document.createElement('div');
  const isActiveMyTurn = !!(game.isMyTurn && !game.ended);
  card.className = 'daily-game-card' + (isActiveMyTurn ? ' my-turn' : '') + (game.ended ? ' completed' : '') + (game.isTournamentGame ? ' tournament-game' : '');
  if(isActiveMyTurn) card.setAttribute('aria-label', 'Du bist am Zug');
  const content = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'daily-game-title';
  const titleText = document.createElement('span');
  titleText.className = 'daily-game-title-text';
  const pendingOpponentName = cleanDisplayName(game.invitedOpponentName || game.opponentName || '');
  titleText.textContent = game.pendingInvitation
    ? (pendingOpponentName && pendingOpponentName !== 'noch offen' ? 'Einladung an ' + pendingOpponentName : 'Offene Daily-Einladung')
    : 'gegen ' + (cleanDisplayName(game.opponentName) || 'Gegner');
  title.appendChild(titleText);
  if(!game.ended && game.opponentJoined) title.appendChild(createPresenceBadge(!!game.opponentOnline));
  const status = document.createElement('div');
  status.className = 'daily-game-status';
  if(game.ended){
    const outcome = dailyOutcomeForUser(game);
    status.textContent = outcome.label + ' · ' + dailyResultLabel(game.result);
    if(outcome.className) status.classList.add(outcome.className);
  } else if(game.pendingInvitation) status.textContent = pendingOpponentName && pendingOpponentName !== 'noch offen'
    ? pendingOpponentName + ' hat die Einladung noch nicht angenommen'
    : 'Wartet auf Annahme durch den Gegner';
  else if(!game.started) status.textContent = 'Annahme wird verarbeitet';
  else if(game.isMyTurn) status.textContent = 'Du bist am Zug' + (game.deadlineAt ? ' · noch ' + formatDailyListRemaining(game.deadlineAt) : '');
  else status.textContent = 'Gegner ist am Zug';

  const meta = document.createElement('div');
  meta.className = 'daily-game-meta';
  const variant = game.variant === GAME_VARIANT_FREESTYLE ? 'Freestyle' : 'Klassisch';
  if(game.ended){
    const endedAt = game.endedAt ? (' · beendet: ' + formatDailyGameDeadline(game.endedAt)) : '';
    meta.textContent = (game.timeLabel || 'Daily Chess') + ' · ' + variant + ' · ' + (game.rated === false ? 'Ungewertet' : 'Gewertet') + ' · ' + dailyEndReasonLabel(game.endReason) + endedAt;
  } else {
    const deadline = game.deadlineAt ? (' · Zugfrist: ' + formatDailyGameDeadline(game.deadlineAt)) : '';
    meta.textContent = (game.timeLabel || 'Daily Chess') + ' · ' + variant + ' · ' + (game.rated === false ? 'Ungewertet' : 'Gewertet') + deadline;
  }
  content.appendChild(title);
  if(game.isTournamentGame){
    const tournamentBadge = document.createElement('div');
    tournamentBadge.className = 'daily-tournament-badge';
    tournamentBadge.textContent = '🏆 ' + (game.tournamentName || 'Turnier') + ' · ' + (game.tournamentRoundLabel || ('Runde ' + Number(game.tournamentRound || 0))) + (game.tournamentPositionId === null || game.tournamentPositionId === undefined ? '' : ' · Position ' + Number(game.tournamentPositionId));
    content.appendChild(tournamentBadge);
  }
  content.appendChild(status);
  content.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'daily-game-actions';
  const openLink = document.createElement('a');
  const roomUrl = dailyGameRoomUrl(game);
  openLink.className = 'daily-game-open-btn';
  openLink.href = roomUrl || '#';
  openLink.textContent = game.ended ? 'Partie ansehen' : (game.pendingInvitation ? 'Einladung öffnen' : 'Partie öffnen');
  openLink.title = 'Partie im aktuellen Tab öffnen';
  if(!roomUrl){
    openLink.addEventListener('click', event => {
      event.preventDefault();
      if(statusEl) statusEl.textContent = 'Partielink konnte nicht geöffnet werden.';
    });
  }
  actions.appendChild(openLink);

  if(game.ended){
    const pgnBtn = document.createElement('button');
    pgnBtn.type = 'button';
    pgnBtn.className = 'daily-game-pgn-btn';
    pgnBtn.textContent = 'PGN';
    pgnBtn.title = 'Beendete Partie als PGN-Datei herunterladen';
    pgnBtn.addEventListener('click', () => downloadDailyGamePgn(game, pgnBtn));
    actions.appendChild(pgnBtn);

    const historyDeleteBtn = document.createElement('button');
    historyDeleteBtn.type = 'button';
    historyDeleteBtn.className = 'daily-game-history-delete-btn';
    historyDeleteBtn.textContent = 'Aus Verlauf entfernen';
    historyDeleteBtn.title = 'Beendete Partie nur aus der eigenen Übersicht ausblenden';
    historyDeleteBtn.addEventListener('click', () => removeDailyGameFromHistory(game, historyDeleteBtn));
    actions.appendChild(historyDeleteBtn);
  }

  if(game.canDeleteInvitation){
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'daily-game-delete-btn';
    deleteBtn.textContent = 'Einladung löschen';
    deleteBtn.title = 'Offene Daily-Einladung dauerhaft zurückziehen';
    deleteBtn.addEventListener('click', () => deleteDailyInvitation(game, deleteBtn));
    actions.appendChild(deleteBtn);
  }

  card.appendChild(content);
  card.appendChild(actions);
  return card;
}
function appendDailyGamesSection(titleText, games, emptyText){
  const section = document.createElement('section');
  section.className = 'daily-games-section';
  const heading = document.createElement('div');
  heading.className = 'daily-games-section-title';
  const title = document.createElement('span');
  title.textContent = titleText;
  const count = document.createElement('span');
  count.className = 'daily-games-section-count';
  count.textContent = String(games.length);
  heading.appendChild(title);
  heading.appendChild(count);
  section.appendChild(heading);
  if(games.length === 0){
    const empty = document.createElement('div');
    empty.className = 'daily-games-empty';
    empty.textContent = emptyText;
    section.appendChild(empty);
  } else {
    games.forEach(game => section.appendChild(createDailyGameCard(game)));
  }
  dailyGamesListEl.appendChild(section);
}
let dailyGamesTournamentOnly = false;
let dailyGamesCache = [];
function renderDailyGames(games){
  if(!dailyGamesListEl) return;
  dailyGamesListEl.innerHTML = '';
  const sourceGames = Array.isArray(games) ? games : [];
  const allGames = dailyGamesTournamentOnly ? sourceGames.filter(game => game.isTournamentGame) : sourceGames;
  const activeGames = allGames.filter(game => !game.ended);
  const completedGames = allGames.filter(game => !!game.ended);
  appendDailyGamesSection('Laufende Partien und Einladungen', activeGames, 'Du hast derzeit keine laufende Daily-Partie oder offene Einladung.');
  appendDailyGamesSection('Beendete Partien', completedGames, 'Noch keine beendeten Daily-Partien im Verlauf.');
}
let nextDailyGameTarget = null;
let nextDailyGameLoading = false;
let nextDailyGameLastContext = '';
let nextDailyGameLastLoadedAt = 0;
function nextDailyGameEligible(){
  return !!(
    nextDailyGameBoxEl && nextDailyGameBtn && onlineRoomId && !onlineRoomCancelled &&
    onlineAuthToken && onlineAuthUser && isDailyTimeControl() &&
    (onlineRoleCode === 'w' || onlineRoleCode === 'b') && !onlineSpectatorOnly
  );
}
function nextDailyDeadlineTimestamp(value){
  const numeric = Number(value);
  if(Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}
function hideNextDailyGameButton(){
  nextDailyGameTarget = null;
  nextDailyGameLastContext = '';
  if(nextDailyGameBoxEl) nextDailyGameBoxEl.hidden = true;
  if(nextDailyGameBtn){
    nextDailyGameBtn.disabled = true;
    nextDailyGameBtn.textContent = 'Keine weitere Partie am Zug';
  }
  if(nextDailyGameHintEl) nextDailyGameHintEl.textContent = '';
}
async function refreshNextDailyGameButton(options){
  options = options || {};
  if(!nextDailyGameEligible()){
    hideNextDailyGameButton();
    return;
  }
  const userKey = String((onlineAuthUser && (onlineAuthUser.id || onlineAuthUser.userId || onlineAuthUser.username)) || 'user');
  const context = [userKey, onlineRoomId, onlineGameStarted ? 'started' : 'waiting', onlineGameEnded ? 'ended' : 'active', masterHistory.length].join('|');
  const recentlyLoaded = context === nextDailyGameLastContext && (Date.now() - nextDailyGameLastLoadedAt) < 30000;
  if(nextDailyGameLoading || (!options.force && recentlyLoaded)) return;

  nextDailyGameBoxEl.hidden = true;
  nextDailyGameTarget = null;
  nextDailyGameLoading = true;
  nextDailyGameBtn.disabled = true;
  nextDailyGameBtn.textContent = 'Weitere fällige Partie wird gesucht…';
  if(nextDailyGameHintEl) nextDailyGameHintEl.textContent = 'Deine Daily-Partien werden geprüft.';
  try{
    const data = await authApi('/api/daily-games');
    const currentRoom = cleanRoomId(onlineRoomId);
    const candidates = (Array.isArray(data.games) ? data.games : [])
      .filter(game => !game.ended && !!game.started && !!game.isMyTurn && cleanRoomId(game.roomId) && cleanRoomId(game.roomId) !== currentRoom)
      .sort((a,b) => {
        const deadlineDiff = nextDailyDeadlineTimestamp(a.deadlineAt) - nextDailyDeadlineTimestamp(b.deadlineAt);
        if(deadlineDiff) return deadlineDiff;
        return String(a.roomId || '').localeCompare(String(b.roomId || ''));
      });
    nextDailyGameTarget = candidates[0] || null;
    nextDailyGameLastContext = context;
    nextDailyGameLastLoadedAt = Date.now();
    if(nextDailyGameTarget){
      nextDailyGameBoxEl.hidden = false;
      const count = candidates.length;
      nextDailyGameBtn.disabled = false;
      nextDailyGameBtn.textContent = count > 1 ? ('➡ Nächste fällige Partie (' + count + ')') : '➡ Nächste fällige Partie';
      const opponent = cleanDisplayName(nextDailyGameTarget.opponentName) || 'Gegner';
      const deadline = nextDailyGameTarget.deadlineAt ? formatDailyGameDeadline(nextDailyGameTarget.deadlineAt) : '';
      if(nextDailyGameHintEl){
        nextDailyGameHintEl.textContent = 'gegen ' + opponent + (deadline ? ' · Zugfrist: ' + deadline : '');
      }
    } else {
      nextDailyGameBoxEl.hidden = true;
      nextDailyGameBtn.disabled = true;
      nextDailyGameBtn.textContent = 'Keine weitere Partie am Zug';
      if(nextDailyGameHintEl) nextDailyGameHintEl.textContent = '';
    }
  } catch(err){
    nextDailyGameTarget = null;
    nextDailyGameBoxEl.hidden = true;
    nextDailyGameBtn.disabled = true;
    nextDailyGameBtn.textContent = 'Daily-Partien nicht abrufbar';
    if(nextDailyGameHintEl) nextDailyGameHintEl.textContent = '';
  } finally {
    nextDailyGameLoading = false;
  }
}
function openNextDailyGame(){
  if(!nextDailyGameTarget) return;
  const url = dailyGameRoomUrl(nextDailyGameTarget);
  if(!url){
    if(nextDailyGameHintEl) nextDailyGameHintEl.textContent = 'Der Partielink konnte nicht erzeugt werden.';
    return;
  }
  window.location.assign(url);
}
if(nextDailyGameBtn) nextDailyGameBtn.addEventListener('click', openNextDailyGame);
window.setInterval(() => {
  if(nextDailyGameEligible()) refreshNextDailyGameButton({force:true});
}, 60000);

async function deleteDailyInvitation(game, button){
  const roomId = cleanRoomId(game && game.roomId);
  if(!roomId){
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Ungültiger Spielraum.';
    return;
  }
  if(!window.confirm('Diese Daily-Einladung wirklich löschen?\n\nDer bisherige Einladungslink wird dauerhaft ungültig.')) return;
  const oldText = button ? button.textContent : '';
  if(button){ button.disabled = true; button.textContent = 'Lösche…'; }
  if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Einladung wird gelöscht…';
  try{
    await authApi('/api/daily-games/' + encodeURIComponent(roomId), {method:'DELETE'});
    if(roomId === onlineRoomId){
      applyRoomCancelled('Diese Einladung wurde zurückgezogen. Der Spielraum ist nicht mehr verfügbar.');
    }
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Einladung wurde gelöscht. Der alte Link ist nicht mehr gültig.';
    await loadDailyGames();
  } catch(err){
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = err && err.message ? err.message : 'Einladung konnte nicht gelöscht werden.';
    if(button){ button.disabled = false; button.textContent = oldText || 'Einladung löschen'; }
  }
}
let dailyGamesPresenceRefreshTimer = null;
async function loadDailyGames(options){
  options = options || {};
  const silent = !!options.silent;
  if(!onlineAuthToken || !onlineAuthUser){
    if(!silent && dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Bitte zuerst einloggen.';
    if(!silent) openAuthDialog('login');
    return;
  }
  if(!silent && dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Partien werden geladen...';
  if(!silent && dailyGamesRefreshBtn) dailyGamesRefreshBtn.disabled = true;
  try{
    const data = await authApi('/api/daily-games');
    const games = data.games || [];
    dailyGamesCache = games;
    const myTurnCount = games.filter(game => !game.ended && !!game.started && !!game.isMyTurn).length;
    if(dailyGamesTurnCount){
      dailyGamesTurnCount.hidden = myTurnCount < 1;
      dailyGamesTurnCount.textContent = String(myTurnCount);
      dailyGamesTurnCount.setAttribute('aria-label', myTurnCount === 1 ? '1 Daily-Partie: Du bist am Zug' : myTurnCount + ' Daily-Partien: Du bist am Zug');
    }
    const runningTournamentCount = games.filter(game => game.isTournamentGame && !game.ended).length;
    if(tournamentGamesCount){
      tournamentGamesCount.hidden = runningTournamentCount < 1;
      tournamentGamesCount.textContent = String(runningTournamentCount);
    }
    renderDailyGames(games);
    const visibleGames = dailyGamesTournamentOnly ? games.filter(game => game.isTournamentGame) : games;
    const activeCount = visibleGames.filter(game => !game.ended).length;
    const completedCount = visibleGames.filter(game => !!game.ended).length;
    if(!silent && dailyGamesStatusEl) dailyGamesStatusEl.textContent = activeCount + ' laufend/offen · ' + completedCount + ' beendet.';
  } catch(err){
    if(dailyGamesTurnCount){ dailyGamesTurnCount.hidden = true; dailyGamesTurnCount.textContent = '0'; }
    if(!silent){
      renderDailyGames([]);
      if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = err && err.message ? err.message : 'Daily-Partien konnten nicht geladen werden.';
    }
  } finally {
    if(!silent && dailyGamesRefreshBtn) dailyGamesRefreshBtn.disabled = false;
  }
}
function startDailyGamesPresenceRefresh(){
  if(dailyGamesPresenceRefreshTimer) clearInterval(dailyGamesPresenceRefreshTimer);
  dailyGamesPresenceRefreshTimer = setInterval(() => {
    if(dailyGamesBackdrop && !dailyGamesBackdrop.hidden) loadDailyGames({silent:true});
  }, 60000);
}
function stopDailyGamesPresenceRefresh(){
  if(dailyGamesPresenceRefreshTimer){ clearInterval(dailyGamesPresenceRefreshTimer); dailyGamesPresenceRefreshTimer = null; }
}
function openDailyGamesDialog(tournamentOnly){
  if(!onlineAuthToken || !onlineAuthUser){ openAuthDialog('login'); return; }
  dailyGamesTournamentOnly = tournamentOnly === true;
  if(dailyGamesTitle) dailyGamesTitle.textContent = dailyGamesTournamentOnly ? 'Meine Turnierpartien' : 'Meine Daily-Partien';
  if(dailyGamesIntro) dailyGamesIntro.textContent = dailyGamesTournamentOnly
    ? 'Alle laufenden und beendeten Partien aus deinen Hammerschach-Turnieren. Goldene Markierung kennzeichnet die Turnierzuordnung; ein grüner Zughinweis bleibt weiterhin vorrangig sichtbar.'
    : 'Laufende Partien, offene Einladungen und dein Verlauf beendeter Daily-Partien. Turnierpartien bleiben hier vollständig enthalten und sind zusätzlich golden markiert.';
  if(dailyGamesBackdrop) dailyGamesBackdrop.hidden = false;
  loadDailyGames();
  startDailyGamesPresenceRefresh();
}
function closeDailyGamesDialog(){
  if(dailyGamesBackdrop) dailyGamesBackdrop.hidden = true;
  stopDailyGamesPresenceRefresh();
}
if(dailyGamesOpenBtn) dailyGamesOpenBtn.addEventListener('click', () => openDailyGamesDialog(false));
if(tournamentGamesOpenBtn) tournamentGamesOpenBtn.addEventListener('click', () => openDailyGamesDialog(true));
if(dailyGamesRefreshBtn) dailyGamesRefreshBtn.addEventListener('click', loadDailyGames);
if(dailyGamesCloseBtn) dailyGamesCloseBtn.addEventListener('click', closeDailyGamesDialog);
if(dailyGamesBackdrop) dailyGamesBackdrop.addEventListener('click', ev => { if(ev.target === dailyGamesBackdrop) closeDailyGamesDialog(); });
document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && dailyGamesBackdrop && !dailyGamesBackdrop.hidden) closeDailyGamesDialog(); });


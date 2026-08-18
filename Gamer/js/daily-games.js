'use strict';

let dailyInvitationAddressHandled = false;
let rematchInvitationAddressHandled = false;
function cleanListedRematchOfferId(value){
  const id = String(value || '').trim();
  return /^rm_[A-Za-z0-9_-]{8,80}$/.test(id) ? id : '';
}
function rematchInvitationFromAddress(){
  try{ return cleanListedRematchOfferId(new URL(window.location.href).searchParams.get('rematch')); }
  catch(_){ return ''; }
}
function removeRematchInvitationAddress(offerId){
  try{
    const url = new URL(window.location.href);
    const addressedOffer = cleanListedRematchOfferId(url.searchParams.get('rematch'));
    if(!addressedOffer || (offerId && addressedOffer !== cleanListedRematchOfferId(offerId))) return;
    url.searchParams.delete('rematch');
    history.replaceState(null, '', url.toString());
  } catch(_){ }
}
function maybeOpenRematchInvitationFromAddress(){
  const offerId = rematchInvitationFromAddress();
  if(!offerId || rematchInvitationAddressHandled) return false;
  if(!onlineAuthToken || !onlineAuthUser){
    openAuthDialog('login');
    return false;
  }
  rematchInvitationAddressHandled = true;
  openDailyGamesDialog(false);
  return true;
}
const dailyGamesCompletedFilters = document.getElementById('dailyGamesCompletedFilters');
const dailyGamesMomentsOnlyBtn = document.getElementById('dailyGamesMomentsOnlyBtn');
function dailyInvitationRoomFromAddress(){
  try{ return cleanRoomId(new URL(window.location.href).searchParams.get('dailyInvite')); }
  catch(_){ return ''; }
}
function removeDailyInvitationAddress(roomId){
  try{
    const url = new URL(window.location.href);
    const addressedRoom = cleanRoomId(url.searchParams.get('dailyInvite'));
    if(!addressedRoom || (roomId && addressedRoom !== cleanRoomId(roomId))) return;
    url.searchParams.delete('dailyInvite');
    history.replaceState(null, '', url.toString());
  } catch(_){ }
}
function maybeOpenDailyInvitationFromAddress(){
  const roomId = dailyInvitationRoomFromAddress();
  if(!roomId || dailyInvitationAddressHandled) return false;
  if(!onlineAuthToken || !onlineAuthUser){
    openAuthDialog('login');
    return false;
  }
  dailyInvitationAddressHandled = true;
  openDailyGamesDialog(false);
  return true;
}

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
    threefold_repetition:'Dreifache Stellungswiederholung',
    fivefold_repetition:'Fünffache Stellungswiederholung',
    seventy_five_move_rule:'75-Züge-Regel',
    time_insufficient_material:'Zeitüberschreitung · Matt unmöglich',
    resignation_insufficient_material:'Aufgabe · Matt unmöglich'
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
    url.searchParams.delete('dailyInvite');
    url.searchParams.delete('rematch');
    return url.toString();
  } catch(_){
    return '';
  }
}
function myGamesVariantLabel(game){
  if(game && game.variant === GAME_VARIANT_FREESTYLE){
    return Number.isFinite(Number(game.positionId)) ? ('Freestyle #' + Number(game.positionId)) : 'Freestyle';
  }
  return 'Klassisch';
}
function myGamesEndReasonLabel(reason){
  const labels = {
    time:'Zeitüberschreitung', timeout:'Zeitüberschreitung', resignation:'Aufgabe',
    draw_agreed:'Remis vereinbart', draw_agreement:'Remis vereinbart', checkmate:'Schachmatt',
    stalemate:'Patt', insufficient_material:'Unzureichendes Mattmaterial',
    fifty_move_rule:'50-Züge-Regel', threefold_repetition:'Dreifache Stellungswiederholung',
    fivefold_repetition:'Fünffache Stellungswiederholung', seventy_five_move_rule:'75-Züge-Regel',
    time_insufficient_material:'Zeitüberschreitung · Matt unmöglich', resignation_insufficient_material:'Aufgabe · Matt unmöglich'
  };
  return labels[String(reason || '')] || 'Partie beendet';
}
function createMyLiveRunningCard(game){
  const card = document.createElement('div');
  card.className = 'daily-game-card' + (game && game.isMyTurn ? ' my-turn' : '') + (game && game.isTournamentGame ? ' tournament-game' : '');
  const content = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'daily-game-title';
  const titleText = document.createElement('span');
  titleText.className = 'daily-game-title-text';
  titleText.textContent = 'gegen ' + (cleanDisplayName(game && game.opponentName) || 'Gegner');
  title.appendChild(titleText);
  const status = document.createElement('div');
  status.className = 'daily-game-status';
  status.textContent = game && game.isMyTurn ? 'Du bist am Zug' : 'Gegner ist am Zug';
  const meta = document.createElement('div');
  meta.className = 'daily-game-meta';
  const parts = ['Live-Partie', game && game.timeLabel || '', myGamesVariantLabel(game), game && game.rated === false ? 'Ungewertet' : 'Gewertet', game && game.publicGame ? 'Öffentlich' : 'Privat'];
  if(game && game.lastMoveSan) parts.push('letzter Zug: ' + game.lastMoveSan);
  meta.textContent = parts.filter(Boolean).join(' · ');
  content.appendChild(title);
  if(game && game.isTournamentGame){
    const tournamentBadge = document.createElement('div');
    tournamentBadge.className = 'daily-tournament-badge';
    tournamentBadge.textContent = '🏆 ' + (game.tournamentName || 'Turnier') + (game.tournamentRoundLabel ? ' · ' + game.tournamentRoundLabel : '');
    content.appendChild(tournamentBadge);
  }
  content.appendChild(status);
  content.appendChild(meta);
  const actions = document.createElement('div');
  actions.className = 'daily-game-actions';
  const openLink = document.createElement('a');
  openLink.className = 'daily-game-open-btn';
  openLink.href = dailyGameRoomUrl(game) || '#';
  openLink.textContent = 'Partie öffnen';
  openLink.title = 'Live-Partie im aktuellen Tab öffnen';
  actions.appendChild(openLink);
  card.appendChild(content);
  card.appendChild(actions);
  return card;
}
async function withdrawMyLiveOffer(offer, button){
  const roomId = cleanRoomId(offer && offer.roomId);
  if(!roomId) return;
  if(!window.confirm('Dieses Live-Partieangebot wirklich zurückziehen?')) return;
  const oldText = button ? button.textContent : '';
  if(button){ button.disabled = true; button.textContent = 'Wird zurückgezogen…'; }
  if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Live-Partieangebot wird zurückgezogen…';
  try{
    const data = await authApi('/api/open-offers/' + encodeURIComponent(roomId), {method:'DELETE'});
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = data.message || 'Live-Partieangebot wurde zurückgezogen.';
    await loadDailyGames({silent:true});
  }catch(err){
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = err && err.message ? err.message : 'Das Live-Partieangebot konnte nicht zurückgezogen werden.';
    if(button){ button.disabled = false; button.textContent = oldText || 'Angebot zurückziehen'; }
  }
}
function createMyLiveOpenOfferCard(offer){
  const card = document.createElement('div');
  card.className = 'daily-game-card';
  const content = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'daily-game-title';
  title.textContent = 'Offenes Live-Angebot';
  const status = document.createElement('div');
  status.className = 'daily-game-status';
  status.textContent = 'Wartet auf Mitspieler';
  const meta = document.createElement('div');
  meta.className = 'daily-game-meta';
  const ownRole = offer && offer.creatorRole === 'b' ? 'Schwarz' : 'Weiß';
  meta.textContent = ['Live-Partie', offer && offer.timeLabel || '', myGamesVariantLabel(offer), offer && offer.rated === false ? 'Ungewertet' : 'Gewertet', 'Du spielst ' + ownRole].filter(Boolean).join(' · ');
  content.appendChild(title);
  content.appendChild(status);
  content.appendChild(meta);
  const actions = document.createElement('div');
  actions.className = 'daily-game-actions';
  const withdrawBtn = document.createElement('button');
  withdrawBtn.type = 'button';
  withdrawBtn.className = 'daily-game-delete-btn';
  withdrawBtn.textContent = 'Angebot zurückziehen';
  withdrawBtn.addEventListener('click', () => withdrawMyLiveOffer(offer, withdrawBtn));
  actions.appendChild(withdrawBtn);
  card.appendChild(content);
  card.appendChild(actions);
  return card;
}
async function respondToListedRematch(offer, action, card){
  const offerId = cleanListedRematchOfferId(offer && offer.offerId);
  if(!offerId || !['accept','decline','withdraw'].includes(action)) return;
  if(action === 'withdraw' && !window.confirm('Diese Revanche-Anfrage wirklich zurückziehen?')) return;
  const controls = card ? Array.from(card.querySelectorAll('button,a')) : [];
  if(card) card.classList.add('rematch-loading');
  controls.forEach(control => {
    control.dataset.rematchWasDisabled = control.disabled ? 'yes' : 'no';
    if('disabled' in control) control.disabled = true;
    control.setAttribute('aria-disabled', 'true');
  });
  if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = action === 'accept'
    ? 'Revanche wird angenommen und das neue Brett vorbereitet…'
    : action === 'decline' ? 'Revanche wird abgelehnt…' : 'Revanche-Anfrage wird zurückgezogen…';
  try{
    const data = await authApi('/api/rematches/' + encodeURIComponent(offerId), {method:'POST', body:JSON.stringify({action})});
    removeRematchInvitationAddress(offerId);
    if(action === 'accept'){
      const targetUrl = dailyGameRoomUrl({roomId:data.roomId});
      if(!targetUrl) throw new Error('Der neue Revanche-Spielraum konnte nicht geöffnet werden.');
      if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Revanche angenommen. Das neue Brett wird geöffnet…';
      closeDailyGamesDialog();
      window.location.assign(targetUrl);
      return;
    }
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = action === 'decline' ? 'Revanche wurde abgelehnt.' : 'Revanche-Anfrage wurde zurückgezogen.';
    await loadDailyGames({silent:true});
  }catch(err){
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = err && err.message ? err.message : 'Die Revanche konnte nicht verarbeitet werden.';
    if(card) card.classList.remove('rematch-loading');
    controls.forEach(control => {
      if('disabled' in control) control.disabled = control.dataset.rematchWasDisabled === 'yes';
      control.removeAttribute('aria-disabled');
      delete control.dataset.rematchWasDisabled;
    });
  }
}
function createListedRematchCard(offer){
  const incoming = offer && offer.direction === 'incoming';
  const card = document.createElement('div');
  card.className = 'daily-game-card rematch-invitation' + (cleanListedRematchOfferId(offer && offer.offerId) === rematchInvitationFromAddress() ? ' addressed' : '');
  card.dataset.rematchOfferId = cleanListedRematchOfferId(offer && offer.offerId);
  const content = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'daily-game-title';
  title.textContent = incoming
    ? '🔁 Revanche von ' + (cleanDisplayName(offer && offer.opponentName) || 'deinem Gegner')
    : '🔁 Revanche an ' + (cleanDisplayName(offer && offer.opponentName) || 'deinen Gegner');
  const status = document.createElement('div');
  status.className = 'daily-game-status';
  status.textContent = offer && offer.status === 'creating'
    ? 'Das neue Brett wird vorbereitet'
    : incoming ? 'Bitte annehmen oder ablehnen' : 'Wartet auf Antwort';
  const meta = document.createElement('div');
  meta.className = 'daily-game-meta';
  meta.textContent = [offer && offer.mode === 'daily' ? 'Daily-Revanche' : 'Live-Revanche', offer && offer.timeLabel || '', myGamesVariantLabel(offer), offer && offer.rated === false ? 'Ungewertet' : 'Gewertet', 'Farben werden vertauscht'].filter(Boolean).join(' · ');
  content.append(title, status, meta);
  const actions = document.createElement('div');
  actions.className = 'daily-game-actions';
  if(incoming && (!offer.status || offer.status === 'pending')){
    const accept = document.createElement('button');
    accept.type = 'button'; accept.className = 'daily-game-accept-btn'; accept.textContent = 'Revanche annehmen';
    accept.addEventListener('click', () => respondToListedRematch(offer, 'accept', card));
    const decline = document.createElement('button');
    decline.type = 'button'; decline.className = 'daily-game-decline-btn'; decline.textContent = 'Ablehnen';
    decline.addEventListener('click', () => respondToListedRematch(offer, 'decline', card));
    actions.append(accept, decline);
  } else if(!incoming && (!offer.status || offer.status === 'pending')){
    const withdraw = document.createElement('button');
    withdraw.type = 'button'; withdraw.className = 'daily-game-delete-btn'; withdraw.textContent = 'Revanche zurückziehen';
    withdraw.addEventListener('click', () => respondToListedRematch(offer, 'withdraw', card));
    actions.appendChild(withdraw);
  }
  const source = document.createElement('a');
  source.className = 'daily-game-open-btn';
  source.href = dailyGameRoomUrl({roomId:offer && offer.sourceRoomId}) || '#';
  source.textContent = 'Ausgangspartie ansehen';
  actions.appendChild(source);
  card.append(content, actions);
  return card;
}
function createMyLiveCompletedCard(game){
  const role = game && game.participantRole === 'b' ? 'b' : 'w';
  const opponentName = role === 'w' ? game && game.blackName : game && game.whiteName;
  const outcome = dailyOutcomeForUser({result:game && game.result, role});
  const card = document.createElement('div');
  card.className = 'daily-game-card completed' + (game && game.tournamentId ? ' tournament-game' : '');
  const content = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'daily-game-title';
  title.textContent = 'gegen ' + (cleanDisplayName(opponentName) || 'Gegner');
  const status = document.createElement('div');
  status.className = 'daily-game-status';
  status.textContent = outcome.label + ' · ' + dailyResultLabel(game && game.result);
  if(outcome.className) status.classList.add(outcome.className);
  const meta = document.createElement('div');
  meta.className = 'daily-game-meta';
  const endedAt = game && game.endedAt ? ('beendet: ' + formatDailyGameDeadline(game.endedAt)) : '';
  meta.textContent = ['Live-Partie', game && game.timeLabel || '', myGamesVariantLabel(game), game && game.rated === false ? 'Ungewertet' : 'Gewertet', myGamesEndReasonLabel(game && game.endReason), endedAt].filter(Boolean).join(' · ');
  content.appendChild(title);
  if(game && game.tournamentId){
    const tournamentBadge = document.createElement('div');
    tournamentBadge.className = 'daily-tournament-badge';
    tournamentBadge.textContent = '🏆 ' + (game.tournamentName || 'Turnier') + (game.tournamentRoundLabel ? ' · ' + game.tournamentRoundLabel : '');
    content.appendChild(tournamentBadge);
  }
  content.appendChild(status);
  content.appendChild(meta);
  const startSummary = createGameStartSummaryPanel(game);
  if(startSummary) content.appendChild(startSummary);
  const momentPanel = createGameMomentPanel(game, {
    statusElement:dailyGamesStatusEl,
    onChange:() => renderDailyGames(dailyGamesCache)
  });
  if(momentPanel) content.appendChild(momentPanel);
  const reactionPanel = createGameReactionPanel(game, {
    opponentName,
    statusElement:dailyGamesStatusEl,
    onChange:() => renderDailyGames(dailyGamesCache)
  });
  if(reactionPanel) content.appendChild(reactionPanel);
  const actions = document.createElement('div');
  actions.className = 'daily-game-actions';
  const openLink = document.createElement('a');
  openLink.className = 'daily-game-open-btn';
  openLink.href = dailyGameRoomUrl(game) || '#';
  openLink.textContent = 'Partie ansehen';
  openLink.title = 'Beendete Live-Partie im aktuellen Tab öffnen';
  actions.appendChild(openLink);
  const analyzerBtn = document.createElement('button');
  analyzerBtn.type = 'button';
  analyzerBtn.className = 'daily-game-pgn-btn';
  analyzerBtn.textContent = 'Analyzer';
  analyzerBtn.addEventListener('click', () => {
    if(typeof openArchiveInAnalyzer === 'function') openArchiveInAnalyzer(game, analyzerBtn);
  });
  actions.appendChild(analyzerBtn);
  const pgnBtn = document.createElement('button');
  pgnBtn.type = 'button';
  pgnBtn.className = 'daily-game-pgn-btn';
  pgnBtn.textContent = 'PGN';
  pgnBtn.addEventListener('click', () => {
    if(typeof downloadArchivePgn === 'function') downloadArchivePgn(game, pgnBtn);
  });
  actions.appendChild(pgnBtn);
  card.appendChild(content);
  card.appendChild(actions);
  return card;
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
let pendingDailyInvitationResponse = null;
let dailyInvitationResponseBusy = false;
function updateDailyInvitationResponseCount(){
  if(!dailyInvitationResponseCount) return;
  const length = dailyInvitationResponseInput ? dailyInvitationResponseInput.value.length : 0;
  dailyInvitationResponseCount.textContent = Math.min(length, INVITATION_PERSONAL_MESSAGE_MAX_LENGTH) + '/' + INVITATION_PERSONAL_MESSAGE_MAX_LENGTH;
}
function closeDailyInvitationResponseDialog(force){
  if(dailyInvitationResponseBusy && !force) return;
  if(dailyInvitationResponseBackdrop) dailyInvitationResponseBackdrop.hidden = true;
  pendingDailyInvitationResponse = null;
  if(dailyInvitationResponseStatus) dailyInvitationResponseStatus.textContent = '';
}
function respondDailyInvitation(game, action, button){
  const roomId = cleanRoomId(game && game.roomId);
  const accepted = action === 'accept';
  if(!roomId || (action !== 'accept' && action !== 'decline')){
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Die Einladung ist ungültig.';
    return;
  }
  pendingDailyInvitationResponse = {game, action, button};
  const senderName = cleanDisplayName(game && game.opponentName) || 'das einladende Mitglied';
  if(dailyInvitationResponseTitle) dailyInvitationResponseTitle.textContent = accepted ? 'Einladung annehmen' : 'Einladung ablehnen';
  if(dailyInvitationResponseIntro) dailyInvitationResponseIntro.textContent = accepted
    ? 'Du nimmst die Einladung von ' + senderName + ' an. Möchtest du noch etwas Persönliches schreiben?'
    : 'Du lehnst die Einladung von ' + senderName + ' ab. Möchtest du deine Entscheidung kurz persönlich erklären?';
  if(dailyInvitationResponseInput){
    dailyInvitationResponseInput.value = '';
    dailyInvitationResponseInput.placeholder = accepted
      ? 'z. B. Sehr gerne – ich freue mich auf die Partie! 😊'
      : 'z. B. Diese Woche schaffe ich es leider nicht. Frag mich gern später noch einmal.';
  }
  if(dailyInvitationResponseConfirmBtn) dailyInvitationResponseConfirmBtn.textContent = accepted ? 'Einladung annehmen' : 'Ablehnung bestätigen';
  if(dailyInvitationResponseStatus) dailyInvitationResponseStatus.textContent = '';
  updateDailyInvitationResponseCount();
  if(dailyInvitationResponseBackdrop) dailyInvitationResponseBackdrop.hidden = false;
  setTimeout(() => { try{ if(dailyInvitationResponseInput) dailyInvitationResponseInput.focus(); } catch(_){} }, 0);
}
async function submitDailyInvitationResponse(){
  if(dailyInvitationResponseBusy || !pendingDailyInvitationResponse) return;
  const {game, action, button} = pendingDailyInvitationResponse;
  const roomId = cleanRoomId(game && game.roomId);
  const accepted = action === 'accept';
  const responseMessage = normalizedInvitationPersonalMessage(dailyInvitationResponseInput && dailyInvitationResponseInput.value);
  if(responseMessage.length > INVITATION_PERSONAL_MESSAGE_MAX_LENGTH){
    if(dailyInvitationResponseStatus) dailyInvitationResponseStatus.textContent = 'Die Antwort darf höchstens 300 Zeichen lang sein.';
    return;
  }
  const card = button && button.closest ? button.closest('.daily-game-card') : null;
  const cardStatus = card ? card.querySelector('.daily-game-status') : null;
  const buttons = card ? Array.from(card.querySelectorAll('button,a')) : [];
  dailyInvitationResponseBusy = true;
  buttons.forEach(control => { control.dataset.invitationWasDisabled = control.disabled ? 'yes' : 'no'; control.disabled = true; });
  const oldText = button ? button.textContent : '';
  if(dailyInvitationResponseConfirmBtn){ dailyInvitationResponseConfirmBtn.disabled = true; dailyInvitationResponseConfirmBtn.textContent = accepted ? 'Wird angenommen…' : 'Wird abgelehnt…'; }
  if(dailyInvitationResponseCancelBtn) dailyInvitationResponseCancelBtn.disabled = true;
  if(button) button.textContent = accepted ? 'Wird angenommen…' : 'Wird abgelehnt…';
  if(cardStatus) cardStatus.textContent = accepted ? 'Einladung wird angenommen…' : 'Einladung wird abgelehnt…';
  if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = accepted ? 'Einladung wird angenommen…' : 'Einladung wird abgelehnt…';
  if(dailyInvitationResponseStatus) dailyInvitationResponseStatus.textContent = accepted ? 'Einladung wird angenommen…' : 'Einladung wird abgelehnt…';
  try{
    const data = await authApi('/api/daily-games/' + encodeURIComponent(roomId) + '/invitation', {
      method:'POST',
      body:JSON.stringify({action, responseMessage})
    });
    if(accepted){
      if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = data.message || 'Einladung angenommen. Die Daily-Partie wird geöffnet…';
      const targetUrl = dailyGameRoomUrl({roomId:data.roomId || roomId});
      if(!targetUrl) throw new Error('Der neue Spielraum konnte nicht geöffnet werden.');
      closeDailyInvitationResponseDialog(true);
      window.location.assign(targetUrl);
      return;
    }
    removeDailyInvitationAddress(roomId);
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = data.message || 'Einladung wurde abgelehnt.';
    closeDailyInvitationResponseDialog(true);
    await loadDailyGames();
  } catch(err){
    const message = err && err.message ? err.message : 'Die Einladung konnte nicht beantwortet werden.';
    if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = message;
    if(dailyInvitationResponseStatus) dailyInvitationResponseStatus.textContent = message;
    if(cardStatus) cardStatus.textContent = message;
    buttons.forEach(control => { control.disabled = control.dataset.invitationWasDisabled === 'yes'; delete control.dataset.invitationWasDisabled; });
    if(button) button.textContent = oldText || (accepted ? 'Annehmen' : 'Ablehnen');
  } finally {
    dailyInvitationResponseBusy = false;
    if(dailyInvitationResponseConfirmBtn){ dailyInvitationResponseConfirmBtn.disabled = false; dailyInvitationResponseConfirmBtn.textContent = accepted ? 'Einladung annehmen' : 'Ablehnung bestätigen'; }
    if(dailyInvitationResponseCancelBtn) dailyInvitationResponseCancelBtn.disabled = false;
  }
}
function createDailyInvitationMessageBox(label, message, response){
  const normalized = normalizedInvitationPersonalMessage(message);
  if(!normalized) return null;
  const box = document.createElement('div');
  box.className = 'daily-invitation-message' + (response ? ' response' : '');
  const heading = document.createElement('div');
  heading.className = 'daily-invitation-message-label';
  heading.textContent = label;
  const text = document.createElement('div');
  text.className = 'daily-invitation-message-text';
  text.textContent = normalized;
  box.appendChild(heading);
  box.appendChild(text);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'daily-invitation-message-toggle';
  toggle.textContent = 'Mehr anzeigen';
  toggle.hidden = !(normalized.length > 180 || normalized.split('\n').length > 4);
  toggle.addEventListener('click', () => {
    const expanded = text.classList.toggle('expanded');
    toggle.textContent = expanded ? 'Weniger anzeigen' : 'Mehr anzeigen';
  });
  box.appendChild(toggle);
  requestAnimationFrame(() => {
    if(!text.classList.contains('expanded') && text.clientHeight > 0){
      toggle.hidden = text.scrollHeight <= text.clientHeight + 1;
    }
  });
  return box;
}
function createDailyGameCard(game){
  const card = document.createElement('div');
  const isActiveMyTurn = !!(game.isMyTurn && !game.ended);
  const addressedInvitation = !!(game.incomingInvitation && cleanRoomId(game.roomId) === dailyInvitationRoomFromAddress());
  card.className = 'daily-game-card' + (isActiveMyTurn ? ' my-turn' : '') + (game.ended ? ' completed' : '') + (game.isTournamentGame ? ' tournament-game' : '') + (game.incomingInvitation ? ' incoming-invitation' : '') + (addressedInvitation ? ' addressed-invitation' : '') + (game.incomingDrawOffer ? ' draw-offer-incoming' : '') + (game.outgoingDrawOffer ? ' draw-offer-outgoing' : '') + (game.drawClaimAvailable ? ' draw-claim-available' : '');
  if(game.incomingInvitation) card.dataset.invitationRoomId = cleanRoomId(game.roomId);
  if(isActiveMyTurn) card.setAttribute('aria-label', 'Du bist am Zug');
  const content = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'daily-game-title';
  const titleText = document.createElement('span');
  titleText.className = 'daily-game-title-text';
  const pendingOpponentName = cleanDisplayName(game.invitedOpponentName || game.opponentName || '');
  titleText.textContent = game.incomingInvitation
    ? 'Einladung von ' + (cleanDisplayName(game.opponentName) || 'einem Mitglied')
    : game.pendingInvitation
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
  } else if(game.incomingInvitation) status.textContent = 'Bitte annehmen oder ablehnen';
  else if(game.incomingDrawOffer) status.textContent = '🤝 ' + (cleanDisplayName(game.opponentName) || 'Gegner') + ' bietet Remis an';
  else if(game.outgoingDrawOffer) status.textContent = '½ Remis angeboten · wartet auf Antwort';
  else if(game.drawClaimAvailable){
    const claimReasons = [];
    if(game.drawClaimThreefold) claimReasons.push('3× Stellungswiederholung');
    if(game.drawClaimFiftyMove) claimReasons.push('50-Züge-Regel');
    status.textContent = '½ Remis reklamierbar' + (claimReasons.length ? ' · ' + claimReasons.join(' / ') : '');
  }
  else if(game.invitationDeclined) status.textContent = pendingOpponentName && pendingOpponentName !== 'noch offen'
    ? pendingOpponentName + ' hat die Einladung abgelehnt'
    : 'Die Einladung wurde abgelehnt';
  else if(game.pendingInvitation && game.invitationStatus === 'accepted') status.textContent = pendingOpponentName && pendingOpponentName !== 'noch offen'
    ? pendingOpponentName + ' hat die Einladung angenommen · Spielerplatz wird vorbereitet'
    : 'Einladung angenommen · Spielerplatz wird vorbereitet';
  else if(game.pendingInvitation) status.textContent = pendingOpponentName && pendingOpponentName !== 'noch offen'
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
  if(game.ended){const startSummary=createGameStartSummaryPanel(game);if(startSummary)content.appendChild(startSummary);}
  if((game.incomingInvitation || game.pendingInvitation || game.invitationDeclined) && game.invitationMessage){
    const invitationLabel = game.incomingInvitation
      ? 'Persönliche Nachricht von ' + (cleanDisplayName(game.opponentName) || 'dem Einladenden')
      : 'Deine persönliche Einladungsnachricht';
    const invitationBox = createDailyInvitationMessageBox(invitationLabel, game.invitationMessage, false);
    if(invitationBox) content.appendChild(invitationBox);
  }
  if(game.isInvitationCreator && game.invitationResponseMessage){
    const responseLabel = 'Antwort von ' + (cleanDisplayName(game.invitedOpponentName || game.opponentName) || 'dem eingeladenen Mitglied');
    const responseBox = createDailyInvitationMessageBox(responseLabel, game.invitationResponseMessage, true);
    if(responseBox) content.appendChild(responseBox);
  }
  if(game.ended){
    const momentPanel = createGameMomentPanel(game, {
      statusElement:dailyGamesStatusEl,
      onChange:() => renderDailyGames(dailyGamesCache)
    });
    if(momentPanel) content.appendChild(momentPanel);
    const reactionPanel = createGameReactionPanel(game, {
      opponentName:game.opponentName,
      statusElement:dailyGamesStatusEl,
      onChange:() => renderDailyGames(dailyGamesCache)
    });
    if(reactionPanel) content.appendChild(reactionPanel);
  }

  const actions = document.createElement('div');
  actions.className = 'daily-game-actions';
  const roomUrl = dailyGameRoomUrl(game);
  if(game.incomingInvitation){
    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'daily-invitation-accept-btn';
    acceptBtn.textContent = '✓ Annehmen';
    acceptBtn.addEventListener('click', () => respondDailyInvitation(game, 'accept', acceptBtn));
    const declineBtn = document.createElement('button');
    declineBtn.type = 'button';
    declineBtn.className = 'daily-invitation-decline-btn';
    declineBtn.textContent = 'Ablehnen';
    declineBtn.addEventListener('click', () => respondDailyInvitation(game, 'decline', declineBtn));
    actions.appendChild(acceptBtn);
    actions.appendChild(declineBtn);
  } else {
    const openLink = document.createElement('a');
    openLink.className = 'daily-game-open-btn';
    openLink.href = roomUrl || '#';
    openLink.textContent = game.ended ? 'Partie ansehen' : (game.pendingInvitation ? 'Einladung öffnen' : (game.incomingDrawOffer ? 'Remisangebot öffnen' : (game.drawClaimAvailable ? 'Remis reklamieren' : 'Partie öffnen')));
    openLink.title = 'Partie im aktuellen Tab öffnen';
    if(!roomUrl){
      openLink.addEventListener('click', event => {
        event.preventDefault();
        if(statusEl) statusEl.textContent = 'Partielink konnte nicht geöffnet werden.';
      });
    }
    actions.appendChild(openLink);
  }

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
function appendDailyGamesSection(titleText, games, emptyText, renderer){
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
    const renderCard = typeof renderer === 'function' ? renderer : createDailyGameCard;
    games.forEach(game => section.appendChild(renderCard(game)));
  }
  dailyGamesListEl.appendChild(section);
}
let dailyGamesTournamentOnly = false;
let dailyGamesCache = [];
let myLiveRunningGamesCache = [];
let myLiveOpenOffersCache = [];
let myRematchOffersCache = [];
let myLiveCompletedGamesCache = [];
let myLiveCompletedTotal = 0;
let dailyGamesActiveTab = 'running';
let dailyGamesMomentsOnly = false;
function dailyGamesGroups(games){
  const sourceGames = Array.isArray(games) ? games : [];
  const allDailyGames = dailyGamesTournamentOnly ? sourceGames.filter(game => game.isTournamentGame) : sourceGames;
  const runningDaily = allDailyGames.filter(game => !game.ended && !!game.started);
  const openDaily = allDailyGames.filter(game => !game.ended && !game.started);
  const completedDaily = allDailyGames.filter(game => !!game.ended);
  const runningLive = dailyGamesTournamentOnly ? myLiveRunningGamesCache.filter(game => game.isTournamentGame) : myLiveRunningGamesCache;
  const openLive = dailyGamesTournamentOnly ? [] : myLiveOpenOffersCache;
  const rematches = dailyGamesTournamentOnly ? [] : myRematchOffersCache;
  const completedLive = dailyGamesTournamentOnly ? myLiveCompletedGamesCache.filter(game => !!game.tournamentId) : myLiveCompletedGamesCache;
  return {allDailyGames, runningDaily, openDaily, completedDaily, runningLive, openLive, rematches, completedLive};
}
function updateDailyGamesTabCounts(groups){
  if(dailyGamesRunningCount) dailyGamesRunningCount.textContent = String(groups.runningDaily.length + groups.runningLive.length);
  if(dailyGamesOpenCount) dailyGamesOpenCount.textContent = String(groups.openDaily.length + groups.openLive.length + groups.rematches.length);
  if(dailyGamesCompletedCount) dailyGamesCompletedCount.textContent = String(groups.completedDaily.length + groups.completedLive.length);
}
function setDailyGamesActiveTab(tab, options){
  const validTabs = ['running','open','completed'];
  dailyGamesActiveTab = validTabs.includes(tab) ? tab : 'running';
  dailyGamesTabButtons.forEach(button => {
    const active = button.dataset.dailyGamesTab === dailyGamesActiveTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
    if(active && dailyGamesListEl) dailyGamesListEl.setAttribute('aria-labelledby', button.id || 'dailyGamesRunningTab');
  });
  if(dailyGamesCompletedFilters) dailyGamesCompletedFilters.hidden = dailyGamesActiveTab !== 'completed';
  if(!options || options.render !== false) renderDailyGames(dailyGamesCache);
}
function appendDailyGameCards(games, emptyText, renderer){
  if(games.length === 0){
    const empty = document.createElement('div');
    empty.className = 'daily-games-empty';
    empty.textContent = emptyText;
    dailyGamesListEl.appendChild(empty);
    return;
  }
  const renderCard = typeof renderer === 'function' ? renderer : createDailyGameCard;
  games.forEach(game => dailyGamesListEl.appendChild(renderCard(game)));
}
function sortMyGamesByDateAndTurn(items){
  return items.sort((a,b) => {
    if(!!a.attention !== !!b.attention) return a.attention ? -1 : 1;
    if(!!a.myTurn !== !!b.myTurn) return a.myTurn ? -1 : 1;
    const aTime = Date.parse(a.date || 0) || 0;
    const bTime = Date.parse(b.date || 0) || 0;
    return bTime - aTime;
  });
}
function appendMixedGameCards(items, emptyText){
  if(!items.length){
    const empty = document.createElement('div');
    empty.className = 'daily-games-empty';
    empty.textContent = emptyText;
    dailyGamesListEl.appendChild(empty);
    return;
  }
  items.forEach(item => {
    if(item.kind === 'live-running') dailyGamesListEl.appendChild(createMyLiveRunningCard(item.game));
    else if(item.kind === 'live-offer') dailyGamesListEl.appendChild(createMyLiveOpenOfferCard(item.game));
    else if(item.kind === 'live-completed') dailyGamesListEl.appendChild(createMyLiveCompletedCard(item.game));
    else dailyGamesListEl.appendChild(createDailyGameCard(item.game));
  });
}
function renderDailyGames(games){
  if(!dailyGamesListEl) return;
  dailyGamesListEl.innerHTML = '';
  const groups = dailyGamesGroups(games);
  updateDailyGamesTabCounts(groups);
  if(dailyGamesActiveTab === 'open'){
    const rematchSection = document.createElement('section');
    rematchSection.className = 'daily-games-section';
    const rematchHeading = document.createElement('div');
    rematchHeading.className = 'daily-games-section-title';
    const rematchTitle = document.createElement('span');
    rematchTitle.textContent = 'Revanchen';
    const rematchCount = document.createElement('span');
    rematchCount.className = 'daily-games-section-count';
    rematchCount.textContent = String(groups.rematches.length);
    rematchHeading.append(rematchTitle, rematchCount);
    rematchSection.appendChild(rematchHeading);
    if(!groups.rematches.length){
      const empty = document.createElement('div'); empty.className = 'daily-games-empty'; empty.textContent = 'Du hast derzeit keine offene Revanche.'; rematchSection.appendChild(empty);
    } else groups.rematches.forEach(offer => rematchSection.appendChild(createListedRematchCard(offer)));
    dailyGamesListEl.appendChild(rematchSection);
    const incomingGames = groups.openDaily.filter(game => !!game.incomingInvitation);
    const ownDailyOpenGames = groups.openDaily.filter(game => !game.incomingInvitation);
    appendDailyGamesSection('Einladungen', incomingGames, 'Du hast derzeit keine offene Einladung.');
    const ownOffers = [
      ...ownDailyOpenGames.map(game => ({kind:'daily', game})),
      ...groups.openLive.map(game => ({kind:'live-offer', game}))
    ];
    const offerSection = document.createElement('section');
    offerSection.className = 'daily-games-section';
    const heading = document.createElement('div');
    heading.className = 'daily-games-section-title';
    const title = document.createElement('span');
    title.textContent = 'Eigene Angebote';
    const count = document.createElement('span');
    count.className = 'daily-games-section-count';
    count.textContent = String(ownOffers.length);
    heading.appendChild(title); heading.appendChild(count); offerSection.appendChild(heading);
    if(!ownOffers.length){
      const empty = document.createElement('div'); empty.className = 'daily-games-empty'; empty.textContent = 'Du hast derzeit kein eigenes offenes Angebot.'; offerSection.appendChild(empty);
    } else {
      ownOffers.forEach(item => offerSection.appendChild(item.kind === 'live-offer' ? createMyLiveOpenOfferCard(item.game) : createDailyGameCard(item.game)));
    }
    dailyGamesListEl.appendChild(offerSection);
    return;
  }
  if(dailyGamesActiveTab === 'completed'){
    const items = sortMyGamesByDateAndTurn([
      ...groups.completedDaily.map(game => ({kind:'daily', game, date:game.endedAt || game.updatedAt || ''})),
      ...groups.completedLive.map(game => ({kind:'live-completed', game, date:game.endedAt || ''}))
    ]).filter(item => !dailyGamesMomentsOnly || item.game.favorite === true);
    const emptyText = dailyGamesMomentsOnly
      ? 'Noch keine Gamer-Momente in dieser Auswahl.'
      : (dailyGamesTournamentOnly ? 'Noch keine beendete Turnierpartie im Verlauf.' : 'Noch keine beendete Partie im Verlauf.');
    appendMixedGameCards(items, emptyText);
    if(!dailyGamesTournamentOnly && myLiveCompletedTotal > myLiveCompletedGamesCache.length){
      const note = document.createElement('div');
      note.className = 'daily-games-empty';
      note.textContent = 'Weitere ältere Live-Partien findest du im Partienarchiv.';
      dailyGamesListEl.appendChild(note);
    }
    return;
  }
  const runningItems = sortMyGamesByDateAndTurn([
    ...groups.runningDaily.map(game => ({kind:'daily', game, attention:!!(game.incomingDrawOffer || game.drawClaimAvailable), myTurn:!!game.isMyTurn, date:game.updatedAt || game.startedAt || ''})),
    ...groups.runningLive.map(game => ({kind:'live-running', game, myTurn:!!game.isMyTurn, date:game.updatedAt || game.startedAt || ''}))
  ]);
  appendMixedGameCards(runningItems, dailyGamesTournamentOnly ? 'Du hast derzeit keine laufende Turnierpartie.' : 'Du hast derzeit keine laufende Partie.');
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
  if(!silent && dailyGamesStatusEl) dailyGamesStatusEl.textContent = 'Partien werden geladen…';
  if(!silent && dailyGamesRefreshBtn) dailyGamesRefreshBtn.disabled = true;
  try{
    const requests = [authApi('/api/daily-games'), authApi('/api/my-live-games'), authApi('/api/game-archive?scope=mine&mode=live&page=1&limit=50'), authApi('/api/rematches')];
    if(!dailyGamesTournamentOnly) requests.push(authApi('/api/open-offers'));
    const results = await Promise.allSettled(requests);
    const dailyResult = results[0];
    const liveResult = results[1];
    const archiveResult = results[2];
    const rematchResult = results[3];
    const offersResult = dailyGamesTournamentOnly ? null : results[4];
    if(dailyResult.status !== 'fulfilled' && liveResult.status !== 'fulfilled' && archiveResult.status !== 'fulfilled' && rematchResult.status !== 'fulfilled'){
      throw (dailyResult.reason || liveResult.reason || archiveResult.reason || new Error('Partien konnten nicht geladen werden.'));
    }
    const games = dailyResult.status === 'fulfilled' && Array.isArray(dailyResult.value.games) ? dailyResult.value.games : [];
    dailyGamesCache = games;
    myLiveRunningGamesCache = liveResult.status === 'fulfilled' && Array.isArray(liveResult.value.games) ? liveResult.value.games : [];
    const liveArchiveData = archiveResult.status === 'fulfilled' ? archiveResult.value : {};
    myLiveCompletedGamesCache = Array.isArray(liveArchiveData.games) ? liveArchiveData.games : [];
    myLiveCompletedTotal = Math.max(myLiveCompletedGamesCache.length, Number(liveArchiveData.total || 0));
    myRematchOffersCache = rematchResult.status === 'fulfilled' && Array.isArray(rematchResult.value.offers) ? rematchResult.value.offers : [];
    const offers = offersResult && offersResult.status === 'fulfilled' && Array.isArray(offersResult.value.offers) ? offersResult.value.offers : [];
    myLiveOpenOffersCache = offers.filter(offer => offer && offer.mine === true && offer.mode !== 'daily');

    const dailyMyTurnCount = games.filter(game => !game.ended && !!game.started && !!game.isMyTurn).length;
    const liveMyTurnCount = myLiveRunningGamesCache.filter(game => !!game.isMyTurn).length;
    const myTurnCount = dailyMyTurnCount + liveMyTurnCount;
    if(dailyGamesTurnCount){
      dailyGamesTurnCount.hidden = myTurnCount < 1;
      dailyGamesTurnCount.textContent = String(myTurnCount);
      dailyGamesTurnCount.setAttribute('aria-label', myTurnCount === 1 ? '1 Partie: Du bist am Zug' : myTurnCount + ' Partien: Du bist am Zug');
    }
    const runningTournamentCount = games.filter(game => game.isTournamentGame && !game.ended).length + myLiveRunningGamesCache.filter(game => game.isTournamentGame).length;
    if(tournamentGamesCount){
      tournamentGamesCount.hidden = runningTournamentCount < 1;
      tournamentGamesCount.textContent = String(runningTournamentCount);
    }
    renderDailyGames(games);
    const groups = dailyGamesGroups(games);
    const runningCount = groups.runningDaily.length + groups.runningLive.length;
    const openCount = groups.openDaily.length + groups.openLive.length + groups.rematches.length;
    const completedCount = groups.completedDaily.length + groups.completedLive.length;
    const addressedRoom = dailyInvitationRoomFromAddress();
    const addressedInvitationFound = !!(addressedRoom && games.some(game => game.incomingInvitation && cleanRoomId(game.roomId) === addressedRoom));
    const addressedRematch = rematchInvitationFromAddress();
    const addressedRematchFound = !!(addressedRematch && myRematchOffersCache.some(offer => cleanListedRematchOfferId(offer.offerId) === addressedRematch));
    const partial = [dailyResult, liveResult, archiveResult, rematchResult, offersResult].filter(result => result && result.status === 'rejected').length > 0;
    if(!silent && dailyGamesStatusEl){
      dailyGamesStatusEl.textContent = addressedRematch && !addressedRematchFound
        ? 'Für diesen Account liegt unter dem Mail-Link keine offene Revanche mehr vor.'
        : addressedRoom && !addressedInvitationFound
        ? 'Für diesen Account liegt unter dem Mail-Link keine offene Einladung mehr vor.'
        : runningCount + ' laufend · ' + openCount + ' offen · ' + completedCount + ' beendet.' + (partial ? ' Einige Live-Daten konnten momentan nicht geladen werden.' : '');
    }
    if(addressedRematchFound){
      const addressedCard = dailyGamesListEl && dailyGamesListEl.querySelector('[data-rematch-offer-id="' + addressedRematch + '"]');
      if(addressedCard) setTimeout(() => { try{ addressedCard.scrollIntoView({block:'center', behavior:'smooth'}); } catch(_){} }, 80);
    }
  } catch(err){
    if(dailyGamesTurnCount){ dailyGamesTurnCount.hidden = true; dailyGamesTurnCount.textContent = '0'; }
    if(!silent){
      dailyGamesCache = [];
      myLiveRunningGamesCache = [];
      myLiveOpenOffersCache = [];
      myRematchOffersCache = [];
      myLiveCompletedGamesCache = [];
      myLiveCompletedTotal = 0;
      renderDailyGames([]);
      if(dailyGamesStatusEl) dailyGamesStatusEl.textContent = err && err.message ? err.message : 'Partien konnten nicht geladen werden.';
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
  const invitationFromAddress = !!dailyInvitationRoomFromAddress() || !!rematchInvitationFromAddress();
  setDailyGamesActiveTab(invitationFromAddress ? 'open' : 'running', {render:false});
  if(dailyGamesTitle) dailyGamesTitle.textContent = dailyGamesTournamentOnly ? 'Meine Turnierpartien' : 'Meine Partien';
  if(dailyGamesChronicleBtn) dailyGamesChronicleBtn.hidden = dailyGamesTournamentOnly;
  if(dailyGamesIntro) dailyGamesIntro.textContent = dailyGamesTournamentOnly
    ? 'Deine Daily- und Live-Turnierpartien nach Status. Goldene Markierung kennzeichnet die Turnierzuordnung; ein grüner Zughinweis bleibt weiterhin vorrangig sichtbar.'
    : 'Deine Live- und Daily-Partien an einem Ort: laufend, offen und beendet. Offene Revanchen findest du im Bereich „Offen“.';
  if(dailyGamesBackdrop) dailyGamesBackdrop.hidden = false;
  loadDailyGames();
  startDailyGamesPresenceRefresh();
}
function closeDailyGamesDialog(){
  if(dailyGamesBackdrop) dailyGamesBackdrop.hidden = true;
  stopDailyGamesPresenceRefresh();
}
dailyGamesTabButtons.forEach(button => button.addEventListener('click', () => setDailyGamesActiveTab(button.dataset.dailyGamesTab)));
if(dailyGamesMomentsOnlyBtn) dailyGamesMomentsOnlyBtn.addEventListener('click', () => {
  dailyGamesMomentsOnly = !dailyGamesMomentsOnly;
  dailyGamesMomentsOnlyBtn.classList.toggle('active', dailyGamesMomentsOnly);
  dailyGamesMomentsOnlyBtn.setAttribute('aria-pressed', dailyGamesMomentsOnly ? 'true' : 'false');
  dailyGamesMomentsOnlyBtn.textContent = dailyGamesMomentsOnly ? '♥ Nur Gamer-Momente' : '♡ Nur Gamer-Momente';
  renderDailyGames(dailyGamesCache);
});
if(dailyGamesOpenBtn) dailyGamesOpenBtn.addEventListener('click', () => openDailyGamesDialog(false));
if(tournamentGamesOpenBtn) tournamentGamesOpenBtn.addEventListener('click', () => openDailyGamesDialog(true));
if(dailyGamesRefreshBtn) dailyGamesRefreshBtn.addEventListener('click', loadDailyGames);
if(dailyGamesCloseBtn) dailyGamesCloseBtn.addEventListener('click', closeDailyGamesDialog);
if(dailyGamesBackdrop) dailyGamesBackdrop.addEventListener('click', ev => { if(ev.target === dailyGamesBackdrop) closeDailyGamesDialog(); });
if(dailyInvitationResponseInput) dailyInvitationResponseInput.addEventListener('input', updateDailyInvitationResponseCount);
if(dailyInvitationResponseCancelBtn) dailyInvitationResponseCancelBtn.addEventListener('click', () => closeDailyInvitationResponseDialog(false));
if(dailyInvitationResponseConfirmBtn) dailyInvitationResponseConfirmBtn.addEventListener('click', submitDailyInvitationResponse);
if(dailyInvitationResponseBackdrop) dailyInvitationResponseBackdrop.addEventListener('click', ev => { if(ev.target === dailyInvitationResponseBackdrop) closeDailyInvitationResponseDialog(false); });
document.addEventListener('keydown', ev => {
  if(ev.key !== 'Escape') return;
  if(dailyInvitationResponseBackdrop && !dailyInvitationResponseBackdrop.hidden) closeDailyInvitationResponseDialog(false);
  else if(dailyGamesBackdrop && !dailyGamesBackdrop.hidden) closeDailyGamesDialog();
});

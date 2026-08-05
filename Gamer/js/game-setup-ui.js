'use strict';

function isOnlineGameLiveForUi(){
  return !!(onlineRoomId && onlineGameStarted && !onlineGameEnded && !gameEnded && !timeLost);
}
function isMoveNavigationLocked(){
  /* Während einer laufenden Partie darf die Zugliste zur Analyse bedient werden.
     Eine Daily-Zugvorschau oder ein vorgemerkter Premove bleibt auf der aktuellen
     Stellung fixiert, damit Ausführung und Brettansicht eindeutig zusammenpassen. */
  return !!(pendingDailyMove || queuedPremove);
}
function isGameInProgressForUi(){
  return !!(isOnlineGameLiveForUi() || actualMoveCount() > 0 || firstMoveDone || clockRunning || timeLost);
}
function updateTimeSetupVisibility(){
  if(!timeSetupBoxEl) return;
  /*
    Die Bedenkzeit-Auswahl gehört vor die Einladung:
    - vor Erstellung eines Online-Raums sichtbar und auswählbar
    - in der Lobby sichtbar, aber für Schwarz/Zuschauer gesperrt
    - erst während einer gestarteten/laufenden Partie ausgeblendet
  */
  timeSetupBoxEl.hidden = !!(onlineGameStarted && !onlineGameEnded && !gameEnded && !timeLost);
}

function isVariantSetupLocked(){
  if(actualMoveCount() > 0 || firstMoveDone || clockRunning || timeLost) return true;
  if(onlineGameStarted) return true;
  return !!onlineRoomId;
}
function currentGameSetupPayload(){
  return normalizeGameSetup(currentGameSetup);
}
function updateVariantSetupVisibility(){
  const live = !!(onlineGameStarted && !onlineGameEnded && !gameEnded && !timeLost);
  if(variantSetupBoxEl) variantSetupBoxEl.hidden = live;
}
function updateVariantUi(){
  const setup = normalizeGameSetup(currentGameSetup);
  const locked = isVariantSetupLocked();
  if(variantStandardBtn){
    variantStandardBtn.classList.toggle('active', setup.variant === GAME_VARIANT_STANDARD);
    variantStandardBtn.disabled = locked;
  }
  if(variantFreestyleBtn){
    variantFreestyleBtn.classList.toggle('active', setup.variant === GAME_VARIANT_FREESTYLE);
    variantFreestyleBtn.disabled = locked;
  }
  const freestyleActive = setup.variant === GAME_VARIANT_FREESTYLE;
  if(freestylePositionControlsEl) freestylePositionControlsEl.hidden = !freestyleActive;
  if(freestylePositionInput){
    freestylePositionInput.disabled = locked;
    if(document.activeElement !== freestylePositionInput || locked){
      freestylePositionInput.value = freestyleActive && setup.positionId !== null ? String(setup.positionId) : '';
    }
  }
  if(freestylePositionApplyBtn) freestylePositionApplyBtn.disabled = locked;
  if(freestyleRandomBtn){
    freestyleRandomBtn.hidden = !freestyleActive;
    freestyleRandomBtn.disabled = locked;
  }
  if(!freestyleActive) setFreestylePositionMessage('', false);
  if(variantStatusEl) variantStatusEl.textContent = setupLabel(setup);
  if(variantLockNoteEl){
    variantLockNoteEl.hidden = true;
    variantLockNoteEl.textContent = '';
  }
  updateVariantSetupVisibility();
}
function applyGameSetup(setup, options){
  options = options || {};
  const beforeSetup = normalizeGameSetup(currentGameSetup);
  const playedMovesBeforeChange = Math.max(0, masterHistory.length - (beforeSetup.theme ? beforeSetup.theme.moves.length : 0));
  const normalized = normalizeGameSetup(setup);
  const changed = !sameGameSetup(beforeSetup, normalized);
  if(options.save === false) currentGameSetup = normalized;
  else saveGameSetupPreference(normalized);
  if(changed) invalidateHistoryStateCache();
  if((changed || options.forceReset) && playedMovesBeforeChange === 0 && !onlineGameStarted && !firstMoveDone && !clockRunning){
    selected = null;
    masterHistory = buildThemeHistory(normalized);
    invalidateHistoryStateCache();
    viewIndex = masterHistory.length;
    lastMove = masterHistory.length ? {from:masterHistory[masterHistory.length-1].from,to:masterHistory[masterHistory.length-1].to,meta:masterHistory[masterHistory.length-1].meta || {}} : null;
    renderBoard();
  }
  updateVariantUi();
  return normalized;
}
function setGameVariant(variant){
  if(isVariantSetupLocked()){
    updateVariantUi();
    return;
  }
  if(variant === GAME_VARIANT_FREESTYLE){
    const setup = currentGameSetup.variant === GAME_VARIANT_FREESTYLE ? currentGameSetup : randomChess960Setup();
    applyGameSetup(setup, {forceReset:true});
  } else {
    applyGameSetup({variant: GAME_VARIANT_STANDARD}, {forceReset:true});
  }
}
function setFreestylePositionMessage(message, isError, isSuccess){
  if(!freestylePositionMessageEl) return;
  freestylePositionMessageEl.textContent = message || '';
  freestylePositionMessageEl.classList.toggle('error', !!isError);
  freestylePositionMessageEl.classList.toggle('success', !!isSuccess && !isError);
}
function applyManualFreestylePosition(){
  if(isVariantSetupLocked()){
    setFreestylePositionMessage('Die Freestyle-Stellung ist nach Erstellung des Raums gesperrt.', true, false);
    updateVariantUi();
    return;
  }
  const raw = String(freestylePositionInput ? freestylePositionInput.value : '').trim();
  if(!/^\d{1,3}$/.test(raw)){
    setFreestylePositionMessage('Bitte eine ganze Zahl zwischen 0 und 959 eingeben.', true, false);
    try{ if(freestylePositionInput) freestylePositionInput.focus(); } catch(_){}
    return;
  }
  const positionId = Number(raw);
  if(!Number.isInteger(positionId) || positionId < 0 || positionId > 959){
    setFreestylePositionMessage('Gültig sind ausschließlich Stellungsnummern von 0 bis 959.', true, false);
    try{ if(freestylePositionInput) freestylePositionInput.focus(); } catch(_){}
    return;
  }
  applyGameSetup({variant:GAME_VARIANT_FREESTYLE, positionId}, {forceReset:true});
  setFreestylePositionMessage('Freestyle-Stellung #' + positionId + ' wurde übernommen.', false, true);
}
function randomizeFreestyleSetup(){
  if(isVariantSetupLocked()){
    updateVariantUi();
    return;
  }
  const setup = applyGameSetup(randomChess960Setup(), {forceReset:true});
  setFreestylePositionMessage('Zufällige Freestyle-Stellung #' + setup.positionId + ' wurde übernommen.', false, true);
}
if(variantStandardBtn) variantStandardBtn.addEventListener('click', () => setGameVariant(GAME_VARIANT_STANDARD));
if(variantFreestyleBtn) variantFreestyleBtn.addEventListener('click', () => setGameVariant(GAME_VARIANT_FREESTYLE));
if(freestylePositionApplyBtn) freestylePositionApplyBtn.addEventListener('click', applyManualFreestylePosition);
if(freestylePositionInput){
  freestylePositionInput.addEventListener('input', () => setFreestylePositionMessage('Nummer eingeben und übernehmen.', false, false));
  freestylePositionInput.addEventListener('keydown', ev => {
    if(ev.key === 'Enter'){
      ev.preventDefault();
      applyManualFreestylePosition();
    }
  });
}
if(freestyleRandomBtn) freestyleRandomBtn.addEventListener('click', randomizeFreestyleSetup);

function normalizeInviteColorPreference(value){
  value = String(value || '').toLowerCase();
  return value === 'b' || value === 'black' ? 'b' : value === 'random' || value === 'zufall' ? 'random' : 'w';
}
function inviteColorPreferenceLabel(value){
  value = normalizeInviteColorPreference(value);
  if(value === 'b') return 'Schwarz';
  if(value === 'random') return 'Zufall';
  return 'Weiß';
}
function oppositeInviteSide(value){ return value === 'b' ? 'w' : 'b'; }
function resolveInviteCreatorRole(){
  const pref = normalizeInviteColorPreference(inviteColorPreference);
  if(pref === 'random') return Math.random() < 0.5 ? 'w' : 'b';
  return pref;
}
function isInviteColorLocked(){
  if(onlineGameStarted && !onlineGameEnded && !gameEnded && !timeLost) return true;
  return !!(onlineRoomId && !onlineGameStarted && !onlineGameEnded && !gameEnded && !timeLost);
}
function buildInviteColorSummaryText(){
  if(onlineRoomId && (onlineRoleCode === 'w' || onlineRoleCode === 'b')){
    const mySide = roleLabel(onlineRoleCode);
    const opponentSide = roleLabel(oppositeInviteSide(onlineRoleCode));
    return 'Farbe festgelegt: Du spielst ' + mySide + '. Der eingeladene Spieler spielt ' + opponentSide + '.';
  }
  const pref = normalizeInviteColorPreference(inviteColorPreference);
  if(pref === 'random') return 'Farbe: Zufall. Beim Erstellen des Einladungsraums wird deine Farbe ausgelost.';
  return 'Farbe: Du lädst als ' + inviteColorPreferenceLabel(pref) + ' ein. Der eingeladene Spieler erhält die Gegenfarbe.';
}
function updateInviteColorUi(){
  const hidden = !!(onlineGameStarted && !onlineGameEnded && !gameEnded && !timeLost);
  const locked = isInviteColorLocked();
  if(inviteColorBoxEl) inviteColorBoxEl.hidden = hidden;
  inviteColorButtons.forEach(btn => {
    const value = normalizeInviteColorPreference(btn.dataset.inviteColor);
    btn.classList.toggle('active', normalizeInviteColorPreference(inviteColorPreference) === value);
    btn.disabled = locked;
    btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
  });
  if(inviteColorStatusEl){
    inviteColorStatusEl.hidden = true;
    inviteColorStatusEl.textContent = '';
  }
  if(inviteColorSummaryEl){
    inviteColorSummaryEl.hidden = !onlineRoomId;
    inviteColorSummaryEl.textContent = buildInviteColorSummaryText();
  }
}
function setInviteColorPreference(value){
  const normalized = normalizeInviteColorPreference(value);
  if(isInviteColorLocked()){
    updateInviteColorUi();
    return;
  }
  inviteColorPreference = normalized;
  try{ localStorage.setItem(ONLINE_INVITE_COLOR_STORAGE_KEY, inviteColorPreference); } catch(_){ }
  updateInviteColorUi();
}

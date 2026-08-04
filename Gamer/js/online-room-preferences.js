'use strict';

function isRatingPreferenceLocked(){
  return !!onlineRoomId;
}
function effectiveRatedPreference(){
  return onlineRoomId ? !!onlineRatedRequested : !!ratingPreference;
}
function updateRatingPreferenceUi(){
  const rated = effectiveRatedPreference();
  const locked = isRatingPreferenceLocked();
  ratingPreferenceButtons.forEach(btn => {
    const wantsRated = btn.dataset.rated !== 'no';
    btn.classList.toggle('active', rated === wantsRated);
    btn.disabled = locked;
    btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
  });
  if(ratingSetupStatusEl){
    ratingSetupStatusEl.textContent = rated ? 'Gewertete Partie' : 'Ungewertete Partie';
  }
  if(inviteRatingSummaryEl){
    inviteRatingSummaryEl.hidden = !onlineRoomId;
    inviteRatingSummaryEl.textContent = 'Wertung: ' + (rated ? 'Gewertet' : 'Ungewertet');
  }
}
function setRatingPreference(rated){
  if(isRatingPreferenceLocked()){
    updateRatingPreferenceUi();
    return;
  }
  ratingPreference = !!rated;
  onlineRatedRequested = ratingPreference;
  updateRatingPreferenceUi();
}
function updatePublicVisibilityUi(){
  const inRoom = !!onlineRoomId;
  const loggedIn = !!(onlineAuthToken && onlineAuthUser);
  const ended = !!(onlineGameEnded || gameEnded || timeLost);
  const pending = !!onlinePendingPublicGameMessageId;

  if(publicVisibilityBoxEl) publicVisibilityBoxEl.hidden = inRoom;
  if(publicGameCheckbox){
    publicGameCheckbox.checked = !!publicGamePreference;
    publicGameCheckbox.disabled = inRoom || !loggedIn;
    publicGameCheckbox.title = !loggedIn
      ? 'Zum Erstellen einer öffentlichen Partie bitte einloggen.'
      : 'Gestartete Partie öffentlich in der Zuschauerübersicht anzeigen.';
  }
  if(publicVisibilityHintEl){
    if(!loggedIn){
      publicVisibilityHintEl.textContent = 'Nur eingeloggte Mitglieder können Partien erstellen und öffentlich freigeben.';
    } else {
      publicVisibilityHintEl.textContent = publicGamePreference
        ? 'Nach dem Partiestart erscheint die Partie unter „Laufende Partien“. Der private Spielerchat bleibt verborgen.'
        : 'Die Partie bleibt privat und erscheint nicht unter „Laufende Partien“.';
    }
  }

  const canChangeRoomVisibility = !!(inRoom && onlineConnected && onlineCreatedByMe && !ended && onlineRoleCode !== 'spectator');
  if(roomPublicVisibilityBoxEl) roomPublicVisibilityBoxEl.hidden = !inRoom || !onlineCreatedByMe || onlineRoleCode === 'spectator';
  if(roomPublicGameCheckbox){
    roomPublicGameCheckbox.checked = !!onlinePublicGame;
    roomPublicGameCheckbox.disabled = !canChangeRoomVisibility || pending;
    roomPublicGameCheckbox.title = ended
      ? 'Nach Partieende kann die Zuschauerfreigabe nicht mehr geändert werden.'
      : (!onlineCreatedByMe ? 'Nur der Ersteller kann die Zuschauerfreigabe ändern.' : (pending ? 'Änderung wird vom Server verarbeitet.' : 'Zuschauerfreigabe dieser Partie ändern.'));
  }
  if(roomPublicVisibilityHintEl){
    if(pending){
      roomPublicVisibilityHintEl.textContent = 'Änderung wird gespeichert…';
    } else if(ended){
      roomPublicVisibilityHintEl.textContent = onlinePublicGame
        ? 'Die Partie ist beendet; die öffentliche Freigabe kann nicht mehr geändert werden.'
        : 'Die Partie ist beendet und nicht öffentlich gelistet.';
    } else if(!onlineConnected){
      roomPublicVisibilityHintEl.textContent = 'Die Zuschauerfreigabe kann nach Wiederherstellung der Verbindung geändert werden.';
    } else if(onlinePublicGame){
      roomPublicVisibilityHintEl.textContent = 'Öffentlich freigegeben. Beim Abschalten verschwinden die Partie und der bisherige Zuschauerzugang sofort.';
    } else {
      roomPublicVisibilityHintEl.textContent = onlineGameStarted
        ? 'Privat. Du kannst die laufende Partie jetzt öffentlich freigeben.'
        : 'Privat. Eine Freigabe erscheint erst nach dem Partiestart in der öffentlichen Übersicht.';
    }
  }
}
function setPublicGamePreference(enabled){
  if(onlineRoomId){ updatePublicVisibilityUi(); return; }
  publicGamePreference = !!enabled;
  try{ localStorage.setItem(ONLINE_PUBLIC_GAME_STORAGE_KEY, publicGamePreference ? 'yes' : 'no'); } catch(_){}
  updatePublicVisibilityUi();
}
function setCurrentRoomPublicGame(enabled){
  if(!onlineRoomId || !onlineConnected || !onlineCreatedByMe || onlineRoleCode === 'spectator'){
    updatePublicVisibilityUi();
    return;
  }
  if(onlineGameEnded || gameEnded || timeLost){
    onlineLastMessage = 'Nach Partieende kann die Zuschauerfreigabe nicht mehr geändert werden.';
    updateOnlineUi();
    return;
  }
  if(onlinePendingPublicGameMessageId){ updatePublicVisibilityUi(); return; }
  const desired = !!enabled;
  if(desired === !!onlinePublicGame){ updatePublicVisibilityUi(); return; }
  const messageId = 'pub_' + Date.now() + '_' + randomToken(5);
  onlinePendingPublicGameMessageId = messageId;
  onlineLastMessage = desired ? 'Zuschauerfreigabe wird aktiviert…' : 'Zuschauerfreigabe wird aufgehoben…';
  updateOnlineUi();
  if(!sendOnlineMessage({type:'set_public_game', publicGame:desired, messageId})){
    onlinePendingPublicGameMessageId = null;
    onlineLastMessage = 'Zuschauerfreigabe konnte nicht gesendet werden.';
    updateOnlineUi();
    return;
  }
  setTimeout(() => {
    if(onlinePendingPublicGameMessageId !== messageId) return;
    onlinePendingPublicGameMessageId = null;
    requestOnlineState();
    onlineLastMessage = 'Zuschauerfreigabe wurde noch nicht bestätigt. Raumzustand wird aktualisiert.';
    updateOnlineUi();
  }, 3500);
}

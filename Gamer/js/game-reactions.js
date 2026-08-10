'use strict';

const GAME_REACTION_OPTIONS = Object.freeze([
  Object.freeze({code:'thanks', emoji:'🤝', label:'Danke für die Partie'}),
  Object.freeze({code:'well_played', emoji:'👏', label:'Stark gespielt'}),
  Object.freeze({code:'exciting', emoji:'🔥', label:'Spannende Partie'})
]);

let onlineGameReactionState = null;
let onlineGameReactionBusy = false;

const onlineGameReactionBarEl = document.getElementById('gameReactionBar');
const onlineGameReactionReceivedEl = document.getElementById('gameReactionReceived');
const onlineGameReactionHintEl = document.getElementById('gameReactionHint');
const onlineGameReactionClearBtn = document.getElementById('gameReactionClearBtn');
const onlineGameReactionButtons = Array.from(document.querySelectorAll('[data-game-reaction]'));

function normalizeGameReactionCode(value){
  const code = String(value || '').trim().toLowerCase();
  return GAME_REACTION_OPTIONS.some(option => option.code === code) ? code : '';
}
function gameReactionOption(value){
  const code = normalizeGameReactionCode(value);
  return GAME_REACTION_OPTIONS.find(option => option.code === code) || null;
}
function gameReactionText(value){
  const option = gameReactionOption(value);
  return option ? option.emoji + ' ' + option.label : '';
}
function normalizeGameReactionState(value){
  if(!value || typeof value !== 'object' || value.available !== true) return null;
  return {
    available:true,
    myReaction:normalizeGameReactionCode(value.myReaction || value.my_reaction),
    opponentReaction:normalizeGameReactionCode(value.opponentReaction || value.opponent_reaction)
  };
}
function applyOnlineGameReactionState(value){
  onlineGameReactionState = normalizeGameReactionState(value);
  updateOnlineGameReactionUi();
}
function resetOnlineGameReactionState(){
  onlineGameReactionState = null;
  onlineGameReactionBusy = false;
  updateOnlineGameReactionUi();
}
function onlineGameReactionOpponentName(){
  if(onlineRoleCode === 'w') return onlineSideName('b');
  if(onlineRoleCode === 'b') return onlineSideName('w');
  return 'Dein Gegner';
}
function updateOnlineGameReactionUi(){
  if(!onlineGameReactionBarEl) return;
  const state = onlineGameReactionState;
  const visible = !!(
    onlineRoomId && onlineGameEnded && state && state.available &&
    (onlineRoleCode === 'w' || onlineRoleCode === 'b') && !onlineSpectatorOnly
  );
  onlineGameReactionBarEl.hidden = !visible;
  if(!visible) return;

  onlineGameReactionButtons.forEach(button => {
    const code = normalizeGameReactionCode(button.dataset.gameReaction);
    const selected = !!(code && state.myReaction === code);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.disabled = onlineGameReactionBusy;
  });
  if(onlineGameReactionClearBtn){
    onlineGameReactionClearBtn.hidden = !state.myReaction;
    onlineGameReactionClearBtn.disabled = onlineGameReactionBusy;
  }
  if(onlineGameReactionReceivedEl){
    const receivedText = gameReactionText(state.opponentReaction);
    onlineGameReactionReceivedEl.hidden = !receivedText;
    onlineGameReactionReceivedEl.textContent = receivedText
      ? (onlineGameReactionOpponentName() || 'Dein Gegner') + ': ' + receivedText
      : '';
  }
  if(onlineGameReactionHintEl){
    if(onlineGameReactionBusy) onlineGameReactionHintEl.textContent = 'Reaktion wird gespeichert…';
    else if(state.myReaction) onlineGameReactionHintEl.textContent = 'Deine Reaktion: ' + gameReactionText(state.myReaction) + ' · Du kannst sie ändern oder entfernen.';
    else onlineGameReactionHintEl.textContent = 'Eine private Reaktion an deinen Gegner senden.';
  }
}
async function saveOnlineGameReaction(reaction){
  const roomId = cleanRoomId(onlineRoomId || '');
  if(!roomId || onlineGameReactionBusy || !onlineGameReactionState || !onlineGameReactionState.available) return;
  onlineGameReactionBusy = true;
  updateOnlineGameReactionUi();
  try{
    const data = await authApi('/api/game-reactions/' + encodeURIComponent(roomId), {
      method:'POST',
      body:JSON.stringify({reaction:normalizeGameReactionCode(reaction)})
    });
    onlineGameReactionState = normalizeGameReactionState(data && data.reactions) || onlineGameReactionState;
  } catch(err){
    if(onlineGameReactionHintEl) onlineGameReactionHintEl.textContent = err && err.message ? err.message : 'Die Reaktion konnte nicht gespeichert werden.';
  } finally {
    onlineGameReactionBusy = false;
    updateOnlineGameReactionUi();
  }
}

onlineGameReactionButtons.forEach(button => button.addEventListener('click', () => {
  saveOnlineGameReaction(button.dataset.gameReaction);
}));
if(onlineGameReactionClearBtn) onlineGameReactionClearBtn.addEventListener('click', () => saveOnlineGameReaction(''));

function gameReactionStateFromGame(game){
  if(!game || game.reactionAvailable !== true) return null;
  return normalizeGameReactionState({
    available:true,
    myReaction:game.myReaction,
    opponentReaction:game.opponentReaction
  });
}
function setGameReactionPanelBusy(panel, busy){
  if(!panel) return;
  panel.classList.toggle('busy', !!busy);
  panel.querySelectorAll('button').forEach(button => { button.disabled = !!busy; });
}
async function saveCardGameReaction(game, reaction, panel, options){
  const roomId = cleanRoomId(game && game.roomId);
  if(!roomId || !panel || panel.classList.contains('busy')) return;
  const normalized = normalizeGameReactionCode(reaction);
  setGameReactionPanelBusy(panel, true);
  const statusElement = options && options.statusElement;
  if(statusElement) statusElement.textContent = 'Reaktion wird gespeichert…';
  try{
    const data = await authApi('/api/game-reactions/' + encodeURIComponent(roomId), {
      method:'POST',
      body:JSON.stringify({reaction:normalized})
    });
    const state = normalizeGameReactionState(data && data.reactions);
    game.myReaction = state ? state.myReaction : normalized;
    game.opponentReaction = state ? state.opponentReaction : normalizeGameReactionCode(game.opponentReaction);
    game.reactionAvailable = !!state;
    if(statusElement) statusElement.textContent = normalized ? 'Reaktion wurde gespeichert.' : 'Reaktion wurde entfernt.';
    if(options && typeof options.onChange === 'function') options.onChange(game);
  } catch(err){
    if(statusElement) statusElement.textContent = err && err.message ? err.message : 'Die Reaktion konnte nicht gespeichert werden.';
    setGameReactionPanelBusy(panel, false);
  }
}
function createGameReactionPanel(game, options){
  const state = gameReactionStateFromGame(game);
  if(!state || !game || !game.ended) return null;
  const panel = document.createElement('div');
  panel.className = 'game-reaction-panel';

  const heading = document.createElement('div');
  heading.className = 'game-reaction-panel-heading';
  heading.textContent = 'Fairer Abschluss';
  panel.appendChild(heading);

  if(state.opponentReaction){
    const received = document.createElement('div');
    received.className = 'game-reaction-received';
    const opponentName = cleanDisplayName(options && options.opponentName || game.opponentName || '');
    received.textContent = (opponentName || 'Dein Gegner') + ': ' + gameReactionText(state.opponentReaction);
    panel.appendChild(received);
  }

  const choices = document.createElement('div');
  choices.className = 'game-reaction-choices';
  GAME_REACTION_OPTIONS.forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'game-reaction-choice' + (state.myReaction === option.code ? ' selected' : '');
    button.setAttribute('aria-pressed', state.myReaction === option.code ? 'true' : 'false');
    button.textContent = option.emoji + ' ' + option.label;
    button.addEventListener('click', () => saveCardGameReaction(game, option.code, panel, options || {}));
    choices.appendChild(button);
  });
  panel.appendChild(choices);

  if(state.myReaction){
    const own = document.createElement('div');
    own.className = 'game-reaction-own';
    own.textContent = 'Deine Reaktion: ' + gameReactionText(state.myReaction);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'game-reaction-remove';
    remove.textContent = 'Entfernen';
    remove.addEventListener('click', () => saveCardGameReaction(game, '', panel, options || {}));
    own.appendChild(remove);
    panel.appendChild(own);
  }
  return panel;
}

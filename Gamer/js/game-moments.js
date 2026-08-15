'use strict';

const GAME_MOMENT_NOTE_LIMIT = 240;

let onlineGameMomentState = null;
let onlineGameMomentBusy = false;
const gameMomentSuccessTimers = new WeakMap();

const onlineGameMomentBarEl = document.getElementById('gameMomentBar');
const onlineGameMomentToggleBtn = document.getElementById('gameMomentToggleBtn');
const onlineGameMomentDetailsEl = document.getElementById('gameMomentDetails');
const onlineGameMomentNoteInput = document.getElementById('gameMomentNoteInput');
const onlineGameMomentNoteCount = document.getElementById('gameMomentNoteCount');
const onlineGameMomentSaveBtn = document.getElementById('gameMomentSaveBtn');
const onlineGameMomentStatusEl = document.getElementById('gameMomentStatus');
if(onlineGameMomentStatusEl) onlineGameMomentStatusEl.setAttribute('aria-live', 'polite');

function clearGameMomentSuccess(element){
  if(!element) return;
  const timer = gameMomentSuccessTimers.get(element);
  if(timer) clearTimeout(timer);
  gameMomentSuccessTimers.delete(element);
  element.classList.remove('game-moment-save-success');
}
function showGameMomentSuccess(element, message){
  if(!element) return;
  clearGameMomentSuccess(element);
  element.textContent = message || '✓ Gespeichert';
  element.classList.add('game-moment-save-success');
  const timer = setTimeout(() => {
    element.classList.remove('game-moment-save-success');
    gameMomentSuccessTimers.delete(element);
  }, 2800);
  gameMomentSuccessTimers.set(element, timer);
}

function normalizeGameMomentNote(value){
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, GAME_MOMENT_NOTE_LIMIT);
}
function normalizeGameMomentState(value){
  if(!value || typeof value !== 'object' || value.available !== true) return null;
  return {
    available:true,
    marked:value.marked === true,
    note:normalizeGameMomentNote(value.note),
    markedAt:value.markedAt || value.marked_at || null,
    updatedAt:value.updatedAt || value.updated_at || null
  };
}
function gameMomentStateFromGame(game){
  if(!game || (!game.isParticipant && !game.role && !game.participantRole)) return null;
  return normalizeGameMomentState({
    available:true,
    marked:game.favorite === true,
    note:game.momentNote,
    markedAt:game.momentAt
  });
}
function applyOnlineGameMomentState(value){
  onlineGameMomentState = normalizeGameMomentState(value);
  updateOnlineGameMomentUi();
}
function resetOnlineGameMomentState(){
  onlineGameMomentState = null;
  onlineGameMomentBusy = false;
  if(onlineGameMomentNoteInput) onlineGameMomentNoteInput.value = '';
  updateOnlineGameMomentUi();
}
function updateMomentNoteCount(input, output){
  if(!output) return;
  const length = input ? Math.min(GAME_MOMENT_NOTE_LIMIT, input.value.length) : 0;
  output.textContent = length + ' / ' + GAME_MOMENT_NOTE_LIMIT;
}
function updateOnlineGameMomentUi(){
  if(!onlineGameMomentBarEl) return;
  const state = onlineGameMomentState;
  const visible = !!(
    onlineRoomId && onlineGameEnded && state && state.available &&
    (onlineRoleCode === 'w' || onlineRoleCode === 'b') && !onlineSpectatorOnly
  );
  onlineGameMomentBarEl.hidden = !visible;
  if(!visible) return;

  onlineGameMomentBarEl.classList.toggle('marked', state.marked);
  if(onlineGameMomentToggleBtn){
    onlineGameMomentToggleBtn.disabled = onlineGameMomentBusy;
    onlineGameMomentToggleBtn.classList.toggle('selected', state.marked);
    onlineGameMomentToggleBtn.setAttribute('aria-pressed', state.marked ? 'true' : 'false');
    onlineGameMomentToggleBtn.textContent = state.marked ? '♥ Mein Gamer-Moment' : '♡ Als Gamer-Moment merken';
  }
  if(onlineGameMomentDetailsEl) onlineGameMomentDetailsEl.hidden = !state.marked;
  if(onlineGameMomentNoteInput){
    const focused = document.activeElement === onlineGameMomentNoteInput;
    if(!focused) onlineGameMomentNoteInput.value = state.note;
    onlineGameMomentNoteInput.disabled = onlineGameMomentBusy;
    updateMomentNoteCount(onlineGameMomentNoteInput, onlineGameMomentNoteCount);
  }
  if(onlineGameMomentSaveBtn) onlineGameMomentSaveBtn.disabled = onlineGameMomentBusy;
  if(onlineGameMomentStatusEl){
    if(onlineGameMomentBusy) onlineGameMomentStatusEl.textContent = 'Gamer-Moment wird gespeichert…';
    else if(state.marked) onlineGameMomentStatusEl.textContent = state.note
      ? 'Privater Gamer-Moment mit persönlicher Erinnerung.'
      : 'Dieser Gamer-Moment bleibt für dich dauerhaft erhalten.';
    else onlineGameMomentStatusEl.textContent = 'Nur für dich sichtbar. Dein Gegner wird nicht benachrichtigt.';
  }
}
async function persistGameMoment(roomId, marked, note){
  return authApi('/api/game-moments/' + encodeURIComponent(cleanRoomId(roomId)), {
    method:'POST',
    body:JSON.stringify({marked:marked === true, note:normalizeGameMomentNote(note)})
  });
}
async function saveOnlineGameMoment(marked, note){
  const roomId = cleanRoomId(onlineRoomId || '');
  if(!roomId || onlineGameMomentBusy || !onlineGameMomentState || !onlineGameMomentState.available) return;
  clearGameMomentSuccess(onlineGameMomentStatusEl);
  onlineGameMomentBusy = true;
  updateOnlineGameMomentUi();
  let errorMessage = '';
  try{
    const data = await persistGameMoment(roomId, marked, note);
    onlineGameMomentState = normalizeGameMomentState(data && data.moment) || onlineGameMomentState;
  }catch(err){
    errorMessage = err && err.message ? err.message : 'Der Gamer-Moment konnte nicht gespeichert werden.';
  }finally{
    onlineGameMomentBusy = false;
    updateOnlineGameMomentUi();
    if(errorMessage && onlineGameMomentStatusEl) onlineGameMomentStatusEl.textContent = errorMessage;
    else showGameMomentSuccess(onlineGameMomentStatusEl, marked ? '✓ Gespeichert' : '✓ Gamer-Moment entfernt');
  }
}
if(onlineGameMomentToggleBtn) onlineGameMomentToggleBtn.addEventListener('click', () => {
  const state = onlineGameMomentState;
  if(!state) return;
  saveOnlineGameMoment(!state.marked, state.marked ? '' : (onlineGameMomentNoteInput && onlineGameMomentNoteInput.value));
});
if(onlineGameMomentSaveBtn) onlineGameMomentSaveBtn.addEventListener('click', () => {
  if(!onlineGameMomentState || !onlineGameMomentState.marked) return;
  saveOnlineGameMoment(true, onlineGameMomentNoteInput && onlineGameMomentNoteInput.value);
});
if(onlineGameMomentNoteInput) onlineGameMomentNoteInput.addEventListener('input', () => updateMomentNoteCount(onlineGameMomentNoteInput, onlineGameMomentNoteCount));

function setGameMomentPanelBusy(panel, busy){
  if(!panel) return;
  panel.classList.toggle('busy', !!busy);
  panel.querySelectorAll('button,textarea').forEach(control => { control.disabled = !!busy; });
}
async function saveCardGameMoment(game, marked, note, panel, options){
  const roomId = cleanRoomId(game && game.roomId);
  if(!roomId || !panel || panel.classList.contains('busy')) return;
  const statusElement = options && options.statusElement;
  setGameMomentPanelBusy(panel, true);
  if(statusElement){ clearGameMomentSuccess(statusElement); statusElement.textContent = 'Gamer-Moment wird gespeichert…'; }
  try{
    const data = await persistGameMoment(roomId, marked, note);
    const state = normalizeGameMomentState(data && data.moment);
    game.favorite = !!(state && state.marked);
    game.momentNote = state ? state.note : '';
    game.momentAt = state ? state.markedAt : null;
    showGameMomentSuccess(statusElement, game.favorite ? '✓ Gespeichert' : '✓ Gamer-Moment entfernt');
    if(options && typeof options.onChange === 'function') options.onChange(game);
  }catch(err){
    if(statusElement){ clearGameMomentSuccess(statusElement); statusElement.textContent = err && err.message ? err.message : 'Der Gamer-Moment konnte nicht gespeichert werden.'; }
    setGameMomentPanelBusy(panel, false);
  }
}
function createGameMomentPanel(game, options){
  const state = gameMomentStateFromGame(game);
  if(!state) return null;
  const panel = document.createElement('div');
  panel.className = 'game-moment-panel' + (state.marked ? ' marked' : '');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'game-moment-toggle' + (state.marked ? ' selected' : '');
  toggle.setAttribute('aria-pressed', state.marked ? 'true' : 'false');
  toggle.textContent = state.marked ? '♥ Gamer-Moment' : '♡ Als Gamer-Moment merken';
  toggle.addEventListener('click', () => saveCardGameMoment(game, !state.marked, '', panel, options || {}));
  panel.appendChild(toggle);

  if(state.marked){
    const noteLabel = document.createElement('label');
    noteLabel.className = 'game-moment-note-label';
    noteLabel.textContent = 'Meine private Erinnerung';
    const note = document.createElement('textarea');
    note.className = 'game-moment-note';
    note.maxLength = GAME_MOMENT_NOTE_LIMIT;
    note.rows = 2;
    note.value = state.note;
    note.placeholder = 'Warum bleibt dir diese Partie in Erinnerung?';
    const footer = document.createElement('div');
    footer.className = 'game-moment-note-footer';
    const count = document.createElement('span');
    updateMomentNoteCount(note, count);
    note.addEventListener('input', () => updateMomentNoteCount(note, count));
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'game-moment-note-save';
    save.textContent = 'Erinnerung speichern';
    save.addEventListener('click', () => saveCardGameMoment(game, true, note.value, panel, options || {}));
    footer.append(count, save);
    panel.append(noteLabel, note, footer);
  }
  return panel;
}

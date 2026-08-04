'use strict';

/* Bedenkzeit */
const TIME_STORAGE_KEY = 'hammerschachGamerTimeControl';
const TIME_CATEGORY_STORAGE_KEY = 'hammerschachGamerTimeCategory';
let timeMode = false;
let activeTimeKey = '0+0';
let activeTimeCategory = '';
let activeTimeLabel = 'Keine Bedenkzeit';
let baseTimeMs = 0;
let incrementMs = 0;
let clocks = {w:0, b:0};
let clockInterval = null;
let clockRunning = false;
let firstMoveDone = false;
const clockWEl = document.getElementById('clockW');
const clockBEl = document.getElementById('clockB');
const clockCardW = document.getElementById('clockCardW');
const clockCardB = document.getElementById('clockCardB');
const timeStatusEl = document.getElementById('timeStatus');
const timeLockNoteEl = document.getElementById('timeLockNote');
const timeSelects = document.querySelectorAll('.time-control-select');
const timeKindLiveBtn = document.getElementById('timeKindLiveBtn');
const timeKindDailyBtn = document.getElementById('timeKindDailyBtn');
const liveTimeSelectorsEl = document.getElementById('liveTimeSelectors');
const dailyTimeSelectorsEl = document.getElementById('dailyTimeSelectors');
const dailyAccountNoteEl = document.getElementById('dailyAccountNote');
let timePickerMode = 'live';
try{
  const savedTimeKey = localStorage.getItem(TIME_STORAGE_KEY);
  const savedTimeCategory = localStorage.getItem(TIME_CATEGORY_STORAGE_KEY) || '';
  if(savedTimeKey && getTimeOption(savedTimeKey, savedTimeCategory)){
    activeTimeKey = savedTimeKey;
    activeTimeCategory = savedTimeCategory;
    timePickerMode = savedTimeCategory === 'daily' ? 'daily' : 'live';
  }
} catch(_){}
function formatTime(ms){
  if(ms < 0) ms = 0;
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if(h > 0) return h + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}
function isDailyTimeControl(){
  return activeTimeCategory === 'daily' || !!(onlineRoomTimeControl && onlineRoomTimeControl.mode === 'daily');
}
function formatDailyRemaining(ms){
  if(ms < 0) ms = 0;
  const totalMinutes = Math.ceil(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if(days > 0) return days + ' T ' + String(hours).padStart(2,'0') + ':' + String(minutes).padStart(2,'0');
  if(hours > 0) return hours + ' Std ' + String(minutes).padStart(2,'0') + ' Min';
  return Math.max(0, minutes) + ' Min';
}
function formatDailyDeadline(value){
  const timestamp = Number(value || 0);
  if(!timestamp) return '';
  try{
    return new Date(timestamp).toLocaleString('de-DE', {
      weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
    });
  } catch(_){ return ''; }
}
function getDisplayClocks(gameState){
  const g = gameState || buildGameFromHistory(viewIndex);
  if(timeMode && onlineRoomId && onlineClockSync){
    const values = {w: onlineClockSync.wMs, b: onlineClockSync.bMs};
    const active = onlineClockSync.active || g.turn;
    if(onlineClockSync.running && !onlineClockSync.timeLost && viewIndex === masterHistory.length && (active === 'w' || active === 'b')){
      values[active] = Math.max(0, values[active] - (Date.now() - onlineClockSync.syncedAtClient));
    }
    return values;
  }
  return {w: clocks.w, b: clocks.b};
}
function updateClockDisplay(gameState){
  const g = gameState || buildGameFromHistory(viewIndex);
  const shown = getDisplayClocks(g);
  const activeSide = onlineClockSync && onlineClockSync.running ? (onlineClockSync.active || g.turn) : g.turn;
  const daily = isDailyTimeControl();
  if(timeMode && daily){
    clockWEl.textContent = activeSide === 'w' ? formatDailyRemaining(shown.w) : 'Wartet';
    clockBEl.textContent = activeSide === 'b' ? formatDailyRemaining(shown.b) : 'Wartet';
  } else {
    clockWEl.textContent = timeMode ? formatTime(shown.w) : '--:--';
    clockBEl.textContent = timeMode ? formatTime(shown.b) : '--:--';
  }
  clockWEl.classList.toggle('waiting', timeMode && daily && activeSide !== 'w');
  clockBEl.classList.toggle('waiting', timeMode && daily && activeSide !== 'b');
  const deadlineText = daily && onlineClockSync ? formatDailyDeadline(onlineClockSync.deadlineAt) : '';
  clockWEl.title = deadlineText && activeSide === 'w' ? ('Zugfrist: ' + deadlineText) : '';
  clockBEl.title = deadlineText && activeSide === 'b' ? ('Zugfrist: ' + deadlineText) : '';
  clockCardW.classList.toggle('active', timeMode && activeSide === 'w' && clockRunning && viewIndex === masterHistory.length);
  clockCardB.classList.toggle('active', timeMode && activeSide === 'b' && clockRunning && viewIndex === masterHistory.length);
  if(activeSide === 'w' || activeSide === 'b') maybePlayLowTimeSound(activeSide,shown[activeSide]);
  updateTimeControlsLock();
}
function stopClock(){
  if(clockInterval){ clearInterval(clockInterval); clockInterval = null; }
  clockRunning = false;
}
function startClock(){
  if(!timeMode || timeLost || gameEnded) return;
  clockRunning = true;
  if(clockInterval) return;
  clockInterval = setInterval(() => {
    if(!clockRunning || !timeMode || timeLost || gameEnded || viewIndex !== masterHistory.length) return;
    const g = buildGameFromHistory(masterHistory.length);
    if(onlineRoomId && onlineClockSync){
      const active = onlineClockSync.active || g.turn;
      const shown = getDisplayClocks(g);
      if((active === 'w' || active === 'b') && shown[active] <= 0){
        timeLost = true;
        stopClock();
        onlineClockSync.timeLost = true;
        onlineClockSync.running = false;
        clocks = shown;
        const loser = active === 'w' ? 'Weiß' : 'Schwarz';
        const winner = active === 'w' ? 'Schwarz' : 'Weiß';
        statusEl.textContent = 'Zeit abgelaufen — ' + loser + ' verliert, ' + winner + ' gewinnt.';
        timeStatusEl.textContent = 'Zeit abgelaufen.';
        requestOnlineState();
      }
      updateClockDisplay(g);
      return;
    }
    clocks[g.turn] -= 1000;
    if(clocks[g.turn] <= 0){
      clocks[g.turn] = 0;
      timeLost = true;
      stopClock();
      const loser = g.turn === 'w' ? 'Weiß' : 'Schwarz';
      const winner = g.turn === 'w' ? 'Schwarz' : 'Weiß';
      statusEl.textContent = 'Zeit abgelaufen — ' + loser + ' verliert, ' + winner + ' gewinnt.';
      timeStatusEl.textContent = 'Zeit abgelaufen.';
    }
    updateClockDisplay(g);
  }, 1000);
}
function resetClockForNewGame(){
  clocks = {w:baseTimeMs, b:baseTimeMs};
  onlineClockSync = null;
  firstMoveDone = false;
  timeLost = false;
  lowTimeSoundWarned = {w:false,b:false};
  updateTimeStatus();
  updateTimeControlsLock();
}
function afterMoveClock(movedSide){
  if(!timeMode || timeLost) return;
  if(onlineRoomId && onlineClockSync){
    const shown = getDisplayClocks(buildGameFromHistory(masterHistory.length));
    const nextSide = movedSide === 'w' ? 'b' : 'w';
    if(isDailyTimeControl()) shown[nextSide] = baseTimeMs;
    else shown[movedSide] = Math.max(0, shown[movedSide]) + incrementMs;
    clocks = {w: shown.w, b: shown.b};
    onlineClockSync = {
      wMs: clocks.w,
      bMs: clocks.b,
      active: nextSide,
      running: true,
      timeLost: false,
      loser: '',
      winner: '',
      deadlineAt: isDailyTimeControl() ? Date.now() + baseTimeMs : null,
      serverNow: Date.now(),
      syncedAtClient: Date.now()
    };
    if(!firstMoveDone){ firstMoveDone = true; }
    startClock();
    return;
  }
  if(isDailyTimeControl()) clocks[movedSide === 'w' ? 'b' : 'w'] = baseTimeMs;
  else clocks[movedSide] += incrementMs;
  if(!firstMoveDone){ firstMoveDone = true; }
  startClock();
}
function getTimeOption(key, category){
  for(const select of timeSelects){
    if(category && select.dataset.category !== category) continue;
    const option = Array.from(select.options).find(opt => opt.value === key);
    if(option) return {select, option};
  }
  return null;
}
function isTimeControlLocked(){
  if(actualMoveCount() > 0 || firstMoveDone || clockRunning || timeLost) return true;
  if(onlineGameStarted) return true;

  /*
    Vor der Einladung gibt es noch keinen Online-Raum.
    Genau dann soll Weiß die Bedenkzeit bereits vorbereiten können.
  */
  if(!onlineRoomId) return false;

  if(!onlineConnected) return true;
  if(onlineRoleCode !== 'w' && !onlineCanSetTimeControl) return true;
  return false;
}
function updateTimeStatus(){
  if(timeStatusEl) timeStatusEl.hidden = false;
  if(timeMode){
    if(isDailyTimeControl()){
      const days = Math.round(baseTimeMs / 86400000);
      timeStatusEl.textContent = 'Gewählt: ' + activeTimeLabel + ' · nach jedem Zug erneut ' + days + (days === 1 ? ' Tag' : ' Tage') + ' Zeit';
    } else {
      const incText = incrementMs ? Math.floor(incrementMs/1000) + ' Sek/Zug' : 'ohne Inkrement';
      timeStatusEl.textContent = 'Gewählt: ' + activeTimeLabel + ' · Start: ' + formatTime(baseTimeMs) + ' · ' + incText;
    }
  } else {
    timeStatusEl.textContent = 'Keine Bedenkzeit aktiv';
  }
}
function updateTimePickerUi(){
  const dailyView = timePickerMode === 'daily';
  if(timeKindLiveBtn) timeKindLiveBtn.classList.toggle('active', !dailyView);
  if(timeKindDailyBtn) timeKindDailyBtn.classList.toggle('active', dailyView);
  if(liveTimeSelectorsEl) liveTimeSelectorsEl.hidden = dailyView;
  if(dailyTimeSelectorsEl) dailyTimeSelectorsEl.hidden = !dailyView;
  if(dailyAccountNoteEl) dailyAccountNoteEl.hidden = !dailyView || !!onlineAuthUser;
}
function setTimePickerMode(mode){
  timePickerMode = mode === 'daily' ? 'daily' : 'live';
  updateTimePickerUi();
  updateTimeControlsLock();
}
function updateTimeControlsLock(){
  const locked = isTimeControlLocked();
  timeSelects.forEach(select => {
    const dailyNeedsLogin = select.dataset.category === 'daily' && !onlineAuthUser;
    const disabled = locked || dailyNeedsLogin;
    select.disabled = disabled;
    select.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    if(select.dataset.category === 'daily'){
      select.title = dailyNeedsLogin
        ? 'Bitte zuerst registrieren oder einloggen.'
        : 'Daily Chess: Nach jedem Zug erhält der Gegner die vollständige Zugfrist.';
    }
  });
  if(timeKindLiveBtn) timeKindLiveBtn.disabled = locked;
  if(timeKindDailyBtn) timeKindDailyBtn.disabled = locked;
  if(timeLockNoteEl){
    timeLockNoteEl.hidden = true;
    timeLockNoteEl.textContent = '';
  }
  updateTimePickerUi();
  updateTimeSetupVisibility();
  updateOnlineStartButton();
}
function updateTimeSelectValues(){
  timeSelects.forEach(select => {
    if(activeTimeCategory && select.dataset.category === activeTimeCategory && activeTimeKey !== '0+0') select.value = activeTimeKey;
    else select.value = '';
    select.classList.toggle('active', !!select.value);
  });
}
function applyTimeControlFromKey(key, label, category){
  const found = getTimeOption(key, category);
  activeTimeKey = key;
  activeTimeCategory = found ? found.select.dataset.category : '';
  if(activeTimeCategory) timePickerMode = activeTimeCategory === 'daily' ? 'daily' : 'live';
  const [base, inc] = key.split('+').map(v => parseInt(v,10));
  activeTimeLabel = label || (found ? (found.option.dataset.timeLabel || found.option.textContent.trim()) : 'Keine Bedenkzeit');
  if(!base){
    timeMode = false;
    baseTimeMs = 0;
    incrementMs = 0;
    activeTimeCategory = '';
  } else {
    timeMode = true;
    baseTimeMs = base * 1000;
    incrementMs = (inc || 0) * 1000;
  }
  updateTimeSelectValues();
  updateTimeStatus();
  updateTimeControlsLock();
}
function setTimeControl(key, label, category){
  if(isTimeControlLocked()){
    const previous = statusEl.textContent;
    statusEl.textContent = onlineGameStarted ? 'Die Partie wurde bereits gestartet. Die Bedenkzeit ist gesperrt.' : 'Nur Weiß oder der Einladende kann die Bedenkzeit vor Partiestart ändern.';
    setTimeout(() => { if(statusEl.textContent === 'Die Partie wurde bereits gestartet. Die Bedenkzeit ist gesperrt.' || statusEl.textContent === 'Nur Weiß oder der Einladende kann die Bedenkzeit vor Partiestart ändern.') statusEl.textContent = previous; }, 1200);
    updateTimeControlsLock();
    updateTimeSelectValues();
    return;
  }
  if(category === 'daily' && !onlineAuthUser){
    statusEl.textContent = 'Daily Chess ist nur nach Registrierung oder Login verfügbar.';
    openAuthDialog('login');
    updateTimeControlsLock();
    updateTimeSelectValues();
    return;
  }
  if(!key){ updateTimeSelectValues(); return; }
  applyTimeControlFromKey(key, label, category);
  try{
    localStorage.setItem(TIME_STORAGE_KEY, key);
    localStorage.setItem(TIME_CATEGORY_STORAGE_KEY, activeTimeCategory);
  } catch(_){}
  newGame();
  syncCurrentTimeControlToOnline();
}
timeSelects.forEach(select => select.addEventListener('change', () => {
  setNewGameDialogStatus('');
  const option = select.selectedOptions && select.selectedOptions[0];
  setTimeControl(select.value, option ? (option.dataset.timeLabel || option.textContent.trim()) : '', select.dataset.category);
}));
if(timeKindLiveBtn) timeKindLiveBtn.addEventListener('click', () => setTimePickerMode('live'));
if(timeKindDailyBtn) timeKindDailyBtn.addEventListener('click', () => setTimePickerMode('daily'));
const initialTimeOption = getTimeOption(activeTimeKey, activeTimeCategory);
applyTimeControlFromKey(activeTimeKey, initialTimeOption?.option?.dataset.timeLabel, activeTimeCategory);
resetClockForNewGame();

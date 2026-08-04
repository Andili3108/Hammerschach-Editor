'use strict';

/* Sound */
const HAMMERSCHACH_SOUND_FILES = Object.freeze({
  pickup:'sounds/pickup.mp3',
  moveSelf:'sounds/move-self.mp3',
  moveOpponent:'sounds/move-opponent.mp3',
  capture:'sounds/capture.mp3',
  check:'sounds/check.mp3',
  castle:'sounds/castle.mp3',
  promote:'sounds/promote.mp3',
  illegal:'sounds/illegal.mp3',
  gameStart:'sounds/game-start.mp3',
  gameEnd:'sounds/game-end.mp3',
  victory:'sounds/victory.mp3',
  defeat:'sounds/defeat.mp3',
  draw:'sounds/draw.mp3',
  lowTime:'sounds/low-time.mp3'
});
const soundFallbackPlayers = Object.fromEntries(Object.entries(HAMMERSCHACH_SOUND_FILES).map(([key,url]) => {
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.playsInline = true;
  return [key,audio];
}));
const allSounds = Object.values(soundFallbackPlayers);
const soundToggleBtn = document.getElementById('soundToggleBtn');
const SOUND_STORAGE_KEY = 'hammerschachGamerSoundEnabled';
let soundEnabled = true;
let soundAudioContext = null;
let soundBufferLoadPromise = null;
const soundBuffers = new Map();
const soundWarnings = new Set();
let lastSoundGameStartToken = '';
let lastSoundGameEndToken = '';
let lowTimeSoundWarned = {w:false,b:false};
try{ soundEnabled = localStorage.getItem(SOUND_STORAGE_KEY) !== 'off'; } catch(_){}
function stopAllSounds(){ allSounds.forEach(a => { try{ a.pause(); a.currentTime = 0; } catch(_){} }); }
function soundWarnOnce(key,error){
  if(soundWarnings.has(key)) return;
  soundWarnings.add(key);
  console.warn('Hammerschach-Sound konnte nicht abgespielt werden:', key, error || 'unbekannter Fehler');
}
function getSoundAudioContext(){
  if(soundAudioContext) return soundAudioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if(!AudioContextClass) return null;
  try{ soundAudioContext = new AudioContextClass(); }
  catch(error){ soundWarnOnce('AudioContext',error); }
  return soundAudioContext;
}
function loadSoundBuffers(){
  if(soundBufferLoadPromise) return soundBufferLoadPromise;
  const context = getSoundAudioContext();
  if(!context) return Promise.resolve(false);
  soundBufferLoadPromise = Promise.all(Object.entries(HAMMERSCHACH_SOUND_FILES).map(async ([key,url]) => {
    try{
      const response = await fetch(url,{cache:'force-cache'});
      if(!response.ok) throw new Error('HTTP ' + response.status + ' für ' + url);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      soundBuffers.set(key,buffer);
    } catch(error){ soundWarnOnce(key,error); }
  })).then(() => soundBuffers.size > 0);
  return soundBufferLoadPromise;
}
function unlockSoundSystem(){
  if(!soundEnabled) return;
  const context = getSoundAudioContext();
  if(context && context.state === 'suspended'){
    const resumed = context.resume();
    if(resumed && resumed.catch) resumed.catch(error => soundWarnOnce('AudioContext-resume',error));
  }
  loadSoundBuffers();
}
document.addEventListener('pointerdown',unlockSoundSystem,{capture:true,passive:true});
document.addEventListener('keydown',unlockSoundSystem,{capture:true});
function updateSoundToggle(){
  soundToggleBtn.innerHTML = '<span class="icon-label">' + (soundEnabled ? '🔊' : '🔇') + '</span>';
  soundToggleBtn.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
  soundToggleBtn.setAttribute('aria-label', soundEnabled ? 'Ton ausschalten' : 'Ton einschalten');
  soundToggleBtn.title = soundEnabled ? 'Ton ausschalten' : 'Ton einschalten';
}
function setSoundEnabled(enabled){
  soundEnabled = !!enabled;
  try{ localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? 'on' : 'off'); } catch(_){}
  if(!soundEnabled) stopAllSounds();
  else unlockSoundSystem();
  updateSoundToggle();
}
function safePlay(key){
  if(!soundEnabled || !key) return false;
  const context = getSoundAudioContext();
  const buffer = soundBuffers.get(key);
  if(context && context.state === 'running' && buffer){
    try{
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = 0.92;
      source.connect(gain);
      gain.connect(context.destination);
      source.start(0);
      return true;
    } catch(error){ soundWarnOnce(key + '-webaudio',error); }
  }
  const audio = soundFallbackPlayers[key];
  if(!audio) return false;
  try{
    audio.currentTime = 0;
    const playing = audio.play();
    if(playing && playing.catch) playing.catch(error => {
      soundWarnOnce(key + '-htmlaudio',error);
      unlockSoundSystem();
    });
    return true;
  } catch(error){ soundWarnOnce(key + '-htmlaudio',error); }
  return false;
}
function playUiSound(key){ return safePlay(key); }
function soundGameToken(){
  return [onlineRoomId || 'local',onlineGameStartedAt || '',currentThemePly(),activeTimeKey].join('|');
}
function playGameStartSound(){
  const token = soundGameToken();
  if(token === lastSoundGameStartToken) return;
  lastSoundGameStartToken = token;
  lastSoundGameEndToken = '';
  lowTimeSoundWarned = {w:false,b:false};
  playUiSound('gameStart');
}
function playGameResultSound(result,winner){
  const token = soundGameToken();
  if(token === lastSoundGameEndToken) return;
  lastSoundGameEndToken = token;
  if(result === '1/2-1/2') return playUiSound('draw');
  const resolvedWinner = winner === 'w' || winner === 'b' ? winner : (result === '1-0' ? 'w' : result === '0-1' ? 'b' : '');
  if((onlineRoleCode === 'w' || onlineRoleCode === 'b') && resolvedWinner){
    return playUiSound(resolvedWinner === onlineRoleCode ? 'victory' : 'defeat');
  }
  playUiSound('gameEnd');
}
function maybePlayLowTimeSound(side,remainingMs){
  if(!soundEnabled || !timeMode || isDailyTimeControl() || !clockRunning || remainingMs <= 0 || remainingMs > 10000) return;
  if(onlineRoomId && onlineRoleCode !== side) return;
  if(lowTimeSoundWarned[side]) return;
  lowTimeSoundWarned[side] = true;
  playUiSound('lowTime');
}
function playMoveSound(opts){
  opts = opts || {};
  if(opts.pickup) return playUiSound('pickup');
  if(opts.check) return playUiSound('check');
  if(opts.promotion) return playUiSound('promote');
  if(opts.castle) return playUiSound('castle');
  if(opts.capture) return playUiSound('capture');
  return playUiSound(opts.opponent ? 'moveOpponent' : 'moveSelf');
}
soundToggleBtn.addEventListener('click', () => {
  const enable = !soundEnabled;
  setSoundEnabled(enable);
  if(enable) playUiSound('pickup');
});
updateSoundToggle();

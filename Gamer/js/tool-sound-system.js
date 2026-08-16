'use strict';

/* Gemeinsames Soundset für Analyzer und Trainer. */
(function(){
  const SOUND_STORAGE_KEY = 'hammerschachGamerSoundEnabled';
  const SOUND_VERSION = '20260816-3';
  const base = '../sounds/';
  const files = Object.freeze({
    pickup:'pickup.mp3',
    drop:'drop.mp3',
    moveSelf:'move-self.mp3',
    moveOpponent:'move-opponent.mp3',
    capture:'capture.mp3',
    check:'check.mp3',
    castle:'castle.mp3',
    promote:'promote.mp3',
    illegal:'illegal.mp3',
    gameStart:'game-start.mp3',
    gameEnd:'game-end.mp3',
    victory:'victory.mp3',
    defeat:'defeat.mp3',
    draw:'draw.mp3',
    lowTime:'low-time.mp3'
  });
  const players = Object.fromEntries(Object.entries(files).map(([key,file]) => {
    const audio = new Audio(base + file + '?v=' + SOUND_VERSION);
    audio.preload = 'auto';
    audio.playsInline = true;
    return [key,audio];
  }));
  let enabled = true;
  try{ enabled = localStorage.getItem(SOUND_STORAGE_KEY) !== 'off'; }catch(_){}

  function setEnabled(value){ enabled = !!value; }
  function play(key){
    if(!enabled || !key || !players[key]) return false;
    const audio = players[key];
    try{
      audio.currentTime = 0;
      const promise = audio.play();
      if(promise && promise.catch) promise.catch(() => {});
      return true;
    }catch(_){ return false; }
  }
  function playMove(options){
    const opts = options || {};
    if(opts.pickup) return play('pickup');
    if(opts.check) return play('check');
    if(opts.promotion) return play('promote');
    if(opts.castle) return play('castle');
    if(opts.capture) return play('capture');
    return play(opts.opponent ? 'moveOpponent' : 'moveSelf');
  }
  window.addEventListener('storage', event => {
    if(event.key === SOUND_STORAGE_KEY) setEnabled(event.newValue !== 'off');
  });
  window.HammerschachToolSound = Object.freeze({play,playMove,setEnabled});
})();

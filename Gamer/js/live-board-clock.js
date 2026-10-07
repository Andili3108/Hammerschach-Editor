'use strict';
// Display-only clock. PGN clock comments are move snapshots, not timestamped
// live clocks. Never derive a game result, flag fall or server state from this.
const LiveBoardClock = (() => {
  const seconds=value=>{
    const m=String(value||'').match(/^(\d{1,3}):([0-5]\d):([0-5]\d(?:\.\d+)?)$/);
    return m?Number(m[1])*3600+Number(m[2])*60+Number(m[3]):null;
  };
  const format=value=>{
    const n=Math.max(0,Math.ceil(value));
    return `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  };
  function create(){
    let identity='',position='',side=null,values={},base=null,anchor=0,running=false,estimated=false;
    const remaining=now=>base===null?null:Math.max(0,base-(running?Math.max(0,now-anchor)/1000:0));
    const pause=now=>{base=remaining(now);anchor=now;running=false;};
    return {
      reset(){identity='';position='';side=null;values={};base=null;running=false;estimated=false;},
      pause,
      update(key,game,turn,now,allowRunning){
        const nextSide=turn==='w'?'white':turn==='b'?'black':null;
        const nextPosition=JSON.stringify([game.fen,game.moves]);
        const nextValues={white:seconds(game.clocks?.white),black:seconds(game.clocks?.black)};
        const same=key===identity&&position===nextPosition&&side===nextSide&&values[nextSide]===nextValues[nextSide];
        const current=remaining(now);
        identity=key;position=nextPosition;side=nextSide;values=nextValues;
        base=same?current:values[side];anchor=now;
        running=!!(allowRunning&&!game.finished&&!game.error&&game.moves?.length&&side&&base!==null);
        if(game.finished){base=values[side];estimated=false;}
        else if(running)estimated=true;
        else if(!same)estimated=false;
      },
      read(now){
        return Object.fromEntries(['white','black'].map(color=>{
          const n=color===side?remaining(now):values[color];
          return [color,{text:n==null?'':format(n),estimated:color===side&&estimated,running:color===side&&running}];
        }));
      },
      isRunning(){return running;}
    };
  }
  return {create};
})();

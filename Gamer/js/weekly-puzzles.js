'use strict';
// Calendar and selection are independent of accounts, progress and the trainer.
window.HammerschachWeeklyPuzzles = (() => {
  const ranges = [[800,1000],[1001,1500],[1501,2000],[2001,2400]];
  function week(date = new Date()){
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const value = type => Number(parts.find(p => p.type === type).value);
    const monday = new Date(Date.UTC(value('year'),value('month')-1,value('day')));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay()+6)%7);
    return monday.toISOString().slice(0,10);
  }
  function hash(text){let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function select(all,key){
    const tiers=ranges.map(([min,max],level)=>{
      const seen=new Set();
      const pool=all.filter(p=>p && Number.isFinite(p.rating) && p.rating>=min && p.rating<=max && typeof p.id==='string' && typeof p.fen==='string' && Array.isArray(p.moves) && p.moves.length>=2 && p.moves.every(m=>/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)) && !seen.has(p.id) && seen.add(p.id)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
      if(pool.length<6)throw Error('Für diese Woche fehlen Aufgaben in einer Schwierigkeitsstufe.');
      let state=hash('gamer-weekly-v1:'+key+':'+level);
      for(let i=pool.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=Math.floor(state/4294967296*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
      return pool.slice(0,6);
    });
    return Array.from({length:24},(_,i)=>tiers[i%4][Math.floor(i/4)]);
  }
  function uciMove(game,uci){
    const from=[uci.charCodeAt(0)-97,8-Number(uci[1])],to=[uci.charCodeAt(2)-97,8-Number(uci[3])];
    const move=game.legalMoves().find(m=>m.from[0]===from[0]&&m.from[1]===from[1]&&m.to[0]===to[0]&&m.to[1]===to[1]);
    if(!move)throw Error('Diese Aufgabe enthält eine ungültige Zugfolge.');
    return {...move,promotion:uci[4]?.toUpperCase()||null};
  }
  function prepare(puzzle){
    const game=LiveBoardPosition.start(puzzle.fen,'standard');
    const first=uciMove(game,puzzle.moves[0]);game.makeMove(first,true);
    const check=game.clone();for(const uci of puzzle.moves.slice(1))check.makeMove(uciMove(check,uci),true);
    return {game,last:first};
  }
  return {week,select,uciMove,prepare};
})();

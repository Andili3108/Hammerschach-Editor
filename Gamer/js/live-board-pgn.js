'use strict';
const LiveBoardPgn = (() => {
  const clean=value=>String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').trim();
  const known=value=>{const s=clean(value);return s&&!/^[?.\s]+$/.test(s)?s:'';};
  const finished=g=>g.finished===true&&['1-0','0-1','1/2-1/2'].includes(g.result);
  function headers(g,event={}){
    const h=g.headers||{};
    const tags={Event:known(h.Event)||known(event.title)||'?',Site:known(h.Site)||'?',Date:/^[\d?]{4}\.[\d?]{2}\.[\d?]{2}$/.test(clean(h.Date))?clean(h.Date):'????.??.??',Round:known(g.round)||known(h.Round)||known(event.round)||'?',White:known(g.white)||'?',Black:known(g.black)||'?',Result:finished(g)?g.result:'*'};
    for(const key of ['WhiteElo','BlackElo','WhiteTitle','BlackTitle','WhiteTeam','BlackTeam','ECO','Opening','TimeControl'])if(known(h[key]))tags[key]=known(h[key]);
    tags.Board=clean(g.label||g.board||'?');
    if(g.fen){tags.SetUp='1';tags.FEN=clean(g.fen);}
    return tags;
  }
  function serialize(g,event){
    if(!finished(g))throw new Error('PGN steht erst nach Partieende bereit.');
    const replay=LiveBoardPosition.replay(g),tags=headers(g,event);
    const escape=value=>clean(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
    const head=Object.entries(tags).map(([key,value])=>`[${key} "${escape(value)}"]`).join('\n');
    const moves=[];
    g.moves.forEach((san,i)=>{const offset=i+(replay.firstTurn==='b'?1:0),number=replay.firstNumber+Math.floor(offset/2);if(offset%2===0)moves.push(number+'.');else if(i===0)moves.push(number+'...');moves.push(san);});
    moves.push(tags.Result);
    let line='',lines=[];for(const token of moves){if(line&&line.length+token.length+1>80){lines.push(line);line='';}line+=(line?' ':'')+token;}if(line)lines.push(line);
    return head+'\n\n'+lines.join('\n')+'\n';
  }
  function download(g,event){
    const url=URL.createObjectURL(new Blob([serialize(g,event)],{type:'application/x-chess-pgn;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=(clean(g.white)+' - '+clean(g.black)).replace(/[\\/:*?"<>|]/g,'_').slice(0,120)+'.pgn';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return {headers,finished,serialize,download};
})();

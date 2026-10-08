'use strict';
// Reuse Gamer's rule engine with a separate instance. Never touch game/history,
// online rooms, input handlers, clocks or move submission.
const LiveBoardPosition = (() => {
  function start(fen, variant){
    if(!['','standard','chess','normal'].includes(String(variant||'').toLowerCase()))throw new Error('Diese Schachvariante wird in Phase 1 noch nicht dargestellt.');
    const game=new Game({variant:GAME_VARIANT_STANDARD,backRank:STANDARD_BACK_RANK});
    if(!fen)return game;
    const parts=fen.trim().split(/\s+/),rows=parts[0].split('/');
    if(parts.length!==6||rows.length!==8||!['w','b'].includes(parts[1])||!/^(-|[KQkq]+)$/.test(parts[2])||!/^(-|[a-h][36])$/.test(parts[3])||!/^\d+$/.test(parts[4])||!/^\d+$/.test(parts[5])||Number(parts[5])<1)throw new Error('Ungültige Startstellung.');
    game.board=rows.map(row=>{
      const squares=[];
      for(const c of row){if(/[1-8]/.test(c))squares.push(...Array(Number(c)).fill('.'));else if(/[prnbqkPRNBQK]/.test(c))squares.push(c);else throw new Error('Ungültige Startstellung.');}
      if(squares.length!==8)throw new Error('Ungültige Startstellung.');return squares;
    });
    if(game.board.flat().filter(p=>p==='K').length!==1||game.board.flat().filter(p=>p==='k').length!==1)throw new Error('Ungültige Königsstellung.');
    game.turn=parts[1];game.castling=Object.fromEntries(['K','Q','k','q'].map(k=>[k,parts[2].includes(k)]));
    game.ep=parts[3]==='-'?null:['abcdefgh'.indexOf(parts[3][0]),8-Number(parts[3][1])];
    game.halfmove=Number(parts[4]);game.fullmove=Number(parts[5]);return game;
  }
  function sanMove(game,token){
    const san=token.replace(/[+#!?]+$/,'').replace(/0/g,'O');
    const legal=game.legalMoves();
    if(san==='O-O'||san==='O-O-O')return legal.find(m=>String(m.meta?.castle||'').toUpperCase()===(san==='O-O'?'K':'Q'));
    const m=san.match(/^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBN]))?$/);
    if(!m)return null;
    const matches=legal.filter(move=>{
      const piece=game.at(...move.from);
      const capture=game.at(...move.to)!=='.'||move.meta?.enpassant;
      return piece.toUpperCase()===(m[1]||'P')&&(!m[2]||'abcdefgh'[move.from[0]]===m[2])&&(!m[3]||String(8-move.from[1])===m[3])&&!!capture===!!m[4]&&coordToAlg(...move.to)===m[5]&&(!m[6]||piece.toUpperCase()==='P');
    });
    if(matches.length!==1)return null;
    const move={...matches[0]};
    const promotion=game.at(...move.from).toUpperCase()==='P'&&[0,7].includes(move.to[1]);
    if(promotion!==!!m[6])return null;
    if(m[6])move.promotion=m[6];return move;
  }
  function fen(game){
    const board=game.board.map(row=>{let out='',empty=0;for(const p of row){if(p==='.')empty++;else{if(empty)out+=empty;empty=0;out+=p;}}return out+(empty||'');}).join('/');
    const rights=['K','Q','k','q'].filter(k=>game.castling[k]).join('')||'-';
    return `${board} ${game.turn} ${rights} ${game.ep?coordToAlg(...game.ep):'-'} ${game.halfmove} ${game.fullmove}`;
  }
  function snapshot(game,last=null){return {board:clone(game.board),turn:game.turn,last,fen:fen(game)};}
  function variation(fenValue,moves){
    const game=start(fenValue,'Standard'),out=[];
    for(const token of moves.slice(0,16)){
      if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token))break;
      const from=[token.charCodeAt(0)-97,8-Number(token[1])],to=[token.charCodeAt(2)-97,8-Number(token[3])];
      const move=game.legalMoves().find(m=>m.from[0]===from[0]&&m.from[1]===from[1]&&m.to[0]===to[0]&&m.to[1]===to[1]);
      if(!move)break;
      const chosen={...move,promotion:token[4]?.toUpperCase()||null},before=game.clone();
      const number=game.fullmove,turn=game.turn;const applied=game.makeMove(chosen,true);chosen.taken=applied.taken;
      const san=moveToSan(before,chosen,game);
      out.push((turn==='w'?number+'. ':out.length===0?number+'... ':'')+san);
    }
    return out.join(' ');
  }
  function replay(data){
    if(data.error||!Array.isArray(data.moves))throw new Error(data.error||'Brettdaten fehlen.');
    const game=start(data.fen,data.variant);
    const positions=[snapshot(game)];
    const firstNumber=game.fullmove,firstTurn=game.turn;
    for(const san of data.moves){
      const move=sanMove(game,san);
      if(!move)throw new Error('Unvollständige oder ungültige Zugfolge. Die nächste Aktualisierung wird abgewartet.');
      game.makeMove(move,true);
      positions.push(snapshot(game,[move.from,move.to]));
    }
    return {positions,firstNumber,firstTurn};
  }
  return {replay,variation};
})();

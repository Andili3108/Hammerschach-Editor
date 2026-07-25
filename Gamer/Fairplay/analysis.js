(() => {
  'use strict';

  const ENGINE_VERSION='Stockfish 17.1 Lite Single';
  const CACHE_KEY='hammerschachFairplayAnalysisV1';
  const CACHE_VERSION=1;
  const GAME_VARIANT_STANDARD='standard';
  const GAME_VARIANT_FREESTYLE='freestyle960';
  const STANDARD_BACK_RANK='RNBQKBNR';
  const glyph={P:'♙',R:'♖',N:'♘',B:'♗',Q:'♕',K:'♔',p:'♟',r:'♜',n:'♞',b:'♝',q:'♛',k:'♚'};

  const boardEl=document.getElementById('chessBoard');
  const boardStartBtn=document.getElementById('boardStartBtn');
  const boardBackBtn=document.getElementById('boardBackBtn');
  const boardNextBtn=document.getElementById('boardNextBtn');
  const boardEndBtn=document.getElementById('boardEndBtn');
  const boardFlipBtn=document.getElementById('boardFlipBtn');
  const boardPlyLabel=document.getElementById('boardPlyLabel');
  const depthSelect=document.getElementById('engineDepthSelect');
  const startBtn=document.getElementById('engineStartBtn');
  const stopBtn=document.getElementById('engineStopBtn');
  const engineStatus=document.getElementById('engineStatus');
  const progressBar=document.getElementById('engineProgressBar');
  const whiteNameEl=document.getElementById('whiteAnalysisName');
  const blackNameEl=document.getElementById('blackAnalysisName');
  const whiteBestRateEl=document.getElementById('whiteBestRate');
  const blackBestRateEl=document.getElementById('blackBestRate');
  const whiteAcplEl=document.getElementById('whiteAcpl');
  const blackAcplEl=document.getElementById('blackAcpl');
  const selectedMoveTitle=document.getElementById('selectedMoveTitle');
  const selectedBestMove=document.getElementById('selectedBestMove');
  const selectedLoss=document.getElementById('selectedLoss');
  const selectedThinkTime=document.getElementById('selectedThinkTime');
  const selectedEval=document.getElementById('selectedEval');

  if(!boardEl||!startBtn||!stopBtn)return;

  const pieceSets={
    cburnett:{P:'../assets/pieces/Chess_plt45.svg',R:'../assets/pieces/Chess_rlt45.svg',N:'../assets/pieces/Chess_nlt45.svg',B:'../assets/pieces/Chess_blt45.svg',Q:'../assets/pieces/Chess_qlt45.svg',K:'../assets/pieces/Chess_klt45.svg',p:'../assets/pieces/Chess_pdt45.svg',r:'../assets/pieces/Chess_rdt45.svg',n:'../assets/pieces/Chess_ndt45.svg',b:'../assets/pieces/Chess_bdt45.svg',q:'../assets/pieces/Chess_qdt45.svg',k:'../assets/pieces/Chess_kdt45.svg'},
    merida:{P:'../assets/pieces/merida/wP.svg',R:'../assets/pieces/merida/wR.svg',N:'../assets/pieces/merida/wN.svg',B:'../assets/pieces/merida/wB.svg',Q:'../assets/pieces/merida/wQ.svg',K:'../assets/pieces/merida/wK.svg',p:'../assets/pieces/merida/bP.svg',r:'../assets/pieces/merida/bR.svg',n:'../assets/pieces/merida/bN.svg',b:'../assets/pieces/merida/bB.svg',q:'../assets/pieces/merida/bQ.svg',k:'../assets/pieces/merida/bK.svg'},
    chessnut:{P:'../assets/pieces/chessnut/wP.svg',R:'../assets/pieces/chessnut/wR.svg',N:'../assets/pieces/chessnut/wN.svg',B:'../assets/pieces/chessnut/wB.svg',Q:'../assets/pieces/chessnut/wQ.svg',K:'../assets/pieces/chessnut/wK.svg',p:'../assets/pieces/chessnut/bP.svg',r:'../assets/pieces/chessnut/bR.svg',n:'../assets/pieces/chessnut/bN.svg',b:'../assets/pieces/chessnut/bB.svg',q:'../assets/pieces/chessnut/bQ.svg',k:'../assets/pieces/chessnut/bK.svg'},
    fantasy:{P:'../assets/pieces/fantasy/wP.svg',R:'../assets/pieces/fantasy/wR.svg',N:'../assets/pieces/fantasy/wN.svg',B:'../assets/pieces/fantasy/wB.svg',Q:'../assets/pieces/fantasy/wQ.svg',K:'../assets/pieces/fantasy/wK.svg',p:'../assets/pieces/fantasy/bP.svg',r:'../assets/pieces/fantasy/bR.svg',n:'../assets/pieces/fantasy/bN.svg',b:'../assets/pieces/fantasy/bB.svg',q:'../assets/pieces/fantasy/bQ.svg',k:'../assets/pieces/fantasy/bK.svg'}
  };
  const boardColors={
    basis:{light:'#f0d9b5',dark:'#843f46'},
    braun:{light:'#f3ddb7',dark:'#b4875e'},
    grau:{light:'#eeeeee',dark:'#9b9b9b'},
    gruen:{light:'#eeeed2',dark:'#769656'}
  };

  let activePieceSet='cburnett';
  let currentGame=null;
  let currentSetup=null;
  let archivedMoves=[];
  let positions=[];
  let playedMoves=[];
  let playedUci=[];
  let viewPosition=0;
  let orientationWhite=true;
  let positionResults=[];
  let moveAnalyses=[];
  let analyzing=false;
  let runToken=0;
  let engineWorker=null;
  let engineReadyPromise=null;
  let engineReadyResolve=null;
  let engineReadyReject=null;
  let currentSearch=null;

  function applyAppearance(){
    let colorId='basis';
    let pieceId='cburnett';
    try{
      colorId=localStorage.getItem('hammerschachBoardColor')||'basis';
      pieceId=localStorage.getItem('hammerschachPieceSet')||'cburnett';
    }catch(_){}
    if(pieceId==='rhosgfx')pieceId='merida';
    activePieceSet=pieceSets[pieceId]?pieceId:'cburnett';
    const colors=boardColors[colorId]||boardColors.basis;
    document.documentElement.style.setProperty('--board-light',colors.light);
    document.documentElement.style.setProperty('--board-dark',colors.dark);
    renderBoard();
  }

  function cloneBoard(board){
    return board.map(row=>row.slice());
  }
  function pieceColor(piece){
    if(!piece||piece==='.')return null;
    return piece===piece.toUpperCase()?'w':'b';
  }
  function isValidBackRank(rank){
    rank=String(rank||'').toUpperCase();
    if(!/^[RNBQK]{8}$/.test(rank))return false;
    const rooks=[];
    const bishops=[];
    let king=-1;
    for(let index=0;index<8;index++){
      if(rank[index]==='R')rooks.push(index);
      if(rank[index]==='B')bishops.push(index);
      if(rank[index]==='K')king=index;
    }
    return rooks.length===2&&bishops.length===2&&(rank.match(/N/g)||[]).length===2&&(rank.match(/Q/g)||[]).length===1&&
      rooks[0]<king&&king<rooks[1]&&(bishops[0]%2)!==(bishops[1]%2);
  }
  function chess960BackRank(id){
    let number=Math.max(0,Math.min(959,Math.floor(Number(id)||0)));
    const rank=Array(8).fill('');
    const lightBishop=number%4;
    number=Math.floor(number/4);
    const darkBishop=number%4;
    number=Math.floor(number/4);
    const queenIndex=number%6;
    number=Math.floor(number/6);
    const knightPairs=[[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]];
    const knightPair=knightPairs[number]||knightPairs[0];
    rank[lightBishop*2+1]='B';
    rank[darkBishop*2]='B';
    let free=rank.map((piece,index)=>piece?-1:index).filter(index=>index>=0);
    rank[free[queenIndex]]='Q';
    free=rank.map((piece,index)=>piece?-1:index).filter(index=>index>=0);
    rank[free[knightPair[0]]]='N';
    rank[free[knightPair[1]]]='N';
    free=rank.map((piece,index)=>piece?-1:index).filter(index=>index>=0);
    rank[free[0]]='R';
    rank[free[1]]='K';
    rank[free[2]]='R';
    return rank.join('');
  }
  function normalizeSetup(game){
    const freestyle=String(game&&game.variant||'')===GAME_VARIANT_FREESTYLE;
    if(!freestyle)return {variant:GAME_VARIANT_STANDARD,positionId:null,backRank:STANDARD_BACK_RANK};
    let rank=String(game&&game.backRank||'').toUpperCase();
    const positionId=Number.isFinite(Number(game&&game.positionId))?Math.max(0,Math.min(959,Math.floor(Number(game.positionId)))):0;
    if(!isValidBackRank(rank))rank=chess960BackRank(positionId);
    return {variant:GAME_VARIANT_FREESTYLE,positionId,backRank:rank};
  }
  function inclusiveRange(start,end){
    const range=[];
    const step=start<=end?1:-1;
    for(let value=start;;value+=step){
      range.push(value);
      if(value===end)break;
    }
    return range;
  }
  function castlingInfo(setup,color,side){
    const rank=color==='w'?7:0;
    const kingFile=setup.backRank.indexOf('K');
    const rooks=[];
    for(let index=0;index<8;index++)if(setup.backRank[index]==='R')rooks.push(index);
    const kingSide=String(side||'').toUpperCase()==='K';
    return {
      rank,
      kingFile,
      rookFile:kingSide?rooks.find(file=>file>kingFile):rooks.filter(file=>file<kingFile).pop(),
      kingTo:kingSide?6:2,
      rookTo:kingSide?5:3
    };
  }

  function Game(setup){
    this.setup=setup;
    this.reset();
  }
  Game.prototype.reset=function(){
    const rank=this.setup.backRank;
    this.board=[
      rank.toLowerCase().split(''),
      ['p','p','p','p','p','p','p','p'],
      ['.','.','.','.','.','.','.','.','.'],
      ['.','.','.','.','.','.','.','.','.'],
      ['.','.','.','.','.','.','.','.','.'],
      ['.','.','.','.','.','.','.','.','.'],
      ['P','P','P','P','P','P','P','P'],
      rank.split('')
    ];
    this.turn='w';
    this.ep=null;
    this.castling={K:true,Q:true,k:true,q:true};
    this.halfmove=0;
    this.fullmove=1;
  };
  Game.prototype.clone=function(){
    const copy=new Game(this.setup);
    copy.board=cloneBoard(this.board);
    copy.turn=this.turn;
    copy.ep=this.ep?[this.ep[0],this.ep[1]]:null;
    copy.castling=Object.assign({},this.castling);
    copy.halfmove=this.halfmove;
    copy.fullmove=this.fullmove;
    return copy;
  };
  Game.prototype.at=function(x,y){return this.board[y][x];};
  Game.prototype.set=function(x,y,value){this.board[y][x]=value;};
  Game.prototype.inBounds=function(x,y){return x>=0&&x<8&&y>=0&&y<8;};
  Game.prototype.findKing=function(color){
    const king=color==='w'?'K':'k';
    for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(this.board[y][x]===king)return [x,y];
    return null;
  };
  Game.prototype.isAttacked=function(targetX,targetY,byColor){
    const direction=byColor==='w'?-1:1;
    const pawn=byColor==='w'?'P':'p';
    for(const dx of [-1,1]){
      const x=targetX+dx;
      const y=targetY-direction;
      if(this.inBounds(x,y)&&this.board[y][x]===pawn)return true;
    }
    const knight=byColor==='w'?'N':'n';
    for(const [dx,dy] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]){
      const x=targetX+dx;
      const y=targetY+dy;
      if(this.inBounds(x,y)&&this.board[y][x]===knight)return true;
    }
    const bishop=byColor==='w'?'B':'b';
    const rook=byColor==='w'?'R':'r';
    const queen=byColor==='w'?'Q':'q';
    const king=byColor==='w'?'K':'k';
    for(const [dx,dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
      let x=targetX+dx;
      let y=targetY+dy;
      while(this.inBounds(x,y)){
        const piece=this.board[y][x];
        if(piece!=='.'){
          if(piece===bishop||piece===queen)return true;
          break;
        }
        x+=dx;
        y+=dy;
      }
    }
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      let x=targetX+dx;
      let y=targetY+dy;
      while(this.inBounds(x,y)){
        const piece=this.board[y][x];
        if(piece!=='.'){
          if(piece===rook||piece===queen)return true;
          break;
        }
        x+=dx;
        y+=dy;
      }
    }
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      if(dx===0&&dy===0)continue;
      const x=targetX+dx;
      const y=targetY+dy;
      if(this.inBounds(x,y)&&this.board[y][x]===king)return true;
    }
    return false;
  };
  Game.prototype.pseudoLegalMovesFrom=function(x,y){
    const moves=[];
    const piece=this.at(x,y);
    if(!piece||piece==='.')return moves;
    const color=pieceColor(piece);
    const direction=color==='w'?-1:1;
    const kind=piece.toLowerCase();
    if(kind==='p'){
      const nextY=y+direction;
      if(this.inBounds(x,nextY)&&this.at(x,nextY)==='.'){
        moves.push([x,nextY,null]);
        const startRank=color==='w'?6:1;
        const doubleY=y+2*direction;
        if(y===startRank&&this.at(x,doubleY)==='.')moves.push([x,doubleY,{ep:[x,nextY]}]);
      }
      for(const dx of [-1,1]){
        const targetX=x+dx;
        const targetY=y+direction;
        if(this.inBounds(targetX,targetY)){
          const target=this.at(targetX,targetY);
          if(target!=='.'&&pieceColor(target)!==color)moves.push([targetX,targetY,null]);
        }
        if(this.ep&&this.ep[0]===targetX&&this.ep[1]===targetY)moves.push([targetX,targetY,{enpassant:true}]);
      }
    }else if(kind==='n'){
      for(const [dx,dy] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]){
        const targetX=x+dx;
        const targetY=y+dy;
        if(!this.inBounds(targetX,targetY))continue;
        const target=this.at(targetX,targetY);
        if(target==='.'||pieceColor(target)!==color)moves.push([targetX,targetY,null]);
      }
    }else if(['b','r','q'].includes(kind)){
      const directions=kind==='b'
        ? [[1,1],[1,-1],[-1,1],[-1,-1]]
        : kind==='r'
          ? [[1,0],[-1,0],[0,1],[0,-1]]
          : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
      for(const [dx,dy] of directions){
        let targetX=x+dx;
        let targetY=y+dy;
        while(this.inBounds(targetX,targetY)){
          const target=this.at(targetX,targetY);
          if(target==='.')moves.push([targetX,targetY,null]);
          else{
            if(pieceColor(target)!==color)moves.push([targetX,targetY,null]);
            break;
          }
          targetX+=dx;
          targetY+=dy;
        }
      }
    }else if(kind==='k'){
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
        if(dx===0&&dy===0)continue;
        const targetX=x+dx;
        const targetY=y+dy;
        if(!this.inBounds(targetX,targetY))continue;
        const target=this.at(targetX,targetY);
        if(target==='.'||pieceColor(target)!==color)moves.push([targetX,targetY,null]);
      }
      for(const key of color==='w'?['K','Q']:['k','q']){
        if(!this.castling[key])continue;
        const info=castlingInfo(this.setup,color,key);
        const rook=color==='w'?'R':'r';
        if(x!==info.kingFile||y!==info.rank||this.at(info.rookFile,info.rank)!==rook)continue;
        const travel=inclusiveRange(info.kingFile,info.kingTo).concat(inclusiveRange(info.rookFile,info.rookTo));
        const clear=travel.every(file=>file===info.kingFile||file===info.rookFile||this.at(file,info.rank)==='.');
        if(clear)moves.push([info.kingTo,info.rank,{castle:key,rookFile:info.rookFile,kingFile:info.kingFile,rookTo:info.rookTo}]);
      }
    }
    return moves;
  };
  Game.prototype.legalMoves=function(){
    const moves=[];
    const side=this.turn;
    const enemy=side==='w'?'b':'w';
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const piece=this.at(x,y);
      if(piece==='.'||pieceColor(piece)!==side)continue;
      for(const [targetX,targetY,meta] of this.pseudoLegalMovesFrom(x,y)){
        const simulation=this.clone();
        if(meta&&meta.castle){
          const info=castlingInfo(this.setup,side,meta.castle);
          const safe=inclusiveRange(info.kingFile,info.kingTo).every(file=>!this.isAttacked(file,info.rank,enemy));
          if(!safe)continue;
          const king=side==='w'?'K':'k';
          const rook=side==='w'?'R':'r';
          simulation.set(info.kingFile,info.rank,'.');
          simulation.set(info.rookFile,info.rank,'.');
          simulation.set(info.kingTo,info.rank,king);
          simulation.set(info.rookTo,info.rank,rook);
        }else if(meta&&meta.enpassant){
          simulation.set(targetX,y,'.');
          simulation.set(targetX,targetY,piece);
          simulation.set(x,y,'.');
        }else{
          simulation.set(targetX,targetY,piece);
          simulation.set(x,y,'.');
        }
        const king=simulation.findKing(side);
        if(king&&!simulation.isAttacked(king[0],king[1],enemy)){
          moves.push({from:[x,y],to:[targetX,targetY],meta:meta?Object.assign({},meta):{}});
        }
      }
    }
    return moves;
  };
  Game.prototype.makeMove=function(move){
    const fromX=move.from[0];
    const fromY=move.from[1];
    const toX=move.to[0];
    const toY=move.to[1];
    const piece=this.at(fromX,fromY);
    const meta=move.meta||{};
    let captured='.';
    if(meta.enpassant){
      captured=this.at(toX,fromY);
      this.set(toX,fromY,'.');
    }
    if(meta.castle){
      const color=piece==='K'?'w':'b';
      const info=castlingInfo(this.setup,color,meta.castle);
      const rook=color==='w'?'R':'r';
      this.set(info.kingFile,info.rank,'.');
      this.set(info.rookFile,info.rank,'.');
      this.set(info.kingTo,info.rank,piece);
      this.set(info.rookTo,info.rank,rook);
    }else{
      captured=this.at(toX,toY);
      this.set(toX,toY,piece);
      this.set(fromX,fromY,'.');
      if((piece==='P'&&toY===0)||(piece==='p'&&toY===7)){
        const promotion=String(move.promotion||'Q').toUpperCase();
        this.set(toX,toY,piece==='P'?promotion:promotion.toLowerCase());
      }
    }
    this.ep=null;
    const pawnMove=piece==='P'||piece==='p';
    if(pawnMove&&Math.abs(toY-fromY)===2)this.ep=[fromX,(fromY+toY)/2];
    if(piece==='K'){this.castling.K=false;this.castling.Q=false;}
    if(piece==='k'){this.castling.k=false;this.castling.q=false;}
    for(const key of ['K','Q']){
      const info=castlingInfo(this.setup,'w',key);
      if(piece==='R'&&fromY===7&&fromX===info.rookFile)this.castling[key]=false;
      if(captured==='R'&&toY===7&&toX===info.rookFile)this.castling[key]=false;
    }
    for(const key of ['k','q']){
      const info=castlingInfo(this.setup,'b',key);
      if(piece==='r'&&fromY===0&&fromX===info.rookFile)this.castling[key]=false;
      if(captured==='r'&&toY===0&&toX===info.rookFile)this.castling[key]=false;
    }
    this.halfmove=pawnMove||captured!=='.'?0:this.halfmove+1;
    if(this.turn==='b')this.fullmove+=1;
    this.turn=this.turn==='w'?'b':'w';
  };
  Game.prototype.inCheck=function(color){
    const king=this.findKing(color);
    return !!king&&this.isAttacked(king[0],king[1],color==='w'?'b':'w');
  };
  Game.prototype.gameOver=function(){
    const moves=this.legalMoves();
    if(moves.length)return null;
    return this.inCheck(this.turn)?{type:'checkmate'}:{type:'stalemate'};
  };

  function coord(square){
    const value=String(square||'').toLowerCase();
    if(!/^[a-h][1-8]$/.test(value))return null;
    return ['abcdefgh'.indexOf(value[0]),8-Number(value[1])];
  }
  function algebraic(square){
    return 'abcdefgh'[square[0]]+String(8-square[1]);
  }
  function archiveMoveToLegal(game,record){
    const from=coord(record&&record.from);
    const to=coord(record&&record.to);
    if(!from||!to)return null;
    const castle=String(record&&record.castle||'').toUpperCase();
    const legal=game.legalMoves();
    for(const candidate of legal){
      if(candidate.from[0]!==from[0]||candidate.from[1]!==from[1])continue;
      if(castle){
        if(String(candidate.meta&&candidate.meta.castle||'').toUpperCase()!==castle)continue;
      }else if(candidate.to[0]!==to[0]||candidate.to[1]!==to[1])continue;
      const move={
        from:candidate.from.slice(),
        to:candidate.to.slice(),
        meta:Object.assign({},candidate.meta||{})
      };
      const promotion=String(record&&record.promotion||'').toUpperCase();
      if(['Q','R','B','N'].includes(promotion))move.promotion=promotion;
      return move;
    }
    return null;
  }
  function moveToUci(game,move){
    if(!game||!move)return '';
    let target=move.to;
    if(move.meta&&move.meta.castle&&game.setup.variant===GAME_VARIANT_FREESTYLE){
      const info=castlingInfo(game.setup,game.turn,move.meta.castle);
      target=[info.rookFile,info.rank];
    }
    return algebraic(move.from)+algebraic(target)+(move.promotion?String(move.promotion).toLowerCase():'');
  }
  function parseUciMove(game,uci){
    const value=String(uci||'').toLowerCase();
    if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value))return null;
    const from=coord(value.slice(0,2));
    const to=coord(value.slice(2,4));
    const promotion=value.length===5?value[4].toUpperCase():'';
    for(const candidate of game.legalMoves()){
      if(candidate.from[0]!==from[0]||candidate.from[1]!==from[1])continue;
      const chess960Castle=candidate.meta&&candidate.meta.castle&&game.setup.variant===GAME_VARIANT_FREESTYLE&&
        candidate.meta.rookFile===to[0]&&candidate.to[1]===to[1];
      if(!chess960Castle&&(candidate.to[0]!==to[0]||candidate.to[1]!==to[1]))continue;
      const move={from:candidate.from.slice(),to:candidate.to.slice(),meta:Object.assign({},candidate.meta||{})};
      if(promotion)move.promotion=promotion;
      return move;
    }
    return null;
  }
  function buildSan(game,move){
    if(!game||!move)return '';
    if(move.meta&&move.meta.castle)return String(move.meta.castle).toUpperCase()==='K'?'O-O':'O-O-O';
    const piece=game.at(move.from[0],move.from[1]);
    const files='abcdefgh';
    const isPawn=String(piece||'').toUpperCase()==='P';
    const capture=game.at(move.to[0],move.to[1])!=='.'||(move.meta&&move.meta.enpassant);
    let san='';
    if(isPawn){
      san=capture?files[move.from[0]]+'x'+algebraic(move.to):algebraic(move.to);
    }else{
      let disambiguation='';
      const peers=game.legalMoves().filter(candidate=>{
        const other=game.at(candidate.from[0],candidate.from[1]);
        return candidate.to[0]===move.to[0]&&candidate.to[1]===move.to[1]&&
          String(other||'').toUpperCase()===String(piece||'').toUpperCase()&&pieceColor(other)===pieceColor(piece);
      });
      if(peers.length>1){
        const sameFile=peers.filter(candidate=>candidate.from[0]===move.from[0]).length>1;
        const sameRank=peers.filter(candidate=>candidate.from[1]===move.from[1]).length>1;
        if(!sameFile)disambiguation=files[move.from[0]];
        else if(!sameRank)disambiguation=String(8-move.from[1]);
        else disambiguation=algebraic(move.from);
      }
      san=String(piece||'').toUpperCase()+disambiguation+(capture?'x':'')+algebraic(move.to);
    }
    if(move.promotion)san+='='+String(move.promotion).toUpperCase();
    try{
      const simulation=game.clone();
      simulation.makeMove(move);
      const over=simulation.gameOver();
      if(over&&over.type==='checkmate')san+='#';
      else if(simulation.inCheck(simulation.turn))san+='+';
    }catch(_){}
    return san;
  }
  function gameToFen(game){
    const rows=[];
    for(let y=0;y<8;y++){
      let row='';
      let empty=0;
      for(let x=0;x<8;x++){
        const piece=game.at(x,y);
        if(piece==='.')empty+=1;
        else{
          if(empty){row+=String(empty);empty=0;}
          row+=piece;
        }
      }
      if(empty)row+=String(empty);
      rows.push(row);
    }
    let castling='';
    if(game.setup.variant===GAME_VARIANT_FREESTYLE){
      if(game.castling.K)castling+='abcdefgh'[castlingInfo(game.setup,'w','K').rookFile].toUpperCase();
      if(game.castling.Q)castling+='abcdefgh'[castlingInfo(game.setup,'w','Q').rookFile].toUpperCase();
      if(game.castling.k)castling+='abcdefgh'[castlingInfo(game.setup,'b','k').rookFile];
      if(game.castling.q)castling+='abcdefgh'[castlingInfo(game.setup,'b','q').rookFile];
    }else{
      if(game.castling.K)castling+='K';
      if(game.castling.Q)castling+='Q';
      if(game.castling.k)castling+='k';
      if(game.castling.q)castling+='q';
    }
    if(!castling)castling='-';
    const ep=game.ep?algebraic(game.ep):'-';
    return rows.join('/')+' '+game.turn+' '+castling+' '+ep+' '+game.halfmove+' '+game.fullmove;
  }
  function reconstruct(game){
    const setup=normalizeSetup(game);
    const records=Array.isArray(game&&game.moves)?game.moves:[];
    const state=new Game(setup);
    const builtPositions=[state.clone()];
    const builtMoves=[];
    const builtUci=[];
    for(let index=0;index<records.length;index++){
      const record=records[index]||{};
      if(record.side&&record.side!==state.turn){
        throw new Error('Zugfolge ist bei Halbzug '+(index+1)+' nicht konsistent.');
      }
      const move=archiveMoveToLegal(state,record);
      if(!move){
        throw new Error('Halbzug '+(index+1)+' ('+String(record.san||record.from+'–'+record.to)+') konnte nicht rekonstruiert werden.');
      }
      builtUci.push(moveToUci(state,move));
      builtMoves.push(move);
      state.makeMove(move);
      builtPositions.push(state.clone());
    }
    return {setup,records,positions:builtPositions,moves:builtMoves,uci:builtUci};
  }

  function clearNode(node){
    while(node&&node.firstChild)node.removeChild(node.firstChild);
  }
  function appendPiece(square,piece){
    const path=(pieceSets[activePieceSet]||pieceSets.cburnett)[piece];
    if(!path){
      square.appendChild(document.createTextNode(glyph[piece]||''));
      return;
    }
    const image=document.createElement('img');
    image.className='piece-img';
    image.src=path;
    image.alt=glyph[piece]||piece;
    image.addEventListener('error',()=>{
      const fallback=document.createElement('span');
      fallback.className='piece-glyph';
      fallback.textContent=glyph[piece]||piece;
      image.replaceWith(fallback);
    },{once:true});
    square.appendChild(image);
  }
  function renderBoard(){
    if(!boardEl)return;
    clearNode(boardEl);
    if(!positions.length){
      boardPlyLabel.textContent='Keine Partie geladen';
      return;
    }
    viewPosition=Math.max(0,Math.min(positions.length-1,viewPosition));
    const position=positions[viewPosition];
    const played=viewPosition<playedMoves.length?playedMoves[viewPosition]:null;
    const recommendation=positionResults[viewPosition]&&positionResults[viewPosition].bestmove
      ? parseUciMove(position,positionResults[viewPosition].bestmove)
      : null;
    for(let displayY=0;displayY<8;displayY++)for(let displayX=0;displayX<8;displayX++){
      const x=orientationWhite?displayX:7-displayX;
      const y=orientationWhite?displayY:7-displayY;
      const square=document.createElement('div');
      square.className='square '+(((x+y)%2===0)?'light':'dark');
      if(played&&played.from[0]===x&&played.from[1]===y)square.classList.add('actual-from');
      if(played&&played.to[0]===x&&played.to[1]===y)square.classList.add('actual-to');
      if(recommendation&&recommendation.from[0]===x&&recommendation.from[1]===y)square.classList.add('engine-from');
      if(recommendation&&recommendation.to[0]===x&&recommendation.to[1]===y)square.classList.add('engine-to');
      const piece=position.at(x,y);
      if(piece!=='.')appendPiece(square,piece);
      if(displayY===7){
        const file=document.createElement('span');
        file.className='coord-file';
        file.textContent=orientationWhite?'abcdefgh'[displayX]:'hgfedcba'[displayX];
        square.appendChild(file);
      }
      if(displayX===0){
        const rank=document.createElement('span');
        rank.className='coord-rank';
        rank.textContent=orientationWhite?String(8-displayY):String(displayY+1);
        square.appendChild(rank);
      }
      boardEl.appendChild(square);
    }
    if(viewPosition<archivedMoves.length){
      const record=archivedMoves[viewPosition]||{};
      const ply=Math.max(1,Number(record.ply)||viewPosition+1);
      const number=Math.ceil(ply/2)+(record.side==='b'?'…':'.');
      boardPlyLabel.textContent='Vor '+number+' '+String(record.san||record.from+'–'+record.to)+' · '+(record.side==='b'?'Schwarz':'Weiß')+' am Zug';
    }else{
      boardPlyLabel.textContent='Endstellung · '+archivedMoves.length+' Halbzüge';
    }
    boardStartBtn.disabled=viewPosition<=0;
    boardBackBtn.disabled=viewPosition<=0;
    boardNextBtn.disabled=viewPosition>=positions.length-1;
    boardEndBtn.disabled=viewPosition>=positions.length-1;
    document.querySelectorAll('#movesBody tr.move-row').forEach((row,index)=>row.classList.toggle('selected',index===viewPosition));
    renderSelectedMove();
  }

  function setViewPosition(index){
    viewPosition=Math.max(0,Math.min(positions.length-1,Number(index)||0));
    renderBoard();
    const selected=document.querySelector('#movesBody tr.move-row.selected');
    if(selected)selected.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function formatDuration(value){
    if(value===null||value===undefined||value==='')return '–';
    const seconds=Math.max(0,Math.floor(Number(value)/1000));
    const days=Math.floor(seconds/86400);
    const hours=Math.floor((seconds%86400)/3600);
    const minutes=Math.floor((seconds%3600)/60);
    const rest=seconds%60;
    if(days)return days+' T '+hours+' Std '+minutes+' Min';
    if(hours)return hours+' Std '+minutes+' Min '+rest+' Sek';
    if(minutes)return minutes+' Min '+rest+' Sek';
    return rest+' Sek';
  }
  function scoreNumber(result){
    if(!result)return null;
    if(Number.isFinite(Number(result.scoreCp)))return Number(result.scoreCp);
    if(Number.isFinite(Number(result.scoreMate))){
      const mate=Number(result.scoreMate);
      return mate>0?100000-Math.min(99000,Math.abs(mate)*100):-100000+Math.min(99000,Math.abs(mate)*100);
    }
    return null;
  }
  function formatEvaluation(result){
    if(!result)return '–';
    if(Number.isFinite(Number(result.scoreMate)))return '#'+Number(result.scoreMate);
    if(Number.isFinite(Number(result.scoreCp))){
      const pawns=Number(result.scoreCp)/100;
      return (pawns>0?'+':'')+pawns.toFixed(2);
    }
    return '–';
  }
  function movesEquivalent(position,firstUci,secondUci){
    const first=parseUciMove(position,firstUci);
    const second=parseUciMove(position,secondUci);
    if(!first||!second)return String(firstUci||'').toLowerCase()===String(secondUci||'').toLowerCase();
    const firstCastle=String(first.meta&&first.meta.castle||'').toUpperCase();
    const secondCastle=String(second.meta&&second.meta.castle||'').toUpperCase();
    return first.from[0]===second.from[0]&&first.from[1]===second.from[1]&&
      first.to[0]===second.to[0]&&first.to[1]===second.to[1]&&firstCastle===secondCastle&&
      String(first.promotion||'').toUpperCase()===String(second.promotion||'').toUpperCase();
  }
  function bestMoveLabel(position,result){
    if(!position||!result||!result.bestmove)return '–';
    const move=parseUciMove(position,result.bestmove);
    return move?(buildSan(position,move)+' · '+result.bestmove):result.bestmove;
  }
  function qualityFor(analysis){
    if(!analysis)return {label:'Nicht analysiert',className:''};
    if(analysis.bestMatch)return {label:'Bestzug',className:'best'};
    if(analysis.lossCp<=25)return {label:'Sehr genau',className:'best'};
    if(analysis.lossCp<=60)return {label:'Gut',className:'good'};
    if(analysis.lossCp<=120)return {label:'Ungenau',className:'inaccuracy'};
    if(analysis.lossCp<=250)return {label:'Fehler',className:'mistake'};
    return {label:'Grober Fehler',className:'mistake'};
  }
  function deriveMoveAnalyses(){
    moveAnalyses=archivedMoves.map((record,index)=>{
      const before=positionResults[index];
      const after=positionResults[index+1];
      const beforeScore=scoreNumber(before);
      const afterScore=scoreNumber(after);
      if(beforeScore===null||afterScore===null)return null;
      const rawLoss=Math.max(0,beforeScore-(-afterScore));
      return {
        index,
        side:record&&record.side==='b'?'b':'w',
        bestMatch:movesEquivalent(positions[index],playedUci[index],before&&before.bestmove),
        lossCp:Math.round(Math.min(2000,rawLoss)),
        lossCapped:rawLoss>2000,
        bestmove:before&&before.bestmove||'',
        evaluation:before
      };
    });
  }
  function renderTableAnalysis(){
    archivedMoves.forEach((record,index)=>{
      const qualityCell=document.querySelector('[data-engine-quality="'+index+'"]');
      const bestCell=document.querySelector('[data-engine-best-move="'+index+'"]');
      const analysis=moveAnalyses[index];
      if(qualityCell){
        clearNode(qualityCell);
        const quality=qualityFor(analysis);
        const pill=document.createElement('span');
        pill.className='quality-pill'+(quality.className?' '+quality.className:'');
        pill.textContent=quality.label;
        if(analysis)pill.title=(analysis.lossCapped?'Mindestens ':'')+analysis.lossCp+' Zentibauern Bewertungsverlust';
        qualityCell.appendChild(pill);
      }
      if(bestCell)bestCell.textContent=analysis?bestMoveLabel(positions[index],analysis.evaluation):'–';
    });
  }
  function renderPlayerSummary(){
    const summaries={w:{total:0,best:0,loss:0},b:{total:0,best:0,loss:0}};
    moveAnalyses.forEach(analysis=>{
      if(!analysis)return;
      const summary=summaries[analysis.side];
      summary.total+=1;
      if(analysis.bestMatch)summary.best+=1;
      summary.loss+=analysis.lossCp;
    });
    const render=(summary,bestEl,lossEl)=>{
      if(!summary.total){
        bestEl.textContent='–';
        lossEl.textContent='–';
        return;
      }
      bestEl.textContent=summary.best+'/'+summary.total+' · '+Math.round(summary.best/summary.total*100)+' %';
      lossEl.textContent=Math.round(summary.loss/summary.total)+' cp';
    };
    render(summaries.w,whiteBestRateEl,whiteAcplEl);
    render(summaries.b,blackBestRateEl,blackAcplEl);
  }
  function renderSelectedMove(){
    if(viewPosition>=archivedMoves.length){
      selectedMoveTitle.textContent='Endstellung';
      selectedBestMove.textContent='–';
      selectedLoss.textContent='–';
      selectedThinkTime.textContent='–';
      selectedEval.textContent=formatEvaluation(positionResults[viewPosition]);
      return;
    }
    const record=archivedMoves[viewPosition]||{};
    const analysis=moveAnalyses[viewPosition];
    const ply=Math.max(1,Number(record.ply)||viewPosition+1);
    const number=Math.ceil(ply/2)+(record.side==='b'?'…':'.');
    selectedMoveTitle.textContent=number+' '+String(record.san||record.from+'–'+record.to)+' · '+(record.side==='b'?'Schwarz':'Weiß');
    selectedBestMove.textContent=analysis?bestMoveLabel(positions[viewPosition],analysis.evaluation):'–';
    selectedLoss.textContent=analysis?(analysis.lossCapped?'≥ ':'')+(analysis.lossCp/100).toFixed(2)+' Bauern':'–';
    selectedThinkTime.textContent=formatDuration(record.thinkTimeMs);
    selectedEval.textContent=analysis?formatEvaluation(analysis.evaluation):'–';
  }
  function renderAnalysis(){
    deriveMoveAnalyses();
    renderTableAnalysis();
    renderPlayerSummary();
    renderBoard();
    updateProgress();
  }
  function analyzedPositionCount(){
    return positionResults.reduce((count,result)=>count+(result?1:0),0);
  }
  function analysisComplete(){
    return positions.length>0&&positionResults.length===positions.length&&positionResults.every(Boolean);
  }
  function updateProgress(){
    const total=positions.length;
    const done=analyzedPositionCount();
    progressBar.style.width=(total?Math.round(done/total*100):0)+'%';
    startBtn.textContent=analysisComplete()?'Neu analysieren':done?'Analyse fortsetzen':'Analyse starten';
  }

  function gameSignature(){
    const input=[
      currentGame&&currentGame.roomId||'',
      currentSetup&&currentSetup.variant||'',
      currentSetup&&currentSetup.backRank||'',
      archivedMoves.map(move=>[move.from,move.to,move.promotion||'',move.castle||''].join('')).join('|')
    ].join('||');
    let hash=2166136261;
    for(let index=0;index<input.length;index++){
      hash^=input.charCodeAt(index);
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(16);
  }
  function readCache(){
    try{
      const parsed=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');
      if(parsed&&parsed.version===CACHE_VERSION&&Array.isArray(parsed.entries))return parsed;
    }catch(_){}
    return {version:CACHE_VERSION,entries:[]};
  }
  function cacheIdentity(){
    return {
      roomId:String(currentGame&&currentGame.roomId||''),
      signature:gameSignature(),
      depth:Number(depthSelect.value)||14,
      engineVersion:ENGINE_VERSION
    };
  }
  function loadCachedAnalysis(){
    positionResults=Array(positions.length).fill(null);
    if(!currentGame||!positions.length)return;
    const identity=cacheIdentity();
    const cache=readCache();
    const entry=cache.entries.find(item=>item&&item.roomId===identity.roomId&&item.signature===identity.signature&&
      Number(item.depth)===identity.depth&&item.engineVersion===identity.engineVersion);
    if(entry&&Array.isArray(entry.positionResults)){
      positionResults=Array.from({length:positions.length},(_,index)=>{
        const result=entry.positionResults[index];
        return result&&typeof result==='object'?result:null;
      });
    }
    renderAnalysis();
    const done=analyzedPositionCount();
    if(analysisComplete())setEngineStatus('Gespeicherte Analyse geladen · Tiefe '+identity.depth+'.');
    else if(done)setEngineStatus('Teilweise Analyse geladen: '+done+' von '+positions.length+' Stellungen.');
    else setEngineStatus('Die Engine wird erst nach einem Klick auf „Analyse starten“ geladen.');
  }
  function saveCachedAnalysis(){
    if(!currentGame||!positions.length)return;
    const identity=cacheIdentity();
    const cache=readCache();
    cache.entries=cache.entries.filter(item=>!(item&&item.roomId===identity.roomId&&item.signature===identity.signature&&
      Number(item.depth)===identity.depth&&item.engineVersion===identity.engineVersion));
    cache.entries.unshift(Object.assign({},identity,{
      positionResults:positionResults.slice(0,positions.length),
      updatedAt:new Date().toISOString()
    }));
    cache.entries=cache.entries.slice(0,12);
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache));}catch(_){}
  }

  function setEngineStatus(message){
    engineStatus.textContent=message||'';
  }
  function setBusy(busy){
    analyzing=!!busy;
    startBtn.disabled=analyzing||!currentGame;
    stopBtn.disabled=!analyzing;
    depthSelect.disabled=analyzing;
  }
  function destroyEngine(message){
    runToken+=1;
    if(currentSearch){
      currentSearch.reject(new Error('ANALYSIS_CANCELLED'));
      currentSearch=null;
    }
    if(engineWorker){
      try{engineWorker.terminate();}catch(_){}
    }
    engineWorker=null;
    engineReadyPromise=null;
    engineReadyResolve=null;
    engineReadyReject=null;
    setBusy(false);
    if(message)setEngineStatus(message);
  }
  function ensureEngine(){
    if(engineReadyPromise)return engineReadyPromise;
    setEngineStatus('Stockfish wird geladen…');
    engineReadyPromise=new Promise((resolve,reject)=>{
      engineReadyResolve=resolve;
      engineReadyReject=reject;
      let worker;
      try{
        worker=new Worker('./engine/stockfish.js');
      }catch(error){
        reject(new Error('Der Stockfish-Worker konnte nicht gestartet werden.'));
        return;
      }
      engineWorker=worker;
      const timeout=setTimeout(()=>{
        if(engineReadyReject)engineReadyReject(new Error('Stockfish hat nicht rechtzeitig geantwortet.'));
        destroyEngine();
      },15000);
      worker.onmessage=event=>{
        const line=String(event&&event.data||'').trim();
        if(!line)return;
        if(line==='uciok'){
          worker.postMessage('setoption name Threads value 1');
          worker.postMessage('setoption name Hash value 32');
          worker.postMessage('setoption name MultiPV value 1');
          worker.postMessage('setoption name UCI_ShowWDL value false');
          worker.postMessage('isready');
          return;
        }
        if(line==='readyok'){
          clearTimeout(timeout);
          const ready=engineReadyResolve;
          engineReadyResolve=null;
          engineReadyReject=null;
          if(ready)ready();
          return;
        }
        if(line.startsWith('info ')){
          handleEngineInfo(line);
          return;
        }
        if(line.startsWith('bestmove ')){
          finishEngineSearch(line);
        }
      };
      worker.onerror=event=>{
        clearTimeout(timeout);
        const error=new Error(event&&event.message?'Stockfish-Fehler: '+event.message:'Stockfish konnte nicht ausgeführt werden.');
        if(currentSearch){
          currentSearch.reject(error);
          currentSearch=null;
        }else if(engineReadyReject){
          engineReadyReject(error);
          engineReadyReject=null;
        }
        destroyEngine();
      };
      worker.postMessage('uci');
    });
    return engineReadyPromise;
  }
  function handleEngineInfo(line){
    if(!currentSearch)return;
    const tokens=line.split(/\s+/);
    const result={};
    for(let index=1;index<tokens.length;index++){
      const token=tokens[index];
      if(token==='depth'&&index+1<tokens.length)result.depth=Number(tokens[++index]);
      else if(token==='multipv'&&index+1<tokens.length)result.multipv=Number(tokens[++index]);
      else if(token==='score'&&index+2<tokens.length){
        const type=tokens[++index];
        const value=Number(tokens[++index]);
        if(type==='cp')result.scoreCp=value;
        if(type==='mate')result.scoreMate=value;
      }else if(token==='nodes'&&index+1<tokens.length)result.nodes=Number(tokens[++index]);
      else if(token==='pv'){
        result.pv=tokens.slice(index+1);
        break;
      }
    }
    if((result.multipv||1)!==1)return;
    if(!currentSearch.info||Number(result.depth||0)>=Number(currentSearch.info.depth||0)){
      currentSearch.info=Object.assign({},currentSearch.info||{},result);
    }
  }
  function finishEngineSearch(line){
    if(!currentSearch)return;
    const search=currentSearch;
    currentSearch=null;
    const parts=line.split(/\s+/);
    const bestmove=parts[1]&&parts[1]!=='(none)'?parts[1]:'';
    const result=Object.assign({},search.info||{},{
      bestmove,
      depth:Number(search.info&&search.info.depth||search.depth||0)
    });
    search.resolve(result);
  }
  function analyzePosition(position,depth,token,index,total){
    return new Promise((resolve,reject)=>{
      if(!engineWorker){
        reject(new Error('Stockfish ist nicht bereit.'));
        return;
      }
      if(token!==runToken){
        reject(new Error('ANALYSIS_CANCELLED'));
        return;
      }
      currentSearch={resolve,reject,info:null,depth};
      setEngineStatus('Analysiere Stellung '+(index+1)+' von '+total+' · Tiefe '+depth+'…');
      engineWorker.postMessage('setoption name UCI_Chess960 value '+(currentSetup.variant===GAME_VARIANT_FREESTYLE?'true':'false'));
      engineWorker.postMessage('position fen '+gameToFen(position));
      engineWorker.postMessage('go depth '+depth);
    });
  }
  async function startAnalysis(){
    if(!currentGame||!positions.length||analyzing)return;
    if(analysisComplete())positionResults=Array(positions.length).fill(null);
    const token=++runToken;
    const depth=Math.max(8,Math.min(20,Number(depthSelect.value)||14));
    setBusy(true);
    renderAnalysis();
    try{
      await ensureEngine();
      if(token!==runToken)throw new Error('ANALYSIS_CANCELLED');
      engineWorker.postMessage('ucinewgame');
      for(let index=0;index<positions.length;index++){
        if(token!==runToken)throw new Error('ANALYSIS_CANCELLED');
        if(positionResults[index])continue;
        const result=await analyzePosition(positions[index],depth,token,index,positions.length);
        if(token!==runToken)throw new Error('ANALYSIS_CANCELLED');
        positionResults[index]=result;
        saveCachedAnalysis();
        renderAnalysis();
      }
      saveCachedAnalysis();
      setEngineStatus('Analyse abgeschlossen: '+positions.length+' Stellungen · Tiefe '+depth+'.');
    }catch(error){
      if(error&&error.message==='ANALYSIS_CANCELLED'){
        setEngineStatus('Analyse unterbrochen. Der bisherige Fortschritt wurde lokal gespeichert.');
      }else{
        console.error(error);
        destroyEngine();
        setEngineStatus(error&&error.message?error.message:'Die Stockfish-Analyse ist fehlgeschlagen.');
      }
    }finally{
      if(token===runToken)setBusy(false);
      renderAnalysis();
    }
  }
  function stopAnalysis(){
    if(!analyzing)return;
    saveCachedAnalysis();
    destroyEngine('Analyse unterbrochen. Der bisherige Fortschritt wurde lokal gespeichert.');
    renderAnalysis();
  }

  function bindRows(){
    document.querySelectorAll('#movesBody tr.move-row').forEach((row,index)=>{
      row.addEventListener('click',()=>setViewPosition(index));
    });
  }
  function loadGame(game){
    destroyEngine();
    currentGame=game&&typeof game==='object'?game:null;
    archivedMoves=[];
    positions=[];
    playedMoves=[];
    playedUci=[];
    positionResults=[];
    moveAnalyses=[];
    viewPosition=0;
    if(!currentGame){
      setEngineStatus('Keine Partie geladen.');
      renderBoard();
      return;
    }
    whiteNameEl.textContent=String(currentGame.whiteName||'Weiß');
    blackNameEl.textContent=String(currentGame.blackName||'Schwarz');
    try{
      const reconstructed=reconstruct(currentGame);
      currentSetup=reconstructed.setup;
      archivedMoves=reconstructed.records;
      positions=reconstructed.positions;
      playedMoves=reconstructed.moves;
      playedUci=reconstructed.uci;
      bindRows();
      loadCachedAnalysis();
      setBusy(false);
    }catch(error){
      currentSetup=null;
      positions=[];
      setBusy(false);
      setEngineStatus(error&&error.message?error.message:'Die Partie konnte nicht auf dem Brett rekonstruiert werden.');
      renderAnalysis();
    }
  }

  boardStartBtn.addEventListener('click',()=>setViewPosition(0));
  boardBackBtn.addEventListener('click',()=>setViewPosition(viewPosition-1));
  boardNextBtn.addEventListener('click',()=>setViewPosition(viewPosition+1));
  boardEndBtn.addEventListener('click',()=>setViewPosition(positions.length-1));
  boardFlipBtn.addEventListener('click',()=>{
    orientationWhite=!orientationWhite;
    renderBoard();
  });
  startBtn.addEventListener('click',startAnalysis);
  stopBtn.addEventListener('click',stopAnalysis);
  depthSelect.addEventListener('change',()=>{
    if(analyzing)stopAnalysis();
    loadCachedAnalysis();
  });
  document.addEventListener('hammerschach-fairplay-game-rendered',event=>{
    loadGame(event&&event.detail&&event.detail.game);
  });
  document.addEventListener('hammerschach-fairplay-visibility-change',event=>{
    if(!(event&&event.detail&&event.detail.visible)&&analyzing){
      stopAnalysis();
    }else if(!(event&&event.detail&&event.detail.visible)&&engineWorker){
      destroyEngine('Stockfish ist pausiert. Vorhandene Ergebnisse bleiben erhalten.');
    }
  });
  window.addEventListener('storage',event=>{
    if(event.key==='hammerschachBoardColor'||event.key==='hammerschachPieceSet')applyAppearance();
  });
  window.addEventListener('pagehide',()=>{
    saveCachedAnalysis();
    destroyEngine();
  });
  window.addEventListener('beforeunload',()=>{
    saveCachedAnalysis();
    destroyEngine();
  });

  window.HammerschachFairplayEngine={
    loadGame,
    stop:stopAnalysis
  };
  applyAppearance();
  if(window.hammerschachFairplayPendingGame)loadGame(window.hammerschachFairplayPendingGame);
})();

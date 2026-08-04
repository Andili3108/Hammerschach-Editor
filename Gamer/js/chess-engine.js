'use strict';

function Game(setup){ this.reset(setup); }
Game.prototype.reset = function(setup){
  const normalizedSetup = normalizeGameSetup(setup || currentGameSetup);
  this.setup = {
    variant:normalizedSetup.variant,
    positionId:normalizedSetup.positionId,
    backRank:normalizedSetup.backRank,
    theme:null
  };
  const backRank = this.setup.backRank || STANDARD_BACK_RANK;
  this.variant = this.setup.variant;
  this.startBackRank = backRank;
  this.castleInfo = castlingInfoFromBackRank(backRank);
  this.board = [
    blackBackRankFromWhite(backRank).split(''),
    ['p','p','p','p','p','p','p','p'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['.','.','.','.','.','.','.','.'],
    ['P','P','P','P','P','P','P','P'],
    backRank.split('')
  ];
  this.turn = 'w';
  this.ep = null;
  this.castling = {K:true,Q:true,k:true,q:true};
  this.halfmove = 0;
  this.fullmove = 1;
};
Game.prototype.clone = function(){
  const g = new Game(this.setup);
  g.setup = normalizeGameSetup(this.setup);
  g.variant = this.variant;
  g.startBackRank = this.startBackRank;
  g.castleInfo = clone(this.castleInfo);
  g.board = clone(this.board);
  g.turn = this.turn;
  g.ep = this.ep ? [this.ep[0], this.ep[1]] : null;
  g.castling = Object.assign({}, this.castling);
  g.halfmove = this.halfmove;
  g.fullmove = this.fullmove;
  return g;
};
Game.prototype.inBounds = function(x,y){ return x>=0 && x<8 && y>=0 && y<8; };
Game.prototype.at = function(x,y){ return this.board[y][x]; };
Game.prototype.set = function(x,y,v){ this.board[y][x] = v; };
Game.prototype.findKing = function(color){
  const king = color === 'w' ? 'K' : 'k';
  for(let y=0;y<8;y++) for(let x=0;x<8;x++) if(this.board[y][x] === king) return [x,y];
  return null;
};
Game.prototype.isAttacked = function(tx,ty,byColor){
  const dir = byColor === 'w' ? -1 : 1;
  const pawn = byColor === 'w' ? 'P' : 'p';
  for(const dx of [-1,1]){
    const x = tx + dx;
    const y = ty - dir;
    if(this.inBounds(x,y) && this.at(x,y) === pawn) return true;
  }
  const knight = byColor === 'w' ? 'N' : 'n';
  for(const [dx,dy] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]){
    const x = tx + dx, y = ty + dy;
    if(this.inBounds(x,y) && this.at(x,y) === knight) return true;
  }
  const bishop = byColor === 'w' ? 'B' : 'b';
  const rook = byColor === 'w' ? 'R' : 'r';
  const queen = byColor === 'w' ? 'Q' : 'q';
  const king = byColor === 'w' ? 'K' : 'k';
  for(const [dx,dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    let x = tx + dx, y = ty + dy;
    while(this.inBounds(x,y)){
      const p = this.at(x,y);
      if(p !== '.'){
        if(p === bishop || p === queen) return true;
        break;
      }
      x += dx; y += dy;
    }
  }
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    let x = tx + dx, y = ty + dy;
    while(this.inBounds(x,y)){
      const p = this.at(x,y);
      if(p !== '.'){
        if(p === rook || p === queen) return true;
        break;
      }
      x += dx; y += dy;
    }
  }
  for(let dx=-1; dx<=1; dx++) for(let dy=-1; dy<=1; dy++){
    if(dx===0 && dy===0) continue;
    const x = tx + dx, y = ty + dy;
    if(this.inBounds(x,y) && this.at(x,y) === king) return true;
  }
  return false;
};
Game.prototype.inCheck = function(color){
  const kp = this.findKing(color);
  return !!(kp && this.isAttacked(kp[0], kp[1], opposite(color)));
};
Game.prototype.castleMove = function(color, side){
  const colorInfo = this.castleInfo && this.castleInfo[color];
  if(!colorInfo) return null;
  const info = colorInfo[side];
  if(!info) return null;
  const key = info.key;
  const rank = color === 'w' ? 7 : 0;
  const king = color === 'w' ? 'K' : 'k';
  const rook = color === 'w' ? 'R' : 'r';
  const kingFrom = colorInfo.kingFile;
  const rookFrom = info.rookFile;
  const kingTo = info.kingTo;
  const rookTo = info.rookTo;
  if(!this.castling[key]) return null;
  if(!Number.isInteger(kingFrom) || !Number.isInteger(rookFrom)) return null;
  if(this.at(kingFrom, rank) !== king || this.at(rookFrom, rank) !== rook) return null;
  for(const xx of rangeBetweenExclusive(kingFrom, rookFrom)){
    if(this.at(xx, rank) !== '.') return null;
  }
  const mayOccupy = xx => xx === kingFrom || xx === rookFrom || this.at(xx, rank) === '.';
  for(const xx of rangeBetweenInclusive(kingFrom, kingTo)){
    if(!mayOccupy(xx)) return null;
  }
  for(const xx of rangeBetweenInclusive(rookFrom, rookTo)){
    if(!mayOccupy(xx)) return null;
  }
  /* Im Freestyle wird die Rochade eindeutig als König-auf-Turm-Eingabe
     dargestellt. So bleibt z. B. Kf1-g1 ein normaler Königszug, während
     Kf1-h1 eindeutig die kurze Rochade auslöst. */
  const displayTo = this.variant === GAME_VARIANT_FREESTYLE
    ? rookFrom
    : (kingTo === kingFrom ? rookFrom : kingTo);
  return {from:[kingFrom,rank], to:[displayTo,rank], meta:{castle:key, kingFrom, kingTo, rookFrom, rookTo}};
};
Game.prototype.pseudoLegalMovesFrom = function(x,y){
  const moves = [];
  const p = this.at(x,y);
  if(!p || p === '.') return moves;
  const color = pieceColor(p);
  const piece = p.toLowerCase();
  const dir = color === 'w' ? -1 : 1;

  if(piece === 'p'){
    const ny = y + dir;
    if(this.inBounds(x,ny) && this.at(x,ny) === '.'){
      moves.push({from:[x,y], to:[x,ny], meta:{}});
      const start = color === 'w' ? 6 : 1;
      const ny2 = y + 2*dir;
      if(y === start && this.inBounds(x,ny2) && this.at(x,ny2) === '.'){
        moves.push({from:[x,y], to:[x,ny2], meta:{ep:[x,ny]}});
      }
    }
    for(const dx of [-1,1]){
      const nx = x + dx, nyc = y + dir;
      if(this.inBounds(nx,nyc)){
        const t = this.at(nx,nyc);
        if(t !== '.' && pieceColor(t) !== color) moves.push({from:[x,y], to:[nx,nyc], meta:{}});
      }
      if(this.ep && this.ep[0] === x + dx && this.ep[1] === y + dir){
        moves.push({from:[x,y], to:[x+dx,y+dir], meta:{enpassant:true}});
      }
    }
  } else if(piece === 'n'){
    for(const [dx,dy] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]){
      const nx = x + dx, ny = y + dy;
      if(!this.inBounds(nx,ny)) continue;
      const t = this.at(nx,ny);
      if(t === '.' || pieceColor(t) !== color) moves.push({from:[x,y], to:[nx,ny], meta:{}});
    }
  } else if(['b','r','q'].includes(piece)){
    const dirs = piece === 'b' ? [[1,1],[1,-1],[-1,1],[-1,-1]] : piece === 'r' ? [[1,0],[-1,0],[0,1],[0,-1]] : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    for(const [dx,dy] of dirs){
      let nx = x + dx, ny = y + dy;
      while(this.inBounds(nx,ny)){
        const t = this.at(nx,ny);
        if(t === '.') moves.push({from:[x,y], to:[nx,ny], meta:{}});
        else {
          if(pieceColor(t) !== color) moves.push({from:[x,y], to:[nx,ny], meta:{}});
          break;
        }
        nx += dx; ny += dy;
      }
    }
  } else if(piece === 'k'){
    for(let dx=-1; dx<=1; dx++) for(let dy=-1; dy<=1; dy++){
      if(dx===0 && dy===0) continue;
      const nx = x + dx, ny = y + dy;
      if(!this.inBounds(nx,ny)) continue;
      const t = this.at(nx,ny);
      if(t === '.' || pieceColor(t) !== color) moves.push({from:[x,y], to:[nx,ny], meta:{}});
    }
    const colorInfo = this.castleInfo && this.castleInfo[color];
    if(colorInfo && x === colorInfo.kingFile && y === colorInfo.rank){
      const kingSideCastle = this.castleMove(color, 'kingside');
      const queenSideCastle = this.castleMove(color, 'queenside');
      if(kingSideCastle) moves.push(kingSideCastle);
      if(queenSideCastle) moves.push(queenSideCastle);
    }
  }
  return moves;
};
Game.prototype.castlePathIsSafe = function(mv){
  if(!mv.meta || !mv.meta.castle) return true;
  const color = this.turn;
  const enemy = opposite(color);
  if(this.inCheck(color)) return false;
  const meta = mv.meta;
  const rank = color === 'w' ? 7 : 0;
  const kingFrom = Number.isInteger(meta.kingFrom) ? meta.kingFrom : (this.castleInfo && this.castleInfo[color] ? this.castleInfo[color].kingFile : (color === 'w' ? 4 : 4));
  const kingTo = Number.isInteger(meta.kingTo) ? meta.kingTo : ((meta.castle === 'K' || meta.castle === 'k') ? 6 : 2);
  for(const xx of rangeBetweenInclusive(kingFrom, kingTo)){
    if(this.isAttacked(xx, rank, enemy)) return false;
  }
  return true;
};
Game.prototype.legalMoves = function(){
  const moves = [];
  const side = this.turn;
  for(let y=0;y<8;y++){
    for(let x=0;x<8;x++){
      const p = this.at(x,y);
      if(p === '.' || pieceColor(p) !== side) continue;
      for(const pm of this.pseudoLegalMovesFrom(x,y)){
        if(pm.meta && pm.meta.castle && !this.castlePathIsSafe(pm)) continue;
        const sim = this.clone();
        sim.makeMove(pm, true);
        const kp = sim.findKing(side);
        if(kp && !sim.isAttacked(kp[0], kp[1], opposite(side))) moves.push(pm);
      }
    }
  }
  return moves;
};
Game.prototype.makeMove = function(mv, silent){
  const fx = mv.from[0], fy = mv.from[1], tx = mv.to[0], ty = mv.to[1];
  const piece = this.at(fx,fy);
  const meta = mv.meta || {};
  let taken = '.';
  if(meta.enpassant){
    taken = this.at(tx,fy);
    this.set(tx,fy,'.');
    this.set(tx,ty,piece);
    this.set(fx,fy,'.');
  } else if(meta.castle){
    const color = pieceColor(piece);
    const rank = color === 'w' ? 7 : 0;
    const rook = color === 'w' ? 'R' : 'r';
    const kingFrom = Number.isInteger(meta.kingFrom) ? meta.kingFrom : fx;
    const kingTo = Number.isInteger(meta.kingTo) ? meta.kingTo : tx;
    const rookFrom = Number.isInteger(meta.rookFrom) ? meta.rookFrom : ((meta.castle === 'K' || meta.castle === 'k') ? 7 : 0);
    const rookTo = Number.isInteger(meta.rookTo) ? meta.rookTo : ((meta.castle === 'K' || meta.castle === 'k') ? 5 : 3);
    this.set(kingFrom, rank, '.');
    this.set(rookFrom, rank, '.');
    this.set(kingTo, rank, piece);
    this.set(rookTo, rank, rook);
  } else {
    taken = this.at(tx,ty);
    this.set(tx,ty,piece);
    this.set(fx,fy,'.');
    if((piece === 'P' && ty === 0) || (piece === 'p' && ty === 7)){
      const prom = (mv.promotion || 'Q').toUpperCase();
      this.set(tx,ty, pieceColor(piece) === 'w' ? prom : prom.toLowerCase());
    }
  }

  this.ep = null;
  if((piece === 'P' || piece === 'p') && Math.abs(ty - fy) === 2) this.ep = [fx, (fy+ty)/2];

  if(piece === 'K'){ this.castling.K = false; this.castling.Q = false; }
  if(piece === 'k'){ this.castling.k = false; this.castling.q = false; }
  const wInfo = this.castleInfo && this.castleInfo.w;
  const bInfo = this.castleInfo && this.castleInfo.b;
  if(piece === 'R' && fy===7 && wInfo){
    if(fx === wInfo.queenside.rookFile) this.castling.Q = false;
    if(fx === wInfo.kingside.rookFile) this.castling.K = false;
  }
  if(piece === 'r' && fy===0 && bInfo){
    if(fx === bInfo.queenside.rookFile) this.castling.q = false;
    if(fx === bInfo.kingside.rookFile) this.castling.k = false;
  }
  if(taken === 'R' && ty===7 && wInfo){
    if(tx === wInfo.queenside.rookFile) this.castling.Q = false;
    if(tx === wInfo.kingside.rookFile) this.castling.K = false;
  }
  if(taken === 'r' && ty===0 && bInfo){
    if(tx === bInfo.queenside.rookFile) this.castling.q = false;
    if(tx === bInfo.kingside.rookFile) this.castling.k = false;
  }

  this.halfmove = (piece.toLowerCase() === 'p' || taken !== '.') ? 0 : this.halfmove + 1;
  if(this.turn === 'b') this.fullmove++;
  this.turn = opposite(this.turn);
  if(!silent){ mv.piece = piece; mv.taken = taken; }
  return {piece, taken};
};
Game.prototype.repetitionEpKey = function(){
  if(!this.ep) return '-';
  const x = this.ep[0];
  const y = this.ep[1];
  const pawnY = this.turn === 'w' ? y + 1 : y - 1;
  const pawn = this.turn === 'w' ? 'P' : 'p';
  for(const dx of [-1,1]){
    const px = x + dx;
    if(this.inBounds(px,pawnY) && this.at(px,pawnY) === pawn) return coordToAlg(x,y);
  }
  return '-';
};
Game.prototype.repetitionKey = function(){
  const boardPart = this.board.map(row => row.join('')).join('/');
  const castlingPart = ['K','Q','k','q'].filter(key => this.castling[key]).join('') || '-';
  return [boardPart, this.turn, castlingPart, this.repetitionEpKey()].join(' ');
};
Game.prototype.hasInsufficientMaterial = function(){
  const pieces = [];
  for(let y=0;y<8;y++){
    for(let x=0;x<8;x++){
      const p = this.at(x,y);
      if(!p || p === '.') continue;
      const kind = p.toLowerCase();
      if(kind === 'p' || kind === 'r' || kind === 'q') return false;
      if(kind !== 'k') pieces.push({kind, squareColor:(x + y) % 2});
    }
  }
  if(pieces.length === 0) return true;
  if(pieces.length === 1 && (pieces[0].kind === 'b' || pieces[0].kind === 'n')) return true;
  if(pieces.every(piece => piece.kind === 'b')){
    const firstColor = pieces[0].squareColor;
    if(pieces.every(piece => piece.squareColor === firstColor)) return true;
  }
  return false;
};
Game.prototype.gameOver = function(repetitionCount){
  const legal = this.legalMoves();
  if(legal.length === 0){
    if(this.inCheck(this.turn)) return {type:'checkmate', winner:opposite(this.turn)};
    return {type:'stalemate'};
  }
  if(this.hasInsufficientMaterial()) return {type:'insufficient_material'};
  if(this.halfmove >= 100) return {type:'fifty_move_rule'};
  if((repetitionCount || 0) >= 3) return {type:'threefold_repetition'};
  return false;
};

function moveToSan(before, mv, after){
  if(mv.meta && mv.meta.castle){
    let san = (mv.meta.castle === 'K' || mv.meta.castle === 'k') ? 'O-O' : 'O-O-O';
    const go = after.gameOver();
    if(go && go.type === 'checkmate') san += '#';
    else if(after.inCheck(after.turn)) san += '+';
    return san;
  }
  const piece = before.at(mv.from[0], mv.from[1]);
  const isPawn = piece.toLowerCase() === 'p';
  const isCapture = mv.taken && mv.taken !== '.';
  const dest = coordToAlg(mv.to[0], mv.to[1]);
  let san = '';
  if(isPawn){
    if(isCapture) san += files[mv.from[0]] + 'x';
    san += dest;
  } else {
    san += piece.toUpperCase();
    const candidates = before.legalMoves().filter(lm => {
      const p = before.at(lm.from[0], lm.from[1]);
      return p === piece && lm.to[0] === mv.to[0] && lm.to[1] === mv.to[1];
    });
    if(candidates.length > 1){
      const others = candidates.filter(c => c.from[0] !== mv.from[0] || c.from[1] !== mv.from[1]);
      const sameFile = others.some(c => c.from[0] === mv.from[0]);
      const sameRank = others.some(c => c.from[1] === mv.from[1]);
      if(sameFile && sameRank){ san += files[mv.from[0]] + (8 - mv.from[1]); }
      else if(sameFile){ san += (8 - mv.from[1]); }
      else { san += files[mv.from[0]]; }
    }
    if(isCapture) san += 'x';
    san += dest;
  }
  if(mv.promotion) san += '=' + mv.promotion.toUpperCase();
  const go = after.gameOver();
  if(go && go.type === 'checkmate') san += '#';
  else if(after.inCheck(after.turn)) san += '+';
  return san;
}


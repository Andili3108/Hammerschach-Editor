'use strict';

(() => {
  const BOARD_KEY='hammerschachBoardColor';
  const PIECE_KEY='hammerschachPieceSet';
  const LAB_SESSION_KEY='hammerschachSchachlaborSessionV1';
  const FAIRPLAY_MESSAGE='Diese Stellung entspricht einer deiner laufenden Gamer-Partien. Die Engine-Analyse wird nach Partieende verfügbar.';
  const pieces=['K','Q','R','B','N','P','k','q','r','b','n','p'];
  const glyph={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
  const pieceSets=[
    {id:'cburnett',name:'Cburnett · Standard',path:p=>`../assets/pieces/Chess_${p===p.toUpperCase()?p.toLowerCase()+'lt':p+'dt'}45.svg`},
    {id:'merida',name:'Merida · Klassiker',path:p=>`../assets/pieces/merida/${p===p.toUpperCase()?'w':'b'}${p.toUpperCase()}.svg`},
    {id:'chessnut',name:'Chessnut · Klassisch',path:p=>`../assets/pieces/chessnut/${p===p.toUpperCase()?'w':'b'}${p.toUpperCase()}.svg`},
    {id:'fantasy',name:'Fantasy · Elegant',path:p=>`../assets/pieces/fantasy/${p===p.toUpperCase()?'w':'b'}${p.toUpperCase()}.svg`},
    {id:'merida-silversteel',name:'Merida Silversteel',path:p=>`../assets/pieces/merida-silversteel/${p===p.toUpperCase()?'w':'b'}${p.toLowerCase()}.png?v=20260808-1`},
    {id:'merida-royalwood',name:'Merida Royalwood',path:p=>`../assets/pieces/merida-royalwood/${p===p.toUpperCase()?'w':'b'}${p.toLowerCase()}.png?v=20260808-1`}
  ];
  const boardThemes=[
    {id:'basis',name:'Hammerschach Rubin',light:'#f0d9b5',dark:'#843f46',material:'classic'},
    {id:'braun',name:'Walnuss',light:'#f3ddb7',dark:'#b4875e',material:'classic'},
    {id:'grau',name:'Schiefer',light:'#eeeeee',dark:'#9b9b9b',material:'classic'},
    {id:'gruen',name:'Turniergrün',light:'#eeeed2',dark:'#769656',material:'classic'},
    {id:'onyx-elegance',name:'Premium · Warm',light:'#f2e7d2f0',dark:'#7f8389d0',material:'onyx-elegance',frame:['#2a2f34','#50555c','#b58a43'],coords:['#fff1d4','#0d0e10']},
    {id:'royal-walnut',name:'Royal Walnut · Holz',light:'#d9c29e',dark:'#8a6845',material:'royal-walnut',frame:['#5e4228','#8b6945','#c89c66'],coords:['#fff3df','#1b1008']}
  ];

  const byId=id=>document.getElementById(id);
  const boardEl=byId('board');
  const boardStatus=byId('boardStatus');
  const fenInput=byId('fenInput');
  const variantSelect=byId('variantSelect');
  const positionIdInput=byId('positionIdInput');
  const freestyleControls=byId('freestyleControls');
  const backRankOutput=byId('backRankOutput');
  const sideToMoveSelect=byId('sideToMoveSelect');
  const epSelect=byId('epSelect');
  const castleInputs={K:byId('castleK'),Q:byId('castleQ'),k:byId('castlek'),q:byId('castleq')};
  const boardThemeSelect=byId('boardThemeSelect');
  const pieceSetSelect=byId('pieceSetSelect');
  const boardThemeBtn=byId('boardThemeBtn');
  const boardThemePopup=byId('boardThemePopup');
  const boardThemeOptions=byId('boardThemeOptions');
  const boardThemeCurrent=byId('boardThemeCurrent');
  const pieceSetBtn=byId('pieceSetBtn');
  const pieceSetPopup=byId('pieceSetPopup');
  const pieceSetOptions=byId('pieceSetOptions');
  const pieceSetCurrent=byId('pieceSetCurrent');
  const analyzeBtn=byId('analyzeBtn');
  const stopBtn=byId('stopBtn');
  const engineState=byId('engineState');
  const fairplayNotice=byId('fairplayNotice');
  const variationsList=byId('variationsList');
  const trainingResult=byId('trainingResult');
  const loginState=byId('loginState');
  const moveTree=byId('moveTree');

  let labSetup=normalizeGameSetup({variant:GAME_VARIANT_STANDARD});
  let setupGame=new Game(labSetup);
  let mode='setup';
  let orientationWhite=true;
  let selectedPalette='P';
  let selectedSquare=null;
  let legalTargets=[];
  let rootNode=null;
  let currentNode=null;
  let nextNodeId=1;
  let parentReady=false;
  let loggedIn=false;
  let engineWorker=null;
  let engineInitPromise=null;
  let engineInitResolve=null;
  let pendingEngineJob=null;
  let fairplayRequestCounter=0;
  const fairplayRequests=new Map();
  let trainingCandidates=[];
  let trainingReady=false;
  let suppressSessionSave=false;

  function activeGame(){return mode==='setup'?setupGame:(currentNode?currentNode.game:setupGame);}
  function activePieceSet(){return pieceSets.find(item=>item.id===pieceSetSelect.value)||pieceSets[0];}
  function pieceUrl(piece){return activePieceSet().path(piece);}
  function squareName(x,y){return files[x]+(8-y);}
  function squareFromName(value){const match=/^([a-h])([1-8])$/.exec(String(value||'').trim());return match?[files.indexOf(match[1]),8-Number(match[2])]:null;}
  function compactBoard(board){
    return board.map(row=>{let out='',empty=0;for(const piece of row){if(piece==='.'){empty++;continue;}if(empty){out+=empty;empty=0;}out+=piece;}if(empty)out+=empty;return out;}).join('/');
  }
  function castlingFen(game){
    const keys=['K','Q','k','q'].filter(key=>game.castling&&game.castling[key]);
    if(!keys.length)return '-';
    if(game.setup.variant!==GAME_VARIANT_FREESTYLE)return keys.join('');
    const info=game.castleInfo;
    const white=[];const black=[];
    if(game.castling.Q)white.push(info.w.queenside.rookFile);
    if(game.castling.K)white.push(info.w.kingside.rookFile);
    if(game.castling.q)black.push(info.b.queenside.rookFile);
    if(game.castling.k)black.push(info.b.kingside.rookFile);
    return white.sort((a,b)=>a-b).map(file=>files[file].toUpperCase()).join('')+black.sort((a,b)=>a-b).map(file=>files[file]).join('')||'-';
  }
  function gameToFen(game){return `${compactBoard(game.board)} ${game.turn} ${castlingFen(game)} ${game.ep?squareName(game.ep[0],game.ep[1]):'-'} ${Math.max(0,game.halfmove||0)} ${Math.max(1,game.fullmove||1)}`;}
  function parseFen(value,setup){
    const parts=String(value||'').trim().split(/\s+/);
    if(parts.length<4)throw new Error('Die FEN benötigt mindestens vier Felder.');
    const ranks=parts[0].split('/');
    if(ranks.length!==8)throw new Error('Die FEN enthält nicht acht Reihen.');
    const board=ranks.map(rank=>{
      const row=[];
      for(const token of rank){
        if(/[1-8]/.test(token))row.push(...Array(Number(token)).fill('.'));
        else if(/[prnbqkPRNBQK]/.test(token))row.push(token);
        else throw new Error('Die FEN enthält ein unbekanntes Zeichen.');
      }
      if(row.length!==8)throw new Error('Eine FEN-Reihe besitzt nicht acht Felder.');
      return row;
    });
    if(!['w','b'].includes(parts[1]))throw new Error('Das Zugrecht der FEN ist ungültig.');
    const game=new Game(setup);
    game.board=board;game.turn=parts[1];game.castling={K:false,Q:false,k:false,q:false};
    const rights=parts[2]==='-'?'':parts[2];
    for(const char of rights){
      if('KQkq'.includes(char)){game.castling[char]=true;continue;}
      if(/[A-H]/.test(char)){
        const file=files.indexOf(char.toLowerCase());
        if(file===game.castleInfo.w.kingside.rookFile)game.castling.K=true;
        if(file===game.castleInfo.w.queenside.rookFile)game.castling.Q=true;
        continue;
      }
      if(/[a-h]/.test(char)){
        const file=files.indexOf(char);
        if(file===game.castleInfo.b.kingside.rookFile)game.castling.k=true;
        if(file===game.castleInfo.b.queenside.rookFile)game.castling.q=true;
        continue;
      }
      throw new Error('Die Rochaderechte der FEN sind ungültig.');
    }
    game.ep=parts[3]==='-'?null:squareFromName(parts[3]);
    if(parts[3]!=='-'&&!game.ep)throw new Error('Das En-passant-Feld der FEN ist ungültig.');
    game.halfmove=Math.max(0,Number(parts[4]||0)||0);
    game.fullmove=Math.max(1,Number(parts[5]||1)||1);
    return game;
  }
  function validateGame(game){
    const flat=game.board.flat();
    if(flat.filter(p=>p==='K').length!==1||flat.filter(p=>p==='k').length!==1)return 'Die Stellung benötigt genau einen weißen und einen schwarzen König.';
    if(game.board[0].some(p=>p.toLowerCase()==='p')||game.board[7].some(p=>p.toLowerCase()==='p'))return 'Bauern dürfen nicht auf der ersten oder achten Reihe stehen.';
    const wk=game.findKing('w'),bk=game.findKing('b');
    if(Math.max(Math.abs(wk[0]-bk[0]),Math.abs(wk[1]-bk[1]))<=1)return 'Die beiden Könige dürfen nicht nebeneinander stehen.';
    if(game.inCheck('w')&&game.inCheck('b'))return 'Beide Könige können nicht gleichzeitig im Schach stehen.';
    return '';
  }

  function boardRgbFromHex(value){
    const normalized=String(value||'').trim().replace(/^#/,'');
    const full=normalized.length===3?normalized.split('').map(char=>char+char).join(''):normalized;
    if(!/^[0-9a-f]{6}$/i.test(full))return {r:0,g:0,b:0};
    return {r:parseInt(full.slice(0,2),16),g:parseInt(full.slice(2,4),16),b:parseInt(full.slice(4,6),16)};
  }
  function mixBoardHex(base,overlay,amount){
    const from=boardRgbFromHex(base),to=boardRgbFromHex(overlay);const ratio=Math.max(0,Math.min(1,Number(amount)||0));
    const channel=key=>Math.round(from[key]+(to[key]-from[key])*ratio).toString(16).padStart(2,'0');
    return '#'+channel('r')+channel('g')+channel('b');
  }
  function closeAppearancePopups(){
    boardThemePopup.hidden=true;pieceSetPopup.hidden=true;
    boardThemeBtn.setAttribute('aria-expanded','false');pieceSetBtn.setAttribute('aria-expanded','false');
  }
  function toggleAppearancePopup(popup,button){
    const open=popup.hidden;closeAppearancePopups();
    if(open){popup.hidden=false;button.setAttribute('aria-expanded','true');}
  }
  function syncAppearancePopupState(){
    const theme=boardThemes.find(item=>item.id===boardThemeSelect.value)||boardThemes[0];
    const set=pieceSets.find(item=>item.id===pieceSetSelect.value)||pieceSets[0];
    boardThemeCurrent.textContent=theme.name;pieceSetCurrent.textContent=set.name;
    boardThemeOptions.querySelectorAll('.appearance-option').forEach(button=>button.classList.toggle('active',button.dataset.boardTheme===theme.id));
    pieceSetOptions.querySelectorAll('.appearance-option').forEach(button=>button.classList.toggle('active',button.dataset.pieceSet===set.id));
  }
  function renderAppearanceOptions(){
    boardThemeOptions.textContent='';pieceSetOptions.textContent='';
    for(const theme of boardThemes){
      const button=document.createElement('button');button.type='button';button.className='appearance-option';button.dataset.boardTheme=theme.id;
      const label=document.createElement('span');label.textContent=theme.name;
      const swatch=document.createElement('span');swatch.className='board-color-swatch';
      const light=document.createElement('span');light.style.background=theme.light;const dark=document.createElement('span');dark.style.background=theme.dark;
      swatch.append(light,dark);button.append(label,swatch);button.addEventListener('click',()=>{applyTheme(theme.id);saveSession();closeAppearancePopups();});boardThemeOptions.appendChild(button);
    }
    for(const set of pieceSets){
      const button=document.createElement('button');button.type='button';button.className='appearance-option';button.dataset.pieceSet=set.id;
      const label=document.createElement('span');label.textContent=set.name;
      const preview=document.createElement('img');preview.className='piece-set-preview';preview.src=set.path('N');preview.alt='';
      button.append(label,preview);button.addEventListener('click',()=>{applyPieceSet(set.id);saveSession();closeAppearancePopups();});pieceSetOptions.appendChild(button);
    }
  }
  function applyTheme(id,persist=true){
    const theme=boardThemes.find(item=>item.id===id)||boardThemes[0];
    const root=document.documentElement.style;
    root.setProperty('--light-square',theme.light);root.setProperty('--dark-square',theme.dark);
    const frame=theme.frame||[mixBoardHex(theme.dark,'#000000',.62),mixBoardHex(theme.dark,'#000000',.31),mixBoardHex(theme.dark,'#ffffff',.24)];
    const coords=theme.coords||[mixBoardHex(theme.light,'#ffffff',.56),mixBoardHex(theme.dark,'#000000',.58)];
    root.setProperty('--board-frame-dark',frame[0]);root.setProperty('--board-frame-mid',frame[1]);root.setProperty('--board-frame-light',frame[2]);root.setProperty('--board-coord-light',coords[0]);root.setProperty('--board-coord-dark',coords[1]);document.documentElement.dataset.boardMaterial=theme.material||'classic';
    boardThemeSelect.value=theme.id;syncAppearancePopupState();if(persist)try{localStorage.setItem(BOARD_KEY,theme.id);}catch(_){}
  }
  function applyPieceSet(id,persist=true){const set=pieceSets.find(item=>item.id===id)||pieceSets[0];pieceSetSelect.value=set.id;syncAppearancePopupState();if(persist)try{localStorage.setItem(PIECE_KEY,set.id);}catch(_){}renderPalette();renderBoard();}
  function initializeAppearance(){
    boardThemes.forEach(item=>boardThemeSelect.add(new Option(item.name,item.id)));
    pieceSets.forEach(item=>pieceSetSelect.add(new Option(item.name,item.id)));
    renderAppearanceOptions();
    let boardId='basis',pieceId='cburnett';
    try{boardId=localStorage.getItem(BOARD_KEY)||'basis';pieceId=localStorage.getItem(PIECE_KEY)||'cburnett';}catch(_){}
    applyTheme(boardId==='metal-prestige'?'onyx-elegance':boardId,false);applyPieceSet(pieceId,false);
  }
  function renderPalette(){
    const palette=byId('piecePalette');palette.textContent='';
    for(const piece of pieces){
      const button=document.createElement('button');button.type='button';button.className='palette-piece'+(selectedPalette===piece?' active':'');button.dataset.piece=piece;button.title=(piece===piece.toUpperCase()?'Weiße ':'Schwarze ')+glyph[piece];
      const img=document.createElement('img');img.src=pieceUrl(piece);img.alt=glyph[piece];button.appendChild(img);button.addEventListener('click',()=>{selectedPalette=piece;renderPalette();});palette.appendChild(button);
    }
    const erase=document.createElement('button');erase.type='button';erase.className='palette-piece eraser'+(selectedPalette==='.'?' active':'');erase.title='Feld leeren';erase.textContent='⌫';erase.addEventListener('click',()=>{selectedPalette='.';renderPalette();});palette.appendChild(erase);
  }
  function renderBoard(){
    const game=activeGame();boardEl.textContent='';
    const xOrder=orientationWhite?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
    const yOrder=orientationWhite?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
    const lastMove=currentNode&&currentNode.move?currentNode.move:null;
    yOrder.forEach((y,rowIndex)=>xOrder.forEach((x,colIndex)=>{
      const square=document.createElement('button');square.type='button';square.className=`square ${(x+y)%2?'dark':'light'}`;square.dataset.x=x;square.dataset.y=y;square.setAttribute('role','gridcell');square.setAttribute('aria-label',squareName(x,y));
      if(selectedSquare&&selectedSquare[0]===x&&selectedSquare[1]===y)square.classList.add('selected');
      const target=legalTargets.find(move=>move.to[0]===x&&move.to[1]===y);if(target)square.classList.add(game.at(x,y)==='.'&&!target.meta.enpassant?'legal':'capture');
      if(lastMove&&([lastMove.from,lastMove.to].some(pos=>pos&&pos[0]===x&&pos[1]===y)))square.classList.add('last');
      const piece=game.at(x,y);if(piece!=='.'){const img=document.createElement('img');img.src=pieceUrl(piece);img.alt=glyph[piece];square.appendChild(img);}
      if(rowIndex===7){const coord=document.createElement('span');coord.className='coord file';coord.textContent=files[x];square.appendChild(coord);}
      if(colIndex===0){const coord=document.createElement('span');coord.className='coord rank';coord.textContent=8-y;square.appendChild(coord);}
      square.addEventListener('click',()=>handleSquareClick(x,y));boardEl.appendChild(square);
    }));
    fenInput.value=gameToFen(game);syncNavigation();
  }
  function syncControlsFromGame(game){
    sideToMoveSelect.value=game.turn;Object.keys(castleInputs).forEach(key=>castleInputs[key].checked=!!game.castling[key]);epSelect.value=game.ep?squareName(game.ep[0],game.ep[1]):'-';fenInput.value=gameToFen(game);
  }
  function syncGameFromControls(){
    if(mode!=='setup')return;setupGame.turn=sideToMoveSelect.value==='b'?'b':'w';Object.keys(castleInputs).forEach(key=>setupGame.castling[key]=castleInputs[key].checked);setupGame.ep=epSelect.value==='-'?null:squareFromName(epSelect.value);renderBoard();saveSession();
  }
  function setBoardStatus(text,type=''){boardStatus.textContent=text;boardStatus.className='board-status'+(type?' '+type:'');}
  function setEngineState(text,type=''){engineState.textContent=text;engineState.className='engine-state'+(type?' '+type:'');}
  function setFairplayNotice(text=''){fairplayNotice.textContent=text;fairplayNotice.hidden=!text;}
  function showPromotionOverlay(color){
    return new Promise(resolve=>{
      const old=byId('promotionBackdrop');if(old)old.remove();
      const backdrop=document.createElement('div');backdrop.id='promotionBackdrop';backdrop.className='promo-backdrop';
      const modal=document.createElement('div');modal.className='promo-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','promotionTitle');
      const pieces=color==='w'?{Q:'♕',R:'♖',B:'♗',N:'♘'}:{Q:'♛',R:'♜',B:'♝',N:'♞'};
      const names={Q:'Dame',R:'Turm',B:'Läufer',N:'Springer'};
      modal.innerHTML='<h3 id="promotionTitle">♟️ Bauernumwandlung</h3><p>Bitte wähle die gewünschte Figur:</p><div class="promo-grid">'+Object.entries(pieces).map(([key,value])=>'<button class="promo-btn" type="button" data-piece="'+key+'"><span class="promo-piece">'+value+'</span><span>'+names[key]+'</span></button>').join('')+'</div><div class="promo-actions"><button id="promoCancel" class="button-flat" type="button">Abbrechen</button></div>';
      backdrop.appendChild(modal);document.body.appendChild(backdrop);
      let settled=false;
      const close=choice=>{if(settled)return;settled=true;document.removeEventListener('keydown',onKeydown);backdrop.remove();resolve(choice);};
      const onKeydown=event=>{if(event.key==='Escape')close(null);};
      modal.querySelectorAll('.promo-btn').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();close(button.dataset.piece);}));
      byId('promoCancel').addEventListener('click',event=>{event.stopPropagation();close(null);});
      backdrop.addEventListener('click',event=>{if(event.target===backdrop)close(null);});
      document.addEventListener('keydown',onKeydown);modal.querySelector('.promo-btn').focus();
    });
  }

  function createRoot(game){rootNode={id:0,game:game.clone(),parent:null,move:null,san:'',children:[]};currentNode=rootNode;nextNodeId=1;selectedSquare=null;legalTargets=[];renderMoveTree();}
  function moveKey(game,move){
    const from=squareName(move.from[0],move.from[1]);const meta=move.meta||{};const to=squareName(meta.castle&&game.setup.variant===GAME_VARIANT_FREESTYLE?meta.rookFrom:move.to[0],move.to[1]);return from+to+(move.promotion?move.promotion.toLowerCase():'');
  }
  function applyMove(move,source='user'){
    const before=activeGame().clone();const applied={from:move.from.slice(),to:move.to.slice(),meta:Object.assign({},move.meta||{}),promotion:move.promotion||null};
    const key=moveKey(before,applied);const existing=currentNode.children.find(child=>child.uci===key);
    if(existing){currentNode=existing;}else{
      const after=before.clone();after.makeMove(applied,false);const san=moveToSan(before,applied,after);const node={id:nextNodeId++,game:after,parent:currentNode,move:applied,san,uci:key,source,children:[]};currentNode.children.push(node);currentNode=node;
    }
    selectedSquare=null;legalTargets=[];renderBoard();renderMoveTree();saveSession();return key;
  }
  async function handleSquareClick(x,y){
    const game=activeGame();
    if(mode==='setup'){
      setupGame.set(x,y,selectedPalette);selectedSquare=null;syncControlsFromGame(setupGame);renderBoard();saveSession();return;
    }
    if(pendingEngineJob||(mode==='training'&&(!trainingReady||game.turn===byId('engineColorSelect').value))){setBoardStatus('Bitte kurz warten, bis Stockfish die verdeckte Lösung vorbereitet hat.');return;}
    const piece=game.at(x,y);
    if(!selectedSquare){
      if(piece!=='.'&&pieceColor(piece)===game.turn){selectedSquare=[x,y];legalTargets=game.legalMoves().filter(move=>move.from[0]===x&&move.from[1]===y);renderBoard();}
      return;
    }
    const candidates=legalTargets.filter(move=>move.to[0]===x&&move.to[1]===y);
    if(!candidates.length&&piece!=='.'&&pieceColor(piece)===game.turn){selectedSquare=[x,y];legalTargets=game.legalMoves().filter(move=>move.from[0]===x&&move.from[1]===y);renderBoard();return;}
    if(!candidates.length){selectedSquare=null;legalTargets=[];renderBoard();setBoardStatus('Dieser Zug ist in der aktuellen Stellung nicht legal.','error');return;}
    const first=candidates[0];const movingPiece=game.at(first.from[0],first.from[1]);const needsPromotion=movingPiece.toLowerCase()==='p'&&(first.to[1]===0||first.to[1]===7);
    let promotion=null;
    if(needsPromotion){promotion=await showPromotionOverlay(game.turn);if(!promotion){selectedSquare=null;legalTargets=[];renderBoard();return;}}
    let chosen=needsPromotion?(candidates.find(move=>String(move.promotion||'').toUpperCase()===promotion)||first):first;
    if(needsPromotion)chosen=Object.assign({},chosen,{promotion});
    const playedUci=moveKey(game,chosen);applyMove(chosen,'user');
    if(mode==='training')afterTrainingMove(playedUci);else{setBoardStatus('Zug ausgeführt. Du kannst weiterziehen oder die Stellung analysieren.','success');if(byId('autoAnalyzeCheck').checked)analyzeCurrent();}
  }
  function renderMoveTree(){
    if(!rootNode||!rootNode.children.length){moveTree.innerHTML='<p class="empty">Noch keine Züge.</p>';byId('moveCounter').textContent='0 Halbzüge';return;}
    moveTree.textContent='';const line=document.createElement('div');line.className='move-line';moveTree.appendChild(line);
    const renderChildren=(parent,container,ply)=>{
      parent.children.forEach((child,index)=>{
        const target=index===0?container:(()=>{const branch=document.createElement('div');branch.className='variation-branch move-line';container.appendChild(branch);return branch;})();
        const number=document.createElement('span');number.className='move-number';number.textContent=ply%2===0?`${Math.floor(ply/2)+1}.`:`${Math.floor(ply/2)+1}…`;target.appendChild(number);
        const button=document.createElement('button');button.type='button';button.className='move-button'+(child===currentNode?' current':'');button.textContent=child.san;button.disabled=mode==='training';button.addEventListener('click',()=>{currentNode=child;selectedSquare=null;legalTargets=[];renderBoard();renderMoveTree();});target.appendChild(button);
        renderChildren(child,target,ply+1);
      });
    };
    renderChildren(rootNode,line,0);byId('moveCounter').textContent=`${nodeDepth(currentNode)} Halbzüge`;
  }
  function nodeDepth(node){let depth=0;while(node&&node.parent){depth++;node=node.parent;}return depth;}
  function syncNavigation(){
    const hasTree=mode==='play'&&currentNode;byId('navStartBtn').disabled=!hasTree||currentNode===rootNode;byId('navBackBtn').disabled=!hasTree||!currentNode.parent;byId('navForwardBtn').disabled=!hasTree||!currentNode.children.length;byId('navEndBtn').disabled=!hasTree||!currentNode.children.length;
  }
  function goToEnd(){if(!currentNode)return;while(currentNode.children.length)currentNode=currentNode.children[0];selectedSquare=null;legalTargets=[];renderBoard();renderMoveTree();}

  function startPosition(){labSetup=normalizeGameSetup({variant:variantSelect.value,positionId:Number(positionIdInput.value)});setupGame=new Game(labSetup);syncSetupDisplay();syncControlsFromGame(setupGame);renderBoard();setBoardStatus(labSetup.variant===GAME_VARIANT_FREESTYLE?`Freestyle-Startstellung #${labSetup.positionId} wurde gesetzt.`:'Klassische Startstellung wurde gesetzt.','success');saveSession();}
  function clearBoard(){setupGame=new Game(labSetup);setupGame.board=Array.from({length:8},()=>Array(8).fill('.'));setupGame.castling={K:false,Q:false,k:false,q:false};setupGame.ep=null;setupGame.turn='w';syncControlsFromGame(setupGame);renderBoard();setBoardStatus('Das Brett ist leer. Wähle eine Figur und tippe auf das Zielfeld.');saveSession();}
  function syncSetupDisplay(){variantSelect.value=labSetup.variant;freestyleControls.hidden=labSetup.variant!==GAME_VARIANT_FREESTYLE;if(labSetup.variant===GAME_VARIANT_FREESTYLE){positionIdInput.value=labSetup.positionId;backRankOutput.textContent=labSetup.backRank;}else backRankOutput.textContent=STANDARD_BACK_RANK;}
  function setMode(next){
    mode=next;const editing=mode==='setup';byId('setupCard').classList.toggle('locked',!editing);byId('editPositionBtn').hidden=editing;byId('piecePalette').setAttribute('aria-disabled',editing?'false':'true');
    [variantSelect,positionIdInput,byId('apply960Btn'),byId('random960Btn'),byId('startPositionBtn'),byId('clearBoardBtn'),sideToMoveSelect,epSelect,...Object.values(castleInputs)].forEach(el=>{if(el)el.disabled=!editing;});
    byId('playAnalyzeBtn').classList.toggle('primary',mode==='play');byId('trainingBtn').classList.toggle('primary',mode==='training');syncNavigation();
  }
  function beginMode(next){
    const error=validateGame(setupGame);if(error){setBoardStatus(error,'error');return;}
    setupGame.setup=normalizeGameSetup(labSetup);setupGame.variant=setupGame.setup.variant;setupGame.startBackRank=setupGame.setup.backRank;setupGame.castleInfo=castlingInfoFromBackRank(setupGame.setup.backRank);
    createRoot(setupGame);setMode(next);trainingCandidates=[];trainingReady=next!=='training';trainingResult.hidden=true;setFairplayNotice('');renderBoard();
    if(next==='training'){setBoardStatus('Trainingsmodus gestartet. Stockfish bereitet die erste Aufgabe vor.');prepareTrainingTurn();}else{setBoardStatus('Play & Analyze ist aktiv. Beide Seiten können gezogen werden.','success');if(byId('autoAnalyzeCheck').checked)analyzeCurrent();}
    saveSession();
  }
  function editPosition(){
    setupGame=activeGame().clone();labSetup=normalizeGameSetup(setupGame.setup);rootNode=null;currentNode=null;setMode('setup');syncSetupDisplay();syncControlsFromGame(setupGame);selectedSquare=null;legalTargets=[];renderBoard();renderMoveTree();trainingResult.hidden=true;setBoardStatus('Die aktuell sichtbare Stellung kann jetzt bearbeitet werden.');saveSession();
  }

  function fairplayCheck(fen){
    if(!parentReady||!loggedIn)return Promise.reject(new Error('Bitte öffne das Schachlabor als eingeloggtes Mitglied über den Gamer.'));
    const requestId=`labor-${Date.now()}-${++fairplayRequestCounter}`;
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{fairplayRequests.delete(requestId);reject(new Error('Die Fairplay-Prüfung hat nicht rechtzeitig geantwortet.'));},12000);
      fairplayRequests.set(requestId,{resolve,reject,timeout});
      window.parent.postMessage({type:'hammerschach-schachlabor-check-position',requestId,fen,variant:labSetup.variant,positionId:labSetup.positionId},location.origin);
    });
  }
  function ensureEngine(){
    if(engineWorker)return engineInitPromise;
    setEngineState('wird geladen','busy');
    engineInitPromise=new Promise((resolve,reject)=>{engineInitResolve=resolve;try{engineWorker=new Worker('./stockfish.js');}catch(error){reject(error);return;}engineWorker.onmessage=event=>handleEngineLine(String(event.data||''));engineWorker.onerror=()=>{setEngineState('Fehler','error');reject(new Error('Stockfish konnte nicht gestartet werden.'));};engineWorker.postMessage('uci');});
    return engineInitPromise;
  }
  function handleEngineLine(line){
    if(line==='uciok'){engineWorker.postMessage('setoption name UCI_ShowWDL value true');engineWorker.postMessage('isready');return;}
    if(line==='readyok'&&engineInitResolve){const resolve=engineInitResolve;engineInitResolve=null;setEngineState('bereit','ready');resolve();return;}
    const job=pendingEngineJob;if(!job)return;
    if(line.startsWith('info ')){
      const depth=/\bdepth (\d+)/.exec(line);const multipv=/\bmultipv (\d+)/.exec(line);const cp=/\bscore cp (-?\d+)/.exec(line);const mate=/\bscore mate (-?\d+)/.exec(line);const wdl=/\bwdl (\d+) (\d+) (\d+)/.exec(line);const pv=/\bpv (.+)$/.exec(line);
      if(pv){const index=multipv?Number(multipv[1]):1;job.lines.set(index,{depth:depth?Number(depth[1]):0,cp:cp?Number(cp[1]):null,mate:mate?Number(mate[1]):null,wdl:wdl?wdl.slice(1).map(Number):null,pv:pv[1].trim().split(/\s+/)});if(!job.hidden)renderEngineResults(job);}
      return;
    }
    if(line.startsWith('bestmove ')){
      pendingEngineJob=null;const best=line.split(/\s+/)[1]||'';const result={bestmove:best,lines:Array.from(job.lines.entries()).sort((a,b)=>a[0]-b[0]).map(([index,value])=>Object.assign({index},value))};setEngineState('bereit','ready');analyzeBtn.disabled=false;
      if(job.cancelled)job.reject(new Error('Analyse gestoppt.'));else job.resolve(result);
    }
  }
  async function runEngine(game,{hidden=false,multiPv=null,depth=null}={}){
    const fen=gameToFen(game);setFairplayNotice('');setEngineState('Fairplay-Prüfung','busy');analyzeBtn.disabled=true;
    let check;
    try{check=await fairplayCheck(fen);}catch(error){setEngineState('Prüfung nicht möglich','error');analyzeBtn.disabled=false;throw error;}
    if(!check||check.allowed!==true){setFairplayNotice(check&&check.message?check.message:FAIRPLAY_MESSAGE);setEngineState('gesperrt','error');analyzeBtn.disabled=false;throw Object.assign(new Error(check&&check.message?check.message:FAIRPLAY_MESSAGE),{fairplay:true});}
    await ensureEngine();if(pendingEngineJob){pendingEngineJob.cancelled=true;engineWorker.postMessage('stop');}
    const selectedPv=Math.max(1,Math.min(5,Number(multiPv||byId('multiPvSelect').value)||1));const selectedDepth=Math.max(6,Math.min(28,Number(depth||byId('depthSelect').value)||14));
    setEngineState(hidden?'Lösung wird verdeckt berechnet':`analysiert · Tiefe ${selectedDepth}`,'busy');
    engineWorker.postMessage(`setoption name UCI_Chess960 value ${game.setup.variant===GAME_VARIANT_FREESTYLE?'true':'false'}`);engineWorker.postMessage(`setoption name MultiPV value ${selectedPv}`);engineWorker.postMessage('ucinewgame');engineWorker.postMessage(`position fen ${fen}`);
    return new Promise((resolve,reject)=>{pendingEngineJob={game:game.clone(),hidden,lines:new Map(),resolve,reject,cancelled:false};engineWorker.postMessage(`go depth ${selectedDepth}`);});
  }
  function normalizedLine(line,turn){
    const sign=turn==='b'?-1:1;return Object.assign({},line,{cp:line.cp===null?null:line.cp*sign,mate:line.mate===null?null:line.mate*sign,wdl:line.wdl&&turn==='b'?[line.wdl[2],line.wdl[1],line.wdl[0]]:line.wdl});
  }
  function scoreText(line){if(line.mate!==null)return line.mate>0?`Matt in ${line.mate}`:`Matt in ${Math.abs(line.mate)} gegen Weiß`;if(line.cp===null)return '–';const value=line.cp/100;return `${value>=0?'+':''}${value.toFixed(2)}`;}
  function uciToMove(game,uci){
    if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))return null;const from=squareFromName(uci.slice(0,2)),to=squareFromName(uci.slice(2,4));const promotion=uci[4]?uci[4].toUpperCase():null;const found=findMatchingLegalMove(game.legalMoves(),{from,to,promotion});return found?Object.assign({},found,{promotion}):null;
  }
  function pvToSan(game,pv){
    const sim=game.clone(),out=[];for(const token of (pv||[]).slice(0,10)){const found=uciToMove(sim,token);if(!found){out.push(token);break;}const before=sim.clone();sim.makeMove(found,false);out.push(moveToSan(before,found,sim));}return out.join(' ');
  }
  function renderEngineResults(job,finalResult=null){
    const lines=finalResult?finalResult.lines:Array.from(job.lines.entries()).sort((a,b)=>a[0]-b[0]).map(([index,value])=>Object.assign({index},value));if(!lines.length)return;
    variationsList.textContent='';for(const raw of lines){const line=normalizedLine(raw,job.game.turn);const li=document.createElement('li');const index=document.createElement('span');index.className='pv-index';index.textContent=line.index;const pv=document.createElement('span');pv.className='pv-line';pv.textContent=pvToSan(job.game,line.pv)||line.pv.join(' ');const score=document.createElement('span');score.className='pv-score';score.textContent=scoreText(line);li.append(index,pv,score);variationsList.appendChild(li);}
    const first=normalizedLine(lines[0],job.game.turn);byId('evaluationValue').textContent=scoreText(first);byId('wdlValue').textContent=first.wdl?`${first.wdl[0]} / ${first.wdl[1]} / ${first.wdl[2]}`:'–';byId('depthValue').textContent=first.depth||'–';const best=first.pv&&first.pv[0]?uciToMove(job.game,first.pv[0]):null;byId('bestMoveValue').textContent=best?moveToSan(job.game.clone(),best,(()=>{const g=job.game.clone();g.makeMove(best,false);return g;})()):first.pv&&first.pv[0]||'–';
  }
  async function analyzeCurrent(){
    const game=activeGame().clone();const error=validateGame(game);if(error){setBoardStatus(error,'error');return;}
    try{const result=await runEngine(game);renderEngineResults({game},result);setBoardStatus('Stockfish-Analyse abgeschlossen.','success');}catch(error){if(!error.fairplay)setBoardStatus(error.message||'Analyse fehlgeschlagen.','error');}
  }
  function stopEngine(){if(pendingEngineJob){pendingEngineJob.cancelled=true;engineWorker.postMessage('stop');setEngineState('wird gestoppt','busy');}else setEngineState(engineWorker?'bereit':'nicht gestartet',engineWorker?'ready':'');}

  async function prepareTrainingTurn(){
    if(mode!=='training')return;const game=activeGame().clone();const engineColor=byId('engineColorSelect').value;
    if(game.gameOver()){trainingReady=false;setBoardStatus('Die Trainingspartie ist beendet.','success');return;}
    if(game.turn===engineColor){trainingReady=false;setBoardStatus('Stockfish berechnet seinen Zug …');try{const result=await runEngine(game,{hidden:true,multiPv:1});const move=uciToMove(game,result.bestmove||result.lines[0]?.pv?.[0]||'');if(!move)throw new Error('Stockfish lieferte keinen spielbaren Zug.');applyMove(move,'engine');setBoardStatus(`Stockfish spielte ${currentNode.san}. Deine Lösung wird verdeckt vorbereitet.`);await prepareTrainingTurn();}catch(error){if(!error.fairplay)setBoardStatus(error.message||'Engine-Zug fehlgeschlagen.','error');}return;}
    trainingReady=false;trainingCandidates=[];trainingResult.hidden=true;setBoardStatus('Stockfish berechnet die Lösung verdeckt …');
    try{const result=await runEngine(game,{hidden:true,multiPv:Math.max(3,Number(byId('multiPvSelect').value)||3)});trainingCandidates=result.lines;trainingReady=true;setBoardStatus('Die Lösung ist verdeckt vorbereitet. Ziehe jetzt deinen Kandidatenzug.','success');}catch(error){if(!error.fairplay)setBoardStatus(error.message||'Die Trainingslösung konnte nicht berechnet werden.','error');}
  }
  function afterTrainingMove(playedUci){
    const rank=trainingCandidates.findIndex(line=>line.pv&&line.pv[0]===playedUci);const best=trainingCandidates[0];trainingResult.hidden=false;trainingResult.className='training-result'+(rank<0?' warn':'');
    if(rank===0)trainingResult.textContent='Treffer: Dein Zug entspricht Stockfishs erstem Kandidaten.';
    else if(rank>0)trainingResult.textContent=`Guter Kandidat: Dein Zug steht bei Stockfish auf Rang ${rank+1}. Bester Kandidat war ${best&&best.pv?best.pv[0]:'–'}.`;
    else trainingResult.textContent=`Dein Zug war nicht unter den ${trainingCandidates.length} berechneten Hauptkandidaten. Stockfish bevorzugte ${best&&best.pv?best.pv[0]:'–'}.`;
    trainingReady=false;setTimeout(()=>prepareTrainingTurn(),250);
  }

  function saveSession(){
    if(suppressSessionSave)return;try{localStorage.setItem(LAB_SESSION_KEY,JSON.stringify({version:1,setup:labSetup,fen:gameToFen(activeGame()),mode,orientationWhite,engineColor:byId('engineColorSelect').value,depth:byId('depthSelect').value,multiPv:byId('multiPvSelect').value,auto:byId('autoAnalyzeCheck').checked}));}catch(_){}
  }
  function restoreSession(){
    try{const data=JSON.parse(localStorage.getItem(LAB_SESSION_KEY)||'null');if(!data||data.version!==1)return false;suppressSessionSave=true;labSetup=normalizeGameSetup(data.setup);setupGame=parseFen(data.fen,labSetup);orientationWhite=data.orientationWhite!==false;byId('engineColorSelect').value=data.engineColor==='w'?'w':'b';byId('depthSelect').value=String(data.depth||14);byId('multiPvSelect').value=String(data.multiPv||3);byId('autoAnalyzeCheck').checked=!!data.auto;syncSetupDisplay();syncControlsFromGame(setupGame);setMode('setup');suppressSessionSave=false;return true;}catch(_){suppressSessionSave=false;return false;}
  }
  function reportHeight(){if(window.parent===window)return;window.parent.postMessage({type:'hammerschach-schachlabor-height',height:Math.ceil(document.documentElement.scrollHeight)},location.origin);}
  function applyContext(message){parentReady=true;loggedIn=message.loggedIn===true;document.documentElement.classList.toggle('dark-mode',message.darkMode===true);if(message.boardColor)applyTheme(message.boardColor,false);if(message.pieceSet)applyPieceSet(message.pieceSet,false);loginState.textContent=loggedIn?`Verbunden${message.username?' · '+message.username:''}`:'Bitte im Gamer einloggen';loginState.className='login-state '+(loggedIn?'ready':'error');[analyzeBtn,byId('trainingBtn')].forEach(button=>button.disabled=!loggedIn);}

  for(const rank of [3,6])for(const file of files)epSelect.add(new Option(`${file}${rank}`,`${file}${rank}`));
  initializeAppearance();renderPalette();
  if(!restoreSession()){startPosition();}else{renderBoard();setBoardStatus('Die zuletzt bearbeitete Laborstellung wurde wiederhergestellt.');}

  byId('toggleSetupBtn').addEventListener('click',()=>{const content=byId('setupContent');content.hidden=!content.hidden;byId('toggleSetupBtn').textContent=content.hidden?'Ausklappen':'Einklappen';byId('toggleSetupBtn').setAttribute('aria-expanded',String(!content.hidden));reportHeight();});
  variantSelect.addEventListener('change',()=>{labSetup=normalizeGameSetup({variant:variantSelect.value,positionId:Number(positionIdInput.value)});startPosition();});
  byId('apply960Btn').addEventListener('click',startPosition);byId('random960Btn').addEventListener('click',()=>{positionIdInput.value=randomChess960Setup().positionId;startPosition();});
  byId('startPositionBtn').addEventListener('click',startPosition);byId('clearBoardBtn').addEventListener('click',clearBoard);byId('editPositionBtn').addEventListener('click',editPosition);
  [sideToMoveSelect,epSelect,...Object.values(castleInputs)].forEach(control=>control.addEventListener('change',syncGameFromControls));
  byId('loadFenBtn').addEventListener('click',()=>{try{setupGame=parseFen(fenInput.value,labSetup);syncControlsFromGame(setupGame);renderBoard();setBoardStatus('FEN wurde übernommen.','success');saveSession();}catch(error){setBoardStatus(error.message,'error');}});
  byId('copyFenBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(gameToFen(activeGame()));setBoardStatus('FEN wurde kopiert.','success');}catch(_){fenInput.select();setBoardStatus('FEN ist markiert und kann kopiert werden.');}});
  byId('playAnalyzeBtn').addEventListener('click',()=>beginMode('play'));byId('trainingBtn').addEventListener('click',()=>beginMode('training'));analyzeBtn.addEventListener('click',analyzeCurrent);stopBtn.addEventListener('click',stopEngine);
  byId('flipBtn').addEventListener('click',()=>{orientationWhite=!orientationWhite;renderBoard();saveSession();});
  byId('navStartBtn').addEventListener('click',()=>{if(rootNode){currentNode=rootNode;selectedSquare=null;legalTargets=[];renderBoard();renderMoveTree();}});byId('navBackBtn').addEventListener('click',()=>{if(currentNode&&currentNode.parent){currentNode=currentNode.parent;selectedSquare=null;legalTargets=[];renderBoard();renderMoveTree();}});byId('navForwardBtn').addEventListener('click',()=>{if(currentNode&&currentNode.children.length){currentNode=currentNode.children[0];selectedSquare=null;legalTargets=[];renderBoard();renderMoveTree();}});byId('navEndBtn').addEventListener('click',goToEnd);
  boardThemeSelect.addEventListener('change',()=>{applyTheme(boardThemeSelect.value);saveSession();});pieceSetSelect.addEventListener('change',()=>{applyPieceSet(pieceSetSelect.value);saveSession();});
  boardThemeBtn.addEventListener('click',()=>toggleAppearancePopup(boardThemePopup,boardThemeBtn));pieceSetBtn.addEventListener('click',()=>toggleAppearancePopup(pieceSetPopup,pieceSetBtn));
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.board-option-wrap'))closeAppearancePopups();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAppearancePopups();});
  [byId('engineColorSelect'),byId('depthSelect'),byId('multiPvSelect'),byId('autoAnalyzeCheck')].forEach(control=>control.addEventListener('change',saveSession));
  window.addEventListener('storage',event=>{if(event.key===BOARD_KEY&&event.newValue)applyTheme(event.newValue,false);if(event.key===PIECE_KEY&&event.newValue)applyPieceSet(event.newValue,false);});
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent)return;const message=event.data&&typeof event.data==='object'?event.data:{};
    if(message.type==='hammerschach-schachlabor-context'){applyContext(message);return;}
    if(message.type==='hammerschach-schachlabor-fairplay-result'){
      const pending=fairplayRequests.get(String(message.requestId||''));if(!pending)return;clearTimeout(pending.timeout);fairplayRequests.delete(String(message.requestId||''));if(message.ok===false)pending.reject(new Error(message.message||'Fairplay-Prüfung fehlgeschlagen.'));else pending.resolve({allowed:message.allowed===true,message:message.message||''});
    }
  });
  if(window.parent!==window){window.parent.postMessage({type:'hammerschach-schachlabor-ready'},location.origin);if('ResizeObserver'in window)new ResizeObserver(reportHeight).observe(document.body);window.addEventListener('load',reportHeight);}
  else{loginState.textContent='Bitte über den eingeloggten Gamer öffnen';loginState.className='login-state error';analyzeBtn.disabled=true;byId('trainingBtn').disabled=true;}
})();

'use strict';

(function initialiseMateSchool(){
  const catalogue=window.HAMMERSCHACH_MATTBILDER_DATA;
  if(!catalogue||!Array.isArray(catalogue.motifs)||catalogue.motifs.length!==30){
    document.body.textContent='Die Mattbilder-Sammlung konnte nicht geladen werden.';
    return;
  }

  const STORAGE_KEY='hammerschachMateSchoolReaderV1';
  const PIECE_SET_KEY='hammerschachPieceSet';
  const COLOR_SCHEME_KEY='hammerschachGamerColorScheme';
  const motifs=catalogue.motifs;
  const files=['a','b','c','d','e','f','g','h'];
  const glyph={P:'♙',R:'♖',N:'♘',B:'♗',Q:'♕',K:'♔',p:'♟',r:'♜',n:'♞',b:'♝',q:'♛',k:'♚'};

  const origins={
    grundreihe:'Der Name beschreibt den Schauplatz: Der König wird auf seiner eigenen Grundreihe mattgesetzt. Meist bilden die eigenen Bauern davor eine Wand, sodass ein Turm oder eine Dame auf der letzten Reihe ungehindert zuschlagen kann.',
    haken:'Turm, Springer und Bauer greifen wie die Teile eines Hakens ineinander. Der Turm gibt Matt, der Springer deckt ihn und sperrt ein Fluchtfeld, während der Bauer wiederum den Springer schützt.',
    anastasia:'Der Name geht auf Wilhelm Heinses Roman „Anastasia und das Schachspiel“ von 1803 zurück. Darin wurde eine Stellung mit diesem charakteristischen Zusammenspiel von Springer und Schwerfigur bekannt gemacht.',
    'blindes-schwein':'Die Bezeichnung wird dem polnischen Meister Dawid Janowski zugeschrieben, der weit vorgedrungene Türme auf der siebten Reihe als „Schweine“ bezeichnete. Zwei solcher Türme beherrschen die Reihe gemeinsam und lassen dem König kaum noch Luft.',
    erstickt:'Der König ist von seinen eigenen Figuren vollständig „erstickt“. Weil ihm kein freies Feld bleibt, kann ein Springer mattsetzen, obwohl er den König nicht auf einer offenen Linie angreift.',
    doppellaeufer:'Der sachliche Name nennt die beiden Hauptdarsteller: Zwei Läufer schneiden dem König auf benachbarten oder gekreuzten Diagonalen sämtliche Fluchtwege ab.',
    boden:'Das Muster ist nach dem englischen Meister Samuel Boden benannt. Berühmt wurde es durch seine Partie gegen R. Schulder in London 1853, in der zwei Läufer den König auf gekreuzten Diagonalen einschlossen.',
    balestra:'„Balestra“ ist das italienische Wort für Armbrust. Dame und Läufer erinnern an eine gespannte Armbrust: Die Dame hält die Fluchtfelder fest, der Läufer liefert den entscheidenden Schuss.',
    arabisch:'Dieses Matt gehört zu den ältesten überlieferten Mattbildern. Eine Stellung mit Turm und Springer ist bereits aus alten arabischen Schachhandschriften bekannt – daher der Name.',
    eck:'Der Name ist wörtlich zu verstehen: Der König sitzt in einer Brettecke fest. Eine Linienfigur hält ihn dort, während meist ein Springer das letzte Mattfeld erreicht.',
    opera:'Das Opera-Matt wurde durch Paul Morphys berühmte „Opernpartie“ von 1858 in Paris bekannt. Morphy spielte sie während einer Opernaufführung gegen den Herzog von Braunschweig und Graf Isouard.',
    morphy:'Dieses Mattbild trägt den Namen des amerikanischen Genies Paul Morphy. Typisch ist das Zusammenspiel von Läufer und Turm gegen einen am Rand oder hinter eigenen Bauern eingeengten König.',
    pillsbury:'Das Muster ist nach dem amerikanischen Meister Harry Nelson Pillsbury benannt. Ein Läufer nimmt dem rochierten König das Eckfeld, sodass ein Turm auf der offenen Linie mattsetzen kann.',
    damiano:'Benannt ist das Motiv nach Pedro Damiano, einem der frühen europäischen Schachautoren des 16. Jahrhunderts. In der typischen Form wird die Dame von einem Läufer oder Bauern gedeckt und setzt aus unmittelbarer Nähe matt.',
    lolli:'Der Name erinnert an den italienischen Schachtheoretiker Giambattista Lolli. Kennzeichnend ist eine weit vorgedrungene Dame, die zusammen mit einem Bauern in die geschwächte Königsstellung eindringt.',
    anderssen:'Das Matt ist nach Adolf Anderssen benannt, einem der berühmtesten Angriffsspieler des 19. Jahrhunderts. Bekannt ist das Motiv aus seiner Partie gegen Johannes Zukertort von 1869.',
    schwalbenschwanz:'Die eigenen Figuren hinter dem König bilden in der Schlussstellung ein V. Diese Form erinnert an den gegabelten Schwanz einer Schwalbe und gibt dem Mattbild seinen anschaulichen Namen.',
    gueridon:'„Guéridon“ bezeichnet im Französischen einen kleinen Beistell- oder Säulentisch. Die Stellung der blockierenden Figuren neben beziehungsweise hinter dem König erinnert an dessen symmetrische Form.',
    epaulette:'Epauletten sind Schulterstücke einer Uniform. Die beiden eigenen Figuren unmittelbar links und rechts neben dem König sehen wie solche Schulterstücke aus – und versperren ihm zugleich die Flucht.',
    bauern:'Hier erhält die kleinste Figur die Hauptrolle: Ein Bauer gibt den letzten Mattstoß. Der schlichte Name betont, dass auch ein Bauer einen König bezwingen kann, wenn die übrigen Figuren seine Flucht verhindern.',
    greco:'Das Motiv trägt den Namen Gioachino Grecos, eines bedeutenden italienischen Schachautors des 17. Jahrhunderts. Seine Partien und Aufzeichnungen machten zahlreiche frühe Angriffsmuster bekannt.',
    'max-lange':'Benannt ist das Muster nach dem deutschen Meister und Schachautor Max Lange. Bekannt wurde es durch seine Partie gegen Adolf Anderssen 1859, in der Dame und Läufer das Mattnetz bildeten.',
    'kill-box':'Der englische Name bedeutet sinngemäß „Mattbox“. Dame und Turm schließen den König in einem kleinen, meist drei mal drei Felder großen Käfig ein, aus dem es keinen Ausgang gibt.',
    dreieck:'Dame, Turm und gegnerischer König bilden in der typischen Schlussstellung optisch ein Dreieck. Der Turm deckt dabei die Dame, die aus nächster Nähe mattsetzt.',
    blackburne:'Das seltene Mattbild ist nach dem englischen Meister Joseph Henry Blackburne benannt. Zwei Läufer und ein Springer errichten dabei ein besonders harmonisches Netz um den König.',
    reti:'Der Name erinnert an Richard Réti und seine Kurzpartie gegen Savielly Tartakower in Wien 1910. Ein Läufer setzte den von eigenen Figuren umstellten König matt und wurde dabei von einer Schwerfigur gedeckt.',
    vukovic:'Benannt ist das Motiv nach dem kroatischen Meister und Schachautor Vladimir Vuković, dem Verfasser des Klassikers „Die Kunst des Angriffs im Schach“. Ein gedeckter Turm setzt am Rand matt, während meist ein Springer die Ausgänge nimmt.',
    legal:'Das Muster geht auf den französischen Meister François Antoine de Légal de Kermeur zurück. Berühmt ist die dazugehörige Eröffnungsfalle, bei der ein scheinbares Damenopfer den Weg für das Matt der Leichtfiguren freimacht.',
    narren:'Das Narrenmatt ist das schnellstmögliche Matt einer normalen Schachpartie. Der drastische Name spielt darauf an, dass es nur nach zwei sehr unvorsichtigen weißen Bauernzügen möglich wird.',
    schaefer:'Der deutsche Name geht auf den französischen Ausdruck „coup du berger“, also „Schäferzug“, zurück. In anderen Sprachen heißt dasselbe Motiv etwa Schüler-, Kinder- oder Schustermatt und gilt überall als typische Anfängerfalle.'
  };

  const pieceSets={
    cburnett:{
      P:'../assets/pieces/Chess_plt45.svg',R:'../assets/pieces/Chess_rlt45.svg',N:'../assets/pieces/Chess_nlt45.svg',B:'../assets/pieces/Chess_blt45.svg',Q:'../assets/pieces/Chess_qlt45.svg',K:'../assets/pieces/Chess_klt45.svg',
      p:'../assets/pieces/Chess_pdt45.svg',r:'../assets/pieces/Chess_rdt45.svg',n:'../assets/pieces/Chess_ndt45.svg',b:'../assets/pieces/Chess_bdt45.svg',q:'../assets/pieces/Chess_qdt45.svg',k:'../assets/pieces/Chess_kdt45.svg'
    },
    merida:{P:'../assets/pieces/merida/wP.svg',R:'../assets/pieces/merida/wR.svg',N:'../assets/pieces/merida/wN.svg',B:'../assets/pieces/merida/wB.svg',Q:'../assets/pieces/merida/wQ.svg',K:'../assets/pieces/merida/wK.svg',p:'../assets/pieces/merida/bP.svg',r:'../assets/pieces/merida/bR.svg',n:'../assets/pieces/merida/bN.svg',b:'../assets/pieces/merida/bB.svg',q:'../assets/pieces/merida/bQ.svg',k:'../assets/pieces/merida/bK.svg'},
    chessnut:{P:'../assets/pieces/chessnut/wP.svg',R:'../assets/pieces/chessnut/wR.svg',N:'../assets/pieces/chessnut/wN.svg',B:'../assets/pieces/chessnut/wB.svg',Q:'../assets/pieces/chessnut/wQ.svg',K:'../assets/pieces/chessnut/wK.svg',p:'../assets/pieces/chessnut/bP.svg',r:'../assets/pieces/chessnut/bR.svg',n:'../assets/pieces/chessnut/bN.svg',b:'../assets/pieces/chessnut/bB.svg',q:'../assets/pieces/chessnut/bQ.svg',k:'../assets/pieces/chessnut/bK.svg'},
    fantasy:{P:'../assets/pieces/fantasy/wP.svg',R:'../assets/pieces/fantasy/wR.svg',N:'../assets/pieces/fantasy/wN.svg',B:'../assets/pieces/fantasy/wB.svg',Q:'../assets/pieces/fantasy/wQ.svg',K:'../assets/pieces/fantasy/wK.svg',p:'../assets/pieces/fantasy/bP.svg',r:'../assets/pieces/fantasy/bR.svg',n:'../assets/pieces/fantasy/bN.svg',b:'../assets/pieces/fantasy/bB.svg',q:'../assets/pieces/fantasy/bQ.svg',k:'../assets/pieces/fantasy/bK.svg'},
    'merida-silversteel':{},
    'merida-royalwood':{}
  };

  for(const id of['merida-silversteel','merida-royalwood']){
    const paths={};
    for(const piece of Object.keys(glyph)){
      const color=piece===piece.toUpperCase()?'w':'b';
      paths[piece]='../assets/pieces/'+id+'/'+color+piece.toLowerCase()+'.png?v=20260808-1';
    }
    pieceSets[id]=paths;
  }

  const elements={
    board:document.getElementById('board'),
    list:document.getElementById('chapterList'),
    panel:document.getElementById('chapterPanel'),
    panelClose:document.getElementById('chapterPanelClose'),
    backdrop:document.getElementById('chapterBackdrop'),
    menuButton:document.getElementById('chapterMenuBtn'),
    mobileTitle:document.getElementById('mobileChapterTitle'),
    kicker:document.getElementById('lessonKicker'),
    title:document.getElementById('lessonTitle'),
    icon:document.getElementById('lessonIcon'),
    mechanism:document.getElementById('lessonMechanism'),
    clues:document.getElementById('lessonClues'),
    origin:document.getElementById('lessonOrigin'),
    memory:document.getElementById('lessonMemory'),
    diagramStateTitle:document.getElementById('diagramStateTitle'),
    diagramCaption:document.getElementById('diagramCaption'),
    moveButton:document.getElementById('mateMoveBtn'),
    moveSymbol:document.querySelector('#mateMoveBtn .mate-move-symbol'),
    moveSquares:document.getElementById('mateMoveSquares'),
    moveLabel:document.getElementById('mateMoveLabel'),
    networkButton:document.getElementById('networkToggle'),
    networkLegend:document.getElementById('networkLegend'),
    previous:document.getElementById('previousLessonBtn'),
    next:document.getElementById('nextLessonBtn'),
    previousName:document.getElementById('previousLessonName'),
    nextName:document.getElementById('nextLessonName')
  };

  let currentIndex=0;
  let networkVisible=false;
  let currentBoard=null;
  let currentMover='w';
  let matePlayed=false;
  let moveAnimating=false;
  let pieceSetId='cburnett';
  let chapterReturnFocus=null;

  function readState(){
    try{
      const state=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(state&&typeof state==='object'){
        const byId=motifs.findIndex(motif=>motif.id===state.motifId);
        if(byId>=0)currentIndex=byId;
        networkVisible=false;
      }
      const hashId=decodeURIComponent(location.hash.replace(/^#/,''));
      const byHash=motifs.findIndex(motif=>motif.id===hashId);
      if(byHash>=0)currentIndex=byHash;
      const storedPieces=localStorage.getItem(PIECE_SET_KEY)||'cburnett';
      pieceSetId=storedPieces==='rhosgfx'?'merida':storedPieces;
      if(!pieceSets[pieceSetId])pieceSetId='cburnett';
    }catch(_){ }
  }

  function saveState(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({motifId:motifs[currentIndex].id,networkVisible}));}catch(_){ }
  }

  function parentMessage(message){
    try{window.parent.postMessage(message,location.origin==='null'?'*':location.origin);}catch(_){ }
  }

  function reportHeight(){
    parentMessage({type:'hammerschach-mate-school-height',height:Math.ceil(document.documentElement.scrollHeight)});
  }

  function parseFen(fen){
    const parts=String(fen||'').trim().split(/\s+/);
    const rows=parts[0].split('/');
    const board=Array.from({length:8},()=>Array(8).fill('.'));
    rows.forEach((row,y)=>{
      let x=0;
      for(const char of row){
        if(/\d/.test(char))x+=Number(char);
        else if(x<8)board[y][x++]=char;
      }
    });
    return{board,side:parts[1]==='b'?'b':'w'};
  }

  function squareFromAlgebraic(square){
    return[files.indexOf(square[0]),8-Number(square[1])];
  }

  function applyMove(position,uci){
    const move=String(uci||'');
    if(move.length<4)return position;
    const from=squareFromAlgebraic(move.slice(0,2));
    const to=squareFromAlgebraic(move.slice(2,4));
    const board=position.board.map(row=>row.slice());
    let piece=board[from[1]][from[0]];
    board[from[1]][from[0]]='.';
    if((piece==='P'||piece==='p')&&from[0]!==to[0]&&board[to[1]][to[0]]==='.')board[from[1]][to[0]]='.';
    if((piece==='K'||piece==='k')&&Math.abs(to[0]-from[0])===2){
      const rookFrom=to[0]>from[0]?7:0;
      const rookTo=to[0]>from[0]?to[0]-1:to[0]+1;
      board[to[1]][rookTo]=board[to[1]][rookFrom];
      board[to[1]][rookFrom]='.';
    }
    if(move[4])piece=piece===piece.toUpperCase()?move[4].toUpperCase():move[4].toLowerCase();
    board[to[1]][to[0]]=piece;
    return{board,side:position.side};
  }

  function pieceColor(piece){
    if(!piece||piece==='.')return'';
    return piece===piece.toUpperCase()?'w':'b';
  }

  function pathClear(board,fromX,fromY,toX,toY){
    const stepX=Math.sign(toX-fromX),stepY=Math.sign(toY-fromY);
    let x=fromX+stepX,y=fromY+stepY;
    while(x!==toX||y!==toY){
      if(board[y][x]!=='.')return false;
      x+=stepX;y+=stepY;
    }
    return true;
  }

  function attacksSquare(board,piece,fromX,fromY,toX,toY){
    const dx=toX-fromX,dy=toY-fromY,absX=Math.abs(dx),absY=Math.abs(dy);
    if(!dx&&!dy)return false;
    switch(piece.toLowerCase()){
      case'p':return absX===1&&dy===(piece==='P'?-1:1);
      case'n':return(absX===1&&absY===2)||(absX===2&&absY===1);
      case'b':return absX===absY&&pathClear(board,fromX,fromY,toX,toY);
      case'r':return(dx===0||dy===0)&&pathClear(board,fromX,fromY,toX,toY);
      case'q':return(absX===absY||dx===0||dy===0)&&pathClear(board,fromX,fromY,toX,toY);
      case'k':return Math.max(absX,absY)===1;
      default:return false;
    }
  }

  function squareAttacked(board,x,y,attackerColor){
    for(let fromY=0;fromY<8;fromY++)for(let fromX=0;fromX<8;fromX++){
      const piece=board[fromY][fromX];
      if(pieceColor(piece)===attackerColor&&attacksSquare(board,piece,fromX,fromY,x,y))return true;
    }
    return false;
  }

  function analyseMattNetwork(board,mover){
    const defender=mover==='w'?'b':'w';
    const kingPiece=defender==='w'?'K':'k';
    let king=[-1,-1];
    for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(board[y][x]===kingPiece)king=[x,y];
    const adjacent=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const x=king[0]+dx,y=king[1]+dy;
      if(x<0||x>7||y<0||y>7)continue;
      const occupiedByDefender=pieceColor(board[y][x])===defender;
      adjacent.push({x,y,blocked:occupiedByDefender,controlled:!occupiedByDefender&&squareAttacked(board,x,y,mover)});
    }
    const netPieces=[];
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const piece=board[y][x];
      if(pieceColor(piece)!==mover)continue;
      if(attacksSquare(board,piece,x,y,king[0],king[1])||adjacent.some(square=>attacksSquare(board,piece,x,y,square.x,square.y)))netPieces.push(x+','+y);
    }
    return{king,adjacent,netPieces};
  }

  function pieceImage(piece){
    return(pieceSets[pieceSetId]||pieceSets.cburnett)[piece]||pieceSets.cburnett[piece];
  }

  function renderBoard(){
    const motif=motifs[currentIndex];
    const task=motif.tasks&&motif.tasks[0];
    if(!task)return;
    const start=parseFen(task.fen);
    const finish=applyMove(start,task.solution);
    currentMover=start.side;
    currentBoard=(matePlayed?finish:start).board;
    const orientationWhite=currentMover==='w';
    const network=analyseMattNetwork(finish.board,currentMover);
    const moveFrom=task.solution.slice(0,2);
    const moveTo=task.solution.slice(2,4);
    elements.board.innerHTML='';
    elements.board.classList.toggle('network-visible',matePlayed&&networkVisible);
    elements.board.classList.toggle('mate-complete',matePlayed);
    elements.board.setAttribute('aria-label',matePlayed?'Fertige Mattstellung zum '+motif.title+'. '+(currentMover==='w'?'Schwarz':'Weiß')+' ist matt.':'Stellung zum '+motif.title+' unmittelbar vor dem Mattzug.');

    for(let displayY=0;displayY<8;displayY++)for(let displayX=0;displayX<8;displayX++){
      const x=orientationWhite?displayX:7-displayX;
      const y=orientationWhite?displayY:7-displayY;
      const squareName=files[x]+String(8-y);
      const piece=currentBoard[y][x];
      const square=document.createElement('div');
      square.className='square '+((x+y)%2===0?'light':'dark');
      square.dataset.square=squareName;
      if(piece!=='.')square.classList.add('has-piece');
      if(matePlayed&&squareName===moveFrom)square.classList.add('last-move-from');
      if(matePlayed&&squareName===moveTo)square.classList.add('last-move-to');
      if(x===network.king[0]&&y===network.king[1])square.classList.add('mated-king');
      if(network.netPieces.includes(x+','+y))square.classList.add('net-piece');
      const escape=network.adjacent.find(item=>item.x===x&&item.y===y);
      if(escape&&escape.blocked)square.classList.add('blocked-own');
      else if(escape&&escape.controlled)square.classList.add('controlled');

      if(piece!=='.'){
        const image=document.createElement('img');
        image.className='piece-img';
        image.src=pieceImage(piece);
        image.alt='';
        image.draggable=false;
        image.addEventListener('error',()=>{
          const fallback=document.createElement('span');
          fallback.className='piece-fallback';
          fallback.textContent=glyph[piece]||'';
          image.replaceWith(fallback);
        },{once:true});
        square.appendChild(image);
      }
      if(displayX===0){
        const rank=document.createElement('span');rank.className='coord rank';rank.textContent=String(8-y);square.appendChild(rank);
      }
      if(displayY===7){
        const file=document.createElement('span');file.className='coord file';file.textContent=files[x];square.appendChild(file);
      }
      elements.board.appendChild(square);
    }
  }

  function updateMateControls(){
    const motif=motifs[currentIndex];
    const task=motif.tasks&&motif.tasks[0];
    const move=task&&task.solution?task.solution:'';
    const moveText=move.length>=4?move.slice(0,2)+' → '+move.slice(2,4):'Mattzug';
    elements.diagramStateTitle.textContent=matePlayed?'Die fertige Mattstellung':'Ein Zug vor dem Matt';
    elements.diagramCaption.textContent=matePlayed?'Matt! Der entscheidende Zug ist ausgeführt. Mit dem Rückpfeil kannst du die Ausgangsstellung erneut ansehen.':'Die Stellung steht unmittelbar vor dem Matt. Löse den entscheidenden Zug mit dem Pfeil aus.';
    elements.moveButton.classList.toggle('is-played',matePlayed);
    elements.moveButton.disabled=moveAnimating;
    elements.moveButton.setAttribute('aria-pressed',String(matePlayed));
    elements.moveSymbol.textContent=matePlayed?'↺':'→';
    elements.moveSquares.textContent=matePlayed?'Mattstellung':moveText;
    elements.moveLabel.textContent=matePlayed?'Stellung zurücksetzen':'Mattzug zeigen';
    if(!matePlayed)networkVisible=false;
    elements.networkButton.disabled=!matePlayed;
    elements.networkButton.setAttribute('aria-pressed',String(matePlayed&&networkVisible));
    elements.networkButton.innerHTML='<span aria-hidden="true">◎</span> '+(!matePlayed?'Nach dem Mattzug':networkVisible?'Mattnetz ausblenden':'Mattnetz anzeigen');
    elements.networkLegend.hidden=!(matePlayed&&networkVisible);
  }

  function finishMateMove(){
    if(!moveAnimating)return;
    matePlayed=true;
    moveAnimating=false;
    networkVisible=false;
    renderBoard();
    updateMateControls();
    saveState();
    requestAnimationFrame(reportHeight);
  }

  function animateMateMove(){
    if(moveAnimating)return;
    if(matePlayed){
      matePlayed=false;
      networkVisible=false;
      renderBoard();
      updateMateControls();
      saveState();
      requestAnimationFrame(reportHeight);
      return;
    }
    const motif=motifs[currentIndex];
    const task=motif.tasks&&motif.tasks[0];
    const move=task&&task.solution?task.solution:'';
    if(move.length<4)return;
    const sourceSquare=elements.board.querySelector('[data-square="'+move.slice(0,2)+'"]');
    const targetSquare=elements.board.querySelector('[data-square="'+move.slice(2,4)+'"]');
    const sourcePiece=sourceSquare&&sourceSquare.querySelector('.piece-img,.piece-fallback');
    if(!sourceSquare||!targetSquare||!sourcePiece||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      moveAnimating=true;
      finishMateMove();
      return;
    }

    moveAnimating=true;
    updateMateControls();
    sourceSquare.classList.add('move-start');
    targetSquare.classList.add('move-target');
    const capturedPiece=targetSquare.querySelector('.piece-img,.piece-fallback');
    const boardRect=elements.board.getBoundingClientRect();
    const sourceRect=sourcePiece.getBoundingClientRect();
    const targetRect=targetSquare.getBoundingClientRect();
    const flyer=sourcePiece.cloneNode(true);
    flyer.classList.add('piece-in-flight');
    flyer.style.left=(sourceRect.left-boardRect.left)+'px';
    flyer.style.top=(sourceRect.top-boardRect.top)+'px';
    flyer.style.width=sourceRect.width+'px';
    flyer.style.height=sourceRect.height+'px';
    flyer.style.transform='translate3d(0,0,0)';
    sourcePiece.style.visibility='hidden';
    if(capturedPiece)capturedPiece.style.opacity='0';
    elements.board.appendChild(flyer);
    const targetX=targetRect.left-boardRect.left+(targetRect.width-sourceRect.width)/2;
    const targetY=targetRect.top-boardRect.top+(targetRect.height-sourceRect.height)/2;
    const deltaX=targetX-(sourceRect.left-boardRect.left);
    const deltaY=targetY-(sourceRect.top-boardRect.top);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{flyer.style.transform='translate3d('+deltaX+'px,'+deltaY+'px,0) scale(1.04)';}));
    flyer.addEventListener('transitionend',finishMateMove,{once:true});
    window.setTimeout(finishMateMove,620);
  }

  function renderChapterList(){
    elements.list.innerHTML='';
    let group='';
    motifs.forEach((motif,index)=>{
      if(motif.group!==group){
        group=motif.group;
        const heading=document.createElement('div');
        heading.className='chapter-group';
        heading.textContent=group;
        elements.list.appendChild(heading);
      }
      const button=document.createElement('button');
      button.type='button';
      button.className='chapter-item'+(index===currentIndex?' active':'');
      button.setAttribute('aria-current',index===currentIndex?'page':'false');
      button.innerHTML='<span class="chapter-number">'+String(index+1).padStart(2,'0')+'</span><strong>'+motif.title+'</strong>';
      button.addEventListener('click',()=>selectLesson(index,true));
      elements.list.appendChild(button);
    });
  }

  function renderLesson(){
    const motif=motifs[currentIndex];
    const previous=motifs[currentIndex-1];
    const next=motifs[currentIndex+1];
    elements.kicker.textContent=motif.group+' · Mattbild '+(currentIndex+1)+' von '+motifs.length;
    elements.title.textContent=motif.title;
    elements.icon.textContent=motif.icon||'♜';
    elements.mechanism.textContent=motif.summary;
    elements.clues.innerHTML='';
    (motif.clues||[]).forEach(clue=>{const item=document.createElement('li');item.textContent=clue;elements.clues.appendChild(item);});
    elements.origin.textContent=origins[motif.id]||'Der Name beschreibt die typische Figurenstellung dieses Mattbildes.';
    elements.memory.textContent=motif.memory;
    elements.mobileTitle.textContent=(currentIndex+1)+' · '+motif.title;
    updateMateControls();
    elements.previous.disabled=!previous;
    elements.next.disabled=!next;
    elements.previousName.textContent=previous?previous.title:'Anfang';
    elements.nextName.textContent=next?next.title:'Ende';
    renderChapterList();
    renderBoard();
    try{history.replaceState(null,'','#'+encodeURIComponent(motif.id));}catch(_){ }
    saveState();
    requestAnimationFrame(reportHeight);
  }

  function selectLesson(index,moveFocus=false){
    currentIndex=Math.max(0,Math.min(motifs.length-1,Number(index)||0));
    matePlayed=false;
    moveAnimating=false;
    networkVisible=false;
    closeChapterPanel(false);
    renderLesson();
    if(moveFocus){
      try{elements.title.focus({preventScroll:true});}catch(_){elements.title.focus();}
      window.scrollTo({top:0,left:0,behavior:'auto'});
    }
  }

  function openChapterPanel(){
    chapterReturnFocus=document.activeElement;
    document.body.classList.add('chapter-panel-open');
    elements.backdrop.hidden=false;
    elements.menuButton.setAttribute('aria-expanded','true');
    requestAnimationFrame(()=>{
      const active=elements.list.querySelector('.chapter-item.active');
      if(active){active.focus();active.scrollIntoView({block:'nearest'});}
    });
  }

  function closeChapterPanel(restoreFocus=true){
    document.body.classList.remove('chapter-panel-open');
    elements.backdrop.hidden=true;
    elements.menuButton.setAttribute('aria-expanded','false');
    if(restoreFocus&&chapterReturnFocus&&typeof chapterReturnFocus.focus==='function')chapterReturnFocus.focus();
    chapterReturnFocus=null;
  }

  function applyPieceSet(id){
    const normalized=id==='rhosgfx'?'merida':id;
    pieceSetId=pieceSets[normalized]?normalized:'cburnett';
    renderBoard();
  }

  readState();
  elements.moveButton.addEventListener('click',animateMateMove);
  elements.networkButton.addEventListener('click',()=>{if(!matePlayed)return;networkVisible=!networkVisible;renderBoard();updateMateControls();saveState();requestAnimationFrame(reportHeight);});
  elements.previous.addEventListener('click',()=>{if(currentIndex>0)selectLesson(currentIndex-1,true);});
  elements.next.addEventListener('click',()=>{if(currentIndex<motifs.length-1)selectLesson(currentIndex+1,true);});
  elements.menuButton.addEventListener('click',openChapterPanel);
  elements.panelClose.addEventListener('click',()=>closeChapterPanel(true));
  elements.backdrop.addEventListener('click',()=>closeChapterPanel(true));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.body.classList.contains('chapter-panel-open'))closeChapterPanel(true);
    if(!document.body.classList.contains('chapter-panel-open')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement&&document.activeElement.tagName)){
      if(event.key==='ArrowLeft'&&currentIndex>0)selectLesson(currentIndex-1,true);
      if(event.key==='ArrowRight'&&currentIndex<motifs.length-1)selectLesson(currentIndex+1,true);
    }
  });

  window.addEventListener('storage',event=>{
    if(event.key===PIECE_SET_KEY&&event.newValue)applyPieceSet(event.newValue);
    if(event.key===COLOR_SCHEME_KEY)document.documentElement.classList.toggle('dark-mode',event.newValue==='dark');
  });

  window.addEventListener('message',event=>{
    if(event.source!==window.parent)return;
    if(location.origin!=='null'&&event.origin!==location.origin)return;
    const message=event.data&&typeof event.data==='object'?event.data:{};
    if(message.type==='hammerschach-mate-school-context'){
      document.documentElement.classList.toggle('dark-mode',!!message.darkMode);
      if(typeof message.pieceSet==='string'&&message.pieceSet)applyPieceSet(message.pieceSet);
      reportHeight();
    }
    if(message.type==='hammerschach-mate-school-visibility'&&message.visible)reportHeight();
  });

  if(window.ResizeObserver)new ResizeObserver(reportHeight).observe(document.body);
  window.addEventListener('load',reportHeight);
  renderLesson();
  parentMessage({type:'hammerschach-mate-school-ready'});
})();

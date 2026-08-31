'use strict';

(function initialiseMateSchool(){
  const STORAGE_KEY='hammerschachMateSchoolProgressV1';
  const pieces={
    P:'Chess_plt45.svg',R:'Chess_rlt45.svg',N:'Chess_nlt45.svg',B:'Chess_blt45.svg',Q:'Chess_qlt45.svg',K:'Chess_klt45.svg',
    p:'Chess_pdt45.svg',r:'Chess_rdt45.svg',n:'Chess_ndt45.svg',b:'Chess_bdt45.svg',q:'Chess_qdt45.svg',k:'Chess_kdt45.svg'
  };
  const pieceNames={P:'weißer Bauer',R:'weißer Turm',N:'weißer Springer',B:'weißer Läufer',Q:'weiße Dame',K:'weißer König',p:'schwarzer Bauer',r:'schwarzer Turm',n:'schwarzer Springer',b:'schwarzer Läufer',q:'schwarze Dame',k:'schwarzer König'};
  const lessons=[
    {
      id:'back-rank',group:'Grundlagen',theme:'backRankMate',title:'Grundreihenmatt',icon:'▰',rating:803,
      fen:'rn4k1/1p3ppp/p1p2n2/3p4/3P1P2/2Nr3q/PP3Q1P/4RR1K b - - 1 18',setup:'f6g4',solution:'e1e8',
      summary:'Der König sitzt hinter seinem eigenen Bauernwall fest. Ein Turm oder die Dame nutzt die freie Grundreihe für den entscheidenden Schlag.',
      memory:'Kein Luftloch + freie Grundreihe = Alarmstufe Matt.',
      clues:['Der König steht auf seiner Ausgangsreihe.','Die eigenen Bauern versperren die Flucht.','Eine Schwerfigur kann auf die Grundreihe eindringen.'],
      hint:'Suche nach einem Turmzug auf die achte Reihe.',origin:'Praxisaufgabe aus der Lichess Open Database · CC0'
    },
    {
      id:'smothered',group:'Grundlagen',theme:'smotheredMate',title:'Ersticktes Matt',icon:'♞',rating:807,
      fen:'5rQk/pp4pp/2n4N/2p3P1/7b/P2PP2P/1P2q1B1/1RB4K b - - 5 31',setup:'f8g8',solution:'h6f7',
      summary:'Ein Springer setzt matt, während der König vollständig von den eigenen Figuren eingeschlossen ist.',
      memory:'Der Springer braucht keine freie Linie – der König aber braucht ein freies Feld.',
      clues:['Der König ist von eigenen Steinen umringt.','Ein Springer kann mit Schach in die Nähe springen.','Der Springer kann nicht geschlagen werden.'],
      hint:'Welches Springerfeld greift h8 an?',origin:'Auch als „Philidor’s Legacy“ bekannt · Praxisaufgabe aus der Lichess Open Database · CC0'
    },
    {
      id:'hook',group:'Grundlagen',theme:'hookMate',title:'Hakenmatt',icon:'⌝',rating:896,
      fen:'5r2/ppp2p2/7k/6R1/5pP1/1BP3n1/PP3KP1/R1B4r w - - 1 22',setup:'g5e5',solution:'h1f1',
      summary:'Turm, Springer und Bauer greifen wie ein kleiner Haken ineinander. Ein gegnerischer Bauer nimmt dem König zusätzlich Raum.',
      memory:'Turm schlägt zu, Springer verriegelt, Bauer hält den Springer fest.',
      clues:['Ein Turm findet eine offene Reihe oder Linie.','Der Springer deckt Fluchtfelder am König.','Ein Bauer stabilisiert das Mattnetz.'],
      hint:'Der schwarze Turm braucht die offene f-Linie.',origin:'Praxisaufgabe aus der Lichess Open Database · CC0'
    },
    {
      id:'arabian',group:'Grundlagen',theme:'arabianMate',title:'Arabisches Matt',icon:'♜♞',rating:814,
      fen:'5r1k/p4p1Q/1p3N2/5q2/8/3r4/PPP5/2K4R b - - 0 24',setup:'f5h7',solution:'h1h7',
      summary:'Turm und Springer bilden eines der ältesten Mattduos: Der Turm gibt das Schach, der Springer schützt ihn und bewacht das letzte Fluchtfeld.',
      memory:'Turm am König, Springer als Leibwächter.',
      clues:['Der König steht am Rand oder in der Ecke.','Der Springer kontrolliert das Fluchtfeld.','Der Turm kann gedeckt direkt angreifen.'],
      hint:'Die weiße Dame hat den Weg auf der h-Linie freigemacht.',origin:'Praxisaufgabe aus der Lichess Open Database · CC0'
    },
    {
      id:'anastasia',group:'Grundlagen',theme:'anastasiaMate',title:'Anastasia-Matt',icon:'♞│',rating:870,
      fen:'7k/ppp3pp/2b5/5r2/8/3QB3/PPP1nPPq/R4R1K w - - 0 23',setup:'h1h2',solution:'f5h5',
      summary:'Der Springer hält den König zwischen Brettrand und eigener Figur fest. Der Turm vollendet das Matt auf der offenen Randlinie.',
      memory:'Springer sperrt die Tür, Turm schließt ab.',
      clues:['Der König steht an der a- oder h-Linie.','Eine eigene Figur blockiert seine Innenseite.','Der Springer kontrolliert die beiden wichtigen Fluchtfelder.'],
      hint:'Der schwarze Turm kann auf die h-Linie schwenken.',origin:'Benannt nach Heinses Roman „Anastasia und das Schachspiel“ · Praxisaufgabe aus der Lichess Open Database · CC0'
    },
    {
      id:'double-bishop',group:'Grundlagen',theme:'doubleBishopMate',title:'Doppelläufer-Matt',icon:'╲╱',rating:817,
      fen:'2kr1bnr/Bppq1ppp/8/3p4/4P3/5P2/PP3P1P/R2QKB1R b KQ - 0 11',setup:'b7b6',solution:'f1a6',
      summary:'Zwei Läufer schneiden auf benachbarten Diagonalen die Fluchtwege ab. Die eigenen Figuren des Königs machen den Käfig komplett.',
      memory:'Zwei Läufer, zwei Diagonalen, kein Ausgang.',
      clues:['Der König ist durch eigene Steine eingeengt.','Beide Läufer zielen in die Königszone.','Ein Läufer kann mit Tempo die letzte Diagonale besetzen.'],
      hint:'Der weiße Läufer auf f1 sucht die lange Diagonale.',origin:'Praxisaufgabe aus der Lichess Open Database · CC0'
    },
    {
      id:'boden',group:'Grundlagen',theme:'bodenMate',title:'Bodens Matt',icon:'×',rating:810,
      fen:'r3kb1r/p1q2ppp/2p1p3/3p2B1/B2Pb1P1/7P/PPP2P2/R2QK1R1 b Qkq - 1 14',setup:'c7h2',solution:'a4c6',
      summary:'Beim Boden-Matt kreuzen sich die Wirkungslinien zweier Läufer. Der König wird von seinen eigenen Figuren im Zentrum des Netzes festgehalten.',
      memory:'Gekreuzte Läuferlinien machen aus eigenen Verteidigern Gefängniswärter.',
      clues:['Zwei Läufer wirken auf gekreuzten Diagonalen.','Der König kann wegen eigener Figuren nicht ausweichen.','Ein Läuferzug schließt das Netz mit Schach.'],
      hint:'Der Läufer auf a4 kann die entscheidende Kreuzdiagonale betreten.',origin:'Benannt nach Samuel Boden · Praxisaufgabe aus der Lichess Open Database · CC0'
    },
    {
      id:'dovetail',group:'Spezialmuster',theme:'dovetailMate',title:'Schwalbenschwanzmatt',icon:'◆',rating:822,
      fen:'4r3/Q5pp/1pkq4/2P5/6B1/2p2P2/5RKP/4r3 b - - 0 33',setup:'d6c5',solution:'a7d7',
      summary:'Die Dame setzt aus nächster Nähe matt. Zwei eigene Figuren des Königs blockieren die schräg nach hinten führenden Fluchtfelder – wie ein Schwalbenschwanz.',
      memory:'Dame davor, zwei Blockierer dahinter.',
      clues:['Die Dame kann direkt neben den König ziehen.','Zwei Fluchtfelder sind durch eigene Figuren besetzt.','Alle übrigen Felder werden von der Dame kontrolliert.'],
      hint:'Die weiße Dame kann von a7 zentral mit Schach eindringen.',origin:'Auch Dovetail- oder Cozio-Matt · Praxisaufgabe aus der Lichess Open Database · CC0'
    },
    {
      id:'kill-box',group:'Spezialmuster',theme:'killBoxMate',title:'Kill-Box-Matt',icon:'▣',rating:941,
      fen:'6k1/pp4p1/2p2p1p/2Pp4/3Q1P2/P2P1qPP/5B2/2r3KR w - - 1 35',setup:'g1h2',solution:'c1h1',
      summary:'Dame und Turm sperren den König in einen kompakten Käfig. Die beiden Schwerfiguren decken sich und kontrollieren den gesamten 3×3-Raum.',
      memory:'Zwei Schwerfiguren bauen eine Box – der König findet keine Ecke hinaus.',
      clues:['Dame und Turm können sich gegenseitig decken.','Der König besitzt nur wenige zusammenhängende Felder.','Ein Linienzug schließt die letzte Seite des Käfigs.'],
      hint:'Der schwarze Turm kann die erste Reihe vollständig nutzen.',origin:'Praxisaufgabe aus der Lichess Open Database · CC0'
    },
    {
      id:'vukovic',group:'Spezialmuster',theme:'vukovicMate',title:'Vuković-Matt',icon:'♜♞',rating:1566,
      fen:'1rb1N2r/pp5k/5R1Q/4p3/2Pnq1P1/8/PP2n2K/R1B5 b - - 0 32',setup:'h7g8',solution:'f6f8',
      summary:'Ein Turm setzt am Brettrand matt, während ein Springer die Fluchtfelder verriegelt. Ein König oder Bauer sichert den Turm zusätzlich ab.',
      memory:'Turm an der Kante, Springer nimmt die Ausgänge.',
      clues:['Der König steht am Rand.','Der Springer kontrolliert die nahen Fluchtfelder.','Der Turm kann gedeckt auf die letzte Reihe eindringen.'],
      hint:'Der weiße Turm kann die f-Linie bis zur achten Reihe nutzen.',origin:'Benannt nach Vladimir Vuković · Praxisaufgabe aus der Lichess Open Database · CC0'
    }
  ];

  const boardEl=document.getElementById('board');
  const listEl=document.getElementById('patternList');
  const lessonStep=document.getElementById('lessonStep');
  const lessonTitle=document.getElementById('lessonTitle');
  const lessonState=document.getElementById('lessonState');
  const lessonIcon=document.getElementById('lessonIcon');
  const lessonSummary=document.getElementById('lessonSummary');
  const lessonMemory=document.getElementById('lessonMemory');
  const lessonClues=document.getElementById('lessonClues');
  const lessonOrigin=document.getElementById('lessonOrigin');
  const turnBadge=document.getElementById('turnBadge');
  const boardPrompt=document.getElementById('boardPrompt');
  const feedback=document.getElementById('feedback');
  const progressValue=document.getElementById('progressValue');
  const progressBar=document.getElementById('progressBar');
  const progressTrack=document.querySelector('.progress-track');
  const previousButton=document.getElementById('previousLessonBtn');
  const nextButton=document.getElementById('nextLessonBtn');
  const resetBoardButton=document.getElementById('resetBoardBtn');
  const hintButton=document.getElementById('showHintBtn');
  const solutionButton=document.getElementById('showSolutionBtn');
  const resetProgressButton=document.getElementById('resetProgressBtn');

  let state=loadState();
  let lessonIndex=Math.max(0,Math.min(lessons.length-1,state.current));
  let position={};
  let side='w';
  let selected='';
  let solved=false;
  let showingSolution=false;

  function loadState(){
    try{
      const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(stored&&stored.version===1)return{version:1,current:Number(stored.current)||0,completed:[...new Set(Array.isArray(stored.completed)?stored.completed:[])]};
    }catch(_){ }
    return{version:1,current:0,completed:[]};
  }
  function saveState(){
    state.current=lessonIndex;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){ }
    reportHeight();
  }
  function parseFen(fen){
    const parts=String(fen||'').trim().split(/\s+/);
    const next={};
    parts[0].split('/').forEach((rankText,row)=>{
      let file=0;
      [...rankText].forEach(token=>{
        if(/\d/.test(token)){file+=Number(token);return;}
        next['abcdefgh'[file]+String(8-row)]=token;file+=1;
      });
    });
    return{position:next,side:parts[1]==='b'?'b':'w'};
  }
  function applyMove(target,uci){
    const from=uci.slice(0,2);const to=uci.slice(2,4);const promotion=uci.slice(4,5);
    const piece=target[from];
    if(!piece)return;
    delete target[from];
    if((piece==='P'||piece==='p')&&from[0]!==to[0]&&!target[to]){
      const captured=to[0]+from[1];delete target[captured];
    }
    target[to]=promotion?(piece===piece.toUpperCase()?promotion.toUpperCase():promotion.toLowerCase()):piece;
  }
  function setupLesson(){
    const lesson=lessons[lessonIndex];
    const parsed=parseFen(lesson.fen);
    position=parsed.position;
    applyMove(position,lesson.setup);
    side=parsed.side==='w'?'b':'w';
    selected='';solved=false;showingSolution=false;
    renderLesson();renderBoard();
    setFeedback('Wähle die Figur und anschließend ihr Zielfeld.','');
  }
  function renderLesson(){
    const lesson=lessons[lessonIndex];
    lessonStep.textContent='Mattbild '+(lessonIndex+1)+' von '+lessons.length+' · '+lesson.group;
    lessonTitle.textContent=lesson.title;
    lessonIcon.textContent=lesson.icon;
    lessonSummary.textContent=lesson.summary;
    lessonMemory.textContent=lesson.memory;
    lessonClues.textContent='';
    lesson.clues.forEach(clue=>{const item=document.createElement('li');item.textContent=clue;lessonClues.appendChild(item);});
    lessonOrigin.textContent=lesson.origin+' · Aufgabe '+lesson.id+' · ca. '+lesson.rating+' Elo';
    turnBadge.textContent=(side==='w'?'Weiß':'Schwarz')+' am Zug';
    boardPrompt.textContent='Finde den Mattzug!';
    const complete=state.completed.includes(lesson.id);
    lessonState.textContent=complete?'Gemeistert ✓':'Offen';
    lessonState.classList.toggle('complete',complete);
    previousButton.disabled=lessonIndex===0;
    nextButton.textContent=lessonIndex===lessons.length-1?'Zur ersten Lektion ↻':'Nächstes Mattbild →';
    renderList();renderProgress();
  }
  function renderList(){
    listEl.textContent='';
    lessons.forEach((lesson,index)=>{
      const button=document.createElement('button');
      const complete=state.completed.includes(lesson.id);
      button.type='button';button.className='pattern-item'+(index===lessonIndex?' active':'')+(complete?' complete':'');
      button.setAttribute('aria-current',index===lessonIndex?'step':'false');
      button.innerHTML='<span class="pattern-number">'+(index+1)+'</span><span class="pattern-copy"><strong></strong><small></small></span><span class="pattern-check">'+(complete?'✓':'')+'</span>';
      button.querySelector('strong').textContent=lesson.title;
      button.querySelector('small').textContent=lesson.group;
      button.addEventListener('click',()=>selectLesson(index,true));
      listEl.appendChild(button);
    });
  }
  function renderProgress(){
    const count=lessons.filter(lesson=>state.completed.includes(lesson.id)).length;
    progressValue.textContent=count+' von '+lessons.length;
    progressBar.style.width=((count/lessons.length)*100)+'%';
    progressTrack.setAttribute('aria-valuenow',String(count));
  }
  function squareOrder(){
    const files=side==='w'?'abcdefgh':'hgfedcba';
    const ranks=side==='w'?'87654321':'12345678';
    const fields=[];
    for(const rank of ranks)for(const file of files)fields.push(file+rank);
    return fields;
  }
  function renderBoard(){
    boardEl.textContent='';
    const lesson=lessons[lessonIndex];
    const solutionFrom=lesson.solution.slice(0,2);const solutionTo=lesson.solution.slice(2,4);
    const filesAtBottom=side==='w'?'abcdefgh':'hgfedcba';
    const bottomRank=side==='w'?'1':'8';
    const sideFile=side==='w'?'a':'h';
    squareOrder().forEach(field=>{
      const fileIndex='abcdefgh'.indexOf(field[0]);const rankIndex=Number(field[1])-1;
      const square=document.createElement('button');
      square.type='button';square.className='square'+(((fileIndex+rankIndex)%2===0)?' dark':'');
      if(field===selected)square.classList.add('selected');
      if(selected===solutionFrom&&field===solutionTo)square.classList.add('target');
      if(showingSolution&&(field===solutionFrom||field===solutionTo))square.classList.add('focus');
      square.dataset.square=field;square.setAttribute('role','gridcell');square.setAttribute('aria-label',field+(position[field]?' '+pieceNames[position[field]]:''));
      if(position[field]){
        const image=document.createElement('img');image.className='piece';image.src='../assets/pieces/'+pieces[position[field]];image.alt=pieceNames[position[field]];square.appendChild(image);
      }
      if(field[0]===sideFile){const label=document.createElement('span');label.className='coord rank';label.textContent=field[1];square.appendChild(label);}
      if(field[1]===bottomRank){const label=document.createElement('span');label.className='coord file';label.textContent=filesAtBottom[squareOrder().indexOf(field)%8];square.appendChild(label);}
      square.addEventListener('click',()=>handleSquare(field,square));
      boardEl.appendChild(square);
    });
  }
  function handleSquare(field,square){
    if(solved)return;
    const lesson=lessons[lessonIndex];
    const ownPiece=position[field]&&(side==='w'?position[field]===position[field].toUpperCase():position[field]===position[field].toLowerCase());
    if(!selected){
      if(!ownPiece){setFeedback('Wähle zuerst eine eigene Figur.','error');shake(square);return;}
      selected=field;renderBoard();return;
    }
    if(ownPiece){selected=field;renderBoard();return;}
    const attempt=selected+field;
    selected='';
    if(attempt!==lesson.solution){setFeedback('Noch nicht – dieses Mattbild hat einen klareren Schlusszug. Prüfe Schachgebote und Fluchtfelder.','error');shake(square);renderBoard();return;}
    applyMove(position,lesson.solution);solved=true;
    if(!state.completed.includes(lesson.id))state.completed.push(lesson.id);
    saveState();renderBoard();renderLesson();
    setFeedback('Schachmatt! Genau dieses Muster solltest du dir merken. ✓','success');
  }
  function shake(square){square.classList.add('wrong');setTimeout(()=>square.classList.remove('wrong'),350);}
  function setFeedback(message,type){feedback.textContent=message;feedback.className='feedback'+(type?' '+type:'');}
  function selectLesson(index,focus){lessonIndex=Math.max(0,Math.min(lessons.length-1,index));saveState();setupLesson();if(focus){try{lessonTitle.focus({preventScroll:true});}catch(_){ }}}
  function showHint(){showingSolution=false;setFeedback(lessons[lessonIndex].hint,'hint');}
  function showSolution(){
    const lesson=lessons[lessonIndex];showingSolution=true;selected='';renderBoard();
    setFeedback('Lösung: '+lesson.solution.slice(0,2)+' → '+lesson.solution.slice(2,4)+'. Setze die Stellung zurück und spiele den Zug selbst.','hint');
  }
  function resetProgress(){
    if(!window.confirm('Möchtest du den Fortschritt der Mattbilder-Schule wirklich zurücksetzen?'))return;
    state={version:1,current:0,completed:[]};lessonIndex=0;saveState();setupLesson();setFeedback('Der Lernpfad beginnt wieder beim Grundreihenmatt.','hint');
  }
  function reportHeight(){
    try{window.parent.postMessage({type:'hammerschach-mate-school-height',height:Math.ceil(document.documentElement.scrollHeight)},window.location.origin&&window.location.origin!=='null'?window.location.origin:'*');}catch(_){ }
  }

  previousButton.addEventListener('click',()=>selectLesson(lessonIndex-1,true));
  nextButton.addEventListener('click',()=>selectLesson(lessonIndex===lessons.length-1?0:lessonIndex+1,true));
  resetBoardButton.addEventListener('click',setupLesson);
  hintButton.addEventListener('click',showHint);
  solutionButton.addEventListener('click',showSolution);
  resetProgressButton.addEventListener('click',resetProgress);
  window.addEventListener('message',event=>{
    if(window.location.origin!=='null'&&event.origin!==window.location.origin)return;
    const message=event.data&&typeof event.data==='object'?event.data:{};
    if(message.type==='hammerschach-mate-school-context')document.documentElement.classList.toggle('dark-mode',message.darkMode===true);
  });
  window.addEventListener('resize',reportHeight,{passive:true});
  if(typeof ResizeObserver==='function')new ResizeObserver(reportHeight).observe(document.body);
  setupLesson();
  try{window.parent.postMessage({type:'hammerschach-mate-school-ready'},window.location.origin&&window.location.origin!=='null'?window.location.origin:'*');}catch(_){ }
  reportHeight();
}());

'use strict';

(function initialiseMateSchool(){
  const STORAGE_KEY='hammerschachMateSchoolProgressV2';
  const catalogue=window.HAMMERSCHACH_MATTBILDER_DATA;
  if(!catalogue||!Array.isArray(catalogue.motifs)||catalogue.motifs.length!==30){
    document.body.textContent='Die Mattbilder-Sammlung konnte nicht geladen werden.';
    return;
  }

  const allMotifs=catalogue.motifs;
  const pieces={
    P:'Chess_plt45.svg',R:'Chess_rlt45.svg',N:'Chess_nlt45.svg',B:'Chess_blt45.svg',Q:'Chess_qlt45.svg',K:'Chess_klt45.svg',
    p:'Chess_pdt45.svg',r:'Chess_rdt45.svg',n:'Chess_ndt45.svg',b:'Chess_bdt45.svg',q:'Chess_qdt45.svg',k:'Chess_kdt45.svg'
  };
  const pieceNames={P:'weißer Bauer',R:'weißer Turm',N:'weißer Springer',B:'weißer Läufer',Q:'weiße Dame',K:'weißer König',p:'schwarzer Bauer',r:'schwarzer Turm',n:'schwarzer Springer',b:'schwarzer Läufer',q:'schwarze Dame',k:'schwarzer König'};

  const boardEl=document.getElementById('board');
  const listEl=document.getElementById('patternList');
  const taskPicker=document.getElementById('taskPicker');
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
  const accessText=document.getElementById('accessText');
  const accessBadge=document.getElementById('accessBadge');
  const previousButton=document.getElementById('previousLessonBtn');
  const nextButton=document.getElementById('nextLessonBtn');
  const resetBoardButton=document.getElementById('resetBoardBtn');
  const hintButton=document.getElementById('showHintBtn');
  const solutionButton=document.getElementById('showSolutionBtn');
  const resetProgressButton=document.getElementById('resetProgressBtn');

  let loggedIn=false;
  let state=loadState();
  let position={};
  let side='w';
  let selected='';
  let solved=false;
  let showingSolution=false;

  function blankCursor(){return{motif:0,task:0};}
  function loadState(){
    try{
      const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(stored&&stored.version===2){
        return{
          version:2,
          visitor:stored.visitor&&typeof stored.visitor==='object'?stored.visitor:blankCursor(),
          member:stored.member&&typeof stored.member==='object'?stored.member:blankCursor(),
          completed:[...new Set(Array.isArray(stored.completed)?stored.completed:[])]
        };
      }
    }catch(_){ }
    return{version:2,visitor:blankCursor(),member:blankCursor(),completed:[]};
  }
  function saveState(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){ }
    reportHeight();
  }
  function availableMotifs(){return loggedIn?allMotifs:allMotifs.slice(0,10);}
  function cursor(){return loggedIn?state.member:state.visitor;}
  function clampCursor(){
    const current=cursor();
    const motifs=availableMotifs();
    current.motif=Math.max(0,Math.min(motifs.length-1,Number(current.motif)||0));
    const tasks=motifs[current.motif]&&Array.isArray(motifs[current.motif].tasks)?motifs[current.motif].tasks:[];
    current.task=Math.max(0,Math.min(Math.max(0,tasks.length-1),Number(current.task)||0));
  }
  function activeMotif(){clampCursor();return availableMotifs()[cursor().motif];}
  function activeTask(){const motif=activeMotif();return motif.tasks[cursor().task];}
  function allAvailableTasks(){return availableMotifs().flatMap(motif=>motif.tasks);}

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
    if((piece==='P'||piece==='p')&&from[0]!==to[0]&&!target[to])delete target[to[0]+from[1]];
    if((piece==='K'||piece==='k')&&Math.abs('abcdefgh'.indexOf(from[0])-'abcdefgh'.indexOf(to[0]))===2){
      const kingSide=to[0]==='g';
      const rookFrom=(kingSide?'h':'a')+from[1];
      const rookTo=(kingSide?'f':'d')+from[1];
      if(target[rookFrom]){target[rookTo]=target[rookFrom];delete target[rookFrom];}
    }
    target[to]=promotion?(piece===piece.toUpperCase()?promotion.toUpperCase():promotion.toLowerCase()):piece;
  }
  function setupTask(){
    const task=activeTask();
    const parsed=parseFen(task.fen);
    position=parsed.position;
    side=parsed.side;
    selected='';solved=false;showingSolution=false;
    renderLesson();renderBoard();
    setFeedback('Wähle die Figur und anschließend ihr Zielfeld.','');
  }
  function renderLesson(){
    const motifs=availableMotifs();
    const current=cursor();
    const motif=activeMotif();
    const task=activeTask();
    lessonStep.textContent='Mattmotiv '+(current.motif+1)+' von '+motifs.length+' · Aufgabe '+(current.task+1)+' von '+motif.tasks.length+' · '+motif.group;
    lessonTitle.textContent=motif.title;
    lessonIcon.textContent=motif.icon;
    lessonSummary.textContent=motif.summary;
    lessonMemory.textContent=motif.memory;
    lessonClues.textContent='';
    motif.clues.forEach(clue=>{const item=document.createElement('li');item.textContent=clue;lessonClues.appendChild(item);});
    lessonOrigin.textContent='Andili-Vorlage · Lichess-Beispiel '+task.sourceGame+' · '+task.variant;
    turnBadge.textContent=(side==='w'?'Weiß':'Schwarz')+' am Zug';
    boardPrompt.textContent='Finde den Mattzug!';
    const complete=state.completed.includes(task.id);
    lessonState.textContent=complete?'Gemeistert ✓':'Offen';
    lessonState.classList.toggle('complete',complete);
    const globalIndex=current.motif*5+current.task;
    const total=motifs.length*5;
    previousButton.disabled=globalIndex===0;
    nextButton.textContent=globalIndex===total-1?'Zur ersten Aufgabe ↻':'Nächste Aufgabe →';
    accessText.textContent=motifs.length+' Mattmotive · '+total+' Aufgaben';
    accessBadge.textContent=loggedIn?'Mitgliederbereich':'Besucherbereich';
    accessBadge.classList.toggle('member',loggedIn);
    renderList();renderTaskPicker();renderProgress();
  }
  function renderList(){
    const motifs=availableMotifs();
    const current=cursor();
    listEl.textContent='';
    motifs.forEach((motif,index)=>{
      const completed=motif.tasks.filter(task=>state.completed.includes(task.id)).length;
      const button=document.createElement('button');
      button.type='button';
      button.className='pattern-item'+(index===current.motif?' active':'')+(completed===motif.tasks.length?' complete':'');
      button.setAttribute('aria-current',index===current.motif?'step':'false');
      button.innerHTML='<span class="pattern-number">'+(index+1)+'</span><span class="pattern-copy"><strong></strong><small></small></span><span class="pattern-check">'+(completed===motif.tasks.length?'✓':'')+'</span>';
      button.querySelector('strong').textContent=motif.title;
      button.querySelector('small').textContent=completed+'/'+motif.tasks.length+' Aufgaben';
      button.addEventListener('click',()=>selectMotif(index,true));
      listEl.appendChild(button);
    });
  }
  function renderTaskPicker(){
    const motif=activeMotif();
    const current=cursor();
    taskPicker.textContent='';
    motif.tasks.forEach((task,index)=>{
      const button=document.createElement('button');
      const complete=state.completed.includes(task.id);
      button.type='button';
      button.className='task-choice'+(index===current.task?' active':'')+(complete?' complete':'');
      button.textContent=complete?'✓ '+(index+1):'Aufgabe '+(index+1);
      button.setAttribute('aria-pressed',index===current.task?'true':'false');
      button.addEventListener('click',()=>selectTask(index,true));
      taskPicker.appendChild(button);
    });
  }
  function renderProgress(){
    const tasks=allAvailableTasks();
    const count=tasks.filter(task=>state.completed.includes(task.id)).length;
    progressValue.textContent=count+' von '+tasks.length;
    progressBar.style.width=(tasks.length?((count/tasks.length)*100):0)+'%';
    progressTrack.setAttribute('aria-valuemax',String(tasks.length));
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
    const task=activeTask();
    const solutionFrom=task.solution.slice(0,2);const solutionTo=task.solution.slice(2,4);
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
      if(field[1]===bottomRank){const label=document.createElement('span');label.className='coord file';label.textContent=field[0];square.appendChild(label);}
      square.addEventListener('click',()=>handleSquare(field,square));
      boardEl.appendChild(square);
    });
  }
  function handleSquare(field,square){
    if(solved)return;
    const task=activeTask();
    const ownPiece=position[field]&&(side==='w'?position[field]===position[field].toUpperCase():position[field]===position[field].toLowerCase());
    if(!selected){
      if(!ownPiece){setFeedback('Wähle zuerst eine eigene Figur.','error');shake(square);return;}
      selected=field;renderBoard();return;
    }
    if(ownPiece){selected=field;renderBoard();return;}
    const attempt=selected+field;
    selected='';
    if(attempt!==task.solution){setFeedback('Noch nicht – prüfe alle Schachgebote und die Fluchtfelder des Königs.','error');shake(square);renderBoard();return;}
    applyMove(position,task.solution);solved=true;
    if(!state.completed.includes(task.id))state.completed.push(task.id);
    saveState();renderBoard();renderLesson();
    setFeedback('Schachmatt! Genau dieses Muster solltest du dir merken. ✓','success');
  }
  function shake(square){square.classList.add('wrong');setTimeout(()=>square.classList.remove('wrong'),350);}
  function setFeedback(message,type){feedback.textContent=message;feedback.className='feedback'+(type?' '+type:'');}
  function selectMotif(index,focus){cursor().motif=Math.max(0,Math.min(availableMotifs().length-1,index));cursor().task=0;saveState();setupTask();focusTitle(focus);}
  function selectTask(index,focus){cursor().task=Math.max(0,Math.min(activeMotif().tasks.length-1,index));saveState();setupTask();focusTitle(focus);}
  function focusTitle(focus){if(!focus)return;try{lessonTitle.focus({preventScroll:true});}catch(_){ }}
  function moveTask(delta){
    const motifs=availableMotifs();
    const current=cursor();
    const total=motifs.length*5;
    let index=current.motif*5+current.task+delta;
    if(index>=total)index=0;
    if(index<0)index=0;
    current.motif=Math.floor(index/5);current.task=index%5;
    saveState();setupTask();focusTitle(true);
  }
  function showHint(){showingSolution=false;setFeedback(activeMotif().hint,'hint');}
  function showSolution(){
    const task=activeTask();showingSolution=true;selected='';renderBoard();
    setFeedback('Lösung: '+task.solution.slice(0,2)+' → '+task.solution.slice(2,4)+'. Setze die Stellung zurück und spiele den Zug selbst.','hint');
  }
  function resetProgress(){
    const label=loggedIn?'der gesamten Mitglieder-Sammlung':'des Besucherumfangs';
    if(!window.confirm('Möchtest du den Fortschritt '+label+' wirklich zurücksetzen?'))return;
    const ids=new Set(allAvailableTasks().map(task=>task.id));
    state.completed=state.completed.filter(id=>!ids.has(id));
    cursor().motif=0;cursor().task=0;saveState();setupTask();
    setFeedback('Der Lernpfad beginnt wieder bei der ersten Aufgabe.','hint');
  }
  function setLoggedIn(active){
    const next=active===true;
    if(next===loggedIn)return;
    loggedIn=next;clampCursor();saveState();setupTask();
  }
  function reportHeight(){
    try{window.parent.postMessage({type:'hammerschach-mate-school-height',height:Math.ceil(document.documentElement.scrollHeight)},window.location.origin&&window.location.origin!=='null'?window.location.origin:'*');}catch(_){ }
  }

  previousButton.addEventListener('click',()=>moveTask(-1));
  nextButton.addEventListener('click',()=>moveTask(1));
  resetBoardButton.addEventListener('click',setupTask);
  hintButton.addEventListener('click',showHint);
  solutionButton.addEventListener('click',showSolution);
  resetProgressButton.addEventListener('click',resetProgress);
  window.addEventListener('message',event=>{
    if(window.location.origin!=='null'&&event.origin!==window.location.origin)return;
    const message=event.data&&typeof event.data==='object'?event.data:{};
    if(message.type==='hammerschach-mate-school-context'){
      document.documentElement.classList.toggle('dark-mode',message.darkMode===true);
      setLoggedIn(message.loggedIn===true);
    }
  });
  window.addEventListener('resize',reportHeight,{passive:true});
  if(typeof ResizeObserver==='function')new ResizeObserver(reportHeight).observe(document.body);
  setupTask();
  try{window.parent.postMessage({type:'hammerschach-mate-school-ready'},window.location.origin&&window.location.origin!=='null'?window.location.origin:'*');}catch(_){ }
  reportHeight();
}());

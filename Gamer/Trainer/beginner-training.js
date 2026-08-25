'use strict';

(function initialiseBeginnerTrainer(){
  const STORAGE_KEY='hammerschachBeginnerTrainingProgressV1';
  const REQUESTED_MODE_KEY='hammerschachTrainerRequestedMode';
  const stageDefinitions=[
    {
      title:'Matt in einem Zug',short:'Matt in 1',goal:10,
      description:'Erkenne direkte Mattbilder und kontrolliere alle Fluchtfelder des Königs.',
      tip:'Prüfe zuerst alle Schachgebote – und danach, ob der König wirklich kein Feld mehr hat.',
      match:p=>hasTheme(p,'mateIn1')&&rating(p)<=1100&&moveCount(p)<=3
    },
    {
      title:'Der erste Taktikblick',short:'Ein-Zug-Taktik',goal:10,
      description:'Finde ungedeckte Figuren, einfache Materialgewinne und unmittelbare Drohungen.',
      tip:'Arbeite immer in derselben Reihenfolge: Schachgebote, Schlagzüge, Drohungen.',
      match:p=>hasAnyTheme(p,['hangingPiece','capturingDefender','advantage'])&&!hasTheme(p,'mate')&&rating(p)<=1150&&moveCount(p)<=4
    },
    {
      title:'Gabeln erkennen',short:'Gabeln',goal:10,
      description:'Greife mit einem Zug zwei oder mehr gegnerische Ziele gleichzeitig an.',
      tip:'Springergabeln fallen zuerst auf – aber auch Bauern, Dame und König können gabeln.',
      match:p=>hasTheme(p,'fork')&&rating(p)<=1250&&moveCount(p)<=6
    },
    {
      title:'Fesselung und Spieß',short:'Linienmotive',goal:10,
      description:'Nutze unbewegliche Figuren und Angriffe entlang einer Linie oder Diagonale.',
      tip:'Schau hinter die angegriffene Figur: Was wird sichtbar, wenn sie zieht oder geschlagen wird?',
      match:p=>(hasTheme(p,'pin')||hasTheme(p,'skewer'))&&rating(p)<=1350&&moveCount(p)<=6
    },
    {
      title:'Matt in zwei Zügen',short:'Matt in 2',goal:10,
      description:'Berechne die beste Verteidigung des Gegners und setze danach sicher matt.',
      tip:'Nach deinem ersten Zug antwortet der Gegner automatisch – plane dessen beste Abwehr mit ein.',
      match:p=>hasTheme(p,'mateIn2')&&rating(p)<=1400&&moveCount(p)<=5
    },
    {
      title:'Abschlussprüfung',short:'Abschluss-Mix',goal:15,
      description:'Löse einen abwechslungsreichen Mix aus Matt, Materialgewinn und taktischen Motiven.',
      tip:'Benenne das Motiv erst nach dem Lösen. Während der Aufgabe zählt nur die Stellung.',
      match:p=>rating(p)>=900&&rating(p)<=1450&&moveCount(p)<=6&&hasAnyTheme(p,['advantage','crushing','hangingPiece','fork','pin','skewer','discoveredAttack','deflection','sacrifice','mate'])
    }
  ];
  const totalGoal=stageDefinitions.reduce((sum,stage)=>sum+stage.goal,0);
  let progress=loadProgress();
  let currentStage=Math.max(0,Math.min(stageDefinitions.length-1,progress.activeStage));
  let reviewActive=false;
  let currentAttempt={id:'',stage:currentStage,failed:false,resolved:false};
  let controllerReady=false;
  let requestedMode=consumeRequestedMode();
  if(requestedMode)progress.mode=requestedMode;

  const panel=document.getElementById('beginnerTrainingPanel');
  const coachDashboard=document.getElementById('coachDashboard');
  const freeTrainingIntro=document.getElementById('freeTrainingIntro');
  const btnCoachMode=document.getElementById('btnCoachMode');
  const btnFreeMode=document.getElementById('btnFreeMode');
  const stageList=document.getElementById('coachStageList');
  const progressText=document.getElementById('coachProgressText');
  const progressHint=document.getElementById('coachProgressHint');
  const progressBar=document.getElementById('coachProgressBar');
  const progressTrack=document.querySelector('.coach-progress-track');
  const solvedCount=document.getElementById('coachSolvedCount');
  const reviewCount=document.getElementById('coachReviewCount');
  const stageCount=document.getElementById('coachStageCount');
  const currentTitle=document.getElementById('coachCurrentTitle');
  const currentDescription=document.getElementById('coachCurrentDescription');
  const currentTip=document.getElementById('coachCurrentTip');
  const btnCoachStart=document.getElementById('btnCoachStart');
  const btnCoachReview=document.getElementById('btnCoachReview');
  const reviewBadge=document.getElementById('coachReviewBadge');
  const btnCoachReset=document.getElementById('btnCoachReset');
  const btnNewPuzzle=document.getElementById('btnNewPuzzle');

  function emptyProgress(){
    return {version:1,mode:'coach',activeStage:0,solvedByStage:stageDefinitions.map(()=>[]),review:[],recent:[]};
  }
  function loadProgress(){
    let stored=null;
    try{stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch(_){stored=null;}
    const clean=emptyProgress();
    if(!stored||stored.version!==1)return clean;
    clean.mode=stored.mode==='free'?'free':'coach';
    clean.activeStage=Math.max(0,Math.min(stageDefinitions.length-1,Math.floor(Number(stored.activeStage)||0)));
    if(Array.isArray(stored.solvedByStage)){
      clean.solvedByStage=stageDefinitions.map((_,index)=>uniqueIds(stored.solvedByStage[index]));
    }
    if(Array.isArray(stored.review)){
      clean.review=stored.review.map(item=>{
        if(typeof item==='string')return{id:item,stage:0};
        return{id:cleanId(item&&item.id),stage:Math.max(0,Math.min(stageDefinitions.length-1,Math.floor(Number(item&&item.stage)||0)))};
      }).filter(item=>item.id).filter((item,index,array)=>array.findIndex(candidate=>candidate.id===item.id)===index).slice(0,100);
    }
    clean.recent=uniqueIds(stored.recent).slice(-20);
    return clean;
  }
  function saveProgress(){
    progress.activeStage=currentStage;
    progress.mode=isCoachMode()?'coach':'free';
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(progress));}catch(_){ }
    if(typeof scheduleTrainerSessionSave==='function')scheduleTrainerSessionSave();
  }
  function consumeRequestedMode(){
    let mode='';
    try{
      mode=sessionStorage.getItem(REQUESTED_MODE_KEY)||'';
      sessionStorage.removeItem(REQUESTED_MODE_KEY);
    }catch(_){ }
    return mode==='free'?'free':(mode==='coach'?'coach':'');
  }
  function cleanId(value){return String(value||'').trim().slice(0,64);}
  function uniqueIds(values){return [...new Set((Array.isArray(values)?values:[]).map(cleanId).filter(Boolean))].slice(0,500);}
  function themes(p){return Array.isArray(p&&p.themes)?p.themes:[];}
  function hasTheme(p,theme){return themes(p).includes(theme);}
  function hasAnyTheme(p,list){return list.some(theme=>hasTheme(p,theme));}
  function rating(p){return Math.round(Number(p&&p.rating)||1200);}
  function moveCount(p){return Array.isArray(p&&p.moves)?p.moves.length:99;}
  function solvedForStage(index){return progress.solvedByStage[index]||[];}
  function stageComplete(index){return solvedForStage(index).length>=stageDefinitions[index].goal;}
  function stageUnlocked(index){
    if(index===0)return true;
    for(let previous=0;previous<index;previous++)if(!stageComplete(previous))return false;
    return true;
  }
  function completedStages(){return stageDefinitions.filter((_,index)=>stageComplete(index)).length;}
  function totalSolved(){return progress.solvedByStage.reduce((sum,ids,index)=>sum+Math.min(ids.length,stageDefinitions[index].goal),0);}
  function isCoachMode(){return progress.mode!=='free';}

  function renderStages(){
    if(!stageList)return;
    stageList.textContent='';
    stageDefinitions.forEach((stage,index)=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='coach-stage'+(index===currentStage?' active':'')+(stageComplete(index)?' complete':'');
      button.disabled=!stageUnlocked(index);
      button.setAttribute('aria-pressed',index===currentStage?'true':'false');
      button.innerHTML='<span class="coach-stage-number">'+(stageComplete(index)?'✓ Erledigt':'Block '+(index+1))+'</span><span class="coach-stage-name"></span><span class="coach-stage-progress"></span>';
      button.querySelector('.coach-stage-name').textContent=stage.short;
      button.querySelector('.coach-stage-progress').textContent=Math.min(solvedForStage(index).length,stage.goal)+' / '+stage.goal+' gemeistert';
      button.addEventListener('click',()=>selectStage(index,true));
      stageList.appendChild(button);
    });
  }
  function renderCoachUi(){
    const coach=isCoachMode();
    document.body.classList.toggle('coach-mode',coach);
    document.body.classList.toggle('free-training-mode',!coach);
    document.body.classList.toggle('coach-review-active',coach&&reviewActive);
    if(coachDashboard)coachDashboard.hidden=!coach;
    if(freeTrainingIntro)freeTrainingIntro.hidden=coach;
    btnCoachMode?.classList.toggle('active',coach);
    btnFreeMode?.classList.toggle('active',!coach);
    btnCoachMode?.setAttribute('aria-pressed',coach?'true':'false');
    btnFreeMode?.setAttribute('aria-pressed',coach?'false':'true');
    const solved=totalSolved();
    const percent=Math.max(0,Math.min(100,Math.round((solved/totalGoal)*100)));
    if(progressText)progressText.textContent=solved+' von '+totalGoal+' Aufgaben gemeistert';
    if(progressHint)progressHint.textContent=solved>=totalGoal?'Stark – der gesamte Anfänger-Lernpfad ist geschafft!':(reviewActive?'Wiederhole jetzt Aufgaben, die noch nicht sicher saßen.':'Arbeite in Ruhe Block für Block.');
    if(progressBar)progressBar.style.width=percent+'%';
    if(progressTrack){progressTrack.setAttribute('aria-valuemax',String(totalGoal));progressTrack.setAttribute('aria-valuenow',String(solved));}
    if(solvedCount)solvedCount.textContent=String(solved);
    if(reviewCount)reviewCount.textContent=String(progress.review.length);
    if(stageCount)stageCount.textContent=(currentStage+1)+'/'+stageDefinitions.length;
    if(reviewBadge)reviewBadge.textContent=String(progress.review.length);
    if(btnCoachReview)btnCoachReview.disabled=progress.review.length===0;
    if(btnCoachStart)btnCoachStart.textContent=currentAttempt.id?'Nächste Aufgabe':'Training starten';
    if(btnNewPuzzle)btnNewPuzzle.textContent=reviewActive?'🔁 Nächste Wiederholung':'🧩 Nächste Anfänger-Aufgabe';
    const stage=stageDefinitions[currentStage];
    if(currentTitle)currentTitle.textContent=reviewActive?'Fehlertraining: '+stage.title:stage.title;
    if(currentDescription)currentDescription.textContent=reviewActive?'Diese Aufgaben hast du noch nicht fehlerfrei gelöst. Jetzt werden sie sicher gefestigt.':stage.description;
    if(currentTip)currentTip.innerHTML='<strong>Trainer-Tipp:</strong> '+stage.tip;
    renderStages();
    if(typeof updateTrainerAccountUi==='function')updateTrainerAccountUi();
    if(typeof reportTrainerHeight==='function')setTimeout(reportTrainerHeight,0);
  }

  function candidatePool(stageIndex){
    const stage=stageDefinitions[stageIndex];
    return (Array.isArray(allPuzzles)?allPuzzles:[]).filter(stage.match);
  }
  function chooseFromPool(pool,excluded){
    const available=pool.filter(p=>!excluded.has(cleanId(p.id)));
    const source=available.length?available:pool;
    if(!source.length)return null;
    return source[Math.floor(Math.random()*source.length)];
  }
  function chooseCoachPuzzle(){
    if(!isCoachMode())return null;
    if(reviewActive){
      while(progress.review.length){
        const item=progress.review[0];
        const found=(Array.isArray(allPuzzles)?allPuzzles:[]).find(p=>cleanId(p.id)===item.id);
        if(found){currentStage=item.stage;progress.activeStage=currentStage;saveProgress();renderCoachUi();return found;}
        progress.review.shift();
      }
      reviewActive=false;
    }
    const pool=candidatePool(currentStage);
    const mastered=progress.solvedByStage.reduce((ids,stageIds)=>ids.concat(stageIds),[]);
    const excluded=new Set([...mastered,...progress.recent]);
    const selectedPuzzle=chooseFromPool(pool,excluded)||chooseRandomFilteredPuzzle();
    if(selectedPuzzle){
      progress.recent=[...progress.recent,cleanId(selectedPuzzle.id)].filter(Boolean).slice(-20);
      saveProgress();
    }
    return selectedPuzzle;
  }
  function selectStage(index,startPuzzle){
    if(!stageUnlocked(index))return;
    currentStage=index;
    progress.activeStage=index;
    reviewActive=false;
    currentAttempt={id:'',stage:index,failed:false,resolved:false};
    saveProgress();
    renderCoachUi();
    if(startPuzzle&&controllerReady){
      isRetry=false;
      const puzzle=chooseCoachPuzzle();
      if(puzzle)setupPuzzle(puzzle);
    }
  }
  function setMode(mode,startPuzzle){
    progress.mode=mode==='free'?'free':'coach';
    reviewActive=false;
    currentAttempt={id:'',stage:currentStage,failed:false,resolved:false};
    saveProgress();
    renderCoachUi();
    if(!controllerReady||!startPuzzle)return;
    isRetry=false;
    const puzzle=isCoachMode()?chooseCoachPuzzle():chooseRandomFilteredPuzzle();
    if(puzzle)setupPuzzle(puzzle);
  }
  function onPuzzleSetup(puzzle){
    if(!isCoachMode())return;
    currentAttempt={id:cleanId(puzzle&&puzzle.id),stage:currentStage,failed:false,resolved:false};
    renderCoachUi();
  }
  function addReview(id,stage){
    if(!id||progress.review.some(item=>item.id===id))return;
    progress.review.push({id,stage});
  }
  function recordResult(result,options){
    if(!isCoachMode()||!currentAttempt.id||currentAttempt.resolved)return '';
    if(result==='fail'){
      currentAttempt.failed=true;
      addReview(currentAttempt.id,currentAttempt.stage);
      saveProgress();
      renderCoachUi();
      return '';
    }
    if(result!=='success')return '';
    currentAttempt.resolved=true;
    const learnedCleanly=!currentAttempt.failed&&!(options&&options.solution);
    if(!learnedCleanly){
      addReview(currentAttempt.id,currentAttempt.stage);
      saveProgress();
      renderCoachUi();
      return 'Gelöst – diese Aufgabe kommt zur sicheren Wiederholung zurück.';
    }
    const ids=solvedForStage(currentAttempt.stage);
    if(!ids.includes(currentAttempt.id))ids.push(currentAttempt.id);
    progress.review=progress.review.filter(item=>item.id!==currentAttempt.id);
    let message='Stark! Diese Aufgabe sitzt.';
    if(stageComplete(currentAttempt.stage)){
      const next=currentAttempt.stage+1;
      if(next<stageDefinitions.length){
        currentStage=next;
        progress.activeStage=next;
        message='Trainingsblock gemeistert! Der nächste Block ist jetzt freigeschaltet.';
      }else{
        message='Abschlussprüfung bestanden – der Anfänger-Lernpfad ist geschafft!';
      }
    }
    saveProgress();
    renderCoachUi();
    return message;
  }
  function startReview(){
    if(!progress.review.length)return;
    reviewActive=true;
    currentAttempt={id:'',stage:currentStage,failed:false,resolved:false};
    renderCoachUi();
    if(controllerReady){
      isRetry=false;
      const puzzle=chooseCoachPuzzle();
      if(puzzle)setupPuzzle(puzzle);
    }
  }
  function resetCoach(){
    if(!window.confirm('Möchtest du den gesamten Anfänger-Lernpfad und alle Wiederholungen wirklich zurücksetzen?'))return;
    const mode=progress.mode;
    progress=emptyProgress();
    progress.mode=mode;
    currentStage=0;
    reviewActive=false;
    currentAttempt={id:'',stage:0,failed:false,resolved:false};
    saveProgress();
    renderCoachUi();
    if(controllerReady&&isCoachMode()){
      const puzzle=chooseCoachPuzzle();
      if(puzzle)setupPuzzle(puzzle);
    }
  }
  function shouldBypassSessionRestore(){
    if(requestedMode)return true;
    let session=null;
    try{session=JSON.parse(localStorage.getItem('hammerschachGamerTrainerSessionV1')||'null');}catch(_){session=null;}
    return isCoachMode()&&(!session||session.beginnerTrainingMode!=='coach');
  }
  function ready(){
    controllerReady=true;
    requestedMode='';
    renderCoachUi();
  }

  btnCoachMode?.addEventListener('click',()=>setMode('coach',true));
  btnFreeMode?.addEventListener('click',()=>setMode('free',true));
  btnCoachStart?.addEventListener('click',()=>{
    if(!isCoachMode())setMode('coach',false);
    isRetry=false;
    const puzzle=chooseCoachPuzzle();
    if(puzzle)setupPuzzle(puzzle);
  });
  btnCoachReview?.addEventListener('click',startReview);
  btnCoachReset?.addEventListener('click',resetCoach);
  window.addEventListener('message',event=>{
    if(event.source!==window.parent)return;
    if(location.origin!=='null'&&event.origin!==location.origin)return;
    const message=event.data&&typeof event.data==='object'?event.data:{};
    if(message.type==='hammerschach-trainer-open-mode')setMode(message.mode==='free'?'free':'coach',true);
  });

  window.HammerschachBeginnerTrainer={
    isCoachMode,
    choosePuzzle:chooseCoachPuzzle,
    onPuzzleSetup,
    recordResult,
    shouldBypassSessionRestore,
    ready,
    requestMode:mode=>setMode(mode,true)
  };
  renderCoachUi();
}());

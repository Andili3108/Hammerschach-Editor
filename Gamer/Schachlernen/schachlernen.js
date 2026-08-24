'use strict';

(function initialiseLearningCourse(){
  const STORAGE_KEY='hammerschachLearningProgressV1';
  const lessons=[
    {
      title:'Das Schachbrett und die Figuren',
      video:'wE71uYXYLvE',
      intro:'Lerne den Aufbau des Schachbretts, die richtige Ausgangsstellung und die beiden Parteien kennen.',
      goals:['Das Brett richtig ausrichten','Alle sechs Figurenarten unterscheiden','Die Ausgangsstellung wiedererkennen']
    },
    {
      title:'Der Turm',
      video:'HxzkZOkhs_E',
      intro:'Der Turm zieht geradlinig und wird besonders stark, wenn Linien und Reihen frei sind.',
      goals:['Waagerechte und senkrechte Züge verstehen','Blockierte Felder erkennen','Die Bedeutung offener Linien kennenlernen']
    },
    {
      title:'Der Läufer',
      video:'2fO1UxPT2f8',
      intro:'Der Läufer bewegt sich diagonal und bleibt während der gesamten Partie auf seiner Feldfarbe.',
      goals:['Diagonalen sicher erkennen','Eigene und gegnerische Blockaden unterscheiden','Weiß- und schwarzfeldrige Läufer verstehen']
    },
    {
      title:'Die Dame',
      video:'xGizNrzuKgI',
      intro:'Die Dame verbindet die Zugmöglichkeiten von Turm und Läufer und ist deshalb besonders wertvoll.',
      goals:['Gerade und diagonale Züge verbinden','Die Reichweite der Dame einschätzen','Die Dame nicht zu früh gefährden']
    },
    {
      title:'Der Springer',
      video:'oTJ5okzKnko',
      intro:'Der Springer zieht in seiner typischen L-Form und kann als einzige Figur über andere Figuren springen.',
      goals:['Die L-Form zuverlässig erkennen','Sprünge über besetzte Felder verstehen','Mögliche Zielfelder systematisch finden']
    },
    {
      title:'Der König',
      video:'1lOiszeUT88',
      intro:'Der König zieht nur ein Feld, entscheidet aber über Gewinn und Verlust der gesamten Partie.',
      goals:['Legale Königsfelder erkennen','Bedrohte Felder vermeiden','Die besondere Bedeutung des Königs verstehen']
    },
    {
      title:'Der Bauer',
      video:'yfMuZqqsY5M',
      intro:'Bauern ziehen und schlagen unterschiedlich. Dazu kommen Doppelschritt, Umwandlung und weitere Besonderheiten.',
      goals:['Ziehen und Schlagen unterscheiden','Den Doppelschritt verstehen','Die Bauernumwandlung kennenlernen']
    },
    {
      title:'Der Figurenwert',
      video:'a3-tNT9iBD8',
      intro:'Ungefähre Figurenwerte helfen dir einzuschätzen, ob ein Tausch günstig oder ungünstig ist.',
      goals:['Grundwerte der Figuren kennen','Einfache Tausche vergleichen','Material und Stellung auseinanderhalten']
    },
    {
      title:'Die Rochade',
      video:'pNV6QOGf50E',
      intro:'Bei der Rochade bewegen sich König und Turm gemeinsam. Sie schützt den König und entwickelt den Turm.',
      goals:['Kurze und lange Rochade unterscheiden','Alle Rochadebedingungen kennen','Typische Gründe für eine frühe Rochade verstehen']
    },
    {
      title:'Schach, Matt und Patt',
      video:'27wdfkClmkE',
      intro:'Zum Abschluss lernst du, wie ein Schachgebot abgewehrt wird und wodurch Matt und Patt entstehen.',
      goals:['Ein Schachgebot erkennen und beantworten','Schachmatt sicher feststellen','Patt von Matt unterscheiden']
    }
  ];

  const list=document.getElementById('lessonList');
  const progressValue=document.getElementById('progressValue');
  const progressBar=document.getElementById('progressBar');
  const progressTrack=document.querySelector('.progress-track');
  const lessonNumber=document.getElementById('lessonNumber');
  const lessonTitle=document.getElementById('lessonTitle');
  const lessonIntro=document.getElementById('lessonIntro');
  const lessonGoals=document.getElementById('lessonGoals');
  const lessonVideo=document.getElementById('lessonVideo');
  const lessonState=document.getElementById('lessonState');
  const previousButton=document.getElementById('previousLessonBtn');
  const nextButton=document.getElementById('nextLessonBtn');
  const completeButton=document.getElementById('completeLessonBtn');
  const resetButton=document.getElementById('resetProgressBtn');
  const feedback=document.getElementById('lessonFeedback');
  let state=loadState();

  function loadState(){
    let stored={current:0,completed:[]};
    try{
      const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(parsed&&typeof parsed==='object')stored=parsed;
    }catch(_){ }
    const current=Math.max(0,Math.min(lessons.length-1,Number(stored.current)||0));
    const completed=Array.isArray(stored.completed)
      ? [...new Set(stored.completed.map(Number).filter(index=>Number.isInteger(index)&&index>=0&&index<lessons.length))]
      : [];
    return {current,completed};
  }

  function saveState(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){ }
  }

  function updateAddress(){
    try{history.replaceState(null,'','#lektion-'+(state.current+1));}catch(_){ }
  }

  function renderList(){
    list.textContent='';
    lessons.forEach((lesson,index)=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='lesson-item'+(index===state.current?' active':'')+(state.completed.includes(index)?' completed':'');
      button.setAttribute('aria-current',index===state.current?'step':'false');
      button.innerHTML='<span class="lesson-index">'+(index+1)+'</span><span class="lesson-name"></span><span class="lesson-check" aria-hidden="true">'+(state.completed.includes(index)?'✓':'')+'</span>';
      button.querySelector('.lesson-name').textContent=lesson.title;
      button.addEventListener('click',()=>selectLesson(index,true));
      list.appendChild(button);
    });
  }

  function renderProgress(){
    const done=state.completed.length;
    progressValue.textContent=done+' von '+lessons.length;
    progressBar.style.width=((done/lessons.length)*100)+'%';
    progressTrack.setAttribute('aria-valuenow',String(done));
  }

  function selectLesson(index,focusHeading){
    state.current=Math.max(0,Math.min(lessons.length-1,index));
    saveState();
    updateAddress();
    render(focusHeading);
  }

  function render(focusHeading){
    const lesson=lessons[state.current];
    const completed=state.completed.includes(state.current);
    lessonNumber.textContent='Lektion '+(state.current+1)+' von '+lessons.length;
    lessonTitle.textContent=lesson.title;
    lessonIntro.textContent=lesson.intro;
    lessonGoals.textContent='';
    lesson.goals.forEach(goal=>{
      const item=document.createElement('li');
      item.textContent=goal;
      lessonGoals.appendChild(item);
    });
    const nextSource='https://www.youtube-nocookie.com/embed/'+lesson.video+'?rel=0&modestbranding=1';
    if(lessonVideo.src!==nextSource)lessonVideo.src=nextSource;
    lessonVideo.title=lesson.title+' – Videotraining mit TheBigGreek';
    lessonState.textContent=completed?'Erledigt':'Offen';
    lessonState.classList.toggle('completed',completed);
    completeButton.textContent=completed?'✓ Lektion erledigt':'✓ Als erledigt markieren';
    completeButton.classList.toggle('completed',completed);
    previousButton.disabled=state.current===0;
    nextButton.disabled=state.current===lessons.length-1;
    feedback.textContent=completed?'Diese Lektion ist in deinem Fortschritt gespeichert.':'';
    renderList();
    renderProgress();
    reportHeight();
    if(focusHeading){
      try{lessonTitle.focus({preventScroll:true});}catch(_){ }
      document.querySelector('.lesson-card').scrollIntoView({behavior:'smooth',block:'start'});
    }
  }

  function toggleComplete(){
    const index=state.current;
    let message='';
    if(state.completed.includes(index)){
      state.completed=state.completed.filter(value=>value!==index);
      message='Die Lektion wurde wieder als offen markiert.';
    }else{
      state.completed=[...state.completed,index].sort((a,b)=>a-b);
      message=state.completed.length===lessons.length
        ? 'Großartig – du hast den gesamten Grundkurs abgeschlossen!'
        : 'Geschafft! Dein Fortschritt wurde auf diesem Gerät gespeichert.';
    }
    saveState();
    render(false);
    feedback.textContent=message;
  }

  function resetProgress(){
    if(!window.confirm('Möchtest du den gespeicherten Lernfortschritt wirklich zurücksetzen?'))return;
    state={current:0,completed:[]};
    saveState();
    selectLesson(0,false);
    feedback.textContent='Der Kursfortschritt wurde zurückgesetzt.';
  }

  function parentOrigin(){
    return window.location.origin&&window.location.origin!=='null'?window.location.origin:'*';
  }

  function reportHeight(){
    try{
      window.parent.postMessage({type:'hammerschach-learning-height',height:Math.ceil(document.documentElement.scrollHeight)},parentOrigin());
    }catch(_){ }
  }

  previousButton.addEventListener('click',()=>selectLesson(state.current-1,true));
  nextButton.addEventListener('click',()=>selectLesson(state.current+1,true));
  completeButton.addEventListener('click',toggleComplete);
  resetButton.addEventListener('click',resetProgress);
  window.addEventListener('message',event=>{
    if(parentOrigin()!=='*'&&event.origin!==parentOrigin())return;
    const message=event.data&&typeof event.data==='object'?event.data:{};
    if(message.type==='hammerschach-learning-context'){
      document.documentElement.classList.toggle('dark-mode',message.darkMode===true);
      reportHeight();
    }
  });
  window.addEventListener('resize',reportHeight,{passive:true});
  if(typeof ResizeObserver==='function')new ResizeObserver(reportHeight).observe(document.body);

  const hashMatch=String(window.location.hash||'').match(/^#lektion-(\d+)$/);
  if(hashMatch)state.current=Math.max(0,Math.min(lessons.length-1,Number(hashMatch[1])-1));
  render(false);
  try{window.parent.postMessage({type:'hammerschach-learning-ready'},parentOrigin());}catch(_){ }
  reportHeight();
}());

'use strict';
(function initialiseSchool(){
  const catalog=window.HammerschachSchoolCatalog;
  const model=window.HammerschachSchoolModel.create(catalog);
  const LEGACY_KEY='hammerschachLearningProgressV1';
  const STORAGE_PREFIX='hammerschachSchoolProgressV2:';
  const ROUTE_KEY='hammerschachSchoolLocationV1';
  const $=id=>document.getElementById(id);
  const embedded=window.parent!==window;
  let member=false,identity='visitor',visible=!embedded,storageAvailable=true;
  let course=null,lesson=null,lastHeight=0,heightPending=false;
  let state=loadState();
  function read(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;}}
  function loadState(){
    const saved=read(STORAGE_PREFIX+identity);
    if(saved&&saved.version===2)return model.clean(saved);
    const migrated=model.migrate(read(LEGACY_KEY),identity==='visitor'?null:read(STORAGE_PREFIX+'visitor'));
    try{localStorage.setItem(STORAGE_PREFIX+identity,JSON.stringify(migrated));}catch(_){storageAvailable=false;}
    return migrated;
  }
  function saveState(){
    try{localStorage.setItem(STORAGE_PREFIX+identity,JSON.stringify(state));storageAvailable=true;}
    catch(_){storageAvailable=false;}
    renderStorage();
  }
  function renderStorage(){
    $('storageStatus').textContent=storageAvailable?'':'Dein Browser kann den Lernstand gerade nicht dauerhaft speichern.';
    $('storageNote').textContent=storageAvailable
      ? (member?'Dein Lernstand wird für dein Gamer-Konto nur in diesem Browser gespeichert.':'Dein Besucher-Lernstand wird nur in diesem Browser gespeichert.')+' „Erledigt“ ist deine eigene Markierung.'
      : 'Der Lernstand bleibt nur für diese geöffnete Seite erhalten.';
  }
  function send(message){
    if(embedded)window.parent.postMessage(message,location.origin==='null'?'*':location.origin);
  }
  function reportHeight(){
    if(heightPending)return;
    heightPending=true;
    requestAnimationFrame(()=>{
      heightPending=false;
      const height=Math.ceil(document.querySelector('.learning-app').getBoundingClientRect().height)+4;
      if(height!==lastHeight){lastHeight=height;send({type:'hammerschach-learning-height',height});}
    });
  }
  function setAddress(){
    const hash=course?'#kurs/'+course.id+'/'+lesson.id:'#schule';
    try{history.replaceState(null,'',hash);sessionStorage.setItem(ROUTE_KEY,hash);}catch(_){}
  }
  function stopVideo(){
    $('lessonVideo').removeAttribute('src');
    $('lessonVideo').hidden=true;
    $('videoPlaceholder').hidden=false;
  }
  function allowed(){return model.allowed(lesson,member);}
  function doneCount(item){return item.lessons.filter(entry=>state.completed.includes(entry.id)).length;}
  function nextLesson(item){
    return item.lessons.find(entry=>entry.id===state.current[item.id])||item.lessons[0];
  }
  function goOverview(focus=false){
    course=null;lesson=null;stopVideo();setAddress();render();
    if(focus)focusHeading($('schoolTitle'));
  }
  function openCourse(id,lessonId,focus=true){
    const chosen=catalog.find(item=>item.id===id);
    if(!chosen)return;
    course=chosen;
    lesson=course.lessons.find(item=>item.id===lessonId)||nextLesson(course);
    state.lastCourse=course.id;state.current[course.id]=lesson.id;
    saveState();stopVideo();setAddress();render();
    if(focus)focusHeading($('lessonTitle'));
  }
  function focusHeading(heading){
    heading.focus({preventScroll:true});
    heading.scrollIntoView({behavior:'instant',block:'start'});
  }
  function button(text,className,action){
    const el=document.createElement('button');el.type='button';el.className=className;el.textContent=text;
    el.addEventListener('click',action);return el;
  }
  function renderNavigation(){
    const holder=$('schoolCourseNavigation');holder.textContent='';
    for(const group of ['Nach Spielstärke','Nach Thema']){
      const row=document.createElement('div');row.className='school-nav-group';
      const label=document.createElement('span');label.className='school-nav-label';label.textContent=group;row.append(label);
      for(const item of catalog.filter(entry=>entry.group===group)){
        const el=button(item.title,'school-course-button',()=>openCourse(item.id));
        if(course&&course.id===item.id)el.setAttribute('aria-current','page');
        row.append(el);
      }
      holder.append(row);
    }
    if(course)$('schoolOverviewBtn').removeAttribute('aria-current');else $('schoolOverviewBtn').setAttribute('aria-current','page');
  }
  function renderOverview(){
    $('schoolProgressValue').textContent=state.completed.length+' von '+new Set(catalog.flatMap(item=>item.lessons.map(entry=>entry.id))).size;
    const last=catalog.find(item=>item.id===state.lastCourse)||catalog[0];
    $('continueLearningLabel').textContent=last.title+' · '+nextLesson(last).title;
    $('schoolAccessNote').textContent=member
      ? 'Du bist als Gamer-Mitglied angemeldet. Alle sechs Kurse stehen dir vollständig zur Verfügung.'
      : 'Für Besucher: „Schach lernen“, alle sieben Einsteiger-Grundlagen und je eine Probelektion der weiteren Kurse. Gamer-Mitglieder können nach der Anmeldung alle Lektionen öffnen.';
    const holder=$('schoolCourseCards');holder.textContent='';
    for(const group of ['Nach Spielstärke','Nach Thema']){
      const section=document.createElement('section');section.className='school-course-group';
      const h=document.createElement('h2');h.textContent=group;section.append(h);
      const grid=document.createElement('div');grid.className='school-card-grid';section.append(grid);
      for(const item of catalog.filter(entry=>entry.group===group)){
        const card=document.createElement('article');card.className='school-card';
        const top=document.createElement('div');top.className='school-card-top';
        const icon=document.createElement('span');icon.className='school-card-icon';icon.setAttribute('aria-hidden','true');icon.textContent=item.icon;
        const count=document.createElement('span');count.className='school-card-count';count.textContent=item.lessons.length+' Lektionen';top.append(icon,count);card.append(top);
        const title=document.createElement('h3');title.textContent=item.title;card.append(title);
        const description=document.createElement('p');description.textContent=item.description;card.append(description);
        const access=document.createElement('span');access.className='school-card-access';
        const free=item.lessons.filter(entry=>model.allowed(entry,false)).length;
        access.textContent=member?'Vollständig zugänglich':free===item.lessons.length?'Ohne Anmeldung vollständig zugänglich':free===1?'Eine freie Probelektion':free+' Grundlagen frei zugänglich';card.append(access);
        const progress=document.createElement('span');progress.className='school-card-progress';progress.textContent=doneCount(item)+' von '+item.lessons.length+' erledigt';card.append(progress);
        card.append(button(item.title+' öffnen →','school-card-open',()=>openCourse(item.id)));grid.append(card);
      }
      holder.append(section);
    }
  }
  function renderLessonList(){
    const list=$('lessonList');list.textContent='';
    for(const chapter of new Set(course.lessons.map(item=>item.chapter))){
      const section=document.createElement('section');section.className='lesson-chapter';
      const heading=document.createElement('h3');heading.textContent=chapter;section.append(heading);
      course.lessons.forEach((entry,index)=>{
        if(entry.chapter!==chapter)return;
        const isOpen=model.allowed(entry,member),completed=state.completed.includes(entry.id);
        const item=button('','lesson-item'+(entry.id===lesson.id?' active':'')+(completed?' completed':''),()=>openCourse(course.id,entry.id));
        if(entry.id===lesson.id)item.setAttribute('aria-current','step');
        const number=document.createElement('span');number.className='lesson-index';number.textContent=index+1;
        const name=document.createElement('span');name.className='lesson-name';name.textContent=entry.title;
        const check=document.createElement('span');check.className='lesson-check';check.textContent=isOpen?(completed?'✓':''):'🔒';check.setAttribute('aria-hidden','true');
        item.setAttribute('aria-label',(index+1)+'. '+entry.title+(isOpen?(completed?' – erledigt':' – offen'):' – für Gamer-Mitglieder'));
        item.append(number,name,check);section.append(item);
      });
      list.append(section);
    }
    $('lessonDirectoryCount').textContent=course.lessons.length;
  }
  function renderCourse(){
    const index=course.lessons.indexOf(lesson),done=doneCount(course),completed=state.completed.includes(lesson.id),open=allowed();
    $('courseEyebrow').textContent=course.group+' · Hammerschach-Schachschule';
    $('courseTitle').textContent=course.title;$('courseIntro').textContent=course.description;
    $('progressValue').textContent=done+' von '+course.lessons.length;
    $('progressTrack').setAttribute('aria-valuemax',course.lessons.length);
    $('progressTrack').setAttribute('aria-valuenow',done);
    $('progressBar').style.width=(done/course.lessons.length*100)+'%';
    $('lessonNumber').textContent=lesson.chapter+' · Lektion '+(index+1)+' von '+course.lessons.length;
    $('lessonTitle').textContent=lesson.title;$('lessonIntro').textContent=lesson.intro;
    $('lessonState').textContent=!open?'Mitglieder':completed?'Erledigt':'Offen';
    $('lessonState').classList.toggle('completed',completed&&open);
    $('lessonAccess').textContent=lesson.level?'Vertiefung · Diese Lektion ist anspruchsvoller. Du kannst sie später bearbeiten.':(!member&&open?'Für Besucher frei zugänglich':'');
    $('lessonAccess').hidden=!$('lessonAccess').textContent;
    $('lessonGate').hidden=open;$('videoShell').hidden=!open;$('videoHelp').hidden=!open;
    $('lessonLoginBtn').hidden=!embedded;$('lessonRegisterBtn').hidden=!embedded;$('standaloneLoginLink').hidden=embedded;
    if(!open)stopVideo();
    $('videoAuthor').textContent=lesson.author==='Andili-Videoauswahl'?'Videotraining · Andili-Auswahl':'Videotraining mit '+lesson.author;
    $('lessonVideo').title=lesson.title+' – Videotraining';
    if(open)$('videoExternalLink').href='https://www.youtube.com/watch?v='+lesson.video;else $('videoExternalLink').removeAttribute('href');
    $('lessonNote').textContent=lesson.note||'';$('lessonNote').hidden=!lesson.note;
    $('lessonGoals').textContent='';
    lesson.goals.forEach(goal=>{const li=document.createElement('li');li.textContent=goal;$('lessonGoals').append(li);});
    $('completeLessonBtn').disabled=!open;
    $('completeLessonBtn').textContent=completed?'✓ Erledigt · Rückgängig':'✓ Als erledigt markieren';
    $('completeLessonBtn').classList.toggle('completed',completed);
    $('previousLessonBtn').disabled=index===0;$('nextLessonBtn').disabled=index===course.lessons.length-1;
    $('lessonFeedback').textContent=completed&&open?'Du hast diese Lektion als erledigt markiert.':'';
    $('courseSourceLink').href=course.source;
    $('courseNextStep').hidden=done!==course.lessons.length;
    $('courseNextStepText').textContent=course.id==='grundkurs'?'Dein Grundkurs ist abgeschlossen. Vertiefe dein Wissen im Kurs „Einsteiger“ oder übe im Trainer.':'Du hast alle Lektionen dieses Kurses markiert. Entdecke ein weiteres Thema oder vertiefe das Gelernte im Trainer.';
    $('nextCourseBtn').textContent=course.id==='grundkurs'?'Einsteiger öffnen →':'Alle Kurse entdecken →';
    document.querySelector('.practice-actions').hidden=!embedded;
    renderLessonList();renderStorage();
  }
  function render(){
    $('schoolOverview').hidden=!!course;$('schoolCourse').hidden=!course;
    renderNavigation();renderOverview();if(course)renderCourse();renderStorage();reportHeight();
  }
  $('schoolOverviewBtn').addEventListener('click',()=>goOverview(true));
  $('continueLearningBtn').addEventListener('click',()=>openCourse(state.lastCourse));
  $('previousLessonBtn').addEventListener('click',()=>{const prev=course.lessons[course.lessons.indexOf(lesson)-1];if(prev)openCourse(course.id,prev.id);});
  $('nextLessonBtn').addEventListener('click',()=>{const next=course.lessons[course.lessons.indexOf(lesson)+1];if(next)openCourse(course.id,next.id);});
  $('loadVideoBtn').addEventListener('click',()=>{
    if(!allowed()||!visible)return;
    $('lessonVideo').src='https://www.youtube-nocookie.com/embed/'+lesson.video+'?rel=0';
    $('lessonVideo').hidden=false;$('videoPlaceholder').hidden=true;reportHeight();
  });
  $('completeLessonBtn').addEventListener('click',()=>{
    if(!allowed())return;
    state=model.toggle(state,lesson.id,member);saveState();render();
    $('lessonFeedback').textContent=state.completed.includes(lesson.id)?(storageAvailable?'Geschafft! Dein Lernstand wurde in diesem Browser gespeichert.':'Geschafft! Die Markierung gilt für diese geöffnete Seite.'):'Die Lektion ist wieder offen.';
  });
  $('resetProgressBtn').addEventListener('click',()=>{
    if(!course||!window.confirm('Möchtest du nur den Lernstand im Kurs „'+course.title+'“ zurücksetzen? Die anderen Kurse bleiben erhalten.'))return;
    state=model.reset(state,course.id);saveState();openCourse(course.id,course.lessons[0].id,false);
    $('lessonFeedback').textContent='Der Lernstand dieses Kurses wurde zurückgesetzt.';
  });
  $('lessonLoginBtn').addEventListener('click',()=>send({type:'hammerschach-learning-open-auth',mode:'login'}));
  $('lessonRegisterBtn').addEventListener('click',()=>send({type:'hammerschach-learning-open-auth',mode:'register'}));
  $('standaloneLoginLink').addEventListener('click',()=>{try{sessionStorage.setItem('hammerschachActiveEmbeddedToolV1','learning');}catch(_){}});
  $('openBeginnerTrainingBtn').addEventListener('click',()=>send({type:'hammerschach-learning-open-trainer',mode:course.id==='grundkurs'||course.id==='einsteiger'?'coach':'free'}));
  $('openMateSchoolBtn').addEventListener('click',()=>send({type:'hammerschach-learning-open-mate-school'}));
  $('nextCourseBtn').addEventListener('click',()=>course.id==='grundkurs'?openCourse('einsteiger'):goOverview(true));
  $('lessonDirectory').addEventListener('toggle',reportHeight);
  window.addEventListener('message',event=>{
    if(!embedded||event.source!==window.parent||event.origin!==location.origin)return;
    const message=event.data&&typeof event.data==='object'?event.data:{};
    if(message.type==='hammerschach-learning-context'){
      const nextMember=message.loggedIn===true;
      const nextIdentity=nextMember?'member:'+String(message.userId||message.username||'local'):'visitor';
      if(member!==nextMember||identity!==nextIdentity){
        member=nextMember;identity=nextIdentity;state=loadState();stopVideo();
        if(course){state.current[course.id]=lesson.id;state.lastCourse=course.id;saveState();}
        render();
      }
      reportHeight();
    }
    if(message.type==='hammerschach-learning-visibility'){
      visible=message.visible===true;if(!visible)stopVideo();else reportHeight();
    }
  });
  window.addEventListener('storage',event=>{
    if(event.key===STORAGE_PREFIX+identity||event.key===null){state=model.clean(read(STORAGE_PREFIX+identity));render();}
  });
  function restoreRoute(hash){
    const route=model.route(hash);
    if(route)openCourse(route.courseId,route.lessonId,false);else goOverview(false);
  }
  window.addEventListener('hashchange',()=>restoreRoute(location.hash));
  window.addEventListener('resize',reportHeight,{passive:true});
  if(typeof ResizeObserver==='function')new ResizeObserver(reportHeight).observe(document.querySelector('.learning-app'));
  let initialHash=location.hash;
  if(!initialHash){try{initialHash=sessionStorage.getItem(ROUTE_KEY)||'';}catch(_){}}
  restoreRoute(initialHash);
  send({type:'hammerschach-learning-ready'});
})();

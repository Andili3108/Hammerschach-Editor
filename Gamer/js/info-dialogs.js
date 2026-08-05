'use strict';

function openFirstStepsDialog(){
  if(!firstStepsBackdrop) return;
  firstStepsBackdrop.hidden = false;
  setTimeout(() => {
    try{
      if(firstStepsScroll){
        firstStepsScroll.scrollTop = 0;
        firstStepsScroll.focus();
      }
    } catch(_){}
  }, 0);
}
function closeFirstStepsDialog(){
  if(firstStepsBackdrop) firstStepsBackdrop.hidden = true;
}
if(firstStepsOpenBtn) firstStepsOpenBtn.addEventListener('click', openFirstStepsDialog);
if(firstStepsCloseBtn) firstStepsCloseBtn.addEventListener('click', closeFirstStepsDialog);
if(firstStepsBackdrop) firstStepsBackdrop.addEventListener('click', ev => { if(ev.target === firstStepsBackdrop) closeFirstStepsDialog(); });
document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && firstStepsBackdrop && !firstStepsBackdrop.hidden) closeFirstStepsDialog(); });

function openInfoDialog(){
  if(!infoBackdrop) return;
  infoBackdrop.hidden = false;
  setTimeout(() => {
    try{ if(infoScroll) infoScroll.focus(); }
    catch(_){}
  }, 0);
}
function closeInfoDialog(){
  if(infoBackdrop) infoBackdrop.hidden = true;
}
if(infoGuideOpenBtn) infoGuideOpenBtn.addEventListener('click', openInfoDialog);
if(infoCloseBtn) infoCloseBtn.addEventListener('click', closeInfoDialog);
if(infoBackdrop) infoBackdrop.addEventListener('click', ev => { if(ev.target === infoBackdrop) closeInfoDialog(); });
document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && infoBackdrop && !infoBackdrop.hidden) closeInfoDialog(); });


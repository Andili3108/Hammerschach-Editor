'use strict';
(() => {
  const root=document.documentElement;
  const toggle=document.getElementById('themeToggle');
  const embedded=window.parent!==window;
  function syncControls(){
    const dark=root.classList.contains('dark-mode');
    if(toggle){
      toggle.textContent = {light:'◐',soft:'🌙',dark:'☀️'}[HammerschachAppearance.current()];
      toggle.setAttribute('aria-label',({light:'Sanfte',soft:'Dunkle',dark:'Helle'}[HammerschachAppearance.current()] + ' Darstellung aktivieren'));
      toggle.setAttribute('aria-pressed',String(dark));
    }
    document.getElementById('themeColorMeta')?.setAttribute('content',dark?'#15171a':'#843f46');
  }
  toggle?.addEventListener('click',()=>{
    window.HammerschachAppearance.cycle();
    try{localStorage.setItem('hammerschachGamerColorScheme', window.HammerschachAppearance.current());}catch(_){}
    syncControls();
  });
  window.addEventListener('message',event=>{
    if(!embedded || event.source!==window.parent || event.origin!==window.location.origin)return;
    if(event.data?.type==='hammerschach-tournament-report-context'){
      root.classList.toggle('dark-mode',event.data.darkMode===true);
      syncControls();
    }
  });
  document.querySelectorAll('[data-news-link]').forEach(link=>link.addEventListener('click',event=>{
    if(!embedded || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
    event.preventDefault();
    window.parent.postMessage({type:'hammerschach-news-select',newsId:link.dataset.newsLink},window.location.origin);
  }));
  document.querySelector('[data-return]')?.addEventListener('click',event=>{
    if(!embedded || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
    event.preventDefault();
    window.parent.postMessage({type:'hammerschach-tournament-report-return'},window.location.origin);
  });
  syncControls();
})();


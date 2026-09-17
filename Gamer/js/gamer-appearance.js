/* Shared appearance for the Gamer and its embedded pages. Board colors are separate. */
'use strict';
(function(){
  const key='hammerschachGamerColorScheme';
  const preferencesKey='hammerschach.preferences.v1';
  const schemes=['light','soft','dark'];
  const root=document.documentElement;
  function normalize(value){return schemes.includes(value)?value:'soft';}
  function current(){return normalize(root.dataset.colorScheme);}
  function apply(value){
    const scheme=normalize(value);
    root.dataset.colorScheme=scheme;
    root.classList.toggle('dark-mode',scheme==='dark');
    root.classList.toggle('soft-mode',scheme==='soft');
    root.style.colorScheme=scheme==='dark'?'dark':'light';
    return scheme;
  }
  function read(){
    try{
      const preferences=JSON.parse(localStorage.getItem(preferencesKey)||'null');
      return normalize(preferences?.scheme||localStorage.getItem(key));
    }catch(_){return 'soft';}
  }
  function select(value){
    const scheme=normalize(value);
    if(window.HammerschachPreferences) window.HammerschachPreferences.set('scheme',scheme);
    else {
      try{
        const preferences=JSON.parse(localStorage.getItem(preferencesKey)||'{}');
        localStorage.setItem(preferencesKey,JSON.stringify({...preferences,scheme}));
      }catch(_){}
    }
    try{localStorage.setItem(key,scheme);}catch(_){}
    apply(scheme);
  }
  window.HammerschachAppearance={normalize,current,apply,select,cycle(){select(schemes[(schemes.indexOf(current())+1)%schemes.length]);}};
  window.addEventListener('storage',event=>{
    if(event.key===key)apply(event.newValue);
    else if(event.key===preferencesKey||event.key===null)apply(read());
  });
  // Only the actual parent on the same origin may supply a palette.
  window.addEventListener('message',event=>{
    if(window.parent===window||event.source!==window.parent||event.origin!==location.origin)return;
    const message=event.data;
    if(!message||typeof message!=='object')return;
    if(message.type==='hammerschach-preferences')apply(message.preferences?.scheme);
    else if(/^hammerschach-[a-z-]+-context$/.test(message.type||'')){
      if(schemes.includes(message.colorScheme))apply(message.colorScheme);
      else if(typeof message.darkMode==='boolean')apply(message.darkMode?'dark':'light');
    }
  });
  apply(read());
})();

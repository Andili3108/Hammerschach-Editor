/* Shared, explicitly selected appearance; loaded before styles to avoid a light flash. */
'use strict';
(function(){
  const key='hammerschachGamerColorScheme';
  const preferencesKey='hammerschach.preferences.v1';
  const schemes=['light','soft','dark'];
  const root=document.documentElement;
  let parentPreferences=false;
  function normalize(value){return schemes.includes(value)?value:'soft';}
  function migrate(value={},legacy){
    const scheme=normalize(value?.scheme||legacy);
    // Retain explicit old choices, including those with the retired automatic flag.
    // Unknown automatic values become soft, independent of clock/device settings.
    const lightScheme=['light','soft'].includes(value?.lightScheme)?value.lightScheme:scheme==='light'?'light':'soft';
    return {scheme,lightScheme};
  }
  function current(){return normalize(root.dataset.colorScheme);}
  function apply(value){
    const scheme=normalize(value);
    const changed=root.dataset.colorScheme!==scheme;
    root.dataset.colorScheme=scheme;
    root.classList.toggle('dark-mode',scheme==='dark');
    root.classList.toggle('soft-mode',scheme==='soft');
    root.style.colorScheme=scheme==='dark'?'dark':'light';
    if(changed)window.dispatchEvent(new CustomEvent('hammerschach:appearance',{detail:{scheme}}));
    return scheme;
  }
  function read(){
    try{return migrate(JSON.parse(localStorage.getItem(preferencesKey)||'null'),localStorage.getItem(key));}
    catch(_){try{return migrate({},localStorage.getItem(key));}catch(_){return migrate();}}
  }
  function refresh(){apply(read().scheme);}
  function select(value){
    const scheme=normalize(value);
    if(window.HammerschachPreferences)window.HammerschachPreferences.set('scheme',scheme);
    else {
      try{
        const preferences=JSON.parse(localStorage.getItem(preferencesKey)||'{}')||{};
        const next={...preferences,...migrate(preferences,localStorage.getItem(key)),scheme};
        if(scheme!=='dark')next.lightScheme=scheme;
        delete next.autoNight;
        localStorage.setItem(preferencesKey,JSON.stringify(next));
        localStorage.setItem(key,scheme);
      }catch(_){}
      apply(scheme);
    }
  }
  function toggle(){select(current()==='dark'?(window.HammerschachPreferences?.get('lightScheme')||read().lightScheme):'dark');}
  window.HammerschachAppearance={normalize,migrate,current,apply,select,toggle,cycle(){select(schemes[(schemes.indexOf(current())+1)%schemes.length]);}};
  window.addEventListener('storage',event=>{
    if(event.key===key||event.key===preferencesKey||event.key===null)refresh();
  });
  window.addEventListener('message',event=>{
    if(window.parent===window||event.source!==window.parent||event.origin!==location.origin)return;
    const message=event.data;
    if(!message||typeof message!=='object')return;
    if(message.type==='hammerschach-preferences'){parentPreferences=true;apply(message.preferences?.scheme);}
    else if(/^hammerschach-[a-z-]+-context$/.test(message.type||'')){
      if(parentPreferences)return;
      if(schemes.includes(message.colorScheme))apply(message.colorScheme);
      else if(typeof message.darkMode==='boolean')apply(message.darkMode?'dark':'soft');
    }
  });
  window.addEventListener('pageshow',refresh);
  refresh();
})();

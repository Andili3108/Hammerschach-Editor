/* Shared appearance for the Gamer and its embedded pages. Board colors are separate. */
'use strict';
(function(){
  const key='hammerschachGamerColorScheme';
  const preferencesKey='hammerschach.preferences.v1';
  const schemes=['light','soft','dark'];
  const root=document.documentElement;
  const deviceScheme=typeof window.matchMedia==='function'?window.matchMedia('(prefers-color-scheme: dark)'):null;
  let requestedScheme='soft',automaticNight=false,parentPreferences=false;
  function normalize(value){return schemes.includes(value)?value:'soft';}
  function current(){return normalize(root.dataset.colorScheme);}
  function apply(value,autoNight=automaticNight){
    requestedScheme=normalize(value);
    automaticNight=autoNight===true;
    const scheme=automaticNight?(deviceScheme?.matches?'dark':requestedScheme==='dark'?'soft':requestedScheme):requestedScheme;
    const changed=root.dataset.colorScheme!==scheme;
    root.dataset.colorScheme=scheme;
    root.classList.toggle('dark-mode',scheme==='dark');
    root.classList.toggle('soft-mode',scheme==='soft');
    root.style.colorScheme=scheme==='dark'?'dark':'light';
    if(changed)window.dispatchEvent(new CustomEvent('hammerschach:appearance',{detail:{scheme}}));
    return scheme;
  }
  function read(){
    try{
      const preferences=JSON.parse(localStorage.getItem(preferencesKey)||'null');
      return {scheme:normalize(preferences?.scheme||localStorage.getItem(key)),autoNight:preferences?.autoNight===true};
    }catch(_){return {scheme:'soft',autoNight:false};}
  }
  function refresh(){const p=read();apply(p.scheme,p.autoNight);}
  function select(value){
    const scheme=normalize(value);
    if(window.HammerschachPreferences){
      if(scheme==='dark')window.HammerschachPreferences.set('autoNight',false);
      window.HammerschachPreferences.set('scheme',scheme);
    }
    else {
      try{
        const preferences=JSON.parse(localStorage.getItem(preferencesKey)||'{}');
        const autoNight=scheme==='dark'?false:preferences.autoNight===true;
        localStorage.setItem(preferencesKey,JSON.stringify({...preferences,scheme,autoNight}));
        automaticNight=autoNight;
      }catch(_){}
    }
    try{localStorage.setItem(key,scheme);}catch(_){}
    apply(scheme);
  }
  window.HammerschachAppearance={normalize,current,apply,select,cycle(){select(schemes[(schemes.indexOf(current())+1)%schemes.length]);}};
  window.addEventListener('storage',event=>{
    if(event.key===key)apply(event.newValue);
    else if(event.key===preferencesKey||event.key===null)refresh();
  });
  // Only the actual parent on the same origin may supply a palette.
  window.addEventListener('message',event=>{
    if(window.parent===window||event.source!==window.parent||event.origin!==location.origin)return;
    const message=event.data;
    if(!message||typeof message!=='object')return;
    if(message.type==='hammerschach-preferences'){parentPreferences=true;apply(message.preferences?.scheme,message.preferences?.autoNight);}
    else if(/^hammerschach-[a-z-]+-context$/.test(message.type||'')){
      if(parentPreferences)return;
      if(schemes.includes(message.colorScheme))apply(message.colorScheme);
      else if(typeof message.darkMode==='boolean')apply(message.darkMode?'dark':'light');
    }
  });
  const deviceChanged=()=>apply(requestedScheme,automaticNight);
  if(deviceScheme?.addEventListener)deviceScheme.addEventListener('change',deviceChanged);
  else if(deviceScheme?.addListener)deviceScheme.addListener(deviceChanged);
  window.addEventListener('pageshow',deviceChanged);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)deviceChanged();});
  refresh();
})();

 'use strict';
(function(){
 const key='hammerschach.preferences.v1';
 const deviceMoveKey='hammerschach.preferences.device.moveMethod.v1';
 const defaults={scheme:'soft',lightScheme:'soft',gamesAsList:false,board:'basis',pieces:'cburnett',coordinates:true,lastMove:true,legalMoves:true,reducedMotion:false,moveMethod:'both',confirmDaily:true,confirmLive:false,dailyNext:'manual',dailyOrder:'deadline',premoves:true,autoQueen:false,sound:true,moveSound:true,resultSound:true,chatSound:true,lowTimeSound:true,volume:80,hideChat:false,focus:false,invitations:'everyone'};
 const enums={scheme:['light','soft','dark'],lightScheme:['light','soft'],board:['basis','braun','grau','gruen','royal-walnut','onyx-elegance'],pieces:['cburnett','merida','chessnut','fantasy','merida-silversteel','merida-royalwood'],moveMethod:['both','click','drag'],dailyNext:['manual','auto'],dailyOrder:['deadline','oldest'],invitations:['everyone','favorites','nobody']};
 function normalize(value){const out={};for(const [k,v] of Object.entries(defaults)){const n=value&&value[k];out[k]=enums[k]? (enums[k].includes(n)?n:v):typeof v==='boolean'?(typeof n==='boolean'?n:v):Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):v;}return {...out,...HammerschachAppearance.migrate(value)};}
 function read(){try{const raw=localStorage.getItem(key);if(raw){const value=JSON.parse(raw);return normalize({...value,...HammerschachAppearance.migrate(value,localStorage.getItem('hammerschachGamerColorScheme'))});}return normalize({...defaults,lightScheme:undefined,scheme:localStorage.getItem('hammerschachGamerColorScheme')||'soft',board:localStorage.getItem('hammerschachBoardColor')||localStorage.getItem('hammerschachGamerBoardColor')||'basis',pieces:localStorage.getItem('hammerschachPieceSet')||'cburnett',sound:localStorage.getItem('hammerschachGamerSoundEnabled')!=='off'});}catch(_){try{return normalize({scheme:localStorage.getItem('hammerschachGamerColorScheme')});}catch(_){return {...defaults};}}}
 let state=read();
 // Preserve this browser's current choice once when upgrading. Account loads
 // must never overwrite it afterwards, including on logout/account changes.
 let deviceMoveMethod=state.moveMethod;
 try{
  const saved=localStorage.getItem(deviceMoveKey);
  if(enums.moveMethod.includes(saved))deviceMoveMethod=saved;
  else localStorage.setItem(deviceMoveKey,deviceMoveMethod);
 }catch(_){}
 state.moveMethod=deviceMoveMethod;
 function applyRoot(){const root=document.documentElement;root.classList.toggle('prefs-games-list',state.gamesAsList);root.classList.toggle('prefs-no-coordinates',!state.coordinates);root.classList.toggle('prefs-no-last-move',!state.lastMove);root.classList.toggle('prefs-no-legal',!state.legalMoves);root.classList.toggle('prefs-reduced-motion',state.reducedMotion);root.classList.toggle('prefs-hide-chat',state.hideChat);root.classList.toggle('prefs-focus',state.focus);window.HammerschachAppearance.apply(state.scheme);}
 // Account refreshes must not change the appearance already selected in this browser.
 function replace(value,persist=true,fromDevice=false){
  const appearance={scheme:state.scheme,lightScheme:state.lightScheme};
  if(fromDevice)deviceMoveMethod=normalize(value).moveMethod;
  state=normalize(value);state.moveMethod=deviceMoveMethod;
  if(!fromDevice)Object.assign(state,appearance);
  if(persist)try{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('hammerschachGamerColorScheme',state.scheme);}catch(_){}
  applyRoot();window.dispatchEvent(new CustomEvent('hammerschach:preferences',{detail:{...state}}));
 }
 function set(name,value){
  if(!Object.hasOwn(defaults,name))return;
  const previous={...state},next={...state,[name]:value};
  if(name==='lightScheme'){
   next.lightScheme=['light','soft'].includes(value)?value:'soft';
   if(state.scheme!=='dark')next.scheme=next.lightScheme;
  }else if(name==='scheme'&&['light','soft'].includes(value))next.lightScheme=value;
  if(name==='moveMethod'){deviceMoveMethod=normalize(next).moveMethod;try{localStorage.setItem(deviceMoveKey,deviceMoveMethod);}catch(_){}}
  replace(next,true,true);
  for(const field of Object.keys(defaults))if(previous[field]!==state[field] || (['scheme','lightScheme'].includes(name)&&['scheme','lightScheme'].includes(field)))window.dispatchEvent(new CustomEvent('hammerschach:preferences-edit',{detail:{name:field,value:state[field]}}));
 }
 window.HammerschachPreferences={get:name=>state[name],snapshot:()=>({...state}),defaults,normalize,replace,set,key};
 window.addEventListener('storage',e=>{if(e.key===deviceMoveKey||e.key===null){deviceMoveMethod=enums.moveMethod.includes(e.newValue)?e.newValue:defaults.moveMethod;replace(read(),false,true);}else if(e.key===key)replace(read(),false,true);});
 replace(state,true,true);
})();

function hammerschachSoundAllowed(key){
 const p=HammerschachPreferences;
 if(!p.get('sound')||p.get('volume')===0)return false;
 if(key==='lowTime')return p.get('lowTimeSound');
 if(key==='chat')return p.get('chatSound');
 if(['gameStart','gameEnd','victory','defeat','draw'].includes(key))return p.get('resultSound');
 return p.get('moveSound');
}

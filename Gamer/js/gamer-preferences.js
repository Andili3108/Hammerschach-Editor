 'use strict';
(function(){
 const key='hammerschach.preferences.v1';
 const defaults={scheme:'light',board:'basis',pieces:'cburnett',coordinates:true,lastMove:true,legalMoves:true,reducedMotion:false,moveMethod:'both',confirmDaily:true,confirmLive:false,dailyNext:'manual',dailyOrder:'deadline',premoves:true,autoQueen:false,sound:true,moveSound:true,resultSound:true,chatSound:true,lowTimeSound:true,volume:80,hideChat:false,focus:false,invitations:'everyone'};
 const enums={scheme:['light','dark','system'],board:['basis','braun','grau','gruen','royal-walnut','onyx-elegance'],pieces:['cburnett','merida','chessnut','fantasy','merida-silversteel','merida-royalwood'],moveMethod:['both','click','drag'],dailyNext:['manual','auto'],dailyOrder:['deadline','oldest'],invitations:['everyone','favorites','nobody']};
 function normalize(value){const out={};for(const [k,v] of Object.entries(defaults)){const n=value&&value[k];out[k]=enums[k]? (enums[k].includes(n)?n:v):typeof v==='boolean'?(typeof n==='boolean'?n:v):Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):v;}return out;}
 function read(){try{const raw=localStorage.getItem(key);if(raw)return normalize(JSON.parse(raw));return normalize({...defaults,scheme:localStorage.getItem('hammerschachGamerColorScheme')||'light',board:localStorage.getItem('hammerschachBoardColor')||localStorage.getItem('hammerschachGamerBoardColor')||'basis',pieces:localStorage.getItem('hammerschachPieceSet')||'cburnett',sound:localStorage.getItem('hammerschachGamerSoundEnabled')!=='off'});}catch(_){return {...defaults};}}
 let state=read();
 function applyRoot(){const root=document.documentElement;root.classList.toggle('prefs-no-coordinates',!state.coordinates);root.classList.toggle('prefs-no-last-move',!state.lastMove);root.classList.toggle('prefs-no-legal',!state.legalMoves);root.classList.toggle('prefs-reduced-motion',state.reducedMotion);root.classList.toggle('prefs-hide-chat',state.hideChat);root.classList.toggle('prefs-focus',state.focus);root.classList.toggle('dark-mode',state.scheme==='dark'||(state.scheme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches));}
 function replace(value,persist=true){state=normalize(value);if(persist)try{localStorage.setItem(key,JSON.stringify(state));}catch(_){}applyRoot();window.dispatchEvent(new CustomEvent('hammerschach:preferences',{detail:{...state}}));}
 function set(name,value){if(!Object.hasOwn(defaults,name))return;replace({...state,[name]:value});window.dispatchEvent(new CustomEvent('hammerschach:preferences-edit',{detail:{name,value:state[name]}}));}
 window.HammerschachPreferences={get:name=>state[name],snapshot:()=>({...state}),defaults,normalize,replace,set,key};
 window.addEventListener('storage',e=>{if(e.key===key||e.key===null)replace(read(),false);});
 matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(state.scheme==='system'){applyRoot();window.dispatchEvent(new CustomEvent('hammerschach:preferences',{detail:{...state}}));}});
 applyRoot();
})();

function hammerschachSoundAllowed(key){
 const p=HammerschachPreferences;
 if(!p.get('sound')||p.get('volume')===0)return false;
 if(key==='lowTime')return p.get('lowTimeSound');
 if(key==='chat')return p.get('chatSound');
 if(['gameStart','gameEnd','victory','defeat','draw'].includes(key))return p.get('resultSound');
 return p.get('moveSound');
}

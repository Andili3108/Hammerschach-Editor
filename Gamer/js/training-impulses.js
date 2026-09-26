'use strict';
let impulsesToolActive = false;
let impulsesContextKey = '';
let impulsesEpoch = 0;
const impulsesToolBtn = document.getElementById('impulsesToolBtn');
const impulsesToolView = document.getElementById('impulsesToolView');
const impulsesToolFrame = document.getElementById('impulsesToolFrame');
function postImpulses(message){
  if(impulsesToolActive && impulsesToolFrame?.contentWindow) impulsesToolFrame.contentWindow.postMessage(message,embeddedToolTargetOrigin());
}
function postImpulsesToolContext(){
  const key = String(onlineAuthToken || '')+'|'+String(onlineAuthUser?.id || '')+'|'+String(onlineAuthUser?.isAdmin === true);
  if(key !== impulsesContextKey){impulsesContextKey=key;impulsesEpoch++;}
  postImpulses({type:'impulses-context',epoch:impulsesEpoch,loggedIn:!!(onlineAuthToken && onlineAuthUser),isAdmin:!!(onlineAuthToken && onlineAuthUser?.isAdmin === true),colorScheme:HammerschachPreferences.get('scheme')});
}
function setImpulsesView(active){
  const wasActive=impulsesToolActive;
  impulsesToolActive=active;
  document.documentElement.classList.toggle('impulses-tool-active',active);
  if(impulsesToolView)impulsesToolView.hidden=!active;
  if(active && !wasActive){impulsesEpoch++;impulsesToolFrame.src=impulsesToolFrame.dataset.src;}
  if(!active && wasActive)impulsesToolFrame.removeAttribute('src');
  if(active)postImpulsesToolContext();
}
impulsesToolBtn?.addEventListener('click',()=>openEmbeddedToolFromCurrentContext('impulses'));
impulsesToolFrame?.addEventListener('load',postImpulsesToolContext);
window.addEventListener('message',async event=>{
  if(!impulsesToolActive || event.source!==impulsesToolFrame?.contentWindow)return;
  if(embeddedToolTargetOrigin()!=='*' && event.origin!==embeddedToolTargetOrigin())return;
  const message=event.data;
  if(!message || typeof message!=='object')return;
  if(message.type==='impulses-ready'){postImpulsesToolContext();return;}
  if(message.type==='impulses-scroll-top'){window.scrollTo({top:0,left:0,behavior:'auto'});return;}
  if(message.type==='impulses-height'){
    const height=Number(message.height);
    if(Number.isFinite(height) && height>0){impulsesToolFrame.style.height=Math.max(720,Math.min(16000,Math.ceil(height)+4))+'px';hammerschachScheduleHeightReport(true);}
    return;
  }
  if(message.type==='impulses-auth'){
    if(!(onlineAuthToken && onlineAuthUser))openAuthDialog(message.mode==='register'?'register':'login');
    return;
  }
  if(message.type!=='impulses-request' || message.epoch!==impulsesEpoch)return;
  const routes={catalog:'/api/training-impulses',config:'/api/admin/training-impulses',save:'/api/admin/training-impulses'};
  if(!Object.hasOwn(routes,message.action))return;
  const token=onlineAuthToken,epoch=impulsesEpoch;
  try{
    if(message.action!=='catalog' && !(onlineAuthToken && onlineAuthUser?.isAdmin===true))throw new Error('Die Konfiguration ist nur für den Administrator verfügbar.');
    const data=await authApi(routes[message.action],message.action==='save'?{method:'POST',body:JSON.stringify({videos:message.videos})}:undefined);
    if(token===onlineAuthToken && epoch===impulsesEpoch)postImpulses({type:'impulses-result',requestId:message.requestId,epoch,ok:true,data});
  }catch(error){
    if(token===onlineAuthToken && epoch===impulsesEpoch)postImpulses({type:'impulses-result',requestId:message.requestId,epoch,ok:false,message:error.message || 'Die Anfrage konnte nicht abgeschlossen werden.'});
  }
});

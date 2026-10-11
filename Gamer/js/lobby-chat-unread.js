'use strict';
// Read state stays on this device, separately for each member. No extra requests.
window.HammerschachLobbyUnread = (() => {
  let owner='', state=null;
  const key=()=> 'hammerschach.lobby-chat.read.'+owner;
  function identity(){
    const next=String(onlineAuthUser?.id||'');
    if(next===owner&&state)return;
    owner=next;state={initialized:false,known:[],unread:[],latest:0};
    if(owner)try{
      const saved=JSON.parse(localStorage.getItem(key())||'null');
      if(saved&&Array.isArray(saved.known)&&Array.isArray(saved.unread))state={initialized:true,known:saved.known.slice(-200),unread:saved.unread.slice(-200),latest:Number(saved.latest)||0};
    }catch(_){}
    render();
  }
  function save(){if(owner)try{localStorage.setItem(key(),JSON.stringify(state));}catch(_){} }
  function render(){
    const badge=document.getElementById('lobbyChatUnread');if(!badge)return;
    const count=state?.unread.length||0;
    badge.hidden=count===0;badge.textContent=count>99?'99+':String(count);
    badge.setAttribute('aria-label',count+' ungelesene Nachrichten');
    badge.title=count+' ungelesene Nachrichten';
  }
  function visible(){return !document.hidden&&!document.getElementById('memberLobby')?.hidden&&!document.getElementById('lobbyChatPanel')?.hidden;}
  function markIfVisible(){identity();if(visible()&&state.unread.length){state.unread=[];save();render();}}
  function sync(messages,muted=new Set()){
    identity();if(!owner)return;
    const known=new Set(state.known),unread=new Set(state.unread);
    const eligible=messages.filter(m=>!m.mine&&m.senderProfileId!==owner&&!muted.has(m.senderKey));
    const present=new Set(eligible.map(m=>m.id));
    if(state.initialized)for(const m of eligible){
      if(!known.has(m.id)&&(Date.parse(m.sentAt)||Number(m.sentAt)||0)>=state.latest)unread.add(m.id);
    }
    state.unread=visible()?[]:[...unread].filter(id=>present.has(id));
    state.known=messages.map(m=>m.id).slice(-200);
    state.latest=Math.max(state.latest,...messages.map(m=>Date.parse(m.sentAt)||Number(m.sentAt)||0));
    state.initialized=true;save();render();
  }
  document.addEventListener('visibilitychange',markIfVisible);
  window.addEventListener('focus',markIfVisible);
  return {sync,markIfVisible};
})();

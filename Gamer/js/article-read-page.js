'use strict';
// Direkt geöffnete Berichtsseiten verwenden denselben Lesestand wie der Gamer.
(() => {
  if(window.parent!==window)return; // Im Gamer prüft der Elternrahmen die aktive Ansicht.
  const key=document.body.dataset.articleReadKey||(document.body.dataset.newsId?'news:'+document.body.dataset.newsId:'');
  if(!HammerschachArticleReadStore.valid(key))return;
  const identity=()=>{
    try{return {id:JSON.parse(localStorage.getItem('hammerschachGamerAuthUser')||'null')?.id,token:localStorage.getItem('hammerschachGamerAuthToken')||''};}catch(_){return {};}
  };
  // Dieselbe öffentliche API-Adresse wie ONLINE_WORKER_URL in online-session.js.
  const api=(window.HAMMERSCHACH_ONLINE_WORKER_URL||'https://hammerschach-hammerschach-lobby-worker.webmaster-5bb.workers.dev').replace(/\/$/,'');
  const store=HammerschachArticleReadStore.create({
    storage:{getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)},identity,
    request:async(method,read,token)=>{
      const res=await fetch(api+'/api/account/article-reads',{method,headers:{'content-type':'application/json',authorization:'Bearer '+token},...(method==='POST'?{body:JSON.stringify({read})}:{})});
      const data=await res.json();if(!res.ok||!data.ok)throw new Error('Lesestand nicht erreichbar');return data;
    }
  });
  const opened=()=>{if(!document.hidden&&document.readyState==='complete'){store.mark(key);void store.sync();}};
  window.addEventListener('load',opened);
  document.addEventListener('visibilitychange',opened);
  window.addEventListener('online',opened);
  window.addEventListener('focus',opened);
  window.addEventListener('storage',event=>store.storageChanged(event.key));
  opened();
})();

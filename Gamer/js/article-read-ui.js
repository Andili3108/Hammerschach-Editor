'use strict';
(() => {
  const catalog=()=>[
    ...Object.entries(TOURNAMENT_REPORTS).map(([id,item])=>({key:'report:'+id,category:'reports',item})),
    ...Object.entries(SCHACH_NEWS).map(([id,item])=>({key:'news:'+id,category:'news',item}))
  ];
  let store;
  function badge(button,count,leaf=false){
    if(!button)return;
    let el=button.querySelector('.article-unread-badge');
    if(!el){el=document.createElement('span');el.className='article-unread-badge';button.appendChild(el);}
    const label=leaf?'Ungelesener Bericht':count===1?'1 ungelesener Bericht':count+' ungelesene Berichte';
    const text=leaf?'NEU':String(count);
    if(el.textContent!==text)el.textContent=text;
    if(el.hidden!==!count)el.hidden=!count;
    if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);
  }
  function render(read){
    const seen=new Set(read),unread=catalog().filter(a=>a.item.notify!==false&&!seen.has(a.key));
    const news=unread.filter(a=>a.category==='news').length,reports=unread.length-news;
    ['clubChessMenuBtn','tournamentReportToolBtn'].forEach(id=>badge(document.getElementById(id),unread.length));
    badge(document.getElementById('schachNewsCategoryBtn'),news);
    badge(document.getElementById('tournamentReportsCategoryBtn'),reports);
    // Mobile Navigation verwendet eigene Knöpfe für Mitglieder und Besucher.
    document.querySelectorAll('[data-mobile-nav-target="tournamentReportToolBtn"], [data-mobile-nav-accordion-source="clubChessMenu"] > .mobile-nav-accordion-toggle').forEach(el=>badge(el,unread.length));
    document.querySelectorAll('[data-schach-news-id]').forEach(el=>badge(el,unread.some(a=>a.key==='news:'+el.dataset.schachNewsId)?1:0,true));
    [['tournamentReportUnnaBtn','unna-open-2025'],['tournamentReportQuickBtn','quick-round-robin-2026']].forEach(([id,key])=>badge(document.getElementById(id),unread.some(a=>a.key==='report:'+key)?1:0,true));
  }
  store=HammerschachArticleReadStore.create({
    storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},
    identity:()=>({id:onlineAuthUser&&onlineAuthUser.id,token:onlineAuthToken}),
    request:(method,read,token)=>authApi('/api/account/article-reads',{method,headers:{'content-type':'application/json',authorization:'Bearer '+token},...(method==='POST'?{body:JSON.stringify({read})}:{})}),
    onChange:render
  });
  function checkVisibleArticle(){
    if(document.hidden||!tournamentReportToolActive||!tournamentReportToolFrame||tournamentReportToolView.hidden)return;
    try{
      const doc=tournamentReportToolFrame.contentDocument;
      const expected=new URL(currentSchachArticle().src,location.href);
      // Cloudflare liefert .html-Dateien unter endungslosen URLs und index.html als Verzeichnis.
      // Zusätzlich die Kennung im geladenen Dokument prüfen, damit keine Fehlerseite zählt.
      if(!doc||doc.readyState!=='complete'||!doc.querySelector('h1'))return;
      const actual=new URL(doc.URL);
      const articlePath=path=>path.replace(/\/index\.html$/,'/').replace(/\.html$/,'').replace(/\/+$/,'')||'/';
      if(actual.origin!==expected.origin||articlePath(actual.pathname)!==articlePath(expected.pathname))return;
      const key=(schachCurrentCategory==='news'?'news:':'report:')+(schachCurrentCategory==='news'?schachNewsCurrentId:tournamentReportCurrentId);
      const loadedKey=doc.body?.dataset.articleReadKey||(doc.body?.dataset.newsId?'news:'+doc.body.dataset.newsId:'');
      if(loadedKey!==key)return;
      store.mark(key);
    }catch(_){}
  }
  let authKey='';
  function refreshIdentity(){
    const next=String(onlineAuthUser&&onlineAuthUser.id||'')+':'+onlineAuthToken;
    store.refreshIdentity();
    if(next!==authKey){authKey=next;void store.sync();}
  }
  window.HammerschachArticleReads={refreshIdentity,checkVisibleArticle};
  tournamentReportToolFrame?.addEventListener('load',checkVisibleArticle);
  window.addEventListener('hammerschach:auth-change',refreshIdentity);
  window.addEventListener('storage',e=>store.storageChanged(e.key));
  const refresh=()=>{if(!document.hidden){void store.sync();checkVisibleArticle();}};
  window.addEventListener('online',refresh);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
  setInterval(refresh,60000);
  refreshIdentity();
})();

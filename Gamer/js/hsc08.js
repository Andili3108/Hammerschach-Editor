'use strict';
// Public loader only. Page markup, logo and tournament data come from authenticated routes.
(() => {
  let identity='', generation=0, frame=null, active=false, links=[], toolbars=[];
  const auth=()=>typeof onlineAuthToken!=='undefined' ? onlineAuthToken : '';
  const user=()=>typeof onlineAuthUser!=='undefined' ? onlineAuthUser : null;
  const eligible=()=>!!auth() && user()?.isAdmin===true && String(user()?.username||'').toLowerCase()==='andili';
  const style=document.createElement('style');
  style.textContent='.hsc08-covered{display:none!important}#hsc08View{width:100%;min-width:0}#hsc08View iframe{display:block;width:100%;border:0;min-height:520px}.hsc08-toolbar{display:flex;flex-wrap:wrap;gap:6px;padding:8px 0}.header-main > .hsc08-toolbar{grid-column:1/-1;grid-row:4}.hsc08-toolbar button,.hsc08-toolbar select{min-height:44px;max-width:100%}#mobileNavTestHeader .hsc08-toolbar{grid-column:1/-1;width:100%}.hsc08-error{padding:16px}';
  document.head.append(style);
  async function api(path,method='GET',body) {
    const token=auth();
    if(!eligible())throw new Error('Bitte als Andili anmelden.');
    const response=await fetch(ONLINE_WORKER_URL+'/api/hsc08'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(token!==auth() || !eligible())throw new Error('Die Anmeldung hat sich geändert.');
    if(!response.ok || !data.ok){if(response.status===404 || response.status===401)close();throw new Error(data.message||'Der Vereinsbereich ist nicht verfügbar.');}
    return data;
  }
  function close(){
    active=false;frame?.parentElement.remove();frame=null;
    document.querySelectorAll('.hsc08-covered').forEach(el=>el.classList.remove('hsc08-covered'));
    toolbars.forEach(el=>el.remove());toolbars=[];
  }
  function toolbar(){
    const nav=document.createElement('nav');nav.className='hsc08-toolbar';nav.setAttribute('aria-label','HSC08-Verwaltung');
    const select=document.createElement('select');select.setAttribute('aria-label','Vereinsturnier wählen');
    for(const [text,disabled] of [['Vereinsmeisterschaft',false],['Vereinspokal · später',true],['Blitzrunden · später',true]]){const o=document.createElement('option');o.textContent=text;o.disabled=disabled;select.append(o);}nav.append(select);
    for(const [label,action] of [['Zur Startseite',close],['Zur Lobby',close],['Turnier konfigurieren',()=>frame?.contentWindow.hscMode?.('config')],['Turnier vollständig löschen',()=>{frame?.scrollIntoView({block:'start'});frame?.contentWindow.hscDelete?.();}]]){const b=document.createElement('button');b.type='button';b.className='button-flat';b.textContent=label;b.onclick=action;nav.append(b);}
    return nav;
  }
  async function open(){
    const current=generation;
    if(!eligible())return;
    let page;
    try{page=await api('/page');}catch(e){alert(e.message);return;}
    if(current!==generation)return;
    close();
    if(typeof closeEmbeddedTools==='function')closeEmbeddedTools();
    const shell=document.querySelector('.app > .shell');
    for(const child of shell.children){if(child.tagName==='HEADER'||child.tagName==='SCRIPT'||child.tagName==='STYLE'||child.tagName==='DIALOG'||/backdrop|popup/i.test(child.id+' '+child.className))continue;child.classList.add('hsc08-covered');}
    const view=document.createElement('section');view.id='hsc08View';view.setAttribute('aria-label','HSC08 Vereinsmeisterschaft');
    frame=document.createElement('iframe');frame.title='HSC08 – Vereinsmeisterschaft und Konfiguration';frame.srcdoc=page.html;frame.onload=()=>{frame?.contentDocument?.documentElement?.classList.toggle('dark-mode',document.documentElement.classList.contains('dark-mode'));};view.append(frame);shell.append(view);active=true;
    for(const host of [document.querySelector('.header .header-main'),document.querySelector('#mobileNavTestHeader')]){if(host){const nav=toolbar();host.append(nav);toolbars.push(nav);}}
    document.querySelectorAll('.header-menu-popup').forEach(el=>el.hidden=true);
    const drawer=document.getElementById('mobileNavTestBackdrop');if(drawer)drawer.hidden=true;
    window.scrollTo(0,0);
  }
  async function updateIdentity(){
    const next=eligible()?auth():'';
    if(next===identity)return;
    identity=next;const current=++generation;close();links.forEach(el=>el.remove());links=[];
    if(!next)return;
    try{await api('/access');}catch{return;}
    if(current!==generation)return;
    for(const id of ['clubChessMenuPopup','mobileNavClubChessPanel']){
      const host=document.getElementById(id);if(!host)continue;
      const wrap=document.createElement('div');const label=document.createElement('div');label.className='header-menu-section-label';label.textContent='Vereine';
      const b=document.createElement('button');b.type='button';b.className=id.startsWith('mobile')?'mobile-nav-test-item mobile-nav-accordion-item':'header-menu-item';b.textContent='HSC08';b.onclick=open;wrap.append(label,b);host.append(wrap);links.push(wrap);
    }
  }
  // Remove private content immediately on local or cross-tab sign-out.
  window.addEventListener('storage',updateIdentity);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateIdentity();if(active)api('/access').catch(close);}});
  window.addEventListener('pageshow',()=>{if(active)api('/access').catch(close);});
  new MutationObserver(()=>frame?.contentDocument?.documentElement?.classList.toggle('dark-mode',document.documentElement.classList.contains('dark-mode'))).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  document.addEventListener('click',e=>{
    if(!active || e.target.closest('.hsc08-toolbar'))return;
    const b=e.target.closest('button');
    if(b && (['roomLobbyBtn','mobileNavTestBrand'].includes(b.id) || (b.closest('.match-actions') && b.getAttribute('aria-haspopup')!=='menu')))close();
  },true);
  window.HammerschachHsc08={api,updateIdentity,open,close,resize(height){if(frame)frame.style.height=Math.ceil(Math.max(520,height))+'px';}};
  updateIdentity();
})();

'use strict';
// Public loader only. Page markup, logo and tournament data come from authenticated routes.
(() => {
  let identity='', generation=0, frame=null, active=false, links=[], toolbars=[], restored=[], footerMarker=null, sizeObserver=null, statusText='Vereinsmeisterschaft';
  const auth=()=>typeof onlineAuthToken!=='undefined' ? onlineAuthToken : '';
  const user=()=>typeof onlineAuthUser!=='undefined' ? onlineAuthUser : null;
  const eligible=()=>!!auth() && user()?.isAdmin===true && String(user()?.username||'').toLowerCase()==='andili';
  const style=document.createElement('style');
  style.textContent=`
.hsc08-covered{display:none!important}
#hsc08View{width:100%;min-width:0;max-height:none!important;overflow:visible!important}
#hsc08View iframe{display:block;width:100%;border:0;min-height:0!important;max-height:none!important;overflow:hidden}
.hsc08-toolbar{display:flex;flex-wrap:wrap;gap:6px;padding:0;min-width:0}
.header-main > .hsc08-toolbar{grid-column:1/-1;grid-row:3}
.hsc08-toolbar>button,.hsc08-toolbar>.header-menu{flex:1 1 auto;min-width:0}
.hsc08-toolbar button{min-height:40px;max-width:100%}
.hsc08-toolbar>.header-menu>.header-menu-button{width:100%}
#mobileNavTestHeader .hsc08-toolbar{grid-column:1/-1;width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}#mobileNavTestHeader .hsc08-toolbar button{width:100%;height:100%;white-space:normal}
html.hsc08-active .header .match-actions,html.hsc08-active #playerMenu,html.hsc08-active #profileOpenBtn,html.hsc08-active #privateMessagesOpenBtn,html.hsc08-active #mobilePrivateMessagesOpenBtn{display:none!important}
html.hsc08-active .header #status{grid-column:1/-1}
html.hsc08-active .header-main{height:auto;min-height:120px}
html.hsc08-active .site-footnote{width:100%;box-sizing:border-box}
.hsc08-toolbar .header-menu-popup{z-index:2600}
html.hsc08-active #mobileNavTestDrawer .mobile-nav-test-list>section:not(#mobileNavHelpSection):not(#mobileNavTechnicalSection){display:none!important}
.hsc08-drawer-nav{display:block;padding:8px 0}.hsc08-drawer-nav>.mobile-nav-test-item{width:100%}

`;

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
    if(active && !document.getElementById('mobileNavTestBackdrop')?.hidden)document.getElementById('mobileNavTestClose')?.click();
    active=false;sizeObserver?.disconnect();sizeObserver=null;
    if(footerMarker){const footer=document.querySelector('.site-footnote');if(footer)footerMarker.replaceWith(footer);else footerMarker.remove();footerMarker=null;}
    frame?.parentElement.remove();frame=null;
    restored.forEach(restore=>restore());restored=[];
    document.documentElement.classList.remove('hsc08-active');
    document.querySelectorAll('.hsc08-covered').forEach(el=>el.classList.remove('hsc08-covered'));
    toolbars.forEach(el=>el.remove());toolbars=[];
  }
  function setTitle(title,config=false){
    if(title)statusText=title;
    const text='HSC08 · '+(config?'Turnier konfigurieren':statusText);
    for(const id of ['status','mobileNavTestStatus']){const el=document.getElementById(id);if(el)el.textContent=text;}
  }
  function toolbar(drawerMode=false){
    const nav=document.createElement('nav');nav.className='hsc08-toolbar'+(drawerMode?' hsc08-drawer-nav':'');nav.setAttribute('aria-label','HSC08-Verwaltung');
    const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.className='button-flat name-action-btn';b.textContent=label;b.onclick=()=>{if(drawerMode){document.getElementById('mobileNavTestClose')?.click();requestAnimationFrame(action);}else action();};if(drawerMode){b.className='mobile-nav-test-item';const icon=document.createElement('span');icon.textContent='♟';icon.setAttribute('aria-hidden','true');const text=document.createElement('strong');text.textContent=label;b.replaceChildren(icon,text);}return b;};
    nav.append(button(auth()&&user()?'Zur Lobby':'Zur Startseite',close));
    const menu=document.createElement('div');menu.className=drawerMode?'mobile-nav-accordion':'header-menu';
    const toggle=button('Vereinsturniere ▾',()=>{const show=popup.hidden;popup.hidden=!show;toggle.setAttribute('aria-expanded',String(show));});toggle.onclick=()=>{popup.hidden=!popup.hidden;toggle.setAttribute('aria-expanded',String(!popup.hidden));};if(!drawerMode)toggle.classList.add('header-menu-button');toggle.setAttribute('aria-haspopup','menu');toggle.setAttribute('aria-expanded','false');
    const popup=document.createElement('div');popup.className=drawerMode?'mobile-nav-accordion-panel':'header-menu-popup';popup.setAttribute('role','menu');popup.hidden=true;
    for(const label of ['Vereinsmeisterschaft','Vereinspokal','Blitzrunden']){const b=button(label,()=>{popup.hidden=true;toggle.setAttribute('aria-expanded','false');frame?.contentWindow.hscMode?.('view');});b.className=drawerMode?'mobile-nav-test-item mobile-nav-accordion-item':'header-menu-item';b.setAttribute('role','menuitem');if(label==='Vereinsmeisterschaft'){b.classList.add('active');b.setAttribute('aria-current','page');}else{b.disabled=true;b.title='Noch nicht verfügbar';}popup.append(b);}
    menu.append(toggle,popup);nav.append(menu);
    nav.append(button('Turnier konfigurieren',()=>frame?.contentWindow.hscMode?.('config')));
    nav.append(button('Turnier vollständig löschen',()=>{frame?.scrollIntoView({block:'start'});frame?.contentWindow.hscDelete?.();}));
    nav.addEventListener('click',e=>e.stopPropagation());
    nav.addEventListener('keydown',e=>{if(e.key==='Escape'){popup.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}});
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
    const footer=document.querySelector('.site-footnote');
    if(footer){footerMarker=document.createComment('HSC08 footer original position');footer.before(footerMarker);}
    const parsed=new DOMParser().parseFromString(page.html,'text/html');
    const logo=parsed.querySelector('#hsc08Brand')?.content.querySelector('img')?.getAttribute('src');
    for(const img of document.querySelectorAll('.header-brand img,#mobileNavTestBrand img,.mobile-nav-test-drawer-brand img')){const src=img.getAttribute('src'),alt=img.getAttribute('alt');restored.push(()=>{img.setAttribute('src',src);if(alt===null)img.removeAttribute('alt');else img.setAttribute('alt',alt);});if(logo){img.src=logo;img.alt='HSC08 – Schachabteilung';}}
    for(const id of ['status','mobileNavTestStatus']){const el=document.getElementById(id);if(el){const text=el.textContent;restored.push(()=>{el.textContent=text;});}}
    for(const [selector,text] of [['.mobile-nav-test-drawer-brand strong','HSC08'],['.mobile-nav-test-drawer-brand small','Vereinsturniere'],['#mobileNavTestBrand strong','HSC08'],['#mobileNavTestContext','Vereinsturniere']]){const el=document.querySelector(selector);if(el){const old=el.textContent;restored.push(()=>{el.textContent=old;});el.textContent=text;}}
    document.documentElement.classList.add('hsc08-active');
    statusText='Vereinsmeisterschaft';setTitle(statusText);
    for(const child of shell.children){if(child.tagName==='HEADER'||child.tagName==='SCRIPT'||child.tagName==='STYLE'||child.tagName==='DIALOG'||/backdrop|popup/i.test(child.id+' '+child.className))continue;child.classList.add('hsc08-covered');}
    const view=document.createElement('section');view.id='hsc08View';view.setAttribute('aria-label','HSC08 Vereinsmeisterschaft');
    frame=document.createElement('iframe');frame.title='HSC08 – Vereinsmeisterschaft und Konfiguration';frame.setAttribute('scrolling','no');frame.srcdoc=page.html;frame.onload=()=>{const doc=frame?.contentDocument;if(!doc)return;doc.documentElement.classList.toggle('dark-mode',document.documentElement.classList.contains('dark-mode'));const main=doc.querySelector('main');if(main){const measure=()=>window.HammerschachHsc08.resize(main.getBoundingClientRect().height+24);sizeObserver?.disconnect();sizeObserver=new ResizeObserver(measure);sizeObserver.observe(main);measure();}};view.append(frame);shell.append(view);if(footer)shell.append(footer);active=true;
    for(const host of [document.querySelector('.header .header-main'),document.querySelector('#mobileNavTestHeader')]){if(host){const nav=toolbar();host.append(nav);toolbars.push(nav);}}
    const drawerList=document.querySelector('#mobileNavTestDrawer .mobile-nav-test-list');if(drawerList){const nav=toolbar(true);drawerList.prepend(nav);toolbars.push(nav);}
    document.querySelectorAll('.header-menu-popup').forEach(el=>el.hidden=true);
    const drawer=document.getElementById('mobileNavTestBackdrop');if(drawer&&!drawer.hidden)document.getElementById('mobileNavTestClose')?.click();
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
    if(!e.target.closest('.hsc08-toolbar'))toolbars.forEach(nav=>{nav.querySelectorAll('[role=menu]').forEach(el=>el.hidden=true);nav.querySelectorAll('[aria-expanded]').forEach(el=>el.setAttribute('aria-expanded','false'));});
    if(!active || e.target.closest('.hsc08-toolbar'))return;
    const b=e.target.closest('button');
    if(b && (['roomLobbyBtn','mobileNavTestBrand'].includes(b.id) || (b.closest('.match-actions') && b.getAttribute('aria-haspopup')!=='menu')))close();
  },true);
  window.HammerschachHsc08={api,updateIdentity,open,close,setTitle,resize(height){if(frame&&Number.isFinite(height))frame.style.setProperty('height',Math.ceil(Math.max(1,height))+'px','important');}};
  updateIdentity();
})();

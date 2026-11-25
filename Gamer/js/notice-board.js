'use strict';
(() => {
  const openButton=document.getElementById('noticeBoardOpen'),count=document.getElementById('noticeBoardCount');
  const token=()=>typeof onlineAuthToken!=='undefined'?onlineAuthToken:'';
  const eligible=()=>typeof onlineAuthUser!=='undefined' && onlineAuthUser?.isAdmin===true && String(onlineAuthUser?.username||'').toLowerCase()==='andili' && !!token();
  const base=()=>ONLINE_WORKER_URL+'/api/notice-board';
  let managing=false,dirty=false,busy=false,generation=0,publicItems=[],offset=0,previousFocus=null,lastRenderedKey='';
  function el(tag,text,className){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;}
  function button(text,action){const b=el('button',text,'button-flat');b.type='button';b.addEventListener('click',action);return b;}
  const dialog=el('dialog',null,'notice-board-dialog');dialog.id='noticeBoardDialog';dialog.setAttribute('aria-labelledby','noticeBoardTitle');
  const header=el('header'),title=el('h2','📌 Schwarzes Brett');title.id='noticeBoardTitle';
  const closeButton=button('✕',close);closeButton.setAttribute('aria-label','Schwarzes Brett schließen');header.append(title,closeButton);
  const content=el('div',null,'notice-board-content'),status=el('p',null,'notice-board-status');status.setAttribute('role','status');
  const footer=el('footer');footer.append(button('Schließen',close));dialog.append(header,content,status,footer);document.body.append(dialog);
  const canLeave=()=>!busy && (!dirty || confirm('Ungespeicherte Änderungen verwerfen?'));
  function close(){if(!canLeave())return;generation++;dirty=false;dialog.close();}
  dialog.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const focusable=[...dialog.querySelectorAll('button,a[href],input,textarea,select,[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  });
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
  dialog.addEventListener('close',()=>{document.documentElement.classList.remove('notice-board-open');previousFocus?.focus({preventScroll:true});});
  window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
  function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
  async function api(manage=false,body){
    const auth=token(),response=await fetch(base()+(manage?'?manage=1':''),{method:body?'POST':'GET',cache:'no-store',headers:{...(manage&&auth?{Authorization:'Bearer '+auth}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(manage&&auth!==token())throw Error('Die Anmeldung hat sich geändert.');
    if(!response.ok||!data.ok)throw Error(data.message||'Das Schwarze Brett ist derzeit nicht verfügbar.');return data;
  }
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset));
  const current=items=>items.filter(n=>!n.expires||n.expires>=today());
  const isNew=n=>!!n.publishedAt && Date.now()+offset-Date.parse(n.publishedAt)>=0 && Date.now()+offset-Date.parse(n.publishedAt)<7*86400000;
  function updateCount(){const n=current(publicItems).filter(isNew).length;count.textContent=n===1?'1 neue Meldung':n>1?n+' neue Meldungen':'Alle Meldungen ›';count.classList.toggle('notice-board-new',n>0);}
  async function refreshCount(){try{const data=await api();offset=data.serverNow-Date.now();publicItems=data.items;updateCount();}catch{count.textContent='Meldungen öffnen ›';count.classList.remove('notice-board-new');}}
  // Positions refer to UTF-16 offsets, as used by textarea selections.
  function mergedRanges(ranges){
    const result=[];
    for(const [start,end] of ranges.sort((a,b)=>a[0]-b[0])){
      if(start>=end)continue;
      const last=result[result.length-1];
      if(last && start<=last[1])last[1]=Math.max(last[1],end);
      else result.push([start,end]);
    }
    return result;
  }
  function appendText(host,n,start,end){
    let cursor=start;
    for(const [left,right] of n.boldRanges||[]){
      const from=Math.max(start,left), to=Math.min(end,right);
      if(from>=to)continue;
      host.append(n.description.slice(cursor,from),el('strong',n.description.slice(from,to)));
      cursor=to;
    }
    host.append(n.description.slice(cursor,end));
  }
  function renderNotice(n, published=false){
    const card=el('article',null,'notice-board-card'),heading=el('h3',n.title);
    if(n.headerImage && n.files.includes(n.headerImage))card.append(imageLink(n.headerImage,n.headerWidth||25));
    heading.dataset.size=n.titleSize||'standard';
    if(n.organizer)card.append(el('p',n.organizer,'notice-board-organizer'));
    card.append(heading);
    if(isNew(n))heading.append(el('span','NEU','notice-board-new'));
    if(n.status)card.append(el('p',n.status,'notice-board-meta'));
    function link(label, target) {
      const a=el('a',label);
      if(n.files.includes(target)) NoticeAttachment.link(a,target,published);
      else a.href=target;
      a.target='_blank';
      a.rel='noopener noreferrer';
      return a;
    }
    function imageLink(name,width){
      const a=link('',name), image=el('img');
      image.alt=name;
      image.src='SchwarzesBrett/anhaenge/'+encodeURIComponent(name);
      a.className='notice-board-inline-image';
      a.style.width=width+'%';
      a.append(image);
      return a;
    }
    const body=el('div',null,'notice-board-description');
    body.dataset.size=n.bodySize||'standard';
    const inline=new Set();
    let offset=0;
    for(const match of n.description.matchAll(/\[\[Bild: ([^\]\n]+)\]\]/g)){
      const name=match[1], width=n.images?.[name];
      if(![25,50,75,100].includes(width) || !n.files.includes(name))continue;
      appendText(body,n,offset,match.index);
      body.append(imageLink(name,width));
      inline.add(name);
      offset=match.index+match[0].length;
    }
    appendText(body,n,offset,n.description.length);
    card.append(body);
    const actions=el('div',null,'notice-board-targets');
    if(n.invitation)actions.append(link('Zur Ausschreibung',n.invitation));
    if(n.tournament)actions.append(link('Zur Turnierseite',n.tournament));
    if(actions.childElementCount)card.append(actions);
    const links=el('div',null,'notice-board-links');
    for(const name of n.files){
      if(name!==n.headerImage && !inline.has(name) && name!==n.invitation)links.append(link('📎 '+name,name));
    }
    for(const url of n.links){
      if(url!==n.invitation && url!==n.tournament)links.append(link('↗ '+url,url));
    }
    card.append(links);return card;
  }
  async function overview(manage=false,background=false){
    if(!canLeave())return;dirty=false;managing=manage;const ticket=++generation,scroll=content.scrollTop;if(!background){message('Meldungen werden geladen…');content.replaceChildren();}
    try {
      const data=await api(manage);if(ticket!==generation||!dialog.open)return;
      if(manage&&!eligible())return;
      offset=data.serverNow-Date.now();message('');
      const renderKey=JSON.stringify([manage,data.items,eligible()]);
      if(background&&renderKey===lastRenderedKey)return;
      lastRenderedKey=renderKey;content.replaceChildren();
      const actions=el('div',null,'notice-board-actions');
      if(manage){actions.append(button('＋ Neue Meldung',()=>edit()),button('Öffentliche Ansicht',()=>overview(false)));}
      else if(eligible())actions.append(button('Meldungen verwalten',()=>overview(true)));
      content.append(actions);
      if(!manage){publicItems=data.items;updateCount();}
      const items=manage?data.items:current(data.items);
      if(!items.length)content.append(el('p',manage?'Noch keine Meldungen angelegt.':'Derzeit keine aktuellen Meldungen'));
      for(const n of items){const card=renderNotice(n,!manage);if(manage)card.append(button('Bearbeiten',()=>edit(n)));content.append(card);}
      content.scrollTop=background?scroll:0;
    }catch(error){if(ticket===generation)message(error.message,true);}
  }
  async function mutate(body){
    if(busy)return;busy=true;message(body.action==='publish'?'Anhänge werden geprüft und die Meldung veröffentlicht…':'Änderung wird gespeichert…');
    const controls=[...content.querySelectorAll('button,input,textarea,select')];controls.forEach(n=>n.disabled=true);
    try{await api(true,body);dirty=false;busy=false;await overview(true);await refreshCount();}
    catch(error){message(error.message,true);}
    finally{busy=false;controls.forEach(n=>n.disabled=false);}
  }
  function edit(item){
    if(!canLeave()||!eligible())return;generation++;dirty=false;message('');content.replaceChildren();
    const n=item||{title:'',description:'',category:'',expires:'',files:[],links:[]};
    const form=el('form',null,'notice-board-form');form.append(el('h3',item?'Meldung bearbeiten':'Neue Meldung'));
    function field(label,value,type,max){const wrap=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type||'text';input.value=value;if(max)input.maxLength=max;wrap.append(input);form.append(wrap);return input;}
    const titleInput=field('Titel',n.title,'text',160);titleInput.required=true;
    function fontChoice(label,current){
      const select=choice(label);
      for(const [key,text] of [['small','Klein'],['standard','Standard'],['large','Groß'],['xl','Sehr groß']])select.add(new Option(text,key));
      select.value=current||'standard';
      return select;
    }
    const titleSize=fontChoice('Schriftgröße des Titels',n.titleSize);
    const organizer=field('Veranstalter (optional)',n.organizer||'','text',160);
    const description=field('Beschreibung',n.description,'textarea',12000);description.required=true;description.rows=6;
    const bodySize=fontChoice('Schriftgröße des Inhaltstexts',n.bodySize);
    let boldRanges=(n.boldRanges||[]).map(pair=>[...pair]);
    let previousText=description.value, editStart=null;
    description.addEventListener('beforeinput',()=>{editStart=description.selectionStart;});
    function syncBold(){
      const next=description.value, old=previousText;
      if(next===old)return;
      let left=0,oldEnd=old.length,newEnd=next.length;
      while(left<(editStart??Infinity) && left<oldEnd && left<newEnd && old[left]===next[left])left++;
      while(oldEnd>left && newEnd>left && old[oldEnd-1]===next[newEnd-1]){oldEnd--;newEnd--;}
      const delta=newEnd-oldEnd, adjusted=[];
      for(const [a,b] of boldRanges){
        if(a<left)adjusted.push([a,Math.min(b,left)]);
        if(a<=left && b>=oldEnd && (oldEnd>left || b>left))adjusted.push([left,newEnd]);
        if(b>oldEnd)adjusted.push([Math.max(a,oldEnd)+delta,b+delta]);
      }
      boldRanges=mergedRanges(adjusted);
      previousText=next; editStart=null;
    }
    description.addEventListener('input',syncBold);
    const boldButton=button('Fett',()=>{
      syncBold();
      const a=description.selectionStart,b=description.selectionEnd;
      if(a===b){message('Markiere zuerst die Wörter, die du formatieren möchtest.');description.focus();return;}
      if(boldRanges.some(([left,right])=>left<=a && right>=b)){
        boldRanges=mergedRanges(boldRanges.flatMap(([left,right])=>[[left,Math.min(right,a)],[Math.max(left,b),right]]));
      }else boldRanges=mergedRanges([...boldRanges,[a,b]]);
      dirty=true;description.focus();description.setSelectionRange(a,b);showPreview();
    });
    boldButton.title='Markierten Text fett setzen oder Fettschrift aufheben';
    boldButton.style.fontWeight='bold';
    form.append(boldButton);
    const categoryLabel=el('label','Kategorie (optional)'),category=el('select');
    category.setAttribute('aria-label','Kategorie (optional)');
    for(const value of ['','Turniereinladung','Veranstaltung','Regionale Nachricht','Sonstiges']){const option=el('option',value||'Keine Kategorie');option.value=value;category.append(option);}category.value=n.category;categoryLabel.append(category);form.append(categoryLabel);
    const expires=field('Anzeigen bis (optional, einschließlich dieses Tages)',n.expires,'date');
    form.append(el('p','Anhänge zuerst in Gamer/SchwarzesBrett/anhaenge/ auf GitHub hochladen. Hier je Zeile nur den Dateinamen eintragen (maximal 10). Beim Veröffentlichen wird die Verfügbarkeit geprüft.','notice-board-help'));
    const files=field('Dateinamen der Anhänge (optional)',n.files.join('\n'),'textarea',1600);files.rows=3;
    const links=field('Externe HTTPS-Links (optional, ein Link pro Zeile, maximal 10)',n.links.join('\n'),'textarea',20010);links.rows=3;
    function choice(label){
      const wrap=el('label',label), select=el('select');
      select.setAttribute('aria-label',label);
      wrap.append(select); form.append(wrap); return select;
    }
    function options(select,values,empty,selected){
      select.replaceChildren(new Option(empty,''));
      for(const value of new Set(values))select.add(new Option(value,value));
      if(values.includes(selected))select.value=selected;
    }
    const lines=input=>input.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const headerImage=choice('Bild über dem Titel (optional)');
    const headerWidth=choice('Breite des Bildes über dem Titel');
    for(const width of [25,50,75,100])headerWidth.add(new Option(width+' %',width));
    headerWidth.value=n.headerWidth||25;
    form.append(el('p','Für ein Bild im Text: Dateinamen oben eintragen, den Cursor in der Beschreibung platzieren, Bild und Breite wählen und „Bild einfügen“ anklicken.','notice-board-help'));
    const imageChoice=choice('Bild aus den Anhängen'), size=choice('Bildbreite');
    for(const width of [25,50,75,100])size.add(new Option(width+' %',width));
    const widths={...n.images};
    const syncSize=()=>{size.value=widths[imageChoice.value]||50;};
    imageChoice.addEventListener('change',syncSize);
    size.addEventListener('change',()=>{
      if(imageChoice.value)widths[imageChoice.value]=Number(size.value);
    });
    form.append(button('Bild einfügen',()=>{
      const name=imageChoice.value;
      if(!name){message('Trage zuerst einen Bilddateinamen bei den Anhängen ein und wähle das Bild aus.',true);return;}
      widths[name]=Number(size.value);
      editStart=description.selectionStart;
      description.setRangeText('[[Bild: '+name+']]',description.selectionStart,description.selectionEnd,'end');
      syncBold(); dirty=true; description.focus(); showPreview();
    }));
    const invitation=choice('Zur Ausschreibung (optional)'), tournament=choice('Zur Turnierseite (optional)');
    function refreshChoices(){
      const names=lines(files), urls=lines(links);
      const imageNames=names.filter(name=>/\.(png|jpe?g|webp)$/i.test(name));
      options(headerImage,imageNames,'Kein Bild',headerImage.value);
      options(imageChoice,imageNames,'Bild wählen',imageChoice.value);
      syncSize();
      options(invitation,[...names.filter(name=>/\.pdf$/i.test(name)),...urls],'Keine Schaltfläche',invitation.value);
      options(tournament,urls,'Keine Schaltfläche',tournament.value);
    }
    refreshChoices();
    headerImage.value=n.headerImage||'';
    invitation.value=n.invitation||''; tournament.value=n.tournament||'';
    files.addEventListener('change',refreshChoices);
    links.addEventListener('change',refreshChoices);
    form.append(el('p','Nur ausdrücklich freigegebene Texte und Dateien veröffentlichen. Keine privaten E-Mail-Kopfzeilen oder Empfängerdaten übernehmen. Dateien im öffentlichen GitHub-Ordner sind unabhängig vom Entwurfsstatus erreichbar.','notice-board-help'));
    const approvedLabel=el('label',null,'notice-board-approval'),approved=el('input');approved.type='checkbox';approvedLabel.append(approved,el('span','Texte und Anhänge sind zur öffentlichen Veröffentlichung freigegeben.'));form.append(approvedLabel);
    function notice(){
      const names=lines(files);
      const images=Object.fromEntries(Object.entries(widths).filter(([name])=>names.includes(name) && description.value.includes('[[Bild: '+name+']]')));
      return {titleSize:titleSize.value,bodySize:bodySize.value,headerImage:headerImage.value,headerWidth:Number(headerWidth.value),boldRanges:mergedRanges(boldRanges),title:titleInput.value,organizer:organizer.value.trim(),description:description.value,category:category.value,expires:expires.value,files:names,links:lines(links),images,invitation:invitation.value,tournament:tournament.value};
    }
    const identity={id:item?.id,revision:item?.revision||0};
    const actions=el('div',null,'notice-board-actions'),preview=el('section',null,'notice-board-preview');preview.setAttribute('aria-label','Vorschau');
    function showPreview(){if(!form.reportValidity())return;const draft=notice();if(draft.links.some(url=>{try{const u=new URL(url);return u.protocol!=='https:'||u.username||u.password;}catch{return true;}})){message('Bitte gültige HTTPS-Links ohne Zugangsdaten eingeben.',true);return;}preview.replaceChildren(el('h3','Vorschau · noch nicht veröffentlicht'),renderNotice(draft));message('');}
    form.addEventListener('change',()=>{if(preview.childElementCount)showPreview();});
    actions.append(button('Vorschau',showPreview),button('Entwurf speichern',()=>{if(form.reportValidity())mutate({...identity,action:'draft',notice:notice()});}),button('Veröffentlichen',()=>{if(!form.reportValidity())return;if(!approved.checked){message('Bitte die öffentliche Freigabe bestätigen.',true);approved.focus();return;}mutate({...identity,action:'publish',notice:notice(),approved:true});}));
    if(item)actions.append(button('Ausblenden',()=>{if(confirm('Meldung öffentlich ausblenden? Ungespeicherte Eingaben werden verworfen.'))mutate({...identity,action:'hide'});}),button('Löschen',()=>{if(confirm('Meldung endgültig löschen? Die Dateien auf GitHub bleiben erhalten.'))mutate({...identity,action:'delete',confirmation:'MELDUNG LÖSCHEN'});}));
    actions.append(button('Zur Übersicht',()=>overview(true)));form.append(actions,preview);form.addEventListener('input',()=>{dirty=true;});form.addEventListener('submit',e=>e.preventDefault());content.append(form);content.scrollTop=0;titleInput.focus();
  }
  openButton.addEventListener('click',()=>{previousFocus=document.activeElement;dialog.showModal();document.documentElement.classList.add('notice-board-open');overview(false);});
  window.addEventListener('hammerschach:auth-change',()=>{generation++;dirty=false;busy=false;content.replaceChildren();if(dialog.open)overview(false);refreshCount();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshCount();if(dialog.open&&!managing)overview(false,true);}});
  // Expiry/new badges update while the page stays open; no modal opens automatically.
  setInterval(()=>{if(document.hidden)return;updateCount();if(dialog.open&&!managing)overview(false,true);},60000);
  setInterval(()=>{if(!document.hidden)refreshCount();},300000);
  refreshCount();
})();

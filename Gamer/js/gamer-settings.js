'use strict';
(function(){
 const P=HammerschachPreferences;
 const root=document.documentElement;
 root.classList.add('central-settings');
 const dialog=document.createElement('dialog');
 dialog.id='gamerSettings';dialog.setAttribute('aria-labelledby','settingsTitle');
 dialog.innerHTML=`<div class="settings-head"><div><span class="settings-eyebrow">DEIN GAMER</span><h2 id="settingsTitle">Einstellungen</h2></div><button type="button" class="settings-close" aria-label="Einstellungen schließen">×</button></div>
 <p class="settings-intro">So spielt es sich für dich am besten. Änderungen wirken sofort.</p>
 <nav class="settings-tabs" aria-label="Einstellungsbereiche"><button type="button" data-tab="appearance">Darstellung</button><button type="button" data-tab="play">Spielverhalten</button><button type="button" data-tab="sound">Töne & Hinweise</button></nav>
 <div class="settings-content"></div><footer><p id="settingsSaveStatus" role="status">Auf diesem Gerät gespeichert.</p><button type="button" id="settingsRetry" hidden>Kontospeicherung erneut versuchen</button><button type="button" id="settingsReset">Standard wiederherstellen</button><button type="button" id="settingsDone">Fertig</button></footer>`;
 document.body.append(dialog);
 const content=dialog.querySelector('.settings-content');
 const status=dialog.querySelector('#settingsSaveStatus');
 const retry=dialog.querySelector('#settingsRetry');
 const sections={};
 function section(tab,title,description){const el=document.createElement('section');el.dataset.section=tab;el.innerHTML='<h3></h3><p class="settings-help"></p>';el.querySelector('h3').textContent=title;el.querySelector('p').textContent=description||'';content.append(el);sections[title]=el;return el;}
 function select(el,key,label,items,hint){const row=document.createElement('label');row.className='settings-row';const copy=document.createElement('span');copy.textContent=label;if(hint){const small=document.createElement('small');small.textContent=hint;copy.append(small);}const input=document.createElement('select');input.dataset.preference=key;for(const [value,text] of items)input.add(new Option(text,value));input.value=P.get(key);input.addEventListener('change',()=>P.set(key,input.value));row.append(copy,input);el.append(row);}
 function toggle(el,key,label,hint){const row=document.createElement('label');row.className='settings-row';const copy=document.createElement('span');copy.textContent=label;if(hint){const small=document.createElement('small');small.textContent=hint;copy.append(small);}const input=document.createElement('input');input.type='checkbox';input.dataset.preference=key;input.checked=P.get(key);input.addEventListener('change',()=>P.set(key,input.checked));row.append(copy,input);el.append(row);}
 const appearance=section('appearance','Oberfläche','Die Darstellung gilt auch für die eingebundenen Werkstatt-Bretter.');
 select(appearance,'scheme','Farbschema',[['light','Hell'],['dark','Dunkel'],['system','Wie mein Gerät']]);
 toggle(appearance,'focus','Konzentrationsmodus','Blendet im Spielraum Chat und zusätzliche Informationsbereiche aus.');
 const board=section('appearance','Brett & Figuren');
 select(board,'board','Schachbrett',boardColorPresets.map(p=>[p.id,p.name]));
 select(board,'pieces','Figurensatz',pieceSetPresets.map(p=>[p.id,p.name]));
 const preview=document.createElement('div');preview.className='settings-preview';preview.setAttribute('aria-label','Vorschau von Brett und Figuren');board.append(preview);
 const sizeRow=document.createElement('div');sizeRow.className='settings-size';sizeRow.innerHTML='<label for="settingsBoardSize">Brettgröße <output id="settingsBoardSizeValue"></output></label><div class="settings-size-buttons"><button type="button" data-size="760">Standard</button><button type="button" data-size="860">Groß</button><button type="button" data-size="1000">Sehr groß</button></div><div class="settings-range"><button type="button" data-step="-10" aria-label="Brett verkleinern">−</button><input id="settingsBoardSize" type="range" min="760" max="1000" step="10" aria-label="Brettgröße"><button type="button" data-step="10" aria-label="Brett vergrößern">+</button></div><p class="settings-help">Auf diesem Gerät gespeichert. Wirkt im Spielraum und in der Werkstatt; bei wenig Platz wird das Brett automatisch begrenzt.</p>';
 board.append(sizeRow);
 const sizeHint=document.createElement('p');sizeHint.className='settings-help';sizeHint.textContent='Die Brettgröße passt sich hier automatisch an. Eine freie Größenwahl gibt es auf ausreichend großen Desktopansichten mit Mausbedienung.';board.append(sizeHint);
 const range=sizeRow.querySelector('input');
 function sizeRefresh(){const api=window.HammerschachBoardSize;const available=!!api?.available();sizeRow.hidden=!available;sizeHint.hidden=available;if(!api)return;range.value=api.get();sizeRow.querySelector('output').textContent=api.get()+' px';sizeRow.querySelectorAll('[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.size)===api.get())));sizeRow.querySelector('[data-step="-10"]').disabled=api.get()<=760;sizeRow.querySelector('[data-step="10"]').disabled=api.get()>=1000;}
 range.addEventListener('input',()=>{window.HammerschachBoardSize?.set(range.value);sizeRefresh();});
 sizeRow.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const api=window.HammerschachBoardSize;if(api)api.set(b.dataset.size||api.get()+Number(b.dataset.step));sizeRefresh();}));
 window.addEventListener('resize',sizeRefresh);window.addEventListener('hammerschach:board-size-ready',sizeRefresh);window.addEventListener('hammerschach:board-size-change',sizeRefresh);
 toggle(board,'coordinates','Koordinaten anzeigen');toggle(board,'lastMove','Letzten Zug markieren');toggle(board,'legalMoves','Mögliche Zielfelder anzeigen');toggle(board,'reducedMotion','Animationen reduzieren');
 const input=section('play','Züge eingeben','Diese Bedienungsoptionen gelten für das Hauptspielbrett. Werkstatt-Werkzeuge behalten ihre eigene Zugeingabe.');
 select(input,'moveMethod','Figuren bewegen',[['both','Klicken und Ziehen'],['click','Nur Klicken'],['drag','Nur Ziehen']]);
 const daily=section('play','Daily-Partien');
 toggle(daily,'confirmDaily','Zug vor dem Absenden bestätigen','Ohne Bestätigung entfällt die Zugvorschau mit der daran gebundenen Remisaktion. Eine bereits offene Vorschau bleibt bestehen.');
 select(daily,'dailyNext','Nach einem bestätigten Zug',[['manual','Bei dieser Partie bleiben'],['auto','Zur nächsten fälligen Partie']],'Automatischer Wechsel erst nach Serverbestätigung. Ohne weitere fällige Partie bleibst du hier.');
 select(daily,'dailyOrder','Reihenfolge der nächsten Partien',[['deadline','Kürzeste Zugfrist zuerst'],['oldest','Längste Wartezeit zuerst']]);
 const live=section('play','Live-Partien');
 toggle(live,'confirmLive','Züge vor dem Absenden bestätigen','Die Uhr läuft während der Bestätigung weiter. Premoves werden weiterhin sofort ausgeführt.');
 toggle(live,'premoves','Premoves erlauben','Ausschalten entfernt auch einen bereits vorgemerkten Premove.');
 toggle(live,'autoQueen','Bauern automatisch in Damen umwandeln','Gilt für Live-Züge und Live-Premoves. Für eine andere Figur vorher ausschalten.');
 const privacy=section('play','Chat & Einladungen');
 toggle(privacy,'hideChat','Partiechat ausblenden');
 select(privacy,'invitations','Persönliche Mitgliedereinladungen',[['everyone','Von allen Mitgliedern'],['favorites','Nur von meinen Lieblingsmitgliedern'],['nobody','Von niemandem']],'Gilt für neue persönliche Live- und Daily-Einladungen. Bestehende Partien, Turniere, Revanchen und geteilte Raumlinks bleiben nutzbar. Wird nach erfolgreicher Kontospeicherung wirksam.');
 const sounds=section('sound','Töne','Der Lautsprecher unter dem Brett schaltet alle Spieltöne gemeinsam stumm.');
 toggle(sounds,'sound','Ton einschalten');toggle(sounds,'moveSound','Figuren- und Zuggeräusche');toggle(sounds,'resultSound','Partiebeginn und Partieende');toggle(sounds,'lowTimeSound','Warnsignal bei Zeitnot','Einmalig bei höchstens zehn Sekunden Restzeit in Live-Partien.');toggle(sounds,'chatSound','Neue Nachrichten im Partiechat');
 const volume=document.createElement('label');volume.className='settings-row';volume.innerHTML='<span>Lautstärke <output></output></span><input type="range" min="0" max="100" step="5" data-preference="volume" aria-label="Lautstärke">';volume.querySelector('input').addEventListener('input',e=>P.set('volume',Number(e.target.value)));sounds.append(volume);
 function tab(name){dialog.querySelectorAll('[data-section]').forEach(s=>s.hidden=s.dataset.section!==name);dialog.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===name)));}
 dialog.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
 dialog.querySelector('.settings-close').addEventListener('click',()=>dialog.close());
 dialog.querySelector('#settingsDone').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>document.getElementById('themeToggleBtn')?.focus());
 dialog.querySelector('#settingsReset').addEventListener('click',()=>{if(!confirm('Alle persönlichen Einstellungen und die Brettgröße auf Standard zurücksetzen?'))return;for(const [key,value] of Object.entries(P.defaults))P.set(key,value);window.HammerschachBoardSize?.set(760);});
 window.HammerschachSettings={open(){sizeRefresh();refresh();if(!dialog.open)dialog.showModal();}};
 function refresh(){for(const el of dialog.querySelectorAll('[data-preference]')){const v=P.get(el.dataset.preference);if(el.type==='checkbox')el.checked=v;else el.value=v;}volume.querySelector('output').textContent=P.get('volume')+' %';preview.replaceChildren();for(let i=0;i<8;i++){const square=document.createElement('span');square.style.background=i%2?'var(--dark-square)':'var(--light-square)';if(i===2||i===5){const img=document.createElement('img');img.src=pieceImg[i===2?'N':'n'];img.alt=i===2?'Weißer Springer':'Schwarzer Springer';square.append(img);}preview.append(square);}}
 function broadcast(){const state=P.snapshot();document.querySelectorAll('iframe').forEach(frame=>{try{if(new URL(frame.src,location.href).origin===location.origin)frame.contentWindow?.postMessage({type:'hammerschach-preferences',preferences:state},location.origin==='null'?'*':location.origin);}catch(_){}});}
 let appliedBoard='',appliedPieces='',appliedDark=null,appliedSound=null;
 function apply(){const p=P.snapshot();if(p.board!==appliedBoard){appliedBoard=p.board;applyBoardColorPreset(p.board,false,true);}if(p.pieces!==appliedPieces){appliedPieces=p.pieces;applyPieceSetPreset(p.pieces,false,true,true);}const dark=p.scheme==='dark'||(p.scheme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(dark!==appliedDark){appliedDark=dark;setDarkMode(dark);}if(p.sound!==appliedSound){appliedSound=p.sound;setSoundEnabled(p.sound);}if(!p.premoves&&queuedPremove)cancelQueuedPremove();updateSidePanelLayout();refresh();broadcast();}
 window.addEventListener('hammerschach:preferences',apply);
 window.addEventListener('storage',e=>{const map={hammerschachGamerSoundEnabled:'sound',hammerschachBoardColor:'board',hammerschachPieceSet:'pieces'};const name=map[e.key];if(!name||!e.newValue)return;const value=name==='sound'?e.newValue!=='off':e.newValue;if(P.get(name)!==value)P.set(name,value);});
 window.addEventListener('message',e=>{if(e.origin!==location.origin||!Array.from(document.querySelectorAll('iframe')).some(f=>f.contentWindow===e.source))return;if(e.data?.type==='hammerschach-preferences-ready')broadcast();if(e.data?.type==='hammerschach-open-settings')window.HammerschachSettings.open();});
 document.querySelectorAll('iframe').forEach(f=>f.addEventListener('load',broadcast));
 // Per-account cache and serialized PATCH writes prevent cross-account leakage and lost field edits.
 let account='',generation=0,loading=false,saving=false,dirty={},inFlight={},timer;
 let initialDevicePreferences=P.snapshot();
 try{const owner=localStorage.getItem('hammerschach.preferences.owner');if(owner&&owner!==String(onlineAuthUser?.id||''))initialDevicePreferences={...P.defaults};}catch(_){}
 let firstAccount=true;
 const cacheKey=id=>'hammerschach.preferences.account.'+id;
 function cache(){try{localStorage.setItem(cacheKey(account),JSON.stringify({preferences:P.snapshot(),pending:{...inFlight,...dirty}}));}catch(_){}}
 function say(text,error=false){status.textContent=text;retry.hidden=!error;}
 async function syncAccount(force=false){const next=String(onlineAuthUser?.id||'');if(next===account&&!force)return;account=next;try{localStorage.setItem('hammerschach.preferences.owner',account);}catch(_){}const ticket=++generation;dirty={};inFlight={};loading=false;saving=false;clearTimeout(timer);if(!account){P.replace(P.defaults);say('Auf diesem Gerät gespeichert. Für geräteübergreifende Einstellungen bitte einloggen.');return;}
 loading=true;
 let migration=firstAccount?initialDevicePreferences:P.defaults;firstAccount=false;
 try{const raw=JSON.parse(localStorage.getItem(cacheKey(account))||'null');migration=raw?.preferences||migration;P.replace(migration);dirty=raw?.pending||{};}catch(_){P.replace(P.defaults);}
 say('Kontoeinstellungen werden geladen …');
 try{const data=await authApi('/api/account/preferences');if(ticket!==generation)return;if(!Object.keys(data.preferences||{}).length)dirty={...migration,...dirty};P.replace({...P.defaults,...data.preferences,...dirty});cache();say('Mit deinem Mitgliedskonto synchronisiert.');}
 catch(_){if(ticket!==generation)return;say('Lokal verfügbar. Kontosynchronisierung derzeit nicht erreichbar.',true);}
 finally{if(ticket===generation){loading=false;if(Object.keys(dirty).length)save();}}
 }
 async function save(){if(!account||loading||saving||!Object.keys(dirty).length)return;const ticket=generation;const batch={...dirty};dirty={};inFlight=batch;saving=true;cache();say('Wird im Mitgliedskonto gespeichert …');try{await authApi('/api/account/preferences',{method:'POST',body:JSON.stringify({preferences:batch})});if(ticket!==generation)return;inFlight={};cache();say('Im Mitgliedskonto gespeichert.');}catch(_){if(ticket!==generation)return;dirty={...batch,...dirty};inFlight={};cache();say('Auf diesem Gerät gespeichert. Kontospeicherung fehlgeschlagen; bitte erneut versuchen.',true);return;}finally{if(ticket===generation){saving=false;inFlight={};}}if(Object.keys(dirty).length)save();}
 window.addEventListener('hammerschach:preferences-edit',e=>{if(!account){say('Auf diesem Gerät gespeichert. Für geräteübergreifende Einstellungen bitte einloggen.');return;}dirty[e.detail.name]=e.detail.value;cache();clearTimeout(timer);timer=setTimeout(save,350);});
 window.addEventListener('hammerschach:auth-change',()=>queueMicrotask(()=>syncAccount()));
 retry.addEventListener('click',()=>Object.keys(dirty).length?save():syncAccount(true));
 window.addEventListener('online',()=>Object.keys(dirty).length?save():syncAccount(true));
 tab('appearance');apply();sizeRefresh();if(onlineAuthUser?.id)syncAccount();
})();

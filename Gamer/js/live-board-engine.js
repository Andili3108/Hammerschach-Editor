'use strict';
// One local worker for the displayed spectator board. No access to player rooms.
const LiveBoardEngine = (() => {
  const workerUrl=new URL('../LiveBoard/stockfish.js',document.currentScript.src).href;
  let worker=null,ready=false,active=null,pending=null,current=null,completed='',timer=null,stopTimer=null,host=null,suspended=false;
  let status='Analyse ausgeschaltet',lines=new Map();
  const settings={auto:false,mode:'depth',depth:18,time:1200,multi:1};
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const key=()=>current?[current.id,current.fen,settings.mode,settings.depth,settings.time,settings.multi].join('|'):'';
  function terminate(){clearTimeout(timer);clearTimeout(stopTimer);if(worker)worker.terminate();worker=null;ready=false;active=null;pending=null;completed='';}
  function fail(){terminate();settings.auto=false;status='Engine nicht erreichbar. Bitte stockfish.js und stockfish.wasm im Ordner Gamer/LiveBoard/ prüfen.';paint();}
  function send(line){worker?.postMessage(line);}
  function ensure(){
    if(worker)return;
    try{worker=new Worker(workerUrl);}catch(_){fail();return;}
    const own=worker;status='Engine wird geladen …';timer=setTimeout(fail,20000);
    worker.onerror=worker.onmessageerror=()=>{if(worker===own)fail();};
    worker.onmessage=event=>{if(worker!==own)return;for(const line of String(event.data||'').trim().split(/\r?\n/))receive(line);};
    send('uci');
  }
  function receive(line){
    if(line==='uciok'){send('setoption name Threads value 1');send('setoption name Hash value 32');send('setoption name UCI_ShowWDL value true');send('isready');return;}
    if(line==='readyok'){clearTimeout(timer);ready=true;start();return;}
    if(line.startsWith('info ')&&active&&active.key===key()&&!pending){
      const pv=line.match(/\bpv (.+)/),score=line.match(/\bscore (cp|mate) (-?\d+)/);if(!pv||!score)return;
      const n=Number(line.match(/\bmultipv (\d+)/)?.[1]||1);
      lines.set(n,{type:score[1],score:Number(score[2]),bound:/\b(lowerbound|upperbound)\b/.test(line),depth:line.match(/\bdepth (\d+)/)?.[1]||'–',nps:line.match(/\bnps (\d+)/)?.[1]||'–',wdl:line.match(/\bwdl (\d+ \d+ \d+)/)?.[1]||'–',pv:pv[1].split(/\s+/)});paint();
    }
    if(line.startsWith('bestmove ')&&active){
      clearTimeout(stopTimer);if(active.key===key()&&!pending){completed=active.key;status='Analyse abgeschlossen';}
      active=null;start();paint();
    }
  }
  function start(){
    if(!ready||active||!pending||suspended)return;
    active=pending;pending=null;lines.clear();status='Analyse läuft …';
    send('setoption name MultiPV value '+settings.multi);send('ucinewgame');send('position fen '+active.fen);
    send(settings.mode==='time'?'go movetime '+settings.time:'go depth '+settings.depth);paint();
  }
  function request(force=false){
    if(!current||suspended||(!settings.auto&&!force))return;
    const k=key();if(active?.key===k&&!pending||!force&&completed===k)return;
    pending={key:k,fen:current.fen};
    if(active){send('stop');clearTimeout(stopTimer);stopTimer=setTimeout(()=>{const job=pending;terminate();pending=job;ensure();paint();},3000);}
    else{ensure();start();}paint();
  }
  function setPosition(id,fen){
    const changed=current?.id!==id||current?.fen!==fen;current={id,fen};
    if(changed){completed='';lines.clear();status=settings.auto?'Analyse wird aktualisiert …':'Bereit zur Analyse';if(!settings.auto&&(active||pending)){terminate();}}
    request();paint();
  }
  function stop(){settings.auto=false;terminate();status='Analyse gestoppt';paint();}
  function suspend(){suspended=true;terminate();lines.clear();status='Analyse pausiert';paint();}
  function resume(){suspended=false;request();paint();}
  function reset(){terminate();current=null;host=null;lines.clear();settings.auto=false;status='Analyse ausgeschaltet';}
  function mount(container){
    host=container;const heading=node('h4','Engine-Analyse');container.append(heading);
    const state=node('p');state.className='lb-engine-status';state.setAttribute('role','status');container.append(state);
    const controls=node('div');controls.className='lb-engine-actions';const autoLabel=node('label'),auto=node('input');auto.type='checkbox';auto.id='lbEngineAuto';auto.checked=settings.auto;auto.addEventListener('change',()=>{settings.auto=auto.checked;if(settings.auto)request(true);else stop();});autoLabel.append(auto,document.createTextNode(' Auto-Analyse'));controls.append(autoLabel);
    for(const [label,id,fn] of [['Analysieren','lbEngineAnalyze',()=>request(true)],['Stop','lbEngineStop',stop]]){const b=node('button',label);b.type='button';b.id=id;b.className='button-flat';b.addEventListener('click',fn);controls.append(b);}container.append(controls);
    const grid=node('div');grid.className='lb-engine-grid';
    for(const [name,label,choices] of [['mode','Suchmodus',[['depth','Tiefe'],['time','Zeit']]],['depth','Tiefe',null],['time','Zeit (ms)',null],['multi','Varianten',[[1,'1'],[2,'2'],[3,'3'],[4,'4']]]]){
      const wrapper=node('label',label),input=node(choices?'select':'input');wrapper.dataset.setting=name;input.id='lbEngine'+name;input.value=settings[name];
      if(choices){for(const [v,t] of choices){const o=node('option',t);o.value=v;input.append(o);}input.value=settings[name];}
      else{input.type='number';input.min=name==='time'?50:1;input.max=name==='time'?600000:99;input.step=name==='time'?50:1;}
      input.addEventListener('change',()=>{settings[name]=choices?(name==='multi'?Number(input.value):input.value):Math.max(Number(input.min),Math.min(Number(input.max),Number(input.value)|| (name==='time'?1200:18)));input.value=settings[name];lines.clear();completed='';request(true);paint();});wrapper.append(input);grid.append(wrapper);
    }container.append(grid);const results=node('div');results.className='lb-engine-results';container.append(results);paint();
  }
  function paint(){
    if(!host)return;
    host.querySelector('.lb-engine-status').textContent=status;
    host.querySelector('#lbEngineAuto').checked=settings.auto;
    host.querySelector('#lbEngineStop').disabled=!worker;
    host.querySelector('[data-setting="depth"]').hidden=settings.mode!=='depth';host.querySelector('[data-setting="time"]').hidden=settings.mode!=='time';
    const results=host.querySelector('.lb-engine-results');results.replaceChildren();
    if(!lines.size){results.append(node('p','Noch keine Bewertung für diese Stellung.'));return;}
    const first=lines.get(1);const score=l=>(l.bound?'≈ ':'')+(l.type==='mate'?'Matt '+l.score:(l.score>0?'+':'')+(l.score/100).toFixed(2));
    if(first){results.append(node('strong','Bewertung (am Zug): '+score(first)),node('p',`Tiefe: ${first.depth} · NPS: ${first.nps}`),node('p','WDL: '+first.wdl.replaceAll(' ',' / ')));const best=LiveBoardPosition.variation(current.fen,first.pv.slice(0,1));results.append(node('p','Bestzug: '+(best||'–')));}
    for(const [i,l] of [...lines].sort((a,b)=>a[0]-b[0])){const p=node('p',`${i}. ${score(l)} · ${LiveBoardPosition.variation(current.fen,l.pv)||l.pv.join(' ')}`);p.className='lb-engine-pv';results.append(p);}
  }
  return {mount,setPosition,reset,suspend,resume};
})();

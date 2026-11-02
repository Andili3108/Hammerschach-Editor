import {hsc08Page} from './hsc08-page.js';
// Allowlist for a reader: never ship configuration drafts, history or pairing drafts.
export function readerTournament(t){
  if(!t)return null;
  const keys=['title','description','descriptionRich','mode','scoring','cycles','rounds','startsOn','endsOn','timeControl','phase'];
  const out=Object.fromEntries(keys.filter(k=>t[k]!==undefined).map(k=>[k,t[k]]));
  out.participants=(t.participants||[]).map(({id,name,dwz,estimatedRating})=>({id,name,...(dwz?{dwz}:{}),...(!dwz&&estimatedRating?{estimatedRating}:{})}));
  if(['running','completed'].includes(t.phase)){
    out.schedule=(t.schedule||[]).filter(r=>!r.pending).map(r=>({number:r.number,...(r.start?{start:r.start,end:r.end}:{}),bye:r.bye,games:r.games.map(({id,white,black,result})=>({id,white,black,result}))}));
    if(t.hasEverResults)out.ranking=(t.ranking||[]).map(({id,rank,points,sb,played})=>({id,rank,points,sb,played}));
  }
  return out;
}
export function hsc08ReaderPage(){
  let html=hsc08Page();
  html=html.slice(0,html.indexOf('<form id="config"'))+'</main><script>('+READER_CLIENT+')();</script></body></html>';
  const a=html.indexOf('<div id="draftNotice"'),b=html.indexOf('<div id="view">',a);html=html.slice(0,a)+html.slice(b);
  return html;
}
const READER_CLIENT=String.raw`function(){
  const $=id=>document.getElementById(id);
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  function rich(target,runs){target.replaceChildren();for(const r of runs){if(r.table){const table=node('table',undefined,'editor-table');r.table.forEach((cells,i)=>{const tr=node('tr');cells.forEach(text=>tr.append(node(i?'td':'th',text)));table.append(tr);});target.append(table);}else{const span=node('span',r.text);span.style.fontSize=r.size+'px';span.style.fontWeight=r.bold?'bold':'normal';span.style.fontStyle=r.italic?'italic':'normal';target.append(span);}}}
  async function load(){
    try{
      const {tournament:t}=await parent.HammerschachHsc08.api('/championship/view');
      parent.HammerschachHsc08.setTitle(t?.title||'Vereinsmeisterschaft');
      rich($('description'),t?.descriptionRich||[{text:t?.description||'Diese Turnierseite ist noch leer.',size:18}]);
      const facts=[];if(t){facts.push(['Modus',t.mode==='swiss'?'Schweizer System':'Rundenturnier'],['Punktewertung',t.scoring==='three-point'?'Sieg 3 · Remis 1 · Niederlage 0':'Sieg 1 · Remis ½ · Niederlage 0']);
        if(t.mode==='swiss'&&t.rounds)facts.push(['Runden',t.rounds]);if(t.mode==='round-robin')facts.push(['Durchgänge',t.cycles===2?'Doppelrunde · Hin- und Rückspiel':'Einfachrunde · jeder gegen jeden']);
        for(const [k,label] of [['startsOn','Turnierbeginn'],['endsOn','Spätester Spieltermin']])if(t[k])facts.push([label,t[k].split('-').reverse().join('.')]);if(t.timeControl)facts.push(['Bedenkzeit',t.timeControl]);}
      $('factsSection').hidden=!facts.length;for(const [label,value] of facts){const div=node('div');div.append(node('strong',label,'fact-label'),node('div',String(value),'tournament-input'));$('tournamentFacts').append(div);}
      const names=new Map((t?.participants||[]).map(p=>[p.id,p.name]));
      $('participantsSection').hidden=['running','completed'].includes(t?.phase);$('emptyParticipants').hidden=!!t?.participants.length;
      for(const [i,p] of (t?.participants||[]).entries()){const li=node('li');const field=node('div',undefined,'tournament-input participant-output');const name=node('span',p.name,'participant-name');if(p.dwz||p.estimatedRating)name.append(node('span',p.dwz?'DWZ '+p.dwz:'Geschätzte Spielstärke '+p.estimatedRating,'participant-rating'));field.append(node('span',(i+1)+'.','participant-number'),name);li.append(field);$('participants').append(li);}
      const labels={'1-0':'1–0','0-1':'0–1','1/2-1/2':'½–½','+/-':'+ / − (kampflos)','-/+':'− / + (kampflos)','-/-':'− / − (beide nicht angetreten)'};
      if(!t?.schedule?.length)$('roundContent').append(node('p','Noch keine Runden freigegeben.'));
      for(const r of [...(t?.schedule||[])].reverse()){const box=node('div',undefined,'rr-round');box.append(node('h3','Runde '+r.number+(r.start?' · '+r.start+' – '+r.end:'')));if(r.bye)box.append(node('p',names.get(r.bye)+(t.mode==='swiss'?' · Freilos · '+(t.scoring==='three-point'?'3 Punkte':'1 Punkt'):' · spielfrei (0 Punkte)')));for(const g of r.games){const row=node('div',undefined,'rr-game');row.append(node('span','Weiß: '+names.get(g.white)),node('span','Schwarz: '+names.get(g.black)),node('strong',labels[g.result]||'Offen'));box.append(row);}$('roundContent').append(box);}
      $('rankingSection').hidden=!t?.ranking;
      if(t?.ranking){const table=node('table',undefined,'rr-ranking');const head=node('tr');['Platz','Name','Gespielt','Punkte',...(t.mode==='swiss'?[]:['SB'])].forEach(v=>head.append(node('th',v)));table.append(head);for(const r of t.ranking){const tr=node('tr');[r.rank,names.get(r.id),r.played,r.points,...(t.mode==='swiss'?[]:[r.sb])].forEach(v=>tr.append(node('td',String(v))));table.append(tr);}const wrap=node('div',undefined,'ranking-wrap');wrap.append(table);$('ranking').append(node('p',t.phase==='completed'?'Endstand':t.mode==='swiss'?'Vorläufig nach Turnierpunkten':'Zwischenstand'),wrap);if(t.phase==='completed')$('ranking').append(node('p','Vereinsmeister: '+t.ranking.filter(r=>r.rank===1).map(r=>names.get(r.id)).join(', ')));}
    }catch(e){$('message').textContent=e.message;}
  }
  window.hscMode=()=>{};window.hscDelete=()=>{};
  new ResizeObserver(()=>parent.HammerschachHsc08.resize(document.querySelector('main').getBoundingClientRect().height+24)).observe(document.querySelector('main'));
  load();
}`;

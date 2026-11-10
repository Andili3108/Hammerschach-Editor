// Literal browser source shared by management and reader pages (safe when bundled).
export const HSC08_UI = String.raw`
window.Hsc08Ui = (() => {
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  const number=value=>value==null?'Offen':new Intl.NumberFormat('de-DE').format(value);
  const date=value=>value?value.split('-').reverse().join('.'):'';
  const kinds={'played':'Gespielt','open':'Offen','bye':'Freilos','absent':'Ausgesetzt','forfeit-win':'Kampfloser Sieg','forfeit-loss':'Kampfloser Verlust'};
  function ranking(target,t){
    target.replaceChildren();
    const swiss=t.mode==='swiss',names=new Map(t.participants.map(p=>[p.id,p.name]));
    target.append(node('p',(t.phase==='completed'?'Endstand':'Zwischenstand')+(swiss?' · Punkte → Buchholz → Buchholz Cut 1':'')));
    const table=node('table',undefined,'rr-ranking'),head=node('tr');
    for(const title of ['Platz','Name','Gespielt','Punkte',...(swiss?['Buchholz','BH Cut 1']:['SB'])])head.append(node('th',title));
    table.append(head);
    for(const row of t.ranking||[]){
      const tr=node('tr');
      const label=names.get(row.id)+(row.excluded?' · ohne Wertung':'')+((t.withdrawn||[]).includes(row.id)?' · Zurückgezogen':'');
      const values=[row.rank,label,row.played,row.points,...(swiss?[row.bh,row.bhCut1]:[row.sb])];
      values.forEach((value,i)=>tr.append(node('td',i===1?value:i===0&&value==null?'—':number(value),i===3?'points':'')));
      table.append(tr);
    }
    const wrap=node('div',undefined,'ranking-wrap');wrap.append(table);target.append(wrap);
    if(swiss){
      const details=node('details',undefined,'calculation');details.append(node('summary','ⓘ Berechnung der Feinwertung'));
      details.append(node('p','Buchholz addiert die Rundenbeiträge. Cut 1 streicht den kleinsten Beitrag; bei ausgesetzten Runden oder kampflosen Niederlagen den kleinsten Beitrag aus diesen Runden. Offene Partien tragen erst nach Ergebniseintrag bei.'));
      for(const row of t.ranking||[]){
        const person=node('details');person.append(node('summary',names.get(row.id)+' · BH '+number(row.bh)+' · Cut 1 '+number(row.bhCut1)));
        const list=node('ol');
        for(const c of row.contributions||[]){
          let text='Runde '+c.round+' · '+kinds[c.kind];
          if(c.opponent)text+=' · '+names.get(c.opponent);
          if(c.value===null)text+=' · Noch kein Beitrag';
          else if(c.kind==='played')text+=' · Gegnerpunkte für die Feinwertung: '+number(c.value);
          else text+=' · Kleineren Wert verwenden aus eigenen '+number(row.points)+' Punkten und Grenze '+number(c.limit)+' = '+number(c.value);
          if(c.cut)text+=' · Bei Cut 1 gestrichen';
          list.append(node('li',text));
        }
        person.append(list,node('p','Buchholz '+number(row.bh)+' − '+number((row.contributions||[]).find(c=>c.cut)?.value||0)+' = Cut 1 '+number(row.bhCut1)));details.append(person);
      }
      target.append(details);
    }
    if(t.phase==='completed')target.append(node('p','Vereinsmeister: '+(t.ranking||[]).filter(r=>r.rank===1).map(r=>names.get(r.id)).join(', '),'winner'));
  }
  function round(t,r,index,names){
    const box=node('details',undefined,'rr-round');box.open=index===0;
    const status=r.pending?'Entwurf':r.games.some(g=>!g.result)?'Partien offen':'Ergebnisse vollständig';
    box.append(node('summary','Runde '+r.number+(r.start?' · '+date(r.start)+' – '+date(r.end):'')+' · '+status+(r.manualPairings?' · Manuell geändert':'')));
    const body=node('div',undefined,'round-body');box.append(body);
    if(r.bye)body.append(node('div',names.get(r.bye)+(t.mode==='swiss'?' · Freilos · '+(t.scoring==='three-point'?'3 Punkte':'1 Punkt'):' · spielfrei (0 Punkte)'),'tournament-input round-note'));
    for(const id of r.absent||[])body.append(node('div',names.get(id)+' · Ausgesetzt · 0 Punkte','tournament-input round-note'));
    if(r.games.length){const labels=node('div',undefined,'rr-game pairing-head');['Brett','Weiß','Ergebnis','Schwarz'].forEach(label=>labels.append(node('strong',label)));body.append(labels);}
    return {box,body};
  }
  function pairing(game,index,names,result){
    const row=node('div',undefined,'rr-game');
    const white=node('span',names.get(game.white),'white-player');white.setAttribute('aria-label','Weiß: '+names.get(game.white));
    const black=node('span',names.get(game.black),'black-player');black.setAttribute('aria-label','Schwarz: '+names.get(game.black));
    const output=typeof result==='string'?node('strong',result,'result'):result;output.classList.add('result');if(game.excluded)output.append(node('small',' · ohne Wertung'));else if(game.withdrawalResult)output.append(node('small',' · Rückzug'));
    row.append(node('span',String(index+1),'board-number'),white,output,black);return row;
  }
  return {ranking,round,pairing};
})();`;

export const HSC08_STYLE = `
.rr-ranking{table-layout:auto}.rr-ranking th,.rr-ranking td{width:1%;white-space:nowrap;text-align:right;padding:10px 12px}.rr-ranking th:nth-child(2),.rr-ranking td:nth-child(2){width:auto;white-space:normal;min-width:130px;text-align:left}.rr-ranking tr:nth-child(even){background:var(--ui-field)}.rr-ranking .points{font-weight:bold}.winner{font-weight:bold}
.calculation{margin-top:18px}.calculation details{border-top:1px solid var(--ui-line);padding:10px 0}.calculation li{line-height:1.5}.calculation summary,.rr-round>summary{cursor:pointer;padding:12px;font-weight:bold;overflow-wrap:anywhere}
.rr-round{margin-top:18px;border:1px solid var(--ui-line);border-radius:14px;background:var(--ui-surface);overflow:hidden}.rr-round>summary{background:var(--ui-field)}.round-body{padding:12px}.round-note.tournament-input{margin:8px 0;height:auto;min-height:0;padding:10px 14px;overflow-wrap:anywhere}
.rr-game{grid-template-columns:44px minmax(0,1fr) minmax(130px,.65fr) minmax(0,1fr);gap:12px;padding:12px 4px}.rr-game .result{text-align:center;justify-self:stretch}.rr-game .board-number{color:var(--ui-muted)}.rr-game .black-player{text-align:right}.pairing-head{font-size:14px;color:var(--ui-muted)}.pairing-head strong:nth-child(3){text-align:center}.pairing-head strong:last-child{text-align:right}
#roundActions{display:block}#roundActions form{border:1px solid var(--ui-line);border-radius:14px;padding:16px;background:var(--ui-surface);margin:16px 0}#roundActions form .availability{grid-column:1/-1}.absence-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.absence-grid label{display:flex;align-items:center;gap:8px;overflow-wrap:anywhere}.absence-grid input{width:20px;min-height:24px;flex-shrink:0}
#config>section{background:transparent;border:0;padding:0}#config .config-card,#config .participant-fields{padding:18px;border:1px solid var(--ui-line);border-radius:14px;background:var(--ui-surface);margin:24px 0}#config .config-card h2{margin-top:0}#config .participant-fields legend{padding:0 8px}#config label[for="descriptionInput"]{margin-top:0;font-weight:bold;font-size:22px}#config .participant-field{border:1px solid var(--ui-line);border-radius:14px;padding:12px;background:var(--ui-field)}#config .config-footer{padding:0 12px}
@media(max-width:900px){.absence-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.absence-grid{grid-template-columns:minmax(0,1fr)}.rr-game{grid-template-columns:24px minmax(0,1fr) minmax(0,1fr);gap:8px}.rr-game .board-number{grid-column:1;grid-row:1/3}.rr-game .white-player{grid-column:2;grid-row:1}.rr-game .black-player{grid-column:3;grid-row:1}.rr-game .result{grid-column:2/4;grid-row:2;font-size:16px;white-space:normal}.pairing-head{display:none}.white-player:before{content:'Weiß · ';font-size:12px;color:var(--ui-muted)}.black-player:before{content:'Schwarz · ';font-size:12px;color:var(--ui-muted)}.rr-ranking th,.rr-ranking td{padding:8px}.round-body{padding:8px}#config .config-card,#config .participant-fields{padding:12px}}
`;

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {broadcastEvent} from '../src/live-board-catalog.js';
const source=fs.readFileSync(new URL('../../Gamer/js/live-board.js',import.meta.url),'utf8');
const context=vm.createContext({scopeLabels:{hamm:'Schachbezirk Hamm (SBHamm)',nrw:'Schachbund NRW (SBNRW)'},state:{}});
vm.runInContext(source.slice(source.indexOf('  function searchText('),source.indexOf('  function renderPlayerResults(')),context);
const match=(event,query)=>context.eventMatches(event,query);
test('unordered partial words and equivalent country names',()=>{
 const event={title:"2026 U.S. Women's Chess Championship",location:'Saint Louis, United States'};
 for(const query of ['USA','US','U.S.','U.S.A.','USA Champ','champ 2026 usa','United States Champ','Vereinigte Staaten','saint lou','WOMEN CHESS'])assert.equal(match(event,query),true,query);
 for(const query of ['Germany','USA 2025','USA Open','USA London'])assert.equal(match(event,query),false,query);
 assert.equal(match({title:'Open',location:'New York, USA'},'USA Open'),true);
 assert.equal(match({title:'Lausanne Open'},'US'),false);
 assert.equal(match({title:'Russia Championship'},'US'),false);
 assert.equal(match({title:'Open'},'USA'),false);
});
test('club terms, regions, accents, punctuation and empty queries',()=>{
 assert.equal(match({title:'Verbandsliga 2026',clubScope:'hamm'},'hamm verband 2026'),true);
 assert.equal(match({title:'German Bundesliga'},'Deutschland bundes'),true);
 assert.equal(match({title:'Thüringen – Vereinsabend'},'thueringen verein'),true);
 assert.equal(match({title:'José Open'},'jose'),true);
 assert.equal(match({title:'NRW-Liga'},'liga nrw'),true);
 assert.equal(match({title:'Open'},'   '),true);
});
test('catalog and player preselection share category, status and region filters',()=>{
 context.scopeMatches=(scope,event)=>!scope||scope===event;
 context.state.events=[{id:1,title:'USA Championship',category:'tournament',ongoing:true},{id:2,title:'USA Open',category:'tournament',finished:true},{id:3,title:'Hamm Liga',category:'club',clubScope:'hamm',ongoing:true}];
 context.state.category='tournament';context.state.filters={q:'USA champ',status:'live',scope:''};
 assert.deepEqual(Array.from(context.filteredEvents(),e=>e.id),[1]);
 context.state.category='club';context.state.filters={q:'liga hamm',status:'live',scope:'hamm'};
 assert.deepEqual(Array.from(context.filteredEvents(),e=>e.id),[3]);
});
test('typing never launches a player request and preserves pending catalog fetch',()=>{
 let stopped=0,searched=0,rendered=0;
 const values={'#lbEventSearch':'USA Champ','#lbPlayerSearch':'Caruana','#lbClubScope':'','#lbEventState':'all'};
 Object.assign(context,{dialog:{querySelector:id=>({value:values[id]})},stop:()=>stopped++,catalog:()=>rendered++,searchPlayers:()=>searched++,status:{}});
 vm.runInContext(source.slice(source.indexOf('  function applyFilters('),source.indexOf('  function replay(')),context);
 context.state.playerSearch=null;context.state.catalogNotice='';
 context.applyFilters(false);assert.equal(stopped,0);assert.equal(searched,0);assert.equal(rendered,1);assert.equal(context.state.filters.player,'');
 context.state.playerSearch={running:true};context.applyFilters(false);assert.equal(stopped,1);assert.equal(searched,0);assert.equal(context.state.playerSearch,null);
 context.state.category='tournament';context.applyFilters();assert.equal(searched,1);assert.equal(context.state.playerSearch.query,'Caruana');assert.deepEqual(Array.from(context.state.playerSearch.events,e=>e.id),[1]);
});
test('broadcast location is retained when available and safe when absent',()=>{
 const tour={id:'Test2026',name:'Open',info:{location:'Saint Louis, USA'}},round={id:'Round001',name:'Round 1'};
 assert.equal(broadcastEvent(tour,round).location,'Saint Louis, USA');
 assert.equal(broadcastEvent({...tour,info:undefined},round).location,'');
 assert.equal(broadcastEvent({...tour,info:{location:{bad:true}}},round).location,'');
});
test('chronology is global before paging, unknown dates last; upcoming soonest first',()=>{
 const events=Array.from({length:10},(_,i)=>({id:i,eventStartsAt:Date.UTC(2026,9,i+1),category:'club',clubScope:i%2?'hamm':'nrw'}));
 events.splice(2,0,{id:'unknown'});
 assert.deepEqual(Array.from(context.chronologicalEvents([...events]),e=>e.id),[9,8,7,6,5,4,3,2,1,0,'unknown']);
 assert.deepEqual(Array.from(context.chronologicalEvents([...events],true),e=>e.id),[0,1,2,3,4,5,6,7,8,9,'unknown']);
 assert.equal(context.eventTime({eventDate:'2026.02.30'}),null);
 assert.equal(context.eventTime({eventDate:'2026.10.09',startsAt:Date.UTC(2026,9,12)}),Date.UTC(2026,9,9));
 assert.match(context.eventDateLabel({startsAt:Date.UTC(2026,9,12)}),/^Runde:/);
 assert.equal(context.eventDateLabel({}), 'Datum unbekannt');
});

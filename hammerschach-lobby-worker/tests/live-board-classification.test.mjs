import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyBroadcast,normalizeEvent,orderedEvents} from '../src/live-board-classification.js';
import {sourceFromLink} from '../src/live-board-catalog.js';
import {sourceEvents} from '../src/live-board-sources.js';

test('German club hierarchy, independent of provider team flag',()=>{
  for(const [name,scope] of [['German Bundesliga 2026/27 (Schachbundesliga)','bundesliga'],["German 2nd Women’s Bundesliga | West",'bundesliga'],['Bundesliga 2026','bundesliga'],['Frauenbundesliga 2026','bundesliga'],['NRW-Liga 1','nrw'],['Schachverband Ruhrgebiet Verbandsliga','ruhrgebiet'],['Schachbezirk Hamm Mannschaftsmeisterschaft','hamm']]){
    assert.deepEqual(classifyBroadcast({name}),{category:'club',clubScope:scope});
  }
});
test('foreign leagues and unknown team events are outside initial discovery scope',()=>{
  for(const name of ['Romanian Team Chess Championships 2026','Serbian Super League 2026 | Open','Icelandic Team Chess Championships','Swiss National League A','Austrian Bundesliga','Österreichische Schachbundesliga','Mannschaftsmeisterschaft','1. Članska liga vzhod 2026'])assert.equal(classifyBroadcast({name,teamTable:true}),null,name);
});
test('world-class and small independent tournaments both remain tournaments',()=>{
  for(const name of ['Unna Open','Quick-Round-Robin','NRW Einzelmeisterschaft','Hamm Open','Tata Steel Masters','Fagernes International Autumn | GM'])assert.deepEqual(classifyBroadcast({name}),{category:'tournament'},name);
  assert.deepEqual(classifyBroadcast({name:'2026 Massachusetts Masters vs Challengers Invitational',teamTable:true}),{category:'tournament'});
});
test('saved and configured Bundesliga corrected, explicit local scopes retained and ordered',()=>{
  const make=(title,category,scope,url=title)=>({id:title,title,category,clubScope:scope,source:{type:'pgn',url}});
  const result=orderedEvents([make('Unna Open','tournament'),make('Hamm Vereinsabend','club','hamm'),make('Ruhr Teams','club','ruhrgebiet'),make('NRW Teams','club','nrw'),make('German Bundesliga','tournament'),make('Duplicate','tournament',undefined,'German Bundesliga'),make('Altbestand','club')]);
  assert.deepEqual(result.map(e=>e.clubScope||e.category),['bundesliga','nrw','ruhrgebiet','hamm','own','tournament']);
  assert.equal(normalizeEvent(make('Unna Open','tournament','hamm')).clubScope,undefined);
  const env={LIVE_BOARD_DEMO:'1',LIVE_BOARD_EVENTS:JSON.stringify([{id:'test',title:'Schachbundesliga',category:'tournament',source:{type:'demo'}}])};
  assert.equal(sourceEvents(env)[0].category,'club');
});
test('manual regional events and small tournaments accept valid scope only',()=>{
  const body={title:'Vereinsabend',category:'club',clubScope:'hamm',url:'https://lichess.org/api/broadcast/round/Abcd1234.pgn'};
  assert.equal(sourceFromLink(body,{}).clubScope,'hamm');
  assert.equal(sourceFromLink({...body,title:'Quick-Round-Robin',category:'tournament'},{}).category,'tournament');
  assert.throws(()=>sourceFromLink({...body,clubScope:'invented'},{}));
});

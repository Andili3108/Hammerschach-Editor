import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../../Gamer/js/live-board-clock.js',import.meta.url),'utf8'),context);
const create=()=>vm.runInContext('LiveBoardClock.create()',context);
const game={fen:'',moves:['e4','e5'],finished:false,clocks:{white:'0:01:00',black:'0:02:00'}};
test('unchanged source snapshots never reset locally advancing clock',()=>{
 const clock=create();clock.update('a',game,'w',0,true);
 assert.equal(clock.read(10000).white.text,'0:00:50');assert.equal(clock.read(10000).black.text,'0:02:00');
 clock.update('a',game,'w',10000,true);assert.equal(clock.read(20000).white.text,'0:00:40');assert.equal(clock.read(20000).white.estimated,true);
});
test('new moves and corrected clock values synchronize the correct side',()=>{
 const clock=create();clock.update('a',game,'w',0,true);
 clock.update('a',{...game,moves:[...game.moves,'Nf3'],clocks:{white:'0:00:48',black:'0:02:00'}},'b',12000,true);
 assert.equal(clock.read(22000).white.text,'0:00:48');assert.equal(clock.read(22000).white.estimated,false);assert.equal(clock.read(22000).black.text,'0:01:50');
 clock.update('a',{...game,moves:[...game.moves,'Nf3'],clocks:{white:'0:00:48',black:'0:01:40'}},'b',22000,true);
 assert.equal(clock.read(25000).black.text,'0:01:37');
});
test('pause, finished game, unknown clocks and initial position do not invent a running clock',()=>{
 const clock=create();clock.update('a',game,'w',0,true);clock.pause(5000);assert.equal(clock.read(60000).white.text,'0:00:55');
 clock.update('a',game,'w',60000,false);assert.equal(clock.read(90000).white.text,'0:00:55');
 clock.update('a',game,'w',90000,true);assert.equal(clock.read(92000).white.text,'0:00:53');
 clock.update('a',{...game,finished:true},'w',92000,false);assert.equal(clock.read(120000).white.text,'0:01:00');assert.equal(clock.read(120000).white.estimated,false);
 clock.update('b',{...game,moves:[]},'w',0,true);assert.equal(clock.read(60000).white.text,'0:01:00');assert.equal(clock.isRunning(),false);
 clock.update('c',{...game,clocks:{white:null,black:'wrong'}},'w',0,true);assert.equal(clock.read(60000).white.text,'');assert.equal(clock.isRunning(),false);
 clock.reset();assert.equal(clock.read(60000).black.text,'');
});
test('estimated zero never changes game result and a different event resets the estimate',()=>{
 const clock=create();clock.update('a',game,'w',0,true);assert.equal(clock.read(999000).white.text,'0:00:00');assert.equal(game.finished,false);
 clock.update('b',game,'w',999000,true);assert.equal(clock.read(999000).white.text,'0:01:00');
});

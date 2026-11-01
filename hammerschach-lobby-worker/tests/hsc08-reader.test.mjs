import test from 'node:test';import assert from 'node:assert/strict';import {readerTournament,hsc08ReaderPage} from '../src/hsc08-reader.js';
test('reader projection excludes draft pairings and audit, allows released results only',()=>{
 const base={title:'VM',phase:'prepared',participants:[{id:'p',name:'Name',secret:'hidden'}],schedule:[{number:1,bye:null,games:[{id:'g',white:'p',black:'q',result:'1-0',reason:'private'}]}],audit:[{secret:'private'}],hasEverResults:true,ranking:[{id:'p',rank:1,points:1,sb:0,played:1,private:'hidden'}]};
 const prepared=readerTournament(base);assert.ok(!('schedule' in prepared));assert.ok(!('audit' in prepared));assert.ok(!('ranking' in prepared));assert.ok(!JSON.stringify(prepared).includes('hidden'));
 const running=readerTournament({...base,phase:'running'});assert.equal(running.schedule[0].games[0].result,'1-0');assert.equal(running.ranking[0].points,1);assert.ok(!JSON.stringify(running).includes('private'));assert.ok(!('hasEverResults' in running));
 const html=hsc08ReaderPage();new Function(html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validPreferencePatch} from '../src/gamer-preferences.js';
const source=name=>readFileSync(new URL('../../Gamer/js/'+name+'.js',import.meta.url),'utf8');
const key='hammerschach.preferences.v1';
function boot(saved={},legacy){
 const values=new Map(Object.entries(saved));if(legacy)values.set('hammerschachGamerColorScheme',legacy);
 const listeners=new Map(),root={dataset:{},style:{},classList:{toggle(){}}};
 const context={document:{documentElement:root},location:{origin:'https://test'},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},addEventListener:(type,fn)=>{const f=listeners.get(type)||[];f.push(fn);listeners.set(type,f);},dispatchEvent:e=>{for(const f of listeners.get(e.type)||[])f(e);}};
 context.window=context;context.parent=context;vm.createContext(context);
 vm.runInContext(source('gamer-appearance'),context);const initial=context.HammerschachAppearance.current();
 vm.runInContext(source('gamer-preferences'),context);
 return {A:context.HammerschachAppearance,P:context.HammerschachPreferences,values,initial,context,listeners};
}
test('first visit uses soft, before styles and after preferences initialization',()=>{const b=boot();assert.equal(b.initial,'soft');assert.equal(b.P.get('scheme'),'soft');assert.equal(b.P.get('lightScheme'),'soft');});
for(const scheme of ['light','soft','dark','auto','system'])for(const autoNight of [true,false])test(`migration ${scheme}, former automatic flag ${autoNight}`,()=>{
 const b=boot({[key]:JSON.stringify({scheme,autoNight,volume:35,board:'grau',confirmDaily:false})});
 const expected=['light','soft','dark'].includes(scheme)?scheme:'soft';
 assert.equal(b.initial,expected);assert.equal(b.A.current(),expected);assert.equal(b.P.get('lightScheme'),scheme==='light'?'light':'soft');
 assert.equal(b.P.get('volume'),35);assert.equal(b.P.get('board'),'grau');assert.equal(b.P.get('confirmDaily'),false);
 assert.ok(!JSON.parse(b.values.get(key)).hasOwnProperty('autoNight'));
});
for(const scheme of ['light','soft','dark'])test(`legacy single key ${scheme}`,()=>{const b=boot({},scheme);assert.equal(b.A.current(),scheme);assert.equal(b.P.get('lightScheme'),scheme==='light'?'light':'soft');});
test('dark keeps showing while changing preferred light; sun returns to preference across reload',()=>{
 let b=boot();b.A.toggle();assert.equal(b.A.current(),'dark');b.P.set('lightScheme','light');assert.equal(b.A.current(),'dark');
 b=boot(Object.fromEntries(b.values));assert.equal(b.initial,'dark');b.A.toggle();assert.equal(b.A.current(),'light');
 b.P.set('lightScheme','soft');assert.equal(b.A.current(),'soft');b.A.toggle();b.A.toggle();assert.equal(b.A.current(),'soft');
});
test('account loads/logout preserve current appearance and device move method while applying other settings',()=>{
 const b=boot();b.P.set('scheme','light');b.A.toggle();b.P.set('moveMethod','click');
 b.P.replace({scheme:'soft',lightScheme:'soft',volume:45,moveMethod:'drag'});
 assert.equal(b.A.current(),'dark');assert.equal(b.P.get('lightScheme'),'light');assert.equal(b.P.get('volume'),45);assert.equal(b.P.get('moveMethod'),'click');
 b.P.replace(b.P.defaults);assert.equal(b.A.current(),'dark');assert.equal(b.P.get('lightScheme'),'light');
});
test('both coupled color fields emit final-state edits for account persistence',()=>{
 const b=boot(),edits=[];b.context.addEventListener('hammerschach:preferences-edit',e=>edits.push(e.detail));b.P.set('lightScheme','light');
 assert.deepEqual(edits.map(e=>e.name).sort(),['lightScheme','scheme']);assert.ok(edits.every(e=>e.value==='light'));
});
test('another tab applies the complete saved pair',()=>{const b=boot();b.values.set(key,JSON.stringify({...b.P.snapshot(),scheme:'dark',lightScheme:'light'}));b.context.dispatchEvent({type:'storage',key});assert.equal(b.A.current(),'dark');b.A.toggle();assert.equal(b.A.current(),'light');});
test('appearance never observes system color or time',()=>{const s=source('gamer-appearance');assert.doesNotMatch(s,/matchMedia|setInterval|setTimeout|visibilitychange|temporarySoft|new Date/);});
test('account accepts the light preference and discards retired flags without losing other fields',()=>{
 assert.deepEqual(validPreferencePatch({scheme:'dark',lightScheme:'light',volume:20}),{scheme:'dark',lightScheme:'light',volume:20});
 assert.equal(validPreferencePatch({lightScheme:'dark'}),null);
 assert.deepEqual(validPreferencePatch({autoNight:true,volume:20}),{volume:20});
});

test('malformed preference data falls back to the explicit legacy color without a flash',()=>{const b=boot({[key]:'{broken'},'dark');assert.equal(b.initial,'dark');assert.equal(b.A.current(),'dark');});
test('dark edits send both fields even when the light preference did not change',()=>{const b=boot({},'light'),edits=[];b.context.addEventListener('hammerschach:preferences-edit',e=>edits.push(e.detail));b.A.toggle();assert.deepEqual(edits.map(e=>[e.name,e.value]),[['scheme','dark'],['lightScheme','light']]);});

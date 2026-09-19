import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export class /gm, 'class ').replace(/^export default /m, 'const worker = ');
function server(){
  const context = vm.createContext({crypto:webcrypto, TextEncoder, TextDecoder, URL, Request, Response, Headers, setTimeout, clearTimeout, btoa, atob, console});
  vm.runInContext(source, context);
  return context;
}
const chat = {id:'message-1',text:'Hallo!',senderName:'AlterName',senderUserId:'member-1',senderPlayerId:'player-1',role:'w',senderKey:'opaque-mute-key'};

test('Chat verknüpft die gespeicherte Identität, nicht den eventuell geänderten Namen', () => {
  const c=server();
  const global=c.safeGlobalChatMessageForClient(chat,'viewer');
  const game=c.safeChatForClient(chat,{userId:'viewer'});
  assert.equal(global.senderProfileId,'member-1');
  assert.equal(game.senderProfileId,'member-1');
  assert.equal(global.senderName,'AlterName');
  assert.equal(global.senderKey,'opaque-mute-key');
  assert.equal(game.mine,false);
  assert.equal(c.safeChatForClient(chat,{userId:'member-1'}).mine,true);
  for(const value of [global,game]){
    assert.equal(value.senderUserId,undefined);
    assert.equal(value.senderPlayerId,undefined);
    assert.equal(value.email,undefined);
  }
});
test('Gäste bekommen keine Profilverknüpfungen; Gäste und anonymisierte Absender haben keine', () => {
  const c=server();
  assert.equal(c.safeGlobalChatMessageForClient(chat).senderProfileId,'');
  assert.equal(c.safeChatForClient(chat,{}).senderProfileId,'');
  assert.equal(c.safeChatForClient({...chat,senderUserId:'',senderName:'Gelöschtes Mitglied'}, {userId:'viewer'}).senderProfileId,'');
  assert.equal(c.safeChatForClient({...chat,senderUserId:'',senderName:'Gast'}, {userId:'viewer'}).senderProfileId,'');
});
test('Brett liefert Profilkennungen nur bei explizitem Mitgliederzugriff, auch für abwesende Spieler', async () => {
  const c=server();
  const room=vm.runInContext('new GameRoom({storage:{get:async()=>({})}, getWebSockets:()=>[]}, {})',c);
  room.getAccountNamesByUserIds=async()=>({'member-1':'NeuerName'});
  const players={white:{playerId:'p-white',userId:'member-1'},black:{playerId:'p-guest'}};
  const guest=await room.getActivePlayers(players);
  const member=await room.getActivePlayers(players,{includeProfileIds:true});
  assert.equal(guest.white.profileId,'');
  assert.equal(member.white.profileId,'member-1');
  assert.equal(member.white.name,'NeuerName');
  assert.equal(member.white.connected,false);
  assert.equal(member.black.profileId,'');
  assert.equal(member.black.guest,true);
});
test('Partiekategorien verwenden genau die sechs vorhandenen Wertungen', () => {
  const c=server();
  for(const [row,expected] of [
    [{mode:'daily',variant:'standard'},'daily_classic'],
    [{mode:'daily',variant:'freestyle960'},'daily_freestyle'],
    [{mode:'live',variant:'freestyle960',time_label:'Blitz 5+0'},'live_freestyle'],
    [{mode:'live',time_label:'Classic 30+0'},'live_classic'],
    [{mode:'live',time_label:'Rapid 15+10'},'live_rapid'],
    [{mode:'live',time_label:'Blitz 3+2'},'live_blitz'],
    [{mode:'live',time_label:'Unbekannt'},'']
  ]) assert.equal(c.ratingTypeFromCompletedGameRow(row),expected);
});

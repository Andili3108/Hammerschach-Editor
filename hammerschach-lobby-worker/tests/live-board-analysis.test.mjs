import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {parseLivePgn} from '../src/live-board-sources.js';
const ctx=vm.createContext({console,localStorage:{getItem:()=>null}});
for(const file of ['chess-utils.js','chess960-core.js','game-setup.js','board-setup-utils.js','chess-engine.js','live-board-position.js','live-board-pgn.js'])vm.runInContext(fs.readFileSync(new URL('../../Gamer/js/'+file,import.meta.url),'utf8'),ctx);
const run=(code,input)=>{ctx.input=input;return vm.runInContext(code,ctx);};
test('analysis snapshots preserve en passant, castling rights, turn and counters',()=>{
  let r=run('LiveBoardPosition.replay(input)',{moves:['e4','a6','e5','d5'],variant:'Standard'});
  assert.equal(r.positions.at(-1).fen,'rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
  r=run('LiveBoardPosition.replay(input)',{moves:['e4','e5','Nf3','Nc6','Bc4','Nf6','O-O'],variant:'Standard'});
  assert.match(r.positions.at(-1).fen,/ b kq - 5 4$/);
  assert.equal(run('LiveBoardPosition.variation(input.fen,input.moves)',{fen:r.positions[0].fen,moves:['e2e4','e7e5','g1f3']}),'1. e4 e5 2. Nf3');
});
test('PGN roundtrip retains metadata, escaping, all moves and result',()=>{
  const input='[Event "Open \\"A\\" \\\\ Test"]\n[Site "Hamm"]\n[Date "2026.10.08"]\n[White "Ada"]\n[Black "Bob"]\n[WhiteElo "2100"]\n[BlackElo "2050"]\n[ECO "C20"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';
  const original=parseLivePgn(input)[0];const exported=run('LiveBoardPgn.serialize(input,{title:"Fallback"})',original);const result=parseLivePgn(exported)[0];
  assert.deepEqual(result.moves,original.moves);assert.deepEqual(result.headers, {...original.headers,Round:'?'});assert.equal(result.result,'1-0');assert.equal(result.white,'Ada');
});
test('special start with Black to move exports SetUp, FEN and correct move numbering',()=>{
  const game={white:'A',black:'B',finished:true,result:'1/2-1/2',fen:'7k/8/8/8/8/8/8/7K b - - 0 20',moves:['Kg8','Kg1']};
  const pgn=run('LiveBoardPgn.serialize(input,{title:"Test"})',game);
  assert.match(pgn,/\[SetUp "1"\]/);assert.match(pgn,/20\.\.\. Kg8 21\. Kg1 1\/2-1\/2/);assert.equal(parseLivePgn(pgn)[0].fen,game.fen);
});
test('unfinished games and invalid move sequences cannot be downloaded',()=>{
  for(const result of ['*','',null])assert.throws(()=>run('LiveBoardPgn.serialize(input,{})',{white:'A',black:'B',finished:true,result,moves:[]}));
  assert.throws(()=>run('LiveBoardPgn.serialize(input,{})',{finished:true,result:'1-0',moves:['e5']}));
  const pgn=run('LiveBoardPgn.serialize(input,{})',{finished:true,result:'0-1',white:'A',black:'B',moves:[]});assert.match(pgn,/\[Date "\?\?\?\?\.\?\?\.\?\?"\]/);
});

test('engine variation notation includes captures, en passant and promotion',()=>{
  const fen=run('LiveBoardPosition.replay(input).positions.at(-1).fen',{moves:['e4','d5']});
  assert.equal(run('LiveBoardPosition.variation(input.fen,input.moves)',{fen,moves:['e4d5']}),'2. exd5');
  const ep=run('LiveBoardPosition.replay(input).positions.at(-1).fen',{moves:['e4','a6','e5','d5']});
  assert.equal(run('LiveBoardPosition.variation(input.fen,input.moves)',{fen:ep,moves:['e5d6']}),'3. exd6');
  assert.equal(run('LiveBoardPosition.variation(input.fen,input.moves)',{fen:'7k/P7/8/8/8/8/8/7K w - - 0 1',moves:['a7a8n']}),'1. a8=N');
});

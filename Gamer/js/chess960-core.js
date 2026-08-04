'use strict';

const GAME_VARIANT_STANDARD = 'standard';
const GAME_VARIANT_FREESTYLE = 'freestyle960';
const STANDARD_BACK_RANK = 'RNBQKBNR';
let chess960BackRankCache = null;
let chess960BackRankIdCache = null;

function isValidChess960BackRank(rank){
  rank = String(rank || '').toUpperCase();
  if(!/^[RNBQKBNR]{8}$/.test(rank)) return false;
  const counts = {R:0,N:0,B:0,Q:0,K:0};
  for(const ch of rank) counts[ch] = (counts[ch] || 0) + 1;
  if(counts.R !== 2 || counts.N !== 2 || counts.B !== 2 || counts.Q !== 1 || counts.K !== 1) return false;
  const kingFile = rank.indexOf('K');
  const rookFiles = [];
  const bishopFiles = [];
  for(let i=0;i<8;i++){
    if(rank[i] === 'R') rookFiles.push(i);
    if(rank[i] === 'B') bishopFiles.push(i);
  }
  return rookFiles[0] < kingFile && kingFile < rookFiles[1] && bishopFiles.length === 2 && (bishopFiles[0] % 2) !== (bishopFiles[1] % 2);
}
function buildChess960BackRankFromScharnaglId(positionId){
  let n = Math.max(0, Math.min(959, Math.floor(Number(positionId || 0))));
  const lightBishopIndex = n % 4;
  n = Math.floor(n / 4);
  const darkBishopIndex = n % 4;
  n = Math.floor(n / 4);
  const queenIndex = n % 6;
  n = Math.floor(n / 6);

  const knightPairs = [[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]];
  const knightPair = knightPairs[n] || knightPairs[0];
  const rank = Array(8).fill('');

  rank[lightBishopIndex * 2 + 1] = 'B';
  rank[darkBishopIndex * 2] = 'B';

  let freeFiles = rank.map((piece, file) => piece ? -1 : file).filter(file => file >= 0);
  rank[freeFiles[queenIndex]] = 'Q';

  freeFiles = rank.map((piece, file) => piece ? -1 : file).filter(file => file >= 0);
  rank[freeFiles[knightPair[0]]] = 'N';
  rank[freeFiles[knightPair[1]]] = 'N';

  freeFiles = rank.map((piece, file) => piece ? -1 : file).filter(file => file >= 0);
  rank[freeFiles[0]] = 'R';
  rank[freeFiles[1]] = 'K';
  rank[freeFiles[2]] = 'R';
  return rank.join('');
}
function generateChess960BackRanks(){
  if(chess960BackRankCache) return chess960BackRankCache;
  chess960BackRankCache = Array.from({length:960}, (_, positionId) => buildChess960BackRankFromScharnaglId(positionId));
  chess960BackRankIdCache = new Map(chess960BackRankCache.map((rank, positionId) => [rank, positionId]));
  return chess960BackRankCache;
}
function chess960BackRankById(positionId){
  const list = generateChess960BackRanks();
  const id = Math.max(0, Math.min(959, Math.floor(Number(positionId || 0))));
  return list[id] || STANDARD_BACK_RANK;
}
function chess960IdByBackRank(backRank){
  const rank = String(backRank || '').toUpperCase();
  if(!isValidChess960BackRank(rank)) return null;
  generateChess960BackRanks();
  return chess960BackRankIdCache.has(rank) ? chess960BackRankIdCache.get(rank) : null;
}
function randomChess960Setup(){
  const bytes = new Uint16Array(1);
  try{ crypto.getRandomValues(bytes); } catch(_){ bytes[0] = Math.floor(Math.random() * 65536); }
  const positionId = bytes[0] % 960;
  return {variant: GAME_VARIANT_FREESTYLE, positionId, backRank: chess960BackRankById(positionId)};
}

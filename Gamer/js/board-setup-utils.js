'use strict';

function blackBackRankFromWhite(backRank){ return String(backRank || STANDARD_BACK_RANK).toLowerCase().split('').join(''); }
function castlingInfoFromBackRank(backRank){
  backRank = isValidChess960BackRank(backRank) ? backRank : STANDARD_BACK_RANK;
  const kingFile = backRank.indexOf('K');
  const rooks = [];
  for(let i=0;i<8;i++) if(backRank[i] === 'R') rooks.push(i);
  const qRook = rooks.filter(x => x < kingFile).pop();
  const kRook = rooks.find(x => x > kingFile);
  return {
    w:{kingFile, rank:7, kingside:{key:'K', rookFile:kRook, kingTo:6, rookTo:5}, queenside:{key:'Q', rookFile:qRook, kingTo:2, rookTo:3}},
    b:{kingFile, rank:0, kingside:{key:'k', rookFile:kRook, kingTo:6, rookTo:5}, queenside:{key:'q', rookFile:qRook, kingTo:2, rookTo:3}}
  };
}
function rangeBetweenInclusive(a,b){
  const out = [];
  const step = a <= b ? 1 : -1;
  for(let x=a;;x+=step){
    out.push(x);
    if(x === b) break;
  }
  return out;
}
function rangeBetweenExclusive(a,b){
  if(a === b) return [];
  const out = [];
  const step = a < b ? 1 : -1;
  for(let x=a+step; x !== b; x+=step) out.push(x);
  return out;
}

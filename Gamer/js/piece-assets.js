'use strict';

const PIECE_SET_STORAGE_KEY = 'hammerschachPieceSet';
const pieceSetPresets = [
  {id:'cburnett', name:'Cburnett · Standard', paths:{P:'assets/pieces/Chess_plt45.svg',R:'assets/pieces/Chess_rlt45.svg',N:'assets/pieces/Chess_nlt45.svg',B:'assets/pieces/Chess_blt45.svg',Q:'assets/pieces/Chess_qlt45.svg',K:'assets/pieces/Chess_klt45.svg',p:'assets/pieces/Chess_pdt45.svg',r:'assets/pieces/Chess_rdt45.svg',n:'assets/pieces/Chess_ndt45.svg',b:'assets/pieces/Chess_bdt45.svg',q:'assets/pieces/Chess_qdt45.svg',k:'assets/pieces/Chess_kdt45.svg'}},
  {id:'merida', name:'Merida · Klassiker', paths:{P:'assets/pieces/merida/wP.svg',R:'assets/pieces/merida/wR.svg',N:'assets/pieces/merida/wN.svg',B:'assets/pieces/merida/wB.svg',Q:'assets/pieces/merida/wQ.svg',K:'assets/pieces/merida/wK.svg',p:'assets/pieces/merida/bP.svg',r:'assets/pieces/merida/bR.svg',n:'assets/pieces/merida/bN.svg',b:'assets/pieces/merida/bB.svg',q:'assets/pieces/merida/bQ.svg',k:'assets/pieces/merida/bK.svg'}},
  {id:'chessnut', name:'Chessnut · Klassisch', paths:{P:'assets/pieces/chessnut/wP.svg',R:'assets/pieces/chessnut/wR.svg',N:'assets/pieces/chessnut/wN.svg',B:'assets/pieces/chessnut/wB.svg',Q:'assets/pieces/chessnut/wQ.svg',K:'assets/pieces/chessnut/wK.svg',p:'assets/pieces/chessnut/bP.svg',r:'assets/pieces/chessnut/bR.svg',n:'assets/pieces/chessnut/bN.svg',b:'assets/pieces/chessnut/bB.svg',q:'assets/pieces/chessnut/bQ.svg',k:'assets/pieces/chessnut/bK.svg'}},
  {id:'fantasy', name:'Fantasy · Elegant', paths:{P:'assets/pieces/fantasy/wP.svg',R:'assets/pieces/fantasy/wR.svg',N:'assets/pieces/fantasy/wN.svg',B:'assets/pieces/fantasy/wB.svg',Q:'assets/pieces/fantasy/wQ.svg',K:'assets/pieces/fantasy/wK.svg',p:'assets/pieces/fantasy/bP.svg',r:'assets/pieces/fantasy/bR.svg',n:'assets/pieces/fantasy/bN.svg',b:'assets/pieces/fantasy/bB.svg',q:'assets/pieces/fantasy/bQ.svg',k:'assets/pieces/fantasy/bK.svg'}},
  {id:'merida-silversteel', name:'Merida Silversteel · Premium', paths:{P:'assets/pieces/merida-silversteel/wp.png?v=20260808-1',R:'assets/pieces/merida-silversteel/wr.png?v=20260808-1',N:'assets/pieces/merida-silversteel/wn.png?v=20260808-1',B:'assets/pieces/merida-silversteel/wb.png?v=20260808-1',Q:'assets/pieces/merida-silversteel/wq.png?v=20260808-1',K:'assets/pieces/merida-silversteel/wk.png?v=20260808-1',p:'assets/pieces/merida-silversteel/bp.png?v=20260808-1',r:'assets/pieces/merida-silversteel/br.png?v=20260808-1',n:'assets/pieces/merida-silversteel/bn.png?v=20260808-1',b:'assets/pieces/merida-silversteel/bb.png?v=20260808-1',q:'assets/pieces/merida-silversteel/bq.png?v=20260808-1',k:'assets/pieces/merida-silversteel/bk.png?v=20260808-1'}},
  {id:'merida-royalwood', name:'Merida Royalwood · Premium', paths:{P:'assets/pieces/merida-royalwood/wp.png?v=20260808-1',R:'assets/pieces/merida-royalwood/wr.png?v=20260808-1',N:'assets/pieces/merida-royalwood/wn.png?v=20260808-1',B:'assets/pieces/merida-royalwood/wb.png?v=20260808-1',Q:'assets/pieces/merida-royalwood/wq.png?v=20260808-1',K:'assets/pieces/merida-royalwood/wk.png?v=20260808-1',p:'assets/pieces/merida-royalwood/bp.png?v=20260808-1',r:'assets/pieces/merida-royalwood/br.png?v=20260808-1',n:'assets/pieces/merida-royalwood/bn.png?v=20260808-1',b:'assets/pieces/merida-royalwood/bb.png?v=20260808-1',q:'assets/pieces/merida-royalwood/bq.png?v=20260808-1',k:'assets/pieces/merida-royalwood/bk.png?v=20260808-1'}},
  {id:'metal-prestige', name:'Metal Prestige · Premium', paths:{P:'assets/pieces/metal-prestige/wp.png?v=20260807-9',R:'assets/pieces/metal-prestige/wr.png?v=20260807-9',N:'assets/pieces/metal-prestige/wn.png?v=20260807-9',B:'assets/pieces/metal-prestige/wb.png?v=20260807-9',Q:'assets/pieces/metal-prestige/wq.png?v=20260807-9',K:'assets/pieces/metal-prestige/wk.png?v=20260807-9',p:'assets/pieces/metal-prestige/bp.png?v=20260807-9',r:'assets/pieces/metal-prestige/br.png?v=20260807-9',n:'assets/pieces/metal-prestige/bn.png?v=20260807-9',b:'assets/pieces/metal-prestige/bb.png?v=20260807-9',q:'assets/pieces/metal-prestige/bq.png?v=20260807-9',k:'assets/pieces/metal-prestige/bk.png?v=20260807-9'}},
  {id:'royal-walnut', name:'Royal Walnut · Holz', paths:{P:'assets/pieces/royal-walnut/wp.png?v=20260808-1',R:'assets/pieces/royal-walnut/wr.png?v=20260808-1',N:'assets/pieces/royal-walnut/wn.png?v=20260808-1',B:'assets/pieces/royal-walnut/wb.png?v=20260808-1',Q:'assets/pieces/royal-walnut/wq.png?v=20260808-1',K:'assets/pieces/royal-walnut/wk.png?v=20260808-1',p:'assets/pieces/royal-walnut/bp.png?v=20260808-1',r:'assets/pieces/royal-walnut/br.png?v=20260808-1',n:'assets/pieces/royal-walnut/bn.png?v=20260808-1',b:'assets/pieces/royal-walnut/bb.png?v=20260808-1',q:'assets/pieces/royal-walnut/bq.png?v=20260808-1',k:'assets/pieces/royal-walnut/bk.png?v=20260808-1'}},
];
let activePieceSetId = 'cburnett';
try{
  const savedPieceSet = localStorage.getItem(PIECE_SET_STORAGE_KEY);
  if(savedPieceSet === 'rhosgfx'){
    activePieceSetId = 'merida';
    localStorage.setItem(PIECE_SET_STORAGE_KEY, 'merida');
  } else if(savedPieceSet === 'onyx-elegance'){
    activePieceSetId = 'metal-prestige';
    localStorage.setItem(PIECE_SET_STORAGE_KEY, 'metal-prestige');
  } else if(pieceSetPresets.some(p => p.id === savedPieceSet)) activePieceSetId = savedPieceSet;
}catch(_){}
const pieceImg = {...(pieceSetPresets.find(p => p.id === activePieceSetId) || pieceSetPresets[0]).paths};
const pieceChar = {P:'♙',R:'♖',N:'♘',B:'♗',Q:'♕',K:'♔',p:'♟',r:'♜',n:'♞',b:'♝',q:'♛',k:'♚'};
Object.values(pieceImg).forEach(src => {
  const preload = new Image();
  preload.decoding = 'async';
  preload.src = src;
  if(typeof preload.decode === 'function') preload.decode().catch(() => {});
});

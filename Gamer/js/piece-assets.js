'use strict';

const PIECE_SET_STORAGE_KEY = 'hammerschachPieceSet';
const pieceSetPresets = [
  {id:'cburnett', name:'Cburnett · Standard', paths:{P:'assets/pieces/Chess_plt45.svg',R:'assets/pieces/Chess_rlt45.svg',N:'assets/pieces/Chess_nlt45.svg',B:'assets/pieces/Chess_blt45.svg',Q:'assets/pieces/Chess_qlt45.svg',K:'assets/pieces/Chess_klt45.svg',p:'assets/pieces/Chess_pdt45.svg',r:'assets/pieces/Chess_rdt45.svg',n:'assets/pieces/Chess_ndt45.svg',b:'assets/pieces/Chess_bdt45.svg',q:'assets/pieces/Chess_qdt45.svg',k:'assets/pieces/Chess_kdt45.svg'}},
  {id:'merida', name:'Merida · Klassiker', paths:{P:'assets/pieces/merida/wP.svg',R:'assets/pieces/merida/wR.svg',N:'assets/pieces/merida/wN.svg',B:'assets/pieces/merida/wB.svg',Q:'assets/pieces/merida/wQ.svg',K:'assets/pieces/merida/wK.svg',p:'assets/pieces/merida/bP.svg',r:'assets/pieces/merida/bR.svg',n:'assets/pieces/merida/bN.svg',b:'assets/pieces/merida/bB.svg',q:'assets/pieces/merida/bQ.svg',k:'assets/pieces/merida/bK.svg'}},
  {id:'chessnut', name:'Chessnut · Klassisch', paths:{P:'assets/pieces/chessnut/wP.svg',R:'assets/pieces/chessnut/wR.svg',N:'assets/pieces/chessnut/wN.svg',B:'assets/pieces/chessnut/wB.svg',Q:'assets/pieces/chessnut/wQ.svg',K:'assets/pieces/chessnut/wK.svg',p:'assets/pieces/chessnut/bP.svg',r:'assets/pieces/chessnut/bR.svg',n:'assets/pieces/chessnut/bN.svg',b:'assets/pieces/chessnut/bB.svg',q:'assets/pieces/chessnut/bQ.svg',k:'assets/pieces/chessnut/bK.svg'}},
  {id:'fantasy', name:'Fantasy · Elegant', paths:{P:'assets/pieces/fantasy/wP.svg',R:'assets/pieces/fantasy/wR.svg',N:'assets/pieces/fantasy/wN.svg',B:'assets/pieces/fantasy/wB.svg',Q:'assets/pieces/fantasy/wQ.svg',K:'assets/pieces/fantasy/wK.svg',p:'assets/pieces/fantasy/bP.svg',r:'assets/pieces/fantasy/bR.svg',n:'assets/pieces/fantasy/bN.svg',b:'assets/pieces/fantasy/bB.svg',q:'assets/pieces/fantasy/bQ.svg',k:'assets/pieces/fantasy/bK.svg'}},
  {id:'metal-prestige', name:'Metal Prestige · Premium', paths:{P:'assets/pieces/metal-prestige/wp.png?v=20260807-3',R:'assets/pieces/metal-prestige/wr.png?v=20260807-3',N:'assets/pieces/metal-prestige/wn.png?v=20260807-3',B:'assets/pieces/metal-prestige/wb.png?v=20260807-3',Q:'assets/pieces/metal-prestige/wq.png?v=20260807-3',K:'assets/pieces/metal-prestige/wk.png?v=20260807-3',p:'assets/pieces/metal-prestige/bp.png?v=20260807-3',r:'assets/pieces/metal-prestige/br.png?v=20260807-3',n:'assets/pieces/metal-prestige/bn.png?v=20260807-3',b:'assets/pieces/metal-prestige/bb.png?v=20260807-3',q:'assets/pieces/metal-prestige/bq.png?v=20260807-3',k:'assets/pieces/metal-prestige/bk.png?v=20260807-3'}},
  {id:'onyx-elegance', name:'Onyx Elegance · Premium', paths:{P:'assets/pieces/onyx-elegance/wp.png?v=20260807-3',R:'assets/pieces/onyx-elegance/wr.png?v=20260807-3',N:'assets/pieces/onyx-elegance/wn.png?v=20260807-3',B:'assets/pieces/onyx-elegance/wb.png?v=20260807-3',Q:'assets/pieces/onyx-elegance/wq.png?v=20260807-3',K:'assets/pieces/onyx-elegance/wk.png?v=20260807-3',p:'assets/pieces/onyx-elegance/bp.png?v=20260807-3',r:'assets/pieces/onyx-elegance/br.png?v=20260807-3',n:'assets/pieces/onyx-elegance/bn.png?v=20260807-3',b:'assets/pieces/onyx-elegance/bb.png?v=20260807-3',q:'assets/pieces/onyx-elegance/bq.png?v=20260807-3',k:'assets/pieces/onyx-elegance/bk.png?v=20260807-3'}}
];
let activePieceSetId = 'cburnett';
try{
  const savedPieceSet = localStorage.getItem(PIECE_SET_STORAGE_KEY);
  if(savedPieceSet === 'rhosgfx'){
    activePieceSetId = 'merida';
    localStorage.setItem(PIECE_SET_STORAGE_KEY, 'merida');
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

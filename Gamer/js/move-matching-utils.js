'use strict';

function castleSideCode(value){
  if(!value) return '';
  const metaCastle = value.meta && value.meta.castle ? String(value.meta.castle) : '';
  const explicitCastle = value.castle || value.castling || metaCastle;
  const raw = String(explicitCastle || '').trim().toUpperCase();
  if(raw === 'K' || raw === 'Q') return raw;
  const san = String(value.san || '').trim().toUpperCase().replace(/0/g, 'O');
  if(/^O-O-O(?:[+#])?$/.test(san)) return 'Q';
  if(/^O-O(?:[+#])?$/.test(san)) return 'K';
  return '';
}
function findMatchingLegalMove(legalMoves, moveLike){
  if(!Array.isArray(legalMoves) || !moveLike || !moveLike.from || !moveLike.to) return null;
  const from = moveLike.from;
  const to = moveLike.to;
  const sameFrom = move => move.from[0] === from[0] && move.from[1] === from[1];
  const sameTo = move => move.to[0] === to[0] && move.to[1] === to[1];
  const castleHint = castleSideCode(moveLike);

  if(castleHint){
    const hintedCastle = legalMoves.find(move => {
      if(!sameFrom(move) || castleSideCode(move) !== castleHint) return false;
      if(sameTo(move)) return true;
      const meta = move.meta || {};
      return Number.isInteger(meta.kingTo) && meta.kingTo === to[0] && move.to[1] === to[1];
    });
    if(hintedCastle) return hintedCastle;
    return null;
  }

  const exact = legalMoves.filter(move => sameFrom(move) && sameTo(move));
  if(exact.length){
    return exact.find(move => !castleSideCode(move)) || exact[0];
  }

  /* Komfortable Chess960-Eingabe: Eine Rochade darf auch über das spätere
     Königsfeld gewählt werden. Ein tatsächlich legaler normaler Königszug
     auf dieses Feld hat durch die obige Exaktsuche weiterhin Vorrang; in
     mehrdeutigen Stellungen bleibt König-auf-Turm die Rochade-Eingabe. */
  const castleByKingTarget = legalMoves.filter(move => {
    if(!sameFrom(move) || !castleSideCode(move)) return false;
    const meta = move.meta || {};
    return Number.isInteger(meta.kingTo) && meta.kingTo === to[0] && move.to[1] === to[1];
  });
  return castleByKingTarget.length === 1 ? castleByKingTarget[0] : null;
}


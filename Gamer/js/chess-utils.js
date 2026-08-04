'use strict';

/*
  Allgemeine, zustandsfreie Schach-Hilfsfunktionen.
  Als klassisches Skript eingebunden, damit die bestehende Gamer-Logik
  diese Namen unverändert global verwenden kann.
*/
const files = ['a','b','c','d','e','f','g','h'];

function clone(o){ return JSON.parse(JSON.stringify(o)); }
function coordToAlg(x,y){ return files[x] + (8-y); }
function pieceColor(ch){ if(!ch || ch === '.') return null; return ch === ch.toUpperCase() ? 'w' : 'b'; }
function opposite(color){ return color === 'w' ? 'b' : 'w'; }

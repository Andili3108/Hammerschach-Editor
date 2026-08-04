'use strict';

let masterHistory = [];
let masterHistoryRevision = 0;
const historyStateCache = new Map();
function invalidateHistoryStateCache(){
  masterHistoryRevision++;
  historyStateCache.clear();
}
function cacheHistoryState(n,game,positionCounts){
  const safeN = Math.max(0, Math.min(Number(n) || 0, masterHistory.length));
  const counts = positionCounts instanceof Map ? new Map(positionCounts) : new Map();
  const key = game.repetitionKey();
  if(!counts.size) counts.set(key,1);
  historyStateCache.set(safeN, {
    revision:masterHistoryRevision,
    game,
    positionCounts:counts,
    repetitionCount:counts.get(key) || 1
  });
}
function cacheAdvancedHistoryState(game,previousCounts){
  const counts = previousCounts instanceof Map ? new Map(previousCounts) : new Map();
  const key = game.repetitionKey();
  counts.set(key,(counts.get(key) || 0) + 1);
  cacheHistoryState(masterHistory.length,game,counts);
}

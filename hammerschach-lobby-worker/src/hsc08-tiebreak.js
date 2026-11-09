import {score} from './hsc08-round-robin.js';

// C.07, effective 2026-03-01, articles 16.3–16.5. The selected tournament
// scoring system also supplies the draw value and the dummy-opponent cap.
export function swissStandings(t) {
  const rounds = (t.schedule || []).filter(round => !round.pending);
  const win = score('1-0', t.scoring)[0];
  const draw = score('1/2-1/2', t.scoring)[0];
  const players = new Map(t.participants.map(player => [player.id, {
    id: player.id, name: player.name, points: 0, played: 0, records: []
  }]));
  for (const round of rounds) {
    for (const player of players.values()) {
      const game = round.games.find(game => game.white === player.id || game.black === player.id);
      const record = {round: round.number, kind: 'open', points: 0, opponent: null, vur: false};
      if (game?.result) {
        const side = game.white === player.id ? 0 : 1;
        record.points = score(game.result, t.scoring)[side];
        record.opponent = side === 0 ? game.black : game.white;
        if (['1-0', '0-1', '1/2-1/2'].includes(game.result)) {
          record.kind = 'played';
          player.played++;
        } else {
          record.kind = record.points ? 'forfeit-win' : 'forfeit-loss';
          record.vur = !record.points;
        }
      } else if (round.bye === player.id) {
        record.kind = 'bye';
        record.points = win;
      } else if ((round.absent || []).includes(player.id)) {
        record.kind = 'absent';
        record.vur = true;
      }
      player.points += record.points;
      player.records.push(record);
    }
  }
  // Adjust only trailing requested byes for the opponents' tie-breaks.
  // Open games remain open and are not treated as voluntary absence.
  for (const player of players.values()) {
    player.adjusted = player.points;
    let trailing = true;
    for (const record of [...player.records].reverse()) {
      if (!record.vur) trailing = false;
      if (trailing && record.kind === 'absent') player.adjusted += draw;
    }
  }
  const rows = [...players.values()].map(player => {
    const contributions = player.records.map(record => {
      let value = null;
      let limit = null;
      if (record.kind === 'played') value = players.get(record.opponent).adjusted;
      else if (record.kind !== 'open') {
        limit = record.opponent ? players.get(record.opponent).adjusted : t.rounds * draw;
        value = Math.min(player.points, limit);
      }
      return {...record, value, limit, cut: false};
    });
    const counted = contributions.filter(record => record.value !== null);
    const voluntary = counted.filter(record => record.vur);
    const candidates = voluntary.length ? voluntary : counted;
    const cut = candidates.reduce((lowest, record) => !lowest || record.value < lowest.value ? record : lowest, null);
    if (cut) cut.cut = true;
    const bh = counted.reduce((sum, record) => sum + record.value, 0);
    return {id: player.id, name: player.name, points: player.points, played: player.played,
      bh, bhCut1: bh - (cut?.value || 0), contributions};
  });
  rows.sort((a,b) => b.points-a.points || b.bh-a.bh || b.bhCut1-a.bhCut1);
  rows.forEach((row,i) => {
    const previous = rows[i-1];
    row.rank = previous && previous.points === row.points && previous.bh === row.bh && previous.bhCut1 === row.bhCut1 ? previous.rank : i+1;
  });
  return rows;
}

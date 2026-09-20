import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLeagueStandingsHtml, parseLeagueRoundsHtml} from '../src/league-standings.js';

const sourceUrl = 'https://ergebnisdienst.schachbund.de/bedh.php?liga=nrw-k1';

for (const half of ['&frac12;', '&#189;', '&#xBD;', '½']) {
  test(`Rangliste übernimmt halbe Brett- und Kreuztabellenpunkte: ${half}`, () => {
    const table = parseLeagueStandingsHtml(`<table class="kreuztab">
      <tr><th></th><th>Mannschaft</th><th>7</th><th>Sp</th><th>MP</th><th>BP</th></tr>
      <tr><td>4.</td><td><a href="bedm.php?liga=nrw-k1&amp;nummer=8">SV K&ouml;nigsspringer Hamm 45/58</a></td><td>4${half}</td><td>1</td><td>2</td><td>4${half}</td></tr>
      <tr><td>7.</td><td>SV Rochade Eving</td><td>3${half}</td><td>1</td><td>0</td><td>3${half}</td></tr>
    </table>`, sourceUrl);
    assert.equal(table.teamCount, 2);
    assert.equal(table.columnCount, 6);
    assert.deepEqual(table.rows.map(row => row.cells.map(cell => cell.text)), [
      ['4.', 'SV Königsspringer Hamm 45/58', '4½', '1', '2', '4½'],
      ['7.', 'SV Rochade Eving', '3½', '1', '0', '3½']
    ]);
    assert.equal(table.rows[0].cells[1].href, 'https://ergebnisdienst.schachbund.de/bedm.php?liga=nrw-k1&nummer=8');
    assert.equal(table.rows[0].cells[5].kind, 'board-points');
  });
}

test('DSB-Terminplan übernimmt halbe Punkte in Ergebnissen', () => {
  const rounds = parseLeagueRoundsHtml(`<table>
    <tr><th>Tag</th><th>Datum</th><th>Uhrzeit</th><th>Heim</th><th>Gast</th><th>Ergebnis</th></tr>
    <tr><td colspan="6">1. Runde</td></tr>
    <tr><td>So</td><td>20.09.2026</td><td>11:00</td><td>Hamm</td><td>Eving</td><td>4&frac12; : 3&frac12;</td></tr>
  </table>`, 'https://ergebnisdienst.schachbund.de/bedt.php?liga=nrw-k1');
  assert.equal(rounds[0].rows[0].cells[5].text, '4½ : 3½');
  assert.equal(rounds[0].matchCount, 1);
});

test('Ganze Punkte, leere Felder, Text und unbekannte Entities bleiben erhalten', () => {
  const table = parseLeagueStandingsHtml(`<table class="rangliste">
    <tr><th>Mannschaft</th><th>1</th><th>2</th><th>BP</th></tr>
    <tr><td>Team &amp; Gast &unknown12; &lt;b&gt;</td><td>&nbsp;</td><td>+</td><td>5</td></tr>
  </table>`, sourceUrl);
  assert.deepEqual(table.rows[0].cells.map(cell => cell.text), ['Team & Gast &unknown12; <b>', '', '+', '5']);
});

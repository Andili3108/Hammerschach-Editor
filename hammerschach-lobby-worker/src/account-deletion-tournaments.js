// Die Turnierteilnahme besteht auch in Rundenpausen und bei Freilosen fort.
// Die Tabellen müssen vor dem Aufruf mit ensureTournamentTables bereitstehen.
export async function checkAccountTournamentDeletion(env, userId) {
  try {
    // Auch noch nicht initialisierte Räume und unvollständig indexierte Partien
    // sperren die Löschung, unabhängig vom Teilnehmer- oder Turnierstatus.
    const unfinished = await env.DB.prepare(
      `SELECT id FROM tournament_games
        WHERE (white_user_id = ? OR black_user_id = ?) AND status <> 'ended'
        LIMIT 1`
    ).bind(userId, userId).first();
    if (unfinished) {
      return {ok:false, status:409, code:'ACTIVE_TOURNAMENT_GAMES',
        message:'Der Account kann erst gelöscht werden, wenn alle eigenen Turnierpartien beendet sind. Auch bereits angesetzte Partien zählen dazu.'};
    }

    const result = await env.DB.prepare(
      `SELECT tournament.id, tournament.name, tournament.mode, tournament.total_rounds,
              participant.arena_active
         FROM tournaments tournament
         JOIN tournament_participants participant ON participant.tournament_id = tournament.id
        WHERE participant.user_id = ? AND participant.status = 'confirmed'
          AND tournament.status = 'running'`
    ).bind(userId).all();
    const blocked = [];
    for (const tournament of result.results || []) {
      if (tournament.mode === 'arena' && Number(tournament.arena_active) === 0) continue;
      if (tournament.mode === 'knockout') {
        const finalRound = Number(tournament.total_rounds);
        const decision = await env.DB.prepare(
          `SELECT round_number, winner_user_id, loser_user_id
             FROM tournament_knockout_results
            WHERE tournament_id = ? AND (winner_user_id = ? OR loser_user_id = ?)
            ORDER BY round_number DESC LIMIT 1`
        ).bind(tournament.id, userId, userId).first();
        if (decision && Number.isInteger(finalRound) && finalRound >= 2) {
          const round = Number(decision.round_number);
          // Halbfinalverlierer spielen noch um Platz 3. Frühere Verlierer
          // scheiden endgültig aus; nach der Finalrunde ist jeder fertig.
          if (Number.isInteger(round) && round >= 1 && (
            round === finalRound ||
            (decision.loser_user_id === userId && round < finalRound - 1)
          )) continue;
        }
      }
      blocked.push({id:String(tournament.id), name:String(tournament.name || 'Turnier'), mode:tournament.mode});
    }
    if (blocked.length) {
      const onlyArena = blocked.every(tournament => tournament.mode === 'arena');
      const names = blocked.slice(0, 3).map(tournament => '„' + tournament.name + '“').join(', ');
      return {ok:false, status:409, code:'ACTIVE_TOURNAMENTS', activeTournaments:blocked.length,
        message:(onlyArena
          ? 'Bitte pausiere zuerst deine Arena-Teilnahme und beende alle eigenen Partien. '
          : 'Der Account kann noch nicht gelöscht werden: Deine Teilnahme an einem laufenden Turnier ist noch nicht abgeschlossen. Die Sperre gilt auch zwischen den Runden und bei einem Freilos. ')
          + 'Betroffen: ' + names + (blocked.length > 3 ? ' und weitere Turniere.' : '.')};
    }
    return {ok:true};
  } catch (_) {
    // Bei Datenbankfehlern niemals aus einer fehlenden Antwort ableiten,
    // dass keine laufende Turnierteilnahme existiert.
    return {ok:false, status:503, code:'TOURNAMENT_CHECK_FAILED',
      message:'Die Turnierteilnahmen konnten nicht sicher geprüft werden. Der Account wurde nicht gelöscht. Bitte versuche es später erneut.'};
  }
}

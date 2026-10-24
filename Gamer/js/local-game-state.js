'use strict';

/* Eigenständiger Zustand für zwei Personen an einem Gerät. Die vorhandene
   Game-Regelprüfung bleibt gemeinsam; Online-Partien werden nicht verändert. */
class LocalChessGame {
  constructor(options = {}, now = () => Date.now()) {
    this.now = now;
    this.options = {
      baseMs: Math.max(0, Number(options.baseMs) || 0),
      incrementMs: Math.max(0, Number(options.incrementMs) || 0),
      manualClock: !!options.manualClock
    };
    if (!this.options.baseMs) this.options.manualClock = false;
    this.game = new Game({variant: GAME_VARIANT_STANDARD});
    this.clocks = {w: this.options.baseMs, b: this.options.baseMs};
    this.runningSide = null;
    this.pendingClock = null;
    this.paused = false;
    this.started = false;
    this.result = null;
    this.history = [];
    this.positions = [this.game.repetitionKey()];
    this.lastTick = this.now();
  }
  settle(at = this.now()) {
    const elapsed = Math.max(0, at - this.lastTick);
    this.lastTick = at;
    if (!this.runningSide || this.paused || this.result || !this.options.baseMs) return;
    const side = this.runningSide;
    this.clocks[side] = Math.max(0, this.clocks[side] - elapsed);
    if (this.clocks[side] === 0) {
      const winner = opposite(side);
      const winnerHasPiece = this.game.board.some(row => row.some(piece =>
        pieceColor(piece) === winner && piece.toLowerCase() !== 'k'));
      this.finish(winnerHasPiece && !this.game.hasInsufficientMaterial()
        ? {type: 'timeout', winner} : {type: 'timeout_draw'});
    }
  }
  canMove() { return !this.result && !this.paused && !this.pendingClock; }
  move(from, to, promotion = null) {
    this.settle();
    if (!this.canMove()) return {ok: false};
    const found = findMatchingLegalMove(this.game.legalMoves(), {from, to});
    if (!found) return {ok: false};
    const pawn = this.game.at(from[0], from[1]).toLowerCase() === 'p';
    if (pawn && (to[1] === 0 || to[1] === 7) && !['Q', 'R', 'B', 'N'].includes(promotion)) {
      return {ok: false, promotion: true};
    }
    const before = this.game.clone();
    const snapshot = {
      game: before, clocks: {...this.clocks}, runningSide: this.runningSide,
      pendingClock: this.pendingClock, started: this.started
    };
    const move = {from: found.from.slice(), to: found.to.slice(), meta: {...found.meta}, promotion};
    Object.assign(move, this.game.makeMove(move, false));
    move.san = moveToSan(before, move, this.game);
    this.history.push({snapshot, move});
    this.positions.push(this.game.repetitionKey());
    const repetitions = this.positions.filter(key => key === this.positions[this.positions.length - 1]).length;
    const result = this.game.gameOver(repetitions);
    this.started = true;
    if (result) {
      this.finish(result);
    } else if (this.options.baseMs) {
      if (this.options.manualClock) {
        this.pendingClock = before.turn;
        this.runningSide = before.turn;
      } else {
        this.clocks[before.turn] += this.options.incrementMs;
        this.runningSide = this.game.turn;
      }
    }
    this.lastTick = this.now();
    return {ok: true, move};
  }
  pressClock(side) {
    this.settle();
    if (this.result || this.paused || !this.options.manualClock || this.pendingClock !== side) return false;
    this.clocks[side] += this.options.incrementMs;
    this.pendingClock = null;
    this.runningSide = this.game.turn;
    return true;
  }
  togglePause() {
    this.settle();
    if (this.result || !this.options.baseMs || !this.started) return false;
    this.paused = !this.paused;
    return true;
  }
  undo() {
    this.settle();
    const entry = this.history.pop();
    if (!entry) return false;
    const wasPaused = this.paused;
    Object.assign(this, entry.snapshot);
    this.clocks = {...entry.snapshot.clocks};
    this.game = entry.snapshot.game.clone();
    this.positions.pop();
    this.result = null;
    this.paused = wasPaused && this.started;
    this.lastTick = this.now();
    return true;
  }
  finish(result) {
    this.result = result;
    this.runningSide = null;
    this.pendingClock = null;
    this.paused = false;
  }
  resign(side) {
    this.settle();
    if (!this.result && (side === 'w' || side === 'b')) this.finish({type: 'resignation', winner: opposite(side)});
  }
  agreeDraw() {
    this.settle();
    if (!this.result) this.finish({type: 'agreement'});
  }
}

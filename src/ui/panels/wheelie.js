// Wheelie panel - thin DOM wrapper around the canvas minigame.

import { state } from '../../core/state.js';
import { attach, startRun, isRunning, phase, RUN_SECONDS, gradeFor, payoutFor, S_SCORE } from '../../minigame/wheelie.js';
import { wheelieMult } from '../../systems/economy.js';
import { fmtMoney, fmtNum, fmtMult } from '../../core/format.js';
import { unlockAudio } from '../../core/audio.js';

let renderedRunning = false;

export default {
  id: 'wheelie',
  label: 'Wheelie',
  icon: 'wheelie',
  visible: () => state.wheelie.unlocked,

  // Never blow away a canvas mid-run - but allow the one render that swaps the
  // button state when a run starts or finishes.
  holdRender: () => isRunning() && renderedRunning,

  render() {
    const running = isRunning();
    renderedRunning = running;
    const w = state.wheelie;
    const best = gradeFor(w.best);
    return `
    <div class="panel-head">
      <div>
        <h2>Wheelie mode</h2>
        <p class="muted">${RUN_SECONDS} seconds on the treadmill. Hold for throttle, ride the green arc, chase the gold band.</p>
      </div>
      <div class="stat-pill">Payout ${fmtMult(wheelieMult())}</div>
    </div>

    <div class="wheelie-wrap">
      <canvas id="wheelie-canvas" class="wheelie-canvas" width="900" height="460"></canvas>
    </div>

    <div class="wheelie-bar">
      <div class="wheelie-stats">
        <div class="stat"><b>${w.best ? `${fmtNum(w.best, { int: true })} <span class="grade-chip grade-${best.id}">${best.id}</span>` : '-'}</b><i>best run</i></div>
        <div class="stat"><b>${fmtNum(w.runs, { int: true })}</b><i>attempts</i></div>
        <div class="stat"><b>${fmtNum(w.sRuns || 0, { int: true })}</b><i>S grades</i></div>
        <div class="stat"><b>${fmtMoney(w.earned)}</b><i>earned on the rig</i></div>
        <div class="stat"><b>${fmtMoney(payoutFor(S_SCORE))}</b><i>an S run pays</i></div>
      </div>
      <button class="btn btn-primary btn-big" data-act="wheelie:start" ${running ? 'disabled' : ''}>
        ${running ? 'Hold it...' : (phase() === 'idle' ? 'Start run' : 'Run it again')}
      </button>
    </div>
    <p class="muted small">The stake follows how much you are making elsewhere, so the rig is worth riding at any point in the game.
      Grades: S ${fmtNum(S_SCORE, { int: true })}+ &middot; A ${fmtNum(S_SCORE * 0.72, { int: true })} &middot; B ${fmtNum(S_SCORE * 0.48, { int: true })} &middot; C ${fmtNum(S_SCORE * 0.28, { int: true })}.</p>`;
  },

  mount() {
    const canvas = document.getElementById('wheelie-canvas');
    if (canvas) attach(canvas);
  },

  actions: {
    'wheelie:start': () => {
      if (isRunning()) return;
      unlockAudio();
      startRun();
    },
  },
};

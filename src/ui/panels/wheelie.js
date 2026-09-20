// Wheelie panel - thin DOM wrapper around the canvas minigame.

import { state } from '../../core/state.js';
import { attach, startRun, isRunning, phase, resetToIdle, RUN_SECONDS } from '../../minigame/wheelie.js';
import { wheelieMult, incomeScale } from '../../systems/economy.js';
import { fmtMoney, fmtNum, fmtMult } from '../../core/format.js';
import { play } from '../../core/audio.js';

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
    return `
    <div class="panel-head">
      <div>
        <h2>Wheelie mode</h2>
        <p class="muted">${RUN_SECONDS} seconds on the treadmill. Hold for throttle, live in the green band, grab the coins.</p>
      </div>
      <div class="stat-pill">Payout ${fmtMult(wheelieMult())}</div>
    </div>

    <div class="wheelie-wrap">
      <canvas id="wheelie-canvas" class="wheelie-canvas" width="900" height="420"></canvas>
    </div>

    <div class="wheelie-bar">
      <div class="wheelie-stats">
        <div class="stat"><b>${fmtNum(state.wheelie.best, { int: true })}</b><i>best run</i></div>
        <div class="stat"><b>${fmtNum(state.wheelie.runs, { int: true })}</b><i>attempts</i></div>
        <div class="stat"><b>${fmtMoney(state.wheelie.earned)}</b><i>earned on the rig</i></div>
        <div class="stat"><b>${fmtMoney(incomeScale())}</b><i>current stake</i></div>
      </div>
      <button class="btn btn-primary btn-big" data-act="wheelie:start" ${running ? 'disabled' : ''}>
        ${running ? 'Hold it...' : (phase() === 'idle' ? 'Start run' : 'Run it again')}
      </button>
    </div>
    <p class="muted small">Payout scales with how much money you are making elsewhere, so the rig is worth riding at any point in the game.</p>`;
  },

  mount() {
    const canvas = document.getElementById('wheelie-canvas');
    if (canvas) attach(canvas);
  },

  actions: {
    'wheelie:start': () => {
      if (isRunning()) return;
      resetToIdle();
      startRun();
      play('clickBig');
    },
  },
};

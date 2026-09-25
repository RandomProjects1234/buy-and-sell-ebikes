// Wheelie panel - thin DOM wrapper around the canvas minigame.

import { state } from '../../core/state.js';
import {
  attach, startRun, isRunning, phase, refit, RUN_SECONDS, gradeFor, payoutFor, S_SCORE,
} from '../../minigame/wheelie.js';
import { wheelieMult } from '../../systems/economy.js';
import { fmtMoney, fmtNum, fmtMult } from '../../core/format.js';
import { unlockAudio } from '../../core/audio.js';
import { icon } from '../icons.js';

let renderedRunning = false;

// --- full screen ---------------------------------------------------------------
// The real Fullscreen API where the browser has it; iPhone Safari does not
// for anything but video, so there the wrap is pinned over the whole page
// instead ("pseudo" full screen). Either way the wrap must not be re-rendered
// while it is full screen - replacing the element would drop out of it.

let pseudoFull = false;

function wrapEl() { return document.getElementById('wheelie-wrap'); }

export function isFull() {
  const wrap = wrapEl();
  return !!wrap && (document.fullscreenElement === wrap || pseudoFull);
}

function syncFullUI() {
  const wrap = wrapEl();
  if (!wrap) return;
  const full = isFull();
  wrap.classList.toggle('is-full', pseudoFull);
  document.documentElement.classList.toggle('wheelie-pseudo-full', pseudoFull);
  const btn = wrap.querySelector('.wheelie-fs');
  if (btn) {
    btn.innerHTML = icon(full ? 'shrink' : 'expand');
    btn.title = full ? 'Exit full screen (F or Esc)' : 'Full screen (F)';
  }
  requestAnimationFrame(refit);
}

async function enterFull() {
  const wrap = wrapEl();
  if (!wrap) return;
  if (wrap.requestFullscreen) {
    // Some embedded browsers neither grant nor refuse - give it a second,
    // then fall back to pinning the wrap over the page.
    const granted = await Promise.race([
      wrap.requestFullscreen({ navigationUI: 'hide' }).then(() => true, () => false),
      new Promise((resolve) => { setTimeout(() => resolve(false), 1000); }),
    ]);
    if (granted && document.fullscreenElement === wrap) return;
  }
  pseudoFull = true;
  syncFullUI();
}

async function exitFull() {
  if (pseudoFull) {
    pseudoFull = false;
    syncFullUI();
    return;
  }
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { /* already out */ }
  }
}

function toggleFull() {
  if (isFull()) exitFull();
  else enterFull();
}

document.addEventListener('fullscreenchange', syncFullUI);

window.addEventListener('keydown', (ev) => {
  const wrap = wrapEl();
  if (!wrap || !wrap.offsetParent && !isFull()) return;
  const a = document.activeElement;
  if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && a.type !== 'range'))) return;
  if (ev.code === 'KeyF' && !ev.repeat && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    ev.preventDefault();
    toggleFull();
  } else if (ev.code === 'Escape' && pseudoFull) {
    exitFull();
  }
});

export default {
  id: 'wheelie',
  label: 'Wheelie',
  icon: 'wheelie',
  visible: () => state.wheelie.unlocked,

  // Never blow away a canvas mid-run - but allow the one render that swaps the
  // button state when a run starts or finishes. Never while full screen.
  holdRender: () => isFull() || (isRunning() && renderedRunning),

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

    <div class="wheelie-wrap" id="wheelie-wrap">
      <canvas id="wheelie-canvas" class="wheelie-canvas" width="900" height="460"></canvas>
      <button class="wheelie-fs" data-act="wheelie:fullscreen" title="Full screen (F)" aria-label="Toggle full screen">${icon('expand')}</button>
    </div>

    <div class="wheelie-bar">
      <div class="wheelie-stats">
        <div class="stat"><b>${w.best ? `${fmtNum(w.best, { int: true })} <span class="grade-chip grade-${best.id}">${best.id}</span>` : '-'}</b><i>best run</i></div>
        <div class="stat"><b>${fmtNum(w.runs, { int: true })}</b><i>attempts</i></div>
        <div class="stat"><b>${fmtNum(w.sRuns || 0, { int: true })}</b><i>S grades</i></div>
        <div class="stat"><b>${fmtMoney(w.earned)}</b><i>earned on the rig</i></div>
        <div class="stat"><b>${fmtMoney(payoutFor(S_SCORE))}</b><i>an S run pays</i></div>
      </div>
      <div class="wheelie-buttons">
        <button class="btn btn-big" data-act="wheelie:fullscreen">${icon('expand')} Full screen</button>
        <button class="btn btn-primary btn-big" data-act="wheelie:start" ${running ? 'disabled' : ''}>
          ${running ? 'Hold it...' : (phase() === 'idle' ? 'Start run' : 'Run it again')}
        </button>
      </div>
    </div>
    <p class="muted small">The stake follows how much you are making elsewhere, so the rig is worth riding at any point in the game.
      Grades: S ${fmtNum(S_SCORE, { int: true })}+ &middot; A ${fmtNum(S_SCORE * 0.72, { int: true })} &middot; B ${fmtNum(S_SCORE * 0.48, { int: true })} &middot; C ${fmtNum(S_SCORE * 0.28, { int: true })}.</p>`;
  },

  mount() {
    const canvas = document.getElementById('wheelie-canvas');
    if (canvas) attach(canvas);
    if (pseudoFull) syncFullUI();
  },

  actions: {
    'wheelie:fullscreen': () => { unlockAudio(); toggleFull(); },

    'wheelie:start': () => {
      if (isRunning()) return;
      unlockAudio();
      startRun();
    },
  },
};

// Boot + the master tick. Everything else is a module.

import { state } from './core/state.js';
import { load, save, startAutosave } from './core/save.js';
import { startClock, onTick, onFrame } from './core/clock.js';
import { registerActions } from './ui/dom.js';
import { initUI, renderFrame, currentPanel, offlineModal, markDirty } from './ui/render.js';
import { initDebug } from './core/debug.js';
import { sampleIncome, seedIncomeRate } from './systems/economy.js';
import { tickAutomation, runOffline } from './systems/automation.js';
import { tickDemand } from './systems/market.js';
import { checkUnlocks, checkFragments } from './systems/unlocks.js';
import { tickBuffs } from './systems/buffs.js';
import { checkAchievements } from './systems/achievements.js';
import { tickNet } from './net/room.js';
import { update as updateWheelie, draw as drawWheelie } from './minigame/wheelie.js';

function boot() {
  const { loaded, offlineMs } = load();

  initUI(document.getElementById('app'));
  initDebug(registerActions);

  if (loaded) {
    seedIncomeRate(state.stats.autoRate || 0);
    const report = runOffline(offlineMs);
    if (report && (report.earned > 0 || report.builds > 0 || report.crates > 0)) {
      offlineModal(report);
    }
  }

  onTick((dt) => {
    if (dt <= 0) return;
    state.stats.playTime += dt;
    tickAutomation(dt);
    tickDemand(dt);
    tickBuffs(dt);
    updateWheelie(dt);
    sampleIncome(dt);
    checkUnlocks();
    checkFragments();
    checkAchievements();
    tickNet(dt);
    state.time.lastTick = Date.now();
  });

  onFrame((dt) => {
    const now = performance.now();
    renderFrame(dt, now);
    if (currentPanel() === 'wheelie') drawWheelie();
  });

  startClock({ hz: 20 });
  startAutosave();
  markDirty();

  // A save on the way out covers refreshes that skip beforeunload.
  window.addEventListener('pagehide', () => save());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

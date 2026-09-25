// Boot + the master tick. Everything else is a module.

import { state } from './core/state.js';
import { load, save, startAutosave } from './core/save.js';
import { startClock, onTick, onFrame } from './core/clock.js';
import { registerActions } from './ui/dom.js';
import {
  initUI, renderFrame, currentPanel, offlineModal, markDirty, setPanel,
  startTutorial, shouldAutoStart,
} from './ui/render.js';
import { initDebug } from './core/debug.js';
import { sampleIncome } from './systems/economy.js';
import { tickAutomation, runOffline } from './systems/automation.js';
import { tickDemand } from './systems/market.js';
import { checkUnlocks } from './systems/unlocks.js';
import { tickNet, returnEscrow, joinRoom } from './net/room.js';
import { update as updateWheelie, draw as drawWheelie } from './minigame/wheelie.js';

function boot() {
  const { loaded, offlineMs } = load();

  initUI(document.getElementById('app'));
  initDebug(registerActions);

  if (loaded) {
    // Market listings live in escrow; a closed tab is out of the room, so
    // anything still listed comes back to the garage and bin.
    returnEscrow();
    const report = runOffline(offlineMs);
    if (report && report.parts > 0) offlineModal(report);
  }

  // An invite link (?room=CODE) drops you straight into the room.
  const invite = new URLSearchParams(location.search).get('room');
  if (invite) {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url.href);
    setPanel('network');
    joinRoom(invite);
  }

  onTick((dt) => {
    if (dt <= 0) return;
    state.stats.playTime += dt;
    tickAutomation(dt);
    tickDemand(dt);
    updateWheelie(dt);
    sampleIncome(dt);
    checkUnlocks();
    tickNet(dt);
    state.time.lastTick = Date.now();
  });

  onFrame((dt) => {
    const now = performance.now();
    renderFrame(dt, now);
    if (currentPanel() === 'wheelie') drawWheelie();
  });

  // A brand new shop gets shown around before anything else happens.
  if (shouldAutoStart()) startTutorial();

  startClock({ hz: 20 });
  startAutosave();
  markDirty();

  // A save on the way out covers refreshes that skip beforeunload.
  window.addEventListener('pagehide', () => save());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

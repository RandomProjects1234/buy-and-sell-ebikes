// Cheat panel for testing progression. Off unless ?debug is in the URL or you
// press Ctrl+Shift+D. Also exposes window.__BSE for poking at from the console.

import { state, addPart, setState, defaultState } from './state.js';
import { partsOfTier, TIERS } from '../data/parts.js';
import { BLUEPRINTS } from '../data/blueprints.js';
import { addMoney } from '../systems/economy.js';
import { tickAutomation } from '../systems/automation.js';
import { checkUnlocks } from '../systems/unlocks.js';
import { fmtMoney } from './format.js';
import { save } from './save.js';
import { emit, EVENTS } from './events.js';
import * as wheelie from '../minigame/wheelie.js';

let host = null;
let enabled = false;

const GRANTS = [1e3, 1e5, 1e7, 1e9, 1e12, 1e15];

function html() {
  return `
  <div class="debug-head">DEBUG <button class="btn btn-tiny" data-act="dbg:close">x</button></div>
  <div class="debug-row">${GRANTS.map((n) => `<button class="btn btn-tiny" data-act="dbg:money" data-n="${n}">+${fmtMoney(n)}</button>`).join('')}</div>
  <div class="debug-row">${TIERS.map((t) => `<button class="btn btn-tiny" data-act="dbg:parts" data-tier="${t.id}">+40 ${t.name}</button>`).join('')}</div>
  <div class="debug-row">
    <button class="btn btn-tiny" data-act="dbg:unlockall">Unlock all blueprints</button>
  </div>
  <div class="debug-row">
    <button class="btn btn-tiny" data-act="dbg:ff" data-s="60">FF 1 min</button>
    <button class="btn btn-tiny" data-act="dbg:ff" data-s="3600">FF 1 hour</button>
    <button class="btn btn-tiny" data-act="dbg:reset">Hard reset</button>
  </div>`;
}

const actions = {
  'dbg:money': (ds) => { addMoney(Number(ds.n), 'debug'); checkUnlocks(); },
  'dbg:parts': (ds) => {
    const pool = partsOfTier(Number(ds.tier));
    for (const id of pool) addPart(id, 40);
  },
  'dbg:unlockall': () => {
    for (const bp of BLUEPRINTS) state.unlocked[bp.id] = true;
    state.wheelie.unlocked = true;
    emit(EVENTS.TOAST, { text: 'Everything unlocked.', kind: 'info' });
  },
  'dbg:ff': (ds) => {
    const seconds = Number(ds.s);
    const step = Math.max(1, seconds / 600);
    for (let t = 0; t < seconds; t += step) tickAutomation(step);
    emit(EVENTS.TOAST, { text: `Fast-forwarded ${seconds}s of automation.`, kind: 'info' });
  },
  'dbg:reset': () => { setState(defaultState()); save(); location.reload(); },
  'dbg:close': () => toggle(false),
};

export function debugActions() { return actions; }

export function toggle(on) {
  enabled = on == null ? !enabled : on;
  if (!host) return;
  host.classList.toggle('open', enabled);
  if (enabled) host.innerHTML = html();
  else host.innerHTML = '';
}

export function initDebug(registerActions) {
  host = document.createElement('div');
  host.className = 'debug-panel';
  document.body.appendChild(host);
  registerActions(actions);

  window.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey && ev.shiftKey && (ev.key === 'D' || ev.key === 'd')) {
      ev.preventDefault();
      toggle();
    }
  });

  const params = new URLSearchParams(location.search);
  if (params.has('debug')) toggle(true);

  window.__BSE = {
    // A getter, not a snapshot: an IPO swaps the whole state object out, and a
    // captured reference would quietly go stale.
    get state() { return state; },
    get money() { return state.money; },
    give: (n) => addMoney(n, 'debug'),
    parts: (tier, n = 20) => partsOfTier(tier).forEach((id) => addPart(id, n)),
    unlockAll: actions['dbg:unlockall'],
    ff: (s) => actions['dbg:ff']({ s }),
    wheelie,
    save,
  };
}

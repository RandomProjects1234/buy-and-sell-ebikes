// ---------------------------------------------------------------------------
// SHELL RENDERING
// ---------------------------------------------------------------------------
// The clicker on the left, the working area on the right. Panels hand back HTML
// strings; this module decides when it is safe to swap them in (never mid-click,
// never while a select or a text box has focus).

import { state, totalParts } from '../core/state.js';
import { clickValue, incomePerSec, showroomBonus, addMoney } from '../systems/economy.js';
import { registerActions, initActions, esc, el, isPointerDown, isEditing, eventPoint } from './dom.js';
import { fmtMoney, fmtNum, fmtMult, fmtRate, fmtTime } from '../core/format.js';
import { bikeSVG } from './bikeArt.js';
import { icon } from './icons.js';
import { floatText, burst, toast, bigWin, pop, initFx, updateShake } from './fx.js';
import { play, unlockAudio, setMuted } from '../core/audio.js';
import { on, EVENTS } from '../core/events.js';
import { registerLogoClick, SECRET_INFO } from '../systems/unlocks.js';
import { save, exportSave, importSave, wipeSave } from '../core/save.js';
import {
  initTutorial, renderTutorial, tutorialActions, startTutorial,
  tutorialActive, shouldAutoStart,
} from './tutorial.js';

import cratesPanel from './panels/crates.js';
import workbenchPanel from './panels/workbench.js';
import garagePanel from './panels/garage.js';
import upgradesPanel from './panels/upgrades.js';
import staffPanel from './panels/staff.js';
import farmsPanel from './panels/farms.js';
import wheeliePanel from './panels/wheelie.js';
import networkPanel from './panels/network.js';
import indexPanel from './panels/index.js';

const PANELS = [
  cratesPanel, workbenchPanel, garagePanel, upgradesPanel,
  staffPanel, farmsPanel, wheeliePanel, indexPanel, networkPanel,
];

// Shop ranks, Cookie Clicker style: a title that quietly escalates.
const RANKS = [
  [0, 'Bloke With A Shed'],
  [1e3, 'Curbside Flipper'],
  [2e4, 'Corner Shop'],
  [3e5, 'Proper Dealership'],
  [5e6, 'Regional Distributor'],
  [1e8, 'Brand Name'],
  [4e9, 'Industry Player'],
  [2e11, 'Market Leader'],
  [1e13, 'Monopoly, Basically'],
  [1e15, 'Nation State With Bikes'],
  [1e18, 'Physics Advisory Board'],
  [1e21, 'Kirkin Tier'],
];

let activePanel = 'crates';
let panelDirty = true;
let tabsDirty = true;
let lastShowroomKey = null;
let lastPanelHTML = '';
let refs = {};
let shownPanel = null;            // id of the panel currently in the DOM
const scrollMemory = new Map();   // panel id -> Map(scroll key -> [top, left])

export function markDirty() { panelDirty = true; }
export function markTabsDirty() { tabsDirty = true; }

function rankFor(lifetime) {
  let name = RANKS[0][1];
  for (const [at, label] of RANKS) if (lifetime >= at) name = label;
  return name;
}

// --- shell ------------------------------------------------------------------

function shellHTML() {
  return `
  <header class="topbar">
    <button class="brand" data-act="shell:logo" title="It is just a sign. Probably.">
      <span class="brand-mark">${icon('bolt')}</span>
      <span class="brand-text"><b>BUY &amp; SELL</b><i>E-BIKES</i></span>
    </button>
    <div class="hud-pills" id="hud-pills"></div>
    <div class="topbar-buttons">
      <button class="icon-btn" data-act="shell:mute" id="mute-btn" title="Mute">${icon('sound')}</button>
      <button class="icon-btn" data-act="shell:settings" title="Settings">${icon('gear')}</button>
    </div>
  </header>

  <main class="layout">
    <section class="stage">
      <div class="bank">
        <div class="bank-money" id="hud-money">$0</div>
        <div class="bank-rate" id="hud-rate">$0/s</div>
      </div>
      <div class="stage-art" id="stage-art"></div>
      <button class="stage-click" data-act="shell:click" id="stage-click" aria-label="Test ride the bike for money"></button>
      <div class="stage-info" id="stage-info"></div>
      <div class="stage-hint" id="stage-hint"></div>
      <div class="quest" id="quest"></div>
    </section>

    <section class="workspace">
      <nav class="tabs" id="tabs"></nav>
      <div class="panel" id="panel"></div>
    </section>
  </main>

  <div class="fx-layer" id="fx-layer"></div>
  <div class="toast-layer" id="toast-layer"></div>
  <div class="modal-root" id="modal-root"></div>`;
}

// --- scroll memory -----------------------------------------------------------
// Panels are handed to the browser as one HTML string, so a swap replaces every
// node underneath - including any list the player had scrolled, which would
// silently snap back to the top. Snapshot the scroll offsets before the swap
// and re-apply them to the matching nodes afterwards.

function scrollKey(node, counts) {
  const cls = (node.getAttribute && node.getAttribute('class')) || '';
  const base = `${node.tagName}#${node.id}.${cls}`;
  const n = counts.get(base) || 0;
  counts.set(base, n + 1);
  return `${base}~${n}`;
}

function captureScroll(root) {
  const positions = new Map();
  const counts = new Map();
  for (const node of root.querySelectorAll('*')) {
    const key = scrollKey(node, counts);
    if (node.scrollTop || node.scrollLeft) positions.set(key, [node.scrollTop, node.scrollLeft]);
  }
  return positions;
}

function restoreScroll(root, positions) {
  if (!positions || !positions.size) return;
  const counts = new Map();
  for (const node of root.querySelectorAll('*')) {
    const pos = positions.get(scrollKey(node, counts));
    if (pos) { node.scrollTop = pos[0]; node.scrollLeft = pos[1]; }
  }
}

// --- wheel handling ----------------------------------------------------------
// Two dead zones made the wheel feel broken:
//  - the bike's click target is a transparent <button> stretched over the art,
//    and a button can swallow wheel events instead of letting them reach the
//    page - so scrolling with the cursor over the bike did nothing. Hand the
//    wheel to the window ourselves (preventDefault first, so it never doubles).
//  - the tab strip scrolls sideways but hides its scrollbar, so with enough
//    tabs unlocked the last ones cannot be reached at all. A plain vertical
//    wheel over it should move the strip.

function initWheelHandlers() {
  refs.stageClick.addEventListener('wheel', (ev) => {
    const unit = ev.deltaMode === 1 ? 16 : (ev.deltaMode === 2 ? window.innerHeight : 1);
    ev.preventDefault();
    window.scrollBy(0, ev.deltaY * unit);
  }, { passive: false });

  refs.tabs.addEventListener('wheel', (ev) => {
    if (refs.tabs.scrollWidth <= refs.tabs.clientWidth + 1) return;
    const unit = ev.deltaMode === 1 ? 16 : (ev.deltaMode === 2 ? window.innerWidth : 1);
    const dx = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
    if (!dx) return;
    const before = refs.tabs.scrollLeft;
    refs.tabs.scrollLeft = before + dx * unit;
    // Only swallow the event when the strip actually moved; at either end let
    // the page scroll normally.
    if (Math.abs(refs.tabs.scrollLeft - before) > 0.5) ev.preventDefault();
  }, { passive: false });
}

function renderTabs() {
  const list = PANELS.filter((p) => p.visible());
  if (!list.some((p) => p.id === activePanel)) activePanel = list[0].id;
  const keepLeft = refs.tabs.scrollLeft;
  refs.tabs.innerHTML = list.map((p) => {
    const badge = p.badge ? p.badge() : null;
    return `<button class="tab${p.id === activePanel ? ' is-active' : ''}" data-act="shell:tab" data-id="${p.id}">
        <span class="tab-icon">${icon(p.icon)}</span>
        <span class="tab-label">${esc(p.label)}</span>
        ${badge ? `<span class="tab-badge">${esc(badge)}</span>` : ''}
      </button>`;
  }).join('');
  if (keepLeft) refs.tabs.scrollLeft = keepLeft;
  tabsDirty = false;
}

function renderPanel() {
  const panel = PANELS.find((p) => p.id === activePanel);
  if (!panel) return;
  panelDirty = false;
  if (panel.holdRender && panel.holdRender()) return;

  // Only swap the DOM when the markup actually changed. Without this the
  // half-second refresh would restart every reveal animation on the page.
  const html = panel.render();
  if (html === lastPanelHTML) return;
  lastPanelHTML = html;

  // Remember where the player was before the swap, then put the new scrollable
  // nodes back where the old ones were - otherwise the wheel scrolls a list and
  // it snaps back to the top on the next refresh.
  if (shownPanel) scrollMemory.set(shownPanel, captureScroll(refs.panel));
  refs.panel.innerHTML = html;
  restoreScroll(refs.panel, scrollMemory.get(panel.id));
  shownPanel = panel.id;
  if (panel.mount) panel.mount();
}

function showroomKey() {
  const b = state.showroom;
  return b ? `${b.bp}:${b.tier}:${b.kind}:${Math.round(b.value)}` : 'none';
}

/**
 * Write to a node only when the markup actually changed.
 *
 * This matters more than it looks: the stage used to rebuild its innerHTML on
 * every single frame, which throws away and recreates the nodes under the
 * cursor sixty times a second. Any wheel event that landed on a node in the
 * instant it was replaced was simply dropped, so scrolling over the bike felt
 * broken - and text under there could never be selected either.
 */
function setHTML(node, html) {
  if (node.__last === html) return;
  node.__last = html;
  node.innerHTML = html;
}

function setText(node, text) {
  if (node.__last === text) return;
  node.__last = text;
  node.textContent = text;
}

function renderStage() {
  const bike = state.showroom;
  const key = showroomKey();
  if (key !== lastShowroomKey) {
    refs.stageArt.innerHTML = bikeSVG(bike);
    lastShowroomKey = key;
  }
  const cv = clickValue();
  setHTML(refs.stageInfo, bike
    ? `<h1>${esc(bike.name)}</h1>
       <div class="stage-specs">
         <span><b>${fmtNum(bike.speed)}</b> mph</span>
         <span><b>${bike.range >= 999999 ? 'yes' : fmtNum(bike.range)}</b> mi</span>
         <span><b>${fmtNum(bike.accel)}s</b> 0-30</span>
         <span class="hot"><b>${fmtMult(showroomBonus())}</b> click</span>
       </div>`
    : `<h1>Empty stand</h1><div class="stage-specs"><span>Put a build in the window</span></div>`);
  setHTML(refs.stageHint,
    `<b>${fmtMoney(cv)}</b> per test ride &middot; <span class="rank">${rankFor(state.lifetime)}</span>`);
}

// --- the nudge for new players ----------------------------------------------

function questLine() {
  const s = state;
  if (s.clicks < 10) return 'Click the bike. Every test ride is money.';
  if (!s.stats.cratesOpened) return 'Buy a <b>Scrap Crate</b> in the Crates tab - that is where parts come from.';
  if (!s.stats.builds) return 'Open a few crates, then build a <b>Scoot Lite</b> at the Workbench.';
  if (!s.stats.sales) return 'Your build is in the <b>Garage</b>. Sell it.';
  if (!Object.keys(s.workers).length && s.lifetime >= 2500) return 'You can afford staff. Hire a <b>Crate Runner</b> in the Staff tab.';
  if (s.wheelie.unlocked && !s.wheelie.runs) return 'The treadmill out back is free. Try <b>Wheelie mode</b>.';
  if (!Object.keys(s.farms).length && s.lifetime >= 4000) return 'A <b>Scrap Yard</b> in Facilities makes parts while you do something else.';
  return '';
}

function renderQuest() {
  const line = tutorialActive() ? '' : questLine();
  setHTML(refs.quest, line ? `<span class="quest-dot"></span>${line}` : '');
  refs.quest.classList.toggle('is-on', !!line);
}

function renderHud() {
  setText(refs.money, fmtMoney(state.money));
  setText(refs.rate, fmtRate(incomePerSec()));
  setHTML(refs.pills, `
    <span class="pill" title="Parts in the bin">${fmtNum(totalParts(), { int: true })} parts</span>
    <span class="pill" title="Builds on the floor">${fmtNum(state.garage.length, { int: true })} builds</span>
    ${state.fragments ? `<span class="pill pill-secret" title="Kirkin schematic fragments">${state.fragments}/4 fragments</span>` : ''}`);
}

// --- modals -----------------------------------------------------------------

export function modal(html) {
  refs.modal.innerHTML = `<div class="modal-back" data-act="shell:closemodal">
      <div class="modal-card" data-stop="1">${html}</div>
    </div>`;
  refs.modal.classList.add('open');
}

export function closeModal() {
  refs.modal.classList.remove('open');
  refs.modal.innerHTML = '';
}

function settingsModal() {
  modal(`
    <h2>Settings</h2>
    <div class="settings-list">
      <button class="btn" data-act="shell:mute">${state.settings.muted ? 'Unmute' : 'Mute'} sound</button>
      <button class="btn" data-act="shell:motion">${state.settings.reduceMotion ? 'Enable' : 'Reduce'} motion</button>
      <button class="btn" data-act="shell:tour">Replay the tour</button>
      <button class="btn" data-act="shell:save">Save now</button>
      <button class="btn" data-act="shell:export">Export save</button>
      <button class="btn" data-act="shell:import">Import save</button>
      <button class="btn btn-danger" data-act="shell:wipe">Wipe everything</button>
    </div>
    <p class="muted small">Autosaves every 15 seconds and whenever you close the tab. Add
      <code>?debug</code> to the URL (or press Ctrl+Shift+D) for the cheat panel.</p>
    <div class="modal-actions"><button class="btn btn-primary" data-act="shell:closemodal">Done</button></div>`);
}

export function offlineModal(report) {
  modal(`
    <h2>While you were out</h2>
    <p class="muted">${fmtTime(report.seconds)} of night shift${report.capped ? ' (capped)' : ''}.</p>
    <div class="stat-grid">
      <div class="stat-row"><span>Earned</span><b>${fmtMoney(report.earned)}</b></div>
      <div class="stat-row"><span>Crates opened</span><b>${fmtNum(report.crates, { int: true })}</b></div>
      <div class="stat-row"><span>Builds finished</span><b>${fmtNum(report.builds, { int: true })}</b></div>
      <div class="stat-row"><span>Builds sold</span><b>${fmtNum(report.sales, { int: true })}</b></div>
    </div>
    <div class="modal-actions"><button class="btn btn-primary" data-act="shell:closemodal">Back to work</button></div>`);
}

// --- actions ----------------------------------------------------------------

const shellActions = {
  'shell:click': (ds, ev, target) => {
    unlockAudio();
    const amount = clickValue();
    addMoney(amount, 'click');
    state.clicks += 1;
    const { x, y } = eventPoint(ev, target);
    floatText(x, y - 10, `+${fmtMoney(amount)}`, 'money');
    play('click', { rate: 0.94 + Math.random() * 0.14 });
    refs.stageArt.classList.remove('kick');
    void refs.stageArt.offsetWidth;
    refs.stageArt.classList.add('kick');
    if (state.clicks % 25 === 0) {
      burst(x, y, { count: 10, colors: ['#ffd166', '#fff'], power: 0.7 });
      play('clickBig');
    }
    markDirty();
  },

  'shell:logo': (ds, ev, target) => {
    unlockAudio();
    const res = registerLogoClick();
    pop(target);
    play('tickUp', { rate: 1 + Math.min(0.8, (res.count || 0) / SECRET_INFO.LOGO_CLICKS_FOR_G2) });
    if (res.unlocked) markTabsDirty();
  },

  'shell:tab': (ds) => {
    activePanel = ds.id;
    tabsDirty = true;
    panelDirty = true;
    lastPanelHTML = '';
    play('drop');
  },

  'shell:mute': () => {
    setMuted(!state.settings.muted);
    refs.muteBtn.innerHTML = icon(state.settings.muted ? 'mute' : 'sound');
    if (!state.settings.muted) play('drop');
    if (refs.modal.classList.contains('open')) settingsModal();
  },

  'shell:motion': () => {
    state.settings.reduceMotion = !state.settings.reduceMotion;
    settingsModal();
  },

  'shell:tour': () => { closeModal(); startTutorial(); },

  'shell:settings': () => settingsModal(),
  'shell:closemodal': (ds, ev) => {
    if (ev && ev.target.closest('[data-stop]') && !ev.target.closest('[data-act="shell:closemodal"]')) return;
    closeModal();
  },

  'shell:save': () => { save({ quiet: false }); },

  'shell:export': () => {
    const text = exportSave();
    modal(`<h2>Export save</h2>
      <p class="muted">Copy this somewhere safe.</p>
      <textarea class="save-box" readonly>${esc(text)}</textarea>
      <div class="modal-actions">
        <button class="btn" data-act="shell:copy">Copy to clipboard</button>
        <button class="btn btn-primary" data-act="shell:closemodal">Done</button>
      </div>`);
  },

  'shell:copy': () => {
    const box = document.querySelector('.save-box');
    if (!box) return;
    box.select();
    navigator.clipboard?.writeText(box.value).then(
      () => toast('Save copied.', 'good'),
      () => toast('Could not copy - select it manually.', 'bad'),
    );
  },

  'shell:import': () => {
    modal(`<h2>Import save</h2>
      <p class="muted">Paste an exported save. This replaces everything you have now.</p>
      <textarea class="save-box" id="import-box" placeholder="paste here"></textarea>
      <div class="modal-actions">
        <button class="btn btn-danger" data-act="shell:doimport">Import</button>
        <button class="btn" data-act="shell:closemodal">Cancel</button>
      </div>`);
  },

  'shell:doimport': () => {
    const box = document.getElementById('import-box');
    if (!box || !importSave(box.value)) { toast('That save did not parse.', 'bad'); return; }
    closeModal();
    lastShowroomKey = null;
    markDirty();
    markTabsDirty();
    toast('Save imported.', 'good');
  },

  'shell:wipe': () => {
    modal(`<h2>Wipe everything?</h2>
      <p class="muted">Money, parts, builds, staff, upgrades, blueprints - the lot. There is no undo.</p>
      <div class="modal-actions">
        <button class="btn btn-danger" data-act="shell:dowipe">Yes, burn it down</button>
        <button class="btn btn-primary" data-act="shell:closemodal">Keep my shop</button>
      </div>`);
  },

  'shell:dowipe': () => {
    wipeSave();
    closeModal();
    lastShowroomKey = null;
    markDirty();
    markTabsDirty();
    toast('Fresh start. One bike, no money.', 'info');
  },
};

// --- boot -------------------------------------------------------------------

export function initUI(root) {
  root.innerHTML = shellHTML();
  refs = {
    money: el('hud-money'),
    rate: el('hud-rate'),
    pills: el('hud-pills'),
    tabs: el('tabs'),
    panel: el('panel'),
    stageArt: el('stage-art'),
    stageClick: el('stage-click'),
    stageInfo: el('stage-info'),
    stageHint: el('stage-hint'),
    quest: el('quest'),
    modal: el('modal-root'),
    muteBtn: el('mute-btn'),
  };

  initFx();
  initActions();
  initTutorial(el('fx-layer'), setPanel);
  registerActions(shellActions);
  registerActions(tutorialActions);
  for (const panel of PANELS) if (panel.actions) registerActions(panel.actions);
  initWheelHandlers();

  refs.muteBtn.innerHTML = icon(state.settings.muted ? 'mute' : 'sound');

  on(EVENTS.TOAST, ({ text, kind }) => toast(text, kind));
  on(EVENTS.BIG_WIN, (payload) => { bigWin(payload); markTabsDirty(); markDirty(); });
  on(EVENTS.BLUEPRINT_UNLOCKED, () => { markDirty(); markTabsDirty(); });
  on(EVENTS.CRATE_OPENED, markDirty);
  on(EVENTS.CRAFTED, () => { markDirty(); markTabsDirty(); });
  on(EVENTS.SOLD, () => { markDirty(); markTabsDirty(); });
  on(EVENTS.NET, () => { if (activePanel === 'network') markDirty(); markTabsDirty(); });
  on(EVENTS.WHEELIE_END, ({ payout }) => {
    markDirty();
    toast(`Wheelie run banked ${fmtMoney(payout)}.`, 'good');
  });
  renderTabs();
  renderPanel();
  renderStage();
  renderHud();
  renderQuest();
}

let sinceRefresh = 0;

/** Called every frame (or every worker tick when the tab is hidden). */
export function renderFrame(dt, now) {
  updateShake(now);
  renderHud();
  renderStage();
  renderQuest();
  renderTutorial();

  sinceRefresh += dt;
  if (sinceRefresh > 0.5) { panelDirty = true; sinceRefresh = 0; }
  const busy = isPointerDown() || isEditing();
  if (tabsDirty && !busy) renderTabs();
  if (panelDirty && !busy) renderPanel();
}

export function currentPanel() { return activePanel; }
export function setPanel(id) {
  if (id === activePanel) return;
  activePanel = id;
  tabsDirty = true;
  panelDirty = true;
  lastPanelHTML = '';
}

export { startTutorial, shouldAutoStart };

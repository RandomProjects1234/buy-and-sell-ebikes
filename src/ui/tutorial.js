// ---------------------------------------------------------------------------
// THE TOUR
// ---------------------------------------------------------------------------
// A spotlight walkthrough for a brand new shop. Most steps are not "press next"
// - they wait for the player to actually do the thing, because the loop only
// makes sense once you have felt one crate turn into one sale.
//
// The spotlight is a transparent hole with an enormous box-shadow around it.
// Shadows are not hit-testable, so the page underneath stays fully clickable
// and the tour never blocks the game it is explaining.

import { state, addPart } from '../core/state.js';
import { BP_BY_ID } from '../data/blueprints.js';
import { partsBySlotTier } from '../data/parts.js';
import { autoFill } from '../systems/crafting.js';
import { fmtMoney } from '../core/format.js';
import { esc } from './dom.js';
import { play } from '../core/audio.js';
import { burst, toast } from './fx.js';

// target: CSS selector of the thing to spotlight (null = centred card)
// panel:  tab to switch to before the step runs
// wait:   when present, the step completes itself once this returns true
// hint:   live progress line under the body text
export const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to the shop',
    body: `You own one squeaky <b>Hyper B</b> and no money. By the end of this you will
           be building bikes that break the sound barrier. It takes about a minute to
           learn the whole loop - let me show you round.`,
    next: 'Show me',
  },
  {
    id: 'click',
    target: '#stage-click',
    title: 'Test rides pay',
    body: `Click the bike. Every test ride puts money in the till, and the better the
           bike in your window, the more each ride is worth.`,
    hint: () => `${fmtMoney(state.money)} of $40 - keep clicking`,
    wait: () => state.money >= 40,
  },
  {
    id: 'bank',
    target: '.bank',
    title: 'That is your money',
    body: `The big number is your bank, and underneath it is how much you are earning
           per second without touching anything. Getting that second number up is the
           whole game.`,
    next: 'Got it',
  },
  {
    id: 'crate',
    target: '.crate-card',
    panel: 'crates',
    title: 'Buy a crate of junk',
    body: `Parts come in crates from a man called Big Dave. Each <b>Scrap Crate</b> is
           three random parts, no refunds. Open three - that is enough bits to put a
           scooter together.`,
    hint: () => `${state.stats.cratesOpened} of 3 crates opened`,
    wait: () => state.stats.cratesOpened >= 3,
  },
  {
    id: 'build',
    target: '.bench-detail',
    panel: 'bench',
    title: 'Build something out of it',
    body: `A <b>Scoot Lite</b> needs four parts, one per slot, and they are already
           fitted for you. Press <b>Build it</b>. If the button says something is
           missing, go back to Crates, click the bike for a few dollars and open
           another one.`,
    hint: () => `${state.stats.builds} builds finished`,
    wait: () => state.stats.builds >= 1,
  },
  {
    id: 'sell',
    target: '.build-list',
    panel: 'garage',
    title: 'Now flip it',
    body: `Your build is on the garage floor. Sell it. Scooters are cheap to make and
           sell for a silly margin - that is your money loop. E-bikes cost more but the
           one in your <b>showroom window</b> multiplies every click you make.`,
    hint: () => `${state.stats.sales} sold`,
    wait: () => state.stats.sales >= 1,
  },
  {
    id: 'upgrades',
    target: '.card-grid',
    panel: 'upgrades',
    title: 'This is where profit goes',
    body: `<b>Upgrades</b> are one-off permanent buys - worth more per click, worth more
           per sale, better crate luck. Grab them whenever you can afford one.`,
    next: 'Makes sense',
  },
  {
    id: 'staff',
    title: 'Then hire someone to do it',
    body: `Two more tabs appear as you earn. <b>Staff</b> each automate one link of the
           loop - buying crates, salvaging, building, selling - and they keep working
           while the tab is closed. <b>Facilities</b> print parts on their own. That is
           the idle half of the game, and it is where the real money ends up.`,
    next: 'Good',
  },
  {
    id: 'tabs',
    target: '.tabs',
    title: 'The rest of the shop',
    body: `<b>Wheelie</b> is a treadmill minigame that pays out based on how rich you
           already are. <b>Index</b> is the catalogue - every build, part and crate in
           the game, including the ones you have not found yet. <b>Network</b> puts you
           in a room with friends, with a live leaderboard and bike swapping.`,
    next: 'Nearly done',
  },
  {
    id: 'done',
    target: '#quest',
    title: 'You are on your own',
    body: `This line under the bike always tells you what to do next, so you will never
           be stuck. Go and sell some scooters.`,
    next: 'Let me at it',
    last: true,
  },
];

let active = false;
let index = 0;
let root = null;
let holeEl = null;
let cardEl = null;
let lastTargetKey = '';
let onPanelChange = null;

export function tutorialActive() { return active; }
export function tutorialStep() { return active ? STEPS[index] : null; }

export function initTutorial(fxRoot, panelSwitcher) {
  root = fxRoot;
  onPanelChange = panelSwitcher;
}

/** Should a brand new player get the tour automatically? */
export function shouldAutoStart() {
  return !state.tutorial.done && state.lifetime < 5 && state.stats.builds === 0;
}

export function startTutorial(from = 0) {
  if (!root) return;
  active = true;
  index = from;
  state.tutorial.done = false;
  mount();
  enterStep();
}

export function stopTutorial({ finished = false } = {}) {
  active = false;
  state.tutorial.done = true;
  state.tutorial.step = index;
  if (holeEl) { holeEl.remove(); holeEl = null; }
  if (cardEl) { cardEl.remove(); cardEl = null; }
  lastTargetKey = '';
  if (finished) {
    play('achieve');
    toast('Tour finished. The shop is yours.', 'good');
  }
}

function mount() {
  if (!holeEl) {
    holeEl = document.createElement('div');
    holeEl.className = 'tut-hole';
    root.appendChild(holeEl);
  }
  if (!cardEl) {
    cardEl = document.createElement('div');
    cardEl.className = 'tut-card';
    root.appendChild(cardEl);
  }
}

/**
 * The tour must not be able to dead-end. Three crates is normally plenty for a
 * Scoot Lite, but the drops are random - if a slot came up empty, Big Dave
 * throws in the missing part rather than leaving a new player stuck.
 */
function ensureBuildable() {
  const bp = BP_BY_ID.scoot_lite;
  if (autoFill(bp, 'cheap')) return;
  const given = [];
  for (const slot of Object.keys(bp.req)) {
    if (autoFill(bp, 'cheap')) break;
    const pool = partsBySlotTier(slot, 0);
    const owned = pool.some((id) => (state.parts[id] || 0) > 0);
    if (owned) continue;
    addPart(pool[0], 1);
    given.push(slot);
  }
  if (given.length) {
    toast(`Big Dave threw in a spare ${given.join(' and ')}. Do not mention it.`, 'good');
  }
}

function enterStep() {
  const step = STEPS[index];
  if (!step) { stopTutorial({ finished: true }); return; }
  if (step.id === 'build') ensureBuildable();
  if (step.panel && onPanelChange) onPanelChange(step.panel);
  lastTargetKey = '';
  play('drop');
  // Give the panel a frame to render before we try to scroll to the target.
  setTimeout(() => {
    const el = step.target && document.querySelector(step.target);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 80);
}

export function nextStep() {
  const step = STEPS[index];
  if (step && step.wait) {
    // Completing a "do the thing" step is worth a little noise.
    const el = step.target && document.querySelector(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, {
        count: 14, colors: ['#ffd166', '#fff'], power: 0.9,
      });
    }
    play('unlock');
  }
  index += 1;
  if (index >= STEPS.length) { stopTutorial({ finished: true }); return; }
  enterStep();
}

function cardHTML(step) {
  const n = index + 1;
  return `
    <div class="tut-top">
      <span class="tut-count">Step ${n} of ${STEPS.length}</span>
      <button class="tut-skip" data-act="tut:skip">Skip tour</button>
    </div>
    <h3>${esc(step.title)}</h3>
    <p>${step.body}</p>
    ${step.hint ? `<div class="tut-hint"><span class="tut-dot"></span>${esc(step.hint())}</div>` : ''}
    <div class="tut-bar"><i style="width:${(n / STEPS.length) * 100}%"></i></div>
    ${step.wait
    ? '<div class="tut-wait">Do that and the tour carries on by itself.</div>'
    : `<button class="btn btn-gold tut-next" data-act="tut:next">${esc(step.next || 'Next')}</button>`}`;
}

/** Called every frame: keeps the spotlight glued to a moving/rerendered target. */
export function renderTutorial() {
  if (!active) return;
  const step = STEPS[index];
  if (!step) { stopTutorial({ finished: true }); return; }

  if (step.wait && step.wait()) { nextStep(); return; }

  const el = step.target ? document.querySelector(step.target) : null;
  const r = el ? el.getBoundingClientRect() : null;
  const visible = r && r.width > 0 && r.height > 0;

  // --- spotlight
  holeEl.style.display = 'block';
  if (visible) {
    const pad = 8;
    holeEl.classList.remove('is-empty');
    holeEl.style.left = `${r.left - pad}px`;
    holeEl.style.top = `${r.top - pad}px`;
    holeEl.style.width = `${r.width + pad * 2}px`;
    holeEl.style.height = `${r.height + pad * 2}px`;
  } else {
    // No target: collapse the hole to a point in the middle so the surrounding
    // shadow simply dims the whole screen behind the card.
    holeEl.classList.add('is-empty');
    holeEl.style.left = '50%';
    holeEl.style.top = '50%';
    holeEl.style.width = '0px';
    holeEl.style.height = '0px';
  }

  // --- card, re-rendered only when its content would change
  const key = `${step.id}:${step.hint ? step.hint() : ''}`;
  if (key !== lastTargetKey) {
    lastTargetKey = key;
    cardEl.innerHTML = cardHTML(step);
  }

  const cw = cardEl.offsetWidth || 340;
  const ch = cardEl.offsetHeight || 200;
  const margin = 16;
  let left;
  let top;

  if (visible) {
    // Prefer the side with the most room, then clamp into the viewport.
    const spaceRight = window.innerWidth - r.right;
    const spaceLeft = r.left;
    if (spaceRight > cw + margin * 2) left = r.right + margin;
    else if (spaceLeft > cw + margin * 2) left = r.left - cw - margin;
    else left = Math.max(margin, Math.min(window.innerWidth - cw - margin, r.left));
    top = r.top + r.height / 2 - ch / 2;
  } else {
    left = window.innerWidth / 2 - cw / 2;
    top = window.innerHeight / 2 - ch / 2;
  }

  cardEl.style.left = `${Math.max(margin, Math.min(window.innerWidth - cw - margin, left))}px`;
  cardEl.style.top = `${Math.max(margin, Math.min(window.innerHeight - ch - margin, top))}px`;
  cardEl.classList.toggle('tut-centred', !visible);
}

export const tutorialActions = {
  'tut:next': () => nextStep(),
  'tut:skip': () => {
    stopTutorial();
    toast('Tour skipped. Replay it any time from settings.', 'info');
  },
};

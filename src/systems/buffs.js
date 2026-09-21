// ---------------------------------------------------------------------------
// THE GOLDEN SPANNER
// ---------------------------------------------------------------------------
// Cookie Clicker has the golden cookie; the shop has a gold-plated 15mm spanner
// that someone keeps leaving on the counter. It drifts across the screen every
// minute or two, sits there for a few seconds, and pays out if you catch it.

import { state } from '../core/state.js';
import { addMoney, incomePerSec, clickValue, crateCost } from './economy.js';
import { weightedPick, rand } from '../core/rng.js';
import { emit, EVENTS } from '../core/events.js';
import { fmtMoney } from '../core/format.js';

const FIRST_SPAWN = 55;        // seconds into a session before the first one
const MIN_GAP = 70;
const MAX_GAP = 170;
const LIFETIME = 14;           // how long it stays on screen

export const BUFF_TYPES = [
  {
    id: 'frenzy', name: 'FRENZY', weight: 26, duration: 45,
    color: '#ffd166', incomeMult: 7,
    desc: 'Everything sells for 7x. The whole street wants a bike.',
  },
  {
    id: 'click_frenzy', name: 'CLICK FRENZY', weight: 22, duration: 13,
    color: '#8ef6ff', clickMult: 77,
    desc: '77x per test ride for thirteen seconds. Go.',
  },
  {
    id: 'windfall', name: 'WINDFALL', weight: 20, instant: 'cash',
    color: '#49c97a',
    desc: 'A collector turns up with a briefcase.',
  },
  {
    id: 'hot_streak', name: 'HOT STREAK', weight: 14, duration: 60,
    color: '#b06bff', luck: 0.45,
    desc: 'Every crate you open for a minute rolls better than it should.',
  },
  {
    id: 'free_pallet', name: 'FREE PALLET', weight: 10, instant: 'crates',
    color: '#ffab2e',
    desc: 'Kev owed you a favour. Twelve crates, on the house.',
  },
  {
    id: 'golden_hour', name: 'GOLDEN HOUR', weight: 8, duration: 120,
    color: '#ff9f43', incomeMult: 3, clickMult: 3,
    desc: 'Three times everything, for two solid minutes.',
  },
  // Not in the spawn pool - handed out when someone in your room catches one.
  {
    id: 'shared_spanner', name: 'SHARED SPANNER', weight: 0, duration: 25,
    color: '#8ef6ff', incomeMult: 2, clickMult: 2,
    desc: 'Someone else in the room caught one and cut you in.',
  },
];

const BUFF_BY_ID = Object.fromEntries(BUFF_TYPES.map((b) => [b.id, b]));
const SPAWNABLE = BUFF_TYPES.filter((b) => b.weight > 0);

let spanner = null;            // { x, y, until, drift }
let nextSpawn = FIRST_SPAWN;
let active = [];               // [{ id, until }]
let clock = 0;

export function currentSpanner() { return spanner; }
export function activeBuffs() {
  return active.map((a) => ({ ...BUFF_BY_ID[a.id], remaining: Math.max(0, a.until - clock) }));
}

function multFor(key) {
  let m = 1;
  for (const a of active) {
    const buff = BUFF_BY_ID[a.id];
    if (buff && buff[key]) m *= buff[key];
  }
  return m;
}

export function buffIncomeMult() { return multFor('incomeMult'); }
export function buffClickMult() { return multFor('clickMult'); }

export function buffLuck() {
  let l = 0;
  for (const a of active) l += BUFF_BY_ID[a.id]?.luck || 0;
  return l;
}

/** Called every tick. Handles spawning, drifting and expiry. */
export function tickBuffs(dt) {
  clock += dt;
  active = active.filter((a) => a.until > clock);

  if (spanner) {
    spanner.x += spanner.drift * dt;
    if (spanner.x < 0.04 || spanner.x > 0.9) spanner.drift *= -1;
    if (clock > spanner.until) {
      spanner = null;
      emit(EVENTS.DIRTY, { what: 'spanner' });
    }
    return;
  }

  // Nothing to catch until the shop is actually trading.
  if (state.lifetime < 400) return;
  nextSpawn -= dt;
  if (nextSpawn > 0) return;

  spanner = {
    x: 0.08 + rand() * 0.8,
    y: 0.12 + rand() * 0.7,
    until: clock + LIFETIME,
    drift: (rand() - 0.5) * 0.05,
  };
  nextSpawn = MIN_GAP + rand() * (MAX_GAP - MIN_GAP);
  emit(EVENTS.DIRTY, { what: 'spanner' });
}

function grantInstant(buff) {
  if (buff.instant === 'cash') {
    const amount = Math.max(state.money * 0.15, incomePerSec() * 120, clickValue() * 60, 250);
    addMoney(amount, 'buff');
    return `${fmtMoney(amount)} in cash, no questions asked.`;
  }
  if (buff.instant === 'crates') {
    // Imported lazily: crates.js pulls in economy, and economy pulls in this
    // module for the buff multipliers.
    return import('./crates.js').then(({ visibleCrates, openCrate }) => {
      const affordable = visibleCrates()
        .filter((c) => state.money >= crateCost(c) * 0.0001)
        .sort((a, b) => b.cost - a.cost)[0] || visibleCrates()[0];
      if (!affordable) return 'Nothing to open.';
      for (let i = 0; i < 12; i += 1) openCrate(affordable.id, { paid: false, silent: true });
      emit(EVENTS.TOAST, { text: `Twelve free ${affordable.name}s cracked open.`, kind: 'good' });
      return '';
    });
  }
  return '';
}

/** The player caught it. Roll a buff and apply it. */
export function grabSpanner() {
  if (!spanner) return null;
  const pos = { ...spanner };
  spanner = null;

  const buff = weightedPick(SPAWNABLE);
  state.stats.spanners = (state.stats.spanners || 0) + 1;

  let sub = buff.desc;
  if (buff.instant) {
    const res = grantInstant(buff);
    if (typeof res === 'string' && res) sub = res;
  } else {
    active.push({ id: buff.id, until: clock + buff.duration });
  }

  emit(EVENTS.BUFF, { buff, sub, pos });
  return { buff, sub, pos };
}

/** Start a buff by id - used by the room when another player catches one. */
export function addBuff(id, duration) {
  const buff = BUFF_BY_ID[id];
  if (!buff) return;
  active = active.filter((a) => a.id !== id);
  active.push({ id, until: clock + (duration || buff.duration || 20) });
  emit(EVENTS.DIRTY, { what: 'buff' });
}

/** Buffs are deliberately session-only: they never survive a reload. */
export function resetBuffs() {
  active = [];
  spanner = null;
  nextSpawn = FIRST_SPAWN;
}

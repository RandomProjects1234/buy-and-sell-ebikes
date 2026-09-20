// ---------------------------------------------------------------------------
// IPO - the prestige reset
// ---------------------------------------------------------------------------
// Sell the company, keep the reputation. Money, parts, builds, staff,
// facilities and upgrades all go; shares, perks, discovered blueprints and
// lifetime stats stay.

import { state, setState, defaultState, hasPerk } from '../core/state.js';
import { SHARE_DIVISOR, SHARE_BONUS, PERK_BY_ID, ROLES } from '../data/staff.js';
import { partsOfTier } from '../data/parts.js';
import { pick } from '../core/rng.js';
import { resetAccumulators } from './automation.js';
import { emit, EVENTS } from '../core/events.js';

export function pendingShares() {
  return Math.floor(Math.sqrt(Math.max(0, state.runEarned) / SHARE_DIVISOR));
}

/** Money still needed for the next whole share. */
export function nextShareAt() {
  const next = pendingShares() + 1;
  return next * next * SHARE_DIVISOR;
}

export function canPrestige() { return pendingShares() >= 1; }

export function shareMultiplier() {
  return 1 + SHARE_BONUS * (state.prestige.lifetimeShares || 0);
}

export function buyPerk(id) {
  const perk = PERK_BY_ID[id];
  if (!perk || state.prestige.perks[id]) return false;
  if (state.prestige.shares < perk.cost) return false;
  state.prestige.shares -= perk.cost;
  state.prestige.perks[id] = true;
  emit(EVENTS.TOAST, { text: `Perk unlocked: ${perk.name}`, kind: 'good' });
  return true;
}

export function doPrestige() {
  const gained = pendingShares();
  if (gained < 1) return null;

  const carry = {
    prestige: {
      shares: state.prestige.shares + gained,
      lifetimeShares: state.prestige.lifetimeShares + gained,
      runs: state.prestige.runs + 1,
      perks: { ...state.prestige.perks },
    },
    lifetime: state.lifetime,
    unlocked: { ...state.unlocked },
    secrets: { ...state.secrets },
    fragments: state.fragments,
    stats: { ...state.stats, autoRate: 0 },
    wheelie: { ...state.wheelie },
    settings: { ...state.settings },
    cfg: { ...state.cfg },
  };

  const keptShowroom = hasPerk('showroom_legacy') ? state.showroom : null;
  const keptParts = {};
  if (hasPerk('warehouse')) {
    for (const [id, n] of Object.entries(state.parts)) {
      const half = Math.floor(n / 2);
      if (half > 0) keptParts[id] = half;
    }
  }

  const next = defaultState();
  Object.assign(next, carry);
  next.time.started = state.time.started;
  next.parts = keptParts;
  next.showroom = keptShowroom || next.showroom;

  if (carry.prestige.perks.founders_kit) {
    next.money = 40000;
    for (let i = 0; i < 12; i += 1) {
      const id = pick(partsOfTier(1));
      next.parts[id] = (next.parts[id] || 0) + 1;
    }
  }
  if (carry.prestige.perks.retained_talent) {
    for (const role of ROLES) {
      if (carry.lifetime >= (role.unlock?.lifetime ?? 0)) next.workers[role.id] = 3;
    }
  }

  setState(next);
  resetAccumulators();

  emit(EVENTS.PRESTIGE, { shares: gained });
  emit(EVENTS.BIG_WIN, {
    text: 'IPO COMPLETE',
    sub: `The company is sold, the sign comes down, and ${gained} share${gained > 1 ? 's' : ''} of the new one are yours.`,
    kind: 'ipo',
  });
  return gained;
}

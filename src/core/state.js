// ---------------------------------------------------------------------------
// GAME STATE
// ---------------------------------------------------------------------------
// One plain, JSON-serialisable object. Nothing in here knows about the DOM, and
// every system mutates it through small helpers so saving is just JSON.stringify.

import { STARTER_BLUEPRINTS } from '../data/blueprints.js';

export const SAVE_VERSION = 1;

/**
 * The bike you already own when the game opens. It can be displaced from the
 * showroom by something better, but it is never for sale - it is the one that
 * got you here.
 */
export function starterBike() {
  return {
    uid: 'starter_hyper_b',
    bp: 'hyper_b',
    name: 'Hyper B',
    kind: 'bike',
    tier: 0,
    quality: 1,
    value: 260,
    speed: 20,
    range: 18,
    accel: 8.2,
    parts: {},
    starter: true,
    at: Date.now(),
  };
}

export function defaultState() {
  const now = Date.now();
  return {
    v: SAVE_VERSION,

    money: 0,
    lifetime: 0,        // earned all time - drives unlocks
    clicks: 0,
    logoClicks: 0,

    parts: {},          // partId -> count
    fragments: 0,       // Kirkin schematic fragments
    garage: [],           // finished builds waiting to be sold
    showroom: starterBike(), // the build on display (boosts click income)

    upgrades: {},       // upgradeId -> true
    workers: {},        // roleId -> count
    managers: {},       // roleId -> true
    farms: {},          // farmId -> level

    cfg: {
      runnerCrate: 'scrap_crate',
      wrenchBlueprint: 'scoot_lite',
      closerKeepBest: true,
      autoShowroom: true,
    },

    crateOpens: {},     // crateId -> count
    crafted: {},        // blueprintId -> count
    sold: {},           // blueprintId -> count
    demand: {},         // blueprintId -> 0..1 market saturation
    unlocked: Object.fromEntries(STARTER_BLUEPRINTS.map((id) => [id, true])),
    secrets: {},        // secretId -> true (kirkin_g2, black_site, ...)

    wheelie: { best: 0, runs: 0, earned: 0, unlocked: false },

    stats: {
      cratesOpened: 0, partsGained: 0, builds: 0, sales: 0,
      salvaged: 0, bestSale: 0, bestBuild: 0, clickEarned: 0, playTime: 0,
      spanners: 0, gifts: 0,
    },

    settings: { muted: false, reduceMotion: false, volume: 0.9, buyAmount: 1 },
    tutorial: { done: false, step: 0 },
    net: { name: '', lastRoom: '' },

    time: { started: now, lastTick: now, lastSave: now },
  };
}

export let state = defaultState();

/** Replace the whole state (load / prestige / debug reset). */
export function setState(next) {
  state = next;
  return state;
}

/** Fill in anything a newer version added, without clobbering saved values. */
export function migrate(loaded) {
  const base = defaultState();
  const merged = deepMerge(base, loaded || {});
  merged.v = SAVE_VERSION;
  // Guard against corrupted numbers making the whole UI read NaN.
  for (const key of ['money', 'lifetime', 'clicks', 'logoClicks', 'fragments']) {
    if (!isFinite(merged[key])) merged[key] = 0;
  }
  if (!Array.isArray(merged.garage)) merged.garage = [];
  return merged;
}

function deepMerge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    for (const k of Object.keys(over || {})) {
      const bv = base[k];
      const ov = over[k];
      out[k] = (bv && typeof bv === 'object' && !Array.isArray(bv) && ov && typeof ov === 'object')
        ? deepMerge(bv, ov)
        : ov;
    }
    return out;
  }
  return over === undefined ? base : over;
}

// --- small mutation helpers -------------------------------------------------

export function countPart(id) { return state.parts[id] || 0; }

export function addPart(id, n = 1) {
  state.parts[id] = (state.parts[id] || 0) + n;
  state.stats.partsGained += n;
  return state.parts[id];
}

export function removePart(id, n = 1) {
  const have = state.parts[id] || 0;
  if (have < n) return false;
  if (have === n) delete state.parts[id];
  else state.parts[id] = have - n;
  return true;
}

export function totalParts() {
  let n = 0;
  for (const id in state.parts) n += state.parts[id];
  return n;
}

export function hasUpgrade(id) { return !!state.upgrades[id]; }
export function workerCount(id) { return state.workers[id] || 0; }
export function farmLevel(id) { return state.farms[id] || 0; }
export function isUnlocked(id) { return !!state.unlocked[id]; }
export function hasSecret(id) { return !!state.secrets[id]; }

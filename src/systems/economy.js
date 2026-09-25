// ---------------------------------------------------------------------------
// ECONOMY - every multiplier in the game is resolved here
// ---------------------------------------------------------------------------
// Systems never read upgrade data directly; they ask this module for the final
// number. That keeps balancing to one file.

import { state } from '../core/state.js';
import { UPGRADES } from '../data/upgrades.js';
import { emit, EVENTS } from '../core/events.js';

const BASE_CLICK = 1;

/** Sum a numeric effect across owned upgrades. */
function sumEffect(key) {
  let total = 0;
  for (const u of UPGRADES) {
    if (state.upgrades[u.id] && u.effect[key]) total += u.effect[key];
  }
  return total;
}

/** Multiply a multiplicative effect across owned upgrades. */
function prodEffect(key) {
  let total = 1;
  for (const u of UPGRADES) {
    if (state.upgrades[u.id] && u.effect[key]) total *= u.effect[key];
  }
  return total;
}

/** How much the bike on display adds to each click. */
export function showroomBonus() {
  const bike = state.showroom;
  if (!bike) return 1;
  const boost = Math.pow(Math.max(0, bike.value), 0.36) / 8;
  return 1 + boost * prodEffect('showroomMult');
}

export function clickValue() {
  const flat = BASE_CLICK + sumEffect('clickAdd');
  return flat * prodEffect('clickMult') * showroomBonus();
}

// Multiplayer room bonus on sale prices, set by net/room.js (+5% per other
// shop online, capped). Kept here so every sale sees it without the market
// having to know about the network.
let netBonus = 0;
export function setNetBonus(fraction) { netBonus = Math.max(0, Math.min(0.25, Number(fraction) || 0)); }
export function getNetBonus() { return netBonus; }

export function sellMult() {
  return prodEffect('sellMult') * (1 + netBonus);
}

export function crateCost(crate) {
  const discount = Math.min(0.6, sumEffect('crateDiscount'));
  return crate.cost * (1 - discount);
}

/** Chance for a crate drop to roll one part tier higher than the table said. */
export function crateLuck() {
  return Math.min(0.9, sumEffect('luck'));
}

export function autoMult() {
  return prodEffect('autoMult');
}

export function wheelieMult() { return prodEffect('wheelieMult'); }
export function wheelieZoneBonus() { return sumEffect('wheelieZone'); }
export function wheelieSaves() { return sumEffect('wheelieSave'); }
/** Multiplier a wheelie run starts at (Launch Control). */
export function wheelieLaunch() { return 1 + sumEffect('wheelieLaunch'); }
/** Extra seconds each nitro canister lasts. */
export function wheelieNitroBonus() { return sumEffect('wheelieNitro'); }

export function offlineCapHours() {
  return 8 + sumEffect('offlineHours');
}

export function demandFloor(bp) {
  const base = bp && bp.demandFloor != null ? bp.demandFloor : 0.78;
  return Math.min(0.95, base + sumEffect('demandFloor'));
}

// --- money ------------------------------------------------------------------

const LUMP_SOURCES = new Set(['wheelie', 'debug', 'trade', 'gift', 'event']);
let incomeBucket = 0;
let incomeRate = 0;   // smoothed $/sec, for the header and wheelie scaling

export function addMoney(amount, source = 'misc') {
  if (!isFinite(amount) || amount <= 0) return 0;
  state.money += amount;
  state.lifetime += amount;
  // Wheelie payouts and event prizes are staked on this rate, so lump sums
  // must not feed back into it - one good run would inflate the next stake.
  if (!LUMP_SOURCES.has(source)) incomeBucket += amount;
  if (source === 'click') state.stats.clickEarned += amount;
  emit(EVENTS.MONEY, { amount, source });
  return amount;
}

export function canAfford(cost) { return state.money >= cost; }

export function spend(cost) {
  if (state.money < cost) return false;
  state.money -= cost;
  return true;
}

/** Called once per economy tick to keep the smoothed income rate honest. */
export function sampleIncome(dt) {
  if (dt <= 0) return;
  const blend = Math.min(1, dt / 3);       // ~3 second smoothing window
  incomeRate += (incomeBucket / dt - incomeRate) * blend;
  incomeBucket = 0;
}

export function incomePerSec() { return incomeRate; }

/**
 * What an S-grade wheelie run pays before wheelie upgrades - the "stake" the
 * rig is played for. It follows how rich the player is right now so the rig
 * stays worth a ride from the first minute to the last:
 *  - early on, when clicking is the income, an S run is worth ~750 test
 *    rides - several times what clicking earns in the same 45 seconds.
 *  - later, ~250 seconds of income for a ~45 second run, before the Stunt
 *    Rig upgrades (up to x3.5 more). Riding well is worth stopping for.
 */
export function wheelieSRunValue() {
  return Math.max(clickValue() * 750, incomeRate * 250, 1500);
}

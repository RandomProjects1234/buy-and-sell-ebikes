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

export function sellMult() {
  return prodEffect('sellMult');
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

let incomeBucket = 0;
let incomeRate = 0;   // smoothed $/sec, for the header and wheelie scaling
let autoBucket = 0;
let autoRate = 0;     // same, but only income the automation produced

export function addMoney(amount, source = 'misc') {
  if (!isFinite(amount) || amount <= 0) return 0;
  state.money += amount;
  state.lifetime += amount;
  // Wheelie payouts are staked on this rate, so they must not feed back into
  // it - one good run would otherwise inflate the stake of the next.
  if (source !== 'wheelie' && source !== 'debug') incomeBucket += amount;
  if (source === 'auto') autoBucket += amount;
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
  autoRate += (autoBucket / dt - autoRate) * blend;
  incomeBucket = 0;
  autoBucket = 0;
  // Persisted so offline earnings can be paid at the rate the automation was
  // actually achieving when the tab closed.
  state.stats.autoRate = autoRate;
}

export function incomePerSec() { return incomeRate; }
export function autoIncomePerSec() { return autoRate; }

/**
 * Restore the smoothed rates from a save. Without this the first tick after a
 * reload would blend the saved automated rate down towards zero and, with it,
 * the offline payout the next session would be based on.
 */
export function seedIncomeRate(value) {
  incomeRate = Math.max(incomeRate, value);
  autoRate = Math.max(autoRate, value);
}

/**
 * What an S-grade wheelie run pays before wheelie upgrades - the "stake" the
 * rig is played for. It follows how rich the player is right now so the rig
 * stays worth a ride from the first minute to the last:
 *  - early on, when clicking is the income, an S run is worth ~300 test
 *    rides: better than clicking for the same 45 seconds, not a replacement.
 *  - later, ~110 seconds of income for a ~45 second run: a real bonus for
 *    playing well, but no longer the 20x-income money printer it used to be.
 */
export function wheelieSRunValue() {
  return Math.max(clickValue() * 300, incomeRate * 110, 500);
}

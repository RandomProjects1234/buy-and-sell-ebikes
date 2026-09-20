// ---------------------------------------------------------------------------
// ECONOMY - every multiplier in the game is resolved here
// ---------------------------------------------------------------------------
// Systems never read upgrade data directly; they ask this module for the final
// number. That keeps balancing to one file.

import { state, hasUpgrade, hasPerk } from '../core/state.js';
import { UPGRADES } from '../data/upgrades.js';
import { SHARE_BONUS } from '../data/staff.js';
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

/** Permanent multiplier from IPO shares. Applies to literally all income. */
export function globalMult() {
  return 1 + SHARE_BONUS * (state.prestige.lifetimeShares || 0);
}

/** How much the bike on display adds to each click. */
export function showroomBonus() {
  const bike = state.showroom;
  if (!bike) return 1;
  const boost = Math.pow(Math.max(0, bike.value), 0.34) / 9;
  return 1 + boost * prodEffect('showroomMult');
}

export function clickValue() {
  const flat = BASE_CLICK + sumEffect('clickAdd');
  const perk = hasPerk('muscle_memory') ? 3 : 1;
  return flat * prodEffect('clickMult') * perk * showroomBonus() * globalMult();
}

export function sellMult() {
  const perk = hasPerk('brand_recognition') ? 1.4 : 1;
  return prodEffect('sellMult') * perk * globalMult();
}

export function crateCost(crate) {
  const discount = Math.min(0.6, sumEffect('crateDiscount'));
  return crate.cost * (1 - discount);
}

/** Chance for a crate drop to roll one part tier higher than the table said. */
export function crateLuck() {
  return Math.min(0.85, sumEffect('luck'));
}

export function autoMult() {
  return prodEffect('autoMult') * (hasPerk('fast_hands') ? 1.5 : 1);
}

export function wheelieMult() { return prodEffect('wheelieMult'); }
export function wheelieZoneBonus() { return sumEffect('wheelieZone'); }
export function wheelieSaves() { return sumEffect('wheelieSave'); }

export function offlineCapHours() {
  return 8 + sumEffect('offlineHours') + (hasPerk('night_shift') ? 16 : 0);
}

export function demandFloor(bp) {
  const base = bp && bp.demandFloor != null ? bp.demandFloor : 0.55;
  return Math.min(0.95, base + sumEffect('demandFloor'));
}

export function fragmentLuck() {
  return hasPerk('kirkin_insider') ? 4 : 1;
}

// --- money ------------------------------------------------------------------

let incomeBucket = 0;
let incomeRate = 0;   // smoothed $/sec, for the header and wheelie scaling
let autoBucket = 0;
let autoRate = 0;     // same, but only income the staff produced

export function addMoney(amount, source = 'misc') {
  if (!isFinite(amount) || amount <= 0) return 0;
  state.money += amount;
  state.lifetime += amount;
  state.runEarned += amount;
  incomeBucket += amount;
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
  // Persisted so offline earnings can be paid at the rate the staff were
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
 * A single "how rich is this player right now" number. Used by the wheelie
 * minigame so its payout stays meaningful from the first minute to the last.
 */
export function incomeScale() {
  return Math.max(clickValue() * 8, incomeRate * 14, 40);
}

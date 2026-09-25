// ---------------------------------------------------------------------------
// AUTOMATION - facilities and offline progress
// ---------------------------------------------------------------------------
// Facilities print parts of a fixed tier, a fraction at a time: each one keeps
// an accumulator and drops whole parts into the bin when it crosses 1. Building
// and selling stay in the player's hands.

import { state, farmLevel, addPart } from '../core/state.js';
import { FARMS, FARM_BY_ID } from '../data/facilities.js';
import { partsOfTier } from '../data/parts.js';
import { pick } from '../core/rng.js';
import { geometricCost } from '../core/format.js';
import { autoMult, spend, offlineCapHours } from './economy.js';

const acc = {};   // farmId -> fractional parts owed

// --- buying -----------------------------------------------------------------

export function farmCost(farmId, count = 1) {
  const farm = FARM_BY_ID[farmId];
  return geometricCost(farm.cost, farm.growth, farmLevel(farmId), count);
}

export function buyFarm(farmId, count = 1) {
  const cost = farmCost(farmId, count);
  if (!spend(cost)) return false;
  state.farms[farmId] = farmLevel(farmId) + count;
  return true;
}

export function farmVisible(farm) {
  return farmLevel(farm.id) > 0 || state.lifetime >= (farm.unlock?.lifetime ?? 0);
}

// --- the actual work --------------------------------------------------------

/**
 * Drop `made` parts of a tier into the bin. Big batches (offline catch-up)
 * are spread evenly over the tier's parts instead of rolled one at a time.
 */
function printParts(tier, made) {
  const pool = partsOfTier(tier);
  if (made > pool.length * 4) {
    const each = Math.floor(made / pool.length);
    for (const id of pool) addPart(id, each);
    made -= each * pool.length;
  }
  for (let i = 0; i < made; i += 1) addPart(pick(pool), 1);
}

export function tickAutomation(dt) {
  const speed = autoMult();
  for (const farm of FARMS) {
    const level = farmLevel(farm.id);
    if (!level) continue;
    acc[farm.id] = (acc[farm.id] || 0) + farm.rate * level * speed * dt;
    const made = Math.floor(acc[farm.id]);
    if (made <= 0) continue;
    acc[farm.id] -= made;
    printParts(farm.tier, made);
  }
}

/** Parts per second from facilities, for the UI. */
export function farmOutput() {
  const speed = autoMult();
  return FARMS.reduce((sum, f) => sum + f.rate * farmLevel(f.id) * speed, 0);
}

// --- offline ----------------------------------------------------------------

const OFFLINE_EFFICIENCY = 0.6;

/**
 * Catch up after the tab was closed: the facilities kept printing, at 60% of
 * their live rate, up to the offline cap.
 */
export function runOffline(ms) {
  const capSeconds = offlineCapHours() * 3600;
  const rawSeconds = ms / 1000;
  const seconds = Math.min(rawSeconds, capSeconds);
  if (seconds < 30) return null;

  const speed = autoMult();
  const byFarm = [];
  let parts = 0;
  for (const farm of FARMS) {
    const level = farmLevel(farm.id);
    if (!level) continue;
    const made = Math.floor(farm.rate * level * speed * seconds * OFFLINE_EFFICIENCY);
    if (made <= 0) continue;
    printParts(farm.tier, made);
    byFarm.push({ farm, made });
    parts += made;
  }

  return { seconds, capped: rawSeconds > capSeconds, parts, byFarm };
}

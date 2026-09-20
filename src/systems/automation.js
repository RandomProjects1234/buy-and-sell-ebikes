// ---------------------------------------------------------------------------
// AUTOMATION - staff, facilities and offline progress
// ---------------------------------------------------------------------------
// Every role automates one link of the manual chain. Rates are fractional, so
// each role keeps an accumulator and fires whole actions when it crosses 1.

import { state, workerCount, farmLevel, addPart } from '../core/state.js';
import { ROLES, ROLE_BY_ID, FARMS, FARM_BY_ID, COMMISSION } from '../data/staff.js';
import { partsOfTier } from '../data/parts.js';
import { BP_BY_ID } from '../data/blueprints.js';
import { pick } from '../core/rng.js';
import { geometricCost } from '../core/format.js';
import { autoMult, spend, crateCost, autoIncomePerSec, offlineCapHours, addMoney } from './economy.js';
import { openCrate, bestAffordableCrate, crateVisible } from './crates.js';
import { CRATE_BY_ID } from '../data/crates.js';
import { autoFill, validate, craft } from './crafting.js';
import { visibleBlueprints } from './unlocks.js';
import { sellItem } from './market.js';
import { nextSalvageTier, salvage } from './salvage.js';

const acc = { runner: 0, sorter: 0, wrench: 0, closer: 0, farms: {} };

// --- buying -----------------------------------------------------------------

export function hireCost(roleId, count = 1) {
  const role = ROLE_BY_ID[roleId];
  return geometricCost(role.cost, role.growth, workerCount(roleId), count);
}

export function hire(roleId, count = 1) {
  const cost = hireCost(roleId, count);
  if (!spend(cost)) return false;
  state.workers[roleId] = workerCount(roleId) + count;
  return true;
}

export function buyManager(roleId) {
  const role = ROLE_BY_ID[roleId];
  if (state.managers[roleId] || !spend(role.managerCost)) return false;
  state.managers[roleId] = true;
  return true;
}

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

export function roleVisible(role) {
  return workerCount(role.id) > 0 || state.lifetime >= (role.unlock?.lifetime ?? 0);
}

export function farmVisible(farm) {
  return farmLevel(farm.id) > 0 || state.lifetime >= (farm.unlock?.lifetime ?? 0);
}

// --- the actual work --------------------------------------------------------

function runnerAction() {
  let crate = null;
  if (state.managers.runner) {
    crate = bestAffordableCrate();
  } else {
    const chosen = CRATE_BY_ID[state.cfg.runnerCrate];
    if (chosen && crateVisible(chosen) && state.money >= crateCost(chosen)) crate = chosen;
  }
  if (!crate) return false;
  return !!openCrate(crate.id, { silent: true });
}

function sorterAction() {
  const tier = nextSalvageTier();
  if (tier < 0) return false;
  return !!salvage(tier, { silent: true });
}

/** The Head Mechanic builds the most valuable thing the bin can actually make. */
function chooseBlueprint() {
  if (!state.managers.wrench) return BP_BY_ID[state.cfg.wrenchBlueprint] || null;
  let best = null;
  for (const bp of visibleBlueprints()) {
    if (bp.consumes || bp.fragments) continue;   // never auto-eat a secret build
    if (best && bp.base <= best.base) continue;
    const fit = autoFill(bp, 'cheap');
    if (fit && validate(bp, fit).ok) best = bp;
  }
  return best;
}

function wrenchAction() {
  const bp = chooseBlueprint();
  if (!bp) return false;
  const fit = autoFill(bp, 'cheap');
  if (!fit || !validate(bp, fit).ok) return false;
  return !!craft(bp.id, fit);
}

function closerAction() {
  let best = null;
  for (const it of state.garage) {
    if (it.starter) continue;
    if (!best || it.value > best.value) best = it;
  }
  if (!best) return false;
  const rate = state.managers.closer ? 1 : COMMISSION;
  return sellItem(best.uid, { rate, silent: true, source: 'auto' }) > 0;
}

const ACTIONS = { runner: runnerAction, sorter: sorterAction, wrench: wrenchAction, closer: closerAction };
const MAX_ACTIONS_PER_TICK = 40;   // keeps a long frame from locking the page

export function tickAutomation(dt) {
  const speed = autoMult();

  for (const role of ROLES) {
    const n = workerCount(role.id);
    if (!n) continue;
    acc[role.id] += role.rate * n * speed * dt;
    let budget = Math.min(MAX_ACTIONS_PER_TICK, Math.floor(acc[role.id]));
    if (budget <= 0) continue;
    acc[role.id] -= budget;
    while (budget > 0) {
      if (!ACTIONS[role.id]()) break;   // nothing to do - drop the rest
      budget -= 1;
    }
  }

  for (const farm of FARMS) {
    const level = farmLevel(farm.id);
    if (!level) continue;
    acc.farms[farm.id] = (acc.farms[farm.id] || 0) + farm.rate * level * speed * dt;
    const made = Math.floor(acc.farms[farm.id]);
    if (made <= 0) continue;
    acc.farms[farm.id] -= made;
    const pool = partsOfTier(farm.tier);
    for (let i = 0; i < Math.min(made, 500); i += 1) addPart(pick(pool), 1);
  }
}

/** Parts per second from facilities, for the UI. */
export function farmOutput() {
  const speed = autoMult();
  return FARMS.reduce((sum, f) => sum + f.rate * farmLevel(f.id) * speed, 0);
}

export function roleRate(roleId) {
  return ROLE_BY_ID[roleId].rate * workerCount(roleId) * autoMult();
}

// --- offline ----------------------------------------------------------------

const OFFLINE_EFFICIENCY = 0.6;
const LIVE_SIM_SECONDS = 60;

/**
 * Catch up after the tab was closed. The first minute is simulated properly so
 * the garage and parts bin look alive; the rest is paid out at the measured
 * automated income rate, which keeps a 24 hour absence from trying to simulate
 * a million crate openings.
 */
export function runOffline(ms) {
  const capSeconds = offlineCapHours() * 3600;
  const rawSeconds = ms / 1000;
  const seconds = Math.min(rawSeconds, capSeconds);
  if (seconds < 30) return null;

  const before = { money: state.money, builds: state.stats.builds, crates: state.stats.cratesOpened, sales: state.stats.sales };

  const simSeconds = Math.min(seconds, LIVE_SIM_SECONDS);
  for (let t = 0; t < simSeconds; t += 1) tickAutomation(1);

  const rate = state.stats.autoRate || autoIncomePerSec();
  const idleSeconds = Math.max(0, seconds - simSeconds);
  const idleCash = rate * idleSeconds * OFFLINE_EFFICIENCY;
  if (idleCash > 0) addMoney(idleCash, 'offline');

  return {
    seconds,
    capped: rawSeconds > capSeconds,
    earned: state.money - before.money,
    builds: state.stats.builds - before.builds,
    crates: state.stats.cratesOpened - before.crates,
    sales: state.stats.sales - before.sales,
  };
}

export function resetAccumulators() {
  acc.runner = acc.sorter = acc.wrench = acc.closer = 0;
  acc.farms = {};
}

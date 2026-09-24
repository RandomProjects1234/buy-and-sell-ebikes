// Crate buying + opening.

import { state, addPart } from '../core/state.js';
import { CRATES, CRATE_BY_ID } from '../data/crates.js';
import { PARTS, partsOfTier, TIERS } from '../data/parts.js';
import { weightedPick, chance } from '../core/rng.js';
import { crateCost, crateLuck, spend } from './economy.js';
import { emit, EVENTS } from '../core/events.js';

const MAX_TIER = TIERS.length - 1;

export function crateVisible(crate) {
  if (crate.hidden) return !!state.secrets[crate.id];
  return state.lifetime >= (crate.unlock?.lifetime ?? 0);
}

export function visibleCrates() {
  return CRATES.filter(crateVisible);
}

/** The most expensive crate the player can currently afford (Depot Manager). */
export function bestAffordableCrate() {
  let best = null;
  for (const c of visibleCrates()) {
    if (state.money >= crateCost(c) && (!best || c.cost > best.cost)) best = c;
  }
  return best;
}

/**
 * Which part comes out, given a tier. Slots you are short of are weighted up:
 * without this, an early player can open six crates and still not own a single
 * battery, which reads as the game being broken rather than unlucky.
 */
function pickPart(tier) {
  const ids = partsOfTier(tier);
  const perSlot = {};
  for (const id of Object.keys(state.parts)) {
    const part = PARTS[id];
    if (part) perSlot[part.slot] = (perSlot[part.slot] || 0) + state.parts[id];
  }
  const entries = ids.map((id) => ({ id, weight: 1 / (1 + (perSlot[PARTS[id].slot] || 0)) }));
  return weightedPick(entries).id;
}

function rollDrop(crate) {
  const table = crate.table.map(([tier, weight]) => ({ tier, weight }));
  let tier = weightedPick(table).tier;
  if (chance(crateLuck())) tier = Math.min(MAX_TIER, tier + 1);
  return pickPart(tier);
}

/**
 * Open one crate. `paid` = false skips the money check (automation pays
 * separately, farms and debug grants are free).
 */
export function openCrate(crateId, { paid = true, silent = false } = {}) {
  const crate = CRATE_BY_ID[crateId];
  if (!crate) return null;
  if (paid && !spend(crateCost(crate))) return null;

  const drops = [];
  for (let i = 0; i < crate.drops; i += 1) {
    const partId = rollDrop(crate);
    addPart(partId, 1);
    drops.push(PARTS[partId]);
  }

  state.crateOpens[crateId] = (state.crateOpens[crateId] || 0) + 1;
  state.stats.cratesOpened += 1;

  if (!silent) emit(EVENTS.CRATE_OPENED, { crate, drops });
  return { crate, drops };
}

/** Buy + open up to `count` crates, stopping when the money runs out. */
export function buyCrates(crateId, count = 1) {
  const results = [];
  for (let i = 0; i < count; i += 1) {
    const res = openCrate(crateId, { silent: i < count - 1 });
    if (!res) break;
    results.push(res);
  }
  if (results.length > 1) {
    const all = results.flatMap((r) => r.drops);
    emit(EVENTS.CRATE_OPENED, {
      crate: CRATE_BY_ID[crateId],
      drops: all,
      bulk: results.length,
    });
  }
  return results;
}

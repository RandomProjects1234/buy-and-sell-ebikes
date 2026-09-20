// Crate buying + opening.

import { state, addPart } from '../core/state.js';
import { CRATES, CRATE_BY_ID } from '../data/crates.js';
import { PARTS, partsOfTier, TIERS } from '../data/parts.js';
import { weightedPick, pick, chance } from '../core/rng.js';
import { crateCost, crateLuck, fragmentLuck, spend } from './economy.js';
import { emit, EVENTS } from '../core/events.js';
import { unlockSecret } from './unlocks.js';

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

function rollDrop(crate) {
  const table = crate.table.map(([tier, weight]) => ({ tier, weight }));
  let tier = weightedPick(table).tier;
  if (chance(crateLuck())) tier = Math.min(MAX_TIER, tier + 1);
  const ids = partsOfTier(tier);
  return pick(ids);
}

/**
 * Open one crate. `paid` = false skips the money check (staff pay separately,
 * farms and debug grants are free).
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

  let fragment = false;
  if (crate.fragmentChance && chance(crate.fragmentChance * fragmentLuck())) {
    state.fragments += 1;
    fragment = true;
    unlockSecret('black_site');
    emit(EVENTS.BIG_WIN, {
      text: 'SCHEMATIC FRAGMENT',
      sub: `Torn corner of something called a Kirkin. ${state.fragments}/4 recovered.`,
      kind: 'mythic',
    });
  }

  state.crateOpens[crateId] = (state.crateOpens[crateId] || 0) + 1;
  state.stats.cratesOpened += 1;

  if (!silent) emit(EVENTS.CRATE_OPENED, { crate, drops, fragment });
  return { crate, drops, fragment };
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
      fragment: results.some((r) => r.fragment),
    });
  }
  return results;
}

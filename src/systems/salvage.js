// Salvage: melt a pile of junk into one part from the tier above.
//
// The ratio is deliberately worse than the ~19x value gap between tiers, so
// salvaging is a way to clear dead stock rather than a shortcut up the ladder.
// Hiring a Yard Foreman pulls it back to slightly profitable, which is the
// whole point of the manager unlock.

import { state, countPart, removePart, addPart } from '../core/state.js';
import { PARTS, partsOfTier, TIERS } from '../data/parts.js';
import { pick } from '../core/rng.js';
import { emit, EVENTS } from '../core/events.js';

export const BASE_RATIO = 12;
export const MANAGER_RATIO = 8;
const MAX_TIER = TIERS.length - 1;

export function salvageRatio() {
  return state.managers.sorter ? MANAGER_RATIO : BASE_RATIO;
}

export function partsOfTierOwned(tier) {
  let n = 0;
  for (const id of Object.keys(state.parts)) {
    if (PARTS[id] && PARTS[id].tier === tier) n += state.parts[id];
  }
  return n;
}

export function canSalvage(tier) {
  if (tier >= MAX_TIER) return false;
  return partsOfTierOwned(tier) >= salvageRatio();
}

/** The lowest tier with enough surplus to melt down. Used by Parts Sorters. */
export function nextSalvageTier() {
  for (let t = 0; t < MAX_TIER; t += 1) if (canSalvage(t)) return t;
  return -1;
}

export function salvage(tier, { silent = false } = {}) {
  if (!canSalvage(tier)) return null;
  const ratio = salvageRatio();

  // Spend the cheapest parts of that tier first.
  const owned = Object.keys(state.parts)
    .filter((id) => PARTS[id] && PARTS[id].tier === tier && state.parts[id] > 0)
    .sort((a, b) => PARTS[a].value - PARTS[b].value);

  let left = ratio;
  for (const id of owned) {
    while (left > 0 && countPart(id) > 0) {
      removePart(id, 1);
      left -= 1;
    }
    if (left === 0) break;
  }

  const rewardId = pick(partsOfTier(tier + 1));
  addPart(rewardId, 1);
  state.stats.salvaged += ratio;
  if (!silent) emit(EVENTS.PART_GAINED, { partId: rewardId, count: 1, source: 'salvage' });
  return PARTS[rewardId];
}

/** Salvage as many times as the pile allows (manual "melt it all" button). */
export function salvageAll(tier) {
  const out = [];
  while (canSalvage(tier) && out.length < 200) {
    const part = salvage(tier, { silent: true });
    if (!part) break;
    out.push(part);
  }
  if (out.length) emit(EVENTS.PART_GAINED, { partId: out[out.length - 1].id, count: out.length, source: 'salvage' });
  return out;
}

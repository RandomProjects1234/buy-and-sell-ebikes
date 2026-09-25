// Crate buying + opening.

import { state, addPart } from '../core/state.js';
import { CRATES, CRATE_BY_ID } from '../data/crates.js';
import { PARTS, partsOfTier, CRATE_ONLY_TIER } from '../data/parts.js';
import { crateCost, crateLuck, spend } from './economy.js';
import { rand } from '../core/rng.js';
import { emit, EVENTS } from '../core/events.js';

// The most crates one click can open. x1000 of the Fossil Crate is half a
// million parts, so bulk opening tallies counts instead of listing drops.
export const MAX_BULK = 1000;

export function crateVisible(crate) {
  if (crate.hidden) return !!state.secrets[crate.id];
  return state.lifetime >= (crate.unlock?.lifetime ?? 0);
}

export function visibleCrates() {
  return CRATES.filter(crateVisible);
}

/**
 * Which part comes out, given a tier. Slots you are short of are weighted up:
 * without this, an early player can open six crates and still not own a single
 * battery, which reads as the game being broken rather than unlucky.
 */
function slotCounts() {
  const perSlot = {};
  for (const id of Object.keys(state.parts)) {
    const part = PARTS[id];
    if (part) perSlot[part.slot] = (perSlot[part.slot] || 0) + state.parts[id];
  }
  return perSlot;
}

// These run once per drop - up to 500,000 times for a x1000 Fossil buy - so
// they walk plain arrays instead of building weighted-pick lists each time.
function pickPart(tier, perSlot) {
  const ids = partsOfTier(tier);
  let total = 0;
  for (const id of ids) total += 1 / (1 + (perSlot[PARTS[id].slot] || 0));
  let r = rand() * total;
  for (const id of ids) {
    r -= 1 / (1 + (perSlot[PARTS[id].slot] || 0));
    if (r <= 0) return id;
  }
  return ids[ids.length - 1];
}

function rollTier(crate, luck) {
  let total = 0;
  for (const [, w] of crate.table) total += w;
  let r = rand() * total;
  let tier = crate.table[crate.table.length - 1][0];
  for (const [t, w] of crate.table) {
    r -= w;
    if (r <= 0) { tier = t; break; }
  }
  // Luck never rolls up into a crate-only tier: the Void and Fossil odds on
  // the crate label are the real odds.
  if (tier + 1 < CRATE_ONLY_TIER && luck > 0 && rand() < luck) tier += 1;
  return tier;
}

/** Roll `n` drops of a crate into a {partId: count} tally and the bin. */
function rollInto(crate, n, tally) {
  const perSlot = slotCounts();
  const luck = crateLuck();
  for (let i = 0; i < n; i += 1) {
    const id = pickPart(rollTier(crate, luck), perSlot);
    tally[id] = (tally[id] || 0) + 1;
    perSlot[PARTS[id].slot] = (perSlot[PARTS[id].slot] || 0) + 1;
  }
  for (const [id, count] of Object.entries(tally)) addPart(id, count);
}

/**
 * Open one crate. `paid` = false skips the money check (automation pays
 * separately, farms and debug grants are free).
 */
export function openCrate(crateId, { paid = true, silent = false } = {}) {
  const crate = CRATE_BY_ID[crateId];
  if (!crate) return null;
  if (paid && !spend(crateCost(crate))) return null;

  const tally = {};
  rollInto(crate, crate.drops, tally);

  state.crateOpens[crateId] = (state.crateOpens[crateId] || 0) + 1;
  state.stats.cratesOpened += 1;

  const haul = { crate, count: 1, tally };
  if (!silent) emit(EVENTS.CRATE_OPENED, haul);
  return haul;
}

/**
 * Buy + open up to `count` crates (capped at MAX_BULK), as many as the money
 * covers. Pays once and rolls every drop straight into a tally, so a x1000 of
 * a 500-part crate stays fast. Returns { crate, count, tally } or null.
 */
export function buyCrates(crateId, count = 1) {
  const crate = CRATE_BY_ID[crateId];
  if (!crate) return null;
  const cost = crateCost(crate);
  const n = Math.min(Math.max(1, Math.floor(count)), MAX_BULK, Math.floor(state.money / cost));
  if (n < 1 || !spend(cost * n)) return null;

  const tally = {};
  rollInto(crate, crate.drops * n, tally);
  state.crateOpens[crateId] = (state.crateOpens[crateId] || 0) + n;
  state.stats.cratesOpened += n;

  const haul = { crate, count: n, tally };
  emit(EVENTS.CRATE_OPENED, haul);
  return haul;
}

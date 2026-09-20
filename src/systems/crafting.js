// ---------------------------------------------------------------------------
// WORKBENCH
// ---------------------------------------------------------------------------
// A craft takes a blueprint plus one fitted part per slot. Anything the recipe
// asks for on top of that (extras, fragments, a sacrificed build, an assembly
// fee) is resolved here too.

import { state, countPart, removePart } from '../core/state.js';
import { PARTS, SLOT_BY_ID } from '../data/parts.js';
import { BP_BY_ID, blueprintSlots } from '../data/blueprints.js';
import { uid } from '../core/rng.js';
import { spend } from './economy.js';
import { emit, EVENTS } from '../core/events.js';
import { maybeDisplay } from './market.js';

const QUALITY_EXPONENT = 1.8;

export function slotReqs(bp) {
  return blueprintSlots(bp).map((slot) => ({
    slot,
    minTier: bp.req[slot],
    exact: bp.exact ? bp.exact[slot] || null : null,
  }));
}

/** Owned parts that satisfy a slot requirement, cheapest first. */
export function candidates(bp, slot) {
  const req = slotReqs(bp).find((r) => r.slot === slot);
  if (!req) return [];
  if (req.exact) return countPart(req.exact) > 0 ? [req.exact] : [];
  return Object.keys(state.parts)
    .filter((id) => state.parts[id] > 0 && PARTS[id].slot === slot && PARTS[id].tier >= req.minTier)
    .sort((a, b) => PARTS[a].value - PARTS[b].value);
}

/** mode 'cheap' uses the lowest legal parts; 'best' burns your finest. */
export function autoFill(bp, mode = 'cheap') {
  const selection = {};
  const used = {};
  for (const req of slotReqs(bp)) {
    const list = candidates(bp, req.slot).filter((id) => countPart(id) > (used[id] || 0));
    if (!list.length) return null;
    const chosen = mode === 'best' ? list[list.length - 1] : list[0];
    selection[req.slot] = chosen;
    used[chosen] = (used[chosen] || 0) + 1;
  }
  return selection;
}

/** Extras are filler parts the recipe eats on top of the fitted ones. */
function extraPlan(bp, used) {
  const plan = [];
  const taken = { ...used };
  for (const extra of bp.extra || []) {
    for (let i = 0; i < extra.count; i += 1) {
      const options = Object.keys(state.parts)
        .filter((id) => PARTS[id].slot === extra.slot
          && PARTS[id].tier >= extra.tier
          && countPart(id) > (taken[id] || 0))
        .sort((a, b) => PARTS[a].value - PARTS[b].value);
      if (!options.length) return null;
      const chosen = options[0];
      taken[chosen] = (taken[chosen] || 0) + 1;
      plan.push(chosen);
    }
  }
  return plan;
}

/** Where a recipe's sacrificial build is: the floor, or the showroom window. */
function findDonor(bpId) {
  const idx = state.garage.findIndex((it) => it.bp === bpId);
  if (idx >= 0) return { where: 'garage', idx };
  if (state.showroom && state.showroom.bp === bpId) return { where: 'showroom', idx: -1 };
  return null;
}

export function validate(bp, selection) {
  const used = {};
  for (const req of slotReqs(bp)) {
    const partId = selection ? selection[req.slot] : null;
    const part = partId ? PARTS[partId] : null;
    if (!part) return { ok: false, reason: `Missing ${SLOT_BY_ID[req.slot].name.toLowerCase()}` };
    if (part.slot !== req.slot) return { ok: false, reason: 'Part in the wrong slot' };
    if (req.exact && partId !== req.exact) {
      return { ok: false, reason: `Needs a ${PARTS[req.exact].name}` };
    }
    if (part.tier < req.minTier) return { ok: false, reason: `${SLOT_BY_ID[req.slot].name} tier too low` };
    used[partId] = (used[partId] || 0) + 1;
    if (countPart(partId) < used[partId]) return { ok: false, reason: `Not enough ${part.name}` };
  }

  const extras = extraPlan(bp, used);
  if (extras === null) return { ok: false, reason: 'Missing the extra trim parts' };

  if (bp.fragments && state.fragments < bp.fragments) {
    return { ok: false, reason: `Needs ${bp.fragments} schematic fragments` };
  }
  // The donor build counts whether it is on the floor or in the window - being
  // punished for displaying your best bike would be a nasty surprise.
  if (bp.consumes && !findDonor(bp.consumes)) {
    const donor = BP_BY_ID[bp.consumes];
    return { ok: false, reason: `Needs a finished ${donor ? donor.name : bp.consumes}` };
  }
  if (bp.cash && state.money < bp.cash) return { ok: false, reason: 'Cannot cover the assembly fee' };

  return { ok: true, extras, used };
}

export function quality(bp, selection) {
  const reqs = slotReqs(bp);
  let total = 0;
  for (const req of reqs) {
    const part = PARTS[selection?.[req.slot]];
    if (!part) return 0;
    total += (part.tier + 1) / (req.minTier + 1);
  }
  return total / reqs.length;
}

export function previewValue(bp, selection) {
  const q = quality(bp, selection);
  if (!q) return 0;
  return bp.base * Math.pow(q, QUALITY_EXPONENT);
}

function buildStats(bp, q) {
  const scale = 0.85 + 0.15 * q;
  return {
    speed: bp.speed * scale,
    range: bp.range * scale,
    accel: bp.accel / scale,
  };
}

export function craft(bpId, selection) {
  const bp = BP_BY_ID[bpId];
  if (!bp) return null;
  const check = validate(bp, selection);
  if (!check.ok) return null;

  // Pay everything the recipe asks for.
  if (bp.cash && !spend(bp.cash)) return null;
  for (const slot of Object.keys(selection)) removePart(selection[slot], 1);
  for (const partId of check.extras) removePart(partId, 1);
  if (bp.fragments) state.fragments -= bp.fragments;
  if (bp.consumes) {
    const donor = findDonor(bp.consumes);
    if (donor && donor.where === 'garage') state.garage.splice(donor.idx, 1);
    else if (donor) state.showroom = null;
  }

  const q = quality(bp, selection);
  const stats = buildStats(bp, q);
  const item = {
    uid: uid('b'),
    bp: bp.id,
    name: bp.name,
    kind: bp.kind,
    tier: bp.tier,
    quality: q,
    value: bp.base * Math.pow(q, QUALITY_EXPONENT),
    speed: stats.speed,
    range: stats.range,
    accel: stats.accel,
    parts: { ...selection },
    at: Date.now(),
  };

  state.garage.push(item);
  state.crafted[bp.id] = (state.crafted[bp.id] || 0) + 1;
  state.stats.builds += 1;
  if (item.value > state.stats.bestBuild) state.stats.bestBuild = item.value;

  emit(EVENTS.CRAFTED, { item, blueprint: bp });
  // Only the FIRST of each milestone build takes over the screen - once the
  // Wrenches are mass-producing nuclear bikes, confetti every 10 seconds would
  // be a punishment rather than a reward.
  if ((bp.tier >= 5 || bp.hidden) && state.crafted[bp.id] === 1) {
    emit(EVENTS.BIG_WIN, {
      text: bp.name.toUpperCase(),
      sub: bp.hidden ? 'It should not exist. It is in your garage.' : 'A working nuclear engine bike. Somehow.',
      kind: bp.hidden ? 'secret' : 'nuclear',
    });
  }
  maybeDisplay(item);
  return item;
}

/** Can this blueprint be built right now with the cheapest legal parts? */
export function craftable(bp) {
  const selection = autoFill(bp, 'cheap');
  if (!selection) return { ok: false, reason: 'Missing parts', selection: null };
  const check = validate(bp, selection);
  return { ...check, selection };
}

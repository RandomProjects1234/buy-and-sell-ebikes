// ---------------------------------------------------------------------------
// SALES FLOOR
// ---------------------------------------------------------------------------
// Selling the same model over and over saturates its market. Demand sags with
// each sale and recovers over about a minute, which is the nudge that makes you
// diversify or move up a tier instead of spamming one blueprint forever.

import { state } from '../core/state.js';
import { BP_BY_ID } from '../data/blueprints.js';
import { addMoney, sellMult, demandFloor } from './economy.js';
import { emit, EVENTS } from '../core/events.js';

const SATURATION_PER_SALE = 0.965;
const RECOVERY_TAU = 50;   // seconds-ish to claw most of it back

export function demandOf(bpId) {
  const d = state.demand[bpId];
  return d == null ? 1 : d;
}

export function salePrice(item) {
  if (!item || item.starter) return 0;
  return item.value * demandOf(item.bp) * sellMult();
}

export function sellItem(itemUid, { rate = 1, silent = false, source = 'sale' } = {}) {
  const idx = state.garage.findIndex((it) => it.uid === itemUid);
  if (idx < 0) return 0;
  const item = state.garage[idx];
  if (item.starter) return 0;   // the first Hyper B is not for sale
  const amount = salePrice(item) * rate;

  state.garage.splice(idx, 1);
  addMoney(amount, source);
  state.sold[item.bp] = (state.sold[item.bp] || 0) + 1;
  state.stats.sales += 1;
  if (amount > state.stats.bestSale) state.stats.bestSale = amount;

  const bp = BP_BY_ID[item.bp];
  state.demand[item.bp] = Math.max(demandFloor(bp), demandOf(item.bp) * SATURATION_PER_SALE);

  if (!silent) emit(EVENTS.SOLD, { item, amount });
  return amount;
}

/** Sell the whole floor. Returns total cash. */
export function sellAll({ rate = 1, filterKind = null } = {}) {
  const targets = state.garage
    .filter((it) => !it.starter && (!filterKind || it.kind === filterKind))
    .map((it) => it.uid);
  let total = 0;
  for (const id of targets) total += sellItem(id, { rate, silent: true });
  if (total > 0) emit(EVENTS.SOLD, { item: null, amount: total, bulk: targets.length });
  return total;
}

/** The single most valuable thing on the floor right now. */
export function bestInGarage() {
  let best = null;
  for (const it of state.garage) if (!best || it.value > best.value) best = it;
  return best;
}

export function tickDemand(dt) {
  for (const bpId of Object.keys(state.demand)) {
    const d = state.demand[bpId];
    const next = d + (1 - d) * (1 - Math.exp(-dt / RECOVERY_TAU));
    if (next > 0.999) delete state.demand[bpId];
    else state.demand[bpId] = next;
  }
}

/** Put a build in the showroom window; the old one goes back on the floor. */
export function setShowroom(itemUid) {
  const idx = state.garage.findIndex((it) => it.uid === itemUid);
  if (idx < 0) return false;
  const item = state.garage.splice(idx, 1)[0];
  if (state.showroom) state.garage.push(state.showroom);
  state.showroom = item;
  emit(EVENTS.DIRTY, { what: 'showroom' });
  return true;
}

export function clearShowroom() {
  if (!state.showroom) return false;
  state.garage.push(state.showroom);
  state.showroom = null;
  emit(EVENTS.DIRTY, { what: 'showroom' });
  return true;
}

/** Called after a craft: auto-promote anything better than what is on display. */
export function maybeDisplay(item) {
  if (!state.cfg.autoShowroom) return false;
  if (state.showroom && state.showroom.value >= item.value) return false;
  return setShowroom(item.uid);
}

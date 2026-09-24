// Progression gates: blueprints and crates.

import { state } from '../core/state.js';
import { BLUEPRINTS } from '../data/blueprints.js';
import { emit, EVENTS } from '../core/events.js';

export function unlockSecret(id) {
  if (state.secrets[id]) return false;
  state.secrets[id] = true;
  return true;
}

export function blueprintVisible(bp) {
  if (bp.hidden) return !!state.unlocked[bp.id];
  return !!state.unlocked[bp.id] || state.lifetime >= (bp.unlock?.lifetime ?? 0);
}

export function visibleBlueprints() {
  return BLUEPRINTS.filter(blueprintVisible);
}

/** Unlock anything the player has grown into. Cheap enough to call every tick. */
export function checkUnlocks() {
  for (const bp of BLUEPRINTS) {
    if (bp.hidden || state.unlocked[bp.id]) continue;
    if (state.lifetime >= (bp.unlock?.lifetime ?? 0)) {
      state.unlocked[bp.id] = true;
      emit(EVENTS.BLUEPRINT_UNLOCKED, { blueprint: bp, how: 'lifetime' });
      emit(EVENTS.TOAST, { text: `Blueprint unlocked: ${bp.name}`, kind: 'good' });
    }
  }
  if (!state.wheelie.unlocked && state.lifetime >= 1500) {
    state.wheelie.unlocked = true;
    emit(EVENTS.TOAST, { text: 'The treadmill out back works. Wheelie mode unlocked.', kind: 'good' });
  }
}

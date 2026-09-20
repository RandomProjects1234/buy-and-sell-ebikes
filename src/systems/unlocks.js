// Progression gates: blueprints, crates, staff roles and the two secrets.

import { state } from '../core/state.js';
import { BLUEPRINTS, BP_BY_ID } from '../data/blueprints.js';
import { emit, EVENTS } from '../core/events.js';

const LOGO_CLICKS_FOR_G2 = 100;
const FRAGMENTS_FOR_G4 = 4;

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

/** Clicking the shop logo. 100 of them and somebody slides you a blueprint. */
export function registerLogoClick() {
  if (state.unlocked.kirkin_g2) return { count: state.logoClicks, unlocked: false };
  state.logoClicks += 1;
  const left = LOGO_CLICKS_FOR_G2 - state.logoClicks;

  if (state.logoClicks >= LOGO_CLICKS_FOR_G2) {
    state.unlocked.kirkin_g2 = true;
    unlockSecret('kirkin_g2');
    emit(EVENTS.BLUEPRINT_UNLOCKED, { blueprint: BP_BY_ID.kirkin_g2, how: 'logo' });
    emit(EVENTS.BIG_WIN, {
      text: 'KIRKIN G2',
      sub: 'A folded blueprint was taped behind your own shop sign. It has been there the whole time.',
      kind: 'secret',
    });
    return { count: state.logoClicks, unlocked: true };
  }

  // Tiny breadcrumbs so it does not feel like a dead sign.
  if (state.logoClicks === 25) emit(EVENTS.TOAST, { text: 'The sign rattles. Something is taped behind it.', kind: 'info' });
  if (state.logoClicks === 60) emit(EVENTS.TOAST, { text: 'The tape is peeling. Keep going.', kind: 'info' });
  if (state.logoClicks === 90) emit(EVENTS.TOAST, { text: 'Almost free...', kind: 'info' });
  return { count: state.logoClicks, left, unlocked: false };
}

/** Four fragments reveal the G4 recipe. */
export function checkFragments() {
  if (state.unlocked.kirkin_g4 || state.fragments < FRAGMENTS_FOR_G4) return false;
  state.unlocked.kirkin_g4 = true;
  unlockSecret('kirkin_g4');
  emit(EVENTS.BLUEPRINT_UNLOCKED, { blueprint: BP_BY_ID.kirkin_g4, how: 'fragments' });
  emit(EVENTS.BIG_WIN, {
    text: 'KIRKIN G4',
    sub: 'Four fragments, one blueprint, and a note that just says "do not sell this one".',
    kind: 'secret',
  });
  return true;
}

export const SECRET_INFO = { LOGO_CLICKS_FOR_G2, FRAGMENTS_FOR_G4 };

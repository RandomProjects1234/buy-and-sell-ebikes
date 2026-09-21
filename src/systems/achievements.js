// Award checking. Cheap enough to run every tick: each test is a couple of
// property reads, and awarded ones are skipped.

import { state } from '../core/state.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, AWARD_BONUS } from '../data/achievements.js';
import { emit, EVENTS } from '../core/events.js';

export function hasAward(id) { return !!state.awards[id]; }

export function awardCount() {
  return Object.keys(state.awards || {}).length;
}

/** Permanent multiplier from the award wall. */
export function achievementBonus() {
  return 1 + AWARD_BONUS * awardCount();
}

export function earnedAchievements() {
  return ACHIEVEMENTS.filter((a) => state.awards[a.id]);
}

/** Awards the player has not got yet, with the secret ones hidden. */
export function visibleAchievements() {
  return ACHIEVEMENTS.filter((a) => !a.secret || state.awards[a.id] || a.test(state));
}

export function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (state.awards[a.id]) continue;
    let ok = false;
    try {
      ok = a.test(state);
    } catch (err) {
      ok = false;   // a malformed save should never break the tick
    }
    if (!ok) continue;
    state.awards[a.id] = Date.now();
    emit(EVENTS.ACHIEVEMENT, { achievement: a, total: awardCount() });
  }
}

/** Used by the Awards panel. */
export function allAchievements() { return ACHIEVEMENTS; }
export function achievementById(id) { return ACHIEVEMENT_BY_ID[id]; }

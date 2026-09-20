// Random helpers. Everything random in the game funnels through here so a
// deterministic seed can be dropped in for balance testing (see tools/balance.js).

let _random = Math.random;

/** Swap in a deterministic generator (used by the balance simulator + tests). */
export function setRandomSource(fn) { _random = fn || Math.random; }

export function rand() { return _random(); }

export function randRange(min, max) { return min + _random() * (max - min); }

export function randInt(min, max) { return Math.floor(randRange(min, max + 1)); }

export function chance(p) { return _random() < p; }

export function pick(list) { return list[Math.floor(_random() * list.length)]; }

/**
 * Weighted pick. `entries` is an array of objects with a numeric weight field.
 * Returns the entry itself (not the index) so call sites stay readable.
 */
export function weightedPick(entries, weightKey = 'weight') {
  let total = 0;
  for (const e of entries) total += (e[weightKey] || 0);
  if (total <= 0) return entries[0];
  let roll = _random() * total;
  for (const e of entries) {
    roll -= (e[weightKey] || 0);
    if (roll <= 0) return e;
  }
  return entries[entries.length - 1];
}

/** Deterministic 32-bit PRNG, handy for seeded runs. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Short unique-enough id for crafted items. */
let _uid = 0;
export function uid(prefix = 'i') {
  _uid += 1;
  return prefix + '_' + Date.now().toString(36) + '_' + _uid.toString(36);
}

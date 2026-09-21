// Dead-simple event bus. The UI listens, the systems emit; nothing reaches
// into the DOM from game logic.

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  const set = listeners.get(event);
  if (set) set.delete(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const fn of [...set]) fn(payload);
  const all = listeners.get('*');
  if (all) for (const fn of [...all]) fn({ event, payload });
}

export const EVENTS = {
  MONEY: 'money',                 // { amount, source }
  CLICK: 'click',                 // { amount, x, y }
  CRATE_OPENED: 'crate:opened',   // { crate, drops }
  PART_GAINED: 'part:gained',     // { partId, count, source }
  CRAFTED: 'crafted',             // { item, blueprint }
  SOLD: 'sold',                   // { item, amount }
  BLUEPRINT_UNLOCKED: 'bp:unlock',// { blueprint, how }
  PRESTIGE: 'prestige',           // { shares }
  WHEELIE_END: 'wheelie:end',     // { score, payout }
  TOAST: 'toast',                 // { text, kind }
  DIRTY: 'dirty',                 // panel invalidation hint
  BIG_WIN: 'bigwin',              // { text, sub, kind }
  BUFF: 'buff',                   // { buff, sub, pos }
  ACHIEVEMENT: 'achievement',     // { achievement }
  NET: 'net',                     // { status, code, players, feed }
};

// Tiny DOM helpers + the action dispatch table.
//
// Panels render to HTML strings and mark their buttons with data-act="name".
// A single delegated listener on the document routes clicks, so re-rendering a
// panel never leaves dead listeners behind.

const handlers = new Map();
let pointerIsDown = false;
const afterPointerUp = [];

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function el(id) { return document.getElementById(id); }

export function registerAction(name, fn) { handlers.set(name, fn); }

export function registerActions(map) {
  for (const [name, fn] of Object.entries(map)) handlers.set(name, fn);
}

export function initActions() {
  document.addEventListener('pointerdown', () => { pointerIsDown = true; }, true);
  document.addEventListener('pointerup', () => {
    pointerIsDown = false;
    while (afterPointerUp.length) afterPointerUp.pop()();
  }, true);
  document.addEventListener('pointercancel', () => { pointerIsDown = false; }, true);

  document.addEventListener('click', (ev) => {
    const target = ev.target.closest('[data-act]');
    // .is-disabled covers the rows that are divs rather than <button>s.
    if (!target || target.disabled || target.classList.contains('is-disabled')) return;
    const fn = handlers.get(target.dataset.act);
    if (!fn) return;
    ev.preventDefault();
    fn(target.dataset, ev, target);
  });

  // Selects and checkboxes use data-change and go through the same table.
  document.addEventListener('change', (ev) => {
    const target = ev.target.closest('[data-change]');
    if (!target) return;
    const fn = handlers.get(target.dataset.change);
    if (fn) fn(target.dataset, ev, target);
  });
}

/** True when the player is mid-interaction with a form control in a panel. */
export function isEditing() {
  const a = document.activeElement;
  return !!a && (a.tagName === 'SELECT' || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
}

/** True while a finger/mouse button is down - used to postpone re-renders. */
export function isPointerDown() { return pointerIsDown; }

export function whenPointerUp(fn) {
  if (!pointerIsDown) fn();
  else afterPointerUp.push(fn);
}

/** Position helper for floating text spawned by a click event. */
export function eventPoint(ev, fallbackEl) {
  if (ev && ev.clientX != null && (ev.clientX || ev.clientY)) return { x: ev.clientX, y: ev.clientY };
  const r = (fallbackEl || document.body).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

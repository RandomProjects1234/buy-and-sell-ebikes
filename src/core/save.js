// Save / load / export. LocalStorage only - the whole game is one JSON blob.

import { state, setState, defaultState, migrate } from './state.js';
import { emit, EVENTS } from './events.js';

export const SAVE_KEY = 'buy-and-sell-ebikes.save.v1';
const AUTOSAVE_MS = 15000;

let autosaveTimer = null;

export function save({ quiet = true } = {}) {
  try {
    state.time.lastSave = Date.now();
    state.time.lastTick = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    if (!quiet) emit(EVENTS.TOAST, { text: 'Saved.', kind: 'info' });
    return true;
  } catch (err) {
    console.warn('[save] failed', err);
    emit(EVENTS.TOAST, { text: 'Save failed - storage may be full or blocked.', kind: 'bad' });
    return false;
  }
}

/** Returns {loaded, offlineMs}. Never throws: a broken save just starts a new game. */
export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (err) {
    console.warn('[save] storage unavailable', err);
  }
  if (!raw) return { loaded: false, offlineMs: 0 };
  try {
    const parsed = JSON.parse(raw);
    const migrated = migrate(parsed);
    const offlineMs = Math.max(0, Date.now() - (migrated.time.lastTick || Date.now()));
    setState(migrated);
    return { loaded: true, offlineMs };
  } catch (err) {
    console.warn('[save] corrupt save, starting fresh', err);
    return { loaded: false, offlineMs: 0 };
  }
}

export function startAutosave() {
  stopAutosave();
  autosaveTimer = setInterval(() => save(), AUTOSAVE_MS);
  window.addEventListener('beforeunload', () => save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
}

export function stopAutosave() {
  if (autosaveTimer) clearInterval(autosaveTimer);
  autosaveTimer = null;
}

export function exportSave() {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

export function importSave(text) {
  try {
    const json = decodeURIComponent(escape(atob(text.trim())));
    const parsed = JSON.parse(json);
    setState(migrate(parsed));
    save();
    return true;
  } catch (err) {
    console.warn('[save] import failed', err);
    return false;
  }
}

export function wipeSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
  setState(defaultState());
}

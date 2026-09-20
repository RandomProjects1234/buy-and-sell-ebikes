// ---------------------------------------------------------------------------
// CLOCK
// ---------------------------------------------------------------------------
// Background tabs throttle setTimeout to about 1Hz and stop firing
// requestAnimationFrame entirely, which would freeze the simulation and the
// wheelie minigame the moment the window is hidden. Worker timers are not
// throttled, so the authoritative tick comes from a worker and rAF is used only
// for drawing - with the worker taking over drawing too if rAF goes quiet.

const WORKER_SRC = `
let handle = null;
onmessage = (e) => {
  if (e.data && e.data.cmd === 'start') {
    if (handle) clearInterval(handle);
    handle = setInterval(() => postMessage('t'), e.data.ms);
  } else if (e.data && e.data.cmd === 'stop') {
    clearInterval(handle);
    handle = null;
  }
};
`;

const simCallbacks = new Set();
const frameCallbacks = new Set();

let worker = null;
let fallbackTimer = null;
let lastSim = 0;
let lastFrame = 0;
let lastRafAt = 0;
let running = false;

export function onTick(fn) { simCallbacks.add(fn); return () => simCallbacks.delete(fn); }
export function onFrame(fn) { frameCallbacks.add(fn); return () => frameCallbacks.delete(fn); }

function runSim(now) {
  const dt = Math.min(1, (now - lastSim) / 1000) || 0;
  lastSim = now;
  for (const fn of simCallbacks) fn(dt);
}

function runFrame(now) {
  const dt = Math.min(0.25, (now - lastFrame) / 1000) || 0;
  lastFrame = now;
  for (const fn of frameCallbacks) fn(dt);
}

function tickFromWorker() {
  const now = performance.now();
  runSim(now);
  // rAF has not fired recently (hidden tab / collapsed pane) - drive drawing
  // from here so canvas games and timers keep moving.
  if (now - lastRafAt > 200) runFrame(now);
}

function rafLoop(now) {
  if (!running) return;
  lastRafAt = now;
  runFrame(now);
  requestAnimationFrame(rafLoop);
}

export function startClock({ hz = 20 } = {}) {
  if (running) return;
  running = true;
  lastSim = lastFrame = performance.now();

  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = tickFromWorker;
    worker.postMessage({ cmd: 'start', ms: Math.round(1000 / hz) });
  } catch (err) {
    console.warn('[clock] worker unavailable, falling back to setInterval', err);
    fallbackTimer = setInterval(tickFromWorker, Math.round(1000 / hz));
  }

  requestAnimationFrame(rafLoop);
}

export function stopClock() {
  running = false;
  if (worker) { worker.postMessage({ cmd: 'stop' }); worker.terminate(); worker = null; }
  if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
}

// ---------------------------------------------------------------------------
// WHEELIE MODE
// ---------------------------------------------------------------------------
// A 40 second balance game on the shop treadmill. Hold to open the throttle and
// lift the nose, let go and the engine brake drops it again.
//
//  - Keep the front wheel in the GREEN arc and the multiplier climbs. The narrow
//    GOLD band near the top is the balance point: double points, double climb,
//    and it sits uncomfortably close to vertical.
//  - Coins come in trails at a fixed angle, so collecting them is steering, not
//    luck. Gems hang out near vertical for the brave.
//  - Bumps kick the nose up, potholes drop it. Both are signposted.
//  - Past vertical you loop it. Scrape back from the red and it is a close call.
//  - The belt speeds up as the run goes on, and so does the bike's response.
//
// Physics runs in fixed 1/120s steps, advanced to "now" from both the shared
// sim tick (worker backed, so a run keeps going in a hidden tab) and the draw
// call (so the bike moves at the display's frame rate instead of the 20Hz tick).

import { state } from '../core/state.js';
import {
  addMoney, wheelieMult, wheelieZoneBonus, wheelieSaves, wheelieLaunch,
  wheelieNitroBonus, wheelieSRunValue,
} from '../systems/economy.js';
import { fmtMoney, fmtNum } from '../core/format.js';
import { play, engineStart, engineSet, engineStop } from '../core/audio.js';
import { emit, EVENTS } from '../core/events.js';
import { bikePalette } from '../ui/bikeArt.js';
import { skyFor } from '../ui/scene.js';

export const RUN_SECONDS = 40;
const COUNT_STEP = 0.8;              // 3, 2, 1 - then GO
const COUNTDOWN = COUNT_STEP * 3;
const SIM_STEP = 1 / 120;

// Degrees of nose-up. 0 = both wheels down, 90 = straight up.
const ZONE_LOW = 28;
const ZONE_HIGH = 76;
const GOLD_LOW = 58;
const GOLD_HIGH = 70;
const DANGER = 86;
const CRASH_ANGLE = 100;

const THROTTLE = 175;                // deg/s^2 from the motor
const GRAVITY = 100;                 // deg/s^2 at horizontal, times cos(angle)
const ENGINE_BRAKE = 40;             // extra pull down when you let go
const DRAG = 1.2;                    // angular velocity decay per second
const NITRO_PUSH = 1.3;
const NITRO_SECONDS = 5;
const MAX_MULT = 10;
const SLAM_SPEED = -75;              // hitting the floor faster than this hurts
const CRASH_KEEP = 0.7;              // share of the payout a crash still banks
const BELT_SPEED = 250;              // px/s at the start of a run
// A bump's kick must be survivable: at the balance point, letting go stops a
// 50 deg/s kick within ~15 degrees, so a quick release always saves it.
const BUMP_KICK = 50;
const HOLE_DROP = 45;
const COIN_POINTS = 12;
const GEM_POINTS = 100;

// Score a very good run lands on. Calibrated with bots that react 0.14-0.26s
// late (window.__BSE.wheelie.simulate): one parked on the balance point
// averages about this, one that plays safe in the green lands around B/A, a
// sloppy one around B-C with the odd crash.
export const S_SCORE = 36000;

export const GRADES = [
  { id: 'S', at: 1, color: '#ffd23f' },
  { id: 'A', at: 0.72, color: '#3ee08f' },
  { id: 'B', at: 0.48, color: '#4cc9f0' },
  { id: 'C', at: 0.28, color: '#b86bff' },
  { id: 'D', at: 0, color: '#968cc6' },
];

export function gradeFor(score) {
  const f = score / S_SCORE;
  return GRADES.find((g) => f >= g.at) || GRADES[GRADES.length - 1];
}

/** Money a run with this score banks (before the crash cut). */
export function payoutFor(score) {
  return wheelieSRunValue() * (score / S_SCORE) * wheelieMult();
}

const game = {
  phase: 'idle',           // idle | countdown | running | crashed | done
  countdown: 0,
  lastCount: 0,
  angle: 0,
  angVel: 0,
  time: RUN_SECONDS,
  elapsed: 0,
  speed: 1,
  score: 0,
  mult: 1,
  throttle: false,
  saves: 0,
  nitro: 0,
  belt: 0,
  pickups: [],
  hazards: [],
  particles: [],
  popups: [],
  spawnTimer: 0,
  hazardTimer: 0,
  smokeAcc: 0,
  goldStreak: 0,
  nextStreakAt: 3,
  closeCall: false,
  smoothCheck: 0,
  spannerDropped: false,
  shake: 0,
  flash: 0,
  hype: 0,
  payout: 0,
  grade: null,
  newBest: false,
  endedAt: 0,
  crashT: 0,
  rider: null,
  lastSimAt: 0,
  clock: 0,
  stats: null,
};

function freshStats() {
  return { gold: 0, green: 0, coins: 0, gems: 0, closeCalls: 0, bumps: 0, slams: 0, bestMult: 1 };
}
game.stats = freshStats();

let canvas = null;
let ctx = null;
let dpr = 1;
let geo = layout(800, 380);
let resizeBound = false;

export function isRunning() { return game.phase === 'running' || game.phase === 'countdown'; }
export function phase() { return game.phase; }

// --- layout -----------------------------------------------------------------

function layout(w, h) {
  const ground = h * 0.84;
  const L = Math.max(70, Math.min(w * 0.26, h * 0.42, 170));
  const R = L * 0.22;
  return { w, h, ground, L, R, px: w * 0.27, py: ground - R, horizon: h * 0.6 };
}

/** Where the front wheel sits for a given nose angle. */
function frontAt(angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: geo.px + Math.cos(a) * geo.L, y: geo.py - Math.sin(a) * geo.L };
}

// --- input ------------------------------------------------------------------

function canvasShown() {
  return !!(canvas && canvas.isConnected && canvas.offsetParent);
}

function typingSomewhere() {
  const a = document.activeElement;
  return !!a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && a.type !== 'range'));
}

const THROTTLE_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);

window.addEventListener('keydown', (ev) => {
  if (!canvasShown() || typingSomewhere()) return;
  if (!THROTTLE_KEYS.has(ev.code) && ev.code !== 'Enter') return;
  ev.preventDefault();
  if (isRunning()) { game.throttle = true; return; }
  if (!ev.repeat && canRestart()) startRun();
});
window.addEventListener('keyup', (ev) => {
  if (THROTTLE_KEYS.has(ev.code)) game.throttle = false;
});
window.addEventListener('blur', () => { game.throttle = false; });

function canRestart() {
  // A key still held from the end of the last run should not instantly launch
  // the next one.
  return performance.now() - game.endedAt > 700;
}

export function attach(canvasEl) {
  canvas = canvasEl;
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resize();
  if (!resizeBound) {
    window.addEventListener('resize', resize);
    resizeBound = true;
  }

  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* old browsers */ }
    if (!isRunning()) {
      if (!canRestart()) return;
      startRun();
    }
    game.throttle = true;
  });
  const up = () => { game.throttle = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function resize() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(320, Math.round(rect.width * dpr));
  canvas.height = Math.max(220, Math.round(rect.height * dpr));
  geo = layout(canvas.width / dpr, canvas.height / dpr);
}

// --- run lifecycle ----------------------------------------------------------

function zone() {
  const pad = wheelieZoneBonus();
  return {
    low: ZONE_LOW - pad,
    high: ZONE_HIGH + pad,
    gLow: GOLD_LOW - pad * 0.5,
    gHigh: GOLD_HIGH + pad * 0.5,
  };
}

export function resetToIdle() {
  engineStop();
  game.phase = 'idle';
  game.score = 0;
  game.angle = 0;
  game.angVel = 0;
  game.pickups = [];
  game.hazards = [];
  game.rider = null;
}

export function startRun() {
  if (isRunning()) return;
  resetToIdle();
  game.phase = 'countdown';
  game.countdown = COUNTDOWN;
  game.lastCount = 4;
  game.time = RUN_SECONDS;
  game.elapsed = 0;
  game.speed = 1;
  game.mult = wheelieLaunch();
  game.nitro = 0;
  game.spawnTimer = 0.4;
  game.hazardTimer = 6;
  game.goldStreak = 0;
  game.nextStreakAt = 3;
  game.closeCall = false;
  game.smoothCheck = 0;
  game.spannerDropped = false;
  game.saves = wheelieSaves();
  game.payout = 0;
  game.grade = null;
  game.newBest = false;
  game.crashT = 0;
  game.stats = freshStats();
  game.lastSimAt = performance.now();
  state.wheelie.runs += 1;
  engineStart();
}

function finish(crashed) {
  game.phase = crashed ? 'crashed' : 'done';
  game.throttle = false;
  game.endedAt = performance.now();
  engineStop();

  const payout = payoutFor(game.score) * (crashed ? CRASH_KEEP : 1);
  game.payout = payout;
  if (payout > 0) addMoney(payout, 'wheelie');
  state.wheelie.earned += payout;
  const grade = gradeFor(game.score);
  game.grade = grade.id;
  if (grade.id === 'S') state.wheelie.sRuns = (state.wheelie.sRuns || 0) + 1;
  game.newBest = game.score > state.wheelie.best && game.score > 0;
  if (game.newBest) state.wheelie.best = Math.floor(game.score);

  emit(EVENTS.WHEELIE_END, { score: game.score, payout, crashed, grade: grade.id });

  if (crashed) {
    play('crash');
    game.shake = 16;
    game.crashT = 0;
    const hip = toWorld(0.33 * geo.L, -0.62 * geo.L, game.angle);
    game.rider = { x: hip.x, y: hip.y, vx: -140, vy: -260, rot: 0, spin: -7 };
    sparks(frontAt(game.angle).x, geo.ground, 24);
  } else {
    play(grade.id === 'S' || grade.id === 'A' ? 'achieve' : 'rare');
    game.hype = 1;
    if (grade.id === 'S') confetti(60);
  }
}

// --- simulation -------------------------------------------------------------

function advance(now) {
  if (!game.lastSimAt) game.lastSimAt = now;
  let dt = Math.min(0.25, (now - game.lastSimAt) / 1000);
  game.lastSimAt = now;
  while (dt > 1e-6) {
    const s = Math.min(SIM_STEP, dt);
    step(s);
    dt -= s;
  }
}

/** Called from the shared sim tick. The dt is ignored: we catch up to now. */
export function update() { advance(performance.now()); }

/** Test hook: run the simulation for a fixed time without the wall clock. */
export function simulate(seconds, controller) {
  for (let t = 0; t < seconds && game.phase !== 'idle'; t += SIM_STEP) {
    if (controller) game.throttle = !!controller(snapshot());
    step(SIM_STEP);
    if (game.phase === 'done' || game.phase === 'crashed') break;
  }
  game.lastSimAt = performance.now();
  return snapshot();
}

function step(dt) {
  game.clock += dt;
  game.shake = Math.max(0, game.shake - dt * 40);
  game.flash = Math.max(0, game.flash - dt * 2.5);
  game.hype = Math.max(0, game.hype - dt * 0.35);
  updateParticles(dt);
  updatePopups(dt);

  if (game.phase === 'countdown') { stepCountdown(dt); return; }
  if (game.phase === 'crashed') { stepCrash(dt); return; }
  if (game.phase !== 'running') { game.belt += dt * 70; return; }

  const z = zone();
  const progress = game.elapsed / RUN_SECONDS;
  game.speed = 1 + 0.55 * progress;
  const vx = BELT_SPEED * game.speed;

  // --- balance physics
  const push = THROTTLE * (1 + 0.12 * progress) * (game.nitro > 0 ? NITRO_PUSH : 1);
  let accel = -GRAVITY * Math.cos((game.angle * Math.PI) / 180);
  if (game.throttle) accel += push;
  else if (game.angle > 0.5) accel -= ENGINE_BRAKE;
  game.angVel = (game.angVel + accel * dt) * Math.exp(-DRAG * dt);
  game.angle += game.angVel * dt;

  if (game.angle <= 0) {
    if (game.angVel < SLAM_SPEED) slam();
    game.angle = 0;
    game.angVel = game.angVel < SLAM_SPEED ? -game.angVel * 0.18 : 0;
  }

  if (game.angle > DANGER) game.closeCall = true;
  if (game.angle > CRASH_ANGLE) {
    if (game.saves > 0) {
      game.saves -= 1;
      game.angle = 62;
      game.angVel = -25;
      game.mult = Math.max(1, game.mult * 0.6);
      game.closeCall = false;
      game.shake = 10;
      popup('WHEELIE BAR!', geo.px, geo.py - geo.L * 1.2, '#ff9f1c', 1.1);
      sparks(geo.px - geo.R, geo.ground, 14);
      play('error');
    } else {
      finish(true);
      return;
    }
  }
  if (game.closeCall && game.angle < z.gHigh) {
    game.closeCall = false;
    game.stats.closeCalls += 1;
    const bonus = 150 * game.mult;
    game.score += bonus;
    game.hype = 1;
    const f = frontAt(game.angle);
    popup(`CLOSE CALL +${fmtNum(bonus, { int: true })}`, f.x, f.y - 40, '#ff5fb8', 1.1);
    play('unlock', { rate: 1.25, gain: 0.7 });
  }

  // --- scoring
  const lifted = game.angle > 8;
  const inGold = game.angle >= z.gLow && game.angle <= z.gHigh;
  const inGreen = game.angle >= z.low && game.angle <= z.high;
  const boost = (game.nitro > 0 ? 2 : 1) * game.speed;
  if (inGold) {
    game.mult = Math.min(MAX_MULT, game.mult + 0.7 * dt);
    game.score += 50 * game.mult * boost * dt;
    game.stats.gold += dt;
    game.hype = Math.min(1, game.hype + dt * 0.6);
  } else if (inGreen) {
    game.mult = Math.min(MAX_MULT, game.mult + 0.3 * dt);
    game.score += 22 * game.mult * boost * dt;
  } else if (lifted) {
    game.mult = Math.max(1, game.mult - 0.9 * dt);
    game.score += 5 * game.mult * boost * dt;
  } else {
    game.mult = Math.max(1, game.mult - 2.5 * dt);
  }
  if (inGreen) game.stats.green += dt;
  game.stats.bestMult = Math.max(game.stats.bestMult, game.mult);

  if (inGold) {
    game.goldStreak += dt;
    if (game.goldStreak >= game.nextStreakAt) {
      game.nextStreakAt += 3;
      const bonus = 100 * game.mult;
      game.score += bonus;
      const f = frontAt(game.angle);
      popup(`BALANCE POINT +${fmtNum(bonus, { int: true })}`, f.x, f.y - 46, '#ffd23f', 1);
      game.flash = 0.35;
      play('coin', { rate: 1.5 });
    }
  } else {
    game.goldStreak = 0;
    game.nextStreakAt = 3;
  }
  if (game.nitro > 0) game.nitro -= dt;

  // --- the world scrolls past
  game.belt += vx * dt;
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    spawnPattern();
    game.spawnTimer = (1.5 + Math.random() * 1.1) / Math.sqrt(game.speed);
  }
  game.hazardTimer -= dt;
  if (game.hazardTimer <= 0 && game.time > 3) {
    spawnHazard();
    game.hazardTimer = (3.2 + Math.random() * 2.6) / game.speed;
  }
  movePickups(vx, dt);
  moveHazards(vx, dt, lifted);

  // --- engine, smoke
  const rev = game.throttle ? 0.55 + 0.45 * Math.min(1, game.angle / 70) : 0.12 + game.angle / 400;
  engineSet(rev, game.nitro > 0);
  if (game.throttle) {
    game.smokeAcc += dt * (game.nitro > 0 ? 70 : 40);
    while (game.smokeAcc >= 1) {
      game.smokeAcc -= 1;
      smoke(geo.px - geo.R * 0.4, geo.ground - 3, game.nitro > 0);
    }
  }

  game.time -= dt;
  game.elapsed += dt;
  if (game.time <= 0) { game.time = 0; finish(false); }
}

function stepCountdown(dt) {
  game.countdown -= dt;
  game.belt += dt * 70;
  engineSet(game.throttle ? 0.75 : 0.1);
  const n = Math.ceil(game.countdown / COUNT_STEP);
  if (n !== game.lastCount && n > 0) {
    game.lastCount = n;
    play('tickUp', { rate: 0.7, gain: 1.6 });
  }
  if (game.countdown <= 0) {
    game.phase = 'running';
    game.lastCount = 0;
    popup('GO!', geo.w / 2, geo.h * 0.42, '#3ee08f', 2);
    play('clickBig');
  }
}

function stepCrash(dt) {
  game.crashT += dt;
  // The bike carries on over the top and lands on its back.
  const t = Math.min(1, game.crashT / 0.45);
  game.angle = CRASH_ANGLE + 70 * (1 - (1 - t) * (1 - t));
  const r = game.rider;
  if (r) {
    r.vy += 1100 * dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.rot += r.spin * dt;
    if (r.y > geo.ground - 10) {
      r.y = geo.ground - 10;
      r.vy = -r.vy * 0.35;
      r.vx *= 0.6;
      r.spin *= 0.5;
      if (Math.abs(r.vy) > 60) sparks(r.x, geo.ground, 5);
    }
  }
}

function slam() {
  game.mult = Math.max(1, game.mult * 0.6);
  game.stats.slams += 1;
  game.shake = 8;
  const f = frontAt(0);
  sparks(f.x, geo.ground, 12);
  popup('SLAM!', f.x, f.y - 40, '#ff4f79', 0.9);
  play('drop', { rate: 0.6, gain: 1.4 });
}

// --- pickups ------------------------------------------------------------------

function addPickup(kind, a, offset = 0) {
  game.pickups.push({ kind, a, x: geo.w + 40 + offset, spin: Math.random() * 6 });
}

function spawnPattern() {
  const z = zone();
  const roll = Math.random();
  if (roll < 0.1) {
    // Nitro, somewhere comfortable.
    addPickup('nitro', 40 + Math.random() * 24);
  } else if (roll < 0.22) {
    // A gem up near vertical: big points if you dare go and get it.
    addPickup('gem', 80 + Math.random() * 5);
  } else if (!game.spannerDropped && game.elapsed > 12 && roll < 0.27) {
    game.spannerDropped = true;
    addPickup('spanner', 45 + Math.random() * 20);
  } else if (roll < 0.62) {
    // A straight trail - hold the angle through it.
    const a = z.low + 6 + Math.random() * (z.high - z.low - 14);
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i += 1) addPickup('coin', a, i * 40);
  } else {
    // A ramp - sweep the nose up (or down) through it.
    const lo = 34 + Math.random() * 8;
    const hi = 62 + Math.random() * 10;
    const up = Math.random() < 0.5;
    for (let i = 0; i < 6; i += 1) {
      const f = i / 5;
      addPickup('coin', up ? lo + (hi - lo) * f : hi - (hi - lo) * f, i * 42);
    }
  }
}

function movePickups(vx, dt) {
  const f = frontAt(game.angle);
  // Reach scales with the bike, so the angle tolerance (about +-8 degrees) is
  // the same on a phone as on a monitor.
  const reach = geo.L * 0.15;
  for (const p of game.pickups) {
    p.x -= vx * dt;
    p.spin += dt * 5;
    if (p.got) continue;
    const py = geo.py - Math.sin((p.a * Math.PI) / 180) * geo.L;
    if (Math.hypot(p.x - f.x, py - f.y) > reach) continue;
    p.got = true;
    collect(p, p.x, py);
  }
  game.pickups = game.pickups.filter((p) => p.x > -60 && !p.got);
}

function collect(p, x, y) {
  const m = game.mult;
  if (p.kind === 'coin') {
    const pts = COIN_POINTS * m;
    game.score += pts;
    game.stats.coins += 1;
    popup(`+${fmtNum(pts, { int: true })}`, x, y - 16, '#ffd23f', 0.75);
    burstAt(x, y, ['#ffd23f', '#fff3a3'], 7);
    play('coin', { rate: 0.95 + Math.random() * 0.15 });
  } else if (p.kind === 'gem') {
    const pts = GEM_POINTS * m;
    game.score += pts;
    game.stats.gems += 1;
    game.hype = 1;
    popup(`GEM +${fmtNum(pts, { int: true })}`, x, y - 18, '#7af5ff', 1);
    burstAt(x, y, ['#7af5ff', '#ffffff', '#b86bff'], 16);
    play('rare', { gain: 0.8 });
  } else if (p.kind === 'nitro') {
    game.nitro = NITRO_SECONDS + wheelieNitroBonus();
    game.score += 50;
    popup('NITRO x2', x, y - 18, '#7af5ff', 1.1);
    burstAt(x, y, ['#7af5ff', '#ffffff'], 14);
    play('nitro');
  } else if (p.kind === 'spanner') {
    game.saves += 1;
    popup('+1 SAVE', x, y - 18, '#ff9f1c', 1);
    burstAt(x, y, ['#ff9f1c', '#ffd23f'], 12);
    play('unlock', { gain: 0.7 });
  }
}

// --- hazards ------------------------------------------------------------------

function spawnHazard() {
  game.hazards.push({ kind: Math.random() < 0.55 ? 'bump' : 'hole', x: geo.w + 60, hit: false });
}

function moveHazards(vx, dt, lifted) {
  for (const hz of game.hazards) {
    hz.x -= vx * dt;
    if (hz.hit || hz.x > geo.px) continue;
    hz.hit = true;
    if (hz.kind === 'bump') {
      game.angVel += BUMP_KICK;
      popup('BUMP!', geo.px, geo.ground - 30, '#ffd23f', 0.9);
    } else {
      game.angVel -= HOLE_DROP;
      popup('POTHOLE!', geo.px, geo.ground - 30, '#ff9f1c', 0.9);
    }
    game.shake = Math.max(game.shake, 6);
    sparks(geo.px, geo.ground, 6);
    play('drop', { rate: hz.kind === 'bump' ? 0.8 : 0.55, gain: 1.3 });
    game.smoothCheck = 1.3;
  }
  game.hazards = game.hazards.filter((hz) => hz.x > -80);

  // Rode it out: still up and still alive a beat later.
  if (game.smoothCheck > 0) {
    game.smoothCheck -= dt;
    if (game.smoothCheck <= 0 && lifted) {
      const bonus = 60 * game.mult;
      game.score += bonus;
      game.stats.bumps += 1;
      popup(`SMOOTH +${fmtNum(bonus, { int: true })}`, geo.px + geo.L * 0.5, geo.ground - 50, '#3ee08f', 0.9);
    }
  }
}

// --- particles + popups -------------------------------------------------------

function smoke(x, y, nitro) {
  game.particles.push({
    x, y,
    vx: -60 - Math.random() * 80,
    vy: -20 - Math.random() * 40,
    life: 0.7, max: 0.7,
    size: 6 + Math.random() * 8,
    grow: 18,
    color: nitro ? '#7af5ff' : '#e9ddff',
    alpha: nitro ? 0.55 : 0.28,
  });
}

function sparks(x, y, n) {
  for (let i = 0; i < n; i += 1) {
    const a = -Math.PI * (0.1 + Math.random() * 0.8);
    const sp = 140 + Math.random() * 260;
    game.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.45, max: 0.45, size: 2 + Math.random() * 2, grow: 0,
      color: Math.random() < 0.5 ? '#ffd23f' : '#ff9f1c', alpha: 1, gravity: 700,
    });
  }
}

function burstAt(x, y, colors, n) {
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 160;
    game.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5, max: 0.5, size: 2 + Math.random() * 3, grow: 0,
      color: colors[i % colors.length], alpha: 1,
    });
  }
}

function confetti(n) {
  const colors = ['#ff5fb8', '#ffd23f', '#3ee08f', '#4cc9f0', '#b86bff', '#ff9f1c'];
  for (let i = 0; i < n; i += 1) {
    game.particles.push({
      x: Math.random() * geo.w, y: -10 - Math.random() * 60,
      vx: -30 + Math.random() * 60, vy: 60 + Math.random() * 120,
      life: 2.4, max: 2.4, size: 3 + Math.random() * 3, grow: 0,
      color: colors[i % colors.length], alpha: 1, gravity: 60, square: true,
    });
  }
}

function updateParticles(dt) {
  for (const p of game.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity) p.vy += p.gravity * dt;
    p.size += p.grow * dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
  if (game.particles.length > 400) game.particles.splice(0, game.particles.length - 400);
}

function popup(text, x, y, color, size = 1) {
  game.popups.push({ text, x, y, color, size, life: 1.1, max: 1.1 });
  if (game.popups.length > 12) game.popups.shift();
}

function updatePopups(dt) {
  for (const p of game.popups) { p.life -= dt; p.y -= 38 * dt; }
  game.popups = game.popups.filter((p) => p.life > 0);
}

// --- drawing ------------------------------------------------------------------

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Bike-local coordinates (x forward, y down) to canvas, rotated about the rear axle. */
function toWorld(lx, ly, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: geo.px + lx * c + ly * s, y: geo.py - lx * s + ly * c };
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSky(w, h) {
  const sky = skyFor(state.showroom ? state.showroom.tier : 0);
  const g = ctx.createLinearGradient(0, 0, 0, geo.horizon);
  g.addColorStop(0, sky.sky[0]);
  g.addColorStop(0.45, sky.sky[1]);
  g.addColorStop(0.8, sky.sky[2]);
  g.addColorStop(1, sky.sky[3]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // stars
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 26; i += 1) {
    const x = (i * 97.3) % w;
    const y = (i * 41.7) % (geo.horizon * 0.5);
    ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(game.clock * 1.3 + i));
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;

  // striped sun sinking behind the city
  const sr = Math.min(w, h) * 0.24;
  const sx = w * 0.7;
  const sy = geo.horizon;
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 1.9);
  glow.addColorStop(0, `${sky.sun[1]}88`);
  glow.addColorStop(1, `${sky.sun[1]}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(sx - sr * 2, sy - sr * 2, sr * 4, sr * 2);
  const sg = ctx.createLinearGradient(0, sy - sr, 0, sy);
  sg.addColorStop(0, sky.sun[0]);
  sg.addColorStop(1, sky.sun[1]);
  ctx.save();
  ctx.beginPath();
  ctx.arc(sx, sy, sr, Math.PI, 0);
  ctx.clip();
  ctx.fillStyle = sg;
  ctx.fillRect(sx - sr, sy - sr, sr * 2, sr);
  ctx.fillStyle = sky.sky[2];
  for (let i = 0; i < 5; i += 1) {
    const by = sy - sr * 0.45 + i * sr * 0.1;
    ctx.fillRect(sx - sr, by, sr * 2, 1.5 + i * 1.2);
  }
  ctx.restore();

  // far skyline, barely moving
  ctx.fillStyle = 'rgba(40, 18, 88, .75)';
  for (let i = 0; i < 16; i += 1) {
    const bw = 34 + ((i * 29) % 30);
    const x = ((i * 71 - game.belt * 0.04) % (w + 120) + w + 120) % (w + 120) - 60;
    const bh = h * (0.08 + ((i * 37) % 9) * 0.014);
    ctx.fillRect(x, geo.horizon - bh, bw, bh + 2);
  }
  // near buildings between the horizon and the stands
  const near = ['#3a1a78', '#4b1f8f', '#2e1766', '#5a2596'];
  for (let i = 0; i < 10; i += 1) {
    const bw = 56;
    const x = ((i * 137 - game.belt * 0.14) % (w + 160) + w + 160) % (w + 160) - 80;
    const bh = (geo.ground - geo.horizon) * 0.4 + h * (0.06 + ((i * 53) % 7) * 0.03);
    const top = geo.ground - bh;
    ctx.fillStyle = near[i % near.length];
    ctx.fillRect(x, top, bw, bh);
    ctx.fillStyle = 'rgba(255, 226, 122, .75)';
    for (let wy = top + 8; wy < geo.ground - 28; wy += 15) {
      if ((i + Math.round(wy / 15)) % 3) ctx.fillRect(x + 10, wy, 6, 7);
      if ((i + Math.round(wy / 15)) % 2) ctx.fillRect(x + 36, wy, 6, 7);
    }
  }
}

function drawCrowd(w) {
  const big = !!state.upgrades.crowd_barrier;
  const count = big ? 30 : 11;
  const base = geo.ground - 6;
  const colors = ['#ff5fb8', '#ffd23f', '#4cc9f0', '#3ee08f', '#b86bff', '#ff9f1c'];
  const hype = game.hype + (game.phase === 'running' ? 0.15 : 0.05);
  for (let i = 0; i < count; i += 1) {
    const x = ((i + 0.5) / count) * w + Math.sin(i * 7.1) * 8;
    if (Math.abs(x - geo.px - geo.L * 0.35) < geo.L * 0.75) continue; // leave the bike clear
    const hop = Math.max(0, Math.sin(game.clock * (7 + (i % 3)) + i)) * 9 * hype;
    const y = base - 16 - hop;
    ctx.fillStyle = colors[i % colors.length];
    roundRect(x - 6, y, 12, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#ffd9b8';
    ctx.beginPath();
    ctx.arc(x, y - 5, 5, 0, Math.PI * 2);
    ctx.fill();
    if (hype > 0.45) {
      ctx.strokeStyle = colors[i % colors.length];
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 3); ctx.lineTo(x - 9, y - 9);
      ctx.moveTo(x + 5, y + 3); ctx.lineTo(x + 9, y - 9);
      ctx.stroke();
    }
  }
  // the barrier they lean on
  ctx.fillStyle = 'rgba(20, 8, 50, .75)';
  ctx.fillRect(0, base - 4, w, 10);
  for (let x = -((game.belt * 0.14) % 40); x < w; x += 40) {
    ctx.fillStyle = '#ff5fb8';
    ctx.fillRect(x, base - 4, 20, 4);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x + 20, base - 4, 20, 4);
  }
}

function drawBelt(w, h) {
  const y = geo.ground;
  const g = ctx.createLinearGradient(0, y, 0, h);
  g.addColorStop(0, '#2a1260');
  g.addColorStop(1, '#12072e');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, w, h - y);
  ctx.strokeStyle = 'rgba(255, 122, 200, .35)';
  ctx.lineWidth = 3;
  const spacing = 46;
  const offset = -(game.belt % spacing);
  for (let x = offset; x < w + spacing; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.lineTo(x - 16, h - 6);
    ctx.stroke();
  }
  ctx.strokeStyle = '#ff7ac8';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#ff7ac8';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawHazards() {
  for (const hz of game.hazards) {
    const y = geo.ground;
    if (hz.kind === 'bump') {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(hz.x - 26, y);
      ctx.quadraticCurveTo(hz.x, y - 22, hz.x + 26, y);
      ctx.fill();
      ctx.fillStyle = '#1c0b33';
      for (let i = -2; i <= 1; i += 1) ctx.fillRect(hz.x + i * 11 + 2, y - 11, 5, 11);
    } else {
      ctx.fillStyle = '#07021a';
      ctx.beginPath();
      ctx.ellipse(hz.x, y + 5, 28, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff9f1c';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Warning sign while it is still coming.
    if (!hz.hit && hz.x > geo.px + 30) {
      const bob = Math.sin(game.clock * 10) * 3;
      const sy = y - 58 + bob;
      ctx.fillStyle = hz.kind === 'bump' ? '#ffd23f' : '#ff9f1c';
      ctx.beginPath();
      ctx.moveTo(hz.x, sy - 14);
      ctx.lineTo(hz.x + 14, sy + 10);
      ctx.lineTo(hz.x - 14, sy + 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1c0b33';
      ctx.font = `800 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(hz.kind === 'bump' ? '▲' : '▼', hz.x, sy + 7);
    }
  }
}

function drawPickups() {
  for (const p of game.pickups) {
    const y = geo.py - Math.sin((p.a * Math.PI) / 180) * geo.L;
    ctx.save();
    ctx.translate(p.x, y);
    if (p.kind === 'coin') {
      ctx.scale(Math.abs(Math.cos(p.spin)) * 0.7 + 0.3, 1);
      ctx.shadowColor = '#ffd23f';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3a3';
      ctx.font = `800 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 4);
    } else if (p.kind === 'gem') {
      ctx.rotate(Math.sin(p.spin) * 0.25);
      ctx.shadowColor = '#7af5ff';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#7af5ff';
      ctx.beginPath();
      ctx.moveTo(0, -15); ctx.lineTo(13, -3); ctx.lineTo(0, 16); ctx.lineTo(-13, -3);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(6, -3); ctx.lineTo(-6, -3); ctx.closePath(); ctx.fill();
    } else if (p.kind === 'nitro') {
      ctx.rotate(Math.sin(p.spin) * 0.2);
      ctx.shadowColor = '#7af5ff';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#4cc9f0';
      roundRect(-10, -17, 20, 34, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.fillRect(-4, -22, 8, 6);
      ctx.fillStyle = '#12072e';
      ctx.font = `800 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('N2O', 0, 4);
    } else {
      ctx.rotate(p.spin * 0.6);
      ctx.strokeStyle = '#ff9f1c';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-11, 11); ctx.lineTo(8, -8); ctx.stroke();
      ctx.beginPath(); ctx.arc(10, -10, 6, 0.6, Math.PI * 1.9); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawGauge() {
  const z = zone();
  const r = geo.L * 1.32;
  const arc = (from, to, color, width, alpha = 1) => {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(geo.px, geo.py, r, -(to * Math.PI) / 180, -(from * Math.PI) / 180);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  ctx.lineCap = 'butt';
  arc(0, CRASH_ANGLE, 'rgba(255,255,255,.12)', 8);
  arc(z.low, z.high, '#3ee08f', 8, 0.75);
  arc(z.gLow, z.gHigh, '#ffd23f', 10, 0.95);
  arc(DANGER, CRASH_ANGLE, '#ff4f79', 8, 0.85);

  // needle
  const a = (Math.min(CRASH_ANGLE + 4, game.angle) * Math.PI) / 180;
  const nx = geo.px + Math.cos(a) * r;
  const ny = geo.py - Math.sin(a) * r;
  const inGold = game.angle >= z.gLow && game.angle <= z.gHigh;
  const inGreen = game.angle >= z.low && game.angle <= z.high;
  ctx.fillStyle = game.angle > DANGER ? '#ff4f79' : inGold ? '#ffd23f' : inGreen ? '#3ee08f' : '#ffffff';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(nx, ny, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#1c0b33';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function wheel(cx, cy, r, spin, p) {
  ctx.strokeStyle = '#150c24';
  ctx.lineWidth = r * 0.34;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.83, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = p.rim;
  ctx.lineWidth = r * 0.12;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 6; i += 1) {
    const ang = spin + (Math.PI * 2 * i) / 6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * r * 0.58, cy + Math.sin(ang) * r * 0.58);
    ctx.stroke();
  }
  ctx.fillStyle = p.accent;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.15, 0, Math.PI * 2); ctx.fill();
}

function drawBike() {
  const { L, R } = geo;
  const tier = state.showroom ? state.showroom.tier : 0;
  const p = bikePalette(tier);
  const ang = game.angle;
  const W = (lx, ly) => toWorld(lx * L, ly * L, ang);
  const spin = game.belt / (R * 1.2);

  // shadow on the belt
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  ctx.ellipse(geo.px + L * 0.45 * Math.cos((ang * Math.PI) / 180), geo.ground + 3, L * 0.6, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const A = W(0, 0);
  const B = W(0.42, 0.05);
  const S = W(0.33, -0.5);
  const H = W(0.8, -0.58);
  const F = W(1, 0);
  const bar = W(0.74, -0.8);
  const grip = W(0.66, -0.8);

  wheel(A.x, A.y, R, spin, p);

  // frame
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = p.body;
  ctx.lineWidth = Math.max(4, L * 0.055);
  ctx.beginPath();
  ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(S.x, S.y); ctx.lineTo(A.x, A.y);
  ctx.moveTo(S.x, S.y); ctx.lineTo(H.x, H.y); ctx.lineTo(B.x, B.y);
  ctx.moveTo(H.x, H.y); ctx.lineTo(F.x, F.y);
  ctx.moveTo(H.x, H.y); ctx.lineTo(bar.x, bar.y); ctx.lineTo(grip.x, grip.y);
  ctx.stroke();

  // battery on the down tube
  const b1 = W(0.5, -0.12);
  const b2 = W(0.72, -0.44);
  ctx.strokeStyle = p.rim;
  ctx.lineWidth = L * 0.13;
  ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
  ctx.strokeStyle = game.nitro > 0 ? '#7af5ff' : p.accent;
  ctx.lineWidth = L * 0.05;
  ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();

  // saddle
  const s1 = W(0.24, -0.55);
  const s2 = W(0.42, -0.55);
  ctx.strokeStyle = '#1c0b33';
  ctx.lineWidth = L * 0.07;
  ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();

  wheel(F.x, F.y, R, spin * 0.6, p);

  if (game.phase === 'crashed') return;

  // rider: sits on the saddle and leans forward against the wheelie
  const hip = W(0.33, -0.62);
  const lean = ((22 + ang * 0.35) * Math.PI) / 180; // forward lean in world space
  const torso = L * 0.5;
  const shoulder = { x: hip.x + Math.sin(lean) * torso, y: hip.y - Math.cos(lean) * torso };
  const crank = game.belt / 40;
  const pedal = W(0.42 + Math.cos(crank) * 0.09, 0.05 + Math.sin(crank) * 0.09);
  const knee = { x: (hip.x + pedal.x) / 2 + L * 0.12, y: (hip.y + pedal.y) / 2 - L * 0.06 };

  ctx.strokeStyle = '#2a1a5e';
  ctx.lineWidth = L * 0.09;
  ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(pedal.x, pedal.y); ctx.stroke();

  ctx.strokeStyle = '#ff5fb8';
  ctx.lineWidth = L * 0.13;
  ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(shoulder.x, shoulder.y); ctx.stroke();

  const elbow = { x: (shoulder.x + grip.x) / 2, y: (shoulder.y + grip.y) / 2 + L * 0.06 };
  ctx.strokeStyle = '#ff7ac8';
  ctx.lineWidth = L * 0.06;
  ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y); ctx.lineTo(elbow.x, elbow.y); ctx.lineTo(grip.x, grip.y); ctx.stroke();

  // helmet + visor
  const head = { x: shoulder.x + Math.sin(lean) * L * 0.14, y: shoulder.y - Math.cos(lean) * L * 0.14 };
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(head.x, head.y, L * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1c0b33';
  ctx.beginPath(); ctx.arc(head.x + L * 0.04, head.y + L * 0.01, L * 0.07, -0.9, 0.9); ctx.fill();
}

function drawRiderOff() {
  const r = game.rider;
  if (!r) return;
  const { L } = geo;
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.rot);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ff5fb8';
  ctx.lineWidth = L * 0.13;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L * 0.45); ctx.stroke();
  ctx.strokeStyle = '#2a1a5e';
  ctx.lineWidth = L * 0.09;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.2, L * 0.25); ctx.moveTo(0, 0); ctx.lineTo(-L * 0.15, L * 0.28); ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(0, -L * 0.58, L * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawParticles() {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, (p.life / p.max) * p.alpha);
    ctx.fillStyle = p.color;
    if (p.square) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * 6);
      ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPopups(k) {
  ctx.textAlign = 'center';
  for (const p of game.popups) {
    const t = p.life / p.max;
    const pop = t > 0.85 ? 1 + (t - 0.85) * 2 : 1;
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.font = `900 ${Math.round(17 * p.size * pop * k)}px ${FONT}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20, 6, 50, .85)';
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawSpeedLines(w) {
  if (game.nitro <= 0 && game.speed < 1.3) return;
  const n = game.nitro > 0 ? 14 : 6;
  ctx.strokeStyle = game.nitro > 0 ? 'rgba(122, 245, 255, .45)' : 'rgba(255, 255, 255, .18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i += 1) {
    const y = ((i * 53.7) % (geo.ground - 30)) + 10;
    const x = w - ((game.belt * 2.2 + i * 211) % (w + 200));
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60 + (i % 3) * 30, y); ctx.stroke();
  }
}

function drawDanger(w, h) {
  if (game.phase !== 'running' || game.angle < DANGER - 6) return;
  const t = Math.min(1, (game.angle - (DANGER - 6)) / 14);
  const pulse = 0.55 + 0.45 * Math.sin(game.clock * 18);
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(255, 79, 121, 0)');
  g.addColorStop(1, `rgba(255, 79, 121, ${0.55 * t * pulse})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function pill(x, y, text, bg, fg, k, align = 'left') {
  ctx.font = `800 ${Math.round(13 * k)}px ${MONO}`;
  const tw = ctx.measureText(text).width + 16 * k;
  const bx = align === 'left' ? x : x - tw;
  ctx.fillStyle = bg;
  roundRect(bx, y, tw, 22 * k, 11 * k);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.fillText(text, bx + tw / 2, y + 15.5 * k);
  return tw;
}

function drawHud(w, k) {
  const z = zone();
  const pad = 16 * k;

  // score
  ctx.textAlign = 'left';
  ctx.font = `900 ${Math.round(30 * k)}px ${FONT}`;
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(20, 6, 50, .7)';
  const scoreText = fmtNum(Math.floor(game.score), { int: true });
  ctx.strokeText(scoreText, pad, pad + 26 * k);
  ctx.fillStyle = '#fff';
  ctx.fillText(scoreText, pad, pad + 26 * k);

  const inGold = game.angle >= z.gLow && game.angle <= z.gHigh;
  let x = pad;
  x += pill(x, pad + 36 * k, `x${game.mult.toFixed(1)}`, inGold ? '#ffd23f' : 'rgba(255,255,255,.16)', inGold ? '#1c0b33' : '#fff', k) + 6;
  if (game.nitro > 0) x += pill(x, pad + 36 * k, `NITRO ${game.nitro.toFixed(1)}s`, '#4cc9f0', '#07213a', k) + 6;
  if (game.saves > 0) pill(x, pad + 36 * k, `SAVE x${game.saves}`, '#ff9f1c', '#2a1400', k);

  // timer bar across the top middle
  const bw = Math.min(260 * k, w * 0.34);
  const bx = w / 2 - bw / 2;
  const by = pad + 4;
  ctx.fillStyle = 'rgba(20, 6, 50, .55)';
  roundRect(bx, by, bw, 10 * k, 5 * k);
  ctx.fill();
  const frac = game.phase === 'countdown' ? 1 : game.time / RUN_SECONDS;
  ctx.fillStyle = game.time < 8 ? '#ff4f79' : '#3ee08f';
  roundRect(bx, by, Math.max(0.001, bw * frac), 10 * k, 5 * k);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.round(12 * k)}px ${MONO}`;
  ctx.fillText(`${Math.ceil(game.phase === 'countdown' ? RUN_SECONDS : game.time)}s`, w / 2, by + 26 * k);

  // payout + grade so far
  const grade = gradeFor(game.score);
  ctx.textAlign = 'right';
  ctx.font = `900 ${Math.round(20 * k)}px ${FONT}`;
  ctx.strokeText(fmtMoney(payoutFor(game.score)), w - pad, pad + 20 * k);
  ctx.fillStyle = '#ffd23f';
  ctx.fillText(fmtMoney(payoutFor(game.score)), w - pad, pad + 20 * k);
  pill(w - pad, pad + 30 * k, `GRADE ${grade.id}`, grade.color, '#1c0b33', k, 'right');
}

function drawCountdown(w, h, k) {
  const n = Math.ceil(game.countdown / COUNT_STEP);
  const frac = (game.countdown % COUNT_STEP) / COUNT_STEP;
  ctx.fillStyle = 'rgba(16, 6, 44, .35)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.font = `900 ${Math.round((70 + frac * 40) * k)}px ${FONT}`;
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(20, 6, 50, .85)';
  ctx.strokeText(String(n), w / 2, h * 0.46);
  ctx.fillStyle = ['#3ee08f', '#ffd23f', '#ff5fb8'][n - 1] || '#fff';
  ctx.fillText(String(n), w / 2, h * 0.46);
  ctx.font = `700 ${Math.round(14 * k)}px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.fillText(game.throttle ? 'Revving...' : 'Get ready - hold to rev', w / 2, h * 0.46 + 34 * k);
}

function card(w, h, k, cw, ch) {
  const x = w / 2 - cw / 2;
  const y = h / 2 - ch / 2;
  ctx.fillStyle = 'rgba(16, 6, 44, .55)';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, y, 0, y + ch);
  g.addColorStop(0, 'rgba(52, 36, 120, .96)');
  g.addColorStop(1, 'rgba(27, 18, 72, .96)');
  ctx.fillStyle = g;
  roundRect(x, y, cw, ch, 18 * k);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, .18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return { x, y };
}

function drawIdle(w, h, k) {
  const cw = Math.min(560 * k + 40, w - 24);
  const ch = Math.min(236 * k, h - 24);
  const { y } = card(w, h, k, cw, ch);
  ctx.textAlign = 'center';
  const title = ctx.createLinearGradient(w / 2 - 150, 0, w / 2 + 150, 0);
  title.addColorStop(0, '#ffd23f');
  title.addColorStop(0.5, '#ff5fb8');
  title.addColorStop(1, '#4cc9f0');
  ctx.fillStyle = title;
  ctx.font = `900 ${Math.round(32 * k)}px ${FONT}`;
  ctx.fillText('WHEELIE MODE', w / 2, y + 44 * k);

  const lines = [
    ['#ffffff', 'Hold (click, touch or SPACE) for throttle. Let go to drop the nose.'],
    ['#3ee08f', 'Keep the front wheel in the GREEN arc to build your multiplier.'],
    ['#ffd23f', 'The GOLD band is the balance point: double points, double climb.'],
    ['#ff9f1c', 'Steer through coin trails. Signs warn you about bumps and potholes.'],
    ['#ff4f79', 'Past vertical you loop it, and a crash only banks 70%.'],
  ];
  ctx.font = `600 ${Math.round(13 * k)}px ${FONT}`;
  lines.forEach(([color, text], i) => {
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, y + (74 + i * 22) * k);
  });
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.round(15 * k)}px ${FONT}`;
  const blink = 0.55 + 0.45 * Math.sin(game.clock * 4);
  ctx.globalAlpha = blink;
  ctx.fillText('Press SPACE or tap here to ride', w / 2, y + ch - 20 * k);
  ctx.globalAlpha = 1;
}

function drawResults(w, h, k) {
  const crashed = game.phase === 'crashed';
  if (crashed && game.crashT < 0.9) return; // let the crash play out first
  const cw = Math.min(540 * k + 40, w - 24);
  const ch = Math.min(250 * k, h - 24);
  const { x, y } = card(w, h, k, cw, ch);
  const grade = GRADES.find((g) => g.id === game.grade) || GRADES[4];

  ctx.textAlign = 'center';
  ctx.fillStyle = crashed ? '#ff4f79' : '#3ee08f';
  ctx.font = `900 ${Math.round(24 * k)}px ${FONT}`;
  ctx.fillText(crashed ? 'LOOPED IT' : 'CLEAN RUN', w / 2, y + 36 * k);

  // grade medallion
  const gx = x + 30 * k + 48 * k;
  const gy = y + ch / 2 + 6 * k;
  const gr = 46 * k;
  ctx.shadowColor = grade.color;
  ctx.shadowBlur = 24;
  ctx.fillStyle = grade.color;
  ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#1c0b33';
  ctx.font = `900 ${Math.round(54 * k)}px ${FONT}`;
  ctx.fillText(grade.id, gx, gy + 19 * k);

  // numbers
  const tx = gx + gr + 24 * k;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${Math.round(24 * k)}px ${FONT}`;
  ctx.fillText(`${fmtNum(Math.floor(game.score), { int: true })} pts`, tx, y + 76 * k);
  ctx.fillStyle = '#ffd23f';
  ctx.font = `900 ${Math.round(26 * k)}px ${FONT}`;
  ctx.fillText(`+${fmtMoney(game.payout)}`, tx, y + 108 * k);

  const s = game.stats;
  const run = Math.max(0.1, RUN_SECONDS - game.time);
  ctx.fillStyle = '#d0c6f5';
  ctx.font = `600 ${Math.round(12 * k)}px ${MONO}`;
  ctx.fillText(`balance point ${s.gold.toFixed(1)}s  ·  in the green ${Math.round((s.green / run) * 100)}%`, tx, y + 134 * k);
  ctx.fillText(`coins ${s.coins}  ·  gems ${s.gems}  ·  close calls ${s.closeCalls}  ·  top x${s.bestMult.toFixed(1)}`, tx, y + 152 * k);
  ctx.fillStyle = crashed ? '#ff9fb2' : '#9dffc4';
  ctx.fillText(crashed ? `Crash kept ${Math.round(CRASH_KEEP * 100)}% of the payout.` : 'Held it to the bell - full payout.', tx, y + 172 * k);

  if (game.newBest) {
    ctx.save();
    ctx.translate(x + cw - 20 * k, y + 22 * k);
    ctx.rotate(0.18);
    ctx.fillStyle = '#ff5fb8';
    roundRect(-70 * k, -13 * k, 90 * k, 26 * k, 8 * k);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(12 * k)}px ${FONT}`;
    ctx.fillText('NEW BEST!', -25 * k, 4 * k);
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.round(14 * k)}px ${FONT}`;
  ctx.globalAlpha = canRestart() ? 0.55 + 0.45 * Math.sin(game.clock * 4) : 0.3;
  ctx.fillText('SPACE or tap to ride again', w / 2, y + ch - 18 * k);
  ctx.globalAlpha = 1;
}

export function draw() {
  if (!ctx || !canvas) return;
  advance(performance.now());
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  if (geo.w !== w || geo.h !== h) geo = layout(w, h);
  const k = Math.max(0.62, Math.min(1, w / 720));
  const calm = state.settings.reduceMotion;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (game.shake > 0 && !calm) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }

  drawSky(w, h);
  drawCrowd(w);
  drawBelt(w, h);
  drawSpeedLines(w);
  drawHazards();
  if (game.phase === 'running' || game.phase === 'countdown') drawGauge();
  drawPickups();
  drawBike();
  drawRiderOff();
  drawParticles();
  drawDanger(w, h);

  if (game.flash > 0 && !calm) {
    ctx.fillStyle = `rgba(255, 210, 63, ${game.flash * 0.35})`;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (game.phase !== 'idle') drawHud(w, k);
  drawPopups(k);
  if (game.phase === 'idle') drawIdle(w, h, k);
  else if (game.phase === 'countdown') drawCountdown(w, h, k);
  else if (game.phase === 'done' || game.phase === 'crashed') drawResults(w, h, k);
}

export function snapshot() {
  return {
    phase: game.phase,
    score: game.score,
    payout: game.payout,
    grade: game.grade,
    best: state.wheelie.best,
    angle: game.angle,
    angVel: game.angVel,
    mult: game.mult,
    time: game.time,
    throttle: game.throttle,
    nitro: game.nitro,
    zone: zone(),
    stats: { ...game.stats },
    pickups: game.pickups.map((p) => ({ kind: p.kind, a: p.a, x: p.x })),
    hazards: game.hazards.map((hz) => ({ kind: hz.kind, x: hz.x, hit: hz.hit })),
    geo: { px: geo.px, L: geo.L },
  };
}

/** Test/debug hook: drive the throttle without a pointer. */
export function setThrottle(on) { game.throttle = !!on; }

/** Test hook: skip the 3-2-1. */
export function skipCountdown() {
  if (game.phase === 'countdown') { game.countdown = 0; step(SIM_STEP); }
}

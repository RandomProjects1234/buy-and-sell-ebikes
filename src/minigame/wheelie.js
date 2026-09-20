// ---------------------------------------------------------------------------
// WHEELIE MODE
// ---------------------------------------------------------------------------
// A 40 second balance game on the shop treadmill. Hold to add throttle, let go
// to drop the nose. Live in the sweet zone and the multiplier climbs; loop it
// past vertical and you are on the floor.
//
// The loop runs off the shared clock (worker backed) so it keeps ticking even
// when the tab is hidden and requestAnimationFrame has stopped.

import { state } from '../core/state.js';
import { addMoney, incomeScale, wheelieMult, wheelieZoneBonus, wheelieSaves } from '../systems/economy.js';
import { fmtMoney, fmtNum } from '../core/format.js';
import { play } from '../core/audio.js';
import { emit, EVENTS } from '../core/events.js';
import { burst, shake, floatText } from '../ui/fx.js';

export const RUN_SECONDS = 40;
const ZONE_LOW = 34;
const ZONE_HIGH = 62;
const CRASH_ANGLE = 88;
const GRAVITY = 96;        // deg/s^2 pulling the nose down
const THROTTLE = 168;      // deg/s^2 from the motor
const DAMPING = 0.985;
const MAX_MULT = 14;

const game = {
  phase: 'idle',           // idle | running | crashed | done
  angle: 0,
  angVel: 0,
  time: 0,
  score: 0,
  mult: 1,
  best: 0,
  throttle: false,
  saves: 0,
  nitro: 0,
  belt: 0,
  pickups: [],
  spawnTimer: 0,
  payout: 0,
  shakeT: 0,
};

let canvas = null;
let ctx = null;
let dpr = 1;

export function isRunning() { return game.phase === 'running'; }
export function phase() { return game.phase; }

export function attach(canvasEl) {
  canvas = canvasEl;
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);

  const down = (ev) => { if (game.phase === 'running') { ev.preventDefault(); game.throttle = true; } };
  const up = () => { game.throttle = false; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointerleave', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function keyHandler(ev, downState) {
  if (game.phase !== 'running') return;
  if (ev.code === 'Space' || ev.code === 'ArrowUp' || ev.key === ' ') {
    ev.preventDefault();
    game.throttle = downState;
  }
}

window.addEventListener('keydown', (e) => keyHandler(e, true));
window.addEventListener('keyup', (e) => keyHandler(e, false));

function resize() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(320, Math.round(rect.width * dpr));
  canvas.height = Math.max(200, Math.round(rect.height * dpr));
}

export function startRun() {
  if (game.phase === 'running') return;
  game.phase = 'running';
  game.angle = 8;
  game.angVel = 0;
  game.time = RUN_SECONDS;
  game.score = 0;
  game.mult = 1;
  game.nitro = 0;
  game.pickups = [];
  game.spawnTimer = 0.6;
  game.saves = wheelieSaves();
  game.payout = 0;
  game.throttle = false;
  play('nitro');
  state.wheelie.runs += 1;
}

function zone() {
  const pad = wheelieZoneBonus();
  return { low: ZONE_LOW - pad, high: ZONE_HIGH + pad };
}

// A flawless 40 second run scores about 17k. Dividing by this makes that worth
// roughly 8x the player's current income stake, so the rig always beats idling
// for those 40 seconds without ever replacing the main loop.
const SCORE_PER_STAKE = 2000;

export function payoutFor(score) {
  return incomeScale() * (score / SCORE_PER_STAKE) * wheelieMult();
}

function endRun(crashed) {
  game.phase = crashed ? 'crashed' : 'done';
  game.throttle = false;

  const payout = payoutFor(game.score) * (crashed ? 0.6 : 1);
  game.payout = payout;
  if (payout > 0) addMoney(payout, 'wheelie');
  state.wheelie.earned += payout;
  if (game.score > state.wheelie.best) state.wheelie.best = Math.floor(game.score);

  emit(EVENTS.WHEELIE_END, { score: game.score, payout, crashed });
  if (crashed) {
    play('crash');
    shake(12, 400);
  } else {
    play('rare');
  }
}

function spawnPickup(w) {
  const roll = Math.random();
  const kind = roll < 0.18 ? 'nitro' : 'coin';
  game.pickups.push({
    kind,
    x: w + 40,
    y: kind === 'nitro' ? 0.36 + Math.random() * 0.2 : 0.3 + Math.random() * 0.42,
    got: false,
    spin: Math.random() * 6,
  });
}

/** Simulation step - called from the shared clock, not from rAF. */
export function update(dt) {
  if (game.phase !== 'running') {
    game.belt += dt * 120;
    return;
  }
  const step = Math.min(0.05, dt);
  const z = zone();

  // --- balance physics
  const accel = (game.throttle ? THROTTLE : 0) - GRAVITY * Math.cos((game.angle * Math.PI) / 180);
  game.angVel = (game.angVel + accel * step) * Math.pow(DAMPING, step * 60);
  game.angle += game.angVel * step;

  if (game.angle < 0) { game.angle = 0; game.angVel = Math.max(0, game.angVel); }

  if (game.angle > CRASH_ANGLE) {
    if (game.saves > 0) {
      game.saves -= 1;
      game.angle = 48;
      game.angVel = -10;
      game.mult = Math.max(1, game.mult * 0.5);
      play('error');
      shake(7, 220);
    } else {
      endRun(true);
      return;
    }
  }

  // --- scoring
  const inZone = game.angle >= z.low && game.angle <= z.high;
  const nitroMult = game.nitro > 0 ? 2 : 1;
  if (inZone) {
    game.mult = Math.min(MAX_MULT, game.mult + 0.42 * step);
    game.score += game.mult * nitroMult * 26 * step;
  } else if (game.angle > 6) {
    game.mult = Math.max(1, game.mult - 0.75 * step);
    game.score += game.mult * nitroMult * 7 * step;
  } else {
    game.mult = Math.max(1, game.mult - 2.2 * step);
  }
  if (game.nitro > 0) game.nitro -= step;

  // --- pickups ride the belt
  const w = canvas ? canvas.width / dpr : 640;
  game.belt += step * 320;
  game.spawnTimer -= step;
  if (game.spawnTimer <= 0) {
    spawnPickup(w);
    game.spawnTimer = 0.75 + Math.random() * 0.9;
  }

  const h = canvas ? canvas.height / dpr : 320;
  const nose = nosePoint(w, h);
  for (const p of game.pickups) {
    p.x -= 320 * step;
    p.spin += step * 4;
    if (p.got) continue;
    const py = h * p.y;
    if (Math.hypot(p.x - nose.x, py - nose.y) < 34) {
      p.got = true;
      if (p.kind === 'nitro') {
        game.nitro = 5;
        play('nitro');
        game.score += 60;
      } else {
        game.score += 40 * game.mult;
        play('coin');
      }
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        burst(rect.left + p.x, rect.top + py, {
          count: p.kind === 'nitro' ? 14 : 8,
          colors: p.kind === 'nitro' ? ['#8ef6ff', '#fff'] : ['#ffd166'],
          power: 0.7,
        });
      }
    }
  }
  game.pickups = game.pickups.filter((p) => p.x > -60 && !p.got);

  game.time -= step;
  if (game.time <= 0) { game.time = 0; endRun(false); }
}

const REAR_R = 26;
const BELT_Y = 0.82;

// The rear wheel sits on the belt, so the pivot is one radius above it.
function pivot(w, h) { return { x: w * 0.3, y: h * BELT_Y - REAR_R }; }

function nosePoint(w, h) {
  const p = pivot(w, h);
  const len = Math.min(w, h) * 0.34;
  const a = (game.angle * Math.PI) / 180;
  return { x: p.x + Math.cos(a) * len, y: p.y - Math.sin(a) * len };
}

// --- drawing ----------------------------------------------------------------

function drawBelt(w, h) {
  const y = h * BELT_Y;
  ctx.fillStyle = '#10141c';
  ctx.fillRect(0, y, w, h - y);
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = 3;
  const spacing = 46;
  const offset = -(game.belt % spacing);
  for (let x = offset; x < w + spacing; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.lineTo(x - 16, h - 8);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,209,102,.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
}

function drawBike(w, h) {
  const p = pivot(w, h);
  const a = (game.angle * Math.PI) / 180;
  const len = Math.min(w, h) * 0.34;
  const nose = nosePoint(w, h);
  const inZone = game.angle >= zone().low && game.angle <= zone().high;
  const accent = game.nitro > 0 ? '#8ef6ff' : (inZone ? '#49c97a' : '#ff8fa3');

  // rear wheel (on the belt)
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(game.belt / 30);
  ctx.strokeStyle = '#1b1f27';
  ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(0, 0, REAR_R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i += 1) {
    const ang = (Math.PI * 2 * i) / 6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * 20, Math.sin(ang) * 20); ctx.stroke();
  }
  ctx.restore();

  // frame
  ctx.strokeStyle = '#d7dbe6';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(nose.x, nose.y);
  ctx.stroke();

  // seat + bars
  const mid = { x: p.x + Math.cos(a) * len * 0.45, y: p.y - Math.sin(a) * len * 0.45 };
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(mid.x, mid.y);
  ctx.lineTo(mid.x - Math.sin(a) * 26, mid.y - Math.cos(a) * 26);
  ctx.stroke();

  // rider
  const seat = { x: mid.x - Math.sin(a) * 26, y: mid.y - Math.cos(a) * 26 };
  ctx.fillStyle = '#ffd166';
  ctx.beginPath(); ctx.arc(seat.x - 6, seat.y - 16, 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(seat.x - 6, seat.y - 8);
  ctx.lineTo(nose.x - Math.sin(a) * 10, nose.y - Math.cos(a) * 10);
  ctx.stroke();

  // front wheel
  ctx.save();
  ctx.translate(nose.x, nose.y);
  ctx.rotate(game.belt / 30);
  ctx.strokeStyle = '#1b1f27';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    const ang = (Math.PI * 2 * i) / 5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * 16, Math.sin(ang) * 16); ctx.stroke();
  }
  ctx.restore();

  // throttle flare
  if (game.throttle && game.phase === 'running') {
    ctx.fillStyle = 'rgba(255,171,46,.7)';
    for (let i = 0; i < 5; i += 1) {
      const s = 4 + Math.random() * 9;
      ctx.beginPath();
      ctx.arc(p.x - 22 - Math.random() * 30, p.y + 8 + Math.random() * 10, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawMeter(w, h) {
  const z = zone();
  const x = w - 46;
  const top = h * 0.12;
  const bottom = h * 0.8;
  const span = bottom - top;
  const toY = (deg) => bottom - (deg / 90) * span;

  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.fillRect(x, top, 18, span);
  ctx.fillStyle = 'rgba(73,201,122,.35)';
  ctx.fillRect(x, toY(z.high), 18, toY(z.low) - toY(z.high));
  ctx.fillStyle = 'rgba(255,77,109,.35)';
  ctx.fillRect(x, top, 18, toY(CRASH_ANGLE) - top + 6);

  const y = toY(Math.min(90, game.angle));
  ctx.fillStyle = game.angle >= z.low && game.angle <= z.high ? '#49c97a' : '#ffd166';
  ctx.fillRect(x - 6, y - 3, 30, 6);

  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SWEET', x + 9, toY((z.low + z.high) / 2) + 4);
}

function drawPickups(w, h) {
  for (const p of game.pickups) {
    const y = h * p.y;
    if (p.kind === 'nitro') {
      ctx.save();
      ctx.translate(p.x, y);
      ctx.rotate(Math.sin(p.spin) * 0.3);
      ctx.fillStyle = 'rgba(142,246,255,.22)';
      ctx.fillRect(-26, -26, 52, 52);
      ctx.strokeStyle = '#8ef6ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(-26, -26, 52, 52);
      ctx.fillStyle = '#8ef6ff';
      ctx.font = '700 13px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('NITRO', 0, 5);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(p.x, y);
      ctx.scale(Math.abs(Math.cos(p.spin)) * 0.65 + 0.35, 1);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b8860b';
      ctx.font = '700 13px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 5);
      ctx.restore();
    }
  }
}

function drawHud(w, h) {
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8ecf5';
  ctx.font = '700 26px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(fmtNum(Math.floor(game.score), { int: true }) + ' pts', 20, 40);

  ctx.font = '600 14px ui-monospace, monospace';
  ctx.fillStyle = game.nitro > 0 ? '#8ef6ff' : '#9aa3b5';
  ctx.fillText(`x${game.mult.toFixed(2)}${game.nitro > 0 ? '  NITRO x2' : ''}`, 20, 62);

  // timer bar
  const barW = Math.min(240, w * 0.4);
  ctx.fillStyle = 'rgba(255,255,255,.1)';
  ctx.fillRect(20, 76, barW, 8);
  ctx.fillStyle = game.time < 8 ? '#ff4d6d' : '#49c97a';
  ctx.fillRect(20, 76, barW * (game.time / RUN_SECONDS), 8);

  ctx.fillStyle = '#6f7889';
  ctx.font = '600 12px ui-monospace, monospace';
  ctx.fillText(`${game.time.toFixed(1)}s`, 24 + barW, 85);

  if (game.saves > 0) {
    ctx.fillStyle = '#ffab2e';
    ctx.fillText(`WHEELIE BAR x${game.saves}`, 20, 104);
  }

  const est = payoutFor(game.score);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffd166';
  ctx.font = '700 18px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(fmtMoney(est), w - 60, 40);
  ctx.fillStyle = '#6f7889';
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.fillText('BANKING', w - 60, 56);
}

function drawOverlay(w, h) {
  ctx.fillStyle = 'rgba(8,10,15,.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';

  if (game.phase === 'idle') {
    ctx.fillStyle = '#e8ecf5';
    ctx.font = '800 30px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('WHEELIE MODE', w / 2, h / 2 - 26);
    ctx.fillStyle = '#9aa3b5';
    ctx.font = '500 15px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Hold anywhere (or SPACE) to feed it throttle.', w / 2, h / 2 + 4);
    ctx.fillText('Stay in the green band. Past vertical, you are on the floor.', w / 2, h / 2 + 28);
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Press START', w / 2, h / 2 + 62);
  } else {
    const crashed = game.phase === 'crashed';
    ctx.fillStyle = crashed ? '#ff4d6d' : '#49c97a';
    ctx.font = '800 30px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(crashed ? 'LOOPED IT' : 'CLEAN RUN', w / 2, h / 2 - 30);
    ctx.fillStyle = '#e8ecf5';
    ctx.font = '700 22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${fmtNum(Math.floor(game.score), { int: true })} pts`, w / 2, h / 2 + 2);
    ctx.fillStyle = '#ffd166';
    ctx.font = '800 26px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`+${fmtMoney(game.payout)}`, w / 2, h / 2 + 36);
    ctx.fillStyle = '#9aa3b5';
    ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(crashed ? 'Crash payout is cut to 60%.' : 'Full payout - you held it to the bell.', w / 2, h / 2 + 62);
  }
}

export function draw() {
  if (!ctx || !canvas) return;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // backdrop
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#151a24');
  grad.addColorStop(1, '#0b0e14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // garage clutter
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let i = 0; i < 6; i += 1) {
    const x = ((i * 137 + game.belt * 0.12) % (w + 160)) - 80;
    ctx.fillRect(x, h * 0.5, 60, h * 0.32);
  }

  drawBelt(w, h);
  drawPickups(w, h);
  drawBike(w, h);
  drawMeter(w, h);
  drawHud(w, h);
  if (game.phase !== 'running') drawOverlay(w, h);
}

export function snapshot() {
  return {
    phase: game.phase,
    score: game.score,
    payout: game.payout,
    best: state.wheelie.best,
    angle: game.angle,
    mult: game.mult,
    time: game.time,
    throttle: game.throttle,
    zone: zone(),
    pickups: game.pickups.length,
  };
}

/** Test/debug hook: drive the throttle without a pointer. */
export function setThrottle(on) { game.throttle = !!on; }

export function resetToIdle() {
  game.phase = 'idle';
  game.score = 0;
  game.angle = 0;
  game.angVel = 0;
  game.pickups = [];
}

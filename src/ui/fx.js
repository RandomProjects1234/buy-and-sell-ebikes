// ---------------------------------------------------------------------------
// JUICE
// ---------------------------------------------------------------------------
// Floating numbers, particle bursts, screen shake, toasts and the big-win
// takeover. All of it is skipped when "reduce motion" is on.

import { state } from '../core/state.js';

let fxLayer = null;
let toastLayer = null;
let shakeTarget = null;
let shakeUntil = 0;
let shakePower = 0;

export function initFx() {
  fxLayer = document.getElementById('fx-layer');
  toastLayer = document.getElementById('toast-layer');
  shakeTarget = document.getElementById('app');
}

const motionOk = () => !state.settings.reduceMotion;

/** Rising "+$12.4K" text at a screen position. */
export function floatText(x, y, text, kind = 'money') {
  if (!fxLayer || !motionOk()) return;
  const el = document.createElement('div');
  el.className = `float float-${kind}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty('--drift', `${(Math.random() * 2 - 1) * 34}px`);
  fxLayer.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

/** Particle burst. `power` scales speed and lifetime. */
export function burst(x, y, { count = 14, colors = ['#ffd166'], power = 1, size = 7 } = {}) {
  if (!fxLayer || !motionOk()) return;
  for (let i = 0; i < count; i += 1) {
    const p = document.createElement('div');
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = (40 + Math.random() * 90) * power;
    p.className = 'particle';
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = colors[i % colors.length];
    p.style.width = p.style.height = `${size * (0.6 + Math.random() * 0.8)}px`;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 30 * power}px`);
    p.style.setProperty('--life', `${(0.5 + Math.random() * 0.5) * power}s`);
    fxLayer.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

/** Confetti rain from the top of the screen - for the genuinely big moments. */
export function confetti({ count = 60, colors = ['#ffd166', '#ff4d6d', '#3d9dff', '#49c97a', '#b06bff'] } = {}) {
  if (!fxLayer || !motionOk()) return;
  const w = window.innerWidth;
  for (let i = 0; i < count; i += 1) {
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.left = `${Math.random() * w}px`;
    p.style.top = `${-20 - Math.random() * 120}px`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
    p.style.setProperty('--fall', `${window.innerHeight + 140}px`);
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    fxLayer.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

export function shake(power = 6, ms = 320) {
  if (!shakeTarget || !motionOk()) return;
  shakePower = Math.max(shakePower, power);
  shakeUntil = Math.max(shakeUntil, performance.now() + ms);
}

/** Called every frame by the render loop. */
export function updateShake(now) {
  if (!shakeTarget) return;
  if (now > shakeUntil) {
    if (shakePower !== 0) {
      shakePower = 0;
      shakeTarget.style.transform = '';
    }
    return;
  }
  const decay = (shakeUntil - now) / 320;
  const p = shakePower * Math.min(1, decay);
  shakeTarget.style.transform =
    `translate(${(Math.random() * 2 - 1) * p}px, ${(Math.random() * 2 - 1) * p}px)`;
}

export function flash(color = 'rgba(255,255,255,.55)', ms = 420) {
  if (!fxLayer || !motionOk()) return;
  const el = document.createElement('div');
  el.className = 'screen-flash';
  el.style.background = color;
  el.style.animationDuration = `${ms}ms`;
  fxLayer.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

let toastCount = 0;
export function toast(text, kind = 'info') {
  if (!toastLayer) return;
  // Never let a runaway loop paper over the screen.
  if (toastCount > 6) toastLayer.firstChild?.remove();
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = text;
  toastLayer.appendChild(el);
  toastCount += 1;
  const kill = () => { el.remove(); toastCount -= 1; };
  setTimeout(() => { el.classList.add('toast-out'); setTimeout(kill, 400); }, 3200);
}

const BIG_WIN_STYLE = {
  nuclear: { color: '#ff4d6d', flash: 'rgba(255,77,109,.5)', shake: 16 },
  secret:  { color: '#8ef6ff', flash: 'rgba(142,246,255,.5)', shake: 14 },
  void:    { color: '#8f7bff', flash: 'rgba(60,30,160,.6)', shake: 18 },
  fossil:  { color: '#f0dcae', flash: 'rgba(255,190,90,.55)', shake: 22 },
  mythic:  { color: '#ffab2e', flash: 'rgba(255,171,46,.4)', shake: 10 },
  ipo:     { color: '#49c97a', flash: 'rgba(73,201,122,.45)', shake: 12 },
};

export function bigWin({ text, sub, kind = 'mythic' }) {
  const style = BIG_WIN_STYLE[kind] || BIG_WIN_STYLE.mythic;
  flash(style.flash, 620);
  shake(style.shake, 700);
  confetti({ count: kind === 'secret' ? 90 : 60 });
  if (!fxLayer) return;

  const el = document.createElement('div');
  el.className = 'bigwin';
  el.style.setProperty('--bw', style.color);
  el.innerHTML = `<div class="bigwin-card">
      <div class="bigwin-kicker">${kind === 'secret' ? 'SECRET BUILD' : 'MILESTONE'}</div>
      <div class="bigwin-title">${text}</div>
      <div class="bigwin-sub">${sub || ''}</div>
    </div>`;
  fxLayer.appendChild(el);
  setTimeout(() => { el.classList.add('bigwin-out'); setTimeout(() => el.remove(), 600); }, 2600);
}

/** Pulse any element by selector - used for "you just bought this" feedback. */
export function pop(el) {
  if (!el || !motionOk()) return;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

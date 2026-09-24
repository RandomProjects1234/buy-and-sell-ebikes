// ---------------------------------------------------------------------------
// BIKE ART
// ---------------------------------------------------------------------------
// Every build in the game is drawn from the same two SVG silhouettes, recoloured
// and re-dressed by tier: scrap builds are rusty copper with a visible weld, and by
// the nuclear tier there is a containment core pulsing between the cranks.

import { TIERS } from '../data/parts.js';

const PALETTES = [
  { body: '#d0743f', accent: '#ffd0a0', rim: '#8a4524', tyre: '#1c1230' },
  { body: '#27c06a', accent: '#9dffc4', rim: '#177a44', tyre: '#1a1230' },
  { body: '#2f8cf0', accent: '#a5e4ff', rim: '#1d5fb0', tyre: '#18112e' },
  { body: '#9a55f5', accent: '#e4c4ff', rim: '#6536b8', tyre: '#170f2c' },
  { body: '#ff9a1f', accent: '#ffe7a0', rim: '#b8680f', tyre: '#160e28' },
  { body: '#ff3b62', accent: '#ffb3c3', rim: '#a01c3a', tyre: '#150c24' },
];

function palette(tier) { return PALETTES[Math.min(PALETTES.length - 1, Math.max(0, tier | 0))]; }

/** The same tier colours, for things drawn outside SVG (the wheelie canvas). */
export function bikePalette(tier) { return palette(tier); }

function spokes(cx, cy, r, count, color) {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    const a = (Math.PI * 2 * i) / count;
    out += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * r).toFixed(1)}" y2="${(cy + Math.sin(a) * r).toFixed(1)}" stroke="${color}" stroke-width="2" opacity=".75"/>`;
  }
  return out;
}

function wheel(cx, cy, r, p, tier) {
  const glow = tier >= 4 ? `<circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="none" stroke="${p.accent}" stroke-width="2" opacity=".35" class="art-pulse"/>` : '';
  return `${glow}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.tyre}" stroke-width="10"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 6}" fill="none" stroke="${p.rim}" stroke-width="4"/>
    <g class="art-wheel" style="transform-origin:${cx}px ${cy}px">${spokes(cx, cy, r - 8, tier >= 3 ? 6 : 8, p.accent)}</g>
    <circle cx="${cx}" cy="${cy}" r="5" fill="${p.accent}"/>`;
}

function auraFor(tier, secret) {
  if (secret) {
    return `<g class="art-secret">
      <circle cx="170" cy="120" r="96" fill="none" stroke="#8ef6ff" stroke-width="1.5" opacity=".5"/>
      <circle cx="170" cy="120" r="112" fill="none" stroke="#8ef6ff" stroke-width="1" opacity=".25"/>
    </g>`;
  }
  if (tier >= 5) {
    return `<g class="art-pulse">
      <circle cx="170" cy="120" r="88" fill="none" stroke="#ff4d6d" stroke-width="2" opacity=".35"/>
      <circle cx="170" cy="120" r="104" fill="none" stroke="#ff8fa3" stroke-width="1" opacity=".2"/>
    </g>`;
  }
  return '';
}

function bolt(x, y, color) {
  return `<path d="M${x} ${y} l-9 16 h8 l-6 14 l18 -20 h-9 l7 -10 z" fill="${color}" opacity=".9" class="art-pulse"/>`;
}

function bikeBody(tier, secret) {
  const p = palette(tier);
  const core = tier >= 5
    ? `<circle cx="170" cy="152" r="13" fill="#fff3f5" class="art-core"/><circle cx="170" cy="152" r="21" fill="none" stroke="${p.accent}" stroke-width="2" class="art-pulse"/>`
    : `<circle cx="170" cy="152" r="9" fill="${p.accent}"/>`;

  return `
    ${auraFor(tier, secret)}
    ${wheel(85, 150, 42, p, tier)}
    ${wheel(262, 150, 42, p, tier)}

    <!-- battery on the down tube -->
    <g transform="rotate(-27 201 136)">
      <rect x="166" y="124" width="72" height="24" rx="7" fill="${p.rim}" stroke="${p.accent}" stroke-width="2"/>
      <rect x="172" y="131" width="46" height="10" rx="5" fill="${p.accent}" opacity=".85" class="art-charge"/>
    </g>

    <!-- frame -->
    <g stroke="${p.body}" stroke-width="9" stroke-linecap="round" fill="none">
      <line x1="146" y1="86" x2="170" y2="152"/>
      <line x1="146" y1="86" x2="218" y2="78"/>
      <line x1="170" y1="152" x2="232" y2="120"/>
      <line x1="146" y1="86" x2="85" y2="150"/>
      <line x1="170" y1="152" x2="85" y2="150"/>
      <line x1="232" y1="120" x2="262" y2="150"/>
      <line x1="218" y1="78" x2="232" y2="120"/>
    </g>

    <!-- hub motor -->
    <circle cx="85" cy="150" r="17" fill="${p.rim}" stroke="${p.accent}" stroke-width="3"/>
    <circle cx="85" cy="150" r="7" fill="${p.accent}" opacity=".9"/>

    <!-- cranks + drive -->
    ${core}
    <line x1="170" y1="152" x2="188" y2="168" stroke="${p.accent}" stroke-width="5" stroke-linecap="round" class="art-crank"/>

    <!-- saddle + bars -->
    <path d="M128 80 q16 -8 30 2 q-14 6 -30 -2 z" fill="${p.rim}" stroke="${p.accent}" stroke-width="2"/>
    <line x1="146" y1="86" x2="140" y2="72" stroke="${p.body}" stroke-width="7" stroke-linecap="round"/>
    <line x1="218" y1="78" x2="214" y2="62" stroke="${p.body}" stroke-width="7" stroke-linecap="round"/>
    <line x1="192" y1="60" x2="238" y2="66" stroke="${p.body}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="238" cy="66" r="5" fill="${p.accent}"/>
    <rect x="200" y="46" width="30" height="14" rx="4" fill="${p.rim}" stroke="${p.accent}" stroke-width="2"/>
    <rect x="204" y="50" width="${tier >= 3 ? 22 : 12}" height="6" rx="3" fill="${p.accent}" class="art-charge"/>
    ${tier >= 4 ? bolt(272, 74, p.accent) : ''}
  `;
}

function scooterBody(tier, secret) {
  const p = palette(tier);
  return `
    ${auraFor(tier, secret)}
    ${wheel(96, 158, 31, p, tier)}
    ${wheel(252, 158, 31, p, tier)}

    <!-- deck + battery -->
    <path d="M92 150 h168 q10 0 10 8 v8 q0 8 -10 8 h-168 q-10 0 -10 -8 v-8 q0 -8 10 -8 z" fill="${p.body}"/>
    <rect x="112" y="154" width="120" height="10" rx="5" fill="${p.accent}" opacity=".8" class="art-charge"/>
    <path d="M254 152 l14 -86" stroke="${p.body}" stroke-width="11" stroke-linecap="round"/>
    <line x1="244" y1="62" x2="292" y2="70" stroke="${p.body}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="292" cy="70" r="6" fill="${p.accent}"/>
    <rect x="248" y="44" width="32" height="14" rx="4" fill="${p.rim}" stroke="${p.accent}" stroke-width="2"/>
    <rect x="252" y="48" width="${tier >= 3 ? 24 : 13}" height="6" rx="3" fill="${p.accent}" class="art-charge"/>

    <!-- hub motor -->
    <circle cx="96" cy="158" r="14" fill="${p.rim}" stroke="${p.accent}" stroke-width="3"/>
    ${tier >= 5
      ? `<circle cx="96" cy="158" r="7" fill="#fff3f5" class="art-core"/>`
      : `<circle cx="96" cy="158" r="6" fill="${p.accent}"/>`}
    ${tier >= 4 ? bolt(300, 86, p.accent) : ''}
  `;
}

/**
 * Full SVG markup for a build.
 * @param {object|null} item - a garage/showroom item; null draws an empty stand
 */
export function bikeSVG(item, { className = '' } = {}) {
  const tier = item ? item.tier : 0;
  const secret = item ? /kirkin/.test(item.bp) : false;
  const body = item && item.kind === 'scooter' ? scooterBody(tier, secret) : bikeBody(tier, secret);
  const p = palette(tier);
  return `<svg class="bike-art ${className}" viewBox="0 0 340 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${item ? item.name : 'Empty stand'}">
    <defs>
      <radialGradient id="floorGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${p.accent}" stop-opacity=".35"/>
        <stop offset="100%" stop-color="${p.accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="170" cy="196" rx="140" ry="16" fill="url(#floorGlow)"/>
    <g class="bike-bob">${body}</g>
  </svg>`;
}

export function tierColor(tier) {
  return TIERS[Math.min(TIERS.length - 1, Math.max(0, tier | 0))].color;
}

export function tierName(tier) {
  return TIERS[Math.min(TIERS.length - 1, Math.max(0, tier | 0))].name;
}

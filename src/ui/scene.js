// ---------------------------------------------------------------------------
// SHOWROOM SCENE
// ---------------------------------------------------------------------------
// The backdrop behind the bike on the stage: a sunset sky, a striped sun going
// down behind the city, and a neon floor running off to the horizon.
//
// It uses the same 340x210 viewBox as bikeArt.js so the two line up exactly,
// then deliberately draws far outside that box (the svg is overflow:visible)
// so the sky reaches up behind the bank and the floor runs down behind the
// bike's name. The stage clips whatever is left over.
//
// The sky follows the tier of the bike in the window, so putting a better bike
// on the stand visibly changes the shop: a warm afternoon for scrap, a violet
// night for exotics, a red reactor dusk for nuclear builds.

const SKIES = [
  // top, upper, middle, horizon, sun top, sun bottom, floor line
  { sky: ['#2b1d6b', '#6a3fc4', '#e0679f', '#ffb86b'], sun: ['#fff3a3', '#ff8a5c'], grid: '#ff7ac8' },
  { sky: ['#123a6b', '#2b8fc4', '#6fd6b0', '#e8f59a'], sun: ['#ffffc2', '#ffc94d'], grid: '#58f0b0' },
  { sky: ['#0e1f5e', '#2f5fd8', '#5ec8ff', '#b8f1ff'], sun: ['#ffffff', '#8fe3ff'], grid: '#5ec8ff' },
  { sky: ['#1c0b4d', '#5a23b8', '#b44cf0', '#ff8ee0'], sun: ['#ffe0ff', '#ff6fd8'], grid: '#d27bff' },
  { sky: ['#3a1650', '#b8367a', '#ff7a3d', '#ffd166'], sun: ['#fff6c2', '#ffae2e'], grid: '#ffb13d' },
  { sky: ['#2a0620', '#8a0f3c', '#ff3d5e', '#ffb199'], sun: ['#fff2f4', '#ff4d6d'], grid: '#ff5577' },
];

function skyFor(tier) { return SKIES[Math.min(SKIES.length - 1, Math.max(0, tier | 0))]; }

// Fixed layouts, so the city does not reshuffle every time the bike changes.
const STARS = [
  [-80, -250, 1.4], [-20, -190, 1], [40, -270, 1.6], [96, -210, 1.1], [150, -290, 1.3],
  [214, -236, 1], [262, -280, 1.5], [318, -206, 1.2], [372, -262, 1], [420, -222, 1.4],
  [-60, -140, 0.9], [8, -96, 1.2], [70, -150, 0.8], [250, -120, 1], [300, -80, 0.9],
  [360, -150, 1.1], [410, -100, 0.8], [-100, -60, 1],
];

const BUILDINGS = [
  // x, width, height (up from the horizon)
  [-120, 34, 34], [-84, 22, 52], [-60, 30, 28], [-28, 18, 64], [-8, 34, 40],
  [28, 24, 58], [54, 30, 30], [86, 20, 46], [252, 22, 50], [276, 34, 32],
  [312, 20, 66], [334, 30, 38], [366, 24, 54], [392, 36, 30], [430, 30, 48],
];

const HORIZON = 142;
const VANISH_X = 170;

function stars() {
  return STARS.map(([x, y, r], i) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" class="sc-star" style="animation-delay:${(i * 0.37) % 3}s"/>`).join('');
}

function clouds() {
  const puff = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">
      <ellipse cx="0" cy="0" rx="34" ry="9"/><ellipse cx="-14" cy="-6" rx="16" ry="9"/>
      <ellipse cx="10" cy="-8" rx="20" ry="11"/></g>`;
  return `<g class="sc-clouds" fill="#fff" opacity=".22">
      ${puff(-40, 40, 1)}${puff(120, -20, 0.8)}${puff(300, 30, 1.1)}${puff(470, -40, 0.9)}
    </g>`;
}

function sun() {
  // The classic sunset sun: a disc with bands cut out of its lower half.
  const bands = [0, 1, 2, 3, 4, 5].map((i) => {
    const y = 104 + i * 7.5;
    return `<rect x="90" y="${y}" width="160" height="${1.4 + i * 0.9}" fill="#000"/>`;
  }).join('');
  return `
    <circle cx="170" cy="112" r="92" fill="url(#scSunGlow)"/>
    <mask id="scSunMask"><rect x="60" y="20" width="220" height="140" fill="#fff"/>${bands}</mask>
    <circle cx="170" cy="112" r="56" fill="url(#scSun)" mask="url(#scSunMask)" class="sc-sun"/>`;
}

function city(p) {
  let out = '';
  BUILDINGS.forEach(([x, w, h], i) => {
    const top = HORIZON - h;
    out += `<rect x="${x}" y="${top}" width="${w}" height="${h + 2}" fill="url(#scCity)"/>`;
    // A few lit windows per building, deterministic so they stay put.
    for (let row = 0; row < Math.floor(h / 11); row += 1) {
      for (let col = 0; col < Math.floor(w / 9); col += 1) {
        if ((i * 7 + row * 3 + col * 5) % 4 !== 0) continue;
        const color = (row + col + i) % 3 === 0 ? '#8ef6ff' : '#ffe27a';
        out += `<rect x="${x + 3 + col * 9}" y="${top + 5 + row * 11}" width="4" height="5" rx="1" fill="${color}" opacity=".85"/>`;
      }
    }
  });
  // Rolling hills in front of the sun, behind the towers.
  return `
    <path d="M-160 ${HORIZON} Q-40 96 70 ${HORIZON - 12} T300 ${HORIZON - 8} T520 ${HORIZON} Z" fill="${p.sky[1]}" opacity=".55"/>
    ${out}`;
}

function floor(p) {
  let lines = '';
  // Horizontal lines bunch up towards the horizon, like real perspective.
  for (let i = 1; i <= 14; i += 1) {
    const y = HORIZON + i * i * 2.2;
    lines += `<line x1="-200" y1="${y.toFixed(1)}" x2="540" y2="${y.toFixed(1)}"/>`;
  }
  // Verticals fan out from the vanishing point.
  for (let i = -12; i <= 12; i += 1) {
    lines += `<line x1="${VANISH_X + i * 6}" y1="${HORIZON}" x2="${VANISH_X + i * 70}" y2="560"/>`;
  }
  return `
    <rect x="-220" y="${HORIZON}" width="780" height="440" fill="url(#scFloor)"/>
    <g stroke="${p.grid}" stroke-width="1.1" opacity=".42" class="sc-grid">${lines}</g>
    <line x1="-220" y1="${HORIZON}" x2="560" y2="${HORIZON}" stroke="${p.grid}" stroke-width="2" opacity=".9"/>
    <rect x="-220" y="${HORIZON}" width="780" height="440" fill="url(#scFloorFade)"/>
    <!-- the turntable the bike stands on -->
    <ellipse cx="170" cy="198" rx="150" ry="17" fill="url(#scStand)" opacity=".95"/>
    <ellipse cx="170" cy="196" rx="146" ry="14" fill="none" stroke="${p.grid}" stroke-width="2" opacity=".75" class="sc-rim"/>`;
}

/** Full SVG markup for the stage backdrop. */
export function sceneSVG(tier = 0) {
  const p = skyFor(tier);
  return `<svg class="stage-scene" viewBox="0 0 340 210" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="scSky" x1="0" y1="-330" x2="0" y2="${HORIZON}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="${p.sky[0]}"/>
        <stop offset=".45" stop-color="${p.sky[1]}"/>
        <stop offset=".78" stop-color="${p.sky[2]}"/>
        <stop offset="1" stop-color="${p.sky[3]}"/>
      </linearGradient>
      <linearGradient id="scSun" x1="0" y1="56" x2="0" y2="168" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="${p.sun[0]}"/>
        <stop offset="1" stop-color="${p.sun[1]}"/>
      </linearGradient>
      <radialGradient id="scSunGlow">
        <stop offset="0" stop-color="${p.sun[1]}" stop-opacity=".55"/>
        <stop offset="1" stop-color="${p.sun[1]}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="scCity" x1="0" y1="60" x2="0" y2="${HORIZON}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#2a1458"/>
        <stop offset="1" stop-color="#150a33"/>
      </linearGradient>
      <linearGradient id="scFloor" x1="0" y1="${HORIZON}" x2="0" y2="420" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#2a0f55"/>
        <stop offset="1" stop-color="#0e0626"/>
      </linearGradient>
      <linearGradient id="scFloorFade" x1="0" y1="200" x2="0" y2="380" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#0e0626" stop-opacity="0"/>
        <stop offset="1" stop-color="#0e0626" stop-opacity=".92"/>
      </linearGradient>
      <radialGradient id="scStand">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".35"/>
        <stop offset=".6" stop-color="${p.grid}" stop-opacity=".28"/>
        <stop offset="1" stop-color="${p.grid}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect x="-220" y="-340" width="780" height="${HORIZON + 342}" fill="url(#scSky)"/>
    ${stars()}
    ${clouds()}
    ${sun()}
    ${city(p)}
    ${floor(p)}
  </svg>`;
}

// Index panel - the catalogue. Everything in the game in one place: every
// blueprint with what it needs, every part with what you are holding, every
// crate with its odds. Things you have not met yet stay redacted.

import { state } from '../../core/state.js';
import { BLUEPRINTS, blueprintPartCount } from '../../data/blueprints.js';
import { PARTS, PART_IDS, TIERS, SLOTS, SLOT_BY_ID } from '../../data/parts.js';
import { CRATES } from '../../data/crates.js';
import { blueprintVisible } from '../../systems/unlocks.js';
import { crateVisible } from '../../systems/crates.js';
import { fmtMoney, fmtNum, fmtOdds } from '../../core/format.js';
import { esc } from '../dom.js';
import { slotIcon, icon } from '../icons.js';
import { play } from '../../core/audio.js';

const SECTIONS = [
  { id: 'builds', name: 'Builds' },
  { id: 'parts', name: 'Parts' },
  { id: 'crates', name: 'Crates' },
];

let section = 'builds';

// --- builds ------------------------------------------------------------------

function reqLine(bp) {
  const bits = Object.entries(bp.req).map(([slot, tier]) => {
    const exact = bp.exact && bp.exact[slot];
    return exact
      ? `<span class="ix-req" style="--c:${TIERS[PARTS[exact].tier].color}">${esc(PARTS[exact].name)}</span>`
      : `<span class="ix-req" style="--c:${TIERS[tier].color}">${SLOT_BY_ID[slot].name} ${TIERS[tier].name}+</span>`;
  });
  for (const extra of bp.extra || []) {
    bits.push(`<span class="ix-req" style="--c:${TIERS[extra.tier].color}">
      ${extra.count}x ${SLOT_BY_ID[extra.slot].name} ${TIERS[extra.tier].name}+</span>`);
  }
  if (bp.cash) bits.push(`<span class="ix-req" style="--c:#49c97a">${fmtMoney(bp.cash)} fee</span>`);
  if (bp.consumes) bits.push(`<span class="ix-req" style="--c:#8ef6ff">eats a finished build</span>`);
  return bits.join('');
}

function buildRow(bp) {
  const known = blueprintVisible(bp);
  const made = state.crafted[bp.id] || 0;
  const tier = TIERS[bp.tier];

  if (!known) {
    return `<div class="ix-row is-locked" style="--c:${tier.color}">
      <span class="ix-dot"></span>
      <div class="ix-main"><b>???</b><i>${bp.hidden ? 'Not in any catalogue' : `Unlocks at ${fmtMoney(bp.unlock.lifetime)} earned`}</i></div>
      <span class="ix-icon">${icon('lock')}</span>
    </div>`;
  }

  return `<div class="ix-row" style="--c:${tier.color}">
    <span class="ix-dot"></span>
    <div class="ix-main">
      <b>${esc(bp.name)}${made ? ` <u>built x${fmtNum(made, { int: true })}</u>` : ''}</b>
      <i>${tier.name} ${bp.kind === 'scooter' ? 'scooter' : 'e-bike'} &middot;
         ${blueprintPartCount(bp)} parts &middot; base ${fmtMoney(bp.base)}</i>
      <div class="ix-stats">
        <span><b>${fmtNum(bp.speed)}</b> mph</span>
        <span><b>${bp.range >= 999999 ? 'yes' : fmtNum(bp.range)}</b> mi</span>
        <span><b>${fmtNum(bp.accel)}s</b> 0-30</span>
      </div>
      <div class="ix-reqs">${reqLine(bp)}</div>
      <p class="flavor">${esc(bp.desc)}</p>
    </div>
  </div>`;
}

// --- parts -------------------------------------------------------------------

function partRow(id) {
  const p = PARTS[id];
  const owned = state.parts[id] || 0;
  const seen = owned > 0 || state.lifetime > 0;
  const slot = SLOT_BY_ID[p.slot];
  return `<div class="ix-part${owned ? ' is-owned' : ''}" style="--c:${TIERS[p.tier].color}"
       title="${esc(p.flavor)}">
    <span class="ix-part-icon">${slotIcon(p.slot)}</span>
    <div class="ix-part-main">
      <b>${esc(p.name)}</b>
      <i>${slot.name} &middot; ${fmtNum(p.stat)}${slot.unit} &middot; ${fmtMoney(p.value)}</i>
    </div>
    <span class="ix-part-count">${owned ? `x${fmtNum(owned, { int: true })}` : ''}</span>
  </div>`;
}

function partsSection() {
  return TIERS.map((tier) => {
    const ids = PART_IDS.filter((id) => PARTS[id].tier === tier.id);
    const owned = ids.filter((id) => (state.parts[id] || 0) > 0).length;
    return `
    <div class="ix-tier" style="--c:${tier.color}">
      <div class="ix-tier-head">
        <span class="ix-tier-name">${tier.name}</span>
        <span class="muted small">${owned}/${ids.length} in the bin</span>
      </div>
      <div class="ix-part-grid">${ids.map(partRow).join('')}</div>
    </div>`;
  }).join('');
}

// --- crates ------------------------------------------------------------------

function crateRow(crate) {
  const known = crateVisible(crate);
  const opened = state.crateOpens[crate.id] || 0;
  const total = crate.table.reduce((a, [, w]) => a + w, 0);
  if (!known) {
    return `<div class="ix-row is-locked" style="--c:${crate.color}">
      <span class="ix-dot"></span>
      <div class="ix-main"><b>???</b><i>${crate.hidden ? 'Not for sale' : `Unlocks at ${fmtMoney(crate.unlock.lifetime)} earned`}</i></div>
      <span class="ix-icon">${icon('lock')}</span>
    </div>`;
  }
  return `<div class="ix-row" style="--c:${crate.color}">
    <span class="ix-dot"></span>
    <div class="ix-main">
      <b>${esc(crate.name)}${opened ? ` <u>opened x${fmtNum(opened, { int: true })}</u>` : ''}</b>
      <i>${fmtMoney(crate.cost)} &middot; ${crate.drops} parts</i>
      <div class="ix-reqs">${crate.table.map(([t, w]) =>
    `<span class="ix-req" style="--c:${TIERS[t].color}">${TIERS[t].name} ${fmtOdds(w / total)}</span>`).join('')}</div>
      <p class="flavor">${esc(crate.desc)}</p>
    </div>
  </div>`;
}

// --- panel -------------------------------------------------------------------

export default {
  id: 'index',
  label: 'Index',
  icon: 'book',
  visible: () => true,

  render() {
    const knownBuilds = BLUEPRINTS.filter(blueprintVisible).length;
    const ownedParts = PART_IDS.filter((id) => (state.parts[id] || 0) > 0).length;

    let body = '';
    if (section === 'builds') {
      const bikes = BLUEPRINTS.filter((b) => b.kind === 'bike');
      const scooters = BLUEPRINTS.filter((b) => b.kind === 'scooter');
      body = `
        <div class="panel-head compact"><h3>E-Bikes</h3><span class="muted">${bikes.length}</span></div>
        <div class="ix-list">${bikes.map(buildRow).join('')}</div>
        <div class="panel-head compact"><h3>Scooters</h3><span class="muted">${scooters.length}</span></div>
        <div class="ix-list">${scooters.map(buildRow).join('')}</div>`;
    } else if (section === 'parts') {
      body = partsSection();
    } else {
      body = `<div class="ix-list">${CRATES.map(crateRow).join('')}</div>`;
    }

    return `
    <div class="panel-head">
      <div>
        <h2>Index</h2>
        <p class="muted">Everything in the game: ${knownBuilds}/${BLUEPRINTS.length} builds
          discovered, ${ownedParts}/${PART_IDS.length} parts held, ${SLOTS.length} slots per bike.</p>
      </div>
      <div class="ix-tabs">
        ${SECTIONS.map((s) => `<button class="amt${s.id === section ? ' is-on' : ''}"
          data-act="index:section" data-id="${s.id}">${s.name}</button>`).join('')}
      </div>
    </div>
    ${body}`;
  },

  actions: {
    'index:section': (ds) => { section = ds.id; play('tickUp'); },
  },
};

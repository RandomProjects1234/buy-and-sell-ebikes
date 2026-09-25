// Workbench panel - pick a blueprint, fit parts, build it.

import { state, countPart } from '../../core/state.js';
import { PARTS, SLOT_BY_ID, TIERS } from '../../data/parts.js';
import { BP_BY_ID, blueprintSlots } from '../../data/blueprints.js';
import { visibleBlueprints } from '../../systems/unlocks.js';
import { slotReqs, candidates, autoFill, validate, quality, previewValue, craft } from '../../systems/crafting.js';
import { salvageRatio, partsOfTierOwned, canSalvage, salvageAll, salvageable } from '../../systems/salvage.js';
import { sellMult } from '../../systems/economy.js';
import { demandOf } from '../../systems/market.js';
import { fmtMoney, fmtNum, fmtMult } from '../../core/format.js';
import { esc, eventPoint } from '../dom.js';
import { slotIcon, icon } from '../icons.js';
import { burst, floatText, pop, toast } from '../fx.js';
import { play } from '../../core/audio.js';

let selectedBp = 'scoot_lite';
let fitted = {};      // slot -> partId for the selected blueprint

export function setSelectedBlueprint(id) {
  if (!BP_BY_ID[id]) return;
  selectedBp = id;
  fitted = {};
}

export function getSelectedBlueprint() { return selectedBp; }

/**
 * Keep the fitted parts legal: drop anything that was sold or consumed, then
 * fill whatever gaps we can. Slots with nothing suitable stay empty rather than
 * blanking the whole fit - a missing battery should not un-fit the frame.
 */
function reconcile(bp) {
  const used = {};
  for (const slot of blueprintSlots(bp)) {
    const id = fitted[slot];
    const legal = id && candidates(bp, slot).includes(id) && countPart(id) > (used[id] || 0);
    if (!legal) delete fitted[slot];
    else used[id] = (used[id] || 0) + 1;
  }
  for (const slot of blueprintSlots(bp)) {
    if (fitted[slot]) continue;
    const option = candidates(bp, slot).find((id) => countPart(id) > (used[id] || 0));
    if (!option) continue;
    fitted[slot] = option;
    used[option] = (used[option] || 0) + 1;
  }
}

function bpRow(bp) {
  const ok = autoFill(bp, 'cheap') !== null;
  const built = state.crafted[bp.id] || 0;
  return `
  <button class="bp-row${bp.id === selectedBp ? ' is-active' : ''}${bp.hidden ? ' is-secret' : ''}"
          data-act="bench:select" data-id="${bp.id}" style="--c:${TIERS[bp.tier].color}">
    <span class="bp-dot"></span>
    <span class="bp-name">${esc(bp.name)}<i>${bp.kind === 'scooter' ? 'Scooter' : 'E-Bike'} &middot; ${TIERS[bp.tier].name}</i></span>
    <span class="bp-value">${fmtMoney(bp.base)}${built ? `<i>x${fmtNum(built, { int: true })}</i>` : ''}</span>
    <span class="bp-ready ${ok ? 'ready' : 'not-ready'}">${ok ? '&#10003;' : '&middot;'}</span>
  </button>`;
}

function slotRow(bp, req) {
  const slot = SLOT_BY_ID[req.slot];
  const list = candidates(bp, req.slot);
  const chosen = fitted[req.slot];
  const part = chosen ? PARTS[chosen] : null;

  const options = list.map((id) => {
    const p = PARTS[id];
    return `<option value="${id}"${id === chosen ? ' selected' : ''}>${esc(p.name)} - ${TIERS[p.tier].name} (${countPart(id)})</option>`;
  }).join('');

  return `
  <div class="slot-row${part ? '' : ' slot-missing'}" style="--c:${part ? TIERS[part.tier].color : '#4a5162'}">
    <span class="slot-icon">${slotIcon(req.slot)}</span>
    <div class="slot-main">
      <div class="slot-label">${slot.name}
        <i>${req.exact ? `requires ${esc(PARTS[req.exact].name)}` : `${TIERS[req.minTier].name}+`}</i>
      </div>
      ${list.length
    ? `<select class="slot-select" data-change="bench:fit" data-slot="${req.slot}">${options}</select>`
    : `<div class="slot-none">No ${slot.name.toLowerCase()} in the bin meets this recipe</div>`}
    </div>
    <div class="slot-stat">${part ? `${fmtNum(part.stat)}<i>${slot.unit}</i>` : '--'}</div>
  </div>`;
}

function requirementNotes(bp) {
  const notes = [];
  for (const extra of bp.extra || []) {
    notes.push(`${extra.count}x extra ${SLOT_BY_ID[extra.slot].name.toLowerCase()} (${TIERS[extra.tier].name}+)`);
  }
  if (bp.cash) notes.push(`${fmtMoney(bp.cash)} assembly fee`);
  if (bp.consumes) notes.push(`consumes one finished ${BP_BY_ID[bp.consumes].name}`);
  return notes;
}

function detail(bp) {
  reconcile(bp);
  const check = validate(bp, fitted);
  const q = quality(bp, fitted);
  const value = previewValue(bp, fitted);
  const listed = value * demandOf(bp.id) * sellMult();
  const notes = requirementNotes(bp);

  return `
  <div class="bench-detail" style="--c:${TIERS[bp.tier].color}">
    <div class="detail-head">
      <div>
        <h3>${esc(bp.name)} ${bp.hidden ? '<span class="tag tag-secret">SECRET</span>' : ''}</h3>
        <p class="muted">${TIERS[bp.tier].name} ${bp.kind === 'scooter' ? 'scooter' : 'e-bike'} &middot; base ${fmtMoney(bp.base)}</p>
      </div>
      <div class="detail-quality">
        <b>${q ? fmtMult(q) : '--'}</b><i>quality</i>
      </div>
    </div>
    <p class="flavor">${esc(bp.desc)}</p>

    <div class="spec-row">
      <div class="spec"><b>${fmtNum(bp.speed)}</b><i>mph</i></div>
      <div class="spec"><b>${bp.range >= 999999 ? 'yes' : fmtNum(bp.range)}</b><i>mile range</i></div>
      <div class="spec"><b>${fmtNum(bp.accel)}s</b><i>0-30</i></div>
    </div>

    <div class="slot-list">${slotReqs(bp).map((r) => slotRow(bp, r)).join('')}</div>

    ${notes.length ? `<ul class="req-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}

    <div class="build-bar">
      <div class="build-value">
        <b>${fmtMoney(listed)}</b>
        <i>estimated sale${demandOf(bp.id) < 0.999 ? ` &middot; demand ${(demandOf(bp.id) * 100).toFixed(0)}%` : ''}</i>
      </div>
      <div class="build-buttons">
        <button class="btn btn-ghost" data-act="bench:auto" data-mode="cheap">Cheapest</button>
        <button class="btn btn-ghost" data-act="bench:auto" data-mode="best">Best parts</button>
        <button class="btn btn-primary" data-act="bench:craft" ${check.ok ? '' : 'disabled'}>
          ${check.ok ? 'Build it' : esc(check.reason)}
        </button>
        <button class="btn" data-act="bench:craftmax" ${check.ok ? '' : 'disabled'}>Build max</button>
      </div>
    </div>
  </div>`;
}

function binSection() {
  const rows = TIERS.map((tier) => {
    const owned = Object.keys(state.parts)
      .filter((id) => PARTS[id] && PARTS[id].tier === tier.id && state.parts[id] > 0)
      .sort((a, b) => PARTS[a].slot.localeCompare(PARTS[b].slot) || PARTS[b].value - PARTS[a].value);
    if (!owned.length) return '';
    const total = partsOfTierOwned(tier.id);
    const chips = owned.map((id) => {
      const p = PARTS[id];
      return `<span class="part-chip" style="--c:${tier.color}" title="${esc(p.flavor)}">
          <b>${esc(p.name)}</b><i>x${fmtNum(state.parts[id], { int: true })}</i>
        </span>`;
    }).join('');
    const can = canSalvage(tier.id);
    return `
    <div class="bin-tier" style="--c:${tier.color}">
      <div class="bin-head">
        <span class="bin-name">${tier.name}</span>
        <span class="muted">${fmtNum(total, { int: true })} parts</span>
        ${salvageable(tier.id) ? `<button class="btn btn-tiny" data-act="bench:salvage" data-tier="${tier.id}" ${can ? '' : 'disabled'}>
            Salvage ${salvageRatio()}:1
          </button>` : ''}
      </div>
      <div class="bin-chips">${chips}</div>
    </div>`;
  }).join('');

  return `<section class="parts-bin">
      <div class="panel-head compact">
        <h3>Parts Bin</h3>
        <p class="muted">Salvage melts ${salvageRatio()} parts into one from the tier above. It loses value, but it clears dead stock. Void and Fossil parts only come from crates.</p>
      </div>
      ${rows || '<p class="empty">The bin is empty. Go open a crate.</p>'}
    </section>`;
}

export default {
  id: 'bench',
  label: 'Workbench',
  icon: 'wrench',
  visible: () => true,

  render() {
    const list = visibleBlueprints();
    if (!list.some((b) => b.id === selectedBp)) selectedBp = list[0]?.id || 'scoot_lite';
    const bp = BP_BY_ID[selectedBp];
    return `
    <div class="bench">
      <aside class="bp-list">
        <div class="panel-head compact"><h3>Blueprints</h3><span class="muted">${list.length} known</span></div>
        ${list.map(bpRow).join('')}
      </aside>
      <div class="bench-main">${bp ? detail(bp) : ''}</div>
    </div>
    ${binSection()}`;
  },

  actions: {
    'bench:select': (ds) => { setSelectedBlueprint(ds.id); play('drop'); },

    'bench:fit': (ds, ev, target) => {
      fitted[ds.slot] = target.value;
      play('tickUp');
    },

    'bench:auto': (ds) => {
      const bp = BP_BY_ID[selectedBp];
      const auto = autoFill(bp, ds.mode);
      if (auto) { fitted = auto; play('drop'); }
      else { play('error'); toast('Not enough parts for that fit.', 'bad'); }
    },

    'bench:craft': (ds, ev, target) => {
      const bp = BP_BY_ID[selectedBp];
      const item = craft(bp.id, fitted);
      if (!item) { play('error'); return; }
      const { x, y } = eventPoint(ev, target);
      play('craft');
      pop(target);
      burst(x, y, { count: 14 + bp.tier * 3, colors: [TIERS[bp.tier].color, '#fff'], power: 1 + bp.tier * 0.15 });
      floatText(x, y - 40, `${item.name} built`, 'rare');
      fitted = {};
    },

    'bench:craftmax': () => {
      const bp = BP_BY_ID[selectedBp];
      let built = 0;
      for (let i = 0; i < 200; i += 1) {
        const auto = autoFill(bp, 'cheap');
        if (!auto || !validate(bp, auto).ok) break;
        if (!craft(bp.id, auto)) break;
        built += 1;
      }
      fitted = {};
      if (built) { play('craft'); toast(`Built ${built}x ${esc(bp.name)}.`, 'good'); }
      else play('error');
    },

    'bench:salvage': (ds, ev, target) => {
      const out = salvageAll(Number(ds.tier));
      if (!out.length) { play('error'); return; }
      const { x, y } = eventPoint(ev, target);
      play('drop');
      burst(x, y, { count: 10, colors: [TIERS[Number(ds.tier) + 1].color], power: 0.7 });
      toast(`Salvaged into ${out.length} ${TIERS[Number(ds.tier) + 1].name} part${out.length > 1 ? 's' : ''}.`, 'good');
    },
  },
};

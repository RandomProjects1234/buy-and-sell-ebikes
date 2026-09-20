// Upgrades panel - permanent one-off purchases, grouped by what they touch.

import { state } from '../../core/state.js';
import { UPGRADES, UPGRADE_GROUPS } from '../../data/upgrades.js';
import { spend } from '../../systems/economy.js';
import { fmtMoney, fmtMult, fmtPct } from '../../core/format.js';
import { esc, eventPoint } from '../dom.js';
import { icon } from '../icons.js';
import { burst, floatText, pop } from '../fx.js';
import { play } from '../../core/audio.js';
import { emit, EVENTS } from '../../core/events.js';

const EFFECT_TEXT = {
  clickAdd: (v) => `+${fmtMoney(v)} per click`,
  clickMult: (v) => `${fmtMult(v)} click value`,
  sellMult: (v) => `${fmtMult(v)} sale price`,
  luck: (v) => `+${fmtPct(v, { sign: false })} crate luck`,
  crateDiscount: (v) => `-${fmtPct(v, { sign: false })} crate cost`,
  autoMult: (v) => `${fmtMult(v)} staff speed`,
  wheelieMult: (v) => `${fmtMult(v)} wheelie payout`,
  wheelieZone: (v) => `+${v} degree balance window`,
  wheelieSave: (v) => `${v} free crash per run`,
  demandFloor: (v) => `+${fmtPct(v, { sign: false })} demand floor`,
  offlineHours: (v) => `+${v}h offline cap`,
  showroomMult: (v) => `${fmtMult(v)} showroom bonus`,
};

function effectLine(up) {
  return Object.entries(up.effect)
    .map(([k, v]) => (EFFECT_TEXT[k] ? EFFECT_TEXT[k](v) : `${k} ${v}`))
    .join(' &middot; ');
}

/** Hide things that are absurdly out of reach so the page stays readable. */
function inReach(up) {
  return up.cost <= Math.max(200, state.lifetime * 3, state.money * 4);
}

function card(up) {
  const afford = state.money >= up.cost;
  return `
  <article class="card upgrade-card${afford ? ' affordable' : ''}">
    <header class="card-head">
      <span class="card-icon">${icon('upgrade')}</span>
      <div><h3>${esc(up.name)}</h3><p class="card-sub">${effectLine(up)}</p></div>
      <span class="card-price${afford ? '' : ' unaffordable'}">${fmtMoney(up.cost)}</span>
    </header>
    <p class="flavor">${esc(up.desc)}</p>
    <div class="card-actions">
      <button class="btn btn-primary" data-act="upg:buy" data-id="${up.id}" ${afford ? '' : 'disabled'}>Buy</button>
    </div>
  </article>`;
}

export default {
  id: 'upgrades',
  label: 'Upgrades',
  icon: 'upgrade',
  visible: () => true,
  badge() {
    const n = UPGRADES.filter((u) => !state.upgrades[u.id] && state.money >= u.cost).length;
    return n ? String(n) : null;
  },

  render() {
    const owned = UPGRADES.filter((u) => state.upgrades[u.id]);
    const groups = UPGRADE_GROUPS.map((g) => {
      const list = UPGRADES.filter((u) => u.group === g.id && !state.upgrades[u.id] && inReach(u));
      if (!list.length) return '';
      return `<section class="upg-group">
          <div class="panel-head compact"><h3>${g.name}</h3></div>
          <div class="card-grid">${list.map(card).join('')}</div>
        </section>`;
    }).join('');

    return `
    <div class="panel-head">
      <div>
        <h2>Upgrades</h2>
        <p class="muted">Permanent for this company. An IPO wipes them, so spend freely.</p>
      </div>
      <div class="stat-pill">${owned.length}/${UPGRADES.length} owned</div>
    </div>
    ${groups || '<p class="empty">Nothing new in reach. Go earn some money.</p>'}
    ${owned.length ? `<section class="upg-group">
      <div class="panel-head compact"><h3>Owned</h3></div>
      <div class="owned-strip">${owned.map((u) => `<span class="owned-chip" title="${esc(u.desc)}">${esc(u.name)}</span>`).join('')}</div>
    </section>` : ''}`;
  },

  actions: {
    'upg:buy': (ds, ev, target) => {
      const up = UPGRADES.find((u) => u.id === ds.id);
      if (!up || state.upgrades[up.id] || !spend(up.cost)) { play('error'); return; }
      state.upgrades[up.id] = true;
      const { x, y } = eventPoint(ev, target);
      play('unlock');
      pop(target);
      burst(x, y, { count: 14, colors: ['#8ef6ff', '#fff'], power: 0.9 });
      floatText(x, y - 24, up.name, 'rare');
      emit(EVENTS.TOAST, { text: `Upgrade bought: ${up.name}`, kind: 'good' });
    },
  },
};

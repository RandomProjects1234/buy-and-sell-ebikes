// Facilities panel - buildings that print parts while you do something else.

import { state, farmLevel } from '../../core/state.js';
import { FARMS } from '../../data/facilities.js';
import { TIERS } from '../../data/parts.js';
import { farmCost, buyFarm, farmVisible, farmOutput } from '../../systems/automation.js';
import { autoMult } from '../../systems/economy.js';
import { fmtMoney, fmtNum } from '../../core/format.js';
import { esc, eventPoint } from '../dom.js';
import { icon } from '../icons.js';
import { burst, pop } from '../fx.js';
import { play } from '../../core/audio.js';

function farmCard(farm) {
  const level = farmLevel(farm.id);
  const cost1 = farmCost(farm.id, 1);
  const cost10 = farmCost(farm.id, 10);
  const rate = farm.rate * level * autoMult();
  const tier = TIERS[farm.tier];
  return `
  <article class="card farm-card${level ? ' active' : ''}" style="--c:${tier.color}">
    <header class="card-head">
      <span class="card-icon">${icon('farm')}</span>
      <div>
        <h3>${esc(farm.name)} ${level ? `<span class="role-count">lvl ${fmtNum(level, { int: true })}</span>` : ''}</h3>
        <p class="card-sub">${tier.name} parts${level ? ` &middot; ${fmtNum(rate)}/s` : ` &middot; ${fmtNum(farm.rate)}/s per level`}</p>
      </div>
      <span class="card-price">${fmtMoney(cost1)}</span>
    </header>
    <p class="flavor">${esc(farm.desc)}</p>
    <div class="card-actions">
      <button class="btn btn-primary" data-act="farm:buy" data-id="${farm.id}" data-n="1" ${state.money >= cost1 ? '' : 'disabled'}>
        ${level ? 'Upgrade' : 'Build'}
      </button>
      <button class="btn" data-act="farm:buy" data-id="${farm.id}" data-n="10" ${state.money >= cost10 ? '' : 'disabled'}>x10 &middot; ${fmtMoney(cost10)}</button>
    </div>
  </article>`;
}

export default {
  id: 'farms',
  label: 'Facilities',
  icon: 'farm',
  visible: () => FARMS.some(farmVisible),

  render() {
    const list = FARMS.filter(farmVisible);
    const locked = FARMS.filter((f) => !farmVisible(f));
    return `
    <div class="panel-head">
      <div>
        <h2>Facilities</h2>
        <p class="muted">Facilities print parts out of thin air and electricity, even while you are away. Turn the pile into bikes at the Workbench.</p>
      </div>
      <div class="stat-pill">${fmtNum(farmOutput())} parts/sec</div>
    </div>
    <div class="card-grid">${list.map(farmCard).join('')}</div>
    ${locked.length ? `<div class="locked-row">${locked.map((f) => `
      <span class="locked-chip">${icon('lock')} ${esc(f.name)} &middot; unlocks at ${fmtMoney(f.unlock.lifetime)} earned</span>`).join('')}</div>` : ''}`;
  },

  actions: {
    'farm:buy': (ds, ev, target) => {
      if (!buyFarm(ds.id, Number(ds.n) || 1)) { play('error'); return; }
      const { x, y } = eventPoint(ev, target);
      play('buy');
      pop(target);
      burst(x, y, { count: 10, colors: ['#8ef6ff'], power: 0.7 });
    },
  },
};

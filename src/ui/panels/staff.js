// Staff panel - hire people to do the loop for you, then promote a manager to
// stop having to micro-manage them.

import { state, workerCount } from '../../core/state.js';
import { ROLES, COMMISSION } from '../../data/staff.js';
import { hireCost, hire, buyManager, roleVisible, roleRate } from '../../systems/automation.js';
import { visibleCrates } from '../../systems/crates.js';
import { visibleBlueprints } from '../../systems/unlocks.js';
import { autoMult } from '../../systems/economy.js';
import { fmtMoney, fmtNum, fmtMult } from '../../core/format.js';
import { esc, eventPoint } from '../dom.js';
import { icon } from '../icons.js';
import { burst, pop, toast } from '../fx.js';
import { play } from '../../core/audio.js';

function configFor(role) {
  if (role.config === 'crate' && !state.managers.runner) {
    const opts = visibleCrates().map((c) =>
      `<option value="${c.id}"${state.cfg.runnerCrate === c.id ? ' selected' : ''}>${esc(c.name)} - ${fmtMoney(c.cost)}</option>`).join('');
    return `<label class="role-config">Buying
        <select data-change="staff:crate">${opts}</select>
      </label>`;
  }
  if (role.config === 'blueprint' && !state.managers.wrench) {
    const opts = visibleBlueprints()
      .filter((b) => !b.consumes && !b.fragments)
      .map((b) => `<option value="${b.id}"${state.cfg.wrenchBlueprint === b.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
    return `<label class="role-config">Building
        <select data-change="staff:blueprint">${opts}</select>
      </label>`;
  }
  return '';
}

function roleCard(role) {
  const n = workerCount(role.id);
  const cost1 = hireCost(role.id, 1);
  const cost10 = hireCost(role.id, 10);
  const hasManager = !!state.managers[role.id];
  return `
  <article class="card role-card${n ? ' active' : ''}">
    <header class="card-head">
      <span class="card-icon">${icon('staff')}</span>
      <div>
        <h3>${esc(role.name)} <span class="role-count">${n ? `x${fmtNum(n, { int: true })}` : ''}</span></h3>
        <p class="card-sub">${esc(role.stage)}${n ? ` &middot; ${fmtNum(roleRate(role.id))}/s` : ''}</p>
      </div>
      <span class="card-price">${fmtMoney(cost1)}</span>
    </header>
    <p class="flavor">${esc(role.desc)}</p>
    ${configFor(role)}
    <div class="card-actions">
      <button class="btn btn-primary" data-act="staff:hire" data-id="${role.id}" data-n="1" ${state.money >= cost1 ? '' : 'disabled'}>Hire</button>
      <button class="btn" data-act="staff:hire" data-id="${role.id}" data-n="10" ${state.money >= cost10 ? '' : 'disabled'}>x10 &middot; ${fmtMoney(cost10)}</button>
    </div>
    ${hasManager
    ? `<div class="manager-owned">${icon('star')} ${esc(role.managerName)} &middot; ${esc(role.managerDesc)}</div>`
    : (n >= 5 ? `<div class="manager-offer">
          <div><b>${esc(role.managerName)}</b><i>${esc(role.managerDesc)}</i></div>
          <button class="btn btn-gold" data-act="staff:manager" data-id="${role.id}" ${state.money >= role.managerCost ? '' : 'disabled'}>
            ${fmtMoney(role.managerCost)}
          </button>
        </div>` : `<div class="manager-locked">${icon('lock')} Manager unlock at 5 ${esc(role.plural.toLowerCase())}</div>`)}
  </article>`;
}

function chain() {
  const steps = [
    { id: 'runner', label: 'Open crates' },
    { id: 'sorter', label: 'Salvage' },
    { id: 'wrench', label: 'Build' },
    { id: 'closer', label: 'Sell' },
  ];
  return `<div class="chain">${steps.map((s, i) => {
    const on = workerCount(s.id) > 0;
    return `<span class="chain-step${on ? ' on' : ''}">${s.label}${state.managers[s.id] ? ' *' : ''}</span>${i < steps.length - 1 ? '<span class="chain-arrow">&rarr;</span>' : ''}`;
  }).join('')}</div>`;
}

export default {
  id: 'staff',
  label: 'Staff',
  icon: 'staff',
  visible: () => ROLES.some(roleVisible),

  render() {
    const list = ROLES.filter(roleVisible);
    const locked = ROLES.filter((r) => !roleVisible(r));
    return `
    <div class="panel-head">
      <div>
        <h2>Staff</h2>
        <p class="muted">They are slower than you are, but they never stop - and they work while the tab is closed. Closers take ${((1 - COMMISSION) * 100).toFixed(0)}% commission until you promote one.</p>
      </div>
      <div class="stat-pill">Speed ${fmtMult(autoMult())}</div>
    </div>
    ${chain()}
    <div class="card-grid">${list.map(roleCard).join('')}</div>
    ${locked.length ? `<div class="locked-row">${locked.map((r) => `
      <span class="locked-chip">${icon('lock')} ${esc(r.name)} &middot; unlocks at ${fmtMoney(r.unlock.lifetime)} earned</span>`).join('')}</div>` : ''}`;
  },

  actions: {
    'staff:hire': (ds, ev, target) => {
      if (!hire(ds.id, Number(ds.n) || 1)) { play('error'); return; }
      const { x, y } = eventPoint(ev, target);
      play('buy');
      pop(target);
      burst(x, y, { count: 8, colors: ['#49c97a'], power: 0.6 });
    },
    'staff:manager': (ds, ev, target) => {
      if (!buyManager(ds.id)) { play('error'); return; }
      const { x, y } = eventPoint(ev, target);
      play('unlock');
      burst(x, y, { count: 16, colors: ['#ffd166', '#fff'], power: 1 });
      toast('Manager promoted. That stage runs itself now.', 'good');
    },
    'staff:crate': (ds, ev, target) => { state.cfg.runnerCrate = target.value; },
    'staff:blueprint': (ds, ev, target) => { state.cfg.wrenchBlueprint = target.value; },
  },
};

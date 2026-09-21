// ---------------------------------------------------------------------------
// THE STORE COLUMN
// ---------------------------------------------------------------------------
// The Cookie Clicker half of the screen: a permanent right-hand column with a
// grid of upgrade tiles on top and a list of buildings underneath. Everything
// you can buy is always visible and one click away - no tab hunting.

import { state, workerCount, farmLevel } from '../core/state.js';
import { ROLES, FARMS, COMMISSION } from '../data/staff.js';
import { TIERS } from '../data/parts.js';
import { UPGRADES } from '../data/upgrades.js';
import {
  hireCost, hire, buyManager, roleVisible, roleRate,
  farmCost, buyFarm, farmVisible,
} from '../systems/automation.js';
import { spend, autoMult } from '../systems/economy.js';
import { visibleCrates } from '../systems/crates.js';
import { visibleBlueprints } from '../systems/unlocks.js';
import { fmtMoney, fmtNum, fmtMult, fmtPct, affordableCount } from '../core/format.js';
import { esc, eventPoint } from './dom.js';
import { icon } from './icons.js';
import { burst, floatText, pop, toast } from './fx.js';
import { play } from '../core/audio.js';
import { emit, EVENTS } from '../core/events.js';

const AMOUNTS = [1, 10, 100, 'max'];
const expanded = new Set();

function buyAmount() { return state.settings.buyAmount || 1; }

// --- buildings (staff + facilities in one list) ------------------------------

/** One uniform shape for both kinds, so the list renders in a single pass. */
function buildings() {
  const out = [];
  for (const role of ROLES) {
    if (!roleVisible(role)) continue;
    const owned = workerCount(role.id);
    out.push({
      kind: 'role', id: role.id, name: role.name, owned,
      sub: owned ? `${role.stage} &middot; ${fmtNum(roleRate(role.id))}/s` : role.stage,
      icon: 'staff', color: '#49c97a', data: role,
      cost: (n) => hireCost(role.id, n),
      buy: (n) => hire(role.id, n),
      order: role.cost,
    });
  }
  for (const farm of FARMS) {
    if (!farmVisible(farm)) continue;
    const level = farmLevel(farm.id);
    const rate = farm.rate * level * autoMult();
    out.push({
      kind: 'farm', id: farm.id, name: farm.name, owned: level,
      sub: level ? `${TIERS[farm.tier].name} parts &middot; ${fmtNum(rate)}/s`
        : `${TIERS[farm.tier].name} parts &middot; ${fmtNum(farm.rate)}/s per level`,
      icon: 'farm', color: TIERS[farm.tier].color, data: farm,
      cost: (n) => farmCost(farm.id, n),
      buy: (n) => buyFarm(farm.id, n),
      order: farm.cost,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

function countFor(b) {
  const amount = buyAmount();
  if (amount !== 'max') return amount;
  const base = b.kind === 'role' ? b.data.cost : b.data.cost;
  const growth = b.data.growth;
  return Math.max(1, affordableCount(base, growth, b.owned, state.money));
}

function roleConfig(role) {
  if (role.config === 'crate' && !state.managers.runner) {
    const opts = visibleCrates().map((c) =>
      `<option value="${c.id}"${state.cfg.runnerCrate === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    return `<label class="bld-cfg">Buying<select data-change="store:crate">${opts}</select></label>`;
  }
  if (role.config === 'blueprint' && !state.managers.wrench) {
    const opts = visibleBlueprints()
      .filter((b) => !b.consumes && !b.fragments)
      .map((b) => `<option value="${b.id}"${state.cfg.wrenchBlueprint === b.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
    return `<label class="bld-cfg">Building<select data-change="store:blueprint">${opts}</select></label>`;
  }
  return '';
}

function buildingDetail(b) {
  if (b.kind === 'farm') {
    return `<div class="bld-detail"><p class="flavor">${esc(b.data.desc)}</p></div>`;
  }
  const role = b.data;
  const owned = !!state.managers[role.id];
  return `<div class="bld-detail">
    <p class="flavor">${esc(role.desc)}</p>
    ${roleConfig(role)}
    ${owned
    ? `<div class="manager-owned">${icon('star')} ${esc(role.managerName)} &middot; ${esc(role.managerDesc)}</div>`
    : (b.owned >= 3
      ? `<div class="manager-offer">
           <div><b>${esc(role.managerName)}</b><i>${esc(role.managerDesc)}</i></div>
           <button class="btn btn-gold btn-tiny" data-act="store:manager" data-id="${role.id}"
             ${state.money >= role.managerCost ? '' : 'disabled'}>${fmtMoney(role.managerCost)}</button>
         </div>`
      : `<div class="manager-locked">${icon('lock')} Manager unlocks at 3</div>`)}
  </div>`;
}

function buildingRow(b) {
  const n = countFor(b);
  const cost = b.cost(n);
  const afford = state.money >= cost;
  const open = expanded.has(b.id);
  return `
  <div class="bld${afford ? '' : ' is-disabled'}${open ? ' is-open' : ''}" style="--c:${b.color}"
       data-act="store:buy" data-kind="${b.kind}" data-id="${b.id}">
    <span class="bld-icon">${icon(b.icon)}</span>
    <span class="bld-main">
      <b>${esc(b.name)}${n > 1 ? ` <i class="bld-x">x${n}</i>` : ''}</b>
      <i>${b.sub}</i>
      <u class="bld-cost">${fmtMoney(cost)}</u>
    </span>
    <span class="bld-count">${b.owned ? fmtNum(b.owned, { int: true }) : ''}</span>
    <span class="bld-toggle" data-act="store:expand" data-id="${b.id}" title="Details">${open ? '&minus;' : '+'}</span>
    ${open ? buildingDetail(b) : ''}
  </div>`;
}

// --- upgrades ----------------------------------------------------------------

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

const GROUP_COLOR = {
  click: '#ffd166', sell: '#49c97a', crate: '#3d9dff', wheelie: '#b06bff', auto: '#ffab2e',
};

function effectLine(up) {
  return Object.entries(up.effect)
    .map(([k, v]) => (EFFECT_TEXT[k] ? EFFECT_TEXT[k](v) : `${k} ${v}`))
    .join(' &middot; ');
}

/** Only show what is plausibly in reach, Cookie Clicker style. */
function storeUpgrades() {
  return UPGRADES.filter((u) => !state.upgrades[u.id]
    && u.cost <= Math.max(120, state.lifetime * 4, state.money * 6));
}

function upgradeTile(up) {
  const afford = state.money >= up.cost;
  return `
  <span class="upg-tile${afford ? ' can-buy' : ''}" style="--c:${GROUP_COLOR[up.group] || '#ffd166'}"
        data-act="store:upgrade" data-id="${up.id}">
    ${icon(up.group === 'click' ? 'bolt' : up.group === 'sell' ? 'sell'
    : up.group === 'crate' ? 'crate' : up.group === 'wheelie' ? 'wheelie' : 'gear')}
    <span class="upg-tip">
      <b>${esc(up.name)}</b>
      <i>${effectLine(up)}</i>
      <u>${fmtMoney(up.cost)}</u>
      <em>${esc(up.desc)}</em>
    </span>
  </span>`;
}

// --- public ------------------------------------------------------------------

export function renderStore() {
  const ups = storeUpgrades();
  const list = buildings();
  const amount = buyAmount();

  return `
  <div class="store-head">
    <h3>Store</h3>
    <div class="buy-amounts">
      ${AMOUNTS.map((a) => `<button class="amt${a === amount ? ' is-on' : ''}"
        data-act="store:amount" data-n="${a}">${a === 'max' ? 'Max' : `x${a}`}</button>`).join('')}
    </div>
  </div>
  <div class="store-scroll">
    ${ups.length ? `<div class="store-label">Upgrades <i>${ups.length}</i></div>
    <div class="upg-tiles">${ups.map(upgradeTile).join('')}</div>` : ''}

    <div class="store-label">Staff &amp; facilities</div>
    ${list.length
    ? `<div class="bld-list">${list.map(buildingRow).join('')}</div>`
    : `<p class="store-empty">Earn ${fmtMoney(1500)} and you can start hiring.</p>`}
    ${list.some((b) => b.kind === 'role') && !state.managers.closer
    ? `<p class="store-note">Closers keep ${((1 - COMMISSION) * 100).toFixed(0)}% commission until you promote a Sales Director.</p>` : ''}
  </div>`;
}

/**
 * Upgrade tooltips are position:fixed so the store's own overflow cannot clip
 * them; that means their coordinates have to come from here.
 */
export function initStoreHover() {
  document.addEventListener('mouseover', (ev) => {
    const tile = ev.target.closest && ev.target.closest('.upg-tile');
    if (!tile) return;
    const tip = tile.querySelector('.upg-tip');
    if (!tip) return;
    const r = tile.getBoundingClientRect();
    const w = 236;
    const left = r.left - w - 12 >= 8 ? r.left - w - 12 : Math.min(r.right + 12, window.innerWidth - w - 8);
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, Math.min(window.innerHeight - 170, r.top - 8))}px`;
  }, true);
}

export const storeActions = {
  'store:amount': (ds) => {
    state.settings.buyAmount = ds.n === 'max' ? 'max' : Number(ds.n);
    play('tickUp');
  },

  'store:expand': (ds, ev) => {
    ev.stopPropagation();
    if (expanded.has(ds.id)) expanded.delete(ds.id);
    else expanded.add(ds.id);
    play('tickUp');
  },

  'store:buy': (ds, ev, target) => {
    const b = buildings().find((x) => x.id === ds.id);
    if (!b) return;
    const n = countFor(b);
    if (!b.buy(n)) { play('error'); return; }
    const { x, y } = eventPoint(ev, target);
    play('buy');
    pop(target);
    burst(x, y, { count: 8, colors: [b.color], power: 0.6 });
    floatText(x, y - 18, `+${n} ${b.name}`, 'rare');
  },

  'store:manager': (ds, ev, target) => {
    ev.stopPropagation();
    if (!buyManager(ds.id)) { play('error'); return; }
    const { x, y } = eventPoint(ev, target);
    play('unlock');
    burst(x, y, { count: 16, colors: ['#ffd166', '#fff'], power: 1 });
    toast('Manager promoted. That stage runs itself now.', 'good');
  },

  'store:upgrade': (ds, ev, target) => {
    const up = UPGRADES.find((u) => u.id === ds.id);
    if (!up || state.upgrades[up.id] || !spend(up.cost)) { play('error'); return; }
    state.upgrades[up.id] = true;
    const { x, y } = eventPoint(ev, target);
    play('unlock');
    burst(x, y, { count: 14, colors: ['#8ef6ff', '#fff'], power: 0.9 });
    floatText(x, y - 24, up.name, 'rare');
    emit(EVENTS.TOAST, { text: `Upgrade bought: ${up.name}`, kind: 'good' });
  },

  'store:crate': (ds, ev, target) => { state.cfg.runnerCrate = target.value; },
  'store:blueprint': (ds, ev, target) => { state.cfg.wrenchBlueprint = target.value; },
};

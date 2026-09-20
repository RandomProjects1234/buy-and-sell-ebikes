// Garage panel - what you have built, what it is worth, and who is on display.

import { state } from '../../core/state.js';
import { TIERS } from '../../data/parts.js';
import { BP_BY_ID } from '../../data/blueprints.js';
import { salePrice, sellItem, sellAll, setShowroom, clearShowroom, demandOf, bestInGarage } from '../../systems/market.js';
import { showroomBonus } from '../../systems/economy.js';
import { fmtMoney, fmtNum, fmtMult, fmtPct } from '../../core/format.js';
import { esc, eventPoint } from '../dom.js';
import { bikeSVG } from '../bikeArt.js';
import { icon } from '../icons.js';
import { burst, floatText, pop, toast } from '../fx.js';
import { play } from '../../core/audio.js';

/** Identical builds collapse into one row so auto-crafted floors stay readable. */
function groupGarage() {
  const groups = new Map();
  for (const item of state.garage) {
    const key = `${item.bp}:${item.quality.toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, { key, item, count: 0, uids: [] });
    const g = groups.get(key);
    g.count += 1;
    g.uids.push(item.uid);
  }
  return [...groups.values()].sort((a, b) => b.item.value - a.item.value);
}

function showroomCard() {
  const bike = state.showroom;
  const bonus = showroomBonus();
  if (!bike) {
    return `<section class="showroom-card empty">
      <h3>Showroom is empty</h3>
      <p class="muted">Put a build in the window - the better it is, the more every click earns.</p>
    </section>`;
  }
  return `
  <section class="showroom-card" style="--c:${TIERS[bike.tier].color}">
    <div class="showroom-art">${bikeSVG(bike, { className: 'mini' })}</div>
    <div class="showroom-info">
      <h3>${esc(bike.name)}${bike.starter ? ' <span class="tag">THE ONE THAT STARTED IT</span>' : ''}</h3>
      <p class="muted">${TIERS[bike.tier].name} ${bike.kind === 'scooter' ? 'scooter' : 'e-bike'} &middot; quality ${fmtMult(bike.quality)}</p>
      <div class="spec-row">
        <div class="spec"><b>${fmtNum(bike.speed)}</b><i>mph</i></div>
        <div class="spec"><b>${bike.range >= 999999 ? 'yes' : fmtNum(bike.range)}</b><i>range</i></div>
        <div class="spec"><b>${fmtNum(bike.accel)}s</b><i>0-30</i></div>
        <div class="spec hot"><b>${fmtMult(bonus)}</b><i>click bonus</i></div>
      </div>
      <div class="card-actions">
        <button class="btn btn-ghost" data-act="garage:undisplay">Back to the floor</button>
      </div>
    </div>
  </section>`;
}

function itemRow(group) {
  const { item, count } = group;
  const bp = BP_BY_ID[item.bp];
  const price = salePrice(item);
  const demand = demandOf(item.bp);
  return `
  <div class="build-row" style="--c:${TIERS[item.tier].color}">
    <span class="build-dot"></span>
    <div class="build-name">
      ${esc(item.name)}${count > 1 ? ` <i class="count">x${count}</i>` : ''}
      <i>${TIERS[item.tier].name} &middot; quality ${fmtMult(item.quality)}${bp && bp.hidden ? ' &middot; secret' : ''}</i>
    </div>
    <div class="build-price">
      <b>${fmtMoney(price)}</b>
      ${demand < 0.999 ? `<i class="demand">demand ${(demand * 100).toFixed(0)}%</i>` : '<i>full price</i>'}
    </div>
    <div class="build-actions">
      <button class="btn btn-tiny" data-act="garage:display" data-uid="${item.uid}">Display</button>
      ${item.starter
    ? '<button class="btn btn-tiny" disabled title="Not for sale. It is the one that got you here.">Keepsake</button>'
    : `<button class="btn btn-tiny btn-primary" data-act="garage:sell" data-uid="${item.uid}">Sell</button>
       ${count > 1 ? `<button class="btn btn-tiny" data-act="garage:sellgroup" data-key="${group.key}">Sell ${count}</button>` : ''}`}
    </div>
  </div>`;
}

export default {
  id: 'garage',
  label: 'Garage',
  icon: 'garage',
  visible: () => true,
  badge: () => (state.garage.length ? String(state.garage.length) : null),

  render() {
    const groups = groupGarage();
    const floorValue = state.garage.reduce((sum, it) => sum + salePrice(it), 0);
    return `
    <div class="panel-head">
      <div>
        <h2>Garage</h2>
        <p class="muted">${state.garage.length ? `${state.garage.length} build${state.garage.length > 1 ? 's' : ''} on the floor, worth ${fmtMoney(floorValue)}` : 'Nothing on the floor.'}</p>
      </div>
      <div class="card-actions">
        <button class="btn" data-act="garage:sellkind" data-kind="scooter" ${groups.some((g) => g.item.kind === 'scooter') ? '' : 'disabled'}>Sell scooters</button>
        <button class="btn btn-primary" data-act="garage:sellall" ${state.garage.length ? '' : 'disabled'}>Sell everything</button>
      </div>
    </div>
    ${showroomCard()}
    <div class="build-list">
      ${groups.length ? groups.map(itemRow).join('') : '<p class="empty">Build something at the workbench and it lands here.</p>'}
    </div>`;
  },

  actions: {
    'garage:sell': (ds, ev, target) => {
      const item = state.garage.find((it) => it.uid === ds.uid);
      if (!item) return;
      const amount = sellItem(ds.uid);
      const { x, y } = eventPoint(ev, target);
      play('sell');
      pop(target);
      floatText(x, y - 20, `+${fmtMoney(amount)}`, 'money');
      burst(x, y, { count: 8, colors: ['#ffd166', TIERS[item.tier].color], power: 0.7 });
    },

    'garage:sellgroup': (ds, ev, target) => {
      const [bp, q] = ds.key.split(':');
      const uids = state.garage.filter((it) => it.bp === bp && it.quality.toFixed(4) === q).map((it) => it.uid);
      let total = 0;
      for (const uid of uids) total += sellItem(uid, { silent: true });
      const { x, y } = eventPoint(ev, target);
      play('sell');
      floatText(x, y - 20, `+${fmtMoney(total)}`, 'money');
      burst(x, y, { count: 12, colors: ['#ffd166'], power: 0.9 });
    },

    'garage:sellall': (ds, ev, target) => {
      const total = sellAll();
      if (!total) { play('error'); return; }
      const { x, y } = eventPoint(ev, target);
      play('sell');
      floatText(x, y - 20, `+${fmtMoney(total)}`, 'money');
      burst(x, y, { count: 18, colors: ['#ffd166', '#fff'], power: 1.1 });
    },

    'garage:sellkind': (ds, ev, target) => {
      const total = sellAll({ filterKind: ds.kind });
      if (!total) { play('error'); return; }
      const { x, y } = eventPoint(ev, target);
      play('sell');
      floatText(x, y - 20, `+${fmtMoney(total)}`, 'money');
    },

    'garage:display': (ds) => {
      if (setShowroom(ds.uid)) { play('drop'); toast('New bike in the window.', 'good'); }
    },

    'garage:undisplay': () => {
      if (clearShowroom()) play('drop');
    },
  },
};

export { bestInGarage };

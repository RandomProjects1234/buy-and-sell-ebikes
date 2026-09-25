// Crates panel - the shop side of the gacha loop.

import { state } from '../../core/state.js';
import { TIERS, PARTS } from '../../data/parts.js';
import { crateCost, crateLuck } from '../../systems/economy.js';
import { visibleCrates, buyCrates } from '../../systems/crates.js';
import { CRATES } from '../../data/crates.js';
import { fmtMoney, fmtNum, fmtPct, fmtOdds } from '../../core/format.js';
import { esc, eventPoint } from '../dom.js';
import { icon } from '../icons.js';
import { burst, floatText, pop } from '../fx.js';
import { play } from '../../core/audio.js';

let lastHaul = null;   // { crate, count, tally }

const BULK = [10, 100, 1000];

function tierBar(crate) {
  const total = crate.table.reduce((sum, [, w]) => sum + w, 0);
  // Tiny slices (the Fossil Crate's 0.1%) get a minimum width so they show.
  const bar = crate.table.map(([tier, w]) =>
    `<span class="odds-seg" style="--c:${TIERS[tier].color};flex:${Math.max(w, total * 0.012)}" title="${TIERS[tier].name} ${fmtOdds(w / total)}"></span>`).join('');
  const legend = crate.table.map(([tier, w]) =>
    `<span class="odds-key" style="--c:${TIERS[tier].color}">${TIERS[tier].name} ${fmtOdds(w / total)}</span>`).join('');
  return `<div class="odds-bar">${bar}</div><div class="odds-legend">${legend}</div>`;
}

function haulStrip() {
  if (!lastHaul) {
    return `<div class="haul haul-empty">Nothing opened yet. Crates are where every build starts.</div>`;
  }
  const entries = Object.entries(lastHaul.tally)
    .map(([id, n]) => ({ part: PARTS[id], n }))
    .sort((a, b) => b.part.tier - a.part.tier || b.n - a.n);
  const total = entries.reduce((sum, e) => sum + e.n, 0);
  // Per-tier totals first, so a x1000 haul still reads at a glance.
  const byTier = {};
  for (const { part, n } of entries) byTier[part.tier] = (byTier[part.tier] || 0) + n;
  const tiers = Object.keys(byTier).map(Number).sort((a, b) => b - a).map((t) => `
    <span class="haul-tier" style="--c:${TIERS[t].color}">${TIERS[t].name} <b>${fmtNum(byTier[t], { int: true })}</b></span>`).join('');
  const chips = entries.slice(0, 14).map(({ part: p, n }, i) => `
    <span class="part-chip reveal" style="--c:${TIERS[p.tier].color};--i:${i}">
      <b>${esc(p.name)}${n > 1 ? ` x${fmtNum(n, { int: true })}` : ''}</b><i>${TIERS[p.tier].name}</i>
    </span>`).join('');
  return `<div class="haul">
      <div class="haul-label">Last haul${lastHaul.count > 1 ? ` (${fmtNum(lastHaul.count, { int: true })} crates, ${fmtNum(total, { int: true })} parts)` : ''}</div>
      ${lastHaul.count > 1 ? `<div class="haul-tiers">${tiers}</div>` : ''}
      <div class="haul-chips">${chips}</div>
    </div>`;
}

function crateCard(crate) {
  const cost = crateCost(crate);
  const afford = state.money >= cost;
  const opened = state.crateOpens[crate.id] || 0;
  return `
  <article class="card crate-card${crate.hidden ? ' card-secret' : ''}" style="--c:${crate.color}">
    <header class="card-head">
      <span class="card-icon">${icon('crate')}</span>
      <div>
        <h3>${esc(crate.name)}</h3>
        <p class="card-sub">${crate.drops} parts per crate${opened ? ` &middot; ${fmtNum(opened, { int: true })} opened` : ''}</p>
      </div>
      <span class="card-price${afford ? '' : ' unaffordable'}">${fmtMoney(cost)}</span>
    </header>
    <p class="flavor">${esc(crate.desc)}</p>
    <div class="odds-row">${tierBar(crate)}</div>
    <div class="card-actions">
      <button class="btn btn-primary" data-act="crate:buy" data-id="${crate.id}" data-n="1" ${afford ? '' : 'disabled'}>
        Open one
      </button>
      ${BULK.map((n) => `<button class="btn btn-bulk" data-act="crate:buy" data-id="${crate.id}" data-n="${n}"
        ${state.money >= cost * n ? '' : 'disabled'} title="Open ${n} for ${fmtMoney(cost * n)}">
        x${n}<i>${fmtMoney(cost * n)}</i>
      </button>`).join('')}
    </div>
  </article>`;
}

export default {
  id: 'crates',
  label: 'Crates',
  icon: 'crate',
  visible: () => true,

  render() {
    const list = visibleCrates();
    const locked = CRATES.filter((c) => !c.hidden && !list.includes(c));
    const luck = crateLuck();
    return `
    <div class="panel-head">
      <div>
        <h2>Sourcing</h2>
        <p class="muted">Buy a crate, get parts. Parts become builds, builds become money.</p>
      </div>
      ${luck > 0 ? `<div class="stat-pill" title="Chance for any drop to roll one tier higher">Luck ${fmtPct(luck, { sign: false })}</div>` : ''}
    </div>
    ${haulStrip()}
    <div class="card-grid">${list.map(crateCard).join('')}</div>
    ${locked.length ? `<div class="locked-row">${locked.map((c) => `
      <span class="locked-chip">${icon('lock')} ${esc(c.name)} &middot; unlocks at ${fmtMoney(c.unlock.lifetime)} earned</span>`).join('')}</div>` : ''}
    `;
  },

  actions: {
    'crate:buy': (ds, ev, target) => {
      const haul = buyCrates(ds.id, Number(ds.n) || 1);
      if (!haul) { play('error'); return; }
      lastHaul = haul;

      let best = null;
      for (const id of Object.keys(haul.tally)) {
        if (!best || PARTS[id].tier > best.tier) best = PARTS[id];
      }
      const { x, y } = eventPoint(ev, target);
      play('crate');
      pop(target);
      burst(x, y, {
        count: 10 + best.tier * 4,
        colors: [TIERS[best.tier].color, '#ffffff'],
        power: 0.8 + best.tier * 0.18,
      });
      if (best.tier >= 3) {
        play('rare');
        floatText(x, y - 30, `${best.name}!`, 'rare');
      }
    },
  },
};

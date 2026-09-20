// IPO panel - prestige, perks and the lifetime stat sheet.

import { state } from '../../core/state.js';
import { PERKS, SHARE_BONUS } from '../../data/staff.js';
import { pendingShares, nextShareAt, canPrestige, doPrestige, buyPerk, shareMultiplier } from '../../systems/prestige.js';
import { fmtMoney, fmtNum, fmtMult, fmtTime } from '../../core/format.js';
import { esc } from '../dom.js';
import { icon } from '../icons.js';
import { play } from '../../core/audio.js';
import { toast } from '../fx.js';

let confirming = false;

function perkCard(perk) {
  const owned = !!state.prestige.perks[perk.id];
  const afford = state.prestige.shares >= perk.cost;
  return `
  <article class="card perk-card${owned ? ' owned' : ''}">
    <header class="card-head">
      <span class="card-icon">${icon('star')}</span>
      <div><h3>${esc(perk.name)}</h3><p class="card-sub">${owned ? 'Owned' : `${perk.cost} share${perk.cost > 1 ? 's' : ''}`}</p></div>
    </header>
    <p class="flavor">${esc(perk.desc)}</p>
    ${owned ? '' : `<div class="card-actions">
      <button class="btn btn-gold" data-act="ipo:perk" data-id="${perk.id}" ${afford ? '' : 'disabled'}>Buy perk</button>
    </div>`}
  </article>`;
}

function statRow(label, value) {
  return `<div class="stat-row"><span>${label}</span><b>${value}</b></div>`;
}

export default {
  id: 'ipo',
  label: 'IPO',
  icon: 'ipo',
  visible: () => state.lifetime >= 2e6 || state.prestige.runs > 0,
  badge: () => (canPrestige() ? String(pendingShares()) : null),

  render() {
    const pending = pendingShares();
    const s = state.stats;
    return `
    <div class="panel-head">
      <div>
        <h2>Go public</h2>
        <p class="muted">Wind the company up, keep the reputation. Money, parts, builds, staff, facilities and upgrades are gone; blueprints you have discovered stay discovered.</p>
      </div>
      <div class="stat-pill">Global ${fmtMult(shareMultiplier())}</div>
    </div>

    <section class="ipo-hero">
      <div class="ipo-figure">
        <b>${fmtNum(pending, { int: true })}</b>
        <i>shares on offer</i>
      </div>
      <div class="ipo-detail">
        <p>This run has earned <b>${fmtMoney(state.runEarned)}</b>. Next share at <b>${fmtMoney(nextShareAt())}</b>.</p>
        <p class="muted">Each share held is worth +${(SHARE_BONUS * 100).toFixed(0)}% to every dollar you make, forever. You hold ${fmtNum(state.prestige.lifetimeShares, { int: true })} (${fmtNum(state.prestige.shares, { int: true })} unspent) across ${fmtNum(state.prestige.runs, { int: true })} rebrand${state.prestige.runs === 1 ? '' : 's'}.</p>
        <button class="btn ${confirming ? 'btn-danger' : 'btn-gold'} btn-big" data-act="ipo:go" ${canPrestige() ? '' : 'disabled'}>
          ${canPrestige() ? (confirming ? 'Confirm - sell the company' : `Rebrand for ${pending} share${pending > 1 ? 's' : ''}`) : 'Not enough to float yet'}
        </button>
      </div>
    </section>

    <div class="panel-head compact"><h3>Perks</h3><span class="muted">${fmtNum(state.prestige.shares, { int: true })} shares to spend</span></div>
    <div class="card-grid">${PERKS.map(perkCard).join('')}</div>

    <div class="panel-head compact"><h3>Lifetime</h3></div>
    <div class="stat-grid">
      ${statRow('Earned, all time', fmtMoney(state.lifetime))}
      ${statRow('Earned this run', fmtMoney(state.runEarned))}
      ${statRow('Clicks', fmtNum(state.clicks, { int: true }))}
      ${statRow('Earned by hand', fmtMoney(s.clickEarned))}
      ${statRow('Crates opened', fmtNum(s.cratesOpened, { int: true }))}
      ${statRow('Parts acquired', fmtNum(s.partsGained, { int: true }))}
      ${statRow('Parts salvaged', fmtNum(s.salvaged, { int: true }))}
      ${statRow('Builds finished', fmtNum(s.builds, { int: true }))}
      ${statRow('Builds sold', fmtNum(s.sales, { int: true }))}
      ${statRow('Best single sale', fmtMoney(s.bestSale))}
      ${statRow('Best build ever', fmtMoney(s.bestBuild))}
      ${statRow('Wheelie best', fmtNum(state.wheelie.best, { int: true }) + ' pts')}
      ${statRow('Wheelie earnings', fmtMoney(state.wheelie.earned))}
      ${statRow('Schematic fragments', `${state.fragments}/4`)}
      ${statRow('Time in business', fmtTime((Date.now() - state.time.started) / 1000))}
    </div>`;
  },

  actions: {
    'ipo:go': () => {
      if (!canPrestige()) { play('error'); return; }
      if (!confirming) {
        confirming = true;
        toast('Press again to confirm. Everything except shares, perks and blueprints is wiped.', 'warn');
        setTimeout(() => { confirming = false; }, 6000);
        return;
      }
      confirming = false;
      doPrestige();
    },
    'ipo:perk': (ds) => {
      if (buyPerk(ds.id)) play('unlock');
      else play('error');
    },
  },
};

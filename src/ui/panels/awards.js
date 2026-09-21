// Awards panel - the badge wall. Each one is worth +1% to everything.

import { state } from '../../core/state.js';
import { ACHIEVEMENTS, AWARD_BONUS } from '../../data/achievements.js';
import { awardCount, achievementBonus } from '../../systems/achievements.js';
import { fmtMult, fmtTime } from '../../core/format.js';
import { esc } from '../dom.js';
import { icon } from '../icons.js';

function tile(a) {
  const earned = !!state.awards[a.id];
  const hidden = a.secret && !earned;
  return `
  <div class="award${earned ? ' is-earned' : ''}${hidden ? ' is-hidden' : ''}" title="${hidden ? 'Secret award' : esc(a.desc)}">
    <span class="award-icon">${icon(hidden ? 'lock' : a.icon || 'star')}</span>
    <span class="award-text">
      <b>${hidden ? '???' : esc(a.name)}</b>
      <i>${hidden ? 'Something nobody has told you about yet.' : esc(a.desc)}</i>
    </span>
  </div>`;
}

export default {
  id: 'awards',
  label: 'Awards',
  icon: 'star',
  visible: () => true,
  badge: () => {
    const n = awardCount();
    return n ? `${n}` : null;
  },

  render() {
    const earned = ACHIEVEMENTS.filter((a) => state.awards[a.id]);
    const rest = ACHIEVEMENTS.filter((a) => !state.awards[a.id]);
    return `
    <div class="panel-head">
      <div>
        <h2>Awards</h2>
        <p class="muted">${earned.length} of ${ACHIEVEMENTS.length}. Every badge is worth
          +${(AWARD_BONUS * 100).toFixed(0)}% to every dollar you make, forever.</p>
      </div>
      <div class="stat-pill pill-gold">${fmtMult(achievementBonus())} from awards</div>
    </div>
    <div class="award-grid">
      ${earned.map(tile).join('')}
      ${rest.map(tile).join('')}
    </div>
    ${earned.length ? `<p class="muted small" style="margin-top:14px">
      Most recent: ${esc(earned.sort((a, b) => state.awards[b.id] - state.awards[a.id])[0].name)},
      ${fmtTime((Date.now() - state.awards[earned[0].id]) / 1000)} ago.</p>` : ''}`;
  },
};

// Shop Network panel - host or join a room, see everyone's shop, send bikes.

import { state } from '../../core/state.js';
import {
  netStatus, hostRoom, joinRoom, leaveRoom, setPlayerName, playerName,
  giftBuild, announce,
} from '../../net/room.js';
import { TIERS } from '../../data/parts.js';
import { fmtMoney, fmtRate, fmtNum, fmtTime } from '../../core/format.js';
import { esc } from '../dom.js';
import { icon } from '../icons.js';
import { toast } from '../fx.js';
import { play } from '../../core/audio.js';

let giftTarget = '';
let giftUid = '';

function lobby(net) {
  return `
  <div class="net-lobby">
    <div class="net-card">
      <h3>${icon('staff')} Your shop name</h3>
      <input class="net-input" id="net-name" maxlength="18" value="${esc(playerName())}"
             data-change="net:name" placeholder="Name your shop">
      <p class="muted small">Everyone in the room sees this next to your numbers.</p>
    </div>

    <div class="net-card">
      <h3>Open a room</h3>
      <p class="muted small">You become the host. Share the five letter code and anyone can
        drop in - their game keeps running exactly as it is.</p>
      <button class="btn btn-primary btn-big" data-act="net:host">Host a room</button>
    </div>

    <div class="net-card">
      <h3>Join a room</h3>
      <input class="net-input net-code-input" id="net-code" maxlength="5" placeholder="CODE"
             value="${esc(state.net.lastRoom || '')}" data-change="net:code">
      <button class="btn btn-big" data-act="net:join">Join</button>
    </div>

    ${net.status === 'error' ? `<p class="net-error">${esc(net.error)}</p>` : ''}
    ${net.status === 'connecting' ? '<p class="muted">Connecting...</p>' : ''}

    <p class="muted small net-note">
      Peer to peer over WebRTC - there is no server and nothing is uploaded. It is a game for
      people you know: nobody is checking whether the bike your friend sends you is real.
    </p>
  </div>`;
}

function playerRow(p, rank, meId) {
  const me = p.id === meId;
  return `
  <div class="net-row${me ? ' is-me' : ''}" style="--c:${TIERS[Math.min(5, p.tier || 0)].color}">
    <span class="net-rank">${rank}</span>
    <span class="net-name">${esc(p.name)}${me ? ' <i>(you)</i>' : ''}<i>${esc(p.bike || '-')}</i></span>
    <span class="net-money"><b>${fmtMoney(p.lifetime)}</b><i>${fmtRate(p.rate || 0)}</i></span>
    <span class="net-extra">
      ${p.builds ? `<span title="Builds finished">${icon('wrench')}${fmtNum(p.builds, { int: true })}</span>` : ''}
    </span>
  </div>`;
}

function giftPanel(net) {
  const others = net.players.filter((p) => p.id !== net.myId);
  const sellable = state.garage.filter((it) => !it.starter);
  if (!others.length) {
    return '<p class="muted small">Nobody else is here yet. Send them the code.</p>';
  }
  if (!sellable.length) {
    return '<p class="muted small">Build something and you can post it to another shop.</p>';
  }
  return `
  <div class="net-gift">
    <select class="net-input" data-change="net:giftitem">
      <option value="">Pick a build...</option>
      ${sellable.slice(0, 60).map((it) => `<option value="${it.uid}"${it.uid === giftUid ? ' selected' : ''}>
        ${esc(it.name)} - ${fmtMoney(it.value)}</option>`).join('')}
    </select>
    <select class="net-input" data-change="net:gifttarget">
      <option value="">Send to...</option>
      ${others.map((p) => `<option value="${p.id}"${p.id === giftTarget ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
    </select>
    <button class="btn btn-primary" data-act="net:gift" ${giftUid && giftTarget ? '' : 'disabled'}>Ship it</button>
  </div>`;
}

export default {
  id: 'network',
  label: 'Network',
  icon: 'staff',
  visible: () => true,
  badge: () => {
    const net = netStatus();
    return net.status === 'open' ? String(net.players.length) : null;
  },

  render() {
    const net = netStatus();
    if (net.status !== 'open') {
      return `
      <div class="panel-head">
        <div>
          <h2>Shop Network</h2>
          <p class="muted">Play alongside other shops: a live leaderboard, a shared feed, and you
            can post finished builds to each other. Catching a golden spanner boosts the whole room.</p>
        </div>
      </div>
      ${lobby(net)}`;
    }

    return `
    <div class="panel-head">
      <div>
        <h2>Shop Network</h2>
        <p class="muted">${net.isHost ? 'You are hosting' : 'Connected'} &middot;
          ${net.players.length} shop${net.players.length === 1 ? '' : 's'} trading.</p>
      </div>
      <div class="net-code" data-act="net:copy" title="Click to copy">
        <i>ROOM</i><b>${esc(net.code)}</b>
      </div>
    </div>

    <div class="net-list">
      ${net.players.map((p, i) => playerRow(p, i + 1, net.myId)).join('')}
    </div>

    <div class="panel-head compact"><h3>Post a build</h3></div>
    ${giftPanel(net)}

    <div class="panel-head compact"><h3>Feed</h3>
      <button class="btn btn-tiny" data-act="net:wave">Say hello</button>
    </div>
    <div class="net-feed">
      ${net.feed.length
    ? net.feed.map((f) => `<div class="net-feed-line net-${f.kind}">
          <i>${fmtTime((Date.now() - f.at) / 1000)} ago</i> ${esc(f.text)}</div>`).join('')
    : '<p class="muted small">Quiet in here.</p>'}
    </div>

    <div class="card-actions" style="margin-top:14px">
      <button class="btn btn-danger" data-act="net:leave">Leave the room</button>
    </div>`;
  },

  actions: {
    'net:host': () => { play('buy'); hostRoom(); },
    'net:join': () => {
      const box = document.getElementById('net-code');
      play('buy');
      joinRoom(box ? box.value : state.net.lastRoom);
    },
    'net:leave': () => { leaveRoom(); play('error'); },
    'net:name': (ds, ev, target) => setPlayerName(target.value),
    'net:code': (ds, ev, target) => { state.net.lastRoom = target.value.toUpperCase(); },
    'net:giftitem': (ds, ev, target) => { giftUid = target.value; },
    'net:gifttarget': (ds, ev, target) => { giftTarget = target.value; },
    'net:gift': () => {
      if (!giftBuild(giftTarget, giftUid)) { play('error'); return; }
      giftUid = '';
      play('sell');
      toast('Build shipped.', 'good');
    },
    'net:wave': () => { announce('is open for business.'); play('tickUp'); },
    'net:copy': () => {
      const code = netStatus().code;
      navigator.clipboard?.writeText(code).then(
        () => toast(`Room code ${code} copied.`, 'good'),
        () => toast(`Room code: ${code}`, 'info'),
      );
    },
  },
};

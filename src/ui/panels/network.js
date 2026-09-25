// Shop Network panel - host or join a room, then: leaderboard + shop profiles,
// room chat, a market, gifts, and host-run events.

import { state } from '../../core/state.js';
import {
  netStatus, hostRoom, joinRoom, leaveRoom, setPlayerName, playerName, inviteLink,
  giftBuild, giftParts, sendChat, react, REACTIONS, markViewed,
  listBuild, listParts, cancelListing, buyListing, isBuying, suggestBuildPrice, suggestPartsPrice,
  startEvent, EVENT_TYPES,
} from '../../net/room.js';
import { TIERS, PARTS } from '../../data/parts.js';
import { gradeFor } from '../../minigame/wheelie.js';
import { fmtMoney, fmtRate, fmtNum, fmtPct, parseMoney } from '../../core/format.js';
import { esc } from '../dom.js';
import { icon } from '../icons.js';
import { bikeSVG } from '../bikeArt.js';
import { toast } from '../fx.js';
import { play } from '../../core/audio.js';
import { on, EVENTS } from '../../core/events.js';

// UI-only state. Kept here so a re-render (every half second) never loses what
// someone was halfway through choosing or typing.
const ui = {
  sort: 'lifetime',
  inspect: '',
  chat: '',
  sellKind: 'build', sellUid: '', sellPart: '', sellQty: '1', sellPrice: '',
  giftKind: 'build', giftTarget: '', giftUid: '', giftPart: '', giftQty: '1',
};

const SORTS = [
  ['lifetime', 'Earned', (p) => p.lifetime],
  ['rate', 'Income', (p) => p.rate],
  ['wheelie', 'Wheelie', (p) => p.wheelieBest],
  ['trophies', 'Trophies', (p) => p.trophies],
];

const tierColor = (t) => TIERS[Math.max(0, Math.min(TIERS.length - 1, t | 0))].color;

// --- lobby ---------------------------------------------------------------------

function lobby(net) {
  const last = state.net.lastRoom || '';
  return `
  <div class="net-lobby">
    <div class="net-card">
      <h3>${icon('person')} Your shop name</h3>
      <input class="net-input" id="net-name" maxlength="18" value="${esc(playerName())}"
             data-change="net:name" placeholder="Name your shop">
      <p class="muted small">Everyone in the room sees this on the leaderboard and in chat.</p>
    </div>

    <div class="net-card">
      <h3>${icon('star')} Host a room</h3>
      <p class="muted small">You get a five letter code and an invite link. You run the room:
        you start the events, and the room stays open while your tab does.</p>
      <button class="btn btn-primary btn-big" data-act="net:host" ${net.status === 'connecting' ? 'disabled' : ''}>Host a room</button>
    </div>

    <div class="net-card">
      <h3>${icon('crate')} Join a room</h3>
      <input class="net-input net-code-input" id="net-code" maxlength="5" placeholder="CODE"
             value="${esc(last)}" data-change="net:code">
      <button class="btn btn-big" data-act="net:join" ${net.status === 'connecting' ? 'disabled' : ''}>
        ${net.status === 'connecting' ? 'Connecting...' : 'Join'}</button>
    </div>

    ${net.status === 'error' ? `<p class="net-error">${esc(net.error)}</p>` : ''}

    <div class="net-perks">
      <div><b>Chat</b><span>Talk, cheer, and see everyone's milestones as they happen.</span></div>
      <div><b>Market</b><span>List builds or parts at your price - anyone in the room can buy.</span></div>
      <div><b>Gifts</b><span>Send a build or a stack of parts straight to a friend.</span></div>
      <div><b>Events</b><span>Build Rush and Wheelie Cup: three minutes, prizes, trophies.</span></div>
      <div><b>Room bonus</b><span>+5% sale price for every other shop online, up to +25%.</span></div>
    </div>

    <p class="muted small net-note">
      Peer to peer over WebRTC - there is no game server and nothing is uploaded. It is a game
      for people you know: nobody checks whether the bike your friend sends you is real.
    </p>
  </div>`;
}

// --- leaderboard + profiles --------------------------------------------------

function playerRow(p, rank, net) {
  const me = p.id === net.myId;
  const host = p.id === net.hostId;
  const open = ui.inspect === p.id;
  return `
  <button class="net-row${me ? ' is-me' : ''}${open ? ' is-open' : ''}" style="--c:${tierColor(p.bike ? p.bike.tier : 0)}"
          data-act="net:inspect" data-id="${esc(p.id)}">
    <span class="net-rank">${rank}</span>
    <span class="net-name">${host ? '<span class="net-crown" title="Host">&#9819;</span>' : ''}${esc(p.name)}${me ? ' <i class="net-you">you</i>' : ''}
      <i>${esc(p.bike ? p.bike.name : '-')}</i></span>
    <span class="net-money"><b>${fmtMoney(p.lifetime)}</b><i>${fmtRate(p.rate || 0)}</i></span>
    <span class="net-extra">
      ${p.trophies ? `<span title="Event wins">&#127942;${fmtNum(p.trophies, { int: true })}</span>` : ''}
      ${p.wheelieBest ? `<span class="grade-chip grade-${gradeFor(p.wheelieBest).id}" title="Best wheelie ${fmtNum(p.wheelieBest, { int: true })}">${gradeFor(p.wheelieBest).id}</span>` : ''}
    </span>
  </button>`;
}

function inspector(p, net) {
  const me = p.id === net.myId;
  const bike = p.bike ? { ...p.bike } : null;
  return `
  <div class="net-inspect" style="--c:${tierColor(bike ? bike.tier : 0)}">
    <div class="net-inspect-art">${bikeSVG(bike)}</div>
    <div class="net-inspect-main">
      <h3>${esc(p.name)}${me ? ' <i class="net-you">you</i>' : ''}</h3>
      <p class="muted small">In the window: <b>${esc(bike ? bike.name : 'nothing')}</b>${bike ? ` &middot; ${TIERS[bike.tier].name}` : ''}</p>
      <div class="net-stats">
        <div><b>${fmtMoney(p.lifetime)}</b><i>earned</i></div>
        <div><b>${fmtRate(p.rate || 0)}</b><i>income</i></div>
        <div><b>${fmtMoney(p.money)}</b><i>cash</i></div>
        <div><b>${fmtNum(p.builds, { int: true })}</b><i>builds</i></div>
        <div><b>${fmtNum(p.crates, { int: true })}</b><i>crates</i></div>
        <div><b>${p.wheelieBest ? `${fmtNum(p.wheelieBest, { int: true })} ${gradeFor(p.wheelieBest).id}` : '-'}</b><i>wheelie best</i></div>
        <div><b>${fmtNum(p.sRuns, { int: true })}</b><i>S wheelies</i></div>
        <div><b>${fmtNum(p.trophies, { int: true })}</b><i>trophies</i></div>
      </div>
      ${me ? `
      <label class="net-rename">Shop name
        <input class="net-input" maxlength="18" value="${esc(p.name)}" data-change="net:name">
      </label>` : `
      <div class="net-react">
        ${REACTIONS.map((e) => `<button class="net-emoji" data-act="net:react" data-id="${esc(p.id)}" data-e="${e}" title="Send ${e}">${e}</button>`).join('')}
        <button class="btn btn-tiny" data-act="net:giftto" data-id="${esc(p.id)}">Send a gift</button>
      </div>`}
    </div>
  </div>`;
}

function leaderboard(net) {
  const [, , key] = SORTS.find(([id]) => id === ui.sort) || SORTS[0];
  const rows = [...net.players].sort((a, b) => key(b) - key(a));
  const open = rows.find((p) => p.id === ui.inspect);
  return `
  <section class="net-col">
    <div class="net-col-head">
      <h3>Leaderboard</h3>
      <div class="ix-tabs">${SORTS.map(([id, label]) => `
        <button class="amt${ui.sort === id ? ' is-on' : ''}" data-act="net:sort" data-id="${id}">${label}</button>`).join('')}</div>
    </div>
    <div class="net-list">${rows.map((p, i) => playerRow(p, i + 1, net)).join('')}</div>
    ${open ? inspector(open, net) : '<p class="muted small">Click a shop to see their bike and send a cheer.</p>'}
  </section>`;
}

// --- chat --------------------------------------------------------------------------

// A clock time, not "5s ago": a timestamp that ticks would change the panel's
// markup every second and force a full re-render just to update it.
function stamp(at) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function logLine(e) {
  const ago = stamp(e.at);
  if (e.kind === 'chat') {
    return `<div class="net-line k-chat${e.mine ? ' is-mine' : ''}">
      <b style="color:${tierColor(e.tier)}">${esc(e.name)}</b> ${esc(e.text)} <i>${ago}</i></div>`;
  }
  return `<div class="net-line k-${esc(e.kind)}">${esc(e.text)} <i>${ago}</i></div>`;
}

export function logHTML(log) {
  return log.length ? log.map(logLine).join('') : '<p class="muted small">Quiet in here. Say something.</p>';
}

function chat(net) {
  return `
  <section class="net-col">
    <div class="net-col-head"><h3>Room chat</h3></div>
    <div class="net-chat-bar">
      <input class="net-input" id="net-chat" maxlength="200" placeholder="Say something to the room..."
             value="${esc(ui.chat)}" data-input="net:draft" autocomplete="off">
      <button class="btn btn-primary" data-act="net:send">Send</button>
    </div>
    <div class="net-quick">${['👋', '🔥', '😂', 'gg', 'nice bike', 'how?!'].map((q) => `
      <button class="net-emoji" data-act="net:quick" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div class="net-log" id="net-log">${logHTML(net.log)}</div>
  </section>`;
}

// --- events ----------------------------------------------------------------------

function eventBanner(net) {
  const ev = net.event;
  const hostControls = net.isHost ? `
    <div class="net-event-host">
      ${Object.entries(EVENT_TYPES).map(([id, t]) => `
        <button class="btn" data-act="net:event" data-id="${id}" ${ev && ev.running ? 'disabled' : ''}>
          Start ${esc(t.name)}<i>${esc(t.blurb)}, ${t.seconds / 60} min</i></button>`).join('')}
    </div>` : '';

  if (!ev) {
    return `<section class="net-event is-idle">
      <div><h3>Events</h3>
        <p class="muted small">${net.isHost
    ? 'Start a three minute contest. Everyone in the room is entered automatically.'
    : 'The host can start a three minute contest - you are entered automatically.'}
          Top three win cash (1st also gets a trophy).</p></div>
      ${hostControls}
    </section>`;
  }

  const left = Math.ceil(ev.left);
  const board = ev.standings.slice(0, 5).map((r, i) => `
    <div class="net-ev-row${r.id === net.myId ? ' is-me' : ''}">
      <span>${['&#129351;', '&#129352;', '&#129353;'][i] || `#${i + 1}`}</span>
      <b>${esc(r.name)}</b>
      <i>${fmtNum(r.score, { int: true })} ${esc(ev.unit)}</i>
    </div>`).join('');
  return `
  <section class="net-event${ev.running ? ' is-live' : ''}">
    <div class="net-event-head">
      <div>
        <h3>${esc(ev.name)} ${ev.running ? '<span class="net-live">LIVE</span>' : '<span class="net-done">FINISHED</span>'}</h3>
        <p class="muted small">${esc(ev.blurb)}.
          ${ev.running ? `Your score: <b>${fmtNum(ev.myScore, { int: true })} ${esc(ev.unit)}</b>` : ''}</p>
      </div>
      ${ev.running ? `<div class="net-clock">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div>` : ''}
    </div>
    <div class="net-ev-board">${board || '<p class="muted small">No scores yet.</p>'}</div>
    <p class="muted small">Your prizes: 1st ${fmtMoney(ev.prizes[0])} + trophy &middot; 2nd ${fmtMoney(ev.prizes[1])} &middot; 3rd ${fmtMoney(ev.prizes[2])}</p>
    ${hostControls}
  </section>`;
}

// --- market -------------------------------------------------------------------------

function listingCard(l, net) {
  const mine = l.seller === net.myId;
  const buying = isBuying(l.lid);
  const afford = state.money >= l.price;
  return `
  <article class="card net-listing" style="--c:${tierColor(l.tier)}">
    <header class="card-head">
      <span class="card-icon">${icon(l.kind === 'build' ? 'garage' : 'crate')}</span>
      <div><h3>${esc(l.title)}</h3><p class="card-sub">${l.kind === 'build' ? 'Build' : 'Parts'} &middot; ${TIERS[l.tier].name} &middot; from ${esc(l.sellerName)}</p></div>
      <span class="card-price${mine || afford ? '' : ' unaffordable'}">${fmtMoney(l.price)}</span>
    </header>
    <div class="card-actions">
      ${mine
    ? `<button class="btn" data-act="net:unlist" data-id="${esc(l.lid)}">Take it back</button>`
    : `<button class="btn btn-primary" data-act="net:buy" data-id="${esc(l.lid)}" ${afford && !buying ? '' : 'disabled'}>
        ${buying ? 'Buying...' : `Buy for ${fmtMoney(l.price)}`}</button>`}
    </div>
  </article>`;
}

function ownedParts() {
  return Object.keys(state.parts)
    .filter((id) => PARTS[id] && state.parts[id] > 0)
    .sort((a, b) => PARTS[b].tier - PARTS[a].tier || PARTS[b].value - PARTS[a].value)
    .slice(0, 120);
}

function buildOptions(selected) {
  const builds = state.garage.filter((it) => !it.starter).sort((a, b) => b.value - a.value).slice(0, 80);
  if (!builds.length) return '<option value="">No builds on the floor</option>';
  return `<option value="">Pick a build...</option>${builds.map((it) => `
    <option value="${it.uid}"${it.uid === selected ? ' selected' : ''}>${esc(it.name)} - ${fmtMoney(it.value)}</option>`).join('')}`;
}

function partOptions(selected) {
  const ids = ownedParts();
  if (!ids.length) return '<option value="">The bin is empty</option>';
  return `<option value="">Pick a part...</option>${ids.map((id) => `
    <option value="${id}"${id === selected ? ' selected' : ''}>${esc(PARTS[id].name)} (${TIERS[PARTS[id].tier].name}) x${fmtNum(state.parts[id], { int: true })}</option>`).join('')}`;
}

function kindToggle(act, current) {
  return `<div class="ix-tabs">
    <button class="amt${current === 'build' ? ' is-on' : ''}" data-act="${act}" data-id="build">Build</button>
    <button class="amt${current === 'parts' ? ' is-on' : ''}" data-act="${act}" data-id="parts">Parts</button>
  </div>`;
}

function suggestedPrice() {
  if (ui.sellKind === 'build') {
    const it = state.garage.find((x) => x.uid === ui.sellUid);
    return it ? suggestBuildPrice(it) : 0;
  }
  return ui.sellPart ? suggestPartsPrice(ui.sellPart, Number(ui.sellQty) || 1) : 0;
}

function market(net) {
  const suggest = suggestedPrice();
  return `
  <section class="net-section">
    <div class="net-col-head"><h3>Market</h3><span class="muted small">${net.listings.length} for sale</span></div>
    ${net.listings.length
    ? `<div class="card-grid">${net.listings.map((l) => listingCard(l, net)).join('')}</div>`
    : '<p class="muted small">Nothing for sale yet. List something below.</p>'}
    <div class="net-form">
      <div class="net-form-head"><b>Sell to the room</b>${kindToggle('net:sellkind', ui.sellKind)}</div>
      <div class="net-form-row">
        ${ui.sellKind === 'build'
    ? `<select class="net-input" data-change="net:selluid">${buildOptions(ui.sellUid)}</select>`
    : `<select class="net-input" data-change="net:sellpart">${partOptions(ui.sellPart)}</select>
       <input class="net-input net-qty" type="number" min="1" value="${esc(ui.sellQty)}" data-input="net:sellqty" title="How many">`}
        <input class="net-input net-price" placeholder="${suggest ? `price, e.g. ${fmtNum(suggest)}` : 'price, e.g. 1.5T'}"
               value="${esc(ui.sellPrice)}" data-input="net:sellprice">
        <button class="btn btn-primary" data-act="net:list">List it</button>
      </div>
      <p class="muted small">Listed goods are held until they sell or you take them back - leaving the room returns them.
        Prices take suffixes: 1.5K, 20T, 3Qa, 10Sx.</p>
    </div>
  </section>`;
}

function gifts(net) {
  const others = net.players.filter((p) => p.id !== net.myId);
  if (!others.length) return '';
  return `
  <section class="net-section">
    <div class="net-form">
      <div class="net-form-head"><b>Send a gift</b>${kindToggle('net:giftkind', ui.giftKind)}</div>
      <div class="net-form-row">
        ${ui.giftKind === 'build'
    ? `<select class="net-input" data-change="net:giftuid">${buildOptions(ui.giftUid)}</select>`
    : `<select class="net-input" data-change="net:giftpart">${partOptions(ui.giftPart)}</select>
       <input class="net-input net-qty" type="number" min="1" value="${esc(ui.giftQty)}" data-input="net:giftqty" title="How many">`}
        <select class="net-input" data-change="net:gifttarget">
          <option value="">Send to...</option>
          ${others.map((p) => `<option value="${esc(p.id)}"${p.id === ui.giftTarget ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
        <button class="btn btn-primary" data-act="net:gift">Send</button>
      </div>
    </div>
  </section>`;
}

// --- panel --------------------------------------------------------------------------

function sendDraft() {
  const input = document.getElementById('net-chat');
  const text = input ? input.value : ui.chat;
  if (!sendChat(text)) return;
  ui.chat = '';
  if (input) { input.value = ''; input.focus(); }
  play('tickUp');
}

// New chat lines arrive while someone is typing, and the panel does not
// re-render while an input has focus - so patch the log in place.
on(EVENTS.NET, () => {
  const box = document.getElementById('net-log');
  if (box) {
    const html = logHTML(netStatus().log);
    if (box.__last !== html) { box.__last = html; box.innerHTML = html; }
  }
});

export default {
  id: 'network',
  label: 'Network',
  icon: 'person',
  visible: () => true,
  badge: () => {
    const net = netStatus();
    if (net.status !== 'open') return null;
    return net.unread ? `${net.unread > 9 ? '9+' : net.unread} new` : String(net.players.length);
  },

  render() {
    const net = netStatus();
    markViewed();
    if (net.status !== 'open') {
      return `
      <div class="panel-head">
        <div>
          <h2>Shop Network</h2>
          <p class="muted">Play with friends: a live leaderboard, chat, a market, gifts and timed events.</p>
        </div>
      </div>
      ${lobby(net)}`;
    }

    return `
    <div class="panel-head">
      <div>
        <h2>Shop Network</h2>
        <p class="muted">${net.isHost ? 'You are hosting' : 'Connected'} &middot;
          ${net.players.length} shop${net.players.length === 1 ? '' : 's'} &middot;
          <span class="net-bonus" title="+5% sale price per other shop online, max +25%">room bonus ${fmtPct(net.bonus)} sale price</span></p>
      </div>
      <div class="net-head-actions">
        <div class="net-code" data-act="net:copy" title="Click to copy the code"><i>ROOM</i><b>${esc(net.code)}</b></div>
        <button class="btn" data-act="net:invite">${icon('sell')} Copy invite link</button>
        <button class="btn btn-danger" data-act="net:leave">Leave</button>
      </div>
    </div>

    ${eventBanner(net)}

    <div class="net-grid">
      ${leaderboard(net)}
      ${chat(net)}
    </div>

    ${market(net)}
    ${gifts(net)}`;
  },

  mount() {
    const input = document.getElementById('net-chat');
    if (input) {
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); sendDraft(); }
      });
    }
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

    'net:sort': (ds) => { ui.sort = ds.id; },
    'net:inspect': (ds) => { ui.inspect = ui.inspect === ds.id ? '' : ds.id; play('drop'); },
    'net:react': (ds) => { if (react(ds.id, ds.e)) play('coin'); },

    'net:draft': (ds, ev, target) => { ui.chat = target.value; },
    'net:send': () => sendDraft(),
    'net:quick': (ds) => { if (sendChat(ds.q)) play('tickUp'); },

    'net:event': (ds) => {
      if (startEvent(ds.id)) { play('unlock'); toast(`${EVENT_TYPES[ds.id].name} started.`, 'good'); } else play('error');
    },

    'net:sellkind': (ds) => { ui.sellKind = ds.id; ui.sellPrice = ''; },
    'net:selluid': (ds, ev, target) => { ui.sellUid = target.value; },
    'net:sellpart': (ds, ev, target) => { ui.sellPart = target.value; },
    'net:sellqty': (ds, ev, target) => { ui.sellQty = target.value; },
    'net:sellprice': (ds, ev, target) => { ui.sellPrice = target.value; },
    'net:list': () => {
      const price = ui.sellPrice.trim() ? parseMoney(ui.sellPrice) : suggestedPrice();
      if (!(price > 0)) { toast('That price did not read - try 1500, 2.5T or 10Sx.', 'bad'); play('error'); return; }
      const ok = ui.sellKind === 'build'
        ? listBuild(ui.sellUid, price)
        : listParts(ui.sellPart, Math.max(1, Math.floor(Number(ui.sellQty) || 1)), price);
      if (!ok) { toast('Pick something you own to list.', 'bad'); play('error'); return; }
      ui.sellUid = '';
      ui.sellPrice = '';
      play('sell');
      toast(`Listed for ${fmtMoney(price)}.`, 'good');
    },
    'net:unlist': (ds) => { if (cancelListing(ds.id)) { play('drop'); toast('Back in your shop.', 'info'); } },
    'net:buy': (ds) => {
      if (!buyListing(ds.id)) { play('error'); return; }
      play('buy');
    },

    'net:giftkind': (ds) => { ui.giftKind = ds.id; },
    'net:giftuid': (ds, ev, target) => { ui.giftUid = target.value; },
    'net:giftpart': (ds, ev, target) => { ui.giftPart = target.value; },
    'net:giftqty': (ds, ev, target) => { ui.giftQty = target.value; },
    'net:gifttarget': (ds, ev, target) => { ui.giftTarget = target.value; },
    'net:giftto': (ds) => {
      ui.giftTarget = ds.id;
      document.querySelector('[data-change="net:gifttarget"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    'net:gift': () => {
      if (!ui.giftTarget) { toast('Pick who to send it to.', 'bad'); play('error'); return; }
      const ok = ui.giftKind === 'build'
        ? giftBuild(ui.giftTarget, ui.giftUid)
        : giftParts(ui.giftTarget, ui.giftPart, Math.max(1, Math.floor(Number(ui.giftQty) || 1)));
      if (!ok) { toast('Pick something you own to send.', 'bad'); play('error'); return; }
      ui.giftUid = '';
      play('sell');
      toast('Sent.', 'good');
    },

    'net:copy': () => {
      const code = netStatus().code;
      navigator.clipboard?.writeText(code).then(
        () => toast(`Room code ${code} copied.`, 'good'),
        () => toast(`Room code: ${code}`, 'info'),
      );
    },
    'net:invite': () => {
      const link = inviteLink();
      navigator.clipboard?.writeText(link).then(
        () => toast('Invite link copied - anyone who opens it joins this room.', 'good'),
        () => toast(link, 'info'),
      );
    },
  },
};

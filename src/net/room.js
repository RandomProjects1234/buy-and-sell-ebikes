// ---------------------------------------------------------------------------
// SHOP NETWORK - peer-to-peer multiplayer
// ---------------------------------------------------------------------------
// There is no server: one player hosts a room and everyone else connects
// straight to them over WebRTC (PeerJS). The host is the hub - it relays every
// message to the rest of the room, so the topology stays a simple star.
//
// PeerJS is loaded from a CDN the first time someone actually opens a room, so
// the single player game keeps its "zero dependencies, works offline" promise.
//
// This is a game you play with friends: nothing here is validated against
// cheating, and a hostile peer could send you a silly bike. That is a trade
// everyone in the room has already made by sharing a code.

import { state } from '../core/state.js';
import { emit, EVENTS } from '../core/events.js';
import { incomePerSec } from '../systems/economy.js';
import { addBuff } from '../systems/buffs.js';
import { uid } from '../core/rng.js';

const PEER_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js';
const PREFIX = 'bse1-';
const STATUS_EVERY = 2.5;      // seconds between presence broadcasts
const FEED_MAX = 40;

let peer = null;
let conns = new Map();         // peerId -> DataConnection (host: everyone, client: just the host)
let isHost = false;
let roomCode = '';
let status = 'off';            // off | connecting | open | error
let error = '';
let myId = '';
let players = new Map();       // id -> profile
let feed = [];
let sinceStatus = 0;

export function netStatus() {
  return {
    status, code: roomCode, isHost, error, myId,
    players: [...players.values()].sort((a, b) => b.lifetime - a.lifetime),
    feed,
  };
}

export function isOnline() { return status === 'open'; }

function changed() { emit(EVENTS.NET, netStatus()); }

function pushFeed(text, kind = 'info') {
  feed = [{ text, kind, at: Date.now() }, ...feed].slice(0, FEED_MAX);
  changed();
}

function loadPeerJs() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = PEER_LIB;
    tag.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS did not load')));
    tag.onerror = () => reject(new Error('Could not reach the PeerJS CDN'));
    document.head.appendChild(tag);
  });
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function playerName() {
  if (!state.net.name) {
    state.net.name = 'Shop ' + makeCode().slice(0, 3);
  }
  return state.net.name;
}

export function setPlayerName(name) {
  state.net.name = String(name || '').slice(0, 18) || playerName();
  sendStatus(true);
  changed();
}

/** The snapshot every player broadcasts about themselves. */
function profile() {
  return {
    id: myId,
    name: playerName(),
    lifetime: state.lifetime,
    money: state.money,
    rate: incomePerSec(),
    shares: state.prestige.lifetimeShares,
    awards: Object.keys(state.awards).length,
    builds: state.stats.builds,
    bike: state.showroom ? state.showroom.name : '-',
    tier: state.showroom ? state.showroom.tier : 0,
    at: Date.now(),
  };
}

// --- wiring ------------------------------------------------------------------

function wire(conn) {
  conn.on('data', (msg) => handle(msg, conn));
  conn.on('open', () => {
    conns.set(conn.peer, conn);
    if (isHost) {
      conn.send({ t: 'welcome', code: roomCode, players: [...players.values()] });
      send(conn, { t: 'status', p: profile() });
    }
    changed();
  });
  conn.on('close', () => {
    const gone = players.get(conn.peer);
    conns.delete(conn.peer);
    players.delete(conn.peer);
    if (gone) pushFeed(`${gone.name} left the network.`);
    if (isHost) relay({ t: 'left', id: conn.peer });
    else if (conn.peer === roomHostId()) {
      status = 'error';
      error = 'The host closed the room.';
    }
    changed();
  });
  conn.on('error', () => { /* a dropped peer is not fatal for the room */ });
}

function roomHostId() { return PREFIX + roomCode; }

function send(conn, msg) {
  try { conn.send(msg); } catch (err) { /* peer went away mid-send */ }
}

/** Host only: pass a message on to everyone except the sender. */
function relay(msg, exceptId) {
  if (!isHost) return;
  for (const [id, conn] of conns) {
    if (id !== exceptId) send(conn, msg);
  }
}

function handle(msg, conn) {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case 'welcome':
      roomCode = msg.code;
      status = 'open';
      for (const p of msg.players || []) players.set(p.id, p);
      pushFeed('Connected to the room.', 'good');
      sendStatus(true);
      changed();
      break;

    case 'status': {
      const p = msg.p;
      if (!p || !p.id) return;
      const known = players.has(p.id);
      players.set(p.id, p);
      if (!known && p.id !== myId) pushFeed(`${p.name} joined the network.`, 'good');
      if (isHost) relay(msg, conn && conn.peer);
      changed();
      break;
    }

    case 'left':
      players.delete(msg.id);
      changed();
      break;

    case 'feed':
      pushFeed(msg.text, msg.kind || 'info');
      if (isHost) relay(msg, conn && conn.peer);
      break;

    case 'spanner':
      // Everyone in the room rides on one player's luck for a moment.
      addBuff('shared_spanner', 25);
      pushFeed(`${msg.name} caught a golden spanner - everyone gets 2x for 25s.`, 'good');
      emit(EVENTS.TOAST, { text: `${msg.name} caught a spanner. 2x for everyone!`, kind: 'good' });
      if (isHost) relay(msg, conn && conn.peer);
      break;

    case 'gift': {
      if (isHost && msg.to !== myId) { relay(msg, conn && conn.peer); return; }
      if (msg.to !== myId) return;
      const item = sanitiseBuild(msg.item);
      if (!item) return;
      state.garage.push(item);
      pushFeed(`${msg.fromName} sent you a ${item.name}.`, 'good');
      emit(EVENTS.TOAST, { text: `${msg.fromName} sent you a ${item.name}!`, kind: 'good' });
      emit(EVENTS.DIRTY, { what: 'gift' });
      break;
    }

    default:
      break;
  }
}

/** Never trust a build straight off the wire - rebuild it from known fields. */
function sanitiseBuild(item) {
  if (!item || typeof item !== 'object') return null;
  const num = (v, max) => {
    const n = Number(v);
    return isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
  };
  if (typeof item.name !== 'string') return null;
  return {
    uid: uid('gift'),
    bp: String(item.bp || 'scoot_lite').slice(0, 40),
    name: item.name.slice(0, 40),
    kind: item.kind === 'scooter' ? 'scooter' : 'bike',
    tier: Math.max(0, Math.min(5, Math.round(num(item.tier, 5)))),
    quality: num(item.quality, 20) || 1,
    value: num(item.value, 1e18),
    speed: num(item.speed, 1e6),
    range: num(item.range, 1e7),
    accel: num(item.accel, 999) || 1,
    parts: {},
    gifted: true,
    at: Date.now(),
  };
}

// --- public actions ----------------------------------------------------------

export async function hostRoom() {
  await openPeer(makeCode(), true);
}

export async function joinRoom(code) {
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (clean.length < 4) { error = 'That code is too short.'; status = 'error'; changed(); return; }
  await openPeer(clean, false);
}

async function openPeer(code, asHost) {
  leaveRoom();
  status = 'connecting';
  error = '';
  roomCode = code;
  isHost = asHost;
  changed();

  let Peer;
  try {
    Peer = await loadPeerJs();
  } catch (err) {
    status = 'error';
    error = 'Could not load the multiplayer library (offline?).';
    changed();
    return;
  }

  peer = asHost ? new Peer(PREFIX + code) : new Peer();

  peer.on('open', (id) => {
    myId = id;
    players.set(id, profile());
    if (asHost) {
      status = 'open';
      state.net.lastRoom = code;
      pushFeed(`Room ${code} is open. Share the code.`, 'good');
      changed();
    } else {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      wire(conn);
      conns.set(conn.peer, conn);
      setTimeout(() => {
        if (status !== 'open') {
          status = 'error';
          error = 'No shop answered on that code.';
          changed();
        }
      }, 9000);
    }
  });

  peer.on('connection', (conn) => { wire(conn); });

  peer.on('error', (err) => {
    const msg = String(err && err.type ? err.type : err);
    if (msg === 'unavailable-id') error = 'That room code is already hosting. Try again.';
    else if (msg === 'peer-unavailable') error = 'No shop answered on that code.';
    else error = 'Connection problem: ' + msg;
    status = 'error';
    changed();
  });
}

export function leaveRoom() {
  for (const conn of conns.values()) {
    try { conn.close(); } catch (err) { /* already gone */ }
  }
  conns = new Map();
  players = new Map();
  if (peer) {
    try { peer.destroy(); } catch (err) { /* already destroyed */ }
  }
  peer = null;
  isHost = false;
  status = 'off';
  roomCode = '';
  changed();
}

function sendStatus(force = false) {
  if (status !== 'open') return;
  const msg = { t: 'status', p: profile() };
  players.set(myId, msg.p);
  if (isHost) relay(msg);
  else for (const conn of conns.values()) send(conn, msg);
  if (force) changed();
}

/** Shout something into the room feed. */
export function announce(text, kind = 'info') {
  if (status !== 'open') return;
  const line = `${playerName()}: ${text}`;
  pushFeed(line, kind);
  const msg = { t: 'feed', text: line, kind };
  if (isHost) relay(msg);
  else for (const conn of conns.values()) send(conn, msg);
}

/** Tell the room you caught a spanner; everyone gets a slice of it. */
export function shareSpanner() {
  if (status !== 'open') return;
  const msg = { t: 'spanner', name: playerName() };
  if (isHost) relay(msg);
  else for (const conn of conns.values()) send(conn, msg);
}

export function giftBuild(toId, itemUid) {
  if (status !== 'open') return false;
  const idx = state.garage.findIndex((it) => it.uid === itemUid);
  if (idx < 0) return false;
  const item = state.garage[idx];
  if (item.starter) return false;
  state.garage.splice(idx, 1);
  state.stats.gifts = (state.stats.gifts || 0) + 1;

  const msg = { t: 'gift', to: toId, fromName: playerName(), item };
  if (isHost) relay(msg);
  else for (const conn of conns.values()) send(conn, msg);

  const target = players.get(toId);
  pushFeed(`You sent a ${item.name} to ${target ? target.name : 'someone'}.`, 'good');
  announce(`sent a ${item.name} to ${target ? target.name : 'someone'}.`);
  return true;
}

export function tickNet(dt) {
  if (status !== 'open') return;
  sinceStatus += dt;
  if (sinceStatus >= STATUS_EVERY) {
    sinceStatus = 0;
    sendStatus();
  }
  // Drop players who stopped reporting (closed tab without a clean disconnect).
  const now = Date.now();
  let dropped = false;
  for (const [id, p] of players) {
    if (id !== myId && now - p.at > 20000) { players.delete(id); dropped = true; }
  }
  if (dropped) changed();
}

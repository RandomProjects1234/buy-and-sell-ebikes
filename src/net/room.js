// ---------------------------------------------------------------------------
// SHOP NETWORK - peer-to-peer multiplayer
// ---------------------------------------------------------------------------
// There is no server: one player hosts a room and everyone else connects
// straight to them over WebRTC (PeerJS). The host is the hub - it relays every
// message to the rest of the room, so the topology stays a simple star.
//
// What a room gives you:
//  - a live leaderboard with shop profiles (showroom bike, wheelie best, trophies)
//  - room chat, cheers, and auto-announced milestones
//  - gifts of builds or parts, and a market where anyone can buy what you list
//  - host-run timed events (Build Rush, Wheelie Cup) with prizes and trophies
//  - +5% sale price for every other shop online, up to +25%
//
// PeerJS is loaded from a CDN the first time someone actually opens a room, so
// the single player game keeps its "zero dependencies, works offline" promise.
//
// This is a game you play with friends: nothing here is validated against
// cheating. Everything off the wire is rebuilt field by field so a bad message
// cannot break your save, but a friend could still send you a silly bike.

import { TIERS, PARTS } from '../data/parts.js';
import { state, addPart, removePart, countPart } from '../core/state.js';
import { emit, on, EVENTS } from '../core/events.js';
import { incomePerSec, addMoney, spend, wheelieSRunValue, setNetBonus } from '../systems/economy.js';
import { salePrice } from '../systems/market.js';
import { uid } from '../core/rng.js';
import { fmtMoney } from '../core/format.js';

const PEER_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js';
// Bumped with the protocol, so an old cached client and a new one never meet.
const PREFIX = 'bse2-';
const STATUS_EVERY = 2;        // seconds between presence broadcasts
const STALE_MS = 20000;        // a shop that goes quiet this long has left
const LOG_MAX = 120;
const BUY_TIMEOUT_MS = 15000;  // refund a purchase if the seller never answers
const REJOIN_TRIES = 3;
const BONUS_PER_SHOP = 0.05;

export const EVENT_TYPES = {
  rush: { name: 'Build Rush', blurb: 'Most builds finished', seconds: 180, unit: 'builds' },
  wheelie: { name: 'Wheelie Cup', blurb: 'Best wheelie score', seconds: 180, unit: 'pts' },
};
// Prizes are in "stakes" - the same how-rich-are-you number the wheelie rig
// pays out on - so first place is worth it at any point in the game.
export const PRIZE_STAKES = [2, 1, 0.5];

function duration(ms) {
  const s = Math.round(ms / 1000);
  return s >= 60 && s % 60 === 0 ? `${s / 60} minute${s === 60 ? '' : 's'}` : `${s} seconds`;
}

let peer = null;
let conns = new Map();         // peerId -> DataConnection (host: everyone, client: just the host)
let isHost = false;
let roomCode = '';
let status = 'off';            // off | connecting | open | error
let error = '';
let myId = '';
let players = new Map();       // id -> sanitised profile (+ seen, local ms)
let log = [];                  // newest first: { kind, text, name, tier, at }
let listings = new Map();      // lid -> listing
const pendingBuys = new Map(); // lid -> { price, timer }
let event = null;              // { id, type, endsAt, running, results }
let evBase = null;             // my score baseline for the running event
let sinceStatus = 0;
let unread = 0;
let lastViewed = 0;
let leaving = false;
let rejoinTries = 0;

// --- snapshot for the UI ---------------------------------------------------------

export function netStatus() {
  return {
    status, code: roomCode, isHost, error, myId, unread,
    hostId: roomCode ? PREFIX + roomCode : '',
    players: [...players.values()],
    log,
    listings: [...listings.values()].sort((a, b) => b.at - a.at),
    event: eventView(),
    bonus: roomBonus(),
  };
}

export function isOnline() { return status === 'open'; }

/** Cheap enough for every frame: the running event for the top bar pill. */
export function eventBrief() {
  if (status !== 'open' || !event || !event.running) return null;
  let rank = 1;
  const mine = myEventScore();
  for (const p of players.values()) {
    if (p.id !== myId && p.ev && p.ev.id === event.id && p.ev.score > mine) rank += 1;
  }
  return { name: EVENT_TYPES[event.type].name, left: Math.max(0, (event.endsAt - Date.now()) / 1000), rank, score: mine };
}

function changed() { emit(EVENTS.NET, null); }

/** The Network panel calls this while it is on screen. */
export function markViewed() {
  lastViewed = Date.now();
  if (unread) { unread = 0; changed(); }
}
function viewing() { return Date.now() - lastViewed < 1500; }

function pushLog(entry) {
  log = [{ at: Date.now(), ...entry }, ...log].slice(0, LOG_MAX);
  changed();
}

function sys(text, kind = 'system') { pushLog({ kind, text }); }

// --- names, profile ----------------------------------------------------------------

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function playerName() {
  if (!state.net.name) state.net.name = 'Shop ' + makeCode().slice(0, 3);
  return state.net.name;
}

export function setPlayerName(name) {
  state.net.name = String(name || '').trim().slice(0, 18) || playerName();
  sendStatus(true);
  changed();
}

function myTier() { return state.showroom ? state.showroom.tier : 0; }

/** The snapshot every player broadcasts about themselves. */
function profile() {
  const sr = state.showroom;
  return {
    id: myId,
    name: playerName(),
    lifetime: state.lifetime,
    money: state.money,
    rate: incomePerSec(),
    builds: state.stats.builds,
    crates: state.stats.cratesOpened,
    bike: sr ? { name: sr.name, tier: sr.tier, kind: sr.kind, bp: sr.bp } : null,
    wheelieBest: state.wheelie.best,
    sRuns: state.wheelie.sRuns || 0,
    trophies: state.net.trophies || 0,
    ev: event && event.running ? { id: event.id, score: myEventScore() } : null,
  };
}

const num = (v, max = 1e300) => {
  const n = Number(v);
  return isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const tierOf = (v) => Math.max(0, Math.min(TIERS.length - 1, Math.round(num(v, TIERS.length - 1))));

function sanitiseProfile(p) {
  if (!p || typeof p !== 'object' || !str(p.id, 80)) return null;
  const bike = p.bike && typeof p.bike === 'object'
    ? { name: str(p.bike.name, 40) || '-', tier: tierOf(p.bike.tier), kind: p.bike.kind === 'scooter' ? 'scooter' : 'bike', bp: str(p.bike.bp, 40) }
    : null;
  return {
    id: str(p.id, 80),
    name: str(p.name, 18) || 'Shop',
    lifetime: num(p.lifetime),
    money: num(p.money),
    rate: num(p.rate),
    builds: num(p.builds, 1e12),
    crates: num(p.crates, 1e15),
    bike,
    wheelieBest: num(p.wheelieBest, 1e9),
    sRuns: num(p.sRuns, 1e9),
    trophies: num(p.trophies, 1e6),
    ev: p.ev && typeof p.ev === 'object' ? { id: str(p.ev.id, 40), score: num(p.ev.score, 1e12) } : null,
    seen: Date.now(),   // our clock, not theirs - clocks drift between machines
  };
}

// --- room bonus ------------------------------------------------------------------------

function othersOnline() { return Math.max(0, players.size - 1); }
export function roomBonus() { return status === 'open' ? Math.min(0.25, othersOnline() * BONUS_PER_SHOP) : 0; }
function syncBonus() { setNetBonus(roomBonus()); }

// --- transport -----------------------------------------------------------------------------

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

function send(conn, msg) {
  try { conn.send(msg); } catch { /* peer went away mid-send */ }
}

/** Host: pass a message on to everyone except the sender. */
function relay(msg, exceptId) {
  for (const [id, conn] of conns) if (id !== exceptId) send(conn, msg);
}

/** Send to the whole room from wherever we are in the star. */
function broadcast(msg) {
  if (isHost) relay(msg);
  else for (const conn of conns.values()) send(conn, msg);
}

// Messages the host passes on after handling them itself.
const RELAYED = new Set([
  'status', 'chat', 'log', 'react', 'gift', 'giftParts', 'list', 'unlist', 'buy', 'sold', 'buyfail',
]);

function wire(conn) {
  conn.on('data', (msg) => handle(msg, conn));
  conn.on('open', () => {
    conns.set(conn.peer, conn);
    if (!isHost) send(conn, { t: 'hello', p: profile() });
    changed();
  });
  conn.on('close', () => onClose(conn));
  conn.on('error', () => { /* a dropped peer is not fatal for the room */ });
}

function onClose(conn) {
  conns.delete(conn.peer);
  if (isHost) {
    dropPlayer(conn.peer, true);
    relay({ t: 'left', id: conn.peer });
    return;
  }
  // A client lost the host. Unless we left on purpose or the host said it was
  // closing, it was probably a blip - try to get back in.
  if (leaving || status === 'off') return;
  if (status === 'open' && rejoinTries < REJOIN_TRIES) {
    rejoinTries += 1;
    const code = roomCode;
    sys(`Lost the host - reconnecting (${rejoinTries}/${REJOIN_TRIES})...`, 'bad');
    setTimeout(() => { if (roomCode === code && status !== 'off') openPeer(code, false, true); }, 1500 * rejoinTries);
    return;
  }
  if (status !== 'error') {
    status = 'error';
    error = 'Lost the connection to the host.';
    endLocalRoom();
  }
}

function dropPlayer(id, announce) {
  const gone = players.get(id);
  players.delete(id);
  for (const [lid, l] of listings) if (l.seller === id) listings.delete(lid);
  if (gone && announce) sys(`${gone.name} left the room.`);
  syncBonus();
  changed();
}

// --- message handling ----------------------------------------------------------------

function handle(msg, conn) {
  if (!msg || typeof msg !== 'object') return;
  const from = conn && conn.peer;

  switch (msg.t) {
    case 'hello': {
      if (!isHost) return;
      const p = sanitiseProfile({ ...msg.p, id: from });
      if (!p) return;
      const known = players.has(p.id);
      players.set(p.id, p);
      send(conn, {
        t: 'welcome',
        code: roomCode,
        players: [...players.values()],
        log: log.slice(0, 30),
        listings: [...listings.values()],
        event: event && event.running ? { id: event.id, type: event.type, endsIn: event.endsAt - Date.now() } : null,
      });
      relay({ t: 'status', p }, from);
      if (!known) announceSys(`${p.name} joined the room.`, 'good');
      syncBonus();
      changed();
      break;
    }

    case 'welcome': {
      roomCode = str(msg.code, 8);
      status = 'open';
      error = '';
      rejoinTries = 0;
      for (const raw of msg.players || []) {
        const p = sanitiseProfile(raw);
        if (p && p.id !== myId) players.set(p.id, p);
      }
      players.set(myId, { ...profile(), seen: Date.now() });
      if (Array.isArray(msg.log) && !log.length) log = msg.log.slice(0, 30).map(cleanLog).filter(Boolean);
      listings = new Map();
      for (const raw of msg.listings || []) {
        const l = sanitiseListing(raw);
        if (l) listings.set(l.lid, l);
      }
      if (msg.event && EVENT_TYPES[msg.event.type]) startLocalEvent(msg.event, false);
      republishEscrow();
      state.net.lastRoom = roomCode;
      sys(`Connected to room ${roomCode}.`, 'good');
      syncBonus();
      sendStatus(true);
      break;
    }

    case 'status': {
      const p = sanitiseProfile(msg.p);
      if (!p || p.id === myId) break;
      if (isHost && p.id !== from) break;   // you may only speak for yourself
      players.set(p.id, p);
      syncBonus();
      changed();
      break;
    }

    case 'left':
      if (!isHost) dropPlayer(str(msg.id, 80), true);
      break;

    case 'closing':
      if (isHost) break;
      leaving = true;
      status = 'error';
      error = 'The host closed the room.';
      endLocalRoom();
      break;

    case 'chat': {
      const text = str(msg.text, 200).trim();
      if (!text) break;
      const name = str(msg.name, 18) || 'Shop';
      pushLog({ kind: 'chat', name, text, tier: tierOf(msg.tier), mine: false });
      if (!viewing()) {
        unread += 1;
        emit(EVENTS.TOAST, { text: `${name}: ${text.slice(0, 70)}`, kind: 'info' });
        changed();
      }
      break;
    }

    case 'log': {
      const text = str(msg.text, 160);
      if (text) pushLog({ kind: ['good', 'trade', 'event', 'system'].includes(msg.kind) ? msg.kind : 'system', text });
      break;
    }

    case 'react': {
      const emoji = str(msg.emoji, 8);
      const toName = players.get(str(msg.to, 80))?.name || 'someone';
      const fromName = str(msg.fromName, 18) || 'Someone';
      pushLog({ kind: 'react', text: `${fromName} ${emoji} ${msg.to === myId ? 'you' : toName}` });
      if (msg.to === myId) emit(EVENTS.TOAST, { text: `${fromName} sent you ${emoji}`, kind: 'good' });
      break;
    }

    case 'gift':
      if (msg.to === myId) receiveBuild(msg.item, str(msg.fromName, 18), 'sent you');
      break;

    case 'giftParts':
      if (msg.to === myId) receiveParts(msg.parts, str(msg.fromName, 18), 'sent you');
      break;

    case 'list': {
      const l = sanitiseListing(msg.listing);
      if (l && l.seller !== myId) { listings.set(l.lid, l); changed(); }
      break;
    }

    case 'unlist':
      listings.delete(str(msg.lid, 40));
      changed();
      break;

    case 'buy':
      if (msg.seller === myId) handleBuy(msg);
      break;

    case 'sold': {
      const lid = str(msg.lid, 40);
      const l = listings.get(lid);
      listings.delete(lid);
      if (msg.buyer === myId && pendingBuys.has(lid)) {
        clearTimeout(pendingBuys.get(lid).timer);
        pendingBuys.delete(lid);
        if (msg.item) receiveBuild(msg.item, str(msg.sellerName, 18), 'sold you');
        if (msg.parts) receiveParts(msg.parts, str(msg.sellerName, 18), 'sold you');
      } else if (l) {
        pushLog({ kind: 'trade', text: `${str(msg.buyerName, 18)} bought ${l.title} from ${l.sellerName}.` });
      }
      changed();
      break;
    }

    case 'buyfail': {
      const lid = str(msg.lid, 40);
      if (msg.buyer !== myId || !pendingBuys.has(lid)) break;
      refund(lid, 'That listing is gone - you were refunded.');
      listings.delete(lid);
      break;
    }

    case 'event':
      if (!isHost && msg.ev && EVENT_TYPES[msg.ev.type]) startLocalEvent(msg.ev, true);
      break;

    case 'eventEnd':
      if (!isHost) finishLocalEvent(msg.id, msg.results);
      break;

    default:
      break;
  }

  if (isHost && RELAYED.has(msg.t) && from) relay(msg, from);
}

function cleanLog(e) {
  if (!e || typeof e !== 'object') return null;
  return {
    kind: str(e.kind, 12) || 'system',
    text: str(e.text, 200),
    name: str(e.name, 18),
    tier: tierOf(e.tier),
    at: num(e.at) || Date.now(),
  };
}

// --- gifts -----------------------------------------------------------------------------

/** Never trust a build straight off the wire - rebuild it from known fields. */
function sanitiseBuild(item) {
  if (!item || typeof item !== 'object' || typeof item.name !== 'string') return null;
  return {
    uid: uid('gift'),
    bp: str(item.bp, 40) || 'scoot_lite',
    name: item.name.slice(0, 40),
    kind: item.kind === 'scooter' ? 'scooter' : 'bike',
    tier: tierOf(item.tier),
    quality: num(item.quality, 20) || 1,
    value: num(item.value, 1e24),   // a Fossil Surron is ~1e23
    speed: num(item.speed, 1e6),
    range: num(item.range, 1e7),
    accel: num(item.accel, 999) || 1,
    parts: {},
    gifted: true,
    at: Date.now(),
  };
}

/** Only real part ids and sane counts. */
function sanitiseParts(parts) {
  const out = {};
  if (!parts || typeof parts !== 'object') return out;
  for (const [id, n] of Object.entries(parts)) {
    const count = Math.floor(num(n, 1e9));
    if (PARTS[id] && count > 0) out[id] = count;
  }
  return out;
}

function partsTitle(parts) {
  const entries = Object.entries(parts);
  if (entries.length === 1) {
    const [id, n] = entries[0];
    return `${n}x ${PARTS[id].name}`;
  }
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return `${total} parts`;
}

function receiveBuild(raw, fromName, verb) {
  const item = sanitiseBuild(raw);
  if (!item) return;
  state.garage.push(item);
  // Gifts are already announced to the whole room; purchases are private.
  if (verb !== 'sent you') pushLog({ kind: 'trade', text: `${fromName || 'Someone'} ${verb} a ${item.name}.` });
  emit(EVENTS.TOAST, { text: `${fromName || 'Someone'} ${verb} a ${item.name}!`, kind: 'good' });
  emit(EVENTS.DIRTY, { what: 'gift' });
}

function receiveParts(raw, fromName, verb) {
  const parts = sanitiseParts(raw);
  if (!Object.keys(parts).length) return;
  for (const [id, n] of Object.entries(parts)) addPart(id, n);
  const title = partsTitle(parts);
  if (verb !== 'sent you') pushLog({ kind: 'trade', text: `${fromName || 'Someone'} ${verb} ${title}.` });
  emit(EVENTS.TOAST, { text: `${fromName || 'Someone'} ${verb} ${title}!`, kind: 'good' });
  emit(EVENTS.DIRTY, { what: 'gift' });
}

export function giftBuild(toId, itemUid) {
  if (status !== 'open' || !players.has(toId)) return false;
  const idx = state.garage.findIndex((it) => it.uid === itemUid);
  if (idx < 0 || state.garage[idx].starter) return false;
  const item = state.garage.splice(idx, 1)[0];
  state.stats.gifts = (state.stats.gifts || 0) + 1;
  broadcast({ t: 'gift', to: toId, fromName: playerName(), item });
  announceSys(`${playerName()} sent a ${item.name} to ${players.get(toId).name}.`, 'trade');
  return true;
}

export function giftParts(toId, partId, count) {
  if (status !== 'open' || !players.has(toId) || !PARTS[partId]) return false;
  const n = Math.floor(Math.min(count, countPart(partId)));
  if (n < 1 || !removePart(partId, n)) return false;
  state.stats.gifts = (state.stats.gifts || 0) + 1;
  broadcast({ t: 'giftParts', to: toId, fromName: playerName(), parts: { [partId]: n } });
  announceSys(`${playerName()} sent ${n}x ${PARTS[partId].name} to ${players.get(toId).name}.`, 'trade');
  return true;
}

// --- market ----------------------------------------------------------------------------
// A listing moves the goods into escrow (saved with the game, so closing the
// tab never loses them). The seller is the authority on their own listings:
// the buyer pays up front, the seller either ships and banks the money or
// says no, and the buyer is refunded on a no or if nobody answers.

function sanitiseListing(l) {
  if (!l || typeof l !== 'object') return null;
  const kind = l.kind === 'parts' ? 'parts' : 'build';
  const listing = {
    lid: str(l.lid, 40),
    seller: str(l.seller, 80),
    sellerName: str(l.sellerName, 18) || 'Shop',
    kind,
    price: num(l.price, 1e30),
    at: Date.now(),
  };
  if (!listing.lid || !listing.seller || !(listing.price > 0)) return null;
  if (kind === 'build') {
    listing.item = sanitiseBuild(l.item);
    if (!listing.item) return null;
    listing.title = listing.item.name;
    listing.tier = listing.item.tier;
  } else {
    listing.parts = sanitiseParts(l.parts);
    if (!Object.keys(listing.parts).length) return null;
    listing.title = partsTitle(listing.parts);
    listing.tier = Math.max(...Object.keys(listing.parts).map((id) => PARTS[id].tier));
  }
  return listing;
}

function escrow() {
  if (!state.net.escrow || typeof state.net.escrow !== 'object') state.net.escrow = {};
  return state.net.escrow;
}

/** Put anything still listed back where it came from. */
export function returnEscrow() {
  const held = escrow();
  let returned = 0;
  for (const [lid, e] of Object.entries(held)) {
    if (e.kind === 'build' && e.item) state.garage.push(e.item);
    if (e.kind === 'parts' && e.parts) for (const [id, n] of Object.entries(e.parts)) if (PARTS[id]) addPart(id, n);
    delete held[lid];
    returned += 1;
  }
  return returned;
}

/** After a reconnect the host has forgotten our listings - put them back up. */
function republishEscrow() {
  for (const [lid, goods] of Object.entries(escrow())) {
    const raw = { ...goods, lid, seller: myId, sellerName: playerName() };
    const listing = sanitiseListing(raw);
    if (!listing) continue;
    listings.set(lid, listing);
    broadcast({ t: 'list', listing: raw });
  }
}

export function listBuild(itemUid, price) {
  if (status !== 'open' || !(price > 0)) return false;
  const idx = state.garage.findIndex((it) => it.uid === itemUid);
  if (idx < 0 || state.garage[idx].starter) return false;
  const item = state.garage.splice(idx, 1)[0];
  return publishListing({ kind: 'build', item, price });
}

export function listParts(partId, count, price) {
  if (status !== 'open' || !(price > 0) || !PARTS[partId]) return false;
  const n = Math.floor(Math.min(count, countPart(partId)));
  if (n < 1 || !removePart(partId, n)) return false;
  return publishListing({ kind: 'parts', parts: { [partId]: n }, price });
}

function publishListing(goods) {
  const lid = uid('l');
  escrow()[lid] = goods;
  const listing = sanitiseListing({ ...goods, lid, seller: myId, sellerName: playerName() });
  listings.set(lid, listing);
  broadcast({ t: 'list', listing: { ...goods, lid, seller: myId, sellerName: playerName() } });
  announceSys(`${playerName()} listed ${listing.title} for sale.`, 'trade');
  changed();
  return true;
}

export function cancelListing(lid) {
  const held = escrow()[lid];
  if (!held) return false;
  if (held.kind === 'build') state.garage.push(held.item);
  else for (const [id, n] of Object.entries(held.parts)) addPart(id, n);
  delete escrow()[lid];
  listings.delete(lid);
  broadcast({ t: 'unlist', lid });
  changed();
  return true;
}

export function buyListing(lid) {
  const l = listings.get(lid);
  if (!l || l.seller === myId || pendingBuys.has(lid) || status !== 'open') return false;
  if (!spend(l.price)) return false;
  const timer = setTimeout(() => refund(lid, 'The seller did not answer - you were refunded.'), BUY_TIMEOUT_MS);
  pendingBuys.set(lid, { price: l.price, timer });
  broadcast({ t: 'buy', lid, seller: l.seller, buyer: myId, buyerName: playerName(), price: l.price });
  changed();
  return true;
}

export function isBuying(lid) { return pendingBuys.has(lid); }

function refund(lid, text) {
  const p = pendingBuys.get(lid);
  if (!p) return;
  clearTimeout(p.timer);
  pendingBuys.delete(lid);
  state.money += p.price;
  emit(EVENTS.TOAST, { text, kind: 'warn' });
  changed();
}

function handleBuy(msg) {
  const lid = str(msg.lid, 40);
  const held = escrow()[lid];
  const buyer = str(msg.buyer, 80);
  const price = num(msg.price);
  const mine = listings.get(lid);
  if (!held || !mine || price < mine.price) {
    broadcast({ t: 'buyfail', lid, buyer });
    return;
  }
  delete escrow()[lid];
  listings.delete(lid);
  addMoney(price, 'trade');
  const buyerName = str(msg.buyerName, 18) || 'Someone';
  broadcast({
    t: 'sold', lid, buyer, buyerName, sellerName: playerName(),
    item: held.kind === 'build' ? held.item : undefined,
    parts: held.kind === 'parts' ? held.parts : undefined,
  });
  pushLog({ kind: 'trade', text: `${buyerName} bought your ${mine.title}.` });
  emit(EVENTS.TOAST, { text: `${buyerName} bought your ${mine.title}!`, kind: 'good' });
  emit(EVENTS.DIRTY, { what: 'trade' });
  changed();
}

/** A sensible starting price for a listing: what it would sell for here. */
export function suggestBuildPrice(item) { return Math.max(1, salePrice(item) || item.value || 1); }
export function suggestPartsPrice(partId, count) { return Math.max(1, (PARTS[partId]?.value || 1) * count); }

// --- chat, reactions, milestones ------------------------------------------------------

export function sendChat(text) {
  const clean = String(text || '').trim().slice(0, 200);
  if (!clean || status !== 'open') return false;
  pushLog({ kind: 'chat', name: playerName(), text: clean, tier: myTier(), mine: true });
  broadcast({ t: 'chat', name: playerName(), text: clean, tier: myTier() });
  return true;
}

export const REACTIONS = ['👏', '🔥', '😂', '🚲', '💸', '👑'];

export function react(toId, emoji) {
  if (status !== 'open' || !REACTIONS.includes(emoji) || !players.has(toId)) return false;
  pushLog({ kind: 'react', text: `You ${emoji} ${players.get(toId).name}` });
  broadcast({ t: 'react', to: toId, from: myId, fromName: playerName(), emoji });
  return true;
}

/** A system line everyone sees (joins, trades, milestones). */
function announceSys(text, kind = 'system') {
  pushLog({ kind, text });
  broadcast({ t: 'log', text, kind });
}

// Milestones announce themselves, so the room sees the big moments.
on(EVENTS.CRAFTED, ({ blueprint }) => {
  if (status !== 'open' || !blueprint || blueprint.tier < 5) return;
  if (state.crafted[blueprint.id] !== 1) return;
  announceSys(`${playerName()} built their first ${blueprint.name}!`, 'good');
});

on(EVENTS.WHEELIE_END, ({ score, grade }) => {
  if (evBase && event && event.running && event.type === 'wheelie') {
    evBase.best = Math.max(evBase.best, Math.floor(score || 0));
    sendStatus(true);
  }
  if (status === 'open' && grade === 'S') {
    announceSys(`${playerName()} rode an S-grade wheelie (${Math.floor(score).toLocaleString()} pts).`, 'good');
  }
});

on(EVENTS.CRATE_OPENED, ({ tally }) => {
  if (status !== 'open' || !tally) return;
  let fossils = 0;
  for (const [id, n] of Object.entries(tally)) if (PARTS[id] && PARTS[id].tier >= 7) fossils += n;
  if (fossils) announceSys(`${playerName()} dug up ${fossils} Fossil part${fossils === 1 ? '' : 's'}!`, 'good');
});

// --- events ------------------------------------------------------------------------------

function eventView() {
  if (!event) return null;
  const type = EVENT_TYPES[event.type];
  const standings = event.results || [...players.values()]
    .filter((p) => p.ev && p.ev.id === event.id)
    .map((p) => ({ id: p.id, name: p.name, score: p.id === myId ? myEventScore() : p.ev.score }))
    .sort((a, b) => b.score - a.score);
  return {
    ...event,
    name: type.name,
    blurb: type.blurb,
    unit: type.unit,
    left: Math.max(0, (event.endsAt - Date.now()) / 1000),
    standings,
    myScore: event.running ? myEventScore() : null,
    prizes: PRIZE_STAKES.map((x) => x * wheelieSRunValue()),
  };
}

function myEventScore() {
  if (!evBase || !event) return 0;
  if (event.type === 'rush') return Math.max(0, state.stats.builds - evBase.builds);
  return evBase.best;
}

function startLocalEvent(ev, announce) {
  event = {
    id: str(ev.id, 40),
    type: ev.type,
    endsAt: Date.now() + Math.max(0, Math.min(num(ev.endsIn), 600000)),
    running: true,
    results: null,
  };
  evBase = { id: event.id, builds: state.stats.builds, best: 0 };
  if (announce) {
    sys(`${EVENT_TYPES[ev.type].name} has started - ${EVENT_TYPES[ev.type].blurb.toLowerCase()} in ${duration(num(ev.endsIn))} wins.`, 'event');
    emit(EVENTS.TOAST, { text: `${EVENT_TYPES[ev.type].name} started!`, kind: 'good' });
  }
  sendStatus(true);
  changed();
}

/** Host only. */
export function startEvent(type) {
  if (!isHost || status !== 'open' || !EVENT_TYPES[type] || (event && event.running)) return false;
  const ev = { id: uid('ev'), type, endsIn: EVENT_TYPES[type].seconds * 1000 };
  startLocalEvent(ev, false);
  broadcast({ t: 'event', ev });
  announceSys(`${EVENT_TYPES[type].name} has started - ${EVENT_TYPES[type].blurb.toLowerCase()} in ${duration(ev.endsIn)} wins.`, 'event');
  return true;
}

function finishLocalEvent(id, rawResults) {
  if (!event || event.id !== id || !event.running) return;
  const results = (Array.isArray(rawResults) ? rawResults : [])
    .slice(0, 20)
    .map((r) => ({ id: str(r.id, 80), name: str(r.name, 18) || 'Shop', score: num(r.score, 1e12) }));
  event.running = false;
  event.results = results;
  const rank = results.findIndex((r) => r.id === myId);
  const mine = results[rank];
  const type = EVENT_TYPES[event.type];
  if (results[0]) sys(`${type.name} over - ${results[0].name} wins with ${Math.floor(results[0].score).toLocaleString()} ${type.unit}.`, 'event');
  if (rank >= 0 && rank < PRIZE_STAKES.length && mine.score > 0) {
    const prize = PRIZE_STAKES[rank] * wheelieSRunValue();
    addMoney(prize, 'event');
    if (rank === 0) state.net.trophies = (state.net.trophies || 0) + 1;
    emit(EVENTS.TOAST, { text: `${type.name}: you placed #${rank + 1} - prize ${fmtMoney(prize)}`, kind: 'good' });
    if (rank === 0) {
      emit(EVENTS.BIG_WIN, { text: `${type.name.toUpperCase()} CHAMPION`, sub: 'A trophy for the shelf and a prize for the till.', kind: 'mythic' });
    }
  }
  evBase = null;
  sendStatus(true);
  changed();
}

function hostFinishEvent() {
  const standings = [...players.values()]
    .filter((p) => p.ev && p.ev.id === event.id)
    .map((p) => ({ id: p.id, name: p.name, score: p.id === myId ? myEventScore() : p.ev.score }))
    .sort((a, b) => b.score - a.score);
  const id = event.id;
  relay({ t: 'eventEnd', id, results: standings });
  finishLocalEvent(id, standings);
}

// --- lifecycle -------------------------------------------------------------------------

export async function hostRoom() {
  await openPeer(makeCode(), true);
}

export async function joinRoom(code) {
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (clean.length < 4) { error = 'That code is too short.'; status = 'error'; changed(); return; }
  await openPeer(clean, false);
}

/** A link that opens the game straight into this room. */
export function inviteLink() {
  if (!roomCode) return '';
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', roomCode);
  return url.href;
}

async function openPeer(code, asHost, isRejoin = false) {
  teardown();
  leaving = false;
  if (!isRejoin) { rejoinTries = 0; log = []; }
  status = 'connecting';
  error = '';
  roomCode = code;
  isHost = asHost;
  changed();

  let Peer;
  try {
    Peer = await loadPeerJs();
  } catch {
    status = 'error';
    error = 'Could not load the multiplayer library (offline?).';
    changed();
    return;
  }

  const p = asHost ? new Peer(PREFIX + code) : new Peer();
  peer = p;

  p.on('open', (id) => {
    if (peer !== p) return;
    myId = id;
    players = new Map([[id, { ...profile(), seen: Date.now() }]]);
    if (asHost) {
      status = 'open';
      state.net.lastRoom = code;
      sys(`Room ${code} is open. Share the code or the invite link.`, 'good');
      syncBonus();
      changed();
      return;
    }
    const conn = p.connect(PREFIX + code, { reliable: true });
    wire(conn);
    setTimeout(() => {
      if (peer === p && status === 'connecting') {
        status = 'error';
        error = 'No shop answered on that code.';
        changed();
      }
    }, 9000);
  });

  p.on('connection', (conn) => { if (isHost) wire(conn); });

  // Losing the signalling server does not drop existing connections, but a
  // host that stays disconnected cannot take new joiners - reconnect quietly.
  p.on('disconnected', () => { if (peer === p && !p.destroyed) { try { p.reconnect(); } catch { /* retried next time */ } } });

  p.on('error', (err) => {
    if (peer !== p) return;
    const type = String(err && err.type ? err.type : err);
    if (type === 'unavailable-id') error = 'That room code is already hosting. Try again.';
    else if (type === 'peer-unavailable') error = 'No shop answered on that code.';
    else if (type === 'network' || type === 'server-error') error = 'Could not reach the matchmaking server.';
    else error = 'Connection problem: ' + type;
    status = 'error';
    endLocalRoom();
  });
}

function teardown() {
  for (const conn of conns.values()) {
    try { conn.close(); } catch { /* already gone */ }
  }
  conns = new Map();
  if (peer) {
    try { peer.destroy(); } catch { /* already destroyed */ }
  }
  peer = null;
}

/** Everything that happens when we are out of the room, however we got out. */
function endLocalRoom() {
  for (const lid of [...pendingBuys.keys()]) refund(lid, 'Left the room - your purchase was refunded.');
  const returned = returnEscrow();
  if (returned) emit(EVENTS.TOAST, { text: `${returned} unsold listing${returned === 1 ? '' : 's'} came back to you.`, kind: 'info' });
  listings = new Map();
  players = new Map();
  event = null;
  evBase = null;
  teardown();
  syncBonus();
  changed();
}

export function leaveRoom() {
  leaving = true;
  if (isHost && status === 'open') relay({ t: 'closing' });
  // Give the goodbye a moment to leave before the sockets close.
  const wasOpen = status === 'open' && isHost;
  status = 'off';
  roomCode = '';
  isHost = false;
  error = '';
  if (wasOpen) setTimeout(endLocalRoom, 150);
  else endLocalRoom();
}

function sendStatus(force = false) {
  if (status !== 'open') return;
  const p = profile();
  players.set(myId, { ...p, seen: Date.now() });
  broadcast({ t: 'status', p });
  if (force) changed();
}

export function tickNet(dt) {
  if (status !== 'open') return;
  sinceStatus += dt;
  if (sinceStatus >= STATUS_EVERY) {
    sinceStatus = 0;
    sendStatus();
  }

  if (event && event.running && Date.now() >= event.endsAt) {
    if (isHost) hostFinishEvent();
    // A client that never hears the result closes the event on its own view.
    else if (Date.now() - event.endsAt > 10000) {
      const v = eventView();
      finishLocalEvent(event.id, v.standings);
    }
  }

  // Drop players who stopped reporting (closed tab without a clean disconnect).
  const now = Date.now();
  for (const [id, p] of players) {
    if (id !== myId && now - p.seen > STALE_MS) dropPlayer(id, true);
  }
}

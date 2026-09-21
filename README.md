# Buy and Sell E-Bikes

An idle/clicker tycoon about the least respectable corner of the e-mobility
industry. You start with one squeaky **Hyper B** and no money. You end up
assembling **nuclear engine bikes** that do 3,000 mph, in a warehouse staffed
by people you never have to talk to.

Click the bike to hustle a few dollars → buy a crate of dodgy parts → build a
scooter or an e-bike at the workbench → flip it → reinvest in better crates,
staff and facilities → automate the whole chain and watch the money come in
while you are not even looking.

**[Play it in your browser](https://randomprojects1234.github.io/buy-and-sell-ebikes/)**

No build step, no server, and no dependencies unless you open a multiplayer
room. It is HTML, CSS and ES modules.

![MIT licensed](https://img.shields.io/badge/license-MIT-green)
![No build step](https://img.shields.io/badge/build-none-blue)

---

## Play it

In a browser: <https://randomprojects1234.github.io/buy-and-sell-ebikes/>

**Locally** (any static server works; this one just disables caching):

```bash
python serve.py 3497
```

Then open <http://localhost:3497>. Windows users can double-click
`Start Buy and Sell E-Bikes.bat` instead, which does both.

It needs to be served over `http://` rather than opened as a `file://` URL,
because the game is loaded as ES modules.

## The screen

Two columns. On the left, your bank, your income per second and the bike you
click - the bike in the showroom window multiplies every click, so a better
build makes your hands worth more. Under it sits your shop rank and a one-line
nudge telling a new player what to do next. On the right, the tabs where you
actually do things.

**First time?** A guided tour runs automatically on a brand new save. It walks
you through a full loop - click, crate, build, sell - waiting for you to
actually do each step rather than making you read. You can skip it, and replay
it any time from the gear icon.

## How to play

| Tab | What it does |
| --- | --- |
| **Crates** | Spend money on crates. Better crates roll better part tiers: Scrap -> Standard -> Performance -> Exotic -> Hypertech -> Nuclear. Drops are nudged toward the slots you are short of. |
| **Workbench** | Pick a blueprint, fit one part per slot, build it. Parts better than the recipe demands raise **quality**, which raises the sale price. Surplus junk salvages into the tier above at 12:1. |
| **Garage** | Sell finished builds, or put one in the showroom window. |
| **Upgrades** | One-off permanent buys: click value, sale price, crate luck, staff speed, wheelie payout. |
| **Staff** | Four roles automate one stage each. Three of a role unlocks its **manager**, which changes how that stage works, not just how fast. |
| **Facilities** | Bike farms that print parts of a fixed tier forever. Worth little without Wrenches to build with them - that is the mid-game trade-off. |
| **Wheelie** | A 40 second skill minigame on the shop treadmill (see below). |
| **Index** | The catalogue: every build, part and crate in the game, with what each recipe needs and what you are holding. Things you have not met yet stay redacted. |
| **Network** | Multiplayer rooms (see below). |

**The ladder.** Scrap hacks → parody commuters → performance builds → the
exotics (including one very shiny trap) → the **Vark Hunter** that exists to
beat it → **Hypertech**: Stark Vark GT, Tungsten Bull, Carbon Ghost and the
Tesseract TX flagship → nuclear engine bikes at 3,000 mph. 26 builds in all,
plus two that are not in any catalogue.

**Scooters vs bikes.** Scooters take four parts and flip fast and cheap - they
are the money loop. E-bikes take six, cost more and are worth more, and they
are what you put in the showroom window. There is a tier-three bike that looks
like the best thing in the shop and is not; working out which one is part of
the fun.

### The golden spanner

Every minute or two a gold-plated 15mm spanner drifts across the screen for
fourteen seconds. Catch it for one of: **Frenzy** (7x everything for 45s),
**Click Frenzy** (77x per click for 13s), a cash **Windfall**, a **Hot Streak**
on crate luck, twelve **free crates**, or a two minute **Golden Hour**. In a
multiplayer room, everyone else gets 2x for 25 seconds when you catch one.

### Wheelie mode

Your bike is on a treadmill. **Hold** anywhere on the canvas (or hold `Space` /
`ArrowUp`) to feed it throttle; let go and the nose drops.

- Stay inside the green band on the balance meter and the multiplier climbs.
- Let the front wheel drop and the multiplier bleeds away - no crash, no points.
- Loop it past vertical and you are on the floor: the run ends and the payout is
  cut to 60%.
- Coins and **NITRO** gates fly past on the belt. Nitro doubles scoring for five
  seconds.

The payout scales off how much money you are making elsewhere, so a good run is
worth riding at any point in the game rather than being a minute-one novelty.

### Multiplayer

The **Network** tab hosts or joins a room with a five letter code. There is no
server: one player hosts and everyone else connects straight to them over
WebRTC, with the host relaying messages to the rest of the room.

- A live leaderboard of every shop in the room - lifetime earnings, income per
  second, showroom bike, builds finished.
- A shared feed of what everyone is doing.
- **Post a build** straight into another player's garage.
- Golden spanners are shared: catching one boosts the whole room.

PeerJS loads from a CDN the first time someone opens a room, so single player
still works with no network at all. It is a game for people you know - nothing
is validated against cheating, and the room code is the whole security model.

### Secrets

There are two bikes that are not in any shop list, and a crate you are not
supposed to be able to order.

<details>
<summary>Spoilers</summary>

- **Kirkin G2** - click the shop sign in the top-left 100 times. The sign
  rattles at 25 and 60 if you are on the right track.
- **Black Site Pallet** - appears in the crate shop once you have found your
  first Kirkin schematic fragment. Fragments drop from Anomaly Crates at about
  0.4%, and from the pallet itself at 5%.
- **Kirkin G4** - collect four fragments to learn the recipe. Building it needs
  six Nuclear parts, a $200B assembly fee, and it *consumes a finished Kirkin
  G2* - from the garage or straight out of the showroom window.

</details>

## Sound

The game ships 18 real sound files in `audio/` - a socket wrench ratchet on
every click, a till drawer and bell on a sale, splintering wood when a crate
opens, a reactor spin-up when a nuclear bike comes together, metal clatter when
you loop a wheelie.

They are not downloads: `tools/make_sounds.py` synthesises each one from
layered transients, filtered noise, inharmonic metal partials and a short room,
so every asset in the repo is originally ours. Regenerate them with:

```bash
py -3.13 tools/make_sounds.py
```

Short percussive cues stay as small WAVs because mp3 decoders pad the start by
a few milliseconds, which you can hear on a click; longer cues are mp3. 204KB
for the whole set. If a file fails to load, that cue falls back to a
synthesised WebAudio voice rather than going silent.

## Saving

Autosaves to `localStorage` every 15 seconds, when the tab is hidden, and on
close. Settings (the gear icon) has export/import as a base64 blob, a replay
button for the tour, and a wipe button for when you want to start clean.

Coming back later pays offline earnings: the first minute of staff work is
simulated properly - real crates, real builds, real sales - and the rest is
paid at the automated income rate your staff were achieving when you left, at
60% efficiency, capped at 8 hours.

## Debug / cheat mode

Add `?debug` to the URL or press `Ctrl+Shift+D`. Gives you money grants, part
grants per tier, "unlock all blueprints", fragments, a fast-forward for staff
work, and a hard reset.

The console hook is `window.__BSE`:

```js
__BSE.give(1e9);        // cash
__BSE.parts(4, 20);     // 20 of every Hypertech part
__BSE.ff(3600);         // fast-forward an hour of staff work
__BSE.unlockAll();
__BSE.state;            // live state (a getter, so it never goes stale)
__BSE.wheelie.snapshot();
```

## Tech stack

Vanilla JavaScript ES modules, plain CSS, inline SVG, one `<canvas>` for the
minigame. No framework, no bundler, no build step. The only third party code is
PeerJS, and only if you open a multiplayer room. Python's `http.server` is used
for local development; numpy and ffmpeg are used once, offline, to bake the
sound files.

A few things worth knowing if you are reading the source:

- **The simulation ticks from a Web Worker** (`src/core/clock.js`). Background
  tabs throttle `setTimeout` to ~1Hz and stop `requestAnimationFrame` entirely,
  which would freeze the idle game and the minigame. Worker timers are not
  throttled, so the worker drives the sim and takes over drawing if rAF goes
  quiet.
- **Panels render to HTML strings** and are only swapped into the DOM when the
  markup actually changed, never mid-click and never while a `<select>` or a
  text box has focus.
- **Every multiplier resolves in `src/systems/economy.js`.** Systems ask it for
  the final number rather than reading upgrade data, so balancing is one file.

## Adding content

Everything craftable, droppable or purchasable is plain data in `src/data/`:

| File | Add here to get... |
| --- | --- |
| `parts.js` | a new part - drop a `[name, flavour]` pair into `CATALOG[slot][tier]` and it immediately drops from crates and fits in recipes |
| `blueprints.js` | a new bike or scooter; `req` sets the minimum part tier per slot, `exact` demands a specific part, `extra` eats filler parts, `consumes` eats a finished build |
| `crates.js` | a new crate and its loot table |
| `upgrades.js` | a new upgrade; the `effect` keys are documented at the top of the file |
| `staff.js` | staff roles and facilities |

Part ids are structural (`motor_t3_b`), so renaming a part never breaks an
existing save.

## Layout

```
index.html
audio/           18 generated sound effects
styles/          base (tokens + layout), ui (components), store (bank, buffs,
                 spanner, index, tour), fx (motion)
tools/           make_sounds.py - bakes audio/ from scratch
src/
  main.js        boot + the master tick
  core/          state, save/load, events, formatting, rng, clock, audio, debug
  data/          parts, blueprints, crates, upgrades, staff
  systems/       economy, crates, crafting, salvage, market, automation,
                 buffs, unlocks - all DOM-free
  net/           room.js - peer to peer multiplayer
  ui/            render shell, tutorial, dom helpers, icons, bike art, fx,
                 panels/
  minigame/      wheelie.js
```

## Licence

MIT - see [LICENSE](LICENSE).

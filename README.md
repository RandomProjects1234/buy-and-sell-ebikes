# Buy and Sell E-Bikes

An idle/clicker tycoon about the least respectable corner of the e-mobility
industry. You start with one squeaky **Hyper B** and no money. You end up
assembling **nuclear engine bikes** that do 3,000 mph, in a warehouse staffed
by people you never have to talk to.

Click the bike to hustle a few dollars → buy a crate of dodgy parts → build a
scooter or an e-bike at the workbench → flip it → reinvest in better crates,
staff and facilities → automate the whole chain → take the company public and
do it all again with a permanent multiplier.

No build step, no dependencies, no server. It is HTML, CSS and ES modules.

![MIT licensed](https://img.shields.io/badge/license-MIT-green)
![No build step](https://img.shields.io/badge/build-none-blue)

---

## Play it

**Locally** (any static server works; this one just disables caching):

```bash
python serve.py 3497
```

Then open <http://localhost:3497>. Windows users can double-click
`Start Buy and Sell E-Bikes.bat` instead, which does both.

It needs to be served over `http://` rather than opened as a `file://` URL,
because the game is loaded as ES modules.

## How to play

| Tab | What it does |
| --- | --- |
| **Crates** | Spend money on crates. Better crates roll better part tiers: Scrap → Standard → Performance → Exotic → Hypertech → Nuclear. |
| **Workbench** | Pick a blueprint, fit one part per slot, build it. Better parts than the recipe demands raise **quality**, which raises the sale price. Surplus junk can be salvaged into the tier above. |
| **Garage** | Sell finished builds, or put one in the showroom window - the bike on display multiplies every click for as long as it is there. |
| **Upgrades** | One-off permanent buys: click value, sale price, crate luck, staff speed, wheelie payout. |
| **Staff** | Four roles automate one stage each. Five of a role unlocks its **manager**, which changes how that stage works, not just how fast. |
| **Facilities** | Bike farms that print parts of a fixed tier forever. Useless without Wrenches to build with them - that is the mid-game trade-off. |
| **Wheelie** | A 40 second skill minigame on the shop treadmill (see below). |
| **IPO** | Prestige. Wind the company up, keep the reputation. |

**Scooters vs bikes.** Scooters take four parts and flip fast and cheap - they
are the money loop. E-bikes take six, cost more and are worth more, and they
are what you actually put in the showroom window. There is a tier-three bike
that looks like the best thing in the shop and is not; working out which one is
part of the fun.

**Demand.** Selling the same model over and over saturates its market. Demand
sags with each sale and recovers over about a minute, which nudges you to
diversify or move up a tier instead of spamming one blueprint forever.

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

### Prestige

Once a run has earned enough, the IPO tab offers **shares**
(`floor(sqrt(run earnings / 10M))`). Going public wipes money, parts, builds,
staff, facilities and upgrades. It keeps every blueprint you have discovered,
your lifetime stats, and the shares - each share is +3% to every dollar you
earn, forever. Shares also buy permanent perks: seed money on every restart,
staff that follow you to the new company, keeping your showroom bike, a longer
offline cap, and so on.

### Secrets

There are two bikes that are not in any shop list, and a crate you are not
supposed to be able to order.

<details>
<summary>Spoilers</summary>

- **Kirkin G2** - click the shop sign in the top-left 100 times. The sign
  rattles at 25 and 60 if you are on the right track.
- **Black Site Pallet** - appears in the crate shop once you have found your
  first Kirkin schematic fragment. Fragments drop from Anomaly Crates at about
  0.18%, and from the pallet itself at 2.2%.
- **Kirkin G4** - collect four fragments to learn the recipe. Building it needs
  six Nuclear parts, a $200B assembly fee, and it *consumes a finished Kirkin
  G2* - from the garage or straight out of the showroom window.

</details>

## Saving

Autosaves to `localStorage` every 15 seconds, when the tab is hidden, and on
close. Settings (the gear icon) has export/import as a base64 blob, plus a
wipe button for when you want to start clean.

Coming back later pays offline earnings: the first minute of staff work is
simulated properly - real crates, real builds, real sales - and the rest is
paid at the automated income rate your staff were achieving when you left, at
60% efficiency, capped at 8 hours (24 with the Night Shift perk).

## Debug / cheat mode

Add `?debug` to the URL or press `Ctrl+Shift+D`. Gives you money grants, part
grants per tier, "unlock all blueprints", fragments, shares, a fast-forward for
staff work, and a hard reset.

The console hook is `window.__BSE`:

```js
__BSE.give(1e9);        // cash
__BSE.parts(4, 20);     // 20 of every Hypertech part
__BSE.ff(3600);         // fast-forward an hour of staff work
__BSE.unlockAll();
__BSE.state;            // live state (a getter - safe across an IPO reset)
__BSE.wheelie.snapshot();
```

## Tech stack

Vanilla JavaScript ES modules, plain CSS, inline SVG, one `<canvas>` for the
minigame. No framework, no bundler, no dependencies, no network calls. Python's
`http.server` is used for local development only.

A few things worth knowing if you are reading the source:

- **The simulation ticks from a Web Worker** (`src/core/clock.js`). Background
  tabs throttle `setTimeout` to ~1Hz and stop `requestAnimationFrame` entirely,
  which would freeze the idle game and the minigame. Worker timers are not
  throttled, so the worker drives the sim and takes over drawing if rAF goes
  quiet.
- **Panels render to HTML strings** and are only swapped into the DOM when the
  markup actually changed, never mid-click and never while a `<select>` is open.
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
| `staff.js` | staff roles, facilities and IPO perks |

Part ids are structural (`motor_t3_b`), so renaming a part never breaks an
existing save.

## Layout

```
index.html
styles/          base (tokens + layout), ui (components), fx (motion)
src/
  main.js        boot + the master tick
  core/          state, save/load, events, formatting, rng, clock, audio, debug
  data/          parts, blueprints, crates, upgrades, staff - pure data
  systems/       economy, crates, crafting, salvage, market, automation,
                 prestige, unlocks - all DOM-free
  ui/            render shell, dom helpers, icons, bike art, fx, panels/
  minigame/      wheelie.js
```

## Licence

MIT - see [LICENSE](LICENSE).

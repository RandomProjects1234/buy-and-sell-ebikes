// ---------------------------------------------------------------------------
// BLUEPRINTS - everything you can build at the workbench
// ---------------------------------------------------------------------------
// A blueprint is pure data. To add one: append an object here. Fields:
//
//   id        stable key (used in saves - never rename)
//   name      display name
//   kind      'scooter' (4 slots, cheap, fat margins) | 'bike' (6 slots, prestige)
//   tier      0-5, matches the part tiers
//   req       minimum part tier per slot; the slot list is derived from this
//   exact     {slot: partId} - a specific part this recipe demands
//   extra     [{slot, tier, count}] - parts consumed on top of the fitted ones
//   consumes  blueprint id of a finished build that gets eaten by this recipe
//   cash      assembly fee in dollars
//   base      base sale value at quality 1.00
//   speed/range/accel   showroom stats (mph / miles / 0-30 seconds)
//   unlock    {lifetime} auto-unlock threshold, or {secret:true}
//   desc      flavour text
//
// Sale value = base * quality^1.8 * demand * global multipliers, where quality
// is how far the fitted parts exceed the minimum tiers. Overbuilding a cheap
// blueprint with expensive parts is deliberately a bad trade: part value climbs
// ~20x per tier while quality only pays ~3.5x, so the right move is always to
// graduate to the next blueprint.

export const KINDS = {
  scooter: { name: 'Scooter', flip: 1.0, note: 'Four parts, quick flip, fat margin.' },
  bike: { name: 'E-Bike', flip: 1.0, note: 'Six parts. Worth more, and it dresses the showroom.' },
};

const S4 = (t) => ({ frame: t, motor: t, battery: t, wheels: t });
const B6 = (t) => ({ frame: t, motor: t, battery: t, wheels: t, brakes: t, controller: t });

export const BLUEPRINTS = [
  // --- Tier 0: the hustle ---------------------------------------------------
  {
    id: 'hyper_b', name: 'Hyper B', kind: 'bike', tier: 0, req: B6(0),
    base: 260, speed: 20, range: 18, accel: 8.2,
    unlock: { lifetime: 0 },
    desc: 'The bike you already own. Squeaks going downhill, pays the rent.',
  },
  {
    id: 'scoot_lite', name: 'Scoot Lite', kind: 'scooter', tier: 0, req: S4(0),
    base: 210, speed: 15, range: 9, accel: 11.0,
    unlock: { lifetime: 0 },
    desc: 'Folds up, falls over, sells in an afternoon. The bread and butter.',
  },
  {
    id: 'commutr_7', name: 'Commutr 7', kind: 'bike', tier: 0, req: { frame: 0, motor: 1, battery: 0, wheels: 0, brakes: 0, controller: 0 },
    base: 900, speed: 24, range: 26, accel: 7.4,
    unlock: { lifetime: 900 },
    desc: 'Beige. Dependable. Sold exclusively to people who own two umbrellas.',
  },

  // --- Tier 1: the parody showroom -----------------------------------------
  {
    id: 'kick_n_go', name: "Kick 'n' Go XL", kind: 'scooter', tier: 1, req: S4(1),
    base: 3900, speed: 25, range: 22, accel: 8.0,
    unlock: { lifetime: 4000 },
    desc: 'Twice the deck, twice the buyers who should not be on it.',
  },
  {
    id: 'radrunna', name: 'RadRunna 4', kind: 'bike', tier: 1, req: B6(1),
    base: 4500, speed: 28, range: 45, accel: 5.6,
    unlock: { lifetime: 9000 },
    desc: 'Fat tires, milk crate on the back, buyer swears it is for groceries.',
  },
  {
    id: 'super_37', name: 'Super 37', kind: 'bike', tier: 1, req: { frame: 1, motor: 1, battery: 1, wheels: 1, brakes: 1, controller: 2 },
    base: 14000, speed: 32, range: 48, accel: 4.9,
    unlock: { lifetime: 25000 },
    desc: 'Moped styling, bicycle paperwork, permanent look of mild mischief.',
  },
  {
    id: 'lectrik_xp', name: 'Lectrik XP', kind: 'bike', tier: 1, req: { frame: 1, motor: 2, battery: 1, wheels: 1, brakes: 1, controller: 1 },
    base: 22000, speed: 38, range: 62, accel: 4.2,
    unlock: { lifetime: 70000 },
    desc: 'Sold direct to consumer, assembled by a consumer, returned by a consumer.',
  },

  // --- Tier 2: performance builds ------------------------------------------
  {
    id: 'razr_sting', name: 'Razr Sting', kind: 'scooter', tier: 2, req: S4(2),
    base: 120000, speed: 48, range: 40, accel: 4.4,
    unlock: { lifetime: 160000 },
    desc: 'Aluminium deck, motorcycle brain. Rental fleets buy these by the pallet.',
  },
  {
    id: 'voltage_vx2', name: 'Voltage VX2', kind: 'bike', tier: 2, req: B6(2),
    base: 140000, speed: 55, range: 78, accel: 3.4,
    unlock: { lifetime: 320000 },
    desc: 'First build where the parts cost more than the bike you learned on.',
  },
  {
    id: 'sur_ronin', name: 'Sur-Ronin X', kind: 'bike', tier: 2, req: { frame: 2, motor: 3, battery: 2, wheels: 2, brakes: 2, controller: 2 },
    base: 520000, speed: 71, range: 90, accel: 2.8,
    unlock: { lifetime: 1.2e6 },
    desc: 'Dirt bike shaped hole in the law. Every buyer says it is for private land.',
  },

  // --- Tier 3: exotics, and one very shiny trap ----------------------------
  {
    id: 'turbo_scoot', name: 'Turbo Scoot X', kind: 'scooter', tier: 3, req: S4(3),
    base: 3.1e6, speed: 86, range: 74, accel: 2.6,
    unlock: { lifetime: 4e6 },
    desc: 'Carbon deck, race brakes, and a warning label written by a lawyer who quit.',
  },
  {
    id: 'grid_hammer', name: 'Grid Hammer', kind: 'bike', tier: 3, req: B6(3),
    base: 3.6e6, speed: 92, range: 124, accel: 2.2,
    unlock: { lifetime: 7e6 },
    desc: 'Ugly, brutal, and the best money-per-part in the shop. Builders know.',
  },
  {
    id: 'stark_vark', name: 'Stark Vark', kind: 'bike', tier: 3, req: B6(3),
    extra: [{ slot: 'frame', tier: 3, count: 1 }, { slot: 'wheels', tier: 3, count: 1 }, { slot: 'brakes', tier: 3, count: 1 }],
    cash: 250000,
    base: 4.6e6, speed: 96, range: 131, accel: 2.0, demandFloor: 0.42,
    unlock: { lifetime: 9e6 },
    desc: 'THE FASTEST BIKE EVER BUILT (in the brochure). Gold flake, scissor kickstand, three extra parts of chrome nobody asked for. Sells high. Costs higher.',
  },

  // --- Tier 4: hypertech ----------------------------------------------------
  {
    id: 'hoverlite', name: 'Hoverlite ZG', kind: 'scooter', tier: 4, req: S4(4),
    base: 1.5e8, speed: 190, range: 320, accel: 1.4,
    unlock: { lifetime: 2.2e8 },
    desc: 'Hovers four millimetres. Enough to dodge every scooter regulation written.',
  },
  {
    id: 'ion_reaper', name: 'Ion Reaper', kind: 'bike', tier: 4, req: B6(4),
    base: 1.7e8, speed: 214, range: 380, accel: 1.1,
    unlock: { lifetime: 4e8 },
    desc: 'Silent, matte, and it pulls hard enough to reorganise your lunch.',
  },
  {
    id: 'vanta_rail', name: 'Vanta Rail', kind: 'bike', tier: 4, req: { frame: 4, motor: 4, battery: 4, wheels: 4, brakes: 4, controller: 5 },
    base: 1.4e9, speed: 268, range: 460, accel: 0.9,
    unlock: { lifetime: 1.6e9 },
    desc: 'So black the autofocus gives up. Ships with its own non-disclosure agreement.',
  },

  // --- Tier 5: nuclear engine bikes ----------------------------------------
  {
    id: 'fusion_scoot', name: 'Fusion Scoot', kind: 'scooter', tier: 5, req: S4(5),
    exact: { motor: 'motor_t5_a' },
    cash: 2e9,
    base: 3.6e10, speed: 860, range: 9000, accel: 0.6,
    unlock: { lifetime: 4e10 },
    desc: 'A fusion core on a kick scooter. The safety report is one word, twice.',
  },
  {
    id: 'nuclear_mk1', name: 'Nuclear Engine Bike Mk I', kind: 'bike', tier: 5, req: B6(5),
    exact: { motor: 'motor_t5_a', frame: 'frame_t5_a' },
    cash: 5e9,
    base: 5.5e10, speed: 3000, range: 12000, accel: 0.31,
    unlock: { lifetime: 9e10 },
    desc: 'Three thousand miles an hour on a bicycle. The frame is one atom thick and the motor is a star. Do not lean it against anything you like.',
  },
  {
    id: 'atomizer', name: 'Atomizer 3000', kind: 'bike', tier: 5, req: B6(5),
    exact: { motor: 'motor_t5_b', battery: 'battery_t5_b', brakes: 'brakes_t5_a' },
    cash: 4e10,
    base: 2.6e11, speed: 4800, range: 44000, accel: 0.18,
    unlock: { lifetime: 9e11 },
    desc: 'Antimatter drive, singularity cell, graviton anchors. Accelerates hard enough that the rider arrives slightly younger.',
  },

  // --- Easter eggs ----------------------------------------------------------
  {
    id: 'kirkin_g2', name: 'Kirkin G2', kind: 'bike', tier: 4, req: B6(4),
    extra: [{ slot: 'controller', tier: 4, count: 2 }],
    cash: 1e8,
    base: 2.4e9, speed: 244, range: 610, accel: 0.8,
    hidden: true, unlock: { secret: true },
    desc: 'No catalogue, no dealer, no serial number. Whoever Kirkin is, they solder like a surgeon and they do not answer emails.',
  },
  {
    id: 'kirkin_g4', name: 'Kirkin G4', kind: 'bike', tier: 5, req: B6(5),
    exact: { frame: 'frame_t5_b', motor: 'motor_t5_b', controller: 'controller_t5_b' },
    consumes: 'kirkin_g2', fragments: 4, cash: 2e11,
    base: 9e11, speed: 8000, range: 999999, accel: 0.07,
    hidden: true, unlock: { secret: true },
    desc: 'Built from four torn schematic fragments and one sacrificed G2. It arrives before you finish ordering it. Kirkin has left the industry. Kirkin has left, broadly.',
  },
];

export const BP_BY_ID = Object.fromEntries(BLUEPRINTS.map((b) => [b.id, b]));

export function blueprintSlots(bp) {
  return Object.keys(bp.req);
}

/** Total number of parts a craft consumes (fitted slots + extras). */
export function blueprintPartCount(bp) {
  let n = blueprintSlots(bp).length;
  for (const e of bp.extra || []) n += e.count;
  return n;
}

export const STARTER_BLUEPRINTS = ['hyper_b', 'scoot_lite'];

// ---------------------------------------------------------------------------
// PARTS CATALOG
// ---------------------------------------------------------------------------
// Adding content is meant to be boring: drop another [name, flavor] pair into
// CATALOG[slot][tier] and it immediately drops from crates, shows up in the
// workbench and counts toward crafting. Part ids are structural
// (`motor_t3_b`) so renaming a part never breaks an existing save.

export const TIERS = [
  { id: 0, key: 'scrap',       name: 'Scrap',       color: '#e0955f', glow: 'rgba(224,149,95,.5)',  value: 9 },
  { id: 1, key: 'standard',    name: 'Standard',    color: '#49c97a', glow: 'rgba(73,201,122,.55)', value: 110 },
  { id: 2, key: 'performance', name: 'Performance', color: '#3d9dff', glow: 'rgba(61,157,255,.6)',  value: 1650 },
  { id: 3, key: 'exotic',      name: 'Exotic',      color: '#b06bff', glow: 'rgba(176,107,255,.65)', value: 34000 },
  { id: 4, key: 'hypertech',   name: 'Hypertech',   color: '#ffab2e', glow: 'rgba(255,171,46,.7)',  value: 900000 },
  { id: 5, key: 'nuclear',     name: 'Nuclear',     color: '#ff4d6d', glow: 'rgba(255,77,109,.8)',  value: 42000000 },
  { id: 6, key: 'void',        name: 'Void',        color: '#8f7bff', glow: 'rgba(143,123,255,.85)', value: 3e13 },
  { id: 7, key: 'fossil',      name: 'Fossil',      color: '#f0dcae', glow: 'rgba(240,220,174,.9)',  value: 5e21 },
];

// Void and Fossil parts only ever come out of their crates: salvage cannot
// make them and crate luck cannot roll up into them, so the odds printed on
// the Void Crate and the Fossil Crate are the real odds.
export const CRATE_ONLY_TIER = 6;

export const SLOTS = [
  { id: 'frame',      name: 'Frame',      unit: 'kg', statLabel: 'Weight',    invert: true,  base: 22,  step: 0.82 },
  { id: 'motor',      name: 'Motor',      unit: 'W',  statLabel: 'Output',    invert: false, base: 250, step: 3.6 },
  { id: 'battery',    name: 'Battery',    unit: 'Wh', statLabel: 'Capacity',  invert: false, base: 240, step: 2.9 },
  { id: 'wheels',     name: 'Wheels',     unit: '%',  statLabel: 'Grip',      invert: false, base: 42,  step: 1.28 },
  { id: 'brakes',     name: 'Brakes',     unit: 'm',  statLabel: 'Stop 30-0', invert: true,  base: 19,  step: 0.8 },
  { id: 'controller', name: 'Controller', unit: 'A',  statLabel: 'Peak Amps', invert: false, base: 15,  step: 2.1 },
];

export const SLOT_IDS = SLOTS.map((s) => s.id);
export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

// Relative worth of a slot - a motor is worth more than a set of brake pads.
const SLOT_VALUE_MULT = { frame: 1.35, motor: 1.5, battery: 1.25, wheels: 0.85, brakes: 0.6, controller: 0.8 };

// CATALOG[slot][tier] = [[name, flavor], ...]
const CATALOG = {
  frame: [
    [['Bent Pipe Frame', 'Straightened with a car jack. Twice.'],
     ['Curbside Steel Frame', 'Previous owner left it out in the rain. For a year.'],
     ['Ex-Rental Frame', 'Still wearing the tourist scuff marks.']],
    [['Gas-Pipe Alloy Frame', 'Heavy, honest, and it will outlive you.'],
     ['Commuter 6061 Frame', 'The Corolla of bicycle frames.'],
     ['Fat-Tire Cruiser Frame', 'Built for beach paths and questionable decisions.']],
    [['Hydroformed Trail Frame', 'Welds so clean they look rendered.'],
     ['Moto-Style Hardtail', 'Looks like a dirt bike, weighs like a bicycle.'],
     ['Forged Downhill Frame', 'Tested by people with medical debt.']],
    [['Carbon Lattice Frame', 'Rings like a champagne glass when you tap it.'],
     ['Titanium Spine Frame', 'Bulletproof. Please do not test that.'],
     ['Magnesium Unibody', 'Do not, under any circumstance, set this on fire.']],
    [['Aero Monocoque Shell', 'Wind-tunnel shaped, ego-tunnel priced.'],
     ['Active-Damping Chassis', 'Reads the road 400 times a second and judges it.'],
     ['Maraging Steel Skeleton', 'The alloy they build rocket cases out of.']],
    [['Graphene Monocoque Frame', 'One atom thick, somehow. Physicists are furious.'],
     ['Neutron-Weave Chassis', 'Denser than it has any business being.']],
    [['Void-Forged Frame', 'Absorbs light, sound and, occasionally, eye contact.'],
     ['Null-Space Spine', 'Measures slightly longer on the inside.']],
    [['Petrified Raptor Frame', 'Seventy million years old and still stiffer than carbon.'],
     ['Amber-Cast Chassis', 'There is a mosquito in the down tube. Do not ask it anything.']],
  ],
  motor: [
    [['Leaf Blower Motor', 'It works. It is not happy about it.'],
     ['Salvaged Hub Motor', 'Came off something that got towed away.'],
     ['250W Bafeng Clone', 'The sticker says 1000W. The sticker lies.']],
    [['500W Geared Hub', 'Whines like a mosquito, pulls like a mule.'],
     ['Brushless 750W', 'The legal limit in most places, allegedly.'],
     ['Mid-Drive 1000W', 'Eats chains. Loves hills.']],
    [['3kW Liquid-Cooled Hub', 'Comes with its own tiny radiator.'],
     ['Axial Flux Pancake', 'Flat, mean, and disturbingly quiet.'],
     ['Dual-Stator Sport Motor', 'Two rotors, zero patience.']],
    [['12kW Race Drive', 'Homologated for a series that later banned it.'],
     ['Halbach Array Motor', 'Magnets arranged by someone with a grudge.'],
     ['Superconducting Hub', 'Needs a coolant top-up every Tuesday.']],
    [['Plasma-Wound Torque Unit', 'Torque figures printed in scientific notation.'],
     ['Ion Thrust Assist', 'Technically not road legal. Technically.'],
     ['Counter-Rotating Twin Drive', 'Two motors fighting. You win.']],
    [['Miniature Fusion Core', 'A star the size of a grapefruit. Warranty void if opened.'],
     ['Antimatter Trickle Drive', 'Consumes one nanogram a week. Do not sniff it.']],
    [['Event Horizon Drive', 'Anything that goes in does not come back out. Including torque.'],
     ['Dark-Matter Rotor', 'Spins. Nobody can see what it is spinning.']],
    [['T-Rex Torque Unit', 'Tiny arms, enormous output.'],
     ['Primordial Core Motor', 'Runs on the heat left over from the Cretaceous.']],
  ],
  battery: [
    [['Taped 18650 Pack', 'The tape is structural. Genuinely.'],
     ['Swollen Laptop Cells', 'Puffy. Confident. Wrong.'],
     ['Drill Battery Adapter', 'Eleven minutes of range and a dream.']],
    [['36V Downtube Pack', 'Reliable, boring, exactly what you needed.'],
     ['48V Sanyu Cells', 'The nice ones, from the nice supplier.'],
     ['Dual 52V Saddlebags', 'Twice the range, twice the airport questions.']],
    [['Molicel Brick Pack', 'Every builder on the forum swears by these.'],
     ['Liquid-Cooled 72V Pack', 'Holds a charge and a grudge.'],
     ['Semi-Solid-State Pack', 'Half the weight. Double the invoice.']],
    [['Silicon-Anode Cell Stack', 'Charges in four minutes. Terrifying.'],
     ['Graphene Supercapacitor', 'All of the energy at once, if you ask nicely.'],
     ['Cryo-Buffered Power Cube', 'Frost forms on it while you ride.']],
    [['Zero-Point Buffer Cell', 'The range readout just says YES.'],
     ['Isotope Trickle Battery', 'Glows a colour that is not on the chart.'],
     ['Vacuum Energy Tap', 'Legally distinct from a perpetual motion machine.']],
    [['Tokamak Capacitor Ring', 'Contains a plasma donut. Do not name it.'],
     ['Singularity Cell', 'Charge time: negative four seconds.']],
    [['Vacuum Decay Cell', 'Full charge forever, or the universe ends. Probably the first one.'],
     ['Void Reservoir Pack', 'Stores energy somewhere else entirely.']],
    [['Fossil Fuel Cell (Literal)', 'An actual fossil, somehow holding 90 kWh.'],
     ['Trilobite Capacitor Bank', 'Two hundred trilobites, wired in series. They seem fine.']],
  ],
  wheels: [
    [['Warped 26in Rims', 'Wobble is a personality, not a defect.'],
     ['Bald Commuter Tires', 'Slick in the way that kills you.'],
     ['Mismatched Wheelset', 'Front says touring. Rear says BMX.']],
    [['Puncture-Proof Commuters', 'Kevlar belt, smug attitude.'],
     ['Fat 4in Knobbies', 'Sand, snow, stairs, lawsuits.'],
     ['Double-Wall Alloy Set', 'Rated for a rider heavier than you.']],
    [['Moto Sport Radials', 'Sticky enough to peel paint.'],
     ['Carbon Deep-Dish Set', 'Sounds like a jet in a crosswind.'],
     ['Reinforced Downhill Set', 'Survived a drop the rider did not.']],
    [['Self-Healing Tubeless', 'Punctures close before you notice them.'],
     ['Magnetic Bearing Hubs', 'Spins for eleven minutes if you flick it.'],
     ['Active Camber Wheels', 'Leans into corners on its own. Unsettling.']],
    [['Gyro-Stabilized Wheelset', 'Refuses to fall over. Really refuses.'],
     ['Graphene Tread Set', 'Grip figures the scrutineers called a typo.'],
     ['Airless Lattice Wheels', 'Printed in one piece, somewhere secret.']],
    [['Mag-Lev Contact Ring', 'Barely touches the road. Neither do you.'],
     ['Reactive Plasma Tread', 'Leaves a glowing line down the tarmac.']],
    [['Hollow-Point Void Rims', 'The spokes go somewhere you cannot follow.'],
     ['Negative-Space Tyres', 'Grip the road from the other side.']],
    [['Ammonite Spiral Wheels', 'Nature invented the perfect wheel first. It took a while.'],
     ['Petrified Redwood Rims', 'Older than the concept of roads.']],
  ],
  brakes: [
    [['Rubbing Rim Brakes', 'Stops you eventually. Emotionally, first.'],
     ['Cable Discs (Seized)', 'One side works. Thankfully the front.'],
     ['Repurposed Coaster Brake', 'Pedal backwards and pray.']],
    [['Tekro Hydraulic Set', 'Boring, cheap, completely fine.'],
     ['180mm Rotor Kit', 'Bigger discs, smaller heart rate.'],
     ['Dual-Piston Commuters', 'Rain-tested, gutter-approved.']],
    [['4-Piston Radial Calipers', 'Bites like it has opinions.'],
     ['Sintered Moto Discs', 'Glow orange on a long descent.'],
     ['Regen-Linked Stoppers', 'Every stop puts money back in the pack.']],
    [['Carbon-Ceramic Discs', 'Off a hypercar. Nobody asked how.'],
     ['Magnetorheological Brakes', 'The fluid hardens when it senses danger.'],
     ['Anti-Lock Race Package', 'Threshold braking, done by a computer.']],
    [['Inertial Dampener Brakes', 'Slows time. Slightly. Legally distinct.'],
     ['Reverse-Thrust Calipers', 'Blows air forward. It is loud.'],
     ['Predictive ABS Suite', 'Brakes before you decide to.']],
    [['Graviton Anchor Brakes', 'Briefly makes you heavier than a bus.'],
     ['Field-Collapse Retarders', 'Stops 3,000 mph. Somehow.']],
    [['Entropy Brakes', 'Stops you by making the concept of speed less organised.'],
     ['Null-Field Calipers', 'Momentum is deleted, not converted.']],
    [['Triceratops-Horn Calipers', 'Three pistons. Obviously.'],
     ['Tar-Pit Dampers', 'Everything that goes in slows down. Everything.']],
  ],
  controller: [
    [['Fried 15A Controller', 'Smells faintly of victory and solder.'],
     ['Generic Sine-Wave Box', 'Manual is one page, in three languages, none correct.'],
     ['Throttle-Only Cheapie', 'Two settings: off, and yikes.']],
    [['KT Programmable 22A', 'The settings menu is a hobby of its own.'],
     ['Sine-Wave 30A Unit', 'Silent, smooth, sensible.'],
     ['Torque-Sensing PAS', 'Reads your legs, adds enthusiasm.']],
    [['VESC 6 Controller', 'The one the forum nerds actually respect.'],
     ['Field-Oriented 80A', 'Maths so good it feels like cheating.'],
     ['Dual-Channel Sport ECU', 'Launch control. On a bicycle.']],
    [['Adaptive Traction ECU', 'Counts wheelspin in microseconds.'],
     ['Neural Ride Computer', 'Learns your commute. Judges your commute.'],
     ['Quantum Timing Unit', 'Picks the best firing angle in every universe.']],
    [['Predictive Torque Vectoring', 'Sends power to the wheel that deserves it.'],
     ['Hyperloop-Grade Inverter', 'Rated for things that are not bicycles.'],
     ['Self-Rewriting Firmware', 'Patched itself overnight. Nobody knows why.']],
    [['Fusion Containment ECU', 'The only thing between you and a small sun.'],
     ['Causality Governor', 'Stops you arriving before you leave.']],
    [['Void Oracle ECU', 'Knows the road before the road exists.'],
     ['Silence Engine', 'Controls the motor by not controlling anything.']],
    [['Fossilised Brain Chip', 'A velociraptor was the original firmware.'],
     ['Deep-Time Controller', 'Plans your ride in geological epochs.']],
  ],
};

const VARIANT_KEYS = ['a', 'b', 'c', 'd'];

// Later variants inside a tier are a little better than earlier ones. That
// gives crate drops some texture without per-item random rolls, which would
// stop parts from stacking neatly in the inventory.
const VARIANT_BONUS = [1, 1.14, 1.3, 1.45];

function round(n) {
  if (n >= 1000) return Math.round(n);
  if (n >= 100) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}

function buildParts() {
  const parts = {};
  for (const slot of SLOTS) {
    CATALOG[slot.id].forEach((variants, tierIdx) => {
      variants.forEach(([name, flavor], vIdx) => {
        const id = slot.id + '_t' + tierIdx + '_' + VARIANT_KEYS[vIdx];
        const bonus = VARIANT_BONUS[vIdx] || 1;
        const statRaw = slot.base * Math.pow(slot.step, tierIdx) * (slot.invert ? 1 / bonus : bonus);
        parts[id] = {
          id,
          name,
          flavor,
          slot: slot.id,
          tier: tierIdx,
          variant: vIdx,
          power: (tierIdx + 1) * bonus,
          stat: round(statRaw),
          value: Math.round(TIERS[tierIdx].value * SLOT_VALUE_MULT[slot.id] * bonus),
        };
      });
    });
  }
  return parts;
}

export const PARTS = buildParts();
export const PART_IDS = Object.keys(PARTS);

export function getPart(id) { return PARTS[id]; }

const TIER_CACHE = new Map();

/** Part ids of one tier. Cached - crate bulk buys call this per drop. */
export function partsOfTier(tier) {
  if (!TIER_CACHE.has(tier)) TIER_CACHE.set(tier, PART_IDS.filter((id) => PARTS[id].tier === tier));
  return TIER_CACHE.get(tier);
}

export function partsBySlotTier(slot, tier) {
  return PART_IDS.filter((id) => PARTS[id].slot === slot && PARTS[id].tier === tier);
}

// Signature parts referenced by name from blueprints, so the endgame recipes
// read like recipes instead of like database keys.
export const SIGNATURE = {
  FUSION_CORE: 'motor_t5_a',
  ANTIMATTER_DRIVE: 'motor_t5_b',
  GRAPHENE_FRAME: 'frame_t5_a',
  NEUTRON_FRAME: 'frame_t5_b',
  TOKAMAK_RING: 'battery_t5_a',
  SINGULARITY_CELL: 'battery_t5_b',
  MAGLEV_RING: 'wheels_t5_a',
  PLASMA_TREAD: 'wheels_t5_b',
  GRAVITON_BRAKES: 'brakes_t5_a',
  CAUSALITY_ECU: 'controller_t5_b',
};

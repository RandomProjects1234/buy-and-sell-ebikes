// ---------------------------------------------------------------------------
// FACILITIES
// ---------------------------------------------------------------------------

// Facilities quietly print parts of a fixed tier, online and offline. They are
// the long game: expensive up front, and the parts still have to be built into
// bikes at the Workbench. There is no Void or Fossil facility - those tiers
// only come out of their crates.
export const FARMS = [
  { id: 'scrap_yard',    name: 'Scrap Yard',        tier: 0, rate: 0.18, cost: 900,    growth: 1.15, unlock: { lifetime: 1500 },
    desc: 'Four skips, a dog, and an inexhaustible supply of bent tubing.' },
  { id: 'parts_depot',   name: 'Parts Depot',       tier: 1, rate: 0.18, cost: 19000,  growth: 1.15, unlock: { lifetime: 45000 },
    desc: 'A leased unit on an industrial estate. Smells of cardboard and WD-40.' },
  { id: 'fab_lab',       name: 'Fab Lab',           tier: 2, rate: 0.18, cost: 600000, growth: 1.15, unlock: { lifetime: 900000 },
    desc: 'CNC mill, lathe, and one very territorial 3D printer.' },
  { id: 'carbon_foundry',name: 'Carbon Foundry',    tier: 3, rate: 0.18, cost: 1.5e7,  growth: 1.16, unlock: { lifetime: 3e7 },
    desc: 'Autoclaves the size of buses. The apprentices wear respirators.' },
  { id: 'reactor_line',  name: 'Reactor Line',      tier: 4, rate: 0.18, cost: 7e8,    growth: 1.16, unlock: { lifetime: 1.5e9 },
    desc: 'Cleanroom, tungsten shielding, and a badge reader that asks twice.' },
  { id: 'singularity_line', name: 'Singularity Line', tier: 5, rate: 0.18, cost: 1.1e11, growth: 1.17, unlock: { lifetime: 2e11 },
    desc: 'Nobody will confirm what happens on the third floor. Output is excellent.' },
];

export const FARM_BY_ID = Object.fromEntries(FARMS.map((f) => [f.id, f]));

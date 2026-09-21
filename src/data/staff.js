// ---------------------------------------------------------------------------
// STAFF + FACILITIES
// ---------------------------------------------------------------------------

// Each role automates exactly one stage of the manual loop, slower than a human
// doing it well, but it never stops and it runs while the tab is closed.
export const ROLES = [
  {
    id: 'runner',
    name: 'Crate Runner',
    plural: 'Crate Runners',
    stage: 'Buying + opening crates',
    rate: 0.16,           // crates opened per second, per worker
    cost: 1100, growth: 1.15,
    unlock: { lifetime: 2500 },
    desc: 'Drives the van, pays Big Dave, opens the crate in the car park.',
    managerCost: 1.5e6,
    managerName: 'Depot Manager',
    managerDesc: 'Runners buy up to the best crate you can afford instead of the one you picked.',
    config: 'crate',
  },
  {
    id: 'sorter',
    name: 'Parts Sorter',
    plural: 'Parts Sorters',
    stage: 'Salvaging surplus parts',
    rate: 0.2,            // salvage operations per second
    cost: 12000, growth: 1.16,
    unlock: { lifetime: 50000 },
    desc: 'Melts your junk pile down into fewer, better parts. 12 in, 1 out, one tier up.',
    managerCost: 1.2e7,
    managerName: 'Yard Foreman',
    managerDesc: 'Salvage ratio improves from 12:1 to 8:1, which makes melting stock properly profitable.',
  },
  {
    id: 'wrench',
    name: 'Wrench',
    plural: 'Wrenches',
    stage: 'Crafting builds',
    rate: 0.1,            // crafts per second
    cost: 110000, growth: 1.16,
    unlock: { lifetime: 350000 },
    desc: 'Assembles the blueprint you point them at, as long as the parts are in the bin.',
    managerCost: 1.6e8,
    managerName: 'Head Mechanic',
    managerDesc: 'Wrenches pick the most valuable blueprint they can actually build.',
    config: 'blueprint',
  },
  {
    id: 'closer',
    name: 'Closer',
    plural: 'Closers',
    stage: 'Selling finished builds',
    rate: 0.18,           // sales per second
    cost: 800000, growth: 1.17,
    unlock: { lifetime: 2.5e6 },
    desc: 'Sells whatever is on the floor. Takes a cut: you net 92 percent.',
    managerCost: 2e9,
    managerName: 'Sales Director',
    managerDesc: 'No more commission cut - closers hand over the full sale price.',
  },
];

export const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));
export const COMMISSION = 0.92;      // closer cut before the Sales Director manager

// Facilities quietly print parts of a fixed tier. They are the long game:
// expensive up front, and worthless unless you have Wrenches and Closers to
// turn the output into money.
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

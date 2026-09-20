// ---------------------------------------------------------------------------
// STAFF + FACILITIES + IPO PERKS
// ---------------------------------------------------------------------------

// Each role automates exactly one stage of the manual loop, slower than a human
// doing it well, but it never stops and it runs while the tab is closed.
export const ROLES = [
  {
    id: 'runner',
    name: 'Crate Runner',
    plural: 'Crate Runners',
    stage: 'Buying + opening crates',
    rate: 0.12,           // crates opened per second, per worker
    cost: 2500, growth: 1.17,
    unlock: { lifetime: 12000 },
    desc: 'Drives the van, pays Big Dave, opens the crate in the car park.',
    managerCost: 6e6,
    managerName: 'Depot Manager',
    managerDesc: 'Runners buy up to the best crate you can afford instead of the one you picked.',
    config: 'crate',
  },
  {
    id: 'sorter',
    name: 'Parts Sorter',
    plural: 'Parts Sorters',
    stage: 'Salvaging surplus parts',
    rate: 0.16,           // salvage operations per second
    cost: 30000, growth: 1.18,
    unlock: { lifetime: 250000 },
    desc: 'Melts your junk pile down into fewer, better parts. 24 in, 1 out, one tier up.',
    managerCost: 5e7,
    managerName: 'Yard Foreman',
    managerDesc: 'Salvage ratio improves from 24:1 to 16:1, which finally makes melting stock profitable.',
  },
  {
    id: 'wrench',
    name: 'Wrench',
    plural: 'Wrenches',
    stage: 'Crafting builds',
    rate: 0.07,           // crafts per second
    cost: 350000, growth: 1.19,
    unlock: { lifetime: 2e6 },
    desc: 'Assembles the blueprint you point them at, as long as the parts are in the bin.',
    managerCost: 7e8,
    managerName: 'Head Mechanic',
    managerDesc: 'Wrenches pick the most valuable blueprint they can actually build.',
    config: 'blueprint',
  },
  {
    id: 'closer',
    name: 'Closer',
    plural: 'Closers',
    stage: 'Selling finished builds',
    rate: 0.13,           // sales per second
    cost: 3e6, growth: 1.2,
    unlock: { lifetime: 2.5e7 },
    desc: 'Sells whatever is on the floor. Takes a cut: you net 88 percent.',
    managerCost: 9e9,
    managerName: 'Sales Director',
    managerDesc: 'No more commission cut - closers hand over the full sale price.',
  },
];

export const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));
export const COMMISSION = 0.88;      // closer cut before the Sales Director manager

// Facilities quietly print parts of a fixed tier. They are the long game:
// expensive up front, and worthless unless you have Wrenches and Closers to
// turn the output into money.
export const FARMS = [
  { id: 'scrap_yard',    name: 'Scrap Yard',        tier: 0, rate: 0.12, cost: 1500,   growth: 1.16, unlock: { lifetime: 6000 },
    desc: 'Four skips, a dog, and an inexhaustible supply of bent tubing.' },
  { id: 'parts_depot',   name: 'Parts Depot',       tier: 1, rate: 0.12, cost: 34000,  growth: 1.16, unlock: { lifetime: 180000 },
    desc: 'A leased unit on an industrial estate. Smells of cardboard and WD-40.' },
  { id: 'fab_lab',       name: 'Fab Lab',           tier: 2, rate: 0.12, cost: 1.1e6,  growth: 1.16, unlock: { lifetime: 4e6 },
    desc: 'CNC mill, lathe, and one very territorial 3D printer.' },
  { id: 'carbon_foundry',name: 'Carbon Foundry',    tier: 3, rate: 0.12, cost: 2.8e7,  growth: 1.17, unlock: { lifetime: 1.2e8 },
    desc: 'Autoclaves the size of buses. The apprentices wear respirators.' },
  { id: 'reactor_line',  name: 'Reactor Line',      tier: 4, rate: 0.12, cost: 1.4e9,  growth: 1.17, unlock: { lifetime: 6e9 },
    desc: 'Cleanroom, tungsten shielding, and a badge reader that asks twice.' },
  { id: 'singularity_line', name: 'Singularity Line', tier: 5, rate: 0.12, cost: 2.4e11, growth: 1.18, unlock: { lifetime: 9e11 },
    desc: 'Nobody will confirm what happens on the third floor. Output is excellent.' },
];

export const FARM_BY_ID = Object.fromEntries(FARMS.map((f) => [f.id, f]));

// IPO perks. Bought with shares; owning them is permanent across every reset.
export const PERKS = [
  { id: 'founders_kit', name: "Founder's Toolkit", cost: 3,
    desc: 'Every rebrand starts with $40,000 of seed money and a pallet of Standard parts.' },
  { id: 'muscle_memory', name: 'Muscle Memory', cost: 4,
    desc: 'Your hands remember every bike you ever built. Click value x3.' },
  { id: 'brand_recognition', name: 'Brand Recognition', cost: 5,
    desc: 'The name survives the rebrand. All sale prices +40%.' },
  { id: 'night_shift', name: 'Night Shift', cost: 6,
    desc: 'The lights never go off. Offline earnings cap 8h to 24h.' },
  { id: 'retained_talent', name: 'Retained Talent', cost: 8,
    desc: 'Three of every unlocked staff role follow you to the new company.' },
  { id: 'fast_hands', name: 'Fast Hands', cost: 10,
    desc: 'Company-wide training. All staff work 50% faster, forever.' },
  { id: 'showroom_legacy', name: 'Showroom Legacy', cost: 12,
    desc: 'Your showroom bike is yours. It survives every IPO from here on.' },
  { id: 'warehouse', name: 'Bonded Warehouse', cost: 15,
    desc: 'Half your parts inventory (rounded down) carries through a rebrand.' },
  { id: 'kirkin_insider', name: 'Kirkin Insider', cost: 20,
    desc: 'Somebody talks. Schematic fragments drop four times as often.' },
];

export const PERK_BY_ID = Object.fromEntries(PERKS.map((p) => [p.id, p]));

// shares = floor(sqrt(run earnings / SHARE_DIVISOR)); each lifetime share is
// worth SHARE_BONUS to the global money multiplier.
export const SHARE_DIVISOR = 1e7;
export const SHARE_BONUS = 0.03;

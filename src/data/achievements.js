// ---------------------------------------------------------------------------
// AWARDS
// ---------------------------------------------------------------------------
// Each one is a badge plus a permanent +1% to every dollar you make, so the
// wall of them is worth filling. `test` gets the live state and must be cheap -
// they are all evaluated once a tick.

const totalWorkers = (s) => Object.values(s.workers).reduce((a, b) => a + b, 0);
const totalFarms = (s) => Object.values(s.farms).reduce((a, b) => a + b, 0);
const soldOf = (s, id) => s.sold[id] || 0;

export const ACHIEVEMENTS = [
  // --- clicking -------------------------------------------------------------
  { id: 'click_100', name: 'Test Rider', icon: 'bolt', desc: '100 test rides.',
    test: (s) => s.clicks >= 100 },
  { id: 'click_1k', name: 'Sore Wrist', icon: 'bolt', desc: '1,000 test rides.',
    test: (s) => s.clicks >= 1000 },
  { id: 'click_10k', name: 'Repetitive Strain', icon: 'bolt', desc: '10,000 test rides.',
    test: (s) => s.clicks >= 10000 },
  { id: 'click_50k', name: 'See A Doctor', icon: 'bolt', desc: '50,000 test rides.',
    test: (s) => s.clicks >= 50000 },

  // --- money ----------------------------------------------------------------
  { id: 'earn_1k', name: 'First Grand', icon: 'money', desc: 'Earn $1,000 all time.',
    test: (s) => s.lifetime >= 1000 },
  { id: 'earn_1m', name: 'Six Figures, Then Seven', icon: 'money', desc: 'Earn $1M all time.',
    test: (s) => s.lifetime >= 1e6 },
  { id: 'earn_1b', name: 'Bike Baron', icon: 'money', desc: 'Earn $1B all time.',
    test: (s) => s.lifetime >= 1e9 },
  { id: 'earn_1t', name: 'Too Big To Fail', icon: 'money', desc: 'Earn $1T all time.',
    test: (s) => s.lifetime >= 1e12 },
  { id: 'earn_1qa', name: 'Numbers Stopped Meaning Things', icon: 'money', desc: 'Earn $1Qa all time.',
    test: (s) => s.lifetime >= 1e15 },

  // --- crates ---------------------------------------------------------------
  { id: 'crate_10', name: 'Dave Knows Your Name', icon: 'crate', desc: 'Open 10 crates.',
    test: (s) => s.stats.cratesOpened >= 10 },
  { id: 'crate_250', name: 'Crate Expectations', icon: 'crate', desc: 'Open 250 crates.',
    test: (s) => s.stats.cratesOpened >= 250 },
  { id: 'crate_5k', name: 'Pallet Problem', icon: 'crate', desc: 'Open 5,000 crates.',
    test: (s) => s.stats.cratesOpened >= 5000 },
  { id: 'hoard', name: 'Hoarder', icon: 'crate', desc: 'Hold 1,000 parts at once.',
    test: (s) => Object.values(s.parts).reduce((a, b) => a + b, 0) >= 1000 },
  { id: 'salvage_1k', name: 'Scrap Merchant', icon: 'gear', desc: 'Salvage 1,000 parts.',
    test: (s) => s.stats.salvaged >= 1000 },

  // --- building -------------------------------------------------------------
  { id: 'build_1', name: 'It Rolls', icon: 'wrench', desc: 'Finish your first build.',
    test: (s) => s.stats.builds >= 1 },
  { id: 'build_50', name: 'Production Line', icon: 'wrench', desc: 'Finish 50 builds.',
    test: (s) => s.stats.builds >= 50 },
  { id: 'build_1k', name: 'Factory Floor', icon: 'wrench', desc: 'Finish 1,000 builds.',
    test: (s) => s.stats.builds >= 1000 },
  { id: 'scooter_100', name: 'Scooter Cartel', icon: 'sell', desc: 'Sell 100 scooters.',
    test: (s) => Object.entries(s.sold).filter(([id]) => /scoot|kick|razr|hoverlite/.test(id))
      .reduce((a, [, n]) => a + n, 0) >= 100 },
  { id: 'sale_1m', name: 'One Big Sale', icon: 'sell', desc: 'Sell a build for over $1M.',
    test: (s) => s.stats.bestSale >= 1e6 },
  { id: 'sale_1b', name: 'Collector Money', icon: 'sell', desc: 'Sell a build for over $1B.',
    test: (s) => s.stats.bestSale >= 1e9 },
  { id: 'stark', name: 'Fooled Me Once', icon: 'star', desc: 'Build a Stark Vark. It looked so good.',
    test: (s) => (s.crafted.stark_vark || 0) >= 1 },
  { id: 'nuclear', name: 'Three Thousand Miles An Hour', icon: 'bolt', desc: 'Build a nuclear engine bike.',
    test: (s) => (s.crafted.nuclear_mk1 || 0) >= 1 || (s.crafted.atomizer || 0) >= 1 },

  // --- staff ----------------------------------------------------------------
  { id: 'hire_1', name: 'Employer', icon: 'staff', desc: 'Hire your first member of staff.',
    test: (s) => totalWorkers(s) >= 1 },
  { id: 'hire_25', name: 'Payroll', icon: 'staff', desc: 'Employ 25 people.',
    test: (s) => totalWorkers(s) >= 25 },
  { id: 'hire_200', name: 'Someone Else Does It Now', icon: 'staff', desc: 'Employ 200 people.',
    test: (s) => totalWorkers(s) >= 200 },
  { id: 'manager_1', name: 'Middle Management', icon: 'star', desc: 'Promote a manager.',
    test: (s) => Object.keys(s.managers).length >= 1 },
  { id: 'manager_all', name: 'Fully Delegated', icon: 'star', desc: 'Promote all four managers.',
    test: (s) => Object.keys(s.managers).length >= 4 },
  { id: 'farm_1', name: 'Landlord', icon: 'farm', desc: 'Open your first facility.',
    test: (s) => totalFarms(s) >= 1 },
  { id: 'farm_50', name: 'Industrial Estate', icon: 'farm', desc: 'Reach 50 total facility levels.',
    test: (s) => totalFarms(s) >= 50 },

  // --- wheelie --------------------------------------------------------------
  { id: 'wheelie_first', name: 'Front Wheel Up', icon: 'wheelie', desc: 'Ride the treadmill once.',
    test: (s) => s.wheelie.runs >= 1 },
  { id: 'wheelie_3k', name: 'Balanced', icon: 'wheelie', desc: 'Score 3,000 in wheelie mode.',
    test: (s) => s.wheelie.best >= 3000 },
  { id: 'wheelie_12k', name: 'Showboat', icon: 'wheelie', desc: 'Score 12,000 in wheelie mode.',
    test: (s) => s.wheelie.best >= 12000 },

  // --- spanners + prestige --------------------------------------------------
  { id: 'spanner_1', name: 'Shiny', icon: 'gear', desc: 'Catch a golden spanner.',
    test: (s) => (s.stats.spanners || 0) >= 1 },
  { id: 'spanner_25', name: 'Quick Hands', icon: 'gear', desc: 'Catch 25 golden spanners.',
    test: (s) => (s.stats.spanners || 0) >= 25 },
  { id: 'ipo_1', name: 'Ring The Bell', icon: 'ipo', desc: 'Take the company public once.',
    test: (s) => s.prestige.runs >= 1 },
  { id: 'ipo_10', name: 'Serial Founder', icon: 'ipo', desc: 'Take a company public 10 times.',
    test: (s) => s.prestige.runs >= 10 },
  { id: 'shares_100', name: 'Majority Holder', icon: 'ipo', desc: 'Hold 100 lifetime shares.',
    test: (s) => s.prestige.lifetimeShares >= 100 },

  // --- secrets --------------------------------------------------------------
  { id: 'fragment', name: 'Torn Corner', icon: 'fragment', desc: 'Find a Kirkin schematic fragment.', secret: true,
    test: (s) => s.fragments >= 1 || !!s.unlocked.kirkin_g4 },
  { id: 'kirkin_g2', name: 'Behind The Sign', icon: 'star', desc: 'Discover the Kirkin G2.', secret: true,
    test: (s) => !!s.unlocked.kirkin_g2 },
  { id: 'kirkin_g4', name: 'Kirkin Has Left', icon: 'star', desc: 'Build the Kirkin G4.', secret: true,
    test: (s) => (s.crafted.kirkin_g4 || 0) >= 1 },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Each award is worth this much to the global money multiplier. */
export const AWARD_BONUS = 0.01;

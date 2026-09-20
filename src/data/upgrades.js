// ---------------------------------------------------------------------------
// UPGRADES - one-off permanent purchases
// ---------------------------------------------------------------------------
// `effect` is read by src/systems/economy.js. Supported keys:
//   clickAdd      flat dollars added to the base click value
//   clickMult     multiplies click value
//   sellMult      multiplies every sale
//   luck          chance for a crate drop to roll one tier higher
//   crateDiscount fraction off crate prices
//   autoMult      worker speed multiplier
//   wheelieMult   wheelie payout multiplier
//   wheelieZone   widens the wheelie sweet zone (degrees each side)
//   wheelieSave   free crashes per run
//   demandFloor   raises the minimum demand a model can sink to
//   offlineHours  extra offline-earnings cap
//   showroomMult  multiplies the showroom bike's click bonus

export const UPGRADES = [
  // --- clicking -------------------------------------------------------------
  { id: 'tire_levers', group: 'click', name: 'Tire Levers', cost: 60, effect: { clickAdd: 1 },
    desc: 'Two bits of plastic that turn a 40 minute job into a 4 minute job.' },
  { id: 'torque_wrench', group: 'click', name: 'Torque Wrench', cost: 450, effect: { clickMult: 2 },
    desc: 'Click, click, click. That sound is money.' },
  { id: 'reels', group: 'click', name: 'Test Ride Reels', cost: 4200, effect: { clickMult: 2 },
    desc: 'Film every test ride vertically. Engagement is a mechanical part now.' },
  { id: 'fake_exhaust', group: 'click', name: 'Fake Exhaust Speaker', cost: 34000, effect: { clickMult: 2 },
    desc: 'Bolt-on speaker that makes a silent bike sound like a chainsaw. Buyers love it.' },
  { id: 'showroom_lights', group: 'click', name: 'Showroom Lights', cost: 260000, effect: { clickMult: 2, showroomMult: 1.25 },
    desc: 'Nothing sells a used bike like eleven thousand lumens of denial.' },
  { id: 'ride_fee', group: 'click', name: 'Test Ride Deposit', cost: 2.4e6, effect: { clickMult: 3 },
    desc: 'They pay you to ride the thing they might buy. Genius, frankly.' },
  { id: 'hype_man', group: 'click', name: 'Hype Man', cost: 6e7, effect: { clickMult: 3 },
    desc: 'Stands outside shouting specs at pedestrians. Wildly effective.' },
  { id: 'crash_comp', group: 'click', name: 'Viral Crash Compilation', cost: 1.4e9, effect: { clickMult: 3 },
    desc: 'Ninety seconds of other people falling off. Six million views. All yours.' },
  { id: 'bot_farm', group: 'click', name: 'Follower Farm', cost: 5e10, effect: { clickMult: 4 },
    desc: 'Forty thousand accounts, all named after washing machines, all obsessed with you.' },
  { id: 'nuclear_marketing', group: 'click', name: 'Nuclear Marketing', cost: 3e12, effect: { clickMult: 5, showroomMult: 1.5 },
    desc: 'The billboard is visible from orbit. The lawsuit is visible from further.' },

  // --- selling --------------------------------------------------------------
  { id: 'haggling', group: 'sell', name: 'Haggling 101', cost: 1200, effect: { sellMult: 1.25 },
    desc: 'Simply stand there in silence after they name a price.' },
  { id: 'certified', group: 'sell', name: 'Certified Pre-Owned Sticker', cost: 65000, effect: { sellMult: 1.35 },
    desc: 'A sticker. A whole sticker. Worth 35 percent, apparently.' },
  { id: 'warranty', group: 'sell', name: 'Extended Warranty Program', cost: 3.4e6, effect: { sellMult: 1.5 },
    desc: 'Covers everything except the parts that break.' },
  { id: 'brand_loyalty', group: 'sell', name: 'Brand Loyalty', cost: 2.4e8, effect: { sellMult: 1.4, demandFloor: 0.2 },
    desc: 'Buyers stop caring that you sold four hundred of these last week.' },
  { id: 'auction_house', group: 'sell', name: 'Auction House Access', cost: 1.2e10, effect: { sellMult: 1.75 },
    desc: 'Paddle number 12. Champagne is complimentary. So are the bidding wars.' },
  { id: 'govt_contract', group: 'sell', name: 'Government Contract', cost: 6e11, effect: { sellMult: 2 },
    desc: 'They need 40,000 units and they have never once asked the price.' },

  // --- crates ---------------------------------------------------------------
  { id: 'good_eye', group: 'crate', name: 'A Good Eye', cost: 2600, effect: { luck: 0.1 },
    desc: 'You can spot a real motor in a pile of fakes from across the yard.' },
  { id: 'supplier', group: 'crate', name: 'Supplier Contact', cost: 165000, effect: { luck: 0.1, crateDiscount: 0.1 },
    desc: 'His name is Kev. Do not ask Kev where the crates come from.' },
  { id: 'customs', group: 'crate', name: 'Friend at Customs', cost: 9.5e6, effect: { luck: 0.15 },
    desc: 'The paperwork gets stamped before it gets read.' },
  { id: 'manifest', group: 'crate', name: 'Insider Manifest', cost: 7e8, effect: { luck: 0.15, crateDiscount: 0.15 },
    desc: 'You know what is in the pallet before the pallet does.' },
  { id: 'bulk_pallets', group: 'crate', name: 'Bulk Pallet Pricing', cost: 4e10, effect: { crateDiscount: 0.2 },
    desc: 'Buy enough of anything and the price stops being a number and starts being a conversation.' },

  // --- wheelie --------------------------------------------------------------
  { id: 'grippy_pedals', group: 'wheelie', name: 'Grippy Pedals', cost: 12000, effect: { wheelieZone: 3 },
    desc: 'Shins beware. The balance window gets noticeably kinder.' },
  { id: 'wheelie_bar', group: 'wheelie', name: 'Wheelie Bar', cost: 900000, effect: { wheelieSave: 1 },
    desc: 'One free catastrophe per run. Use it wisely, or immediately.' },
  { id: 'sticky_treadmill', group: 'wheelie', name: 'Sticky Treadmill', cost: 5e7, effect: { wheelieMult: 1.6, wheelieZone: 2 },
    desc: 'Grippier belt, longer balance, louder crowd.' },
  { id: 'crowd_barrier', group: 'wheelie', name: 'Crowd Barrier', cost: 2.5e9, effect: { wheelieMult: 2.2 },
    desc: 'Now that people can safely watch, people pay to watch.' },

  // --- automation -----------------------------------------------------------
  { id: 'shift_leader', group: 'auto', name: 'Shift Leader', cost: 6e6, effect: { autoMult: 1.25 },
    desc: 'Somebody has to tell them which pile is which.' },
  { id: 'overtime', group: 'auto', name: 'Overtime Pay', cost: 9e8, effect: { autoMult: 1.5 },
    desc: 'Morale is a multiplier and money is morale.' },
  { id: 'robot_arms', group: 'auto', name: 'Robot Arms', cost: 2.5e11, effect: { autoMult: 2 },
    desc: 'Six axes, zero complaints, one very specific safety interlock.' },
  { id: 'night_crew', group: 'auto', name: 'Night Crew', cost: 4e7, effect: { offlineHours: 6 },
    desc: 'The lights stay on after you log off. Offline earnings cap goes up.' },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export const UPGRADE_GROUPS = [
  { id: 'click', name: 'Wrenching' },
  { id: 'sell', name: 'Sales Floor' },
  { id: 'crate', name: 'Sourcing' },
  { id: 'wheelie', name: 'Stunt Rig' },
  { id: 'auto', name: 'Operations' },
];

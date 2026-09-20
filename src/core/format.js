// Number formatting. The game runs from $1 to numbers with 40+ digits, so
// everything the player sees goes through here.

const SUFFIXES = [
  '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg',
];

/** Short number: 1234 -> 1.23K, 5.2e18 -> 5.20Qi, beyond the table -> 1.23e45 */
export function fmtNum(value, opts = {}) {
  const n = Number(value) || 0;
  if (!isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) {
    if (opts.int || abs >= 100) return sign + Math.floor(abs).toString();
    if (abs === 0) return '0';
    if (abs < 0.01) return sign + abs.toExponential(1);
    if (abs < 10) return sign + trim(abs.toFixed(2));
    return sign + trim(abs.toFixed(1));
  }
  const group = Math.floor(Math.log10(abs) / 3);
  if (group >= SUFFIXES.length) {
    return sign + abs.toExponential(2).replace('e+', 'e');
  }
  const scaled = abs / Math.pow(1000, group);
  const digits = scaled >= 100 ? 1 : 2;
  return sign + trim(scaled.toFixed(digits)) + SUFFIXES[group];
}

function trim(s) {
  return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s;
}

export function fmtMoney(value, opts) {
  const n = Number(value) || 0;
  return (n < 0 ? '-$' : '$') + fmtNum(Math.abs(n), opts);
}

/** "$12.4K/s". Trailing fractions of a cent read as noise, so they round to 0. */
export function fmtRate(value) {
  const n = Number(value) || 0;
  return (Math.abs(n) < 0.005 ? '$0' : fmtMoney(n)) + '/s';
}

/** 0.0725 -> "+7.3%" */
export function fmtPct(fraction, { sign = true } = {}) {
  const pct = fraction * 100;
  const body = (Math.abs(pct) >= 100 ? pct.toFixed(0) : pct.toFixed(1)) + '%';
  return sign && pct > 0 ? '+' + body : body;
}

/** 3.5 -> "3.5x" */
export function fmtMult(x) {
  return fmtNum(x) + 'x';
}

/** 3725 seconds -> "1h 2m" */
export function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + (m % 60) + 'm';
  const d = Math.floor(h / 24);
  return d + 'd ' + (h % 24) + 'h';
}

/** Cost of buying `count` more of something with geometric price growth. */
export function geometricCost(base, growth, owned, count = 1) {
  if (growth === 1) return base * count;
  return base * Math.pow(growth, owned) * (Math.pow(growth, count) - 1) / (growth - 1);
}

/** How many you can afford at geometric prices, given `money`. */
export function affordableCount(base, growth, owned, money) {
  if (money < base * Math.pow(growth, owned)) return 0;
  const n = Math.log(1 + (money * (growth - 1)) / (base * Math.pow(growth, owned))) / Math.log(growth);
  return Math.max(0, Math.floor(n));
}

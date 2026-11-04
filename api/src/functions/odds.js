// Deskside election odds relay. Reads Kalshi's public market data for the 2026 Senate and
// governor races and for control of each chamber, and sends back one small summary.
// Kalshi's market data needs no account or key. These are betting odds, not vote counts.
const { app } = require('@azure/functions');

const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';
const SENATE = ['AL','AK','AR','CO','DE','FL','GA','ID','IL','IA','KS','KY','LA','ME','MA','MI','MN','MS','MT','NE','NH','NJ','NM','NC','OH','OK','OR','RI','SC','SD','TN','TX','VA','WV','WY'];
const GOVERNOR = ['AL','AK','AZ','AR','CA','CO','CT','FL','GA','HI','ID','IL','IA','KS','ME','MD','MA','MI','MN','NE','NV','NH','NM','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','VT','WI','WY'];
const SETS = {
  senate: SENATE.map(st => [st, 'SENATE' + st + '-26']),
  governor: GOVERNOR.map(st => [st, 'KXGOVPARTY' + st + '-26'])
};
const CONTROL = { S: 'CONTROLS-2026', H: 'CONTROLH-2026' };
const cache = {};

const cents = v => {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) * 100 : Number(v);
  return isNaN(n) ? null : n;
};
// one market -> chance in percent: settled result first, then the bid/ask midpoint, then the last trade
function chance(m) {
  if (m.result === 'yes') return 100;
  if (m.result === 'no') return 0;
  const bid = m.yes_bid_dollars != null ? cents(m.yes_bid_dollars) : cents(m.yes_bid);
  const ask = m.yes_ask_dollars != null ? cents(m.yes_ask_dollars) : cents(m.yes_ask);
  const last = m.last_price_dollars != null ? cents(m.last_price_dollars) : cents(m.last_price);
  if (bid != null && ask != null && ask > 0 && ask - bid <= 12) return (bid + ask) / 2;
  if (last != null && last > 0) return last;
  if (bid != null && ask != null) return (bid + ask) / 2;
  return null;
}
function side(m) {
  const suf = String(m.ticker || '').split('-').pop().toUpperCase();
  const t = String(m.yes_sub_title || m.subtitle || '').toLowerCase();
  if (suf === 'D' || /democrat/.test(t)) return 'D';
  if (suf === 'R' || /republican/.test(t)) return 'R';
  if (suf === 'I' || /independent/.test(t)) return 'I';
  return suf || 'O';
}
async function event(ticker) {
  const r = await fetch(KALSHI + '/events/' + encodeURIComponent(ticker) + '?with_nested_markets=true', { headers: { accept: 'application/json', 'user-agent': 'Deskside relay' } });
  if (!r.ok) return null;
  const j = await r.json();
  const ev = j.event || {};
  const mk = (ev.markets && ev.markets.length ? ev.markets : j.markets) || [];
  const o = mk.map(m => ({ k: side(m), n: m.yes_sub_title || m.subtitle || '', p: chance(m), st: m.status || '', r: m.result || '' })).filter(x => x.p != null);
  const sum = o.reduce((s, x) => s + x.p, 0);
  if (sum > 0) o.forEach(x => { x.p = Math.round(x.p / sum * 1000) / 10; });
  o.sort((a, b) => b.p - a.p);
  return { t: ev.title || '', s: ev.sub_title || '', o };
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } }));
  return out;
}

async function handler(request) {
  const set = (request.query.get('set') || 'senate').toLowerCase();
  if (!SETS[set]) return { status: 400, jsonBody: { error: 'Unknown set.' } };
  const c = cache[set];
  if (c && Date.now() - c.t < 60000) return { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: c.body };
  try {
    const list = SETS[set];
    const res = await pool(list, 8, x => event(x[1]));
    const races = {};
    list.forEach((x, i) => { if (res[i] && res[i].o.length) races[x[0]] = res[i]; });
    const ctl = await pool(Object.keys(CONTROL), 2, k => event(CONTROL[k]));
    const control = {};
    Object.keys(CONTROL).forEach((k, i) => { if (ctl[i]) { control[k] = {}; ctl[i].o.forEach(x => { control[k][x.k] = x.p; }); } });
    if (!Object.keys(races).length && !Object.keys(control).length) return { status: 502, jsonBody: { error: 'Kalshi did not answer.' } };
    const body = JSON.stringify({ set, updated: new Date().toISOString(), source: 'Kalshi', races, control });
    cache[set] = { t: Date.now(), body };
    return { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body };
  } catch (e) {
    return { status: 502, jsonBody: { error: 'Kalshi could not be reached.' } };
  }
}

app.http('odds', { methods: ['GET'], authLevel: 'anonymous', handler });
module.exports = { handler, chance, side, event };

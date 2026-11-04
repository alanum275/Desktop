// Deskside election odds relay. Reads Kalshi's public market data for the 2026 Senate and
// governor races and for control of each chamber, and sends back one small summary.
// Kalshi's market data needs no account or key. These are betting odds, not vote counts.
const { app } = require('@azure/functions');

const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';
const SENATE = ['AL','AK','AR','CO','DE','FL','GA','ID','IL','IA','KS','KY','LA','ME','MA','MI','MN','MS','MT','NE','NH','NJ','NM','NC','OH','OK','OR','RI','SC','SD','TN','TX','VA','WV','WY'];
const GOVERNOR = ['AL','AK','AZ','AR','CA','CO','CT','FL','GA','HI','ID','IL','IA','KS','ME','MD','MA','MI','MN','NE','NV','NH','NM','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','VT','WI','WY'];
// Kalshi's tickers don't always match the state (Kentucky's Senate race is SENATELA-26, the Ohio and
// Florida specials end in S, some governor races start with KX), so every likely ticker is tried and
// each race is placed by the state named in its title
const SETS = {
  senate: { states: SENATE, word: /senate/i, tickers: st => ['SENATE' + st + '-26', 'SENATE' + st + 'S-26', 'KXSENATE' + st + '-26'] },
  governor: { states: GOVERNOR, word: /governor/i, tickers: st => ['GOVPARTY' + st + '-26', 'KXGOVPARTY' + st + '-26'] }
};
const NAMES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
// the state named in a title, longest name first so West Virginia isn't read as Virginia
const BYLEN = Object.keys(NAMES).sort((a, b) => NAMES[b].length - NAMES[a].length);
function stateIn(title) { const t = String(title || ''); for (const k of BYLEN) { if (new RegExp('\\b' + NAMES[k] + '\\b', 'i').test(t)) return k; } return null; }
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
    const S = SETS[set];
    const list = [];
    S.states.forEach(st => S.tickers(st).forEach(tk => list.push([st, tk])));
    const res = await pool(list, 8, x => event(x[1]));
    const races = {};
    list.forEach((x, i) => {
      const r = res[i];
      if (!r || !r.o.length) return;
      if (r.t && !S.word.test(r.t)) return;
      const st = stateIn(r.t) || x[0];
      if (S.states.indexOf(st) < 0) return;
      if (!races[st]) { r.tk = x[1]; races[st] = r; }
    });
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
module.exports = { handler, chance, side, event, stateIn };

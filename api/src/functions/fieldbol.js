// Deskside FieldBOL relay. Reads the same data the FieldBOL live tracker uses
// (jobs, commodities, tickets) and sends back only what the Deskside card needs:
// no signatures, photos, driver names or notes.
const { app } = require('@azure/functions');

const FIELDBOL_API = process.env.FIELDBOL_API ||
  'https://fieldbol-api-cggkauayhzbea9bt.eastus-01.azurewebsites.net/api';

let cache = null; // { t, body }

const parse = v => {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!(s.startsWith('[') || s.startsWith('{'))) return v;
  try { return JSON.parse(s); } catch (e) { return v; }
};

async function table(name) {
  const r = await fetch(FIELDBOL_API + '/getData?table=' + name, {
    headers: { 'user-agent': 'Deskside relay' }
  });
  if (!r.ok) throw new Error(name + ' HTTP ' + r.status);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function matName(t) {
  const type = t.cType === 'Ferrous' ? 'Ferrous' : t.cType === 'NonFerrous' ? 'Non-Ferrous' : '';
  let inner = t.cName || '';
  if (t.cPrep === 'Prepared') inner = 'Prep. ' + inner;
  else if (t.cPrep === 'Unprepared') inner = 'Unprep. ' + inner;
  return type ? type + ' (' + inner + ')' : inner;
}

// Same trimming as fbTrim() in index.html. Keep the two in step.
function trim(jobs, coms, tickets) {
  jobs = jobs.filter(j => !j.deleted);
  const nf = new Set(coms.filter(c => !c.deleted && c.type === 'NonFerrous').map(c => c.id));
  const jobById = new Map(jobs.map(j => [j.id, j]));
  const isNS = t => {
    const job = jobById.get(t.jId);
    const links = job && parse(job.facilityLinks);
    if (!Array.isArray(links)) return false;
    const link = links.find(l => l && l.facilityId === t.fId);
    const ns = link && parse(link.nonScrapComs);
    return Array.isArray(ns) && ns.includes(t.cId);
  };
  return {
    jobs: jobs.map(j => ({ id: j.id, num: j.num || '', name: j.name || '', active: j.active === true || j.active === 'true' })),
    tickets: tickets.filter(t => t.status === 'active').map(t => ({
      bol: t.bolNumber || '', date: t.date || '', jId: t.jId, mat: matName(t) || t.cName || 'Unknown',
      nf: nf.has(t.cId), ns: isNS(t), net: Number(t.net) || 0, at: t.createdAt || '', tco: t.tco || ''
    }))
  };
}

async function handler() {
  try {
    if (!cache || Date.now() - cache.t > 20000) {
      const [jobs, coms, tickets] = await Promise.all([table('jobs'), table('commodities'), table('tickets')]);
      const out = trim(jobs, coms, tickets);
      out.updated = new Date().toISOString();
      cache = { t: Date.now(), body: JSON.stringify(out) };
    }
    return {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      body: cache.body
    };
  } catch (e) {
    return { status: 502, jsonBody: { error: 'FieldBOL could not be reached.' } };
  }
}

app.http('fieldbol', { methods: ['GET'], authLevel: 'anonymous', handler });
module.exports = { handler, trim };

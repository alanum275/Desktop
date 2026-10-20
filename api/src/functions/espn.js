// Deskside score relay. Fetches ESPN's public scores, team lists and schedules for your Deskside site,
// in case ESPN blocks requests made straight from the browser.
const { app } = require('@azure/functions');

const ALLOWED = /^(baseball|football|basketball|hockey|soccer)\/[a-z0-9.\-]+\/(scoreboard(\?(dates=\d{8}|groups=\d+)(&(dates=\d{8}|groups=\d+))?)?|summary\?event=\d+|teams(\?limit=\d+)?|teams\/\d+\/schedule(\?seasontype=\d)?)$/i;

async function handler(request) {
  const p = (request.query.get('p') || '').trim();
  if (!ALLOWED.test(p)) {
    return { status: 400, jsonBody: { error: 'That path is not allowed.' } };
  }
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/' + p, {
      headers: { 'user-agent': 'Deskside relay' }
    });
    const body = await r.text();
    return {
      status: r.status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': /\/teams/.test(p) ? 'public, max-age=3600' : 'public, max-age=15' },
      body
    };
  } catch (e) {
    return { status: 502, jsonBody: { error: 'ESPN could not be reached.' } };
  }
}

app.http('espn', { methods: ['GET'], authLevel: 'anonymous', handler });
module.exports = { handler, ALLOWED };

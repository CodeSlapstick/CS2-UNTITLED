import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import SteamUser from 'steam-user';
import GlobalOffensive from 'globaloffensive';
import { decodeMatchShareCode } from 'csgo-sharecode';

const token = process.env.STEAM_GC_SERVICE_TOKEN || '';
const refresh = process.env.STEAM_GC_REFRESH_TOKEN || '';
const steam = new SteamUser({ autoRelogin: true });
const gc = new GlobalOffensive(steam);
let ready = false, busy = false;
steam.on('loggedOn', () => steam.gamesPlayed([730]));
steam.on('disconnected', () => { ready = false; });
steam.on('error', () => { ready = false; console.error('Steam service login failed; check server configuration'); });
gc.on('error', () => { ready = false; });
gc.on('connectedToGC', () => { ready = true; });
gc.on('disconnectedFromGC', () => { ready = false; });
if (refresh && token) steam.logOn({ refreshToken: refresh, machineName: 'CS2 UNTITLED match import' });

function resolve(code) {
  const { matchId } = decodeMatchShareCode(code);
  return new Promise((resolve, reject) => {
    const finish = (error, result) => { clearTimeout(timer); gc.off('matchList', listener); error ? reject(error) : resolve(result); };
    const listener = matches => {
      const match = matches.find(m => String(m.matchid) === String(matchId));
      if (!match) return;
      const rounds = [...(match.roundstatsall || []), ...(match.roundstats_legacy ? [match.roundstats_legacy] : [])];
      const replay = rounds.find(r => /^https?:\/\//.test(r.map || ''));
      if (!replay) { finish(new Error('Replay unavailable')); return; }
      const accounts = [...new Set(rounds.flatMap(r => r.reservation?.account_ids || []))];
      finish(null, { match_id: String(matchId), demo_url: replay.map, account_ids: accounts.map(String) });
    };
    const timer = setTimeout(() => finish(new Error('Steam timeout')), 30000);
    gc.on('matchList', listener);
    try { gc.requestGame(code); } catch { finish(new Error('Invalid share code')); }
  });
}
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const send = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
  if (req.url === '/health' && req.method === 'GET') { send(200, { ready, configured: !!(refresh && token) }); return; }
  const supplied = Buffer.from(req.headers.authorization || ''), expected = Buffer.from('Bearer ' + token);
  if (!token || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { send(401, { error: 'Unauthorized' }); return; }
  if (req.url !== '/resolve' || req.method !== 'POST') { send(404, { error: 'Not found' }); return; }
  if (!ready || busy) { send(503, { error: 'Steam service unavailable or busy' }); return; }
  let body = '';
  try {
    for await (const chunk of req) { body += chunk; if (body.length > 4096) { send(413, { error: 'Request too large' }); return; } }
    const input = JSON.parse(body);
    if (typeof input.share_code !== 'string' || !/^CSGO-(?:[A-Za-z0-9]{5}-){4}[A-Za-z0-9]{5}$/.test(input.share_code)) { send(400, { error: 'Invalid share code' }); return; }
    busy = true;
    try { send(200, await resolve(input.share_code)); }
    finally { busy = false; }
  } catch { send(502, { error: 'Steam could not resolve this replay' }); }
}).listen(8091, '0.0.0.0');

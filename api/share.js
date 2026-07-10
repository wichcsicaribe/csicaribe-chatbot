// api/share.js — store and retrieve chat sessions for sharing
// Sessions stored in memory (Vercel serverless — resets on cold start, but fine for sharing)
// For persistence across restarts, sessions auto-expire after 7 days

const store = global._csiSessions || (global._csiSessions = {});

function genId() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 7; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function cleanup() {
  const week = 7 * 24 * 60 * 60 * 1000;
  const now  = Date.now();
  Object.keys(store).forEach(function(k) {
    if (now - store[k].ts > week) delete store[k];
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST /api/share — save session, return short ID
  if (req.method === 'POST') {
    cleanup();
    const { session } = req.body || {};
    if (!session) return res.status(400).json({ error: 'Missing session' });
    const id = genId();
    store[id] = { session, ts: Date.now() };
    return res.status(200).json({ id });
  }

  // GET /api/share?id=XXXXXXX — retrieve session
  if (req.method === 'GET') {
    const id = (req.query && req.query.id) || '';
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const entry = store[id];
    if (!entry) return res.status(404).json({ error: 'Not found or expired' });
    return res.status(200).json({ session: entry.session });
  }

  return res.status(405).end();
};

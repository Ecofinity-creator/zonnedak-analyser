// api/tl-call.js — Vercel serverless function
// Generieke TL API proxy: stuurt requests door naar api.teamleader.eu
// 
// Plaatsen in: api/tl-call.js in de Vercel proxy repo (zonnedak-ai-proxy-west)

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, endpoint, body } = req.body || {};
  if (!user_id || !endpoint) return res.status(400).json({ error: 'Missing user_id or endpoint' });

  // Haal access token op uit KV store (zelfde als andere endpoints)
  // AANPASSEN: gebruik jouw eigen KV/token storage methode
  const token = await getAccessToken(user_id);
  if (!token) return res.status(401).json({ error: 'not_logged_in' });

  // Beveiligde endpoints (enkel read-only om misbruik te beperken)
  const ALLOWED = [
    'workOrders.list', 'appointments.list', 'projects.list',
    'deals.list', 'deals.info', 'timeTracking.list',
    'quotations.list', 'quotations.info', 'quotations.create',
  ];
  if (!ALLOWED.includes(endpoint)) {
    return res.status(403).json({ error: `Endpoint '${endpoint}' niet toegestaan` });
  }

  try {
    const tlResp = await fetch(`https://api.teamleader.eu/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body || {}),
    });

    const data = await tlResp.json();
    if (!tlResp.ok) return res.status(tlResp.status).json({ error: data.errors?.[0]?.title || `TL ${tlResp.status}` });
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Proxy error' });
  }
}

// ── Helper: haal token op uit je KV store ────────────────────────────────────
// AANPASSEN aan jouw Vercel KV/storage implementatie
async function getAccessToken(userId) {
  // Voorbeeld met Vercel KV (zelfde als je andere endpoints waarschijnlijk gebruiken):
  // const { kv } = await import('@vercel/kv');
  // const tokenData = await kv.get(`tl_token:${userId}`);
  // return tokenData?.access_token || null;
  
  // Of via environment variable als fallback (voor single-user setup):
  // return process.env.TL_ACCESS_TOKEN || null;
  
  // Pas dit aan op basis van hoe jouw proxy nu tokens beheert!
  throw new Error('getAccessToken: implementeer op basis van jouw KV storage');
}

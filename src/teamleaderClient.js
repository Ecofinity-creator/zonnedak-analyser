// ─── teamleaderClient.js ────────────────────────────────────────────────────
// Browser-side Teamleader API client.
// Alle calls gaan via de Vercel proxy (zonnedak-ai-proxy-west.vercel.app).
// ─────────────────────────────────────────────────────────────────────────────

const PROXY_BASE = 'https://zonnedak-ai-proxy-west.vercel.app/api';
const USER_ID_KEY = 'zonnedak_tl_user_id';

export function getUserId() {
  let id = null;
  try { id = localStorage.getItem(USER_ID_KEY); } catch {}
  if (id && id.length >= 16 && id.length <= 64) return id;
  const buf = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  id = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(USER_ID_KEY, id); } catch {}
  return id;
}

export function clearUserId() {
  try { localStorage.removeItem(USER_ID_KEY); } catch {}
}

export function startTeamleaderLogin() {
  const userId = getUserId();
  window.location.href = `${PROXY_BASE}/tl-auth-start?user_id=${encodeURIComponent(userId)}`;
}

export async function checkAuthStatus() {
  const userId = getUserId();
  try {
    const resp = await fetch(`${PROXY_BASE}/tl-auth-status?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) return { logged_in: false };
    return await resp.json();
  } catch { return { logged_in: false }; }
}

export function consumeAuthCallback() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const status = params.get('tl_auth');
  if (status) {
    params.delete('tl_auth'); params.delete('reason');
    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
  }
  return status;
}

export async function searchContacts(query) {
  const userId = getUserId();
  if (!query || query.trim().length < 2) return { results: [] };
  try {
    const resp = await fetch(`${PROXY_BASE}/tl-contacts-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, query }),
    });
    if (resp.status === 401) return { results: [], notLoggedIn: true };
    if (!resp.ok) return { results: [], error: `HTTP ${resp.status}` };
    return await resp.json();
  } catch (err) { return { results: [], error: err.message || 'Network error' }; }
}

export async function getContactDetails(type, id) {
  const userId = getUserId();
  try {
    const resp = await fetch(`${PROXY_BASE}/tl-contact-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, type, id }),
    });
    if (resp.status === 401) return { error: 'not_logged_in' };
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    return await resp.json();
  } catch (err) { return { error: err.message || 'Network error' }; }
}

export async function getDealOptions() {
  const userId = getUserId();
  try {
    const resp = await fetch(`${PROXY_BASE}/tl-deal-options?user_id=${encodeURIComponent(userId)}`);
    if (resp.status === 401) return { error: 'not_logged_in' };
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    return await resp.json();
  } catch (err) { return { error: err.message || 'Network error' }; }
}

export async function createDeal(dealData) {
  const userId = getUserId();
  const body = {
    user_id: userId, title: dealData.title,
    contactType: dealData.contactType, contactId: dealData.contactId,
    phaseId: dealData.phaseId,
  };
  if (dealData.responsibleUserId) body.responsibleUserId = dealData.responsibleUserId;
  if (dealData.estimatedValueEur > 0) body.estimatedValue = { amount: dealData.estimatedValueEur, currency: 'EUR' };
  try {
    const resp = await fetch(`${PROXY_BASE}/tl-deal-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.status === 401) return { error: 'not_logged_in' };
    const data = await resp.json();
    if (!resp.ok) return { error: data.error || `HTTP ${resp.status}`, detail: data.detail };
    return data;
  } catch (err) { return { error: err.message || 'Network error' }; }
}

export function debounce(fn, ms = 350) {
  let timer = null, pendingResolve = null;
  return (...args) => {
    if (timer) { clearTimeout(timer); if (pendingResolve) pendingResolve(null); }
    return new Promise((resolve) => {
      pendingResolve = resolve;
      timer = setTimeout(async () => {
        timer = null; const myResolve = pendingResolve; pendingResolve = null;
        try { myResolve(await fn(...args)); }
        catch (err) { myResolve({ error: err.message || 'unknown' }); }
      }, ms);
    });
  };
}

export async function geocodeAddress(address) {
  const parts = [address.line, [address.postal_code, address.city].filter(Boolean).join(' '), address.country || 'België'].filter(Boolean);
  const query = parts.join(', ');
  if (!query.trim()) return null;
  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name || query };
  } catch { return null; }
}

// =============================================================================
// GENERIEKE API CALL — roept /api/tl-call op de proxy aan
// =============================================================================

/**
 * Generieke TL API call via de Vercel proxy.
 * @param {string} endpoint - bijv. "workOrders.list", "appointments.list"
 * @param {object} body - request body voor de TL API
 */
export async function apiCall(endpoint, body = {}) {
  const userId = getUserId();
  try {
    const resp = await fetch(`${PROXY_BASE}/tl-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, endpoint, body }),
    });
    if (resp.status === 401) return { error: 'not_logged_in' };
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return data.data ?? data;
  } catch (err) {
    throw new Error(err.message || 'Network error');
  }
}

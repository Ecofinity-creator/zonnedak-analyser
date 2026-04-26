// ─── teamleaderClient.js ────────────────────────────────────────────────────
//
// Browser-side Teamleader API client.
//
// Praat NIET rechtstreeks met Teamleader — alle calls gaan via de Vercel
// proxy (zonnedak-ai-proxy-west.vercel.app). De proxy houdt OAuth-tokens
// server-side, doet refresh, en verbergt de client_secret.
//
// User identificatie: elke browser krijgt een random user_id die in
// localStorage wordt bewaard. Die user_id wordt aan de proxy meegegeven
// zodat de juiste TL-tokens worden opgehaald.
//
// Belangrijk: user_id is GEEN authenticatie — het is enkel een sleutel
// om jouw tokens van iemand anders' tokens te onderscheiden in dezelfde
// KV-store. Als iemand jouw user_id raadt kan hij doen alsof hij jij bent.
// Voor 3-10 collega's met gedeelde TL-account is dit acceptabel risico.
// ─────────────────────────────────────────────────────────────────────────────

const PROXY_BASE = 'https://zonnedak-ai-proxy-west.vercel.app/api';
const USER_ID_KEY = 'zonnedak_tl_user_id';

// =============================================================================
// USER ID MANAGEMENT
// =============================================================================

/**
 * Genereer of haal de user_id voor deze browser op.
 * 32-character random string in localStorage. Stabiel per browser.
 */
export function getUserId() {
  let id = null;
  try { id = localStorage.getItem(USER_ID_KEY); } catch {}
  if (id && id.length >= 16 && id.length <= 64) return id;

  // Genereer nieuwe
  const buf = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  id = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(USER_ID_KEY, id); } catch {}
  return id;
}

/**
 * Wis de user_id (gebruikt bij "uitloggen"). Volgende call genereert
 * automatisch een nieuwe.
 */
export function clearUserId() {
  try { localStorage.removeItem(USER_ID_KEY); } catch {}
}

// =============================================================================
// AUTH FLOW
// =============================================================================

/**
 * Start de OAuth login-flow. Browser wordt herladen naar TL.
 * TL → callback → terug naar app met ?tl_auth=success.
 */
export function startTeamleaderLogin() {
  const userId = getUserId();
  const url = `${PROXY_BASE}/tl-auth-start?user_id=${encodeURIComponent(userId)}`;
  window.location.href = url;
}

/**
 * Check of huidige user nog ingelogd is bij TL.
 * @returns {Promise<{logged_in: boolean, user?: {id, name, email}}>}
 */
export async function checkAuthStatus() {
  const userId = getUserId();
  try {
    const resp = await fetch(`${PROXY_BASE}/tl-auth-status?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) return { logged_in: false };
    const data = await resp.json();
    return data;
  } catch {
    return { logged_in: false };
  }
}

/**
 * Lees URL-parameter ?tl_auth=success/error/denied uit window.location en
 * ruim hem dan op zodat hij niet bij refresh blijft hangen.
 *
 * @returns {'success'|'error'|'denied'|null}
 */
export function consumeAuthCallback() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const status = params.get('tl_auth');
  if (status) {
    params.delete('tl_auth');
    params.delete('reason');
    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
  }
  return status;
}

// =============================================================================
// TL DATA CALLS
// =============================================================================

/**
 * Zoek contacts/companies op naam.
 * @param {string} query - minstens 2 tekens
 * @returns {Promise<{results: Array<{id, type, name, primary_email}>}>}
 */
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
  } catch (err) {
    return { results: [], error: err.message || 'Network error' };
  }
}

/**
 * Haal volledige details op voor een geselecteerd contact/company.
 * @param {'contact'|'company'} type
 * @param {string} id - TL UUID
 * @returns {Promise<{type, id, name, emails, phones, addresses, deals} | {error}>}
 */
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
  } catch (err) {
    return { error: err.message || 'Network error' };
  }
}

// =============================================================================
// DEBOUNCE HELPER (voor live search)
// =============================================================================

/**
 * Maak een debounced functie. De call gebeurt pas X ms na de laatste invoke.
 * Cancelt eerdere pending calls. Geeft een Promise per laatste call.
 *
 * Gebruik:
 *   const debouncedSearch = debounce(searchContacts, 350);
 *   const result = await debouncedSearch('Jan');
 */
export function debounce(fn, ms = 350) {
  let timer = null;
  let pendingResolve = null;
  return (...args) => {
    if (timer) {
      clearTimeout(timer);
      // Resolve oude pending met null zodat callers niet hangen blijven
      if (pendingResolve) pendingResolve(null);
    }
    return new Promise((resolve) => {
      pendingResolve = resolve;
      timer = setTimeout(async () => {
        timer = null;
        const myResolve = pendingResolve;
        pendingResolve = null;
        try {
          const result = await fn(...args);
          myResolve(result);
        } catch (err) {
          myResolve({ error: err.message || 'unknown' });
        }
      }, ms);
    });
  };
}

// =============================================================================
// ADRES → COÖRDINATEN (Nominatim geocoding)
// =============================================================================

/**
 * Zet een TL-adres om naar lat/lng via Nominatim. Niet-Vlaamse adressen
 * kunnen in eerste instantie niet gevonden worden — caller moet fallback
 * voorzien (manuele kaartklik).
 *
 * @param {object} address - { line, postal_code, city, country }
 * @returns {Promise<{lat, lng, displayName} | null>}
 */
export async function geocodeAddress(address) {
  const parts = [
    address.line,
    [address.postal_code, address.city].filter(Boolean).join(' '),
    address.country || 'België',
  ].filter(Boolean);
  const query = parts.join(', ');
  if (!query.trim()) return null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const hit = data[0];
    return {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      displayName: hit.display_name || query,
    };
  } catch {
    return null;
  }
}

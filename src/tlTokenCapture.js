// tlTokenCapture.js — onderschept ZOWEL fetch ALS XMLHttpRequest om Bearer token te vangen

export let capturedToken = null;

// ── 1. Intercept window.fetch ─────────────────────────────────────────────────
const _origFetch = window.fetch;
window.fetch = async function(url, opts, ...rest) {
  try {
    const hdrs = opts?.headers || {};
    const auth = hdrs['Authorization'] || hdrs['authorization'] || '';
    if (auth.startsWith('Bearer ') && auth.length > 30) {
      capturedToken = auth.slice(7);
      console.log('[ZonneDak] Token gevangen via fetch:', url, '→', capturedToken.substring(0,10)+'...');
    }
  } catch {}
  return _origFetch.call(this, url, opts, ...rest);
};

// ── 2. Intercept XMLHttpRequest ────────────────────────────────────────────────
const _origSetReqHeader = XMLHttpRequest.prototype.setRequestHeader;
XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
  try {
    if (name.toLowerCase() === 'authorization' && String(value).startsWith('Bearer ') && value.length > 30) {
      capturedToken = value.slice(7);
      console.log('[ZonneDak] Token gevangen via XHR setRequestHeader → ' + capturedToken.substring(0,10) + '...');
    }
  } catch {}
  return _origSetReqHeader.apply(this, arguments);
};

// ── 3. Monitor alle netwerk-calls om URL te achterhalen ──────────────────────
const _origXHROpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  if (typeof url === 'string' && (url.includes('teamleader') || url.includes('vercel.app'))) {
    console.log('[ZonneDak] XHR naar:', url);
  }
  return _origXHROpen.apply(this, arguments);
};

console.log('[ZonneDak] tlTokenCapture geladen — fetch en XHR geïntercepteerd');

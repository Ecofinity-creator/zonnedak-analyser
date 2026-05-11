// tlTokenCapture.js — loopt vóór teamleaderClient.js dankzij import-volgorde in App.jsx
// Onderschept alle fetch-calls naar api.teamleader.eu om de Bearer token te vangen

export let capturedToken = null;

const _origFetch = window.fetch;
window.fetch = async function(url, opts, ...rest) {
  // Intercept calls to Teamleader API
  if (typeof url === 'string' && url.includes('api.teamleader.eu')) {
    const hdrs = opts?.headers || {};
    const auth = hdrs['Authorization'] || hdrs['authorization'] || '';
    if (auth.startsWith('Bearer ') && auth.length > 30) {
      capturedToken = auth.slice(7);
    }
  }
  return _origFetch.call(this, url, opts, ...rest);
};

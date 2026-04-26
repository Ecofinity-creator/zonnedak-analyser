// ─── teamleaderClient.test.js ───────────────────────────────────────────────
// Tests voor de niet-network helpers (debounce, getUserId).
// De fetch-calls zelf testen we niet hier — die worden in productie
// gevalideerd door de Vercel proxy heen.
// ────────────────────────────────────────────────────────────────────────────

import { describe, test, expect, beforeEach } from 'vitest';
import { getUserId, clearUserId, debounce } from './teamleaderClient.js';

class LocalStorageMock {
  constructor() { this.store = {}; }
  getItem(k) { return this.store[k] ?? null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

beforeEach(() => {
  globalThis.localStorage = new LocalStorageMock();
  // Mock crypto.getRandomValues voor Node test-omgeving
  globalThis.window = {
    crypto: {
      getRandomValues: (buf) => {
        for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
        return buf;
      },
    },
    location: { pathname: '/test', search: '', hash: '' },
    history: { replaceState: () => {} },
  };
});

describe('getUserId', () => {
  test('genereert nieuwe id bij eerste call', () => {
    const id = getUserId();
    expect(typeof id).toBe('string');
    expect(id.length).toBe(32); // 16 bytes hex = 32 chars
  });

  test('geeft dezelfde id bij tweede call', () => {
    const id1 = getUserId();
    const id2 = getUserId();
    expect(id1).toBe(id2);
  });

  test('clearUserId leidt tot nieuwe id', () => {
    const id1 = getUserId();
    clearUserId();
    const id2 = getUserId();
    expect(id1).not.toBe(id2);
  });

  test('id is hex (a-f, 0-9 only)', () => {
    const id = getUserId();
    expect(id).toMatch(/^[0-9a-f]+$/);
  });
});

describe('debounce', () => {
  test('roept fn aan na delay als er geen nieuwe call komt', async () => {
    let calls = 0;
    const fn = () => { calls++; return 'done'; };
    const debounced = debounce(fn, 30);
    const result = await debounced();
    expect(calls).toBe(1);
    expect(result).toBe('done');
  });

  test('cancelt eerdere call als nieuwe binnenkomt', async () => {
    let calls = [];
    const fn = (arg) => { calls.push(arg); return arg; };
    const debounced = debounce(fn, 30);
    // Twee snelle calls — alleen de tweede moet effectief uitgevoerd worden
    const p1 = debounced('first');
    const p2 = debounced('second');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(calls).toEqual(['second']);
    expect(r1).toBeNull();
    expect(r2).toBe('second');
  });

  test('drie calls: alleen de laatste wordt effectief', async () => {
    let calls = [];
    const fn = (arg) => { calls.push(arg); return arg; };
    const debounced = debounce(fn, 30);
    debounced('a');
    debounced('b');
    const last = await debounced('c');
    expect(calls).toEqual(['c']);
    expect(last).toBe('c');
  });

  test('async fn wordt correct geawait', async () => {
    const fn = async (n) => {
      await new Promise(r => setTimeout(r, 5));
      return n * 2;
    };
    const debounced = debounce(fn, 20);
    const result = await debounced(7);
    expect(result).toBe(14);
  });
});

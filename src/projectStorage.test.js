// ─── projectStorage.test.js ─────────────────────────────────────────────────
// Unit tests voor de project-opslag module. Elke test gebruikt een vers
// localStorage-mock om kruisbesmetting te vermijden.
// ────────────────────────────────────────────────────────────────────────────

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  saveProject,
  loadProject,
  deleteProject,
  listProjects,
  projectExists,
  importProjectFromJSON,
  createAutoSaver,
} from './projectStorage.js';

// In-memory localStorage mock
class LocalStorageMock {
  constructor() { this.store = {}; }
  getItem(k) { return this.store[k] ?? null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

beforeEach(() => {
  globalThis.localStorage = new LocalStorageMock();
});

describe('saveProject / loadProject', () => {
  test('project opslaan en terug laden', () => {
    const ok = saveProject('Jan Janssens', { count: 10, panel: 'Q.TRON' });
    expect(ok).toBe(true);
    const p = loadProject('Jan Janssens');
    expect(p).not.toBeNull();
    expect(p.customerName).toBe('Jan Janssens');
    expect(p.data.count).toBe(10);
    expect(p.data.panel).toBe('Q.TRON');
    expect(p.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('lege naam wordt geweigerd', () => {
    expect(saveProject('', { a: 1 })).toBe(false);
    expect(saveProject('   ', { a: 1 })).toBe(false);
    expect(saveProject(null, { a: 1 })).toBe(false);
  });

  test('case-insensitive lookup: "jan" vindt "Jan"', () => {
    saveProject('Jan Janssens', { test: true });
    expect(loadProject('jan janssens')).not.toBeNull();
    expect(loadProject('JAN JANSSENS')).not.toBeNull();
  });

  test('project niet aanwezig → null', () => {
    expect(loadProject('Nonexistent')).toBeNull();
  });

  test('overschrijven van bestaand project werkt', () => {
    saveProject('Jan', { count: 5 });
    saveProject('Jan', { count: 10 });
    const p = loadProject('Jan');
    expect(p.data.count).toBe(10);
  });
});

describe('deleteProject', () => {
  test('project verwijderen', () => {
    saveProject('Jan', { a: 1 });
    expect(loadProject('Jan')).not.toBeNull();
    deleteProject('Jan');
    expect(loadProject('Jan')).toBeNull();
  });

  test('niet-bestaand project verwijderen is geen fout', () => {
    expect(deleteProject('Nonexistent')).toBe(true);
  });
});

describe('listProjects', () => {
  test('lege lijst bij geen projecten', () => {
    expect(listProjects()).toEqual([]);
  });

  test('lijst bevat alle opgeslagen projecten', async () => {
    saveProject('Alice', { a: 1 });
    // Tiny wait so savedAt timestamps differ
    await new Promise(r => setTimeout(r, 5));
    saveProject('Bob', { b: 2 });
    await new Promise(r => setTimeout(r, 5));
    saveProject('Charlie', { c: 3 });
    const names = listProjects().map(p => p.customerName);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
    expect(names).toContain('Charlie');
  });

  test('lijst is gesorteerd op laatst opgeslagen eerst', async () => {
    saveProject('Oldest', { a: 1 });
    await new Promise(r => setTimeout(r, 10));
    saveProject('Middle', { a: 1 });
    await new Promise(r => setTimeout(r, 10));
    saveProject('Newest', { a: 1 });
    const names = listProjects().map(p => p.customerName);
    expect(names[0]).toBe('Newest');
    expect(names[names.length - 1]).toBe('Oldest');
  });

  test('verwijderd project staat niet in de lijst', () => {
    saveProject('Alice', { a: 1 });
    saveProject('Bob', { b: 2 });
    deleteProject('Alice');
    const names = listProjects().map(p => p.customerName);
    expect(names).not.toContain('Alice');
    expect(names).toContain('Bob');
  });
});

describe('projectExists', () => {
  test('true voor bestaand, false voor niet-bestaand', () => {
    saveProject('Alice', { a: 1 });
    expect(projectExists('Alice')).toBe(true);
    expect(projectExists('alice')).toBe(true);
    expect(projectExists('Bob')).toBe(false);
  });
});

describe('importProjectFromJSON', () => {
  test('geldig JSON wordt geïmporteerd', () => {
    const json = JSON.stringify({
      schema: 1,
      customerName: 'Jan Janssens',
      savedAt: '2026-04-20T10:00:00.000Z',
      data: { panels: 10 },
    });
    const result = importProjectFromJSON(json);
    expect(result.success).toBe(true);
    expect(result.customerName).toBe('Jan Janssens');
    expect(loadProject('Jan Janssens').data.panels).toBe(10);
  });

  test('ongeldig JSON geeft fout', () => {
    const result = importProjectFromJSON('not-json');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ongeldig json/i);
  });

  test('ontbrekende customerName geeft fout', () => {
    const json = JSON.stringify({ data: { a: 1 } });
    const result = importProjectFromJSON(json);
    expect(result.success).toBe(false);
  });

  test('ontbrekende data geeft fout', () => {
    const json = JSON.stringify({ customerName: 'Jan' });
    const result = importProjectFromJSON(json);
    expect(result.success).toBe(false);
  });

  test('toekomstige schema-versie wordt geweigerd', () => {
    const json = JSON.stringify({
      schema: 999,
      customerName: 'Jan',
      data: { a: 1 },
    });
    const result = importProjectFromJSON(json);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/nieuwere versie/i);
  });
});

describe('createAutoSaver', () => {
  test('debounce: enkel laatste save wordt uitgevoerd', async () => {
    const saver = createAutoSaver(50); // 50ms voor snellere test
    saver.saveNow('Jan', { v: 1 });
    saver.saveNow('Jan', { v: 2 });
    saver.saveNow('Jan', { v: 3 });
    // Direct na 3 calls: nog niks gesaved (nog in debounce)
    expect(loadProject('Jan')).toBeNull();
    // Na debounce-periode: laatste save is gebeurd
    await new Promise(r => setTimeout(r, 80));
    expect(loadProject('Jan').data.v).toBe(3);
  });

  test('flush: direct saven zonder wachten', () => {
    const saver = createAutoSaver(10000);
    saver.saveNow('Jan', { v: 1 });
    saver.flush();
    expect(loadProject('Jan').data.v).toBe(1);
  });

  test('cancel: pending save wordt niet uitgevoerd', async () => {
    const saver = createAutoSaver(50);
    saver.saveNow('Jan', { v: 1 });
    saver.cancel();
    await new Promise(r => setTimeout(r, 80));
    expect(loadProject('Jan')).toBeNull();
  });

  test('switch van klant: oude klant correct opgeslagen, nieuwe start van 0', async () => {
    const saver = createAutoSaver(30);
    saver.saveNow('Alice', { v: 1 });
    await new Promise(r => setTimeout(r, 50));
    saver.saveNow('Bob', { v: 99 });
    await new Promise(r => setTimeout(r, 50));
    expect(loadProject('Alice').data.v).toBe(1);
    expect(loadProject('Bob').data.v).toBe(99);
  });
});

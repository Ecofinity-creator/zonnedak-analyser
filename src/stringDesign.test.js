// ─── stringDesign.test.js ───────────────────────────────────────────────────
// Tests voor de PV string-design module. Covers normale gevallen + alle
// kritieke fout-scenarios (overspanning, onderprestatie, te veel stroom).
// ────────────────────────────────────────────────────────────────────────────

import { describe, test, expect } from 'vitest';
import {
  vocAtTemp,
  vmpAtTemp,
  maxPanelsPerString,
  minPanelsPerString,
  maxParallelStringsPerMppt,
  distributeStrings,
  validateDesign,
  computeStringDesign,
  T_MIN_BE,
  T_MAX_CELL,
} from './stringDesign.js';

// =============================================================================
// REPRESENTATIEVE TEST DATA
// =============================================================================

// Modern N-type 440W paneel (Q.TRON-achtig)
const PANEL_440 = {
  watt: 440,
  voc: 39.5,
  vmp: 33.0,
  isc: 14.0,
  imp: 13.4,
  tempCoeffVoc: -0.27, // %/°C — typisch voor moderne N-type
};

// AlphaESS S5 1-fase: 5kW nom, 2 MPPT, 600V max DC
const INV_S5 = {
  mpptCount: 2,
  maxDcVoltage: 600,
  maxInputCurrentPerMppt: 16,
  mpptVoltageMin: 90,
  mpptVoltageMax: 560,
  maxAcPower: 5000,
  maxDcPower: 10000,
};

// AlphaESS S3.6 kleiner: 3.68kW, 2 MPPT, 580V
const INV_S36 = {
  mpptCount: 2,
  maxDcVoltage: 580,
  maxInputCurrentPerMppt: 16,
  mpptVoltageMin: 90,
  mpptVoltageMax: 560,
  maxAcPower: 3680,
  maxDcPower: 7360,
};

// =============================================================================
// TEMPERATUUR-CORRECTIES
// =============================================================================

describe('vocAtTemp / vmpAtTemp', () => {
  test('Voc bij STC = onveranderd', () => {
    expect(vocAtTemp(40, -0.27, 25)).toBeCloseTo(40, 5);
  });

  test('Voc bij koude is hoger', () => {
    // Bij -15°C: Voc = 40 × (1 + (-0.27) × (-40)/100) = 40 × 1.108 = 44.32
    const v = vocAtTemp(40, -0.27, -15);
    expect(v).toBeGreaterThan(40);
    expect(v).toBeCloseTo(44.32, 1);
  });

  test('Vmp bij hitte is lager', () => {
    // Bij 70°C: Vmp = 33 × (1 + (-0.27) × 45 / 100) = 33 × 0.8785 = 28.99
    const v = vmpAtTemp(33, -0.27, 70);
    expect(v).toBeLessThan(33);
    expect(v).toBeCloseTo(28.99, 1);
  });
});

// =============================================================================
// MIN/MAX PANELEN PER STRING
// =============================================================================

describe('maxPanelsPerString', () => {
  test('typische 440W paneel + S5 → ~13 max in serie', () => {
    // Voc bij -15°C ≈ 43.8V, max DC = 600V × 0.95 = 570V → 570/43.8 ≈ 13
    const max = maxPanelsPerString(PANEL_440, INV_S5);
    expect(max).toBe(13);
  });

  test('hogere DC-spanning omvormer → meer panelen mogelijk', () => {
    const inv = { ...INV_S5, maxDcVoltage: 1000 };
    expect(maxPanelsPerString(PANEL_440, inv)).toBeGreaterThan(20);
  });

  test('kouder klimaat → minder panelen mogelijk', () => {
    const default_ = maxPanelsPerString(PANEL_440, INV_S5, -15);
    const colder = maxPanelsPerString(PANEL_440, INV_S5, -25);
    expect(colder).toBeLessThanOrEqual(default_);
  });
});

describe('minPanelsPerString', () => {
  test('S5 met min MPPT 90V + 440W paneel → minstens ~4 panelen', () => {
    // Vmp bij 70°C ≈ 28.99V, min MPPT × 1.1 = 99V → 99/28.99 = 3.4 → 4
    const min = minPanelsPerString(PANEL_440, INV_S5);
    expect(min).toBeGreaterThanOrEqual(3);
    expect(min).toBeLessThanOrEqual(5);
  });
});

// =============================================================================
// PARALLELLE STRINGS
// =============================================================================

describe('maxParallelStringsPerMppt', () => {
  test('typisch paneel (Isc=14A) op MPPT 16A → 1 parallel', () => {
    expect(maxParallelStringsPerMppt(PANEL_440, INV_S5)).toBe(1);
  });

  test('kleinere paneelstroom → meer parallel mogelijk', () => {
    const lowIsc = { ...PANEL_440, isc: 7 };
    expect(maxParallelStringsPerMppt(lowIsc, INV_S5)).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// STRING DISTRIBUTIE
// =============================================================================

describe('distributeStrings', () => {
  test('10 panelen op S5 → 1 string van 10 op 1 MPPT', () => {
    const r = distributeStrings(PANEL_440, INV_S5, 10);
    expect(r.feasible).toBe(true);
    expect(r.mppts).toHaveLength(1);
    expect(r.mppts[0].panelsPerString).toBe(10);
    expect(r.mppts[0].stringCount).toBe(1);
  });

  test('20 panelen op S5 (max 13/string) → verdeling nodig', () => {
    const r = distributeStrings(PANEL_440, INV_S5, 20);
    expect(r.feasible).toBe(true);
    // 20 panelen kan: 2 MPPTs × 10 panelen, of andere combinatie
    expect(r.totalAssigned).toBe(20);
    const totalPanels = r.mppts.reduce((s, m) => s + m.totalPanels, 0);
    expect(totalPanels).toBe(20);
  });

  test('26 panelen op S5 (2 MPPTs × 13) → 2 even strings', () => {
    const r = distributeStrings(PANEL_440, INV_S5, 26);
    expect(r.feasible).toBe(true);
    expect(r.mppts).toHaveLength(2);
    expect(r.mppts[0].panelsPerString).toBe(13);
    expect(r.mppts[1].panelsPerString).toBe(13);
  });

  test('1 paneel — onmogelijk (onder min MPPT)', () => {
    const r = distributeStrings(PANEL_440, INV_S5, 1);
    expect(r.feasible).toBe(false);
  });

  test('100 panelen op S5 (max 26 totaal) → niet haalbaar', () => {
    const r = distributeStrings(PANEL_440, INV_S5, 100);
    expect(r.feasible).toBe(false);
    expect(r.unassigned).toBeGreaterThan(0);
  });

  test('0 panelen → not feasible', () => {
    const r = distributeStrings(PANEL_440, INV_S5, 0);
    expect(r.feasible).toBe(false);
  });

  test('MPPT met 3 ingangen: 30 panelen → 3 × 10 verdeling beschikbaar', () => {
    const inv3 = { ...INV_S5, mpptCount: 3 };
    const r = distributeStrings(PANEL_440, inv3, 30);
    expect(r.feasible).toBe(true);
    // Optie: 3 × 1 × 10 of 1 × 1 × 10 (nope, 30>13). Dus 3 MPPTs.
    // Of 2 MPPTs × 1 string × 15 (15>13 verboten). Dus 3 × 10 is winnaar.
    expect(r.mppts).toHaveLength(3);
    r.mppts.forEach(m => expect(m.panelsPerString).toBe(10));
  });
});

// =============================================================================
// VALIDATIE
// =============================================================================

describe('validateDesign', () => {
  test('valide configuratie geeft geen kritieke waarschuwingen', () => {
    const dist = distributeStrings(PANEL_440, INV_S5, 10);
    const w = validateDesign(PANEL_440, INV_S5, dist);
    expect(w.filter(x => x.severity === 'critical')).toHaveLength(0);
  });

  test('overspanning bij koude → kritieke waarschuwing', () => {
    // Forceer een te lange string met fake distribution
    const fakeDist = {
      feasible: true,
      mppts: [{ stringCount: 1, panelsPerString: 20, totalPanels: 20 }],
      totalAssigned: 20, unassigned: 0, reason: null,
    };
    const w = validateDesign(PANEL_440, INV_S5, fakeDist);
    const crits = w.filter(x => x.severity === 'critical');
    expect(crits.length).toBeGreaterThan(0);
    expect(crits[0].title).toMatch(/koude|spanning te hoog/i);
  });

  test('te kleine string → te lage spanning bij hitte', () => {
    const fakeDist = {
      feasible: true,
      mppts: [{ stringCount: 1, panelsPerString: 2, totalPanels: 2 }],
      totalAssigned: 2, unassigned: 0, reason: null,
    };
    const w = validateDesign(PANEL_440, INV_S5, fakeDist);
    const crits = w.filter(x => x.severity === 'critical');
    expect(crits.length).toBeGreaterThan(0);
    expect(crits[0].title).toMatch(/hitte|spanning te laag/i);
  });

  test('te veel parallelle stroom → kritiek', () => {
    const fakeDist = {
      feasible: true,
      mppts: [{ stringCount: 5, panelsPerString: 8, totalPanels: 40 }],
      totalAssigned: 40, unassigned: 0, reason: null,
    };
    const w = validateDesign(PANEL_440, INV_S5, fakeDist);
    const crits = w.filter(x => x.severity === 'critical');
    expect(crits.some(c => /stroom|current/i.test(c.title))).toBe(true);
  });

  test('niet-haalbaar → kritieke melding', () => {
    const dist = distributeStrings(PANEL_440, INV_S5, 100);
    const w = validateDesign(PANEL_440, INV_S5, dist);
    expect(w[0].severity).toBe('critical');
  });
});

// =============================================================================
// END-TO-END
// =============================================================================

describe('computeStringDesign — end-to-end', () => {
  test('typische installatie: 10× 440W op S5', () => {
    const r = computeStringDesign(PANEL_440, INV_S5, 10);
    expect(r.feasible).toBe(true);
    expect(r.summary.hasCritical).toBe(false);
    expect(r.totalPower).toBe(4400);
    expect(r.mppts).toHaveLength(1);
    expect(r.mppts[0].vocCold).toBeGreaterThan(r.mppts[0].vocStc);
    expect(r.mppts[0].vmpHot).toBeLessThan(r.mppts[0].vmpStc);
  });

  test('grotere installatie: 22× 440W op S8', () => {
    const inv8 = { ...INV_S5, maxAcPower: 8000, maxDcPower: 16000 };
    const r = computeStringDesign(PANEL_440, inv8, 22);
    expect(r.feasible).toBe(true);
    expect(r.totalPower).toBe(22 * 440);
  });

  test('te kleine omvormer voor het aantal panelen', () => {
    // 30× 440W = 13.2kW DC op S3.6 (max 7.36kW DC) → DC overschrijding
    const r = computeStringDesign(PANEL_440, INV_S36, 16);
    // 16 × 440 = 7040W DC, omvormer max 7360 → net binnen
    // maar laten we 18 doen: 7920W > 7360 → warning of critical
    const r2 = computeStringDesign(PANEL_440, INV_S36, 20);
    // 20 × 440 = 8800W
    const dcWarnings = r2.warnings.filter(w => /DC-vermogen|overschrijdt/i.test(w.title));
    expect(dcWarnings.length).toBeGreaterThan(0);
  });
});

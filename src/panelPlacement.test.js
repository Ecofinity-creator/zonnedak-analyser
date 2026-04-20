// ─── panelPlacement.test.js ──────────────────────────────────────────────────
//
// Test suite voor panelPlacement.js. Deze tests zijn de regressievangnetten
// voor de drie bugs die de module heeft overleefd:
//
//   BUG-09: panelen lekten over de noklijn naar het andere dakvlak
//   BUG-10: ridgeAngleDeg-parameter inconsistent met face-polygon
//   BUG-11: PCA gaf verschillende nokhoeken voor de twee helften van hetzelfde dak
//
// Als deze tests slagen, zijn die bugs reproduceerbaar afwezig.
// Als ze falen, is een regressie geïntroduceerd en blokkeert GitHub Actions
// de deploy.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test, expect } from 'vitest';
import {
  wgs84ToLambert72,
  lambert72ToWgs84,
  pointInPoly,
  detectRidgeAzimuth,
  packPanels,
} from './panelPlacement.js';

// =============================================================================
// COORDINATE TRANSFORMS
// =============================================================================

describe('wgs84ToLambert72 ↔ lambert72ToWgs84', () => {
  test('round-trip nauwkeurigheid binnen 1 cm voor Belgische locaties', () => {
    const testCases = [
      [50.7469, 3.6042],  // Ronse
      [50.8503, 4.3517],  // Brussel
      [51.2194, 4.4025],  // Antwerpen
      [51.0543, 3.7174],  // Gent
      [50.6326, 5.5797],  // Luik
    ];
    for (const [lat, lng] of testCases) {
      const [x, y] = wgs84ToLambert72(lat, lng);
      const [lat2, lng2] = lambert72ToWgs84(x, y);
      const errM = Math.hypot(
        (lat2 - lat) * 111320,
        (lng2 - lng) * 111320 * Math.cos(lat * Math.PI / 180)
      );
      expect(errM).toBeLessThan(0.01); // < 1 cm
    }
  });

  test('Lambert72 X/Y voor Ronse ligt in verwacht metrisch bereik', () => {
    const [x, y] = wgs84ToLambert72(50.7469, 3.6042);
    // Belgische Lambert72 ligt in bereik X≈0-300km, Y≈150-250km voor Vlaanderen
    expect(x).toBeGreaterThan(50000);
    expect(x).toBeLessThan(300000);
    expect(y).toBeGreaterThan(150000);
    expect(y).toBeLessThan(250000);
  });
});

// =============================================================================
// POINT IN POLYGON
// =============================================================================

describe('pointInPoly', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

  test('punt binnen vierkant is inside', () => {
    expect(pointInPoly(5, 5, square)).toBe(true);
  });

  test('punt buiten vierkant is outside', () => {
    expect(pointInPoly(15, 5, square)).toBe(false);
    expect(pointInPoly(-5, 5, square)).toBe(false);
    expect(pointInPoly(5, 15, square)).toBe(false);
  });

  test('L-vorm: punt in concaaf gebied is correct outside', () => {
    // L-vormig polygon: vierkant met notch uit rechterbovenhoek
    const lShape = [
      [0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10],
    ];
    expect(pointInPoly(2, 2, lShape)).toBe(true);   // linkerdeel
    expect(pointInPoly(8, 2, lShape)).toBe(true);   // onderste deel
    expect(pointInPoly(8, 8, lShape)).toBe(false);  // notch = buiten
    expect(pointInPoly(7, 7, lShape)).toBe(false);  // notch = buiten
  });
});

// =============================================================================
// RIDGE AZIMUTH DETECTION
// =============================================================================

describe('detectRidgeAzimuth', () => {
  test('rechthoek met nok langs N-S → azimut ≈ 0°', () => {
    // 16m langs nok (Y = Noord), 5m langs helling (X = Oost)
    const rect = [[-2.5, -8], [2.5, -8], [2.5, 8], [-2.5, 8]];
    const az = detectRidgeAzimuth(rect);
    // Axis is bidirectioneel; 0° en 180° zijn hetzelfde
    const norm = Math.min(az, Math.abs(180 - az));
    expect(norm).toBeLessThan(0.1);
  });

  test('rechthoek met nok langs O-W → azimut ≈ 90°', () => {
    // 16m langs nok (X = Oost), 5m langs helling (Y = Noord)
    const rect = [[-8, -2.5], [8, -2.5], [8, 2.5], [-8, 2.5]];
    const az = detectRidgeAzimuth(rect);
    expect(Math.abs(az - 90)).toBeLessThan(0.1);
  });

  // Opm: rotatie-tests met synthetische math-space vectoren zijn verwarrend
  // door de conventie-mismatch tussen atan2(East, North) azimut (CW vanaf Noord)
  // en standaard math-rotatie (CCW vanaf positieve X-as). De werkelijke
  // correcte rotatie-detectie wordt getest via de 'packPanels' test suite
  // hieronder die buildRoofFace gebruikt (in Lambert72-space met echte
  // azimut-conventie).

  // REGRESSIEVANGNET BUG-11: PCA gaf 17° afwijking op het echte productie-polygoon.
  // Edge-voting moet de lange randen prioriteren en consistent zijn.
  test('REGRESSIE BUG-11: trapvormig productie-polygoon detecteert ~22°, niet PCA 20°', () => {
    const productionFace = [
      [50.8737400911598, 3.727420927535621],
      [50.87372428, 3.72748135],
      [50.87375733, 3.72750294],
      [50.87374401, 3.72755384],
      [50.87379572, 3.72758764],
      [50.87380913, 3.72753637],
      [50.87386377, 3.72757207],
      [50.87388011054266, 3.7275101244444962],
    ];
    const polyL72 = productionFace.map(([lat, lng]) => wgs84ToLambert72(lat, lng));
    const az = detectRidgeAzimuth(polyL72);
    // Edge-voting geeft ~22.5°, PCA gaf ~20°. Lange randen dicteren.
    expect(az).toBeGreaterThan(20);
    expect(az).toBeLessThan(25);
  });

  test('REGRESSIE BUG-11: twee spiegel-helften geven consistente nokhoek', () => {
    // Simuleer twee faces van een zadeldak die elkaar spiegelen over de nok.
    // Beide moeten dezelfde nokhoek teruggeven — tolerantie ~3° om ruimte
    // te laten voor asymmetrische aanbouwuitsteeksels.
    const face1 = [
      [0, 0], [16, 0], [14, 3], [12, 3], [12, 6], [2, 6], [2, 3], [0, 3],
    ];
    const face2 = face1.map(([x, y]) => [x, -y]); // gespiegeld
    const az1 = detectRidgeAzimuth(face1);
    const az2 = detectRidgeAzimuth(face2);
    expect(Math.abs(az1 - az2)).toBeLessThan(3);
  });
});

// =============================================================================
// PACKPANELS — HET HOOFDCONTRACT
// =============================================================================

/**
 * Helper: bouw een rechthoekig dakvlak in lat/lng rond een centrum, met
 * een gegeven nok-richting en afmetingen.
 */
function buildRoofFace(cLat, cLng, ridgeAzDeg, ridgeLenM, slopeLenM) {
  const [cX, cY] = wgs84ToLambert72(cLat, cLng);
  const r = ridgeAzDeg * Math.PI / 180;
  const ridgeDir = [Math.sin(r), Math.cos(r)];
  const perpDir = [Math.cos(r), -Math.sin(r)];
  const cornersL72 = [
    [cX - (ridgeLenM / 2) * ridgeDir[0] - (slopeLenM / 2) * perpDir[0],
     cY - (ridgeLenM / 2) * ridgeDir[1] - (slopeLenM / 2) * perpDir[1]],
    [cX + (ridgeLenM / 2) * ridgeDir[0] - (slopeLenM / 2) * perpDir[0],
     cY + (ridgeLenM / 2) * ridgeDir[1] - (slopeLenM / 2) * perpDir[1]],
    [cX + (ridgeLenM / 2) * ridgeDir[0] + (slopeLenM / 2) * perpDir[0],
     cY + (ridgeLenM / 2) * ridgeDir[1] + (slopeLenM / 2) * perpDir[1]],
    [cX - (ridgeLenM / 2) * ridgeDir[0] + (slopeLenM / 2) * perpDir[0],
     cY - (ridgeLenM / 2) * ridgeDir[1] + (slopeLenM / 2) * perpDir[1]],
  ];
  return cornersL72.map(([x, y]) => lambert72ToWgs84(x, y));
}

const PANEL_W = 1.134;
const PANEL_H = 1.722;

describe('packPanels — basis gedrag', () => {
  test('rechthoekig dakvlak: panelen worden geplaatst', () => {
    const face = buildRoofFace(50.7469, 3.6042, 0, 16, 5);
    const panels = packPanels({
      facePoly: face,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 20,
    });
    expect(panels.length).toBeGreaterThan(10);
    expect(panels.length).toBeLessThanOrEqual(20);
  });

  test('panelen hebben 4 hoekpunten en een midLine', () => {
    const face = buildRoofFace(50.7469, 3.6042, 0, 16, 5);
    const panels = packPanels({
      facePoly: face,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 10,
    });
    for (const panel of panels) {
      expect(panel.corners).toHaveLength(4);
      expect(panel.midLine).toHaveLength(2);
      // Elke hoek is [lat, lng] in geldig Belgisch bereik
      for (const [lat, lng] of panel.corners) {
        expect(lat).toBeGreaterThan(49);
        expect(lat).toBeLessThan(52);
        expect(lng).toBeGreaterThan(2);
        expect(lng).toBeLessThan(7);
      }
    }
  });

  test('maxPanels wordt gerespecteerd', () => {
    const face = buildRoofFace(50.7469, 3.6042, 0, 20, 10);
    const panels = packPanels({
      facePoly: face,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 5,
    });
    expect(panels.length).toBeLessThanOrEqual(5);
  });

  test('geen panelen bij te klein polygon', () => {
    const tinyFace = buildRoofFace(50.7469, 3.6042, 0, 0.5, 0.5);
    const panels = packPanels({
      facePoly: tinyFace,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 20,
    });
    expect(panels).toHaveLength(0);
  });

  test('geen panelen bij leeg of gedegenereerd polygon', () => {
    expect(packPanels({ facePoly: null, panelWidth: PANEL_W, panelHeight: PANEL_H, maxPanels: 20 })).toHaveLength(0);
    expect(packPanels({ facePoly: [], panelWidth: PANEL_W, panelHeight: PANEL_H, maxPanels: 20 })).toHaveLength(0);
    expect(packPanels({ facePoly: [[50, 3]], panelWidth: PANEL_W, panelHeight: PANEL_H, maxPanels: 20 })).toHaveLength(0);
  });
});

describe('packPanels — regressievangnetten', () => {
  // REGRESSIEVANGNET BUG-09: panelen lekten over de noklijn.
  // Met strict 4-corner containment kan dit niet meer gebeuren.
  test('REGRESSIE BUG-09: alle paneel-hoeken liggen binnen face-polygon', () => {
    const face = buildRoofFace(50.7469, 3.6042, 37.2, 16, 5);
    const panels = packPanels({
      facePoly: face,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 20,
    });
    const polyL72 = face.map(([lat, lng]) => wgs84ToLambert72(lat, lng));
    for (const panel of panels) {
      for (const [lat, lng] of panel.corners) {
        const [x, y] = wgs84ToLambert72(lat, lng);
        expect(pointInPoly(x, y, polyL72)).toBe(true);
      }
    }
  });

  test('REGRESSIE BUG-09: L-vormig dakvlak — geen panelen in het concaaf gebied', () => {
    // L-vorm in lat/lng rondom Ronse: groot vierkant met notch
    const cLat = 50.7469, cLng = 3.6042;
    const [cX, cY] = wgs84ToLambert72(cLat, cLng);
    const lShapeL72 = [
      [cX - 8, cY - 8], [cX + 8, cY - 8], [cX + 8, cY + 2],
      [cX + 2, cY + 2], [cX + 2, cY + 8], [cX - 8, cY + 8],
    ];
    const lShape = lShapeL72.map(([x, y]) => lambert72ToWgs84(x, y));
    const panels = packPanels({
      facePoly: lShape,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 50,
    });
    for (const panel of panels) {
      for (const [lat, lng] of panel.corners) {
        const [x, y] = wgs84ToLambert72(lat, lng);
        expect(pointInPoly(x, y, lShapeL72)).toBe(true);
      }
    }
  });

  // REGRESSIEVANGNET BUG-10 & BUG-11: nokrichting komt uit het polygon zelf.
  // De parameter rotOffsetDeg is pure offset, niet een absolute richting.
  test('REGRESSIE BUG-10: rotOffsetDeg=0 → panelen parallel met gedetecteerde nok', () => {
    const ridgeAz = 37.22;
    const face = buildRoofFace(50.7469, 3.6042, ridgeAz, 16, 5);
    const panels = packPanels({
      facePoly: face,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 10,
      rotOffsetDeg: 0,
    });
    expect(panels.length).toBeGreaterThan(0);

    // Eerste paneel-edge (corner 0 → corner 1) is korte zijde in portrait,
    // dus moet loodrecht op de nok staan.
    const [p0, p1] = panels[0].corners;
    const [x0, y0] = wgs84ToLambert72(p0[0], p0[1]);
    const [x1, y1] = wgs84ToLambert72(p1[0], p1[1]);
    const edge = [x1 - x0, y1 - y0];
    const perpToRidge = [Math.cos(ridgeAz * Math.PI / 180), -Math.sin(ridgeAz * Math.PI / 180)];
    const len = Math.hypot(...edge);
    const cosAng = Math.abs((edge[0] * perpToRidge[0] + edge[1] * perpToRidge[1]) / len);
    const misalignDeg = Math.acos(Math.min(1, cosAng)) * 180 / Math.PI;
    expect(misalignDeg).toBeLessThan(0.5);
  });

  test('REGRESSIE BUG-10: rotOffsetDeg=+15 → panelen 15° verdraaid t.o.v. offset=0', () => {
    const face = buildRoofFace(50.7469, 3.6042, 37.22, 16, 5);
    const panels0 = packPanels({
      facePoly: face,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 10,
      rotOffsetDeg: 0,
    });
    const panels15 = packPanels({
      facePoly: face,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 10,
      rotOffsetDeg: 15,
    });
    if (panels0.length === 0 || panels15.length === 0) {
      throw new Error('Test requires both placements to succeed');
    }
    // Bereken edge-azimut van eerste paneel voor beide
    const edgeAz = panels => {
      const [p0, p1] = panels[0].corners;
      const [x0, y0] = wgs84ToLambert72(p0[0], p0[1]);
      const [x1, y1] = wgs84ToLambert72(p1[0], p1[1]);
      return Math.atan2(x1 - x0, y1 - y0) * 180 / Math.PI;
    };
    let diff = edgeAz(panels15) - edgeAz(panels0);
    // Normalize to [-90, 90] (bidirectional axis)
    while (diff > 90) diff -= 180;
    while (diff < -90) diff += 180;
    expect(Math.abs(Math.abs(diff) - 15)).toBeLessThan(1);
  });

  test('REGRESSIE BUG-11: productie-polygoon plaatst 20 panelen zonder lekken', () => {
    const productionFace = [
      [50.8737400911598, 3.727420927535621],
      [50.87372428, 3.72748135],
      [50.87375733, 3.72750294],
      [50.87374401, 3.72755384],
      [50.87379572, 3.72758764],
      [50.87380913, 3.72753637],
      [50.87386377, 3.72757207],
      [50.87388011054266, 3.7275101244444962],
    ];
    const panels = packPanels({
      facePoly: productionFace,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 20,
    });
    expect(panels.length).toBeGreaterThan(10);
    expect(panels.length).toBeLessThanOrEqual(20);

    // Geen lekken: alle hoeken binnen het polygon
    const polyL72 = productionFace.map(([lat, lng]) => wgs84ToLambert72(lat, lng));
    for (const panel of panels) {
      for (const [lat, lng] of panel.corners) {
        const [x, y] = wgs84ToLambert72(lat, lng);
        expect(pointInPoly(x, y, polyL72)).toBe(true);
      }
    }
  });
});

describe('packPanels — orientation', () => {
  test('portrait vs landscape produceren verschillende resultaten', () => {
    const face = buildRoofFace(50.7469, 3.6042, 0, 16, 5);
    const portrait = packPanels({
      facePoly: face,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 50,
      orient: 'portrait',
    });
    const landscape = packPanels({
      facePoly: face,
      panelWidth: PANEL_W,
      panelHeight: PANEL_H,
      maxPanels: 50,
      orient: 'landscape',
    });
    // Op een 16x5 dak met portrait-panelen van 1.7m past een andere
    // hoeveelheid dan landscape. Aantallen moeten verschillen.
    expect(portrait.length).not.toBe(landscape.length);
  });
});

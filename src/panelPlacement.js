// ─── panelPlacement.js ───────────────────────────────────────────────────────
//
// Zonnepaneel-plaatsing module voor ZonneDak Analyzer.
//
// Deze module is bewust geïsoleerd van App.jsx omdat ze drie bugs heeft
// overleefd die allemaal geïntroduceerd werden door nietige wijzigingen
// elders in de codebase. De module heeft een strict contract en een
// uitgebreide test suite — wijzigingen moeten altijd eerst door de tests.
//
// Bug geschiedenis:
//   BUG-09: panelen lekten over de noklijn naar het andere dakvlak omdat
//           er geen point-in-polygon check was — alleen bbox.
//   BUG-10: ridgeAngleDeg parameter was inconsistent met het face-polygon
//           na user-edits van de footprint-vertices.
//   BUG-11: PCA op het polygon gaf verschillende nokhoeken voor de twee
//           dakvlakken van hetzelfde gebouw bij trapezoïde shapes.
//
// De huidige implementatie:
//   - Meet in EPSG:31370 Lambert72 (metrisch, niet in WGS84-graden)
//   - Detecteert nokrichting via edge-length²-gewogen circulair gemiddelde
//   - Strict 4-corner point-in-polygon containment (geen bbox-leak mogelijk)
//   - Accepteert een rotation-offset voor fine-tuning door de gebruiker
// ─────────────────────────────────────────────────────────────────────────────

// =============================================================================
// COORDINATE TRANSFORMS — EPSG:31370 Lambert72 ↔ WGS84
// =============================================================================
//
// Lambert72 is het officiële Belgische geprojecteerde CRS (EPSG:31370).
// Alle oppervlakte-, afstand- en rotatieberekeningen gebeuren in dit CRS
// omdat WGS84 in graden zit (niet metrisch) en lat/lng dus geen eerlijke
// afstandsschaal geven. De Helmert 7-parameter datum shift naar het
// Hayford/Internationaal ellipsoïde is inline geïmplementeerd om externe
// dependencies (proj4) te vermijden.
//
// Round-trip accuraatheid: ~6 mm over België.

/**
 * Zet WGS84 [lat, lng] in graden om naar Lambert72 [X, Y] in meters.
 */
export function wgs84ToLambert72(latDeg, lngDeg) {
  const r = d => d * Math.PI / 180, lat = r(latDeg), lng = r(lngDeg);
  const aW = 6378137, fW = 1 / 298.257223563, e2W = 2 * fW - fW * fW;
  const NW = aW / Math.sqrt(1 - e2W * Math.sin(lat) ** 2);
  const X = NW * Math.cos(lat) * Math.cos(lng);
  const Y = NW * Math.cos(lat) * Math.sin(lng);
  const Z = NW * (1 - e2W) * Math.sin(lat);
  const tx = -106.869, ty = 52.2978, tz = -103.724;
  const rx = r(0.3366 / 3600), ry = r(-0.457 / 3600), rz = r(1.8422 / 3600);
  const s = 1 - 1.2747e-6;
  const Xb = s * (X + rz * Y - ry * Z) + tx;
  const Yb = s * (-rz * X + Y + rx * Z) + ty;
  const Zb = s * (ry * X - rx * Y + Z) + tz;
  const aI = 6378388, fI = 1 / 297, e2I = 2 * fI - fI * fI, eI = Math.sqrt(e2I);
  const p = Math.sqrt(Xb * Xb + Yb * Yb);
  const lng72 = Math.atan2(Yb, Xb);
  let lat72 = Math.atan2(Zb, p * (1 - e2I));
  for (let i = 0; i < 10; i++) {
    const N = aI / Math.sqrt(1 - e2I * Math.sin(lat72) ** 2);
    lat72 = Math.atan2(Zb + e2I * N * Math.sin(lat72), p);
  }
  const phi1 = r(49.8333333), phi2 = r(51.1666667), lam0 = r(4.3674867);
  const FE = 150000.013, FN = 5400088.438;
  const m_ = ph => Math.cos(ph) / Math.sqrt(1 - e2I * Math.sin(ph) ** 2);
  const t_ = ph => Math.tan(Math.PI / 4 - ph / 2) * Math.pow((1 + eI * Math.sin(ph)) / (1 - eI * Math.sin(ph)), eI / 2);
  const [m1, m2, t1, t2] = [m_(phi1), m_(phi2), t_(phi1), t_(phi2)];
  const n = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
  const F = m1 / (n * Math.pow(t1, n));
  const rho = aI * F * Math.pow(t_(lat72), n);
  const theta = n * (lng72 - lam0);
  return [FE + rho * Math.sin(theta), FN - rho * Math.cos(theta)];
}

/**
 * Zet Lambert72 [X, Y] in meters om naar WGS84 [lat, lng] in graden.
 */
export function lambert72ToWgs84(X, Y) {
  const r = d => d * Math.PI / 180;
  const aI = 6378388, fI = 1 / 297, e2I = 2 * fI - fI * fI, eI = Math.sqrt(e2I);
  const phi1 = r(49.8333333), phi2 = r(51.1666667), lam0 = r(4.3674867);
  const FE = 150000.013, FN = 5400088.438;
  const m_ = ph => Math.cos(ph) / Math.sqrt(1 - e2I * Math.sin(ph) ** 2);
  const t_ = ph => Math.tan(Math.PI / 4 - ph / 2) * Math.pow((1 + eI * Math.sin(ph)) / (1 - eI * Math.sin(ph)), eI / 2);
  const [m1, m2, t1, t2] = [m_(phi1), m_(phi2), t_(phi1), t_(phi2)];
  const n = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
  const F = m1 / (n * Math.pow(t1, n));
  const dx = X - FE, dy = FN - Y;
  const rho = Math.sqrt(dx * dx + dy * dy) * Math.sign(n);
  const theta = Math.atan2(dx, dy);
  const t = Math.pow(rho / (aI * F), 1 / n);
  let lat72 = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 10; i++) {
    const es = eI * Math.sin(lat72);
    lat72 = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - es) / (1 + es), eI / 2));
  }
  const lng72 = theta / n + lam0;
  const N_I = aI / Math.sqrt(1 - e2I * Math.sin(lat72) ** 2);
  const Xb = N_I * Math.cos(lat72) * Math.cos(lng72);
  const Yb = N_I * Math.cos(lat72) * Math.sin(lng72);
  const Zb = N_I * (1 - e2I) * Math.sin(lat72);
  const tx = -106.869, ty = 52.2978, tz = -103.724;
  const rx = r(0.3366 / 3600), ry = r(-0.457 / 3600), rz = r(1.8422 / 3600);
  const s = 1 - 1.2747e-6;
  const Xw = (Xb - tx) / s - rz * ((Yb - ty) / s) + ry * ((Zb - tz) / s);
  const Yw = rz * ((Xb - tx) / s) + (Yb - ty) / s - rx * ((Zb - tz) / s);
  const Zw = -ry * ((Xb - tx) / s) + rx * ((Yb - ty) / s) + (Zb - tz) / s;
  const aW = 6378137, fW = 1 / 298.257223563, e2W = 2 * fW - fW * fW;
  const p = Math.sqrt(Xw * Xw + Yw * Yw);
  const lngW = Math.atan2(Yw, Xw);
  let latW = Math.atan2(Zw, p * (1 - e2W));
  for (let i = 0; i < 10; i++) {
    const NW = aW / Math.sqrt(1 - e2W * Math.sin(latW) ** 2);
    latW = Math.atan2(Zw + e2W * NW * Math.sin(latW), p);
  }
  return [latW * 180 / Math.PI, lngW * 180 / Math.PI];
}

// =============================================================================
// GEOMETRIE HELPERS
// =============================================================================

/**
 * Ray-casting point-in-polygon test. Punt en polygon in dezelfde CRS.
 * @param {number} x
 * @param {number} y
 * @param {Array<[number, number]>} poly
 * @returns {boolean}
 */
export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (
      ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Detecteer de dominante nokrichting van een face-polygon via edge-length²-
 * gewogen circulair gemiddelde in 2x-angle space.
 *
 * Waarom deze methode (en niet PCA of "langste edge"):
 * - Edges worden bidirectioneel behandeld (0° = 180°) via 2x-angle truc.
 * - Gewicht = length² zorgt dat lange randen (nok + parallelle dakrand)
 *   domineren, korte uitsteeksels (aanbouwen) tellen nauwelijks mee.
 * - Geeft consistente resultaten voor beide dakvlakken van een zadeldak,
 *   ook na user-edits van de footprint-vertices.
 *
 * @param {Array<[number, number]>} polyL72 - polygon in Lambert72 meter
 * @returns {number} azimuth vanaf Noord (CW), [0, 180°)
 */
export function detectRidgeAzimuth(polyL72) {
  if (!polyL72 || polyL72.length < 3) return 0;
  let sumCos = 0, sumSin = 0;
  const n = polyL72.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polyL72[i];
    const [x2, y2] = polyL72[(i + 1) % n];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue; // skip degenerate edges
    // Azimut vanaf Noord (CW): atan2(East, North) = atan2(dx, dy) in Lambert72
    // Normalize to [0, 180°) — bidirectional axis
    let az = Math.atan2(dx, dy) * 180 / Math.PI;
    az = ((az % 180) + 180) % 180;
    // Double the angle for circular statistics on axial data
    const theta2 = az * 2 * Math.PI / 180;
    const w = len * len;
    sumCos += w * Math.cos(theta2);
    sumSin += w * Math.sin(theta2);
  }
  if (sumCos === 0 && sumSin === 0) return 0;
  const avgTheta2 = Math.atan2(sumSin, sumCos);
  let az = (avgTheta2 * 180 / Math.PI) / 2;
  return ((az % 180) + 180) % 180;
}

// =============================================================================
// PANEL PLACEMENT — KERN VAN DE MODULE
// =============================================================================

/**
 * Plaats zonnepanelen op een enkel dakvlak, evenwijdig met de nok.
 *
 * Contract:
 *   - Panelen worden ALLEEN geplaatst binnen het opgegeven face-polygoon.
 *     Alle 4 hoeken van elk paneel moeten binnen het polygon vallen
 *     (strict containment via ray-casting point-in-polygon).
 *   - Panelen staan evenwijdig met de automatisch gedetecteerde nokrichting
 *     van het face-polygoon, optioneel gedraaid met rotOffsetDeg.
 *   - Alle metingen gebeuren in Lambert72 (EPSG:31370) — metrisch CRS.
 *
 * @param {Object} opts
 * @param {Array<[number, number]>} opts.facePoly  - polygon in WGS84 [lat, lng], gesloten niet verplicht
 * @param {number} opts.panelWidth                  - korte paneelzijde in meter
 * @param {number} opts.panelHeight                 - lange paneelzijde in meter
 * @param {number} opts.maxPanels                   - maximum aantal te plaatsen panelen
 * @param {number} [opts.rotOffsetDeg=0]            - rotatie-offset bovenop auto-detectie (°)
 * @param {'portrait'|'landscape'} [opts.orient='portrait']
 *        - portrait  = korte zijde langs nok, lange zijde langs helling
 *        - landscape = lange zijde langs nok, korte zijde langs helling
 * @param {number} [opts.edgeMargin=0.3]            - vrije ruimte t.o.v. dakrand (m)
 * @param {number} [opts.gapX=0.05]                 - tussenruimte loodrecht op nok (m)
 * @param {number} [opts.gapY=0.05]                 - tussenruimte langs nok (m)
 * @param {(msg: string) => void} [opts.logger]     - optional debug logger
 * @returns {Array<{corners: Array<[number,number]>, midLine: Array<[number,number]>}>}
 *        Array van panelen. Elke corner/midLine point is [lat, lng] WGS84.
 */
export function packPanels({
  facePoly,
  panelWidth,
  panelHeight,
  maxPanels,
  rotOffsetDeg = 0,
  orient = 'portrait',
  edgeMargin = 0.3,
  gapX = 0.05,
  gapY = 0.05,
  logger = null,
}) {
  if (!facePoly || facePoly.length < 3) return [];

  // 1) Transformeer face-polygoon naar Lambert72 (metrisch, EPSG:31370).
  const polyL72 = facePoly.map(([lat, lng]) => wgs84ToLambert72(lat, lng));
  const cX = polyL72.reduce((s, p) => s + p[0], 0) / polyL72.length;
  const cY = polyL72.reduce((s, p) => s + p[1], 0) / polyL72.length;
  const polyM = polyL72.map(([x, y]) => [x - cX, y - cY]);

  // 2) Detecteer nokrichting via edge-voting, pas slider-offset erop toe.
  const detectedAzDeg = detectRidgeAzimuth(polyL72);
  const rotOff = (rotOffsetDeg != null && isFinite(rotOffsetDeg)) ? rotOffsetDeg : 0;
  const ridgeAzDeg = ((detectedAzDeg + rotOff) % 180 + 180) % 180;

  const r = ridgeAzDeg * Math.PI / 180;
  const ex = Math.sin(r), ey = Math.cos(r);
  // rotFwd mapt nokrichting (ex,ey) → (0,1) (nok langs Y-as in rotated frame).
  // Matrix: rotFwd = [[ey, -ex], [ex, ey]]
  const rotFwd = ([x, y]) => [x * ey - y * ex, x * ex + y * ey];
  const rotInv = ([x, y]) => [x * ey + y * ex, -x * ex + y * ey];

  if (logger) {
    logger(`packPanels: edge-voting=${detectedAzDeg.toFixed(1)}° + offset=${rotOff.toFixed(1)}° → nok=${ridgeAzDeg.toFixed(1)}°`);
  }

  const rotPoly = polyM.map(rotFwd);

  // 3) Bbox van geroteerd polygon. Axis-aligned in rotated frame = evenwijdig
  //    met de gedetecteerde nokrichting in Lambert72.
  const xs = rotPoly.map(p => p[0]);
  const ys = rotPoly.map(p => p[1]);
  const minRX = Math.min(...xs), maxRX = Math.max(...xs);
  const minRY = Math.min(...ys), maxRY = Math.max(...ys);

  // 4) Paneelafmetingen in rotated frame:
  //    Y-as = langs nok, X-as = loodrecht op nok (langs helling in grondvlak).
  const isPortrait = orient === 'portrait';
  const W = isPortrait ? panelHeight : panelWidth; // langs X (loodrecht op nok)
  const H = isPortrait ? panelWidth : panelHeight; // langs Y (langs nok)

  const panels = [];

  // 5) Grid-plaatsing met STRICT containment.
  for (let ry = minRY + edgeMargin; ry + H <= maxRY - edgeMargin && panels.length < maxPanels; ry += H + gapY) {
    for (let rx = minRX + edgeMargin; rx + W <= maxRX - edgeMargin && panels.length < maxPanels; rx += W + gapX) {
      const cornersRot = [
        [rx, ry],
        [rx + W, ry],
        [rx + W, ry + H],
        [rx, ry + H],
      ];
      // REGRESSIEVANGNET: alle 4 hoeken moeten in het face-polygoon vallen.
      // Deze check voorkomt lekken over de nok en buiten de dakrand.
      const allInside = cornersRot.every(([x, y]) => pointInPoly(x, y, rotPoly));
      if (!allInside) continue;

      // Terug-transformatie: rotated → Lambert72 → WGS84 lat/lng.
      const toLatLng = pt => {
        const [mx, my] = rotInv(pt);
        return lambert72ToWgs84(cX + mx, cY + my);
      };
      const corners = cornersRot.map(toLatLng);
      const midLine = [[rx, ry + H / 2], [rx + W, ry + H / 2]].map(toLatLng);
      panels.push({ corners, midLine });
    }
  }
  return panels;
}

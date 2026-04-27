// ─── stringDesign.js ────────────────────────────────────────────────────────
//
// PV string-design module voor ZonneDak Analyzer.
//
// Berekent of een gekozen panel-omvormer combinatie technisch correct werkt:
//   - Hoeveel panelen MOGEN in serie (rekening met laagste verwachte temperatuur)
//   - Hoeveel panelen MOETEN minstens in serie (rekening met hoogste temperatuur)
//   - Hoeveel parallelle strings per MPPT (gebaseerd op stroom-limiet)
//   - Beste verdeling van het totaal aantal panelen over de MPPT-ingangen
//
// Veiligheidsgrenzen voor Vlaanderen/België (gematigde berekening — SMA-conventie):
//   - T_min = -7 °C (typische Belgische winterochtend — Voc max bij koude)
//   - T_max = +32 °C (typische Belgische zomermiddag, omgevingslucht)
//   - T_config = +19 °C (jaargemiddelde voor "typische" werking)
//   - T_STC = +25 °C (paneel-datasheet referentie)
//
// Input data verwacht per paneel:
//   { voc, vmp, isc, imp, tempCoeffVoc, tempCoeffPmax, watt }
//   Eenheden: V, V, A, A, %/°C, %/°C, W
//
// Input data verwacht per omvormer:
//   { mpptCount, maxDcVoltage, maxInputCurrentPerMppt,
//     mpptVoltageMin, mpptVoltageMax, maxAcPower, maxDcPower }
//   Eenheden: int, V, A, V, V, W, W
//
// ────────────────────────────────────────────────────────────────────────────

// =============================================================================
// CONSTANTEN
// =============================================================================

export const T_MIN_BE = -7;       // °C, koudste typische ochtend in Vlaanderen
export const T_MAX_AMBIENT = 32;  // °C, warmste omgevingstemperatuur (lucht)
export const T_CONFIG = 19;       // °C, configuratie-/typische werkingstemp
export const T_STC = 25;          // °C, datasheet referentietemperatuur
// Backwards compat alias
export const T_MAX_CELL = T_MAX_AMBIENT;

// =============================================================================
// VOLTAGE/CURRENT CORRECTIES VOOR TEMPERATUUR
// =============================================================================

/**
 * Bereken Voc bij temperatuur T (°C) gegeven Voc bij STC en tempcoëfficiënt.
 * Bij KOUDE stijgt Voc — dit is de gevaarlijkste richting voor de omvormer.
 *
 * Formule: Voc(T) = Voc_STC × (1 + tempCoeffVoc × (T - 25) / 100)
 *
 * Voorbeeld: Voc_STC = 37V, tempCoeffVoc = -0.27 %/°C, T = -15°C
 *   Voc(-15) = 37 × (1 + (-0.27) × (-40) / 100) = 37 × 1.108 = 41.0V
 */
export function vocAtTemp(vocStc, tempCoeffVocPct, tempC) {
  return vocStc * (1 + (tempCoeffVocPct * (tempC - T_STC)) / 100);
}

/**
 * Bereken Vmp bij temperatuur T. Bij WARMTE daalt Vmp — kritisch voor
 * MPPT-startspanning (omvormer kan niet onder zijn min MPPT-spanning werken).
 *
 * Vmp heeft typisch dezelfde tempcoëfficiënt als Voc (met goede benadering).
 */
export function vmpAtTemp(vmpStc, tempCoeffVocPct, tempC) {
  return vmpStc * (1 + (tempCoeffVocPct * (tempC - T_STC)) / 100);
}

// =============================================================================
// MIN/MAX PANELEN PER STRING
// =============================================================================

/**
 * Maximaal aantal panelen in serie zonder de omvormer's max DC-spanning te
 * overschrijden bij de KOUDSTE verwachte temperatuur.
 *
 * Veiligheidsmarge: 5% — we blijven onder 95% van de inverter limit.
 */
export function maxPanelsPerString(panel, inverter, tempMin = T_MIN_BE) {
  const vocCold = vocAtTemp(panel.voc, panel.tempCoeffVoc, tempMin);
  const safeMaxV = inverter.maxDcVoltage * 0.95;
  return Math.floor(safeMaxV / vocCold);
}

/**
 * Minimum aantal panelen in serie om bij de WARMSTE temperatuur nog boven
 * de MPPT-startspanning (mpptVoltageMin) te blijven.
 *
 * Marge: 10% boven de mpptVoltageMin als comfortzone (anders zit je
 * permanent op het randje).
 */
export function minPanelsPerString(panel, inverter, tempMax = T_MAX_CELL) {
  const vmpHot = vmpAtTemp(panel.vmp, panel.tempCoeffVoc, tempMax);
  const safeMinV = inverter.mpptVoltageMin * 1.1;
  return Math.ceil(safeMinV / vmpHot);
}

/**
 * Aantal parallelle strings per MPPT op basis van stroom-limiet.
 * Veiligheidsmarge: 5% onder max input current.
 *
 * Dit is meestal 1 of 2 — moderne strings produceren ~10-15A en moderne
 * MPPT's ondersteunen meestal 12-20A per ingang.
 */
export function maxParallelStringsPerMppt(panel, inverter) {
  if (!inverter.maxInputCurrentPerMppt || !panel.isc) return 1;
  const safeMaxA = inverter.maxInputCurrentPerMppt * 0.95;
  // Gebruik Isc (kortsluitstroom) want dat is de worst-case waarde,
  // niet Imp (de stroom op het max-power-punt).
  return Math.max(1, Math.floor(safeMaxA / panel.isc));
}

// =============================================================================
// AUTOMATISCHE VERDELING OVER MPPTs
// =============================================================================

/**
 * Verdeel N panelen automatisch over de beschikbare MPPT-ingangen.
 *
 * Strategie:
 *   1. Probeer alle panelen in 1 string op 1 MPPT (mooiste oplossing).
 *   2. Lukt dat niet (te veel panelen voor één string), splits over
 *      meerdere MPPTs met zo gelijk mogelijke aantallen.
 *   3. Lukt dat niet, vorm 2 strings parallel per MPPT.
 *   4. Per MPPT moeten alle strings exact even lang zijn (technische eis).
 *
 * @param {object} panel        - paneel met voc/vmp/isc/imp/tempCoeffVoc
 * @param {object} inverter     - omvormer met mppt-specs
 * @param {number} totalPanels  - totaal aantal panelen
 * @returns {object} {
 *   mppts: [{ stringCount, panelsPerString, totalPanels }],
 *   totalAssigned: number,
 *   unassigned: number,
 *   feasible: boolean,
 *   reason: string | null,
 * }
 */
export function distributeStrings(panel, inverter, totalPanels) {
  if (!totalPanels || totalPanels < 1) {
    return { mppts: [], totalAssigned: 0, unassigned: 0, feasible: false, reason: 'Geen panelen' };
  }
  const minPerString = minPanelsPerString(panel, inverter);
  const maxPerString = maxPanelsPerString(panel, inverter);
  const maxParallel = maxParallelStringsPerMppt(panel, inverter);
  const mpptCount = Math.max(1, inverter.mpptCount || 1);

  if (maxPerString < 1 || maxPerString < minPerString) {
    return {
      mppts: [],
      totalAssigned: 0,
      unassigned: totalPanels,
      feasible: false,
      reason: `Paneel + omvormer combinatie incompatibel (max ${maxPerString} < min ${minPerString} per string)`,
    };
  }

  // 1) Probeer alle panelen in één string op één MPPT
  if (totalPanels <= maxPerString && totalPanels >= minPerString) {
    return {
      mppts: [{ stringCount: 1, panelsPerString: totalPanels, totalPanels }],
      totalAssigned: totalPanels,
      unassigned: 0,
      feasible: true,
      reason: null,
    };
  }

  // 2) Verdeel over MPPTs — eerlijke verdeling.
  //    Per MPPT moeten alle strings even lang zijn.
  //    We zoeken een (mpptsUsed, stringsPerMppt, panelsPerString) zodat:
  //      mpptsUsed × stringsPerMppt × panelsPerString = totalPanels
  //      minPerString <= panelsPerString <= maxPerString
  //      stringsPerMppt <= maxParallel
  //      mpptsUsed <= mpptCount
  //    Binnen valide opties geef voorrang aan: minste totaal aantal strings,
  //    daarna meeste panelen-per-string (efficiënter), dan minste MPPTs.
  const candidates = [];
  for (let pps = maxPerString; pps >= minPerString; pps--) {
    for (let spm = 1; spm <= maxParallel; spm++) {
      const panelsPerMppt = pps * spm;
      if (totalPanels % panelsPerMppt !== 0) continue;
      const mpptsNeeded = totalPanels / panelsPerMppt;
      if (mpptsNeeded > mpptCount) continue;
      candidates.push({
        mpptsUsed: mpptsNeeded,
        stringsPerMppt: spm,
        panelsPerString: pps,
        totalStrings: mpptsNeeded * spm,
      });
    }
  }

  if (candidates.length > 0) {
    // Sorteer: minste totaal strings, dan meeste panelen-per-string
    candidates.sort((a, b) =>
      a.totalStrings - b.totalStrings ||
      b.panelsPerString - a.panelsPerString
    );
    const best = candidates[0];
    const mppts = [];
    for (let i = 0; i < best.mpptsUsed; i++) {
      mppts.push({
        stringCount: best.stringsPerMppt,
        panelsPerString: best.panelsPerString,
        totalPanels: best.stringsPerMppt * best.panelsPerString,
      });
    }
    return {
      mppts,
      totalAssigned: totalPanels,
      unassigned: 0,
      feasible: true,
      reason: null,
    };
  }

  // 3) Geen schone deler-oplossing — probeer "best effort": grootst mogelijke
  //    string-lengte, vul resterende MPPTs met kortere strings.
  //    Dit is een fallback; moderne installaties willen liever even-lange strings.
  const mppts = [];
  let remaining = totalPanels;
  let mpptIdx = 0;
  while (remaining > 0 && mpptIdx < mpptCount) {
    const thisString = Math.min(remaining, maxPerString);
    if (thisString < minPerString) {
      // Kunnen niet meer plaatsen: te weinig voor een werkende string
      break;
    }
    mppts.push({
      stringCount: 1,
      panelsPerString: thisString,
      totalPanels: thisString,
    });
    remaining -= thisString;
    mpptIdx++;
  }

  return {
    mppts,
    totalAssigned: totalPanels - remaining,
    unassigned: remaining,
    feasible: remaining === 0 && mppts.length > 0,
    reason: remaining > 0
      ? `${remaining} panelen kunnen niet veilig worden aangesloten op deze omvormer`
      : (mppts.length > 0 ? null : 'Geen valide string-configuratie gevonden'),
  };
}

// =============================================================================
// VALIDATIE & WAARSCHUWINGEN
// =============================================================================

/**
 * Valideer een string-configuratie tegen alle veiligheids- en prestatiegrenzen.
 * Genereert lijst waarschuwingen met severity:
 *   - 'critical' = onveilig of beschadiging mogelijk (rood)
 *   - 'warning'  = werkt maar suboptimaal (oranje)
 *   - 'info'     = informatief (blauw/grijs)
 */
export function validateDesign(panel, inverter, distribution) {
  const warnings = [];

  if (!distribution.feasible) {
    warnings.push({
      severity: 'critical',
      title: 'Configuratie niet haalbaar',
      detail: distribution.reason || 'Onbekend probleem',
    });
    return warnings;
  }

  // Check elke MPPT individueel
  for (let i = 0; i < distribution.mppts.length; i++) {
    const m = distribution.mppts[i];
    const tag = `MPPT ${i + 1}`;

    // 1) Voc bij koudste temperatuur — KRITIEK want kan omvormer beschadigen
    const vocCold = m.panelsPerString * vocAtTemp(panel.voc, panel.tempCoeffVoc, T_MIN_BE);
    if (vocCold > inverter.maxDcVoltage) {
      warnings.push({
        severity: 'critical',
        title: `${tag}: spanning te hoog bij koude`,
        detail: `Bij ${T_MIN_BE}°C: ${vocCold.toFixed(0)}V > max ${inverter.maxDcVoltage}V. Risico op beschadiging.`,
      });
    } else if (vocCold > inverter.maxDcVoltage * 0.95) {
      warnings.push({
        severity: 'warning',
        title: `${tag}: spanning dicht tegen limiet`,
        detail: `Bij ${T_MIN_BE}°C: ${vocCold.toFixed(0)}V (95% van max ${inverter.maxDcVoltage}V).`,
      });
    }

    // 2) Vmp bij warmste temperatuur — start MPPT-bereik
    const vmpHot = m.panelsPerString * vmpAtTemp(panel.vmp, panel.tempCoeffVoc, T_MAX_CELL);
    if (vmpHot < inverter.mpptVoltageMin) {
      warnings.push({
        severity: 'critical',
        title: `${tag}: spanning te laag bij hitte`,
        detail: `Bij ${T_MAX_CELL}°C cel: ${vmpHot.toFixed(0)}V < min MPPT ${inverter.mpptVoltageMin}V. Omvormer schakelt uit.`,
      });
    }

    // 3) Stroom — als parallelle strings, worden Isc opgeteld
    const totalIsc = m.stringCount * panel.isc;
    if (inverter.maxInputCurrentPerMppt && totalIsc > inverter.maxInputCurrentPerMppt) {
      warnings.push({
        severity: 'critical',
        title: `${tag}: stroom te hoog`,
        detail: `${m.stringCount} strings × ${panel.isc.toFixed(1)}A = ${totalIsc.toFixed(1)}A > max ${inverter.maxInputCurrentPerMppt}A.`,
      });
    }
  }

  // 4) Totaal DC-vermogen versus omvormer max
  const totalPanels = distribution.mppts.reduce((s, m) => s + m.totalPanels, 0);
  const totalDcWatt = totalPanels * panel.watt;
  if (inverter.maxDcPower && totalDcWatt > inverter.maxDcPower) {
    const overpct = ((totalDcWatt / inverter.maxDcPower - 1) * 100).toFixed(0);
    warnings.push({
      severity: totalDcWatt > inverter.maxDcPower * 1.2 ? 'critical' : 'warning',
      title: 'DC-vermogen overschrijdt omvormer',
      detail: `Panelen totaal ${(totalDcWatt / 1000).toFixed(1)}kWp > omvormer max ${(inverter.maxDcPower / 1000).toFixed(1)}kW (+${overpct}%). Productie wordt afgevlakt op piekmomenten.`,
    });
  } else if (inverter.maxDcPower && totalDcWatt < inverter.maxDcPower * 0.5) {
    warnings.push({
      severity: 'info',
      title: 'Omvormer onderbenut',
      detail: `Panelen totaal ${(totalDcWatt / 1000).toFixed(1)}kWp gebruikt slechts ${((totalDcWatt / inverter.maxDcPower) * 100).toFixed(0)}% van de omvormer-capaciteit.`,
    });
  }

  // 5) MPPT-balans (twee MPPTs gebruikt met heel ongelijke strings → niet ideaal)
  if (distribution.mppts.length > 1) {
    const sizes = distribution.mppts.map(m => m.totalPanels);
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    if (minSize !== maxSize && maxSize - minSize > Math.max(1, minSize * 0.5)) {
      warnings.push({
        severity: 'info',
        title: 'MPPTs niet gebalanceerd',
        detail: `MPPT-vermogens variëren van ${minSize} tot ${maxSize} panelen. Acceptabel maar verlies van efficiëntie mogelijk.`,
      });
    }
  }

  return warnings;
}

// =============================================================================
// ALL-IN-ONE: complete design + validation
// =============================================================================

/**
 * Bereken volledig string-design met alle metingen voor de UI/PDF.
 */
export function computeStringDesign(panel, inverter, totalPanels) {
  const distribution = distributeStrings(panel, inverter, totalPanels);
  const warnings = validateDesign(panel, inverter, distribution);

  // Verrijk distribution met berekende voltages/stromen per MPPT.
  // Deze waarden komen rechtstreeks in de SMA-stijl tabel terecht.
  const enriched = distribution.mppts.map(m => {
    // Spanningen bij verschillende temperaturen per string
    const vocCold = m.panelsPerString * vocAtTemp(panel.voc, panel.tempCoeffVoc, T_MIN_BE);
    const vocStc = m.panelsPerString * panel.voc;
    const vmpStc = m.panelsPerString * panel.vmp;
    const vmpHot = m.panelsPerString * vmpAtTemp(panel.vmp, panel.tempCoeffVoc, T_MAX_AMBIENT);
    const vmpConfig = m.panelsPerString * vmpAtTemp(panel.vmp, panel.tempCoeffVoc, T_CONFIG);

    // Stroom — bij parallelle strings worden Imp en Isc opgeteld
    const impTotal = m.stringCount * panel.imp;
    const iscTotal = m.stringCount * panel.isc;

    // Vermogen
    const powerStc = m.totalPanels * panel.watt;

    // Pass/fail per check (true = OK, false = FAULT)
    const checks = {
      vocColdOk: vocCold <= inverter.maxDcVoltage,
      vmpHotOk: vmpHot >= inverter.mpptVoltageMin,
      vmpConfigOk: vmpConfig >= inverter.mpptVoltageMin && vmpConfig <= inverter.mpptVoltageMax,
      impOk: !inverter.maxInputCurrentPerMppt || impTotal <= inverter.maxInputCurrentPerMppt,
      iscOk: !inverter.maxInputCurrentPerMppt || iscTotal <= inverter.maxInputCurrentPerMppt,
    };

    return {
      ...m,
      vocCold, vocStc, vmpStc, vmpHot, vmpConfig,
      iscTotal, impTotal,
      powerStc,
      checks,
    };
  });

  const totalPowerW = enriched.reduce((s, m) => s + m.powerStc, 0);
  const hasCritical = warnings.some(w => w.severity === 'critical');
  const hasWarning = warnings.some(w => w.severity === 'warning');

  // Algemene config-info — wordt getoond in de header van de Technisch tab
  const config = {
    tempMin: T_MIN_BE,
    tempConfig: T_CONFIG,
    tempMax: T_MAX_AMBIENT,
    tempStc: T_STC,
    inverterMaxDc: inverter.maxDcVoltage,
    inverterMpptMin: inverter.mpptVoltageMin,
    inverterMpptMax: inverter.mpptVoltageMax,
    inverterMaxCurrent: inverter.maxInputCurrentPerMppt,
    inverterMaxAc: inverter.maxAcPower,
    inverterMaxDcPower: inverter.maxDcPower,
    // Dimensioneringsfactor = totaal DC-vermogen / max AC-vermogen × 100%
    sizingFactor: inverter.maxAcPower
      ? Math.round((totalPowerW / inverter.maxAcPower) * 1000) / 10
      : null,
  };

  return {
    feasible: distribution.feasible && !hasCritical,
    mppts: enriched,
    warnings,
    totalPower: totalPowerW,
    config,
    summary: {
      panelsPerString: enriched[0]?.panelsPerString || 0,
      stringsPerMppt: enriched[0]?.stringCount || 0,
      mpptsUsed: enriched.length,
      mpptsAvailable: inverter.mpptCount || 1,
      hasCritical,
      hasWarning,
    },
  };
}

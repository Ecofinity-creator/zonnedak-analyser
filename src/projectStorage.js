// ─── projectStorage.js ──────────────────────────────────────────────────────
//
// Project-opslag module voor ZonneDak Analyzer.
//
// Functionaliteit:
//   - Opslaan/laden van projecten in browser localStorage (per klantnaam)
//   - Auto-save met debounce (wacht 1 seconde na laatste wijziging)
//   - Export naar JSON-bestand (download in browser)
//   - Import vanuit JSON-bestand (upload/drop)
//   - Lijst van alle opgeslagen projecten
//
// Eén project = één klant. Klantnaam is de primary key. Als je twee klanten
// met dezelfde naam hebt, voeg dan een onderscheidend element toe aan de
// naam zelf (bv. "Jan Janssens (Ronse)" vs "Jan Janssens (Gent)").
//
// De projectdata is een vrije JSON-structuur. Deze module weet niet wat
// erin zit — die kennis zit in App.jsx die bepaalt welke state er opgeslagen
// en teruggeladen wordt.
// ────────────────────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'zonnedak_project_';
const INDEX_KEY = 'zonnedak_project_index';
const SCHEMA_VERSION = 1;

// =============================================================================
// CORE OPSLAG API
// =============================================================================

/**
 * Bouw de storage-key voor een klantnaam.
 * Naam wordt getrimd en lowercased om duplicaten te vermijden
 * (zoals "Jan Janssens" vs "jan janssens").
 */
function keyFor(customerName) {
  return STORAGE_PREFIX + customerName.trim().toLowerCase();
}

/**
 * Opslaan van een project onder een klantnaam.
 * @param {string} customerName - de unieke klant-identifier
 * @param {object} data         - project-data (vrije JSON-structuur)
 * @returns {boolean} true als opgeslagen, false bij fout
 */
export function saveProject(customerName, data) {
  if (!customerName || !customerName.trim()) return false;
  try {
    const envelope = {
      schema: SCHEMA_VERSION,
      customerName: customerName.trim(),
      savedAt: new Date().toISOString(),
      data,
    };
    localStorage.setItem(keyFor(customerName), JSON.stringify(envelope));
    updateIndex(customerName);
    return true;
  } catch (err) {
    // Fout bij opslaan (meestal: localStorage vol of geblokkeerd)
    console.error('[projectStorage] saveProject failed:', err);
    return false;
  }
}

/**
 * Laden van een project.
 * @param {string} customerName
 * @returns {{customerName: string, savedAt: string, data: object} | null}
 */
export function loadProject(customerName) {
  if (!customerName || !customerName.trim()) return null;
  try {
    const raw = localStorage.getItem(keyFor(customerName));
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    if (!envelope || typeof envelope !== 'object') return null;
    return envelope;
  } catch (err) {
    console.error('[projectStorage] loadProject failed:', err);
    return null;
  }
}

/**
 * Project verwijderen.
 * @returns {boolean} true als verwijderd of niet bestond
 */
export function deleteProject(customerName) {
  if (!customerName || !customerName.trim()) return false;
  try {
    localStorage.removeItem(keyFor(customerName));
    removeFromIndex(customerName);
    return true;
  } catch (err) {
    console.error('[projectStorage] deleteProject failed:', err);
    return false;
  }
}

/**
 * Lijst van alle opgeslagen projecten, gesorteerd op laatst opgeslagen eerst.
 * @returns {Array<{customerName: string, savedAt: string}>}
 */
export function listProjects() {
  const index = readIndex();
  return index
    .map(name => {
      const p = loadProject(name);
      return p ? { customerName: p.customerName, savedAt: p.savedAt } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

// =============================================================================
// INDEX MANAGEMENT
// =============================================================================
// De index is een JSON-array van klantnamen voor snelle "list all" zonder
// alle localStorage-keys te moeten scannen.

function readIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeIndex(arr) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(arr));
  } catch (err) {
    console.error('[projectStorage] writeIndex failed:', err);
  }
}

function updateIndex(customerName) {
  const name = customerName.trim();
  const idx = readIndex();
  // Case-insensitive vergelijking, behoud originele casing
  const existing = idx.findIndex(n => n.toLowerCase() === name.toLowerCase());
  if (existing >= 0) {
    idx[existing] = name; // update casing indien veranderd
  } else {
    idx.push(name);
  }
  writeIndex(idx);
}

function removeFromIndex(customerName) {
  const name = customerName.trim().toLowerCase();
  const idx = readIndex().filter(n => n.toLowerCase() !== name);
  writeIndex(idx);
}

// =============================================================================
// AUTO-SAVE MET DEBOUNCE
// =============================================================================

/**
 * Maak een debounced save-functie. Roep saveNow() aan bij elke wijziging;
 * de eigenlijke save gebeurt pas als er X ms geen nieuwe call meer is.
 * Dit voorkomt dat elke slider-beweging afzonderlijk localStorage raakt.
 *
 * @param {number} delayMs - debounce interval (standaard 1000ms)
 * @returns {{saveNow: (customerName: string, data: object) => void, flush: () => void, cancel: () => void}}
 */
export function createAutoSaver(delayMs = 1000) {
  let timer = null;
  let pending = null; // {customerName, data}

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) {
      saveProject(pending.customerName, pending.data);
      pending = null;
    }
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  };

  const saveNow = (customerName, data) => {
    pending = { customerName, data };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      flush();
    }, delayMs);
  };

  return { saveNow, flush, cancel };
}

// =============================================================================
// JSON EXPORT / IMPORT
// =============================================================================

/**
 * Download een project als JSON-bestand. Werkt alleen in browser-omgeving.
 * @param {string} customerName
 * @returns {boolean} false als project niet bestaat of download faalde
 */
export function downloadProjectAsJSON(customerName) {
  const project = loadProject(customerName);
  if (!project) return false;
  try {
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Veilige filename: strip tekens die problematisch zijn
    const safeName = customerName.replace(/[^a-zA-Z0-9._-]+/g, '_');
    a.download = `zonnedak_${safeName}_${project.savedAt.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('[projectStorage] download failed:', err);
    return false;
  }
}

/**
 * Import een project uit een JSON-string. Valideert schema en slaat op.
 * Als een project met dezelfde naam al bestaat, wordt het OVERSCHREVEN.
 * De caller moet eerst checken (via loadProject) en bevestiging vragen
 * aan de gebruiker indien gewenst.
 *
 * @param {string} jsonStr
 * @returns {{success: true, customerName: string} | {success: false, error: string}}
 */
export function importProjectFromJSON(jsonStr) {
  let envelope;
  try {
    envelope = JSON.parse(jsonStr);
  } catch {
    return { success: false, error: 'Ongeldig JSON-bestand.' };
  }
  if (!envelope || typeof envelope !== 'object') {
    return { success: false, error: 'JSON bevat geen geldig object.' };
  }
  if (!envelope.customerName || typeof envelope.customerName !== 'string') {
    return { success: false, error: 'Veld "customerName" ontbreekt of is ongeldig.' };
  }
  if (!envelope.data || typeof envelope.data !== 'object') {
    return { success: false, error: 'Veld "data" ontbreekt of is ongeldig.' };
  }
  // Schema-versie check: toekomst-bestendig voor migraties
  if (envelope.schema && envelope.schema > SCHEMA_VERSION) {
    return {
      success: false,
      error: `Bestand is van een nieuwere versie (${envelope.schema}). Update ZonneDak eerst.`,
    };
  }
  const saved = saveProject(envelope.customerName, envelope.data);
  if (!saved) {
    return { success: false, error: 'Opslaan in browser mislukt.' };
  }
  return { success: true, customerName: envelope.customerName };
}

/**
 * Controleer of een project bestaat — nuttig voor caller om te beslissen
 * of een import-actie moet overschrijven of niet.
 */
export function projectExists(customerName) {
  return loadProject(customerName) !== null;
}

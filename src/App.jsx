import { useState, useEffect, useRef, useCallback } from "react";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const DHM_WMS = "https://geoservices.informatievlaanderen.be/raadpleegdiensten/DHMVII/wms";

const SOLAR_TABLE = {
  "Z":  { 15:1010,30:1080,45:1100,60:1060,90:920 },
  "ZO": { 15:970, 30:1020,45:1020,60:975, 90:820 },
  "ZW": { 15:970, 30:1020,45:1020,60:975, 90:820 },
  "O":  { 15:890, 30:900, 45:870, 60:810, 90:650 },
  "W":  { 15:890, 30:900, 45:870, 60:810, 90:650 },
  "NO": { 15:820, 30:790, 45:740, 60:670, 90:490 },
  "NW": { 15:820, 30:790, 45:740, 60:670, 90:490 },
  "N":  { 15:760, 30:700, 45:630, 60:555, 90:370 },
};

function getSolarIrr(orientation, slope) {
  const t = SOLAR_TABLE[orientation] || SOLAR_TABLE["Z"];
  const s = [15,30,45,60,90].reduce((a,b) => Math.abs(b-slope)<Math.abs(a-slope)?b:a);
  return t[s];
}

// Zone kwaliteit per oriëntatie [zuidhelling, noordhelling]
const ZONE_QUALITY = {
  Z:  [{ c:"#22c55e", l:"Optimaal ☀️" }, { c:"#ef4444", l:"Ongeschikt ✗" }],
  N:  [{ c:"#ef4444", l:"Ongeschikt ✗" }, { c:"#22c55e", l:"Optimaal ☀️" }],
  ZO: [{ c:"#4ade80", l:"Goed ☀️" },     { c:"#f97316", l:"Matig" }],
  ZW: [{ c:"#4ade80", l:"Goed ☀️" },     { c:"#f97316", l:"Matig" }],
  O:  [{ c:"#f59e0b", l:"Matig" },       { c:"#f59e0b", l:"Matig" }],
  W:  [{ c:"#f59e0b", l:"Matig" },       { c:"#f59e0b", l:"Matig" }],
  NO: [{ c:"#f97316", l:"Matig" },       { c:"#4ade80", l:"Goed ☀️" }],
  NW: [{ c:"#f97316", l:"Matig" },       { c:"#4ade80", l:"Goed ☀️" }],
};

// Beste zone is zuidhelling voor Z/ZO/ZW/O/W, noordhelling voor N/NO/NW
const BEST_IS_SOUTH = { Z:true, ZO:true, ZW:true, O:true, W:true, N:false, NO:false, NW:false };

function getRoofDims(area) {
  const aspect = 1.6;
  const w = Math.sqrt(area * aspect);
  return { w, d: area / w };
}

const DEFAULT_PANELS = [
  { id:1, brand:"Jinko Solar",    model:"Tiger Neo N-Type 420W",   watt:420, area:1.722, eff:21.8, price:210, warranty:25 },
  { id:2, brand:"LONGi Solar",    model:"Hi-MO 6 Explorer 415W",   watt:415, area:1.722, eff:21.3, price:195, warranty:25 },
  { id:3, brand:"Canadian Solar", model:"HiHero 430W",             watt:430, area:1.879, eff:22.8, price:235, warranty:25 },
  { id:4, brand:"SunPower",       model:"Maxeon 6 420W",           watt:420, area:1.690, eff:22.8, price:420, warranty:40 },
  { id:5, brand:"Qcells",         model:"Q.PEAK DUO ML-G10 400W", watt:400, area:1.740, eff:20.6, price:185, warranty:25 },
];

const DEFAULT_INVERTERS = [
  { id:1, brand:"AlphaESS", model:"SMILE-G3-S3.6", fase:"1-fase", kw:3.68, mppt:2, maxPv:7400,  eff:97.1, price:1850, warranty:10, notes:"Ideaal voor energiezuinige woningen. Uitbreidbaar tot 60,5 kWh. IP65. Jabba-compatibel." },
  { id:2, brand:"AlphaESS", model:"SMILE-G3-S5",   fase:"1-fase", kw:5.0,  mppt:2, maxPv:10000, eff:97.3, price:2400, warranty:10, notes:"Populairste model voor gezinswoningen. 200% PV-oversizing. UPS backup. Fluvius-integratie." },
  { id:3, brand:"AlphaESS", model:"SMILE-G3-S8",   fase:"1-fase", kw:8.0,  mppt:2, maxPv:16000, eff:97.5, price:3100, warranty:10, notes:"Nieuwste 1-fase model met ingebouwd display. 8kW backup. Geschikt voor EV-laders." },
  { id:4, brand:"AlphaESS", model:"SMILE-G3-T4/6/8/10", fase:"3-fase", kw:10.0, mppt:3, maxPv:20000, eff:97.5, price:4200, warranty:10, notes:"Driefase hybride voor grote woningen. 3 MPPT, 150% overbelasting 30s. Max 45,6 kWh opslag." },
  { id:5, brand:"AlphaESS", model:"SMILE-G3-T15/20",    fase:"3-fase", kw:20.0, mppt:3, maxPv:40000, eff:97.6, price:6500, warranty:10, notes:"15-20kW driefase voor grote woningen of KMO. Hoog overlaadvermogen. 3 MPPT-ingangen." },
];

const DEFAULT_BATTERIES = [
  { id:1, brand:"AlphaESS", model:"BAT-G3-3.8S",               kwh:3.8,  price:1507, cycles:10000, warranty:10, dod:95, cRate:"1C", notes:"Seriesconfiguratie, indoor IP21. Stapelbaar tot 4× (15,2 kWh).", isAlpha:true },
  { id:2, brand:"AlphaESS", model:"BAT-G3-9.3S",               kwh:9.3,  price:3200, cycles:10000, warranty:10, dod:95, cRate:"1C", notes:"Hoogspanning seriesconfiguratie. IP65, outdoor. Verwarmingselement. Tot 4× (37,2 kWh).", isAlpha:true },
  { id:3, brand:"AlphaESS", model:"BAT-G3-10.1P",              kwh:10.1, price:3500, cycles:10000, warranty:10, dod:95, cRate:"1C", notes:"Parallelconfiguratie, tot 6× (60,5 kWh). Grote woningen & EV. Outdoor IP65.", isAlpha:true },
  { id:4, brand:"AlphaESS", model:"G3-S5 + 10.1 kWh (pakket)", kwh:10.1, price:6200, cycles:10000, warranty:10, dod:95, cRate:"1C", notes:"Complete omvormer + batterij set. SMILE-G3-S5 (5kW) + 1× BAT-G3-10.1P.", isAlpha:true },
  { id:5, brand:"AlphaESS", model:"G3-S5 + 20.2 kWh (pakket)", kwh:20.2, price:9400, cycles:10000, warranty:10, dod:95, cRate:"1C", notes:"SMILE-G3-S5 + 2× BAT-G3-10.1P. Voor grote verbruikers of EV-laden.", isAlpha:true },
  { id:6, brand:"Tesla",     model:"Powerwall 3",               kwh:13.5, price:8500, cycles:4000,  warranty:10, dod:100, notes:"Geïntegreerde omvormer. Volledig huis backup.", isAlpha:false },
  { id:7, brand:"SolarEdge", model:"Home Battery 10kWh",        kwh:10.0, price:6800, cycles:6000,  warranty:10, dod:100, notes:"Vereist SolarEdge omvormer. Modulair uitbreidbaar.", isAlpha:false },
  { id:8, brand:"BYD",       model:"Battery-Box HVS 10.2",      kwh:10.2, price:5200, cycles:8000,  warranty:10, dod:100, notes:"Hoogspanning modulaire opbouw. Compatibel met diverse omvormers.", isAlpha:false },
];

// ══════════════════════════════════════════════════════════════════════════════
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#0a0a0f;}
:root{
  --amber:#f5a623;--amber-glow:rgba(245,166,35,0.15);
  --bg:#0a0a0f;--bg2:#111118;--bg3:#1a1a24;--bg4:#20202e;
  --border:rgba(245,166,35,0.2);--text:#e8e8f0;--muted:#6b6b80;
  --green:#4ade80;--blue:#60a5fa;--red:#f87171;--purple:#c084fc;
  --alpha:#22d3ee;--alpha-glow:rgba(34,211,238,0.12);
}
.app{min-height:100vh;background:var(--bg);font-family:'IBM Plex Mono',monospace;color:var(--text);overflow-x:hidden;}
.header{padding:14px 22px;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:12px;position:relative;}
.header::after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--amber),transparent);}
.logo{width:32px;height:32px;background:var(--amber);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
.header-text h1{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;}
.header-text p{font-size:9px;color:var(--muted);margin-top:1px;letter-spacing:.5px;}
.badge{margin-left:auto;padding:3px 8px;border:1px solid var(--border);border-radius:4px;font-size:9px;color:var(--amber);letter-spacing:1px;text-transform:uppercase;white-space:nowrap;}
.tabs{display:flex;background:var(--bg2);border-bottom:1px solid var(--border);overflow-x:auto;}
.tab{padding:9px 14px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.5px;color:var(--muted);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap;flex-shrink:0;}
.tab.active{color:var(--amber);border-bottom-color:var(--amber);}
.tab:hover:not(.active){color:var(--text);}
.main{display:grid;grid-template-columns:340px 1fr;height:calc(100vh - 99px);}
.sidebar{background:var(--bg2);border-right:1px solid var(--border);padding:14px;display:flex;flex-direction:column;gap:13px;overflow-y:auto;}
.content-area{display:flex;flex-direction:column;overflow-y:auto;}
.sl{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--amber);margin-bottom:7px;display:flex;align-items:center;gap:8px;}
.sl::after{content:'';flex:1;height:1px;background:var(--border);}
.inp{width:100%;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:11px;outline:none;transition:border-color .2s;}
.inp:focus{border-color:var(--amber);box-shadow:0 0 0 2px var(--amber-glow);}
.inp::placeholder{color:var(--muted);}
.inp-label{font-size:9px;color:var(--muted);margin-bottom:3px;}
.inp-2{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
.inp-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;}
.sugg-wrap{position:relative;}
.sugg{position:absolute;top:calc(100% + 3px);left:0;right:0;background:var(--bg3);border:1px solid var(--border);border-radius:5px;z-index:200;max-height:160px;overflow-y:auto;}
.sugg-item{padding:8px 10px;font-size:10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);transition:background .15s;line-height:1.4;}
.sugg-item:hover{background:var(--amber-glow);color:var(--amber);}
.btn{padding:8px 13px;background:var(--amber);border:none;border-radius:5px;color:#000;font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:500;letter-spacing:.5px;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px;}
.btn:hover{background:#ffc04d;transform:translateY(-1px);}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none;}
.btn.sec{background:transparent;border:1px solid var(--border);color:var(--text);}
.btn.sec:hover{border-color:var(--amber);color:var(--amber);background:var(--amber-glow);}
.btn.danger{background:transparent;border:1px solid rgba(248,113,113,.3);color:var(--red);}
.btn.danger:hover{background:rgba(248,113,113,.1);border-color:var(--red);}
.btn.sm{padding:4px 8px;font-size:9px;}
.btn.blue{background:var(--blue);color:#000;}
.btn.blue:hover{background:#93c5fd;}
.btn.alpha{background:var(--alpha);color:#000;}
.btn.alpha:hover{background:#67e8f9;}
.btn.full{width:100%;}
.sl-item label{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:4px;}
.sl-item label span{color:var(--amber);}
.sl-item input[type=range]{width:100%;appearance:none;height:3px;background:var(--bg4);border-radius:2px;outline:none;cursor:pointer;}
.sl-item input[type=range]::-webkit-slider-thumb{appearance:none;width:12px;height:12px;background:var(--amber);border-radius:50%;cursor:pointer;}
.orient-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}
.orient-btn{padding:6px 3px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:9px;cursor:pointer;text-align:center;transition:all .15s;}
.orient-btn.active{background:var(--amber-glow);border-color:var(--amber);color:var(--amber);}
.card{background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:10px;cursor:pointer;transition:all .2s;position:relative;}
.card:hover{border-color:rgba(245,166,35,.5);}
.card.selected{border-color:var(--amber);background:rgba(245,166,35,.06);}
.card.selected::before{content:'✓';position:absolute;top:7px;right:9px;color:var(--amber);font-size:11px;font-weight:bold;}
.card.alpha-card{border-color:rgba(34,211,238,.25);}
.card.alpha-card:hover{border-color:rgba(34,211,238,.6);}
.card.alpha-card.selected{border-color:var(--alpha);background:var(--alpha-glow);}
.card.alpha-card.selected::before{color:var(--alpha);}
.card.batt-card.selected{border-color:var(--blue);background:rgba(96,165,250,.06);}
.card.batt-card.selected::before{color:var(--blue);}
.card-name{font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:2px;}
.card-brand{font-size:9px;color:var(--muted);margin-bottom:6px;}
.card-notes{font-size:9px;color:var(--muted);margin-top:5px;line-height:1.5;border-top:1px solid rgba(255,255,255,.05);padding-top:5px;}
.chips{display:flex;gap:5px;flex-wrap:wrap;}
.chip{font-size:9px;color:var(--text);background:var(--bg4);padding:2px 6px;border-radius:3px;}
.chip.gold{color:var(--amber);}
.chip.alpha-c{color:var(--alpha);}
.chip.blue-c{color:var(--blue);}
.alpha-badge{display:inline-flex;align-items:center;gap:4px;font-size:8px;color:var(--alpha);background:var(--alpha-glow);border:1px solid rgba(34,211,238,.3);border-radius:3px;padding:1px 5px;margin-bottom:4px;}
.toggle-row{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;}
.toggle-lbl{font-size:10px;color:var(--text);}
.toggle{position:relative;width:36px;height:19px;flex-shrink:0;}
.toggle input{opacity:0;width:0;height:0;}
.tslider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--bg4);border-radius:10px;transition:.3s;}
.tslider:before{content:'';position:absolute;width:13px;height:13px;left:3px;bottom:3px;background:var(--muted);border-radius:50%;transition:.3s;}
.toggle input:checked + .tslider{background:var(--blue);}
.toggle input:checked + .tslider:before{transform:translateX(17px);background:#fff;}
.pce{background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:10px;}
.pce-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;}
.pce-title{font-size:10px;color:var(--text);}
.pce-reset{font-size:9px;color:var(--muted);cursor:pointer;text-decoration:underline;}
.pce-controls{display:flex;align-items:center;gap:10px;}
.pce-btn{width:28px;height:28px;background:var(--bg4);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;}
.pce-btn:hover{border-color:var(--amber);color:var(--amber);}
.pce-val{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--amber);min-width:44px;text-align:center;}
.pce-sub{font-size:9px;color:var(--muted);text-align:center;}
.divider{height:1px;background:var(--border);flex-shrink:0;}
.info-box{font-size:9px;color:var(--muted);line-height:1.7;padding:7px 10px;background:rgba(245,166,35,.04);border:1px solid var(--border);border-radius:5px;}
.info-box strong{color:var(--amber);}
.info-box.alpha-info{background:var(--alpha-glow);border-color:rgba(34,211,238,.3);}
.info-box.alpha-info strong{color:var(--alpha);}
.coord-row{display:flex;gap:12px;padding:6px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;font-size:9px;color:var(--amber);}
.coord-row span{color:var(--muted);}
.rc{background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:11px;position:relative;overflow:hidden;}
.rc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--amber);}
.rc.green::before{background:var(--green);}
.rc.blue::before{background:var(--blue);}
.rc.alpha-rc::before{background:var(--alpha);}
.rc-label{font-size:8px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;}
.rc-num{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--amber);line-height:1;}
.rc.green .rc-num{color:var(--green);}
.rc.blue .rc-num{color:var(--blue);}
.rc.alpha-rc .rc-num{color:var(--alpha);}
.rc-unit{font-size:9px;color:var(--muted);margin-top:2px;}
.results-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:11px;}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:11px;}
.compare-col{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;}
.compare-col h4{font-family:'Syne',sans-serif;font-size:11px;font-weight:700;margin-bottom:7px;color:var(--amber);}
.compare-col.batt h4{color:var(--blue);}
.compare-col.alpha-col h4{color:var(--alpha);}
.crow{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:4px;}
.crow span{color:var(--text);}
.ctotal{margin-top:7px;padding-top:7px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:baseline;font-size:10px;}
.cval{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:var(--amber);}
.compare-col.batt .cval{color:var(--blue);}
.compare-col.alpha-col .cval{color:var(--alpha);}
.pbar{height:5px;background:var(--bg4);border-radius:3px;overflow:hidden;margin-top:6px;}
.pfill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--green),var(--amber));transition:width .8s ease;}
.ai-box{background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:13px;font-size:11px;line-height:1.8;color:var(--text);white-space:pre-wrap;}
.ai-box.loading{display:flex;align-items:center;gap:10px;color:var(--muted);}
.spinner{width:12px;height:12px;border:2px solid var(--border);border-top-color:var(--amber);border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0;}
@keyframes spin{to{transform:rotate(360deg);}}
.map-area{flex:1;position:relative;min-height:0;}
#leaflet-map{width:100%;height:100%;}
.map-btns{position:absolute;top:10px;right:10px;z-index:999;display:flex;flex-direction:column;gap:5px;}
.map-btn{padding:6px 10px;background:rgba(10,10,15,.92);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:9px;cursor:pointer;backdrop-filter:blur(8px);transition:all .15s;white-space:nowrap;}
.map-btn.active{border-color:var(--amber);color:var(--amber);}
.map-legend{position:absolute;bottom:30px;left:10px;z-index:999;background:rgba(10,10,15,.92);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:'IBM Plex Mono',monospace;font-size:9px;backdrop-filter:blur(8px);}
.map-legend-title{color:var(--amber);font-weight:600;margin-bottom:5px;letter-spacing:1px;text-transform:uppercase;}
.map-legend-row{display:flex;align-items:center;gap:6px;color:var(--muted);margin-bottom:3px;}
.map-legend-dot{width:10px;height:10px;border-radius:2px;flex-shrink:0;}
.leaflet-container{background:#0a0a0f!important;}
.leaflet-control-zoom a{background:var(--bg2)!important;color:var(--text)!important;border-color:var(--border)!important;}
.leaflet-control-attribution{background:rgba(10,10,15,.8)!important;color:var(--muted)!important;font-size:8px!important;}
.section{padding:14px 18px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;}
.list{display:flex;flex-direction:column;gap:7px;}
.new-form{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;}
.new-form h4{font-family:'Syne',sans-serif;font-size:11px;font-weight:700;}
.results-wrap{padding:14px 18px;display:flex;flex-direction:column;gap:11px;}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:50px 20px;gap:10px;color:var(--muted);text-align:center;}
.empty-state .icon{font-size:32px;}
.empty-state p{font-size:11px;max-width:260px;line-height:1.6;}
.filter-row{display:flex;gap:6px;flex-wrap:wrap;}
.filter-btn{padding:4px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--muted);cursor:pointer;transition:all .15s;}
.filter-btn.active{border-color:var(--alpha);color:var(--alpha);background:var(--alpha-glow);}
.filter-btn.amber-f.active{border-color:var(--amber);color:var(--amber);background:var(--amber-glow);}
.inv-card{background:var(--bg3);border:1px solid rgba(34,211,238,.2);border-radius:7px;padding:10px;cursor:pointer;transition:all .2s;position:relative;}
.inv-card:hover{border-color:rgba(34,211,238,.6);}
.inv-card.selected{border-color:var(--alpha);background:var(--alpha-glow);}
.inv-card.selected::before{content:'✓';position:absolute;top:7px;right:9px;color:var(--alpha);font-size:11px;font-weight:bold;}
`;

// ── Sub-components ─────────────────────────────────────────────────────────────
function PanelCard({ p, selected, onSelect, onDelete, canDelete }) {
  return (
    <div className={`card ${selected?"selected":""}`} onClick={() => onSelect(p.id)}>
      <div className="card-name">{p.model}</div>
      <div className="card-brand">{p.brand}</div>
      <div className="chips">
        <span className="chip gold">{p.watt}W</span>
        <span className="chip">{p.eff}% eff</span>
        <span className="chip">{p.area} m²</span>
        <span className="chip">€{p.price}/st</span>
        <span className="chip">{p.warranty}j gar.</span>
      </div>
      {canDelete && <button className="btn danger sm" style={{marginTop:6,width:"fit-content"}}
        onClick={e=>{e.stopPropagation();onDelete(p.id);}}>✕ Verwijder</button>}
    </div>
  );
}

function InverterCard({ inv, selected, onSelect }) {
  return (
    <div className={`inv-card ${selected?"selected":""}`} onClick={() => onSelect(inv.id)}>
      <div className="alpha-badge">⚡ AlphaESS G3</div>
      <div className="card-name">{inv.model}</div>
      <div className="card-brand">{inv.brand} · {inv.fase}</div>
      <div className="chips">
        <span className="chip alpha-c">{inv.kw} kW</span>
        <span className="chip">{inv.mppt} MPPT</span>
        <span className="chip">max {inv.maxPv/1000}kWp</span>
        <span className="chip">{inv.eff}% eff</span>
        <span className="chip">€{inv.price.toLocaleString()}</span>
        <span className="chip">{inv.warranty}j gar.</span>
      </div>
      <div className="card-notes">{inv.notes}</div>
    </div>
  );
}

function BattCard({ b, selected, onSelect, onDelete, canDelete }) {
  return (
    <div className={`card batt-card ${b.isAlpha?"alpha-card":""} ${selected?"selected":""}`}
      onClick={() => onSelect(b.id)}>
      {b.isAlpha && <div className="alpha-badge">🔋 AlphaESS G3</div>}
      <div className="card-name">{b.model}</div>
      <div className="card-brand">{b.brand}</div>
      <div className="chips">
        <span className={`chip ${b.isAlpha?"alpha-c":"blue-c"}`}>{b.kwh} kWh</span>
        <span className="chip">€{b.price.toLocaleString()}</span>
        <span className="chip">{b.cycles.toLocaleString()} cycli</span>
        {b.dod && <span className="chip">{b.dod}% DoD</span>}
        <span className="chip">{b.warranty}j gar.</span>
      </div>
      {b.notes && <div className="card-notes">{b.notes}</div>}
      {canDelete && <button className="btn danger sm" style={{marginTop:6,width:"fit-content"}}
        onClick={e=>{e.stopPropagation();onDelete(b.id);}}>✕ Verwijder</button>}
    </div>
  );
}

function NewPanelForm({ onAdd }) {
  const e0={brand:"",model:"",watt:"",area:"",eff:"",price:"",warranty:"25"};
  const [f,setF]=useState(e0); const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const ok=f.brand&&f.model&&+f.watt>0&&+f.area>0&&+f.eff>0&&+f.price>0;
  return (
    <div className="new-form"><h4>➕ Nieuw paneel</h4>
      <div className="inp-2">
        <div><div className="inp-label">Merk</div><input className="inp" placeholder="Jinko" value={f.brand} onChange={e=>s("brand",e.target.value)}/></div>
        <div><div className="inp-label">Model</div><input className="inp" placeholder="Tiger 420W" value={f.model} onChange={e=>s("model",e.target.value)}/></div>
      </div>
      <div className="inp-3">
        <div><div className="inp-label">Watt</div><input className="inp" type="number" placeholder="420" value={f.watt} onChange={e=>s("watt",e.target.value)}/></div>
        <div><div className="inp-label">m²</div><input className="inp" type="number" placeholder="1.72" value={f.area} onChange={e=>s("area",e.target.value)}/></div>
        <div><div className="inp-label">Eff %</div><input className="inp" type="number" placeholder="21.5" value={f.eff} onChange={e=>s("eff",e.target.value)}/></div>
      </div>
      <div className="inp-2">
        <div><div className="inp-label">€/st</div><input className="inp" type="number" placeholder="210" value={f.price} onChange={e=>s("price",e.target.value)}/></div>
        <div><div className="inp-label">Garantie (j)</div><input className="inp" type="number" placeholder="25" value={f.warranty} onChange={e=>s("warranty",e.target.value)}/></div>
      </div>
      <button className="btn full" disabled={!ok}
        onClick={()=>{onAdd({...f,id:Date.now(),watt:+f.watt,area:+f.area,eff:+f.eff,price:+f.price,warranty:+f.warranty});setF(e0);}}>
        Toevoegen
      </button>
    </div>
  );
}

function NewBattForm({ onAdd }) {
  const e0={brand:"",model:"",kwh:"",price:"",cycles:"",warranty:"10"};
  const [f,setF]=useState(e0); const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const ok=f.brand&&f.model&&+f.kwh>0&&+f.price>0&&+f.cycles>0;
  return (
    <div className="new-form"><h4>➕ Nieuwe batterij</h4>
      <div className="inp-2">
        <div><div className="inp-label">Merk</div><input className="inp" placeholder="Tesla" value={f.brand} onChange={e=>s("brand",e.target.value)}/></div>
        <div><div className="inp-label">Model</div><input className="inp" placeholder="Powerwall 3" value={f.model} onChange={e=>s("model",e.target.value)}/></div>
      </div>
      <div className="inp-3">
        <div><div className="inp-label">kWh</div><input className="inp" type="number" placeholder="10" value={f.kwh} onChange={e=>s("kwh",e.target.value)}/></div>
        <div><div className="inp-label">Prijs €</div><input className="inp" type="number" placeholder="5500" value={f.price} onChange={e=>s("price",e.target.value)}/></div>
        <div><div className="inp-label">Cycli</div><input className="inp" type="number" placeholder="6000" value={f.cycles} onChange={e=>s("cycles",e.target.value)}/></div>
      </div>
      <div style={{maxWidth:140}}><div className="inp-label">Garantie (j)</div>
        <input className="inp" type="number" placeholder="10" value={f.warranty} onChange={e=>s("warranty",e.target.value)}/></div>
      <button className="btn blue full" disabled={!ok}
        onClick={()=>{onAdd({...f,id:Date.now(),kwh:+f.kwh,price:+f.price,cycles:+f.cycles,warranty:+f.warranty,isAlpha:false});setF(e0);}}>
        Toevoegen
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAP HELPERS – dakvisualisatie & panelenplaatsing
// ══════════════════════════════════════════════════════════════════════════════

function mPerDeg(lat) {
  return { mLat: 111320, mLng: 111320 * Math.cos(lat * Math.PI / 180) };
}

function drawRoofPotential(map, L, coords, roofArea, orientation) {
  const { lat, lng } = coords;
  const { mLat, mLng } = mPerDeg(lat);
  const { w, d } = getRoofDims(roofArea);

  const dLat = (d / 2) / mLat;
  const dLng = (w / 2) / mLng;

  const zq = ZONE_QUALITY[orientation] || ZONE_QUALITY.Z;
  const [southQ, northQ] = zq;

  const group = L.layerGroup();

  // Zuid-helling (lat - dLat tot lat)
  L.polygon([
    [lat, lng - dLng], [lat, lng + dLng],
    [lat - dLat, lng + dLng], [lat - dLat, lng - dLng]
  ], { color: southQ.c, fillColor: southQ.c, fillOpacity: 0.32, weight: 1.5, opacity: 0.7 })
  .bindTooltip(`<b>Zuid-helling</b><br>${southQ.l}`, { sticky: true, className: "roof-tooltip" })
  .addTo(group);

  // Noord-helling (lat tot lat + dLat)
  L.polygon([
    [lat + dLat, lng - dLng], [lat + dLat, lng + dLng],
    [lat, lng + dLng], [lat, lng - dLng]
  ], { color: northQ.c, fillColor: northQ.c, fillOpacity: 0.32, weight: 1.5, opacity: 0.7 })
  .bindTooltip(`<b>Noord-helling</b><br>${northQ.l}`, { sticky: true, className: "roof-tooltip" })
  .addTo(group);

  // Dakrand omtrek
  L.polygon([
    [lat + dLat, lng - dLng], [lat + dLat, lng + dLng],
    [lat - dLat, lng + dLng], [lat - dLat, lng - dLng]
  ], { color: "#f5a623", fillOpacity: 0, weight: 2.5, dashArray: "6,3", opacity: 1 }).addTo(group);

  // Nokrand (midden)
  L.polyline([[lat, lng - dLng], [lat, lng + dLng]], {
    color: "#f5a623", weight: 2, opacity: 0.9
  }).addTo(group);

  // Labels op de hellingen
  const mkLabel = (labelLat, labelLng, text, color) =>
    L.marker([labelLat, labelLng], { icon: L.divIcon({
      html: `<div style="background:rgba(10,10,15,.85);color:${color};padding:3px 8px;border-radius:4px;font-size:10px;font-family:'IBM Plex Mono',monospace;white-space:nowrap;border:1px solid ${color}55;pointer-events:none">${text}</div>`,
      className: "", iconAnchor: [60, 8]
    }) });

  mkLabel(lat - dLat * 0.55, lng, `${southQ.l} – Zonnepotentieel`, southQ.c).addTo(group);
  mkLabel(lat + dLat * 0.55, lng, `${northQ.l}`, northQ.c).addTo(group);

  // Dimensie-label
  mkLabel(lat - dLat, lng + dLng + 0.00003, `${roofArea} m²  /  ${w.toFixed(0)}×${d.toFixed(0)} m`, "#f5a623").addTo(group);

  group.addTo(map);
  return group;
}

function drawPanelGrid(map, L, coords, panelCount, panel, roofArea, orientation) {
  const { lat, lng } = coords;
  const { mLat, mLng } = mPerDeg(lat);
  const { w, d } = getRoofDims(roofArea);

  // Paneel dimensies (portrait): ~1.13m breed × 1.52m hoog voor 1.722m²
  const ratio = 1.338;
  const panelW = Math.sqrt(panel.area / ratio);
  const panelH = panel.area / panelW;

  // Marge rondom dakrand
  const margin = 0.4;
  const usableW = w - 2 * margin;
  const halfD = d / 2;
  const usableD = halfD - 2 * margin;

  const cols = Math.max(1, Math.floor(usableW / panelW));
  const rows = Math.max(1, Math.floor(usableD / panelH));

  // Beste helling bepalen
  const goodSouth = BEST_IS_SOUTH[orientation] !== undefined ? BEST_IS_SOUTH[orientation] : true;

  // Grid startpunt (linksonder van het rooster op de goede helling)
  const roofDLat = (d / 2) / mLat;
  const roofDLng = (w / 2) / mLng;
  const marginLat = margin / mLat;
  const marginLng = margin / mLng;

  // Goede helling: south = van lat-roofDLat omhoog; north = van lat opwaarts
  const gridBot = goodSouth
    ? lat - roofDLat + marginLat
    : lat + marginLat;
  const gridLeft = lng - roofDLng + marginLng;

  const pw = panelW / mLng;
  const ph = panelH / mLat;

  const panelGroup = L.layerGroup();
  let placed = 0;

  for (let r = 0; r < rows && placed < panelCount; r++) {
    for (let c = 0; c < cols && placed < panelCount; c++) {
      const pLat = gridBot + r * ph;
      const pLng = gridLeft + c * pw;

      // Panel rechthoek (blauw)
      L.polygon([
        [pLat, pLng], [pLat + ph, pLng],
        [pLat + ph, pLng + pw], [pLat, pLng + pw]
      ], {
        color: "#0f172a", weight: 1, opacity: 1,
        fillColor: "#1d4ed8", fillOpacity: 0.88,
      })
      .bindTooltip(`Paneel ${placed + 1}<br>${panel.brand}<br>${panel.watt}W`, { direction: "top", sticky: false })
      .addTo(panelGroup);

      // Cel-lijn horizontaal midden
      L.polyline([[pLat + ph * 0.5, pLng], [pLat + ph * 0.5, pLng + pw]], {
        color: "#3b82f6", weight: 0.5, opacity: 0.6
      }).addTo(panelGroup);

      placed++;
    }
  }

  // Samenvatting label
  const kWp = ((placed * panel.watt) / 1000).toFixed(1);
  L.marker([goodSouth ? gridBot - ph : gridBot + rows * ph + ph, lng], {
    icon: L.divIcon({
      html: `<div style="background:rgba(10,10,15,.92);color:#60a5fa;padding:4px 10px;border-radius:5px;font-size:10px;font-family:'IBM Plex Mono',monospace;border:1px solid #3b82f6;white-space:nowrap">🔵 ${placed} panelen · ${kWp} kWp · ${panel.brand}</div>`,
      className: "", iconAnchor: [80, 4]
    })
  }).addTo(panelGroup);

  panelGroup.addTo(map);
  return panelGroup;
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("configuratie");
  const [query, setQuery] = useState(""); const [suggs, setSuggs] = useState([]);
  const [coords, setCoords] = useState(null); const [displayName, setDisplayName] = useState("");
  const [slope, setSlope] = useState(35); const [orientation, setOrientation] = useState("Z");
  const [roofArea, setRoofArea] = useState(80); const [activeLayer, setActiveLayer] = useState("dsm");
  const [mapReady, setMapReady] = useState(false);
  const leafRef = useRef(null); const markerRef = useRef(null);
  const dhmRef = useRef(null); const searchTO = useRef(null);
  const roofLayerRef = useRef(null); const panelLayerRef = useRef(null);

  const [panels, setPanels] = useState(DEFAULT_PANELS);
  const [selPanelId, setSelPanelId] = useState(1);
  const selPanel = panels.find(p => p.id === selPanelId) || panels[0];

  const [inverters] = useState(DEFAULT_INVERTERS);
  const [selInvId, setSelInvId] = useState(null);
  const selInv = inverters.find(i => i.id === selInvId) || null;
  const [invFilter, setInvFilter] = useState("alle");

  const autoPanels = selPanel ? Math.floor((roofArea * 0.75) / selPanel.area) : 0;
  const [customCount, setCustomCount] = useState(null);
  const panelCount = customCount !== null ? customCount : autoPanels;

  const [batteries, setBatteries] = useState(DEFAULT_BATTERIES);
  const [battEnabled, setBattEnabled] = useState(false);
  const [selBattId, setSelBattId] = useState(4);
  const selBatt = batteries.find(b => b.id === selBattId) || batteries[0];
  const [battFilter, setBattFilter] = useState("alle");

  const [results, setResults] = useState(null);
  const [aiText, setAiText] = useState(""); const [aiLoading, setAiLoading] = useState(false);
  const [panelsDrawn, setPanelsDrawn] = useState(false);

  useEffect(() => { if (customCount !== null && customCount > autoPanels) setCustomCount(autoPanels); }, [autoPanels]);

  // Herteken dakpotentieel wanneer params veranderen
  const redrawRoof = useCallback(() => {
    if (!leafRef.current || !coords || !window.L) return;
    const L = window.L, map = leafRef.current;
    if (roofLayerRef.current) { map.removeLayer(roofLayerRef.current); roofLayerRef.current = null; }
    if (panelLayerRef.current) { map.removeLayer(panelLayerRef.current); panelLayerRef.current = null; setPanelsDrawn(false); }
    roofLayerRef.current = drawRoofPotential(map, L, coords, roofArea, orientation);
  }, [coords, roofArea, orientation]);

  useEffect(() => { if (mapReady && coords) redrawRoof(); }, [mapReady, coords, roofArea, orientation, slope]);

  // Herteken panelen wanneer panelCount of paneel verandert (na berekening)
  useEffect(() => {
    if (!panelsDrawn || !coords || !selPanel || !leafRef.current || !window.L) return;
    const L = window.L, map = leafRef.current;
    if (panelLayerRef.current) { map.removeLayer(panelLayerRef.current); panelLayerRef.current = null; }
    panelLayerRef.current = drawPanelGrid(map, L, coords, panelCount, selPanel, roofArea, orientation);
  }, [panelCount, selPanel, panelsDrawn]);

  // Leaflet init
  useEffect(() => {
    const lnk = document.createElement("link"); lnk.rel = "stylesheet";
    lnk.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(lnk);
    const scr = document.createElement("script");
    scr.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    scr.onload = () => setMapReady(true); document.head.appendChild(scr);
  }, []);

  useEffect(() => {
    if (!mapReady || leafRef.current) return;
    const L = window.L, map = L.map("leaflet-map", { center: [50.85, 4.35], zoom: 8 });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OSM © CARTO", maxZoom: 20 }).addTo(map);
    leafRef.current = map;
  }, [mapReady]);

  useEffect(() => {
    if (!leafRef.current || !mapReady) return;
    const L = window.L, map = leafRef.current;
    if (dhmRef.current) map.removeLayer(dhmRef.current);
    const lyr = L.tileLayer.wms(DHM_WMS, {
      layers: activeLayer === "dsm" ? "DHMVII_DSM_1m" : "DHMVII_DTM_1m",
      format: "image/png", transparent: true, opacity: 0.65,
      attribution: "© Digitaal Vlaanderen", version: "1.3.0"
    }); lyr.addTo(map); dhmRef.current = lyr;
  }, [activeLayer, mapReady]);

  useEffect(() => {
    if (!query || query.length < 3) { setSuggs([]); return; }
    clearTimeout(searchTO.current);
    searchTO.current = setTimeout(async () => {
      try { const r = await fetch(`${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=be`); setSuggs(await r.json()); } catch {}
    }, 350);
  }, [query]);

  const selectAddr = item => {
    setQuery(item.display_name.split(",").slice(0, 2).join(","));
    const lat = parseFloat(item.lat), lng = parseFloat(item.lon);
    setCoords({ lat, lng }); setDisplayName(item.display_name); setSuggs([]);
    setPanelsDrawn(false);
    if (leafRef.current && mapReady) {
      const L = window.L, map = leafRef.current;
      map.setView([lat, lng], 18);
      if (markerRef.current) map.removeLayer(markerRef.current);
      const icon = L.divIcon({
        html: `<div style="width:12px;height:12px;background:#f5a623;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px #f5a623"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6], className: ""
      }); markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
    }
  };

  const calculate = async () => {
    if (!coords || !selPanel) return;
    const irr = getSolarIrr(orientation, slope);
    const actualArea = panelCount * selPanel.area;
    const annualKwh = Math.round(actualArea * irr * (selPanel.eff / 100));
    const co2 = Math.round(annualKwh * 0.202);
    const coverage = Math.round((annualKwh / 3500) * 100);
    const investPanels = Math.round(panelCount * selPanel.price + (selInv ? selInv.price : 1200));
    const annualBase = Math.round(annualKwh * 0.28);
    const paybackBase = Math.round(investPanels / annualBase);

    let battResult = null;
    if (battEnabled && selBatt) {
      const extra = Math.min(annualKwh * 0.70, annualKwh) - annualKwh * 0.30;
      const extraSav = Math.round(extra * 0.28);
      const totSav = annualBase + extraSav;
      const totInv = investPanels + selBatt.price;
      battResult = { extraSav, totSav, totInv, payback: Math.round(totInv / totSav), kwh: selBatt.kwh, price: selBatt.price };
    }

    setResults({ irr, panelCount, actualArea: Math.round(actualArea), annualKwh, co2, coverage,
      investPanels, annualBase, paybackBase, battResult, panel: selPanel, inv: selInv, batt: battEnabled ? selBatt : null });

    // Teken panelen op dak
    if (leafRef.current && window.L) {
      const L = window.L, map = leafRef.current;
      if (panelLayerRef.current) { map.removeLayer(panelLayerRef.current); panelLayerRef.current = null; }
      panelLayerRef.current = drawPanelGrid(map, L, coords, panelCount, selPanel, roofArea, orientation);
      setPanelsDrawn(true);
    }

    setActiveTab("resultaten");
    setAiLoading(true); setAiText("");

    try {
      const invStr = selInv ? `\nOmvormer: ${selInv.brand} ${selInv.model} (${selInv.kw}kW, ${selInv.fase}, €${selInv.price})` : "Geen AlphaESS omvormer geselecteerd.";
      const battStr = battResult
        ? `\nBatterij: ${selBatt.brand} ${selBatt.model} (${selBatt.kwh}kWh, €${selBatt.price})\n- Extra besparing: €${battResult.extraSav}/j · Totaal: €${battResult.totSav}/j\n- Investering totaal: €${battResult.totInv.toLocaleString()} · Terugverdien: ${battResult.payback}j`
        : "Geen batterij.";
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content:
            `Zonne-energie expert Vlaanderen. Beknopt professioneel advies in het Nederlands:\n\nLocatie: ${displayName}\nDHM Vlaanderen II (LiDAR)\nPaneel: ${selPanel.brand} ${selPanel.model} (${selPanel.watt}W, ${selPanel.eff}%)\nAantal: ${panelCount} · ${Math.round(actualArea)} m² · ${((panelCount*selPanel.watt)/1000).toFixed(1)} kWp\nHelling: ${slope}° ${orientation} · ${irr} kWh/m²/j\n${invStr}\nOpbrengst: ${annualKwh} kWh/j · CO₂: ${co2} kg/j\nInvestering: €${investPanels.toLocaleString()} · Besparing: €${annualBase}/j · Terugverdien: ${paybackBase}j\n${battStr}\n\nMax 180 woorden over:\n1. Kwaliteit dak & keuze\n2. AlphaESS G3 synergie (indien van toepassing)\n3. Rentabiliteit & Vlaamse premies (capaciteitstarief, BTW 6%, REG-premie)` }]
        })
      });
      const d = await resp.json();
      setAiText(d.content?.find(b => b.type === "text")?.text || "Analyse niet beschikbaar.");
    } catch { setAiText("Analyse tijdelijk niet beschikbaar."); }
    setAiLoading(false);
  };

  const filteredInv = invFilter === "alle" ? inverters : inverters.filter(i => i.fase === invFilter);
  const filteredBatt = battFilter === "alle" ? batteries : battFilter === "alpha" ? batteries.filter(b => b.isAlpha) : batteries.filter(b => !b.isAlpha);

  const TABS = [
    { k: "configuratie", l: "01 Configuratie" }, { k: "panelen", l: "02 Panelen" },
    { k: "omvormers", l: "03 AlphaESS Omvormers" }, { k: "batterij", l: "04 Batterij" },
    { k: "resultaten", l: "05 Resultaten" }
  ];

  const zq = ZONE_QUALITY[orientation] || ZONE_QUALITY.Z;

  return (
    <>
      <style>{STYLES}</style>
      <div className="app">
        <header className="header">
          <div className="logo">☀️</div>
          <div className="header-text">
            <h1>ZonneDak Analyzer</h1>
            <p>DHM Vlaanderen II · AlphaESS G3 · Dakpotentieel & panelenplaatsing</p>
          </div>
          <div className="badge">DHMV II</div>
        </header>

        <div className="tabs">
          {TABS.map(t => (
            <button key={t.k} className={`tab ${activeTab === t.k ? "active" : ""}`} onClick={() => setActiveTab(t.k)}>{t.l}</button>
          ))}
        </div>

        <div className="main">
          {/* ── Sidebar ── */}
          <aside className="sidebar">
            <div>
              <div className="sl">Locatie</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="sugg-wrap">
                  <input className="inp" placeholder="Adres in Vlaanderen..." value={query} onChange={e => setQuery(e.target.value)} />
                  {suggs.length > 0 && <div className="sugg">{suggs.map((s, i) => <div key={i} className="sugg-item" onClick={() => selectAddr(s)}>{s.display_name}</div>)}</div>}
                </div>
                {coords && <div className="coord-row"><div><span>LAT </span>{coords.lat.toFixed(5)}</div><div><span>LNG </span>{coords.lng.toFixed(5)}</div></div>}
              </div>
            </div>
            <div className="divider" />
            <div>
              <div className="sl">Dakparameters</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="sl-item"><label>Dakoppervlak <span>{roofArea} m²</span></label><input type="range" min="20" max="300" value={roofArea} onChange={e => setRoofArea(+e.target.value)} /></div>
                <div className="sl-item"><label>Hellingshoek <span>{slope}°</span></label><input type="range" min="5" max="90" value={slope} onChange={e => setSlope(+e.target.value)} /></div>
              </div>
            </div>
            <div>
              <div className="sl">Oriëntatie</div>
              <div className="orient-grid">
                {["N","NO","O","ZO","Z","ZW","W","NW"].map(o => (
                  <button key={o} className={`orient-btn ${orientation === o ? "active" : ""}`} onClick={() => setOrientation(o)}>{o}</button>
                ))}
              </div>
              {coords && (
                <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                  <div style={{ flex: 1, padding: "5px 8px", background: `${zq[0].c}22`, border: `1px solid ${zq[0].c}55`, borderRadius: 4, fontSize: 9, color: zq[0].c }}>
                    Z-helling: {zq[0].l}
                  </div>
                  <div style={{ flex: 1, padding: "5px 8px", background: `${zq[1].c}22`, border: `1px solid ${zq[1].c}55`, borderRadius: 4, fontSize: 9, color: zq[1].c }}>
                    N-helling: {zq[1].l}
                  </div>
                </div>
              )}
            </div>
            <div className="divider" />
            <div>
              <div className="sl">Geselecteerd paneel</div>
              <div className="card selected" style={{ cursor: "default" }}>
                <div className="card-name">{selPanel?.model}</div>
                <div className="card-brand">{selPanel?.brand}</div>
                <div className="chips"><span className="chip gold">{selPanel?.watt}W</span><span className="chip">{selPanel?.eff}% eff</span><span className="chip">€{selPanel?.price}/st</span></div>
              </div>
              <button className="btn sec full" style={{ marginTop: 6 }} onClick={() => setActiveTab("panelen")}>Paneel wijzigen →</button>
            </div>
            <div>
              <div className="sl">AlphaESS Omvormer</div>
              {selInv ? (
                <div className="inv-card selected" style={{ cursor: "default" }}>
                  <div className="alpha-badge">⚡ AlphaESS G3</div>
                  <div className="card-name">{selInv.model}</div>
                  <div className="chips"><span className="chip alpha-c">{selInv.kw}kW</span><span className="chip">€{selInv.price.toLocaleString()}</span></div>
                </div>
              ) : (
                <div className="info-box" style={{ fontSize: 9 }}>Geen omvormer geselecteerd.<br />Forfait €1.200 installatie wordt gebruikt.</div>
              )}
              <button className="btn alpha full" style={{ marginTop: 6 }} onClick={() => setActiveTab("omvormers")}>
                {selInv ? "Omvormer wijzigen →" : "AlphaESS omvormer kiezen →"}
              </button>
            </div>
            <div>
              <div className="sl">Aantal panelen</div>
              <div className="pce">
                <div className="pce-top">
                  <span className="pce-title">Klant keuze</span>
                  <span className="pce-reset" onClick={() => setCustomCount(null)}>{customCount !== null ? `↩ Reset (max: ${autoPanels})` : `Auto: ${autoPanels}`}</span>
                </div>
                <div className="pce-controls">
                  <button className="pce-btn" onClick={() => setCustomCount(Math.max(1, (customCount ?? autoPanels) - 1))}>−</button>
                  <div><div className="pce-val">{panelCount}</div><div className="pce-sub">{((panelCount * (selPanel?.watt || 400)) / 1000).toFixed(1)} kWp</div></div>
                  <button className="pce-btn" onClick={() => setCustomCount(Math.min(autoPanels + 10, (customCount ?? autoPanels) + 1))}>+</button>
                </div>
              </div>
            </div>
            <div>
              <div className="sl">Thuisbatterij</div>
              <div className="toggle-row" style={{ marginBottom: 6 }}>
                <span className="toggle-lbl">{battEnabled ? `🔋 ${selBatt?.brand} ${selBatt?.model}` : "Geen batterij"}</span>
                <label className="toggle"><input type="checkbox" checked={battEnabled} onChange={e => setBattEnabled(e.target.checked)} /><span className="tslider" /></label>
              </div>
              {battEnabled && <button className="btn blue full" onClick={() => setActiveTab("batterij")}>Batterij wijzigen →</button>}
            </div>
            <div className="divider" />
            <button className="btn full" onClick={calculate} disabled={!coords || aiLoading}>
              {aiLoading ? <><div className="spinner" />Analyseren...</> : "☀️ Bereken & toon panelen op dak"}
            </button>
            <div className="info-box">
              <strong>📡 DHM Vlaanderen II</strong><br />LiDAR 2013–2015 · 1m resolutie<br />
              DSM + DTM · Gratis open data · © Agentschap Digitaal Vlaanderen
            </div>
          </aside>

          {/* ── Content ── */}
          <div className="content-area">

            {/* CONFIGURATIE = KAART */}
            {activeTab === "configuratie" && (
              <div className="map-area">
                <div id="leaflet-map" style={{ height: "100%" }} />
                <div className="map-btns">
                  <button className={`map-btn ${activeLayer === "dsm" ? "active" : ""}`} onClick={() => setActiveLayer("dsm")}>DSM — Oppervlaktemodel</button>
                  <button className={`map-btn ${activeLayer === "dtm" ? "active" : ""}`} onClick={() => setActiveLayer("dtm")}>DTM — Terreinmodel</button>
                </div>
                {coords && (
                  <div className="map-legend">
                    <div className="map-legend-title">Dakpotentieel</div>
                    <div className="map-legend-row"><div className="map-legend-dot" style={{ background: "#22c55e" }} />Optimaal (Z/ZO/ZW)</div>
                    <div className="map-legend-row"><div className="map-legend-dot" style={{ background: "#f59e0b" }} />Goed (O/W)</div>
                    <div className="map-legend-row"><div className="map-legend-dot" style={{ background: "#ef4444" }} />Minder geschikt (N)</div>
                    <div className="map-legend-row"><div className="map-legend-dot" style={{ background: "#1d4ed8" }} />Geplaatste panelen</div>
                    {!panelsDrawn && <div style={{ color: "var(--muted)", marginTop: 5, fontSize: 9 }}>→ Klik "Bereken" voor panelenplaatsing</div>}
                  </div>
                )}
              </div>
            )}

            {/* PANELEN */}
            {activeTab === "panelen" && (
              <div className="section">
                <div className="sl">Panelenlijst</div>
                <div className="list">{panels.map(p => <PanelCard key={p.id} p={p} selected={p.id === selPanelId} onSelect={id => { setSelPanelId(id); setCustomCount(null); }} onDelete={id => setPanels(ps => ps.filter(x => x.id !== id))} canDelete={panels.length > 1} />)}</div>
                <NewPanelForm onAdd={p => setPanels(ps => [...ps, p])} />
              </div>
            )}

            {/* OMVORMERS */}
            {activeTab === "omvormers" && (
              <div className="section">
                <div className="sl">AlphaESS SMILE-G3 Omvormers</div>
                <div className="info-box alpha-info">
                  <strong>🔆 AlphaESS SMILE-G3 Generatie</strong><br />
                  LiFePO4 · 10 jaar garantie · IP65 outdoor · 97%+ efficiëntie<br />
                  Compatibel met Fluvius slimme meter · Jabba energieplatform · AlphaCloud<br />
                  Richtprijzen hardware excl. BTW. Installatie ±€800–1.500 extra.
                </div>
                <div className="filter-row">
                  {["alle", "1-fase", "3-fase"].map(f => (
                    <button key={f} className={`filter-btn amber-f ${invFilter === f ? "active" : ""}`} onClick={() => setInvFilter(f)}>{f}</button>
                  ))}
                </div>
                {selInv && <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn sec sm" onClick={() => setSelInvId(null)}>✕ Omvormer verwijderen</button></div>}
                <div className="list">{filteredInv.map(inv => <InverterCard key={inv.id} inv={inv} selected={inv.id === selInvId} onSelect={setSelInvId} />)}</div>
              </div>
            )}

            {/* BATTERIJ */}
            {activeTab === "batterij" && (
              <div className="section">
                <div className="sl">Thuisbatterijen</div>
                <div className="toggle-row">
                  <span className="toggle-lbl" style={{ fontSize: 11 }}>Batterij opnemen in terugverdienberekening</span>
                  <label className="toggle"><input type="checkbox" checked={battEnabled} onChange={e => setBattEnabled(e.target.checked)} /><span className="tslider" /></label>
                </div>
                <div className="info-box alpha-info"><strong>🔋 AlphaESS G3 batterijmodules</strong><br />LiFePO4 · 1C laden/ontladen · 10.000 cycli · 95% DoD · 10j garantie</div>
                <div className="filter-row">
                  {[["alle", "Alle"], ["alpha", "AlphaESS G3"], ["overig", "Andere merken"]].map(([k, l]) => (
                    <button key={k} className={`filter-btn ${battFilter === k ? "active" : ""}`} onClick={() => setBattFilter(k)}>{l}</button>
                  ))}
                </div>
                <div className="list">{filteredBatt.map(b => <BattCard key={b.id} b={b} selected={b.id === selBattId} onSelect={setSelBattId} onDelete={id => setBatteries(bs => bs.filter(x => x.id !== id))} canDelete={DEFAULT_BATTERIES.findIndex(d => d.id === b.id) === -1} />)}</div>
                <NewBattForm onAdd={b => setBatteries(bs => [...bs, b])} />
              </div>
            )}

            {/* RESULTATEN */}
            {activeTab === "resultaten" && (
              results ? (
                <div className="results-wrap">
                  <div><div className="sl" style={{ marginBottom: 8 }}>Systeemoverzicht</div>
                    <div className="results-grid">
                      <div className="rc"><div className="rc-label">Paneel</div><div className="rc-num" style={{ fontSize: 12, lineHeight: 1.3 }}>{results.panel.model}</div><div className="rc-unit">{results.panel.brand} · {results.panel.watt}W</div></div>
                      {results.inv && <div className="rc alpha-rc"><div className="rc-label">AlphaESS Omvormer</div><div className="rc-num" style={{ fontSize: 12, lineHeight: 1.3 }}>{results.inv.model}</div><div className="rc-unit">{results.inv.fase} · {results.inv.kw}kW</div></div>}
                      <div className="rc"><div className="rc-label">Installatie</div><div className="rc-num">{results.panelCount}</div><div className="rc-unit">panelen · {results.actualArea} m² · {((results.panelCount * results.panel.watt) / 1000).toFixed(1)} kWp</div></div>
                      <div className="rc green"><div className="rc-label">Jaarlijkse opbrengst</div><div className="rc-num">{results.annualKwh.toLocaleString()}</div><div className="rc-unit">kWh / jaar</div></div>
                      <div className="rc"><div className="rc-label">Irradiantie</div><div className="rc-num">{results.irr}</div><div className="rc-unit">kWh/m²/j · {orientation} {slope}°</div></div>
                      <div className="rc"><div className="rc-label">CO₂ besparing</div><div className="rc-num">{results.co2}</div><div className="rc-unit">kg / jaar</div></div>
                      <div className="rc"><div className="rc-label">Dekkingsgraad</div><div className="rc-num">{results.coverage}%</div><div className="rc-unit">van gemiddeld verbruik</div></div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(29,78,216,.1)", border: "1px solid rgba(96,165,250,.3)", borderRadius: 6, fontSize: 10, color: "#60a5fa" }}>
                    🗺️ <span>Bekijk de <strong>Configuratie tab</strong> — de {results.panelCount} panelen zijn nu zichtbaar op het dak. Gebruik +/− om het aantal aan te passen.</span>
                  </div>
                  <div><div className="sl" style={{ marginBottom: 8 }}>Terugverdientijd</div>
                    <div className="compare-grid">
                      <div className="compare-col">
                        <h4>🔆 Alleen zonnepanelen</h4>
                        <div className="crow">Panelen ({results.panelCount}×) <span>€{(results.panelCount * results.panel.price).toLocaleString()}</span></div>
                        {results.inv ? <div className="crow">{results.inv.model} <span>€{results.inv.price.toLocaleString()}</span></div> : <div className="crow">Installatie forfait <span>€1.200</span></div>}
                        <div className="crow">Zelfverbruik <span>~30%</span></div>
                        <div className="crow">Jaarlijkse besparing <span>€{results.annualBase}/j</span></div>
                        <div className="ctotal"><span>Investering</span><span style={{ fontSize: 12 }}>€{results.investPanels.toLocaleString()}</span></div>
                        <div className="ctotal"><span>Terugverdientijd</span><div className="cval">{results.paybackBase} jaar</div></div>
                        <div className="pbar"><div className="pfill" style={{ width: `${Math.min(100, (results.paybackBase / 25) * 100)}%` }} /></div>
                      </div>
                      {results.battResult ? (
                        <div className={`compare-col batt ${results.batt?.isAlpha ? "alpha-col" : ""}`}>
                          <h4>{results.batt?.isAlpha ? "⚡🔋" : "🔋"} Met {results.batt?.brand} {results.batt?.model}</h4>
                          <div className="crow">Panelen + omvormer <span>€{results.investPanels.toLocaleString()}</span></div>
                          <div className="crow">Batterij ({results.batt?.kwh} kWh) <span>€{results.batt?.price.toLocaleString()}</span></div>
                          <div className="crow">Zelfverbruik <span>~70%</span></div>
                          <div className="crow">Extra besparing <span style={{ color: "var(--green)" }}>+€{results.battResult.extraSav}/j</span></div>
                          <div className="crow">Totale besparing <span>€{results.battResult.totSav}/j</span></div>
                          <div className="ctotal"><span>Investering</span><span style={{ fontSize: 12 }}>€{results.battResult.totInv.toLocaleString()}</span></div>
                          <div className="ctotal"><span>Terugverdientijd</span><div className="cval">{results.battResult.payback} jaar</div></div>
                          <div className="pbar"><div className="pfill" style={{ width: `${Math.min(100, (results.battResult.payback / 25) * 100)}%`, background: "linear-gradient(90deg,var(--blue),var(--alpha))" }} /></div>
                        </div>
                      ) : (
                        <div className="compare-col" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, opacity: .5 }}>
                          <div style={{ fontSize: 28 }}>🔋</div>
                          <div style={{ fontSize: 9, textAlign: "center", color: "var(--muted)" }}>Activeer een batterij in de Batterij tab</div>
                          <button className="btn blue sm" onClick={() => setActiveTab("batterij")}>Batterij instellen</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div><div className="sl" style={{ marginBottom: 7 }}>AI Expert Advies</div>
                    {aiLoading ? <div className="ai-box loading"><div className="spinner" />Claude analyseert uw installatie...</div> : <div className="ai-box">{aiText}</div>}
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="icon">☀️</div>
                  <p>Configureer een adres en klik op "Bereken & toon panelen op dak" om de analyse te starten.</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}

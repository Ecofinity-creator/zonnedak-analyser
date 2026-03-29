import { useState, useEffect, useRef, useCallback } from "react";

// ── Endpoints ────────────────────────────────────────────────────────────────
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const GRB_WFS   = "https://geo.api.vlaanderen.be/GRB/wfs";
const DHM_WMS   = "https://geoservices.informatievlaanderen.be/raadpleegdiensten/DHMVII/wms";
const DHM_WCS   = "https://geoservices.informatievlaanderen.be/raadpleegdiensten/DHMVII/wcs";

// ── CDN bibliotheken ─────────────────────────────────────────────────────────
const PROJ4_SRC    = "https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.0/proj4.js";
const GEOTIFF_SRC  = "https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js";
const LAMBERT72    = "+proj=lcc +lat_1=51.16666723333333 +lat_2=49.8333339 +lat_0=90 +lon_0=4.367486666666666 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +towgs84=-106.869,52.2978,-103.724,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs";

// ── Constanten ───────────────────────────────────────────────────────────────
const DIRS8 = ["N","NO","O","ZO","Z","ZW","W","NW"];
const SOLAR_TABLE = {
  Z: {15:1010,30:1080,45:1100,60:1060,90:920},
  ZO:{15:970, 30:1020,45:1020,60:975, 90:820},
  ZW:{15:970, 30:1020,45:1020,60:975, 90:820},
  O: {15:890, 30:900, 45:870, 60:810, 90:650},
  W: {15:890, 30:900, 45:870, 60:810, 90:650},
  NO:{15:820, 30:790, 45:740, 60:670, 90:490},
  NW:{15:820, 30:790, 45:740, 60:670, 90:490},
  N: {15:760, 30:700, 45:630, 60:555, 90:370},
};
const ZONE_Q = {
  Z: [{c:"#22c55e",l:"Optimaal ☀️"},{c:"#ef4444",l:"Ongeschikt ✗"}],
  N: [{c:"#ef4444",l:"Ongeschikt ✗"},{c:"#22c55e",l:"Optimaal ☀️"}],
  ZO:[{c:"#4ade80",l:"Goed ☀️"},   {c:"#f97316",l:"Matig"}],
  ZW:[{c:"#4ade80",l:"Goed ☀️"},   {c:"#f97316",l:"Matig"}],
  O: [{c:"#f59e0b",l:"Matig"},     {c:"#f59e0b",l:"Matig"}],
  W: [{c:"#f59e0b",l:"Matig"},     {c:"#f59e0b",l:"Matig"}],
  NO:[{c:"#f97316",l:"Matig"},     {c:"#4ade80",l:"Goed ☀️"}],
  NW:[{c:"#f97316",l:"Matig"},     {c:"#4ade80",l:"Goed ☀️"}],
};
const BEST_SOUTH={Z:true,ZO:true,ZW:true,O:true,W:true,N:false,NO:false,NW:false};

function getSolarIrr(o,s){
  const t=SOLAR_TABLE[o]||SOLAR_TABLE.Z;
  return t[[15,30,45,60,90].reduce((a,b)=>Math.abs(b-s)<Math.abs(a-s)?b:a)];
}

// ── Bibliotheken dynamisch laden ─────────────────────────────────────────────
function loadScript(src){
  return new Promise((res,rej)=>{
    if(document.querySelector(`script[src="${src}"]`)){res();return;}
    const s=document.createElement("script");
    s.src=src; s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
}
async function ensureLibs(){
  await Promise.all([loadScript(PROJ4_SRC), loadScript(GEOTIFF_SRC)]);
  if(!window.proj4.defs("EPSG:31370"))
    window.proj4.defs("EPSG:31370", LAMBERT72);
}

// ── DHM WCS: hoogtedata ophalen ──────────────────────────────────────────────
async function fetchWCSRaster(coverage, xmin,ymin,xmax,ymax, mw,mh){
  const p=new URLSearchParams({
    SERVICE:"WCS",VERSION:"1.0.0",REQUEST:"GetCoverage",
    COVERAGE:coverage,
    CRS:"EPSG:31370",RESPONSE_CRS:"EPSG:31370",
    BBOX:`${xmin},${ymin},${xmax},${ymax}`,
    WIDTH:mw,HEIGHT:mh,FORMAT:"GeoTIFF"
  });
  const r=await fetch(`${DHM_WCS}?${p}`);
  if(!r.ok) throw new Error(`WCS ${coverage}: ${r.status}`);
  const buf=await r.arrayBuffer();
  const tif=await window.GeoTIFF.fromArrayBuffer(buf);
  const img=await tif.getImage();
  const ras=await img.readRasters();
  return{data:ras[0],w:img.getWidth(),h:img.getHeight()};
}

// ── Horn's methode: helling & aspect per pixel ───────────────────────────────
function computeRoofFaces(dsm, dtm, w, h, cellSize){
  const pts=[];
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const i=y*w+x;
      const relH=dsm[i]-dtm[i];
      if(relH<2||relH>30||isNaN(dsm[i])||isNaN(dtm[i])) continue;
      const v=(dy,dx)=>dsm[(y+dy)*w+(x+dx)];
      const[a,b,c,d,f,g,hh,ii]=[v(-1,-1),v(-1,0),v(-1,1),v(0,-1),v(0,1),v(1,-1),v(1,0),v(1,1)];
      if([a,b,c,d,f,g,hh,ii].some(isNaN)) continue;
      const dzdx=((c+2*f+ii)-(a+2*d+g))/(8*cellSize);
      const dzdy=((g+2*hh+ii)-(a+2*b+c))/(8*cellSize);
      const slope=Math.atan(Math.sqrt(dzdx*dzdx+dzdy*dzdy))*180/Math.PI;
      if(slope<8) continue;
      const aspect=(90-Math.atan2(-dzdy,dzdx)*180/Math.PI+360)%360;
      pts.push({slope,aspect,relH});
    }
  }
  if(pts.length<10) return null;

  const bins=Array(8).fill(0).map(()=>({n:0,slopes:[],aspects:[],heights:[]}));
  pts.forEach(({slope,aspect,relH})=>{
    const b=Math.round(aspect/45)%8;
    bins[b].n++; bins[b].slopes.push(slope);
    bins[b].aspects.push(aspect); bins[b].heights.push(relH);
  });
  const total=pts.length;
  return bins
    .map((b,i)=>({
      orientation:DIRS8[i],
      slope:b.n?Math.round(b.slopes.reduce((a,v)=>a+v)/b.n):0,
      avgHeight:b.n?Math.round(b.heights.reduce((a,v)=>a+v)/b.n*10)/10:0,
      pct:Math.round(b.n/total*100),
      count:b.n
    }))
    .filter(b=>b.pct>=5)
    .sort((a,b)=>b.count-a.count)
    .slice(0,4);
}

// ── Hoofd DHM-analyse ────────────────────────────────────────────────────────
async function analyzeDHM(buildingCoords){
  await ensureLibs();
  const lats=buildingCoords.map(p=>p[0]),lngs=buildingCoords.map(p=>p[1]);
  const toL72=([lo,la])=>window.proj4("EPSG:4326","EPSG:31370",[lo,la]);
  const sw=toL72([Math.min(...lngs)-0.0001,Math.min(...lats)-0.0001]);
  const ne=toL72([Math.max(...lngs)+0.0001,Math.max(...lats)+0.0001]);
  const pad=5;
  const[xmin,ymin,xmax,ymax]=[sw[0]-pad,sw[1]-pad,ne[0]+pad,ne[1]+pad];
  const mw=Math.min(80,Math.max(10,Math.ceil(xmax-xmin)));
  const mh=Math.min(80,Math.max(10,Math.ceil(ymax-ymin)));
  const cellSize=(xmax-xmin)/mw;
  const[dsmR,dtmR]=await Promise.all([
    fetchWCSRaster("DHMVII_DSM_1m",xmin,ymin,xmax,ymax,mw,mh),
    fetchWCSRaster("DHMVII_DTM_1m",xmin,ymin,xmax,ymax,mw,mh),
  ]);
  return computeRoofFaces(dsmR.data,dtmR.data,dsmR.w,dsmR.h,cellSize);
}

// ── Polygoon helpers ─────────────────────────────────────────────────────────
function pointInPoly(pt,poly){
  const[x,y]=pt; let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const[xi,yi]=poly[i],[xj,yj]=poly[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
function clipPolyByLat(poly,keepBelow,midLat){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const aSide=keepBelow?a[0]<=midLat:a[0]>=midLat;
    const bSide=keepBelow?b[0]<=midLat:b[0]>=midLat;
    if(aSide) out.push(a);
    if(aSide!==bSide){
      const t=(midLat-a[0])/(b[0]-a[0]);
      out.push([midLat,a[1]+t*(b[1]-a[1])]);
    }
  }
  return out.length>=3?out:null;
}
function polyAreaM2(lc){
  const mLat=111320,cx=lc.reduce((s,p)=>s+p[0],0)/lc.length;
  const mLng=111320*Math.cos(cx*Math.PI/180); let area=0;
  for(let i=0,j=lc.length-1;i<lc.length;j=i++)
    area+=(lc[i][1]*mLng)*(lc[j][0]*mLat)-(lc[j][1]*mLng)*(lc[i][0]*mLat);
  return Math.abs(area/2);
}
function packPanels(poly,lat,panelW,panelH,maxN,goodSouth){
  const mLat=111320,mLng=111320*Math.cos(lat*Math.PI/180);
  const pw=panelW/mLng,ph=panelH/mLat,gap=0.3/mLat;
  const lats=poly.map(p=>p[0]),lngs=poly.map(p=>p[1]);
  const[minLat,maxLat,minLng,maxLng]=[Math.min(...lats),Math.max(...lats),Math.min(...lngs),Math.max(...lngs)];
  const midLat=(minLat+maxLat)/2;
  const margin=0.4/mLat,mLngM=0.4/mLng;
  const sL=(goodSouth?minLat:midLat)+margin,eL=(goodSouth?midLat:maxLat)-margin;
  const panels=[];
  for(let rLat=sL;rLat+ph<=eL&&panels.length<maxN;rLat+=ph+gap)
    for(let rLng=minLng+mLngM;rLng+pw<=maxLng-mLngM&&panels.length<maxN;rLng+=pw+0.2/mLng)
      if(pointInPoly([rLng+pw/2,rLat+ph/2],poly.map(p=>[p[1],p[0]])))
        panels.push({lat:rLat,lng:rLng,ph,pw});
  return panels;
}
function geoToLeaflet(ring){return ring.map(([lo,la])=>[la,lo]);}

// ── GRB gebouwcontour ────────────────────────────────────────────────────────
async function fetchGRBBuilding(lat,lng){
  const d=0.001;
  const p=new URLSearchParams({
    SERVICE:"WFS",VERSION:"2.0.0",REQUEST:"GetFeature",
    TYPENAMES:"GRB:GBG",OUTPUTFORMAT:"application/json",
    SRSNAME:"EPSG:4326",
    BBOX:`${lng-d},${lat-d},${lng+d},${lat+d},EPSG:4326`,COUNT:"30"
  });
  const r=await fetch(`${GRB_WFS}?${p}`);
  if(!r.ok) throw new Error("GRB niet bereikbaar");
  return r.json();
}
function findBuilding(geojson,lat,lng){
  if(!geojson?.features?.length) return null;
  for(const f of geojson.features){
    if(!f.geometry?.coordinates) continue;
    const rings=f.geometry.type==="Polygon"?[f.geometry.coordinates[0]]:f.geometry.coordinates.map(p=>p[0]);
    for(const ring of rings)
      if(pointInPoly([lng,lat],ring)) return f;
  }
  let best=null,bestD=Infinity;
  for(const f of geojson.features){
    const ring=f.geometry?.type==="Polygon"?f.geometry.coordinates[0]:f.geometry?.coordinates?.[0]?.[0];
    if(!ring) continue;
    const cx=ring.reduce((s,p)=>s+p[0],0)/ring.length,cy=ring.reduce((s,p)=>s+p[1],0)/ring.length;
    const d=Math.hypot(cx-lng,cy-lat);
    if(d<bestD){bestD=d;best=f;}
  }
  return best;
}

// ── Standaarddata ────────────────────────────────────────────────────────────
const DEFAULT_PANELS=[
  {id:1,brand:"Jinko Solar",   model:"Tiger Neo N-Type 420W",  watt:420,area:1.722,eff:21.8,price:210,warranty:25},
  {id:2,brand:"LONGi Solar",   model:"Hi-MO 6 Explorer 415W",  watt:415,area:1.722,eff:21.3,price:195,warranty:25},
  {id:3,brand:"Canadian Solar",model:"HiHero 430W",             watt:430,area:1.879,eff:22.8,price:235,warranty:25},
  {id:4,brand:"SunPower",      model:"Maxeon 6 420W",           watt:420,area:1.690,eff:22.8,price:420,warranty:40},
  {id:5,brand:"Qcells",        model:"Q.PEAK DUO ML-G10 400W", watt:400,area:1.740,eff:20.6,price:185,warranty:25},
];
const DEFAULT_INVERTERS=[
  {id:1,brand:"AlphaESS",model:"SMILE-G3-S3.6",fase:"1-fase",kw:3.68,mppt:2,maxPv:7400, eff:97.1,price:1850,warranty:10,notes:"Ideaal voor energiezuinige woningen. Uitbreidbaar tot 60,5 kWh. IP65. Jabba-compatibel."},
  {id:2,brand:"AlphaESS",model:"SMILE-G3-S5",  fase:"1-fase",kw:5.0, mppt:2,maxPv:10000,eff:97.3,price:2400,warranty:10,notes:"Populairste model. 200% PV-oversizing. UPS backup. Fluvius-integratie."},
  {id:3,brand:"AlphaESS",model:"SMILE-G3-S8",  fase:"1-fase",kw:8.0, mppt:2,maxPv:16000,eff:97.5,price:3100,warranty:10,notes:"Nieuwste 1-fase met display. 8kW backup. Geschikt voor EV-laders."},
  {id:4,brand:"AlphaESS",model:"SMILE-G3-T4/6/8/10",fase:"3-fase",kw:10.0,mppt:3,maxPv:20000,eff:97.5,price:4200,warranty:10,notes:"Driefase hybride. 3 MPPT, 150% overbelasting. Max 45,6 kWh."},
  {id:5,brand:"AlphaESS",model:"SMILE-G3-T15/20", fase:"3-fase",kw:20.0,mppt:3,maxPv:40000,eff:97.6,price:6500,warranty:10,notes:"15-20kW driefase voor grote woningen of KMO."},
];
const DEFAULT_BATTERIES=[
  {id:1,brand:"AlphaESS",model:"BAT-G3-3.8S",              kwh:3.8, price:1507,cycles:10000,warranty:10,dod:95,notes:"Serieel, indoor IP21. Tot 4× (15,2 kWh).",isAlpha:true},
  {id:2,brand:"AlphaESS",model:"BAT-G3-9.3S",              kwh:9.3, price:3200,cycles:10000,warranty:10,dod:95,notes:"Hoogspanning, IP65 outdoor. Verwarming. Tot 4× (37,2 kWh).",isAlpha:true},
  {id:3,brand:"AlphaESS",model:"BAT-G3-10.1P",             kwh:10.1,price:3500,cycles:10000,warranty:10,dod:95,notes:"Parallel, tot 6× (60,5 kWh). Outdoor IP65.",isAlpha:true},
  {id:4,brand:"AlphaESS",model:"G3-S5 + 10.1 kWh (pakket)",kwh:10.1,price:6200,cycles:10000,warranty:10,dod:95,notes:"SMILE-G3-S5 + 1× BAT-G3-10.1P. Plug-and-play.",isAlpha:true},
  {id:5,brand:"AlphaESS",model:"G3-S5 + 20.2 kWh (pakket)",kwh:20.2,price:9400,cycles:10000,warranty:10,dod:95,notes:"SMILE-G3-S5 + 2× BAT-G3-10.1P. Grote verbruikers/EV.",isAlpha:true},
  {id:6,brand:"Tesla",   model:"Powerwall 3",               kwh:13.5,price:8500,cycles:4000, warranty:10,dod:100,notes:"Geïntegreerde omvormer. Volledig huis backup.",isAlpha:false},
  {id:7,brand:"SolarEdge",model:"Home Battery 10kWh",       kwh:10.0,price:6800,cycles:6000, warranty:10,dod:100,notes:"Vereist SolarEdge omvormer.",isAlpha:false},
  {id:8,brand:"BYD",     model:"Battery-Box HVS 10.2",      kwh:10.2,price:5200,cycles:8000, warranty:10,dod:100,notes:"Hoogspanning modulaire opbouw.",isAlpha:false},
];

// ══════════════════════════════════════════════════════════════════════════════
const STYLES=`
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
.app{min-height:100vh;background:var(--bg);font-family:'IBM Plex Mono',monospace;color:var(--text);}
.header{padding:13px 20px;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:12px;position:relative;}
.header::after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--amber),transparent);}
.logo{width:30px;height:30px;background:var(--amber);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
.header-text h1{font-family:'Syne',sans-serif;font-size:14px;font-weight:800;}
.header-text p{font-size:8px;color:var(--muted);margin-top:1px;}
.badge{margin-left:auto;padding:3px 8px;border:1px solid var(--border);border-radius:4px;font-size:8px;color:var(--amber);letter-spacing:1px;text-transform:uppercase;white-space:nowrap;}
.tabs{display:flex;background:var(--bg2);border-bottom:1px solid var(--border);overflow-x:auto;}
.tab{padding:8px 13px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.5px;color:var(--muted);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap;flex-shrink:0;}
.tab.active{color:var(--amber);border-bottom-color:var(--amber);}
.tab:hover:not(.active){color:var(--text);}
.main{display:grid;grid-template-columns:330px 1fr;height:calc(100vh - 93px);}
.sidebar{background:var(--bg2);border-right:1px solid var(--border);padding:13px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;}
.content-area{display:flex;flex-direction:column;overflow-y:auto;}
.sl{font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--amber);margin-bottom:6px;display:flex;align-items:center;gap:8px;}
.sl::after{content:'';flex:1;height:1px;background:var(--border);}
.inp{width:100%;padding:7px 9px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:10px;outline:none;transition:border-color .2s;}
.inp:focus{border-color:var(--amber);box-shadow:0 0 0 2px var(--amber-glow);}
.inp::placeholder{color:var(--muted);}
.inp-label{font-size:8px;color:var(--muted);margin-bottom:3px;}
.inp-2{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.inp-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;}
.sugg-wrap{position:relative;}
.sugg{position:absolute;top:calc(100% + 3px);left:0;right:0;background:var(--bg3);border:1px solid var(--border);border-radius:5px;z-index:200;max-height:150px;overflow-y:auto;}
.sugg-item{padding:7px 9px;font-size:9px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);transition:background .15s;line-height:1.4;}
.sugg-item:hover{background:var(--amber-glow);color:var(--amber);}
.btn{padding:7px 12px;background:var(--amber);border:none;border-radius:5px;color:#000;font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:500;letter-spacing:.5px;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:5px;}
.btn:hover{background:#ffc04d;transform:translateY(-1px);}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none;}
.btn.sec{background:transparent;border:1px solid var(--border);color:var(--text);}
.btn.sec:hover{border-color:var(--amber);color:var(--amber);background:var(--amber-glow);}
.btn.danger{background:transparent;border:1px solid rgba(248,113,113,.3);color:var(--red);}
.btn.danger:hover{background:rgba(248,113,113,.1);border-color:var(--red);}
.btn.sm{padding:3px 7px;font-size:8px;}
.btn.blue{background:var(--blue);color:#000;}
.btn.blue:hover{background:#93c5fd;}
.btn.alpha{background:var(--alpha);color:#000;}
.btn.alpha:hover{background:#67e8f9;}
.btn.full{width:100%;}
.sl-item label{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:3px;}
.sl-item label span{color:var(--amber);}
.sl-item input[type=range]{width:100%;appearance:none;height:3px;background:var(--bg4);border-radius:2px;outline:none;cursor:pointer;}
.sl-item input[type=range]::-webkit-slider-thumb{appearance:none;width:11px;height:11px;background:var(--amber);border-radius:50%;cursor:pointer;}
.orient-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;}
.orient-btn{padding:5px 2px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:8px;cursor:pointer;text-align:center;transition:all .15s;}
.orient-btn.active{background:var(--amber-glow);border-color:var(--amber);color:var(--amber);}
.orient-btn.dhm{border-color:rgba(34,211,238,.4);color:var(--alpha);}
.card{background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:9px;cursor:pointer;transition:all .2s;position:relative;}
.card:hover{border-color:rgba(245,166,35,.5);}
.card.selected{border-color:var(--amber);background:rgba(245,166,35,.06);}
.card.selected::before{content:'✓';position:absolute;top:6px;right:8px;color:var(--amber);font-size:10px;font-weight:bold;}
.card.alpha-card{border-color:rgba(34,211,238,.25);}
.card.alpha-card.selected{border-color:var(--alpha);background:var(--alpha-glow);}
.card.alpha-card.selected::before{color:var(--alpha);}
.card.batt-card.selected{border-color:var(--blue);background:rgba(96,165,250,.06);}
.card.batt-card.selected::before{color:var(--blue);}
.card-name{font-family:'Syne',sans-serif;font-size:11px;font-weight:700;margin-bottom:2px;}
.card-brand{font-size:8px;color:var(--muted);margin-bottom:5px;}
.card-notes{font-size:8px;color:var(--muted);margin-top:4px;line-height:1.5;border-top:1px solid rgba(255,255,255,.05);padding-top:4px;}
.chips{display:flex;gap:4px;flex-wrap:wrap;}
.chip{font-size:8px;color:var(--text);background:var(--bg4);padding:2px 5px;border-radius:3px;}
.chip.gold{color:var(--amber);}
.chip.alpha-c{color:var(--alpha);}
.chip.blue-c{color:var(--blue);}
.alpha-badge{display:inline-flex;align-items:center;gap:4px;font-size:7px;color:var(--alpha);background:var(--alpha-glow);border:1px solid rgba(34,211,238,.3);border-radius:3px;padding:1px 5px;margin-bottom:4px;}
.toggle-row{display:flex;align-items:center;justify-content:space-between;padding:7px 9px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;}
.toggle-lbl{font-size:9px;color:var(--text);}
.toggle{position:relative;width:34px;height:18px;flex-shrink:0;}
.toggle input{opacity:0;width:0;height:0;}
.tslider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--bg4);border-radius:9px;transition:.3s;}
.tslider:before{content:'';position:absolute;width:12px;height:12px;left:3px;bottom:3px;background:var(--muted);border-radius:50%;transition:.3s;}
.toggle input:checked + .tslider{background:var(--blue);}
.toggle input:checked + .tslider:before{transform:translateX(16px);background:#fff;}
.pce{background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:9px;}
.pce-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
.pce-title{font-size:9px;color:var(--text);}
.pce-reset{font-size:8px;color:var(--muted);cursor:pointer;text-decoration:underline;}
.pce-controls{display:flex;align-items:center;gap:9px;}
.pce-btn{width:26px;height:26px;background:var(--bg4);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;}
.pce-btn:hover{border-color:var(--amber);color:var(--amber);}
.pce-val{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--amber);min-width:40px;text-align:center;}
.pce-sub{font-size:8px;color:var(--muted);text-align:center;}
.divider{height:1px;background:var(--border);flex-shrink:0;}
.info-box{font-size:8px;color:var(--muted);line-height:1.7;padding:6px 9px;background:rgba(245,166,35,.04);border:1px solid var(--border);border-radius:5px;}
.info-box strong{color:var(--amber);}
.info-box.alpha-info{background:var(--alpha-glow);border-color:rgba(34,211,238,.3);}
.info-box.alpha-info strong{color:var(--alpha);}
.info-box.grb-ok{background:rgba(34,197,94,.07);border-color:rgba(34,197,94,.3);}
.info-box.grb-ok strong{color:var(--green);}
.info-box.dhm-ok{background:rgba(34,211,238,.07);border-color:rgba(34,211,238,.3);}
.info-box.dhm-ok strong{color:var(--alpha);}
.info-box.warn{background:rgba(245,158,11,.07);border-color:rgba(245,158,11,.3);}
.info-box.warn strong{color:var(--amber);}
.coord-row{display:flex;gap:10px;padding:5px 9px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;font-size:8px;color:var(--amber);}
.coord-row span{color:var(--muted);}
/* DHM face buttons */
.face-grid{display:flex;gap:5px;flex-wrap:wrap;}
.face-btn{padding:5px 9px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:8px;cursor:pointer;transition:all .15s;text-align:center;}
.face-btn:hover{border-color:var(--alpha);color:var(--alpha);}
.face-btn.active{background:var(--alpha-glow);border-color:var(--alpha);color:var(--alpha);}
.face-btn .face-lbl{font-family:'Syne',sans-serif;font-size:11px;font-weight:700;display:block;}
.face-btn .face-sub{font-size:7px;color:var(--muted);margin-top:1px;}
.face-btn.active .face-sub{color:var(--alpha);}
/* Results */
.rc{background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;position:relative;overflow:hidden;}
.rc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--amber);}
.rc.green::before{background:var(--green);}
.rc.blue::before{background:var(--blue);}
.rc.alpha-rc::before{background:var(--alpha);}
.rc-label{font-size:7px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;}
.rc-num{font-family:'Syne',sans-serif;font-size:19px;font-weight:800;color:var(--amber);line-height:1;}
.rc.green .rc-num{color:var(--green);}
.rc.blue .rc-num{color:var(--blue);}
.rc.alpha-rc .rc-num{color:var(--alpha);}
.rc-unit{font-size:8px;color:var(--muted);margin-top:2px;}
.results-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:7px;margin-bottom:10px;}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:10px;}
.compare-col{background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:11px;}
.compare-col h4{font-family:'Syne',sans-serif;font-size:10px;font-weight:700;margin-bottom:6px;color:var(--amber);}
.compare-col.batt h4{color:var(--blue);}
.compare-col.alpha-col h4{color:var(--alpha);}
.crow{display:flex;justify-content:space-between;font-size:8px;color:var(--muted);margin-bottom:4px;}
.crow span{color:var(--text);}
.ctotal{margin-top:6px;padding-top:6px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:baseline;font-size:9px;}
.cval{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:var(--amber);}
.compare-col.batt .cval{color:var(--blue);}
.compare-col.alpha-col .cval{color:var(--alpha);}
.pbar{height:4px;background:var(--bg4);border-radius:2px;overflow:hidden;margin-top:5px;}
.pfill{height:100%;border-radius:2px;background:linear-gradient(90deg,var(--green),var(--amber));transition:width .8s;}
.ai-box{background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:10px;line-height:1.8;color:var(--text);white-space:pre-wrap;}
.ai-box.loading{display:flex;align-items:center;gap:9px;color:var(--muted);}
.spinner{width:11px;height:11px;border:2px solid var(--border);border-top-color:var(--amber);border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0;}
.spinner.cyan{border-top-color:var(--alpha);}
.spinner.blue{border-top-color:var(--blue);}
@keyframes spin{to{transform:rotate(360deg);}}
.map-area{flex:1;position:relative;min-height:0;}
#leaflet-map{width:100%;height:100%;}
.map-btns{position:absolute;top:10px;right:10px;z-index:999;display:flex;flex-direction:column;gap:4px;}
.map-btn{padding:5px 9px;background:rgba(10,10,15,.92);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:8px;cursor:pointer;backdrop-filter:blur(8px);transition:all .15s;white-space:nowrap;}
.map-btn.active{border-color:var(--amber);color:var(--amber);}
.map-legend{position:absolute;bottom:26px;left:10px;z-index:999;background:rgba(10,10,15,.92);border:1px solid var(--border);border-radius:5px;padding:7px 9px;font-family:'IBM Plex Mono',monospace;font-size:8px;backdrop-filter:blur(8px);min-width:165px;}
.legend-title{color:var(--amber);font-weight:600;margin-bottom:4px;letter-spacing:1px;text-transform:uppercase;font-size:7px;}
.legend-row{display:flex;align-items:center;gap:5px;color:var(--muted);margin-bottom:2px;}
.legend-dot{width:9px;height:9px;border-radius:2px;flex-shrink:0;}
.status-pill{position:absolute;top:10px;left:10px;z-index:999;padding:3px 8px;background:rgba(10,10,15,.92);border:1px solid var(--border);border-radius:4px;font-size:8px;font-family:'IBM Plex Mono',monospace;backdrop-filter:blur(8px);display:flex;align-items:center;gap:5px;}
.leaflet-container{background:#0a0a0f!important;}
.leaflet-control-zoom a{background:var(--bg2)!important;color:var(--text)!important;border-color:var(--border)!important;}
.leaflet-control-attribution{background:rgba(10,10,15,.8)!important;color:var(--muted)!important;font-size:7px!important;}
.section{padding:13px 16px;display:flex;flex-direction:column;gap:9px;overflow-y:auto;}
.list{display:flex;flex-direction:column;gap:6px;}
.new-form{background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:11px;display:flex;flex-direction:column;gap:7px;}
.new-form h4{font-family:'Syne',sans-serif;font-size:10px;font-weight:700;}
.results-wrap{padding:13px 16px;display:flex;flex-direction:column;gap:10px;}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:40px 20px;gap:9px;color:var(--muted);text-align:center;}
.empty-state .icon{font-size:28px;}
.empty-state p{font-size:10px;max-width:240px;line-height:1.6;}
.filter-row{display:flex;gap:5px;flex-wrap:wrap;}
.filter-btn{padding:3px 9px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);cursor:pointer;transition:all .15s;}
.filter-btn.active{border-color:var(--alpha);color:var(--alpha);background:var(--alpha-glow);}
.filter-btn.af.active{border-color:var(--amber);color:var(--amber);background:var(--amber-glow);}
.inv-card{background:var(--bg3);border:1px solid rgba(34,211,238,.2);border-radius:6px;padding:9px;cursor:pointer;transition:all .2s;position:relative;}
.inv-card:hover{border-color:rgba(34,211,238,.6);}
.inv-card.selected{border-color:var(--alpha);background:var(--alpha-glow);}
.inv-card.selected::before{content:'✓';position:absolute;top:6px;right:8px;color:var(--alpha);font-size:10px;font-weight:bold;}
/* DHM progress bar */
.dhm-progress{height:3px;background:var(--bg4);border-radius:2px;overflow:hidden;margin-top:4px;}
.dhm-progress-fill{height:100%;background:linear-gradient(90deg,var(--alpha),var(--blue));border-radius:2px;animation:dhm-anim 2s ease-in-out infinite;}
@keyframes dhm-anim{0%{width:0%;margin-left:0}50%{width:60%}100%{width:0%;margin-left:100%}}
`;

// ── Kaartfuncties ─────────────────────────────────────────────────────────────
function drawRealRoof(map,L,lc,orientation){
  const[sQ,nQ]=ZONE_Q[orientation]||ZONE_Q.Z;
  const lats=lc.map(p=>p[0]),mid=(Math.min(...lats)+Math.max(...lats))/2;
  const g=L.layerGroup();
  const sP=clipPolyByLat(lc,true,mid);
  if(sP?.length>=3) L.polygon(sP,{color:sQ.c,fillColor:sQ.c,fillOpacity:.35,weight:1.5,opacity:.8}).bindTooltip(`<b>Zuid-helling</b><br>${sQ.l}`,{sticky:true}).addTo(g);
  const nP=clipPolyByLat(lc,false,mid);
  if(nP?.length>=3) L.polygon(nP,{color:nQ.c,fillColor:nQ.c,fillOpacity:.35,weight:1.5,opacity:.8}).bindTooltip(`<b>Noord-helling</b><br>${nQ.l}`,{sticky:true}).addTo(g);
  L.polygon(lc,{color:"#f5a623",fillOpacity:0,weight:2.5,dashArray:"6,3"}).addTo(g);
  const lngs=lc.map(p=>p[1]);
  L.polyline([[mid,Math.min(...lngs)],[mid,Math.max(...lngs)]],{color:"#f5a623",weight:2,opacity:.8,dashArray:"4,3"}).addTo(g);
  g.addTo(map); return g;
}
function drawPanelLayer(map,L,lc,lat,count,panel,orientation){
  const goodSouth=BEST_SOUTH[orientation]!==undefined?BEST_SOUTH[orientation]:true;
  const ratio=1.338,pW=Math.sqrt(panel.area/ratio),pH=panel.area/pW;
  const panels=packPanels(lc,lat,pW,pH,count,goodSouth);
  const g=L.layerGroup();
  panels.forEach((p,i)=>{
    L.polygon([[p.lat,p.lng],[p.lat+p.ph,p.lng],[p.lat+p.ph,p.lng+p.pw],[p.lat,p.lng+p.pw]],
      {color:"#0f172a",weight:1,fillColor:"#1d4ed8",fillOpacity:.88})
     .bindTooltip(`Paneel ${i+1}<br>${panel.brand} ${panel.watt}W`,{direction:"top"}).addTo(g);
    L.polyline([[p.lat+p.ph*.5,p.lng],[p.lat+p.ph*.5,p.lng+p.pw]],{color:"#3b82f6",weight:.5,opacity:.5}).addTo(g);
  });
  const kWp=((panels.length*panel.watt)/1000).toFixed(1);
  const lats=lc.map(p=>p[0]),lngs=lc.map(p=>p[1]);
  const lLat=goodSouth?Math.min(...lats)-.00003:Math.max(...lats)+.00003;
  L.marker([(lLat),(Math.min(...lngs)+Math.max(...lngs))/2],{icon:L.divIcon({
    html:`<div style="background:rgba(10,10,15,.92);color:#60a5fa;padding:3px 8px;border-radius:4px;font-size:8px;font-family:'IBM Plex Mono',monospace;border:1px solid #3b82f6;white-space:nowrap">🔵 ${panels.length}/${count} panelen · ${kWp} kWp</div>`,
    className:"",iconAnchor:[60,4]
  })}).addTo(g);
  g.addTo(map); return g;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function PanelCard({p,selected,onSelect,onDelete,canDelete}){return(
  <div className={`card ${selected?"selected":""}`} onClick={()=>onSelect(p.id)}>
    <div className="card-name">{p.model}</div><div className="card-brand">{p.brand}</div>
    <div className="chips"><span className="chip gold">{p.watt}W</span><span className="chip">{p.eff}% eff</span><span className="chip">{p.area} m²</span><span className="chip">€{p.price}/st</span><span className="chip">{p.warranty}j</span></div>
    {canDelete&&<button className="btn danger sm" style={{marginTop:5,width:"fit-content"}} onClick={e=>{e.stopPropagation();onDelete(p.id);}}>✕</button>}
  </div>
);}
function InverterCard({inv,selected,onSelect}){return(
  <div className={`inv-card ${selected?"selected":""}`} onClick={()=>onSelect(inv.id)}>
    <div className="alpha-badge">⚡ AlphaESS G3</div>
    <div className="card-name">{inv.model}</div><div className="card-brand">{inv.brand} · {inv.fase}</div>
    <div className="chips"><span className="chip alpha-c">{inv.kw}kW</span><span className="chip">{inv.mppt} MPPT</span><span className="chip">max {inv.maxPv/1000}kWp</span><span className="chip">{inv.eff}% eff</span><span className="chip">€{inv.price.toLocaleString()}</span><span className="chip">{inv.warranty}j</span></div>
    <div className="card-notes">{inv.notes}</div>
  </div>
);}
function BattCard({b,selected,onSelect,onDelete,canDelete}){return(
  <div className={`card batt-card ${b.isAlpha?"alpha-card":""} ${selected?"selected":""}`} onClick={()=>onSelect(b.id)}>
    {b.isAlpha&&<div className="alpha-badge">🔋 AlphaESS G3</div>}
    <div className="card-name">{b.model}</div><div className="card-brand">{b.brand}</div>
    <div className="chips"><span className={`chip ${b.isAlpha?"alpha-c":"blue-c"}`}>{b.kwh} kWh</span><span className="chip">€{b.price.toLocaleString()}</span><span className="chip">{b.cycles.toLocaleString()} cycli</span>{b.dod&&<span className="chip">{b.dod}% DoD</span>}<span className="chip">{b.warranty}j</span></div>
    {b.notes&&<div className="card-notes">{b.notes}</div>}
    {canDelete&&<button className="btn danger sm" style={{marginTop:5,width:"fit-content"}} onClick={e=>{e.stopPropagation();onDelete(b.id);}}>✕</button>}
  </div>
);}
function NewPanelForm({onAdd}){
  const e0={brand:"",model:"",watt:"",area:"",eff:"",price:"",warranty:"25"};
  const[f,setF]=useState(e0);const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const ok=f.brand&&f.model&&+f.watt>0&&+f.area>0&&+f.eff>0&&+f.price>0;
  return(<div className="new-form"><h4>➕ Nieuw paneel</h4>
    <div className="inp-2"><div><div className="inp-label">Merk</div><input className="inp" placeholder="Jinko" value={f.brand} onChange={e=>s("brand",e.target.value)}/></div><div><div className="inp-label">Model</div><input className="inp" placeholder="Tiger 420W" value={f.model} onChange={e=>s("model",e.target.value)}/></div></div>
    <div className="inp-3"><div><div className="inp-label">Watt</div><input className="inp" type="number" placeholder="420" value={f.watt} onChange={e=>s("watt",e.target.value)}/></div><div><div className="inp-label">m²</div><input className="inp" type="number" placeholder="1.72" value={f.area} onChange={e=>s("area",e.target.value)}/></div><div><div className="inp-label">Eff %</div><input className="inp" type="number" placeholder="21.5" value={f.eff} onChange={e=>s("eff",e.target.value)}/></div></div>
    <div className="inp-2"><div><div className="inp-label">€/st</div><input className="inp" type="number" placeholder="210" value={f.price} onChange={e=>s("price",e.target.value)}/></div><div><div className="inp-label">Garantie</div><input className="inp" type="number" placeholder="25" value={f.warranty} onChange={e=>s("warranty",e.target.value)}/></div></div>
    <button className="btn full" disabled={!ok} onClick={()=>{onAdd({...f,id:Date.now(),watt:+f.watt,area:+f.area,eff:+f.eff,price:+f.price,warranty:+f.warranty});setF(e0);}}>Toevoegen</button>
  </div>);}
function NewBattForm({onAdd}){
  const e0={brand:"",model:"",kwh:"",price:"",cycles:"",warranty:"10"};
  const[f,setF]=useState(e0);const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const ok=f.brand&&f.model&&+f.kwh>0&&+f.price>0&&+f.cycles>0;
  return(<div className="new-form"><h4>➕ Nieuwe batterij</h4>
    <div className="inp-2"><div><div className="inp-label">Merk</div><input className="inp" placeholder="Tesla" value={f.brand} onChange={e=>s("brand",e.target.value)}/></div><div><div className="inp-label">Model</div><input className="inp" placeholder="Powerwall 3" value={f.model} onChange={e=>s("model",e.target.value)}/></div></div>
    <div className="inp-3"><div><div className="inp-label">kWh</div><input className="inp" type="number" placeholder="10" value={f.kwh} onChange={e=>s("kwh",e.target.value)}/></div><div><div className="inp-label">Prijs €</div><input className="inp" type="number" placeholder="5500" value={f.price} onChange={e=>s("price",e.target.value)}/></div><div><div className="inp-label">Cycli</div><input className="inp" type="number" placeholder="6000" value={f.cycles} onChange={e=>s("cycles",e.target.value)}/></div></div>
    <div style={{maxWidth:130}}><div className="inp-label">Garantie (j)</div><input className="inp" type="number" placeholder="10" value={f.warranty} onChange={e=>s("warranty",e.target.value)}/></div>
    <button className="btn blue full" disabled={!ok} onClick={()=>{onAdd({...f,id:Date.now(),kwh:+f.kwh,price:+f.price,cycles:+f.cycles,warranty:+f.warranty,isAlpha:false});setF(e0);}}>Toevoegen</button>
  </div>);}

// ══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const[activeTab,setActiveTab]=useState("configuratie");
  const[query,setQuery]=useState("");const[suggs,setSuggs]=useState([]);
  const[coords,setCoords]=useState(null);const[displayName,setDisplayName]=useState("");
  const[slope,setSlope]=useState(35);const[orientation,setOrientation]=useState("Z");
  const[activeLayer,setActiveLayer]=useState("dsm");
  const[mapReady,setMapReady]=useState(false);

  // GRB state
  const[grbStatus,setGrbStatus]=useState("idle");
  const[buildingCoords,setBuildingCoords]=useState(null);
  const[detectedArea,setDetectedArea]=useState(null);

  // DHM analyse state
  const[dhmStatus,setDhmStatus]=useState("idle");// idle|loading|ok|error
  const[detectedFaces,setDetectedFaces]=useState(null);
  const[selFaceIdx,setSelFaceIdx]=useState(0);

  const leafRef=useRef(null);const markerRef=useRef(null);
  const dhmLayerRef=useRef(null);const searchTO=useRef(null);
  const roofLayerRef=useRef(null);const panelLayerRef=useRef(null);

  const[panels,setPanels]=useState(DEFAULT_PANELS);
  const[selPanelId,setSelPanelId]=useState(1);
  const selPanel=panels.find(p=>p.id===selPanelId)||panels[0];

  const[inverters]=useState(DEFAULT_INVERTERS);
  const[selInvId,setSelInvId]=useState(null);
  const selInv=inverters.find(i=>i.id===selInvId)||null;
  const[invFilter,setInvFilter]=useState("alle");

  const effectiveArea=detectedArea||80;
  const autoPanels=selPanel?Math.floor((effectiveArea*.75)/selPanel.area):0;
  const[customCount,setCustomCount]=useState(null);
  const panelCount=customCount!==null?customCount:autoPanels;

  const[batteries,setBatteries]=useState(DEFAULT_BATTERIES);
  const[battEnabled,setBattEnabled]=useState(false);
  const[selBattId,setSelBattId]=useState(4);
  const selBatt=batteries.find(b=>b.id===selBattId)||batteries[0];
  const[battFilter,setBattFilter]=useState("alle");
  const[results,setResults]=useState(null);
  const[aiText,setAiText]=useState("");const[aiLoading,setAiLoading]=useState(false);
  const[panelsDrawn,setPanelsDrawn]=useState(false);

  useEffect(()=>{if(customCount!==null&&customCount>autoPanels)setCustomCount(autoPanels);},[autoPanels]);

  // DHM face selectie → update slope & orientation
  const selectFace=useCallback((idx,faces)=>{
    const f=(faces||detectedFaces)?.[idx];
    if(!f) return;
    setSelFaceIdx(idx);
    setOrientation(f.orientation);
    setSlope(f.slope);
  },[detectedFaces]);

  // Herteken dak bij oriëntatie/coords wijziging
  const redrawRoof=useCallback(()=>{
    if(!leafRef.current||!buildingCoords||!window.L) return;
    const L=window.L,map=leafRef.current;
    if(roofLayerRef.current){map.removeLayer(roofLayerRef.current);roofLayerRef.current=null;}
    if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;setPanelsDrawn(false);}
    roofLayerRef.current=drawRealRoof(map,L,buildingCoords,orientation);
  },[buildingCoords,orientation]);
  useEffect(()=>{if(mapReady&&buildingCoords) redrawRoof();},[mapReady,buildingCoords,orientation]);

  // Herteken panelen live bij aanpassen aantal/paneel
  useEffect(()=>{
    if(!panelsDrawn||!buildingCoords||!selPanel||!leafRef.current||!window.L||!coords) return;
    const L=window.L,map=leafRef.current;
    if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
    panelLayerRef.current=drawPanelLayer(map,L,buildingCoords,coords.lat,panelCount,selPanel,orientation);
  },[panelCount,selPanel,panelsDrawn]);

  // Leaflet init
  useEffect(()=>{
    const lnk=document.createElement("link");lnk.rel="stylesheet";
    lnk.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(lnk);
    const scr=document.createElement("script");
    scr.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    scr.onload=()=>setMapReady(true);document.head.appendChild(scr);
  },[]);
  useEffect(()=>{
    if(!mapReady||leafRef.current) return;
    const L=window.L,map=L.map("leaflet-map",{center:[50.85,4.35],zoom:8});
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{attribution:"© OSM © CARTO",maxZoom:21}).addTo(map);
    leafRef.current=map;
  },[mapReady]);
  useEffect(()=>{
    if(!leafRef.current||!mapReady) return;
    const L=window.L,map=leafRef.current;
    if(dhmLayerRef.current) map.removeLayer(dhmLayerRef.current);
    const lyr=L.tileLayer.wms(DHM_WMS,{
      layers:activeLayer==="dsm"?"DHMVII_DSM_1m":"DHMVII_DTM_1m",
      format:"image/png",transparent:true,opacity:.55,
      attribution:"© Digitaal Vlaanderen",version:"1.3.0"
    });lyr.addTo(map);dhmLayerRef.current=lyr;
  },[activeLayer,mapReady]);

  useEffect(()=>{
    if(!query||query.length<3){setSuggs([]);return;}
    clearTimeout(searchTO.current);
    searchTO.current=setTimeout(async()=>{
      try{const r=await fetch(`${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=be`);setSuggs(await r.json());}catch{}
    },350);
  },[query]);

  const selectAddr=async(item)=>{
    setQuery(item.display_name.split(",").slice(0,2).join(","));
    const lat=parseFloat(item.lat),lng=parseFloat(item.lon);
    setCoords({lat,lng});setDisplayName(item.display_name);setSuggs([]);
    setPanelsDrawn(false);setBuildingCoords(null);setDetectedArea(null);
    setDetectedFaces(null);setDhmStatus("idle");setGrbStatus("loading");

    if(leafRef.current&&mapReady){
      const L=window.L,map=leafRef.current;
      map.setView([lat,lng],19);
      if(markerRef.current) map.removeLayer(markerRef.current);
      const icon=L.divIcon({html:`<div style="width:9px;height:9px;background:#f5a623;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px #f5a623"></div>`,iconSize:[9,9],iconAnchor:[4,4],className:""});
      markerRef.current=L.marker([lat,lng],{icon}).addTo(map);
    }

    // Stap 1: GRB gebouwcontour
    let lCoords=null;
    try{
      const geo=await fetchGRBBuilding(lat,lng);
      const bld=findBuilding(geo,lat,lng);
      if(bld){
        const ring=bld.geometry.type==="Polygon"?bld.geometry.coordinates[0]:bld.geometry.coordinates[0][0];
        lCoords=geoToLeaflet(ring);
        setDetectedArea(Math.round(polyAreaM2(lCoords)));
        setBuildingCoords(lCoords);
        setCustomCount(null);
        setGrbStatus("ok");
      } else { setGrbStatus("fallback"); }
    }catch(e){console.warn("GRB:",e);setGrbStatus("fallback");}

    // Stap 2: DHM helling & richting analyse
    const bc=lCoords||(()=>{
      const mLat=111320,mLng=111320*Math.cos(lat*Math.PI/180);
      const w=Math.sqrt(80*1.6),d=80/w;
      const dLat=(d/2)/mLat,dLng=(w/2)/mLng;
      return[[lat+dLat,lng-dLng],[lat+dLat,lng+dLng],[lat-dLat,lng+dLng],[lat-dLat,lng-dLng]];
    })();
    if(!lCoords){setBuildingCoords(bc);setDetectedArea(80);}

    setDhmStatus("loading");
    try{
      const faces=await analyzeDHM(bc);
      if(faces&&faces.length>0){
        setDetectedFaces(faces);
        setSelFaceIdx(0);
        setOrientation(faces[0].orientation);
        setSlope(faces[0].slope);
        setDhmStatus("ok");
      } else {
        setDhmStatus("error");
      }
    }catch(e){
      console.warn("DHM analyse:",e);
      setDhmStatus("error");
    }
  };

  const calculate=async()=>{
    if(!coords||!selPanel||!buildingCoords) return;
    const irr=getSolarIrr(orientation,slope);
    const actualArea=panelCount*selPanel.area;
    const annualKwh=Math.round(actualArea*irr*(selPanel.eff/100));
    const co2=Math.round(annualKwh*.202);
    const coverage=Math.round((annualKwh/3500)*100);
    const investPanels=Math.round(panelCount*selPanel.price+(selInv?selInv.price:1200));
    const annualBase=Math.round(annualKwh*.28);
    const paybackBase=Math.round(investPanels/annualBase);
    let battResult=null;
    if(battEnabled&&selBatt){
      const extra=Math.min(annualKwh*.70,annualKwh)-annualKwh*.30;
      const extraSav=Math.round(extra*.28),totSav=annualBase+extraSav,totInv=investPanels+selBatt.price;
      battResult={extraSav,totSav,totInv,payback:Math.round(totInv/totSav)};
    }
    setResults({irr,panelCount,actualArea:Math.round(actualArea),annualKwh,co2,coverage,
      investPanels,annualBase,paybackBase,battResult,panel:selPanel,inv:selInv,batt:battEnabled?selBatt:null,
      detectedArea,grbOk:grbStatus==="ok",dhmOk:dhmStatus==="ok",orientation,slope});
    if(leafRef.current&&window.L){
      const L=window.L,map=leafRef.current;
      if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
      panelLayerRef.current=drawPanelLayer(map,L,buildingCoords,coords.lat,panelCount,selPanel,orientation);
      setPanelsDrawn(true);
    }
    setActiveTab("resultaten");setAiLoading(true);setAiText("");
    try{
      const dhmInfo=dhmStatus==="ok"&&detectedFaces?`\nDHM LiDAR-analyse: ${detectedFaces.map(f=>`${f.orientation} ${f.slope}° (${f.pct}%)`).join(", ")}`:"\nHandmatige helling/richting invoer.";
      const invStr=selInv?`\nOmvormer: ${selInv.brand} ${selInv.model} (${selInv.kw}kW, €${selInv.price})`:"Geen omvormer.";
      const battStr=battResult?`\nBatterij: ${selBatt.brand} ${selBatt.model} (${selBatt.kwh}kWh, €${selBatt.price})\n- Extra: €${battResult.extraSav}/j · Totaal: €${battResult.totSav}/j · Invest: €${battResult.totInv.toLocaleString()} · Terugverdien: ${battResult.payback}j`:"Geen batterij.";
      const resp=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,
          messages:[{role:"user",content:
            `Zonne-energie expert Vlaanderen. Beknopt professioneel advies in het Nederlands:\n\nLocatie: ${displayName}\nDak: ${grbStatus==="ok"?"Reële GRB-contour":"Schatting"} · ${detectedArea||80} m²${dhmInfo}\nPaneel: ${selPanel.brand} ${selPanel.model} (${selPanel.watt}W, ${selPanel.eff}%)\nAantal: ${panelCount} · ${Math.round(actualArea)} m² · ${((panelCount*selPanel.watt)/1000).toFixed(1)} kWp\nHelling: ${slope}° ${orientation} · ${irr} kWh/m²/j\n${invStr}\nOpbrengst: ${annualKwh} kWh/j · CO₂: ${co2} kg/j\nInvestering: €${investPanels.toLocaleString()} · Besparing: €${annualBase}/j · Terugverdien: ${paybackBase}j\n${battStr}\n\nMax 180 woorden:\n1. Kwaliteit dak & paneelkeuze (gebruik de LiDAR-gegevens)\n2. AlphaESS G3 synergie\n3. Vlaamse premies (capaciteitstarief, BTW 6%, REG-premie)`
          }]})
      });
      const d=await resp.json();
      setAiText(d.content?.find(b=>b.type==="text")?.text||"Analyse niet beschikbaar.");
    }catch{setAiText("AI-analyse tijdelijk niet beschikbaar.");}
    setAiLoading(false);
  };

  const filteredInv=invFilter==="alle"?inverters:inverters.filter(i=>i.fase===invFilter);
  const filteredBatt=battFilter==="alle"?batteries:battFilter==="alpha"?batteries.filter(b=>b.isAlpha):batteries.filter(b=>!b.isAlpha);
  const zq=ZONE_Q[orientation]||ZONE_Q.Z;

  const TABS=[
    {k:"configuratie",l:"01 Configuratie"},{k:"panelen",l:"02 Panelen"},
    {k:"omvormers",l:"03 AlphaESS Omvormers"},{k:"batterij",l:"04 Batterij"},
    {k:"resultaten",l:"05 Resultaten"}
  ];

  return(<><style>{STYLES}</style>
  <div className="app">
    <header className="header">
      <div className="logo">☀️</div>
      <div className="header-text">
        <h1>ZonneDak Analyzer</h1>
        <p>GRB Gebouwcontouren · DHM Vlaanderen II LiDAR Dakanalyse · AlphaESS G3</p>
      </div>
      <div className="badge">GRB · DHMV II · WCS</div>
    </header>
    <div className="tabs">{TABS.map(t=><button key={t.k} className={`tab ${activeTab===t.k?"active":""}`} onClick={()=>setActiveTab(t.k)}>{t.l}</button>)}</div>
    <div className="main">
      <aside className="sidebar">
        {/* Locatie */}
        <div>
          <div className="sl">Locatie</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <div className="sugg-wrap">
              <input className="inp" placeholder="Adres in Vlaanderen..." value={query} onChange={e=>setQuery(e.target.value)}/>
              {suggs.length>0&&<div className="sugg">{suggs.map((s,i)=><div key={i} className="sugg-item" onClick={()=>selectAddr(s)}>{s.display_name}</div>)}</div>}
            </div>
            {coords&&<div className="coord-row"><div><span>LAT </span>{coords.lat.toFixed(5)}</div><div><span>LNG </span>{coords.lng.toFixed(5)}</div></div>}
            {grbStatus==="loading"&&<div className="info-box" style={{display:"flex",alignItems:"center",gap:7}}><div className="spinner"/>Gebouwcontour laden (GRB)...</div>}
            {grbStatus==="ok"&&<div className="info-box grb-ok"><strong>✅ GRB contour geladen</strong> · {detectedArea} m²</div>}
            {grbStatus==="fallback"&&<div className="info-box warn"><strong>⚠️ GRB niet beschikbaar</strong> · Schatting gebruikt</div>}
          </div>
        </div>

        {/* DHM Dakanalyse */}
        {(dhmStatus!=="idle"||grbStatus!=="idle")&&(
          <div>
            <div className="sl">LiDAR Dakanalyse</div>
            {dhmStatus==="loading"&&(
              <div className="info-box" style={{display:"flex",flexDirection:"column",gap:5}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}><div className="spinner cyan"/>Hoogtedata ophalen via DHM WCS...</div>
                <div className="dhm-progress"><div className="dhm-progress-fill"/></div>
                <div style={{fontSize:7,color:"var(--muted)"}}>DSM + DTM · Horn's methode · Lambert 72</div>
              </div>
            )}
            {dhmStatus==="ok"&&detectedFaces&&(
              <div>
                <div className="info-box dhm-ok" style={{marginBottom:6}}>
                  <strong>✅ {detectedFaces.length} dakvlak{detectedFaces.length>1?"ken":""} gedetecteerd via LiDAR</strong><br/>
                  Helling en richting automatisch bepaald.
                </div>
                <div className="face-grid">
                  {detectedFaces.map((f,i)=>{
                    const q=ZONE_Q[f.orientation]||ZONE_Q.Z;
                    const goodSide=BEST_SOUTH[f.orientation]!==false;
                    const qLabel=goodSide?q[0].l:q[1].l;
                    const qColor=goodSide?q[0].c:q[1].c;
                    return(
                      <button key={i} className={`face-btn ${selFaceIdx===i?"active":""}`}
                        onClick={()=>selectFace(i,detectedFaces)}>
                        <span className="face-lbl">{f.orientation} · {f.slope}°</span>
                        <span className="face-sub">{f.pct}% v. dak · {f.avgHeight}m hoogte</span>
                        <span style={{fontSize:7,color:selFaceIdx===i?"var(--alpha)":qColor,marginTop:1,display:"block"}}>{qLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {dhmStatus==="error"&&(
              <div className="info-box warn">
                <strong>⚠️ LiDAR analyse niet beschikbaar</strong><br/>
                Stel helling en richting handmatig in.
              </div>
            )}
          </div>
        )}

        <div className="divider"/>

        {/* Dakparameters */}
        <div>
          <div className="sl">Dakparameters {dhmStatus==="ok"&&<span style={{color:"var(--alpha)",fontSize:7}}>· LiDAR</span>}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {grbStatus!=="ok"&&<div className="sl-item"><label>Dakoppervlak <span>80 m²</span></label><input type="range" min="20" max="300" defaultValue={80} onChange={e=>setDetectedArea(+e.target.value)}/></div>}
            {grbStatus==="ok"&&<div style={{padding:"5px 9px",background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:5,fontSize:8,color:"var(--muted)"}}>Oppervlak: <span style={{color:"var(--green)",fontWeight:600}}>{detectedArea} m²</span> (GRB)</div>}
            <div className="sl-item"><label>Hellingshoek <span style={{color:dhmStatus==="ok"?"var(--alpha)":"var(--amber)"}}>{slope}° {dhmStatus==="ok"?"· LiDAR":""}</span></label><input type="range" min="5" max="90" value={slope} onChange={e=>setSlope(+e.target.value)}/></div>
          </div>
        </div>
        <div>
          <div className="sl">Oriëntatie {dhmStatus==="ok"&&<span style={{color:"var(--alpha)",fontSize:7}}>· LiDAR</span>}</div>
          <div className="orient-grid">
            {["N","NO","O","ZO","Z","ZW","W","NW"].map(o=>{
              const isDhm=dhmStatus==="ok"&&detectedFaces?.some(f=>f.orientation===o);
              return(<button key={o} className={`orient-btn ${orientation===o?"active":""} ${isDhm&&orientation!==o?"dhm":""}`}
                onClick={()=>setOrientation(o)}>{o}{isDhm&&<span style={{fontSize:6}}>◉</span>}</button>);
            })}
          </div>
          {coords&&<div style={{display:"flex",gap:5,marginTop:6}}>
            <div style={{flex:1,padding:"4px 7px",background:`${zq[0].c}22`,border:`1px solid ${zq[0].c}55`,borderRadius:4,fontSize:8,color:zq[0].c}}>Z: {zq[0].l}</div>
            <div style={{flex:1,padding:"4px 7px",background:`${zq[1].c}22`,border:`1px solid ${zq[1].c}55`,borderRadius:4,fontSize:8,color:zq[1].c}}>N: {zq[1].l}</div>
          </div>}
        </div>

        <div className="divider"/>

        {/* Paneel */}
        <div>
          <div className="sl">Geselecteerd paneel</div>
          <div className="card selected" style={{cursor:"default"}}>
            <div className="card-name">{selPanel?.model}</div><div className="card-brand">{selPanel?.brand}</div>
            <div className="chips"><span className="chip gold">{selPanel?.watt}W</span><span className="chip">{selPanel?.eff}% eff</span><span className="chip">€{selPanel?.price}/st</span></div>
          </div>
          <button className="btn sec full" style={{marginTop:5}} onClick={()=>setActiveTab("panelen")}>Paneel wijzigen →</button>
        </div>

        {/* Omvormer */}
        <div>
          <div className="sl">AlphaESS Omvormer</div>
          {selInv?(<div className="inv-card selected" style={{cursor:"default"}}>
            <div className="alpha-badge">⚡ AlphaESS G3</div>
            <div className="card-name">{selInv.model}</div>
            <div className="chips"><span className="chip alpha-c">{selInv.kw}kW</span><span className="chip">€{selInv.price.toLocaleString()}</span></div>
          </div>):(
            <div className="info-box" style={{fontSize:8}}>Geen omvormer · forfait €1.200</div>
          )}
          <button className="btn alpha full" style={{marginTop:5}} onClick={()=>setActiveTab("omvormers")}>{selInv?"Omvormer wijzigen →":"AlphaESS omvormer kiezen →"}</button>
        </div>

        {/* Aantal */}
        <div>
          <div className="sl">Aantal panelen</div>
          <div className="pce">
            <div className="pce-top">
              <span className="pce-title">Klant keuze</span>
              <span className="pce-reset" onClick={()=>setCustomCount(null)}>{customCount!==null?`↩ Reset (max: ${autoPanels})`:`Auto: ${autoPanels}`}</span>
            </div>
            <div className="pce-controls">
              <button className="pce-btn" onClick={()=>setCustomCount(Math.max(1,(customCount??autoPanels)-1))}>−</button>
              <div><div className="pce-val">{panelCount}</div><div className="pce-sub">{((panelCount*(selPanel?.watt||400))/1000).toFixed(1)} kWp</div></div>
              <button className="pce-btn" onClick={()=>setCustomCount(Math.min(autoPanels+10,(customCount??autoPanels)+1))}>+</button>
            </div>
          </div>
        </div>

        {/* Batterij */}
        <div>
          <div className="sl">Thuisbatterij</div>
          <div className="toggle-row" style={{marginBottom:5}}>
            <span className="toggle-lbl">{battEnabled?`🔋 ${selBatt?.brand} ${selBatt?.model}`:"Geen batterij"}</span>
            <label className="toggle"><input type="checkbox" checked={battEnabled} onChange={e=>setBattEnabled(e.target.checked)}/><span className="tslider"/></label>
          </div>
          {battEnabled&&<button className="btn blue full" onClick={()=>setActiveTab("batterij")}>Batterij wijzigen →</button>}
        </div>

        <div className="divider"/>
        <button className="btn full" onClick={calculate} disabled={!coords||aiLoading||!buildingCoords||grbStatus==="loading"||dhmStatus==="loading"}>
          {aiLoading?<><div className="spinner"/>Analyseren...</>:
           dhmStatus==="loading"?<><div className="spinner cyan"/>LiDAR analyseren...</>:
           "☀️ Bereken & toon panelen op dak"}
        </button>
        <div className="info-box">
          <strong>📡 Databronnen</strong><br/>
          GRB Vlaanderen · Reële gebouwcontouren<br/>
          DHM WCS · DSM + DTM · 1m resolutie · Horn's methode<br/>
          © Agentschap Digitaal Vlaanderen
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="content-area">
        {activeTab==="configuratie"&&(
          <div className="map-area">
            <div id="leaflet-map" style={{height:"100%"}}/>
            <div className="map-btns">
              <button className={`map-btn ${activeLayer==="dsm"?"active":""}`} onClick={()=>setActiveLayer("dsm")}>DSM — Oppervlaktemodel</button>
              <button className={`map-btn ${activeLayer==="dtm"?"active":""}`} onClick={()=>setActiveLayer("dtm")}>DTM — Terreinmodel</button>
            </div>
            {(grbStatus==="ok"||dhmStatus==="ok")&&(
              <div className="status-pill">
                {grbStatus==="ok"&&<span style={{color:"var(--green)"}}>GRB ✅</span>}
                {dhmStatus==="ok"&&<span style={{color:"var(--alpha)"}}>LiDAR ✅</span>}
                {dhmStatus==="loading"&&<><div className="spinner cyan"/><span style={{color:"var(--alpha)"}}>LiDAR...</span></>}
                {grbStatus==="ok"&&<span style={{color:"var(--muted)"}}>{detectedArea} m²</span>}
                {dhmStatus==="ok"&&detectedFaces&&<span style={{color:"var(--muted)"}}>{orientation} {slope}°</span>}
              </div>
            )}
            {coords&&<div className="map-legend">
              <div className="legend-title">Dakpotentieel</div>
              <div className="legend-row"><div className="legend-dot" style={{background:"#22c55e"}}/>Optimaal (Z/ZO/ZW)</div>
              <div className="legend-row"><div className="legend-dot" style={{background:"#f59e0b"}}/>Goed (O/W)</div>
              <div className="legend-row"><div className="legend-dot" style={{background:"#ef4444"}}/>Minder geschikt (N)</div>
              <div className="legend-row"><div className="legend-dot" style={{background:"#1d4ed8"}}/>Geplaatste panelen</div>
              {dhmStatus==="ok"&&<div style={{marginTop:4,color:"var(--alpha)",fontSize:7}}>◉ LiDAR-gedetecteerde richting</div>}
            </div>}
          </div>
        )}

        {activeTab==="panelen"&&<div className="section">
          <div className="sl">Panelenlijst</div>
          <div className="list">{panels.map(p=><PanelCard key={p.id} p={p} selected={p.id===selPanelId} onSelect={id=>{setSelPanelId(id);setCustomCount(null);}} onDelete={id=>setPanels(ps=>ps.filter(x=>x.id!==id))} canDelete={panels.length>1}/>)}</div>
          <NewPanelForm onAdd={p=>setPanels(ps=>[...ps,p])}/>
        </div>}

        {activeTab==="omvormers"&&<div className="section">
          <div className="sl">AlphaESS SMILE-G3 Omvormers</div>
          <div className="info-box alpha-info"><strong>🔆 AlphaESS SMILE-G3</strong> · LiFePO4 · 10j garantie · IP65 · 97%+ eff.<br/>Compatibel met Fluvius slimme meter · Jabba · AlphaCloud · Installatie ±€800–1.500 extra.</div>
          <div className="filter-row">{["alle","1-fase","3-fase"].map(f=><button key={f} className={`filter-btn af ${invFilter===f?"active":""}`} onClick={()=>setInvFilter(f)}>{f}</button>)}</div>
          {selInv&&<div style={{display:"flex",justifyContent:"flex-end"}}><button className="btn sec sm" onClick={()=>setSelInvId(null)}>✕ Verwijder keuze</button></div>}
          <div className="list">{filteredInv.map(inv=><InverterCard key={inv.id} inv={inv} selected={inv.id===selInvId} onSelect={setSelInvId}/>)}</div>
        </div>}

        {activeTab==="batterij"&&<div className="section">
          <div className="sl">Thuisbatterijen</div>
          <div className="toggle-row"><span className="toggle-lbl" style={{fontSize:10}}>Batterij opnemen in terugverdienberekening</span><label className="toggle"><input type="checkbox" checked={battEnabled} onChange={e=>setBattEnabled(e.target.checked)}/><span className="tslider"/></label></div>
          <div className="info-box alpha-info"><strong>🔋 AlphaESS G3</strong> · LiFePO4 · 1C · 10.000 cycli · 95% DoD · 10j garantie</div>
          <div className="filter-row">{[["alle","Alle"],["alpha","AlphaESS G3"],["overig","Andere"]].map(([k,l])=><button key={k} className={`filter-btn ${battFilter===k?"active":""}`} onClick={()=>setBattFilter(k)}>{l}</button>)}</div>
          <div className="list">{filteredBatt.map(b=><BattCard key={b.id} b={b} selected={b.id===selBattId} onSelect={setSelBattId} onDelete={id=>setBatteries(bs=>bs.filter(x=>x.id!==id))} canDelete={DEFAULT_BATTERIES.findIndex(d=>d.id===b.id)===-1}/>)}</div>
          <NewBattForm onAdd={b=>setBatteries(bs=>[...bs,b])}/>
        </div>}

        {activeTab==="resultaten"&&(results?(
          <div className="results-wrap">
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {results.grbOk&&<div style={{padding:"5px 9px",background:"rgba(34,197,94,.07)",border:"1px solid rgba(34,197,94,.3)",borderRadius:5,fontSize:8,color:"var(--green)"}}>✅ GRB dakcontour · {results.detectedArea} m²</div>}
              {results.dhmOk&&<div style={{padding:"5px 9px",background:"var(--alpha-glow)",border:"1px solid rgba(34,211,238,.3)",borderRadius:5,fontSize:8,color:"var(--alpha)"}}>✅ LiDAR helling · {results.orientation} {results.slope}°</div>}
            </div>
            <div><div className="sl" style={{marginBottom:7}}>Systeemoverzicht</div>
              <div className="results-grid">
                <div className="rc"><div className="rc-label">Paneel</div><div className="rc-num" style={{fontSize:11,lineHeight:1.3}}>{results.panel.model}</div><div className="rc-unit">{results.panel.brand} · {results.panel.watt}W</div></div>
                {results.inv&&<div className="rc alpha-rc"><div className="rc-label">AlphaESS Omvormer</div><div className="rc-num" style={{fontSize:11,lineHeight:1.3}}>{results.inv.model}</div><div className="rc-unit">{results.inv.fase} · {results.inv.kw}kW</div></div>}
                <div className="rc"><div className="rc-label">Installatie</div><div className="rc-num">{results.panelCount}</div><div className="rc-unit">panelen · {results.actualArea} m² · {((results.panelCount*results.panel.watt)/1000).toFixed(1)} kWp</div></div>
                <div className="rc green"><div className="rc-label">Jaarlijkse opbrengst</div><div className="rc-num">{results.annualKwh.toLocaleString()}</div><div className="rc-unit">kWh / jaar</div></div>
                <div className="rc"><div className="rc-label">Irradiantie</div><div className="rc-num">{results.irr}</div><div className="rc-unit">kWh/m²/j · {results.orientation} {results.slope}°</div></div>
                <div className="rc"><div className="rc-label">CO₂ besparing</div><div className="rc-num">{results.co2}</div><div className="rc-unit">kg / jaar</div></div>
                <div className="rc"><div className="rc-label">Dekkingsgraad</div><div className="rc-num">{results.coverage}%</div><div className="rc-unit">van gemiddeld verbruik</div></div>
              </div>
            </div>
            <div style={{padding:"6px 10px",background:"rgba(29,78,216,.1)",border:"1px solid rgba(96,165,250,.3)",borderRadius:5,fontSize:8,color:"#60a5fa"}}>
              🗺️ <strong>Configuratie tab</strong> — {results.panelCount} panelen op het echte dak. Gebruik +/− in sidebar voor aanpassing.
            </div>
            <div><div className="sl" style={{marginBottom:7}}>Terugverdientijd</div>
              <div className="compare-grid">
                <div className="compare-col">
                  <h4>🔆 Alleen zonnepanelen</h4>
                  <div className="crow">Panelen ({results.panelCount}×)<span>€{(results.panelCount*results.panel.price).toLocaleString()}</span></div>
                  {results.inv?<div className="crow">{results.inv.model}<span>€{results.inv.price.toLocaleString()}</span></div>:<div className="crow">Installatie forfait<span>€1.200</span></div>}
                  <div className="crow">Zelfverbruik<span>~30%</span></div>
                  <div className="crow">Besparing/jaar<span>€{results.annualBase}</span></div>
                  <div className="ctotal"><span>Investering</span><span style={{fontSize:11}}>€{results.investPanels.toLocaleString()}</span></div>
                  <div className="ctotal"><span>Terugverdientijd</span><div className="cval">{results.paybackBase} jaar</div></div>
                  <div className="pbar"><div className="pfill" style={{width:`${Math.min(100,(results.paybackBase/25)*100)}%`}}/></div>
                </div>
                {results.battResult?(
                  <div className={`compare-col batt ${results.batt?.isAlpha?"alpha-col":""}`}>
                    <h4>{results.batt?.isAlpha?"⚡🔋":"🔋"} Met {results.batt?.brand} {results.batt?.model}</h4>
                    <div className="crow">Panelen + omvormer<span>€{results.investPanels.toLocaleString()}</span></div>
                    <div className="crow">Batterij ({results.batt?.kwh} kWh)<span>€{results.batt?.price.toLocaleString()}</span></div>
                    <div className="crow">Zelfverbruik<span>~70%</span></div>
                    <div className="crow">Extra besparing<span style={{color:"var(--green)"}}>+€{results.battResult.extraSav}/j</span></div>
                    <div className="crow">Totale besparing<span>€{results.battResult.totSav}/j</span></div>
                    <div className="ctotal"><span>Investering</span><span style={{fontSize:11}}>€{results.battResult.totInv.toLocaleString()}</span></div>
                    <div className="ctotal"><span>Terugverdientijd</span><div className="cval">{results.battResult.payback} jaar</div></div>
                    <div className="pbar"><div className="pfill" style={{width:`${Math.min(100,(results.battResult.payback/25)*100)}%`,background:"linear-gradient(90deg,var(--blue),var(--alpha))"}}/></div>
                  </div>
                ):(
                  <div className="compare-col" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:7,opacity:.5}}>
                    <div style={{fontSize:26}}>🔋</div>
                    <div style={{fontSize:8,textAlign:"center",color:"var(--muted)"}}>Activeer batterij in de Batterij tab</div>
                    <button className="btn blue sm" onClick={()=>setActiveTab("batterij")}>Batterij instellen</button>
                  </div>
                )}
              </div>
            </div>
            <div><div className="sl" style={{marginBottom:6}}>AI Expert Advies</div>
              {aiLoading?<div className="ai-box loading"><div className="spinner"/>Claude analyseert met LiDAR-gegevens...</div>:<div className="ai-box">{aiText}</div>}
            </div>
          </div>
        ):(
          <div className="empty-state">
            <div className="icon">☀️</div>
            <p>Geef een adres in. De app laadt automatisch de GRB-dakcontour en analyseert de dakhellingen en -richtingen via DHM Vlaanderen LiDAR-data.</p>
          </div>
        ))}
      </div>
    </div>
  </div>
  </>);
}

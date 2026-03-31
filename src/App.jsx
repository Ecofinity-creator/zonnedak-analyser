import { useState, useEffect, useRef, useCallback, Component } from "react";

// ── ErrorBoundary: toont foutmelding in plaats van wit scherm ──────────────
class ErrorBoundary extends Component {
  constructor(props){ super(props); this.state={error:null}; }
  static getDerivedStateFromError(e){ return {error:e}; }
  render(){
    if(this.state.error) return(
      <div style={{padding:24,fontFamily:"monospace",background:"#fef2f2",border:"2px solid #dc2626",margin:16,borderRadius:8}}>
        <h2 style={{color:"#dc2626",marginBottom:8}}>⚠️ App fout</h2>
        <pre style={{fontSize:11,color:"#7f1d1d",whiteSpace:"pre-wrap"}}>{String(this.state.error)}</pre>
        <p style={{marginTop:8,fontSize:11,color:"#991b1b"}}>Stuur dit scherm door naar uw ontwikkelaar.</p>
      </div>
    );
    return this.props.children;
  }
}

// ─── Endpoints ──────────────────────────────────────────────────────────────
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const GRB_WFS   = "https://geo.api.vlaanderen.be/GRB/wfs";
const DHM_WMS   = "https://geoservices.informatievlaanderen.be/raadpleegdiensten/DHMVII/wms";
const WCS_URLS  = [
  "https://geo.api.vlaanderen.be/DHMV/wcs",
  "https://geoservices.informatievlaanderen.be/raadpleegdiensten/DHMVII/wcs",
];

// ─── Zonneirradiantie Vlaanderen ─────────────────────────────────────────────
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
// Maandelijkse verdeling zonproductie Vlaanderen (totaal ≈ 1)
const MONTHLY_FACTOR = [0.038,0.056,0.091,0.113,0.128,0.132,0.125,0.110,0.085,0.064,0.037,0.021];
const MONTHS = ["Jan","Feb","Mrt","Apr","Mei","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

const DIRS8 = ["N","NO","O","ZO","Z","ZW","W","NW"];
const ZONE_Q = {
  Z: [{c:"#16a34a",l:"Optimaal ☀️"},{c:"#dc2626",l:"Ongeschikt ✗"}],
  N: [{c:"#dc2626",l:"Ongeschikt ✗"},{c:"#16a34a",l:"Optimaal ☀️"}],
  ZO:[{c:"#22c55e",l:"Goed ☀️"},    {c:"#ea580c",l:"Matig"}],
  ZW:[{c:"#22c55e",l:"Goed ☀️"},    {c:"#ea580c",l:"Matig"}],
  O: [{c:"#d97706",l:"Matig"},      {c:"#d97706",l:"Matig"}],
  W: [{c:"#d97706",l:"Matig"},      {c:"#d97706",l:"Matig"}],
  NO:[{c:"#ea580c",l:"Matig"},      {c:"#22c55e",l:"Goed ☀️"}],
  NW:[{c:"#ea580c",l:"Matig"},      {c:"#22c55e",l:"Goed ☀️"}],
};
const BEST_SOUTH={Z:true,ZO:true,ZW:true,O:true,W:true,N:false,NO:false,NW:false};

function getSolarIrr(o,s){
  const t=SOLAR_TABLE[o]||SOLAR_TABLE.Z;
  return t[[15,30,45,60,90].reduce((a,b)=>Math.abs(b-s)<Math.abs(a-s)?b:a)];
}

// ════════════════════════════════════════════════════════════════════════
//  LAMBERT72 ↔ WGS84  (volledig inline, geen externe bibliotheek)
//  WGS84 → BD72 (Helmert) → Hayford geografisch → Lambert72 LCC
//  Lambert72 → Hayford geografisch → BD72 (inv. Helmert) → WGS84
// ════════════════════════════════════════════════════════════════════════
const _L72 = (() => {
  const D2R = Math.PI/180;
  // Ellipsoïden
  const aW=6378137, e2W=2/298.257223563-(1/298.257223563)**2;   // WGS84
  const aI=6378388, fI=1/297, e2I=2*fI-fI**2, eI=Math.sqrt(e2I); // Hayford/Internationaal
  // Helmert parameters  WGS84→BD72
  const tx=-106.869,ty=52.2978,tz=-103.724;
  const rx=0.3366/3600*D2R, ry=-0.457/3600*D2R, rz=1.8422/3600*D2R, sc=1-1.2747e-6;
  // LCC parameters
  const phi1=49.8333333*D2R, phi2=51.1666667*D2R, lam0=4.3674867*D2R;
  const FE=150000.013, FN=5400088.438;
  const m_=ph=>Math.cos(ph)/Math.sqrt(1-e2I*Math.sin(ph)**2);
  const t_=ph=>Math.tan(Math.PI/4-ph/2)*((1+eI*Math.sin(ph))/(1-eI*Math.sin(ph)))**(eI/2);
  const m1=m_(phi1),m2=m_(phi2),t1=t_(phi1),t2=t_(phi2);
  const n=(Math.log(m1)-Math.log(m2))/(Math.log(t1)-Math.log(t2));
  const F=m1/(n*t1**n);
  const rho0=aI*F*t_(90*D2R)**n; // ρ bij pool (voor consistentie)

  // Hayford geografisch → ECEF (BD72)
  function hayfToECEF(lat,lng){
    const N=aI/Math.sqrt(1-e2I*Math.sin(lat)**2);
    return [N*Math.cos(lat)*Math.cos(lng), N*Math.cos(lat)*Math.sin(lng), N*(1-e2I)*Math.sin(lat)];
  }
  // Hayford ECEF → geografisch (iteratief)
  function ecefToHayf(Xb,Yb,Zb){
    const p=Math.sqrt(Xb**2+Yb**2), lng=Math.atan2(Yb,Xb);
    let lat=Math.atan2(Zb,p*(1-e2I));
    for(let i=0;i<10;i++){const N=aI/Math.sqrt(1-e2I*Math.sin(lat)**2);lat=Math.atan2(Zb+e2I*N*Math.sin(lat),p);}
    return [lat,lng];
  }

  function toL72(latDeg,lngDeg){
    // WGS84 → ECEF
    const lat=latDeg*D2R, lng=lngDeg*D2R;
    const N=aW/Math.sqrt(1-e2W*Math.sin(lat)**2);
    const X=N*Math.cos(lat)*Math.cos(lng), Y=N*Math.cos(lat)*Math.sin(lng), Z=N*(1-e2W)*Math.sin(lat);
    // Helmert WGS84→BD72
    const Xb=sc*(X+rz*Y-ry*Z)+tx, Yb=sc*(-rz*X+Y+rx*Z)+ty, Zb=sc*(ry*X-rx*Y+Z)+tz;
    // BD72 ECEF → Hayford geografisch
    const [lat72,lng72]=ecefToHayf(Xb,Yb,Zb);
    // Hayford → Lambert72 LCC
    const rho=aI*F*t_(lat72)**n, theta=n*(lng72-lam0);
    return [FE+rho*Math.sin(theta), FN-rho*Math.cos(theta)];
  }

  function fromL72(E,N_){
    // Lambert72 → Hayford geografisch (LCC inversie)
    const dE=E-FE, dN=FN-N_;
    const rho=Math.sign(n)*Math.sqrt(dE**2+dN**2);
    const theta=Math.atan2(dE,dN);
    const t=(rho/(aI*F))**(1/n);
    // Iteratieve inversie van t_()
    let lat=Math.PI/2-2*Math.atan(t);
    for(let i=0;i<15;i++){
      lat=Math.PI/2-2*Math.atan(t*((1-eI*Math.sin(lat))/(1+eI*Math.sin(lat)))**(eI/2));
    }
    const lng=theta/n+lam0;
    // Hayford geografisch → ECEF (BD72)
    const [Xb,Yb,Zb]=hayfToECEF(lat,lng);
    // Inverse Helmert BD72→WGS84 (kleine rotaties: inv ≈ transpose)
    // Correcte inverse Helmert (R^-1 = R^T voor kleine rotaties)
    // Forward: Xb=sc*(X+rz*Y-ry*Z)+tx → Inverse: X=((Xb-tx)-rz*(Yb-ty)+ry*(Zb-tz))/sc
    const Xw=((Xb-tx) - rz*(Yb-ty) + ry*(Zb-tz))/sc;
    const Yw=(rz*(Xb-tx) + (Yb-ty) - rx*(Zb-tz))/sc;
    const Zw=(-ry*(Xb-tx) + rx*(Yb-ty) + (Zb-tz))/sc;
    // WGS84 ECEF → geografisch
    const p=Math.sqrt(Xw**2+Yw**2), lngW=Math.atan2(Yw,Xw);
    let latW=Math.atan2(Zw,p*(1-e2W));
    for(let i=0;i<10;i++){const Nw=aW/Math.sqrt(1-e2W*Math.sin(latW)**2);latW=Math.atan2(Zw+e2W*Nw*Math.sin(latW),p);}
    return [latW/D2R, lngW/D2R];
  }

  return {toL72, fromL72};
})();

const wgs84ToLambert72=(lat,lng)=>_L72.toL72(lat,lng);
const lambert72ToWgs84=(E,N)=>_L72.fromL72(E,N);

// ─── Inline TIFF parser — robuust voor Float32, Int16, UInt16 ────────────────
function parseTIFF(buf){
  if(buf.byteLength<8) throw new Error("Buffer te klein: "+buf.byteLength+" bytes");
  const dv=new DataView(buf);
  const magic=dv.getUint16(0,true);
  const bo=(magic===0x4949); // II=little-endian, MM=big-endian
  const u16=o=>dv.getUint16(o,bo), u32=o=>dv.getUint32(o,bo);
  const f32=o=>dv.getFloat32(o,bo), i16=o=>dv.getInt16(o,bo), i32=o=>dv.getInt32(o,bo);

  if((magic!==0x4949&&magic!==0x4D4D)||u16(2)!==42)
    throw new Error(`Geen TIFF (magic: 0x${magic.toString(16)}, version: ${u16(2)})`);

  // Lees alle IFD-tags
  let ifo=u32(4); const nT=u16(ifo); ifo+=2;
  let W=0,H=0,bps=32,sfmt=3,nodata=NaN;
  let soffs=[],sbytes=[],toffs=[],tbytes=[],tw=256,th=256;

  const readVals=(type,cnt,vp)=>{
    const sizes={1:1,2:1,3:2,4:4,5:8,6:1,7:1,8:2,9:4,10:8,11:4,12:8};
    const sz=sizes[type]||4;
    const readOne=(o)=>{
      if(type===1||type===7) return dv.getUint8(o);
      if(type===2) return dv.getUint8(o); // ASCII
      if(type===3) return u16(o);
      if(type===4) return u32(o);
      if(type===6) return dv.getInt8(o);
      if(type===8) return i16(o);
      if(type===9) return i32(o);
      if(type===11) return f32(o);
      if(type===12) return dv.getFloat64(o,bo);
      return u32(o);
    };
    if(cnt*sz<=4){
      return Array.from({length:cnt},(_,i)=>readOne(vp+i*sz));
    }
    const off=u32(vp);
    return Array.from({length:cnt},(_,i)=>readOne(off+i*sz));
  };

  for(let i=0;i<nT;i++){
    const t=ifo+i*12;
    const tag=u16(t), type=u16(t+2), cnt=u32(t+4);
    const vs=readVals(type,cnt,t+8), v0=vs[0];
    if(tag===256) W=v0;        // ImageWidth
    if(tag===257) H=v0;        // ImageLength
    if(tag===258) bps=v0;      // BitsPerSample
    if(tag===273) soffs=vs;    // StripOffsets
    if(tag===279) sbytes=vs;   // StripByteCounts
    if(tag===322) tw=v0;       // TileWidth
    if(tag===323) th=v0;       // TileLength
    if(tag===324) toffs=vs;    // TileOffsets
    if(tag===325) tbytes=vs;   // TileByteCounts
    if(tag===339) sfmt=v0;     // SampleFormat: 1=uint, 2=int, 3=float
    if(tag===42113){           // GDAL_NODATA (als ASCII string)
      const noStr=vs.map(c=>String.fromCharCode(c)).join('').trim();
      nodata=parseFloat(noStr)||NaN;
    }
  }

  if(!W||!H) throw new Error(`TIFF dimensies ongeldig: ${W}×${H}`);

  const bpS=bps/8;
  const data=new Float32Array(W*H).fill(NaN);

  // Kies de juiste lezer op basis van SampleFormat + BitsPerSample
  const rd=(o)=>{
    if(sfmt===3){ // Float
      if(bps===32) return f32(o);
      if(bps===64) return dv.getFloat64(o,bo);
    }
    if(sfmt===2){ // Signed int
      if(bps===16) return i16(o);
      if(bps===32) return i32(o);
      if(bps===8)  return dv.getInt8(o);
    }
    // Unsigned int (sfmt===1 of onbekend)
    if(bps===16) return u16(o);
    if(bps===32) return u32(o);
    if(bps===8)  return dv.getUint8(o);
    return f32(o);
  };

  const isNodata=(v)=>!isFinite(v)||v<-9990||v>99999||(isFinite(nodata)&&Math.abs(v-nodata)<0.01);

  if(toffs.length>0){
    // Tiled TIFF
    const nTX=Math.ceil(W/tw);
    toffs.forEach((to,ti)=>{
      const tc=ti%nTX, tr=Math.floor(ti/nTX);
      for(let r=0;r<th;r++) for(let c=0;c<tw;c++){
        const px=tc*tw+c, py=tr*th+r;
        if(px<W&&py<H){
          const v=rd(to+(r*tw+c)*bpS);
          data[py*W+px]=isNodata(v)?NaN:v;
        }
      }
    });
  } else {
    // Stripped TIFF
    let idx=0;
    soffs.forEach((so,si)=>{
      const ns=Math.round(sbytes[si]/bpS);
      for(let j=0;j<ns&&idx<W*H;j++){
        const v=rd(so+j*bpS);
        data[idx++]=isNodata(v)?NaN:v;
      }
    });
  }

  // Diagnostics
  const valid=Array.from(data).filter(v=>!isNaN(v));
  if(valid.length>0){
    const mn=Math.min(...valid.slice(0,1000)), mx=Math.max(...valid.slice(0,1000));
    console.log(`TIFF ${W}×${H} bps=${bps} fmt=${sfmt} nodata=${nodata}: ${valid.length} geldig, range ${mn.toFixed(1)}–${mx.toFixed(1)}m`);
  } else {
    console.warn(`TIFF ${W}×${H} bps=${bps} fmt=${sfmt}: ALLE WAARDEN NODATA of NaN!`);
  }

  return {data, w:W, h:H};
}

// ─── WCS fetch met coverage-fallback ─────────────────────────────────────────
// DHMVII coverage namen verschillen per endpoint:
// geo.api.vlaanderen.be/DHMV: gebruikt "DHMVII_DSM_1m" en "DHMVII_DTM_1m"
// geoservices: zelfde namen maar soms "DHMV_DSM_1m"
async function fetchWCS(xmin,ymin,xmax,ymax,mw,mh,cov){
  const bbox=`${xmin.toFixed(1)},${ymin.toFixed(1)},${xmax.toFixed(1)},${ymax.toFixed(1)}`;
  const baseParams={
    SERVICE:"WCS",VERSION:"1.0.0",REQUEST:"GetCoverage",
    CRS:"EPSG:31370",RESPONSE_CRS:"EPSG:31370",
    BBOX:bbox,WIDTH:String(mw),HEIGHT:String(mh),FORMAT:"GeoTIFF"
  };

  // Probeer beide coverage-naam varianten
  const covVariants=[cov, cov.replace("DHMVII_","DHMV_"), cov.replace("DHMV_","DHMVII_")];
  let lastErr="";

  for(const url of WCS_URLS){
    for(const covName of covVariants){
      try{
        const p=new URLSearchParams({...baseParams,COVERAGE:covName});
        const r=await fetch(`${url}?${p}`,{mode:"cors"});
        if(!r.ok){lastErr=`HTTP ${r.status} (${covName})`;continue;}
        const ct=(r.headers.get("content-type")||"").toLowerCase();
        if(ct.includes("xml")||ct.includes("html")){
          const txt=await r.text();
          lastErr=`WCS fout (${covName}): ${txt.substring(0,100)}`;
          continue;
        }
        const arr=await r.arrayBuffer();
        if(arr.byteLength<100){lastErr=`Response te klein: ${arr.byteLength}b`;continue;}
        console.log(`✅ WCS ${covName}: ${arr.byteLength}b van ${url}`);
        return parseTIFF(arr);
      }catch(e){lastErr=`${covName}@${url.split('/').pop()}: ${e.message}`;}
    }
  }
  throw new Error(`WCS mislukt (${cov}): ${lastErr}`);
}

// ─── Dakpunt analyse: Horn's methode per pixel, met geo-coördinaten ──────────
// ── Hulpfunctie: interpoleer hoogte op exacte Lambert72 positie (bilineair) ──
function sampleRaster(data,w,h,xmin,ymin,xmax,ymax,E,N_){
  const cellW=(xmax-xmin)/w, cellH=(ymax-ymin)/h;
  // Lambert72 → pixel (niet-geheel)
  const fc=(E-xmin)/cellW-0.5;
  const fr=(ymax-N_)/cellH-0.5;
  const c0=Math.floor(fc), r0=Math.floor(fr);
  const tc=fc-c0, tr=fr-r0;
  const get=(r,c)=>{
    const rr=Math.max(0,Math.min(h-1,r)), cc=Math.max(0,Math.min(w-1,c));
    const v=data[rr*w+cc];
    return (isNaN(v)||v<-999||v>9999)?NaN:v;
  };
  // Bilineaire interpolatie
  const v00=get(r0,c0), v01=get(r0,c0+1), v10=get(r0+1,c0), v11=get(r0+1,c0+1);
  if([v00,v01,v10,v11].some(isNaN)) return NaN;
  return v00*(1-tc)*(1-tr)+v01*tc*(1-tr)+v10*(1-tc)*tr+v11*tc*tr;
}

// ── Genereer meetpunten langs gebouwranden EN hoekpunten ─────────────────────
function buildingEdgePoints(buildingCoordsL72,dsmD,dtmD,w,h,xmin,ymin,xmax,ymax){
  const edgePoints=[];
  const cellW=(xmax-xmin)/w, cellH=(ymax-ymin)/h;
  const stepM=Math.max(cellW,cellH); // 1 punt per celgrootte

  const n=buildingCoordsL72.length;
  for(let i=0;i<n;i++){
    const [E0,N0]=buildingCoordsL72[i];
    const [E1,N1]=buildingCoordsL72[(i+1)%n];
    const dist=Math.sqrt((E1-E0)**2+(N1-N0)**2);
    const steps=Math.max(1,Math.ceil(dist/stepM));

    for(let s=0;s<=steps;s++){
      const t=s/steps;
      const E=E0+t*(E1-E0), N_=N0+t*(N1-N0);
      const dsm=sampleRaster(dsmD,w,h,xmin,ymin,xmax,ymax,E,N_);
      const dtm=sampleRaster(dtmD,w,h,xmin,ymin,xmax,ymax,E,N_);
      if(isNaN(dsm)||isNaN(dtm)) continue;
      const relH=dsm-dtm;
      const [lat,lng]=lambert72ToWgs84(E,N_);
      const isCorner=(s===0||s===steps);
      // Randpunten altijd opnemen (ook zonder slope filter)
      edgePoints.push({
        lat,lng,
        relH:+relH.toFixed(2),
        dsm:+dsm.toFixed(2),
        dtm:+dtm.toFixed(2),
        slopeDeg:0, aspectDeg:0, dirIdx:-1,  // -1 = randpunt
        isCorner, isEdge:true,
        edgeIdx:i
      });
    }
  }
  return edgePoints;
}

// ── WGS84 punt-in-polygoon test ───────────────────────────────────────────────
// buildingCoords is Leaflet formaat: [[lat,lng], ...]
// We testen of (lat,lng) binnen die polygoon ligt
function pointInBuildingWGS84(lat,lng,buildingCoords){
  let inside=false;
  const n=buildingCoords.length;
  for(let i=0,j=n-1;i<n;j=i++){
    const[lati,lngi]=buildingCoords[i];
    const[latj,lngj]=buildingCoords[j];
    // Ray-casting in lat/lng ruimte (voldoende nauwkeurig voor gebouwschaal)
    if((lngi>lng)!==(lngj>lng) &&
       lat<(latj-lati)*(lng-lngi)/(lngj-lngi)+lati){
      inside=!inside;
    }
  }
  return inside;
}

// ── Hoofd: raster-analyse + rand/hoekpunten, ENKEL binnen GRB-contour ────────
function computeRoofData(dsmD,dtmD,w,h,xmin,ymin,xmax,ymax,buildingCoordsWGS84){
  const cellW=(xmax-xmin)/w, cellH=(ymax-ymin)/h;
  const roofPoints=[];

  // Debug: log min/max raster waarden
  const dsmVals=Array.from(dsmD).filter(v=>!isNaN(v)&&v>-999&&v<9999);
  const dtmVals=Array.from(dtmD).filter(v=>!isNaN(v)&&v>-999&&v<9999);
  if(dsmVals.length>0){
    const dsmMin=Math.min(...dsmVals.slice(0,500));
    const dsmMax=Math.max(...dsmVals.slice(0,500));
    const dtmMin=Math.min(...dtmVals.slice(0,500));
    const dtmMax=Math.max(...dtmVals.slice(0,500));
    console.log(`DSM raster: min=${dsmMin.toFixed(1)} max=${dsmMax.toFixed(1)} (${dsmVals.length} pixels)`);
    console.log(`DTM raster: min=${dtmMin.toFixed(1)} max=${dtmMax.toFixed(1)} (${dtmVals.length} pixels)`);
    console.log(`Verwachte dakhoogte (DSM-DTM): ${(dsmMax-dtmMin).toFixed(1)}m`);
  } else {
    console.warn("Raster LEEG — WCS gaf geen bruikbare data terug");
  }

  for(let row=0;row<h;row++){
    for(let col=0;col<w;col++){
      const i=row*w+col;
      let dsm=dsmD[i], dtm=dtmD[i];
      // Nodata waarden opvangen (-9999 of extreme waarden)
      if(isNaN(dsm)||isNaN(dtm)||dsm<-999||dtm<-999||dsm>9999||dtm>9999) continue;

      // Lambert72 pixelcentrum → WGS84
      const E=xmin+(col+0.5)*cellW;
      const N_=ymax-(row+0.5)*cellH;
      const [lat,lng]=lambert72ToWgs84(E,N_);

      // FILTER: sla pixels buiten GRB-gebouwcontour over
      if(buildingCoordsWGS84&&!pointInBuildingWGS84(lat,lng,buildingCoordsWGS84)) continue;

      const relH=dsm-dtm;
      if(relH<0.8||relH>40) continue;

      // Horn's methode (clamped neighbours)
      const v=(dr,dc)=>{
        const rr=Math.max(0,Math.min(h-1,row+dr));
        const cc=Math.max(0,Math.min(w-1,col+dc));
        const vi=dsmD[rr*w+cc]; return isNaN(vi)?dsm:vi;
      };
      const[a,b,c,d,f,g,hh,ii]=[v(-1,-1),v(-1,0),v(-1,1),v(0,-1),v(0,1),v(1,-1),v(1,0),v(1,1)];
      const dzdx=((c+2*f+ii)-(a+2*d+g))/(8*cellW);
      const dzdy=((g+2*hh+ii)-(a+2*b+c))/(8*cellH);
      const slopeDeg=Math.atan(Math.sqrt(dzdx**2+dzdy**2))*180/Math.PI;
      const aspectDeg=(90-Math.atan2(-dzdy,dzdx)*180/Math.PI+360)%360;
      const dirIdx=slopeDeg>=4?Math.round(aspectDeg/45)%8:-1;

      roofPoints.push({lat,lng,
        relH:+relH.toFixed(2),
        slopeDeg:+slopeDeg.toFixed(1),
        aspectDeg:+aspectDeg.toFixed(1),
        dirIdx,
        dsm:+dsm.toFixed(2),
        dtm:+dtm.toFixed(2),
        isEdge:false,isCorner:false
      });
    }
  }

  // ── Rand- en hoekpunten langs GRB-gebouwcontour ──
  const bcL72=buildingCoordsWGS84
    ? buildingCoordsWGS84.map(([lat,lng])=>wgs84ToLambert72(lat,lng))
    : null;
  const edgePts=bcL72
    ? buildingEdgePoints(bcL72,dsmD,dtmD,w,h,xmin,ymin,xmax,ymax)
    : [];

  const rawPoints=[...roofPoints,...edgePts];
  if(rawPoints.length<4) return {faces:null,rawPoints,edgePts};

  // ── Face-clustering: enkel hellende dakpixels (dirIdx>=0) ──
  const slopedPts=roofPoints.filter(p=>p.dirIdx>=0);
  const bins=Array(8).fill(null).map(()=>({slopes:[],heights:[],n:0}));
  slopedPts.forEach(p=>{
    bins[p.dirIdx].slopes.push(p.slopeDeg);
    bins[p.dirIdx].heights.push(p.relH);
    bins[p.dirIdx].n++;
  });
  const total=slopedPts.length||1;
  const faces=bins
    .map((b,i)=>({
      orientation:DIRS8[i],
      slope:b.n?Math.round(b.slopes.reduce((a,v)=>a+v)/b.n):0,
      avgH:b.n?+(b.heights.reduce((a,v)=>a+v)/b.n).toFixed(1):0,
      pct:Math.round(b.n/total*100),n:b.n
    }))
    .filter(b=>b.pct>=5)
    .sort((a,b)=>b.n-a.n)
    .slice(0,5);

  return {faces:faces.length?faces:null,rawPoints,edgePts};
}

async function analyzeDHM(bc){
  // bc is buildingCoords: Leaflet [[lat,lng], ...]
  const lats=bc.map(p=>p[0]), lngs=bc.map(p=>p[1]);

  // Bounding box: iets ruimer dan het gebouw
  const swL=wgs84ToLambert72(Math.min(...lats)-.0002, Math.min(...lngs)-.0002);
  const neL=wgs84ToLambert72(Math.max(...lats)+.0002, Math.max(...lngs)+.0002);
  const pad=3; // 3m marge
  const [xmin,ymin,xmax,ymax]=[swL[0]-pad, swL[1]-pad, neL[0]+pad, neL[1]+pad];

  // Resolutie: 1 pixel = ~1 meter
  const mw=Math.min(160,Math.max(10,Math.round(xmax-xmin)));
  const mh=Math.min(160,Math.max(10,Math.round(ymax-ymin)));
  console.log(`DHM bbox L72: ${Math.round(xmin)},${Math.round(ymin)}→${Math.round(xmax)},${Math.round(ymax)}, raster ${mw}×${mh}px`);

  const [dsmR,dtmR]=await Promise.all([
    fetchWCS(xmin,ymin,xmax,ymax,mw,mh,"DHMVII_DSM_1m"),
    fetchWCS(xmin,ymin,xmax,ymax,mw,mh,"DHMVII_DTM_1m"),
  ]);

  // Geef buildingCoords (WGS84 Leaflet) mee voor filtering
  const result=computeRoofData(
    dsmR.data,dtmR.data,dsmR.w,dsmR.h,
    xmin,ymin,xmax,ymax,
    bc  // <── WGS84 Leaflet polygoon voor point-in-polygon filter
  );
  console.log(`DHM resultaat: ${result.rawPoints.length} punten (${result.edgePts?.length||0} rand/hoek), ${result.faces?.length||0} vlakken`);
  return result;
}

// ─── Polygoon helpers ────────────────────────────────────────────────────────
function pointInPoly(pt,poly){
  const[x,y]=pt;let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const[xi,yi]=poly[i],[xj,yj]=poly[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
function clipPolyByLat(poly,keepBelow,mid){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const aS=keepBelow?a[0]<=mid:a[0]>=mid,bS=keepBelow?b[0]<=mid:b[0]>=mid;
    if(aS) out.push(a);
    if(aS!==bS){const t=(mid-a[0])/(b[0]-a[0]);out.push([mid,a[1]+t*(b[1]-a[1])]);}
  }
  return out.length>=3?out:null;
}
function polyAreaM2(lc){
  const mLat=111320,cx=lc.reduce((s,p)=>s+p[0],0)/lc.length,mLng=111320*Math.cos(cx*Math.PI/180);
  let area=0;
  for(let i=0,j=lc.length-1;i<lc.length;j=i++) area+=(lc[i][1]*mLng)*(lc[j][0]*mLat)-(lc[j][1]*mLng)*(lc[i][0]*mLat);
  return Math.abs(area/2);
}
function packPanels(poly,lat,pW,pH,maxN,goodSouth){
  const mLat=111320,mLng=111320*Math.cos(lat*Math.PI/180);
  const pw=pW/mLng,ph=pH/mLat,gap=0.3/mLat;
  const lats=poly.map(p=>p[0]),lngs=poly.map(p=>p[1]);
  const[minLat,maxLat,minLng,maxLng]=[Math.min(...lats),Math.max(...lats),Math.min(...lngs),Math.max(...lngs)];
  const midLat=(minLat+maxLat)/2,margin=0.4/mLat,mLngM=0.4/mLng;
  const sL=(goodSouth?minLat:midLat)+margin,eL=(goodSouth?midLat:maxLat)-margin;
  const panels=[];
  for(let rLat=sL;rLat+ph<=eL&&panels.length<maxN;rLat+=ph+gap)
    for(let rLng=minLng+mLngM;rLng+pw<=maxLng-mLngM&&panels.length<maxN;rLng+=pw+0.2/mLng)
      if(pointInPoly([rLng+pw/2,rLat+ph/2],poly.map(p=>[p[1],p[0]])))
        panels.push({lat:rLat,lng:rLng,ph,pw});
  return panels;
}
function geoToLeaflet(ring){return ring.map(([lo,la])=>[la,lo]);}

// ─── GRB ─────────────────────────────────────────────────────────────────────
async function fetchGRBBuilding(lat,lng){
  const d=0.0015,p=new URLSearchParams({SERVICE:"WFS",VERSION:"2.0.0",REQUEST:"GetFeature",TYPENAMES:"GRB:GBG",OUTPUTFORMAT:"application/json",SRSNAME:"EPSG:4326",BBOX:`${lng-d},${lat-d},${lng+d},${lat+d},EPSG:4326`,COUNT:"50"});
  const r=await fetch(`${GRB_WFS}?${p}`);if(!r.ok) throw new Error(`GRB HTTP ${r.status}`);return r.json();
}
function findBuilding(geojson,lat,lng){
  if(!geojson?.features?.length) return null;
  const cands=[];
  for(const f of geojson.features){
    if(!f.geometry?.coordinates) continue;
    const rings=f.geometry.type==="Polygon"?[f.geometry.coordinates[0]]:f.geometry.coordinates.map(p=>p[0]);
    for(const ring of rings) if(pointInPoly([lng,lat],ring)){const lc=geoToLeaflet(ring);cands.push({f,area:polyAreaM2(lc),lc});}
  }
  if(cands.length>0){cands.sort((a,b)=>a.area-b.area);return cands[0].f;}
  let best=null,bestD=Infinity;
  for(const f of geojson.features){
    const ring=f.geometry?.type==="Polygon"?f.geometry.coordinates[0]:f.geometry?.coordinates?.[0]?.[0];
    if(!ring) continue;
    const cx=ring.reduce((s,p)=>s+p[0],0)/ring.length,cy=ring.reduce((s,p)=>s+p[1],0)/ring.length;
    const d=Math.hypot(cx-lng,cy-lat);if(d<bestD){bestD=d;best=f;}
  }
  return best;
}

// ─── Teamleader ──────────────────────────────────────────────────────────────
async function searchTeamleaderContact(name,token){
  const r=await fetch("https://api.teamleader.eu/contacts.list",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
    body:JSON.stringify({filter:{term:name},page:{size:5}})
  });
  if(!r.ok) throw new Error(`TL ${r.status}`);
  const d=await r.json();return d.data||[];
}

// ─── PDF bibliotheken laden ───────────────────────────────────────────────────
function loadScript(src){
  return new Promise((res,rej)=>{
    if(document.querySelector(`script[src="${src}"]`)){setTimeout(res,200);return;}
    const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);
  });
}
async function loadPdfLibs(){
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  await loadScript("https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js");
}
async function fetchPdfBytes(path){
  try{const r=await fetch(path);if(!r.ok) throw new Error(`HTTP ${r.status}`);return new Uint8Array(await r.arrayBuffer());}
  catch(e){console.warn("Datasheet niet geladen:",path,e.message);return null;}
}

// ─── Default data (specs rechtstreeks uit datasheets) ──────────────────────────
// Datasheet pad relatief aan de app base URL (in /public/datasheets/)
const DS_BASE = import.meta.env.BASE_URL + "datasheets/";

const DEFAULT_PANELS=[
  // ① Qcells Q.TRON BLK S-G3R.12+ BFG 440W — datasheet 2024-05
  // Formaat: 1762×1134×30mm · Gewicht: 20,9 kg · Eff: 22,0% · 25j prod / 30j prestatie
  {id:1,brand:"Qcells",      model:"Q.TRON BLK S-G3R.12+ 440W",   watt:440,area:1.998,eff:22.0,price:195,warranty:25,
   dims:"1762×1134×30mm",weight:"20.9 kg",datasheet:"qcells-440w.pdf"},

  // ② Trina Solar Vertex S+ TSM-NEG18RC.27 500W — datasheet 2024
  // Formaat: 1961×1134×30mm · Gewicht: 23,6 kg · Eff: 22,3% · 15j prod / 30j prestatie
  {id:2,brand:"Trina Solar", model:"Vertex S+ TSM-NEG18RC.27 500W",watt:500,area:2.224,eff:22.3,price:240,warranty:30,
   dims:"1961×1134×30mm",weight:"23.6 kg",datasheet:"trina-500w.pdf"},

  {id:3,brand:"Jinko Solar",   model:"Tiger Neo N-Type 420W",   watt:420,area:1.722,eff:21.8,price:210,warranty:25,
   dims:"1722×1134×30mm",weight:"21.3 kg",datasheet:null},
  {id:4,brand:"LONGi Solar",   model:"Hi-MO 6 Explorer 415W",   watt:415,area:1.722,eff:21.3,price:195,warranty:25,
   dims:"1722×1134×30mm",weight:"21.3 kg",datasheet:null},
  {id:5,brand:"Canadian Solar",model:"HiHero 430W",              watt:430,area:1.879,eff:22.8,price:235,warranty:25,
   dims:"1756×1096×35mm",weight:"21.3 kg",datasheet:null},
];

const DEFAULT_INVERTERS=[
  // Specs uit SMILE G3 S3.6/S5 datasheet 2025
  // S3.6: 3,68kW nom · max PV 7,36kW (200%) · 2 MPPT/1 · 580V max · 97% eff · IP65
  {id:1,brand:"AlphaESS",model:"SMILE-G3-S3.6",fase:"1-fase",kw:3.68,mppt:2,maxPv:7360, eff:97.0,price:1850,warranty:10,
   dims:"610×212×366mm",weight:"19.5 kg",
   notes:"3,68kW · max 7,36kWp PV · 2 MPPT · UPS backup · IP65 · C10/11 · Jabba.",
   datasheet:"alphaess-smile-g3.pdf"},
  // S5: 5kW nom · max PV 10kW (200%) · 2 MPPT/1 · 97% eff · IP65
  {id:2,brand:"AlphaESS",model:"SMILE-G3-S5",  fase:"1-fase",kw:5.0, mppt:2,maxPv:10000,eff:97.0,price:2400,warranty:10,
   dims:"610×212×366mm",weight:"19.5 kg",
   notes:"5kW · max 10kWp PV · 2 MPPT · UPS backup · IP65 · C10/11 · Jabba. Populairste model.",
   datasheet:"alphaess-smile-g3.pdf"},
  {id:3,brand:"AlphaESS",model:"SMILE-G3-S8",  fase:"1-fase",kw:8.0, mppt:2,maxPv:16000,eff:97.5,price:3100,warranty:10,
   dims:"610×212×366mm",weight:"22 kg",
   notes:"8kW · max 16kWp · display · EV-laders · IP65.",datasheet:"alphaess-smile-g3.pdf"},
  {id:4,brand:"AlphaESS",model:"SMILE-G3-T4/6/8/10",fase:"3-fase",kw:10.0,mppt:3,maxPv:20000,eff:97.5,price:4200,warranty:10,
   dims:"610×212×366mm",weight:"25 kg",
   notes:"Driefase hybride · 3 MPPT · 150% overbelasting · max 45,6 kWh.",datasheet:"alphaess-smile-g3.pdf"},
  {id:5,brand:"AlphaESS",model:"SMILE-G3-T15/20", fase:"3-fase",kw:20.0,mppt:3,maxPv:40000,eff:97.6,price:6500,warranty:10,
   dims:"610×212×366mm",weight:"30 kg",
   notes:"15-20kW driefase voor grote woningen of KMO.",datasheet:"alphaess-smile-g3.pdf"},
];
const DEFAULT_BATTERIES=[
  {id:1,brand:"AlphaESS",model:"BAT-G3-3.8S",               kwh:3.8, price:1507,cycles:10000,warranty:10,dod:95,notes:"Serieel, indoor IP21. Tot 4× (15,2 kWh).",isAlpha:true},
  {id:2,brand:"AlphaESS",model:"BAT-G3-9.3S",               kwh:9.3, price:3200,cycles:10000,warranty:10,dod:95,notes:"Hoogspanning IP65 outdoor. Verwarming. Tot 4× (37,2 kWh).",isAlpha:true},
  {id:3,brand:"AlphaESS",model:"BAT-G3-10.1P",              kwh:10.1,price:3500,cycles:10000,warranty:10,dod:95,notes:"Parallel tot 6× (60,5 kWh). Outdoor IP65.",isAlpha:true},
  {id:4,brand:"AlphaESS",model:"G3-S5 + 10.1 kWh (pakket)", kwh:10.1,price:6200,cycles:10000,warranty:10,dod:95,notes:"SMILE-G3-S5 + 1× BAT-G3-10.1P.",isAlpha:true},
  {id:5,brand:"AlphaESS",model:"G3-S5 + 20.2 kWh (pakket)", kwh:20.2,price:9400,cycles:10000,warranty:10,dod:95,notes:"SMILE-G3-S5 + 2× BAT-G3-10.1P.",isAlpha:true},
  {id:6,brand:"Tesla",   model:"Powerwall 3",                kwh:13.5,price:8500,cycles:4000, warranty:10,dod:100,notes:"Geïntegreerde omvormer. Volledig huis backup.",isAlpha:false},
  {id:7,brand:"SolarEdge",model:"Home Battery 10kWh",        kwh:10.0,price:6800,cycles:6000, warranty:10,dod:100,notes:"Vereist SolarEdge omvormer.",isAlpha:false},
  {id:8,brand:"BYD",     model:"Battery-Box HVS 10.2",       kwh:10.2,price:5200,cycles:8000, warranty:10,dod:100,notes:"Hoogspanning modulaire opbouw.",isAlpha:false},
];

// ═══════════════════════════════════════════════════════════════════════════
//  STYLES — LICHT THEMA
// ═══════════════════════════════════════════════════════════════════════════
const STYLES=`
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#f1f5f9;}
:root{
  --amber:#e07b00;--amber-light:#fef3c7;--amber-glow:rgba(245,166,35,0.15);
  --bg:#f1f5f9;--bg2:#ffffff;--bg3:#f8fafc;--bg4:#e2e8f0;
  --border:#e2e8f0;--border-dark:#cbd5e1;
  --text:#0f172a;--muted:#64748b;--muted2:#94a3b8;
  --green:#16a34a;--green-bg:#f0fdf4;--green-border:#bbf7d0;
  --blue:#2563eb;--blue-bg:#eff6ff;--blue-border:#bfdbfe;
  --red:#dc2626;--red-bg:#fef2f2;--red-border:#fecaca;
  --alpha:#0891b2;--alpha-bg:#ecfeff;--alpha-border:#a5f3fc;
  --shadow:0 1px 3px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.04);
  --shadow-md:0 4px 6px rgba(0,0,0,0.07),0 2px 4px rgba(0,0,0,0.04);
}
.app{min-height:100vh;background:var(--bg);font-family:'IBM Plex Mono',monospace;color:var(--text);}
.header{padding:13px 20px;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:12px;box-shadow:var(--shadow);}
.logo{width:32px;height:32px;background:var(--amber);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
.header-text h1{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:var(--text);}
.header-text p{font-size:8px;color:var(--muted);margin-top:1px;}
.badge{margin-left:auto;padding:3px 8px;border:1px solid var(--border-dark);border-radius:4px;font-size:8px;color:var(--amber);letter-spacing:1px;text-transform:uppercase;white-space:nowrap;background:var(--amber-light);}
.tabs{display:flex;background:var(--bg2);border-bottom:1px solid var(--border);overflow-x:auto;}
.tab{padding:9px 14px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.5px;color:var(--muted);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap;flex-shrink:0;}
.tab.active{color:var(--amber);border-bottom-color:var(--amber);}
.tab:hover:not(.active){color:var(--text);}
.main{display:grid;grid-template-columns:340px 1fr;height:calc(100vh - 93px);}
.sidebar{background:var(--bg2);border-right:1px solid var(--border);padding:14px;display:flex;flex-direction:column;gap:13px;overflow-y:auto;box-shadow:var(--shadow);}
.content-area{display:flex;flex-direction:column;overflow-y:auto;background:var(--bg);}
.sl{font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--amber);margin-bottom:7px;display:flex;align-items:center;gap:8px;}
.sl::after{content:'';flex:1;height:1px;background:var(--border);}
.inp{width:100%;padding:8px 10px;background:var(--bg3);border:1px solid var(--border-dark);border-radius:6px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:11px;outline:none;transition:all .2s;}
.inp:focus{border-color:var(--amber);box-shadow:0 0 0 3px var(--amber-glow);}
.inp::placeholder{color:var(--muted2);}
.inp-label{font-size:8px;color:var(--muted);margin-bottom:3px;font-weight:500;}
.inp-2{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
.inp-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;}
.sugg-wrap{position:relative;}
/* FIX: sugg visible boven alles, muisdown ipv click */
.sugg{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--bg2);border:1px solid var(--border-dark);border-radius:6px;z-index:9999;max-height:180px;overflow-y:auto;box-shadow:var(--shadow-md);}
.sugg-item{padding:9px 11px;font-size:10px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s;line-height:1.4;}
.sugg-item:hover,.sugg-item:active{background:var(--amber-light);color:var(--amber);}
.btn{padding:8px 13px;background:var(--amber);border:none;border-radius:6px;color:#fff;font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:500;letter-spacing:.5px;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:5px;box-shadow:var(--shadow);}
.btn:hover{background:#c96e00;transform:translateY(-1px);box-shadow:var(--shadow-md);}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none;}
.btn.sec{background:var(--bg2);border:1px solid var(--border-dark);color:var(--text);}
.btn.sec:hover{border-color:var(--amber);color:var(--amber);background:var(--amber-light);}
.btn.danger{background:var(--red-bg);border:1px solid var(--red-border);color:var(--red);box-shadow:none;}
.btn.danger:hover{background:var(--red);color:#fff;}
.btn.sm{padding:4px 8px;font-size:8px;}
.btn.blue{background:var(--blue);color:#fff;}
.btn.blue:hover{background:#1d4ed8;}
.btn.alpha{background:var(--alpha);color:#fff;}
.btn.alpha:hover{background:#0e7490;}
.btn.green{background:var(--green);color:#fff;}
.btn.green:hover{background:#15803d;}
.btn.full{width:100%;}
.sl-item label{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:4px;}
.sl-item label span{color:var(--amber);font-weight:500;}
.sl-item input[type=range]{width:100%;appearance:none;height:4px;background:var(--bg4);border-radius:2px;outline:none;cursor:pointer;}
.sl-item input[type=range]::-webkit-slider-thumb{appearance:none;width:14px;height:14px;background:var(--amber);border-radius:50%;cursor:pointer;box-shadow:var(--shadow);}
.orient-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}
.orient-btn{padding:6px 3px;background:var(--bg3);border:1px solid var(--border-dark);border-radius:5px;color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:8px;cursor:pointer;text-align:center;transition:all .15s;position:relative;}
.orient-btn.active{background:var(--amber-light);border-color:var(--amber);color:var(--amber);font-weight:600;}
.orient-btn.dhm-hit{border-color:var(--alpha);color:var(--alpha);}
.dhm-dot{position:absolute;top:2px;right:2px;width:5px;height:5px;background:var(--alpha);border-radius:50%;}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px;cursor:pointer;transition:all .2s;position:relative;box-shadow:var(--shadow);}
.card:hover{border-color:var(--amber);box-shadow:var(--shadow-md);}
.card.selected{border-color:var(--amber);background:var(--amber-light);box-shadow:var(--shadow-md);}
.card.selected::before{content:'✓';position:absolute;top:7px;right:9px;color:var(--amber);font-size:11px;font-weight:bold;}
.card.alpha-card{border-color:var(--alpha-border);}
.card.alpha-card.selected{border-color:var(--alpha);background:var(--alpha-bg);}
.card.alpha-card.selected::before{color:var(--alpha);}
.card.batt-card.selected{border-color:var(--blue);background:var(--blue-bg);}
.card.batt-card.selected::before{color:var(--blue);}
.card-name{font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:2px;color:var(--text);}
.card-brand{font-size:8px;color:var(--muted);margin-bottom:6px;}
.card-notes{font-size:8px;color:var(--muted);margin-top:5px;line-height:1.5;border-top:1px solid var(--border);padding-top:5px;}
.chips{display:flex;gap:4px;flex-wrap:wrap;}
.chip{font-size:8px;color:var(--text);background:var(--bg4);padding:2px 6px;border-radius:12px;font-weight:500;}
.chip.gold{color:var(--amber);background:var(--amber-light);}
.chip.alpha-c{color:var(--alpha);background:var(--alpha-bg);}
.chip.blue-c{color:var(--blue);background:var(--blue-bg);}
.chip.green-c{color:var(--green);background:var(--green-bg);}
.alpha-badge{display:inline-flex;align-items:center;gap:4px;font-size:7px;color:var(--alpha);background:var(--alpha-bg);border:1px solid var(--alpha-border);border-radius:3px;padding:1px 6px;margin-bottom:4px;}
.toggle-row{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;}
.toggle-lbl{font-size:9px;color:var(--text);}
.toggle{position:relative;width:36px;height:20px;flex-shrink:0;}
.toggle input{opacity:0;width:0;height:0;}
.tslider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--bg4);border-radius:10px;transition:.3s;border:1px solid var(--border-dark);}
.tslider:before{content:'';position:absolute;width:14px;height:14px;left:2px;bottom:2px;background:#fff;border-radius:50%;transition:.3s;box-shadow:var(--shadow);}
.toggle input:checked + .tslider{background:var(--blue);border-color:var(--blue);}
.toggle input:checked + .tslider:before{transform:translateX(16px);}
.pce{background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:11px;}
.pce-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
.pce-title{font-size:9px;color:var(--text);font-weight:500;}
.pce-reset{font-size:8px;color:var(--muted);cursor:pointer;text-decoration:underline;}
.pce-controls{display:flex;align-items:center;gap:10px;}
.pce-btn{width:28px;height:28px;background:var(--bg2);border:1px solid var(--border-dark);border-radius:6px;color:var(--text);font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;box-shadow:var(--shadow);}
.pce-btn:hover{border-color:var(--amber);color:var(--amber);}
.pce-val{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--amber);min-width:44px;text-align:center;}
.pce-sub{font-size:8px;color:var(--muted);text-align:center;}
.divider{height:1px;background:var(--border);flex-shrink:0;}
.info-box{font-size:8px;color:var(--muted);line-height:1.7;padding:7px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;}
.info-box strong{color:var(--text);}
.info-box.alpha-info{background:var(--alpha-bg);border-color:var(--alpha-border);}
.info-box.alpha-info strong{color:var(--alpha);}
.info-box.grb-ok{background:var(--green-bg);border-color:var(--green-border);}
.info-box.grb-ok strong{color:var(--green);}
.info-box.dhm-ok{background:var(--alpha-bg);border-color:var(--alpha-border);}
.info-box.dhm-ok strong{color:var(--alpha);}
.info-box.warn{background:#fffbeb;border-color:#fde68a;}
.info-box.warn strong{color:#92400e;}
.info-box.err{background:var(--red-bg);border-color:var(--red-border);}
.info-box.err strong{color:var(--red);}
.coord-row{display:flex;gap:12px;padding:6px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;font-size:8px;color:var(--amber);}
.coord-row span{color:var(--muted);}
.face-grid{display:flex;gap:5px;flex-wrap:wrap;}
.face-btn{padding:6px 10px;background:var(--bg3);border:1px solid var(--border-dark);border-radius:5px;color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:8px;cursor:pointer;transition:all .15s;text-align:left;}
.face-btn:hover{border-color:var(--alpha);color:var(--alpha);}
.face-btn.active{background:var(--alpha-bg);border-color:var(--alpha);color:var(--alpha);}
.face-btn .fb-main{font-family:'Syne',sans-serif;font-size:12px;font-weight:700;display:block;}
.face-btn .fb-sub{font-size:7px;color:var(--muted);margin-top:1px;display:block;}
.face-btn.active .fb-sub{color:var(--alpha);}
/* Result cards */
.rc{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;position:relative;overflow:hidden;box-shadow:var(--shadow);}
.rc::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--amber);}
.rc.green::before{background:var(--green);}
.rc.blue::before{background:var(--blue);}
.rc.alpha-rc::before{background:var(--alpha);}
.rc-label{font-size:8px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;font-weight:500;}
.rc-num{font-family:'Syne',sans-serif;font-size:21px;font-weight:800;color:var(--amber);line-height:1;}
.rc.green .rc-num{color:var(--green);}
.rc.blue .rc-num{color:var(--blue);}
.rc.alpha-rc .rc-num{color:var(--alpha);}
.rc-unit{font-size:8px;color:var(--muted);margin-top:2px;}
.results-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px;}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;}
.compare-col{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;box-shadow:var(--shadow);}
.compare-col h4{font-family:'Syne',sans-serif;font-size:11px;font-weight:700;margin-bottom:8px;color:var(--text);}
.crow{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:4px;}
.crow span{color:var(--text);font-weight:500;}
.ctotal{margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:baseline;font-size:9px;}
.cval{font-family:'Syne',sans-serif;font-size:19px;font-weight:800;color:var(--amber);}
.compare-col.batt .cval{color:var(--blue);}
.compare-col.alpha-col .cval{color:var(--alpha);}
.pbar{height:6px;background:var(--bg4);border-radius:3px;overflow:hidden;margin-top:7px;}
.pfill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--green),var(--amber));transition:width .8s;}
.ai-box{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:11px;line-height:1.8;color:var(--text);white-space:pre-wrap;box-shadow:var(--shadow);}
.ai-box.loading{display:flex;align-items:center;gap:10px;color:var(--muted);}
.spinner{width:12px;height:12px;border:2px solid var(--border);border-top-color:var(--amber);border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0;}
.spinner.cyan{border-top-color:var(--alpha);}
.spinner.blue{border-top-color:var(--blue);}
@keyframes spin{to{transform:rotate(360deg);}}
.dhm-bar{height:3px;background:var(--bg4);border-radius:2px;overflow:hidden;margin-top:4px;}
.dhm-bar-fill{height:100%;width:40%;background:linear-gradient(90deg,var(--alpha),var(--blue));border-radius:2px;animation:dhm-ani 1.5s ease-in-out infinite;}
@keyframes dhm-ani{0%{margin-left:0;width:30%}50%{margin-left:40%;width:50%}100%{margin-left:100%;width:0%}}
/* Map */
.map-area{flex:1;position:relative;min-height:0;}
#leaflet-map{width:100%;height:100%;}
.map-btns{position:absolute;top:10px;right:10px;z-index:999;display:flex;flex-direction:column;gap:5px;}
.map-btn{padding:6px 10px;background:rgba(255,255,255,.95);border:1px solid var(--border-dark);border-radius:5px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:8px;cursor:pointer;backdrop-filter:blur(8px);transition:all .15s;white-space:nowrap;box-shadow:var(--shadow);}
.map-btn.active{border-color:var(--amber);color:var(--amber);background:var(--amber-light);}
.map-legend{position:absolute;bottom:28px;left:10px;z-index:999;background:rgba(255,255,255,.95);border:1px solid var(--border-dark);border-radius:6px;padding:8px 10px;font-family:'IBM Plex Mono',monospace;font-size:8px;backdrop-filter:blur(8px);min-width:165px;box-shadow:var(--shadow-md);}
.legend-title{color:var(--amber);font-weight:600;margin-bottom:5px;letter-spacing:1px;text-transform:uppercase;font-size:7px;}
.legend-row{display:flex;align-items:center;gap:5px;color:var(--muted);margin-bottom:2px;}
.legend-dot{width:10px;height:10px;border-radius:2px;flex-shrink:0;}
.status-pill{position:absolute;top:10px;left:10px;z-index:999;padding:4px 9px;background:rgba(255,255,255,.95);border:1px solid var(--border-dark);border-radius:5px;font-size:8px;font-family:'IBM Plex Mono',monospace;backdrop-filter:blur(8px);display:flex;align-items:center;gap:5px;box-shadow:var(--shadow);}
.leaflet-container{background:#e8e8e8!important;}
.leaflet-control-zoom a{background:var(--bg2)!important;color:var(--text)!important;border-color:var(--border-dark)!important;box-shadow:var(--shadow)!important;}
.leaflet-control-attribution{background:rgba(255,255,255,.8)!important;color:var(--muted)!important;font-size:7px!important;}
/* Section layout */
.section{padding:14px 18px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;}
.list{display:flex;flex-direction:column;gap:7px;}
.new-form{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:13px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--shadow);}
.new-form h4{font-family:'Syne',sans-serif;font-size:11px;font-weight:700;color:var(--text);}
.results-wrap{padding:14px 18px;display:flex;flex-direction:column;gap:12px;}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:50px 20px;gap:10px;color:var(--muted);text-align:center;}
.empty-state .icon{font-size:36px;}
.empty-state p{font-size:11px;max-width:280px;line-height:1.6;color:var(--muted);}
.filter-row{display:flex;gap:5px;flex-wrap:wrap;}
.filter-btn{padding:4px 10px;background:var(--bg2);border:1px solid var(--border-dark);border-radius:12px;font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);cursor:pointer;transition:all .15s;}
.filter-btn.active{border-color:var(--alpha);color:var(--alpha);background:var(--alpha-bg);}
.filter-btn.af.active{border-color:var(--amber);color:var(--amber);background:var(--amber-light);}
.inv-card{background:var(--bg2);border:1px solid var(--alpha-border);border-radius:8px;padding:10px;cursor:pointer;transition:all .2s;position:relative;box-shadow:var(--shadow);}
.inv-card:hover{border-color:var(--alpha);box-shadow:var(--shadow-md);}
.inv-card.selected{border-color:var(--alpha);background:var(--alpha-bg);box-shadow:var(--shadow-md);}
.inv-card.selected::before{content:'✓';position:absolute;top:7px;right:9px;color:var(--alpha);font-size:11px;font-weight:bold;}
/* Monthly chart */
.chart-bar{transition:all .3s;}
.chart-bar:hover{opacity:.8;}
/* Maand grafiek */
.monthly-chart{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;box-shadow:var(--shadow);}
/* Customer section */
.customer-section{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:13px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px;}
.tl-result{padding:7px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;cursor:pointer;transition:background .15s;font-size:10px;}
.tl-result:hover{background:var(--amber-light);border-color:var(--amber);}
.tl-result.selected{background:var(--amber-light);border-color:var(--amber);}
`;

// ─── Kaartfuncties ─────────────────────────────────────────────────────────
const ASP_MAP={N:0,NO:45,O:90,ZO:135,Z:180,ZW:225,W:270,NW:315};

// Kleur per windrichting voor meetpunten
const DIR_COLORS=["#ef4444","#f97316","#eab308","#22c55e","#16a34a","#0891b2","#2563eb","#9333ea"];
// label per richting
const DIR_LABEL=["N","NO","O","ZO","Z","ZW","W","NW"];

// Teken alle LiDAR meetpunten: dakpixels + rand/hoekpunten
function drawMeasurementPoints(map,L,points,selFaceIdx,detectedFaces){
  if(!points||!points.length) return null;
  const g=L.layerGroup();

  points.forEach((p,idx)=>{
    if(p.isEdge){
      // ── Rand- of hoekpunt ──
      const color=p.isCorner?"#f59e0b":"#94a3b8";
      const radius=p.isCorner?6:3;
      const marker=L.circleMarker([p.lat,p.lng],{
        radius,
        color:p.isCorner?"#1e293b":"#64748b",
        weight:p.isCorner?2:1,
        fillColor:color,
        fillOpacity:p.isCorner?1:0.7,
      });
      const label=p.isCorner?`Hoekpunt ${p.edgeIdx+1}`:`Randpunt`;
      marker.bindTooltip(
        `<b>${label}</b><br>DSM: ${p.dsm}m · DTM: ${p.dtm}m<br>Hoogte boven maaiveld: <b>${p.relH}m</b>`,
        {direction:"top",permanent:p.isCorner,offset:[0,-8]}
      );
      marker.addTo(g);

      // Hoekpunt: extra zichtbaar label
      if(p.isCorner){
        L.marker([p.lat,p.lng],{icon:L.divIcon({
          html:`<div style="background:#f59e0b;color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;border:2px solid #1e293b;box-shadow:0 1px 4px rgba(0,0,0,.4);font-family:monospace">${p.edgeIdx+1}</div>`,
          iconSize:[18,18],iconAnchor:[9,9],className:""
        })}).bindTooltip(`Hoek ${p.edgeIdx+1} · ${p.relH}m`,{direction:"top"}).addTo(g);
      }
    } else {
      // ── Dakpixel (slope/aspect berekend, of vlak) ──
      const isFlat=p.dirIdx<0||p.slopeDeg<4;
      const c=isFlat?"#94a3b8":DIR_COLORS[p.dirIdx];
      const isSel=!isFlat&&detectedFaces&&detectedFaces[selFaceIdx]?.orientation===DIR_LABEL[p.dirIdx];
      const dirLabel=isFlat?"Vlak dak":DIR_LABEL[p.dirIdx];
      L.circleMarker([p.lat,p.lng],{
        radius:isSel?5:2.5,
        color:"rgba(255,255,255,0.5)",weight:isSel?1.5:0.4,
        fillColor:c,fillOpacity:isFlat?0.45:(isSel?0.92:0.72),
      })
      .bindTooltip(
        `<b>${dirLabel} · ${p.slopeDeg}°</b><br>Hoogte boven maaiveld: ${p.relH}m<br>DSM: ${p.dsm}m · DTM: ${p.dtm}m`,
        {direction:"top"}
      )
      .addTo(g);
    }
  });

  g.addTo(map);
  return g;
}

// Clip polygoon naar angulaire sector (radiale slice vanuit centroid)
function clipPolyToSector(lc,cLat,cLng,aspDeg,halfW){
  const getAng=(lat,lng)=>((Math.atan2(lng-cLng,lat-cLat)*180/Math.PI)+360)%360;
  const inSec=(lat,lng)=>{const a=getAng(lat,lng);const d=Math.abs(((a-aspDeg+180+360)%360)-180);return d<=halfW;};
  const result=[];
  const n=lc.length;
  for(let i=0;i<n;i++){
    const c=lc[i],nx=lc[(i+1)%n];
    const cIn=inSec(c[0],c[1]),nIn=inSec(nx[0],nx[1]);
    if(cIn) result.push(c);
    if(cIn!==nIn){
      // interpoleer overgang
      for(let t=0.05;t<1;t+=0.05){
        const lat=c[0]+t*(nx[0]-c[0]),lng=c[1]+t*(nx[1]-c[1]);
        if(inSec(lat,lng)!==cIn){result.push([lat,lng]);break;}
      }
    }
  }
  return result.length>=2?[[cLat,cLng],...result]:null;
}

// Genummerde dakvlaksectoren tekenen (LiDAR-gedetecteerde richtingen)
function drawFaceSectors(map,L,lc,faces,selFaceIdx,onSelect){
  if(!lc||!faces||!faces.length) return null;
  const lats=lc.map(p=>p[0]),lngs=lc.map(p=>p[1]);
  const cLat=(Math.min(...lats)+Math.max(...lats))/2;
  const cLng=(Math.min(...lngs)+Math.max(...lngs))/2;
  const dLat=(Math.max(...lats)-Math.min(...lats));
  const dLng=(Math.max(...lngs)-Math.min(...lngs));
  const g=L.layerGroup();

  // Sorteer op aspect en bepaal sector grenzen
  const withAsp=faces.map((f,origIdx)=>({...f,asp:ASP_MAP[f.orientation]||0,origIdx}));
  withAsp.sort((a,b)=>a.asp-b.asp);
  const n=withAsp.length;

  withAsp.forEach((f,si)=>{
    const prev=withAsp[(si-1+n)%n],next=withAsp[(si+1)%n];
    // Halveer de hoek met buren
    let startAsp=((f.asp+prev.asp+(f.asp<prev.asp?360:0))/2)%360;
    let endAsp=((f.asp+next.asp+(f.asp>next.asp?360:0))/2)%360;
    let halfW=((endAsp-startAsp+360)%360)/2;
    if(halfW<15) halfW=22.5; // minimum sector breedte

    const q=ZONE_Q[f.orientation]||ZONE_Q.Z;
    const isGood=BEST_SOUTH[f.orientation]!==false;
    const color=isGood?q[0].c:q[1].c;
    const isSel=f.origIdx===selFaceIdx;

    // Sector polygoon
    const sec=clipPolyToSector(lc,cLat,cLng,f.asp,halfW);
    if(sec&&sec.length>=3){
      L.polygon(sec,{
        color:isSel?'#1e293b':color,
        fillColor:color,
        fillOpacity:isSel?.65:.38,
        weight:isSel?3:1.5,
        opacity:0.9,
        dashArray:null
      })
      .bindTooltip(`<b>${si+1}. ${f.orientation} · ${f.slope}°</b><br>${q[isGood?0:1].l}<br>${f.pct}% van dak`,{sticky:true,direction:"top"})
      .on("click",()=>onSelect(f.origIdx))
      .addTo(g);
    }

    // Genummerd label: positioneer in richting van aspect
    const labelLat=cLat+dLat*0.32*Math.sin(f.asp*Math.PI/180);
    const labelLng=cLng+dLng*0.32*Math.cos((90-f.asp)*Math.PI/180);
    L.marker([labelLat,labelLng],{icon:L.divIcon({
      html:`<div style="width:26px;height:26px;background:${color};border:${isSel?"3px solid #1e293b":"2px solid rgba(255,255,255,.8)"};border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:12px;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);user-select:none">${si+1}</div>`,
      iconSize:[26,26],iconAnchor:[13,13],className:""
    })}).on("click",()=>onSelect(f.origIdx)).addTo(g);
  });

  // Dakcontour
  L.polygon(lc,{color:"#e07b00",fillOpacity:0,weight:2.5,dashArray:"6,3"}).addTo(g);
  g.addTo(map);return g;
}

// Fallback: eenvoudig 2-helling dak (zonder LiDAR)
function drawRealRoof(map,L,lc,orientation){
  const[sQ,nQ]=ZONE_Q[orientation]||ZONE_Q.Z;
  const lats=lc.map(p=>p[0]),mid=(Math.min(...lats)+Math.max(...lats))/2;
  const g=L.layerGroup();
  const sP=clipPolyByLat(lc,true,mid);
  if(sP?.length>=3) L.polygon(sP,{color:sQ.c,fillColor:sQ.c,fillOpacity:.4,weight:2,opacity:.9}).bindTooltip(`<b>Zuid-helling</b><br>${sQ.l}`,{sticky:true}).addTo(g);
  const nP=clipPolyByLat(lc,false,mid);
  if(nP?.length>=3) L.polygon(nP,{color:nQ.c,fillColor:nQ.c,fillOpacity:.4,weight:2,opacity:.9}).bindTooltip(`<b>Noord-helling</b><br>${nQ.l}`,{sticky:true}).addTo(g);
  L.polygon(lc,{color:"#e07b00",fillOpacity:0,weight:2.5,dashArray:"6,3"}).addTo(g);
  g.addTo(map);return g;
}
function drawPanelLayer(map,L,lc,lat,count,panel,orientation){
  const goodSouth=BEST_SOUTH[orientation]!==undefined?BEST_SOUTH[orientation]:true;
  const ratio=1.338,pW=Math.sqrt(panel.area/ratio),pH=panel.area/pW;
  const panels=packPanels(lc,lat,pW,pH,count,goodSouth);
  const g=L.layerGroup();
  panels.forEach((p,i)=>{
    L.polygon([[p.lat,p.lng],[p.lat+p.ph,p.lng],[p.lat+p.ph,p.lng+p.pw],[p.lat,p.lng+p.pw]],
      {color:"#1e3a5f",weight:1,fillColor:"#2563eb",fillOpacity:.85})
     .bindTooltip(`Paneel ${i+1}<br>${panel.brand} ${panel.watt}W`,{direction:"top"}).addTo(g);
    L.polyline([[p.lat+p.ph*.5,p.lng],[p.lat+p.ph*.5,p.lng+p.pw]],{color:"#60a5fa",weight:.5,opacity:.6}).addTo(g);
  });
  const kWp=((panels.length*panel.watt)/1000).toFixed(1);
  const lats=lc.map(p=>p[0]),lngs=lc.map(p=>p[1]);
  const lLat=goodSouth?Math.min(...lats)-.00003:Math.max(...lats)+.00003;
  L.marker([(lLat),(Math.min(...lngs)+Math.max(...lngs))/2],{icon:L.divIcon({
    html:`<div style="background:rgba(37,99,235,.9);color:#fff;padding:3px 8px;border-radius:4px;font-size:8px;font-family:'IBM Plex Mono',monospace;white-space:nowrap">🔵 ${panels.length}/${count} panelen · ${kWp} kWp</div>`,
    className:"",iconAnchor:[65,4]
  })}).addTo(g);
  g.addTo(map);return g;
}

// ─── Maandelijkse grafiek (SVG) ──────────────────────────────────────────────
function MonthlyChart({annualKwh}){
  const monthlyKwh=MONTHLY_FACTOR.map(f=>Math.round(annualKwh*f));
  const maxVal=Math.max(...monthlyKwh);
  const W=500,H=160,padL=32,padB=30,padT=10,padR=10;
  const chartW=W-padL-padR,chartH=H-padB-padT;
  const bW=(chartW/12)*.7,gap=(chartW/12)*.15;
  return(
    <div className="monthly-chart">
      <div className="sl" style={{marginBottom:10}}>Maandelijkse productie</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto"}}>
        {/* Y gridlijnen */}
        {[0,.25,.5,.75,1].map(f=>{
          const y=padT+chartH*(1-f);
          return <g key={f}>
            <line x1={padL} x2={W-padR} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1"/>
            <text x={padL-4} y={y+4} textAnchor="end" fill="#94a3b8" fontSize="8">{Math.round(maxVal*f)}</text>
          </g>;
        })}
        {/* Staven */}
        {monthlyKwh.map((v,i)=>{
          const bH=(v/maxVal)*chartH;
          const x=padL+(chartW/12)*i+gap;
          const y=padT+chartH-bH;
          const heat=v/maxVal;
          const r=Math.round(37+heat*218),gg=Math.round(99+heat*78),b=Math.round(235-heat*139);
          return <g key={i}>
            <rect x={x} y={y} width={bW} height={bH} fill={`rgb(${r},${gg},${b})`} rx="2" className="chart-bar"/>
            <text x={x+bW/2} y={H-padB+13} textAnchor="middle" fill="#64748b" fontSize="8">{MONTHS[i]}</text>
            <text x={x+bW/2} y={y-3} textAnchor="middle" fill="#64748b" fontSize="7">{v}</text>
          </g>;
        })}
      </svg>
      <div style={{fontSize:8,color:"var(--muted)",textAlign:"right",marginTop:4}}>kWh per maand · gebaseerd op gemiddelde Vlaamse zonnestraling</div>
    </div>
  );
}

// ─── PDF generatie ────────────────────────────────────────────────────────────
async function generatePDF(results,customer,displayName,slope,orientation){
  await loadPdfLibs();
  const{jsPDF}=window.jspdf;
  const{PDFDocument}=window.PDFLib;
  const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const W=210,margin=15;
  let y=margin;

  // ── Header ──
  doc.setFillColor(224,123,0);doc.rect(0,0,W,22,"F");
  doc.setFillColor(180,100,0);doc.rect(0,17,W,5,"F");
  doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(18);
  doc.text("ZonneDak Analyse",margin,14);
  doc.setFontSize(9);doc.setFont("helvetica","normal");
  doc.text(`${new Date().toLocaleDateString("nl-BE")}`,W-margin,14,{align:"right"});

  y=30;
  // ── Klantgegevens ──
  doc.setFillColor(248,250,252);doc.rect(margin-2,y-4,W-2*margin+4,customer.email?24:18,"F");
  doc.setTextColor(15,23,42);doc.setFontSize(12);doc.setFont("helvetica","bold");
  doc.text("Klantgegevens",margin,y);y+=7;
  doc.setFontSize(10);doc.setFont("helvetica","normal");doc.setTextColor(71,85,105);
  doc.text(`Naam:    ${customer.name||"—"}`,margin,y);y+=5;
  doc.text(`Adres:   ${customer.address||displayName||"—"}`,margin,y);y+=5;
  if(customer.email){doc.text(`E-mail:  ${customer.email}`,margin,y);y+=5;}
  y+=4;doc.setDrawColor(224,123,0);doc.setLineWidth(0.5);doc.line(margin,y,W-margin,y);y+=6;

  // ── Systeemoverzicht ──
  doc.setTextColor(15,23,42);doc.setFontSize(12);doc.setFont("helvetica","bold");
  doc.text("Systeemoverzicht",margin,y);y+=7;
  const rows=[
    ["Paneel",`${results.panel.brand} ${results.panel.model}`],
    ["Afmetingen paneel",results.panel.dims||"—"],
    ["Aantal panelen",`${results.panelCount} panelen`],
    ["Totaal vermogen",`${((results.panelCount*results.panel.watt)/1000).toFixed(2)} kWp`],
    ["Dakoppervlak",`${results.detectedArea||80} m² (${results.grbOk?"GRB gemeten":"schatting"})`],
    ["Hellingshoek",`${slope}°`],
    ["Oriëntatie",`${orientation} ${results.dhmOk?"(LiDAR gemeten)":"(handmatig)"}`],
    ["Zonneirradiantie",`${results.irr} kWh/m²/jaar`],
    ["Jaarlijkse opbrengst",`${results.annualKwh.toLocaleString("nl-BE")} kWh/jaar`],
    ["CO₂ besparing",`${results.co2} kg/jaar`],
    ["Dekkingsgraad",`${results.coverage}% van gemiddeld verbruik (3.500 kWh/j)`],
  ];
  if(results.inv) rows.splice(1,0,["AlphaESS Omvormer",`${results.inv.model} (${results.inv.kw} kW · ${results.inv.fase})`]);
  doc.autoTable({startY:y,head:[["Parameter","Waarde"]],body:rows,
    styles:{fontSize:9,cellPadding:3.5},
    headStyles:{fillColor:[224,123,0],textColor:[255,255,255],fontStyle:"bold",fontSize:9},
    alternateRowStyles:{fillColor:[248,250,252]},
    columnStyles:{0:{fontStyle:"bold",cellWidth:70},1:{cellWidth:"auto"}},
    margin:{left:margin,right:margin},
  });
  y=doc.lastAutoTable.finalY+8;

  // ── Financieel ──
  if(y>210){doc.addPage();y=margin;}
  doc.setTextColor(15,23,42);doc.setFontSize(12);doc.setFont("helvetica","bold");
  doc.text("Financiële analyse",margin,y);y+=7;
  const finRows=[
    ["Zonnepanelen","€ "+(results.panelCount*results.panel.price).toLocaleString("nl-BE")],
    ["Installatie & omvormer","€ "+(results.inv?results.inv.price:1200).toLocaleString("nl-BE")],
    ["Totale investering","€ "+results.investPanels.toLocaleString("nl-BE")],
    ["Jaarlijkse besparing","€ "+results.annualBase.toLocaleString("nl-BE")+" (@ €0,28/kWh)"],
    ["Terugverdientijd zonder batterij",results.paybackBase+" jaar"],
  ];
  if(results.battResult){
    finRows.push(["Batterij ("+results.batt?.brand+" "+results.batt?.model+")","€ "+results.batt?.price.toLocaleString("nl-BE")]);
    finRows.push(["Extra besparing met batterij","€ "+results.battResult.extraSav.toLocaleString("nl-BE")+"/jaar"]);
    finRows.push(["Totale investering met batterij","€ "+results.battResult.totInv.toLocaleString("nl-BE")]);
    finRows.push(["Terugverdientijd met batterij",results.battResult.payback+" jaar"]);
  }
  doc.autoTable({startY:y,head:[["Post","Bedrag"]],body:finRows,
    styles:{fontSize:9,cellPadding:3.5},
    headStyles:{fillColor:[37,99,235],textColor:[255,255,255],fontStyle:"bold"},
    alternateRowStyles:{fillColor:[239,246,255]},
    columnStyles:{0:{fontStyle:"bold",cellWidth:110}},
    margin:{left:margin,right:margin},
  });
  y=doc.lastAutoTable.finalY+8;

  // ── Maandelijkse productie ──
  if(y>210){doc.addPage();y=margin;}
  doc.setTextColor(15,23,42);doc.setFontSize(12);doc.setFont("helvetica","bold");
  doc.text("Maandelijkse productie (kWh)",margin,y);y+=7;
  const mVals=MONTHLY_FACTOR.map(f=>Math.round(results.annualKwh*f));
  doc.autoTable({startY:y,
    head:[MONTHS],body:[mVals.map(v=>v.toString())],
    styles:{fontSize:8,cellPadding:2.5,halign:"center"},
    headStyles:{fillColor:[22,163,74],textColor:[255,255,255],fontStyle:"bold"},
    alternateRowStyles:{fillColor:[240,253,244]},
    margin:{left:margin,right:margin},
  });
  y=doc.lastAutoTable.finalY+4;

  // Grafiek (eenvoudige balken via rechthoeken)
  if(y+45<285){
    const bW=12,bX=margin,maxV=Math.max(...mVals);
    mVals.forEach((v,i)=>{
      const bH=(v/maxV)*35;
      const heat=v/maxV;
      const r=Math.round(37+heat*218),gg=Math.round(99+heat*78),b=Math.round(235-heat*139);
      doc.setFillColor(r,gg,b);
      doc.rect(bX+i*(bW+1),y+36-bH,bW,bH,"F");
      doc.setFontSize(6);doc.setTextColor(100,116,139);
      doc.text(MONTHS[i],bX+i*(bW+1)+bW/2,y+40,{align:"center"});
    });
    y+=45;
  }

  // ── Footer op alle pagina's ──
  const pgC=doc.getNumberOfPages();
  for(let i=1;i<=pgC;i++){
    doc.setPage(i);doc.setFontSize(7);doc.setTextColor(148,163,184);
    doc.text(`Pagina ${i}/${pgC} · ZonneDak Analyzer · ${new Date().getFullYear()}`,W/2,293,{align:"center"});
    doc.setDrawColor(226,232,240);doc.line(margin,289,W-margin,289);
    doc.text("Berekeningen zijn schattingen. Raadpleeg een erkend installateur voor een definitieve offerte.",margin,289);
  }

  // ── Datasheets samenvoegen via pdf-lib ──
  const mainPdfBytes=doc.output("arraybuffer");
  const mergedPdf=await PDFDocument.load(new Uint8Array(mainPdfBytes));

  // Verzamel unieke datasheets (paneel + omvormer)
  const dsFiles=new Set();
  if(results.panel?.datasheet) dsFiles.add(results.panel.datasheet);
  if(results.inv?.datasheet)   dsFiles.add(results.inv.datasheet);

  let dsCount=0;
  for(const dsFile of dsFiles){
    const bytes=await fetchPdfBytes(DS_BASE+dsFile);
    if(!bytes) continue;
    try{
      const dsPdf=await PDFDocument.load(bytes);
      const pages=await mergedPdf.copyPages(dsPdf,dsPdf.getPageIndices());
      // Scheidingspagina
      const sepPage=mergedPdf.addPage([595,842]);
      const {rgb}=window.PDFLib;
      sepPage.drawRectangle({x:0,y:0,width:595,height:842,color:rgb(0.95,0.96,0.98)});
      sepPage.drawText(`Datasheet: ${dsFile.replace(/-/g," ").replace(".pdf","").toUpperCase()}`,{x:50,y:420,size:18,color:rgb(0.88,0.48,0)});
      pages.forEach(p=>mergedPdf.addPage(p));
      dsCount++;
    }catch(e){console.warn("Datasheet merge fout:",dsFile,e.message);}
  }

  const finalBytes=await mergedPdf.save();
  const blob=new Blob([finalBytes],{type:"application/pdf"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`ZonneDak_${(customer.name||"rapport").replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}.pdf`;
  a.click();URL.revokeObjectURL(url);
  return dsCount;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PanelCard({p,selected,onSelect,onDelete,canDelete}){return(
  <div className={`card ${selected?"selected":""}`} onClick={()=>onSelect(p.id)}>
    <div className="card-name">{p.model}</div><div className="card-brand">{p.brand}</div>
    <div className="chips"><span className="chip gold">{p.watt}W</span><span className="chip">{p.eff}% eff</span><span className="chip">{p.area} m²</span><span className="chip">€{p.price}/st</span><span className="chip">{p.warranty}j</span></div>
    {p.dims&&<div style={{fontSize:7,color:"var(--muted)",marginTop:4}}>{p.dims} · {p.weight}</div>}
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
  const e0={brand:"",model:"",watt:"",area:"",eff:"",price:"",warranty:"25",dims:"",weight:""};
  const[f,setF]=useState(e0);const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const ok=f.brand&&f.model&&+f.watt>0&&+f.area>0&&+f.eff>0&&+f.price>0;
  return(<div className="new-form"><h4>➕ Nieuw paneel toevoegen</h4>
    <div className="inp-2"><div><div className="inp-label">Merk</div><input className="inp" placeholder="Jinko" value={f.brand} onChange={e=>s("brand",e.target.value)}/></div><div><div className="inp-label">Model</div><input className="inp" placeholder="Tiger 420W" value={f.model} onChange={e=>s("model",e.target.value)}/></div></div>
    <div className="inp-3"><div><div className="inp-label">Watt</div><input className="inp" type="number" placeholder="420" value={f.watt} onChange={e=>s("watt",e.target.value)}/></div><div><div className="inp-label">m²</div><input className="inp" type="number" placeholder="1.72" value={f.area} onChange={e=>s("area",e.target.value)}/></div><div><div className="inp-label">Eff %</div><input className="inp" type="number" placeholder="21.5" value={f.eff} onChange={e=>s("eff",e.target.value)}/></div></div>
    <div className="inp-2"><div><div className="inp-label">€/st</div><input className="inp" type="number" placeholder="210" value={f.price} onChange={e=>s("price",e.target.value)}/></div><div><div className="inp-label">Garantie (j)</div><input className="inp" type="number" placeholder="25" value={f.warranty} onChange={e=>s("warranty",e.target.value)}/></div></div>
    <div className="inp-2"><div><div className="inp-label">Afmetingen</div><input className="inp" placeholder="1756×1096×35mm" value={f.dims} onChange={e=>s("dims",e.target.value)}/></div><div><div className="inp-label">Gewicht</div><input className="inp" placeholder="21.3 kg" value={f.weight} onChange={e=>s("weight",e.target.value)}/></div></div>
    <button className="btn full" disabled={!ok} onClick={()=>{onAdd({...f,id:Date.now(),watt:+f.watt,area:+f.area,eff:+f.eff,price:+f.price,warranty:+f.warranty});setF(e0);}}>Paneel toevoegen</button>
  </div>);}
function NewBattForm({onAdd}){
  const e0={brand:"",model:"",kwh:"",price:"",cycles:"",warranty:"10"};
  const[f,setF]=useState(e0);const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const ok=f.brand&&f.model&&+f.kwh>0&&+f.price>0&&+f.cycles>0;
  return(<div className="new-form"><h4>➕ Nieuwe batterij toevoegen</h4>
    <div className="inp-2"><div><div className="inp-label">Merk</div><input className="inp" placeholder="Tesla" value={f.brand} onChange={e=>s("brand",e.target.value)}/></div><div><div className="inp-label">Model</div><input className="inp" placeholder="Powerwall 3" value={f.model} onChange={e=>s("model",e.target.value)}/></div></div>
    <div className="inp-3"><div><div className="inp-label">kWh</div><input className="inp" type="number" placeholder="10" value={f.kwh} onChange={e=>s("kwh",e.target.value)}/></div><div><div className="inp-label">Prijs €</div><input className="inp" type="number" placeholder="5500" value={f.price} onChange={e=>s("price",e.target.value)}/></div><div><div className="inp-label">Cycli</div><input className="inp" type="number" placeholder="6000" value={f.cycles} onChange={e=>s("cycles",e.target.value)}/></div></div>
    <div style={{maxWidth:130}}><div className="inp-label">Garantie (j)</div><input className="inp" type="number" placeholder="10" value={f.warranty} onChange={e=>s("warranty",e.target.value)}/></div>
    <button className="btn blue full" disabled={!ok} onClick={()=>{onAdd({...f,id:Date.now(),kwh:+f.kwh,price:+f.price,cycles:+f.cycles,warranty:+f.warranty,isAlpha:false});setF(e0);}}>Batterij toevoegen</button>
  </div>);}

// ─── Customer / Teamleader component ─────────────────────────────────────────
function CustomerPanel({customer,setCustomer,tlToken,setTlToken}){
  const[search,setSearch]=useState("");
  const[tlResults,setTlResults]=useState([]);
  const[tlLoading,setTlLoading]=useState(false);
  const[tlError,setTlError]=useState("");

  const doSearch=async()=>{
    if(!tlToken||!search) return;
    setTlLoading(true);setTlError("");setTlResults([]);
    try{
      const r=await searchTeamleaderContact(search,tlToken);
      setTlResults(r);
      if(!r.length) setTlError("Geen contacten gevonden.");
    }catch(e){setTlError(`Teamleader fout: ${e.message}`);}
    setTlLoading(false);
  };

  const selectContact=c=>{
    const addr=[c.addresses?.[0]?.line_1,c.addresses?.[0]?.postal_code,c.addresses?.[0]?.city].filter(Boolean).join(", ");
    setCustomer({name:`${c.first_name||""} ${c.last_name||""}`.trim(),address:addr,email:c.primary_email?.email||""});
    setTlResults([]);
  };

  return(
    <div className="customer-section">
      <div className="sl">Klantgegevens</div>
      <div><div className="inp-label">Naam klant</div>
        <input className="inp" placeholder="Jan Janssen" value={customer.name} onChange={e=>setCustomer(p=>({...p,name:e.target.value}))}/>
      </div>
      <div><div className="inp-label">Adres</div>
        <input className="inp" placeholder="Kerkstraat 1, 9000 Gent" value={customer.address} onChange={e=>setCustomer(p=>({...p,address:e.target.value}))}/>
      </div>
      <div><div className="inp-label">E-mail</div>
        <input className="inp" placeholder="jan@example.be" value={customer.email} onChange={e=>setCustomer(p=>({...p,email:e.target.value}))}/>
      </div>
      <div style={{borderTop:"1px solid var(--border)",paddingTop:8}}>
        <div className="sl" style={{marginBottom:6}}>Teamleader integratie</div>
        <div><div className="inp-label">API Access Token</div>
          <input className="inp" type="password" placeholder="Teamleader access token..." value={tlToken} onChange={e=>setTlToken(e.target.value)}/>
        </div>
        {tlToken&&<div style={{display:"flex",gap:6,marginTop:6}}>
          <input className="inp" placeholder="Klant zoeken op naam..." value={search} onChange={e=>setSearch(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&doSearch()} style={{flex:1}}/>
          <button className="btn sec" onClick={doSearch} disabled={tlLoading}>
            {tlLoading?<div className="spinner blue"/>:"Zoek"}
          </button>
        </div>}
        {tlError&&<div className="info-box err" style={{marginTop:5}}><strong>⚠️</strong> {tlError}</div>}
        {tlResults.length>0&&<div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>
          {tlResults.map(c=><div key={c.id} className="tl-result" onClick={()=>selectContact(c)}>
            <strong>{c.first_name} {c.last_name}</strong>
            <div style={{fontSize:8,color:"var(--muted)"}}>{c.primary_email?.email||""} · {c.addresses?.[0]?.city||""}</div>
          </div>)}
        </div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export { ErrorBoundary };
export default function App(){
  const[activeTab,setActiveTab]=useState("configuratie");
  const[query,setQuery]=useState("");const[suggs,setSuggs]=useState([]);const[showSuggs,setShowSuggs]=useState(false);
  const[coords,setCoords]=useState(null);const[displayName,setDisplayName]=useState("");
  const[slope,setSlope]=useState(35);const[orientation,setOrientation]=useState("Z");
  const[activeLayer,setActiveLayer]=useState("luchtfoto"); // Start met luchtfoto
  const[mapReady,setMapReady]=useState(false);

  const[grbStatus,setGrbStatus]=useState("idle");
  const[buildingCoords,setBuildingCoords]=useState(null);
  const[detectedArea,setDetectedArea]=useState(null);

  const[dhmStatus,setDhmStatus]=useState("idle");const[dhmError,setDhmError]=useState("");
  const[detectedFaces,setDetectedFaces]=useState(null);const[selFaceIdx,setSelFaceIdx]=useState(0);
  const[rawPoints,setRawPoints]=useState([]);
  const[showPoints,setShowPoints]=useState(true);

  const leafRef=useRef(null);const markerRef=useRef(null);
  const selectingRef=useRef(false);
  const baseTileRef=useRef(null); // luchtfoto / kaart base layer  // Fix: bijhoud of suggestie geselecteerd wordt
  const dhmLayerRef=useRef(null);const searchTO=useRef(null);
  const roofLayerRef=useRef(null);const panelLayerRef=useRef(null);
  const pointsLayerRef=useRef(null);

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

  // Klant & Teamleader
  const[customer,setCustomer]=useState({name:"",address:"",email:""});
  const[tlToken,setTlToken]=useState("");
  const[pdfLoading,setPdfLoading]=useState(false);

  useEffect(()=>{if(customCount!==null&&customCount>autoPanels)setCustomCount(autoPanels);},[autoPanels]);

  const selectFace=useCallback((idx,faces)=>{
    const f=(faces||detectedFaces)?.[idx];if(!f) return;
    setSelFaceIdx(idx);setOrientation(f.orientation);setSlope(f.slope);
  },[detectedFaces]);

  const redrawRoof=useCallback(()=>{
    if(!leafRef.current||!buildingCoords||!window.L) return;
    const L=window.L,map=leafRef.current;
    if(roofLayerRef.current){map.removeLayer(roofLayerRef.current);roofLayerRef.current=null;}
    if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;setPanelsDrawn(false);}
    // Gebruik genummerde sectoren als LiDAR-faces beschikbaar, anders eenvoudige 2-helling
    if(detectedFaces&&detectedFaces.length>0){
      roofLayerRef.current=drawFaceSectors(map,L,buildingCoords,detectedFaces,selFaceIdx,(idx)=>{
        setSelFaceIdx(idx);setOrientation(detectedFaces[idx].orientation);setSlope(detectedFaces[idx].slope);
      });
    } else {
      roofLayerRef.current=drawRealRoof(map,L,buildingCoords,orientation);
    }
  },[buildingCoords,orientation,detectedFaces,selFaceIdx]);
  useEffect(()=>{if(mapReady&&buildingCoords) redrawRoof();},[mapReady,buildingCoords,orientation,detectedFaces,selFaceIdx]);

  // Teken/verwijder meetpunten laag
  useEffect(()=>{
    if(!leafRef.current||!window.L) return;
    const L=window.L,map=leafRef.current;
    if(pointsLayerRef.current){map.removeLayer(pointsLayerRef.current);pointsLayerRef.current=null;}
    if(showPoints&&rawPoints.length>0){
      pointsLayerRef.current=drawMeasurementPoints(map,L,rawPoints,selFaceIdx,detectedFaces);
    }
  },[rawPoints,showPoints,selFaceIdx,detectedFaces,mapReady]);

  useEffect(()=>{
    if(!panelsDrawn||!buildingCoords||!selPanel||!leafRef.current||!window.L||!coords) return;
    const L=window.L,map=leafRef.current;
    if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
    panelLayerRef.current=drawPanelLayer(map,L,buildingCoords,coords.lat,panelCount,selPanel,orientation);
  },[panelCount,selPanel,panelsDrawn]);

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
    // Start met luchtfoto
    baseTileRef.current=L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {attribution:"© Esri World Imagery",maxZoom:21}
    ).addTo(map);
    leafRef.current=map;
  },[mapReady]);

  useEffect(()=>{
    if(!leafRef.current||!mapReady) return;
    const L=window.L,map=leafRef.current;
    // Wissel base tile laag
    if(baseTileRef.current){map.removeLayer(baseTileRef.current);}
    if(activeLayer==="kaart"){
      baseTileRef.current=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OSM",maxZoom:21}).addTo(map);
    } else {
      baseTileRef.current=L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {attribution:"© Esri World Imagery",maxZoom:21}
      ).addTo(map);
    }
    // DHM overlay
    if(dhmLayerRef.current) map.removeLayer(dhmLayerRef.current);
    if(activeLayer==="dsm"||activeLayer==="dtm"){
      const lyr=L.tileLayer.wms(DHM_WMS,{
        layers:activeLayer==="dsm"?"DHMVII_DSM_1m":"DHMVII_DTM_1m",
        format:"image/png",transparent:true,opacity:.55,
        attribution:"© Digitaal Vlaanderen",version:"1.3.0"
      });lyr.addTo(map);dhmLayerRef.current=lyr;
    } else {dhmLayerRef.current=null;}
  },[activeLayer,mapReady]);

  useEffect(()=>{
    if(!query||query.length<3){setSuggs([]);return;}
    clearTimeout(searchTO.current);
    searchTO.current=setTimeout(async()=>{
      try{const r=await fetch(`${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=be`);setSuggs(await r.json());setShowSuggs(true);}catch{}
    },350);
  },[query]);

  const selectAddr=async(item)=>{
    // FIX: direct instellen zonder blur-problemen
    setShowSuggs(false);setSuggs([]);
    setQuery(item.display_name.split(",").slice(0,3).join(","));
    const lat=parseFloat(item.lat),lng=parseFloat(item.lon);
    setCoords({lat,lng});setDisplayName(item.display_name);
    // Adres invullen bij klant als leeg
    setCustomer(p=>p.address?p:{...p,address:item.display_name.split(",").slice(0,3).join(",")});
    setPanelsDrawn(false);setBuildingCoords(null);setDetectedArea(null);
    setDetectedFaces(null);setDhmStatus("idle");setDhmError("");setGrbStatus("loading");

    if(leafRef.current&&mapReady){
      const L=window.L,map=leafRef.current;map.setView([lat,lng],19);
      if(markerRef.current) map.removeLayer(markerRef.current);
      const icon=L.divIcon({html:`<div style="width:10px;height:10px;background:#e07b00;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px #e07b00"></div>`,iconSize:[10,10],iconAnchor:[5,5],className:""});
      markerRef.current=L.marker([lat,lng],{icon}).addTo(map);
    }

    let lCoords=null;
    try{
      const geo=await fetchGRBBuilding(lat,lng);const bld=findBuilding(geo,lat,lng);
      if(bld){
        const ring=bld.geometry.type==="Polygon"?bld.geometry.coordinates[0]:bld.geometry.coordinates[0][0];
        lCoords=geoToLeaflet(ring);
        setDetectedArea(Math.round(polyAreaM2(lCoords)));setBuildingCoords(lCoords);setCustomCount(null);setGrbStatus("ok");
      } else setGrbStatus("fallback");
    }catch(e){console.warn("GRB:",e);setGrbStatus("fallback");}

    const bc=lCoords||(()=>{
      const mLat=111320,mLng=111320*Math.cos(lat*Math.PI/180);
      const w=Math.sqrt(80*1.6),d=80/w,dLat=(d/2)/mLat,dLng=(w/2)/mLng;
      return[[lat+dLat,lng-dLng],[lat+dLat,lng+dLng],[lat-dLat,lng+dLng],[lat-dLat,lng-dLng]];
    })();
    if(!lCoords){setBuildingCoords(bc);setDetectedArea(80);}

    setDhmStatus("loading");
    try{
      const {faces,rawPoints:pts}=await analyzeDHM(bc);
      setRawPoints(pts||[]);
      if(faces?.length>0){setDetectedFaces(faces);setSelFaceIdx(0);setOrientation(faces[0].orientation);setSlope(faces[0].slope);setDhmStatus("ok");}
      else{setDhmStatus("error");setDhmError(`${pts?.length||0} dakpixels gevonden maar geen duidelijke vlakken. Pas helling/richting handmatig in.`);}
    }catch(e){console.error("DHM:",e);setDhmStatus("error");setDhmError(e.message||"WCS endpoint niet bereikbaar");}
  };

  const calculate=async()=>{
    if(!coords||!selPanel||!buildingCoords) return;
    const irr=getSolarIrr(orientation,slope);
    const actualArea=panelCount*selPanel.area,annualKwh=Math.round(actualArea*irr*(selPanel.eff/100));
    const co2=Math.round(annualKwh*.202),coverage=Math.round((annualKwh/3500)*100);
    const investPanels=Math.round(panelCount*selPanel.price+(selInv?selInv.price:1200));
    const annualBase=Math.round(annualKwh*.28),paybackBase=Math.round(investPanels/annualBase);
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
      const dhmStr=dhmStatus==="ok"&&detectedFaces?`\nDHM LiDAR: ${detectedFaces.map(f=>`${f.orientation} ${f.slope}° (${f.pct}%)`).join(", ")}`:"\nHandmatige invoer.";
      const invStr=selInv?`\nOmvormer: ${selInv.brand} ${selInv.model} (${selInv.kw}kW)`:"Geen omvormer.";
      const battStr=battResult?`\nBatterij: ${selBatt.brand} ${selBatt.model} (${selBatt.kwh}kWh, €${selBatt.price}) · Extra: €${battResult.extraSav}/j · Terugverdien: ${battResult.payback}j`:"Geen batterij.";
      const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,
          messages:[{role:"user",content:`Zonne-energie expert Vlaanderen. Beknopt professioneel advies in het Nederlands:\n\nLocatie: ${displayName}\nDak: ${grbStatus==="ok"?"GRB-contour":"Schatting"} · ${detectedArea||80} m²${dhmStr}\nPaneel: ${selPanel.brand} ${selPanel.model} (${selPanel.watt}W, ${selPanel.eff}%)\nAantal: ${panelCount} · ${Math.round(actualArea)} m² · ${((panelCount*selPanel.watt)/1000).toFixed(1)} kWp\nHelling: ${slope}° ${orientation} · ${irr} kWh/m²/j\n${invStr}\nOpbrengst: ${annualKwh} kWh/j · CO₂: ${co2} kg/j\nInvestering: €${investPanels.toLocaleString()} · Besparing: €${annualBase}/j · Terugverdien: ${paybackBase}j\n${battStr}\n\nMax 180 woorden:\n1. Kwaliteit dak & paneelkeuze\n2. AlphaESS G3 synergie\n3. Vlaamse premies (capaciteitstarief, BTW 6%, REG-premie)`}]})});
      const d=await resp.json();setAiText(d.content?.find(b=>b.type==="text")?.text||"Analyse niet beschikbaar.");
    }catch{setAiText("AI-analyse tijdelijk niet beschikbaar.");}
    setAiLoading(false);
  };

  const handlePDF=async()=>{
    if(!results) return;
    setPdfLoading(true);
    try{await generatePDF(results,customer,displayName,slope,orientation);}
    catch(e){alert(`PDF fout: ${e.message}`);}
    setPdfLoading(false);
  };

  const filteredInv=invFilter==="alle"?inverters:inverters.filter(i=>i.fase===invFilter);
  const filteredBatt=battFilter==="alle"?batteries:battFilter==="alpha"?batteries.filter(b=>b.isAlpha):batteries.filter(b=>!b.isAlpha);
  const zq=ZONE_Q[orientation]||ZONE_Q.Z;
  const dhmHits=new Set(detectedFaces?.map(f=>f.orientation)||[]);
  const isLoading=grbStatus==="loading"||dhmStatus==="loading";

  const TABS=[
    {k:"configuratie",l:"01 Configuratie"},{k:"klant",l:"02 Klant"},
    {k:"panelen",l:"03 Panelen"},{k:"omvormers",l:"04 AlphaESS"},
    {k:"batterij",l:"05 Batterij"},{k:"resultaten",l:"06 Resultaten"}
  ];

  return(<><style>{STYLES}</style>
  <div className="app">
    <header className="header">
      <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAG8BLADASIAAhEBAxEB/8QAHQABAAIDAQEBAQAAAAAAAAAAAAcIBQYJBAMCAf/EAGIQAAEDAwEDBgUMDAgLCAIDAQEAAgMEBREGBxIhCBMxQVFhFCI3cYEVFhcyVnN1gpGhsbMYIzVCUnKSlaW00tMzNFVioqSywSQ2Q2Z0k5TCw9HjJThjZ3aD4fBT8SZEo1T/xAAbAQEAAwEBAQEAAAAAAAAAAAAAAwQFAgEGB//EAD0RAAICAQIDBAcHAwMDBQAAAAABAgMRBBIhMVEFEzJBBhQzYXGBoSJCkbHB0eFSYvAjNDVygvElNpKywv/aAAwDAQACEQMRAD8AuWiIgCIiAIiIAiIgCLy3e5W6z2+W43a4Ulvoocc5UVUzYo2ZIaMucQBkkDzkLX/ZK2de77Sv54p/215lHjklzZtSLVfZK2de77Sv54p/209krZ17vtK/nin/AG0yjzfHqbUi1X2StnXu+0r+eKf9tPZK2de77Sv54p/20yhvj1NqRar7JWzr3faV/PFP+2nslbOvd9pX88U/7aZQ3x6m1ItV9krZ17vtK/nin/bT2StnXu+0r+eKf9tMob49TakWq+yVs6932lfzxT/tp7JWzr3faV/PFP8AtplDfHqbUi1X2StnXu+0r+eKf9tPZK2de77Sv54p/wBtMob49TakWq+yVs6932lfzxT/ALaeyVs6932lfzxT/tplDfHqbUi1X2StnXu+0r+eKf8AbT2StnXu+0r+eKf9tMob49TakWq+yVs6932lfzxT/tp7JWzr3faV/PFP+2mUN8eptSLVfZK2de77Sv54p/209krZ17vtK/nin/bTKG+PU2pFqvslbOvd9pX88U/7aeyVs6932lfzxT/tplDfHqbUi1X2StnXu+0r+eKf9tPZK2de77Sv54p/20yhvj1NqRar7JWzr3faV/PFP+2nslbOvd9pX88U/wC2mUN8eptSLVfZK2de77Sv54p/209krZ17vtK/nin/AG0yhvj1NqRfKjqaato4ayjqIqmmnjbLDNE8PZIxwy1zXDgQQQQR0r6r06CIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgC8t3uVus9vluN2uFJb6KHHOVFVM2KNmSGjLnEAZJA85C0rbDtZ0rs0t7vVWo8Ju8tO6aitkOecn47oLnYIjZnPjO6Q1+6HFu6qQbUtqGr9o1w8I1BX7lI3cMVupS5lJE5oI3xGXHLzvO8ZxLvGIzgACOdiiVrtTGrhzZYrabyq7PQb9FoC2+q9Rw/w+uY+KmHtD4sfCR/Avac83ggEbwUC6s23bUNR1gnqNXXC3xskkfFBbJDSMjDyDu5jw54GABvlxHHjkkmOkVeU5MzbNRZPmwiIuSAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIi9VBbq6ucG0lLLLkkZA8XIGcZ6AvG0uZzOcYLdJ4R5UW30ug66SMmorIon54BrS4Y7c8FlfWDQf/8AXVfK3/koHqa15mTZ29oa3jfn4Jkdot+qtAwc2PBq2Vr88TI0OGPRhYS66PulE18kIbVRt/A4OxjJOP8AkSuo6iuXJklHbWiueIzw/fwNcRfuaKSGQxzRvjeOlrhgj0L8KU1E01lBEReg+tHU1NFWQ1lHUS01TBI2WGaJ5Y+N7TlrmuHEEEAgjoUlaL297UNMStDNRy3imEjpH092zUh5Ld3jITzoAwCGteBkdHE5jBETa5HUZyj4WXU2V8p7SuoOYt2sIPW5cnbrPCMl9FK47jc73tosuLjh+Wta3jIp6o6mmraOGso6iKppp42ywzRPD2SMcMtc1w4EEEEEdK5YqStj22jV+zedtPST+qllO619sq5HGNjd/ecYTn7U85fxALSXZc1xAxNG7qXqda1wmdCUWq7NdoOldodofcdM3HwjmdwVVPIwsmpnObvBr2n0jeblpLXYccFbUrCeTRTUllBERD0IiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgC0DbvtIo9mmh5rrvUk13qPtVsopnkc/JkbziG8SxgO87oB4N3mlzVut5uNHZ7RWXa4zcxRUVO+oqJN0u3I2NLnOwAScAE4AJXOvbVr2s2ja/rNQVA3KRuae3RGIMdFStc4xtdgnLzvFzjk+M444AAR2T2oram7uo8ObNa1HerrqK+Vd7vddLXXGsk5yeeQ8XHoHAcAAAAGjAAAAAAAWPRFVMdvIREQ8CIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCItw2f2HwqUXOpa0wt/gmniS4H23djB+nsXFk1CO5lXWauvSUu2fJfV9BpbR8lVu1NzbuwluWxZIcfxuz/7noIUgU1LBTxtjijaxrRgADoHYvqxoa0NaMAL+rItulY+J+ba/tK/Wz3TfDyXkgiIojPCEA9IREBib5YqG6w7k8XjDJa9vAtJ7P8A71BRnf7JWWeYNnAfG4kMkb0Hz9hxx/8A0VMS8l0oaevpHwTxh7XDBBVmnUSreHyNvsrtq3RyUZPMOnT4EKIvbe7bParg+knIcRxa4ffN6jjq6F4lqpprKP0auyNkVODymERF6dBERAbBs/1hftC6np9Q6eq+Yq4fFexwJjnjJG9FI3I3mHA4dIIBBBAI6HbMtZWrXujKDUlqliLZ4wKmBkm+aWcNBfC4kA5aT0kDIw4cHArmipV5NG072N9cf9oy7mnrpuxXPEHOPZuh3NStx43iuccgZy1zvFc4NxJXPa8Mt6W/u5YfJl/kRFaNcIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgK18uTXXgGnqHQFFJioue7WV/Dop2P+1t4tx40jS7LXAjmcEYeqgKReUnqGp1Htr1LUTiVkdFVut0ET5jII2QHmzu5A3Q5zXSbo6C89JyTHSpzlmRiaizfY2ERFyQBERAEREAREQBERAEREAREQBERAEREAREQBERAeq00jq65U9I0E848A4IBx1nj3ZUzUUDKemZFG0Na0YAAwAo+2X07JLlU1BLg+OMNA6sOPH6ApHWZrJ5lt6HwfpPqnPUKlcor6sL6U8M1RUR09PE+aaVwZHGxpc57icAADiST1L5qSuTq+hg126evMLC6mdDSulb/AJZzm4DTjg4t3h1Z3sdeFXqhvmo5xkwtDp46nUQplLapNLPxEmxjVsFsNfO6ieWxiR1LBI58/VloG7ulw49BOccM8Fq7LXRtaAYy89pccn5FbtVy2j1NBV62udRbHxSUz5G4fEMNc7daHkduXbxz19PHOVe1mkhTFOJtemfYNHZdNd2nm1l42t8+DeV+T8uK5Gmz2imePtRdEcduR8//ADWIrKWWlkDJQOIyHDoK2hfKpgjqIjFKMg/KD2hZ7R8LTq5wf2uKNVRfuaN0MronjDmnBX4XJrJ54o1faJbRVWd9SxmZafxwRjo6+nqxk47goxU5VDQ+FzT1jChSvhbT11RAwktjlcwE9OASFpaOeYuPQ+69F9U51Spf3eK+Z8ERFdPqQiIgCIiAvTyPtdeuzZgyy1cm9ctO7lHJw9tTkHmHcGhow1ro8ZJ+1bxPjKalRvkWahqbVtkiszRLJTXukmgkYJi1jXxsMzZC3GHkCN7B0Y5xxz0g3kVquWYm1pbN9az5BERSFgIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiALy3m40dntFZdrjNzFFRU76iok3S7cjY0uc7ABJwATgAleparti8kesvgGu/V3rxnknhNnNZERUj54IiIAiIgCIiA2DZzYKPVWuLTpyuu/qRFcqgU7avwYz7kjgRG3cBGd5+63OQBvZPAFWK+w//APMP9C/9dVgs1xrLPd6O7W6bmK2iqGVFPJuh25Ixwc12CCDggHBBC6caau1Nf9OWy+0bJY6a40kVXC2UAPayRge0OAJAOCM4J86lqjGXMvaSuuxNSXErN9h//wCYf6F/66fYf/8AmH+hf+urUope6j0LnqlPT8yq32H/AP5h/oX/AK6fYf8A/mH+hf8Arq1KJ3Ueg9Up6fmVW+w//wDMP9C/9dPsP/8AzD/Qv/XVqUTuo9B6pT0/M5w7aNn1Zs01xJpyqq/DojTx1FLV82I+fjcMF24HO3cPa9uCcndz0ELSla/l6aYjNHp7WcLImyMkda6lxkdvvBDpYQG+1w3dnyeB8dvSOiqCrzjtlgy76+7scUERFyQhERAEREBImyz7l1Pv5/stW5LR9llQzwaqpsO32yB5PVgjH9xW8LH1K/1GfmXbkWtfZn/OB/QMrYbKxrbewgcXEk95zj+5a+3oWdscu/SGPhmM/MeP/NQo+d1uXXwNxrNa6oq7W62VF3lkpnxiN43Ghzm9heBvHPXk8eOc5K15EUkpyl4nko6jV36lp3zcmuCy28LpxCIi5IDA31jRXBw4FzAT3niP7l4N3vXtu8vO1zsYwzxB6On58rxnoXLNujKrimfh3QVEOtP8Z638Zv8AZCl15w0lQ7qqdlTqGtlYHBvObvHpy0AH6Fc0XiZ9f6KxfrE37v1RjERFpH3QREQBERAbBs1uNHZ9oumrtcZuYoqK70tRUSbpduRsma5zsAEnABOACV0zXKxdU1PT5mloHwkgiIpzQCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIi1naz5K9W/Adb9Q9GeN4WTZkXKxFB3/ALjP9f8A7fr/AAdU0XKxE7/3D1/+36/wdU0WobFPI9o74EpPqWrb1MuJoReUmERQBy7PJFa/h6H6ioSTwsnNk9kXIn9FysRQ9/7ij6//AG/X+Dqmi5WLadkHlZ0f8O0X17EV2fI9Wuy8bfqdKkRFOaAREQBEUH7aeUTp7RNVPZbDAy+3uIlkoa/FPTO7HuHFzh1tb3gkHgvHJLmcTsjBZkycEXPfV23XahqSV5m1PU22Bx4QW3/BmtHZvN8cjzuK0Gvu11r3l9dc62qceJdNO55PylRO5eSKctfFckdRkXK5kkjDlr3N8xwvTBc7lTneguFXEe1kzm/QV53/ALjn1/8At+p1IRVB5EF7vVx2i3eluF3uFZAy0Oe2Kepe9jXc9EMgE4BwTx71b5SxluWS5Tb3sdwREXRKEREAREQBERAEREAREQBERAEREAREQBERAFqu2LyR6y+Aa79XetqWq7YvJHrL4Brv1d68fI5n4Wc1kRFSPnwiIgCIiAIiIArycizUNNddjcVmaIo6myVc0EjBMHPcyR5mbIW4ywEyPYOnPNuOekCjasJyGdTx2zaHctMzviZHe6QPhJjcXvng3nNaCODRzb5nHeH3rcEHge6niRZ0k9tq95c9ERWzZCIiAIiIDQOUNpX14bIL9a4oOerYac1lEG03Pyc9D44bG3pD3gOjyOOJDwPQeda6prmjtS0xJozaHfNMuZK2Ohq3spzLI173QHxoXOLeGXRuY48B09APAQXLkzO10OKka0iIoDOCIiAIiIDY9n9wbRXsQySbsdQ3c6sbw6Mk+kelSm05AKgyGR8MzJo3br2ODmnGcEcQpf0rc2Xe2snjBDmjD25yWkdv/wB61n6yvjvR8V6UaJqcdTFcHwf6GXC+9HUPppxIwA9RB6wviioHx8kpLDNnp5o54hJGcg/KD2FfRatFLJE/fjeWu7QvYy61TWgERuPaW8fmXWTNnopJ/ZZnV4bnXCnBjjIMp/o//Kxs9xqpRjfEY7GDHz9K8iNndWjw8zC/Ll+l+HnHHsXJoI8N6rIqC3TVMrt1rGk9IyT1AZ61DM0j5pnzSO3nvcXOOMZJ4lbptIvIeRaoTnodKcjHc3z9B6vnWkLU0le2GX5n6F6N6J0ad2SXGX5eQREVs+iCIiAIiIAuqa5WLqmp6PM0dB975fqERFOaIREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBaztZ8lerfgOt+oetmWs7WfJXq34DrfqHrx8jmfhZzSREVI+fCIiA6SbFPI9o74EpPqWrb1qGxTyPaO+BKT6lq29XVyPoIeFBQBy7PJFa/h6H6ioU/qAOXZ5IrX8PQ/UVC5s8LI9R7KRStERVDDC2nZB5WdH/AA7RfXsWrLadkHlZ0f8ADtF9exermdQ8SOlSIiun0AREQEFcrnalUaL03DpuxVJhvd3jcXTMdh9NT5wXDsc45aD1YceBAVISSTknJUg8orUcmp9smoq10hdDT1TqKnGeAjh8QY7iWl3xio+VSyW5mJqLHZN9AiIuCAIiICw3IP8AKdevgV/18SuaqZcg/wAp16+BX/XxK5qtVeE2NH7IIiKQtBERAEREAREQBERAEREAREQBERAEREAREQBarti8kesvgGu/V3ralqu2LyR6y+Aa79XevHyOZ+FnNZERUj58IiIAiIgCIiALYNm9/wDWrr+w6idLVxxW+vhnn8FdiR8IcOcYOIzvM3m4JAIJB4ErX0Tkep4eUdU0Ua8mK/8Arh2IacnfLSOqKKnNvmZA7PN8w4xsDxkkPMbY3EHGd7IABCkpXU8rJvwluin1CIi9OgiIgCphy5tMR2zaHbdTQMiZHe6QsmAkcXvng3WucQeDRzb4WjdP3rsgHibnqFeWTpX1wbIJrpTwc5W2KoZWMLKbnJHQnxJWhw4sYA4SOPEYhGRwyOLFmJX1UN1TKLIiKoYoREQBERAFY/kmbNIdVaO1LfaiSNkrqiOioX847LHsbvyB7fa7ruciw7i4FrurIdXBdFOTzpX1n7ILDa5YOZrZqcVlaHU3MSc9N45bI3pL2AtjyeOIxwHQO4VqfB8iarSw1Oa7FmLXErzqOx19juc1DXQPikidghw/+93nyCOCxauDqzTVq1PbxR3SEuDHb0cjMB8Z68Eg9I4H/mARBGrNkOora+SW3Q+qNO3iHQnLyC7A8Tpz1nAIGek8VmajQzreY8UfBdseimp0knOhOcPdzXxX6kaovvNSVETg2SJ7SeOCF8d09hVHB8m4tc0fxF+mse44DSVlbDpu8XusZS26hmnkfg+K3gBkDJPQACRxPQvVFyeEd102WyUYLLZhzwBPYtY1fqOK1wGGEh9S8eK3PR3nu+n5SN825aauGz3QNJX1dXRRXS41gp4qUyB0rYw17nyAA48UtjGfGH2wZwSFXJ7nPe573FznHJJOST2q7TpGnmZ9Z2Z6NTUlZq1hdPP59A9znvc97i5zjkknJJ7V/ERaB9oEREAREQBERAF1TXKxdU1PR5mjoPvfL9QiIpzRCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiALWdrPkr1b8B1v1D1sy1naz5K9W/Adb9Q9ePkcz8LOaSIipHz4REQHSTYp5HtHfAlJ9S1betQ2KeR7R3wJSfUtW3q6uR9BDwoKIOVjozUuudnNBadLW31QrYrvHUPj5+OLEYhmaXZkc0dL2jGc8VL6I1lYE4KcXFlAfsd9sXuP/SVJ+9T7HfbF7j/0lSfvVf5FH3MSp6jX1ZQH7HfbF7j/ANJUn71Z/ZxsI2rWjaHpu63DSvM0dFdqWoqJPVClduRsma5zsCQk4AJwASrvoipierRVp5ywiIpS4F/HODWlx6AMlf1fKs/ik3vbvoQHLetqH1dbPVSnMk0jpHecnJ+lfFEVE+eCIiHhO3Jo2HU+0Okn1HqOpqaeyQzGGGGAhslS8AF3jEHdYMgcBknPEYVhByc9kAiDPWvIXD7/ANUanJ//ANMfMvtyTomRbANNbjQC8VLnHtJqZVKatQhHBsUUVqCbWTQdnWyLRegL/U3nTNNV089RTGmeySpdIzcLmu4B3HOWjrW/Ii7SS5FiMVFYSCIi9OgiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAtV2xeSPWXwDXfq71tS1XbF5I9ZfANd+rvXj5HM/CzmsiIqR8+EREAREQBERAEREBarkE6i/xl0nPWf8A4rjSU3Nf+3O/eA/0cYJ7wPbK1K548mzUNTpzbXpqogEr462rbbp4mTGMSMnPNjewDvBrnNk3T0lg6DgjocrNTzE19HPdXjoERFKWwiIgCx+pbTTX/TlzsVY+WOmuNJLSTOiID2skYWOLSQQDgnGQfMsgiBrJy3vNurLPd6y03GHmK2iqH09RHvB25Ixxa5uQSDggjIJC8ilrla6Yj01trub6dkUdNeI2XSJjJHOIMhc2Uu3ugmVkrsAkAOGMdAiVUmsPBgTjsk4hEReHAREQGy7LdMSaz2h2PTLWSujrqtjKgxSNY9sA8aZzS7hlsbXuHA9HQTwPS5Uw5DOmI7ntDuWpp2RPjslIGQgyOD2Tz7zWuAHBw5tkzTvH75uATxFz1ZpWFk1dFDEN3UIiKUunjrrVa66UTVtto6qQN3Q+aBryB04yR0cT8q1/2ONFfyFF/rZP2ltiLiVcJc0VrdHp7nmytP4pM1y3aG0lb53TU1ipN9zd084DIMZB6HEjq6VnqWnp6SBtPSwRQQszuxxsDWjJycAcOkr6ovYwjHksHdWnpp9nBR+CSKV8uTUXqltPobBDWc7T2agbzkPNbvM1Ex33+MQC7MYgPSQOrB3lACzWu9Q1OrNZ3fUlUJWyXGrknEckxlMTC7xI94gZDG7rRwHBowAOCwqqSeXkx7Z75uQREXhGEREAREQBERAF1TXKxdU1PR5mjoPvfL9QiIpzRMRrDUtl0jYZr7qGsdR26BzWyzCCSXcLnBrchjSeJIGcda0H7IjY77sP0bV/ulveu9P0+qtG3fTtTgR3CkkgDiM7jiPFd8V2D6FzNr6SooK6ooauIxVFPK6KVh6WvaSCD5iCorJuPIp6m+dTWORff7IjY77sP0bV/uk+yI2O+7D9G1f7pUBRR99IrevWdEX++yI2O+7D9G1f7pSHpi+2rU1hpb7Y6xtZbqtpfBMGObvAEg8HAEcQRggdC5fK5vIY1J6obPrnpuWTMtprOciBPRDMCQB8dsh+Mu4WOTwyfT6qVk9siwyIimLwREQBCQASSAB0kotG2+ah9a+yDUl1bJuTeBup4CDxEkuI2kd4Ls+heN4WTyUtqbZhHcofY81xadYDIOOFuqiPql/PsiNjvuw/RtX+6VAUVfvpGX69Z0Rf77IjY77sP0bV/uk+yI2O+7D9G1f7pUBRO+kPXrOiOlWgNoekNetrHaTuzri2iLBUO8FmiDC/O6MyMbn2p6MraVEPJH0r62tjdBUzR7lXeXuuEuRx3XYEY8241rvjFS8rEW2ss0qpSlBOXMIiL07CLUdp+0XS+zuz+qGoa3dkkB8GpIsOnqCOpreztccAdvQqe7UuUPrjWEktJbKl2nbS7IEFHIRM9v8APl4OPmbujtBXErFEgt1EKuD5lxtY7RdD6QLm6i1NbqKZoyYOc5yb/Vsy/wCZRdfOVVs9o3ujt1BfLm4dD2QMijPpe4O/oqlD3Oe8ve4uc45JJySV/FC7n5FGWum+SwWxqeV9RtcfBtBzyN6jJdAw/NEV/KflfUrnDwjQM0bessuoefniCqei572XUj9bt6l07JyrdA1bmx3K1Xy3OPS/mmSxj0tdvf0VJ+jdqGgNXPZFYdUW+oqH+1ppHmGY+aN4Dj6AubqAkHIOCuldLzJI62xc+J1TRUD2YbfNeaJfFTS1zr5amYBo695cWt7GSe2Z3Di0dit7sk2taS2kUf8A2TVGlubG709uqCBMztLep7e8d2QOhTRsUi7VqYWcPM39ERdlgIiIAsRrDUtk0jYJ79qGt8Ct0Dmtkm5p8m6XODW+KwFxySOpZdRFywPIJevfqX69i8k8LJxZJxg2vI9H2RGx33Yfo2r/AHSfZEbHfdh+jav90qAoq/fSM316zoi/32RGx33Yfo2r/dL9RcoXY/JI2Nmr8ucQ1o9TaviT/wC0uf69Ft+6NN78z6QnfSHr1nRHUtEVduUFyiYNM1FRpnRDoay8Rkx1Ne4B8NK7ra0dD3jrz4rTwOTkCxKSiss0rLI1rMibtXau0zpGhFbqS90VshPtOekw5/c1o8Zx7gCoZ1HyrdC0MrorParxdy3ok3GwRO8xcd75WhU7v14ut+uctzvVwqbhWzHL5qiQvce7J6B2DoC8Kru5+RnT1034eBa77L+HnMex/JudvqsM/JzP96s7bakVtupqwM3BPCyXdznd3gDj51y0XUPTP+Ldr/0OL+wF3VJyzkn0l07G9zMgiIpi6ERaXtY2l6Z2b2UV18qC+plB8FoYSDNUEdg6mjrceA7zgHxvHM8lJRWWboSACScAKONabb9mmlZHwVupIaurZwNPQNNQ8HsJb4rT3FwVP9rG2vWu0CaWnqK11ss7iQ23Ujy1hb/4jumQ+fh2AKM1DK7oZ9mu8oIuBduVxpuJ5Fq0ldato6DUzxwZ9Dd9YxnK/iL8P2fva3tF3BPycyqpIo+9kV3q7epc+w8rDRFXI2O7WS9W0u6XsaydjfOQQ75GlS7onaBozWke9prUNFXyAbzoA7cmaO0xuw4Dvwuaa+tJU1FHUx1VJPLTzxODo5Ynlr2EdBBHEFdK5+ZJDWzXi4nU5aztZ8lerfgOt+oeq27CuUrW0lRT2DaLOaqkcQyK7Y+2RdQ54D2zf5w8Yde90ix21GaGo2R6pqKeVk0MthrHxyMcHNe007yCCOBBHWplJSXAvxujbBuJzWREVQwwiIgOkmxTyPaO+BKT6lq29ahsU8j2jvgSk+patvV1cj6CHhQWA13rPTWhrRFdtU3L1PopagU7JOYklzIWucG4ja49DHHOMcFn1AHLs8kVr+HofqKheSeFk5tm4QckbV9kRsd92H6Nq/3SfZEbHfdh+jav90qAooO+kZ3r1nRF/vsiNjvuw/RtX+6Xrs+3fZTd7tR2q36q56srZ2U9PH6n1Td+R7g1rcmMAZJAySAuey2nZB5WdH/DtF9exeq6WT2OtsbSwjpUiKEeWt5E3/CVP/vKeTwsmjZLZFy6E3L5Vn8Um97d9C5Yooe/9xR9f/t+v8BERQGcEREB0D5KXkA0x+JUfrMqlBcrEUyuwsYL8Nbtilt5e86pr8yyNiifK/e3WNLjutLjgdgHE+YKgHJP/wC8Bpj8ap/VZV0BUsJblku0Xd7HdjBFf2RGx33Yfo2r/dL+fZEbHfdh+jav90qi8o3SfrP2vXq3RRc3R1MvhtIAMDmpcuwO5rt5vxVHaidsk8FKWsti2mkX++yI2O+7D9G1f7pPsiNjvuw/RtX+6VAUXnfSOfXrOiOjmhtrGz/W15fZ9MagbXVzIXTmI0k0XiAgEgyMaDxcOAOfkK3dc49hGpfWntb09eHyblOKsQVJJ4CKX7W8nzB296F0cUtc9y4l3TXO2Lb5hERSFgIiIAtc17rjS2hbfT1+qrq23U9RLzMTuZklLn4JxiNrj0Dpxj5Vsapty6tR+Ha7tOmopMxWujM0oB6JZjnB8zGMPxlxOW1ZIb7e7huROn2RGx33Yfo2r/dJ9kRsd92H6Nq/3SoCih76RQ9es6Iv99kRsd92H6Nq/wB0vpTcoHZFU1EVPBqx0k0rwyNjbZVkucTgAfau1c/VLXJO0r659sltlmj36S0A3GbI4ZYQIx5+cLD5gV6rZN4OoayyclFJF+URFYNMIiIAtV2xeSPWXwDXfq71tS1XbF5I9ZfANd+rvXj5HM/CzmsiIqR8+EREAREQBERAEREAXTPZvf8A11aAsOonS0kktwoIZ5/BXZjZMWjnGDicbr95uCSQQQeIK5mK5/IZ1PJc9nly0zO+V8lkqw+EmNoYyCfec1oI4uPOMmcd4ffNwSOAlpeHgu6GeJuPUsIiIrJqhERAEREBWbl6aeppNOae1W0xR1NPVut0mIRvzMkY6RuX5zhhifhuD/CuPDjmoq6SbadMSay2V6h07AyWSpqaQvpWRyNYZJ4yJIm7zuABexoOccCeI6RzbVa5YlkydbDbZnqERFEUwiL12a3Vl4u9HabdDz9bW1DKenj3g3fke4Na3JIAySBkkBD0uzyLNPU1q2NxXlpikqb3VzTyPEIa9rI3mFsZdnLwDG946Mc44Y6SZvWP01aaawactlio3yyU1upIqSF0pBe5kbAxpcQACcAZwB5lkFdisLBvVw2QUQiIvTsIiIAo15Tt/wDW9sQ1HOyWkbUVtOLfCyd2Oc59wjeGDIJeI3SOAGcbuSCAVJSqhy9NTyGs09oyF8rY2RuulS0xt3Hkl0UJDvbZbuz5HAeO3pPRxN4iyHUT2VtlW0RFUMMIiIAiIgCIiAIiIAuqa5WLqmp6PM0dB975fqERFOaIVD+V/pX1ubYauuhj3aS9RNroyBw5w+LKPPvAu+OFfBQNy2dK+rOzCDUEEe9U2OpD3EDjzEuGPH5XNnzAqO1ZiVtXDfW/cUlREVUxgpo5G+pPUPbJT2+WTdp7zTyUbsnhvgb7D58s3R+MoXXu09dKmyX633mjOKmhqY6mI5++Y4OHzhexeHk7rlskpHUVF5LNcKa7WeiutG7fpqynjqIXdrHtDmn5CF61dN8IiIAq0cvHUPg+mrBpeJ/jVlS+smAPHcjbutB7iZCfiKy6oXyvNQ+r22u4wRyb8FpijoI+PDLRvP8A6b3D0KO14iVdZPbXjqRAiIqpjhZ3Z/p6fVmtrPpyn3g64VbIXOb0sYT47vQ0OPoWCVjOQvpXw/Wt01ZPHmG1U/MU5I/y0uQSPMwOB/HC9isvBLTDfNRLhUdNBR0cNJTRtiggjbHExvQ1rRgAeYBfVEV03Qo428bVbXsx02J3Njq71VgtoKIu9sR0yPxxDB8pPAdZG3a31LbNIaUuGo7vJuUlFEZHAe2eehrG/wA5ziAO8rnNtE1ddtc6urdR3mXenqXeJGDlkEY9rG3saB8pyTxJUdk9q4FXU392sLmzyau1HetWX6ovl/r5a2uqDlz3ng0dTWjoa0dQHALEoiqmQ23xYRF9qKlqq2qjpaKmmqaiQ4ZFEwve49gA4lAfFFItp2HbV7nC2Wm0VcGNcMgVL46c/JI5pC/t02G7WLbEZajRVe9oGSKaSOoPyRucSvdr6HfdT54ZHKL0XCirbdVvo7hSVFJUxnD4Z4yx7T3tPELzrw4C9NquFdarjBcbbVzUlZTvD4Z4Xlr2OHWCF5kQF4eTXtwg17AzTmo3xU+poWEseAGsrmgcXNHQHgcS0eccMgTkuWltrau23CnuFBUy01XTyNlhmjduuY8HIIPbldBuT7tHh2k6EiuEpYy70ZFPcoW8AJMcHgfgvHEdh3h1KzXPPBmppdRv+zLmSKiIpS6FEXLA8gl69+pfr2KXVEXLA8gl69+pfr2LmfhZFd7OXwKEoiKmYQXotv3RpvfmfSF519aWQQ1UUxBIY8OIHccoel0uVvtal0fZm6S0/UmO+XKIunmjd41JTnhkHqe7iAekAE8DulUoWa1zqSv1fq65akubiamvndKW5yI29DWDua0Bo7gsKupy3Mlvtdss+QREXJCF1D0z/i3a/wDQ4v7AXLxdQ9M/4t2v/Q4v7AU1PmaGg5yMgiLwaiu9BYLFW3q6TiCiooXTTPPU1ozw7SegDrJAVg0m8Go7btplq2Z6UdcqoNqblUZjt9HvYMz8dJ7GNyCT5h0kKgGsdS3rVuoam+36tfV11Q7LnO6Gjqa0fetHUAsxtc13ctomtavUFw3o4nHm6Om3sinhBO6wd/EknrJJWoKpZPczG1F7tlw5BERcFYIiIAiIgCm/Yxtdlt2z3U2z3UNUX0FVZq1tqmkd/ASmF/2nP4Lj7Xsdw++4Qgi9TaO4TcHlBEReHAREQHSTYp5HtHfAlJ9S1betQ2KeR7R3wJSfUtW3q6uR9BDwoKAOXZ5IrX8PQ/UVCn9QBy7PJFa/h6H6ioXNnhZHqPZSKVoiKoYYW07IPKzo/wCHaL69i1ZbTsg8rOj/AIdovr2L1czqHiR0qUI8tbyJv+Eqf/eU3KH+V5Z7vfNkL6Gy2uuudX6oQP5ikp3TSbo3sndaCcDtVufhZt38a5FDEW1exrtF9wOqvzPUfsI7ZvtEaCToLVQA4km0VHD+gqeGYmyXQ1VERDkIiIAi2C06H1rdrfFcLVo/UFfRzZ5qoprbNLG/BIOHNaQcEEcOsL1exrtF9wOqvzPUfsJhnWyXQ2jkn/8AeA0x+NU/qsq6Aqj3Jl0PrS0bcNO3G7aQ1Bb6KF1RztRU22aKNmaeUDLnNAGSQOPWQrwqzT4TU0SareepWrl16T8L01aNY08WZbfMaOqIHHmpOLCe4PBH/uKoK6abRtNw6v0LedNz7oFfSviY53QyTGWO9Dg0+hc0KunmpKualqY3RTwvdHIx3S1wOCD5iFHdHDyVtbDbPd1PkiIoikF0j2Lal9d2yzT99fJzk89G1lQc8TNH4kh9Lmk+lc3FbvkH6l8I07fdJzSZfR1Da2nBPHckG68DuDmA/HUtLxLBc0U9tmOpZhERWTWCIiAEgDJ4Bc1drWojqzaVqDUAfvxVda8wH/wmndj/AKDWq+O3vUfrW2Q6juzJNyfwR1PTkHiJZftbSO8F2fQucqgufJGdr58ohERQGcFdHkPaV9S9nldqeePE96qd2Ikf5CLLR8rzJ8gVN7TQVN0ulJbKKMyVVXOyCFg++e9wa0fKQumuj7HTaa0ra9P0eOYt9LHTtOMb260AuPeTknvKlpWXkvaGGZuXQyqIismoEREAWq7YvJHrL4Brv1d62parti8kesvgGu/V3rx8jmfhZzWREVI+fCIiAIiIAiIgCIiAKb+RZqGptW2SKzNEslNe6SaCRgmLWNfGwzNkLcYeQI3sHRjnHHPSDCCyGmrtU2DUdsvtGyKSpt1XFVwtlBLHPjeHtDgCCRkDOCPOvYvDySVz2TUjqGi8tmuNHeLRR3a3Tc/RVtOyop5N0t343tDmuwQCMgg4IBXqV03giIgCIiALm5tp0xHo3apqHTsDIo6amqy+lZHI54jgkAkibvO4khj2g5zxB4npPSNU75d+nqah1nYdSQGJkl1pJIJ42Qhpc+BzcSOcD4xLZWt4jgIxxIwBFcsxyU9bDNeehXBERVjJClrklaYj1Ltrtj6hkUlNZ433SVj5HNJMZa2It3ekiV8TsEgENOc9BiVW65BenqaPTmodVuMUlTUVbbdHmEb8LI2Nkdh+c4eZWZbgfwTTx4Y7rWZE+mhvsSLMoiK2bYREQBERAFzx5SeoanUe2vUtROJWR0VW63QRPmMgjZAebO7kDdDnNdJujoLz0nJN6dqWp49GbPL5qZz4myUNI99OJY3PY6c+LC1wbxw6RzGniOnpA4jmioLnyRn66fBRCIigM0IiIAiIgCIiAIiIAuqa5WLqmp6PM0dB975fqERFOaIWP1JaaW/aeuNkrm71NX00lNLw47r2lpI7+KyCIGsnLrUFrqrJfa+zVzNyqoamSnmHY5ji0/OF4VOvLU0r6ibU2X2CPdpb7TiYkDA56PDJB8nNu87ioKVKSw8GDZDZNxCIi8Iy+XJA1J6v7F6Gllk36izzSUMmTx3R48fo3Htb8VTCqc8hTUngWtbxpiaTEdzpBUQgn/KxHoHnY9x+IrjK3W8xNvTT31oIiLsnPJerhT2mzVt1q3btPRU8lRKexjGlx+YFcw75cai8Xquu1W7eqK2okqJT2ve4uPzlXq5XWofUHYnc4Y5Nye6yx0EfHqcd5/8AQY8elUJVe58cGZrp5kohERQlALoDyWdK+tbY1aGSx7lXcwbjUZHHMgG4PRGGDz5VI9lmmX6x2h2TTbGuLK2ra2Yt6WxDxpD6GBxXSyKNkUTIomNZGxoa1rRgADoAU1K8zQ0MOLkfpEXmutdT2y11dyrH7lNSQPnmd+CxjS5x+QFWDSKlcuHXbq3UFFoKhm/wa3htVXhp9tO4eI0/isOfj9yrUspq291WpNUXO/1pJqLhVSVDxnO7vOJDR3AYA7gsWqUpbnkwrbO8m5BEReERt+yXQF42jauhsNqAiZjnKuqc3LKeIHi49p6gOsnqGSL67M9nGlNntqbR6ftzGzloE9bKA6onPa5/Z/NGAOxajyUNDxaQ2V0dbNCG3O9tbW1LiPGDHD7UzzBhBx1FzlLqs1wwsmvpaFCO582ERFKWzWdoOg9La7tTrfqS1Q1Q3SIqgDdngPax/SPN0HrBVEdt+zC67MtUep9U81VtqcvoK0NwJWA8Wu7HtyMjvB6Cuii0TbvoaDX+za5Wbmmur4mGpt78cWzsBLQD1B3Fp7nKOyG5FbUUKyOVzOc6L+uBa4tcCCDgg9S/iqmMFKfJf1w/RW1Sh5+bctl1Ioa0E+KA4+I8/ivxx7C7tUWIOByETw8nUJOElJHVNFpmxDVB1jsrsF+lk36mWlEVST0maMljyfO5pPpC3NXU8rJvxkpJNBRFywPIJevfqX69il1RFywPIJevfqX69i8n4WR3ezl8ChKIipmEEREAUm7JtiOtNocbK6jp47bZyceH1mWsf2820cX+ccOGMhZrkr7KotoGp5breoS7T9qc0zM6BUzHi2L8XHF3dgffZF6aeGKngjggiZFDG0MjjY0Na1oGAABwAA6lLXXu4su6bS94t0uRX/TXJR0RRRNdfLxd7tOPbbjm08R+KAXf0ltUPJz2QMZuu0tJKce2dcanPzSAKWUU6hFeRoKitfdIZuPJm2U1TSILdcqAnrgr3kj/AFm8pgoaZlHRQUkRcY4I2xtLjxIaMDPyL7IvVFLkdRrjHwrAVV+XHrx7fAdn1vnwHAVlzDT08ftUZ+QvI/EKtHWVENJSTVdTII4IY3SSPPQ1rRkn5AuZ+0PUc+rtcXjUlRvB1fVPla13SxmcMb8VoaPQo7ZYWCtrbNsNq8zAoiKsZIRFKXJu2YP2ka13a5r22K3bs1we3hzmT4sIPUXYOT1AHrwiWXhHUIuclFHo2IbDNR7R925zSG0WAOwaySPLp8dIibw3uwuOAO8ghWl0nyf9l1ggY12nm3acAb09xeZi74nBg9DVJ1DS01DRw0VFTxU9NAwRxRRtDWsaBgNAHQAF9lajWkbFWmhBcVlmm1WyrZrUwmGTQenGtIxmO3xxu/KaAfnUYbReS5pC700tRpCeawV+CWRPe6ameewh2XN84JA/BKsCi6cE/IklTCSw0cydc6Sv2i9QTWPUVA+kq4+Lc8WSs6nsd0Oae30HBBCwS6K7ctmtt2laOlt0zI4rpTh0luqyOMUmPak/gOwAR5j0gLnndKGrtdyqbbX076erpZXQzxPGHMe04cD5iFWnDazJ1FDql7jzIiLgrhERAdJNinke0d8CUn1LVt61DYp5HtHfAlJ9S1berq5H0EPCgoA5dnkitfw9D9RUKf1AHLs8kVr+HofqKhc2eFkeo9lIpWiIqhhhbTsg8rOj/h2i+vYtWW07IPKzo/4dovr2L1czqHiR0qREV0+gC+VZ/FJve3fQvqvlWfxSb3t30IDliiIqJ86EREB0D5KXkA0x+JUfrMqlBRfyUvIBpj8So/WZVKCuQ8KN6n2cfggiIuiQKhnK50n62dsNbVwRblHemCviwOG+4kSjz74LvjBXzUDctjSfq1syg1DBFvVViqA9xA48xJhjx+VzZ8wKjtjmJW1cN9b9xSVERVTGClTkqal9be2qzmSTcprnvW6bj085jc//ANBGorX1pKiakq4aumkMc0MjZI3jpa4HII9IXqeHk7hLbJSOpyLD6HvsOp9H2jUNPgMuFHHUbo+9c5oLm+g5HoWYV03k8rKCIiHpWXl5aj5mw6f0rFJ41VO+tnaDxDYxuMz3Evd+QqjKV+VjqP1w7bLu2OTfp7WGW6Lj0c3xeP8AWOkUUKnY8yZiame+xsIiLkgJr5G2lfXBtciuk8e9SWOB1W4kcDKfEjHnyS4fiK9Cg7kXaV9QtlJvU8W7VX2oM+SMHmWZZGPl33DuepxVqtYibOlhsrXvCIikLIREQBarti8kesvgGu/V3ralqu2LyR6y+Aa79XevHyOZ+FnNZERUj58IiIAiIgCIiAIiIAiIgL88krU8mpdilsZUPlkqbPI+1yvfG1oIjDXRBu70gRPibkgElpznpMtKnfIQ1DTUOs79pucRMkutJHPBI+YNLnwOdmNrSPGJbK53A8BGeBGSLiK3W8xNvTT31phERdk4REQBRLytdMSal2KXN9OyWSps8jLpExkjWgiMObKXb3SBE+V2AQSWjGegy0vLebdR3i0VlpuMPP0VbTvp6iPeLd+N7S1zcggjIJGQQV41lYOZx3xcTlsiyGpbTU2DUdzsVY+KSpt1XLSTOiJLHPjeWOLSQCRkHGQPMseqRgNYC6SbFtMSaN2V6e07OyWOppqQPqmSSNeY55CZJW7zeBAe9wGM8AOJ6TQvYtpiPWW1TT2nZ2RSU1TVh9UySRzBJBGDJK3ebxBLGOAxjiRxHSOkanpXNmhoIc5BERTmiEREAREQFe+XNqeS2bPLbpmB8rJL3Vl8xEbSx8EG65zSTxaecfC4bo+9dkgcDTBTLyx9Q01+211VPSiJ0dnpIrcZY5hIJHgukf0DxS10roy3jgsOcHgIaVSx5kYupnvsYREXBXCIiAIiIAiIgCIiALqmuVi6pqejzNHQfe+X6hERTmiEREBDHLF0r64dkNRcoI96rskzaxhA4mL2so826d4/iKia6l3Oiprlbaq3VkYlpqqF8MzD0OY4Frh6QSuZmtbDU6Y1dddPVeTLb6uSAuIxvhriA7zEYPpVe5ccmZroYkpdTDoiKEoG07JNRnSW0qwagLyyKkrWGc/+C7xJP6DnLpUCCAQcg9BXKxdF+T9qT11bH9O3R8m/UNpRTVBJ485F9rcT3nd3vjKel80aOhnzib4iIpzRKi8vLUPP6i0/peJ/i0lM+tmAPAukdutB7wGOPx1WZb3t/wBQ+ufbDqS6MfvwCsdTQEHgY4gI2kdx3c+laIqc3mTZh3z32NhERckJZjkI6V8J1BetYVEeY6KEUVMSOHOSeM8jvDQ0eaRW7Uc8m7SvrS2PWShlj3Kuqi8OqsjB5yXxgD3hu434qkZW4LETc08NlaQUWcqy9mybDb6Y37s1cI6KPj0848B4/ID1Karjy87gYtCaftYdgVNydOR283G4f8RezeIsXy21yZTpERUzDCzGh7OdQ6zstiGf+0K+GmJHUHvDSfQCSsOszonUVZpLVdv1Jb6elqKqgl52KOpa50ZdggZDSDwzngR0IuZ1HGVk6cQxxwxMiiY1kbGhrWtGAAOgBfpUr+yx2i/yLpX/AGWo/fJ9ljtF/kXSv+y1H75We9iavrlRdRFSv7LHaL/Iulf9lqP3yfZY7Rf5F0r/ALLUfvk72I9cqLqIqV/ZY7Rf5F0r/stR++T7LHaL/Iulf9lqP3yd7EeuVEc7fbIzT22TVFsiZuRCudPG0DAayUCVoHcA8BaMtk2layuWvtW1GprvTUVPWVDGMkZSMc2M7jQ0HDnOOcAda1tV3z4GXNpybXIIiLw4Lh8g6+OqtG3/AE/I7JoK1lRHk9DZmkYHdmIn4ysgqY8hK4ug2l3i2k4jq7S6THa+OVmPme5XOVqp5ibOklmpBRFywPIJevfqX69il1RFywPIJevfqX69i6n4WSXezl8ChKIipmEERfqNhkkaxvS4gBAdDeThpqPS+xrT9GIwyerpxXVJ6zJMN/j3hpa34qkRfGip46SigpIhiOGNsbB2ADA+hfZXUsLB9BCO2KQREXp0EREBGnKfvrrBsQ1DPE/dmq4W0MfHGedcGO/oF59C57q5HLxuLodAWK1tdgVVzMrh2iONw+mQfMqbqrc/tGTrZZsx0CIijKYXQvk3aNj0VsntVG+EMr65grq44485IAQ0/it3W+g9qovswsrdRbRdPWSRu9FWXGGKUY/yZeN/+jldMBwGApqV5mhoYcXIIiKwaQREQBUy5b+jo7Rreh1ZRxBkF6iLKndHAVEYAyezeYW+lrirmqGuWRZW3XYjXVe4HS2uqgq2cOPF3Nu+aQn0LixZiV9TDdW/cURREVQxQiIgOkmxTyPaO+BKT6lq29ahsU8j2jvgSk+patvV1cj6CHhQUAcuzyRWv4eh+oqFP6gDl2eSK1/D0P1FQubPCyPUeykUrREVQwwtp2QeVnR/w7RfXsWrLadkHlZ0f8O0X17F6uZ1DxI6VIiK6fQBfKs/ik3vbvoX1XyrP4pN7276EByxREVE+dCIiA6B8lLyAaY/EqP1mVSgov5KXkA0x+JUfrMqlBXIeFG9T7OPwQREXRIF4NRWqkvthr7LXM3qWuppKeUfzXtLTjv4r3ogfE5eaktNXYdQXCyVzd2qoKmSnlGPvmOLSR3cFj1PfLa0n6jbS6fUcEW7TXynDnkDhz8WGP8AlbzZ7ySoEVKSw8GDbDZNxCIi8Iy7HIi1L6q7L6mwSyb09lrHNa3PRDLl7f6XOj0Ke1RzkW6l9RdrgtEsm7T3qlfT4J4c6z7Yw+fDXtH4yvGrVTzE2dLPdWvcFjdU3en0/pq53yqxzFvpJal4z0hjS7HpxhZJQnyztR+oux2W2xSbs95qo6UAHjzbTzjz5vEDT+Mu5PCyTWT2Qcij9xrKi4XCpr6t5kqKmV00rz989xJJ+Ur4IipGCFkdL2eq1DqO22KhGamvqo6aPhwBe4DJ7hnJ8yxynzkSaV9WNpdTqKePeprHTFzCRw5+XLGf0ecPnAXsVl4O6ob5qJcuxW2ls1lobRQs3KWip46eFvYxjQ0fMF7ERXTe5BERAEREAWq7YvJHrL4Brv1d62parti8kesvgGu/V3rx8jmfhZzWREVI+fCIiAIiIAiIgCIiAIiIDcNi2p49G7VNPainfFHTU1WGVT5I3PEcEgMcrt1vEkMe4jGeIHA9B6RrlYuj2wq/+ufZBpi8Olq5pX0DIJ5ap29JJNDmKR5OTnefG45JyQQTg5CnpfNGjoJ84m6oiKc0QiIgCIiAojyx9PU1h211VRSmJsd4pIriYo4RGI3kujf0Hxi50TpC7hkvOcniYaVyeXbYPDdAWXUUcVXJLa68wP5tuY44Z2+M9/Dh48UTQcgZfjiSMU2VSxYkYuphttZY/kIaepq7Wd+1JOYnyWqkjggjfCHFr53OzI1xPikNic3gOIkPEDINxFEHI/sHqHsQts74quKou1RNcJmTt3cbzubYWDAO46OONwJzneyDgjEvqxWsRNPTQ21IIiLsnCIiALy3m40dntFZdrjNzFFRU76iok3S7cjY0uc7ABJwATgAlepRBywL/wCoexC5QMlq4qi7VENvhfA7dxvO5x4ecg7jo45GkDOd7BGCceSeFk4slsi5FG9S3apv+o7nfaxkUdTcauWrmbECGNfI8vcGgkkDJOMk+dY9EVIwW8hERDwIiIAiIgCIiAIiIAuqa5WLqmp6PM0dB975fqERFOaIREQBUy5cmlfU3Xtv1TBHiC8U3NzED/LxYbk+dhZ+SVc1RTyrNK+ujY1dDDHv1dqxcYMDj9rB5wf6sv4doC4sWYkGphvraKBIiKoYgVsuQZqTnLbqHSU0nGGRlwp2k9TgGSegFsf5SqapO5L2pPW1tqsc0km5T17zb5+OMiXg3PcJNw+hdQeJIn089liZ0FWt7UNQDSuzy/ag3g19FQyPhJ65SMRj0vLR6Vsir9y5NQ+p2zSg0/HJuy3euBe3PtooRvO/pmJWpPCya9s9kHIpc4lzi5xJJOST1r+IipmCFuGxjSx1ltPsWn3Rl9PPVB9UP/BZ48nmy1pHnIWnq0nIO0rv1V91nPHwja23UriOs4fKfOBzY+MV1BZlgmohvsSLXgAAAAADoAREVw3Aqpcv6YmfRtODwa2seR5zCB9BVrVUzl+MIumkH9Rgqx8jov8Amo7fCytq/ZMq+iIqpjBERAEREAREQBERAEREAREQEycjaodDt1t0YOBPSVMbu8c2Xf7oV71Qbkhh3s/WDd6BHVb3m8Gk/vwr8qzT4TW0Ps/mFEXLA8gl69+pfr2KXVEXLA8gl69+pfr2LufhZPd7OXwKEoiKmYQXotv3RpvfmfSF516Lb90ab35n0hD1HUtERXj6EIiIAiIgKp8v6YmbRtODwDa15Hn5gD6CqsK0PL8YRctISdToatvyGL/mqvKpb4mY2q9qwiIuCsSpyTaZtTt904HjLYvCJT5xTyY+fCv+qEckCQM2+WNpIy+KqaP9nkP9yvurNPhNbQ+zfxCIilLgREQBaZt0pW1mxvV8TgCG2epl49rIy8f2Vua1XbC8R7JdYPdjAsVb0+8PXj5HM/CzmsiIqR8+EREB0k2KeR7R3wJSfUtW3rUNinke0d8CUn1LVt6urkfQQ8KCgDl2eSK1/D0P1FQp/UAcuzyRWv4eh+oqFzZ4WR6j2UilaIiqGGFtOyDys6P+HaL69i1ZbTsg8rOj/h2i+vYvVzOoeJHSpERXT6AL5Vn8Um97d9C+q+VZ/FJve3fQgOWKIionzoREQHQPkpeQDTH4lR+syqUFF/JS8gGmPxKj9ZlUoK5Dwo3qfZx+CCIi6JAiIgIi5W2k/XNsdr6iGLfrLM4XCHA47rQRKPNuFx87QqErqfVQQ1VNLTVEbZYZmGORjhkOaRgg+cLmjtJ01No/Xl501Nvf4BVPjjc7pfGeMbvSwtPpVe6PHJm66GGpGvIiKEzzJaXu9Rp/UtsvlIft9vqo6mMZ6SxwdjzHGF04tVdT3O2Ulyo385TVcLJ4XfhMe0OafkIXLVX05ImpfXBsXt9PLJv1NolfQSZPHdbh0fo3HNHxSpqXxwX9DPEnEl9Uy5c+o/VDaHbNORSZitNFzkgz0SzEEj8hsZ9KuY4hrS5xAAGST1LmltS1CdV7Rb9qHfLo62tkfCT1RA7sY9DA0ehd3PCwTa2eIbeprSIirGUFfPkiaV9bex2iq5o9yrvUhr5MjjuOwIh5twB3xiqUaB09PqvWtn05T7wfcKtkLnD7xhPju+K3J9C6Y0VNBRUUFHSxtip4I2xRMb0Na0YAHmAU1K45L+hhluR9kRFYNMIiIAiIgC1XbF5I9ZfANd+rvW1LVdsXkj1l8A136u9ePkcz8LOayIipHz4REQBERAEREAREQBERAFbrkF6hppNOah0o4RR1NPVtuMeZhvzMkY2N2GYzhhiZl2T/AArRw4ZqKpV5KOovW9tvsvO1ng1Jc9+3VH2rf5znG/amdBIzM2HiMY6yBldVvEkT6aeyxMv8iIrhthERAEREBrW1LTEes9nl80y5kTpK6keynMsjmMbOPGhc4t44bI1jjwPR0EcDzh01aam/6jtlio3xR1Nxq4qSF0pIY18jwxpcQCQMkZwD5l1DVS9nGz23UnLPvluaaQ0Vk528QU4o2iMc62N0cTW5wzmjUtLXDriGA3I3YbY5aKWrq3yi/kWqs1uo7PaKO026HmKKip2U9PHvF25Gxoa1uSSTgADJJK9SIpi6EREAREQBU75d+oaau1nYdNwCJ8lqpJJ55GTBxa+dzcRuaB4pDYmu4niJBwAwTcRc1tr2ovXZtP1Ff2VnhlPVV8ngs3Nc3vU7TuQ+LgEYjawcRnhx45UVzwsFPWzxDb1NVREVYyQiIgCIiAIiIAiIgCIiALqmuVi6pqejzNHQfe+X6hERTmiEREAX4nijnhfDMxskcjS17XDIcCMEFftEBzQ2n6ak0ftAvem5A7doatzIi7pdEfGjd6WFp9K1tWY5dulfBdQWbWNPHiOtiNFVEDhzkfjMJ7y0keaNVnVOaw8GFdDZNxC+lNNLTVEdRA90csTw9j29LXA5BHpXzRckR050HfotUaLs+oYd3duFHHO4D71zmjeb6HZHoVO+WxqH1V2tss8b8w2aiZCW54c7J9scfyXMHxVMHIo1THW7KK2z1c4a6w1T+LjwZBIDICfjc78iqJru+Sam1pedQS5zcK2WoAP3rXOJa30DA9CnslmKNHU27qY+8wqIigM4LozsE0r6ztk1is8kfN1RpxUVYI489J47ge9uQ34oVIdgWlfXjtasVokj5ylbUCpqwRw5mLx3A9zsBvxl0YU9K8zR0MOcwiIpzRCq5y/KQuoNIVwHCOWrid8YREf2CrRqBuXBajW7Iqa4Mbl1uucUjj2Me17D/ScxcWeFkGpWamUlREVQxApD5OenrFqra9Z7BqOi8Nt1W2cPh518eS2F72+Mwg9Le1R4t85Plxbattek6tzt1rriyAns53Mf++vY80SV43rPUuF9jvsd9x/6Sq/3qfY77Hfcf+kqv96pVRW9kehtdzX/AEr8CKvsd9jvuP8A0lV/vU+x32O+4/8ASVX+9UqomyPQdzX/AEr8CKvsd9jvuP8A0lV/vU+x32O+4/8ASVX+9UqomyPQdzX/AEr8CKvsd9jvuP8A0lV/vU+x32O+4/8ASVX+9UqomyPQdzX/AEr8CKvsd9jvuP8A0lV/vU+x32O+4/8ASVX+9UqomyPQdzX/AEr8DQtHbHdnOkL9DfdO6d8CuMLXNjm8NqJN0OaWu8V8hHQT1LfURepJcjqMVFYSwFEXLA8gl69+pfr2KXVEXLA8gl69+pfr2LyfhZxd7OXwKEoiKmYQXotv3RpvfmfSF516Lb90ab35n0hD1HUtERXj6EIiIAiIgKw8vqj37LpO4Y/gaiphJ/HbGf8AhqpSvPy0rQblsVlrGs3nWyvgqcgcQ0kxH0fbB8iowqtq+0ZGsWLQiIoyob7yebm20bbNKVj3BrXV7ack9XOgxf766LLljR1E1HWQ1dO8xzQSNkjcOlrmnIPyhdNNC6gptVaOtOoqQt5q4UrJsA+0cR4zfO12R6FPS+aNLQS4OJmkRFOaAREQBRxymbk217DNUTucAZaUUzRnpMr2x/Q4n0KR1Wnl3anZTaasukYZBz9bUGtnaDxEUYLWg9znOJ+IuZvEWRXy21tlQkRFTMIIiIDpJsU8j2jvgSk+patvWobFPI9o74EpPqWrb1dXI+gh4UFAHLs8kVr+HofqKhT+oA5dnkitfw9D9RULmzwsj1HspFK0RFUMMLadkHlZ0f8ADtF9exastp2QeVnR/wAO0X17F6uZ1DxI6VIiK6fQBfKs/ik3vbvoX1XyrP4pN7276EByxREVE+dCIiA6B8lLyAaY/EqP1mVSgov5KXkA0x+JUfrMqlBXIeFG9T7OPwQREXRIEREAVQ+XZpPwXUFn1lTxYjrojRVRA4c7H4zCe8tJHmjVvFH3KJ0n68dkV7tkUXOVkEXhlIAMnnYvGAHe5u834y4msxIdRDfW0c7URFUMMKxvIU1L4Fra76XmkxFc6QTwgn/KwnoHnY9x+Iq5LZtlWo3aS2jWHUW8Wx0dYx02OkxE7sg9LHOC9i8PJLTPZNSL4coTUfrX2O6iuTJNyd9KaWnIPHnJTzYI7xvF3xVzpVs+XjqVrbPp3S1PKHeEyvuE4afvWjcj84Jc/wDJVTF3a8ywT62e6zHQIiKMpljeQvpXw/Wd01bURZhtVPzFOSP8tLnJHmYHA/jhXGUYcl3SvrU2N2iKWPcq7k03Gp4YOZQCwHvEYYPOCpPVutYibemhsrSCIi7JwiIgCIiALVdsXkj1l8A136u9bUtV2xeSPWXwDXfq714+RzPws5rIiKkfPhERAEREAREQBERAEREAX1o6mpoqyGso6iWmqYJGywzRPLHxvactc1w4gggEEdC+SIenUPTV2pr/AKctl9o2Sx01xpIquFsoAe1kjA9ocASAcEZwT51kFBfIlv8A6qbIH2eSWk52zV8sDIo3fbBDJiVr3jJ6XvlAOACGY6QSp0V2Lysm9XPfBSCIi9OwiIgCx8FppodR1t9a+U1NZSU9JI0kbgZC+Z7SBjOSZ3549TeA45yCIMBERAEREAREQGlbdb/62NkGp7w2WrhlZQPgglpXbskc02Io3g5GN18jTkHIAJGTgLnCracva/8AN2jTWlopaR3P1EtwqGb2Zo+bbzcRxngx3OTcSOJZwPAqparWvMsGTrZ7rMdAiIoimEREAREQBERAEREAREQBdU1ysXVNT0eZo6D73y/UIiKc0QiIgCIiAjvlHaV9d+x+92+KPfq6aLw2kwMnnIvGwO9zd5vxlzwXVMgEYPELm/tt0qdGbUb7YWR7lNFUmWlGOHMyeOwDtw1wHnBUFy8zO10OUzTERFAZxuezTXNVo626qpIC8tvdnfQgN+9kc4AP9DDJ8q0xETJ05NpIIi/rQXEAAkngAOtDktfyD9K83R33Wc8fjSuFupXEfejD5T5iTGPilWjWo7GtLjRuzGxafcwMnp6Vr6kf+M/x5P6TiPMAtuVyCxHBu0Q2VpBERdEoWo7Z9PeurZZqOxtj5yaehe6BuOmVnjxj8trVtyLxrJ5JblhnKxFIvKM0c/RW1m70DIeboauQ1tDgeLzUhJ3R3NdvN+Ko6VJrDwYEouLaYX2oqmairYKymeY54JGyxuH3rmnIPyhfFEPDp1ofUFLqrR9q1FRkczcKVk2Ac7jiPGb52uyD3hZlVC5HG1ekssjtA6iq2wUlTMZLZPI7DI5Xe2iJPQHHiP52R98Fb1XIS3LJuU2qyCYREXRKERRxt12rWfZppySR0kVTfKlhFBQh2SXdAkeOkRg9fXjA7vG0llnMpKKyzFbR+UFofQuq6jTVypbzW1tM1hmdQwxPjYXDIaS6Rp3sEE8OvzrXPssdnX8i6q/2Wn/fKmt2uFbdrpVXO41D6msq5XTTyvPF73HJJ9JXlVd2yMt62zPAup9ljs6/kXVX+y0/75PssdnX8i6q/wBlp/3ypWi872R565adFNkO1ew7TxcXWC2Xmmjt/NiWSuhjY1xfvYDdyR2T4pJ9Hat/UYcmLRT9FbJrfT1UJjuNxPh9Y1ww5rngbrD2brA0Edu8pPViOccTTqcnBOXMKIuWB5BL179S/XsUuqIuWB5BL179S/XsSfhZ5d7OXwKEoiKmYQXotv3RpvfmfSF516Lb90ab35n0hD1HUtERXj6EIiIAiIgMHtAsLNT6IvWnn7v/AGhRSwMLuhry07rvQ7B9C5mVMEtNUy01RG6OaJ5ZIxwwWuBwQfSup6ofyutFO0rtWqblBFu2++g1sJA4CUn7c3z7x3vM8KG5cMlDXV5SkQ4iIq5mBWl5E20iKB02zq7VAYJHuqLU57uG8eMkI8/tx37/AGhVaX1o6moo6uGrpJpIKiB7ZIpY3FrmOByHAjoIK9jLa8ktVjrluR1ORQFsE5Q1n1PRU9j1nVwWu/MAY2pkIZBWdhz0MeetpwCejp3RPoIIBBBB4ghXIyUllG1XZGxZiERYzU2oLJpq1SXW/wBzprdRxjxpZ37oJ7AOlx7AMkr07bxzPReLlQ2e1VV0uVTHTUdJE6aeV5wGMaMkrnPtj1tU7QNoFx1HMHsgkdzVHC7pigbwY3z9JPe4rfeUdtxqdoUpsFhE1HpqGTeO/wCLJWuB4OeOpg6Q30njgNhJVrJ7uCMnVXqx7Y8giIoimEREB0k2KeR7R3wJSfUtW3rUNinke0d8CUn1LVt6urkfQQ8KCgDl2eSK1/D0P1FQp/UAcuzyRWv4eh+oqFzZ4WR6j2UilaIiqGGFtOyDys6P+HaL69i1ZbTsg8rOj/h2i+vYvVzOoeJHSpERXT6AL5Vn8Um97d9C+q+VZ/FJve3fQgOWKIionzoREQHQPkpeQDTH4lR+syqUFF/JS8gGmPxKj9ZlUoK5Dwo3qfZx+CCIi6JAiIgCIiA5y7edKeszatfLLHFzdJz5qKQAcOZk8doH4uS3ztK0ZWz5d+k+dt1k1pTxZfTvNvq3Acdx2Xxk9wIePjhVMVOaxLBh3w2WNBERckJsWvdW3HWFfb6u4kl9DbKa3xknJLYmYLj3ucXO9K11ETmettvLC2nZNph+sto9j04Gl0VXVN8Ix1Qt8aQ/kNctWVnuQhpXnrrfNZ1EeWU0YoKVxHDfdh8hHeGhg8zyuoLLwSUw3zUS2kbGRxtjjaGMaAGtAwAB1Bf1EVw3QiIgCIiAIiIAtV2xeSPWXwDXfq71tS1XbF5I9ZfANd+rvXj5HM/CzmsiIqR8+EREAREQBERAEREAREQBERAT1yItTyWnapPp175TTX2kcwMZG0jn4QZGOc48QAwTDh0l4yOsXZXMbQmoanSes7RqSlErpLdVxzmOOYxGVgd48e8AcB7d5p4Hg45BHBdOVYpfDBq6GeYOPQIiKYuhERAEREAREQBERAERYrWN49b2kbzf/B/CfUygnrOZ39znObjc/d3sHGd3GcHHYUPG8cSiHKk1PJqfbXfHh8pprXJ6l07JI2tLBCS2QeL0gymVwJOcOHR0CMF9aypqa2smrKyolqameR0s00ry98j3HLnOceJJJJJPSvkqLeXkwJy3ScmEREOQiIgCIiAIiIAiIgCIiALqmuVi6pqejzNHQfe+X6hERTmiEREAREQBVV5eGlfuFrSnj7bdVuA874j9YM+ZWqWmbbtK+vPZbfbCyPfqZKYy0oxx56Px2AectDfMSuZrMcEV8N9bRzfRCCDg8CipmEEREAUj8mzSvrt2xWSilj36Skk8OqsjI5uLDgD3F+434yjhW85CWlfBdO3rWFRHiSumFFTEjjzcfjPI7i4geeNdQWZE+nhvsSLLoiK4bYREQBERAQzystnD9b6DF0tkPOXqyB88LWjLp4SPtkfecAOHe3A9sqJLqmqb8rHYzJYLjUa50xRk2apfv19PE3+KSk8XgDojcfyT3EYgth5oz9ZRn7cfmV0REUBmhTHsy5ROutHUsVurHxagtsQ3WRVrjzsbexso44/GDsdWFDiL1NrkdwnKDzFlw7Xyt9KyRA3TSt6ppMcW00kUw+VxZ9C9FZytdEMjcaPTmoZn44CVsMYPpEjvoVNEXfeyJ/XLepYjW/Ks1Xc4JKbTFmo7Ex4x4RI/wmcd7cgMHpa5QHebpcbzc57ndq6orq2d29LPPIXvee8leNFw5OXMhnbOzxMIiLwjCmbkqbMZNca1ZeblTk2CzyNlmLm+LUTDiyLvHQ53dw++C1XYzswv20vUTaK3xup7bC4Gur3NyyBvYPwnnqb8uBkq/wBorTNn0fpqj09Y6YQUVKzdaDxc93S57j1uJ4kqWuGXllzS6dze58jMoiKyawURcsDyCXr36l+vYpdURcsDyCXr36l+vYuZ+FkV3s5fAoSiIqZhBei2/dGm9+Z9IXnXotv3RpvfmfSEPUdS0RFePoQiIgCIiAKOeUNs9ZtE2d1Vugjb6rUeam2vPD7aBxZnseMt7M4PUpGReNZWDmUVJNM5X1EMtPUSU9RE+KaJxZJG9uHNcDggg9BBX4VqeWBsfldLPtF01Sl4I3rxTRt4jH/9gD+3+V+EVVZU5RcXgxLanXLawiIvCILbdK7Ste6XhbT2LVd0pKdntIOe5yJvmY/LR8i1JETweqTXFEm1W33a7UQmGTWU7WkYzHSU8bvymxg/OtDv9+veoKzwy+3euudR1SVU7pXAdg3icDuCxyL1tvmdSnKXNhEWy6E0bddXOu0lCwspLRbp6+sqC3LY2RxucG/jOLd0DznoBXmMnKTbwjWkREPAiIgOkmxTyPaO+BKT6lq29ahsU8j2jvgSk+patvV1cj6CHhQUAcuzyRWv4eh+oqFP6gDl2eSK1/D0P1FQubPCyPUeykUrREVQwwtp2QeVnR/w7RfXsWrLadkHlZ0f8O0X17F6uZ1DxI6VIiK6fQBfKs/ik3vbvoX1XyrP4pN7276EByxREVE+dCIiA6B8lLyAaY/EqP1mVSgov5KXkA0x+JUfrMqlBXIeFG9T7OPwQREXRIEREAREQGr7V9Ls1ns6vem3NaZKylcICehszfGjPoe1q5rSxvilfFKxzJGOLXNcMEEdIK6oqgPKq0n61dsd05mLco7ri40+Bw+2E84PRIH8OzCguj5mfrq+CmRUiIoDNCIiALoryfNK+s/ZHY7VJHuVcsHhdWCMHnZfHIPe0EN+KqRbB9K+vLavYrLJHzlL4QKirBHDmY/HcD58bvncF0bU9K8zR0MOcwiIpzRCIiAIiIAiIgC1XbF5I9ZfANd+rvW1LVdsXkj1l8A136u9ePkcz8LOayIipHz4REQBERAEREAREQBERAEREAXQTkt6nj1PsUsby+I1Nrj9S6hkcbmhhhAbGPG6SYjE4kHGXHo6Bz7VpOQXqeQVmodGTPldG+Nt0pmiNu4wgtimJd7bLt6DA4jxHdB6ZKniRb0c9tmOpa9ERWjXCIiAIiIAiIgCIiAKBeW7qeO07K4NOsfEam+1bWFj43E8xCRI9zXDgCHiEcekPOB1ielSblu6nku21SDTrHyimsVI1hY+NoHPzASPc1w4kFhhHHoLDgdZjseIlfVT21P3kCoiKqYoREQBERAEREAREQBERAEREAXVNcrF1TU9HmaOg+98v1CIinNEIiIAiIgCIiA54co7SvrQ2wXu3xR83SVMvhtIAMDm5fGwO5rt5vxVHa6dX7Selb/Usqr7pmy3WeNnNslraGKZ7W5J3QXtJAyScd6x3sa7OvcDpX8z0/7CgdOWZ09C3JtM5rIulPsa7OvcDpX8z0/7Cexrs69wOlfzPT/sLzuX1OfUJdTmzDHJNMyGJjnyPcGsa0ZLieAAXSzZdpqPR+z2yabYGh1FSNbMW9DpT40jvS8uPpX5ptnmgKWpiqabQ+mYZ4nh8ckdpga5jgchwIbkEHjlbMpK69pZ0+n7ptthERSFoIiIAiIgC/E8UVRBJBPEyWKRpY9j2hzXNIwQQekEdS/aICpm3jk1VME1RqHZzAZ6dxL5rRnx4+0wk+2H8w8R1Z4AVjqqeelqZKaqgkgnicWSRyMLXMcOkEHiCup60zaJsv0Tr2MnUNlikq93dZWw/aqhnZ446QOx2R3KGdWeKKN2jUuMOBzfRWg1jySa+N75dI6ognj6W09yjMbgOznGAgn4oUY3rk/bWbY92dLPrIx0SUlTFKD8UO3vlChcJLyKMtPZHmiLUW4T7LtpMDt1+gtSk/zLZK8f0Wlf2n2V7Sp3BrNB6jBP/wCS3SsHyuAXmGcbJdDTkUq2Xk9bWbm4Z0z4FGf8pV1UUYHxd4u+ZSZpHkkVr3sl1ZqqCFnS+C2xF7j3c48AD8kr1Qk/I7jp7JckVgjY+SRscbXPe4gNa0ZJJ6AAp62Ncm3UWppIbrrFs9htGQ4U7m4q6gdgaf4Md7uP83rVntnmybQehAyWxWOI1rR/Hqr7dUHvDj7XzNAC3lTRp6l2rRJcZmL0tp6zaXskFlsFvhoKGAYZFEOk9bielzj1k5JWURFMXkscEEREPQoi5YHkEvXv1L9exS6vJeLXbLzQPt94t1HcaOQgvp6qBssbiDkZa4EHBAK8ksrBxZHdFx6nLdF0p9jXZ17gdK/men/YT2NdnXuB0r+Z6f8AYUHcvqZ/qEupzWXotv3RpvfmfSF0h9jXZ17gdK/men/YX9bs32dtcHN0FpZrgcgi0QZB/ITuX1HqMuptKIisGmEREAREQBERAfxzWuaWuAc0jBBGQQqocoXk5Txz1Op9ndJzsLiZKqzxjxmHpLoB1j+Z0j73PAC2CLmUVJcSO2qNqxI5XTRyQyviljdHIxxa9jhgtI6QR1FfldEdp+xzQ20HfqLtbTS3MjAuFGRHN3b3Ah/xge4hV11jyUtYUEj5dM3e33mnHtY5iaabzYOWHz7w8yryqkjMs0lkeXErwi3+67GNqdteWVGiLtIR100YqB8sZcsazZjtHe/cGgtUA99qmA+UtXG1ld1zXkakik+w7Atq93kaGaVlooz0yVs0cIb52k73yAqZNnvJPpYJY6vXN98L3cE0Nuy1h7nSuAcR3BrT3r1Qk/Ikhp7J8kV72W7O9SbRL822WGkPNMINVWSAiGmaetx7exo4n5VdKbQVk2d7AdUWKzRlx9RKx9VUvA5ypl8Hfl7voA6h8qkHTlis+nLTFabFbaa3UMPtIYGboz1k9pPWTxPWvZV09PWUk1JVwRVFPOx0csUrA5kjHDBa4HgQQSCCrEK1FGjTplWvecsUXSn2NdnXuB0r+Z6f9hPY12de4HSv5np/2FH3L6lb1CXU5rIulPsa7OvcDpX8z0/7Cexrs69wOlfzPT/sJ3L6j1CXU+WxTyPaO+BKT6lq29fGipaWho4aKipoaamgYI4YYWBjI2AYDWtHAADgAF9lOuCNKKwkgoA5dnkitfw9D9RUKf1j79ZLLf6NlHfbRb7rTMkErYa2mZMxrwCA4NeCAcEjPeV5JZWDi2G+DicvEXSn2NdnXuB0r+Z6f9hPY12de4HSv5np/wBhQ9y+pQ9Ql1Oay2nZB5WdH/DtF9exdAPY12de4HSv5np/2F9aPZ9oKjq4ayj0RpqnqYJGyQzRWqBj43tOWua4NyCCAQR0IqWnzPY6GSecmyoiKwaQXyrP4pN7276F9UcA4EEAg8CD1oDlYi6U+xrs69wOlfzPT/sJ7Guzr3A6V/M9P+wq/cvqZnqEupzWRdKfY12de4HSv5np/wBhPY12de4HSv5np/2E7l9R6hLqazyUvIBpj8So/WZVKC8tpt1vtNvit9qoKWgo4c81T00LYo2ZJJw1oAGSSeHWV6lOlhYNGEdsUugREXp0EREAREQBV75cOk/VTZ/Q6pp4s1FmqNyYgf5CUhpz5niP8oqwixerrJS6k0vc7BWj/B7hSyU7zjO7vNIDh3g4I7wuZLKwR2w3wcTmAi+lTE6ColgcQXRvLCR0Eg4XzVMwQiL+tBc4NaCSTgAdaAtdyD9K7lLfdaVEfGRwt1I4j70YfKfMTzY+KVaRajsb0sNGbMrFp4sDJ6elDqn35/jyefxnEeYBbcrkFiODdohsrSCIi6JQiIgCIiAIiIAtV2xeSPWXwDXfq71tS1XbF5I9ZfANd+rvXj5HM/CzmsiIqR8+EREAREQBERAEREAREQBERAFIHJ51V6z9r9huks/M0U1QKOtLqnmI+Zm8Qukd0FjCWyYPDMY4jpEfoieHk6jJxaaOqaLWtlup49Z7PLHqZr4nSV1Ix9QIo3MY2ceLM1odxw2Rr2jiejpI4nZVeTyb6aaygiIh6EREAREQBERAfKsqaaio5qysqIqamgjdLNNK8MZGxoy5znHgAACST0LmXrvUNTqzWd31JVCVslxq5JxHJMZTEwu8SPeIGQxu60cBwaMADgr1cqTU8emNil8eHxCpukfqXTskjc4PMwLZB4vQREJXAk4y0dPQefar3PjgzddPiohERQmeEREAREQBERAEREAREQBERAF1TXKxdU1PR5mjoPvfL9QiIpzRCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiALD62vlPpnSF21BUua2OgpJJ+P3xa0lrfOTgDvKzBIAyeAVPuV3thpNQk6E0vVtnt0EofcqqN2WVEjT4sbT1taeJPW4DHRx5nLaiK61VwyVuc5znFziS4nJJ6yv4iKmYQUk8mjSvrt2xWWklj36Sik8PquGRuRYIB7i/cb8ZRsrgchTSvgelrvq+ojxLcZxSUxI481HxcR3F5x/7a6rWZE+nhvsSLJoiK4bYREQBERAEREAREQBarti8kesvgGu/V3ralqu2LyR6y+Aa79XevHyOZ+FnNZERUj58IiIAiIgCIiAIiIAiIgCIiAIiIC5/IZ1PJc9nly0zO+V8lkqw+EmNoYyCfec1oI4uPOMmcd4ffNwSOAsIqI8jjUNNYdtdLT1QibHeKSW3CWSYRiN5LZGdI8YudE2MN4ZLxjJ4G3G0naDQaSi8HiYyruLmkiLfw2PI4F3zHd4cOsZGZ1bGEN0nyNFa6rTabvbpYSNnvd5tdlpvCLpXQ0sZ4jePjOwRnDRxOMjOBwUaao21W6kklp7HQmrc3g2eYlrCQ7Bw0cSCBwOR09HBQvqTUV1v1a6quNZLO89G844AyTgDqGSeA4DKxCzLu0Zy4Q4I+B7S9M9RY3HSrbHrzf7EmXPbNquona+ldS0bA3BZHCHAnJ4+Nk//peT2X9afyhF/s0f7Kj5FUequf3mfPS7e7Rk8u6X4sme2bc6wTuNxs9LJFu+KIHuY7eyOs73DGepSZprXemL/wA2yiuDY539EM43HZ3t0DPtST1AEn51UxfSCeWF4fG9zSOsHCnq7Qti/tcTX0PphrqJf6r3r38/xRdVFBuzHazNE6O16jc+ojc/xKtziXsB6d7pLhnB7QM4zwCnCGSOaJk0MjZI3tDmPachwPEEHrC2Kb4XRzE/R+zO1dP2jV3lL+K80VS5emp5DWae0ZC+VsbI3XSpaY27jyS6KEh3tst3Z8jgPHb0noq2t62/6hptU7ZNTXmjERpn1fMQvimErJWQsbC2RrgMEPEYeMfhYyek6KoZvMmyrfPfY2ERFyQhERAEREAREQBERAEREAREQBdU1ysXVNT0eZo6D73y/UIiKc0QiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiICte2PlB6m2f7WbrpuGz2u42ymbA6MSb7JhvwseRvg46XH71YSblfVRgxDoKFkuPbOupc3Pm5ofSo25Xvl9v3vdL+rxqJFVlZJN8TIs1FkZtJ+ZKe0rb1r/XFLLb562G02yUFslJb2mMSN7HvJLnDtGQD2KLERRtt8ytKcpvMmEREOT908MtRPHBBG6SWRwYxjRkucTgADtyuley3TbdIbPLHpsBofRUbGTbvQZT40hHneXH0qofI50HJqXaMzUlZTl1rsWJg5zfFfUn+DaO9vt+7db2q8KsUx4ZNPQ14Tm/MIiKYvhERAEREAREQBERAFqu2LyR6y+Aa79XetqWq7YvJHrL4Brv1d68fI5n4Wc1kRFSPnwiIgCIiAIiIAiIgCIiAIiIAiIgM/oGG4HVFFX22d1NUW+eOqjnDA7m3scHNIDgWk5AODw4HgehTLda+ouVZJVVMr5ZJHFxc4kkknOeK1DQltNBZYjKzdml+2PBznj0dPQcYHoWyN6Fk6m5zlhckfnPb3aUtVe64v7EeX7n9RFJWgdkVz1JZhda6v8AUmCbBpWup+cfKz8MjebutPDHb09GCYq6p2vEFkzNFoNRrrO708dz/wA83wI1Rb5qvRUuk7oaSrhE8b8mCpIy2ZuenHQHDhkdXeCCcO+kpXtLTBHg9jcH5QvJVyi8PmZuptlpbpU2walHg0zW0WUrrXutdJTEnHHcPT6Fi1yd12xsWYgEg5BwVI2nNqk2m9m+oaSoqXw1MFBPLbKoMMpiqCwiMFhBBbv7p6MAklwwSRHK+VS3nIHRknDhxUtF0qpbkavZfaNvZ96trfx96IKRe+/0L7dd6ilczcaHEx9ON09GCens9C8C2E8rKP1CuyNkFOPJ8QiIvTsIiIAiIgCIiAIiIAiIgCIiALqmuVi6pqejzNHQfe+X6hERTmiEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAUH5Xvl9v3vdL+rxqJFa3lD7CNdax2mXPVNhFrno6tkIZE+pLJQWRMYcgt3elp6+hRXNyc9r7HYbpaOUdrbjTY+eQKpOMsvgY11Njm2k+ZEyKXqbk37XJXASaepqcdslwgI/ovK2WxclDXVVI03a82S2wn224988g+KGhv8ASXmyXQ4VFj+6V8UibFdk2odpV6jZTQy0dljf/hlxezxGDrazPt39w6Ok4CtFoDk0bP8ATjo6m8Mn1JWNwc1niwA90TeB8zi4KaKSmp6OmjpaSnip4Im7scUTA1jB2ADgApI09S1VonnMzGaN01ZtI6dpbDYaNlLQ0zcNaOLnnre4/fOPSSswiKwaKSSwgiIh6EREAREQBERAEREAXyrKamraOajrKeKppp43RTQysD2SMcMOa5p4EEEgg9K+qIDljWU1TRVk1HWU8tNUwSOimhlYWPje04c1zTxBBBBB6F8lJ/Kk0xJpjbXfGBkoprpJ6qU75JGuLxMS6Q+L0ASiVoBGcNHT0mMFRaw8Hz847ZOLCIiHIREQBERAEREAREQBERAF6rTB4Tc6anMbpGvlaHNGcluePR3ZXlWY0X/jPRfjO/slczeItkGqm66JzXkm/oS3A0Mia0DAAX1b0r8t9qEWEfkj4noponTzsib0uPT2DrVxdPXmgv1rjuNul5yJ/BzTwdG7ra4dRH/IjIIKqHYADWuJGcRkjPVxC2m33O5W7f8AU+4VdHzmN/mJnR72M4zg8cZPyq5pNT3DfDKZpdi+kz7E1ElKG6Eks9crOMfiSjt3vNA+gprFHLzlayobUSNbxEbdxwAceoneBA7OJxkZiNfuaWSeZ800j5JZHFz3vdlzieJJJ6SvwuL7nbNyZg9udrT7W1ktTKOM8EuiXL59QsNfKYMkbOwAB/B2O3t9P9yzK8d5ANukJAyMEd3EKFmfppuNix5mAX4d0pk9q/i4NsjzajTBlZS1LYnZc1zHv444cQOzrK0xSJtT+5dN7+P7LlHa19M81o/SuwLHPQwz5ZX1CIisGyEREAREQBERAEREAREQBERAbVsftvqxtW0rbnW/1Qimu9Nz9OYeda+ESNdJvNwcsDA4uzw3Qc8MrpSqTciLTEl22qT6ieyUU1ipHPD2SNA5+YGNjXNPEgsMx4dBYMnqN2VZpXDJq6GOIN9QiIpS6EREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREBAHLS0B64NDxawt1Nv3KxZ8I5tmXy0bj42cNLnc27DxkhrWmU9apWup1ZTU1bRzUdZTxVNNPG6KaGVgeyRjhhzXNPAggkEHpXPvlFbN5dm+v5aSnbvWW4b9VbHtY/dZGXHMBc7O8+PgD4xJaWOOC7Ar3R8zN1tOHvRGqIihM8IiIAiIgCIiAIiIAiIgCyOmajwa/0Uu5v/bQ3Gce28X+9Y5f1jnMe17HFrmnIIOCD2rmSysHFtasrlB+aaJ0YctBX9WO07Xx3G1QVTOG+3xhxOCOBGevisisOSaeGfkdtcqpuElxR67VOIK1jnHDXeK7zH/5wtkWoLNWu5BzRDUvAcB4r3Hp8/evUzM1lDl9uJlURF6ZoWMv84bTtgB8Z5yR3D/5+heutq4qWMl5BfjxWA8T/APHetdqZ5KiUyynJPyAdgXjZc0lDlLe+SPkiL+OOGkrk1TRtqdR9qpKXc9s8yb2ewYxj4y0NZ3XNwFffZBG5xig+1gZOMg8Tg9HHh6Fgls0R21pH6h2Pp3Ro4Ra48/xCIimNMIiIAiIgCIiAIiIAiIgCIpv5JWy2PW+rH6hvVLFPp+zSDnIJ4XOZWTlpLYweDSGeK94JPSxpaQ8kexWXhHdcHOSiix/Je0B6xNmFL4bTc1ertitr99m7JHvD7XCcta4bjMZa7O690mDgqVURXEsLBuwioRUUERF6dBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAFqu1fRFu2h6HrdM3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bhpqra4uS8kfR6fsXQ63SUTvrTeyPHivJdGsmoaF2eae0k7wijifU1xGDVVBBeB1hoHBo83HvW3oitQhGCxFYRuabS06WtV0xUYryQREXROEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBYLVGkNO6nlglvlu8LfTtLYjz0jN0HGfauGegdKzqLmUVJYkskV1Nd8HC2Kkn5NZX1NYsGgNI2G6R3O02nwerjDgyTwmV+ARg8HOI6D2LZ0RIwjBYisHlGnp08dtMFFdEkvyCIi6Jj8ysbLE+J4yx7S1w7QVpXsT6A/kD+uT/trd0XE64T8SyVtRo9Pqcd9WpY5ZSf5njstsobNa4LZbYOYpIARHHvudugkk8XEk8SetexEXSSSwieEIwioxWEgiIvToIiIAiIgCIiA//9k=" alt="Verdify" style={{height:"36px",width:"auto",objectFit:"contain",flexShrink:0}}/>
      <div className="header-text">
        <h1>ZonneDak Analyzer</h1>
        <p>GRB Gebouwcontouren · DHM Vlaanderen II LiDAR · AlphaESS G3</p>
      </div>
      <div className="badge">GRB · DHMV II</div>
    </header>
    <div className="tabs">{TABS.map(t=><button key={t.k} className={`tab ${activeTab===t.k?"active":""}`} onClick={()=>setActiveTab(t.k)}>{t.l}</button>)}</div>
    <div className="main">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Locatie */}
        <div>
          <div className="sl">Locatie</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <div className="sugg-wrap">
                {/* FIX dubbel klikken: mouseDown stopt blur, click selecteert */}
              <input className="inp" placeholder="Adres in Vlaanderen..." value={query}
                onChange={e=>{setQuery(e.target.value);setShowSuggs(true);}}
                onFocus={()=>setSuggs(s=>s)}
                onBlur={()=>{if(!selectingRef.current)setShowSuggs(false);selectingRef.current=false;}}/>
              {showSuggs&&suggs.length>0&&<div className="sugg">
                {suggs.map((s,i)=><div key={i} className="sugg-item"
                  onMouseDown={e=>{e.preventDefault();selectingRef.current=true;}}
                  onClick={()=>{selectingRef.current=false;selectAddr(s);}}>
                  {s.display_name}
                </div>)}
              </div>}
            </div>
            {coords&&<div className="coord-row"><div><span>LAT </span>{coords.lat.toFixed(5)}</div><div><span>LNG </span>{coords.lng.toFixed(5)}</div></div>}
            {grbStatus==="loading"&&<div className="info-box" style={{display:"flex",alignItems:"center",gap:7}}><div className="spinner"/>GRB gebouwcontour laden...</div>}
            {grbStatus==="ok"&&<div className="info-box grb-ok"><strong>✅ GRB contour geladen</strong> · {detectedArea} m²</div>}
            {grbStatus==="fallback"&&<div className="info-box warn"><strong>⚠️ GRB niet beschikbaar</strong> · Schatting gebruikt</div>}
          </div>
        </div>

        {/* DHM */}
        {dhmStatus!=="idle"&&<div>
          <div className="sl">LiDAR Analyse</div>
          {dhmStatus==="loading"&&<div className="info-box" style={{flexDirection:"column",gap:4}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}><div className="spinner cyan"/>WCS + TIFF parser + Horn's methode...</div>
            <div className="dhm-bar"><div className="dhm-bar-fill"/></div>
          </div>}
          {dhmStatus==="ok"&&detectedFaces&&<div>
            <div className="info-box dhm-ok" style={{marginBottom:5}}><strong>✅ {detectedFaces.length} dakvlak(ken) gedetecteerd via LiDAR</strong></div>
            <div className="face-grid">
              {detectedFaces.map((f,i)=>{const q=ZONE_Q[f.orientation]||ZONE_Q.Z;const isGood=BEST_SOUTH[f.orientation]!==false;const qC=isGood?q[0]:q[1];return(
                <button key={i} className={`face-btn ${selFaceIdx===i?"active":""}`} onClick={()=>selectFace(i,detectedFaces)}>
                  <span className="fb-main">{f.orientation} · {f.slope}°</span>
                  <span className="fb-sub">{f.pct}% · {f.avgH}m hoogte</span>
                  <span style={{fontSize:7,color:selFaceIdx===i?"var(--alpha)":qC.c,display:"block",marginTop:2}}>{qC.l}</span>
                </button>
              );})}
            </div>
          </div>}
          {dhmStatus==="error"&&<div className="info-box err">
            <strong>⚠️ LiDAR niet beschikbaar</strong><br/>
            <span style={{fontSize:7,wordBreak:"break-all",color:"var(--muted)"}}>{dhmError}</span><br/>
            Stel helling &amp; richting handmatig in hieronder.
          </div>}
        </div>}

        <div className="divider"/>

        {/* Dakparameters */}
        <div>
          <div className="sl">Dakparameters</div>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            {grbStatus==="ok"
              ?<div style={{padding:"6px 10px",background:"var(--green-bg)",border:"1px solid var(--green-border)",borderRadius:5,fontSize:8,color:"var(--muted)"}}>Oppervlak: <strong style={{color:"var(--green)"}}>{detectedArea} m²</strong> (GRB gemeten)</div>
              :<div className="sl-item"><label>Dakoppervlak <span>{effectiveArea} m²</span></label><input type="range" min="20" max="300" value={effectiveArea} onChange={e=>setDetectedArea(+e.target.value)}/></div>
            }
            <div className="sl-item">
              <label>Hellingshoek <span style={{color:dhmStatus==="ok"?"var(--alpha)":"var(--amber)"}}>{slope}° {dhmStatus==="ok"?"· LiDAR":""}</span></label>
              <input type="range" min="5" max="90" value={slope} onChange={e=>setSlope(+e.target.value)}/>
            </div>
          </div>
        </div>
        <div>
          <div className="sl">Oriëntatie</div>
          <div className="orient-grid">
            {["N","NO","O","ZO","Z","ZW","W","NW"].map(o=>(
              <button key={o} className={`orient-btn ${orientation===o?"active":""} ${dhmHits.has(o)&&orientation!==o?"dhm-hit":""}`} onClick={()=>setOrientation(o)}>
                {o}{dhmHits.has(o)&&<span className="dhm-dot"/>}
              </button>
            ))}
          </div>
          {coords&&<div style={{display:"flex",gap:5,marginTop:6}}>
            <div style={{flex:1,padding:"5px 8px",background:zq[0].c+"22",border:`1px solid ${zq[0].c}55`,borderRadius:4,fontSize:7,color:zq[0].c}}>Z: {zq[0].l}</div>
            <div style={{flex:1,padding:"5px 8px",background:zq[1].c+"22",border:`1px solid ${zq[1].c}55`,borderRadius:4,fontSize:7,color:zq[1].c}}>N: {zq[1].l}</div>
          </div>}
        </div>

        <div className="divider"/>

        {/* Geselecteerd paneel */}
        <div>
          <div className="sl">Geselecteerd paneel</div>
          <div className="card selected" style={{cursor:"default"}}>
            <div className="card-name">{selPanel?.model}</div><div className="card-brand">{selPanel?.brand}</div>
            <div className="chips"><span className="chip gold">{selPanel?.watt}W</span><span className="chip">{selPanel?.eff}% eff</span><span className="chip">€{selPanel?.price}/st</span></div>
          </div>
          <button className="btn sec full" style={{marginTop:6}} onClick={()=>setActiveTab("panelen")}>Paneel wijzigen →</button>
        </div>

        {/* Omvormer */}
        <div>
          <div className="sl">AlphaESS Omvormer</div>
          {selInv?<div className="inv-card selected" style={{cursor:"default"}}>
            <div className="alpha-badge">⚡ G3</div>
            <div className="card-name">{selInv.model}</div>
            <div className="chips"><span className="chip alpha-c">{selInv.kw}kW</span><span className="chip">€{selInv.price.toLocaleString()}</span></div>
          </div>:<div className="info-box" style={{fontSize:8}}>Geen omvormer · forfait €1.200</div>}
          <button className="btn alpha full" style={{marginTop:6}} onClick={()=>setActiveTab("omvormers")}>{selInv?"Omvormer wijzigen →":"AlphaESS kiezen →"}</button>
        </div>

        {/* Aantal */}
        <div>
          <div className="sl">Aantal panelen</div>
          <div className="pce">
            <div className="pce-top"><span className="pce-title">Klant keuze</span><span className="pce-reset" onClick={()=>setCustomCount(null)}>{customCount!==null?`↩ Reset (max: ${autoPanels})`:`Auto: ${autoPanels}`}</span></div>
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
        <button className="btn full" onClick={calculate} disabled={!coords||aiLoading||!buildingCoords||isLoading}>
          {aiLoading?<><div className="spinner"/>Analyseren...</>:dhmStatus==="loading"?<><div className="spinner cyan"/>LiDAR verwerken...</>:grbStatus==="loading"?<><div className="spinner"/>Laden...</>:"☀️ Bereken & toon panelen op dak"}
        </button>
        <div className="info-box">
          <strong>📡 Databronnen</strong><br/>GRB · GRB Gebouwcontouren · 1m<br/>DHM WCS · DSM+DTM · Horn's methode<br/>Lambert72 · Helmert 7-parameter<br/>© Agentschap Digitaal Vlaanderen
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="content-area">

        {/* CONFIGURATIE = kaart */}
        {activeTab==="configuratie"&&<div className="map-area">
          <div id="leaflet-map" style={{height:"100%"}}/>
          {/* Laagkiezer */}
          <div className="map-btns">
            <button className={`map-btn ${activeLayer==="luchtfoto"?"active":""}`} onClick={()=>setActiveLayer("luchtfoto")}>🛰️ Luchtfoto</button>
            <button className={`map-btn ${activeLayer==="kaart"?"active":""}`} onClick={()=>setActiveLayer("kaart")}>🗺️ Kaart</button>
            <button className={`map-btn ${activeLayer==="dsm"?"active":""}`} onClick={()=>setActiveLayer("dsm")}>📡 DSM Hoogte</button>
            {rawPoints.length>0&&<button className={`map-btn ${showPoints?"active":""}`} onClick={()=>setShowPoints(s=>!s)}>
              🔵 LiDAR punten ({rawPoints.length})
            </button>}
          </div>
          {/* Status pill */}
          {coords&&<div className="status-pill">
            {grbStatus==="ok"&&<span style={{color:"var(--green)"}}>GRB ✅</span>}
            {grbStatus==="fallback"&&<span style={{color:"#92400e"}}>GRB ⚠️</span>}
            {dhmStatus==="ok"&&<><span style={{color:"var(--alpha)"}}>LiDAR ✅</span><span style={{color:"var(--muted)"}}>{detectedFaces?.length||0} vlakken</span></>}
            {dhmStatus==="loading"&&<><div className="spinner cyan"/><span style={{color:"var(--alpha)"}}>LiDAR...</span></>}
            {dhmStatus==="error"&&<span style={{color:"var(--red)"}}>LiDAR ⚠️</span>}
            {grbStatus==="ok"&&<span style={{color:"var(--muted)"}}>{detectedArea} m²</span>}
          </div>}
          {/* Legende met klikbare genummerde vlakken */}
          {coords&&<div className="map-legend" style={{maxWidth:185}}>
            <div className="legend-title">Dakpotentieel</div>
            {dhmStatus==="ok"&&detectedFaces?.length>0?(
              <>
                <div style={{fontSize:7,color:"var(--muted)",marginBottom:5}}>Klik op nummer om vlak te selecteren:</div>
                {detectedFaces.map((f,i)=>{
                  const q=ZONE_Q[f.orientation]||ZONE_Q.Z;
                  const isGood=BEST_SOUTH[f.orientation]!==false;
                  const c=isGood?q[0].c:q[1].c;
                  const lbl=isGood?q[0].l:q[1].l;
                  return <div key={i} className="legend-row" style={{cursor:"pointer",padding:"2px 3px",borderRadius:4,background:i===selFaceIdx?"rgba(0,0,0,.05)":"transparent"}}
                    onClick={()=>{setSelFaceIdx(i);setOrientation(f.orientation);setSlope(f.slope);}}>
                    <div style={{width:20,height:20,background:c,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0,border:i===selFaceIdx?"2px solid #1e293b":"2px solid transparent"}}>{i+1}</div>
                    <div>
                      <div style={{fontSize:8,fontWeight:i===selFaceIdx?700:500,color:"var(--text)"}}>{f.orientation} · {f.slope}° · {f.pct}%</div>
                      <div style={{fontSize:7,color:c}}>{lbl}</div>
                    </div>
                  </div>;
                })}
              </>
            ):(
              <>
                <div className="legend-row"><div className="legend-dot" style={{background:"#16a34a"}}/>Optimaal (Z/ZO/ZW)</div>
                <div className="legend-row"><div className="legend-dot" style={{background:"#d97706"}}/>Goed (O/W)</div>
                <div className="legend-row"><div className="legend-dot" style={{background:"#dc2626"}}/>Minder geschikt (N)</div>
              </>
            )}
            <div className="legend-row" style={{marginTop:3}}><div className="legend-dot" style={{background:"#2563eb"}}/>Geplaatste panelen</div>
          </div>}
        </div>}

        {/* KLANT TAB */}
        {activeTab==="klant"&&<div className="section">
          <CustomerPanel customer={customer} setCustomer={setCustomer} tlToken={tlToken} setTlToken={setTlToken}/>
          <div className="info-box alpha-info">
            <strong>ℹ️ Teamleader integratie</strong><br/>
            Voer uw Teamleader Access Token in (te vinden in Teamleader → Marktplaats → API → Access Token).
            Zoek op klantnaam om adres en e-mail automatisch in te vullen.
          </div>
        </div>}

        {/* PANELEN TAB */}
        {activeTab==="panelen"&&<div className="section">
          <div className="sl">Panelenlijst</div>
          <div className="info-box" style={{fontSize:8}}><strong>⭐ Standaard:</strong> Qcells 440W en Trina 500W zijn uw meest gebruikte panelen.</div>
          <div className="list">{panels.map(p=><PanelCard key={p.id} p={p} selected={p.id===selPanelId} onSelect={id=>{setSelPanelId(id);setCustomCount(null);}} onDelete={id=>setPanels(ps=>ps.filter(x=>x.id!==id))} canDelete={panels.length>1}/>)}</div>
          <NewPanelForm onAdd={p=>setPanels(ps=>[...ps,p])}/>
        </div>}

        {/* OMVORMERS TAB */}
        {activeTab==="omvormers"&&<div className="section">
          <div className="sl">AlphaESS SMILE-G3</div>
          <div className="info-box alpha-info"><strong>🔆 AlphaESS SMILE-G3</strong> · LiFePO4 · 10j · IP65 · 97%+ eff. · Fluvius · Jabba · AlphaCloud</div>
          <div className="filter-row">{["alle","1-fase","3-fase"].map(f=><button key={f} className={`filter-btn af ${invFilter===f?"active":""}`} onClick={()=>setInvFilter(f)}>{f}</button>)}</div>
          {selInv&&<div style={{display:"flex",justifyContent:"flex-end"}}><button className="btn sec sm" onClick={()=>setSelInvId(null)}>✕ Verwijder keuze</button></div>}
          <div className="list">{filteredInv.map(inv=><InverterCard key={inv.id} inv={inv} selected={inv.id===selInvId} onSelect={setSelInvId}/>)}</div>
        </div>}

        {/* BATTERIJ TAB */}
        {activeTab==="batterij"&&<div className="section">
          <div className="sl">Thuisbatterijen</div>
          <div className="toggle-row"><span className="toggle-lbl" style={{fontSize:10}}>Batterij opnemen in berekening</span><label className="toggle"><input type="checkbox" checked={battEnabled} onChange={e=>setBattEnabled(e.target.checked)}/><span className="tslider"/></label></div>
          <div className="info-box alpha-info"><strong>🔋 AlphaESS G3</strong> · LiFePO4 · 1C · 10.000 cycli · 95% DoD · 10j</div>
          <div className="filter-row">{[["alle","Alle"],["alpha","AlphaESS G3"],["overig","Andere"]].map(([k,l])=><button key={k} className={`filter-btn ${battFilter===k?"active":""}`} onClick={()=>setBattFilter(k)}>{l}</button>)}</div>
          <div className="list">{filteredBatt.map(b=><BattCard key={b.id} b={b} selected={b.id===selBattId} onSelect={setSelBattId} onDelete={id=>setBatteries(bs=>bs.filter(x=>x.id!==id))} canDelete={DEFAULT_BATTERIES.findIndex(d=>d.id===b.id)===-1}/>)}</div>
          <NewBattForm onAdd={b=>setBatteries(bs=>[...bs,b])}/>
        </div>}

        {/* RESULTATEN TAB */}
        {activeTab==="resultaten"&&(results?(
          <div className="results-wrap">
            {/* Badges */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {results.grbOk&&<div style={{padding:"4px 9px",background:"var(--green-bg)",border:"1px solid var(--green-border)",borderRadius:12,fontSize:8,color:"var(--green)",fontWeight:500}}>✅ GRB dakcontour · {results.detectedArea} m²</div>}
              {results.dhmOk&&<div style={{padding:"4px 9px",background:"var(--alpha-bg)",border:"1px solid var(--alpha-border)",borderRadius:12,fontSize:8,color:"var(--alpha)",fontWeight:500}}>✅ LiDAR · {results.orientation} {results.slope}°</div>}
              {customer.name&&<div style={{padding:"4px 9px",background:"var(--amber-light)",border:"1px solid #fde68a",borderRadius:12,fontSize:8,color:"var(--amber)",fontWeight:500}}>👤 {customer.name}</div>}
            </div>

            {/* Kaart notitie */}
            <div style={{padding:"7px 11px",background:"var(--blue-bg)",border:"1px solid var(--blue-border)",borderRadius:6,fontSize:9,color:"var(--blue)"}}>
              🗺️ <strong>Configuratie tab</strong> — {results.panelCount} panelen zichtbaar op het dak. +/− past het aantal live aan.
            </div>

            {/* Systeemoverzicht */}
            <div><div className="sl" style={{marginBottom:8}}>Systeemoverzicht</div>
              <div className="results-grid">
                <div className="rc"><div className="rc-label">Paneel</div><div className="rc-num" style={{fontSize:12,lineHeight:1.3}}>{results.panel.model}</div><div className="rc-unit">{results.panel.brand} · {results.panel.watt}W</div></div>
                {results.inv&&<div className="rc alpha-rc"><div className="rc-label">AlphaESS</div><div className="rc-num" style={{fontSize:12,lineHeight:1.3}}>{results.inv.model}</div><div className="rc-unit">{results.inv.fase} · {results.inv.kw}kW</div></div>}
                <div className="rc"><div className="rc-label">Installatie</div><div className="rc-num">{results.panelCount}</div><div className="rc-unit">panelen · {results.actualArea} m² · {((results.panelCount*results.panel.watt)/1000).toFixed(1)} kWp</div></div>
                <div className="rc green"><div className="rc-label">Jaarlijkse opbrengst</div><div className="rc-num">{results.annualKwh.toLocaleString()}</div><div className="rc-unit">kWh / jaar</div></div>
                <div className="rc"><div className="rc-label">Irradiantie</div><div className="rc-num">{results.irr}</div><div className="rc-unit">kWh/m²/j · {results.orientation} {results.slope}°</div></div>
                <div className="rc"><div className="rc-label">CO₂ besparing</div><div className="rc-num">{results.co2}</div><div className="rc-unit">kg / jaar</div></div>
                <div className="rc"><div className="rc-label">Dekkingsgraad</div><div className="rc-num">{results.coverage}%</div><div className="rc-unit">van gemiddeld verbruik</div></div>
              </div>
            </div>

            {/* Maandelijkse grafiek */}
            <MonthlyChart annualKwh={results.annualKwh}/>

            {/* Terugverdientijd */}
            <div><div className="sl" style={{marginBottom:8}}>Terugverdientijd</div>
              <div className="compare-grid">
                <div className="compare-col">
                  <h4>🔆 Alleen zonnepanelen</h4>
                  <div className="crow">Panelen ({results.panelCount}×)<span>€{(results.panelCount*results.panel.price).toLocaleString()}</span></div>
                  {results.inv?<div className="crow">{results.inv.model}<span>€{results.inv.price.toLocaleString()}</span></div>:<div className="crow">Installatie forfait<span>€1.200</span></div>}
                  <div className="crow">Zelfverbruik<span>~30%</span></div>
                  <div className="crow">Besparing/jaar<span>€{results.annualBase}</span></div>
                  <div className="ctotal"><span>Investering</span><span style={{fontSize:12}}>€{results.investPanels.toLocaleString()}</span></div>
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
                    <div className="ctotal"><span>Investering</span><span style={{fontSize:12}}>€{results.battResult.totInv.toLocaleString()}</span></div>
                    <div className="ctotal"><span>Terugverdientijd</span><div className="cval">{results.battResult.payback} jaar</div></div>
                    <div className="pbar"><div className="pfill" style={{width:`${Math.min(100,(results.battResult.payback/25)*100)}%`,background:"linear-gradient(90deg,var(--blue),var(--alpha))"}}/></div>
                  </div>
                ):(
                  <div className="compare-col" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,opacity:.6}}>
                    <div style={{fontSize:28}}>🔋</div>
                    <div style={{fontSize:9,textAlign:"center",color:"var(--muted)"}}>Activeer batterij in de Batterij tab</div>
                    <button className="btn blue sm" onClick={()=>setActiveTab("batterij")}>Batterij instellen</button>
                  </div>
                )}
              </div>
            </div>

            {/* AI Advies */}
            <div><div className="sl" style={{marginBottom:7}}>AI Expert Advies</div>
              {aiLoading?<div className="ai-box loading"><div className="spinner"/>Claude analyseert uw installatie...</div>:<div className="ai-box">{aiText}</div>}
            </div>

            {/* PDF sectie */}
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:14,boxShadow:"var(--shadow)"}}>
              <div className="sl" style={{marginBottom:8}}>PDF Rapport genereren</div>
              {!customer.name&&<div className="info-box warn" style={{marginBottom:8}}><strong>⚠️</strong> Voeg klantnaam toe in de "Klant" tab voor het rapport.</div>}
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
                <button className="btn green" onClick={handlePDF} disabled={pdfLoading||!results}>
                  {pdfLoading?<><div className="spinner"/>PDF genereren + datasheets samenvoegen...</>:"📄 Download PDF rapport"}
                </button>
              </div>
              <div style={{fontSize:8,color:"var(--muted)",lineHeight:1.7}}>
                <strong>Rapport bevat:</strong> klantgegevens · systeemoverzicht · maandgrafiek · terugverdienberekening<br/>
                <strong style={{color:"var(--green)"}}>+ Datasheets bijgevoegd:</strong>{" "}
                {results?.panel?.datasheet
                  ?<span style={{color:"var(--green)"}}>✅ {results.panel.brand} {results.panel.watt}W</span>
                  :<span style={{color:"var(--muted2)"}}>— paneel (geen datasheet beschikbaar)</span>}
                {" · "}
                {results?.inv?.datasheet
                  ?<span style={{color:"var(--green)"}}>✅ AlphaESS SMILE-G3</span>
                  :<span style={{color:"var(--muted2)"}}>— omvormer (geen datasheet)</span>}
              </div>
            </div>
          </div>
        ):(
          <div className="empty-state">
            <div className="icon">☀️</div>
            <p>Voer een adres in, configureer uw installatie, en klik op "Bereken" voor een volledig rapport met PDF-export.</p>
          </div>
        ))}
      </div>
    </div>
  </div>
  </>);
}

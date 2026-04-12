import { useState, useEffect, useRef, useCallback, Component } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
//  ZonneDak Analyzer — App.jsx  (GECORRIGEERDE VERSIE)
//  Meetkundige fixes t.o.v. origineel:
//
//  FIX BUG-01 · polyAreaM2 → polyAreaLambert72
//    Shoelace-formule nu in EPSG:31370 Lambert72 (meter), niet in WGS84 graden.
//    wgs84ToLambert72() was al aanwezig maar werd niet gebruikt voor meting.
//    Impact: oppervlaktes waren 3–8% fout. Nu metrisch correct.
//
//  FIX BUG-02 · computeRoofFaces: confidence score per vlak
//    Elke gedetecteerde richting krijgt nu een confidence score (0–1) op basis
//    van hellingsconsistentie (slopeStd) en aandeel dakpixels.
//
//  FIX BUG-03 · 3D schuine dakoppervlakte (compute3dArea)
//    Formule: A_3d = A_2d / cos(slope°). Was volledig afwezig.
//    Voorbeeld: 100m² footprint + 35° helling → 122.1m² schuine opp.
//    Zowel 2D als 3D oppervlakte worden nu getoond in sidebar, resultaten en PDF.
//
//  FIX BUG-04 · computeRoofFaces: clip op gebouwcontour
//    Rasterpixels worden nu gefilterd op de gebouwcontour (omgezet naar
//    rastercoördinaten). Buurgebouwen en vegetatie worden uitgesloten.
//
//  FIX BUG-05 · packPanels: paneelinpassing in Lambert72 meter
//    Panelen worden nu geplaatst in metrische coördinaten, niet in WGS84 graden.
//
//  FIX BUG-06 · autoPanels: gebruik 3D schuine oppervlakte + vlak-aandeel
//    Paneeltelling houdt nu rekening met hellingshoek en percentage van het
//    geselecteerde dakvlak. Factor 0.85 voor randen/obstakels.
//
//  CRS regel: ALLE metingen in EPSG:31370 (Lambert72 Belgian).
//             WGS84 enkel voor display op Leaflet kaart.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Endpoints ──────────────────────────────────────────────────────────────
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const GRB_WFS   = "https://geo.api.vlaanderen.be/GRB/wfs";
const DHM_WMS   = "https://geoservices.informatievlaanderen.be/raadpleegdiensten/DHMVII/wms";
// Digitaal Vlaanderen orthofoto — dekt heel Vlaanderen (beter dan Esri voor BE)
const ORTHO_WMS = "https://geoservices.informatievlaanderen.be/raadpleegdiensten/OMWRGBMRVL/wms";
const ORTHO_LYR = "OMWRGBMRVL";
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

// ─── Inline Lambert72 (geen externe lib) ─────────────────────────────────────
function wgs84ToLambert72(latDeg,lngDeg){
  const r=d=>d*Math.PI/180, lat=r(latDeg), lng=r(lngDeg);
  const aW=6378137,fW=1/298.257223563,e2W=2*fW-fW*fW;
  const NW=aW/Math.sqrt(1-e2W*Math.sin(lat)**2);
  const X=NW*Math.cos(lat)*Math.cos(lng),Y=NW*Math.cos(lat)*Math.sin(lng),Z=NW*(1-e2W)*Math.sin(lat);
  const tx=-106.869,ty=52.2978,tz=-103.724;
  const rx=r(0.3366/3600),ry=r(-0.457/3600),rz=r(1.8422/3600),s=1-1.2747e-6;
  const Xb=s*(X+rz*Y-ry*Z)+tx,Yb=s*(-rz*X+Y+rx*Z)+ty,Zb=s*(ry*X-rx*Y+Z)+tz;
  const aI=6378388,fI=1/297,e2I=2*fI-fI*fI,eI=Math.sqrt(e2I);
  const p=Math.sqrt(Xb*Xb+Yb*Yb);
  const lng72=Math.atan2(Yb,Xb);
  let lat72=Math.atan2(Zb,p*(1-e2I));
  for(let i=0;i<10;i++){const N=aI/Math.sqrt(1-e2I*Math.sin(lat72)**2);lat72=Math.atan2(Zb+e2I*N*Math.sin(lat72),p);}
  const phi1=r(49.8333333),phi2=r(51.1666667),lam0=r(4.3674867),FE=150000.013,FN=5400088.438;
  const m_=ph=>Math.cos(ph)/Math.sqrt(1-e2I*Math.sin(ph)**2);
  const t_=ph=>Math.tan(Math.PI/4-ph/2)*Math.pow((1+eI*Math.sin(ph))/(1-eI*Math.sin(ph)),eI/2);
  const [m1,m2,t1,t2]=[m_(phi1),m_(phi2),t_(phi1),t_(phi2)];
  const n=(Math.log(m1)-Math.log(m2))/(Math.log(t1)-Math.log(t2));
  const F=m1/(n*Math.pow(t1,n)),rho=aI*F*Math.pow(t_(lat72),n),theta=n*(lng72-lam0);
  return [FE+rho*Math.sin(theta),FN-rho*Math.cos(theta)];
}

// ─── Inline TIFF parser (Float32) ────────────────────────────────────────────
function parseTIFF(buf){
  if(buf.byteLength<8) throw new Error("Buffer te klein");
  const dv=new DataView(buf),bo=dv.getUint8(0)===0x49;
  const u16=o=>dv.getUint16(o,bo),u32=o=>dv.getUint32(o,bo);
  const f32=o=>dv.getFloat32(o,bo),i16=o=>dv.getInt16(o,bo);
  if((u16(0)!==0x4949&&u16(0)!==0x4D4D)||u16(2)!==42) throw new Error("Geen TIFF");
  let ifo=u32(4);const nT=u16(ifo);ifo+=2;
  let W=0,H=0,bps=32,sfmt=3,soffs=[],sbytes=[],toffs=[],tbytes=[],tw=0,th=0;
  const getV=(type,cnt,vp)=>{
    const sz={1:1,2:1,3:2,4:4}[type]||4;
    if(cnt*sz<=4){return type===3?Array.from({length:cnt},(_,i)=>u16(vp+i*2)):Array.from({length:cnt},(_,i)=>u32(vp+i*4));}
    const off=u32(vp);return type===3?Array.from({length:cnt},(_,i)=>u16(off+i*2)):Array.from({length:cnt},(_,i)=>u32(off+i*4));
  };
  for(let i=0;i<nT;i++){
    const t=ifo+i*12,tag=u16(t),type=u16(t+2),cnt=u32(t+4),vs=getV(type,cnt,t+8),v0=vs[0];
    if(tag===256)W=v0;if(tag===257)H=v0;if(tag===258)bps=v0;
    if(tag===273)soffs=vs;if(tag===279)sbytes=vs;if(tag===322)tw=v0;if(tag===323)th=v0;
    if(tag===324)toffs=vs;if(tag===325)tbytes=vs;if(tag===339)sfmt=v0;
  }
  if(!W||!H) throw new Error(`TIFF ${W}×${H} ongeldig`);
  const bpS=bps/8,data=new Float32Array(W*H).fill(NaN);
  const rd=o=>sfmt===3&&bps===32?f32(o):sfmt===1&&bps===16?u16(o):sfmt===2&&bps===16?i16(o):f32(o);
  if(toffs.length>0){
    const nTX=Math.ceil(W/tw);
    toffs.forEach((to,ti)=>{const tc=ti%nTX,tr=Math.floor(ti/nTX);for(let r=0;r<th;r++)for(let c=0;c<tw;c++){const px=tc*tw+c,py=tr*th+r;if(px<W&&py<H)data[py*W+px]=rd(to+(r*tw+c)*bpS);}});
  } else {
    let idx=0;soffs.forEach((so,si)=>{const ns=Math.round(sbytes[si]/bpS);for(let j=0;j<ns&&idx<W*H;j++)data[idx++]=rd(so+j*bpS);});
  }
  return {data,w:W,h:H};
}

async function fetchWCS(xmin,ymin,xmax,ymax,mw,mh,cov){
  const p=new URLSearchParams({SERVICE:"WCS",VERSION:"1.0.0",REQUEST:"GetCoverage",COVERAGE:cov,CRS:"EPSG:31370",RESPONSE_CRS:"EPSG:31370",BBOX:`${Math.round(xmin)},${Math.round(ymin)},${Math.round(xmax)},${Math.round(ymax)}`,WIDTH:mw,HEIGHT:mh,FORMAT:"GeoTIFF"});
  let lastErr="";
  for(const url of WCS_URLS){
    try{
      const r=await fetch(`${url}?${p}`,{mode:"cors"});
      if(!r.ok){lastErr=`HTTP ${r.status}`;continue;}
      const ct=r.headers.get("content-type")||"";
      if(ct.includes("xml")||ct.includes("html")){lastErr=`WCS fout: ${(await r.text()).substring(0,100)}`;continue;}
      return parseTIFF(await r.arrayBuffer());
    }catch(e){lastErr=e.message;}
  }
  throw new Error(lastErr||"Alle WCS endpoints mislukt");
}

// ─── Hulpfuncties voor dakanalyse ────────────────────────────────────────────

// 3×3 box-filter op DSM (vermindert ruis voor aspectbepaling)
// PCA op gebouwpolygoon → kortste as = breedte dwars op de nok
function buildingWidthFromPolygon(lamPts){
  if(lamPts.length<3) return 10; // fallback
  const cx=lamPts.reduce((s,p)=>s+p[0],0)/lamPts.length;
  const cy=lamPts.reduce((s,p)=>s+p[1],0)/lamPts.length;
  let cxx=0,cxy=0,cyy=0;
  lamPts.forEach(([x,y])=>{const dx=x-cx,dy=y-cy;cxx+=dx*dx;cxy+=dx*dy;cyy+=dy*dy;});
  cxx/=lamPts.length;cxy/=lamPts.length;cyy/=lamPts.length;
  // Principale assen via eigenvectoren 2×2 matrix
  const ang=Math.atan2(2*cxy,cxx-cyy)/2;
  // Projecteer alle punten op beide assen en neem de breedte van de kortste as
  const proj1=lamPts.map(([x,y])=>(x-cx)*Math.cos(ang)+(y-cy)*Math.sin(ang));
  const proj2=lamPts.map(([x,y])=>-(x-cx)*Math.sin(ang)+(y-cy)*Math.cos(ang));
  const w1=Math.max(...proj1)-Math.min(...proj1);
  const w2=Math.max(...proj2)-Math.min(...proj2);
  return Math.min(w1,w2); // kortste dimensie = breedte dwars op de nok
}

// ─── Circulaire k-means met exhaustieve initialisatie ────────────────────────
// Lokale minima zijn het hoofdprobleem: als centroids verkeerd starten,
// splitst k-means één helling in twee clusters.
// Oplossing: probeer ALLE 8 startposities (elke 45°) en kies de beste.
// 8 × 30 iteraties = triviaal goedkoop voor <500 punten.
// ─── Circulaire hulpfuncties (niet meer gebruikt voor aspect-clustering) ─────
// ─── computeRoofFaces: GRB-footprint voor aspect, LiDAR voor slope ─────────────
// Kernprincipe: bij zachte hellingen (≤30°) is de DSM-gradiënt te zwak om
// betrouwbaar aspect te bepalen (SNR < 2 bij 15°, DHM-ruis ±15cm).
// Oplossing: gebruik de GEBOUWCONTOUR (GRB) voor aspect, LiDAR enkel voor slope.
//
// Algoritme:
//   1. PCA van GRB-polygoon → langste as = nokrichting
//   2. De twee dakhellingen liggen HAAKS op de nokrichting
//   3. Elk interior-dakpixel wordt toegewezen aan links/rechts van de nokas
//   4. Slope via hoogteprofiel (p10-p90 relH / halve breedte) — stabiel bij elke helling
//
// Dit werkt voor elke helling ≥ 3° en elke gebouworiëntatie.
function computeRoofFaces(dsmD,dtmD,w,h,cellSize,bldRasterPts,buildingWidthM,ridgeAngleDeg){
  // ridgeAngleDeg = hoek van de nok (langste as) in graden t.o.v. Noord (0–180°)
  // De twee dakhellingen zijn haaks: ridgeAngleDeg+90 en ridgeAngleDeg-90

  // Rotatiematrix voor projectie haaks op de nok
  const ridgeRad=ridgeAngleDeg*Math.PI/180;
  const cosR=Math.cos(ridgeRad), sinR=Math.sin(ridgeRad);

  // Stap 1: verzamel alle dakpixels + centroïde berekening
  const dakPts=[]; // {crossComp: meters van nok, relH: hoogte boven DTM}
  let sumCx=0,sumCy=0,cnt=0;
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    if(bldRasterPts&&bldRasterPts.length>=3&&!pointInPoly([x,y],bldRasterPts)) continue;
    const i=y*w+x,relH=dsmD[i]-dtmD[i];
    if(relH<1.5||relH>40||isNaN(dsmD[i])||isNaN(dtmD[i])) continue;
    sumCx+=x;sumCy+=y;cnt++;
  }
  if(cnt<10) return null;
  const cxR=sumCx/cnt,cyR=sumCy/cnt;

  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    if(bldRasterPts&&bldRasterPts.length>=3&&!pointInPoly([x,y],bldRasterPts)) continue;
    const i=y*w+x,relH=dsmD[i]-dtmD[i];
    if(relH<1.5||relH>40||isNaN(dsmD[i])||isNaN(dtmD[i])) continue;
    // Loodrechte afstand tot de nokas in meters
    // crossComp = projectie op de rechts-loodrechte: (cosR, -sinR) in (Oost, Noord)
    const dx=x-cxR, dy=cyR-y; // dy gespiegeld: +dy = Noord (GeoTIFF Y omgekeerd)
    const crossComp=(dx*cosR-dy*sinR)*cellSize; // meter vanaf nok
    dakPts.push({crossComp,relH});
  }
  if(dakPts.length<10) return null;

  // Stap 2: slope via regressie van relH op |crossComp|
  // Zadeldak: relH = nok_hoogte - tan(slope) × |crossComp|
  // => regresseer relH op absComp = -|crossComp|, verwacht negatieve helling = -tan(slope)
  // Dit is onafhankelijk van gebouwbreedte en DTM-fouten onder het gebouw.
  let n=0,sX=0,sY=0,sXX=0,sXY=0;
  dakPts.forEach(({crossComp,relH})=>{
    const absComp=Math.abs(crossComp); // afstand tot nok
    n++;sX+=absComp;sY+=relH;sXX+=absComp*absComp;sXY+=absComp*relH;
  });
  const denom=n*sXX-sX*sX;
  let slope=20; // fallback
  let nokH=0,slopeStdVal=5;
  if(Math.abs(denom)>0.001){
    const beta=(n*sXY-sX*sY)/denom; // d(relH)/d(absComp) — negatief voor zadeldak
    const alpha=(sY-beta*sX)/n;     // intercept = nok hoogte
    nokH=+alpha.toFixed(1);
    // beta negatief: hellingshoek = atan(|beta|)
    slope=Math.max(3,Math.min(60,Math.round(Math.atan(Math.abs(beta))*180/Math.PI)));
    // Residuals voor kwaliteitsindicatie
    const residuals=dakPts.map(p=>(p.relH-(alpha+beta*Math.abs(p.crossComp)))**2);
    const rmse=Math.sqrt(residuals.reduce((a,v)=>a+v,0)/n);
    slopeStdVal=+rmse.toFixed(2);
    console.info(`[ZonneDak] Regressie: beta=${beta.toFixed(3)}m/m → slope=${slope}° nok_relH=${nokH}m RMSE=${rmse.toFixed(2)}m (n=${n})`);
  } else {
    console.warn('[ZonneDak] Regressie: onvoldoende variatie in crossComp, gebruik fallback slope');
  }

  // Stap 3: verdeel pixels links/rechts van nok
  const leftN=dakPts.filter(p=>p.crossComp<0).length;
  const rightN=dakPts.filter(p=>p.crossComp>=0).length;
  const total=leftN+rightN;
  const avgH=+(sY/n).toFixed(1);

  // Aspect van elk vlak: haaks op nokrichting
  const rightAspect=((ridgeAngleDeg+90)%360+360)%360;
  const leftAspect =((ridgeAngleDeg-90)%360+360)%360;

  const faces=[];
  if(rightN>=total*0.08){
    const pct=Math.round(rightN/total*100);
    const dirIdx=Math.round(rightAspect/45)%8;
    const conf=Math.min(1,Math.max(0,
      0.5*(pct/50)+0.3*(slope>=5&&slope<=60?1:0.3)+0.2*(slopeStdVal<0.5?1:slopeStdVal<1?0.7:0.4)));
    faces.push({orientation:DIRS8[dirIdx],slope,avgH,pct,n:rightN,
                slopeStd:slopeStdVal,confidence:+conf.toFixed(2),
                status:"auto",aspectDeg:+rightAspect.toFixed(1)});
  }
  if(leftN>=total*0.08){
    const pct=Math.round(leftN/total*100);
    const dirIdx=Math.round(leftAspect/45)%8;
    const conf=Math.min(1,Math.max(0,
      0.5*(pct/50)+0.3*(slope>=5&&slope<=60?1:0.3)+0.2*(slopeStdVal<0.5?1:slopeStdVal<1?0.7:0.4)));
    faces.push({orientation:DIRS8[dirIdx],slope,avgH,pct,n:leftN,
                slopeStd:slopeStdVal,confidence:+conf.toFixed(2),
                status:"auto",aspectDeg:+leftAspect.toFixed(1)});
  }
  console.info(`[ZonneDak] GRB-aspect: nok=${ridgeAngleDeg.toFixed(1)}° → ${faces.map(f=>`${f.orientation}·${f.slope}°·${f.pct}%`).join(' / ')}`);
  return faces.length>=1?faces.sort((a,b)=>b.n-a.n):null;
}

// ─── analyzeDHM: met diagnostiek, plat-dak-detectie en fallback ──────────────
async function analyzeDHM(bc){
  const lats=bc.map(p=>p[0]),lngs=bc.map(p=>p[1]);
  const swL=wgs84ToLambert72(Math.min(...lats)-.0001,Math.min(...lngs)-.0001);
  const neL=wgs84ToLambert72(Math.max(...lats)+.0001,Math.max(...lngs)+.0001);
  const pad=5,[xmin,ymin,xmax,ymax]=[swL[0]-pad,swL[1]-pad,neL[0]+pad,neL[1]+pad];
  const bboxW=xmax-xmin,bboxH=ymax-ymin;
  const mw=Math.min(120,Math.max(20,Math.round(bboxW)));
  const mh=Math.min(120,Math.max(20,Math.round(bboxH)));

  console.info(`[ZonneDak] DHM bbox ${Math.round(bboxW)}×${Math.round(bboxH)}m, raster ${mw}×${mh}px`);

  const[dsmR,dtmR]=await Promise.all([
    fetchWCS(xmin,ymin,xmax,ymax,mw,mh,"DHMVII_DSM_1m"),
    fetchWCS(xmin,ymin,xmax,ymax,mw,mh,"DHMVII_DTM_1m")
  ]);

  // Gebruik echte rasterafmetingen voor correcte cellSize
  const cell=bboxW/dsmR.w;
  console.info(`[ZonneDak] Raster gekregen ${dsmR.w}×${dsmR.h}px, cel=${cell.toFixed(3)}m/px`);

  // Diagnostiek: hoogtebereik in de bbox
  const validPairs=[];
  for(let i=0;i<dsmR.data.length;i++){
    if(!isNaN(dsmR.data[i])&&!isNaN(dtmR.data[i])) validPairs.push(dsmR.data[i]-dtmR.data[i]);
  }
  const maxRelH=validPairs.length?Math.max(...validPairs):0;
  const avgRelH=validPairs.length?validPairs.reduce((a,v)=>a+v,0)/validPairs.length:0;
  const aboveRoof=validPairs.filter(v=>v>=1.5).length;
  console.info(`[ZonneDak] maxRelH=${maxRelH.toFixed(2)}m avgRelH=${avgRelH.toFixed(2)}m boven1.5m=${aboveRoof}`);

  // Plat dak of WCS-probleem?
  if(aboveRoof===0){
    if(maxRelH>0.3){
      return[{orientation:"Z",slope:3,avgH:+avgRelH.toFixed(1),pct:100,
              n:validPairs.length,slopeStd:1,confidence:0.55,status:"auto",
              isFlatRoof:true,maxRelH:+maxRelH.toFixed(2)}];
    }
    const dsmUniq=new Set(dsmR.data.filter(v=>!isNaN(v)).map(v=>Math.round(v*10))).size;
    if(dsmUniq<5) throw new Error(`WCS geeft constante waarden (${dsmUniq} uniek). Probeer later.`);
    throw new Error(`DSM≈DTM: max hoogteverschil ${maxRelH.toFixed(2)}m. Stel helling manueel in.`);
  }

  // FIX Y-FLIP: GeoTIFF oorsprong is NW-hoek (rij 0 = ymax).
  // Correcte conversie: row = (ymax - ly) / cell  (NIET ly - ymin)
  const bldRasterPts=bc.map(([lat,lng])=>{
    const[lx,ly]=wgs84ToLambert72(lat,lng);
    return[(lx-xmin)/cell,(ymax-ly)/cell]; // ← Y-flip gecorrigeerd
  });

  // GRB-polygoon → gebouwbreedte + nokrichting via PCA
  const lamPts=bc.map(([lat,lng])=>wgs84ToLambert72(lat,lng));
  const buildingWidthM=buildingWidthFromPolygon(lamPts);

  // Nokrichting = langste as van de gebouwcontour (PCA)
  // In Lambert72: X = Oost, Y = Noord. Hoek t.o.v. Noord (geografisch azimut).
  const cx2=lamPts.reduce((s,p)=>s+p[0],0)/lamPts.length;
  const cy2=lamPts.reduce((s,p)=>s+p[1],0)/lamPts.length;
  let cxx=0,cxy=0,cyy=0;
  lamPts.forEach(([x,y])=>{const dx=x-cx2,dy=y-cy2;cxx+=dx*dx;cxy+=dx*dy;cyy+=dy*dy;});
  cxx/=lamPts.length;cxy/=lamPts.length;cyy/=lamPts.length;
  // Eigenvector van grootste eigenwaarde = langste as (nokrichting)
  // Hoek van deze as t.o.v. de X-as (Oost): atan2(eigvec_y, eigvec_x)
  const pcaAng=Math.atan2(2*cxy,cxx-cyy)/2; // hoek t.o.v. Oost in radialen
  // Geografisch azimut (t.o.v. Noord, met de klok mee): 90° - hoek_tov_Oost
  const ridgeAngleDeg=((90-pcaAng*180/Math.PI)+360)%180; // 0–180° (nok is bidirectioneel)
  console.info(`[ZonneDak] PCA: gebouwbreedte=${buildingWidthM.toFixed(1)}m nokrichting=${ridgeAngleDeg.toFixed(1)}°`);

  const faces=computeRoofFaces(dsmR.data,dtmR.data,dsmR.w,dsmR.h,cell,bldRasterPts,buildingWidthM,ridgeAngleDeg);

  if(!faces||faces.length===0){
    const flatFace={orientation:"Z",slope:3,avgH:+avgRelH.toFixed(1),pct:100,n:aboveRoof,
            slopeStd:1,confidence:0.6,status:"auto",isFlatRoof:true,maxRelH:+maxRelH.toFixed(2)};
    return[flatFace]; // polygon wordt later toegevoegd via buildingCoords
  }
  // Sla nokrichting op in elke face zodat polygon-generatie hem later kan gebruiken
  return faces.map(f=>({...f,ridgeAngleDeg}));
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
// ─── FIX BUG-01: Correcte oppervlaktemeting in EPSG:31370 (Lambert72) ─────────
// Originele polyAreaM2 gebruikte Shoelace op WGS84 graden met één schaalfactor
// voor het centrum van het gebouw — dit geeft 3–8% fout.
// Correcte methode: transformeer elk hoekpunt naar Lambert72 (metrisch),
// voer dan Shoelace uit in meters. wgs84ToLambert72 staat al in dit bestand.
function polyAreaLambert72(lc){
  // lc = array van [lat, lng] (Leaflet formaat, WGS84)
  // Stap 1: elk punt naar Lambert72 metrische coördinaten
  const pts=lc.map(([lat,lng])=>wgs84ToLambert72(lat,lng));
  // Stap 2: Shoelace in meter (Lambert72 is een geprojecteerd metrisch CRS)
  const n=pts.length;let area=0;
  for(let i=0,j=n-1;i<n;j=i++){
    const[xi,yi]=pts[i],[xj,yj]=pts[j];
    area+=xi*yj-xj*yi;
  }
  return Math.abs(area/2); // Resultaat in m²
}
// Behoud polyAreaM2 als alias voor compatibiliteit — stuurt door naar correcte versie
function polyAreaM2(lc){return polyAreaLambert72(lc);}

// ─── FIX BUG-03: 3D schuine dakoppervlakte ────────────────────────────────────
// Was volledig afwezig. Formule: A_3d = A_2d / cos(slope°)
// Voorbeeld: 100m² footprint, 35° helling → 100/cos(35°) = 122.1m²
function compute3dArea(area2d,slopeDeg){
  if(!slopeDeg||slopeDeg<=0) return area2d;
  return area2d/Math.cos(slopeDeg*Math.PI/180);
}
// Hellingscorrectietabel voor UI display
const SLOPE_FACTOR={0:1.000,10:1.015,15:1.035,20:1.064,25:1.103,30:1.155,35:1.221,40:1.305,45:1.414,50:1.556,55:1.743,60:2.000};
function getSlopeFactor(deg){
  const k=Object.keys(SLOPE_FACTOR).map(Number).reduce((a,b)=>Math.abs(b-deg)<Math.abs(a-deg)?b:a);
  return SLOPE_FACTOR[k];
}
// ─── Paneelinpassing: orient = "portrait" | "landscape" ─────────────────────
// Rotatie: PCA op het face-polygoon zelf — onafhankelijk van ridgeAngleDeg
// De langste as van het polygoon = nokrichting (robuust na vertex-aanpassingen)
// Portrait:  pH (lang) langs de nok, pW (kort) loodrecht
// Landscape: pW (lang) langs de nok, pH (kort) loodrecht
function packPanels(facePoly,pW,pH,maxN,_ridgeAngleDeg,orient){
  if(!facePoly||facePoly.length<3) return [];
  const cLat=facePoly.reduce((s,p)=>s+p[0],0)/facePoly.length;
  const cLng=facePoly.reduce((s,p)=>s+p[1],0)/facePoly.length;
  const mLat=111320,mLng=111320*Math.cos(cLat*Math.PI/180);

  // Lokale meters: x=Oost, y=Noord
  const toM=([lat,lng])=>[(lng-cLng)*mLng,(lat-cLat)*mLat];
  const polyM=facePoly.map(toM);

  // PCA op het polygoon → langste as = nokrichting
  const cxM=polyM.reduce((s,p)=>s+p[0],0)/polyM.length;
  const cyM=polyM.reduce((s,p)=>s+p[1],0)/polyM.length;
  let sxx=0,sxy=0,syy=0;
  polyM.forEach(([x,y])=>{const dx=x-cxM,dy=y-cyM;sxx+=dx*dx;sxy+=dx*dy;syy+=dy*dy;});
  // Hoek van de langste eigenvector t.o.v. X-as (Oost)
  const pcaAng=Math.atan2(2*sxy,sxx-syy)/2; // hoek van langste as in radialen t.o.v. Oost

  // Roteer zodat langste as (nok) langs Y-as ligt
  // Ridge vector in (E,N): [cos(pcaAng), sin(pcaAng)]
  // We willen dit langs +Y → roteer CW met pcaAng (= CCW met -pcaAng)
  const cosA=Math.cos(pcaAng),sinA=Math.sin(pcaAng);
  const rotFwd=([x,y])=>[ x*cosA+y*sinA, -x*sinA+y*cosA]; // CW met pcaAng
  const rotInv=([x,y])=>[ x*cosA-y*sinA,  x*sinA+y*cosA]; // inverse

  const rotPoly=polyM.map(rotFwd);
  const rxs=rotPoly.map(p=>p[0]),rys=rotPoly.map(p=>p[1]);
  const[minRX,maxRX,minRY,maxRY]=[Math.min(...rxs),Math.max(...rxs),Math.min(...rys),Math.max(...rys)];

  // Portrait:  pW langs X (loodrecht op nok), pH langs Y (langs nok)
  // Landscape: pH langs X (loodrecht op nok), pW langs Y (langs nok)
  const isPortrait=(orient||"portrait")==="portrait";
  const W=isPortrait?pW:pH; // afmeting langs X (loodrecht op nok)
  const H=isPortrait?pH:pW; // afmeting langs Y (langs nok)

  const margin=0.3,gapX=0.05,gapY=0.05;
  const panels=[];

  // Stap over X (rijen loodrecht op nok), kolommen langs Y (langs nok)
  for(let rx=minRX+margin;rx+W<=maxRX-margin&&panels.length<maxN;rx+=W+gapX){
    for(let ry=minRY+margin;ry+H<=maxRY-margin&&panels.length<maxN;ry+=H+gapY){
      if(!pointInPoly([rx+W/2,ry+H/2],rotPoly)) continue;
      const corners=[[rx,ry],[rx+W,ry],[rx+W,ry+H],[rx,ry+H]]
        .map(pt=>{const[mx,my]=rotInv(pt);return[cLat+my/mLat,cLng+mx/mLng];});
      // Middellijn langs de paneel-breedte (horizontale lijn op het dak)
      const midLine=[[rx,ry+H/2],[rx+W,ry+H/2]]
        .map(pt=>{const[mx,my]=rotInv(pt);return[cLat+my/mLat,cLng+mx/mLng];});
      panels.push({corners,midLine});
    }
  }
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
    // FIX BUG-01: gebruik polyAreaLambert72 voor correcte metrische selectie
    for(const ring of rings) if(pointInPoly([lng,lat],ring)){const lc=geoToLeaflet(ring);cands.push({f,area:polyAreaLambert72(lc),lc});}
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
.sl{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--amber);margin-bottom:7px;display:flex;align-items:center;gap:8px;font-weight:600;}
.sl::after{content:'';flex:1;height:1px;background:var(--border);}
.inp{width:100%;padding:8px 10px;background:var(--bg3);border:1px solid var(--border-dark);border-radius:6px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:11px;outline:none;transition:all .2s;}
.inp:focus{border-color:var(--amber);box-shadow:0 0 0 3px var(--amber-glow);}
.inp::placeholder{color:var(--muted2);}
.inp-label{font-size:10px;color:var(--muted);margin-bottom:3px;font-weight:500;}
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
.info-box{font-size:10px;color:var(--muted);line-height:1.7;padding:8px 11px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;}
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
.face-btn{padding:8px 11px;background:var(--bg3);border:1px solid var(--border-dark);border-radius:6px;color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:10px;cursor:pointer;transition:all .15s;text-align:left;}
.face-btn:hover{border-color:var(--alpha);color:var(--alpha);}
.face-btn.active{background:var(--alpha-bg);border-color:var(--alpha);color:var(--alpha);}
.face-btn .fb-main{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;display:block;}
.face-btn .fb-sub{font-size:9px;color:var(--muted);margin-top:2px;display:block;}
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

/* Dakvlak editor */
.roof-editor-bar{position:absolute;bottom:60px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(255,255,255,.97);border:1px solid var(--border-dark);border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:8px;box-shadow:var(--shadow-md);font-family:'IBM Plex Mono',monospace;font-size:9px;}
.roof-editor-bar .edit-title{font-weight:600;color:var(--text);}
.vertex-handle{cursor:grab!important;}
.vertex-handle:active{cursor:grabbing!important;}
`;

// ─── Kaartfuncties ─────────────────────────────────────────────────────────
const ASP_MAP={N:0,NO:45,O:90,ZO:135,Z:180,ZW:225,W:270,NW:315};

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

// ─── Dakpolygonen genereren uit GRB-footprint + nokrichting ────────────────────
// Splitst de GRB-footprint langs de noklijn in 2 (zadeldak) of behoudt
// de volledige footprint per vlak (schilddak: 4 driehoeken vanuit middelpunt).
// Geeft per face een array van [lat,lng] hoekpunten terug.
function generateFacePolygons(lc, faces, ridgeAngleDeg){
  if(!lc||!faces||!faces.length) return faces.map(f=>({...f,polygon:lc}));

  const lats=lc.map(p=>p[0]), lngs=lc.map(p=>p[1]);
  const cLat=(Math.min(...lats)+Math.max(...lats))/2;
  const cLng=(Math.min(...lngs)+Math.max(...lngs))/2;

  if(faces.length===1){
    return [{...faces[0],polygon:lc}];
  }

  // Voor 2 vlakken (zadeldak): splits langs de noklijn
  // Noklijn = door centroïde, richting ridgeAngleDeg
  // Gebruik crossComp-teken om punt links/rechts te bepalen
  if(faces.length===2){
    const ridgeRad=(ridgeAngleDeg||0)*Math.PI/180;
    const cosR=Math.cos(ridgeRad),sinR=Math.sin(ridgeRad);
    // Zijde 0 = rechts (aspectDeg van face 0), zijde 1 = links
    const side=(lat,lng)=>{
      const dx=lng-cLng, dy=lat-cLat; // geografisch: dy=Noord, dx=Oost
      return dx*cosR-dy*sinR>=0?0:1;
    };
    const polys=[[],[]];
    const n=lc.length;
    for(let i=0;i<n;i++){
      const a=lc[i], b=lc[(i+1)%n];
      const sA=side(a[0],a[1]), sB=side(b[0],b[1]);
      polys[sA].push(a);
      if(sA!==sB){
        // Snijpunt met de noklijn (via lineaire interpolatie)
        // Noklijn: door (cLat,cLng) met richting (sinR, cosR)
        // Rand: van a naar b
        const dlat=b[0]-a[0],dlng=b[1]-a[1];
        // crossComp(t) = (a_lng+t*dlng-cLng)*cosR - (a_lat+t*dlat-cLat)*sinR = 0
        const denom=dlng*cosR-dlat*sinR;
        if(Math.abs(denom)>1e-12){
          const t=((cLng-a[1])*cosR-(cLat-a[0])*sinR)/denom;
          if(t>0&&t<1){
            const cut=[a[0]+t*dlat, a[1]+t*dlng];
            polys[sA].push(cut);
            polys[sB].push(cut);
          }
        }
      }
    }
    // ← Wijs polys toe op basis van aspectDeg, NIET op array-index.
    // Na sort((a,b)=>b.n-a.n) in computeRoofFaces kan faces[0] de "linker" face zijn.
    // rightAspect = ridgeAngleDeg + 90 → polys[0]  (crossComp ≥ 0, "rechts")
    // leftAspect  = ridgeAngleDeg - 90 → polys[1]  (crossComp < 0, "links")
    return faces.map(f=>{
      // Hoekafstand van de face t.o.v. de rechts-loodrechte (ridgeAngle+90)
      const diff=((f.aspectDeg||0)-(ridgeAngleDeg||0)+360)%360;
      // 0–180° kloksgewijs van nok = rechterzijde (polys[0])
      // 180–360° = linkerzijde (polys[1])
      const polyIdx=diff<180?0:1;
      const poly=polys[polyIdx];
      return {...f,polygon:poly&&poly.length>=3?poly:lc};
    });
  }

  // Voor 3-4 vlakken (schilddak): driehoeken vanuit centroïde
  // Elk vlak krijgt de edges die het dichtst bij zijn aspect-richting liggen
  const n=lc.length;
  const edgeFace=[];
  for(let i=0;i<n;i++){
    const a=lc[i],b=lc[(i+1)%n];
    const eLat=(a[0]+b[0])/2-cLat, eLng=(a[1]+b[1])/2-cLng;
    const eAsp=((Math.atan2(eLng,eLat)*180/Math.PI)+360)%360;
    let bestF=0,bestD=360;
    faces.forEach((f,fi)=>{
      const asp=ASP_MAP[f.orientation]||0;
      const d=Math.abs(((eAsp-asp+180+360)%360)-180);
      if(d<bestD){bestD=d;bestF=fi;}
    });
    edgeFace.push(bestF);
  }
  const polys=faces.map(()=>[]);
  for(let i=0;i<n;i++){
    const fi=edgeFace[i];
    polys[fi].push(lc[i],lc[(i+1)%n],[cLat,cLng]);
  }
  return faces.map((f,i)=>({...f,polygon:polys[i]&&polys[i].length>=3?polys[i]:lc}));
}

// ─── Dakpolygonen tekenen op de kaart (editeerbaar) ─────────────────────────
function drawFacePolygons(map,L,faces,selFaceIdx,onSelect,editMode,_unused,onVertexDrag,onVertexDragEnd){
  if(!faces||!faces.length) return null;
  const g=L.layerGroup();

  faces.forEach((f,fi)=>{
    if(!f.polygon||f.polygon.length<3) return;
    const q=ZONE_Q[f.orientation]||ZONE_Q.Z;
    const isGood=BEST_SOUTH[f.orientation]!==false;
    const color=isGood?q[0].c:q[1].c;
    const isSel=fi===selFaceIdx;

    // Polygon — sla referentie op voor live vertex-drag update
    const facePoly=L.polygon(f.polygon,{
      color:isSel?'#1e293b':color,
      fillColor:color,
      fillOpacity:editMode?0:isSel?.65:.35,
      weight:editMode?(isSel?3:2):isSel?2.5:1.5,
      opacity:0.9,
    })
    .bindTooltip(`<b>${fi+1}. ${f.orientation} · ${f.slope}°</b><br>${(q[isGood?0:1]||{l:''}).l}<br>${f.pct}% van dak`,{sticky:true,direction:"top"})
    .on("click",()=>onSelect(fi))
    .addTo(g);

    // Nummerlabel op centroïde van polygoon
    const pLats=f.polygon.map(p=>p[0]),pLngs=f.polygon.map(p=>p[1]);
    const pCLat=(Math.min(...pLats)+Math.max(...pLats))/2;
    const pCLng=(Math.min(...pLngs)+Math.max(...pLngs))/2;
    L.marker([pCLat,pCLng],{icon:L.divIcon({
      html:`<div style="width:26px;height:26px;background:${color};border:${isSel?"3px solid #1e293b":"2px solid rgba(255,255,255,.8)"};border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:12px;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);user-select:none">${fi+1}</div>`,
      iconSize:[26,26],iconAnchor:[13,13],className:""
    })}).on("click",()=>onSelect(fi)).addTo(g);

    // Editeerbare vertices — oranje bolletjes op elke hoek
    if(editMode&&fi===selFaceIdx){
      const liveLatLngs=f.polygon.map(pt=>L.latLng(pt[0],pt[1]));

      f.polygon.forEach((pt,vi)=>{
        const marker=L.circleMarker([pt[0],pt[1]],{
          radius:9, color:"#1e293b", fillColor:"#f59e0b",
          fillOpacity:1, weight:2.5, zIndexOffset:1000
        })
        .bindTooltip("Punt "+(vi+1)+" · versleep (rood = samenvoegen)",{direction:"top",offset:[0,-8]})
        .addTo(g);

        marker.on("mousedown",function(e){
          L.DomEvent.stop(e);
          map.dragging.disable();
          map.getContainer().style.cursor="grabbing";
          const mLat2=111320,cLat2=f.polygon[0][0];
          const mLng2=111320*Math.cos(cLat2*Math.PI/180);
          const distPts=(a,b)=>Math.sqrt(((b[0]-a[0])*mLat2)**2+((b[1]-a[1])*mLng2)**2);

          const onMove=function(me){
            const ll=me.latlng;
            marker.setLatLng(ll);
            liveLatLngs[vi]=ll;
            facePoly.setLatLngs(liveLatLngs);
            // Rood als overlap met naburig punt (< 3m)
            const nearOther=f.polygon.some((other,oi)=>oi!==vi&&distPts([ll.lat,ll.lng],other)<3);
            marker.setStyle({fillColor:nearOther?"#dc2626":"#f59e0b"});
            if(onVertexDrag) onVertexDrag(fi,vi,[ll.lat,ll.lng]);
          };
          const onUp=function(){
            map.off("mousemove",onMove);
            map.off("mouseup",onUp);
            map.dragging.enable();
            map.getContainer().style.cursor="";
            marker.setStyle({fillColor:"#f59e0b"});
            // Auto-merge: als gesleept punt < 3m van naburig punt, samenvoegen
            const curLL=marker.getLatLng();
            const curPt=[curLL.lat,curLL.lng];
            const poly=liveLatLngs.map(ll=>[ll.lat,ll.lng]);
            let merged=false;
            if(poly.length>3){
              const prev=(vi-1+poly.length)%poly.length;
              const next=(vi+1)%poly.length;
              for(const ni of[next,prev]){
                if(distPts(curPt,[poly[ni][0],poly[ni][1]])<3){
                  // Samenvoegen: vervang ni door gemiddelde, verwijder vi
                  const avg=[(curPt[0]+poly[ni][0])/2,(curPt[1]+poly[ni][1])/2];
                  poly[ni]=avg;
                  poly.splice(vi,1);
                  merged=true;
                  break;
                }
              }
            }
            if(merged&&onVertexDrag){
              poly.forEach((pt,i)=>onVertexDrag(fi,i,pt));
            }
            if(onVertexDragEnd) onVertexDragEnd(fi,vi);
          };
          map.on("mousemove",onMove);
          map.on("mouseup",onUp);
        });
      });
    }
  });

  g.addTo(map); // KRITIEK: voeg toe aan kaart hier (redrawRoof gebruikt return value voor removeLayer)
  return g;
}

// Genummerde dakvlaksectoren tekenen (LiDAR-gedetecteerde richtingen)
// BEHOUDEN als fallback voor backwards-compat
function drawFaceSectors(map,L,lc,faces,selFaceIdx,onSelect){
  return drawFacePolygons(map,L,faces,selFaceIdx,onSelect,false,-1,null,null);
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
function shiftPanels(panels,dLat,dLng){
  return panels.map(p=>({
    corners:p.corners.map(([la,ln])=>[la+dLat,ln+dLng]),
    midLine:p.midLine.map(([la,ln])=>[la+dLat,ln+dLng])
  }));
}
// ─── Rij-detectie: groepeer panelen op basis van hun positie langs de nok ────
// Panelen in dezelfde rij hebben dezelfde crossComp (loodrechte afstand tot nok).
// We discretiseren op 0.5m nauwkeurigheid om floating-point drift te vermijden.
function detectPanelRows(panels,facePoly){
  if(!panels||!panels.length) return panels.map((_,i)=>i); // elke paneel eigen rij
  const cLat=facePoly.reduce((s,p)=>s+p[0],0)/facePoly.length;
  const cLng=facePoly.reduce((s,p)=>s+p[1],0)/facePoly.length;
  const mLat=111320,mLng=111320*Math.cos(cLat*Math.PI/180);
  // Centroïde van elk paneel in meters
  const panelCtrM=panels.map(p=>{
    const la=p.corners.reduce((s,c)=>s+c[0],0)/p.corners.length;
    const ln=p.corners.reduce((s,c)=>s+c[1],0)/p.corners.length;
    return[(ln-cLng)*mLng,(la-cLat)*mLat]; // [x=Oost, y=Noord]
  });
  // PCA op het face-polygoon om de nok-richting te bepalen
  const polyM=facePoly.map(([la,ln])=>[(ln-cLng)*mLng,(la-cLat)*mLat]);
  const cx=polyM.reduce((s,p)=>s+p[0],0)/polyM.length;
  const cy=polyM.reduce((s,p)=>s+p[1],0)/polyM.length;
  let sxx=0,sxy=0,syy=0;
  polyM.forEach(([x,y])=>{const dx=x-cx,dy=y-cy;sxx+=dx*dx;sxy+=dx*dy;syy+=dy*dy;});
  const pcaAng=Math.atan2(2*sxy,sxx-syy)/2;
  const cosA=Math.cos(pcaAng),sinA=Math.sin(pcaAng);
  // Project centroïde op de as loodrecht op de nok (= rij-coördinaat)
  const rowCoords=panelCtrM.map(([x,y])=>x*cosA+y*sinA); // langs de nok
  // Discretiseer op 0.5m → panelen in dezelfde rij hebben dezelfde sleutel
  const rowKeys=rowCoords.map(r=>Math.round(r/0.5));
  const uniqueRows=[...new Set(rowKeys)].sort((a,b)=>a-b);
  const rowMap=Object.fromEntries(uniqueRows.map((k,i)=>[k,i]));
  return rowKeys.map(k=>rowMap[k]); // array: paneel[i] → rijnummer
}

function drawPanelLayer(map,L,facePoly,count,panel,ridgeAngleDeg,orient,panelDataRef,moveMode){
  const ratio=1.56,pW=Math.sqrt(panel.area/ratio),pH=panel.area/pW;
  let panels=panelDataRef?.current||packPanels(facePoly,pW,pH,count,ridgeAngleDeg||0,orient||"portrait");
  if(panelDataRef) panelDataRef.current=panels;

  const rowOf=detectPanelRows(panels,facePoly); // rijnummer per paneel
  const kWp=((panels.length*panel.watt)/1000).toFixed(1);
  const g=L.layerGroup();

  const SEL_COL="#f59e0b",DEF_COL="#2563eb",DEF_BRD="#1e3a5f",SEL_BRD="#92400e";
  const selected=new Set(); // geselecteerde paneelindices

  const polyLayers=[],midLayers=[];

  const updateLabel=()=>{
    const n=panels.length,sel=selected.size;
    const txt=sel>0
      ?(sel+" geselecteerd · klik+sleep om te verplaatsen")
      :(n+"/"+count+" · "+kWp+" kWp");
    labelMk.setIcon(L.divIcon({
      html:"<div style='background:rgba(37,99,235,.9);color:#fff;padding:3px 8px;border-radius:4px;font-size:9px;font-family:IBM Plex Mono,monospace;white-space:nowrap;transform:translate(-50%,-50%)'>"+txt+"</div>",
      className:""
    }));
  };

  panels.forEach((p,i)=>{
    const poly=L.polygon(p.corners,{color:DEF_BRD,weight:1,fillColor:DEF_COL,fillOpacity:.85})
      .bindTooltip("Paneel "+(i+1)+" (rij "+( rowOf[i]+1)+") · "+panel.watt+"W",{direction:"top"})
      .addTo(g);
    polyLayers.push(poly);
    midLayers.push(p.midLine?.length===2
      ?L.polyline(p.midLine,{color:"#60a5fa",weight:.5,opacity:.6}).addTo(g)
      :null);
  });

  const cLa=panels.reduce((s,p)=>s+p.corners[0][0],0)/panels.length;
  const cLn=panels.reduce((s,p)=>s+p.corners[0][1],0)/panels.length;
  const labelMk=L.marker([cLa,cLn],{icon:L.divIcon({html:"",className:""})}).addTo(g);
  updateLabel();

  const setStyle=(i,isSel)=>{
    polyLayers[i]?.setStyle({fillColor:isSel?SEL_COL:DEF_COL,color:isSel?SEL_BRD:DEF_BRD,weight:isSel?2:1});
  };
  const toggleSel=(i)=>{
    if(selected.has(i)){selected.delete(i);setStyle(i,false);}
    else{selected.add(i);setStyle(i,true);}
    updateLabel();
  };
  const selRow=(rowIdx)=>{
    panels.forEach((_,i)=>{if(rowOf[i]===rowIdx){selected.add(i);setStyle(i,true);}});
    updateLabel();
  };

  if(moveMode){
    polyLayers.forEach((pl,i)=>{
      pl.on("mousedown",function(e){
        L.DomEvent.stop(e);
        const startLL=e.latlng;
        let hasMoved=false;
        const DRAG_THRESHOLD=5; // pixels

        const onMove=function(me){
          const dLat=me.latlng.lat-startLL.lat,dLng=me.latlng.lng-startLL.lng;
          toMove.forEach(idx=>{
            const np=startSnap[idx];
            const nc=np.corners.map(([la,ln])=>[la+dLat,ln+dLng]);
            const nm=np.midLine.map(([la,ln])=>[la+dLat,ln+dLng]);
            polyLayers[idx]?.setLatLngs(nc);
            midLayers[idx]?.setLatLngs(nm);
          });
        };
        const onUp=function(){
          map.off("mousemove",onMove);map.off("mouseup",onUp);
          map.dragging.enable();map.getContainer().style.cursor="";
          const final=polyLayers.map((pl2,j)=>{
            const lls=pl2.getLatLngs()[0];
            return{corners:lls.map(ll=>[ll.lat,ll.lng]),
                   midLine:midLayers[j]?midLayers[j].getLatLngs().map(ll=>[ll.lat,ll.lng]):[]};
          });
          if(panelDataRef) panelDataRef.current=final;
        };
        map.on("mousemove",onMove);map.on("mouseup",onUp);
      });
    });
  }

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

// ─── PDF generatie — EcoFinity stijl ───────────────────────────────────────────
async function generatePDF(results,customer,displayName,slope,orientation){
  await loadPdfLibs();
  const{jsPDF}=window.jspdf;
  const{PDFDocument}=window.PDFLib;
  const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const W=210,M=15;
  const OR=[224,123,0],ORD=[180,95,0],BG=[248,250,252],LN=[226,232,240];
  const TXT=[15,23,42],MUT=[100,116,139],WHT=[255,255,255];
  const GR=[22,163,74],BL=[37,99,235];

  const sf=(s,w="normal")=>{doc.setFont("helvetica",w);doc.setFontSize(s);};
  const sc=(rgb)=>doc.setTextColor(...rgb);
  const hLine=(yy)=>{doc.setDrawColor(...LN);doc.setLineWidth(0.3);doc.line(M,yy,W-M,yy);};
  const secTitle=(t,yy)=>{
    doc.setFillColor(...OR);doc.rect(M,yy-4,3,8,"F");
    sf(12,"bold");sc(TXT);doc.text(t,M+6,yy+2);
    return yy+11;
  };
  const miniHeader=(pg)=>{
    doc.setFillColor(...OR);doc.rect(0,0,W,14,"F");
    sf(9,"bold");sc(WHT);doc.text("EcoFinity BV",M,9);
    sf(9,"normal");doc.text("Project: "+(customer.name||"—"),M+32,9);
    sf(8,"normal");doc.text("Pagina "+pg,W-M,9,{align:"right"});
  };

  // ════ PAGINA 1 — Voorblad + Systeemoverzicht ════
  doc.setFillColor(...OR);doc.rect(0,0,W,40,"F");
  doc.setFillColor(...ORD);doc.rect(0,36,W,4,"F");
  sf(22,"bold");sc(WHT);doc.text("EcoFinity BV",M,20);
  sf(10,"normal");doc.text("Riedeplein 15 · 9660 Brakel · +32 55 495865 · info@ecofinity.eu",M,29);
  sf(9,"normal");doc.text(new Date().toLocaleDateString("nl-BE"),W-M,14,{align:"right"});

  // Projectblok
  doc.setFillColor(...BG);doc.rect(0,44,W,34,"F");
  sf(11,"bold");sc(TXT);doc.text("Project:",M,55);
  sf(14,"bold");sc(OR);doc.text(customer.name||"—",M+23,55);
  sf(9,"normal");sc(MUT);
  doc.text("Locatie: "+displayName.split(",").slice(0,3).join(","),M,64);
  doc.text("Datum: "+new Date().toLocaleDateString("nl-BE"),M,71);
  if(customer.email){sf(9,"normal");sc(MUT);doc.text(customer.email,W-M,64,{align:"right"});}
  if(customer.address){sf(9,"normal");sc(MUT);doc.text(customer.address,W-M,71,{align:"right"});}

  let y=87;

  // Systeemoverzicht
  y=secTitle("Systeemoverzicht",y);
  const kWp=((results.panelCount*results.panel.watt)/1000).toFixed(2);
  const sysItems=[
    results.panelCount+" × "+results.panel.brand+" "+results.panel.model,
    "Azimut: "+orientation+" · Helling: "+slope+"° · Piekvermogen: "+kWp+" kWp",
  ];
  if(results.inv) sysItems.push("1 × "+results.inv.brand+" "+results.inv.model+" · "+results.inv.kw+" kW · "+results.inv.fase);
  sysItems.forEach((t,i)=>{
    if(i%2===0){doc.setFillColor(240,245,255);doc.rect(M,y-3,W-2*M,8,"F");}
    sf(9,i===0?"bold":"normal");sc(i===0?TXT:MUT);doc.text(t,M+3,y+2);
    y+=8;
  });
  y+=3;

  // PV-configuratiegegevens (2 kolommen)
  y=secTitle("PV-configuratiegegevens",y+2);
  const cfgL=[
    ["Totaal PV-panelen",results.panelCount+""],
    ["Piekvermogen",kWp+" kWp"],
    ["Oriëntatie",orientation],
    ["Hellingshoek",slope+"°"],
    ["Jaaropbrengst",results.annualKwh.toLocaleString("nl-BE")+" kWh"],
    ["CO₂-reductie",results.co2+" kg/jaar"],
  ];
  const cfgR=[
    ["Paneel efficiency",results.panel.eff+"%"],
    ["Spec. opbrengst",(results.annualKwh/+kWp).toFixed(0)+" kWh/kWp"],
    ["Dekkingsgraad",results.coverage+"%"],
    ["Meetbron",results.dhmOk?"LiDAR DHM Vl.":"Manueel"],
    ["2D dakoppervlak",(results.footprintArea2d||80)+" m²"],
    ["3D dakoppervlak",(results.totalSlope3d||"—")+" m²"],
  ];
  const cW=(W-2*M)/2-2;
  [[cfgL,M],[cfgR,M+cW+4]].forEach(([rows,cx])=>{
    let ry=y;
    rows.forEach(([k,v],ri)=>{
      if(ri%2===0){doc.setFillColor(...BG);doc.rect(cx,ry-3,cW,7,"F");}
      sf(8,"normal");sc(MUT);doc.text(k+":",cx+2,ry+1);
      sf(9,"bold");sc(TXT);doc.text(v,cx+cW-2,ry+1,{align:"right"});
      ry+=7;
    });
  });
  y+=cfgL.length*7+6;

  // ════ PAGINA 2 — Financiën + Maandwaarden ════
  doc.addPage();miniHeader(2);y=22;

  // Financiële KPI-blokken
  y=secTitle("Financiële analyse",y);
  const kpis=[
    ["Totale investering","€ "+results.investPanels.toLocaleString("nl-BE"),OR],
    ["Jaarlijkse besparing","€ "+results.annualBase.toLocaleString("nl-BE"),GR],
    ["Terugverdientijd",results.paybackBase+" jaar",BL],
  ];
  if(results.battResult) kpis.push(["Incl. batterij",results.battResult.payback+" jaar",[120,40,180]]);
  const kw=(W-2*M)/kpis.length;
  kpis.forEach(([lbl,val,col],i)=>{
    const kx=M+i*kw;
    doc.setFillColor(...col.map(c=>c*0.1+230));
    doc.rect(kx,y-2,kw-3,18,"F");
    doc.setDrawColor(...col);doc.setLineWidth(0.8);doc.rect(kx,y-2,kw-3,18,"S");
    sf(13,"bold");sc(col);doc.text(val,kx+(kw-3)/2,y+8,{align:"center"});
    sf(7,"normal");sc(MUT);doc.text(lbl,kx+(kw-3)/2,y+14,{align:"center"});
  });
  y+=24;
  const finRows=[
    ["Zonnepanelen ("+results.panelCount+" × "+results.panel.model+")","€ "+(results.panelCount*results.panel.price).toLocaleString("nl-BE")],
    ["Installatie & omvormer","€ "+(results.inv?results.inv.price:1200).toLocaleString("nl-BE")],
    ["Totale investering","€ "+results.investPanels.toLocaleString("nl-BE")],
    ["Jaarlijkse besparing (€0,28/kWh)","€ "+results.annualBase.toLocaleString("nl-BE")],
    ["Terugverdientijd",results.paybackBase+" jaar"],
  ];
  if(results.battResult){
    finRows.push(["Thuisbatterij "+(results.batt?.model||""),"€ "+results.batt?.price.toLocaleString("nl-BE")]);
    finRows.push(["Extra besparing met batterij","€ "+results.battResult.extraSav.toLocaleString("nl-BE")+"/jaar"]);
    finRows.push(["Terugverdientijd incl. batterij",results.battResult.payback+" jaar"]);
  }
  doc.autoTable({startY:y,head:[["Post","Bedrag"]],body:finRows,
    styles:{fontSize:9,cellPadding:3},
    headStyles:{fillColor:BL,textColor:WHT,fontStyle:"bold"},
    alternateRowStyles:{fillColor:[239,246,255]},
    columnStyles:{0:{fontStyle:"bold",cellWidth:130},1:{halign:"right"}},
    margin:{left:M,right:M},tableWidth:W-2*M});
  y=doc.lastAutoTable.finalY+10;hLine(y);y+=8;

  // Maandwaarden
  y=secTitle("Maandwaarden — Energieopbrengst",y);
  const mVals=MONTHLY_FACTOR.map(f=>Math.round(results.annualKwh*f));
  doc.autoTable({startY:y,
    head:[[...MONTHS]],
    body:[mVals.map(v=>v+""),mVals.map(v=>((v/results.annualKwh)*100).toFixed(1)+"%")],
    styles:{fontSize:8,cellPadding:2.5,halign:"center"},
    headStyles:{fillColor:GR,textColor:WHT,fontStyle:"bold"},
    alternateRowStyles:{fillColor:[240,253,244]},
    margin:{left:M,right:M},tableWidth:W-2*M});
  y=doc.lastAutoTable.finalY+6;

  // Balkgrafiek
  if(y+55<278){
    const maxV=Math.max(...mVals);
    const bW=(W-2*M-4)/12;
    [0,0.5,1].forEach(f=>{
      const gy=y+44-f*40;
      doc.setDrawColor(...LN);doc.setLineWidth(0.2);doc.line(M,gy,W-M,gy);
      sf(6,"normal");sc(MUT);doc.text(Math.round(maxV*f)+"",M-1,gy+1,{align:"right"});
    });
    mVals.forEach((v,i)=>{
      const bH=(v/maxV)*40,bx=M+2+i*(bW+0.5);
      const h=v/maxV;
      doc.setFillColor(Math.round(37+h*218),Math.round(99+h*78),Math.round(235-h*139));
      doc.rect(bx,y+44-bH,bW-0.5,bH,"F");
      sf(6,"normal");sc(MUT);doc.text(MONTHS[i],bx+bW/2,y+50,{align:"center"});
      if(bH>8){sf(6,"bold");sc(WHT);doc.text(v+"",bx+bW/2,y+44-bH+6,{align:"center"});}
    });
    y+=56;
  }

  // Footer
  const pgC=doc.getNumberOfPages();
  for(let i=1;i<=pgC;i++){
    doc.setPage(i);
    doc.setFillColor(248,250,252);doc.rect(0,284,W,13,"F");
    doc.setDrawColor(...OR);doc.setLineWidth(0.3);doc.line(0,284,W,284);
    sf(7,"normal");sc(MUT);
    doc.text("Pagina "+i+" / "+pgC,W-M,292,{align:"right"});
    doc.text("EcoFinity BV · www.ecofinity.eu · info@ecofinity.eu · +32 55 495865",M,292);
    doc.text("Berekeningen zijn schattingen. Raadpleeg een erkend installateur voor definitieve offerte.",M,288,{maxWidth:W-2*M-20});
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
}function PanelCard({p,selected,onSelect,onDelete,canDelete}){return(
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
export default function App(){
  const[activeTab,setActiveTab]=useState("configuratie");
  const[query,setQuery]=useState("");const[suggs,setSuggs]=useState([]);const[showSuggs,setShowSuggs]=useState(false);
  const[coords,setCoords]=useState(null);const[displayName,setDisplayName]=useState("");
  const[slope,setSlope]=useState(35);const[orientation,setOrientation]=useState("Z");
  const[activeLayer,setActiveLayer]=useState("luchtfoto");
  const[mapReady,setMapReady]=useState(false); // FIX: was per ongeluk in commentaar opgeslokt

  const[grbStatus,setGrbStatus]=useState("idle");
  const[buildingCoords,setBuildingCoords]=useState(null);
  const[detectedArea,setDetectedArea]=useState(null);

  const[dhmStatus,setDhmStatus]=useState("idle");const[dhmError,setDhmError]=useState("");
  const[detectedFaces,setDetectedFaces]=useState(null);const[selFaceIdx,setSelFaceIdx]=useState(0);
  const[editMode,setEditMode]=useState(false);
  const[panelMoveMode,setPanelMoveMode]=useState(false);
  const[panelOrient,setPanelOrient]=useState("portrait");
  const panelDataRef=useRef(null);
  const detectedFacesRef=useRef(null);
  const draggedPolygonsRef=useRef(null);

  const leafRef=useRef(null);const markerRef=useRef(null);
  const selectingRef=useRef(false);
  const baseTileRef=useRef(null); // luchtfoto / kaart base layer  // Fix: bijhoud of suggestie geselecteerd wordt
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
  const[customCount,setCustomCount]=useState(10);
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

  // Vertex drag handlers
  useEffect(()=>{detectedFacesRef.current=detectedFaces;},[detectedFaces]);

  const onVertexDrag=useCallback((faceIdx,vertexIdx,newLatLng)=>{
    if(!draggedPolygonsRef.current){
      const faces=detectedFacesRef.current;
      draggedPolygonsRef.current=faces?faces.map(f=>f.polygon?[...f.polygon.map(p=>[...p])]:null):null;
    }
    if(draggedPolygonsRef.current?.[faceIdx]){
      draggedPolygonsRef.current[faceIdx][vertexIdx]=[newLatLng[0],newLatLng[1]];
    }
  },[]);

  const onVertexDragEnd=useCallback(()=>{
    if(!draggedPolygonsRef.current) return;
    const newPolygons=draggedPolygonsRef.current;
    draggedPolygonsRef.current=null;
    setDetectedFaces(prev=>{
      if(!prev) return prev;
      return prev.map((f,fi)=>{
        const newPoly=newPolygons[fi];
        if(!newPoly) return f;
        const area2d=Math.round(polyAreaLambert72(newPoly));
        const area3d=+compute3dArea(area2d,f.slope).toFixed(1);
        return {...f,polygon:newPoly,area2d_manual:area2d,area3d_manual:area3d,status:"manual"};
      });
    });
  },[]);

  const redrawRoofRef=useRef(null);

  const redrawRoof=useCallback(()=>{
    if(!leafRef.current||!buildingCoords||!window.L) return;
    const L=window.L,map=leafRef.current;
    if(roofLayerRef.current){
      if(typeof roofLayerRef.current.remove==="function") roofLayerRef.current.remove();
      else map.removeLayer(roofLayerRef.current);
      roofLayerRef.current=null;
    }
    if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;setPanelsDrawn(false);}

    if(detectedFaces&&detectedFaces.length>0){
      const ridgeAngle=detectedFaces[0]?.ridgeAngleDeg;
      let facesToDraw=detectedFaces;
      if(!detectedFaces[0]?.polygon){
        facesToDraw=generateFacePolygons(buildingCoords,detectedFaces,ridgeAngle);
        setTimeout(()=>setDetectedFaces(facesToDraw),0);
      }
      const outlineLayer=L.polygon(buildingCoords,{color:"#e07b00",fillOpacity:0,weight:2,dashArray:"5,3"}).addTo(map);

      // Dakafmetingen tonen op de kaart
      facesToDraw.forEach(f=>{
        if(!f.polygon||f.polygon.length<3) return;
        const lamPts=f.polygon.map(([la,ln])=>wgs84ToLambert72(la,ln));
        const cx2=lamPts.reduce((s,p)=>s+p[0],0)/lamPts.length;
        const cy2=lamPts.reduce((s,p)=>s+p[1],0)/lamPts.length;
        let sxx=0,sxy=0,syy=0;
        lamPts.forEach(([x,y])=>{const dx=x-cx2,dy=y-cy2;sxx+=dx*dx;sxy+=dx*dy;syy+=dy*dy;});
        const pcaAng=Math.atan2(2*sxy,sxx-syy)/2;
        const cosA=Math.cos(pcaAng),sinA=Math.sin(pcaAng);
        const proj1=lamPts.map(([x,y])=>(x-cx2)*cosA+(y-cy2)*sinA);
        const proj2=lamPts.map(([x,y])=>(-(x-cx2)*sinA+(y-cy2)*cosA));
        const len2d=Math.max(...proj1)-Math.min(...proj1); // langs nok
        const wid2d=Math.max(...proj2)-Math.min(...proj2); // loodrecht op nok (2D)
        const wid3d=wid2d/Math.cos((f.slope||0)*Math.PI/180); // werkelijke schuine breedte
        // Label op centroïde van het vlak
        const cLat=f.polygon.reduce((s,p)=>s+p[0],0)/f.polygon.length;
        const cLng=f.polygon.reduce((s,p)=>s+p[1],0)/f.polygon.length;
        L.marker([cLat,cLng],{icon:L.divIcon({
          html:"<div style='background:rgba(0,0,0,.65);color:#fff;padding:2px 6px;border-radius:3px;font-size:9px;font-family:IBM Plex Mono,monospace;white-space:nowrap;transform:translate(-50%,-50%)'>"
            +len2d.toFixed(1)+"m × "+wid3d.toFixed(1)+"m*</div>",
          className:""
        })}).addTo(outlineLayer instanceof L.LayerGroup?outlineLayer:map);
      });

      const faceGroup=drawFacePolygons(
        map,L,facesToDraw,selFaceIdx,
        (idx)=>{setSelFaceIdx(idx);setOrientation(facesToDraw[idx].orientation);setSlope(facesToDraw[idx].slope);},
        editMode,selFaceIdx,onVertexDrag,onVertexDragEnd
      );
      roofLayerRef.current={remove:()=>{map.removeLayer(outlineLayer);if(faceGroup) map.removeLayer(faceGroup);}};
    } else {
      roofLayerRef.current=drawRealRoof(map,L,buildingCoords,orientation);
    }
  },[buildingCoords,orientation,detectedFaces,selFaceIdx,editMode]);

  redrawRoofRef.current=redrawRoof;
  useEffect(()=>{if(mapReady&&buildingCoords) redrawRoof();},[mapReady,buildingCoords,orientation,detectedFaces,selFaceIdx,editMode]);
  useEffect(()=>{if(activeTab==="configuratie"&&leafRef.current&&mapReady){setTimeout(()=>leafRef.current?.invalidateSize?.(),50);}},[ activeTab,mapReady]);

  useEffect(()=>{
    if(!panelsDrawn||!buildingCoords||!selPanel||!leafRef.current||!window.L||!coords) return;
    const L=window.L,map=leafRef.current;
    if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
    const _sf=detectedFaces?.[selFaceIdx];
    const _fp=_sf?.polygon||buildingCoords;
    const _ra=_sf?.ridgeAngleDeg||0;
    panelLayerRef.current=drawPanelLayer(map,L,_fp,panelCount,selPanel,_ra,panelOrient,panelDataRef,panelMoveMode);
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
      {attribution:"© Esri World Imagery",maxZoom:21,maxNativeZoom:18}
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
      const faces=await analyzeDHM(bc);
      if(faces?.length>0){setDetectedFaces(faces);setSelFaceIdx(0);setOrientation(faces[0].orientation);setSlope(faces[0].slope);setDhmStatus("ok");}
      else{setDhmStatus("error");setDhmError("Geen dakvlakken gevonden in LiDAR data (plat dak of kleine bounding box).");}
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
      // panel drawing now in useEffect above
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
      <div className="logo">☀️</div>
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
                onBlur={()=>setTimeout(()=>setShowSuggs(false),150)}/>
              {showSuggs&&suggs.length>0&&<div className="sugg">
                {suggs.map((s,i)=><div key={i} className="sugg-item"
                  onMouseDown={e=>e.preventDefault()}
                  onClick={()=>{setShowSuggs(false);setSuggs([]);selectAddr(s);}}>
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
          {(dhmStatus==="ok"||dhmStatus==="error")&&detectedFaces&&<div>
            <div className="info-box dhm-ok" style={{marginBottom:5}}>
              {dhmStatus==="ok"
                ?<><strong>✅ {detectedFaces.length} dakvlak(ken) gedetecteerd via LiDAR</strong>
                   <span style={{display:"block",marginTop:3,fontSize:8,color:"var(--muted)"}}>GRB-contour · EPSG:31370</span></>
                :<><strong style={{color:"#92400e"}}>⚠️ LiDAR niet beschikbaar</strong> — GRB-contour gebruikt
                   <span style={{display:"block",marginTop:3,fontSize:8,color:"var(--muted)"}}>{dhmError}</span></>
              }
            </div>
            <div className="face-grid">
              {detectedFaces.map((f,i)=>{
                const q=ZONE_Q[f.orientation]||ZONE_Q.Z;
                const isGood=BEST_SOUTH[f.orientation]!==false;
                const qC=isGood?q[0]:q[1];
                const conf=f.confidence??0;
                const confColor=conf>=0.7?"var(--green)":conf>=0.4?"var(--amber)":"var(--red)";
                const face2d=f.area2d_manual||(detectedArea||80)*(f.pct/100);
                const face3d=f.area3d_manual||compute3dArea(face2d,f.slope);
                return(
                  <button key={i} className={`face-btn ${selFaceIdx===i?"active":""}`} onClick={()=>selectFace(i,detectedFaces)}>
                    <span className="fb-main">{f.isFlatRoof?"🏢 ":""}{f.orientation} · {f.slope}°
                      {f.status==="manual"&&<span style={{fontSize:7,color:"var(--amber)",marginLeft:4}}>✏️</span>}
                    </span>
                    <span className="fb-sub">{f.pct}% · {f.avgH}m hoogte</span>
                    <span style={{fontSize:8,color:"var(--blue)",display:"block",marginTop:2}}>
                      3D: {face3d.toFixed(0)}m² <span style={{color:"var(--muted)"}}>(2D: {face2d.toFixed(0)}m²)</span>
                    </span>
                    <span style={{fontSize:8,color:selFaceIdx===i?"var(--alpha)":qC.c,display:"block"}}>{qC.l}</span>
                    {conf>0&&<span style={{fontSize:7,color:confColor,display:"block"}}>
                      {conf>=0.7?"✅":conf>=0.4?"⚠️":"❌"} conf: {Math.round(conf*100)}%
                    </span>}
                  </button>
                );
              })}
            </div>
            <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
              {!editMode
                ?<button className="btn sec sm" style={{flex:1}} onClick={()=>{
                    if(!detectedFaces[selFaceIdx]?.polygon){
                      const withPolys=generateFacePolygons(buildingCoords,detectedFaces,detectedFaces[0]?.ridgeAngleDeg);
                      setDetectedFaces(withPolys);
                      setTimeout(()=>setEditMode(true),50);
                    } else {setEditMode(true);}
                  }}>✏️ Dakvlak aanpassen</button>
                :<>
                  <button className="btn green sm" style={{flex:1}} onClick={()=>{
                    setDetectedFaces(prev=>prev?.map((f,i)=>i===selFaceIdx?{...f,status:"manual"}:f));
                    setEditMode(false);
                  }}>✅ Bevestig</button>
                  <button className="btn danger sm" onClick={()=>setEditMode(false)}>✕</button>
                </>
              }
              {!editMode&&detectedFaces.length<4&&<button className="btn sec sm" onClick={()=>{
                const f=detectedFaces[selFaceIdx];
                if(!f?.polygon||f.polygon.length<4) return;
                const mid=Math.floor(f.polygon.length/2);
                const half1={...f,polygon:[...f.polygon.slice(0,mid+1)],pct:Math.round(f.pct/2),status:"manual"};
                const half2={...f,orientation:DIRS8[(DIRS8.indexOf(f.orientation)+2)%8]||f.orientation,polygon:[...f.polygon.slice(mid)],pct:Math.round(f.pct/2),status:"manual"};
                setDetectedFaces(prev=>[...prev.slice(0,selFaceIdx),half1,half2,...prev.slice(selFaceIdx+1)]);
              }}>➕ Splits</button>}
            </div>
            {editMode&&<div className="info-box" style={{marginTop:5,background:"#fffbeb",borderColor:"#fde68a",fontSize:9}}>
              <strong>✏️ Editeer modus</strong> — Versleep oranje bolletjes op de kaart. Rode bol = samenvoegen bij loslaten.
            </div>}
          </div>}
          {dhmStatus==="error"&&!detectedFaces&&<div className="info-box err">
            <strong>⚠️ LiDAR niet beschikbaar</strong><br/>
            <span style={{fontSize:8,color:"var(--muted)"}}>{dhmError}</span><br/>
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
          <div style={{display:"flex",gap:5,marginBottom:6}}>
            {["portrait","landscape"].map(o=>(
              <button key={o} onClick={()=>{setPanelOrient(o);setCustomCount(customCount??10);}}
                style={{flex:1,padding:"5px 8px",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
                  fontWeight:panelOrient===o?700:400,cursor:"pointer",borderRadius:5,
                  background:panelOrient===o?"var(--amber-light)":"var(--bg3)",
                  border:panelOrient===o?"1px solid var(--amber)":"1px solid var(--border-dark)",
                  color:panelOrient===o?"var(--amber)":"var(--muted)"}}>
                {o==="portrait"?"▯ Portrait":"▭ Landscape"}
              </button>
            ))}
          </div>
          <div className="pce">
            <div className="pce-top"><span className="pce-title">Klant keuze</span><span className="pce-reset" onClick={()=>setCustomCount(10)}>{`↩ Reset (max: ${autoPanels})`}</span></div>
            <div className="pce-controls">
              <button className="pce-btn" onClick={()=>setCustomCount(Math.max(1,(customCount??autoPanels)-1))}>−</button>
              <div style={{textAlign:"center"}}>
                <input type="number" min="1" max={autoPanels+20} value={customCount??autoPanels}
                  onChange={e=>{const v=parseInt(e.target.value,10);if(!isNaN(v)&&v>=1)setCustomCount(Math.min(v,autoPanels+20));}}
                  style={{width:68,textAlign:"center",fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,color:"var(--amber)",border:"none",background:"transparent",outline:"none",padding:0,cursor:"text"}}/>
                <div className="pce-sub">{((panelCount*(selPanel?.watt||400))/1000).toFixed(1)} kWp</div>
              </div>
              <button className="pce-btn" onClick={()=>setCustomCount(Math.min(autoPanels+20,(customCount??autoPanels)+1))}>+</button>
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
        <button className="btn sec full" style={{marginBottom:5}} onClick={()=>{
          if(!coords||!buildingCoords||!selPanel) return;
          if(panelDataRef) panelDataRef.current=null;
          setPanelMoveMode(false);
          if(leafRef.current&&window.L){
            const L=window.L,map=leafRef.current;
            if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
            const _sf=detectedFaces?.[selFaceIdx];
            const _fp=_sf?.polygon||buildingCoords;
            const _ra=_sf?.ridgeAngleDeg||0;
            panelLayerRef.current=drawPanelLayer(map,L,_fp,panelCount,selPanel,_ra,panelOrient,panelDataRef,false);
            setPanelsDrawn(true);
          }
          setActiveTab("configuratie");
          setTimeout(()=>{if(leafRef.current) leafRef.current.invalidateSize();},100);
        }} disabled={!coords||!buildingCoords||isLoading}>
          🏠 Toon {panelCount} panelen op dak
        </button>
        {panelsDrawn&&<button className={"btn full "+(panelMoveMode?"green":"")} style={{marginBottom:5}} onClick={()=>{
          const nm=!panelMoveMode;setPanelMoveMode(nm);
          if(leafRef.current&&window.L){
            const L=window.L,map=leafRef.current;
            if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
            const _sf=detectedFaces?.[selFaceIdx];
            const _fp=_sf?.polygon||buildingCoords;
            const _ra=_sf?.ridgeAngleDeg||0;
            panelLayerRef.current=drawPanelLayer(map,L,_fp,panelCount,selPanel,_ra,panelOrient,panelDataRef,nm);
          }
          if(nm){setActiveTab("configuratie");setTimeout(()=>{if(leafRef.current) leafRef.current.invalidateSize();},50);}
        }}>
          {panelMoveMode?"✅ Klaar · klik paneel=select · dubbelklik=rij · sleep=verplaats":"↔️ Verplaats panelen"}
        </button>}
        <button className="btn full" onClick={calculate} disabled={!coords||aiLoading||!buildingCoords||isLoading}>
          {aiLoading?<><div className="spinner"/>Analyseren...</>:dhmStatus==="loading"?<><div className="spinner cyan"/>LiDAR verwerken...</>:grbStatus==="loading"?<><div className="spinner"/>Laden...</>:"☀️ Bereken resultaten"}
        </button>
        <div className="info-box">
          <strong>📡 Databronnen</strong><br/>GRB · GRB Gebouwcontouren · 1m<br/>DHM WCS · DSM+DTM · Horn's methode<br/>Lambert72 · Helmert 7-parameter<br/>© Agentschap Digitaal Vlaanderen
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="content-area">

        {/* CONFIGURATIE = kaart */}
        <div className="map-area" style={{display:activeTab==="configuratie"?"flex":"none",flex:1,position:"relative",minHeight:0}}>
          <div id="leaflet-map" style={{height:"100%"}}/>
          {/* Laagkiezer */}
          <div className="map-btns">
            <button className={`map-btn ${activeLayer==="luchtfoto"?"active":""}`} onClick={()=>setActiveLayer("luchtfoto")}>🛰️ Esri</button>
            <button className={`map-btn ${activeLayer==="ortho"?"active":""}`} onClick={()=>setActiveLayer("ortho")}>📷 Ortho VL</button>
            <button className={`map-btn ${activeLayer==="kaart"?"active":""}`} onClick={()=>setActiveLayer("kaart")}>🗺️ Kaart</button>
            <button className={`map-btn ${activeLayer==="dsm"?"active":""}`} onClick={()=>setActiveLayer("dsm")}>📡 DSM Hoogte</button>
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
        </div>

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

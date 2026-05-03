import { useState, useEffect, useRef, useCallback, Component } from "react";
import {
  wgs84ToLambert72 as _wgs84ToLambert72,
  lambert72ToWgs84 as _lambert72ToWgs84,
  packPanels as _packPanels,
} from "./panelPlacement.js";
import {
  saveProject,
  loadProject,
  deleteProject,
  listProjects,
  projectExists,
  downloadProjectAsJSON,
  importProjectFromJSON,
  createAutoSaver,
} from "./projectStorage.js";
import { computeStringDesign } from "./stringDesign.js";
import * as TL from "./teamleaderClient.js";
// EcoFinity logo — vul hier de base64 string in via ecofinityLogo.js of inline
// Als het bestand niet bestaat: tijdelijk null (geen logo in header)
const ECOFINITY_LOGO_BASE64=null;
const ECOFINITY_LOGO_WIDTH=400;
const ECOFINITY_LOGO_HEIGHT=200;
// Verdify logo embedded
const VERDIFY_LOGO_BASE64="data:image/jpeg;base64,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";
const VERDIFY_LOGO_WIDTH=400;
const VERDIFY_LOGO_HEIGHT=178;

const wgs84ToLambert72 = _wgs84ToLambert72;
const lambert72ToWgs84 = _lambert72ToWgs84;
const packPanels = (facePoly, pW, pH, maxN, rotOffsetDeg, orient) =>
  _packPanels({
    facePoly,
    panelWidth: pW,
    panelHeight: pH,
    maxPanels: maxN,
    rotOffsetDeg,
    orient,
    logger: msg => console.info(`[ZonneDak] ${msg}`),
  });

const AI_PROXY_URL = "https://zonnedak-ai-proxy-west.vercel.app/api/anthropic-proxy";

// ─── Endpoints ──────────────────────────────────────────────────────────────
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const GRB_WFS   = "https://geo.api.vlaanderen.be/GRB/wfs";
const DHM_WMS   = "https://geoservices.informatievlaanderen.be/raadpleegdiensten/DHMVII/wms";
const ORTHO_WMS = "https://geoservices.informatievlaanderen.be/raadpleegdiensten/OMWRGBMRVL/wms";
const ORTHO_LYR = "OMWRGBMRVL";
const WCS_BASE = "https://geo.api.vlaanderen.be/DHMV/wcs";
const WCS_PROXY_VERCEL = "https://zonnedak-ai-proxy-west.vercel.app/api/wcs-proxy?url=";
const WCS_PROXY_ALLORIGINS = "https://api.allorigins.win/raw?url=";

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
  const directUrl=`${WCS_BASE}?${p}`;
  const vercelUrl=`${WCS_PROXY_VERCEL}${encodeURIComponent(directUrl)}`;
  const allOriginsUrl=`${WCS_PROXY_ALLORIGINS}${encodeURIComponent(directUrl)}`;
  let lastErr="";
  for(const url of[directUrl,vercelUrl,allOriginsUrl]){
    try{
      const r=await fetch(url,{cache:"no-store"});
      if(!r.ok){lastErr=`HTTP ${r.status}`;continue;}
      const ct=r.headers.get("content-type")||"";
      if(ct.includes("xml")||ct.includes("html")){lastErr=`WCS fout: ${(await r.text()).substring(0,100)}`;continue;}
      return parseTIFF(await r.arrayBuffer());
    }catch(e){lastErr=e.message;}
  }
  throw new Error(lastErr||"WCS niet bereikbaar");
}

function buildingWidthFromPolygon(lamPts){
  if(lamPts.length<3) return 10;
  const cx=lamPts.reduce((s,p)=>s+p[0],0)/lamPts.length;
  const cy=lamPts.reduce((s,p)=>s+p[1],0)/lamPts.length;
  let cxx=0,cxy=0,cyy=0;
  lamPts.forEach(([x,y])=>{const dx=x-cx,dy=y-cy;cxx+=dx*dx;cxy+=dx*dy;cyy+=dy*dy;});
  cxx/=lamPts.length;cxy/=lamPts.length;cyy/=lamPts.length;
  const ang=Math.atan2(2*cxy,cxx-cyy)/2;
  const proj1=lamPts.map(([x,y])=>(x-cx)*Math.cos(ang)+(y-cy)*Math.sin(ang));
  const proj2=lamPts.map(([x,y])=>-(x-cx)*Math.sin(ang)+(y-cy)*Math.cos(ang));
  const w1=Math.max(...proj1)-Math.min(...proj1);
  const w2=Math.max(...proj2)-Math.min(...proj2);
  return Math.min(w1,w2);
}

function computeRoofFaces(dsmD,dtmD,w,h,cellSize,bldRasterPts,buildingWidthM,ridgeAngleDeg){
  const ridgeRad=ridgeAngleDeg*Math.PI/180;
  const cosR=Math.cos(ridgeRad), sinR=Math.sin(ridgeRad);
  const dakPts=[];
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
    const dx=x-cxR, dy=cyR-y;
    const crossComp=(dx*cosR-dy*sinR)*cellSize;
    dakPts.push({crossComp,relH});
  }
  if(dakPts.length<10) return null;

  let n=0,sX=0,sY=0,sXX=0,sXY=0;
  dakPts.forEach(({crossComp,relH})=>{
    const absComp=Math.abs(crossComp);
    n++;sX+=absComp;sY+=relH;sXX+=absComp*absComp;sXY+=absComp*relH;
  });
  const denom=n*sXX-sX*sX;
  let slope=20;
  let nokH=0,slopeStdVal=5;
  if(Math.abs(denom)>0.001){
    const beta=(n*sXY-sX*sY)/denom;
    const alpha=(sY-beta*sX)/n;
    nokH=+alpha.toFixed(1);
    slope=Math.max(3,Math.min(60,Math.round(Math.atan(Math.abs(beta))*180/Math.PI)));
    const residuals=dakPts.map(p=>(p.relH-(alpha+beta*Math.abs(p.crossComp)))**2);
    const rmse=Math.sqrt(residuals.reduce((a,v)=>a+v,0)/n);
    slopeStdVal=+rmse.toFixed(2);
    console.info(`[ZonneDak] Regressie: beta=${beta.toFixed(3)}m/m → slope=${slope}° nok_relH=${nokH}m RMSE=${rmse.toFixed(2)}m (n=${n})`);
  } else {
    console.warn('[ZonneDak] Regressie: onvoldoende variatie in crossComp, gebruik fallback slope');
  }

  const leftN=dakPts.filter(p=>p.crossComp<0).length;
  const rightN=dakPts.filter(p=>p.crossComp>=0).length;
  const total=leftN+rightN;
  const avgH=+(sY/n).toFixed(1);

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
                status:"auto",aspectDeg:+rightAspect.toFixed(1),ridgeAngleDeg:+ridgeAngleDeg.toFixed(1)});
  }
  if(leftN>=total*0.08){
    const pct=Math.round(leftN/total*100);
    const dirIdx=Math.round(leftAspect/45)%8;
    const conf=Math.min(1,Math.max(0,
      0.5*(pct/50)+0.3*(slope>=5&&slope<=60?1:0.3)+0.2*(slopeStdVal<0.5?1:slopeStdVal<1?0.7:0.4)));
    faces.push({orientation:DIRS8[dirIdx],slope,avgH,pct,n:leftN,
                slopeStd:slopeStdVal,confidence:+conf.toFixed(2),
                status:"auto",aspectDeg:+leftAspect.toFixed(1),ridgeAngleDeg:+ridgeAngleDeg.toFixed(1)});
  }
  console.info(`[ZonneDak] GRB-aspect: nok=${ridgeAngleDeg.toFixed(1)}° → ${faces.map(f=>`${f.orientation}·${f.slope}°·${f.pct}%`).join(' / ')}`);
  return faces.length>=1?faces.sort((a,b)=>b.n-a.n):null;
}

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

  const cell=bboxW/dsmR.w;
  console.info(`[ZonneDak] Raster gekregen ${dsmR.w}×${dsmR.h}px, cel=${cell.toFixed(3)}m/px`);

  const validPairs=[];
  for(let i=0;i<dsmR.data.length;i++){
    if(!isNaN(dsmR.data[i])&&!isNaN(dtmR.data[i])) validPairs.push(dsmR.data[i]-dtmR.data[i]);
  }
  const maxRelH=validPairs.length?Math.max(...validPairs):0;
  const avgRelH=validPairs.length?validPairs.reduce((a,v)=>a+v,0)/validPairs.length:0;
  const aboveRoof=validPairs.filter(v=>v>=1.5).length;
  console.info(`[ZonneDak] maxRelH=${maxRelH.toFixed(2)}m avgRelH=${avgRelH.toFixed(2)}m boven1.5m=${aboveRoof}`);

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

  const bldRasterPts=bc.map(([lat,lng])=>{
    const[lx,ly]=wgs84ToLambert72(lat,lng);
    return[(lx-xmin)/cell,(ymax-ly)/cell];
  });

  const lamPts=bc.map(([lat,lng])=>wgs84ToLambert72(lat,lng));
  const buildingWidthM=buildingWidthFromPolygon(lamPts);

  // Nokrichting via langste zijde (zelfde methode als computeBuildingRidge)
  // PCA faalt op L-vormige GRB-polygonen → dominant edge is robuuster
  const ridgeAngleDeg=computeBuildingRidge(bc); // bc = Leaflet [lat,lng] coords
  console.info(`[ZonneDak] Dominant-edge nokrichting=${ridgeAngleDeg.toFixed(1)}° breedte=${buildingWidthM.toFixed(1)}m`);

  const faces=computeRoofFaces(dsmR.data,dtmR.data,dsmR.w,dsmR.h,cell,bldRasterPts,buildingWidthM,ridgeAngleDeg);

  if(!faces||faces.length===0){
    const flatFace={orientation:"Z",slope:3,avgH:+avgRelH.toFixed(1),pct:100,n:aboveRoof,
            slopeStd:1,confidence:0.6,status:"auto",isFlatRoof:true,maxRelH:+maxRelH.toFixed(2)};
    return[flatFace];
  }
  return faces.map(f=>({...f,ridgeAngleDeg}));
}

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

function polyAreaLambert72(lc){
  const pts=lc.map(([lat,lng])=>wgs84ToLambert72(lat,lng));
  const n=pts.length;let area=0;
  for(let i=0,j=n-1;i<n;j=i++){
    const[xi,yi]=pts[i],[xj,yj]=pts[j];
    area+=xi*yj-xj*yi;
  }
  return Math.abs(area/2);
}
function polyAreaM2(lc){return polyAreaLambert72(lc);}

function compute3dArea(area2d,slopeDeg){
  if(!slopeDeg||slopeDeg<=0) return area2d;
  return area2d/Math.cos(slopeDeg*Math.PI/180);
}
const SLOPE_FACTOR={0:1.000,10:1.015,15:1.035,20:1.064,25:1.103,30:1.155,35:1.221,40:1.305,45:1.414,50:1.556,55:1.743,60:2.000};
function getSlopeFactor(deg){
  const k=Object.keys(SLOPE_FACTOR).map(Number).reduce((a,b)=>Math.abs(b-deg)<Math.abs(a-deg)?b:a);
  return SLOPE_FACTOR[k];
}

function makeFacePoly(buildingCoords, orientation, ridgeAngleDeg){
  if(!buildingCoords||buildingCoords.length<3) return buildingCoords;
  const asp=(ASP_MAP[orientation]||0)*Math.PI/180;
  const eE=Math.sin(asp),eN=Math.cos(asp);
  const cLat=buildingCoords.reduce((s,p)=>s+p[0],0)/buildingCoords.length;
  const cLng=buildingCoords.reduce((s,p)=>s+p[1],0)/buildingCoords.length;
  const dot=([la,ln])=>(ln-cLng)*eE+(la-cLat)*eN;
  const poly=[];
  for(let i=0;i<buildingCoords.length;i++){
    const a=buildingCoords[i],b=buildingCoords[(i+1)%buildingCoords.length];
    const da=dot(a),db=dot(b);
    if(da>=0) poly.push(a);
    if((da>=0)!==(db>=0)){
      const t=da/(da-db);
      poly.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);
    }
  }
  return poly.length>=3?poly:buildingCoords;
}
function convexHullPts(pts){
  if(pts.length<3) return pts;
  let start=0;
  for(let i=1;i<pts.length;i++) if(pts[i][0]<pts[start][0]) start=i;
  const hull=[];let cur=start;
  do{
    hull.push(pts[cur]);
    let nxt=(cur+1)%pts.length;
    for(let i=0;i<pts.length;i++){
      const cx=(pts[nxt][0]-pts[cur][0])*(pts[i][1]-pts[cur][1])
              -(pts[nxt][1]-pts[cur][1])*(pts[i][0]-pts[cur][0]);
      if(cx<0) nxt=i;
    }
    cur=nxt;
  }while(cur!==start&&hull.length<=pts.length);
  return hull;
}

function geoToLeaflet(ring){return ring.map(([lo,la])=>[la,lo]);}

async function fetchGRBBuilding(lat,lng){
  const d=0.0012,p=new URLSearchParams({SERVICE:"WFS",VERSION:"2.0.0",REQUEST:"GetFeature",TYPENAMES:"GRB:GBG",OUTPUTFORMAT:"application/json",SRSNAME:"EPSG:4326",BBOX:`${lng-d},${lat-d},${lng+d},${lat+d},EPSG:4326`,COUNT:"30"});
  const r=await fetch(`${GRB_WFS}?${p}`);if(!r.ok) throw new Error(`GRB HTTP ${r.status}`);return r.json();
}
function findAllBuildings(geojson, clickLat, clickLng){
  // Geeft alleen gebouwen terug die DICHTBIJ de geklikte locatie liggen
  // Max afstand: 80m (voorkomt buren op aangrenzende percelen)
  // Max aantal: 6 (woning + garage + tuinhuis + eventuele aanbouwen)
  if(!geojson?.features?.length) return [];
  const MAX_DIST_DEG=0.0008; // ≈80m
  const MAX_COUNT=6;

  const MLAT=111320;
  const MLNG=111320*Math.cos((clickLat||51)*Math.PI/180);

  const out=[];
  for(const f of geojson.features){
    if(!f.geometry?.coordinates) continue;
    const rings=f.geometry.type==="Polygon"
      ?[f.geometry.coordinates[0]]
      :f.geometry.coordinates.map(p=>p[0]);
    for(const ring of rings){
      const lc=geoToLeaflet(ring);
      if(lc.length<3) continue;
      const area=Math.round(polyAreaLambert72(lc));
      if(area<8) continue; // slivers negeren

      // Centroïde van gebouw
      const cLat=lc.reduce((s,p)=>s+p[0],0)/lc.length;
      const cLng=lc.reduce((s,p)=>s+p[1],0)/lc.length;

      // Afstand tot klikpunt in meters
      const distM=Math.sqrt(
        ((cLat-(clickLat||cLat))*MLAT)**2+
        ((cLng-(clickLng||cLng))*MLNG)**2
      );

      // Sla naburige gebouwen op >80m over
      if(clickLat&&distM>80) continue;

      // Auto-label: rank op afstand én oppervlakte
      // Dichtstbijzijnde grote gebouw = Woning, rest afhankelijk van grootte
      const label=area>120?"Woning":area>50?"Garage/bijgebouw":area>20?"Tuinhuis/schuur":"Klein gebouw";

      out.push({id:`grb-${out.length}`,coords:lc,area,label,selected:false,
        dhmStatus:"idle",dhmError:"",ridgeAngleDeg:0,
        faces:null,selFaceIdx:0,
        panelCount:10,panelOrient:"portrait",panelRotOffset:0,
        daktype:"auto",
        _distM:distM, // tijdelijk voor sortering
      });
    }
  }

  // Sorteer: eerst op afstand tot klikpunt, dan op oppervlakte
  out.sort((a,b)=>{
    // Primair: afstand (dichtst bij = eerst)
    const distDiff=a._distM-b._distM;
    if(Math.abs(distDiff)>20) return distDiff; // >20m verschil = afstand wint
    return b.area-a.area; // zelfde buurt: grootste eerst
  });

  // Hernoem het eerste (dichtstbijzijnde/grootste) gebouw altijd "Woning"
  if(out.length>0) out[0].label="Woning";

  // Verwijder tijdelijk sorteerveld
  out.forEach(b=>delete b._distM);

  return out.slice(0,MAX_COUNT);
}

// Berekent nokrichting voor een gebouw polygon via Minimum Bounding Rectangle (MBR).
// MBR = kleinste omsluitende rechthoek → lange as = nokrichting.
// Dit is de meest robuuste methode voor alle polygoonvormen (rechthoek, L, T, U).
// Algoritme: voor elke polygoonzijde als basisrichting → bereken omsluitende rechthoek →
// kies de basisrichting die de kleinste rechthoek geeft (rotating calipers principle).
function computeBuildingRidge(coords){
  if(!coords||coords.length<2) return 0;
  const pts=coords.map(([la,ln])=>wgs84ToLambert72(la,ln));
  const n=pts.length;

  let bestAz=0, bestArea=Infinity;

  for(let i=0;i<n;i++){
    const a=pts[i],b=pts[(i+1)%n];
    const edgeDx=b[0]-a[0], edgeDy=b[1]-a[1];
    const edgeLen=Math.sqrt(edgeDx*edgeDx+edgeDy*edgeDy);
    if(edgeLen<0.3) continue;

    // Richtingsunitvector langs de zijde
    const ux=edgeDx/edgeLen, uy=edgeDy/edgeLen;
    // Loodrecht
    const px=-uy, py=ux;

    // Projecteer alle punten op beide assen
    let minU=Infinity,maxU=-Infinity,minP=Infinity,maxP=-Infinity;
    for(const [x,y] of pts){
      const u=x*ux+y*uy, p=x*px+y*py;
      if(u<minU)minU=u; if(u>maxU)maxU=u;
      if(p<minP)minP=p; if(p>maxP)maxP=p;
    }

    const dimU=maxU-minU, dimP=maxP-minP;
    const area=dimU*dimP;

    if(area<bestArea){
      bestArea=area;
      // Azimut van de LANGE as van de MBR = nokrichting
      // ux,uy = richting van de zijde. Als dimU > dimP: zijde-richting is de lange as
      const edgeAz=((90-Math.atan2(edgeDy,edgeDx)*180/Math.PI)+360)%180;
      bestAz=dimU>=dimP ? edgeAz : (edgeAz+90)%180;
    }
  }

  return bestAz;
}

// Past daktype-override toe op de faces van een gebouw
function applyDaktypeOverride(building,daktype){
  if(daktype==="auto"||!building.faces) return building.faces;
  const coords=building.coords;
  const ridge=building.ridgeAngleDeg||computeBuildingRidge(coords);
  const slope=building.faces?.[0]?.slope||30;
  const avgH=building.faces?.[0]?.avgH||5;

  if(daktype==="platdak"){
    return [{orientation:"Z",slope:3,avgH,pct:100,status:"manual",daktype:"platdak",
             polygon:coords,confidence:1,slopeStd:0,n:100}];
  }
  if(daktype==="lessenaarsdak"){
    // Oriëntatie = helling in 1 richting (huidige oriëntatie behouden)
    const or=building.faces?.[0]?.orientation||"Z";
    return [{orientation:or,slope,avgH,pct:100,status:"manual",daktype:"lessenaarsdak",
             polygon:coords,confidence:1,slopeStd:0,n:100,ridgeAngleDeg:ridge}];
  }
  if(daktype==="zadeldak"){
    // Splits langs noklijn in Lambert72 — met gecentreerde splitlijn (midpoint van loodrechte uitstrekking)
    const coordsM=coords.map(([la,ln])=>wgs84ToLambert72(la,ln));
    const cMx=coordsM.reduce((s,p)=>s+p[0],0)/coordsM.length;
    const cMy=coordsM.reduce((s,p)=>s+p[1],0)/coordsM.length;
    const ridgeRad=ridge*Math.PI/180;
    const rDx=Math.sin(ridgeRad), rDy=Math.cos(ridgeRad);
    // Centreer de splitlijn op het geometrische midden van de breedte
    const perps=coordsM.map(([x,y])=>(x-cMx)*rDy-(y-cMy)*rDx);
    const splitOffset=(Math.min(...perps)+Math.max(...perps))/2;
    const sideM=(mx,my)=>(mx-cMx)*rDy-(my-cMy)*rDx>=splitOffset?0:1;
    const polys=[[],[]];
    const n=coords.length;
    for(let i=0;i<n;i++){
      const aM=coordsM[i],bM=coordsM[(i+1)%n];
      const sA=sideM(aM[0],aM[1]),sB=sideM(bM[0],bM[1]);
      polys[sA].push(coords[i]);
      if(sA!==sB){
        const dxE=bM[0]-aM[0],dyN=bM[1]-aM[1];
        const denom=dxE*rDy-dyN*rDx;
        if(Math.abs(denom)>1e-9){
          const t=(splitOffset-(aM[0]-cMx)*rDy+(aM[1]-cMy)*rDx)/denom;
          if(t>1e-6&&t<1-1e-6){
            const cutLat=coords[i][0]+t*(coords[(i+1)%n][0]-coords[i][0]);
            const cutLng=coords[i][1]+t*(coords[(i+1)%n][1]-coords[i][1]);
            polys[sA].push([cutLat,cutLng]);
            polys[sB].push([cutLat,cutLng]);
          }
        }
      }
    }
    const rightAsp=((ridge+90)%360+360)%360;
    const leftAsp=((ridge-90)%360+360)%360;
    const makeF=(pol,asp,pct)=>({
      orientation:DIRS8[Math.round(asp/45)%8],slope,avgH,pct,
      status:"manual",daktype:"zadeldak",polygon:pol.length>=3?pol:coords,
      confidence:1,slopeStd:0,n:Math.round(pct),ridgeAngleDeg:ridge,aspectDeg:asp
    });
    const a0=polyAreaM2(polys[0]||[]),a1=polyAreaM2(polys[1]||[]);
    const tot=a0+a1||1;
    return [makeF(polys[0],rightAsp,Math.round(a0/tot*100)),makeF(polys[1],leftAsp,Math.round(a1/tot*100))];
  }
  if(daktype==="schilddak"){
    // 4 driehoeken vanuit centroïde
    const cLat=coords.reduce((s,p)=>s+p[0],0)/coords.length;
    const cLng=coords.reduce((s,p)=>s+p[1],0)/coords.length;
    const n=coords.length;
    const triangles=[[],[],[],[]]; // N,O,Z,W
    for(let i=0;i<n;i++){
      const a=coords[i],b=coords[(i+1)%n];
      const eLat=(a[0]+b[0])/2-cLat,eLng=(a[1]+b[1])/2-cLng;
      const eAsp=((Math.atan2(eLng,eLat)*180/Math.PI)+360)%360;
      // N=0°,O=90°,Z=180°,W=270° — kies dichtstbijzijnde kwadrant
      const qi=Math.round(eAsp/90)%4;
      triangles[qi].push(a,b,[cLat,cLng]);
    }
    const dirs=["N","O","Z","W"];
    const asps=[0,90,180,270];
    return triangles.map((tri,i)=>({
      orientation:dirs[i],slope,avgH,pct:25,
      status:"manual",daktype:"schilddak",
      polygon:tri.length>=3?tri:coords,
      confidence:1,slopeStd:0,n:25,ridgeAngleDeg:ridge,aspectDeg:asps[i]
    })).filter(f=>f.polygon.length>=3);
  }
  return building.faces;
}

function findBuilding(geojson,lat,lng){
  if(!geojson?.features?.length) return null;
  const cands=[];
  for(const f of geojson.features){
    if(!f.geometry?.coordinates) continue;
    const rings=f.geometry.type==="Polygon"?[f.geometry.coordinates[0]]:f.geometry.coordinates.map(p=>p[0]);
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

async function searchTeamleaderContact(name,token){
  const r=await fetch("https://api.teamleader.eu/contacts.list",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
    body:JSON.stringify({filter:{term:name},page:{size:5}})
  });
  if(!r.ok) throw new Error(`TL ${r.status}`);
  const d=await r.json();return d.data||[];
}

function loadScript(src){
  return new Promise((res,rej)=>{
    if(document.querySelector(`script[src="${src}"]`)){setTimeout(res,200);return;}
    const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);
  });
}
async function loadPdfLibs(){
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
  await loadScript("https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js");
}
async function fetchPdfBytes(path){
  try{const r=await fetch(path);if(!r.ok) throw new Error(`HTTP ${r.status}`);return new Uint8Array(await r.arrayBuffer());}
  catch(e){console.warn("Datasheet niet geladen:",path,e.message);return null;}
}

const DS_BASE = import.meta.env.BASE_URL + "datasheets/";

const DEFAULT_PANELS=[
  {id:1,brand:"Qcells",      model:"Q.TRON BLK S-G3R.12+ 440W",   watt:440,area:1.998,eff:22.0,price:0,warranty:25,
   voc:38.74,vmp:32.66,isc:14.42,imp:13.47,tempCoeffVoc:-0.24,tempCoeffPmax:-0.30,
   dims:"1762×1134×30mm",weight:"20.9 kg",datasheet:"qcells-440w.pdf"},
  {id:2,brand:"Trina Solar", model:"Vertex S+ TSM-NEG18RC.27 500W",watt:500,area:2.224,eff:22.3,price:0,warranty:30,
   voc:45.4,vmp:38.0,isc:13.92,imp:13.16,tempCoeffVoc:-0.25,tempCoeffPmax:-0.30,
   dims:"1961×1134×30mm",weight:"23.6 kg",datasheet:"trina-500w.pdf"},
  {id:3,brand:"Jinko Solar", model:"Tiger Neo N-Type 420W",   watt:420,area:1.722,eff:21.8,price:0,warranty:25,
   voc:37.39,vmp:31.41,isc:14.02,imp:13.38,tempCoeffVoc:-0.25,tempCoeffPmax:-0.29,
   dims:"1722×1134×30mm",weight:"21.3 kg",datasheet:null},
  {id:4,brand:"LONGi Solar", model:"Hi-MO 6 Explorer 415W",   watt:415,area:1.722,eff:21.3,price:0,warranty:25,
   voc:37.55,vmp:31.42,isc:13.95,imp:13.21,tempCoeffVoc:-0.27,tempCoeffPmax:-0.34,
   dims:"1722×1134×30mm",weight:"21.3 kg",datasheet:null},
  {id:5,brand:"Canadian Solar",model:"HiHero 430W",           watt:430,area:1.879,eff:22.8,price:0,warranty:25,
   voc:39.4,vmp:33.0,isc:13.92,imp:13.04,tempCoeffVoc:-0.26,tempCoeffPmax:-0.29,
   dims:"1756×1096×35mm",weight:"21.3 kg",datasheet:null},
];

const DEFAULT_INVERTERS=[
  {id:1,brand:"AlphaESS",model:"SMILE-G3-S3.6",fase:"1-fase",kw:3.68,mppt:2,maxPv:7360, eff:97.0,price:0,warranty:10,
   mpptCount:2,maxDcVoltage:580,maxInputCurrentPerMppt:16,mpptVoltageMin:90,mpptVoltageMax:560,
   maxAcPower:3680,maxDcPower:7360,
   dims:"610×212×366mm",weight:"19.5 kg",
   notes:"3,68kW · max 7,36kWp PV · 2 MPPT · UPS backup · IP65 · C10/11 · Jabba.",
   datasheet:"alphaess-smile-g3.pdf"},
  {id:2,brand:"AlphaESS",model:"SMILE-G3-S5",  fase:"1-fase",kw:5.0, mppt:2,maxPv:10000,eff:97.0,price:0,warranty:10,
   mpptCount:2,maxDcVoltage:600,maxInputCurrentPerMppt:16,mpptVoltageMin:90,mpptVoltageMax:560,
   maxAcPower:5000,maxDcPower:10000,
   dims:"610×212×366mm",weight:"19.5 kg",
   notes:"5kW · max 10kWp PV · 2 MPPT · UPS backup · IP65 · C10/11 · Jabba. Populairste model.",
   datasheet:"alphaess-smile-g3.pdf"},
  {id:3,brand:"AlphaESS",model:"SMILE-G3-S8",  fase:"1-fase",kw:8.0, mppt:2,maxPv:16000,eff:97.5,price:0,warranty:10,
   mpptCount:2,maxDcVoltage:600,maxInputCurrentPerMppt:20,mpptVoltageMin:90,mpptVoltageMax:560,
   maxAcPower:8000,maxDcPower:16000,
   dims:"610×212×366mm",weight:"22 kg",
   notes:"8kW · max 16kWp · display · EV-laders · IP65.",datasheet:"alphaess-smile-g3.pdf"},
  {id:4,brand:"AlphaESS",model:"SMILE-G3-T4/6/8/10",fase:"3-fase",kw:10.0,mppt:3,maxPv:20000,eff:97.5,price:0,warranty:10,
   mpptCount:3,maxDcVoltage:1000,maxInputCurrentPerMppt:16,mpptVoltageMin:160,mpptVoltageMax:850,
   maxAcPower:10000,maxDcPower:20000,
   dims:"610×212×366mm",weight:"25 kg",
   notes:"Driefase hybride · 3 MPPT · 150% overbelasting · max 45,6 kWh.",datasheet:"alphaess-smile-g3.pdf"},
  {id:5,brand:"AlphaESS",model:"SMILE-G3-T15/20", fase:"3-fase",kw:20.0,mppt:3,maxPv:40000,eff:97.6,price:0,warranty:10,
   mpptCount:3,maxDcVoltage:1000,maxInputCurrentPerMppt:32,mpptVoltageMin:200,mpptVoltageMax:850,
   maxAcPower:20000,maxDcPower:40000,
   dims:"610×212×366mm",weight:"30 kg",
   notes:"15-20kW driefase voor grote woningen of KMO.",datasheet:"alphaess-smile-g3.pdf"},
];
const DEFAULT_BATTERIES=[
  {id:1,brand:"AlphaESS",model:"BAT-G3-3.8S",               kwh:3.8, price:0,cycles:10000,warranty:10,dod:95,notes:"Serieel, indoor IP21. Tot 4× (15,2 kWh).",isAlpha:true},
  {id:2,brand:"AlphaESS",model:"BAT-G3-9.3S",               kwh:9.3, price:0,cycles:10000,warranty:10,dod:95,notes:"Hoogspanning IP65 outdoor. Verwarming. Tot 4× (37,2 kWh).",isAlpha:true},
  {id:3,brand:"AlphaESS",model:"BAT-G3-10.1P",              kwh:10.1,price:0,cycles:10000,warranty:10,dod:95,notes:"Parallel tot 6× (60,5 kWh). Outdoor IP65.",isAlpha:true},
  {id:4,brand:"AlphaESS",model:"G3-S5 + 10.1 kWh (pakket)", kwh:10.1,price:0,cycles:10000,warranty:10,dod:95,notes:"SMILE-G3-S5 + 1× BAT-G3-10.1P.",isAlpha:true},
  {id:5,brand:"AlphaESS",model:"G3-S5 + 20.2 kWh (pakket)", kwh:20.2,price:0,cycles:10000,warranty:10,dod:95,notes:"SMILE-G3-S5 + 2× BAT-G3-10.1P.",isAlpha:true},
  {id:6,brand:"Tesla",   model:"Powerwall 3",                kwh:13.5,price:0,cycles:4000, warranty:10,dod:100,notes:"Geïntegreerde omvormer. Volledig huis backup.",isAlpha:false},
  {id:7,brand:"SolarEdge",model:"Home Battery 10kWh",        kwh:10.0,price:0,cycles:6000, warranty:10,dod:100,notes:"Vereist SolarEdge omvormer.",isAlpha:false},
  {id:8,brand:"BYD",     model:"Battery-Box HVS 10.2",       kwh:10.2,price:0,cycles:8000, warranty:10,dod:100,notes:"Hoogspanning modulaire opbouw.",isAlpha:false},
];


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
.header-text h1{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:var(--text);}
.header-text p{font-size:10px;color:var(--muted);margin-top:1px;}
.badge{margin-left:auto;padding:3px 8px;border:1px solid var(--border-dark);border-radius:4px;font-size:8px;color:var(--amber);letter-spacing:1px;text-transform:uppercase;white-space:nowrap;background:var(--amber-light);}
.tabs{display:flex;background:var(--bg2);border-bottom:1px solid var(--border);overflow-x:auto;}
.tab{padding:10px 16px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.5px;color:var(--muted);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap;flex-shrink:0;}
.tab.active{color:var(--amber);border-bottom-color:var(--amber);}
.tab:hover:not(.active){color:var(--text);}
.main{display:grid;grid-template-columns:340px 1fr;height:calc(100vh - 93px);}
.sidebar{background:var(--bg2);border-right:1px solid var(--border);padding:14px;display:flex;flex-direction:column;gap:13px;overflow-y:auto;box-shadow:var(--shadow);}
.content-area{display:flex;flex-direction:column;overflow-y:auto;background:var(--bg);}
.sl{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--amber);margin-bottom:7px;display:flex;align-items:center;gap:8px;font-weight:600;}
.sl::after{content:'';flex:1;height:1px;background:var(--border);}
.inp{width:100%;padding:9px 11px;background:var(--bg3);border:1px solid var(--border-dark);border-radius:6px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-size:13px;outline:none;transition:all .2s;}
.inp:focus{border-color:var(--amber);box-shadow:0 0 0 3px var(--amber-glow);}
.inp::placeholder{color:var(--muted2);}
.inp-label{font-size:12px;color:var(--muted);margin-bottom:3px;font-weight:500;}
.inp-2{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
.inp-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;}
.sugg-wrap{position:relative;}
.sugg{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--bg2);border:1px solid var(--border-dark);border-radius:6px;z-index:9999;max-height:180px;overflow-y:auto;box-shadow:var(--shadow-md);}
.sugg-item{padding:10px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s;line-height:1.4;}
.sugg-item:hover,.sugg-item:active{background:var(--amber-light);color:var(--amber);}
.btn{padding:9px 14px;background:var(--amber);border:none;border-radius:6px;color:#fff;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:500;letter-spacing:.5px;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:5px;box-shadow:var(--shadow);}
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
.sl-item label{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:4px;}
.sl-item label span{color:var(--amber);font-weight:500;}
.sl-item input[type=range]{width:100%;appearance:none;height:4px;background:var(--bg4);border-radius:2px;outline:none;cursor:pointer;}
.sl-item input[type=range]::-webkit-slider-thumb{appearance:none;width:14px;height:14px;background:var(--amber);border-radius:50%;cursor:pointer;box-shadow:var(--shadow);}
.orient-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}
.orient-btn{padding:7px 3px;background:var(--bg3);border:1px solid var(--border-dark);border-radius:5px;color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:11px;cursor:pointer;text-align:center;transition:all .15s;position:relative;}
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
.card-name{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;margin-bottom:2px;color:var(--text);}
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
.toggle-lbl{font-size:11px;color:var(--text);}
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
.info-box{font-size:12px;color:var(--muted);line-height:1.7;padding:10px 13px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;}
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
.compare-col h4{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;margin-bottom:8px;color:var(--text);}
.crow{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:4px;}
.crow span{color:var(--text);font-weight:500;}
.ctotal{margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:baseline;font-size:11px;}
.cval{font-family:'Syne',sans-serif;font-size:19px;font-weight:800;color:var(--amber);}
.compare-col.batt .cval{color:var(--blue);}
.compare-col.alpha-col .cval{color:var(--alpha);}
.pbar{height:6px;background:var(--bg4);border-radius:3px;overflow:hidden;margin-top:7px;}
.pfill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--green),var(--amber));transition:width .8s;}
.ai-box{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:13px;line-height:1.8;color:var(--text);white-space:pre-wrap;box-shadow:var(--shadow);}
.ai-box.loading{display:flex;align-items:center;gap:10px;color:var(--muted);}
.spinner{width:12px;height:12px;border:2px solid var(--border);border-top-color:var(--amber);border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0;}
.spinner.cyan{border-top-color:var(--alpha);}
.spinner.blue{border-top-color:var(--blue);}
@keyframes spin{to{transform:rotate(360deg);}}
.dhm-bar{height:3px;background:var(--bg4);border-radius:2px;overflow:hidden;margin-top:4px;}
.dhm-bar-fill{height:100%;width:40%;background:linear-gradient(90deg,var(--alpha),var(--blue));border-radius:2px;animation:dhm-ani 1.5s ease-in-out infinite;}
@keyframes dhm-ani{0%{margin-left:0;width:30%}50%{margin-left:40%;width:50%}100%{margin-left:100%;width:0%}}
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
.section{padding:14px 18px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;}
.list{display:flex;flex-direction:column;gap:7px;}
.new-form{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:13px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--shadow);}
.new-form h4{font-family:'Syne',sans-serif;font-size:11px;font-weight:700;color:var(--text);}
.results-wrap{padding:14px 18px;display:flex;flex-direction:column;gap:12px;}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:50px 20px;gap:10px;color:var(--muted);text-align:center;}
.empty-state .icon{font-size:36px;}
.empty-state p{font-size:11px;max-width:280px;line-height:1.6;color:var(--muted);}
.filter-row{display:flex;gap:5px;flex-wrap:wrap;}
.filter-btn{padding:5px 11px;background:var(--bg2);border:1px solid var(--border-dark);border-radius:12px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);cursor:pointer;transition:all .15s;}
.filter-btn.active{border-color:var(--alpha);color:var(--alpha);background:var(--alpha-bg);}
.filter-btn.af.active{border-color:var(--amber);color:var(--amber);background:var(--amber-light);}
.inv-card{background:var(--bg2);border:1px solid var(--alpha-border);border-radius:8px;padding:10px;cursor:pointer;transition:all .2s;position:relative;box-shadow:var(--shadow);}
.inv-card:hover{border-color:var(--alpha);box-shadow:var(--shadow-md);}
.inv-card.selected{border-color:var(--alpha);background:var(--alpha-bg);box-shadow:var(--shadow-md);}
.inv-card.selected::before{content:'✓';position:absolute;top:7px;right:9px;color:var(--alpha);font-size:11px;font-weight:bold;}
.monthly-chart{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;box-shadow:var(--shadow);}
.customer-section{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:13px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px;}
.tl-result{padding:7px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;cursor:pointer;transition:background .15s;font-size:10px;}
.tl-result:hover{background:var(--amber-light);border-color:var(--amber);}
.tl-result.selected{background:var(--amber-light);border-color:var(--amber);}
.chart-bar{transition:all .3s;}
.chart-bar:hover{opacity:.8;}
`;


const ASP_MAP={N:0,NO:45,O:90,ZO:135,Z:180,ZW:225,W:270,NW:315};

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
      for(let t=0.05;t<1;t+=0.05){
        const lat=c[0]+t*(nx[0]-c[0]),lng=c[1]+t*(nx[1]-c[1]);
        if(inSec(lat,lng)!==cIn){result.push([lat,lng]);break;}
      }
    }
  }
  return result.length>=2?[[cLat,cLng],...result]:null;
}

function generateFacePolygons(lc, faces, ridgeAngleDeg){
  if(!lc||!faces||!faces.length) return faces.map(f=>({...f,polygon:lc}));
  if(faces.length===1){ return [{...faces[0],polygon:lc}]; }

  if(faces.length===2){
    // ── Split in Lambert72 (meter) ─────────────────────────────────────
    const lcM=lc.map(([la,ln])=>wgs84ToLambert72(la,ln));

    // Nokrichting als richtingsvector
    const ridgeRad=(ridgeAngleDeg||0)*Math.PI/180;
    const rDx=Math.sin(ridgeRad);  // Oost-component
    const rDy=Math.cos(ridgeRad);  // Noord-component

    // ── Centrer de splitlijn op het geometrische midden ──────────────
    // Gebruik niet het vertex-zwaartepunt (= scheef bij L-vormige gebouwen),
    // maar het MIDDELPUNT VAN DE LOODRECHTE UITSTREKKING:
    //   perp_i = component loodrecht op de nok voor elk hoekpunt
    //   splitOffset = (min(perp_i) + max(perp_i)) / 2
    // Dit plaatst de nok exact in het midden van de breedte, ongeacht de vorm.
    const cMx=lcM.reduce((s,p)=>s+p[0],0)/lcM.length;
    const cMy=lcM.reduce((s,p)=>s+p[1],0)/lcM.length;

    // Loodrechte component van elk punt t.o.v. het vertex-zwaartepunt
    const perps=lcM.map(([x,y])=>(x-cMx)*rDy-(y-cMy)*rDx);
    const perpMin=Math.min(...perps),perpMax=Math.max(...perps);
    const splitOffset=(perpMin+perpMax)/2; // verschuiving van het vertex-zwaartepunt

    // Zijde-functie: welke kant van de gecentreerde splitlijn?
    const sideM=(mx,my)=>(mx-cMx)*rDy-(my-cMy)*rDx>=splitOffset?0:1;

    const polysM=[[],[]];
    const nm=lcM.length;
    for(let i=0;i<nm;i++){
      const aM=lcM[i], bM=lcM[(i+1)%nm];
      const sA=sideM(aM[0],aM[1]), sB=sideM(bM[0],bM[1]);
      polysM[sA].push(lc[i]);
      if(sA!==sB){
        // Snijpunt: (aM + t*(bM-aM)) · perp = splitOffset (in relatieve coördinaten)
        const dxE=bM[0]-aM[0], dyN=bM[1]-aM[1];
        const denom=dxE*rDy-dyN*rDx;
        if(Math.abs(denom)>1e-9){
          const t=(splitOffset-(aM[0]-cMx)*rDy+(aM[1]-cMy)*rDx)/denom;
          if(t>1e-6&&t<1-1e-6){
            const cutLat=lc[i][0]+t*(lc[(i+1)%nm][0]-lc[i][0]);
            const cutLng=lc[i][1]+t*(lc[(i+1)%nm][1]-lc[i][1]);
            polysM[sA].push([cutLat,cutLng]);
            polysM[sB].push([cutLat,cutLng]);
          }
        }
      }
    }

    if(polysM[0].length<3||polysM[1].length<3){
      return faces.map(f=>({...f,polygon:lc}));
    }

    const areaM=poly=>{
      const pts=poly.map(([la,ln])=>wgs84ToLambert72(la,ln));
      let s=0;
      for(let i=0;i<pts.length;i++){
        const[x1,y1]=pts[i],[x2,y2]=pts[(i+1)%pts.length];
        s+=x1*y2-x2*y1;
      }
      return Math.abs(s)/2;
    };
    const a0=areaM(polysM[0]),a1=areaM(polysM[1]);
    const sortedPolys=a0>=a1?[polysM[0],polysM[1]]:[polysM[1],polysM[0]];
    return faces.map((f,fi)=>({...f,polygon:sortedPolys[fi]}));
  }

  // ── 3+ vlakken: schilddak ──────────────────────────────────────────
  const lats=lc.map(p=>p[0]),lngs=lc.map(p=>p[1]);
  const cLat=(Math.min(...lats)+Math.max(...lats))/2;
  const cLng=(Math.min(...lngs)+Math.max(...lngs))/2;
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



function drawFacePolygons(map,L,faces,selFaceIdx,onSelect,editMode,_unused,onVertexDrag,onVertexDragEnd,parentGroup){
  if(!faces||!faces.length) return null;
  const g=parentGroup||L.layerGroup();
  faces.forEach((f,fi)=>{
    if(!f.polygon||f.polygon.length<3) return;
    const q=ZONE_Q[f.orientation]||ZONE_Q.Z;
    const isGood=BEST_SOUTH[f.orientation]!==false;
    const color=isGood?q[0].c:q[1].c;
    const isSel=fi===selFaceIdx;
    const facePoly=L.polygon(f.polygon,{
      color:isSel?(editMode?"#f59e0b":"#1e293b"):color,
      fillColor:editMode&&isSel?"#f59e0b":color,
      fillOpacity:editMode?(isSel?0.45:0):isSel?0.65:0.35,
      weight:editMode?(isSel?3:1.5):isSel?2.5:1.5,
      opacity:0.9,
    })
    .bindTooltip(`<b>${fi+1}. ${f.orientation} · ${f.slope}°</b><br>${(q[isGood?0:1]||{l:''}).l}<br>${f.pct}% van dak`,{sticky:true,direction:"top"})
    .on("click",()=>onSelect(fi))
    .addTo(g);
    const pLats=f.polygon.map(p=>p[0]),pLngs=f.polygon.map(p=>p[1]);
    const pCLat=(Math.min(...pLats)+Math.max(...pLats))/2;
    const pCLng=(Math.min(...pLngs)+Math.max(...pLngs))/2;
    L.marker([pCLat,pCLng],{icon:L.divIcon({
      html:`<div style="width:26px;height:26px;background:${color};border:${isSel?"3px solid #1e293b":"2px solid rgba(255,255,255,.8)"};border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:12px;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);user-select:none">${fi+1}</div>`,
      iconSize:[26,26],iconAnchor:[13,13],className:""
    })}).on("click",()=>onSelect(fi)).addTo(g);
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
            const nearClose=f.polygon.some((other,oi)=>oi!==vi&&distPts([ll.lat,ll.lng],other)<0.5);
            marker.setStyle({fillColor:nearClose?"#dc2626":"#f59e0b"});
            if(onVertexDrag) onVertexDrag(fi,vi,[ll.lat,ll.lng]);
          };
          const onUp=function(){
            map.off("mousemove",onMove);
            map.off("mouseup",onUp);
            map.dragging.enable();
            map.getContainer().style.cursor="";
            marker.setStyle({fillColor:"#f59e0b"});
            const curLL2=marker.getLatLng();
            const curPt2=[curLL2.lat,curLL2.lng];
            const livePts2=liveLatLngs.map(ll=>Array.isArray(ll)?ll:[ll.lat,ll.lng]);
            let didMerge=false;
            if(livePts2.length>3){
              const n3=livePts2.length;
              for(const ni of[(vi+1)%n3,(vi-1+n3)%n3]){
                const other=livePts2[ni];
                const otherPt=Array.isArray(other)?other:[other.lat,other.lng];
                if(distPts(curPt2,otherPt)<0.5){
                  const avg=[(curPt2[0]+otherPt[0])/2,(curPt2[1]+otherPt[1])/2];
                  livePts2.splice(Math.max(vi,ni),1);
                  livePts2[Math.min(vi,ni)]=avg;
                  didMerge=true;
                  console.info("[ZonneDak] Punten samengevoegd op <0.5m");
                  break;
                }
              }
            }
            if(didMerge&&onVertexDrag){
              livePts2.forEach((pt,idx)=>{const p=Array.isArray(pt)?pt:[pt.lat,pt.lng];onVertexDrag(fi,idx,p);});
            }
            if(onVertexDragEnd) onVertexDragEnd(fi,vi);
          };
          map.on("mousemove",onMove);
          map.on("mouseup",onUp);
        });
      });
    }
  });
  if(!parentGroup) g.addTo(map); // alleen toevoegen als er geen parentGroup is
  return g;
}

function drawFaceSectors(map,L,lc,faces,selFaceIdx,onSelect){
  return drawFacePolygons(map,L,faces,selFaceIdx,onSelect,false,-1,null,null);
}

function drawRealRoof(map,L,lc,orientation){
  const g=L.layerGroup();
  L.polygon(lc,{color:"#e07b00",fillOpacity:0,weight:2.5,dashArray:"6,3"}).addTo(g);
  const mLat=111320,cLat0=lc.reduce((s,p)=>s+p[0],0)/lc.length;
  const mLng=111320*Math.cos(cLat0*Math.PI/180);
  const pts=lc.map(([la,ln])=>[(ln-lc.reduce((s,p)=>s+p[1],0)/lc.length)*mLng,(la-cLat0)*mLat]);
  let cxx=0,cxy=0,cyy=0;
  const plen=pts.length;
  pts.forEach(([x,y])=>{cxx+=x*x;cxy+=x*y;cyy+=y*y;});
  cxx/=plen;cxy/=plen;cyy/=plen;
  const pcaAng=Math.atan2(2*cxy,cxx-cyy)/2;
  const ridgeDeg=((90-pcaAng*180/Math.PI)+360)%180;
  const rightAsp=((ridgeDeg+90)+360)%360;
  const leftAsp =((ridgeDeg-90)+360)%360;
  const distTo180=a=>Math.abs(((a-180)+540)%360-180);
  const rightIsSouth=distTo180(rightAsp)<distTo180(leftAsp);
  const sAsp=rightIsSouth?rightAsp:leftAsp;
  const nAsp=rightIsSouth?leftAsp:rightAsp;
  const[sQ]=ZONE_Q[orientation]||ZONE_Q.Z;
  const[,nQ]=ZONE_Q[orientation]||ZONE_Q.Z;
  const cLat=lc.reduce((s,p)=>s+p[0],0)/lc.length;
  const cLng=lc.reduce((s,p)=>s+p[1],0)/lc.length;
  const clipSide=(asp)=>{
    const ar=asp*Math.PI/180,eE=Math.sin(ar),eN=Math.cos(ar);
    const dot=([la,ln])=>(ln-cLng)*eE+(la-cLat)*eN;
    const poly=[];
    for(let i=0;i<lc.length;i++){
      const a=lc[i],b=lc[(i+1)%lc.length];
      const da=dot(a),db=dot(b);
      if(da>=0) poly.push(a);
      if((da>=0)!==(db>=0)){const t=da/(da-db);poly.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
    }
    return poly;
  };
  const sP=clipSide(sAsp),nP=clipSide(nAsp);
  if(sP.length>=3) L.polygon(sP,{color:sQ.c,fillColor:sQ.c,fillOpacity:.4,weight:2,opacity:.9})
    .bindTooltip(`<b>Zuidkant · ${Math.round(sAsp)}°</b><br>${sQ.l}`,{sticky:true}).on("click",()=>{}).addTo(g);
  if(nP.length>=3) L.polygon(nP,{color:nQ.c,fillColor:nQ.c,fillOpacity:.4,weight:2,opacity:.9})
    .bindTooltip(`<b>Noordkant · ${Math.round(nAsp)}°</b><br>${nQ.l}`,{sticky:true}).on("click",()=>{}).addTo(g);
  g.addTo(map);return g;
}

function shiftPanels(panels,dLat,dLng){
  return panels.map(p=>({
    corners:p.corners.map(([la,ln])=>[la+dLat,ln+dLng]),
    midLine:p.midLine.map(([la,ln])=>[la+dLat,ln+dLng])
  }));
}

function detectPanelRows(panels,facePoly){
  if(!panels||!panels.length) return panels.map((_,i)=>i);
  const cLat=facePoly.reduce((s,p)=>s+p[0],0)/facePoly.length;
  const cLng=facePoly.reduce((s,p)=>s+p[1],0)/facePoly.length;
  const mLat=111320,mLng=111320*Math.cos(cLat*Math.PI/180);
  const panelCtrM=panels.map(p=>{
    const la=p.corners.reduce((s,c)=>s+c[0],0)/p.corners.length;
    const ln=p.corners.reduce((s,c)=>s+c[1],0)/p.corners.length;
    return[(ln-cLng)*mLng,(la-cLat)*mLat];
  });
  const polyM=facePoly.map(([la,ln])=>[(ln-cLng)*mLng,(la-cLat)*mLat]);
  const cx=polyM.reduce((s,p)=>s+p[0],0)/polyM.length;
  const cy=polyM.reduce((s,p)=>s+p[1],0)/polyM.length;
  let sxx=0,sxy=0,syy=0;
  polyM.forEach(([x,y])=>{const dx=x-cx,dy=y-cy;sxx+=dx*dx;sxy+=dx*dy;syy+=dy*dy;});
  const pcaAng=Math.atan2(2*sxy,sxx-syy)/2;
  const cosA=Math.cos(pcaAng),sinA=Math.sin(pcaAng);
  const rowCoords=panelCtrM.map(([x,y])=>x*cosA+y*sinA);
  const rowKeys=rowCoords.map(r=>Math.round(r/0.5));
  const uniqueRows=[...new Set(rowKeys)].sort((a,b)=>a-b);
  const rowMap=Object.fromEntries(uniqueRows.map((k,i)=>[k,i]));
  return rowKeys.map(k=>rowMap[k]);
}

function drawPanelLayer(map,L,facePoly,count,panel,ridgeAngleDeg,orient,panelDataRef,moveMode){
  let pW,pH;
  const dimMatch=panel.dims&&panel.dims.match(/(\d+)[x×](\d+)/i);
  if(dimMatch){
    const d1=+dimMatch[1]/1000,d2=+dimMatch[2]/1000;
    pH=Math.max(d1,d2);
    pW=Math.min(d1,d2);
  } else {
    const ratio=1.56;pW=Math.sqrt(panel.area/ratio);pH=panel.area/pW;
  }
  let panels=panelDataRef?.current||packPanels(facePoly,pW,pH,count,ridgeAngleDeg||0,orient||"portrait");
  if(panelDataRef) panelDataRef.current=panels;

  const rowOf=detectPanelRows(panels,facePoly);
  const kWp=((panels.length*panel.watt)/1000).toFixed(1);
  const g=L.layerGroup();

  const SEL_COL="#f59e0b",DEF_COL="#2563eb",DEF_BRD="#1e3a5f",SEL_BRD="#92400e";
  const selected=new Set();

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

  // Canvas renderer: L.canvas() tekent polygonen op een <canvas> element
  // ipv SVG — html2canvas kan canvas WEL capturen, SVG NIET.
  const canvasRenderer=L.canvas({padding:0.5});

  panels.forEach((p,i)=>{
    const poly=L.polygon(p.corners,{
      renderer:canvasRenderer,
      color:DEF_BRD,weight:1,fillColor:DEF_COL,fillOpacity:.85
    })
      .bindTooltip("Paneel "+(i+1)+" (rij "+( rowOf[i]+1)+") · "+panel.watt+"W",{direction:"top"})
      .addTo(g);
    polyLayers.push(poly);
    midLayers.push(p.midLine?.length===2
      ?L.polyline(p.midLine,{renderer:canvasRenderer,color:"#60a5fa",weight:.5,opacity:.6}).addTo(g)
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
        let hasMoved=false,toMove=null,startSnap2=null;
        const downEvent=e;
        map.dragging.disable();
        map.getContainer().style.cursor="grab";
        const onMove=function(me){
          const dLat=me.latlng.lat-startLL.lat,dLng=me.latlng.lng-startLL.lng;
          const mLat=111320,mLng=111320*Math.cos(startLL.lat*Math.PI/180);
          const distM=Math.sqrt((dLat*mLat)**2+(dLng*mLng)**2);
          if(!hasMoved&&distM<1.5) return;
          if(!hasMoved){
            hasMoved=true;
            map.getContainer().style.cursor="grabbing";
            if(selected.size>0&&selected.has(i)) toMove=[...selected];
            else if(selected.size===0) toMove=[...Array(panels.length).keys()];
            else toMove=[i];
            const cur=panelDataRef?.current||panels;
            startSnap2=cur.map(p=>({
              corners:p.corners.map(c=>[...c]),
              midLine:(p.midLine||[]).map(c=>[...c])
            }));
          }
          if(!toMove||!startSnap2) return;
          const r=(ridgeAngleDeg||0)*Math.PI/180;
          const cosR=Math.cos(r),sinR=Math.sin(r);
          const dE=dLng*mLng,dN=dLat*mLat;
          const dAlong= dE*sinR+dN*cosR;
          const dAcross= dE*cosR-dN*sinR;
          const gapX=0.05,gapY=0.05;
          const stepAlong=pH+gapY,stepAcross=pW+gapX;
          const snapAlong=Math.round(dAlong/stepAlong)*stepAlong;
          const snapAcross=Math.round(dAcross/stepAcross)*stepAcross;
          const snapE=snapAlong*sinR+snapAcross*cosR;
          const snapN=snapAlong*cosR-snapAcross*sinR;
          const snapDLat=snapN/mLat,snapDLng=snapE/mLng;
          toMove.forEach(idx=>{
            const np=startSnap2[idx];
            polyLayers[idx]?.setLatLngs(np.corners.map(([la,ln])=>[la+snapDLat,ln+snapDLng]));
            midLayers[idx]?.setLatLngs(np.midLine.map(([la,ln])=>[la+snapDLat,ln+snapDLng]));
          });
        };
        const onUp=function(){
          map.off("mousemove",onMove);map.off("mouseup",onUp);
          map.dragging.enable();map.getContainer().style.cursor="";
          if(!hasMoved){
            if(downEvent.originalEvent&&downEvent.originalEvent.detail>=2){
              selRow(rowOf[i]);
            } else {
              toggleSel(i);
            }
          } else if(toMove){
            const final=polyLayers.map((pl2,j)=>{
              const lls=pl2.getLatLngs()[0];
              return{
                corners:lls.map(ll=>[ll.lat,ll.lng]),
                midLine:midLayers[j]?midLayers[j].getLatLngs().map(ll=>[ll.lat,ll.lng]):[]
              };
            });
            if(panelDataRef) panelDataRef.current=final;
          }
        };
        map.on("mousemove",onMove);
        map.on("mouseup",onUp);
      });
    });
  }

  g.addTo(map);return g;
}

// ── Daktype picker component ──────────────────────────────────────────────
const DAKTYPE_OPTIONS=[
  {id:"auto",    icon:"🔍", label:"Auto (LiDAR)"},
  {id:"zadeldak",icon:"🏠", label:"Zadeldak"},
  {id:"schilddak",icon:"⛺",label:"Schilddak"},
  {id:"lessenaarsdak",icon:"📐",label:"Lessenaar"},
  {id:"platdak", icon:"⬜", label:"Plat dak"},
];
function DakTypePicker({value,onChange}){
  return(
    <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:5}}>
      {DAKTYPE_OPTIONS.map(o=>(
        <button key={o.id} onClick={()=>onChange(o.id)}
          style={{padding:"4px 6px",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
            cursor:"pointer",borderRadius:5,whiteSpace:"nowrap",
            background:value===o.id?"var(--amber-light)":"var(--bg3)",
            border:value===o.id?"1px solid var(--amber)":"1px solid var(--border-dark)",
            color:value===o.id?"var(--amber)":"var(--muted)"}}>
          {o.icon} {o.label}
        </button>
      ))}
    </div>
  );
}

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
        {[0,.25,.5,.75,1].map(f=>{
          const y=padT+chartH*(1-f);
          return <g key={f}>
            <line x1={padL} x2={W-padR} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1"/>
            <text x={padL-4} y={y+4} textAnchor="end" fill="#94a3b8" fontSize="8">{Math.round(maxVal*f)}</text>
          </g>;
        })}
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



// ──────────────────────────────────────────────────────────────────────────────
// PDF HELPER CHARTS
// ──────────────────────────────────────────────────────────────────────────────

// 1. Terugverdientijd grafiek — cumulatieve cashflow over 25 jaar
function pdfCashflowChart(doc,results,y,M,W,OR,BL,GR,TXT,MUT,LN,WHT,sf,sc){
  const invest=results.investPanels;
  if(!invest||invest<=0) return y;
  const annSav=results.annualBase||0;
  const annSavBatt=results.battResult?.totSav||annSav;
  const YEARS=25,DEGR=0.005,PRICE_UP=0.02;
  // Bereken cumulatief per jaar met degradatie en prijsstijging
  const cfBase=[],cfBatt=[];
  for(let yr=0;yr<=YEARS;yr++){
    if(yr===0){cfBase.push(-invest);cfBatt.push(-invest);continue;}
    let cB=-invest,cBt=-invest;
    for(let j=1;j<=yr;j++){
      const factor=Math.pow(1-DEGR,j-1)*Math.pow(1+PRICE_UP,j-1);
      cB+=annSav*factor;
      cBt+=annSavBatt*factor;
    }
    cfBase.push(Math.round(cB));
    cfBatt.push(Math.round(cBt));
  }
  const hasBatt=results.battResult&&annSavBatt>annSav;
  const allVals=[...cfBase,...(hasBatt?cfBatt:[])];
  const minV=Math.min(...allVals);
  const maxV=Math.max(...allVals,0);
  const range=maxV-minV||1;
  const cW=W-2*M,cH=55,x0=M,y0=y,chartH=45,chartT=y0+5;

  // Titelbalk
  sf(10,"bold");sc(TXT);doc.text("Terugverdientijd — Cumulatieve cashflow",x0,chartT-2);
  // Assen
  doc.setDrawColor(...LN);doc.setLineWidth(0.3);
  // Nul-lijn
  const zeroY=chartT+chartH-(0-minV)/range*chartH;
  doc.setDrawColor(150,150,150);doc.setLineWidth(0.5);
  doc.line(x0,zeroY,x0+cW,zeroY);
  sf(6,"normal");sc(MUT);doc.text("€0",x0-2,zeroY+1,{align:"right"});
  // Grid lijnen
  [-invest,maxV].forEach(val=>{
    if(val===0) return;
    const gy=chartT+chartH-(val-minV)/range*chartH;
    doc.setDrawColor(...LN);doc.setLineWidth(0.2);
    doc.line(x0,gy,x0+cW,gy);
    sf(5,"normal");sc(MUT);
    doc.text((val>=0?"+":"")+Math.round(val/1000)+"k",x0-1,gy+1,{align:"right"});
  });
  // Payback-lijn (geen batterij)
  const pbBase=cfBase.findIndex(v=>v>=0);
  if(pbBase>0){
    const pbX=x0+pbBase/YEARS*cW;
    doc.setDrawColor(...OR);doc.setLineWidth(0.5);doc.setLineDashPattern([1,1],0);
    doc.line(pbX,chartT,pbX,chartT+chartH);
    doc.setLineDashPattern([],0);
    sf(6,"bold");sc(OR);doc.text(pbBase+"j",pbX+1,chartT+3);
  }
  // Batterij curve (geel-oranje)
  if(hasBatt){
    doc.setDrawColor(230,120,0);doc.setLineWidth(1.0);
    for(let i=0;i<YEARS;i++){
      const x1=x0+i/YEARS*cW,y1=chartT+chartH-(cfBatt[i]-minV)/range*chartH;
      const x2=x0+(i+1)/YEARS*cW,y2=chartT+chartH-(cfBatt[i+1]-minV)/range*chartH;
      doc.line(x1,y1,x2,y2);
    }
    const pbBatt=cfBatt.findIndex(v=>v>=0);
    if(pbBatt>0&&pbBatt!==pbBase){
      const pbX=x0+pbBatt/YEARS*cW;
      sf(6,"bold");sc([200,90,0]);doc.text(pbBatt+"j",pbX+1,chartT+7);
    }
  }
  // Basis curve (blauw)
  doc.setDrawColor(...BL);doc.setLineWidth(1.2);
  for(let i=0;i<YEARS;i++){
    const x1=x0+i/YEARS*cW,y1=chartT+chartH-(cfBase[i]-minV)/range*chartH;
    const x2=x0+(i+1)/YEARS*cW,y2=chartT+chartH-(cfBase[i+1]-minV)/range*chartH;
    doc.line(x1,y1,x2,y2);
  }
  // X-as labels (5j stappen)
  sf(5,"normal");sc(MUT);
  [0,5,10,15,20,25].forEach(yr=>{
    const lx=x0+yr/YEARS*cW;
    doc.line(lx,chartT+chartH,lx,chartT+chartH+1.5);
    doc.text(yr+"",lx,chartT+chartH+4,{align:"center"});
  });
  sf(6,"normal");sc(MUT);doc.text("jaar",x0+cW+2,chartT+chartH+4);
  // Legenda
  const legY=chartT+chartH+9;
  doc.setFillColor(...BL);doc.rect(x0,legY-2,10,2,"F");
  sf(6,"normal");sc(TXT);doc.text("Zonder batterij",x0+12,legY);
  if(hasBatt){
    doc.setFillColor(230,120,0);doc.rect(x0+55,legY-2,10,2,"F");
    doc.text("Met batterij",x0+67,legY);
  }
  sf(7,"italic");sc(MUT);
  doc.text("Incl. paneel-degradatie 0.5%/j · Elektriciteitsprijsstijging 2%/j",x0,legY+5);
  return y+cH+16;
}

// 2. Productie vs Verbruik grafiek (maandelijks)
function pdfProductionConsumptionChart(doc,results,y,M,W,OR,BL,GR,TXT,MUT,LN,WHT,sf,sc,MONTHS,MONTHLY_FACTOR){
  const annKwh=results.annualKwh||0;
  const annConsump=results.consumption||3500;
  const monthProd=MONTHLY_FACTOR.map(f=>Math.round(annKwh*f));
  const monthConsump=Array(12).fill(Math.round(annConsump/12));
  // Profiel-gebaseerd verbruikspatroon (meer thuis in winter)
  const profileFactors={
    gepensioneerd:[1.15,1.1,1.0,0.95,0.9,0.85,0.85,0.85,0.9,0.95,1.05,1.15],
    thuiswerker:[1.1,1.05,1.0,0.95,0.9,0.9,0.9,0.9,0.95,1.0,1.05,1.1],
    werkend_koppel:[1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0],
    gezin:[1.1,1.05,1.0,0.95,0.95,0.9,0.9,0.95,0.95,1.0,1.05,1.1],
  };
  const pf=profileFactors[results.usageProfile]||profileFactors.gezin;
  const monthConsumpAdj=pf.map(f=>Math.round(annConsump/12*f));
  const maxV=Math.max(...monthProd,...monthConsumpAdj,1);
  const cW=W-2*M,cH=50,bW=(cW-8)/12;
  const chartTop=y+8,chartH=38;

  sf(10,"bold");sc(TXT);doc.text("Productie vs Verbruik — Maandelijks overzicht",M,y+3);

  // Grid
  [0,0.5,1].forEach(f=>{
    const gy=chartTop+chartH-f*chartH;
    doc.setDrawColor(...LN);doc.setLineWidth(0.2);doc.line(M,gy,M+cW,gy);
    sf(5,"normal");sc(MUT);doc.text(Math.round(maxV*f)+"",M-1,gy+1,{align:"right"});
  });

  monthProd.forEach((prod,i)=>{
    const consump=monthConsumpAdj[i];
    const selfConsump=Math.min(prod,consump);
    const surplus=Math.max(prod-consump,0);
    const deficit=Math.max(consump-prod,0);
    const bx=M+4+i*(bW+0.5);

    // Zelfverbruik (groen)
    const hSelf=selfConsump/maxV*chartH;
    doc.setFillColor(...GR);
    doc.rect(bx,chartTop+chartH-hSelf,bW,hSelf,"F");
    // Surplus injectie (lichtblauw)
    if(surplus>0){
      const hSurp=surplus/maxV*chartH;
      doc.setFillColor(147,197,253);
      doc.rect(bx,chartTop+chartH-hSelf-hSurp,bW,hSurp,"F");
    }
    // Netafname (lichtgrijs overlay)
    if(deficit>0){
      const hDef=deficit/maxV*chartH;
      doc.setFillColor(200,200,200);
      doc.rect(bx,chartTop+chartH-hSelf-hDef,bW,hDef,"F");
    }
    // Verbruikslijn
    sf(5,"normal");sc(MUT);doc.text(MONTHS[i],bx+bW/2,chartTop+chartH+4,{align:"center"});
  });

  // Verbruikslijn (oranje)
  doc.setDrawColor(...OR);doc.setLineWidth(1.0);
  monthConsumpAdj.forEach((c,i)=>{
    if(i===0) return;
    const x1=M+4+(i-1)*(bW+0.5)+bW/2,y1=chartTop+chartH-monthConsumpAdj[i-1]/maxV*chartH;
    const x2=M+4+i*(bW+0.5)+bW/2,y2=chartTop+chartH-c/maxV*chartH;
    doc.line(x1,y1,x2,y2);
  });

  // Legenda
  const legY=chartTop+chartH+10;
  [[GR,"Zelfverbruik"],[147,197,253,"Surplus injectie"],[200,200,200,"Netafname"],OR,"Verbruik"].forEach((item,i)=>{
    if(Array.isArray(item)){
      const [col,lbl]=item;
      const lx=M+i*45;
      if(Array.isArray(col)) doc.setFillColor(...col);
      else doc.setFillColor(col,197,253);
      doc.rect(lx,legY-2,7,3,"F");
      sf(6,"normal");sc(TXT);doc.text(lbl,lx+9,legY);
    } else {
      const lx=M+3*45;
      doc.setDrawColor(...OR);doc.setLineWidth(1);doc.line(lx,legY-0.5,lx+7,legY-0.5);
      sf(6,"normal");sc(TXT);doc.text("Verbruik",lx+9,legY);
    }
  });
  return y+cH+14;
}

// 3. Schaduwanalyse — op basis van zonnehoeken voor 51°N
function computeShadowAnalysis(faces){
  if(!faces||faces.length===0) return null;
  // Zonnehoeken voor 51°N per maand (gemiddeld op 12h en 15h)
  const SUN_ELEV_51N=[14,19,27,36,44,47,45,40,31,22,15,12]; // gemiddeld midden van dag
  const SUN_AZ_SOUTH=[180,175,170,160,155,150,155,160,170,175,180,180]; // gemiddeld azimut
  const MONTHS_NL=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
  const analysis=faces.map((f,fi)=>{
    const asp=f.aspectDeg??ASP_MAP_STATIC[f.orientation]??180;
    const tilt=f.slope??30;
    const h=f.avgH??5;
    // Horizon-blokkade: obstructies voor het vlak op basis van hoogte
    // Conservatieve schatting: buur-gebouwen op 10m = arctan(h/10) obstruction
    const horizAngle=Math.atan2(Math.max(h-3,0),15)*180/Math.PI; // hoek naar horizobstructie
    const monthly=SUN_ELEV_51N.map((elev,mi)=>{
      // Hoekafwijking tussen zonneazimut en vlak-oriëntatie
      const azDiff=Math.abs(((SUN_AZ_SOUTH[mi]-asp)+180)%360-180);
      // Zon staat achter het vlak → 100% schaduw (geen productie)
      if(azDiff>90) return 100;
      // Zon te laag → horizon-obstructie
      if(elev<=horizAngle) return Math.round(Math.min((horizAngle-elev+2)*8,80));
      // Schaduw door helling (rijen panelen)
      const rowShade=tilt>45?Math.round((tilt-45)*0.5):0;
      return Math.max(rowShade,0);
    });
    const avgLoss=Math.round(monthly.reduce((s,v)=>s+v,0)/12);
    return {faceIdx:fi,orientation:f.orientation,slope:tilt,monthly,avgLoss};
  });
  return analysis;
}
// Static ASP map voor shadow analysis (buiten React component)
const ASP_MAP_STATIC={N:0,NO:45,O:90,ZO:135,Z:180,ZW:225,W:270,NW:315};

// 4. String-diagram in PDF
function pdfStringDiagram(doc,sd,selPanel,results,y,M,W,OR,BL,TXT,MUT,LN,WHT,sf,sc){
  if(!sd||!sd.mppts?.length) return y;
  const cW=W-2*M,nMppt=sd.mppts.length;
  const diagH=60,panelW=8,panelH=5,gap=2;
  // Omvormer box (midden rechts)
  const invX=M+cW-25,invY=y+15,invW=22,invH=30;
  doc.setFillColor(30,58,138);doc.roundedRect(invX,invY,invW,invH,2,2,"F");
  sf(7,"bold");sc(WHT);doc.text(results.inv?.model||"Omvormer",invX+invW/2,invY+6,{align:"center"});
  sf(6,"normal");doc.text(results.inv?.kw+"kW AC",invX+invW/2,invY+11,{align:"center"});
  sf(5,"normal");doc.text(nMppt+" MPPT",invX+invW/2,invY+15,{align:"center"});
  // Per MPPT ingang
  const mpptColors=[[37,99,235],[234,88,12],[22,163,74],[147,51,234]];
  sd.mppts.forEach((m,mi)=>{
    const color=mpptColors[mi%mpptColors.length];
    const strings=m.stringCount||1;
    const panelsPerStr=m.stringLen||Math.ceil(m.totalPanels/strings);
    const colX=M+mi*(cW-30)/(nMppt)+5;
    // Ingang label
    sf(8,"bold");sc(color);
    doc.text("Ingang "+String.fromCharCode(65+mi),colX,y+5);
    sf(6,"normal");sc(MUT);
    doc.text((m.faces||[]).map(f=>f.orientation).join("+")||m.orientation||"",colX,y+9);
    doc.text(m.totalPanels+" panelen · "+strings+" string"+(strings>1?"s":""),colX,y+13);
    // Teken strings van panelen
    let panelNr=1;
    for(let si=0;si<strings;si++){
      const strX=colX+si*(panelW+gap+2);
      // Verbindingslijn naar omvormer
      const lineStartX=strX+panelW/2,lineStartY=y+17+(panelsPerStr)*(panelH+1);
      doc.setDrawColor(...color);doc.setLineWidth(0.7);
      doc.line(lineStartX,lineStartY,invX,invY+8+mi*8);
      // MPPT label op de lijn
      sf(5,"italic");sc(color);
      doc.text("MPPT "+(mi+1),lineStartX+(invX-lineStartX)*0.4,lineStartY+(invY+8+mi*8-lineStartY)*0.4);
      // Paneel-rechthoekjes
      for(let pi=0;pi<panelsPerStr&&panelNr<=m.totalPanels;pi++,panelNr++){
        const px=strX,py=y+17+pi*(panelH+1);
        doc.setFillColor(...color);doc.setDrawColor(255,255,255);doc.setLineWidth(0.2);
        doc.roundedRect(px,py,panelW,panelH,0.5,0.5,"FD");
        sf(5,"bold");sc(WHT);doc.text(panelNr+"",px+panelW/2,py+panelH-1,{align:"center"});
      }
    }
    // Elektr. kenmerken per ingang
    const detailY=y+17+(panelsPerStr+1)*(panelH+1)+3;
    sf(5,"normal");sc(TXT);
    doc.text("Voc: "+m.vocCold?.toFixed(0)+"V · Vmp: "+m.vmpHot?.toFixed(0)+"V",colX,detailY);
    doc.text("Isc: "+m.iscTotal?.toFixed(1)+"A · Imp: "+m.impTotal?.toFixed(1)+"A",colX,detailY+4);
  });
  return y+diagH+20;
}

async function generatePDF(results,customer,displayName,slope,orientation,mapSnapshot,aiAdvice){
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
  const addPageFooter=()=>{
    // Verdify "powered by" footer onderaan elke pagina
    const fy=292;
    doc.setDrawColor(226,232,240);doc.setLineWidth(0.3);doc.line(M,fy-3,W-M,fy-3);
    sf(6,"normal");sc([148,163,184]);
    doc.text("Gegenereerd met ZonneDak Analyzer · Powered by Verdify · verdify.be",M,fy);
    // Verdify logo klein rechts
    try{
      const lW=18,lH=lW*(VERDIFY_LOGO_HEIGHT/VERDIFY_LOGO_WIDTH);
      doc.addImage(VERDIFY_LOGO_BASE64,"JPEG",W-M-lW,fy-lH-1,lW,lH);
    }catch{}
  };
  const miniHeader=(pg)=>{
    doc.setFillColor(...OR);doc.rect(0,0,W,14,"F");
    sf(9,"bold");sc(WHT);doc.text("EcoFinity BV",M,9);
    sf(9,"normal");doc.text("Project: "+(customer.name||"—"),M+32,9);
    sf(8,"normal");doc.text("Pagina "+pg,W-M,9,{align:"right"});
    addPageFooter();
  };

  const LOGO_W = 50;
  const LOGO_H = LOGO_W * (ECOFINITY_LOGO_HEIGHT / ECOFINITY_LOGO_WIDTH);
  try {
    doc.addImage(ECOFINITY_LOGO_BASE64, "JPEG", M, 12, LOGO_W, LOGO_H);
  } catch(e) {
    sf(16,"bold");sc(OR);doc.text("ECOFINITY",M,22);
    sf(8,"normal");sc(MUT);doc.text("Energy & Building Solutions",M,28);
  }

  const rightX = W - M;
  let yh = 18;
  sf(11,"bold");sc(TXT);doc.text((customer.name||"—"),rightX,yh,{align:"right"}); yh+=6;
  if(customer.address){
    sf(9,"normal");sc(MUT);
    const addrLines=customer.address.split(/,\s*/).filter(Boolean);
    addrLines.forEach(line=>{doc.text(line,rightX,yh,{align:"right"});yh+=5;});
  }
  if(customer.email){sf(9,"normal");sc(MUT);doc.text(customer.email,rightX,yh,{align:"right"});yh+=5;}
  sf(8,"italic");sc(MUT);
  doc.text("Rapport: "+new Date().toLocaleDateString("nl-BE"),rightX,yh+2,{align:"right"});

  const headerBottomY = Math.max(12 + LOGO_H + 4, yh + 6);
  doc.setDrawColor(...OR);doc.setLineWidth(0.8);
  doc.line(M, headerBottomY, W-M, headerBottomY);

  let y = headerBottomY + 8;
  sf(11,"bold");sc(TXT);doc.text("Locatie:",M,y);
  sf(11,"normal");sc(OR);doc.text(displayName.split(",").slice(0,3).join(","),M+25,y);
  y += 10;

  y=secTitle("Systeemoverzicht",y);
  const kWp=((results.panelCount*results.panel.watt)/1000).toFixed(2);
  // Multi-vlak: toon alle oriëntaties, niet enkel de dominante
  const orientatieStr2=results.faceSummary&&results.faceEntries?.length>1
    ?results.faceSummary
    :(results.orientation+" · Helling: "+results.slope+"°");
  const sysItems=[
    results.panelCount+" × "+results.panel.brand+" "+results.panel.model,
    "Vlakken: "+orientatieStr2+" · Piekvermogen: "+kWp+" kWp",
  ];
  if(results.inv) sysItems.push("1 × "+results.inv.brand+" "+results.inv.model+" · "+results.inv.kw+" kW · "+results.inv.fase);
  sysItems.forEach((t,i)=>{
    if(i%2===0){doc.setFillColor(240,245,255);doc.rect(M,y-3,W-2*M,8,"F");}
    sf(9,i===0?"bold":"normal");sc(i===0?TXT:MUT);doc.text(t,M+3,y+2);
    y+=8;
  });
  y+=3;

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
  // Extra klantinfo in PDF
  const extraL=[
    results.hasExistingPV!=="onbekend"?["Bestaande PV",results.hasExistingPV]:null,
    results.hasDigitalMeter!=="onbekend"?["Digitale meter",results.hasDigitalMeter]:null,
  ].filter(Boolean);
  const extraR=[
    results.futureConsumers?.length>0?["Extra verbruikers",results.futureConsumers.join(", ")]:null,
    results.focusGoal?["Gewenste focus",results.focusGoal]:null,
  ].filter(Boolean);
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
  // Extra klantgegevens (1 rij breed)
  if(extraL.length>0||extraR.length>0){
    const allExtra=[...extraL,...extraR];
    sf(8,"bold");sc(OR);doc.text("Klantgegevens werkbon:",M,y);y+=5;
    allExtra.forEach(([k,v],ri)=>{
      if(ri%2===0){doc.setFillColor(...BG);doc.rect(M,y-3,W-2*M,7,"F");}
      sf(8,"normal");sc(MUT);doc.text(k+":",M+2,y+1);
      sf(9,"bold");sc(TXT);doc.text(String(v).substring(0,60),M+70,y+1);
      y+=7;
    });
    y+=4;
  }

  doc.addPage();miniHeader(2);y=22;

  y=secTitle("Financiële analyse",y);
  const fmtPrice=(p)=>p!==null&&p!==undefined?"€ "+p.toLocaleString("nl-BE"):"— niet ingevuld —";
  const fmtPayback=(p)=>p!==null&&p!==undefined?p+" jaar":"—";
  const kpis=[
    ["Totale investering",fmtPrice(results.investPanels),OR],
    ["Jaarlijkse besparing","€ "+results.annualBase.toLocaleString("nl-BE"),GR],
    ["Terugverdientijd",fmtPayback(results.paybackBase),BL],
  ];
  if(results.battResult) kpis.push(["Incl. batterij",fmtPayback(results.battResult.payback),[120,40,180]]);
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

  const generalRows=[
    ["Geselecteerd paneel",results.panelCount+" × "+results.panel.brand+" "+results.panel.model],
    ["Geselecteerde omvormer",results.inv?results.inv.brand+" "+results.inv.model:"Geen specifiek model"],
    ["Jaarverbruik klant",results.consumption.toLocaleString("nl-BE")+" kWh"],
    ["Jaaropbrengst PV",results.annualKwh.toLocaleString("nl-BE")+" kWh"],
    ["Dekkingsgraad PV / verbruik",results.coverage+" %"],
  ];
  doc.autoTable({startY:y,body:generalRows,
    styles:{fontSize:9,cellPadding:3},
    columnStyles:{0:{fontStyle:"bold",cellWidth:80,textColor:MUT},1:{halign:"right"}},
    theme:"plain",
    margin:{left:M,right:M},tableWidth:W-2*M});
  y=doc.lastAutoTable.finalY+8;

  if(y>284-80){doc.addPage();y=20;}
  sf(11,"bold");sc(TXT);doc.text("Terugverdientijd vergelijking",M,y);y+=6;

  const hasBatt=!!results.battResult;
  const colWithoutBatt=[
    ["Investering",fmtPrice(results.investPanels)],
    ["Zelfverbruik","~"+Math.round(results.selfRatioBase*100)+"% ("+results.selfKwhBase.toLocaleString("nl-BE")+" kWh)"],
    ["Injectie naar net",results.injectKwhBase.toLocaleString("nl-BE")+" kWh"],
    ["Besparing/jaar","€ "+results.annualBase.toLocaleString("nl-BE")],
    ["Terugverdientijd",fmtPayback(results.paybackBase)],
  ];
  const colWithBatt=hasBatt?[
    ["Investering",fmtPrice(results.battResult.totInv)],
    ["Zelfverbruik","~70% ("+results.battResult.selfKwh.toLocaleString("nl-BE")+" kWh)"],
    ["Injectie naar net",results.battResult.injectKwh.toLocaleString("nl-BE")+" kWh"],
    ["Extra besparing","€ "+results.battResult.extraSav.toLocaleString("nl-BE")+"/jaar"],
    ["Totale besparing","€ "+results.battResult.totSav.toLocaleString("nl-BE")+"/jaar"],
    ["Terugverdientijd",fmtPayback(results.battResult.payback)],
  ]:null;

  const colW=(W-2*M-4)/2;
  const colLeftX=M, colRightX=M+colW+4;
  const startY=y;

  doc.autoTable({startY:y,
    head:[["Alleen zonnepanelen",""]],
    body:colWithoutBatt,
    styles:{fontSize:8,cellPadding:2.5},
    headStyles:{fillColor:OR,textColor:WHT,fontStyle:"bold",halign:"left"},
    columnStyles:{0:{fontStyle:"bold",cellWidth:35,textColor:MUT},1:{halign:"right"}},
    margin:{left:colLeftX,right:M},tableWidth:colW});
  const leftEndY=doc.lastAutoTable.finalY;

  if(hasBatt){
    doc.autoTable({startY:startY,
      head:[["Met "+(results.batt?.brand||"")+" "+(results.batt?.model||""),""]],
      body:colWithBatt,
      styles:{fontSize:8,cellPadding:2.5},
      headStyles:{fillColor:BL,textColor:WHT,fontStyle:"bold",halign:"left"},
      columnStyles:{0:{fontStyle:"bold",cellWidth:35,textColor:MUT},1:{halign:"right"}},
      margin:{left:colRightX,right:M},tableWidth:colW});
    y=Math.max(leftEndY,doc.lastAutoTable.finalY)+8;
  }else{
    sf(8,"italic");sc(MUT);
    doc.text("Geen batterij geactiveerd",colRightX+5,startY+15);
    y=leftEndY+8;
  }
  hLine(y);y+=8;

  if(results.stringDesign&&results.stringDesign.mppts.length>0){
    if(y>284-40){doc.addPage();y=20;}
    y=secTitle("Configuratie van de omvormer",y);
    const sd=results.stringDesign;
    sf(8,"normal");sc(TXT);
    doc.text(`Omgevingstemperatuur: min ${sd.config.tempMin}°C · config ${sd.config.tempConfig}°C · max ${sd.config.tempMax}°C`,M,y);
    y+=6;
    if(y>284-40){doc.addPage();y=20;}
    sf(9,"bold");sc(TXT);doc.text(`1× ${results.inv.brand} ${results.inv.model}`,M,y);y+=5;
    const invRows=[
      ["Piekvermogen",(sd.totalPower/1000).toFixed(2)+" kWp"],
      ["Aantal PV-panelen",results.panelCount+""],
      ["Max. AC-vermogen",(sd.config.inverterMaxAc/1000).toFixed(2)+" kW"],
      ["Max. DC-vermogen",(sd.config.inverterMaxDcPower/1000).toFixed(2)+" kW"],
      ["Netspanning",results.inv.fase==="3-fase"?"400V (driefase)":"230V (eenfase)"],
    ];
    if(sd.config.sizingFactor!==null){
      invRows.push(["Dimensioneringsfactor",sd.config.sizingFactor.toFixed(1)+" %"]);
    }
    doc.autoTable({startY:y,body:invRows,
      styles:{fontSize:8,cellPadding:2.2},
      columnStyles:{0:{cellWidth:75,textColor:MUT},1:{halign:"right",fontStyle:"bold"}},
      theme:"plain",
      margin:{left:M,right:M},tableWidth:W-2*M});
    y=doc.lastAutoTable.finalY+5;
    if(y>284-50){doc.addPage();y=20;}
    sf(9,"bold");sc(TXT);doc.text("Detailwaarden per MPPT-ingang",M,y);y+=5;
    const nMppt=sd.mppts.length;
    const labelColW=nMppt>1?58:75;
    const valColW=Math.floor((W-2*M-labelColW)/nMppt);
    // Header toont naam + oriëntatie
    // Header: "Ingang A · ZW 16°"
    const head=[["",...sd.mppts.map((m,i)=>{
      const ori=(m.faces?.map(f2=>f2.orientation).join("+")) || m.orientation || "";
      const sl=m.slope??slope;
      return "Ingang "+String.fromCharCode(65+i)+(ori?" · "+ori+" "+sl+"°":"");
    })]];
    const GRN=[34,197,94],RED=[220,38,38],NEU=[30,64,175];
    // Gebruik {content, styles} objecten voor gekleurde cellen (groen/rood)
    const cv=(check,val)=>{
      if(check===null) return {content:val,styles:{textColor:NEU}};
      return check
        ?{content:"OK  "+val,styles:{textColor:GRN,fontStyle:"bold"}}
        :{content:"!!  "+val,styles:{textColor:RED,fontStyle:"bold"}};
    };
    const rows=[
      ["Aantal strings",...sd.mppts.map(m=>({content:m.stringCount+"",styles:{textColor:NEU,fontStyle:"bold"}}))],
      ["PV-panelen",...sd.mppts.map(m=>({content:m.totalPanels+"",styles:{textColor:NEU,fontStyle:"bold"}}))],
      ["Piekvermogen",...sd.mppts.map(m=>({content:(m.powerStc/1000).toFixed(2)+" kWp",styles:{textColor:NEU,fontStyle:"bold"}}))],
      ["Min. DC-spanning WR",...sd.mppts.map(()=>({content:sd.config.inverterMpptMin+" V",styles:{}}))],
      ["Typ. PV-spanning ("+sd.config.tempConfig+"°C)",...sd.mppts.map(m=>cv(m.checks.vmpConfigOk,m.vmpConfig.toFixed(0)+" V"))],
      ["Min. PV-spanning ("+sd.config.tempMax+"°C)",...sd.mppts.map(m=>cv(m.checks.vmpHotOk,m.vmpHot.toFixed(0)+" V"))],
      ["Max. DC-spanning omvormer",...sd.mppts.map(()=>({content:sd.config.inverterMaxDc+" V",styles:{}}))],
      ["Max. PV-spanning ("+sd.config.tempMin+"°C)",...sd.mppts.map(m=>cv(m.checks.vocColdOk,m.vocCold.toFixed(0)+" V"))],
      ["Max. ingangsstroom MPPT",...sd.mppts.map(()=>({content:sd.config.inverterMaxCurrent+" A",styles:{}}))],
      ["Max. PV-generatorstroom (Imp)",...sd.mppts.map(m=>cv(m.checks.impOk,m.impTotal.toFixed(1)+" A"))],
      ["Max. kortsluitstroom MPPT",...sd.mppts.map(()=>({content:sd.config.inverterMaxCurrent+" A",styles:{}}))],
      ["Max. kortsluitstroom PV (Isc)",...sd.mppts.map(m=>cv(m.checks.iscOk,m.iscTotal.toFixed(1)+" A"))],
    ];
    const colStyles={0:{cellWidth:labelColW,textColor:MUT,fontStyle:"normal",halign:"left"}};
    for(let ci=1;ci<=nMppt;ci++) colStyles[ci]={cellWidth:valColW,halign:"right"};
    // bodyStyles bevat GEEN textColor/fontStyle — anders overschrijven ze de cel-level stijlen
    doc.autoTable({startY:y,head,body:rows,
      styles:{fontSize:nMppt>2?6.5:7.5,cellPadding:2,halign:"right"},
      headStyles:{fillColor:BL,textColor:WHT,fontStyle:"bold",halign:"right",minCellHeight:10},
      columnStyles:colStyles,
      alternateRowStyles:{fillColor:[239,246,255]},
      margin:{left:M,right:M},tableWidth:W-2*M});
    y=doc.lastAutoTable.finalY+4;
    sf(7,"italic");sc(MUT);
    doc.text("+ = waarde valt binnen de veiligheidslimieten · - = waarde overschrijdt limiet",M,y);
    y+=6;
    if(sd.warnings.length>0){
      if(y>284-30){doc.addPage();y=20;}
      sf(9,"bold");sc(TXT);doc.text("Aandachtspunten:",M,y);y+=5;
      sd.warnings.forEach(w=>{
        const col=w.severity==="critical"?[200,0,0]:w.severity==="warning"?[200,140,0]:[80,80,80];
        sf(8,"bold");sc(col);
        const prefix=w.severity==="critical"?"[KRITIEK] ":w.severity==="warning"?"[WAARSCHUWING] ":"[INFO] ";
        doc.text(prefix+w.title,M,y);y+=4;
        sf(7,"normal");sc(TXT);
        const lines=doc.splitTextToSize(w.detail,W-2*M);
        doc.text(lines,M+3,y);y+=lines.length*3.5+2;
      });
    }else{
      sf(9,"bold");sc([0,140,0]);doc.text("OK - Configuratie binnen alle veiligheidsgrenzen.",M,y);y+=5;
    }
    y+=4;
    // ── String-diagram ──
    const sdDiagY=y+6;
    if(sdDiagY>220){doc.addPage();y=20;}
    else{y+=6;}
    y=secTitle("Stroomschema — DC bekabeling",y);
    y=pdfStringDiagram(doc,sd,results.panel,results,y,M,W,OR,BL,TXT,MUT,LN,WHT,sf,sc);
    hLine(y);y+=8;
  }

  if(y>284-40){doc.addPage();y=20;}
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

  if(aiAdvice&&aiAdvice.trim().length>0){
    doc.addPage();
    doc.setFillColor(...OR);doc.rect(0,0,W,14,"F");
    sf(11,"bold");sc(WHT);doc.text("EcoFinity BV",M,9);
    sf(11,"normal");doc.text("Project: "+(customer.name||"—"),M+38,9);
    sf(10,"normal");doc.text("Expert advies",W-M,9,{align:"right"});
    y=22;
    y=secTitle("Expert advies van uw installateur",y);
    sf(10,"normal");sc(TXT);
    const adviceLines=doc.splitTextToSize(aiAdvice.trim(),W-2*M);
    let lineH=4.5;
    for(const line of adviceLines){
      if(y>284-15){doc.addPage();y=22;sc(TXT);sf(10,"normal");}
      doc.text(line,M,y);
      y+=lineH;
    }
    y+=5;
  }

  // ── Luchtfoto met panelen ──────────────────────────────────────────────────
  // Aanpak: de html2canvas snapshot bevat REEDS de Leaflet SVG-panelen correct.
  // We embedden gewoon de foto — geen vector overlay nodig.
  // Vector overlay had permanent coördinaten-transformatie problemen.
  try{
    const imgData=mapSnapshot?.dataUrl||null;
    const imgRatio=imgData?(mapSnapshot.height/mapSnapshot.width):0.6;
    const panelData=results._panelData;
    const panelCount3=results.panelCount||panelData?.length||0;
    const kWp3=panelCount3>0?((panelCount3*results.panel.watt)/1000).toFixed(1):"—";

    doc.addPage();
    doc.setFillColor(...OR);doc.rect(0,0,W,14,"F");
    sf(11,"bold");sc(WHT);doc.text("EcoFinity BV",M,9);
    sf(11,"normal");doc.text("Project: "+(customer.name||"—"),M+38,9);
    sf(10,"normal");doc.text("Luchtfoto + Paneelplaatsing",W-M,9,{align:"right"});
    y=22;
    y=secTitle("Paneelplaatsing op het dak",y);

    // Info-lijn boven de foto
    sf(9,"bold");sc([37,99,235]);
    doc.text(`${panelCount3} panelen · ${kWp3} kWp`,M,y);
    sf(9,"normal");sc(MUT);
    doc.text(`Paneel: ${results.panel.brand} ${results.panel.model}`,M+60,y);
    y+=7;

    const imgW=W-2*M;
    const imgH=imgData?Math.min(160,imgW*imgRatio):80;
    const imgX=M,imgY=y;

    if(imgData){
      // Foto met panelen al erin (html2canvas vangt Leaflet SVG correct op)
      doc.addImage(imgData,"JPEG",imgX,imgY,imgW,imgH);
      // Lichte oranje rand
      doc.setDrawColor(...OR);doc.setLineWidth(0.4);
      doc.rect(imgX,imgY,imgW,imgH,"S");
    } else {
      doc.setFillColor(220,230,240);
      doc.rect(imgX,imgY,imgW,imgH,"F");
      sf(9,"italic");sc(MUT);
      doc.text("Klik '📸 Foto opslaan' op de configuratie-tab voor luchtfoto",
               imgX+imgW/2,imgY+imgH/2,{align:"center"});
    }

    sf(7,"italic");sc(MUT);
    doc.text(
      "Luchtfoto: "+(imgData?"Esri World Imagery · panelen gerenderd via Leaflet":"niet beschikbaar")+
      " · Paneelplaatsing is een schatting.",
      imgX,imgY+imgH+5
    );
    y=imgY+imgH+14;

  }catch(mapErr){console.warn("Luchtfoto sectie mislukt:",mapErr);}


  const pgC=doc.getNumberOfPages();
  for(let i=1;i<=pgC;i++){
    doc.setPage(i);
    doc.setFillColor(248,250,252);doc.rect(0,284,W,13,"F");
    doc.setDrawColor(...OR);doc.setLineWidth(0.3);doc.line(0,284,W,284);
    sf(7,"normal");sc(MUT);
    doc.text("Pagina "+i+" / "+pgC,W-M,292,{align:"right"});
    doc.text("EcoFinity BV · www.ecofinity.eu · info@ecofinity.eu · +32 55 495865",M,292);
    doc.text("Berekeningen zijn schattingen op basis van gemiddelde zonnestraling in Vlaanderen.",M,288,{maxWidth:W-2*M-20});
  }

  // ── Schaduwanalyse pagina ──
  const shadowData=results._shadowData;
  if(shadowData?.length>0){
    doc.addPage();
    doc.setFillColor(...OR);doc.rect(0,0,W,14,"F");
    sf(9,"bold");sc(WHT);doc.text("EcoFinity BV",M,9);
    sf(9,"normal");doc.text("Project: "+(customer.name||"—"),M+32,9);
    sf(8,"normal");doc.text("Schaduwanalyse",W-M,9,{align:"right"});
    y=22;y=secTitle("Schaduwanalyse per dakvlak",y);
    sf(8,"normal");sc(MUT);
    doc.text("Gebaseerd op LiDAR-hoogte, zonnehoeken voor 51°N (België) en vlak-oriëntatie.",M,y);y+=7;
    const shadowRows=shadowData.map(s=>[
      {content:s.orientation+" "+s.slope+"°",styles:{fontStyle:"bold",halign:"left"}},
      ...s.monthly.map(v=>({content:v===0?"✓":v+"%",
        styles:{textColor:v===0?[22,163,74]:v<15?[180,100,0]:[200,38,38],fontStyle:v===0?"normal":"bold"}})),
      {content:s.avgLoss===0?"✓":s.avgLoss+"%",styles:{fontStyle:"bold",
        textColor:s.avgLoss<5?[22,163,74]:s.avgLoss<15?[180,100,0]:[200,38,38]}},
    ]);
    doc.autoTable({startY:y,
      head:[["Vlak","Jan","Feb","Mrt","Apr","Mei","Jun","Jul","Aug","Sep","Okt","Nov","Dec","Gem."]],
      body:shadowRows,
      styles:{fontSize:7.5,cellPadding:2.2,halign:"center"},
      headStyles:{fillColor:[15,23,42],textColor:WHT,fontStyle:"bold"},
      columnStyles:{0:{cellWidth:22,halign:"left"}},
      alternateRowStyles:{fillColor:[248,250,252]},
      margin:{left:M,right:M},tableWidth:W-2*M});
    y=doc.lastAutoTable.finalY+5;
    sf(7,"italic");sc(MUT);
    doc.text("✓ = geen schaduw  ·  % = geschat schaduwverlies t.o.v. nominale productie",M,y);
  }

  const mainPdfBytes=doc.output("arraybuffer");
  const mergedPdf=await PDFDocument.load(new Uint8Array(mainPdfBytes));

  const dsFiles=[];
  if(results.panel){
    dsFiles.push({
      file:results.panel.datasheet||null,
      datasheetData:results.panel.datasheetData||null,
      label:`${results.panel.brand} ${results.panel.model}`,
      type:"Paneel datasheet"
    });
  }
  if(results.inv&&(results.inv.datasheet||results.inv.datasheetData)){
    dsFiles.push({
      file:results.inv.datasheet||null,
      datasheetData:results.inv.datasheetData||null,
      label:`${results.inv.brand} ${results.inv.model}`,
      type:"Omvormer datasheet"
    });
  }

  // ── Datasheets via pdf.js rasterisatie ──────────────────────────────────────
  // pdf-lib copyPages faalt op encrypted datasheets (Qcells, Trina, AlphaESS).
  // pdf.js rendert elke pagina naar canvas → JPEG → jsPDF → mergedPdf.
  let dsCount=0;

  const loadPdfJs=async()=>{
    if(window.pdfjsLib) return;
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc=
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  };

  for(const ds of dsFiles){
    // Prioriteit: geüploade datasheet (ArrayBuffer) → publieke datasheet (URL)
    let bytes=null;
    if(ds.datasheetData){
      bytes=new Uint8Array(ds.datasheetData);
    } else if(ds.file){
      bytes=await fetchPdfBytes(DS_BASE+ds.file);
    }
    if(!bytes) continue;
    try{
      await loadPdfJs();
      const {rgb,StandardFonts}=window.PDFLib;

      // Separator pagina (EcoFinity huisstijl)
      const sepPg=mergedPdf.addPage([595,842]);
      sepPg.drawRectangle({x:0,y:808,width:595,height:34,color:rgb(0.878,0.482,0)});
      const boldFont=await mergedPdf.embedFont(StandardFonts.HelveticaBold);
      const regFont =await mergedPdf.embedFont(StandardFonts.Helvetica);
      sepPg.drawText("EcoFinity BV",{x:20,y:820,size:11,font:boldFont,color:rgb(1,1,1)});
      sepPg.drawText("Project: "+(customer.name||"—"),{x:160,y:820,size:10,font:regFont,color:rgb(1,1,1)});
      sepPg.drawRectangle({x:20,y:100,width:4,height:600,color:rgb(0.878,0.482,0)});
      sepPg.drawText(ds.type.toUpperCase(),{x:35,y:680,size:10,font:regFont,color:rgb(0.4,0.45,0.5)});
      sepPg.drawText(ds.label,{x:35,y:640,size:20,font:boldFont,color:rgb(0.06,0.09,0.16)});
      sepPg.drawText("Technische specificaties — bijlage bij uw ZonneDak rapport",{x:35,y:610,size:10,font:regFont,color:rgb(0.4,0.45,0.5)});
      sepPg.drawLine({start:{x:35,y:595},end:{x:560,y:595},thickness:1,color:rgb(0.878,0.482,0)});
      sepPg.drawText("Dit document is automatisch bijgevoegd door ZonneDak Analyzer.",{x:35,y:570,size:9,font:regFont,color:rgb(0.4,0.45,0.5)});
      sepPg.drawText("Datum rapport: "+new Date().toLocaleDateString("nl-BE"),{x:35,y:555,size:9,font:regFont,color:rgb(0.4,0.45,0.5)});
      sepPg.drawRectangle({x:0,y:0,width:595,height:30,color:rgb(0.97,0.98,0.99)});
      sepPg.drawLine({start:{x:0,y:30},end:{x:595,y:30},thickness:0.5,color:rgb(0.878,0.482,0)});
      sepPg.drawText("EcoFinity BV · www.ecofinity.eu · info@ecofinity.eu · +32 55 495865",{x:20,y:12,size:7,font:regFont,color:rgb(0.4,0.45,0.5)});

      // Render elke pagina via pdf.js → canvas → JPEG → jsPDF pagina → mergedPdf
      const pdfTask=window.pdfjsLib.getDocument({data:new Uint8Array(bytes).buffer});
      const pdfDoc2=await pdfTask.promise;
      const numPages=pdfDoc2.numPages;

      for(let pi=1;pi<=numPages;pi++){
        const pg=await pdfDoc2.getPage(pi);
        const vp=pg.getViewport({scale:2.0});
        const cvs=document.createElement("canvas");
        cvs.width=vp.width;cvs.height=vp.height;
        const ctx2=cvs.getContext("2d");
        ctx2.fillStyle="#ffffff";
        ctx2.fillRect(0,0,cvs.width,cvs.height);
        await pg.render({canvasContext:ctx2,viewport:vp}).promise;
        const jpegUrl=cvs.toDataURL("image/jpeg",0.88);
        const ratio=cvs.height/cvs.width;
        // Fit in A4 met 10mm marge
        const pgM=10,pgW2=210-2*pgM,pgH2=297-2*pgM;
        const fitH=Math.min(pgH2,pgW2*ratio);
        const fitW=fitH/ratio;
        const orient=ratio>1?"portrait":"landscape";
        const dPage=new jsPDF({orientation:orient,unit:"mm",format:"a4"});
        const dW=dPage.internal.pageSize.getWidth();
        const dH=dPage.internal.pageSize.getHeight();
        dPage.addImage(jpegUrl,"JPEG",(dW-fitW)/2,(dH-fitH)/2,fitW,fitH);
        const dBuf=dPage.output("arraybuffer");
        const dPdf=await PDFDocument.load(new Uint8Array(dBuf));
        const[dPg]=await mergedPdf.copyPages(dPdf,[0]);
        mergedPdf.addPage(dPg);
      }
      dsCount++;
    }catch(e){
      console.warn("Datasheet mislukt:",ds.file,e.message);
    }
  }

  const finalBytes=await mergedPdf.save();
  const blob=new Blob([finalBytes],{type:"application/pdf"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`ZonneDak_${(customer.name||"rapport").replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}.pdf`;
  a.click();URL.revokeObjectURL(url);
  return dsCount;
}


function PanelCard({p,selected,onSelect,onDelete,canDelete}){return(
  <div className={`card ${selected?"selected":""}`} onClick={()=>onSelect(p.id)}>
    <div className="card-name">{p.model}</div><div className="card-brand">{p.brand}</div>
    <div className="chips"><span className="chip gold">{p.watt}W</span><span className="chip">{p.eff}% eff</span><span className="chip">{p.area} m²</span><span className="chip">{p.warranty}j</span></div>
    {p.dims&&<div style={{fontSize:7,color:"var(--muted)",marginTop:4}}>{p.dims} · {p.weight}</div>}
    {canDelete&&<button className="btn danger sm" style={{marginTop:5,width:"fit-content"}} onClick={e=>{e.stopPropagation();onDelete(p.id);}}>✕</button>}
  </div>
);}
function InverterCard({inv,selected,onSelect,onDelete,canDelete}){
  const isAlpha=inv.brand?.toLowerCase().includes("alpha");
  const mpptCount=inv.mpptCount||inv.mppt||"?";
  const maxPvKwp=inv.maxPv?`max ${(inv.maxPv/1000).toFixed(1)}kWp`:"";
  return(
  <div className={`inv-card ${selected?"selected":""}`} onClick={()=>onSelect(inv.id)}>
    {isAlpha&&<div className="alpha-badge">⚡ AlphaESS G3</div>}
    <div className="card-name">{inv.model}</div>
    <div className="card-brand">{inv.brand} · {inv.fase}</div>
    <div className="chips">
      <span className={`chip ${isAlpha?"alpha-c":"blue-c"}`}>{inv.kw}kW</span>
      <span className="chip">{mpptCount} MPPT</span>
      {maxPvKwp&&<span className="chip">{maxPvKwp}</span>}
      <span className="chip">{inv.eff||"—"}% eff</span>
      <span className="chip">{inv.warranty}j</span>
    </div>
    {inv.notes&&<div className="card-notes">{inv.notes}</div>}
    {inv.datasheetName&&<div style={{fontSize:7,color:"var(--green)",marginTop:4}}>📄 {inv.datasheetName}</div>}
    {canDelete&&<button className="btn danger sm" style={{marginTop:5,width:"fit-content"}}
      onClick={e=>{e.stopPropagation();onDelete(inv.id);}}>✕ Verwijder</button>}
  </div>
);}
function BattCard({b,selected,onSelect,onDelete,canDelete}){return(
  <div className={`card batt-card ${b.isAlpha?"alpha-card":""} ${selected?"selected":""}`} onClick={()=>onSelect(b.id)}>
    {b.isAlpha&&<div className="alpha-badge">🔋 AlphaESS G3</div>}
    <div className="card-name">{b.model}</div><div className="card-brand">{b.brand}</div>
    <div className="chips"><span className={`chip ${b.isAlpha?"alpha-c":"blue-c"}`}>{b.kwh} kWh</span><span className="chip">{b.cycles.toLocaleString()} cycli</span>{b.dod&&<span className="chip">{b.dod}% DoD</span>}<span className="chip">{b.warranty}j</span></div>
    {b.notes&&<div className="card-notes">{b.notes}</div>}
    {canDelete&&<button className="btn danger sm" style={{marginTop:5,width:"fit-content"}} onClick={e=>{e.stopPropagation();onDelete(b.id);}}>✕</button>}
  </div>
);}

function TechRow({label,mppts,val,check}){
  return(
    <tr style={{borderBottom:"1px solid var(--border)"}}>
      <td style={{padding:"5px 4px",color:"var(--muted)"}}>{label}</td>
      {mppts.map((m,i)=>(
        <td key={i} style={{padding:"5px 4px",textAlign:"right"}}>
          {check?(check(m)
            ?<span style={{color:"var(--green)",marginRight:4}}>✓</span>
            :<span style={{color:"var(--red)",marginRight:4}}>✗</span>
          ):null}
          <strong>{val(m)}</strong>
        </td>
      ))}
    </tr>
  );
}
function NewPanelForm({onAdd}){
  const e0={brand:"",model:"",watt:"",area:"",eff:"",warranty:"25",dims:"",weight:"",
    voc:"",vmp:"",isc:"",imp:"",tempCoeffVoc:"-0.25",tempCoeffPmax:"-0.30"};
  const[f,setF]=useState(e0);
  const[dsFile,setDsFile]=useState(null); // {name, data: ArrayBuffer}
  const[dsLoading,setDsLoading]=useState(false);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const ok=f.brand&&f.model&&+f.watt>0&&+f.area>0&&+f.eff>0;

  const handleDsUpload=e=>{
    const file=e.target.files?.[0];
    if(!file) return;
    setDsLoading(true);
    const reader=new FileReader();
    reader.onload=ev=>{setDsFile({name:file.name,data:ev.target.result});setDsLoading(false);};
    reader.onerror=()=>setDsLoading(false);
    reader.readAsArrayBuffer(file);
  };

  return(<div className="new-form"><h4>➕ Nieuw paneel toevoegen</h4>
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
      <div><div className="inp-label">Garantie (j)</div><input className="inp" type="number" placeholder="25" value={f.warranty} onChange={e=>s("warranty",e.target.value)}/></div>
      <div></div>
    </div>
    <div className="inp-2">
      <div><div className="inp-label">Afmetingen</div><input className="inp" placeholder="1756×1096×35mm" value={f.dims} onChange={e=>s("dims",e.target.value)}/></div>
      <div><div className="inp-label">Gewicht</div><input className="inp" placeholder="21.3 kg" value={f.weight} onChange={e=>s("weight",e.target.value)}/></div>
    </div>
    {/* Elektrische specs voor string-design */}
    <div style={{fontSize:9,color:"var(--muted)",borderTop:"1px solid var(--border)",paddingTop:6,marginTop:2}}>Elektrische specs (STC) — voor string-design</div>
    <div className="inp-3">
      <div><div className="inp-label">Voc (V)</div><input className="inp" type="number" placeholder="38.7" value={f.voc} onChange={e=>s("voc",e.target.value)}/></div>
      <div><div className="inp-label">Vmp (V)</div><input className="inp" type="number" placeholder="32.7" value={f.vmp} onChange={e=>s("vmp",e.target.value)}/></div>
      <div><div className="inp-label">Isc (A)</div><input className="inp" type="number" placeholder="14.4" value={f.isc} onChange={e=>s("isc",e.target.value)}/></div>
    </div>
    <div className="inp-3">
      <div><div className="inp-label">Imp (A)</div><input className="inp" type="number" placeholder="13.5" value={f.imp} onChange={e=>s("imp",e.target.value)}/></div>
      <div><div className="inp-label">Temp Voc %/°C</div><input className="inp" type="number" placeholder="-0.25" value={f.tempCoeffVoc} onChange={e=>s("tempCoeffVoc",e.target.value)}/></div>
      <div><div className="inp-label">Temp Pmax %/°C</div><input className="inp" type="number" placeholder="-0.30" value={f.tempCoeffPmax} onChange={e=>s("tempCoeffPmax",e.target.value)}/></div>
    </div>
    {/* Datasheet upload */}
    <div style={{borderTop:"1px solid var(--border)",paddingTop:6,marginTop:2}}>
      <div className="inp-label">Datasheet PDF (optioneel)</div>
      <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"7px 10px",
        background:dsFile?"var(--green-bg)":"var(--bg3)",border:`1px solid ${dsFile?"var(--green-border)":"var(--border-dark)"}`,
        borderRadius:6,fontSize:10}}>
        <input type="file" accept="application/pdf,.pdf" onChange={handleDsUpload} style={{display:"none"}}/>
        {dsLoading?"⏳ Laden...":dsFile?`✅ ${dsFile.name}`:"📄 Klik om datasheet te uploaden"}
      </label>
      {dsFile&&<button className="btn danger sm" style={{marginTop:4}} onClick={()=>setDsFile(null)}>✕ Verwijder datasheet</button>}
    </div>
    <button className="btn full" disabled={!ok} onClick={()=>{
      onAdd({...f,id:Date.now(),watt:+f.watt,area:+f.area,eff:+f.eff,price:0,warranty:+f.warranty,
        voc:+f.voc||undefined,vmp:+f.vmp||undefined,isc:+f.isc||undefined,imp:+f.imp||undefined,
        tempCoeffVoc:+f.tempCoeffVoc||undefined,tempCoeffPmax:+f.tempCoeffPmax||undefined,
        datasheetData:dsFile?.data||null,datasheetName:dsFile?.name||null,datasheet:null});
      setF(e0);setDsFile(null);
    }}>Paneel toevoegen</button>
  </div>);}

function NewInverterForm({onAdd}){
  const e0={brand:"",model:"",fase:"1-fase",kw:"",mppt:"2",maxPv:"",eff:"97",warranty:"10",notes:""};
  const[f,setF]=useState(e0);
  const[dsFile,setDsFile]=useState(null);
  const[dsLoading,setDsLoading]=useState(false);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const ok=f.brand&&f.model&&+f.kw>0;

  const handleDsUpload=e=>{
    const file=e.target.files?.[0];
    if(!file) return;
    setDsLoading(true);
    const reader=new FileReader();
    reader.onload=ev=>{setDsFile({name:file.name,data:ev.target.result});setDsLoading(false);};
    reader.onerror=()=>setDsLoading(false);
    reader.readAsArrayBuffer(file);
  };

  return(<div className="new-form"><h4>➕ Nieuwe omvormer toevoegen</h4>
    <div className="inp-2">
      <div><div className="inp-label">Merk</div><input className="inp" placeholder="SMA" value={f.brand} onChange={e=>s("brand",e.target.value)}/></div>
      <div><div className="inp-label">Model</div><input className="inp" placeholder="Sunny Boy 5.0" value={f.model} onChange={e=>s("model",e.target.value)}/></div>
    </div>
    <div className="inp-3">
      <div><div className="inp-label">AC vermogen (kW)</div><input className="inp" type="number" placeholder="5" value={f.kw} onChange={e=>s("kw",e.target.value)}/></div>
      <div><div className="inp-label">Fase</div>
        <select className="inp" value={f.fase} onChange={e=>s("fase",e.target.value)}>
          <option value="1-fase">1-fase</option>
          <option value="3-fase">3-fase</option>
        </select>
      </div>
      <div><div className="inp-label">MPPT inputs</div><input className="inp" type="number" placeholder="2" value={f.mppt} onChange={e=>s("mppt",e.target.value)}/></div>
    </div>
    <div className="inp-3">
      <div><div className="inp-label">Max PV (W)</div><input className="inp" type="number" placeholder="10000" value={f.maxPv} onChange={e=>s("maxPv",e.target.value)}/></div>
      <div><div className="inp-label">Eff %</div><input className="inp" type="number" placeholder="97" value={f.eff} onChange={e=>s("eff",e.target.value)}/></div>
      <div><div className="inp-label">Garantie (j)</div><input className="inp" type="number" placeholder="10" value={f.warranty} onChange={e=>s("warranty",e.target.value)}/></div>
    </div>
    <div><div className="inp-label">Notities</div><input className="inp" placeholder="Korte beschrijving..." value={f.notes} onChange={e=>s("notes",e.target.value)}/></div>
    {/* Datasheet upload */}
    <div style={{borderTop:"1px solid var(--border)",paddingTop:6,marginTop:2}}>
      <div className="inp-label">Datasheet PDF (optioneel)</div>
      <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"7px 10px",
        background:dsFile?"var(--green-bg)":"var(--bg3)",border:`1px solid ${dsFile?"var(--green-border)":"var(--border-dark)"}`,
        borderRadius:6,fontSize:10}}>
        <input type="file" accept="application/pdf,.pdf" onChange={handleDsUpload} style={{display:"none"}}/>
        {dsLoading?"⏳ Laden...":dsFile?`✅ ${dsFile.name}`:"📄 Klik om datasheet te uploaden"}
      </label>
      {dsFile&&<button className="btn danger sm" style={{marginTop:4}} onClick={()=>setDsFile(null)}>✕ Verwijder datasheet</button>}
    </div>
    <button className="btn alpha full" disabled={!ok} onClick={()=>{
      onAdd({...f,id:Date.now(),kw:+f.kw,mppt:+f.mppt,maxPv:+f.maxPv||+f.kw*2000,
        eff:+f.eff||97,price:0,warranty:+f.warranty||10,
        mppt:+f.mppt||2,mpptCount:+f.mppt||2,maxDcVoltage:600,maxInputCurrentPerMppt:16,
        mpptVoltageMin:100,mpptVoltageMax:560,
        maxAcPower:Math.round(+f.kw*1000)||5000,
        maxDcPower:+f.maxPv||Math.round(+f.kw*2000),
        datasheetData:dsFile?.data||null,datasheetName:dsFile?.name||null,datasheet:null});
      setF(e0);setDsFile(null);
    }}>Omvormer toevoegen</button>
  </div>);}

function NewBattForm({onAdd}){
  const e0={brand:"",model:"",kwh:"",cycles:"",warranty:"10"};
  const[f,setF]=useState(e0);const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const ok=f.brand&&f.model&&+f.kwh>0&&+f.cycles>0;
  return(<div className="new-form"><h4>➕ Nieuwe batterij toevoegen</h4>
    <div className="inp-2"><div><div className="inp-label">Merk</div><input className="inp" placeholder="Tesla" value={f.brand} onChange={e=>s("brand",e.target.value)}/></div><div><div className="inp-label">Model</div><input className="inp" placeholder="Powerwall 3" value={f.model} onChange={e=>s("model",e.target.value)}/></div></div>
    <div className="inp-3"><div><div className="inp-label">kWh</div><input className="inp" type="number" placeholder="10" value={f.kwh} onChange={e=>s("kwh",e.target.value)}/></div><div><div className="inp-label">Cycli</div><input className="inp" type="number" placeholder="6000" value={f.cycles} onChange={e=>s("cycles",e.target.value)}/></div><div><div className="inp-label">Garantie (j)</div><input className="inp" type="number" placeholder="10" value={f.warranty} onChange={e=>s("warranty",e.target.value)}/></div></div>
    <button className="btn blue full" disabled={!ok} onClick={()=>{onAdd({...f,id:Date.now(),kwh:+f.kwh,price:0,cycles:+f.cycles,warranty:+f.warranty,isAlpha:false});setF(e0);}}>Batterij toevoegen</button>
  </div>);}

function TeamleaderPanel({tlAuth,tlAuthMsg,tlQuery,setTlQuery,tlResults,tlSearching,
  tlContact,tlLoadingDetails,tlSelectedAddressIdx,tlSelectedDealId,setTlSelectedDealId,
  tlWorkOrders,tlWorkOrdersLoading,tlSelectedWorkOrder,tlWorkOrderData,onApplyWorkOrder,
  onLogin,onLogout,onSelectContact,onSelectAddress,
  showNewDealForm,newDealTitle,setNewDealTitle,newDealValue,setNewDealValue,
  dealOptions,newDealPipelineId,setNewDealPipelineId,creatingDeal,
  onOpenNewDeal,onCancelNewDeal,onCreateDeal,onConfirm,pendingGeo}){
  if(tlAuth===null) return <div className="customer-section"><div style={{fontSize:9,color:"var(--muted)"}}>Teamleader status laden...</div></div>;
  if(tlAuth===false||!tlAuth.logged_in){
    return(
      <div className="customer-section">
        <div className="sl">Teamleader</div>
        {tlAuthMsg&&<div style={{fontSize:9,color:tlAuthMsg.includes("succesvol")?"var(--green)":"var(--red)"}}>{tlAuthMsg}</div>}
        <div style={{fontSize:9,color:"var(--muted)",marginBottom:6}}>Niet ingelogd. Log in om klanten op te zoeken.</div>
        <button className="btn full" onClick={onLogin}>🔗 Inloggen via Teamleader</button>
      </div>
    );
  }
  return(
    <div className="customer-section">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div className="sl">Teamleader</div>
        <button onClick={onLogout} style={{background:"none",border:"none",color:"var(--muted)",fontSize:9,cursor:"pointer"}} title="Uitloggen">⏻ Uitloggen</button>
      </div>
      <div style={{fontSize:9,color:"var(--muted)"}}>Ingelogd als <strong>{tlAuth.user?.name||tlAuth.user?.email||"?"}</strong></div>
      {tlAuthMsg&&<div style={{fontSize:9,color:"var(--green)"}}>{tlAuthMsg}</div>}
      <div style={{position:"relative"}}>
        <div className="inp-label" style={{fontSize:9,fontWeight:600}}>1️⃣ Klant zoeken in Teamleader</div>
        <input className="inp" type="text" placeholder="Typ minstens 2 letters..."
               value={tlQuery} onChange={e=>setTlQuery(e.target.value)} autoComplete="off"/>
        {tlSearching&&<div style={{fontSize:8,color:"var(--muted)",marginTop:2}}>Zoeken...</div>}
        {tlResults.length>0&&!tlContact&&<div style={{
              position:"absolute",top:"100%",left:0,right:0,
              background:"#ffffff",
              border:"2px solid var(--amber)",
              borderRadius:6,
              zIndex:99999,
              maxHeight:280,overflowY:"auto",
              marginTop:3,
              boxShadow:"0 8px 24px rgba(0,0,0,0.18)",
            }}>
          {tlResults.map(r=>(
            <div key={r.type+r.id} onClick={()=>onSelectContact(r)} style={{
                  padding:"10px 14px",cursor:"pointer",
                  borderBottom:"1px solid #e2e8f0",
                  background:"#ffffff",
                  fontSize:12,lineHeight:1.4,
                }}
                 onMouseEnter={e=>{e.currentTarget.style.background="#fef3c7";e.currentTarget.style.borderLeft="3px solid #e07b00";}}
                 onMouseLeave={e=>{e.currentTarget.style.background="#ffffff";e.currentTarget.style.borderLeft="none";}}>
              <div style={{fontWeight:700,color:"#0f172a",fontSize:13}}>{r.name}</div>
              <div style={{fontSize:10,color:"#64748b",marginTop:2}}>
                {r.type==="company"?"🏢 Bedrijf":"👤 Persoon"}
                {r.primary_email&&<span style={{marginLeft:8}}>· {r.primary_email}</span>}
              </div>
            </div>
          ))}
        </div>}
      </div>
      {tlLoadingDetails&&<div style={{fontSize:9,color:"var(--alpha)",marginTop:6}}>⏳ Details ophalen...</div>}
      {tlContact&&!tlLoadingDetails&&<>
        <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:6,padding:8,marginTop:6}}>
          <div style={{fontSize:11,fontWeight:600}}>{tlContact.name}</div>
          {tlContact.emails?.length>0&&<div style={{fontSize:9,color:"var(--muted)"}}>{tlContact.emails.map(e=>e.email).join(" · ")}</div>}
        </div>
        {tlContact.addresses?.length>0&&<div style={{marginTop:8}}>
          <div className="sl" style={{fontSize:9,marginBottom:4}}>📍 Adres voor dit project</div>
          {tlContact.addresses.length===1
            ?<div style={{fontSize:9,padding:"6px 8px",background:"var(--green-bg)",border:"1px solid var(--green-border)",borderRadius:4,color:"var(--text)"}}>{tlContact.addresses[0].full}</div>
            :<div style={{display:"flex",flexDirection:"column",gap:3}}>
              {tlContact.addresses.map((a,idx)=>(
                <div key={idx}
                  onClick={()=>onSelectAddress(idx)}
                  style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 10px",
                    cursor:"pointer",borderRadius:5,fontSize:9,
                    background:tlSelectedAddressIdx===idx?"var(--amber-light)":"var(--bg3)",
                    border:tlSelectedAddressIdx===idx?"1.5px solid var(--amber)":"1px solid var(--border-dark)"}}>
                  <div style={{width:14,height:14,borderRadius:"50%",flexShrink:0,marginTop:1,
                    background:tlSelectedAddressIdx===idx?"var(--amber)":"var(--bg4)",
                    border:`2px solid ${tlSelectedAddressIdx===idx?"var(--amber)":"var(--border-dark)"}`,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {tlSelectedAddressIdx===idx&&<div style={{width:5,height:5,borderRadius:"50%",background:"#fff"}}/>}
                  </div>
                  <div>
                    <div style={{fontWeight:600,color:tlSelectedAddressIdx===idx?"var(--amber)":"var(--text)"}}>{a.type||"Adres"}</div>
                    <div style={{color:"var(--muted)",marginTop:1}}>{a.full}</div>
                  </div>
                </div>
              ))}
              {/* Toon geselecteerd adres bevestiging */}
              <div style={{fontSize:8,color:"var(--green)",marginTop:2,padding:"3px 6px",background:"var(--green-bg)",borderRadius:4}}>
                ✓ Geselecteerd: {tlContact.addresses[tlSelectedAddressIdx]?.full||"—"}
              </div>
            </div>
          }
        </div>}
        {tlContact.deals?.length>0&&<div style={{marginTop:10}}>
          <div className="sl" style={{fontSize:9,marginBottom:4}}>Koppel aan een Deal (optioneel)</div>
          <div style={{maxHeight:180,overflowY:"auto"}}>
            <label style={{display:"flex",alignItems:"flex-start",gap:6,padding:"4px 0",cursor:"pointer",fontSize:9}}>
              <input type="radio" checked={tlSelectedDealId===null} onChange={()=>setTlSelectedDealId(null)} style={{marginTop:2}}/>
              <span style={{color:"var(--muted)"}}>(geen deal koppelen)</span>
            </label>
            {tlContact.deals.map(d=>(
              <label key={d.id} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"4px 0",cursor:"pointer",fontSize:9,borderTop:"1px solid var(--border)"}}>
                <input type="radio" checked={tlSelectedDealId===d.id} onChange={()=>setTlSelectedDealId(d.id)} style={{marginTop:2}}/>
                <span><strong>{d.title}</strong>{d.phase&&<span style={{color:"var(--muted)"}}> · {d.phase}</span>}{d.estimated_value&&<span style={{color:"var(--muted)"}}> · €{d.estimated_value.toLocaleString("nl-BE")}</span>}</span>
              </label>
            ))}
          </div>
        </div>}
        {!showNewDealForm&&<button className="btn sec" onClick={onOpenNewDeal} style={{marginTop:8,fontSize:9,width:"100%"}}>+ Nieuwe deal aanmaken in Teamleader</button>}
        {showNewDealForm&&<div style={{marginTop:8,background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:6,padding:10}}>
          <div className="sl" style={{fontSize:9,marginBottom:6}}>Nieuwe deal aanmaken</div>
          <div className="inp-label" style={{fontSize:8}}>Titel</div>
          <input className="inp" value={newDealTitle} onChange={e=>setNewDealTitle(e.target.value)} placeholder="bv. Zonnepanelen Janssens 2026-04-26" maxLength={200}/>
          <div className="inp-label" style={{fontSize:8,marginTop:6}}>Pipeline</div>
          {!dealOptions?<div style={{fontSize:9,color:"var(--muted)"}}>Pipelines laden...</div>:
            dealOptions.pipelines?.length===0?<div style={{fontSize:9,color:"var(--red)"}}>Geen pipelines gevonden in TL.</div>:
            <select className="inp" value={newDealPipelineId||""} onChange={e=>setNewDealPipelineId(e.target.value)}>
              {dealOptions.pipelines.map(p=><option key={p.id} value={p.id}>{p.name}{p.isDefault?" (standaard)":""}{p.firstPhaseName?` — start in fase: ${p.firstPhaseName}`:""}</option>)}
            </select>}
          <div className="inp-label" style={{fontSize:8,marginTop:6}}>Geschatte waarde (€) — optioneel</div>
          <input className="inp" type="number" min="0" step="100" placeholder="Leeg laten als nog onbekend" value={newDealValue} onChange={e=>setNewDealValue(e.target.value)}/>
          <div style={{display:"flex",gap:6,marginTop:10}}>
            <button className="btn sec" onClick={onCancelNewDeal} disabled={creatingDeal} style={{flex:1,fontSize:9}}>Annuleren</button>
            <button className="btn full" onClick={onCreateDeal} disabled={creatingDeal||!newDealTitle.trim()||!newDealPipelineId} style={{flex:2,fontSize:9}}>{creatingDeal?"Aanmaken...":"✓ Aanmaken in Teamleader"}</button>
          </div>
        </div>}

      {/* ── Werkbonnen ────────────────────────────────────────────────── */}
      <div style={{marginTop:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div className="sl" style={{fontSize:9}}>📋 Werkbonnen / Bezoeken</div>
          {tlWorkOrdersLoading&&<div style={{fontSize:8,color:"var(--alpha)"}}>⏳ laden...</div>}
          {!tlWorkOrdersLoading&&tlWorkOrders.length===0&&<div style={{fontSize:8,color:"var(--muted)"}}>Geen gevonden</div>}
        </div>

        {tlWorkOrders.length>0&&<div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
          {tlWorkOrders.map(wo=>{
            const isSel=tlSelectedWorkOrder?.id===wo.id&&tlSelectedWorkOrder?.source===wo.source;
            return(
              <div key={wo.id+wo.source}
                style={{padding:"7px 10px",borderRadius:6,cursor:"pointer",
                  background:isSel?"var(--alpha-bg)":"var(--bg2)",
                  border:`1.5px solid ${isSel?"var(--alpha)":"var(--border)"}`,
                  transition:"all .12s"}}
                onClick={()=>onApplyWorkOrder(wo)}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                  <div style={{fontSize:10,fontWeight:600,color:isSel?"var(--alpha)":"var(--text)",flex:1,minWidth:0}}>
                    {wo.source==="appointment"?"📅":wo.source==="file"?"📄":"⏱"} {wo.title}
                  </div>
                  <div style={{fontSize:8,color:"var(--muted)",whiteSpace:"nowrap",flexShrink:0}}>
                    {wo.date?(new Date(wo.date)).toLocaleDateString("nl-BE",{day:"2-digit",month:"2-digit",year:"numeric"}):"—"}
                  </div>
                </div>
                {wo.description&&wo.description!==wo.title&&<div style={{fontSize:8,color:"var(--muted)",marginTop:3,
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {wo.description.substring(0,80)}{wo.description.length>80?"…":""}
                </div>}
                {wo.status&&<div style={{marginTop:3}}>
                  <span style={{fontSize:7,padding:"1px 5px",borderRadius:3,background:"var(--bg3)",color:"var(--muted)"}}>
                    {wo.status}
                  </span>
                </div>}
                {isSel&&<div style={{marginTop:5,fontSize:8,color:"var(--alpha)",fontWeight:600}}>
                  ✅ Geselecteerd als bron
                </div>}
              </div>
            );
          })}
        </div>}

        {/* Geëxtraheerde werkbondata */}
        {tlWorkOrderData&&<div style={{marginTop:8,padding:"8px 10px",borderRadius:6,
          background:"var(--bg2)",border:"1px solid var(--border)"}}>
          <div style={{fontSize:9,fontWeight:700,marginBottom:6,color:"var(--text)"}}>
            📥 Automatisch ingevuld uit werkbon:
          </div>
          {[
            {label:"Jaarverbruik",key:"annualConsumptionKwh",fmt:v=>`${v} kWh/j`},
            {label:"Bouwjaar",key:"buildingYear",fmt:v=>`${v}`},
            {label:"Gezinssituatie",key:"familySituation",fmt:v=>v},
            {label:"Digitale meter",key:"hasDigitalMeter",fmt:v=>v},
            {label:"Bestaande PV",key:"hasExistingPV",fmt:v=>v},
            {label:"Extra verbruikers",key:"futureConsumers",fmt:v=>v.join(", ")},
            {label:"Technieker nota",key:"technicianNotes",fmt:v=>v.substring(0,60)+(v.length>60?"…":"")},
          ].filter(({key})=>tlWorkOrderData[key]!=null).map(({label,key,fmt})=>{
            const conf=tlWorkOrderData.confidence?.[key]||"";
            const toVerify=tlWorkOrderData.fieldsToVerify?.includes(key);
            return(
              <div key={key} style={{display:"flex",alignItems:"flex-start",gap:6,marginBottom:3}}>
                <div style={{fontSize:8,color:"var(--muted)",width:80,flexShrink:0}}>{label}</div>
                <div style={{fontSize:8,flex:1}}>
                  <span style={{color:conf==="high"?"var(--green)":conf==="medium"?"var(--amber)":"var(--red)"}}
                    title={conf==="high"?"Hoge betrouwbaarheid":conf==="medium"?"Te controleren":"Onzeker"}>
                    {fmt(tlWorkOrderData[key])}
                    {conf==="high"&&" ✓"}
                    {toVerify&&" ⚠️"}
                  </span>
                </div>
              </div>
            );
          })}
          {tlWorkOrderData.fieldsToVerify?.length>0&&<div style={{fontSize:7,color:"var(--amber)",marginTop:4,
            padding:"3px 6px",background:"#fffbeb",borderRadius:3}}>
            ⚠️ Velden met ⚠️ zijn onzeker — controleer ze vóór gebruik.
          </div>}
        </div>}
      </div>

      </>}
    </div>
  );
}

function ProjectPanel({customer,projectList,lastSavedAt,isLoadingProject,
  showProjectMenu,setShowProjectMenu,onNew,onLoad,onDelete,onDownload,onUpload}){
  const fileInputRef=useRef(null);
  const handleFileChange=e=>{const f=e.target.files?.[0];if(f) onUpload(f);e.target.value="";};
  const hasName=!!customer?.name?.trim();
  const savedLabel=lastSavedAt
    ?(`💾 Opgeslagen · ${new Date(lastSavedAt).toLocaleTimeString("nl-BE",{hour:"2-digit",minute:"2-digit"})}`)
    :(hasName?"💾 Nog niet opgeslagen":"💡 Vul klantnaam in om te starten");
  return(
    <div className="customer-section" style={{marginBottom:10}}>
      <div className="sl">Project</div>
      <div style={{fontSize:9,color:"var(--muted)"}}>{savedLabel}</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <button className="btn sec" onClick={onNew} style={{flex:"1 1 auto",fontSize:9}}>➕ Nieuw</button>
        <button className="btn sec" onClick={()=>setShowProjectMenu(v=>!v)} style={{flex:"1 1 auto",fontSize:9}} disabled={projectList.length===0}>📂 Openen ({projectList.length})</button>
        <button className="btn sec" onClick={onDownload} style={{flex:"1 1 auto",fontSize:9}} disabled={!hasName}>⬇ Download</button>
        <button className="btn sec" onClick={()=>fileInputRef.current?.click()} style={{flex:"1 1 auto",fontSize:9}}>⬆ Upload</button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileChange} style={{display:"none"}}/>
      </div>
      {showProjectMenu&&projectList.length>0&&<div style={{background:"var(--bg1)",border:"1px solid var(--border)",borderRadius:6,maxHeight:200,overflowY:"auto",padding:4}}>
        {projectList.map(p=>(
          <div key={p.customerName} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",borderRadius:4,cursor:"pointer"}}
               onMouseEnter={e=>e.currentTarget.style.background="var(--bg2)"}
               onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div style={{flex:1,cursor:"pointer"}} onClick={()=>onLoad(p.customerName)}>
              <div style={{fontSize:10,fontWeight:600}}>{p.customerName}</div>
              <div style={{fontSize:8,color:"var(--muted)"}}>{new Date(p.savedAt).toLocaleString("nl-BE",{dateStyle:"short",timeStyle:"short"})}</div>
            </div>
            <button onClick={()=>onDelete(p.customerName)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:11,padding:"2px 6px"}} title="Verwijderen">🗑</button>
          </div>
        ))}
      </div>}
      {isLoadingProject&&<div style={{fontSize:9,color:"var(--alpha)"}}>⏳ Project wordt geladen...</div>}


    </div>

  );
}


export class ErrorBoundary extends Component {
  constructor(props){super(props);this.state={hasError:false,error:null};}
  static getDerivedStateFromError(error){return{hasError:true,error};}
  componentDidCatch(error,info){console.error("[ZonneDak ErrorBoundary]",error,info);}
  render(){
    if(this.state.hasError){
      return(
        <div style={{padding:32,fontFamily:"'IBM Plex Mono',monospace",color:"#dc2626",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,margin:16}}>
          <strong>Onverwachte fout</strong><br/><br/>
          <code style={{fontSize:11}}>{this.state.error?.message}</code><br/><br/>
          <button onClick={()=>window.location.reload()} style={{padding:"8px 16px",background:"#dc2626",color:"#fff",border:"none",borderRadius:6,cursor:"pointer"}}>Pagina herladen</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App(){
  const[activeTab,setActiveTab]=useState("klant");
  const[query,setQuery]=useState("");const[suggs,setSuggs]=useState([]);const[showSuggs,setShowSuggs]=useState(false);
  const[coords,setCoords]=useState(null);const[displayName,setDisplayName]=useState("");
  const[slope,setSlope]=useState(35);const[orientation,setOrientation]=useState("Z");
  const[activeLayer,setActiveLayer]=useState("luchtfoto");
  const[mapReady,setMapReady]=useState(false);

  const[grbStatus,setGrbStatus]=useState("idle");
  const[buildingCoords,setBuildingCoords]=useState(null);
  const[detectedArea,setDetectedArea]=useState(null);
  // Multi-building state
  const[buildings,setBuildings]=useState([]); // alle GRB-gebouwen op het perceel
  const[selBuildingId,setSelBuildingId]=useState(null); // actief gebouw in sidebar
  const buildingLayersRef=useRef({}); // map: id → Leaflet layerGroup

  const[dhmStatus,setDhmStatus]=useState("idle");const[dhmError,setDhmError]=useState("");
  const[detectedFaces,setDetectedFaces]=useState(null);const[selFaceIdx,setSelFaceIdx]=useState(0);
  const[editMode,setEditMode]=useState(false);
  const[panelMoveMode,setPanelMoveMode]=useState(false);
  const[panelRotOffset,setPanelRotOffset]=useState(0);
  const[panelOrient,setPanelOrient]=useState("portrait");
  const panelDataRef=useRef(null);
  const ridgeAngleDegRef=useRef(0);
  const detectedFacesRef=useRef(null);
  const draggedPolygonsRef=useRef(null);

  const leafRef=useRef(null);const markerRef=useRef(null);
  const selectingRef=useRef(false);
  const baseTileRef=useRef(null);
  const dhmLayerRef=useRef(null);const searchTO=useRef(null);
  const roofLayerRef=useRef(null);
  // Multi-vlak panels: key = `${buildingId}_${faceIdx}`
  const panelLayersByFaceRef=useRef({}); // {key: L.layerGroup}
  const panelDataByFaceRef=useRef({});   // {key: panelData[]}
  const [panelCountsByFace,setPanelCountsByFace]=useState({}); // {key:count} triggers re-render
  const panelLayerRef=useRef(null); // actieve laag (voor move-mode)
  // Sla oriëntatie + helling op per vlak op het moment van tekenen
  // (gebruiker kan oriëntatie handmatig overschrijven → LiDAR waarde is dan verouderd)
  const panelFaceOrientRef=useRef({}); // {faceKey: {orientation, slope}}

  const[panels,setPanels]=useState(DEFAULT_PANELS);
  const[selPanelId,setSelPanelId]=useState(1);
  const selPanel=panels.find(p=>p.id===selPanelId)||panels[0];

  const[inverters,setInverters]=useState(DEFAULT_INVERTERS);
  const[selInvId,setSelInvId]=useState(2); // standaard: SMILE-G3-S5
  const selInv=inverters.find(i=>i.id===selInvId)||null;
  const[invFilter,setInvFilter]=useState("alle");

  const effectiveArea=detectedArea||80;
  const autoPanels=selPanel?Math.floor((effectiveArea*.75)/selPanel.area):0;
  const[customCount,setCustomCount]=useState(10);
  const panelCount=customCount!==null?customCount:autoPanels;

  const[batteries,setBatteries]=useState(DEFAULT_BATTERIES);
  const[battEnabled,setBattEnabled]=useState(true); // standaard aan
  const[selBattId,setSelBattId]=useState(2); // standaard: BAT-G3-9.3S
  const selBatt=batteries.find(b=>b.id===selBattId)||batteries[0];
  const[battFilter,setBattFilter]=useState("alle");

  const[results,setResults]=useState(null);
  const[aiText,setAiText]=useState("");const[aiLoading,setAiLoading]=useState(false);
  const[panelsDrawn,setPanelsDrawn]=useState(false);

  const[customer,setCustomer]=useState({name:"",address:"",email:""});
  const[tlToken,setTlToken]=useState("");

  const[tlAuth,setTlAuth]=useState(null);
  const[tlAuthMsg,setTlAuthMsg]=useState("");
  const[tlQuery,setTlQuery]=useState("");
  const[tlResults,setTlResults]=useState([]);
  const[tlSearching,setTlSearching]=useState(false);
  const[tlContact,setTlContact]=useState(null);
  const[tlLoadingDetails,setTlLoadingDetails]=useState(false);
  const[tlSelectedAddressIdx,setTlSelectedAddressIdx]=useState(0);
  const[tlSelectedDealId,setTlSelectedDealId]=useState(null);
  // Extra klantgegevens
  const[hasExistingPV,setHasExistingPV]=useState("onbekend"); // ja|nee|onbekend
  const[hasDigitalMeter,setHasDigitalMeter]=useState("onbekend"); // ja|nee|onbekend
  const[futureConsumers,setFutureConsumers]=useState([]); // ["warmtepomp","ev","airco","boiler"]
  const[focusGoal,setFocusGoal]=useState(""); // maxrendement|maxzelfverbruik|spreiding|maxpanelen|budget
  const[technicianNotes,setTechnicianNotes]=useState(""); // opmerkingen technieker
  const[internalNotes,setInternalNotes]=useState(""); // interne opmerkingen Ecofinity
  // Werkbon (work order) state
  const[tlWorkOrders,setTlWorkOrders]=useState([]); // lijst werkbonnen
  const[tlWorkOrdersLoading,setTlWorkOrdersLoading]=useState(false);
  const[tlSelectedWorkOrder,setTlSelectedWorkOrder]=useState(null); // gekozen werkbon
  const[tlWorkOrderData,setTlWorkOrderData]=useState(null); // geëxtraheerde data
  const[tlPendingGeo,setTlPendingGeo]=useState(null);
  const[tlConfirmed,setTlConfirmed]=useState(false);
  // TL offerte-templates per dakbedekking
  const[tlTemplates,setTlTemplates]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("zonnedak_tl_templates")||"{}");}catch{return {};}
  });
  const saveTlTemplates=(tmpl)=>{
    setTlTemplates(tmpl);
    try{localStorage.setItem("zonnedak_tl_templates",JSON.stringify(tmpl));}catch{}
  };
  const[tlQuotationList,setTlQuotationList]=useState([]);
  const[tlQuotationLoading,setTlQuotationLoading]=useState(false);
  const[tlCreateQuotStatus,setTlCreateQuotStatus]=useState(null);
  const[tlCreateQuotUrl,setTlCreateQuotUrl]=useState(null);
  // State voor de mapping-editor
  const[tlMappingOpen,setTlMappingOpen]=useState(false);
  const[tlMappingLines,setTlMappingLines]=useState([]); // geladen lijnposten uit template
  const[tlMappingValues,setTlMappingValues]=useState({}); // {lineKey: appValueKey}
  const[tlMappingLoading,setTlMappingLoading]=useState(false);
  const[showNewDealForm,setShowNewDealForm]=useState(false);
  const[newDealTitle,setNewDealTitle]=useState("");
  const[newDealValue,setNewDealValue]=useState("");
  const[dealOptions,setDealOptions]=useState(null);
  const[newDealPipelineId,setNewDealPipelineId]=useState(null);
  const[creatingDeal,setCreatingDeal]=useState(false);

  useEffect(()=>{
    const cb=TL.consumeAuthCallback();
    if(cb==='success'){setTlAuthMsg("Login succesvol!");setTimeout(()=>setTlAuthMsg(""),3000);}
    else if(cb==='denied'){setTlAuthMsg("Login geweigerd.");}
    else if(cb==='error'){setTlAuthMsg("Login fout — probeer opnieuw.");}
    TL.checkAuthStatus().then(s=>setTlAuth(s.logged_in?s:false));
  },[]);

  const debouncedSearchRef=useRef(null);
  if(!debouncedSearchRef.current){ debouncedSearchRef.current=TL.debounce(TL.searchContacts,400); }

  useEffect(()=>{
    if(!tlAuth?.logged_in||!tlQuery||tlQuery.trim().length<2){setTlResults([]);setTlSearching(false);return;}
    setTlSearching(true);
    debouncedSearchRef.current(tlQuery).then(res=>{
      if(res===null) return;
      setTlSearching(false);
      if(res?.notLoggedIn){setTlAuth(false);setTlResults([]);return;}
      setTlResults(res?.results||[]);
    });
  },[tlQuery,tlAuth?.logged_in]);

  const handleSelectTlContact=useCallback(async(item)=>{
    setTlLoadingDetails(true);setTlResults([]);setTlQuery(item.name);
    const details=await TL.getContactDetails(item.type,item.id);
    setTlLoadingDetails(false);
    if(details?.error){alert("Kon details niet ophalen: "+details.error);return;}
    setTlContact(details);
    if(details?.id) fetchWorkOrders(details.id,details.type||"contact");
    setTlSelectedAddressIdx(0);setTlSelectedDealId(null);
    const primaryEmail=details.emails?.[0]?.email||"";
    const primaryAddress=details.addresses?.[0];
    // Vul klantdata in maar navigeer NIET automatisch — wacht op deal + bevestiging
    setCustomer({name:details.name||"",address:primaryAddress?.full||"",email:primaryEmail});
    // Sla geocode-resultaat op voor later gebruik bij bevestiging
    if(primaryAddress){
      const geo=await TL.geocodeAddress(primaryAddress);
      if(geo) setTlPendingGeo({lat:String(geo.lat),lon:String(geo.lng),display_name:geo.displayName});
    }
  },[]);

  const handleSelectAddress=useCallback(async(idx)=>{
    setTlSelectedAddressIdx(idx);
    if(!tlContact?.addresses?.[idx]) return;
    const addr=tlContact.addresses[idx];
    setCustomer(c=>({...c,address:addr.full||""}));
    // Geocode het nieuwe adres maar navigeer nog niet
    const geo=await TL.geocodeAddress(addr);
    if(geo) setTlPendingGeo({lat:String(geo.lat),lon:String(geo.lng),display_name:geo.displayName});
  },[tlContact]);


  // Haal lijst van bestaande TL-offertes op voor template-mapping
  const fetchTlQuotations=useCallback(async()=>{
    if(!tlAuth?.logged_in) return;
    setTlQuotationLoading(true);
    try{
      const resp=await TL.apiCall("quotations.list",{page:{size:100,number:1}});
      const items=resp?.data||[];
      setTlQuotationList(items.map(q=>({id:q.id,name:q.name||q.reference||q.id})));
    }catch(e){console.warn("TL quotations.list:",e);}
    setTlQuotationLoading(false);
  },[tlAuth]);


  // Berekende waarden die je kan koppelen aan lijnposten
  const getTlAppValues=useCallback(()=>{
    if(!results) return [];
    const totalPlaced=Object.values(panelCountsByFace||{}).reduce((s,c)=>s+c,0)||results.panelCount||0;
    const vals=[
      {key:"panelCount",      label:"Aantal panelen",          value:totalPlaced,      unit:"st"},
      {key:"panelKwp",        label:"Piekvermogen (kWp)",      value:+(totalPlaced*(results.panel?.watt||0)/1000).toFixed(2), unit:"kWp"},
      {key:"panelWatt",       label:"Vermogen per paneel (W)", value:results.panel?.watt||0, unit:"W"},
      {key:"battCount",       label:"Aantal batterijen",       value:results.battResult?1:0, unit:"st"},
      {key:"invCount",        label:"Aantal omvormers",        value:1,                unit:"st"},
      {key:"roofArea",        label:"Dakoppervlak (m²)",       value:results.detectedArea||0, unit:"m²"},
      {key:"annualKwh",       label:"Jaaropbrengst (kWh)",     value:results.annualKwh||0, unit:"kWh"},
      {key:"fixed1",          label:"Vaste hoeveelheid: 1",    value:1,                unit:""},
      {key:"fixed2",          label:"Vaste hoeveelheid: 2",    value:2,                unit:""},
      {key:"keep",            label:"⬜ Ongewijzigd laten",    value:null,             unit:""},
    ];
    // Voeg aantal per vlak toe
    Object.entries(panelCountsByFace||{}).forEach(([key,cnt])=>{
      if(!cnt) return;
      const parts=key.split("_");
      const fIdx=parseInt(parts[parts.length-1])||0;
      const bld=buildings.find(x=>x.id===parts.slice(0,-1).join("_"));
      const face=bld?.faces?.[fIdx];
      const lbl=`Panelen ${bld?.label||"Gebouw"} vlak ${fIdx+1} (${face?.orientation||"?"})`;
      vals.push({key:`face_${key}`,label:lbl,value:cnt,unit:"st"});
    });
    return vals;
  },[results,panelCountsByFace,buildings]);

  // Laad template-lijnposten voor de mapping-editor
  const handleOpenMapping=useCallback(async()=>{
    const activeBld=buildings.find(b=>b.id===selBuildingId);
    const dakbed=activeBld?.dakbedekking;
    const templateId=tlTemplates[dakbed];
    if(!templateId){
      alert("Kies eerst een dakbedekking op tab 02 en stel de template in.");
      return;
    }
    setTlMappingLoading(true);
    setTlMappingOpen(true);
    try{
      const resp=await TL.apiCall("quotations.info",{id:templateId});
      const groups=resp?.data?.grouped_lines||[];
      // Flatten alle items met unieke sleutel
      const lines=[];
      groups.forEach((g,gi)=>{
        (g.items||[]).forEach((item,ii)=>{
          lines.push({
            key:`${gi}_${ii}`,
            groupIdx:gi,
            itemIdx:ii,
            description:item.description||`Post ${gi+1}.${ii+1}`,
            unit:item.unit||"",
            currentQty:item.quantity||1,
            unitPrice:item.unit_price?.amount||item.unit_price||0,
          });
        });
      });
      setTlMappingLines(lines);
      // Herstel eerder opgeslagen mapping voor dit daktype
      const savedMapping=JSON.parse(
        localStorage.getItem(`zonnedak_mapping_${dakbed}`)||"{}"
      );
      setTlMappingValues(savedMapping);
    }catch(e){
      alert("Lijnposten laden mislukt: "+e.message);
      setTlMappingOpen(false);
    }
    setTlMappingLoading(false);
  },[buildings,selBuildingId,tlTemplates]);

  // Sla mapping op + maak offerte aan
  const handleCreateTlQuotation=useCallback(async()=>{
    if(!tlSelectedDealId||!results) return;
    const activeBld=buildings.find(b=>b.id===selBuildingId);
    const dakbed=activeBld?.dakbedekking;
    const templateId=tlTemplates[dakbed];
    if(!templateId){
      alert("Geen template geconfigureerd voor dit daktype.");
      return;
    }
    // Sla mapping op voor hergebruik
    try{localStorage.setItem(`zonnedak_mapping_${dakbed}`,JSON.stringify(tlMappingValues));}catch{}
    setTlCreateQuotStatus("loading");setTlCreateQuotUrl(null);setTlMappingOpen(false);
    try{
      const appVals=getTlAppValues();
      const valMap=Object.fromEntries(appVals.map(v=>[v.key,v.value]));
      // Haal template opnieuw op (verse data)
      const resp=await TL.apiCall("quotations.info",{id:templateId});
      const groups=resp?.data?.grouped_lines||[];
      // Pas hoeveelheden aan op basis van mapping
      const adjustedGroups=groups.map((g,gi)=>({
        ...g,
        items:(g.items||[]).map((item,ii)=>{
          const lineKey=`${gi}_${ii}`;
          const mappedKey=tlMappingValues[lineKey];
          if(!mappedKey||mappedKey==="keep") return item;
          const newQty=valMap[mappedKey];
          if(newQty==null||newQty===undefined) return item;
          return {...item,quantity:newQty};
        })
      }));
      const quotResp=await TL.apiCall("quotations.create",{
        deal_id:tlSelectedDealId,
        name:`ZonneDak - ${customer.name||"klant"} - ${activeBld?.label||dakbed}`,
        grouped_lines:adjustedGroups,
      });
      const quotId=quotResp?.data?.id;
      setTlCreateQuotStatus("ok");
      setTlCreateQuotUrl(quotId?`https://focus.teamleader.eu/sale_detail.php?id=${tlSelectedDealId}`:null);
    }catch(e){
      console.error("TL offerte:",e);
      setTlCreateQuotStatus("error");
      alert("Offerte aanmaken mislukt: "+e.message);
    }
  },[tlSelectedDealId,buildings,selBuildingId,tlTemplates,tlMappingValues,results,customer,getTlAppValues]);

  // ── Werkbon parsing: extraheer klantdata uit tekst ─────────────────────────
  const parseWerkbonText=useCallback((rawText)=>{
    if(!rawText) return {};
    const txt=rawText.toLowerCase();
    const result={rawText,confidence:{}};

    // Jaarverbruik
    const kwhMatch=rawText.match(/(\d[\d.,]*)\s*(?:MWh|mwh)/i);
    const kwhMatch2=rawText.match(/(?:verbruik|elektriciteit|kWh|kwh)[^\d]{0,30}?(\d[\d.,]{0,8})\s*kWh/i)
      ||rawText.match(/(\d[\d.,]{2,8})\s*kWh/i);
    if(kwhMatch){
      // MWh → kWh
      const v=parseFloat(kwhMatch[1].replace(/\./g,"").replace(",","."))*1000;
      if(v>100&&v<100000){result.annualConsumptionKwh=Math.round(v);result.confidence.annualConsumptionKwh="high";}
    } else if(kwhMatch2){
      const raw=kwhMatch2[1].replace(/\./g,"").replace(",",".");
      const v=parseFloat(raw);
      if(v>100&&v<100000){result.annualConsumptionKwh=Math.round(v);
        result.confidence.annualConsumptionKwh=v>500?"high":"medium";}
    }

    // Bouwjaar
    const byMatch=rawText.match(/(?:bouwjaar|bj|gebouwd|woning van|opgeleverd)[^\d]{0,15}(\d{4})/i)
      ||rawText.match(/(19[2-9]\d|20[0-2]\d)/);
    if(byMatch){
      const yr=parseInt(byMatch[1]);
      if(yr>=1900&&yr<=2025){result.buildingYear=yr;
        result.confidence.buildingYear=rawText.match(/(?:bouwjaar|bj)/i)?"high":"medium";}
    }

    // Gezinssituatie
    const gezinMatch=rawText.match(/gezin[^.]{0,60}/i)
      ||rawText.match(/(\d)\s*(?:volwassen\w*)[^.]{0,40}/i)
      ||rawText.match(/koppel|alleenstaand|gepensioneer\w+/i);
    if(gezinMatch){
      result.familySituation=gezinMatch[0].trim().substring(0,80);
      result.confidence.familySituation="medium";
    }
    const persMatch=rawText.match(/(\d+)\s*persone?n?/i);
    if(persMatch){
      result.familySituation=(result.familySituation||"")+` (${persMatch[0]})`;
      result.familySituation=result.familySituation.trim();
      result.confidence.familySituation="high";
    }

    // Digitale meter
    if(/digitale\s*meter/i.test(txt)){
      result.hasDigitalMeter=/geen|niet|neen/i.test(rawText.match(/(?:geen|niet)?[^.]{0,10}digitale\s*meter/i)?.[0]||"")
        ?"nee":"ja";
      result.confidence.hasDigitalMeter="medium";
    }

    // Bestaande PV
    if(/(?:bestaande|reeds|al|huidige)\s*(?:zonnepanelen?|pv|installatie)/i.test(txt)){
      result.hasExistingPV="ja"; result.confidence.hasExistingPV="medium";
    } else if(/geen\s*(?:zonnepanelen?|pv)/i.test(txt)){
      result.hasExistingPV="nee"; result.confidence.hasExistingPV="high";
    }

    // Extra verbruikers
    const futureConsumers=[];
    if(/warmtepomp/i.test(txt)) futureConsumers.push("warmtepomp");
    if(/elektrische\s*(?:wagen|auto)|EV|laadpaal/i.test(rawText)) futureConsumers.push("elektrische wagen");
    if(/airco/i.test(txt)) futureConsumers.push("airco");
    if(/elektrische\s*boiler|warmwater/i.test(txt)) futureConsumers.push("elektrische boiler");
    if(futureConsumers.length>0){result.futureConsumers=futureConsumers;result.confidence.futureConsumers="medium";}

    // Opmerkingen techniker: alles na "opmerking" of "nota"
    const notaMatch=rawText.match(/(?:opmerking|nota|comment|remark)[^a-z]{0,5}([^\r\n]{10,200})/i);
    if(notaMatch){result.technicianNotes=notaMatch[1].trim();result.confidence.technicianNotes="high";}

    // Velden die controle nodig hebben
    result.fieldsToVerify=Object.entries(result.confidence)
      .filter(([,v])=>v==="medium"||v==="low")
      .map(([k])=>k);

    return result;
  },[]);

  // ── Haal werkbonnen op voor geselecteerde klant ─────────────────────────────
  const fetchWorkOrders=useCallback(async(contactId,contactType)=>{
    if(!tlAuth?.logged_in||!contactId) return;
    setTlWorkOrdersLoading(true);
    setTlWorkOrders([]);
    setTlSelectedWorkOrder(null);
    setTlWorkOrderData(null);
    try{
      // Strategie 1: appointments.list (bezoeken = werkbonnen)
      const apptResp=await TL.apiCall("appointments.list",{
        filter:{attendee_participant_ids:[{id:contactId,type:contactType}]},
        sort:[{field:"starts_at",order:"desc"}],
        page:{size:25,number:1}
      });
      const appts=(apptResp?.data||[]).map(a=>({
        id:a.id,source:"appointment",
        title:a.title||a.description||"Bezoek",
        date:a.starts_at?.date||a.starts_at||"",
        status:a.status||"",
        description:a.description||a.title||"",
        raw:a,
      }));

      // Strategie 2: timeTracking.list (tijdregistraties met notities)
      let tracks=[];
      try{
        const ttResp=await TL.apiCall("timeTracking.list",{
          filter:{subject:{id:contactId,type:contactType}},
          sort:[{field:"started_at",order:"desc"}],
          page:{size:25,number:1}
        });
        tracks=(ttResp?.data||[])
          .filter(t=>t.description&&t.description.length>10)
          .map(t=>({
            id:t.id,source:"timetracking",
            title:t.description?.substring(0,60)||"Tijdregistratie",
            date:t.started_at?.date||t.started_at||"",
            status:"",
            description:t.description||"",
            raw:t,
          }));
      }catch{}

      // Strategie 3: deals met files (PDF werkbonnen)
      let dealFiles=[];
      const deals=tlContact?.deals||[];
      for(const deal of deals.slice(0,3)){
        try{
          const dResp=await TL.apiCall("deals.info",{id:deal.id,include:"files"});
          const files=(dResp?.data?.files||[]).filter(f=>/pdf|werkbon/i.test(f.name||""));
          files.forEach(f=>dealFiles.push({
            id:f.id,source:"file",
            title:f.name||"PDF bestand",
            date:f.added_at?.date||"",
            status:"pdf",
            description:`PDF bestand van deal ${deal.title||deal.id}`,
            fileUrl:f.url||null,
            raw:f,
          }));
        }catch{}
      }

      const all=[...appts,...tracks,...dealFiles]
        .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      setTlWorkOrders(all);
    }catch(e){
      console.warn("Werkbonnen ophalen mislukt:",e);
    }
    setTlWorkOrdersLoading(false);
  },[tlAuth,tlContact]);

  // ── Gebruik werkbon als bron: extraheer en vul velden in ─────────────────
  const applyWorkOrder=useCallback(async(wo)=>{
    setTlSelectedWorkOrder(wo);
    // Combineer alle tekstvelden
    let raw=[wo.title,wo.description,wo.raw?.note,wo.raw?.text,wo.raw?.internal_remark]
      .filter(Boolean).join("\n");
    
    // Haal appointment details op voor meer info
    if(wo.source==="appointment"&&wo.id){
      try{
        const detail=await TL.apiCall("appointments.info",{id:wo.id});
        const d=detail?.data;
        if(d){
          raw=[raw,d.description,d.title,d.note,d.location].filter(Boolean).join("\n");
          // Koppelde deal voor context
          if(d.activity_types?.length>0) raw+="\nType: "+d.activity_types.map(t=>t.name).join(", ");
        }
      }catch{}
    }

    // Parse de tekst
    const parsed=parseWerkbonText(raw);
    parsed.teamleaderWorkOrderId=wo.id;
    parsed.sourceType="teamleader_"+wo.source;
    parsed.title=wo.title;
    parsed.date=wo.date;
    setTlWorkOrderData(parsed);

    // Vul velden automatisch in (alleen high/medium confidence)
    if(parsed.annualConsumptionKwh&&(parsed.confidence.annualConsumptionKwh==="high"||parsed.confidence.annualConsumptionKwh==="medium")){
      setAnnualConsumption(parsed.annualConsumptionKwh);
    }
    if(parsed.buildingYear){
      const yr=parsed.buildingYear;
      if(yr<2015) setBuildingAge("voor2015");
      else if(yr<2020) setBuildingAge("2015_2019");
      else setBuildingAge("na2019");
    }
    if(parsed.familySituation&&parsed.confidence.familySituation==="high"){
      const sit=parsed.familySituation.toLowerCase();
      if(/gepensioneer/i.test(sit)) setUsageProfile("gepensioneerd");
      else if(/alleenstaand/i.test(sit)) setUsageProfile("alleenstaand");
      else if(/werkend/i.test(sit)) setUsageProfile("werkend_koppel");
      else if(/thuis\s*werk/i.test(sit)) setUsageProfile("thuiswerker");
    }
    if(parsed.hasExistingPV) setHasExistingPV(parsed.hasExistingPV);
    if(parsed.hasDigitalMeter) setHasDigitalMeter(parsed.hasDigitalMeter);
    if(parsed.futureConsumers?.length>0) setFutureConsumers(parsed.futureConsumers);
    if(parsed.technicianNotes) setTechnicianNotes(parsed.technicianNotes);
  },[parseWerkbonText,setAnnualConsumption,setBuildingAge,setUsageProfile,
     setHasExistingPV,setHasDigitalMeter,setFutureConsumers,setTechnicianNotes]);

  const handleTlLogin=useCallback(()=>{TL.startTeamleaderLogin();},[]);
  const handleTlLogout=useCallback(()=>{TL.clearUserId();setTlAuth(false);setTlContact(null);setTlResults([]);setTlQuery("");setTlPendingGeo(null);},[]);

  // Bevestig klant: geocode was al gedaan bij contact/adres selectie,
  // nu pas navigeren naar de kaart + GRB laden
  const handleTlConfirm=useCallback(async()=>{
    if(!tlPendingGeo) return;
    await selectAddr({lat:tlPendingGeo.lat,lon:tlPendingGeo.lon,display_name:tlPendingGeo.display_name});
    setTlPendingGeo(null);
    setTlConfirmed(true);
  },[tlPendingGeo]);

  const handleOpenNewDeal=useCallback(async()=>{
    setShowNewDealForm(true);setNewDealTitle("Zonnepanelen");setNewDealValue("");
    if(!dealOptions){
      const opts=await TL.getDealOptions();
      if(opts?.error){alert("Kon pipelines niet laden: "+opts.error);setShowNewDealForm(false);return;}
      setDealOptions(opts);
      if(opts.pipelines?.length>0){setNewDealPipelineId(opts.pipelines[0].id);}
    }
  },[tlContact,customer.name,dealOptions]);

  const handleCancelNewDeal=useCallback(()=>{setShowNewDealForm(false);setNewDealTitle("");setNewDealValue("");},[]);

  const handleCreateDeal=useCallback(async()=>{
    if(!tlContact){alert("Geen klant geselecteerd");return;}
    if(!newDealTitle.trim()){alert("Vul een titel in");return;}
    if(!newDealPipelineId){alert("Kies een pipeline");return;}
    const pipeline=dealOptions?.pipelines?.find(p=>p.id===newDealPipelineId);
    if(!pipeline?.firstPhaseId){alert("Deze pipeline heeft geen phases. Configureer eerst phases in Teamleader.");return;}
    setCreatingDeal(true);
    const valueNum=parseFloat(newDealValue);
    const result=await TL.createDeal({
      title:newDealTitle.trim(),contactType:tlContact.type,contactId:tlContact.id,
      phaseId:pipeline.firstPhaseId,responsibleUserId:dealOptions.currentUserId||undefined,
      estimatedValueEur:isFinite(valueNum)&&valueNum>0?valueNum:undefined,
    });
    setCreatingDeal(false);
    if(result.error){alert("Deal aanmaken mislukt: "+result.error);return;}
    setTlContact(prev=>prev?{...prev,deals:[result.deal,...(prev.deals||[])]}:prev);
    setTlSelectedDealId(result.deal.id);
    setShowNewDealForm(false);setNewDealTitle("");setNewDealValue("");
  },[tlContact,newDealTitle,newDealPipelineId,newDealValue,dealOptions]);

  const[pdfLoading,setPdfLoading]=useState(false);
  const[mapSnapshot,setMapSnapshot]=useState(null);
  const[snapshotLoading,setSnapshotLoading]=useState(false);
  const[editableAiText,setEditableAiText]=useState("");
  const[manualPanelPrice,setManualPanelPrice]=useState("");
  const[manualBatteryPrice,setManualBatteryPrice]=useState("");
  const[annualConsumption,setAnnualConsumption]=useState(3500);
  const[usageProfile,setUsageProfile]=useState("gezin"); // gebruikersprofiel
  const[gridFase,setGridFase]=useState(""); // aansluitspanning: mono|3f400|3f230
  const[buildingAge,setBuildingAge]=useState(""); // bouwjaar of "oud"/"nieuw"

  const autoSaverRef=useRef(null);
  const[lastSavedAt,setLastSavedAt]=useState(null);
  const[projectList,setProjectList]=useState([]);
  const[showProjectMenu,setShowProjectMenu]=useState(false);
  const[isLoadingProject,setIsLoadingProject]=useState(false);
  const suppressAutoSaveRef=useRef(false);

  if(!autoSaverRef.current){ autoSaverRef.current=createAutoSaver(1000); }

  const buildProjectSnapshot=useCallback(()=>({
    customer,coords,displayName,buildingCoords,detectedFaces,selFaceIdx,
    selPanelId,selInvId,selBattId,battEnabled,customCount,panelOrient,panelRotOffset,
    orientation,slope,manualPanelPrice,manualBatteryPrice,annualConsumption,usageProfile,buildingAge,gridFase,hasExistingPV,hasDigitalMeter,futureConsumers,focusGoal,technicianNotes,internalNotes,
    tlContactType:tlContact?.type||null,tlContactId:tlContact?.id||null,tlDealId:tlSelectedDealId,
  }),[customer,coords,displayName,buildingCoords,detectedFaces,selFaceIdx,
      selPanelId,selInvId,selBattId,battEnabled,customCount,panelOrient,panelRotOffset,
      orientation,slope,manualPanelPrice,manualBatteryPrice,annualConsumption,
      tlContact,tlSelectedDealId]);

  useEffect(()=>{
    if(suppressAutoSaveRef.current) return;
    if(!customer?.name?.trim()) return;
    const snapshot=buildProjectSnapshot();
    autoSaverRef.current.saveNow(customer.name,snapshot);
    const t=setTimeout(()=>setLastSavedAt(new Date()),1100);
    return()=>clearTimeout(t);
  },[buildProjectSnapshot,customer.name]);

  useEffect(()=>{setProjectList(listProjects());},[lastSavedAt]);

  const handleLoadProject=useCallback((customerName)=>{
    const p=loadProject(customerName);
    if(!p){alert("Project niet gevonden.");return;}
    suppressAutoSaveRef.current=true;setIsLoadingProject(true);
    const d=p.data||{};
    if(d.customer) setCustomer(d.customer);
    if(d.coords) setCoords(d.coords);
    if(d.displayName!=null) setDisplayName(d.displayName);
    if(d.buildingCoords) setBuildingCoords(d.buildingCoords);
    if(d.detectedFaces) setDetectedFaces(d.detectedFaces);
    if(d.selFaceIdx!=null) setSelFaceIdx(d.selFaceIdx);
    if(d.selPanelId!=null) setSelPanelId(d.selPanelId);
    if(d.selInvId!==undefined) setSelInvId(d.selInvId);
    if(d.selBattId!=null) setSelBattId(d.selBattId);
    if(d.battEnabled!=null) setBattEnabled(d.battEnabled);
    if(d.customCount!=null) setCustomCount(d.customCount);
    if(d.panelOrient) setPanelOrient(d.panelOrient);
    if(d.panelRotOffset!=null) setPanelRotOffset(d.panelRotOffset);
    if(d.orientation) setOrientation(d.orientation);
    if(d.slope!=null) setSlope(d.slope);
    if(d.manualPanelPrice!=null) setManualPanelPrice(d.manualPanelPrice);
    if(d.manualBatteryPrice!=null) setManualBatteryPrice(d.manualBatteryPrice);
    if(d.annualConsumption!=null) setAnnualConsumption(d.annualConsumption);
    if(d.usageProfile) setUsageProfile(d.usageProfile);
    if(d.gridFase) setGridFase(d.gridFase);
    if(d.hasExistingPV) setHasExistingPV(d.hasExistingPV);
    if(d.hasDigitalMeter) setHasDigitalMeter(d.hasDigitalMeter);
    if(d.futureConsumers) setFutureConsumers(d.futureConsumers);
    if(d.focusGoal) setFocusGoal(d.focusGoal);
    if(d.technicianNotes) setTechnicianNotes(d.technicianNotes);
    if(d.internalNotes) setInternalNotes(d.internalNotes);
    if(d.buildingAge!=null) setBuildingAge(d.buildingAge);
    // Herstel dakbedekking per gebouw bij laden project (via buildings-state)
    if(d.tlDealId!==undefined) setTlSelectedDealId(d.tlDealId);
    setTimeout(()=>{suppressAutoSaveRef.current=false;setIsLoadingProject(false);setShowProjectMenu(false);},100);
  },[]);

  const handleNewProject=useCallback(()=>{
    if(!confirm("Huidig project afsluiten en een nieuw project starten?")) return;
    autoSaverRef.current?.flush();suppressAutoSaveRef.current=true;
    setCustomer({name:"",address:"",email:""});setCoords(null);setDisplayName("");
    setBuildingCoords(null);setDetectedFaces(null);setSelFaceIdx(0);setBattEnabled(false);
    setCustomCount(10);setPanelRotOffset(0);setManualPanelPrice("");setManualBatteryPrice("");
    setAnnualConsumption(3500);setResults(null);setAiText("");setEditableAiText("");
    setMapSnapshot(null);setPanelsDrawn(false);
    setTlContact(null);setTlQuery("");setTlResults([]);setTlSelectedDealId(null);setTlPendingGeo(null);setTlConfirmed(false);
    setBuildings([]);setSelBuildingId(null);
    // Verwijder alle panel-lagen
    if(leafRef.current&&window.L){
      Object.values(panelLayersByFaceRef.current||{}).forEach(l=>{try{leafRef.current.removeLayer(l);}catch{}});
    }
    panelLayersByFaceRef.current={};
    panelDataByFaceRef.current={};
    panelDataRef.current=null;
    panelFaceOrientRef.current={};
    setPanelCountsByFace({});
    setShowNewDealForm(false);setNewDealTitle("");setNewDealValue("");
    setTimeout(()=>{suppressAutoSaveRef.current=false;setShowProjectMenu(false);},100);
  },[]);

  const handleDownloadProject=useCallback(()=>{
    if(!customer?.name?.trim()){alert("Vul eerst een klantnaam in.");return;}
    autoSaverRef.current?.flush();
    const ok=downloadProjectAsJSON(customer.name);
    if(!ok) alert("Download mislukt.");
  },[customer]);

  const handleUploadProject=useCallback((file)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const result=importProjectFromJSON(e.target.result);
      if(!result.success){alert("Import mislukt: "+result.error);return;}
      handleLoadProject(result.customerName);setLastSavedAt(new Date());
    };
    reader.readAsText(file);
  },[handleLoadProject]);

  const handleDeleteProject=useCallback((customerName)=>{
    if(!confirm(`Project "${customerName}" definitief verwijderen?`)) return;
    deleteProject(customerName);setLastSavedAt(new Date());
    if(customer?.name?.toLowerCase()===customerName.toLowerCase()) handleNewProject();
  },[customer,handleNewProject]);

  const selectFace=useCallback((idx,faces)=>{
    const f=(faces||detectedFaces)?.[idx];if(!f) return;
    setSelFaceIdx(idx);setOrientation(f.orientation);setSlope(f.slope);
    if(f.ridgeAngleDeg!=null) ridgeAngleDegRef.current=f.ridgeAngleDeg;
  },[detectedFaces]);

  // ── Building management ──────────────────────────────────────────────
  // Activeer een gebouw in de sidebar (toont zijn vlakken en controls)
  const activateBuilding=useCallback((id)=>{
    setSelBuildingId(id);
    const b=buildings.find(x=>x.id===id);
    if(!b) return;
    setBuildingCoords(b.coords);
    setDetectedArea(b.area);
    if(b.faces){
      setDetectedFaces(b.faces);
      setSelFaceIdx(b.selFaceIdx||0);
      if(b.faces[b.selFaceIdx||0]){
        setOrientation(b.faces[b.selFaceIdx||0].orientation);
        setSlope(b.faces[b.selFaceIdx||0].slope);
      }
    } else {
      setDetectedFaces(null);setSelFaceIdx(0);
    }
    ridgeAngleDegRef.current=b.ridgeAngleDeg||0;
    setCustomCount(b.panelCount||10);
    setPanelOrient(b.panelOrient||"portrait");
    setPanelRotOffset(b.panelRotOffset||0);
  },[buildings]);

  // Toggle selectie (oranje = meedoen in berekening, grijs = niet)
  const toggleBuildingSelection=useCallback(async(id)=>{
    setBuildings(prev=>{
      const updated=prev.map(b=>b.id===id?{...b,selected:!b.selected}:b);
      return updated;
    });
    // Als nog niet geanalyseerd: LiDAR starten
    const b=buildings.find(x=>x.id===id);
    if(b&&!b.faces&&!b.selected){
      // wordt geselecteerd → activeer ook in sidebar
      setSelBuildingId(id);
      setBuildingCoords(b.coords);

      // Kleine gebouwen (<25m²): direct plat dak — LiDAR is te onbetrouwbaar
      if(b.area<25){
        const flatFace=[{orientation:"Z",slope:3,avgH:3,pct:100,status:"manual",
          daktype:"platdak",polygon:b.coords,confidence:1,slopeStd:0,n:100}];
        setBuildings(prev=>prev.map(x=>x.id===id
          ?{...x,dhmStatus:"ok",faces:flatFace,daktype:"platdak",selFaceIdx:0}:x));
        setDetectedFaces(flatFace);setSelFaceIdx(0);
        setOrientation("Z");setSlope(3);
        return;
      }

      setBuildings(prev=>prev.map(x=>x.id===id?{...x,dhmStatus:"loading"}:x));
      try{
        const faces=await analyzeDHM(b.coords);
        // Herbereken correcte ridge voor dit specifieke gebouw
        const ridge=computeBuildingRidge(b.coords);
        if(faces?.length>0){
          const withPolys=generateFacePolygons(b.coords,faces,ridge);
          // Override ridge in elke face
          const withRidge=withPolys.map(f=>({...f,ridgeAngleDeg:ridge}));
          setBuildings(prev=>prev.map(x=>x.id===id
            ?{...x,dhmStatus:"ok",faces:withRidge,ridgeAngleDeg:ridge,selFaceIdx:0}:x));
          setDetectedFaces(withRidge);setSelFaceIdx(0);
          setOrientation(withRidge[0].orientation);setSlope(withRidge[0].slope);
        } else {
          // LiDAR faalt → plat dak als fallback
          const flatFace=[{orientation:"Z",slope:10,avgH:4,pct:100,status:"manual",
            daktype:"platdak",polygon:b.coords,confidence:0.5,slopeStd:0,n:100,ridgeAngleDeg:ridge}];
          setBuildings(prev=>prev.map(x=>x.id===id
            ?{...x,dhmStatus:"error",dhmError:"LiDAR niet beschikbaar — plat dak gebruikt",
              faces:flatFace,daktype:"platdak"}:x));
          setDetectedFaces(flatFace);setSelFaceIdx(0);
        }
      }catch(e){
        const ridge2=computeBuildingRidge(b.coords);
        const flatFace=[{orientation:"Z",slope:10,avgH:4,pct:100,status:"manual",
          daktype:"platdak",polygon:b.coords,confidence:0.5,slopeStd:0,n:100,ridgeAngleDeg:ridge2}];
        setBuildings(prev=>prev.map(x=>x.id===id
          ?{...x,dhmStatus:"error",dhmError:e.message,faces:flatFace,daktype:"platdak"}:x));
        setDetectedFaces(flatFace);setSelFaceIdx(0);
      }
    } else if(b){
      // Gebouw was al geanalyseerd: activeer gewoon
      setSelBuildingId(id);
      if(b.faces) setDetectedFaces(b.faces);
      setBuildingCoords(b.coords);
    }
  },[buildings]);

  // Daktype override voor actief gebouw
  const updateBuildingDaktype=useCallback((id,daktype)=>{
    setBuildings(prev=>prev.map(b=>{
      if(b.id!==id) return b;
      const newFaces=applyDaktypeOverride(b,daktype);
      // Sync naar legacy state als dit het actieve gebouw is
      if(id===selBuildingId&&newFaces){
        setDetectedFaces(newFaces);
        setSelFaceIdx(0);
        if(newFaces[0]){setOrientation(newFaces[0].orientation);setSlope(newFaces[0].slope);}
      }
      return {...b,daktype,faces:newFaces||b.faces};
    }));
  },[selBuildingId]);

  // Sla paneel-instellingen van actief gebouw op
  const saveBuildingPanelSettings=useCallback(()=>{
    if(!selBuildingId) return;
    setBuildings(prev=>prev.map(b=>b.id===selBuildingId
      ?{...b,panelCount:customCount,panelOrient,panelRotOffset,selFaceIdx}:b));
  },[selBuildingId,customCount,panelOrient,panelRotOffset,selFaceIdx]);

  // Hernoem een gebouw
  const renameBuildingLabel=useCallback((id,label)=>{
    setBuildings(prev=>prev.map(b=>b.id===id?{...b,label}:b));
  },[]);

  // Verwijder panelen van een specifiek dakvlak
  const removeFacePanels=useCallback((bId,fIdx)=>{
    const faceKey=`${bId}_${fIdx}`;
    // Verwijder laag van kaart
    const layer=panelLayersByFaceRef.current[faceKey];
    if(layer&&leafRef.current){try{leafRef.current.removeLayer(layer);}catch{}}
    delete panelLayersByFaceRef.current[faceKey];
    delete panelDataByFaceRef.current[faceKey];
    // Update state → triggert re-render + badge verdwijnt
    setPanelCountsByFace(prev=>{
      const next={...prev};
      delete next[faceKey];
      return next;
    });
    // Als dit het actieve vlak is, ook legacy refs clearen
    if(bId===selBuildingId&&fIdx===selFaceIdx){
      panelDataRef.current=null;
      panelLayerRef.current=null;
      setPanelsDrawn(false);
    }
  },[selBuildingId,selFaceIdx]);

  useEffect(()=>{
    const f=detectedFaces?.[selFaceIdx];
    if(f?.ridgeAngleDeg!=null) ridgeAngleDegRef.current=f.ridgeAngleDeg;
  },[detectedFaces,selFaceIdx]);

  useEffect(()=>{detectedFacesRef.current=detectedFaces;},[detectedFaces]);

  const onVertexDrag=useCallback((faceIdx,vertexIdx,newLatLng)=>{
    if(!draggedPolygonsRef.current){
      // Initialiseer vanuit detectedFaces — deep copy van ALLE vlakken
      const faces=detectedFacesRef.current;
      draggedPolygonsRef.current=faces
        ?faces.map(f=>f.polygon&&f.polygon.length>=3?f.polygon.map(p=>[p[0],p[1]]):null)
        :null;
    }
    if(!draggedPolygonsRef.current) return;
    const newPt=[newLatLng[0],newLatLng[1]];

    // Sla de ORIGINELE positie op vóór we updaten (voor sync-detectie)
    const origPt=draggedPolygonsRef.current[faceIdx]?.[vertexIdx];
    if(!origPt) return;

    // Update het gesleepte punt in het actieve vlak
    draggedPolygonsRef.current[faceIdx][vertexIdx]=newPt;

    // Sync gedeelde nokpunten naar andere vlakken
    // Gebruik origPt uit draggedPolygonsRef (live) zodat opeenvolgende drags correct werken
    const TOLE=0.00003; // ~3m tolerantie - tight genoeg voor nok, breed genoeg voor GPS drift
    draggedPolygonsRef.current.forEach((poly,fi)=>{
      if(fi===faceIdx||!poly) return;
      poly.forEach((pt,vi)=>{
        // Controleer of dit punt (bijna) gelijk is aan het gesleepte punt VÓÓR de move
        if(Math.abs(pt[0]-origPt[0])<TOLE && Math.abs(pt[1]-origPt[1])<TOLE){
          // Verifieer: dit punt mag NIET ook al een hoekpunt zijn van het eigen vlak
          // (voorkomt dat hele vlakken verschuiven bij verkeerde tolerantie-match)
          draggedPolygonsRef.current[fi][vi]=newPt;
        }
      });
    });
  },[]);

  const onVertexDragEnd=useCallback(()=>{
    if(!draggedPolygonsRef.current) return;
    const newPolygons=draggedPolygonsRef.current;
    draggedPolygonsRef.current=null;

    // Update detectedFaces — valideer dat elk vlak nog minstens 3 punten heeft
    setDetectedFaces(prev=>{
      if(!prev) return prev;
      return prev.map((f,fi)=>{
        const newPoly=newPolygons[fi];
        if(!newPoly||newPoly.length<3) return f; // bewaar origineel als polygon ongeldig
        const area2d=Math.round(polyAreaLambert72(newPoly));
        const area3d=+compute3dArea(area2d,f.slope).toFixed(1);
        return {...f,polygon:newPoly,area2d_manual:area2d,area3d_manual:area3d,status:"manual"};
      });
    });

    // Update buildings state — zelfde validatie
    if(selBuildingId){
      setBuildings(prev=>prev.map(b=>{
        if(b.id!==selBuildingId||!b.faces) return b;
        const newFaces=b.faces.map((f,fi)=>{
          const newPoly=newPolygons[fi];
          if(!newPoly||newPoly.length<3) return f; // bewaar origineel
          const area2d=Math.round(polyAreaLambert72(newPoly));
          const area3d=+compute3dArea(area2d,f.slope).toFixed(1);
          return {...f,polygon:newPoly,area2d_manual:area2d,area3d_manual:area3d,status:"manual"};
        });
        return {...b,faces:newFaces};
      }));
    }
  },[selBuildingId]);

  const redrawRoofRef=useRef(null);

  const redrawRoof=useCallback(()=>{
    if(!leafRef.current||!window.L) return;
    const L=window.L,map=leafRef.current;

    // Verwijder bestaande lagen
    if(roofLayerRef.current){
      if(typeof roofLayerRef.current.remove==="function") roofLayerRef.current.remove();
      else map.removeLayer(roofLayerRef.current);
      roofLayerRef.current=null;
    }
    // Multi-vlak: panel lagen NIET verwijderen bij redraw — ze leven onafhankelijk per vlak

    // ── Teken ALLE gebouwen op kaart ──────────────────────────────────
    if(buildings.length>0){
      const masterGroup=L.layerGroup().addTo(map);

      buildings.forEach(b=>{
        const isSelected=b.selected;
        const isActive=b.id===selBuildingId;
        // Actief gebouw: gebruik detectedFaces (live, incl. vertex-drag updates)
        // Andere gebouwen: gebruik b.faces (opgeslagen staat)
        const facesToDraw=isActive?(detectedFaces||b.faces):b.faces;

        // Gebouw-outline
        const outlineColor=isSelected?"#e07b00":"#94a3b8";
        const outlineWeight=isSelected?2.5:1.5;
        const fillOpacity=isSelected?0:0;
        const outline=L.polygon(b.coords,{
          color:outlineColor,weight:outlineWeight,
          fillOpacity,dashArray:isSelected?null:"4,3",
          opacity:isSelected?0.9:0.6
        }).addTo(masterGroup);

        // Klikbaar om te togglen
        outline.on("click",()=>toggleBuildingSelection(b.id));

        // Label met oppervlakte + gebouw naam
        const lats=b.coords.map(p=>p[0]),lngs=b.coords.map(p=>p[1]);
        const cLat=(Math.min(...lats)+Math.max(...lats))/2;
        const cLng=(Math.min(...lngs)+Math.max(...lngs))/2;
        const bgColor=isSelected?"rgba(224,123,0,0.9)":"rgba(148,163,184,0.85)";
        const labelHtml=`<div onclick="void(0)" style="background:${bgColor};color:#fff;padding:2px 7px;border-radius:4px;font-size:9px;font-family:IBM Plex Mono,monospace;white-space:nowrap;cursor:pointer;transform:translate(-50%,-50%);border:1.5px solid rgba(255,255,255,0.6)">${b.label} · ${b.area}m²${b.dhmStatus==="loading"?" ⏳":b.dhmStatus==="ok"?" ✅":""}</div>`;
        L.marker([cLat,cLng],{icon:L.divIcon({html:labelHtml,className:""})})
          .on("click",()=>{toggleBuildingSelection(b.id);activateBuilding(b.id);})
          .addTo(masterGroup);

        // Dakvlak-polygonen voor geselecteerde gebouwen
        if(isSelected&&facesToDraw&&facesToDraw.length>0){
          const ridgeRad=(b.ridgeAngleDeg||0)*Math.PI/180;
          const cosR=Math.cos(ridgeRad),sinR=Math.sin(ridgeRad);
          const mLat111=111320;

          // Afmetings-labels
          facesToDraw.forEach(f=>{
            if(!f.polygon||f.polygon.length<3) return;
            const np=f.polygon.length;
            const shown=new Set();
            for(let ei=0;ei<np;ei++){
              const a=f.polygon[ei],bb2=f.polygon[(ei+1)%np];
              const dLat=bb2[0]-a[0],dLng=bb2[1]-a[1];
              const mLng111=111320*Math.cos(a[0]*Math.PI/180);
              const dE=dLng*mLng111,dN=dLat*mLat111;
              const len2d=Math.sqrt(dE*dE+dN*dN);
              if(len2d<2) continue;
              const dotNok=Math.abs(dE*sinR+dN*cosR)/len2d;
              const slope3d=dotNok>0.5?len2d:len2d/Math.cos((f.slope||0)*Math.PI/180);
              const lKey=slope3d.toFixed(0);
              if(shown.has(lKey)&&dotNok>0.5) continue;
              shown.add(lKey);
              const midLat=(a[0]+bb2[0])/2,midLng=(a[1]+bb2[1])/2;
              const cL=f.polygon.reduce((s,p)=>s+p[0],0)/f.polygon.length;
              const cLn=f.polygon.reduce((s,p)=>s+p[1],0)/f.polygon.length;
              const offLat=(midLat-cL)*0.18,offLng=(midLng-cLn)*0.18;
              L.marker([midLat+offLat,midLng+offLng],{icon:L.divIcon({
                html:"<div style='background:rgba(0,0,0,.75);color:#fff;padding:1px 5px;border-radius:3px;font-size:8px;font-family:IBM Plex Mono,monospace;white-space:nowrap;transform:translate(-50%,-50%)'>"+slope3d.toFixed(1)+"m</div>",
                className:""
              }),interactive:false}).addTo(masterGroup);
            }
          });

        // Actief gebouw: gebruik globale selFaceIdx; andere gebouwen: hun eigen opgeslagen index
        const faceSel=isActive?selFaceIdx:(b.selFaceIdx||0);

          // Alle vlakken toevoegen aan masterGroup — cleanup via één masterGroup.remove()
          // parentGroup=masterGroup voorkomt dat layers direct op kaart komen
          if(isActive){
            drawFacePolygons(map,L,facesToDraw,faceSel,
              (idx)=>{setSelFaceIdx(idx);setOrientation(facesToDraw[idx].orientation);setSlope(facesToDraw[idx].slope);},
              editMode,faceSel,onVertexDrag,onVertexDragEnd,masterGroup);
          } else {
            drawFacePolygons(map,L,facesToDraw,faceSel,
              ()=>{activateBuilding(b.id);},false,-1,null,null,masterGroup);
          }
        }
      });

      roofLayerRef.current={remove:()=>{try{map.removeLayer(masterGroup);}catch{}}};
      return; // multi-building pad klaar
    }

    // ── Legacy single-building pad (fallback als buildings leeg is) ──
    if(!buildingCoords) return;

    if(detectedFaces&&detectedFaces.length>0){
      const ridgeAngle=detectedFaces[0]?.ridgeAngleDeg;
      let facesToDraw=detectedFaces;
      if(!detectedFaces[0]?.polygon){
        facesToDraw=generateFacePolygons(buildingCoords,detectedFaces,ridgeAngle);
        setTimeout(()=>setDetectedFaces(facesToDraw),0);
      }
      const outlineLayer=L.polygon(buildingCoords,{color:"#e07b00",fillOpacity:0,weight:2,dashArray:"5,3"}).addTo(map);
      const dimGroup=L.layerGroup().addTo(map);
      const mLat111=111320;
      const ridgeRad111=(detectedFaces[0]?.ridgeAngleDeg||0)*Math.PI/180;
      const cosRidge=Math.cos(ridgeRad111),sinRidge=Math.sin(ridgeRad111);
      facesToDraw.forEach(f=>{
        if(!f.polygon||f.polygon.length<3) return;
        const np=f.polygon.length;
        const shown=new Set();
        for(let ei=0;ei<np;ei++){
          const a=f.polygon[ei],b=f.polygon[(ei+1)%np];
          const dLat=b[0]-a[0],dLng=b[1]-a[1];
          const mLng111=111320*Math.cos(a[0]*Math.PI/180);
          const dE=dLng*mLng111,dN=dLat*mLat111;
          const len2d=Math.sqrt(dE*dE+dN*dN);
          if(len2d<2) continue;
          const dotNok=Math.abs(dE*sinRidge+dN*cosRidge)/len2d;
          const slope3d=dotNok>0.5?len2d:len2d/Math.cos((f.slope||0)*Math.PI/180);
          const midLat=(a[0]+b[0])/2,midLng=(a[1]+b[1])/2;
          const cLat=f.polygon.reduce((s,p)=>s+p[0],0)/f.polygon.length;
          const cLng=f.polygon.reduce((s,p)=>s+p[1],0)/f.polygon.length;
          const offLat=(midLat-cLat)*0.18,offLng=(midLng-cLng)*0.18;
          const lKey=slope3d.toFixed(0);
          if(shown.has(lKey)&&dotNok>0.5) continue;
          shown.add(lKey);
          L.marker([midLat+offLat,midLng+offLng],{icon:L.divIcon({
            html:"<div style='background:rgba(0,0,0,.75);color:#fff;padding:1px 5px;border-radius:3px;font-size:8px;font-family:IBM Plex Mono,monospace;white-space:nowrap;transform:translate(-50%,-50%)'>"
              +slope3d.toFixed(1)+"m</div>",
            className:""
          }),interactive:false}).addTo(dimGroup);
        }
      });
      const faceGroup=drawFacePolygons(map,L,facesToDraw,selFaceIdx,
        (idx)=>{setSelFaceIdx(idx);setOrientation(facesToDraw[idx].orientation);setSlope(facesToDraw[idx].slope);},
        editMode,selFaceIdx,onVertexDrag,onVertexDragEnd);
      roofLayerRef.current={remove:()=>{map.removeLayer(outlineLayer);map.removeLayer(dimGroup);if(faceGroup) map.removeLayer(faceGroup);}};
    } else {
      roofLayerRef.current=drawRealRoof(map,L,buildingCoords,orientation);
    }
  },[buildings,buildingCoords,orientation,detectedFaces,selFaceIdx,editMode,selBuildingId]);

  redrawRoofRef.current=redrawRoof;
  useEffect(()=>{
    if(!mapReady||(buildings.length===0&&!buildingCoords)) return;
    // Debounce: wacht 50ms om rapid-fire calls te batchen (bv. bij setDetectedFaces + setSelFaceIdx samen)
    const t=setTimeout(()=>redrawRoof(),50);
    return()=>clearTimeout(t);
  },[mapReady,buildings,buildingCoords,orientation,detectedFaces,selFaceIdx,editMode,selBuildingId]);
  useEffect(()=>{if(activeTab==="configuratie"&&leafRef.current&&mapReady){setTimeout(()=>leafRef.current?.invalidateSize?.(),50);}},[activeTab,mapReady]);

  // Panel useEffect verwijderd — panels per vlak worden getekend via "Toon panelen" knop
  // en blijven staan bij vlak/gebouw-wissel. Zie panelLayersByFaceRef.

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
    baseTileRef.current=L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {attribution:"© Esri World Imagery",maxZoom:21,maxNativeZoom:18}
    ).addTo(map);
    leafRef.current=map;
  },[mapReady]);

  useEffect(()=>{
    if(!leafRef.current||!mapReady) return;
    const L=window.L,map=leafRef.current;
    if(baseTileRef.current){map.removeLayer(baseTileRef.current);}
    if(activeLayer==="kaart"){
      baseTileRef.current=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OSM",maxZoom:21}).addTo(map);
    } else {
      baseTileRef.current=L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {attribution:"© Esri World Imagery",maxZoom:21,maxNativeZoom:18}
      ).addTo(map);
    }
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
      try{const r=await fetch(`${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=be`);setSuggs(await r.json());}catch{}
    },350);
  },[query]);

  const selectingRef2=useRef(false);
  const selectAddr=async(item)=>{
    if(selectingRef2.current) return;
    selectingRef2.current=true;setTimeout(()=>{selectingRef2.current=false;},2000);
    setShowSuggs(false);setSuggs([]);
    setQuery(item.display_name.split(",").slice(0,3).join(","));
    const lat=parseFloat(item.lat),lng=parseFloat(item.lon);
    setCoords({lat,lng});setDisplayName(item.display_name);
    setCustomer(p=>p.address?p:{...p,address:item.display_name.split(",").slice(0,3).join(",")});
    setPanelsDrawn(false);setBuildingCoords(null);setDetectedArea(null);
    setDetectedFaces(null);setDhmStatus("idle");setDhmError("");setGrbStatus("loading");
    // Auto-navigate to map tab so user sees the building being loaded
    setActiveTab("configuratie");
    setTimeout(()=>{if(leafRef.current) leafRef.current.invalidateSize?.();},80);

    if(leafRef.current&&mapReady){
      const L=window.L,map=leafRef.current;map.setView([lat,lng],19);
      if(markerRef.current) map.removeLayer(markerRef.current);
      const icon=L.divIcon({html:`<div style="width:10px;height:10px;background:#e07b00;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px #e07b00"></div>`,iconSize:[10,10],iconAnchor:[5,5],className:""});
      markerRef.current=L.marker([lat,lng],{icon}).addTo(map);
    }

    // ── Multi-building GRB fetch ────────────────────────────────────────
    let allBlds=[];
    try{
      const geo=await fetchGRBBuilding(lat,lng);
      allBlds=findAllBuildings(geo, lat, lng);
      if(allBlds.length>0){
        // Bereken PCA-nokrichting voor elk gebouw
        allBlds=allBlds.map(b=>({...b,ridgeAngleDeg:computeBuildingRidge(b.coords)}));
        // Auto-selecteer het grootste gebouw (= de woning)
        allBlds[0]={...allBlds[0],selected:true};
        setBuildings(allBlds);
        setSelBuildingId(allBlds[0].id);
        // Sync legacy state voor backward-compat
        const main=allBlds[0];
        setBuildingCoords(main.coords);
        setDetectedArea(main.area);
        setCustomCount(10);
        ridgeAngleDegRef.current=main.ridgeAngleDeg;
        setGrbStatus("ok");
      } else {
        setGrbStatus("fallback");
      }
    }catch(e){console.warn("GRB:",e);setGrbStatus("fallback");}

    // Fallback: synthetisch gebouw als GRB faalt
    if(allBlds.length===0){
      const mLat=111320,mLng=111320*Math.cos(lat*Math.PI/180);
      const w=Math.sqrt(80*1.6),d=80/w,dLat=(d/2)/mLat,dLng=(w/2)/mLng;
      const fb=[[lat+dLat,lng-dLng],[lat+dLat,lng+dLng],[lat-dLat,lng+dLng],[lat-dLat,lng-dLng]];
      setBuildingCoords(fb);setDetectedArea(80);
      setDhmStatus("loading");
      try{
        const faces=await analyzeDHM(fb);
        if(faces?.length>0){setDetectedFaces(faces);setSelFaceIdx(0);setOrientation(faces[0].orientation);setSlope(faces[0].slope);setDhmStatus("ok");}
        else{setDhmStatus("error");setDhmError("Geen dakvlakken gevonden.");}
      }catch(e){setDhmStatus("error");setDhmError(e.message||"WCS niet bereikbaar");}
      return;
    }

    // ── LiDAR voor elk geselecteerd gebouw ─────────────────────────────
    // Start direct met het hoofdgebouw, andere gebouwen op aanvraag
    const mainBld=allBlds[0];
    setDhmStatus("loading");
    try{
      const faces=await analyzeDHM(mainBld.coords);
      if(faces?.length>0){
        const ridge=mainBld.ridgeAngleDeg;
        const withPolys=generateFacePolygons(mainBld.coords,faces,ridge);
        setBuildings(prev=>prev.map(b=>b.id===mainBld.id
          ?{...b,dhmStatus:"ok",faces:withPolys,ridgeAngleDeg:ridge}:b));
        setDetectedFaces(withPolys);setSelFaceIdx(0);
        setOrientation(withPolys[0].orientation);setSlope(withPolys[0].slope);
        setDhmStatus("ok");
      } else {
        setBuildings(prev=>prev.map(b=>b.id===mainBld.id?{...b,dhmStatus:"error",dhmError:"Geen vlakken gevonden"}:b));
        setDhmStatus("error");setDhmError("Geen dakvlakken gevonden in LiDAR data.");
      }
    }catch(e){
      setBuildings(prev=>prev.map(b=>b.id===mainBld.id?{...b,dhmStatus:"error",dhmError:e.message}:b));
      setDhmStatus("error");setDhmError(e.message||"WCS niet bereikbaar");
    }
  };

  const calculate=async()=>{
    if(!coords||!selPanel||(!buildingCoords&&buildings.length===0)) return;

    // ── Verzamel info van ALLE vlakken met panelen ─────────────────────────
    // faceEntries: [{key, count, orientation, slope, building}]
    const faceEntries=Object.entries(panelCountsByFace)
      .filter(([,cnt])=>cnt>0)
      .map(([key,cnt])=>{
        const parts=key.split("_");
        const bId=parts.slice(0,-1).join("_");
        const fIdx=parseInt(parts[parts.length-1])||0;
        const bld=buildings.find(x=>x.id===bId);
        const faces=(bld?.id===selBuildingId?detectedFaces:bld?.faces)||detectedFaces;
        const f=faces?.[fIdx];
        // Gebruik opgeslagen oriëntatie van het moment van tekenen (meest actueel)
        // Fallback: bld.faces (LiDAR) → detectedFaces → orientation state
        const storedOrient=panelFaceOrientRef.current[key];
        return {key,count:cnt,
          orientation:storedOrient?.orientation||f?.orientation||orientation,
          slope:storedOrient?.slope||f?.slope||slope,bld};
      });

    // Totaal geplaatste panelen
    const totalPlaced=faceEntries.reduce((s,e)=>s+e.count,0);
    const effectivePanelCount=totalPlaced>0 ? totalPlaced : (customCount||10);

    // Dominante oriëntatie: vlak met meeste panelen
    const dominantFace=faceEntries.length>0
      ?faceEntries.reduce((a,b)=>b.count>a.count?b:a)
      :{orientation,slope};
    const effectiveOrientation=dominantFace.orientation;
    const effectiveSlope=dominantFace.slope;

    // Irradiantie op basis van dominante oriëntatie
    const irr=getSolarIrr(effectiveOrientation,effectiveSlope);
    const actualArea=effectivePanelCount*selPanel.area;
    const annualKwh=Math.round(actualArea*irr*(selPanel.eff/100));
    const co2=Math.round(annualKwh*.202);
    const consumption=Math.max(annualConsumption||3500,1);
    const coverage=Math.round((annualKwh/consumption)*100);
    const mpp=parseFloat(manualPanelPrice);
    const investPanels=(isFinite(mpp)&&mpp>0)?Math.round(mpp):null;
    const PRIJS_AANKOOP=0.28,PRIJS_INJECTIE=0.05,selfRatioBase=0.30,selfRatioBatt=0.70;
    const selfKwhBase=Math.min(annualKwh*selfRatioBase,consumption);
    const injectKwhBase=Math.max(annualKwh-selfKwhBase,0);
    const annualBase=Math.round(selfKwhBase*PRIJS_AANKOOP+injectKwhBase*PRIJS_INJECTIE);
    const paybackBase=investPanels!==null?Math.round(investPanels/Math.max(annualBase,1)):null;

    // Samenvatting van alle vlakken voor PDF en AI
    const faceSummary=faceEntries.length>0
      ?faceEntries.map(e=>`${e.orientation} ${e.slope}° (${e.count} panelen)`).join(", ")
      :`${effectiveOrientation} ${effectiveSlope}° (${effectivePanelCount} panelen)`;

    let battResult=null;
    if(battEnabled&&selBatt){
      const mbp=parseFloat(manualBatteryPrice);
      const totInvBatt=(isFinite(mbp)&&mbp>0)?Math.round(mbp):null;
      const selfKwhBatt=Math.min(annualKwh*selfRatioBatt,consumption);
      const injectKwhBatt=Math.max(annualKwh-selfKwhBatt,0);
      const totSav=Math.round(selfKwhBatt*PRIJS_AANKOOP+injectKwhBatt*PRIJS_INJECTIE);
      const extraSav=totSav-annualBase;
      const payback=(totInvBatt!==null)?Math.round(totInvBatt/Math.max(totSav,1)):null;
      const battOnlyPrice=(totInvBatt!==null&&investPanels!==null)?totInvBatt-investPanels:null;
      battResult={extraSav,totSav,totInv:totInvBatt,payback,battPrice:battOnlyPrice,
        selfRatio:selfRatioBatt,selfKwh:Math.round(selfKwhBatt),injectKwh:Math.round(injectKwhBatt)};
    }
    // Sla alle panel data op voor PDF foto-label
    const allPanelData=Object.values(panelDataByFaceRef.current||{}).flat();
    setResults({irr,panelCount:effectivePanelCount,actualArea:Math.round(actualArea),annualKwh,co2,coverage,
      investPanels,annualBase,paybackBase,battResult,panel:selPanel,inv:selInv,batt:battEnabled?selBatt:null,
      detectedArea,grbOk:grbStatus==="ok",dhmOk:dhmStatus==="ok",
      orientation:effectiveOrientation,slope:effectiveSlope,
      faceSummary, // alle vlakken voor PDF systeemoverzicht
      faceEntries, // detail per vlak
      stringDesign:stringDesign||null,consumption:Math.round(consumption),usageProfile,buildingAge,
      hasExistingPV,hasDigitalMeter,futureConsumers,focusGoal,technicianNotes,
      selfKwhBase:Math.round(selfKwhBase),injectKwhBase:Math.round(injectKwhBase),
      selfRatioBase,priceBuy:PRIJS_AANKOOP,priceInject:PRIJS_INJECTIE,
      // Paneel- en polygoondata voor vectortekening in PDF
      _panelData: panelDataRef.current||null,
      _facePoly: detectedFaces?.[selFaceIdx]?.polygon||buildingCoords||null,
      _buildingCoords: buildingCoords||null,
    });
    if(leafRef.current&&window.L){
      const L=window.L,map=leafRef.current;
      if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
      setPanelsDrawn(true);
    }
    setActiveTab("resultaten");setAiLoading(true);setAiText("");setEditableAiText("");
    try{
      const dhmStr=dhmStatus==="ok"&&detectedFaces?`\nLiDAR: ${detectedFaces.map(f=>`${f.orientation} ${f.slope}° (${f.pct}%)`).join(", ")}`:"\nHandmatige invoer.";
      const invStr=selInv?`\nOmvormer: ${selInv.brand} ${selInv.model} (${selInv.kw}kW)`:"\nGeen omvormer.";
      const battStr=battResult?`\nBatterij: ${selBatt.brand} ${selBatt.model} (${selBatt.kwh}kWh) · Extra: €${battResult.extraSav}/j · Terugverdien: ${battResult.payback}j`:"Geen batterij.";
      const PROFILE_LABELS={
        gepensioneerd:"Gepensioneerd koppel (thuis overdag, hoog dagverbruik ~4500 kWh/j, ideaal PV-zelfverbruik)",
        thuiswerker:"Thuiswerker(s) (hoog dagverbruik ~4000 kWh/j, uitstekend zelfverbruik)",
        gezin:"Gezin met kinderen (gemiddeld verbruikspatroon ~4200 kWh/j)",
        werkend_koppel:"Werkend koppel (overdag afwezig ~3200 kWh/j, batterij interessant)",
        alleenstaand:"Alleenstaande werkend (overdag afwezig ~2000 kWh/j, kleine installatie)",
        bedrijf:"KMO/Bedrijf (hoog dagverbruik, variabel, capaciteitstarief cruciaal)",
      };
      const BTW_LABELS={
        voor2015:"Woning ouder dan 10 jaar → 6% BTW van toepassing - expliciet vermelden in offerte",
        "2015_2019":"Woning 5–10 jaar → BTW-tarief controleren op exacte opleverdatum (6% of 21%)",
        na2019:"Woning jonger dan 5 jaar → 21% BTW - klant expliciet informeren",
        onbekend:"Bouwjaar onbekend → BTW-tarief navragen bij klant vóór offerte",
      };
      const profielStr=PROFILE_LABELS[usageProfile]||"Niet opgegeven";
      const pvContext=[
        hasExistingPV!=="onbekend"?`Bestaande PV: ${hasExistingPV}`:"",
        hasDigitalMeter!=="onbekend"?`Digitale meter: ${hasDigitalMeter}`:"",
        futureConsumers?.length>0?`Toekomstige verbruikers: ${futureConsumers.join(", ")}`:"",
        focusGoal?`Gewenste focus: ${focusGoal}`:"",
        technicianNotes?`Technieker nota: ${technicianNotes.substring(0,200)}`:"",
      ].filter(Boolean).join(" | ");
      const btwStr=BTW_LABELS[buildingAge]||"Bouwjaar niet opgegeven";
      const resp=await fetch(AI_PROXY_URL,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,
          messages:[{role:"user",content:`Je bent een onafhankelijk PV-expert voor Vlaanderen, België. Geef beknopt professioneel advies.

CONTEXT VLAANDEREN 2026:
- Salderen bestaat NIET meer. Eigen verbruik: ~€0,28/kWh, injectie: ~€0,04/kWh.
- Capaciteitstarief actief. Batterij drukt pieken.
- BTW: ${btwStr}
- Terugverdien realistisch: 7–11j PV, 9–13j met batterij.

KLANTPROFIEL: ${profielStr}
${pvContext?`Extra info: ${pvContext}`:""}

INSTALLATIE:
Locatie: ${displayName}
Panelen: ${panelCount}× ${selPanel.brand} ${selPanel.watt}W = ${((panelCount*selPanel.watt)/1000).toFixed(1)} kWp
Vlakken: ${results?.faceSummary||orientation+" "+slope+"°"} · ${irr} kWh/m²/j irradiantie${dhmStr}
${invStr}
Opbrengst: ${annualKwh} kWh/j · Verbruik klant: ${consumption} kWh/j
Dekking: ${coverage}% · Investering: ${investPanels?"€"+investPanels.toLocaleString():"n.i."} · Besparing: €${annualBase}/j
${battStr}

ADVIES (max 280 woorden):
1. Beoordeling installatie voor dit profiel (gebruik ${consumption} kWh/j - NIET de profielschatting)
2. Zelfverbruikstips voor dit leefpatroon (concrete timing grote verbruikers)
3. Batterijadvies op maat (zie hieronder)
4. Capaciteitstarief voor dit profiel
5. BTW-actie installateur
6. Terugverdientijd realistisch

Gebruik de werkelijke klantdata (verbruik ${consumption} kWh/j, productie ${annualKwh} kWh/j).

BATTERIJADVIES op maat (punt 3):
- Gepensioneerd/thuiswerker: kunnen grote verbruikers overdag laten draaien → bereken of batterij rendabel is gezien hoog dagzelfverbruik
- Werkend koppel/alleenstaand: berekenen hoeveel kWh batterij avondpiek dekt → concrete aanbeveling in kWh
- Geef altijd een concreet getal (bv. "5 kWh batterij dekt X% van avondverbruik")

Concreet en feitelijk met echte cijfers. Geen verkooppraat.`}]})});
      const d=await resp.json();
      const text=d.content?.find(b=>b.type==="text")?.text||"Analyse niet beschikbaar.";
      setAiText(text);setEditableAiText(text);
    }catch(e){const msg="AI-analyse tijdelijk niet beschikbaar. "+(e.message||"");setAiText(msg);setEditableAiText(msg);}
    setAiLoading(false);
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  FIXED handleSnapshot
  //  Kernprobleem was: Esri tiles (arcgisonline.com) hebben GEEN CORS headers.
  //  Zodra html2canvas die tiles op een <canvas> zet, wordt de canvas "tainted".
  //  canvas.toDataURL() op een tainted canvas → SecurityError → geen snapshot.
  //
  //  Fix: tijdelijk OSM tiles laden (Access-Control-Allow-Origin: *)
  //  Capture met allowTaint:false + useCORS:true → toDataURL() werkt
  //  Na capture: originele tiles herstellen.
  // ═══════════════════════════════════════════════════════════════════════
  // ── captureSnapshot: doet het echte werk, geeft snapshot-object terug ──
  // Gescheiden van handleSnapshot zodat handlePDF het ook kan aanroepen
  // zonder state-timing problemen.
  const captureSnapshot=useCallback(async()=>{
    if(!leafRef.current) throw new Error("Kaart nog niet geladen");
    const map=leafRef.current;
    const L=window.L;
    let osmLayer=null;
    const origTile=baseTileRef.current;
    const domRestores=[];
    // Stijl-restore variabelen buiten try declareren zodat finally ze kan lezen
    let prevW="",prevH="",prevPos="",prevTop="",prevLeft="",prevZ="";

    try{
      if(!window.html2canvas)
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");

      const mapEl=document.getElementById("leaflet-map");
      if(!mapEl) throw new Error("Kaart-element niet gevonden");

      // ── Stap 1: Forceer map zichtbaar + vaste afmetingen ─────────────
      // De tab-CSS kan height:0 geven aan de map-container.
      // Dat zorgt dat invalidateSize() 0×0 leest en fitBounds niet werkt.
      // Fix: expliciete w/h instellen vóór invalidateSize.
      let walker=mapEl.parentElement;
      while(walker&&walker!==document.body){
        const cs=getComputedStyle(walker);
        if(cs.display==="none"||cs.visibility==="hidden"){
          domRestores.push({el:walker,prop:"display",val:walker.style.display});
          domRestores.push({el:walker,prop:"visibility",val:walker.style.visibility});
          walker.style.display="block";
          walker.style.visibility="visible";
        }
        walker=walker.parentElement;
      }
      // Expliciete afmetingen op de map-container zelf
      prevW=mapEl.style.width; prevH=mapEl.style.height; prevPos=mapEl.style.position;
      prevTop=mapEl.style.top; prevLeft=mapEl.style.left; prevZ=mapEl.style.zIndex;
      mapEl.style.position="fixed";
      mapEl.style.top="0"; mapEl.style.left="0";
      mapEl.style.width="1400px"; mapEl.style.height="800px";
      mapEl.style.zIndex="99999";
      // Force reflow
      void mapEl.getBoundingClientRect();
      map.invalidateSize({reset:true});
      await new Promise(r=>setTimeout(r,400));

      // ── Stap 2: Esri luchtfoto tiles laden EERST ─────────────────────
      // (tiles moeten er al zijn vóór zoom, anders reset Leaflet de viewport)
      osmLayer=L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {attribution:"© Esri",maxZoom:19,maxNativeZoom:18,crossOrigin:""});
      if(origTile){try{map.removeLayer(origTile);}catch{}}
      osmLayer.addTo(map);
      // Eerste tile-load op huidige zoom
      await new Promise(resolve=>{
        let done=false;
        const finish=()=>{if(!done){done=true;resolve();}};
        osmLayer.on("load",finish);
        setTimeout(finish,4000);
      });

      // ── Stap 3: Zoom STRAK op alle gebouwen met panelen ──────────────
      {
        const snapCoords=[];
        Object.keys(panelDataByFaceRef.current||{}).forEach(key=>{
          const bId=key.split("_").slice(0,-1).join("_");
          const bld=buildings.find(x=>x.id===bId);
          (bld?.coords||[]).forEach(([la,ln])=>snapCoords.push(L.latLng(la,ln)));
        });
        if(snapCoords.length===0&&buildingCoords)
          buildingCoords.forEach(([la,ln])=>snapCoords.push(L.latLng(la,ln)));

        if(snapCoords.length>=2){
          // Gebruik setView met vaste zoom 18 zodat gebouwen groot genoeg zijn
          // fitBounds kiest soms een te lage zoom als gebouwen ver uit elkaar liggen
          const bounds=L.latLngBounds(snapCoords);
          const center=bounds.getCenter();
          map.setView(center,18,{animate:false});
          await new Promise(resolve=>{
            let done=false;
            const finish=()=>{if(!done){done=true;resolve();}};
            map.once("moveend",finish);
            setTimeout(finish,800);
          });
          // Wacht op nieuwe tiles bij zoom 18
          await new Promise(resolve=>{
            let done=false;
            const finish=()=>{if(!done){done=true;resolve();}};
            osmLayer.on("load",finish);
            setTimeout(finish,5000);
          });
          await new Promise(r=>setTimeout(r,400));
        }
      }

      // ── Stap 4: Panelen tekenen NA tile-load ─────────────────────────
      try{
        Object.values(panelLayersByFaceRef.current||{}).forEach(l=>{try{map.removeLayer(l);}catch{}});
        panelLayersByFaceRef.current={};
        const entries=Object.entries(panelDataByFaceRef.current||{}).filter(([,d])=>d?.length>0);
        if(entries.length>0){
          for(const [faceKey,faceData] of entries){
            const parts=faceKey.split("_");
            const bId=parts.slice(0,-1).join("_");
            const fIdx=parseInt(parts[parts.length-1])||0;
            const bld=buildings.find(x=>x.id===bId);
            const bFaces=(bld?.id===selBuildingId?detectedFaces:bld?.faces)||null;
            const fp=bFaces?.[fIdx]?.polygon||(bld?.coords||buildingCoords);
            if(!fp||!selPanel) continue;
            const fdr={current:faceData};
            panelLayersByFaceRef.current[faceKey]=
              drawPanelLayer(map,L,fp,faceData.length,selPanel,panelRotOffset,panelOrient,fdr,false);
          }
        } else if(buildingCoords&&selPanel){
          const fp=detectedFaces?.[selFaceIdx]?.polygon||buildingCoords;
          const fdr={current:null};
          panelLayersByFaceRef.current[`snap_0`]=
            drawPanelLayer(map,L,fp,panelCount,selPanel,panelRotOffset,panelOrient,fdr,false);
        }
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        await new Promise(r=>setTimeout(r,800));
      }catch(e){console.warn("[Snap] panels:",e);}

      // ── Stap 5: Capture ───────────────────────────────────────────────
      const canvas=await window.html2canvas(mapEl,{
        useCORS:true,allowTaint:false,scale:1.5,
        logging:false,backgroundColor:"#e8e8e8",
        foreignObjectRendering:false,imageTimeout:20000,
        onclone:(doc)=>{
          doc.querySelectorAll(".leaflet-pane,.leaflet-layer").forEach(el=>{
            el.style.display="block";el.style.visibility="visible";el.style.opacity="1";
          });
          doc.querySelectorAll(".leaflet-canvas-pane canvas").forEach(c=>{
            c.style.display="block";c.style.visibility="visible";
          });
          doc.querySelectorAll(".leaflet-overlay-pane svg").forEach(s=>s.style.overflow="visible");
        },
      });
      const dataUrl=canvas.toDataURL("image/jpeg",0.88);
      const mb=map.getBounds();
      return {dataUrl,width:canvas.width,height:canvas.height,timestamp:Date.now(),
        bounds:{north:mb.getNorth(),south:mb.getSouth(),east:mb.getEast(),west:mb.getWest()}};

    }finally{
      // Herstel tiles
      if(osmLayer){try{map.removeLayer(osmLayer);}catch{}}
      if(origTile){try{origTile.addTo(map);}catch{}}
      // Herstel map-container stijlen
      const mapEl2=document.getElementById("leaflet-map");
      if(mapEl2){
        mapEl2.style.position=prevPos||"";
        mapEl2.style.top=prevTop||""; mapEl2.style.left=prevLeft||"";
        mapEl2.style.width=prevW||""; mapEl2.style.height=prevH||"";
        mapEl2.style.zIndex=prevZ||"";
      }
      // Herstel DOM ancestors
      domRestores.reverse().forEach(({el,prop,val})=>el.style[prop]=val);
      // Herstel map grootte
      if(leafRef.current) setTimeout(()=>leafRef.current?.invalidateSize?.(),100);
    }
  },[buildings,buildingCoords,selBuildingId,detectedFaces,selFaceIdx,selPanel,panelCount,panelRotOffset,panelOrient]);

  const handleSnapshot=useCallback(async()=>{
    if(!leafRef.current){alert("Kaart nog niet geladen. Probeer opnieuw.");return;}
    setSnapshotLoading(true);
    try{
      const snap=await captureSnapshot();
      setMapSnapshot(snap);
    }catch(e){
      console.error("[ZonneDak] Snapshot fout:",e);
      alert("Foto maken mislukt: "+(e.message||"onbekende fout"));
    }finally{
      setSnapshotLoading(false);
    }
  },[captureSnapshot]);

  const handlePDF=async()=>{
    if(!results) return;
    setPdfLoading(true);

    let snap=mapSnapshot;

    // Auto-capture snapshot als er nog geen is — luchtfoto is verplicht in PDF
    if(!snap&&buildingCoords&&leafRef.current){
      try{
        snap=await captureSnapshot();
        setMapSnapshot(snap);
      }catch(e){
        console.warn("Auto-snapshot mislukt, PDF zonder luchtfoto:",e.message);
      }
    }

    const latestResults={
      ...results,
      _panelData: panelDataRef.current||results._panelData||null,
      _facePoly: detectedFaces?.[selFaceIdx]?.polygon||buildingCoords||results._facePoly||null,
      _buildingCoords: buildingCoords||results._buildingCoords||null,
      // Geef altijd de HUIDIGE stringDesign mee (niet de opgeslagen versie)
      // zodat Ingang B correct is ook als er panelen zijn bijgekomen na calculate()
      stringDesign: stringDesign||results.stringDesign||null,
      _shadowData: computeShadowAnalysis(detectedFaces)||results._shadowData||null,
      // Geef ook de huidige faceEntries mee
      faceEntries: orientationGroups?.map((g,i)=>({
        orientation:g.orientation,slope:g.slope,count:g.count,
        label:"Ingang "+String.fromCharCode(65+i),
      }))||results.faceEntries||null,
      panelCount: Object.values(panelCountsByFace||{}).reduce((s,c)=>s+c,0)||results.panelCount||panelCount,
    };
    try{await generatePDF(latestResults,customer,displayName,slope,orientation,snap,editableAiText);}
    catch(e){alert(`PDF fout: ${e.message}`);}
    setPdfLoading(false);
  };

  // Filtereer omvormers op basis van aansluitspanning + handmatig filter
  const filteredInv=inverters.filter(inv=>{
    // Aansluitspanning filter: mono of 3f230 → enkel 1-fase; 3f400 → enkel 3-fase
    if(gridFase==="mono"||gridFase==="3f230") return inv.fase==="1-fase";
    if(gridFase==="3f400") return inv.fase==="3-fase";
    // Geen aansluitspanning ingesteld → gebruik handmatig filter
    if(invFilter==="alle") return true;
    return inv.fase===invFilter;
  });
  const filteredBatt=battFilter==="alle"?batteries:battFilter==="alpha"?batteries.filter(b=>b.isAlpha):batteries.filter(b=>!b.isAlpha);
  const zq=ZONE_Q[orientation]||ZONE_Q.Z;
  const dhmHits=new Set(detectedFaces?.map(f=>f.orientation)||[]);
  // ── String-design met MPPT-oriëntatie groepering ──────────────────────────
  // Regel: panelen met VERSCHILLENDE oriëntatie → aparte MPPT-ingang
  // (MPP-tracker werkt alleen optimaal als alle panelen op één ingang dezelfde oriëntatie hebben)
  //
  // Algoritme:
  //   1. Groepeer faceEntries op oriëntatie
  //   2. Elke oriëntatie-groep → één MPPT-ingang
  //   3. Als meer groepen dan MPPT-ingangen → combineer vergelijkbare oriëntaties (bv ZO+Z)
  //   4. Bereken stringDesign per MPPT-ingang

  const buildOrientationGroups=()=>{
    if(!selPanel?.voc||!selInv?.maxDcVoltage) return null;

    // Gebruik panelCountsByFace (altijd actueel) of faceEntries uit results
    // panelCountsByFace is React state en altijd gesynchroniseerd met de getekende panelen
    const pcfEntries=Object.entries(panelCountsByFace||{})
      .filter(([,cnt])=>cnt>0)
      .map(([key,cnt])=>{
        const parts=key.split("_");
        const bId=parts.slice(0,-1).join("_");
        const fIdx=parseInt(parts[parts.length-1])||0;
        const bld=buildings.find(x=>x.id===bId);
        const faces=(bld?.id===selBuildingId?detectedFaces:bld?.faces)||detectedFaces;
        const f=faces?.[fIdx];
        return {orientation:f?.orientation||orientation,slope:f?.slope||slope,count:cnt};
      });
    const entries=pcfEntries.length>0 ? pcfEntries
      : results?.faceEntries?.length>0 ? results.faceEntries
      : [{orientation,slope,count:panelCount}];

    // Groepeer op oriëntatie
    const groups={};
    entries.forEach(e=>{
      const key=e.orientation;
      if(!groups[key]) groups[key]={orientation:e.orientation,slope:e.slope,count:0,faces:[]};
      groups[key].count+=e.count;
      groups[key].faces.push(e);
    });

    let mpptGroups=Object.values(groups).filter(g=>g.count>0);
    const maxMppt=selInv.mpptCount||selInv.mppt||2;

    // Te veel groepen voor beschikbare MPPT-ingangen → combineer kleinste groepen
    while(mpptGroups.length>maxMppt){
      mpptGroups.sort((a,b)=>a.count-b.count);
      const smallest=mpptGroups.shift();
      // Voeg toe aan meest gelijkende oriëntatie (dichtste in graden)
      const aspDeg=g=>ASP_MAP[g.orientation]||0;
      const aspDegS=ASP_MAP[smallest.orientation]||0;
      const closest=mpptGroups.reduce((a,b)=>{
        const da=Math.abs(((aspDeg(a)-aspDegS+540)%360)-180);
        const db=Math.abs(((aspDeg(b)-aspDegS+540)%360)-180);
        return db<da?b:a;
      });
      closest.count+=smallest.count;
      closest.orientation=closest.count>=smallest.count?closest.orientation:smallest.orientation;
      closest.faces=[...closest.faces,...smallest.faces];
    }

    return mpptGroups;
  };

  const orientationGroups=buildOrientationGroups();

  // Bouw per-MPPT stringDesign op
  const buildMpptStringDesign=()=>{
    if(!selPanel?.voc||!selInv?.maxDcVoltage||!orientationGroups) return null;
    // Bereken optimale string-lengte: max panelen in serie zonder Voc-limiet te overschrijden
    // Bij -7°C (tempMin): Voc_cold = Voc * (1 + tempCoeffVoc/100 * (tempMin - 25))
    const tempMin=-7;
    const tempMax=32;
    const tempConfig=19;
    const vocColdFactor=1+(selPanel.tempCoeffVoc||-0.25)/100*(tempMin-25);
    const vmpHotFactor=1+(selPanel.tempCoeffVoc||-0.25)/100*(tempMax-25);
    const vmpConfigFactor=1+(selPanel.tempCoeffVoc||-0.25)/100*(tempConfig-25);
    // Max panelen in serie = floor(maxDcVoltage / Voc_cold)
    const maxSeries=Math.floor((selInv.maxDcVoltage||600)/((selPanel.voc||38)*Math.abs(vocColdFactor)));
    // Min panelen in serie = ceil(mpptVoltageMin / Vmp_hot)
    const minSeries=Math.ceil((selInv.mpptVoltageMin||100)/((selPanel.vmp||32)*Math.abs(vmpHotFactor)));
    // Optimale string-lengte = zo lang mogelijk (max rendement)
    const optStrLen=Math.min(maxSeries,Math.floor((selInv.mpptVoltageMax||560)/((selPanel.vmp||32))));
    const strLen=Math.max(minSeries,Math.min(optStrLen,maxSeries))||10;

    const maxCurrentPerMppt=selInv.maxInputCurrentPerMppt||16;

    const enrichedMppts=orientationGroups.map((g,i)=>{
      const panelsOnInput=g.count;
      // Bereken optimaal aantal strings en panelen per string
      // Max strings op basis van stroom: floor(maxCurrent / Isc)
      const maxStrings=Math.max(1,Math.floor(maxCurrentPerMppt/(selPanel.isc||14)));
      // Aantal strings: probeer panelen gelijk te verdelen
      const strings=Math.max(1,Math.min(maxStrings,Math.round(panelsOnInput/strLen)));
      const panelsPerString=strings>0?Math.round(panelsOnInput/strings):panelsOnInput;

      // Spanningen en stromen per ingang
      const vocCold=panelsPerString*(selPanel.voc||38)*Math.abs(vocColdFactor);
      const vmpHot=panelsPerString*(selPanel.vmp||32)*Math.abs(vmpHotFactor);
      const vmpConfig=panelsPerString*(selPanel.vmp||32)*Math.abs(vmpConfigFactor);
      const impTotal=strings*(selPanel.imp||13);
      const iscTotal=strings*(selPanel.isc||14);

      return {
        stringCount:strings,
        stringLen:panelsPerString,
        totalPanels:panelsOnInput,
        powerStc:panelsOnInput*selPanel.watt,
        vocCold,vmpHot,vmpConfig,impTotal,iscTotal,
        checks:{
          vocColdOk:vocCold<=(selInv.maxDcVoltage||600),
          vmpHotOk:vmpHot>=(selInv.mpptVoltageMin||100),
          vmpConfigOk:vmpConfig<=(selInv.mpptVoltageMax||560),
          impOk:impTotal<=maxCurrentPerMppt,
          iscOk:iscTotal<=maxCurrentPerMppt,
        },
        orientation:g.orientation,
        slope:g.slope,
        faces:g.faces,
        orientationLabel:`${g.orientation} · ${g.slope}°`,
        multiOrientation:g.faces.length>1,
      };
    });

    // Gebruik base voor config-velden
    const base=computeStringDesign(selPanel,selInv,panelCount)||{config:{},warnings:[]};
    const config={
      tempMin,tempMax,tempConfig,
      inverterMaxDc:selInv.maxDcVoltage||600,
      inverterMaxAc:selInv.maxAcPower||selInv.kw*1000||5000,
      inverterMaxDcPower:selInv.maxDcPower||selInv.maxPv||10000,
      inverterMpptMin:selInv.mpptVoltageMin||100,
      inverterMpptMax:selInv.mpptVoltageMax||560,
      inverterMaxCurrent:maxCurrentPerMppt,
      sizingFactor:panelCount>0?(panelCount*selPanel.watt/(selInv.maxAcPower||selInv.kw*1000||5000)*100):null,
    };
    // Waarschuwingen
    const warnings=[...(base.warnings||[])];
    if(orientationGroups.length>(selInv.mpptCount||selInv.mppt||2)){
      warnings.push({severity:"warning",title:"Meer oriëntaties dan MPPT-ingangen",
        detail:`${orientationGroups.length} dakrichtingen op ${selInv.mpptCount||selInv.mppt||2} MPPT-ingangen. Overweeg een omvormer met meer ingangen.`});
    }
    enrichedMppts.forEach((m,i)=>{
      if(!m.checks.vocColdOk) warnings.push({severity:"critical",title:`Ingang ${String.fromCharCode(65+i)}: Voc te hoog`,detail:`${m.vocCold.toFixed(0)}V > ${selInv.maxDcVoltage}V max`});
      if(!m.checks.vmpHotOk) warnings.push({severity:"warning",title:`Ingang ${String.fromCharCode(65+i)}: Vmp te laag bij hoge temperatuur`,detail:`${m.vmpHot.toFixed(0)}V < ${selInv.mpptVoltageMin}V min`});
    });

    return {mppts:enrichedMppts,config,warnings,
      totalPower:panelCount*selPanel.watt,
      tooManyOrientations:orientationGroups.length>(selInv.mpptCount||selInv.mppt||2)};
  };

  const stringDesign=(selPanel?.voc&&selInv?.maxDcVoltage)?buildMpptStringDesign():null;
  const isLoading=grbStatus==="loading"||dhmStatus==="loading";

  const TABS=[
    {k:"klant",l:"01 Klant"},{k:"configuratie",l:"02 Configuratie"},
    {k:"panelen",l:"03 Panelen"},{k:"omvormers",l:"04 AlphaESS"},
    {k:"batterij",l:"05 Batterij"},{k:"technisch",l:"06 Technisch"},
    {k:"resultaten",l:"07 Resultaten"},{k:"instellingen",l:"⚙️"},
  ];


  return(<><style>{STYLES}</style>
  <div className="app">
    <header className="header">
      <div className="logo">☀️</div>
      <div className="header-text">
        <h1>ZonneDak Analyzer</h1>
        <p>GRB Gebouwcontouren · DHM Vlaanderen II LiDAR · AlphaESS G3</p>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:"auto"}}>
        <div className="badge">GRB · DHMV II</div>
        {/* EcoFinity logo rechts in header */}
        {ECOFINITY_LOGO_BASE64
          ?<img src={ECOFINITY_LOGO_BASE64} alt="EcoFinity"
             style={{height:42,width:"auto",objectFit:"contain",filter:"brightness(1.1) drop-shadow(0 1px 3px rgba(0,0,0,0.3))"}}/>
          :<span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#fff",
              letterSpacing:1,textShadow:"0 1px 3px rgba(0,0,0,0.3)"}}>ECOFINITY</span>}
      </div>
    </header>
    <div className="tabs">{TABS.map(t=><button key={t.k} className={`tab ${activeTab===t.k?"active":""}`} onClick={()=>{setActiveTab(t.k);if(t.k==="configuratie")setTimeout(()=>{if(leafRef.current)leafRef.current.invalidateSize?.();},80);}}>{t.l}</button>)}</div>
    <div className="main">
      <aside className="sidebar">
        <div>
          <div className="sl">Locatie</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <div className="sugg-wrap">
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

        {/* ── Gebouwenlijst ────────────────────────────────────────────── */}
        {buildings.length>0&&<div>
          <div className="sl">Gebouwen op perceel</div>
          <div style={{fontSize:9,color:"var(--muted)",marginBottom:5}}>
            Klik om een gebouw te selecteren/deselecteren. Klik naam om te bewerken.
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {buildings.map(b=>{
            const isActive=b.id===selBuildingId;
            const isSelected=b.selected;
            return(
              <div key={b.id} style={{
                background:isActive?"var(--amber-light)":isSelected?"var(--bg2)":"var(--bg3)",
                border:`1.5px solid ${isActive?"var(--amber)":isSelected?"var(--border-dark)":"var(--border)"}`,
                borderRadius:7,padding:"8px 10px",cursor:"pointer",
                opacity:isSelected?1:0.65,
              }}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  {/* Toggle selectie checkbox-stijl */}
                  <div onClick={()=>toggleBuildingSelection(b.id)}
                    style={{width:18,height:18,borderRadius:4,flexShrink:0,
                      background:isSelected?"var(--amber)":"var(--bg4)",
                      border:`2px solid ${isSelected?"var(--amber)":"var(--border-dark)"}`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:10,color:"#fff",cursor:"pointer"}}>
                    {isSelected?"✓":""}
                  </div>
                  {/* Klikbare naam (activeer sidebar) */}
                  <div onClick={()=>activateBuilding(b.id)} style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:11,color:isActive?"var(--amber)":"var(--text)"}}>
                      {b.label}
                    </div>
                    <div style={{fontSize:9,color:"var(--muted)"}}>{b.area} m²
                      {b.dhmStatus==="loading"&&<span style={{color:"var(--alpha)",marginLeft:4}}>⏳ LiDAR...</span>}
                      {b.dhmStatus==="ok"&&<span style={{color:"var(--green)",marginLeft:4}}>✅ {b.faces?.length||0} vlak(ken)
                    {(()=>{
                      const sh=computeShadowAnalysis(b.faces);
                      const avgLoss=sh?Math.round(sh.reduce((s,f)=>s+f.avgLoss,0)/sh.length):null;
                      return avgLoss!=null?<span style={{color:avgLoss<5?"var(--green)":avgLoss<15?"var(--amber)":"var(--red)",marginLeft:4,fontSize:8}}>
                        🌤️ {avgLoss<5?"Geen schaduw":avgLoss<15?"Lichte schaduw":"Schaduwrisico"} (~{avgLoss}% verlies)
                      </span>:null;
                    })()}
                  </span>}
                      {b.dhmStatus==="error"&&<span style={{color:"var(--red)",marginLeft:4}}>⚠️ Manueel</span>}
                    </div>
                  </div>
                  {/* Hernoemen */}
                  <input
                    defaultValue={b.label}
                    onBlur={e=>renameBuildingLabel(b.id,e.target.value||b.label)}
                    onKeyDown={e=>e.key==="Enter"&&e.target.blur()}
                    style={{width:90,fontSize:9,padding:"2px 5px",borderRadius:4,
                      border:"1px solid var(--border-dark)",fontFamily:"inherit",
                      background:"var(--bg3)",color:"var(--text)"}}
                    onClick={e=>e.stopPropagation()}/>
                </div>

                {/* Dakvorm-picker */}
                {isSelected&&isActive&&<div style={{marginTop:7}}>
                  <div style={{fontSize:8,color:"var(--muted)",marginBottom:3}}>Dakvorm</div>
                  <DakTypePicker value={b.daktype||"auto"} onChange={dt=>updateBuildingDaktype(b.id,dt)}/>
                </div>}

                {/* Dakbedekking-picker — bepaalt montagematerialen en TL-offerte-template */}
                {isSelected&&isActive&&<div style={{marginTop:8}}>
                  <div style={{fontSize:8,color:"var(--muted)",marginBottom:4}}>
                    Dakbedekking <span style={{fontSize:7,color:"var(--alpha)"}}>→ bepaalt montagematerialen</span>
                  </div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {[
                      {id:"pannendak",icon:"🟤",label:"Pannendak"},
                      {id:"leiendak",icon:"⬛",label:"Leien dak"},
                      {id:"platdak",icon:"⬜",label:"Plat dak"},
                      {id:"idedak",icon:"🔩",label:"IDE dak"},
                    ].map(d=>(
                      <button key={d.id}
                        onClick={()=>setBuildings(prev=>prev.map(x=>x.id===b.id?{...x,dakbedekking:d.id}:x))}
                        style={{padding:"5px 9px",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
                          cursor:"pointer",borderRadius:5,whiteSpace:"nowrap",
                          background:b.dakbedekking===d.id?"var(--alpha)":"var(--bg3)",
                          border:b.dakbedekking===d.id?"1px solid var(--alpha-border)":"1px solid var(--border-dark)",
                          color:b.dakbedekking===d.id?"#fff":"var(--muted)"}}>
                        {d.icon} {d.label}
                      </button>
                    ))}
                  </div>
                  {!b.dakbedekking&&<div style={{fontSize:8,color:"var(--amber)",marginTop:3}}>
                    ⚠️ Kies de dakbedekking voor correcte offerte
                  </div>}
                </div>}

                {/* Dakvlakken voor actief+geselecteerd gebouw */}
                {isSelected&&isActive&&b.faces&&b.faces.length>0&&<div style={{marginTop:8}}>
                  {b.dhmStatus==="loading"&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:9,color:"var(--alpha)"}}><div className="spinner cyan"/>LiDAR analyseren...</div>}
                  {b.dhmStatus==="error"&&<div className="info-box warn" style={{fontSize:9,padding:"5px 8px"}}>⚠️ LiDAR niet beschikbaar · manuele instelling geldig</div>}
                  <div className="face-grid" style={{marginTop:4}}>
                    {b.faces.map((f,i)=>{
                      const q=ZONE_Q[f.orientation]||ZONE_Q.Z;
                      const isGood=BEST_SOUTH[f.orientation]!==false;
                      const qC=isGood?q[0]:q[1];
                      const conf=f.confidence??0;
                      const confColor=conf>=0.7?"var(--green)":conf>=0.4?"var(--amber)":"var(--red)";
                      const face2d=f.area2d_manual||(b.area||80)*(f.pct/100);
                      const face3d=f.area3d_manual||compute3dArea(face2d,f.slope);
                      const isFaceSel=selFaceIdx===i&&selBuildingId===b.id;
                      return(
                        <button key={i} className={`face-btn ${isFaceSel?"active":""}`}
                          onClick={()=>{setSelFaceIdx(i);setOrientation(f.orientation);setSlope(f.slope);
                            setBuildings(prev=>prev.map(x=>x.id===b.id?{...x,selFaceIdx:i}:x));
                          }}>
                          <span className="fb-main">{f.isFlatRoof?"🏢 ":""}{f.orientation} · {f.slope}°
                            {f.status==="manual"&&<span style={{fontSize:7,color:"var(--amber)",marginLeft:4}}>✏️</span>}
                            {panelCountsByFace[`${b.id}_${i}`]>0&&<span style={{display:"inline-flex",alignItems:"center",gap:3,marginLeft:4}}>
                              <span style={{fontSize:7,background:"var(--blue)",color:"#fff",borderRadius:8,padding:"0 4px"}}>{panelCountsByFace[`${b.id}_${i}`]}🔆</span>
                              <span onClick={e=>{e.stopPropagation();removeFacePanels(b.id,i);}}
                                style={{fontSize:7,background:"var(--red)",color:"#fff",borderRadius:8,padding:"0 4px",cursor:"pointer"}}
                                title="Verwijder panelen van dit vlak">✕</span>
                            </span>}
                          </span>
                          <span className="fb-sub">{f.pct}% · {f.avgH}m hoogte</span>
                          <span style={{fontSize:8,color:"var(--blue)",display:"block",marginTop:2}}>3D: {face3d.toFixed(0)}m² <span style={{color:"var(--muted)"}}>(2D: {face2d.toFixed(0)}m²)</span></span>
                          <span style={{fontSize:8,color:isFaceSel?"var(--alpha)":qC.c,display:"block"}}>{qC.l}</span>
                          {conf>0&&<span style={{fontSize:7,color:confColor,display:"block"}}>{conf>=0.7?"✅":conf>=0.4?"⚠️":"❌"} conf: {Math.round(conf*100)}%</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Vlak-edit knoppen */}
                  <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                    {!editMode
                      ?<button className="btn sec sm" style={{flex:1}} onClick={()=>{
                          if(!b.faces[selFaceIdx]?.polygon){
                            const withPolys=generateFacePolygons(b.coords,b.faces,b.ridgeAngleDeg);
                            setBuildings(prev=>prev.map(x=>x.id===b.id?{...x,faces:withPolys}:x));
                            setDetectedFaces(withPolys);
                            setTimeout(()=>setEditMode(true),50);
                          } else {setEditMode(true);}
                        }}>✏️ Dakvlak aanpassen</button>
                      :<>
                        <button className="btn green sm" style={{flex:1}} onClick={()=>{
                          setBuildings(prev=>prev.map(x=>x.id===b.id
                            ?{...x,faces:x.faces?.map((f,i)=>i===selFaceIdx?{...f,status:"manual"}:f)}:x));
                          setDetectedFaces(prev=>prev?.map((f,i)=>i===selFaceIdx?{...f,status:"manual"}:f));
                          setEditMode(false);
                        }}>✅ Bevestig</button>
                        <button className="btn danger sm" onClick={()=>setEditMode(false)}>✕</button>
                      </>
                    }
                    {!editMode&&b.faces.length<4&&<button className="btn sec sm" onClick={()=>{
                      const f=b.faces[selFaceIdx];
                      if(!f?.polygon||f.polygon.length<4) return;
                      const mid=Math.floor(f.polygon.length/2);
                      const half1={...f,polygon:[...f.polygon.slice(0,mid+1)],pct:Math.round(f.pct/2),status:"manual"};
                      const half2={...f,orientation:DIRS8[(DIRS8.indexOf(f.orientation)+2)%8]||f.orientation,polygon:[...f.polygon.slice(mid)],pct:Math.round(f.pct/2),status:"manual"};
                      const newFaces=[...b.faces.slice(0,selFaceIdx),half1,half2,...b.faces.slice(selFaceIdx+1)];
                      setBuildings(prev=>prev.map(x=>x.id===b.id?{...x,faces:newFaces}:x));
                      setDetectedFaces(newFaces);
                    }}>➕ Splits</button>}
                  </div>
                  {editMode&&<div className="info-box" style={{marginTop:5,background:"#fffbeb",borderColor:"#fde68a",fontSize:9}}>
                    <strong>✏️ Editeer modus</strong> — Versleep oranje bolletjes op de kaart.
                  </div>}
                </div>}

                {/* Helling + Oriëntatie voor actief gebouw */}
                {isSelected&&isActive&&<div style={{marginTop:8,borderTop:"1px solid var(--border)",paddingTop:8}}>
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    <div className="sl-item">
                      <label>Hellingshoek <span style={{color:b.dhmStatus==="ok"?"var(--alpha)":"var(--amber)"}}>{slope}° {b.dhmStatus==="ok"?"· LiDAR":""}</span></label>
                      <input type="range" min="3" max="75" value={slope} onChange={e=>setSlope(+e.target.value)}/>
                    </div>
                    <div>
                      <div className="sl" style={{marginBottom:4,fontSize:9}}>Oriëntatie</div>
                      <div className="orient-grid">
                        {["N","NO","O","ZO","Z","ZW","W","NW"].map(o=>{
                          const dhmHit=b.faces?.some(f=>f.orientation===o);
                          return <button key={o} className={`orient-btn ${orientation===o?"active":""} ${dhmHit&&orientation!==o?"dhm-hit":""}`} onClick={()=>setOrientation(o)}>
                            {o}{dhmHit&&<span className="dhm-dot"/>}
                          </button>;
                        })}
                      </div>
                    </div>
                  </div>
                </div>}


              </div>
            );
          })}
          </div>
        </div>}

        {dhmStatus!=="idle"&&buildings.length===0&&<div>
          <div className="sl">LiDAR Analyse</div>
          {dhmStatus==="loading"&&<div className="info-box" style={{flexDirection:"column",gap:4}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}><div className="spinner cyan"/>WCS + TIFF parser + Horn's methode...</div>
            <div className="dhm-bar"><div className="dhm-bar-fill"/></div>
          </div>}
          {(dhmStatus==="ok"||dhmStatus==="error")&&detectedFaces&&<div>
            <div className="info-box dhm-ok" style={{marginBottom:5}}>
              {dhmStatus==="ok"
                ?<><strong>✅ {detectedFaces.length} dakvlak(ken) gedetecteerd via LiDAR</strong><span style={{display:"block",marginTop:3,fontSize:8,color:"var(--muted)"}}>GRB-contour · EPSG:31370</span></>
                :<><strong style={{color:"#92400e"}}>⚠️ LiDAR niet beschikbaar</strong> — GRB-contour gebruikt<span style={{display:"block",marginTop:3,fontSize:8,color:"var(--muted)"}}>{dhmError}</span></>
              }
            </div>
          {dhmStatus==="error"&&!detectedFaces&&<div className="info-box err"><strong>⚠️ LiDAR niet beschikbaar</strong><br/><span style={{fontSize:8,color:"var(--muted)"}}>{dhmError}</span><br/>Stel helling &amp; richting handmatig in hieronder.</div>}
        </div>}
        </div>}

        <div className="divider"/>

        {/* Dakparameters + Oriëntatie: toon alleen als er geen multi-building UI is */}
        {buildings.length===0&&<><div>
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
        </div></>}

        <div className="divider"/>

        <div>
          <div className="sl">Geselecteerd paneel</div>
          <div className="card selected" style={{cursor:"default"}}>
            <div className="card-name">{selPanel?.model}</div><div className="card-brand">{selPanel?.brand}</div>
            <div className="chips"><span className="chip gold">{selPanel?.watt}W</span><span className="chip">{selPanel?.eff}% eff</span></div>
          </div>
          <button className="btn sec full" style={{marginTop:6}} onClick={()=>setActiveTab("panelen")}>Paneel wijzigen →</button>
        </div>
        <div>
          <div className="sl">AlphaESS Omvormer</div>
          {selInv?<div className="inv-card selected" style={{cursor:"default"}}>
            <div className="alpha-badge">⚡ G3</div>
            <div className="card-name">{selInv.model}</div>
            <div className="chips"><span className="chip alpha-c">{selInv.kw}kW</span><span className="chip">{selInv.mppt} MPPT</span></div>
          </div>:<div className="info-box" style={{fontSize:11}}>Geen omvormer geselecteerd</div>}
          <button className="btn alpha full" style={{marginTop:6}} onClick={()=>setActiveTab("omvormers")}>{selInv?"Omvormer wijzigen →":"AlphaESS kiezen →"}</button>
        </div>
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
          setPanelMoveMode(false);
          if(leafRef.current&&window.L){
            const L=window.L,map=leafRef.current;
            // Multi-vlak: verwijder alleen de laag van het HUIDIGE vlak
            const faceKey=`${selBuildingId||"main"}_${selFaceIdx}`;
            const existingLayer=panelLayersByFaceRef.current[faceKey];
            if(existingLayer){try{map.removeLayer(existingLayer);}catch{}}
            delete panelLayersByFaceRef.current[faceKey];
            delete panelDataByFaceRef.current[faceKey];
            // Maak face-specifieke ref aan
            const faceDataRef={current:null};
            let _sf=detectedFaces?.[selFaceIdx];
            if(_sf&&!_sf.polygon&&buildingCoords){const wp=generateFacePolygons(buildingCoords,detectedFaces,_sf.ridgeAngleDeg);setDetectedFaces(wp);_sf=wp?.[selFaceIdx]||_sf;}
            const _ridge=ridgeAngleDegRef.current||_sf?.ridgeAngleDeg||0;
            const _fp=_sf?.polygon||(buildingCoords?makeFacePoly(buildingCoords,orientation,_ridge):buildingCoords)||buildingCoords;
            const newLayer=drawPanelLayer(map,L,_fp,panelCount,selPanel,panelRotOffset,panelOrient,faceDataRef,false);
            panelLayersByFaceRef.current[faceKey]=newLayer;
            panelDataByFaceRef.current[faceKey]=faceDataRef.current;
            panelLayerRef.current=newLayer;
            panelDataRef.current=faceDataRef.current;
            // Sla de HUIDIGE oriëntatie + helling op (gebruiker kan die handmatig aangepast hebben)
            panelFaceOrientRef.current[faceKey]={orientation,slope:_sf?.slope||slope};
            // State update triggert re-render → badge wordt zichtbaar
            setPanelCountsByFace(prev=>({...prev,[faceKey]:faceDataRef.current?.length||0}));
            setPanelsDrawn(true);
          }
          setActiveTab("configuratie");
          setTimeout(()=>{if(leafRef.current) leafRef.current.invalidateSize();},100);
        }} disabled={!coords||!buildingCoords||isLoading}>
          🏠 Toon {panelCount} panelen op dak
        </button>

        {coords&&buildingCoords&&<button className="btn green full" style={{marginTop:6}}
          onClick={handleSnapshot} disabled={snapshotLoading||!coords}>
          {snapshotLoading?"📸 Foto maken...":mapSnapshot?"✅ Foto opgeslagen · Opnieuw":"📸 Foto opslaan voor rapport"}
        </button>}
        {mapSnapshot&&<div style={{fontSize:9,color:"var(--green)",marginTop:3,padding:"4px 8px",background:"var(--bg2)",borderRadius:4,border:"1px solid var(--border)"}}>
          ✓ Foto klaar voor PDF · {new Date(mapSnapshot.timestamp).toLocaleTimeString("nl-BE",{hour:"2-digit",minute:"2-digit"})}
          {" "}<span onClick={()=>setMapSnapshot(null)} style={{cursor:"pointer",color:"var(--muted)",marginLeft:4}}>✕ wissen</span>
        </div>}

        <div style={{marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"var(--muted)",marginBottom:3}}>
            <span>↺ Rotatie aanpassing</span>
            <span style={{color:panelRotOffset!==0?"var(--amber)":"var(--muted)",fontWeight:700}}>{panelRotOffset>0?"+":""}{panelRotOffset}°
              {panelRotOffset!==0&&<span onClick={()=>setPanelRotOffset(0)} style={{marginLeft:4,cursor:"pointer",color:"var(--amber)"}}>↩</span>}
            </span>
          </div>
          <input type="range" min="-30" max="30" step="2" value={panelRotOffset}
            style={{width:"100%"}}
            onChange={e=>{
              setPanelRotOffset(+e.target.value);
              if(panelsDrawn){
                if(panelDataRef) panelDataRef.current=null;
                if(leafRef.current&&window.L){
                  const L=window.L,map=leafRef.current;
                  if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
                  const _sf=detectedFaces?.[selFaceIdx];
                  const _fp=_sf?.polygon||buildingCoords;
                  panelLayerRef.current=drawPanelLayer(map,L,_fp,panelCount,selPanel,+e.target.value,panelOrient,panelDataRef,false);
                }
              }
            }}/>
        </div>

        {panelsDrawn&&<button className={"btn full "+(panelMoveMode?"green":"")} style={{marginBottom:5}} onClick={()=>{
          const nm=!panelMoveMode;setPanelMoveMode(nm);
          if(leafRef.current&&window.L){
            const L=window.L,map=leafRef.current;
            if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
            let _sf2=detectedFaces?.[selFaceIdx];
            if(_sf2&&!_sf2.polygon&&buildingCoords){const wp2=generateFacePolygons(buildingCoords,detectedFaces,_sf2.ridgeAngleDeg);setDetectedFaces(wp2);_sf2=wp2?.[selFaceIdx]||_sf2;}
            const _fp=_sf2?.polygon||buildingCoords;
            panelLayerRef.current=drawPanelLayer(map,L,_fp,panelCount,selPanel,panelRotOffset,panelOrient,panelDataRef,nm);
          }
          if(nm){setActiveTab("configuratie");setTimeout(()=>{if(leafRef.current) leafRef.current.invalidateSize();},50);}
        }}>
          {panelMoveMode?"✅ Klaar · klik=select · dubbelklik=rij · sleep=verplaats":"↔️ Verplaats panelen"}
        </button>}

        {!manualPanelPrice&&coords&&buildingCoords&&!isLoading&&<div className="info-box warn" style={{fontSize:9,padding:"6px 10px"}}>
          <strong>💰 Vul eerst de installatieprijs in</strong> op tab 07 Resultaten
        </div>}
        <button className="btn full" onClick={()=>{
          if(!manualPanelPrice||parseFloat(manualPanelPrice)<=0){
            setActiveTab("resultaten");
            setTimeout(()=>document.querySelector('input[placeholder="bv. 8000"]')?.focus(),200);
            return;
          }
          calculate();
        }} disabled={!coords||aiLoading||!buildingCoords||isLoading}>
          {aiLoading?<><div className="spinner"/>Analyseren...</>:dhmStatus==="loading"?<><div className="spinner cyan"/>LiDAR verwerken...</>:grbStatus==="loading"?<><div className="spinner"/>Laden...</>:(!manualPanelPrice||parseFloat(manualPanelPrice)<=0)?"💰 Prijs invullen → Bereken":"☀️ Bereken resultaten"}
        </button>
        <div className="info-box">
          <strong>📡 Databronnen</strong><br/>GRB · GRB Gebouwcontouren · 1m<br/>DHM WCS · DSM+DTM · Horn's methode<br/>Lambert72 · Helmert 7-parameter<br/>© Agentschap Digitaal Vlaanderen
        </div>
        {/* Verdify powered-by logo in sidebar - volle breedte */}
        <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid var(--border)"}}>
          <a href="https://verdify.be" target="_blank" rel="noopener noreferrer"
             title="Ontwikkeld door Verdify" style={{textDecoration:"none",display:"block"}}>
            <img src={VERDIFY_LOGO_BASE64} alt="Verdify"
                 style={{width:"100%",height:"auto",objectFit:"contain",display:"block",opacity:0.9}}/>
          </a>
        </div>
      </aside>

      {/* ────── TL MAPPING EDITOR MODAL ────── */}
      {tlMappingOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:99998,
        display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div style={{background:"var(--bg1)",borderRadius:12,width:"min(740px,95vw)",
          maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>

          {/* Header */}
          <div style={{padding:"14px 20px",borderBottom:"2px solid var(--amber)",
            background:"var(--amber-light)",borderRadius:"12px 12px 0 0",flexShrink:0,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:"var(--amber)"}}>
                📋 Offerte-mapping instellen
              </div>
              <div style={{fontSize:9,color:"var(--muted)",marginTop:2}}>
                Dakbedekking: <strong style={{color:"var(--amber)"}}>{buildings.find(b=>b.id===selBuildingId)?.dakbedekking||"—"}</strong>
                {" · "}Koppel per lijnpost welke berekende waarde de hoeveelheid bepaalt
              </div>
            </div>
            <button onClick={()=>setTlMappingOpen(false)}
              style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"var(--muted)",lineHeight:1}}>✕</button>
          </div>

          {tlMappingLoading&&<div style={{padding:50,textAlign:"center",color:"var(--alpha)"}}>
            <div className="spinner"/><div style={{marginTop:10}}>Lijnposten laden uit Teamleader...</div>
          </div>}
          {!tlMappingLoading&&<>
            <div style={{padding:"10px 20px",background:"var(--bg2)",borderBottom:"1px solid var(--border)",flexShrink:0}}>
              <div style={{fontSize:9,fontWeight:700,marginBottom:6}}>Beschikbare waarden:</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {getTlAppValues().filter(v=>v.key!=="keep"&&v.value!=null).map(v=>(
                  <div key={v.key} style={{padding:"2px 9px",borderRadius:20,fontSize:9,background:"var(--blue-bg)",color:"var(--blue)"}}><strong>{v.value}</strong>{v.unit?" "+v.unit:""} — {v.label}</div>
                ))}
              </div>
            </div>
            <div style={{overflowY:"auto",flex:1,padding:"8px 20px"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{borderBottom:"2px solid var(--border)"}}>
                  <th style={{textAlign:"left",padding:"7px 4px",fontSize:9,color:"var(--muted)",fontWeight:600}}>Lijnpost</th>
                  <th style={{textAlign:"right",padding:"7px 4px",fontSize:9,color:"var(--muted)",fontWeight:600,width:65}}>Huidig</th>
                  <th style={{textAlign:"left",padding:"7px 4px",fontSize:9,color:"var(--muted)",fontWeight:600,width:230}}>Koppel aan</th>
                  <th style={{textAlign:"right",padding:"7px 4px",fontSize:9,color:"var(--green)",fontWeight:700,width:65}}>Nieuw</th>
                </tr></thead>
                <tbody>
                  {tlMappingLines.map((ln)=>{
                    const mapped=tlMappingValues[ln.key];
                    const appVal=getTlAppValues().find(v=>v.key===mapped);
                    const newQty=(mapped&&mapped!=="keep"&&appVal?.value!=null)?appVal.value:null;
                    const linked=mapped&&mapped!=="keep";
                    return(
                      <tr key={ln.key} style={{borderBottom:"1px solid var(--border)",background:linked?"var(--green-bg)":"transparent"}}>
                        <td style={{padding:"8px 4px",fontWeight:600,fontSize:11}}>{ln.description}</td>
                        <td style={{padding:"8px 4px",textAlign:"right",color:"var(--muted)",fontSize:11}}>{ln.currentQty}</td>
                        <td style={{padding:"8px 4px"}}>
                          <select style={{width:"100%",padding:"4px",fontSize:9,borderRadius:5,border:"1px solid var(--border-dark)",background:"var(--bg3)",color:"var(--text)"}}
                            value={mapped||"keep"} onChange={e=>setTlMappingValues(prev=>({...prev,[ln.key]:e.target.value}))}>
                            <option value="keep">⬜ Ongewijzigd ({ln.currentQty})</option>
                            <optgroup label="Berekende waarden">{getTlAppValues().filter(v=>v.key!=="keep"&&v.value!=null).map(v=>(
                              <option key={v.key} value={v.key}>{v.value}{v.unit?" "+v.unit:""} — {v.label}</option>
                            ))}</optgroup>
                          </select>
                        </td>
                        <td style={{padding:"8px 4px",textAlign:"right",fontWeight:700,fontSize:13,color:newQty!=null?"var(--green)":"var(--muted)"}}>{newQty!=null?newQty:ln.currentQty}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{padding:"12px 20px",borderTop:"2px solid var(--border)",background:"var(--bg2)",borderRadius:"0 0 12px 12px",flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div style={{fontSize:9,color:"var(--muted)"}}><strong>{Object.values(tlMappingValues).filter(v=>v&&v!=="keep").length}</strong> / <strong>{tlMappingLines.length}</strong> gekoppeld</div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn sec" onClick={()=>setTlMappingOpen(false)}>Annuleren</button>
                <button className="btn green" style={{fontWeight:700}} onClick={handleCreateTlQuotation} disabled={tlCreateQuotStatus==="loading"}>
                  {tlCreateQuotStatus==="loading"?<><div className="spinner"/>Aanmaken...</>:"✅ Offerte aanmaken in Teamleader"}
                </button>
              </div>
            </div>
          </>}
        </div>
      </div>}

      <div className="content-area">
        <div className="map-area" style={{display:activeTab==="configuratie"?"flex":"none",flex:1,position:"relative",minHeight:0}}>
          <div id="leaflet-map" style={{height:"100%"}}/>
          <div className="map-btns">
            <button className={`map-btn ${activeLayer==="luchtfoto"?"active":""}`} onClick={()=>setActiveLayer("luchtfoto")}>🛰️ Esri</button>
            <button className={`map-btn ${activeLayer==="kaart"?"active":""}`} onClick={()=>setActiveLayer("kaart")}>🗺️ Kaart</button>
            <button className={`map-btn ${activeLayer==="dsm"?"active":""}`} onClick={()=>setActiveLayer("dsm")}>📡 DSM Hoogte</button>
          </div>
          {coords&&<div className="status-pill">
            {grbStatus==="ok"&&<span style={{color:"var(--green)"}}>GRB ✅</span>}
            {grbStatus==="fallback"&&<span style={{color:"#92400e"}}>GRB ⚠️</span>}
            {dhmStatus==="ok"&&<><span style={{color:"var(--alpha)"}}>LiDAR ✅</span><span style={{color:"var(--muted)"}}>{detectedFaces?.length||0} vlakken</span></>}
            {dhmStatus==="loading"&&<><div className="spinner cyan"/><span style={{color:"var(--alpha)"}}>LiDAR...</span></>}
            {dhmStatus==="error"&&<span style={{color:"var(--red)"}}>LiDAR ⚠️</span>}
            {grbStatus==="ok"&&<span style={{color:"var(--muted)"}}>{detectedArea} m²</span>}
          </div>}
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

        {activeTab==="klant"&&<div className="section">
          <ProjectPanel customer={customer} projectList={projectList} lastSavedAt={lastSavedAt}
            isLoadingProject={isLoadingProject} showProjectMenu={showProjectMenu}
            setShowProjectMenu={setShowProjectMenu}
            onNew={handleNewProject} onLoad={handleLoadProject} onDelete={handleDeleteProject}
            onDownload={handleDownloadProject} onUpload={handleUploadProject}/>
          <TeamleaderPanel
            tlAuth={tlAuth} tlAuthMsg={tlAuthMsg}
            tlQuery={tlQuery} setTlQuery={setTlQuery}
            tlResults={tlResults} tlSearching={tlSearching}
            tlContact={tlContact} tlLoadingDetails={tlLoadingDetails}
            tlSelectedAddressIdx={tlSelectedAddressIdx}
            tlSelectedDealId={tlSelectedDealId} setTlSelectedDealId={setTlSelectedDealId}
            tlWorkOrders={tlWorkOrders} tlWorkOrdersLoading={tlWorkOrdersLoading}
            tlSelectedWorkOrder={tlSelectedWorkOrder} tlWorkOrderData={tlWorkOrderData}
            onApplyWorkOrder={applyWorkOrder}
            onLogin={handleTlLogin} onLogout={handleTlLogout}
            onSelectContact={handleSelectTlContact} onSelectAddress={handleSelectAddress}
            showNewDealForm={showNewDealForm}
            newDealTitle={newDealTitle} setNewDealTitle={setNewDealTitle}
            newDealValue={newDealValue} setNewDealValue={setNewDealValue}
            dealOptions={dealOptions}
            newDealPipelineId={newDealPipelineId} setNewDealPipelineId={setNewDealPipelineId}
            creatingDeal={creatingDeal}
            onOpenNewDeal={handleOpenNewDeal} onCancelNewDeal={handleCancelNewDeal}
            onCreateDeal={handleCreateDeal}
            onConfirm={handleTlConfirm} pendingGeo={tlPendingGeo}/>
          <div className="customer-section">
            <div className="sl">2️⃣ Klantgegevens</div>
            <div style={{fontSize:9,color:"var(--muted)",marginBottom:6}}>Velden worden automatisch gevuld na keuze in Teamleader.<br/><strong>Niet gevonden in TL?</strong> Vul hier handmatig in.</div>
            <div className="inp-label" style={{fontSize:9,fontWeight:600}}>Naam <span style={{color:"var(--red)"}}>*</span></div>
            <input className="inp" value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})} placeholder="bv. Jan Janssens"/>
            <div className="inp-label" style={{fontSize:8,marginTop:6}}>Adres</div>
            <input className="inp" value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})} placeholder="Straat huisnr, postcode gemeente"/>
            <div className="inp-label" style={{fontSize:8,marginTop:6}}>Email</div>
            <input className="inp" type="email" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})} placeholder="naam@voorbeeld.be"/>
            <div className="inp-label" style={{fontSize:8,marginTop:6}}>Jaarlijks elektriciteitsverbruik (kWh)</div>
            <input className="inp" type="number" min="500" max="50000" step="100"
                   value={annualConsumption}
                   onChange={e=>setAnnualConsumption(parseInt(e.target.value)||3500)}
                   placeholder="bv. 3500"/>
            <div style={{fontSize:8,color:"var(--muted)",marginTop:2}}>Vlaams gemiddelde gezin: 3500 kWh/jaar.</div>
          </div>

          {/* ── Gebruiksprofiel ─────────────────────────────────────── */}
          <div className="customer-section">
            <div className="sl">3️⃣ Gebruiksprofiel & woningtype</div>
            <div style={{fontSize:9,color:"var(--muted)",marginBottom:8}}>
              Bepaalt het zelfverbruiksprofiel en de BTW-adviezen in het rapport.
            </div>

            <div className="inp-label" style={{fontSize:9,fontWeight:600}}>Gezinssituatie / verbruikspatroon</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:4}}>
              {[
                {id:"gepensioneerd",icon:"👴",label:"Gepensioneerd koppel",desc:"Thuis overdag · hoog dagverbruik · ~4500 kWh/j",kwh:4500},
                {id:"thuiswerker",icon:"💻",label:"Thuiswerker(s)",desc:"Werkt van thuis · hoog dagverbruik · ~4000 kWh/j",kwh:4000},
                {id:"gezin",icon:"👨‍👩‍👧",label:"Gezin met kinderen",desc:"Gemiddeld patroon · ~3500–5000 kWh/j",kwh:4200},
                {id:"werkend_koppel",icon:"🏢",label:"Werkend koppel",desc:"Overdag afwezig · laag dagverbruik · ~3200 kWh/j",kwh:3200},
                {id:"alleenstaand",icon:"🧑",label:"Alleenstaande werkend",desc:"Overdag afwezig · laag verbruik · ~2000 kWh/j",kwh:2000},
                {id:"bedrijf",icon:"🏭",label:"KMO / Bedrijf",desc:"Hoog dagverbruik · variabel patroon",kwh:15000},
              ].map(p=>(
                <div key={p.id} onClick={()=>{setUsageProfile(p.id);if(!annualConsumption||annualConsumption===3500)setAnnualConsumption(p.kwh);}}
                  style={{padding:"8px 10px",borderRadius:7,cursor:"pointer",
                    background:usageProfile===p.id?"var(--amber-light)":"var(--bg3)",
                    border:`1.5px solid ${usageProfile===p.id?"var(--amber)":"var(--border-dark)"}`,
                    transition:"all .15s"}}>
                  <div style={{fontSize:14,marginBottom:2}}>{p.icon}</div>
                  <div style={{fontSize:10,fontWeight:700,color:usageProfile===p.id?"var(--amber)":"var(--text)"}}>{p.label}</div>
                  <div style={{fontSize:8,color:"var(--muted)",marginTop:2,lineHeight:1.4}}>{p.desc}</div>
                </div>
              ))}
            </div>

            {/* Woningouderdom → BTW-advies */}
            <div className="inp-label" style={{fontSize:9,fontWeight:600,marginTop:12}}>Bouwjaar woning (voor BTW-advies)</div>
            <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
              {[
                {id:"voor2015",label:"Vóór 2015",desc:"≥ 10 jaar → 6% BTW",color:"var(--green)"},
                {id:"2015_2019",label:"2015–2019",desc:"5–10 jaar → check",color:"var(--amber)"},
                {id:"na2019",label:"Na 2019",desc:"< 5 jaar → 21% BTW",color:"var(--red)"},
                {id:"onbekend",label:"Onbekend",desc:"Navragen bij klant",color:"var(--muted)"},
              ].map(b=>(
                <div key={b.id} onClick={()=>setBuildingAge(b.id)}
                  style={{flex:"1 1 calc(50% - 6px)",padding:"7px 10px",borderRadius:6,cursor:"pointer",
                    background:buildingAge===b.id?"var(--bg2)":"var(--bg3)",
                    border:`1.5px solid ${buildingAge===b.id?b.color:"var(--border)"}`,
                    transition:"all .15s"}}>
                  <div style={{fontSize:10,fontWeight:700,color:buildingAge===b.id?b.color:"var(--text)"}}>{b.label}</div>
                  <div style={{fontSize:8,color:b.color,marginTop:1}}>{b.desc}</div>
                </div>
              ))}
            </div>

            {/* BTW-advies melding */}
            {buildingAge&&buildingAge!=="onbekend"&&<div style={{marginTop:8,padding:"6px 10px",borderRadius:6,
              background:buildingAge==="voor2015"?"var(--green-bg)":buildingAge==="na2019"?"#fef2f2":"#fffbeb",
              border:`1px solid ${buildingAge==="voor2015"?"var(--green-border)":buildingAge==="na2019"?"#fca5a5":"#fde68a"}`,
              fontSize:9}}>
              {buildingAge==="voor2015"&&<><strong style={{color:"var(--green)"}}>✅ 6% BTW van toepassing</strong> — woning ouder dan 10 jaar. Controleer ook of de klant de woning zelf bewoont.</>}
              {buildingAge==="2015_2019"&&<><strong style={{color:"var(--amber)"}}>⚠️ BTW-tarief controleren</strong> — woning tussen 5–10 jaar. Afhankelijk van exacte opleverdatum kan 6% of 21% van toepassing zijn.</>}
              {buildingAge==="na2019"&&<><strong style={{color:"var(--red)"}}>❌ 21% BTW van toepassing</strong> — woning jonger dan 5 jaar. Informeer de klant expliciet over de hogere BTW.</>}
            </div>}
          </div>
        </div>}

        {/* ── Aansluitspanning ─────────────────────────────────────── */}
        <div className="customer-section">
          <div className="sl" style={{marginBottom:8}}>⚡ Aansluitspanning</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[
              {id:"mono",   icon:"1~", label:"Monofasig",      sub:"230V · 1-fase",   color:"var(--green)"},
              {id:"3f230",  icon:"3~", label:"Driefasig 230V", sub:"3×230V · 1-fase omvormer", color:"var(--amber)"},
              {id:"3f400",  icon:"3~", label:"Driefasig 400V", sub:"3×400V · 3-fase omvormer", color:"var(--blue)"},
            ].map(g=>(
              <div key={g.id} onClick={()=>setGridFase(prev=>prev===g.id?"":g.id)}
                style={{flex:"1 1 calc(33% - 6px)",padding:"8px 10px",borderRadius:7,cursor:"pointer",
                  background:gridFase===g.id?"var(--bg2)":"var(--bg3)",
                  border:`2px solid ${gridFase===g.id?g.color:"var(--border)"}`,
                  transition:"all .15s",textAlign:"center"}}>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:800,fontSize:14,
                  color:gridFase===g.id?g.color:"var(--muted)"}}>{g.icon}</div>
                <div style={{fontSize:9,fontWeight:700,color:gridFase===g.id?g.color:"var(--text)",marginTop:2}}>{g.label}</div>
                <div style={{fontSize:8,color:"var(--muted)",marginTop:1}}>{g.sub}</div>
              </div>
            ))}
          </div>
          {gridFase&&<div style={{marginTop:8,padding:"6px 10px",borderRadius:6,fontSize:9,
            background:gridFase==="3f400"?"var(--blue-bg)":"var(--green-bg)",
            border:`1px solid ${gridFase==="3f400"?"var(--blue-border)":"var(--green-border)"}`,
            color:gridFase==="3f400"?"var(--blue)":"var(--green)"}}>
            {(gridFase==="mono")&&"✅ Monofasig: enkel 1-fase omvormers beschikbaar op tab 04."}
            {(gridFase==="3f230")&&"✅ Driefasig 230V: 1-fase omvormers (asymmetrisch laden vermijden) beschikbaar op tab 04."}
            {(gridFase==="3f400")&&"✅ Driefasig 400V: 3-fase omvormers aanbevolen en geselecteerd op tab 04."}
          </div>}
          {!gridFase&&<div style={{fontSize:8,color:"var(--muted)",marginTop:6}}>
            Kies de aansluitspanning → filtert automatisch de beschikbare omvormers.
          </div>}
        </div>

        {/* ── Bestaande situatie ─────────────────────────────────────── */}
        <div className="customer-section">
          <div className="sl" style={{marginBottom:8}}>🏠 Bestaande situatie</div>
          <div style={{display:"flex",gap:10,marginBottom:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:9,fontWeight:600,marginBottom:4}}>Bestaande PV-installatie</div>
              <div style={{display:"flex",gap:4}}>
                {["nee","ja","onbekend"].map(v=>(
                  <button key={v} onClick={()=>setHasExistingPV(v)}
                    style={{flex:1,padding:"5px 4px",borderRadius:5,cursor:"pointer",fontSize:9,
                      background:hasExistingPV===v?"var(--alpha)":"var(--bg3)",
                      border:`1.5px solid ${hasExistingPV===v?"var(--alpha)":"var(--border)"}`,
                      color:hasExistingPV===v?"#fff":"var(--muted)",fontWeight:hasExistingPV===v?700:400}}>
                    {v==="nee"?"❌ Nee":v==="ja"?"✅ Ja":"❓ Onbekend"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:9,fontWeight:600,marginBottom:4}}>Digitale meter</div>
              <div style={{display:"flex",gap:4}}>
                {["nee","ja","onbekend"].map(v=>(
                  <button key={v} onClick={()=>setHasDigitalMeter(v)}
                    style={{flex:1,padding:"5px 4px",borderRadius:5,cursor:"pointer",fontSize:9,
                      background:hasDigitalMeter===v?"var(--alpha)":"var(--bg3)",
                      border:`1.5px solid ${hasDigitalMeter===v?"var(--alpha)":"var(--border)"}`,
                      color:hasDigitalMeter===v?"#fff":"var(--muted)",fontWeight:hasDigitalMeter===v?700:400}}>
                    {v==="nee"?"❌ Nee":v==="ja"?"✅ Ja":"❓ Onbekend"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Extra verbruikers */}
          <div style={{fontSize:9,fontWeight:600,marginBottom:4}}>Toekomstige extra verbruikers</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {[
              {id:"warmtepomp",icon:"🌡️",label:"Warmtepomp"},
              {id:"ev",icon:"🚗",label:"Elektrische wagen"},
              {id:"laadpaal",icon:"⚡",label:"Laadpaal"},
              {id:"airco",icon:"❄️",label:"Airco"},
              {id:"boiler",icon:"🚿",label:"Elec. boiler"},
            ].map(c=>{
              const active=futureConsumers.includes(c.id);
              return(
                <button key={c.id}
                  onClick={()=>setFutureConsumers(prev=>active?prev.filter(x=>x!==c.id):[...prev,c.id])}
                  style={{padding:"4px 8px",borderRadius:5,cursor:"pointer",fontSize:9,
                    background:active?"var(--alpha)":"var(--bg3)",
                    border:`1.5px solid ${active?"var(--alpha)":"var(--border)"}`,
                    color:active?"#fff":"var(--muted)"}}>
                  {c.icon} {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Gewenste focus ─────────────────────────────────────────── */}
        <div className="customer-section">
          <div className="sl" style={{marginBottom:8}}>🎯 Gewenste focus installatie</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {[
              {id:"maxrendement",icon:"📈",label:"Maximaal rendement",sub:"Hoogste jaaropbrengst"},
              {id:"maxzelfverbruik",icon:"🏠",label:"Maximaal eigenverbruik",sub:"Zo weinig mogelijk terugleveren"},
              {id:"spreiding",icon:"⚖️",label:"Goede spreiding over de dag",sub:"Ochtend én namiddag productie"},
              {id:"maxpanelen",icon:"🔢",label:"Maximaal aantal panelen",sub:"Alle geschikte dakvlakken benutten"},
              {id:"budget",icon:"💶",label:"Budgetvriendelijk",sub:"Beste prijs-kwaliteit verhouding"},
            ].map(f=>{
              const active=focusGoal===f.id;
              return(
                <div key={f.id} onClick={()=>setFocusGoal(prev=>prev===f.id?"":f.id)}
                  style={{padding:"7px 10px",borderRadius:6,cursor:"pointer",
                    background:active?"var(--alpha-bg)":"var(--bg2)",
                    border:`1.5px solid ${active?"var(--alpha)":"var(--border)"}`,
                    transition:"all .12s",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:16,lineHeight:1}}>{f.icon}</div>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:active?"var(--alpha)":"var(--text)"}}>{f.label}</div>
                    <div style={{fontSize:8,color:"var(--muted)"}}>{f.sub}</div>
                  </div>
                  {active&&<div style={{marginLeft:"auto",color:"var(--alpha)",fontSize:12}}>✓</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Opmerkingen ───────────────────────────────────────────── */}
        <div className="customer-section">
          <div className="sl" style={{marginBottom:8}}>📝 Opmerkingen</div>
          <div className="inp-label" style={{fontSize:9,fontWeight:600}}>Opmerkingen technieker</div>
          <textarea className="inp" rows={3}
            style={{resize:"vertical",fontSize:9,lineHeight:1.5,marginBottom:8}}
            placeholder="Notities van het plaatsbezoek, specifieke situatie, obstakels..."
            value={technicianNotes} onChange={e=>setTechnicianNotes(e.target.value)}/>
          <div className="inp-label" style={{fontSize:9,fontWeight:600}}>Interne opmerkingen Ecofinity</div>
          <textarea className="inp" rows={2}
            style={{resize:"vertical",fontSize:9,lineHeight:1.5}}
            placeholder="Interne notities, opvolging, bijzonderheden..."
            value={internalNotes} onChange={e=>setInternalNotes(e.target.value)}/>
        </div>

          {/* ── Bevestigingsknop: toon alleen als TL-klant geselecteerd is maar kaart nog niet geladen ─── */}
          {tlContact&&!tlConfirmed&&<div className="customer-section" style={{
            background:"var(--amber-light)",border:"2px solid var(--amber)",borderRadius:10,padding:14}}>
            <div className="sl" style={{marginBottom:8}}>4️⃣ Bevestig en laad de kaart</div>
            {!tlPendingGeo&&<div style={{fontSize:9,color:"var(--muted)",marginBottom:6}}>
              ⚠️ Geen adres geselecteerd — kies een adres in stap 1.
            </div>}
            {tlPendingGeo&&!tlSelectedDealId&&<div style={{fontSize:9,color:"var(--amber)",marginBottom:6,fontWeight:600}}>
              ⚠️ Koppel eerst een deal aan in stap 1.
            </div>}
            <button style={{
              width:"100%",padding:"14px 0",fontSize:14,fontWeight:800,
              background:(!tlPendingGeo||!tlSelectedDealId)?"var(--bg3)":"var(--amber)",
              color:(!tlPendingGeo||!tlSelectedDealId)?"var(--muted)":"#fff",
              border:"none",borderRadius:8,cursor:(!tlPendingGeo||!tlSelectedDealId)?"not-allowed":"pointer",
              fontFamily:"'Syne',sans-serif"}}
              onClick={handleTlConfirm}
              disabled={!tlPendingGeo||!tlSelectedDealId}>
              {!tlPendingGeo?"📍 Adres niet gevonden"
                :!tlSelectedDealId?"🤝 Koppel eerst een deal"
                :"✅ Bevestig klant + laad kaart →"}
            </button>
            {tlPendingGeo&&<div style={{fontSize:8,color:"var(--amber)",marginTop:6,textAlign:"center"}}>
              📍 {tlPendingGeo.display_name?.split(",").slice(0,3).join(", ")}
            </div>}
          </div>}
          {/* Toon bevestiging als kaart al geladen is */}
          {tlContact&&tlConfirmed&&<div style={{padding:"8px 12px",background:"var(--green-bg)",border:"1px solid var(--green-border)",borderRadius:8,fontSize:9,color:"var(--green)"}}>
            ✅ Klant geladen: <strong>{customer.name}</strong> — {displayName?.split(",").slice(0,2).join(",")}
          </div>}

        {activeTab==="instellingen"&&<div className="section">
          <div className="sl" style={{marginBottom:12}}>⚙️ App-instellingen</div>

          {/* TL Offerte-templates */}
          {tlAuth?.logged_in&&<div className="customer-section">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div className="sl">📋 TL Offerte-templates per dakbedekking</div>
              <button className="btn sec sm" onClick={fetchTlQuotations} disabled={tlQuotationLoading}>
                {tlQuotationLoading?"⏳ Laden...":"🔄 Offertes laden"}
              </button>
            </div>
            <div style={{fontSize:8,color:"var(--muted)",marginBottom:8}}>
              Koppel per dakbedekking de juiste referentie-offerte in Teamleader.
              De aantallen (panelen, batterij) worden automatisch aangepast.
            </div>
            {[
              {id:"pannendak",icon:"🟤",label:"Pannendak"},
              {id:"leiendak",icon:"⬛",label:"Leien dak"},
              {id:"platdak",icon:"⬜",label:"Plat dak"},
              {id:"idedak",icon:"🔩",label:"IDE dak"},
            ].map(d=>(
              <div key={d.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:100,fontSize:10,fontWeight:600}}>{d.icon} {d.label}</div>
                {tlQuotationList.length>0
                  ?<select className="inp" style={{flex:1,fontSize:9}}
                      value={tlTemplates[d.id]||""}
                      onChange={e=>saveTlTemplates({...tlTemplates,[d.id]:e.target.value})}>
                      <option value="">— Kies referentie-offerte —</option>
                      {tlQuotationList.map(q=><option key={q.id} value={q.id}>{q.name}</option>)}
                    </select>
                  :<input className="inp" style={{flex:1,fontSize:9}} placeholder="Plak TL offerte-ID..."
                      value={tlTemplates[d.id]||""}
                      onChange={e=>saveTlTemplates({...tlTemplates,[d.id]:e.target.value})}/>
                }
                {tlTemplates[d.id]&&<span style={{color:"var(--green)",fontSize:12}}>✓</span>}
              </div>
            ))}
            <div style={{fontSize:8,color:"var(--muted)",marginTop:4,padding:"6px 8px",background:"var(--bg2)",borderRadius:4}}>
              💡 Niet gevonden? Open de referentie-offerte in TL en kopieer de UUID uit de URL.
            </div>
          </div>}

          {/* App info */}
          <div className="customer-section" style={{marginTop:12}}>
            <div className="sl">ℹ️ Over ZonneDak Analyzer</div>
            <div style={{fontSize:9,color:"var(--muted)",lineHeight:1.7}}>
              <strong>Versie:</strong> 2.0 · EcoFinity BV<br/>
              <strong>Data:</strong> GRB Gebouwcontouren · DHM Vlaanderen II LiDAR · Lambert72<br/>
              <strong>Ontwikkeld door:</strong> <a href="https://verdify.be" target="_blank" rel="noopener noreferrer" style={{color:"var(--alpha)"}}>Verdify</a>
            </div>
          </div>
        </div>}

        {activeTab==="panelen"&&<div className="section">
          <div className="sl">Panelenlijst</div>
          <div className="info-box" style={{fontSize:8}}><strong>⭐ Standaard:</strong> Qcells 440W en Trina 500W zijn uw meest gebruikte panelen.</div>
          <div className="list">{panels.map(p=><PanelCard key={p.id} p={p} selected={p.id===selPanelId} onSelect={id=>{setSelPanelId(id);setCustomCount(10);}} onDelete={id=>setPanels(ps=>ps.filter(x=>x.id!==id))} canDelete={panels.length>1}/>)}</div>
          <NewPanelForm onAdd={p=>setPanels(ps=>[...ps,p])}/>
        </div>}

        {activeTab==="omvormers"&&<div className="section">
          <div className="sl">AlphaESS SMILE-G3</div>
          <div className="info-box alpha-info"><strong>🔆 AlphaESS SMILE-G3</strong> · LiFePO4 · 10j · IP65 · 97%+ eff. · Fluvius · Jabba · AlphaCloud</div>
          {/* Aansluitspanning bepaalt beschikbare omvormers */}
          {gridFase&&<div style={{padding:"6px 10px",borderRadius:6,fontSize:9,marginBottom:6,
            background:gridFase==="3f400"?"var(--blue-bg)":"var(--green-bg)",
            border:"1px solid "+(gridFase==="3f400"?"var(--blue-border)":"var(--green-border)"),
            color:gridFase==="3f400"?"var(--blue)":"var(--green)"}}>
            {gridFase==="mono"&&"⚡ Monofasig aansluiting → enkel 1-fase omvormers"}
            {gridFase==="3f230"&&"⚡ Driefasig 230V → enkel 1-fase omvormers (geen asymmetrische belasting)"}
            {gridFase==="3f400"&&"⚡ Driefasig 400V → 3-fase omvormer aanbevolen"}
          </div>}
          {!gridFase&&<div className="filter-row">{["alle","1-fase","3-fase"].map(f=><button key={f} className={`filter-btn af ${invFilter===f?"active":""}`} onClick={()=>setInvFilter(f)}>{f}</button>)}</div>}
          {selInv&&<div style={{display:"flex",justifyContent:"flex-end"}}><button className="btn sec sm" onClick={()=>setSelInvId(null)}>✕ Verwijder keuze</button></div>}
          <div className="list">{filteredInv.map(inv=>(
            <InverterCard key={inv.id} inv={inv} selected={inv.id===selInvId} onSelect={setSelInvId}
              onDelete={id=>setInverters(prev=>prev.filter(x=>x.id!==id))}
              canDelete={DEFAULT_INVERTERS.findIndex(d=>d.id===inv.id)===-1}/>
          ))}</div>
          <NewInverterForm onAdd={inv=>setInverters(prev=>[...prev,inv])}/>
        </div>}

        {activeTab==="batterij"&&<div className="section">
          <div className="sl">Thuisbatterijen</div>
          <div className="toggle-row"><span className="toggle-lbl" style={{fontSize:10}}>Batterij opnemen in berekening</span><label className="toggle"><input type="checkbox" checked={battEnabled} onChange={e=>setBattEnabled(e.target.checked)}/><span className="tslider"/></label></div>
          <div className="info-box alpha-info"><strong>🔋 AlphaESS G3</strong> · LiFePO4 · 1C · 10.000 cycli · 95% DoD · 10j</div>
          <div className="filter-row">{[["alle","Alle"],["alpha","AlphaESS G3"],["overig","Andere"]].map(([k,l])=><button key={k} className={`filter-btn ${battFilter===k?"active":""}`} onClick={()=>setBattFilter(k)}>{l}</button>)}</div>
          <div className="list">{filteredBatt.map(b=><BattCard key={b.id} b={b} selected={b.id===selBattId} onSelect={setSelBattId} onDelete={id=>setBatteries(bs=>bs.filter(x=>x.id!==id))} canDelete={DEFAULT_BATTERIES.findIndex(d=>d.id===b.id)===-1}/>)}</div>
          <NewBattForm onAdd={b=>setBatteries(bs=>[...bs,b])}/>
        </div>}

        {activeTab==="technisch"&&<div className="section">
          <div className="sl">Configuratie van de omvormer</div>
          {!selPanel?.voc&&<div className="info-box warn"><strong>⚠️ Onvolledige paneel-data</strong><br/>Het geselecteerde paneel heeft geen elektrische specs (Voc/Vmp/Isc).</div>}
          {!selInv&&<div className="info-box warn"><strong>⚠️ Geen omvormer geselecteerd</strong><br/>Kies eerst een omvormer in het AlphaESS-tabblad.</div>}
          {stringDesign&&<>
            {/* Project + temperatuur header */}
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:14,marginBottom:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div>
                <div style={{fontSize:11,marginBottom:6}}><strong>Project:</strong> {customer.name||"—"}</div>
                <div style={{fontSize:11,marginBottom:6}}><strong>Locatie:</strong> {(customer.address||displayName||"—").split(",").slice(0,2).join(",")}</div>
                <div style={{fontSize:11}}><strong>Datum:</strong> {new Date().toLocaleDateString("nl-BE")}</div>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:600,marginBottom:4}}>Omgevingstemperatuur</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>Min: <strong style={{color:"var(--text)"}}>{stringDesign.config.tempMin} °C</strong></div>
                <div style={{fontSize:11,color:"var(--muted)"}}>Config: <strong style={{color:"var(--text)"}}>{stringDesign.config.tempConfig} °C</strong></div>
                <div style={{fontSize:11,color:"var(--muted)"}}>Max: <strong style={{color:"var(--text)"}}>{stringDesign.config.tempMax} °C</strong></div>
              </div>
            </div>

            {/* MPPT-verdeling per oriëntatie — kernonderdeel */}
            <div className="sl" style={{marginBottom:8}}>MPPT-verdeling per dakrichting</div>
            <div style={{marginBottom:10,padding:"8px 12px",background:"var(--blue-bg)",border:"1px solid var(--blue-border)",borderRadius:6,fontSize:10,color:"var(--blue)"}}>
              ℹ️ Panelen met <strong>verschillende oriëntatie</strong> worden op <strong>aparte MPPT-ingangen</strong> aangesloten.
              Elke MPPT-tracker werkt optimaal als alle panelen op die ingang dezelfde richting hebben.
            </div>

            {stringDesign.tooManyOrientations&&<div className="info-box warn" style={{marginBottom:10}}>
              <strong>⚠️ Meer dakrichtingen dan MPPT-ingangen</strong><br/>
              <span style={{fontSize:11}}>Je hebt panelen op {orientationGroups?.length} richtingen maar de {selInv.model} heeft slechts {selInv.mpptCount||selInv.mppt||2} MPPT-ingangen.
              Sommige richtingen moeten samengevoegd worden. Overweeg een omvormer met meer MPPT-ingangen.</span>
            </div>}

            <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(stringDesign.mppts.length,3)},1fr)`,gap:8,marginBottom:12}}>
              {stringDesign.mppts.map((m,i)=>(
                <div key={i} style={{background:"var(--bg2)",border:"2px solid var(--alpha-border)",
                  borderRadius:10,padding:14,borderTop:"3px solid var(--alpha)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"var(--alpha)"}}>
                      Ingang {String.fromCharCode(65+i)}
                    </span>
                    <span style={{fontSize:9,color:"var(--muted)"}}>MPPT {i+1}</span>
                  </div>

                  {/* Oriëntatie-badges */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
                    {(m.faces||[{orientation:m.orientationLabel?.split("·")[0]?.trim()||orientation,
                      slope:m.orientationLabel?.split("·")[1]?.trim()||slope+"°",count:m.totalPanels}])
                      .map((f2,fi)=>(
                        <div key={fi} style={{padding:"4px 10px",borderRadius:6,
                          background:"var(--amber-light)",border:"1px solid #fde68a",
                          fontSize:10,fontWeight:600,color:"var(--amber)"}}>
                          <div>{f2.orientation} · {typeof f2.slope==="number"?f2.slope+"°":f2.slope}</div>
                          <div style={{fontWeight:400,fontSize:9,color:"var(--muted)"}}>{f2.count} panelen</div>
                        </div>
                    ))}
                  </div>

                  {m.multiOrientation&&<div style={{fontSize:9,color:"var(--red)",marginBottom:8,
                    padding:"3px 8px",background:"var(--red-bg)",borderRadius:4,border:"1px solid var(--red-border)"}}>
                    ⚠️ Gemengde oriëntaties — suboptimaal
                  </div>}

                  {/* Sleutelwaarden */}
                  <table style={{width:"100%",fontSize:10,borderCollapse:"collapse"}}>
                    <tbody>
                      {[
                        ["Panelen",m.totalPanels],
                        ["Strings",m.stringCount],
                        ["Piekvermogen",(m.powerStc/1000).toFixed(2)+" kWp"],
                        ["Voc koud",<span style={{color:m.checks?.vocColdOk===false?"var(--red)":"var(--green)",fontWeight:600}}>{m.vocCold?.toFixed(0)} V {m.checks?.vocColdOk===false?"✗":"✓"}</span>],
                        ["Vmp warm",<span style={{color:m.checks?.vmpHotOk===false?"var(--red)":"var(--green)",fontWeight:600}}>{m.vmpHot?.toFixed(0)} V {m.checks?.vmpHotOk===false?"✗":"✓"}</span>],
                        ["Isc totaal",<span style={{color:m.checks?.iscOk===false?"var(--red)":"var(--green)",fontWeight:600}}>{m.iscTotal?.toFixed(1)} A {m.checks?.iscOk===false?"✗":"✓"}</span>],
                      ].map(([lbl,val],ri)=>(
                        <tr key={ri} style={{borderBottom:"1px solid var(--border)"}}>
                          <td style={{padding:"3px 0",color:"var(--muted)"}}>{lbl}</td>
                          <td style={{padding:"3px 0",textAlign:"right",fontWeight:600}}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            {/* Volledige technische detailtabel */}
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:14,marginBottom:10,overflowX:"auto"}}>
              <div className="sl" style={{marginBottom:8}}>Volledige technische tabel</div>
              <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:500}}>
                <thead>
                  <tr style={{borderBottom:"2px solid var(--border)"}}>
                    <th style={{textAlign:"left",padding:"6px 4px",color:"var(--muted)",fontWeight:500}}></th>
                    {stringDesign.mppts.map((m,i)=>(
                      <th key={i} style={{textAlign:"right",padding:"6px 4px",fontWeight:600}}>
                        <div>Ingang {String.fromCharCode(65+i)}</div>
                        <div style={{fontSize:9,color:"var(--amber)",fontWeight:400}}>
                          {m.faces?.map(f2=>f2.orientation).join("+") || m.orientationLabel?.split("·")[0]?.trim() || orientation}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <TechRow label="Aantal strings" mppts={stringDesign.mppts} val={m=>m.stringCount}/>
                  <TechRow label="PV-panelen" mppts={stringDesign.mppts} val={m=>m.totalPanels}/>
                  <TechRow label="Piekvermogen" mppts={stringDesign.mppts} val={m=>(m.powerStc/1000).toFixed(2)+" kWp"}/>
                  <TechRow label="Min. DC-spanning WR" mppts={stringDesign.mppts} val={()=>stringDesign.config.inverterMpptMin+" V"}/>
                  <TechRow label={`Typ. PV-spanning (${stringDesign.config.tempConfig}°C)`} mppts={stringDesign.mppts} val={m=>m.vmpConfig.toFixed(0)+" V"} check={m=>m.checks.vmpConfigOk}/>
                  <TechRow label={`Min. PV-spanning (${stringDesign.config.tempMax}°C)`} mppts={stringDesign.mppts} val={m=>m.vmpHot.toFixed(0)+" V"} check={m=>m.checks.vmpHotOk}/>
                  <TechRow label="Max. DC-spanning omvormer" mppts={stringDesign.mppts} val={()=>stringDesign.config.inverterMaxDc+" V"}/>
                  <TechRow label={`Max. PV-spanning (${stringDesign.config.tempMin}°C)`} mppts={stringDesign.mppts} val={m=>m.vocCold.toFixed(0)+" V"} check={m=>m.checks.vocColdOk}/>
                  <TechRow label="Max. ingangsstroom MPPT" mppts={stringDesign.mppts} val={()=>stringDesign.config.inverterMaxCurrent+" A"}/>
                  <TechRow label="Max. PV-generatorstroom (Imp)" mppts={stringDesign.mppts} val={m=>m.impTotal.toFixed(1)+" A"} check={m=>m.checks.impOk}/>
                  <TechRow label="Max. kortsluitstroom MPPT" mppts={stringDesign.mppts} val={()=>stringDesign.config.inverterMaxCurrent+" A"}/>
                  <TechRow label="Max. kortsluitstroom PV (Isc)" mppts={stringDesign.mppts} val={m=>m.iscTotal.toFixed(1)+" A"} check={m=>m.checks.iscOk}/>
                </tbody>
              </table>
            </div>
            {stringDesign.warnings.length===0
              ?<div className="info-box alpha-info"><strong>✅ Configuratie OK</strong><br/><span style={{fontSize:11}}>Alle technische limieten worden gerespecteerd.</span></div>
              :<div style={{display:"flex",flexDirection:"column",gap:6}}>
                {stringDesign.warnings.map((w,i)=>(
                  <div key={i} className="info-box warn" style={{borderLeftWidth:4,borderLeftStyle:"solid",borderLeftColor:w.severity==="critical"?"var(--red)":"var(--amber)"}}>
                    <strong>{w.severity==="critical"?"🚫":"⚠️"} {w.title}</strong><br/><span style={{fontSize:11}}>{w.detail}</span>
                  </div>
                ))}
              </div>
            }
          </>}
        </div>}

        {activeTab==="resultaten"&&(results?(
          <div className="results-wrap">
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {results.grbOk&&<div style={{padding:"4px 9px",background:"var(--green-bg)",border:"1px solid var(--green-border)",borderRadius:12,fontSize:8,color:"var(--green)",fontWeight:500}}>✅ GRB dakcontour · {results.detectedArea} m²</div>}
              {results.dhmOk&&<div style={{padding:"4px 9px",background:"var(--alpha-bg)",border:"1px solid var(--alpha-border)",borderRadius:12,fontSize:8,color:"var(--alpha)",fontWeight:500}}>✅ LiDAR · {results.orientation} {results.slope}°</div>}
              {customer.name&&<div style={{padding:"4px 9px",background:"var(--amber-light)",border:"1px solid #fde68a",borderRadius:12,fontSize:8,color:"var(--amber)",fontWeight:500}}>👤 {customer.name}</div>}
            </div>
            <div style={{padding:"7px 11px",background:"var(--blue-bg)",border:"1px solid var(--blue-border)",borderRadius:6,fontSize:9,color:"var(--blue)"}}>🗺️ <strong>Configuratie tab</strong> — {results.panelCount} panelen zichtbaar op het dak.</div>
            <div><div className="sl" style={{marginBottom:8}}>Systeemoverzicht</div>
              <div className="results-grid">
                <div className="rc"><div className="rc-label">Paneel</div><div className="rc-num" style={{fontSize:12,lineHeight:1.3}}>{results.panel.model}</div><div className="rc-unit">{results.panel.brand} · {results.panel.watt}W</div></div>
                {results.inv&&<div className="rc alpha-rc"><div className="rc-label">AlphaESS</div><div className="rc-num" style={{fontSize:12,lineHeight:1.3}}>{results.inv.model}</div><div className="rc-unit">{results.inv.fase} · {results.inv.kw}kW</div></div>}
                <div className="rc"><div className="rc-label">Installatie</div><div className="rc-num">{results.panelCount}</div><div className="rc-unit">panelen · {results.actualArea} m² · {((results.panelCount*results.panel.watt)/1000).toFixed(1)} kWp</div></div>
                <div className="rc green"><div className="rc-label">Jaarlijkse opbrengst</div><div className="rc-num">{results.annualKwh.toLocaleString()}</div><div className="rc-unit">kWh / jaar</div></div>
                <div className="rc"><div className="rc-label">Dakvlakken</div><div className="rc-num" style={{fontSize:11,lineHeight:1.3}}>{results.faceSummary||`${results.orientation} ${results.slope}°`}</div><div className="rc-unit">{results.irr} kWh/m²/j irradiantie</div></div>
                <div className="rc"><div className="rc-label">CO₂ besparing</div><div className="rc-num">{results.co2}</div><div className="rc-unit">kg / jaar</div></div>
                <div className="rc"><div className="rc-label">Dekkingsgraad</div><div className="rc-num">{results.coverage}%</div><div className="rc-unit">van gemiddeld verbruik</div></div>
              </div>
            </div>
            <MonthlyChart annualKwh={results.annualKwh}/>
            <div style={{background:results.investPanels===null?"var(--amber-light)":"var(--bg2)",border:`2px solid ${results.investPanels===null?"var(--amber)":"var(--border)"}`,borderRadius:8,padding:14,boxShadow:"var(--shadow)"}}>
              <div className="sl" style={{marginBottom:8}}>{results.investPanels===null?"⚠️ ":""}💰 Totaalprijzen uit offerte{results.investPanels===null&&<span style={{color:"var(--red)",fontWeight:600,marginLeft:8}}>(verplicht)</span>}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>
                  <div className="inp-label" style={{fontSize:11,fontWeight:600}}>🔆 Totaalprijs ZONDER batterij (€) <span style={{color:"var(--red)"}}>*</span></div>
                  <input className="inp" type="number" min="0" step="50" placeholder="bv. 8000" value={manualPanelPrice} onChange={e=>setManualPanelPrice(e.target.value)}/>
                  <div style={{fontSize:9,color:"var(--muted)",marginTop:3}}>Panelen + installatie + omvormer</div>
                </div>
                <div>
                  <div className="inp-label" style={{fontSize:11,fontWeight:600}}>🔋 Totaalprijs MET batterij (€) {battEnabled&&<span style={{color:"var(--red)"}}>*</span>}</div>
                  <input className="inp" type="number" min="0" step="50" placeholder={battEnabled?"bv. 14000":"Activeer batterij in tabblad 05"} value={manualBatteryPrice} onChange={e=>setManualBatteryPrice(e.target.value)} disabled={!battEnabled}/>
                  <div style={{fontSize:9,color:"var(--muted)",marginTop:3}}>Volledig pakket incl. batterij</div>
                </div>
              </div>
            </div>
            <div><div className="sl" style={{marginBottom:8}}>Terugverdientijd vergelijking</div>
              <div className="compare-grid">
                <div className="compare-col">
                  <h4>🔆 Alleen zonnepanelen</h4>
                  <div className="crow">Zelfverbruik<span>~{Math.round(results.selfRatioBase*100)}% ({results.selfKwhBase.toLocaleString()} kWh)</span></div>
                  <div className="crow">Injectie naar net<span>{results.injectKwhBase.toLocaleString()} kWh</span></div>
                  <div className="crow">Besparing/jaar<span>€{results.annualBase}</span></div>
                  <div className="ctotal"><span>Investering</span><span style={{fontSize:13}}>{results.investPanels!==null?"€"+results.investPanels.toLocaleString():<span style={{color:"var(--red)",fontStyle:"italic"}}>vul prijs in ↑</span>}</span></div>
                  <div className="ctotal"><span>Terugverdientijd</span><div className="cval">{results.paybackBase!==null?results.paybackBase+" jaar":<span style={{color:"var(--muted)",fontStyle:"italic",fontSize:11}}>—</span>}</div></div>
                  {results.paybackBase!==null&&<div className="pbar"><div className="pfill" style={{width:`${Math.min(100,(results.paybackBase/25)*100)}%`}}/></div>}
                </div>
                {results.battResult?(
                  <div className={`compare-col batt ${results.batt?.isAlpha?"alpha-col":""}`}>
                    <h4>{results.batt?.isAlpha?"⚡🔋":"🔋"} Met {results.batt?.brand} {results.batt?.model}</h4>
                    <div className="crow">Zelfverbruik<span>~70% ({results.battResult.selfKwh.toLocaleString()} kWh)</span></div>
                    <div className="crow">Extra besparing<span style={{color:"var(--green)"}}>+€{results.battResult.extraSav}/j</span></div>
                    <div className="crow">Totale besparing<span>€{results.battResult.totSav}/j</span></div>
                    <div className="ctotal"><span>Investering</span><span style={{fontSize:13}}>{results.battResult.totInv!==null?"€"+results.battResult.totInv.toLocaleString():<span style={{color:"var(--red)",fontStyle:"italic"}}>vul prijzen in ↑</span>}</span></div>
                    <div className="ctotal"><span>Terugverdientijd</span><div className="cval">{results.battResult.payback!==null?results.battResult.payback+" jaar":<span style={{color:"var(--muted)",fontStyle:"italic",fontSize:11}}>—</span>}</div></div>
                    {results.battResult.payback!==null&&<div className="pbar"><div className="pfill" style={{width:`${Math.min(100,(results.battResult.payback/25)*100)}%`,background:"linear-gradient(90deg,var(--blue),var(--alpha))"}}/></div>}
                  </div>
                ):(
                  <div className="compare-col" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,opacity:.6}}>
                    <div style={{fontSize:28}}>🔋</div>
                    <div style={{fontSize:11,textAlign:"center",color:"var(--muted)"}}>Activeer batterij in de Batterij tab voor vergelijking</div>
                    <button className="btn blue sm" onClick={()=>setActiveTab("batterij")}>Batterij instellen</button>
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="sl" style={{marginBottom:7}}>AI Expert Advies{!aiLoading&&aiText&&<span style={{fontSize:10,fontWeight:400,color:"var(--muted)",marginLeft:8}}>· Bewerkbaar</span>}</div>
              {aiLoading?(<div className="ai-box loading"><div className="spinner"/>Claude analyseert uw installatie...</div>):(
                <>
                  <textarea value={editableAiText} onChange={e=>setEditableAiText(e.target.value)}
                    placeholder="Hier verschijnt het AI advies. Je kan dit bewerken voordat het in het PDF-rapport komt."
                    style={{width:"100%",minHeight:240,padding:12,background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text)",fontSize:13,lineHeight:1.6,fontFamily:"inherit",resize:"vertical",boxShadow:"var(--shadow)"}}/>
                  <div style={{display:"flex",gap:8,marginTop:6,fontSize:10,color:"var(--muted)"}}>
                    <span>{editableAiText.length} tekens</span>
                    {aiText&&aiText!==editableAiText&&(<button className="btn sec sm" style={{fontSize:10}} onClick={()=>setEditableAiText(aiText)}>↩ Origineel herstellen</button>)}
                  </div>
                </>
              )}
            </div>
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:14,boxShadow:"var(--shadow)"}}>
              <div className="sl" style={{marginBottom:8}}>PDF Rapport genereren</div>
              {!customer.name&&<div className="info-box warn" style={{marginBottom:8}}><strong>⚠️</strong> Voeg klantnaam toe in de "Klant" tab voor het rapport.</div>}
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
                <button className="btn green" onClick={handlePDF} disabled={pdfLoading||!results}>
                  {pdfLoading?<><div className="spinner"/>Luchtfoto + PDF genereren...</>:"📄 Download PDF rapport"}
                </button>
                {tlAuth?.logged_in&&tlSelectedDealId&&results&&<button
                  className={`btn ${tlCreateQuotStatus==="ok"?"green":tlCreateQuotStatus==="error"?"danger":"alpha"}`}
                  onClick={handleCreateTlQuotation}
                  disabled={tlCreateQuotStatus==="loading"}
                  style={{fontSize:10}}>
                  {tlCreateQuotStatus==="loading"?<><div className="spinner"/>Offerte aanmaken...</>
                    :tlCreateQuotStatus==="ok"?"✅ Offerte aangemaakt in TL"
                    :"📋 Maak offerte in Teamleader"}
                </button>}
              </div>
              {/* TL offerte status + link */}
              {tlCreateQuotStatus==="ok"&&<div style={{padding:"6px 10px",background:"var(--green-bg)",
                border:"1px solid var(--green-border)",borderRadius:6,fontSize:9,marginBottom:6}}>
                ✅ Offerte aangemaakt in Teamleader!
                {tlCreateQuotUrl&&<> <a href={tlCreateQuotUrl} target="_blank" rel="noopener noreferrer"
                  style={{color:"var(--alpha)",fontWeight:600,marginLeft:6}}>Open in TL →</a></>}
                <br/><span style={{fontSize:8,color:"var(--muted)"}}>
                  Dakbedekking: {buildings.find(b=>b.id===selBuildingId)?.dakbedekking||"—"} ·
                  Aantallen aangepast: {results.panelCount} panelen
                </span>
              </div>}
              {/* Waarschuwing als dakbedekking niet ingesteld */}
              {tlAuth?.logged_in&&tlSelectedDealId&&results&&!buildings.find(b=>b.id===selBuildingId)?.dakbedekking&&
                <div style={{fontSize:9,color:"var(--amber)",marginBottom:6}}>
                  ⚠️ Kies eerst de dakbedekking op tab 02 Configuratie voor de juiste template.
                </div>}
              <div style={{fontSize:8,color:"var(--muted)",lineHeight:1.7}}>
                <strong>📸 Luchtfoto wordt automatisch gemaakt</strong> bij het genereren (OSM-kaart + panelen).<br/>
                <strong>Rapport bevat:</strong> klantgegevens · systeemoverzicht · maandgrafiek · terugverdienberekening<br/>
                <strong style={{color:"var(--green)"}}>+ Datasheets bijgevoegd:</strong>{" "}
                {(results?.panel?.datasheet||results?.panel?.datasheetData)?<span style={{color:"var(--green)"}}>✅ {results.panel.brand} {results.panel.watt}W{results.panel.datasheetData?" (geüpload)":""}</span>:<span style={{color:"var(--muted2)"}}>— geen datasheet</span>}
                {" · "}
                {results?.inv&&(results.inv.datasheet||results.inv.datasheetData)?<span style={{color:"var(--green)"}}>✅ {results.inv.brand} {results.inv.model}{results.inv.datasheetData?" (geüpload)":""}</span>:<span style={{color:"var(--muted2)"}}>— geen datasheet</span>}
              </div>
            </div>
          </div>
        ):(<>
          {/* Prijsinvoer altijd zichtbaar — ook vóór eerste berekening */}
          <div className="results-wrap">
            <div style={{background:"var(--amber-light)",border:"2px solid var(--amber)",borderRadius:10,padding:20,textAlign:"center",marginBottom:4}}>
              <div style={{fontSize:22,marginBottom:8}}>💰</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:800,color:"var(--text)",marginBottom:6}}>Vul de installatieprijs in</div>
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:16,lineHeight:1.6}}>Zonder prijs kan de terugverdientijd niet worden berekend.<br/>Vul de offertebedragen in en klik daarna op Bereken.</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16,textAlign:"left"}}>
                <div>
                  <div className="inp-label" style={{fontSize:11,fontWeight:600}}>🔆 Totaalprijs ZONDER batterij (€) <span style={{color:"var(--red)"}}>*</span></div>
                  <input className="inp" type="number" min="0" step="50"
                    placeholder="bv. 8000"
                    value={manualPanelPrice} onChange={e=>setManualPanelPrice(e.target.value)}
                    autoFocus/>
                  <div style={{fontSize:9,color:"var(--muted)",marginTop:3}}>Panelen + omvormer + installatie</div>
                </div>
                <div>
                  <div className="inp-label" style={{fontSize:11,fontWeight:600}}>🔋 Totaalprijs MET batterij (€)</div>
                  <input className="inp" type="number" min="0" step="50"
                    placeholder="bv. 14000"
                    value={manualBatteryPrice} onChange={e=>setManualBatteryPrice(e.target.value)}/>
                  <div style={{fontSize:9,color:"var(--muted)",marginTop:3}}>Volledig pakket incl. batterij</div>
                </div>
              </div>
              <button className="btn full" style={{maxWidth:280,margin:"0 auto"}}
                onClick={()=>{if(manualPanelPrice&&parseFloat(manualPanelPrice)>0) calculate();}}
                disabled={!coords||!buildingCoords||!manualPanelPrice||parseFloat(manualPanelPrice)<=0||isLoading}>
                {!coords?"📍 Voer eerst een adres in":!manualPanelPrice||parseFloat(manualPanelPrice)<=0?"Vul prijs in om te berekenen":"☀️ Bereken resultaten"}
              </button>
            </div>
            {!coords&&<div className="info-box warn" style={{textAlign:"center"}}>
              <strong>📍 Geen adres geselecteerd</strong> — ga naar het Locatie-veld in de sidebar om te starten.
            </div>}
          </div>
        </>))}
      </div>
    </div>
  </div>
  </>);
}

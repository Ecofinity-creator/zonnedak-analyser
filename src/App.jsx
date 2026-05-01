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
import { ECOFINITY_LOGO_BASE64, ECOFINITY_LOGO_WIDTH, ECOFINITY_LOGO_HEIGHT } from "./ecofinityLogo.js";

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
  const miniHeader=(pg)=>{
    doc.setFillColor(...OR);doc.rect(0,0,W,14,"F");
    sf(9,"bold");sc(WHT);doc.text("EcoFinity BV",M,9);
    sf(9,"normal");doc.text("Project: "+(customer.name||"—"),M+32,9);
    sf(8,"normal");doc.text("Pagina "+pg,W-M,9,{align:"right"});
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
    const head=["",...sd.mppts.map((m,i)=>"Ingang "+String.fromCharCode(65+i))];
    const cell=(check,val)=>check===null?val:(check?"+ ":"- ")+val;
    const rows=[
      ["Aantal strings",...sd.mppts.map(m=>m.stringCount+"")],
      ["PV-panelen",...sd.mppts.map(m=>m.totalPanels+"")],
      ["Piekvermogen",...sd.mppts.map(m=>(m.powerStc/1000).toFixed(2)+" kWp")],
      ["Min. DC-spanning WR",...sd.mppts.map(()=>sd.config.inverterMpptMin+" V")],
      ["Typ. PV-spanning ("+sd.config.tempConfig+"°C)",...sd.mppts.map(m=>cell(m.checks.vmpConfigOk,m.vmpConfig.toFixed(0)+" V"))],
      ["Min. PV-spanning ("+sd.config.tempMax+"°C)",...sd.mppts.map(m=>cell(m.checks.vmpHotOk,m.vmpHot.toFixed(0)+" V"))],
      ["Max. DC-spanning omvormer",...sd.mppts.map(()=>sd.config.inverterMaxDc+" V")],
      ["Max. PV-spanning ("+sd.config.tempMin+"°C)",...sd.mppts.map(m=>cell(m.checks.vocColdOk,m.vocCold.toFixed(0)+" V"))],
      ["Max. ingangsstroom MPPT",...sd.mppts.map(()=>sd.config.inverterMaxCurrent+" A")],
      ["Max. PV-generatorstroom (Imp)",...sd.mppts.map(m=>cell(m.checks.impOk,m.impTotal.toFixed(1)+" A"))],
      ["Max. kortsluitstroom MPPT",...sd.mppts.map(()=>sd.config.inverterMaxCurrent+" A")],
      ["Max. kortsluitstroom PV (Isc)",...sd.mppts.map(m=>cell(m.checks.iscOk,m.iscTotal.toFixed(1)+" A"))],
    ];
    doc.autoTable({startY:y,head:[head],body:rows,
      styles:{fontSize:7.5,cellPadding:2},
      headStyles:{fillColor:BL,textColor:WHT,fontStyle:"bold",halign:"right"},
      columnStyles:{0:{cellWidth:62,textColor:MUT,fontStyle:"normal",halign:"left"}},
      bodyStyles:{halign:"right",fontStyle:"bold"},
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
    y+=4;hLine(y);y+=8;
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
  // Aanpak:
  //   Achtergrond = OSM-snapshot (JPEG).
  //   Paneel-vectoren worden EXACT uitgelijnd via de opgeslagen Leaflet-bounds.
  //   Bounds worden opgeslagen bij snapshot → zelfde viewport → perfecte overlap.
  try{
    let imgData=null,imgRatio=1,snapBounds=null;
    if(mapSnapshot?.dataUrl){
      imgData    = mapSnapshot.dataUrl;
      imgRatio   = mapSnapshot.height/mapSnapshot.width;
      snapBounds = mapSnapshot.bounds||null; // {north,south,east,west}
    }

    doc.addPage();
    doc.setFillColor(...OR);doc.rect(0,0,W,14,"F");
    sf(11,"bold");sc(WHT);doc.text("EcoFinity BV",M,9);
    sf(11,"normal");doc.text("Project: "+(customer.name||"—"),M+38,9);
    sf(10,"normal");doc.text("Luchtfoto + Paneelplaatsing",W-M,9,{align:"right"});
    y=22;
    y=secTitle("Paneelplaatsing op het dak",y);

    const imgW=W-2*M;
    const imgH=imgData?Math.min(150,imgW*imgRatio):100;
    const imgX=M, imgY=y;

    if(imgData){
      doc.addImage(imgData,"JPEG",imgX,imgY,imgW,imgH);
    } else {
      doc.setFillColor(220,230,240);
      doc.rect(imgX,imgY,imgW,imgH,"F");
      sf(9,"italic");sc(MUT);
      doc.text("Gebruik '📸 Foto opslaan voor rapport' voor luchtfoto",imgX+imgW/2,imgY+imgH/2,{align:"center"});
    }

    // ── Paneel vector overlay ────────────────────────────────────────────────
    const panelData=results._panelData;
    if(panelData&&panelData.length>0){

      let toX,toY;

      if(snapBounds){
        // ✅ EXACTE uitlijning: gebruik dezelfde bounds als de snapshot
        // Leaflet Y-as: north = boven, south = onder → in PDF ook north = kleine y
        const {north,south,east,west}=snapBounds;
        const lngRange=east-west||0.0001;
        const latRange=north-south||0.0001;
        toX=lng=>imgX+(lng-west)/lngRange*imgW;
        toY=lat=>imgY+(north-lat)/latRange*imgH;
      } else {
        // Fallback: bereken bounds vanuit de data zelf (minder nauwkeurig)
        const bc=results._buildingCoords||results._facePoly||[];
        const allPts=[...bc,...panelData.flatMap(p=>p.corners)];
        if(allPts.length===0) throw new Error("geen punten");
        const minLat=Math.min(...allPts.map(p=>p[0]));
        const maxLat=Math.max(...allPts.map(p=>p[0]));
        const minLng=Math.min(...allPts.map(p=>p[1]));
        const maxLng=Math.max(...allPts.map(p=>p[1]));
        const cLat=(minLat+maxLat)/2;
        const MLAT=111320,MLNG=111320*Math.cos(cLat*Math.PI/180);
        const rngX=(maxLng-minLng)*MLNG||0.1;
        const rngY=(maxLat-minLat)*MLAT||0.1;
        const pad=0.15;
        const eW=imgW*(1-2*pad),eH=imgH*(1-2*pad);
        const sc2=Math.min(eW/rngX,eH/rngY);
        const oX=imgX+imgW*pad+(eW-rngX*sc2)/2;
        const oY=imgY+imgH*pad+(eH-rngY*sc2)/2;
        toX=lng=>oX+(lng-minLng)*MLNG*sc2;
        toY=lat=>oY+(maxLat-lat)*MLAT*sc2;
      }

      // Dakcontour (oranje lijn, semi-transparant via lage opacity)
      const bc=results._buildingCoords;
      if(bc&&bc.length>=3){
        doc.setDrawColor(...OR);doc.setLineWidth(0.7);
        const bcPts=bc.map(([la,ln])=>[toX(ln),toY(la)]);
        const moves=bcPts.slice(1).map(([x,y],i)=>[x-bcPts[i][0],y-bcPts[i][1]]);
        doc.lines(moves,bcPts[0][0],bcPts[0][1],[1,1],"S",true);
      }

      // Panelen: blauw gevuld
      doc.setFillColor(37,99,235);
      doc.setDrawColor(10,30,80);
      doc.setLineWidth(0.1);
      panelData.forEach(panel=>{
        const pts=panel.corners.map(([la,ln])=>[toX(ln),toY(la)]);
        if(pts.length<3) return;
        doc.setFillColor(37,99,235);
        try{ doc.polygon(pts,"FD"); }
        catch{
          const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
          const rx=Math.min(...xs),ry=Math.min(...ys);
          const rw=Math.max(...xs)-rx,rh=Math.max(...ys)-ry;
          if(rw>0.1&&rh>0.1) doc.rect(rx,ry,rw,rh,"FD");
        }
      });

      sf(8,"bold");sc([37,99,235]);
      doc.text(`${panelData.length} panelen · ${((panelData.length*results.panel.watt)/1000).toFixed(1)} kWp`,imgX,imgY+imgH+6);
    }

    sf(7,"italic");sc(MUT);
    doc.text("Luchtfoto: "+(imgData?"OpenStreetMap":"niet beschikbaar")+" · Paneelplaatsing is een schatting.",imgX,imgY+imgH+(panelData?.length>0?12:6));
    y=imgY+imgH+18;

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

  const mainPdfBytes=doc.output("arraybuffer");
  const mergedPdf=await PDFDocument.load(new Uint8Array(mainPdfBytes));

  const dsFiles=[];
  if(results.panel?.datasheet) dsFiles.push({file:results.panel.datasheet,label:`${results.panel.brand} ${results.panel.model}`,type:"Paneel datasheet"});
  if(results.inv?.datasheet&&results.inv.datasheet!==results.panel?.datasheet)
    dsFiles.push({file:results.inv.datasheet,label:`${results.inv.brand} ${results.inv.model}`,type:"Omvormer datasheet"});

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
    const bytes=await fetchPdfBytes(DS_BASE+ds.file);
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
function InverterCard({inv,selected,onSelect}){return(
  <div className={`inv-card ${selected?"selected":""}`} onClick={()=>onSelect(inv.id)}>
    <div className="alpha-badge">⚡ AlphaESS G3</div>
    <div className="card-name">{inv.model}</div><div className="card-brand">{inv.brand} · {inv.fase}</div>
    <div className="chips"><span className="chip alpha-c">{inv.kw}kW</span><span className="chip">{inv.mppt} MPPT</span><span className="chip">max {inv.maxPv/1000}kWp</span><span className="chip">{inv.eff}% eff</span><span className="chip">{inv.warranty}j</span></div>
    <div className="card-notes">{inv.notes}</div>
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
  const e0={brand:"",model:"",watt:"",area:"",eff:"",warranty:"25",dims:"",weight:""};
  const[f,setF]=useState(e0);const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const ok=f.brand&&f.model&&+f.watt>0&&+f.area>0&&+f.eff>0;
  return(<div className="new-form"><h4>➕ Nieuw paneel toevoegen</h4>
    <div className="inp-2"><div><div className="inp-label">Merk</div><input className="inp" placeholder="Jinko" value={f.brand} onChange={e=>s("brand",e.target.value)}/></div><div><div className="inp-label">Model</div><input className="inp" placeholder="Tiger 420W" value={f.model} onChange={e=>s("model",e.target.value)}/></div></div>
    <div className="inp-3"><div><div className="inp-label">Watt</div><input className="inp" type="number" placeholder="420" value={f.watt} onChange={e=>s("watt",e.target.value)}/></div><div><div className="inp-label">m²</div><input className="inp" type="number" placeholder="1.72" value={f.area} onChange={e=>s("area",e.target.value)}/></div><div><div className="inp-label">Eff %</div><input className="inp" type="number" placeholder="21.5" value={f.eff} onChange={e=>s("eff",e.target.value)}/></div></div>
    <div className="inp-2"><div><div className="inp-label">Garantie (j)</div><input className="inp" type="number" placeholder="25" value={f.warranty} onChange={e=>s("warranty",e.target.value)}/></div><div></div></div>
    <div className="inp-2"><div><div className="inp-label">Afmetingen</div><input className="inp" placeholder="1756×1096×35mm" value={f.dims} onChange={e=>s("dims",e.target.value)}/></div><div><div className="inp-label">Gewicht</div><input className="inp" placeholder="21.3 kg" value={f.weight} onChange={e=>s("weight",e.target.value)}/></div></div>
    <button className="btn full" disabled={!ok} onClick={()=>{onAdd({...f,id:Date.now(),watt:+f.watt,area:+f.area,eff:+f.eff,price:0,warranty:+f.warranty});setF(e0);}}>Paneel toevoegen</button>
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
          <div className="sl" style={{fontSize:9,marginBottom:4}}>Adres voor dit project</div>
          {tlContact.addresses.length===1?<div style={{fontSize:9,color:"var(--muted)"}}>{tlContact.addresses[0].full}</div>:
            tlContact.addresses.map((a,idx)=>(
              <label key={idx} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"4px 0",cursor:"pointer",fontSize:9}}>
                <input type="radio" checked={tlSelectedAddressIdx===idx} onChange={()=>onSelectAddress(idx)} style={{marginTop:2}}/>
                <span><strong>{a.type}</strong>: {a.full}</span>
              </label>
            ))
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

        {/* ── Bevestigingsknop: laad adres + ga naar kaart ── */}
        {!showNewDealForm&&<div style={{marginTop:12,borderTop:"2px solid var(--amber)",paddingTop:10}}>
          {!tlSelectedDealId&&<div style={{fontSize:9,color:"var(--amber)",marginBottom:6,textAlign:"center",fontWeight:600}}>
            ⚠️ Kies eerst een deal hierboven (of maak er een aan)
          </div>}
          <button className="btn full" style={{fontSize:11,fontWeight:700}}
            onClick={onConfirm}
            disabled={!pendingGeo||!tlSelectedDealId}>
            {!pendingGeo?"📍 Adres niet gevonden":!tlSelectedDealId?"🤝 Deal vereist":"✅ Bevestig klant + laad kaart →"}
          </button>
          {pendingGeo&&<div style={{fontSize:8,color:"var(--muted)",marginTop:4,textAlign:"center"}}>
            {pendingGeo.display_name?.split(",").slice(0,3).join(", ")}
          </div>}
        </div>}
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
  const roofLayerRef=useRef(null);const panelLayerRef=useRef(null);

  const[panels,setPanels]=useState(DEFAULT_PANELS);
  const[selPanelId,setSelPanelId]=useState(1);
  const selPanel=panels.find(p=>p.id===selPanelId)||panels[0];

  const[inverters]=useState(DEFAULT_INVERTERS);
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
  const[tlPendingGeo,setTlPendingGeo]=useState(null); // geocode resultaat wachtend op bevestiging
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
    setTlContact(details);setTlSelectedAddressIdx(0);setTlSelectedDealId(null);
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

  const handleTlLogin=useCallback(()=>{TL.startTeamleaderLogin();},[]);
  const handleTlLogout=useCallback(()=>{TL.clearUserId();setTlAuth(false);setTlContact(null);setTlResults([]);setTlQuery("");setTlPendingGeo(null);},[]);

  // Bevestig klant: geocode was al gedaan bij contact/adres selectie,
  // nu pas navigeren naar de kaart + GRB laden
  const handleTlConfirm=useCallback(async()=>{
    if(!tlPendingGeo) return;
    await selectAddr({lat:tlPendingGeo.lat,lon:tlPendingGeo.lon,display_name:tlPendingGeo.display_name});
    setTlPendingGeo(null);
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
    orientation,slope,manualPanelPrice,manualBatteryPrice,annualConsumption,
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
    setTlContact(null);setTlQuery("");setTlResults([]);setTlSelectedDealId(null);setTlPendingGeo(null);
    setBuildings([]);setSelBuildingId(null);
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

  useEffect(()=>{
    const f=detectedFaces?.[selFaceIdx];
    if(f?.ridgeAngleDeg!=null) ridgeAngleDegRef.current=f.ridgeAngleDeg;
  },[detectedFaces,selFaceIdx]);

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

    // Update detectedFaces (legacy + kaartweergave)
    const newFacesFinal=[];
    setDetectedFaces(prev=>{
      if(!prev) return prev;
      const updated=prev.map((f,fi)=>{
        const newPoly=newPolygons[fi];
        if(!newPoly) return f;
        const area2d=Math.round(polyAreaLambert72(newPoly));
        const area3d=+compute3dArea(area2d,f.slope).toFixed(1);
        return {...f,polygon:newPoly,area2d_manual:area2d,area3d_manual:area3d,status:"manual"};
      });
      updated.forEach(f=>newFacesFinal.push(f));
      return updated;
    });

    // Update buildings state — anders leest redrawRoof b.faces (old) en snapt terug
    if(selBuildingId){
      setBuildings(prev=>prev.map(b=>{
        if(b.id!==selBuildingId||!b.faces) return b;
        const newFaces=b.faces.map((f,fi)=>{
          const newPoly=newPolygons[fi];
          if(!newPoly) return f;
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
    if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;setPanelsDrawn(false);}

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

  useEffect(()=>{
    if(!panelsDrawn||!buildingCoords||!selPanel||!leafRef.current||!window.L||!coords) return;
    const L=window.L,map=leafRef.current;
    if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
    let _sf=detectedFaces?.[selFaceIdx];
    if(_sf&&!_sf.polygon&&buildingCoords){
      const withPolys=generateFacePolygons(buildingCoords,detectedFaces,_sf.ridgeAngleDeg);
      setDetectedFaces(withPolys);_sf=withPolys?.[selFaceIdx]||_sf;
    }
    const _fp=_sf?.polygon||buildingCoords;
    const _ridge2=ridgeAngleDegRef.current||_sf?.ridgeAngleDeg||0;
    const _fp2=_fp.length>=3?_fp:(buildingCoords?makeFacePoly(buildingCoords,orientation,_ridge2):buildingCoords)||buildingCoords;
    const _ra=panelRotOffset;
    panelLayerRef.current=drawPanelLayer(map,L,_fp2,panelCount,selPanel,_ra,panelOrient,panelDataRef,panelMoveMode);
  },[panelCount,selPanel,panelsDrawn,panelRotOffset]);

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
    // Multi-building: som panelCount van alle geselecteerde gebouwen
    const totalPanelCount=buildings.length>0
      ?buildings.filter(b=>b.selected).reduce((s,b)=>s+(b.panelCount||customCount||10),0)
      :panelCount;
    const effectivePanelCount=totalPanelCount||panelCount;
    // Irradiantie op basis van actief geselecteerd vlak
    const irr=getSolarIrr(orientation,slope);
    const actualArea=effectivePanelCount*selPanel.area,annualKwh=Math.round(actualArea*irr*(selPanel.eff/100));
    const panelCount2=effectivePanelCount; // alias
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
    setResults({irr,panelCount:effectivePanelCount,actualArea:Math.round(actualArea),annualKwh,co2,coverage,
      investPanels,annualBase,paybackBase,battResult,panel:selPanel,inv:selInv,batt:battEnabled?selBatt:null,
      detectedArea,grbOk:grbStatus==="ok",dhmOk:dhmStatus==="ok",orientation,slope,
      stringDesign:stringDesign||null,consumption:Math.round(consumption),
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
      const dhmStr=dhmStatus==="ok"&&detectedFaces?`\nDHM LiDAR: ${detectedFaces.map(f=>`${f.orientation} ${f.slope}° (${f.pct}%)`).join(", ")}`:"\nHandmatige invoer.";
      const invStr=selInv?`\nOmvormer: ${selInv.brand} ${selInv.model} (${selInv.kw}kW)`:"Geen omvormer.";
      const battStr=battResult?`\nBatterij: ${selBatt.brand} ${selBatt.model} (${selBatt.kwh}kWh) · Extra: €${battResult.extraSav}/j · Terugverdien: ${battResult.payback}j`:"Geen batterij.";
      const resp=await fetch(AI_PROXY_URL,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,
          messages:[{role:"user",content:`Je bent een onafhankelijk PV-installatie expert voor woningen in Vlaanderen, België. Geef een beknopt en professioneel advies in het Nederlands voor onderstaande installatie.

CONTEXT VLAANDEREN 2026:
- Salderen bestaat NIET meer. Eigen verbruik bespaart ~€0,28/kWh, injectie levert ~€0,03–0,06/kWh.
- Capaciteitstarief van toepassing. Batterij kan piekverbruik drukken.
- BTW 6% enkel bij woning ouder dan 10 jaar. Geen REG-premie meer.
- Realistisch terugverdien: 7–11 jaar PV zonder batterij, 9–13 jaar met.

INSTALLATIE:
Locatie: ${displayName}
Dak: ${grbStatus==="ok"?"GRB-contour":"Schatting"} · ${detectedArea||80} m²${dhmStr}
Paneel: ${selPanel.brand} ${selPanel.model} (${selPanel.watt}W, ${selPanel.eff}%)
Aantal: ${panelCount} · ${Math.round(actualArea)} m² · ${((panelCount*selPanel.watt)/1000).toFixed(1)} kWp
Helling: ${slope}° ${orientation} · ${irr} kWh/m²/j
${invStr}
Opbrengst: ${annualKwh} kWh/j · CO₂: ${co2} kg/j
Klant verbruik: ${consumption} kWh · dekking ${coverage}% · zelfverbruik ${Math.round(selfRatioBase*100)}%
Investering: ${investPanels!==null?"€"+investPanels.toLocaleString():"niet ingevuld"} · Besparing: €${annualBase}/j · Terugverdien: ${paybackBase!==null?paybackBase+"j":"—"}
${battStr}

GEEF ADVIES VAN MAX 200 WOORDEN:
1. Paneelkeuze en daksituatie beoordeling
2. Eigen verbruik tips
3. Capaciteitstarief implicaties
4. Realistisch terugverdientijd verwachting
5. Aandachtspunten (BTW, AREI, C10/11)

Wees concreet en feitelijk. Geen verkooppraat.`}]})});
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

    try{
      if(!window.html2canvas){
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
      }

      // Teken panelen als ze nog niet zichtbaar zijn
      if(!panelsDrawn&&buildingCoords&&selPanel){
        if(panelDataRef) panelDataRef.current=null;
        if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
        let _sf=detectedFaces?.[selFaceIdx];
        if(_sf&&!_sf.polygon&&buildingCoords){
          const wp=generateFacePolygons(buildingCoords,detectedFaces,_sf.ridgeAngleDeg);
          setDetectedFaces(wp);_sf=wp?.[selFaceIdx]||_sf;
        }
        const _fp=_sf?.polygon||buildingCoords;
        panelLayerRef.current=drawPanelLayer(map,L,_fp,panelCount,selPanel,panelRotOffset,panelOrient,panelDataRef,false);
        setPanelsDrawn(true);
        await new Promise(r=>setTimeout(r,500));
      }

      const mapEl=document.getElementById("leaflet-map");
      if(!mapEl) throw new Error("Kaart-element niet gevonden");

      // Zoom in op het gebouw zodat bounds exact kloppen met paneel-coördinaten
      if(buildingCoords&&buildingCoords.length>=3){
        const latLngs=buildingCoords.map(([la,ln])=>L.latLng(la,ln));
        const bldBounds=L.latLngBounds(latLngs);
        map.fitBounds(bldBounds,{padding:[60,60],maxZoom:20});
        await new Promise(resolve=>{
          let done=false;
          const finish=()=>{if(!done){done=true;resolve();}};
          map.once("moveend",finish);
          setTimeout(finish,1000);
        });
      }

      // Wissel naar OSM tiles (CORS-enabled) — Esri gooit SecurityError op canvas.toDataURL
      osmLayer=L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {attribution:"© OpenStreetMap contributors",maxZoom:21,crossOrigin:""}
      );
      if(origTile) map.removeLayer(origTile);
      osmLayer.addTo(map);

      // Wacht tot tiles volledig geladen zijn
      await new Promise(resolve=>{
        let done=false;
        const finish=()=>{if(!done){done=true;resolve();}};
        osmLayer.on("load",finish);
        setTimeout(finish,4000); // max 4s wachten
      });

      map.invalidateSize(true);
      await new Promise(r=>setTimeout(r,400));

      const canvas=await window.html2canvas(mapEl,{
        useCORS:              true,
        allowTaint:           false,
        scale:                1.5,
        logging:              false,
        backgroundColor:      "#e8e8e8",
        foreignObjectRendering:false,
        imageTimeout:         15000,
        onclone:(clonedDoc)=>{
          clonedDoc.querySelectorAll(".leaflet-overlay-pane svg").forEach(svg=>{
            svg.style.overflow="visible";
          });
          clonedDoc.querySelectorAll(".leaflet-pane").forEach(pane=>{
            pane.style.display="block";
          });
        },
      });

      const dataUrl=canvas.toDataURL("image/jpeg",0.88);
      const mapBounds=map.getBounds();
      return {
        dataUrl,
        width:  canvas.width,
        height: canvas.height,
        timestamp: Date.now(),
        bounds:{
          north: mapBounds.getNorth(),
          south: mapBounds.getSouth(),
          east:  mapBounds.getEast(),
          west:  mapBounds.getWest(),
        },
      };
    }finally{
      // Altijd originele tiles herstellen
      if(osmLayer){try{map.removeLayer(osmLayer);}catch{}}
      if(origTile) {try{origTile.addTo(map);}catch{}}
    }
  },[panelsDrawn,buildingCoords,selPanel,detectedFaces,selFaceIdx,panelCount,panelRotOffset,panelOrient]);

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
    };
    try{await generatePDF(latestResults,customer,displayName,slope,orientation,snap,editableAiText);}
    catch(e){alert(`PDF fout: ${e.message}`);}
    setPdfLoading(false);
  };

  const filteredInv=invFilter==="alle"?inverters:inverters.filter(i=>i.fase===invFilter);
  const filteredBatt=battFilter==="alle"?batteries:battFilter==="alpha"?batteries.filter(b=>b.isAlpha):batteries.filter(b=>!b.isAlpha);
  const zq=ZONE_Q[orientation]||ZONE_Q.Z;
  const dhmHits=new Set(detectedFaces?.map(f=>f.orientation)||[]);
  const stringDesign=(selPanel?.voc&&selInv?.maxDcVoltage)?computeStringDesign(selPanel,selInv,panelCount):null;
  const isLoading=grbStatus==="loading"||dhmStatus==="loading";

  const TABS=[
    {k:"klant",l:"01 Klant"},{k:"configuratie",l:"02 Configuratie"},
    {k:"panelen",l:"03 Panelen"},{k:"omvormers",l:"04 AlphaESS"},
    {k:"batterij",l:"05 Batterij"},{k:"technisch",l:"06 Technisch"},
    {k:"resultaten",l:"07 Resultaten"}
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
                      {b.dhmStatus==="ok"&&<span style={{color:"var(--green)",marginLeft:4}}>✅ {b.faces?.length||0} vlak(ken)</span>}
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

                {/* Daktype-picker — alleen voor geselecteerde gebouwen */}
                {isSelected&&isActive&&<div style={{marginTop:7}}>
                  <div style={{fontSize:8,color:"var(--muted)",marginBottom:3}}>Daktype</div>
                  <DakTypePicker value={b.daktype||"auto"} onChange={dt=>updateBuildingDaktype(b.id,dt)}/>
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
                          <span className="fb-main">{f.isFlatRoof?"🏢 ":""}{f.orientation} · {f.slope}°{f.status==="manual"&&<span style={{fontSize:7,color:"var(--amber)",marginLeft:4}}>✏️</span>}</span>
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
                    <span className="fb-main">{f.isFlatRoof?"🏢 ":""}{f.orientation} · {f.slope}°{f.status==="manual"&&<span style={{fontSize:7,color:"var(--amber)",marginLeft:4}}>✏️</span>}</span>
                    <span className="fb-sub">{f.pct}% · {f.avgH}m hoogte</span>
                    <span style={{fontSize:8,color:"var(--blue)",display:"block",marginTop:2}}>3D: {face3d.toFixed(0)}m² <span style={{color:"var(--muted)"}}>(2D: {face2d.toFixed(0)}m²)</span></span>
                    <span style={{fontSize:8,color:selFaceIdx===i?"var(--alpha)":qC.c,display:"block"}}>{qC.l}</span>
                    {conf>0&&<span style={{fontSize:7,color:confColor,display:"block"}}>{conf>=0.7?"✅":conf>=0.4?"⚠️":"❌"} conf: {Math.round(conf*100)}%</span>}
                  </button>
                );
              })}
            </div>
            <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
              {!editMode
                ?<button className="btn sec sm" style={{flex:1}} onClick={()=>{
                    if(!detectedFaces[selFaceIdx]?.polygon){
                      const withPolys=generateFacePolygons(buildingCoords,detectedFaces,detectedFaces[0]?.ridgeAngleDeg);
                      setDetectedFaces(withPolys);setTimeout(()=>setEditMode(true),50);
                    } else {setEditMode(true);}
                  }}>✏️ Dakvlak aanpassen</button>
                :<>
                  <button className="btn green sm" style={{flex:1}} onClick={()=>{setDetectedFaces(prev=>prev?.map((f,i)=>i===selFaceIdx?{...f,status:"manual"}:f));setEditMode(false);}}>✅ Bevestig</button>
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
            {editMode&&<div className="info-box" style={{marginTop:5,background:"#fffbeb",borderColor:"#fde68a",fontSize:9}}><strong>✏️ Editeer modus</strong> — Versleep oranje bolletjes op de kaart.</div>}
          </div>}
          {dhmStatus==="error"&&!detectedFaces&&<div className="info-box err"><strong>⚠️ LiDAR niet beschikbaar</strong><br/><span style={{fontSize:8,color:"var(--muted)"}}>{dhmError}</span><br/>Stel helling &amp; richting handmatig in hieronder.</div>}
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
          if(panelDataRef) panelDataRef.current=null;
          setPanelMoveMode(false);
          if(leafRef.current&&window.L){
            const L=window.L,map=leafRef.current;
            if(panelLayerRef.current){map.removeLayer(panelLayerRef.current);panelLayerRef.current=null;}
            let _sf=detectedFaces?.[selFaceIdx];
            if(_sf&&!_sf.polygon&&buildingCoords){const wp=generateFacePolygons(buildingCoords,detectedFaces,_sf.ridgeAngleDeg);setDetectedFaces(wp);_sf=wp?.[selFaceIdx]||_sf;}
            const _ridge=ridgeAngleDegRef.current||_sf?.ridgeAngleDeg||0;
            const _fp=_sf?.polygon||(buildingCoords?makeFacePoly(buildingCoords,orientation,_ridge):buildingCoords)||buildingCoords;
            console.info("[ZonneDak] Toon panelen: auto_ridge="+_ridge+"° offset="+panelRotOffset+"° orient="+orientation+" fp_pts="+_fp.length);
            panelLayerRef.current=drawPanelLayer(map,L,_fp,panelCount,selPanel,panelRotOffset,panelOrient,panelDataRef,false);
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
      </aside>

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
          <div className="filter-row">{["alle","1-fase","3-fase"].map(f=><button key={f} className={`filter-btn af ${invFilter===f?"active":""}`} onClick={()=>setInvFilter(f)}>{f}</button>)}</div>
          {selInv&&<div style={{display:"flex",justifyContent:"flex-end"}}><button className="btn sec sm" onClick={()=>setSelInvId(null)}>✕ Verwijder keuze</button></div>}
          <div className="list">{filteredInv.map(inv=><InverterCard key={inv.id} inv={inv} selected={inv.id===selInvId} onSelect={setSelInvId}/>)}</div>
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
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:14,marginBottom:10,overflowX:"auto"}}>
              <div className="sl" style={{marginBottom:8}}>Detailwaarden per MPPT-ingang</div>
              <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:500}}>
                <thead>
                  <tr style={{borderBottom:"2px solid var(--border)"}}>
                    <th style={{textAlign:"left",padding:"6px 4px",color:"var(--muted)",fontWeight:500}}></th>
                    {stringDesign.mppts.map((m,i)=>(<th key={i} style={{textAlign:"right",padding:"6px 4px",fontWeight:600}}>Ingang {String.fromCharCode(65+i)}</th>))}
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
                <div className="rc"><div className="rc-label">Irradiantie</div><div className="rc-num">{results.irr}</div><div className="rc-unit">kWh/m²/j · {results.orientation} {results.slope}°</div></div>
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
              </div>
              <div style={{fontSize:8,color:"var(--muted)",lineHeight:1.7}}>
                <strong>📸 Luchtfoto wordt automatisch gemaakt</strong> bij het genereren (OSM-kaart + panelen).<br/>
                <strong>Rapport bevat:</strong> klantgegevens · systeemoverzicht · maandgrafiek · terugverdienberekening<br/>
                <strong style={{color:"var(--green)"}}>+ Datasheets bijgevoegd:</strong>{" "}
                {results?.panel?.datasheet?<span style={{color:"var(--green)"}}>✅ {results.panel.brand} {results.panel.watt}W</span>:<span style={{color:"var(--muted2)"}}>— geen datasheet</span>}
                {" · "}
                {results?.inv?.datasheet?<span style={{color:"var(--green)"}}>✅ AlphaESS SMILE-G3</span>:<span style={{color:"var(--muted2)"}}>— geen datasheet</span>}
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

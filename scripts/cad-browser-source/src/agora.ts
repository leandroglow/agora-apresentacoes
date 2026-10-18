import {AcApDocManager,AcEdOpenMode} from '@mlightcad/cad-simple-viewer';
import {registerLibreDwgConverter} from './registerLibreDwg';
const host=document.getElementById('canvas')!;
const status=document.getElementById('status')!;
const urls={mtextRender:new URL('./assets/mtext-renderer-worker.js',location.href).href,dwgParser:new URL('./assets/libredwg-parser-worker.js',location.href).href};
registerLibreDwgConverter(urls.dwgParser);
AcApDocManager.createInstance({container:host,autoResize:true,webworkerFileUrls:urls,disableExport:true,baseUrl:new URL('./resources/',location.href).href,builtinOpenFileDialog:false,notificationCenter:false});
const manager=AcApDocManager.instance;
(window as any).cadManager=manager;
async function open(name:string,bytes:ArrayBuffer){status.textContent='Abrindo desenho no navegador…';try{const ok=await manager.openDocument(name,bytes,{mode:AcEdOpenMode.Read,openViewMode:'extents'} as any);if(!ok)throw Error('Desenho não suportado');await manager.curView.waitUntilIdle();manager.curView.zoomToFitDrawing();status.textContent='Desenho aberto';document.getElementById('name')!.textContent=name;fitZoom=manager.curView.internalCamera.zoom;updateZoom();(window as any).cadOpened=true;}catch(e){status.textContent='Falha ao abrir: '+(e as Error).message;throw e;}}
(window as any).agoraOpenCad=open;
document.getElementById('file')!.onchange=async(e)=>{const f=(e.target as HTMLInputElement).files?.[0];if(f)await open(f.name,await f.arrayBuffer());};

let fitZoom=1;
const zoomLabel=document.getElementById('zoom')!;
function updateZoom(){zoomLabel.textContent=Math.round(manager.curView.internalCamera.zoom/fitZoom*100)+'%';}
function apply(x:number,y:number,z:number){manager.curView.flyTo({x,y},z);updateZoom();}
function zoom(value:number,px=host.clientWidth/2,py=host.clientHeight/2){if(!(window as any).cadOpened)return;const c=manager.curView.internalCamera;const old=c.zoom;const z=Math.min(12*fitZoom,Math.max(.25*fitZoom,value));const dx=(px/host.clientWidth-.5)*(c.right-c.left),dy=(.5-py/host.clientHeight)*(c.top-c.bottom);apply(c.position.x+dx/old-dx/z,c.position.y+dy/old-dy/z,z);}
document.getElementById('plus')!.onclick=()=>zoom(manager.curView.internalCamera.zoom*1.4);
document.getElementById('minus')!.onclick=()=>zoom(manager.curView.internalCamera.zoom/1.4);
document.getElementById('fit')!.onclick=()=>{manager.curView.zoomToFitDrawing();fitZoom=manager.curView.internalCamera.zoom;updateZoom();};
const surface=document.createElement('div');surface.id='gesture';surface.style.cssText='position:absolute;inset:0;z-index:50;touch-action:none;cursor:grab';host.append(surface);
const pointers=new Map<number,{x:number,y:number}>();let gesture:any;
function snapshot(){if(!(window as any).cadOpened)return;const a=[...pointers.values()],c=manager.curView.internalCamera;const x=a.reduce((s,p)=>s+p.x,0)/a.length,y=a.reduce((s,p)=>s+p.y,0)/a.length;gesture={x,y,cx:c.position.x,cy:c.position.y,z:c.zoom,d:a.length===2?Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y):0};}
function point(e:PointerEvent){const r=host.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
surface.onpointerdown=e=>{e.preventDefault();pointers.set(e.pointerId,point(e));surface.setPointerCapture(e.pointerId);snapshot();};
surface.onpointermove=e=>{if(!pointers.has(e.pointerId)||!gesture)return;e.preventDefault();pointers.set(e.pointerId,point(e));const a=[...pointers.values()],c=manager.curView.internalCamera,g=gesture;const x=a.reduce((s,p)=>s+p.x,0)/a.length,y=a.reduce((s,p)=>s+p.y,0)/a.length,d=a.length===2?Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y):0;const z=Math.min(12*fitZoom,Math.max(.25*fitZoom,g.z*(g.d&&d?d/g.d:1)));const width=c.right-c.left,height=c.top-c.bottom;const wx=g.cx+(g.x/host.clientWidth-.5)*width/g.z,wy=g.cy+(.5-g.y/host.clientHeight)*height/g.z;apply(wx-(x/host.clientWidth-.5)*width/z,wy-(.5-y/host.clientHeight)*height/z,z);};
function end(e:PointerEvent){pointers.delete(e.pointerId);if(pointers.size)snapshot();else gesture=null;}surface.onpointerup=end;surface.onpointercancel=end;
surface.onwheel=e=>{e.preventDefault();const r=host.getBoundingClientRect();zoom(manager.curView.internalCamera.zoom*Math.exp(-e.deltaY*.002),e.clientX-r.left,e.clientY-r.top);};
window.addEventListener('message',async e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='agora-cad-open')return;try{await open(e.data.name,e.data.bytes);parent.postMessage({type:'agora-cad-opened'},location.origin);}catch(err){parent.postMessage({type:'agora-cad-error',message:(err as Error).message},location.origin);}});
parent.postMessage({type:'agora-cad-ready'},location.origin);

if(parent!==window){document.body.classList.add('embedded');}

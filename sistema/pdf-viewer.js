/* PDF tiles are rendered at the current scale, only in the visible viewport. */
window.AgoraPdfViewer=class {
 constructor(viewport,stage,onZoom){
  this.v=viewport;this.s=stage;this.onZoom=onZoom;this.z=1;this.pages=[];this.tiles=new Map();this.epoch=0;
  stage.style.cssText='position:relative;display:block;padding:0;min-height:100%';
  viewport.style.touchAction='none';
  viewport.addEventListener('scroll',()=>this.schedule(),{passive:true});
  viewport.addEventListener('wheel',e=>{if(!this.doc)return;e.preventDefault();const r=viewport.getBoundingClientRect();this.setZoom(this.z*Math.exp(-e.deltaY*.002),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  let drag=null;
  viewport.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;drag={x:e.clientX,y:e.clientY,l:viewport.scrollLeft,t:viewport.scrollTop};viewport.setPointerCapture(e.pointerId);});
  viewport.addEventListener('pointermove',e=>{if(drag){viewport.scrollLeft=drag.l+drag.x-e.clientX;viewport.scrollTop=drag.t+drag.y-e.clientY;}});
  for(const type of ['pointerup','pointercancel'])viewport.addEventListener(type,()=>drag=null);
  let gesture=null;
  const point=e=>{const r=viewport.getBoundingClientRect(),a=[...e.touches].slice(0,2);return {x:a.reduce((s,t)=>s+t.clientX-r.left,0)/a.length,y:a.reduce((s,t)=>s+t.clientY-r.top,0)/a.length,n:a.length,d:a.length===2?Math.hypot(a[0].clientX-a[1].clientX,a[0].clientY-a[1].clientY):0};};
  const start=e=>{if(!e.touches.length){gesture=null;return;}const p=point(e);gesture={...p,z:this.z,l:viewport.scrollLeft,t:viewport.scrollTop};};
  viewport.addEventListener('touchstart',e=>{e.preventDefault();start(e);},{passive:false});
  viewport.addEventListener('touchmove',e=>{e.preventDefault();if(!gesture)return;const p=point(e),g=gesture;if(p.n!==g.n){start(e);return;}if(p.n===2&&g.d){this.setZoom(g.z*p.d/g.d,g.x,g.y);const ratio=this.z/g.z;viewport.scrollLeft=(g.l+g.x)*ratio-p.x;viewport.scrollTop=(g.t+g.y)*ratio-p.y;}else{viewport.scrollLeft=g.l+g.x-p.x;viewport.scrollTop=g.t+g.y-p.y;}},{passive:false});
  viewport.addEventListener('touchend',start);viewport.addEventListener('touchcancel',()=>gesture=null);
 }
 clear(){this.epoch++;this.doc=null;this.pages=[];for(const t of this.tiles.values()){t.task?.cancel();t.canvas.remove();}this.tiles.clear();this.s.replaceChildren();}
 async open(doc){this.clear();this.doc=doc;this.z=1;const epoch=this.epoch;this.base=Math.max(240,this.v.clientWidth-32);for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n);if(epoch!==this.epoch)return;const natural=page.getViewport({scale:1}),scale=this.base/natural.width;const el=document.createElement('div');el.style.cssText='position:absolute;background:white;overflow:hidden;box-shadow:0 2px 12px #0005';this.s.appendChild(el);this.pages.push({page,scale,w:this.base,h:natural.height*scale,el});}this.layout();this.v.scrollTo(0,0);this.onZoom(1);this.schedule();}
 layout(){let y=16*this.z;for(const p of this.pages){p.y=y;p.x=16*this.z;p.el.style.left=p.x+'px';p.el.style.top=y+'px';p.el.style.width=p.w*this.z+'px';p.el.style.height=p.h*this.z+'px';y+=(p.h+12)*this.z;}this.s.style.width=(this.base+32)*this.z+'px';this.s.style.height=y+'px';}
 setZoom(z,x=this.v.clientWidth/2,y=this.v.clientHeight/2){if(!this.doc)return;z=Math.max(.25,Math.min(8,z));const ratio=z/this.z,l=(this.v.scrollLeft+x)*ratio-x,t=(this.v.scrollTop+y)*ratio-y;this.z=z;this.epoch++;for(const tile of this.tiles.values()){tile.task?.cancel();tile.canvas.remove();}this.tiles.clear();this.layout();this.v.scrollLeft=l;this.v.scrollTop=t;this.onZoom(z);this.schedule();}
 schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.paint(),80);}
 async paint(){
  if(!this.doc)return;const epoch=this.epoch,z=this.z,dpr=Math.min(window.devicePixelRatio||1,2),size=512,needed=new Map();
  const l=this.v.scrollLeft,t=this.v.scrollTop,r=l+this.v.clientWidth,b=t+this.v.clientHeight;
  for(let i=0;i<this.pages.length;i++){const p=this.pages[i],w=p.w*z,h=p.h*z;if(p.y>b||p.y+h<t)continue;
   for(let row=Math.max(0,Math.floor((t-p.y)/size));row<Math.ceil(Math.min(h,b-p.y)/size);row++)for(let col=Math.max(0,Math.floor((l-p.x)/size));col<Math.ceil(Math.min(w,r-p.x)/size);col++){const key=i+':'+row+':'+col;needed.set(key,{p,x:col*size,y:row*size,w:Math.min(size,w-col*size),h:Math.min(size,h-row*size)});}
  }
  for(const [key,tile] of this.tiles)if(!needed.has(key)){tile.task?.cancel();tile.canvas.remove();this.tiles.delete(key);}
  for(const [key,a] of needed){if(epoch!==this.epoch)return;if(this.tiles.has(key))continue;const canvas=document.createElement('canvas');canvas.width=Math.ceil(a.w*dpr);canvas.height=Math.ceil(a.h*dpr);canvas.style.cssText=`position:absolute;left:${a.x}px;top:${a.y}px;width:${a.w}px;height:${a.h}px`;a.p.el.appendChild(canvas);
   const tile={canvas};this.tiles.set(key,tile);try{tile.task=a.p.page.render({canvasContext:canvas.getContext('2d'),viewport:a.p.page.getViewport({scale:a.p.scale*z*dpr}),transform:[1,0,0,1,-a.x*dpr,-a.y*dpr]});await tile.task.promise;}catch(e){if(e.name!=='RenderingCancelledException'){canvas.remove();this.tiles.delete(key);}}}
 }
};

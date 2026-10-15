/* Keep existing pixels during gestures; refine visible PDF tiles after release. */
window.AgoraPdfViewer = class {
  constructor(viewport, stage, onZoom) {
    this.v = viewport; this.s = stage; this.onZoom = onZoom;
    this.z = 1; this.pages = []; this.tiles = new Map(); this.epoch = 0;
    this.paintId = 0; this.gesture = null;
    stage.style.cssText = 'position:relative;display:block;padding:0;min-height:100%';
    viewport.style.touchAction = 'none';
    viewport.style.overflowAnchor = 'none';
    viewport.style.scrollBehavior = 'auto';
    viewport.addEventListener('scroll', () => this.schedule(), {passive:true});
    viewport.addEventListener('wheel', e => {
      if (!this.doc) return;
      e.preventDefault();
      this.setZoom(this.z * Math.exp(-e.deltaY * .002));
    }, {passive:false});
    let drag = null;
    viewport.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = {x:e.clientX, y:e.clientY, l:viewport.scrollLeft, t:viewport.scrollTop};
      viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener('pointermove', e => {
      if (drag) { viewport.scrollLeft=drag.l+drag.x-e.clientX; viewport.scrollTop=drag.t+drag.y-e.clientY; }
    });
    for (const type of ['pointerup','pointercancel']) viewport.addEventListener(type, () => drag=null);
    const point = e => {
      const r=viewport.getBoundingClientRect(), a=Array.from(e.touches).slice(0,2);
      return {x:a.reduce((s,t)=>s+t.clientX-r.left-viewport.clientLeft,0)/a.length,
        y:a.reduce((s,t)=>s+t.clientY-r.top-viewport.clientTop,0)/a.length, n:a.length,
        d:a.length===2?Math.hypot(a[0].clientX-a[1].clientX,a[0].clientY-a[1].clientY):0};
    };
    const start = e => {
      clearTimeout(this.timer);
      this.gesture=e.touches.length&&this.doc ? {...point(e),z:this.z,l:viewport.scrollLeft,t:viewport.scrollTop,ox:this.offsetX||0,oy:this.offsetY||0} : null;
      if (!this.gesture) this.schedule();
    };
    viewport.addEventListener('touchstart', e => { e.preventDefault(); start(e); }, {passive:false});
    viewport.addEventListener('touchmove', e => {
      e.preventDefault(); if (!this.gesture) return;
      const p=point(e), g=this.gesture;
      if (p.n!==g.n) { start(e); return; }
      if (p.n===2&&g.d) {
        // Absolute distance ratio: no steps or repeated + / - actions.
        this.setZoom(g.z*p.d/g.d,g.x,g.y);
        const ratio=this.z/g.z;
        viewport.scrollLeft=(g.l+g.x-g.ox)*ratio+this.offsetX-p.x;
        viewport.scrollTop=(g.t+g.y-g.oy)*ratio+this.offsetY-p.y;
      } else { viewport.scrollLeft=g.l+g.x-p.x; viewport.scrollTop=g.t+g.y-p.y; }
    }, {passive:false});
    viewport.addEventListener('touchend', start, {passive:true});
    viewport.addEventListener('touchcancel', () => { this.gesture=null; this.schedule(); }, {passive:true});
    // Safari must not turn a drawing pinch into page zoom.
    for (const type of ['gesturestart','gesturechange','gestureend'])
      viewport.addEventListener(type, e=>e.preventDefault(), {passive:false});
  }
  cancelTiles() {
    this.paintId++;
    for (const [key,tile] of this.tiles) {
      if (!tile.ready) { tile.task?.cancel(); tile.canvas.remove(); this.tiles.delete(key); }
    }
  }
  clear() {
    clearTimeout(this.timer); this.epoch++; this.cancelTiles();
    for (const p of this.pages) p.previewTask?.cancel();
    this.doc=null; this.gesture=null; this.pages=[]; this.tiles.clear(); this.s.replaceChildren();
  }
  async open(doc) {
    this.clear(); this.doc=doc; this.z=1;
    const epoch=this.epoch; this.base=Math.max(240,this.v.clientWidth-32);
    for (let n=1;n<=doc.numPages;n++) {
      const page=await doc.getPage(n); if(epoch!==this.epoch)return;
      const natural=page.getViewport({scale:1}), scale=this.base/natural.width;
      const el=document.createElement('div');
      el.style.cssText='position:absolute;background:white;overflow:hidden;box-shadow:0 2px 12px #0005';
      this.s.appendChild(el); this.pages.push({page,scale,w:this.base,h:natural.height*scale,el});
    }
    this.layout(); this.v.scrollTo(0,0); this.onZoom(1); this.schedule();
  }
  layout() {
    const width=(this.base+32)*this.z;
    const height=(32+this.pages.reduce((n,p)=>n+p.h+12,0))*this.z;
    this.offsetX=Math.max(0,(this.v.clientWidth-width)/2);
    this.offsetY=Math.max(0,(this.v.clientHeight-height)/2);
    let y=16*this.z+this.offsetY;
    for (const p of this.pages) {
      p.y=y; p.x=16*this.z+this.offsetX;
      Object.assign(p.el.style,{left:p.x+'px',top:y+'px',width:p.w*this.z+'px',height:p.h*this.z+'px'});
      y+=(p.h+12)*this.z;
    }
    this.s.style.width=Math.max(this.v.clientWidth,width)+'px'; this.s.style.height=Math.max(this.v.clientHeight,height)+'px';
    for (const tile of this.tiles.values()) {
      const ratio=this.z/tile.z;
      tile.canvas.style.left=tile.x*ratio+'px'; tile.canvas.style.top=tile.y*ratio+'px';
      tile.canvas.style.transform='scale('+ratio+')';
    }
  }
  setZoom(z,x=this.v.clientWidth/2,y=this.v.clientHeight/2) {
    if (!this.doc) return;
    z=Math.max(.25,Math.min(12,z)); if (z===this.z) return;
    const anchorX=(this.v.scrollLeft+x-(this.offsetX||0))/this.z;
    const anchorY=(this.v.scrollTop+y-(this.offsetY||0))/this.z;
    this.cancelTiles(); this.z=z; this.layout();
    this.v.scrollLeft=anchorX*z+this.offsetX-x; this.v.scrollTop=anchorY*z+this.offsetY-y; this.onZoom(z); this.schedule();
  }
  schedule() {
    clearTimeout(this.timer);
    if (this.doc&&!this.gesture) this.timer=setTimeout(()=>this.paint(),100);
  }
  async preview(p,epoch) {
    if (p.preview) return;
    const canvas=document.createElement('canvas'), factor=Math.min(1,1024/Math.max(p.w,p.h));
    canvas.width=Math.ceil(p.w*factor); canvas.height=Math.ceil(p.h*factor);
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    p.preview=canvas; p.el.prepend(canvas);
    try {
      p.previewTask=p.page.render({canvasContext:canvas.getContext('2d'),viewport:p.page.getViewport({scale:p.scale*factor})});
      await p.previewTask.promise;
    } catch (_) { canvas.remove(); if(p.preview===canvas)p.preview=null; }
    finally { p.previewTask=null; }
    if (epoch!==this.epoch) canvas.remove();
  }
  async paint() {
    if (!this.doc||this.gesture) return;
    this.cancelTiles();
    const id=this.paintId, epoch=this.epoch, z=this.z, dpr=Math.min(window.devicePixelRatio||1,2), size=512, needed=new Map();
    const l=this.v.scrollLeft,t=this.v.scrollTop,r=l+this.v.clientWidth,b=t+this.v.clientHeight;
    for (let i=0;i<this.pages.length;i++) {
      const p=this.pages[i], w=p.w*z, h=p.h*z;
      if(p.y>b||p.y+h<t) { p.previewTask?.cancel(); p.preview?.remove(); p.preview=null; continue; }
      await this.preview(p,epoch);
      if(id!==this.paintId||this.gesture)return;
      for(let row=Math.max(0,Math.floor((t-p.y)/size));row<Math.ceil(Math.min(h,b-p.y)/size);row++)
        for(let col=Math.max(0,Math.floor((l-p.x)/size));col<Math.ceil(Math.min(w,r-p.x)/size);col++)
          needed.set(z+':'+i+':'+row+':'+col,{p,x:col*size,y:row*size,w:Math.min(size,w-col*size),h:Math.min(size,h-row*size)});
    }
    for(const [key,a] of needed) {
      if(id!==this.paintId||this.gesture)return;
      if(this.tiles.has(key))continue;
      const canvas=document.createElement('canvas'); canvas.width=Math.ceil(a.w*dpr); canvas.height=Math.ceil(a.h*dpr);
      canvas.style.cssText=`position:absolute;z-index:1;transform-origin:0 0;left:${a.x}px;top:${a.y}px;width:${a.w}px;height:${a.h}px`;
      a.p.el.appendChild(canvas);
      const tile={canvas,z,x:a.x,y:a.y,ready:false}; this.tiles.set(key,tile);
      try {
        tile.task=a.p.page.render({canvasContext:canvas.getContext('2d'),viewport:a.p.page.getViewport({scale:a.p.scale*z*dpr}),transform:[1,0,0,1,-a.x*dpr,-a.y*dpr]});
        await tile.task.promise; tile.ready=true;
      } catch (_) { canvas.remove(); if(this.tiles.get(key)===tile)this.tiles.delete(key); }
    }
    if(id!==this.paintId)return;
    // Retire old pixels only after their replacements are ready.
    for(const [key,tile] of this.tiles) if(!needed.has(key)) {tile.canvas.remove();this.tiles.delete(key);}
  }
};

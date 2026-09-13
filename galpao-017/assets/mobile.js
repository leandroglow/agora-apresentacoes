
'use strict';
(()=>{
 const viewer=$('viewer');let expanded=false,native=false;
 function leaveExpanded(){expanded=false;viewer.classList.remove('is-expanded','legend-open');document.body.classList.remove('viewer-expanded');$('fullscreen').textContent='Tela cheia';$('fullscreen').setAttribute('aria-pressed','false');requestAnimationFrame(()=>MODEL.resize());}
 $('fullscreen').onclick=async()=>{
  if(expanded){if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});leaveExpanded();return;}
  expanded=true;native=false;viewer.classList.add('is-expanded');document.body.classList.add('viewer-expanded');$('fullscreen').textContent='Sair';$('fullscreen').setAttribute('aria-pressed','true');
  if(viewer.requestFullscreen)try{await viewer.requestFullscreen();native=true;}catch(e){}
  requestAnimationFrame(()=>MODEL.resize());
 };
 document.addEventListener('fullscreenchange',()=>{if(native&&!document.fullscreenElement)leaveExpanded();else requestAnimationFrame(()=>MODEL.resize());});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded&&!$('lightbox').open){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});leaveExpanded();}});
 $('zoomIn3d').onclick=()=>MODEL.zoom(1/1.25);$('zoomOut3d').onclick=()=>MODEL.zoom(1.25);
 $('legendToggle').onclick=()=>{if(expanded){viewer.classList.toggle('legend-open');$('legendToggle').setAttribute('aria-pressed',viewer.classList.contains('legend-open'));}else viewer.querySelector('.inspector').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});};
 const priorSelect=selectPoint;selectPoint=function(...args){const r=priorSelect(...args);if(expanded&&matchMedia('(max-width:760px)').matches)viewer.classList.add('legend-open');return r;};
 window.addEventListener('orientationchange',()=>setTimeout(()=>MODEL.resize(),120));
 const port=$('imageViewport'),img=$('modalImage'),dialog=$('lightbox'),pointers=new Map();
 let scale=1,x=0,y=0,previous=null,multi=false,lastTap=0,opener=null,index=0,frame=0;
 function draw(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;img.style.transform='translate('+x+'px,'+y+'px) scale('+scale+')';$('imageZoomValue').textContent=Math.round(scale*100)+'%';});}
 function clamp(){const bx=port.clientWidth*(scale-1)/2,by=port.clientHeight*(scale-1)/2;x=Math.min(bx,Math.max(-bx,x));y=Math.min(by,Math.max(-by,y));}
 function reset(){scale=1;x=0;y=0;pointers.clear();previous=null;multi=false;draw();}
 window.resetImageZoom=reset;
 function zoom(next,cx=port.clientWidth/2,cy=port.clientHeight/2){
  next=Math.min(8,Math.max(1,next));const ox=cx-port.clientWidth/2,oy=cy-port.clientHeight/2;
  x=ox-(ox-x)*next/scale;y=oy-(oy-y)*next/scale;scale=next;clamp();draw();
 }
 function gesture(){const ps=[...pointers.values()].slice(0,2);return ps.length===2?{x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2,d:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y)}:null;}
 port.addEventListener('pointerdown',e=>{port.setPointerCapture(e.pointerId);const r=port.getBoundingClientRect();pointers.set(e.pointerId,{x:e.clientX-r.left,y:e.clientY-r.top,sx:e.clientX,sy:e.clientY,moved:false});if(pointers.size>1){previous=gesture();multi=true;}});
 port.addEventListener('pointermove',e=>{
  const p=pointers.get(e.pointerId);if(!p)return;const r=port.getBoundingClientRect(),nx=e.clientX-r.left,ny=e.clientY-r.top,dx=nx-p.x,dy=ny-p.y;
  p.x=nx;p.y=ny;p.moved=p.moved||Math.hypot(e.clientX-p.sx,e.clientY-p.sy)>5;
  if(pointers.size>1){const g=gesture();if(g&&previous&&g.d>5&&previous.d>5){const next=Math.min(8,Math.max(1,scale*g.d/previous.d)),cx=port.clientWidth/2,cy=port.clientHeight/2;
   x=g.x-cx-(previous.x-cx-x)*next/scale;y=g.y-cy-(previous.y-cy-y)*next/scale;scale=next;
  }previous=g;}else if(scale>1){x+=dx;y+=dy;}
  clamp();draw();
 });
 function end(e){const p=pointers.get(e.pointerId);if(!p)return;if(e.type==='pointerup'&&!multi&&!p.moved){const now=performance.now();if(now-lastTap<300)zoom(scale>1?1:2.5,p.x,p.y);lastTap=now;}pointers.delete(e.pointerId);previous=gesture();if(!pointers.size)multi=false;}
 port.addEventListener('pointerup',end);port.addEventListener('pointercancel',end);
 port.addEventListener('wheel',e=>{e.preventDefault();const r=port.getBoundingClientRect();zoom(scale*Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
 port.addEventListener('dragstart',e=>e.preventDefault());
 $('imageZoomIn').onclick=()=>zoom(scale*1.4);$('imageZoomOut').onclick=()=>zoom(scale/1.4);$('imageFit').onclick=reset;
 const oldOpen=openGallery;openGallery=function(i){if(!dialog.open)opener=document.activeElement;index=(i+DATA.gallery.length)%DATA.gallery.length;oldOpen(index);$('imagePrev').hidden=false;$('imageNext').hidden=false;$('imageCounter').textContent=(index+1)+' / '+DATA.gallery.length;reset();};
 $('imagePrev').onclick=()=>openGallery(index-1);$('imageNext').onclick=()=>openGallery(index+1);
 dialog.addEventListener('close',()=>{reset();if(opener&&document.contains(opener))opener.focus({preventScroll:true});});
 dialog.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){zoom(scale*1.4);e.preventDefault();}else if(e.key==='-'){zoom(scale/1.4);e.preventDefault();}else if(e.key==='0'){reset();e.preventDefault();}});
 $('planFullscreen').onclick=()=>{
  opener=document.activeElement;index=-1;const svg=$('plan').querySelector('svg'),copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent='.plan-point text{font-family:Segoe UI,Arial,sans-serif;font-size:12px;fill:#345463}.plan-point.selected text{fill:#ad4c08;font-weight:700}';copy.prepend(style);
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(copy));img.alt='Planta vetorial ampliada do '+floorName(planFloor);
  $('modalTitle').textContent=(planFloor==='T'?'Térreo / loja':'Escritório')+' · '+(planSystem==='E'?'Elétrica':'Rede e câmeras');
  $('modalLegend').innerHTML='<p class="eyebrow">LOCAÇÃO DOS PONTOS</p><p>Use a pinça para aproximar e um dedo para deslocar a planta ampliada. As chamadas identificam os pontos abaixo.</p>'+pointsForPlan().map(p=>'<button data-modalpoint="'+esc(p.id)+'">'+esc(p.id)+'</button>').join('')+'<p class="micro">Toque em um código para localizar o ponto e ler suas propriedades no 3D. As coordenadas são propostas de coordenação da R02.</p>';
  $('imagePrev').hidden=true;$('imageNext').hidden=true;$('imageCounter').textContent='Planta';dialog.showModal();reset();
 };
 new ResizeObserver(()=>{clamp();draw();}).observe(port);
 // Public, read-only diagnostics used to verify the real touch gestures.
 window.MOBILE={get imageState(){return{scale,x,y}},get expanded(){return expanded}};
})();


// Keep buttons responsive immediately after a multi-touch gesture.
// Synthetic activation is paired with suppression of a delayed native click.
(()=>{
 const taps=new Map(),activated=new WeakMap();
 document.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;const b=e.target.closest('button');if(b&&!b.disabled)taps.set(e.pointerId,{b,x:e.clientX,y:e.clientY,moved:false});},true);
 document.addEventListener('pointermove',e=>{const t=taps.get(e.pointerId);if(t&&Math.hypot(e.clientX-t.x,e.clientY-t.y)>10)t.moved=true;},true);
 document.addEventListener('pointercancel',e=>taps.delete(e.pointerId),true);
 document.addEventListener('pointerup',e=>{const t=taps.get(e.pointerId);taps.delete(e.pointerId);if(!t||t.moved||!document.contains(t.b)||e.target.closest('button')!==t.b)return;e.preventDefault();activated.set(t.b,performance.now());t.b.focus({preventScroll:true});t.b.click();},true);
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&e.isTrusted&&e.detail>0&&performance.now()-(activated.get(b)||-10000)<650){e.preventDefault();e.stopImmediatePropagation();}},true);
})();


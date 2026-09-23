(() => {
'use strict';
const $=id=>document.getElementById(id), C=window.AGORA_CONTENT;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
// Approved commercial content is separate from the presentation and its historic source notes.
if(C.budget.value !== null && Number.isFinite(C.budget.value)) $('budget-value').textContent=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(C.budget.value);
$('budget-label').textContent=C.budget.label;$('budget-status').textContent=C.budget.status;$('budget-note').textContent=C.budget.note;
let slide=0, slideToken=0, playing=false, slideTimer, heroVisible=true;
const photo=$('hero-photo');
for(const [index,item] of C.images.entries()){
 const button=document.createElement('button');button.setAttribute('aria-label',`Mostrar ${item.title}`);button.setAttribute('aria-pressed',String(index===0));button.addEventListener('click',()=>showSlide(index));$('hero-dots').append(button);
}
function planSlide(){clearTimeout(slideTimer);if(playing&&heroVisible&&!document.hidden)slideTimer=setTimeout(()=>showSlide(slide+1),7000)}
async function showSlide(index){
 const next=(index+C.images.length)%C.images.length, token=++slideToken;
 const image=new Image();image.src=C.images[next].src;
 try{await image.decode()}catch(_){$('live-status').textContent='Não foi possível carregar esta imagem.';return}
 if(token!==slideToken)return;
 if(!reduced){photo.classList.add('is-changing');await new Promise(resolve=>setTimeout(resolve,220))}
 if(token!==slideToken)return;
 slide=next;photo.src=image.src;photo.classList.remove('is-changing');
 $('hero-caption').textContent=C.images[slide].caption;$('hero-number').textContent=`${String(slide+1).padStart(2,'0')} / 04`;
 [...$('hero-dots').children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===slide)));
 planSlide();
}
$('hero-prev').addEventListener('click',()=>showSlide(slide-1));$('hero-next').addEventListener('click',()=>showSlide(slide+1));
$('hero-pause').addEventListener('click',()=>{
 playing=!playing;$('hero-pause').setAttribute('aria-pressed',String(playing));$('hero-pause').setAttribute('aria-label',playing?'Pausar apresentação automática':'Iniciar apresentação automática');$('hero-pause').innerHTML=icon(playing?'pause':'play');planSlide();
});
new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;planSlide()},{threshold:.05}).observe($('inicio'));
document.addEventListener('visibilitychange',planSlide);
// A single accessible image viewer handles floor-plan exploration and the detail gallery.
const dialog=$('image-dialog'), stage=$('image-stage'), im=$('viewer-image');
let kind='plan', rotation=0, zoom=1, fit=1, tx=0, ty=0, ready=false, openToken=0, opener=null;
const pointers=new Map();
function fitScale(){
 const rotated=Math.abs(rotation%180)===90;
 const width=rotated?im.naturalHeight:im.naturalWidth,height=rotated?im.naturalWidth:im.naturalHeight;
 return Math.min((stage.clientWidth-32)/width,(stage.clientHeight-32)/height);
}
function constrain(){
 const rotated=Math.abs(rotation%180)===90;
 const width=(rotated?im.naturalHeight:im.naturalWidth)*fit*zoom,height=(rotated?im.naturalWidth:im.naturalHeight)*fit*zoom;
 const maxX=Math.max(0,(width-stage.clientWidth)/2+18),maxY=Math.max(0,(height-stage.clientHeight)/2+18);
 tx=Math.max(-maxX,Math.min(maxX,tx));ty=Math.max(-maxY,Math.min(maxY,ty));
}
function render(){
 if(!ready)return;constrain();
 im.style.transform=`translate(-50%,-50%) translate(${tx}px,${ty}px) rotate(${rotation}deg) scale(${fit*zoom})`;
 $('image-zoom').textContent=`${Math.round(zoom*100)}%`;
 $('image-minus').disabled=zoom<=1.001;$('image-plus').disabled=zoom>=7.999;
}
function reset(){if(!ready)return;fit=fitScale();zoom=1;tx=ty=0;render()}
function zoomAt(next,x=0,y=0){
 if(!ready)return;next=Math.max(1,Math.min(8,next));const factor=next/zoom;
 tx=x-(x-tx)*factor;ty=y-(y-ty)*factor;zoom=next;render();
}
function localPoint(x,y){const box=stage.getBoundingClientRect();return{x:x-box.left-box.width/2,y:y-box.top-box.height/2}}
async function openImage(src,title,isPlan){
 const token=++openToken;opener=document.activeElement;kind=isPlan?'plan':'photo';ready=false;pointers.clear();stage.classList.remove('dragging');
 $('viewer-title').textContent=title;im.alt=title+' — Ágora Construtora';stage.classList.toggle('photo-mode',!isPlan);
 $('viewer-loading').textContent='Abrindo imagem…';$('viewer-loading').hidden=false;im.style.visibility='hidden';
 $('image-download').href=src;$('image-download').download=isPlan?'AGORA - PLANTA HUMANIZADA.png':`AGORA - ${title}.jpg`;
 if(!dialog.open)dialog.showModal();document.body.style.overflow='hidden';
 im.src=src;
 try{await im.decode()}catch(_){if(token===openToken)$('viewer-loading').textContent='Não foi possível abrir a imagem. Feche esta janela e tente novamente.';return}
 if(token!==openToken||!dialog.open)return;
 im.style.width=im.naturalWidth+'px';im.style.height=im.naturalHeight+'px';
 rotation=isPlan&&stage.clientWidth>stage.clientHeight?90:0;ready=true;reset();
 im.style.visibility='visible';$('viewer-loading').hidden=true;stage.focus({preventScroll:true});
 $('live-status').textContent=title+' aberta. Use os botões de zoom e arraste para visualizar.';
}
$('open-plan').addEventListener('click',()=>openImage(C.plan,'Planta humanizada',true));
document.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{
 const item=C.images.find(i=>i.id===button.dataset.photo);openImage(item.src,item.title,false);
}));
$('viewer-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{++openToken;ready=false;pointers.clear();document.body.style.overflow='';opener?.focus({preventScroll:true})});
dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))dialog.close()});
$('image-plus').addEventListener('click',()=>zoomAt(zoom*1.35));$('image-minus').addEventListener('click',()=>zoomAt(zoom/1.35));
$('image-fit').addEventListener('click',reset);$('image-rotate').addEventListener('click',()=>{rotation=(rotation+90)%360;reset()});
stage.addEventListener('wheel',event=>{if(!ready)return;event.preventDefault();const p=localPoint(event.clientX,event.clientY);zoomAt(zoom*Math.exp(-Math.max(-250,Math.min(250,event.deltaY))*.0025),p.x,p.y)},{passive:false});
stage.addEventListener('dblclick',event=>{const p=localPoint(event.clientX,event.clientY);zoomAt(zoom>=4?1:zoom*2,p.x,p.y)});
stage.addEventListener('pointerdown',event=>{
 if(!ready||event.button>0)return;event.preventDefault();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});stage.setPointerCapture(event.pointerId);stage.classList.add('dragging');stage.focus({preventScroll:true});
});
stage.addEventListener('pointermove',event=>{
 if(!pointers.has(event.pointerId)||!ready)return;
 const old=[...pointers.values()],previous=pointers.get(event.pointerId);
 pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(pointers.size===1){tx+=event.clientX-previous.x;ty+=event.clientY-previous.y;render()}
 else if(pointers.size===2){
  const now=[...pointers.values()];const before=Math.hypot(old[0].x-old[1].x,old[0].y-old[1].y),after=Math.hypot(now[0].x-now[1].x,now[0].y-now[1].y);
  const a={x:(old[0].x+old[1].x)/2,y:(old[0].y+old[1].y)/2},b={x:(now[0].x+now[1].x)/2,y:(now[0].y+now[1].y)/2};
  const anchor=localPoint(a.x,a.y);if(before>1)zoomAt(zoom*after/before,anchor.x,anchor.y);
  tx+=b.x-a.x;ty+=b.y-a.y;render();
 }
});
function release(event){pointers.delete(event.pointerId);if(pointers.size===0)stage.classList.remove('dragging')}
for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,release);
stage.addEventListener('keydown',event=>{
 const step=event.shiftKey?100:45;let handled=true;
 if(event.key==='+'||event.key==='=')zoomAt(zoom*1.35);else if(event.key==='-')zoomAt(zoom/1.35);else if(event.key==='0')reset();
 else if(event.key==='ArrowLeft'){tx+=step;render()}else if(event.key==='ArrowRight'){tx-=step;render()}else if(event.key==='ArrowUp'){ty+=step;render()}else if(event.key==='ArrowDown'){ty-=step;render()}else handled=false;
 if(handled)event.preventDefault();
});
new ResizeObserver(()=>{if(ready&&dialog.open){fit=fitScale();render()}}).observe(stage);
// The panorama viewer and its large images are loaded only when the visitor enters the tour.
let tourOpen=false,tourTimeout;
$('load-tour').addEventListener('click',()=>{
 tourOpen=true;$('tour-loading').textContent='Abrindo a visita…';$('tour-loading').hidden=false;$('tour-poster').hidden=true;$('tour-iframe').hidden=false;$('close-tour').hidden=false;
 const frame=$('tour-iframe');
 frame.onload=()=>{if(!tourOpen)return;clearTimeout(tourTimeout);$('tour-loading').hidden=true};
 if(window.AGORA_TOUR_HTML)frame.srcdoc=window.AGORA_TOUR_HTML;else frame.src='tour/index.html';
 tourTimeout=setTimeout(()=>{if(tourOpen){$('tour-loading').hidden=true;$('live-status').textContent='A visita está demorando para abrir. Você pode encerrar e tentar novamente.'}},35000);
});
$('close-tour').addEventListener('click',()=>{
 tourOpen=false;clearTimeout(tourTimeout);const frame=$('tour-iframe');frame.onload=null;frame.removeAttribute('srcdoc');frame.src='about:blank';frame.hidden=true;
 $('tour-poster').hidden=false;$('tour-loading').hidden=true;$('close-tour').hidden=true;$('load-tour').focus({preventScroll:true});
});
window.agoraPresentation={getState:()=>({slide,playing,tourOpen,viewer:{open:dialog.open,ready,kind,zoom,rotation,x:tx,y:ty,naturalWidth:im.naturalWidth,naturalHeight:im.naturalHeight}})};
})();

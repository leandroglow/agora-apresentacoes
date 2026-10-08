(()=>{'use strict';
const $=id=>document.getElementById(id),viewer=$('viewer'),viewport=$('viewport'),stage=$('stage'),mode=$('mode');let zoom=1,expanded=false,drag=null;
const ids=['old','new','demolition','construction','base','remove','build'];
const modes={compare:{layers:['old','new'],note:'Terracota: antiga. Azul: nova. As duas camadas têm o mesmo alinhamento.',file:'sobreposicao.webp'},old:{layers:['old'],note:'Planta existente · PDF p.2 / folha 01. Mesma posição e escala da proposta.',file:'antiga.webp'},new:{layers:['new'],note:'Planta nova · PDF p.5 / folha 04. Mesma posição e escala da existente.',file:'nova.webp'},demolition:{layers:['demolition'],note:'Prancha original de demolição · PDF p.3 / folha 02. Vermelho: retirar / demolir, conforme notas do projeto.',file:'demolir.webp'},construction:{layers:['construction'],note:'Prancha original de construção · PDF p.4 / folha 03. Azul: construir / instalar, conforme notas do projeto.',file:'construir.webp'},interventions:{layers:['base','remove','build'],note:'Vermelho: marcações de retirada. Azul: marcações de construção. Cinza: referência, não uma classificação de permanência.',file:'sobreposicao.webp'}};
function render(){let conf=modes[mode.value];$('compare-controls').hidden=mode.value!=='compare';ids.forEach(id=>{let im=$(id+'-layer');im.hidden=!conf.layers.includes(id);if(!im.hidden&&im.dataset.src&&!im.getAttribute('src'))im.src=im.dataset.src;im.style.opacity='1';im.style.visibility='visible';});if(mode.value==='compare'){['old','new'].forEach(id=>{let v=$('alpha-'+id).value;$(id+'-layer').style.opacity=v/100;$(id+'-layer').style.visibility=$('show-'+id).checked?'visible':'hidden';$('value-'+id).textContent=v+'%';});}if(mode.value==='interventions')$('base-layer').style.opacity='.45';$('original-link').href='assets/'+conf.file;$('original-link').hidden=mode.value==='interventions';}
function setZoom(z,fit=false){const before=stage.clientWidth||viewport.clientWidth;const cx=(viewport.scrollLeft+viewport.clientWidth/2)/before,cy=(viewport.scrollTop+viewport.clientHeight/2)/before;zoom=Math.max(1,Math.min(8,z));stage.style.width=(viewport.clientWidth*zoom)+'px';$('zoom-value').value=Math.round(zoom*100)+'%';$('minus').disabled=zoom<=1;$('plus').disabled=zoom>=8;if(fit){viewport.scrollLeft=0;viewport.scrollTop=0;}else{viewport.scrollLeft=cx*stage.clientWidth-viewport.clientWidth/2;viewport.scrollTop=cy*stage.clientWidth-viewport.clientHeight/2;}}
mode.addEventListener('change',render);['show-old','show-new','alpha-old','alpha-new'].forEach(id=>$(id).addEventListener('input',render));$('plus').onclick=()=>setZoom(zoom*1.5);$('minus').onclick=()=>setZoom(zoom/1.5);$('fit').onclick=()=>setZoom(1,true);
function expand(){expanded=!expanded;viewer.classList.toggle('expanded',expanded);document.body.classList.toggle('focused',expanded);$('expand').textContent=expanded?'Fechar tela':'Ampliar tela';$('expand').setAttribute('aria-expanded',String(expanded));if(expanded){viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');}else{viewer.removeAttribute('role');viewer.removeAttribute('aria-modal');}setZoom(zoom);$('expand').focus();}
$('expand').onclick=expand;document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded)expand();if(e.key==='Tab'&&expanded){const a=[...viewer.querySelectorAll('button,a[href],select,input,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);if(e.shiftKey&&document.activeElement===a[0]){e.preventDefault();a.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===a.at(-1)){e.preventDefault();a[0].focus();}}});
viewport.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;drag={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});viewport.addEventListener('pointermove',e=>{if(!drag)return;viewport.scrollLeft=drag.left-(e.clientX-drag.x);viewport.scrollTop=drag.top-(e.clientY-drag.y);});function end(){drag=null;viewport.classList.remove('dragging');}viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);window.addEventListener('resize',()=>setZoom(zoom));render();setZoom(1,true);
// Pinch gestures stay inside the drawing; page scrolling outside it is preserved.
let touchGesture=null;
function touchesState(touches){
 const r=viewport.getBoundingClientRect();
 const pts=Array.from(touches).slice(0,2).map(t=>({x:t.clientX-r.left-viewport.clientLeft,y:t.clientY-r.top-viewport.clientTop}));
 const x=pts.reduce((v,p)=>v+p.x,0)/pts.length,y=pts.reduce((v,p)=>v+p.y,0)/pts.length;
 return {x,y,count:pts.length,distance:pts.length===2?Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y):0};
}
function startTouch(e){
 if(!e.touches.length){touchGesture=null;return;}
 const p=touchesState(e.touches),w=stage.clientWidth;
 touchGesture={...p,zoom,left:viewport.scrollLeft,top:viewport.scrollTop,anchorX:(viewport.scrollLeft+p.x)/w,anchorY:(viewport.scrollTop+p.y)/w};
}
viewport.addEventListener('touchstart',e=>{e.preventDefault();startTouch(e);},{passive:false});
viewport.addEventListener('touchmove',e=>{
 e.preventDefault();if(!touchGesture)return;
 const p=touchesState(e.touches),g=touchGesture;
 if(p.count!==g.count){startTouch(e);return;}
 if(p.count===2&&g.distance>0){
  setZoom(g.zoom*p.distance/g.distance);
  viewport.scrollLeft=g.anchorX*stage.clientWidth-p.x;
  viewport.scrollTop=g.anchorY*stage.clientWidth-p.y;
 }else{viewport.scrollLeft=g.left+g.x-p.x;viewport.scrollTop=g.top+g.y-p.y;}
},{passive:false});
viewport.addEventListener('touchend',startTouch,{passive:true});
viewport.addEventListener('touchcancel',()=>{touchGesture=null;},{passive:true});
// Safari ignores user-scalable on some versions: cancel its page pinch explicitly.
['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,e=>e.preventDefault(),{passive:false}));
document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
})();



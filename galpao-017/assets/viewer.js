
'use strict';
const DATA=window.GALPAO_DATA,STRUCT=window.GALPAO_STRUCTURE;
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=2)=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const byId=Object.fromEntries(DATA.points.map(p=>[p.id,p])),byCircuit=Object.fromEntries(DATA.circuits.map(c=>[c.id,c]));
let selectedId='AC-T1',selectedCircuit=null,viewKey='geral',renderReady=false;
const V3=a=>new THREE.Vector3(a[0],a[1],a[2]);
const config={E:true,D:true,S:true,W:true,R:false,F:false,labels:true,opacity:.28,zmin:-.9,zmax:9,xmax:20,lightOnly:false};
const stage=$('stage'),labelHost=$('labels'),scene=new THREE.Scene();scene.background=new THREE.Color('#edf2f2');
const camera=new THREE.PerspectiveCamera(38,1,.02,200);camera.up.set(0,0,1);
let renderer,orbit={target:V3([3.75,13,3.7]),theta:-.95,phi:1.01,distance:27};
const world=new THREE.Group();scene.add(world);
const objects=[],pickables=[],labels=new Map(),structMats=[],wallMats=[];
const clipPlanes=[new THREE.Plane(new THREE.Vector3(0,0,1),.9),new THREE.Plane(new THREE.Vector3(0,0,-1),9),new THREE.Plane(new THREE.Vector3(-1,0,0),20)];
function mat(color,opacity=1){return new THREE.MeshStandardMaterial({color:color,roughness:.8,metalness:0,transparent:opacity<1,opacity:opacity,side:THREE.DoubleSide,depthWrite:opacity>=1,clippingPlanes:clipPlanes});}
function addObject(mesh,info){mesh.userData=info;world.add(mesh);objects.push(mesh);return mesh;}
function geomPositions(arr){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(arr,3));g.computeVertexNormals();return g;}
function decode(s){let b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Float32Array(a.buffer);}
function box(size,center,material,info){let m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.copy(V3(center));return addObject(m,info);}
function pipeGeometry(points,r){
 const ps=points.map(V3),vertices=[],u=new THREE.Vector3(),v=new THREE.Vector3(),t=new THREE.Vector3(),up=new THREE.Vector3(0,0,1),rings=[];
 for(let k=0;k<ps.length;k++){t.copy(ps[Math.min(k+1,ps.length-1)]).sub(ps[Math.max(0,k-1)]).normalize();if(Math.abs(t.dot(up))>.999)u.set(1,0,0);else u.copy(t).cross(up).normalize();v.copy(t).cross(u).normalize();let ring=[];for(let j=0;j<10;j++)ring.push(ps[k].clone().addScaledVector(u,Math.cos(j*Math.PI/5)*r).addScaledVector(v,Math.sin(j*Math.PI/5)*r));rings.push(ring);}
 for(let k=0;k<rings.length-1;k++)for(let j=0;j<10;j++){let n=(j+1)%10;for(let p of [rings[k][j],rings[k][n],rings[k+1][n],rings[k][j],rings[k+1][n],rings[k+1][j]])vertices.push(p.x,p.y,p.z);}
 return geomPositions(new Float32Array(vertices));
}
function localBoxPoint(p){
 let [w,h,d]=p.size==='QUADRO'?[.64,.84,.2]:p.size==='RACK'?[.6,1,.45]:p.size==='4x2'?[.075,.12,.055]:[.12,.12,.06];
 let color=p.ports?'#007e9c':p.type==='QUADRO'?'#263f50':p.type==='RACK'?'#263f50':'#db7025';
 const group=new THREE.Group(),material=mat(color),n=V3(p.normal||[0,0,-1]),u=new THREE.Vector3(),v=new THREE.Vector3();
 if(Math.abs(n.z)>.99)u.set(1,0,0);else u.crossVectors(new THREE.Vector3(0,0,1),n).normalize();v.crossVectors(n,u).normalize();
 let basis=new THREE.Matrix4().makeBasis(u,v,n);group.quaternion.setFromRotationMatrix(basis);group.position.copy(V3(p.p));
 const t=p.size==='RACK'?.018:.006;const pieces=[];
 for(const [sz,at] of [[[w,t,d],[0,-h/2+t/2,-d/2]],[[w,t,d],[0,h/2-t/2,-d/2]],[[t,h,d],[-w/2+t/2,0,-d/2]],[[t,h,d],[w/2-t/2,0,-d/2]],[[w,h,t],[0,0,-d+t/2]]]){const geo=new THREE.BoxGeometry(...sz).toNonIndexed();geo.translate(...at);pieces.push(...geo.getAttribute('position').array);}
 group.add(new THREE.Mesh(geomPositions(new Float32Array(pieces)),material));
 addObject(group,{kind:'point',p:p,category:p.ports||p.type==='RACK'?'D':'E',minz:p.p[2],maxz:p.p[2]});pickables.push(group);
 return group;
}
function loadScene(){
 const structureGroups=new Map();
 for(const item of STRUCT.meshes){
  const key=item.category+'|'+item.hidden;let group=structureGroups.get(key);
  if(!group){group={category:item.category,hidden:item.hidden,minz:Infinity,maxz:-Infinity,arrays:[]};structureGroups.set(key,group);}
  group.arrays.push(decode(item.positions));group.minz=Math.min(group.minz,item.minz);group.maxz=Math.max(group.maxz,item.maxz);
 }
 function combine(arrays){let length=arrays.reduce((n,a)=>n+a.length,0),out=new Float32Array(length),i=0;for(const a of arrays){out.set(a,i);i+=a.length;}return out;}
 for(const group of structureGroups.values()){
  const m=mat(group.category==='Cobertura'?'#8a7b70':'#94a6af',config.opacity);m.forceSinglePass=true;structMats.push(m);
  const geometry=geomPositions(combine(group.arrays));const mesh=new THREE.Mesh(geometry,m);
  addObject(mesh,{kind:'structure',category:group.category,minz:group.minz,maxz:group.maxz,hidden:group.hidden,name:group.category});
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,28),new THREE.LineBasicMaterial({color:'#526d7c',transparent:true,opacity:.24,clippingPlanes:clipPlanes}));mesh.add(edge);
 }
 for(const w of DATA.walls){
  const size=w.max.map((x,i)=>x-w.min[i]),center=w.max.map((x,i)=>(x+w.min[i])/2),m=mat('#acbec5',.075);wallMats.push(m);
  box(size,center,m,{kind:'wall',category:'W',minz:w.min[2],maxz:w.max[2],name:w.id});
 }
 const pipeGroups=new Map();
 for(const segment of DATA.segments){
  const key=[segment.system,segment.mode,segment.circuits.join(','),segment.route_indices.join(',')].join('|');
  let group=pipeGroups.get(key);
  if(!group){group={s:segment,minz:Infinity,maxz:-Infinity,arrays:[]};pipeGroups.set(key,group);}
  const geometry=pipeGeometry(segment.points,segment.dn/2000);group.arrays.push(geometry.getAttribute('position').array);
  group.minz=Math.min(group.minz,...segment.points.map(p=>p[2]));group.maxz=Math.max(group.maxz,...segment.points.map(p=>p[2]));
 }
 for(const group of pipeGroups.values()){
  const s=group.s,category=s.system==='E'?'E':'D',color=category==='E'?(s.mode.includes('APARENTE')?'#ab672a':'#e16c25'):'#007d9d';
  const m=mat(color);m.emissive=new THREE.Color(color);m.emissiveIntensity=.06;
  addObject(new THREE.Mesh(geomPositions(combine(group.arrays)),m),{kind:'pipe',category,s,minz:group.minz,maxz:group.maxz,baseColor:color});
 }
 for(const p of DATA.points){
  localBoxPoint(p);
  if(p.type==='LUZ')box([.5,.12,.04],[p.p[0],p.p[1],p.p[2]-.06],mat('#fff0bb'),{kind:'light',category:'E',circuit:p.circuit,minz:p.p[2]-.08,maxz:p.p[2]});
  if(p.room.includes('Geladeira')){
   const base=DATA.levels[p.floor];const fridge=box([.7,.72,1.75],[p.p[0],17.8,base+.875],mat('#c6d1d7',.76),{kind:'equipment',category:'equip',minz:base,maxz:base+1.75,point:p.id});
   fridge.add(new THREE.LineSegments(new THREE.EdgesGeometry(fridge.geometry,25),new THREE.LineBasicMaterial({color:'#6b838e',transparent:true,opacity:.55,clippingPlanes:clipPlanes})));
   box([.025,.04,.5],[p.p[0]+.25,17.415,base+1.1],mat('#526d7c'),{kind:'equipment',category:'equip',minz:base+.85,maxz:base+1.35,point:p.id});
  }
 }
 for(const p of DATA.pullboxes){
  const side=Number(p.size.split('x')[0])/1000,normal=p.normal||[0,0,-1],m=new THREE.Mesh(new THREE.BoxGeometry(side,side,.06),mat(p.system==='E'?'#dfaa60':'#4aa8b8'));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),V3(normal));m.position.copy(V3(p.p)).addScaledVector(V3(normal),-.03);
  addObject(m,{kind:'pass',category:p.system,minz:p.p[2],maxz:p.p[2]});
 }
 for(let i=0;i<7;i++)box([.48,.3,i===6?.09:.0445],[6.5,19.4,6.05+i*.078+(i===6?.045:.02225)],mat(i===6?'#344755':'#172f42'),{kind:'rackeq',category:'D',minz:6.05+i*.078,maxz:6.05+i*.078+.09});
 const floor=box([7.5,14,.03],[3.75,13,-.02],mat('#e2e9e9',.35),{kind:'base',category:'base',minz:-.04,maxz:0});
 for(let x=0;x<=8;x++)addLine([[x,6,-.045],[x,20,-.045]],'#bdcdd3',.4);
 for(let y=6;y<=20;y++)addLine([[0,y,-.045],[7.5,y,-.045]],'#bdcdd3',.4);
 const dir=new THREE.DirectionalLight('#fff6e6',2.4);dir.position.set(3,-8,18);scene.add(dir);
 const fill=new THREE.DirectionalLight('#d4ecff',1.4);fill.position.set(-8,12,10);scene.add(fill);scene.add(new THREE.AmbientLight('#ffffff',1.8));
 const hemi=new THREE.HemisphereLight('#ffffff','#afbec4',1);hemi.up.set(0,0,1);scene.add(hemi);
 for(const p of DATA.points){
  const label=document.createElement('button');label.className='point-label';label.textContent=p.id+(p.id==='RK-01'?' · rack':p.room.includes('Geladeira')?' · geladeira':'');label.dataset.id=p.id;label.setAttribute('aria-label','Selecionar '+p.id);label.onclick=()=>selectPoint(p.id);labelHost.append(label);labels.set(p.id,label);
 }
}
function addLine(points,color,opacity){const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(V3)),new THREE.LineBasicMaterial({color:color,transparent:true,opacity:opacity,clippingPlanes:clipPlanes}));addObject(mesh,{kind:'grid',category:'base',minz:-.05,maxz:-.04});}
function updateVisibility(){
 clipPlanes[0].constant=-config.zmin;clipPlanes[1].constant=config.zmax;clipPlanes[2].constant=config.xmax;
 for(const obj of objects){
  const d=obj.userData;let on=true;
  if(d.kind==='structure')on=config.S&&!d.hidden&&(d.category!=='Cobertura'||config.R)&&(d.category!=='Fundações'||config.F);
  else if(d.kind==='wall')on=config.W;
  else if(d.category==='E'||d.category==='D')on=config[d.category];
  else if(d.category==='base')on=config.zmin<.01;
  else if(d.kind==='equipment')on=config.W;
  if(d.maxz<config.zmin||d.minz>config.zmax)on=false;
  if(config.lightOnly&&['pipe','point','pass','rackeq'].includes(d.kind)){const c=d.s?.circuits||[d.p?.circuit||d.circuit];on=on&&c.some(c=>['C01','C07'].includes(c));}
  obj.visible=on;
  if(d.kind==='pipe'){
   const match=!selectedCircuit||d.s.circuits.includes(selectedCircuit)||d.s.route_indices.some(i=>DATA.routes[i]?.target===selectedId&&DATA.routes[i].system==='D');
   obj.material.opacity=match?1:.10;obj.material.transparent=!match;obj.material.depthWrite=match;obj.material.emissiveIntensity=match && selectedCircuit ? .05 : 0;
  }
 }
 for(const m of structMats){m.opacity=config.opacity;m.transparent=config.opacity<1;m.depthWrite=config.opacity>=1;}
 syncControls();render();
}

function syncControls(){for(const [id,key] of [['layerE','E'],['layerD','D'],['layerS','S'],['layerW','W'],['layerR','R'],['layerF','F'],['layerLabels','labels']])$(id).checked=config[key];$('opacity').value=Math.round(config.opacity*100);$('opacityValue').textContent=Math.round(config.opacity*100)+'%';}
function setCamera(position,target){const p=V3(position),t=V3(target),v=p.sub(t);orbit.target=t;orbit.distance=v.length();orbit.phi=Math.acos(v.z/orbit.distance);orbit.theta=Math.atan2(v.y,v.x);render();}
function render(){if(!renderer)return;let s=Math.sin(orbit.phi),distance=orbit.distance*Math.max(1,1.15/camera.aspect);camera.position.set(orbit.target.x+distance*s*Math.cos(orbit.theta),orbit.target.y+distance*s*Math.sin(orbit.theta),orbit.target.z+distance*Math.cos(orbit.phi));camera.lookAt(orbit.target);camera.updateMatrixWorld();renderer.render(scene,camera);updateLabels();}
function updateLabels(){
 const w=stage.clientWidth,h=stage.clientHeight,placed=[];
 const keys=['AC-S1','AC-S2','AC-T1','QD-T','QD-S','RK-01','T-PDF02-07','S-PDF04-05'];
 const order=[...DATA.points].sort((a,b)=>(b.id===selectedId)-(a.id===selectedId));
 for(const p of order){
  const el=labels.get(p.id);if(!el)continue;
  let on=config.labels&&((config.lightOnly?['LUZ','COMANDO'].includes(p.type):keys.includes(p.id))||p.id===selectedId)&&p.p[2]>=config.zmin&&p.p[2]<=config.zmax&&p.p[0]<=config.xmax&&(p.ports||p.type==='RACK'?config.D:config.E);
  if(config.lightOnly)on=on&&['C01','C07'].includes(p.circuit);
  const v=V3(p.p).project(camera),x=(v.x+1)*w/2,y=(1-v.y)*h/2;
  on=on&&v.z>-1&&v.z<1&&x>60&&x<w-60&&y>75&&y<h-25;
  if(on&&placed.some(a=>Math.abs(a[0]-x)<135&&Math.abs(a[1]-y)<38))on=false;
  el.style.display=on?'block':'none';el.classList.toggle('selected',p.id===selectedId);
  if(on){el.style.left=x+'px';el.style.top=y+'px';placed.push([x,y]);}
 }
}
function resize(){if(!renderer)return;const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();}
const presets={
 geral:{title:'Conjunto integrado',sub:'Estrutura, elétrica e lógica · cobertura oculta',pos:[19,-8,16.2],target:[3.75,13,3.7]},
 infra:{title:'Infraestrutura isolada',sub:'Eixos curvos da R02 · quadros e pontos',pos:[19,-8,16.2],target:[3.75,13,3.7],S:false,W:false},
 terreo:{title:'Térreo · loja',sub:'Corte horizontal de visualização em Z = 2,85 m',pos:[17,-6,16],target:[3.75,13,1.2],zmax:2.85,opacity:.55},
 superior:{title:'Escritório · segundo pavimento',sub:'Piso em Z = 3,23 m · corte de visualização',pos:[18,-4,21],target:[3.75,15,4.25],zmin:3.15,zmax:6.55,opacity:.5},
 esquerda:{title:'Parede esquerda · caixas e conduítes',sub:'Térreo + escritório · frente à esquerda',pos:[25,13,3.5],target:[.1,13,3.5],xmax:.36,S:false,W:false},
 rack:{title:'Rack sobre a laje do elevador',sub:'RK-01 · patch panels · PoE · NVR',pos:[11,12.5,9],target:[6.45,19.4,6.25],zmin:5.45,opacity:.24},
 geladeira_t:{title:'Geladeira do térreo',sub:'T-PDF02-07 · C02 · 220 V',pos:[5.5,12.5,4.5],target:[1.5,18.05,1],zmax:2.65,opacity:.12},
 geladeira_s:{title:'Geladeira do escritório',sub:'S-PDF04-05 · C04 · 220 V',pos:[5.5,12.5,7.6],target:[1.5,18.05,4.1],zmin:3.15,zmax:5.9,opacity:.12},
 iluminacao:{title:'Iluminação · alimentação e comandos',sub:'C01 e C07 · ramais finais aparentes',pos:[19,-8,16.2],target:[3.75,13,3.7],S:false,W:false,D:false,lightOnly:true},
 cobertura:{title:'Estrutura e instalações',sub:'Cobertura metálica e fundações visíveis',pos:[27,-23,20],target:[3.75,11.5,2],F:true,R:true,opacity:.8,zmin:-7}
};
function preset(key){
 viewKey=key;const p=presets[key]||presets.geral;Object.assign(config,{E:true,D:true,S:true,W:true,R:false,F:false,labels:true,opacity:.28,zmin:-.9,zmax:9,xmax:20,lightOnly:false},p);selectedCircuit=null;
 $('viewtitle').textContent=p.title;$('viewsub').textContent=p.sub;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===key));
 setCamera(p.pos,p.target);updateVisibility();
}
function focusPoint(id){
 const p=byId[id];if(!p)return;selectedId=id;selectedCircuit=null;
 Object.assign(config,{E:true,D:true,S:true,W:true,R:false,F:false,labels:true,opacity:.14,zmin:p.floor==='S'?3.15:p.floor==='R'?5.3:-.9,zmax:p.floor==='T'?3:p.floor==='S'?6.7:9,xmax:20,lightOnly:false});
 let pos=V3(p.p).add(V3(p.normal||[1,-1,0]).multiplyScalar(5)).add(V3([2,-3,2]));
 if(p.id==='RK-01'||p.id==='RK-ENERGIA'){preset('rack');selectedId=id;}
 else{setCamera(pos.toArray(),p.p);$('viewtitle').textContent=id;$('viewsub').textContent=p.room+' · '+(p.floor==='T'?'Térreo':'Escritório');updateVisibility();}
}

function bindInput(){
 const canvas=renderer.domElement,pointers=new Map();let multi=false,lastGesture=null,raf=0;
 function schedule(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;render();});}
 function gesture(){const ps=[...pointers.values()].slice(0,2);return ps.length<2?null:{x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2,d:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y)};}
 function pan(dx,dy){const scale=2*orbit.distance*Math.tan(camera.fov*Math.PI/360)/stage.clientHeight*Math.max(1,1.15/camera.aspect);const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);orbit.target.addScaledVector(right,-dx*scale).addScaledVector(up,dy*scale);}
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{
  canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,button:e.button,shift:e.shiftKey,moved:false});
  if(pointers.size>1){multi=true;lastGesture=gesture();}
 });
 canvas.addEventListener('pointermove',e=>{
  const p=pointers.get(e.pointerId);if(!p)return;
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;p.moved=p.moved||Math.hypot(p.x-p.sx,p.y-p.sy)>5;
  if(pointers.size>=2){const g=gesture();if(lastGesture&&g){if(g.d>5&&lastGesture.d>5)orbit.distance=Math.min(85,Math.max(1.5,orbit.distance*lastGesture.d/g.d));pan(g.x-lastGesture.x,g.y-lastGesture.y);}lastGesture=g;}
  else if(p.button===2||p.shift)pan(dx,dy);
  else{orbit.theta-=dx*.006;orbit.phi=Math.max(.035,Math.min(Math.PI-.035,orbit.phi-dy*.006));}
  schedule();
 });
 const end=e=>{const p=pointers.get(e.pointerId);if(!p)return;if(e.type==='pointerup'&&!multi&&!p.moved&&p.button===0)pick(e);pointers.delete(e.pointerId);lastGesture=gesture();if(!pointers.size)multi=false;};
 canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
 canvas.addEventListener('wheel',e=>{e.preventDefault();orbit.distance=Math.min(85,Math.max(1.5,orbit.distance*Math.exp(e.deltaY*.001)));schedule();},{passive:false});
}


function pick(e){
 const rect=stage.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
 let best=null,dist=24;
 for(const obj of pickables){if(!obj.visible)continue;const p=obj.userData.p;if(p.p[0]>config.xmax||p.p[2]<config.zmin||p.p[2]>config.zmax)continue;const v=V3(p.p).project(camera);if(v.z<-1||v.z>1)continue;const d=Math.hypot((v.x+1)*rect.width/2-x,(1-v.y)*rect.height/2-y);if(d<dist){best=p;dist=d;}}
 if(best)selectPoint(best.id);
}
function highlightCircuit(id){selectedCircuit=id;config.E=true;config.lightOnly=false;updateVisibility();}
try{
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.5:2));renderer.localClippingEnabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;stage.prepend(renderer.domElement);loadScene();bindInput();new ResizeObserver(resize).observe(stage);preset('geral');$('loading').remove();renderReady=true;
}catch(e){$('loading').innerHTML='<div class="fallback"><strong>O navegador não conseguiu iniciar o 3D.</strong><p>As plantas, as dez imagens e o memorial continuam disponíveis abaixo. Abra este arquivo em um navegador com WebGL habilitado para explorar o modelo.</p><small>'+esc(e.message)+'</small></div>';console.error(e);}
window.MODEL={preset,render,resize,focusPoint,highlightCircuit,config,get ready(){return renderReady},get stats(){return{structure:STRUCT.meshes.length,triangles:STRUCT.meshes.reduce((s,m)=>s+m.vertices/3,0),points:DATA.points.length,pipes:DATA.segments.length,drawCalls:renderer?.info.render.calls}},zoom(factor){orbit.distance=Math.min(85,Math.max(1.5,orbit.distance*factor));render();},get cameraState(){return{distance:orbit.distance,theta:orbit.theta,phi:orbit.phi,target:orbit.target.toArray()}},clearHighlight(){selectedCircuit=null;updateVisibility();},setSelected(id){selectedId=id;render();},capture(){render();return renderer.domElement.toDataURL('image/png')}};




'use strict';
let planFloor='T',planSystem='E';
const floorName=f=>f==='T'?'Térreo / loja':f==='S'?'Escritório':'Rack / laje do elevador';
function pointDetails(p,location){
 const c=byCircuit[p.circuit],net=DATA.network.find(n=>n.id===p.id),height=p.p[2]-(DATA.levels[p.floor]??5.78);
 let cells=[['Pavimento',floorName(p.floor)],['Altura sobre piso',fmt(height)+' m'],['Caixa',p.size],['Coordenadas X / Y',fmt(p.p[0])+' / '+fmt(p.p[1])+' m']];
 if(c)cells.push(['Circuito / quadro',p.circuit+' / '+c.board],['Tensão / fases',c.voltage+' V · '+c.phase],['Cabo / proteção',String(c.section).replace('.',',')+' mm² / '+c.breaker+' A'],['Carga alocada',fmt(p.load_va,0)+' VA']);
 if(net)cells.push(['Portas RJ45',p.ports],['Patch panel',net.patch],['Rota até o rack',fmt(net.route)+' m'],['Cada enlace + folga',fmt(net.link)+' m']);
 if(p.type==='RACK')cells.push(['Terminações','36 enlaces / 2 patch panels'],['Gabinete de referência','18U · 600 × 450 × 1.000 mm']);
 if(p.type==='QUADRO'){const cs=DATA.circuits.filter(c=>c.board===p.id).map(c=>c.id).join(' · ');cells.push(['Circuitos',cs],['Alimentação',p.id==='QD-T'?'3 fases 16 mm² informadas':'3F + N + PE 16 mm² / 50 A']);}
 let special=p.type==='AR-CONDICIONADO'?'12.000 BTU/h; reserva elétrica de 1.500 W / FP 0,95. Alimentação e modelo do aparelho devem ser confirmados.':p.room.includes('Geladeira')?'Geladeira com as costas para o WC esquerdo dos fundos. Reserva de 500 VA dentro da carga do circuito, sem somar novamente ao quadro.':p.type==='RACK'?'Rede, PoE e gravação centralizados. Acesso, ventilação, capacidade da laje e dimensões dos equipamentos dependem de compatibilização.':p.type==='LUZ'?'Ramal final de iluminação aparente. Posição e potência seguem a leitura da prancha elétrica.':p.type==='ELEVADOR'?'Interface de energia do elevador. Função, motor e especificação dependem do fabricante.':p.type==='QUADRO'?'Posição mantida da R01. O quadro principal e o alimentador existente ainda dependem das verificações indicadas no memorial.':'Posição de coordenação baseada no PDF e ajustada à face de parede. Conferir instalação existente.';
 let buttons='<button data-focus="'+esc(p.id)+'">Focar no 3D</button>';
 if(c)buttons+=' <button data-highlight="'+c.id+'">Destacar '+c.id+'</button>';
 else if(net)buttons+=' <button data-route="'+esc(p.id)+'">Destacar enlace</button>';
 return '<span class="pill">'+esc(p.type)+'</span><span class="pill">R02</span><h3>'+esc(p.id)+'</h3><p class="usage">'+esc(p.room)+'</p><div class="kv">'+cells.map(([a,b])=>'<div><span>'+esc(a)+'</span><strong>'+esc(b)+'</strong></div>').join('')+'</div><p class="micro">'+esc(special)+'</p>'+buttons+'<p class="micro">Origem: '+esc(p.source||'Complemento da R02')+'. Z = '+fmt(p.p[2])+' m no modelo.</p>';
}
function selectPoint(id,opt={}){
 const p=byId[id];if(!p)return;selectedId=id;
 $('info3d').innerHTML=pointDetails(p,'3d');$('planInfo').innerHTML=pointDetails(p,'plan');MODEL.setSelected(id);
 planFloor=p.floor==='T'?'T':'S';planSystem=p.ports||p.type==='RACK'?'D':'E'; MODEL.clearHighlight();
 drawPlan();drawPointList();
 if(opt.focus){MODEL.focusPoint(id);$('explorar').scrollIntoView({behavior:'smooth'});}
}
function pointsForPlan(){
 const q=$('pointSearch').value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 return DATA.points.filter(p=>(p.floor===planFloor||(planFloor==='S'&&p.floor==='R'))&&((p.ports>0||p.type==='RACK')===(planSystem==='D'))).filter(p=>!q||[p.id,p.room,p.circuit,p.type].join(' ').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q));
}
function drawPointList(){
 const ps=pointsForPlan();$('pointList').innerHTML=ps.length?ps.map(p=>'<button class="point-row '+(p.id===selectedId?'active':'')+'" data-select="'+esc(p.id)+'"><b>'+esc(p.id)+'</b><span>'+esc(p.room)+'</span></button>').join(''):'<p class="micro">Nenhum ponto corresponde à busca neste pavimento e sistema.</p>';
}
function drawPlan(){
 document.querySelectorAll('[data-floor]').forEach(b=>b.classList.toggle('active',b.dataset.floor===planFloor));document.querySelectorAll('[data-system]').forEach(b=>b.classList.toggle('active',b.dataset.system===planSystem));
 const ps=pointsForPlan(),all=DATA.points.filter(p=>(p.floor===planFloor||(planFloor==='S'&&p.floor==='R'))&&((p.ports>0||p.type==='RACK')===(planSystem==='D')));
 const xy=p=>[190+p[0]*62,100+(20-p[1])*62],line=points=>points.map((p,i)=>(i?'L':'M')+xy(p).map(n=>n.toFixed(2)).join(',')).join(' ');
 let out='<svg viewBox="0 0 900 1050" role="img" aria-label="Planta de '+floorName(planFloor)+' com pontos de '+(planSystem==='E'?'elétrica':'rede e câmeras')+'"><rect width="900" height="1050" fill="white"/><text x="190" y="45" fill="#173243" font-family="Segoe UI" font-size="22">'+(planFloor==='T'?'TÉRREO / LOJA':'ESCRITÓRIO / MEZANINO')+'</text><text x="190" y="70" fill="#607b86" font-family="Segoe UI" font-size="12">FUNDOS ↑  ·  '+(planSystem==='E'?'ELÉTRICA 220 / 127 V':'REDE E CÂMERAS / PoE')+'</text>';
 for(const l of DATA.cadlines.filter(l=>l.floor===planFloor))out+='<path d="'+line(l.points)+'" fill="none" stroke="#b2c3ca" stroke-width="1.3"/>';
 const sy=planSystem,z0=planFloor==='T'?-.8:3.2,z1=planFloor==='T'?3.02:8;
 for(const s of DATA.segments){
  if((s.system==='E'?'E':'D')!==sy||Math.min(...s.points.map(p=>p[2]))>z1||Math.max(...s.points.map(p=>p[2]))<z0)continue;
  const pts=s.points.filter(p=>p[1]>=6&&p[2]>=z0&&p[2]<=z1);if(pts.length<2)continue;
  const a=xy(pts[0]),b=xy(pts[pts.length-1]),len=Math.hypot(a[0]-b[0],a[1]-b[1]);
  let path=line(pts);if(len>75&&s.curve_type!=='CURVA'){const dx=b[0]-a[0],dy=b[1]-a[1],bend=6;path='M'+a.join(',')+' Q'+[(a[0]+b[0])/2-dy/len*bend,(a[1]+b[1])/2+dx/len*bend].join(',')+' '+b.join(',');}
  const chosen=selectedCircuit&&s.circuits.includes(selectedCircuit),col=sy==='E'?'#d76e29':'#00819b';
  out+='<path d="'+path+'" fill="none" stroke="'+col+'" stroke-width="'+(chosen?2.8:1.1)+'" opacity="'+(selectedCircuit && !chosen ? .15 : .75)+'" '+(s.mode.includes('APARENTE')?'stroke-dasharray="4 4"':'')+'/>';
 }
 const left=ps.filter(p=>p.p[0]<3.75).sort((a,b)=>b.p[1]-a.p[1]),right=ps.filter(p=>p.p[0]>=3.75).sort((a,b)=>b.p[1]-a.p[1]);
 function labels(ps,isLeft){
  let ys=ps.map(p=>xy(p.p)[1]),last=80;for(let i=0;i<ys.length;i++){ys[i]=Math.max(last,ys[i]);last=ys[i]+22;}last=954;for(let i=ys.length-1;i>=0;i--){ys[i]=Math.min(last,ys[i]);last=ys[i]-22;}
  ps.forEach((p,i)=>{
   const [x,y]=xy(p.p),ly=ys[i],tx=isLeft?14:710,lx=isLeft?166:697,chosen=p.id===selectedId,col=planSystem==='E'?'#ce6023':'#007e9c';
   out+='<g class="plan-point '+(chosen?'selected':'')+'" tabindex="0" role="button" aria-label="'+esc(p.id+' '+p.room)+'" data-point="'+esc(p.id)+'"><path d="M'+x+','+y+' L'+lx+','+ly+'" stroke="'+(chosen?'#bd671c':'#bdcdd3')+'" stroke-width="'+(chosen?1.8:.7)+'" fill="none"/><circle cx="'+x+'" cy="'+y+'" r="'+(chosen?8:5)+'" fill="'+(chosen?'#ffbd63':'white')+'" stroke="'+col+'" stroke-width="2"/><rect x="'+tx+'" y="'+(ly-13)+'" width="170" height="22" fill="white" fill-opacity=".8"/><text x="'+tx+'" y="'+(ly+4)+'">'+esc(p.id)+'</text></g>';
  });
 }
 labels(left,true);labels(right,false);
 out+='<text x="420" y="1000" text-anchor="middle" fill="#607b86" font-family="Segoe UI" font-size="14">FRENTE / RUA · Y = 6,00 m</text><text x="420" y="1027" text-anchor="middle" fill="#607b86" font-family="Segoe UI" font-size="12">7,50 m de largura · coordenadas propostas / sem escala de impressão</text></svg>';
 $('plan').innerHTML=out;
}
function renderGallery(){
 $('gallery').innerHTML=DATA.gallery.map((g,i)=>'<figure><button class="image-button" data-gallery="'+i+'" aria-label="Ampliar '+esc(g.title)+'"><img loading="lazy" src="'+g.image+'" alt="'+esc(g.title+' — '+g.description)+'"><span class="zoomtag">Ampliar ↗</span></button><figcaption><p class="eyebrow">VISTA '+String(i+1).padStart(2,'0')+'</p><h3>'+esc(g.title)+'</h3><p>'+esc(g.description)+'</p></figcaption></figure>').join('');
}
function openGallery(i){
 const g=DATA.gallery[i];$('modalTitle').textContent=g.title;$('modalImage').src=g.image;$('modalImage').alt=g.description;$('modalLegend').innerHTML='<p class="eyebrow">'+esc(g.subtitle)+'</p><p>'+esc(g.description)+'</p>'+g.notes.map(n=>'<h4>'+esc(n[0])+'</h4><p>'+esc(n[1])+'</p>').join('')+'<h4>Pontos desta vista</h4>'+g.points.filter(id=>byId[id]).map(id=>'<button data-modalpoint="'+esc(id)+'">'+esc(id)+'</button>').join('')+'<p class="micro">Clique no código para localizar o ponto no modelo interativo.</p>';
 if(!$('lightbox').open)$('lightbox').showModal(); window.resetImageZoom?.();
}
function elevation(){
 let out='<svg viewBox="0 0 690 415" role="img" aria-label="Elevação da parede esquerda com os três pontos de ar-condicionado e os quadros">';
 for(const [f,base,z0] of [['S',40,3.23],['T',235,.05]]){
  const xy=p=>[42+(p[1]-6)*43,base+135-(p[2]-z0)*39];

  out+='<rect x="42" y="'+(base-5)+'" width="605" height="145" fill="#f0f5f6"/><text x="42" y="'+(base-14)+'" font-size="12" fill="#007e9c" font-family="Segoe UI">'+(f==='S'?'ESCRITÓRIO':'TÉRREO')+'</text>';
  for(let h=0;h<=3;h++){let y=base+135-h*39;out+='<path d="M42,'+y+'H647" stroke="#d4e0e4" stroke-width=".5"/><text x="7" y="'+(y+4)+'" font-size="10" fill="#607b86">'+h+' m</text>';}
  for(const s of DATA.segments){if(s.points.some(p=>p[0]>.23||p[1]<6||p[2]<z0||p[2]>z0+3.3))continue;out+='<path d="'+s.points.map((p,i)=>(i?'L':'M')+xy(p).join(',')).join(' ')+'" fill="none" stroke="'+(s.system==='E'?'#db793e':'#168da5')+'" stroke-width=".8"/>';}
  for(const p of DATA.points.filter(p=>p.floor===f&&['AR-CONDICIONADO','QUADRO'].includes(p.type))){const [x,y]=xy(p.p);out+='<g data-point="'+p.id+'" class="plan-point" tabindex="0" role="button" aria-label="'+p.id+'"><rect x="'+(x-4)+'" y="'+(y-4)+'" width="8" height="8" fill="#ffd39b" stroke="#d46420"/><text x="'+(x+6)+'" y="'+(y-7)+'" font-size="11">'+p.id+'</text></g>';}
 }
 out+='<text x="43" y="405" font-size="10" fill="#607b86">FRENTE ← Y = 6,00 m</text><text x="500" y="405" font-size="10" fill="#607b86">FUNDOS → Y = 20,00 m</text></svg>';$('elevation').innerHTML=out;
}
function makeTable(headers,rows,attrs=[]){return '<table><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map((r,i)=>'<tr '+(attrs[i]||'')+'>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
function tables(){
 const cs=[...DATA.circuits].sort((a,b)=>Number(a.id.slice(1))-Number(b.id.slice(1)));
 $('circuitTable').innerHTML=makeTable(['Circuito','Quadro / uso','VA','Tensão','Fases','Cabo','Disjuntor','Queda total'],cs.map(c=>[c.id,c.board+' · '+c.description,fmt(c.va,0),c.voltage+' V',c.phase,String(c.section).replace('.',',')+' mm²',c.breaker+' A',fmt(c.total_drop)+'%']),cs.map(c=>'data-circuit="'+c.id+'" tabindex="0" role="button" aria-label="Destacar circuito '+c.id+'"'));
 const buckets={};for(const s of DATA.segments){let k=(s.system==='E'?'Elétrica':'Lógica')+'|'+s.dn;buckets[k]=(buckets[k]||0)+s.length;}
 $('pipeTable').innerHTML=makeTable(['Sistema / DN','Eixo','Com 10%'],Object.entries(buckets).sort().map(([k,n])=>[k.replace('|',' · DN '),fmt(n)+' m',Math.ceil(n*1.1/3)*3+' m']));
 $('wireTable').innerHTML=makeTable(['Seção','Compra estimada'],Object.entries(DATA.summary.wire_purchase).map(([k,n])=>[k.replace('.',',')+' mm²',n+' m']));
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button,[data-circuit],[data-point]');if(!b)return;
 if(b.dataset.view)preset(b.dataset.view);
 if(b.dataset.floor){planFloor=b.dataset.floor;$('pointSearch').value='';drawPlan();drawPointList();const p=pointsForPlan()[0];if(p)selectPoint(p.id);}
 if(b.dataset.system){planSystem=b.dataset.system;$('pointSearch').value='';drawPlan();drawPointList();const p=pointsForPlan()[0];if(p)selectPoint(p.id);}
 if(b.dataset.select)selectPoint(b.dataset.select,{syncPlan:true,focus:!b.classList.contains('point-row')});
 if(b.dataset.point)selectPoint(b.dataset.point);
 if(b.dataset.focus)selectPoint(b.dataset.focus,{focus:true,syncPlan:true});
 if(b.dataset.highlight){MODEL.highlightCircuit(b.dataset.highlight);drawPlan();}
 if(b.dataset.route){selectedId=b.dataset.route;selectedCircuit='REDE';MODEL.highlightCircuit('REDE');}
 if(b.dataset.gallery!==undefined)openGallery(Number(b.dataset.gallery));
 if(b.dataset.modalpoint){$('lightbox').close();selectPoint(b.dataset.modalpoint,{focus:true,syncPlan:true});}
 if(b.dataset.circuit){MODEL.preset('infra');const p=DATA.points.find(p=>p.circuit===b.dataset.circuit);if(p)selectPoint(p.id);MODEL.highlightCircuit(b.dataset.circuit);$('explorar').scrollIntoView({behavior:'smooth'});}
});
document.addEventListener('keydown',e=>{const b=e.target.closest('[data-point],[data-circuit]');if(b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();b.click();}});
for(const [id,key] of [['layerE','E'],['layerD','D'],['layerS','S'],['layerW','W'],['layerR','R'],['layerF','F'],['layerLabels','labels']])$(id).onchange=()=>{config[key]=$(id).checked;updateVisibility();};
$('opacity').oninput=()=>{config.opacity=Number($('opacity').value)/100;updateVisibility();};
$('reset3d').onclick=()=>preset('geral');
$('saveView').onclick=()=>{if(!MODEL.ready)return;const a=document.createElement('a');a.href=MODEL.capture();a.download='017_R02_vista_'+viewKey+'.png';a.click();};
$('pointSearch').oninput=()=>{drawPlan();drawPointList();};
$('closeModal').onclick=()=>$('lightbox').close();
$('lightbox').addEventListener('click',e=>{if(e.target===$('lightbox'))$('lightbox').close();});
$('openAll').onclick=()=>document.querySelectorAll('#chapters details').forEach(d=>d.open=true);
$('closeAll').onclick=()=>document.querySelectorAll('#chapters details').forEach(d=>d.open=false);
$('print').onclick=()=>window.print();let beforeOpen=[];
window.addEventListener('beforeprint',()=>{beforeOpen=[...document.querySelectorAll('#chapters details')].map(d=>d.open);document.querySelectorAll('#chapters details').forEach(d=>d.open=true);MODEL.render();});
window.addEventListener('afterprint',()=>document.querySelectorAll('#chapters details').forEach((d,i)=>d.open=beforeOpen[i]));
renderGallery();elevation();tables();selectPoint('AC-T1');
window.PRANCHA={selectPoint,openGallery,pointsForPlan,drawPlan,DATA,STRUCT,get selected(){return selectedId},get plan(){return{floor:planFloor,system:planSystem}}};
if(new URLSearchParams(location.search).has('render')){document.body.classList.add('render-mode');MODEL.resize();}



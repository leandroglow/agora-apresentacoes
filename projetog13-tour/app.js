"use strict";
const steps = [
  ["Garagem", "Acesso pela porta de vidro da sala.", "garagem", "Entrar pela garagem em 360°"],
  ["Sala de entrada", "A vista atravessa o jantar e chega à piscina.", "sala-piscina", "Explorar a sala em 360°"],
  ["Cozinha", "Da ilha de São Gabriel ao deck.", "cozinha", "Explorar a cozinha em 360°"],
  ["Deck da piscina", "A borda de vidro se abre para a mata.", "deck", "Explorar o deck em 360°"]
];
const cameras = {
  garagem:{label:"Garagem",xy:[3.75,2.70],yaw:18,pitch:0,views:[["casa","Olhar para a casa",18,0,82],["rua","Olhar para o portão",180,-3,82]]},
  "sala-piscina":{label:"Sala de entrada",xy:[4.40,6.25],yaw:7,pitch:-2,views:[["piscina","Olhar para a piscina",7,-2,76],["garagem","Olhar para a garagem",162,-3,82]]},
  "sala-garagem":{label:"Estar",xy:[4.15,10.55],yaw:159,pitch:-3,views:[["garagem","Olhar para a garagem",159,-4,77],["piscina","Olhar para a cozinha",16,-2,72]]},
  cozinha:{label:"Cozinha",xy:[4.80,13.10],yaw:12,pitch:-3,views:[["piscina","Olhar para a piscina",12,-4,77],["garagem","Olhar para o estar",-170,-3,75],["jardim","Olhar para o jardim",-90,-2,78]]},
  deck:{label:"Deck da piscina",xy:[6.40,20.30],yaw:-45,pitch:-13,views:[["piscina","Ver a borda",-45,-14,83],["cozinha","Olhar para a cozinha",-167,-3,75],["quarto","Olhar para a suíte",-114,-3,75]]}
};
const routeOrder=Object.keys(cameras);
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const walk = document.querySelector(".walk");
const stage = walk.querySelector(".stage");
const layers = [...walk.querySelectorAll(".layers img")];
const rail = [...walk.querySelectorAll(".rail button")];
let activeStep = -1;
let scrollFrame = 0;

function showStep() {
  scrollFrame = 0;
  const travel = Math.max(1, walk.offsetHeight - stage.offsetHeight);
  const p = Math.max(0,Math.min(1,-walk.getBoundingClientRect().top/travel)) * (steps.length - 0.56);
  const section = Math.min(steps.length-1,Math.floor(p));
  const fade = Math.max(0,Math.min(1,(p-section-.58)/.42));
  const index = reduced.matches ? section : Math.min(steps.length-1,section + (fade >= .5 ? 1:0));
  layers.forEach((img,i) => {
    const visible = reduced.matches ? Number(i===index) : i===section ? 1 : i===section+1 ? fade : 0;
    img.style.opacity = String(visible);
    img.style.transform = reduced.matches ? "none" : "scale("+(1+Math.min(1,Math.max(0,p-i))*.115)+")";
  });
  if (index === activeStep) return;
  activeStep = index;
  const [title,detail,key,call] = steps[index];
  document.querySelector("#stage-title").textContent = title;
  document.querySelector("#stage-detail").textContent = detail;
  const link = document.querySelector("#stage-open");
  link.href = "#"+key;
  link.textContent = call;
  rail.forEach((b,i) => i === index ? b.setAttribute("aria-current","step") : b.removeAttribute("aria-current"));
}
function updateWalk() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(showStep);
}
rail.forEach((b,i) => b.addEventListener("click",() => {
  const t = walk.getBoundingClientRect().top+window.scrollY+(walk.offsetHeight-stage.offsetHeight)*(i+.08)/(steps.length-.56);
  window.scrollTo({top:t,behavior:reduced.matches?"instant":"smooth"});
}));
window.addEventListener("scroll",updateWalk,{passive:true});
window.addEventListener("resize",updateWalk);
reduced.addEventListener("change",updateWalk);
showStep();

let headingFrame=0;
const plan=document.getElementById("floor-map");
const planToggle=document.getElementById("map-toggle");
function showPlan(yes){
  plan.hidden=!yes;
  planToggle.setAttribute("aria-expanded",String(yes));
  planToggle.hidden=yes;
}
function initPlan(){
  const layer=document.getElementById("map-points");
  routeOrder.forEach((id,i)=>{
    const cfg=cameras[id],button=document.createElement("button");
    button.type="button";button.className="floorpoint";button.dataset.room=id;
    button.setAttribute("aria-label","Ir para "+cfg.label);button.title=cfg.label;
    button.style.left=(cfg.xy[0]/7.5*100)+"%";
    button.style.top=((25-cfg.xy[1])/25*100)+"%";
    const mark=document.createElement("span");mark.className="disc";mark.textContent=String(i+1);button.append(mark);
    button.addEventListener("click",()=>{if(location.hash!=="#"+id)location.hash=id;});
    layer.append(button);
  });
  showPlan(!matchMedia("(max-width:700px), (max-height:510px)").matches);
  planToggle.addEventListener("click",()=>{showPlan(true);plan.querySelector("[aria-current]")?.focus({preventScroll:true});});
  document.getElementById("hide-map").addEventListener("click",()=>{showPlan(false);planToggle.focus({preventScroll:true});});
}
function syncPlan(room){
  for(const btn of plan.querySelectorAll("[data-room]")){
    if(btn.dataset.room===room)btn.setAttribute("aria-current","location");else btn.removeAttribute("aria-current");
  }
  plan.querySelector(".plan-status").textContent=cameras[room].label;
}
function updateHeading(){
  cancelAnimationFrame(headingFrame);
  const tick=()=>{
    if(!viewer || !dialog.open)return;
    if(!plan.hidden)plan.style.setProperty("--heading",(viewer.getYaw()||0)+"deg");
    headingFrame=requestAnimationFrame(tick);
  };tick();
}
function portalLinks(room){
  const index=routeOrder.indexOf(room),from=cameras[room].xy;
  return [routeOrder[index-1],routeOrder[index+1]].filter(Boolean).map(id=>{
    const xy=cameras[id].xy, yaw=Math.atan2(xy[0]-from[0],xy[1]-from[1])*180/Math.PI;
    return {pitch:-13,yaw,type:"info",cssClass:"g13-portal",createTooltipFunc:(div)=>{
      const b=document.createElement("button");b.className="jump-hotspot";b.type="button";b.dataset.room=id;
      b.setAttribute("aria-label","Caminhar para "+cameras[id].label);
      const icon=document.createElement("span");icon.setAttribute("aria-hidden","true");icon.textContent="⌃";
      const label=document.createElement("span");label.textContent=cameras[id].label;b.append(icon,label);
      b.onclick=e=>{e.preventDefault();e.stopPropagation();location.hash=id;};
      div.appendChild(b);
    }};
  });
}
const fotos=[["fachada","Fachada da rua"],["garagem","Garagem e acesso"],["sala-piscina","Sala de entrada"],["sala-garagem","Estar e jardim"],["cozinha","Cozinha e ilha"],["deck","Deck da piscina"]];
const foto=document.getElementById("foto");let indexFoto=0;
function verFoto(index){
  indexFoto=(index+fotos.length)%fotos.length;const [id,title]=fotos[indexFoto];
  const src="assets/"+id+"-ambientacao.jpg?v=r19real";
  document.getElementById("foto-grande").src=src;document.getElementById("foto-grande").alt=title+" da Casa G13";
  document.getElementById("original").href=src;document.getElementById("legenda-foto").textContent=title+" · "+(indexFoto+1)+" / "+fotos.length;
  if(!foto.open)foto.showModal();
}
document.querySelectorAll(".photo-thumb").forEach(b=>b.addEventListener("click",()=>verFoto(+b.dataset.index)));
document.getElementById("close-photo").onclick=()=>foto.close();
document.getElementById("prev-photo").onclick=()=>verFoto(indexFoto-1);
document.getElementById("next-photo").onclick=()=>verFoto(indexFoto+1);
foto.addEventListener("click",e=>{if(e.target===foto)foto.close();});
foto.addEventListener("keydown",e=>{if(e.key==="ArrowRight")verFoto(indexFoto+1);if(e.key==="ArrowLeft")verFoto(indexFoto-1);});
let startX=null;
foto.addEventListener("touchstart",e=>{startX=e.touches.length===1?e.touches[0].clientX:null;},{passive:true});
foto.addEventListener("touchend",e=>{if(startX!==null && Math.abs(startX-e.changedTouches[0].clientX)>65)verFoto(indexFoto+(startX>e.changedTouches[0].clientX?1:-1));startX=null;},{passive:true});

const dialog = document.querySelector("#tour");
const mount = document.querySelector("#sphere");
const loading = document.querySelector("#loading");
let activeRoom = "", viewer = null, generation = 0;
let returnHash = "#vistas", focusOrigin = null;

function stop() {
  generation++;
  cancelAnimationFrame(headingFrame);
  if (viewer) { viewer.destroy(); viewer = null; }
  mount.replaceChildren();
}
function openCamera(room, target) {
  stop();
  const ticket = generation;
  activeRoom = room;
  const config = cameras[room];
  const angles = target || {yaw:config.yaw, pitch:config.pitch, hfov:82};
  const src = "assets/"+room+".jpg?v=r19real";
  dialog.querySelector("#room-title").textContent=config.label;
  mount.style.backgroundImage="url('assets/"+room+"-capa.jpg?r19')";
  dialog.querySelectorAll(".scene-nav a").forEach(a=>a.hash==="#"+room ? a.setAttribute("aria-current","location") : a.removeAttribute("aria-current"));
  const directions = document.querySelector("#sightlines");
  directions.replaceChildren();
  config.views.forEach(rel=>{
    const b=document.createElement("button");
    b.type="button"; b.textContent=rel[1];
    b.addEventListener("click",()=>viewer?.lookAt(rel[3],rel[2],rel[4],reduced.matches?0:560));
    directions.append(b);
  });
  syncPlan(room);
  loading.hidden=false;
  loading.textContent="Abrindo vista…";
  function ready() {
    if (generation !== ticket) return;
    loading.hidden=true;
    updateHeading();
    document.querySelector("#turn").disabled=false;
  }
  function fallback() {
    if (generation !== ticket) return;
    if (viewer) viewer.destroy();
    viewer=window.G13PlanoB(mount,src,angles,ready,()=>{
      loading.hidden=false;
      loading.textContent="Não foi possível carregar este panorama.";
    });
  }
  document.querySelector("#turn").disabled=true;
  if (!window.pannellum) { fallback(); return; }
  try {
    viewer=window.pannellum.viewer(mount,{
      type:"equirectangular", panorama:src, autoLoad:true, ...angles, hotSpots:portalLinks(room),
      minHfov:50,maxHfov:106, showFullscreenCtrl:false, showZoomCtrl:true,
      keyboardZoom:true, mouseZoom:true, showControls:true, orientationOnByDefault:false,
      strings:{loadingLabel:"Abrindo vista…",zoomIn:"Aproximar",zoomOut:"Afastar"}
    });
    viewer.on("load",ready);
    // Allow the GPU viewer to finish its error event before switching renderers.
    viewer.on("error",()=>queueMicrotask(fallback));
  } catch { fallback(); }
}
function closeTour() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
  stop();
  activeRoom="";
  document.body.classList.remove("visiting");
  if (dialog.open) dialog.close();
  if (focusOrigin?.isConnected) focusOrigin.focus({preventScroll:true});
}
function syncRoute() {
  const [room,direction] = location.hash.slice(1).split("/");
  if (!Object.hasOwn(cameras,room)) {if (dialog.open) closeTour();return;}
  if (!dialog.open) {
    focusOrigin=document.activeElement;
    document.body.classList.add("visiting");
    dialog.showModal();
    document.querySelector(".close").focus({preventScroll:true});
  }
  const rel=cameras[room].views.find(v=>v[0]===direction);
  const camera=rel?{yaw:rel[2],pitch:rel[3],hfov:rel[4]}:null;
  if(room!==activeRoom) openCamera(room,camera);
  else if(camera) viewer?.lookAt(camera.pitch,camera.yaw,camera.hfov,reduced.matches?0:500);
}
function leave() {
  history.replaceState(null,"",location.pathname+location.search+returnHash);
  closeTour();
  if (!focusOrigin || focusOrigin===document.body) document.querySelector("#vistas").scrollIntoView({behavior:"instant"});
}
document.addEventListener("click",ev=>{
  const a=ev.target.closest("a[href^='#']");
  if (!a || !Object.hasOwn(cameras,a.hash.slice(1).split("/")[0])) return;
  if (!dialog.open) returnHash=location.hash || "";
});
dialog.querySelector(".close").addEventListener("click",leave);
dialog.addEventListener("cancel",e=>{e.preventDefault();leave();});
dialog.addEventListener("click",e=>{if(e.target===dialog)leave();});
window.addEventListener("hashchange",syncRoute);
document.querySelector("#turn").addEventListener("click",()=>viewer?.setYaw(viewer.getYaw()+180,reduced.matches?0:650));
const full=document.querySelector("#full");
const shell=document.querySelector(".viewer-shell");
full.addEventListener("click",async()=>{
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else if(shell.requestFullscreen && document.fullscreenEnabled)await shell.requestFullscreen();
    else shell.classList.toggle("theater");
  }catch{shell.classList.toggle("theater");}
  syncFullscreen();
});
function syncFullscreen(){const on=!!document.fullscreenElement||shell.classList.contains("theater");full.textContent=on?"Sair da tela cheia":"Tela cheia";full.setAttribute("aria-pressed",String(on));viewer?.resize();}
document.addEventListener("fullscreenchange",syncFullscreen);
dialog.addEventListener("close",()=>{shell.classList.remove("theater");syncFullscreen();});
initPlan();
syncRoute();


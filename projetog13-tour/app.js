"use strict";
const steps = [
  ["Garagem", "Acesso pela porta de vidro da sala.", "sala-garagem", "Olhar da sala para a garagem em 360°"],
  ["Sala de entrada", "A vista atravessa o jantar e chega à piscina.", "sala-piscina", "Explorar a sala em 360°"],
  ["Cozinha", "Da ilha de São Gabriel ao deck.", "cozinha", "Explorar a cozinha em 360°"],
  ["Deck da piscina", "A borda de vidro se abre para a mata.", "deck", "Explorar o deck em 360°"]
];
const cameras = {
  "cozinha": {label:"Cozinha", pitch:-4, views:[["piscina","Ver a piscina",0,-5,80],["garagem","Olhar para a garagem",161,-4,68],["jardim","Jardim de inverno",-90,-2,77]]},
  "sala-garagem": {label:"Estar · vista para a garagem", pitch:-4, views:[["garagem","Olhar para a garagem",4,-4,77],["piscina","Olhar para a piscina",-148,-3,64]]},
  "sala-piscina": {label:"Sala de entrada", pitch:-4, views:[["piscina","Olhar para a piscina",0,-2,68],["garagem","Olhar para a garagem",155,-3,80]]},
  "deck": {label:"Deck da piscina", pitch:-17, views:[["piscina","Ver a borda",12,-16,84],["cozinha","Olhar para dentro",-119,-3,80],["quarto","Ver o quarto",-43,-5,64]]}
};
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

const dialog = document.querySelector("#tour");
const mount = document.querySelector("#sphere");
const loading = document.querySelector("#loading");
const modeButtons = [...dialog.querySelectorAll("[data-mode]")];
let activeRoom = "", activeMode = "photo", viewer = null, generation = 0;
let returnHash = "#vistas", focusOrigin = null;

function pose() {
  return viewer ? { yaw:viewer.getYaw(), pitch:viewer.getPitch(), hfov:viewer.getHfov() } : null;
}
function stop() {
  generation++;
  if (viewer) { viewer.destroy(); viewer = null; }
  mount.replaceChildren();
}
function openCamera(room, mode, target) {
  stop();
  const ticket = generation;
  activeRoom = room;
  activeMode = mode;
  const config = cameras[room];
  const angles = target || {yaw:0, pitch:config.pitch, hfov:82};
  const src = "assets/"+room+(mode==="model"?"-modelo":"")+".jpg";
  dialog.querySelector("#room-title").textContent=config.label;
  mount.style.backgroundImage="url('assets/"+room+"-capa.jpg')";
  modeButtons.forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode === mode)));
  dialog.querySelectorAll(".scene-nav a").forEach(a=>a.hash==="#"+room ? a.setAttribute("aria-current","location") : a.removeAttribute("aria-current"));
  const directions = document.querySelector("#sightlines");
  directions.replaceChildren();
  config.views.forEach(rel=>{
    const b=document.createElement("button");
    b.type="button"; b.textContent=rel[1];
    b.addEventListener("click",()=>viewer?.lookAt(rel[3],rel[2],rel[4],reduced.matches?0:560));
    directions.append(b);
  });
  loading.hidden=false;
  loading.textContent="Abrindo vista…";
  function ready() {
    if (generation !== ticket) return;
    loading.hidden=true;
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
      type:"equirectangular", panorama:src, autoLoad:true, ...angles,
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
  if(room!==activeRoom) openCamera(room,activeMode,camera);
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
modeButtons.forEach(b=>b.addEventListener("click",()=>{
  if(activeMode!==b.dataset.mode && activeRoom) openCamera(activeRoom,b.dataset.mode,pose());
}));
document.querySelector("#turn").addEventListener("click",()=>viewer?.setYaw(viewer.getYaw()+180,reduced.matches?0:650));
const full=document.querySelector("#full");
const shell=document.querySelector(".viewer-shell");
if (!shell.requestFullscreen || !document.fullscreenEnabled) full.hidden=true;
else {
  full.addEventListener("click",async()=>{
    try { if(document.fullscreenElement) await document.exitFullscreen(); else await shell.requestFullscreen(); }
    catch { full.hidden=true; }
  });
  document.addEventListener("fullscreenchange",()=>{full.textContent=document.fullscreenElement?"Sair da tela cheia":"Tela cheia";viewer?.resize();});
}
syncRoute();


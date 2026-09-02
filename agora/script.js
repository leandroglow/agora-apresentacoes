const header=document.querySelector("[data-header]");
const menu=document.querySelector(".menu-toggle");
const nav=document.querySelector("#main-nav");
const progress=document.querySelector(".scroll-progress span");
const shareButton=document.querySelector("[data-share]");
const shareMessage=document.querySelector("[data-share-message]");
const setHeader=()=>header.classList.toggle("scrolled",scrollY>30);
const setProgress=()=>{const max=document.documentElement.scrollHeight-innerHeight;progress.style.width=(max?scrollY/max*100:0)+"%"};
addEventListener("scroll",()=>{setHeader();setProgress()},{passive:true});
setHeader();setProgress();
menu.addEventListener("click",()=>{const open=menu.getAttribute("aria-expanded")==="true";menu.setAttribute("aria-expanded",String(!open));header.classList.toggle("open",!open);document.body.classList.toggle("menu-open",!open)});
nav.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{menu.setAttribute("aria-expanded","false");header.classList.remove("open");document.body.classList.remove("menu-open")}));
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("visible");observer.unobserve(entry.target)}}),{threshold:.12});
document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));
document.querySelector("[data-year]").textContent=new Date().getFullYear();
function notify(text){shareMessage.textContent=text;shareMessage.classList.add("show");setTimeout(()=>shareMessage.classList.remove("show"),2600)}
shareButton.addEventListener("click",async()=>{const data={title:"Ágora Construtora",text:"Conheça os projetos e obras da Ágora Construtora.",url:location.href};try{if(navigator.share){await navigator.share(data)}else{await navigator.clipboard.writeText(location.href);notify("Link copiado")}}catch(error){if(error.name!=="AbortError"){notify("Copie o endereço do navegador")}}});
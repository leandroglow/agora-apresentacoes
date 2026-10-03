'use strict';
// Navigation never sends device commands. The same live controls stay mounted.
window.AgoraShell = (() => {
  const tabs=[...document.querySelectorAll('.app-tab')];
  const views=[...document.querySelectorAll('.app-view')];
  const track=document.getElementById('viewTrack');
  const viewport=document.getElementById('viewViewport');
  const nav=document.querySelector('.app-tabs');
  const compact=matchMedia('(max-width: 760px)');
  let current=0, start=null;
  function select(index, focus=false) {
    index=Math.max(0,Math.min(tabs.length-1,index));
    if(index!==current && current===1)window.AgoraCameras?.pause();
    current=index;
    track.style.transform=`translateX(-${index*100}%)`;
    tabs.forEach((tab,i)=>{
      tab.classList.toggle('active',i===index);
      tab.setAttribute('aria-selected',String(i===index));
      tab.tabIndex=i===index?0:-1;
      views[i].inert=i!==index;
      views[i].setAttribute('aria-hidden',String(i!==index));
    });
    document.querySelectorAll('.page-indicator span').forEach((dot,i)=>dot.classList.toggle('active',i===index));
    if(focus)tabs[index].focus();
  }
  tabs.forEach((tab,i)=>tab.addEventListener('click',()=>select(i)));
  nav.addEventListener('keydown',event=>{
    const next=['ArrowRight','ArrowDown'].includes(event.key);
    const prev=['ArrowLeft','ArrowUp'].includes(event.key);
    if(next||prev){event.preventDefault();select((current+(next?1:-1)+tabs.length)%tabs.length,true);}
    if(event.key==='Home'||event.key==='End'){event.preventDefault();select(event.key==='Home'?0:tabs.length-1,true);}
  });
  const interactive='button,a,input,select,textarea,video,summary,dialog,.filter-list,.resource-form';
  viewport.addEventListener('pointerdown',event=>{
    start=null;
    // Leave sliders, tab scrolling, controls and browser edge gestures alone.
    if(event.pointerType!=='touch'||event.target.closest(interactive)||event.clientX<24||event.clientX>innerWidth-24)return;
    start={x:event.clientX,y:event.clientY,time:Date.now(),id:event.pointerId};
  });
  viewport.addEventListener('pointerup',event=>{
    if(!start||start.id!==event.pointerId)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y,elapsed=Date.now()-start.time;
    start=null;
    if(elapsed<900&&Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.6)select(current+(dx<0?1:-1));
  });
  viewport.addEventListener('pointercancel',()=>start=null);
  function orientation(){nav.setAttribute('aria-orientation',compact.matches?'horizontal':'vertical');}
  compact.addEventListener('change',orientation);orientation();
  document.querySelector('.skip-link').addEventListener('click',()=>select(0));
  select(0);
  return {select};
})();

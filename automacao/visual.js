'use strict';
(() => {
  const stage = document.getElementById('architectureStage');
  const model = document.getElementById('houseModel');
  const button = document.getElementById('motionButton');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduce.matches;
  let frame;
  function reset() { if (model) { model.style.setProperty('--rx','0deg'); model.style.setProperty('--ry','0deg'); } }
  function state() {
    if (!button) return;
    button.textContent = paused ? 'Ativar movimento' : 'Pausar movimento';
    button.setAttribute('aria-pressed', String(paused));
    stage.classList.toggle('motion-paused', paused);
    if (paused) reset();
  }
  if (stage && model && button) {
    state();
    button.addEventListener('click', () => { paused = !paused; state(); });
    reduce.addEventListener('change', event => { paused = event.matches; state(); });
    stage.addEventListener('pointermove', event => {
      if (paused || event.pointerType !== 'mouse') return;
      cancelAnimationFrame(frame);
      const box = stage.getBoundingClientRect();
      frame = requestAnimationFrame(() => {
        model.style.setProperty('--rx', ((.5 - (event.clientY-box.top)/box.height)*2.4).toFixed(2)+'deg');
        model.style.setProperty('--ry', (((event.clientX-box.left)/box.width-.5)*3.6).toFixed(2)+'deg');
      });
    });
    stage.addEventListener('pointerleave', () => { cancelAnimationFrame(frame); reset(); });
  }
  function tick() {
    const clock = document.getElementById('clock');
    if (!clock) return;
    const now = new Date();
    clock.textContent = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    document.getElementById('calendar').textContent = now.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  }
  tick(); if (document.getElementById('clock')) setInterval(tick,30000);
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog || dialog.dataset.busy) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close();
  }));
})();


/* Stable touch interface, preserving normal scrolling. */
(() => {
  const touch = matchMedia('(pointer: coarse)');
  for (const name of ['gesturestart','gesturechange']) {
    document.addEventListener(name, event => { if (touch.matches && event.cancelable) event.preventDefault(); }, {passive:false});
  }
  document.addEventListener('touchmove', event => {
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  }, {passive:false});
  document.addEventListener('dblclick', event => {
    if (touch.matches && !event.target.closest('input,textarea') && event.cancelable) event.preventDefault();
  }, {passive:false});
})();


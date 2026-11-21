(() => {
  'use strict';
  const points = {
    entrada: ['Entrada', 'Do lado de dentro do portão, em diagonal para o atendimento.', 94],
    cafe: ['Café e caixa', 'Junto à mesa do café. A vista começa no caixa e na vitrine.', 88],
    estoque: ['Estoque', 'No corredor central, entre as fileiras de porta-paletes.', 85],
    mezanino: ['Mezanino', 'Escritório e copa no pavimento superior. Gire para ver a mesa de reunião e as estações gerenciais.', 94]
  };
  const $ = id => document.getElementById(id);
  const mount = $('panorama'), stage = $('stage');
  let viewer = null, generation = 0, active = 'entrada', mode = 'ambientado';
  const probe = document.createElement('canvas').getContext('webgl');
  const hasGL = Boolean(probe);
  if (probe) probe.getExtension('WEBGL_lose_context')?.loseContext();
  function dispose() {
    if (viewer) { viewer.destroy(); viewer = null; }
    mount.replaceChildren();
    mount.className = '';
  }
  function load(key, keepView=false) {
    const orientation = keepView && viewer ? [viewer.getPitch(),viewer.getYaw(),viewer.getHfov()] : null;
    const current = ++generation;
    active = key;
    const [label, caption, hfov] = points[key];
    const imageName = key === 'mezanino' ? 'mezanino-r08' : key;
    const src = 'assets/' + imageName + (mode==='ambientado' ? '-ambientado' : '') + '.jpg';
    const start = orientation || [0,0,hfov];
    dispose();
    $('title').textContent = label;
    $('caption').textContent = caption;
    $('vistas-mezanino').hidden = key !== 'mezanino';
    $('save').href = $('original').href = src;
    $('save').download = 'Agora-Materiais-360-' + key + '-' + mode + '.jpg';
    document.querySelectorAll('[data-s]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === key)));
    $('fallback').hidden = true;
    stage.dataset.ready = 'false';
    const ready = () => { if (current === generation) stage.dataset.ready = 'true'; };
    function compat() {
      if (current !== generation) return;
      dispose();
      if (!window.G13PlanoB) { $('fallback').hidden = false; return; }
      stage.dataset.renderer = 'canvas';
      try { viewer = window.G13PlanoB(mount, src, { yaw:start[1], pitch:start[0], hfov:start[2] }, ready, () => { if (current === generation) $('fallback').hidden = false; }); }
      catch { $('fallback').hidden = false; }
    }
    if (!window.pannellum) { compat(); return; }
    const withGL = hasGL;
    if (!withGL) { compat(); return; }
    try {
      stage.dataset.renderer = 'webgl';
      viewer = pannellum.viewer(mount, { type:'equirectangular', panorama:src, yaw:start[1], pitch:start[0], hfov:start[2], minHfov:45, maxHfov:115, autoLoad:true, showControls:false, keyboardZoom:true, mouseZoom:'fullscreenonly', compass:false, friction:.18, strings:{loadingLabel:'Carregando panorama…'} });
      viewer.on('load', ready);
      viewer.on('error', () => setTimeout(compat,0));
    } catch { compat(); }
  }
  Object.defineProperty(window,'lojaTour',{ get:() => ({ scene:active, mode, yaw:viewer?.getYaw(), pitch:viewer?.getPitch(), hfov:viewer?.getHfov() }) });
  document.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { if (active !== b.dataset.s) load(b.dataset.s); });
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    if (mode===b.dataset.mode) return;
    mode=b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed',String(x===b)));
    load(active,true);
  });
  $('reset').onclick = () => viewer?.lookAt(0,0,points[active][2],300);
  function updateFullscreen() {
    const isFull = !!document.fullscreenElement || stage.classList.contains('full');
    $('full').setAttribute('aria-label',isFull ? 'Sair da tela cheia' : 'Tela cheia');
    window.setTimeout(() => viewer?.resize(),60);
  }
  $('full').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.requestFullscreen && !stage.classList.contains('full')) await stage.requestFullscreen();
      else stage.classList.toggle('full');
    } catch { stage.classList.toggle('full'); }
    updateFullscreen();
  };
  document.addEventListener('fullscreenchange',updateFullscreen);
  window.addEventListener('keydown',event => { if (event.key === 'Escape' && stage.classList.contains('full')) {stage.classList.remove('full');updateFullscreen();} });
  const box = $('box');
  document.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
    $('bi').src=b.querySelector('img').src; $('bi').alt=$('photoTitle').textContent=b.querySelector('img').alt;
    box.showModal();
  });
  $('close').onclick = () => box.close();
  box.onclick = event => { if(event.target === box) box.close(); };
  const requested = new URLSearchParams(location.search).get('ambiente');
  load(Object.hasOwn(points, requested) ? requested : 'entrada');
})();

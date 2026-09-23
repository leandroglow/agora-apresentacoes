/* Residência contemporânea / Ágora — tour 360°. Pannellum license: vendor/LICENSE-PANNELLUM.txt */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const data = window.TOUR_DATA;
  const order = ['garagem', 'sala', 'gourmet', 'suite'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compact = matchMedia('(max-width: 760px), (max-height: 550px)');
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  let viewer, active = order.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'garagem';
  let busy = true, spinning = false, toastTimer, loadTimeout;
  const loading = $('loading');
  const setMap = open => {
    $('map-panel').hidden = !open;
    $('map-toggle').setAttribute('aria-expanded', String(open));
  };
  setMap(!compact.matches);
  compact.addEventListener('change', () => setMap(!compact.matches));
  $('map-toggle').addEventListener('click', () => setMap($('map-panel').hidden));
  $('map-close').addEventListener('click', () => { setMap(false); $('map-toggle').focus(); });
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
  }
  function stopRotation() {
    spinning = false;
    viewer?.stopAutoRotate();
    $('rotate').setAttribute('aria-pressed', 'false');
    $('rotate').setAttribute('aria-label', 'Girar automaticamente');
    $('rotate').title = 'Girar automaticamente';
    $('rotate').innerHTML = icon('rotate');
  }
  function startLoading(id) {
    busy = true;
    loading.hidden = false;
    $('error-panel').hidden = true;
    $('loading-label').textContent = `Abrindo ${data[id].loadingName}…`;
    $('panorama').setAttribute('aria-busy', 'true');
    clearTimeout(loadTimeout);
    loadTimeout = setTimeout(() => showError('Tempo de carregamento excedido.'), 40000);
  }
  function showError(message) {
    busy = false; loading.hidden = true; clearTimeout(loadTimeout);
    $('error-panel').hidden = false;
    $('panorama').setAttribute('aria-busy', 'false');
    console.error('Tour panorama:', message);
  }
  function syncScene(id) {
    active = id;
    $('scene-title').textContent = data[id].title;
    $('scene-subtitle').textContent = data[id].subtitle;
    $('scene-count').textContent = `${String(order.indexOf(id) + 1).padStart(2, '0')} / 04`;
    $('map-current-name').textContent = data[id].title;
    document.title = `${data[id].title} · Residência contemporânea | Ágora Construtora`;
    document.querySelectorAll('[data-scene]').forEach(node => {
      const selected = node.dataset.scene === id;
      node.classList.toggle('active', selected);
      if (selected) node.setAttribute('aria-current', 'location');
      else node.removeAttribute('aria-current');
    });
    const selectedCard = document.querySelector(`.room-card[data-scene="${id}"]`);
    const list = $('room-list');
    if (list.scrollWidth > list.clientWidth + 2) list.scrollTo({left: selectedCard.offsetLeft - list.offsetLeft - 20, behavior: reduced ? 'instant' : 'smooth'});
  }
  function updateHash(id, push) {
    try { history[push ? 'pushState' : 'replaceState'](null, '', `#${id}`); }
    catch (_) { if (location.hash !== `#${id}`) location.hash = id; }
  }
  function goScene(id, push = true) {
    if (!data[id] || busy || id === active) return;
    stopRotation();
    startLoading(id);
    if (compact.matches) setMap(false);
    updateHash(id, push);
    viewer.loadScene(id, initialPitch(id), data[id].yaw, defaultFov());
  }
  function isPortrait() { return innerWidth < 761 && innerHeight > innerWidth; }
  function defaultFov() { return isPortrait() ? 58 : 96; }
  function initialPitch(id) { return isPortrait() ? -7 : data[id].pitch; }
  function createHotspot(el, args) {
    const destination = data[args.to];
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `Ir para ${destination.title}${args.via ? ', ' + args.via : ''}`);
    el.innerHTML = `<span class="hotspot-arrow">${icon('arrow')}</span><span class="hotspot-label">${destination.title}${args.via ? `<small>${args.via}</small>` : ''}</span>`;
    const activate = event => { event.preventDefault(); event.stopPropagation(); goScene(args.to); };
    el.addEventListener('click', activate);
    el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') activate(event); });
  }
  const scenes = {};
  for (const [index, id] of order.entries()) {
    const s = data[id];
    const card = document.createElement('button');
    card.className = 'room-card'; card.dataset.scene = id;
    card.setAttribute('aria-label', `Visitar ${s.title}`);
    card.innerHTML = `<img src="${s.thumbnail}" alt="" draggable="false"><span class="room-number">${String(index+1).padStart(2,'0')}</span><span class="room-active">VOCÊ ESTÁ AQUI</span><span class="room-card-title">${s.title}<span class="room-arrow" aria-hidden="true">↗</span></span>`;
    card.addEventListener('click', () => goScene(id));
    $('room-list').append(card);
    scenes[id] = {
      type: 'equirectangular', panorama: s.panorama, yaw: s.yaw, pitch: initialPitch(id),
      hfov: defaultFov(), hotSpots: s.links.map(link => ({
        pitch: link.pitch, yaw: link.yaw, cssClass: 'tour-hotspot',
        createTooltipFunc: createHotspot, createTooltipArgs: link
      }))
    };
  }
  document.querySelectorAll('.map-point').forEach(node => {
    const activate = () => goScene(node.dataset.scene);
    node.addEventListener('click', activate);
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    });
  });
  $('reload').addEventListener('click', () => location.reload());
  if (!window.pannellum) { showError('Visualizador indisponível.'); return; }
  startLoading(active);
  syncScene(active);
  updateHash(active, false);
  try {
    viewer = pannellum.viewer('panorama', {
      default: {
        firstScene: active, autoLoad: true, showControls: false, showFullscreenCtrl: false,
        compass: false, minHfov: 45, maxHfov: 115, hfov: defaultFov(),
        sceneFadeDuration: reduced ? 0 : 500, ignoreGPanoXMP: true,
        mouseZoom: true, keyboardZoom: true, escapeHTML: true,
        backgroundColor: [0.14, 0.21, 0.17],
        strings: {
          loadingLabel: 'Abrindo ambiente…', genericWebGLError: 'O navegador não conseguiu iniciar a visão 360°.',
          noWebGLError: 'Este navegador não oferece suporte à visão 360°.',
          fileAccessError: 'Não foi possível abrir a imagem. Confira os arquivos do tour.',
          textureSizeError: 'O dispositivo não conseguiu carregar a imagem em alta resolução.'
        }
      }, scenes
    });
  } catch (error) { showError(error.message); return; }
  viewer.on('scenechange', syncScene);
  viewer.on('load', () => {
    clearTimeout(loadTimeout); busy = false; loading.hidden = true; $('error-panel').hidden = true;
    $('panorama').setAttribute('aria-busy', 'false');
    syncScene(viewer.getScene());
    $('announcement').textContent = `${data[active].title}. Panorama carregado. Arraste para explorar em 360 graus.`;
  });
  viewer.on('error', showError);
  viewer.on('mousedown', stopRotation);
  viewer.on('touchstart', stopRotation);
  $('panorama').addEventListener('wheel', stopRotation, {passive:true});
  $('panorama').addEventListener('keydown', event => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(event.key)) stopRotation();
  });
  const changeZoom = value => { if (busy) return; stopRotation(); viewer.setHfov(Math.max(45, Math.min(115, viewer.getHfov() + value)), reduced ? false : 220); };
  $('zoom-in').addEventListener('click', () => changeZoom(-10));
  $('zoom-out').addEventListener('click', () => changeZoom(10));
  $('rotate').addEventListener('click', () => {
    if (busy) return;
    if (spinning) { stopRotation(); return; }
    spinning = true;
    viewer.startAutoRotate(-3, 0);
    $('rotate').setAttribute('aria-pressed', 'true');
    $('rotate').setAttribute('aria-label', 'Pausar rotação'); $('rotate').title = 'Pausar rotação';
    $('rotate').innerHTML = icon('pause');
  });
  $('reset-view').addEventListener('click', () => {
    if (busy) return; stopRotation(); viewer.lookAt(initialPitch(active), data[active].yaw, defaultFov(), reduced ? false : 650);
  });
  const shell = $('tour');
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
      } else if (shell.requestFullscreen) await shell.requestFullscreen();
      else if (shell.webkitRequestFullscreen) shell.webkitRequestFullscreen();
      else toast('Para ampliar, gire o celular na horizontal ou abra o tour em uma nova aba.');
    } catch (_) { toast('O navegador não liberou a tela cheia. Abra o tour em uma nova aba.'); }
  });
  document.addEventListener('fullscreenchange', () => {
    const full = Boolean(document.fullscreenElement);
    $('fullscreen').setAttribute('aria-label', full ? 'Sair da tela cheia' : 'Tela cheia');
    $('fullscreen').title = full ? 'Sair da tela cheia' : 'Tela cheia'; viewer.resize();
  });
  const help = $('help-dialog');
  $('help-open').addEventListener('click', () => { stopRotation(); help.showModal(); });
  $('help-close').addEventListener('click', () => help.close());
  $('help-start').addEventListener('click', () => help.close());
  help.addEventListener('click', event => {
    const rect = help.getBoundingClientRect();
    if (event.target === help && (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)) help.close();
  });
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); goScene('garagem'); });
  addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (order.includes(id)) goScene(id, false);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopRotation(); });
  // Camera heading is derived from the stored Blender camera target, in degrees clockwise on the plan.
  let previousAngle = null, previousScene = null;
  function updateCone() {
    if (!document.hidden && !$('map-panel').hidden && !busy && viewer.isLoaded()) {
      const angle = Math.round((data[active].heading + viewer.getYaw()) * 10) / 10;
      if (angle !== previousAngle || previousScene !== active) {
        const [x,y] = data[active].map;
        $('view-cone').setAttribute('transform', `translate(${x} ${y}) rotate(${angle})`);
        previousAngle = angle; previousScene = active;
      }
    }
    requestAnimationFrame(updateCone);
  }
  requestAnimationFrame(updateCone);
  // Read-only state facilitates local verification and future maintenance.
  window.agoraTour = {
    getState: () => ({scene: active, loaded: !busy && viewer.isLoaded(), yaw: viewer.getYaw(), pitch: viewer.getPitch(), hfov: viewer.getHfov(), mapOpen: !$('map-panel').hidden, rotating: spinning}),
    version: '1.0'
  };
})();

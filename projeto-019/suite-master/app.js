(() => {
  'use strict';

  const revision = '06';
  const pixelSize = 4096;
  const byId = id => document.getElementById(id);
  const panorama = byId('panorama');
  const scenes = ['p1', 'p2', 'p3', 'p4'];
  const asset = url => url + '?v=' + revision;
  const radians = angle => angle * Math.PI / 180;
  const degrees = angle => angle * 180 / Math.PI;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  let config, viewer, current;

  function lens() {
    const w = Math.max(1, panorama.clientWidth);
    const h = Math.max(1, panorama.clientHeight);
    const horizontal = vertical => degrees(2 * Math.atan(Math.tan(radians(vertical / 2)) * w / h));
    const max = Math.min(78, horizontal(78));
    const physicalWidth = viewer?.getRenderer()?.getCanvas()?.width || w * (window.devicePixelRatio || 1);
    const min = Math.min(max - 4, Math.max(24, degrees(2 * Math.atan(physicalWidth / (1.55 * pixelSize)))));
    const normal = w / h >= 1 ? Math.min(64, horizontal(45)) : horizontal(64);
    return {min, max, normal: clamp(normal, min, max)};
  }

  function resize() {
    if (!viewer?.isLoaded()) return;
    viewer.resize();
    const {min, max} = lens();
    viewer.setHfovBounds([min, max]);
    viewer.setHfov(clamp(viewer.getHfov(), min, max));
  }

  function sync() {
    const view = config.views[current];
    byId('scene-label').textContent = view.title;
    document.querySelectorAll('[data-scene]').forEach(button =>
      button.setAttribute('aria-selected', String(button.dataset.scene === current)));
    for (const key of ['nicho', 'vaso']) byId(key).hidden = !view[key];
  }

  function openImage(title, src) {
    byId('modal-title').textContent = title;
    byId('modal-image').alt = title;
    byId('modal-image').src = asset(src);
    byId('image-modal').showModal();
  }

  function selectScene(id) {
    const view = config.views[id];
    if (id === current) {
      viewer.lookAt(view.pitch, view.yaw, lens().normal, 320);
    } else {
      viewer.loadScene(id, view.pitch, view.yaw, lens().normal);
    }
  }

  function decorateScene(id) {
    const view = config.views[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.scene = id;
    button.setAttribute('role', 'tab');
    const thumbnail = new Image();
    thumbnail.alt = '';
    thumbnail.src = asset(view.thumbnail);
    const label = document.createElement('span');
    label.textContent = view.title;
    button.append(thumbnail, label);
    button.onclick = () => selectScene(id);
    byId('scene-picker').append(button);

    const figure = document.createElement('figure');
    figure.tabIndex = 0;
    figure.setAttribute('role', 'button');
    figure.setAttribute('aria-label', 'Abrir ' + view.title);
    const photo = new Image();
    photo.loading = 'lazy';
    photo.alt = view.title;
    photo.src = asset(view.still);
    const caption = document.createElement('figcaption');
    caption.textContent = view.title;
    figure.append(photo, caption);
    figure.onclick = () => openImage(view.title, view.still);
    figure.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); figure.click();}
    };
    byId('gallery').append(figure);
  }

  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement || document.body.classList.contains('css-fullscreen'));
  function fullscreenChanged() {
    byId('fullscreen').textContent = isFull() ? 'Fechar tela cheia' : 'Tela cheia';
    requestAnimationFrame(resize);
  }
  function cssFull(enabled) {
    document.body.classList.toggle('css-fullscreen', enabled);
    fullscreenChanged();
  }
  async function fullscreen() {
    const el = document.querySelector('.viewer');
    if (document.body.classList.contains('css-fullscreen')) return cssFull(false);
    if (document.fullscreenElement) return document.exitFullscreen();
    if (document.webkitFullscreenElement) return document.webkitExitFullscreen();
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else cssFull(true);
    } catch {cssFull(true);}
  }

  async function start() {
    const response = await fetch(asset('views.json'), {cache:'no-store'});
    if (!response.ok) throw new Error('Não foi possível abrir as vistas.');
    config = await response.json();
    current = config.initial;
    const catalog = {};
    const {min, max, normal} = lens();
    for (const id of scenes) {
      const v = config.views[id];
      decorateScene(id);
      catalog[id] = {
        type:'multires', multiRes:{
          path:'assets/hd/' + id + '/%l/%s%y_%x', fallbackPath:'assets/hd/' + id + '/fallback/%s',
          extension:'jpg?v=' + revision, tileResolution:512, cubeResolution:pixelSize, maxLevel:4,
        },
        minHfov:min, maxHfov:max, multiResMinHfov:true, yaw:v.yaw, pitch:v.pitch, hfov:normal, autoLoad:true,
      };
    }
    viewer = pannellum.viewer('panorama', {default:{firstScene:current, showControls:false, showFullscreenCtrl:false,
      mouseZoom:true, keyboardZoom:true, multiResMinHfov:true, minHfov:min, maxHfov:max, hfov:normal, ignoreGPanoXMP:true}, scenes:catalog});
    viewer.on('scenechange', id => {current=id; sync();});
    viewer.on('load', () => {resize(); sync();});
    for (const [id, delta] of [['zoom-in',-7],['zoom-out',7]]) {
      byId(id).onclick = () => {
        const {min,max} = lens();
        viewer.setHfov(clamp(viewer.getHfov()+delta,min,max),220);
      };
    }
    byId('reset').onclick = () => selectScene(current);
    byId('fullscreen').onclick = fullscreen;
    for (const key of ['nicho', 'vaso']) byId(key).onclick = () => {
      const detail = config.views[current][key];
      if (detail) openImage(detail.label, detail.image);
    };
    for (const name of ['fullscreenchange','webkitfullscreenchange']) document.addEventListener(name, fullscreenChanged);
    new ResizeObserver(resize).observe(panorama);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.body.classList.contains('css-fullscreen')) cssFull(false);
    });
    byId('modal-close').onclick = () => byId('image-modal').close();
    byId('image-modal').onclick = event => {if (event.target === byId('image-modal')) byId('image-modal').close();};
    window.agoraSuite = {version:'v06', getState:() => ({view:current, loaded:viewer.isLoaded(), yaw:viewer.getYaw(),
      pitch:viewer.getPitch(), hfov:viewer.getHfov(), bounds:viewer.getHfovBounds()})};
    sync();
  }

  start().catch(error => {byId('status').classList.remove('sr-only'); byId('status').textContent = error.message;});
})();

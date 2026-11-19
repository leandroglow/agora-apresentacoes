(function () {
  'use strict';

  /**
   * Plano B sem WebGL.
   * @param {HTMLElement} mount
   * @param {string} src URL de uma imagem equiretangular 2:1
   * @param {{yaw?:number,pitch?:number,hfov?:number}} view
   * @param {Function} onload
   * @param {Function} onerror
   * @returns {{setYaw:Function,getYaw:Function,setPitch:Function,getPitch:Function,
   * setHfov:Function,getHfov:Function,lookAt:Function,destroy:Function,resize:Function}}
   */
  window.G13PlanoB = function G13PlanoB(mount, src, view, onload, onerror) {
    var config = view || {};
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d', { alpha: false });
    var image = new Image();
    var sourceCanvas = document.createElement('canvas');
    var sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    var sourcePixels;
    var sourceWidth = 0;
    var sourceHeight = 0;
    var yaw = Number(config.yaw || 0);
    var pitch = Number(config.pitch || 0);
    var hfov = Number(config.hfov || 80);
    var dragging = false;
    var pointerX = 0;
    var pointerY = 0;
    var raf = 0;
    var destroyed = false;
    var maxWidth = 640;
    var maxHeight = 420;

    mount.replaceChildren(canvas);
    canvas.className = 'g13-planob-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Panorama interativo em modo de compatibilidade');
    canvas.tabIndex = 0;

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function normalYaw(value) {
      value %= 360;
      return value < -180 ? value + 360 : value > 180 ? value - 360 : value;
    }

    function resize() {
      if (destroyed) return;
      var ratio = mount.clientWidth && mount.clientHeight
        ? mount.clientWidth / mount.clientHeight
        : 1.5;
      var width = Math.min(maxWidth, Math.max(240, mount.clientWidth || 480));
      var height = Math.min(maxHeight, Math.max(150, Math.round(width / ratio)));
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      render();
    }

    function render() {
      if (destroyed || !sourcePixels) return;
      var width = canvas.width;
      var height = canvas.height;
      var output = context.createImageData(width, height);
      var destination = output.data;
      var verticalScale = Math.tan((clamp(hfov, 35, 120) * Math.PI / 180) / 2) * width / height;
      var horizontalScale = Math.tan((clamp(hfov, 35, 120) * Math.PI / 180) / 2);
      var pitchRadians = clamp(pitch, -70, 70) * Math.PI / 180;
      var yawRadians = normalYaw(yaw) * Math.PI / 180;
      var cosPitch = Math.cos(pitchRadians), sinPitch = Math.sin(pitchRadians);
      var cosYaw = Math.cos(yawRadians), sinYaw = Math.sin(yawRadians);
      for (var py = 0; py < height; py += 1) {
        for (var px = 0; px < width; px += 1) {
          var rayX = (2 * px / width - 1) * horizontalScale;
          var rayY = (1 - 2 * py / height) * verticalScale;
          var rayZ = 1;
          var pitchY = rayY * cosPitch - rayZ * sinPitch;
          var pitchZ = rayY * sinPitch + rayZ * cosPitch;
          var rotatedX = rayX * cosYaw + pitchZ * sinYaw;
          var rotatedZ = -rayX * sinYaw + pitchZ * cosYaw;
          var longitude = Math.atan2(rotatedX, rotatedZ);
          var latitude = Math.asin(clamp(pitchY / Math.sqrt(rotatedX * rotatedX + pitchY * pitchY + rotatedZ * rotatedZ), -1, 1));
          var sourceX = Math.floor(((longitude / (2 * Math.PI)) + 0.5) * sourceWidth) % sourceWidth;
          var sourceY = clamp(Math.floor((0.5 - latitude / Math.PI) * sourceHeight), 0, sourceHeight - 1);
          var sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
          var destinationIndex = (py * width + px) * 4;
          destination[destinationIndex] = sourcePixels[sourceIndex];
          destination[destinationIndex + 1] = sourcePixels[sourceIndex + 1];
          destination[destinationIndex + 2] = sourcePixels[sourceIndex + 2];
          destination[destinationIndex + 3] = 255;
        }
      }
      context.putImageData(output, 0, 0);
      return;
    }

    function schedule() {
      if (!raf && !destroyed) raf = requestAnimationFrame(function () { raf = 0; render(); });
    }

    function setYaw(value) { yaw = normalYaw(Number(value) || 0); schedule(); }
    function getYaw() { return yaw; }
    function setPitch(value) { pitch = clamp(Number(value) || 0, -70, 70); schedule(); }
    function getPitch() { return pitch; }
    function setHfov(value) { hfov = clamp(Number(value) || 80, 35, 120); schedule(); }
    function getHfov() { return hfov; }
    function lookAt(nextPitch, nextYaw, nextHfov) {
      setPitch(nextPitch); setYaw(nextYaw); if (nextHfov != null) setHfov(nextHfov);
    }
    function destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      mount.replaceChildren();
    }

    canvas.addEventListener('pointerdown', function (event) {
      dragging = true; pointerX = event.clientX; pointerY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      setYaw(yaw - (event.clientX - pointerX) * 0.22);
      setPitch(pitch + (event.clientY - pointerY) * 0.16);
      pointerX = event.clientX; pointerY = event.clientY;
    });
    canvas.addEventListener('pointerup', function () { dragging = false; });
    canvas.addEventListener('pointercancel', function () { dragging = false; });
    canvas.addEventListener('wheel', function (event) {
      event.preventDefault(); setHfov(hfov + event.deltaY * 0.04);
    }, { passive: false });
    canvas.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') setYaw(yaw - 8);
      if (event.key === 'ArrowRight') setYaw(yaw + 8);
      if (event.key === 'ArrowUp') setPitch(pitch + 6);
      if (event.key === 'ArrowDown') setPitch(pitch - 6);
      if (event.key === '+' || event.key === '=') setHfov(hfov - 5);
      if (event.key === '-' || event.key === '_') setHfov(hfov + 5);
    });

    image.onload = function () {
      var ratio = Math.min(2048 / image.naturalWidth, 1);
      sourceWidth = Math.max(1, Math.round(image.naturalWidth * ratio));
      sourceHeight = Math.max(1, Math.round(image.naturalHeight * ratio));
      sourceCanvas.width = sourceWidth;
      sourceCanvas.height = sourceHeight;
      sourceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight);
      sourcePixels = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight).data;
      resize();
      if (onload) onload();
    };
    image.onerror = function (error) { if (onerror) onerror(error); };
    window.addEventListener('resize', resize);
    image.src = src;

    return { setYaw: setYaw, getYaw: getYaw, setPitch: setPitch, getPitch: getPitch,
      setHfov: setHfov, getHfov: getHfov, lookAt: lookAt, destroy: destroy, resize: resize };
  };
}());


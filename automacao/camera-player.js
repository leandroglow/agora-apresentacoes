'use strict';
// Camera inventory must come from the authenticated API, filtered by location.
window.AgoraCameras = (() => {
  let host, api, context = '', generation = 0;
  const timers = new Set();
  const players = new Set();
  function stop() {
    generation++;
    for(const player of players) player.stop();
    players.clear();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    if (!host) return;
    for (const video of host.querySelectorAll('video')) {
      video.pause(); video.removeAttribute('src'); video.load();
    }
    host.replaceChildren(); host.hidden = true;
  }
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  function render({authenticated, locationId, cameras = []}, callApi) {
    host ||= document.getElementById('cameras');
    if (!host) return;
    api = callApi;
    const visible = authenticated ? cameras.filter(c => c.locationId === locationId) : [];
    const next = JSON.stringify([authenticated, locationId, visible.map(c => [c.id, c.label])]);
    if (context === next) return;
    context = next; stop();
    if (!visible.length) return;
    host.hidden = false;
    host.append(node('h2', 'camera-section-title', 'Câmeras'));
    for (const camera of visible) {
      const card = node('article', 'camera-card');
      const heading = node('div', 'camera-heading');
      heading.append(node('h3', '', camera.label));
      const button = node('button', 'quiet', 'Ver câmera'); button.type = 'button';
      heading.append(button);
      const status = node('p', 'camera-status', 'Imagem disponível ao abrir.');
      status.setAttribute('role', 'status');
      const video = node('video', 'camera-video');
      video.controls = false; video.muted = true; video.playsInline = true;
      video.preload = 'none'; video.hidden = true;
      video.setAttribute('aria-label', 'Câmera ' + camera.label);
      let expiryTimer;
      const player = new window.AgoraLiveVideo(video,status);players.add(player);
      button.addEventListener('click', async () => {
        const epoch = generation;
        button.disabled = true; status.textContent = 'Conectando à câmera…';
        try {
          video.hidden = false;
          await player.start(async () => {
            const session=await api('camera-session',{cameraId:camera.id});
            if(epoch!==generation)throw new Error('Sessão encerrada.');
            const endpoint=new URL(session.url);
            if(endpoint.protocol!=='https:' || endpoint.username || endpoint.password) throw new Error('Transmissão indisponível.');
            return {url:endpoint.href,mime:session.mime};
          });
        } catch (error) {
          if (epoch === generation) status.textContent = error.message || 'Não foi possível conectar.';
        } finally { if (epoch === generation) button.disabled = false; }
      });
      const stopButton=node('button','quiet','Parar vídeo');stopButton.type='button';
      stopButton.addEventListener('click',()=>{player.stop();clearTimeout(expiryTimer);status.textContent='Vídeo parado.';});
      card.append(heading, video, status,stopButton); host.append(card);
    }
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){
    for(const player of players) {player.stop();player.status.textContent='Vídeo pausado. Toque em Ver câmera para continuar.';}
  }});
  return {render, stop};
})();

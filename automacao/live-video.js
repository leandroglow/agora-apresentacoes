'use strict';
// Bounded MSE player: no recording; stop() releases the camera connection.
window.AgoraLiveVideo = class {
  constructor(video, status) { this.video=video; this.status=status; this.epoch=0; }
  stop() {
    this.epoch++; this.abort?.abort(); clearInterval(this.watchdog); clearTimeout(this.retry);
    this.video.pause(); this.video.removeAttribute('src'); this.video.load();
    if(this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl=null;
  }
  async start(getSource) {
    this.stop(); this.getSource=getSource; this.failures=0;
    const epoch=this.epoch;
    this.connect(epoch);
  }
  async connect(epoch) {
    if(epoch!==this.epoch) return;
    let reader;
    try {
      if(!window.MediaSource) throw new Error('Este navegador não suporta este modo de vídeo ao vivo.');
      this.status.textContent='Conectando…'; this.abort=new AbortController();
      const source=await this.getSource();
      if(epoch!==this.epoch) return;
      const response=await fetch(source.url,{signal:this.abort.signal,cache:'no-store',credentials:'omit'});
      if(!response.ok || !response.body) throw new Error('A câmera não respondeu.');
      const mime=source.mime || 'video/mp4; codecs="avc1.4d0016"';
      if(!MediaSource.isTypeSupported(mime)) throw new Error('Codec de vídeo não suportado.');
      const media=new MediaSource();
      if(this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl=URL.createObjectURL(media); this.video.src=this.objectUrl;
      await new Promise(resolve=>media.addEventListener('sourceopen',resolve,{once:true}));
      if(epoch!==this.epoch) return;
      const buffer=media.addSourceBuffer(mime);
      const updated=()=>new Promise((resolve,reject)=>{
        const clean=()=>{buffer.removeEventListener('updateend',done);buffer.removeEventListener('error',fail);};
        const done=()=>{clean();resolve();};
        const fail=()=>{clean();reject(new Error('Falha no vídeo.'));};
        buffer.addEventListener('updateend',done,{once:true});
        buffer.addEventListener('error',fail,{once:true});
      });
      reader=response.body.getReader();
      let lastBytes=Date.now();
      this.watchdog=setInterval(()=>{if(Date.now()-lastBytes>15000)this.abort.abort();},3000);
      while(epoch===this.epoch) {
        const {done,value}=await reader.read();
        if(done) throw new Error('Conexão interrompida.');
        lastBytes=Date.now();
        const appended=updated(); buffer.appendBuffer(value); await appended;
        if(buffer.buffered.length) {
          const end=buffer.buffered.end(buffer.buffered.length-1);
          if(end-this.video.currentTime>5) this.video.currentTime=Math.max(buffer.buffered.start(0),end-1.5);
          const cutoff=this.video.currentTime-15;
          if(cutoff>buffer.buffered.start(0)+2) { const trimmed=updated();buffer.remove(0,cutoff);await trimmed; }
          if(this.video.paused) this.video.play().catch(()=>{});
          this.status.textContent='Ao vivo'; this.failures=0;
        }
      }
    } catch(error) {
      if(epoch!==this.epoch) return;
      this.status.textContent='Reconectando à câmera…';
      if(++this.failures>5) { this.status.textContent='Câmera indisponível. Toque em Ver câmera para tentar novamente.'; return; }
      this.retry=setTimeout(()=>this.connect(epoch),Math.min(15000,2000*this.failures));
    } finally {
      clearInterval(this.watchdog);
      reader?.cancel().catch(()=>{});
    }
  }
};

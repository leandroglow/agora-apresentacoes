/* Browser viewing reads authenticated Drive bytes; legacy export uses the CAD queue. */
(() => {
  'use strict';
  const base = (window.CATALOGOS_IA_API_BASE || 'https://agora-apresentacoes.vercel.app').replace(/\/$/, '');
  const dialog = document.createElement('dialog');
  dialog.id = 'cad-dialog';
  dialog.innerHTML = `<header><h2>Visualizador DWG</h2><button type="button" data-close aria-label="Fechar visualizador">Fechar ×</button></header>
    <div class="cad-body">
    <div class="cad-controls"><button type="button" data-source>Escolher arquivo no Drive</button><span data-source-name>Nenhum arquivo selecionado</span>
    <label>Ou arquivo do aparelho<input type="file" data-local accept=".dwg,.dxf"></label><span></span>
    <button type="button" data-open disabled>Abrir desenho</button><details class="cad-advanced"><summary>Converter e salvar uma cópia (opcional)</summary><div class="cad-controls"><button type="button" data-destination>Escolher pasta de destino</button><span data-destination-name>Nenhuma pasta selecionada</span>
    <label>Formato de saída <select data-format><option value="pdf">PDF para visualizar</option><option value="dxf">DXF</option><option value="dwg">DWG</option></select></label>
    <button type="button" data-convert disabled>Converter e salvar</button></div></details></div>
    <div data-picker hidden><h3 data-picker-title></h3><button type="button" data-back>Voltar</button><button type="button" data-select-folder hidden>Usar esta pasta</button><div data-list></div></div>
    <p data-status role="status" aria-live="polite"></p>
    <div data-result hidden><button type="button" data-preview>Visualizar PDF</button><button type="button" data-download>Baixar arquivo</button><button type="button" data-share>Compartilhar</button><a data-drive target="_blank" rel="noopener">Abrir no Drive</a></div>
    <p class="cad-note"><a href="cad-browser/THIRD-PARTY-NOTICES.txt" target="_blank" rel="noopener">Bibliotecas e licenças</a></p></div>
    <section data-native-panel hidden><button type="button" data-hide-native>Voltar aos arquivos</button><iframe title="Visualizador DWG" data-native-frame></iframe></section>
    <section data-preview-panel hidden><div class="cad-toolbar"><button type="button" data-minus aria-label="Diminuir zoom">−</button><span data-zoom>100%</span><button type="button" data-plus aria-label="Aumentar zoom">+</button><button type="button" data-fit>Enquadrar</button><button type="button" data-hide-preview>Fechar prévia</button></div><div class="cad-viewport"><div class="cad-pages"></div></div></section>`;
  document.body.append(dialog);
  const $ = s => dialog.querySelector(s);
  let source = null, destination = null, mode = 'source', stack = [], folder = null;
  let nativeEpoch=0,nativeAbort;
  let job = null, timer, epoch = 0, listing = 0, viewer, pdfDoc, pdfTask, resultBlob;
  try {const id=sessionStorage.getItem('agora-cad-job');if(id)job={id,status:'queued'};} catch {}
  const status = text => $('[data-status]').textContent = text;
  const message = err => err?.message || 'Não foi possível concluir a operação.';
  async function request(path, options = {}) {
    const token = await window.AgoraSistemaAuth?.token();
    if (!token) throw new Error('Entre no sistema para acessar os arquivos.');
    const response = await fetch(base + '/api/' + path, {...options, headers: {'Authorization': 'Bearer ' + token, ...(options.body ? {'Content-Type':'application/json'} : {}), ...options.headers}});
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(response.status===413&&path.startsWith('cad-jobs?action=source')?'Escolha um DWG ou DXF de até 25 MB.':data.error || 'O serviço não respondeu. Tente novamente.');
    }
    return response;
  }
  const json = async (path, options) => (await request(path, options)).json();
  function ready() { $('[data-open]').disabled = !source; $('[data-convert]').disabled = !source || !destination || (job && ['queued','processing'].includes(job.status)); }
  function closePreview() { epoch++; viewer?.clear(); pdfTask?.destroy(); pdfTask=null; pdfDoc?.destroy(); pdfDoc=null; $('[data-preview-panel]').hidden=true; }
  function close() { closeNative(); clearTimeout(timer); listing++; closePreview(); dialog.close(); }
  $('[data-close]').onclick=close;
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  document.getElementById('card-cad').onclick = () => { dialog.showModal(); };
  async function browse(next, push = false) {
    const revision=++listing;
    if(push) stack.push(folder);
    folder=next;
    $('[data-picker]').hidden=false;
    $('[data-picker-title]').textContent=mode==='source'?'Escolha um DWG ou DXF':'Escolha onde salvar';
    $('[data-select-folder]').hidden=mode!=='destination'||!folder;
    $('[data-back]').disabled=!stack.length;
    $('[data-list]').replaceChildren(); status('Carregando pastas…');
    try {
      const data=await json('cad-jobs?action=folders'+(folder?'&folder='+encodeURIComponent(folder.id):''));
      if(revision!==listing||!dialog.open)return;
      const entries=[...(data.folders||[]).map(x=>({...x,isFolder:true})), ...(mode==='source'?(data.files||[]).filter(x=>/\.(dwg|dxf)$/i.test(x.name)):[])];
      if(!entries.length) $('[data-list]').textContent='Nenhum arquivo compatível ou pasta neste local.';
      for(const item of entries) {
        const button=document.createElement('button'); button.type='button'; button.textContent=(item.isFolder?'📁 ':'')+item.name;
        button.onclick=()=>{if(item.isFolder)browse(item,true);else{source=item;$('[data-local]').value='';$('[data-source-name]').textContent=item.name;$('[data-picker]').hidden=true;status('');ready();}};
        $('[data-list]').append(button);
      }
      status('');
    } catch(err){if(revision===listing)status(message(err));}
  }
  $('[data-local]').onchange=event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>25*1024*1024||!/\.(dwg|dxf)$/i.test(file.name)){status('Escolha um DWG ou DXF de até 25 MB.');event.target.value='';source=null;ready();return;}source={name:file.name,fileName:file.name,localFile:file};$('[data-source-name]').textContent=file.name;status('');ready();};
  $('[data-source]').onclick=()=>{mode='source';stack=[];browse(null);};
  $('[data-destination]').onclick=()=>{mode='destination';stack=[];browse(null);};
  $('[data-back]').onclick=()=>browse(stack.pop()||null);
  $('[data-select-folder]').onclick=()=>{destination=folder;$('[data-destination-name]').textContent=folder.name;$('[data-picker]').hidden=true;status('');ready();};
  async function submit(preview=false) {
    if(!source||(!preview&&!destination))return;if(source.localFile&&source.localFile.size>2*1024*1024){status('Para exportar, use um arquivo do aparelho de até 2 MB ou um arquivo do Drive. A visualização aceita até 25 MB.');return;}
    $('[data-convert]').disabled=true; $('[data-open]').disabled=true; closePreview(); resultBlob=null; $('[data-result]').hidden=true; status('Enviando pedido…');
    try {if(source.localFile&&!source.fileBase64){const bytes=new Uint8Array(await source.localFile.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));source.fileBase64=btoa(text);}const data=await json('cad-jobs',{method:'POST',body:JSON.stringify({sourceId:source.id,fileName:source.fileName,fileBase64:source.fileBase64,preview,destinationId:destination?.id,format:$('[data-format]').value})});job=data.job||data;autoOpen=preview;ready();try{sessionStorage.setItem('agora-cad-job',job.id);}catch{} await poll();}
    catch(err){job=null;status(message(err));ready();}
  }
  function closeNative(){nativeEpoch++;nativeAbort?.abort();const old=$('[data-native-frame]');old.src='about:blank';$('[data-native-panel]').hidden=true;}
  $('[data-hide-native]').onclick=closeNative;
  async function openNative(){
    if(!source)return;const selectedSource=source;closeNative();closePreview();const revision=nativeEpoch;const controller=nativeAbort=new AbortController();
    $('[data-native-panel]').hidden=false;status('Carregando visualizador…');
    const frame=$('[data-native-frame]');
    const loaded=new Promise((resolve,reject)=>{frame.onload=()=>resolve();controller.signal.addEventListener('abort',()=>reject(new DOMException('Cancelado','AbortError')),{once:true});});
    frame.src='cad-browser/agora.html';
    let timeout;const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(Error('O desenho demorou para abrir. Tente novamente ou use um arquivo menor.'));},90000);});
    try{
      const loadBytes=async()=>{if(selectedSource.localFile)return selectedSource.localFile.arrayBuffer();const parts=[];let offset=0,total=0;do{const response=await request('cad-jobs?action=source&sourceId='+encodeURIComponent(selectedSource.id)+'&offset='+offset,{signal:controller.signal});const r=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range')||'');if(!r||Number(r[1])!==offset)throw Error('Resposta incompleta.');const b=await response.arrayBuffer();total=Number(r[3]);if(total>25*1024*1024||b.byteLength!==Number(r[2])-offset+1)throw Error('Desenho acima do limite ou incompleto.');parts.push(b);offset=Number(r[2])+1;}while(offset<total);return new Blob(parts).arrayBuffer();};
      const [bytes]=await Promise.race([Promise.all([loadBytes(),loaded]),deadline]);if(revision!==nativeEpoch||!dialog.open)return;
      await Promise.race([frame.contentWindow.agoraOpenCad(selectedSource.name,bytes),deadline]);if(revision===nativeEpoch)status('');
    }catch(err){if(revision===nativeEpoch&&err.name!=='AbortError')status(message(err));}finally{clearTimeout(timeout);}
  }
  $('[data-open]').onclick=openNative;
  $('[data-convert]').onclick=()=>submit(false);
  let autoOpen=false;
  async function poll() {
    clearTimeout(timer); if(!job||!dialog.open)return;
    const id=job.id;
    try {
      const data=await json('cad-jobs?id='+encodeURIComponent(id)); if(!dialog.open||job?.id!==id)return;
      job=data.job||data;
      if(job.status==='completed') {
        status('Desenho pronto para visualizar.'); $('[data-result]').hidden=false;
        $('[data-preview]').hidden=job.format!=='pdf';
        $('[data-drive]').href='https://drive.google.com/file/d/'+encodeURIComponent(job.outputId)+'/view'; ready(); if(autoOpen&&job.format==='pdf'){autoOpen=false;await $('[data-preview]').onclick();} return;
      }
      if(job.status==='failed'){status(job.error||'A conversão falhou. Você pode tentar novamente.');ready();return;}
      status(job.status==='processing'?'Convertendo no computador da Ágora…':'Na fila. O processamento começa quando o computador estiver disponível.');
    } catch(err){status(message(err)+' A consulta será repetida.');}
    timer=setTimeout(poll,6000);
  }
  async function blob() {
    if(!job?.outputId)throw new Error('O arquivo ainda não está disponível.');
    if(!resultBlob){
      const parts=[];let offset=0,total;
      do {
        const response=await request('cad-jobs?action=result&id='+encodeURIComponent(job.id)+'&offset='+offset);
        const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range')||'');
        if(!range||Number(range[1])!==offset)throw new Error('Download incompleto. Tente novamente.');
        const part=await response.blob();total=Number(range[3]);
        if(total>25*1024*1024||part.size!==Number(range[2])-offset+1)throw new Error('Resposta inválida.');
        parts.push(part);offset=Number(range[2])+1;
      }while(offset<total);
      resultBlob=new Blob(parts,{type:job.format==='pdf'?'application/pdf':'application/octet-stream'});
    }
    return resultBlob;
  }
  $('[data-preview]').onclick=async()=>{
    closePreview();const revision=epoch;status('Abrindo prévia…');
    try {
      const bytes=await (await blob()).arrayBuffer();if(revision!==epoch||!dialog.open)return;
      $('[data-preview-panel]').hidden=false;
      viewer ||= new window.AgoraPdfViewer($('.cad-viewport'),$('.cad-pages'),z=>$('[data-zoom]').textContent=Math.round(z*100)+'%',{maxZoom:16});
      const safePdf=await window.loadAgoraPdfJs(); if(revision!==epoch||!dialog.open)return;
      pdfTask=safePdf.getDocument({data:bytes,isEvalSupported:false}); const doc=await pdfTask.promise;
      if(revision!==epoch){doc.destroy();return;}pdfDoc=doc; await viewer.open(doc);$('[data-zoom]').textContent='100%';status('');
    }catch(err){if(revision===epoch)status(message(err));}
  };
  $('[data-hide-preview]').onclick=closePreview;
  $('[data-plus]').onclick=()=>viewer?.setZoom(viewer.z*1.25);
  $('[data-minus]').onclick=()=>viewer?.setZoom(viewer.z/1.25);
  $('[data-fit]').onclick=()=>viewer?.setZoom(1);
  $('[data-download]').onclick=async()=>{try{const url=URL.createObjectURL(await blob());const a=document.createElement('a');a.href=url;a.download=job.outputName||('desenho.'+job.format);a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(err){status(message(err));}};
  window.AgoraCadViewer={open(file){if(!file?.id||!/\.(dwg|dxf)$/i.test(file.name||''))return;source=file;$('[data-source-name]').textContent=file.name;if(!dialog.open)dialog.showModal();openNative();}};
  $('[data-share]').onclick=async()=>{try{const file=new File([await blob()],job.outputName||('desenho.'+job.format),{type:job.format==='pdf'?'application/pdf':'application/octet-stream'});if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:file.name});else status('Este navegador não compartilha arquivos. Use Baixar arquivo.');}catch(err){if(err.name!=='AbortError')status(message(err));}};
})();

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('document-dialog'), status = $('document-status');
  const sources = {
    executivo: {title:'Projeto executivo · REV00', url:'assets/executivo-rev00.pdf'},
    apresentacao: {title:'Apresentação do projeto', url:'assets/apresentacao.pdf'}
  };
  const viewer = new AgoraPdfViewer($('document-viewport'), $('document-stage'), z => {
    $('document-zoom').value = Math.round(z*100)+'%';
    $('document-minus').disabled=z<=.25; $('document-plus').disabled=z>=8;
  });
  let library, loading, pdf, generation=0;
  function loadLibrary() {
    return library ||= new Promise((resolve,reject) => {
      const script=document.createElement('script');
      script.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';resolve();};
      script.onerror=()=>{library=null;script.remove();reject(new Error('Não foi possível carregar o visualizador.'));};
      document.head.appendChild(script);
    });
  }
  async function open(key) {
    if(!sources[key])return;
    const current=++generation;
    viewer.clear(); loading?.destroy(); pdf?.destroy(); pdf=null;
    if(!dialog.open)dialog.showModal();
    document.body.classList.add('document-open');
    $('document-title').textContent=sources[key].title;
    status.hidden=false;status.textContent='Carregando…';
    try {
      await loadLibrary(); if(current!==generation)return;
      loading=pdfjsLib.getDocument(sources[key].url);
      const doc=await loading.promise;
      if(current!==generation){doc.destroy();return;}
      pdf=doc; await viewer.open(doc);
      if(current===generation){status.hidden=true;viewer.schedule();$('document-viewport').focus();}
    } catch(e) {
      if(current===generation)status.textContent='Não foi possível abrir o documento. Feche e tente novamente.';
    }
  }
  document.querySelectorAll('[data-document]').forEach(link=>link.onclick=e=>{
    e.preventDefault();const key=link.dataset.document;
    const url=new URL(location.href);url.searchParams.set('documento',key);
    history.pushState({documento:key},'',url);open(key);
  });
  function close() {
    generation++;viewer.clear();loading?.destroy();pdf?.destroy();pdf=null;
    dialog.close();document.body.classList.remove('document-open');
    const url=new URL(location.href);url.searchParams.delete('documento');history.replaceState({},'',url);
  }
  $('document-close').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  window.addEventListener('popstate',()=>{const key=new URL(location.href).searchParams.get('documento');if(sources[key])open(key);else close();});
  $('document-plus').onclick=()=>viewer.setZoom(viewer.z*1.5);
  $('document-minus').onclick=()=>viewer.setZoom(viewer.z/1.5);
  $('document-fit').onclick=()=>viewer.setZoom(1);
  const key=new URL(location.href).searchParams.get('documento');if(sources[key])open(key);
})();

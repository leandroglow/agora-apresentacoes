let modelPromise;
const status=document.getElementById('model-status');
const loadButton=document.getElementById('load-model');
async function loadModel(){
  if(modelPromise)return modelPromise;
  loadButton.disabled=true;status.querySelector('p').textContent='Carregando a maquete…';
  modelPromise=import('./assets/viewer.min.js').then(m=>m.initModel(document.getElementById('canvas-host'),new URL('./model/casa-ac20.json',import.meta.url))).then(api=>{status.hidden=true;return api}).catch(error=>{console.error(error);modelPromise=null;loadButton.disabled=false;status.querySelector('p').textContent='Não foi possível carregar o 3D. Tente novamente ou baixe o modelo SketchUp.';return null});
  return modelPromise;
}
loadButton.addEventListener('click',loadModel);
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',async()=>{const api=await loadModel();if(api)api.setView(button.dataset.view)}));
document.getElementById('reset').addEventListener('click',async()=>{const api=await loadModel();if(api)api.reset()});
document.getElementById('roof').addEventListener('change',async e=>{if(modelPromise){const api=await modelPromise;if(api)api.setRoof(e.target.checked)}});
document.getElementById('edges').addEventListener('change',async e=>{if(modelPromise){const api=await modelPromise;if(api)api.setEdges(e.target.checked)}});

'use strict';
const $=id=>document.getElementById(id);
let locations=[],environments=[],modules=[],structureLocationId='',environmentId='',editingModuleId='';
let entityAction=null,deleteAction=null;
let cameras=[],editingCameraId='';
const editIcon='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m12 4 4 4M3 17l4-1L17 6a2.8 2.8 0 0 0-4-4L3 12v5Z" stroke="currentColor" stroke-linejoin="round"/></svg>';
const deleteIcon='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5h14M8 2h4M5 5l1 12h8l1-12M8 8v6M12 8v6" stroke="currentColor" stroke-linecap="round"/></svg>';
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function message(text,type=''){$('notice').textContent=text;$('notice').className='notice '+type;}
function preference(value){try{if(value===undefined)return localStorage.getItem('agora.tuya.location')||'';localStorage.setItem('agora.tuya.location',value);}catch{}return '';}
async function api(action,body){
  const token=await window.AgoraAuth.token();
  if(!token)return {authenticated:false,master:false};
  const response=await fetch(window.AgoraAuth.apiBase+action,{method:action==='bootstrap'?'GET':'POST',headers:{Authorization:'Bearer '+token,...(action==='bootstrap'?{}:{'Content-Type':'application/json'})},body:action==='bootstrap'?undefined:JSON.stringify(body||{}),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(30000)}).catch(()=>{throw new Error('O painel não respondeu. Tente novamente.');});
  const data=await response.json().catch(()=>{throw new Error('Resposta inesperada do painel.');});
  if(!response.ok){
    if(response.status===401){$('adminContent').hidden=true;$('locked').hidden=false;document.querySelectorAll('dialog[open]').forEach(d=>d.close());message('Sua sessão terminou. Entre novamente no painel.','error');}
    throw new Error(data.error||'A operação não foi concluída.');
  }
  return data;
}
function adopt(data){
  cameras=data.cameras||[];
  locations=data.locations||[];environments=data.environments||[];modules=data.modules||[];
  if(!locations.some(l=>l.id===structureLocationId)){
    const saved=preference();structureLocationId=locations.some(l=>l.id===saved)?saved:(locations[0]?.id||'');
  }
  if(!environments.some(e=>e.id===environmentId && e.locationId===structureLocationId))environmentId='';
  preference(structureLocationId);
}
function fill(select,list,selected,empty){
  select.replaceChildren();(list.length?list:[{id:'',label:empty}]).forEach(item=>{const option=el('option','',item.label);option.value=item.id;select.append(option);});
  if(list.some(i=>i.id===selected))select.value=selected;select.disabled=!list.length;
}
function envs(locationId){return environments.filter(e=>e.locationId===locationId);}
function fillEnvironments(select,locationId,selected){fill(select,envs(locationId),selected,'Crie um ambiente neste local');}
function activeLocation(){return locations.find(l=>l.id===structureLocationId);}
function button(text,cls,fn){const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;}
function render(){
  renderCameras();
  fill($('structureLocation'),locations,structureLocationId,'Crie seu primeiro local');
  $('editLocationButton').disabled=!structureLocationId;$('deleteLocation').disabled=!structureLocationId;
  $('newEnvironment').disabled=!structureLocationId;$('newModule').disabled=!envs(structureLocationId).length;
  const host=$('environmentList');host.replaceChildren();
  if(!structureLocationId)host.append(el('p','empty-note','Crie um local para organizar os ambientes da sua instalação.'));
  else {
    const all=button('Todos os ambientes','filter-chip'+(!environmentId?' active':''),()=>{environmentId='';render();});
    all.setAttribute('aria-pressed',String(!environmentId));host.append(all);
    envs(structureLocationId).forEach(env=>{
      const item=el('div','environment-item'+(environmentId===env.id?' active':''));
      const name=button(env.label,'environment-select',()=>{environmentId=env.id;render();});
      name.setAttribute('aria-pressed',String(environmentId===env.id));
      const count=modules.filter(m=>m.environmentId===env.id).length;name.append(el('small','',String(count)));
      const actions=el('div','environment-actions');
      const edit=button('','',()=>openEntity('updateEnvironment',env));
      edit.innerHTML=editIcon;edit.setAttribute('aria-label','Editar ambiente '+env.label);edit.title='Editar ambiente';
      const remove=button('','',()=>askDelete('deleteEnvironment',{environmentId:env.id},'Excluir o ambiente “'+env.label+'”? Ele precisa estar sem módulos.'));
      remove.innerHTML=deleteIcon;remove.setAttribute('aria-label','Excluir ambiente '+env.label);remove.title='Excluir ambiente';
      actions.append(edit,remove);item.append(name,actions);host.append(item);
    });
    if(!envs(structureLocationId).length)host.append(el('p','empty-note','Adicione o primeiro ambiente deste local para receber os módulos.'));
  }
  const grid=$('moduleList');grid.replaceChildren();
  const scoped=modules.filter(m=>m.locationId===structureLocationId && (!environmentId||m.environmentId===environmentId));
  const room=environments.find(e=>e.id===environmentId);
  $('moduleScope').textContent='02 / '+(room?room.label:activeLocation()?.label||'Dispositivos do local');
  if(!scoped.length)grid.append(el('p','empty-note','Nenhum módulo neste filtro. Adicione um equipamento ou escolha outro ambiente.'));
  scoped.forEach(module=>{
    const card=el('article','module-card');card.dataset.moduleId=module.id;
    card.append(el('p','eyebrow',module.environment),el('h3','',module.label),el('p','module-sub',module.outputs.length+' recurso'+(module.outputs.length===1?'':'s')+' · '+module.location));
    const tags=el('ul','output-tags');module.outputs.forEach(output=>{const item=el('li');item.append(el('span','',output.label),el('small','',output.code));tags.append(item);});
    card.append(tags,el('p','module-id','ID · '+module.deviceId));
    const actions=el('div','button-row');
    actions.append(button('Editar módulo','quiet',()=>openModule(module)),button('Excluir','subtle-button destructive',()=>askDelete('removeModule',{moduleId:module.id},'Excluir “'+module.label+'” do painel? Os recursos serão removidos deste cadastro. O equipamento continua no Smart Life e poderá ser adicionado novamente.')));
    card.append(actions);grid.append(card);
  });
}
function openEntity(action,entity){
  entityAction={action};
  if(action==='updateLocation')entityAction.locationId=entity.id;
  if(action==='createEnvironment')entityAction.locationId=structureLocationId;
  if(action==='updateEnvironment')entityAction.environmentId=entity.id;
  $('entityTitle').textContent=({createLocation:'Um novo local.',updateLocation:'Editar local.',createEnvironment:'Um novo ambiente.',updateEnvironment:'Editar ambiente.'})[action];
  $('entityContext').textContent=action.includes('Environment')?activeLocation()?.label||'Ambiente':'Organização da casa';
  $('entityLabel').value=entity?.label||'';$('entityError').hidden=true;$('entityDialog').showModal();
}
function askDelete(action,payload,text){
  deleteAction={action,...payload};$('confirmText').textContent=text;$('confirmError').hidden=true;$('confirmDialog').showModal();
}
function openModule(module){
  editingModuleId=module.id;$('editTitle').textContent=module.label;$('editModuleLabel').value=module.label;
  fill($('editLocation'),locations,module.locationId,'Nenhum local');fillEnvironments($('editEnvironment'),module.locationId,module.environmentId);
  const host=$('outputEditor');host.replaceChildren();
  module.outputs.forEach(output=>{const label=el('label','','Recurso · '+output.code);const input=el('input');input.value=output.label;input.maxLength=60;input.required=true;input.dataset.outputId=output.id;label.append(input);host.append(label);});
  $('editModuleError').hidden=true;$('replaceError').hidden=true;$('replaceDeviceId').value='';$('replaceDetails').open=false;
  $('editModuleButton').disabled=!$('editEnvironment').value;
  $('editDialog').showModal();
}
async function save(dialogId,errorId,payload,after){
  const dialog=$(dialogId),error=$(errorId);error.hidden=true;
  if(dialog.dataset.busy)return;
  dialog.dataset.busy='true';
  const disabled=[...dialog.querySelectorAll('button')].map(b=>[b,b.disabled]);
  disabled.forEach(([b])=>b.disabled=true);
  try{
    const data=await api('admin',payload);adopt(data);if(after)after(data);render();dialog.close();message('Alteração salva. A organização da casa está atualizada.','live');
  }catch(e){error.textContent=e.message;error.hidden=false;}
  finally{delete dialog.dataset.busy;disabled.forEach(([b,was])=>b.disabled=was);}
}
async function loadRegistry(){
  $('refreshRegistry').disabled=true;
  try{adopt(await api('admin',{action:'list'}));render();message('Escolha o local e organize os módulos por ambiente.','live');}
  catch(error){message(error.message,'error');}
  finally{$('refreshRegistry').disabled=false;}
}
$('structureLocation').addEventListener('change',()=>{structureLocationId=$('structureLocation').value;environmentId='';preference(structureLocationId);render();});
$('newLocation').addEventListener('click',()=>openEntity('createLocation'));
$('editLocationButton').addEventListener('click',()=>{if(activeLocation())openEntity('updateLocation',activeLocation());});
$('deleteLocation').addEventListener('click',()=>{if(activeLocation())askDelete('deleteLocation',{locationId:structureLocationId},'Excluir o local “'+activeLocation().label+'”? Ele precisa estar sem ambientes e módulos.');});
$('newEnvironment').addEventListener('click',()=>openEntity('createEnvironment'));
$('newModule').addEventListener('click',()=>{
  $('registerForm').reset();$('capabilityPreview').hidden=true;fill($('moduleLocation'),locations,structureLocationId,'Crie um local');fillEnvironments($('moduleEnvironment'),structureLocationId,environmentId);
  $('registerError').hidden=true;$('registerButton').disabled=!$('moduleEnvironment').value;$('registerDialog').showModal();
});
$('moduleLocation').addEventListener('change',()=>{fillEnvironments($('moduleEnvironment'),$('moduleLocation').value);$('registerButton').disabled=!$('moduleEnvironment').value;});
$('editLocation').addEventListener('change',()=>{fillEnvironments($('editEnvironment'),$('editLocation').value);$('editModuleButton').disabled=!$('editEnvironment').value;});
$('refreshRegistry').addEventListener('click',loadRegistry);
$('entityForm').addEventListener('submit',event=>{
  event.preventDefault();
  const action={...entityAction,label:$('entityLabel').value.trim()},before=new Set(locations.map(l=>l.id));
  save('entityDialog','entityError',action,()=>{
    if(action.action==='createLocation'){const added=locations.find(l=>!before.has(l.id));if(added){structureLocationId=added.id;environmentId='';preference(added.id);}}
  });
});
$('confirmForm').addEventListener('submit',event=>{event.preventDefault();save('confirmDialog','confirmError',deleteAction);});
$('registerForm').addEventListener('submit',event=>{
  event.preventDefault();const local=$('moduleLocation').value,room=$('moduleEnvironment').value;
  save('registerDialog','registerError',{action:'register',environmentId:room,label:$('moduleLabel').value.trim(),deviceId:$('moduleDeviceId').value.trim()},()=>{structureLocationId=local;environmentId=room;preference(local);});
});
$('editModuleForm').addEventListener('submit',event=>{
  event.preventDefault();const outputLabels={};
  $('outputEditor').querySelectorAll('input').forEach(input=>outputLabels[input.dataset.outputId]=input.value.trim());
  const local=$('editLocation').value,room=$('editEnvironment').value;
  save('editDialog','editModuleError',{action:'updateModule',moduleId:editingModuleId,environmentId:room,label:$('editModuleLabel').value.trim(),outputLabels},()=>{structureLocationId=local;environmentId=room;preference(local);});
});
$('replaceForm').addEventListener('submit',event=>{event.preventDefault();save('editDialog','replaceError',{action:'replace',moduleId:editingModuleId,deviceId:$('replaceDeviceId').value.trim()});});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>{if(!$(button.dataset.close).dataset.busy)$(button.dataset.close).close();}));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('cancel',event=>{if(dialog.dataset.busy)event.preventDefault();}));
(async()=>{
  try{const boot=await api('bootstrap');if(!boot.authenticated||!boot.master){$('locked').hidden=false;message('Apenas o usuário master pode organizar dispositivos.');return;}$('adminContent').hidden=false;await loadRegistry();}
  catch(error){message(error.message,'error');}
})();


let inspectionVersion=0;
$('moduleDeviceId').addEventListener('input',()=>{inspectionVersion++;$('capabilityPreview').hidden=true;});
$('inspectDevice').addEventListener('click',async()=>{
  const id=$('moduleDeviceId').value.trim(),version=++inspectionVersion;
  if(!/^[a-zA-Z0-9_-]{10,80}$/.test(id)){$('registerError').textContent='Informe o ID virtual do dispositivo.';$('registerError').hidden=false;return;}
  $('inspectDevice').disabled=true;$('registerError').hidden=true;$('capabilityPreview').hidden=true;
  try{
    const data=await api('admin',{action:'inspectDevice',deviceId:id});
    if(version!==inspectionVersion||id!==$('moduleDeviceId').value.trim())return;
    const preview=$('capabilityPreview');preview.replaceChildren();
    const controls=data.controls||[];
    preview.append(el('p','eyebrow',controls.length+' recursos identificados'));
    const list=el('ul','output-tags');
    controls.forEach(c=>{
      const item=el('li');let info=c.writable?(TuyaCapabilities.supported(c)?'Controle disponível':'Controle específico pendente'):'Somente consulta';
      if(c.type==='Integer'&&TuyaCapabilities.supported(c))info=TuyaCapabilities.format(c,c.schema.min)+' a '+TuyaCapabilities.format(c,c.schema.max);
      if(c.type==='Enum')info=c.schema.range.map(v=>TuyaCapabilities.choice(c,v)).join(' / ');
      item.append(el('span','',c.label),el('small','',info));list.append(item);
    });preview.append(list);if(data.warning)preview.append(el('p','micro',data.warning));preview.hidden=false;
    if(!$('moduleLabel').value.trim()&&data.category==='fskg')$('moduleLabel').value='Ventilador';
  }catch(error){if(version===inspectionVersion){$('registerError').textContent=error.message;$('registerError').hidden=false;}}
  finally{$('inspectDevice').disabled=false;}
});
$('syncResources').addEventListener('click',()=>save('editDialog','editModuleError',{action:'syncModule',moduleId:editingModuleId}));

function renderCameras(){
  const host=$('cameraList');host.replaceChildren();
  const list=cameras.filter(c=>c.locationId===structureLocationId);
  if(!list.length)host.append(el('p','empty-note','Nenhuma câmera conectada neste local.'));
  list.forEach(camera=>{
    const card=el('article','module-card');card.append(el('p','eyebrow','Câmera'),el('h3','',camera.label));
    card.append(button('Editar câmera','quiet',()=>{
      editingCameraId=camera.id;$('cameraEditLabel').value=camera.label;
      fill($('cameraEditLocation'),locations,camera.locationId,'Nenhum local');
      $('cameraEditError').hidden=true;$('cameraEditDialog').showModal();
    }));host.append(card);
  });
}
$('cameraEditForm').addEventListener('submit',event=>{
  event.preventDefault();save('cameraEditDialog','cameraEditError',{action:'updateCamera',cameraId:editingCameraId,label:$('cameraEditLabel').value,locationId:$('cameraEditLocation').value},()=>{
    structureLocationId=$('cameraEditLocation').value;preference(structureLocationId);
  });
});

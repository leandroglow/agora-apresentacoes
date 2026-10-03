'use strict';
// Uses the existing master-only administration session and registration form.
(() => {
 const panel=el('section','admin-section');
 panel.setAttribute('aria-label','Descobrir dispositivos Tuya');
 const title=el('h2','','Encontrar dispositivos deste local');
 const explanation=el('p','muted','A consulta usa um dispositivo já cadastrado para identificar a casa na Tuya. Equipamentos de outras casas não são associados automaticamente.');
 const scan=button('Buscar dispositivos na Tuya','quiet',async()=>{
  const selected=structureLocationId;
  if(!selected)return;
  scan.disabled=true;result.replaceChildren(el('p','micro','Consultando a casa vinculada ao dispositivo de referência…'));
  try{
   const data=await api('admin',{action:'discoverLocation',locationId:selected});
   if(selected!==structureLocationId){result.replaceChildren(el('p','micro','O local mudou. Faça outra consulta para o local selecionado.'));return;}
   result.replaceChildren();
   const homes=data.matchedHomes||[];
   if(!homes.length)result.append(el('p','notice','Não foi possível confirmar uma casa Tuya contendo o dispositivo já cadastrado. Nenhum equipamento foi adicionado.'));
   for(const home of homes){
    result.append(el('h3','','Casa Tuya: '+home.name),el('p','micro','Vínculo confirmado pela presença de um dispositivo já cadastrado neste local.'));
    const missing=home.devices.filter(d=>!modules.some(m=>m.deviceId===d.id));
    if(missing.length){
     const progress=el('p','micro');progress.setAttribute('role','status');
     const batch=button('Cadastrar '+missing.length+' dispositivos faltantes desta casa','primary',async()=>{
      if(selected!==structureLocationId){message('O local selecionado mudou. Consulte novamente.','error');return;}
      const plan=missing.map(item=>{const rooms=home.rooms.filter(r=>r.deviceIds.includes(item.id));const name=rooms.length===1?rooms[0].name:rooms.length===0?'Sem ambiente na Tuya':'';const target=envs(selected).find(e=>e.label===name);return {item,target,name};});
      const unresolved=plan.filter(p=>!p.target);
      if(unresolved.length){progress.textContent='Crie ou confirme os ambientes antes do lote: '+[...new Set(unresolved.map(p=>p.name||'dispositivo em mais de um ambiente'))].join(', ')+'. Nenhum cadastro executado.';return;}
      batch.disabled=true;scan.disabled=true;$('structureLocation').disabled=true;
      let completed=0;const failures=[];
      try{
       for(let index=0;index<plan.length;index++){
        const {item,target}=plan[index];progress.textContent=(index+1)+'/'+plan.length+' · Conferindo e cadastrando '+item.name+'…';
        if(modules.some(m=>m.deviceId===item.id))continue;
        try{adopt(await api('admin',{action:'register',environmentId:target.id,label:(item.name||'Dispositivo Tuya').slice(0,80),deviceId:item.id}));completed++;}
        catch(error){failures.push(item.name+': '+error.message);}
       }
       render();progress.textContent=completed+' cadastrado(s). '+failures.length+' pendente(s). '+failures.join(' | ');message('Cadastro do lote concluído. Confira as pendências abaixo.','live');
      }finally{scan.disabled=false;$('structureLocation').disabled=false;}
     });
     result.append(el('p','micro','Destino: '+activeLocation().label+'. Usa os ambientes identificados na Tuya e mantém os nomes existentes. Equipamentos sem recursos disponíveis poderão ficar pendentes.'),batch,progress);
    }
    for(const item of home.devices){
     const row=el('article','module-card');const existing=modules.find(m=>m.deviceId===item.id);
     const room=home.rooms.find(r=>r.deviceIds.includes(item.id));
     row.append(el('h3','',item.name||item.id),el('p','micro',[room?.name,item.category,item.online?'Online':'Offline'].filter(Boolean).join(' · ')),el('p','module-id',item.id));
     if(existing)row.append(el('p','micro','Já cadastrado: '+existing.location+' / '+existing.environment));
     else row.append(button('Preparar cadastro de '+(item.name||item.id),'quiet',()=>{
      if(selected!==structureLocationId){message('Selecione novamente o local consultado antes de cadastrar.','error');return;}
      const targetRoom=envs(selected).find(e=>e.label.toLocaleLowerCase('pt-BR')===room?.name.toLocaleLowerCase('pt-BR'));
      $('newModule').click();$('moduleLabel').value=(item.name||'Dispositivo Tuya').slice(0,80);$('moduleDeviceId').value=item.id;
      if(targetRoom)$('moduleEnvironment').value=targetRoom.id;
      else {const opt=el('option','','Escolha o ambiente deste dispositivo');opt.value='';$('moduleEnvironment').prepend(opt);$('moduleEnvironment').value='';}
      $('registerButton').disabled=!$('moduleEnvironment').value;
     }));
     result.append(row);
    }
   }
   if(data.sharedDevicesUnassigned?.length)result.append(el('p','micro',data.sharedDevicesUnassigned.length+' dispositivo(s) compartilhado(s) com a conta vinculada à referência, sem associação confirmada a este local. Não foram incluídos. Essa conta pode ser a do proprietário e não representa necessariamente todos os compartilhamentos do seu login.'));
   if(data.warnings?.length)result.append(el('p','notice','Consulta parcial: '+[...new Set(data.warnings.map(w=>w.code))].join(', ')+'. Uma falha de consulta não comprova ausência de dispositivos.'));
   result.append(el('p','micro','Consulta em '+new Date(data.checkedAt).toLocaleString('pt-BR')+'. O cadastro usa a conferência de recursos existente; não envia comandos aos equipamentos.'));
  }catch(e){result.replaceChildren(el('p','notice error',e.message));}
  finally{scan.disabled=false;}
 });
 const result=el('div','module-admin-grid');result.setAttribute('aria-live','polite');
 panel.append(title,explanation,scan,result);$('adminContent').insertBefore(panel,$('adminContent').lastElementChild);
 $('structureLocation').addEventListener('change',()=>result.replaceChildren());
 $('moduleEnvironment').addEventListener('change',()=>{$('registerButton').disabled=!$('moduleEnvironment').value;});
})();

'use strict';
const $ = id => document.getElementById(id);
let authenticated = false, master = false, channels = [], locations = [], environments = [];
let loginMounted = false;
let selectedLocationId = '', selectedEnvironmentId = '', working = false;
let queue = Promise.resolve(), serial = 0, sessionEpoch = 0;
const pending = new Map(), drafts = new Map(), expandedModules = new Set();
const Cap = window.TuyaCapabilities;

function message(text, type = '') { for (const id of ['notice','loginNotice']) { const notice=$(id); notice.textContent=text; notice.hidden=!text; notice.className='notice '+(type==='error'?'error':'announcement-only'); } }
function preference(value) { try { if (value === undefined) return localStorage.getItem('agora.tuya.location') || ''; localStorage.setItem('agora.tuya.location', value); } catch {} return ''; }
function element(tag, cls, text) { const e=document.createElement(tag); if(cls)e.className=cls; if(text!==undefined)e.textContent=text; return e; }
async function api(action, body) {
  const token = await window.AgoraAuth.token();
  if (!token) return {authenticated:false, channels:[]};
  const response = await fetch(window.AgoraAuth.apiBase+action, {
    method:action==='bootstrap'?'GET':'POST',
    headers:{Authorization:'Bearer '+token,...(action==='bootstrap'?{}:{'Content-Type':'application/json'})},
    body:action==='bootstrap'?undefined:JSON.stringify(body||{}),
    credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(30000)
  }).catch(()=>{throw new Error('O painel não recebeu resposta. Tente novamente.');});
  const data=await response.json().catch(()=>{throw new Error('Resposta inesperada do painel.');});
  if(!response.ok){const err=new Error(data.error||'A operação não foi concluída.');err.status=response.status;throw err;}
  return data;
}
function adopt(data) {
  if(typeof data.authenticated==='boolean')authenticated=data.authenticated;
  if(typeof data.master==='boolean')master=data.master;
  // A command accepted without a status read is not an empty house.
  if(Array.isArray(data.channels) && !(data.command && !data.channels.length)) channels=data.channels;
  if(Array.isArray(data.locations))locations=data.locations;
  if(Array.isArray(data.environments))environments=data.environments;
  if(!locations.some(l=>l.id===selectedLocationId)){
    const saved=preference(); selectedLocationId=locations.some(l=>l.id===saved)?saved:(locations[0]?.id||'');
  }
  if(!environments.some(e=>e.id===selectedEnvironmentId && e.locationId===selectedLocationId))selectedEnvironmentId='';
}
function locationChannels(){return channels.filter(c=>c.locationId===selectedLocationId);}
function currentEnvironments(){return environments.filter(e=>e.locationId===selectedLocationId);}
function displayedValue(c){return pending.has(c.id)?pending.get(c.id).value:c.value;}
function renderLocations(){
  const select=$('locationSelect');select.replaceChildren();
  const list=locations.length?locations:[{id:'',label:authenticated?'Cadastre um local':'Entre para selecionar'}];
  list.forEach(l=>{const o=element('option','',l.label);o.value=l.id;select.append(o);});
  select.value=selectedLocationId;select.disabled=!locations.length;
}
function renderFilters(){
  const host=$('environmentFilters');host.replaceChildren();
  if(!selectedLocationId)return;
  [{id:'',label:'Todos'},...currentEnvironments()].forEach(env=>{
    const count=new Set(locationChannels().filter(c=>!env.id||c.environmentId===env.id).map(c=>c.moduleId)).size;
    const button=element('button','filter-chip'+(env.id===selectedEnvironmentId?' active':''),env.label);
    button.setAttribute('aria-pressed',String(env.id===selectedEnvironmentId));
    button.append(element('span','filter-count',String(count)));
    button.addEventListener('click',()=>{selectedEnvironmentId=env.id;render();});
    host.append(button);
  });
}
function renderEmpty(grid){
  const empty=element('div','empty-devices'),detail=element('div');
  detail.append(element('h3','',authenticated?'Nenhum dispositivo':'Entrar no painel'));
  detail.append(element('p','',authenticated?'Não há dispositivos neste ambiente.':'Acesse seus locais e controles.'));
  empty.append(detail);
  if(master){const button=element('a','quiet','Dispositivos');button.href='admin.html';empty.append(button);}
  else if(!authenticated){const button=element('button','quiet','Entrar');button.addEventListener('click',()=>window.AgoraAuth.signIn());empty.append(button);}
  grid.append(empty);
}

function renderControl(output){
  const cap={type:'Boolean',schema:{},...output},value=displayedValue(output),waiting=pending.has(output.id);
  const row=element('div','output-row'+(Cap.isPower(cap)&&value===true?' on':'')+(waiting?' pending':''));
  row.dataset.outputId=output.id;
  const detail=element('div','control-detail');
  const state=waiting?(cap.type==='Boolean'?(value?'Ligando…':'Desligando…'):'Enviando '+Cap.format(cap,value)+'…'):Cap.format(cap,output.value);
  detail.append(element('strong','',output.label),element('small','',state));row.append(detail);
  if(output.available===false||output.writable===false||!Cap.supported(cap)){
    row.classList.add('readonly-row');
    row.append(element('span','micro',output.available===false?'Recurso indisponível':output.writable===false?'Somente consulta':'Controle específico ainda não disponível'));
    return row;
  }
  if(cap.type==='Boolean'){
    if(typeof value==='boolean'){
      const toggle=element('button','switch');toggle.type='button';toggle.setAttribute('role','switch');
      toggle.setAttribute('aria-checked',String(value));toggle.setAttribute('aria-label',output.label+' · '+output.moduleLabel);
      toggle.dataset.focusKey=output.id;toggle.title=value?'Desligar':'Ligar';
      toggle.addEventListener('click',()=>queueCommand(output,!displayedValue(channels.find(c=>c.id===output.id)||output)));
      row.append(toggle);
    }else{
      const actions=element('div','output-actions');
      [[true,'Ligar'],[false,'Desligar']].forEach(([next,label])=>{
        const button=element('button','',label);button.setAttribute('aria-label',label+' '+output.label);
        button.dataset.focusKey=output.id+'-'+next;button.addEventListener('click',()=>queueCommand(output,next));actions.append(button);
      });row.append(actions);
    }
    return row;
  }
  row.classList.add('typed-row');
  const form=element('form','resource-form'),line=element('div','value-line');
  let input,slider;
  const draft=drafts.get(output.id),s=cap.schema||{},factor=10**(s.scale||0);
  if(cap.type==='Enum'){
    input=element('select');
    const prompt=element('option','','Escolha uma opção');prompt.value='';prompt.disabled=true;input.append(prompt);
    s.range.forEach(v=>{const option=element('option','',Cap.choice(cap,v));option.value=v;input.append(option);});
    input.value=draft!==undefined?draft:(typeof value==='string'?value:'');input.required=true;
  }else{
    input=element('input');input.type=cap.type==='Integer'?'number':'text';input.required=cap.type==='Integer';
    if(cap.type==='Integer'){
      input.min=s.min/factor;input.max=s.max/factor;input.step=s.step/factor;input.inputMode=s.scale?'decimal':'numeric';
      input.value=draft!==undefined?draft:(typeof value==='number'?value/factor:'');
      input.placeholder=(s.min/factor)+'–'+(s.max/factor);
      if(s.max-s.min<=1000 && !/^countdown/.test(cap.code)){
        slider=element('input','resource-slider');slider.type='range';slider.min=input.min;slider.max=input.max;slider.step=input.step;
        slider.value=input.value||input.min;slider.setAttribute('aria-label','Ajustar '+output.label+' · '+output.moduleLabel);
        slider.dataset.focusKey=output.id+'-slider';
        slider.addEventListener('input',()=>{input.value=slider.value;drafts.set(output.id,input.value);});
        form.append(slider);
      }
    }else{input.maxLength=s.maxlen;input.value=draft!==undefined?draft:(typeof value==='string'?value:'');}
  }
  input.setAttribute('aria-label',output.label+' · '+output.moduleLabel);input.dataset.focusKey=output.id+'-value';
  input.addEventListener('input',()=>{drafts.set(output.id,input.value);if(slider)slider.value=input.value;});
  line.append(input);if(s.unit)line.append(element('span','value-unit',s.unit));
  const apply=element('button','quiet','Aplicar');apply.type='submit';apply.setAttribute('aria-label','Aplicar '+output.label);apply.dataset.focusKey=output.id+'-apply';line.append(apply);form.append(line);
  const error=element('p','form-error');error.hidden=true;form.append(error);
  form.addEventListener('submit',event=>{
    event.preventDefault();error.hidden=true;let raw=input.value;
    if(cap.type==='Integer'){
      const scaled=Number(raw)*factor;
      if(raw===''||!Number.isFinite(scaled)||Math.abs(scaled-Math.round(scaled))>1e-6){error.textContent='Confira o valor informado.';error.hidden=false;return;}
      raw=Math.round(scaled);
    }
    try{Cap.validate(cap,raw);}catch(e){error.textContent=e.message;error.hidden=false;return;}
    drafts.delete(output.id);queueCommand(output,raw);
  });
  row.append(form);return row;
}
function renderDevices(){
  const grid=$('deviceGrid');
  const focused=grid.contains(document.activeElement)?document.activeElement.dataset.focusKey:null;
  grid.replaceChildren();
  const grouped=new Map();
  locationChannels().filter(c=>!selectedEnvironmentId||c.environmentId===selectedEnvironmentId).forEach(c=>{
    if(!grouped.has(c.moduleId))grouped.set(c.moduleId,{id:c.moduleId,label:c.moduleLabel,room:c.room,outputs:[]});
    grouped.get(c.moduleId).outputs.push(c);
  });
  if(!grouped.size){renderEmpty(grid);return;}
  grouped.forEach(module=>{
    const card=element('article','device-card'+(module.outputs.some(c=>Cap.isPower(c)&&displayedValue(c)===true)?' has-light':''));
    card.dataset.moduleId=module.id;
    const head=element('div','device-card-head'),title=element('div');
    title.append(element('p','',module.room),element('h3','',module.label));
    head.append(title);card.append(head);
    const failure=module.outputs.find(c=>c.error);
    if(failure)card.append(element('p','resource-warning',failure.error));
    const primary=module.outputs.filter(c=>!Cap.isSetting(c)),settings=module.outputs.filter(c=>Cap.isSetting(c));
    primary.sort((a,b)=>Number(Cap.isPower(b))-Number(Cap.isPower(a))).forEach(c=>card.append(renderControl(c)));
    if(settings.length){
      const details=element('details','device-settings');details.open=expandedModules.has(module.id);
      details.append(element('summary','','Ajustes do equipamento · '+settings.length));
      details.addEventListener('toggle',()=>{if(details.open)expandedModules.add(module.id);else expandedModules.delete(module.id);});
      settings.forEach(c=>details.append(renderControl(c)));card.append(details);
    }
    grid.append(card);
  });
  if(focused){const next=[...grid.querySelectorAll('[data-focus-key]')].find(e=>e.dataset.focusKey===focused);if(next)next.focus({preventScroll:true});}
}

function render(){
  $('loginGate').hidden=authenticated;
  document.querySelector('.masthead').hidden=!authenticated;
  document.querySelector('main.page').hidden=!authenticated;
  document.querySelector('.skip-link').hidden=!authenticated;
  if(!authenticated&&!loginMounted){
    loginMounted=true;
    window.AgoraAuth.mountSignIn($('signInMount')).catch(error=>{loginMounted=false;message(error.message||'Não foi possível carregar o login.','error');});
  }else if(authenticated&&loginMounted){
    loginMounted=false;
    window.AgoraAuth.unmountSignIn($('signInMount')).catch(()=>{});
  }
  const location=locations.find(l=>l.id===selectedLocationId);
  $('locationTitle').textContent=location?.label||'Controle';
  $('accessLabel').textContent=authenticated?'Sair':'Entrar';
  $('accessButton').title=authenticated?'Encerrar sessão':'Entrar';
  $('manageButton').hidden=!master;
  $('refresh').disabled=!authenticated||working||pending.size>0;
  $('refresh').classList.toggle('is-refreshing',working);
  $('refresh').setAttribute('aria-busy',String(working));
  renderLocations();renderFilters();renderDevices();
}

function clearSession(){
  sessionEpoch++;authenticated=false;master=false;channels=[];locations=[];environments=[];pending.clear();drafts.clear();expandedModules.clear();working=false;
}
function handleError(error){
  if(error.status===401)clearSession();
  message(error.message||'A operação não foi concluída.','error');
}
async function refresh(){
  if(!authenticated||working||pending.size)return;
  const epoch=sessionEpoch,revision=serial;working=true;render();
  try{
    const data=await api('status');
    if(epoch!==sessionEpoch)return;
    if(revision===serial){adopt(data);message(data.warning||'',data.warning?'error':'');}
  }catch(error){if(epoch===sessionEpoch)handleError(error);}
  finally{if(epoch===sessionEpoch){working=false;render();}}
}
function queueCommand(output,value){
  if(!authenticated){window.AgoraAuth.signIn();return;}
  const id=++serial,epoch=sessionEpoch;
  pending.set(output.id,{id,value});message(output.label+': aguardando confirmação.','live');render();
  const run=async()=>{
    if(epoch!==sessionEpoch||!authenticated)return;
    try{
      const data=await api('command',{outputId:output.id,value});
      if(epoch!==sessionEpoch)return;
      adopt(data);
      if(!data.channels?.length){const c=channels.find(c=>c.id===output.id);if(c)c.value=null;}
      message(data.command?.matched?output.label+': '+Cap.format(output,value)+', confirmado.':output.label+': '+(data.warning||'comando enviado; consulte o estado.'),data.command?.matched?'live':'error');
    }catch(error){
      if(epoch!==sessionEpoch)return;
      const c=channels.find(c=>c.id===output.id);if(c)c.value=null;
      handleError(error);
    }finally{
      if(epoch===sessionEpoch){if(pending.get(output.id)?.id===id)pending.delete(output.id);render();}
    }
  };
  queue=queue.catch(()=>{}).then(run);
}
$('locationSelect').addEventListener('change',()=>{selectedLocationId=$('locationSelect').value;selectedEnvironmentId='';preference(selectedLocationId);render();});
$('refresh').addEventListener('click',refresh);
$('accessButton').addEventListener('click',async()=>{
  if(!authenticated){window.AgoraAuth.signIn();return;}
  $('accessButton').disabled=true;
  try{await window.AgoraAuth.signOut();clearSession();message('Sessão encerrada. Seus locais e dispositivos continuam salvos.');}
  catch(error){handleError(error);}
  finally{$('accessButton').disabled=false;render();}
});
$('manageButton').addEventListener('click',event=>{if(!master){event.preventDefault();}});
window.addEventListener('agora-auth-changed', async()=>{
  const wasAuthenticated=authenticated;
  try { adopt(await api('bootstrap')); if(authenticated&&!wasAuthenticated)await refresh(); else if(!authenticated)clearSession(); }
  catch(error){handleError(error);}
  render();
});
(async()=>{
  try{adopt(await api('bootstrap'));if(authenticated)await refresh();else message('Entre para consultar e controlar os seus dispositivos.');}
  catch(error){handleError(error);}
  render();
})();


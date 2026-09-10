'use strict';
const byId=id=>document.getElementById(id);
const form=byId('formulario'),submit=byId('submit'),availability=byId('availability');
const endpoint=String(window.FINANCING_ENDPOINT||'').replace(/\/$/,'');
const api=endpoint?endpoint+'/api/financiamento':'';
const storageKey='caixa:'+endpoint;
let token=sessionStorage.getItem(storageKey+':token')||'',job=sessionStorage.getItem(storageKey+':job'),timer=null,enabled=false,requestId=null;
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
function parseMoney(value){const s=value.trim().replace(/\s|R\$/g,'');if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s))return NaN;return Number(s.replace(/\./g,'').replace(',','.'));}
function formatPhone(value){const d=value.replace(/\D/g,'');return d.length===11?'('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7):value;}
function notice(message,error=false){availability.textContent=message;availability.classList.toggle('error',error);}
async function request(path,options={}){
 if(!api)throw new Error('A conexão com o computador ainda não foi liberada.');
 const response=await fetch(api+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers},signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){if(response.status===401){enabled=false;token='';sessionStorage.removeItem(storageKey+':token');byId('connect-form').hidden=false;}throw new Error(data.message||'Não foi possível concluir a operação.');}
 return data;
}
function formatCurrencyWhileTyping(input){
 const raw=input.value,caret=input.selectionStart??raw.length;
 const clean=raw.replace(/^R\$\s*/,'').replace(/\s/g,'');
 if(!/^[\d.,]*$/.test(clean)||clean.split(',').length>2)return;
 const parts=clean.split(','),whole=parts[0].replace(/\./g,''),fraction=parts[1];
 if(fraction!==undefined&&!/^\d{0,2}$/.test(fraction))return;
 const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
 const formatted=grouped+(fraction!==undefined?','+fraction:'');
 if(formatted===raw)return;
 const meaningful=raw.slice(0,caret).replace(/[^\d,]/g,'').length;
 input.value=formatted;
 let position=0,count=0;
 while(position<formatted.length&&count<meaningful){if(/[\d,]/.test(formatted[position]))count++;position++;}
 input.setSelectionRange(position,position);
}
for(const id of ['propertyValue','monthlyIncome']){
 const input=byId(id);input.addEventListener('input',()=>{input.setCustomValidity('');formatCurrencyWhileTyping(input);requestId=null;});input.addEventListener('blur',()=>{const value=parseMoney(input.value);if(Number.isFinite(value)&&value>0)input.value=value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});});
}
byId('birthDate').max=new Date().toISOString().slice(0,10);
byId('phone').addEventListener('input',()=>byId('phone').setCustomValidity(''));
byId('phone').addEventListener('blur',()=>{byId('phone').value=formatPhone(byId('phone').value);});
form.addEventListener('input',()=>requestId=null);
function progress(title,message){byId('empty').hidden=true;byId('progress').hidden=false;byId('progress-title').textContent=title;byId('progress-message').textContent=message;}
function showResult(data){
 const rows=[['Valor do financiamento','loan','money'],['Valor da entrada','downPayment','money'],['Primeira parcela','firstPayment','money'],['Última parcela','lastPayment','money'],['Prazo','months','months'],['Juros efetivos','effectiveRate','rate'],['Juros nominais','nominalRate','rate'],['CET','cet','rate'],['CESH','cesh','rate']];
 if(!data||!data.sac||!data.price||!data.program)throw new Error('O resultado recebido está incompleto.');
 for(const system of ['sac','price'])for(const [,key]of rows)if(!Number.isFinite(data[system][key])||data[system][key]<0)throw new Error('A Caixa não retornou todos os valores da comparação.');
 const body=byId('result-rows');body.replaceChildren();
 for(const [title,key,type]of rows){const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=title;tr.append(th);for(const system of ['sac','price']){const td=document.createElement('td'),v=data[system][key];td.textContent=type==='money'?money.format(v):type==='months'?v+' meses':v.toLocaleString('pt-BR',{minimumFractionDigits:2})+'% a.a.';tr.append(td);}body.append(tr);}
 byId('result-context').textContent=data.program+' · '+data.city+'/'+data.state;
 byId('progress').hidden=true;byId('otp-form').hidden=true;byId('result').hidden=false;submit.disabled=false;requestId=null;notice('Consulta concluída. O PDF está disponível para baixar.');
}
async function poll(){
 clearTimeout(timer);
 try{const state=await request('/simulacoes/'+encodeURIComponent(job));byId('retry-status').hidden=true;
  if(state.status==='completed'){showResult(state.result);return;}
  if(state.status==='otp_required'){progress('Confirme o telefone',state.message||'Informe os seis dígitos enviados pela Caixa.');byId('otp-form').hidden=false;byId('otp').focus();return;}
  if(['failed','expired','attention_required'].includes(state.status)){progress('Consulta interrompida',state.message);submit.disabled=false;requestId=null;byId('otp-form').hidden=true;notice('Nenhum resultado substituto foi gerado.',true);return;}
  progress('Consultando a Caixa',state.message||'Aguarde a consulta de SAC e Price.');timer=setTimeout(poll,3000);
 }catch(e){progress('Conexão interrompida',e.message);byId('retry-status').hidden=false;notice('Verifique o andamento antes de iniciar outra consulta.',true);}
}
byId('retry-status').addEventListener('click',poll);
async function loadConfig(){const config=await request('/config');enabled=config.ready===true;if(config.defaultPhone&&!form.phone.value)form.phone.value=formatPhone(config.defaultPhone);byId('connect-form').hidden=enabled;notice(enabled?'Computador conectado. Pronto para o teste da consulta.':'O serviço ainda não está disponível.');if(enabled&&job){submit.disabled=true;poll();}}
byId('connect-form').addEventListener('submit',async e=>{e.preventDefault();const button=byId('connect-button');button.disabled=true;try{const data=await request('/access',{method:'POST',body:JSON.stringify({code:byId('access-code').value})});token=data.token;sessionStorage.setItem(storageKey+':token',token);byId('access-code').value='';await loadConfig();}catch(e){notice(e.message,true);}finally{button.disabled=false;}});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(!enabled){notice(api?'Conecte-se com o código de acesso para iniciar.':'A página está publicada. Falta liberar a conexão com o computador para fazer o primeiro teste.',true);if(api)byId('connect-form').hidden=false;return;}
 const propertyValue=parseMoney(form.propertyValue.value),monthlyIncome=parseMoney(form.monthlyIncome.value);
 for(const [id,value]of [['propertyValue',propertyValue],['monthlyIncome',monthlyIncome]])if(!Number.isFinite(value)||value<=0){form[id].setCustomValidity('Informe um valor maior que zero.');form[id].reportValidity();return;}
 const phone=form.phone.value.replace(/\D/g,'');if(!/^\d{11}$/.test(phone)){form.phone.setCustomValidity('Informe o celular com DDD.');form.phone.reportValidity();return;}
 const payload={propertyValue,monthlyIncome,phone,birthDate:form.birthDate.value,city:form.city.value.trim(),state:form.state.value,propertyType:form.propertyType.value,fgts:form.fgts.value==='true',multipleBuyers:form.multipleBuyers.checked,previousSubsidy:form.previousSubsidy.checked,otherProperty:form.otherProperty.checked,consent:form.consent.checked};
 requestId=requestId||crypto.randomUUID();submit.disabled=true;byId('result').hidden=true;byId('otp-form').hidden=true;
 try{const data=await request('/simulacoes',{method:'POST',headers:{'Idempotency-Key':requestId},body:JSON.stringify(payload)});if(typeof data.id!=='string')throw new Error('A consulta não foi iniciada.');job=data.id;sessionStorage.setItem(storageKey+':job',job);progress('Consultando a Caixa','Preparando os dados.');poll();}catch(e){notice(e.message,true);submit.disabled=false;}
});
byId('otp-form').addEventListener('submit',async e=>{e.preventDefault();const input=byId('otp'),button=byId('otp-submit');if(!/^\d{6}$/.test(input.value)||!job)return;button.disabled=true;try{await request('/simulacoes/'+encodeURIComponent(job)+'/codigo',{method:'POST',body:JSON.stringify({code:input.value})});input.value='';byId('otp-form').hidden=true;poll();}catch(e){notice(e.message,true);}finally{button.disabled=false;}});
byId('download').addEventListener('click',async e=>{e.preventDefault();if(!job)return;try{const response=await fetch(api+'/simulacoes/'+encodeURIComponent(job)+'/pdf',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});if(!response.ok||!response.headers.get('content-type')?.includes('application/pdf'))throw new Error('O PDF não está disponível.');const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='simulacao-financiamento-caixa.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){notice(e.message,true);}});
(async()=>{if(!api){notice('Página publicada. Conexão com o computador aguardando liberação.');return;}try{await request('/health');if(token)await loadConfig();else{byId('connect-form').hidden=false;notice('Computador online. Informe o código de acesso para conectar.');}}catch{notice('O computador está desconectado ou o serviço não está disponível.',true);}})();
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 try{Promise.resolve(document.modelContext.registerTool({name:'prepare_financing_form',title:'Preencher dados da simulação',description:'Prepara imóvel e renda para revisão. Não inicia uma consulta nem marca consentimento.',inputSchema:{type:'object',properties:{propertyValue:{type:'number',exclusiveMinimum:0},monthlyIncome:{type:'number',exclusiveMinimum:0}},required:['propertyValue','monthlyIncome'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||Object.keys(input).some(k=>!['propertyValue','monthlyIncome'].includes(k))||!Number.isFinite(input.propertyValue)||input.propertyValue<=0||!Number.isFinite(input.monthlyIncome)||input.monthlyIncome<=0)throw new Error('Valores inválidos.');for(const key of ['propertyValue','monthlyIncome'])form[key].value=input[key].toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});requestId=null;return{status:'draft',submitted:false};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}

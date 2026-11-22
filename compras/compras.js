(()=>{'use strict';
const API='https://agora-apresentacoes.vercel.app/api/purchase-requests',STATUSES={requested:'Solicitado',quoting:'Em cotação',ordered:'Pedido',received:'Atendido',cancelled:'Cancelado'},DEST={unassigned:'A definir',stock:'Estoque',general:'Gastos gerais',project:'Projeto'},MAX_PHOTO=900*1024;
const $=s=>document.querySelector(s), el=(tag,attrs={},text='')=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')n.className=v;else if(k==='on')for(const[e,f]of Object.entries(v))n.addEventListener(e,f);else n.setAttribute(k,v)}if(text)n.textContent=text;return n};
let userId='',sessionUser=null,requests=[],projects=[],canManage=false,photos=[],items=[],mutation=null,createId=null,busy=false,detailRequest=null,detailEtag='',authGeneration=0,photoObjectUrls=new Set(),listController=null,detailSequence=0,pendingCreate=null,photoAdds=0,organizing=false;
let activeLineId='',draftNeededBy='';
const show=(msg,type='')=>{const n=$('#notice');n.textContent=msg;n.className='notice'+(type?' '+type:'');n.hidden=false};function hideNotice(){$('#notice').hidden=true}
function lock(message){authGeneration++;detailSequence++;busy=false;draftNeededBy='';sendMessage('');sessionUser=null;userId='';organizing=false;requests=[];projects=[];canManage=false;photos.forEach(p=>{if(p.url)URL.revokeObjectURL(p.url)});photos=[];photoAdds=0;items=[];mutation=null;createId=null;pendingCreate=null;detailRequest=null;detailEtag='';if(listController)listController.abort();if($('#detailDialog').open)$('#detailDialog').close();$('#detailBody').replaceChildren();$('#detailFooter').replaceChildren();photoObjectUrls.forEach(URL.revokeObjectURL);photoObjectUrls.clear();$('#photoTray').replaceChildren();$('#historyList').replaceChildren();$('#requestForm').reset();$('#requestForm').inert=false;pendingUi();$('#itemsList').replaceChildren();$('#itemsPanel').hidden=true;$('#accountName').textContent='';$('#gateMessage').textContent=message;$('#gateActions').replaceChildren();$('#authGate').hidden=false;document.body.classList.add('loading')}
function userKey(){return userId?'agora-compras-draft-v1:'+userId:null}function pendingKey(){return userId?'agora-compras-pending-v1:'+userId:null}function safeGet(key){try{return key?localStorage.getItem(key):null}catch{return null}}function safeSet(key,value){try{if(key)localStorage.setItem(key,value);return true}catch{return false}}function safeRemove(key){try{if(key)localStorage.removeItem(key)}catch{}}
function saveDraft(){
 if(!userKey())return;
 const fields={};
 for(const id of ['rawText','title','destination','project','priority','notes'])fields[id]=$('#'+id).value;
 safeSet(userKey(),JSON.stringify({...fields,items,neededBy:draftNeededBy}));
}
function restoreDraft(){
 try{
  const draft=JSON.parse(safeGet(userKey())||'null');if(!draft)return;
  for(const id of ['rawText','title','project','notes'])$('#'+id).value=draft[id]||'';
  $('#destination').value=draft.destination||'unassigned';$('#priority').value=draft.priority||'normal';
  draftNeededBy=draft.neededBy||'';
  items=Array.isArray(draft.items)?draft.items.slice(0,80).filter(i=>i&&typeof i==='object').map(i=>({description:String(i.description||'').slice(0,300),quantity:String(i.quantity??'').slice(0,40),unit:String(i.unit||'').slice(0,30),notes:String(i.notes||'').slice(0,1000),...(i.destination?{destination:i.destination}:{})})):[];
  syncDestination();if(items.length)renderItems();
 }catch{}
}
async function tokenFor(generation=authGeneration){if(!sessionUser||generation!==authGeneration)throw Error('Sessão alterada. Entre novamente.');const token=await window.AgoraSistemaAuth.token();if(!token||generation!==authGeneration)throw Error('Sessão expirada ou alterada. Entre novamente.');return token}
async function api(method,payload,query='',generation=authGeneration){const token=await tokenFor(generation),headers={Authorization:'Bearer '+token};if(payload)headers['Content-Type']='application/json';const response=await fetch(API+query,{method,headers,cache:'no-store',credentials:'omit',signal:typeof AbortSignal.timeout==='function'?AbortSignal.timeout(payload?.action==='organize'?120000:60000):undefined,body:payload?JSON.stringify(payload):undefined});if(generation!==authGeneration)throw Error('A sessão mudou durante a operação.');let data={};if(response.headers.get('content-type')?.includes('application/json')){try{data=await response.json()}catch{}}if(generation!==authGeneration)throw Error('A sessão mudou durante a resposta.');if(!response.ok){const e=Error(data.error||`Não foi possível concluir a operação (${response.status}).`);e.status=response.status;throw e}return{data,response}}
async function apiBlob(url,generation=authGeneration){const token=await tokenFor(generation),r=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});if(generation!==authGeneration)throw Error('A sessão mudou durante o carregamento.');if(!r.ok){let d={};try{d=await r.json()}catch{}if(generation!==authGeneration)throw Error('A sessão mudou durante a resposta da foto.');throw Error(d.error||'Não foi possível carregar a foto.')}const blob=await r.blob();if(generation!==authGeneration)throw Error('A sessão mudou durante o carregamento da foto.');return blob}
async function loadList(){
 if(listController)listController.abort();
 const controller=new AbortController();listController=controller;
 const g=authGeneration,token=await tokenFor(g);
 const response=await fetch(API,{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit',signal:controller.signal});
 const result=await response.json();
 if(g!==authGeneration||controller!==listController)return;
 if(!response.ok||!Array.isArray(result.requests))throw Error(result.error||'Não foi possível carregar o histórico.');
 requests=result.requests;projects=Array.isArray(result.projects)?result.projects:[];canManage=result.canManage===true;fillProjectOptions();renderHistory();
}
function fillProjectOptions(){const dest=$('#project'),filter=$('#projectFilter'),selected=dest.value,filterSelected=filter.value;dest.replaceChildren(el('option',{value:''},'Selecione um projeto'));filter.replaceChildren(el('option',{value:''},'Todos os projetos'));for(const p of projects){const label=`${p.code} — ${p.name}`;dest.append(el('option',{value:p.code},label));filter.append(el('option',{value:p.code},label))}dest.value=selected;filter.value=filterSelected;const st=$('#statusFilter'),sv=st.value;st.replaceChildren(el('option',{value:''},'Todas as situações'));Object.entries(STATUSES).forEach(([v,l])=>st.append(el('option',{value:v},l)));st.value=sv}
function projectName(code){return projects.find(p=>p.code===code)?.name||code||''}function dateLabel(d){if(!d)return'—';const s=String(d);let x;if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const[y,m,day]=s.split('-').map(Number);x=new Date(y,m-1,day,12)}else x=new Date(d);return Number.isNaN(+x)?s:x.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}
function renderHistory(){
 const host=$('#historyList'),term=$('#search').value.trim().toLocaleLowerCase('pt-BR'),st=$('#statusFilter').value,pr=$('#projectFilter').value;
 const result=document.createDocumentFragment();
 for(const request of requests){
  if(!Array.isArray(request.lines)){result.append(el('p',{class:'muted'},'Atualização do histórico em andamento. Toque em Atualizar histórico.'));break}
  for(const item of request.lines){
   if(st&&item.status!==st||pr&&item.destination?.projectCode!==pr)continue;
   const terms=[item.description,item.supplier,item.notes,request.createdByLabel,destinationLabel(item.destination)].join(' ').toLocaleLowerCase('pt-BR');
   if(term&&!terms.includes(term))continue;
   const entry=el('button',{type:'button',class:'request-card','aria-label':'Abrir '+item.description});
   const head=el('span',{class:'entry-head'}),name=el('strong',{},item.description),arrow=el('span',{'aria-hidden':'true'},'›');
   head.append(name,arrow);
   const meta=el('span',{class:'request-meta'});
   meta.append(el('span',{class:'badge','data-status':item.status},STATUSES[item.status]),el('span',{},destinationLabel(item.destination)));
   const parts=[[item.quantity,item.unit].filter(Boolean).join(' '),item.supplier,request.priority==='urgent'?'Urgente':'',dateLabel(request.createdAt)].filter(Boolean);
   entry.append(head,meta,el('small',{class:'entry-info'},parts.join(' · ')));
   entry.addEventListener('click',()=>openDetail(request.id,item.id));result.append(entry);
  }
 }
 if(!result.childNodes.length)result.append(el('p',{class:'muted'},requests.length?'Nenhum item encontrado com esses filtros.':'Nenhum item solicitado.'));
 host.replaceChildren(result);
}
function cleanQuantityNote(notes,quantity){const value=String(notes||'');if(!String(quantity||'').trim())return value;return value.replace(/(^|\s)Quantidade não informada(?:\.(?=\s|$)|$)/g,' ').trim()}function syncItemQuantityNote(item,input){const cleaned=cleanQuantityNote(item.notes,item.quantity);if(cleaned!==item.notes){item.notes=cleaned;if(input)input.value=cleaned}}
function destinationSelect(value,inherit=false){
 const s=el('select');
 if(inherit)s.append(el('option',{value:'inherit'},'Usar destino da solicitação'));
 for(const kind of ['unassigned','stock','general'])s.append(el('option',{value:kind},DEST[kind]));
 for(const p of projects)s.append(el('option',{value:p.code},`${p.code} — ${p.name}`));
 s.value=value?.kind==='project'?value.projectCode:value?.kind||(inherit?'inherit':'unassigned');return s;
}
function selectedDestination(value){return projects.some(p=>p.code===value)?{kind:'project',projectCode:value}:{kind:value,projectCode:''};}
function syncDestination(){const project=$('#destination').value==='project';$('#projectField').hidden=!project;$('#project').required=project}function newItem(){return{description:'',quantity:'',unit:'',notes:''}}function renderItems(){const host=$('#itemsList');host.replaceChildren();$('#itemsPanel').hidden=false;items.forEach((it,i)=>{const row=el('div',{class:'item-row'}),desc=el('input',{value:it.description||'',maxlength:'300',placeholder:'Descrição', 'aria-label':`Descrição do item ${i+1}`}),qty=el('input',{value:it.quantity||'',maxlength:'40',placeholder:'Qtd.', 'aria-label':`Quantidade do item ${i+1}`}),unit=el('input',{value:it.unit||'',maxlength:'30',placeholder:'Unidade', 'aria-label':`Unidade do item ${i+1}`}),notes=el('input',{class:'wide',value:it.notes||'',maxlength:'1000',placeholder:'Observação (opcional)','aria-label':`Observação do item ${i+1}`}),remove=el('button',{type:'button','aria-label':`Remover item ${i+1}`},'Remover');[desc,qty,unit,notes].forEach((n,j)=>n.addEventListener('input',()=>{const k=['description','quantity','unit','notes'][j];items[i][k]=n.value;if(k==='quantity')syncItemQuantityNote(items[i],notes);saveDraft()}));remove.addEventListener('click',()=>{items.splice(i,1);renderItems();saveDraft()});const dest=destinationSelect(it.destination,true);dest.setAttribute('aria-label',`Destino do item ${i+1}`);dest.addEventListener('change',()=>{if(dest.value==='inherit')delete it.destination;else it.destination=selectedDestination(dest.value);saveDraft()});row.append(desc,qty,unit,notes,dest,remove);host.append(row)})}
function bytesBase64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Não foi possível preparar a imagem.'));reader.readAsDataURL(blob)})}
async function compress(file,generation){if(generation!==authGeneration)throw Error('Sessão alterada.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use imagens JPEG, PNG ou WebP.');if(file.size>20*1024*1024)throw Error('Cada imagem original deve ter até 20 MB.');const image=new Image(),url=URL.createObjectURL(file);try{image.src=url;await image.decode();if(generation!==authGeneration)throw Error('Sessão alterada durante o processamento da foto.');if(image.width*image.height>40e6)throw Error('A imagem é grande demais para processar neste aparelho.');const scale=Math.min(1,2400/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d',{alpha:false}).drawImage(image,0,0,canvas.width,canvas.height);for(const q of [.88,.78,.68,.58,.48,.38]){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',q));if(generation!==authGeneration)throw Error('Sessão alterada durante o processamento da foto.');if(blob&&blob.size<=MAX_PHOTO)return blob}throw Error('Não foi possível comprimir a foto abaixo de 900 KB.')}finally{URL.revokeObjectURL(url)}}
async function addFiles(files){if(busy||pendingCreate)return;const g=authGeneration;hideNotice();let added=0;for(const f of files){if(g!==authGeneration)return;if(photos.length+photoAdds>=6){show('O limite é de 6 fotos por solicitação.');break}photoAdds++;try{const blob=await compress(f,g);if(g!==authGeneration)return;const base64=await bytesBase64(blob);if(g!==authGeneration)return;const photo={blob,base64,name:(f.name||'foto').replace(/\.[^.]+$/,'')+'.jpg',mimeType:'image/jpeg',size:blob.size,url:URL.createObjectURL(blob),purpose:'reference'};photos.push(photo);photoObjectUrls.add(photo.url);added++}catch(e){if(g===authGeneration)show(e.message,'error')}finally{photoAdds=Math.max(0,photoAdds-1)}}if(g===authGeneration&&added)renderPhotos()}
function renderPhotos(){const tray=$('#photoTray');tray.replaceChildren();photos.forEach((p,i)=>{const c=el('div',{class:'photo-card'}),img=el('img',{src:p.url,alt:`Foto ${i+1}: ${p.name}`}),purpose=el('select',{'aria-label':`Finalidade da foto ${i+1}`});purpose.append(el('option',{value:'reference'},'Foto de referência'),el('option',{value:'extract-list'},'Extrair lista desta foto'));purpose.value=p.purpose||'reference';purpose.addEventListener('change',()=>{p.purpose=purpose.value;updateOrganizeHint()});const b=el('button',{type:'button','aria-label':`Remover foto ${i+1}`},'×');b.addEventListener('click',()=>{URL.revokeObjectURL(p.url);photoObjectUrls.delete(p.url);photos.splice(i,1);renderPhotos()});c.append(img,purpose,b);tray.append(c)});updateOrganizeHint()}
function updateOrganizeHint(){const n=photos.filter(p=>p.purpose==='extract-list').length;if(n>2)show('Selecione no máximo duas fotos para extrair a lista.','error')}
async function organize(){if(busy||pendingCreate||organizing)return;const g=authGeneration,raw=$('#rawText').value.trim(),selectedPhotos=photos.filter(p=>p.purpose==='extract-list');hideNotice();if(selectedPhotos.length>2){show('Não é possível organizar: selecione no máximo 2 fotos para extração. Desmarque uma ou mais fotos e tente novamente.','error');updateOrganizeHint();return}if(!raw&&!selectedPhotos.length){show('Escreva uma descrição ou marque uma foto para extração. Fotos de referência não são enviadas à IA.','error');return}organizing=true;const b=$('#organize');b.disabled=true;b.textContent='Organizando…';try{const imageInputs=selectedPhotos.map(p=>({purpose:'extract-list',mimeType:p.mimeType,fileBase64:p.base64}));const {data}=await api('POST',{action:'organize',rawText:raw,images:imageInputs},'',g);if(g!==authGeneration)return;if(raw!==$('#rawText').value.trim()||selectedPhotos.some(p=>!photos.includes(p)||p.purpose!=='extract-list')){show('A lista mudou. Toque em Organizar com IA para usar a versão atual.');return}if(!Array.isArray(data.items))throw Error('Resposta de organização incompleta.');items=data.items.map(i=>({description:String(i.description||'').slice(0,300),quantity:String(i.quantity??'').slice(0,40),unit:String(i.unit||'').slice(0,30),notes:String(i.notes||'').slice(0,1000)}));items.forEach(i=>syncItemQuantityNote(i));renderItems();if(Array.isArray(data.warnings)&&data.warnings.length)show(data.warnings.join(' '));saveDraft()}catch(e){if(g===authGeneration){show('A IA não organizou agora. Você pode enviar o texto e as fotos mesmo assim. '+e.message,'error');}}finally{if(g===authGeneration){b.disabled=false;b.textContent='✦ Organizar com IA';organizing=false}}}
function sendMessage(text,error=false){const n=$('#sendStatus');n.textContent=text;n.hidden=!text;n.classList.toggle('error',error)}
function pendingUi(){
 const form=$('#requestForm'),send=$('#submitRequest');
 for(const c of form.querySelectorAll('input,textarea,select,button'))c.disabled=busy||Boolean(pendingCreate)&&c!==send;
 send.textContent=busy?'Enviando…':pendingCreate?'Verificar envio':'Enviar solicitação';
 form.setAttribute('aria-busy',String(busy));
}
function makeCreatePayload(){const destination={kind:$('#destination').value,projectCode:$('#destination').value==='project'?$('#project').value:''};if(destination.kind==='project'&&!destination.projectCode)throw Error('Selecione um projeto.');const rawText=$('#rawText').value;if(rawText.length>8000)throw Error('O texto ultrapassa 8000 caracteres.');if(items.length>80)throw Error('O limite é 80 itens.');if(items.some(i=>!String(i.description||'').trim()))throw Error('Preencha a descrição de cada item ou remova a linha vazia.');return{id:createId,title:$('#title').value.trim(),rawText,destination,priority:$('#priority').value,neededBy:draftNeededBy,items:items.map(i=>({description:String(i.description||'').trim(),quantity:String(i.quantity??''),unit:String(i.unit||''),notes:cleanQuantityNote(i.notes,i.quantity),...(i.destination?{destination:i.destination}:{})})),notes:$('#notes').value.trim(),photos:photos.filter(p=>p.serverId).map(p=>({id:p.serverId,name:p.serverName||p.name,mimeType:p.mimeType,size:p.size}))}}
async function uploadPhotos(){const g=authGeneration;for(const p of photos){if(p.serverId)continue;const {data}=await api('POST',{action:'upload-photo',requestId:createId,fileName:p.name,mimeType:p.mimeType,fileBase64:p.base64},'',g);if(!data.photo?.id)throw Error('A API não confirmou o envio de uma foto.');p.serverId=data.photo.id;p.serverName=data.photo.name||p.name}}
function resetForm(){
 safeRemove(userKey());$('#requestForm').reset();$('#extraFields').open=false;
 photos.forEach(p=>{if(p.url){URL.revokeObjectURL(p.url);photoObjectUrls.delete(p.url)}});
 photos=[];items=[];mutation=null;createId=null;pendingCreate=null;draftNeededBy='';
 $('#itemsList').replaceChildren();$('#itemsPanel').hidden=true;syncDestination();renderPhotos()
}
function savePending(){return safeSet(pendingKey(),JSON.stringify(pendingCreate))}
function removePending(){safeRemove(pendingKey());pendingCreate=null;pendingUi()}
async function readById(id,g){
 try{const {data}=await api('GET',null,`?action=read&id=${encodeURIComponent(id)}`,g);return data.request||null}catch(e){if(e.status===404)return null;throw e}
}
async function confirmSaved(request,g){
 if(g!==authGeneration)return;
 if(request?.id!==pendingCreate?.request.id||!request?.id)throw Error('A gravação ainda não foi confirmada.');
 removePending();resetForm();
 const count=request.lines?.length||request.items?.length||1;sendMessage(count===1?'Item enviado.':`${count} itens enviados.`);
 requests=[request,...requests.filter(r=>r.id!==request.id)];renderHistory();
 // A failed background refresh must never turn a confirmed write into a retry.
 try{await loadList()}catch(e){if(g===authGeneration&&e.name!=='AbortError')show('Itens salvos. Toque em Atualizar histórico para reler a lista.')}
}
async function postPending(g){
 const {request,mutationId}=pendingCreate;
 const {data}=await api('POST',{action:'create',mutationId,request},'',g);
 await confirmSaved(data.request,g);
}
async function recoverPending(g){
 const saved=safeGet(pendingKey());if(!saved)return;
 try{const parsed=JSON.parse(saved);if(!parsed?.request?.id||!parsed.mutationId){removePending();return}
 pendingCreate=parsed;pendingUi();const existing=await readById(parsed.request.id,g);
 if(g!==authGeneration)return;if(existing)await confirmSaved(existing,g);else sendMessage('O envio anterior está pendente. Toque em Verificar envio.');
 }catch{if(g===authGeneration)sendMessage('Confira a conexão e toque em Verificar envio.',true)}
}
async function submit(event){
 event.preventDefault();if(busy)return;
 if(organizing||photoAdds){sendMessage('Aguarde o preparo dos itens e fotos.');return}
 const g=authGeneration;hideNotice();
 if(!pendingCreate&&!$('#rawText').value.trim()&&!photos.length&&!items.length){sendMessage('Inclua um material ou uma foto.',true);$('#rawText').focus();return}
 busy=true;pendingUi();sendMessage(photos.some(p=>!p.serverId)?'Enviando fotos…':'Salvando itens…');
 try{
  if(!pendingCreate){
   createId||=crypto.randomUUID();mutation||=crypto.randomUUID();makeCreatePayload();
   await uploadPhotos();if(g!==authGeneration)return;
   pendingCreate={mutationId:mutation,request:makeCreatePayload()};if(!savePending())sendMessage('Salvando itens… Mantenha a página aberta até confirmar.');
  }
  try{await postPending(g)}catch(e){
   if(g!==authGeneration)return;
   if(e.status&&e.status<500&&e.status!==408)throw e;
   // Reuse precisely the same body/UUID even if the first response was lost after commit.
   sendMessage('Conferindo o envio…');await postPending(g);
  }
 }catch(e){
  if(g!==authGeneration)return;
  if(pendingCreate&&[400,413,422].includes(e.status)){removePending();createId=null;mutation=null;for(const photo of photos)delete photo.serverId}
  const text=pendingCreate?'Não foi possível confirmar. Toque em Verificar envio.':e.message||'Não foi possível enviar.';
  sendMessage(e.status===409?'O pedido mudou. Atualize o histórico para conferir.':text,true);
 }finally{if(g===authGeneration){busy=false;pendingUi()}}
}
function destinationLabel(d){return d?.kind==='project'?`Projeto · ${d.projectCode} — ${projectName(d.projectCode)}`:DEST[d?.kind]||'A definir'}
async function openDetail(id,lineId){
 hideNotice();const g=authGeneration,seq=++detailSequence,dialog=$('#detailDialog');
 detailRequest=null;activeLineId=lineId;detailEtag='';$('#detailFooter').replaceChildren();$('#detailBody').replaceChildren();
 $('#detailTitle').textContent='Carregando item…';if(!dialog.open)dialog.showModal();
 try{const {data}=await api('GET',null,`?action=read&id=${encodeURIComponent(id)}`,g);
 if(g!==authGeneration||seq!==detailSequence||!dialog.open)return;
 if(!data.request?.lines?.some(i=>i.id===lineId)||!data.etag)throw Error('Atualize o histórico para consultar este item.');
 detailRequest=data.request;detailEtag=data.etag;renderDetail()
 }catch(e){if(g===authGeneration&&seq===detailSequence)$('#detailBody').textContent=e.message}
}
function button(label,fn,kind='quiet'){const b=el('button',{type:'button',class:'button '+kind},label);b.addEventListener('click',fn);return b}
function fieldWrap(label,node){node.setAttribute('aria-label',label);const w=el('label',{class:'field'});w.append(el('span',{},label),node);return w}
function clearDetailPhotos(){for(const img of $('#detailBody').querySelectorAll('img'))if(img.src.startsWith('blob:')){URL.revokeObjectURL(img.src);photoObjectUrls.delete(img.src)}}
function renderDetail(){
 clearDetailPhotos();
 const request=detailRequest,item=request?.lines.find(i=>i.id===activeLineId);if(!item)return;
 const body=$('#detailBody'),footer=$('#detailFooter');
 $('#detailTitle').textContent=item.description;body.replaceChildren();footer.replaceChildren();
 const editable=canManage||(request.createdBy===userId&&['requested','quoting'].includes(item.status));
 const summary=el('div',{class:'request-meta'});summary.append(el('span',{class:'badge','data-status':item.status},STATUSES[item.status]),el('span',{},destinationLabel(item.destination)));body.append(summary);
 const controls=el('div',{class:'detail-controls'});
 let status,dest,supplier,desc,qty,unit,note;
 if(editable){
  if(canManage){status=el('select');for(const [v,t] of Object.entries(STATUSES))status.append(el('option',{value:v},t));status.value=item.status;controls.append(fieldWrap('Situação do item',status))}
  dest=destinationSelect(item.destination);supplier=el('input',{maxlength:'160',value:item.supplier||'',placeholder:'Opcional'});controls.append(fieldWrap('Destino do item',dest),fieldWrap('Fornecedor',supplier));body.append(controls);
  const edit=el('details',{class:'extra-fields'});edit.append(el('summary',{},'Descrição e quantidade'));
  desc=el('textarea',{maxlength:String(Math.max(300,item.description.length)),rows:'2'},item.description);qty=el('input',{value:item.quantity||'',maxlength:'40'});unit=el('input',{value:item.unit||'',maxlength:'30'});note=el('textarea',{maxlength:'1000',rows:'2'},item.notes||'');
  edit.append(fieldWrap('Descrição',desc),fieldWrap('Quantidade',qty),fieldWrap('Unidade',unit),fieldWrap('Observação do item',note));body.append(edit);
  footer.append(button('Salvar item',()=>{
   const line={id:item.id};
   for(const [k,v] of Object.entries({description:desc.value.trim(),quantity:qty.value.trim(),unit:unit.value.trim(),notes:cleanQuantityNote(note.value,qty.value),supplier:supplier.value.trim()}))if(v!==(item[k]||''))line[k]=v;
   const target=selectedDestination(dest.value);
   if(target.kind!==item.destination.kind||target.projectCode!==(item.destination.projectCode||''))line.destination=target;
   if(status&&status.value!==item.status)line.status=status.value;
   if(Object.keys(line).length===1){$('#detailDialog').close();return}
   void saveDetailChange({line});
  },'primary'));
 }
 const parts=[[item.quantity,item.unit].filter(Boolean).join(' '),item.notes,!editable&&item.supplier].filter(Boolean);
 if(parts.length)body.prepend(el('p',{class:'line-summary'},parts.join(' · ')));
 const origin=el('details',{class:'extra-fields'});origin.append(el('summary',{},'Solicitação original'));
 const original=request.originalRawText??request.rawText;const data=[request.title,original,request.rawText!==original?request.rawText:'',request.notes,request.neededBy?`Prazo: ${dateLabel(request.neededBy)}`:'',`${request.createdByLabel||''} · ${dateLabel(request.createdAt)}`].filter(Boolean);
 for(const value of new Set(data))origin.append(el('p',{class:'original-text'},value));
 body.append(origin);
 if(canManage||(request.createdBy===userId&&['requested','quoting'].includes(request.status)&&editable)){
  const extra=el('details',{class:'extra-fields'});extra.append(el('summary',{},'Editar dados da solicitação'));
  const title=el('input',{value:request.title||'',maxlength:'140'}),raw=el('textarea',{maxlength:'8000',rows:'3'},request.rawText||''),priority=el('select'),notes=el('textarea',{maxlength:'1000',rows:'2'},request.notes||'');
  priority.append(el('option',{value:'normal'},'Normal'),el('option',{value:'urgent'},'Urgente'));priority.value=request.priority;raw.readOnly=request.history?.some(h=>h.action==='line_updated')||false;
  extra.append(fieldWrap('Título',title),fieldWrap('Texto da solicitação',raw),fieldWrap('Prioridade',priority),fieldWrap('Observações gerais',notes),button('Salvar dados da solicitação',()=>{const change={};for(const [key,v] of Object.entries({title:title.value,rawText:raw.value,priority:priority.value,notes:notes.value}))if(v!==(request[key]||''))change[key]=v;if(Object.keys(change).length)void saveDetailChange(change)}));body.append(extra);
 }
 if(request.photos?.length){
  const photosBox=el('details',{class:'extra-fields'});photosBox.append(el('summary',{},`Fotos (${request.photos.length})`));const tray=el('div',{class:'photo-tray'});photosBox.append(tray);
  for(const p of request.photos){const img=el('img',{class:'detail-photo',alt:p.name||'Foto da solicitação','data-photo':p.id});img.addEventListener('click',()=>img.classList.toggle('expanded'));tray.append(img)}
  photosBox.addEventListener('toggle',()=>{if(photosBox.open&&!photosBox.dataset.loaded){photosBox.dataset.loaded='1';void loadDetailPhotos(request.photos,request.id,detailSequence)}});body.append(photosBox);
 }
 body.append(el('p',{id:'detailFeedback',role:'status'}));footer.append(button('Fechar',()=>$('#detailDialog').close()));
}
async function saveDetailChange(changes){
 const r=detailRequest,g=authGeneration,seq=detailSequence,etag=detailEtag,dialog=$('#detailDialog');
 if(!r||dialog.dataset.saving)return;dialog.dataset.saving='1';const body=$('#detailBody'),footer=$('#detailFooter');
 body.inert=true;footer.inert=true;$('#detailFeedback').textContent='Salvando…';
 try{
  const {data}=await api('PATCH',{action:'update',id:r.id,etag,changes},'',g);
  if(g!==authGeneration||seq!==detailSequence)return;
  if(!data.request?.lines||!data.etag)throw Error('A alteração ainda não foi confirmada.');
  detailRequest=data.request;detailEtag=data.etag;requests=requests.map(old=>old.id===r.id?data.request:old);
  renderHistory();renderDetail();$('#detailFeedback').textContent=changes.line?'Item atualizado.':'Solicitação atualizada.';
 }catch(e){
  if(g!==authGeneration||seq!==detailSequence)return;
  $('#detailFeedback').textContent=e.message;
  if(e.status===409)footer.prepend(button('Recarregar item',()=>openDetail(r.id,activeLineId)));
 }finally{if(g===authGeneration&&seq===detailSequence){delete dialog.dataset.saving;body.inert=false;footer.inert=false}}
}
async function loadDetailPhotos(list,id,seq){const g=authGeneration;for(const p of list){const img=$(`[data-photo="${CSS.escape(String(p.id))}"]`);if(!img)continue;try{const blob=await apiBlob(`${API}?action=photo&id=${encodeURIComponent(id)}&photoId=${encodeURIComponent(p.id)}`,g);if(g!==authGeneration||seq!==detailSequence||detailRequest?.id!==id||!$('#detailDialog').open||!img.isConnected)continue;const url=URL.createObjectURL(blob);photoObjectUrls.add(url);img.src=url}catch{if(g===authGeneration&&seq===detailSequence&&img.isConnected)img.alt='Foto protegida indisponível'}}}

function showGate(message,actions=[]){$('#gateMessage').textContent=message;const host=$('#gateActions');host.replaceChildren();actions.forEach(([label,fn])=>host.append(button(label,fn,'quiet')));$('#authGate').hidden=false;document.body.classList.add('loading')}
async function authenticate(){const g=++authGeneration;showGate('Verificando sessão interna…');try{await window.AgoraSistemaAuth.ready;if(g!==authGeneration)return;const user=await window.AgoraSistemaAuth.user();if(g!==authGeneration)return;if(!user){sessionUser=null;showGate('Entre com a conta da equipe Ágora para acessar solicitações.',[['Entrar',()=>window.AgoraSistemaAuth.signIn()],['Voltar à Organização',()=>location.href='/sistema/']]);return}sessionUser=user;userId=user.id;$('#accountName').textContent=user.fullName||user.username||user.primaryEmailAddress?.emailAddress||'Conta Ágora';await loadList();if(g!==authGeneration)return;restoreDraft();await recoverPending(g);if(g!==authGeneration)return;$('#authGate').hidden=true;document.body.classList.remove('loading')}catch(e){if(g!==authGeneration)return;lock(e.message);showGate(e.message,[['Tentar novamente',authenticate],['Trocar conta',async()=>window.AgoraSistemaAuth.signOut()],['Voltar à Organização',()=>location.href='/sistema/']])}}
function wire(){const form=$('#requestForm');form.addEventListener('submit',submit);$('#rawText').addEventListener('input',()=>{sendMessage('');saveDraft()});['title','destination','project','priority','notes'].forEach(id=>$('#'+id).addEventListener('input',()=>{if(id==='destination')syncDestination();saveDraft()}));$('#cameraFiles').addEventListener('change',e=>{void addFiles([...e.target.files]);e.target.value=''});$('#galleryFiles').addEventListener('change',e=>{void addFiles([...e.target.files]);e.target.value=''});$('#organize').addEventListener('click',organize);$('#addItem').addEventListener('click',()=>{items.push(newItem());renderItems();saveDraft()});$('#search').addEventListener('input',renderHistory);$('#statusFilter').addEventListener('change',renderHistory);$('#projectFilter').addEventListener('change',renderHistory);$('#refresh').addEventListener('click',async()=>{try{await loadList();show('Histórico atualizado.')}catch(e){show(e.message,'error')}});$('#printList').addEventListener('click',()=>window.print());$('#closeDetail').addEventListener('click',()=>$('#detailDialog').close());$('#logout').addEventListener('click',async()=>{const old=userKey();safeRemove(old);lock('Encerrando sessão…');await window.AgoraSistemaAuth.signOut()});$('#detailDialog').addEventListener('close',()=>{detailSequence++;detailRequest=null;detailEtag='';clearDetailPhotos();$('#detailBody').replaceChildren();$('#detailFooter').replaceChildren();delete $('#detailDialog').dataset.saving;$('#detailBody').inert=false;$('#detailFooter').inert=false});window.addEventListener('agora-sistema-auth-changed',()=>{void (async()=>{try{const g=authGeneration,user=await window.AgoraSistemaAuth.user();if(g!==authGeneration)return;if(!user||user.id!==userId){safeRemove(userKey());lock('A sessão mudou.');await authenticate()}}catch(e){lock(e.message);await authenticate()}})()});window.addEventListener('beforeunload',e=>{if(busy||pendingCreate){e.preventDefault();e.returnValue=''}});syncDestination()}
wire();void authenticate();
})();

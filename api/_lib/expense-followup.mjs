import { DriveInventoryStore } from './inventory-store.mjs';
import { initializeExpenseWorkflow, updateExpenseWorkflow, suggestExpenseDuplicates } from './expense-workflow.mjs';

export const EXPENSE_MASTER = 'user_3Jvm8LQLtHINAqVtQhagyoDC6nT';
export const expenseFolder = () => process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || '1665zvQOtbulPR59zjFLr37mflu9n31Yo';
const fail = (message, statusCode=400) => Object.assign(new Error(message), {statusCode});
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const STEPS=['recebido','lido','identificado','destinado','lancado','conferido'];

export function workflowFor(record) {
  const result=initializeExpenseWorkflow(record);
  if(!result.ok) throw fail('O acompanhamento deste registro precisa de revisão.',422);
  if(!result.state.etapas.recebido.concluida) {
    result.state.etapas.recebido={concluida:true,em:record.criado_em||null,por:record.atualizado_por||'registro existente',evidencias:[]};
  }
  return result.state;
}

export function preserveWorkflow(previous, record, actor) {
  if(!previous.id) return workflowFor(record);
  const state=workflowFor(previous);
  const changed=['obra','fornecedor','data','tipo','valor_total','itens','foto_drive_id'].filter(k=>!same(previous[k],record[k]));
  if(changed.length) {
    for(const step of STEPS.slice(1)) state.etapas[step]={concluida:false,em:null,por:null,evidencias:[]};
    if(state.historico.length>=500) throw fail('Histórico cheio: arquive a auditoria antes de continuar.',409);
    state.historico.push({tipo:'revisao_necessaria',em:new Date().toISOString(),por:actor,campos:changed});
  }
  return state;
}

export function requireWorkflowProof(operation) {
  if(!operation || typeof operation!=='object' || Array.isArray(operation)) throw fail('Operação inválida.');
  if(operation.type==='edit') throw fail('Edite os valores pelo formulário de despesas.');
  if(operation.type==='step') {
    const f=operation.fields||{};
    if(operation.step==='lido' && (!f.metodo || !f.paginas)) throw fail('Informe como o documento foi lido e as páginas conferidas.');
    if(['identificado','destinado','lancado','conferido'].includes(operation.step) &&
      (typeof f.observacao!=='string'||!f.observacao.trim())) throw fail('Descreva a identificação ou a conferência realizada.');
    if(['destinado','lancado','conferido'].includes(operation.step) &&
      (!Array.isArray(operation.evidence)||!operation.evidence.some(e=>e.url))) throw fail('Vincule a fonte no Drive ou no controle financeiro.');
    if(operation.step==='lancado' && (typeof f.referencia!=='string'||!f.referencia.trim())) throw fail('Informe a linha, evento ou seção do controle oficial.');
  }
}

export function createExpenseRepository(token, fetchImpl=fetch) {
  async function call(path, options={}) {
    const response=await fetchImpl('https://www.googleapis.com/'+path,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(25000)});
    if(!response.ok) throw fail(response.status===412?'O registro mudou em outra sessão. Recarregue antes de salvar.':'Não foi possível conferir o registro no Drive.',response.status===412?409:502);
    return response;
  }
  async function list() {
    let page, files=[];
    do {
      const q=new URLSearchParams({q:`'${expenseFolder()}' in parents and trashed=false and mimeType='application/json' and name contains 'agora_despesa_'`,fields:'nextPageToken,files(id,name)',pageSize:'1000'});
      if(page)q.set('pageToken',page);
      const data=await(await call('drive/v3/files?'+q)).json(); files.push(...(data.files||[]));page=data.nextPageToken;
      if(files.length>10000)throw fail('A fila excedeu o limite de consulta; consulte um período menor.',413);
    } while(page);
    return files.filter(f=>/^agora_despesa_\d+\.json$/.test(f.name));
  }
  async function read(id) {
    if(!Number.isSafeInteger(id)||id<1)throw fail('Identificador inválido.');
    const files=(await list()).filter(f=>f.name===`agora_despesa_${id}.json`);
    if(!files.length)throw fail('Despesa não encontrada.',404);
    if(files.length!==1)throw fail('Há mais de um arquivo para esta despesa. Concilie os registros antes de editar.',409);
    const store=new DriveInventoryStore({fileId:files[0].id,tokenProvider:async()=>token,fetchImpl});
    const {envelope,etag}=await store.get();
    if(envelope.id!==id)throw fail('Identidade do registro divergente.',422);
    return {record:envelope,etag,fileId:files[0].id,store};
  }
  async function records() {
    const files=await list(), result=[];
    for(let i=0;i<files.length;i+=8) result.push(...await Promise.all(files.slice(i,i+8).map(async f=>{
      const r=await call(`drive/v3/files/${f.id}?alt=media`);
      const data=await r.json();
      if(!Number.isSafeInteger(data.id))throw fail('Um registro da fila precisa de revisão.',422);
      return {...data,_file_id:f.id,acompanhamento_documental:workflowFor(data)};
    })));
    return result;
  }
  async function put(current,record,etag) {
    if(!etag||etag!==current.etag)throw fail('O registro mudou ou está sem versão. Recarregue antes de salvar.',409);
    const result=await current.store.put(record,etag);
    if(result.conflict)throw fail('O registro mudou em outra sessão. Recarregue antes de salvar.',409);
    const after=await current.store.get();
    if(!same(after.envelope,record))throw fail('A gravação não pôde ser confirmada. Recarregue antes de repetir.',409);
    return after;
  }
  async function proof(operation) {
    for(const evidence of (operation.evidence||[])) {
      if(!evidence.url)continue;
      let u;try{u=new URL(evidence.url);}catch{throw fail('Link de fonte inválido.');}
      if(u.protocol!=='https:'||u.username||u.password||!['docs.google.com','drive.google.com'].includes(u.hostname))throw fail('Use links HTTPS do Google Drive ou Google Docs.');
      const id=u.pathname.match(/\/(?:d|folders)\/([\w-]+)/)?.[1]||u.searchParams.get('id');
      if(!id||!/^[\w-]{10,}$/.test(id))throw fail('O link precisa identificar um arquivo ou pasta.');
      const meta=await(await call(`drive/v3/files/${id}?fields=id,trashed&supportsAllDrives=true`)).json();
      if(meta.trashed)throw fail('A evidência está na lixeira.');
    }
  }
  return {read,records,put,proof};
}

export async function handleExpenseWorkflow(body,user,token,fetchImpl=fetch) {
  if(body.action==='workflow'&&user.sub!==EXPENSE_MASTER)throw fail('Somente o Master pode registrar a conferência financeira.',403);
  const repo=createExpenseRepository(token,fetchImpl), current=await repo.read(Number(body.id));
  if(body.action==='workflow-read') {
    const duplicates=suggestExpenseDuplicates(current.record,await repo.records());
    return {record:{...current.record,acompanhamento_documental:workflowFor(current.record)},etag:current.etag,canManage:user.sub===EXPENSE_MASTER,duplicates:duplicates.suggestions||[]};
  }
  requireWorkflowProof(body.operation);
  const result=updateExpenseWorkflow(workflowFor(current.record),{...body.operation,actor:user.sub});
  if(!result.ok)throw fail(result.error.message,400);
  await repo.proof(body.operation);
  const record={...current.record,acompanhamento_documental:result.state,atualizado_em:new Date().toISOString(),atualizado_por:user.sub};
  const after=await repo.put(current,record,body.etag);
  return {ok:true,record:after.envelope,etag:after.etag};
}

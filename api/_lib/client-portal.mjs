// Client-facing projection. Never return the source envelope to a client.
export const PORTAL_MASTER = 'user_3Jvm8LQLtHINAqVtQhagyoDC6nT';
export const PORTAL_MODULES = ['budget', 'payments', 'progress', 'documents'];
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const list = x => Array.isArray(x) ? x : [];
const text = (x, n = 1000) => typeof x === 'string' ? x.slice(0, n) : '';
const key = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x);
export const userIdOK = x => typeof x === 'string' && /^user_[a-zA-Z0-9]{5,100}$/.test(x);
export const fail = (message, status = 400) => Object.assign(new Error(message), {status, safe: true});
const cents = x => Number.isSafeInteger(x) && x >= 0 && x <= 100_000_000_000 ? x : null;
const date = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x+'T12:00:00Z')) && new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x ? x : null;
const sum = xs => xs.every(x => x !== null) && Number.isSafeInteger(xs.reduce((a,b)=>a+b,0)) ? xs.reduce((a,b)=>a+b,0) : null;
const unique = xs => new Set(xs).size === xs.length;
export function validateEnvelope(raw) {
  if (!object(raw) || raw.schemaVersion !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0 ||
      !Array.isArray(raw.projects) || raw.projects.length > 100 || !Array.isArray(raw.clients) || raw.clients.length > 1000 ||
      !Array.isArray(raw.requests) || raw.requests.length > 1000 || !Array.isArray(raw.audit) || raw.audit.length > 5000 ||
      !unique(raw.projects.map(p=>p.id)) || !unique(raw.clients.map(c=>c.userId)) ||
      raw.projects.some(p=>!key(p.id) || typeof p.name !== 'string' || typeof p.published !== 'boolean' ||
        !unique(list(p.budgets).map(b=>b.id)) || !unique(list(p.documents).map(d=>d.id)) || list(p.documents).some(d=>!key(d.id)) ||
        !unique(list(p.payments?.items).map(r=>r.id))) ||
      raw.clients.some(c=>!userIdOK(c.userId) || !Array.isArray(c.grants) || !unique(c.grants.map(g=>g.projectId)) || c.grants.some(g=>!key(g.projectId)||!Array.isArray(g.modules)||g.modules.some(m=>!PORTAL_MODULES.includes(m))))) {
    throw fail('A base do portal precisa de revisão.', 503);
  }
  return raw;
}

export function projectModules(project) {
  return PORTAL_MODULES.filter(m => project.modules?.[m] === true);
}
export function permittedModules(state, userId, project, preview = false) {
  if (userId === PORTAL_MASTER && preview) return projectModules(project);
  if (!project.published) return null;
  const grant = state.clients.find(c=>c.userId===userId)?.grants.find(g=>g.projectId===project.id && g.active===true);
  return grant ? projectModules(project).filter(m=>grant.modules.includes(m)) : null;
}

export function budgetProjection(raw) {
  if (!object(raw) || !key(raw.id)) throw fail('Orçamento inválido.', 503);
  let count = 0; const ids = new Set();
  function node(n, depth) {
    if (!object(n) || !key(n.id) || ids.has(n.id) || depth > 6 || ++count > 3000) throw fail('Estrutura do orçamento inválida.', 503);
    ids.add(n.id);
    const children = list(n.children).map(x=>node(x,depth+1));
    // Parent values are derived exclusively from children; never add both.
    const totalCents = children.length ? sum(children.map(c=>c.totalCents)) : cents(n.totalCents);
    return {id:n.id,title:text(n.title,240),description:text(n.description,3000),quantity:typeof n.quantity==='number'&&Number.isFinite(n.quantity)&&n.quantity>=0?n.quantity:null,
      unit:text(n.unit,30),unitPriceCents:children.length?null:cents(n.unitPriceCents),totalCents,children};
  }
  const nodes = list(raw.nodes).map(n=>node(n,0));
  const computedTotalCents = nodes.length ? sum(nodes.map(n=>n.totalCents)) : null;
  const statedTotalCents = cents(raw.statedTotalCents);
  const reconciled = computedTotalCents !== null && (statedTotalCents === null || computedTotalCents === statedTotalCents);
  // A revision/reference is not evidence of acceptance.
  const approved = raw.status === 'approved' && object(raw.acceptance) && !!raw.acceptance.reference && !!date(raw.acceptance.date) && reconciled;
  return {id:raw.id,title:text(raw.title,240),version:text(raw.version,80),status:approved?'approved':['proposed','archived'].includes(raw.status)?raw.status:'reference',
    issuedAt:date(raw.issuedAt),validUntil:date(raw.validUntil),description:text(raw.description,3000),
    inclusions:list(raw.inclusions).slice(0,100).map(x=>text(x,1000)),exclusions:list(raw.exclusions).slice(0,100).map(x=>text(x,1000)),
    notes:list(raw.notes).slice(0,100).map(x=>text(x,1500)),nodes,totalCents:computedTotalCents,statedTotalCents,reconciled};
}

function receiptsProjection(raw) {
  const items=list(raw?.items).filter(r=>r.confirmed===true).slice(0,1000).map(r=>({id:text(r.id,100),date:date(r.date),
    description:text(r.description,500),amountCents:cents(r.amountCents),type:r.type==='refund'?'refund':'payment'}));
  const valid=items.every(r=>r.amountCents!==null&&r.date);
  const coverage=raw?.coverage==='complete'&&valid?'complete':items.length&&valid?'partial':'unconfirmed';
  const total=valid&&(items.length||coverage==='complete') ? items.reduce((a,r)=>a+(r.type==='refund'?-1:1)*r.amountCents,0):null;
  return {coverage,asOf:date(raw?.asOf),note:text(raw?.note,1000),items:valid?items:[],receivedCents:Number.isSafeInteger(total)?total:null};
}

export function projectProjection(project, modules) {
  const result={id:project.id,name:text(project.name,200),code:text(project.code,50),description:text(project.description,1500),location:text(project.location,200),
    updatedAt:text(project.updatedAt,80),modules:[...modules]};
  if (modules.includes('budget')) {
    result.budgets=list(project.budgets).filter(b=>b.visible===true).map(budgetProjection);
    result.currentBudgetId=result.budgets.some(b=>b.id===project.currentBudgetId)?project.currentBudgetId:null;
    const current=result.budgets.find(b=>b.id===result.currentBudgetId);
    result.contractedCents=current?.status==='approved'?current.totalCents:null;
  }
  if (modules.includes('payments')) result.payments=receiptsProjection(project.payments);
  if (modules.includes('budget')&&modules.includes('payments')) result.balanceCents=result.contractedCents!==null&&result.payments.coverage==='complete' ? result.contractedCents-result.payments.receivedCents:null;
  if (modules.includes('progress')) result.milestones=list(project.milestones).filter(m=>m.visible===true).slice(0,100).map(m=>({id:text(m.id,100),title:text(m.title,200),description:text(m.description,1000),status:['planned','in_progress','completed'].includes(m.status)?m.status:'planned',date:date(m.date)}));
  if (modules.includes('documents')) result.documents=list(project.documents).filter(d=>d.visible===true&&d.mimeType==='application/pdf').slice(0,100).map(d=>({id:text(d.id,100),title:text(d.title,200),category:text(d.category,100),date:date(d.date)}));
  return result;
}

export function listPortalProjects(state, userId) {
  const master=userId===PORTAL_MASTER;
  return {role:master?'master':'client',userId,projects:state.projects.filter(p=>master||permittedModules(state,userId,p)?.length).map(p=>({id:p.id,name:text(p.name,200),code:text(p.code,50),...(master?{published:p.published}:{})})),
    accessRequested:state.requests.some(r=>r.userId===userId&&r.status==='pending')};
}

export function readProject(state,userId,projectId,{preview=false,asUserId}={}) {
  const project=state.projects.find(p=>p.id===projectId);
  if(!project)throw fail('Projeto indisponível para esta conta.',404);
  if((preview||asUserId)&&userId!==PORTAL_MASTER)throw fail('Acesso não autorizado.',403);
  const modules=permittedModules(state,asUserId||userId,project,preview&&!asUserId);
  if(!modules?.length)throw fail('Projeto indisponível para esta conta.',404);
  return projectProjection(project,modules);
}

export function mutatePortal(state, input, actor, now = new Date().toISOString()) {
  if(!object(input)||!userIdOK(actor))throw fail('Solicitação inválida.');
  const next=structuredClone(state);
  if(input.action==='request-access') {
    if(next.requests.some(r=>r.userId===actor&&r.status==='pending'))return {state:next,unchanged:true};
    if(next.requests.length>=1000)throw fail('O cadastro precisa de revisão pelo Master.',409);
    const displayName=text(input.displayName,120).trim();
    if(displayName.length<2)throw fail('Informe seu nome.');
    next.requests.push({userId:actor,displayName,status:'pending',requestedAt:now});
  } else {
    if(actor!==PORTAL_MASTER)throw fail('Somente o Master pode gerenciar o portal.',403);
    const p=next.projects.find(p=>p.id===input.projectId);
    if(!p)throw fail('Projeto não encontrado.',404);
    if(input.action==='set-access') {
      if(!userIdOK(input.userId)||input.userId===PORTAL_MASTER||typeof input.active!=='boolean'||!Array.isArray(input.modules)||input.modules.some(m=>!PORTAL_MODULES.includes(m))||!unique(input.modules))throw fail('Permissões inválidas.');
      let c=next.clients.find(c=>c.userId===input.userId);
      if(!c){if(next.clients.length>=1000)throw fail('Limite de cadastros.',409);c={userId:input.userId,displayName:text(input.displayName,120),grants:[]};next.clients.push(c);}
      if(typeof input.displayName==='string'&&input.displayName.trim())c.displayName=text(input.displayName.trim(),120);
      const g={projectId:p.id,active:input.active,modules:[...input.modules],updatedAt:now,updatedBy:actor};
      c.grants=c.grants.filter(g=>g.projectId!==p.id);c.grants.push(g);
      for(const r of next.requests.filter(r=>r.userId===input.userId&&r.status==='pending'))r.status='reviewed';
    } else if(input.action==='set-publication') {
      if(typeof input.published!=='boolean'||!Array.isArray(input.modules)||input.modules.some(m=>!PORTAL_MODULES.includes(m)))throw fail('Publicação inválida.');
      if(input.published && input.modules.includes('budget') && list(p.budgets).filter(b=>b.visible).some(b=>!budgetProjection(b).reconciled))throw fail('Confira os totais do orçamento antes de liberar.',409);
      p.published=input.published;p.modules=Object.fromEntries(PORTAL_MODULES.map(m=>[m,input.modules.includes(m)]));p.updatedAt=now;
    } else throw fail('Operação não permitida.');
  }
  if(next.audit.length>=5000)throw fail('Arquive a auditoria antes de continuar.',409);
  next.revision++;next.updatedAt=now;
  next.audit.push({revision:next.revision,action:input.action,actor,at:now,projectId:text(input.projectId,100),userId:input.action==='request-access'?actor:text(input.userId,120),...(input.action==='set-access'?{active:input.active,modules:input.modules}:{}),...(input.action==='set-publication'?{published:input.published,modules:input.modules}:{})});
  return {state:validateEnvelope(next),unchanged:false};
}

export function adminProjection(state) {
  return {revision:state.revision,updatedAt:state.updatedAt,projects:state.projects.map(p=>({id:p.id,name:text(p.name,200),published:p.published,modules:projectModules(p),sourceNotes:text(p.sourceNotes,3000)})),
    clients:state.clients.map(c=>({userId:c.userId,displayName:text(c.displayName,120),grants:c.grants.map(g=>({projectId:g.projectId,active:g.active===true,modules:g.modules}))})),
    requests:state.requests.filter(r=>r.status==='pending').map(r=>({userId:r.userId,displayName:text(r.displayName,120),requestedAt:r.requestedAt})),audit:state.audit.slice(-50)};
}

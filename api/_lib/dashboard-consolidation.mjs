import { forecast } from '../../dashboard/rh-forecast.js';
const DAY=86400000;
const rec=v=>v&&typeof v==='object'&&!Array.isArray(v);
const list=v=>Array.isArray(v)?v:[];
const str=(v,n=800)=>typeof v==='string'?v.trim().slice(0,n):undefined;
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const iso=t=>new Date(t).toISOString().slice(0,10);
const normalized=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const closed=v=>['concluida','concluido','cancelada','cancelado','resolved','completed','cancelled','resolvido','resolvida'].includes(normalized(v));
export function periodBounds(name='next7days',now=new Date()) {
  const today=day(now),t=Date.parse(today),dow=new Date(t).getUTCDay();
  const monday=t-((dow+6)%7)*DAY;
  if(name==='currentWeek')return [iso(monday),iso(monday+6*DAY)];
  if(name==='nextWeek')return [iso(monday+7*DAY),iso(monday+13*DAY)];
  return [today,iso(t+6*DAY)];
}
export function normalizeWorkday(raw,now=new Date()) {
  const w=rec(raw?.workday)?raw.workday:{}, meta=rec(w.meta)?w.meta:{};
  const curated=list(w.items).filter(x=>rec(x)&&str(x.id)&&str(x.title)&&!closed(x.status));
  const tasks=list(w.tasks).filter(x=>rec(x)&&str(x.id)&&str(x.title||x.titulo)&&!closed(x.status)).map(x=>({
    id:x.id,title:x.title||x.titulo,status:x.status,priority:x.priority||x.prioridade,owner:x.owner,
    description:x.scope,projectId:x.projectId,waitingFor:'agente',
    nextAction:x.next_action||x.nextAction||x.done_when,
    asOf:str(x.updated_at,10),source:'Fila central de trabalho',
    sourceUrl:w.queueSourceUrl,date:validDate(x.due_date)?x.due_date:undefined
  }));
  const items=[...new Map([...curated,...tasks].map(x=>[x.id,x])).values()];
  return {items,meta:{asOf:meta.asOf||w.asOf,consultedAt:now.toISOString(),queueUpdatedAt:w.updated_at||meta.queueUpdatedAt,
    coverage:w.queueError?'Fila central indisponível; registros revisados anteriormente preservados.':
      (meta.coverage||'Registros selecionados dos projetos.')+(Array.isArray(w.tasks)?' Fila central: '+tasks.length+' tarefas abertas, consultadas ao vivo.':''),
    queueError:w.queueError===true}};
}
export function consolidateFinancial(raw,{now=new Date(),rhForecast}={}) {
  const root=rec(raw?.financeConsolidated)?raw.financeConsolidated:raw||{};
  const input=list(root.items),seen=new Map(),conflicts=new Set();
  let invalid=0;
  for(const x of input){
    if(!rec(x)||!str(x.id)){invalid++;continue;}
    const key=str(x.eventId||x.id,180);
    const item={id:str(x.id,180),eventId:key,projectId:str(x.projectId,80),title:str(x.title,300),payee:str(x.payee,180),
      dueDate:validDate(x.dueDate)?x.dueDate:null,amount:amount(x.amount),
      status:['confirmed','unconfirmed','paid','cancelled'].includes(x.status)?x.status:'unconfirmed',
      source:str(x.source,500),sourceUrl:str(x.sourceUrl,800),asOf:validDate(x.asOf)?x.asOf:undefined,description:str(x.coverage||x.description,800)};
    // Dedupe before filtering paid/cancelled, surfacing conflicting event states.
    if(seen.has(key)){
      const previous=seen.get(key),signature=v=>JSON.stringify([v.projectId,v.dueDate,v.amount,v.status]);
      if(signature(previous)!==signature(item))conflicts.add(key);
    }else seen.set(key,item);
  }
  conflicts.forEach(k=>seen.delete(k));
  const active=[...seen.values()].filter(x=>!['paid','cancelled'].includes(x.status));
  const unknown=active.filter(x=>x.dueDate===null||x.amount===null);
  const dated=active.filter(x=>x.dueDate!==null&&x.amount!==null);
  let rh=[];
  if(rec(rhForecast)&&!rhForecast.error)rh=forecast(rhForecast,now).map(x=>({paymentDate:x.paymentDate,total:x.total,group:x.group,status:x.status,asOf:rhForecast.asOf,sourceUrl:rhForecast.sourceUrl}));
  const sum=items=>items.length?items.reduce((s,x)=>s+Math.round(x.amount*100),0)/100:null;
  const periods=Object.fromEntries(['next7days','currentWeek','nextWeek'].map(name=>{
    const [from,to]=periodBounds(name,now),items=dated.filter(x=>x.dueDate>=from&&x.dueDate<=to),payroll=rh.filter(x=>x.paymentDate>=from&&x.paymentDate<=to);
    const known=payroll.filter(x=>amount(x.total)!==null);
    return [name,{name,from,to,items,rh:payroll,confirmedTotal:sum(items.filter(x=>x.status==='confirmed')),
      unconfirmedTotal:sum(items.filter(x=>x.status!=='confirmed')),rhTotal:known.length===payroll.length&&known.length?known.reduce((s,x)=>s+Math.round(x.total*100),0)/100:null}];
  }));
  const coverage=rec(root.coverage)?root.coverage:{};
  return {asOf:validDate(root.asOf)?root.asOf:undefined,consultedAt:now.toISOString(),periods,
    overdue:dated.filter(x=>x.dueDate<day(now)),unknown,
    coverage:{status:root.error?'unavailable':coverage.status||'partial',note:str(coverage.note,1500)||'Cobertura parcial. Ausência de registro não significa ausência de compromissos.',
      projects:rec(coverage.projects)?coverage.projects:{},conflicts:[...conflicts],invalid,rhStatus:!rhForecast||rhForecast.error?'unavailable':rh.some(x=>x.total===null)?'partial':'forecast'},
    controls:rec(root.controls)?root.controls:{}};
}

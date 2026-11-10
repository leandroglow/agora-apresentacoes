const TARGETS=[
 {id:'sistema',label:'Sistema Ágora',url:'https://apresentacoes.agoracons.com.br/sistema/',marker:'SISTEMA'},
 {id:'apresentacoes',label:'Apresentações',url:'https://apresentacoes.agoracons.com.br/galpao-017-quadros/',marker:'html'},
 {id:'ha',label:'Home Assistant',url:'https://ha.agoracons.com.br/auth/providers',json:true}
];
export async function checkAvailability(fetchImpl=fetch) {
 return Promise.all(TARGETS.map(async target=>{
  const checkedAt=new Date().toISOString();
  try{
   const r=await fetchImpl(target.url,{signal:AbortSignal.timeout(8000),redirect:'error'});
   const text=await r.text();
   let valid=r.ok&&text.length<2_000_000;
   if(target.json){try{valid=valid&&Array.isArray(JSON.parse(text).providers);}catch{valid=false;}}
   else valid=valid&&text.toLowerCase().includes(target.marker.toLowerCase());
   return {id:target.id,label:target.label,url:target.url,checkedAt,status:valid?'ok':'attention',detail:valid?(target.json?'Autenticação do Home Assistant respondeu. Integrações e dispositivos não foram acionados.':'Página respondeu com conteúdo esperado. Não é teste completo dos fluxos autenticados.'):`Resposta inesperada (HTTP ${r.status}).`};
  }catch{return {id:target.id,label:target.label,url:target.url,checkedAt,status:'unavailable',detail:'Não respondeu dentro do prazo de verificação.'};}
 }));
}
export function summarizeExpenses(records) {
 const steps=['recebido','lido','identificado','destinado','lancado','conferido'];
 const items=records.map(r=>{
  const w=r.acompanhamento_documental||{},stage=[...steps].reverse().find(s=>w.etapas?.[s]?.concluida)||'recebido';
  return {id:r.id,obra:String(r.obra||'').slice(0,200),fornecedor:String(r.fornecedor||'').slice(0,300),valor_total:Number.isFinite(r.valor_total)?r.valor_total:null,stage,blocked:w.bloqueio?.ativo===true,reason:String(w.bloqueio?.motivo||'').slice(0,1000)};
 });
 return {total:items.length,pending:items.filter(i=>i.stage!=='conferido'||i.blocked).length,blocked:items.filter(i=>i.blocked).length,reviewed:items.filter(i=>i.stage==='conferido'&&!i.blocked).length,items:items.filter(i=>i.stage!=='conferido'||i.blocked).sort((a,b)=>Number(b.blocked)-Number(a.blocked)||b.id-a.id).slice(0,100),coverage:'Entradas do Sistema; não representa toda a documentação financeira das obras.'};
}

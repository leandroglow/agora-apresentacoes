import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRhForecast, sanitizeDashboardData } from '../api/_lib/routes/dashboard.mjs';
import { forecast } from '../dashboard/rh-forecast.js';
const now=new Date('2026-11-15T14:00:00Z');
const config={rhForecast:{rhForecastFileId:'forecast123456',adjustments:[{id:'stale',amount:999}]}};
const event=(id,extra={})=>({id,pessoa_id:'p1',pagamento:'2026-11-20',valor:50,...extra});
const seed=()=>({
 forecast123456:{asOf:'2026-11-14',adjustmentsFileId:'ledger123456',groups:[{id:'g',anchor:'2026-11-20',people:[{id:'p1',dailyLabor:100,dailyCar:0}]}],events:[],adjustments:[{id:'stale',amount:999}]},
 ledger123456:{atualizado_em:'2026-11-15',ocorrencias:[],compensacoes:[event('c1',{confirmada:true})],adiantamentos:[event('a1',{aplicar_na_previsao:true,transferencia_comprovada:false})]}
});
const resolve=(files,at=now)=>loadRhForecast(config,async id=>structuredClone(files[id]),at);
test('source is read afresh and embedded copies never determine forecast',async()=>{
 const files=seed(), a=await resolve(files);
 assert.equal(forecast(a,now)[0].total,900); assert.equal(a.asOf,'2026-11-15');
 files.ledger123456.adiantamentos[0].valor=75;
 const b=await resolve(files); assert.equal(forecast(b,now)[0].total,875);
 assert.equal(b.sourceUrl,'https://drive.google.com/file/d/ledger123456/view');
 assert.match(b.adjustments[1].source,/transferência ainda não comprovada/);
});
test('planned stays visible, paid advance is deducted, settled never reapplied',async()=>{
 const files=seed(), advances=files.ledger123456.adiantamentos;
 advances.push(event('a2'),event('a3',{transferencia_comprovada:true}),event('a4',{liquidada:true,aplicar_na_previsao:true}));
 const a=await resolve(files), p=forecast(a,now)[0].rows[0];
 assert.equal(p.discount,150);assert.equal(p.pending.length,1);
 assert.equal(a.adjustments.find(x=>x.id==='a4'),undefined);
});
test('duplicate event applies once, conflicting duplicate blocks RH forecast',async()=>{
 const files=seed();files.ledger123456.compensacoes.push({...files.ledger123456.compensacoes[0]});
 assert.equal(forecast(await resolve(files),now)[0].total,900);
 files.ledger123456.compensacoes.push(event('c1',{confirmada:true,valor:99}));
 assert.equal((await resolve(files)).error,'RH_FORECAST_UNAVAILABLE');
});
test('missing pointers or unreadable/malformed ledger fail closed without embedded fallback',async()=>{
 assert.equal((await loadRhForecast({rhForecast:{adjustments:[]}},async()=>({}))).error,'RH_FORECAST_SOURCE_MISSING');
 assert.equal((await loadRhForecast(config,async()=>({groups:[]}))).error,'RH_LEDGER_SOURCE_MISSING');
 assert.equal((await loadRhForecast(config,async()=>{throw Error('offline')})).error,'RH_FORECAST_UNAVAILABLE');
 const files=seed();delete files.ledger123456.adiantamentos;
 assert.equal((await resolve(files)).error,'RH_FORECAST_UNAVAILABLE');
});
test('invalid amounts do not silently become zero or vanish',async()=>{
 for(const value of [null,'50',-1,NaN]){
  const files=seed();files.ledger123456.adiantamentos[0].valor=value;
  assert.equal((await resolve(files)).error,'RH_FORECAST_UNAVAILABLE');
 }
});
test('sanitizer exposes safe forecast, never private ledger fields',async()=>{
 const files=seed();files.ledger123456.adiantamentos[0].cpf='private';
 const a=sanitizeDashboardData({rhForecast:await resolve(files)}).rhForecast;
 assert.equal(a.adjustments[1].cpf,undefined); assert.equal(forecast(a,now)[0].total,900);
 assert.equal(sanitizeDashboardData({rhForecast:{error:'RH_FORECAST_UNAVAILABLE'}}).rhForecast.error,'RH_FORECAST_UNAVAILABLE');
});
test('events come only from ledger and cancellation restores the day',async()=>{
 const files=seed();files.ledger123456.ocorrencias=[{id:'o1',personId:'p1',date:'2026-11-19',type:'absence',days:1,status:'confirmed',source:'ponto'}];
 assert.equal(forecast(await resolve(files),now)[0].rows[0].normalDays,9);
 files.ledger123456.ocorrencias[0].status='cancelled';
 assert.equal(forecast(await resolve(files),now)[0].rows[0].normalDays,10);
 files.forecast123456.events=[{id:'legacy',personId:'p1',date:'2026-11-19',type:'absence',days:1,status:'confirmed'}];
 assert.equal(forecast(await resolve(files),now)[0].rows[0].normalDays,10);
});
test('large historical settled ledger remains readable',async()=>{
 const files=seed();files.ledger123456.compensacoes=Array.from({length:350},(_,i)=>event('settled-'+i,{liquidada:true}));
 const out=await resolve(files);assert.equal(out.error,undefined);assert.equal(out.adjustments.length,1);
 assert.equal(files.ledger123456.compensacoes.length,350);
});
const occurrence=(id,extra={})=>({id,personId:'p1',date:'2026-11-20',type:'absence',days:1,status:'confirmed',source:'Mensagem de teste',...extra});
test('new confirmed Friday absence changes only its forecast, planned or allocation do not',async()=>{
 const files=seed(); files.ledger123456.ocorrencias.push(occurrence('e1',{status:'planned'}),occurrence('loc',{type:'allocation',days:0,projectId:'teste'}));
 assert.equal(forecast(sanitizeDashboardData({rhForecast:await resolve(files)}).rhForecast,now)[0].total,900);
 files.ledger123456.ocorrencias[0].status='confirmed';
 assert.equal(forecast(sanitizeDashboardData({rhForecast:await resolve(files)}).rhForecast,now)[0].total,800);
 files.ledger123456.ocorrencias[0].status='cancelled';
 assert.equal(forecast(await resolve(files),now)[0].total,900);
});
test('rolling the window reads fresh data, preserves history and excludes private notes',async()=>{
 const files=seed();files.forecast123456.groups.push({id:'g2',anchor:'2026-11-27',people:[{id:'p2',dailyLabor:200,dailyCar:0}]});
 files.ledger123456.ocorrencias=Array.from({length:350},(_,i)=>occurrence('old'+i,{date:'2026-10-01'}));
 files.ledger123456.ocorrencias.push(occurrence('current'),occurrence('next',{date:'2026-12-04'}),occurrence('private',{type:'note',days:0,source:'nota privada'}));
 files.ledger123456.historico_registros=[{private:'revisão anterior'}];
 const before=JSON.stringify(files), out=await resolve(files), clean=sanitizeDashboardData({rhForecast:out}).rhForecast;
 assert.equal(clean.events.length,1); assert.equal(forecast(clean,now)[0].total,800);
 assert.equal(JSON.stringify(clean).includes('nota privada'),false);assert.equal('historico_registros' in out,false);
 const later=new Date('2026-11-21T03:00:00Z'), next=forecast(await resolve(files,later),later);
 assert.deepEqual(next.map(c=>c.paymentDate),['2026-11-27','2026-12-04']);assert.equal(next[1].total,900);
 assert.equal(JSON.stringify(files),before);
});
test('conflicting IDs and invalid occurrences stop RH instead of silently losing days',async()=>{
 for(const extra of [{date:'2026-02-30'},{personId:''},{days:null},{days:-1},{days:0.5},{days:true},{source:''}]){
  const files=seed();files.ledger123456.ocorrencias=[occurrence('x',extra)];
  assert.equal((await resolve(files)).error,'RH_FORECAST_UNAVAILABLE');
 }
 const files=seed();files.ledger123456.ocorrencias=[occurrence('x'),occurrence('x')];
 assert.equal((await resolve(files)).events.length,1);
 files.ledger123456.ocorrencias.push(occurrence('x',{status:'cancelled'}));assert.equal((await resolve(files)).error,'RH_FORECAST_UNAVAILABLE');
 delete files.ledger123456.ocorrencias;assert.equal((await resolve(files)).error,'RH_FORECAST_UNAVAILABLE');
});
test('sanitizer does not truncate active adjustments after long histories',async()=>{
 const files=seed();files.ledger123456.compensacoes=Array.from({length:350},(_,i)=>event('old'+i,{valor:0,confirmada:true,pagamento:'2025-01-10'}));
 const clean=sanitizeDashboardData({rhForecast:await resolve(files)}).rhForecast;
 assert.equal(clean.adjustments.length,351);assert.equal(forecast(clean,now)[0].total,950);
});

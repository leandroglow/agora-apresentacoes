import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRhForecast, sanitizeDashboardData } from '../api/_lib/routes/dashboard.mjs';
import { forecast } from '../dashboard/rh-forecast.js';
const now=new Date('2026-11-15T14:00:00Z');
const config={rhForecast:{rhForecastFileId:'forecast123456',adjustments:[{id:'stale',amount:999}]}};
const event=(id,extra={})=>({id,pessoa_id:'p1',pagamento:'2026-11-20',valor:50,...extra});
const seed=()=>({
 forecast123456:{asOf:'2026-11-14',adjustmentsFileId:'ledger123456',groups:[{id:'g',anchor:'2026-11-20',people:[{id:'p1',dailyLabor:100,dailyCar:0}]}],events:[],adjustments:[{id:'stale',amount:999}]},
 ledger123456:{atualizado_em:'2026-11-15',compensacoes:[event('c1',{confirmada:true})],adiantamentos:[event('a1',{aplicar_na_previsao:true,transferencia_comprovada:false})]}
});
const resolve=files=>loadRhForecast(config,async id=>structuredClone(files[id]));
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
 assert.equal(a.adjustments.find(x=>x.id==='a4').status,'settled');
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

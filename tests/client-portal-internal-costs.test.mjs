import test from 'node:test';
import assert from 'node:assert/strict';
import {PORTAL_MASTER,internalCostsProjection,listPortalProjects,readProject,mutatePortal,validateEnvelope} from '../api/_lib/client-portal.mjs';
const CLIENT='user_testclient';
const costs=()=>({asOf:'2026-11-11',coverage:'partial',source:{title:'Controle sintético',format:'xlsx'},documents:{total:3,reviewed:2,pending:1,duplicateCopies:1},
  totals:{costCents:999999,paidCents:999999},items:[{id:'invoice-1',category:'Elétrica',supplier:'Fornecedor privado',costCents:10000,paidCents:3000,sourceLabel:'NF sintética',bankAccount:'NEVER RETURN'},
    {id:'refund-1',category:'Elétrica',costCents:-1000,paidCents:-1000},{id:'pending-1',category:'Revisão',costCents:null,paidCents:null}]});
const state=()=>({schemaVersion:1,revision:1,projects:[{id:'019',name:'Projeto',code:'019',published:true,modules:{budget:true},budgets:[],payments:{items:[]},internalCosts:costs()},
  {id:'008',name:'Sem orçamento',code:'008',published:false,modules:{},internalCosts:{coverage:'unconfirmed',items:[],documents:{total:3,pending:3}}}],clients:[{userId:CLIENT,grants:[{projectId:'019',active:true,modules:['budget']}]}],requests:[],audit:[]});
test('cost totals derive from unique events and signed refunds, never supplied summaries',()=>{
  const r=internalCostsProjection(costs());assert.deepEqual(r.totals,{costCents:9000,paidCents:2000});assert.deepEqual(r.categories,[{name:'Elétrica',costCents:9000}]);
  assert.equal(r.coverage,'partial');assert.equal(r.items[2].costCents,null);assert.ok(!JSON.stringify(r).includes('NEVER RETURN'));
});
test('unknown costs are not represented by zero and incomplete sources cannot claim completeness',()=>{
  assert.equal(internalCostsProjection(state().projects[1].internalCosts).totals.costCents,null);
  const r=costs();r.coverage='complete';assert.equal(internalCostsProjection(r).coverage,'partial');
});
test('duplicate accounting event IDs fail rather than inflating total',()=>{
  const r=costs();r.items.push({...r.items[0]});assert.throws(()=>internalCostsProjection(r),e=>e.status===503);
});
test('only Master preview receives costs; clients, ordinary views and impersonation never do',()=>{
  const s=validateEnvelope(state());assert.equal(readProject(s,PORTAL_MASTER,'019',{preview:true}).internalCosts.totals.costCents,9000);
  for(const result of [readProject(s,CLIENT,'019'),readProject(s,PORTAL_MASTER,'019',{preview:true,asUserId:CLIENT}),listPortalProjects(s,CLIENT)]) {
    const json=JSON.stringify(result);for(const key of ['internalCosts','Fornecedor privado','costCents','NF sintética'])assert.ok(!json.includes(key));
  }
  assert.throws(()=>readProject(s,CLIENT,'019',{preview:true}),e=>e.status===403);
  assert.throws(()=>readProject(s,CLIENT,'008'),e=>e.status===404);
});
test('Master can inspect projects with no client modules or accounts; grants remain unchanged',()=>{
  const s=state();assert.equal(readProject(s,PORTAL_MASTER,'008',{preview:true}).internalCosts.coverage,'unconfirmed');
  const l=listPortalProjects(s,PORTAL_MASTER);assert.equal(l.projects.length,2);assert.equal(l.projects[0].internalCostsSummary.costCents,9000);
  assert.throws(()=>mutatePortal(s,{action:'set-access',userId:CLIENT,projectId:'019',active:true,modules:['costs']},PORTAL_MASTER),e=>e.status===400);
});

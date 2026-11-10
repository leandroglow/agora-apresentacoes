import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpenseRepository, handleExpenseWorkflow, preserveWorkflow, workflowFor, requireWorkflowProof} from '../api/_lib/expense-followup.mjs';
const MASTER='user_3Jvm8LQLtHINAqVtQhagyoDC6nT';
function fakeDrive(record={id:42,obra:'Galpão',fornecedor:'Teste',valor_total:10}) {
 let state=structuredClone(record), version=1; const writes=[];
 const fetchImpl=async(url,options={})=>{
  const u=new URL(url);
  if(u.pathname==='/drive/v3/files')return Response.json({files:[{id:'file_expense_42',name:'agora_despesa_42.json'}]});
  if(u.pathname==='/drive/v2/files/file_expense_42')return Response.json({etag:`"v${version}"`,fileSize:JSON.stringify(state).length});
  if(u.pathname==='/upload/drive/v2/files/file_expense_42') {
   if(options.headers['If-Match']!==`"v${version}"`)return new Response('',{status:412});
   state=JSON.parse(options.body.toString());version++;writes.push(structuredClone(state));return Response.json({etag:`"v${version}"`});
  }
  if(u.searchParams.has('alt'))return Response.json(state);
  return Response.json({id:'proof_file_12345',trashed:false});
 };
 return {fetchImpl,writes,get state(){return state;}};
}
test('legacy receipt is received, never automatically posted or reviewed',()=>{
 const state=workflowFor({id:1}); assert.equal(state.etapas.recebido.concluida,true); assert.equal(state.etapas.conferido.concluida,false);
});
test('editing values invalidates all dependent stages even before final review',()=>{
 const previous={id:1,valor_total:10};previous.acompanhamento_documental=workflowFor(previous);previous.acompanhamento_documental.etapas.lancado.concluida=true;
 const state=preserveWorkflow(previous,{...previous,valor_total:11},MASTER);assert.equal(state.etapas.lancado.concluida,false);assert.equal(previous.acompanhamento_documental.etapas.lancado.concluida,true);
});
test('evidence requirements distinguish reading, posting and readback',()=>{
 assert.throws(()=>requireWorkflowProof({type:'step',step:'lido'}),/páginas/);
 assert.throws(()=>requireWorkflowProof({type:'step',step:'lancado',fields:{observacao:'verificado'},evidence:[{url:'https://drive.google.com/file/d/proof_file_12345/view'}]}),/linha/);
 assert.throws(()=>requireWorkflowProof({type:'step',step:'conferido',fields:{observacao:'reli'}}),/fonte/);
});
test('non-Master cannot change workflow or cause a Drive request',async()=>{
 let calls=0;await assert.rejects(handleExpenseWorkflow({action:'workflow',id:42},{sub:'internal-other'},'token',async()=>{calls++;}),e=>e.statusCode===403);assert.equal(calls,0);
});
test('workflow stores and reads back audit with conditional write; stale version rejected',async()=>{
 const drive=fakeDrive();const read=await handleExpenseWorkflow({action:'workflow-read',id:42},{sub:MASTER},'token',drive.fetchImpl);
 const body={action:'workflow',id:42,etag:read.etag,operation:{type:'step',step:'lido',fields:{metodo:'visual',paginas:'1'}}};
 const done=await handleExpenseWorkflow(body,{sub:MASTER},'token',drive.fetchImpl);assert.equal(done.record.acompanhamento_documental.etapas.lido.concluida,true);assert.equal(drive.writes.length,1);
 await assert.rejects(handleExpenseWorkflow({...body,operation:{type:'block',reason:'Revisar'}},{sub:MASTER},'token',drive.fetchImpl),e=>e.statusCode===409);assert.equal(drive.writes.length,1);
});
test('source URLs are constrained before any external request',async()=>{
 const drive=fakeDrive();const repo=createExpenseRepository('token',drive.fetchImpl);
 await assert.rejects(repo.proof({evidence:[{url:'http://drive.google.com/file/d/proof_file_12345/view'}]}),/HTTPS/);
 await assert.rejects(repo.proof({evidence:[{url:'https://drive.google.com@evil.test/file/d/proof_file_12345/view'}]}),/HTTPS/);
});

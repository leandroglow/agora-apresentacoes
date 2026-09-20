import test from 'node:test';
import assert from 'node:assert/strict';
import { checkServices } from '../api/health.mjs';

test('diagnóstico confirma Drive e modelo sem expor dados de contas',async()=>{
  const result=await checkServices({getToken:async()=>'test-secret',makeDrive:()=>({list:async()=>({files:[{name:'confidential-file'}]})}),getClient:()=>({models:{retrieve:async()=>({id:'test-model'})}})});
  assert.equal(result.driveAccessible,true);assert.equal(result.modelAvailable,true);
  assert.ok(!JSON.stringify(result).includes('confidential'));
  assert.ok(!JSON.stringify(result).includes('test-secret'));
});

test('diagnóstico distingue modelo indisponível sem expor erros do provedor',async()=>{
  const result=await checkServices({getToken:async()=>{throw Error('private token details');},getClient:()=>({models:{retrieve:async()=>({})}})});
  assert.equal(result.driveAccessible,false);assert.equal(result.modelAvailable,true);
  assert.ok(!JSON.stringify(result).includes('private'));
});

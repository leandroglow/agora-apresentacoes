import test from 'node:test';
import assert from 'node:assert/strict';
import { checkServices } from '../api/health.mjs';

test('diagnóstico OAuth usa somente categorias permitidas, nunca valores arbitrários',async()=>{
  for(const [reason,expected] of [['invalid_grant','invalid_grant'],['secret-provider-value','DRIVE_UNAVAILABLE']]){
    const result=await checkServices({getToken:async()=>{throw Object.assign(Error('secret-message'),{oauthReason:reason,code:'secret-code'});},getClient:()=>({models:{retrieve:async()=>({})}}),checkImages:async()=>true});
    assert.equal(result.driveIssue,expected);
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
});

test('diagnóstico confirma Drive e modelo sem expor dados de contas',async()=>{
  const result=await checkServices({getToken:async()=>'test-secret',makeDrive:()=>({list:async()=>({files:[{name:'confidential-file'}]})}),getClient:()=>({models:{retrieve:async()=>({id:'test-model'})}})});
  assert.equal(result.driveAccessible,true);assert.equal(result.modelAvailable,true);
  assert.equal(result.imageRendererAvailable,true);
  assert.ok(!JSON.stringify(result).includes('confidential'));
  assert.ok(!JSON.stringify(result).includes('test-secret'));
});

test('falha do renderizador é identificada sem expor caminhos internos',async()=>{
  const result=await checkServices({getToken:async()=>'test',makeDrive:()=>({list:async()=>({})}),
    getClient:()=>({models:{retrieve:async()=>({})}}),checkImages:async()=>{throw Error('private-server-path');}});
  assert.equal(result.imageRendererAvailable,false);
  assert.ok(!JSON.stringify(result).includes('private-server-path'));
});

test('diagnóstico distingue modelo indisponível sem expor erros do provedor',async()=>{
  const result=await checkServices({getToken:async()=>{throw Error('private token details');},getClient:()=>({models:{retrieve:async()=>({})}})});
  assert.equal(result.driveAccessible,false);assert.equal(result.modelAvailable,true);
  assert.ok(!JSON.stringify(result).includes('private'));
});

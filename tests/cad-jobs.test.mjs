import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { roots, children } from '../api/_lib/cad-drive.mjs';
import { authenticated } from '../api/cad-worker.mjs';

const oldEnv = { ...process.env };
beforeEach(() => { process.env.GOOGLE_OAUTH_CLIENT_ID='x'; process.env.GOOGLE_OAUTH_CLIENT_SECRET='x'; process.env.GOOGLE_OAUTH_REFRESH_TOKEN='x'; process.env.GOOGLE_DRIVE_OAUTH_ACCESS_TOKEN='test-token'; process.env.GOOGLE_DRIVE_PROJECTS_JSON=JSON.stringify({ hp:{projeto:'rootproject123',fotos:'rootphotos123',renders:'rootrenders123'} }); });
afterEach(() => { process.env = { ...oldEnv }; });

test('roots interpreta cadastro real por projeto e categorias', async () => {
  const r=await roots(); assert.deepEqual(r.map(x=>x.id),['rootproject123','rootphotos123','rootrenders123']);
});
test('children percorre todas as páginas do Drive', async () => {
  const original=globalThis.fetch, calls=[];
  globalThis.fetch=async url=>{calls.push(String(url)); const u=new URL(url); return Response.json(u.searchParams.has('pageToken')?{files:[{id:'b'}]}:{files:[{id:'a'}],nextPageToken:'next'});};
  try { const out=await children('rootproject123'); assert.deepEqual(out.map(x=>x.id),['a','b']); assert.equal(calls.length,2); } finally { globalThis.fetch=original; }
});
test('worker rejeita token ausente, curto ou diferente',()=>{
  process.env.CAD_WORKER_TOKEN='12345678901234567890123456789012';
  assert.equal(authenticated({headers:{}}),false);
  assert.equal(authenticated({headers:{'x-cad-worker-token':'short'}}),false);
  assert.equal(authenticated({headers:{'x-cad-worker-token':'12345678901234567890123456789012'}}),true);
});

import worker from '../api/cad-worker.mjs';
function responseCapture(){const out={headers:{},statusCode:200,body:null};return {out,setHeader(k,v){out.headers[k]=v},status(n){out.statusCode=n;return this},json(x){out.body=x;return this},send(x){out.body=x;return this},end(x){out.body=x;return this}}}

test('worker rejeita autenticação ausente no endpoint',async()=>{process.env.CAD_WORKER_TOKEN='12345678901234567890123456789012';const r=responseCapture();await worker({method:'GET',headers:{} ,url:'/api/cad-worker'},r);assert.equal(r.out.statusCode,401)});


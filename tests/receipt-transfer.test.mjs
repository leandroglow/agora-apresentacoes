import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../sistema/receipt-transfer.js';

const { upload, readPhoto, CHUNK_BYTES } = globalThis.AgoraReceiptTransfer;
const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=test-single-file';
const complete = () => Response.json({ id: 'test-receipt' });
const incomplete = end => new Response(null, { status: 308, headers: end ? { Range: `bytes=0-${end-1}` } : {} });
function photo(size) { return new File([Buffer.alloc(size, 123)], 'original.jpg', { type: 'image/jpeg' }); }

test('8 MB original is transmitted unchanged, with no request through the app exceeding a chunk', async () => {
  const file = photo(8_000_001), received = [], state = {};
  let initialized = 0;
  const result = await upload(file, { state, init: async info => {
    initialized++; assert.equal(info.size, file.size); assert.ok(!('fileBase64' in info)); return { uploadUrl };
  }, fetcher: async (url, options) => {
    assert.equal(url, uploadUrl);
    assert.ok(!options.headers.Authorization);
    const body = Buffer.from(await options.body.arrayBuffer());
    assert.ok(body.length <= CHUNK_BYTES);
    received.push(body);
    const total = received.reduce((sum, b) => sum+b.length, 0);
    assert.equal(options.headers['Content-Range'], `bytes ${total-body.length}-${total-1}/${file.size}`);
    return total === file.size ? complete() : incomplete(total);
  }});
  assert.equal(result.id, 'test-receipt');
  assert.deepEqual(Buffer.concat(received), Buffer.from(await file.arrayBuffer()));
  assert.equal(initialized, 1);
  assert.equal(state.url, undefined);
  assert.equal((await upload(file, { state, init: () => assert.fail('must reuse receipt') })).id, result.id);
});

test('lost response resumes from Drive acknowledged offset without duplicate upload session', async () => {
  const file = photo(CHUNK_BYTES*2+3), state = {};
  let accepted = 0, failure = false, initialized = 0;
  const result = await upload(file, {state, init: async () => {initialized++;return {uploadUrl};}, fetcher: async (_url, o) => {
    if(o.headers['Content-Range'] === 'bytes */'+file.size) return incomplete(accepted);
    const range = /^bytes (\d+)-(\d+)\//.exec(o.headers['Content-Range']);
    assert.equal(Number(range[1]), accepted);
    accepted = Number(range[2])+1;
    if(!failure){failure=true;throw new TypeError('Load failed');}
    return accepted===file.size ? complete() : incomplete(accepted);
  }});
  assert.equal(result.id,'test-receipt'); assert.equal(initialized,1);
});

test('retry after final response loss uses completed file from status probe', async () => {
  const file=photo(7), state={file,url:uploadUrl};
  const result=await upload(file,{state,init:()=>assert.fail(),fetcher:async(_url,o)=>{
    assert.equal(o.headers['Content-Range'],'bytes */7'); return complete();
  }});
  assert.equal(result.id,'test-receipt');
});

test('foreign upload destination is refused before transmitting file bytes', async () => {
  await assert.rejects(upload(photo(10),{state:{},init:async()=>({uploadUrl:'https://evil.example/upload?upload_id=x'}),fetcher:()=>assert.fail()}),/destino/);
});

test('expired upload permits a new session on next user retry', async () => {
  const file=photo(8),state={file,url:uploadUrl};
  await assert.rejects(upload(file,{state,init:()=>assert.fail(),fetcher:async()=>new Response(null,{status:404})}),/expirou/);
  assert.equal(state.url,undefined);
});

test('oversized input is rejected before starting upload', async () => {
  await assert.rejects(upload(photo(20_000_001),{state:{},init:()=>assert.fail()}),/20 MB/);
});

test('network failure remains resumable and replaces Safari generic Load failed', async () => {
  const state={};
  await assert.rejects(upload(photo(2),{state,init:async()=>({uploadUrl}),fetcher:async()=>{throw new TypeError('Load failed');}}),/clique em salvar novamente/);
  assert.equal(state.url,uploadUrl);
});

test('history reads a photo larger than Vercel limit using bounded response parts', async () => {
  const original=Buffer.alloc(5_000_001,90); let requests=0;
  const url=await readPhoto(async({fileId,offset})=>{
    assert.equal(fileId,'receipt'); requests++;
    const end=Math.min(offset+CHUNK_BYTES,original.length);
    return {base64:original.subarray(offset,end).toString('base64'),mimeType:'image/jpeg',total:original.length,nextOffset:end,done:end===original.length};
  },'receipt');
  try{assert.deepEqual(Buffer.from(await(await fetch(url)).arrayBuffer()),original);assert.equal(requests,5);}
  finally{URL.revokeObjectURL(url);}
});

test('inconsistent history response is refused instead of showing partial document', async()=>{
  await assert.rejects(readPhoto(async()=>({base64:'YQ==',mimeType:'image/jpeg',total:3,nextOffset:2,done:false}),'receipt'),/incompleta/);
});

test('published page JavaScript compiles and sends reference instead of base64 for analysis/save',()=>{
  const html=readFileSync(new URL('../sistema/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
  const analysis=html.slice(html.indexOf('window.analisarDespesa=async'),html.indexOf('// Vincula o botão'));
  const save=html.slice(html.indexOf('window.salvarDespesa=async'),html.indexOf("document.getElementById('desp-tab-nova')"));
  assert.ok(analysis.includes('1400, fileId'));
  assert.ok(!analysis.includes('readAsDataURL'));
  assert.ok(!save.includes('fileBase64'));
  assert.ok(save.includes('despDraftId ||= Date.now()'));
});

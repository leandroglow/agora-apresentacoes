import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {URL as NodeURL, URLSearchParams as NodeURLSearchParams} from 'node:url';

const sourcePath=new URL('../cliente/portal.js',import.meta.url);
const source=await readFile(sourcePath,'utf8');
const start=source.indexOf('  async function downloadDocument(');
const end=source.indexOf('\n  function setTab(',start);
assert.ok(start>=0&&end>start,'downloadDocument is present in the portal IIFE');
const downloadFunction=source.slice(start,end).trim();

function makeButton(){
  const attrs=new Map();
  return {disabled:false,textContent:'Baixar PDF',attrs,setAttribute(k,v){attrs.set(k,v)},removeAttribute(k){attrs.delete(k)}};
}
function harness(api){
  const state={sessionId:'sess-1',request:4,download:null,projectId:'project-019',preview:false,asUserId:null,clerk:{session:{id:'sess-1'}}};
  const urls={created:[],revoked:[]};
  const anchors=[];
  const messages=[];
  const context={state,API:'https://example.test/api/client-portal',api,idSafe:x=>/^[a-zA-Z0-9_-]{1,100}$/.test(String(x||'')),obj:x=>x&&typeof x==='object'&&!Array.isArray(x),setStatus:(...args)=>messages.push(args),URLSearchParams:NodeURLSearchParams,AbortController,DOMException,Number,Math,String,Uint8Array,atob,Blob,URL:{createObjectURL(blob){const url=`blob:test-${urls.created.length+1}`;urls.created.push({url,blob});return url},revokeObjectURL(url){urls.revoked.push(url)}},setTimeout:fn=>{fn();return 0},document:{createElement(){const a={clicks:0,click(){this.clicks++},remove(){}};anchors.push(a);return a},body:{append(){}}}};
  vm.runInNewContext(`${downloadFunction}\nthis.runDownload=downloadDocument;`,context,{timeout:1000});
  return {state,urls,anchors,messages,run:context.runDownload};
}
const CHUNK=1024*1024;
function pdfChunk(offset,size){const bytes=new Uint8Array(size);if(offset===0)bytes.set([37,80,68,70,45]);else bytes.fill(offset/CHUNK&255);return Buffer.from(bytes).toString('base64')}
function response(offset,totalSize,{fileVersion='file-v1',reportedOffset=offset,reportedTotal=totalSize,reportedNext,done}={}){const size=Math.min(CHUNK,totalSize-offset);return {offset:reportedOffset,nextOffset:reportedNext??offset+size,totalSize:reportedTotal,mimeType:'application/pdf',dataBase64:pdfChunk(offset,size),done:done??offset+size===totalSize,fileVersion}}

test('downloads a 16,724,564-byte PDF in authenticated chunks and saves one complete file',async()=>{
  const size=16_724_564,calls=[];
  const h=harness(async(url,{signal,sessionId})=>{const q=new NodeURL(url).searchParams;calls.push({q,signal,sessionId});const offset=Number(q.get('offset'));return {json:response(offset,size)}});
  const button=makeButton();await h.run('doc-019',button);
  assert.equal(calls.length,16);assert.deepEqual(calls.map(c=>Number(c.q.get('offset'))),Array.from({length:16},(_,i)=>i*CHUNK));
  assert.equal(calls.every(c=>c.sessionId==='sess-1'),true);assert.equal(calls[0].q.has('fileVersion'),false);assert.equal(calls.slice(1).every(c=>c.q.get('fileVersion')==='file-v1'),true);
  assert.equal(h.urls.created.length,1);assert.equal(h.urls.created[0].blob.size,size);assert.equal(h.urls.created[0].blob.type,'application/pdf');assert.equal(h.anchors.length,1);assert.equal(h.anchors[0].clicks,1);assert.equal(h.anchors[0].download,'documento-doc-019.pdf');
  assert.equal(button.disabled,false);assert.equal(button.textContent,'Baixar PDF');assert.equal(button.attrs.has('aria-busy'),false);assert.deepEqual(h.urls.revoked,['blob:test-1']);
});

for(const [label,second]of [
  ['file-version mismatch',offset=>response(offset,CHUNK+1,{fileVersion:'changed'})],
  ['size mismatch',offset=>response(offset,CHUNK+2)],
  ['offset mismatch',offset=>response(offset,CHUNK+1,{reportedOffset:offset+1})]
])test(`aborts without creating a URL on ${label}`,async()=>{
  let calls=0;const h=harness(async url=>{calls++;const offset=Number(new NodeURL(url).searchParams.get('offset'));return {json:calls===1?response(0,CHUNK+1):second(offset)}});
  await h.run('doc-x',makeButton());assert.equal(calls,2);assert.equal(h.urls.created.length,0);assert.equal(h.anchors.length,0);
});

test('does not save if the Clerk session changes between chunks',async()=>{
  const h=harness(async url=>{const offset=Number(new NodeURL(url).searchParams.get('offset'));const json=response(offset,CHUNK+1);if(offset===0)h.state.clerk.session.id='sess-2';return {json}});
  await h.run('doc-x',makeButton());assert.equal(h.urls.created.length,0);assert.equal(h.anchors.length,0);
});

test('does not save if authorization fails during a later chunk',async()=>{
  let calls=0;const h=harness(async url=>{calls++;if(calls===1)return {json:response(0,CHUNK+1)};throw Object.assign(new Error('Documento indisponível.'),{status:404})});
  await h.run('doc-x',makeButton());assert.equal(calls,2);assert.equal(h.urls.created.length,0);assert.equal(h.anchors.length,0);
});

test('ignores concurrent clicks while a transfer is active',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve});let calls=0;
  const h=harness(async()=>{calls++;await pending;return {json:response(0,5)}});const button=makeButton();
  const first=h.run('doc-x',button);await new Promise(resolve=>setImmediate(resolve));await h.run('doc-x',button);assert.equal(calls,1);release();await first;assert.equal(h.urls.created.length,1);assert.equal(h.anchors[0].clicks,1);
});

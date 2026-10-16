import test from 'node:test';
import assert from 'node:assert/strict';
import { create, get } from '../api/_lib/cad-jobs.mjs';
import handler from '../api/_lib/routes/cad-worker.mjs';

test('CAD queue: claim, protected download, completion, replay, source revision, foreign roots', async () => {
 const original=global.fetch, old={...process.env};
 const root='root_folder_0001', queue='queue_folder_001', source='source_file_0001';
 process.env.GOOGLE_DRIVE_OAUTH_ACCESS_TOKEN='mock';process.env.GOOGLE_DRIVE_PROJECTS_JSON=JSON.stringify({test:{projeto:root}});
 process.env.CAD_QUEUE_FOLDER_ID=queue;process.env.CAD_WORKER_TOKEN='x'.repeat(48);
 const files=new Map([[root,{id:root,name:'Root',mimeType:'application/vnd.google-apps.folder',parents:[]}],[source,{id:source,name:'planta.dwg',size:6,parents:[root],modifiedTime:'v1',md5Checksum:'hash1',data:Buffer.from('AC1032')}]]);
 let counter=0, outputs=0;
 global.fetch=async (input,options={})=>{
  const url=new URL(input), id=url.pathname.split('/').pop(), method=options.method||'GET';
  if(url.pathname.includes('/upload/')) {
   const buffer=Buffer.from(options.body), boundary=options.headers['Content-Type'].split('boundary=')[1];
   const parts=buffer.toString('utf8').split('--'+boundary);
   const metadata=JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
   const payload=parts[2].slice(parts[2].indexOf('\r\n\r\n')+4,-2);
   const fileId=method==='PATCH'?id:'created_file_'+String(++counter).padStart(5,'0');
   const previous=files.get(fileId)||{};
   const file={...previous,...metadata,id:fileId,size:Buffer.byteLength(payload),data:Buffer.from(payload),modifiedTime:previous.modifiedTime||'created'};
   files.set(fileId,file);if(metadata.appProperties?.cadOutputJob)outputs++;
   return Response.json({...file,data:undefined});
  }
  if(id==='files') {const parent=url.searchParams.get('q').match(/^'([^']+)'/)[1];return Response.json({files:[...files.values()].filter(f=>f.parents?.includes(parent)).map(f=>({...f,data:undefined}))});}
  const f=files.get(id);if(!f)return Response.json({}, {status:404});
  if(url.searchParams.get('alt')==='media') {
   const range=options.headers?.Range;
   if(range){const [,a,b]=range.match(/bytes=(\d+)-(\d+)/);return new Response(f.data.subarray(Number(a),Number(b)+1),{status:206});}
   return new Response(f.data);
  }
  return Response.json({...f,data:undefined});
 };
 async function call(method,url,body,token='x'.repeat(48)) {
  let code=200,value;const res={setHeader(){},status(n){code=n;return this},json(x){value=x},send(x){value=x}};
  await handler({method,url,body,headers:{'x-cad-worker-token':token}},res);return {code,value};
 }
 try {
  assert.equal((await call('GET','/api/cad-worker',null,'bad')).code,401);
  const j=await create({sourceId:source,destinationId:root,format:'pdf'},'owner');
  assert.equal((await create({sourceId:source,destinationId:root,format:'pdf'},'owner')).id,j.id);
  const claim=(await call('GET','/api/cad-worker')).value.job;assert.equal(claim.id,j.id);
  assert.equal((await call('GET','/api/cad-worker')).value.job,null);
  assert.equal((await call('GET',claim.downloadUrl)).value.toString(),'AC1032');
  const done={id:j.id,leaseToken:claim.leaseToken,status:'completed',dataBase64:Buffer.from('%PDF-test').toString('base64')};
  assert.equal((await call('POST','/api/cad-worker',{...done,leaseToken:'stale'})).code,409);
  assert.equal((await call('POST','/api/cad-worker',done)).code,200);
  assert.equal((await get(j.id)).status,'completed');
  assert.equal((await call('POST','/api/cad-worker',done)).code,200);assert.equal(outputs,1);
  files.get(source).modifiedTime='v2';const revised=await create({sourceId:source,destinationId:root,format:'pdf'},'owner');assert.notEqual(revised.id,j.id);
  const second=(await call('GET','/api/cad-worker')).value.job;files.get(source).modifiedTime='v3';assert.equal((await call('GET',second.downloadUrl)).code,409);
  const big=files.get(source);big.data=Buffer.alloc(10*1024*1024,65);big.size=big.data.length;big.modifiedTime='v4';
  const large=await create({sourceId:source,destinationId:root,format:'dxf'},'owner');
  const largeClaim=(await call('GET','/api/cad-worker')).value.job;assert.equal(largeClaim.id,large.id);
  let downloaded=0;
  for(let offset=0;offset<big.size;offset+=2*1024*1024){const part=await call('GET',largeClaim.downloadUrl+'&offset='+offset);assert.equal(part.code,206);downloaded+=part.value.length;}
  assert.equal(downloaded,10*1024*1024);
  for(let index=0;index<5;index++){
   const part={id:large.id,leaseToken:largeClaim.leaseToken,status:'chunk',index,total:5,dataBase64:Buffer.alloc(2*1024*1024,65).toString('base64')};
   assert.equal((await call('POST','/api/cad-worker',part)).code,200);
   if(index===0)assert.equal((await call('POST','/api/cad-worker',part)).code,200);
  }
  assert.equal((await call('POST','/api/cad-worker',{id:large.id,leaseToken:largeClaim.leaseToken,status:'completed',chunks:5})).code,200);
  const largeResult=await get(large.id);assert.equal(largeResult.outputSize,10*1024*1024);assert.equal(files.get(largeResult.outputId).size,10*1024*1024);
  files.set('foreign_file_001',{id:'foreign_file_001',name:'outside.dwg',parents:[]});
  await assert.rejects(create({sourceId:'foreign_file_001',destinationId:root,format:'pdf'},'owner'),e=>e.status===403);
 } finally {global.fetch=original;for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}
});

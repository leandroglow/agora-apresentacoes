import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import uploadReceipt from '../api/upload-receipt.mjs';
import analyzeReceipt from '../api/analyze-receipt.mjs';
import expenses from '../api/expenses.mjs';

const MASTER='user_3Jvm8LQLtHINAqVtQhagyoDC6nT';
const LAERTE='user_3LBngIH74tca1nDUYD6dz69AbAS';
const ORIGIN='https://apresentacoes.agoracons.com.br';
const FOLDER='1665zvQOtbulPR59zjFLr37mflu9n31Yo';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
process.env.CLERK_JWT_KEY=publicKey.export({type:'spki',format:'pem'});
process.env.CLERK_PUBLISHABLE_KEY='pk_live_Y2xlcmsuYXByZXNlbnRhY29lcy5hZ29yYWNvbnMuY29tLmJyJA';
process.env.GOOGLE_DRIVE_OAUTH_ACCESS_TOKEN='test-drive-token';
process.env.OPENAI_API_KEY='test-openai-key';
function jwt(sub){const now=Math.floor(Date.now()/1000),enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const body=enc({sub,sid:'sess_receipttest',iss:'https://clerk.apresentacoes.agoracons.com.br',azp:ORIGIN,iat:now,nbf:now-1,exp:now+120});const input=enc({alg:'RS256',typ:'JWT'})+'.'+body;return input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');}
function req(body,sub=MASTER){return{method:'POST',url:'/api/test',body,headers:{origin:ORIGIN,authorization:'Bearer '+jwt(sub)}};}
function res(){return{headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;},end(body){this.body=body;return this;}};}
function response(body,{status=200,headers={}}={}){const bytes=Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body));const stream=new ReadableStream({start(controller){if(bytes.length)controller.enqueue(bytes);controller.close();}});return{ok:status>=200&&status<300,status,headers:new Headers(headers),body:stream,json:async()=>typeof body==='object'&&!Buffer.isBuffer(body)?body:JSON.parse(bytes.toString()),arrayBuffer:async()=>bytes};}
test('resumable init returns only Google upload capability and bounded metadata',async()=>{
  const original=globalThis.fetch;let captured;
  globalThis.fetch=async(url,options)=>{captured={url:String(url),options};return response({}, {status:200,headers:{location:'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=opaque'}});};
  try{const out=res();await uploadReceipt(req({action:'init',fileName:'receipt.png',mimeType:'image/png',size:20000000}),out);assert.equal(out.statusCode,200);assert.deepEqual(out.body,{uploadUrl:'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=opaque',maxBytes:20000000});assert.equal(captured.options.headers.Origin,ORIGIN);assert.equal(captured.options.headers['X-Upload-Content-Length'],'20000000');assert.equal(captured.options.headers['X-Upload-Content-Type'],'image/png');const meta=JSON.parse(captured.options.body);assert.deepEqual(meta.parents,[FOLDER]);assert.deepEqual(meta.appProperties,{uploadedBy:MASTER});assert.ok(!JSON.stringify(out.body).includes('test-drive-token'));}
  finally{globalThis.fetch=original;}
});

test('resumable init rejects oversized input before Drive fetch',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected fetch');};try{const out=res();await uploadReceipt(req({action:'init',fileName:'x.jpg',mimeType:'image/jpeg',size:20000001}),out);assert.equal(out.statusCode,413);assert.equal(calls,0);}finally{globalThis.fetch=original;}});

test('upload auth rejects anonymous and non-system users before fetch',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected fetch');};try{for(const sub of [null,LAERTE]){const out=res();const request=sub?req({action:'init',fileName:'x.jpg',mimeType:'image/jpeg',size:1},sub):{...req({action:'init',fileName:'x.jpg',mimeType:'image/jpeg',size:1}),headers:{origin:ORIGIN}};await uploadReceipt(request,out);assert.equal(out.statusCode,sub?403:401);}assert.equal(calls,0);}finally{globalThis.fetch=original;}});

test('legacy multipart upload enforces the 3 MB decoded-byte cap',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return response({id:'legacy-receipt-1'});};try{const large=Buffer.alloc(3000000).toString('base64');const accepted=res();await uploadReceipt(req({fileName:'legacy.jpg',mimeType:'image/jpeg',fileBase64:large}),accepted);assert.equal(accepted.statusCode,200);assert.equal(calls,1);const rejected=res();await uploadReceipt(req({fileName:'legacy.jpg',mimeType:'image/jpeg',fileBase64:Buffer.alloc(3000001).toString('base64')}),rejected);assert.equal(rejected.statusCode,413);assert.equal(calls,1);assert.equal(rejected.headers['Access-Control-Allow-Origin'],ORIGIN);}finally{globalThis.fetch=original;}});

test('Laerte is denied by analyze and expenses before external fetch',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected fetch');};try{const analysis=res();await analyzeReceipt(req({fileId:'receipt-file-123',messages:[{role:'user',content:'analisar'}]},LAERTE),analysis);assert.equal(analysis.statusCode,403);const photo=res();await expenses(req({action:'photo',fileId:'receipt-file-123',offset:0},LAERTE),photo);assert.equal(photo.statusCode,403);assert.equal(calls,0);}finally{globalThis.fetch=original;}});
test('resumable init refuses a Location outside the approved Google endpoint',async()=>{const original=globalThis.fetch;globalThis.fetch=async()=>response({}, {headers:{location:'https://evil.example/upload/drive/v3/files?upload_id=secret'}});try{const out=res();await uploadReceipt(req({action:'init',fileName:'x.jpg',mimeType:'image/jpeg',size:1}),out);assert.equal(out.statusCode,502);assert.equal(JSON.stringify(out.body).includes('secret'),false);}finally{globalThis.fetch=original;}});

test('photo chunk checks folder and requests only the 1 MiB range',async()=>{const original=globalThis.fetch,bytes=Buffer.alloc(2*1024*1024+7,42);let range;
  globalThis.fetch=async(url,options={})=>{if(String(url).includes('fields=id'))return response({id:'receipt-file-123',parents:[FOLDER],mimeType:'image/jpeg',size:String(bytes.length),trashed:false});range=options.headers.Range;const [,from,to]=range.match(/bytes=(\d+)-(\d+)/);return response(bytes.subarray(Number(from),Number(to)+1),{status:206,headers:{"content-range":`bytes ${from}-${to}/${bytes.length}`}});};
  try{const out=res();await expenses(req({action:'photo',fileId:'receipt-file-123',offset:0}),out);assert.equal(out.statusCode,200);assert.equal(range,'bytes=0-1048575');assert.deepEqual(out.body,{base64:bytes.subarray(0,1024*1024).toString('base64'),mimeType:'image/jpeg',total:bytes.length,nextOffset:1024*1024,done:false});}
  finally{globalThis.fetch=original;}
});

test('photo refuses a file in a foreign folder before media fetch',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return response({id:'receipt-file-123',parents:['foreign-folder-123'],mimeType:'image/jpeg',size:'4',trashed:false});};try{const out=res();await expenses(req({action:'photo',fileId:'receipt-file-123',offset:0}),out);assert.equal(out.statusCode,403);assert.equal(calls,1);}finally{globalThis.fetch=original;}});

test('analyze fileId reads only an in-folder image then prepends it to last user content',async()=>{const original=globalThis.fetch;let openAiRequest;
  globalThis.fetch=async(url,options={})=>{if(String(url).includes('/drive/v3/files/')&&String(url).includes('fields='))return response({id:'receipt-file-123',parents:[FOLDER],mimeType:'image/png',size:'4',trashed:false});if(String(url).includes('alt=media'))return response(Buffer.from([1,2,3,4]));openAiRequest=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:'ok'}}]}),{status:200,headers:{'content-type':'application/json'}});};
  try{const out=res();await analyzeReceipt(req({fileId:'receipt-file-123',messages:[{role:'user',content:'Leia este recibo.'}]}),out);assert.equal(out.statusCode,200);const content=openAiRequest.messages[0].content;assert.equal(content[0].type,'image_url');assert.equal(content[0].image_url.url,'data:image/png;base64,AQIDBA==');assert.deepEqual(content[1],{type:'text',text:'Leia este recibo.'});}
  finally{globalThis.fetch=original;}
});

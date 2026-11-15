import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPurchaseHandler } from '../api/_lib/routes/purchase-requests.mjs';
import { MASTER_ID,recordTag,decodePhoto,createRecord,changeRecord } from '../api/_lib/purchase-requests.mjs';
import { DrivePurchaseStore,PURCHASE_FOLDER_ID } from '../api/_lib/purchase-store.mjs';

const input=(extra={})=>({id:randomUUID(),title:'Compra de campo',rawText:'preciso de joelho 25 mm e 3 sacos cimento',destination:{kind:'unassigned',projectCode:''},priority:'normal',neededBy:'',items:[{description:'Joelho 25 mm',quantity:'',unit:'',notes:'Confirmar quantidade'}],notes:'',photos:[],...extra});
function setup({user=MASTER_ID,authorize,conflicts=0}={}) {
 let data={version:1,requests:[],mutationIds:[],mutationHashes:{}},version=1,reads=0,writes=0,photos=0;
 const store={
  async get(){reads++;return {envelope:structuredClone(data),etag:`"${version}"`};},
  async put(value,etag){writes++;if(conflicts-->0||etag!==`"${version}"`)return{conflict:true};data=structuredClone(value);version++;return{conflict:false};},
  async photoMetadata(id,requestId,owner){photos++;if(id==='other_123456')throw Object.assign(new Error('foreign'),{status:403});return{id,name:'foto.jpg',mimeType:'image/jpeg',size:3};},
  async upload(){return{id:'image_123456',name:'foto.jpg',mimeType:'image/jpeg',size:3};},
  async photo(){photos++;return{mimeType:'image/jpeg',bytes:Buffer.from('photo')};}
 };
 const handler=createPurchaseHandler({authorize:authorize||(async()=>({sub:user})),store,organizer:async()=>({items:[],warnings:['teste']}),rateLimit:()=>{},clock:()=> '2026-11-15T12:00:00.000Z'});
 async function call(method,body,url='/api/purchase-requests') {
  const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;},end(){return this;}};
  await handler({method,body,url,headers:{origin:'https://apresentacoes.agoracons.com.br'}},res);return res;
 }
 return{call,get data(){return data;},get stats(){return{reads,writes,photos};}};
}
test('create, read, list and retry preserve request identity and unassigned destination',async()=>{
 const h=setup(),request=input(),body={action:'create',mutationId:randomUUID(),request};
 const a=await h.call('POST',body);assert.equal(a.statusCode,200);assert.equal(a.body.request.status,'requested');assert.equal(a.body.request.createdBy,MASTER_ID);assert.equal(a.body.request.items[0].quantity,'');
 const b=await h.call('POST',body);assert.equal(b.body.duplicate,true);assert.equal(h.data.requests.length,1);
 const list=await h.call('GET');assert.equal(list.body.requests.length,1);assert.equal(list.body.canManage,true);assert.deepEqual(list.body.projects.map(x=>x.code),['008','013','016','017','019']);
 const read=await h.call('GET',null,`/api/purchase-requests?action=read&id=${request.id}`);assert.equal(read.body.etag,a.body.etag);
 body.request.rawText='changed';assert.equal((await h.call('POST',body)).statusCode,409);
});
test('request can be saved without items or project; stock is independent of project',async()=>{
 const h=setup();const r=await h.call('POST',{action:'create',mutationId:randomUUID(),request:input({items:[],destination:{kind:'stock',projectCode:'019'}})});
 assert.equal(r.statusCode,200);assert.equal(r.body.request.destination.projectCode,'');
 assert.equal(r.body.request.originalRawText,r.body.request.rawText);
});
test('invalid project 002, impossible dates, excessive items and empty request are rejected',async()=>{
 for(const extra of [{destination:{kind:'project',projectCode:'002'}},{neededBy:'2026-02-30'},{items:Array(81).fill({description:'teste'})},{rawText:'',items:[],photos:[]}]){
 const h=setup();const r=await h.call('POST',{action:'create',mutationId:randomUUID(),request:input(extra)});assert.equal(r.statusCode,400);assert.equal(h.stats.writes,0);}
});
test('unauthenticated/denied users cannot access storage or any action',async()=>{
 for(const method of ['GET','POST','PATCH']){
 const h=setup({authorize:async(_r,res)=>{res.status(403).json({error:'denied'});return null;}});
 assert.equal((await h.call(method,{action:'upload-photo'})).statusCode,403);assert.equal(h.stats.reads,0);assert.equal(h.stats.writes,0);}
});
test('stale same-record edits conflict while changes to other requests do not overwrite',async()=>{
 const h=setup();const a=await h.call('POST',{action:'create',mutationId:randomUUID(),request:input()});
 await h.call('POST',{action:'create',mutationId:randomUUID(),request:input()});
 const change={action:'update',id:a.body.request.id,etag:a.body.etag,changes:{status:'quoting'}};
 const b=await h.call('PATCH',change);assert.equal(b.statusCode,200);assert.equal(h.data.requests.length,2);assert.equal(b.body.request.history.length,2);
 assert.equal((await h.call('PATCH',change)).statusCode,409);
});
test('compare-and-swap retries safely and does not claim success on repeated conflict',async()=>{
 for(const [conflicts,status] of [[1,200],[8,409]]){
 const h=setup({conflicts});const r=await h.call('POST',{action:'create',mutationId:randomUUID(),request:input()});assert.equal(r.statusCode,status);assert.equal(h.data.requests.length,status===200?1:0);}
});
test('internal staff may edit own open request but cannot manage status or another owner',()=>{
 const session={sub:'user_staff'},r=createRecord(input(),session,[]);const tag=recordTag(r);
 assert.equal(changeRecord(r,{notes:'obs'},session,tag).notes,'obs');
 assert.throws(()=>changeRecord(r,{status:'ordered'},session,tag),/Master/);
 assert.throws(()=>changeRecord(r,{notes:'obs'},{sub:'user_other'},tag),/suas solicitações/);
 const closed={...r,status:'received'};assert.throws(()=>changeRecord(closed,{notes:'obs'},session,recordTag(closed)),/abertas/);
 assert.throws(()=>changeRecord(r,{createdBy:MASTER_ID},session,tag),/inválida/);
});
test('photo download requires a photo attached to the specific request',async()=>{
 const h=setup();const r=await h.call('POST',{action:'create',mutationId:randomUUID(),request:input()});
 assert.equal((await h.call('GET',null,`/api/purchase-requests?action=photo&id=${r.body.request.id}&photoId=foreign_123456`)).statusCode,403);assert.equal(h.stats.photos,0);
});
test('photo payload rejects disguised HTML/SVG and corrupt base64',()=>{
 assert.throws(()=>decodePhoto({mimeType:'image/jpeg',fileBase64:Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')}),/formato/);
 assert.throws(()=>decodePhoto({mimeType:'image/svg+xml',fileBase64:'aaa='}),/JPEG/);
 assert.throws(()=>decodePhoto({mimeType:'image/jpeg',fileBase64:'%%%'}),/inválida/);
 assert.equal(decodePhoto({mimeType:'image/jpeg',fileBase64:Buffer.from([255,216,255,217]).toString('base64')}).mimeType,'image/jpeg');
});
test('Drive photo validation checks parent, ownership, request and MIME',async()=>{
 const good={id:'image_123456',name:'foto.jpg',mimeType:'image/jpeg',size:4,parents:[PURCHASE_FOLDER_ID],appProperties:{purchaseRequest:'request',purchaseOwner:'owner',purchasePhoto:'1'}};
 for(const [overrides,allowed]of [[{},true],[{parents:['other']},false],[{appProperties:{...good.appProperties,purchaseOwner:'other'}},false],[{appProperties:{...good.appProperties,purchaseRequest:'other'}},false],[{mimeType:'text/html'},false],[{trashed:true},false]]){
 const s=new DrivePurchaseStore({tokenProvider:async()=> 'synthetic',fetchImpl:async()=>new Response(JSON.stringify({...good,...overrides}),{status:200})});
 if(allowed)assert.equal((await s.photoMetadata('image_123456','request','owner')).id,'image_123456');else await assert.rejects(()=>s.photoMetadata('image_123456','request','owner'),/não pertence/);}
});

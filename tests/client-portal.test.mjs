import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {PORTAL_MASTER as MASTER,budgetProjection,validateEnvelope,readProject,listPortalProjects,mutatePortal} from '../api/_lib/client-portal.mjs';
import {createClientPortalHandler} from '../api/_lib/routes/client-portal.mjs';
const A='user_testclientA',B='user_testclientB',W='user_3JvmAhiGPCh3w3nDMB3pPJOyIN9';
const ORIGIN='https://apresentacoes.agoracons.com.br';
const project=(id)=>({id,name:'Projeto de teste '+id,code:id,published:true,modules:{budget:true,payments:true,documents:true,progress:true},
  currentBudgetId:'v2',budgets:[{id:'v2',title:'Proposta sintética',version:'2',visible:true,status:'reference',statedTotalCents:35000,
    nodes:[{id:'parent',title:'Marcenaria',totalCents:999999,children:[{id:'kitchen',title:'Cozinha',totalCents:25000,costCents:100},{id:'bedroom',title:'Quarto',totalCents:10000}]}],supplier:'SECRET SUPPLIER',margin:70}],
  payments:{coverage:'unconfirmed',items:[]},documents:[{id:'proposal',title:'Proposta',mimeType:'application/pdf',visible:true,fileId:'privateDriveFileId1'},{id:'invoice',title:'INTERNAL',mimeType:'application/pdf',visible:false,fileId:'privateInvoiceId1'}],
  supplierCosts:[{value:55}],privateNote:'SECRET NOTE',milestones:[]});
const initial=()=>({schemaVersion:1,revision:1,projects:[project('019'),project('008')],clients:[{userId:A,grants:[{projectId:'019',active:true,modules:['budget','payments','documents']}]},{userId:B,grants:[{projectId:'008',active:true,modules:['budget']}]}],requests:[],audit:[]});
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(data){this.body=data;return this},send(data){this.body=data;return this},end(){return this}});
function memoryStore(state=initial()) {let data=structuredClone(state),revision=1;return {reads:0,writes:0,async get(){this.reads++;return {envelope:structuredClone(data),etag:'"'+revision+'"'}},async put(next,etag){this.writes++;if(etag!=='"'+revision+'"')return {conflict:true};data=structuredClone(next);revision++;return {etag:'"'+revision+'"'}},peek:()=>data};}
async function request({user=A,url='/api/client-portal',method='GET',body,store=memoryStore(),fetchImpl,authenticate}={}) {
  const response=res();await createClientPortalHandler({store,authenticate:authenticate|| (async()=>user?{sub:user}:null),fetchImpl,tokenProvider:async()=>'synthetic-token'})({url,method,body,headers:{origin:ORIGIN}},response);return response;
}
function rangedPdfFetch({bytes=Buffer.from('%PDF-1.7\ntest'),version='v1',postVersion=version,metaSize=bytes.length,rangeOverride,versionOverride}={}) {
  const calls=[];let metadataCalls=0;
  const fetchImpl=async(url,options={})=>{
    calls.push({url,options});
    if(url.includes('fields=size,mimeType,version')){metadataCalls++;return new Response(JSON.stringify({size:String(metaSize),mimeType:'application/pdf',version:metadataCalls===1?(versionOverride??version):postVersion}),{status:200,headers:{'Content-Type':'application/json'}});}
    const match=/^bytes=(\d+)-(\d+)$/.exec(options.headers?.Range||'');assert.ok(match,'Drive media request must carry an exact byte range');
    const start=Number(match[1]),end=Number(match[2]);const chunk=bytes.subarray(start,end+1);
    const contentRange=rangeOverride||`bytes ${start}-${end}/${metaSize}`;
    return new Response(chunk,{status:206,headers:{'Content-Range':contentRange,'Content-Length':String(chunk.length),'Content-Type':'application/pdf'}});
  };
  return {fetchImpl,calls};
}
test('parent and version totals do not double-count; strips source cost fields',()=>{
  const b=budgetProjection(project('019').budgets[0]);assert.equal(b.totalCents,35000);assert.equal(b.nodes[0].totalCents,35000);assert.equal(b.reconciled,true);
  assert.ok(!JSON.stringify(b).includes('SECRET'));assert.equal(b.nodes[0].children[0].costCents,undefined);
});
test('client sees only allocated project, never another client or admin sources',()=>{
  const s=initial(),l=listPortalProjects(s,A);assert.deepEqual(l.projects.map(p=>p.id),['019']);
  const p=readProject(s,A,'019');assert.equal(p.contractedCents,null);assert.equal(p.payments.receivedCents,null);assert.equal(p.balanceCents,null);assert.equal(p.documents.length,1);
  const serialized=JSON.stringify(p);for(const str of ['privateDrive','SECRET','supplierCosts','margin','INTERNAL'])assert.ok(!serialized.includes(str));
  assert.throws(()=>readProject(s,A,'008'),e=>e.status===404);assert.throws(()=>readProject(s,B,'019'),e=>e.status===404);
});
test('unknown user and internal Wiliam do not inherit financial access',()=>{
  assert.deepEqual(listPortalProjects(initial(),W).projects,[]);assert.deepEqual(listPortalProjects(initial(),'user_unknown').projects,[]);
});
test('module restriction omits financial values entirely, including summaries',()=>{
  const s=initial();s.clients[0].grants[0].modules=['documents'];const p=readProject(s,A,'019');
  for(const k of ['budgets','contractedCents','payments','balanceCents','milestones'])assert.equal(p[k],undefined);
});
test('draft publication and revocation deny immediately',()=>{
  const s=initial();s.projects[0].published=false;assert.throws(()=>readProject(s,A,'019'),e=>e.status===404);
  assert.equal(readProject(s,MASTER,'019',{preview:true}).id,'019');s.projects[0].published=true;s.clients[0].grants[0].active=false;assert.throws(()=>readProject(s,A,'019'),e=>e.status===404);
});
test('preview never allows clients to escalate or impersonate Master',()=>{
  for(const opts of [{preview:true},{asUserId:MASTER},{asUserId:B}])assert.throws(()=>readProject(initial(),A,'019',opts),e=>e.status===403);
});
test('Master preview-as-client applies exactly that client allocation',()=>{
  assert.deepEqual(readProject(initial(),MASTER,'019',{asUserId:A}),readProject(initial(),A,'019'));
  assert.throws(()=>readProject(initial(),MASTER,'019',{asUserId:B}),e=>e.status===404);
});
test('approved totals require acceptance evidence and arithmetic reconciliation',()=>{
  const s=initial(),b=s.projects[0].budgets[0];b.status='approved';assert.equal(readProject(s,A,'019').contractedCents,null);
  b.acceptance={reference:'Acceptance evidence in private source',date:'2026-11-10'};assert.equal(readProject(s,A,'019').contractedCents,35000);
  b.statedTotalCents=123;assert.equal(readProject(s,A,'019').contractedCents,null);assert.equal(budgetProjection(b).reconciled,false);
});
test('receipts distinguish incomplete coverage, confirmed payments, refunds and missing evidence',()=>{
  const s=initial(),p=s.projects[0];p.payments={coverage:'partial',items:[{id:'r1',date:'2026-11-10',amountCents:10000,confirmed:true},{id:'r2',date:'2026-11-10',amountCents:500,confirmed:true,type:'refund'},{id:'draft',date:'2026-11-10',amountCents:1000000,confirmed:false}]};
  const out=readProject(s,A,'019');assert.equal(out.payments.items.length,2);assert.equal(out.payments.receivedCents,9500);assert.equal(out.balanceCents,null);
});
test('unknown leaf amounts remain unknown, never silently zero',()=>{
  const b=project('019').budgets[0];delete b.nodes[0].children[0].totalCents;const out=budgetProjection(b);assert.equal(out.totalCents,null);assert.equal(out.reconciled,false);
  b.nodes[0].children[0].totalCents=Infinity;assert.equal(budgetProjection(b).totalCents,null);
});
test('duplicate documents, receipts and budget IDs fail closed',()=>{
  for(const kind of ['documents','budgets']){const s=initial();s.projects[0][kind].push({...s.projects[0][kind][0],visible:false});assert.throws(()=>validateEnvelope(s));}
  const s=initial();s.projects[0].payments.items=[{id:'x'},{id:'x'}];assert.throws(()=>validateEnvelope(s));
});
test('impossible receipt dates cannot produce a confirmed total',()=>{
  const s=initial();s.projects[0].payments={coverage:'complete',items:[{id:'x',confirmed:true,date:'2026-02-31',amountCents:100}]};assert.equal(readProject(s,A,'019').payments.receivedCents,null);
});
test('duplicate and overdeep budget nodes are rejected',()=>{
  const b=project('019').budgets[0];b.nodes[0].children[1].id='kitchen';assert.throws(()=>budgetProjection(b));
  b.nodes=[{id:'a'}];let p=b.nodes[0];for(let i=0;i<9;i++){p.children=[{id:'n'+i}];p=p.children[0];}assert.throws(()=>budgetProjection(b));
});
test('grants scoped to one project and modules; preserve other clients and automation',()=>{
  const s=initial();s.automation={keep:true};const out=mutatePortal(s,{action:'set-access',userId:A,projectId:'019',active:true,modules:['budget'],displayName:'Cliente'},MASTER).state;
  assert.equal(out.clients[1].grants[0].projectId,'008');assert.deepEqual(out.automation,{keep:true});assert.deepEqual(out.clients[0].grants[0].modules,['budget']);assert.equal(out.audit[0].actor,MASTER);assert.equal(s.revision,1);
  assert.throws(()=>mutatePortal(s,{action:'set-access'},A),e=>e.status===403);
});
test('publication refuses unreconciled budgets',()=>{
  const s=initial();s.projects[0].budgets[0].statedTotalCents=123;
  assert.throws(()=>mutatePortal(s,{action:'set-publication',projectId:'019',published:true,modules:['budget']},MASTER),e=>e.status===409);
});
test('self request cannot select a role, grant a project or impersonate another user',()=>{
  const out=mutatePortal(initial(),{action:'request-access',userId:MASTER,displayName:'Name',role:'master',projectId:'008',active:true,modules:['budget']},A).state;
  assert.equal(out.requests[0].userId,A);assert.equal(out.requests[0].role,undefined);assert.deepEqual(out.clients,initial().clients);assert.equal(mutatePortal(out,{action:'request-access',displayName:'Name'},A).unchanged,true);
});
test('HTTP unauthenticated and non-Master admin requests never read Drive',async()=>{
  const store=memoryStore();assert.equal((await request({user:null,store})).code,401);assert.equal(store.reads,0);
  assert.equal((await request({url:'/api/client-portal?admin=1',store})).code,403);assert.equal(store.reads,0);
  assert.equal((await request({method:'POST',body:{action:'set-publication'},store})).code,403);assert.equal(store.writes,0);
});
test('HTTP Master with missing client portal data ID fails before store or network fallback',async()=>{
  const previous=process.env.CLIENT_PORTAL_DATA_FILE_ID;delete process.env.CLIENT_PORTAL_DATA_FILE_ID;process.env.INVENTORY_DATA_FILE_ID='validInventoryFallbackId123';let network=0;
  try{const r=await request({user:MASTER,store:null,fetchImpl:async()=>{network++;throw Error('network must not be called')},authenticate:async()=>({sub:MASTER})});assert.equal(r.code,503);assert.equal(network,0);}
  finally{if(previous===undefined)delete process.env.CLIENT_PORTAL_DATA_FILE_ID;else process.env.CLIENT_PORTAL_DATA_FILE_ID=previous;}
});
test('HTTP denies horizontal access and documents outside curated list before external fetch',async()=>{
  let called=0;const f=async()=>{called++;throw Error('Should not fetch')};
  for(const url of ['/api/client-portal?project=008','/api/client-portal?project=019&document=invoice','/api/client-portal?project=019&document=../privateId','/api/client-portal?project=019&preview=1'])assert.ok([403,404].includes((await request({url,fetchImpl:f})).code));
  assert.equal(called,0);
});
test('HTTP PDF returns exact 1 MiB base64 ranges from curated Drive ID with no-store',async()=>{
  const bytes=Buffer.alloc(2*1024*1024+123,0x61);Buffer.from('%PDF-1.7').copy(bytes);
  const {fetchImpl,calls}=rangedPdfFetch({bytes});
  const first=await request({url:'/api/client-portal?project=019&document=proposal',fetchImpl});
  assert.equal(first.code,200);assert.match(first.headers['Cache-Control'],/no-store/);
  assert.deepEqual(Object.keys(first.body).sort(),['dataBase64','done','fileVersion','mimeType','nextOffset','offset','totalSize'].sort());
  assert.equal(first.body.offset,0);assert.equal(first.body.nextOffset,1024*1024);assert.equal(first.body.totalSize,bytes.length);assert.equal(first.body.mimeType,'application/pdf');assert.equal(first.body.fileVersion,'v1');assert.equal(first.body.done,false);
  assert.deepEqual(Buffer.from(first.body.dataBase64,'base64'),bytes.subarray(0,1024*1024));
  assert.equal(calls.length,3);assert.match(calls[0].url,/privateDriveFileId1/);assert.match(calls[0].url,/fields=size,mimeType,version/);assert.equal(calls[1].options.headers.Range,'bytes=0-1048575');assert.match(calls[2].url,/fields=size,mimeType,version/);
  const second=await request({url:'/api/client-portal?project=019&document=proposal&offset=1048576&fileVersion=v1',fetchImpl});
  assert.equal(second.code,200);assert.equal(second.body.offset,1048576);assert.equal(second.body.nextOffset,2*1024*1024);assert.equal(second.body.done,false);assert.equal(calls.filter(c=>c.options.headers?.Range).at(-1).options.headers.Range,'bytes=1048576-2097151');
  const third=await request({url:'/api/client-portal?project=019&document=proposal&offset=2097152&fileVersion=v1',fetchImpl});
  assert.equal(third.code,200);assert.equal(third.body.nextOffset,bytes.length);assert.equal(third.body.done,true);assert.deepEqual(Buffer.from(third.body.dataBase64,'base64'),bytes.subarray(2097152));
});
test('HTTP PDF rejects invalid offsets, oversized metadata and mismatched range length',async()=>{
  for(const offset of ['-1','1','1048577','30000001','1.5','abc'])assert.equal((await request({url:`/api/client-portal?project=019&document=proposal&offset=${offset}`,fetchImpl:rangedPdfFetch().fetchImpl})).code,400);
  assert.equal((await request({url:'/api/client-portal?project=019&document=proposal&offset=1048576',fetchImpl:rangedPdfFetch().fetchImpl})).code,400);
  assert.equal((await request({url:'/api/client-portal?project=019&document=proposal',fetchImpl:rangedPdfFetch({metaSize:30_000_001}).fetchImpl})).code,413);
  const mismatch=rangedPdfFetch({rangeOverride:'bytes 0-4/9'});assert.equal((await request({url:'/api/client-portal?project=019&document=proposal',fetchImpl:mismatch.fetchImpl})).code,503);
});
test('HTTP PDF rejects changed version, non-PDF metadata and invalid first-block magic',async()=>{
  const bytes=Buffer.alloc(1024*1024+1,0x61);Buffer.from('%PDF-').copy(bytes);
  const changed=rangedPdfFetch({bytes,version:'v2'});
  const r=await request({url:'/api/client-portal?project=019&document=proposal&offset=1048576&fileVersion=v1',fetchImpl:changed.fetchImpl});assert.equal(r.code,409);
  const changedDuringBlock=rangedPdfFetch({bytes:Buffer.from('%PDF-1.7\nlast'),postVersion:'v2'});
  const last=await request({url:'/api/client-portal?project=019&document=proposal',fetchImpl:changedDuringBlock.fetchImpl});assert.equal(last.code,409);
  assert.equal((await request({url:'/api/client-portal?project=019&document=proposal',fetchImpl:rangedPdfFetch({versionOverride:''}).fetchImpl})).code,503);
  const bad=Buffer.alloc(6,0x41);assert.equal((await request({url:'/api/client-portal?project=019&document=proposal',fetchImpl:rangedPdfFetch({bytes:bad}).fetchImpl})).code,503);
});
test('HTTP PDF requires authentication each chunk and never resolves foreign document IDs',async()=>{
  let called=0;const fetchImpl=async()=>{called++;throw Error('should not fetch')};const store=memoryStore();
  assert.equal((await request({user:null,url:'/api/client-portal?project=019&document=proposal',store,fetchImpl})).code,401);
  assert.equal((await request({url:'/api/client-portal?project=008&document=proposal',store,fetchImpl})).code,404);
  assert.equal((await request({url:'/api/client-portal?project=019&document=privateDriveId',store,fetchImpl})).code,404);
  assert.equal((await request({url:'/api/client-portal?project=019&document=proposal&offset=1048576&fileVersion=v1',authenticate:async()=>null,store,fetchImpl})).code,401);
  assert.equal(called,0);
});
test('writes require fresh revision and readback; conflict cannot overwrite',async()=>{
  const store=memoryStore(),body={action:'set-access',projectId:'019',userId:A,active:false,modules:[],etag:'"0"',baseRevision:1};
  assert.equal((await request({user:MASTER,method:'POST',body,store})).code,409);assert.equal(store.writes,0);
  body.etag='"1"';assert.equal((await request({user:MASTER,method:'POST',body,store})).code,200);assert.equal(store.peek().clients[0].grants[0].active,false);
  assert.equal((await request({url:'/api/client-portal?project=019',store})).code,404);
});
test('route does not leak provider errors, bodies or credentials',async()=>{
  const r=await request({store:{get(){throw Error('secret-token data')}}});assert.equal(r.code,503);assert.ok(!JSON.stringify(r.body).includes('secret'));
});
test('body validation rejects oversize and malformed JSON without writes',async()=>{
  const store=memoryStore();for(const body of ['{bad','x'.repeat(16001)]){const r=await request({user:MASTER,method:'POST',body,store});assert.ok([400,413].includes(r.code));}assert.equal(store.writes,0);
});
test('real Clerk verification rejects forged, expired, foreign-origin tokens and distinguishes client from Master',async()=>{
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});process.env.CLERK_JWT_KEY=publicKey.export({type:'spki',format:'pem'});process.env.CLERK_PUBLISHABLE_KEY='pk_live_Y2xlcmsuYXByZXNlbnRhY29lcy5hZ29yYWNvbnMuY29tLmJyJA';
  const token=(sub,extra={})=>{const now=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const payload=enc({alg:'RS256',typ:'JWT'})+'.'+enc({sub,sid:'sess_synthetic',iss:'https://clerk.apresentacoes.agoracons.com.br',azp:ORIGIN,iat:now,exp:now+60,...extra});return payload+'.'+sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url')};
  const store=memoryStore(),handler=createClientPortalHandler({store});
  async function call(auth,origin=ORIGIN,url='/api/client-portal?admin=1'){const r=res();await handler({method:'GET',url,headers:{origin,authorization:'Bearer '+auth}},r);return r;}
  assert.equal((await call(token(MASTER))).code,200);assert.equal((await call(token(A))).code,403);assert.equal((await call(token(MASTER,{exp:0}))).code,401);assert.equal((await call(token(MASTER),'https://example.com')).code,401);assert.equal((await call(token(MASTER)+'x')).code,401);
  assert.equal((await call(token(A),ORIGIN,'/api/client-portal?project=019')).code,200);
});

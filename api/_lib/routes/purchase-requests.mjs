import { createOrganizer } from '../purchase-organizer.mjs';
import { DrivePurchaseStore } from '../purchase-store.mjs';
import { PurchaseError,MASTER_ID,PROJECTS,UUID,plain,digest,recordTag,photosOf,createRecord,changeRecord,decodePhoto,itemsOf,linesForRecord } from '../purchase-requests.mjs';

const ORIGIN='https://apresentacoes.agoracons.com.br';
const MAX_BODY=4_100_000;
const quotas=new Map();
function limit(user,action) {
  const key=`${user}:${action}`,now=Date.now(),window=60_000;let q=quotas.get(key);
  if(!q||now-q.start>window)q={start:now,count:0};q.count++;quotas.set(key,q);
  if(q.count>(action==='organize'?8:30))throw new PurchaseError('Muitas solicitações. Aguarde um minuto e tente novamente.',429,'rate_limited');
  if(quotas.size>200)for(const [k,v]of quotas)if(now-v.start>window)quotas.delete(k);
}
function bodyOf(req) {
  if(Number(req.headers?.['content-length']||0)>MAX_BODY)throw new PurchaseError('Envie menos fotos de cada vez.',413);
  let raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
  if(Buffer.byteLength(raw)>MAX_BODY)throw new PurchaseError('Envie menos fotos de cada vez.',413);
  let value;try{value=JSON.parse(raw);}catch{throw new PurchaseError('Solicitação inválida.');}
  if(!plain(value))throw new PurchaseError('Solicitação inválida.');return value;
}
function envelope(raw) {
  if(!plain(raw)||raw.version!==1||!Array.isArray(raw.requests)||!Array.isArray(raw.mutationIds)||!plain(raw.mutationHashes))throw new PurchaseError('A base de compras precisa de conferência.',503,'data_invalid');
  return raw;
}
function publicRequest(record) {
  return {...record,lines:linesForRecord(record)};
}
function saved(record,duplicate) {
  return {request:publicRequest(record),etag:recordTag(record),duplicate};
}
const organize=createOrganizer();
export function createPurchaseHandler({authorize=null,store=null,organizer=organize,rateLimit=limit,clock=()=>new Date().toISOString()}={}) {
 return async function handler(req,res) {
  res.setHeader('Access-Control-Allow-Origin',ORIGIN);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, If-Match');res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(!['GET','POST','PATCH'].includes(req.method))return res.status(405).json({error:'Método não permitido.'});
  const auth=authorize||(await import('../auth.mjs')).requireAuth;
  const session=await auth(req,res);if(!session)return;
  try {
   const storage=store||new DrivePurchaseStore();
   const url=new URL(req.url,'https://agora.local');const body=req.method==='GET'?{}:bodyOf(req);
   const action=req.method==='GET'?(url.searchParams.get('action')||'list'):body.action;
   const canManage=session.sub===MASTER_ID;
   if(req.method==='POST'&&action==='organize'){rateLimit(session.sub,action);return res.status(200).json(await organizer(body));}
   if(req.method==='POST'&&action==='upload-photo'){
    if(!UUID.test(body.requestId||''))throw new PurchaseError('Identificador inválido.');
    rateLimit(session.sub,action);const p=decodePhoto(body);
    // Photos belong to a draft being created; edits never alter saved attachment sets.
    const loaded=envelope((await storage.get()).envelope);
    if(loaded.requests.some(r=>r.id===body.requestId))throw new PurchaseError('Esta solicitação já foi salva.',409);
    return res.status(200).json({photo:await storage.upload({requestId:body.requestId,userId:session.sub,name:body.fileName,...p})});
   }
   let loaded=await storage.get(),data=envelope(loaded.envelope);
   if(req.method==='GET'){
    if(action==='list')return res.status(200).json({requests:[...data.requests].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(publicRequest),projects:PROJECTS,canManage});
    const id=url.searchParams.get('id');if(!UUID.test(id||''))throw new PurchaseError('Identificador inválido.');
    const record=data.requests.find(r=>r.id===id);if(!record)throw new PurchaseError('Solicitação não encontrada.',404);
    if(action==='read')return res.status(200).json({request:publicRequest(record),etag:recordTag(record),canManage});
    if(action==='photo'){
      const photoId=url.searchParams.get('photoId');if(!record.photos.some(p=>p.id===photoId))throw new PurchaseError('Foto não pertence a esta solicitação.',403,'photo_denied');
      const photo=await storage.photo(photoId,id,record.createdBy);
      res.setHeader('Content-Type',photo.mimeType);res.setHeader('Content-Disposition','inline; filename="foto-compra"');
      return res.status(200).send(photo.bytes);
    }
    throw new PurchaseError('Ação inválida.');
   }
   if(!((req.method==='POST'&&action==='create')||(req.method==='PATCH'&&action==='update')))throw new PurchaseError('Ação inválida.');
   rateLimit(session.sub,action);
   let nextRecord=null;
   const hash=digest({user:session.sub,request:body.request||null});
   if(action==='create') {
    if(!UUID.test(body.mutationId||'')||!plain(body.request)||!UUID.test(body.request.id||''))throw new PurchaseError('Identificador inválido.');
    const duplicate=data.requests.find(r=>r.id===body.request.id);
    if(duplicate){
      if(duplicate.createdBy!==session.sub||duplicate.creationHash!==hash)throw new PurchaseError('Identificador já utilizado com outro pedido.',409);
      return res.status(200).json(saved(duplicate,true));
    }
    const photos=[];for(const p of photosOf(body.request.photos||[]))photos.push(await storage.photoMetadata(p.id,body.request.id,session.sub));
    nextRecord={...createRecord(body.request,session,photos,clock()),creationHash:hash};
   } else if(!UUID.test(body.id||'')||typeof body.etag!=='string')throw new PurchaseError('Versão ou identificador inválidos.');
   for(let attempt=0;attempt<4;attempt++) {
    if(attempt){loaded=await storage.get();data=envelope(loaded.envelope);}
    let next;
    if(action==='create') {
      const prior=data.requests.find(r=>r.id===nextRecord.id);
      if(prior){if(prior.createdBy===session.sub&&prior.creationHash===hash){return res.status(200).json(saved(prior,true));}throw new PurchaseError('Identificador já usado.',409);}
      if(data.mutationIds.includes(body.mutationId)&&data.mutationHashes[body.mutationId]!==hash)throw new PurchaseError('Operação já usada com outros dados.',409);
      if(data.requests.length>=2000)throw new PurchaseError('A base chegou ao limite. Solicite o arquivamento dos pedidos antigos.',409);
      const ids=[...data.mutationIds,body.mutationId].slice(-100),hashes={...data.mutationHashes,[body.mutationId]:hash};for(const key of Object.keys(hashes))if(!ids.includes(key))delete hashes[key];
      next={...data,requests:[...data.requests,nextRecord],mutationIds:ids,mutationHashes:hashes};
    } else {
      const prior=data.requests.find(r=>r.id===body.id);if(!prior)throw new PurchaseError('Solicitação não encontrada.',404);
      nextRecord=changeRecord(prior,body.changes,session,body.etag,clock());
      next={...data,requests:data.requests.map(r=>r.id===body.id?nextRecord:r)};
    }
    const result=await storage.put(next,loaded.etag);if(result.conflict)continue;
    const readback=envelope((await storage.get()).envelope).requests.find(r=>r.id===nextRecord.id);
    if(!readback||recordTag(readback)!==recordTag(nextRecord))throw new PurchaseError('O pedido mudou durante a gravação. Reabra para conferir.',409,'revision_conflict');
    return res.status(200).json(saved(readback,false));
   }
   throw new PurchaseError('Outra solicitação está sendo salva. Tente novamente.',409,'revision_conflict');
  } catch(error) {
   const known=error instanceof PurchaseError;
   return res.status(known?error.status:503).json({code:known?error.code:'purchase_unavailable',error:known?error.message:'Não foi possível concluir agora. Seus dados continuam no formulário; tente novamente.'});
  }
 };
}
export default createPurchaseHandler();

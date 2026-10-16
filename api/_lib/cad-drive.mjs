import { getGoogleDriveAccessToken } from './google.mjs';
import { driveId } from './drive.mjs';
import { createHash, randomUUID } from 'node:crypto';
export const MAX_BYTES = 10 * 1024 * 1024;
const fields = 'id,name,mimeType,size,parents,modifiedTime,md5Checksum,appProperties,trashed';
export function fail(status, message) { throw Object.assign(new Error(message), {status}); }
function validId(id) { const result=driveId(id); if(!result) fail(400,'ID inválido.'); return result; }
async function req(path, params={}, init={}, upload=false) {
  const url=new URL((upload?'https://www.googleapis.com/upload/drive/v3/':'https://www.googleapis.com/drive/v3/')+path);
  for(const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
  const response=await fetch(url,{...init,headers:{Authorization:`Bearer ${await getGoogleDriveAccessToken()}`,...init.headers},signal:AbortSignal.timeout(30000)});
  if(!response.ok) fail(response.status,'Não foi possível acessar o Drive.');
  return response;
}
export async function meta(id) { return (await req(`files/${validId(id)}`,{fields,supportsAllDrives:true})).json(); }
export async function children(id) {
  const all=[]; let pageToken='';
  do {
    const data=await (await req('files',{q:`'${validId(id)}' in parents and trashed=false`,fields:`nextPageToken,files(${fields})`,pageSize:100,supportsAllDrives:true,includeItemsFromAllDrives:true,...(pageToken?{pageToken}:{})})).json();
    all.push(...(data.files||[]));pageToken=data.nextPageToken||'';
  } while(pageToken);
  return all;
}
export async function roots() {
  const config=JSON.parse(process.env.GOOGLE_DRIVE_PROJECTS_JSON||'{}'), out=[];
  for(const [project,value] of Object.entries(config)) for(const category of ['projeto','fotos','renders']) {
    const id=driveId(value?.[category]); if(id&&!out.some(x=>x.id===id))out.push({id,name:`${project} — ${category}`});
  }
  return out;
}
export async function allowed(id) {
  const ids=new Set((await roots()).map(x=>x.id)), seen=new Set();let current=driveId(id);
  for(let depth=0;current&&depth<40;depth++) {
    if(seen.has(current))return false;seen.add(current);
    const file=await meta(current); if(file.trashed)return false;
    if(ids.has(current))return true;current=file.parents?.[0];
  }
  return false;
}
export async function download(id,max=MAX_BYTES) {
  const file=await meta(id); if(Number(file.size)>max)fail(413,'Arquivo acima do limite de 3 MB.');
  const response=await req(`files/${validId(id)}`,{alt:'media'});
  const chunks=[];let size=0;
  for await(const chunk of response.body) {size+=chunk.length;if(size>max)fail(413,'Arquivo acima do limite de 3 MB.');chunks.push(Buffer.from(chunk));}
  return Buffer.concat(chunks);
}
async function multipart(metadata,mime,data,id=null) {
  const boundary='cad_'+randomUUID();
  const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),data,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return (await req(id?`files/${validId(id)}`:'files',{uploadType:'multipart',supportsAllDrives:true,fields},{method:id?'PATCH':'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body},true)).json();
}
export const uploadJson=(parent,name,data,props)=>multipart({name,parents:[validId(parent)],mimeType:'application/json',appProperties:props},'application/json',Buffer.from(JSON.stringify(data)));
export const updateJson=(id,data,props)=>multipart({appProperties:props},'application/json',Buffer.from(JSON.stringify(data)),id);
export const uploadBinary=(parent,name,mime,data,props)=>multipart({name,parents:[validId(parent)],mimeType:mime,appProperties:props},mime,Buffer.isBuffer(data)?data:Buffer.from(data,'base64'));
export const hashKey=value=>createHash('sha256').update(value).digest('hex');

// Each HTTP response stays below the platform payload limit.
export const CHUNK_BYTES=2*1024*1024;
export async function downloadPart(id,offset=0) {
 const file=await meta(id),total=Number(file.size);
 if(!Number.isSafeInteger(total)||total<1||total>MAX_BYTES)fail(413,'Limite de 10 MB.');
 if(!Number.isSafeInteger(offset)||offset<0||offset>=total)fail(416,'Parte inválida.');
 const end=Math.min(total-1,offset+CHUNK_BYTES-1);
 const response=await req(`files/${validId(id)}`,{alt:'media'},{headers:{Range:`bytes=${offset}-${end}`}});
 const parts=[];let length=0;
 for await(const part of response.body){length+=part.length;if(length>CHUNK_BYTES)fail(502,'Resposta parcial inválida.');parts.push(Buffer.from(part));}
 if(length!==end-offset+1||(offset>0&&response.status!==206))fail(502,'Resposta parcial incompleta.');
 return {bytes:Buffer.concat(parts),total,offset,end};
}
export function sendPart(res,part) {
 res.setHeader('Content-Type','application/octet-stream');
 res.setHeader('Content-Range',`bytes ${part.offset}-${part.end}/${part.total}`);
 res.setHeader('Access-Control-Expose-Headers','Content-Range');
 return res.status(206).send(part.bytes);
}

import {randomUUID} from 'node:crypto';

import {children,meta,allowed,uploadJson,updateJson,uploadBinary,download,hashKey,fail,MAX_BYTES} from './cad-drive.mjs';

export const queue=()=>{if(!process.env.CAD_QUEUE_FOLDER_ID)fail(503,'Serviço CAD ainda não configurado.');return process.env.CAD_QUEUE_FOLDER_ID;};

export const clean=(value,max=160)=>String(value||'').trim().slice(0,max).replace(/[\\/\0<>:"|?*]/g,'_');

const uuid=/^[a-f0-9-]{36}$/i;

export async function records() {return (await children(queue())).filter(f=>f.appProperties?.cadRecord==='job');}

export async function load(file) {const job=JSON.parse((await download(file.id,65536)).toString());return {...job,recordId:file.id};}

export async function get(id) {if(!uuid.test(String(id||'')))return null;const file=(await records()).find(f=>f.appProperties.cadJobId===id);return file?load(file):null;}

export async function save(job) {

  const {recordId,...data}=job;

  await updateJson(recordId,data,{cadRecord:'job',cadJobId:job.id,cadPreviewKey:job.key,cadStatus:job.status});

}

export async function sourceAllowed(job) {

  if(job.localSource) {const source=await meta(job.sourceId);return !source.trashed&&source.parents?.includes(queue())&&source.appProperties?.cadSourceJob===job.id;}

  return allowed(job.sourceId);

}

export async function destinationAllowed(job) { return job.preview === true && job.destinationId === queue() || allowed(job.destinationId); }

export async function create(body,owner) {

  queue();const preview=body.preview===true;if(preview)body={...body,format:'pdf',destinationId:queue()};if(!['pdf','dxf','dwg'].includes(body.format))fail(400,'Formato inválido.');

  if(!preview&&!(await allowed(body.destinationId)))fail(403,'Destino não autorizado.');

  const destination=await meta(body.destinationId);if(destination.mimeType!=='application/vnd.google-apps.folder')fail(400,'Escolha uma pasta.');

  const id=randomUUID();let source,localSource=false;

  if(body.fileBase64) {

    if(!/^[A-Za-z0-9+/]*={0,2}$/.test(body.fileBase64))fail(400,'Arquivo inválido.');

    const bytes=Buffer.from(body.fileBase64,'base64'),name=clean(body.fileName);

    if(!bytes.length||bytes.length>2*1024*1024)fail(413,'Arquivo local deve ter até 2 MB.');

    if(!/\.(dwg|dxf)$/i.test(name))fail(400,'Escolha um DWG ou DXF.');

    source=await uploadBinary(queue(),name,'application/octet-stream',bytes,{cadSourceJob:id});localSource=true;

  } else {

    if(!(await allowed(body.sourceId)))fail(403,'Fonte não autorizada.');source=await meta(body.sourceId);

  }

  if(!/\.(dwg|dxf)$/i.test(source.name)||source.mimeType==='application/vnd.google-apps.shortcut')fail(400,'Escolha um DWG ou DXF.');

  if(Number(source.size)>MAX_BYTES)fail(413,'Esta versão aceita arquivos do Drive até 3 MB.');

  const key=hashKey(JSON.stringify([source.id,source.modifiedTime,source.md5Checksum||'',destination.id,body.format,owner]));

  for(const record of await records()) if(record.appProperties.cadPreviewKey===key) {

    const existing=await load(record);

    if(existing.status==='queued'||existing.status==='processing')return existing;

    if(existing.status==='completed') {try {if(!(await meta(existing.outputId)).trashed)return existing;}catch{}}

  }

  const job={id,owner,key,status:'queued',preview,sourceId:source.id,localSource,destinationId:destination.id,format:body.format,source:{name:source.name,modifiedTime:source.modifiedTime,checksum:source.md5Checksum||''},createdAt:new Date().toISOString(),attempts:0};

  const record=await uploadJson(queue(),`cad-job-${id}.json`,job,{cadRecord:'job',cadJobId:id,cadPreviewKey:key,cadStatus:'queued'});

  return {...job,recordId:record.id};

}


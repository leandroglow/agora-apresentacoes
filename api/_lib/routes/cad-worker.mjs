import {destinationAllowed} from '../cad-jobs.mjs';
import {timingSafeEqual,randomUUID} from 'node:crypto';

import {json,readJsonBody} from '../http.mjs';

import {get,records,load,save,sourceAllowed,clean,queue} from '../cad-jobs.mjs';

import {children,meta,allowed,uploadBinary,download,fail,MAX_BYTES,CHUNK_BYTES,downloadPart,sendPart} from '../cad-drive.mjs';

const LEASE_MS=15*60*1000;

export function authenticated(req) {

  const expected=process.env.CAD_WORKER_TOKEN, provided=req.headers['x-cad-worker-token'];

  return typeof expected==='string'&&expected.length>=32&&typeof provided==='string'&&Buffer.byteLength(expected)===Buffer.byteLength(provided)&&timingSafeEqual(Buffer.from(expected),Buffer.from(provided));

}

export default async function handler(req,res) {

  res.setHeader('Cache-Control','no-store');

  if(!authenticated(req))return json(res,401,{error:'Worker não autorizado.'});

  try {

    const query=new URL(req.url,'https://agora.local').searchParams;

    if(req.method==='GET'&&query.get('action')==='download') {

      const job=await get(query.get('id'));

      if(!job||job.status!=='processing'||job.leaseToken!==query.get('lease'))fail(409,'Trabalho não disponível.');

      if(!(await sourceAllowed(job))||!(await destinationAllowed(job)))fail(403,'Acesso revogado.');

      const current=await meta(job.sourceId);

      if(current.modifiedTime!==job.source.modifiedTime||((current.md5Checksum||'')!==job.source.checksum))fail(409,'A fonte mudou. Solicite uma nova conversão.');

      if(query.has('offset'))return sendPart(res,await downloadPart(job.sourceId,Number(query.get('offset'))));

      const bytes=await download(job.sourceId,3*1024*1024);

      res.setHeader('Content-Type','application/octet-stream');return res.status(200).send(bytes);

    }

    if(req.method==='GET') {

      // One configured worker only. Drive does not provide an atomic claim operation.

      for(const record of await records()) {

        if(!['queued','processing'].includes(record.appProperties.cadStatus))continue;

        const job=await load(record);

        if(job.status==='processing'&&Date.parse(job.leaseUntil)>Date.now())continue;

        if(job.attempts>=3){job.status='failed';job.error='O processamento foi interrompido três vezes. Solicite novamente.';await save(job);continue;}

        job.status='processing';job.attempts=(job.attempts||0)+1;job.leaseToken=randomUUID();job.leaseUntil=new Date(Date.now()+LEASE_MS).toISOString();await save(job);

        return json(res,200,{job:{id:job.id,inputName:job.source.name,format:job.format,leaseToken:job.leaseToken,downloadUrl:`/api/cad-worker?action=download&id=${job.id}&lease=${job.leaseToken}`}});

      }

      return json(res,200,{job:null});

    }

    if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});

    const body=readJsonBody(req),job=await get(body.id);

    if(!job)fail(404,'Trabalho não localizado.');

    if(job.leaseToken!==body.leaseToken)fail(409,'Tentativa expirada.');

    if(job.status==='completed')return json(res,200,{ok:true,outputId:job.outputId});

    if(job.status!=='processing')fail(409,'Trabalho não está em processamento.');

    if(body.status==='failed') {job.status='failed';job.error='Não foi possível converter o desenho. Verifique o arquivo e tente novamente.';await save(job);return json(res,200,{ok:true});}

    if(body.status==='chunk') {

      if(!Number.isInteger(body.index)||!Number.isInteger(body.total)||body.index<0||body.index>=body.total||body.total<1||body.total>5)fail(400,'Parte inválida.');

      if(typeof body.dataBase64!=='string'||body.dataBase64.length>4*Math.ceil(CHUNK_BYTES/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.dataBase64))fail(413,'Parte muito grande.');

      const data=Buffer.from(body.dataBase64,'base64');if(!data.length||data.length>CHUNK_BYTES)fail(413,'Parte inválida.');

      const key=`${job.leaseToken}-${body.index}`;

      let part=(await children(queue())).find(f=>f.appProperties?.cadPartKey===key);

      if(!part)part=await uploadBinary(queue(),`cad-part-${job.id}-${body.index}`,'application/octet-stream',data,{cadPartKey:key,cadPartJob:job.id});

      return json(res,200,{ok:true});

    }

    if(body.status!=='completed')fail(400,'Estado inválido.');

    let bytes;

    if(body.chunks!==undefined) {

      if(!Number.isInteger(body.chunks)||body.chunks<1||body.chunks>5)fail(400,'Partes inválidas.');

      const available=await children(queue()),parts=[];

      for(let i=0;i<body.chunks;i++){

        const file=available.find(f=>f.appProperties?.cadPartKey===`${job.leaseToken}-${i}`);

        if(!file)fail(409,'Parte ausente.');parts.push(await download(file.id,CHUNK_BYTES));

      }

      bytes=Buffer.concat(parts);

    } else {

      if(typeof body.dataBase64!=='string'||body.dataBase64.length>4*Math.ceil(3*1024*1024/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.dataBase64))fail(413,'Use envio em partes.');

      bytes=Buffer.from(body.dataBase64,'base64');

    }

    if(!bytes.length||bytes.length>MAX_BYTES)fail(413,'Limite de 10 MB.');

    if(job.format==='pdf'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))fail(400,'PDF inválido.');

    if(job.format==='dwg'&&!/^AC10/.test(bytes.subarray(0,6).toString()))fail(400,'DWG inválido.');

    if(!(await sourceAllowed(job)))fail(403,'Fonte não autorizada.');

    const current=await meta(job.sourceId);

    if(current.modifiedTime!==job.source.modifiedTime||(current.md5Checksum||'')!==job.source.checksum)fail(409,'A fonte mudou durante a conversão.');

    if(!(await destinationAllowed(job)))fail(403,'Destino não autorizado.');

    let output=(await children(job.destinationId)).find(f=>f.appProperties?.cadOutputJob===job.id);

    if(!output)output=await uploadBinary(job.destinationId,clean(job.source.name.replace(/\.(dwg|dxf)$/i,''))+` - convertido ${job.id.slice(0,8)}.${job.format}`,job.format==='pdf'?'application/pdf':'application/octet-stream',bytes,{cadOutputJob:job.id,cadFormat:job.format});

    job.status='completed';job.outputId=output.id;job.outputName=output.name;job.outputSize=bytes.length;job.completedAt=new Date().toISOString();await save(job);

    return json(res,200,{ok:true,outputId:output.id});

  } catch(error) {

    const status=Number(error.status)||502;

    return json(res,status,{error:status===503?'Serviço CAD ainda não configurado.':status===413?'Arquivo acima do limite de 10 MB.':'Não foi possível processar o pedido CAD.'});

  }

}


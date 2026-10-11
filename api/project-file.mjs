import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, setCors } from './_lib/http.mjs';
import {issueTicket,verifyTicket,mediaRange} from './_lib/media-ticket.mjs';

function validId(id){ return /^[A-Za-z0-9_-]{10,}$/.test(String(id||'')); }
export default async function handler(req,res){
  setCors(req,res);
  if(handleOptions(req,res)) return;
  if(req.method!=='GET') return json(res,405,{error:'Método não permitido.'});
  const params=new URL(req.url||'/api/project-file','https://agora-apresentacoes.vercel.app').searchParams;
  const id=params.get('id');
  if(!validId(id)) return json(res,400,{error:'Arquivo inválido.'});
  const ticket=params.get('ticket');
  let user;
  if(ticket){if(!verifyTicket(ticket,id))return json(res,401,{error:'Acesso ao vídeo expirado. Reabra o vídeo.'});}
  else {user=await requireAuth(req,res);if(!user)return;}
  try{
    const token=await getGoogleDriveAccessToken();
    const meta=await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=id,mimeType,name,trashed,size`,{headers:{Authorization:`Bearer ${token}`}});
    if(!meta.ok) return json(res,meta.status===404?404:502,{error:'Arquivo não encontrado.'});
    const info=await meta.json();
    if(info.trashed) return json(res,404,{error:'Arquivo indisponível.'});
    if(params.get('action')==='playback'&&user){
      if(!info.mimeType?.startsWith('video/'))return json(res,400,{error:'Arquivo não é vídeo.'});
      return json(res,200,{url:'https://agora-apresentacoes.vercel.app/api/project-file?id='+id+'&ticket='+issueTicket(id,user.sub)});
    }
    if(ticket){
      if(!info.mimeType?.startsWith('video/'))return json(res,403,{error:'Arquivo não é vídeo.'});
      const size=Number(info.size),range=mediaRange(req.headers.range,size);
      if(!range){res.setHeader('Content-Range','bytes */'+size);return res.status(416).end();}
      const part=await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&alt=media`,{headers:{Authorization:`Bearer ${token}`,Range:`bytes=${range.start}-${range.end}`},signal:AbortSignal.timeout(60000)});
      if(part.status!==206){await part.body?.cancel();return json(res,502,{error:'Drive não disponibilizou o trecho do vídeo.'});}
      const data=Buffer.from(await part.arrayBuffer());
      res.statusCode=206;res.setHeader('Content-Type',info.mimeType);res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Range',part.headers.get('content-range'));res.setHeader('Content-Length',String(data.length));res.setHeader('Cache-Control','private, no-store');return res.end(data);
    }
    const file=await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&alt=media`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
    if(!file.ok) return json(res,502,{error:'Não foi possível carregar o arquivo.'});
    const data=Buffer.from(await file.arrayBuffer());
    res.statusCode=200;
    res.setHeader('Content-Type',info.mimeType||file.headers.get('content-type')||'application/octet-stream');
    res.setHeader('Content-Length',String(data.length));
    res.setHeader('Content-Disposition',`inline; filename="${String(info.name||'arquivo').replace(/["\\\r\n]/g,'_')}"`);
    res.setHeader('Cache-Control','private, max-age=300');
    return res.end(data);
  }catch(error){ return json(res,502,{error:'Erro ao carregar o arquivo.'}); }
}

import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, setCors } from './_lib/http.mjs';

function validId(id){ return /^[A-Za-z0-9_-]{10,}$/.test(String(id||'')); }
export default async function handler(req,res){
  setCors(req,res);
  if(handleOptions(req,res)) return;
  if(req.method!=='GET') return json(res,405,{error:'Método não permitido.'});
  const user=await requireAuth(req,res); if(!user) return;
  const id=new URL(req.url||'/api/project-file','https://agora-apresentacoes.vercel.app').searchParams.get('id');
  if(!validId(id)) return json(res,400,{error:'Arquivo inválido.'});
  try{
    const token=await getGoogleDriveAccessToken();
    const meta=await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=id,mimeType,name,trashed`,{headers:{Authorization:`Bearer ${token}`}});
    if(!meta.ok) return json(res,meta.status===404?404:502,{error:'Arquivo não encontrado.'});
    const info=await meta.json();
    if(info.trashed) return json(res,404,{error:'Arquivo indisponível.'});
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

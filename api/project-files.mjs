import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, setCors } from './_lib/http.mjs';

const FOLDER='application/vnd.google-apps.folder';
const IMAGE_TYPES=['image/jpeg','image/png','image/webp'];

function projectsConfig(){
  const raw=process.env.GOOGLE_DRIVE_PROJECTS_JSON;
  if(!raw) throw Object.assign(new Error('Configure GOOGLE_DRIVE_PROJECTS_JSON na API.'),{code:'DRIVE_PROJECTS_CONFIG'});
  let value;
  try{ value=JSON.parse(raw); }catch{ throw Object.assign(new Error('GOOGLE_DRIVE_PROJECTS_JSON inválido.'),{code:'DRIVE_PROJECTS_CONFIG'}); }
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
}

function validId(id){ return /^[\w-]+$/.test(String(id||'')); }

export default async function handler(req,res){
  setCors(req,res);
  if(handleOptions(req,res)) return;
  const user=await requireAuth(req,res);
  if(!user) return;
  if(req.method!=='GET') return json(res,405,{error:'Método não permitido.'});
  try{
    const token=await getGoogleDriveAccessToken();
    const cfg=projectsConfig();
    async function call(path){
      const r=await fetch('https://www.googleapis.com/'+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
      if(!r.ok) throw new Error('Drive indisponível ('+r.status+').');
      return r.json();
    }
    async function list(folderId,mime){
      if(!validId(folderId)) throw new Error('Pasta inválida.');
      const clauses=[`'${folderId}' in parents`,'trashed=false'];
      if(mime) clauses.push(`mimeType='${mime}'`);
      const params=new URLSearchParams({q:clauses.join(' and '),fields:'files(id,name,mimeType,parents),nextPageToken',pageSize:'1000',orderBy:'name'});
      return (await call('drive/v3/files?'+params)).files||[];
    }
    const url=new URL(req.url||'/api/project-files','https://agora-apresentacoes.vercel.app');
    const project=url.searchParams.get('project');
    const category=url.searchParams.get('category');
    const folder=url.searchParams.get('folder');
    const allowedRoots=[];
    for(const entry of Object.values(cfg)) for(const id of [entry?.projeto,entry?.fotos,entry?.renders]) if(validId(id)) allowedRoots.push(id);
    if(folder){
      if(!allowedRoots.includes(folder)){
        const meta=await call(`drive/v3/files/${folder}?fields=id,parents,mimeType,trashed`);
        if(meta.trashed||meta.mimeType!==FOLDER||!meta.parents?.some(p=>allowedRoots.includes(p))) return json(res,403,{error:'Pasta fora dos projetos autorizados.'});
      }
      return json(res,200,{files:await list(folder,undefined)});
    }
    if(!project||!Object.prototype.hasOwnProperty.call(cfg,project)) return json(res,400,{error:'Projeto inválido.'});
    if(!['projeto','fotos','renders'].includes(category)) return json(res,400,{error:'Categoria inválida.'});
    const root=cfg[project]?.[category];
    if(!validId(root)) return json(res,404,{error:'Pasta do projeto não configurada.'});
    return json(res,200,{files:await list(root,undefined)});
  }catch(error){
    return json(res,error.code==='DRIVE_PROJECTS_CONFIG'?503:502,{error:error.message});
  }
}

import {authenticateClerkRequest} from '../auth.mjs';
import {getGoogleDriveAccessToken} from '../google.mjs';
import {DriveInventoryStore} from '../inventory-store.mjs';
import {PORTAL_MASTER,validateEnvelope,listPortalProjects,readProject,mutatePortal,adminProjection,fail} from '../client-portal.mjs';

const ORIGIN='https://apresentacoes.agoracons.com.br';
function body(req) {
  if(Buffer.byteLength(typeof req.body==='string'?req.body:JSON.stringify(req.body||{}))>16000)throw fail('Solicitação muito grande.',413);
  try{return typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{throw fail('Solicitação inválida.');}
}
export function createClientPortalHandler({authenticate=authenticateClerkRequest,store=null,fetchImpl=fetch,tokenProvider=getGoogleDriveAccessToken}={}) {
  return async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin',ORIGIN);res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    if(req.method==='OPTIONS')return res.status(204).end();
    if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método não permitido.'});
    try {
      const session=await authenticate(req);
      if(!session)return res.status(401).json({error:'Entre com sua conta Ágora.'});
      const url=new URL(req.url,'https://agora-apresentacoes.vercel.app');
      const admin=url.searchParams.get('admin')==='1';
      const input=req.method==='POST'?body(req):null;
      if((admin||(input&&input.action!=='request-access'))&&session.sub!==PORTAL_MASTER)throw fail('Somente o Master pode gerenciar o portal.',403);
      const storage=store||new DriveInventoryStore({fileId:process.env.CLIENT_PORTAL_DATA_FILE_ID,tokenProvider,fetchImpl});
      const loaded=await storage.get(),state=validateEnvelope(loaded.envelope);
      if(req.method==='GET') {
        if(admin)return res.status(200).json({...adminProjection(state),etag:loaded.etag});
        const projectId=url.searchParams.get('project');
        if(!projectId)return res.status(200).json(listPortalProjects(state,session.sub));
        const options={preview:url.searchParams.get('preview')==='1',asUserId:url.searchParams.get('asUser')||undefined};
        const project=readProject(state,session.sub,projectId,options);
        const documentId=url.searchParams.get('document');
        if(documentId) {
          // File ID is resolved only from a permitted project's curated list.
          if(!project.documents?.some(d=>d.id===documentId))throw fail('Documento indisponível.',404);
          const doc=state.projects.find(p=>p.id===projectId).documents.find(d=>d.id===documentId&&d.visible===true&&d.mimeType==='application/pdf');
          if(!/^[\w-]{10,}$/.test(doc.fileId||''))throw fail('Documento indisponível.',404);
          const token=await tokenProvider();
          const response=await fetchImpl(`https://www.googleapis.com/drive/v3/files/${doc.fileId}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(25000)});
          if(!response.ok)throw fail('Não foi possível abrir o documento.',503);
          if(Number(response.headers.get('content-length')||0)>30_000_000)throw fail('Documento excede o limite.',413);
          const chunks=[];let length=0;
          for await(const chunk of response.body){length+=chunk.length;if(length>30_000_000)throw fail('Documento excede o limite.',413);chunks.push(chunk);}
          const bytes=Buffer.concat(chunks);
          if(bytes.subarray(0,5).toString()!=='%PDF-')throw fail('Formato do documento inválido.',503);
          res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="documento-${projectId}-${documentId.replace(/[^\w-]/g,'')}.pdf"`);
          res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
          return res.status(200).send(bytes);
        }
        return res.status(200).json({project,preview:options.preview||!!options.asUserId});
      }
      if(input.action!=='request-access'&&(input.etag!==loaded.etag||input.baseRevision!==state.revision))throw fail('Os dados mudaram. Atualize a tela antes de salvar.',409);
      const changed=mutatePortal(state,input,session.sub);
      if(changed.unchanged)return res.status(200).json({ok:true,unchanged:true});
      const saved=await storage.put(changed.state,loaded.etag);
      if(saved.conflict)throw fail('Os dados mudaram. Atualize a tela antes de salvar.',409);
      const after=await storage.get();
      if(JSON.stringify(after.envelope)!==JSON.stringify(changed.state))throw fail('A gravação precisa ser conferida. Atualize antes de tentar novamente.',409);
      return res.status(200).json({ok:true,revision:changed.state.revision});
    } catch(error) {
      const status=error.safe?error.status:error.status===409?409:503;
      return res.status(status).json({error:error.safe?error.message:'Não foi possível consultar o portal. Tente novamente em instantes.'});
    }
  };
}
export default createClientPortalHandler();

import {authenticateClerkRequest} from '../auth.mjs';
import {getGoogleDriveAccessToken} from '../google.mjs';
import {DriveInventoryStore} from '../inventory-store.mjs';
import {PORTAL_MASTER,validateEnvelope,listPortalProjects,readProject,mutatePortal,adminProjection,fail} from '../client-portal.mjs';

const ORIGIN='https://apresentacoes.agoracons.com.br';
const PDF_BLOCK_BYTES=1024*1024;
const PDF_MAX_BYTES=30_000_000;
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
      if(!store&&!/^[A-Za-z0-9_-]{10,}$/.test(String(process.env.CLIENT_PORTAL_DATA_FILE_ID||'').trim()))throw fail('Base do portal não configurada.',503);
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
          const offsetText=url.searchParams.get('offset');
          const offset=offsetText===null?0:/^(0|[1-9]\d*)$/.test(offsetText)?Number(offsetText):NaN;
          if(!Number.isSafeInteger(offset)||offset<0||offset>PDF_MAX_BYTES||offset%PDF_BLOCK_BYTES!==0)throw fail('Bloco do documento inválido.',400);
          const requestedVersion=url.searchParams.get('fileVersion');
          if(offset>0&&(!requestedVersion||requestedVersion.length>100))throw fail('A versão do documento é obrigatória para continuar.',400);
          const token=await tokenProvider();
          const root=`https://www.googleapis.com/drive/v3/files/${doc.fileId}`;
          const metadata=await fetchImpl(`${root}?supportsAllDrives=true&fields=size,mimeType,version`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(25000)});
          if(!metadata.ok)throw fail('Não foi possível consultar o documento.',503);
          const meta=await metadata.json();
          const totalSize=Number(meta.size),fileVersion=String(meta.version||'');
          if(!Number.isSafeInteger(totalSize)||totalSize<=0)throw fail('Tamanho do documento inválido.',503);
          if(totalSize>PDF_MAX_BYTES)throw fail('Documento excede o limite.',413);
          if(meta.mimeType!=='application/pdf'||!fileVersion)throw fail('Metadados do documento inválidos.',503);
          if(offset>=totalSize)throw fail('Bloco do documento fora do intervalo.',416);
          if(offset>0&&requestedVersion!==fileVersion)throw fail('O documento foi alterado. Reinicie a leitura.',409);
          const end=Math.min(offset+PDF_BLOCK_BYTES,totalSize)-1,expectedLength=end-offset+1;
          const response=await fetchImpl(`${root}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`,Range:`bytes=${offset}-${end}`},signal:AbortSignal.timeout(25000)});
          if(response.status!==206)throw fail('O provedor não confirmou o bloco solicitado.',503);
          const contentRange=response.headers.get('content-range')||'';
          const rangeMatch=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
          const contentLength=Number(response.headers.get('content-length'));
          if(!rangeMatch||Number(rangeMatch[1])!==offset||Number(rangeMatch[2])!==end||Number(rangeMatch[3])!==totalSize||contentLength!==expectedLength)throw fail('O bloco recebido não corresponde ao documento.',503);
          const chunks=[];let length=0;
          if(!response.body)throw fail('Bloco do documento vazio.',503);
          for await(const chunk of response.body){length+=chunk.length;if(length>expectedLength)throw fail('Bloco do documento excede o tamanho esperado.',503);chunks.push(chunk);}
          if(length!==expectedLength)throw fail('Bloco do documento incompleto.',503);
          const bytes=Buffer.concat(chunks,expectedLength);
          if(offset===0&&bytes.subarray(0,5).toString()!=='%PDF-')throw fail('Formato do documento inválido.',503);
          const after=await fetchImpl(`${root}?supportsAllDrives=true&fields=size,mimeType,version`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(25000)});
          if(!after.ok)throw fail('Não foi possível confirmar a versão do documento.',503);
          const afterMeta=await after.json();
          if(String(afterMeta.version||'')!==fileVersion||Number(afterMeta.size)!==totalSize||afterMeta.mimeType!=='application/pdf')throw fail('O documento foi alterado durante a leitura. Reinicie a leitura.',409);
          const nextOffset=offset+length,done=nextOffset===totalSize;
          return res.status(200).json({offset,nextOffset,totalSize,mimeType:'application/pdf',fileVersion,dataBase64:bytes.toString('base64'),done});
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

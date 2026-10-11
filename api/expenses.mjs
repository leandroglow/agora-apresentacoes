import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, readJsonBody, setCors } from './_lib/http.mjs';

const folder = () => process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || '1665zvQOtbulPR59zjFLr37mflu9n31Yo';
export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!['GET','POST'].includes(req.method)) return json(res,405,{error:'Método não permitido.'});
  try {
    const token = await getGoogleDriveAccessToken();
    async function call(path, options = {}) {
      const response = await fetch('https://www.googleapis.com/' + path, {...options, headers:{Authorization:`Bearer ${token}`, ...options.headers}, signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error('Drive indisponível ('+response.status+'). Tente novamente.');
      return response;
    }
    async function list(extra) {
      let files=[], page;
      do {
        const params=new URLSearchParams({q:`'${folder()}' in parents and trashed=false and ${extra}`,fields:'nextPageToken,files(id,name)',pageSize:'1000'});
        if(page) params.set('pageToken',page);
        const data=await (await call('drive/v3/files?'+params)).json();
        files.push(...data.files); page=data.nextPageToken;
      } while(page);
      return files;
    }
    async function scopedFile(id) {
      if(!/^[\w-]+$/.test(id)) throw new Error('Arquivo inválido.');
      const file=await (await call(`drive/v3/files/${id}?fields=id,parents,mimeType,trashed`)).json();
      if(file.trashed || !file.parents?.includes(folder())) throw new Error('Arquivo fora da pasta de despesas.');
      return file;
    }
    if(req.method==='GET') {
      const files=await list("mimeType='application/json' and name contains 'agora_despesa_'");
      const records=[];
      for(let i=0;i<files.length;i+=10) records.push(...await Promise.all(files.slice(i,i+10).map(async f=> (await call(`drive/v3/files/${f.id}?alt=media`)).json())));
      return json(res,200,records.filter(d=>Number.isSafeInteger(d.id)).sort((a,b)=>b.id-a.id));
    }
    const body=readJsonBody(req);
    if(body.action==='photo') {
      const file=await scopedFile(String(body.fileId||''));
      if(!/^image\//.test(file.mimeType)) throw new Error('Arquivo não é uma imagem.');
      const data=await (await call(`drive/v3/files/${file.id}?alt=media`)).arrayBuffer();
      return json(res,200,{url:`data:${file.mimeType};base64,${Buffer.from(data).toString('base64')}`});
    }
    const id=Number(body.id || body.record?.id);
    if(!Number.isSafeInteger(id) || id<1) return json(res,400,{error:'Identificador inválido.'});
    const name=`agora_despesa_${id}.json`;
    const files=await list(`name='${name}'`);
    const existing=files[0];
    if(body.action==='delete') {
      if(existing) await call(`drive/v3/files/${existing.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})});
      return json(res,200,{ok:true});
    }
    if(!['save','update'].includes(body.action)) return json(res,400,{error:'Ação inválida.'});
    const previous=existing ? await (await call(`drive/v3/files/${existing.id}?alt=media`)).json() : {};
    if(body.action==='update'&&!existing) return json(res,404,{error:'Despesa não encontrada.'});
    const input={...previous,...body.record};
    if(input.foto_drive_id) await scopedFile(String(input.foto_drive_id));
    const record={id,obra:String(input.obra||'').slice(0,200),data:String(input.data||'').slice(0,10),tipo:String(input.tipo||'outro').slice(0,40),fornecedor:String(input.fornecedor||'').slice(0,500),valor_total:Number(input.valor_total)||0,observacoes:String(input.observacoes||'').slice(0,10000),foto_drive_id:input.foto_drive_id||null,itens:(Array.isArray(input.itens)?input.itens:[]).slice(0,500).map(i=>({descricao:String(i.descricao||'').slice(0,1000),quantidade:Number(i.quantidade)||0,unidade:String(i.unidade||'').slice(0,40),valor_unitario:Number(i.valor_unitario)||0})),criado_em:previous.criado_em||new Date().toISOString(),atualizado_por:user.sub};
    if(!record.obra) return json(res,400,{error:'Selecione a obra.'});
    if(existing) {
      await call(`upload/drive/v3/files/${existing.id}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});
    } else {
      const boundary='agora_expense_record';
      const payload=`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({name,parents:[folder()],mimeType:'application/json'})}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(record)}\r\n--${boundary}--`;
      await call('upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:payload});
    }
    return json(res,200,{ok:true,record});
  } catch(error) {
    return json(res,502,{error:error.code==='DRIVE_AUTH_EXPIRED'?'A conexão central do Drive precisa ser regularizada pelo administrador. Seu login Google não é necessário.':error.message});
  }
}

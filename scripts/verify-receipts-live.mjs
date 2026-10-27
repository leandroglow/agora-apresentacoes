// Explicit deployment check. Runs INSIDE Vercel with its existing credentials;
// never exports environment variables, account data or tokens to the operator.
// A separate temporary Drive folder contains all synthetic files and records.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import jpeg from 'jpeg-js';
import { getGoogleDriveAccessToken } from '../api/_lib/google.mjs';
import { receiptFolder } from '../api/_lib/receipt-files.mjs';
import upload from '../api/upload-receipt.mjs';
import expenses from '../api/expenses.mjs';
import analyze from '../api/analyze-receipt.mjs';
import '../sistema/receipt-transfer.js';

if (process.env.AGORA_VERIFY_RECEIPTS !== '1') {
  throw new Error('Explicit AGORA_VERIFY_RECEIPTS=1 is required.');
}
const origin = 'https://apresentacoes.agoracons.com.br';
const accessToken = await getGoogleDriveAccessToken();
async function drive(path, options={}) {
  const response = await fetch('https://www.googleapis.com/'+path, {
    ...options, headers: {Authorization:'Bearer '+accessToken,...options.headers}, signal:AbortSignal.timeout(30000)
  });
  if(!response.ok) throw new Error('Synthetic Drive check failed: HTTP '+response.status);
  return response;
}
const marker='AGORA_TESTE_TECNICO_'+Date.now();
const temp=await (await drive('drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:marker,mimeType:'application/vnd.google-apps.folder',parents:[receiptFolder()]})})).json();
let clean=false;
try {
  // Scope test handlers exclusively to the temporary folder. This modifies only
  // this build process, never the deployment's persisted environment or users.
  process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID=temp.id;
  const keys=generateKeyPairSync('rsa',{modulusLength:2048});
  process.env.CLERK_JWT_KEY=keys.publicKey.export({type:'spki',format:'pem'});
  process.env.CLERK_PUBLISHABLE_KEY='pk_live_Y2xlcmsuYXByZXNlbnRhY29lcy5hZ29yYWNvbnMuY29tLmJyJA';
  const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const now=Math.floor(Date.now()/1000);
  const input=enc({alg:'RS256',typ:'JWT'})+'.'+enc({sub:'user_3Jvm8LQLtHINAqVtQhagyoDC6nT',sid:'sess_buildcheck',iss:'https://clerk.apresentacoes.agoracons.com.br',azp:origin,iat:now,nbf:now-1,exp:now+600});
  const jwt=input+'.'+sign('RSA-SHA256',Buffer.from(input),keys.privateKey).toString('base64url');
  async function call(handler,body,method='POST') {
    const result={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;},end(){return this;}};
    await handler({method,url:'/api/test',headers:{origin,authorization:'Bearer '+jwt},body},result);
    if(result.code!==200) throw new Error('Synthetic handler check failed: HTTP '+result.code+' '+String(result.body?.error||'').slice(0,150));
    return result.body;
  }
  const width=2048,height=1536,pixels=randomBytes(width*height*4);
  for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
  const original=jpeg.encode({data:pixels,width,height},95).data;
  assert.ok(original.length>4_500_000,'Synthetic original must reproduce old payload limit');
  const photo=new File([original],marker+'.jpg',{type:'image/jpeg'});
  let corsChecked=false,rangeChecked=false;
  const receipt=await globalThis.AgoraReceiptTransfer.upload(photo,{
    state:{},init:info=>call(upload,{action:'init',...info}),
    fetcher:async(url,options)=>{
      if(!corsChecked){
        const preflight=await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type,content-range'},signal:AbortSignal.timeout(30000)});
        assert.ok(preflight.ok,'Google upload preflight');
        assert.ok(['*',origin].includes(preflight.headers.get('access-control-allow-origin')),'Google upload origin');
        assert.match(preflight.headers.get('access-control-allow-headers')||'',/content-range|\*/i);
        corsChecked=true;
      }
      const response=await fetch(url,{...options,headers:{...options.headers,Origin:origin}});
      assert.ok(['*',origin].includes(response.headers.get('access-control-allow-origin')),'Google chunk origin');
      if(response.status===308){assert.match(response.headers.get('access-control-expose-headers')||'',/range|\*/i);rangeChecked=true;}
      return response;
    }
  });
  assert.ok(corsChecked&&rangeChecked);
  const meta=await(await drive(`drive/v3/files/${receipt.id}?fields=md5Checksum,size`)).json();
  assert.equal(meta.md5Checksum,createHash('md5').update(original).digest('hex'));
  assert.equal(Number(meta.size),original.length);
  const url=await globalThis.AgoraReceiptTransfer.readPhoto(body=>call(expenses,body),receipt.id);
  try { assert.equal(createHash('sha256').update(Buffer.from(await(await fetch(url)).arrayBuffer())).digest('hex'),createHash('sha256').update(original).digest('hex')); }
  finally {URL.revokeObjectURL(url);}
  const id=Date.now();
  const record={id,obra:'TESTE TÉCNICO — NÃO É OBRA',fornecedor:marker,valor_total:0,data:new Date().toISOString().slice(0,10),tipo:'outro',foto_drive_id:receipt.id,itens:[],observacoes:'Validação sintética isolada, removida após teste.'};
  await call(expenses,{action:'save',record});
  await call(expenses,{action:'save',record});
  const history=await call(expenses,undefined,'GET');
  assert.equal(history.length,1,'Retry must not duplicate expense');
  assert.equal(history[0].foto_drive_id,receipt.id);
  // Small valid image verifies reference-based AI path without sending noise.
  const small=new File([jpeg.encode({data:Buffer.from([255,255,255,255]),width:1,height:1},90).data],'synthetic-white.jpg',{type:'image/jpeg'});
  const smallReceipt=await globalThis.AgoraReceiptTransfer.upload(small,{state:{},init:info=>call(upload,{action:'init',...info})});
  const ai=await call(analyze,{fileId:smallReceipt.id,messages:[{role:'user',content:[{type:'text',text:'Teste técnico: responda somente OK. Não há uma despesa real nesta imagem.'}]}],max_tokens:20});
  assert.ok(ai.choices?.length,'AI reference path');
  await call(expenses,{action:'delete',id});
  assert.equal((await call(expenses,undefined,'GET')).length,0);
  console.log('RECEIPT_LIVE_CHECK: original >4.5MB, Google CORS, byte hash, chunked history, save/retry and AI reference PASS.');
} finally {
  // Recoverable cleanup of this exact temporary folder and all its contents.
  await drive(`drive/v3/files/${temp.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})});
  const result=await(await drive(`drive/v3/files/${temp.id}?fields=trashed`)).json();
  clean=result.trashed===true;
  assert.ok(clean,'Synthetic folder cleanup');
  console.log('RECEIPT_LIVE_CHECK: temporary folder moved to trash; no real expense changed.');
}

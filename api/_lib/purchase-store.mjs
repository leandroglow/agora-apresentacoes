import { DriveInventoryStore } from './inventory-store.mjs';
import { getGoogleDriveAccessToken } from './google.mjs';
import { PurchaseError, PHOTO_MAX, DRIVE_ID, digest } from './purchase-requests.mjs';

// Private Drive references, not credentials. Both live under Compras / Solicitações do Sistema.
export const PURCHASE_DATA_ID='1_lfmNckyq-Hz6BkXgbl7YtVjAaC5Voa0';
export const PURCHASE_FOLDER_ID='17tu5AjmKmVkl63GT0qZioDXuJqfpWVZ0';
export class DrivePurchaseStore extends DriveInventoryStore {
  constructor({fileId=process.env.PURCHASE_DATA_FILE_ID||PURCHASE_DATA_ID,folderId=process.env.PURCHASE_FOLDER_ID||PURCHASE_FOLDER_ID,tokenProvider=getGoogleDriveAccessToken,fetchImpl=fetch}={}) {
    super({fileId,tokenProvider,fetchImpl});this.folderId=folderId;
    if(!DRIVE_ID.test(folderId))throw new PurchaseError('Armazenamento de compras indisponível.',503);
  }
  async request(path,options={}) {
    const token=await this.tokenProvider();
    const res=await this.fetch(`https://www.googleapis.com/${path}`,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(25000)});
    if(!res.ok)throw new PurchaseError('Não foi possível acessar o arquivo no Drive.',res.status===404?404:503,'drive_unavailable');
    return res;
  }
  async upload({requestId,userId,name,mimeType,bytes}) {
    const hash=digest(bytes.toString('base64'));
    const q=`'${this.folderId}' in parents and trashed=false and appProperties has { key='purchaseHash' and value='${hash}' } and appProperties has { key='purchaseOwner' and value='${userId}' } and appProperties has { key='purchaseRequest' and value='${requestId}' }`;
    const list=await(await this.request(`drive/v3/files?${new URLSearchParams({q,fields:'files(id,name,mimeType,size)',pageSize:'10'})}`)).json();
    if(list.files?.length)return {...list.files[0],size:Number(list.files[0].size)};
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mimeType];
    const clean=String(name||'foto').replace(/\.[^.]*$/,'').normalize('NFKD').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,60);
    const metadata={name:`SC-${requestId.slice(0,8)}-${clean}-${hash.slice(0,8)}.${ext}`,mimeType,parents:[this.folderId],appProperties:{purchaseRequest:requestId,purchaseOwner:userId,purchaseHash:hash,purchasePhoto:'1'}};
    const boundary=`agora_${hash.slice(0,24)}`;
    const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--`)]);
    const result=await(await this.request('upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body})).json();
    return {id:result.id,name:result.name,mimeType:result.mimeType,size:Number(result.size)};
  }
  async photoMetadata(id,requestId,owner) {
    if(!DRIVE_ID.test(id))throw new PurchaseError('Foto inválida.');
    const p=await(await this.request(`drive/v3/files/${id}?fields=id,name,mimeType,size,parents,appProperties,trashed`)).json();
    if(p.trashed||!p.parents?.includes(this.folderId)||p.appProperties?.purchaseRequest!==requestId||p.appProperties?.purchaseOwner!==owner||p.appProperties?.purchasePhoto!=='1'||!['image/jpeg','image/png','image/webp'].includes(p.mimeType)||Number(p.size)>PHOTO_MAX)throw new PurchaseError('Foto não pertence a esta solicitação.',403,'photo_denied');
    return {id:p.id,name:p.name,mimeType:p.mimeType,size:Number(p.size)};
  }
  async photo(id,requestId,owner) {
    const meta=await this.photoMetadata(id,requestId,owner);
    const response=await this.request(`drive/v3/files/${id}?alt=media`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>PHOTO_MAX||bytes.length!==meta.size)throw new PurchaseError('Foto alterada ou indisponível.',409);
    return {...meta,bytes};
  }
}

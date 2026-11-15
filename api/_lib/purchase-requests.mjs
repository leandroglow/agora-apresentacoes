import { createHash } from 'node:crypto';

export const MASTER_ID = 'user_3Jvm8LQLtHINAqVtQhagyoDC6nT';
export const PROJECTS = [
  { code:'008', name:'Evidências K21' }, { code:'013', name:'Casa do Lago AC20' },
  { code:'016', name:'Smart City Salto G13' }, { code:'017', name:'Galpão Q33 L25' },
  { code:'019', name:'Helvetia Park 2 B11' }
];
export const STATUSES = ['requested','quoting','ordered','received','cancelled'];
export const PHOTO_MAX = 900 * 1024;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const DRIVE_ID = /^[A-Za-z0-9_-]{10,120}$/;
export class PurchaseError extends Error {
  constructor(message,status=400,code='invalid_request') {super(message);this.status=status;this.code=code;}
}
export const plain = v => v && typeof v === 'object' && !Array.isArray(v);
export const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : plain(v) ? `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
export const digest = v => createHash('sha256').update(stable(v)).digest('hex');
export const recordTag = r => `"${digest(r)}"`;
function str(v,max,label,empty=true) {
  if(v==null && empty)return '';
  if(typeof v!=='string'||v.length>max||(!empty&&!v.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw new PurchaseError(`${label} inválido ou muito longo.`);
  return v.trim();
}
export function itemsOf(items) {
  if(!Array.isArray(items)||items.length>80)throw new PurchaseError('Use até 80 itens por solicitação.');
  return items.map(i=> {
    if(!plain(i))throw new PurchaseError('Item inválido.');
    const quantity=str(i.quantity,40,'Quantidade'),notes=str(i.notes,1000,'Observação do item');
    return {description:str(i.description,300,'Descrição',false),quantity,unit:str(i.unit,30,'Unidade'),notes:quantity?notes.replace(/(^|\s)Quantidade não informada\.(?=\s|$)/g,' ').trim():notes};
  });
}
export function destinationOf(v) {
  if(!plain(v)||!['unassigned','stock','general','project'].includes(v.kind))throw new PurchaseError('Destino inválido.');
  if(v.kind==='project'&&!PROJECTS.some(p=>p.code===v.projectCode))throw new PurchaseError('Selecione um projeto da lista.');
  return {kind:v.kind,projectCode:v.kind==='project'?v.projectCode:''};
}
export function fieldsOf(r) {
  if(!plain(r))throw new PurchaseError('Solicitação inválida.');
  const neededBy=str(r.neededBy,10,'Data');
  if(neededBy&&(!/^\d{4}-\d{2}-\d{2}$/.test(neededBy)||Number.isNaN(Date.parse(neededBy))||new Date(neededBy).toISOString().slice(0,10)!==neededBy))throw new PurchaseError('Data desejada inválida.');
  if(!['normal','urgent'].includes(r.priority))throw new PurchaseError('Prioridade inválida.');
  return {title:str(r.title,140,'Título'),rawText:str(r.rawText,8000,'Texto'),destination:destinationOf(r.destination),priority:r.priority,neededBy,items:itemsOf(r.items||[]),notes:str(r.notes,1000,'Observação')};
}
export function photosOf(value) {
  if(!Array.isArray(value)||value.length>6)throw new PurchaseError('Anexe até seis fotos.');
  const seen=new Set();
  return value.map(p=> {
    if(!plain(p)||!DRIVE_ID.test(p.id)||seen.has(p.id))throw new PurchaseError('Referência de foto inválida.');
    seen.add(p.id); return {id:p.id}; // Names, type and size come from Drive, never the browser.
  });
}
export function createRecord(input,session,photos,now=new Date().toISOString()) {
  if(!UUID.test(input?.id||''))throw new PurchaseError('Identificador inválido.');
  const fields=fieldsOf(input);
  if(!fields.rawText&&!fields.items.length&&!photos.length)throw new PurchaseError('Escreva o pedido ou anexe uma foto.');
  const title=fields.title||fields.items[0]?.description.slice(0,140)||fields.rawText.split('\n')[0].slice(0,140)||'Solicitação com fotos';
  return {id:input.id,...fields,title,originalRawText:fields.rawText,photos,status:'requested',createdAt:now,updatedAt:now,createdBy:session.sub,createdByLabel:session.sub===MASTER_ID?'Master':'William',history:[{at:now,actor:session.sub,action:'created',status:'requested'}]};
}
export function changeRecord(prior,changes,session,etag,now=new Date().toISOString()) {
  if(etag!==recordTag(prior))throw new PurchaseError('Esta solicitação mudou. Reabra os dados antes de salvar.',409,'revision_conflict');
  const master=session.sub===MASTER_ID;
  if(!master&&(prior.createdBy!==session.sub||!['requested','quoting'].includes(prior.status)))throw new PurchaseError('Você só pode editar suas solicitações ainda abertas.',403,'edit_denied');
  if(!plain(changes)||Object.keys(changes).some(k=>!['title','rawText','destination','priority','neededBy','items','notes','status'].includes(k)))throw new PurchaseError('Alteração inválida.');
  if(Object.hasOwn(changes,'status')&&(!master||!STATUSES.includes(changes.status)))throw new PurchaseError('Somente o Master pode alterar o andamento.',403,'manage_denied');
  if(prior.history.length>=500)throw new PurchaseError('O histórico deste pedido atingiu o limite de alterações.',409);
  const merged={...prior,...changes};const fields=fieldsOf(merged);
  if(!fields.rawText&&!fields.items.length&&!prior.photos.length)throw new PurchaseError('A solicitação não pode ficar vazia.');
  return {...prior,...fields,status:merged.status,updatedAt:now,history:[...prior.history,{at:now,actor:session.sub,action:'updated',fields:Object.keys(changes),from:prior.status,status:merged.status}]};
}
export function decodePhoto(v) {
  if(!plain(v)||!['image/jpeg','image/png','image/webp'].includes(v.mimeType)||typeof v.fileBase64!=='string'||v.fileBase64.length>1_230_000)throw new PurchaseError('Use fotos JPEG, PNG ou WebP de até 900 KB.',413);
  const base64=v.fileBase64.replace(/^data:image\/(jpeg|png|webp);base64,/,'');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new PurchaseError('Foto inválida.');
  const bytes=Buffer.from(base64,'base64');
  if(!bytes.length||bytes.length>PHOTO_MAX||bytes.toString('base64')!==base64)throw new PurchaseError('Foto inválida ou maior que 900 KB.',413);
  const actual=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':'';
  if(actual!==v.mimeType)throw new PurchaseError('O conteúdo da foto não corresponde ao formato.');
  return {bytes,mimeType:actual};
}

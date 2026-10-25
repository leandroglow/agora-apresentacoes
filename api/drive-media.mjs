import { requireAuth } from './_lib/auth.mjs';
import { setCors } from './_lib/http.mjs';
import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { CatalogDrive } from './_lib/drive.mjs';
export default async function handler(req,res){setCors(req,res);if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='GET')return res.status(405).end();try{if(!await requireAuth(req,res))return;const id=String(req.query?.id||'');if(!/^[\w-]+$/.test(id))return res.status(400).end('invalid_id');const d=new CatalogDrive({token:await getGoogleDriveAccessToken()}),f=await d.meta(id);await d.authorized(id);const data=await d.bytes(f);res.setHeader('Content-Type',f.mimeType||'application/octet-stream');res.setHeader('Cache-Control','private,max-age=300');return res.status(200).send(Buffer.from(data));}catch(e){return res.status(e.status||502).end(e.message||'drive_media_failed');}}

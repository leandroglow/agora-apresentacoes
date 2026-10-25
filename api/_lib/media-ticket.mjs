import {createHmac,timingSafeEqual} from 'node:crypto';
import {isSystemUser} from './system-access.mjs';
function sign(body){const key=process.env.GOOGLE_OAUTH_CLIENT_SECRET;if(!key)throw new Error('Media signing unavailable');return createHmac('sha256',key).update('agora-media-v1:'+body).digest('base64url');}
export function issueTicket(id,user){const body=Buffer.from(JSON.stringify({id,sub:user,exp:Date.now()+2*60*60*1000})).toString('base64url');return body+'.'+sign(body);}
export function verifyTicket(ticket,id){try{const [body,sig]=ticket.split('.');const expected=Buffer.from(sign(body)),actual=Buffer.from(sig||'');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;const p=JSON.parse(Buffer.from(body,'base64url'));return p.id===id&&p.exp>Date.now()&&isSystemUser(p.sub);}catch{return false;}}
export function mediaRange(header,size){
 const match=/^bytes=(\d*)-(\d*)$/.exec(header||'bytes=0-');if(!match||(!match[1]&&!match[2]))return null;
 let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));let end=match[1]&&match[2]?Number(match[2]):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return null;
 return {start,end:Math.min(end,size-1,start+2*1024*1024-1)};
}

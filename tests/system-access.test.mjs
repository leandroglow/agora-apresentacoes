import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { requireAuth } from '../api/_lib/auth.mjs';
import { issueTicket, verifyTicket } from '../api/_lib/media-ticket.mjs';
import { isSystemUser } from '../api/_lib/system-access.mjs';
import access from '../api/_lib/routes/access.mjs';
import expenses from '../api/expenses.mjs';
import files from '../api/project-files.mjs';
import file from '../api/project-file.mjs';
import driveFiles from '../api/drive-files.mjs';
import driveMedia from '../api/drive-media.mjs';
import rh from '../api/rh.mjs';
import config from '../api/_lib/routes/system-config.mjs';

const MASTER='user_3Jvm8LQLtHINAqVtQhagyoDC6nT';
const WILIAM='user_3JvmAhiGPCh3w3nDMB3pPJOyIN9';
const LAERTE='user_3LBngIH74tca1nDUYD6dz69AbAS';
const origin='https://apresentacoes.agoracons.com.br';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
process.env.CLERK_JWT_KEY=publicKey.export({type:'spki',format:'pem'});
process.env.CLERK_PUBLISHABLE_KEY='pk_live_Y2xlcmsuYXByZXNlbnRhY29lcy5hZ29yYWNvbnMuY29tLmJyJA';
delete process.env.CLERK_SECRET_KEY;
process.env.GOOGLE_OAUTH_CLIENT_SECRET='ephemeral-local-test-only';
function token(sub,extra={}){const now=Math.floor(Date.now()/1000);const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const input=enc({alg:'RS256',typ:'JWT'})+'.'+enc({sub,sid:'sess_test',iss:'https://clerk.apresentacoes.agoracons.com.br',azp:origin,iat:now,nbf:now-5,exp:now+60,...extra});return input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');}
function req(sub=LAERTE,url='/api/access'){return{method:'GET',url,query:{},headers:{origin,authorization:'Bearer '+token(sub)}};}
function res(){return{headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;},end(b){this.body=b;return this;},send(b){this.body=b;return this;}};}
test('only exact internal identity IDs are allowed',()=>{assert.ok(isSystemUser(MASTER));assert.ok(isSystemUser(WILIAM));for(const id of[LAERTE,'user_future','master','wiliam',null,{},''])assert.equal(isSystemUser(id),false);});
test('valid client Clerk session receives 403, not system authorization',async()=>{const r=res();assert.equal(await requireAuth(req(),r),null);assert.equal(r.code,403);assert.equal(r.body.code,'SYSTEM_ACCESS_DENIED');});
test('changing username or organization claims cannot grant system access',async()=>{const r=res(),q=req();q.headers.authorization='Bearer '+token(LAERTE,{username:'master',org_role:'org:admin',o:{rol:'admin'}});assert.equal(await requireAuth(q,r),null);assert.equal(r.code,403);});
test('Master and Wiliam retain backend access',async()=>{for(const id of[MASTER,WILIAM])assert.deepEqual(await requireAuth(req(id),res()),{sub:id});});
test('anonymous requests remain 401 and foreign origins are refused',async()=>{for(const headers of[{origin},{origin:'https://evil.example',authorization:'Bearer '+token(MASTER)}]){const r=res();assert.equal(await requireAuth({...req(),headers},r),null);assert.equal(r.code,401);}});
test('access route rejects client and accepts both staff users',async()=>{for(const id of[LAERTE,MASTER,WILIAM]){const r=res();await access(req(id),r);assert.equal(r.code,id===LAERTE?403:200);assert.equal(r.body.allowed,id===LAERTE?undefined:true);}});
test('company data endpoints reject Laerte before any external request',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw Error('External request must not happen');};try{for(const handler of[expenses,files,file,driveFiles,driveMedia,rh,config]){const r=res();await handler(req(LAERTE,'/api/project-file?id=123456789012345'),r);assert.equal(r.code,403,handler.name);assert.equal(r.body.code,'SYSTEM_ACCESS_DENIED');}assert.equal(calls,0);}finally{globalThis.fetch=original;}});
test('previously issued client video tickets are also denied',()=>{assert.equal(verifyTicket(issueTicket('123456789012345',LAERTE),'123456789012345'),false);assert.equal(verifyTicket(issueTicket('123456789012345',MASTER),'123456789012345'),true);assert.equal(verifyTicket(issueTicket('123456789012345',WILIAM),'other-file'),false);});

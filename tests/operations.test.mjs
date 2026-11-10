import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import handler from '../api/_lib/routes/operations.mjs';
import {checkAvailability,summarizeExpenses} from '../api/_lib/operations.mjs';
import {sanitizeDashboardData} from '../api/_lib/routes/dashboard.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
process.env.CLERK_JWT_KEY=publicKey.export({type:'spki',format:'pem'});
process.env.CLERK_PUBLISHABLE_KEY='pk_live_Y2xlcmsuYXByZXNlbnRhY29lcy5hZ29yYWNvbnMuY29tLmJyJA';
const origin='https://apresentacoes.agoracons.com.br';
const token=sub=>{const n=Math.floor(Date.now()/1000),b=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),input=b({alg:'RS256',typ:'JWT'})+'.'+b({sub,sid:'sess_test',iss:'https://clerk.apresentacoes.agoracons.com.br',azp:origin,iat:n,nbf:n-5,exp:n+60});return input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')};
test('operations denies anonymous, client and staff before network; only Master has this overview',async()=>{
 let calls=0;const prior=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('must not call')};
 try{for(const [sub,expected] of [[null,401],['user_3LBngIH74tca1nDUYD6dz69AbAS',403],['user_3JvmAhiGPCh3w3nDMB3pPJOyIN9',403]]){const res={setHeader(){},status(c){this.code=c;return this},json(b){this.body=b},end(){}};await handler({method:'GET',headers:{origin,...(sub?{authorization:'Bearer '+token(sub)}:{})}},res);assert.equal(res.code,expected)}assert.equal(calls,0)}finally{globalThis.fetch=prior}
});
test('service probe validates content and handles one outage independently',async()=>{
 const result=await checkAvailability(async url=>{if(url.includes('quadros'))throw Error('offline');return {ok:true,status:200,text:async()=>url.includes('auth/providers')?'{}':'<html>SISTEMA ÁGORA</html>'}});
 assert.deepEqual(result.map(x=>x.status),['ok','unavailable','attention']);assert.ok(!JSON.stringify(result).includes('offline'));
});
test('received expense is pending; review blocked is not counted as reconciled',()=>{
 const out=summarizeExpenses([{id:1,obra:'019',valor_total:15},{id:2,acompanhamento_documental:{etapas:{conferido:{concluida:true}},bloqueio:{ativo:true,motivo:'Falta vínculo'}}},{id:3,acompanhamento_documental:{etapas:{conferido:{concluida:true}}}}]);
 assert.equal(out.total,3);assert.equal(out.pending,2);assert.equal(out.reviewed,1);assert.equal(out.blocked,1);assert.equal(out.items[0].id,2);assert.match(out.coverage,/não representa/);
});
test('workday view drops unapproved fields and URLs; preserves evidence and next action',()=>{
 const out=sanitizeDashboardData({workday:{meta:{asOf:'2026-11-09',coverage:'017 e 019',queueUpdatedAt:'2026-11-09'},items:[{id:'a',waitingFor:'conferencia',nextAction:'Conferir documento',priority:'P1',source:'Controle',sourceUrl:'https://drive.google.com/file/d/123/view',secret:'never'},{id:'b',sourceUrl:'https://evil.example'}]}});
 assert.equal(out.workday.items[0].nextAction,'Conferir documento');assert.equal(out.workday.items[0].secret,undefined);assert.equal(out.workday.items[1].sourceUrl,undefined);assert.equal(out.workday.meta.coverage,'017 e 019');
});

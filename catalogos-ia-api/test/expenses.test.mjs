import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import handler from '../api/expenses.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
process.env.CLERK_JWT_KEY=publicKey.export({type:'spki',format:'pem'});
process.env.GOOGLE_DRIVE_OAUTH_ACCESS_TOKEN='test-only';
process.env.CLERK_PUBLISHABLE_KEY='pk_live_Y2xlcmsuYXByZXNlbnRhY29lcy5hZ29yYWNvbnMuY29tLmJyJA';
const origin='https://apresentacoes.agoracons.com.br';
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const input=encode({alg:'RS256',typ:'JWT'})+'.'+encode({sub:'user_test',sid:'sess_test',iss:'https://clerk.apresentacoes.agoracons.com.br',azp:origin,iat:now,nbf:now-5,exp:now+600,v:2});
const jwt=input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
async function request(body,authorized=true){const res={setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}};await handler({method:body?'POST':'GET',url:'/api/expenses',headers:{origin,...(authorized?{authorization:'Bearer '+jwt}:{})},body},res);return res;}
test('Clerk-only Drive persistence, history, update, folder isolation and failure handling',async()=>{
 const old=global.fetch;let saved;global.fetch=async(url,options={})=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/files') && options.method==='POST'){saved=JSON.parse(options.body.split('Content-Type: application/json\r\n\r\n')[2].split('\r\n--')[0]);return Response.json({id:'record'});}
  if(u.pathname.endsWith('/files'))return Response.json({files:saved?[{id:'record',name:'agora_despesa_123.json'}]:[]});
  if(u.pathname.endsWith('/outside'))return Response.json({id:'outside',parents:['different'],mimeType:'image/jpeg'});
  if(options.method==='PATCH'){saved=JSON.parse(options.body);return Response.json({id:'record'});}
  return Response.json(saved);
 };
 try{
  assert.equal((await request(null,false)).code,401);
  assert.equal((await request({action:'save',record:{id:123,obra:'Gastos gerais',valor_total:10,itens:[]}})).code,200);
  assert.equal((await request()).body[0].valor_total,10);
  assert.equal((await request({action:'update',id:123,record:{valor_total:20}})).code,200);
  assert.equal((await request()).body[0].valor_total,20);
  assert.equal((await request({action:'photo',fileId:'outside'})).code,502);
  global.fetch=async()=>new Response('unavailable',{status:503});
  assert.equal((await request({action:'save',record:{id:456,obra:'Teste'}})).code,502);
 }finally{global.fetch=old;}
});


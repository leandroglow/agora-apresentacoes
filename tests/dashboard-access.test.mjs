import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDashboardData } from '../api/_lib/routes/dashboard.mjs';
import dashboard from '../api/_lib/routes/dashboard.mjs';
import { generateKeyPairSync, sign } from 'node:crypto';
const MASTER='user_3Jvm8LQLtHINAqVtQhagyoDC6nT', WILIAM='user_3JvmAhiGPCh3w3nDMB3pPJOyIN9', LAERTE='user_3LBngIH74tca1nDUYD6dz69AbAS', origin='https://apresentacoes.agoracons.com.br';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}); process.env.CLERK_JWT_KEY=publicKey.export({type:'spki',format:'pem'}); process.env.CLERK_PUBLISHABLE_KEY='pk_live_Y2xlcmsuYXByZXNlbnRhY29lcy5hZ29yYWNvbnMuY29tLmJyJA'; process.env.GOOGLE_OAUTH_REFRESH_TOKEN='x'; process.env.GOOGLE_OAUTH_CLIENT_ID='x'; process.env.GOOGLE_OAUTH_CLIENT_SECRET='x'; process.env.DASHBOARD_DATA_FILE_ID='123456789012';
const token=(sub,extra={})=>{const n=Math.floor(Date.now()/1000),e=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),i=e({alg:'RS256',typ:'JWT'})+'.'+e({sub,sid:'sess_test',iss:'https://clerk.apresentacoes.agoracons.com.br',azp:origin,iat:n,nbf:n-5,exp:n+60,...extra});return i+'.'+sign('RSA-SHA256',Buffer.from(i),privateKey).toString('base64url')};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(b){this.body=b;return this},end(){return this}});
const call=async(sub,headers={origin,authorization:'Bearer '+token(sub)})=>{const r=response();await dashboard({method:'GET',url:'/api/dashboard',headers},r);return r};

test('dashboard signed authorization matrix and no Drive before auth', async () => {
  let calls = 0; const old = globalThis.fetch;
  globalThis.fetch = async (url) => { calls++; if (String(url).includes('oauth2')) return {ok:true,json:async()=>({access_token:'t'})}; return {ok:true,json:async()=>({projects:[],modules:[],decisions:[],automation:[],financial:{status:null,committed:null,invoiced:null,paid:null},meta:{},user:{}})}; };
  try { assert.equal((await call(MASTER)).code,200); assert.equal((await call(WILIAM)).code,403); assert.equal((await call(LAERTE)).code,403); assert.equal((await call(MASTER,{origin,authorization:'Bearer '+token(MASTER,{exp:0})})).code,401); assert.equal((await call(MASTER,{origin:'https://evil.example',authorization:'Bearer '+token(MASTER)})).code,401); assert.equal((await call(MASTER,{origin})).code,401); assert.ok(calls>0); calls=0; assert.equal((await call(LAERTE,{origin,authorization:'Bearer '+token(LAERTE)})).code,403); assert.equal(calls,0); } finally { globalThis.fetch = old; }
});

test('dashboard sanitizer preserves nulls and only approved links', () => {
  const out = sanitizeDashboardData({ financial: { committed: null, paid: 12 }, agenda: [{ title: 'x', link: 'https://evil.example/x', url: 'https://drive.google.com/file/d/a/view' }], projects: [{ subtitle: 'ok', url: 'javascript:alert(1)', thumbUrl: 'https://docs.google.com/a' , secret: 'drop' }] });
  assert.equal(out.financial.committed, null); assert.equal(out.financial.invoiced, undefined); assert.equal(out.projects[0].url, undefined); assert.equal(out.projects[0].secret, undefined); assert.match(out.projects[0].thumbUrl, /^https:\/\/docs\.google\.com/); assert.equal(out.agenda[0].link, undefined);
});

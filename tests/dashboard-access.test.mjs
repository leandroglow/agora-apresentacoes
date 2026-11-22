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

test('individual Pix requires Master, reads the configured RH file and returns only the requested worker',async t=>{
  const sourceId='rh_test_source_0001', ledgerId='rh_test_ledger_0001';
  const workers=['alpha','beta'].map((id,i)=>({id,name:id,pix:{type:'celular',key:String(i+1).padStart(11,'0'),payee:id}}));
  const counts=[];
  t.mock.method(globalThis,'fetch',async url=>{
    const path=String(url);
    counts.push(path);
    const values=path.includes('oauth2')?{access_token:'test',expires_in:3600}:
      path.includes(process.env.DASHBOARD_DATA_FILE_ID)?{rhForecast:{rhForecastFileId:sourceId}}:
      path.includes(sourceId)?{groups:[{people:workers}],adjustmentsFileId:ledgerId}:
      path.includes(ledgerId)?{compensacoes:[],adiantamentos:[],ocorrencias:[]}:undefined;
    assert.ok(values,'only configured files are read');
    return {ok:true,json:async()=>values};
  });
  async function copy(sub,body,contentType='application/json') {
    const res=response(), headers={origin,'content-type':contentType};
    if(sub) headers.authorization='Bearer '+token(sub);
    await dashboard({method:'POST',url:'/api/dashboard',body,headers},res);
    assert.match(res.headers['Cache-Control'],/no-store/);
    return res;
  }
  const body={action:'copy-pix',personId:'alpha'};
  for (const [user,code] of [[null,401],[WILIAM,403],[LAERTE,403]]) assert.equal((await copy(user,body)).code,code);
  for (const invalid of [{...body,personId:['alpha','beta']},{...body,fileId:'arbitrary'},{}]) assert.equal((await copy(MASTER,invalid)).code,400);
  assert.equal((await copy(MASTER,body,'text/plain')).code,415);
  assert.equal(counts.length,0);
  const only=await copy(MASTER,body);
  assert.equal(only.code,200);
  assert.deepEqual(only.body,{personId:'alpha',pix:workers[0].pix});
  assert.equal(JSON.stringify(only.body).includes(workers[1].pix.key),false);
  assert.equal(counts.some(url=>url.includes(ledgerId)),false);
  assert.equal((await copy(MASTER,{...body,personId:'missing'})).code,404);
  const normal=await call(MASTER);
  assert.equal(normal.code,200);
  for(const worker of workers) assert.equal(JSON.stringify(normal.body).includes(worker.pix.key),false);
  workers.push({...workers[0]});
  assert.equal((await copy(MASTER,body)).code,409);
});

test('dashboard sanitizer preserves nulls and only approved links', () => {
  const out = sanitizeDashboardData({ financial: { committed: null, paid: 12 }, agenda: [{ title: 'x', link: 'https://evil.example/x', url: 'https://drive.google.com/file/d/a/view' }], projects: [{ subtitle: 'ok', url: 'javascript:alert(1)', thumbUrl: 'https://docs.google.com/a' , secret: 'drop' }] });
  assert.equal(out.financial.committed, null); assert.equal(out.financial.invoiced, null); assert.equal(out.projects[0].url, undefined); assert.equal(out.projects[0].secret, undefined); assert.match(out.projects[0].thumbUrl, /^https:\/\/docs\.google\.com/); assert.equal(out.agenda[0].link, undefined);
});

test('nested fields and project links never pass unvalidated objects', () => {
 const out=sanitizeDashboardData({projects:[{id:'019',links:[{label:'Pasta',url:'https://drive.google.com/drive/folders/x'},{label:'bad',url:'javascript:x'}],name:{password:'drop'}}],modules:[{items:[{title:'ok',items:[{items:[{secret:'drop'}],secret:'drop'}]}]}]});
 assert.equal(out.projects[0].links.length,1);assert.equal(out.projects[0].links[0].label,'Pasta');assert.equal(out.projects[0].name,undefined);assert.ok(!JSON.stringify(out).includes('drop'));assert.equal(sanitizeDashboardData({}).financial.paid,null);
});

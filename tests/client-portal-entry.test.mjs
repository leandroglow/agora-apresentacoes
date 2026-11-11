import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../cliente/portal.js',import.meta.url),'utf8');
function implementation(name){
  const pattern=new RegExp(`^  (?:async )?function ${name}\\(`,'m');
  const start=source.search(pattern);assert.ok(start>=0,name);
  const rest=source.slice(start);const next=rest.slice(1).search(/^  (?:async )?function \w+\(/m);
  return next<0?rest:rest.slice(0,next+1);
}
const project=id=>({id,name:`Projeto ${id}`,published:false});
function harness({role='master',projects=[project('019')],session='master-session',readAdmin}={}){
  const state={sessionId:session,request:0,controller:null,clerk:{session:{id:session},user:{fullName:'Conta de teste'}},role:null,projects:[],currentTab:'resumo'};
  const fields=new Map();const calls=[];const views=[];const gates=[];
  const context={state,API:'https://example.test/api/client-portal',AbortController,URL,URLSearchParams,location:{href:'https://example.test/cliente/?gestao=1'},obj:x=>x&&typeof x==='object',idSafe:x=>/^[a-zA-Z0-9_-]+$/.test(x),$:key=>{if(!fields.has(key))fields.set(key,{});return fields.get(key)},current:(rid,sid)=>rid===state.request&&sid===state.sessionId&&sid===state.clerk.session?.id,gate:(...args)=>gates.push(args),api:async(url)=>{calls.push(url);return {json:{role,projects}}},loadAdmin:async()=>{if(readAdmin)await readAdmin();state.admin={projects,clients:[]}},showProjectChooser:()=>{state.project=null;state.projectId=null;state.currentTab='portais';views.push('chooser')},loadProject:async(id,options)=>{calls.push({id,options});state.projectId=id;state.project=project(id);state.currentTab='resumo'},setTab:tab=>{state.currentTab=tab},mountSignIn:()=>views.push('signin'),unmountSignIn:()=>{},clearSensitive:()=>{state.request++;state.role=null;state.projects=[];state.project=null;state.projectId=null;state.admin=null;state.asUserId=null;state.currentTab='resumo';state.loading=false}};
  vm.createContext(context);
  vm.runInContext(`${implementation('loadProjects')}\n${implementation('sessionChanged')}\nthis.run=loadProjects;this.sessionChanged=sessionChanged;`,context);
  const open=context.loadProject;context.loadProject=async(...args)=>{state.request++;return open(...args)};
  return {state,calls,views,gates,context,load:()=>context.run(state.sessionId),session:force=>context.sessionChanged(force)};
}

test('Master with one project must choose before any project data is fetched',async()=>{
  const h=harness();await h.load();assert.equal(h.state.role,'master');assert.equal(h.state.projectId,null);assert.equal(h.state.currentTab,'portais');assert.deepEqual(h.views,['chooser']);assert.equal(h.calls.filter(x=>typeof x==='object').length,0);
});
test('Master sees all registered drafts without an automatic first-project selection',async()=>{
  const h=harness({projects:[project('008'),project('019'),project('017')]});await h.load();assert.deepEqual(h.state.projects.map(p=>p.id),['008','019','017']);assert.equal(h.state.project,null);assert.deepEqual(h.views,['chooser']);
});
test('a client with one authorized project opens it directly without preview privileges',async()=>{
  const h=harness({role:'client',projects:[project('008')]});await h.load();assert.equal(h.state.projectId,'008');assert.equal(h.state.admin,null);assert.deepEqual(h.views,[]);assert.equal(h.calls[1].options.preview,false);
});
test('a client with multiple projects chooses only from the authorized response',async()=>{
  const h=harness({role:'client',projects:[project('008'),project('013')]});await h.load();assert.deepEqual(h.state.projects.map(p=>p.id),['008','013']);assert.deepEqual(h.views,['chooser']);assert.equal(h.state.admin,null);
});
test('a client without access cannot enter the directory or fetch a project',async()=>{
  const h=harness({role:'client',projects:[]});await h.load();assert.deepEqual(h.views,[]);assert.equal(h.state.projectId,null);assert.equal(h.gates.at(-1)[1].title,'Acesso ao portal');assert.equal(h.calls.length,1);
});
test('Master with no projects gets an empty directory rather than a broken project',async()=>{
  const h=harness({projects:[]});await h.load();assert.deepEqual(h.views,['chooser']);assert.equal(h.state.projectId,null);
});
test('same-session revalidation preserves the selected project, tab and asUser restrictions',async()=>{
  const h=harness();Object.assign(h.state,{role:'master',projectId:'019',project:project('019'),currentTab:'budget',asUserId:'user_testclient'});await h.session(true);const opened=h.calls.find(x=>typeof x==='object');assert.equal(opened.id,'019');assert.equal(opened.options.asUserId,'user_testclient');assert.equal(h.state.currentTab,'budget');
});
test('a new client session discards the previous Master selection and asUser',async()=>{
  const h=harness({role:'client',projects:[project('008')]});Object.assign(h.state,{role:'master',projectId:'019',project:project('019'),currentTab:'budget',asUserId:'user_other'});h.state.clerk.session.id='client-session';await h.session(true);const opened=h.calls.find(x=>typeof x==='object');assert.equal(opened.id,'008');assert.equal(opened.options.preview,false);assert.equal(opened.options.asUserId,undefined);assert.equal(h.state.admin,null);
});
test('a revoked client selection is not restored after revalidation',async()=>{
  const h=harness({role:'client',projects:[]});Object.assign(h.state,{role:'client',projectId:'019',project:project('019'),currentTab:'budget'});await h.session(true);assert.equal(h.state.project,null);assert.equal(h.calls.filter(x=>typeof x==='object').length,0);assert.equal(h.gates.at(-1)[1].request,true);
});
test('the same session stays on the directory when refreshed',async()=>{
  const h=harness();Object.assign(h.state,{role:'master',currentTab:'portais'});await h.session(true);assert.equal(h.state.project,null);assert.deepEqual(h.views,['chooser']);
});
test('a late admin response cannot replace a newer navigation',async()=>{
  let release;const pending=new Promise(r=>release=r);const h=harness({readAdmin:()=>pending});const run=h.load();await new Promise(r=>setImmediate(r));h.state.request++;release();await run;assert.equal(h.state.project,null);assert.equal(h.views.length,0);
});
test('normal Clerk updates do not reopen the directory while it is already selected',async()=>{
  const h=harness();Object.assign(h.state,{role:'master',currentTab:'portais'});await h.session(false);assert.equal(h.calls.length,0);
});

test('an outdated admin response does not replace the latest revision or ETag',async()=>{
  let release;const pending=new Promise(r=>release=r);const h=harness();
  h.context.api=async()=>{await pending;return {json:{projects:[],clients:[],requests:[],audit:[],revision:1,etag:'old'},response:{headers:new Headers()}}};
  vm.runInContext(`${implementation('loadAdmin')}\nthis.readAdmin=loadAdmin;`,h.context);
  const read=h.context.readAdmin(h.state.sessionId,h.state.request);
  h.state.request++;Object.assign(h.state,{admin:{revision:2},revision:2,etag:'new'});release();await read;
  assert.equal(h.state.admin.revision,2);assert.equal(h.state.revision,2);assert.equal(h.state.etag,'new');
});

test('a failed restricted preview is never replaced by unrestricted Master access',async()=>{
  const h=harness();Object.assign(h.state,{role:'master',projectId:'019',project:project('019'),currentTab:'budget',asUserId:'user_revoked'});
  h.context.loadProject=async(id,options)=>{h.calls.push({id,options});h.state.request++;h.state.projectId=id;h.state.project=null};
  await h.session(true);const opens=h.calls.filter(x=>typeof x==='object');assert.equal(opens.length,1);assert.equal(opens[0].options.asUserId,'user_revoked');assert.equal(h.state.project,null);
});

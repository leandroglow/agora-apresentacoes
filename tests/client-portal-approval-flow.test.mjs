import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../cliente/portal.js',import.meta.url),'utf8');
function implementation(name){const start=source.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,name);const rest=source.slice(start);const next=rest.slice(1).search(/^  (?:async )?function \w+\(/m);return next<0?rest:rest.slice(0,next+1)}
function harness({published=false,confirm=true,projects}={}){
  const project={id:'019',name:'Obra Clevis',published,modules:['budget','documents']};projects||=[project];
  const state={sessionId:'session',session:{id:'session'},role:'master',admin:{revision:1,projects,clients:[],requests:[{userId:'user_clevis019',displayName:'Clevis 019'}]},etag:'"r1"'};
  const fields=new Map(),calls=[],statuses=[];
  const values={'#access-user':{value:'user_clevis019'},'#access-user-id':{value:'user_clevis019'},'#access-project':{value:'019'},'#client-display-name':{value:'Clevis 019'},'#access-modules':{querySelectorAll:()=>[{value:'budget',checked:true},{value:'documents',checked:false},{value:'payments',checked:false},{value:'progress',checked:false}]},'#publication-modules':{querySelectorAll:()=>[{value:'budget',checked:true},{value:'documents',checked:true}]},'#release-access':{disabled:false}};
  const context={state,API:'https://example.test/api',MODULES:[['budget','Orçamentos'],['payments','Pagamentos'],['progress','Andamento'],['documents','Documentos']],list:x=>Array.isArray(x)?x:[],$:s=>values[s]||(values[s]={value:'',checked:false}),selectedUser:()=>values['#access-user'].value,selectedChecks:el=>Array.from(el.querySelectorAll()).filter(x=>x.checked).map(x=>x.value),idSafe:x=>/^[a-zA-Z0-9_-]{1,100}$/.test(x),setStatus:(...x)=>statuses.push(x),window:{confirm:()=>confirm},api:async(url,{body})=>{calls.push(structuredClone(body));const p=state.admin.projects.find(x=>x.id===body.projectId);if(body.action==='set-publication')p.published=body.published;if(body.action==='set-access')state.admin.clients.push({userId:body.userId,grant:{active:body.active,modules:body.modules}});},refreshAdmin:async()=>true};
  context.state=sessionState(context.state);vm.createContext(context);
  vm.runInContext(`${implementation('postMutation')}\n${implementation('onReleaseAccess')}\nthis.run=onReleaseAccess;`,context);
  return {context,state,calls,statuses,run:()=>context.run({preventDefault(){}})};
}
function sessionState(state){state.admin.clients=[];return state}

test('selecting a request and explicitly releasing publishes first, grants active selected modules, and keeps client portal singular',async()=>{
  const h=harness();await h.run();assert.deepEqual(h.calls.map(x=>x.action),['set-publication','set-access']);assert.equal(h.calls[1].active,true);assert.deepEqual(h.calls[1].modules,['budget']);assert.equal(h.calls[0].published,true);assert.deepEqual(h.calls[0].modules,['budget','documents']);assert.equal(h.state.admin.projects[0].published,true);assert.deepEqual(h.state.admin.clients[0].grant,{active:true,modules:['budget']});
  const clientProjects=h.state.admin.clients[0].grant.active?[h.state.admin.projects[0].id]:[];assert.deepEqual(clientProjects,['019']);
});
test('an unpublished project failure stops before granting access',async()=>{
  const h=harness();h.context.api=async(url,{body})=>{h.calls.push(body);throw Error('publication failed')};await h.run();assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'set-publication');assert.equal(h.calls.some(x=>x.action==='set-access'),false);
});
test('publication uses selected access project modules even when publication selector belongs to another project',async()=>{
  const a={id:'019',name:'Obra A',published:false,modules:['budget','documents']},b={id:'008',name:'Obra B',published:false,modules:['payments']};
  const h=harness({projects:[a,b]});h.context.$('#access-project').value='019';h.context.$('#publication-project').value='008';h.context.$('#publication-modules').querySelectorAll=()=>[{value:'payments',checked:true}];await h.run();
  assert.equal(h.calls[0].projectId,'019');assert.deepEqual(h.calls[0].modules,['budget','documents']);assert.equal(h.calls[0].modules.includes('payments'),false);
});
test('release rejects areas unavailable for selected project',async()=>{
  const h=harness();h.context.$('#access-modules').querySelectorAll=()=>[{value:'payments',checked:true}];await h.run();assert.equal(h.calls.length,0);assert.match(h.statuses.at(-1)[0],/não estão disponíveis/);
});

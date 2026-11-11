import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {URL as NodeURL} from 'node:url';

const source=await readFile(new URL('../cliente/portal.js',import.meta.url),'utf8');
function implementation(name){
  const start=source.search(new RegExp(`^  (?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,`missing ${name}`);
  const rest=source.slice(start),next=rest.slice(1).search(/^  (?:async )?function \w+\(/m);
  return next<0?rest:rest.slice(0,next+1);
}
class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.attrs={};this.dataset={};this.style={setProperty:(key,value)=>{this.style[key]=value}};this.hidden=false;this.value='';this.className='';this.textContent='';this.classList={add:(...names)=>{this.className=[this.className,...names].filter(Boolean).join(' ')}}}
  append(...items){this.children.push(...items)}
  replaceChildren(...items){this.children=[...items]}
  setAttribute(key,value){this.attrs[key]=String(value)}
}
function flatten(el){return [el.textContent||'',...el.children.flatMap(flatten)].join(' ')}
function baseContext({role='master',preview=true,asUserId=null,internalCosts}={}){
  const state={role,preview,asUserId,project:{id:'019',name:'Projeto 019',code:'019',modules:['budget'],internalCosts},projects:[{id:'019',name:'Projeto 019'}],currentTab:'costs',costsQuery:'',sessionId:'session-1'};
  const fields=new Map([['#nav',new Element('nav')],['#crumb-title',new Element('strong')],['#project-content',new Element()],['#admin-panel',new Element()]]);
  const context={state,MODULES:[['budget','Orçamentos'],['payments','Pagamentos'],['progress','Andamento'],['documents','Documentos']],document:{createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag)},$:selector=>fields.get(selector)||new Element(),list:x=>Array.isArray(x)?x:[],obj:x=>x&&typeof x==='object'&&!Array.isArray(x),clearNode:el=>el?.replaceChildren(),idSafe:x=>/^[a-zA-Z0-9_-]{1,100}$/.test(String(x||'')),cents:x=>Number.isSafeInteger(x)&&x>=0?x:null,money:x=>Number.isSafeInteger(x)?`R$ ${(x/100).toFixed(2)}`:'',moneyOrPending:x=>Number.isSafeInteger(x)?`R$ ${(x/100).toFixed(2)}`:'A conferir',coverageLabel:x=>x==='complete'?'Conciliação completa':x==='partial'?'Conciliação parcial':'Conciliação não confirmada',date:x=>x||'',renderHero:()=>new Element('header'),metricCard:(label,value,note)=>{const e=new Element('article');e.append(Object.assign(new Element('span'),{textContent:label}),Object.assign(new Element('strong'),{textContent:value}),Object.assign(new Element('small'),{textContent:note}));return e},makeCard:(title,description)=>{const e=new Element('section');e.className='surface-card';e.append(Object.assign(new Element('h2'),{textContent:title}),Object.assign(new Element('p'),{textContent:description}));return e},empty:message=>Object.assign(new Element(),{className:'empty-state',textContent:message}),URL:NodeURL,location:{href:'https://example.test/cliente/'},history:{replaceState(){}},navItems:()=>state.project?state.project.modules.map(id=>[id,id,'x']):[],closeMenu(){},renderContent(){},showProjectChooser(){},$focus(){return {focus(){}}}};
  context.$=selector=>selector==='#main'?{focus(){}}:fields.get(selector)||new Element();
  vm.createContext(context);
  return {context,state,fields};
}
const sampleCosts=overrides=>({asOf:'2026-11-10',coverage:'partial',source:{title:'Controle de custos',format:'planilha',updatedAt:'2026-11-10'},totals:{costCents:125000,paidCents:null},categories:[{name:'Materiais',costCents:125000},{name:'Serviços',costCents:null}],items:[{id:'i1',date:'2026-11-01',category:'Materiais',supplier:'Fornecedor Alfa',description:'Compra de material',costCents:125000,paidCents:null,status:'A conferir',sourceLabel:'Documento 12'}],documents:{total:3,reviewed:2,pending:1,duplicateCopies:0},note:'Há documentos pendentes.',...overrides});

test('Custos internos appear in Master navigation only for unrestricted project preview',()=>{
  const h=baseContext({internalCosts:sampleCosts()});
  vm.runInContext([implementation('canViewInternalCosts'),implementation('navItems'),implementation('renderNav')].join('\n'),h.context);
  h.context.renderNav();assert.equal(h.fields.get('#nav').children.some(x=>x.dataset.tab==='costs'),true);
  for(const config of [{role:'client',preview:false,asUserId:null},{role:'master',preview:true,asUserId:'user_client'},{role:'master',preview:false,asUserId:null}]){
    const denied=baseContext({...config,internalCosts:sampleCosts()});vm.runInContext([implementation('canViewInternalCosts'),implementation('navItems'),implementation('renderNav')].join('\n'),denied.context);denied.context.renderNav();
    assert.equal(denied.fields.get('#nav').children.some(x=>x.dataset.tab==='costs'),false);
  }
  assert.deepEqual(Array.from(h.context.MODULES,x=>x[0]),['budget','payments','progress','documents']);
});

test('direct costs hash is rejected for a client and reset to an allowed module',()=>{
  const h=baseContext({role:'client',preview:false,internalCosts:sampleCosts()});h.state.role='client';h.state.preview=false;
  h.context.firstProjectTab=project=>project.modules[0];
  vm.runInContext(implementation('canViewInternalCosts')+'\n'+implementation('setTab'),h.context);
  h.context.setTab('costs');assert.equal(h.state.currentTab,'budget');
});

test('Master costs UI keeps nullable totals pending and labels partial source coverage',()=>{
  const h=baseContext({internalCosts:sampleCosts({totals:{costCents:null,paidCents:null}})});
  vm.runInContext([implementation('canViewInternalCosts'),implementation('categoryBarModel'),implementation('internalCostsSection')].join('\n'),h.context);
  const view=h.context.internalCostsSection();const text=flatten(view);
  assert.match(text,/Custos internos/);assert.match(text,/Conciliação parcial/);assert.match(text,/Subtotal conhecido · conferência parcial/);assert.match(text,/A conferir/);assert.doesNotMatch(text,/R\$ 0\.00/);
  assert.match(text,/pendentes/);assert.match(text,/cópias duplicadas/);assert.doesNotMatch(text,/Saldo/);
});

test('client cannot render the internal-cost payload even if a caller requests its view directly',()=>{
  const h=baseContext({role:'client',preview:false,internalCosts:sampleCosts()});vm.runInContext(implementation('canViewInternalCosts')+'\n'+implementation('internalCostsSection'),h.context);
  const text=flatten(h.context.internalCostsSection());assert.match(text,/somente na prévia Master irrestrita/);assert.doesNotMatch(text,/Fornecedor Alfa|1250/);
});

test('Master opens costs by default only when an unrestricted preview has no visible budgets',()=>{
  const h=baseContext();vm.runInContext([implementation('firstProjectTab'),implementation('hasAuthorizedBudgetItems'),implementation('defaultProjectTab')].join('\n'),h.context);
  const project={modules:['budget'],budgets:[],internalCosts:sampleCosts()};
  assert.equal(h.context.defaultProjectTab(project,'master',true,null),'costs');
  assert.equal(h.context.defaultProjectTab({...project,budgets:[{id:'empty-version',nodes:[]}]},'master',true,null),'costs');
  assert.equal(h.context.defaultProjectTab({...project,modules:[],budgets:[]},'master',true,null),'costs');
  assert.equal(h.context.defaultProjectTab(project,'master',true,'user_client'),'budget');
  assert.equal(h.context.defaultProjectTab(project,'client',false,null),'budget');
  assert.equal(h.context.defaultProjectTab({...project,budgets:[{id:'b1',nodes:[{id:'item-1'}]}]},'master',true,null),'budget');
  assert.equal(h.context.defaultProjectTab({...project,budgets:[{id:'b1',nodes:[]}]},'client',false,null),'budget');
});

test('cost table search filters supplier and description without exposing rows for other queries',()=>{
  const h=baseContext({internalCosts:sampleCosts()});h.state.costsQuery='fornecedor alfa';
  vm.runInContext([implementation('canViewInternalCosts'),implementation('categoryBarModel'),implementation('internalCostsSection')].join('\n'),h.context);
  const view=h.context.internalCostsSection();let text=flatten(view);assert.match(text,/Fornecedor Alfa/);assert.match(text,/Compra de material/);
  h.state.costsQuery='sem correspondência';text=flatten(h.context.internalCostsSection());assert.match(text,/Nenhum custo corresponde à pesquisa/);assert.doesNotMatch(text,/Fornecedor Alfa/);
});

test('signed refunds and negative cost adjustments render as bars left of zero',()=>{
  const h=baseContext();vm.runInNewContext(implementation('categoryBarModel'),h.context);
  const model=h.context.categoryBarModel([{costCents:200},{costCents:-50},{costCents:null}]);
  assert.deepEqual(JSON.parse(JSON.stringify(model)),[{left:20,width:80,zero:20,kind:'positive'},{left:0,width:20,zero:20,kind:'negative'},null]);
  vm.runInNewContext(implementation('moneyOrPending'),h.context);assert.equal(h.context.moneyOrPending(-550),'R$ -5.50');
});

test('unknown event fields stay explicit and do not create numeric bars',()=>{
  const costs=sampleCosts({categories:[{name:'Evento não classificado',costCents:null}],items:[{id:'unknown-1',category:null,supplier:null,description:null,costCents:null,paidCents:null,status:null,sourceLabel:null}]});
  const h=baseContext({internalCosts:costs});vm.runInContext([implementation('canViewInternalCosts'),implementation('categoryBarModel'),implementation('internalCostsSection')].join('\n'),h.context);
  const view=h.context.internalCostsSection();const text=flatten(view);
  assert.match(text,/Evento não classificado/);assert.match(text,/A conferir/);assert.match(text,/—/);assert.doesNotMatch(text,/R\$ 0\.00/);
  const model=h.context.categoryBarModel(costs.categories);assert.deepEqual(Array.from(model),[null]);
});

test('missing cost summary values never render as zero; partial coverage remains explicit in portal cards',()=>{
  const h=baseContext();vm.runInContext(implementation('moneyOrPending')+'\n'+implementation('coverageLabel')+'\n'+implementation('internalCostSummaryCard'),h.context);
  const card=h.context.internalCostSummaryCard({coverage:'partial',costCents:null,paidCents:null,pendingDocuments:null});const text=flatten(card);
  assert.match(text,/Conciliação parcial/);assert.equal((text.match(/A conferir/g)||[]).length,2);assert.doesNotMatch(text,/R\$ 0\.00|Documentos pendentes: 0/);
});

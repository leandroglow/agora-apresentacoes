import test from 'node:test';
import assert from 'node:assert/strict';
import {periodBounds,normalizeWorkday,consolidateFinancial} from '../api/_lib/dashboard-consolidation.mjs';
import {loadWorkday,sanitizeDashboardData} from '../api/_lib/routes/dashboard.mjs';
import {renderFinancial} from '../dashboard/finance-view.js';
const now=new Date('2026-11-15T15:00:00Z');
const bill=(id,status='unconfirmed',amount=10,dueDate='2026-11-16')=>({id,projectId:'019',title:'Fornecedor',dueDate,amount,status,asOf:'2026-11-14',source:'controle',sourceUrl:'https://drive.google.com/file/d/example/view'});
test('periods use Sao Paulo with inclusive calendar week boundaries',()=>{
 assert.deepEqual(periodBounds('next7days',now),['2026-11-15','2026-11-21']);
 assert.deepEqual(periodBounds('currentWeek',now),['2026-11-09','2026-11-15']);
 assert.deepEqual(periodBounds('nextWeek',now),['2026-11-16','2026-11-22']);
 for(let n=16;n<=22;n++)assert.deepEqual(periodBounds('nextWeek',new Date('2026-11-'+n+'T15:00Z')),['2026-11-23','2026-11-29']);
 assert.deepEqual(periodBounds('next7days',new Date('2026-11-16T01:00Z')),['2026-11-15','2026-11-21']);
});
test('live canonical queue merges curated items without exposing history and skips completed',async()=>{
 const raw={workday:{queueFileId:'123456789012',meta:{asOf:'2026-11-09'},items:[{id:'curated',title:'Revisão',asOf:'2026-11-09'}]}};
 const w=await loadWorkday(raw,async()=>({updated_at:'2026-11-15T10:00:00-03:00',tasks:[{id:'open',title:'Aberta',status:'aberta',next_action:'Revisar',history:[{token:'hidden'}],updated_at:'2026-11-14T10:00:00-03:00'},{id:'closed',title:'Fim',status:'concluida'}]}),now);
 const clean=sanitizeDashboardData({workday:w}).workday;
 assert.equal(clean.items.length,2);assert.equal(clean.meta.asOf,'2026-11-09');
 assert.equal(clean.meta.queueUpdatedAt,'2026-11-15T10:00:00-03:00');
 assert.equal(clean.items[1].nextAction,'Revisar');assert.ok(!JSON.stringify(clean).includes('hidden'));
 const failed=await loadWorkday(raw,async()=>{throw Error('offline')},now);
 assert.equal(failed.items.length,1);assert.equal(failed.meta.queueError,true);assert.match(failed.meta.coverage,/indisponível/);
});
test('paid and cancelled excluded; unknown dates/amounts remain visible outside totals',()=>{
 const f=consolidateFinancial({asOf:'2026-11-14',items:[bill('open'),bill('paid','paid'),bill('cancelled','cancelled'),bill('unknown','confirmed',null),bill('date','confirmed',20,'2026-02-30')]},{now});
 assert.equal(f.periods.next7days.unconfirmedTotal,10);assert.equal(f.periods.next7days.confirmedTotal,null);
 assert.equal(f.unknown.length,2);assert.equal(f.asOf,'2026-11-14');assert.equal(f.consultedAt,now.toISOString());
});
test('same event deduplicates; differing payment states/amounts show conflicts',()=>{
 const f=consolidateFinancial({items:[{...bill('a'),eventId:'same'},{...bill('a2'),eventId:'same'},{...bill('b'),eventId:'conflict'},{...bill('b2','paid'),eventId:'conflict'}]},{now});
 assert.equal(f.periods.next7days.items.length,1);assert.deepEqual(f.coverage.conflicts,['conflict']);
});
test('RH forecasts net group amount, never deductive adjustments as separate payables',()=>{
 const rh={asOf:'2026-11-15',groups:[{id:'g',label:'Equipe',anchor:'2026-11-20',people:[{id:'p',name:'Pessoa',dailyLabor:100,dailyCar:0}]}],events:[],adjustments:[{id:'discount',personId:'p',paymentDate:'2026-11-20',amount:250,status:'open',kind:'advance'}]};
 const f=consolidateFinancial({items:[]},{now,rhForecast:rh});
 assert.equal(f.periods.next7days.items.length,0);assert.equal(f.periods.next7days.rhTotal,750);
 assert.equal(f.periods.next7days.rh[0].paymentDate,'2026-11-20');
 const unavailable=consolidateFinancial({items:[]},{now,rhForecast:{error:'offline'}});
 assert.equal(unavailable.periods.next7days.rhTotal,null);assert.equal(unavailable.coverage.rhStatus,'unavailable');
});
test('overdue is review-needed not proof of default; other windows retain future entries',()=>{
 const f=consolidateFinancial({items:[bill('old','unconfirmed',5,'2026-11-13'),bill('sunday','unconfirmed',30,'2026-11-22')]},{now});
 assert.equal(f.overdue.length,1);assert.equal(f.periods.next7days.items.length,0);assert.equal(f.periods.nextWeek.unconfirmedTotal,30);
});
test('financial projection sanitizes sources and HTML while retaining coverage',()=>{
 const f=consolidateFinancial({asOf:'2026-11-14',coverage:{note:'partial',projects:{'019':'Reviewed','secret':'hidden'}},controls:{'019':'javascript:evil'},items:[{...bill('x'),title:'<script>evil()</script>',sourceUrl:'javascript:evil'}]},{now});
 const c=sanitizeDashboardData({financialConsolidated:f}).financialConsolidated;
 assert.equal(c.periods.next7days.items[0].sourceUrl,undefined);assert.equal(c.coverage.projects.secret,undefined);assert.deepEqual(c.controls,{});
 const html=renderFinancial(c);assert.ok(!html.includes('<script>evil'));assert.ok(html.includes('&lt;script&gt;'));
});

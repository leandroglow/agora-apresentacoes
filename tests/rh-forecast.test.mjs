import test from 'node:test';
import assert from 'node:assert/strict';
import {nextFridays,forecast} from '../dashboard/rh-forecast.js';
import {sanitizeDashboardData} from '../api/_lib/routes/dashboard.mjs';
const now=new Date('2026-11-15T16:00:00Z');
const seed=()=>({asOf:'2026-11-15',groups:[{id:'a',label:'Grupo A',anchor:'2026-11-20',people:[{id:'p1',name:'Exemplo A',dailyLabor:100,dailyCar:10}]},{id:'b',label:'Grupo B',anchor:'2026-11-27',people:[{id:'p2',name:'Exemplo B',dailyLabor:200,dailyCar:0}]}],events:[{id:'e1',personId:'p1',date:'2026-11-11',type:'absence',status:'reported',days:1},{id:'e2',personId:'p1',date:'2026-11-15',type:'extra',status:'reported',days:1}],adjustments:[{id:'c1',personId:'p1',paymentDate:'2026-11-20',amount:110,status:'open',kind:'compensation'},{id:'a1',personId:'p1',paymentDate:'2026-11-20',amount:50,status:'planned',kind:'advance'}]});
test('two Fridays include today in Sao Paulo and roll after local midnight',()=>{
 assert.deepEqual(nextFridays(now),['2026-11-20','2026-11-27']);
 assert.deepEqual(nextFridays(new Date('2026-11-21T02:59:00Z')),['2026-11-20','2026-11-27']);
 assert.deepEqual(nextFridays(new Date('2026-11-21T03:00:00Z')),['2026-11-27','2026-12-04']);
 assert.deepEqual(nextFridays(new Date('2026-12-31T16:00:00Z')),['2027-01-01','2027-01-08']);
});
test('deducts financial adjustment once, includes car and extra, excludes planned advance',()=>{
 const f=seed();f.events.push({...f.events[1]});f.adjustments.push({...f.adjustments[0]});
 const c=forecast(f,now)[0],p=c.rows[0];
 assert.equal(p.normalDays,9);assert.equal(p.extraDays,1);assert.equal(p.labor,1000);assert.equal(p.car,100);assert.equal(p.discount,110);assert.equal(c.total,990);assert.equal(p.pending.length,1);
});
test('settled adjustment does not return and future cycle is fresh',()=>{
 const f=seed();f.adjustments[0].status='settled';assert.equal(forecast(f,now)[0].total,1100);
 f.adjustments[0].status='open';const c=forecast(f,new Date('2026-11-28T14:00:00Z'))[0];
 assert.equal(c.paymentDate,'2026-12-04');assert.equal(c.total,1100);assert.equal(c.rows[0].discount,0);assert.equal(c.rows[0].overdue.length,1);assert.ok(c.notices.length);
});
test('missing, invalid and conflicting data do not look like zero payroll',()=>{
 assert.equal(forecast({},now)[0].total,null);
 const f=seed();f.groups[0].people[0].dailyLabor=null;assert.equal(forecast(f,now)[0].total,null);
 const bad=seed();bad.adjustments.push({...bad.adjustments[0],amount:999});assert.equal(forecast(bad,now)[0].status,'Conferir base');
 bad.groups[0].anchor='2026-99-99';assert.equal(forecast(bad,now)[0].total,null);
});
test('calendar warning and source text survive sanitization, unknown private fields do not',()=>{
 const f=seed();f.sourceUrl='javascript:alert(1)';f.calendarNotes=[{date:'2026-11-20',text:'Conferir expediente'}];f.events[0].source='Relato de exemplo';f.groups[0].people[0].cpf='private';f.groups.push(null);f.events.push(null);f.adjustments.push(null);
 const clean=sanitizeDashboardData({rhForecast:f}).rhForecast;
 assert.equal(clean.sourceUrl,undefined);assert.equal(clean.groups[0].people[0].cpf,undefined);assert.equal(clean.events[0].source,'Relato de exemplo');assert.equal(forecast(clean,now)[0].notices[0],'Conferir expediente');assert.equal(forecast(clean,now)[0].total,990);
});
test('unconfirmed absence and weekday extra never deduct or double a base day',()=>{
 const f=seed();f.events[0].status='planned';f.events.push({id:'e3',personId:'p1',date:'2026-11-16',type:'extra',days:1,status:'reported'});
 const p=forecast(f,now)[0].rows[0];assert.equal(p.normalDays,10);assert.equal(p.extraDays,1);
});

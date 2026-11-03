import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import engine from '../api/_lib/inventory-engine.cjs';
const text=`40mm
Joelho 45° - 11
Joelho 90° -7
Joelho 90° com borracha - 5
50mm -
Joelho 45° - 11
Joelho 90° - 5
Luva simples - 9
Anel borracha - 9
75mm
Joelho 45° - 7
Joelho 90° - 3
Luva simples - 11
25mm
Curva longa 90° - 5
Joelho azul com rosca 1/2 - 3
22mm água quente
Conector de transição p/ 3/4 - 4
Misturador - 3`;

test('14 requested lines retain inherited diameter and quantities',()=>{
 const server=engine.parseList(text,engine.createEmpty()); assert.equal(server.rows.length,14);
 assert.deepEqual(server.rows.map(x=>x.quantity),[11,7,5,11,5,9,9,7,3,11,5,3,4,3]);
 assert.equal(server.rows[0].description,'40mm Joelho 45°'); assert.equal(server.rows[12].description,'22mm água quente Conector de transição p/ 3/4');
 assert.equal(server.rows[12].unit,'un');
 const source=fs.readFileSync(new URL('../inventario/engine.js',import.meta.url),'utf8').replace(/\}\)\(typeof window!=='undefined'\?window:globalThis\);?$/,'');
 const browser=vm.runInNewContext(source+'; InventoryEngine');
 assert.deepEqual(Array.from(browser.parseList(text,browser.createEmpty()).rows,x=>x.description),server.rows.map(x=>x.description));
});
test('fraction and explicit units remain in description and noise is ignored',()=>{
 const p=engine.parseList(`25mm
Joelho azul rosca 1/2 - 4
Conexão 25mm
Curva de transição soldável 25mm - 1 un
Contato: mensagens recebidas 16:42
áudio 0:38
22:14
1 saco
ah blz`,engine.createEmpty());
 assert.equal(p.rows.length,2); assert.match(p.rows[0].description,/rosca 1\/2/); assert.equal(p.rows[1].quantity,1); assert.equal(p.rows[1].unit,'un'); assert.equal(p.ignored.length,5);
});
import {createInventoryRecognizeHandler} from '../api/_lib/routes/inventory-recognize.mjs';
const response=()=>({headers:{},status(n){this.code=n;return this;},json(v){this.body=v;return this;},setHeader(k,v){this.headers[k]=v;},end(){}});
test('purchase intent never applies stock and image rows are validated',async()=>{
 let calls=0;const handler=createInventoryRecognizeHandler({authorize:async()=>({sub:'user_test'}),vision:async(input,state,kind)=>{calls++;return{intention:'purchase',items:[{description:'Curva longa 90° 25mm',quantity:6,unit:'un',confidence:.93,itemId:'fabricated-id'},{description:'Joelho 40mm',quantity:-2,unit:'un',confidence:.9}],warnings:[]};}});
 const res=response();await handler({method:'POST',body:{image:'data:image/png;base64,YQ==',items:[{id:'catalog_item',name:'Curva longa 90° 25mm',unit:'un',aliases:[]} ]},headers:{}},res);
 assert.equal(res.code,200);assert.equal(calls,1);assert.equal(res.body.intention,'purchase');assert.equal(res.body.items.length,1);assert.equal(res.body.items[0].itemId,null);assert.equal(res.body.items[0].status,'needs_review');assert.equal(res.body.items[0].candidateName,'Curva longa 90° 25mm');
});
test('unauthorized and invalid catalog/image payloads are rejected before model call',async()=>{
 let calls=0;const handler=createInventoryRecognizeHandler({authorize:async(req,res)=>{res.status(401).json({error:'unauthorized'});return null;},vision:async()=>{calls++;return{};}});
 const res=response();await handler({method:'POST',body:{image:'data:image/png;base64,YQ=='},headers:{}},res);assert.equal(res.code,401);assert.equal(calls,0);
 const invalid=response();const authorized=createInventoryRecognizeHandler({authorize:async()=>({sub:'user_test'}),vision:async()=>{calls++;return{};}});
 await authorized({method:'POST',body:{image:'https://invalid',items:[{id:'bad',name:'Bad',unit:'un',aliases:[]}]},headers:{}},invalid);assert.equal(invalid.code,400);assert.equal(calls,0);
});
test('bitola header does not associate a catalog item without matching diameter',()=>{
 const state=engine.createEmpty();state.items=[{id:'plain-elbow',code:'',name:'Joelho 90°',category:'Hidráulica',unit:'un',aliases:[],photo:''}];
 const parsed=engine.parseList(`40mm
Joelho 90° - 2
50mm
Joelho 90° - 3`,state);
 assert.equal(parsed.rows.length,2);assert.equal(parsed.rows[0].itemId,null);assert.equal(parsed.rows[1].itemId,null);
 assert.equal(parsed.rows[0].description,'40mm Joelho 90°');assert.equal(parsed.rows[1].description,'50mm Joelho 90°');
 const exact=engine.createEmpty();exact.items=[{id:'elbow40',code:'',name:'40mm Joelho 90°',category:'Hidráulica',unit:'un',aliases:[],photo:''}];
 assert.equal(engine.parseList(`40mm
Joelho 90° - 2`,exact).rows[0].itemId,'elbow40');
});
test('purchase and count titles are context, not ignored rows',()=>{
 const parsed=engine.parseList(`Conexão a comprar:
Curva longa 90° 25mm - 2 un
Misturador - 3 un
Lista de compras`,engine.createEmpty());
 assert.equal(parsed.rows.length,2);assert.equal(parsed.ignored.length,0);
});

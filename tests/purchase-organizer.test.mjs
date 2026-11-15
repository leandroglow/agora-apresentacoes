import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrganizer,validateNomenclature,referencesFor} from '../api/_lib/purchase-organizer.mjs';
import {itemsOf} from '../api/_lib/purchase-requests.mjs';
const entry={name:'Joelho 45° — 25 mm — soldável para água fria',aliases:['joelho 45 25mm','25 mm cotovelo 45'],source:'Confirmação do solicitante'};
const result=items=>({choices:[{message:{content:JSON.stringify({items,warnings:[]})}}]});
test('only explicit extraction images reach the organizer; reference and legacy images rejected',async()=>{
 let calls=0;const organize=createOrganizer({catalog:async()=>[],complete:async()=>{calls++;return result([]);}});
 const photo={mimeType:'image/png',fileBase64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')};
 for(const purpose of [undefined,'reference'])await assert.rejects(organize({rawText:'lista',images:[{...photo,purpose}]}),/explicitamente/);
 assert.equal(calls,0);
 await organize({rawText:'',images:[{...photo,purpose:'extract-list'}]});assert.equal(calls,1);
 await assert.rejects(organize({rawText:'lista',images:Array(3).fill({...photo,purpose:'extract-list'})}),/duas fotos/);
});
test('confirmed references included without source financial data; input stays intact',async()=>{
 const input={rawText:'25 mm cotovelo 45',images:[]};let captured;
 const organize=createOrganizer({catalog:async()=>[entry],complete:async p=>{captured=p;return result([{description:'Joelho 45° — 25 mm',quantity:'',unit:'',notes:'Quantidade não informada.'}]);}});
 const out=await organize(input);assert.equal(out.referenceCount,1);assert.equal(input.rawText,'25 mm cotovelo 45');
 const data=JSON.parse(captured.messages[1].content[0].text);assert.equal(data.referenciasConfirmadas[0].name,entry.name);assert.equal(data.referenciasConfirmadas[0].source,undefined);
 assert.equal(out.items[0].quantity,'');assert.equal(out.items[0].description,entry.name);
 assert.equal(referencesFor('Joelho 90 25mm',[entry]).length,0);
});
test('catalog failure is explicit and does not prevent manual-content organization',async()=>{
 const out=await createOrganizer({catalog:async()=>{throw Error('offline')},complete:async()=>result([{description:'Joelho 45° — 25 mm',quantity:'5',notes:'Quantidade não informada. Conferir tipo.'}])})({rawText:'5 joelhos',images:[]});
 assert.match(out.warnings[0],/indisponível/);assert.equal(out.items[0].notes,'Conferir tipo.');
});
test('quantity cleanup only removes known automatic sentence and preserves unknown quantity/notes',()=>{
 assert.equal(itemsOf([{description:'a',quantity:'5',notes:'Quantidade não informada. Confirmar cor.'}])[0].notes,'Confirmar cor.');
 assert.equal(itemsOf([{description:'a',quantity:'5',notes:'Quantidade não informada'}])[0].notes,'');
 assert.equal(itemsOf([{description:'a',quantity:'',notes:'Quantidade não informada.'}])[0].notes,'Quantidade não informada.');
 assert.equal(itemsOf([{description:'a',quantity:'5',notes:'Quantidade não informada pelo fornecedor.'}])[0].notes,'Quantidade não informada pelo fornecedor.');
});
test('curated registry is bounded and requires a source',()=>{
 assert.equal(validateNomenclature({version:1,entries:[entry]}).length,1);
 assert.throws(()=>validateNomenclature({version:1,entries:[{...entry,source:''}]}));
 assert.throws(()=>validateNomenclature({version:1,entries:Array(501).fill(entry)}));
});

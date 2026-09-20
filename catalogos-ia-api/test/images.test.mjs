import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import jpeg from 'jpeg-js';
import { CatalogDrive } from '../api/_lib/drive.mjs';
import { cropBitmap, renderPdfPage, encodeCatalogImage } from '../api/_lib/pdf-images.mjs';
import { runCatalogAgent } from '../api/_lib/agent.mjs';

const ROOT='catalog_root_123', FILE='document_file_123', OUT='outside_file_123';
function samplePdf(){
  const stream='1 0 0 rg 20 20 260 360 re f 0 0 1 rg 320 420 260 360 re f';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << >> /Contents 4 0 R >>',
    '<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'];
  let pdf='%PDF-1.4\n';const offsets=[];
  objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';});
  const xref=Buffer.byteLength(pdf);
  pdf+='xref\n0 5\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
  return Buffer.from(pdf+'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
}
function driveFor(bytes=samplePdf()){
  let downloads=0;
  const drive=new CatalogDrive({rootId:ROOT,token:'fake-unit-test',fetchImpl:async input=>{
    const url=new URL(input),id=url.pathname.split('/').pop();
    if(url.searchParams.get('alt')==='media'){downloads++;return new Response(bytes);}
    return Response.json(id===ROOT?{id:ROOT,name:'Fornecedores',mimeType:'application/vnd.google-apps.folder'}:
      {id,name:'catalogo.pdf',mimeType:'application/pdf',size:bytes.length,parents:id===OUT?[]:[ROOT]});
  }});
  drive.downloads=()=>downloads;return drive;
}
const crop={x:0.5,y:0,width:0.5,height:0.5};

test('renderiza pixels do PDF com cores corretas e recorta sem alterar o conteúdo',async()=>{
  const image=await renderPdfPage(samplePdf(),1);
  assert.equal(image.height,2200);assert.equal(image.pageCount,1);
  const cut=cropBitmap(image,crop);
  const originalOffset=(200*image.width+1000)*4,cutOffset=(200*cut.width+(1000-Math.floor(image.width/2)))*4;
  assert.deepEqual([...cut.data.subarray(cutOffset,cutOffset+4)],[...image.data.subarray(originalOffset,originalOffset+4)]);
  assert.deepEqual([...cut.data.subarray(cutOffset,cutOffset+4)],[0,0,255,255]);
  const encoded=encodeCatalogImage(cut),decoded=jpeg.decode(Buffer.from(encoded.dataUrl.split(',')[1],'base64'));
  assert.equal(decoded.width,cut.width);assert.ok(encoded.dataUrl.length<560100);
});

test('rejeita página inexistente, retângulos inválidos e recortes minúsculos',async()=>{
  await assert.rejects(()=>renderPdfPage(samplePdf(),0),{code:'INVALID_PAGE'});
  await assert.rejects(()=>renderPdfPage(samplePdf(),2),{code:'INVALID_PAGE'});
  const image={width:100,height:100,data:Buffer.alloc(40000)};
  for(const invalid of [{...crop,x:-1},{...crop,width:2},{...crop,y:NaN},{...crop,width:0},{...crop,width:0.01}]){
    assert.throws(()=>cropBitmap(image,invalid),{code:'INVALID_CROP'});
  }
});

test('imagens respeitam pasta autorizada e exigem inspeção entregue em rodada anterior',async()=>{
  const drive=driveFor();
  await assert.rejects(()=>drive.images.inspect(OUT,1),{code:'OUTSIDE_CATALOG'});
  assert.equal(drive.downloads(),0);
  await assert.rejects(()=>drive.images.show(FILE,1,'Produto',crop),{code:'INSPECT_FIRST'});
  const result=await drive.images.inspect(FILE,1);
  await assert.rejects(()=>drive.images.show(FILE,1,'Produto',crop),{code:'INSPECT_FIRST'});
  assert.ok(result.imageDataUrl.startsWith('data:image/jpeg;base64,'));
  drive.images.acknowledgeInspection(FILE,1);
  await drive.images.show(FILE,1,'Produto',crop);
  assert.equal(drive.images.attachments.length,1);
  assert.equal(drive.images.attachments[0].page,1);
  assert.equal(drive.opened.size,1);
  assert.equal(drive.downloads(),1);
  drive.dispose();assert.equal(drive.binary.size,0);assert.equal(drive.images.pages.size,0);
});

test('limites de anexos permanecem válidos com ferramentas paralelas',async()=>{
  const drive=driveFor();await drive.images.inspect(FILE,1);drive.images.acknowledgeInspection(FILE,1);
  const results=await Promise.allSettled(Array.from({length:9},()=>drive.images.show(FILE,1,'Produto',crop)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,6);
  assert.equal(drive.images.attachments.length,6);
  assert.ok(JSON.stringify(drive.images.attachments).length<3000000);
  drive.dispose();
});

test('agente envia imagens tipadas, não trunca base64, e devolve os anexos reais',async()=>{
  const requests=[],drive=driveFor();let round=0;
  const client={responses:{create:async request=>{
    requests.push(structuredClone(request));round++;
    const call=(name,args,id)=>({type:'function_call',name,call_id:id,arguments:JSON.stringify(args)});
    if(round===1)return {id:'r1',output:[call('inspect_catalog_page',{file_id:FILE,page:1},'inspect'),
      call('show_catalog_image',{file_id:FILE,page:1,caption:'Prematuro',crop},'premature')]};
    if(round===2)return {id:'r2',output:[call('show_catalog_image',{file_id:FILE,page:1,caption:'Produto azul',crop},'show')]};
    return {id:'r3',output:[],output_text:'Veja o recorte abaixo.'};
  }}};
  const result=await runCatalogAgent({client,drive,question:'Mostre o produto'});
  const output=requests[1].input.find(x=>x.call_id==='inspect'&&x.type==='function_call_output').output;
  assert.equal(output[0].type,'input_text');assert.equal(output[1].type,'input_image');
  assert.ok(output[1].image_url.length>24000);
  assert.ok(!output[0].text.includes('base64'));
  assert.match(requests[1].input.find(x=>x.call_id==='premature'&&x.type==='function_call_output').output,/INSPECT_FIRST/);
  assert.equal(result.images.length,1);assert.equal(result.images[0].caption,'Produto azul');
  drive.dispose();
});

test('galeria recusa SVG, URLs externas e dimensões inválidas; scripts da página são válidos',()=>{
  const context={URL};vm.runInNewContext(readFileSync(new URL('../../sistema/catalogos-chat.js',import.meta.url),'utf8'),context);
  vm.runInNewContext(readFileSync(new URL('../../sistema/catalogos-images.js',import.meta.url),'utf8'),context);
  const image={dataUrl:'data:image/jpeg;base64,/9j/AAAA',width:100,height:100,page:157,sourceUrl:'https://drive.google.com/file/d/catalog_test_123/view'};
  assert.equal(context.CatalogImages.validImage(image),true);
  for(const change of [{dataUrl:'data:image/svg+xml;base64,AAAA'},{dataUrl:'https://evil.example/x.jpg'},{sourceUrl:'javascript:alert(1)'},{width:100000},{page:0}]){
    assert.ok(!context.CatalogImages.validImage({...image,...change}));
  }
  const html=readFileSync(new URL('../../sistema/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(!/src=|type=.module|application\/ld\+json/.test(match[1]))new vm.Script(match[2]);
  }
  assert.match(html,/limparChatPrivado\(\)/);
  assert.match(html,/data\.images\|\|\[\]/);
});

test('Bomvink real: texto e duas páginas com recortes compartilham um único download de 78 MB',
  {skip:!process.env.CATALOG_FIXTURES_DIR},async()=>{
    const bytes=await readFile(join(process.env.CATALOG_FIXTURES_DIR,'Bomvink','(14-09)BOMVINK-Y.pdf'));
    const drive=driveFor(bytes);
    const [text,first,second]=await Promise.all([drive.read(FILE,'BOM-9914'),
      drive.images.inspect(FILE,157),drive.images.inspect(FILE,158)]);
    assert.match(text.excerpts.join(' '),/9914/);
    assert.equal(first.pageCount,218);assert.equal(second.pageCount,218);
    drive.images.acknowledgeInspection(FILE,157);drive.images.acknowledgeInspection(FILE,158);
    await drive.images.show(FILE,157,'Bomvink BOM-9914 — parafusadeira 12 V',{x:0.345,y:0.085,width:0.315,height:0.31});
    await drive.images.show(FILE,158,'Bomvink BOM-9965 — parafusadeira 12 V',{x:0.345,y:0.385,width:0.315,height:0.305});
    assert.equal(drive.downloads(),1);assert.equal(drive.bytesRead,bytes.length);
    if(process.env.CATALOG_IMAGE_QA_DIR){
      await mkdir(process.env.CATALOG_IMAGE_QA_DIR,{recursive:true});
      for(const image of drive.images.attachments)await writeFile(join(process.env.CATALOG_IMAGE_QA_DIR,image.id+'.jpg'),Buffer.from(image.dataUrl.split(',')[1],'base64'));
      await writeFile(join(process.env.CATALOG_IMAGE_QA_DIR,'images.json'),JSON.stringify(drive.images.attachments));
      await writeFile(join(process.env.CATALOG_IMAGE_QA_DIR,'page-157.jpg'),Buffer.from(first.imageDataUrl.split(',')[1],'base64'));
    }
    drive.dispose();
  });

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CatalogDrive } from '../api/_lib/drive.mjs';

const ROOT='catalog_root_123', FILE='document_file_123';
function documentDrive(name, mimeType, bytes) {
  const file={id:FILE,name,mimeType,size:String(bytes.length),parents:[ROOT]};
  const root={id:ROOT,name:'Fornecedores',mimeType:'application/vnd.google-apps.folder'};
  const drive=new CatalogDrive({token:'test-only',rootId:ROOT,fetchImpl:async input=>{
    const url=new URL(input);
    if(url.searchParams.get('alt')==='media')return new Response(bytes);
    return Response.json(url.pathname.endsWith(ROOT)?root:file);
  }});
  return drive;
}

function smallPdf() {
  const stream='BT /F1 12 Tf 50 750 Td (CATALOGO TESTE PRECOS PRODUTOS) Tj 0 -20 Td (24659 ALICATE UNIVERSAL EMTOP 8 1 UN 24.900) Tj '+ '0 -20 Td (Valores de teste sem validade comercial. Conferir fornecedor.) Tj '.repeat(20)+'ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf='%PDF-1.4\n',offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('extrai PDF com página física e fonte clicável',async()=>{
  const drive=documentDrive('catalogo.pdf','application/pdf',smallPdf());
  const result=await drive.read(FILE,'emtop universal');
  assert.match(result.excerpts.join('\n'),/24659.*24\.900/);
  assert.match(result.header,/Página física 1/);
  assert.ok(!result.header.includes('NaN'));
  assert.equal(drive.opened.size,1);
});

test('extrai XLSX com aba, linhas, cabeçalho e códigos textuais',async()=>{
  const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Preços');
  sheet.addRow(['Código','Descrição','Preço']);sheet.addRow(['0024659','ALICATE UNIVERSAL EMTOP',24.9]);
  const drive=documentDrive('precos.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',Buffer.from(await book.xlsx.writeBuffer()));
  const result=await drive.read(FILE,'universal emtop');
  assert.match(result.excerpts.join('\n'),/0024659.*24\.9/);
  assert.match(result.header,/Preços linha 1.*Código/);
});

test('decodifica tabela Windows-1252 sem perder os acentos',async()=>{
  const drive=documentDrive('precos.txt','text/plain',Buffer.from('Descri\xe7\xe3o\n24659 ALICATE EMTOP 24.900','latin1'));
  const result=await drive.read(FILE,'alicate');assert.match(result.header,/Descrição/);
});

test('PDF real do acervo pode ser extraído sem enviar documento inteiro ao modelo', {skip:!process.env.CATALOG_FIXTURES_DIR},async()=>{
  const bytes=await readFile(join(process.env.CATALOG_FIXTURES_DIR,'Casa do Logista','PROMOCAO 20260914-20260918.pdf'));
  const drive=documentDrive('promocao.pdf','application/pdf',bytes);
  const result=await drive.read(FILE,'');
  assert.ok(result.totalLines>20);
  assert.match(result.header,/Página física 1/);
  assert.ok(JSON.stringify(result).length<15000);
});

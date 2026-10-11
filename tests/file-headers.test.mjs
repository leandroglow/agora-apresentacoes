import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateHeaderValue} from 'node:http';
import {inlineDisposition} from '../api/_lib/file-headers.mjs';

for(const name of ['LUMINA\u0301RIAS - KATIA REV00.pdf','LOUC\u0327AS E METAIS - KATIA REV00.pdf','ELETRODOME\u0301STICOS - KATIA REV00.pdf','ALUMI\u0301NIO - KATIA REV00.pdf','SP-274-2026_RELATO\u0301RIO DE SONDAGEM.pdf','VISTA SUPERIOR - KATIA REV00.pdf','Planta – revisão 📄.pdf']){
 test('Unicode filename: '+name,()=>{const header=inlineDisposition(name);assert.doesNotThrow(()=>validateHeaderValue('Content-Disposition',header));assert.equal(decodeURIComponent(header.split("filename*=UTF-8''")[1]),name.normalize('NFC'));});
}
test('No CRLF or quote injection',()=>{const header=inlineDisposition('a"\\\r\nb.pdf');assert.doesNotThrow(()=>validateHeaderValue('Content-Disposition',header));assert(!header.includes('\r'));assert(!header.includes('\n'));assert(header.startsWith('inline; filename="a____b.pdf"'));});

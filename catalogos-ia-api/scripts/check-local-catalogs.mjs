// Read-only retrieval regression against the user's existing synchronized files.
// Usage: node scripts/check-local-catalogs.mjs <Fornecedores directory>
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { excerpts } from '../api/_lib/retrieval.mjs';
const root=process.argv[2];
if(!root)throw new Error('Informe a pasta Fornecedores.');
for(const [file,query,checks] of [
  ['Casa do Logista/tabtxt.txt','entop alicate universal',[/24659.*24\.900/,/24658.*55\.000/,/24660.*65\.000/]],
  ['Blumenau/Base de consulta 2026.02/categorias/11-spots.md','spot clean',[/clean/i]]
]){
  const bytes=await readFile(path.join(root,file));let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}
  const result=excerpts(text,query),selected=result.excerpts.join('\n');
  for(const check of checks)assert.match(selected,check);
  assert.ok(JSON.stringify(result).length<15000);
  console.log(JSON.stringify({file,query,totalChars:text.length,returnedChars:JSON.stringify(result).length,matches:result.matches,partial:result.truncated,passed:true}));
}

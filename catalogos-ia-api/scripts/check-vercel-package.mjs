// Optional release check using the official Vercel builder installed in the test
// environment. No Vercel login, cloud deployment, or environment secrets needed.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const builderPath=require.resolve(process.env.VERCEL_BUILDER_MODULE || '@vercel/node');
const {build}=require(builderPath);
const {glob}=createRequire(builderPath)('@vercel/build-utils');
const workPath=resolve(process.argv[2] || '.');
const vercel=JSON.parse(await readFile(resolve(workPath,'vercel.json'),'utf8'));

for(const entrypoint of ['api/ask.mjs','api/health.mjs','api/login.mjs','api/transcribe.mjs']){
  const files=await glob('api/**/*.mjs',workPath);
  const result=await build({files,entrypoint,workPath,repoRootPath:workPath,meta:{isDev:true},
    considerBuildCommand:true,config:{zeroConfig:true,...vercel.functions['api/*.mjs'],projectSettings:{installCommand:''}}});
  const packaged=result.output.files;
  const paths=new Set(Object.keys(packaged).map(path=>path.replaceAll('\\','/')));
  // A file/symlink entry must never be the parent of another packaged entry.
  for(const path of paths){
    const parts=path.split('/');
    for(let i=1;i<parts.length;i++){
      const parent=parts.slice(0,i).join('/');
      assert.ok(!paths.has(parent),'Invalid package: '+path+' is nested under '+parent);
    }
  }
  const wasm=[...paths].filter(path=>path.endsWith('/pdfium.wasm'));
  if(['api/ask.mjs','api/health.mjs'].includes(entrypoint))assert.equal(wasm.length,1,'The PDF renderer must be packaged exactly once');
  console.log(entrypoint+': '+paths.size+' entries, no path collisions, '+wasm.length+' PDF renderer asset(s).');
}

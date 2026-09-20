// Isolated browser test. Never opens an existing browser profile or production session.
// Usage: node scripts/check-images-ui.mjs PATH_TO_QA_IMAGES_JSON OUTPUT_DIRECTORY
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const images=JSON.parse(await readFile(process.argv[2],'utf8')),out=resolve(process.argv[3]);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try{
  const context=await browser.newContext({viewport:{width:1180,height:900}});
  await context.route('**/*',route=>route.abort()); // No external traffic or credentials.
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<html lang="pt-BR"><head><meta charset="utf-8"><title>Teste local de recortes</title></head><body><header>ÁGORA <span>CATÁLOGOS IA</span></header><main><h1>Catálogos IA</h1><p class="intro">Consulta com imagens do catálogo original</p><div class="question">Mostre as parafusadeiras Bomvink de 12 volts.</div><article class="chat-bubble"><p>Veja os recortes dos modelos <strong>BOM-9914</strong> e <strong>BOM-9965</strong>, extraídos do catálogo. Confirme as condições e a validade comercial com o fornecedor.</p></article></main></body></html>');
  await page.addStyleTag({content:'*{box-sizing:border-box}body{margin:0;background:#edf1f5;color:#394b5a;font:14px Arial,sans-serif}header{padding:22px;background:#394b5a;color:#fff;border-bottom:3px solid #d58d00;letter-spacing:2px}header span{float:right;font-size:11px}main{max-width:1050px;margin:24px auto;padding:0 18px}h1{font:26px Georgia;margin-bottom:4px}.intro{font-size:12px;color:#627381}.question{margin:26px 0 18px auto;padding:13px 18px;background:#394b5a;color:#fff;border-radius:12px 4px 12px 12px;max-width:500px}.chat-bubble{padding:18px;border-radius:4px 12px 12px 12px;background:white;border:1px solid #d9dfe5;line-height:1.6}.chat-bubble>p{margin:0}'});
  await page.addStyleTag({path:resolve(root,'sistema/catalogos-images.css')});
  await page.addScriptTag({path:resolve(root,'sistema/catalogos-chat.js')});
  await page.addScriptTag({path:resolve(root,'sistema/catalogos-images.js')});
  await page.evaluate(images=>CatalogImages.mount(document.querySelector('article'),images),images);
  assert.equal(await page.locator('.catalog-image-card').count(),2);
  await page.locator('.catalog-image-card img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  await page.screenshot({path:resolve(out,'gallery-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:/Ampliar:/}).first().click();
  assert.equal(await page.locator('dialog[open]').count(),1);
  await page.locator('dialog img').evaluate(img=>img.decode());
  await page.screenshot({path:resolve(out,'gallery-expanded.png'),fullPage:true});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').count(),0);
  assert.equal(await page.locator('.catalog-image-open').first().evaluate(el=>el===document.activeElement),true);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(out,'gallery-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:/Ampliar:/}).first().click();
  await page.getByRole('button',{name:'Fechar ×'}).click();
  assert.equal(await page.locator('dialog').count(),0);
  await page.evaluate(image=>{
    const target=document.createElement('div');target.id='unsafe';document.body.append(target);
    CatalogImages.mount(target,[{...image,caption:'<img src=x onerror=alert(1)>',filename:'<svg onload=alert(1)>'},
      {...image,dataUrl:'data:image/svg+xml;base64,PHN2Zz4='}]);
  },images[0]);
  assert.equal(await page.locator('#unsafe .catalog-image-card').count(),1);
  assert.equal(await page.locator('#unsafe [onerror],#unsafe svg').count(),0);
  assert.match(await page.locator('#unsafe figcaption').textContent(),/<img src=x/);
  await page.evaluate(()=>{CatalogImages.close();document.querySelector('article').replaceChildren();});
  assert.equal(await page.locator('article img').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Galeria desktop/mobile, ampliação, Escape, foco, limpeza e proteção contra HTML: OK');
}finally{await browser.close();}

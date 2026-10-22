// Real-browser PDF regression plus a worker-boundary check for forced safe options.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const types = {'.mjs':'text/javascript','.js':'text/javascript','.pdf':'application/pdf','.html':'text/html','.wasm':'application/wasm','.css':'text/css','.png':'image/png','.webp':'image/webp'};
(async () => {
  const server = http.createServer(async (req,res) => {
    try {
      let relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if (relative.endsWith('/')) relative += 'index.html';
      const file = path.resolve(root, '.' + relative);
      if (!file.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
      const bytes = await fs.readFile(file);
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(bytes);
    } catch {res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
  try {
    const page = await browser.newPage({viewport:{width:1000,height:850}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const insecure=[];page.on('request',r=>{if(/pdf\.js\/3\.|pdfjs-dist@3\./.test(r.url()))insecure.push(r.url());});
    await page.goto(origin+'/helvetia-b11-casa-v2/');
    for (const [key,pages] of [['executivo',40],['apresentacao',50]]) {
      await page.locator(`[data-document="${key}"]`).click();
      await page.locator('#document-status').waitFor({state:'hidden',timeout:90000});
      await page.waitForFunction(()=>document.querySelectorAll('#document-stage canvas').length>0);
      const data=await page.evaluate(async key=>{
        const lib=await loadAgoraPdfJs();
        const url=key==='executivo'?'assets/executivo-rev00.pdf':'assets/apresentacao.pdf';
        const doc=await lib.getDocument({url,isEvalSupported:true}).promise;
        const last=await doc.getPage(doc.numPages);
        const canvas=document.createElement('canvas'),viewport=last.getViewport({scale:.15});
        canvas.width=viewport.width;canvas.height=viewport.height;
        await last.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
        const result={version:lib.version,pages:doc.numPages,lastRendered:canvas.width>0};
        await doc.destroy();return result;
      },key);
      assert.equal(data.version,'6.4.299');assert.equal(data.pages,pages);assert(data.lastRendered);
      await page.locator('#document-plus').click();
      assert.notEqual(await page.locator('#document-zoom').textContent(),'100%');
      await page.locator('#document-fit').click();
      assert.equal(await page.locator('#document-zoom').textContent(),'100%');
      if(key==='executivo')await page.screenshot({path:process.env.PDF_SCREENSHOT||path.join(root,'pdf-security-preview.png')});
      await page.locator('#document-close').click();
      console.log(`PASS real PDF ${key}: ${pages} pages, last page rendered, zoom/reset/close, PDF.js ${data.version}`);
    }
    assert.deepEqual(insecure,[]);assert.deepEqual(errors,[]);
    const guard=await browser.newPage();
    await guard.route('**/legacy/build/pdf.mjs',route=>route.fulfill({contentType:'text/javascript',body:'export const GlobalWorkerOptions={}; export const version="test"; export function getDocument(options){return options;}'}));
    await guard.goto(origin+'/lib/agora-pdf.js');
    await guard.setContent('<script src="/lib/agora-pdf.js"></script>');
    const forced=await guard.evaluate(async()=>{
      const lib=await loadAgoraPdfJs();
      return [lib.getDocument({url:'safe.pdf',isEvalSupported:true}),lib.getDocument('safe.pdf'),lib.getDocument(new Uint8Array([1,2]))].map(o=>o.isEvalSupported);
    });
    assert.deepEqual(forced,[false,false,false]);
    console.log('PASS security: every input type forces isEvalSupported=false, even when caller requests true');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

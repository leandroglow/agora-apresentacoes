const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/leand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.setDefaultTimeout(8000);
  let polls = 0;
  await page.evaluate(() => {
    window.CATALOGOS_IA_API_BASE = 'https://mock.test';
    window.AgoraSistemaAuth = { token: async () => 'auth' };
    window.pdfjsLib = { getDocument: () => ({ destroy(){}, promise: Promise.resolve({ destroy(){}, numPages: 1, getPage: async () => ({ getViewport: ({scale}) => ({ width: 400*scale, height: 300*scale }), render: () => ({ promise: Promise.resolve() }) }) }) }) };
    window.URL.createObjectURL = () => 'blob:mock';
  });
  await page.route('https://mock.test/api/**', async route => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith('/cad-jobs') && route.request().method() === 'GET' && u.searchParams.get('action') === 'folders') {
      await route.fulfill({ json: { folders: [{ id: 'dest', name: 'Destino' }], files: [{ id: 'src', name: 'Projeto.dxf' }] } }); return;
    }
    if(u.searchParams.get('action')==='result'){await route.fulfill({status:206,headers:{'Content-Range':'bytes 0-12/13','Access-Control-Expose-Headers':'Content-Range'},body:Buffer.from('%PDF-1.4 mock')});return;}
    if (u.pathname.endsWith('/cad-jobs') && route.request().method() === 'POST') { await route.fulfill({ json: { job: { id: 'job1', status: 'queued' } } }); return; }
    if (u.pathname.endsWith('/cad-jobs') && u.searchParams.get('id')) { polls++; await route.fulfill({ json: { job: { id: 'job1', status: 'completed', format: 'pdf', outputId: 'out1', outputName: 'Projeto convertido.pdf' } } }); return; }
    if (u.pathname.endsWith('/project-file')) { await route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4 mock') }); return; }
    await route.fulfill({ json: {} });
  });
  await page.setContent('<button id="card-cad">CAD</button>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../../sistema/pdf-viewer.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../../sistema/cad-tools.js'), 'utf8') });
  await page.locator('#card-cad').click();
  await page.locator('[data-source]').click();
  await page.locator('[data-list] button', { hasText: 'Projeto.dxf' }).click();
  await page.locator('summary').click();
  await page.locator('[data-destination]').click();
  await page.locator('[data-list] button', { hasText: 'Destino' }).click();
  await page.locator('[data-select-folder]').click();
  assert.equal(await page.locator('[data-source-name]').textContent(), 'Projeto.dxf');
  assert.equal(await page.locator('[data-destination-name]').textContent(), 'Destino');
  await page.locator('[data-convert]').click();
  await page.waitForTimeout(100);
  assert.equal(polls, 1);
  assert.match(await page.locator('[data-status]').textContent(), /pronto/);
  await page.locator('[data-preview]').click();
  await page.waitForTimeout(100);
  for(let i=0;i<14;i++) await page.locator('[data-plus]').click();
  assert.equal(await page.locator('[data-zoom]').textContent(), '1200%');
  await page.locator('[data-download]').click();
  await page.locator('[data-hide-preview]').click();
  assert.equal(polls,1);
  await page.locator('[data-close]').click();
  await browser.close();
  console.log('cad-tools Playwright flow: OK');
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });


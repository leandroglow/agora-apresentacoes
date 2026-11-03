import test from 'node:test';
import assert from 'node:assert/strict';
import engine from '../api/_lib/inventory-engine.cjs';
import { createInventoryHandler } from '../api/_lib/routes/inventory.mjs';
import { DriveInventoryStore } from '../api/_lib/inventory-store.mjs';

function harness({ authorize = async () => ({ sub: 'user_master' }), initial = null, casConflict = false, omitPutEtag = false } = {}) {
  let current = initial || { version: 1, state: engine.createEmpty(), mutationIds: [], updatedBy: '' };
  let etag = '"rev-0"';
  const store = {
    async get() { return { envelope: structuredClone(current), etag }; },
    async put(value, expected) {
      if (casConflict || expected !== etag) return { conflict: true };
      current = structuredClone(value); etag = `"rev-${current.state.revision}"`;
      return { conflict: false, etag: omitPutEtag ? null : etag, readbackRequired: omitPutEtag };
    }
  };
  const handler = createInventoryHandler({ authorize, store });
  async function call(method, body, headers = {}) {
    const response = { statusCode: 200, headers: {}, body: undefined,
      setHeader(k,v) { this.headers[k.toLowerCase()] = v; },
      status(n) { this.statusCode = n; return this; },
      json(v) { this.body = v; return this; }, end() { return this; } };
    await handler({ method, headers: { origin: 'https://apresentacoes.agoracons.com.br', ...headers }, body }, response);
    return response;
  }
  return { call, store };
}

function addOne(state) {
  return engine.addItem(state, { name: 'Parafuso teste', code: 'TEST-1', unit: 'un', category: 'Fixação', quantity: 6, locationId: 'l017', bin: 'A1' });
}
const mutation = (state, options = {}) => ({ state, baseRevision: options.baseRevision ?? state.revision, etag: options.etag ?? '"rev-0"', mutationId: options.mutationId || 'mutation_0001', action: options.action || 'import' });

test('Master-only handler, origin CORS and no-store', async () => {
  const h = harness({ authorize: async (_req,res) => { res.status(403).json({ error:'denied' }); return null; } });
  const r = await h.call('GET');
  assert.equal(r.statusCode, 403);
  assert.equal(r.headers['access-control-allow-origin'], 'https://apresentacoes.agoracons.com.br');
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('GET provides current state and ETag; stale revision is rejected', async () => {
  const h = harness();
  const get = await h.call('GET');
  assert.equal(get.statusCode, 200);
  assert.equal(get.body.state.mode, 'local');
  assert.equal(get.body.etag, '"rev-0"');
  const save = await h.call('PUT', mutation(addOne(engine.createEmpty()), { baseRevision: 9 }));
  assert.equal(save.statusCode, 409);
});

test('empty inventory state timestamp is stable across GETs', async () => {
  const h = harness();
  const a = await h.call('GET'); const b = await h.call('GET');
  assert.equal(a.body.state.updatedAt, b.body.state.updatedAt);
});

test('import is allowed only while inventory has no items or history', async () => {
  const populated = { version: 1, state: addOne(engine.createEmpty()), mutationIds: [], updatedBy: '' };
  const h = harness({ initial: populated });
  const replacement = engine.addItem(engine.createEmpty(), { name: 'Outro', code: '', unit: 'un', category: '', quantity: 1, locationId: 'l017', bin: '' });
  const r = await h.call('PUT', mutation(replacement, { baseRevision: 1, etag: '"rev-0"', mutationId: 'import_0001' }));
  assert.equal(r.statusCode, 403);
});

test('import preserves drafts from the still-empty inventory', async () => {
  const state = engine.createEmpty();
  state.drafts.push({ id:'draft_0001', text:'2 Joelho teste', source:'clipboard', sourceImage:'', locationId:'l017', bin:'A1', operation:'count', createdAt:'2026-11-02T12:00:00.000Z' });
  const current = engine.validateState(state);
  const h = harness({ initial:{ version:1, state:current, mutationIds:[], updatedBy:'' } });
  const r = await h.call('PUT', mutation(addOne(engine.createEmpty()), { baseRevision:0, action:'import', mutationId:'import_draft01' }));
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.state.drafts.length, 1);
  assert.equal(r.body.state.drafts[0].id, 'draft_0001');
});

test('import rejects history whose first movement invents an opening balance', async () => {
  const crafted = engine.addItem(engine.createEmpty(), { name:'Parafuso', code:'TEST-OPEN', unit:'un', category:'Fixação', quantity:5, locationId:'l017', bin:'A1' });
  crafted.movements[0].type = 'count';
  crafted.movements[0].before = 10;
  crafted.movements[0].delta = -5;
  const h = harness();
  const r = await h.call('PUT', mutation(crafted, { baseRevision:0, action:'import', mutationId:'import_fake01' }));
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.code, 'import_history_must_start_at_zero');
  assert.match(r.body.error, /saldo zero/);
});

test('successful import increments server revision and retries are idempotent', async () => {
  const h = harness();
  const initial = addOne(engine.createEmpty());
  const first = await h.call('PUT', mutation(initial, { baseRevision: 0 }));
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.state.revision, 1);
  assert.equal(first.body.state.mode, 'local');
  const retry = await h.call('PUT', mutation(initial, { baseRevision: 0 }));
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.duplicate, true);
  assert.equal(retry.body.state.revision, 1);
  const reused = await h.call('PUT', mutation(engine.createEmpty(), { baseRevision:0 }));
  assert.equal(reused.statusCode, 409);
  assert.equal(reused.body.code, 'mutation_id_reused');
});

test('save rejects demo states, removal of historic items and non-append-only movements', async () => {
  const initial = addOne(engine.createEmpty());
  const state = { version:1, state:initial, mutationIds:['import_0001'], updatedBy:'user_master' };
  const h = harness({ initial: state });
  const demo = await h.call('PUT', mutation(engine.createDemo(), { action:'save', baseRevision:1, etag:'"rev-0"', mutationId:'save_demo_01' }));
  assert.equal(demo.statusCode, 400);
  const deleted = structuredClone(initial); deleted.items = [];
  const remove = await h.call('PUT', mutation(deleted, { action:'save', baseRevision:1, etag:'"rev-0"', mutationId:'save_delete1' }));
  assert.equal(remove.statusCode, 400);
  const altered = structuredClone(initial); altered.movements[0].quantity = 2;
  const rewrite = await h.call('PUT', mutation(altered, { action:'save', baseRevision:1, etag:'"rev-0"', mutationId:'save_rewrite1' }));
  assert.equal(rewrite.statusCode, 400);
});

test('saved quantities require movement history and existing movement prefix is preserved', async () => {
  const initial = addOne(engine.createEmpty());
  const h = harness({ initial: { version:1, state:initial, mutationIds:['import_0001'], updatedBy:'user_master' } });
  const withoutMoves = structuredClone(initial); withoutMoves.movements = [];
  const noHistory = await h.call('PUT', mutation(withoutMoves, { action:'save', baseRevision:1, etag:'"rev-0"', mutationId:'save_nohist1' }));
  assert.equal(noHistory.statusCode, 400);
  const next = engine.move(initial, { itemId:initial.items[0].id, locationId:'l017', bin:'A1', type:'out', quantity:2 });
  const saved = await h.call('PUT', mutation(next, { action:'save', baseRevision:1, etag:'"rev-0"', mutationId:'save_move001' }));
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.state.movements.length, 2);
  assert.equal(saved.body.state.movements[1].actor, 'user_master');
});

test('Drive compare-and-swap conflict maps to 409', async () => {
  const h = harness({ casConflict: true });
  const r = await h.call('PUT', mutation(addOne(engine.createEmpty())));
  assert.equal(r.statusCode, 409);
});

test('two concurrent writes from one snapshot produce one commit and one conflict', async () => {
  const h = harness();
  const stateA = addOne(engine.createEmpty());
  const stateB = engine.addItem(engine.createEmpty(), { name:'Outro item', code:'TEST-2', unit:'un', category:'Elétrica', quantity:3, locationId:'l017', bin:'B1' });
  const [a,b] = await Promise.all([
    h.call('PUT', mutation(stateA, { baseRevision:0, mutationId:'write_conc_001' })),
    h.call('PUT', mutation(stateB, { baseRevision:0, mutationId:'write_conc_002' }))
  ]);
  assert.deepEqual([a.statusCode,b.statusCode].sort(), [200,409]);
});

test('missing ETag in PUT is confirmed by readback before success', async () => {
  const h = harness({ omitPutEtag:true });
  const r = await h.call('PUT', mutation(addOne(engine.createEmpty()), { baseRevision:0 }));
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.etag, '"rev-1"');
});

test('oversize serialized payload is rejected', async () => {
  const h = harness();
  const r = await h.call('PUT', { ...mutation(engine.createEmpty()), padding: 'x'.repeat(3 * 1024 * 1024) });
  assert.equal(r.statusCode, 413);
});

test('Drive adapter sends If-Match and signals a readback when upload omits ETag', async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url:String(url), init });
    if (init.method === 'PUT') return new Response('', { status:200 });
    if (String(url).includes('/drive/v2/files/')) return new Response(JSON.stringify({ etag:'"drive-v1"', version:'7', fileSize:'200' }), { status:200 });
    if (String(url).includes('/drive/v3/files/')) return new Response(JSON.stringify({ version:1, state:engine.createEmpty(), mutationIds:[], updatedBy:'' }), { status:200 });
    return new Response('', { status:200 });
  };
  const store = new DriveInventoryStore({ fileId:'drive_file_id_123', tokenProvider:async()=> 'test-token', fetchImpl:fakeFetch });
  const loaded = await store.get();
  const saved = await store.put({ version:1, state:loaded.envelope.state, mutationIds:[], updatedBy:'' }, loaded.etag);
  assert.equal(saved.conflict, false);
  assert.equal(saved.etag, null);
  assert.equal(saved.readbackRequired, true);
  const upload = calls.find(x => x.init.method === 'PUT');
  assert.equal(upload.init.headers['If-Match'], '"drive-v1"');
  assert.match(upload.url, /drive\/v2\/files/);
});

test('Drive read retries when metadata ETag changes around the media download', async () => {
  let metadataNumber = 0, mediaNumber = 0;
  const stableEnvelope = { version:1, state:engine.createEmpty(), mutationIds:[], updatedBy:'' };
  const fakeFetch = async url => {
    const value = String(url);
    if (value.includes('/drive/v2/files/')) {
      metadataNumber++;
      const etag = metadataNumber === 1 ? '"old"' : '"new"';
      return new Response(JSON.stringify({ etag, fileSize:'200' }), { status:200 });
    }
    mediaNumber++;
    return new Response(JSON.stringify(stableEnvelope), { status:200 });
  };
  const store = new DriveInventoryStore({ fileId:'drive_file_id_123', tokenProvider:async()=> 'test-token', fetchImpl:fakeFetch });
  const result = await store.get();
  assert.equal(result.etag, '"new"');
  assert.equal(mediaNumber, 2);
});

test('Drive read fails as conflict after three unstable metadata snapshots', async () => {
  let metadataNumber = 0;
  const fakeFetch = async url => String(url).includes('/drive/v2/files/')
    ? new Response(JSON.stringify({ etag:`"v${++metadataNumber}"`, fileSize:'200' }), { status:200 })
    : new Response(JSON.stringify({ version:1, state:engine.createEmpty(), mutationIds:[], updatedBy:'' }), { status:200 });
  const store = new DriveInventoryStore({ fileId:'drive_file_id_123', tokenProvider:async()=> 'test-token', fetchImpl:fakeFetch });
  await assert.rejects(store.get(), error => error.code === 'INVENTORY_READ_CONFLICT' && error.status === 409);
  assert.equal(metadataNumber, 6);
});

test('Drive upload maps HTTP 412 to conditional-write conflict', async () => {
  const store = new DriveInventoryStore({ fileId:'drive_file_id_123', tokenProvider:async()=> 'test-token', fetchImpl:async()=>new Response('',{status:412}) });
  assert.deepEqual(await store.put({ version:1 }, '"old"'), { conflict:true });
});

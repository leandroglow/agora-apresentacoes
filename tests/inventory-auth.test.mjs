import test from 'node:test';
import assert from 'node:assert/strict';
import { requireInventoryAuth } from '../api/_lib/auth.mjs';

const MASTER = 'user_3Jvm8LQLtHINAqVtQhagyoDC6nT';
const WILIAM = 'user_3JvmAhiGPCh3w3nDMB3pPJOyIN9';

function response() {
  return {
    code: null,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('inventory authorization accepts Master and Wiliam', async () => {
  for (const sub of [MASTER, WILIAM]) {
    const res = response();
    const session = await requireInventoryAuth({}, res, async () => ({ sub }));
    assert.deepEqual(session, { sub });
    assert.equal(res.code, null);
  }
});

test('inventory authorization rejects a different authenticated user', async () => {
  const res = response();
  const session = await requireInventoryAuth({}, res, async () => ({ sub: 'user_external' }));
  assert.equal(session, null);
  assert.equal(res.code, 403);
  assert.equal(res.body.code, 'INVENTORY_ACCESS_DENIED');
});

test('inventory authorization rejects a missing session', async () => {
  const res = response();
  const session = await requireInventoryAuth({}, res, async () => null);
  assert.equal(session, null);
  assert.equal(res.code, 401);
});

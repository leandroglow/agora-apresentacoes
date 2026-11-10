import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAvailability } from '../scripts/check-availability.mjs';

test('retries transient failures up to three attempts then reports failure', async () => {
  let calls = 0;
  const [result] = await checkAvailability({
    checks: [{ name: 'HTML', url: 'https://example.test/', mode: 'success' }],
    fetchImpl: async () => { calls += 1; return { status: 503 }; },
  });
  assert.equal(calls, 3);
  assert.deepEqual(result, { name: 'HTML', ok: false, status: 503, attempts: 3 });
});

test('stops retrying after recovery and records only status metadata', async () => {
  let calls = 0;
  const [result] = await checkAvailability({
    checks: [{ name: 'HTML', url: 'https://example.test/', mode: 'success' }],
    fetchImpl: async () => new Response('', { status: ++calls === 1 ? 502 : 200 }),
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { name: 'HTML', ok: true, status: 200, attempts: 2 });
  assert.equal(Object.hasOwn(result, 'body'), false);
});

test('anonymous API accepts only 401 or 403', async () => {
  for (const [status, expected] of [[401, true], [403, true], [200, false], [500, false]]) {
    const [result] = await checkAvailability({
      checks: [{ name: 'API', url: 'https://example.test/api', mode: 'anonymous-denied' }],
      fetchImpl: async () => new Response('', { status }),
    });
    assert.equal(result.ok, expected, `status ${status}`);
    assert.equal(result.attempts, expected ? 1 : 3);
  }
});

test('network errors retry without exposing error details', async () => {
  let calls = 0;
  const [result] = await checkAvailability({
    checks: [{ name: 'HTML', url: 'https://example.test/', mode: 'success' }],
    fetchImpl: async () => { calls += 1; throw new Error('secret body or personal data'); },
  });
  assert.equal(calls, 3);
  assert.deepEqual(result, { name: 'HTML', ok: false, status: null, attempts: 3 });
});

test('rejects redirects and validates the HA providers JSON shape without retaining it', async () => {
  const checks = [
    { name: 'HA', url: 'https://example.test/auth/providers', mode: 'ha-providers' },
    { name: 'Redirect', url: 'https://example.test/login', mode: 'success' },
  ];
  const seen = [];
  const results = await checkAvailability({
    checks,
    fetchImpl: async (_url, options) => {
      seen.push(options.redirect);
      if (seen.length === 1) return new Response('{"providers":[]}', { status: 200 });
      throw new TypeError('redirect blocked');
    },
  });
  assert.deepEqual(seen, ['error', 'error', 'error', 'error']);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].status, 200);
  assert.equal(results[0].body, undefined);
  assert.equal(results[1].ok, false);
});

test('rejects HA success status with invalid or oversized response content', async () => {
  for (const body of ['{}', '"private payload"', 'x'.repeat(1024 * 1024 + 1)]) {
    const [result] = await checkAvailability({
      checks: [{ name: 'HA', url: 'https://example.test/auth/providers', mode: 'ha-providers' }],
      fetchImpl: async () => new Response(body, { status: 200 }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 200);
  }
});

test('HTML endpoint requires its expected marker', async () => {
  const [result] = await checkAvailability({
    checks: [{ name: 'Sistema', url: 'https://example.test/sistema/', mode: 'html', marker: 'Sistema Ágora' }],
    fetchImpl: async () => new Response('<html><title>Generic login</title></html>', { status: 200 }),
  });
  assert.equal(result.ok, false);
});

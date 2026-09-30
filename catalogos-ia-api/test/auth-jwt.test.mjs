import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { authenticateClerkRequest, requireAuth } from '../api/_lib/auth.mjs';

// Ephemeral test-only keys: exercise the real Clerk SDK without accounts,
// network requests, secrets, or an authentication bypass in production.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' });
const origin = 'https://apresentacoes.agoracons.com.br';
const issuer = 'https://clerk.apresentacoes.agoracons.com.br';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(overrides = {}, signingKey = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: 'user_test', sid: 'sess_test', iss: issuer, azp: origin,
    iat: now, nbf: now - 5, exp: now + 60, v: 2, ...overrides };
  const input = encode({ alg: 'RS256', typ: 'JWT', kid: 'test-key' }) + '.' + encode(claims);
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), signingKey).toString('base64url');
}
const request = value => ({ headers: { origin, authorization: `Bearer ${value}` }, method: 'POST', url: '/api/ask' });
function response() {
  return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test('SDK real aceita sessão assinada usando somente a chave pública', async () => {
  assert.deepEqual(await authenticateClerkRequest(request(token()), { jwtKey }), { sub: 'user_test' });
});
test('SDK real nega tokens inválidos, expirados, futuros, de outra origem ou assinatura', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const value of ['invalid.test.token', token({ exp: now - 120 }), token({ nbf: now + 120 }),
    token({ azp: 'https://evil.example' }), token({}, otherKey)]) {
    assert.equal(await authenticateClerkRequest(request(value), { jwtKey }), null);
  }
});
test('nega token sem sessão, usuário, origem, emissor correto ou sessão ativa', async () => {
  for (const claims of [{ iss: 'https://another.clerk.accounts.dev' }, { sid: undefined },
    { sid: 'machine_test' }, { sub: undefined }, { sub: 'machine_test' }, { azp: undefined },
    { exp: undefined }, { sts: 'pending' }]) {
    assert.equal(await authenticateClerkRequest(request(token(claims)), { jwtKey }), null);
  }
});
test('regressão: caminho real de ambiente jwtKey-only aceita sessão e retorna 401 para token inválido', async () => {
  const names = ['CLERK_JWT_KEY', 'CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.CLERK_JWT_KEY = jwtKey;
    delete process.env.CLERK_SECRET_KEY;
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuYXByZXNlbnRhY29lcy5hZ29yYWNvbnMuY29tLmJyJA';
    assert.deepEqual(await requireAuth(request(token()), response()), { sub: 'user_test' });
    const invalid = response();
    assert.equal(await requireAuth(request('invalid.test.token'), invalid), null);
    assert.equal(invalid.code, 401);
    process.env.CLERK_JWT_KEY = 'invalid-public-key';
    const unavailable = response();
    assert.equal(await requireAuth(request(token()), unavailable), null);
    assert.equal(unavailable.code, 503);
  } finally {
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});

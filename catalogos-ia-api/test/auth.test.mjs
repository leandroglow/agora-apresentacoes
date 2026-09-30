import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateClerkRequest } from '../api/_lib/auth.mjs';
import oldLogin from '../api/login.mjs';

const origin = 'https://apresentacoes.agoracons.com.br';
const authenticated = {
  authenticateRequest: async (_request, options) => {
    assert.deepEqual(options.authorizedParties, [origin]);
    assert.equal(options.acceptsToken, 'session_token');
    return { isAuthenticated: true, toAuth: () => ({ userId: 'user_william' }) };
  }
};

test('aceita uma sessão Clerk válida do endereço do Sistema', async () => {
  const access = await authenticateClerkRequest({
    headers: { authorization: 'Bearer sample.jwt.token', origin },
    method: 'POST', url: '/api/ask'
  }, authenticated, origin);
  assert.deepEqual(access, { sub: 'user_william' });
});

test('nega origem diferente e requisição sem token', async () => {
  const base = { method: 'POST', url: '/api/ask' };
  assert.equal(await authenticateClerkRequest({ ...base, headers: { authorization: 'Bearer sample.jwt.token', origin: 'https://evil.example' } }, authenticated, origin), null);
  assert.equal(await authenticateClerkRequest({ ...base, headers: { origin } }, authenticated, origin), null);
});

test('nega sessão Clerk não autenticada', async () => {
  const rejected = { authenticateRequest: async () => ({ isAuthenticated: false }) };
  assert.equal(await authenticateClerkRequest({ headers: { authorization: 'Bearer sample.jwt.token', origin }, method: 'POST', url: '/api/ask' }, rejected, origin), null);
});

test('login com senha própria permanece desativado', async () => {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await oldLogin({ method: 'POST', headers: { origin } }, response);
  assert.equal(response.code, 410);
  assert.match(response.body.error, /desativado/);
});

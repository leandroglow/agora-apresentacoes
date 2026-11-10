import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_CHECKS = [
  { name: 'Sistema HTML', url: 'https://apresentacoes.agoracons.com.br/sistema/', mode: 'html', marker: 'Apresentações Sistema' },
  { name: 'Montador Galpão 017', url: 'https://apresentacoes.agoracons.com.br/galpao-017-quadros/', mode: 'html', marker: 'Galpão 017' },
  { name: 'Autenticação HA', url: 'https://ha.agoracons.com.br/auth/providers', mode: 'ha-providers' },
  ...['dashboard', 'expenses', 'operations'].map((endpoint) => ({
    name: `API ${endpoint}`,
    url: `https://agora-apresentacoes.vercel.app/api/${endpoint}`,
    mode: 'anonymous-denied',
  })),
];

const RETRIES = 3;
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 1024 * 1024;

async function readLimitedBody(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error('response too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}

function contentMatches(check, body) {
  if (check.mode === 'html') return /<html\b/i.test(body) && body.includes(check.marker);
  if (check.mode === 'ha-providers') {
    try {
      const value = JSON.parse(body);
      return Array.isArray(value) || (value !== null && typeof value === 'object' && Array.isArray(value.providers));
    } catch { return false; }
  }
  return true;
}

async function probe(check, fetchImpl, timeoutMs) {
  let lastStatus = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(check.url, {
        method: 'GET',
        redirect: 'error',
        headers: { Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
        signal: controller.signal,
      });
      lastStatus = response.status;
      const statusOk = check.mode === 'anonymous-denied'
        ? response.status === 401 || response.status === 403
        : response.status >= 200 && response.status < 300;
      let ok = statusOk;
      if (statusOk && (check.mode === 'html' || check.mode === 'ha-providers')) {
        const body = await readLimitedBody(response);
        ok = contentMatches(check, body);
      } else if (response.body) {
        await response.body.cancel().catch(() => {});
      }
      if (ok) return { name: check.name, ok: true, status: response.status, attempts: attempt };
    } catch {
      // Keep the last received HTTP status; fetch errors carry no body or details.
    } finally {
      clearTimeout(timer);
    }
  }
  return { name: check.name, ok: false, status: lastStatus, attempts: RETRIES };
}

export async function checkAvailability({
  fetchImpl = globalThis.fetch,
  checks = DEFAULT_CHECKS,
  timeoutMs = TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > TIMEOUT_MS) {
    throw new RangeError('timeoutMs must be between 1 and 10000');
  }
  return Promise.all(checks.map((check) => probe(check, fetchImpl, timeoutMs)));
}

function summary(results) {
  const lines = ['## Monitor público de disponibilidade', '', '| Verificação | Resultado | HTTP | Tentativas |', '|---|---|---:|---:|'];
  for (const result of results) {
    lines.push(`| ${result.name} | ${result.ok ? 'OK' : 'FALHA'} | ${result.status ?? 'sem resposta'} | ${result.attempts} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const results = await checkAvailability();
  const report = summary(results);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, report, 'utf8');
  }
  process.stdout.write(report);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    process.stderr.write('Availability monitor failed before completing checks.\n');
    process.exitCode = 1;
  });
}



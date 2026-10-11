const DEFAULT_ORIGINS = [
  'https://apresentacoes.agoracons.com.br',
  'http://127.0.0.1:8767',
  'http://localhost:8767'
];

function configuredOrigins() {
  return (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',').map((value) => value.trim()).filter(Boolean);
}

export function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && configuredOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-File-Name');
  res.setHeader('Cache-Control', 'no-store');
}

export function handleOptions(req, res) {
  if (req.method !== 'OPTIONS') return false;
  setCors(req, res);
  res.status(204).end();
  return true;
}

export function json(res, status, body) { res.status(status).json(body); }

export function requireMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  json(res, 405, { error: 'Método não permitido.' });
  return false;
}

export function readJsonBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  if (!req.body) return {};
  return JSON.parse(req.body);
}

export async function readRawBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error('Áudio maior que o limite permitido.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

function base64url(value) { return Buffer.from(value).toString('base64url'); }

function sign(value) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET ausente ou curto demais.');
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function validateCredentials(username, password) {
  let users;
  try { users = JSON.parse(process.env.AGORA_USERS_JSON || '{}'); }
  catch { throw new Error('AGORA_USERS_JSON inválido.'); }
  const expected = users[String(username || '').trim().toLowerCase()];
  return typeof expected === 'string' && safeEqual(expected, password || '');
}

export function issueToken(username) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({ sub: username, iat: now, exp: now + TOKEN_TTL_SECONDS }));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!safeEqual(sign(payload), signature)) return null;
  let parsed;
  try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { return null; }
  if (!parsed.sub || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

export function requireAuth(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = verifyToken(token);
  if (!session) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    return null;
  }
  return session;
}

import { createPublicKey } from 'node:crypto';
import { createClerkClient, verifyToken } from '@clerk/backend';

// Public key of the Ágora Automação Clerk application. Never put a secret here.
const AUTOMACAO_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuYXByZXNlbnRhY29lcy5hZ29yYWNvbnMuY29tLmJyJA';
const SITE_ORIGIN = 'https://apresentacoes.agoracons.com.br';
const CLERK_ISSUER = 'https://clerk.apresentacoes.agoracons.com.br';
let clerk;
let validatedJwtKey;

function client() {
  const jwtKey = process.env.CLERK_JWT_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if ((!jwtKey && !secretKey) || process.env.CLERK_PUBLISHABLE_KEY !== AUTOMACAO_PUBLISHABLE_KEY) {
    throw new Error('Clerk da Ágora não configurado nesta API.');
  }
  if (jwtKey) {
    // authenticateRequest() requires a secret key in Clerk backend v3, even
    // when jwtKey is provided. Verify the existing public-key setup offline.
    if (validatedJwtKey !== jwtKey) {
      if (createPublicKey(jwtKey).asymmetricKeyType !== 'rsa') throw new Error('Chave JWT inválida.');
      validatedJwtKey = jwtKey;
    }
    return { jwtKey };
  }
  if (!clerk) clerk = createClerkClient({
    secretKey,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY
  });
  return clerk;
}

export async function authenticateClerkRequest(req, clerkClient, siteOrigin = SITE_ORIGIN) {
  const authorization = String(req.headers.authorization || '');
  if (!/^Bearer [^\s]+$/.test(authorization) || req.headers.origin !== siteOrigin) return null;
  clerkClient ||= client();
  if (clerkClient.jwtKey) {
    let claims;
    try {
      claims = await verifyToken(authorization.slice(7), {
        jwtKey: clerkClient.jwtKey,
        authorizedParties: [siteOrigin]
      });
    } catch {
      // Invalid, expired or foreign tokens are authentication failures, not
      // infrastructure outages. Never log tokens or verification payloads.
      return null;
    }
    if (claims.iss !== CLERK_ISSUER || claims.azp !== siteOrigin ||
        typeof claims.sub !== 'string' || !/^user_[a-zA-Z0-9]+$/.test(claims.sub) ||
        typeof claims.sid !== 'string' || !/^sess_[a-zA-Z0-9]+$/.test(claims.sid) ||
        typeof claims.exp !== 'number' ||
        (claims.sts !== undefined && claims.sts !== 'active')) return null;
    return { sub: claims.sub };
  }
  const request = new Request(new URL(req.url || '/api/ask', 'https://agora-apresentacoes.vercel.app'), {
    method: req.method,
    headers: { authorization, origin: req.headers.origin }
  });
  const state = await clerkClient.authenticateRequest(request, {
    authorizedParties: [siteOrigin],
    acceptsToken: 'session_token'
  });
  if (!state.isAuthenticated) return null;
  const userId = state.toAuth().userId;
  return userId ? { sub: userId } : null;
}

export async function requireAuth(req, res) {
  let session;
  try { session = await authenticateClerkRequest(req); }
  catch {
    res.status(503).json({ error: 'Login da Ágora temporariamente indisponível.' });
    return null;
  }
  if (!session) res.status(401).json({ error: 'Sessão Clerk inválida ou expirada.' });
  return session;
}

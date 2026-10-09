import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, requireMethod, setCors } from './_lib/http.mjs';

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res) || !requireMethod(req, res, 'GET')) return;
  if (!await requireAuth(req, res)) return;
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  if (!clientId) return json(res, 503, { error: 'DRIVE_AUTH_CONFIG' });
  return json(res, 200, {
    clientId,
    scope: 'https://www.googleapis.com/auth/drive',
    origin: 'https://apresentacoes.agoracons.com.br'
  });
}

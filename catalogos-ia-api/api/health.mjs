import { hasGoogleDriveCredentials } from './_lib/google.mjs';
import { handleOptions, json, setCors } from './_lib/http.mjs';

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
  const googleDriveConfigured = hasGoogleDriveCredentials();
  return json(res, 200, {
    ok: true,
    source: 'google_drive',
    googleDriveConfigured,
    configured: Boolean(
      process.env.OPENAI_API_KEY &&
      process.env.SESSION_SECRET &&
      process.env.AGORA_USERS_JSON &&
      googleDriveConfigured
    )
  });
}

import { hasGoogleDriveCredentials, getGoogleDriveAccessToken } from './_lib/google.mjs';
import { CatalogDrive, configuredRoot } from './_lib/drive.mjs';
import { modelConfig } from './_lib/agent.mjs';
import { getOpenAI } from './_lib/openai.mjs';
import { handleOptions, json, setCors } from './_lib/http.mjs';

let verification;
export async function checkServices({ getToken = getGoogleDriveAccessToken, getClient = getOpenAI, makeDrive = options => new CatalogDrive(options), config = modelConfig() } = {}) {
  const [drive, model] = await Promise.allSettled([
    (async () => { const client = makeDrive({ token: await getToken(), signal: AbortSignal.timeout(10000) }); await client.list(); return true; })(),
    (async () => { await getClient().models.retrieve(config.model, { timeout: 10000, maxRetries: 0 }); return true; })()
  ]);
  // No filenames, folder IDs, account details, provider messages or credentials.
  return { checkedAt: new Date().toISOString(), driveAccessible: drive.status === 'fulfilled', modelAvailable: model.status === 'fulfilled' };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
  const googleDriveConfigured = hasGoogleDriveCredentials();
  let config;
  try { config = modelConfig(); }
  catch { return json(res, 503, { ok: false, configured: false, code: 'MODEL_CONFIG', version: 'drive-direct-v2.1' }); }
  let checks = {};
  if (new URL(req.url, 'https://localhost').searchParams.get('check') === '1') {
    if (!verification || verification.expiresAt < Date.now()) {
      verification = { expiresAt: Date.now() + 60000, result: checkServices({ config }) };
    }
    checks = await verification.result;
  }
  return json(res, 200, {
    ok: true,
    source: 'google_drive',
    version: 'drive-direct-v2.1',
    model: config.model,
    reasoningEffort: config.reasoning.effort,
    ...checks,
    folderConfigured: Boolean(configuredRoot()),
    googleDriveConfigured,
    configured: Boolean(
      process.env.OPENAI_API_KEY &&
      process.env.SESSION_SECRET &&
      process.env.AGORA_USERS_JSON &&
      googleDriveConfigured && configuredRoot()
    )
  });
}

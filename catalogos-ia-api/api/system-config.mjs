import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, readJsonBody, setCors } from './_lib/http.mjs';

const folder = () => String(process.env.GOOGLE_DRIVE_SYSTEM_CONFIG_FOLDER_ID || '').trim();
const fileName = 'agora-system-config.json';

async function driveRequest(token, path, options = {}) {
  const response = await fetch(`https://www.googleapis.com/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Drive indisponível (${response.status}).`);
  return response;
}

async function findFile(token) {
  const q = `'${folder()}' in parents and name='${fileName}' and trashed=false`;
  const params = new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '10' });
  return (await (await driveRequest(token, `drive/v3/files?${params}`)).json()).files?.[0] || null;
}

async function readConfig(token, file) {
  if (!file) return {};
  return await (await driveRequest(token, `drive/v3/files/${file.id}?alt=media`)).json();
}

async function writeConfig(token, file, config) {
  const content = JSON.stringify(config, null, 2);
  if (file) {
    await driveRequest(token, `upload/drive/v3/files/${file.id}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content
    });
    return file.id;
  }
  const boundary = 'agora_system_config';
  const payload = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: fileName, parents: [folder()], mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const response = await driveRequest(token, 'upload/drive/v3/files?uploadType=multipart', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: payload
  });
  return (await response.json()).id;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!folder()) return json(res, 503, { error: 'SYSTEM_CONFIG_FOLDER_MISSING' });
  if (!['GET', 'PUT'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });
  try {
    const token = await getGoogleDriveAccessToken();
    const file = await findFile(token);
    if (req.method === 'GET') return json(res, 200, await readConfig(token, file));
    const body = readJsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Configuração inválida.' });
    const previous = await readConfig(token, file);
    const config = { ...previous, ...body, atualizado_em: new Date().toISOString(), atualizado_por: user.sub };
    const id = await writeConfig(token, file, config);
    return json(res, 200, { ok: true, id, config });
  } catch (error) {
    return json(res, 502, { error: error.message || 'Falha ao acessar a configuração no Drive.' });
  }
}

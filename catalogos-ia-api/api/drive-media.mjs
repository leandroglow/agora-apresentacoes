import { requireAuth, setCors } from './_lib/auth.mjs';
import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { CatalogDrive } from './_lib/drive.mjs';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();
  try {
    await requireAuth(req);
    const id = String(req.query?.id || '');
    if (!/^[\w-]+$/.test(id)) return res.status(400).end('invalid_id');
    const drive = new CatalogDrive({ token: await getGoogleDriveAccessToken() });
    const file = await drive.meta(id);
    await drive.authorized(id);
    const data = await drive.bytes(file);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(Buffer.from(data));
  } catch (error) {
    return res.status(error.status || 502).end(error.message || 'drive_media_failed');
  }
}

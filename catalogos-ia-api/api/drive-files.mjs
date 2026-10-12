import { requireAuth, setCors, json } from './_lib/auth.mjs';
import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { CatalogDrive } from './_lib/drive.mjs';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  try {
    await requireAuth(req);
    const folder = String(req.query?.folder || '').trim();
    const mime = String(req.query?.mime || '').trim();
    if (!folder) return json(res, 400, { error: 'folder_required' });
    const drive = new CatalogDrive({ token: await getGoogleDriveAccessToken() });
    const result = await drive.list(folder);
    const files = (result.files || [])
      .filter(file => !mime || file.mimeType === mime)
      .map(file => ({ id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, modifiedTime: file.modifiedTime }));
    return json(res, 200, { files });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'drive_list_failed' });
  }
}

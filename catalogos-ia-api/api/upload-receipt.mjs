import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { driveId } from './_lib/drive.mjs';
import { handleOptions, json, readJsonBody, requireMethod, setCors } from './_lib/http.mjs';

const DEFAULT_FOLDER = '1665zvQOtbulPR59zjFLr37mflu9n31Yo';

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res) || !requireMethod(req, res, 'POST')) return;
  if (!await requireAuth(req, res)) return;
  try {
    const body = readJsonBody(req);
    const base64 = String(body.fileBase64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!base64 || base64.length > 15_000_000) return json(res, 400, { error: 'Imagem ausente ou maior que o limite permitido.' });
    const mimeType = String(body.mimeType || 'image/jpeg').split(';')[0];
    const fileName = String(body.fileName || `despesa_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const folderHint = body.folderId || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_HINT || DEFAULT_FOLDER;
    const folderId = driveId(folderHint) || String(folderHint);
    // A short-lived token obtained by the in-app Google reconnect flow takes
    // precedence. The long-lived server refresh token remains the fallback.
    const browserToken = String(body.googleAccessToken || '').trim();
    const token = browserToken || await getGoogleDriveAccessToken();
    const boundary = `agora_${Date.now()}`;
    const metadata = JSON.stringify({ name: fileName, parents: [folderId], mimeType });
    const binary = Buffer.from(base64, 'base64');
    const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--`);
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: Buffer.concat([head, binary, tail]),
      signal: AbortSignal.timeout(30_000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const category = response.status === 401 ? 'DRIVE_AUTH_EXPIRED' : response.status === 403 ? 'DRIVE_PERMISSION_DENIED' : response.status === 404 ? 'DRIVE_FOLDER_NOT_FOUND' : 'DRIVE_UPLOAD_FAILED';
      return json(res, response.status, { error: category });
    }
    return json(res, 200, payload);
  } catch (error) {
    console.error('upload_receipt_error', JSON.stringify({ code: error.code || error.name, status: error.status }));
    return json(res, 502, { error: error.code === 'DRIVE_AUTH_EXPIRED' ? 'DRIVE_AUTH_EXPIRED' : 'DRIVE_UPLOAD_FAILED' });
  }
}

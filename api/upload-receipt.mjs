import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, readJsonBody, requireMethod, setCors } from './_lib/http.mjs';
import { RECEIPT_LEGACY_MAX_BYTES, RECEIPT_MAX_BYTES, receiptFolder, validReceiptMime, validateUploadLocation } from './_lib/receipt-files.mjs';
import { driveId } from './_lib/drive.mjs';

function safeName(value) { return String(value || `despesa_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180); }

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res) || !requireMethod(req, res, 'POST')) return;
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const body = readJsonBody(req);
    const folderHint = receiptFolder();
    const folderId = driveId(folderHint) || String(folderHint);
    if (body.action === 'init') {
      const mimeType = String(body.mimeType || '').split(';')[0].toLowerCase();
      const size = Number(body.size);
      if (!validReceiptMime(mimeType)) return json(res, 400, { error: 'Formato de imagem não permitido.' });
      if (!Number.isSafeInteger(size) || size < 1 || size > RECEIPT_MAX_BYTES) return json(res, 413, { error: 'Imagem maior que o limite permitido.' });
      const token = await getGoogleDriveAccessToken();
      const metadata = { name: safeName(body.fileName), parents: [folderId], mimeType, appProperties: { uploadedBy: user.sub } };
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id', {
        // Google binds resumable-session CORS to the initiating request. Auth
        // above already restricts this origin to the Sistema frontend.
        method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: req.headers.origin, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(size) },
        body: JSON.stringify(metadata), signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) { const category = response.status === 401 ? 'DRIVE_AUTH_EXPIRED' : response.status === 403 ? 'DRIVE_PERMISSION_DENIED' : response.status === 404 ? 'DRIVE_FOLDER_NOT_FOUND' : 'DRIVE_UPLOAD_FAILED'; return json(res, response.status, { error: category }); }
      const uploadUrl = validateUploadLocation(response.headers.get('location'));
      return json(res, 200, { uploadUrl, maxBytes: RECEIPT_MAX_BYTES });
    }

    const base64 = String(body.fileBase64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!base64) return json(res, 400, { error: 'Imagem ausente ou maior que o limite permitido.' });
    const binary = Buffer.from(base64, 'base64');
    if (!binary.length || binary.length > RECEIPT_LEGACY_MAX_BYTES || binary.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')) return json(res, 413, { error: 'Imagem ausente ou maior que o limite permitido.' });
    const mimeType = String(body.mimeType || 'image/jpeg').split(';')[0].toLowerCase();
    if (!validReceiptMime(mimeType)) return json(res, 400, { error: 'Formato de imagem não permitido.' });
    const token = await getGoogleDriveAccessToken();
    const boundary = `agora_${Date.now()}`;
    const metadata = JSON.stringify({ name: safeName(body.fileName), parents: [folderId], mimeType, appProperties: { uploadedBy: user.sub } });
    const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--`);
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: Buffer.concat([head, binary, tail]), signal: AbortSignal.timeout(30000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const category = response.status === 401 ? 'DRIVE_AUTH_EXPIRED' : response.status === 403 ? 'DRIVE_PERMISSION_DENIED' : response.status === 404 ? 'DRIVE_FOLDER_NOT_FOUND' : 'DRIVE_UPLOAD_FAILED'; return json(res, response.status, { error: category }); }
    return json(res, 200, payload);
  } catch (error) {
    console.error('upload_receipt_error', JSON.stringify({ code: error.code || error.name, status: error.status || error.statusCode }));
    const status = error.statusCode || error.status;
    return json(res, status >= 400 && status < 500 ? status : 502, { error: error.code === 'DRIVE_AUTH_EXPIRED' ? 'DRIVE_AUTH_EXPIRED' : 'DRIVE_UPLOAD_FAILED' });
  }
}

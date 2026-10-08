import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { requireAuth } from './_lib/auth.mjs';
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
    const folderId = String(body.folderId || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_FOLDER);
    const token = await getGoogleDriveAccessToken();
    const boundary = `agora_${Date.now()}`;
    const metadata = JSON.stringify({ name: fileName, parents: [folderId], mimeType });
    const binary = Buffer.from(base64, 'base64');
    const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--`);
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: Buffer.concat([head, binary, tail]),
      signal: AbortSignal.timeout(30_000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, { error: 'O Google Drive recusou o upload.' });
    return json(res, 200, payload);
  } catch (error) {
    console.error('upload_receipt_error', JSON.stringify({ code: error.code || error.name, status: error.status }));
    return json(res, 502, { error: 'Não foi possível salvar a foto no Google Drive agora.' });
  }
}

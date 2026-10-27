import { getOpenAI } from './_lib/openai.mjs';
import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, readJsonBody, requireMethod, setCors } from './_lib/http.mjs';
import { assertReceiptFile, readBoundedResponse, validReceiptId } from './_lib/receipt-files.mjs';

async function receiptData(fileId) {
  if (!validReceiptId(fileId)) { const e = new Error('Identificador de imagem inválido.'); e.statusCode = 400; throw e; }
  const token = await getGoogleDriveAccessToken();
  const metaResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,parents,mimeType,size,trashed`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (!metaResponse.ok) { const e = new Error('Não foi possível validar a imagem.'); e.statusCode = metaResponse.status === 404 ? 404 : 502; throw e; }
  const file = assertReceiptFile(await metaResponse.json());
  const media = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (!media.ok) throw new Error('Não foi possível ler a imagem.');
  const bytes = await readBoundedResponse(media, file.size);
  if (bytes.length !== file.size) { const e = new Error('Tamanho de imagem inconsistente.'); e.statusCode = 400; throw e; }
  return { file, dataUrl: `data:${file.mimeType};base64,${bytes.toString('base64')}` };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res) || !requireMethod(req, res, 'POST')) return;
  if (!await requireAuth(req, res)) return;
  try {
    const body = readJsonBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (body.fileId) {
      const target = [...messages].reverse().find(message => message?.role === 'user');
      if (!target) return json(res, 400, { error: 'Instruções de análise ausentes.' });
      const { dataUrl } = await receiptData(String(body.fileId));
      const text = typeof target.content === 'string' ? target.content : null;
      target.content = [{ type: 'image_url', image_url: { url: dataUrl } }, ...(text !== null ? [{ type: 'text', text }] : Array.isArray(target.content) ? target.content : [])];
    }
    if (!messages.length || JSON.stringify(messages).length > 30_000_000) return json(res, 400, { error: 'Imagem ou instruções ausentes, ou maiores que o limite permitido.' });
    const result = await getOpenAI().chat.completions.create({ model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini', max_tokens: Math.min(Number(body.max_tokens) || 1400, 2000), temperature: 0, messages });
    return json(res, 200, { choices: result.choices || [] });
  } catch (error) {
    console.error('analyze_receipt_error', JSON.stringify({ code: error.code || error.name, status: error.status || error.statusCode }));
    return json(res, error.statusCode || (error.status === 429 ? 429 : 502), { error: error.statusCode ? error.message : 'Não foi possível analisar o comprovante agora.' });
  }
}

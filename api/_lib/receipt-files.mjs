export const RECEIPT_MAX_BYTES = 20_000_000;
export const RECEIPT_LEGACY_MAX_BYTES = 3_000_000;
export const RECEIPT_CHUNK_BYTES = 1024 * 1024;
export const DEFAULT_RECEIPT_FOLDER = '1665zvQOtbulPR59zjFLr37mflu9n31Yo';
import { driveId } from './drive.mjs';

export function receiptFolder() {
  const configured = process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || DEFAULT_RECEIPT_FOLDER;
  return driveId(configured) || configured;
}

export function validReceiptMime(value) {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(value || '').toLowerCase());
}

export function validReceiptId(value) {
  return /^[A-Za-z0-9_-]{10,}$/.test(String(value || ''));
}

export function assertReceiptFile(file, { maxBytes = RECEIPT_MAX_BYTES } = {}) {
  if (!file || file.trashed || !Array.isArray(file.parents) || !file.parents.includes(receiptFolder())) {
    const error = new Error('Arquivo fora da pasta de despesas.'); error.statusCode = 403; throw error;
  }
  if (!validReceiptMime(file.mimeType)) {
    const error = new Error('Arquivo não é uma imagem permitida.'); error.statusCode = 400; throw error;
  }
  const size = Number(file.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) {
    const error = new Error('Tamanho de imagem inválido ou acima do limite.'); error.statusCode = 413; throw error;
  }
  return { ...file, size };
}

export function validateUploadLocation(location) {
  let url;
  try { url = new URL(location); } catch { throw new Error('Drive não retornou um endereço de upload válido.'); }
  if (url.origin !== 'https://www.googleapis.com' || url.pathname !== '/upload/drive/v3/files' || !url.searchParams.has('upload_id') || url.username || url.password || url.hash || ['access_token', 'oauth_token', 'authorization'].some(key => url.searchParams.has(key))) {
    throw new Error('Drive retornou um endereço de upload fora do domínio autorizado.');
  }
  return url.toString();
}


export async function readBoundedResponse(response, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) { const error = new Error('Resposta do Drive excedeu o limite permitido.'); error.statusCode = 413; throw error; }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}

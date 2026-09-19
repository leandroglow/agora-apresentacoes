import { toFile } from 'openai';
import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, readRawBody, requireMethod, setCors } from './_lib/http.mjs';
import { getOpenAI } from './_lib/openai.mjs';

export const config = { api: { bodyParser: false } };

const ALLOWED_AUDIO = new Set([
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg'
]);

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res) || !requireMethod(req, res, 'POST')) return;
  if (!requireAuth(req, res)) return;
  try {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    if (!ALLOWED_AUDIO.has(contentType)) return json(res, 415, { error: 'Formato de áudio não aceito.' });
    const buffer = await readRawBody(req, 5 * 1024 * 1024);
    if (!buffer.length) return json(res, 400, { error: 'Áudio vazio.' });
    const rawName = String(req.headers['x-file-name'] || 'pergunta.webm').replace(/[^a-zA-Z0-9._-]/g, '_');
    const transcription = await getOpenAI().audio.transcriptions.create({
      file: await toFile(buffer, rawName, { type: contentType }),
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
      language: 'pt'
    });
    return json(res, 200, { text: String(transcription.text || '').trim() });
  } catch (error) {
    console.error('transcribe_error', error.message);
    return json(res, error.statusCode || 502, { error: 'Não foi possível transcrever o áudio.' });
  }
}

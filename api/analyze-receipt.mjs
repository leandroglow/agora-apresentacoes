import { getOpenAI } from './_lib/openai.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, readJsonBody, requireMethod, setCors } from './_lib/http.mjs';

// Endpoint público somente para a análise de comprovantes do sistema Ágora.
// A chave da OpenAI permanece exclusivamente nas variáveis da Vercel.
export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res) || !requireMethod(req, res, 'POST')) return;
  if (!await requireAuth(req, res)) return;
  try {
    const body = readJsonBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length || JSON.stringify(messages).length > 12_000_000) {
      return json(res, 400, { error: 'Imagem ou instruções ausentes, ou maiores que o limite permitido.' });
    }
    const result = await getOpenAI().chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
      max_tokens: Math.min(Number(body.max_tokens) || 1400, 2000),
      temperature: 0,
      messages
    });
    return json(res, 200, { choices: result.choices || [] });
  } catch (error) {
    console.error('analyze_receipt_error', JSON.stringify({ code: error.code || error.name, status: error.status }));
    return json(res, error.status === 429 ? 429 : 502, { error: 'Não foi possível analisar o comprovante agora.' });
  }
}

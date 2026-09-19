import { handleOptions, json, setCors } from './_lib/http.mjs';

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
  return json(res, 200, {
    ok: true,
    configured: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_VECTOR_STORE_ID && process.env.SESSION_SECRET)
  });
}

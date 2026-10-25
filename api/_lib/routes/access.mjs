import { requireAuth } from '../auth.mjs';
import { handleOptions, json, setCors } from '../http.mjs';

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
  const user = await requireAuth(req, res);
  if (!user) return;
  return json(res, 200, { allowed: true });
}

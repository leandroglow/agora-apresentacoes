import { handleOptions, json, setCors } from './_lib/http.mjs';

// The old password-based login is intentionally disabled. Clerk is the only
// supported identity provider for Sistema and Catálogos IA.
export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  res.setHeader('Allow', 'OPTIONS');
  return json(res, 410, { error: 'Login antigo desativado. Entre com sua conta Ágora.' });
}

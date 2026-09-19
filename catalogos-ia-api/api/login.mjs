import { handleOptions, json, readJsonBody, requireMethod, setCors } from './_lib/http.mjs';
import { issueToken, validateCredentials } from './_lib/auth.mjs';

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res) || !requireMethod(req, res, 'POST')) return;
  try {
    const { username, password } = readJsonBody(req);
    if (!validateCredentials(username, password)) {
      return json(res, 401, { error: 'Usuário ou senha incorretos.' });
    }
    const normalized = String(username).trim().toLowerCase();
    return json(res, 200, { token: issueToken(normalized), user: normalized, expiresIn: 28800 });
  } catch (error) {
    console.error('login_error', error.message);
    return json(res, 500, { error: 'Não foi possível iniciar a sessão.' });
  }
}

import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, readJsonBody, setCors } from './_lib/http.mjs';

const fileName = 'agora-rh-state.json';
const folder = () => String(process.env.GOOGLE_DRIVE_RH_FOLDER_ID || process.env.GOOGLE_DRIVE_EXPENSE_FOLDER_ID || '').trim();

async function request(token, path, options = {}) {
  const r = await fetch(`https://www.googleapis.com/${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Drive indisponível (${r.status}).`);
  return r;
}
async function findStateFile(token) {
  const q = `'${folder()}' in parents and name='${fileName}' and trashed=false`;
  const p = new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '10' });
  return (await (await request(token, `drive/v3/files?${p}`)).json()).files?.[0] || null;
}
async function loadState(token, file) {
  if (!file) return { registros: [], colaboradores: [], fotos: {} };
  return await (await request(token, `drive/v3/files/${file.id}?alt=media`)).json();
}
async function saveState(token, file, state) {
  const body = JSON.stringify(state);
  if (file) {
    await request(token, `upload/drive/v3/files/${file.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    return file.id;
  }
  const boundary = 'agora_rh_state';
  const payload = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: fileName, parents: [folder()], mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  return (await (await request(token, 'upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: payload })).json()).id;
}
const filters = (url) => Object.fromEntries([...url.searchParams.entries()].filter(([k]) => !['select', 'order', 'limit'].includes(k)).map(([k, v]) => [k, v.replace(/^eq\./, '')]));
const matches = (row, f) => Object.entries(f).every(([key, value]) => String(row[key] ?? '') === value);

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });
  if (!await requireAuth(req, res)) return;
  if (!folder()) return json(res, 503, { error: 'RH_FOLDER_MISSING' });
  try {
    const token = await getGoogleDriveAccessToken();
    const file = await findStateFile(token);
    const state = await loadState(token, file);
    const url = new URL(req.url || '/api/rh', 'https://agora-apresentacoes.vercel.app');
    const resource = url.searchParams.get('resource') || 'registros';
    const action = url.searchParams.get('action') || '';
    if (action === 'photos') {
      const recordId = String(url.searchParams.get('recordId') || '');
      return json(res, 200, { photos: Array.isArray(state.fotos?.[recordId]) ? state.fotos[recordId] : [] });
    }
    if (!['registros', 'colaboradores'].includes(resource)) return json(res, 400, { error: 'Recurso inválido.' });
    if (req.method === 'GET') {
      let rows = Array.isArray(state[resource]) ? state[resource] : [];
      const queryFilters = filters(url);
      rows = rows.filter(row => matches(row, queryFilters));
      if (url.searchParams.get('order')?.includes('data.desc')) rows.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
      return json(res, 200, rows);
    }
    const body = readJsonBody(req);
    if (body?.action === 'photo_upload') {
      const recordId = String(body.recordId || '');
      const data = String(body.data || '');
      if (!recordId || !data.startsWith('data:image/')) return json(res, 400, { error: 'foto_invalida' });
      if (data.length > 12 * 1024 * 1024) return json(res, 413, { error: 'foto_muito_grande' });
      state.fotos ||= {};
      state.fotos[recordId] ||= [];
      state.fotos[recordId].push(data);
      await saveState(token, file, { ...state, atualizado_em: new Date().toISOString() });
      return json(res, 200, { url: data });
    }
    if (body?.action === 'photo_delete') {
      const recordId = String(body.recordId || '');
      const data = String(body.data || '');
      state.fotos ||= {};
      state.fotos[recordId] = (state.fotos[recordId] || []).filter(item => item !== data);
      await saveState(token, file, { ...state, atualizado_em: new Date().toISOString() });
      return json(res, 200, { ok: true });
    }
    const f = filters(url);
    if (req.method === 'POST') {
      const incoming = Array.isArray(body) ? body : [body];
      for (const item of incoming) {
        if (!item || typeof item !== 'object') continue;
        const idx = state[resource].findIndex(row => item.id !== undefined && String(row.id) === String(item.id));
        if (idx >= 0) state[resource][idx] = { ...state[resource][idx], ...item };
        else state[resource].push(item);
      }
    } else if (req.method === 'PATCH') {
      state[resource] = state[resource].map(row => matches(row, f) ? { ...row, ...body } : row);
    } else {
      state[resource] = state[resource].filter(row => !matches(row, f));
    }
    await saveState(token, file, { ...state, atualizado_em: new Date().toISOString() });
    return json(res, 200, state[resource].filter(row => matches(row, f)));
  } catch (error) {
    return json(res, 502, { error: error.message || 'Falha no armazenamento do RH.' });
  }
}

import { requireMasterAuth } from '../auth.mjs';
import { getGoogleDriveAccessToken } from '../google.mjs';

const ORIGIN = 'https://apresentacoes.agoracons.com.br';
const MASTER = 'user_3Jvm8LQLtHINAqVtQhagyoDC6nT';
const ID_RE = /^[A-Za-z0-9_-]{10,}$/;

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
}

const text = (v, max = 800) => typeof v === 'string' ? v.slice(0, max) : undefined;
const number = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const record = v => v && typeof v === 'object' && !Array.isArray(v);
const safeUrl = v => {
  if (typeof v !== 'string') return undefined;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password &&
      ['drive.google.com','docs.google.com','apresentacoes.agoracons.com.br','agora-apresentacoes.vercel.app','ha.agoracons.com.br'].includes(u.hostname)
      ? u.href : undefined;
  } catch { return undefined; }
};
function item(v, depth = 0) {
  if (!record(v)) return null;
  const out = {};
  for (const key of ['id','name','label','title','subtitle','status','owner','description','date','asOf','source','projectId','category']) {
    const value = text(v[key]);
    if (value !== undefined) out[key] = value;
  }
  for (const key of ['url','href','thumbUrl','sourceUrl']) {
    const value = safeUrl(v[key]);
    if (value) out[key] = value;
  }
  for (const key of ['count','total','value','amount','progress','committed','invoiced','paid']) {
    if (key in v) out[key] = number(v[key]);
  }
  if (Array.isArray(v.links)) out.links = v.links.slice(0,30).filter(record).map(x => ({label:text(x.label,120) || 'Abrir fonte',url:safeUrl(x.url)})).filter(x => x.url);
  if (depth < 2) for (const key of ['items','agenda']) {
    if (Array.isArray(v[key])) out[key] = v[key].slice(0,100).map(x => item(x,depth+1)).filter(Boolean);
  }
  return out;
}
export function sanitizeDashboardData(raw) {
  const src = record(raw) ? raw : {};
  const arr = key => Array.isArray(src[key]) ? src[key].slice(0,200).map(x => item(x)).filter(Boolean) : [];
  const f = record(src.financial) ? src.financial : {};
  const financial = {status:text(f.status,100) || 'A consolidar',committed:number(f.committed),invoiced:number(f.invoiced),paid:number(f.paid)};
  const meta = record(src.meta) ? {asOf:text(src.meta.asOf,80),sourcesCoverage:text(src.meta.sourcesCoverage,500)} : {};
  return {projects:arr('projects'),modules:arr('modules'),decisions:arr('decisions'),automation:arr('automation'),agenda:arr('agenda'),financial,meta,user:{displayName:'Leandro'}};
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const session = await requireMasterAuth(req, res);
  if (!session || session.sub !== MASTER) return;
  const fileId = String(process.env.DASHBOARD_DATA_FILE_ID || '').trim();
  if (!ID_RE.test(fileId)) return res.status(503).json({ error: 'DASHBOARD_DATA_CONFIG' });
  try {
    const token = await getGoogleDriveAccessToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) return res.status(503).json({ error: 'DASHBOARD_DATA_UNAVAILABLE' });
    return res.status(200).json(sanitizeDashboardData(await response.json()));
  } catch { return res.status(503).json({ error: 'DASHBOARD_DATA_UNAVAILABLE' }); }
}

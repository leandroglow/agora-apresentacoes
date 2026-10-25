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

const text = (v, max = 500) => typeof v === 'string' ? v.slice(0, max) : (v === null ? null : undefined);
const number = (v) => v === null ? null : (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const safeUrl = (v) => { if (typeof v !== 'string') return v === null ? null : undefined; try { const u = new URL(v); return ['https:'].includes(u.protocol) && ['drive.google.com','docs.google.com','apresentacoes.agoracons.com.br','agora-apresentacoes.vercel.app','ha.agoracons.com.br'].includes(u.hostname) ? u.href : undefined; } catch { return undefined; } };
const item = (v, depth = 0) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const allowed = ['id','name','title','subtitle','status','owner','description','url','href','thumbUrl','count','total','value','amount','date','asOf','source','sourceUrl','progress','committed','invoiced','paid','projectId','category','items','agenda'];
  return Object.fromEntries(Object.entries(v).filter(([k]) => allowed.includes(k)).flatMap(([k,x]) => { const val = ['url','href','thumbUrl','sourceUrl'].includes(k) ? safeUrl(x) : (['items','agenda'].includes(k) && depth < 2 && Array.isArray(x) ? x.slice(0,100).map(y => item(y, depth + 1)) : (typeof x === 'string' ? text(x) : (['value','amount','count','total','progress','committed','invoiced','paid'].includes(k) ? number(x) : x))); return val === undefined ? [] : [[k,val]]; }));
};
export function sanitizeDashboardData(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const arr = (key) => Array.isArray(src[key]) ? src[key].map(item) : [];
  const financial = src.financial && typeof src.financial === 'object' ? {
    status: text(src.financial.status, 100), committed: number(src.financial.committed),
    invoiced: number(src.financial.invoiced), paid: number(src.financial.paid)
  } : { status: null, committed: null, invoiced: null, paid: null };
  const meta = src.meta && typeof src.meta === 'object' ? { asOf: text(src.meta.asOf, 80), sourcesCoverage: text(src.meta.sourcesCoverage, 500) } : {};
  return { projects: arr('projects'), modules: arr('modules'), decisions: arr('decisions'), automation: arr('automation'), agenda: arr('agenda'), financial, meta, user: { displayName: 'Leandro' } };
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

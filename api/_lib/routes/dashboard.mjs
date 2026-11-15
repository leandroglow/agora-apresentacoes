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
const readDriveJsonDefault = async (id, token) => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`RH source unavailable (${response.status})`);
  return response.json();
};
export async function loadRhForecast(raw, readDriveJson) {
  const pointer = record(raw?.rhForecast) ? raw.rhForecast : {};
  const fileId = String(pointer.rhForecastFileId || '').trim();
  if (!ID_RE.test(fileId)) return { error: 'RH_FORECAST_SOURCE_MISSING' };
  try {
    const base = await readDriveJson(fileId);
    const ledgerId = String(base?.adjustmentsFileId || '').trim();
    if (!ID_RE.test(ledgerId)) return { error: 'RH_LEDGER_SOURCE_MISSING' };
    const ledger = await readDriveJson(ledgerId);
    if (!record(base) || !record(ledger) || !Array.isArray(ledger.compensacoes) || !Array.isArray(ledger.adiantamentos)) throw Error('Invalid RH ledger');
    const adjustments = [];
    const seen = new Map();
    const add = (x, kind, status) => {
      if (!record(x) || !x.id || !x.pessoa_id || !/^\d{4}-\d{2}-\d{2}$/.test(x.pagamento || '') || number(x.valor) === null || x.valor < 0) throw Error('Invalid RH event');
      const id = String(x.id).trim();
      const a = { id, personId: String(x.pessoa_id), paymentDate: x.pagamento, amount: x.valor, status, kind,
        source: [x.origem, x.fonte, kind === 'advance' && x.aplicar_na_previsao === true && x.transferencia_comprovada !== true ? 'Desconto previsto autorizado; transferência ainda não comprovada.' : ''].filter(Boolean).join(' · ') };
      if (seen.has(id)) { if (JSON.stringify(seen.get(id)) !== JSON.stringify(a)) throw Error('Conflicting RH event'); return; }
      seen.set(id,a); adjustments.push(a);
    };
    for (const x of ledger.compensacoes) add(x, 'compensation', x?.liquidada === true ? 'settled' : x?.confirmada === true ? 'open' : 'planned');
    for (const x of ledger.adiantamentos) add(x, 'advance', x?.liquidada === true ? 'settled' : x?.aplicar_na_previsao === true || x?.transferencia_comprovada === true ? 'open' : 'planned');
    if(adjustments.length > 200) throw Error('RH ledger exceeds forecast limit');
    const dates=[base.asOf,ledger.atualizado_em].filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'')).sort();
    return { asOf: dates.at(-1), source: text(base.source, 800), sourceUrl: `https://drive.google.com/file/d/${ledgerId}/view`, groups: Array.isArray(base.groups) ? base.groups : [], events: Array.isArray(base.events) ? base.events : [], notes: Array.isArray(base.notes) ? base.notes : [], calendarNotes: Array.isArray(base.calendarNotes) ? base.calendarNotes : [], adjustments };
  } catch (error) { return { error: 'RH_FORECAST_UNAVAILABLE' }; }
}
function item(v, depth = 0) {
  if (!record(v)) return null;
  const out = {};
  for (const key of ['id','name','label','title','subtitle','status','owner','description','date','asOf','source','projectId','category','waitingFor','nextAction','priority']) {
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
  const w = record(src.workday) ? src.workday : {};
  const wm = record(w.meta) ? w.meta : {};
  const workday = {items:Array.isArray(w.items)?w.items.slice(0,200).map(x=>item(x)).filter(Boolean):[],meta:{asOf:text(wm.asOf,80),coverage:text(wm.coverage,1500),queueUpdatedAt:text(wm.queueUpdatedAt,80)}};
  const rf = record(src.rhForecast) ? src.rhForecast : {};
  const rows = (v, n=200) => Array.isArray(v) ? v.filter(record).slice(0,n) : [];
  const rhForecast = {
    error:text(rf.error,120), asOf:text(rf.asOf,20), source:text(rf.source,800), sourceUrl:safeUrl(rf.sourceUrl),
    groups:rows(rf.groups,20).map(g=>({id:text(g.id,80),label:text(g.label,200),anchor:text(g.anchor,20),
      people:rows(g.people,100).map(p=>({id:text(p.id,80),name:text(p.name,160),dailyLabor:number(p.dailyLabor),dailyCar:number(p.dailyCar)}))})),
    events:rows(rf.events).map(e=>({id:text(e.id,120),personId:text(e.personId,80),date:text(e.date,20),type:text(e.type,30),days:number(e.days),projectId:text(e.projectId,80),status:text(e.status,40),source:text(e.source,800)})),
    adjustments:rows(rf.adjustments).map(a=>({id:text(a.id,120),personId:text(a.personId,80),paymentDate:text(a.paymentDate,20),amount:number(a.amount),status:text(a.status,30),kind:text(a.kind,40),source:text(a.source,800)})),
    notes:Array.isArray(rf.notes)?rf.notes.slice(0,30).map(x=>text(x,1000)).filter(Boolean):[],
    calendarNotes:rows(rf.calendarNotes,30).map(n=>({date:text(n.date,20),text:text(n.text,800)}))
  };
  return {workday,rhForecast,projects:arr('projects'),modules:arr('modules'),decisions:arr('decisions'),automation:arr('automation'),agenda:arr('agenda'),financial,meta,user:{displayName:'Leandro'}};
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
    const raw = await response.json();
    const rhForecast = await loadRhForecast(raw, id => readDriveJsonDefault(id, token));
    return res.status(200).json(sanitizeDashboardData({ ...raw, rhForecast }));
  } catch { return res.status(503).json({ error: 'DASHBOARD_DATA_UNAVAILABLE' }); }
}

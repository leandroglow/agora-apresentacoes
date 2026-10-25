// Preserve public URLs while grouping lightweight endpoints into one function.
const handlers = {
  'access': () => import('./_lib/routes/access.mjs'),
  'cad-jobs': () => import('./_lib/routes/cad-jobs.mjs'),
  'cad-worker': () => import('./_lib/routes/cad-worker.mjs'),
  'health': () => import('./_lib/routes/health.mjs'),
  'login': () => import('./_lib/routes/login.mjs'),
  'drive-config': () => import('./_lib/routes/drive-config.mjs'),
  'system-config': () => import('./_lib/routes/system-config.mjs'),
};
export default async function handler(req,res) {
 const url=new URL(req.url,'https://agora.local');
 const name=url.searchParams.get('_route')||url.pathname.split('/').pop();
 if(!Object.hasOwn(handlers,name))return res.status(404).json({error:'Rota não encontrada.'});
 url.searchParams.delete('_route');req.url=`/api/${name}${url.search}`;
 return (await handlers[name]()).default(req,res);
}

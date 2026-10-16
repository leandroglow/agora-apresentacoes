import { setCors, handleOptions, json, readJsonBody } from '../http.mjs';
import { requireAuth } from '../auth.mjs';
import { create, get, queue } from '../cad-jobs.mjs';
import { children, roots, allowed, downloadPart, sendPart } from '../cad-drive.mjs';

function publicJob(j) {
  return { id: j.id, status: j.status, error: j.error, outputId: j.outputId, outputName: j.outputName,
    outputSize: j.outputSize, format: j.format, source: j.source, createdAt: j.createdAt };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const query = new URL(req.url, 'https://agora.local').searchParams;
    if (req.method === 'GET') {
      if (query.get('action') === 'roots') {
        return json(res, 200, { roots: (await roots()).map(x => ({ id: x.id || x.folderId, name: x.name || '' })) });
      }
      if (query.get('action') === 'folders') {
        const folder = query.get('folder');
        if (!folder) return json(res, 200, { folders: (await roots()).map(x => ({ id: x.id || x.folderId, name: x.name || '' })), files: [] });
        if (!(await allowed(folder))) return json(res, 403, { error: 'Pasta fora das raízes autorizadas.' });
        const files = await children(folder);
        return json(res, 200, {
          folders: files.filter(x => x.mimeType === 'application/vnd.google-apps.folder').map(({ id, name }) => ({ id, name })),
          files: files.filter(x => x.mimeType !== 'application/vnd.google-apps.folder').map(({ id, name, mimeType, modifiedTime, md5Checksum }) => ({ id, name, mimeType, modifiedTime, md5Checksum }))
        });
      }
      const job = await get(query.get('id'));
      if (!job || job.owner !== user.sub) return json(res, 404, { error: 'Job não localizado.' });
      if(query.get('action')==='result') {
        if(job.status!=='completed'||!(await allowed(job.outputId)))return json(res,404,{error:'Resultado indisponível.'});
        return sendPart(res,await downloadPart(job.outputId,Number(query.get('offset')||0)));
      }
      return json(res, 200, { job: publicJob(job) });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
    const body = readJsonBody(req);
    if (String(body.fileBase64 || '').length > 2800000) return json(res, 413, { error: 'Arquivo de entrada maior que o limite permitido.' });
    return json(res, 201, { job: publicJob(await create(body, user.sub)) });
  } catch (error) {
    return json(res, error.status || 502, { error: error.status === 403 ? 'Acesso não autorizado.' : error.status === 503 ? 'Serviço CAD indisponível.' : 'Não foi possível processar o job CAD.' });
  }
}

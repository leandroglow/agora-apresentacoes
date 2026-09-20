import { requireAuth } from './_lib/auth.mjs';
import { getGoogleDriveAccessToken } from './_lib/google.mjs';
import { handleOptions, json, readJsonBody, requireMethod, setCors } from './_lib/http.mjs';
import { getOpenAI } from './_lib/openai.mjs';
import { CatalogDrive, CatalogError } from './_lib/drive.mjs';
import { runCatalogAgent } from './_lib/agent.mjs';

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res) || !requireMethod(req, res, 'POST')) return;
  try {
    const session = requireAuth(req, res);
    if (!session) return;
    const body = readJsonBody(req);
    const question = String(body.question || '').trim();
    if (!question || question.length > 2000) return json(res, 400, { error: 'Envie uma pergunta com até 2.000 caracteres.' });
    const signal = AbortSignal.timeout(270000);
    const drive = new CatalogDrive({ token: await getGoogleDriveAccessToken(), signal });
    const result = await runCatalogAgent({ client: getOpenAI(), drive, question, history: body.history, signal });
    console.info('catalog_query', JSON.stringify({ requestId: result.requestId, model: result.model, toolCalls: result.toolCalls, sources: result.sources.length, tools: result.traces }));
    const { traces, ...publicResult } = result;
    return json(res, 200, { ...publicResult, user: session.sub, version: 'drive-direct-v2.1' });
  } catch (error) {
    // Never log provider payloads, headers, tokens, credentials or catalog contents.
    console.error('ask_error', JSON.stringify({ code: error.code || error.name, status: error.status || 502, requestId: error.request_id }));
    if (error instanceof SyntaxError) return json(res, 400, { error: 'A pergunta foi enviada em formato inválido.' });
    let message = 'Não foi possível concluir esta consulta. Tente novamente em instantes.';
    if (error instanceof CatalogError) message = error.message;
    else if (error.code === 'model_not_found') message = 'O modelo configurado não está disponível para esta chave. Revise OPENAI_MODEL na Vercel.';
    else if (error.status === 429) message = 'O serviço atingiu um limite de uso. Aguarde um pouco e confira o saldo da API se persistir.';
    else if (/timeout|abort/i.test(error.name || '')) message = 'A consulta demorou além do limite. Tente restringir o fornecedor ou o produto.';
    return json(res, error instanceof CatalogError ? error.status : 502, { error: message, code: error.code || 'CATALOG_ERROR' });
  }
}

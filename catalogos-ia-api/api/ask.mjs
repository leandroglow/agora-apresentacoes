import { requireAuth } from './_lib/auth.mjs';
import { handleOptions, json, readJsonBody, requireMethod, setCors } from './_lib/http.mjs';
import { extractSources, getOpenAI, getVectorStoreId } from './_lib/openai.mjs';

const INSTRUCTIONS = `Você é o Assistente de Catálogos da Ágora Materiais.
Responda em português brasileiro e use apenas informações recuperadas dos arquivos do acervo autorizado.
Nunca invente código, preço, medida, disponibilidade, compatibilidade, condição comercial ou validade.
Quando houver preço, promoção ou condição comercial, informe o fornecedor, o arquivo e a data/validade encontrada. Se a validade não estiver clara, diga explicitamente que o preço precisa ser confirmado.
Em comparações, separe os produtos e preserve códigos, zeros, hífens, unidades e variações.
Para Blumenau, respeite divergências, edição e página física quando disponíveis; atributo extraído automaticamente deve ser tratado como pista até confirmação pelo trecho-fonte.
Se a resposta não estiver sustentada pelo acervo, diga que não encontrou informação suficiente nos catálogos. Não complete com conhecimento geral.
Finalize com uma seção curta "Fontes consultadas" citando os nomes dos arquivos efetivamente usados.`;

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
    .slice(-8)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 2500) }));
}

export default async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res) || !requireMethod(req, res, 'POST')) return;
  const session = requireAuth(req, res);
  if (!session) return;
  try {
    const body = readJsonBody(req);
    const question = String(body.question || '').trim();
    if (!question || question.length > 2000) {
      return json(res, 400, { error: 'Envie uma pergunta com até 2.000 caracteres.' });
    }
    const input = [...cleanHistory(body.history), { role: 'user', content: question }];
    const response = await getOpenAI().responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      instructions: INSTRUCTIONS,
      input,
      tools: [{ type: 'file_search', vector_store_ids: [getVectorStoreId()], max_num_results: 10 }],
      include: ['file_search_call.results'],
      max_output_tokens: 1000
    });
    const answer = (response.output_text || '').trim();
    if (!answer) throw new Error('Resposta vazia do modelo.');
    return json(res, 200, {
      answer,
      sources: extractSources(response),
      requestId: response.id,
      user: session.sub
    });
  } catch (error) {
    console.error('ask_error', error.message);
    return json(res, 502, { error: 'Não foi possível consultar os catálogos agora.' });
  }
}

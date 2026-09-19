import OpenAI from 'openai';

let singleton;

export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada.');
  singleton ||= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return singleton;
}

export function getVectorStoreId() {
  const value = process.env.OPENAI_VECTOR_STORE_ID;
  if (!value) throw new Error('OPENAI_VECTOR_STORE_ID não configurado.');
  return value;
}

export function extractSources(response) {
  const sources = new Map();
  for (const item of response.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      for (const annotation of content.annotations || []) {
        if (annotation.type !== 'file_citation') continue;
        const key = annotation.file_id || annotation.filename;
        if (key) sources.set(key, {
          fileId: annotation.file_id,
          filename: annotation.filename || 'Catálogo consultado'
        });
      }
    }
  }
  return [...sources.values()];
}

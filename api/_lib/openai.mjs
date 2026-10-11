import OpenAI from 'openai';

let singleton;

export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada.');
  singleton ||= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return singleton;
}

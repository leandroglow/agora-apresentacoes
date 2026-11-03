import { requireInventoryAuth } from '../auth.mjs';
import { getOpenAI } from '../openai.mjs';
import engine from '../inventory-engine.cjs';

const ORIGIN = 'https://apresentacoes.agoracons.com.br';
const MAX_BODY = 8_000_000;
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Cache-Control', 'no-store');
}
function classify(raw, inventory) {
  const parsed = engine.parseList(raw, inventory);
  const items = parsed.rows.map(row => ({ ...row,
    candidateName: row.itemId ? inventory.items.find(i => i.id === row.itemId)?.name : row.description,
      category: row.itemId ? inventory.items.find(i => i.id === row.itemId)?.category : 'Outros'
  }));
  const ignored = parsed.ignored;
  return { items, ignored, intention: /\b(?:conex[aã]o\s+a\s+comprar|comprar|compra)\b/i.test(raw) ? 'purchase' : /\b(?:contagem|invent[aá]rio|confer[ií]do|temos)\b/i.test(raw) ? 'count' : 'unknown' };
}
function mapModelItems(result, inventory) {
  if (!Array.isArray(result?.items)) return [];
  return result.items.slice(0, 100).flatMap((x, index) => {
    if (!plain(x) || typeof x.description !== 'string' || x.description.length > 160 ||
        !Number.isFinite(x.quantity) || x.quantity < 0 || x.quantity > 1_000_000) return [];
    const item = inventory.items.find(i => i.id === x.itemId) || null;
    const unit = typeof x.unit === 'string' && engine.UNITS.includes(x.unit) ? x.unit : item?.unit || 'un';
    const conf = Number.isFinite(x.confidence) ? Math.min(1, Math.max(0, x.confidence)) : 0.5;
    return [{ id: `r${index+1}`, raw: text(x.raw, 240) || x.description, description: x.description.trim(), quantity: x.quantity,
      unit, itemId: item?.id || null, status: item && item.unit === unit && conf >= 0.8 ? 'ready' : 'needs_review',
      candidateName: item?.name || x.description.trim(), category: item?.category || text(x.category,80) || 'Outros',
      sourceContext: text(x.sourceContext,100) || null, confidence: conf }];
  });
}
async function readModel(input, inventory, mediaType) {
  const catalog = inventory.items.slice(0,500).map(item => ({id:item.id,name:item.name,aliases:item.aliases,unit:item.unit}));
  const result = await getOpenAI().chat.completions.create({ model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
    max_tokens: 3000, temperature: 0, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: 'Extraia somente materiais que o usuário pediu para comprar ou contar em lista/chat de obra. Retorne JSON {items:[{description,quantity,unit,itemId,category,sourceContext,confidence}],intention,warnings}. Preserve bitola no sourceContext e nome; preserve ângulos 45°/90° e medidas de rosca 1/2 ou 3/4. Ignore nomes de contato, horários e elementos de interface que não estejam claramente na região/contexto da lista de materiais. Um produto com unidade sacos é válido quando explicitamente ligado a material (ex.: cimento); não trate automaticamente essa unidade como ruído. Quantidade apenas quando ligada inequivocamente a material; se incerta omita e alerte. Associe itemId apenas escolhendo IDs do catálogo listado, ou null; jamais invente ID. Intenção purchase quando seção disser Conexão a comprar.' },
      { role:'user', content:mediaType==='image' ? [{ type:'text', text:`Reconheça a lista da imagem. Catálogo existente para associar, sem inventar: ${JSON.stringify(catalog)}. Responda JSON estruturado.` }, { type:'image_url', image_url:{url:input, detail:'high'} }] : `Extraia itens deste texto: ${input}\nCatálogo existente: ${JSON.stringify(catalog)}` }] });
  const content = result.choices?.[0]?.message?.content || '{}';
  if(result.choices?.[0]?.finish_reason==='length') return {items:[],intention:'unknown',warnings:['A resposta de reconhecimento excedeu o limite e foi interrompida. Reduza a lista ou divida a imagem antes de revisar.']};
  try { const parsed=JSON.parse(content); return plain(parsed)&&Array.isArray(parsed.items)?parsed:{items:[],intention:'unknown',warnings:['A IA retornou dados estruturados incompletos; nenhum item foi adicionado.']}; }
  catch { return {items:[],intention:'unknown',warnings:['Não foi possível validar a resposta da IA; nenhum item foi adicionado.']}; }
}
export function createInventoryRecognizeHandler({ authorize = null, vision = readModel } = {}) {
  return async function handler(req,res) {
    cors(req,res); if(req.method==='OPTIONS') return res.status(204).end();
    if(req.method!=='POST') { res.setHeader('Allow','POST, OPTIONS'); return res.status(405).json({error:'method_not_allowed'}); }
    const auth = authorize || requireInventoryAuth; if(!await auth(req,res)) return;
    try {
      const body = typeof req.body==='string' ? JSON.parse(req.body) : req.body;
      if (!plain(body) || Buffer.byteLength(JSON.stringify(body))>MAX_BODY || (!body.text && !body.image) || (body.text!==undefined && (typeof body.text!=='string'||body.text.length>100_000)) || (body.items!==undefined&&(!Array.isArray(body.items)||body.items.length>1000))) return res.status(400).json({error:'invalid_request'});
      const supplied=Array.isArray(body.items)?body.items:[];
      if(supplied.some(i=>!plain(i)||typeof i.id!=='string'||typeof i.name!=='string'||i.name.length>160||!engine.UNITS.includes(i.unit)||!Array.isArray(i.aliases||[])||Object.keys(i).some(k=>!['id','name','unit','aliases','category'].includes(k)))) return res.status(400).json({error:'invalid_catalog'});
      const state = engine.validateState({ ...engine.createEmpty(), items:supplied.map(i=>({id:i.id,name:i.name,aliases:i.aliases||[],unit:i.unit,code:'',category:text(i.category,80),photo:''})) });
      let result;
      if (body.image) {
        const image = text(body.image, MAX_BODY);
        if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length>6_000_000) return res.status(400).json({error:'invalid_image'});
        const visionResult = await vision(image, state, 'image');
        result = { items:mapModelItems(visionResult,state), intention:['purchase','count'].includes(visionResult.intention)?visionResult.intention:'unknown', warnings:Array.isArray(visionResult.warnings)?visionResult.warnings.slice(0,20).map(x=>text(x,240)):[] };
        if (!result.items.length) result.warnings.push('Nenhum item pôde ser identificado com confiança. Revise a imagem ou descreva os materiais.');
      } else {
        const inputText=text(body.text,100_000), parsed=classify(inputText,state);
        if(parsed.items.length===0 || parsed.items.some(x=>x.status==='unmatched') || parsed.ignored.length && parsed.items.length<2){
          const modelResult=await vision(inputText,state,'text');
          result={items:mapModelItems(modelResult,state),intention:['purchase','count'].includes(modelResult.intention)?modelResult.intention:parsed.intention,
            warnings:[...(Array.isArray(modelResult.warnings)?modelResult.warnings.slice(0,20).map(x=>text(x,240)):[]),...(parsed.ignored.length?['Algumas linhas não foram reconhecidas com segurança.']:[])]};
        } else result={items:parsed.items,intention:parsed.intention,warnings:parsed.ignored.length?['Algumas linhas foram ignoradas por não parecerem materiais com quantidade.']:[]};
      }
      const confidences=result.items.map(x=>x.confidence ?? (x.status==='ready'?0.98:0.65));
      return res.status(200).json({...result,sourceContext:body.image?'image':'text',confidence:confidences.length?Number((confidences.reduce((a,b)=>a+b,0)/confidences.length).toFixed(2)):0});
    } catch(error) {
      console.error('inventory_recognize_error',JSON.stringify({code:error.code||error.name,status:error.status}));
      return res.status(502).json({error:'recognition_unavailable',message:'Não foi possível reconhecer os materiais agora.'});
    }
  };
}
export default createInventoryRecognizeHandler();

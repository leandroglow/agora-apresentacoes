import engine from '../inventory-engine.cjs';
import { DriveInventoryStore, INVENTORY_MAX_BYTES, InventoryStoreError } from '../inventory-store.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = 'https://apresentacoes.agoracons.com.br';
const mutationIdOk = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` :
  plain(value) ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}` : JSON.stringify(value);
const mutationHash = input => createHash('sha256').update(stable({ action: input.action, baseRevision: input.baseRevision, etag: input.etag, state: input.state })).digest('hex');
const ERRORS = {
  payload_too_large: 'O inventário excede o limite de 3 MB.', invalid_request: 'A solicitação de gravação está incompleta ou inválida.',
  revision_conflict: 'O inventário foi alterado em outra sessão. Recarregue os dados antes de salvar.', mutation_id_reused: 'Este identificador de operação já foi usado com outros dados.',
  invalid_state: 'Os dados do inventário não passaram pela validação.', demo_state_rejected: 'Dados de demonstração não podem ser gravados no inventário compartilhado.',
  import_requires_empty_inventory: 'A importação só é permitida quando o inventário atual não tem itens nem movimentos.',
  import_history_must_start_at_zero: 'O histórico importado precisa começar com saldo zero e registrar a formação dos saldos.',
  movement_history_must_be_append_only: 'O histórico existente não pode ser alterado ou removido.', stock_item_cannot_be_deleted: 'Itens com saldo ou histórico não podem ser removidos.',
  balance_requires_movement: 'Cada saldo precisa estar respaldado por um movimento no histórico.', inventory_unavailable: 'Não foi possível acessar o inventário compartilhado. Tente novamente.',
  INVENTORY_DATA_CONFIG: 'A configuração do arquivo de dados do inventário está ausente ou inválida.',
  INVENTORY_DATA_NOT_FOUND: 'O arquivo de dados do inventário não foi encontrado no Drive.',
  INVENTORY_DATA_UNAVAILABLE: 'O Drive não respondeu ao ler ou salvar o inventário.', INVENTORY_DATA_INVALID: 'O arquivo de dados do inventário está inválido.',
  INVENTORY_DATA_TOO_LARGE: 'O arquivo de dados do inventário excede o limite de 3 MB.', INVENTORY_ETAG_UNAVAILABLE: 'O Drive não forneceu controle de versão para o inventário.',
  INVENTORY_ETAG_REQUIRED: 'A versão do inventário é necessária para salvar com segurança.'
};

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-Match');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
}

function bodyOf(req) {
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body) > INVENTORY_MAX_BYTES) return { tooLarge: true };
    try { return JSON.parse(req.body); } catch { return null; }
  }
  if (plain(req.body)) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > INVENTORY_MAX_BYTES) return { tooLarge: true };
    return req.body;
  }
  return null;
}

function envelopeOf(raw) {
  if (!raw || Object.keys(raw).length === 0) {
    const state = engine.createEmpty();
    state.updatedAt = '2000-01-01T00:00:00.000Z';
    return { version: 1, state, mutationIds: [], mutationHashes: {}, updatedBy: '' };
  }
  if (raw.version !== 1 || !plain(raw.state) || !Array.isArray(raw.mutationIds) || raw.mutationIds.length > 100 ||
      raw.mutationIds.some(x => !mutationIdOk(x)) || new Set(raw.mutationIds).size !== raw.mutationIds.length ||
      typeof raw.updatedBy !== 'string' || (raw.mutationHashes !== undefined && !plain(raw.mutationHashes))) throw new InventoryStoreError('INVENTORY_DATA_INVALID');
  const state = engine.validateState(raw.state);
  if (state.mode !== 'local') throw new InventoryStoreError('INVENTORY_DATA_INVALID');
  const mutationHashes = raw.mutationHashes || {};
  if (Object.keys(mutationHashes).some(id => !raw.mutationIds.includes(id) || !/^[a-f0-9]{64}$/.test(mutationHashes[id]))) throw new InventoryStoreError('INVENTORY_DATA_INVALID');
  return { version: 1, state, mutationIds: raw.mutationIds.slice(), mutationHashes, updatedBy: raw.updatedBy };
}

function stateConsistency(previous, next, action) {
  if (next.mode !== 'local') throw new Error('demo_state_rejected');
  if (action === 'import') {
    if (previous.items.length || previous.movements.length) throw Object.assign(new Error('import_requires_empty_inventory'), { status: 403 });
    const starts = new Map();
    for (const movement of next.movements) {
      const source = JSON.stringify([movement.itemId,movement.locationId,movement.bin]);
      if (!starts.has(source)) starts.set(source, movement.before);
      if (movement.type === 'transfer') {
        const destination = JSON.stringify([movement.itemId,movement.toLocationId,movement.toBin]);
        if (!starts.has(destination)) starts.set(destination, movement.toBefore);
      }
    }
    if ([...starts.values()].some(quantity => quantity !== 0)) throw new Error('import_history_must_start_at_zero');
  } else {
    if (next.movements.length < previous.movements.length ||
        JSON.stringify(next.movements.slice(0, previous.movements.length)) !== JSON.stringify(previous.movements)) {
      throw new Error('movement_history_must_be_append_only');
    }
    const protectedItems = new Set([
      ...previous.balances.map(x => x.itemId),
      ...previous.movements.map(x => x.itemId)
    ]);
    if ([...protectedItems].some(id => !next.items.some(item => item.id === id))) throw new Error('stock_item_cannot_be_deleted');
  }
  // Every stored quantity must be explained by a movement chain. The engine
  // checks chain arithmetic and final quantities for keys that have history.
  const keys = new Set(next.movements.flatMap(m => [
    JSON.stringify([m.itemId,m.locationId,m.bin]),
    ...(m.type === 'transfer' ? [JSON.stringify([m.itemId,m.toLocationId,m.toBin])] : [])
  ]));
  if (next.balances.some(b => !keys.has(JSON.stringify([b.itemId,b.locationId,b.bin])))) throw new Error('balance_requires_movement');
}

export function createInventoryHandler({ authorize = null, store = null } = {}) {
  return async function inventoryHandler(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!['GET','PUT'].includes(req.method)) { res.setHeader('Allow', 'GET, PUT, OPTIONS'); return res.status(405).json({ error: 'method_not_allowed' }); }
    const auth = authorize || (await import('../auth.mjs')).requireMasterAuth;
    const session = await auth(req, res);
    if (!session) return;
    try {
      const storage = store || new DriveInventoryStore();
      const loaded = await storage.get();
      const envelope = envelopeOf(loaded.envelope);
      res.setHeader('ETag', loaded.etag);
      if (req.method === 'GET') return res.status(200).json({ state: envelope.state, etag: loaded.etag });

      const input = bodyOf(req);
      if (input?.tooLarge) return res.status(413).json({ code: 'payload_too_large', error: ERRORS.payload_too_large });
      if (!plain(input) || !plain(input.state) || !Number.isSafeInteger(input.baseRevision) ||
          typeof input.etag !== 'string' || !input.etag || !mutationIdOk(input.mutationId) ||
          !['save','import'].includes(input.action)) return res.status(400).json({ code: 'invalid_request', error: ERRORS.invalid_request });
      const requestHash = mutationHash(input);
      if (envelope.mutationIds.includes(input.mutationId)) {
        if (!envelope.mutationHashes[input.mutationId] || envelope.mutationHashes[input.mutationId] !== requestHash) return res.status(409).json({ code: 'mutation_id_reused', error: ERRORS.mutation_id_reused });
        return res.status(200).json({ state: envelope.state, etag: loaded.etag, duplicate: true });
      }
      if (input.baseRevision !== envelope.state.revision || input.etag !== loaded.etag) return res.status(409).json({ code: 'revision_conflict', error: ERRORS.revision_conflict, state: envelope.state, etag: loaded.etag });

      let next;
      try { next = engine.validateState(input.state); }
      catch { return res.status(400).json({ code: 'invalid_state', error: ERRORS.invalid_state }); }
      if (input.action === 'import' && envelope.state.drafts.length) {
        const byId = new Map(next.drafts.map(d => [d.id, d]));
        for (const draft of envelope.state.drafts) {
          if (byId.has(draft.id) && stable(byId.get(draft.id)) !== stable(draft)) return res.status(400).json({ code: 'draft_id_conflict', error: 'A importação conflita com um rascunho local existente.' });
          byId.set(draft.id, draft);
        }
        next.drafts = [...byId.values()];
        try { next = engine.validateState(next); }
        catch { return res.status(400).json({ code: 'invalid_state', error: ERRORS.invalid_state }); }
      }
      try { stateConsistency(envelope.state, next, input.action); }
      catch (error) { return res.status(error.status || 400).json({ code: error.message, error: ERRORS[error.message] || 'O estado enviado não é compatível com o inventário atual.' }); }
      next.revision = envelope.state.revision + 1;
      next.updatedAt = new Date().toISOString();
      next.mode = 'local';
      next.settings.actor = session.sub;
      for (const movement of next.movements.slice(envelope.state.movements.length)) movement.actor = session.sub;
      next = engine.validateState(next);
      const ids = [...envelope.mutationIds, input.mutationId].slice(-100);
      const hashes = { ...envelope.mutationHashes, [input.mutationId]: requestHash };
      for (const id of Object.keys(hashes)) if (!ids.includes(id)) delete hashes[id];
      const updated = { version: 1, state: next, mutationIds: ids, mutationHashes: hashes, updatedBy: session.sub };
      const result = await storage.put(updated, loaded.etag);
      if (result.conflict) return res.status(409).json({ code: 'revision_conflict', error: ERRORS.revision_conflict });
      let finalEtag = result.etag;
      if (!finalEtag || result.readbackRequired) {
        const readback = await storage.get();
        const confirmed = envelopeOf(readback.envelope);
        if (!confirmed.mutationIds.includes(input.mutationId) || confirmed.mutationHashes[input.mutationId] !== requestHash ||
            stable(confirmed.state) !== stable(next)) return res.status(409).json({ code: 'revision_conflict', error: ERRORS.revision_conflict });
        finalEtag = readback.etag;
      }
      if (!finalEtag) return res.status(503).json({ code: 'INVENTORY_ETAG_UNAVAILABLE', error: ERRORS.INVENTORY_ETAG_UNAVAILABLE });
      res.setHeader('ETag', finalEtag);
      return res.status(200).json({ state: next, etag: finalEtag, duplicate: false });
    } catch (error) {
      const status = Number(error?.status) || 503;
      const code = error?.code || 'inventory_unavailable';
      return res.status(status).json({ code, error: ERRORS[code] || ERRORS.inventory_unavailable });
    }
  };
}

export default createInventoryHandler();

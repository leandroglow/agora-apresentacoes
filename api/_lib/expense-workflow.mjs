const STEPS = ['recebido', 'lido', 'identificado', 'destinado', 'lancado', 'conferido'];
const LIMIT = { actor: 200, reason: 1000, evidence: 50, text: 1000 };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function fail(code, message, details = {}) { return { ok: false, error: { code, message, ...details } }; }
function str(v, max, field) {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw Object.assign(Error(`Invalid ${field}`), { code: 'INVALID_INPUT', field });
  return v.trim();
}
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function validProjectCode(v) { return typeof v === 'string' && /^\d{3}$/.test(v); }
function evidenceList(v) {
  if (!Array.isArray(v) || v.length > LIMIT.evidence) throw Object.assign(Error('Invalid evidence'), { code: 'INVALID_EVIDENCE' });
  return v.map((x, i) => {
    if (!plain(x)) throw Object.assign(Error('Invalid evidence'), { code: 'INVALID_EVIDENCE', index: i });
    const type = str(x.tipo, 40, 'tipo'), id = str(String(x.id ?? ''), 200, 'id');
    const out = { tipo: type, id };
    if (x.url !== undefined) {
      let u; try { u = new URL(x.url); } catch { throw Object.assign(Error('Invalid URL'), { code: 'INVALID_URL' }); }
      if (u.protocol !== 'https:' || u.username || u.password || !['docs.google.com', 'drive.google.com'].includes(u.hostname)) throw Object.assign(Error('URL host not allowed'), { code: 'INVALID_URL' });
      out.url = u.href;
    }
    return out;
  });
}

/** Pure workflow contract. initializeExpenseWorkflow(record) returns normalized state or {ok:false,error}; updateExpenseWorkflow(state, action) atomically returns {ok:true,state} or a structured error. Actions are {type:'step',step,actor,evidence?,fields?}, {type:'link',documentType,documentId,actor}, {type:'block',reason,actor}, or {type:'resume',actor,reason?}. No function performs I/O or changes expense totals. */
export function initializeExpenseWorkflow(record = {}) {
  try {
    if (!plain(record)) return fail('INVALID_INPUT', 'Registro deve ser objeto.');
    const previous = plain(record.acompanhamento_documental) ? record.acompanhamento_documental : {};
    const steps = {};
    for (const name of STEPS) {
      const old = plain(previous.etapas) && plain(previous.etapas[name]) ? previous.etapas[name] : null;
      steps[name] = old && old.concluida === true ? { concluida: true, em: typeof old.em === 'string' ? old.em : null, por: typeof old.por === 'string' ? old.por : null, evidencias: evidenceList(old.evidencias || []) } : { concluida: false, em: null, por: null, evidencias: [] };
    }
    const docs = Array.isArray(previous.documentos) ? previous.documentos : [];
    if (docs.length > LIMIT.evidence) return fail('INVALID_INPUT', 'Limite de documentos excedido.');
    const documentos = docs.map(d => ({ tipo: str(d.tipo, 40, 'tipo'), id: str(String(d.id ?? ''), 200, 'id') }));
    const historico = Array.isArray(previous.historico) ? previous.historico.slice(0, 500).map(e => ({ ...e })) : [];
    return { ok: true, state: { versao: 1, etapas: steps, documentos, historico, bloqueio: previous.bloqueio?.ativo === true ? { ativo: true, motivo: str(previous.bloqueio.motivo, LIMIT.reason, 'motivo'), em: previous.bloqueio.em || null, por: previous.bloqueio.por || null } : { ativo: false, motivo: null, em: null, por: null } } };
  } catch (e) { return fail(e.code || 'INVALID_INPUT', 'Acompanhamento inválido.', { field: e.field }); }
}

/** Suggestions only: exact photo_drive_id or expense id matches; amount/vendor/date can rank candidates but never establish a duplicate. */
export function suggestExpenseDuplicates(record, candidates = []) {
  if (!plain(record) || !Array.isArray(candidates)) return fail('INVALID_INPUT', 'Registros inválidos.');
  const matches = [];
  for (const c of candidates) {
    if (!plain(c) || c.id === record.id) continue;
    const keys = [];
    if (record.foto_drive_id && c.foto_drive_id === record.foto_drive_id) keys.push('foto_drive_id');
    if (record.id != null && String(c.id) === String(record.id)) keys.push('id');
    if (keys.length) matches.push({ id: c.id, motivos: keys });
  }
  return { ok: true, suggestions: matches };
}

/** Applies one audited workflow action immutably. Required predecessor steps, proof links, critical-field invalidation, block/resume history, and input checks are enforced before returning a new state. */
export function updateExpenseWorkflow(state, action, options = {}) {
  if (!plain(state) || !plain(action)) return fail('INVALID_INPUT', 'Estado e ação devem ser objetos.');
  const normalized = initializeExpenseWorkflow({ acompanhamento_documental: state });
  if (!normalized.ok) return normalized;
  const s = normalized.state;
  if(s.historico.length>=500) return fail('HISTORY_FULL','Arquive a auditoria antes de continuar.');
  try {
    const actor = str(action.actor, LIMIT.actor, 'actor');
    const now = typeof options.now === 'string' ? options.now : new Date().toISOString();
    const addEvent = (type, data = {}) => s.historico.push({ tipo: type, em: now, por: actor, ...data });
    if (action.type === 'block') {
      if (s.bloqueio.ativo) return fail('ALREADY_BLOCKED', 'Acompanhamento já está bloqueado.');
      const reason = str(action.reason, LIMIT.reason, 'reason'); s.bloqueio = { ativo: true, motivo: reason, em: now, por: actor }; addEvent('bloqueado', { motivo: reason });
    } else if (action.type === 'resume') {
      if (!s.bloqueio.ativo) return fail('NOT_BLOCKED', 'Acompanhamento não está bloqueado.');
      const reason = action.reason === undefined ? null : str(action.reason, LIMIT.reason, 'reason'); s.bloqueio = { ativo: false, motivo: null, em: null, por: null }; addEvent('retomado', { motivo: reason });
    } else {
      if (s.bloqueio.ativo) return fail('BLOCKED', 'Acompanhamento bloqueado.');
      if (action.type === 'edit') {
        if (!plain(action.fields) || !Object.keys(action.fields).length) return fail('INVALID_INPUT', 'Campos de edição são obrigatórios.');
        const fields = action.fields;
        for (const [k, v] of Object.entries(fields)) if (typeof v === 'string' && v.length > LIMIT.text) return fail('FIELD_TOO_LONG', 'Campo excede o limite.', { field: k });
        if (fields.codigo_projeto !== undefined && !validProjectCode(fields.codigo_projeto)) return fail('INVALID_PROJECT_CODE', 'Código de projeto deve conter três dígitos.');
        const critical = ['obra', 'codigo_projeto', 'fornecedor', 'valor_total', 'data', 'tipo'];
        const changed = Object.keys(fields).filter(k => critical.includes(k));
        if (changed.length && s.etapas.conferido.concluida) {
          for (const later of ['destinado', 'lancado', 'conferido']) s.etapas[later] = { concluida: false, em: null, por: null, evidencias: [] };
          addEvent('etapas_invalidadas', { etapas: ['destinado', 'lancado', 'conferido'], campos: changed });
        }
        addEvent('campos_atualizados', { campos: fields });
      } else if (action.type === 'link') {
        const tipo = str(action.documentType, 40, 'documentType'), id = str(String(action.documentId ?? ''), 200, 'documentId');
        if(s.documentos.length>=LIMIT.evidence) return fail('DOCUMENT_LIMIT','Limite de documentos atingido.');
        if (!s.documentos.some(d => d.tipo === tipo && d.id === id)) s.documentos.push({ tipo, id });
        addEvent('documento_vinculado', { documento: { tipo, id } });
      } else if (action.type === 'step') {
        const i = STEPS.indexOf(action.step);
        if (i < 0) return fail('UNKNOWN_STEP', 'Etapa desconhecida.');
        if (s.etapas[action.step].concluida) return fail('ALREADY_COMPLETE', 'Etapa já concluída.');
        if (i && !s.etapas[STEPS[i - 1]].concluida) return fail('OUT_OF_ORDER', 'Etapas anteriores são obrigatórias.', { required: STEPS[i - 1] });
        const evidence = evidenceList(action.evidence || []);
        const fields = plain(action.fields) ? action.fields : {};
        if (action.step === 'destinado' && !evidence.length && !s.documentos.some(d => /destin|obra|projeto/i.test(d.tipo))) return fail('DESTINATION_EVIDENCE_REQUIRED', 'Vincule evidência de destino.');
        if (action.step === 'lancado' && !evidence.length && !s.documentos.some(d => /lanc|finance|contabil/i.test(d.tipo))) return fail('POSTING_EVIDENCE_REQUIRED', 'Vincule evidência do lançamento.');
        if (action.step === 'conferido' && (!s.etapas.lancado.concluida || !s.etapas.lido.concluida)) return fail('REVIEW_REQUIRED', 'Lançamento e leitura são necessários para conferência.');
        if (fields.codigo_projeto !== undefined && !validProjectCode(fields.codigo_projeto)) return fail('INVALID_PROJECT_CODE', 'Código de projeto deve conter três dígitos.');
        for (const [k, v] of Object.entries(fields)) if (typeof v === 'string' && v.length > LIMIT.text) return fail('FIELD_TOO_LONG', 'Campo excede o limite.', { field: k });
        const invalidates = ['obra', 'codigo_projeto', 'fornecedor', 'valor_total', 'data', 'tipo'];
        const editedCritical = Object.keys(fields).some(k => invalidates.includes(k));
        if (editedCritical) return fail('USE_EDIT_ACTION', 'Atualize campos pela ação edit.');
        s.etapas[action.step] = { concluida: true, em: now, por: actor, evidencias: evidence };
        addEvent('etapa_concluida', { etapa: action.step, evidencias: evidence, campos: fields });
      } else return fail('UNKNOWN_ACTION', 'Ação desconhecida.');
    }
    return { ok: true, state: s };
  } catch (e) { return fail(e.code || 'INVALID_INPUT', 'Entrada inválida.', { field: e.field }); }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeExpenseWorkflow, updateExpenseWorkflow, suggestExpenseDuplicates } from '../api/_lib/expense-workflow.mjs';

const actor = 'auditor', now = '2026-11-09T12:00:00.000Z';
const apply = (state, action) => updateExpenseWorkflow(state, { actor, ...action }, { now });
const step = (state, name, evidence = []) => apply(state, { type: 'step', step: name, evidence });
function fullyRead() {
  let s = initializeExpenseWorkflow({ id: 1 }).state;
  for (const name of ['recebido', 'lido', 'identificado']) s = step(s, name).state;
  return s;
}

test('legacy and new records normalize without treating analysis as posting', () => {
  const old = initializeExpenseWorkflow({ id: 1 });
  assert.equal(old.ok, true); assert.equal(old.state.etapas.lancado.concluida, false);
  const created = initializeExpenseWorkflow({ acompanhamento_documental: { etapas: { recebido: { concluida: true, evidencias: [] } } } });
  assert.equal(created.state.etapas.recebido.concluida, true); assert.equal(created.state.etapas.lancado.concluida, false);
});

test('rejects out of order and missing destination/posting evidence transactionally', () => {
  const start = initializeExpenseWorkflow({}).state;
  const bad = step(start, 'lido'); assert.equal(bad.error.code, 'OUT_OF_ORDER'); assert.equal(start.etapas.lido.concluida, false);
  let s = fullyRead(); s = step(s, 'destinado', [{ tipo: 'obra', id: '008' }]).state;
  const posting = step(s, 'lancado'); assert.equal(posting.error.code, 'POSTING_EVIDENCE_REQUIRED'); assert.equal(s.etapas.lancado.concluida, false);
  const destination = step(fullyRead(), 'destinado'); assert.equal(destination.error.code, 'DESTINATION_EVIDENCE_REQUIRED');
});

test('requires destination and posting proofs before review; review re-read is explicit', () => {
  let s = fullyRead();
  s = step(s, 'destinado', [{ tipo: 'projeto', id: 'obra-008' }]).state;
  s = step(s, 'lancado', [{ tipo: 'lancamento', id: 'conta-77' }]).state;
  s = step(s, 'conferido').state; assert.equal(s.etapas.conferido.concluida, true);
  const changed = step(s, 'lancado'); assert.equal(changed.error.code, 'ALREADY_COMPLETE');
});

test('critical edit after review invalidates later stages and keeps audit trail', () => {
  let s = fullyRead(); s = step(s, 'destinado', [{ tipo: 'obra', id: '008' }]).state;
  s = step(s, 'lancado', [{ tipo: 'financeiro', id: 'L-1' }]).state; s = step(s, 'conferido').state;
  const out = apply(s, { type: 'edit', fields: { codigo_projeto: '008' } });
  assert.equal(out.ok, true); assert.equal(out.state.etapas.conferido.concluida, false);
  assert.equal(out.state.etapas.destinado.concluida, false); assert.equal(out.state.etapas.lancado.concluida, false);
  assert.ok(out.state.historico.some(e => e.tipo === 'etapas_invalidadas'));
});

test('block and resume preserve historical events', () => {
  let s = fullyRead(); s = apply(s, { type: 'block', reason: 'Aguardando documento' }).state;
  assert.equal(step(s, 'destinado').error.code, 'BLOCKED');
  s = apply(s, { type: 'resume' }).state; assert.equal(s.bloqueio.ativo, false);
  assert.deepEqual(s.historico.map(e => e.tipo), ['etapa_concluida', 'etapa_concluida', 'etapa_concluida', 'bloqueado', 'retomado']);
});

test('duplicates use exact photo or id only; financial similarity never blocks legitimate purchases', () => {
  const result = suggestExpenseDuplicates({ id: 10, foto_drive_id: 'same', valor_total: 50 }, [
    { id: 11, foto_drive_id: 'same', valor_total: 50 }, { id: 10, foto_drive_id: 'different' }, { id: 12, foto_drive_id: 'other', valor_total: 50 }
  ]);
  assert.deepEqual(result.suggestions, [{ id: 11, motivos: ['foto_drive_id'] }]);
});

test('validates project codes, URL hosts, expected URL fields and bounded inputs', () => {
  let s = fullyRead();
  assert.equal(apply(s, { type: 'step', step: 'destinado', fields: { codigo_projeto: '002' }, evidence: [{ tipo: 'destino', id: 'x', url: 'https://evil.example/x' }] }).error.code, 'INVALID_URL');
  assert.equal(apply(s, { type: 'step', step: 'destinado', fields: { codigo_projeto: 'obra-008' }, evidence: [{ tipo: 'destino', id: '008' }] }).error.code, 'INVALID_PROJECT_CODE');
  assert.equal(apply(s, { type: 'block', reason: 'x'.repeat(1001) }).error.code, 'INVALID_INPUT');
  assert.equal(apply(s, { type: 'step', step: 'destinado', evidence: [{ tipo: 'destino', id: '008', url: 'https://drive.google.com/file/d/abc' }] }).ok, true);
});

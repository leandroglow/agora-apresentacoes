(() => {
  'use strict';
  const STEPS = [
    ['recebido', 'Recebido'], ['lido', 'Lido'], ['identificado', 'Identificado'],
    ['destinado', 'Destinado'], ['lancado', 'Lançado no controle'], ['conferido', 'Conferido']
  ];
  const safeUrl = value => {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && ['drive.google.com', 'docs.google.com'].includes(u.hostname) ? u.href : null; }
    catch { return null; }
  };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

  let activeDialog = null, generation = 0;
  window.AgoraExpenseWorkflow = { clear() { generation++; const dialog = activeDialog; activeDialog = null; if (dialog) { if (dialog.open) dialog.close(); dialog.remove(); } }, open(record, api, reload) {
    if (!record || record.id == null || typeof api !== 'function') return;
    this.clear();
    const myGeneration = generation;
    const dialog = el('dialog', 'ew-dialog'); dialog.setAttribute('aria-labelledby', 'ew-title');
    const shell = el('div', 'ew-shell'), header = el('header', 'ew-header');
    const heading = el('h2', '', `Acompanhamento documental · ${record.id}`); heading.id = 'ew-title';
    const close = el('button', 'ew-close', 'Fechar ×'); close.type = 'button'; close.setAttribute('aria-label', 'Fechar acompanhamento');
    header.append(heading, close);
    const body = el('div', 'ew-body'), status = el('p', 'ew-status'), content = el('div', 'ew-content');
    body.append(status, content); shell.append(header, body); dialog.append(shell); document.body.append(dialog);
    let current = null, etag = null, canManage = false, formValues = null, busy = false;
    const setStatus = (message, kind = '') => { status.textContent = message; status.className = `ew-status ${kind}`; };
    const isCurrent = () => generation === myGeneration && activeDialog === dialog && dialog.open;
    const closeDialog = () => { if (activeDialog === dialog) { generation++; activeDialog = null; } if (dialog.open) dialog.close(); dialog.remove(); };
    close.addEventListener('click', closeDialog);
    dialog.addEventListener('cancel', e => { e.preventDefault(); closeDialog(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });
    const button = (label, fn, cls = '') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
    const field = (label, name, type = 'text', value = '') => {
      const wrap = el('label', 'ew-field'), title = el('span', '', label), input = el(type === 'textarea' ? 'textarea' : 'input', '');
      if (type !== 'textarea') input.type = type; input.name = name; input.value = value || ''; wrap.append(title, input); return wrap;
    };
    const snapshotForm = () => { const f = content.querySelector('form'); if (!f) return null; return Object.fromEntries(new FormData(f).entries()); };
    const render = payload => {
      current = payload.record; etag = payload.etag; canManage = payload.canManage === true; content.replaceChildren();
      const wf = current.acompanhamento_documental || {};
      const etapas = wf.etapas || {};
      const stateText = wf.bloqueio?.ativo ? 'Bloqueado' : STEPS.every(([k]) => etapas[k]?.concluida) ? 'Concluído' : 'Em andamento';
      const state = el('div', `ew-state ${wf.bloqueio?.ativo ? 'is-blocked' : ''}`);
      state.append(el('strong', '', `Status: ${stateText}`));
      if (wf.bloqueio?.ativo) state.append(el('p', 'ew-blocker', `Motivo: ${wf.bloqueio.motivo || 'Não informado'}`));
      content.append(state);
      const steps = el('ol', 'ew-steps');
      for (const [key, title] of STEPS) {
        const done = etapas[key]?.concluida === true, li = el('li', done ? 'is-done' : '', `${done ? '✓' : '○'} ${title}`);
        if (done && etapas[key].em) li.append(el('time', '', new Date(etapas[key].em).toLocaleString())); steps.append(li);
      }
      content.append(steps);
      content.append(el('p', 'ew-disclaimer', '“Lançado no controle” é uma atestação manual de que o lançamento já foi realizado; este acompanhamento não executa lançamento financeiro. Leitura e conferência também são atestadas manualmente pelo Master.'));
      const docs = el('section', 'ew-section'), docsTitle = el('h3', '', 'Documentos vinculados'); docs.append(docsTitle);
      const documentLinks = Array.isArray(wf.documentos) ? wf.documentos : [];
      const allEvidence = [...documentLinks.map(d => ({ ...d, label: d.tipo })), ...STEPS.flatMap(([key]) => (etapas[key]?.evidencias || []).map(d => ({ ...d, label: `${key}: ${d.tipo}` })))];
      const photoUrl = current.foto_drive_id ? safeUrl(`https://drive.google.com/open?id=${encodeURIComponent(current.foto_drive_id)}`) : null;
      if (photoUrl) { const row = el('p', 'ew-document', 'Foto original do comprovante · '); const a = el('a', '', 'Abrir no Drive'); a.href = photoUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; row.append(a); docs.append(row); }
      if (!allEvidence.length) docs.append(el('p', 'ew-muted', 'Nenhum documento vinculado.'));
      for (const d of allEvidence) {
        const row = el('p', 'ew-document', `${d.label || d.tipo} · ${d.id || ''}`), href = safeUrl(d.url);
        if (href) { const a = el('a', '', 'Abrir documento'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; row.append(' ', a); }
        docs.append(row);
      }
      content.append(docs);
      const duplicates = Array.isArray(payload.duplicates) ? payload.duplicates : [];
      const alerts = el('section', duplicates.length ? 'ew-section ew-alert' : 'ew-section'); alerts.append(el('h3', '', 'Possíveis duplicidades'));
      alerts.append(el('p', 'ew-muted', duplicates.length ? 'Sugestões para revisão; não bloqueiam o registro.' : 'Nenhuma sugestão encontrada.'));
      for (const d of duplicates) alerts.append(el('p', '', `Registro ${d.id} · ${(d.motivos || []).join(', ')}`)); content.append(alerts);
      const history = el('section', 'ew-section'); history.append(el('h3', '', 'Histórico'));
      const events = Array.isArray(wf.historico) ? [...wf.historico].reverse() : [];
      if (!events.length) history.append(el('p', 'ew-muted', 'Sem eventos registrados.'));
      for (const ev of events) history.append(el('p', 'ew-event', `${ev.em ? new Date(ev.em).toLocaleString() + ' · ' : ''}${ev.por || 'Sistema'} · ${ev.tipo || 'Evento'}${ev.etapa ? ` · ${ev.etapa}` : ''}${ev.motivo ? ` · ${ev.motivo}` : ''}`)); content.append(history);
      if (!canManage) { content.append(el('p', 'ew-muted', 'Somente Master pode alterar o acompanhamento.')); return; }
      if (wf.bloqueio?.ativo) { content.append(button('Retomar acompanhamento', () => mutate('resume', { reason: 'Nova tentativa' }), 'ew-primary')); }
      else {
        const next = STEPS.find(([k]) => !etapas[k]?.concluida);
        if (next) {
          const [key, label] = next, form = el('form', 'ew-form'); form.noValidate = true; form.append(el('h3', '', `Avançar: ${label}`));
          if (key === 'recebido') form.append(field('Nota de recebimento (manual)', 'observacao', 'textarea'));
          if (key === 'lido') {
            form.append(el('p', 'ew-human-attestation', 'Atestação manual do Master: examine o documento antes de confirmar a leitura. Nenhuma leitura automática é declarada.'));
            form.append(field('Método de leitura/conferência (obrigatório)', 'metodo'));
            form.append(field('Páginas examinadas (obrigatório)', 'paginas'));
          }
          if (['identificado', 'destinado', 'lancado', 'conferido'].includes(key)) form.append(field('Observação / atestação manual (obrigatória)', 'observacao', 'textarea'));
          if (key === 'identificado') form.append(field('Identificação encontrada', 'identificacao'));
          if (key === 'destinado') form.append(field('Projeto / destino', 'destino'));
          if (key === 'lancado') {
            form.append(el('p', 'ew-human-attestation', 'Ateste que o lançamento já foi realizado e informe a referência documental. O acompanhamento não executa o lançamento financeiro.'));
            form.append(field('Referência (linha, evento ou seção) — obrigatória', 'referencia'));
          }
          if (key === 'conferido') form.append(el('p', 'ew-human-attestation', 'Esta confirmação é uma atestação manual do Master. Não indica conferência automática.'));
          if (['destinado', 'lancado', 'conferido'].includes(key)) {
            form.append(field('URL da evidência (Drive ou Docs) — obrigatória', 'url', 'url'));
            form.append(field('Tipo de documento', 'documento_tipo'));
          }
          if (key === 'destinado') form.append(field('Método de identificação do destino (opcional)', 'metodo'));
          const submit = el('button', 'ew-primary', 'Registrar etapa'); submit.type = 'submit'; form.append(submit);
          form.addEventListener('submit', async e => { e.preventDefault(); const data = Object.fromEntries(new FormData(form).entries());
            if (key === 'lido' && (!data.metodo?.trim() || !data.paginas?.trim())) { setStatus('Informe o método e as páginas examinadas para atestar a leitura.', 'error'); return; }
            if (['identificado', 'destinado', 'lancado', 'conferido'].includes(key) && !data.observacao?.trim()) { setStatus('Preencha a observação exigida para esta etapa.', 'error'); return; }
            if (key === 'lancado' && !data.referencia?.trim()) { setStatus('Informe a referência da linha, evento ou seção.', 'error'); return; }
            if (['destinado', 'lancado', 'conferido'].includes(key) && !data.url?.trim()) { setStatus('Informe a URL da evidência documental.', 'error'); return; }
            if (data.url && !safeUrl(data.url)) { setStatus('URL recusada: use HTTPS de drive.google.com ou docs.google.com.', 'error'); return; }
            formValues = data;
            const evidence = ['destinado', 'lancado', 'conferido'].includes(key) ? [{ tipo: data.documento_tipo?.trim() || key, id: data.referencia?.trim() || data.destino?.trim() || data.paginas?.trim() || 'evidencia', url: safeUrl(data.url) }] : [];
            const fields = {};
            if (key === 'lido') { fields.metodo = data.metodo.trim(); fields.paginas = data.paginas.trim(); }
            if (['identificado', 'destinado', 'lancado', 'conferido'].includes(key)) fields.observacao = data.observacao.trim();
            if (key === 'lancado') fields.referencia = data.referencia.trim();
            if (key === 'recebido') fields.observacao = data.observacao.trim();
            if (key === 'destinado' && data.destino?.trim()) fields.destino = data.destino.trim();
            if (key === 'destinado' && data.metodo?.trim()) fields.metodo = data.metodo.trim();
            await mutate('step', { step: key, evidence, fields });
          }); content.append(form);
        }
        const blocker = el('form', 'ew-form'); blocker.append(el('h3', '', 'Bloquear acompanhamento')); blocker.append(field('Motivo do bloqueio', 'reason', 'textarea'));
        const b = el('button', '', 'Bloquear'); b.type = 'submit'; blocker.append(b);
        blocker.addEventListener('submit', e => { e.preventDefault(); formValues = Object.fromEntries(new FormData(blocker).entries()); if (!formValues.reason?.trim()) { setStatus('Informe o motivo do bloqueio.', 'error'); return; } mutate('block', { reason: formValues.reason }); }); content.append(blocker);
      }
    };
    const load = async (preserve = false) => {
      if (!isCurrent()) return;
      try { setStatus('Carregando acompanhamento…'); const data = await api({ action: 'workflow-read', id: record.id }); if (!isCurrent()) return; if (!data?.record) throw Error('Resposta workflow-read sem record.'); render(data); setStatus(''); if (preserve && formValues) { for (const [k, v] of Object.entries(formValues)) { const input = content.querySelector(`[name="${CSS.escape(k)}"]`); if (input) input.value = v; } } }
      catch (e) { if (isCurrent()) setStatus(e.message || 'Falha ao carregar acompanhamento.', 'error'); }
    };
    const mutate = async (operation, data) => {
      if (busy || !canManage || !isCurrent()) return; busy = true; setStatus('Salvando…');
      try { await api({ action: 'workflow', id: record.id, etag, operation: { ...data, type: operation } }); if (!isCurrent()) return; formValues = null; await load(false); if (isCurrent() && typeof reload === 'function') await reload(); }
      catch (e) { if (!isCurrent()) return; if (e.status === 409 || e.statusCode === 409 || e.code === 'ETAG_MISMATCH') { formValues = snapshotForm() || formValues; setStatus('O registro mudou no Drive. Recarregue para comparar; o formulário foi preservado.', 'conflict'); const actions = el('div', 'ew-actions'); actions.append(button('Recarregar e manter formulário', () => load(true))); content.prepend(actions); }
        else setStatus(e.message || 'Falha ao salvar a etapa.', 'error'); }
      finally { if (generation === myGeneration) busy = false; }
    };
    dialog.addEventListener('close', () => { if (activeDialog === dialog) { generation++; activeDialog = null; } dialog.remove(); }); activeDialog = dialog; dialog.showModal(); close.focus(); load();
  } };
})();

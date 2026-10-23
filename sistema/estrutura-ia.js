'use strict';
(() => {
  const icons = {
    coordinator: '<circle cx="12" cy="6" r="3"/><path d="M12 9v4M5 13h14M5 13v3M19 13v3"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/>',
    project: '<path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3h9v2"/><path d="m9 14 2 2 4-4"/>',
    review: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
    finance: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h2m4 0h2M8 15h2m4 0h2M8 18h2m4 0h2"/>',
    shopping: '<path d="M3 4h2l3 12h10l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v2"/>',
    legal: '<path d="M12 3v18M7 21h10M4 7h16M6 7l-4 8h8zm12 0-4 8h8z"/>',
    specialist: '<path d="m4 20 3-8L18 1l5 5-11 11-8 3zM7 12l5 5M15 4l5 5M3 4h5M3 8h2"/>',
    automation: '<path d="m3 11 9-8 9 8M5 10v11h14V10"/><path d="m13 10-4 6h4l-2 5 5-7h-4z"/>',
    web: '<rect x="2" y="3" width="20" height="16" rx="2"/><path d="M2 8h20M8 23h8M12 19v4M5 5.5h.1M8 5.5h.1M9 12l-3 2 3 2m6-4 3 2-3 2"/>',
    marketing: '<path d="m4 10 15-6v16L4 14zM4 10H2v4h2M6 15l2 7h4l-3-6M22 9v6"/>',
    video: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/>'
  };
  const agents = [
    {id:'coordenador', name:'Coordenador Ágora', profile:'agora-coordenador', group:'Coordenação central', icon:'coordinator', short:'Organiza prioridades, responsáveis e continuidade.', summary:'Transforma o pedido em trabalho coordenado, identifica quem deve executar e reúne as entregas em uma visão comum.', when:['Definir prioridades entre projetos e setores.','Dividir uma tarefa em etapas e acionar os perfis necessários.','Acompanhar pendências, decisões e próximos passos.'], outputs:['Responsável e escopo definidos para cada entrega.','Fila de trabalho e índice central de fatos vigentes atualizados.','Retorno consolidado, com evidências e impedimentos.'], method:'Skill de coordenação e protocolo operacional. A central referencia o contexto local, sem substituir os arquivos do responsável.', links:['gerente','revisor','financeiro','marketing']},
    {id:'gerente', name:'Gerente de Projeto', profile:'agora-gerente-projeto', group:'Apoio à coordenação', icon:'project', short:'Mantém contexto e continuidade de cada projeto.', summary:'Cuida de um projeto específico, usando suas fontes, decisões e memórias para orientar o trabalho.', when:['Retomar uma obra sem reconstruir todo o histórico.','Organizar documentos, fatos vigentes e pendências do projeto.','Integrar entregas de custos, compras, engenharia e mídia.'], outputs:['Contexto local do projeto mantido e rastreável.','Pendências com fonte, responsável e próximo passo.','Referências para atualização da central.'], method:'Instruções e memória do projeto. A organização de pastas e mídias segue a skill organizar-projetos-agora quando aplicável.', links:['coordenador','financeiro','compras','especialista']},
    {id:'revisor', name:'Revisor', profile:'agora-revisor', group:'Apoio à coordenação', icon:'review', short:'Confere evidências e qualidade da entrega.', summary:'Faz uma conferência independente do que foi entregue, em modo de leitura, sem modificar os projetos.', when:['Conferir se uma entrega cumpre o pedido.','Validar fontes, coerência e evidências de execução.','Identificar lacunas antes de considerar o trabalho concluído.'], outputs:['Parecer com verificações e limitações.','Divergências objetivas para o responsável corrigir.','Indicação do que está comprovado ou ainda pendente.'], method:'Perfil de revisão e critérios da tarefa. Quem executa continua responsável por corrigir e salvar a versão final.', links:['coordenador','gerente','especialista']},
    {id:'financeiro', name:'Financeiro de Obras', profile:'agora-financeiro-obras', group:'Operação e recursos', icon:'finance', short:'Documentos, custos e conciliação por obra.', summary:'Organiza os documentos financeiros e o custo da obra, distinguindo orçamento, compromisso, execução, faturamento e pagamento.', when:['Catalogar documentos novos ou modificados no financeiro.','Detalhar itens e relacionar notas, boletos e comprovantes.','Conferir lançamentos para evitar duplicidades.'], outputs:['Documentos identificados e vinculados por ID ou hash.','Planilha de custos e memória financeira atualizadas.','Pendências de alocação, vencimento ou comprovação.'], method:'Skill financeiro-custos-obras. Os originais são preservados. A pasta de Ágora Materiais tem tratativa própria; itens pessoais não viram custo de obra automaticamente.', links:['compras','rh','gerente','revisor']},
    {id:'compras', name:'Compras', profile:'agora-compras', group:'Operação e recursos', icon:'shopping', short:'Da necessidade ao recebimento do material.', summary:'Coordena solicitações, listas de materiais, cotações, pedidos autorizados e entregas, conectando fornecedores e obras.', when:['Preparar ou revisar uma lista de compra.','Comparar propostas e identificar o que falta confirmar.','Acompanhar entrega e destinação de materiais.'], outputs:['Lista de materiais e cotações comparáveis.','Situação do pedido e entrega registrada.','Referências da compra para o financeiro.'], method:'Skill compras-agora. Pedido, autorização, compra e recebimento são etapas distintas; uma cotação não comprova compra nem pagamento.', links:['financeiro','especialista','gerente']},
    {id:'rh', name:'Recursos Humanos', profile:'agora-rh', group:'Operação e recursos', icon:'people', short:'Equipe, diárias, ausências e pagamentos.', summary:'Organiza o trabalho da equipe e concilia registros de dias, faltas, adiantamentos e pagamentos com seus comprovantes.', when:['Atualizar dias trabalhados e a obra correta.','Conferir faltas, feriados, adiantamentos e pagamentos.','Resolver divergências entre registros e comprovantes.'], outputs:['Memória de RH com fatos confirmados e itens a confirmar.','Apuração de diárias e alocação por obra.','Conciliação com comprovantes de Ágora Materiais.'], method:'Skill rh-agora. Estimativas permanecem identificadas até confirmação; não se presume pagamento por previsão.', links:['financeiro','gerente','coordenador']},
    {id:'juridico', name:'Jurídico', profile:'agora-juridico', group:'Operação e recursos', icon:'legal', short:'Contratos, obrigações, prazos e riscos.', summary:'Analisa documentos e organiza as pendências jurídicas, destacando obrigações e pontos que pedem revisão profissional.', when:['Revisar contrato antes de uma assinatura.','Identificar renovação, fidelidade, multa ou obrigação adicional.','Organizar prazos, documentos e questões para negociação.'], outputs:['Análise dos pontos de atenção com fonte documental.','Lista de perguntas e ajustes sugeridos.','Memória jurídica com pendências e decisões.'], method:'Skill juridico-agora. A análise não equivale à assinatura ou aprovação jurídica definitiva do contrato.', links:['coordenador','compras','gerente']},
    {id:'especialista', name:'Especialista', profile:'agora-especialista', group:'Projetos e tecnologia', icon:'specialist', short:'Entrega técnica com escopo definido.', summary:'Produz uma entrega delimitada de engenharia, custos, documentos, mídia ou organização, conforme a necessidade do projeto.', when:['Executar uma etapa técnica com fontes e resultado definidos.','Preparar documentos, levantamentos ou análises.','Apoiar o projeto em uma especialidade sem perder o contexto.'], outputs:['Artefato ou análise no destino do projeto.','Critérios usados, fontes e limitações registradas.','Pendências técnicas encaminhadas para decisão.'], method:'Instruções do projeto e skills adequadas à tarefa. Hipóteses não são registradas como fatos; validações técnicas necessárias permanecem explícitas.', links:['gerente','compras','revisor']},
    {id:'automacao', name:'Automação', profile:'agora-automacao', group:'Projetos e tecnologia', icon:'automation', short:'Home Assistant, Tuya e controle por imóvel.', summary:'Mantém o conhecimento da automação dos imóveis e diagnostica a integração entre equipamentos, Smart Life/Tuya, Home Assistant e painéis.', when:['Investigar dispositivo ausente ou indisponível.','Integrar comandos e cenas já configurados.','Revisar o painel e a relação dos controles com cada imóvel.'], outputs:['Diagnóstico com estado comprovado e limitações.','Configuração e mapeamento por imóvel documentados.','Procedimento de recuperação reutilizável.'], method:'Skill automacao-agora. Home Assistant opera na VPS. Separar painéis por imóvel, por si só, não garante isolamento de acesso entre usuários.', links:['web','gerente','coordenador']},
    {id:'web', name:'Apresentações Web', profile:'agora-apresentacoes-web', group:'Projetos e tecnologia', icon:'web', short:'Sistema, apresentações e catálogo publicado.', summary:'Constrói e mantém apresentações HTML, páginas do sistema e o catálogo das publicações da Ágora.', when:['Atualizar uma apresentação ou painel existente.','Melhorar visualização de documentos e navegação.','Publicar uma alteração autorizada preservando os endereços usados.'], outputs:['Página revisada e testada em desktop e celular.','Publicação verificada no endereço de destino.','Fonte, versão e referências preservadas no Drive.'], method:'Perfil de publicações e instruções locais. O frontend está no GitHub Pages; serviços do sistema usam Vercel e Clerk. Uma publicação precisa ser verificada após o envio.', links:['automacao','marketing','revisor']},
    {id:'marketing', name:'Marketing', profile:'agora-marketing', group:'Comunicação e comercial', icon:'marketing', short:'Marca, campanhas, briefing e oportunidades.', summary:'Coordena as marcas, os briefings e a memória das campanhas, ligando o portfólio das obras à comunicação e ao acompanhamento comercial.', when:['Planejar conteúdos e posicionamento.','Preparar briefing com público, objetivo e materiais disponíveis.','Organizar oportunidades e próximos contatos comerciais.'], outputs:['Briefing e plano de conteúdo.','Memória de decisões da marca e referências aprovadas.','Controle comercial e pendências de acompanhamento.'], method:'Perfil de marketing, instruções locais e kits de marca. Publicação, envio de mensagens e uso de dados privados seguem a autorização de cada tarefa.', links:['video','web','coordenador']},
    {id:'video', name:'Editor de Vídeo', profile:'agora-editor-video', group:'Comunicação e comercial', icon:'video', short:'Roteiro, edição, voz, trilha e identidade.', summary:'Produz vídeos para os canais da Ágora a partir de um briefing, mídias verificadas e referências de edição aprovadas.', when:['Criar ou reeditar um vídeo curto.','Montar variações de um criativo com o kit da marca.','Preparar voz, legendas, trilha e acabamento.'], outputs:['Vídeo e materiais de produção no Drive.','Versões identificadas e referências de aprovação.','Memória do que funcionou para reaproveitamento.'], method:'Skill editor-de-video e ferramentas de mídia disponíveis. Respeitar o canal, os direitos de uso e a privacidade de clientes; produzir não significa publicar.', links:['marketing','web','gerente']}
  ];
  const groups = [
    {name:'Operação e recursos', desc:'Cuidar dos materiais, das pessoas e dos compromissos.', ids:['financeiro','compras','rh','juridico']},
    {name:'Projetos e tecnologia', desc:'Transformar contexto em entregas e sistemas.', ids:['especialista','automacao','web']},
    {name:'Comunicação e comercial', desc:'Dar visibilidade ao trabalho e apoiar as vendas.', ids:['marketing','video']}
  ];
  const workflows = [
    ['Pedido e contexto','Identificar o objetivo, o projeto, as fontes e as restrições. Separar o que foi confirmado do que precisa de resposta.'],
    ['Coordenação','Definir responsável, etapas e dependências. Consultar a memória antes de iniciar uma nova leitura ou análise.'],
    ['Execução','Acionar o perfil necessário, usar o método adequado e produzir a entrega no escopo autorizado.'],
    ['Conferência','Checar a entrega, as evidências e o destino. Usar revisão independente quando a tarefa justificar.'],
    ['Memória local','Salvar resultado e contexto no responsável local, com fonte, data e pendências. Preservar no Google Drive.'],
    ['Continuidade','Atualizar a central e a fila de trabalho. Registrar o próximo passo e avisar quando houver algo relevante.']
  ];
  const examples = {
    despesa:[['Entrada','Uma nota chega ao financeiro ou à entrada de despesas do sistema.'],['Conferência','Financeiro verifica o documento, a alocação e possíveis duplicidades.'],['Registro','O arquivo é catalogado e vinculado à planilha, conforme a evidência.'],['Memória','A situação e eventuais pendências ficam no projeto e na central.']],
    video:[['Briefing','Marketing define objetivo, canal, privacidade e referências da marca.'],['Produção','Editor reúne mídias, monta roteiro, voz, edição e acabamento.'],['Revisão','A versão é conferida com o briefing e as aprovações necessárias.'],['Entrega','Vídeo e memória ficam no Drive; publicação é uma etapa própria.']],
    dispositivo:[['Contexto','Identificar o imóvel, o equipamento e o comportamento esperado.'],['Diagnóstico','Automação confere Smart Life/Tuya, integração e entidade no Home Assistant.'],['Validação','A configuração e o comando são testados dentro do escopo autorizado.'],['Continuidade','Painel, cadastro e procedimento de recuperação ficam documentados.']]
  };
  const systems = [
    ['COORDENAÇÃO E EXECUÇÃO','Codex','Reúne os perfis, as skills e as conversas de trabalho. Os agentes são acionados por tarefa; as rotinas fazem verificações agendadas.',['Agentes','Skills','Rotinas']],
    ['ACESSO E APRESENTAÇÃO','Sistema Ágora','O frontend publicado no GitHub Pages apresenta projetos e ferramentas. Vercel atende serviços de backend; Clerk participa do login.',['GitHub Pages','Vercel','Clerk']],
    ['DOCUMENTOS E CONTROLES','Google Drive','Destino canônico dos documentos e das entregas. Planilhas controlam dados estruturados; arquivos MD registram contexto e procedimentos.',['Documentos','Planilhas','Memória MD']],
    ['AUTOMAÇÃO DOS IMÓVEIS','Home Assistant','Executa na VPS e reúne entidades, cenas e painéis dos imóveis. Seu funcionamento não depende de manter o computador pessoal ligado.',['VPS','Painéis por imóvel']],
    ['EQUIPAMENTOS E CENAS','Tuya / Smart Life','Integra os dispositivos e cenas compatíveis. Disponibilidade e limites da integração precisam ser verificados no diagnóstico de cada caso.',['Dispositivos','Cenas','Integração']],
    ['FERRAMENTAS DE APOIO','Conectores e mídia','E-mail, documentos, voz e vídeo entram no fluxo quando a tarefa precisa deles e há acesso disponível e autorizado.',['Acesso conforme a tarefa','Sem conexão presumida']]
  ];
  const skills = ['Coordenação de projetos','Organização de projetos e mídias','Automação Ágora','Compras Ágora','Financeiro e custos de obras','Recursos Humanos','Jurídico Ágora','Editor de vídeo'];
  const daily = [
    ['08h','Financeiro das obras','Conferir arquivos novos ou alterados, conciliar documentos e atualizar custos e pendências.'],
    ['09h','Acompanhamento do projeto 019','Revisar o contexto e as pendências do projeto para orientar os próximos passos.'],
    ['09h30','Contas de água e luz','Identificar vencimentos; lembrar na véspera e no dia, quando ainda não houver comprovante.'],
    ['12h','Ágora Materiais','Verificar entradas e pendências da pasta com processamento incremental.'],
    ['18h','Continuidade e aprendizado','Conciliar decisões e entregas recentes com memórias, skills e fila de trabalho.'],
    ['18h30','Backup operacional','Conferir alterações e preservar o conjunto operacional selecionado no Drive, sem credenciais.']
  ];
  const other = [
    ['Qui / sex','Recursos Humanos · 09h','Conferir registros da equipe, pagamentos e itens ainda dependentes de confirmação.'],
    ['Sexta','Locações do projeto 017 · 10h','Revisar compromissos e pendências das locações vinculadas à obra.'],
    ['A cada 2 dias','Mídias das obras','Tratar fotos e vídeos novos ou fora do padrão, usando data comprovável e mapa de renomeio.'],
    ['Pontual','Conferência de caçambas do 019','Lembrete associado à confirmação de solicitações e entregas. Encerrar após resolver a pendência.']
  ];
  const $ = id => document.getElementById(id);
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if(className) node.className = className;
    if(text !== undefined) node.textContent = text;
    return node;
  };
  const svg = key => {
    // Only fixed, locally authored SVG paths enter this markup.
    const node = document.createElementNS('http://www.w3.org/2000/svg','svg');
    node.setAttribute('viewBox','0 0 24 24'); node.setAttribute('aria-hidden','true');
    node.innerHTML = icons[key]; return node;
  };
  const byId = id => agents.find(agent => agent.id === id);
  const dialog = $('agent-detail');
  let returnFocus = null;
  const detailSection = title => { const section=element('section','detail-section'); section.append(element('h3','',title)); return section; };
  function openAgent(id, trigger) {
    const agent=byId(id); if(!agent) return;
    if(!dialog.open) returnFocus=trigger;
    $('detail-title').textContent=agent.name; $('detail-group').textContent=agent.group;
    $('detail-summary').textContent=agent.summary; $('detail-profile').textContent=agent.profile;
    $('detail-icon').replaceChildren(svg(agent.icon));
    const body=$('detail-body'); body.replaceChildren();
    [['Quando acionar',agent.when],['O que entrega',agent.outputs]].forEach(([title,items]) => {
      const section=detailSection(title), list=element('ul');
      items.forEach(item=>list.append(element('li','',item))); section.append(list); body.append(section);
    });
    const method=detailSection('Como trabalha'); method.append(element('p','',agent.method)); body.append(method);
    const related=detailSection('Trabalha em conjunto com'), buttons=element('div','related-agents');
    agent.links.forEach(link=>{const button=element('button','',byId(link).name+' ↗'); button.type='button'; button.addEventListener('click',()=>openAgent(link)); buttons.append(button);});
    related.append(buttons); body.append(related);
    if(!dialog.open) dialog.showModal();
    dialog.scrollTop=0; dialog.querySelector('.close').focus({preventScroll:true});
  }
  dialog.querySelector('.close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{if(returnFocus?.isConnected) returnFocus.focus({preventScroll:true});});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  const card = agent => {
    const button=element('button','agent-card'); button.type='button'; button.dataset.agent=agent.id;
    button.setAttribute('aria-label','Conhecer '+agent.name); button.setAttribute('aria-haspopup','dialog');
    const icon=element('span','agent-icon'), copy=element('span','agent-copy'), arrow=element('span','agent-arrow','↗');
    icon.setAttribute('aria-hidden','true'); arrow.setAttribute('aria-hidden','true'); icon.append(svg(agent.icon));
    copy.append(element('strong','',agent.name),element('small','',agent.short)); button.append(icon,copy,arrow);
    button.addEventListener('click',()=>openAgent(agent.id,button)); return button;
  };
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function renderMap(query='') {
    const terms=normalize(query.trim()).split(/\s+/).filter(Boolean);
    const matches=agents.filter(a=>terms.every(term=>normalize([a.name,a.profile,a.group,a.short,a.summary,a.when.join(' '),a.outputs.join(' '),a.method].join(' ')).includes(term)));
    const visible=new Set(matches.map(a=>a.id));
    $('agent-map').classList.toggle('searching',terms.length>0);
    $('coordinator').replaceChildren(...(visible.has('coordenador')?[card(byId('coordenador'))]:[]));
    const support=['gerente','revisor'].filter(id=>visible.has(id));
    $('support-agents').replaceChildren(...support.map(id=>card(byId(id)))); $('support-agents').parentElement.hidden=!support.length;
    const target=$('agent-groups'); target.replaceChildren();
    groups.forEach(group=>{
      const ids=group.ids.filter(id=>visible.has(id)); if(!ids.length)return;
      const section=element('section','agent-group'), head=element('div','group-title'), cards=element('div','group-cards');
      head.append(element('h3','',group.name),element('span','',String(ids.length).padStart(2,'0')));
      cards.append(...ids.map(id=>card(byId(id)))); section.append(head,element('p','group-description',group.desc),cards); target.append(section);
    });
    $('search-status').textContent=terms.length?(matches.length?`${matches.length} ${matches.length===1?'agente encontrado':'agentes encontrados'}.`:'Nenhum agente encontrado. Tente “compras”, “vídeo” ou “automação”.'):'';
  }
  $('agent-search').addEventListener('input',event=>renderMap(event.target.value));
  renderMap();
  const tabs=Array.from(document.querySelectorAll('[role=tab]'));
  function selectView(tab, moveFocus=false) {
    tabs.forEach(item=>{const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;$(item.dataset.view).hidden=!selected;});
    if(moveFocus)tab.focus();
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>selectView(tab));
    tab.addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      if(event.key==='Home')next=0;
      if(event.key==='End')next=tabs.length-1;
      if(next!==undefined){event.preventDefault();selectView(tabs[next],true);}
    });
  });
  workflows.forEach(([title,text])=>{const li=element('li');li.append(element('h3','',title),element('p','',text));$('workflow').append(li);});
  function showExample(key) {
    const list=element('ol','example-chain');examples[key].forEach(([title,text])=>{const item=element('li');item.append(element('strong','',title),element('p','',text));list.append(item);});
    $('example-content').replaceChildren(list,element('p','example-caption','Fluxo ilustrativo. Não envia comandos, lança despesas ou publica conteúdo.'));
    document.querySelectorAll('[data-example]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.example===key)));
  }
  document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>showExample(button.dataset.example)));showExample('despesa');
  systems.forEach(([label,title,text,tags])=>{const article=element('article','system-card'),taglist=element('div','system-tags');tags.forEach(tag=>taglist.append(element('span','',tag)));article.append(element('p','system-label',label),element('h3','',title),element('p','',text),taglist);$('system-layers').append(article);});
  skills.forEach(name=>$('skill-list').append(element('span','',name)));
  [[daily,'daily-routines'],[other,'other-routines']].forEach(([items,target])=>items.forEach(([time,title,text])=>{const article=element('article','routine-card'),body=element('div');body.append(element('h4','',title),element('p','',text));article.append(element('div','routine-time',time),body);$(target).append(article);}));
  // Keep the existing authenticated parent informed about real user activity.
  let lastActivity=0;
  const signalActivity=()=>{const now=Date.now();if(now-lastActivity<1500)return;lastActivity=now;if(window.parent!==window)window.parent.postMessage({type:'agora-estrutura-activity'},window.location.origin);};
  ['pointerdown','keydown','scroll'].forEach(type=>document.addEventListener(type,signalActivity,{passive:true,capture:true}));
})();

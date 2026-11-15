# Dashboard consolidado

## Contrato

`api/_lib/dashboard-consolidation.mjs` normaliza a fila de trabalho e consolida compromissos em janelas `next7days` (padrão), `currentWeek` e `nextWeek`, usando calendário de São Paulo. Itens sem data ou valor não entram nos totais; `paid` e `cancelled` ficam fora da soma. IDs/eventIds conflitantes são excluídos para não inflar o resultado.

O RH é incorporado em seção independente, usando o total líquido de `forecast()` da própria área de RH; ajustes não viram obrigações avulsas. Falha de RH não é convertida em zero. A fila vem de `raw.workday.queueFileId`; financeiro de `raw.financeConsolidated.fileId` ou `raw.financeConsolidated.items`. `asOf` é revisão da fonte; `consultedAt` é somente a consulta.

`financeConsolidated` privado contém `asOf`, `coverage` (status/note/projects), `items` e `controls`. Itens: id/eventId estável, projectId, title, payee, dueDate, amount, status (confirmed/unconfirmed/paid/cancelled), source, sourceUrl, asOf. Não incluir esses dados no repositório. Conflitos, datas e valores ausentes são expostos fora dos totais. Falta de comprovante não prova inadimplência.

O botão Atualizar leitura recarrega a base e as operações; as abas Visão geral, Financeiro e RH consultam a cada dois minutos enquanto visíveis. Respostas de sessões antigas são descartadas. A rotina `Atualizar Central Ágora diariamente`, às 09h15, revisa fontes e atualiza o mesmo arquivo privado com `atualizar_dashboard.py` na pasta canônica Dashboard Master Ágora, preservando histórico e conferindo o conteúdo remoto. Depende da disponibilidade do Codex. Sem revisão do conteúdo, não avançar `asOf`.

## Limitações

O endpoint permanece protegido por Master e o sanitizador só expõe campos permitidos e URLs HTTPS aprovadas. O portal de cliente não é alterado. O deploy, atualização das fontes e registro no catálogo ficam com o coordenador.

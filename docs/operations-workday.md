# Acompanhamento documental e Meu dia

O histórico do Sistema mantém recebimento, leitura, identificação, destino, lançamento no controle e conferência como estados diferentes. Apenas o Master registra as atestações. Os demais usuários internos mantêm as permissões preexistentes de despesas. Clientes não têm acesso à API de despesas nem ao dashboard corporativo.

As etapas de leitura e conciliação são manuais. A API verifica sequência, presença da referência e existência do arquivo Google vinculado; não interpreta o documento nem confirma que a linha de uma planilha corresponde ao comprovante. O responsável precisa fazer essa conferência antes de atestar. Este módulo não substitui o controle oficial da obra e não contabiliza a mesma nota novamente.

Alterações em valores, obra, itens, data, tipo, fornecedor ou foto invalidam as etapas dependentes. Atualizações usam ETag/If-Match e leitura após gravação. Repetir um recebimento de mesmo ID com dados iguais reutiliza o registro. A API recusa edição de IDs duplicados. Criações simultâneas do mesmo ID não têm trava distribuída; eventual conflito exige conciliar os arquivos existentes antes de continuar.

O dashboard Master lê `workday` no mesmo JSON privado do Drive já configurado por `DASHBOARD_DATA_FILE_ID`. Cada item tem fonte, data de referência, responsável e próxima ação. É uma visão das fontes, não outro livro financeiro. Ao atender uma pendência, atualizar primeiro o controle/contexto canônico e depois esta projeção. O botão de atualização recarrega as fontes publicadas; não faz OCR nem varredura autônoma de todas as pastas.

`GET /api/operations` exige Master antes de consultar Drive e serviços. Retorna a fila do Sistema e verificações pontuais de disponibilidade. A falha de uma fonte não transforma outra em concluída. A data mostrada no painel é a da consulta; a base de pendências tem sua própria data.

O workflow `Public availability` consulta páginas públicas e recusa de acesso anônimo às APIs a cada hora. Não contém credenciais, não aciona dispositivos, não cria mensagens ou issues e não atesta segurança completa. Alertas por e-mail dependem das preferências de notificações do GitHub. O agendamento do GitHub pode atrasar e, em repositório público inativo, ser desabilitado pelo provedor.

## Reversão

Reverter o commit da interface/API e promover novamente o deployment anterior. Preservar os campos `acompanhamento_documental` no Drive; não os apagar para reverter a interface. A cópia anterior do JSON privado e o pacote do código ficam no acervo de TI, fora do repositório público.

# Solicitações de compras

Entrada: primeiro cartão de Organização no Sistema → `/compras/`.

Fluxo: texto informal ou fotos → revisão opcional dos itens → solicitação → cotação → pedido → recebimento. Projeto é opcional; destinos também incluem estoque, gastos gerais e a definir. A IA organiza especificações sem presumir quantidade ou preço. O texto original é preservado. O histórico exibe um cartão por material. Texto em linhas separadas ou uma lista extraída de foto permite acompanhar projeto, fornecedor e situação de cada item. O texto original e os anexos permanecem vinculados à mesma solicitação. Estados não geram despesas ou lançamentos financeiros.

## Acesso e armazenamento

- Clerk autentica e a API autoriza exclusivamente as identidades internas já permitidas pelo Sistema. Clientes não têm acesso à fila nem às fotos.
- O Master acompanha e atualiza cada item. William pode editar itens próprios ainda solicitados ou em cotação.
- Índice JSON privado no Drive; fotos privadas na mesma pasta. Referências e credenciais permanecem no backend. Variáveis opcionais `PURCHASE_DATA_FILE_ID` e `PURCHASE_FOLDER_ID` permitem substituir os IDs canônicos configurados no módulo de armazenamento.
- O cadastro não muda compartilhamento de arquivos. As fotos só são servidas com autenticação e vínculo válido ao pedido, proprietário e pasta.
- A escrita usa ETag do Drive, comparação condicional e leitura de confirmação. O primeiro toque faz a gravação. Se a conexão falhar, o navegador repete o envio com o mesmo UUID e o mesmo conteúdo. Edição com versão desatualizada é recusada.
- Rascunho de texto local por usuário; fotos só persistem após upload. Até seis imagens por pedido, JPEG/PNG/WebP de até 900 KiB após compressão. IA usa até duas fotos por chamada. Fotos podem perder resolução; este módulo não substitui o arquivo fiscal original.

## Manutenção

Implementação: `compras/`, `api/_lib/purchase-requests.mjs`, `purchase-store.mjs`, `routes/purchase-requests.mjs`, dispatcher `api/service.mjs` e rewrite no `vercel.json`. Dependências e segredos existentes do Sistema são reutilizados. Organizar usa `OPENAI_VISION_MODEL` ou o modelo padrão já empregado pelo inventário; falha da IA não impede registro manual.

Limites atuais: 80 itens/pedido, 2.000 pedidos e índice de até 3 MiB. Antes de atingir o limite, ampliar armazenamento ou arquivar preservando referências. Uploads abandonados podem deixar fotos sem pedido; só descartar após cruzar IDs, idade e índice, nunca pela aparência do nome. Não há monitoramento em segundo plano nem envio automático aos fornecedores.

Validação: testes de contrato e concorrência em `tests/purchase-requests.test.mjs`, acesso real do middleware em `tests/system-access.test.mjs`, além da conferência visual e funcional no navegador. Não colocar dados reais de pedidos, imagens privadas, tokens ou credenciais no repositório.


## Organização assistida — 15/11/2026

Fotos são referência por padrão. Somente a opção explícita Extrair lista desta foto envia a imagem à IA, até duas por análise; todas continuam anexadas ao pedido. A API rejeita imagens sem purpose=extract-list. Fotos sem texto legível não autorizam inferir lista por aparência.

A nomenclatura privada no Drive (ID 1ZAm-ie0MMqfRKpyfQr5qTz4y0613emDb, Compras/nomenclatura-materiais.json) contém nomes, aliases e fonte de confirmação, sem preços ou dados pessoais. Versão inicial: sete referências, seis da BASE-PRECOS-2026.csv e a confirmação específica de Leandro para Joelho 45° — 25 mm — soldável para água fria. Não é leitura automática de todo o financeiro. Acrescentar referências apenas com fonte e revisar ambiguidades. Não generalizar soldável/água fria pela bitola. API consulta a base no Drive; falha produz aviso e usa apenas o conteúdo fornecido. Nenhuma referência ou credencial é embutida no frontend.

Texto original permanece preservado. Campos incertos continuam vazios; IA padroniza nomes/unidades e propõe a lista para revisão. Quantidade preenchida remove somente a frase automática Quantidade não informada., preservando observações técnicas. Registros antigos têm exibição/cópia corrigidas e persistem a limpeza ao salvar, sem migração destrutiva da fila.

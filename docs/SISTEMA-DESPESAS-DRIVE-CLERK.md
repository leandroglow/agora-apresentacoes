# Sistema Ágora — despesas, comprovantes e histórico

## Estado da correção de 27/10/2026

Falha reproduzida no serviço publicado: POST de 5 MB para upload-receipt retorna HTTP413 FUNCTION_PAYLOAD_TOO_LARGE sem Access-Control-Allow-Origin. No navegador, a resposta pode aparecer apenas como TypeError/Load failed. O OPTIONS publicado já respondia204: a hipótese inicial de preflight ausente veio de uma cópia antiga e foi descartada. Não atribuir o incidente ao Cloudflare Tunnel do Home Assistant, que é outro serviço.

Fonte vigente: raiz do repositório agora-apresentacoes, `api/`, `sistema/index.html` e `sistema/receipt-transfer.js`. A árvore `catalogos-ia-api/` é histórica e não deve ser usada automaticamente para publicar por cima da raiz atual.

O envio atualizado usa uma sessão resumível do Google Drive, criada pela API após autenticação Clerk e autorização interna já existentes. O navegador recebe somente uma capacidade temporária para enviar aquele arquivo à pasta fixa; não recebe access token, refresh token ou segredo Google. Original de até20MB enviado em partes de1MiB, sem redução de resolução ou modificação dos bytes. A capacidade fica somente em memória. A criação da sessão deve incluir o Origin validado do Sistema: o teste real identificou que omitir esse cabeçalho remove o CORS nas respostas posteriores do Google, mesmo com OPTIONS correto. Esse cabeçalho foi corrigido e protegido por teste.

A análise recebe fileId em uma requisição pequena; o servidor confere pasta, tipo, tamanho e lixeira antes de ler a imagem e enviá-la à IA. Assim, o original não atravessa o limite de4,5MB de entrada da Vercel. O histórico lê a foto em blocos de1MiB para não exceder o limite de resposta. Arquivos legados pequenos continuam compatíveis.

O mesmo ID de rascunho e o mesmo comprovante são reutilizados durante novas tentativas na tela. Respostas perdidas são conciliadas consultando a posição confirmada pelo Drive. Nunca mostrar sucesso apenas por salvar em localStorage. O estado pendente é uma fila de recuperação, não o livro financeiro oficial.

Testes locais:38 passaram, cobrindo envio de8MB com igualdade de bytes, retomada, conclusão após perda de resposta, histórico acima de4,5MB, limites, destino Google estrito, pasta autorizada, autenticação e bloqueio de Laerte. Esses testes são simulados e não comprovam o Safari físico.

Validação real autorizada por Leandro em27/10 e concluída às18:22UTC: imagem sintética >4,5MB preservada por hash, preflight/CORS Google, leitura por blocos, análise IA por fileId, gravação/consulta e repetição sem duplicidade passaram. A pasta temporária foi movida à lixeira e a limpeza foi relida. Nenhuma despesa real foi alterada. O teste executou os mesmos handlers dentro do build Vercel, com credenciais mantidas nesse ambiente; não é uma gravação pelo Safari físico. Chrome conectado: sessão autenticada e formulário atual aberto sem erros de console. O teste opcional scripts/verify-receipts-live.mjs exige AGORA_VERIFY_RECEIPTS=1 e autorização específica; não deve ser executado automaticamente em cada publicação.

## Regras permanentes

- Login exclusivamente Clerk para o usuário final; não pedir OAuth Google no celular.
- A autenticação deve também exigir a autorização interna do Sistema; uma conta destinada a um portal de automação não ganha acesso às despesas.
- Preservar os bytes do comprovante original. Versões para análise ou exibição não substituem o original.
- Conferir o código publicado e a resposta HTTP real antes de corrigir uma cópia histórica. OPTIONS204 não prova POST funcional; HTTP200 do HTML não prova gravação.
- JSON de despesa é entrada de conferência. Não tratar upload como conciliação automática na planilha oficial.
- Não repetir o envio inteiro nem gerar novo ID após perda de resposta sem consultar o estado anterior.
- Só declarar publicação quando GitHub Pages e alias ativo da API Vercel tiverem sido conferidos; Preview/build pronto sozinho não basta.
- Nunca registrar tokens, senhas, capacidade temporária de upload, dados de clientes ou fotos privadas no GitHub, Markdown ou logs.

Referências: https://vercel.com/docs/functions/limitations e https://developers.google.com/workspace/drive/api/guides/manage-uploads .

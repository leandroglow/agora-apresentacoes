# Sistema Ágora — despesas, comprovantes e histórico

## Padrão validado em 09/10/2026

O usuário entra somente pela autenticação Clerk do Sistema. O navegador do usuário não pede login, consentimento ou token do Google Drive.

O servidor mantém a autorização OAuth do Drive em variáveis protegidas da hospedagem e renova o access token automaticamente com o refresh token. Nenhum token, segredo ou credencial deve ser colocado em HTML, `localStorage`, Markdown, perfil de agente ou resposta ao usuário.

O comprovante é enviado pela API autenticada pelo Clerk. A API usa uma única pasta fixa de despesas, grava o arquivo e cria um registro JSON `agora_despesa_<id>.json` na mesma pasta. O histórico lista esses JSONs pela API autenticada. A foto é devolvida pela API como conteúdo autorizado, permitindo que qualquer usuário Clerk autorizado veja o comprovante sem conta Google.

## Regras

- Só mostrar sucesso depois do upload e do registro remoto.
- Falha deve aparecer como erro; `localStorage` é apenas fila de recuperação.
- Validar que arquivos lidos ou alterados pertencem à pasta fixa de despesas.
- Edição e exclusão passam pela API Clerk.
- A Automação Ágora é outro sistema e não compartilha credenciais.

## Arquivos

`catalogos-ia-api/api/expenses.mjs`, `catalogos-ia-api/api/upload-receipt.mjs`, `catalogos-ia-api/api/_lib/google.mjs`, `catalogos-ia-api/api/_lib/auth.mjs`, `sistema/index.html` e `catalogos-ia-api/test/expenses.test.mjs`.

## Evidência

Em 09/10/2026, produção confirmou `driveAccessible=true`; o histórico recuperou registros e a foto abriu sem popup Google. Os testes de autenticação, persistência, edição, isolamento e falhas passaram.

# Migração de acesso do sistema Ágora

O navegador não deve conter chaves de Google Drive, segredos Clerk, tokens OAuth, URLs de banco ou credenciais Supabase.

## Fluxo atual

- O navegador autentica o usuário pelo Clerk e envia somente o token de sessão para a API Vercel.
- `system-config`, `drive-files` e `drive-media` consultam o Google Drive com o refresh token guardado nas variáveis privadas do Vercel.
- `expenses` grava despesas e comprovantes no Drive usando a mesma conexão central.
- `rh` grava diário de obra, colaboradores e fotos no Drive.
- Configurações de pastas, apresentações e memória de cada obra ficam em `agora-system-config.json` dentro da pasta de configuração do Drive.
- A publicação deve manter os segredos apenas em Environment Variables do Vercel; eles nunca devem ser colocados no HTML, em arquivos públicos ou em mensagens.

## Variáveis privadas necessárias no Vercel

`CLERK_SECRET_KEY` ou `CLERK_JWT_KEY`, `CLERK_PUBLISHABLE_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_DRIVE_EXPENSE_FOLDER_ID`, `GOOGLE_DRIVE_SYSTEM_CONFIG_FOLDER_ID` e `GOOGLE_DRIVE_RH_FOLDER_ID`.

A chave publicável do Clerk pode aparecer no cliente por definição do protocolo; ela não concede acesso administrativo. Chaves secretas, refresh tokens e IDs de credenciais OAuth ficam somente no Vercel.

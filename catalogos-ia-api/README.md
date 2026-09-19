# Assistente de Catálogos — Ágora

Backend seguro para o chat de catálogos do Sistema Ágora. Ele consulta o Google Drive sob demanda: procura os documentos relacionados à pergunta, abre somente os resultados necessários e entrega uma resposta com as fontes encontradas.

Não existe mais uma cópia integral dos catálogos em um Vector Store da OpenAI. Os arquivos originais permanecem no Drive. Durante cada pergunta, o conteúdo necessário para produzir a resposta ainda é processado pela API da OpenAI; portanto, isto evita a indexação antecipada do acervo, mas não transforma a consulta em processamento exclusivamente local.

## Proteção do acervo

O escopo OAuth "drive.readonly" permite visualizar os arquivos acessíveis à conta autorizada. A restrição real da pasta deve ser feita por permissão do Google Drive:

1. crie uma conta Google dedicada ao assistente;
2. compartilhe com essa conta somente a pasta "2 - AGORA MATERIAIS/Fornecedores";
3. não compartilhe outras pastas pessoais ou administrativas;
4. autorize o OAuth usando essa conta dedicada.

O nome informado em "GOOGLE_DRIVE_FOLDER_HINT" orienta a busca, mas não substitui as permissões da conta.

Textos encontrados em PDFs, planilhas, nomes de arquivo e metadados são tratados como dados não confiáveis. O assistente é instruído a ignorar comandos eventualmente escritos dentro dos catálogos e a não completar respostas com conhecimento geral.

## Endpoints

- "POST /api/login": valida o acesso e entrega uma sessão temporária.
- "POST /api/ask": pesquisa e abre catálogos diretamente no Google Drive.
- "POST /api/transcribe": transforma áudio curto em texto.
- "GET /api/health": informa se OpenAI, sessão e Google Drive estão configurados, sem revelar segredos.

## Variáveis de ambiente

- "OPENAI_API_KEY": chave da API da OpenAI.
- "OPENAI_MODEL": por padrão, "gpt-5.2", compatível com o conector documentado do Google Drive.
- "GOOGLE_OAUTH_CLIENT_ID": ID do cliente OAuth criado no Google Cloud.
- "GOOGLE_OAUTH_CLIENT_SECRET": segredo do cliente OAuth.
- "GOOGLE_OAUTH_REFRESH_TOKEN": autorização renovável da conta Google dedicada.
- "GOOGLE_DRIVE_FOLDER_HINT": identificação legível da pasta autorizada.
- "SESSION_SECRET": segredo aleatório com pelo menos 32 caracteres.
- "AGORA_USERS_JSON": usuários do Sistema Ágora.
- "ALLOWED_ORIGINS": domínios que podem chamar a API pelo navegador.

"GOOGLE_DRIVE_OAUTH_ACCESS_TOKEN" existe somente para testes curtos. Esse token expira; produção deve usar as três variáveis OAuth e o refresh token.

## Preparar o acesso Google

1. No Google Cloud, crie ou selecione um projeto.
2. Ative a Google Drive API.
3. Configure a tela de consentimento OAuth e cadastre a conta dedicada como usuária de teste, se o aplicativo ainda estiver em modo de testes.
4. Crie um cliente OAuth.
5. Autorize o escopo "https://www.googleapis.com/auth/drive.readonly" pedindo acesso offline para obter um refresh token.
6. Salve client ID, client secret e refresh token somente nas variáveis protegidas da Vercel. Nunca coloque esses valores no GitHub, no HTML ou em mensagens.

Se o aplicativo OAuth permanecer em modo de testes, o Google pode limitar ou expirar a autorização. Para uso contínuo com várias contas, revise os requisitos de publicação e verificação do Google.

## Publicação na Vercel

1. Use "catalogos-ia-api" como Root Directory.
2. Cadastre todas as variáveis acima para "Production".
3. Mantenha "OPENAI_API_KEY" também em "Preview" apenas se realmente quiser testar versões de prévia.
4. Faça um novo deployment.
5. Confirme em "/api/health" que "source" é "google_drive", "googleDriveConfigured" é verdadeiro e "configured" é verdadeiro.
6. Entre pelo Sistema Ágora e teste uma pergunta cujo fornecedor e arquivo sejam conhecidos.

## Desenvolvimento e validação

    pnpm install
    pnpm check
    pnpm test

Os scripts "sync:*" e "catalog-policy.json" foram mantidos apenas como alternativa histórica/offline. Eles não são usados pela consulta direta em produção.

## Cuidados operacionais

- aplique limite de requisições e alertas de gasto;
- revogue imediatamente o OAuth se a conta dedicada deixar de ser usada;
- troque credenciais que tenham sido exibidas fora da Vercel;
- preços, promoções e condições devem sempre trazer fornecedor, arquivo e validade;
- quando a validade não estiver clara, a resposta deve pedir confirmação comercial.

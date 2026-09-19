# Assistente de Catálogos — Ágora

Backend seguro para o chat de catálogos do Sistema Ágora. O navegador nunca recebe a chave da OpenAI nem os arquivos completos. A API valida a sessão, consulta um acervo indexado e devolve a resposta com as fontes usadas.

## O que foi localizado

- Pasta-fonte: `2 - AGORA MATERIAIS/Fornecedores`
- 351 arquivos relevantes, aproximadamente 918,5 MB
- 13 fornecedores: Blumenau, Bomvink, Brasfort, Casa do Logista, Cobrecom, Ecoframe, Ingco, Inkor, Irrishop, Margirius, MTX, Starfer, Tholz e Tramontina
- Formatos: PDF, TXT, Markdown, JSON/JSONL e Excel
- A base Blumenau já possui índice, categorias, cadastro, divergências e dados estruturados; o sincronizador prioriza essa base curada e evita duplicar as 246 páginas extraídas.

Arquivos de cadastro, pedidos nominais e propostas identificadas com cliente foram excluídos por padrão. Revise `catalog-policy.json` antes do primeiro envio.

## Endpoints

- `POST /api/login`: valida o acesso e entrega uma sessão temporária.
- `POST /api/ask`: consulta exclusivamente o acervo dos catálogos.
- `POST /api/transcribe`: transforma áudio curto em texto.
- `GET /api/health`: informa se o serviço está configurado, sem revelar segredos.

## Ativação

1. Crie um projeto na Plataforma OpenAI com faturamento da API habilitado. A assinatura do ChatGPT não substitui a conta da API.
2. Copie `.env.example` para `.env` apenas no computador local. Nunca publique `.env`.
3. Gere `SESSION_SECRET` com pelo menos 32 caracteres e defina novos usuários/senhas em `AGORA_USERS_JSON`. Não reutilize as senhas que já ficaram expostas no HTML antigo.
4. Instale as dependências com `pnpm install`.
5. Rode `pnpm sync:preview -- --root "caminho-da-pasta-Fornecedores"` para revisar os arquivos selecionados. Esse comando não envia nada.
6. Depois da aprovação, rode `pnpm sync:apply -- --root "caminho-da-pasta-Fornecedores"`. Guarde o `OPENAI_VECTOR_STORE_ID` retornado.
7. Publique esta pasta como um projeto separado na Vercel e cadastre as variáveis de ambiente.
8. Configure a URL pública da API no Sistema Ágora e publique o HTML atualizado.

## Segurança e manutenção

- A lista de origens permitidas limita o uso normal ao domínio de apresentações e ao ambiente local.
- Tokens expiram em oito horas.
- Áudios são limitados a 5 MB.
- O sincronizador começa em modo de prévia; só altera o acervo remoto com `--apply`.
- Quando um arquivo muda, a nova versão é indexada primeiro e a antiga só é removida depois do sucesso.
- Promoções e tabelas devem ser respondidas com fornecedor, arquivo e data/validade; valores sem validade clara precisam de confirmação.

Para produção, aplique também limite de requisições no provedor de hospedagem e alertas de gasto no projeto da API.

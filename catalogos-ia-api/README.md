# Catálogos IA — consulta direta ao Drive (v2)

O backend navega diretamente pela Drive API v3, usando o OAuth já cadastrado. A OpenAI recebe ferramentas de listar pastas, pesquisar nomes e ler trechos dos documentos. Não usa o conector hospedado `connector_googledrive` nem depende da indexação dele. Os originais permanecem no Drive; os trechos consultados são enviados à OpenAI para produzir a resposta.

## Configuração

- `OPENAI_API_KEY`: chave no servidor.
- `OPENAI_MODEL`: padrão `gpt-5.6-terra`; pode ser alterado para outro modelo Responses com function calling. Um valor existente na Vercel prevalece.
- `OPENAI_REASONING_EFFORT`: padrão `medium`. Use um esforço aceito pelo modelo escolhido.
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`: OAuth com `drive.readonly`.
- `GOOGLE_DRIVE_FOLDER_HINT`: link completo da pasta autorizada. Também aceita ID. O nome textual antigo não é suficiente.
- `GOOGLE_DRIVE_FOLDER_ID`: alternativa opcional com prioridade sobre o link acima.
- `SESSION_SECRET` e `AGORA_USERS_JSON`: autenticação existente.
- `ALLOWED_ORIGINS`: domínios autorizados a chamar o backend no navegador.

Nenhuma credencial vai no HTML. A pasta precisa estar acessível à conta que autorizou o OAuth. O servidor valida a cadeia de pais antes de listar ou baixar cada arquivo. IDs arbitrários e atalhos para fora da pasta não concedem acesso.

## Comportamento

1. Identifica fornecedor e intenção, tolerando acentos, abreviações e erros de voz/grafia.
2. Navega pelas pastas reais com IDs; pesquisa recursivamente nomes/caminhos quando necessário.
3. Abre TXT/MD/CSV/JSON/JSONL, XLSX, Google Docs/Sheets ou PDF com texto, filtrando por termos/código no servidor.
4. Envia cabeçalho e trechos numerados, com sinalização de leitura parcial e continuação por offset.
5. Cruza modelo, código, preço, unidade e promoção; exige fonte e confirmação quando não existe validade.
6. Exibe links apenas de documentos efetivamente abertos na requisição.

Casa do Lojista: consultar `tabtxt.txt`, cruzar o código em `promotxt.txt` e usar a revista para identificação quando necessário. Blumenau: priorizar a Base de consulta mais recente e os trechos da categoria, respeitando edição/divergências.

O modelo não troca códigos por semelhança. Arquivos/metadados são tratados como dados externos, nunca como instruções. Arquivos AGENTS.md, ferramentas e certos documentos administrativos não entram na consulta.

## Limites explícitos

- Até 100 itens por página de listagem, com token de continuação.
- Pesquisa de metadados: até 80 requisições/3.000 itens; informa se parcial.
- Até 24 chamadas de ferramenta e nove rodadas por pergunta, histórico até 10.000 caracteres.
- Cada leitura retorna cerca de 10.000 caracteres úteis, nunca o arquivo inteiro ao modelo.
- PDF: até 100 MB e 400 páginas com texto, extração total limitada a 8 milhões de caracteres; informa leitura parcial. PDFs escaneados sem texto ainda exigem OCR/base textual.
- Planilhas são extraídas como linhas com nome da aba; arquivos muito extensos devem usar bases divididas.
- Limite global de 270 segundos, função Vercel com 300 segundos. Falhas de autorização, ausência, formato e timeout têm mensagens diferentes.

Os limites restringem custo/tempo e não são garantia de leitura integral de todo o acervo. Metadados de modificação não comprovam vigência de preços. Não confundir ausência em um trecho com inexistência de produto/promoção.

## Verificação e publicação

    pnpm install --frozen-lockfile
    pnpm check
    node --test
    node scripts/check-local-catalogs.mjs "CAMINHO/Fornecedores"

O último comando é opcional e usa arquivos locais existentes apenas para regressão de recuperação. Testes unitários usam respostas simuladas para navegação, segurança e fluxo da OpenAI; não validam as credenciais de produção.

Root Directory da Vercel: `catalogos-ia-api`. `GET /api/health` retorna versão `drive-direct-v2`, modelo e esforço configurados, sem segredos. `configured` indica presença de configuração. `GET /api/health?check=1` verifica a listagem real da raiz do Drive e a disponibilidade do modelo, com cache de 60 segundos; retorna apenas indicadores, sem arquivos, IDs ou dados de contas. Esse diagnóstico não gera respostas pagas. A validação ponta a ponta exige entrar no Sistema e executar perguntas reais.

Casos de aceitação: “spot clean blumenau quais tem?”; “alicate universal Entop na Casa do Lojista, preço”; “e o industrial?”; grafias Bomvick/Bomvink; pergunta sem correspondência; tentativa de ler ID fora do acervo.

Logs incluem request ID, modelo, quantidade de ferramentas/fontes e códigos de erro. Não incluem conteúdo de catálogos, perguntas, senhas ou tokens. O OAuth em modo Testing pode expirar e exigir nova autorização; verifique a configuração do Google para operação contínua.

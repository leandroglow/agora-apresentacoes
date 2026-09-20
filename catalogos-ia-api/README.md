# Catálogos IA — consulta direta ao Drive e imagens (v3)

O backend navega diretamente pela Drive API v3, usando o OAuth já cadastrado. A OpenAI recebe ferramentas de listar pastas, pesquisar nomes, ler trechos e inspecionar imagens de páginas selecionadas. Não usa o conector hospedado `connector_googledrive` nem depende da indexação dele. Os originais permanecem no Drive; os trechos e imagens selecionados são enviados à OpenAI para produzir a resposta. O responsável autorizou a análise visual dos catálogos.

## Configuração

- `OPENAI_API_KEY`: chave no servidor.
- `OPENAI_MODEL`: padrão `gpt-5.6-terra`; requer modelo Responses com function calling e entrada de imagens. Um valor existente na Vercel prevalece.
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
- Buscas simultâneas no mesmo documento compartilham o download e a extração, sem multiplicar seu tamanho no orçamento da consulta. Falhas não ficam presas no cache.
- Trechos de PDFs conservam a referência à página física. A numeração impressa pode ser diferente.
- Imagens: o modelo localiza a página física pelo texto/mapa, recebe uma renderização real por `inspect_catalog_page` e, em rodada posterior, escolhe o retângulo por `show_catalog_image`. Pode exibir a página inteira quando o recorte não for seguro. Não há geração artificial de imagens.
- Até quatro páginas visuais (lado maior 2.200 px) e seis recortes por pergunta, até 2,6 milhões de caracteres base64 no conjunto de anexos. O PDFium/WASM renderiza localmente no servidor; jpeg-js comprime o recorte. Texto e imagens compartilham o download em memória; documentos do renderizador são liberados após cada página.
- Anexos são enviados somente na resposta autenticada de `/api/ask`, com `Cache-Control: no-store`. Não existe endereço público de imagem, upload para terceiros, alteração de permissões do Drive ou persistência em disco. Páginas/recortes selecionados são entradas visuais da API OpenAI, usando `store:false`; isso não substitui as políticas de retenção aplicáveis à conta OpenAI.
- O chat mostra galeria com legenda, arquivo e página física; clique para ampliar e Escape/Fechar para sair. Imagens não entram no histórico textual, localStorage ou sessionStorage e são removidas ao sair/expirar a sessão. Não é possível impedir que um usuário autorizado salve ou capture uma imagem que está vendo.
- PDF: até 100 MB e 400 páginas com texto, extração total limitada a 8 milhões de caracteres; informa leitura parcial. A análise visual pode ler páginas escaneadas selecionadas, mas não faz OCR nem indexação visual de todo o acervo.
- Planilhas são extraídas como linhas com nome da aba; arquivos muito extensos devem usar bases divididas.
- Limite global de 270 segundos, função Vercel com 300 segundos. Falhas de autorização, ausência, formato e timeout têm mensagens diferentes.

Os limites restringem custo/tempo e não são garantia de leitura integral de todo o acervo. Metadados de modificação não comprovam vigência de preços. Não confundir ausência em um trecho com inexistência de produto/promoção.

## Verificação e publicação

    pnpm install --frozen-lockfile
    pnpm check
    node --test
    node scripts/check-local-catalogs.mjs "CAMINHO/Fornecedores"

O último comando é opcional e usa arquivos locais existentes apenas para regressão de recuperação. Testes unitários usam respostas simuladas para navegação, segurança e fluxo da OpenAI; não validam as credenciais de produção.

Root Directory da Vercel: `catalogos-ia-api`. `GET /api/health` retorna versão `drive-direct-v3-images`, modelo e esforço configurados, sem segredos. `configured` indica presença de configuração. `GET /api/health?check=1` verifica a listagem real da raiz do Drive, a disponibilidade do modelo e o carregamento do renderizador/WASM (`imageRendererAvailable`), com cache de 60 segundos; retorna apenas indicadores, sem arquivos, IDs ou dados de contas. Esse diagnóstico não gera respostas pagas nem lê imagens de catálogo. A validação ponta a ponta exige entrar no Sistema e executar perguntas reais.

Regressões de imagem: `node --test` valida pixels/cores, coordenadas, autorização, limite concorrente, entradas multimodais e anexos. Com `CATALOG_FIXTURES_DIR` apontando ao acervo local, também verifica duas páginas e recortes do PDF Bomvink de 78 MB; `CATALOG_IMAGE_QA_DIR` opcional salva resultados exclusivamente na pasta local de QA. Não publique esses arquivos.

Teste visual isolado (Playwright instalado no ambiente): `node scripts/check-images-ui.mjs CAMINHO_QA/images.json CAMINHO_QA`. `PLAYWRIGHT_MODULE` e `CHROME_EXECUTABLE` permitem usar o runtime/navegador já instalado. Nunca utiliza o perfil ou login de um usuário; bloqueia rede externa e verifica desktop, celular, modal, foco e HTML malicioso.

Empacotamento: o WASM é rastreado por `require.resolve('@hyzyla/pdfium/pdfium.wasm')`. Não adicionar o caminho `node_modules/@hyzyla/pdfium/...` a `includeFiles`: no pnpm ele está sob um link simbólico e duplicá-lo invalida o pacote da função. O teste opcional `node scripts/check-vercel-package.mjs` usa o empacotador oficial `@vercel/node` instalado no ambiente (ou `VERCEL_BUILDER_MODULE`), verifica as quatro funções e rejeita conflitos entre arquivos e links/pastas. Não faz login nem publica.

Casos de aceitação: “spot clean blumenau quais tem?”; “alicate universal Entop na Casa do Lojista, preço”; “e o industrial?”; grafias Bomvick/Bomvink; pergunta sem correspondência; tentativa de ler ID fora do acervo.

Logs incluem request ID, modelo, quantidade de ferramentas/fontes e códigos de erro. Não incluem conteúdo de catálogos, perguntas, senhas ou tokens. O OAuth em modo Testing pode expirar e exigir nova autorização; verifique a configuração do Google para operação contínua.

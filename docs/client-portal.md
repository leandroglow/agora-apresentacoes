# Portal do Cliente Ágora

Primeira versão para revisão: 10/11/2026. Rota prevista `/cliente/`, gestão Master na própria página e atalho no Dashboard. Hospedagem existente: GitHub Pages/interface e Vercel/API. Este registro de implementação não comprova publicação nem cadastro de uma conta real.

## Regras confirmadas pelo usuário

- Tipografia simples, sem fontes ornamentais, inclusive nomes de projetos. Grafite/preto, off-white e dourado; sem verde.
- Login único da aplicação Clerk existente. Autenticação não concede acesso automaticamente a qualquer módulo.
- Autorizações financeiras por usuário, obra e área, administradas exclusivamente pelo Master. Automação permanece com suas permissões próprias. Não modificar as listas de acesso do Sistema/Automação ao cadastrar cliente financeiro.
- Cliente vê exclusivamente preços finais de venda, escopo contratado/proposto e pagamentos dele. Nunca custos de fornecedores, margem ou notas fiscais de compras.
- Orçamentos admitem etapas, subitens e versões. Total de grupo vem da soma dos filhos, sem somar novamente o valor do pai. Versões alternativas não são somadas como contratos simultâneos.
- Uma referência de orçamento não prova contratação. Ausência de recibos conciliados não prova inadimplência nem recebimento zero.

## Fontes e projeção

`CLIENT_PORTAL_DATA_FILE_ID` aponta para JSON privado no Drive/TI. Dados reais, IDs de arquivos, propostas, documentos e evidências ficam fora do repositório público. O código entrega um objeto reconstruído com campos permitidos, depois de verificar sessão e autorização. A base é projeção de preços de venda/pagamentos conferidos; não substitui os controles oficiais de custos e compras. Cada item tem ID estável para vínculo interno posterior, ainda sem sincronização automática implementada.

Envelope: `schemaVersion`, `revision`, `projects`, `clients`, `requests`, `audit`. Cada projeto contém módulos, publicação, versões de orçamento, recebimentos confirmados, marcos e documentos selecionados. Piloto começa com `published:false`, sem clientes autorizados; ativação exige revisão e ação Master. Solicitação de acesso registra o ID da sessão autenticada, sem conceder qualquer permissão. Nome informado pelo solicitante é declaração, não verificação de identidade.

Arquivos disponíveis somente por identificador lógico previamente selecionado no projeto; não aceitar IDs Drive ou URLs fornecidos pelo cliente. Download autenticado em blocos de até 1 MiB, com autorização em cada requisição, limite total de 30 MB, verificação de versão/tamanho/ordem e assinatura PDF no primeiro bloco. O navegador monta o arquivo somente após receber todos os blocos da mesma versão. Isso evita ultrapassar o limite de resposta da hospedagem. Cache privado/no-store; URLs públicas do Drive não substituem autorização.

## Entrada por perfil

Master entra sempre na central **Portais dos clientes**, mesmo com apenas um projeto cadastrado e mesmo pelo atalho `?gestao=1`. Nenhum projeto é aberto implicitamente. A central identifica cliente/projeto, diferencia rascunhos e oferece abrir a prévia ou gerenciar acessos. O botão **Voltar a todos os portais** permite trocar de projeto. A lista vem da base privada, sem cadastrar obras ou contas por inferência.

Cliente com um único projeto autorizado entra diretamente nele. Com mais de um, escolhe somente entre seus projetos; sem autorização, vê a tela de solicitação. Login na Automação não cria permissão financeira. Retornar à aba revalida sessão e acesso, preservando a seleção somente na mesma sessão e se ainda autorizada; troca de conta limpa a seleção anterior. A prévia de permissões de um cliente não pode virar prévia irrestrita após atualizar.

## Operação

GET `/api/client-portal`: lista somente projetos autorizados. Master pode listar rascunhos.
GET `?project=ID`: projeção autorizada por módulos.
GET `?project=ID&preview=1`: prévia restrita ao Master; mesmos campos destinados ao cliente.
GET `?project=ID&asUser=USER`: visão exata de permissões da conta, restrita ao Master.
GET `?project=ID&document=ID&offset=0`: primeiro bloco de PDF selecionado. Blocos seguintes incluem `offset` e `fileVersion` recebidos do servidor. Resposta JSON contém `offset`, `nextOffset`, `totalSize`, `fileVersion`, `mimeType`, `dataBase64` e `done`.
GET `?admin=1`: gestão exclusiva Master, com revisão e ETag.
POST `request-access`: registra solicitação própria, sem autorização.
POST `set-access` / `set-publication`: exclusivas Master, exigem versão/ETag atual, gravação condicional e releitura. Auditoria identifica ator e horário. Nenhuma operação ativa automação, paga, compra ou envia mensagens.

## Conferência

Testar acesso cruzado entre obras, revogação, prévias, ausência de fontes privadas no payload, documentos não liberados, autorização realJWT, origem/expiração, concorrência e cálculos em centavos. Usar fixtures sintéticas apenas nos testes. `node --test tests/*.test.mjs`; `node --test` sem filtro também encontra scripts antigos de navegador que não integram esta suíte.

Frontend: sessão encerrada ou trocada limpa dados e aborta consultas; nenhuma base financeira é salva em localStorage. Conferir desktop/celular, impressão, subitens, troca de versão e administração. Fonte HTML/HTTP200 não prova isolamento nem gravação.

Revogação bloqueia novas consultas no servidor. Dados já apresentados numa aba ativa podem permanecer na memória até a próxima revalidação (atualizar, retornar à aba ou mudar a sessão); não há polling nem apagamento remoto instantâneo de conteúdo já visto.

## Referências de produto

- https://www.vobi.com.br/funcionalidades/portal-do-cliente — compartilhamento seletivo e consulta de orçamento/pagamentos/documentos.
- https://ajuda.vobi.com.br/pt-br/articles/6192013-casos-de-uso-de-orcamento — níveis/subníveis/itens e vínculo interno a lançamentos/compras. A documentação informa um orçamento por projeto; o requisito Ágora permite várias propostas/versões.
- https://ajuda.vobi.com.br/pt-br/articles/6070215-como-o-cliente-visualiza-um-projeto-na-vobi — prévia 'ver como cliente'.

Referências consultadas em10/11/2026. Interface e código próprios; não copiar conteúdo privado, marcas ou ativos do Vobi.

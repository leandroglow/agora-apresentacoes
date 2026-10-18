# CAD no Sistema Ágora

Organização → Arquivos CAD: escolher DWG/DXF no Drive (até 3 MiB) ou aparelho (até 2 MiB), pasta de destino, formato PDF/DXF/DWG, converter e salvar. Prévia com zoom de 25% a 1200%. Compartilhamento depende do navegador.

## Operação e segurança

Clerk autentica usuários. GOOGLE_DRIVE_PROJECTS_JSON usa o cadastro existente `{projeto: {projeto: folderId, fotos: folderId, renders: folderId}}`. Fonte e destino precisam pertencer às raízes. CAD_QUEUE_FOLDER_ID indica fila privada. CAD_WORKER_TOKEN tem pelo menos 32 caracteres, nunca presente no frontend. Arquivos locais são guardados na fila; limpeza automática ainda não implementada.

Um único worker Windows consulta HTTPS, sem porta pública. Lease de 15 minutos, três tentativas após interrupção. Registro é atualizado no mesmo arquivo. Repetir conclusão procura cadOutputJob antes de criar saída. Drive não possui claim atômico: não iniciar múltiplos workers. Iniciador Windows impede instâncias locais concorrentes.

Entrada e saída do serviço até 3 MiB para caber no transporte Vercel. PDF renderiza Model completo ajustado a A1; não garante layouts, CTB, Xrefs ou escala física. PDF→DWG não está habilitado.

## Contrato

GET cad-jobs?action=folders[&folder=id] retorna {folders,files}, raízes quando omitido folder.
POST cad-jobs recebe {sourceId,destinationId,format} ou {fileName,fileBase64,destinationId,format}; retorna {job}.
GET cad-jobs?id=uuid retorna {job} apenas para proprietário.
GET cad-worker retorna {job:null} ou {job:{id,inputName,format,leaseToken,downloadUrl}}.
GET cad-worker?action=download&id=uuid&lease=token retorna binário protegido.
POST cad-worker recebe {id,leaseToken,status:'completed',dataBase64} ou status failed.

## Validação 2026-10-15

Testes mocked: ciclo completo, fonte alterada, token ausente, lease inválido, conclusão repetida sem duplicata, raízes e paginação. Interface no Edge: seleção, conversão, prévia, download e zoom 1200%. Conversões ABR13 DWG→PDF (652775 bytes), DXF→DWG (403913 bytes), DXF→PDF validadas localmente.

Produção NÃO ativada: revisão automática exigiu aprovação para publicar na main. Fila privada e variáveis CAD configuradas na Vercel, sem deployment; serviço local ainda não iniciado.

## Ampliação aprovada em 15/10/2026
Arquivos do Drive e resultados agora até 10 MiB. Transferência em partes de 2 MiB autenticadas; partes de saída identificadas por lease e índice, repetição sem duplicação. Upload do aparelho permanece 2 MiB. Teste simulado percorreu entrada e saída de 10 MiB com cinco partes. Resultado/preview também usa download em partes. A publicação foi autorizada pelo usuário neste turno.


## Visualizador simplificado — 18/10/2026

A ação principal Abrir desenho envia preview:true. A API força PDF e guarda o resultado técnico na fila CAD, sem solicitar destino e sem gravar junto aos projetos originais. O fluxo avançado de exportação mantém destino/formato explícitos. ODA ainda prepara uma prévia vetorial; não é engine DWG nativo no navegador. Exige computador acordado e worker disponível; resultados são reutilizados por fonte/revisão/usuário. Resultado técnico exige proprietário autenticado, origem autorizada, pasta da fila e cadOutputJob correspondente. Navegação reutiliza AgoraPdfViewer, centralização, arraste e pinça contínua até 1200%.

## Visualização local no navegador — 18/10/2026

Fluxo principal usa LibreDWG WASM em Worker + mlightcad WebGL, fontes Noto Sans locais, sem fila ODA, sem upload e sem serviços pagos. Drive usa GET cad-jobs?action=source autenticado (Clerk), valida raiz autorizada, extensão DWG/DXF e entrega partes de até 2 MiB (arquivo até 10 MiB). Aparelho até 10 MiB é lido apenas na memória do navegador. Exportação legada fica nas opções avançadas. Abrir não depende do status de jobs antigos. Fechar destrói iframe e cancela download. Timeout de 90s.

Teste real arquitetura_copia.dwg 474151 bytes: geometria/carimbo/textos visíveis, sem pageerror, sem pedido externo; teste integração um GET de fonte com Bearer e zero POST/fila. Pinça real emulada via CDP 100→1200% em um gesto; enquadrar restabelece centro. Testes privados não devem ser publicados. LibreDWG é GPL-3.0; fontes correspondentes e licença em sistema/cad-browser/sources, código reproduzível scripts/cad-browser-source. Limites: fontes especiais substituídas, Xrefs/imagens externas não carregadas, entidades proprietárias/versões não cobertas podem falhar; testar cada desenho real antes de uso técnico.

## Ajustes aprovados — 18/10/2026

CAD e visualizador PDF do sistema: zoom máximo 1600%. CAD em carvão/dourado, modal desktop quase tela toda e celular 100dvh com safe areas, mantendo área flexível de desenho. Seletor e leitura/worker aceitam somente raízes da categoria projeto dos projetos configurados (008, 013, 016, 017, 019); categorias fotos e renders rejeitadas mesmo cadastradas. A configuração Clerk atual autentica o acesso e aplica as mesmas raízes a todos autenticados: não existe ACL distinta por usuário nesta entrega. Resultado técnico legado permanece na fila pelo vínculo de job validado.

Verificação: 6 testes backend; DWG real local em desktop1440x1000/celular390x844, pinça única100→1600%, enquadrar, fechamento, zero POST/fila e zero pedidos externos; PDF preview1600% e default do viewer16 validados.

## Limite e interface — 18/10/2026

Visualização local/Drive aceita até25MiB; download autenticado sourcePart permite25MiB em partes2MiB, enquanto downloadPart mantém padrão10MiB para o worker/conversão. Selecionar arquivo local não lê nem gera base64; base64 só é calculado quando se solicita exportação legada (local até2MiB). Interface normal exibe seleção, abertura e link discreto de licenças, sem textos introdutórios ou limites; mensagens de erro informam limite. Testes: transporte25MiB completo, rejeição25MiB+1, conversão continua rejeitando25MiB, seleção25MiB sem btoa, e DWG real474151bytes integra/abre1600%. Nenhum teste afirma fidelidade ou compatibilidade de qualquer DWG25MB.

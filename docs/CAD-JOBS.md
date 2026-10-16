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


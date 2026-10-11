# Visualizador de projetos — 11/10/2026

Referência de interação: helvetia-b11-casa-v2/app.js (enquadramento central, pinça no ponto de contato, arraste).

## Pinça contínua — revisão de 11/10/2026

O usuário relatou que a pinça nos projetos parecia avançar em pequenos passos, ao contrário da apresentação B11. A proporção de distância já era contínua, mas setZoom apagava todos os canvases e cancelava a renderização a cada touchmove. Agora preservar os blocos prontos, aplicar escala visual imediatamente e refazer a resolução dos blocos visíveis ao terminar o gesto. Manter uma prévia leve por página visível para cobrir as regiões recém-expostas. Nunca limpar os pixels existentes a cada movimento: isso causa piscadas e impressão de zoom em degraus. Preservar botões, limite de 800%, centro da pinça e cancelamento ao fechar. Não confundir a prévia temporária ampliada com a resolução final do PDF.

Regressão: scripts/test-pdf-gestures.cjs usa Chrome/Playwright em larguras 390, 768 e 1000. Verifica escala fracionária, uma pinça de 100% a 800%, manutenção dos canvases durante o gesto, ausência de novas renderizações durante a pinça, foco preservado, refinamento após soltar, botões, cancelamento e limpeza. Teste sintético de interação; não equivale a avaliação subjetiva num iPhone físico.

PDF: `sistema/pdf-viewer.js` mantém páginas em coordenadas de documento e desenha apenas os blocos visíveis de 512 px, com resolução dependente do zoom e da densidade da tela. Não esticar canvas renderizado a 100%. Zoom limitado a 800%. PDFs digitalizados continuam limitados pela resolução do original. Fechar/trocar documento cancela blocos pendentes.

Vídeo: não fazer fetch/blob do arquivo completo. A rota autenticada `project-file?action=playback` emite acesso assinado limitado ao arquivo, por duas horas. A assinatura usa uma chave já disponível exclusivamente no servidor; nenhum token Google é enviado ao navegador. O elemento video pede intervalos de bytes; a API obtém no máximo 2 MiB por resposta 206 do Drive. Não há transcodificação: suporte depende do codec do original e do navegador. Falha ao receber 206 não pode virar download integral silencioso.

Validação local: sintaxe de scripts; assinatura vinculada ao arquivo e rejeição de alteração; faixas iniciais/sufixo/inválidas; navegador Chrome headless com documento simulado verificando escala a 800%, ponto central preservado e canvases pequenos. Reprodução autenticada dos vídeos reais em produção ainda precisa de verificação. Não confundir push com teste real no celular.

## Incidente 502 — nomes Unicode e publicação

Nomes como `LUMINA\u0301RIAS`, `LOUC\u0327AS` e `ELETRODOME\u0301STICOS` contêm acentos combinantes. Colocá-los diretamente no Content-Disposition causa ERR_INVALID_CHAR no Node, antes de enviar o arquivo. Usar `inlineDisposition()` em `_lib/file-headers.mjs`: fallback ASCII e filename* UTF-8. Não renomear originais para contornar. Testes de regressão em `tests/file-headers.test.mjs`.

Em 11/10/2026, commits em main estavam gerando Preview na Vercel. O status GitHub/Vercel success indica compilação concluída, NÃO atualização do alias de produção. Conferir Environment Production e alias agora-apresentacoes.vercel.app; promover explicitamente a versão autorizada antes de testar. Frontend GitHub Pages e backend Vercel têm publicações independentes.

Correção f675f46 promovida em produção na implantação ByxChABiBQewedn3JZA3h4EfMdFN. Validação autenticada na página pública: Luminárias, Louças e Metais, Eletrodomésticos, Alumínio (019) e SP-274-2026 Relatório de Sondagem a Percussão (016) retornaram HTTP 200, Content-Disposition codificado e canvases de páginas presentes. Sondagem conferida visualmente. Nenhum arquivo original foi renomeado. Vídeos não testados nem alterados nesta correção.

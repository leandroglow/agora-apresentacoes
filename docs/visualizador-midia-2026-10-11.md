# Visualizador de projetos — 11/10/2026

Referência de interação: helvetia-b11-casa-v2/app.js (enquadramento central, pinça no ponto de contato, arraste).

PDF: `sistema/pdf-viewer.js` mantém páginas em coordenadas de documento e desenha apenas os blocos visíveis de 512 px, com resolução dependente do zoom e da densidade da tela. Não esticar canvas renderizado a 100%. Zoom limitado a 800%. PDFs digitalizados continuam limitados pela resolução do original. Fechar/trocar documento cancela blocos pendentes.

Vídeo: não fazer fetch/blob do arquivo completo. A rota autenticada `project-file?action=playback` emite acesso assinado limitado ao arquivo, por duas horas. A assinatura usa uma chave já disponível exclusivamente no servidor; nenhum token Google é enviado ao navegador. O elemento video pede intervalos de bytes; a API obtém no máximo 2 MiB por resposta 206 do Drive. Não há transcodificação: suporte depende do codec do original e do navegador. Falha ao receber 206 não pode virar download integral silencioso.

Validação local: sintaxe de scripts; assinatura vinculada ao arquivo e rejeição de alteração; faixas iniciais/sufixo/inválidas; navegador Chrome headless com documento simulado verificando escala a 800%, ponto central preservado e canvases pequenos. Reprodução autenticada dos vídeos reais em produção ainda precisa de verificação. Não confundir push com teste real no celular.

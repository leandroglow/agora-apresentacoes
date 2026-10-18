# Build do visualizador

`pnpm install --frozen-lockfile --ignore-scripts` e `pnpm exec vite build`.

Copiar dist/ para sistema/cad-browser preservando sources/, licenses/ e notices. Não copiar desenhos privados ou node_modules. Runtime estático sem fila, chave ou serviço pago.

Teste real: definir CAD_TEST_DWG para um desenho autorizado e executar `node tests/cad-worker/cad-browser.test.cjs`; teste não envia o desenho para terceiros.

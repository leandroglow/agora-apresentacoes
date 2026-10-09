---
name: sistema-despesas
description: Manter despesas, comprovantes e histórico com Clerk e Drive autorizado no servidor.
---

# Sistema de despesas Ágora

Use para comprovantes, combustível, histórico e fotos no Sistema Ágora. O usuário autentica somente com Clerk. O Drive é uma dependência do servidor: a API renova o token sem consentimento no navegador e grava na pasta fixa.

Nunca peça login Google a cada usuário, nunca coloque refresh token em HTML ou `localStorage` e nunca copie credenciais para memória. Antes de declarar sucesso, valide upload, registro remoto e leitura do histórico após nova carga.

Fonte canônica: `sistema/docs/SISTEMA-DESPESAS-DRIVE-CLERK.md`.

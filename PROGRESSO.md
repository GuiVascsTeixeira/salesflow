# PROGRESSO — SalesFlow (atualizado em 10/11/2026)

## Concluído
- Auditoria completa do ZIP e comparação com o histórico. Banco MySQL 8.0.46 real criado a partir de `schema.sql` + `seed.sql` num ambiente de teste.
- **Bugs corrigidos**
  - Cadastro de produto rejeitava preços válidos (ex.: 19,90) por erro de ponto flutuante → `produtos.service.js`.
  - Erros 404 lançados como `Error` com `.status` (ex.: estoque de produto de outra empresa) viravam 500 → `erros.middleware.js`.
  - Cadastro/login com tipos errados no JSON (número, objeto) ou sem corpo davam 500 → `auth.service.js`, `app.js`.
  - Limites de tamanho (nome/empresa/e-mail/senha 72 bytes).
- **Segurança**: helmet+CSP, CSRF (`csrf-sync`, `public/js/csrf.js`), rate limit em login/cadastro, JSON limitado a 100kb.
- **Novo módulo Relatórios** (`/relatorios`, `/api/relatorios/resumo`, `/api/relatorios/vendas.csv`) + item no menu (substituiu o "Estoque – Em breve").
- **Power BI**: `database/powerbi_views.sql` (views) e `powerbi/GUIA-POWER-BI.md`.
- **Testes**: `tests/integracao.test.js` (25 testes, todos passando). Relatório conferido contra SQL (1.240 vendas / R$ 41.042,56 da empresa 1).
- README completo.

## Rodada 2 (10/11/2026) — UI/UX, celular e clique duplo
- **Auditoria visual** das 6 páginas autenticadas + login em desktop (1360), tablet (820) e celular (390): sem overflow horizontal, sem texto < 11px, sem erro de console/CSP.
- Já estavam aplicados no workspace (modernização de UI): fonte **Inter local** (`public/fonts`, `@font-face` 400–700, sem Google Fonts), tokens de cor/estado em `style.css`, ícones, menu em gaveta no celular (`menu.js`).
- **Celular**: tabelas de vendas, produtos, clientes e "vendas recentes" viram **cartões** (`.sf-stack` + `public/js/tabelas.js` + CSS) — antes as colunas Total/Status/Ações ficavam escondidas na rolagem lateral.
- **Vendas paginadas** (20 por página, filtros preservados, página inválida/além do fim tratada); KPIs agora refletem TODO o filtro (antes: só as 200 primeiras). A lista no celular caiu de ~14.300px para ~8.900px.
- **Clique duplo na venda**: já protegido no front (`enviando`) e no servidor (`chaveEnvio`, ignora repetição por 2 min, em memória). Conferido por teste (4 envios paralelos = 1 venda).
- Testes: 27 passando (`npm test`).
- Limitação: a chave anti-duplicidade fica na memória do servidor (some se reiniciar; não vale com várias instâncias).

## Alterado (arquivos)
`src/app.js`, `src/routes/{auth,paginas}.routes.js`, `src/services/{auth,produtos,dashboard}.service.js` (só `export` em 3 funções), `src/middlewares/erros.middleware.js`, `src/views/*.ejs` (script csrf.js + menu), `src/public/css/style.css` (estilos de relatórios), `package.json`, `.env.example`, `README.md`.
Novos: `middlewares/seguranca.middleware.js`, `repositories|services|controllers/relatorios.*`, `routes/relatorios.routes.js`, `views/relatorios.ejs`, `public/js/{csrf,relatorios}.js`, `tests/`, `database/powerbi_views.sql`, `powerbi/GUIA-POWER-BI.md`.

## Testado
Suíte automatizada + navegador (login, dashboard, relatórios, modal de venda; sem erro de CSP). Não testado: Power BI Desktop (guia escrito, não executado), mysql no Windows do Gui, fontes do Google (bloqueadas no ambiente de teste).

## Falta / próximos passos
1. Gui: rodar `npm install` (novas deps: chart.js) e `npm test` local; aplicar `powerbi_views.sql` e montar o `.pbix` seguindo o guia (salvar em `powerbi/`).
2. Pendências opcionais: paginação em produtos/clientes, perfis de usuário, tela de detalhe de movimentações de estoque global, publicação (deploy) e prints/GIF no README.
3. Remover `src/services.zip` (arquivo solto, não usado) e `LEIA-ANTES-DE-SUBSTITUIR.txt` (instruções antigas).

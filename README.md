# SalesFlow

Sistema de gestão comercial e inteligência de vendas para pequenas empresas: produtos, estoque, clientes, vendas, dashboard, relatórios e Power BI. Multiempresa (cada empresa só enxerga os próprios dados).

## Funcionalidades
- **Autenticação**: cadastro de empresa + usuário, login/logout, senha com bcrypt, sessão no MySQL, limite de tentativas.
- **Produtos e categorias**, com **controle de estoque** (entrada, ajustes, histórico/livro-razão, travas `FOR UPDATE`).
- **Clientes**: cadastro, busca, edição, inativação/reativação.
- **Vendas**: preço lido do banco, desconto % limitado por empresa, pagamento, baixa de estoque em transação, cancelamento com motivo e estorno de estoque.
- **Dashboard**: faturamento do mês, vendas, estoque baixo, últimos 7 dias, mais vendidos, vendas recentes.
- **Relatórios** (`/relatorios`): período livre, faturamento, lucro bruto, margem, ticket médio, formas de pagamento, categorias, vendedores, estoque crítico (gráficos Chart.js) e **exportação CSV**.
- **Power BI**: views prontas + guia com Power Query e DAX (`powerbi/GUIA-POWER-BI.md`).

## Tecnologias
Node.js 20+, Express 5, EJS, MySQL 8 (mysql2/promise), Chart.js, helmet, csrf-sync, express-rate-limit, Power BI.

## Como rodar
1. Crie o banco (⚠️ o `schema.sql` APAGA e recria o banco `salesflow`; use só em desenvolvimento):
   ```bash
   mysql -u root -p --default-character-set=utf8mb4 < database/schema.sql
   mysql -u root -p --default-character-set=utf8mb4 salesflow < database/seed.sql
   ```
2. Copie `.env.example` para `.env` e preencha usuário/senha do MySQL e um `SESSION_SECRET` aleatório.
3. `npm install` e `npm run dev` → http://localhost:3000

**Login de demonstração** (dados fictícios): `marina@boavista.example` / `salesflow123` (empresa 1) ou `renato@papelariacentral.example` (empresa 2).
O seed cobre 04/05/2026 a 02/11/2026: o gráfico "últimos 7 dias" do dashboard fica vazio até você registrar vendas novas; em Relatórios use o período 04/05–02/11.

## Testes
Com o servidor rodando (em outro terminal) e um banco **de desenvolvimento** (os testes criam dados):
```bash
npm test                          # usa http://localhost:3000
BASE_URL=http://localhost:3100 npm test
```
27 testes de integração: autenticação, CSRF, isolamento entre empresas, validações, estoque, desconto, concorrência (5 vendas simultâneas do último item → só 1 passa), cancelamento, relatórios (conferência com a soma do banco) e renderização das páginas.

## Segurança
bcrypt (custo 12) · sessão httpOnly/sameSite no MySQL, regenerada no login · CSRF por token (`X-CSRF-Token`) · helmet com CSP restritiva · limite de tentativas de login/cadastro · consultas parametrizadas · `empresa_id` sempre vindo da sessão + FKs compostas no banco · preço/estoque/desconto decididos só no servidor · exportação CSV protegida contra injeção de fórmulas.

## Estrutura
`src/routes → controllers → services (regras) → repositories (SQL)`; views EJS em `src/views`; front-end em `src/public`; SQL em `database/`; testes em `tests/`.

## Limitações conhecidas
- Proteção contra envio duplicado de venda é em memória (não vale com várias instâncias do servidor).
- Um pagamento por venda (a tabela já permite dividir no futuro).
- Sem perfis/permissões: todo usuário da empresa pode cancelar vendas.
- `npm audit` aponta o `mysql2` interno do `express-mysql-session` (só afeta conexões com compressão, que não usamos); atualizar quando houver versão corrigida.

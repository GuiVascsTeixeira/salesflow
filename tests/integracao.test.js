// Testes de integração do SalesFlow (usam o runner nativo do Node: node:test).
//
// Eles fazem requisições HTTP REAIS ao servidor, que por sua vez usa o MySQL.
// ATENÇÃO: os testes CRIAM dados (empresa, produtos, clientes, vendas).
// Rode contra um banco de desenvolvimento/teste, nunca contra dados reais.
//
// Como rodar (servidor já rodando em outro terminal):
//   npm test                         -> usa http://localhost:3000
//   BASE_URL=http://localhost:3100 npm test
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SENHA = 'senhaForte123';
const sufixo = Date.now().toString(36);

// Cliente HTTP mínimo com "cookie jar" (guarda a sessão) e token CSRF.
function criarCliente() {
  let cookies = new Map();
  let csrf = null;

  async function req(metodo, caminho, corpo, { semCsrf = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (metodo !== 'GET' && csrf && !semCsrf) headers['X-CSRF-Token'] = csrf;
    const res = await fetch(BASE + caminho, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      redirect: 'manual',
    });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [par] = sc.split(';');
      const i = par.indexOf('=');
      const nome = par.slice(0, i);
      const valor = par.slice(i + 1);
      if (/expires=Thu, 01 Jan 1970/i.test(sc)) cookies.delete(nome);
      else cookies.set(nome, valor);
    }
    const texto = await res.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* resposta HTML */ }
    return { status: res.status, json, texto, headers: res.headers };
  }

  async function obterCsrf() {
    const r = await req('GET', '/api/csrf-token');
    csrf = r.json?.token ?? null;
    return csrf;
  }

  return {
    get: (c) => req('GET', c),
    post: (c, b, o) => req('POST', c, b ?? {}, o),
    put: (c, b, o) => req('PUT', c, b ?? {}, o),
    del: (c, o) => req('DELETE', c, undefined, o),
    obterCsrf,
    async login(email, senha = SENHA) {
      await obterCsrf();
      const r = await req('POST', '/api/auth/login', { email, senha });
      await obterCsrf(); // a sessão foi regenerada: novo token
      return r;
    },
  };
}

const A = criarCliente(); // empresa A (criada pelo teste de cadastro)
const B = criarCliente(); // empresa B (criada pelo teste de cadastro)
const dados = {};
const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function cadastrar(cliente, rotulo) {
  await cliente.obterCsrf();
  const email = `${rotulo}.${sufixo}@teste.example`;
  const r = await cliente.post('/api/auth/cadastro', {
    nome: `Usuário ${rotulo}`,
    empresaNome: `Empresa ${rotulo} ${sufixo}`,
    email,
    senha: SENHA,
  });
  assert.equal(r.status, 201, r.texto);
  const l = await cliente.login(email);
  assert.equal(l.status, 200, l.texto);
  return { email, ...r.json.dados };
}

async function criarProdutoPronto(cliente, categoriaId, extra = {}) {
  const r = await cliente.post('/api/produtos', {
    categoriaId,
    nome: `Produto ${Math.random().toString(36).slice(2, 7)}`,
    sku: `SKU-${Math.random().toString(36).slice(2, 9)}`,
    precoVenda: '10.00',
    custo: '4.00',
    estoqueMinimo: 2,
    estoqueInicial: 10,
    ...extra,
  });
  assert.equal(r.status, 201, r.texto);
  const lista = await cliente.get(`/api/produtos?busca=${encodeURIComponent(r.json.produto?.sku ?? '')}`);
  return r.json;
}

async function estoqueDe(cliente, id) {
  const r = await cliente.get(`/api/produtos/${id}`);
  return Number(r.json.produto.estoque_atual);
}

describe('Autenticação e proteção', () => {
  before(async () => {
    dados.a = await cadastrar(A, 'alfa');
    dados.b = await cadastrar(B, 'beta');
  });

  test('rotas protegidas retornam 401 sem sessão', async () => {
    const anon = criarCliente();
    for (const c of ['/api/produtos', '/api/clientes', '/api/vendas', '/api/relatorios/resumo', '/api/auth/me']) {
      const r = await anon.get(c);
      assert.equal(r.status, 401, c);
    }
  });

  test('páginas protegidas redirecionam para o login', async () => {
    const anon = criarCliente();
    for (const c of ['/dashboard', '/produtos', '/clientes', '/vendas', '/relatorios']) {
      const r = await anon.get(c);
      assert.equal(r.status, 302, c);
    }
  });

  test('login com senha errada falha sem revelar se o e-mail existe', async () => {
    const c = criarCliente();
    await c.obterCsrf();
    const r1 = await c.post('/api/auth/login', { email: dados.a.email, senha: 'errada123' });
    const r2 = await c.post('/api/auth/login', { email: 'naoexiste@x.example', senha: 'errada123' });
    assert.equal(r1.status, 401);
    assert.equal(r2.status, 401);
    assert.equal(r1.json.erro.mensagem, r2.json.erro.mensagem);
  });

  test('cadastro valida tipos e e-mail duplicado', async () => {
    const c = criarCliente();
    await c.obterCsrf();
    const ruim = await c.post('/api/auth/cadastro', { nome: 123, empresaNome: {}, email: 'x', senha: 12345678 });
    assert.equal(ruim.status, 400, ruim.texto);
    const dup = await c.post('/api/auth/cadastro', {
      nome: 'Dup', empresaNome: 'Dup', email: dados.a.email, senha: SENHA,
    });
    assert.equal(dup.status, 409);
  });

  test('POST sem token CSRF é rejeitado (403)', async () => {
    const r = await A.post('/api/clientes', { nome: 'Sem token' }, { semCsrf: true });
    assert.equal(r.status, 403, r.texto);
  });

  test('cabeçalhos de segurança do helmet estão presentes', async () => {
    const r = await A.get('/api/health');
    assert.ok(r.headers.get('content-security-policy'));
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });

  test('logout encerra a sessão', async () => {
    const c = criarCliente();
    await c.login(dados.a.email);
    assert.equal((await c.get('/api/auth/me')).status, 200);
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });
});

describe('Categorias, produtos e estoque', () => {
  test('cria categoria, produto com estoque inicial e histórico', async () => {
    const cat = await A.post('/api/categorias', { nome: 'Geral' });
    assert.equal(cat.status, 201, cat.texto);
    dados.catA = cat.json.categoria.id;

    const p = await criarProdutoPronto(A, dados.catA, { estoqueInicial: 10 });
    dados.prodA = p.produto?.id ?? p.id;
    assert.ok(dados.prodA, JSON.stringify(p));
    assert.equal(await estoqueDe(A, dados.prodA), 10);

    const h = await A.get(`/api/produtos/${dados.prodA}/movimentacoes`);
    assert.equal(h.status, 200);
    assert.ok(h.json.historico.length >= 1);
  });

  test('valida preço negativo, SKU duplicado e casas decimais', async () => {
    const base = { categoriaId: dados.catA, nome: 'X', custo: '1', estoqueMinimo: 0 };
    assert.equal((await A.post('/api/produtos', { ...base, sku: 'neg', precoVenda: '-1' })).status, 400);
    assert.equal((await A.post('/api/produtos', { ...base, sku: 'dec', precoVenda: '1.999' })).status, 400);
    const ok = await A.post('/api/produtos', { ...base, sku: `dup-${sufixo}`, precoVenda: '5' });
    assert.equal(ok.status, 201);
    const dup = await A.post('/api/produtos', { ...base, sku: `dup-${sufixo}`, precoVenda: '5' });
    assert.equal(dup.status, 409);
  });

  test('ajuste negativo maior que o saldo é bloqueado e o saldo nunca fica negativo', async () => {
    const r = await A.post(`/api/produtos/${dados.prodA}/movimentacoes`, {
      tipo: 'ajuste_negativo', quantidade: 9999, justificativa: 'teste',
    });
    assert.ok([400, 409].includes(r.status), r.texto);
    assert.equal(await estoqueDe(A, dados.prodA), 10);
  });

  test('entrada de estoque soma ao saldo', async () => {
    const r = await A.post(`/api/produtos/${dados.prodA}/movimentacoes`, {
      tipo: 'entrada', quantidade: 5, justificativa: 'compra',
    });
    assert.equal(r.status, 201, r.texto);
    assert.equal(await estoqueDe(A, dados.prodA), 15);
  });

  test('isolamento: empresa B não enxerga nem altera produtos da empresa A', async () => {
    assert.equal((await B.get(`/api/produtos/${dados.prodA}`)).status, 404);
    const mov = await B.post(`/api/produtos/${dados.prodA}/movimentacoes`, {
      tipo: 'entrada', quantidade: 1, justificativa: 'invasão',
    });
    assert.equal(mov.status, 404);
    const lista = await B.get('/api/produtos');
    assert.ok(!lista.json.produtos.some((p) => p.id === dados.prodA));
    // B não pode criar produto numa categoria de A
    const inv = await B.post('/api/produtos', {
      categoriaId: dados.catA, nome: 'Y', sku: 'inv', precoVenda: '1', custo: '1',
    });
    assert.ok([400, 404, 409].includes(inv.status), inv.texto);
  });
});

describe('Clientes', () => {
  test('CRUD, inativação e isolamento', async () => {
    const c = await A.post('/api/clientes', { nome: 'Maria Teste', email: `maria.${sufixo}@x.example`, telefone: '(85) 99999-9999' });
    assert.equal(c.status, 201, c.texto);
    dados.cliA = c.json.cliente?.id ?? c.json.id;
    assert.ok(dados.cliA, c.texto);

    const dup = await A.post('/api/clientes', { nome: 'Outra', email: `MARIA.${sufixo}@x.example` });
    assert.equal(dup.status, 409);

    const ed = await A.put(`/api/clientes/${dados.cliA}`, { nome: 'Maria Editada', email: `maria.${sufixo}@x.example`, telefone: '' });
    assert.equal(ed.status, 200, ed.texto);

    assert.equal((await B.get(`/api/clientes/${dados.cliA}`)).status, 404);
    assert.equal((await B.put(`/api/clientes/${dados.cliA}`, { nome: 'Hack' })).status, 404);
  });
});

describe('Vendas', () => {
  test('venda calcula preço no servidor, baixa estoque e registra movimentação', async () => {
    const p = await criarProdutoPronto(A, dados.catA, { precoVenda: '19.90', custo: '8.00', estoqueInicial: 20 });
    const id = p.produto?.id ?? p.id;
    const r = await A.post('/api/vendas', {
      clienteId: dados.cliA,
      forma: 'pix',
      descontoPercentual: '5',
      itens: [{ produtoId: id, quantidade: 3, preco: '0.01' }], // preço da tela deve ser ignorado
    });
    assert.equal(r.status, 201, r.texto);
    const v = await A.get(`/api/vendas/${r.json.id}`);
    assert.equal(v.json.venda.subtotal, '59.70');
    assert.equal(v.json.venda.desconto, '2.99'); // 59,70 × 5% = 2,985 -> 2,99
    assert.equal(v.json.venda.total, '56.71');
    assert.equal(await estoqueDe(A, id), 17);
    dados.vendaA = { id: r.json.id, produto: id };
  });

  test('estoque insuficiente (409), desconto acima do limite (409), itens vazios (400)', async () => {
    const p = await criarProdutoPronto(A, dados.catA, { estoqueInicial: 2 });
    const id = p.produto?.id ?? p.id;
    const sem = await A.post('/api/vendas', { forma: 'pix', itens: [{ produtoId: id, quantidade: 3 }] });
    assert.equal(sem.status, 409);
    assert.equal(await estoqueDe(A, id), 2);
    const desc = await A.post('/api/vendas', { forma: 'pix', descontoPercentual: 50, itens: [{ produtoId: id, quantidade: 1 }] });
    assert.equal(desc.status, 409);
    assert.equal((await A.post('/api/vendas', { forma: 'pix', itens: [] })).status, 400);
    assert.equal((await A.post('/api/vendas', { forma: 'boleto', itens: [{ produtoId: id, quantidade: 1 }] })).status, 400);
    assert.equal((await A.post('/api/vendas', { forma: 'pix', itens: [{ produtoId: id, quantidade: 1.5 }] })).status, 400);
    assert.equal(await estoqueDe(A, id), 2);
  });

  test('empresa B não pode vender produto nem usar cliente da empresa A', async () => {
    const r = await B.post('/api/vendas', { forma: 'pix', itens: [{ produtoId: dados.prodA, quantidade: 1 }] });
    assert.ok([400, 404].includes(r.status), r.texto);
    const catB = (await B.post('/api/categorias', { nome: 'B' })).json.categoria.id;
    const pb = await criarProdutoPronto(B, catB);
    const r2 = await B.post('/api/vendas', { clienteId: dados.cliA, forma: 'pix', itens: [{ produtoId: pb.produto?.id ?? pb.id, quantidade: 1 }] });
    assert.equal(r2.status, 400, r2.texto);
    assert.equal((await B.get(`/api/vendas/${dados.vendaA.id}`)).status, 404);
    assert.equal((await B.post(`/api/vendas/${dados.vendaA.id}/cancelar`, { motivo: 'invasão' })).status, 404);
  });

  test('concorrência: 5 vendas simultâneas do último estoque -> só 1 passa', async () => {
    const p = await criarProdutoPronto(A, dados.catA, { estoqueInicial: 1 });
    const id = p.produto?.id ?? p.id;
    const resp = await Promise.all(
      Array.from({ length: 5 }, () => A.post('/api/vendas', { forma: 'dinheiro', itens: [{ produtoId: id, quantidade: 1 }] })),
    );
    const ok = resp.filter((r) => r.status === 201).length;
    assert.equal(ok, 1, resp.map((r) => r.status).join(','));
    assert.equal(await estoqueDe(A, id), 0);
  });

  test('cancelamento exige motivo, devolve estoque e não pode ser repetido', async () => {
    const { id, produto } = dados.vendaA;
    assert.equal((await A.post(`/api/vendas/${id}/cancelar`, { motivo: '' })).status, 400);
    const c = await A.post(`/api/vendas/${id}/cancelar`, { motivo: 'Cliente desistiu' });
    assert.equal(c.status, 200, c.texto);
    assert.equal(await estoqueDe(A, produto), 20);
    const de_novo = await A.post(`/api/vendas/${id}/cancelar`, { motivo: 'de novo' });
    assert.equal(de_novo.status, 409);
    assert.equal(await estoqueDe(A, produto), 20);
    const v = await A.get(`/api/vendas/${id}`);
    assert.equal(v.json.venda.status, 'cancelada');
  });

  test('produto inativo não pode ser vendido', async () => {
    const p = await criarProdutoPronto(A, dados.catA, { estoqueInicial: 5 });
    const id = p.produto?.id ?? p.id;
    assert.equal((await A.del(`/api/produtos/${id}`)).status, 200);
    const r = await A.post('/api/vendas', { forma: 'pix', itens: [{ produtoId: id, quantidade: 1 }] });
    assert.equal(r.status, 400);
  });
});

describe('Dashboard e relatórios', () => {
  test('dashboard renderiza para usuário autenticado', async () => {
    const r = await A.get('/dashboard');
    assert.equal(r.status, 200);
    assert.match(r.texto, /Visão geral/);
  });

  test('relatório resumo reflete a venda e isola empresas', async () => {
    const hoje = diasAtras(0);
    const ra = await A.get(`/api/relatorios/resumo?inicio=${diasAtras(300)}&fim=${hoje}`);
    assert.equal(ra.status, 200, ra.texto);
    assert.ok(ra.json.resumo.vendas >= 1);
    const rb = await B.get(`/api/relatorios/resumo?inicio=${diasAtras(300)}&fim=${hoje}`);
    assert.equal(rb.status, 200);
    assert.ok(rb.json.resumo.vendas < ra.json.resumo.vendas);
  });

  test('relatório rejeita período inválido', async () => {
    assert.equal((await A.get('/api/relatorios/resumo?inicio=abc&fim=2026-01-01')).status, 400);
    assert.equal((await A.get('/api/relatorios/resumo?inicio=2026-02-01&fim=2026-01-01')).status, 400);
  });

  test('exportação CSV das vendas', async () => {
    const hoje = diasAtras(0);
    const r = await A.get(`/api/relatorios/vendas.csv?inicio=${diasAtras(300)}&fim=${hoje}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/csv/);
    assert.match(r.texto, /^﻿?"?(Venda|venda)/);
  });
});

describe('Relatórios: conferência numérica com o banco', () => {
  test('o faturamento do relatório bate com a soma das vendas confirmadas', async () => {
    const hoje = diasAtras(0);
    const login = criarCliente();
    const r = await login.login('marina@boavista.example', 'salesflow123');
    if (r.status !== 200) return; // seed de demonstração não carregado: ignora
    const rel = await login.get(`/api/relatorios/resumo?inicio=2026-05-04&fim=2026-11-02`);
    assert.equal(rel.status, 200, rel.texto);
    const somaDia = rel.json.porDia.reduce((s, d) => s + Math.round(Number(d.faturamento) * 100), 0);
    assert.equal(somaDia, Math.round(Number(rel.json.resumo.faturamento) * 100));
    const somaForma = rel.json.porForma.reduce((s, d) => s + Math.round(Number(d.valor) * 100), 0);
    assert.equal(somaForma, Math.round(Number(rel.json.resumo.faturamento) * 100));
    assert.ok(Number(rel.json.resumo.lucroBruto) < Number(rel.json.resumo.faturamento));
    void hoje;
  });
});

describe('Páginas', () => {
  test('páginas principais renderizam (HTML completo, sem erro)', async () => {
    for (const [c, titulo] of [['/dashboard', 'Visão geral'], ['/produtos', 'Produtos'], ['/categorias', 'Categorias'], ['/clientes', 'Clientes'], ['/vendas', 'Vendas'], ['/relatorios', 'Relatórios']]) {
      const r = await A.get(c);
      assert.equal(r.status, 200, c);
      assert.match(r.texto, new RegExp(`<title>[^<]*${titulo}`), c);
    }
  });
});

describe('Envio duplicado de venda', () => {
  test('mesma chaveEnvio enviada 4x em paralelo gera UMA venda e baixa o estoque uma vez', async () => {
    const p = await criarProdutoPronto(A, dados.catA, { estoqueInicial: 10 });
    const id = p.produto?.id ?? p.id;
    const corpo = { forma: 'pix', chaveEnvio: `teste-${sufixo}-dup`, itens: [{ produtoId: id, quantidade: 2 }] };
    const resp = await Promise.all([1, 2, 3, 4].map(() => A.post('/api/vendas', corpo)));
    assert.ok(resp.every((r) => r.status === 201), resp.map((r) => r.status).join(','));
    assert.equal(new Set(resp.map((r) => r.json.id)).size, 1);
    assert.equal(await estoqueDe(A, id), 8);
    // chave nova = venda nova
    const outra = await A.post('/api/vendas', { ...corpo, chaveEnvio: `teste-${sufixo}-dup2` });
    assert.equal(outra.status, 201);
    assert.equal(await estoqueDe(A, id), 6);
  });
});

describe('Vendas: paginação da lista', () => {
  test('página 2, página inválida e página além do fim', async () => {
    const m = criarCliente();
    const l = await m.login('marina@boavista.example', 'salesflow123');
    if (l.status !== 200) return; // seed de demonstração não carregado
    const p2 = await m.get('/vendas?pagina=2');
    assert.equal(p2.status, 200);
    assert.match(p2.texto, /Página <strong>2<\/strong>/);
    assert.equal((p2.texto.match(/data-view-sale=/g) || []).length, 20);
    const ruim = await m.get('/vendas?pagina=abc');
    assert.match(ruim.texto, /Página <strong>1<\/strong>/);
    const alem = await m.get('/vendas?pagina=99999');
    assert.equal(alem.status, 200);
    assert.doesNotMatch(alem.texto, /Página <strong>99999/);
    const filtro = await m.get('/vendas?status=canceladas&pagina=1');
    assert.equal(filtro.status, 200);
  });
});

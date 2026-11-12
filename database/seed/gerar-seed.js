#!/usr/bin/env node
/**
 * SalesFlow - Gerador de dados fictícios
 *
 * Simula ~6 meses de operação de duas empresas fictícias e escreve o
 * arquivo database/seed.sql.
 *
 * Por que um script e não INSERTs escritos à mão?
 *   Para o dashboard e o Power BI parecerem reais precisamos de MILHARES de
 *   linhas, e elas precisam ser CONSISTENTES (o saldo de estoque tem que
 *   bater com o histórico de movimentações, o total da venda com a soma dos
 *   itens, etc.). O script simula a operação dia a dia, respeitando as
 *   mesmas regras que o sistema terá (não vende além do estoque, cancelamento
 *   estorna estoque, preço e custo ficam gravados no item).
 *
 * O resultado é DETERMINÍSTICO: rodar de novo gera exatamente o mesmo arquivo
 * (a "semente" do sorteio é fixa).
 *
 * Uso (na raiz do projeto):  node database/seed/gerar-seed.js
 * Não precisa instalar nada: usa só módulos que já vêm com o Node.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// =====================================================================
// 1. CONFIGURAÇÃO
// =====================================================================
const SEMENTE = 20261103;

// Período simulado, em horário LOCAL de Fortaleza (UTC-3, sem horário de verão).
const INICIO = { ano: 2026, mes: 5, dia: 4 };
const FIM = { ano: 2026, mes: 11, dia: 2 };
const FUSO_HORAS = 3; // horário local + 3h = UTC

// Hash bcrypt (custo 10) da senha de demonstração "salesflow123".
// É só para os dados FICTÍCIOS: nunca use essa senha de verdade.
const SENHA_DEMO_HASH = '$2b$10$J7J9pEdc6mhq4VvNbdBWS.bJF2fIItL9yV0PJ36qyK0B0ZSKccbx6';

const FORMAS_PAGAMENTO = [
  ['pix', 40],
  ['cartao_debito', 25],
  ['cartao_credito', 20],
  ['dinheiro', 15],
];

const MOTIVOS_CANCELAMENTO = [
  'Cliente desistiu da compra',
  'Produto lançado em duplicidade',
  'Erro no registro da venda',
  'Pagamento não aprovado',
];

const PRIMEIROS_NOMES = [
  'Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João',
  'Karina', 'Lucas', 'Mariana', 'Nathan', 'Olívia', 'Pedro', 'Queila', 'Rafael', 'Sofia', 'Thiago',
  'Valéria', 'Wesley', 'Yasmin', 'Zeca', 'Beatriz', 'Caio', 'Débora', 'Enzo', 'Fernanda', 'Gustavo',
  'Helena', 'Igor', 'Jéssica', 'Kaique', 'Larissa', 'Mateus', 'Natália', 'Otávio', 'Patrícia', 'Ricardo',
];
const SOBRENOMES = [
  'Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Lima', 'Costa', 'Ferreira', 'Rodrigues', 'Almeida',
  'Nascimento', 'Carvalho', 'Araújo', 'Ribeiro', 'Gomes', 'Martins', 'Rocha', 'Barros', 'Moreira', 'Cavalcante',
  'Teixeira', 'Mendes', 'Freitas', 'Monteiro', 'Dias', 'Campos', 'Nogueira', 'Vieira', 'Cardoso', 'Pinto',
];

// Cada empresa fictícia é descrita por um objeto. O mesmo simulador roda para as duas.
// produtos: [nome, categoria, preço (centavos), custo (centavos), estoque mínimo, popularidade (1-10)]
const EMPRESAS = [
  {
    nome: 'Mercadinho Boa Vista',
    descontoMaximo: 10,
    emailDominio: 'boavista.example',
    usuarios: [
      { nome: 'Marina Albuquerque', email: 'marina@boavista.example', peso: 4 },
      { nome: 'Carlos Menezes', email: 'carlos@boavista.example', peso: 3 },
      { nome: 'Juliana Prado', email: 'juliana@boavista.example', peso: 3 },
    ],
    categorias: [
      ['Bebidas', 'BEB'],
      ['Mercearia', 'MER'],
      ['Higiene e Limpeza', 'HIG'],
      ['Snacks e Doces', 'SNK'],
      ['Papelaria', 'PAP'],
      ['Utilidades', 'UTI'],
    ],
    produtos: [
      ['Água mineral sem gás 500ml', 'Bebidas', 250, 120, 40, 10],
      ['Água mineral com gás 500ml', 'Bebidas', 300, 150, 20, 3],
      ['Refrigerante cola 2L', 'Bebidas', 949, 640, 24, 8],
      ['Refrigerante cola lata 350ml', 'Bebidas', 499, 310, 36, 7],
      ['Refrigerante guaraná 2L', 'Bebidas', 899, 600, 20, 5],
      ['Suco de laranja integral 1L', 'Bebidas', 1290, 860, 12, 3],
      ['Energético 250ml', 'Bebidas', 899, 540, 15, 4],
      ['Cerveja pilsen lata 350ml', 'Bebidas', 449, 280, 48, 6],
      ['Arroz branco tipo 1 5kg', 'Mercearia', 2790, 2150, 12, 5],
      ['Feijão carioca 1kg', 'Mercearia', 849, 620, 15, 5],
      ['Macarrão espaguete 500g', 'Mercearia', 479, 310, 20, 4],
      ['Açúcar refinado 1kg', 'Mercearia', 449, 300, 15, 4],
      ['Óleo de soja 900ml', 'Mercearia', 749, 530, 15, 4],
      ['Café torrado e moído 500g', 'Mercearia', 1890, 1320, 12, 5],
      ['Leite integral 1L', 'Mercearia', 529, 390, 30, 8],
      ['Biscoito recheado chocolate 140g', 'Mercearia', 349, 210, 30, 7],
      ['Pão de forma tradicional 500g', 'Mercearia', 799, 540, 10, 4],
      ['Molho de tomate 340g', 'Mercearia', 399, 240, 15, 3],
      ['Sabonete em barra 90g', 'Higiene e Limpeza', 299, 170, 30, 4],
      ['Shampoo 350ml', 'Higiene e Limpeza', 1590, 980, 10, 2],
      ['Creme dental 90g', 'Higiene e Limpeza', 599, 340, 20, 4],
      ['Papel higiênico 12 rolos', 'Higiene e Limpeza', 2290, 1620, 10, 4],
      ['Detergente líquido 500ml', 'Higiene e Limpeza', 349, 200, 24, 5],
      ['Água sanitária 2L', 'Higiene e Limpeza', 749, 480, 12, 3],
      ['Sabão em pó 1kg', 'Higiene e Limpeza', 1690, 1150, 10, 3],
      ['Desodorante aerossol 150ml', 'Higiene e Limpeza', 1190, 720, 10, 2],
      ['Chocolate ao leite 90g', 'Snacks e Doces', 799, 470, 20, 6],
      ['Salgadinho de milho 100g', 'Snacks e Doces', 699, 420, 20, 5],
      ['Bala de goma 150g', 'Snacks e Doces', 549, 320, 20, 3],
      ['Chiclete menta caixa', 'Snacks e Doces', 399, 220, 24, 4],
      ['Amendoim torrado 200g', 'Snacks e Doces', 599, 350, 12, 2],
      ['Barra de cereal 22g', 'Snacks e Doces', 249, 140, 36, 4],
      ['Caderno espiral 96 folhas', 'Papelaria', 1490, 890, 8, 2],
      ['Caneta esferográfica azul', 'Papelaria', 199, 90, 40, 3],
      ['Lápis preto nº 2', 'Papelaria', 149, 70, 40, 2],
      ['Borracha branca', 'Papelaria', 199, 90, 20, 1],
      ['Cola branca 90g', 'Papelaria', 449, 250, 12, 1],
      ['Pilha alcalina AA (par)', 'Utilidades', 1290, 740, 12, 2],
      ['Lâmpada LED 9W', 'Utilidades', 1490, 890, 10, 2],
      ['Fita adesiva transparente', 'Utilidades', 1190, 660, 10, 1],
      ['Isqueiro', 'Utilidades', 599, 280, 15, 2],
      ['Sacola reutilizável', 'Utilidades', 899, 440, 10, 1],
    ],
    // Reajustes de preço no meio do período (provam que o preço da venda fica gravado no item).
    // nome do produto, data local (AAAA-MM-DD), variação % do preço, variação % do custo
    reajustes: [
      ['Refrigerante cola 2L', '2026-07-01', 6, 5],
      ['Café torrado e moído 500g', '2026-07-15', 10, 9],
      ['Cerveja pilsen lata 350ml', '2026-08-15', 5, 4],
      ['Arroz branco tipo 1 5kg', '2026-08-01', 8, 7],
      ['Leite integral 1L', '2026-09-01', 5, 5],
      ['Óleo de soja 900ml', '2026-09-10', -4, -4],
    ],
    // Produtos descontinuados no meio do período (ficam ativo = 0 no final).
    inativacoes: [
      ['Cola branca 90g', '2026-08-20'],
      ['Amendoim torrado 200g', '2026-09-15'],
    ],
    // Produtos que, na contagem de inventário do último dia, ficam abaixo do mínimo.
    estoqueBaixoFinal: [
      'Refrigerante guaraná 2L',
      'Detergente líquido 500ml',
      'Chocolate ao leite 90g',
      'Pilha alcalina AA (par)',
      'Macarrão espaguete 500g',
    ],
    qtdClientes: 70,
    vendasPorDia: { semana: [4, 8], sabado: [8, 12], domingo: [3, 6] },
    crescimento: 0.3, // o movimento cresce 30% do começo ao fim do período
  },
  {
    nome: 'Papelaria Central',
    descontoMaximo: 5,
    emailDominio: 'papelariacentral.example',
    usuarios: [{ nome: 'Renato Farias', email: 'renato@papelariacentral.example', peso: 1 }],
    categorias: [
      ['Papelaria', 'PAP'],
      ['Escritório', 'ESC'],
    ],
    produtos: [
      ['Resma de papel A4 500 folhas', 'Escritório', 2990, 2200, 10, 6],
      ['Caderno universitário 10 matérias', 'Papelaria', 3490, 2300, 8, 5],
      ['Caneta gel preta', 'Papelaria', 599, 300, 30, 7],
      ['Pasta com elástico', 'Escritório', 890, 450, 15, 4],
      ['Grampeador médio', 'Escritório', 2490, 1500, 6, 2],
      ['Marcador de texto amarelo', 'Papelaria', 449, 220, 20, 5],
    ],
    reajustes: [],
    inativacoes: [],
    estoqueBaixoFinal: ['Grampeador médio'],
    qtdClientes: 8,
    vendasPorDia: { semana: [1, 3], sabado: [1, 2], domingo: [0, 0] },
    crescimento: 0.1,
  },
];

// =====================================================================
// 2. UTILITÁRIOS
// =====================================================================

// Gerador de números pseudoaleatórios com semente fixa (mulberry32).
function criarSorteio(semente) {
  let a = semente >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sorteio = criarSorteio(SEMENTE);
const inteiro = (min, max) => min + Math.floor(sorteio() * (max - min + 1));
const escolher = (lista) => lista[Math.floor(sorteio() * lista.length)];

// Sorteio com pesos: itens = [[valor, peso], ...]
function escolherPeso(itens) {
  const total = itens.reduce((soma, [, peso]) => soma + peso, 0);
  let r = sorteio() * total;
  for (const [valor, peso] of itens) {
    r -= peso;
    if (r < 0) return valor;
  }
  return itens[itens.length - 1][0];
}

// Horário local (Fortaleza) -> objeto Date (instante UTC).
function localParaUtc(ano, mes, dia, hora = 0, min = 0, seg = 0) {
  return new Date(Date.UTC(ano, mes - 1, dia, hora + FUSO_HORAS, min, seg));
}
// Date -> 'AAAA-MM-DD HH:MM:SS' em UTC (formato do DATETIME do MySQL).
function formatarUtc(data) {
  return data.toISOString().slice(0, 19).replace('T', ' ');
}
// Date (UTC) -> componentes do horário local de Fortaleza.
function componentesLocais(data) {
  const d = new Date(data.getTime() - FUSO_HORAS * 3600 * 1000);
  return {
    ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(),
    hora: d.getUTCHours(), diaSemana: d.getUTCDay(),
  };
}
const chaveDia = (ano, mes, dia) =>
  `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

// Dinheiro SEMPRE em centavos inteiros durante a simulação (sem erro de ponto flutuante).
function centavosParaDecimal(c) {
  const sinal = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  return `${sinal}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Valores -> literais SQL.
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}
const dec = (c) => centavosParaDecimal(c); // já é um literal numérico válido

function semAcento(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// =====================================================================
// 3. SIMULAÇÃO
// =====================================================================

// Contadores de id (os ids são gravados explicitamente no seed).
const ids = { empresa: 0, usuario: 0, categoria: 0, produto: 0, cliente: 0, venda: 0, item: 0, pagamento: 0, mov: 0 };

// Tabelas de saída (arrays de objetos).
const T = {
  empresas: [], usuarios: [], categorias: [], produtos: [], clientes: [],
  vendas: [], itens: [], pagamentos: [], movs: [],
};

const fimDoPeriodo = localParaUtc(FIM.ano, FIM.mes, FIM.dia, 22, 0, 0);

function simularEmpresa(cfg) {
  const empresa = {
    id: ++ids.empresa,
    nome: cfg.nome,
    cnpj: null, // opcional no V1; deixamos vazio para não usar o CNPJ de nenhuma empresa real
    desconto_maximo: cfg.descontoMaximo,
    criado_em: localParaUtc(INICIO.ano, INICIO.mes - 2, 1, 9, 0, 0),
  };
  T.empresas.push(empresa);

  const usuarios = cfg.usuarios.map((u) => {
    const linha = {
      id: ++ids.usuario, empresa_id: empresa.id, nome: u.nome, email: u.email,
      senha_hash: SENHA_DEMO_HASH, ativo: 1, criado_em: empresa.criado_em, peso: u.peso,
    };
    T.usuarios.push(linha);
    return linha;
  });
  const admin = usuarios[0];
  const sortearUsuario = () => escolherPeso(usuarios.map((u) => [u, u.peso]));

  const categorias = {};
  const prefixos = {};
  for (const [nome, prefixo] of cfg.categorias) {
    const linha = { id: ++ids.categoria, empresa_id: empresa.id, nome };
    T.categorias.push(linha);
    categorias[nome] = linha;
    prefixos[nome] = prefixo;
  }

  const contadorSku = {};
  const produtos = cfg.produtos.map(([nome, cat, preco, custo, minimo, popularidade]) => {
    contadorSku[cat] = (contadorSku[cat] || 0) + 1;
    const linha = {
      id: ++ids.produto, empresa_id: empresa.id, categoria_id: categorias[cat].id,
      nome, descricao: null,
      sku: `${prefixos[cat]}-${String(contadorSku[cat]).padStart(3, '0')}`,
      preco_venda: preco, custo, estoque_atual: 0, estoque_minimo: minimo,
      criado_em: empresa.criado_em,
      popularidade, inativoDesde: null,
    };
    T.produtos.push(linha);
    return linha;
  });
  const produtoPorNome = Object.fromEntries(produtos.map((p) => [p.nome, p]));

  // Reajustes e inativações indexados pela data local em que passam a valer.
  const reajustesPorDia = {};
  for (const [nome, data, pctPreco, pctCusto] of cfg.reajustes) {
    (reajustesPorDia[data] = reajustesPorDia[data] || []).push({ produto: produtoPorNome[nome], pctPreco, pctCusto });
  }
  const inativacoesPorDia = {};
  for (const [nome, data] of cfg.inativacoes) {
    (inativacoesPorDia[data] = inativacoesPorDia[data] || []).push(produtoPorNome[nome]);
  }

  // Clientes fictícios: uns compram muito, outros pouco (peso decrescente).
  const clientes = [];
  const nomesUsados = new Set();
  const emailsUsados = new Set();
  for (let i = 0; i < cfg.qtdClientes; i++) {
    let nome;
    do {
      nome = `${escolher(PRIMEIROS_NOMES)} ${escolher(SOBRENOMES)} ${escolher(SOBRENOMES)}`;
    } while (nomesUsados.has(nome));
    nomesUsados.add(nome);

    const partes = semAcento(nome).replace(/[^a-z ]/g, '').split(' ');
    let email = sorteio() < 0.8 ? `${partes[0]}.${partes[1]}${inteiro(1, 99)}@email.example` : null;
    if (email && emailsUsados.has(email)) email = null;
    if (email) emailsUsados.add(email);

    const telefone = sorteio() < 0.75 ? `(85) 9${inteiro(1000, 9999)}-${inteiro(1000, 9999)}` : null;
    const diasAntes = inteiro(1, 120); // cadastrado de 1 a 120 dias antes do início do período
    const linha = {
      id: ++ids.cliente, empresa_id: empresa.id, nome, email, telefone, ativo: 1,
      criado_em: localParaUtc(INICIO.ano, INICIO.mes, INICIO.dia - diasAntes, inteiro(8, 20), inteiro(0, 59), inteiro(0, 59)),
      peso: 0,
    };
    clientes.push(linha);
    T.clientes.push(linha);
  }
  // Pesos de popularidade: cliente de posição k (sorteada) tem peso 100 / k^0.8
  clientes
    .map((c) => ({ c, r: sorteio() }))
    .sort((a, b) => a.r - b.r)
    .forEach(({ c }, k) => { c.peso = 100 / Math.pow(k + 1, 0.8); });

  // -------------------------------------------------------------------
  // Alterar estoque = DUAS coisas juntas (como o sistema real fará numa
  // transação): atualizar o saldo do produto E gravar a movimentação com o
  // saldo resultante.
  // -------------------------------------------------------------------
  function movimentar(produto, tipo, quantidade, usuario, quando, { vendaId = null, justificativa = null } = {}) {
    const entra = tipo === 'entrada' || tipo === 'estorno_venda' || tipo === 'ajuste_positivo';
    const novoSaldo = produto.estoque_atual + (entra ? quantidade : -quantidade);
    if (novoSaldo < 0) throw new Error(`Estoque negativo em ${produto.nome}`);
    produto.estoque_atual = novoSaldo;
    T.movs.push({
      id: ++ids.mov, empresa_id: empresa.id, produto_id: produto.id, venda_id: vendaId,
      usuario_id: usuario.id, tipo, quantidade, saldo_apos: novoSaldo, justificativa,
      criado_em: quando,
    });
  }

  const cancelamentosPendentes = {}; // 'AAAA-MM-DD' -> [{ quando, venda }]

  // Registrar uma venda: espelha o fluxo do sistema real.
  // `agendar` insere um evento novo na fila do dia que está sendo processado.
  function registrarVenda(quando, agendar) {
    const disponiveis = produtos.filter((p) => !p.inativoDesde && p.estoque_atual > 0);
    if (disponiveis.length === 0) return;

    const qtdItens = Math.min(escolherPeso([[1, 40], [2, 30], [3, 18], [4, 8], [5, 4]]), disponiveis.length);
    const escolhidos = [];
    const candidatos = disponiveis.slice();
    while (escolhidos.length < qtdItens) {
      const p = escolherPeso(candidatos.map((c) => [c, c.popularidade]));
      candidatos.splice(candidatos.indexOf(p), 1);
      const pedida = escolherPeso([[1, 45], [2, 28], [3, 14], [4, 7], [5, 4], [6, 2]]);
      escolhidos.push({ produto: p, quantidade: Math.min(pedida, p.estoque_atual) }); // nunca acima do estoque
    }

    const subtotal = escolhidos.reduce((s, i) => s + i.quantidade * i.produto.preco_venda, 0);
    let desconto = 0;
    if (sorteio() < 0.18) {
      const permitidos = [3, 5, 10].filter((pct) => pct <= cfg.descontoMaximo);
      desconto = Math.round((subtotal * escolher(permitidos)) / 100);
    }
    const total = subtotal - desconto;

    const cliente = sorteio() < 0.55 ? escolherPeso(clientes.map((c) => [c, c.peso])) : null; // null = consumidor final
    const usuario = sortearUsuario();

    const venda = {
      id: ++ids.venda, empresa_id: empresa.id, cliente_id: cliente ? cliente.id : null,
      usuario_id: usuario.id, data_venda: quando, status: 'confirmada',
      subtotal, desconto, total,
      cancelada_em: null, cancelada_por: null, motivo_cancelamento: null,
      itens: [],
    };
    T.vendas.push(venda);

    for (const { produto, quantidade } of escolhidos) {
      const item = {
        id: ++ids.item, venda_id: venda.id, produto_id: produto.id, quantidade,
        preco_unitario: produto.preco_venda, // CÓPIA do preço do momento
        custo_unitario: produto.custo,       // CÓPIA do custo do momento
        produto,
      };
      venda.itens.push(item);
      T.itens.push(item);
      movimentar(produto, 'saida_venda', quantidade, usuario, quando, { vendaId: venda.id });
    }

    T.pagamentos.push({
      id: ++ids.pagamento, venda_id: venda.id, forma: escolherPeso(FORMAS_PAGAMENTO),
      valor: total, criado_em: quando,
    });

    // ~4% das vendas são canceladas, de 10 min a 30 h depois, sempre em horário comercial.
    if (sorteio() < 0.04) {
      let cancelaEm = new Date(quando.getTime() + inteiro(10 * 60, 30 * 3600) * 1000);
      const loc = componentesLocais(cancelaEm);
      if (loc.hora < 8) {
        cancelaEm = localParaUtc(loc.ano, loc.mes, loc.dia, 8, inteiro(0, 59), inteiro(0, 59));
      } else if (loc.hora >= 21) {
        cancelaEm = localParaUtc(loc.ano, loc.mes, loc.dia + 1, 8, inteiro(0, 59), inteiro(0, 59));
      }
      if (cancelaEm > quando && cancelaEm < fimDoPeriodo) {
        const l = componentesLocais(cancelaEm);
        const chaveCancel = chaveDia(l.ano, l.mes, l.dia);
        const chaveVenda = (() => { const v = componentesLocais(quando); return chaveDia(v.ano, v.mes, v.dia); })();
        if (chaveCancel === chaveVenda) {
          agendar({ t: cancelaEm, tipo: 'cancelamento', venda }); // ainda hoje
        } else {
          (cancelamentosPendentes[chaveCancel] = cancelamentosPendentes[chaveCancel] || []).push({ quando: cancelaEm, venda });
        }
      }
    }
  }

  function cancelarVenda(venda, quando) {
    const quem = sorteio() < 0.5 ? admin : sortearUsuario();
    venda.status = 'cancelada';
    venda.cancelada_em = quando;
    venda.cancelada_por = quem.id;
    venda.motivo_cancelamento = escolher(MOTIVOS_CANCELAMENTO);
    for (const item of venda.itens) {
      movimentar(item.produto, 'estorno_venda', item.quantidade, quem, quando, { vendaId: venda.id });
    }
  }

  // -------------------------------------------------------------------
  // Loop principal: um dia de cada vez.
  // -------------------------------------------------------------------
  const totalDias = Math.round(
    (Date.UTC(FIM.ano, FIM.mes - 1, FIM.dia) - Date.UTC(INICIO.ano, INICIO.mes - 1, INICIO.dia)) / 86400000,
  ) + 1;

  for (let n = 0; n < totalDias; n++) {
    const base = new Date(Date.UTC(INICIO.ano, INICIO.mes - 1, INICIO.dia + n));
    const ano = base.getUTCFullYear();
    const mes = base.getUTCMonth() + 1;
    const dia = base.getUTCDate();
    const diaSemana = base.getUTCDay(); // 0 = domingo
    const chave = chaveDia(ano, mes, dia);
    const ehPrimeiroDia = n === 0;
    const ehUltimoDia = n === totalDias - 1;

    // Reajustes e inativações passam a valer neste dia.
    for (const r of reajustesPorDia[chave] || []) {
      r.produto.preco_venda = Math.round(r.produto.preco_venda * (1 + r.pctPreco / 100));
      r.produto.custo = Math.round(r.produto.custo * (1 + r.pctCusto / 100));
    }
    for (const p of inativacoesPorDia[chave] || []) p.inativoDesde = chave;

    const eventos = [];

    // Carga inicial (primeiro dia, 06:30) ou reposição diária (07:00).
    produtos.forEach((p, i) => {
      if (ehPrimeiroDia) {
        const qtd = p.estoque_minimo * 3 + inteiro(0, p.estoque_minimo * 2);
        eventos.push({ t: localParaUtc(ano, mes, dia, 6, 30, i), tipo: 'carga', produto: p, qtd });
      } else {
        eventos.push({ t: localParaUtc(ano, mes, dia, 7, 0, i), tipo: 'reposicao', produto: p });
      }
    });

    // Vendas do dia (mais movimento no fim da tarde e perto do almoço).
    const faixa = diaSemana === 0 ? cfg.vendasPorDia.domingo
      : diaSemana === 6 ? cfg.vendasPorDia.sabado : cfg.vendasPorDia.semana;
    const fatorCrescimento = 1 + cfg.crescimento * (n / (totalDias - 1));
    const qtdVendas = faixa[1] === 0 ? 0 : Math.round(inteiro(faixa[0], faixa[1]) * fatorCrescimento);
    for (let i = 0; i < qtdVendas; i++) {
      const hora = escolherPeso([
        [8, 3], [9, 4], [10, 5], [11, 7], [12, 8], [13, 6], [14, 4], [15, 4], [16, 5], [17, 8], [18, 9], [19, 8], [20, 5],
      ]);
      eventos.push({ t: localParaUtc(ano, mes, dia, hora, inteiro(0, 59), inteiro(0, 59)), tipo: 'venda' });
    }

    // Ajuste manual ocasional (avaria/perda ou correção de contagem).
    if (sorteio() < 0.04) {
      eventos.push({ t: localParaUtc(ano, mes, dia, inteiro(9, 20), inteiro(0, 59), 0), tipo: 'ajuste' });
    }

    // Cancelamentos que foram agendados para este dia.
    for (const c of cancelamentosPendentes[chave] || []) {
      eventos.push({ t: c.quando, tipo: 'cancelamento', venda: c.venda });
    }

    // Contagem de inventário do último dia: deixa alguns produtos com estoque baixo.
    if (ehUltimoDia) {
      cfg.estoqueBaixoFinal.forEach((nome, i) => {
        eventos.push({ t: localParaUtc(ano, mes, dia, 21, 30, i), tipo: 'inventario', produto: produtoPorNome[nome] });
      });
    }

    // Processa em ordem cronológica: ids e saldos ficam coerentes com o tempo.
    eventos.sort((a, b) => a.t - b.t);
    let i = 0;
    const agendar = (novo) => {
      const resto = eventos.splice(i + 1);
      resto.push(novo);
      resto.sort((a, b) => a.t - b.t);
      eventos.push(...resto);
    };

    for (i = 0; i < eventos.length; i++) {
      const ev = eventos[i];
      if (ev.tipo === 'carga') {
        movimentar(ev.produto, 'entrada', ev.qtd, admin, ev.t, { justificativa: 'Carga inicial de estoque' });
      } else if (ev.tipo === 'reposicao') {
        const p = ev.produto;
        if (!p.inativoDesde && p.estoque_atual <= p.estoque_minimo && sorteio() < 0.8) {
          const qtd = p.estoque_minimo * 4 + inteiro(0, p.estoque_minimo);
          movimentar(p, 'entrada', qtd, admin, ev.t, { justificativa: 'Reposição de fornecedor' });
        }
      } else if (ev.tipo === 'ajuste') {
        const p = escolher(produtos.filter((x) => !x.inativoDesde));
        if (sorteio() < 0.7 && p.estoque_atual > 0) {
          const qtd = Math.min(inteiro(1, 3), p.estoque_atual);
          movimentar(p, 'ajuste_negativo', qtd, sortearUsuario(), ev.t, { justificativa: 'Avaria ou perda identificada na conferência' });
        } else {
          movimentar(p, 'ajuste_positivo', inteiro(1, 2), sortearUsuario(), ev.t, { justificativa: 'Correção de contagem de inventário' });
        }
      } else if (ev.tipo === 'inventario') {
        const p = ev.produto;
        const alvo = Math.max(0, p.estoque_minimo - inteiro(1, Math.max(1, Math.floor(p.estoque_minimo / 2))));
        if (p.estoque_atual > alvo) {
          movimentar(p, 'ajuste_negativo', p.estoque_atual - alvo, admin, ev.t, { justificativa: 'Divergência apurada na contagem de inventário' });
        }
      } else if (ev.tipo === 'venda') {
        registrarVenda(ev.t, agendar);
      } else if (ev.tipo === 'cancelamento') {
        cancelarVenda(ev.venda, ev.t);
      }
    }
  }
}

EMPRESAS.forEach(simularEmpresa);

// =====================================================================
// 4. VALIDAÇÃO INTERNA (o próprio script confere se os dados são coerentes)
// =====================================================================
function validar() {
  const erros = [];
  const empresaPorId = Object.fromEntries(T.empresas.map((e) => [e.id, e]));

  // Saldo de cada produto = saldo da última movimentação dele.
  const ultimoSaldo = {};
  for (const m of T.movs) ultimoSaldo[m.produto_id] = m.saldo_apos;
  for (const p of T.produtos) {
    if (ultimoSaldo[p.id] !== p.estoque_atual) erros.push(`Saldo do produto ${p.id} não bate com o histórico`);
  }

  const pagamentoPorVenda = Object.fromEntries(T.pagamentos.map((p) => [p.venda_id, p]));
  for (const v of T.vendas) {
    const soma = v.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
    if (soma !== v.subtotal) erros.push(`Subtotal da venda ${v.id} não bate com os itens`);
    if (v.total !== v.subtotal - v.desconto) erros.push(`Total da venda ${v.id} incorreto`);
    if (pagamentoPorVenda[v.id].valor !== v.total) erros.push(`Pagamento da venda ${v.id} diferente do total`);
    const maxPct = empresaPorId[v.empresa_id].desconto_maximo;
    if (v.desconto > Math.ceil((v.subtotal * maxPct) / 100)) erros.push(`Desconto da venda ${v.id} acima do limite`);
    if (v.status === 'cancelada' && v.cancelada_em <= v.data_venda) erros.push(`Venda ${v.id} cancelada antes de existir`);
  }

  // Toda venda cancelada tem estorno de cada item; toda venda tem saída de cada item.
  const movsPorVenda = {};
  for (const m of T.movs.filter((x) => x.venda_id)) (movsPorVenda[m.venda_id] = movsPorVenda[m.venda_id] || []).push(m);
  for (const v of T.vendas) {
    const ms = movsPorVenda[v.id] || [];
    const saidas = ms.filter((m) => m.tipo === 'saida_venda').length;
    const estornos = ms.filter((m) => m.tipo === 'estorno_venda').length;
    if (saidas !== v.itens.length) erros.push(`Venda ${v.id}: saídas de estoque != itens`);
    if (estornos !== (v.status === 'cancelada' ? v.itens.length : 0)) erros.push(`Venda ${v.id}: estornos inconsistentes`);
  }

  // Movimentações em ordem cronológica dentro de cada produto.
  const ultimaData = {};
  for (const m of T.movs) {
    if (ultimaData[m.produto_id] && m.criado_em < ultimaData[m.produto_id]) erros.push(`Movimentação fora de ordem no produto ${m.produto_id}`);
    ultimaData[m.produto_id] = m.criado_em;
  }
  return erros;
}

const erros = validar();
if (erros.length) {
  console.error('Dados inconsistentes:\n' + erros.slice(0, 20).join('\n'));
  process.exit(1);
}

// =====================================================================
// 5. ESCRITA DO seed.sql
// =====================================================================
const saida = [];
const tamanhoLote = 500;

function inserir(tabela, colunas, linhas) {
  if (linhas.length === 0) return;
  saida.push(`-- ${tabela}: ${linhas.length} linha(s)`);
  for (let i = 0; i < linhas.length; i += tamanhoLote) {
    const lote = linhas.slice(i, i + tamanhoLote).map((l) => `  (${l.join(', ')})`);
    saida.push(`INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES\n${lote.join(',\n')};`);
  }
  saida.push('');
}

saida.push(`-- =====================================================================
-- SalesFlow - Dados fictícios (GERADO AUTOMATICAMENTE)
-- Não edite à mão: rode  node database/seed/gerar-seed.js  para regenerar.
--
-- Todos os nomes, e-mails e telefones são inventados.
-- Usuários de demonstração (senha de todos: salesflow123):
${T.usuarios.map((u) => `--   ${u.email.padEnd(34)} ${T.empresas.find((e) => e.id === u.empresa_id).nome}`).join('\n')}
--
-- Rode DEPOIS do schema.sql:
--   mysql -u root -p --default-character-set=utf8mb4 < database/seed.sql
-- =====================================================================

SET NAMES utf8mb4;
USE salesflow;
SET autocommit = 0;
`);

inserir('empresas', ['id', 'nome', 'cnpj', 'desconto_maximo', 'criado_em'],
  T.empresas.map((e) => [e.id, lit(e.nome), lit(e.cnpj), e.desconto_maximo.toFixed(2), lit(formatarUtc(e.criado_em))]));

inserir('usuarios', ['id', 'empresa_id', 'nome', 'email', 'senha_hash', 'ativo', 'criado_em'],
  T.usuarios.map((u) => [u.id, u.empresa_id, lit(u.nome), lit(u.email), lit(u.senha_hash), u.ativo, lit(formatarUtc(u.criado_em))]));

inserir('categorias', ['id', 'empresa_id', 'nome'],
  T.categorias.map((c) => [c.id, c.empresa_id, lit(c.nome)]));

inserir('produtos',
  ['id', 'empresa_id', 'categoria_id', 'nome', 'descricao', 'sku', 'preco_venda', 'custo', 'estoque_atual', 'estoque_minimo', 'ativo', 'criado_em'],
  T.produtos.map((p) => [p.id, p.empresa_id, p.categoria_id, lit(p.nome), lit(p.descricao), lit(p.sku),
    dec(p.preco_venda), dec(p.custo), p.estoque_atual, p.estoque_minimo, p.inativoDesde ? 0 : 1, lit(formatarUtc(p.criado_em))]));

inserir('clientes', ['id', 'empresa_id', 'nome', 'email', 'telefone', 'ativo', 'criado_em'],
  T.clientes.map((c) => [c.id, c.empresa_id, lit(c.nome), lit(c.email), lit(c.telefone), c.ativo, lit(formatarUtc(c.criado_em))]));

inserir('vendas',
  ['id', 'empresa_id', 'cliente_id', 'usuario_id', 'data_venda', 'status', 'subtotal', 'desconto', 'total', 'cancelada_em', 'cancelada_por', 'motivo_cancelamento'],
  T.vendas.map((v) => [v.id, v.empresa_id, lit(v.cliente_id), v.usuario_id, lit(formatarUtc(v.data_venda)), lit(v.status),
    dec(v.subtotal), dec(v.desconto), dec(v.total),
    lit(v.cancelada_em ? formatarUtc(v.cancelada_em) : null), lit(v.cancelada_por), lit(v.motivo_cancelamento)]));

inserir('itens_venda', ['id', 'venda_id', 'produto_id', 'quantidade', 'preco_unitario', 'custo_unitario'],
  T.itens.map((i) => [i.id, i.venda_id, i.produto_id, i.quantidade, dec(i.preco_unitario), dec(i.custo_unitario)]));

inserir('pagamentos', ['id', 'venda_id', 'forma', 'valor', 'criado_em'],
  T.pagamentos.map((p) => [p.id, p.venda_id, lit(p.forma), dec(p.valor), lit(formatarUtc(p.criado_em))]));

inserir('movimentacoes_estoque',
  ['id', 'empresa_id', 'produto_id', 'venda_id', 'usuario_id', 'tipo', 'quantidade', 'saldo_apos', 'justificativa', 'criado_em'],
  T.movs.map((m) => [m.id, m.empresa_id, m.produto_id, lit(m.venda_id), m.usuario_id, lit(m.tipo), m.quantidade, m.saldo_apos,
    lit(m.justificativa), lit(formatarUtc(m.criado_em))]));

saida.push('COMMIT;\n');

const destino = path.join(__dirname, '..', 'seed.sql');
fs.writeFileSync(destino, saida.join('\n'), 'utf8');

// =====================================================================
// 6. RESUMO NO TERMINAL
// =====================================================================
console.log(`Arquivo gerado: ${destino}`);
for (const e of T.empresas) {
  const vendas = T.vendas.filter((v) => v.empresa_id === e.id);
  const conf = vendas.filter((v) => v.status === 'confirmada');
  const fat = conf.reduce((s, v) => s + v.total, 0);
  const prods = T.produtos.filter((p) => p.empresa_id === e.id);
  console.log(`\n${e.nome}`);
  console.log(`  produtos: ${prods.length} (inativos: ${prods.filter((p) => p.inativoDesde).length}, estoque baixo: ${prods.filter((p) => !p.inativoDesde && p.estoque_atual <= p.estoque_minimo).length})`);
  console.log(`  clientes: ${T.clientes.filter((c) => c.empresa_id === e.id).length}`);
  console.log(`  vendas: ${vendas.length} (confirmadas: ${conf.length}, canceladas: ${vendas.length - conf.length})`);
  console.log(`  faturamento (confirmadas): R$ ${centavosParaDecimal(fat)} | ticket médio: R$ ${conf.length ? centavosParaDecimal(Math.round(fat / conf.length)) : '0.00'}`);
}
console.log(`\nLinhas: itens_venda=${T.itens.length}, pagamentos=${T.pagamentos.length}, movimentacoes=${T.movs.length}`);

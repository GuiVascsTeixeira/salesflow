// Regras de negócio de vendas: validação da entrada, preço, estoque e desconto.
import { AppError } from '../utils/AppError.js';
import { paraCentavos, centavosParaDecimal } from '../utils/dinheiro.js';
import { buscarNomeEmpresa, listarProdutosDoBanco } from '../repositories/produtos.repository.js';
import { listarClientesDoBanco } from '../repositories/clientes.repository.js';
import {
  buscarDescontoMaximo,
  listarVendasDoBanco,
  resumirVendasDoFiltro,
  VENDAS_POR_PAGINA,
  buscarVendaDaEmpresa,
  contarVendasPorStatus,
  registrarVendaNoBanco,
  cancelarVendaNoBanco,
} from '../repositories/vendas.repository.js';

const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito'];
const MAXIMO_ITENS = 50;
const MAXIMO_QUANTIDADE = 100000;

function idPositivo(valor, campo = 'Identificador') {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(400, `${campo} inválido.`, 'DADO_INVALIDO');
  }
  return id;
}

function normalizarFiltros(filtros = {}) {
  return {
    busca: typeof filtros.busca === 'string' ? filtros.busca.trim().slice(0, 100) : '',
    status: ['confirmadas', 'canceladas'].includes(filtros.status) ? filtros.status : 'todas',
    pagina: Math.min(Math.max(parseInt(filtros.pagina, 10) || 1, 1), 100000),
  };
}

// ---------------------------------------------------------------- consultas

export async function obterDadosPaginaVendas(empresaId, filtros = {}) {
  const id = idPositivo(empresaId, 'Empresa');
  const filtrosNormalizados = normalizarFiltros(filtros);
  const [vendas, resumoFiltro, totais, empresaNome, clientes, produtos, descontoMaximo] = await Promise.all([
    listarVendasDoBanco(id, filtrosNormalizados),
    resumirVendasDoFiltro(id, filtrosNormalizados),
    contarVendasPorStatus(id),
    buscarNomeEmpresa(id),
    listarClientesDoBanco(id, { status: 'ativos' }),
    listarProdutosDoBanco(id, { status: 'ativos' }),
    buscarDescontoMaximo(id),
  ]);

  // Paginação: se pediram uma página além do fim, mostramos a última.
  const totalVendas = Number(resumoFiltro.total);
  const totalPaginas = Math.max(1, Math.ceil(totalVendas / VENDAS_POR_PAGINA));
  const paginacao = {
    pagina: Math.min(filtrosNormalizados.pagina, totalPaginas),
    totalPaginas,
    total: totalVendas,
    porPagina: VENDAS_POR_PAGINA,
  };
  if (paginacao.pagina !== filtrosNormalizados.pagina) {
    return obterDadosPaginaVendas(empresaId, { ...filtros, pagina: paginacao.pagina });
  }

  // Dados usados pelo formulário "Nova venda". O preço aqui serve só para
  // mostrar a prévia na tela; o servidor sempre recalcula com o preço do banco.
  const catalogo = {
    descontoMaximo,
    clientes: clientes.map((c) => ({ id: c.id, nome: c.nome })),
    produtos: produtos
      .filter((p) => Number(p.estoque_atual) > 0)
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        sku: p.sku,
        preco: p.preco_venda,
        estoque: Number(p.estoque_atual),
      })),
  };

  return {
    vendas,
    totais,
    paginacao,
    empresaNome,
    catalogo,
    faturamento: centavosParaDecimal(paraCentavos(resumoFiltro.faturamento)),
  };
}

export async function obterVendas(empresaId, filtros = {}) {
  return listarVendasDoBanco(idPositivo(empresaId, 'Empresa'), normalizarFiltros(filtros));
}

export async function obterVenda(empresaId, vendaId) {
  const venda = await buscarVendaDaEmpresa(
    idPositivo(empresaId, 'Empresa'),
    idPositivo(vendaId, 'Venda'),
  );
  if (!venda) throw new AppError(404, 'Venda não encontrada.', 'NAO_ENCONTRADO');
  return venda;
}

// --------------------------------------------------------------- nova venda

// Valida o formato do que veio da tela (sem consultar o banco ainda).
function validarEntradaVenda(dados) {
  const forma = dados.forma;
  if (!FORMAS_PAGAMENTO.includes(forma)) {
    throw new AppError(400, 'Selecione uma forma de pagamento válida.', 'DADO_INVALIDO');
  }

  const clienteId = dados.clienteId === '' || dados.clienteId == null
    ? null
    : idPositivo(dados.clienteId, 'Cliente');

  const bruto = dados.descontoPercentual;
  const percentual = bruto === '' || bruto == null ? 0 : Number(String(bruto).replace(',', '.'));
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    throw new AppError(400, 'O desconto deve ser um percentual entre 0 e 100.', 'DADO_INVALIDO');
  }
  // Duas casas decimais no máximo (ex.: 7,5%). Em centésimos de ponto: 750.
  const percentualCentesimos = Math.round(percentual * 100);
  if (Math.abs(percentualCentesimos - percentual * 100) > 1e-6) {
    throw new AppError(400, 'O desconto aceita no máximo duas casas decimais.', 'DADO_INVALIDO');
  }

  if (!Array.isArray(dados.itens) || dados.itens.length === 0) {
    throw new AppError(400, 'Adicione pelo menos um produto à venda.', 'DADO_OBRIGATORIO');
  }
  if (dados.itens.length > MAXIMO_ITENS) {
    throw new AppError(400, `Uma venda pode ter no máximo ${MAXIMO_ITENS} itens.`, 'DADO_INVALIDO');
  }

  // Se o mesmo produto aparecer em duas linhas, somamos as quantidades
  // (o banco permite só uma linha por produto em cada venda).
  const quantidades = new Map();
  for (const item of dados.itens) {
    const produtoId = idPositivo(item?.produtoId, 'Produto');
    const quantidade = Number(item?.quantidade);
    if (!Number.isSafeInteger(quantidade) || quantidade <= 0 || quantidade > MAXIMO_QUANTIDADE) {
      throw new AppError(400, 'A quantidade de cada item deve ser um número inteiro maior que zero.', 'DADO_INVALIDO');
    }
    quantidades.set(produtoId, (quantidades.get(produtoId) ?? 0) + quantidade);
  }

  return {
    clienteId,
    forma,
    percentualCentesimos,
    itens: [...quantidades].map(([produtoId, quantidade]) => ({ produtoId, quantidade })),
  };
}

// Proteção contra envio duplicado (duplo clique, reenvio por rede lenta).
// A tela gera uma chave única ao abrir o formulário e a envia junto com a venda.
// Se a MESMA chave chegar de novo em até 10 minutos, devolvemos a venda já
// criada em vez de registrar outra. Fica na memória do servidor (1 instância).
const CHAVE_VALIDA = /^[A-Za-z0-9-]{8,64}$/;
const VENDAS_RECENTES = new Map(); // chave -> { promessa, expiraEm }
const VALIDADE_CHAVE_MS = 10 * 60 * 1000;

function limparChavesVelhas() {
  const agora = Date.now();
  for (const [chave, item] of VENDAS_RECENTES) {
    if (item.expiraEm < agora) VENDAS_RECENTES.delete(chave);
  }
}

export async function criarVenda(empresaId, usuarioId, dados) {
  const chave = typeof dados.chaveEnvio === 'string' && CHAVE_VALIDA.test(dados.chaveEnvio)
    ? `${empresaId}:${usuarioId}:${dados.chaveEnvio}`
    : null;
  if (!chave) return registrarNovaVenda(empresaId, usuarioId, dados);

  limparChavesVelhas();
  const existente = VENDAS_RECENTES.get(chave);
  if (existente) return existente.promessa;

  const promessa = registrarNovaVenda(empresaId, usuarioId, dados);
  VENDAS_RECENTES.set(chave, { promessa, expiraEm: Date.now() + VALIDADE_CHAVE_MS });
  // Se a venda falhar (ex.: estoque insuficiente), libera a chave para nova tentativa.
  promessa.catch(() => VENDAS_RECENTES.delete(chave));
  return promessa;
}

async function registrarNovaVenda(empresaId, usuarioId, dados) {
  const entrada = validarEntradaVenda(dados);

  // Esta função roda DENTRO da transação (chamada pelo repository), já com
  // os produtos travados no banco. Ela decide preço, estoque e desconto.
  function montarVenda({ produtos, cliente, descontoMaximo }) {
    if (entrada.clienteId && !cliente) {
      throw new AppError(400, 'Selecione um cliente ativo da sua empresa ou deixe em branco (consumidor final).', 'DADO_INVALIDO');
    }

    const porId = new Map(produtos.map((p) => [Number(p.id), p]));
    let subtotalCentavos = 0;

    const itens = entrada.itens.map(({ produtoId, quantidade }) => {
      const produto = porId.get(produtoId);
      if (!produto || !produto.ativo) {
        throw new AppError(400, 'Um dos produtos não existe ou está inativo.', 'PRODUTO_INVALIDO');
      }
      const saldo = Number(produto.estoque_atual);
      if (quantidade > saldo) {
        throw new AppError(
          409,
          `Estoque insuficiente para "${produto.nome}". Disponível: ${saldo}.`,
          'ESTOQUE_INSUFICIENTE',
        );
      }
      // O preço vem do BANCO, nunca da tela.
      const precoCentavos = paraCentavos(produto.preco_venda);
      subtotalCentavos += precoCentavos * quantidade;
      return {
        produtoId,
        quantidade,
        precoUnitario: centavosParaDecimal(precoCentavos),
        custoUnitario: centavosParaDecimal(paraCentavos(produto.custo)),
        saldoApos: saldo - quantidade,
      };
    });

    if (entrada.percentualCentesimos > Math.round(descontoMaximo * 100)) {
      throw new AppError(
        409,
        `O desconto máximo permitido pela empresa é ${descontoMaximo}%.`,
        'DESCONTO_ACIMA_DO_LIMITE',
      );
    }

    // desconto = subtotal × percentual, com contas só de inteiros.
    const descontoCentavos = Math.round(
      (subtotalCentavos * entrada.percentualCentesimos) / 10000,
    );
    const totalCentavos = subtotalCentavos - descontoCentavos;

    if (subtotalCentavos <= 0 || totalCentavos <= 0) {
      throw new AppError(400, 'O total da venda deve ser maior que zero.', 'DADO_INVALIDO');
    }

    return {
      itens,
      subtotal: centavosParaDecimal(subtotalCentavos),
      desconto: centavosParaDecimal(descontoCentavos),
      total: centavosParaDecimal(totalCentavos),
    };
  }

  const vendaId = await registrarVendaNoBanco(
    idPositivo(empresaId, 'Empresa'),
    idPositivo(usuarioId, 'Usuário'),
    entrada,
    montarVenda,
  );
  return { id: vendaId, mensagem: `Venda #${vendaId} registrada com sucesso.` };
}

// -------------------------------------------------------------- cancelamento

export async function cancelarVenda(empresaId, usuarioId, vendaId, dados) {
  const motivo = typeof dados.motivo === 'string' ? dados.motivo.trim() : '';
  if (motivo.length < 3) {
    throw new AppError(400, 'Informe o motivo do cancelamento (mínimo de 3 caracteres).', 'DADO_OBRIGATORIO');
  }
  if (motivo.length > 255) {
    throw new AppError(400, 'O motivo deve ter no máximo 255 caracteres.', 'DADO_INVALIDO');
  }

  await cancelarVendaNoBanco(
    idPositivo(empresaId, 'Empresa'),
    idPositivo(usuarioId, 'Usuário'),
    idPositivo(vendaId, 'Venda'),
    motivo,
  );
  return { mensagem: 'Venda cancelada. O estoque foi devolvido.' };
}

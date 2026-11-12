// Regras dos relatórios: valida o período e prepara os números (em centavos).
import { AppError } from '../utils/AppError.js';
import { paraCentavos, centavosParaDecimal } from '../utils/dinheiro.js';
import { buscarNomeEmpresa } from '../repositories/produtos.repository.js';
import { buscarRelatorio, listarVendasParaCsv } from '../repositories/relatorios.repository.js';
import {
  obterHojeEmFortaleza,
  adicionarDias,
  inicioDoDiaUtc,
} from './dashboard.service.js';

const MAXIMO_DIAS = 731; // ~2 anos
const FORMAS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
};

function dataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

// Período padrão: últimos 30 dias (hoje incluído), no horário de Fortaleza.
export function resolverPeriodo({ inicio, fim } = {}) {
  const hoje = obterHojeEmFortaleza();
  const fimFinal = fim ?? hoje;
  const inicioFinal = inicio ?? adicionarDias(fimFinal, -29);

  if (!dataValida(inicioFinal) || !dataValida(fimFinal)) {
    throw new AppError(400, 'Informe as datas no formato AAAA-MM-DD.', 'DADO_INVALIDO');
  }
  if (inicioFinal > fimFinal) {
    throw new AppError(400, 'A data inicial não pode ser depois da data final.', 'DADO_INVALIDO');
  }
  const dias = (Date.parse(`${fimFinal}T12:00:00Z`) - Date.parse(`${inicioFinal}T12:00:00Z`)) / 86400000 + 1;
  if (dias > MAXIMO_DIAS) {
    throw new AppError(400, `O período máximo é de ${MAXIMO_DIAS} dias.`, 'DADO_INVALIDO');
  }

  return {
    inicio: inicioFinal,
    fim: fimFinal,
    // fim é INCLUSIVO para o usuário; no banco usamos "< dia seguinte 00h".
    inicioUtc: inicioDoDiaUtc(inicioFinal),
    fimUtc: inicioDoDiaUtc(adicionarDias(fimFinal, 1)),
  };
}

const num = (v) => Number(v ?? 0);
const dinheiro = (v) => centavosParaDecimal(paraCentavos(v));

export async function obterRelatorio(empresaId, filtros) {
  const periodo = resolverPeriodo(filtros);
  const dados = await buscarRelatorio(empresaId, periodo);

  const faturamento = paraCentavos(dados.resumo.faturamento);
  const custo = paraCentavos(dados.custo.custo);
  const lucro = faturamento - custo;
  const vendas = num(dados.resumo.vendas);

  // Preenche os dias sem venda com zero, para o gráfico não "pular" datas.
  const porDiaMapa = new Map(
    dados.porDia.map((l) => [(l.dia instanceof Date ? l.dia.toISOString() : String(l.dia)).slice(0, 10), l]),
  );
  const porDia = [];
  for (let d = periodo.inicio; d <= periodo.fim; d = adicionarDias(d, 1)) {
    const l = porDiaMapa.get(d);
    porDia.push({ dia: d, vendas: num(l?.vendas), faturamento: dinheiro(l?.faturamento ?? 0) });
  }

  return {
    periodo: { inicio: periodo.inicio, fim: periodo.fim },
    resumo: {
      vendas,
      faturamento: centavosParaDecimal(faturamento),
      descontos: dinheiro(dados.resumo.descontos),
      custo: centavosParaDecimal(custo),
      lucroBruto: centavosParaDecimal(lucro),
      margemPercentual: faturamento > 0 ? Math.round((lucro / faturamento) * 1000) / 10 : 0,
      ticketMedio: vendas > 0 ? centavosParaDecimal(Math.round(faturamento / vendas)) : '0.00',
      unidades: num(dados.custo.unidades),
      canceladas: num(dados.canceladas.quantidade),
      valorCancelado: dinheiro(dados.canceladas.valor),
    },
    porDia,
    porForma: dados.porForma.map((l) => ({
      forma: l.forma, rotulo: FORMAS[l.forma] ?? l.forma, vendas: num(l.vendas), valor: dinheiro(l.valor),
    })),
    topProdutos: dados.topProdutos.map((l) => ({
      id: l.id, nome: l.nome, unidades: num(l.unidades),
      faturamento: dinheiro(l.faturamento), lucro: dinheiro(l.lucro),
    })),
    porCategoria: dados.porCategoria.map((l) => ({
      nome: l.nome, unidades: num(l.unidades), faturamento: dinheiro(l.faturamento),
    })),
    porVendedor: dados.porVendedor.map((l) => ({
      nome: l.nome, vendas: num(l.vendas), faturamento: dinheiro(l.faturamento),
    })),
    estoqueCritico: dados.estoqueCritico.map((l) => ({
      id: l.id, nome: l.nome, sku: l.sku,
      estoqueAtual: num(l.estoque_atual), estoqueMinimo: num(l.estoque_minimo),
    })),
  };
}

export async function obterDadosPaginaRelatorios(empresaId, filtros) {
  const periodo = resolverPeriodo(filtros);
  return { empresaNome: await buscarNomeEmpresa(empresaId), inicio: periodo.inicio, fim: periodo.fim };
}

// Célula de CSV: aspas duplicadas; texto que começa com = + - @ ganha um
// apóstrofo para o Excel não interpretar como fórmula (CSV injection).
function celula(valor) {
  let texto = String(valor ?? '');
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replaceAll('"', '""')}"`;
}

export async function gerarCsvVendas(empresaId, filtros) {
  const periodo = resolverPeriodo(filtros);
  const linhas = await listarVendasParaCsv(empresaId, periodo);
  const decimalBR = (v) => String(v).replace('.', ',');
  const cabecalho = ['Venda', 'Data', 'Cliente', 'Vendedor', 'Status', 'Forma de pagamento', 'Subtotal', 'Desconto', 'Total'];
  const corpo = linhas.map((l) => [
    l.id, l.data, l.cliente, l.vendedor, l.status, FORMAS[l.forma] ?? l.forma,
    decimalBR(l.subtotal), decimalBR(l.desconto), decimalBR(l.total),
  ].map(celula).join(';'));
  // BOM (﻿) faz o Excel abrir os acentos corretamente.
  return {
    nomeArquivo: `vendas_${periodo.inicio}_a_${periodo.fim}.csv`,
    conteudo: `﻿${[cabecalho.map(celula).join(';'), ...corpo].join('\r\n')}\r\n`,
  };
}

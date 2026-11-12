// Service do dashboard: define os períodos e prepara os dados para a tela.
import { buscarDadosDashboard } from '../repositories/dashboard.repository.js';

const FUSO_HORARIO = 'America/Fortaleza';

function paraDataIso(data) {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function obterHojeEmFortaleza() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_HORARIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

export function adicionarDias(dataIso, quantidade) {
  const data = new Date(`${dataIso}T12:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() + quantidade);
  return paraDataIso(data);
}

// O banco guarda DATETIME em UTC. Fortaleza usa UTC-3: meia-noite local = 03h UTC.
export function inicioDoDiaUtc(dataIso) {
  return new Date(`${dataIso}T03:00:00.000Z`);
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(valor ?? 0));
}

function normalizarDiaBanco(valor) {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

function rotuloDia(dataIso) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(`${dataIso}T12:00:00.000Z`))
    .replace('.', '')
    .toUpperCase();
}

export async function obterDadosDashboard(empresaId) {
  const id = Number(empresaId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('A sessão não possui uma empresa válida.');
  }

  const hoje = obterHojeEmFortaleza();
  const [ano, mes] = hoje.split('-').map(Number);
  const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const proximoMes = paraDataIso(new Date(Date.UTC(ano, mes, 1)));
  const inicioSeteDias = adicionarDias(hoje, -6);
  const amanha = adicionarDias(hoje, 1);

  const dados = await buscarDadosDashboard(id, {
    inicioMesUtc: inicioDoDiaUtc(inicioMes),
    proximoMesUtc: inicioDoDiaUtc(proximoMes),
    inicioSeteDiasUtc: inicioDoDiaUtc(inicioSeteDias),
    inicioAmanhaUtc: inicioDoDiaUtc(amanha),
  });

  const vendasDiaPorData = new Map(
    dados.vendasPorDia.map((linha) => [normalizarDiaBanco(linha.dia), linha]),
  );
  const dias = Array.from({ length: 7 }, (_, indice) => adicionarDias(inicioSeteDias, indice));
  const valoresDosDias = dias.map((dia) => Number(vendasDiaPorData.get(dia)?.faturamento ?? 0));
  const maiorValor = Math.max(...valoresDosDias, 0);

  const graficoVendas = dias.map((dia, indice) => {
    const faturamento = valoresDosDias[indice];
    return {
      rotulo: rotuloDia(dia),
      valorLabel: faturamento > 0 ? formatarMoeda(faturamento) : '—',
      altura: maiorValor > 0 && faturamento > 0
        ? Math.max(7, Math.round((faturamento / maiorValor) * 100))
        : 0,
      temVenda: faturamento > 0,
    };
  });

  const resumo = dados.resumo;
  const mesAtualLabel = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${inicioMes}T12:00:00.000Z`));

  return {
    empresaNome: dados.empresaNome || 'Sua empresa',
    dataAtualLabel: new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'full',
      timeZone: FUSO_HORARIO,
    }).format(new Date()),
    mesAtualLabel: mesAtualLabel.charAt(0).toUpperCase() + mesAtualLabel.slice(1),
    indicadores: {
      faturamentoMes: formatarMoeda(resumo.faturamento_mes),
      vendasMes: Number(resumo.vendas_mes ?? 0),
      produtosAtivos: Number(resumo.produtos_ativos ?? 0),
      estoqueBaixo: Number(resumo.estoque_baixo ?? 0),
      clientesAtivos: Number(resumo.clientes_ativos ?? 0),
    },
    graficoVendas,
    temVendasNoGrafico: valoresDosDias.some((valor) => valor > 0),
    produtosMaisVendidos: dados.produtosMaisVendidos.map((produto) => ({
      nome: produto.nome,
      unidades: Number(produto.unidades ?? 0),
      faturamentoFormatado: formatarMoeda(produto.faturamento),
    })),
    vendasRecentes: dados.vendasRecentes.map((venda) => ({
      id: venda.id,
      cliente: venda.cliente,
      dataFormatada: venda.data_formatada,
      totalFormatado: formatarMoeda(venda.total),
      statusLabel: venda.status === 'confirmada' ? 'Confirmada' : 'Cancelada',
      statusClasse: venda.status === 'confirmada' ? 'is-confirmed' : 'is-cancelled',
    })),
  };
}

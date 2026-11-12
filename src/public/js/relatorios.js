// Página de relatórios: busca os números na API e desenha os gráficos (Chart.js).
const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const inteiro = (v) => Number(v).toLocaleString('pt-BR');
const form = document.getElementById('form-periodo');
const aviso = document.getElementById('mensagem-relatorio');
const graficos = {};

function texto(id, valor) { document.getElementById(id).textContent = valor; }

// Preenche uma tabela usando textContent (nunca innerHTML) com dados do banco.
function preencherTabela(id, linhas, vazio) {
  const corpo = document.getElementById(id);
  corpo.replaceChildren();
  if (!linhas.length) {
    const tr = corpo.insertRow();
    const td = tr.insertCell();
    td.colSpan = 4;
    td.className = 'sf-empty-cell';
    td.textContent = vazio;
    return;
  }
  linhas.forEach((celulas) => {
    const tr = corpo.insertRow();
    celulas.forEach((valor) => { tr.insertCell().textContent = valor; });
  });
}

function desenhar(id, config) {
  graficos[id]?.destroy();
  graficos[id] = new Chart(document.getElementById(id), {
    ...config,
    options: { responsive: true, maintainAspectRatio: false, ...(config.options || {}) },
  });
}

const CORES = ['#24b98a', '#4f7cff', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#ec4899'];

function mostrar(r) {
  const s = r.resumo;
  texto('kpi-faturamento', moeda(s.faturamento));
  texto('kpi-vendas', `${inteiro(s.vendas)} venda(s) confirmada(s)`);
  texto('kpi-lucro', moeda(s.lucroBruto));
  texto('kpi-margem', `Margem bruta de ${String(s.margemPercentual).replace('.', ',')}%`);
  texto('kpi-ticket', moeda(s.ticketMedio));
  texto('kpi-unidades', `${inteiro(s.unidades)} unidade(s) vendida(s)`);
  texto('kpi-descontos', moeda(s.descontos));
  texto('kpi-canceladas', `${inteiro(s.canceladas)} cancelada(s) · ${moeda(s.valorCancelado)}`);

  desenhar('grafico-dia', {
    type: 'bar',
    data: {
      labels: r.porDia.map((d) => d.dia.split('-').reverse().slice(0, 2).join('/')),
      datasets: [{ label: 'Faturamento', data: r.porDia.map((d) => Number(d.faturamento)), backgroundColor: '#24b98a', borderRadius: 3 }],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => moeda(c.parsed.y) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => moeda(v) } }, x: { ticks: { maxTicksLimit: 15 } } },
    },
  });
  desenhar('grafico-forma', {
    type: 'doughnut',
    data: { labels: r.porForma.map((f) => f.rotulo), datasets: [{ data: r.porForma.map((f) => Number(f.valor)), backgroundColor: CORES }] },
    options: { plugins: { tooltip: { callbacks: { label: (c) => `${c.label}: ${moeda(c.parsed)}` } } } },
  });
  desenhar('grafico-categoria', {
    type: 'bar',
    data: { labels: r.porCategoria.map((c) => c.nome), datasets: [{ label: 'Faturamento', data: r.porCategoria.map((c) => Number(c.faturamento)), backgroundColor: '#4f7cff', borderRadius: 3 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => moeda(c.parsed.x) } } }, scales: { x: { ticks: { callback: (v) => moeda(v) } } } },
  });

  preencherTabela('tabela-produtos', r.topProdutos.map((p) => [p.nome, inteiro(p.unidades), moeda(p.faturamento), moeda(p.lucro)]), 'Nenhuma venda no período.');
  preencherTabela('tabela-vendedores', r.porVendedor.map((v) => [v.nome, inteiro(v.vendas), moeda(v.faturamento)]), 'Nenhuma venda no período.');
  preencherTabela('tabela-estoque', r.estoqueCritico.map((p) => [p.nome, p.sku, inteiro(p.estoqueAtual), inteiro(p.estoqueMinimo)]), 'Nenhum produto com estoque crítico.');
}

async function carregar() {
  const params = new URLSearchParams({ inicio: form.elements.inicio.value, fim: form.elements.fim.value });
  document.getElementById('link-csv').href = `/api/relatorios/vendas.csv?${params}`;
  aviso.textContent = '';
  try {
    const resposta = await fetch(`/api/relatorios/resumo?${params}`, { credentials: 'same-origin' });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro?.mensagem || 'Não foi possível carregar o relatório.');
    mostrar(dados);
  } catch (erro) {
    aviso.textContent = erro.message;
    aviso.className = 'form-message erro';
  }
}

function iso(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

form.addEventListener('submit', (e) => { e.preventDefault(); carregar(); });
form.querySelectorAll('[data-atalho]').forEach((botao) => {
  botao.addEventListener('click', () => {
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(fim.getDate() - (Number(botao.dataset.atalho) - 1));
    form.elements.inicio.value = iso(inicio);
    form.elements.fim.value = iso(fim);
    carregar();
  });
});

window.addEventListener('load', carregar);

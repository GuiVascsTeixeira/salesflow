// Interações da página de vendas.
// Carregado DEPOIS de gestao.js: reaproveita requisicaoGestao, abrirModal,
// fecharModais e escaparHtml. Os botões de fechar (data-close-modal) já são
// tratados no gestao.js.
const FORMAS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
};

const moeda = valor => Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const centavos = valor => Math.round(Number(valor) * 100);

const formVenda = document.getElementById('form-venda');
const catalogo = JSON.parse(document.getElementById('catalogo-venda')?.textContent || '{"produtos":[],"clientes":[],"descontoMaximo":0}');
const produtosPorId = new Map(catalogo.produtos.map(p => [String(p.id), p]));

// ------------------------------------------------------------ nova venda
function linhaDeItem() {
  const linha = document.createElement('div');
  linha.className = 'sf-sale-row';
  const opcoes = catalogo.produtos
    .map(p => `<option value="${p.id}">${escaparHtml(p.nome)} (${escaparHtml(p.sku)}) — ${escaparHtml(moeda(p.preco))} · estoque ${p.estoque}</option>`)
    .join('');
  linha.innerHTML = `
    <select class="item-produto" aria-label="Produto"><option value="">Selecione um produto</option>${opcoes}</select>
    <input class="item-quantidade" type="number" min="1" step="1" value="1" aria-label="Quantidade">
    <span class="item-subtotal">R$ 0,00</span>
    <button type="button" class="sf-table-action is-danger item-remover" aria-label="Remover item">×</button>`;
  return linha;
}

function recalcularResumo() {
  let subtotal = 0;
  document.querySelectorAll('#itens-venda .sf-sale-row').forEach(linha => {
    const produto = produtosPorId.get(linha.querySelector('.item-produto').value);
    const quantidade = Number(linha.querySelector('.item-quantidade').value) || 0;
    const valorLinha = produto && quantidade > 0 ? centavos(produto.preco) * quantidade : 0;
    linha.querySelector('.item-subtotal').textContent = moeda(valorLinha / 100);
    subtotal += valorLinha;
  });
  // Mesma conta do servidor: tudo em centavos inteiros.
  const percentual = Math.round((Number(formVenda.elements.descontoPercentual.value) || 0) * 100);
  const desconto = Math.round((subtotal * percentual) / 10000);
  document.getElementById('resumo-subtotal').textContent = moeda(subtotal / 100);
  document.getElementById('resumo-desconto').textContent = moeda(desconto / 100);
  document.getElementById('resumo-total').textContent = moeda((subtotal - desconto) / 100);
}

function adicionarItem() {
  document.getElementById('itens-venda').appendChild(linhaDeItem());
  recalcularResumo();
}

if (formVenda) {
  const areaItens = document.getElementById('itens-venda');
  const mensagem = document.getElementById('mensagem-venda');

  // Chave única por formulário aberto: o servidor ignora reenvios da mesma venda.
  let chaveEnvio = crypto.randomUUID();
  let enviando = false;

  document.getElementById('btn-nova-venda').addEventListener('click', () => {
    chaveEnvio = crypto.randomUUID();
    enviando = false;
    formVenda.reset();
    areaItens.innerHTML = '';
    mensagemGestao(mensagem, '');
    if (!catalogo.produtos.length) {
      mensagemGestao(mensagem, 'Não há produtos ativos com estoque. Cadastre um produto ou registre uma entrada de estoque.');
    }
    adicionarItem();
    abrirModal('modal-venda');
  });

  document.getElementById('btn-adicionar-item').addEventListener('click', adicionarItem);

  areaItens.addEventListener('input', recalcularResumo);
  areaItens.addEventListener('change', recalcularResumo);
  areaItens.addEventListener('click', evento => {
    if (!evento.target.closest('.item-remover')) return;
    evento.target.closest('.sf-sale-row').remove();
    recalcularResumo();
  });
  formVenda.elements.descontoPercentual.addEventListener('input', recalcularResumo);

  formVenda.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (enviando) return; // duplo clique / Enter repetido
    const itens = [...areaItens.querySelectorAll('.sf-sale-row')]
      .map(linha => ({
        produtoId: linha.querySelector('.item-produto').value,
        quantidade: linha.querySelector('.item-quantidade').value,
      }))
      .filter(item => item.produtoId);

    if (!itens.length) {
      mensagemGestao(mensagem, 'Adicione pelo menos um produto à venda.');
      return;
    }

    // Só enviamos o que o servidor precisa: ele recalcula preços e totais.
    const botao = document.getElementById('btn-finalizar-venda');
    enviando = true;
    botao.disabled = true;
    botao.classList.add('is-loading');
    try {
      await requisicaoGestao('/api/vendas', {
        method: 'POST',
        body: JSON.stringify({
          clienteId: formVenda.elements.clienteId.value,
          forma: formVenda.elements.forma.value,
          descontoPercentual: formVenda.elements.descontoPercentual.value,
          chaveEnvio,
          itens,
        }),
      });
      window.location.reload();
    } catch (erro) {
      mensagemGestao(mensagem, erro.message);
      enviando = false;
      botao.disabled = false;
      botao.classList.remove('is-loading');
    }
  });
}

// ------------------------------------------------------- detalhe / cancelar
const formCancelamento = document.getElementById('form-cancelamento');

function htmlDetalhe(venda) {
  const itens = venda.itens.map(item => `
    <tr>
      <td><strong>${escaparHtml(item.produto_nome)}</strong><small class="sf-table-sub">${escaparHtml(item.sku)}</small></td>
      <td>${item.quantidade}</td>
      <td>${escaparHtml(moeda(item.preco_unitario))}</td>
      <td>${escaparHtml(moeda(item.subtotal))}</td>
    </tr>`).join('');
  const pagamento = venda.pagamentos
    .map(p => `${escaparHtml(FORMAS[p.forma] || p.forma)} — ${escaparHtml(moeda(p.valor))}`)
    .join('<br>');
  const cancelada = venda.status === 'cancelada';
  return `
    <div class="sf-detail-meta">
      <div><small>DATA</small><strong>${escaparHtml(venda.data_formatada)}</strong></div>
      <div><small>CLIENTE</small><strong>${escaparHtml(venda.cliente_nome)}</strong></div>
      <div><small>VENDEDOR</small><strong>${escaparHtml(venda.vendedor_nome)}</strong></div>
      <div><small>STATUS</small><span class="sf-status ${cancelada ? 'is-cancelled' : 'is-confirmed'}">${cancelada ? 'Cancelada' : 'Confirmada'}</span></div>
    </div>
    <div class="sf-table-wrap"><table class="sf-table">
      <thead><tr><th>PRODUTO</th><th>QTD.</th><th>PREÇO</th><th>SUBTOTAL</th></tr></thead>
      <tbody>${itens}</tbody>
    </table></div>
    <div class="sf-sale-summary">
      <div><span>Subtotal</span><b>${escaparHtml(moeda(venda.subtotal))}</b></div>
      <div><span>Desconto</span><b>${escaparHtml(moeda(venda.desconto))}</b></div>
      <div class="is-total"><span>Total</span><b>${escaparHtml(moeda(venda.total))}</b></div>
    </div>
    <p class="sf-detail-pay"><small>PAGAMENTO</small>${pagamento || '—'}</p>
    ${cancelada ? `<div class="sf-cancel-info"><strong>Venda cancelada</strong><span>Por ${escaparHtml(venda.cancelada_por_nome || '—')} em ${escaparHtml(venda.cancelada_em_formatada || '—')}</span><span>Motivo: ${escaparHtml(venda.motivo_cancelamento || '—')}</span></div>` : ''}`;
}

document.querySelectorAll('[data-view-sale]').forEach(botao => {
  botao.addEventListener('click', async () => {
    const id = botao.dataset.viewSale;
    const conteudo = document.getElementById('conteudo-venda');
    document.getElementById('titulo-detalhe-venda').textContent = `Venda #${id}`;
    conteudo.innerHTML = '<p class="sf-history-empty">Carregando...</p>';
    formCancelamento.hidden = true;
    formCancelamento.reset();
    abrirModal('modal-detalhe-venda');
    try {
      const { venda } = await requisicaoGestao(`/api/vendas/${id}`);
      conteudo.innerHTML = htmlDetalhe(venda);
      if (venda.status === 'confirmada') {
        formCancelamento.elements.id.value = venda.id;
        formCancelamento.hidden = false;
      }
    } catch (erro) {
      conteudo.textContent = erro.message;
    }
  });
});

if (formCancelamento) {
  formCancelamento.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (!confirm('Cancelar esta venda? O estoque dos itens será devolvido.')) return;
    const botao = formCancelamento.querySelector('[type="submit"]');
    botao.disabled = true;
    try {
      await requisicaoGestao(`/api/vendas/${formCancelamento.elements.id.value}/cancelar`, {
        method: 'POST',
        body: JSON.stringify({ motivo: formCancelamento.elements.motivo.value }),
      });
      window.location.reload();
    } catch (erro) {
      alert(erro.message);
      botao.disabled = false;
    }
  });
}

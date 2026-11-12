// Interações do módulo de produtos e categorias.
async function requisicaoGestao(url, opcoes = {}) {
  const resposta = await fetch(url, {
    credentials: 'same-origin',
    ...opcoes,
    headers: {
      ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opcoes.headers || {}),
    },
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro?.mensagem || 'Não foi possível concluir a operação.');
  return dados;
}

function mensagemGestao(elemento, texto, tipo = 'erro') {
  if (!elemento) return;
  elemento.textContent = texto;
  elemento.className = `form-message ${tipo}`;
}

function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sf-modal-open');
  }
}
function fecharModais() {
  document.querySelectorAll('.sf-modal').forEach(m => m.setAttribute('aria-hidden', 'true'));
  document.body.classList.remove('sf-modal-open');
}

document.querySelectorAll('[data-open-modal]').forEach(botao => {
  botao.addEventListener('click', () => {
    const form = document.getElementById('form-produto');
    if (form) {
      form.reset();
      form.elements.id.value = '';
      form.elements.estoqueInicial.disabled = false;
      document.getElementById('campo-estoque-inicial').hidden = false;
      document.getElementById('titulo-modal-produto').textContent = 'Novo produto';
    }
    abrirModal(botao.dataset.openModal);
  });
});
document.querySelectorAll('[data-close-modal]').forEach(botao => botao.addEventListener('click', fecharModais));
document.querySelectorAll('.sf-modal').forEach(modal => {
  modal.addEventListener('click', evento => { if (evento.target === modal) fecharModais(); });
});

// Formulário de produto.
const formProduto = document.getElementById('form-produto');
if (formProduto) {
  formProduto.addEventListener('submit', async evento => {
    evento.preventDefault();
    const botao = formProduto.querySelector('[type="submit"]');
    const dados = Object.fromEntries(new FormData(formProduto).entries());
    const id = dados.id;
    delete dados.id;
    botao.disabled = true;
    try {
      await requisicaoGestao(id ? `/api/produtos/${id}` : '/api/produtos', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(dados),
      });
      window.location.reload();
    } catch (erro) {
      alert(erro.message);
      botao.disabled = false;
    }
  });
}

document.querySelectorAll('[data-edit-product]').forEach(botao => {
  botao.addEventListener('click', async () => {
    try {
      const { produto } = await requisicaoGestao(`/api/produtos/${botao.dataset.editProduct}`);
      const form = document.getElementById('form-produto');
      form.elements.id.value = produto.id;
      form.elements.nome.value = produto.nome;
      form.elements.sku.value = produto.sku;
      form.elements.categoriaId.value = produto.categoria_id;
      form.elements.precoVenda.value = produto.preco_venda;
      form.elements.custo.value = produto.custo;
      form.elements.estoqueMinimo.value = produto.estoque_minimo;
      form.elements.descricao.value = produto.descricao || '';
      form.elements.estoqueInicial.disabled = true;
      document.getElementById('campo-estoque-inicial').hidden = true;
      document.getElementById('titulo-modal-produto').textContent = 'Editar produto';
      abrirModal('modal-produto');
    } catch (erro) { alert(erro.message); }
  });
});

document.querySelectorAll('[data-deactivate-product]').forEach(botao => {
  botao.addEventListener('click', async () => {
    if (!confirm('Inativar este produto? O histórico e as vendas antigas serão preservados.')) return;
    try {
      await requisicaoGestao(`/api/produtos/${botao.dataset.deactivateProduct}`, { method: 'DELETE' });
      window.location.reload();
    } catch (erro) { alert(erro.message); }
  });
});

document.querySelectorAll('[data-stock-product]').forEach(botao => {
  botao.addEventListener('click', async () => {
    const id = botao.dataset.stockProduct;
    const linha = botao.closest('tr');
    document.getElementById('form-estoque').reset();
    document.querySelector('#form-estoque [name="id"]').value = id;
    document.getElementById('produto-estoque-nome').textContent = linha?.querySelector('td strong')?.textContent || '';
    const area = document.getElementById('historico-estoque');
    area.innerHTML = '<p class="sf-history-empty">Carregando histórico...</p>';
    abrirModal('modal-estoque');
    try {
      const { historico } = await requisicaoGestao(`/api/produtos/${id}/movimentacoes`);
      area.innerHTML = historico.length
        ? historico.map(item => `<div class="sf-history-row"><div><strong>${escaparHtml(rotuloMovimento(item.tipo))}</strong><small>${escaparHtml(item.data_formatada)} · ${escaparHtml(item.usuario_nome)}</small><small>${escaparHtml(item.justificativa || '')}</small></div><b>${item.tipo === 'ajuste_negativo' ? '−' : '+'}${item.quantidade} <small>→ ${item.saldo_apos}</small></b></div>`).join('')
        : '<p class="sf-history-empty">Ainda não há movimentações registradas.</p>';
    } catch (erro) { area.textContent = erro.message; }
  });
});

function rotuloMovimento(tipo) {
  return ({ entrada: 'Entrada', ajuste_positivo: 'Ajuste positivo', ajuste_negativo: 'Ajuste negativo', saida_venda: 'Saída por venda', estorno_venda: 'Estorno de venda' })[tipo] || tipo;
}
function escaparHtml(valor) {
  return String(valor).replace(/[&<>"']/g, caractere => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caractere]);
}

const formEstoque = document.getElementById('form-estoque');
if (formEstoque) {
  formEstoque.addEventListener('submit', async evento => {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(formEstoque).entries());
    const id = dados.id;
    delete dados.id;
    const botao = formEstoque.querySelector('[type="submit"]');
    botao.disabled = true;
    try {
      await requisicaoGestao(`/api/produtos/${id}/movimentacoes`, {
        method: 'POST',
        body: JSON.stringify(dados),
      });
      window.location.reload();
    } catch (erro) {
      alert(erro.message);
      botao.disabled = false;
    }
  });
}

// Formulário e ações de categoria.
const formCategoria = document.getElementById('form-categoria');
if (formCategoria) {
  formCategoria.addEventListener('submit', async evento => {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(formCategoria).entries());
    const id = dados.id;
    delete dados.id;
    try {
      await requisicaoGestao(id ? `/api/categorias/${id}` : '/api/categorias', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(dados),
      });
      window.location.reload();
    } catch (erro) {
      mensagemGestao(document.getElementById('mensagem-categoria'), erro.message);
    }
  });
}

document.querySelectorAll('[data-edit-category]').forEach(botao => {
  botao.addEventListener('click', () => {
    formCategoria.elements.id.value = botao.dataset.editCategory;
    formCategoria.elements.nome.value = botao.dataset.categoryName;
    document.getElementById('titulo-form-categoria').textContent = 'Editar categoria';
    document.getElementById('cancelar-edicao-categoria').hidden = false;
    formCategoria.elements.nome.focus();
  });
});
const cancelarCategoria = document.getElementById('cancelar-edicao-categoria');
if (cancelarCategoria) {
  cancelarCategoria.addEventListener('click', () => {
    formCategoria.reset();
    formCategoria.elements.id.value = '';
    document.getElementById('titulo-form-categoria').textContent = 'Nova categoria';
    cancelarCategoria.hidden = true;
  });
}
document.querySelectorAll('[data-delete-category]').forEach(botao => {
  botao.addEventListener('click', async () => {
    if (!confirm('Excluir esta categoria? Categorias que possuem produtos não podem ser excluídas.')) return;
    try {
      await requisicaoGestao(`/api/categorias/${botao.dataset.deleteCategory}`, { method: 'DELETE' });
      window.location.reload();
    } catch (erro) { alert(erro.message); }
  });
});

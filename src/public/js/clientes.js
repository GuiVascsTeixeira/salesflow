// Interações da página de clientes.
// Este arquivo é carregado DEPOIS de gestao.js e reaproveita as funções dele:
// requisicaoGestao (fetch com tratamento de erro), abrirModal e fecharModais.
// Os botões de fechar o modal (data-close-modal) já são tratados no gestao.js.
const formCliente = document.getElementById('form-cliente');

if (formCliente) {
  // Novo cliente: limpa o formulário e abre o modal.
  document.getElementById('btn-novo-cliente').addEventListener('click', () => {
    formCliente.reset();
    formCliente.elements.id.value = '';
    document.getElementById('titulo-modal-cliente').textContent = 'Novo cliente';
    abrirModal('modal-cliente');
    formCliente.elements.nome.focus();
  });

  // Salvar: POST (novo) ou PUT (edição), conforme o campo oculto "id".
  formCliente.addEventListener('submit', async evento => {
    evento.preventDefault();
    const botao = formCliente.querySelector('[type="submit"]');
    const dados = Object.fromEntries(new FormData(formCliente).entries());
    const id = dados.id;
    delete dados.id;
    botao.disabled = true;
    try {
      await requisicaoGestao(id ? `/api/clientes/${id}` : '/api/clientes', {
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

// Editar: busca o cliente na API e preenche o formulário.
document.querySelectorAll('[data-edit-client]').forEach(botao => {
  botao.addEventListener('click', async () => {
    try {
      const { cliente } = await requisicaoGestao(`/api/clientes/${botao.dataset.editClient}`);
      formCliente.elements.id.value = cliente.id;
      formCliente.elements.nome.value = cliente.nome;
      formCliente.elements.email.value = cliente.email || '';
      formCliente.elements.telefone.value = cliente.telefone || '';
      document.getElementById('titulo-modal-cliente').textContent = 'Editar cliente';
      abrirModal('modal-cliente');
    } catch (erro) { alert(erro.message); }
  });
});

document.querySelectorAll('[data-deactivate-client]').forEach(botao => {
  botao.addEventListener('click', async () => {
    if (!confirm('Inativar este cliente? O histórico de compras será preservado.')) return;
    try {
      await requisicaoGestao(`/api/clientes/${botao.dataset.deactivateClient}`, { method: 'DELETE' });
      window.location.reload();
    } catch (erro) { alert(erro.message); }
  });
});

document.querySelectorAll('[data-reactivate-client]').forEach(botao => {
  botao.addEventListener('click', async () => {
    try {
      await requisicaoGestao(`/api/clientes/${botao.dataset.reactivateClient}/reativar`, { method: 'POST' });
      window.location.reload();
    } catch (erro) { alert(erro.message); }
  });
});

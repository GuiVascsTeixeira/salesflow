// Integra os formulários das páginas com a API de autenticação do SalesFlow.
async function lerResposta(resposta) {
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(dados.erro?.mensagem || dados.mensagem || 'Não foi possível concluir a solicitação.');
  }
  return dados;
}

function mostrarMensagem(elemento, mensagem, tipo = 'erro') {
  if (!elemento) return;
  elemento.textContent = mensagem;
  elemento.className = `form-message ${tipo}`;
}

const formularioLogin = document.getElementById('form-login');
if (formularioLogin) {
  formularioLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const botao = formularioLogin.querySelector('button[type="submit"]');
    const mensagem = document.getElementById('mensagem-login');
    const dados = Object.fromEntries(new FormData(formularioLogin).entries());

    botao.disabled = true;
    botao.classList.add('is-loading');
    mostrarMensagem(mensagem, 'Verificando seus dados...', 'info');

    try {
      await lerResposta(await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(dados),
      }));
      window.location.assign('/dashboard');
    } catch (erro) {
      mostrarMensagem(mensagem, erro.message);
      botao.disabled = false;
      botao.classList.remove('is-loading');
    }
  });
}

const formularioCadastro = document.getElementById('form-cadastro');
if (formularioCadastro) {
  formularioCadastro.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const botao = formularioCadastro.querySelector('button[type="submit"]');
    const mensagem = document.getElementById('mensagem-cadastro');
    const dados = Object.fromEntries(new FormData(formularioCadastro).entries());

    botao.disabled = true;
    botao.classList.add('is-loading');
    mostrarMensagem(mensagem, 'Criando sua conta...', 'info');

    try {
      await lerResposta(await fetch('/api/auth/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(dados),
      }));
      mostrarMensagem(mensagem, 'Cadastro realizado! Redirecionando para o login...', 'sucesso');
      window.setTimeout(() => window.location.assign('/'), 900);
    } catch (erro) {
      mostrarMensagem(mensagem, erro.message);
      botao.disabled = false;
      botao.classList.remove('is-loading');
    }
  });
}

const botaoLogout = document.getElementById('btn-logout');
if (botaoLogout) {
  botaoLogout.addEventListener('click', async () => {
    botaoLogout.disabled = true;
    try {
      await lerResposta(await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      }));
      window.location.assign('/');
    } catch (erro) {
      const mensagem = document.getElementById('mensagem-dashboard');
      mostrarMensagem(mensagem, erro.message);
      botaoLogout.disabled = false;
    }
  });
}

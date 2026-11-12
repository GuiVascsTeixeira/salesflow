// Roda no NAVEGADOR: pergunta ao servidor se o banco está conectado.
// Este é o padrão que usaremos em todas as telas: a página chama a API com fetch.
const elemento = document.getElementById('status-banco');

async function verificarBanco() {
  try {
    const resposta = await fetch('/api/health');
    const dados = await resposta.json();

    if (resposta.ok && dados.banco.conectado) {
      // textContent (e não innerHTML) evita injetar HTML vindo de fora na página.
      elemento.textContent = `Banco conectado: ${dados.banco.nome} (MySQL ${dados.banco.versao})`;
      elemento.className = 'status ok';
    } else {
      throw new Error('Banco indisponível');
    }
  } catch {
    elemento.textContent = 'Não foi possível conectar ao banco de dados.';
    elemento.className = 'status erro';
  }
}

verificarBanco();


import bcrypt from 'bcryptjs';

import {
  criarEmpresaEUsuario,
  buscarUsuarioPorEmail,
} from '../repositories/auth.repository.js';

// Cadastra uma empresa e seu primeiro usuário.
export async function cadastrarEmpresa(dados) {
  // Só aceitamos texto: um JSON com número/objeto nesses campos daria erro 500.
  const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');
  const nome = texto(dados.nome);
  const empresaNome = texto(dados.empresaNome);
  const email = texto(dados.email).toLowerCase();
  const senha = typeof dados.senha === 'string' ? dados.senha : '';

  // Valida os campos obrigatórios.
  if (!nome || !empresaNome || !email || !senha) {
    const erro = new Error('Preencha todos os campos obrigatórios.');
    erro.status = 400;
    throw erro;
  }

  if (senha.length < 8) {
    const erro = new Error('A senha deve ter pelo menos 8 caracteres.');
    erro.status = 400;
    throw erro;
  }

  // O bcrypt só considera os primeiros 72 bytes da senha.
  if (Buffer.byteLength(senha) > 72) {
    const erro = new Error('A senha deve ter no máximo 72 caracteres.');
    erro.status = 400;
    throw erro;
  }

  // Limites das colunas do banco (evita erro 500 por texto longo demais).
  if (nome.length > 100 || empresaNome.length > 120 || email.length > 150) {
    const erro = new Error('Nome (100), empresa (120) ou e-mail (150) excedem o tamanho máximo.');
    erro.status = 400;
    throw erro;
  }

  // Verifica se o e-mail possui um formato válido.
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!emailValido) {
    const erro = new Error('Informe um e-mail válido.');
    erro.status = 400;
    throw erro;
  }

  // Gera o hash da senha.
  const senhaHash = await bcrypt.hash(senha, 12);

  try {
    return await criarEmpresaEUsuario({
      nome,
      empresaNome,
      email,
      senhaHash,
    });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') {
      const erroCadastro = new Error('Este e-mail já está cadastrado.');
      erroCadastro.status = 409;
      throw erroCadastro;
    }

    throw erro;
  }
}

// Verifica as credenciais e autentica o usuário.
export async function autenticarUsuario(dados) {
  const email = typeof dados.email === 'string' ? dados.email.trim().toLowerCase() : '';
  const senha = dados.senha;

  if (!email || typeof senha !== 'string' || !senha) {
    const erro = new Error('Informe o e-mail e a senha.');
    erro.status = 400;
    throw erro;
  }

  // Procura o usuário no banco.
  const usuario = await buscarUsuarioPorEmail(email);

  // Não revela se o e-mail existe ou se a senha está errada.
  if (!usuario || !usuario.ativo) {
    const erro = new Error('E-mail ou senha incorretos.');
    erro.status = 401;
    throw erro;
  }

  // Compara a senha digitada com o hash armazenado.
  const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);

  if (!senhaCorreta) {
    const erro = new Error('E-mail ou senha incorretos.');
    erro.status = 401;
    throw erro;
  }

  // Retorna somente os dados necessários para a sessão.
  return {
    id: usuario.id,
    empresaId: usuario.empresa_id,
    nome: usuario.nome,
    email: usuario.email,
  };
}

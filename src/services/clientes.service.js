// Regras de negócio de clientes: validação, normalização e erros amigáveis.
import { AppError } from '../utils/AppError.js';
import { buscarNomeEmpresa } from '../repositories/produtos.repository.js';
import {
  listarClientesDoBanco,
  contarClientesDaEmpresa,
  buscarClienteDaEmpresa,
  inserirCliente,
  atualizarClienteNoBanco,
  alterarSituacaoCliente,
} from '../repositories/clientes.repository.js';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function idPositivo(valor, campo = 'Identificador') {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(400, `${campo} inválido.`, 'DADO_INVALIDO');
  }
  return id;
}

// Valida e limpa os dados vindos do formulário.
// E-mail e telefone são opcionais: campo vazio vira NULL (e não '').
// Isso importa porque o banco tem UNIQUE (empresa_id, email): vários NULL são
// permitidos, mas dois '' seriam considerados duplicados.
function validarDadosCliente(dados) {
  if (typeof dados.nome !== 'string' || !dados.nome.trim()) {
    throw new AppError(400, 'Informe o nome do cliente.', 'DADO_OBRIGATORIO');
  }
  const nome = dados.nome.trim();
  if (nome.length > 120) {
    throw new AppError(400, 'O nome deve ter no máximo 120 caracteres.', 'DADO_INVALIDO');
  }

  let email = null;
  if (typeof dados.email === 'string' && dados.email.trim()) {
    email = dados.email.trim().toLowerCase();
    if (email.length > 150 || !EMAIL_VALIDO.test(email)) {
      throw new AppError(400, 'Informe um e-mail válido.', 'DADO_INVALIDO');
    }
  }

  let telefone = null;
  if (typeof dados.telefone === 'string' && dados.telefone.trim()) {
    telefone = dados.telefone.trim();
    const quantidadeDigitos = telefone.replace(/\D/g, '').length;
    if (
      telefone.length > 20
      || !/^[0-9()+\-\s]+$/.test(telefone)
      || quantidadeDigitos < 10
      || quantidadeDigitos > 13
    ) {
      throw new AppError(400, 'Informe um telefone válido com DDD. Ex.: (85) 99999-9999.', 'DADO_INVALIDO');
    }
  }

  return { nome, email, telefone };
}

function tratarDuplicidade(erro) {
  if (erro.code === 'ER_DUP_ENTRY') {
    throw new AppError(409, 'Já existe um cliente com esse e-mail na sua empresa.', 'EMAIL_DUPLICADO');
  }
  throw erro;
}

function normalizarFiltros(filtros = {}) {
  return {
    busca: typeof filtros.busca === 'string' ? filtros.busca.trim().slice(0, 100) : '',
    status: ['ativos', 'inativos'].includes(filtros.status) ? filtros.status : 'todos',
  };
}

export async function obterDadosPaginaClientes(empresaId, filtros = {}) {
  const id = idPositivo(empresaId, 'Empresa');
  const [clientes, totais, empresaNome] = await Promise.all([
    listarClientesDoBanco(id, normalizarFiltros(filtros)),
    contarClientesDaEmpresa(id),
    buscarNomeEmpresa(id),
  ]);
  return { clientes, totais, empresaNome };
}

export async function obterClientes(empresaId, filtros = {}) {
  return listarClientesDoBanco(idPositivo(empresaId, 'Empresa'), normalizarFiltros(filtros));
}

export async function obterCliente(empresaId, clienteId) {
  const cliente = await buscarClienteDaEmpresa(
    idPositivo(empresaId, 'Empresa'),
    idPositivo(clienteId, 'Cliente'),
  );
  if (!cliente) throw new AppError(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');
  return cliente;
}

export async function criarCliente(empresaId, dados) {
  const cliente = validarDadosCliente(dados);
  try {
    const id = await inserirCliente(idPositivo(empresaId, 'Empresa'), cliente);
    return { id, mensagem: 'Cliente cadastrado com sucesso.' };
  } catch (erro) {
    return tratarDuplicidade(erro);
  }
}

export async function editarCliente(empresaId, clienteId, dados) {
  const empresa = idPositivo(empresaId, 'Empresa');
  const id = idPositivo(clienteId, 'Cliente');
  const cliente = validarDadosCliente(dados);
  try {
    const alterados = await atualizarClienteNoBanco(empresa, id, cliente);
    // affectedRows = 0 pode ser "não existe" ou "dados iguais"; conferimos.
    if (!alterados && !(await buscarClienteDaEmpresa(empresa, id))) {
      throw new AppError(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');
    }
    return { mensagem: 'Cliente atualizado com sucesso.' };
  } catch (erro) {
    return tratarDuplicidade(erro);
  }
}

async function mudarSituacao(empresaId, clienteId, ativo) {
  const empresa = idPositivo(empresaId, 'Empresa');
  const id = idPositivo(clienteId, 'Cliente');
  const alterados = await alterarSituacaoCliente(empresa, id, ativo);
  if (!alterados) {
    if (!(await buscarClienteDaEmpresa(empresa, id))) {
      throw new AppError(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');
    }
    throw new AppError(
      409,
      ativo ? 'Este cliente já está ativo.' : 'Este cliente já está inativo.',
      ativo ? 'CLIENTE_ATIVO' : 'CLIENTE_INATIVO',
    );
  }
}

export async function inativarCliente(empresaId, clienteId) {
  await mudarSituacao(empresaId, clienteId, 0);
  return { mensagem: 'Cliente inativado. O histórico de compras foi preservado.' };
}

export async function reativarCliente(empresaId, clienteId) {
  await mudarSituacao(empresaId, clienteId, 1);
  return { mensagem: 'Cliente reativado com sucesso.' };
}

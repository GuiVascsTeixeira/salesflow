// Controller de clientes: recebe a requisição, chama o service e responde.
import {
  obterDadosPaginaClientes,
  obterClientes,
  obterCliente,
  criarCliente as criarClienteService,
  editarCliente,
  inativarCliente,
  reativarCliente as reativarClienteService,
} from '../services/clientes.service.js';

export async function mostrarPaginaClientes(req, res, next) {
  try {
    const filtros = {
      busca: typeof req.query.busca === 'string' ? req.query.busca : '',
      status: typeof req.query.status === 'string' ? req.query.status : 'ativos',
    };
    const dados = await obterDadosPaginaClientes(req.session.usuario.empresaId, filtros);
    return res.render('clientes', {
      titulo: 'Clientes | SalesFlow',
      usuario: req.session.usuario,
      ...dados,
      busca: filtros.busca,
      status: filtros.status,
    });
  } catch (erro) {
    return next(erro);
  }
}

export async function listarClientes(req, res, next) {
  try {
    const clientes = await obterClientes(req.session.usuario.empresaId, req.query);
    return res.json({ clientes });
  } catch (erro) {
    return next(erro);
  }
}

export async function buscarCliente(req, res, next) {
  try {
    const cliente = await obterCliente(req.session.usuario.empresaId, req.params.id);
    return res.json({ cliente });
  } catch (erro) {
    return next(erro);
  }
}

export async function criarCliente(req, res, next) {
  try {
    const resultado = await criarClienteService(req.session.usuario.empresaId, req.body);
    return res.status(201).json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

export async function atualizarCliente(req, res, next) {
  try {
    const resultado = await editarCliente(
      req.session.usuario.empresaId,
      req.params.id,
      req.body,
    );
    return res.json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

export async function desativarCliente(req, res, next) {
  try {
    const resultado = await inativarCliente(req.session.usuario.empresaId, req.params.id);
    return res.json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

export async function reativarCliente(req, res, next) {
  try {
    const resultado = await reativarClienteService(req.session.usuario.empresaId, req.params.id);
    return res.json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

// Controller de vendas: recebe a requisição, chama o service e responde.
import {
  obterDadosPaginaVendas,
  obterVendas,
  obterVenda,
  criarVenda as criarVendaService,
  cancelarVenda as cancelarVendaService,
} from '../services/vendas.service.js';

export async function mostrarPaginaVendas(req, res, next) {
  try {
    const filtros = {
      busca: typeof req.query.busca === 'string' ? req.query.busca : '',
      status: typeof req.query.status === 'string' ? req.query.status : 'todas',
      pagina: typeof req.query.pagina === 'string' ? req.query.pagina : '1',
    };
    const dados = await obterDadosPaginaVendas(req.session.usuario.empresaId, filtros);
    return res.render('vendas', {
      titulo: 'Vendas | SalesFlow',
      usuario: req.session.usuario,
      ...dados,
      busca: filtros.busca,
      status: filtros.status,
    });
  } catch (erro) {
    return next(erro);
  }
}

export async function listarVendas(req, res, next) {
  try {
    const vendas = await obterVendas(req.session.usuario.empresaId, req.query);
    return res.json({ vendas });
  } catch (erro) {
    return next(erro);
  }
}

export async function buscarVenda(req, res, next) {
  try {
    const venda = await obterVenda(req.session.usuario.empresaId, req.params.id);
    return res.json({ venda });
  } catch (erro) {
    return next(erro);
  }
}

export async function criarVenda(req, res, next) {
  try {
    const resultado = await criarVendaService(
      req.session.usuario.empresaId,
      req.session.usuario.id,
      req.body,
    );
    return res.status(201).json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

export async function cancelarVenda(req, res, next) {
  try {
    const resultado = await cancelarVendaService(
      req.session.usuario.empresaId,
      req.session.usuario.id,
      req.params.id,
      req.body,
    );
    return res.json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

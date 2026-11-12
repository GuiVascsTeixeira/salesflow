import {
  obterDadosPaginaProdutos,
  obterDadosPaginaCategorias,
  obterCategorias,
  criarCategoria as criarCategoriaService,
  editarCategoria,
  apagarCategoria,
  obterProdutos,
  obterProduto,
  criarProduto as criarProdutoService,
  editarProduto,
  inativarProduto,
  movimentarProduto,
  obterHistoricoEstoque,
} from '../services/produtos.service.js';

function responderErro(next, erro) {
  return next(erro);
}

export async function mostrarPaginaProdutos(req, res, next) {
  try {
    const filtros = {
      busca: typeof req.query.busca === 'string' ? req.query.busca : '',
      status: typeof req.query.status === 'string' ? req.query.status : 'ativos',
    };
    const dados = await obterDadosPaginaProdutos(req.session.usuario.empresaId, filtros);
    return res.render('produtos', {
      titulo: 'Produtos | SalesFlow',
      usuario: req.session.usuario,
      ...dados,
      busca: filtros.busca,
      status: filtros.status,
    });
  } catch (erro) {
    return responderErro(next, erro);
  }
}

export async function mostrarPaginaCategorias(req, res, next) {
  try {
    const dados = await obterDadosPaginaCategorias(req.session.usuario.empresaId);
    return res.render('categorias', {
      titulo: 'Categorias | SalesFlow',
      usuario: req.session.usuario,
      ...dados,
    });
  } catch (erro) {
    return responderErro(next, erro);
  }
}

export async function listarCategorias(req, res, next) {
  try {
    return res.json({ categorias: await obterCategorias(req.session.usuario.empresaId) });
  } catch (erro) {
    return next(erro);
  }
}

export async function criarCategoria(req, res, next) {
  try {
    const categoria = await criarCategoriaService(req.session.usuario.empresaId, req.body);
    return res.status(201).json({ mensagem: 'Categoria cadastrada com sucesso.', categoria });
  } catch (erro) {
    return next(erro);
  }
}

export async function atualizarCategoria(req, res, next) {
  try {
    const resultado = await editarCategoria(req.session.usuario.empresaId, req.params.id, req.body);
    return res.json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

export async function excluirCategoria(req, res, next) {
  try {
    const resultado = await apagarCategoria(req.session.usuario.empresaId, req.params.id);
    return res.json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

export async function listarProdutos(req, res, next) {
  try {
    const produtos = await obterProdutos(req.session.usuario.empresaId, req.query);
    return res.json({ produtos });
  } catch (erro) {
    return next(erro);
  }
}

export async function buscarProduto(req, res, next) {
  try {
    const produto = await obterProduto(req.session.usuario.empresaId, req.params.id);
    return res.json({ produto });
  } catch (erro) {
    return next(erro);
  }
}

export async function criarProduto(req, res, next) {
  try {
    const resultado = await criarProdutoService(
      req.session.usuario.empresaId,
      req.session.usuario.id,
      req.body,
    );
    return res.status(201).json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

export async function atualizarProduto(req, res, next) {
  try {
    const resultado = await editarProduto(
      req.session.usuario.empresaId,
      req.params.id,
      req.body,
    );
    return res.json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

export async function desativarProduto(req, res, next) {
  try {
    const resultado = await inativarProduto(req.session.usuario.empresaId, req.params.id);
    return res.json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

export async function movimentarEstoque(req, res, next) {
  try {
    const resultado = await movimentarProduto(
      req.session.usuario.empresaId,
      req.session.usuario.id,
      req.params.id,
      req.body,
    );
    return res.status(201).json({
      mensagem: 'Movimentação registrada com sucesso.',
      ...resultado,
    });
  } catch (erro) {
    return next(erro);
  }
}

export async function historicoEstoque(req, res, next) {
  try {
    const resultado = await obterHistoricoEstoque(
      req.session.usuario.empresaId,
      req.params.id,
    );
    return res.json(resultado);
  } catch (erro) {
    return next(erro);
  }
}

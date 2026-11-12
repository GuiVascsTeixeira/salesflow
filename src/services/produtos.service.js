import { AppError } from '../utils/AppError.js';
import {
  buscarNomeEmpresa,
  listarCategoriasDoBanco,
  inserirCategoria,
  atualizarCategoriaNoBanco,
  contarProdutosDaCategoria,
  removerCategoria,
  listarProdutosDoBanco,
  buscarProdutoDaEmpresa,
  inserirProdutoComEstoque,
  atualizarProdutoNoBanco,
  desativarProdutoNoBanco,
  registrarMovimentacao,
  listarHistoricoEstoque,
} from '../repositories/produtos.repository.js';

function idPositivo(valor, campo = 'Identificador') {
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(400, `${campo} inválido.`, 'DADO_INVALIDO');
  }
  return id;
}

function textoObrigatorio(valor, campo, limite) {
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new AppError(400, `Informe ${campo}.`, 'DADO_OBRIGATORIO');
  }
  const texto = valor.trim();
  if (texto.length > limite) {
    throw new AppError(400, `${campo} deve ter no máximo ${limite} caracteres.`, 'DADO_INVALIDO');
  }
  return texto;
}

function numeroNaoNegativo(valor, campo, { inteiro = false } = {}) {
  if (valor === '' || valor === null || valor === undefined) {
    throw new AppError(400, `Informe ${campo}.`, 'DADO_OBRIGATORIO');
  }
  const numero = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0 || (inteiro && !Number.isInteger(numero))) {
    throw new AppError(400, `${campo} deve ser ${inteiro ? 'um número inteiro' : 'um número'} igual ou maior que zero.`, 'DADO_INVALIDO');
  }
  // Conta as casas decimais no TEXTO digitado. Comparar numero * 100 com
  // Math.round(numero * 100) rejeitaria preços válidos como 19,90 (em
  // JavaScript, 19.9 * 100 = 1990.0000000000002).
  const casas = String(valor).trim().replace(',', '.').split('.')[1] ?? '';
  if (!inteiro && casas.replace(/0+$/, '').length > 2) {
    throw new AppError(400, `${campo} aceita no máximo duas casas decimais.`, 'DADO_INVALIDO');
  }
  return numero;
}

function tratarDuplicidade(erro, mensagem) {
  if (erro.code === 'ER_DUP_ENTRY') {
    throw new AppError(409, mensagem, 'REGISTRO_DUPLICADO');
  }
  throw erro;
}

export async function obterDadosPaginaProdutos(empresaId, filtros = {}) {
  const id = idPositivo(empresaId, 'Empresa');
  const [produtos, categorias, empresaNome] = await Promise.all([
    listarProdutosDoBanco(id, filtros),
    listarCategoriasDoBanco(id),
    buscarNomeEmpresa(id),
  ]);
  return { produtos, categorias, empresaNome };
}

export async function obterDadosPaginaCategorias(empresaId) {
  const id = idPositivo(empresaId, 'Empresa');
  const [categorias, empresaNome] = await Promise.all([
    listarCategoriasDoBanco(id),
    buscarNomeEmpresa(id),
  ]);
  return { categorias, empresaNome };
}

export async function obterCategorias(empresaId) {
  return listarCategoriasDoBanco(idPositivo(empresaId, 'Empresa'));
}

export async function criarCategoria(empresaId, dados) {
  const nome = textoObrigatorio(dados.nome, 'o nome da categoria', 60);
  try {
    const id = await inserirCategoria(idPositivo(empresaId, 'Empresa'), nome);
    return { id, nome };
  } catch (erro) {
    tratarDuplicidade(erro, 'Já existe uma categoria com esse nome.');
  }
}

export async function editarCategoria(empresaId, categoriaId, dados) {
  const nome = textoObrigatorio(dados.nome, 'o nome da categoria', 60);
  try {
    const alteradas = await atualizarCategoriaNoBanco(
      idPositivo(empresaId, 'Empresa'),
      idPositivo(categoriaId, 'Categoria'),
      nome,
    );
    if (!alteradas) {
      const categorias = await listarCategoriasDoBanco(idPositivo(empresaId, 'Empresa'));
      if (!categorias.some((categoria) => Number(categoria.id) === Number(categoriaId))) {
        throw new AppError(404, 'Categoria não encontrada.', 'NAO_ENCONTRADO');
      }
    }
    return { mensagem: 'Categoria atualizada com sucesso.' };
  } catch (erro) {
    tratarDuplicidade(erro, 'Já existe uma categoria com esse nome.');
  }
}

export async function apagarCategoria(empresaId, categoriaId) {
  const empresa = idPositivo(empresaId, 'Empresa');
  const categoria = idPositivo(categoriaId, 'Categoria');
  const total = await contarProdutosDaCategoria(empresa, categoria);
  if (total > 0) {
    throw new AppError(409, 'Esta categoria possui produtos. Mova os produtos para outra categoria antes de excluí-la.', 'CATEGORIA_EM_USO');
  }
  const removidas = await removerCategoria(empresa, categoria);
  if (!removidas) throw new AppError(404, 'Categoria não encontrada.', 'NAO_ENCONTRADO');
  return { mensagem: 'Categoria excluída com sucesso.' };
}

function validarDadosProduto(dados) {
  return {
    categoriaId: idPositivo(dados.categoriaId, 'Categoria'),
    nome: textoObrigatorio(dados.nome, 'o nome do produto', 120),
    descricao: dados.descricao?.trim()
      ? textoObrigatorio(dados.descricao, 'a descrição', 500)
      : null,
    sku: textoObrigatorio(dados.sku, 'o SKU', 40),
    precoVenda: numeroNaoNegativo(dados.precoVenda, 'o preço de venda'),
    custo: numeroNaoNegativo(dados.custo, 'o custo'),
    estoqueMinimo: numeroNaoNegativo(dados.estoqueMinimo ?? 0, 'o estoque mínimo', { inteiro: true }),
  };
}

export async function obterProdutos(empresaId, filtros = {}) {
  return listarProdutosDoBanco(idPositivo(empresaId, 'Empresa'), {
    busca: typeof filtros.busca === 'string' ? filtros.busca.trim().slice(0, 100) : '',
    status: ['ativos', 'inativos'].includes(filtros.status) ? filtros.status : 'todos',
  });
}

export async function obterProduto(empresaId, produtoId) {
  const produto = await buscarProdutoDaEmpresa(
    idPositivo(empresaId, 'Empresa'),
    idPositivo(produtoId, 'Produto'),
  );
  if (!produto) throw new AppError(404, 'Produto não encontrado.', 'NAO_ENCONTRADO');
  return produto;
}

export async function criarProduto(empresaId, usuarioId, dados) {
  const produto = validarDadosProduto(dados);
  produto.empresaId = idPositivo(empresaId, 'Empresa');
  produto.usuarioId = idPositivo(usuarioId, 'Usuário');
  produto.estoqueInicial = numeroNaoNegativo(dados.estoqueInicial ?? 0, 'o estoque inicial', { inteiro: true });
  try {
    const id = await inserirProdutoComEstoque(produto);
    return { id, mensagem: 'Produto cadastrado com sucesso.' };
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'Já existe um produto com esse SKU na sua empresa.', 'SKU_DUPLICADO');
    }
    throw erro;
  }
}

export async function editarProduto(empresaId, produtoId, dados) {
  const produto = validarDadosProduto(dados);
  try {
    const alterados = await atualizarProdutoNoBanco(
      idPositivo(empresaId, 'Empresa'),
      idPositivo(produtoId, 'Produto'),
      produto,
    );
    if (!alterados) {
      const existente = await buscarProdutoDaEmpresa(empresaId, produtoId);
      if (!existente) throw new AppError(404, 'Produto não encontrado.', 'NAO_ENCONTRADO');
    }
    return { mensagem: 'Produto atualizado com sucesso.' };
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'Já existe um produto com esse SKU na sua empresa.', 'SKU_DUPLICADO');
    }
    throw erro;
  }
}

export async function inativarProduto(empresaId, produtoId) {
  const alterados = await desativarProdutoNoBanco(
    idPositivo(empresaId, 'Empresa'),
    idPositivo(produtoId, 'Produto'),
  );
  if (!alterados) {
    const existente = await buscarProdutoDaEmpresa(empresaId, produtoId);
    if (!existente) throw new AppError(404, 'Produto não encontrado.', 'NAO_ENCONTRADO');
    throw new AppError(409, 'Este produto já está inativo.', 'PRODUTO_INATIVO');
  }
  return { mensagem: 'Produto inativado. O histórico foi preservado.' };
}

export async function movimentarProduto(empresaId, usuarioId, produtoId, dados) {
  const tipo = dados.tipo;
  if (!['entrada', 'ajuste_positivo', 'ajuste_negativo'].includes(tipo)) {
    throw new AppError(400, 'Tipo de movimentação inválido.', 'DADO_INVALIDO');
  }
  const quantidade = numeroNaoNegativo(dados.quantidade, 'a quantidade', { inteiro: true });
  if (quantidade <= 0) throw new AppError(400, 'A quantidade deve ser maior que zero.', 'DADO_INVALIDO');
  const justificativa = textoObrigatorio(dados.justificativa, 'a justificativa', 255);

  return registrarMovimentacao(
    idPositivo(empresaId, 'Empresa'),
    idPositivo(produtoId, 'Produto'),
    idPositivo(usuarioId, 'Usuário'),
    { tipo, quantidade, justificativa },
  );
}

export async function obterHistoricoEstoque(empresaId, produtoId) {
  const produto = await obterProduto(empresaId, produtoId);
  const historico = await listarHistoricoEstoque(
    idPositivo(empresaId, 'Empresa'),
    idPositivo(produtoId, 'Produto'),
  );
  return { produto, historico };
}

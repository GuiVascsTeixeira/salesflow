import {
  obterRelatorio,
  obterDadosPaginaRelatorios,
  gerarCsvVendas,
} from '../services/relatorios.service.js';

const filtrosDaRequisicao = (req) => ({
  inicio: typeof req.query.inicio === 'string' ? req.query.inicio : undefined,
  fim: typeof req.query.fim === 'string' ? req.query.fim : undefined,
});

export async function mostrarPaginaRelatorios(req, res, next) {
  try {
    const dados = await obterDadosPaginaRelatorios(req.session.usuario.empresaId, filtrosDaRequisicao(req));
    return res.render('relatorios', {
      titulo: 'Relatórios | SalesFlow',
      usuario: req.session.usuario,
      ...dados,
    });
  } catch (erro) {
    return next(erro);
  }
}

export async function resumoRelatorios(req, res, next) {
  try {
    return res.json(await obterRelatorio(req.session.usuario.empresaId, filtrosDaRequisicao(req)));
  } catch (erro) {
    return next(erro);
  }
}

export async function exportarVendasCsv(req, res, next) {
  try {
    const { nomeArquivo, conteudo } = await gerarCsvVendas(req.session.usuario.empresaId, filtrosDaRequisicao(req));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    return res.send(conteudo);
  } catch (erro) {
    return next(erro);
  }
}

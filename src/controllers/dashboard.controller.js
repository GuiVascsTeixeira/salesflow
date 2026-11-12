// Controller da página inicial da área logada.
import { obterDadosDashboard } from '../services/dashboard.service.js';

export async function mostrarDashboard(req, res, next) {
  try {
    const dados = await obterDadosDashboard(req.session.usuario.empresaId);

    return res.render('dashboard', {
      titulo: 'Visão geral | SalesFlow',
      usuario: req.session.usuario,
      ...dados,
    });
  } catch (erro) {
    return next(erro);
  }
}

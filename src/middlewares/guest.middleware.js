// Impede que usuários autenticados acessem páginas destinadas a visitantes.
export function exigirVisitante(req, res, next) {
  if (req.session.usuario) {
    return res.redirect('/dashboard');
  }

  next();
}
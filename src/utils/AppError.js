// Erro "esperado" da aplicação: quando o usuário fez algo que não pode
// (login errado, estoque insuficiente...), lançamos um AppError.
// O middleware de erros transforma isso em uma resposta JSON com o status certo.
//
// Exemplo (nas próximas etapas):
//   throw new AppError(409, 'Estoque insuficiente.', 'ESTOQUE_INSUFICIENTE');
export class AppError extends Error {
  constructor(status, mensagem, codigo = 'ERRO') {
    super(mensagem);
    this.status = status; // código HTTP: 400, 401, 404, 409...
    this.codigo = codigo; // texto curto e estável, para o front-end reconhecer
  }
}
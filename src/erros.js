// ---------------------------------------------------------------------
// Erro de dominio da aplicacao.
//
// Toda falha previsivel (dado invalido, credencial errada, regra de
// negocio violada) deve lancar um ErroApi. O tratador global do
// servidor.js converte isso no formato padronizado do projeto:
//   { "erro": { "codigo": "...", "mensagem": "..." } }
//
// Falhas NAO previstas (bug, banco fora do ar) continuam virando
// ERRO_INTERNO com HTTP 500 e mensagem generica, sem vazar detalhe.
// ---------------------------------------------------------------------
export class ErroApi extends Error {
    constructor(status, codigo, mensagem) {
        super(mensagem);
        this.name = 'ErroApi';
        this.status = status;
        this.codigo = codigo;
    }
}

// Atalhos para os casos mais comuns, so para deixar as rotas legiveis.
export const erroDadosInvalidos = (mensagem) =>
    new ErroApi(400, 'DADOS_INVALIDOS', mensagem);

export const erroNaoAutenticado = (mensagem = 'Faca login para continuar.') =>
    new ErroApi(401, 'NAO_AUTENTICADO', mensagem);

export const erroSemPermissao = (mensagem = 'Seu perfil nao tem acesso a esta operacao.') =>
    new ErroApi(403, 'SEM_PERMISSAO', mensagem);

export const erroNaoEncontrado = (codigo, mensagem) =>
    new ErroApi(404, codigo, mensagem);

export const erroConflito = (codigo, mensagem) =>
    new ErroApi(409, codigo, mensagem);

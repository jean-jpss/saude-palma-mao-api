import jwt from 'jsonwebtoken';
import { ErroApi, erroNaoAutenticado, erroSemPermissao } from '../erros.js';

// ---------------------------------------------------------------------
// Middleware: funcao que roda ANTES da rota e pode interromper o fluxo.
//
// "autenticar" responde: quem e voce?
// "exigePerfil" responde: voce pode fazer isso?
//
// Sao coisas diferentes. Um paciente autenticado e um usuario valido,
// mas nao pode cadastrar disponibilidade de profissional.
// ---------------------------------------------------------------------

export function autenticar(requisicao, _resposta, proximo) {
    const cabecalho = requisicao.headers.authorization || '';

    // Formato esperado: "Bearer <token>"
    const [esquema, token] = cabecalho.split(' ');

    if (esquema !== 'Bearer' || !token) {
        return proximo(erroNaoAutenticado());
    }

    try {
        const conteudo = jwt.verify(token, process.env.JWT_SEGREDO);

        // Dados do usuario ficam disponiveis para todas as rotas seguintes.
        requisicao.usuario = {
            idUsuario: Number(conteudo.sub),
            tipoUsuario: conteudo.tipo,
            idPaciente: conteudo.idPaciente ?? null,
            idProfissional: conteudo.idProfissional ?? null
        };

        return proximo();
    } catch (erro) {
        if (erro.name === 'TokenExpiredError') {
            return proximo(new ErroApi(401, 'TOKEN_EXPIRADO', 'Sua sessao expirou. Faca login novamente.'));
        }
        return proximo(new ErroApi(401, 'TOKEN_INVALIDO', 'Sessao invalida. Faca login novamente.'));
    }
}

// Uso: router.post('/disponibilidades', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'), ...)
export function exigePerfil(...perfisPermitidos) {
    return (requisicao, _resposta, proximo) => {
        if (!requisicao.usuario) {
            return proximo(erroNaoAutenticado());
        }
        if (!perfisPermitidos.includes(requisicao.usuario.tipoUsuario)) {
            return proximo(erroSemPermissao());
        }
        return proximo();
    };
}

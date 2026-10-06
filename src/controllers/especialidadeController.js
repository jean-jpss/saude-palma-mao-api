// =====================================================================
// CONTROLLER: especialidade
// =====================================================================
import * as model from '../models/especialidadeModel.js';
import { ErroApi, erroDadosInvalidos } from '../erros.js';
import { textoValido } from '../validacao.js';
import { apresentarEspecialidade } from '../apresentadores.js';
import { idValido, frasePlural } from '../utilitarios.js';

export async function listar(requisicao, resposta, proximo) {
    try {
        const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';
        const incluirInativas = ehAdministrador && requisicao.query.incluirInativas === 'true';

        const linhas = await model.listar(incluirInativas);
        return resposta.json(linhas.map(apresentarEspecialidade));
    } catch (erro) {
        return proximo(erro);
    }
}

export async function criar(requisicao, resposta, proximo) {
    try {
        const { nome, descricao } = requisicao.body ?? {};

        if (!textoValido(nome, 3, 120)) {
            throw erroDadosInvalidos('Informe o nome da especialidade, com 3 a 120 caracteres.');
        }
        if (descricao !== undefined && descricao !== null && typeof descricao !== 'string') {
            throw erroDadosInvalidos('A descricao precisa ser um texto.');
        }

        const criada = await model.inserir({ nome: nome.trim(), descricao: descricao?.trim() || null });
        return resposta.status(201).json(apresentarEspecialidade(criada));
    } catch (erro) {
        if (erro.code === '23505' && erro.constraint === 'uq_especialidade_nome') {
            return proximo(new ErroApi(409, 'ESPECIALIDADE_JA_EXISTE', 'Ja existe uma especialidade com esse nome.'));
        }
        return proximo(erro);
    }
}

export async function atualizar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const { nome, descricao, ativo } = requisicao.body ?? {};

        if (nome === undefined && descricao === undefined && ativo === undefined) {
            throw erroDadosInvalidos('Informe ao menos um campo para alterar.');
        }
        if (nome !== undefined && !textoValido(nome, 3, 120)) {
            throw erroDadosInvalidos('O nome precisa ter de 3 a 120 caracteres.');
        }
        if (ativo !== undefined && typeof ativo !== 'boolean') {
            throw erroDadosInvalidos('O campo ativo precisa ser true ou false.');
        }

        const alterada = await model.atualizar(id, {
            nome: nome !== undefined ? nome.trim() : null,
            descricao: descricao !== undefined ? (descricao?.trim() || null) : null,
            ativo: ativo !== undefined ? ativo : null
        });

        if (!alterada) {
            throw new ErroApi(404, 'ESPECIALIDADE_NAO_ENCONTRADA', 'Especialidade nao encontrada.');
        }

        return resposta.json(apresentarEspecialidade(alterada));
    } catch (erro) {
        if (erro.code === '23505' && erro.constraint === 'uq_especialidade_nome') {
            return proximo(new ErroApi(409, 'ESPECIALIDADE_JA_EXISTE', 'Ja existe uma especialidade com esse nome.'));
        }
        return proximo(erro);
    }
}

export async function desativar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const especialidade = await model.buscarComBloqueantes(id);
        if (!especialidade) {
            throw new ErroApi(404, 'ESPECIALIDADE_NAO_ENCONTRADA', 'Especialidade nao encontrada.');
        }
        if (!especialidade.ativo) {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA', 'Esta especialidade ja esta desativada.');
        }

        const bloqueantes = Number(especialidade.bloqueantes);
        if (bloqueantes > 0) {
            throw new ErroApi(409, 'ESPECIALIDADE_COM_AGENDAMENTOS',
                `${frasePlural(bloqueantes)} nesta especialidade. Cancele ou aguarde antes de desativar.`);
        }

        await model.desativar(id);
        return resposta.status(204).send();
    } catch (erro) {
        return proximo(erro);
    }
}

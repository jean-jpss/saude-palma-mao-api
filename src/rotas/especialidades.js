import { Router } from 'express';

import { consultar } from '../banco.js';
import { ErroApi, erroDadosInvalidos } from '../erros.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';
import { textoValido } from '../validacao.js';

const rotas = Router();

function idValido(valor) {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

const formatar = (e) => ({
    idEspecialidade: Number(e.id_especialidade),
    nome: e.nome,
    descricao: e.descricao,
    ativo: e.ativo
});

// =====================================================================
// GET /especialidades
// Publica para qualquer usuario autenticado. Devolve apenas as ativas,
// porque e a lista que o paciente usa para escolher.
//
// O administrador pode pedir todas, incluindo as desativadas, com
// ?incluirInativas=true, para gerenciar na area administrativa.
// =====================================================================
rotas.get('/', autenticar, async (requisicao, resposta, proximo) => {
    try {
        const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';
        const incluirInativas = ehAdministrador && requisicao.query.incluirInativas === 'true';

        const { rows } = await consultar(
            `SELECT id_especialidade, nome, descricao, ativo
               FROM especialidade
              WHERE ($1::boolean IS TRUE OR ativo = TRUE)
              ORDER BY nome`,
            [incluirInativas]
        );

        return resposta.json(rows.map(formatar));
    } catch (erro) {
        return proximo(erro);
    }
});

// =====================================================================
// POST /especialidades
// Requisito 3 da 1a entrega.
// =====================================================================
rotas.post('/', autenticar, exigePerfil('ADMINISTRADOR'), async (requisicao, resposta, proximo) => {
    try {
        const { nome, descricao } = requisicao.body ?? {};

        if (!textoValido(nome, 3, 120)) {
            throw erroDadosInvalidos('Informe o nome da especialidade, com 3 a 120 caracteres.');
        }
        if (descricao !== undefined && descricao !== null && typeof descricao !== 'string') {
            throw erroDadosInvalidos('A descricao precisa ser um texto.');
        }

        const { rows } = await consultar(
            `INSERT INTO especialidade (nome, descricao)
             VALUES ($1, $2)
             RETURNING id_especialidade, nome, descricao, ativo`,
            [nome.trim(), descricao?.trim() || null]
        );

        return resposta.status(201).json(formatar(rows[0]));
    } catch (erro) {
        if (erro.code === '23505' && erro.constraint === 'uq_especialidade_nome') {
            return proximo(new ErroApi(409, 'ESPECIALIDADE_JA_EXISTE',
                'Ja existe uma especialidade com esse nome.'));
        }
        return proximo(erro);
    }
});

// =====================================================================
// PATCH /especialidades/:id
// Atualizacao parcial: so os campos enviados sao alterados.
// =====================================================================
rotas.patch('/:id', autenticar, exigePerfil('ADMINISTRADOR'), async (requisicao, resposta, proximo) => {
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

        // COALESCE mantem o valor atual quando o parametro vem nulo,
        // o que e o comportamento de uma atualizacao parcial.
        const { rows } = await consultar(
            `UPDATE especialidade
                SET nome      = COALESCE($2, nome),
                    descricao = COALESCE($3, descricao),
                    ativo     = COALESCE($4, ativo)
              WHERE id_especialidade = $1
              RETURNING id_especialidade, nome, descricao, ativo`,
            [
                id,
                nome !== undefined ? nome.trim() : null,
                descricao !== undefined ? (descricao?.trim() || null) : null,
                ativo !== undefined ? ativo : null
            ]
        );

        if (rows.length === 0) {
            throw new ErroApi(404, 'ESPECIALIDADE_NAO_ENCONTRADA', 'Especialidade nao encontrada.');
        }

        return resposta.json(formatar(rows[0]));
    } catch (erro) {
        if (erro.code === '23505' && erro.constraint === 'uq_especialidade_nome') {
            return proximo(new ErroApi(409, 'ESPECIALIDADE_JA_EXISTE',
                'Ja existe uma especialidade com esse nome.'));
        }
        return proximo(erro);
    }
});

// =====================================================================
// DELETE /especialidades/:id
//
// Desativacao logica, nunca remocao fisica. O schema foi desenhado
// assim: agendamentos passados referenciam a especialidade, e apagar a
// linha quebraria o historico.
//
// Mesma logica da regra 1.3 aplicada a disponibilidade: a desativacao
// e bloqueada se existirem agendamentos ativos e futuros usando esta
// especialidade.
// =====================================================================
rotas.delete('/:id', autenticar, exigePerfil('ADMINISTRADOR'), async (requisicao, resposta, proximo) => {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const { rows } = await consultar(
            `SELECT e.id_especialidade, e.ativo,
                    (SELECT COUNT(*) FROM agendamento a
                      WHERE a.id_especialidade = e.id_especialidade
                        AND a.status IN ('AGENDADO', 'CONFIRMADO')
                        AND a.data_hora > NOW()) AS bloqueantes
               FROM especialidade e
              WHERE e.id_especialidade = $1`,
            [id]
        );

        const especialidade = rows[0];
        if (!especialidade) {
            throw new ErroApi(404, 'ESPECIALIDADE_NAO_ENCONTRADA', 'Especialidade nao encontrada.');
        }
        if (!especialidade.ativo) {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA', 'Esta especialidade ja esta desativada.');
        }

        const bloqueantes = Number(especialidade.bloqueantes);
        if (bloqueantes > 0) {
            throw new ErroApi(409, 'ESPECIALIDADE_COM_AGENDAMENTOS',
                               `${bloqueantes === 1 ? 'Existe 1 consulta marcada' : `Existem ${bloqueantes} consultas marcadas`} nesta especialidade. `
                + 'Cancele ou aguarde antes de desativar.');
        }

        await consultar(`UPDATE especialidade SET ativo = FALSE WHERE id_especialidade = $1`, [id]);
        return resposta.status(204).send();
    } catch (erro) {
        return proximo(erro);
    }
});

export default rotas;

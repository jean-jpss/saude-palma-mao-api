import { Router } from 'express';

import { consultar } from '../banco.js';
import { ErroApi, erroDadosInvalidos } from '../erros.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

// Regras numericas da secao 2 e 3 do documento de regras v3.
// Ficam aqui, nomeadas, em vez de espalhadas pelo codigo: se o grupo
// mudar a antecedencia, muda em um lugar so.
const HORAS_ANTECEDENCIA_MARCAR = 24;
const HORAS_ANTECEDENCIA_CANCELAR = 8;
const LIMITE_AGENDAMENTOS_FUTUROS = 5;

function idValido(valor) {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

// Projecao usada nas tres rotas de leitura, para a resposta ser sempre
// igual. O front trata um formato so.
const SELECT_AGENDAMENTO = `
    SELECT a.id_agendamento,
           a.data_hora,
           a.status,
           a.observacao,
           a.cancelado_em,
           a.motivo_cancelamento,
           a.criado_em,
           e.id_especialidade,
           e.nome AS nome_especialidade,
           pc.id_profissional_clinica,
           up.nome AS nome_profissional,
           pr.conselho, pr.registro_profissional, pr.uf_registro,
           c.id_clinica, c.nome AS nome_clinica,
           c.logradouro, c.numero, c.bairro, c.cidade, c.uf,
           a.id_paciente,
           upa.nome AS nome_paciente
      FROM agendamento a
      JOIN especialidade e        ON e.id_especialidade        = a.id_especialidade
      JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
      JOIN profissional pr        ON pr.id_profissional        = pc.id_profissional
      JOIN usuario up             ON up.id_usuario             = pr.id_usuario
      JOIN clinica c              ON c.id_clinica              = pc.id_clinica
      JOIN paciente p             ON p.id_paciente             = a.id_paciente
      JOIN usuario upa            ON upa.id_usuario            = p.id_usuario
`;

function formatar(r) {
    return {
        idAgendamento: Number(r.id_agendamento),
        dataHora: r.data_hora,
        status: r.status,
        observacao: r.observacao,
        canceladoEm: r.cancelado_em,
        motivoCancelamento: r.motivo_cancelamento,
        criadoEm: r.criado_em,
        paciente: {
            idPaciente: Number(r.id_paciente),
            nome: r.nome_paciente
        },
        especialidade: {
            idEspecialidade: Number(r.id_especialidade),
            nome: r.nome_especialidade
        },
        profissional: {
            idProfissionalClinica: Number(r.id_profissional_clinica),
            nome: r.nome_profissional,
            registro: `${r.conselho}-${r.uf_registro} ${r.registro_profissional}`
        },
        clinica: {
            idClinica: Number(r.id_clinica),
            nome: r.nome_clinica,
            endereco: `${r.logradouro}, ${r.numero}, ${r.bairro}, ${r.cidade} ${r.uf}`
        }
    };
}

// =====================================================================
// POST /agendamentos
//
// A ordem das validacoes e a da secao 2.1 do documento de regras.
// A ordem importa porque o paciente recebe apenas o primeiro erro, e a
// mensagem precisa ser a mais util possivel.
//
// HORARIO_NO_PASSADO e redundante com a antecedencia de 24 horas, ja
// que todo horario passado tambem viola a antecedencia. Foi mantido de
// proposito, porque a mensagem para o usuario e diferente.
// =====================================================================
rotas.post('/', autenticar, exigePerfil('PACIENTE'), async (requisicao, resposta, proximo) => {
    try {
        const { idProfissionalClinica, idEspecialidade, dataHora, observacao } = requisicao.body ?? {};
        const idPaciente = requisicao.usuario.idPaciente;

        const idPc = idValido(idProfissionalClinica);
        const idEsp = idValido(idEspecialidade);

        if (!idPc) throw erroDadosInvalidos('Informe o idProfissionalClinica.');
        if (!idEsp) throw erroDadosInvalidos('Informe o idEspecialidade.');
        if (typeof dataHora !== 'string' || Number.isNaN(Date.parse(dataHora))) {
            throw erroDadosInvalidos('Informe a dataHora no formato ISO 8601, por exemplo 2026-10-20T08:00:00-03:00.');
        }
        if (observacao !== undefined && observacao !== null && typeof observacao !== 'string') {
            throw erroDadosInvalidos('A observacao precisa ser um texto.');
        }

        // Uma unica consulta resolve as validacoes 1 a 6. Fazer seis
        // consultas separadas custaria seis idas ao banco e abriria
        // mais espaco para inconsistencia entre elas.
        const { rows } = await consultar(
            `SELECT
                 $2::timestamptz <= NOW() AS no_passado,
                 $2::timestamptz < NOW() + make_interval(hours => $4::int) AS sem_antecedencia,
                 NOT EXISTS (
                     SELECT 1 FROM profissional_clinica pc
                       JOIN profissional pr ON pr.id_profissional = pc.id_profissional
                       JOIN clinica c       ON c.id_clinica       = pc.id_clinica
                       JOIN usuario u       ON u.id_usuario       = pr.id_usuario
                      WHERE pc.id_profissional_clinica = $1
                        AND pc.ativo AND pr.ativo AND c.ativo AND u.ativo
                 ) AS vinculo_inativo,
                 NOT EXISTS (
                     SELECT 1 FROM profissional_clinica pc
                       JOIN profissional_especialidade pe ON pe.id_profissional = pc.id_profissional
                       JOIN especialidade e ON e.id_especialidade = pe.id_especialidade AND e.ativo
                      WHERE pc.id_profissional_clinica = $1
                        AND pe.id_especialidade = $3
                 ) AS especialidade_nao_atendida,
                 NOT EXISTS (
                     -- Slot valido: precisa coincidir EXATAMENTE com o
                     -- inicio de um horario gerado pela janela. Estar
                     -- dentro do intervalo nao basta. Item 1.2.
                     SELECT 1
                       FROM disponibilidade d
                       CROSS JOIN LATERAL generate_series(
                            d.data_atendimento + d.hora_inicio,
                            d.data_atendimento + d.hora_fim - make_interval(mins => d.duracao_minutos),
                            make_interval(mins => d.duracao_minutos)
                       ) AS inicio
                      WHERE d.id_profissional_clinica = $1
                        AND d.ativo
                        AND (inicio AT TIME ZONE 'America/Recife') = $2::timestamptz
                 ) AS horario_invalido,
                 (
                     SELECT COUNT(*) FROM agendamento a
                      WHERE a.id_paciente = $5
                        AND a.status IN ('AGENDADO', 'CONFIRMADO')
                        AND a.data_hora > NOW()
                 ) AS futuros_ativos`,
            [idPc, dataHora, idEsp, HORAS_ANTECEDENCIA_MARCAR, idPaciente]
        );

        const v = rows[0];

        if (v.no_passado) {
            throw new ErroApi(400, 'HORARIO_NO_PASSADO', 'Esse horario ja passou. Escolha uma data futura.');
        }
        if (v.sem_antecedencia) {
            throw new ErroApi(400, 'ANTECEDENCIA_INSUFICIENTE',
                `As consultas precisam ser marcadas com pelo menos ${HORAS_ANTECEDENCIA_MARCAR} horas de antecedencia.`);
        }
        if (v.vinculo_inativo) {
            throw new ErroApi(400, 'PROFISSIONAL_CLINICA_INATIVO', 'Este profissional ou clinica nao esta disponivel no momento.');
        }
        if (v.especialidade_nao_atendida) {
            throw new ErroApi(400, 'ESPECIALIDADE_NAO_ATENDIDA', 'Este profissional nao atende a especialidade escolhida.');
        }
        if (v.horario_invalido) {
            throw new ErroApi(400, 'HORARIO_INVALIDO', 'Este horario nao esta na agenda do profissional. Escolha um dos horarios oferecidos.');
        }
        if (Number(v.futuros_ativos) >= LIMITE_AGENDAMENTOS_FUTUROS) {
            throw new ErroApi(409, 'LIMITE_AGENDAMENTOS_EXCEDIDO',
                `Voce ja tem ${LIMITE_AGENDAMENTOS_FUTUROS} consultas marcadas. Cancele uma antes de marcar outra.`);
        }

        // As validacoes acima melhoram a mensagem, mas nao protegem
        // contra requisicoes simultaneas. A garantia real sao os dois
        // indices unicos parciais do banco. Secao 7.2.
        const inserido = await consultar(
            `INSERT INTO agendamento (id_paciente, id_profissional_clinica, id_especialidade, data_hora, observacao)
             VALUES ($1, $2, $3, $4::timestamptz, $5)
             RETURNING id_agendamento`,
            [idPaciente, idPc, idEsp, dataHora, observacao ?? null]
        );

        const detalhe = await consultar(
            `${SELECT_AGENDAMENTO} WHERE a.id_agendamento = $1`,
            [inserido.rows[0].id_agendamento]
        );

        return resposta.status(201).json(formatar(detalhe.rows[0]));
    } catch (erro) {
        if (erro.code === '23505') {
            if (erro.constraint === 'uq_agendamento_slot') {
                return proximo(new ErroApi(409, 'HORARIO_INDISPONIVEL',
                    'Alguem marcou esse horario agora ha pouco. Escolha outro, por favor.'));
            }
            if (erro.constraint === 'uq_agendamento_paciente_horario') {
                return proximo(new ErroApi(409, 'PACIENTE_JA_AGENDADO',
                    'Voce ja tem outra consulta marcada nesse mesmo horario.'));
            }
        }
        return proximo(erro);
    }
});

// =====================================================================
// GET /agendamentos
// Lista os agendamentos do paciente autenticado.
// O filtro por id_paciente vem do token, nunca de parametro, senao
// qualquer paciente poderia ler a agenda de outro.
// =====================================================================
rotas.get('/', autenticar, exigePerfil('PACIENTE'), async (requisicao, resposta, proximo) => {
    try {
        const { rows } = await consultar(
            `${SELECT_AGENDAMENTO} WHERE a.id_paciente = $1 ORDER BY a.data_hora DESC`,
            [requisicao.usuario.idPaciente]
        );
        return resposta.json(rows.map(formatar));
    } catch (erro) {
        return proximo(erro);
    }
});

// =====================================================================
// GET /agendamentos/:id
// Paciente ve apenas os proprios. Administrador ve qualquer um.
// Id de outro paciente devolve 404, nao 403: informar que o registro
// existe mas pertence a outra pessoa ja e vazamento de informacao.
// =====================================================================
rotas.get('/:id', autenticar, async (requisicao, resposta, proximo) => {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';

        const { rows } = await consultar(
            `${SELECT_AGENDAMENTO}
              WHERE a.id_agendamento = $1
                AND ($2::boolean IS TRUE OR a.id_paciente = $3)`,
            [id, ehAdministrador, requisicao.usuario.idPaciente]
        );

        if (rows.length === 0) {
            throw new ErroApi(404, 'AGENDAMENTO_NAO_ENCONTRADO', 'Consulta nao encontrada.');
        }
        return resposta.json(formatar(rows[0]));
    } catch (erro) {
        return proximo(erro);
    }
});

// Carrega o agendamento e verifica se o usuario atual pode altera-lo.
async function carregarParaAlteracao(requisicao, id) {
    const { tipoUsuario, idPaciente, idProfissional } = requisicao.usuario;

    const { rows } = await consultar(
        `SELECT a.id_agendamento, a.id_paciente, a.status, a.data_hora,
                pc.id_profissional,
                a.data_hora <= NOW() AS ja_passou,
                a.data_hora < NOW() + make_interval(hours => $2::int) AS dentro_do_prazo_curto
           FROM agendamento a
           JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
          WHERE a.id_agendamento = $1`,
        [id, HORAS_ANTECEDENCIA_CANCELAR]
    );

    const agendamento = rows[0];
    const naoEncontrado = new ErroApi(404, 'AGENDAMENTO_NAO_ENCONTRADO', 'Consulta nao encontrada.');
    if (!agendamento) throw naoEncontrado;

    if (tipoUsuario === 'PACIENTE' && Number(agendamento.id_paciente) !== idPaciente) throw naoEncontrado;
    if (tipoUsuario === 'PROFISSIONAL' && Number(agendamento.id_profissional) !== idProfissional) throw naoEncontrado;

    return agendamento;
}

async function devolverDetalhe(id, resposta) {
    const { rows } = await consultar(`${SELECT_AGENDAMENTO} WHERE a.id_agendamento = $1`, [id]);
    return resposta.json(formatar(rows[0]));
}

// =====================================================================
// PATCH /agendamentos/:id/cancelamento
//
// Secao 3 do documento de regras:
//   - paciente cancela com no minimo 8 horas de antecedencia
//   - administrador cancela a qualquer momento, porque precisa lidar
//     com ausencia do profissional e imprevistos da clinica
//   - agendamento passado nao pode ser cancelado por ninguem
// =====================================================================
rotas.patch('/:id/cancelamento', autenticar, exigePerfil('PACIENTE', 'ADMINISTRADOR'),
    async (requisicao, resposta, proximo) => {
        try {
            const id = idValido(requisicao.params.id);
            if (!id) throw erroDadosInvalidos('Identificador invalido.');

            const agendamento = await carregarParaAlteracao(requisicao, id);
            const { motivo } = requisicao.body ?? {};

            if (!['AGENDADO', 'CONFIRMADO'].includes(agendamento.status)) {
                throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA',
                    `Esta consulta ja esta ${agendamento.status.toLowerCase()} e nao pode ser cancelada.`);
            }
            if (agendamento.ja_passou) {
                throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA',
                    'Esta consulta ja aconteceu e nao pode ser cancelada.');
            }
            if (requisicao.usuario.tipoUsuario === 'PACIENTE' && agendamento.dentro_do_prazo_curto) {
                throw new ErroApi(400, 'CANCELAMENTO_FORA_DO_PRAZO',
                    `Faltam menos de ${HORAS_ANTECEDENCIA_CANCELAR} horas para a consulta. Ligue para a clinica para cancelar.`);
            }

            await consultar(
                `UPDATE agendamento
                    SET status = 'CANCELADO', cancelado_em = NOW(), motivo_cancelamento = $2
                  WHERE id_agendamento = $1`,
                [id, typeof motivo === 'string' && motivo.trim() ? motivo.trim().slice(0, 255) : null]
            );

            return devolverDetalhe(id, resposta);
        } catch (erro) {
            return proximo(erro);
        }
    });

// =====================================================================
// PATCH /agendamentos/:id/confirmacao   AGENDADO -> CONFIRMADO
// =====================================================================
rotas.patch('/:id/confirmacao', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'),
    async (requisicao, resposta, proximo) => {
        try {
            const id = idValido(requisicao.params.id);
            if (!id) throw erroDadosInvalidos('Identificador invalido.');

            const agendamento = await carregarParaAlteracao(requisicao, id);

            if (agendamento.status !== 'AGENDADO') {
                throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA',
                    `So e possivel confirmar uma consulta com status AGENDADO. Esta esta ${agendamento.status}.`);
            }

            await consultar(`UPDATE agendamento SET status = 'CONFIRMADO' WHERE id_agendamento = $1`, [id]);
            return devolverDetalhe(id, resposta);
        } catch (erro) {
            return proximo(erro);
        }
    });

// =====================================================================
// PATCH /agendamentos/:id/realizacao
//
// AGENDADO ou CONFIRMADO -> REALIZADO. A confirmacao previa nao e
// obrigatoria: um atendimento que aconteceu sem passar por CONFIRMADO
// pode ser fechado direto a partir de AGENDADO. Secao 4.
// =====================================================================
rotas.patch('/:id/realizacao', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'),
    async (requisicao, resposta, proximo) => {
        try {
            const id = idValido(requisicao.params.id);
            if (!id) throw erroDadosInvalidos('Identificador invalido.');

            const agendamento = await carregarParaAlteracao(requisicao, id);

            if (!['AGENDADO', 'CONFIRMADO'].includes(agendamento.status)) {
                throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA',
                    `Nao e possivel marcar como realizada uma consulta ${agendamento.status.toLowerCase()}.`);
            }

            await consultar(`UPDATE agendamento SET status = 'REALIZADO' WHERE id_agendamento = $1`, [id]);
            return devolverDetalhe(id, resposta);
        } catch (erro) {
            return proximo(erro);
        }
    });

export default rotas;

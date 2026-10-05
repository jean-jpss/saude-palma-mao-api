import { Router } from 'express';

import { consultar } from '../banco.js';
import { ErroApi, erroDadosInvalidos } from '../erros.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

const DIAS_PARA_FRENTE = 60;
const HORAS_ANTECEDENCIA_MARCAR = 24;

function idValido(valor) {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function dataValida(valor) {
    return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

// Aceita "08:00" e tambem "08:00:00", normalizando para HH:MM.
function horaNormalizada(valor) {
    if (typeof valor !== 'string') return null;
    const casa = valor.match(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/);
    return casa ? `${casa[1]}:${casa[2]}` : null;
}

function minutosDesdeMeiaNoite(hora) {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
}

// =====================================================================
// GET /disponibilidades?idProfissionalClinica=&data=
//
// Lista os horarios livres de um profissional em uma data.
//
// A tabela disponibilidade guarda JANELAS (08:00 as 12:00, 30 min),
// nao horarios individuais. Os horarios sao calculados aqui.
//
// Tres regras, todas da secao 1 do documento de regras v3:
//   1. Janela de listagem de NOW() + 24h ate NOW() + 60 dias
//   2. Horarios ocupados por agendamento ativo nao aparecem
//   3. A sobra da janela e descartada
//
// Sobre o fuso: data_atendimento e DATE e hora_inicio e TIME, ambos sem
// fuso, porque 08:00 e 08:00 no relogio da clinica. A conversao usa
// AT TIME ZONE 'America/Recife' de forma explicita. Sem isso o
// PostgreSQL usaria o fuso da sessao, que no Render e UTC.
// =====================================================================
rotas.get('/', autenticar, async (requisicao, resposta, proximo) => {
    try {
        const idProfissionalClinica = idValido(requisicao.query.idProfissionalClinica);
        const data = requisicao.query.data;

        if (!idProfissionalClinica) {
            throw erroDadosInvalidos('Informe o idProfissionalClinica.');
        }
        if (!dataValida(data)) {
            throw erroDadosInvalidos('Informe a data no formato AAAA-MM-DD.');
        }

        const { rows } = await consultar(
            `WITH janelas AS (
                 SELECT d.id_disponibilidade,
                        d.data_atendimento,
                        d.hora_inicio,
                        d.hora_fim,
                        d.duracao_minutos
                   FROM disponibilidade d
                   JOIN profissional_clinica pc ON pc.id_profissional_clinica = d.id_profissional_clinica
                   JOIN profissional pr         ON pr.id_profissional         = pc.id_profissional
                   JOIN clinica c               ON c.id_clinica               = pc.id_clinica
                  WHERE d.id_profissional_clinica = $1
                    AND d.data_atendimento = $2::date
                    AND d.ativo  = TRUE
                    AND pc.ativo = TRUE
                    AND pr.ativo = TRUE
                    AND c.ativo  = TRUE
             ),
             slots AS (
                 SELECT j.id_disponibilidade,
                        (inicio AT TIME ZONE 'America/Recife') AS data_hora
                   FROM janelas j
                   CROSS JOIN LATERAL generate_series(
                        j.data_atendimento + j.hora_inicio,
                        j.data_atendimento + j.hora_fim - make_interval(mins => j.duracao_minutos),
                        make_interval(mins => j.duracao_minutos)
                   ) AS inicio
             )
             SELECT s.id_disponibilidade, s.data_hora
               FROM slots s
              WHERE s.data_hora >= NOW() + make_interval(hours => $3::int)
                AND s.data_hora <= NOW() + make_interval(days => $4::int)
                AND NOT EXISTS (
                    SELECT 1
                      FROM agendamento a
                     WHERE a.id_profissional_clinica = $1
                       AND a.data_hora = s.data_hora
                       AND a.status IN ('AGENDADO', 'CONFIRMADO')
                )
              ORDER BY s.data_hora`,
            [idProfissionalClinica, data, HORAS_ANTECEDENCIA_MARCAR, DIAS_PARA_FRENTE]
        );

        return resposta.json({
            idProfissionalClinica,
            data,
            horarios: rows.map((r) => ({
                idDisponibilidade: Number(r.id_disponibilidade),
                dataHora: r.data_hora
            }))
        });
    } catch (erro) {
        return proximo(erro);
    }
});

// =====================================================================
// GET /disponibilidades/janelas?data=&de=&ate=
//
// Lista as JANELAS cadastradas, nao os horarios livres.
//
// E a visao de quem administra a agenda, nao a de quem marca consulta.
// O profissional precisa ver o que ja cadastrou antes de cadastrar
// mais, e precisa dos ids para desativar.
// =====================================================================
rotas.get('/janelas', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'),
    async (requisicao, resposta, proximo) => {
        try {
            const { de, ate, idProfissionalClinica } = requisicao.query;
            const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';

            if (de !== undefined && !dataValida(de)) {
                throw erroDadosInvalidos('Informe "de" no formato AAAA-MM-DD.');
            }
            if (ate !== undefined && !dataValida(ate)) {
                throw erroDadosInvalidos('Informe "ate" no formato AAAA-MM-DD.');
            }

            let filtroPc = null;
            if (idProfissionalClinica !== undefined && idProfissionalClinica !== '' && ehAdministrador) {
                filtroPc = idValido(idProfissionalClinica);
                if (!filtroPc) throw erroDadosInvalidos('O idProfissionalClinica precisa ser um numero inteiro.');
            }

            const { rows } = await consultar(
                `SELECT d.id_disponibilidade,
                        d.id_profissional_clinica,
                        TO_CHAR(d.data_atendimento, 'YYYY-MM-DD') AS data_atendimento,
                        TO_CHAR(d.hora_inicio, 'HH24:MI') AS hora_inicio,
                        TO_CHAR(d.hora_fim,    'HH24:MI') AS hora_fim,
                        d.duracao_minutos,
                        d.ativo,
                        up.nome AS nome_profissional,
                        c.nome  AS nome_clinica,
                        (
                          SELECT COUNT(*) FROM agendamento a
                           WHERE a.id_profissional_clinica = d.id_profissional_clinica
                             AND a.status IN ('AGENDADO', 'CONFIRMADO')
                             AND (a.data_hora AT TIME ZONE 'America/Recife')::date = d.data_atendimento
                             AND (a.data_hora AT TIME ZONE 'America/Recife')::time >= d.hora_inicio
                             AND (a.data_hora AT TIME ZONE 'America/Recife')::time <  d.hora_fim
                        ) AS agendamentos_ativos
                   FROM disponibilidade d
                   JOIN profissional_clinica pc ON pc.id_profissional_clinica = d.id_profissional_clinica
                   JOIN profissional pr         ON pr.id_profissional         = pc.id_profissional
                   JOIN usuario up              ON up.id_usuario              = pr.id_usuario
                   JOIN clinica c               ON c.id_clinica               = pc.id_clinica
                  WHERE ($1::boolean IS TRUE OR pr.id_profissional = $2)
                    AND ($3::bigint IS NULL OR d.id_profissional_clinica = $3)
                    AND ($4::date IS NULL OR d.data_atendimento >= $4::date)
                    AND ($5::date IS NULL OR d.data_atendimento <= $5::date)
                    AND d.ativo = TRUE
                  ORDER BY d.data_atendimento, d.hora_inicio
                  LIMIT 300`,
                [ehAdministrador, requisicao.usuario.idProfissional, filtroPc, de ?? null, ate ?? null]
            );

            return resposta.json(rows.map((r) => ({
                idDisponibilidade: Number(r.id_disponibilidade),
                idProfissionalClinica: Number(r.id_profissional_clinica),
                dataAtendimento: r.data_atendimento,
                horaInicio: r.hora_inicio,
                horaFim: r.hora_fim,
                duracaoMinutos: r.duracao_minutos,
                ativo: r.ativo,
                profissional: r.nome_profissional,
                clinica: r.nome_clinica,
                // Util na tela: o botao de desativar fica desabilitado
                // quando este numero for maior que zero.
                agendamentosAtivos: Number(r.agendamentos_ativos)
            })));
        } catch (erro) {
            return proximo(erro);
        }
    });

// =====================================================================
// POST /disponibilidades
//
// Requisito 10 da 1a entrega: cadastrar os dias e horarios disponiveis
// para atendimento de cada profissional.
//
// Corpo:
//   idProfissionalClinica  obrigatorio
//   dataAtendimento        AAAA-MM-DD
//   horaInicio             HH:MM
//   horaFim                HH:MM
//   duracaoMinutos         opcional, padrao 30
// =====================================================================
rotas.post('/', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'),
    async (requisicao, resposta, proximo) => {
        try {
            const corpo = requisicao.body ?? {};
            const idPc = idValido(corpo.idProfissionalClinica);
            const data = corpo.dataAtendimento;
            const inicio = horaNormalizada(corpo.horaInicio);
            const fim = horaNormalizada(corpo.horaFim);
            const duracao = corpo.duracaoMinutos === undefined ? 30 : Number(corpo.duracaoMinutos);

            if (!idPc) throw erroDadosInvalidos('Informe o idProfissionalClinica.');
            if (!dataValida(data)) throw erroDadosInvalidos('Informe a dataAtendimento no formato AAAA-MM-DD.');
            if (!inicio) throw erroDadosInvalidos('Informe a horaInicio no formato HH:MM.');
            if (!fim) throw erroDadosInvalidos('Informe a horaFim no formato HH:MM.');
            if (!Number.isInteger(duracao) || duracao < 5 || duracao > 240) {
                throw erroDadosInvalidos('A duracaoMinutos precisa ser um numero inteiro entre 5 e 240.');
            }
            if (minutosDesdeMeiaNoite(fim) <= minutosDesdeMeiaNoite(inicio)) {
                throw erroDadosInvalidos('A horaFim precisa ser maior que a horaInicio.');
            }
            if (minutosDesdeMeiaNoite(fim) - minutosDesdeMeiaNoite(inicio) < duracao) {
                throw erroDadosInvalidos('A janela e menor que a duracao de uma consulta. Nenhum horario seria gerado.');
            }

            // Uma consulta resolve as tres verificacoes de contexto.
            const { rows } = await consultar(
                `SELECT
                     NOT EXISTS (
                         SELECT 1 FROM profissional_clinica pc
                           JOIN profissional pr ON pr.id_profissional = pc.id_profissional
                           JOIN clinica c       ON c.id_clinica       = pc.id_clinica
                           JOIN usuario u       ON u.id_usuario       = pr.id_usuario
                          WHERE pc.id_profissional_clinica = $1
                            AND pc.ativo AND pr.ativo AND c.ativo AND u.ativo
                     ) AS vinculo_inativo,
                     (
                         SELECT pr.id_profissional FROM profissional_clinica pc
                           JOIN profissional pr ON pr.id_profissional = pc.id_profissional
                          WHERE pc.id_profissional_clinica = $1
                     ) AS dono,
                     $2::date < CURRENT_DATE AS data_no_passado,
                     EXISTS (
                         -- Sobreposicao: duas janelas do mesmo vinculo no
                         -- mesmo dia nao podem se cruzar, senao o mesmo
                         -- horario seria gerado duas vezes.
                         SELECT 1 FROM disponibilidade d
                          WHERE d.id_profissional_clinica = $1
                            AND d.data_atendimento = $2::date
                            AND d.ativo
                            AND d.hora_inicio < $4::time
                            AND d.hora_fim    > $3::time
                     ) AS sobrepoe`,
                [idPc, data, inicio, fim]
            );

            const v = rows[0];

            if (v.vinculo_inativo) {
                throw new ErroApi(400, 'PROFISSIONAL_CLINICA_INATIVO',
                    'Este vinculo de profissional com clinica nao esta ativo.');
            }

            // Um profissional so cadastra na propria agenda.
            if (requisicao.usuario.tipoUsuario === 'PROFISSIONAL'
                && Number(v.dono) !== requisicao.usuario.idProfissional) {
                throw new ErroApi(403, 'SEM_PERMISSAO',
                    'Voce so pode cadastrar disponibilidade na sua propria agenda.');
            }

            if (v.data_no_passado) {
                throw new ErroApi(400, 'DATA_NO_PASSADO',
                    'Nao e possivel cadastrar atendimento em uma data que ja passou.');
            }
            if (v.sobrepoe) {
                throw new ErroApi(409, 'JANELA_SOBREPOSTA',
                    'Ja existe uma janela de atendimento que cruza com este horario nesta data.');
            }

            const inserido = await consultar(
                `INSERT INTO disponibilidade
                     (id_profissional_clinica, data_atendimento, hora_inicio, hora_fim, duracao_minutos)
                 VALUES ($1, $2::date, $3::time, $4::time, $5)
                 RETURNING id_disponibilidade,
                           TO_CHAR(data_atendimento, 'YYYY-MM-DD') AS data_atendimento,
                           TO_CHAR(hora_inicio, 'HH24:MI') AS hora_inicio,
                           TO_CHAR(hora_fim,    'HH24:MI') AS hora_fim,
                           duracao_minutos, ativo`,
                [idPc, data, inicio, fim, duracao]
            );

            const d = inserido.rows[0];
            const totalSlots = Math.floor(
                (minutosDesdeMeiaNoite(fim) - minutosDesdeMeiaNoite(inicio)) / duracao
            );

            return resposta.status(201).json({
                idDisponibilidade: Number(d.id_disponibilidade),
                idProfissionalClinica: idPc,
                dataAtendimento: d.data_atendimento,
                horaInicio: d.hora_inicio,
                horaFim: d.hora_fim,
                duracaoMinutos: d.duracao_minutos,
                ativo: d.ativo,
                // Quantos horarios esta janela gera. Confirma ao
                // profissional o que ele acabou de criar.
                horariosGerados: totalSlots
            });
        } catch (erro) {
            // A constraint uq_disponibilidade_janela impede duas janelas
            // com o mesmo inicio no mesmo dia. A verificacao de
            // sobreposicao acima ja cobre isso, mas requisicoes
            // simultaneas passariam pela verificacao e seriam barradas
            // aqui, no banco.
            if (erro.code === '23505' && erro.constraint === 'uq_disponibilidade_janela') {
                return proximo(new ErroApi(409, 'JANELA_SOBREPOSTA',
                    'Ja existe uma janela de atendimento que comeca neste horario nesta data.'));
            }
            return proximo(erro);
        }
    });

// =====================================================================
// DELETE /disponibilidades/:id
//
// Desativacao logica, nunca remocao fisica. A janela continua no banco
// com ativo = FALSE, preservando o historico.
//
// Regra 1.3 do documento de regras: a desativacao e bloqueada enquanto
// existirem agendamentos ativos e futuros dentro da janela. Para
// desativar, o profissional cancela esses agendamentos um a um.
//
// Cancelamento em cascata automatico foi descartado pelo grupo: e mais
// comodo, mas removeria o agendamento do paciente sem que ninguem
// tivesse decidido caso a caso.
//
// Agendamentos passados dentro da janela nao bloqueiam, ja que servem
// apenas de historico.
//
// Decisao da 1a entrega: o erro informa QUANTOS agendamentos impedem a
// operacao, sem list-los individualmente. O profissional consulta
// quais sao pela rota GET /agenda. O detalhamento fica para a 2a
// entrega, conforme registrado na secao 8 do documento de regras.
// =====================================================================
rotas.delete('/:id', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'),
    async (requisicao, resposta, proximo) => {
        try {
            const id = idValido(requisicao.params.id);
            if (!id) throw erroDadosInvalidos('Identificador invalido.');

            const { rows } = await consultar(
                `SELECT d.id_disponibilidade, d.ativo, pc.id_profissional,
                        (
                          SELECT COUNT(*) FROM agendamento a
                           WHERE a.id_profissional_clinica = d.id_profissional_clinica
                             AND a.status IN ('AGENDADO', 'CONFIRMADO')
                             AND a.data_hora > NOW()
                             AND (a.data_hora AT TIME ZONE 'America/Recife')::date = d.data_atendimento
                             AND (a.data_hora AT TIME ZONE 'America/Recife')::time >= d.hora_inicio
                             AND (a.data_hora AT TIME ZONE 'America/Recife')::time <  d.hora_fim
                        ) AS bloqueantes
                   FROM disponibilidade d
                   JOIN profissional_clinica pc ON pc.id_profissional_clinica = d.id_profissional_clinica
                  WHERE d.id_disponibilidade = $1`,
                [id]
            );

            const janela = rows[0];
            const naoEncontrada = new ErroApi(404, 'DISPONIBILIDADE_NAO_ENCONTRADA',
                'Janela de atendimento nao encontrada.');

            if (!janela) throw naoEncontrada;

            // Janela de outro profissional devolve 404, nao 403: dizer
            // "existe, mas nao e sua" ja entrega informacao alheia.
            if (requisicao.usuario.tipoUsuario === 'PROFISSIONAL'
                && Number(janela.id_profissional) !== requisicao.usuario.idProfissional) {
                throw naoEncontrada;
            }

            if (!janela.ativo) {
                throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA',
                    'Esta janela de atendimento ja esta desativada.');
            }

            const bloqueantes = Number(janela.bloqueantes);
            if (bloqueantes > 0) {
                throw new ErroApi(409, 'DISPONIBILIDADE_COM_AGENDAMENTOS',
                    `Esta janela tem ${bloqueantes} consulta${bloqueantes > 1 ? 's' : ''} marcada${bloqueantes > 1 ? 's' : ''}. `
                    + 'Cancele essas consultas antes de desativar a janela. '
                    + 'Para ver quais sao, consulte a sua agenda.');
            }

            await consultar(
                `UPDATE disponibilidade SET ativo = FALSE WHERE id_disponibilidade = $1`,
                [id]
            );

            return resposta.status(204).send();
        } catch (erro) {
            return proximo(erro);
        }
    });

export default rotas;

import { Router } from 'express';

import { consultar } from '../banco.js';
import { erroDadosInvalidos } from '../erros.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

// =====================================================================
// GET /agenda
//
// Lista os atendimentos do profissional autenticado.
//
// Por que esta rota existe em arquivo separado, e nao dentro de
// agendamentos.js: em Express, as rotas sao avaliadas na ordem em que
// foram registradas. O arquivo agendamentos.js ja tem GET /:id, que
// casa com qualquer texto. Uma rota GET /agenda declarada depois dela
// nunca seria alcancada, porque "agenda" seria capturado como se fosse
// um id. Montar em um caminho proprio elimina esse risco.
//
// Perfis:
//   PROFISSIONAL   ve apenas os proprios atendimentos
//   ADMINISTRADOR  ve todos, com filtro opcional por profissional
//
// Parametros opcionais:
//   data                   AAAA-MM-DD, um dia especifico
//   status                 AGENDADO, CONFIRMADO, CANCELADO ou REALIZADO
//   idProfissionalClinica  apenas para administrador
// =====================================================================

const STATUS_VALIDOS = ['AGENDADO', 'CONFIRMADO', 'CANCELADO', 'REALIZADO'];

rotas.get('/', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'),
    async (requisicao, resposta, proximo) => {
        try {
            const { data, status, idProfissionalClinica } = requisicao.query;
            const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';

            if (data !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
                throw erroDadosInvalidos('Informe a data no formato AAAA-MM-DD.');
            }
            if (status !== undefined && !STATUS_VALIDOS.includes(status)) {
                throw erroDadosInvalidos(`O status precisa ser um destes: ${STATUS_VALIDOS.join(', ')}.`);
            }

            let filtroProfissionalClinica = null;
            if (idProfissionalClinica !== undefined && idProfissionalClinica !== '') {
                const numero = Number(idProfissionalClinica);
                if (!Number.isInteger(numero) || numero <= 0) {
                    throw erroDadosInvalidos('O idProfissionalClinica precisa ser um numero inteiro.');
                }
                // Um profissional nao filtra por outro profissional: o
                // recorte dele ja e fixo pelo proprio id.
                if (ehAdministrador) {
                    filtroProfissionalClinica = numero;
                }
            }

            const { rows } = await consultar(
                `SELECT a.id_agendamento,
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
                        upa.nome AS nome_paciente,
                        upa.telefone AS telefone_paciente,
                        TO_CHAR(p.data_nascimento, 'YYYY-MM-DD') AS data_nascimento_paciente
                   FROM agendamento a
                   JOIN especialidade e         ON e.id_especialidade         = a.id_especialidade
                   JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
                   JOIN profissional pr         ON pr.id_profissional         = pc.id_profissional
                   JOIN usuario up              ON up.id_usuario              = pr.id_usuario
                   JOIN clinica c               ON c.id_clinica               = pc.id_clinica
                   JOIN paciente p              ON p.id_paciente              = a.id_paciente
                   JOIN usuario upa             ON upa.id_usuario             = p.id_usuario
                  WHERE ($1::boolean IS TRUE OR pr.id_profissional = $2)
                    AND ($3::bigint IS NULL OR pc.id_profissional_clinica = $3)
                    AND ($4::date   IS NULL OR (a.data_hora AT TIME ZONE 'America/Recife')::date = $4::date)
                    AND ($5::text   IS NULL OR a.status::text = $5)
                  ORDER BY a.data_hora
                  LIMIT 200`,
                [
                    ehAdministrador,
                    requisicao.usuario.idProfissional,
                    filtroProfissionalClinica,
                    data ?? null,
                    status ?? null
                ]
            );

            return resposta.json(rows.map((r) => ({
                idAgendamento: Number(r.id_agendamento),
                dataHora: r.data_hora,
                status: r.status,
                observacao: r.observacao,
                canceladoEm: r.cancelado_em,
                motivoCancelamento: r.motivo_cancelamento,
                criadoEm: r.criado_em,
                // A agenda do profissional traz telefone e data de
                // nascimento do paciente, que a listagem do paciente nao
                // precisa. Sao dados de contato e de contexto clinico
                // basico, uteis no atendimento.
                paciente: {
                    idPaciente: Number(r.id_paciente),
                    nome: r.nome_paciente,
                    telefone: r.telefone_paciente,
                    dataNascimento: r.data_nascimento_paciente
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
            })));
        } catch (erro) {
            return proximo(erro);
        }
    });

export default rotas;

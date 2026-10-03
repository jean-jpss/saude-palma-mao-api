import { Router } from 'express';
import { consultar } from '../banco.js';
import { erroDadosInvalidos } from '../erros.js';
import { autenticar } from '../middlewares/autenticacao.js';

const rotas = Router();

// =====================================================================
// GET /disponibilidades?idProfissionalClinica=&data=
//
// O endpoint com mais regra de negocio da 1a entrega.
//
// A tabela disponibilidade guarda JANELAS (08:00 as 12:00, 30 min),
// nao horarios individuais. Os horarios sao calculados aqui.
//
// Por que calcular em vez de gravar cada horario no banco:
// gravar significaria criar centenas de linhas por profissional por
// mes, e qualquer mudanca de janela exigiria apagar e recriar tudo.
// Calcular mantem uma linha por janela.
//
// Tres regras aplicadas, todas da secao 1 do documento de regras v3:
//   1. Janela de listagem: de NOW() + 24 horas ate NOW() + 60 dias.
//      O limite inferior acompanha a antecedencia minima para marcar.
//      Filtrar so por "futuro" faria aparecer horario que depois
//      seria recusado no POST.
//   2. Horarios ja ocupados por agendamento ativo nao aparecem.
//      Agendamento cancelado libera o horario de volta.
//   3. A sobra da janela e descartada. Em 08:00 as 12:10 com 30 min,
//      o ultimo horario e 11:30, nao 11:40.
//
// Sobre o fuso: data_atendimento e DATE e hora_inicio e TIME, ambos
// sem fuso, porque 08:00 e 08:00 no relogio da clinica. A conversao
// para timestamptz usa AT TIME ZONE 'America/Recife' de forma
// explicita. Sem isso o PostgreSQL usaria o fuso da sessao, que no
// Render e UTC, e o horario das 08:00 viraria 05:00 em Recife.
// =====================================================================
rotas.get('/', autenticar, async (requisicao, resposta, proximo) => {
    try {
        const idProfissionalClinica = Number(requisicao.query.idProfissionalClinica);
        const data = requisicao.query.data;

        if (!Number.isInteger(idProfissionalClinica) || idProfissionalClinica <= 0) {
            throw erroDadosInvalidos('Informe o idProfissionalClinica.');
        }
        if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
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
              WHERE s.data_hora >= NOW() + INTERVAL '24 hours'
                AND s.data_hora <= NOW() + INTERVAL '60 days'
                AND NOT EXISTS (
                    SELECT 1
                      FROM agendamento a
                     WHERE a.id_profissional_clinica = $1
                       AND a.data_hora = s.data_hora
                       AND a.status IN ('AGENDADO', 'CONFIRMADO')
                )
              ORDER BY s.data_hora`,
            [idProfissionalClinica, data]
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

export default rotas;

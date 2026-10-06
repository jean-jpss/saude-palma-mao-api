// =====================================================================
// MODEL: disponibilidade
//
// A tabela guarda JANELAS (08:00 as 12:00, 30 min), nao horarios
// individuais. Os horarios sao calculados por consulta, com
// generate_series. Gravar cada horario criaria centenas de linhas por
// profissional por mes, e qualquer mudanca de janela exigiria apagar e
// recriar tudo.
//
// Sobre o fuso: data_atendimento e DATE e hora_inicio e TIME, ambos
// sem fuso, porque 08:00 e 08:00 no relogio da clinica. A conversao
// usa AT TIME ZONE 'America/Recife' de forma explicita. Sem isso o
// PostgreSQL usaria o fuso da sessao, que no ambiente publicado e UTC,
// e os horarios sairiam com tres horas de diferenca.
// =====================================================================
import { consultar } from '../banco.js';

export async function listarHorariosLivres(idProfissionalClinica, data, horasAntecedencia, diasParaFrente) {
    const { rows } = await consultar(
        `WITH janelas AS (
             SELECT d.id_disponibilidade, d.data_atendimento,
                    d.hora_inicio, d.hora_fim, d.duracao_minutos
               FROM disponibilidade d
               JOIN profissional_clinica pc ON pc.id_profissional_clinica = d.id_profissional_clinica
               JOIN profissional pr         ON pr.id_profissional         = pc.id_profissional
               JOIN clinica c               ON c.id_clinica               = pc.id_clinica
              WHERE d.id_profissional_clinica = $1
                AND d.data_atendimento = $2::date
                AND d.ativo AND pc.ativo AND pr.ativo AND c.ativo
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
                SELECT 1 FROM agendamento a
                 WHERE a.id_profissional_clinica = $1
                   AND a.data_hora = s.data_hora
                   AND a.status IN ('AGENDADO', 'CONFIRMADO')
            )
          ORDER BY s.data_hora`,
        [idProfissionalClinica, data, horasAntecedencia, diasParaFrente]
    );
    return rows;
}

export async function listarJanelas({ ehAdministrador, idProfissional, filtroPc, de, ate }) {
    const { rows } = await consultar(
        `SELECT d.id_disponibilidade, d.id_profissional_clinica,
                TO_CHAR(d.data_atendimento, 'YYYY-MM-DD') AS data_atendimento,
                TO_CHAR(d.hora_inicio, 'HH24:MI') AS hora_inicio,
                TO_CHAR(d.hora_fim,    'HH24:MI') AS hora_fim,
                d.duracao_minutos, d.ativo,
                up.nome AS nome_profissional, c.nome AS nome_clinica,
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
        [ehAdministrador, idProfissional, filtroPc, de, ate]
    );
    return rows;
}

// Resolve, em uma consulta, as quatro verificacoes de contexto do
// cadastro de janela.
export async function verificarContextoCadastro(idPc, data, inicio, fim) {
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
                 -- Duas janelas do mesmo vinculo no mesmo dia nao podem
                 -- se cruzar, senao o mesmo horario seria gerado duas
                 -- vezes na listagem do paciente.
                 SELECT 1 FROM disponibilidade d
                  WHERE d.id_profissional_clinica = $1
                    AND d.data_atendimento = $2::date
                    AND d.ativo
                    AND d.hora_inicio < $4::time
                    AND d.hora_fim    > $3::time
             ) AS sobrepoe`,
        [idPc, data, inicio, fim]
    );
    return rows[0];
}

export async function inserir(idPc, data, inicio, fim, duracao) {
    const { rows } = await consultar(
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
    return rows[0];
}

export async function buscarComBloqueantes(id) {
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
    return rows[0] ?? null;
}

export async function desativar(id) {
    await consultar(`UPDATE disponibilidade SET ativo = FALSE WHERE id_disponibilidade = $1`, [id]);
}

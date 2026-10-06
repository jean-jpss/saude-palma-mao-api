// =====================================================================
// MODEL: agendamento
// =====================================================================
import { consultar } from '../banco.js';

const SELECT_AGENDAMENTO = `
    SELECT a.id_agendamento, a.data_hora, a.status, a.observacao,
           a.cancelado_em, a.motivo_cancelamento, a.criado_em,
           e.id_especialidade, e.nome AS nome_especialidade,
           pc.id_profissional_clinica,
           up.nome AS nome_profissional,
           pr.conselho, pr.registro_profissional, pr.uf_registro,
           c.id_clinica, c.nome AS nome_clinica,
           c.logradouro, c.numero, c.bairro, c.cidade, c.uf,
           a.id_paciente, upa.nome AS nome_paciente
      FROM agendamento a
      JOIN especialidade e         ON e.id_especialidade         = a.id_especialidade
      JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
      JOIN profissional pr         ON pr.id_profissional         = pc.id_profissional
      JOIN usuario up              ON up.id_usuario              = pr.id_usuario
      JOIN clinica c               ON c.id_clinica               = pc.id_clinica
      JOIN paciente p              ON p.id_paciente              = a.id_paciente
      JOIN usuario upa             ON upa.id_usuario             = p.id_usuario
`;

// Resolve as seis verificacoes de negocio em uma consulta. Fazer seis
// consultas separadas custaria seis idas ao banco e abriria espaco
// para inconsistencia entre elas.
export async function verificarRegrasCriacao(idPc, dataHora, idEsp, horasAntecedencia, idPaciente) {
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
                  WHERE pc.id_profissional_clinica = $1 AND pe.id_especialidade = $3
             ) AS especialidade_nao_atendida,
             NOT EXISTS (
                 -- Slot valido: precisa coincidir EXATAMENTE com o
                 -- inicio de um horario gerado pela janela. Estar
                 -- dentro do intervalo nao basta.
                 SELECT 1 FROM disponibilidade d
                   CROSS JOIN LATERAL generate_series(
                        d.data_atendimento + d.hora_inicio,
                        d.data_atendimento + d.hora_fim - make_interval(mins => d.duracao_minutos),
                        make_interval(mins => d.duracao_minutos)
                   ) AS inicio
                  WHERE d.id_profissional_clinica = $1 AND d.ativo
                    AND (inicio AT TIME ZONE 'America/Recife') = $2::timestamptz
             ) AS horario_invalido,
             (
                 SELECT COUNT(*) FROM agendamento a
                  WHERE a.id_paciente = $5
                    AND a.status IN ('AGENDADO', 'CONFIRMADO')
                    AND a.data_hora > NOW()
             ) AS futuros_ativos`,
        [idPc, dataHora, idEsp, horasAntecedencia, idPaciente]
    );
    return rows[0];
}

export async function inserir(idPaciente, idPc, idEsp, dataHora, observacao) {
    const { rows } = await consultar(
        `INSERT INTO agendamento (id_paciente, id_profissional_clinica, id_especialidade, data_hora, observacao)
         VALUES ($1, $2, $3, $4::timestamptz, $5)
         RETURNING id_agendamento`,
        [idPaciente, idPc, idEsp, dataHora, observacao]
    );
    return rows[0].id_agendamento;
}

export async function buscarPorId(id) {
    const { rows } = await consultar(`${SELECT_AGENDAMENTO} WHERE a.id_agendamento = $1`, [id]);
    return rows[0] ?? null;
}

export async function buscarPorIdComPermissao(id, ehAdministrador, idPaciente) {
    const { rows } = await consultar(
        `${SELECT_AGENDAMENTO}
          WHERE a.id_agendamento = $1
            AND ($2::boolean IS TRUE OR a.id_paciente = $3)`,
        [id, ehAdministrador, idPaciente]
    );
    return rows[0] ?? null;
}

export async function listarPorPaciente(idPaciente) {
    const { rows } = await consultar(
        `${SELECT_AGENDAMENTO} WHERE a.id_paciente = $1 ORDER BY a.data_hora DESC`,
        [idPaciente]
    );
    return rows;
}

// Agenda do profissional. Traz telefone e data de nascimento do
// paciente, que a listagem do proprio paciente nao precisa: sao dados
// de contato e contexto basico, uteis no atendimento.
export async function listarAgenda({ ehAdministrador, idProfissional, filtroPc, data, status }) {
    const { rows } = await consultar(
        `SELECT a.id_agendamento, a.data_hora, a.status, a.observacao,
                a.cancelado_em, a.motivo_cancelamento, a.criado_em,
                e.id_especialidade, e.nome AS nome_especialidade,
                pc.id_profissional_clinica,
                up.nome AS nome_profissional,
                pr.conselho, pr.registro_profissional, pr.uf_registro,
                c.id_clinica, c.nome AS nome_clinica,
                c.logradouro, c.numero, c.bairro, c.cidade, c.uf,
                a.id_paciente, upa.nome AS nome_paciente,
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
        [ehAdministrador, idProfissional, filtroPc, data, status]
    );
    return rows;
}

export async function carregarParaAlteracao(id, horasAntecedenciaCancelar) {
    const { rows } = await consultar(
        `SELECT a.id_agendamento, a.id_paciente, a.status, a.data_hora,
                pc.id_profissional,
                a.data_hora <= NOW() AS ja_passou,
                a.data_hora < NOW() + make_interval(hours => $2::int) AS dentro_do_prazo_curto
           FROM agendamento a
           JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
          WHERE a.id_agendamento = $1`,
        [id, horasAntecedenciaCancelar]
    );
    return rows[0] ?? null;
}

export async function cancelar(id, motivo) {
    await consultar(
        `UPDATE agendamento
            SET status = 'CANCELADO', cancelado_em = NOW(), motivo_cancelamento = $2
          WHERE id_agendamento = $1`,
        [id, motivo]
    );
}

export async function alterarStatus(id, novoStatus) {
    await consultar(`UPDATE agendamento SET status = $2 WHERE id_agendamento = $1`, [id, novoStatus]);
}

// =====================================================================
// MODEL: especialidade
// =====================================================================
import { consultar } from '../banco.js';

export async function listar(incluirInativas) {
    const { rows } = await consultar(
        `SELECT id_especialidade, nome, descricao, ativo
           FROM especialidade
          WHERE ($1::boolean IS TRUE OR ativo = TRUE)
          ORDER BY nome`,
        [incluirInativas]
    );
    return rows;
}

export async function inserir({ nome, descricao }) {
    const { rows } = await consultar(
        `INSERT INTO especialidade (nome, descricao)
         VALUES ($1, $2)
         RETURNING id_especialidade, nome, descricao, ativo`,
        [nome, descricao]
    );
    return rows[0];
}

export async function atualizar(id, { nome, descricao, ativo }) {
    // COALESCE preserva o valor atual quando o parametro vem nulo, que
    // e o comportamento esperado de uma atualizacao parcial.
    const { rows } = await consultar(
        `UPDATE especialidade
            SET nome      = COALESCE($2, nome),
                descricao = COALESCE($3, descricao),
                ativo     = COALESCE($4, ativo)
          WHERE id_especialidade = $1
          RETURNING id_especialidade, nome, descricao, ativo`,
        [id, nome, descricao, ativo]
    );
    return rows[0] ?? null;
}

export async function buscarComBloqueantes(id) {
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
    return rows[0] ?? null;
}

export async function desativar(id) {
    await consultar(`UPDATE especialidade SET ativo = FALSE WHERE id_especialidade = $1`, [id]);
}

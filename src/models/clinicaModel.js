// =====================================================================
// MODEL: clinica
// =====================================================================
import { consultar, transacao } from '../banco.js';

const SELECT_CLINICA = `
    SELECT c.id_clinica, c.nome, c.telefone, c.email,
           c.logradouro, c.numero, c.bairro, c.cidade, c.uf, c.cep,
           c.horario_funcionamento, c.ativo,
           ARRAY_REMOVE(ARRAY_AGG(DISTINCT e.nome ORDER BY e.nome), NULL) AS especialidades
      FROM clinica c
      LEFT JOIN clinica_especialidade ce ON ce.id_clinica = c.id_clinica
      LEFT JOIN especialidade e ON e.id_especialidade = ce.id_especialidade AND e.ativo = TRUE
`;

export async function listar({ idEspecialidade, busca, incluirInativas }) {
    const { rows } = await consultar(
        `${SELECT_CLINICA}
          WHERE ($3::boolean IS TRUE OR c.ativo = TRUE)
            AND ($1::bigint IS NULL OR EXISTS (
                    SELECT 1 FROM clinica_especialidade f
                     WHERE f.id_clinica = c.id_clinica
                       AND f.id_especialidade = $1
                ))
            AND ($2::text = '' OR c.nome ILIKE '%' || $2 || '%' OR c.bairro ILIKE '%' || $2 || '%')
          GROUP BY c.id_clinica
          ORDER BY c.nome`,
        [idEspecialidade, busca, incluirInativas]
    );
    return rows;
}

export async function buscarPorId(id, incluirInativas = false) {
    const { rows } = await consultar(
        `${SELECT_CLINICA}
          WHERE c.id_clinica = $1 AND ($2::boolean IS TRUE OR c.ativo = TRUE)
          GROUP BY c.id_clinica`,
        [id, incluirInativas]
    );
    return rows[0] ?? null;
}

export async function criarComEspecialidades(dados, idsEspecialidades) {
    return transacao(async (cliente) => {
        const { rows } = await cliente.query(
            `INSERT INTO clinica
                 (nome, cnpj, telefone, email, logradouro, numero, bairro, cidade, uf, cep, horario_funcionamento)
             VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'Recife'), COALESCE($9, 'PE'), $10, $11)
             RETURNING id_clinica`,
            [
                dados.nome, dados.cnpj, dados.telefone ?? null, dados.email ?? null,
                dados.logradouro, dados.numero ?? null, dados.bairro ?? null,
                dados.cidade ?? null, dados.uf ?? null, dados.cep ?? null,
                dados.horarioFuncionamento ?? null
            ]
        );

        const id = rows[0].id_clinica;

        if (Array.isArray(idsEspecialidades) && idsEspecialidades.length > 0) {
            await cliente.query(
                `INSERT INTO clinica_especialidade (id_clinica, id_especialidade)
                 SELECT $1, UNNEST($2::bigint[])`,
                [id, idsEspecialidades]
            );
        }

        return id;
    });
}

export async function atualizar(id, d, ativo) {
    const { rowCount } = await consultar(
        `UPDATE clinica
            SET nome       = COALESCE($2, nome),
                cnpj       = COALESCE($3, cnpj),
                telefone   = COALESCE($4, telefone),
                email      = COALESCE($5, email),
                logradouro = COALESCE($6, logradouro),
                numero     = COALESCE($7, numero),
                bairro     = COALESCE($8, bairro),
                cidade     = COALESCE($9, cidade),
                uf         = COALESCE($10, uf),
                cep        = COALESCE($11, cep),
                horario_funcionamento = COALESCE($12, horario_funcionamento),
                ativo      = COALESCE($13, ativo)
          WHERE id_clinica = $1`,
        [
            id, d.nome ?? null, d.cnpj ?? null, d.telefone ?? null, d.email ?? null,
            d.logradouro ?? null, d.numero ?? null, d.bairro ?? null, d.cidade ?? null,
            d.uf ?? null, d.cep ?? null, d.horarioFuncionamento ?? null,
            ativo !== undefined ? ativo : null
        ]
    );
    return rowCount > 0;
}

export async function existe(id) {
    const { rowCount } = await consultar(`SELECT 1 FROM clinica WHERE id_clinica = $1`, [id]);
    return rowCount > 0;
}

export async function substituirEspecialidades(id, ids) {
    await transacao(async (cliente) => {
        await cliente.query(`DELETE FROM clinica_especialidade WHERE id_clinica = $1`, [id]);
        if (ids.length > 0) {
            await cliente.query(
                `INSERT INTO clinica_especialidade (id_clinica, id_especialidade)
                 SELECT $1, UNNEST($2::bigint[])`,
                [id, ids]
            );
        }
    });
}

export async function buscarComBloqueantes(id) {
    const { rows } = await consultar(
        `SELECT c.id_clinica, c.ativo,
                (SELECT COUNT(*) FROM agendamento a
                   JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
                  WHERE pc.id_clinica = c.id_clinica
                    AND a.status IN ('AGENDADO', 'CONFIRMADO')
                    AND a.data_hora > NOW()) AS bloqueantes
           FROM clinica c
          WHERE c.id_clinica = $1`,
        [id]
    );
    return rows[0] ?? null;
}

export async function desativar(id) {
    await consultar(`UPDATE clinica SET ativo = FALSE WHERE id_clinica = $1`, [id]);
}

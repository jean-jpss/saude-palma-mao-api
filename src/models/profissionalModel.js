// =====================================================================
// MODEL: profissional
// =====================================================================
import { consultar, transacao } from '../banco.js';
import { inserir as inserirUsuario, atualizarDados as atualizarUsuario, desativar as desativarUsuario } from './usuarioModel.js';

// As especialidades e clinicas vem como JSON agregado para evitar uma
// consulta extra por profissional na listagem.
const SELECT_PROFISSIONAL = `
    SELECT pr.id_profissional, pr.id_usuario, pr.cpf, pr.conselho,
           pr.registro_profissional, pr.uf_registro, pr.ativo,
           u.nome, u.email, u.telefone,
           COALESCE((
               SELECT JSON_AGG(JSON_BUILD_OBJECT('id', e.id_especialidade, 'nome', e.nome) ORDER BY e.nome)
                 FROM profissional_especialidade pe
                 JOIN especialidade e ON e.id_especialidade = pe.id_especialidade
                WHERE pe.id_profissional = pr.id_profissional
           ), '[]'::json) AS especialidades,
           COALESCE((
               SELECT JSON_AGG(JSON_BUILD_OBJECT(
                          'id_pc', pc.id_profissional_clinica,
                          'id_clinica', c.id_clinica,
                          'nome', c.nome,
                          'ativo', pc.ativo) ORDER BY c.nome)
                 FROM profissional_clinica pc
                 JOIN clinica c ON c.id_clinica = pc.id_clinica
                WHERE pc.id_profissional = pr.id_profissional
           ), '[]'::json) AS clinicas
      FROM profissional pr
      JOIN usuario u ON u.id_usuario = pr.id_usuario
`;

export async function listar({ incluirInativos, busca }) {
    const { rows } = await consultar(
        `${SELECT_PROFISSIONAL}
          WHERE ($1::boolean IS TRUE OR pr.ativo = TRUE)
            AND ($2::text = '' OR u.nome ILIKE '%' || $2 || '%' OR pr.registro_profissional ILIKE '%' || $2 || '%')
          ORDER BY u.nome`,
        [incluirInativos, busca]
    );
    return rows;
}

export async function buscarPorId(id) {
    const { rows } = await consultar(`${SELECT_PROFISSIONAL} WHERE pr.id_profissional = $1`, [id]);
    return rows[0] ?? null;
}

export async function existe(id) {
    const { rowCount } = await consultar(`SELECT 1 FROM profissional WHERE id_profissional = $1`, [id]);
    return rowCount > 0;
}

// Uma operacao, tres tabelas: usuario, profissional e os dois tipos de
// vinculo. Transacao obrigatoria.
export async function criarCompleto(dados, idsEspecialidades, idsClinicas) {
    return transacao(async (cliente) => {
        const usuario = await inserirUsuario(cliente, {
            nome: dados.nome,
            email: dados.email,
            senhaHash: dados.senhaHash,
            telefone: dados.telefone,
            tipoUsuario: 'PROFISSIONAL'
        });

        const { rows } = await cliente.query(
            `INSERT INTO profissional (id_usuario, cpf, conselho, registro_profissional, uf_registro)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id_profissional`,
            [usuario.id_usuario, dados.cpf, dados.conselho, dados.registroProfissional, dados.ufRegistro]
        );

        const idProfissional = rows[0].id_profissional;

        if (idsEspecialidades?.length) {
            await cliente.query(
                `INSERT INTO profissional_especialidade (id_profissional, id_especialidade)
                 SELECT $1, UNNEST($2::bigint[])`,
                [idProfissional, idsEspecialidades]
            );
        }

        if (idsClinicas?.length) {
            await cliente.query(
                `INSERT INTO profissional_clinica (id_profissional, id_clinica)
                 SELECT $1, UNNEST($2::bigint[])`,
                [idProfissional, idsClinicas]
            );
        }

        return idProfissional;
    });
}

// Nome, e-mail e telefone moram em usuario; conselho e registro moram
// em profissional. A tela e uma so, a gravacao e em duas tabelas.
export async function atualizarCompleto(id, campos) {
    return transacao(async (cliente) => {
        const { rows } = await cliente.query(
            `UPDATE profissional
                SET conselho              = COALESCE($2, conselho),
                    registro_profissional = COALESCE($3, registro_profissional),
                    uf_registro           = COALESCE($4, uf_registro),
                    ativo                 = COALESCE($5, ativo)
              WHERE id_profissional = $1
              RETURNING id_usuario`,
            [id, campos.conselho, campos.registroProfissional, campos.ufRegistro, campos.ativo]
        );

        if (rows.length === 0) return false;

        if (campos.nome !== null || campos.email !== null || campos.telefone !== null || campos.ativo !== null) {
            await atualizarUsuario(cliente, rows[0].id_usuario, {
                nome: campos.nome,
                email: campos.email,
                telefone: campos.telefone,
                ativo: campos.ativo
            });
        }

        return true;
    });
}

// Conta agendamentos futuros em especialidades que SAIRIAM da lista.
export async function contarBloqueantesPorEspecialidade(id, idsQueFicam) {
    const { rows } = await consultar(
        `SELECT COUNT(*) AS bloqueantes
           FROM agendamento a
           JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
          WHERE pc.id_profissional = $1
            AND a.status IN ('AGENDADO', 'CONFIRMADO')
            AND a.data_hora > NOW()
            AND NOT (a.id_especialidade = ANY($2::bigint[]))`,
        [id, idsQueFicam]
    );
    return Number(rows[0].bloqueantes);
}

export async function substituirEspecialidades(id, ids) {
    await transacao(async (cliente) => {
        await cliente.query(`DELETE FROM profissional_especialidade WHERE id_profissional = $1`, [id]);
        if (ids.length > 0) {
            await cliente.query(
                `INSERT INTO profissional_especialidade (id_profissional, id_especialidade)
                 SELECT $1, UNNEST($2::bigint[])`,
                [id, ids]
            );
        }
    });
}

export async function vincularClinica(id, idClinica) {
    await consultar(
        `INSERT INTO profissional_clinica (id_profissional, id_clinica) VALUES ($1, $2)`,
        [id, idClinica]
    );
}

export async function buscarVinculo(id, idClinica) {
    const { rows } = await consultar(
        `SELECT pc.id_profissional_clinica, pc.ativo,
                (SELECT COUNT(*) FROM agendamento a
                  WHERE a.id_profissional_clinica = pc.id_profissional_clinica
                    AND a.status IN ('AGENDADO', 'CONFIRMADO')
                    AND a.data_hora > NOW()) AS bloqueantes
           FROM profissional_clinica pc
          WHERE pc.id_profissional = $1 AND pc.id_clinica = $2`,
        [id, idClinica]
    );
    return rows[0] ?? null;
}

export async function desativarVinculo(idProfissionalClinica) {
    await consultar(
        `UPDATE profissional_clinica SET ativo = FALSE WHERE id_profissional_clinica = $1`,
        [idProfissionalClinica]
    );
}

export async function buscarComBloqueantes(id) {
    const { rows } = await consultar(
        `SELECT pr.id_profissional, pr.id_usuario, pr.ativo,
                (SELECT COUNT(*) FROM agendamento a
                   JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
                  WHERE pc.id_profissional = pr.id_profissional
                    AND a.status IN ('AGENDADO', 'CONFIRMADO')
                    AND a.data_hora > NOW()) AS bloqueantes
           FROM profissional pr
          WHERE pr.id_profissional = $1`,
        [id]
    );
    return rows[0] ?? null;
}

// Desativar o profissional desativa tambem o usuario. Sem isso a
// pessoa continuaria conseguindo fazer login mesmo sem atender.
export async function desativarComUsuario(id, idUsuario) {
    await transacao(async (cliente) => {
        await cliente.query(`UPDATE profissional SET ativo = FALSE WHERE id_profissional = $1`, [id]);
        await desativarUsuario(cliente, idUsuario);
    });
}

// Busca do paciente: o recorte aqui e o VINCULO, nao a pessoa.
export async function listarVinculosParaBusca(idEspecialidade, idClinica, nomeNormalizado = null) {
    const { rows } = await consultar(
        `SELECT pc.id_profissional_clinica,
                pr.id_profissional,
                u.nome AS nome_profissional,
                pr.conselho, pr.registro_profissional, pr.uf_registro,
                c.id_clinica, c.nome AS nome_clinica,
                c.logradouro, c.numero, c.bairro, c.cidade, c.uf,
                ARRAY_AGG(DISTINCT e.nome ORDER BY e.nome) AS especialidades
           FROM profissional_clinica pc
           JOIN profissional pr ON pr.id_profissional = pc.id_profissional
           JOIN usuario u       ON u.id_usuario       = pr.id_usuario
           JOIN clinica c       ON c.id_clinica       = pc.id_clinica
           JOIN profissional_especialidade pe ON pe.id_profissional = pr.id_profissional
           JOIN especialidade e ON e.id_especialidade = pe.id_especialidade AND e.ativo = TRUE
          WHERE pc.ativo = TRUE AND pr.ativo = TRUE AND c.ativo = TRUE AND u.ativo = TRUE
            AND ($1::bigint IS NULL OR pe.id_especialidade = $1)
            AND ($2::bigint IS NULL OR c.id_clinica = $2)
            AND ($3::text IS NULL OR TRANSLATE(LOWER(u.nome),
                    'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
                 LIKE '%' || $3 || '%' ESCAPE '\\')
          GROUP BY pc.id_profissional_clinica, pr.id_profissional, u.nome,
                   pr.conselho, pr.registro_profissional, pr.uf_registro,
                   c.id_clinica, c.nome, c.logradouro, c.numero, c.bairro, c.cidade, c.uf
          ORDER BY u.nome, c.nome`,
        [idEspecialidade, idClinica, nomeNormalizado]
    );
    return rows;
}

// =====================================================================
// MODEL: usuario
//
// A camada de model e a unica que conhece SQL. Ela nao sabe o que e
// uma requisicao HTTP, nao valida entrada e nao decide codigo de
// status. Recebe valores, consulta o banco, devolve linhas.
//
// A vantagem pratica: se o banco mudar, so esta camada muda. E se a
// mesma consulta for necessaria em dois lugares, ela existe uma vez.
// =====================================================================
import { consultar } from '../banco.js';

export async function buscarParaLogin(pareceCpf, digitos, email) {
    const { rows } = await consultar(
        `SELECT u.id_usuario, u.nome, u.email, u.senha_hash, u.tipo_usuario, u.ativo,
                p.id_paciente, pr.id_profissional
           FROM usuario u
           LEFT JOIN paciente p      ON p.id_usuario  = u.id_usuario
           LEFT JOIN profissional pr ON pr.id_usuario = u.id_usuario
          WHERE ($1::boolean IS TRUE AND p.cpf = $2)
             OR ($1::boolean IS FALSE AND u.email = $3)
          LIMIT 1`,
        [pareceCpf, digitos, email]
    );
    return rows[0] ?? null;
}

export async function buscarPerfilCompleto(idUsuario) {
    const { rows } = await consultar(
        `SELECT u.id_usuario, u.nome, u.email, u.telefone, u.tipo_usuario,
                p.id_paciente, p.cpf,
                TO_CHAR(p.data_nascimento, 'YYYY-MM-DD') AS data_nascimento
           FROM usuario u
           LEFT JOIN paciente p ON p.id_usuario = u.id_usuario
          WHERE u.id_usuario = $1 AND u.ativo = TRUE`,
        [idUsuario]
    );
    return rows[0] ?? null;
}

// Recebe o cliente da transacao, e nao usa "consultar", porque este
// INSERT faz parte de uma operacao maior conduzida por outro model.
export async function inserir(cliente, { nome, email, senhaHash, telefone, tipoUsuario }) {
    const { rows } = await cliente.query(
        `INSERT INTO usuario (nome, email, senha_hash, telefone, tipo_usuario)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id_usuario, nome, email, telefone, tipo_usuario`,
        [nome, email, senhaHash, telefone, tipoUsuario]
    );
    return rows[0];
}

export async function atualizarDados(cliente, idUsuario, { nome, email, telefone, ativo }) {
    await cliente.query(
        `UPDATE usuario
            SET nome     = COALESCE($2, nome),
                email    = COALESCE($3, email),
                telefone = COALESCE($4, telefone),
                ativo    = COALESCE($5, ativo)
          WHERE id_usuario = $1`,
        [idUsuario, nome, email, telefone, ativo]
    );
}

export async function desativar(cliente, idUsuario) {
    await cliente.query(`UPDATE usuario SET ativo = FALSE WHERE id_usuario = $1`, [idUsuario]);
}

// =====================================================================
// MODEL: paciente
// =====================================================================
import { consultar, transacao } from '../banco.js';
import { inserir as inserirUsuario } from './usuarioModel.js';

// O cadastro grava em duas tabelas. Se a segunda falhar, a primeira
// precisa ser desfeita, senao sobra um usuario orfao que ocupa o
// e-mail e nunca consegue fazer login.
export async function criarComUsuario({ nome, email, senhaHash, telefone, cpf, dataNascimento }) {
    return transacao(async (cliente) => {
        const usuario = await inserirUsuario(cliente, {
            nome, email, senhaHash, telefone, tipoUsuario: 'PACIENTE'
        });

        const { rows } = await cliente.query(
            `INSERT INTO paciente (id_usuario, cpf, data_nascimento)
             VALUES ($1, $2, $3)
             RETURNING id_paciente`,
            [usuario.id_usuario, cpf, dataNascimento]
        );

        return { usuario, idPaciente: rows[0].id_paciente };
    });
}

const COLUNAS_PERFIL = `
    u.id_usuario, u.nome, u.email, u.telefone, u.ativo,
    p.id_paciente, p.cpf, p.sexo, p.observacoes,
    TO_CHAR(p.data_nascimento, 'YYYY-MM-DD') AS data_nascimento`;

export async function buscarPorId(idPaciente) {
    const { rows } = await consultar(
        `SELECT ${COLUNAS_PERFIL}
           FROM paciente p
           JOIN usuario u ON u.id_usuario = p.id_usuario
          WHERE p.id_paciente = $1 AND u.ativo = TRUE`,
        [idPaciente]
    );
    return rows[0] ?? null;
}

// Atualizacao parcial. Cada campo tem um indicador "informado": assim
// um campo ausente fica como esta, e um campo opcional enviado como
// null ou vazio e apagado. COALESCE sozinho nao distingue os dois casos.
// O CPF nao entra aqui: e a identidade do paciente e nao muda.
export async function atualizarDados(idPaciente, campos) {
    const tem = (nome) => Object.hasOwn(campos, nome);

    return transacao(async (cliente) => {
        const { rows } = await cliente.query(
            `SELECT id_usuario FROM paciente WHERE id_paciente = $1 FOR UPDATE`,
            [idPaciente]
        );
        if (rows.length === 0) return null;
        const idUsuario = rows[0].id_usuario;

        await cliente.query(
            `UPDATE usuario
                SET nome     = COALESCE($2, nome),
                    email    = COALESCE($3, email),
                    telefone = CASE WHEN $4::boolean THEN $5 ELSE telefone END
              WHERE id_usuario = $1`,
            [idUsuario, campos.nome ?? null, campos.email ?? null,
             tem('telefone'), campos.telefone ?? null]
        );

        await cliente.query(
            `UPDATE paciente
                SET data_nascimento = COALESCE($2, data_nascimento),
                    sexo            = CASE WHEN $3::boolean THEN $4 ELSE sexo END,
                    observacoes     = CASE WHEN $5::boolean THEN $6 ELSE observacoes END
              WHERE id_paciente = $1`,
            [idPaciente, campos.dataNascimento ?? null,
             tem('sexo'), campos.sexo ?? null,
             tem('observacoes'), campos.observacoes ?? null]
        );

        return true;
    });
}

// Consulta administrativa. Filtros opcionais por CPF (igual) e nome
// (contem, sem diferenciar maiusculas nem acentos). Limite fixo para
// a resposta nao crescer sem controle.
export async function listar({ cpf, nomeNormalizado }) {
    const { rows } = await consultar(
        `SELECT ${COLUNAS_PERFIL}
           FROM paciente p
           JOIN usuario u ON u.id_usuario = p.id_usuario
          WHERE ($1::text IS NULL OR p.cpf = $1)
            AND ($2::text IS NULL OR TRANSLATE(LOWER(u.nome),
                    'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
                 LIKE '%' || $2 || '%' ESCAPE '\\')
          ORDER BY u.nome
          LIMIT 50`,
        [cpf ?? null, nomeNormalizado ?? null]
    );
    return rows;
}

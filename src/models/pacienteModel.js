// =====================================================================
// MODEL: paciente
// =====================================================================
import { transacao } from '../banco.js';
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

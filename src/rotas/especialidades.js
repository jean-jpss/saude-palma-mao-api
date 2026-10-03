import { Router } from 'express';
import { consultar } from '../banco.js';
import { autenticar } from '../middlewares/autenticacao.js';

const rotas = Router();

// =====================================================================
// GET /especialidades
// Lista as especialidades ativas. E a primeira tela do fluxo de
// agendamento, entao a descricao vai junto para o paciente entender
// o que cada especialidade cuida.
// =====================================================================
rotas.get('/', autenticar, async (_requisicao, resposta, proximo) => {
    try {
        const { rows } = await consultar(
            `SELECT id_especialidade, nome, descricao
               FROM especialidade
              WHERE ativo = TRUE
              ORDER BY nome`
        );

        return resposta.json(
            rows.map((e) => ({
                idEspecialidade: Number(e.id_especialidade),
                nome: e.nome,
                descricao: e.descricao
            }))
        );
    } catch (erro) {
        return proximo(erro);
    }
});

export default rotas;

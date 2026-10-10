// =====================================================================
// CONTROLLER: busca de profissionais pelo paciente
//
// Diferente do controller de profissional, que e administrativo: aqui
// o recorte e o VINCULO entre profissional e clinica, porque e o
// vinculo que possui agenda. O mesmo medico em duas clinicas aparece
// duas vezes, com idProfissionalClinica distintos.
// =====================================================================
import * as model from '../models/profissionalModel.js';
import { apresentarVinculoBusca } from '../apresentadores.js';
import { inteiroOpcional, normalizarParaBusca } from '../utilitarios.js';
import { textoValido } from '../validacao.js';
import { erroDadosInvalidos } from '../erros.js';

export async function listar(requisicao, resposta, proximo) {
    try {
        const idEspecialidade = inteiroOpcional(requisicao.query.idEspecialidade, 'idEspecialidade');
        const idClinica = inteiroOpcional(requisicao.query.idClinica, 'idClinica');

        let nomeNormalizado = null;
        const { nome } = requisicao.query;
        if (nome !== undefined && nome !== '') {
            if (!textoValido(nome, 2, 160)) {
                throw erroDadosInvalidos('O nome da busca precisa ter pelo menos 2 letras.');
            }
            nomeNormalizado = normalizarParaBusca(nome);
        }

        const linhas = await model.listarVinculosParaBusca(idEspecialidade, idClinica, nomeNormalizado);
        return resposta.json(linhas.map(apresentarVinculoBusca));
    } catch (erro) {
        return proximo(erro);
    }
}

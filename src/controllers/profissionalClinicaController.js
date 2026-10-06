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
import { inteiroOpcional } from '../utilitarios.js';

export async function listar(requisicao, resposta, proximo) {
    try {
        const idEspecialidade = inteiroOpcional(requisicao.query.idEspecialidade, 'idEspecialidade');
        const idClinica = inteiroOpcional(requisicao.query.idClinica, 'idClinica');

        const linhas = await model.listarVinculosParaBusca(idEspecialidade, idClinica);
        return resposta.json(linhas.map(apresentarVinculoBusca));
    } catch (erro) {
        return proximo(erro);
    }
}

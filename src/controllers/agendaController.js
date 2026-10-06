// =====================================================================
// CONTROLLER: agenda do profissional
// =====================================================================
import * as model from '../models/agendamentoModel.js';
import { erroDadosInvalidos } from '../erros.js';
import { apresentarAgendaItem } from '../apresentadores.js';
import { idValido, dataValida } from '../utilitarios.js';

const STATUS_VALIDOS = ['AGENDADO', 'CONFIRMADO', 'CANCELADO', 'REALIZADO'];

export async function listar(requisicao, resposta, proximo) {
    try {
        const { data, status, idProfissionalClinica } = requisicao.query;
        const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';

        if (data !== undefined && !dataValida(data)) {
            throw erroDadosInvalidos('Informe a data no formato AAAA-MM-DD.');
        }
        if (status !== undefined && !STATUS_VALIDOS.includes(status)) {
            throw erroDadosInvalidos(`O status precisa ser um destes: ${STATUS_VALIDOS.join(', ')}.`);
        }

        let filtroPc = null;
        if (idProfissionalClinica !== undefined && idProfissionalClinica !== '') {
            const numero = idValido(idProfissionalClinica);
            if (!numero) throw erroDadosInvalidos('O idProfissionalClinica precisa ser um numero inteiro.');
            // Um profissional nao filtra por outro: o recorte dele ja e
            // fixo pelo proprio id.
            if (ehAdministrador) filtroPc = numero;
        }

        const linhas = await model.listarAgenda({
            ehAdministrador,
            idProfissional: requisicao.usuario.idProfissional,
            filtroPc,
            data: data ?? null,
            status: status ?? null
        });

        return resposta.json(linhas.map(apresentarAgendaItem));
    } catch (erro) {
        return proximo(erro);
    }
}

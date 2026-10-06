// =====================================================================
// CONTROLLER: disponibilidade
// =====================================================================
import * as model from '../models/disponibilidadeModel.js';
import { ErroApi, erroDadosInvalidos } from '../erros.js';
import { apresentarJanela } from '../apresentadores.js';
import { idValido, dataValida, horaNormalizada, minutosDesdeMeiaNoite, frasePlural } from '../utilitarios.js';

// Regras numericas das secoes 1 e 2 do documento de regras v3.
// Nomeadas aqui, em um lugar so: se o grupo mudar a antecedencia,
// muda aqui.
const DIAS_PARA_FRENTE = 60;
const HORAS_ANTECEDENCIA_MARCAR = 24;

export async function listarHorarios(requisicao, resposta, proximo) {
    try {
        const idProfissionalClinica = idValido(requisicao.query.idProfissionalClinica);
        const data = requisicao.query.data;

        if (!idProfissionalClinica) throw erroDadosInvalidos('Informe o idProfissionalClinica.');
        if (!dataValida(data)) throw erroDadosInvalidos('Informe a data no formato AAAA-MM-DD.');

        const linhas = await model.listarHorariosLivres(
            idProfissionalClinica, data, HORAS_ANTECEDENCIA_MARCAR, DIAS_PARA_FRENTE
        );

        return resposta.json({
            idProfissionalClinica,
            data,
            horarios: linhas.map((r) => ({
                idDisponibilidade: Number(r.id_disponibilidade),
                dataHora: r.data_hora
            }))
        });
    } catch (erro) {
        return proximo(erro);
    }
}

// Visao de quem administra a agenda, nao de quem marca consulta. O
// profissional precisa ver o que ja cadastrou e obter os ids para
// desativar.
export async function listarJanelas(requisicao, resposta, proximo) {
    try {
        const { de, ate, idProfissionalClinica } = requisicao.query;
        const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';

        if (de !== undefined && !dataValida(de)) {
            throw erroDadosInvalidos('Informe "de" no formato AAAA-MM-DD.');
        }
        if (ate !== undefined && !dataValida(ate)) {
            throw erroDadosInvalidos('Informe "ate" no formato AAAA-MM-DD.');
        }

        let filtroPc = null;
        if (idProfissionalClinica !== undefined && idProfissionalClinica !== '' && ehAdministrador) {
            filtroPc = idValido(idProfissionalClinica);
            if (!filtroPc) throw erroDadosInvalidos('O idProfissionalClinica precisa ser um numero inteiro.');
        }

        const linhas = await model.listarJanelas({
            ehAdministrador,
            idProfissional: requisicao.usuario.idProfissional,
            filtroPc,
            de: de ?? null,
            ate: ate ?? null
        });

        return resposta.json(linhas.map(apresentarJanela));
    } catch (erro) {
        return proximo(erro);
    }
}

export async function criar(requisicao, resposta, proximo) {
    try {
        const corpo = requisicao.body ?? {};
        const idPc = idValido(corpo.idProfissionalClinica);
        const data = corpo.dataAtendimento;
        const inicio = horaNormalizada(corpo.horaInicio);
        const fim = horaNormalizada(corpo.horaFim);
        const duracao = corpo.duracaoMinutos === undefined ? 30 : Number(corpo.duracaoMinutos);

        if (!idPc) throw erroDadosInvalidos('Informe o idProfissionalClinica.');
        if (!dataValida(data)) throw erroDadosInvalidos('Informe a dataAtendimento no formato AAAA-MM-DD.');
        if (!inicio) throw erroDadosInvalidos('Informe a horaInicio no formato HH:MM.');
        if (!fim) throw erroDadosInvalidos('Informe a horaFim no formato HH:MM.');
        if (!Number.isInteger(duracao) || duracao < 5 || duracao > 240) {
            throw erroDadosInvalidos('A duracaoMinutos precisa ser um numero inteiro entre 5 e 240.');
        }
        if (minutosDesdeMeiaNoite(fim) <= minutosDesdeMeiaNoite(inicio)) {
            throw erroDadosInvalidos('A horaFim precisa ser maior que a horaInicio.');
        }
        if (minutosDesdeMeiaNoite(fim) - minutosDesdeMeiaNoite(inicio) < duracao) {
            throw erroDadosInvalidos('A janela e menor que a duracao de uma consulta. Nenhum horario seria gerado.');
        }

        const v = await model.verificarContextoCadastro(idPc, data, inicio, fim);

        if (v.vinculo_inativo) {
            throw new ErroApi(400, 'PROFISSIONAL_CLINICA_INATIVO',
                'Este vinculo de profissional com clinica nao esta ativo.');
        }
        if (requisicao.usuario.tipoUsuario === 'PROFISSIONAL'
            && Number(v.dono) !== requisicao.usuario.idProfissional) {
            throw new ErroApi(403, 'SEM_PERMISSAO',
                'Voce so pode cadastrar disponibilidade na sua propria agenda.');
        }
        if (v.data_no_passado) {
            throw new ErroApi(400, 'DATA_NO_PASSADO',
                'Nao e possivel cadastrar atendimento em uma data que ja passou.');
        }
        if (v.sobrepoe) {
            throw new ErroApi(409, 'JANELA_SOBREPOSTA',
                'Ja existe uma janela de atendimento que cruza com este horario nesta data.');
        }

        const d = await model.inserir(idPc, data, inicio, fim, duracao);
        const totalSlots = Math.floor(
            (minutosDesdeMeiaNoite(fim) - minutosDesdeMeiaNoite(inicio)) / duracao
        );

        return resposta.status(201).json({
            idDisponibilidade: Number(d.id_disponibilidade),
            idProfissionalClinica: idPc,
            dataAtendimento: d.data_atendimento,
            horaInicio: d.hora_inicio,
            horaFim: d.hora_fim,
            duracaoMinutos: d.duracao_minutos,
            ativo: d.ativo,
            // Confirma ao profissional quantos horarios a janela gera.
            horariosGerados: totalSlots
        });
    } catch (erro) {
        if (erro.code === '23505' && erro.constraint === 'uq_disponibilidade_janela') {
            return proximo(new ErroApi(409, 'JANELA_SOBREPOSTA',
                'Ja existe uma janela de atendimento que comeca neste horario nesta data.'));
        }
        return proximo(erro);
    }
}

// Regra 1.3 do documento de regras: a desativacao e bloqueada enquanto
// existirem agendamentos ativos e futuros dentro da janela.
//
// O erro informa QUANTOS agendamentos impedem, sem lista-los. O
// profissional consulta quais sao pela rota GET /agenda. Decisao do
// grupo para manter o formato de erro estavel em toda a API.
export async function desativar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const janela = await model.buscarComBloqueantes(id);
        const naoEncontrada = new ErroApi(404, 'DISPONIBILIDADE_NAO_ENCONTRADA',
            'Janela de atendimento nao encontrada.');

        if (!janela) throw naoEncontrada;

        // Janela de outro profissional devolve 404, nao 403: dizer
        // "existe, mas nao e sua" ja entrega informacao alheia.
        if (requisicao.usuario.tipoUsuario === 'PROFISSIONAL'
            && Number(janela.id_profissional) !== requisicao.usuario.idProfissional) {
            throw naoEncontrada;
        }
        if (!janela.ativo) {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA',
                'Esta janela de atendimento ja esta desativada.');
        }

        const bloqueantes = Number(janela.bloqueantes);
        if (bloqueantes > 0) {
            throw new ErroApi(409, 'DISPONIBILIDADE_COM_AGENDAMENTOS',
                `${frasePlural(bloqueantes)} nesta janela. `
                + 'Cancele essas consultas antes de desativar. Para ver quais sao, consulte a sua agenda.');
        }

        await model.desativar(id);
        return resposta.status(204).send();
    } catch (erro) {
        return proximo(erro);
    }
}

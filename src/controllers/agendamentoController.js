// =====================================================================
// CONTROLLER: agendamento
// =====================================================================
import * as model from '../models/agendamentoModel.js';
import { ErroApi, erroDadosInvalidos } from '../erros.js';
import { apresentarAgendamento } from '../apresentadores.js';
import { idValido } from '../utilitarios.js';

// Regras das secoes 2 e 3 do documento de regras v3.
const HORAS_ANTECEDENCIA_MARCAR = 24;
const HORAS_ANTECEDENCIA_CANCELAR = 8;
const LIMITE_AGENDAMENTOS_FUTUROS = 5;

async function responderDetalhe(id, resposta, status = 200) {
    const linha = await model.buscarPorId(id);
    return resposta.status(status).json(apresentarAgendamento(linha));
}

// A ordem das validacoes e a da secao 2.1 do documento. A ordem
// importa porque o paciente recebe apenas o primeiro erro, e a
// mensagem precisa ser a mais util possivel.
export async function criar(requisicao, resposta, proximo) {
    try {
        const { idProfissionalClinica, idEspecialidade, dataHora, observacao } = requisicao.body ?? {};
        const idPaciente = requisicao.usuario.idPaciente;

        const idPc = idValido(idProfissionalClinica);
        const idEsp = idValido(idEspecialidade);

        if (!idPc) throw erroDadosInvalidos('Informe o idProfissionalClinica.');
        if (!idEsp) throw erroDadosInvalidos('Informe o idEspecialidade.');
        if (typeof dataHora !== 'string' || Number.isNaN(Date.parse(dataHora))) {
            throw erroDadosInvalidos('Informe a dataHora no formato ISO 8601, por exemplo 2026-10-20T08:00:00-03:00.');
        }
        if (observacao !== undefined && observacao !== null && typeof observacao !== 'string') {
            throw erroDadosInvalidos('A observacao precisa ser um texto.');
        }

        const v = await model.verificarRegrasCriacao(
            idPc, dataHora, idEsp, HORAS_ANTECEDENCIA_MARCAR, idPaciente
        );

        // Redundante com a antecedencia de 24 horas, ja que todo
        // horario passado tambem a viola. Mantido de proposito, porque
        // a mensagem para o usuario e diferente.
        if (v.no_passado) {
            throw new ErroApi(400, 'HORARIO_NO_PASSADO', 'Esse horario ja passou. Escolha uma data futura.');
        }
        if (v.sem_antecedencia) {
            throw new ErroApi(400, 'ANTECEDENCIA_INSUFICIENTE',
                `As consultas precisam ser marcadas com pelo menos ${HORAS_ANTECEDENCIA_MARCAR} horas de antecedencia.`);
        }
        if (v.vinculo_inativo) {
            throw new ErroApi(400, 'PROFISSIONAL_CLINICA_INATIVO',
                'Este profissional ou clinica nao esta disponivel no momento.');
        }
        if (v.especialidade_nao_atendida) {
            throw new ErroApi(400, 'ESPECIALIDADE_NAO_ATENDIDA',
                'Este profissional nao atende a especialidade escolhida.');
        }
        if (v.horario_invalido) {
            throw new ErroApi(400, 'HORARIO_INVALIDO',
                'Este horario nao esta na agenda do profissional. Escolha um dos horarios oferecidos.');
        }
        if (Number(v.futuros_ativos) >= LIMITE_AGENDAMENTOS_FUTUROS) {
            throw new ErroApi(409, 'LIMITE_AGENDAMENTOS_EXCEDIDO',
                `Voce ja tem ${LIMITE_AGENDAMENTOS_FUTUROS} consultas marcadas. Cancele uma antes de marcar outra.`);
        }

        // As validacoes acima melhoram a mensagem, mas nao protegem
        // contra requisicoes simultaneas. A garantia real sao os dois
        // indices unicos parciais do banco. Secao 7.2 do documento.
        const idCriado = await model.inserir(idPaciente, idPc, idEsp, dataHora, observacao ?? null);
        return responderDetalhe(idCriado, resposta, 201);
    } catch (erro) {
        if (erro.code === '23505') {
            if (erro.constraint === 'uq_agendamento_slot') {
                return proximo(new ErroApi(409, 'HORARIO_INDISPONIVEL',
                    'Alguem marcou esse horario agora ha pouco. Escolha outro, por favor.'));
            }
            if (erro.constraint === 'uq_agendamento_paciente_horario') {
                return proximo(new ErroApi(409, 'PACIENTE_JA_AGENDADO',
                    'Voce ja tem outra consulta marcada nesse mesmo horario.'));
            }
        }
        return proximo(erro);
    }
}

// O filtro vem do token, nunca de parametro, senao qualquer paciente
// poderia ler a agenda de outro.
export async function listarDoPaciente(requisicao, resposta, proximo) {
    try {
        const linhas = await model.listarPorPaciente(requisicao.usuario.idPaciente);
        return resposta.json(linhas.map(apresentarAgendamento));
    } catch (erro) {
        return proximo(erro);
    }
}

// Id de outro paciente devolve 404, nao 403: informar que o registro
// existe mas pertence a outra pessoa ja e vazamento de informacao.
export async function detalhar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';
        const linha = await model.buscarPorIdComPermissao(id, ehAdministrador, requisicao.usuario.idPaciente);

        if (!linha) throw new ErroApi(404, 'AGENDAMENTO_NAO_ENCONTRADO', 'Consulta nao encontrada.');

        return resposta.json(apresentarAgendamento(linha));
    } catch (erro) {
        return proximo(erro);
    }
}

// Carrega o agendamento e verifica se o usuario atual pode altera-lo.
async function carregarComPermissao(requisicao, id) {
    const { tipoUsuario, idPaciente, idProfissional } = requisicao.usuario;
    const agendamento = await model.carregarParaAlteracao(id, HORAS_ANTECEDENCIA_CANCELAR);

    const naoEncontrado = new ErroApi(404, 'AGENDAMENTO_NAO_ENCONTRADO', 'Consulta nao encontrada.');
    if (!agendamento) throw naoEncontrado;

    if (tipoUsuario === 'PACIENTE' && Number(agendamento.id_paciente) !== idPaciente) throw naoEncontrado;
    if (tipoUsuario === 'PROFISSIONAL' && Number(agendamento.id_profissional) !== idProfissional) throw naoEncontrado;

    return agendamento;
}

// Secao 3 do documento: o paciente cancela com 8 horas de
// antecedencia; o administrador cancela a qualquer momento, porque
// precisa lidar com ausencia do profissional e imprevistos da clinica.
export async function cancelar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const agendamento = await carregarComPermissao(requisicao, id);
        const { motivo } = requisicao.body ?? {};

        if (!['AGENDADO', 'CONFIRMADO'].includes(agendamento.status)) {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA',
                `Esta consulta ja esta ${agendamento.status.toLowerCase()} e nao pode ser cancelada.`);
        }
        if (agendamento.ja_passou) {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA',
                'Esta consulta ja aconteceu e nao pode ser cancelada.');
        }
        if (requisicao.usuario.tipoUsuario === 'PACIENTE' && agendamento.dentro_do_prazo_curto) {
            throw new ErroApi(400, 'CANCELAMENTO_FORA_DO_PRAZO',
                `Faltam menos de ${HORAS_ANTECEDENCIA_CANCELAR} horas para a consulta. Ligue para a clinica para cancelar.`);
        }

        await model.cancelar(
            id,
            typeof motivo === 'string' && motivo.trim() ? motivo.trim().slice(0, 255) : null
        );

        return responderDetalhe(id, resposta);
    } catch (erro) {
        return proximo(erro);
    }
}

export async function confirmar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const agendamento = await carregarComPermissao(requisicao, id);

        if (agendamento.status !== 'AGENDADO') {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA',
                `So e possivel confirmar uma consulta com status AGENDADO. Esta esta ${agendamento.status}.`);
        }

        await model.alterarStatus(id, 'CONFIRMADO');
        return responderDetalhe(id, resposta);
    } catch (erro) {
        return proximo(erro);
    }
}

// A confirmacao previa nao e obrigatoria: um atendimento que aconteceu
// sem passar por CONFIRMADO pode ser fechado direto a partir de
// AGENDADO. Secao 4 do documento.
export async function marcarRealizada(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const agendamento = await carregarComPermissao(requisicao, id);

        if (!['AGENDADO', 'CONFIRMADO'].includes(agendamento.status)) {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA',
                `Nao e possivel marcar como realizada uma consulta ${agendamento.status.toLowerCase()}.`);
        }

        await model.alterarStatus(id, 'REALIZADO');
        return responderDetalhe(id, resposta);
    } catch (erro) {
        return proximo(erro);
    }
}

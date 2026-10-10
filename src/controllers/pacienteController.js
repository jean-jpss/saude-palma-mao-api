// =====================================================================
// CONTROLLER: paciente
//
// "eu" significa o paciente do token. O id nunca vem da URL, entao um
// paciente nao tem como editar os dados de outro.
// =====================================================================
import * as model from '../models/pacienteModel.js';
import { ErroApi, erroDadosInvalidos, erroConflito } from '../erros.js';
import {
    somenteDigitos, textoValido, emailValido, dataNascimentoValida
} from '../validacao.js';
import { normalizarParaBusca } from '../utilitarios.js';

function apresentar(l) {
    return {
        idPaciente: Number(l.id_paciente),
        idUsuario: Number(l.id_usuario),
        nome: l.nome,
        email: l.email,
        telefone: l.telefone,
        cpf: l.cpf,
        dataNascimento: l.data_nascimento,
        sexo: l.sexo,
        observacoes: l.observacoes,
        ativo: l.ativo
    };
}

export async function meusDados(requisicao, resposta, proximo) {
    try {
        const linha = await model.buscarPorId(requisicao.usuario.idPaciente);
        if (!linha) {
            throw new ErroApi(404, 'PACIENTE_NAO_ENCONTRADO', 'Paciente nao encontrado.');
        }
        return resposta.json(apresentar(linha));
    } catch (erro) {
        return proximo(erro);
    }
}

export async function atualizarMeusDados(requisicao, resposta, proximo) {
    try {
        const corpo = requisicao.body ?? {};
        const permitidos = ['nome', 'email', 'telefone', 'dataNascimento', 'sexo', 'observacoes'];
        const enviados = Object.keys(corpo);

        if (enviados.includes('cpf')) {
            throw erroDadosInvalidos('O CPF nao pode ser alterado.');
        }
        if (enviados.length === 0 || enviados.some((c) => !permitidos.includes(c))) {
            throw erroDadosInvalidos(`Envie ao menos um destes campos: ${permitidos.join(', ')}.`);
        }

        const campos = {};

        if (Object.hasOwn(corpo, 'nome')) {
            if (!textoValido(corpo.nome, 3, 160)) {
                throw erroDadosInvalidos('Informe o nome completo, com pelo menos 3 letras.');
            }
            campos.nome = corpo.nome.trim();
        }
        if (Object.hasOwn(corpo, 'email')) {
            if (!emailValido(corpo.email)) {
                throw erroDadosInvalidos('Informe um e-mail valido, no formato nome@provedor.com.');
            }
            campos.email = corpo.email.trim().toLowerCase();
        }
        if (Object.hasOwn(corpo, 'dataNascimento')) {
            if (!dataNascimentoValida(corpo.dataNascimento)) {
                throw erroDadosInvalidos('Informe a data de nascimento no formato AAAA-MM-DD.');
            }
            campos.dataNascimento = corpo.dataNascimento;
        }
        // Campos opcionais: null ou texto vazio apaga o valor.
        if (Object.hasOwn(corpo, 'telefone')) {
            if (corpo.telefone === null || corpo.telefone === '') {
                campos.telefone = null;
            } else if (textoValido(corpo.telefone, 8, 20)) {
                campos.telefone = somenteDigitos(corpo.telefone);
            } else {
                throw erroDadosInvalidos('O telefone informado nao e valido.');
            }
        }
        if (Object.hasOwn(corpo, 'sexo')) {
            if (corpo.sexo === null || corpo.sexo === '') {
                campos.sexo = null;
            } else if (textoValido(corpo.sexo, 1, 20)) {
                campos.sexo = corpo.sexo.trim();
            } else {
                throw erroDadosInvalidos('O campo sexo aceita ate 20 caracteres.');
            }
        }
        if (Object.hasOwn(corpo, 'observacoes')) {
            if (corpo.observacoes === null || corpo.observacoes === '') {
                campos.observacoes = null;
            } else if (textoValido(corpo.observacoes, 1, 1000)) {
                campos.observacoes = corpo.observacoes.trim();
            } else {
                throw erroDadosInvalidos('As observacoes aceitam ate 1000 caracteres.');
            }
        }

        const idPaciente = requisicao.usuario.idPaciente;
        const achou = await model.atualizarDados(idPaciente, campos);
        if (!achou) {
            throw new ErroApi(404, 'PACIENTE_NAO_ENCONTRADO', 'Paciente nao encontrado.');
        }

        const atualizado = await model.buscarPorId(idPaciente);
        return resposta.json(apresentar(atualizado));
    } catch (erro) {
        if (erro.code === '23505' && erro.constraint === 'uq_usuario_email') {
            return proximo(erroConflito('EMAIL_JA_CADASTRADO', 'Este e-mail ja esta em uso por outra conta.'));
        }
        return proximo(erro);
    }
}

export async function listar(requisicao, resposta, proximo) {
    try {
        const { cpf, nome } = requisicao.query;

        let cpfDigitos = null;
        if (cpf !== undefined && cpf !== '') {
            cpfDigitos = somenteDigitos(cpf);
            if (cpfDigitos.length !== 11) {
                throw erroDadosInvalidos('O CPF da busca precisa ter 11 digitos.');
            }
        }

        let nomeNormalizado = null;
        if (nome !== undefined && nome !== '') {
            if (!textoValido(nome, 2, 160)) {
                throw erroDadosInvalidos('O nome da busca precisa ter pelo menos 2 letras.');
            }
            nomeNormalizado = normalizarParaBusca(nome);
        }

        const linhas = await model.listar({ cpf: cpfDigitos, nomeNormalizado });
        return resposta.json(linhas.map(apresentar));
    } catch (erro) {
        return proximo(erro);
    }
}

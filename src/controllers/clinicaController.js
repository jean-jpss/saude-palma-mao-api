// =====================================================================
// CONTROLLER: clinica
// =====================================================================
import * as model from '../models/clinicaModel.js';
import { ErroApi, erroDadosInvalidos } from '../erros.js';
import { textoValido, emailValido, somenteDigitos } from '../validacao.js';
import { cnpjValido } from '../validacaoCnpj.js';
import { apresentarClinica } from '../apresentadores.js';
import { idValido, inteiroOpcional, listaDeIds, frasePlural } from '../utilitarios.js';

// Valida e normaliza os campos compartilhados entre cadastro e edicao.
function validarCampos(corpo, obrigatorios) {
    const { nome, cnpj, telefone, email, logradouro, numero, bairro, cidade, uf, cep, horarioFuncionamento } = corpo;

    if ((obrigatorios || nome !== undefined) && !textoValido(nome, 3, 160)) {
        throw erroDadosInvalidos('Informe o nome da clinica, com 3 a 160 caracteres.');
    }
    if ((obrigatorios || cnpj !== undefined) && !cnpjValido(cnpj)) {
        throw erroDadosInvalidos('O CNPJ informado nao e valido. Confira os numeros.');
    }
    if (email !== undefined && email !== null && email !== '' && !emailValido(email)) {
        throw erroDadosInvalidos('O e-mail informado nao e valido.');
    }
    if (uf !== undefined && uf !== null && uf !== '' && !/^[A-Za-z]{2}$/.test(uf)) {
        throw erroDadosInvalidos('A UF precisa ter duas letras, por exemplo PE.');
    }
    if (cep !== undefined && cep !== null && cep !== '' && somenteDigitos(cep).length !== 8) {
        throw erroDadosInvalidos('O CEP precisa ter 8 numeros.');
    }
    if ((obrigatorios || logradouro !== undefined) && !textoValido(logradouro, 3, 160)) {
        throw erroDadosInvalidos('Informe o logradouro, com 3 a 160 caracteres.');
    }

    return {
        nome: nome !== undefined ? nome.trim() : undefined,
        cnpj: cnpj !== undefined ? somenteDigitos(cnpj) : undefined,
        telefone: telefone !== undefined ? (somenteDigitos(telefone) || null) : undefined,
        email: email !== undefined ? (email?.trim().toLowerCase() || null) : undefined,
        logradouro: logradouro !== undefined ? logradouro.trim() : undefined,
        numero: numero !== undefined ? (String(numero).trim() || null) : undefined,
        bairro: bairro !== undefined ? (bairro?.trim() || null) : undefined,
        cidade: cidade !== undefined ? (cidade?.trim() || null) : undefined,
        uf: uf !== undefined ? uf.toUpperCase() : undefined,
        cep: cep !== undefined ? (somenteDigitos(cep) || null) : undefined,
        horarioFuncionamento: horarioFuncionamento !== undefined
            ? (horarioFuncionamento?.trim() || null) : undefined
    };
}

async function responderDetalhe(id, resposta, status = 200) {
    const linha = await model.buscarPorId(id, true);
    return resposta.status(status).json(apresentarClinica(linha));
}

export async function listar(requisicao, resposta, proximo) {
    try {
        const idEspecialidade = inteiroOpcional(requisicao.query.idEspecialidade, 'idEspecialidade');
        const busca = typeof requisicao.query.busca === 'string' ? requisicao.query.busca.trim() : '';
        const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';
        const incluirInativas = ehAdministrador && requisicao.query.incluirInativas === 'true';

        if (busca.length > 120) throw erroDadosInvalidos('O texto de busca e muito longo.');

        const linhas = await model.listar({ idEspecialidade, busca, incluirInativas });
        return resposta.json(linhas.map(apresentarClinica));
    } catch (erro) {
        return proximo(erro);
    }
}

export async function detalhar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';
        const linha = await model.buscarPorId(id, ehAdministrador);

        if (!linha) throw new ErroApi(404, 'CLINICA_NAO_ENCONTRADA', 'Clinica nao encontrada.');

        return resposta.json(apresentarClinica(linha));
    } catch (erro) {
        return proximo(erro);
    }
}

export async function criar(requisicao, resposta, proximo) {
    try {
        const corpo = requisicao.body ?? {};
        const dados = validarCampos(corpo, true);
        const ids = listaDeIds(corpo.idsEspecialidades, 'idsEspecialidades');

        const idCriado = await model.criarComEspecialidades(dados, ids);
        return responderDetalhe(idCriado, resposta, 201);
    } catch (erro) {
        if (erro.code === '23505' && erro.constraint === 'uq_clinica_cnpj') {
            return proximo(new ErroApi(409, 'CNPJ_JA_CADASTRADO', 'Ja existe uma clinica com esse CNPJ.'));
        }
        if (erro.code === '23503') {
            return proximo(new ErroApi(400, 'ESPECIALIDADE_NAO_ENCONTRADA',
                'Uma das especialidades informadas nao existe.'));
        }
        return proximo(erro);
    }
}

export async function atualizar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const corpo = requisicao.body ?? {};
        if (Object.keys(corpo).length === 0) {
            throw erroDadosInvalidos('Informe ao menos um campo para alterar.');
        }

        const d = validarCampos(corpo, false);
        const ativo = corpo.ativo;

        if (ativo !== undefined && typeof ativo !== 'boolean') {
            throw erroDadosInvalidos('O campo ativo precisa ser true ou false.');
        }

        const alterada = await model.atualizar(id, d, ativo);
        if (!alterada) throw new ErroApi(404, 'CLINICA_NAO_ENCONTRADA', 'Clinica nao encontrada.');

        return responderDetalhe(id, resposta);
    } catch (erro) {
        if (erro.code === '23505' && erro.constraint === 'uq_clinica_cnpj') {
            return proximo(new ErroApi(409, 'CNPJ_JA_CADASTRADO', 'Ja existe uma clinica com esse CNPJ.'));
        }
        return proximo(erro);
    }
}

// PUT, e nao PATCH, porque o corpo representa o estado final desejado:
// o que nao estiver na lista e removido.
export async function substituirEspecialidades(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const ids = listaDeIds(requisicao.body?.idsEspecialidades, 'idsEspecialidades');
        if (ids === undefined) {
            throw erroDadosInvalidos('Informe idsEspecialidades como uma lista de numeros.');
        }

        if (!await model.existe(id)) {
            throw new ErroApi(404, 'CLINICA_NAO_ENCONTRADA', 'Clinica nao encontrada.');
        }

        await model.substituirEspecialidades(id, ids);
        return responderDetalhe(id, resposta);
    } catch (erro) {
        if (erro.code === '23503') {
            return proximo(new ErroApi(400, 'ESPECIALIDADE_NAO_ENCONTRADA',
                'Uma das especialidades informadas nao existe.'));
        }
        return proximo(erro);
    }
}

export async function desativar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const clinica = await model.buscarComBloqueantes(id);
        if (!clinica) throw new ErroApi(404, 'CLINICA_NAO_ENCONTRADA', 'Clinica nao encontrada.');
        if (!clinica.ativo) {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA', 'Esta clinica ja esta desativada.');
        }

        const bloqueantes = Number(clinica.bloqueantes);
        if (bloqueantes > 0) {
            throw new ErroApi(409, 'CLINICA_COM_AGENDAMENTOS',
                `${frasePlural(bloqueantes)} nesta clinica. Cancele antes de desativar.`);
        }

        await model.desativar(id);
        return resposta.status(204).send();
    } catch (erro) {
        return proximo(erro);
    }
}

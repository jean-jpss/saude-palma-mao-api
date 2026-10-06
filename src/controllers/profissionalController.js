// =====================================================================
// CONTROLLER: profissional, visao administrativa
// =====================================================================
import bcrypt from 'bcryptjs';

import * as model from '../models/profissionalModel.js';
import { ErroApi, erroDadosInvalidos } from '../erros.js';
import { textoValido, emailValido, cpfValido, senhaValida, somenteDigitos } from '../validacao.js';
import { apresentarProfissional } from '../apresentadores.js';
import { idValido, listaDeIds, frasePlural } from '../utilitarios.js';

const CUSTO_HASH = 10;

// Lista fechada de proposito: campo livre permitiria "crm", "C.R.M." e
// "Crm" como valores diferentes, quebrando a unicidade do registro.
const CONSELHOS = ['CRM', 'CRO', 'CRP', 'COREN', 'CREFITO', 'CRN', 'CRF', 'CREFONO'];

const UFS = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

async function responderDetalhe(id, resposta, status = 200) {
    const linha = await model.buscarPorId(id);
    return resposta.status(status).json(apresentarProfissional(linha));
}

export async function listar(requisicao, resposta, proximo) {
    try {
        const incluirInativos = requisicao.query.incluirInativos === 'true';
        const busca = typeof requisicao.query.busca === 'string' ? requisicao.query.busca.trim() : '';

        const linhas = await model.listar({ incluirInativos, busca });
        return resposta.json(linhas.map(apresentarProfissional));
    } catch (erro) {
        return proximo(erro);
    }
}

export async function detalhar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const linha = await model.buscarPorId(id);
        if (!linha) throw new ErroApi(404, 'PROFISSIONAL_NAO_ENCONTRADO', 'Profissional nao encontrado.');

        return resposta.json(apresentarProfissional(linha));
    } catch (erro) {
        return proximo(erro);
    }
}

// A senha inicial e definida pelo administrador e informada ao
// profissional por fora do sistema. Convite por e-mail exigiria
// servico de envio e ficou fora do escopo da 1a entrega.
export async function criar(requisicao, resposta, proximo) {
    try {
        const corpo = requisicao.body ?? {};
        const { nome, email, telefone, cpf, conselho, registroProfissional, ufRegistro, senha } = corpo;

        if (!textoValido(nome, 3, 160)) {
            throw erroDadosInvalidos('Informe o nome completo, com pelo menos 3 letras.');
        }
        if (!emailValido(email)) throw erroDadosInvalidos('Informe um e-mail valido.');
        if (!cpfValido(cpf)) throw erroDadosInvalidos('O CPF informado nao e valido. Confira os numeros.');
        if (typeof conselho !== 'string' || !CONSELHOS.includes(conselho.toUpperCase())) {
            throw erroDadosInvalidos(`O conselho precisa ser um destes: ${CONSELHOS.join(', ')}.`);
        }
        if (!textoValido(registroProfissional, 1, 30)) {
            throw erroDadosInvalidos('Informe o numero do registro profissional.');
        }
        if (typeof ufRegistro !== 'string' || !UFS.includes(ufRegistro.toUpperCase())) {
            throw erroDadosInvalidos('Informe a UF do registro com duas letras, por exemplo PE.');
        }
        if (!senhaValida(senha)) {
            throw erroDadosInvalidos('A senha inicial precisa ter pelo menos 8 caracteres.');
        }
        if (telefone !== undefined && telefone !== null && telefone !== '' && !textoValido(telefone, 8, 20)) {
            throw erroDadosInvalidos('O telefone informado nao e valido.');
        }

        const idsClinicas = listaDeIds(corpo.idsClinicas, 'idsClinicas');
        const idsEspecialidades = listaDeIds(corpo.idsEspecialidades, 'idsEspecialidades');

        const idCriado = await model.criarCompleto(
            {
                nome: nome.trim(),
                email: email.trim().toLowerCase(),
                senhaHash: await bcrypt.hash(senha, CUSTO_HASH),
                telefone: telefone ? somenteDigitos(telefone) : null,
                cpf: somenteDigitos(cpf),
                conselho: conselho.toUpperCase(),
                registroProfissional: registroProfissional.trim(),
                ufRegistro: ufRegistro.toUpperCase()
            },
            idsEspecialidades,
            idsClinicas
        );

        return responderDetalhe(idCriado, resposta, 201);
    } catch (erro) {
        if (erro.code === '23505') {
            if (erro.constraint === 'uq_usuario_email') {
                return proximo(new ErroApi(409, 'EMAIL_JA_CADASTRADO', 'Este e-mail ja esta em uso.'));
            }
            if (erro.constraint === 'uq_profissional_cpf') {
                return proximo(new ErroApi(409, 'CPF_JA_CADASTRADO', 'Este CPF ja esta cadastrado como profissional.'));
            }
            if (erro.constraint === 'uq_profissional_registro') {
                return proximo(new ErroApi(409, 'REGISTRO_JA_CADASTRADO',
                    'Ja existe um profissional com esse conselho, UF e numero de registro.'));
            }
        }
        if (erro.code === '23503') {
            return proximo(new ErroApi(400, 'VINCULO_INVALIDO',
                'Uma das clinicas ou especialidades informadas nao existe.'));
        }
        return proximo(erro);
    }
}

// A senha NAO e alterada aqui: trocar senha de outra pessoa e operacao
// distinta, com risco distinto, e nao deve acontecer por engano numa
// edicao de cadastro.
export async function atualizar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const corpo = requisicao.body ?? {};
        const { nome, email, telefone, conselho, registroProfissional, ufRegistro, ativo } = corpo;

        if (Object.keys(corpo).length === 0) {
            throw erroDadosInvalidos('Informe ao menos um campo para alterar.');
        }
        if (corpo.senha !== undefined) {
            throw erroDadosInvalidos('A senha nao pode ser alterada por esta rota.');
        }
        if (nome !== undefined && !textoValido(nome, 3, 160)) {
            throw erroDadosInvalidos('O nome precisa ter pelo menos 3 letras.');
        }
        if (email !== undefined && !emailValido(email)) {
            throw erroDadosInvalidos('O e-mail informado nao e valido.');
        }
        if (conselho !== undefined && !CONSELHOS.includes(String(conselho).toUpperCase())) {
            throw erroDadosInvalidos(`O conselho precisa ser um destes: ${CONSELHOS.join(', ')}.`);
        }
        if (ufRegistro !== undefined && !UFS.includes(String(ufRegistro).toUpperCase())) {
            throw erroDadosInvalidos('Informe a UF do registro com duas letras.');
        }
        if (ativo !== undefined && typeof ativo !== 'boolean') {
            throw erroDadosInvalidos('O campo ativo precisa ser true ou false.');
        }

        const alterado = await model.atualizarCompleto(id, {
            nome: nome !== undefined ? nome.trim() : null,
            email: email !== undefined ? email.trim().toLowerCase() : null,
            telefone: telefone !== undefined ? (somenteDigitos(telefone) || null) : null,
            conselho: conselho !== undefined ? String(conselho).toUpperCase() : null,
            registroProfissional: registroProfissional !== undefined ? String(registroProfissional).trim() : null,
            ufRegistro: ufRegistro !== undefined ? String(ufRegistro).toUpperCase() : null,
            ativo: ativo !== undefined ? ativo : null
        });

        if (!alterado) throw new ErroApi(404, 'PROFISSIONAL_NAO_ENCONTRADO', 'Profissional nao encontrado.');

        return responderDetalhe(id, resposta);
    } catch (erro) {
        if (erro.code === '23505') {
            if (erro.constraint === 'uq_usuario_email') {
                return proximo(new ErroApi(409, 'EMAIL_JA_CADASTRADO', 'Este e-mail ja esta em uso.'));
            }
            if (erro.constraint === 'uq_profissional_registro') {
                return proximo(new ErroApi(409, 'REGISTRO_JA_CADASTRADO',
                    'Ja existe um profissional com esse conselho, UF e numero de registro.'));
            }
        }
        return proximo(erro);
    }
}

export async function substituirEspecialidades(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const ids = listaDeIds(requisicao.body?.idsEspecialidades, 'idsEspecialidades');
        if (ids === undefined) {
            throw erroDadosInvalidos('Informe idsEspecialidades como uma lista de numeros.');
        }

        if (!await model.existe(id)) {
            throw new ErroApi(404, 'PROFISSIONAL_NAO_ENCONTRADO', 'Profissional nao encontrado.');
        }

        // Remover uma especialidade com consultas futuras deixaria
        // agendamentos apontando para algo que o profissional deixou de
        // atender.
        const bloqueantes = await model.contarBloqueantesPorEspecialidade(id, ids);
        if (bloqueantes > 0) {
            throw new ErroApi(409, 'ESPECIALIDADE_COM_AGENDAMENTOS',
                `${frasePlural(bloqueantes)} em uma especialidade que seria removida. Cancele antes de alterar.`);
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

// Acrescenta, nao substitui: cada vinculo tem id proprio, referenciado
// por agenda e agendamentos. Apagar e recriar geraria ids novos e
// orfanaria os registros existentes.
export async function vincularClinica(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        const idClinica = idValido(requisicao.body?.idClinica);

        if (!id) throw erroDadosInvalidos('Identificador invalido.');
        if (!idClinica) throw erroDadosInvalidos('Informe o idClinica.');

        if (!await model.existe(id)) {
            throw new ErroApi(404, 'PROFISSIONAL_NAO_ENCONTRADO', 'Profissional nao encontrado.');
        }

        await model.vincularClinica(id, idClinica);
        return responderDetalhe(id, resposta, 201);
    } catch (erro) {
        if (erro.code === '23505' && erro.constraint === 'uq_prof_clinica') {
            return proximo(new ErroApi(409, 'VINCULO_JA_EXISTE',
                'Este profissional ja esta vinculado a esta clinica.'));
        }
        if (erro.code === '23503') {
            return proximo(new ErroApi(400, 'CLINICA_NAO_ENCONTRADA', 'A clinica informada nao existe.'));
        }
        return proximo(erro);
    }
}

export async function desativarVinculo(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        const idClinica = idValido(requisicao.params.idClinica);
        if (!id || !idClinica) throw erroDadosInvalidos('Identificador invalido.');

        const vinculo = await model.buscarVinculo(id, idClinica);
        if (!vinculo) throw new ErroApi(404, 'VINCULO_NAO_ENCONTRADO', 'Vinculo nao encontrado.');
        if (!vinculo.ativo) {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA', 'Este vinculo ja esta desativado.');
        }

        const bloqueantes = Number(vinculo.bloqueantes);
        if (bloqueantes > 0) {
            throw new ErroApi(409, 'VINCULO_COM_AGENDAMENTOS',
                `${frasePlural(bloqueantes)} neste vinculo. Cancele antes de desativar.`);
        }

        await model.desativarVinculo(vinculo.id_profissional_clinica);
        return resposta.status(204).send();
    } catch (erro) {
        return proximo(erro);
    }
}

export async function desativar(requisicao, resposta, proximo) {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const profissional = await model.buscarComBloqueantes(id);
        if (!profissional) {
            throw new ErroApi(404, 'PROFISSIONAL_NAO_ENCONTRADO', 'Profissional nao encontrado.');
        }
        if (!profissional.ativo) {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA', 'Este profissional ja esta desativado.');
        }

        const bloqueantes = Number(profissional.bloqueantes);
        if (bloqueantes > 0) {
            throw new ErroApi(409, 'PROFISSIONAL_COM_AGENDAMENTOS',
                `${frasePlural(bloqueantes)} com este profissional. Cancele antes de desativar.`);
        }

        await model.desativarComUsuario(id, profissional.id_usuario);
        return resposta.status(204).send();
    } catch (erro) {
        return proximo(erro);
    }
}

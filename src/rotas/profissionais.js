import { Router } from 'express';
import bcrypt from 'bcryptjs';

import { consultar, transacao } from '../banco.js';
import { ErroApi, erroDadosInvalidos } from '../erros.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';
import { textoValido, emailValido, cpfValido, senhaValida, somenteDigitos } from '../validacao.js';

const rotas = Router();

const CUSTO_HASH = 10;

// Conselhos de classe aceitos. Lista fechada de proposito: campo livre
// permitiria "crm", "C.R.M." e "Crm" como valores diferentes, o que
// quebra a unicidade de registro profissional.
const CONSELHOS = ['CRM', 'CRO', 'CRP', 'COREN', 'CREFITO', 'CRN', 'CRF', 'CREFONO'];

const UFS = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

function idValido(valor) {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function listaDeIds(valor, nomeCampo) {
    if (valor === undefined) return undefined;
    if (!Array.isArray(valor)) {
        throw erroDadosInvalidos(`O campo ${nomeCampo} precisa ser uma lista de numeros.`);
    }
    if (valor.some((v) => !Number.isInteger(Number(v)) || Number(v) <= 0)) {
        throw erroDadosInvalidos(`A lista ${nomeCampo} deve conter apenas numeros inteiros.`);
    }
    return valor.map(Number);
}

function formatar(r) {
    return {
        idProfissional: Number(r.id_profissional),
        idUsuario: Number(r.id_usuario),
        nome: r.nome,
        email: r.email,
        telefone: r.telefone,
        cpf: r.cpf,
        conselho: r.conselho,
        registroProfissional: r.registro_profissional,
        ufRegistro: r.uf_registro,
        registro: `${r.conselho}-${r.uf_registro} ${r.registro_profissional}`,
        ativo: r.ativo,
        especialidades: (r.especialidades ?? []).map((e) => ({
            idEspecialidade: Number(e.id),
            nome: e.nome
        })),
        clinicas: (r.clinicas ?? []).map((c) => ({
            idProfissionalClinica: Number(c.id_pc),
            idClinica: Number(c.id_clinica),
            nome: c.nome,
            ativo: c.ativo
        }))
    };
}

// Projecao compartilhada. As especialidades e clinicas vem como JSON
// agregado para evitar varias consultas por profissional.
const SELECT_PROFISSIONAL = `
    SELECT pr.id_profissional, pr.id_usuario, pr.cpf, pr.conselho,
           pr.registro_profissional, pr.uf_registro, pr.ativo,
           u.nome, u.email, u.telefone,
           COALESCE((
               SELECT JSON_AGG(JSON_BUILD_OBJECT('id', e.id_especialidade, 'nome', e.nome) ORDER BY e.nome)
                 FROM profissional_especialidade pe
                 JOIN especialidade e ON e.id_especialidade = pe.id_especialidade
                WHERE pe.id_profissional = pr.id_profissional
           ), '[]'::json) AS especialidades,
           COALESCE((
               SELECT JSON_AGG(JSON_BUILD_OBJECT(
                          'id_pc', pc.id_profissional_clinica,
                          'id_clinica', c.id_clinica,
                          'nome', c.nome,
                          'ativo', pc.ativo) ORDER BY c.nome)
                 FROM profissional_clinica pc
                 JOIN clinica c ON c.id_clinica = pc.id_clinica
                WHERE pc.id_profissional = pr.id_profissional
           ), '[]'::json) AS clinicas
      FROM profissional pr
      JOIN usuario u ON u.id_usuario = pr.id_usuario
`;

async function devolverDetalhe(id, resposta, status = 200) {
    const { rows } = await consultar(`${SELECT_PROFISSIONAL} WHERE pr.id_profissional = $1`, [id]);
    return resposta.status(status).json(formatar(rows[0]));
}

// =====================================================================
// GET /profissionais
//
// Visao administrativa. Diferente de /profissionais-clinicas, que e a
// busca do paciente: la o recorte e o vinculo com a clinica, aqui e a
// pessoa, com todos os seus vinculos reunidos.
// =====================================================================
rotas.get('/', autenticar, exigePerfil('ADMINISTRADOR'), async (requisicao, resposta, proximo) => {
    try {
        const incluirInativos = requisicao.query.incluirInativos === 'true';
        const busca = typeof requisicao.query.busca === 'string' ? requisicao.query.busca.trim() : '';

        const { rows } = await consultar(
            `${SELECT_PROFISSIONAL}
              WHERE ($1::boolean IS TRUE OR pr.ativo = TRUE)
                AND ($2::text = '' OR u.nome ILIKE '%' || $2 || '%' OR pr.registro_profissional ILIKE '%' || $2 || '%')
              ORDER BY u.nome`,
            [incluirInativos, busca]
        );

        return resposta.json(rows.map(formatar));
    } catch (erro) {
        return proximo(erro);
    }
});

// =====================================================================
// POST /profissionais
// Requisito 2 da 1a entrega.
//
// Uma requisicao cria tres coisas: o usuario de acesso, o registro
// profissional e os vinculos com clinicas e especialidades. Tudo em
// transacao: se o vinculo falhar, o usuario nao pode ficar orfao,
// ocupando o e-mail sem conseguir fazer login.
//
// A senha inicial e definida pelo administrador e informada ao
// profissional por fora do sistema. Decisao do grupo para a 1a
// entrega. Convite por e-mail ficaria fora de escopo.
// =====================================================================
rotas.post('/', autenticar, exigePerfil('ADMINISTRADOR'), async (requisicao, resposta, proximo) => {
    try {
        const corpo = requisicao.body ?? {};
        const {
            nome, email, telefone, cpf, conselho, registroProfissional, ufRegistro, senha
        } = corpo;

        if (!textoValido(nome, 3, 160)) {
            throw erroDadosInvalidos('Informe o nome completo, com pelo menos 3 letras.');
        }
        if (!emailValido(email)) {
            throw erroDadosInvalidos('Informe um e-mail valido.');
        }
        if (!cpfValido(cpf)) {
            throw erroDadosInvalidos('O CPF informado nao e valido. Confira os numeros.');
        }
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
        if (telefone !== undefined && telefone !== null && telefone !== ''
            && !textoValido(telefone, 8, 20)) {
            throw erroDadosInvalidos('O telefone informado nao e valido.');
        }

        const idsClinicas = listaDeIds(corpo.idsClinicas, 'idsClinicas');
        const idsEspecialidades = listaDeIds(corpo.idsEspecialidades, 'idsEspecialidades');

        const senhaHash = await bcrypt.hash(senha, CUSTO_HASH);

        const idCriado = await transacao(async (cliente) => {
            const usuarioInserido = await cliente.query(
                `INSERT INTO usuario (nome, email, senha_hash, telefone, tipo_usuario)
                 VALUES ($1, $2, $3, $4, 'PROFISSIONAL')
                 RETURNING id_usuario`,
                [
                    nome.trim(),
                    email.trim().toLowerCase(),
                    senhaHash,
                    telefone ? somenteDigitos(telefone) : null
                ]
            );

            const idUsuario = usuarioInserido.rows[0].id_usuario;

            const profissionalInserido = await cliente.query(
                `INSERT INTO profissional (id_usuario, cpf, conselho, registro_profissional, uf_registro)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id_profissional`,
                [
                    idUsuario,
                    somenteDigitos(cpf),
                    conselho.toUpperCase(),
                    registroProfissional.trim(),
                    ufRegistro.toUpperCase()
                ]
            );

            const idProfissional = profissionalInserido.rows[0].id_profissional;

            if (idsEspecialidades?.length) {
                await cliente.query(
                    `INSERT INTO profissional_especialidade (id_profissional, id_especialidade)
                     SELECT $1, UNNEST($2::bigint[])`,
                    [idProfissional, idsEspecialidades]
                );
            }

            if (idsClinicas?.length) {
                await cliente.query(
                    `INSERT INTO profissional_clinica (id_profissional, id_clinica)
                     SELECT $1, UNNEST($2::bigint[])`,
                    [idProfissional, idsClinicas]
                );
            }

            return idProfissional;
        });

        return devolverDetalhe(idCriado, resposta, 201);
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
});

// =====================================================================
// GET /profissionais/:id
// =====================================================================
rotas.get('/:id', autenticar, exigePerfil('ADMINISTRADOR'), async (requisicao, resposta, proximo) => {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const { rows } = await consultar(`${SELECT_PROFISSIONAL} WHERE pr.id_profissional = $1`, [id]);
        if (rows.length === 0) {
            throw new ErroApi(404, 'PROFISSIONAL_NAO_ENCONTRADO', 'Profissional nao encontrado.');
        }

        return resposta.json(formatar(rows[0]));
    } catch (erro) {
        return proximo(erro);
    }
});

// =====================================================================
// PATCH /profissionais/:id
//
// Altera dados cadastrais. A senha NAO e alterada aqui: trocar senha
// de outra pessoa e operacao distinta, com risco distinto, e nao deve
// acontecer por engano numa edicao de cadastro.
// =====================================================================
rotas.patch('/:id', autenticar, exigePerfil('ADMINISTRADOR'), async (requisicao, resposta, proximo) => {
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

        const alterado = await transacao(async (cliente) => {
            const { rows } = await cliente.query(
                `UPDATE profissional
                    SET conselho              = COALESCE($2, conselho),
                        registro_profissional = COALESCE($3, registro_profissional),
                        uf_registro           = COALESCE($4, uf_registro),
                        ativo                 = COALESCE($5, ativo)
                  WHERE id_profissional = $1
                  RETURNING id_usuario`,
                [
                    id,
                    conselho !== undefined ? String(conselho).toUpperCase() : null,
                    registroProfissional !== undefined ? String(registroProfissional).trim() : null,
                    ufRegistro !== undefined ? String(ufRegistro).toUpperCase() : null,
                    ativo !== undefined ? ativo : null
                ]
            );

            if (rows.length === 0) return false;

            // Nome, e-mail e telefone moram em usuario, nao em
            // profissional. A tela e uma so, a atualizacao e em duas
            // tabelas, por isso a transacao.
            if (nome !== undefined || email !== undefined || telefone !== undefined || ativo !== undefined) {
                await cliente.query(
                    `UPDATE usuario
                        SET nome     = COALESCE($2, nome),
                            email    = COALESCE($3, email),
                            telefone = COALESCE($4, telefone),
                            ativo    = COALESCE($5, ativo)
                      WHERE id_usuario = $1`,
                    [
                        rows[0].id_usuario,
                        nome !== undefined ? nome.trim() : null,
                        email !== undefined ? email.trim().toLowerCase() : null,
                        telefone !== undefined ? (somenteDigitos(telefone) || null) : null,
                        ativo !== undefined ? ativo : null
                    ]
                );
            }

            return true;
        });

        if (!alterado) {
            throw new ErroApi(404, 'PROFISSIONAL_NAO_ENCONTRADO', 'Profissional nao encontrado.');
        }

        return devolverDetalhe(id, resposta);
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
});

// =====================================================================
// PUT /profissionais/:id/especialidades
// Substitui a lista inteira.
// =====================================================================
rotas.put('/:id/especialidades', autenticar, exigePerfil('ADMINISTRADOR'),
    async (requisicao, resposta, proximo) => {
        try {
            const id = idValido(requisicao.params.id);
            if (!id) throw erroDadosInvalidos('Identificador invalido.');

            const ids = listaDeIds(requisicao.body?.idsEspecialidades, 'idsEspecialidades');
            if (ids === undefined) {
                throw erroDadosInvalidos('Informe idsEspecialidades como uma lista de numeros.');
            }

            const existe = await consultar(`SELECT 1 FROM profissional WHERE id_profissional = $1`, [id]);
            if (existe.rowCount === 0) {
                throw new ErroApi(404, 'PROFISSIONAL_NAO_ENCONTRADO', 'Profissional nao encontrado.');
            }

            // Remover uma especialidade com consultas futuras marcadas
            // deixaria agendamentos apontando para algo que o
            // profissional deixou de atender.
            const { rows } = await consultar(
                `SELECT COUNT(*) AS bloqueantes
                   FROM agendamento a
                   JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
                  WHERE pc.id_profissional = $1
                    AND a.status IN ('AGENDADO', 'CONFIRMADO')
                    AND a.data_hora > NOW()
                    AND NOT (a.id_especialidade = ANY($2::bigint[]))`,
                [id, ids]
            );

            const bloqueantes = Number(rows[0].bloqueantes);
            if (bloqueantes > 0) {
                throw new ErroApi(409, 'ESPECIALIDADE_COM_AGENDAMENTOS',
                    `${bloqueantes === 1 ? 'Existe 1 consulta marcada' : `Existem ${bloqueantes} consultas marcadas`} `
                    + 'em uma especialidade que seria removida. Cancele antes de alterar.');
            }

            await transacao(async (cliente) => {
                await cliente.query(`DELETE FROM profissional_especialidade WHERE id_profissional = $1`, [id]);
                if (ids.length > 0) {
                    await cliente.query(
                        `INSERT INTO profissional_especialidade (id_profissional, id_especialidade)
                         SELECT $1, UNNEST($2::bigint[])`,
                        [id, ids]
                    );
                }
            });

            return devolverDetalhe(id, resposta);
        } catch (erro) {
            if (erro.code === '23503') {
                return proximo(new ErroApi(400, 'ESPECIALIDADE_NAO_ENCONTRADA',
                    'Uma das especialidades informadas nao existe.'));
            }
            return proximo(erro);
        }
    });

// =====================================================================
// POST /profissionais/:id/clinicas
//
// Acrescenta um vinculo. Diferente das especialidades, aqui nao e
// substituicao: cada vinculo tem id proprio, referenciado por agenda e
// agendamentos. Apagar e recriar geraria ids novos e orfanaria os
// registros existentes.
// =====================================================================
rotas.post('/:id/clinicas', autenticar, exigePerfil('ADMINISTRADOR'),
    async (requisicao, resposta, proximo) => {
        try {
            const id = idValido(requisicao.params.id);
            const idClinica = idValido(requisicao.body?.idClinica);

            if (!id) throw erroDadosInvalidos('Identificador invalido.');
            if (!idClinica) throw erroDadosInvalidos('Informe o idClinica.');

            const existe = await consultar(`SELECT 1 FROM profissional WHERE id_profissional = $1`, [id]);
            if (existe.rowCount === 0) {
                throw new ErroApi(404, 'PROFISSIONAL_NAO_ENCONTRADO', 'Profissional nao encontrado.');
            }

            await consultar(
                `INSERT INTO profissional_clinica (id_profissional, id_clinica) VALUES ($1, $2)`,
                [id, idClinica]
            );

            return devolverDetalhe(id, resposta, 201);
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
    });

// =====================================================================
// DELETE /profissionais/:id/clinicas/:idClinica
// Desativa o vinculo, preservando agenda e historico.
// =====================================================================
rotas.delete('/:id/clinicas/:idClinica', autenticar, exigePerfil('ADMINISTRADOR'),
    async (requisicao, resposta, proximo) => {
        try {
            const id = idValido(requisicao.params.id);
            const idClinica = idValido(requisicao.params.idClinica);
            if (!id || !idClinica) throw erroDadosInvalidos('Identificador invalido.');

            const { rows } = await consultar(
                `SELECT pc.id_profissional_clinica, pc.ativo,
                        (SELECT COUNT(*) FROM agendamento a
                          WHERE a.id_profissional_clinica = pc.id_profissional_clinica
                            AND a.status IN ('AGENDADO', 'CONFIRMADO')
                            AND a.data_hora > NOW()) AS bloqueantes
                   FROM profissional_clinica pc
                  WHERE pc.id_profissional = $1 AND pc.id_clinica = $2`,
                [id, idClinica]
            );

            const vinculo = rows[0];
            if (!vinculo) {
                throw new ErroApi(404, 'VINCULO_NAO_ENCONTRADO', 'Vinculo nao encontrado.');
            }
            if (!vinculo.ativo) {
                throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA', 'Este vinculo ja esta desativado.');
            }

            const bloqueantes = Number(vinculo.bloqueantes);
            if (bloqueantes > 0) {
                throw new ErroApi(409, 'VINCULO_COM_AGENDAMENTOS',
                    `${bloqueantes === 1 ? 'Existe 1 consulta marcada' : `Existem ${bloqueantes} consultas marcadas`} `
                    + 'neste vinculo. Cancele antes de desativar.');
            }

            await consultar(
                `UPDATE profissional_clinica SET ativo = FALSE WHERE id_profissional_clinica = $1`,
                [vinculo.id_profissional_clinica]
            );

            return resposta.status(204).send();
        } catch (erro) {
            return proximo(erro);
        }
    });

// =====================================================================
// DELETE /profissionais/:id
//
// Desativa o profissional e o usuario de acesso. Bloqueado se houver
// consultas futuras marcadas em qualquer um dos vinculos.
// =====================================================================
rotas.delete('/:id', autenticar, exigePerfil('ADMINISTRADOR'), async (requisicao, resposta, proximo) => {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const { rows } = await consultar(
            `SELECT pr.id_profissional, pr.id_usuario, pr.ativo,
                    (SELECT COUNT(*) FROM agendamento a
                       JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
                      WHERE pc.id_profissional = pr.id_profissional
                        AND a.status IN ('AGENDADO', 'CONFIRMADO')
                        AND a.data_hora > NOW()) AS bloqueantes
               FROM profissional pr
              WHERE pr.id_profissional = $1`,
            [id]
        );

        const profissional = rows[0];
        if (!profissional) {
            throw new ErroApi(404, 'PROFISSIONAL_NAO_ENCONTRADO', 'Profissional nao encontrado.');
        }
        if (!profissional.ativo) {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA', 'Este profissional ja esta desativado.');
        }

        const bloqueantes = Number(profissional.bloqueantes);
        if (bloqueantes > 0) {
            throw new ErroApi(409, 'PROFISSIONAL_COM_AGENDAMENTOS',
                `${bloqueantes === 1 ? 'Existe 1 consulta marcada' : `Existem ${bloqueantes} consultas marcadas`} `
                + 'com este profissional. Cancele antes de desativar.');
        }

        // Desativa os dois: sem o usuario inativo, a pessoa continuaria
        // conseguindo fazer login.
        await transacao(async (cliente) => {
            await cliente.query(`UPDATE profissional SET ativo = FALSE WHERE id_profissional = $1`, [id]);
            await cliente.query(`UPDATE usuario SET ativo = FALSE WHERE id_usuario = $1`, [profissional.id_usuario]);
        });

        return resposta.status(204).send();
    } catch (erro) {
        return proximo(erro);
    }
});

export default rotas;

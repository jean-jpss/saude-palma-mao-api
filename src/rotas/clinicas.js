import { Router } from 'express';

import { consultar, transacao } from '../banco.js';
import { ErroApi, erroDadosInvalidos } from '../erros.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';
import { textoValido, emailValido, somenteDigitos } from '../validacao.js';
import { cnpjValido } from '../validacaoCnpj.js';

const rotas = Router();

function idValido(valor) {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function inteiroOpcional(valor, nomeCampo) {
    if (valor === undefined || valor === null || valor === '') return null;
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero <= 0) {
        throw erroDadosInvalidos(`O parametro ${nomeCampo} precisa ser um numero inteiro.`);
    }
    return numero;
}

function formatar(r) {
    return {
        idClinica: Number(r.id_clinica),
        nome: r.nome,
        telefone: r.telefone,
        email: r.email,
        horarioFuncionamento: r.horario_funcionamento,
        ativo: r.ativo,
        endereco: {
            logradouro: r.logradouro,
            numero: r.numero,
            bairro: r.bairro,
            cidade: r.cidade,
            uf: r.uf,
            cep: r.cep,
            completo: `${r.logradouro}, ${r.numero}, ${r.bairro}, ${r.cidade} ${r.uf}`
        },
        especialidades: r.especialidades ?? []
    };
}

const SELECT_CLINICA = `
    SELECT c.id_clinica, c.nome, c.telefone, c.email,
           c.logradouro, c.numero, c.bairro, c.cidade, c.uf, c.cep,
           c.horario_funcionamento, c.ativo,
           ARRAY_REMOVE(ARRAY_AGG(DISTINCT e.nome ORDER BY e.nome), NULL) AS especialidades
      FROM clinica c
      LEFT JOIN clinica_especialidade ce ON ce.id_clinica = c.id_clinica
      LEFT JOIN especialidade e ON e.id_especialidade = ce.id_especialidade AND e.ativo = TRUE
`;

async function devolverDetalhe(id, resposta, status = 200) {
    const { rows } = await consultar(`${SELECT_CLINICA} WHERE c.id_clinica = $1 GROUP BY c.id_clinica`, [id]);
    return resposta.status(status).json(formatar(rows[0]));
}

// Valida e normaliza os campos de endereco e contato, compartilhados
// entre o cadastro e a atualizacao.
function validarCamposClinica(corpo, obrigatorios) {
    const { nome, cnpj, telefone, email, logradouro, numero, bairro, cidade, uf, cep, horarioFuncionamento } = corpo;

    if (obrigatorios || nome !== undefined) {
        if (!textoValido(nome, 3, 160)) {
            throw erroDadosInvalidos('Informe o nome da clinica, com 3 a 160 caracteres.');
        }
    }
    if (obrigatorios || cnpj !== undefined) {
        if (!cnpjValido(cnpj)) {
            throw erroDadosInvalidos('O CNPJ informado nao e valido. Confira os numeros.');
        }
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
    if (obrigatorios || logradouro !== undefined) {
        if (!textoValido(logradouro, 3, 160)) {
            throw erroDadosInvalidos('Informe o logradouro, com 3 a 160 caracteres.');
        }
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

// =====================================================================
// GET /clinicas?idEspecialidade=&busca=&incluirInativas=
//
// Requisito 7: permitir que o paciente visualize e pesquise clinicas.
//
// O CNPJ nao e devolvido na listagem publica. E dado cadastral da
// empresa, sem utilidade para o paciente escolher onde se consultar.
// =====================================================================
rotas.get('/', autenticar, async (requisicao, resposta, proximo) => {
    try {
        const idEspecialidade = inteiroOpcional(requisicao.query.idEspecialidade, 'idEspecialidade');
        const busca = typeof requisicao.query.busca === 'string' ? requisicao.query.busca.trim() : '';
        const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';
        const incluirInativas = ehAdministrador && requisicao.query.incluirInativas === 'true';

        if (busca.length > 120) {
            throw erroDadosInvalidos('O texto de busca e muito longo.');
        }

        const { rows } = await consultar(
            `${SELECT_CLINICA}
              WHERE ($3::boolean IS TRUE OR c.ativo = TRUE)
                AND ($1::bigint IS NULL OR EXISTS (
                        SELECT 1 FROM clinica_especialidade f
                         WHERE f.id_clinica = c.id_clinica
                           AND f.id_especialidade = $1
                    ))
                AND ($2::text = '' OR c.nome ILIKE '%' || $2 || '%' OR c.bairro ILIKE '%' || $2 || '%')
              GROUP BY c.id_clinica
              ORDER BY c.nome`,
            [idEspecialidade, busca, incluirInativas]
        );

        return resposta.json(rows.map(formatar));
    } catch (erro) {
        return proximo(erro);
    }
});

// =====================================================================
// POST /clinicas
// Requisito 1 da 1a entrega.
//
// Aceita opcionalmente um array idsEspecialidades, criando a clinica e
// seus vinculos em uma transacao. Se o vinculo falhar, a clinica
// tambem nao e criada.
// =====================================================================
rotas.post('/', autenticar, exigePerfil('ADMINISTRADOR'), async (requisicao, resposta, proximo) => {
    try {
        const corpo = requisicao.body ?? {};
        const dados = validarCamposClinica(corpo, true);
        const idsEspecialidades = corpo.idsEspecialidades;

        if (idsEspecialidades !== undefined && !Array.isArray(idsEspecialidades)) {
            throw erroDadosInvalidos('O campo idsEspecialidades precisa ser uma lista de numeros.');
        }

        const idCriado = await transacao(async (cliente) => {
            const { rows } = await cliente.query(
                `INSERT INTO clinica
                     (nome, cnpj, telefone, email, logradouro, numero, bairro, cidade, uf, cep, horario_funcionamento)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'Recife'), COALESCE($9, 'PE'), $10, $11)
                 RETURNING id_clinica`,
                [
                    dados.nome, dados.cnpj, dados.telefone ?? null, dados.email ?? null,
                    dados.logradouro, dados.numero ?? null, dados.bairro ?? null,
                    dados.cidade ?? null, dados.uf ?? null, dados.cep ?? null,
                    dados.horarioFuncionamento ?? null
                ]
            );

            const id = rows[0].id_clinica;

            if (Array.isArray(idsEspecialidades) && idsEspecialidades.length > 0) {
                await cliente.query(
                    `INSERT INTO clinica_especialidade (id_clinica, id_especialidade)
                     SELECT $1, UNNEST($2::bigint[])`,
                    [id, idsEspecialidades]
                );
            }

            return id;
        });

        return devolverDetalhe(idCriado, resposta, 201);
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
});

// =====================================================================
// GET /clinicas/:id
// =====================================================================
rotas.get('/:id', autenticar, async (requisicao, resposta, proximo) => {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const ehAdministrador = requisicao.usuario.tipoUsuario === 'ADMINISTRADOR';

        const { rows } = await consultar(
            `${SELECT_CLINICA}
              WHERE c.id_clinica = $1 AND ($2::boolean IS TRUE OR c.ativo = TRUE)
              GROUP BY c.id_clinica`,
            [id, ehAdministrador]
        );

        if (rows.length === 0) {
            throw new ErroApi(404, 'CLINICA_NAO_ENCONTRADA', 'Clinica nao encontrada.');
        }

        return resposta.json(formatar(rows[0]));
    } catch (erro) {
        return proximo(erro);
    }
});

// =====================================================================
// PATCH /clinicas/:id
// =====================================================================
rotas.patch('/:id', autenticar, exigePerfil('ADMINISTRADOR'), async (requisicao, resposta, proximo) => {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const corpo = requisicao.body ?? {};
        if (Object.keys(corpo).length === 0) {
            throw erroDadosInvalidos('Informe ao menos um campo para alterar.');
        }

        const d = validarCamposClinica(corpo, false);
        const ativo = corpo.ativo;

        if (ativo !== undefined && typeof ativo !== 'boolean') {
            throw erroDadosInvalidos('O campo ativo precisa ser true ou false.');
        }

        const { rowCount } = await consultar(
            `UPDATE clinica
                SET nome       = COALESCE($2, nome),
                    cnpj       = COALESCE($3, cnpj),
                    telefone   = COALESCE($4, telefone),
                    email      = COALESCE($5, email),
                    logradouro = COALESCE($6, logradouro),
                    numero     = COALESCE($7, numero),
                    bairro     = COALESCE($8, bairro),
                    cidade     = COALESCE($9, cidade),
                    uf         = COALESCE($10, uf),
                    cep        = COALESCE($11, cep),
                    horario_funcionamento = COALESCE($12, horario_funcionamento),
                    ativo      = COALESCE($13, ativo)
              WHERE id_clinica = $1`,
            [
                id, d.nome ?? null, d.cnpj ?? null, d.telefone ?? null, d.email ?? null,
                d.logradouro ?? null, d.numero ?? null, d.bairro ?? null, d.cidade ?? null,
                d.uf ?? null, d.cep ?? null, d.horarioFuncionamento ?? null,
                ativo !== undefined ? ativo : null
            ]
        );

        if (rowCount === 0) {
            throw new ErroApi(404, 'CLINICA_NAO_ENCONTRADA', 'Clinica nao encontrada.');
        }

        return devolverDetalhe(id, resposta);
    } catch (erro) {
        if (erro.code === '23505' && erro.constraint === 'uq_clinica_cnpj') {
            return proximo(new ErroApi(409, 'CNPJ_JA_CADASTRADO', 'Ja existe uma clinica com esse CNPJ.'));
        }
        return proximo(erro);
    }
});

// =====================================================================
// PUT /clinicas/:id/especialidades
//
// Substitui a lista inteira de especialidades da clinica. PUT, e nao
// PATCH, porque o corpo representa o estado final desejado: o que nao
// estiver na lista e removido.
// =====================================================================
rotas.put('/:id/especialidades', autenticar, exigePerfil('ADMINISTRADOR'),
    async (requisicao, resposta, proximo) => {
        try {
            const id = idValido(requisicao.params.id);
            if (!id) throw erroDadosInvalidos('Identificador invalido.');

            const { idsEspecialidades } = requisicao.body ?? {};
            if (!Array.isArray(idsEspecialidades)) {
                throw erroDadosInvalidos('Informe idsEspecialidades como uma lista de numeros.');
            }
            if (idsEspecialidades.some((v) => !Number.isInteger(Number(v)) || Number(v) <= 0)) {
                throw erroDadosInvalidos('A lista de especialidades deve conter apenas numeros inteiros.');
            }

            const existe = await consultar(`SELECT 1 FROM clinica WHERE id_clinica = $1`, [id]);
            if (existe.rowCount === 0) {
                throw new ErroApi(404, 'CLINICA_NAO_ENCONTRADA', 'Clinica nao encontrada.');
            }

            await transacao(async (cliente) => {
                await cliente.query(`DELETE FROM clinica_especialidade WHERE id_clinica = $1`, [id]);
                if (idsEspecialidades.length > 0) {
                    await cliente.query(
                        `INSERT INTO clinica_especialidade (id_clinica, id_especialidade)
                         SELECT $1, UNNEST($2::bigint[])`,
                        [id, idsEspecialidades.map(Number)]
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
// DELETE /clinicas/:id
//
// Desativacao logica. Bloqueada se existirem agendamentos ativos e
// futuros em qualquer profissional vinculado a esta clinica, mesma
// logica da regra 1.3 aplicada a disponibilidade.
// =====================================================================
rotas.delete('/:id', autenticar, exigePerfil('ADMINISTRADOR'), async (requisicao, resposta, proximo) => {
    try {
        const id = idValido(requisicao.params.id);
        if (!id) throw erroDadosInvalidos('Identificador invalido.');

        const { rows } = await consultar(
            `SELECT c.id_clinica, c.ativo,
                    (SELECT COUNT(*) FROM agendamento a
                       JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
                      WHERE pc.id_clinica = c.id_clinica
                        AND a.status IN ('AGENDADO', 'CONFIRMADO')
                        AND a.data_hora > NOW()) AS bloqueantes
               FROM clinica c
              WHERE c.id_clinica = $1`,
            [id]
        );

        const clinica = rows[0];
        if (!clinica) {
            throw new ErroApi(404, 'CLINICA_NAO_ENCONTRADA', 'Clinica nao encontrada.');
        }
        if (!clinica.ativo) {
            throw new ErroApi(409, 'TRANSICAO_STATUS_INVALIDA', 'Esta clinica ja esta desativada.');
        }

        const bloqueantes = Number(clinica.bloqueantes);
        if (bloqueantes > 0) {
            throw new ErroApi(409, 'CLINICA_COM_AGENDAMENTOS',
                                `${bloqueantes === 1 ? 'Existe 1 consulta marcada' : `Existem ${bloqueantes} consultas marcadas`} nesta clinica. `
                + 'Cancele antes de desativar.');
        }

        await consultar(`UPDATE clinica SET ativo = FALSE WHERE id_clinica = $1`, [id]);
        return resposta.status(204).send();
    } catch (erro) {
        return proximo(erro);
    }
});

export default rotas;

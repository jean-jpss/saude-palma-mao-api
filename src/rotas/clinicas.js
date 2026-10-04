import { Router } from 'express';

import { consultar } from '../banco.js';
import { ErroApi, erroDadosInvalidos } from '../erros.js';
import { autenticar } from '../middlewares/autenticacao.js';

const rotas = Router();

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
        endereco: {
            logradouro: r.logradouro,
            numero: r.numero,
            bairro: r.bairro,
            cidade: r.cidade,
            uf: r.uf,
            cep: r.cep,
            // Linha unica pronta para exibir, para o front nao precisar
            // concatenar campo por campo em cada tela.
            completo: `${r.logradouro}, ${r.numero}, ${r.bairro}, ${r.cidade} ${r.uf}`
        },
        especialidades: r.especialidades ?? []
    };
}

// =====================================================================
// GET /clinicas?idEspecialidade=&busca=
//
// Requisito 7 da 1a entrega: permitir que o paciente visualize e
// pesquise as clinicas cadastradas.
//
// Filtros opcionais:
//   idEspecialidade  somente clinicas que atendem a especialidade
//   busca            texto livre, procura no nome e no bairro
//
// O CNPJ nao e devolvido. E dado cadastral da empresa, sem utilidade
// para o paciente escolher onde se consultar.
// =====================================================================
rotas.get('/', autenticar, async (requisicao, resposta, proximo) => {
    try {
        const idEspecialidade = inteiroOpcional(requisicao.query.idEspecialidade, 'idEspecialidade');
        const busca = typeof requisicao.query.busca === 'string' ? requisicao.query.busca.trim() : '';

        if (busca.length > 120) {
            throw erroDadosInvalidos('O texto de busca e muito longo.');
        }

        const { rows } = await consultar(
            `SELECT c.id_clinica, c.nome, c.telefone, c.email,
                    c.logradouro, c.numero, c.bairro, c.cidade, c.uf, c.cep,
                    c.horario_funcionamento,
                    ARRAY_REMOVE(ARRAY_AGG(DISTINCT e.nome ORDER BY e.nome), NULL) AS especialidades
               FROM clinica c
               LEFT JOIN clinica_especialidade ce ON ce.id_clinica = c.id_clinica
               LEFT JOIN especialidade e ON e.id_especialidade = ce.id_especialidade AND e.ativo = TRUE
              WHERE c.ativo = TRUE
                AND ($1::bigint IS NULL OR EXISTS (
                        SELECT 1 FROM clinica_especialidade f
                         WHERE f.id_clinica = c.id_clinica
                           AND f.id_especialidade = $1
                    ))
                AND ($2::text = '' OR c.nome ILIKE '%' || $2 || '%' OR c.bairro ILIKE '%' || $2 || '%')
              GROUP BY c.id_clinica
              ORDER BY c.nome`,
            [idEspecialidade, busca]
        );

        return resposta.json(rows.map(formatar));
    } catch (erro) {
        return proximo(erro);
    }
});

// =====================================================================
// GET /clinicas/:id
// Detalhe de uma clinica, para a tela que mostra endereco completo e
// especialidades atendidas.
// =====================================================================
rotas.get('/:id', autenticar, async (requisicao, resposta, proximo) => {
    try {
        const id = Number(requisicao.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            throw erroDadosInvalidos('Identificador invalido.');
        }

        const { rows } = await consultar(
            `SELECT c.id_clinica, c.nome, c.telefone, c.email,
                    c.logradouro, c.numero, c.bairro, c.cidade, c.uf, c.cep,
                    c.horario_funcionamento,
                    ARRAY_REMOVE(ARRAY_AGG(DISTINCT e.nome ORDER BY e.nome), NULL) AS especialidades
               FROM clinica c
               LEFT JOIN clinica_especialidade ce ON ce.id_clinica = c.id_clinica
               LEFT JOIN especialidade e ON e.id_especialidade = ce.id_especialidade AND e.ativo = TRUE
              WHERE c.id_clinica = $1 AND c.ativo = TRUE
              GROUP BY c.id_clinica`,
            [id]
        );

        if (rows.length === 0) {
            throw new ErroApi(404, 'CLINICA_NAO_ENCONTRADA', 'Clinica nao encontrada.');
        }

        return resposta.json(formatar(rows[0]));
    } catch (erro) {
        return proximo(erro);
    }
});

export default rotas;

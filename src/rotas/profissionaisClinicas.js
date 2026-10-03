import { Router } from 'express';
import { consultar } from '../banco.js';
import { erroDadosInvalidos } from '../erros.js';
import { autenticar } from '../middlewares/autenticacao.js';

const rotas = Router();

// Converte texto de parametro de consulta em inteiro positivo.
// Devolve null quando o parametro nao foi enviado.
function inteiroOpcional(valor, nomeCampo) {
    if (valor === undefined || valor === null || valor === '') return null;
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero <= 0) {
        throw erroDadosInvalidos(`O parametro ${nomeCampo} precisa ser um numero inteiro.`);
    }
    return numero;
}

// =====================================================================
// GET /profissionais-clinicas?idEspecialidade=&idClinica=
//
// E aqui que o paciente obtem o idProfissionalClinica, que e o que
// identifica a agenda. O mesmo profissional em duas clinicas tem dois
// vinculos diferentes e duas agendas separadas.
//
// Os tres filtros de "ativo" (vinculo, profissional e clinica) sao
// obrigatorios: a secao 2 do documento de regras determina que
// profissional ou clinica inativos nao aparecem na busca.
// =====================================================================
rotas.get('/', autenticar, async (requisicao, resposta, proximo) => {
    try {
        const idEspecialidade = inteiroOpcional(requisicao.query.idEspecialidade, 'idEspecialidade');
        const idClinica = inteiroOpcional(requisicao.query.idClinica, 'idClinica');

        const { rows } = await consultar(
            `SELECT pc.id_profissional_clinica,
                    pr.id_profissional,
                    u.nome        AS nome_profissional,
                    pr.conselho,
                    pr.registro_profissional,
                    pr.uf_registro,
                    c.id_clinica,
                    c.nome        AS nome_clinica,
                    c.logradouro, c.numero, c.bairro, c.cidade, c.uf,
                    ARRAY_AGG(DISTINCT e.nome ORDER BY e.nome) AS especialidades
               FROM profissional_clinica pc
               JOIN profissional pr ON pr.id_profissional = pc.id_profissional
               JOIN usuario u       ON u.id_usuario       = pr.id_usuario
               JOIN clinica c       ON c.id_clinica       = pc.id_clinica
               JOIN profissional_especialidade pe ON pe.id_profissional = pr.id_profissional
               JOIN especialidade e ON e.id_especialidade = pe.id_especialidade AND e.ativo = TRUE
              WHERE pc.ativo = TRUE
                AND pr.ativo = TRUE
                AND c.ativo  = TRUE
                AND u.ativo  = TRUE
                AND ($1::bigint IS NULL OR pe.id_especialidade = $1)
                AND ($2::bigint IS NULL OR c.id_clinica = $2)
              GROUP BY pc.id_profissional_clinica, pr.id_profissional, u.nome,
                       pr.conselho, pr.registro_profissional, pr.uf_registro,
                       c.id_clinica, c.nome, c.logradouro, c.numero, c.bairro, c.cidade, c.uf
              ORDER BY u.nome, c.nome`,
            [idEspecialidade, idClinica]
        );

        return resposta.json(
            rows.map((r) => ({
                idProfissionalClinica: Number(r.id_profissional_clinica),
                idProfissional: Number(r.id_profissional),
                nome: r.nome_profissional,
                registro: `${r.conselho}-${r.uf_registro} ${r.registro_profissional}`,
                especialidades: r.especialidades,
                clinica: {
                    idClinica: Number(r.id_clinica),
                    nome: r.nome_clinica,
                    endereco: `${r.logradouro}, ${r.numero}, ${r.bairro}, ${r.cidade} ${r.uf}`
                }
            }))
        );
    } catch (erro) {
        return proximo(erro);
    }
});

export default rotas;

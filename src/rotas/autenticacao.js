import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { consultar, transacao } from '../banco.js';
import { ErroApi, erroDadosInvalidos, erroConflito } from '../erros.js';
import { autenticar } from '../middlewares/autenticacao.js';
import {
    somenteDigitos,
    textoValido,
    emailValido,
    cpfValido,
    dataNascimentoValida,
    senhaValida
} from '../validacao.js';

const rotas = Router();

// Custo do bcrypt. Quanto maior, mais lento de calcular e mais caro
// de quebrar por forca bruta. 10 e o equilibrio usual: alguns
// milissegundos por login, inviavel para ataque em massa.
const CUSTO_HASH = 10;

function gerarToken(usuario) {
    return jwt.sign(
        {
            tipo: usuario.tipoUsuario,
            idPaciente: usuario.idPaciente ?? null,
            idProfissional: usuario.idProfissional ?? null
        },
        process.env.JWT_SEGREDO,
        {
            subject: String(usuario.idUsuario),
            expiresIn: process.env.JWT_EXPIRACAO || '2h'
        }
    );
}

// =====================================================================
// POST /autenticacao/cadastro
// Cria um usuario do tipo PACIENTE e o registro de paciente vinculado.
// =====================================================================
rotas.post('/cadastro', async (requisicao, resposta, proximo) => {
    try {
        const { nome, email, cpf, dataNascimento, telefone, senha } = requisicao.body ?? {};

        if (!textoValido(nome, 3, 160)) {
            throw erroDadosInvalidos('Informe o nome completo, com pelo menos 3 letras.');
        }
        if (!emailValido(email)) {
            throw erroDadosInvalidos('Informe um e-mail valido, no formato nome@provedor.com.');
        }
        if (!cpfValido(cpf)) {
            throw erroDadosInvalidos('O CPF informado nao e valido. Confira os numeros.');
        }
        if (!dataNascimentoValida(dataNascimento)) {
            throw erroDadosInvalidos('Informe a data de nascimento no formato AAAA-MM-DD.');
        }
        if (!senhaValida(senha)) {
            throw erroDadosInvalidos('A senha precisa ter pelo menos 8 caracteres.');
        }
        if (telefone && !textoValido(telefone, 8, 20)) {
            throw erroDadosInvalidos('O telefone informado nao e valido.');
        }

        const emailNormalizado = email.trim().toLowerCase();
        const cpfNormalizado = somenteDigitos(cpf);
        const senhaHash = await bcrypt.hash(senha, CUSTO_HASH);

        const criado = await transacao(async (cliente) => {
            const usuarioInserido = await cliente.query(
                `INSERT INTO usuario (nome, email, senha_hash, telefone, tipo_usuario)
                 VALUES ($1, $2, $3, $4, 'PACIENTE')
                 RETURNING id_usuario, nome, email, telefone, tipo_usuario`,
                [nome.trim(), emailNormalizado, senhaHash, telefone ? somenteDigitos(telefone) : null]
            );

            const usuario = usuarioInserido.rows[0];

            const pacienteInserido = await cliente.query(
                `INSERT INTO paciente (id_usuario, cpf, data_nascimento)
                 VALUES ($1, $2, $3)
                 RETURNING id_paciente`,
                [usuario.id_usuario, cpfNormalizado, dataNascimento]
            );

            return { usuario, idPaciente: pacienteInserido.rows[0].id_paciente };
        });

        const dados = {
            idUsuario: Number(criado.usuario.id_usuario),
            nome: criado.usuario.nome,
            email: criado.usuario.email,
            telefone: criado.usuario.telefone,
            tipoUsuario: criado.usuario.tipo_usuario,
            idPaciente: Number(criado.idPaciente)
        };

        return resposta.status(201).json({ usuario: dados, token: gerarToken(dados) });
    } catch (erro) {
        // 23505 e o codigo de violacao de unicidade do PostgreSQL.
        // O codigo sozinho nao diz QUAL regra foi violada, entao
        // olhamos o nome da constraint, que o driver entrega em
        // err.constraint. Mesma abordagem da secao 7.2 do documento
        // de regras de negocio.
        if (erro.code === '23505') {
            if (erro.constraint === 'uq_usuario_email') {
                return proximo(erroConflito('EMAIL_JA_CADASTRADO', 'Este e-mail ja esta cadastrado. Tente fazer login.'));
            }
            if (erro.constraint === 'uq_paciente_cpf') {
                return proximo(erroConflito('CPF_JA_CADASTRADO', 'Este CPF ja esta cadastrado. Tente fazer login.'));
            }
        }
        return proximo(erro);
    }
});

// =====================================================================
// POST /autenticacao/login
// Aceita e-mail ou CPF no campo "identificador".
// =====================================================================
rotas.post('/login', async (requisicao, resposta, proximo) => {
    try {
        const { identificador, senha } = requisicao.body ?? {};

        if (!textoValido(identificador, 3, 160) || typeof senha !== 'string' || senha.length === 0) {
            throw erroDadosInvalidos('Informe o e-mail ou CPF e a senha.');
        }

        const entrada = identificador.trim();
        const digitos = somenteDigitos(entrada);
        const pareceCpf = digitos.length === 11;

        // LEFT JOIN porque profissional e administrador tambem fazem
        // login e nao possuem registro na tabela paciente.
        const { rows } = await consultar(
            `SELECT u.id_usuario, u.nome, u.email, u.senha_hash, u.tipo_usuario, u.ativo,
                    p.id_paciente, pr.id_profissional
               FROM usuario u
               LEFT JOIN paciente p     ON p.id_usuario  = u.id_usuario
               LEFT JOIN profissional pr ON pr.id_usuario = u.id_usuario
              WHERE ($1::boolean IS TRUE AND p.cpf = $2)
                 OR ($1::boolean IS FALSE AND u.email = $3)
              LIMIT 1`,
            [pareceCpf, digitos, entrada.toLowerCase()]
        );

        const encontrado = rows[0];

        // Mesma mensagem para usuario inexistente e senha errada.
        // Diferenciar entregaria a quem ataca a informacao de quais
        // e-mails estao cadastrados na plataforma.
        const credenciaisInvalidas = new ErroApi(
            401,
            'CREDENCIAIS_INVALIDAS',
            'E-mail, CPF ou senha incorretos.'
        );

        if (!encontrado) {
            // Compara contra um hash descartavel mesmo sem usuario, para
            // que a resposta demore o mesmo tempo nos dois casos. Sem
            // isso, o tempo de resposta revela quais contas existem.
            await bcrypt.compare(senha, '$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ');
            throw credenciaisInvalidas;
        }

        const senhaConfere = await bcrypt.compare(senha, encontrado.senha_hash);
        if (!senhaConfere) {
            throw credenciaisInvalidas;
        }

        if (!encontrado.ativo) {
            throw new ErroApi(403, 'USUARIO_INATIVO', 'Esta conta esta desativada. Procure a administracao.');
        }

        const dados = {
            idUsuario: Number(encontrado.id_usuario),
            nome: encontrado.nome,
            email: encontrado.email,
            tipoUsuario: encontrado.tipo_usuario,
            idPaciente: encontrado.id_paciente ? Number(encontrado.id_paciente) : null,
            idProfissional: encontrado.id_profissional ? Number(encontrado.id_profissional) : null
        };

        return resposta.json({ usuario: dados, token: gerarToken(dados) });
    } catch (erro) {
        return proximo(erro);
    }
});

// =====================================================================
// GET /autenticacao/eu
// Devolve o usuario do token. Serve para o front saber quem esta
// logado ao recarregar a pagina, sem pedir senha de novo.
// =====================================================================
rotas.get('/eu', autenticar, async (requisicao, resposta, proximo) => {
    try {
        const { rows } = await consultar(
            `SELECT u.id_usuario, u.nome, u.email, u.telefone, u.tipo_usuario,
                    p.id_paciente, p.cpf,
                    TO_CHAR(p.data_nascimento, 'YYYY-MM-DD') AS data_nascimento
               FROM usuario u
               LEFT JOIN paciente p ON p.id_usuario = u.id_usuario
              WHERE u.id_usuario = $1 AND u.ativo = TRUE`,
            [requisicao.usuario.idUsuario]
        );

        if (rows.length === 0) {
            throw new ErroApi(404, 'USUARIO_NAO_ENCONTRADO', 'Usuario nao encontrado.');
        }

        const u = rows[0];
        return resposta.json({
            idUsuario: Number(u.id_usuario),
            nome: u.nome,
            email: u.email,
            telefone: u.telefone,
            tipoUsuario: u.tipo_usuario,
            idPaciente: u.id_paciente ? Number(u.id_paciente) : null,
            cpf: u.cpf,
            dataNascimento: u.data_nascimento
        });
    } catch (erro) {
        return proximo(erro);
    }
});

export default rotas;

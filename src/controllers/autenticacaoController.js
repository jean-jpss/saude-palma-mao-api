// =====================================================================
// CONTROLLER: autenticacao
//
// O controller e a ponte entre o HTTP e o dominio. Ele le a
// requisicao, valida a entrada, chama o model, decide o codigo de
// status e monta a resposta. Nao escreve SQL.
// =====================================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import * as usuarioModel from '../models/usuarioModel.js';
import * as pacienteModel from '../models/pacienteModel.js';
import { ErroApi, erroDadosInvalidos, erroConflito } from '../erros.js';
import {
    somenteDigitos, textoValido, emailValido, cpfValido, dataNascimentoValida, senhaValida
} from '../validacao.js';

// Custo do bcrypt. Quanto maior, mais lento de calcular e mais caro de
// quebrar por forca bruta. 10 e o equilibrio usual.
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

export async function cadastrar(requisicao, resposta, proximo) {
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

        const criado = await pacienteModel.criarComUsuario({
            nome: nome.trim(),
            email: email.trim().toLowerCase(),
            senhaHash: await bcrypt.hash(senha, CUSTO_HASH),
            telefone: telefone ? somenteDigitos(telefone) : null,
            cpf: somenteDigitos(cpf),
            dataNascimento
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
        // 23505 e violacao de unicidade. O codigo sozinho nao diz qual
        // regra foi violada, entao olhamos o nome da constraint.
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
}

export async function entrar(requisicao, resposta, proximo) {
    try {
        const { identificador, senha } = requisicao.body ?? {};

        if (!textoValido(identificador, 3, 160) || typeof senha !== 'string' || senha.length === 0) {
            throw erroDadosInvalidos('Informe o e-mail ou CPF e a senha.');
        }

        const entrada = identificador.trim();
        const digitos = somenteDigitos(entrada);
        const pareceCpf = digitos.length === 11;

        const encontrado = await usuarioModel.buscarParaLogin(pareceCpf, digitos, entrada.toLowerCase());

        // Mesma mensagem para usuario inexistente e senha errada.
        // Diferenciar entregaria a quem ataca a informacao de quais
        // e-mails estao cadastrados na plataforma.
        const credenciaisInvalidas = new ErroApi(401, 'CREDENCIAIS_INVALIDAS', 'E-mail, CPF ou senha incorretos.');

        if (!encontrado) {
            // Compara contra um hash descartavel mesmo sem usuario, para
            // que a resposta demore o mesmo tempo nos dois casos. Sem
            // isso, o tempo de resposta revela quais contas existem.
            await bcrypt.compare(senha, '$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ');
            throw credenciaisInvalidas;
        }

        if (!await bcrypt.compare(senha, encontrado.senha_hash)) {
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
}

export async function meuPerfil(requisicao, resposta, proximo) {
    try {
        const u = await usuarioModel.buscarPerfilCompleto(requisicao.usuario.idUsuario);
        if (!u) {
            throw new ErroApi(404, 'USUARIO_NAO_ENCONTRADO', 'Usuario nao encontrado.');
        }

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
}
